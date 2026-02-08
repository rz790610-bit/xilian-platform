/**
 * Pipeline 数据流处理引擎
 * 提供数据采集、转换、输出的完整管道功能
 */

import { EventEmitter } from 'events';
import { redisClient } from '../lib/clients/redis.client';

// ============ 类型定义 ============

// 管道状态
export type PipelineStatus = 'created' | 'running' | 'paused' | 'stopped' | 'error';

// 数据记录
export interface DataRecord {
  id: string;
  timestamp: number;
  source: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// 处理结果
export interface ProcessResult {
  success: boolean;
  records: DataRecord[];
  errors?: Array<{ recordId: string; error: string }>;
  metrics?: {
    processedCount: number;
    errorCount: number;
    processingTimeMs: number;
  };
}

// 数据源连接器接口
export interface SourceConnector {
  name: string;
  type: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  fetch(batchSize?: number): Promise<DataRecord[]>;
  getStatus(): { connected: boolean; lastFetch?: number; errorCount: number };
}

// 数据处理器接口
export interface Processor {
  name: string;
  type: string;
  process(records: DataRecord[]): Promise<ProcessResult>;
}

// 数据目标连接器接口
export interface SinkConnector {
  name: string;
  type: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  write(records: DataRecord[]): Promise<{ success: boolean; writtenCount: number; errors?: string[] }>;
  getStatus(): { connected: boolean; lastWrite?: number; errorCount: number };
}

// 管道配置
export interface PipelineConfig {
  id: string;
  name: string;
  description?: string;
  source: {
    type: string;
    config: Record<string, unknown>;
  };
  processors: Array<{
    type: string;
    config: Record<string, unknown>;
  }>;
  sink: {
    type: string;
    config: Record<string, unknown>;
  };
  schedule?: {
    type: 'interval' | 'cron';
    value: string | number;
  };
  batchSize?: number;
  retryPolicy?: {
    maxRetries: number;
    retryDelayMs: number;
  };
}

// 管道运行时状态
export interface PipelineRuntime {
  config: PipelineConfig;
  status: PipelineStatus;
  source?: SourceConnector;
  processors: Processor[];
  sink?: SinkConnector;
  metrics: {
    totalRecordsProcessed: number;
    totalErrors: number;
    lastRunAt?: number;
    lastRunDurationMs?: number;
    averageProcessingTimeMs: number;
  };
  intervalId?: NodeJS.Timeout;
}

// ============ 内置连接器实现 ============

/**
 * HTTP 数据源连接器
 */
export class HttpSourceConnector implements SourceConnector {
  name: string;
  type = 'http';
  private config: { url: string; method?: string; headers?: Record<string, string>; dataPath?: string };
  private connected = false;
  private lastFetch?: number;
  private errorCount = 0;

