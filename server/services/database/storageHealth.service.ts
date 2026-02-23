/**
 * 存储引擎健康检查服务
 * 统一检测所有数据库/存储服务的连接状态和基本指标
 * 集成 Docker 容器状态作为补充判断
 *
 * 配置来源：统一从 config.ts 读取，不直接引用 process.env
 */
import { sql } from 'drizzle-orm';
import { getDb } from '../../lib/db';
import { config } from '../../core/config';

interface StorageEngineStatus {
  name: string;
  type: string;
  icon: string;
  description: string;
  status: 'online' | 'offline' | 'starting' | 'standby';
  latency: number; // ms
  connectionInfo: string;
  metrics: Record<string, string | number>;
  error?: string;
  dockerStatus?: string; // Docker 容器状态（running / stopped / ...）
}

// Docker 容器名称到引擎名称的映射
const DOCKER_CONTAINER_MAP: Record<string, string> = {
  'portai-mysql': 'MySQL 8.0',
  'portai-redis': 'Redis 7',
  'portai-clickhouse': 'ClickHouse',
  'portai-minio': 'MinIO / S3',
  'portai-qdrant': 'Qdrant',
  'portai-kafka': 'Kafka',
  'portai-neo4j': 'Neo4j',
};

/**
 * 查询 Docker 容器状态
 */
