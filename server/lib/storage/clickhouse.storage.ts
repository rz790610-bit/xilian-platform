/**
 * ClickHouse 企业级时序存储服务
 * 
 * 架构：3节点2副本集群
 * 表结构：
 * - sensor_readings_raw: 原始数据（Gorilla压缩，7天TTL）
 * - sensor_readings_1m: 分钟聚合（2年TTL）
 * - sensor_readings_1h: 小时聚合（5年TTL）
 * - fault_events: 故障事件（永久保留）
 * 
 * 特性：
 * - Materialized View 自动下采样
 * - ReplicatedMergeTree 高可用
 * - 数据压缩和TTL自动清理
 */

import { createClient, ClickHouseClient } from '@clickhouse/client';

// ============ 集群配置 ============

export interface ClickHouseClusterConfig {
  nodes: Array<{
    host: string;
    port: number;
    weight?: number;
  }>;
  username: string;
  password: string;
  database: string;
  cluster: string;
  replicationFactor: number;
  shards: number;
}

// 默认集群配置（3节点2副本）
const DEFAULT_CLUSTER_CONFIG: ClickHouseClusterConfig = {
  nodes: [
    { host: process.env.CLICKHOUSE_NODE1_HOST || 'clickhouse-1', port: 8123, weight: 1 },
    { host: process.env.CLICKHOUSE_NODE2_HOST || 'clickhouse-2', port: 8123, weight: 1 },
    { host: process.env.CLICKHOUSE_NODE3_HOST || 'clickhouse-3', port: 8123, weight: 1 },
  ],
  username: process.env.CLICKHOUSE_USER || 'xilian',
  password: process.env.CLICKHOUSE_PASSWORD || 'xilian123',
  database: process.env.CLICKHOUSE_DATABASE || 'xilian',
  cluster: 'xilian_cluster',
  replicationFactor: 2,
  shards: 3,
};

// 单节点开发配置
const SINGLE_NODE_CONFIG: ClickHouseClusterConfig = {
  nodes: [
    { host: process.env.CLICKHOUSE_HOST || 'localhost', port: 8123, weight: 1 },
  ],
  username: process.env.CLICKHOUSE_USER || 'xilian',
  password: process.env.CLICKHOUSE_PASSWORD || 'xilian123',
  database: process.env.CLICKHOUSE_DATABASE || 'xilian',
  cluster: 'default',
  replicationFactor: 1,
  shards: 1,
};

// ============ 数据类型定义 ============

export interface SensorReadingRaw {
  device_id: string;
  sensor_id: string;
  metric_name: string;
  value: number;
  unit: string;
  quality: 'good' | 'uncertain' | 'bad';
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface SensorReadingAggregated {
  device_id: string;
  sensor_id: string;
  metric_name: string;
  window_start: Date;
  window_end: Date;
  sample_count: number;
  sum_value: number;
  min_value: number;
  max_value: number;
  avg_value: number;
  std_dev: number;
  first_value: number;
  last_value: number;
}

export interface FaultEvent {
  event_id: string;
  device_id: string;
  fault_code: string;
  fault_type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  description: string;
  root_cause?: string;
  resolution?: string;
  start_time: Date;
  end_time?: Date;
  duration_seconds?: number;
  affected_sensors: string[];
  metadata?: Record<string, unknown>;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface QueryFilter {
  deviceIds?: string[];
  sensorIds?: string[];
  metricNames?: string[];
  qualities?: string[];
  timeRange?: TimeRange;
  limit?: number;
  offset?: number;
  orderBy?: 'asc' | 'desc';
}

// ============ ClickHouse 存储服务类 ============

export class ClickHouseStorage {
  private clients: Map<string, ClickHouseClient> = new Map();
  private config: ClickHouseClusterConfig;
  private isInitialized: boolean = false;
  private currentNodeIndex: number = 0;

  constructor(config?: ClickHouseClusterConfig) {
    // 根据环境选择配置
    const isClusterMode = process.env.CLICKHOUSE_CLUSTER_MODE === 'true';
    this.config = config || (isClusterMode ? DEFAULT_CLUSTER_CONFIG : SINGLE_NODE_CONFIG);
  }