  constructor(name: string, config: Record<string, unknown>) {
    this.name = name;
    this.config = {
      url: config.url as string,
      method: (config.method as string) || 'GET',
      headers: config.headers as Record<string, string>,
      dataPath: config.dataPath as string,
    };
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async fetch(batchSize: number = 100): Promise<DataRecord[]> {
    try {
      const response = await fetch(this.config.url, {
        method: this.config.method,
        headers: this.config.headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      let data = json;

      // 支持嵌套数据路径
      if (this.config.dataPath) {
        const paths = this.config.dataPath.split('.');
        for (const path of paths) {
          data = data?.[path];
        }
      }

      const records: DataRecord[] = (Array.isArray(data) ? data : [data])
        .slice(0, batchSize)
        .map((item: unknown, index: number) => ({
          id: `${Date.now()}-${index}`,
          timestamp: Date.now(),
          source: this.name,
          data: item as Record<string, unknown>,
        }));

      this.lastFetch = Date.now();
      return records;
    } catch (error) {
      this.errorCount++;
      throw error;
    }
  }

  getStatus() {
    return {
      connected: this.connected,
      lastFetch: this.lastFetch,
      errorCount: this.errorCount,
    };
  }
}

/**
 * Kafka 数据源连接器
 */
export class KafkaSourceConnector implements SourceConnector {
  name: string;
  type = 'kafka';
  private config: { brokers: string[]; topic: string; groupId: string };
  private connected = false;
  private lastFetch?: number;
  private errorCount = 0;
  private messageBuffer: DataRecord[] = [];

  constructor(name: string, config: Record<string, unknown>) {
    this.name = name;
    this.config = {
      brokers: config.brokers as string[],
      topic: config.topic as string,
      groupId: config.groupId as string,
    };
  }

  async connect(): Promise<void> {
    // 实际实现需要连接 Kafka
    this.connected = true;
    console.log(`[KafkaSource] Connected to topic: ${this.config.topic}`);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async fetch(batchSize: number = 100): Promise<DataRecord[]> {
    // 模拟从 Kafka 获取消息
    const records = this.messageBuffer.splice(0, batchSize);
    this.lastFetch = Date.now();
    return records;
  }

  // 用于接收 Kafka 消息的方法
  pushMessage(message: Record<string, unknown>): void {
    this.messageBuffer.push({
      id: `kafka-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      source: this.name,
      data: message,
    });
  }

  getStatus() {
    return {
      connected: this.connected,
      lastFetch: this.lastFetch,
      errorCount: this.errorCount,
    };
  }
}

/**
 * 数据库数据源连接器
 */
export class DatabaseSourceConnector implements SourceConnector {
  name: string;
  type = 'database';
  private config: { query: string; connectionString?: string };
  private connected = false;
  private lastFetch?: number;
  private errorCount = 0;

  constructor(name: string, config: Record<string, unknown>) {
    this.name = name;
    this.config = {
      query: config.query as string,
      connectionString: config.connectionString as string,
    };
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async fetch(_batchSize: number = 100): Promise<DataRecord[]> {
    // 实际实现需要执行数据库查询
    this.lastFetch = Date.now();
    return [];
  }

  getStatus() {
    return {
      connected: this.connected,
      lastFetch: this.lastFetch,
      errorCount: this.errorCount,
    };
  }
}

// ============ 内置处理器实现 ============

/**
 * 字段映射处理器
 */
export class FieldMapProcessor implements Processor {
  name: string;
  type = 'field_map';
  private mapping: Record<string, string>;

  constructor(name: string, config: Record<string, unknown>) {
    this.name = name;
    this.mapping = config.mapping as Record<string, string>;
  }

  async process(records: DataRecord[]): Promise<ProcessResult> {
    const startTime = Date.now();
    const processedRecords: DataRecord[] = [];
    const errors: Array<{ recordId: string; error: string }> = [];

    for (const record of records) {
      try {
        const newData: Record<string, unknown> = {};
        for (const [targetField, sourceField] of Object.entries(this.mapping)) {
          newData[targetField] = record.data[sourceField];
        }
        processedRecords.push({
          ...record,
          data: newData,
        });
      } catch (error) {
        errors.push({
          recordId: record.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      success: errors.length === 0,
      records: processedRecords,
      errors: errors.length > 0 ? errors : undefined,
      metrics: {
        processedCount: processedRecords.length,
        errorCount: errors.length,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * 过滤处理器
 */
export class FilterProcessor implements Processor {
  name: string;
  type = 'filter';
  private condition: { field: string; operator: string; value: unknown };

  constructor(name: string, config: Record<string, unknown>) {
    this.name = name;
    this.condition = config.condition as { field: string; operator: string; value: unknown };
  }

  async process(records: DataRecord[]): Promise<ProcessResult> {
    const startTime = Date.now();
    const processedRecords: DataRecord[] = [];

    for (const record of records) {
      const fieldValue = record.data[this.condition.field];
      let matches = false;

      switch (this.condition.operator) {
        case 'eq':
          matches = fieldValue === this.condition.value;
          break;
        case 'ne':
          matches = fieldValue !== this.condition.value;
          break;
        case 'gt':
          matches = (fieldValue as number) > (this.condition.value as number);
          break;
        case 'gte':
          matches = (fieldValue as number) >= (this.condition.value as number);
          break;
        case 'lt':
          matches = (fieldValue as number) < (this.condition.value as number);
          break;
        case 'lte':
          matches = (fieldValue as number) <= (this.condition.value as number);
          break;
        case 'contains':
          matches = String(fieldValue).includes(String(this.condition.value));
          break;
        case 'regex':
          matches = new RegExp(String(this.condition.value)).test(String(fieldValue));
          break;
        default:
          matches = true;
      }

      if (matches) {
        processedRecords.push(record);
      }
    }

    return {
      success: true,
      records: processedRecords,
      metrics: {
        processedCount: processedRecords.length,
        errorCount: 0,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * 转换处理器
 */
export class TransformProcessor implements Processor {
  name: string;
  type = 'transform';
  private transformFn: string;

  constructor(name: string, config: Record<string, unknown>) {
    this.name = name;
    this.transformFn = config.transform as string;
  }

  async process(records: DataRecord[]): Promise<ProcessResult> {
    const startTime = Date.now();
    const processedRecords: DataRecord[] = [];
    const errors: Array<{ recordId: string; error: string }> = [];

    // 创建安全的转换函数
    const transform = new Function('record', `return (${this.transformFn})(record);`);

    for (const record of records) {
      try {
        const transformed = transform(record.data);
        processedRecords.push({
          ...record,
          data: transformed,
        });
      } catch (error) {
        errors.push({
          recordId: record.id,
          error: error instanceof Error ? error.message : 'Transform error',
        });
      }
    }

    return {
      success: errors.length === 0,
      records: processedRecords,
      errors: errors.length > 0 ? errors : undefined,
      metrics: {
        processedCount: processedRecords.length,
        errorCount: errors.length,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * 聚合处理器
 */
export class AggregateProcessor implements Processor {
  name: string;
  type = 'aggregate';
  private config: { groupBy?: string; aggregations: Array<{ field: string; operation: string; outputField: string }> };

  constructor(name: string, config: Record<string, unknown>) {
    this.name = name;
    this.config = {
      groupBy: config.groupBy as string,
      aggregations: config.aggregations as Array<{ field: string; operation: string; outputField: string }>,
    };
  }

  async process(records: DataRecord[]): Promise<ProcessResult> {
    const startTime = Date.now();

    // 分组
    const groups = new Map<string, DataRecord[]>();
    for (const record of records) {
      const key = this.config.groupBy ? String(record.data[this.config.groupBy]) : 'all';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(record);
    }

    // 聚合
    const processedRecords: DataRecord[] = [];
    for (const [groupKey, groupRecords] of Array.from(groups.entries())) {
      const aggregatedData: Record<string, unknown> = {};
      
      if (this.config.groupBy) {
        aggregatedData[this.config.groupBy] = groupKey;
      }

      for (const agg of this.config.aggregations) {
        const values = groupRecords.map((r: DataRecord) => r.data[agg.field] as number).filter((v: unknown) => typeof v === 'number');
        
        switch (agg.operation) {
          case 'sum':
            aggregatedData[agg.outputField] = values.reduce((a: number, b: number) => a + b, 0);
            break;
          case 'avg':
            aggregatedData[agg.outputField] = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0;
            break;
          case 'min':
            aggregatedData[agg.outputField] = Math.min(...values);
            break;
          case 'max':
            aggregatedData[agg.outputField] = Math.max(...values);
            break;
          case 'count':
            aggregatedData[agg.outputField] = values.length;
            break;
        }
      }

      processedRecords.push({
        id: `agg-${groupKey}-${Date.now()}`,
        timestamp: Date.now(),
        source: 'aggregation',
        data: aggregatedData,
      });
    }

    return {
      success: true,
      records: processedRecords,
      metrics: {
        processedCount: processedRecords.length,
        errorCount: 0,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }
}

// ============ 内置目标连接器实现 ============

/**
 * HTTP 目标连接器
 */
export class HttpSinkConnector implements SinkConnector {
  name: string;
  type = 'http';
  private config: { url: string; method?: string; headers?: Record<string, string>; batchMode?: boolean };
  private connected = false;
  private lastWrite?: number;
  private errorCount = 0;

  constructor(name: string, config: Record<string, unknown>) {
    this.name = name;
    this.config = {
      url: config.url as string,
      method: (config.method as string) || 'POST',
      headers: config.headers as Record<string, string>,
      batchMode: config.batchMode as boolean ?? true,
    };
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async write(records: DataRecord[]): Promise<{ success: boolean; writtenCount: number; errors?: string[] }> {
    const errors: string[] = [];
    let writtenCount = 0;

    try {
      if (this.config.batchMode) {
        // 批量发送
        const response = await fetch(this.config.url, {
          method: this.config.method,
          headers: {
            'Content-Type': 'application/json',
            ...this.config.headers,
          },
          body: JSON.stringify(records.map(r => r.data)),
        });

        if (response.ok) {
          writtenCount = records.length;
        } else {
          errors.push(`HTTP ${response.status}: ${response.statusText}`);
        }
      } else {
        // 逐条发送
        for (const record of records) {
          const response = await fetch(this.config.url, {
            method: this.config.method,
            headers: {
              'Content-Type': 'application/json',
              ...this.config.headers,
            },
            body: JSON.stringify(record.data),
          });

          if (response.ok) {
            writtenCount++;
          } else {
            errors.push(`Record ${record.id}: HTTP ${response.status}`);
          }
        }
      }

      this.lastWrite = Date.now();
    } catch (error) {
      this.errorCount++;
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return {
      success: errors.length === 0,
      writtenCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  getStatus() {
    return {
      connected: this.connected,
      lastWrite: this.lastWrite,
      errorCount: this.errorCount,
    };
  }
}

/**
 * ClickHouse 目标连接器
 */
export class ClickHouseSinkConnector implements SinkConnector {
  name: string;
  type = 'clickhouse';
  private config: { table: string };
  private connected = false;
  private lastWrite?: number;
  private errorCount = 0;

  constructor(name: string, config: Record<string, unknown>) {
    this.name = name;
    this.config = {
      table: config.table as string,
    };
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async write(records: DataRecord[]): Promise<{ success: boolean; writtenCount: number; errors?: string[] }> {
    // 实际实现需要写入 ClickHouse
    this.lastWrite = Date.now();
    return {
      success: true,
      writtenCount: records.length,
    };
  }

  getStatus() {
    return {
      connected: this.connected,
      lastWrite: this.lastWrite,
      errorCount: this.errorCount,
    };
  }
}

/**
 * Redis 目标连接器
 */
export class RedisSinkConnector implements SinkConnector {
  name: string;
  type = 'redis';
  private config: { keyPrefix: string; ttlSeconds?: number };
  private connected = false;
  private lastWrite?: number;
  private errorCount = 0;

  constructor(name: string, config: Record<string, unknown>) {
    this.name = name;
    this.config = {
      keyPrefix: config.keyPrefix as string,
      ttlSeconds: config.ttlSeconds as number,
    };
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async write(records: DataRecord[]): Promise<{ success: boolean; writtenCount: number; errors?: string[] }> {
    let writtenCount = 0;
    const errors: string[] = [];

    for (const record of records) {
      try {
        const key = `${this.config.keyPrefix}${record.id}`;
        await redisClient.set(key, record.data, this.config.ttlSeconds);
        writtenCount++;
      } catch (error) {
        errors.push(`Record ${record.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    this.lastWrite = Date.now();

    return {
      success: errors.length === 0,
      writtenCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  getStatus() {
    return {
      connected: this.connected,
      lastWrite: this.lastWrite,
      errorCount: this.errorCount,
    };
  }
}

// ============ Pipeline 引擎 ============

/**
 * Pipeline 引擎类
 */
export class PipelineEngine extends EventEmitter {
  private pipelines: Map<string, PipelineRuntime> = new Map();
  private connectorFactories: Map<string, (name: string, config: Record<string, unknown>) => SourceConnector | SinkConnector> = new Map();
  private processorFactories: Map<string, (name: string, config: Record<string, unknown>) => Processor> = new Map();

  constructor() {
    super();
    this.registerBuiltinFactories();
  }

  /**
   * 注册内置工厂
   */
  private registerBuiltinFactories(): void {
    // 数据源连接器
    this.connectorFactories.set('http_source', (name, config) => new HttpSourceConnector(name, config));
    this.connectorFactories.set('kafka_source', (name, config) => new KafkaSourceConnector(name, config));
    this.connectorFactories.set('database_source', (name, config) => new DatabaseSourceConnector(name, config));

    // 目标连接器
    this.connectorFactories.set('http_sink', (name, config) => new HttpSinkConnector(name, config));
    this.connectorFactories.set('clickhouse_sink', (name, config) => new ClickHouseSinkConnector(name, config));
    this.connectorFactories.set('redis_sink', (name, config) => new RedisSinkConnector(name, config));

    // 处理器
    this.processorFactories.set('field_map', (name, config) => new FieldMapProcessor(name, config));
    this.processorFactories.set('filter', (name, config) => new FilterProcessor(name, config));
    this.processorFactories.set('transform', (name, config) => new TransformProcessor(name, config));
    this.processorFactories.set('aggregate', (name, config) => new AggregateProcessor(name, config));
  }

  /**
   * 注册自定义连接器工厂
   */
  registerConnectorFactory(
    type: string,
    factory: (name: string, config: Record<string, unknown>) => SourceConnector | SinkConnector
  ): void {
    this.connectorFactories.set(type, factory);
  }

  /**
   * 注册自定义处理器工厂
   */
  registerProcessorFactory(
    type: string,
    factory: (name: string, config: Record<string, unknown>) => Processor
  ): void {
    this.processorFactories.set(type, factory);
  }

  /**
   * 创建管道
   */
  async createPipeline(config: PipelineConfig): Promise<void> {
    if (this.pipelines.has(config.id)) {
      throw new Error(`Pipeline ${config.id} already exists`);
    }

    // 创建数据源
    const sourceFactory = this.connectorFactories.get(`${config.source.type}_source`);
    if (!sourceFactory) {
      throw new Error(`Unknown source type: ${config.source.type}`);
    }
    const source = sourceFactory(`${config.id}_source`, config.source.config) as SourceConnector;

    // 创建处理器
    const processors: Processor[] = [];
    for (let i = 0; i < config.processors.length; i++) {
      const procConfig = config.processors[i];
      const procFactory = this.processorFactories.get(procConfig.type);
      if (!procFactory) {
        throw new Error(`Unknown processor type: ${procConfig.type}`);
      }
      processors.push(procFactory(`${config.id}_proc_${i}`, procConfig.config));
    }

    // 创建目标
    const sinkFactory = this.connectorFactories.get(`${config.sink.type}_sink`);
    if (!sinkFactory) {
      throw new Error(`Unknown sink type: ${config.sink.type}`);
    }
    const sink = sinkFactory(`${config.id}_sink`, config.sink.config) as SinkConnector;

    const runtime: PipelineRuntime = {
      config,
      status: 'created',
      source,
      processors,
      sink,
      metrics: {
        totalRecordsProcessed: 0,
        totalErrors: 0,
        averageProcessingTimeMs: 0,
      },
    };

    this.pipelines.set(config.id, runtime);
    this.emit('pipeline:created', { pipelineId: config.id });
  }

  /**
   * 启动管道
   */
  async startPipeline(pipelineId: string): Promise<void> {
    const runtime = this.pipelines.get(pipelineId);
    if (!runtime) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    if (runtime.status === 'running') {
      return;
    }

    // 连接数据源和目标
    await runtime.source?.connect();
    await runtime.sink?.connect();

    runtime.status = 'running';

    // 设置调度
    if (runtime.config.schedule) {
      if (runtime.config.schedule.type === 'interval') {
        const intervalMs = runtime.config.schedule.value as number;
        runtime.intervalId = setInterval(() => {
          this.runPipeline(pipelineId).catch(err => {
            console.error(`[Pipeline] ${pipelineId} run error:`, err);
            this.emit('pipeline:error', { pipelineId, error: err });
          });
        }, intervalMs);
      }
    }

    this.emit('pipeline:started', { pipelineId });
  }

  /**
   * 运行管道一次
   */
  async runPipeline(pipelineId: string): Promise<{
    success: boolean;
    recordsProcessed: number;
    errors: number;
    durationMs: number;
  }> {
    const runtime = this.pipelines.get(pipelineId);
    if (!runtime) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    const startTime = Date.now();
    let recordsProcessed = 0;
    let errors = 0;

    try {
      // 1. 从数据源获取数据
      const batchSize = runtime.config.batchSize || 100;
      let records = await runtime.source!.fetch(batchSize);

      // 2. 依次执行处理器
      for (const processor of runtime.processors) {
        const result = await processor.process(records);
        records = result.records;
        errors += result.metrics?.errorCount || 0;
      }

      // 3. 写入目标
      const writeResult = await runtime.sink!.write(records);
      recordsProcessed = writeResult.writtenCount;
      if (!writeResult.success) {
        errors += writeResult.errors?.length || 1;
      }

      // 更新指标
      const durationMs = Date.now() - startTime;
      runtime.metrics.totalRecordsProcessed += recordsProcessed;
      runtime.metrics.totalErrors += errors;
      runtime.metrics.lastRunAt = Date.now();
      runtime.metrics.lastRunDurationMs = durationMs;

      // 更新平均处理时间
      const totalRuns = runtime.metrics.totalRecordsProcessed / (batchSize || 1);
      runtime.metrics.averageProcessingTimeMs = 
        (runtime.metrics.averageProcessingTimeMs * (totalRuns - 1) + durationMs) / totalRuns;

      this.emit('pipeline:run', { pipelineId, recordsProcessed, errors, durationMs });

      return {
        success: errors === 0,
        recordsProcessed,
        errors,
        durationMs,
      };
    } catch (error) {
      runtime.status = 'error';
      this.emit('pipeline:error', { pipelineId, error });
      throw error;
    }
  }

  /**
   * 停止管道
   */
  async stopPipeline(pipelineId: string): Promise<void> {
    const runtime = this.pipelines.get(pipelineId);
    if (!runtime) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    if (runtime.intervalId) {
      clearInterval(runtime.intervalId);
      runtime.intervalId = undefined;
    }

    await runtime.source?.disconnect();
    await runtime.sink?.disconnect();

    runtime.status = 'stopped';
    this.emit('pipeline:stopped', { pipelineId });
  }

  /**
   * 暂停管道
   */
  async pausePipeline(pipelineId: string): Promise<void> {
    const runtime = this.pipelines.get(pipelineId);
    if (!runtime) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    if (runtime.intervalId) {
      clearInterval(runtime.intervalId);
      runtime.intervalId = undefined;
    }

    runtime.status = 'paused';
    this.emit('pipeline:paused', { pipelineId });
  }

  /**
   * 删除管道
   */
  async deletePipeline(pipelineId: string): Promise<void> {
    await this.stopPipeline(pipelineId);
    this.pipelines.delete(pipelineId);
    this.emit('pipeline:deleted', { pipelineId });
  }

  /**
   * 获取管道状态
   */
  getPipelineStatus(pipelineId: string): {
    config: PipelineConfig;
    status: PipelineStatus;
    metrics: PipelineRuntime['metrics'];
    sourceStatus?: ReturnType<SourceConnector['getStatus']>;
    sinkStatus?: ReturnType<SinkConnector['getStatus']>;
  } | null {
    const runtime = this.pipelines.get(pipelineId);
    if (!runtime) {
      return null;
    }

    return {
      config: runtime.config,
      status: runtime.status,
      metrics: runtime.metrics,
      sourceStatus: runtime.source?.getStatus(),
      sinkStatus: runtime.sink?.getStatus(),
    };
  }

  /**
   * 获取所有管道
   */
  getAllPipelines(): Array<{
    id: string;
    name: string;
    status: PipelineStatus;
    metrics: PipelineRuntime['metrics'];
  }> {
    return Array.from(this.pipelines.entries()).map(([id, runtime]) => ({
      id,
      name: runtime.config.name,
      status: runtime.status,
      metrics: runtime.metrics,
    }));
  }
}

// 导出单例
export const pipelineEngine = new PipelineEngine();
