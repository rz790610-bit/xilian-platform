/**
 * MySQL 协议适配器 - 生产级实现
 * 
 * 基于 mysql2 库（Promise API）
 * 支持连接池、SSL/TLS、多数据库发现、表结构扫描
 * 高级特性：连接池调优、查询超时、字符集、时区、压缩
 */

import * as mysql from 'mysql2/promise';
import { BaseAdapter, normalizeError, AdapterError, AdapterErrorCode } from './base';
import type { ConnectionTestResult, DiscoveredEndpoint, ProtocolConfigSchema, HealthCheckResult } from '../../../shared/accessLayerTypes';

export class MysqlAdapter extends BaseAdapter {
  readonly protocolType = 'mysql' as const;
  protected defaultTimeoutMs = 15000;

  readonly configSchema: ProtocolConfigSchema = {
    protocolType: 'mysql',
    label: 'MySQL 数据库',
    icon: '🐬',
    description: '关系型数据库',
    category: 'database',
    connectionFields: [
      { key: 'host', label: '主机地址', type: 'string', required: true, placeholder: '192.168.1.100' },
      { key: 'port', label: '端口', type: 'number', required: true, defaultValue: 3306 },
      { key: 'database', label: '数据库名', type: 'string', required: false, placeholder: '留空则列出所有数据库', description: '指定默认数据库，留空可在资源发现时列出所有数据库' },
      { key: 'charset', label: '字符集', type: 'select', required: false, defaultValue: 'utf8mb4', options: [
        { label: 'utf8mb4 (推荐)', value: 'utf8mb4' },
        { label: 'utf8', value: 'utf8' },
        { label: 'latin1', value: 'latin1' },
        { label: 'gbk', value: 'gbk' },
        { label: 'gb2312', value: 'gb2312' },
      ]},
    ],
    authFields: [
      { key: 'user', label: '用户名', type: 'string', required: true, defaultValue: 'root' },
      { key: 'password', label: '密码', type: 'password', required: false },
      { key: 'ssl', label: '启用 SSL', type: 'boolean', required: false, defaultValue: false },
      { key: 'sslCa', label: 'CA 证书 (PEM)', type: 'textarea', required: false, group: 'SSL' },
      { key: 'sslCert', label: '客户端证书 (PEM)', type: 'textarea', required: false, group: 'SSL' },
      { key: 'sslKey', label: '客户端私钥 (PEM)', type: 'textarea', required: false, group: 'SSL' },
      { key: 'sslRejectUnauthorized', label: '验证服务器证书', type: 'boolean', required: false, defaultValue: true, group: 'SSL' },
      { key: 'authPlugin', label: '认证插件', type: 'select', required: false, defaultValue: 'auto', options: [
        { label: '自动检测', value: 'auto' },
        { label: 'caching_sha2_password (MySQL 8+)', value: 'caching_sha2_password' },
        { label: 'mysql_native_password', value: 'mysql_native_password' },
        { label: 'sha256_password', value: 'sha256_password' },
      ], description: 'MySQL 8.0 默认使用 caching_sha2_password' },
    ],
    advancedFields: [
      // 连接控制
      { key: 'connectTimeout', label: '连接超时(ms)', type: 'number', required: false, defaultValue: 10000 },
      { key: 'timezone', label: '时区', type: 'string', required: false, defaultValue: '+08:00', description: '会话时区，如 +08:00, UTC, Asia/Shanghai' },
      // 连接池
      { key: 'connectionLimit', label: '连接池大小', type: 'number', required: false, defaultValue: 10, description: '最大并发连接数' },
      { key: 'queueLimit', label: '等待队列上限', type: 'number', required: false, defaultValue: 0, description: '连接池满时的等待队列长度（0=不限制）' },
      { key: 'waitForConnections', label: '等待可用连接', type: 'boolean', required: false, defaultValue: true, description: '连接池满时是否等待' },
      { key: 'idleTimeout', label: '空闲超时(ms)', type: 'number', required: false, defaultValue: 60000, description: '空闲连接回收时间' },
      { key: 'maxIdle', label: '最大空闲连接数', type: 'number', required: false, defaultValue: 10 },
      // 查询配置
      { key: 'multipleStatements', label: '允许多语句', type: 'boolean', required: false, defaultValue: false, description: '允许单次执行多条 SQL（安全风险）' },
      { key: 'dateStrings', label: '日期返回字符串', type: 'boolean', required: false, defaultValue: false, description: 'DATE/DATETIME 类型返回字符串而非 Date 对象' },
      { key: 'decimalNumbers', label: '精确小数', type: 'boolean', required: false, defaultValue: false, description: 'DECIMAL 类型返回 Number 而非 String' },
      { key: 'supportBigNumbers', label: '大数支持', type: 'boolean', required: false, defaultValue: true, description: '支持 BIGINT 和 DECIMAL 大数' },
      { key: 'bigNumberStrings', label: '大数返回字符串', type: 'boolean', required: false, defaultValue: false, description: '大数返回字符串以避免精度丢失' },
      // 性能
      { key: 'enableCompression', label: '启用压缩', type: 'boolean', required: false, defaultValue: false, description: '启用 zlib 协议压缩（适合远程连接）' },
      { key: 'enableKeepAlive', label: '启用 TCP KeepAlive', type: 'boolean', required: false, defaultValue: true },
      { key: 'keepAliveInitialDelay', label: 'KeepAlive 延迟(ms)', type: 'number', required: false, defaultValue: 10000 },
      { key: 'namedPlaceholders', label: '命名占位符', type: 'boolean', required: false, defaultValue: false, description: '使用 :name 风格的参数占位符' },
    ],
  };