  /**
   * 初始化集群连接
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('[ClickHouse] Initializing cluster connections...');

    for (const node of this.config.nodes) {
      try {
        const client = createClient({
          url: `http://${node.host}:${node.port}`,
          username: this.config.username,
          password: this.config.password,
          database: this.config.database,
          // 使用默认设置，避免类型问题
        });

        // 测试连接
        await client.query({ query: 'SELECT 1' });
        this.clients.set(`${node.host}:${node.port}`, client);
        console.log(`[ClickHouse] Connected to node ${node.host}:${node.port}`);
      } catch (error) {
        console.error(`[ClickHouse] Failed to connect to ${node.host}:${node.port}:`, error);
      }
    }

    if (this.clients.size === 0) {
      throw new Error('[ClickHouse] No available nodes in cluster');
    }

    // 初始化表结构
    await this.initializeTables();
    this.isInitialized = true;
    console.log('[ClickHouse] Cluster initialized successfully');
  }

  /**
   * 获取可用客户端（轮询负载均衡）
   */
  private getClient(): ClickHouseClient {
    const nodes = Array.from(this.clients.keys());
    if (nodes.length === 0) {
      throw new Error('[ClickHouse] No available clients');
    }

    const nodeKey = nodes[this.currentNodeIndex % nodes.length];
    this.currentNodeIndex++;
    return this.clients.get(nodeKey)!;
  }

