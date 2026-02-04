/**
 * 真实数据库监控客户端
 * 连接 MySQL、Redis、ClickHouse、Qdrant 获取真实状态
 */

import { getDb } from '../../db';
import { sql } from 'drizzle-orm';
import { redisClient } from '../../redis/redisClient';
import { getClickHouseClient, checkConnection as checkClickHouseConnection } from '../../clickhouse/clickhouseClient';
import { QdrantClient } from '@qdrant/js-client-rest';
import type { DatabaseStatus } from '../monitoringService';

// Qdrant 客户端单例
let qdrantClientInstance: QdrantClient | null = null;

function getQdrantClient(): QdrantClient {
  if (!qdrantClientInstance) {
    qdrantClientInstance = new QdrantClient({
      host: process.env.QDRANT_HOST || 'localhost',
      port: parseInt(process.env.QDRANT_PORT || '6333'),
    });
  }
  return qdrantClientInstance;
}

/**
 * MySQL 状态监控
 */
export async function getMySQLStatus(): Promise<DatabaseStatus> {
  const startTime = Date.now();
  
  try {
    const db = await getDb();
    if (!db) {
      throw new Error('Database not connected');
    }
    
    // 获取全局状态
    const statusResult = await db.execute(sql`SHOW GLOBAL STATUS`);
    const statusMap = new Map<string, string>();
    if (Array.isArray(statusResult)) {
      statusResult.forEach((row: any) => {
        if (row.Variable_name && row.Value !== undefined) {
          statusMap.set(row.Variable_name, String(row.Value));
        }
      });
    }

    // 获取连接信息
    const processResult = await db!.execute(sql`SHOW PROCESSLIST`);
    const activeConnections = Array.isArray(processResult) ? processResult.length : 0;

    // 获取最大连接数
    const variableResult = await db!.execute(sql`SHOW VARIABLES LIKE 'max_connections'`);
    const maxConnections = Array.isArray(variableResult) && variableResult[0] 
      ? parseInt(String((variableResult[0] as any).Value) || '151') 
      : 151;

    // 获取版本
    const versionResult = await db!.execute(sql`SELECT VERSION() as version`);
    const version = Array.isArray(versionResult) && versionResult[0] 
      ? String((versionResult[0] as any).version) 
      : '8.0';

    // 计算查询延迟
    const queryLatency = Date.now() - startTime;

    // 获取数据库大小
    const sizeResult = await db!.execute(sql`
      SELECT SUM(data_length + index_length) as total_size 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE()
    `);
    const totalSize = Array.isArray(sizeResult) && sizeResult[0] 
      ? parseInt(String((sizeResult[0] as any).total_size) || '0') 
      : 0;

    return {
      name: 'MySQL',
      type: 'mysql',
      status: 'online',
      version: version.split('-')[0], // 去掉后缀
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '3306'),
      connections: {
        active: activeConnections,
        idle: Math.max(0, maxConnections - activeConnections),
        max: maxConnections,
      },
      performance: {
        queryLatencyMs: queryLatency,
        throughputQps: parseInt(statusMap.get('Queries') || '0'),
        errorRate: 0,
      },
      storage: {
        usedBytes: totalSize,
        totalBytes: 100 * 1024 * 1024 * 1024, // 100GB 默认
        usagePercent: (totalSize / (100 * 1024 * 1024 * 1024)) * 100,
      },
      lastCheck: new Date(),
      uptime: parseInt(statusMap.get('Uptime') || '0'),
    };
  } catch (error: any) {
    return {
      name: 'MySQL',
      type: 'mysql',
      status: 'offline',
      version: 'unknown',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '3306'),
      connections: { active: 0, idle: 0, max: 0 },
      performance: { queryLatencyMs: 0, throughputQps: 0, errorRate: 100 },
      storage: { usedBytes: 0, totalBytes: 0, usagePercent: 0 },
      lastCheck: new Date(),
      uptime: 0,
    };
  }
}

/**
 * Redis 状态监控
 */
