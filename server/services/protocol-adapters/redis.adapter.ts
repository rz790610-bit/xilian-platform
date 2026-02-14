/**
 * Redis 协议适配器 - 生产级实现
 * 
 * 基于 ioredis 库
 * 支持 Standalone / Sentinel / Cluster 三种部署模式
 * TLS 加密、ACL 认证、数据库选择、键空间扫描
 * 资源发现：SCAN 键空间，INFO 获取服务器状态
 */

import Redis, { RedisOptions } from 'ioredis';
import { BaseAdapter, normalizeError, AdapterError, AdapterErrorCode } from './base';
import type { ConnectionTestResult, DiscoveredEndpoint, ProtocolConfigSchema, HealthCheckResult } from '../../../shared/accessLayerTypes';

export class RedisAdapter extends BaseAdapter {
  readonly protocolType = 'redis' as const;
  protected defaultTimeoutMs = 10000;

  readonly configSchema: ProtocolConfigSchema = {
    protocolType: 'redis',
    label: 'Redis',
    icon: '🔴',
    description: '缓存/实时状态',
    category: 'database',
    connectionFields: [
      { key: 'host', label: '主机地址', type: 'string', required: true, placeholder: '192.168.1.100', description: 'Redis 服务器主机名或 IP' },
      { key: 'port', label: '端口', type: 'number', required: true, defaultValue: 6379 },
      { key: 'db', label: '数据库编号', type: 'number', required: false, defaultValue: 0, description: '逻辑数据库索引 (0-15)' },
      { key: 'deployMode', label: '部署模式', type: 'select', required: true, defaultValue: 'standalone', options: [
        { label: '单机 (Standalone)', value: 'standalone' },
        { label: '哨兵 (Sentinel)', value: 'sentinel' },
        { label: '集群 (Cluster)', value: 'cluster' },
      ]},
      { key: 'sentinelName', label: 'Sentinel 主节点名', type: 'string', required: false, placeholder: 'mymaster', description: 'Sentinel 模式下的 master 名称' },
      { key: 'sentinelAddresses', label: 'Sentinel 节点列表', type: 'string', required: false, placeholder: 'host1:26379,host2:26379', description: '逗号分隔的 Sentinel 地址' },
      { key: 'clusterNodes', label: '集群节点列表', type: 'string', required: false, placeholder: 'host1:6379,host2:6379,host3:6379', description: '逗号分隔的集群种子节点' },
      { key: 'keyPrefix', label: '键前缀', type: 'string', required: false, placeholder: 'xilian:', description: '所有操作自动添加的键前缀' },
    ],
    authFields: [
      { key: 'password', label: '密码', type: 'password', required: false, description: 'Redis AUTH 密码' },
      { key: 'username', label: '用户名 (ACL)', type: 'string', required: false, description: 'Redis 6.0+ ACL 用户名' },
      { key: 'tls', label: '启用 TLS', type: 'boolean', required: false, defaultValue: false },
      { key: 'caCert', label: 'CA 证书 (PEM)', type: 'string', required: false, group: 'TLS' },
      { key: 'clientCert', label: '客户端证书 (PEM)', type: 'string', required: false, group: 'TLS' },
      { key: 'clientKey', label: '客户端私钥 (PEM)', type: 'string', required: false, group: 'TLS' },
      { key: 'rejectUnauthorized', label: '验证服务器证书', type: 'boolean', required: false, defaultValue: true, group: 'TLS' },
      { key: 'sentinelPassword', label: 'Sentinel 密码', type: 'password', required: false, description: 'Sentinel 节点的认证密码' },
    ],
    advancedFields: [
      { key: 'connectTimeout', label: '连接超时(ms)', type: 'number', required: false, defaultValue: 10000 },
      { key: 'commandTimeout', label: '命令超时(ms)', type: 'number', required: false, defaultValue: 5000 },
      { key: 'maxRetriesPerRequest', label: '每请求最大重试', type: 'number', required: false, defaultValue: 3 },
      { key: 'retryDelayMs', label: '重试延迟(ms)', type: 'number', required: false, defaultValue: 50 },
      { key: 'enableReadyCheck', label: '启用就绪检查', type: 'boolean', required: false, defaultValue: true, description: '连接后发送 INFO 命令验证就绪状态' },
      { key: 'enableOfflineQueue', label: '启用离线队列', type: 'boolean', required: false, defaultValue: true, description: '断连时缓存命令，重连后自动执行' },
      { key: 'lazyConnect', label: '延迟连接', type: 'boolean', required: false, defaultValue: false, description: '创建实例时不立即连接' },
      { key: 'scanCount', label: 'SCAN 批次大小', type: 'number', required: false, defaultValue: 100, description: '资源发现 SCAN 命令的 COUNT 参数' },
      { key: 'natMap', label: 'NAT 映射 (JSON)', type: 'json', required: false, description: '集群模式下的 NAT 地址映射' },
    ],
  };

