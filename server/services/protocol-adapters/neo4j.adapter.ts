/**
 * Neo4j 图数据库协议适配器 - 生产级实现
 * 
 * 基于 neo4j-driver 库
 * 支持 Bolt / Neo4j 协议，加密连接，因果一致性集群
 * 资源发现：扫描节点标签、关系类型、索引、约束
 */

import neo4j, { Driver, Session, auth as neo4jAuth } from 'neo4j-driver';
import { BaseAdapter, normalizeError, AdapterError, AdapterErrorCode } from './base';
import type { ConnectionTestResult, DiscoveredEndpoint, ProtocolConfigSchema, HealthCheckResult } from '../../../shared/accessLayerTypes';

export class Neo4jAdapter extends BaseAdapter {
  readonly protocolType = 'neo4j' as const;
  protected defaultTimeoutMs = 15000;

  readonly configSchema: ProtocolConfigSchema = {
    protocolType: 'neo4j',
    label: 'Neo4j 图数据库',
    connectionFields: [
      { key: 'uri', label: '连接 URI', type: 'string', required: true, placeholder: 'bolt://localhost:7687', description: '支持 bolt://, bolt+s://, bolt+ssc://, neo4j://, neo4j+s://, neo4j+ssc://' },
      { key: 'database', label: '数据库名', type: 'string', required: false, defaultValue: 'neo4j', description: '目标数据库（Neo4j 4.0+ 支持多数据库）' },
      { key: 'routingScheme', label: '路由模式', type: 'select', required: false, defaultValue: 'direct', options: [
        { label: '直连 (bolt://)', value: 'direct' },
        { label: '路由 (neo4j://)', value: 'routing' },
      ], description: '集群部署使用路由模式以支持读写分离' },
    ],
    authFields: [
      { key: 'username', label: '用户名', type: 'string', required: true, defaultValue: 'neo4j' },
      { key: 'password', label: '密码', type: 'password', required: true },
      { key: 'authScheme', label: '认证方式', type: 'select', required: false, defaultValue: 'basic', options: [
        { label: 'Basic (用户名/密码)', value: 'basic' },
        { label: 'Kerberos', value: 'kerberos' },
        { label: 'Bearer Token', value: 'bearer' },
        { label: '无认证', value: 'none' },
      ]},
      { key: 'kerberosTicket', label: 'Kerberos Ticket', type: 'password', required: false, group: 'Kerberos' },
      { key: 'bearerToken', label: 'Bearer Token', type: 'password', required: false, group: 'Bearer' },
      { key: 'encrypted', label: '加密连接', type: 'boolean', required: false, defaultValue: false, description: '使用 bolt:// 时手动启用加密' },
      { key: 'trustedCertificates', label: '信任证书 (PEM)', type: 'string', required: false, group: 'TLS', description: '自签名证书的 CA 链' },
    ],
    advancedFields: [
      { key: 'maxConnectionPoolSize', label: '最大连接池', type: 'number', required: false, defaultValue: 100 },
      { key: 'connectionAcquisitionTimeout', label: '连接获取超时(ms)', type: 'number', required: false, defaultValue: 60000 },
      { key: 'connectionTimeout', label: '连接超时(ms)', type: 'number', required: false, defaultValue: 30000 },
      { key: 'maxTransactionRetryTime', label: '事务重试超时(ms)', type: 'number', required: false, defaultValue: 30000 },
      { key: 'fetchSize', label: '拉取批次大小', type: 'number', required: false, defaultValue: 1000, description: '每次从服务器拉取的记录数' },
      { key: 'disableLosslessIntegers', label: '禁用无损整数', type: 'boolean', required: false, defaultValue: false, description: '使用 JS Number 替代 Neo4j Integer' },
      { key: 'bookmarkManager', label: '启用书签管理', type: 'boolean', required: false, defaultValue: true, description: '因果一致性集群的书签管理' },
      { key: 'defaultAccessMode', label: '默认访问模式', type: 'select', required: false, defaultValue: 'WRITE', options: [
        { label: '读写 (WRITE)', value: 'WRITE' },
        { label: '只读 (READ)', value: 'READ' },
      ]},
    ],
  };