  /**
   * 初始化表结构
   */
  private async initializeTables(): Promise<void> {
    const client = this.getClient();
    const isCluster = this.config.nodes.length > 1;

    // 创建数据库
    await client.query({
      query: `CREATE DATABASE IF NOT EXISTS ${this.config.database}`,
    });

    // 1. sensor_readings_raw - 原始传感器数据（7天TTL，Gorilla压缩）
    const rawTableEngine = isCluster
      ? `ReplicatedMergeTree('/clickhouse/tables/{shard}/sensor_readings_raw', '{replica}')`
      : 'MergeTree()';

    await client.query({
      query: `
        CREATE TABLE IF NOT EXISTS ${this.config.database}.sensor_readings_raw
        (
          device_id String,
          sensor_id String,
          metric_name String,
          value Float64 CODEC(Gorilla, LZ4),
          unit String,
          quality Enum8('good' = 1, 'uncertain' = 2, 'bad' = 3),
          timestamp DateTime64(3) CODEC(DoubleDelta, LZ4),
          metadata String DEFAULT '{}',
          _partition_date Date DEFAULT toDate(timestamp)
        )
        ENGINE = ${rawTableEngine}
        PARTITION BY toYYYYMM(_partition_date)
        ORDER BY (device_id, sensor_id, metric_name, timestamp)
        TTL timestamp + INTERVAL 7 DAY DELETE
        SETTINGS index_granularity = 8192
      `,
    });

    // 2. sensor_readings_1m - 分钟聚合（2年TTL）
    const agg1mTableEngine = isCluster
      ? `ReplicatedMergeTree('/clickhouse/tables/{shard}/sensor_readings_1m', '{replica}')`
      : 'MergeTree()';

    await client.query({
      query: `
        CREATE TABLE IF NOT EXISTS ${this.config.database}.sensor_readings_1m
        (
          device_id String,
          sensor_id String,
          metric_name String,
          window_start DateTime CODEC(DoubleDelta, LZ4),
          window_end DateTime CODEC(DoubleDelta, LZ4),
          sample_count UInt32,
          sum_value Float64,
          min_value Float64,
          max_value Float64,
          avg_value Float64,
          std_dev Float64,
          first_value Float64,
          last_value Float64,
          _partition_date Date DEFAULT toDate(window_start)
        )
        ENGINE = ${agg1mTableEngine}
        PARTITION BY toYYYYMM(_partition_date)
        ORDER BY (device_id, sensor_id, metric_name, window_start)
        TTL window_start + INTERVAL 2 YEAR DELETE
        SETTINGS index_granularity = 8192
      `,
    });

    // 3. sensor_readings_1h - 小时聚合（5年TTL）
    const agg1hTableEngine = isCluster
      ? `ReplicatedMergeTree('/clickhouse/tables/{shard}/sensor_readings_1h', '{replica}')`
      : 'MergeTree()';

    await client.query({
      query: `
        CREATE TABLE IF NOT EXISTS ${this.config.database}.sensor_readings_1h
        (
          device_id String,
          sensor_id String,
          metric_name String,
          window_start DateTime CODEC(DoubleDelta, LZ4),
          window_end DateTime CODEC(DoubleDelta, LZ4),
          sample_count UInt32,
          sum_value Float64,
          min_value Float64,
          max_value Float64,
          avg_value Float64,
          std_dev Float64,
          first_value Float64,
          last_value Float64,
          _partition_date Date DEFAULT toDate(window_start)
        )
        ENGINE = ${agg1hTableEngine}
        PARTITION BY toYYYYMM(_partition_date)
        ORDER BY (device_id, sensor_id, metric_name, window_start)
        TTL window_start + INTERVAL 5 YEAR DELETE
        SETTINGS index_granularity = 8192
      `,
    });

    // 4. fault_events - 故障事件（永久保留）
    const faultTableEngine = isCluster
      ? `ReplicatedMergeTree('/clickhouse/tables/{shard}/fault_events', '{replica}')`
      : 'MergeTree()';

    await client.query({
      query: `
        CREATE TABLE IF NOT EXISTS ${this.config.database}.fault_events
        (
          event_id String,
          device_id String,
          fault_code String,
          fault_type String,
          severity Enum8('info' = 1, 'warning' = 2, 'error' = 3, 'critical' = 4),
          description String,
          root_cause Nullable(String),
          resolution Nullable(String),
          start_time DateTime64(3),
          end_time Nullable(DateTime64(3)),
          duration_seconds Nullable(UInt32),
          affected_sensors Array(String),
          metadata String DEFAULT '{}',
          _partition_date Date DEFAULT toDate(start_time)
        )
        ENGINE = ${faultTableEngine}
        PARTITION BY toYYYYMM(_partition_date)
        ORDER BY (device_id, fault_code, start_time)
        SETTINGS index_granularity = 8192
      `,
    });

    // 5. 创建物化视图 - 自动下采样到1分钟
    await client.query({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${this.config.database}.mv_sensor_readings_1m
        TO ${this.config.database}.sensor_readings_1m
        AS SELECT
          device_id,
          sensor_id,
          metric_name,
          toStartOfMinute(timestamp) AS window_start,
          toStartOfMinute(timestamp) + INTERVAL 1 MINUTE AS window_end,
          count() AS sample_count,
          sum(value) AS sum_value,
          min(value) AS min_value,
          max(value) AS max_value,
          avg(value) AS avg_value,
          stddevPop(value) AS std_dev,
          argMin(value, timestamp) AS first_value,
          argMax(value, timestamp) AS last_value
        FROM ${this.config.database}.sensor_readings_raw
        GROUP BY device_id, sensor_id, metric_name, window_start, window_end
      `,
    });

    // 6. 创建物化视图 - 自动下采样到1小时
    await client.query({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${this.config.database}.mv_sensor_readings_1h
        TO ${this.config.database}.sensor_readings_1h
        AS SELECT
          device_id,
          sensor_id,
          metric_name,
          toStartOfHour(window_start) AS window_start,
          toStartOfHour(window_start) + INTERVAL 1 HOUR AS window_end,
          sum(sample_count) AS sample_count,
          sum(sum_value) AS sum_value,
          min(min_value) AS min_value,
          max(max_value) AS max_value,
          sum(sum_value) / sum(sample_count) AS avg_value,
          0 AS std_dev,
          argMin(first_value, window_start) AS first_value,
          argMax(last_value, window_start) AS last_value
        FROM ${this.config.database}.sensor_readings_1m
        GROUP BY device_id, sensor_id, metric_name, window_start, window_end
      `,
    });

    console.log('[ClickHouse] Tables and materialized views initialized');
  }

  // ============ 数据写入方法 ============

  /**
   * 批量写入原始传感器数据
   */
  async insertSensorReadings(readings: SensorReadingRaw[]): Promise<{ inserted: number; errors: number }> {
    if (readings.length === 0) return { inserted: 0, errors: 0 };

    const client = this.getClient();
    let inserted = 0;
    let errors = 0;

    try {
      const rows = readings.map(r => ({
        device_id: r.device_id,
        sensor_id: r.sensor_id,
        metric_name: r.metric_name,
        value: r.value,
        unit: r.unit || '',
        quality: r.quality || 'good',
        timestamp: this.formatDateTime(r.timestamp),
        metadata: JSON.stringify(r.metadata || {}),
      }));

      await client.insert({
        table: `${this.config.database}.sensor_readings_raw`,
        values: rows,
        format: 'JSONEachRow',
      });

      inserted = readings.length;
    } catch (error) {
      console.error('[ClickHouse] Insert sensor readings error:', error);
      errors = readings.length;
    }

    return { inserted, errors };
  }

