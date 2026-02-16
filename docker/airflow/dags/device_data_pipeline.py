"""
设备数据采集与特征提取 DAG

功能：
  1. 从 MySQL 读取活跃设备列表
  2. 并行采集各设备传感器数据（通过平台 API）
  3. 调用算法引擎进行特征提取
  4. 将结果写入 ClickHouse 时序库
  5. 异常检测 + 告警

调度：每 15 分钟执行一次
依赖：xilian-platform API（XILIAN_API_URL 环境变量）
"""

from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator, BranchPythonOperator
from airflow.operators.empty import EmptyOperator
from airflow.providers.http.operators.http import SimpleHttpOperator
from airflow.providers.http.sensors.http import HttpSensor
from airflow.utils.trigger_rule import TriggerRule
import json
import os
import logging

logger = logging.getLogger(__name__)

# ============================================================
# 配置
# ============================================================

XILIAN_API_URL = os.environ.get('XILIAN_API_URL', 'http://app:3003')
BATCH_SIZE = 50  # 每批处理设备数

default_args = {
    'owner': 'xilian-platform',
    'depends_on_past': False,
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 3,
    'retry_delay': timedelta(minutes=2),
    'retry_exponential_backoff': True,
    'max_retry_delay': timedelta(minutes=15),
    'execution_timeout': timedelta(minutes=30),
}

# ============================================================
# 任务函数
# ============================================================

def fetch_active_devices(**context):
    """从平台 API 获取活跃设备列表"""
    import requests

    url = f"{XILIAN_API_URL}/api/trpc/device.list"
    params = {
        'input': json.dumps({
            'json': {
                'page': 1,
                'pageSize': 1000,
                'statusFilter': 'active',
            }
        })
    }

    try:
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        devices = data.get('result', {}).get('data', {}).get('json', {}).get('devices', [])
        
        device_ids = [d['id'] for d in devices if d.get('status') == 'active']
        logger.info(f"Found {len(device_ids)} active devices")
        
        # 分批
        batches = [device_ids[i:i + BATCH_SIZE] for i in range(0, len(device_ids), BATCH_SIZE)]
        context['ti'].xcom_push(key='device_batches', value=batches)
        context['ti'].xcom_push(key='total_devices', value=len(device_ids))
        
        return len(device_ids)
    except Exception as e:
        logger.error(f"Failed to fetch devices: {e}")
        raise


def collect_sensor_data(**context):
    """采集传感器数据"""
    import requests

    batches = context['ti'].xcom_pull(key='device_batches', task_ids='fetch_devices')
    if not batches:
        logger.warning("No device batches to process")
        return 0

    collected = 0
    errors = []

    for batch_idx, batch in enumerate(batches):
        for device_id in batch:
            try:
                url = f"{XILIAN_API_URL}/api/trpc/sensorData.getLatest"
                params = {
                    'input': json.dumps({
                        'json': {'deviceId': device_id, 'limit': 100}
                    })
                }
                resp = requests.get(url, params=params, timeout=15)
                resp.raise_for_status()
                collected += 1
            except Exception as e:
                errors.append({'deviceId': device_id, 'error': str(e)})
                logger.warning(f"Failed to collect data for device {device_id}: {e}")

        logger.info(f"Batch {batch_idx + 1}/{len(batches)} completed")

    context['ti'].xcom_push(key='collected_count', value=collected)
    context['ti'].xcom_push(key='collection_errors', value=errors)
    
    logger.info(f"Data collection completed: {collected} devices, {len(errors)} errors")
    return collected


def run_feature_extraction(**context):
    """调用算法引擎进行特征提取"""
    import requests

    collected = context['ti'].xcom_pull(key='collected_count', task_ids='collect_data')
    if not collected or collected == 0:
        logger.warning("No data collected, skipping feature extraction")
        return

    batches = context['ti'].xcom_pull(key='device_batches', task_ids='fetch_devices')
    all_device_ids = [did for batch in (batches or []) for did in batch]

    results = []
    for device_id in all_device_ids[:collected]:
        try:
            url = f"{XILIAN_API_URL}/api/trpc/algorithm.executeForDevice"
            payload = {
                'json': {
                    'deviceId': device_id,
                    'algorithmCategory': 'feature_extraction',
                    'config': {
                        'windowSize': 1024,
                        'overlap': 0.5,
                        'features': ['rms', 'peak', 'kurtosis', 'crest_factor'],
                    },
                }
            }
            resp = requests.post(url, json=payload, timeout=60)
            resp.raise_for_status()
            result = resp.json()
            results.append({
                'deviceId': device_id,
                'features': result.get('result', {}).get('data', {}),
                'status': 'success',
            })
        except Exception as e:
            results.append({
                'deviceId': device_id,
                'status': 'error',
                'error': str(e),
            })
            logger.warning(f"Feature extraction failed for {device_id}: {e}")

    success_count = sum(1 for r in results if r['status'] == 'success')
    context['ti'].xcom_push(key='extraction_results', value=results)
    logger.info(f"Feature extraction: {success_count}/{len(results)} succeeded")
    return success_count