  private createDriver(params: Record<string, unknown>, auth?: Record<string, unknown>): Driver {
    const uri = params.uri as string;
    const authScheme = (auth?.authScheme as string) || 'basic';

    let authToken;
    switch (authScheme) {
      case 'kerberos':
        authToken = neo4jAuth.kerberos(auth?.kerberosTicket as string);
        break;
      case 'bearer':
        authToken = neo4jAuth.bearer(auth?.bearerToken as string);
        break;
      case 'none':
        authToken = undefined;
        break;
      case 'basic':
      default:
        authToken = neo4jAuth.basic(
          (auth?.username as string) || 'neo4j',
          (auth?.password as string) || ''
        );
    }

    const config: any = {
      maxConnectionPoolSize: (params.maxConnectionPoolSize as number) || 100,
      connectionAcquisitionTimeout: (params.connectionAcquisitionTimeout as number) || 60000,
      connectionTimeout: (params.connectionTimeout as number) || 30000,
      maxTransactionRetryTime: (params.maxTransactionRetryTime as number) || 30000,
      disableLosslessIntegers: (params.disableLosslessIntegers as boolean) || false,
    };

    if (auth?.encrypted) {
      config.encrypted = 'ENCRYPTION_ON';
      if (auth.trustedCertificates) {
        config.trust = 'TRUST_CUSTOM_CA_SIGNED_CERTIFICATES';
        config.trustedCertificates = [auth.trustedCertificates as string];
      }
    }

    return neo4j.driver(uri, authToken, config);
  }

  protected async doTestConnection(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const uri = params.uri as string;
    if (!uri) {
      return { success: false, latencyMs: 0, message: '连接 URI 不能为空' };
    }

    const driver = this.createDriver(params, auth);
    const database = (params.database as string) || 'neo4j';

    try {
      // 验证连接
      const serverInfo = await driver.getServerInfo();

      // 执行查询获取详细信息
      const session = driver.session({ database });
      try {
        const result = await session.run('CALL dbms.components() YIELD name, versions, edition');
        const record = result.records[0];

        // 获取数据库统计
        const statsResult = await session.run(`
          CALL apoc.meta.stats() YIELD labelCount, relTypeCount, propertyKeyCount, nodeCount, relCount
          RETURN labelCount, relTypeCount, propertyKeyCount, nodeCount, relCount
        `).catch(() => null);

        const details: Record<string, unknown> = {
          address: serverInfo.address,
          agent: serverInfo.agent,
          protocolVersion: serverInfo.protocolVersion,
          database,
        };

        if (record) {
          details.name = record.get('name');
          details.version = record.get('versions')?.[0];
          details.edition = record.get('edition');
        }

        if (statsResult?.records[0]) {
          const stats = statsResult.records[0];
          details.labelCount = stats.get('labelCount')?.toNumber?.() ?? stats.get('labelCount');
          details.relTypeCount = stats.get('relTypeCount')?.toNumber?.() ?? stats.get('relTypeCount');
          details.nodeCount = stats.get('nodeCount')?.toNumber?.() ?? stats.get('nodeCount');
          details.relCount = stats.get('relCount')?.toNumber?.() ?? stats.get('relCount');
        }

        return {
          success: true,
          latencyMs: 0,
          message: `Neo4j ${uri} 连接成功 (${details.edition || 'Community'} Edition)`,
          serverVersion: (details.version as string) || serverInfo.agent || 'Unknown',
          details,
        };
      } finally {
        await session.close();
      }
    } catch (err) {
      return {
        success: false,
        latencyMs: 0,
        message: `Neo4j 连接失败: ${(err as Error).message}`,
        details: { uri, error: (err as Error).message },
      };
    } finally {
      try { await driver.close(); } catch { /* ignore */ }
    }
  }

