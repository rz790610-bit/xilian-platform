/**
 * ClickHouse 时序数据库客户端
 * 用于存储和查询传感器时序数据
 */

import { createClient, ClickHouseClient } from '@clickhouse/client';
import type { SensorReading, QueryOptions } from "../../core/types/domain";
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('clickhouse');

// ClickHouse 配置

/**
 * 智能解析 CLICKHOUSE_HOST：
 * - 如果已包含 http:// 前缀，直接使用（如 http://localhost:8123）
 * - 如果是纯主机名（如 clickhouse 或 localhost），自动拼接 http:// 和端口
 */
function resolveClickHouseUrl(): string {
  const raw = process.env.CLICKHOUSE_HOST || 'localhost';
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }
  const port = process.env.CLICKHOUSE_PORT || '8123';
  return `http://${raw}:${port}`;
}

const CLICKHOUSE_CONFIG = {
  host: resolveClickHouseUrl(),
  username: process.env.CLICKHOUSE_USER || 'portai',
  // P0-CRED-2: 移除硬编码密码，生产环境必须配置 CLICKHOUSE_PASSWORD
  password: process.env.CLICKHOUSE_PASSWORD || (() => { log.warn({ security: true, field: 'CLICKHOUSE_PASSWORD' }, 'CLICKHOUSE_PASSWORD not set — MUST configure in production'); return ''; })(),
  database: process.env.CLICKHOUSE_DATABASE || 'portai_timeseries',
};

// 单例客户端
let client: ClickHouseClient | null = null;
let isConnected = false;

/**
 * 获取 ClickHouse 客户端实例
 */
export function getClickHouseClient(): ClickHouseClient {
  if (!client) {
    client = createClient({
      url: CLICKHOUSE_CONFIG.host,
      username: CLICKHOUSE_CONFIG.username,
      password: CLICKHOUSE_CONFIG.password,
      database: CLICKHOUSE_CONFIG.database,
      clickhouse_settings: {
        async_insert: 1,
        wait_for_async_insert: 0,
      },
    });
  }
  return client;
}

/**
 * 检查连接状态
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const ch = getClickHouseClient();
    const result = await ch.query({ query: 'SELECT 1' });
    await result.json();
    isConnected = true;
    return true;
  } catch (error) {
    isConnected = false;
    log.warn('[ClickHouse] Connection check failed:', error);
    return false;
  }
}

/**
 * 获取连接状态
 */
export function getConnectionStatus(): boolean {
  return isConnected;
}

/**
 * 关闭连接
 */
export async function closeConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    isConnected = false;
  }
}

// ============ 数据类型定义 ============

export interface TelemetryData {
  device_id: string;
  sensor_id: string;
  metric_name: string;
  value: number;
  unit?: string;
  quality?: 'good' | 'uncertain' | 'bad';
  timestamp: Date;
  batch_id?: string;
  source?: string;
}

export interface AggregatedData {
  device_id: string;
  sensor_id: string;
  metric_name: string;
  window_start: Date;
  sample_count: number;
  sum_value: number;
  min_value: number;
  max_value: number;
  avg_value: number;
  std_dev?: number;
}

export interface AnomalyDetection {
  detection_id: string;
  device_id: string;
  sensor_id: string;
  metric_name: string;
  algorithm_type: 'zscore' | 'iqr' | 'mad' | 'isolation_forest' | 'custom';
  current_value: number;
  expected_value: number;
  deviation: number;
  score: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  is_acknowledged?: boolean;
  timestamp: Date;
}

export interface ClickHouseAggregationOptions extends QueryOptions {
  interval: '1m' | '5m' | '1h' | '1d';
}

// ============ 数据写入方法 ============

/**
 * 批量写入传感器读数
 */
export async function insertSensorReadings(readings: SensorReading[]): Promise<void> {
  if (readings.length === 0) return;

  const ch = getClickHouseClient();
  
  const rows = readings.map(r => {
    const ts = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp);
    return {
      device_id: r.deviceCode,
      sensor_id: r.sensorId,
      metric_name: r.metricName || '',
      value: r.value,
      unit: r.unit || '',
      quality: typeof r.quality === 'number' ? 'good' : (r.quality || 'good'),
      timestamp: ts.toISOString().replace('T', ' ').replace('Z', ''),
      metadata: JSON.stringify(r.metadata || {}),
    };
  });

  await ch.insert({
    table: 'sensor_readings',
    values: rows,
    format: 'JSONEachRow',
  });
}

/**
 * 批量写入遥测数据
 */