async function getDockerContainerStatuses(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  try {
    const socketPath = config.docker.socketPath;
    const http = await import('http');
    
    const data = await new Promise<string>((resolve, reject) => {
      const req = http.request({
        socketPath,
        path: '/v1.46/containers/json?all=true',
        method: 'GET',
        timeout: 3000,
      }, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => body += chunk.toString());
        res.on('end', () => resolve(body));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });

    const containers = JSON.parse(data);
    for (const c of containers) {
      const name = (c.Names?.[0] || '').replace(/^\//, '');
      if (DOCKER_CONTAINER_MAP[name]) {
        result[DOCKER_CONTAINER_MAP[name]] = c.State || 'unknown';
      }
    }
  } catch {
    // Docker 不可用，返回空
  }
  return result;
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
 * 根据直连状态和 Docker 容器状态综合判断引擎状态
 */
function resolveStatus(
  directConnected: boolean,
  dockerState: string | undefined
): { status: StorageEngineStatus['status']; connectionInfo: string } {
  if (directConnected) {
    return { status: 'online', connectionInfo: '已连接' };
  }
  if (dockerState === 'running') {
    return { status: 'starting', connectionInfo: '容器运行中（服务连接中）' };
  }
  if (dockerState === 'exited' || dockerState === 'dead') {
    return { status: 'offline', connectionInfo: '容器已停止' };
  }
  if (dockerState) {
    return { status: 'offline', connectionInfo: `容器状态: ${dockerState}` };
  }
  return { status: 'offline', connectionInfo: '未连接' };
}

// ─── 超时常量 ───
const CONNECT_TIMEOUT = 5000;

/**
 * 检测 MySQL 连接状态
 */
async function checkMySQL(dockerState?: string): Promise<StorageEngineStatus> {
  const start = Date.now();
  try {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.execute(sql`SELECT 1`);
    const latency = Date.now() - start;

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
      dockerStatus: dockerState,
      metrics: {
        '数据表': tableCount,
        '连接数': statusMap['Threads_connected'] ?? '-',
        '查询总数': statusMap['Questions'] ?? '-',
        '运行时间': `${Math.floor(Number(statusMap['Uptime'] || 0) / 3600)}h`,
      }
    };
  } catch (e: any) {
    const { status, connectionInfo } = resolveStatus(false, dockerState);
    return {
      name: 'MySQL 8.0',
      type: 'RDBMS',
      icon: '🐬',
      description: '关系型主数据库，存储资产树、配置、事件等结构化数据',
      status,
      latency: Date.now() - start,
      connectionInfo,
      dockerStatus: dockerState,
      metrics: { '数据表': '-', '连接数': '-', '查询总数': '-', '运行时间': '-' },
      error: e.message
    };
  }
}

/**
 * 检测 Redis 连接状态（TCP 直连 + PING 命令）
 */
async function checkRedis(dockerState?: string): Promise<StorageEngineStatus> {
  const start = Date.now();
  const host = config.redis.host;
  const port = config.redis.port;
  try {
    const net = await import('net');
    const { connected, info } = await new Promise<{ connected: boolean; info: Record<string, string> }>((resolve) => {
      const socket = new net.Socket();
      let buffer = '';
      socket.setTimeout(CONNECT_TIMEOUT);
      socket.on('connect', () => {
        // 发送 PING 命令验证 Redis 协议
        socket.write('*1\r\n$4\r\nPING\r\n');
      });
      socket.on('data', (data: Buffer) => {
        buffer += data.toString();
        if (buffer.includes('+PONG')) {
          // PING 成功，尝试获取 INFO 统计
          socket.write('*2\r\n$4\r\nINFO\r\n$6\r\nserver\r\n');
          // 给 INFO 响应一点时间
          setTimeout(() => {
            const info: Record<string, string> = {};
            // 解析 INFO 响应中的关键指标
            const lines = buffer.split('\r\n');
            for (const line of lines) {
              if (line.includes(':')) {
                const [k, v] = line.split(':');
                if (k && v) info[k.trim()] = v.trim();
              }
            }
            socket.destroy();
            resolve({ connected: true, info });
          }, 200);
        }
      });
      socket.on('timeout', () => { socket.destroy(); resolve({ connected: false, info: {} }); });
      socket.on('error', () => { socket.destroy(); resolve({ connected: false, info: {} }); });
      socket.connect(port, host);
    });
    const latency = Date.now() - start;
    const { status, connectionInfo } = resolveStatus(connected, dockerState);
    return {
      name: 'Redis 7',
      type: 'Cache',
      icon: '🔴',
      description: '缓存层，用于设备状态缓存、会话管理、事件去重',
      status,
      latency,
      connectionInfo,
      dockerStatus: dockerState,
      metrics: {
        '缓存键': '-',
        '内存使用': info?.used_memory_human ?? '-',
        '命中率': '-',
        '连接数': info?.connected_clients ?? '-',
      }
    };
  } catch (e: any) {
    const { status, connectionInfo } = resolveStatus(false, dockerState);
    return {
      name: 'Redis 7',
      type: 'Cache',
      icon: '🔴',
      description: '缓存层，用于设备状态缓存、会话管理、事件去重',
      status,
      latency: Date.now() - start,
      connectionInfo,
      dockerStatus: dockerState,
      metrics: { '缓存键': '-', '内存使用': '-', '命中率': '-', '连接数': '-' },
      error: e.message
    };
  }
}

/**
 * 检测 ClickHouse 连接状态
 */
async function checkClickHouse(dockerState?: string): Promise<StorageEngineStatus> {
  const start = Date.now();
  try {
    const host = config.clickhouse.host;
    const port = config.clickhouse.port;
    const response = await fetchWithTimeout(`http://${host}:${port}/ping`, CONNECT_TIMEOUT);
    const latency = Date.now() - start;

    if (response.ok) {
      let metrics: Record<string, string | number> = {};
      try {
        const user = config.clickhouse.user;
        const password = config.clickhouse.password;
        const dbName = config.clickhouse.database;
        const headers: Record<string, string> = {};
        if (user) headers['X-ClickHouse-User'] = user;
        if (password) headers['X-ClickHouse-Key'] = password;

        const tablesRes = await fetchWithTimeout(
          `http://${host}:${port}/?query=SELECT+count()+FROM+system.tables+WHERE+database='${dbName}'+FORMAT+JSON`,
          CONNECT_TIMEOUT, { headers }
        );
        if (tablesRes.ok) {
          const data = await tablesRes.json();
          metrics['时序表'] = data?.data?.[0]?.['count()'] ?? '-';
        }

        const uptimeRes = await fetchWithTimeout(
          `http://${host}:${port}/?query=SELECT+uptime()+as+uptime+FORMAT+JSON`,
          CONNECT_TIMEOUT, { headers }
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
        dockerStatus: dockerState,
        metrics
      };
    }
    throw new Error('ClickHouse ping failed');
  } catch (e: any) {
    const { status, connectionInfo } = resolveStatus(false, dockerState);
    return {
      name: 'ClickHouse',
      type: 'TSDB',
      icon: '⚡',
      description: '时序数据库，用于存储高频传感器数据和聚合指标',
      status,
      latency: Date.now() - start,
      connectionInfo,
      dockerStatus: dockerState,
      metrics: { '时序表': '-', '数据点': '-', '压缩率': '-', '查询延迟': '-' },
      error: e.message
    };
  }
}

/**
 * 检测 MinIO 连接状态
 */
async function checkMinIO(dockerState?: string): Promise<StorageEngineStatus> {
  const start = Date.now();
  try {
    const endpoint = config.minio.endpoint;
    const url = endpoint.startsWith('http') ? `${endpoint}/minio/health/live` : `http://${endpoint}/minio/health/live`;
    const response = await fetchWithTimeout(url, CONNECT_TIMEOUT);
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
        dockerStatus: dockerState,
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
    const { status, connectionInfo } = resolveStatus(false, dockerState);
    return {
      name: 'MinIO / S3',
      type: 'Object Store',
      icon: '📦',
      description: '对象存储，用于存储波形文件、频谱图、模型文件等大文件',
      status,
      latency: Date.now() - start,
      connectionInfo,
      dockerStatus: dockerState,
      metrics: { '存储桶': '-', '对象数': '-', '总容量': '-', '可用空间': '-' },
      error: e.message
    };
  }
}

/**
 * 检测 Qdrant 连接状态
 */
async function checkQdrant(dockerState?: string): Promise<StorageEngineStatus> {
  const start = Date.now();
  try {
    const qdrantUrl = config.qdrant.url || `http://${config.qdrant.host}:${config.qdrant.port}`;
    const url = qdrantUrl.startsWith('http') ? qdrantUrl : `http://${qdrantUrl}`;
    const response = await fetchWithTimeout(`${url}/collections`, CONNECT_TIMEOUT);
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
        dockerStatus: dockerState,
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
    const { status, connectionInfo } = resolveStatus(false, dockerState);
    return {
      name: 'Qdrant',
      type: 'Vector DB',
      icon: '🧮',
      description: '向量数据库，用于相似故障检索和语义搜索',
      status,
      latency: Date.now() - start,
      connectionInfo,
      dockerStatus: dockerState,
      metrics: { '集合数': '-', '向量数': '-', '维度': '-', '索引状态': '-' },
      error: e.message
    };
  }
}

/**
 * 检测 Kafka 连接状态
 */
async function checkKafka(dockerState?: string): Promise<StorageEngineStatus> {
  const start = Date.now();
  try {
    const net = await import('net');
    const brokers = config.kafkaCluster.brokers;
    const [host, portStr] = brokers.split(',')[0].split(':');
    const port = parseInt(portStr || '9092');

    const connected = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(CONNECT_TIMEOUT);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
      socket.on('error', () => { socket.destroy(); resolve(false); });
      socket.connect(port, host);
    });
    const latency = Date.now() - start;

    const { status, connectionInfo } = resolveStatus(connected, dockerState);
    return {
      name: 'Kafka',
      type: 'Message Queue',
      icon: '📨',
      description: '消息队列，用于事件总线、数据流处理和异步通信',
      status,
      latency,
      connectionInfo,
      dockerStatus: dockerState,
      metrics: {
        'Broker': connected ? '1' : '-',
        'Topics': '-',
        '分区数': '-',
        '消息延迟': connected ? `${latency}ms` : '-',
      }
    };
  } catch (e: any) {
    const { status, connectionInfo } = resolveStatus(false, dockerState);
    return {
      name: 'Kafka',
      type: 'Message Queue',
      icon: '📨',
      description: '消息队列，用于事件总线、数据流处理和异步通信',
      status,
      latency: Date.now() - start,
      connectionInfo,
      dockerStatus: dockerState,
      metrics: { 'Broker': '-', 'Topics': '-', '分区数': '-', '消息延迟': '-' },
      error: e.message
    };
  }
}

