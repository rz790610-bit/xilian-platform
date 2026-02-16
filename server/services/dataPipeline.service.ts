/**
 * 增强版数据管道服务
 * 集成真实 Airflow 和 Kafka Connect API
 * 
 * 职责边界：
 * - dataPipeline.service.ts（本文件）：外部编排引擎集成层
 *   负责与 Airflow DAG 和 Kafka Connect 的 REST API 交互，
 *   提供统一的管道概览、运行历史、任务监控。
 *   适用于已有 Airflow/Kafka Connect 集群的生产环境。
 * 
 * - pipeline.engine.ts：内置 DAG 执行引擎
 *   负责平台内部的管道定义、拓扑排序、分层并行执行、
 *   重试、资产追踪（Lineage）。支持 50+ 节点类型。
 *   适用于平台内部的算法编排、数据处理流程。
 * 
 * 两者不是重复建设，而是互补关系：
 * - 外部编排（Airflow/Kafka Connect）用于大规模数据工程任务
 * - 内置引擎（PipelineEngine）用于平台内部的轻量级实时管道
 */

import { airflowClient, AirflowDAG, AirflowDAGRun, AirflowTaskInstance } from '../lib/clients/airflow.client';
import { kafkaConnectClient, KafkaConnector, KafkaConnectorStatus } from '../lib/clients/kafkaConnect.client';
import { createModuleLogger } from '../core/logger';
const log = createModuleLogger('dataPipeline');

// ============================================================
// 类型定义
// ============================================================

export interface DataPipeline {

  id: string;
  name: string;
  description: string;
  type: 'airflow' | 'kafka-connect' | 'spark' | 'flink';
  status: 'running' | 'paused' | 'failed' | 'stopped';
  schedule: string | null;
  lastRun: Date | null;
  nextRun: Date | null;
  owner: string;
  tags: string[];
  metrics: {
    successRate: number;
    avgDuration: number;
    totalRuns: number;
  };
}

export interface PipelineRun {
  id: string;
  pipelineId: string;
  status: 'running' | 'success' | 'failed' | 'queued';
  startTime: Date;
  endTime: Date | null;
  duration: number | null;
  triggeredBy: string;
  logs?: string;
}

export interface PipelineTask {
  id: string;
  pipelineId: string;
  name: string;
  type: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  startTime: Date | null;
  endTime: Date | null;
  retries: number;
  dependencies: string[];
}

export interface KafkaConnectorInfo {
  name: string;
  type: 'source' | 'sink';
  status: 'running' | 'paused' | 'failed' | 'unassigned';
  config: Record<string, string>;
  tasks: Array<{
    id: number;
    status: string;
    workerId: string;
  }>;
  topics: string[];
}

export interface DataPipelineOverview {
  airflow: {
    connected: boolean;
    version: string | null;
    dags: {
      total: number;
      active: number;
      paused: number;
    };
    runs: {
      running: number;
      success: number;
      failed: number;
    };
  };
  kafkaConnect: {
    connected: boolean;
    version: string | null;
    connectors: {
      total: number;
      running: number;
      paused: number;
      failed: number;
    };
    tasks: {
      total: number;
      running: number;
      failed: number;
    };
  };
  totalPipelines: number;
  activePipelines: number;
  recentRuns: PipelineRun[];
}

// ============================================================
// 增强版数据管道服务
// ============================================================

export class EnhancedDataPipelineService {
  private static instance: EnhancedDataPipelineService;

  private constructor() {
    log.debug('[EnhancedDataPipelineService] Initialized with real Airflow and Kafka Connect clients');
  }

  static getInstance(): EnhancedDataPipelineService {
    if (!EnhancedDataPipelineService.instance) {
      EnhancedDataPipelineService.instance = new EnhancedDataPipelineService();
    }
    return EnhancedDataPipelineService.instance;
  }

  // ============================================================
  // 概览
  // ============================================================

  /**
   * 获取数据管道概览
   */
  async getOverview(): Promise<DataPipelineOverview> {
    const [airflowOverview, kafkaOverview] = await Promise.all([
      airflowClient.getOverview(),
      kafkaConnectClient.getOverview(),
    ]);

    // 获取最近运行
    const recentRuns = await this.getRecentRuns(10);

    return {
      airflow: {
        connected: airflowOverview.version !== null,
        version: airflowOverview.version,
        dags: airflowOverview.dags,
        runs: airflowOverview.dagRuns,
      },
      kafkaConnect: {
        connected: kafkaOverview.version !== null,
        version: kafkaOverview.version,
        connectors: kafkaOverview.connectors,
        tasks: kafkaOverview.tasks,
      },
      totalPipelines: airflowOverview.dags.total + kafkaOverview.connectors.total,
      activePipelines: airflowOverview.dags.active + kafkaOverview.connectors.running,
      recentRuns,
    };
  }

  // ============================================================
  // Airflow DAG 管理
  // ============================================================

  /**
   * 列出所有 DAG
   */
  async listDAGs(): Promise<DataPipeline[]> {
    const dags = await airflowClient.listDAGs();
    return dags.map((dag) => this.convertDAGToPipeline(dag));
  }