export async function getRedisStatus(): Promise<DatabaseStatus> {
  const startTime = Date.now();
  
  try {
    const client = redisClient.getClient();
    if (!client) {
      throw new Error('Redis client not available');
    }
    const info = await client.info();
    const parsed = parseRedisInfo(info);
    
    const queryLatency = Date.now() - startTime;

    return {
      name: 'Redis',
      type: 'redis',
      status: 'online',
      version: parsed.redis_version || 'unknown',
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      connections: {
        active: parseInt(parsed.connected_clients || '0'),
        idle: 0,
        max: parseInt(parsed.maxclients || '10000'),
      },
      performance: {
        queryLatencyMs: queryLatency,
        throughputQps: parseInt(parsed.instantaneous_ops_per_sec || '0'),
        errorRate: 0,
      },
      storage: {
        usedBytes: parseInt(parsed.used_memory || '0'),
        totalBytes: parseInt(parsed.maxmemory || '0') || 16 * 1024 * 1024 * 1024,
        usagePercent: parsed.maxmemory && parsed.maxmemory !== '0'
          ? (parseInt(parsed.used_memory || '0') / parseInt(parsed.maxmemory)) * 100
          : 0,
      },
      lastCheck: new Date(),
      uptime: parseInt(parsed.uptime_in_seconds || '0'),
    };
  } catch (error: any) {
    return {
      name: 'Redis',
      type: 'redis',
      status: 'offline',
      version: 'unknown',
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      connections: { active: 0, idle: 0, max: 0 },
      performance: { queryLatencyMs: 0, throughputQps: 0, errorRate: 100 },
      storage: { usedBytes: 0, totalBytes: 0, usagePercent: 0 },
      lastCheck: new Date(),
      uptime: 0,
    };
  }
}

/**
 * ClickHouse 状态监控
 */
export async function getClickHouseStatus(): Promise<DatabaseStatus> {
  const startTime = Date.now();
  
  try {
    // 检查连接
    const isConnected = await checkClickHouseConnection();
    if (!isConnected) {
      throw new Error('ClickHouse connection failed');
    }

    const client = getClickHouseClient();

    // 获取版本
    const versionResult = await client.query({
      query: 'SELECT version() as version',
      format: 'JSONEachRow',
    });
    const versionData = await versionResult.json() as { version: string }[];
    const version = versionData[0]?.version || 'unknown';

    // 获取当前查询数
    const processResult = await client.query({
      query: 'SELECT count() as cnt FROM system.processes',
      format: 'JSONEachRow',
    });
    const processData = await processResult.json() as { cnt: string }[];
    const activeQueries = parseInt(processData[0]?.cnt || '0');

    // 获取数据库大小
    const sizeResult = await client.query({
      query: `
        SELECT 
          sum(bytes) as total_bytes,
          sum(rows) as total_rows
        FROM system.parts 
        WHERE active
      `,
      format: 'JSONEachRow',
    });
    const sizeData = await sizeResult.json() as { total_bytes: string; total_rows: string }[];
    const totalBytes = parseInt(sizeData[0]?.total_bytes || '0');

    // 获取指标
    const metricsResult = await client.query({
      query: `
        SELECT 
          metric,
          value
        FROM system.metrics 
        WHERE metric IN ('Query', 'TCPConnection', 'HTTPConnection')
      `,
      format: 'JSONEachRow',
    });
    const metricsData = await metricsResult.json() as { metric: string; value: number }[];
    const metricsMap = new Map<string, number>();
    for (const m of metricsData) {
      metricsMap.set(m.metric, m.value);
    }

    const queryLatency = Date.now() - startTime;

    return {
      name: 'ClickHouse',
      type: 'clickhouse',
      status: 'online',
      version,
      host: process.env.CLICKHOUSE_HOST || 'localhost',
      port: parseInt(process.env.CLICKHOUSE_PORT || '8123'),
      connections: {
        active: (metricsMap.get('TCPConnection') || 0) + (metricsMap.get('HTTPConnection') || 0),
        idle: 0,
        max: 100,
      },
      performance: {
        queryLatencyMs: queryLatency,
        throughputQps: metricsMap.get('Query') || 0,
        errorRate: 0,
      },
      storage: {
        usedBytes: totalBytes,
        totalBytes: 10 * 1024 * 1024 * 1024 * 1024, // 10TB 默认
        usagePercent: (totalBytes / (10 * 1024 * 1024 * 1024 * 1024)) * 100,
      },
      lastCheck: new Date(),
      uptime: 0, // ClickHouse 没有直接的 uptime 指标
    };
  } catch (error: any) {
    return {
      name: 'ClickHouse',
      type: 'clickhouse',
      status: 'offline',
      version: 'unknown',
      host: process.env.CLICKHOUSE_HOST || 'localhost',
      port: parseInt(process.env.CLICKHOUSE_PORT || '8123'),
      connections: { active: 0, idle: 0, max: 0 },
      performance: { queryLatencyMs: 0, throughputQps: 0, errorRate: 100 },
      storage: { usedBytes: 0, totalBytes: 0, usagePercent: 0 },
      lastCheck: new Date(),
      uptime: 0,
    };
  }
}

