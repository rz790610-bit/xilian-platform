/**
 * InfluxDB 协议适配器 - 生产级实现
 * 
 * 基于 @influxdata/influxdb-client 官方库（InfluxDB 2.x）
 * 支持 Token 认证、Org/Bucket 管理、Flux 查询
 * 资源发现：列出 Bucket、Measurement、Field/Tag 信息
 */

import { InfluxDB, QueryApi, flux } from '@influxdata/influxdb-client';
import { BucketsAPI, HealthAPI, OrgsAPI } from '@influxdata/influxdb-client-apis';
import { BaseAdapter } from './base';
import type { ConnectionTestResult, DiscoveredEndpoint, ProtocolConfigSchema, HealthCheckResult } from '../../../shared/accessLayerTypes';

export class InfluxdbAdapter extends BaseAdapter {
  readonly protocolType = 'influxdb' as const;
  protected defaultTimeoutMs = 15000;

  readonly configSchema: ProtocolConfigSchema = {
    protocolType: 'influxdb',
    label: 'InfluxDB 时序数据库',
    icon: '📈',
    description: '时序数据存储',
    category: 'database',
    connectionFields: [
      { key: 'url', label: '服务器 URL', type: 'string', required: true, placeholder: 'http://192.168.1.100:8086', description: 'InfluxDB 2.x HTTP API 地址' },
      { key: 'org', label: '组织 (Organization)', type: 'string', required: true, placeholder: 'my-org', description: 'InfluxDB 组织名称' },
      { key: 'bucket', label: 'Bucket', type: 'string', required: false, placeholder: '留空则列出所有 Bucket', description: '指定默认 Bucket，留空可在资源发现时列出所有' },
    ],
    authFields: [
      { key: 'token', label: 'API Token', type: 'password', required: true, description: 'InfluxDB 2.x API Token（在 InfluxDB UI 的 API Tokens 页面生成）' },
    ],
    advancedFields: [
      // 连接控制
      { key: 'timeout', label: '请求超时(ms)', type: 'number', required: false, defaultValue: 30000 },
      { key: 'maxRetries', label: '最大重试次数', type: 'number', required: false, defaultValue: 3 },
      { key: 'retryJitter', label: '重试抖动(ms)', type: 'number', required: false, defaultValue: 200 },
      { key: 'maxRetryDelay', label: '最大重试延迟(ms)', type: 'number', required: false, defaultValue: 15000 },
      { key: 'minRetryDelay', label: '最小重试延迟(ms)', type: 'number', required: false, defaultValue: 1000 },
      { key: 'exponentialBase', label: '重试退避基数', type: 'number', required: false, defaultValue: 5, description: '指数退避的基数参数' },
      // 写入配置
      { key: 'writePrecision', label: '写入精度', type: 'select', required: false, defaultValue: 'ns', options: [
        { label: '纳秒 (ns)', value: 'ns' },
        { label: '微秒 (us)', value: 'us' },
        { label: '毫秒 (ms)', value: 'ms' },
        { label: '秒 (s)', value: 's' },
      ], description: '时间戳的写入精度' },
      { key: 'batchSize', label: '批量写入大小', type: 'number', required: false, defaultValue: 1000, description: '每批次写入的最大数据点数' },
      { key: 'flushInterval', label: '刷新间隔(ms)', type: 'number', required: false, defaultValue: 1000, description: '自动刷新写入缓冲的间隔' },
      { key: 'defaultTags', label: '默认标签 (JSON)', type: 'json', required: false, description: '所有写入自动添加的标签，如 {"source": "xilian"}' },
      // Flux 查询
      { key: 'gzipThreshold', label: 'Gzip 压缩阈值(字节)', type: 'number', required: false, defaultValue: 1000, description: '超过此大小的请求体启用 gzip 压缩' },
      { key: 'fluxQueryMemoryLimit', label: 'Flux 内存限制(字节)', type: 'number', required: false, defaultValue: 0, description: '单条 Flux 查询的内存限制（0=服务器默认）' },
      { key: 'fluxQueryConcurrency', label: 'Flux 并发数', type: 'number', required: false, defaultValue: 0, description: '并发执行的最大 Flux 查询数（0=服务器默认）' },
    ],
  };

  private createInfluxClient(params: Record<string, unknown>, auth?: Record<string, unknown>): InfluxDB {
    let url = (params.url as string) || 'http://localhost:8086';
    if (!url.startsWith('http')) url = `http://${url}`;

    return new InfluxDB({
      url,
      token: (auth?.token as string) || '',
      timeout: (params.timeout as number) || 30000,
    });
  }

