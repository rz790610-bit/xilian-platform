/**
 * 存储引擎健康检查服务
 * 统一检测所有数据库/存储服务的连接状态和基本指标
 */
import { sql } from 'drizzle-orm';
import { getDb } from '../db';

interface StorageEngineStatus {
  name: string;
  type: string;
  icon: string;
  description: string;
  status: 'online' | 'offline' | 'standby';
  latency: number; // ms
  connectionInfo: string;
  metrics: Record<string, string | number>;
  error?: string;
}

/**
 * 检测 MySQL 连接状态
 */
async function checkMySQL(): Promise<StorageEngineStatus> {
  const start = Date.now();
  try {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.execute(sql`SELECT 1`);
    const latency = Date.now() - start;

    // 获取基本指标
    const statusResult: any = await db.execute(sql.raw("SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected', 'Questions', 'Uptime')"));
    const statusRows = Array.isArray(statusResult) ? (statusResult[0] || statusResult) : [];
    const statusMap: Record<string, string> = {};
    for (const row of statusRows) {
      if (row?.Variable_name) statusMap[row.Variable_name] = row.Value;
    }

    const tableResult: any = await db.execute(sql.raw("SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()"));
    const tableRows = Array.isArray(tableResult) ? (tableResult[0] || tableResult) : [];
    const tableCount = tableRows[0]?.cnt ?? 0;

    return {
      name: 'MySQL 8.0',
      type: 'RDBMS',
      icon: '🐬',
      description: '关系型主数据库，存储资产树、配置、事件等结构化数据',
      status: 'online',
      latency,
      connectionInfo: '已连接',
      metrics: {
        '数据表': tableCount,
        '连接数': statusMap['Threads_connected'] ?? '-',
        '查询总数': statusMap['Questions'] ?? '-',
        '运行时间': `${Math.floor(Number(statusMap['Uptime'] || 0) / 3600)}h`,
      }
    };
  } catch (e: any) {
    return {
      name: 'MySQL 8.0',
      type: 'RDBMS',
      icon: '🐬',
      description: '关系型主数据库，存储资产树、配置、事件等结构化数据',
      status: 'offline',
      latency: Date.now() - start,
      connectionInfo: '未连接',
      metrics: { '数据表': '-', '连接数': '-', '查询总数': '-', '运行时间': '-' },
      error: e.message
    };
  }
}

/**
 * 检测 Redis 连接状态
 */
async function checkRedis(): Promise<StorageEngineStatus> {
  const start = Date.now();
  try {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = process.env.REDIS_PORT || '6379';
    const response = await fetchWithTimeout(`http://localhost:3000/api/trpc/redis.healthCheck`, 3000);
    const latency = Date.now() - start;

    if (response.ok) {
      const data = await response.json();
      const result = data?.result?.data;
      return {
        name: 'Redis 7',
        type: 'Cache',
        icon: '🔴',
        description: '缓存层，用于设备状态缓存、会话管理、事件去重',
        status: result?.connected ? 'online' : 'offline',
        latency,
        connectionInfo: result?.connected ? '已连接' : '未连接',
        metrics: {
          '缓存键': result?.keyCount ?? '-',
          '内存使用': result?.memoryUsage ?? '-',
          '命中率': result?.hitRate ?? '-',
          '连接数': result?.connectedClients ?? '-',
        }
      };
    }
    throw new Error('Redis health check failed');
  } catch (e: any) {
    // 直接尝试 TCP 连接检测
    const latency = Date.now() - start;
    try {
      const net = await import('net');
      const host = process.env.REDIS_HOST || 'localhost';
      const port = parseInt(process.env.REDIS_PORT || '6379');
      const connected = await new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
        socket.on('error', () => { socket.destroy(); resolve(false); });
        socket.connect(port, host);
      });
      return {
        name: 'Redis 7',
        type: 'Cache',
        icon: '🔴',
        description: '缓存层，用于设备状态缓存、会话管理、事件去重',
        status: connected ? 'online' : 'offline',
        latency: Date.now() - start,
        connectionInfo: connected ? '已连接' : '未连接',
        metrics: { '缓存键': '-', '内存使用': '-', '命中率': '-', '连接数': '-' },
      };
    } catch {
      return {
        name: 'Redis 7',
        type: 'Cache',
        icon: '🔴',
        description: '缓存层，用于设备状态缓存、会话管理、事件去重',
        status: 'offline',
        latency,
        connectionInfo: '未连接',
        metrics: { '缓存键': '-', '内存使用': '-', '命中率': '-', '连接数': '-' },
        error: e.message
      };
    }
  }
}

/**
 * 检测 ClickHouse 连接状态
 */
