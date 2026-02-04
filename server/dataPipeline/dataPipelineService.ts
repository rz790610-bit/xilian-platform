/**
 * 数据管道服务层
 * 管理 Airflow DAGs 和 Kafka Connect
 */

import {
  DagDefinition,
  DagRun,
  DagRunState,
  DagStats,
  TaskInstance,
  TaskState,
  ConnectorStatus,
  ConnectorConfigBase,
  StreamsTopology,
  StreamsMetrics,
  DataPipelineSummary,
  PREDEFINED_DAGS,
  PREDEFINED_CONNECTORS,
  PREDEFINED_STREAMS_TOPOLOGIES,
} from '@shared/dataPipelineTypes';

// ==================== Airflow DAGs 服务 ====================

/**
 * Airflow DAG 管理服务
 */
export class AirflowService {
  private dags: Map<string, DagDefinition> = new Map();
  private dagRuns: Map<string, DagRun[]> = new Map();
  private schedulerStatus: 'healthy' | 'degraded' | 'down' = 'healthy';

  constructor() {
    // 初始化预定义 DAGs
    Object.values(PREDEFINED_DAGS).forEach(dag => {
      this.dags.set(dag.dagId, dag);
      this.dagRuns.set(dag.dagId, this.generateMockRuns(dag.dagId));
    });
  }

  /**
   * 获取所有 DAGs
   */
  getDags(): DagDefinition[] {
    return Array.from(this.dags.values());
  }

  /**
   * 获取单个 DAG
   */
  getDag(dagId: string): DagDefinition | undefined {
    return this.dags.get(dagId);
  }

  /**
   * 创建 DAG
   */
  createDag(dag: DagDefinition): DagDefinition {
    this.dags.set(dag.dagId, dag);
    this.dagRuns.set(dag.dagId, []);
    return dag;
  }

  /**
   * 更新 DAG
   */
  updateDag(dagId: string, updates: Partial<DagDefinition>): DagDefinition | undefined {
    const dag = this.dags.get(dagId);
    if (!dag) return undefined;
    
    const updated = { ...dag, ...updates };
    this.dags.set(dagId, updated);
    return updated;
  }

  /**
   * 删除 DAG
   */
  deleteDag(dagId: string): boolean {
    this.dagRuns.delete(dagId);
    return this.dags.delete(dagId);
  }

  /**
   * 暂停/恢复 DAG
   */
  toggleDagPause(dagId: string): DagDefinition | undefined {
    const dag = this.dags.get(dagId);
    if (!dag) return undefined;
    
    dag.isPaused = !dag.isPaused;
    this.dags.set(dagId, dag);
    return dag;
  }

  /**
   * 触发 DAG 运行
   */
  triggerDag(dagId: string, conf?: Record<string, unknown>): DagRun | undefined {
    const dag = this.dags.get(dagId);
    if (!dag || dag.isPaused) return undefined;

    const runId = `manual__${new Date().toISOString()}`;
    const taskInstances: TaskInstance[] = dag.tasks.map(task => ({
      taskId: task.taskId,
      dagId,
      runId,
      state: 'pending' as TaskState,
      tryNumber: 1,
      maxTries: task.retries + 1,
    }));

    const run: DagRun = {
      runId,
      dagId,
      state: 'queued',
      executionDate: new Date().toISOString(),
      startDate: new Date().toISOString(),
      externalTrigger: true,
      conf,
      taskInstances,
    };

    const runs = this.dagRuns.get(dagId) || [];
    runs.unshift(run);
    this.dagRuns.set(dagId, runs);

    // 模拟任务执行
    this.simulateTaskExecution(run);

    return run;
  }

  /**
   * 获取 DAG 运行历史
   */
  getDagRuns(dagId: string, limit = 10): DagRun[] {
    const runs = this.dagRuns.get(dagId) || [];
    return runs.slice(0, limit);
  }

  /**
   * 获取单个运行详情
   */
  getDagRun(dagId: string, runId: string): DagRun | undefined {
    const runs = this.dagRuns.get(dagId) || [];
    return runs.find(r => r.runId === runId);
  }

  /**
   * 获取 DAG 统计信息
   */
  getDagStats(dagId: string): DagStats | undefined {
    const dag = this.dags.get(dagId);
    const runs = this.dagRuns.get(dagId) || [];
    if (!dag) return undefined;

    const successRuns = runs.filter(r => r.state === 'success').length;
    const failedRuns = runs.filter(r => r.state === 'failed').length;
    const durations = runs
      .filter(r => r.endDate)
      .map(r => new Date(r.endDate!).getTime() - new Date(r.startDate).getTime());
    const avgDuration = durations.length > 0 
      ? durations.reduce((a, b) => a + b, 0) / durations.length 
      : 0;

    return {
      dagId,
      totalRuns: runs.length,
      successRuns,
      failedRuns,
      avgDuration,
      lastRunState: runs[0]?.state || 'success',
      lastRunDate: runs[0]?.executionDate || dag.startDate,
      nextRunDate: dag.isPaused ? undefined : this.calculateNextRun(dag.scheduleInterval),
    };
  }

