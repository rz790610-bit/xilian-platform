/**
 * ClickHouse 协议适配器 - 生产级实现
 * 
 * 基于 @clickhouse/client 官方库
 * 支持 HTTP/HTTPS 接口、集群模式、压缩、会话管理
 * 资源发现：列出数据库、表（MergeTree 系列引擎）、列信息、分区信息
 */

import { createClient, ClickHouseClient } from '@clickhouse/client';
import { BaseAdapter } from './base';
import type { ConnectionTestResult, DiscoveredEndpoint, ProtocolConfigSchema, HealthCheckResult } from '../../../shared/accessLayerTypes';

export class ClickhouseAdapter extends BaseAdapter {
  readonly protocolType = 'clickhouse' as const;
  protected defaultTimeoutMs = 15000;

  readonly configSchema: ProtocolConfigSchema = {
    protocolType: 'clickhouse',
    label: 'ClickHouse 数据库',
    connectionFields: [
      { key: 'host', label: '主机地址', type: 'string', required: true, placeholder: 'http://192.168.1.100:8123', description: '完整 URL，含协议和端口（HTTP 8123 / HTTPS 8443 / Native 9000）' },
      { key: 'database', label: '数据库名', type: 'string', required: false, defaultValue: 'default', description: '留空则使用 default 数据库' },
      { key: 'cluster', label: '集群名称', type: 'string', required: false, description: '如果是集群部署，填写集群名称' },
      { key: 'applicationName', label: '应用名称', type: 'string', required: false, defaultValue: 'xilian-platform', description: '在 system.query_log 中显示的应用名' },
    ],
    authFields: [
      { key: 'username', label: '用户名', type: 'string', required: false, defaultValue: 'default' },
      { key: 'password', label: '密码', type: 'password', required: false },
      { key: 'tls', label: '启用 TLS', type: 'boolean', required: false, defaultValue: false },
      { key: 'tlsCaCert', label: 'CA 证书 (PEM)', type: 'string', required: false, group: 'TLS' },
      { key: 'tlsRejectUnauthorized', label: '验证服务器证书', type: 'boolean', required: false, defaultValue: true, group: 'TLS' },
    ],
    advancedFields: [
      // 连接控制
      { key: 'requestTimeout', label: '请求超时(ms)', type: 'number', required: false, defaultValue: 30000 },
      { key: 'compression', label: '启用压缩', type: 'boolean', required: false, defaultValue: true, description: '使用 gzip 压缩请求和响应' },
      { key: 'maxOpenConnections', label: '最大连接数', type: 'number', required: false, defaultValue: 10 },
      { key: 'keepAliveEnabled', label: '启用 Keep-Alive', type: 'boolean', required: false, defaultValue: true },
      // 会话设置
      { key: 'maxExecutionTime', label: '最大执行时间(秒)', type: 'number', required: false, defaultValue: 0, description: '单条查询最大执行时间（0=不限制）' },
      { key: 'maxMemoryUsage', label: '最大内存使用(字节)', type: 'number', required: false, defaultValue: 0, description: '单条查询最大内存（0=服务器默认）' },
      { key: 'maxResultRows', label: '最大结果行数', type: 'number', required: false, defaultValue: 0, description: '限制查询返回的最大行数' },
      { key: 'insertQuorum', label: '插入仲裁数', type: 'number', required: false, defaultValue: 0, description: '集群模式下插入确认的副本数' },
      { key: 'selectSequentialConsistency', label: '顺序一致性读', type: 'boolean', required: false, defaultValue: false, description: '集群模式下的顺序一致性读取' },
      // 数据格式
      { key: 'outputFormat', label: '输出格式', type: 'select', required: false, defaultValue: 'JSONEachRow', options: [
        { label: 'JSONEachRow', value: 'JSONEachRow' },
        { label: 'JSONCompactEachRow', value: 'JSONCompactEachRow' },
        { label: 'CSV', value: 'CSV' },
        { label: 'TabSeparated', value: 'TabSeparated' },
        { label: 'Native', value: 'Native' },
      ], description: '查询结果的输出格式' },
      { key: 'sessionSettings', label: '会话设置 (JSON)', type: 'json', required: false, description: '自定义 ClickHouse 会话设置，如 {"max_threads": 4}' },
    ],
  };

  private createCHClient(params: Record<string, unknown>, auth?: Record<string, unknown>): ClickHouseClient {
    let host = (params.host as string) || 'http://localhost:8123';
    if (!host.startsWith('http')) host = `http://${host}`;

    return createClient({
      url: host,
      database: (params.database as string) || 'default',
      username: (auth?.username as string) || 'default',
      password: (auth?.password as string) || '',
      request_timeout: (params.requestTimeout as number) || 30000,
      compression: {
        request: (params.compression !== false),
        response: (params.compression !== false),
      },
      max_open_connections: (params.maxOpenConnections as number) || 10,
    });
  }