  /**
   * 获取 DAG 详情
   */
  async getDAG(dagId: string): Promise<DataPipeline | null> {
    const dag = await airflowClient.getDAG(dagId);
    if (!dag) return null;
    return this.convertDAGToPipeline(dag);
  }

  /**
   * 暂停/恢复 DAG
   */
  async toggleDAG(dagId: string, isPaused: boolean): Promise<boolean> {
    const result = await airflowClient.pauseDAG(dagId, isPaused);
    return result !== null;
  }

  /**
   * 触发 DAG 运行
   */
  async triggerDAG(dagId: string, conf?: Record<string, unknown>): Promise<PipelineRun | null> {
    const run = await airflowClient.triggerDAG(dagId, conf);
    if (!run) return null;
    return this.convertDAGRunToPipelineRun(dagId, run);
  }

  /**
   * 获取 DAG 运行历史
   */
  async getDAGRuns(dagId: string, limit: number = 20): Promise<PipelineRun[]> {
    const runs = await airflowClient.listDAGRuns(dagId, limit);
    return runs.map((run) => this.convertDAGRunToPipelineRun(dagId, run));
  }

  /**
   * 获取 DAG 任务
   */
  async getDAGTasks(dagId: string): Promise<PipelineTask[]> {
    const tasks: any[] = []; // listTasks not available in current API
    return tasks.map((task: any) => this.convertTaskToPipelineTask(dagId, task));
  }

  /**
   * 获取任务实例
   */
  async getTaskInstances(dagId: string, dagRunId: string): Promise<PipelineTask[]> {
    const instances = await airflowClient.listTaskInstances(dagId, dagRunId);
    return instances.map((instance) => this.convertTaskInstanceToPipelineTask(dagId, instance));
  }

  /**
   * 清除任务实例（重试）
   */
  async clearTaskInstance(
    dagId: string,
    dagRunId: string,
    taskId: string
  ): Promise<boolean> {
    // clearTaskInstance requires DAG run clear API
    const result = await airflowClient.clearDAGRun(dagId, dagRunId);
    return result !== null;
  }

  // ============================================================
  // Kafka Connect 管理
  // ============================================================

  /**
   * 列出所有连接器
   */
  async listConnectors(): Promise<KafkaConnectorInfo[]> {
    const connectorNames = await kafkaConnectClient.listConnectors();
    const connectors: KafkaConnectorInfo[] = [];

    for (const name of connectorNames) {
      const [connector, status] = await Promise.all([
        kafkaConnectClient.getConnector(name),
        kafkaConnectClient.getConnectorStatus(name),
      ]);

      if (connector && status) {
        connectors.push(this.convertToConnectorInfo(connector, status));
      }
    }

    return connectors;
  }

  /**
   * 获取连接器详情
   */
  async getConnector(name: string): Promise<KafkaConnectorInfo | null> {
    const [connector, status] = await Promise.all([
      kafkaConnectClient.getConnector(name),
      kafkaConnectClient.getConnectorStatus(name),
    ]);

    if (!connector || !status) return null;
    return this.convertToConnectorInfo(connector, status);
  }

  /**
   * 创建连接器
   */
  async createConnector(
    name: string,
    config: Record<string, string>
  ): Promise<KafkaConnectorInfo | null> {
    const connector = await kafkaConnectClient.createConnector(name, config);
    if (!connector) return null;

    const status = await kafkaConnectClient.getConnectorStatus(name);
    if (!status) return null;

    return this.convertToConnectorInfo(connector, status);
  }

  /**
   * 更新连接器配置
   */
  async updateConnector(
    name: string,
    config: Record<string, string>
  ): Promise<boolean> {
    const result = await kafkaConnectClient.updateConnectorConfig(name, config);
    return result !== null;
  }

  /**
   * 删除连接器
   */
  async deleteConnector(name: string): Promise<boolean> {
    return await kafkaConnectClient.deleteConnector(name);
  }

  /**
   * 暂停连接器
   */
  async pauseConnector(name: string): Promise<boolean> {
    return await kafkaConnectClient.pauseConnector(name);
  }

  /**
   * 恢复连接器
   */
  async resumeConnector(name: string): Promise<boolean> {
    return await kafkaConnectClient.resumeConnector(name);
  }

  /**
   * 重启连接器
   */
  async restartConnector(name: string): Promise<boolean> {
    return await kafkaConnectClient.restartConnector(name);
  }

  /**
   * 重启任务
   */
  async restartConnectorTask(name: string, taskId: number): Promise<boolean> {
    return await kafkaConnectClient.restartTask(name, taskId);
  }

  // ============================================================
  // 统一管道接口
  // ============================================================