async function checkClickHouse(): Promise<StorageEngineStatus> {
  const start = Date.now();
  try {
    const host = process.env.CLICKHOUSE_HOST || 'localhost';
    const port = process.env.CLICKHOUSE_PORT || '8123';
    const response = await fetchWithTimeout(`http://${host}:${port}/ping`, 3000);
    const latency = Date.now() - start;

    if (response.ok) {
      // 尝试获取指标
      let metrics: Record<string, string | number> = {};
      try {
        const user = process.env.CLICKHOUSE_USER || 'default';
        const password = process.env.CLICKHOUSE_PASSWORD || '';
        const dbName = process.env.CLICKHOUSE_DATABASE || 'portai_timeseries';
        const headers: Record<string, string> = {};
        if (user) headers['X-ClickHouse-User'] = user;
        if (password) headers['X-ClickHouse-Key'] = password;

        const tablesRes = await fetchWithTimeout(
          `http://${host}:${port}/?query=SELECT+count()+FROM+system.tables+WHERE+database='${dbName}'+FORMAT+JSON`,
          3000, { headers }
        );
        if (tablesRes.ok) {
          const data = await tablesRes.json();
          metrics['时序表'] = data?.data?.[0]?.['count()'] ?? '-';
        }

        const uptimeRes = await fetchWithTimeout(
          `http://${host}:${port}/?query=SELECT+uptime()+as+uptime+FORMAT+JSON`,
          3000, { headers }
        );
        if (uptimeRes.ok) {
          const data = await uptimeRes.json();
          const uptime = data?.data?.[0]?.uptime ?? 0;
          metrics['运行时间'] = `${Math.floor(uptime / 3600)}h`;
        }

        metrics['数据点'] = '-';
        metrics['压缩率'] = '-';
      } catch {
        metrics = { '时序表': '-', '数据点': '-', '压缩率': '-', '运行时间': '-' };
      }

      return {
        name: 'ClickHouse',
        type: 'TSDB',
        icon: '⚡',
        description: '时序数据库，用于存储高频传感器数据和聚合指标',
        status: 'online',
        latency,
        connectionInfo: '已连接',
        metrics
      };
    }
    throw new Error('ClickHouse ping failed');
  } catch (e: any) {
    return {
      name: 'ClickHouse',
      type: 'TSDB',
      icon: '⚡',
      description: '时序数据库，用于存储高频传感器数据和聚合指标',
      status: 'offline',
      latency: Date.now() - start,
      connectionInfo: '未连接',
      metrics: { '时序表': '-', '数据点': '-', '压缩率': '-', '查询延迟': '-' },
      error: e.message
    };
  }
}

/**
 * 检测 MinIO 连接状态
 */
async function checkMinIO(): Promise<StorageEngineStatus> {
  const start = Date.now();
  try {
    const endpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9010';
    // MinIO health endpoint
    const url = endpoint.startsWith('http') ? `${endpoint}/minio/health/live` : `http://${endpoint}/minio/health/live`;
    const response = await fetchWithTimeout(url, 3000);
    const latency = Date.now() - start;

    if (response.ok) {
      return {
        name: 'MinIO / S3',
        type: 'Object Store',
        icon: '📦',
        description: '对象存储，用于存储波形文件、频谱图、模型文件等大文件',
        status: 'online',
        latency,
        connectionInfo: '已连接',
        metrics: {
          '存储桶': '5 (预设)',
          '对象数': '-',
          '总容量': '-',
          '可用空间': '-',
        }
      };
    }
    throw new Error('MinIO health check failed');
  } catch (e: any) {
    return {
      name: 'MinIO / S3',
      type: 'Object Store',
      icon: '📦',
      description: '对象存储，用于存储波形文件、频谱图、模型文件等大文件',
      status: 'offline',
      latency: Date.now() - start,
      connectionInfo: '未连接',
      metrics: { '存储桶': '-', '对象数': '-', '总容量': '-', '可用空间': '-' },
      error: e.message
    };
  }
}

/**
 * 检测 Qdrant 连接状态
 */
async function checkQdrant(): Promise<StorageEngineStatus> {
  const start = Date.now();
  try {
    const host = process.env.QDRANT_URL || process.env.QDRANT_HOST || 'http://localhost:6333';
    const url = host.startsWith('http') ? host : `http://${host}`;
    const response = await fetchWithTimeout(`${url}/collections`, 3000);
    const latency = Date.now() - start;

    if (response.ok) {
      const data = await response.json();
      const collections = data?.result?.collections ?? [];
      return {
        name: 'Qdrant',
        type: 'Vector DB',
        icon: '🧮',
        description: '向量数据库，用于相似故障检索和语义搜索',
        status: 'online',
        latency,
        connectionInfo: '已连接',
        metrics: {
          '集合数': collections.length,
          '向量数': '-',
          '维度': '-',
          '索引状态': collections.length > 0 ? '正常' : '空',
        }
      };
    }
    throw new Error('Qdrant check failed');
  } catch (e: any) {
    return {
      name: 'Qdrant',
      type: 'Vector DB',
      icon: '🧮',
      description: '向量数据库，用于相似故障检索和语义搜索',
      status: 'offline',
      latency: Date.now() - start,
      connectionInfo: '未连接',
      metrics: { '集合数': '-', '向量数': '-', '维度': '-', '索引状态': '-' },
      error: e.message
    };
  }
}

