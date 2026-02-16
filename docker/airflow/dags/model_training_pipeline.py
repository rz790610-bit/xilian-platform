"""
模型训练管道 DAG

功能：
  1. 从 ClickHouse 提取训练数据集
  2. 数据预处理与特征工程
  3. 模型训练（调用平台算法引擎）
  4. 模型评估与验证
  5. 模型注册（通过平台 API）
  6. A/B 测试配置

调度：每天凌晨 2:00 执行
依赖：xilian-platform API + ClickHouse
"""

from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator, BranchPythonOperator
from airflow.operators.empty import EmptyOperator
from airflow.utils.trigger_rule import TriggerRule
import json
import os
import logging

logger = logging.getLogger(__name__)

XILIAN_API_URL = os.environ.get('XILIAN_API_URL', 'http://app:3003')
MIN_TRAINING_SAMPLES = 1000
ACCURACY_THRESHOLD = 0.85

default_args = {
    'owner': 'xilian-platform',
    'depends_on_past': False,
    'email_on_failure': True,
    'retries': 2,
    'retry_delay': timedelta(minutes=5),
    'execution_timeout': timedelta(hours=2),
}


def extract_training_data(**context):
    """从 ClickHouse 提取训练数据"""
    import requests

    execution_date = context['ds']
    
    # 提取过去 30 天的特征数据
    end_date = execution_date
    start_date = (datetime.strptime(execution_date, '%Y-%m-%d') - timedelta(days=30)).strftime('%Y-%m-%d')

    try:
        url = f"{XILIAN_API_URL}/api/trpc/timeseries.queryRange"
        payload = {
            'json': {
                'startDate': start_date,
                'endDate': end_date,
                'source': 'airflow_feature_extraction',
                'limit': 100000,
            }
        }
        resp = requests.post(url, json=payload, timeout=120)
        resp.raise_for_status()
        data = resp.json()
        records = data.get('result', {}).get('data', {}).get('json', {}).get('records', [])

        logger.info(f"Extracted {len(records)} training samples from {start_date} to {end_date}")
        context['ti'].xcom_push(key='sample_count', value=len(records))
        context['ti'].xcom_push(key='date_range', value={'start': start_date, 'end': end_date})

        return len(records)
    except Exception as e:
        logger.error(f"Failed to extract training data: {e}")
        raise


def check_data_quality(**context):
    """数据质量检查 — 决定是否继续训练"""
    sample_count = context['ti'].xcom_pull(key='sample_count', task_ids='extract_data')

    if not sample_count or sample_count < MIN_TRAINING_SAMPLES:
        logger.warning(
            f"Insufficient training data: {sample_count} < {MIN_TRAINING_SAMPLES}. "
            f"Skipping training."
        )
        return 'skip_training'

    logger.info(f"Data quality check passed: {sample_count} samples")
    return 'preprocess_data'


def preprocess_data(**context):
    """数据预处理与特征工程"""
    import requests

    date_range = context['ti'].xcom_pull(key='date_range', task_ids='extract_data')

    try:
        url = f"{XILIAN_API_URL}/api/trpc/algorithm.execute"
        payload = {
            'json': {
                'algorithmId': 'builtin_feature_engineering',
                'config': {
                    'dateRange': date_range,
                    'operations': [
                        'normalize',
                        'remove_outliers',
                        'fill_missing',
                        'compute_rolling_stats',
                        'pca_reduction',
                    ],
                    'targetDimensions': 32,
                    'outlierMethod': 'iqr',
                    'outlierThreshold': 3.0,
                },
            }
        }
        resp = requests.post(url, json=payload, timeout=300)
        resp.raise_for_status()
        result = resp.json()

        preprocessed = result.get('result', {}).get('data', {}).get('json', {})
        context['ti'].xcom_push(key='preprocessed_stats', value={
            'original_features': preprocessed.get('originalFeatures', 0),
            'reduced_features': preprocessed.get('reducedFeatures', 0),
            'removed_outliers': preprocessed.get('removedOutliers', 0),
            'fill_rate': preprocessed.get('fillRate', 0),
        })

        logger.info(f"Preprocessing completed: {json.dumps(preprocessed, indent=2)}")
        return preprocessed
    except Exception as e:
        logger.error(f"Preprocessing failed: {e}")
        raise


def train_model(**context):
    """模型训练"""
    import requests

    try:
        url = f"{XILIAN_API_URL}/api/trpc/algorithm.trainModel"
        payload = {
            'json': {
                'modelType': 'anomaly_detection',
                'algorithm': 'isolation_forest',
                'hyperparameters': {
                    'n_estimators': 200,
                    'max_samples': 'auto',
                    'contamination': 0.05,
                    'max_features': 1.0,
                    'random_state': 42,
                },
                'validationSplit': 0.2,
                'crossValidation': {
                    'enabled': True,
                    'folds': 5,
                    'stratified': True,
                },
                'earlyStoppingPatience': 10,
            }
        }
        resp = requests.post(url, json=payload, timeout=3600)
        resp.raise_for_status()
        result = resp.json()

        training_result = result.get('result', {}).get('data', {}).get('json', {})
        model_id = training_result.get('modelId', '')
        metrics = training_result.get('metrics', {})

        context['ti'].xcom_push(key='model_id', value=model_id)
        context['ti'].xcom_push(key='training_metrics', value=metrics)

        logger.info(f"Training completed: model={model_id}, metrics={json.dumps(metrics)}")
        return model_id
    except Exception as e:
        logger.error(f"Training failed: {e}")
        raise