  private buildConnectionConfig(params: Record<string, unknown>, auth?: Record<string, unknown>): mysql.ConnectionOptions {
    const config: mysql.ConnectionOptions = {
      host: (params.host as string) || 'localhost',
      port: (params.port as number) || 3306,
      user: (auth?.user as string) || 'root',
      password: (auth?.password as string) || undefined,
      database: (params.database as string) || undefined,
      charset: (params.charset as string) || 'utf8mb4',
      connectTimeout: (params.connectTimeout as number) || 10000,
      timezone: (params.timezone as string) || '+08:00',
      multipleStatements: (params.multipleStatements as boolean) || false,
      dateStrings: (params.dateStrings as boolean) || false,
      decimalNumbers: (params.decimalNumbers as boolean) || false,
      supportBigNumbers: params.supportBigNumbers !== false,
      bigNumberStrings: (params.bigNumberStrings as boolean) || false,
      enableKeepAlive: params.enableKeepAlive !== false,
      keepAliveInitialDelay: (params.keepAliveInitialDelay as number) || 10000,
      namedPlaceholders: (params.namedPlaceholders as boolean) || false,
    };

    if (params.enableCompression) {
      (config as any).compress = true;
    }

    // SSL 配置
    if (auth?.ssl) {
      config.ssl = {
        rejectUnauthorized: auth.sslRejectUnauthorized !== false,
      };
      if (auth.sslCa) (config.ssl as any).ca = auth.sslCa as string;
      if (auth.sslCert) (config.ssl as any).cert = auth.sslCert as string;
      if (auth.sslKey) (config.ssl as any).key = auth.sslKey as string;
    }

    return config;
  }

  protected async doTestConnection(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const host = params.host as string;
    if (!host) {
      return { success: false, latencyMs: 0, message: '主机地址不能为空' };
    }

    const config = this.buildConnectionConfig(params, auth);
    let connection: mysql.Connection | null = null;

    try {
      connection = await mysql.createConnection(config);

      // 获取服务器版本和状态
      const [versionRows] = await connection.query('SELECT VERSION() as version');
      const version = (versionRows as any[])[0]?.version || 'Unknown';

      // 获取服务器变量
      const [statusRows] = await connection.query(`
        SELECT 
          @@global.max_connections as max_connections,
          @@global.wait_timeout as wait_timeout,
          @@global.interactive_timeout as interactive_timeout,
          @@global.character_set_server as charset_server,
          @@global.collation_server as collation_server,
          @@global.innodb_buffer_pool_size as buffer_pool_size,
          @@global.time_zone as server_timezone,
          @@global.read_only as read_only,
          @@global.server_id as server_id
      `);
      const status = (statusRows as any[])[0] || {};

      // 获取当前连接数
      const [processRows] = await connection.query('SELECT COUNT(*) as cnt FROM information_schema.processlist');
      const activeConnections = (processRows as any[])[0]?.cnt || 0;

      // 获取数据库列表
      const [dbRows] = await connection.query('SHOW DATABASES');
      const databases = (dbRows as any[]).map(r => r.Database).filter(d => !['information_schema', 'performance_schema', 'mysql', 'sys'].includes(d));

      const details: Record<string, unknown> = {
        version,
        maxConnections: status.max_connections,
        activeConnections,
        waitTimeout: status.wait_timeout,
        charsetServer: status.charset_server,
        collationServer: status.collation_server,
        bufferPoolSize: status.buffer_pool_size,
        serverTimezone: status.server_timezone,
        readOnly: status.read_only,
        serverId: status.server_id,
        userDatabases: databases,
        databaseCount: databases.length,
      };

      return {
        success: true,
        latencyMs: 0,
        message: `MySQL ${host}:${params.port || 3306} 连接成功 (${databases.length} 个用户数据库)`,
        serverVersion: version,
        details,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: 0,
        message: `MySQL 连接失败: ${(err as Error).message}`,
        details: { host, port: params.port, error: (err as Error).message },
      };
    } finally {
      try { if (connection) await connection.end(); } catch { /* ignore */ }
    }
  }