  /**
   * 获取所有 DAG 统计
   */
  getAllDagStats(): DagStats[] {
    return Array.from(this.dags.keys())
      .map(dagId => this.getDagStats(dagId))
      .filter((s): s is DagStats => s !== undefined);
  }

  /**
   * 获取调度器状态
   */
  getSchedulerStatus(): { status: string; lastHeartbeat: string } {
    return {
      status: this.schedulerStatus,
      lastHeartbeat: new Date().toISOString(),
    };
  }

  /**
   * 获取任务日志
   */
  getTaskLogs(dagId: string, runId: string, taskId: string): string {
    return `[${new Date().toISOString()}] Task ${taskId} started
[${new Date().toISOString()}] Executing task...
[${new Date().toISOString()}] Processing batch 1/10
[${new Date().toISOString()}] Processing batch 2/10
[${new Date().toISOString()}] Processing batch 3/10
[${new Date().toISOString()}] Task completed successfully`;
  }

  // 私有方法

  private generateMockRuns(dagId: string): DagRun[] {
    const runs: DagRun[] = [];
    const dag = this.dags.get(dagId);
    if (!dag) return runs;

    for (let i = 0; i < 10; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      const states: DagRunState[] = ['success', 'success', 'success', 'failed', 'success'];
      const state = states[Math.floor(Math.random() * states.length)];
      
      const taskInstances: TaskInstance[] = dag.tasks.map(task => ({
        taskId: task.taskId,
        dagId,
        runId: `scheduled__${date.toISOString()}`,
        state: state === 'success' ? 'success' : (Math.random() > 0.7 ? 'failed' : 'success'),
        startDate: date.toISOString(),
        endDate: new Date(date.getTime() + Math.random() * 3600000).toISOString(),
        duration: Math.random() * 3600,
        tryNumber: 1,
        maxTries: task.retries + 1,
      }));

      runs.push({
        runId: `scheduled__${date.toISOString()}`,
        dagId,
        state,
        executionDate: date.toISOString(),
        startDate: date.toISOString(),
        endDate: new Date(date.getTime() + Math.random() * 7200000).toISOString(),
        externalTrigger: false,
        taskInstances,
      });
    }

    return runs;
  }

  private simulateTaskExecution(run: DagRun): void {
    // 模拟异步任务执行
    setTimeout(() => {
      run.state = 'running';
      run.taskInstances.forEach((task, index) => {
        setTimeout(() => {
          task.state = 'running';
          task.startDate = new Date().toISOString();
          
          setTimeout(() => {
            task.state = Math.random() > 0.1 ? 'success' : 'failed';
            task.endDate = new Date().toISOString();
            task.duration = Math.random() * 60;
            
            // 检查是否所有任务完成
            const allDone = run.taskInstances.every(t => 
              t.state === 'success' || t.state === 'failed' || t.state === 'skipped'
            );
            if (allDone) {
              run.state = run.taskInstances.some(t => t.state === 'failed') ? 'failed' : 'success';
              run.endDate = new Date().toISOString();
            }
          }, 1000 + Math.random() * 2000);
        }, index * 500);
      });
    }, 100);
  }

  private calculateNextRun(schedule: string): string {
    const now = new Date();
    // 简化的下次运行时间计算
    if (schedule.includes('* * *')) {
      // 每天
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(parseInt(schedule.split(' ')[1]) || 0, 0, 0, 0);
      return next.toISOString();
    }
    return new Date(now.getTime() + 86400000).toISOString();
  }
}

// ==================== Kafka Connect 服务 ====================

/**
 * Kafka Connect 管理服务
 */
export class KafkaConnectService {
  private connectors: Map<string, ConnectorConfigBase> = new Map();
  private connectorStatuses: Map<string, ConnectorStatus> = new Map();

  constructor() {
    // 初始化预定义 Connectors
    Object.values(PREDEFINED_CONNECTORS).forEach(connector => {
      this.connectors.set(connector.name, connector);
      this.connectorStatuses.set(connector.name, this.createMockStatus(connector));
    });
  }

  /**
   * 获取所有 Connectors
   */
  getConnectors(): ConnectorConfigBase[] {
    return Array.from(this.connectors.values());
  }

  /**
   * 获取 Connector 配置
   */
  getConnector(name: string): ConnectorConfigBase | undefined {
    return this.connectors.get(name);
  }

  /**
   * 获取 Connector 状态
   */
  getConnectorStatus(name: string): ConnectorStatus | undefined {
    return this.connectorStatuses.get(name);
  }