  /**
   * 写入故障事件
   */
  async insertFaultEvent(event: FaultEvent): Promise<boolean> {
    const client = this.getClient();

    try {
      await client.insert({
        table: `${this.config.database}.fault_events`,
        values: [{
          event_id: event.event_id,
          device_id: event.device_id,
          fault_code: event.fault_code,
          fault_type: event.fault_type,
          severity: event.severity,
          description: event.description,
          root_cause: event.root_cause || null,
          resolution: event.resolution || null,
          start_time: this.formatDateTime(event.start_time),
          end_time: event.end_time ? this.formatDateTime(event.end_time) : null,
          duration_seconds: event.duration_seconds || null,
          affected_sensors: event.affected_sensors,
          metadata: JSON.stringify(event.metadata || {}),
        }],
        format: 'JSONEachRow',
      });

      return true;
    } catch (error) {
      console.error('[ClickHouse] Insert fault event error:', error);
      return false;
    }
  }

  /**
   * 批量写入故障事件
   */
  async insertFaultEvents(events: FaultEvent[]): Promise<{ inserted: number; errors: number }> {
    if (events.length === 0) return { inserted: 0, errors: 0 };

    let inserted = 0;
    let errors = 0;

    for (const event of events) {
      const success = await this.insertFaultEvent(event);
      if (success) {
        inserted++;
      } else {
        errors++;
      }
    }

    return { inserted, errors };
  }

  // ============ 数据查询方法 ============

  /**
   * 查询原始传感器数据
   */
  async querySensorReadingsRaw(filter: QueryFilter): Promise<SensorReadingRaw[]> {
    const client = this.getClient();
    const { query, params } = this.buildQueryWithFilter(
      `SELECT device_id, sensor_id, metric_name, value, unit, quality, timestamp, metadata
       FROM ${this.config.database}.sensor_readings_raw`,
      filter
    );

    try {
      const result = await client.query({ query, query_params: params, format: 'JSONEachRow' });
      const rows = await result.json() as any[];

      return rows.map(row => ({
        device_id: row.device_id,
        sensor_id: row.sensor_id,
        metric_name: row.metric_name,
        value: row.value,
        unit: row.unit,
        quality: row.quality,
        timestamp: new Date(row.timestamp),
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      }));
    } catch (error) {
      console.error('[ClickHouse] Query raw readings error:', error);
      return [];
    }
  }

  /**
   * 查询分钟聚合数据
   */
  async querySensorReadings1m(filter: QueryFilter): Promise<SensorReadingAggregated[]> {
    return this.queryAggregatedData(`${this.config.database}.sensor_readings_1m`, filter);
  }

  /**
   * 查询小时聚合数据
   */
  async querySensorReadings1h(filter: QueryFilter): Promise<SensorReadingAggregated[]> {
    return this.queryAggregatedData(`${this.config.database}.sensor_readings_1h`, filter);
  }

  /**
   * 查询聚合数据（通用方法）
   */
  private async queryAggregatedData(table: string, filter: QueryFilter): Promise<SensorReadingAggregated[]> {
    const client = this.getClient();
    const { query, params } = this.buildAggregatedQueryWithFilter(
      `SELECT device_id, sensor_id, metric_name, window_start, window_end,
              sample_count, sum_value, min_value, max_value, avg_value, std_dev,
              first_value, last_value
       FROM ${table}`,
      filter
    );

    try {
      const result = await client.query({ query, query_params: params, format: 'JSONEachRow' });
      const rows = await result.json() as any[];

      return rows.map(row => ({
        device_id: row.device_id,
        sensor_id: row.sensor_id,
        metric_name: row.metric_name,
        window_start: new Date(row.window_start),
        window_end: new Date(row.window_end),
        sample_count: row.sample_count,
        sum_value: row.sum_value,
        min_value: row.min_value,
        max_value: row.max_value,
        avg_value: row.avg_value,
        std_dev: row.std_dev,
        first_value: row.first_value,
        last_value: row.last_value,
      }));
    } catch (error) {
      console.error('[ClickHouse] Query aggregated data error:', error);
      return [];
    }
  }