/**
 * 检测 Neo4j 连接状态
 */
async function checkNeo4j(dockerState?: string): Promise<StorageEngineStatus> {
  const start = Date.now();
  try {
    const host = config.neo4j.host;
    const port = config.neo4j.httpPort;
    const response = await fetchWithTimeout(`http://${host}:${port}`, CONNECT_TIMEOUT);
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
        dockerStatus: dockerState,
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
    const { status, connectionInfo } = resolveStatus(false, dockerState);
    return {
      name: 'Neo4j',
      type: 'Graph DB',
      icon: '🕸️',
      description: '图数据库，用于知识图谱和设备关系拓扑（Cypher 查询语言）',
      status,
      latency: Date.now() - start,
      connectionInfo,
      dockerStatus: dockerState,
      metrics: { '顶点数': '-', '边数': '-', '数据库': '-', '查询延迟': '-' },
      error: e.message
    };
  }
}

/**
 * 检测所有存储引擎状态（集成 Docker 容器状态）
 */
export async function checkAllStorageEngines(): Promise<{
  engines: StorageEngineStatus[];
  summary: {
    total: number;
    online: number;
    offline: number;
    starting: number;
    checkedAt: string;
    dockerAvailable: boolean;
  };
}> {
  // 先获取 Docker 容器状态
  const dockerStatuses = await getDockerContainerStatuses();
  const dockerAvailable = Object.keys(dockerStatuses).length > 0;

  // 并行检测所有服务，传入 Docker 状态
  const results = await Promise.allSettled([
    checkMySQL(dockerStatuses['MySQL 8.0']),
    checkRedis(dockerStatuses['Redis 7']),
    checkClickHouse(dockerStatuses['ClickHouse']),
    checkMinIO(dockerStatuses['MinIO / S3']),
    checkQdrant(dockerStatuses['Qdrant']),
    checkKafka(dockerStatuses['Kafka']),
    checkNeo4j(dockerStatuses['Neo4j']),
  ]);

  const names = ['MySQL 8.0', 'Redis 7', 'ClickHouse', 'MinIO / S3', 'Qdrant', 'Kafka', 'Neo4j'];
  const engines = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const ds = dockerStatuses[names[i]];
    const { status, connectionInfo } = resolveStatus(false, ds);
    return {
      name: names[i],
      type: 'Unknown',
      icon: '❓',
      description: '',
      status,
      latency: 0,
      connectionInfo,
      dockerStatus: ds,
      metrics: {},
      error: r.reason?.message || 'Unknown error'
    };
  });

  const online = engines.filter(e => e.status === 'online').length;
  const starting = engines.filter(e => e.status === 'starting').length;

  return {
    engines,
    summary: {
      total: engines.length,
      online,
      offline: engines.length - online - starting,
      starting,
      checkedAt: new Date().toISOString(),
      dockerAvailable,
    }
  };
}