export async function insertTelemetryData(data: TelemetryData[]): Promise<void> {
  if (data.length === 0) return;

  const ch = getClickHouseClient();
  
  const rows = data.map(d => ({
    device_id: d.device_id,
    sensor_id: d.sensor_id,
    metric_name: d.metric_name,
    value: d.value,
    unit: d.unit || '',
    quality: d.quality || 'good',
    timestamp: d.timestamp.toISOString().replace('T', ' ').replace('Z', ''),
    batch_id: d.batch_id || '',
    source: d.source || 'direct',
  }));

  await ch.insert({
    table: 'telemetry_data',
    values: rows,
    format: 'JSONEachRow',
  });
}

/**
 * 写入异常检测结果
 */
export async function insertAnomalyDetection(anomaly: AnomalyDetection): Promise<void> {
  const ch = getClickHouseClient();
  
  await ch.insert({
    table: 'anomaly_detections',
    values: [{
      detection_id: anomaly.detection_id,
      device_id: anomaly.device_id,
      sensor_id: anomaly.sensor_id,
      metric_name: anomaly.metric_name,
      algorithm_type: anomaly.algorithm_type,
      current_value: anomaly.current_value,
      expected_value: anomaly.expected_value,
      deviation: anomaly.deviation,
      score: anomaly.score,
      severity: anomaly.severity,
      is_acknowledged: anomaly.is_acknowledged ? 1 : 0,
      timestamp: anomaly.timestamp.toISOString().replace('T', ' ').replace('Z', ''),
    }],
    format: 'JSONEachRow',
  });
}

// ============ 数据查询方法 ============

/**
 * 查询传感器原始读数
 */
export async function querySensorReadings(options: QueryOptions): Promise<SensorReading[]> {
  const ch = getClickHouseClient();
  
  let query = `
    SELECT 
      device_id, sensor_id, metric_name, value, unit, quality, timestamp, metadata
    FROM sensor_readings
    WHERE 1=1
  `;
  
  const params: Record<string, unknown> = {};
  
  if (options.startTime) {
    query += ` AND timestamp >= {startTime:DateTime64(3)}`;
    const st = options.startTime instanceof Date ? options.startTime : new Date(String(options.startTime));
    params.startTime = st.toISOString().replace('T', ' ').replace('Z', '');
  }
  
  if (options.endTime) {
    query += ` AND timestamp <= {endTime:DateTime64(3)}`;
    const et = options.endTime instanceof Date ? options.endTime : new Date(String(options.endTime));
    params.endTime = et.toISOString().replace('T', ' ').replace('Z', '');
  }
  
  if (options.deviceCodes && options.deviceCodes.length > 0) {
    query += ` AND device_id IN ({deviceCodes:Array(String)})`;
    params.deviceCodes = options.deviceCodes;
  }
  
  if (options.sensorIds && options.sensorIds.length > 0) {
    query += ` AND sensor_id IN ({sensorIds:Array(String)})`;
    params.sensorIds = options.sensorIds;
  }
  
  if (options.metricNames && options.metricNames.length > 0) {
    query += ` AND metric_name IN ({metricNames:Array(String)})`;
    params.metricNames = options.metricNames;
  }
  
  query += ` ORDER BY timestamp ${options.orderDirection === 'asc' ? 'ASC' : 'DESC'}`;
  
  if (options.limit) {
    query += ` LIMIT {limit:UInt32}`;
    params.limit = options.limit;
  }
  
  if (options.offset) {
    query += ` OFFSET {offset:UInt32}`;
    params.offset = options.offset;
  }
  
  const result = await ch.query({
    query,
    query_params: params,
    format: 'JSONEachRow',
  });
  
  interface ReadingRow {
    device_id: string;
    sensor_id: string;
    metric_name: string;
    value: number;
    unit: string;
    quality: string;
    timestamp: string;
    metadata: string;
  }
  
  const rows = await result.json() as ReadingRow[];
  
  return rows.map(row => ({
    sensorId: row.sensor_id,
    deviceCode: row.device_id,
    metricName: row.metric_name,
    value: row.value,
    unit: row.unit,
    quality: row.quality as SensorReading['quality'],
    timestamp: new Date(row.timestamp),
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
  }));
}

/**
 * 查询聚合数据
 */