  /**
   * 列出所有管道（Airflow DAG + Kafka Connectors）
   */
  async listAllPipelines(): Promise<DataPipeline[]> {
    const [dags, connectors] = await Promise.all([
      this.listDAGs(),
      this.listConnectors(),
    ]);

    // 将 Kafka Connectors 转换为 DataPipeline 格式
    const connectorPipelines: DataPipeline[] = connectors.map((c) => ({
      id: `kafka-${c.name}`,
      name: c.name,
      description: `Kafka ${c.type} connector`,
      type: 'kafka-connect' as const,
      status: c.status === 'running' ? 'running' : 
              c.status === 'paused' ? 'paused' : 
              c.status === 'failed' ? 'failed' : 'stopped',
      schedule: null,
      lastRun: null,
      nextRun: null,
      owner: 'kafka-connect',
      tags: [c.type, 'kafka'],
      metrics: {
        successRate: c.status === 'running' ? 100 : 0,
        avgDuration: 0,
        totalRuns: 0,
      },
    }));

    return [...dags, ...connectorPipelines];
  }

  /**
   * 获取最近运行
   */
  async getRecentRuns(limit: number = 10): Promise<PipelineRun[]> {
    const dags = await airflowClient.listDAGs();
    const allRuns: PipelineRun[] = [];

    // 从每个 DAG 获取最近运行
    for (const dag of dags.slice(0, 5)) {
      const runs = await airflowClient.listDAGRuns(dag.dag_id, 5);
      allRuns.push(...runs.map((run) => this.convertDAGRunToPipelineRun(dag.dag_id, run)));
    }

    // 按时间排序并限制数量
    return allRuns
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  /**
   * 检查服务连接状态
   */
  async checkConnections(): Promise<{
    airflow: boolean;
    kafkaConnect: boolean;
  }> {
    const [airflow, kafkaConnect] = await Promise.all([
      airflowClient.checkConnection(),
      kafkaConnectClient.checkConnection(),
    ]);

    return { airflow, kafkaConnect };
  }

  // ============================================================
  // 私有转换方法
  // ============================================================

  private convertDAGToPipeline(dag: AirflowDAG): DataPipeline {
    return {
      id: dag.dag_id,
      name: dag.dag_id,
      description: dag.description || '',
      type: 'airflow',
      status: dag.is_paused ? 'paused' : dag.is_active ? 'running' : 'stopped',
      schedule: dag.schedule_interval ? (typeof dag.schedule_interval === 'string' ? dag.schedule_interval : dag.schedule_interval.value) : null,
      lastRun: dag.last_parsed_time ? new Date(dag.last_parsed_time) : null,
      nextRun: dag.next_dagrun ? new Date(dag.next_dagrun) : null,
      owner: dag.owners.join(', ') || 'airflow',
      tags: dag.tags.map((t) => t.name),
      metrics: {
        successRate: 0, // 需要从运行历史计算
        avgDuration: 0,
        totalRuns: 0,
      },
    };
  }

  private convertDAGRunToPipelineRun(dagId: string, run: AirflowDAGRun): PipelineRun {
    const startTime = new Date(run.start_date || run.execution_date);
    const endTime = run.end_date ? new Date(run.end_date) : null;
    
    return {
      id: run.dag_run_id,
      pipelineId: dagId,
      status: run.state === 'success' ? 'success' :
              run.state === 'failed' ? 'failed' :
              run.state === 'running' ? 'running' : 'queued',
      startTime,
      endTime,
      duration: endTime ? endTime.getTime() - startTime.getTime() : null,
      triggeredBy: run.external_trigger ? 'external' : 'scheduler',
    };
  }

  private convertTaskToPipelineTask(dagId: string, task: any): PipelineTask {
    return {
      id: task.task_id,
      pipelineId: dagId,
      name: task.task_id,
      type: task.task_type || 'operator',
      status: 'pending',
      startTime: null,
      endTime: null,
      retries: task.retries,
      dependencies: task.downstream_task_ids,
    };
  }

  private convertTaskInstanceToPipelineTask(
    dagId: string,
    instance: AirflowTaskInstance
  ): PipelineTask {
    return {
      id: instance.task_id,
      pipelineId: dagId,
      name: instance.task_id,
      type: instance.operator || 'operator',
      status: instance.state === 'success' ? 'success' :
              instance.state === 'failed' ? 'failed' :
              instance.state === 'running' ? 'running' :
              instance.state === 'skipped' ? 'skipped' : 'pending',
      startTime: instance.start_date ? new Date(instance.start_date) : null,
      endTime: instance.end_date ? new Date(instance.end_date) : null,
      retries: instance.try_number - 1,
      dependencies: [],
    };
  }

  private convertToConnectorInfo(
    connector: KafkaConnector,
    status: KafkaConnectorStatus
  ): KafkaConnectorInfo {
    // 从配置中提取 topics
    const topics: string[] = [];
    if (connector.config.topics) {
      topics.push(...connector.config.topics.split(',').map((t) => t.trim()));
    }
    if (connector.config['topics.regex']) {
      topics.push(`regex:${connector.config['topics.regex']}`);
    }

    return {
      name: connector.name,
      type: connector.type,
      status: status.connector.state.toLowerCase() as any,
      config: connector.config,
      tasks: status.tasks.map((t) => ({
        id: t.id,
        status: t.state.toLowerCase(),
        workerId: t.worker_id,
      })),
      topics,
    };
  }
}

// 导出单例
export const dataPipelineService = EnhancedDataPipelineService.getInstance();