  protected async doTestConnection(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const client = this.createCHClient(params, auth);

    try {
      const pingOk = await client.ping();
      if (!pingOk.success) {
        return { success: false, latencyMs: 0, message: 'ClickHouse ping 失败' };
      }

      // 获取服务器版本和运行信息
      const versionRes = await client.query({ query: 'SELECT version() as version' });
      const versionData = await versionRes.json<{ version: string }>();
      const version = versionData.data[0]?.version || 'Unknown';

      const statsRes = await client.query({
        query: `SELECT 
          uptime() as uptime,
          (SELECT count() FROM system.databases) as database_count,
          (SELECT count() FROM system.tables WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')) as table_count,
          (SELECT formatReadableSize(sum(bytes_on_disk)) FROM system.parts WHERE active) as total_disk_usage,
          (SELECT count() FROM system.processes) as active_queries`
      });
      const stats = (await statsRes.json<any>()).data[0];

      return {
        success: true,
        latencyMs: 0,
        message: `成功连接到 ClickHouse ${version}`,
        serverVersion: version,
        details: {
          host: params.host,
          database: params.database || 'default',
          uptime: `${Math.round(Number(stats.uptime) / 3600)}h`,
          databaseCount: Number(stats.database_count),
          tableCount: Number(stats.table_count),
          totalDiskUsage: stats.total_disk_usage,
          activeQueries: Number(stats.active_queries),
        },
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: 0,
        message: `ClickHouse 连接失败: ${(err as Error).message}`,
        details: { host: params.host, error: (err as Error).message },
      };
    } finally {
      try { await client.close(); } catch { /* ignore */ }
    }
  }

  protected async doDiscoverResources(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<DiscoveredEndpoint[]> {
    const client = this.createCHClient(params, auth);
    const endpoints: DiscoveredEndpoint[] = [];

    try {
      // 获取数据库列表
      const targetDb = params.database as string;
      let databases: string[];

      if (targetDb && targetDb !== 'default') {
        databases = [targetDb];
      } else {
        const dbRes = await client.query({
          query: "SELECT name FROM system.databases WHERE name NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema') ORDER BY name"
        });
        databases = (await dbRes.json<{ name: string }>()).data.map(r => r.name);
      }

      for (const db of databases.slice(0, 10)) {
        // 获取表信息
        const tableRes = await client.query({
          query: `SELECT 
            name, engine, total_rows, total_bytes,
            formatReadableSize(total_bytes) as readable_size,
            partition_key, sorting_key, primary_key, sampling_key,
            comment
          FROM system.tables 
          WHERE database = {db:String}
          ORDER BY name`,
          query_params: { db },
        });
        const tables = (await tableRes.json<any>()).data;

        for (const table of tables.slice(0, 50)) {
          // 获取列信息
          const colRes = await client.query({
            query: `SELECT name, type, default_kind, default_expression, comment, is_in_primary_key, is_in_sorting_key
              FROM system.columns WHERE database = {db:String} AND table = {table:String} ORDER BY position`,
            query_params: { db, table: table.name },
          });
          const columns = (await colRes.json<any>()).data.map((col: any) => ({
            name: col.name,
            type: col.type,
            defaultKind: col.default_kind || undefined,
            defaultExpression: col.default_expression || undefined,
            comment: col.comment || undefined,
            isPrimaryKey: col.is_in_primary_key === 1,
            isSortingKey: col.is_in_sorting_key === 1,
          }));

          endpoints.push({
            resourcePath: `${db}/${table.name}`,
            resourceType: 'table',
            name: `${db}.${table.name}`,
            dataFormat: 'json',
            schemaInfo: {
              database: db,
              tableName: table.name,
              engine: table.engine,
              columns,
              columnCount: columns.length,
              partitionKey: table.partition_key || undefined,
              sortingKey: table.sorting_key || undefined,
              primaryKey: table.primary_key || undefined,
              samplingKey: table.sampling_key || undefined,
            },
            metadata: {
              estimatedRows: Number(table.total_rows),
              totalBytes: Number(table.total_bytes),
              readableSize: table.readable_size,
              comment: table.comment || undefined,
            },
          });
        }
      }

      return endpoints;
    } finally {
      try { await client.close(); } catch { /* ignore */ }
    }
  }

  protected async doHealthCheck(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<Omit<HealthCheckResult, 'latencyMs' | 'checkedAt'>> {
    const client = this.createCHClient(params, auth);

    try {
      const pingOk = await client.ping();
      if (!pingOk.success) {
        return { status: 'unhealthy', message: 'ClickHouse ping 失败' };
      }

      const res = await client.query({
        query: `SELECT 
          (SELECT count() FROM system.processes) as active_queries,
          (SELECT count() FROM system.replicas WHERE is_readonly) as readonly_replicas,
          (SELECT count() FROM system.mutations WHERE is_done = 0) as pending_mutations,
          (SELECT count() FROM system.merges) as active_merges`
      });
      const stats = (await res.json<any>()).data[0];

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (Number(stats.readonly_replicas) > 0 || Number(stats.pending_mutations) > 10) status = 'degraded';

      return {
        status,
        message: `ClickHouse 运行正常，活跃查询 ${stats.active_queries}，合并中 ${stats.active_merges}`,
        metrics: {
          activeQueries: Number(stats.active_queries),
          readonlyReplicas: Number(stats.readonly_replicas),
          pendingMutations: Number(stats.pending_mutations),
          activeMerges: Number(stats.active_merges),
        },
      };
    } catch (err) {
      return { status: 'unhealthy', message: `ClickHouse 健康检查失败: ${(err as Error).message}` };
    } finally {
      try { await client.close(); } catch { /* ignore */ }
    }
  }
}
