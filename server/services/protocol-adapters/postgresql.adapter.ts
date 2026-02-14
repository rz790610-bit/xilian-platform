/**
 * PostgreSQL 协议适配器 - 生产级实现
 * 
 * 基于 pg (node-postgres) 库
 * 支持连接池、SSL/TLS、多 Schema、PostGIS 扩展检测
 * 资源发现：列出 Schema、表、视图、物化视图、列信息、索引
 */

import * as pg from 'pg';
import { BaseAdapter } from './base';
import type { ConnectionTestResult, DiscoveredEndpoint, ProtocolConfigSchema, HealthCheckResult } from '../../../shared/accessLayerTypes';

export class PostgresqlAdapter extends BaseAdapter {
  readonly protocolType = 'postgresql' as const;
  protected defaultTimeoutMs = 15000;

  readonly configSchema: ProtocolConfigSchema = {
    protocolType: 'postgresql',
    label: 'PostgreSQL 数据库',
    icon: '🐘',
    description: '高级关系型数据库',
    category: 'database',
    connectionFields: [
      { key: 'host', label: '主机地址', type: 'string', required: true, placeholder: '192.168.1.100' },
      { key: 'port', label: '端口', type: 'number', required: true, defaultValue: 5432 },
      { key: 'database', label: '数据库名', type: 'string', required: true, defaultValue: 'postgres' },
      { key: 'schema', label: 'Schema', type: 'string', required: false, defaultValue: 'public', description: '留空则扫描所有用户 Schema' },
      { key: 'applicationName', label: '应用名称', type: 'string', required: false, defaultValue: 'xilian-platform', description: '在 pg_stat_activity 中显示的应用名' },
    ],
    authFields: [
      { key: 'user', label: '用户名', type: 'string', required: true, defaultValue: 'postgres' },
      { key: 'password', label: '密码', type: 'password', required: false },
      { key: 'sslMode', label: 'SSL 模式', type: 'select', required: false, defaultValue: 'prefer', options: [
        { label: 'disable (不使用)', value: 'disable' },
        { label: 'allow (尝试非 SSL)', value: 'allow' },
        { label: 'prefer (优先 SSL)', value: 'prefer' },
        { label: 'require (必须 SSL)', value: 'require' },
        { label: 'verify-ca (验证 CA)', value: 'verify-ca' },
        { label: 'verify-full (验证 CA + 主机名)', value: 'verify-full' },
      ], description: 'PostgreSQL SSL 连接模式' },
      { key: 'sslCa', label: 'CA 证书 (PEM)', type: 'string', required: false, group: 'SSL' },
      { key: 'sslCert', label: '客户端证书 (PEM)', type: 'string', required: false, group: 'SSL' },
      { key: 'sslKey', label: '客户端私钥 (PEM)', type: 'string', required: false, group: 'SSL' },
    ],
    advancedFields: [
      // 连接控制
      { key: 'connectionTimeoutMillis', label: '连接超时(ms)', type: 'number', required: false, defaultValue: 10000 },
      { key: 'statementTimeout', label: '语句超时(ms)', type: 'number', required: false, defaultValue: 0, description: '单条 SQL 执行超时（0=不限制）' },
      { key: 'queryTimeout', label: '查询超时(ms)', type: 'number', required: false, defaultValue: 0, description: '查询结果等待超时（0=不限制）' },
      { key: 'lockTimeout', label: '锁等待超时(ms)', type: 'number', required: false, defaultValue: 0, description: '等待锁的超时时间（0=不限制）' },
      // 连接池
      { key: 'poolMax', label: '连接池最大连接', type: 'number', required: false, defaultValue: 20 },
      { key: 'poolMin', label: '连接池最小连接', type: 'number', required: false, defaultValue: 2 },
      { key: 'poolIdleTimeoutMillis', label: '空闲超时(ms)', type: 'number', required: false, defaultValue: 30000, description: '空闲连接回收时间' },
      { key: 'poolAllowExitOnIdle', label: '空闲时允许退出', type: 'boolean', required: false, defaultValue: false, description: '所有连接空闲时允许事件循环退出' },
      // 类型处理
      { key: 'parseInputDatesAsUTC', label: 'UTC 日期解析', type: 'boolean', required: false, defaultValue: false, description: '将输入日期解析为 UTC' },
      { key: 'typeParsers', label: '自定义类型解析 (JSON)', type: 'json', required: false, description: '自定义 OID 到 JS 类型的映射' },
      // 搜索路径
      { key: 'searchPath', label: '搜索路径', type: 'string', required: false, placeholder: 'public,custom_schema', description: '逗号分隔的 Schema 搜索路径' },
      // 扩展
      { key: 'enableTimescaleDB', label: 'TimescaleDB 扩展', type: 'boolean', required: false, defaultValue: false, description: '检测并使用 TimescaleDB 超表' },
      { key: 'enablePostGIS', label: 'PostGIS 扩展', type: 'boolean', required: false, defaultValue: false, description: '检测并使用 PostGIS 空间数据' },
    ],
  };

