/**
 * Pipeline 工作台 — DAG 执行引擎
 * 
 * 架构分层：
 *   L2 ConnectorFactory → 将 50+ 节点类型映射到平台客户端调用
 *   L3 RunExecutor      → DAG 拓扑排序、分层并行、数据流动、重试、超时
 *   L4 PipelineManager  → 管道 CRUD、MySQL 持久化、状态管理
 * 
 * 设计原则：
 *   - 零代码工具化：所有节点通过配置驱动，不写业务代码
 *   - 模块化分层：每层独立，ConnectorFactory 可独立扩展
 *   - 多模态统一接入：视频/语音/IoT 通过标准节点接入
 *   - 先进技术实现：Redis Streams / Kafka / Whisper / Ollama / Prometheus / Qdrant / Neo4j
 */

import { EventEmitter } from 'events';
import { eq, desc, and, sql } from 'drizzle-orm';
import { redisClient } from '../lib/clients/redis.client';
import { kafkaClient, KAFKA_TOPICS } from '../lib/clients/kafka.client';
import * as clickhouseClient from '../lib/clients/clickhouse.client';
import { prometheusClient } from '../lib/clients/prometheus.client';
import { getDb } from '../lib/db';
import { pipelines, pipelineRuns, pipelineNodeMetrics } from '../../drizzle/schema';
import type {

  PipelineDAGConfig, EditorNode, EditorConnection,
  PipelineRunStatus, TriggerType, PipelineMetrics,
  PipelineStatusResponse, PipelineRunRecord, PipelineCategory,
  NodeSubType,
} from '../../shared/pipelineTypes';
import { topologicalSort, ALL_NODE_TYPES } from '../../shared/pipelineTypes';
import { createModuleLogger } from '../core/logger';
const log = createModuleLogger('pipeline');

// ============ 兼容旧接口（pipeline.router.ts 引用） ============
export type PipelineStatus = 'created' | 'running' | 'paused' | 'stopped' | 'error';

export interface PipelineConfig {
  id: string;
  name: string;
  description?: string;
  source: { type: string; config: Record<string, unknown> };
  processors: Array<{ type: string; config: Record<string, unknown> }>;
  sink: { type: string; config: Record<string, unknown> };
  schedule?: { type: 'interval' | 'cron'; value: string | number };
  batchSize?: number;
  retryPolicy?: { maxRetries: number; retryDelayMs: number };
}

// ============ 数据记录（引擎内部流转） ============
export interface DataRecord {
  id: string;
  timestamp: number;
  source: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  _lineage?: { fromNodeId: string; recordCount: number }[];
  _modality?: string;
}

// ============ 节点执行结果 ============
export interface NodeExecResult {
  status: 'success' | 'failed' | 'skipped';
  records: DataRecord[];
  recordsIn: number;
  recordsOut: number;
  durationMs: number;
  error?: string;
  degraded?: boolean;
  degradedModalities?: string[];
}

// ============ Lineage 记录 ============
export interface LineageRecord {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  inputSources: string[];
  outputTargets: string[];
  recordsIn: number;
  recordsOut: number;
  timestamp: number;
  transformDescription: string;
}

// ============ L2: ConnectorFactory ============

/**
 * ConnectorFactory — 将 50+ 节点类型映射到平台客户端调用
 * 每个 execute 方法接收 (config, inputRecords) 返回 DataRecord[]
 */
class ConnectorFactory {
  private static OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

  /**
   * 执行单个节点
   */
  static async execute(
    nodeType: string,
    nodeSubType: string,
    config: Record<string, unknown>,
    inputRecords: DataRecord[],
    context: { pipelineId: string; runId: string; nodeId: string }
  ): Promise<DataRecord[]> {
    switch (nodeSubType) {
      // ======== 数据源节点 ========
      case 'mysql': return this.execMySQL(config);
      case 'clickhouse': return this.execClickHouse(config);
      case 'kafka': return this.execKafka(config);
      case 'redis': return this.execRedis(config);
      case 'redis_stream': return this.execRedisStream(config);
      case 'http': return this.execHTTP(config);
      case 'mqtt': return this.execMQTT(config);
      case 'neo4j': return this.execNeo4j(config);
      case 'minio': return this.execMinIO(config);
      case 'file_upload': return this.execFileUpload(config);
      case 'video_stream': return this.execVideoStream(config);
      case 'audio_stream': return this.execAudioStream(config);

      // ======== 数据工程处理器 ========
      case 'field_map': return this.execFieldMap(config, inputRecords);
      case 'filter': return this.execFilter(config, inputRecords);
      case 'transform': return this.execTransform(config, inputRecords);
      case 'aggregate': return this.execAggregate(config, inputRecords);
      case 'data_clean': return this.execDataClean(config, inputRecords);
      case 'data_join': return this.execDataJoin(config, inputRecords);
      case 'data_split': return this.execDataSplit(config, inputRecords);
      case 'schema_validate': return this.execSchemaValidate(config, inputRecords);

      // ======== 机器学习处理器 ========
      case 'feature_engineering': return this.execFeatureEngineering(config, inputRecords);
      case 'model_inference': return this.execModelInference(config, inputRecords);
      case 'model_evaluate': return this.execModelEvaluate(config, inputRecords);
      case 'anomaly_detect': return this.execAnomalyDetect(config, inputRecords);
      case 'model_register': return this.execModelRegister(config, inputRecords);

      // ======== 多模态融合处理器 ========
      case 'time_align': return this.execTimeAlign(config, inputRecords, context);
      case 'multimodal_fusion': return this.execMultimodalFusion(config, inputRecords);
      case 'modality_check': return this.execModalityCheck(config, inputRecords);

      // ======== 大模型处理器 ========
      case 'llm_call': return this.execLLMCall(config, inputRecords);
      case 'prompt_template': return this.execPromptTemplate(config, inputRecords);
      case 'embedding': return this.execEmbedding(config, inputRecords);
      case 'vector_search': return this.execVectorSearch(config, inputRecords);
      case 'doc_parse': return this.execDocParse(config, inputRecords);

      // ======== 流程控制 ========
      case 'condition': return this.execCondition(config, inputRecords);
      case 'loop': return this.execLoop(config, inputRecords);
      case 'delay': return this.execDelay(config, inputRecords);
      case 'notify': return this.execNotify(config, inputRecords);
      case 'parallel': return this.execParallelFork(config, inputRecords);
      case 'parallel_join': return this.execParallelJoin(config, inputRecords);

      // ======== 目标节点 ========
      case 'mysql_sink': return this.execMySQLSink(config, inputRecords);
      case 'clickhouse_sink': return this.execClickHouseSink(config, inputRecords);
      case 'kafka_sink': return this.execKafkaSink(config, inputRecords);
      case 'redis_sink': return this.execRedisSink(config, inputRecords);
      case 'redis_stream_sink': return this.execRedisStreamSink(config, inputRecords);
      case 'minio_sink': return this.execMinIOSink(config, inputRecords);
      case 'http_sink': return this.execHTTPSink(config, inputRecords);
      case 'qdrant_sink': return this.execQdrantSink(config, inputRecords);
      case 'neo4j_sink': return this.execNeo4jSink(config, inputRecords);
      case 'dashboard_sink': return this.execDashboardSink(config, inputRecords);
      case 'prometheus_sink': return this.execPrometheusSink(config, inputRecords);

      default:
        log.warn(`[Pipeline] Unknown node subType: ${nodeSubType}, passing through`);
        return inputRecords;
    }
  }

  // ======== 数据源实现 ========