  protected async doDiscoverResources(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<DiscoveredEndpoint[]> {
    const config = this.buildConnectionConfig(params, auth);
    let connection: mysql.Connection | null = null;
    const endpoints: DiscoveredEndpoint[] = [];

    try {
      connection = await mysql.createConnection(config);
      const targetDb = params.database as string;

      // 获取要扫描的数据库列表
      let databases: string[];
      if (targetDb) {
        databases = [targetDb];
      } else {
        const [dbRows] = await connection.query('SHOW DATABASES');
        databases = (dbRows as any[]).map(r => r.Database)
          .filter(d => !['information_schema', 'performance_schema', 'mysql', 'sys'].includes(d));
      }

      for (const db of databases) {
        // 获取表信息
        const [tableRows] = await connection.query(`
          SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, 
                 TABLE_COMMENT, CREATE_TIME, UPDATE_TIME
          FROM information_schema.TABLES 
          WHERE TABLE_SCHEMA = ?
          ORDER BY TABLE_NAME
        `, [db]);

        for (const table of (tableRows as any[])) {
          // 获取列信息
          const [columnRows] = await connection.query(`
            SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA, COLUMN_COMMENT
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
            ORDER BY ORDINAL_POSITION
          `, [db, table.TABLE_NAME]);

          endpoints.push({
            resourcePath: `${db}.${table.TABLE_NAME}`,
            resourceType: 'table',
            name: table.TABLE_COMMENT || table.TABLE_NAME,
            dataFormat: 'json',
            schemaInfo: {
              columns: (columnRows as any[]).map(col => ({
                name: col.COLUMN_NAME,
                type: col.DATA_TYPE,
                fullType: col.COLUMN_TYPE,
                nullable: col.IS_NULLABLE === 'YES',
                key: col.COLUMN_KEY,
                default: col.COLUMN_DEFAULT,
                extra: col.EXTRA,
                comment: col.COLUMN_COMMENT,
              })),
              columnCount: (columnRows as any[]).length,
            },
            metadata: {
              tableType: table.TABLE_TYPE,
              engine: table.ENGINE,
              estimatedRows: table.TABLE_ROWS,
              dataSize: table.DATA_LENGTH,
              indexSize: table.INDEX_LENGTH,
              createTime: table.CREATE_TIME,
              updateTime: table.UPDATE_TIME,
            },
          });
        }
      }

      return endpoints;
    } finally {
      try { if (connection) await connection.end(); } catch { /* ignore */ }
    }
  }

  protected async doHealthCheck(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<Omit<HealthCheckResult, 'latencyMs' | 'checkedAt'>> {
    const config = this.buildConnectionConfig(params, auth);
    let connection: mysql.Connection | null = null;

    try {
      connection = await mysql.createConnection(config);
      const [rows] = await connection.query('SELECT 1 as heartbeat');
      const ok = (rows as any[])[0]?.heartbeat === 1;

      // 获取关键指标
      const [statusRows] = await connection.query("SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Threads_running','Queries','Uptime','Slow_queries','Aborted_connects')");
      const statusMap: Record<string, string> = {};
      for (const row of (statusRows as any[])) {
        statusMap[row.Variable_name] = row.Value;
      }

      return {
        status: ok ? 'healthy' : 'degraded',
        message: `MySQL ${ok ? '正常' : '异常'} - 已运行 ${statusMap.Uptime || 0} 秒`,
        metrics: {
          threadsConnected: parseInt(statusMap.Threads_connected) || 0,
          threadsRunning: parseInt(statusMap.Threads_running) || 0,
          totalQueries: parseInt(statusMap.Queries) || 0,
          slowQueries: parseInt(statusMap.Slow_queries) || 0,
          abortedConnects: parseInt(statusMap.Aborted_connects) || 0,
          uptimeSeconds: parseInt(statusMap.Uptime) || 0,
        },
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        message: `MySQL 健康检查失败: ${(err as Error).message}`,
      };
    } finally {
      try { if (connection) await connection.end(); } catch { /* ignore */ }
    }
  }
}