/**
 * 检测 Kafka 连接状态
 */
async function checkKafka(): Promise<StorageEngineStatus> {
  const start = Date.now();
  try {
    const net = await import('net');
    const brokers = process.env.KAFKA_BROKERS || 'localhost:9092';
    const [host, portStr] = brokers.split(',')[0].split(':');
    const port = parseInt(portStr || '9092');

    const connected = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
      socket.on('error', () => { socket.destroy(); resolve(false); });
      socket.connect(port, host);
    });
    const latency = Date.now() - start;

    return {
      name: 'Kafka',
      type: 'Message Queue',
      icon: '📨',
      description: '消息队列，用于事件总线、数据流处理和异步通信',
      status: connected ? 'online' : 'offline',
      latency,
      connectionInfo: connected ? '已连接' : '未连接',
      metrics: {
        'Broker': connected ? '1' : '-',
        'Topics': '-',
        '分区数': '-',
        '消息延迟': connected ? `${latency}ms` : '-',
      }
    };
  } catch (e: any) {
    return {
      name: 'Kafka',
      type: 'Message Queue',
      icon: '📨',
      description: '消息队列，用于事件总线、数据流处理和异步通信',
      status: 'offline',
      latency: Date.now() - start,
      connectionInfo: '未连接',
      metrics: { 'Broker': '-', 'Topics': '-', '分区数': '-', '消息延迟': '-' },
      error: e.message
    };
  }
}

/**
 * 检测 Neo4j 连接状态
 */
async function checkNeo4j(): Promise<StorageEngineStatus> {
  const start = Date.now();
  try {
    const host = process.env.NEO4J_HOST || 'localhost';
    const port = process.env.NEO4J_HTTP_PORT || '7474';
    // Neo4j HTTP API endpoint
    const response = await fetchWithTimeout(`http://${host}:${port}`, 3000);
    const latency = Date.now() - start;

    if (response.ok) {
      return {
        name: 'Neo4j',
        type: 'Graph DB',
        icon: '🕸️',
        description: '图数据库，用于知识图谱和设备关系拓扑（Cypher 查询语言）',
        status: 'online',
        latency,
        connectionInfo: '已连接',
        metrics: {
          '顶点数': '-',
          '边数': '-',
          '数据库': 'neo4j',
          '查询延迟': `${latency}ms`,
        }
      };
    }
    throw new Error('Neo4j check failed');
  } catch (e: any) {
    return {
      name: 'Neo4j',
      type: 'Graph DB',
      icon: '🕸️',
      description: '图数据库，用于知识图谱和设备关系拓扑（Cypher 查询语言）',
      status: 'offline',
      latency: Date.now() - start,
      connectionInfo: '未连接',
      metrics: { '顶点数': '-', '边数': '-', '数据库': '-', '查询延迟': '-' },
      error: e.message
    };
  }
}

/**
 * 带超时的 fetch
 */
async function fetchWithTimeout(url: string, timeoutMs: number, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 检测所有存储引擎状态
 */
export async function checkAllStorageEngines(): Promise<{
  engines: StorageEngineStatus[];
  summary: {
    total: number;
    online: number;
    offline: number;
    checkedAt: string;
  };
}> {
  // 并行检测所有服务
  const results = await Promise.allSettled([
    checkMySQL(),
    checkRedis(),
    checkClickHouse(),
    checkMinIO(),
    checkQdrant(),
    checkKafka(),
    checkNeo4j(),
  ]);

  const engines = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    // fallback for rejected promises
    const names = ['MySQL 8.0', 'Redis 7', 'ClickHouse', 'MinIO / S3', 'Qdrant', 'Kafka', 'Neo4j'];
    return {
      name: names[i],
      type: 'Unknown',
      icon: '❓',
      description: '',
      status: 'offline' as const,
      latency: 0,
      connectionInfo: '检测失败',
      metrics: {},
      error: r.reason?.message || 'Unknown error'
    };
  });

  const online = engines.filter(e => e.status === 'online').length;

  return {
    engines,
    summary: {
      total: engines.length,
      online,
      offline: engines.length - online,
      checkedAt: new Date().toISOString(),
    }
  };
}