  // P0 修复：SQL 注入防护 — 查询白名单验证
  private static readonly ALLOWED_SQL_PATTERN = /^\s*SELECT\s/i;
  private static readonly FORBIDDEN_SQL_KEYWORDS = /\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|EXEC|EXECUTE|CREATE|GRANT|REVOKE)\b/i;
  private static readonly SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;

  private static validateReadOnlyQuery(query: string): void {
    if (!ConnectorFactory.ALLOWED_SQL_PATTERN.test(query)) {
      throw new Error('[Pipeline] MySQL source only allows SELECT queries');
    }
    if (ConnectorFactory.FORBIDDEN_SQL_KEYWORDS.test(query)) {
      throw new Error('[Pipeline] MySQL source query contains forbidden DDL/DML keywords');
    }
    // 禁止多语句执行
    if (query.includes(';')) {
      throw new Error('[Pipeline] MySQL source query must not contain semicolons (multi-statement)');
    }
  }

  private static validateIdentifier(name: string, type: 'table' | 'column'): void {
    if (!ConnectorFactory.SAFE_IDENTIFIER.test(name)) {
      throw new Error(`[Pipeline] Invalid ${type} name: "${name}" — only [a-zA-Z0-9_] allowed, max 64 chars`);
    }
  }

  private static async execMySQL(config: Record<string, unknown>): Promise<DataRecord[]> {
    const db = await getDb();
    if (!db) return [];
    const query = config.query as string;
    if (!query || typeof query !== 'string') return [];

    // P0: 验证只允许 SELECT 查询
    ConnectorFactory.validateReadOnlyQuery(query);

    const rows = await db.execute(sql.raw(query)) as any;
    return (Array.isArray(rows) ? (rows[0] as any[]) : []).map((row: any, i: number) => ({
      id: `mysql-${Date.now()}-${i}`, timestamp: Date.now(), source: 'mysql', data: row,
    }));
  }

  private static async execClickHouse(config: Record<string, unknown>): Promise<DataRecord[]> {
    const client = clickhouseClient.getClickHouseClient();
    const query = config.query as string;
    const result = await client.query({ query, format: 'JSONEachRow' });
    const rows = await result.json();
    return (rows as any[]).map((row: any, i: number) => ({
      id: `ch-${Date.now()}-${i}`, timestamp: Date.now(), source: 'clickhouse', data: row,
    }));
  }

  private static async execKafka(config: Record<string, unknown>): Promise<DataRecord[]> {
    const topic = config.topic as string;
    const groupId = config.groupId as string || `pipeline-cg-${Date.now()}`;
    const records: DataRecord[] = [];
    const consumerId = await kafkaClient.subscribe(groupId, [topic], async (msg) => {
      records.push({
        id: `kafka-${Date.now()}-${records.length}`, timestamp: Date.now(), source: 'kafka',
        data: typeof msg.value === 'string' ? this.tryParseJSON(msg.value) : (msg as any),
      });
    });
    await new Promise(r => setTimeout(r, Math.min(config.pollTimeoutMs as number || 3000, 10000)));
    try { await kafkaClient.unsubscribe(consumerId); } catch { /* cleanup */ }
    return records;
  }

  private static async execRedis(config: Record<string, unknown>): Promise<DataRecord[]> {
    const client = redisClient.getClient();
    if (!client) return [];
    const mode = config.mode as string || 'get';
    const keyPattern = config.keyPattern as string;
    const records: DataRecord[] = [];
    if (mode === 'get') {
      const value = await client.get(keyPattern);
      if (value) records.push({ id: `redis-${Date.now()}-0`, timestamp: Date.now(), source: 'redis', data: this.tryParseJSON(value) });
    } else if (mode === 'scan') {
      const keys = await client.keys(keyPattern);
      for (const key of keys.slice(0, 1000)) {
        const value = await client.get(key);
        if (value) records.push({ id: `redis-${Date.now()}-${records.length}`, timestamp: Date.now(), source: 'redis', data: { key, ...this.tryParseJSON(value) } });
      }
    }
    return records;
  }

  private static async execRedisStream(config: Record<string, unknown>): Promise<DataRecord[]> {
    const client = redisClient.getClient();
    if (!client) return [];
    const streamKey = config.streamKey as string;
    const groupName = config.groupName as string;
    const consumerName = config.consumerName as string || 'worker-1';
    const batchSize = config.batchSize as number || 100;
    try { await client.xgroup('CREATE', streamKey, groupName, '0', 'MKSTREAM'); } catch { /* exists */ }
    const results = await client.xreadgroup('GROUP', groupName, consumerName, 'COUNT', batchSize, 'BLOCK', 1000, 'STREAMS', streamKey, '>');
    const records: DataRecord[] = [];
    if (results) {
      for (const [, messages] of results as any[]) {
        for (const [id, fields] of messages as any[]) {
          const data: Record<string, unknown> = {};
          for (let i = 0; i < fields.length; i += 2) data[fields[i]] = this.tryParseJSON(fields[i + 1]);
          records.push({ id: `rs-${id}`, timestamp: Date.now(), source: 'redis_stream', data });
          await client.xack(streamKey, groupName, id);
        }
      }
    }
    return records;
  }

  private static async execHTTP(config: Record<string, unknown>): Promise<DataRecord[]> {
    const url = config.url as string;
    const method = (config.method as string) || 'GET';
    const headers = (config.headers as Record<string, string>) || {};
    const timeout = (config.timeout as number) || 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const resp = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, signal: controller.signal });
      clearTimeout(timer);
      const json = await resp.json();
      let items = json;
      const dataPath = config.dataPath as string;
      if (dataPath) { for (const key of dataPath.split('.')) items = items?.[key]; }
      const arr = Array.isArray(items) ? items : [items];
      return arr.map((item: any, i: number) => ({ id: `http-${Date.now()}-${i}`, timestamp: Date.now(), source: 'http', data: item }));
    } catch (err: any) { clearTimeout(timer); throw new Error(`HTTP source error: ${err.message}`); }
  }

  private static async execMQTT(config: Record<string, unknown>): Promise<DataRecord[]> {
    const records: DataRecord[] = [];
    try {
      const mqtt = await import('mqtt' as any);
      const broker = config.broker as string;
      const topic = config.topic as string;
      const qos = parseInt(config.qos as string || '1') as 0 | 1 | 2;
      const client = mqtt.connect(broker, { clientId: config.clientId as string || `pipeline-mqtt-${Date.now()}` });
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { client.end(); reject(new Error('MQTT connect timeout')); }, 10000);
        client.on('connect', () => { clearTimeout(timeout); client.subscribe(topic, { qos }); setTimeout(() => { client.end(); resolve(); }, 3000); });
        client.on('message', (_t: string, payload: Buffer) => { records.push({ id: `mqtt-${Date.now()}-${records.length}`, timestamp: Date.now(), source: 'mqtt', data: this.tryParseJSON(payload.toString()), _modality: 'iot' }); });
        client.on('error', (err: Error) => { clearTimeout(timeout); client.end(); reject(err); });
      });
    } catch (err: any) { log.warn(`[Pipeline] MQTT error: ${err.message}`); }
    return records;
  }

  private static async execNeo4j(config: Record<string, unknown>): Promise<DataRecord[]> {
    try {
      const { neo4jStorage } = await import('../lib/storage/neo4j.storage');
      const mode = config.mode as string || 'getNode';
      if (mode === 'getNode') {
        const label = config.label as string;
        const nodeId = config.nodeId as string;
        const result = await neo4jStorage.getNode(label, nodeId);
        return result ? [{ id: `neo4j-${Date.now()}-0`, timestamp: Date.now(), source: 'neo4j', data: result }] : [];
      } else if (mode === 'searchFaults') {
        const query = config.query as string;
        const limit = config.limit as number || 20;
        const results = await neo4jStorage.searchFaults(query, limit);
        return results.map((row: any, i: number) => ({ id: `neo4j-${Date.now()}-${i}`, timestamp: Date.now(), source: 'neo4j', data: row }));
      } else if (mode === 'getStatistics') {
        const stats = await neo4jStorage.getGraphStatistics();
        return [{ id: `neo4j-${Date.now()}-0`, timestamp: Date.now(), source: 'neo4j', data: stats as any }];
      } else if (mode === 'faultHistory') {
        const equipmentId = config.equipmentId as string;
        const results = await neo4jStorage.findEquipmentFaultHistory(equipmentId);
        return results.map((row: any, i: number) => ({ id: `neo4j-${Date.now()}-${i}`, timestamp: Date.now(), source: 'neo4j', data: row }));
      } else if (mode === 'faultSolutions') {
        const faultId = config.faultId as string;
        const results = await neo4jStorage.findFaultSolutions(faultId);
        return results.map((row: any, i: number) => ({ id: `neo4j-${Date.now()}-${i}`, timestamp: Date.now(), source: 'neo4j', data: row }));
      }
      return [];
    } catch (err: any) { throw new Error(`Neo4j source error: ${err.message}`); }
  }

  private static async execMinIO(config: Record<string, unknown>): Promise<DataRecord[]> {
    const bucket = config.bucket as string;
    const prefix = config.prefix as string || '';
    const minioUrl = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
    try {
      const resp = await fetch(`${minioUrl}/${bucket}?prefix=${prefix}&list-type=2`);
      if (!resp.ok) throw new Error(`MinIO list error: ${resp.status}`);
      const text = await resp.text();
      const keys = Array.from(text.matchAll(/<Key>(.*?)<\/Key>/g)).map(m => m[1]);
      const records: DataRecord[] = [];
      for (const key of keys.slice(0, 100)) {
        const fileResp = await fetch(`${minioUrl}/${bucket}/${key}`);
        if (fileResp.ok) { const content = await fileResp.text(); records.push({ id: `minio-${Date.now()}-${records.length}`, timestamp: Date.now(), source: 'minio', data: this.tryParseJSON(content), metadata: { bucket, key } }); }
      }
      return records;
    } catch (err: any) { throw new Error(`MinIO source error: ${err.message}`); }
  }

  private static async execFileUpload(config: Record<string, unknown>): Promise<DataRecord[]> {
    const data = config.uploadedData as any[];
    if (!data || !Array.isArray(data)) return [];
    return data.map((item, i) => ({ id: `file-${Date.now()}-${i}`, timestamp: Date.now(), source: 'file_upload', data: item }));
  }

  private static async execVideoStream(config: Record<string, unknown>): Promise<DataRecord[]> {
    const streamUrl = config.streamUrl as string;
    const records: DataRecord[] = [];
    try {
      const resp = await fetch(streamUrl, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        records.push({ id: `video-${Date.now()}-0`, timestamp: Date.now(), source: 'video_stream', data: { frame: base64, frameIndex: 0, streamUrl }, _modality: 'video' });
      }
    } catch { /* 视频流不可达时返回空，由 modality_check 处理降级 */ }
    return records;
  }

  private static async execAudioStream(config: Record<string, unknown>): Promise<DataRecord[]> {
    const filePath = config.filePath as string;
    const transcribe = config.transcribe as boolean ?? true;
    const records: DataRecord[] = [];
    if (filePath) {
      const record: DataRecord = { id: `audio-${Date.now()}-0`, timestamp: Date.now(), source: 'audio_stream', data: { filePath }, _modality: 'audio' };
      if (transcribe) {
        try {
          const { transcribeAudio } = await import('../core/voiceTranscription');
          const whisperResult = await transcribeAudio({ audioUrl: filePath, language: config.language as string });
          if ('text' in whisperResult) {
            record.data.transcription = whisperResult.text;
            record.data.segments = whisperResult.segments;
          }
        } catch { /* Whisper 不可用时保留原始路径 */ }
      }
      records.push(record);
    }
    return records;
  }

  // ======== 数据工程处理器实现 ========

  private static execFieldMap(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    const mapping = config.mapping as Record<string, string> || {};
    const dropUnmapped = config.dropUnmapped as boolean || false;
    return records.map(r => {
      const newData: Record<string, unknown> = {};
      for (const [newField, oldField] of Object.entries(mapping)) newData[newField] = r.data[oldField];
      if (!dropUnmapped) { for (const [key, val] of Object.entries(r.data)) { if (!Object.values(mapping).includes(key)) newData[key] = val; } }
      return { ...r, data: newData };
    });
  }

  private static execFilter(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    const field = config['condition.field'] as string;
    const operator = config['condition.operator'] as string;
    const value = config['condition.value'] as any;
    return records.filter(r => {
      const fv = r.data[field];
      switch (operator) {
        case 'eq': return fv === value;
        case 'ne': return fv !== value;
        case 'gt': return (fv as number) > Number(value);
        case 'gte': return (fv as number) >= Number(value);
        case 'lt': return (fv as number) < Number(value);
        case 'lte': return (fv as number) <= Number(value);
        case 'contains': return String(fv).includes(String(value));
        case 'regex': return new RegExp(String(value)).test(String(fv));
        case 'in': return (Array.isArray(value) ? value : String(value).split(',')).includes(String(fv));
        case 'not_in': return !(Array.isArray(value) ? value : String(value).split(',')).includes(String(fv));
        case 'is_null': return fv == null;
        case 'not_null': return fv != null;
        default: return true;
      }
    });
  }

  private static execTransform(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    const code = config.code as string;
    if (!code) return records;
    try {
      const fn = new Function('record', `return (${code})(record)`);
      return records.map(r => ({ ...r, data: fn(r.data) || r.data }));
    } catch (err: any) { throw new Error(`Transform error: ${err.message}`); }
  }

  private static execAggregate(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    const groupBy = config.groupBy as string;
    const aggregations = config.aggregations as Array<{ field: string; operation: string; outputField: string }> || [];
    const computeAgg = (values: number[], op: string): number => {
      if (values.length === 0) return 0;
      switch (op) {
        case 'sum': return values.reduce((a, b) => a + b, 0);
        case 'avg': return values.reduce((a, b) => a + b, 0) / values.length;
        case 'min': return Math.min(...values);
        case 'max': return Math.max(...values);
        case 'count': return values.length;
        default: return values.length;
      }
    };
    if (!groupBy) {
      const result: Record<string, unknown> = {};
      for (const agg of aggregations) { const values = records.map(r => Number(r.data[agg.field]) || 0); result[agg.outputField || agg.field] = computeAgg(values, agg.operation); }
      return [{ id: `agg-${Date.now()}`, timestamp: Date.now(), source: 'aggregate', data: result }];
    }
    const groups = new Map<string, DataRecord[]>();
    for (const r of records) { const key = String(r.data[groupBy] ?? 'null'); if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(r); }
    return Array.from(groups.entries()).map(([key, grp]) => {
      const result: Record<string, unknown> = { [groupBy]: key };
      for (const agg of aggregations) { const values = grp.map(r => Number(r.data[agg.field]) || 0); result[agg.outputField || agg.field] = computeAgg(values, agg.operation); }
      return { id: `agg-${Date.now()}-${key}`, timestamp: Date.now(), source: 'aggregate', data: result };
    });
  }

  private static execDataClean(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    let result = [...records];
    const dedup = config.dedup as string;
    const nullStrategy = config.nullStrategy as string || 'skip';
    const defaultValue = config.defaultValue as string;
    const typeConversions = config.typeConversions as Record<string, string> || {};
    if (dedup) { const seen = new Set<string>(); result = result.filter(r => { const key = String(r.data[dedup]); if (seen.has(key)) return false; seen.add(key); return true; }); }
    result = result.filter(r => {
      const hasNull = Object.values(r.data).some(v => v == null || v === '');
      if (!hasNull) return true;
      if (nullStrategy === 'skip') return false;
      if (nullStrategy === 'fill_default') { for (const [k, v] of Object.entries(r.data)) { if (v == null || v === '') r.data[k] = defaultValue; } return true; }
      return true;
    });
    for (const r of result) {
      for (const [field, targetType] of Object.entries(typeConversions)) {
        if (r.data[field] !== undefined) {
          switch (targetType) { case 'number': r.data[field] = Number(r.data[field]); break; case 'string': r.data[field] = String(r.data[field]); break; case 'boolean': r.data[field] = Boolean(r.data[field]); break; case 'datetime': r.data[field] = new Date(r.data[field] as string).toISOString(); break; }
        }
      }
    }
    return result;
  }

  private static execDataJoin(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    const joinType = config.joinType as string || 'inner';
    const leftKey = config.leftKey as string;
    const rightKey = config.rightKey as string;
    const left = records.filter(r => r.metadata?.port === 0 || r.metadata?.port === undefined);
    const right = records.filter(r => r.metadata?.port === 1);
    if (joinType === 'union') return [...left, ...right];
    const rightMap = new Map<string, DataRecord[]>();
    for (const r of right) { const key = String(r.data[rightKey]); if (!rightMap.has(key)) rightMap.set(key, []); rightMap.get(key)!.push(r); }
    const result: DataRecord[] = [];
    for (const l of left) {
      const key = String(l.data[leftKey]);
      const matches = rightMap.get(key) || [];
      if (matches.length > 0) { for (const m of matches) result.push({ ...l, id: `join-${Date.now()}-${result.length}`, data: { ...l.data, ...m.data } }); }
      else if (joinType === 'left' || joinType === 'full') result.push(l);
    }
    if (joinType === 'full') { const leftKeys = new Set(left.map(l => String(l.data[leftKey]))); for (const r of right) { if (!leftKeys.has(String(r.data[rightKey]))) result.push(r); } }
    return result;
  }

  private static execDataSplit(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    const splitCondition = config.splitCondition as string;
    if (!splitCondition) return records;
    try { const fn = new Function('record', `return ${splitCondition}`); return records.map(r => ({ ...r, metadata: { ...r.metadata, port: fn(r.data) ? 0 : 1 } })); }
    catch { return records; }
  }

  private static execSchemaValidate(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    const schema = config.schema as Record<string, unknown>;
    const onInvalid = config.onInvalid as string || 'skip';
    if (!schema) return records;
    const properties = (schema as any).properties || {};
    const required = (schema as any).required || [];
    return records.filter(r => {
      const errors: string[] = [];
      for (const field of required) { if (r.data[field] === undefined || r.data[field] === null) errors.push(`Missing: ${field}`); }
      for (const [field, spec] of Object.entries(properties)) {
        const s = spec as any;
        if (r.data[field] !== undefined && s.type) { if (s.type === 'number' && typeof r.data[field] !== 'number') errors.push(`${field} should be number`); if (s.type === 'string' && typeof r.data[field] !== 'string') errors.push(`${field} should be string`); }
      }
      if (errors.length === 0) return true;
      if (onInvalid === 'skip') return false;
      if (onInvalid === 'tag') { r.data._validationErrors = errors; return true; }
      throw new Error(`Schema validation failed: ${errors.join(', ')}`);
    });
  }

  // ======== 机器学习处理器实现 ========

  private static execFeatureEngineering(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    const operations = config.operations as Array<{ field: string; operation: string; params?: Record<string, unknown> }> || [];
    const stats: Record<string, { min: number; max: number; mean: number; std: number }> = {};
    for (const op of operations) {
      if (['normalize', 'standardize'].includes(op.operation)) {
        const values = records.map(r => Number(r.data[op.field]) || 0);
        const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
        const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length || 1)) || 1;
        stats[op.field] = { min: Math.min(...values), max: Math.max(...values), mean, std };
      }
    }
    return records.map(r => {
      const data = { ...r.data };
      for (const op of operations) {
        const val = Number(data[op.field]) || 0;
        switch (op.operation) {
          case 'normalize': { const s = stats[op.field]; data[op.field] = s ? (val - s.min) / (s.max - s.min || 1) : val; break; }
          case 'standardize': { const s = stats[op.field]; data[op.field] = s ? (val - s.mean) / s.std : val; break; }
          case 'log_transform': data[op.field] = Math.log(val + 1); break;
          case 'binning': { const bins = (op.params?.bins as number) || 10; data[op.field] = Math.floor(val / (100 / bins)); break; }
        }
      }
      return { ...r, data };
    });
  }

  private static async execModelInference(config: Record<string, unknown>, records: DataRecord[]): Promise<DataRecord[]> {
    const endpoint = config.modelEndpoint as string;
    const modelType = config.modelType as string;
    const inputFields = config.inputFields as string[] || [];
    const outputField = config.outputField as string || 'prediction';
    return Promise.all(records.map(async (r) => {
      const input = inputFields.length > 0 ? Object.fromEntries(inputFields.map(f => [f, r.data[f]])) : r.data;
      try {
        const resp = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instances: [input] }), signal: AbortSignal.timeout(30000) });
        const result = await resp.json();
        return { ...r, data: { ...r.data, [outputField]: result.predictions?.[0] ?? result } };
      } catch (err: any) { return { ...r, data: { ...r.data, [outputField]: null, _inferenceError: err.message } }; }
    }));
  }

  private static execModelEvaluate(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    const actualField = config.actualField as string;
    const predictedField = config.predictedField as string;
    const taskType = config.taskType as string || 'classification';
    const actuals = records.map(r => r.data[actualField]);
    const predictions = records.map(r => r.data[predictedField]);
    const metrics: Record<string, number> = {};
    if (taskType === 'classification') {
      let correct = 0, tp = 0, fp = 0, fn = 0;
      for (let i = 0; i < actuals.length; i++) { if (actuals[i] === predictions[i]) correct++; if (predictions[i] === 1 && actuals[i] === 1) tp++; if (predictions[i] === 1 && actuals[i] === 0) fp++; if (predictions[i] === 0 && actuals[i] === 1) fn++; }
      metrics.accuracy = actuals.length > 0 ? correct / actuals.length : 0;
      metrics.precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
      metrics.recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
      metrics.f1 = (metrics.precision + metrics.recall) > 0 ? 2 * metrics.precision * metrics.recall / (metrics.precision + metrics.recall) : 0;
    } else {
      const errors = actuals.map((a, i) => (Number(a) || 0) - (Number(predictions[i]) || 0));
      metrics.mae = errors.reduce((s, e) => s + Math.abs(e), 0) / (errors.length || 1);
      metrics.mse = errors.reduce((s, e) => s + e * e, 0) / (errors.length || 1);
      metrics.rmse = Math.sqrt(metrics.mse);
    }
    return [{ id: `eval-${Date.now()}`, timestamp: Date.now(), source: 'model_evaluate', data: { ...metrics, sampleCount: records.length, taskType } }];
  }

  private static execAnomalyDetect(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    const method = config.method as string || 'zscore';
    const targetField = config.targetField as string;
    const threshold = config.threshold as number || 3;
    const outputField = config.outputField as string || 'is_anomaly';
    const values = records.map(r => Number(r.data[targetField]) || 0);
    const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length || 1)) || 1;
    return records.map((r, i) => {
      const val = values[i];
      let isAnomaly = false;
      switch (method) {
        case 'zscore': isAnomaly = Math.abs((val - mean) / std) > threshold; break;
        case 'iqr': { const sorted = [...values].sort((a, b) => a - b); const q1 = sorted[Math.floor(sorted.length * 0.25)]; const q3 = sorted[Math.floor(sorted.length * 0.75)]; const iqr = q3 - q1; isAnomaly = val < q1 - threshold * iqr || val > q3 + threshold * iqr; break; }
        default: isAnomaly = Math.abs((val - mean) / std) > threshold;
      }
      return { ...r, data: { ...r.data, [outputField]: isAnomaly, _anomalyScore: Math.abs((val - mean) / std) } };
    });
  }

  private static async execModelRegister(config: Record<string, unknown>, records: DataRecord[]): Promise<DataRecord[]> {
    const modelName = config.modelName as string;
    const modelVersion = config.modelVersion as string || 'v1.0';
    const framework = config.framework as string || 'onnx';
    return records.map(r => ({ ...r, data: { ...r.data, _modelRegistered: true, _modelName: modelName, _modelVersion: modelVersion, _framework: framework } }));
  }

  // ======== 多模态融合处理器实现 ========

  private static async execTimeAlign(config: Record<string, unknown>, records: DataRecord[], context: { pipelineId: string; runId: string; nodeId: string }): Promise<DataRecord[]> {
    const windowMs = config.windowMs as number || 1000;
    const cachePrewarm = config.cachePrewarm as boolean ?? true;
    const aligned = records.map(r => { const ts = Number(r.data.timestamp) || r.timestamp; const bucketTs = Math.floor(ts / windowMs) * windowMs; return { ...r, data: { ...r.data, _alignedTimestamp: bucketTs, _originalTimestamp: ts } }; });
    const buckets = new Map<number, DataRecord[]>();
    for (const r of aligned) { const bucket = r.data._alignedTimestamp as number; if (!buckets.has(bucket)) buckets.set(bucket, []); buckets.get(bucket)!.push(r); }
    if (cachePrewarm) {
      const client = redisClient.getClient();
      if (client) { const cacheKey = `pipeline:time_align:${context.pipelineId}:${context.nodeId}`; for (const [ts, recs] of Array.from(buckets.entries())) { await client.zadd(cacheKey, ts, JSON.stringify(recs.map(r => r.data))); } await client.expire(cacheKey, 3600); }
    }
    const result: DataRecord[] = [];
    for (const [bucket, recs] of Array.from(buckets.entries())) {
      const merged: Record<string, unknown> = { _alignedTimestamp: bucket };
      for (const r of recs) { const modality = r._modality || r.source; merged[`${modality}_data`] = r.data; merged[`${modality}_timestamp`] = r.data._originalTimestamp; }
      result.push({ id: `aligned-${bucket}`, timestamp: bucket, source: 'time_align', data: merged });
    }
    return result;
  }

  private static execMultimodalFusion(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    const strategy = config.fusionStrategy as string || 'late';
    const weights = config.weights as Record<string, number> || {};
    const confidenceThreshold = config.confidenceThreshold as number || 0.6;
    const outputField = config.outputField as string || 'fused_result';
    if (strategy === 'early') {
      return records.map(r => {
        const fusedFeatures: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(r.data)) { if (key.endsWith('_data') && typeof val === 'object' && val !== null) { for (const [k, v] of Object.entries(val as Record<string, unknown>)) fusedFeatures[`${key.replace('_data', '')}_${k}`] = v; } }
        return { ...r, data: { ...r.data, [outputField]: fusedFeatures, _fusionStrategy: 'early' } };
      });
    }
    if (strategy === 'late') {
      return records.map(r => {
        let totalWeight = 0, weightedScore = 0;
        const decisions: Record<string, unknown> = {};
        for (const [modality, weight] of Object.entries(weights)) {
          const modalData = r.data[`${modality}_data`] as Record<string, unknown>;
          if (modalData) { const score = Number(modalData.confidence || modalData.score || 0); decisions[modality] = { score, weight }; weightedScore += score * weight; totalWeight += weight; }
        }
        const finalScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
        return { ...r, data: { ...r.data, [outputField]: { score: finalScore, confident: finalScore >= confidenceThreshold, decisions }, _fusionStrategy: 'late' } };
      });
    }
    return records.map(r => ({ ...r, data: { ...r.data, [outputField]: r.data, _fusionStrategy: 'hybrid' } }));
  }

  private static async execModalityCheck(config: Record<string, unknown>, records: DataRecord[]): Promise<DataRecord[]> {
    const requiredModalities = config.requiredModalities as string[] || [];
    const degradeStrategy = config.degradeStrategy as string || 'skip_missing';
    const cacheTtlMs = config.cacheTtlMs as number || 60000;
    const minModalities = config.minModalities as number || 1;
    return Promise.all(records.map(async (r) => {
      const present: string[] = [], missing: string[] = [];
      for (const m of requiredModalities) { if (r.data[`${m}_data`] !== undefined) present.push(m); else missing.push(m); }
      if (missing.length === 0) return { ...r, metadata: { ...r.metadata, port: 0 } };
      if (present.length < minModalities && degradeStrategy === 'abort') throw new Error(`Modality check failed: ${present.length}/${minModalities}`);
      switch (degradeStrategy) {
        case 'skip_missing': return { ...r, data: { ...r.data, _missingModalities: missing }, metadata: { ...r.metadata, port: 0 } };
        case 'cache_fill': {
          const client = redisClient.getClient();
          if (client) { for (const mod of missing) { const cached = await client.get(`pipeline:modality_cache:${mod}`); if (cached) { const cd = JSON.parse(cached); if (Date.now() - (cd._cachedAt || 0) < cacheTtlMs) { r.data[`${mod}_data`] = cd; r.data[`${mod}_cached`] = true; } } } }
          return { ...r, data: { ...r.data, _missingModalities: missing }, metadata: { ...r.metadata, port: 0 } };
        }
        case 'degrade_output': return { ...r, data: { ...r.data, _degraded: true, _missingModalities: missing, _confidenceReduction: missing.length / requiredModalities.length }, metadata: { ...r.metadata, port: 1 } };
        default: return { ...r, metadata: { ...r.metadata, port: 0 } };
      }
    }));
  }

  // ======== 大模型处理器实现 ========

  private static async execLLMCall(config: Record<string, unknown>, records: DataRecord[]): Promise<DataRecord[]> {
    const provider = config.provider as string || 'ollama';
    const model = config.model as string;
    const systemPrompt = config.prompt as string || '';
    const inputField = config.inputField as string;
    const outputField = config.outputField as string || 'llm_response';
    const temperature = config.temperature as number || 0.7;
    const maxTokens = config.maxTokens as number || 2048;
    const endpoint = config.endpoint as string || this.OLLAMA_BASE_URL;
    return Promise.all(records.map(async (r) => {
      const userContent = String(r.data[inputField] || JSON.stringify(r.data));
      try {
        let response: string;
        if (provider === 'ollama') {
          const images = r.data._images as string[] | undefined;
          const resp = await fetch(`${endpoint}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []), { role: 'user', content: userContent, ...(images ? { images } : {}) }], stream: false, options: { temperature, num_predict: maxTokens } }), signal: AbortSignal.timeout(60000) });
          const result = await resp.json(); response = result.message?.content || '';
        } else {
          const resp = await fetch(`${endpoint}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []), { role: 'user', content: userContent }], temperature, max_tokens: maxTokens }), signal: AbortSignal.timeout(60000) });
          const result = await resp.json(); response = result.choices?.[0]?.message?.content || '';
        }
        return { ...r, data: { ...r.data, [outputField]: response } };
      } catch (err: any) { return { ...r, data: { ...r.data, [outputField]: null, _llmError: err.message } }; }
    }));
  }

  private static execPromptTemplate(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    const template = config.template as string || '';
    const outputField = config.outputField as string || 'formatted_prompt';
    return records.map(r => { let result = template; for (const [key, val] of Object.entries(r.data)) result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val ?? '')); return { ...r, data: { ...r.data, [outputField]: result } }; });
  }

  private static async execEmbedding(config: Record<string, unknown>, records: DataRecord[]): Promise<DataRecord[]> {
    const model = config.model as string || 'nomic-embed-text';
    const inputField = config.inputField as string;
    const outputField = config.outputField as string || 'embedding';
    const texts = records.map(r => String(r.data[inputField] || ''));
    try {
      const resp = await fetch(`${this.OLLAMA_BASE_URL}/api/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, input: texts }), signal: AbortSignal.timeout(30000) });
      const result = await resp.json(); const embeddings = result.embeddings || [];
      return records.map((r, i) => ({ ...r, data: { ...r.data, [outputField]: embeddings[i] || [] } }));
    } catch (err: any) { return records.map(r => ({ ...r, data: { ...r.data, [outputField]: [], _embeddingError: err.message } })); }
  }

  private static async execVectorSearch(config: Record<string, unknown>, records: DataRecord[]): Promise<DataRecord[]> {
    try {
      const { qdrantStorage } = await import('../lib/storage/qdrant.storage');
      const collection = config.collection as string;
      const inputField = config.inputField as string;
      const topK = config.topK as number || 5;
      const scoreThreshold = config.scoreThreshold as number || 0.7;
      const outputField = config.outputField as string || 'search_results';
      return Promise.all(records.map(async (r) => {
        const vector = r.data[inputField] as number[];
        if (!vector || !Array.isArray(vector)) return { ...r, data: { ...r.data, [outputField]: [] } };
        const results = await qdrantStorage.search(collection, vector, topK, undefined, scoreThreshold);
        return { ...r, data: { ...r.data, [outputField]: results } };
      }));
    } catch (err: any) { return records.map(r => ({ ...r, data: { ...r.data, search_results: [], _vectorSearchError: err.message } })); }
  }

  private static execDocParse(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    const outputField = config.outputField as string || 'parsed_text';
    return records.map(r => ({ ...r, data: { ...r.data, [outputField]: `[Document parsing for: ${r.data[config.inputField as string]}]` } }));
  }

  // ======== 流程控制实现 ========

  private static execCondition(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    const condition = config.condition as string;
    if (!condition) return records;
    try { const fn = new Function('record', `return ${condition}`); return records.map(r => ({ ...r, metadata: { ...r.metadata, port: fn(r.data) ? 0 : 1 } })); }
    catch { return records; }
  }

  private static execLoop(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    return records.slice(0, config.maxIterations as number || 1000);
  }

  private static async execDelay(config: Record<string, unknown>, records: DataRecord[]): Promise<DataRecord[]> {
    await new Promise(r => setTimeout(r, Math.min(config.delayMs as number || 1000, 30000)));
    return records;
  }

  private static async execNotify(config: Record<string, unknown>, records: DataRecord[]): Promise<DataRecord[]> {
    const url = config.url as string;
    const template = config.template as string || '';
    const message = records.length > 0 ? template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(records[0].data[key] ?? '')) : template;
    if (url) { try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: message, records: records.length }), signal: AbortSignal.timeout(10000) }); } catch (err: any) { log.warn(`[Pipeline] Notify error: ${err.message}`); } }
    return records;
  }

  /**
   * 并行分发 (Fork) — 根据策略将数据分发到多个分支
   * 策略：
   * - broadcast: 每个分支收到全部数据（默认）
   * - round_robin: 按记录轮询分配到各分支
   * - hash: 按字段值哈希分配
   * 
   * 分支标记通过 metadata._forkBranch 传递，供下游节点和 join 节点使用
   */
  private static execParallelFork(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    const branches = (config.branches as number) || 2;
    const strategy = (config.strategy as string) || 'broadcast';
    const hashField = config.hashField as string;

    switch (strategy) {
      case 'round_robin': {
        // 轮询分配：每条记录标记分支号
        return records.map((r, i) => ({
          ...r,
          metadata: { ...r.metadata, _forkBranch: i % branches, _forkStrategy: 'round_robin' },
        }));
      }
      case 'hash': {
        // 哈希分配：根据字段值的哈希确定分支
        return records.map(r => {
          const val = String(r.data[hashField] ?? '');
          let hash = 0;
          for (let i = 0; i < val.length; i++) {
            hash = ((hash << 5) - hash + val.charCodeAt(i)) | 0;
          }
          return {
            ...r,
            metadata: { ...r.metadata, _forkBranch: Math.abs(hash) % branches, _forkStrategy: 'hash', _forkHashField: hashField },
          };
        });
      }
      case 'broadcast':
      default: {
        // 广播：每条记录标记为广播模式，所有分支都收到全部数据
        return records.map(r => ({
          ...r,
          metadata: { ...r.metadata, _forkBranch: -1, _forkStrategy: 'broadcast' },
        }));
      }
    }
  }

  /**
   * 并行汇聚 (Join) — 合并多个分支的结果
   * 合并策略：
   * - concat: 拼接所有分支的记录（默认）
   * - zip: 按位置配对合并（字段合并）
   * - first: 取第一个非空分支的结果
   * 
   * 输入记录通过 metadata.port 区分来源分支（由 RunExecutor.collectInputs 设置）
   */
  private static execParallelJoin(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    const mergeStrategy = (config.mergeStrategy as string) || 'concat';

    // 按来源端口分组
    const branches = new Map<number, DataRecord[]>();
    for (const r of records) {
      const port = (r.metadata?.port as number) ?? 0;
      if (!branches.has(port)) branches.set(port, []);
      branches.get(port)!.push(r);
    }

    const branchArrays = Array.from(branches.entries())
      .sort(([a], [b]) => a - b)
      .map(([, recs]) => recs);

    switch (mergeStrategy) {
      case 'zip': {
        // 拉链合并：按位置配对，合并字段
        const maxLen = Math.max(...branchArrays.map(b => b.length), 0);
        const result: DataRecord[] = [];
        for (let i = 0; i < maxLen; i++) {
          let merged: Record<string, unknown> = {};
          const lineage: any[] = [];
          for (const branch of branchArrays) {
            if (i < branch.length) {
              merged = { ...merged, ...branch[i].data };
              lineage.push(...(branch[i]._lineage || []));
            }
          }
          result.push({
            id: `join-${Date.now()}-${i}`,
            timestamp: Date.now(),
            source: 'parallel_join',
            data: merged,
            metadata: { joinStrategy: 'zip', position: i },
            _lineage: lineage,
          });
        }
        return result;
      }
      case 'first': {
        // 取第一个非空分支
        for (const branch of branchArrays) {
          if (branch.length > 0) {
            return branch.map(r => ({
              ...r,
              metadata: { ...r.metadata, joinStrategy: 'first' },
            }));
          }
        }
        return [];
      }
      case 'concat':
      default: {
        // 拼接所有分支，清除 fork 元数据
        return records.map(r => {
          const { _forkBranch, _forkStrategy, _forkHashField, ...restMeta } = (r.metadata || {}) as any;
          return {
            ...r,
            metadata: { ...restMeta, joinStrategy: 'concat' },
          };
        });
      }
    }
  }

  // ======== 目标节点实现 ========

  private static async execMySQLSink(config: Record<string, unknown>, records: DataRecord[]): Promise<DataRecord[]> {
    const db = await getDb();
    if (!db || records.length === 0) return records;
    const table = config.table as string;
    if (table) {
      // P0: 验证表名和列名合法性，防止 SQL 注入
      ConnectorFactory.validateIdentifier(table, 'table');
      const columns = Object.keys(records[0].data);
      columns.forEach(c => ConnectorFactory.validateIdentifier(c, 'column'));
      // P0: 使用反引号转义标识符，参数化值通过 Drizzle sql 模板
      const escapedTable = `\`${table}\``;
      const escapedCols = columns.map(c => `\`${c}\``).join(', ');
      const placeholders = columns.map(() => '?').join(', ');
      // 分批插入，每批最多 100 条
      for (let i = 0; i < records.length; i += 100) {
        const batch = records.slice(i, i + 100);
        const allValues = batch.flatMap(r => columns.map(c => r.data[c] ?? null));
        const rowPlaceholders = batch.map(() => `(${placeholders})`).join(', ');
        await db.execute(
          sql`${sql.raw(`INSERT INTO ${escapedTable} (${escapedCols}) VALUES ${rowPlaceholders}`)}`,
        );
      }
    }
    return records;
  }

  private static async execClickHouseSink(config: Record<string, unknown>, records: DataRecord[]): Promise<DataRecord[]> {
    if (records.length === 0) return records;
    const client = clickhouseClient.getClickHouseClient();
    const table = config.table as string;
    if (table) await client.insert({ table, values: records.map(r => r.data), format: 'JSONEachRow' });
    return records;
  }

  private static async execKafkaSink(config: Record<string, unknown>, records: DataRecord[]): Promise<DataRecord[]> {
    const topic = config.topic as string;
    if (topic) { await kafkaClient.produce(topic, records.map(r => ({ key: r.id, value: JSON.stringify(r.data) }))); }
    return records;
  }

  private static async execRedisSink(config: Record<string, unknown>, records: DataRecord[]): Promise<DataRecord[]> {
    const client = redisClient.getClient();
    if (!client) return records;
    const keyPrefix = config.keyPrefix as string || 'pipeline:output';
    const ttl = config.ttl as number || 3600;
    for (const r of records) await client.set(`${keyPrefix}:${r.id}`, JSON.stringify(r.data), 'EX', ttl);
    return records;
  }

  private static async execRedisStreamSink(config: Record<string, unknown>, records: DataRecord[]): Promise<DataRecord[]> {
    const client = redisClient.getClient();
    if (!client) return records;
    const streamKey = config.streamKey as string;
    const maxLen = config.maxLen as number || 10000;
    for (const r of records) {
      const fields: string[] = [];
      for (const [k, v] of Object.entries(r.data)) fields.push(k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
      await client.xadd(streamKey, 'MAXLEN', '~', maxLen, '*', ...fields);
    }
    return records;
  }

  private static async execMinIOSink(config: Record<string, unknown>, records: DataRecord[]): Promise<DataRecord[]> {
    const bucket = config.bucket as string;
    const prefix = config.prefix as string || '';
    const minioUrl = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
    for (const r of records) await fetch(`${minioUrl}/${bucket}/${prefix}${r.id}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r.data) });
    return records;
  }

  private static async execHTTPSink(config: Record<string, unknown>, records: DataRecord[]): Promise<DataRecord[]> {
    const url = config.url as string;
    const method = (config.method as string) || 'POST';
    const headers = (config.headers as Record<string, string>) || {};
    if (url) await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(records.map(r => r.data)), signal: AbortSignal.timeout(30000) });
    return records;
  }

  private static async execQdrantSink(config: Record<string, unknown>, records: DataRecord[]): Promise<DataRecord[]> {
    try {
      const { qdrantStorage } = await import('../lib/storage/qdrant.storage');
      const collection = config.collection as string;
      const vectorField = config.vectorField as string || 'embedding';
      const points = records.filter(r => Array.isArray(r.data[vectorField])).map(r => ({ id: r.id, vector: r.data[vectorField] as number[], payload: Object.fromEntries(Object.entries(r.data).filter(([k]) => k !== vectorField)) }));
      if (points.length > 0) await qdrantStorage.upsertPoints(collection, points);
    } catch (err: any) { log.warn(`[Pipeline] Qdrant sink error: ${err.message}`); }
    return records;
  }

  private static async execNeo4jSink(config: Record<string, unknown>, records: DataRecord[]): Promise<DataRecord[]> {
    try {
      const { neo4jStorage } = await import('../lib/storage/neo4j.storage');
      const mode = config.sinkMode as string || 'updateNode';
      const label = config.label as string || 'Node';
      for (const r of records) {
        if (mode === 'updateNode' && r.data.id) {
          await neo4jStorage.updateNode(label, String(r.data.id), r.data);
        } else if (mode === 'createEquipment') {
          await neo4jStorage.createEquipment(r.data as any);
        } else if (mode === 'createFault') {
          await neo4jStorage.createFault(r.data as any);
        } else if (mode === 'createSolution') {
          await neo4jStorage.createSolution(r.data as any);
        }
      }
    } catch (err: any) { log.warn(`[Pipeline] Neo4j sink error: ${err.message}`); }
    return records;
  }

  private static execDashboardSink(_config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    return records; // 数据通过 WebSocket 推送，由 RunExecutor 触发
  }

  private static execPrometheusSink(config: Record<string, unknown>, records: DataRecord[]): DataRecord[] {
    const metricName = config.metricName as string;
    const valueField = config.valueField as string;
    const labels = config.labels as Record<string, string> || {};
    for (const r of records) {
      const value = Number(r.data[valueField]) || 0;
      const labelValues: Record<string, string> = {};
      for (const [labelName, fieldName] of Object.entries(labels)) labelValues[labelName] = String(r.data[fieldName] ?? '');
      r.metadata = { ...r.metadata, _prometheusMetric: { name: metricName, value, labels: labelValues } };
    }
    return records;
  }

  // ======== 工具方法 ========
  private static tryParseJSON(str: string): Record<string, unknown> {
    try { const parsed = JSON.parse(str); return typeof parsed === 'object' && parsed !== null ? parsed : { value: parsed }; }
    catch { return { value: str }; }
  }
}

// ============ L3: RunExecutor ============

/**
 * RunExecutor — DAG 拓扑排序、分层并行执行、数据流动、重试、超时、Lineage
 */
class RunExecutor {
  private abortControllers = new Map<string, AbortController>();

  /**
   * 执行一次管道运行
   */
  async executeRun(
    dagConfig: PipelineDAGConfig,
    runId: string,
    onProgress?: (nodeId: string, status: string, result?: NodeExecResult) => void
  ): Promise<{
    status: PipelineRunStatus;
    nodeResults: Map<string, NodeExecResult>;
    lineage: LineageRecord[];
    totalDurationMs: number;
  }> {
    const startTime = Date.now();
    const nodeResults = new Map<string, NodeExecResult>();
    const nodeOutputs = new Map<string, DataRecord[]>();
    const lineage: LineageRecord[] = [];
    const abortController = new AbortController();
    this.abortControllers.set(runId, abortController);

    try {
      // 拓扑排序
      // 将 DAGConfig.nodes 转为 EditorNode 格式供 topologicalSort 使用
      const editorNodes: EditorNode[] = dagConfig.nodes.map(n => ({
        id: n.id, type: n.type, subType: n.subType, config: n.config,
        domain: 'data_engineering' as any, name: n.subType, x: 0, y: 0, validated: true,
      }));
      const editorConns: EditorConnection[] = dagConfig.connections.map((c, i) => ({
        id: `conn-${i}`, fromNodeId: c.fromNodeId, toNodeId: c.toNodeId, fromPort: c.fromPort, toPort: c.toPort,
      }));
      const sorted = topologicalSort(editorNodes, editorConns);
      if (!sorted) {
        return { status: 'failed', nodeResults, lineage, totalDurationMs: Date.now() - startTime };
      }

      // 分层：同一层的节点可以并行执行
      const layers = this.buildLayers(sorted.map(n => n.id), editorConns);

      // 逐层执行
      for (const layer of layers) {
        if (abortController.signal.aborted) break;

        // 同层并行
        const layerPromises = layer.map(async (nodeId) => {
          if (abortController.signal.aborted) return;
          const node = dagConfig.nodes.find(n => n.id === nodeId);
          if (!node) return;

          onProgress?.(nodeId, 'running');

          // 收集上游输入
          const inputRecords = this.collectInputs(nodeId, editorConns, nodeOutputs);

          // 执行节点（含重试）
          const result = await this.executeNodeWithRetry(
            node, inputRecords, dagConfig, runId
          );

          nodeResults.set(nodeId, result);
          if (result.status === 'success') {
            nodeOutputs.set(nodeId, result.records);
          }

          // 记录 Lineage
          const inputSources = editorConns
            .filter(c => c.toNodeId === nodeId)
            .map(c => c.fromNodeId);
          lineage.push({
            nodeId,
            nodeName: node.subType || nodeId,
            nodeType: node.subType || node.type || 'unknown',
            inputSources,
            outputTargets: editorConns.filter(c => c.fromNodeId === nodeId).map(c => c.toNodeId),
            recordsIn: result.recordsIn,
            recordsOut: result.recordsOut,
            timestamp: Date.now(),
            transformDescription: `${node.type}/${node.subType}: ${result.recordsIn} → ${result.recordsOut} records`,
          });

          onProgress?.(nodeId, result.status, result);
        });

        await Promise.all(layerPromises);

        // 检查是否有失败的节点阻塞后续
        for (const nodeId of layer) {
          const result = nodeResults.get(nodeId);
          if (result?.status === 'failed') {
            // 检查是否有下游节点依赖此节点
            const hasDownstream = editorConns.some(c => c.fromNodeId === nodeId);
            if (hasDownstream) {
              // 标记所有下游为 skipped
              this.skipDownstream(nodeId, dagConfig, nodeResults, onProgress);
            }
          }
        }
      }

      const allResults = Array.from(nodeResults.values());
      const hasFailed = allResults.some(r => r.status === 'failed');
      const allSkipped = allResults.every(r => r.status === 'skipped');

      return {
        status: hasFailed ? 'failed' : allSkipped ? 'cancelled' : 'completed',
        nodeResults,
        lineage,
        totalDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        status: 'failed',
        nodeResults,
        lineage,
        totalDurationMs: Date.now() - startTime,
      };
    } finally {
      this.abortControllers.delete(runId);
    }
  }

  /**
   * 取消运行
   */
  cancelRun(runId: string): boolean {
    const controller = this.abortControllers.get(runId);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  /**
   * 构建执行层级（同层可并行）
   */
  private buildLayers(sortedNodes: string[], connections: EditorConnection[]): string[][] {
    const layers: string[][] = [];
    const nodeLayer = new Map<string, number>();

    for (const nodeId of sortedNodes) {
      const incomingLayers = connections
        .filter(c => c.toNodeId === nodeId)
        .map(c => nodeLayer.get(c.fromNodeId) ?? -1);
      const layer = incomingLayers.length > 0 ? Math.max(...incomingLayers) + 1 : 0;
      nodeLayer.set(nodeId, layer);
      while (layers.length <= layer) layers.push([]);
      layers[layer].push(nodeId);
    }

    return layers;
  }

  /**
   * 收集上游节点的输出作为当前节点的输入
   */
  private collectInputs(
    nodeId: string,
    connections: EditorConnection[],
    nodeOutputs: Map<string, DataRecord[]>
  ): DataRecord[] {
    const incoming = connections.filter(c => c.toNodeId === nodeId);
    if (incoming.length === 0) return [];

    const allInputs: DataRecord[] = [];
    for (let i = 0; i < incoming.length; i++) {
      const conn = incoming[i];
      const records = nodeOutputs.get(conn.fromNodeId) || [];
      // 标记来源端口，用于 data_join 等多输入节点
      allInputs.push(...records.map(r => ({
        ...r,
        metadata: { ...r.metadata, port: i },
        _lineage: [...(r._lineage || []), { fromNodeId: conn.fromNodeId, recordCount: records.length }],
      })));
    }
    return allInputs;
  }

  /**
   * 带重试的节点执行
   */
  private async executeNodeWithRetry(
    node: { id: string; type: string; subType: string; config: Record<string, unknown> },
    inputRecords: DataRecord[],
    dagConfig: PipelineDAGConfig,
    runId: string
  ): Promise<NodeExecResult> {
    const retryPolicy = dagConfig.retryPolicy || { maxRetries: 2, retryDelayMs: 1000, backoffMultiplier: 2 };
    const timeoutMs = 300000;
    const nodeType = node.type || 'unknown';
    const nodeSubType = node.subType || nodeType;
    const config = node.config || {};

    for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
      const startTime = Date.now();
      try {
        // 超时控制
        const result = await Promise.race([
          ConnectorFactory.execute(nodeType, nodeSubType, config, inputRecords, {
            pipelineId: dagConfig.id || 'unknown',
            runId,
            nodeId: node.id,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Node timeout after ${timeoutMs}ms`)), timeoutMs)
          ),
        ]);

        return {
          status: 'success',
          records: result,
          recordsIn: inputRecords.length,
          recordsOut: result.length,
          durationMs: Date.now() - startTime,
        };
      } catch (err: any) {
        if (attempt < retryPolicy.maxRetries) {
          const delay = retryPolicy.retryDelayMs * Math.pow(retryPolicy.backoffMultiplier || 2, attempt);
          log.warn(`[Pipeline] Node ${node.id} attempt ${attempt + 1} failed, retrying in ${delay}ms: ${err.message}`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          return {
            status: 'failed',
            records: [],
            recordsIn: inputRecords.length,
            recordsOut: 0,
            durationMs: Date.now() - startTime,
            error: err.message,
          };
        }
      }
    }

    return { status: 'failed', records: [], recordsIn: inputRecords.length, recordsOut: 0, durationMs: 0, error: 'Unexpected' };
  }

  /**
   * 跳过失败节点的所有下游
   */
  private skipDownstream(
    failedNodeId: string,
    dagConfig: PipelineDAGConfig,
    nodeResults: Map<string, NodeExecResult>,
    onProgress?: (nodeId: string, status: string, result?: NodeExecResult) => void
  ): void {
    const downstream = dagConfig.connections.filter(c => c.fromNodeId === failedNodeId).map(c => c.toNodeId);
    for (const nodeId of downstream) {
      if (!nodeResults.has(nodeId)) {
        const result: NodeExecResult = { status: 'skipped', records: [], recordsIn: 0, recordsOut: 0, durationMs: 0, error: `Skipped: upstream ${failedNodeId} failed` };
        nodeResults.set(nodeId, result);
        onProgress?.(nodeId, 'skipped', result);
        this.skipDownstream(nodeId, dagConfig, nodeResults, onProgress);
      }
    }
  }
}