  /**
   * 查询故障事件
   */
  async queryFaultEvents(filter: QueryFilter & {
    severities?: string[];
    faultCodes?: string[];
    faultTypes?: string[];
    onlyActive?: boolean;
  }): Promise<FaultEvent[]> {
    const client = this.getClient();

    let query = `
      SELECT event_id, device_id, fault_code, fault_type, severity, description,
             root_cause, resolution, start_time, end_time, duration_seconds,
             affected_sensors, metadata
      FROM ${this.config.database}.fault_events
      WHERE 1=1
    `;

    const params: Record<string, unknown> = {};

    if (filter.deviceIds && filter.deviceIds.length > 0) {
      query += ` AND device_id IN ({deviceIds:Array(String)})`;
      params.deviceIds = filter.deviceIds;
    }

    if (filter.severities && filter.severities.length > 0) {
      query += ` AND severity IN ({severities:Array(String)})`;
      params.severities = filter.severities;
    }

    if (filter.faultCodes && filter.faultCodes.length > 0) {
      query += ` AND fault_code IN ({faultCodes:Array(String)})`;
      params.faultCodes = filter.faultCodes;
    }

    if (filter.faultTypes && filter.faultTypes.length > 0) {
      query += ` AND fault_type IN ({faultTypes:Array(String)})`;
      params.faultTypes = filter.faultTypes;
    }

    if (filter.onlyActive) {
      query += ` AND end_time IS NULL`;
    }

    if (filter.timeRange) {
      query += ` AND start_time >= {startTime:DateTime64(3)} AND start_time <= {endTime:DateTime64(3)}`;
      params.startTime = this.formatDateTime(filter.timeRange.start);
      params.endTime = this.formatDateTime(filter.timeRange.end);
    }

    query += ` ORDER BY start_time ${filter.orderBy === 'asc' ? 'ASC' : 'DESC'}`;

    if (filter.limit) {
      query += ` LIMIT {limit:UInt32}`;
      params.limit = filter.limit;
    }

    if (filter.offset) {
      query += ` OFFSET {offset:UInt32}`;
      params.offset = filter.offset;
    }

    try {
      const result = await client.query({ query, query_params: params, format: 'JSONEachRow' });
      const rows = await result.json() as any[];

      return rows.map(row => ({
        event_id: row.event_id,
        device_id: row.device_id,
        fault_code: row.fault_code,
        fault_type: row.fault_type,
        severity: row.severity,
        description: row.description,
        root_cause: row.root_cause,
        resolution: row.resolution,
        start_time: new Date(row.start_time),
        end_time: row.end_time ? new Date(row.end_time) : undefined,
        duration_seconds: row.duration_seconds,
        affected_sensors: row.affected_sensors,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      }));
    } catch (error) {
      console.error('[ClickHouse] Query fault events error:', error);
      return [];
    }
  }

  // ============ 统计查询方法 ============

  /**
   * 获取设备统计信息
   */
  async getDeviceStatistics(deviceId: string, timeRange: TimeRange): Promise<{
    totalReadings: number;
    avgValue: number;
    minValue: number;
    maxValue: number;
    stdDev: number;
    faultCount: number;
    criticalFaults: number;
  }> {
    const client = this.getClient();

    try {
      // 传感器数据统计
      const sensorQuery = `
        SELECT
          count() as total_readings,
          avg(value) as avg_value,
          min(value) as min_value,
          max(value) as max_value,
          stddevPop(value) as std_dev
        FROM ${this.config.database}.sensor_readings_raw
        WHERE device_id = {deviceId:String}
          AND timestamp >= {startTime:DateTime64(3)}
          AND timestamp <= {endTime:DateTime64(3)}
      `;

      const sensorResult = await client.query({
        query: sensorQuery,
        query_params: {
          deviceId,
          startTime: this.formatDateTime(timeRange.start),
          endTime: this.formatDateTime(timeRange.end),
        },
        format: 'JSONEachRow',
      });

      const sensorRows = await sensorResult.json() as any[];
      const sensorStats = sensorRows[0] || {};

      // 故障统计
      const faultQuery = `
        SELECT
          count() as fault_count,
          countIf(severity = 'critical') as critical_faults
        FROM ${this.config.database}.fault_events
        WHERE device_id = {deviceId:String}
          AND start_time >= {startTime:DateTime64(3)}
          AND start_time <= {endTime:DateTime64(3)}
      `;

      const faultResult = await client.query({
        query: faultQuery,
        query_params: {
          deviceId,
          startTime: this.formatDateTime(timeRange.start),
          endTime: this.formatDateTime(timeRange.end),
        },
        format: 'JSONEachRow',
      });

      const faultRows = await faultResult.json() as any[];
      const faultStats = faultRows[0] || {};

      return {
        totalReadings: sensorStats.total_readings || 0,
        avgValue: sensorStats.avg_value || 0,
        minValue: sensorStats.min_value || 0,
        maxValue: sensorStats.max_value || 0,
        stdDev: sensorStats.std_dev || 0,
        faultCount: faultStats.fault_count || 0,
        criticalFaults: faultStats.critical_faults || 0,
      };
    } catch (error) {
      console.error('[ClickHouse] Get device statistics error:', error);
      return {
        totalReadings: 0,
        avgValue: 0,
        minValue: 0,
        maxValue: 0,
        stdDev: 0,
        faultCount: 0,
        criticalFaults: 0,
      };
    }
  }