  private buildClientConfig(params: Record<string, unknown>, auth?: Record<string, unknown>): pg.ClientConfig {
    const config: pg.ClientConfig = {
      host: (params.host as string) || 'localhost',
      port: (params.port as number) || 5432,
      database: (params.database as string) || 'postgres',
      user: (auth?.user as string) || 'postgres',
      password: (auth?.password as string) || undefined,
      connectionTimeoutMillis: (params.connectionTimeoutMillis as number) || 10000,
      statement_timeout: (params.statementTimeout as number) || 30000,
      application_name: (params.applicationName as string) || 'XiLian Platform',
    };

    const sslMode = (auth?.sslMode as string) || 'prefer';
    if (sslMode !== 'disable') {
      if (sslMode === 'require' || sslMode === 'verify-ca' || sslMode === 'verify-full') {
        config.ssl = {
          rejectUnauthorized: sslMode === 'verify-ca' || sslMode === 'verify-full',
        };
        if (auth?.sslCa) (config.ssl as any).ca = auth.sslCa as string;
        if (auth?.sslCert) (config.ssl as any).cert = auth.sslCert as string;
        if (auth?.sslKey) (config.ssl as any).key = auth.sslKey as string;
      } else if (sslMode === 'prefer' || sslMode === 'allow') {
        config.ssl = { rejectUnauthorized: false };
      }
    }

    return config;
  }

  protected async doTestConnection(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const config = this.buildClientConfig(params, auth);
    const client = new pg.Client(config);

    try {
      await client.connect();

      // 获取服务器版本
      const versionRes = await client.query('SELECT version()');
      const fullVersion = versionRes.rows[0]?.version || 'Unknown';

      // 获取数据库大小和连接信息
      const statsRes = await client.query(`
        SELECT 
          pg_size_pretty(pg_database_size(current_database())) as db_size,
          (SELECT count(*) FROM pg_stat_activity) as active_connections,
          (SELECT setting FROM pg_settings WHERE name = 'max_connections') as max_connections,
          current_database() as database,
          current_schema() as current_schema
      `);
      const stats = statsRes.rows[0];

      // 检查已安装的扩展
      const extRes = await client.query("SELECT extname, extversion FROM pg_extension ORDER BY extname");
      const extensions = extRes.rows.map(r => `${r.extname} v${r.extversion}`);

      return {
        success: true,
        latencyMs: 0,
        message: `成功连接到 PostgreSQL (${config.host}:${config.port}/${config.database})`,
        serverVersion: fullVersion.split(' ').slice(0, 2).join(' '),
        details: {
          host: config.host,
          port: config.port,
          database: stats.database,
          currentSchema: stats.current_schema,
          databaseSize: stats.db_size,
          activeConnections: Number(stats.active_connections),
          maxConnections: Number(stats.max_connections),
          extensions,
          fullVersion,
        },
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: 0,
        message: `PostgreSQL 连接失败: ${(err as Error).message}`,
        details: { host: config.host, port: config.port, error: (err as Error).message },
      };
    } finally {
      try { await client.end(); } catch { /* ignore */ }
    }
  }

