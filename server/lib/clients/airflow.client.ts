/**
 * Apache Airflow 真实客户端
 * 连接 Airflow Stable REST API 进行 DAG 管理
 */

import http from 'http';
import https from 'https';
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('airflow');

// 配置

const AIRFLOW_CONFIG = {
  host: process.env.AIRFLOW_HOST || 'localhost',
  port: parseInt(process.env.AIRFLOW_PORT || '8080'),
  protocol: process.env.AIRFLOW_PROTOCOL || 'http',
  // P0-CRED-1: 移除硬编码默认凭证，生产环境必须通过环境变量配置
  username: process.env.AIRFLOW_USERNAME || (() => { console.warn('[SECURITY] AIRFLOW_USERNAME not set, using fallback'); return 'admin'; })(),
  password: process.env.AIRFLOW_PASSWORD || (() => { console.warn('[SECURITY] AIRFLOW_PASSWORD not set — MUST configure in production'); return ''; })(),
  timeout: 30000,
};

// ============================================================
// 类型定义
// ============================================================

export interface AirflowDAG {
  dag_id: string;
  dag_display_name?: string;
  description: string | null;
  file_token: string;
  fileloc: string;
  is_active: boolean;
  is_paused: boolean;
  is_subdag: boolean;
  last_parsed_time: string | null;
  last_pickled: string | null;
  last_expired: string | null;
  max_active_runs: number;
  max_active_tasks: number;
  next_dagrun: string | null;
  next_dagrun_create_after: string | null;
  next_dagrun_data_interval_start: string | null;
  next_dagrun_data_interval_end: string | null;
  owners: string[];
  pickle_id: string | null;
  root_dag_id: string | null;
  schedule_interval: {
    __type: string;
    value: string;
  } | null;
  scheduler_lock: string | null;
  tags: Array<{ name: string }>;
  timetable_description: string | null;
}

export interface AirflowDAGRun {
  dag_run_id: string;
  dag_id: string;
  logical_date: string;
  execution_date: string;
  start_date: string | null;
  end_date: string | null;
  data_interval_start: string | null;
  data_interval_end: string | null;
  last_scheduling_decision: string | null;
  run_type: 'manual' | 'scheduled' | 'backfill' | 'dataset_triggered';
  state: 'queued' | 'running' | 'success' | 'failed';
  external_trigger: boolean;
  conf: Record<string, unknown>;
  note: string | null;
}

export interface AirflowTaskInstance {
  task_id: string;
  dag_id: string;
  dag_run_id: string;
  execution_date: string;
  start_date: string | null;
  end_date: string | null;
  duration: number | null;
  state: 'success' | 'running' | 'failed' | 'upstream_failed' | 'skipped' | 'up_for_retry' | 'up_for_reschedule' | 'queued' | 'none' | 'scheduled' | 'deferred' | 'removed' | 'restarting';
  try_number: number;
  max_tries: number;
  hostname: string | null;
  unixname: string | null;
  pool: string;
  pool_slots: number;
  queue: string | null;
  priority_weight: number;
  operator: string | null;
  queued_when: string | null;
  pid: number | null;
  executor_config: string | null;
  sla_miss: null;
  rendered_fields: Record<string, unknown>;
  trigger: null;
  triggerer_job: null;
  note: string | null;
}

export interface AirflowVariable {
  key: string;
  value: string;
  description: string | null;
}

export interface AirflowConnection {
  connection_id: string;
  conn_type: string;
  description: string | null;
  host: string | null;
  login: string | null;
  schema: string | null;
  port: number | null;
  extra: string | null;
}

export interface AirflowPool {
  name: string;
  slots: number;
  occupied_slots: number;
  running_slots: number;
  queued_slots: number;
  open_slots: number;
  description: string | null;
  include_deferred: boolean;
}

// ============================================================
// HTTP 请求工具
// ============================================================