  /**
   * 获取所有 Connector 状态
   */
  getAllConnectorStatuses(): ConnectorStatus[] {
    return Array.from(this.connectorStatuses.values());
  }

  /**
   * 创建 Connector
   */
  createConnector(config: ConnectorConfigBase): ConnectorConfigBase {
    this.connectors.set(config.name, config);
    this.connectorStatuses.set(config.name, this.createMockStatus(config));
    return config;
  }

  /**
   * 更新 Connector 配置
   */
  updateConnector(name: string, config: Partial<ConnectorConfigBase>): ConnectorConfigBase | undefined {
    const existing = this.connectors.get(name);
    if (!existing) return undefined;

    const updated = { ...existing, ...config };
    this.connectors.set(name, updated);
    return updated;
  }

  /**
   * 删除 Connector
   */
  deleteConnector(name: string): boolean {
    this.connectorStatuses.delete(name);
    return this.connectors.delete(name);
  }

  /**
   * 暂停 Connector
   */
  pauseConnector(name: string): ConnectorStatus | undefined {
    const status = this.connectorStatuses.get(name);
    if (!status) return undefined;

    status.connector.state = 'PAUSED';
    status.tasks.forEach(t => t.state = 'PAUSED');
    return status;
  }

  /**
   * 恢复 Connector
   */
  resumeConnector(name: string): ConnectorStatus | undefined {
    const status = this.connectorStatuses.get(name);
    if (!status) return undefined;

    status.connector.state = 'RUNNING';
    status.tasks.forEach(t => t.state = 'RUNNING');
    return status;
  }

  /**
   * 重启 Connector
   */
  restartConnector(name: string): ConnectorStatus | undefined {
    const status = this.connectorStatuses.get(name);
    if (!status) return undefined;

    // 模拟重启
    status.connector.state = 'RUNNING';
    status.tasks.forEach(t => {
      t.state = 'RUNNING';
      t.trace = undefined;
    });
    return status;
  }

  /**
   * 重启 Connector 任务
   */
  restartTask(name: string, taskId: number): ConnectorStatus | undefined {
    const status = this.connectorStatuses.get(name);
    if (!status) return undefined;

    const task = status.tasks.find(t => t.id === taskId);
    if (task) {
      task.state = 'RUNNING';
      task.trace = undefined;
    }
    return status;
  }

  /**
   * 获取 Connector 插件列表
   */
  getPlugins(): { class: string; type: string; version: string }[] {
    return [
      { class: 'io.debezium.connector.postgresql.PostgresConnector', type: 'source', version: '2.4.0' },
      { class: 'io.debezium.connector.mysql.MySqlConnector', type: 'source', version: '2.4.0' },
      { class: 'streams.kafka.connect.sink.Neo4jSinkConnector', type: 'sink', version: '5.0.0' },
      { class: 'com.clickhouse.kafka.connect.ClickHouseSinkConnector', type: 'sink', version: '0.0.19' },
      { class: 'io.confluent.connect.elasticsearch.ElasticsearchSinkConnector', type: 'sink', version: '14.0.0' },
      { class: 'io.confluent.connect.s3.S3SinkConnector', type: 'sink', version: '10.5.0' },
    ];
  }

  private createMockStatus(config: ConnectorConfigBase): ConnectorStatus {
    const tasksMax = config['tasks.max'] || 1;
    const tasks = Array.from({ length: tasksMax }, (_, i) => ({
      id: i,
      state: 'RUNNING' as const,
      workerId: `worker-${i + 1}:8083`,
    }));

    return {
      name: config.name,
      connector: {
        state: 'RUNNING',
        workerId: 'worker-1:8083',
      },
      tasks,
      type: config['connector.class'].includes('Source') ? 'source' : 'sink',
    };
  }
}

// ==================== Kafka Streams 服务 ====================

/**
 * Kafka Streams 管理服务
 */
export class KafkaStreamsService {
  private topologies: Map<string, StreamsTopology> = new Map();

  constructor() {
    // 初始化预定义拓扑
    PREDEFINED_STREAMS_TOPOLOGIES.forEach(topology => {
      this.topologies.set(topology.id, {
        ...topology,
        metrics: this.generateMockMetrics(),
      });
    });
  }

  /**
   * 获取所有拓扑
   */
  getTopologies(): StreamsTopology[] {
    return Array.from(this.topologies.values());
  }

  /**
   * 获取单个拓扑
   */
  getTopology(id: string): StreamsTopology | undefined {
    return this.topologies.get(id);
  }

  /**
   * 创建拓扑
   */
  createTopology(topology: StreamsTopology): StreamsTopology {
    topology.metrics = this.generateMockMetrics();
    this.topologies.set(topology.id, topology);
    return topology;
  }