def evaluate_model(**context):
    """模型评估 — 决定是否注册"""
    metrics = context['ti'].xcom_pull(key='training_metrics', task_ids='train_model')
    model_id = context['ti'].xcom_pull(key='model_id', task_ids='train_model')

    if not metrics:
        logger.error("No training metrics available")
        return 'reject_model'

    accuracy = metrics.get('accuracy', 0)
    f1_score = metrics.get('f1_score', 0)
    precision = metrics.get('precision', 0)
    recall = metrics.get('recall', 0)

    logger.info(
        f"Model evaluation: accuracy={accuracy:.4f}, f1={f1_score:.4f}, "
        f"precision={precision:.4f}, recall={recall:.4f}"
    )

    # 综合评分
    composite_score = (accuracy * 0.3 + f1_score * 0.3 + precision * 0.2 + recall * 0.2)
    context['ti'].xcom_push(key='composite_score', value=composite_score)

    if composite_score >= ACCURACY_THRESHOLD:
        logger.info(f"Model {model_id} PASSED evaluation (score={composite_score:.4f})")
        return 'register_model'
    else:
        logger.warning(
            f"Model {model_id} FAILED evaluation "
            f"(score={composite_score:.4f} < {ACCURACY_THRESHOLD})"
        )
        return 'reject_model'


def register_model(**context):
    """注册模型到平台模型仓库"""
    import requests

    model_id = context['ti'].xcom_pull(key='model_id', task_ids='train_model')
    metrics = context['ti'].xcom_pull(key='training_metrics', task_ids='train_model')
    score = context['ti'].xcom_pull(key='composite_score', task_ids='evaluate_model')

    try:
        url = f"{XILIAN_API_URL}/api/trpc/model.register"
        payload = {
            'json': {
                'modelId': model_id,
                'name': f'anomaly_detection_{context["ds"]}',
                'version': context['ds'].replace('-', '.'),
                'metrics': metrics,
                'compositeScore': score,
                'status': 'staging',
                'metadata': {
                    'trainedBy': 'airflow_pipeline',
                    'trainingDate': context['ds'],
                    'algorithm': 'isolation_forest',
                },
            }
        }
        resp = requests.post(url, json=payload, timeout=30)
        resp.raise_for_status()

        logger.info(f"Model {model_id} registered to staging")
    except Exception as e:
        logger.error(f"Model registration failed: {e}")
        raise


def reject_model(**context):
    """记录模型拒绝原因"""
    model_id = context['ti'].xcom_pull(key='model_id', task_ids='train_model') or 'unknown'
    score = context['ti'].xcom_pull(key='composite_score', task_ids='evaluate_model') or 0

    logger.warning(
        f"Model {model_id} rejected: composite_score={score:.4f} "
        f"(threshold={ACCURACY_THRESHOLD})"
    )


def generate_training_report(**context):
    """生成训练报告"""
    sample_count = context['ti'].xcom_pull(key='sample_count', task_ids='extract_data') or 0
    model_id = context['ti'].xcom_pull(key='model_id', task_ids='train_model') or 'N/A'
    metrics = context['ti'].xcom_pull(key='training_metrics', task_ids='train_model') or {}
    score = context['ti'].xcom_pull(key='composite_score', task_ids='evaluate_model') or 0
    preprocessed = context['ti'].xcom_pull(key='preprocessed_stats', task_ids='preprocess_data') or {}

    report = {
        'execution_date': context['ds'],
        'training_samples': sample_count,
        'model_id': model_id,
        'preprocessing': preprocessed,
        'metrics': metrics,
        'composite_score': score,
        'threshold': ACCURACY_THRESHOLD,
        'decision': 'registered' if score >= ACCURACY_THRESHOLD else 'rejected',
    }

    logger.info(f"Training report:\n{json.dumps(report, indent=2)}")
    return report


# ============================================================
# DAG 定义
# ============================================================

with DAG(
    dag_id='xilian_model_training_pipeline',
    default_args=default_args,
    description='模型训练、评估、注册管道',
    schedule_interval='0 2 * * *',  # 每天凌晨 2:00
    start_date=datetime(2024, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=['xilian', 'model', 'training', 'ml-pipeline'],
    doc_md=__doc__,
) as dag:

    extract = PythonOperator(
        task_id='extract_data',
        python_callable=extract_training_data,
    )

    quality_check = BranchPythonOperator(
        task_id='data_quality_check',
        python_callable=check_data_quality,
    )

    skip = EmptyOperator(task_id='skip_training')

    preprocess = PythonOperator(
        task_id='preprocess_data',
        python_callable=preprocess_data,
    )

    train = PythonOperator(
        task_id='train_model',
        python_callable=train_model,
        execution_timeout=timedelta(hours=1),
    )

    evaluate = BranchPythonOperator(
        task_id='evaluate_model',
        python_callable=evaluate_model,
    )

    register = PythonOperator(
        task_id='register_model',
        python_callable=register_model,
    )

    reject = PythonOperator(
        task_id='reject_model',
        python_callable=reject_model,
    )

    report = PythonOperator(
        task_id='training_report',
        python_callable=generate_training_report,
        trigger_rule=TriggerRule.ALL_DONE,
    )

    # DAG 依赖
    extract >> quality_check >> [preprocess, skip]
    preprocess >> train >> evaluate >> [register, reject]
    [register, reject, skip] >> report