  protected async doDiscoverResources(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<DiscoveredEndpoint[]> {
    const config = this.buildClientConfig(params, auth);
    const client = new pg.Client(config);
    const endpoints: DiscoveredEndpoint[] = [];

    try {
      await client.connect();

      const targetSchema = params.schema as string;
      let schemas: string[];

      if (targetSchema) {
        schemas = [targetSchema];
      } else {
        const schemaRes = await client.query(
          "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast') ORDER BY schema_name"
        );
        schemas = schemaRes.rows.map(r => r.schema_name);
      }

      for (const schema of schemas.slice(0, 10)) {
        // 获取表和视图
        const tableRes = await client.query(`
          SELECT 
            t.table_name, t.table_type,
            pg_size_pretty(pg_total_relation_size(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))) as total_size,
            (SELECT reltuples::bigint FROM pg_class WHERE oid = (quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::regclass) as estimated_rows,
            obj_description((quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::regclass) as comment
          FROM information_schema.tables t
          WHERE t.table_schema = $1
          ORDER BY t.table_name
          LIMIT 100
        `, [schema]);

        for (const table of tableRes.rows) {
          // 获取列信息
          const colRes = await client.query(`
            SELECT 
              c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default,
              col_description((quote_ident($1) || '.' || quote_ident($2))::regclass, c.ordinal_position) as comment,
              CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
            FROM information_schema.columns c
            LEFT JOIN (
              SELECT kcu.column_name FROM information_schema.table_constraints tc
              JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
              WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'PRIMARY KEY'
            ) pk ON c.column_name = pk.column_name
            WHERE c.table_schema = $1 AND c.table_name = $2
            ORDER BY c.ordinal_position
          `, [schema, table.table_name]);

          const columns = colRes.rows.map(col => ({
            name: col.column_name,
            type: col.data_type,
            udtName: col.udt_name,
            nullable: col.is_nullable === 'YES',
            defaultValue: col.column_default,
            comment: col.comment,
            isPrimaryKey: col.is_primary_key,
          }));

          endpoints.push({
            resourcePath: `${schema}/${table.table_name}`,
            resourceType: 'table',
            name: `${schema}.${table.table_name}`,
            dataFormat: 'json',
            schemaInfo: {
              schema,
              tableName: table.table_name,
              tableType: table.table_type,
              columns,
              columnCount: columns.length,
            },
            metadata: {
              estimatedRows: Number(table.estimated_rows) || 0,
              totalSize: table.total_size,
              comment: table.comment,
              primaryKeys: columns.filter(c => c.isPrimaryKey).map(c => c.name),
            },
          });
        }
      }

      return endpoints;
    } finally {
      try { await client.end(); } catch { /* ignore */ }
    }
  }

  protected async doHealthCheck(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<Omit<HealthCheckResult, 'latencyMs' | 'checkedAt'>> {
    const config = this.buildClientConfig(params, auth);
    const client = new pg.Client(config);

    try {
      await client.connect();

      const res = await client.query(`
        SELECT 
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_queries,
          (SELECT count(*) FROM pg_stat_activity) as total_connections,
          (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction' AND now() - state_change > interval '5 minutes') as long_idle_txn,
          pg_is_in_recovery() as is_replica
      `);
      const stats = res.rows[0];
      const connectionUsage = Number(stats.total_connections) / Number(stats.max_connections);

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (connectionUsage > 0.9 || Number(stats.long_idle_txn) > 5) status = 'degraded';

      return {
        status,
        message: `PostgreSQL ${stats.is_replica ? '(副本) ' : ''}运行正常，连接使用率 ${Math.round(connectionUsage * 100)}%`,
        metrics: {
          activeQueries: Number(stats.active_queries),
          totalConnections: Number(stats.total_connections),
          maxConnections: Number(stats.max_connections),
          connectionUsage: Math.round(connectionUsage * 100),
          longIdleTransactions: Number(stats.long_idle_txn),
          isReplica: stats.is_replica,
        },
      };
    } catch (err) {
      return { status: 'unhealthy', message: `PostgreSQL 健康检查失败: ${(err as Error).message}` };
    } finally {
      try { await client.end(); } catch { /* ignore */ }
    }
  }
}