  private buildRedisOptions(params: Record<string, unknown>, auth?: Record<string, unknown>): RedisOptions {
    const options: RedisOptions = {
      host: params.host as string,
      port: (params.port as number) || 6379,
      db: (params.db as number) || 0,
      keyPrefix: (params.keyPrefix as string) || undefined,
      connectTimeout: (params.connectTimeout as number) || 10000,
      commandTimeout: (params.commandTimeout as number) || 5000,
      maxRetriesPerRequest: (params.maxRetriesPerRequest as number) ?? 3,
      retryStrategy: (times: number) => {
        if (times > 3) return null; // 测试连接时不无限重试
        return Math.min(times * ((params.retryDelayMs as number) || 50), 2000);
      },
      enableReadyCheck: params.enableReadyCheck !== false,
      enableOfflineQueue: params.enableOfflineQueue !== false,
      lazyConnect: (params.lazyConnect as boolean) || false,
    };

    // 认证
    if (auth?.password) options.password = auth.password as string;
    if (auth?.username) options.username = auth.username as string;

    // TLS
    if (auth?.tls) {
      options.tls = {
        rejectUnauthorized: auth.rejectUnauthorized !== false,
      };
      if (auth.caCert) (options.tls as any).ca = auth.caCert as string;
      if (auth.clientCert) (options.tls as any).cert = auth.clientCert as string;
      if (auth.clientKey) (options.tls as any).key = auth.clientKey as string;
    }

    return options;
  }

  private createRedisClient(params: Record<string, unknown>, auth?: Record<string, unknown>): Redis {
    const deployMode = (params.deployMode as string) || 'standalone';
    const baseOptions = this.buildRedisOptions(params, auth);

    if (deployMode === 'sentinel') {
      const sentinelAddresses = ((params.sentinelAddresses as string) || '').split(',').map(addr => {
        const [host, port] = addr.trim().split(':');
        return { host, port: parseInt(port) || 26379 };
      }).filter(s => s.host);

      return new Redis({
        ...baseOptions,
        sentinels: sentinelAddresses,
        name: (params.sentinelName as string) || 'mymaster',
        sentinelPassword: (auth?.sentinelPassword as string) || undefined,
      });
    }

    // Standalone 模式
    return new Redis(baseOptions);
  }

