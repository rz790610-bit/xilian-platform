/**
 * Qdrant 向量数据库协议适配器 - 生产级实现
 * 
 * 基于 @qdrant/js-client-rest 库
 * 支持 HTTP/gRPC 传输、API Key 认证、集合管理
 * 资源发现：列出集合、获取集合信息（维度、距离度量、点数量）
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { BaseAdapter, normalizeError, AdapterError, AdapterErrorCode } from './base';
import type { ConnectionTestResult, DiscoveredEndpoint, ProtocolConfigSchema, HealthCheckResult } from '../../../shared/accessLayerTypes';

export class QdrantAdapter extends BaseAdapter {
  readonly protocolType = 'qdrant' as const;
  protected defaultTimeoutMs = 15000;

  readonly configSchema: ProtocolConfigSchema = {
    protocolType: 'qdrant',
    label: 'Qdrant 向量数据库',
    icon: '🔍',
    description: '向量检索',
    category: 'database',
    connectionFields: [
      { key: 'host', label: '主机地址', type: 'string', required: true, placeholder: 'localhost', description: 'Qdrant 服务器主机名或 IP' },
      { key: 'port', label: 'HTTP 端口', type: 'number', required: true, defaultValue: 6333 },
      { key: 'grpcPort', label: 'gRPC 端口', type: 'number', required: false, defaultValue: 6334, description: 'gRPC 传输端口（高性能场景）' },
      { key: 'useHttps', label: '使用 HTTPS', type: 'boolean', required: false, defaultValue: false },
      { key: 'preferGrpc', label: '优先 gRPC', type: 'boolean', required: false, defaultValue: false, description: '使用 gRPC 传输以获得更高性能' },
    ],
    authFields: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: false, description: 'Qdrant Cloud 或自部署的 API Key' },
      { key: 'checkCompatibility', label: '检查版本兼容性', type: 'boolean', required: false, defaultValue: true },
    ],
    advancedFields: [
      { key: 'timeout', label: '请求超时(ms)', type: 'number', required: false, defaultValue: 30000 },
      { key: 'retryCount', label: '重试次数', type: 'number', required: false, defaultValue: 3 },
      { key: 'retryInterval', label: '重试间隔(ms)', type: 'number', required: false, defaultValue: 100 },
      { key: 'optimizersConfig', label: '优化器配置 (JSON)', type: 'json', required: false, description: '索引优化器参数（memmap_threshold, indexing_threshold 等）' },
      { key: 'walConfig', label: 'WAL 配置 (JSON)', type: 'json', required: false, description: 'Write-Ahead Log 配置（wal_capacity_mb, wal_segments_ahead）' },
    ],
  };

  private createClient(params: Record<string, unknown>, auth?: Record<string, unknown>): QdrantClient {
    const host = params.host as string;
    const port = (params.port as number) || 6333;
    const useHttps = (params.useHttps as boolean) || false;

    const url = `${useHttps ? 'https' : 'http'}://${host}:${port}`;

    const clientOptions: any = {
      url,
      timeout: (params.timeout as number) || 30000,
    };

    if (auth?.apiKey) {
      clientOptions.apiKey = auth.apiKey as string;
    }

    if (params.preferGrpc) {
      clientOptions.port = (params.grpcPort as number) || 6334;
    }

    if (auth?.checkCompatibility === false) {
      clientOptions.checkCompatibility = false;
    }

    return new QdrantClient(clientOptions);
  }

  protected async doTestConnection(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const host = params.host as string;
    if (!host) {
      return { success: false, latencyMs: 0, message: '主机地址不能为空' };
    }

    try {
      const client = this.createClient(params, auth);

      // 健康检查
      const healthResult = await (client as any).api('cluster').clusterStatus();

      // 获取集合列表
      const collections = await client.getCollections();

      // 获取遥测数据
      let telemetry: any = null;
      try {
        telemetry = await (client as any).api('service').telemetry({});
      } catch { /* 遥测可能不可用 */ }

      const details: Record<string, unknown> = {
        collectionsCount: collections.collections.length,
        collections: collections.collections.map(c => c.name),
        clusterStatus: healthResult,
      };

      if (telemetry?.result) {
        details.version = telemetry.result.app?.version;
        details.commitHash = telemetry.result.app?.startup;
      }

      return {
        success: true,
        latencyMs: 0,
        message: `Qdrant ${host}:${params.port || 6333} 连接成功 (${collections.collections.length} 个集合)`,
        serverVersion: (details.version as string) || 'Unknown',
        details,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: 0,
        message: `Qdrant 连接失败: ${(err as Error).message}`,
        details: { host, port: params.port, error: (err as Error).message },
      };
    }
  }

  protected async doDiscoverResources(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<DiscoveredEndpoint[]> {
    const client = this.createClient(params, auth);
    const endpoints: DiscoveredEndpoint[] = [];

    try {
      const collections = await client.getCollections();

      for (const col of collections.collections) {
        try {
          const info = await client.getCollection(col.name);

          endpoints.push({
            resourcePath: col.name,
            resourceType: 'collection',
            name: `向量集合: ${col.name}`,
            dataFormat: 'json',
            schemaInfo: {
              vectorSize: info.config?.params?.vectors && typeof info.config.params.vectors === 'object' && 'size' in info.config.params.vectors
                ? (info.config.params.vectors as any).size
                : 'multi-vector',
              distance: info.config?.params?.vectors && typeof info.config.params.vectors === 'object' && 'distance' in info.config.params.vectors
                ? (info.config.params.vectors as any).distance
                : 'unknown',
              onDiskPayload: info.config?.params?.on_disk_payload,
              shardNumber: info.config?.params?.shard_number,
              replicationFactor: info.config?.params?.replication_factor,
              writeConsistencyFactor: info.config?.params?.write_consistency_factor,
            },
            metadata: {
              pointsCount: info.points_count,
              indexedVectorsCount: info.indexed_vectors_count,
              segmentsCount: info.segments_count,
              status: info.status,
              optimizerStatus: info.optimizer_status,
            },
          });

          // 发现命名向量
          if (info.config?.params?.vectors && typeof info.config.params.vectors === 'object' && !('size' in info.config.params.vectors)) {
            for (const [vecName, vecConfig] of Object.entries(info.config.params.vectors as Record<string, any>)) {
              endpoints.push({
                resourcePath: `${col.name}/${vecName}`,
                resourceType: 'collection',
                name: `命名向量: ${col.name}/${vecName}`,
                dataFormat: 'json',
                schemaInfo: {
                  vectorSize: vecConfig.size,
                  distance: vecConfig.distance,
                  namedVector: true,
                },
                metadata: { parentCollection: col.name },
              });
            }
          }
        } catch {
          // 无法获取集合详情
          endpoints.push({
            resourcePath: col.name,
            resourceType: 'collection',
            name: `向量集合: ${col.name}`,
            dataFormat: 'json',
          });
        }
      }

      return endpoints;
    } catch (err) {
      throw normalizeError(err, 'qdrant');
    }
  }

  protected async doHealthCheck(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<Omit<HealthCheckResult, 'latencyMs' | 'checkedAt'>> {
    try {
      const client = this.createClient(params, auth);
      const collections = await client.getCollections();

      let totalPoints = 0;
      for (const col of collections.collections) {
        try {
          const info = await client.getCollection(col.name);
          totalPoints += info.points_count || 0;
        } catch { /* ignore */ }
      }

      return {
        status: 'healthy',
        message: `Qdrant 正常 - ${collections.collections.length} 个集合, ${totalPoints} 个向量点`,
        metrics: {
          collectionsCount: collections.collections.length,
          totalPoints,
        },
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        message: `Qdrant 健康检查失败: ${(err as Error).message}`,
      };
    }
  }
}