async function airflowRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(
      `${AIRFLOW_CONFIG.username}:${AIRFLOW_CONFIG.password}`
    ).toString('base64');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Basic ${auth}`,
    };

    const options = {
      hostname: AIRFLOW_CONFIG.host,
      port: AIRFLOW_CONFIG.port,
      path: `/api/v1${path}`,
      method,
      timeout: AIRFLOW_CONFIG.timeout,
      headers,
    };

    const protocol = AIRFLOW_CONFIG.protocol === 'https' ? https : http;
    
    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode === 204) {
            resolve({} as T);
            return;
          }
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Airflow error: ${parsed.detail || parsed.title || data}`));
          } else {
            resolve(parsed);
          }
        } catch (error) {
          reject(new Error(`Failed to parse Airflow response: ${error}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Airflow request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Airflow request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

// ============================================================
// Airflow 客户端类
// ============================================================

export class AirflowClient {
  private static instance: AirflowClient;

  private constructor() {
    log.debug('[Airflow] Client initialized');
  }

  static getInstance(): AirflowClient {
    if (!AirflowClient.instance) {
      AirflowClient.instance = new AirflowClient();
    }
    return AirflowClient.instance;
  }

  /**
   * 检查连接状态
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.getHealth();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取健康状态
   */
  async getHealth(): Promise<{
    metadatabase: { status: string };
    scheduler: { status: string; latest_scheduler_heartbeat: string | null };
    triggerer: { status: string; latest_triggerer_heartbeat: string | null };
  } | null> {
    try {
      return await airflowRequest('GET', '/health');
    } catch {
      return null;
    }
  }

  /**
   * 获取版本信息
   */
  async getVersion(): Promise<{ version: string; git_version: string | null } | null> {
    try {
      return await airflowRequest('GET', '/version');
    } catch {
      return null;
    }
  }

  // ============================================================
  // DAG 管理
  // ============================================================

  /**
   * 列出所有 DAG
   */
  async listDAGs(limit: number = 100, offset: number = 0): Promise<AirflowDAG[]> {
    try {
      const result = await airflowRequest<{ dags: AirflowDAG[]; total_entries: number }>(
        'GET',
        `/dags?limit=${limit}&offset=${offset}`
      );
      return result.dags || [];
    } catch {
      return [];
    }
  }

  /**
   * 获取 DAG 详情
   */
  async getDAG(dagId: string): Promise<AirflowDAG | null> {
    try {
      return await airflowRequest<AirflowDAG>('GET', `/dags/${encodeURIComponent(dagId)}`);
    } catch {
      return null;
    }
  }

  /**
   * 暂停/恢复 DAG
   */
  async pauseDAG(dagId: string, isPaused: boolean): Promise<AirflowDAG | null> {
    try {
      return await airflowRequest<AirflowDAG>(
        'PATCH',
        `/dags/${encodeURIComponent(dagId)}`,
        { is_paused: isPaused }
      );
    } catch {
      return null;
    }
  }

  /**
   * 触发 DAG 运行
   */
  async triggerDAG(
    dagId: string,
    options?: {
      conf?: Record<string, unknown>;
      logical_date?: string;
      note?: string;
    }
  ): Promise<AirflowDAGRun | null> {
    try {
      return await airflowRequest<AirflowDAGRun>(
        'POST',
        `/dags/${encodeURIComponent(dagId)}/dagRuns`,
        options || {}
      );
    } catch {
      return null;
    }
  }

  /**
   * 清除 DAG 运行（重新运行）
   */
  async clearDAGRun(
    dagId: string,
    dagRunId: string,
    options?: {
      dry_run?: boolean;
      task_ids?: string[];
      only_failed?: boolean;
      only_running?: boolean;
    }
  ): Promise<{ task_instances: AirflowTaskInstance[] } | null> {
    try {
      return await airflowRequest(
        'POST',
        `/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(dagRunId)}/clear`,
        options || {}
      );
    } catch {
      return null;
    }
  }

  // ============================================================
  // DAG Run 管理
  // ============================================================

  /**
   * 列出 DAG 运行
   */
  async listDAGRuns(
    dagId: string,
    limit: number = 25,
    offset: number = 0
  ): Promise<AirflowDAGRun[]> {
    try {
      const result = await airflowRequest<{ dag_runs: AirflowDAGRun[]; total_entries: number }>(
        'GET',
        `/dags/${encodeURIComponent(dagId)}/dagRuns?limit=${limit}&offset=${offset}&order_by=-execution_date`
      );
      return result.dag_runs || [];
    } catch {
      return [];
    }
  }

  /**
   * 获取 DAG Run 详情
   */
  async getDAGRun(dagId: string, dagRunId: string): Promise<AirflowDAGRun | null> {
    try {
      return await airflowRequest<AirflowDAGRun>(
        'GET',
        `/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(dagRunId)}`
      );
    } catch {
      return null;
    }
  }

  /**
   * 删除 DAG Run
   */
  async deleteDAGRun(dagId: string, dagRunId: string): Promise<boolean> {
    try {
      await airflowRequest(
        'DELETE',
        `/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(dagRunId)}`
      );
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // Task Instance 管理
  // ============================================================

  /**
   * 列出任务实例
   */
  async listTaskInstances(
    dagId: string,
    dagRunId: string
  ): Promise<AirflowTaskInstance[]> {
    try {
      const result = await airflowRequest<{ task_instances: AirflowTaskInstance[] }>(
        'GET',
        `/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(dagRunId)}/taskInstances`
      );
      return result.task_instances || [];
    } catch {
      return [];
    }
  }

  /**
   * 获取任务实例日志
   */
  async getTaskInstanceLogs(
    dagId: string,
    dagRunId: string,
    taskId: string,
    taskTryNumber: number = 1
  ): Promise<string> {
    try {
      const result = await airflowRequest<{ content: string }>(
        'GET',
        `/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(dagRunId)}/taskInstances/${encodeURIComponent(taskId)}/logs/${taskTryNumber}`
      );
      return result.content || '';
    } catch {
      return '';
    }
  }

  // ============================================================
  // 变量管理
  // ============================================================

  /**
   * 列出变量
   */
  async listVariables(): Promise<AirflowVariable[]> {
    try {
      const result = await airflowRequest<{ variables: AirflowVariable[] }>(
        'GET',
        '/variables'
      );
      return result.variables || [];
    } catch {
      return [];
    }
  }

  /**
   * 获取变量
   */
  async getVariable(key: string): Promise<AirflowVariable | null> {
    try {
      return await airflowRequest<AirflowVariable>(
        'GET',
        `/variables/${encodeURIComponent(key)}`
      );
    } catch {
      return null;
    }
  }

  /**
   * 创建/更新变量
   */
  async setVariable(key: string, value: string, description?: string): Promise<boolean> {
    try {
      await airflowRequest('POST', '/variables', {
        key,
        value,
        description,
      });
      return true;
    } catch {
      // 如果已存在，尝试更新
      try {
        await airflowRequest('PATCH', `/variables/${encodeURIComponent(key)}`, {
          value,
          description,
        });
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * 删除变量
   */
  async deleteVariable(key: string): Promise<boolean> {
    try {
      await airflowRequest('DELETE', `/variables/${encodeURIComponent(key)}`);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // 连接管理
  // ============================================================

  /**
   * 列出连接
   */
  async listConnections(): Promise<AirflowConnection[]> {
    try {
      const result = await airflowRequest<{ connections: AirflowConnection[] }>(
        'GET',
        '/connections'
      );
      return result.connections || [];
    } catch {
      return [];
    }
  }

  /**
   * 测试连接
   */
  async testConnection(connectionId: string): Promise<{
    status: boolean;
    message: string;
  }> {
    try {
      const result = await airflowRequest<{ status: boolean; message: string }>(
        'POST',
        `/connections/test`,
        { connection_id: connectionId }
      );
      return result;
    } catch (error) {
      return { status: false, message: String(error) };
    }
  }

  // ============================================================
  // 池管理
  // ============================================================

  /**
   * 列出池
   */
  async listPools(): Promise<AirflowPool[]> {
    try {
      const result = await airflowRequest<{ pools: AirflowPool[] }>('GET', '/pools');
      return result.pools || [];
    } catch {
      return [];
    }
  }

  // ============================================================
  // 概览
  // ============================================================

  /**
   * 获取 Airflow 概览
   */
  async getOverview(): Promise<{
    version: string | null;
    health: {
      metadatabase: string;
      scheduler: string;
      triggerer: string;
    };
    dags: {
      total: number;
      active: number;
      paused: number;
    };
    dagRuns: {
      running: number;
      queued: number;
      success: number;
      failed: number;
    };
    pools: number;
    variables: number;
    connections: number;
  }> {
    const [version, health, dags, pools, variables, connections] = await Promise.all([
      this.getVersion(),
      this.getHealth(),
      this.listDAGs(),
      this.listPools(),
      this.listVariables(),
      this.listConnections(),
    ]);

    // 获取最近的 DAG Runs 统计
    let dagRunStats = { running: 0, queued: 0, success: 0, failed: 0 };
    for (const dag of dags.slice(0, 10)) {
      const runs = await this.listDAGRuns(dag.dag_id, 5);
      for (const run of runs) {
        if (run.state === 'running') dagRunStats.running++;
        else if (run.state === 'queued') dagRunStats.queued++;
        else if (run.state === 'success') dagRunStats.success++;
        else if (run.state === 'failed') dagRunStats.failed++;
      }
    }

    return {
      version: version?.version || null,
      health: {
        metadatabase: health?.metadatabase?.status || 'unknown',
        scheduler: health?.scheduler?.status || 'unknown',
        triggerer: health?.triggerer?.status || 'unknown',
      },
      dags: {
        total: dags.length,
        active: dags.filter((d) => d.is_active && !d.is_paused).length,
        paused: dags.filter((d) => d.is_paused).length,
      },
      dagRuns: dagRunStats,
      pools: pools.length,
      variables: variables.length,
      connections: connections.length,
    };
  }
}

// 导出单例
export const airflowClient = AirflowClient.getInstance();