  /**
   * 获取集群状态
   */
  async getClusterStatus(): Promise<{
    nodes: Array<{
      host: string;
      status: 'online' | 'offline';
      latencyMs: number;
    }>;
    totalTables: number;
    totalRows: number;
    diskUsage: string;
    replicationStatus: string;
  }> {
    const nodes: Array<{ host: string; status: 'online' | 'offline'; latencyMs: number }> = [];

    for (const nodeKey of Array.from(this.clients.keys())) {
      const client = this.clients.get(nodeKey)!;
      const start = Date.now();
      try {
        await client.query({ query: 'SELECT 1' });
        nodes.push({
          host: nodeKey,
          status: 'online',
          latencyMs: Date.now() - start,
        });
      } catch {
        nodes.push({
          host: nodeKey,
          status: 'offline',
          latencyMs: -1,
        });
      }
    }

    // 获取表统计
    const client = this.getClient();
    let totalTables = 0;
    let totalRows = 0;
    let diskUsage = '0 B';
    let replicationStatus = 'unknown';

    try {
      const statsQuery = `
        SELECT
          count() as table_count,
          sum(total_rows) as total_rows,
          formatReadableSize(sum(total_bytes)) as disk_usage
        FROM system.tables
        WHERE database = '${this.config.database}'
      `;

      const result = await client.query({ query: statsQuery, format: 'JSONEachRow' });
      const rows = await result.json() as any[];
      const stats = rows[0] || {};

      totalTables = stats.table_count || 0;
      totalRows = stats.total_rows || 0;
      diskUsage = stats.disk_usage || '0 B';

      // 检查复制状态
      if (this.config.nodes.length > 1) {
        const replicaQuery = `
          SELECT count() as replica_count
          FROM system.replicas
          WHERE database = '${this.config.database}'
            AND is_readonly = 0
        `;
        const replicaResult = await client.query({ query: replicaQuery, format: 'JSONEachRow' });
        const replicaRows = await replicaResult.json() as any[];
        const replicaCount = replicaRows[0]?.replica_count || 0;
        replicationStatus = replicaCount > 0 ? 'healthy' : 'degraded';
      } else {
        replicationStatus = 'single-node';
      }
    } catch (error) {
      console.error('[ClickHouse] Get cluster status error:', error);
    }

    return {
      nodes,
      totalTables,
      totalRows,
      diskUsage,
      replicationStatus,
    };
  }

  /**
   * 获取数据保留统计
   */
  async getRetentionStats(): Promise<{
    rawData: { count: number; oldestDate: Date | null; newestDate: Date | null };
    minuteData: { count: number; oldestDate: Date | null; newestDate: Date | null };
    hourData: { count: number; oldestDate: Date | null; newestDate: Date | null };
    faultEvents: { count: number; oldestDate: Date | null; newestDate: Date | null };
  }> {
    const client = this.getClient();

    const getTableStats = async (table: string, timeColumn: string) => {
      try {
        const query = `
          SELECT
            count() as count,
            min(${timeColumn}) as oldest,
            max(${timeColumn}) as newest
          FROM ${this.config.database}.${table}
        `;
        const result = await client.query({ query, format: 'JSONEachRow' });
        const rows = await result.json() as any[];
        const stats = rows[0] || {};

        return {
          count: stats.count || 0,
          oldestDate: stats.oldest ? new Date(stats.oldest) : null,
          newestDate: stats.newest ? new Date(stats.newest) : null,
        };
      } catch {
        return { count: 0, oldestDate: null, newestDate: null };
      }
    };

    return {
      rawData: await getTableStats('sensor_readings_raw', 'timestamp'),
      minuteData: await getTableStats('sensor_readings_1m', 'window_start'),
      hourData: await getTableStats('sensor_readings_1h', 'window_start'),
      faultEvents: await getTableStats('fault_events', 'start_time'),
    };
  }