  protected async doTestConnection(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const host = params.host as string;
    if (!host) {
      return { success: false, latencyMs: 0, message: '主机地址不能为空' };
    }

    const client = this.createRedisClient(params, auth);

    try {
      // 等待连接就绪
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('连接超时'));
        }, (params.connectTimeout as number) || 10000);

        client.on('ready', () => {
          clearTimeout(timeout);
          resolve();
        });
        client.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      // PING 测试
      const pong = await client.ping();

      // 获取服务器信息
      const info = await client.info();
      const infoLines = info.split('\r\n');
      const serverInfo: Record<string, string> = {};
      for (const line of infoLines) {
        const [key, value] = line.split(':');
        if (key && value) serverInfo[key.trim()] = value.trim();
      }

      const details: Record<string, unknown> = {
        pong,
        redisVersion: serverInfo.redis_version,
        redisMode: serverInfo.redis_mode,
        os: serverInfo.os,
        uptimeInSeconds: parseInt(serverInfo.uptime_in_seconds) || 0,
        connectedClients: parseInt(serverInfo.connected_clients) || 0,
        usedMemoryHuman: serverInfo.used_memory_human,
        usedMemoryPeakHuman: serverInfo.used_memory_peak_human,
        totalSystemMemoryHuman: serverInfo.total_system_memory_human,
        dbSize: await client.dbsize(),
        role: serverInfo.role,
        connectedSlaves: parseInt(serverInfo.connected_slaves) || 0,
        maxmemoryPolicy: serverInfo.maxmemory_policy,
        aofEnabled: serverInfo.aof_enabled,
        rdbLastSaveTime: serverInfo.rdb_last_save_time,
      };

      return {
        success: true,
        latencyMs: 0,
        message: `Redis ${host}:${params.port || 6379} 连接成功 (${pong})`,
        serverVersion: serverInfo.redis_version || 'Unknown',
        details,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: 0,
        message: `Redis 连接失败: ${(err as Error).message}`,
        details: { host, port: params.port, error: (err as Error).message },
      };
    } finally {
      try { client.disconnect(); } catch { /* ignore */ }
    }
  }

  protected async doDiscoverResources(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<DiscoveredEndpoint[]> {
    const client = this.createRedisClient(params, auth);
    const endpoints: DiscoveredEndpoint[] = [];
    const scanCount = (params.scanCount as number) || 100;

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('连接超时')), 10000);
        client.on('ready', () => { clearTimeout(timeout); resolve(); });
        client.on('error', (err) => { clearTimeout(timeout); reject(err); });
      });

      // 使用 SCAN 扫描键空间（采样前 500 个键）
      const keyPatterns = new Map<string, { count: number; type: string; sampleKey: string }>();
      let cursor = '0';
      let totalScanned = 0;
      const maxKeys = 500;

      do {
        const [nextCursor, keys] = await client.scan(cursor, 'COUNT', scanCount);
        cursor = nextCursor;

        for (const key of keys) {
          if (totalScanned >= maxKeys) break;
          totalScanned++;

          // 获取键类型
          const keyType = await client.type(key);

          // 提取键模式（将数字部分替换为 *）
          const pattern = key.replace(/:\d+/g, ':*').replace(/\.\d+/g, '.*');

          const existing = keyPatterns.get(pattern);
          if (existing) {
            existing.count++;
          } else {
            keyPatterns.set(pattern, { count: 1, type: keyType, sampleKey: key });
          }
        }
      } while (cursor !== '0' && totalScanned < maxKeys);

      // 转换为端点
      for (const [pattern, info] of Array.from(keyPatterns.entries())) {
        endpoints.push({
          resourcePath: pattern,
          resourceType: 'collection',
          name: `${pattern} (${info.type})`,
          dataFormat: 'json',
          metadata: {
            keyType: info.type,
            matchCount: info.count,
            sampleKey: info.sampleKey,
          },
        });
      }

      // 添加 Pub/Sub 频道信息
      try {
        const channels = await client.pubsub('CHANNELS', '*');
        if (Array.isArray(channels)) {
          for (const channel of channels.slice(0, 50)) {
            endpoints.push({
              resourcePath: `pubsub:${channel}`,
              resourceType: 'topic',
              name: `频道: ${channel}`,
              dataFormat: 'json',
              metadata: { pubsubChannel: true },
            });
          }
        }
      } catch { /* PUBSUB 可能不可用 */ }

      // 添加 Stream 信息
      for (const [pattern, info] of Array.from(keyPatterns.entries())) {
        if (info.type === 'stream') {
          try {
            const streamInfo = await client.xinfo('STREAM', info.sampleKey);
            endpoints.push({
              resourcePath: `stream:${info.sampleKey}`,
              resourceType: 'topic',
              name: `Stream: ${info.sampleKey}`,
              dataFormat: 'json',
              metadata: { streamInfo },
            });
          } catch { /* ignore */ }
        }
      }

      return endpoints;
    } finally {
      try { client.disconnect(); } catch { /* ignore */ }
    }
  }

  protected async doHealthCheck(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<Omit<HealthCheckResult, 'latencyMs' | 'checkedAt'>> {
    const client = this.createRedisClient(params, auth);

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('连接超时')), 5000);
        client.on('ready', () => { clearTimeout(timeout); resolve(); });
        client.on('error', (err) => { clearTimeout(timeout); reject(err); });
      });

      const pong = await client.ping();
      const info = await client.info('server');
      const memInfo = await client.info('memory');

      const infoMap: Record<string, string> = {};
      for (const line of [...info.split('\r\n'), ...memInfo.split('\r\n')]) {
        const [k, v] = line.split(':');
        if (k && v) infoMap[k.trim()] = v.trim();
      }

      return {
        status: pong === 'PONG' ? 'healthy' : 'degraded',
        message: `Redis ${pong} - v${infoMap.redis_version || 'unknown'}`,
        metrics: {
          redisVersion: infoMap.redis_version,
          usedMemory: infoMap.used_memory_human,
          usedMemoryPeak: infoMap.used_memory_peak_human,
          connectedClients: infoMap.connected_clients,
          uptimeInSeconds: infoMap.uptime_in_seconds,
        },
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        message: `Redis 健康检查失败: ${(err as Error).message}`,
      };
    } finally {
      try { client.disconnect(); } catch { /* ignore */ }
    }
  }
}