/**
 * Qdrant 状态监控
 */
export async function getQdrantStatus(): Promise<DatabaseStatus> {
  const startTime = Date.now();
  
  try {
    // 获取集合列表
    const qdrantClient = getQdrantClient();
    const collections = await qdrantClient.getCollections();
    
    // 获取集合详情统计
    let totalVectors = 0;
    let totalBytes = 0;
    
    for (const collection of collections.collections) {
      try {
        const info = await getQdrantClient().getCollection(collection.name);
        totalVectors += info.points_count || 0;
        totalBytes += (info.points_count || 0) * 768 * 4; // 估算：768维 * 4字节
      } catch {
        // 忽略单个集合的错误
      }
    }

    const queryLatency = Date.now() - startTime;

    return {
      name: 'Qdrant',
      type: 'qdrant',
      status: 'online',
      version: '1.7.0', // Qdrant API 没有直接返回版本
      host: process.env.QDRANT_HOST || 'localhost',
      port: parseInt(process.env.QDRANT_PORT || '6333'),
      connections: {
        active: collections.collections.length,
        idle: 0,
        max: 100,
      },
      performance: {
        queryLatencyMs: queryLatency,
        throughputQps: 0,
        errorRate: 0,
      },
      storage: {
        usedBytes: totalBytes,
        totalBytes: 100 * 1024 * 1024 * 1024, // 100GB 默认
        usagePercent: (totalBytes / (100 * 1024 * 1024 * 1024)) * 100,
      },
      lastCheck: new Date(),
      uptime: 0,
    };
  } catch (error: any) {
    return {
      name: 'Qdrant',
      type: 'qdrant',
      status: 'offline',
      version: 'unknown',
      host: process.env.QDRANT_HOST || 'localhost',
      port: parseInt(process.env.QDRANT_PORT || '6333'),
      connections: { active: 0, idle: 0, max: 0 },
      performance: { queryLatencyMs: 0, throughputQps: 0, errorRate: 100 },
      storage: { usedBytes: 0, totalBytes: 0, usagePercent: 0 },
      lastCheck: new Date(),
      uptime: 0,
    };
  }
}

/**
 * 获取所有数据库状态
 */
export async function getAllDatabaseStatus(): Promise<DatabaseStatus[]> {
  const results = await Promise.allSettled([
    getMySQLStatus(),
    getRedisStatus(),
    getClickHouseStatus(),
    getQdrantStatus(),
  ]);

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    // 返回默认的离线状态
    const names = ['MySQL', 'Redis', 'ClickHouse', 'Qdrant'];
    const types = ['mysql', 'redis', 'clickhouse', 'qdrant'] as const;
    return {
      name: names[index],
      type: types[index],
      status: 'offline' as const,
      version: 'unknown',
      host: 'localhost',
      port: 0,
      connections: { active: 0, idle: 0, max: 0 },
      performance: { queryLatencyMs: 0, throughputQps: 0, errorRate: 100 },
      storage: { usedBytes: 0, totalBytes: 0, usagePercent: 0 },
      lastCheck: new Date(),
      uptime: 0,
    };
  });
}

/**
 * 解析 Redis INFO 命令输出
 */
function parseRedisInfo(info: string): Record<string, string> {
  const result: Record<string, string> = {};
  info.split('\n').forEach(line => {
    const [key, value] = line.split(':');
    if (key && value) {
      result[key.trim()] = value.trim();
    }
  });
  return result;
}