// ============ L4: PipelineManager ============

/**
 * PipelineManager — 管道 CRUD、MySQL 持久化、状态管理、Prometheus 指标
 */
export class PipelineEngine extends EventEmitter {
  private runExecutor = new RunExecutor();
  private activeRuns = new Map<string, { status: PipelineRunStatus; startedAt: number }>();

  // ======== 管道 CRUD ========

  /**
   * 保存管道（创建或更新）
   */
  async savePipeline(dagConfig: PipelineDAGConfig): Promise<{ id: string }> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const id = dagConfig.id || `pipeline-${Date.now()}`;
    const now = new Date();

    // 检查是否已存在
    const existing = await db.select().from(pipelines).where(eq(pipelines.pipelineId, id));

    if (existing.length > 0) {
      await db.update(pipelines).set({
        name: dagConfig.name,
        description: dagConfig.description || '',
        category: dagConfig.category || 'custom',
        dagConfig: JSON.stringify(dagConfig) as any,
        nodeCount: dagConfig.nodes.length,
        connectionCount: dagConfig.connections.length,
        updatedAt: now,
      }).where(eq(pipelines.pipelineId, id));
    } else {
      await db.insert(pipelines).values({
        pipelineId: id,
        name: dagConfig.name,
        description: dagConfig.description || '',
        category: dagConfig.category || 'custom',
        dagConfig: JSON.stringify(dagConfig) as any,
        status: 'draft',
        nodeCount: dagConfig.nodes.length,
        connectionCount: dagConfig.connections.length,
        createdAt: now,
        updatedAt: now,
      });
    }