export async function queryAggregatedData(options: ClickHouseAggregationOptions): Promise<AggregatedData[]> {
  const ch = getClickHouseClient();
  
  // 根据聚合间隔选择表
  const tableMap: Record<string, string> = {
    '1m': 'sensor_readings_1m',
    '5m': 'sensor_readings_1m', // 使用1分钟表然后再聚合
    '1h': 'sensor_readings_1h',
    '1d': 'sensor_readings_1d',
  };
  
  const table = tableMap[options.interval] || 'sensor_readings_1m';
  
  let query = `
    SELECT 
      device_id, sensor_id, metric_name, window_start,
      sample_count, sum_value, min_value, max_value, avg_value, std_dev
    FROM ${table}
    WHERE 1=1
  `;
  
  const params: Record<string, unknown> = {};
  
  if (options.startTime) {
    query += ` AND window_start >= {startTime:DateTime}`;
    const st = options.startTime instanceof Date ? options.startTime : new Date(String(options.startTime));
    params.startTime = st.toISOString().replace('T', ' ').replace('Z', '');
  }
  
  if (options.endTime) {
    query += ` AND window_start <= {endTime:DateTime}`;
    const et = options.endTime instanceof Date ? options.endTime : new Date(String(options.endTime));
    params.endTime = et.toISOString().replace('T', ' ').replace('Z', '');
  }
  
  if (options.deviceCodes && options.deviceCodes.length > 0) {
    query += ` AND device_id IN ({deviceCodes:Array(String)})`;
    params.deviceCodes = options.deviceCodes;
  }
  
  if (options.sensorIds && options.sensorIds.length > 0) {
    query += ` AND sensor_id IN ({sensorIds:Array(String)})`;
    params.sensorIds = options.sensorIds;
  }
  
  query += ` ORDER BY window_start ${options.orderDirection === 'asc' ? 'ASC' : 'DESC'}`;
  
  if (options.limit) {
    query += ` LIMIT {limit:UInt32}`;
    params.limit = options.limit;
  }
  
  const result = await ch.query({
    query,
    query_params: params,
    format: 'JSONEachRow',
  });
  
  interface AggregatedRow {
    device_id: string;
    sensor_id: string;
    metric_name: string;
    window_start: string;
    sample_count: number;
    sum_value: number;
    min_value: number;
    max_value: number;
    avg_value: number;
    std_dev?: number;
  }
  
  const rows = await result.json() as AggregatedRow[];
  
  return rows.map(row => ({
    device_id: row.device_id,
    sensor_id: row.sensor_id,
    metric_name: row.metric_name,
    window_start: new Date(row.window_start),
    sample_count: row.sample_count,
    sum_value: row.sum_value,
    min_value: row.min_value,
    max_value: row.max_value,
    avg_value: row.avg_value,
    std_dev: row.std_dev,
  }));
}

/**
 * 查询异常检测结果
 */
export async function queryAnomalies(options: QueryOptions & { severity?: string[] }): Promise<AnomalyDetection[]> {
  const ch = getClickHouseClient();
  
  let query = `
    SELECT 
      detection_id, device_id, sensor_id, metric_name, algorithm_type,
      current_value, expected_value, deviation, score, severity,
      is_acknowledged, timestamp
    FROM anomaly_detections
    WHERE 1=1
  `;
  
  const params: Record<string, unknown> = {};
  
  if (options.startTime) {
    query += ` AND timestamp >= {startTime:DateTime64(3)}`;
    const st = options.startTime instanceof Date ? options.startTime : new Date(String(options.startTime));
    params.startTime = st.toISOString().replace('T', ' ').replace('Z', '');
  }
  
  if (options.endTime) {
    query += ` AND timestamp <= {endTime:DateTime64(3)}`;
    const et = options.endTime instanceof Date ? options.endTime : new Date(String(options.endTime));
    params.endTime = et.toISOString().replace('T', ' ').replace('Z', '');
  }
  
  if (options.deviceCodes && options.deviceCodes.length > 0) {
    query += ` AND device_id IN ({deviceCodes:Array(String)})`;
    params.deviceCodes = options.deviceCodes;
  }
  
  if (options.severity && options.severity.length > 0) {
    query += ` AND severity IN ({severity:Array(String)})`;
    params.severity = options.severity;
  }
  
  query += ` ORDER BY timestamp DESC`;
  
  if (options.limit) {
    query += ` LIMIT {limit:UInt32}`;
    params.limit = options.limit;
  }
  
  const result = await ch.query({
    query,
    query_params: params,
    format: 'JSONEachRow',
  });
  
  interface AnomalyRow {
    detection_id: string;
    device_id: string;
    sensor_id: string;
    metric_name: string;
    algorithm_type: string;
    current_value: number;
    expected_value: number;
    deviation: number;
    score: number;
    severity: string;
    is_acknowledged: number;
    timestamp: string;
  }
  
  const rows = await result.json() as AnomalyRow[];
  
  return rows.map(row => ({
    detection_id: row.detection_id,
    device_id: row.device_id,
    sensor_id: row.sensor_id,
    metric_name: row.metric_name,
    algorithm_type: row.algorithm_type as AnomalyDetection['algorithm_type'],
    current_value: row.current_value,
    expected_value: row.expected_value,
    deviation: row.deviation,
    score: row.score,
    severity: row.severity as AnomalyDetection['severity'],
    is_acknowledged: row.is_acknowledged === 1,
    timestamp: new Date(row.timestamp),
  }));
}