  protected async doDiscoverResources(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<DiscoveredEndpoint[]> {
    const driver = this.createDriver(params, auth);
    const database = (params.database as string) || 'neo4j';
    const session = driver.session({ database });
    const endpoints: DiscoveredEndpoint[] = [];

    try {
      // 1. 发现节点标签
      const labelsResult = await session.run('CALL db.labels() YIELD label');
      for (const record of labelsResult.records) {
        const label = record.get('label');
        // 获取每个标签的节点数量
        const countResult = await session.run(`MATCH (n:\`${label}\`) RETURN count(n) as cnt LIMIT 1`);
        const count = countResult.records[0]?.get('cnt')?.toNumber?.() ?? countResult.records[0]?.get('cnt') ?? 0;

        endpoints.push({
          resourcePath: `label:${label}`,
          resourceType: 'collection',
          name: `节点标签: ${label}`,
          dataFormat: 'json',
          schemaInfo: { nodeLabel: label },
          metadata: { nodeCount: count, entityType: 'nodeLabel' },
        });
      }

      // 2. 发现关系类型
      const relTypesResult = await session.run('CALL db.relationshipTypes() YIELD relationshipType');
      for (const record of relTypesResult.records) {
        const relType = record.get('relationshipType');
        endpoints.push({
          resourcePath: `rel:${relType}`,
          resourceType: 'collection',
          name: `关系类型: ${relType}`,
          dataFormat: 'json',
          schemaInfo: { relationshipType: relType },
          metadata: { entityType: 'relationshipType' },
        });
      }

      // 3. 发现索引
      try {
        const indexResult = await session.run('SHOW INDEXES YIELD name, type, labelsOrTypes, properties, state');
        for (const record of indexResult.records) {
          endpoints.push({
            resourcePath: `index:${record.get('name')}`,
            resourceType: 'collection',
            name: `索引: ${record.get('name')}`,
            dataFormat: 'json',
            metadata: {
              entityType: 'index',
              indexType: record.get('type'),
              labels: record.get('labelsOrTypes'),
              properties: record.get('properties'),
              state: record.get('state'),
            },
          });
        }
      } catch { /* SHOW INDEXES 可能在旧版本不可用 */ }

      // 4. 发现约束
      try {
        const constraintResult = await session.run('SHOW CONSTRAINTS YIELD name, type, labelsOrTypes, properties');
        for (const record of constraintResult.records) {
          endpoints.push({
            resourcePath: `constraint:${record.get('name')}`,
            resourceType: 'collection',
            name: `约束: ${record.get('name')}`,
            dataFormat: 'json',
            metadata: {
              entityType: 'constraint',
              constraintType: record.get('type'),
              labels: record.get('labelsOrTypes'),
              properties: record.get('properties'),
            },
          });
        }
      } catch { /* ignore */ }

      return endpoints;
    } finally {
      await session.close();
      await driver.close();
    }
  }

  protected async doHealthCheck(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<Omit<HealthCheckResult, 'latencyMs' | 'checkedAt'>> {
    const driver = this.createDriver(params, auth);
    const database = (params.database as string) || 'neo4j';

    try {
      const serverInfo = await driver.getServerInfo();
      const session = driver.session({ database });
      try {
        const result = await session.run('RETURN 1 as heartbeat');
        const ok = result.records[0]?.get('heartbeat') === 1 || result.records[0]?.get('heartbeat')?.toNumber?.() === 1;

        return {
          status: ok ? 'healthy' : 'degraded',
          message: `Neo4j ${ok ? '正常' : '异常'} - ${serverInfo.agent}`,
          metrics: {
            address: serverInfo.address,
            agent: serverInfo.agent,
            protocolVersion: serverInfo.protocolVersion,
          },
        };
      } finally {
        await session.close();
      }
    } catch (err) {
      return {
        status: 'unhealthy',
        message: `Neo4j 健康检查失败: ${(err as Error).message}`,
      };
    } finally {
      try { await driver.close(); } catch { /* ignore */ }
    }
  }
}