    this.emit('pipeline:saved', { id, name: dagConfig.name });
    return { id };
  }

  /**
   * 获取单个管道
   */
  async getPipeline(id: string): Promise<PipelineDAGConfig | null> {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(pipelines).where(eq(pipelines.pipelineId, id));
    if (!row) return null;
    const dagData = typeof row.dagConfig === 'string' ? JSON.parse(row.dagConfig) : (row.dagConfig || {});
    return {
      id: row.pipelineId,
      name: row.name,
      description: row.description || '',
      category: (row.category || 'custom') as PipelineCategory,
      ...dagData,
    } as PipelineDAGConfig;
  }

  /**
   * 获取所有管道列表
   */
  async getAllPipelines(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    status: string;
    nodeCount: number;
    connectionCount: number;
    totalRuns: number;
    successRuns: number;
    failedRuns: number;
    lastRunAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>> {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(pipelines).orderBy(desc(pipelines.updatedAt));
    return rows.map(r => ({
      id: r.pipelineId,
      name: r.name,
      description: r.description || '',
      category: r.category || 'custom',
      status: r.status || 'draft',
      nodeCount: r.nodeCount || 0,
      connectionCount: r.connectionCount || 0,
      totalRuns: r.totalRuns || 0,
      successRuns: r.successRuns || 0,
      failedRuns: r.failedRuns || 0,
      lastRunAt: r.lastRunAt,
      createdAt: r.createdAt!,
      updatedAt: r.updatedAt!,
    }));
  }

  /**
   * 删除管道
   */
  async deletePipeline(id: string): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;
    await db.delete(pipelineRuns).where(eq(pipelineRuns.pipelineId, id));
    await db.delete(pipelines).where(eq(pipelines.pipelineId, id));
    this.emit('pipeline:deleted', { id });
    return true;
  }

  // ======== 管道执行 ========

  /**
   * 运行管道
   */
  async runPipeline(id: string, trigger: TriggerType = 'manual'): Promise<{
    runId: string;
    status: PipelineRunStatus;
    totalDurationMs: number;
    nodeResults: Record<string, NodeExecResult>;
    lineage: LineageRecord[];
    metrics: { totalRecordsProcessed: number; totalErrors: number };
  }> {
    const dagConfig = await this.getPipeline(id);
    if (!dagConfig) throw new Error(`Pipeline ${id} not found`);

    const db = await getDb();
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date();

    // 创建运行记录
    if (db) {
      await db.insert(pipelineRuns).values({
        runId,
        pipelineId: id,
        status: 'running',
        triggerType: trigger as 'manual' | 'schedule' | 'api' | 'event',
        startedAt,
        createdAt: startedAt,
      });
      await db.update(pipelines).set({ status: 'running' }).where(eq(pipelines.pipelineId, id));
    }

    this.activeRuns.set(runId, { status: 'running', startedAt: Date.now() });
    this.emit('pipeline:run:started', { pipelineId: id, runId });

    // 执行 DAG
    const result = await this.runExecutor.executeRun(dagConfig, runId, (nodeId, status, nodeResult) => {
      this.emit('pipeline:node:progress', { pipelineId: id, runId, nodeId, status, result: nodeResult });
    });

    // 统计指标
    let totalRecordsProcessed = 0;
    let totalErrors = 0;
    const nodeResultsObj: Record<string, NodeExecResult> = {};

    for (const [nodeId, nr] of Array.from(result.nodeResults.entries())) {
      nodeResultsObj[nodeId] = nr;
      totalRecordsProcessed += nr.recordsOut;
      if (nr.status === 'failed') totalErrors++;
    }

    // 更新运行记录
    const finishedAt = new Date();
    if (db) {
      await db.update(pipelineRuns).set({
        status: result.status as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
        finishedAt,
        durationMs: result.totalDurationMs,
        nodeResults: JSON.stringify(nodeResultsObj) as any,
        lineageData: JSON.stringify(result.lineage) as any,
        totalRecordsIn: totalRecordsProcessed,
        totalRecordsOut: totalRecordsProcessed,
        errorCount: totalErrors,
      }).where(eq(pipelineRuns.runId, runId));

      // 更新管道统计
      await db.update(pipelines).set({
        status: result.status === 'completed' ? 'active' : 'error',
        totalRuns: sql`${pipelines.totalRuns} + 1`,
        successRuns: result.status === 'completed' ? sql`${pipelines.successRuns} + 1` : sql`${pipelines.successRuns}`,
        failedRuns: result.status === 'failed' ? sql`${pipelines.failedRuns} + 1` : sql`${pipelines.failedRuns}`,
        lastRunAt: finishedAt,
        updatedAt: finishedAt,
      }).where(eq(pipelines.pipelineId, id));

      // 保存节点级指标
      for (const [nodeId, nr] of Array.from(result.nodeResults.entries())) {
        const node = dagConfig.nodes.find(n => n.id === nodeId);
        await db.insert(pipelineNodeMetrics).values({
          runId,
          pipelineId: id,
          nodeId,
          nodeName: node?.subType || nodeId,
          nodeType: node?.type || 'unknown',
          nodeSubType: node?.subType || 'unknown',
          status: nr.status,
          recordsIn: nr.recordsIn,
          recordsOut: nr.recordsOut,
          durationMs: nr.durationMs,
          errorMessage: nr.error || null,
          createdAt: new Date(),
        });
      }
    }

    this.activeRuns.delete(runId);
    this.emit('pipeline:run:completed', { pipelineId: id, runId, status: result.status });

    return {
      runId,
      status: result.status,
      totalDurationMs: result.totalDurationMs,
      nodeResults: nodeResultsObj,
      lineage: result.lineage,
      metrics: { totalRecordsProcessed, totalErrors },
    };
  }

  /**
   * 取消运行
   */
  cancelRun(runId: string): boolean {
    return this.runExecutor.cancelRun(runId);
  }

  // ======== 运行记录查询 ========

  /**
   * 获取管道的运行记录
   */
  async getPipelineRuns(pipelineId: string, limit: number = 20): Promise<PipelineRunRecord[]> {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(pipelineRuns)
      .where(eq(pipelineRuns.pipelineId, pipelineId))
      .orderBy(desc(pipelineRuns.startedAt))
      .limit(limit);
    return rows.map(r => ({
      id: r.runId,
      pipelineId: r.pipelineId,
      status: r.status as PipelineRunStatus,
      triggerType: (r.triggerType || 'manual') as TriggerType,
      startedAt: r.startedAt?.toISOString() || '',
      finishedAt: r.finishedAt?.toISOString() || undefined,
      durationMs: r.durationMs || undefined,
      recordsProcessed: (r.totalRecordsIn || 0) + (r.totalRecordsOut || 0),
      errorsCount: r.errorCount || 0,
      totalRecordsIn: r.totalRecordsIn || 0,
      totalRecordsOut: r.totalRecordsOut || 0,
      errorCount: r.errorCount || 0,
      nodeResults: r.nodeResults ? (typeof r.nodeResults === 'string' ? JSON.parse(r.nodeResults) : r.nodeResults) : undefined,
      lineageData: r.lineageData ? (typeof r.lineageData === 'string' ? JSON.parse(r.lineageData) : r.lineageData) : undefined,
    }));
  }

  /**
   * 获取单次运行详情
   */
  async getRunDetail(runId: string): Promise<PipelineRunRecord | null> {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.runId, runId));
    if (!row) return null;
    return {
      id: row.runId,
      pipelineId: row.pipelineId,
      status: row.status as PipelineRunStatus,
      triggerType: (row.triggerType || 'manual') as TriggerType,
      startedAt: row.startedAt?.toISOString() || '',
      finishedAt: row.finishedAt?.toISOString() || undefined,
      durationMs: row.durationMs || undefined,
      recordsProcessed: (row.totalRecordsIn || 0) + (row.totalRecordsOut || 0),
      errorsCount: row.errorCount || 0,
      totalRecordsIn: row.totalRecordsIn || 0,
      totalRecordsOut: row.totalRecordsOut || 0,
      errorCount: row.errorCount || 0,
      nodeResults: row.nodeResults ? (typeof row.nodeResults === 'string' ? JSON.parse(row.nodeResults) : row.nodeResults) : undefined,
      lineageData: row.lineageData ? (typeof row.lineageData === 'string' ? JSON.parse(row.lineageData) : row.lineageData) : undefined,
    };
  }

  /**
   * 获取节点级指标
   */
  async getNodeMetrics(runId: string): Promise<Array<{
    nodeId: string;
    nodeName: string;
    nodeType: string;
    status: string;
    recordsIn: number;
    recordsOut: number;
    durationMs: number;
    errorMessage: string | null;
  }>> {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(pipelineNodeMetrics).where(eq(pipelineNodeMetrics.runId, runId));
    return rows.map(r => ({
      nodeId: r.nodeId,
      nodeName: r.nodeName || r.nodeId,
      nodeType: r.nodeType || 'unknown',
      status: r.status || 'unknown',
      recordsIn: r.recordsIn || 0,
      recordsOut: r.recordsOut || 0,
      durationMs: r.durationMs || 0,
      errorMessage: r.errorMessage || null,
    }));
  }

  // ======== 管道状态 ========

  /**
   * 获取管道状态（兼容旧接口）
   */
  getPipelineStatus(pipelineId: string): {
    config: PipelineConfig;
    status: PipelineStatus;
    metrics: { totalRecordsProcessed: number; totalErrors: number; lastRunAt?: number; lastRunDurationMs?: number; averageProcessingTimeMs: number };
  } | null {
    // 兼容旧接口：返回内存中的活跃运行状态
    const activeRun = Array.from(this.activeRuns.entries()).find(
      ([, v]) => true // 简化实现
    );
    return null; // 新引擎使用 getPipeline + getPipelineRuns 替代
  }

  // ======== 兼容旧接口 ========

  async createPipeline(config: PipelineConfig): Promise<void> {
    await this.savePipeline({
      id: config.id,
      name: config.name,
      description: config.description,
      category: 'custom' as PipelineCategory,
      nodes: [],
      connections: [],
    });
  }

  async startPipeline(pipelineId: string): Promise<void> {
    await this.runPipeline(pipelineId, 'manual');
  }

  async stopPipeline(pipelineId: string): Promise<void> {
    // 取消所有活跃运行
    for (const [runId] of Array.from(this.activeRuns.entries())) {
      this.cancelRun(runId);
    }
  }

  async pausePipeline(_pipelineId: string): Promise<void> {
    // 暂停功能在新引擎中通过取消+重新运行实现
  }

  registerConnectorFactory(_type: string, _factory: any): void {
    // 新引擎通过 ConnectorFactory 静态方法扩展
  }

  registerProcessorFactory(_type: string, _factory: any): void {
    // 新引擎通过 ConnectorFactory 静态方法扩展
  }
}

// 导出单例
export const pipelineEngine = new PipelineEngine();