  // ============ 辅助方法 ============

  private formatDateTime(date: Date): string {
    return date.toISOString().replace('T', ' ').replace('Z', '');
  }

  private buildQueryWithFilter(baseQuery: string, filter: QueryFilter): { query: string; params: Record<string, unknown> } {
    let query = baseQuery + ' WHERE 1=1';
    const params: Record<string, unknown> = {};

    if (filter.deviceIds && filter.deviceIds.length > 0) {
      query += ` AND device_id IN ({deviceIds:Array(String)})`;
      params.deviceIds = filter.deviceIds;
    }

    if (filter.sensorIds && filter.sensorIds.length > 0) {
      query += ` AND sensor_id IN ({sensorIds:Array(String)})`;
      params.sensorIds = filter.sensorIds;
    }

    if (filter.metricNames && filter.metricNames.length > 0) {
      query += ` AND metric_name IN ({metricNames:Array(String)})`;
      params.metricNames = filter.metricNames;
    }

    if (filter.qualities && filter.qualities.length > 0) {
      query += ` AND quality IN ({qualities:Array(String)})`;
      params.qualities = filter.qualities;
    }

    if (filter.timeRange) {
      query += ` AND timestamp >= {startTime:DateTime64(3)} AND timestamp <= {endTime:DateTime64(3)}`;
      params.startTime = this.formatDateTime(filter.timeRange.start);
      params.endTime = this.formatDateTime(filter.timeRange.end);
    }

    query += ` ORDER BY timestamp ${filter.orderBy === 'asc' ? 'ASC' : 'DESC'}`;

    if (filter.limit) {
      query += ` LIMIT {limit:UInt32}`;
      params.limit = filter.limit;
    }

    if (filter.offset) {
      query += ` OFFSET {offset:UInt32}`;
      params.offset = filter.offset;
    }

    return { query, params };
  }

  private buildAggregatedQueryWithFilter(baseQuery: string, filter: QueryFilter): { query: string; params: Record<string, unknown> } {
    let query = baseQuery + ' WHERE 1=1';
    const params: Record<string, unknown> = {};

    if (filter.deviceIds && filter.deviceIds.length > 0) {
      query += ` AND device_id IN ({deviceIds:Array(String)})`;
      params.deviceIds = filter.deviceIds;
    }

    if (filter.sensorIds && filter.sensorIds.length > 0) {
      query += ` AND sensor_id IN ({sensorIds:Array(String)})`;
      params.sensorIds = filter.sensorIds;
    }

    if (filter.metricNames && filter.metricNames.length > 0) {
      query += ` AND metric_name IN ({metricNames:Array(String)})`;
      params.metricNames = filter.metricNames;
    }

    if (filter.timeRange) {
      query += ` AND window_start >= {startTime:DateTime} AND window_start <= {endTime:DateTime}`;
      params.startTime = this.formatDateTime(filter.timeRange.start);
      params.endTime = this.formatDateTime(filter.timeRange.end);
    }

    query += ` ORDER BY window_start ${filter.orderBy === 'asc' ? 'ASC' : 'DESC'}`;

    if (filter.limit) {
      query += ` LIMIT {limit:UInt32}`;
      params.limit = filter.limit;
    }

    if (filter.offset) {
      query += ` OFFSET {offset:UInt32}`;
      params.offset = filter.offset;
    }

    return { query, params };
  }

  /**
   * Ping 检查连接
   */
  async ping(): Promise<boolean> {
    try {
      const client = this.getClient();
      await client.query({ query: 'SELECT 1' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 关闭所有连接
   */
  async close(): Promise<void> {
    for (const nodeKey of Array.from(this.clients.keys())) {
      const client = this.clients.get(nodeKey)!;
      try {
        await client.close();
        console.log(`[ClickHouse] Closed connection to ${nodeKey}`);
      } catch (error) {
        console.error(`[ClickHouse] Error closing connection to ${nodeKey}:`, error);
      }
    }
    this.clients.clear();
    this.isInitialized = false;
  }
}

// 导出单例
export const clickhouseStorage = new ClickHouseStorage();
export default clickhouseStorage;