// ============ 统计查询方法 ============

/**
 * 获取设备数据统计
 */
export async function getDeviceStats(nodeId: string, timeRange: { start: Date; end: Date }): Promise<{
  totalReadings: number;
  avgValue: number;
  minValue: number;
  maxValue: number;
  anomalyCount: number;
}> {
  const ch = getClickHouseClient();
  
  const query = `
    SELECT
      count() as total_readings,
      avg(value) as avg_value,
      min(value) as min_value,
      max(value) as max_value
    FROM sensor_readings
    WHERE device_id = {nodeId:String}
      AND timestamp >= {startTime:DateTime64(3)}
      AND timestamp <= {endTime:DateTime64(3)}
  `;
  
  const result = await ch.query({
    query,
    query_params: {
      nodeId,
      startTime: timeRange.start.toISOString().replace('T', ' ').replace('Z', ''),
      endTime: timeRange.end.toISOString().replace('T', ' ').replace('Z', ''),
    },
    format: 'JSONEachRow',
  });
  
  const rows = await result.json() as Array<{ total_readings?: number; avg_value?: number; min_value?: number; max_value?: number }>;
  const stats = rows[0] || {};
  
  // 查询异常数量
  const anomalyQuery = `
    SELECT count() as anomaly_count
    FROM anomaly_detections
    WHERE device_id = {nodeId:String}
      AND timestamp >= {startTime:DateTime64(3)}
      AND timestamp <= {endTime:DateTime64(3)}
  `;
  
  const anomalyResult = await ch.query({
    query: anomalyQuery,
    query_params: {
      nodeId,
      startTime: timeRange.start.toISOString().replace('T', ' ').replace('Z', ''),
      endTime: timeRange.end.toISOString().replace('T', ' ').replace('Z', ''),
    },
    format: 'JSONEachRow',
  });
  
  const anomalyRows = await anomalyResult.json() as Array<{ anomaly_count?: number }>;
  
  return {
    totalReadings: stats.total_readings || 0,
    avgValue: stats.avg_value || 0,
    minValue: stats.min_value || 0,
    maxValue: stats.max_value || 0,
    anomalyCount: anomalyRows[0]?.anomaly_count || 0,
  };
}

/**
 * 获取数据库统计信息
 */
export async function getDatabaseStats(): Promise<{
  totalTables: number;
  totalRows: number;
  diskUsage: string;
  oldestData: Date | null;
  newestData: Date | null;
}> {
  const ch = getClickHouseClient();
  
  try {
    // 获取表统计
    const tableQuery = `
      SELECT 
        count() as table_count,
        sum(total_rows) as total_rows,
        formatReadableSize(sum(total_bytes)) as disk_usage
      FROM system.tables
      WHERE database = 'portai_timeseries'
    `;
    
    const tableResult = await ch.query({ query: tableQuery, format: 'JSONEachRow' });
    const tableRows = await tableResult.json() as Array<{ table_count?: number; total_rows?: number; disk_usage?: string }>;
    const tableStats = tableRows[0] || {};
    
    // 获取数据时间范围
    const timeQuery = `
      SELECT 
        min(timestamp) as oldest,
        max(timestamp) as newest
      FROM sensor_readings
    `;
    
    const timeResult = await ch.query({ query: timeQuery, format: 'JSONEachRow' });
    const timeRows = await timeResult.json() as Array<{ oldest?: string; newest?: string }>;
    const timeStats: { oldest?: string; newest?: string } = timeRows[0] || {};
    
    return {
      totalTables: tableStats.table_count || 0,
      totalRows: tableStats.total_rows || 0,
      diskUsage: tableStats.disk_usage || '0 B',
      oldestData: timeStats.oldest ? new Date(timeStats.oldest) : null,
      newestData: timeStats.newest ? new Date(timeStats.newest) : null,
    };
  } catch (error) {
    log.warn('[ClickHouse] Failed to get database stats:', error);
    return {
      totalTables: 0,
      totalRows: 0,
      diskUsage: '0 B',
      oldestData: null,
      newestData: null,
    };
  }
}

// 导出 ClickHouse 客户端模块
export const clickhouseClient = {
  getClient: getClickHouseClient,
  checkConnection,
  getConnectionStatus,
  closeConnection,
  // 写入
  insertSensorReadings,
  insertTelemetryData,
  insertAnomalyDetection,
  // 查询
  querySensorReadings,
  queryAggregatedData,
  queryAnomalies,
  // 统计
  getDeviceStats,
  getDatabaseStats,
};

export default clickhouseClient;