def check_anomalies(**context):
    """异常检测分支判断"""
    results = context['ti'].xcom_pull(key='extraction_results', task_ids='feature_extraction')
    if not results:
        return 'no_anomalies'

    anomalies = []
    for r in results:
        if r.get('status') != 'success':
            continue
        features = r.get('features', {})
        # 简单阈值判断（实际应使用算法引擎的异常检测）
        if isinstance(features, dict):
            kurtosis = features.get('kurtosis', 0)
            crest_factor = features.get('crest_factor', 0)
            if (isinstance(kurtosis, (int, float)) and kurtosis > 6) or \
               (isinstance(crest_factor, (int, float)) and crest_factor > 5):
                anomalies.append(r['deviceId'])

    context['ti'].xcom_push(key='anomaly_devices', value=anomalies)
    logger.info(f"Anomaly detection: {len(anomalies)} devices flagged")

    return 'send_alerts' if anomalies else 'no_anomalies'


def send_anomaly_alerts(**context):
    """发送异常告警"""
    import requests

    anomaly_devices = context['ti'].xcom_pull(key='anomaly_devices', task_ids='check_anomalies')
    if not anomaly_devices:
        return

    for device_id in anomaly_devices:
        try:
            url = f"{XILIAN_API_URL}/api/trpc/alert.create"
            payload = {
                'json': {
                    'deviceId': device_id,
                    'type': 'anomaly_detected',
                    'severity': 'warning',
                    'message': f'Anomaly detected in device {device_id} during scheduled feature extraction',
                    'source': 'airflow_pipeline',
                }
            }
            requests.post(url, json=payload, timeout=10)
        except Exception as e:
            logger.error(f"Failed to send alert for {device_id}: {e}")

    logger.info(f"Sent {len(anomaly_devices)} anomaly alerts")


def write_to_clickhouse(**context):
    """将特征数据写入 ClickHouse 时序库"""
    import requests

    results = context['ti'].xcom_pull(key='extraction_results', task_ids='feature_extraction')
    if not results:
        return

    success_results = [r for r in results if r['status'] == 'success']
    if not success_results:
        logger.warning("No successful results to write")
        return

    try:
        url = f"{XILIAN_API_URL}/api/trpc/timeseries.batchInsert"
        payload = {
            'json': {
                'records': [
                    {
                        'deviceId': r['deviceId'],
                        'timestamp': datetime.utcnow().isoformat(),
                        'features': r.get('features', {}),
                        'source': 'airflow_feature_extraction',
                    }
                    for r in success_results
                ]
            }
        }
        resp = requests.post(url, json=payload, timeout=30)
        resp.raise_for_status()
        logger.info(f"Wrote {len(success_results)} records to ClickHouse")
    except Exception as e:
        logger.error(f"Failed to write to ClickHouse: {e}")
        raise


def generate_report(**context):
    """生成管道执行报告"""
    total = context['ti'].xcom_pull(key='total_devices', task_ids='fetch_devices') or 0
    collected = context['ti'].xcom_pull(key='collected_count', task_ids='collect_data') or 0
    errors = context['ti'].xcom_pull(key='collection_errors', task_ids='collect_data') or []
    anomalies = context['ti'].xcom_pull(key='anomaly_devices', task_ids='check_anomalies') or []

    report = {
        'execution_date': context['ds'],
        'total_devices': total,
        'data_collected': collected,
        'collection_errors': len(errors),
        'anomalies_detected': len(anomalies),
        'anomaly_devices': anomalies,
        'status': 'completed',
    }

    logger.info(f"Pipeline report: {json.dumps(report, indent=2)}")
    return report


# ============================================================
# DAG 定义
# ============================================================

with DAG(
    dag_id='xilian_device_data_pipeline',
    default_args=default_args,
    description='设备数据采集、特征提取、异常检测管道',
    schedule_interval='*/15 * * * *',
    start_date=datetime(2024, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=['xilian', 'device', 'data-pipeline', 'feature-extraction'],
    doc_md=__doc__,
) as dag:

    # 健康检查
    check_api = HttpSensor(
        task_id='check_api_health',
        http_conn_id='xilian_api',
        endpoint='/api/health',
        method='GET',
        response_check=lambda response: response.status_code == 200,
        poke_interval=10,
        timeout=60,
        mode='reschedule',
    )

    # 获取设备列表
    fetch_devices = PythonOperator(
        task_id='fetch_devices',
        python_callable=fetch_active_devices,
    )

    # 采集传感器数据
    collect_data = PythonOperator(
        task_id='collect_data',
        python_callable=collect_sensor_data,
    )

    # 特征提取
    feature_extraction = PythonOperator(
        task_id='feature_extraction',
        python_callable=run_feature_extraction,
        execution_timeout=timedelta(minutes=20),
    )

    # 异常检测分支
    anomaly_check = BranchPythonOperator(
        task_id='check_anomalies',
        python_callable=check_anomalies,
    )

    # 发送告警
    alerts = PythonOperator(
        task_id='send_alerts',
        python_callable=send_anomaly_alerts,
    )

    # 无异常
    no_anomalies = EmptyOperator(task_id='no_anomalies')

    # 写入 ClickHouse
    write_ch = PythonOperator(
        task_id='write_to_clickhouse',
        python_callable=write_to_clickhouse,
        trigger_rule=TriggerRule.NONE_FAILED_MIN_ONE_SUCCESS,
    )

    # 生成报告
    report = PythonOperator(
        task_id='generate_report',
        python_callable=generate_report,
        trigger_rule=TriggerRule.ALL_DONE,
    )

    # DAG 依赖
    check_api >> fetch_devices >> collect_data >> feature_extraction
    feature_extraction >> anomaly_check >> [alerts, no_anomalies]
    [alerts, no_anomalies] >> write_ch >> report