  protected async doTestConnection(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const influx = this.createInfluxClient(params, auth);
    const org = (params.org as string) || '';

    try {
      // 健康检查
      const healthApi = new HealthAPI(influx);
      const health = await healthApi.getHealth();

      if (health.status !== 'pass') {
        return {
          success: false,
          latencyMs: 0,
          message: `InfluxDB 健康检查未通过: ${health.message}`,
          details: { status: health.status, message: health.message },
        };
      }

      // 获取组织信息
      const orgsApi = new OrgsAPI(influx);
      const orgs = await orgsApi.getOrgs({ org });

      // 获取 Bucket 列表
      const bucketsApi = new BucketsAPI(influx);
      const buckets = await bucketsApi.getBuckets({ org });
      const userBuckets = (buckets.buckets || [])
        .filter(b => b.type === 'user')
        .map(b => ({ name: b.name, id: b.id, retentionRules: b.retentionRules }));

      return {
        success: true,
        latencyMs: 0,
        message: `成功连接到 InfluxDB (${params.url})`,
        serverVersion: health.version || 'Unknown',
        details: {
          url: params.url,
          org,
          orgId: orgs.orgs?.[0]?.id,
          status: health.status,
          version: health.version,
          bucketCount: userBuckets.length,
          buckets: userBuckets.slice(0, 20).map(b => b.name),
        },
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: 0,
        message: `InfluxDB 连接失败: ${(err as Error).message}`,
        details: { url: params.url, error: (err as Error).message },
      };
    }
  }

  protected async doDiscoverResources(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<DiscoveredEndpoint[]> {
    const influx = this.createInfluxClient(params, auth);
    const org = (params.org as string) || '';
    const targetBucket = params.bucket as string;
    const endpoints: DiscoveredEndpoint[] = [];

    try {
      // 获取 Bucket 列表
      let bucketNames: string[];
      if (targetBucket) {
        bucketNames = [targetBucket];
      } else {
        const bucketsApi = new BucketsAPI(influx);
        const buckets = await bucketsApi.getBuckets({ org });
        bucketNames = (buckets.buckets || [])
          .filter(b => b.type === 'user')
          .map(b => b.name!);
      }

      const queryApi = influx.getQueryApi(org);

      for (const bucket of bucketNames.slice(0, 10)) {
        try {
          // 查询 Measurement 列表
          const measurementQuery = `import "influxdata/influxdb/schema"
schema.measurements(bucket: "${bucket}")`;

          const measurements: string[] = [];
          await new Promise<void>((resolve, reject) => {
            queryApi.queryRows(measurementQuery, {
              next: (row, tableMeta) => {
                const o = tableMeta.toObject(row);
                if (o._value) measurements.push(o._value as string);
              },
              error: reject,
              complete: resolve,
            });
          });

          for (const measurement of measurements.slice(0, 30)) {
            // 获取 Field Keys
            const fieldKeys: Array<{ name: string; type: string }> = [];
            try {
              const fieldQuery = `import "influxdata/influxdb/schema"
schema.measurementFieldKeys(bucket: "${bucket}", measurement: "${measurement}")`;
              await new Promise<void>((resolve, reject) => {
                queryApi.queryRows(fieldQuery, {
                  next: (row, tableMeta) => {
                    const o = tableMeta.toObject(row);
                    if (o._value) fieldKeys.push({ name: o._value as string, type: (o._field_type as string) || 'float' });
                  },
                  error: reject,
                  complete: resolve,
                });
              });
            } catch { /* ignore */ }

            // 获取 Tag Keys
            const tagKeys: string[] = [];
            try {
              const tagQuery = `import "influxdata/influxdb/schema"
schema.measurementTagKeys(bucket: "${bucket}", measurement: "${measurement}")`;
              await new Promise<void>((resolve, reject) => {
                queryApi.queryRows(tagQuery, {
                  next: (row, tableMeta) => {
                    const o = tableMeta.toObject(row);
                    if (o._value && o._value !== '_start' && o._value !== '_stop') tagKeys.push(o._value as string);
                  },
                  error: reject,
                  complete: resolve,
                });
              });
            } catch { /* ignore */ }

            endpoints.push({
              resourcePath: `${bucket}/${measurement}`,
              resourceType: 'measurement',
              name: `${bucket}/${measurement}`,
              dataFormat: 'line_protocol',
              schemaInfo: {
                bucket,
                measurement,
                fieldKeys,
                tagKeys,
                fieldCount: fieldKeys.length,
                tagCount: tagKeys.length,
              },
              metadata: {
                dataModel: 'time-series',
              },
            });
          }
        } catch {
          // Bucket 无权限或为空，跳过
        }
      }

      return endpoints;
    } catch (err) {
      throw new Error(`InfluxDB 资源发现失败: ${(err as Error).message}`);
    }
  }

  protected async doHealthCheck(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<Omit<HealthCheckResult, 'latencyMs' | 'checkedAt'>> {
    const influx = this.createInfluxClient(params, auth);

    try {
      const healthApi = new HealthAPI(influx);
      const health = await healthApi.getHealth();

      return {
        status: health.status === 'pass' ? 'healthy' : 'degraded',
        message: `InfluxDB ${health.version || ''} 状态: ${health.status}${health.message ? ' - ' + health.message : ''}`,
        metrics: {
          status: health.status,
          version: health.version,
        },
      };
    } catch (err) {
      return { status: 'unhealthy', message: `InfluxDB 健康检查失败: ${(err as Error).message}` };
    }
  }
}