  /**
   * 更新拓扑
   */
  updateTopology(id: string, updates: Partial<StreamsTopology>): StreamsTopology | undefined {
    const topology = this.topologies.get(id);
    if (!topology) return undefined;

    const updated = { ...topology, ...updates };
    this.topologies.set(id, updated);
    return updated;
  }

  /**
   * 删除拓扑
   */
  deleteTopology(id: string): boolean {
    return this.topologies.delete(id);
  }

  /**
   * 启动拓扑
   */
  startTopology(id: string): StreamsTopology | undefined {
    const topology = this.topologies.get(id);
    if (!topology) return undefined;

    topology.state = 'RUNNING';
    topology.metrics = this.generateMockMetrics();
    return topology;
  }

  /**
   * 停止拓扑
   */
  stopTopology(id: string): StreamsTopology | undefined {
    const topology = this.topologies.get(id);
    if (!topology) return undefined;

    topology.state = 'STOPPED';
    topology.metrics = undefined;
    return topology;
  }

  /**
   * 获取拓扑指标
   */
  getTopologyMetrics(id: string): StreamsMetrics | undefined {
    const topology = this.topologies.get(id);
    return topology?.metrics;
  }

  private generateMockMetrics(): StreamsMetrics {
    return {
      processRate: 1000 + Math.random() * 5000,
      processLatencyAvg: 5 + Math.random() * 20,
      processLatencyMax: 50 + Math.random() * 200,
      commitRate: 10 + Math.random() * 50,
      recordsConsumedRate: 1000 + Math.random() * 5000,
      recordsProducedRate: 900 + Math.random() * 4500,
      stateStoreSize: Math.floor(Math.random() * 1073741824),
    };
  }
}

// ==================== 数据管道综合服务 ====================

/**
 * 数据管道综合服务
 */
export class DataPipelineService {
  private airflowService: AirflowService;
  private kafkaConnectService: KafkaConnectService;
  private kafkaStreamsService: KafkaStreamsService;

  constructor() {
    this.airflowService = new AirflowService();
    this.kafkaConnectService = new KafkaConnectService();
    this.kafkaStreamsService = new KafkaStreamsService();
  }

  /**
   * 获取数据管道概览
   */
  getSummary(): DataPipelineSummary {
    const dags = this.airflowService.getDags();
    const dagStats = this.airflowService.getAllDagStats();
    const connectorStatuses = this.kafkaConnectService.getAllConnectorStatuses();
    const topologies = this.kafkaStreamsService.getTopologies();

    const runningTasks = dagStats.reduce((sum, stat) => {
      const runs = this.airflowService.getDagRuns(stat.dagId, 1);
      const running = runs[0]?.taskInstances.filter(t => t.state === 'running').length || 0;
      return sum + running;
    }, 0);

    const failedTasksLast24h = dagStats.reduce((sum, stat) => {
      return sum + (stat.lastRunState === 'failed' ? 1 : 0);
    }, 0);

    const runningConnectors = connectorStatuses.filter(s => s.connector.state === 'RUNNING').length;
    const failedConnectors = connectorStatuses.filter(s => s.connector.state === 'FAILED').length;
    const totalConnectorTasks = connectorStatuses.reduce((sum, s) => sum + s.tasks.length, 0);
    const runningConnectorTasks = connectorStatuses.reduce((sum, s) => 
      sum + s.tasks.filter(t => t.state === 'RUNNING').length, 0);

    const runningTopologies = topologies.filter(t => t.state === 'RUNNING').length;
    const totalProcessRate = topologies.reduce((sum, t) => sum + (t.metrics?.processRate || 0), 0);

    return {
      airflow: {
        status: failedTasksLast24h > 2 ? 'degraded' : 'healthy',
        totalDags: dags.length,
        activeDags: dags.filter(d => !d.isPaused).length,
        runningTasks,
        failedTasksLast24h,
        schedulerHeartbeat: new Date().toISOString(),
      },
      kafkaConnect: {
        status: failedConnectors > 0 ? 'degraded' : 'healthy',
        totalConnectors: connectorStatuses.length,
        runningConnectors,
        failedConnectors,
        totalTasks: totalConnectorTasks,
        runningTasks: runningConnectorTasks,
      },
      kafkaStreams: {
        status: runningTopologies === topologies.length ? 'healthy' : 'degraded',
        totalTopologies: topologies.length,
        runningTopologies,
        processRate: totalProcessRate,
        lagTotal: Math.floor(Math.random() * 10000),
      },
    };
  }

  // Airflow 代理方法
  get airflow() {
    return this.airflowService;
  }

  // Kafka Connect 代理方法
  get kafkaConnect() {
    return this.kafkaConnectService;
  }

  // Kafka Streams 代理方法
  get kafkaStreams() {
    return this.kafkaStreamsService;
  }
}

// 导出单例
export const dataPipelineService = new DataPipelineService();
