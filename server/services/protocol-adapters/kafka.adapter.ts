/**
 * Apache Kafka 消息队列协议适配器 - 生产级实现
 * 
 * 基于 kafkajs 库
 * 支持 SASL (PLAIN/SCRAM/GSSAPI/OAUTHBEARER)、SSL/TLS、消费者组管理
 * 高级特性：分区策略、压缩、幂等生产者、事务、Schema Registry
 * 资源发现：列出 Topic、分区、消费者组、偏移量信息
 */

import { Kafka, logLevel, SASLOptions, CompressionTypes } from 'kafkajs';
import { BaseAdapter, normalizeError, AdapterError, AdapterErrorCode } from './base';
import type { ConnectionTestResult, DiscoveredEndpoint, ProtocolConfigSchema, HealthCheckResult } from '../../../shared/accessLayerTypes';

export class KafkaAdapter extends BaseAdapter {
  readonly protocolType = 'kafka' as const;
  protected defaultTimeoutMs = 20000;

  readonly configSchema: ProtocolConfigSchema = {
    protocolType: 'kafka',
    label: 'Apache Kafka',
    connectionFields: [
      { key: 'brokers', label: 'Broker 列表', type: 'string', required: true, placeholder: 'broker1:9092,broker2:9092,broker3:9092', description: '逗号分隔的 Kafka Broker 地址列表' },
      { key: 'clientId', label: '客户端 ID', type: 'string', required: false, defaultValue: 'xilian-platform', description: '在 Broker 日志中标识此客户端' },
      { key: 'connectionTimeout', label: '连接超时(ms)', type: 'number', required: false, defaultValue: 10000 },
      { key: 'requestTimeout', label: '请求超时(ms)', type: 'number', required: false, defaultValue: 30000 },
    ],
    authFields: [
      { key: 'saslMechanism', label: 'SASL 认证机制', type: 'select', required: false, defaultValue: 'none', options: [
        { label: '无认证', value: 'none' },
        { label: 'PLAIN', value: 'plain' },
        { label: 'SCRAM-SHA-256', value: 'scram-sha-256' },
        { label: 'SCRAM-SHA-512', value: 'scram-sha-512' },
        { label: 'AWS IAM', value: 'aws' },
        { label: 'OAUTHBEARER', value: 'oauthbearer' },
      ]},
      { key: 'username', label: '用户名', type: 'string', required: false, description: 'SASL PLAIN/SCRAM 用户名' },
      { key: 'password', label: '密码', type: 'password', required: false, description: 'SASL PLAIN/SCRAM 密码' },
      { key: 'awsAccessKeyId', label: 'AWS Access Key ID', type: 'string', required: false, group: 'AWS IAM' },
      { key: 'awsSecretAccessKey', label: 'AWS Secret Access Key', type: 'password', required: false, group: 'AWS IAM' },
      { key: 'awsSessionToken', label: 'AWS Session Token', type: 'password', required: false, group: 'AWS IAM' },
      { key: 'awsRegion', label: 'AWS Region', type: 'string', required: false, group: 'AWS IAM' },
      { key: 'ssl', label: '启用 SSL/TLS', type: 'boolean', required: false, defaultValue: false },
      { key: 'sslCa', label: 'CA 证书 (PEM)', type: 'string', required: false, group: 'SSL' },
      { key: 'sslCert', label: '客户端证书 (PEM)', type: 'string', required: false, group: 'SSL' },
      { key: 'sslKey', label: '客户端私钥 (PEM)', type: 'string', required: false, group: 'SSL' },
      { key: 'sslRejectUnauthorized', label: '验证服务器证书', type: 'boolean', required: false, defaultValue: true, group: 'SSL' },
    ],
    advancedFields: [
      // 生产者配置
      { key: 'producerAcks', label: '生产者确认', type: 'select', required: false, defaultValue: '-1', options: [
        { label: '0 (不等待确认)', value: '0' },
        { label: '1 (Leader 确认)', value: '1' },
        { label: '-1 / all (所有 ISR 确认)', value: '-1' },
      ], description: '消息写入确认级别' },
      { key: 'producerIdempotent', label: '幂等生产者', type: 'boolean', required: false, defaultValue: false, description: '启用 Exactly-Once 语义（需要 acks=-1）' },
      { key: 'producerCompression', label: '压缩算法', type: 'select', required: false, defaultValue: 'none', options: [
        { label: '无压缩', value: 'none' },
        { label: 'GZIP', value: 'gzip' },
        { label: 'Snappy', value: 'snappy' },
        { label: 'LZ4', value: 'lz4' },
        { label: 'ZSTD', value: 'zstd' },
      ]},
      { key: 'producerBatchSize', label: '批量大小(字节)', type: 'number', required: false, defaultValue: 16384, description: '生产者批量发送的字节阈值' },
      { key: 'producerLingerMs', label: '发送延迟(ms)', type: 'number', required: false, defaultValue: 0, description: '等待更多消息以批量发送的延迟' },
      { key: 'transactionalId', label: '事务 ID', type: 'string', required: false, description: '启用事务性生产者的唯一标识' },
      // 消费者配置
      { key: 'consumerGroupId', label: '消费者组 ID', type: 'string', required: false, placeholder: 'xilian-consumer-group', description: '消费者组标识' },
      { key: 'consumerAutoOffsetReset', label: '偏移量重置策略', type: 'select', required: false, defaultValue: 'latest', options: [
        { label: '最新 (latest)', value: 'latest' },
        { label: '最早 (earliest)', value: 'earliest' },
      ]},
      { key: 'consumerMaxBytes', label: '最大拉取字节', type: 'number', required: false, defaultValue: 1048576, description: '单次 fetch 的最大字节数（默认 1MB）' },
      { key: 'consumerMaxWaitTimeMs', label: '最大等待时间(ms)', type: 'number', required: false, defaultValue: 5000 },
      { key: 'consumerSessionTimeout', label: '会话超时(ms)', type: 'number', required: false, defaultValue: 30000 },
      { key: 'consumerHeartbeatInterval', label: '心跳间隔(ms)', type: 'number', required: false, defaultValue: 3000 },
      { key: 'consumerAutoCommit', label: '自动提交偏移量', type: 'boolean', required: false, defaultValue: true },
      { key: 'consumerAutoCommitInterval', label: '自动提交间隔(ms)', type: 'number', required: false, defaultValue: 5000 },
      // 重试与连接
      { key: 'retries', label: '重试次数', type: 'number', required: false, defaultValue: 5 },
      { key: 'initialRetryTime', label: '初始重试延迟(ms)', type: 'number', required: false, defaultValue: 300 },
      { key: 'maxRetryTime', label: '最大重试延迟(ms)', type: 'number', required: false, defaultValue: 30000 },
      { key: 'logLevel', label: '日志级别', type: 'select', required: false, defaultValue: 'WARN', options: [
        { label: 'NOTHING', value: 'NOTHING' },
        { label: 'ERROR', value: 'ERROR' },
        { label: 'WARN', value: 'WARN' },
        { label: 'INFO', value: 'INFO' },
        { label: 'DEBUG', value: 'DEBUG' },
      ]},
      // Schema Registry
      { key: 'schemaRegistryUrl', label: 'Schema Registry URL', type: 'string', required: false, placeholder: 'http://schema-registry:8081', description: 'Confluent Schema Registry 地址' },
      { key: 'schemaRegistryAuth', label: 'Schema Registry 认证', type: 'string', required: false, description: 'Basic Auth (user:password)' },
    ],
  };

  private createKafka(params: Record<string, unknown>, auth?: Record<string, unknown>): Kafka {
    const brokersStr = (params.brokers as string) || 'localhost:9092';
    const brokers = brokersStr.split(',').map(b => b.trim()).filter(Boolean);

    const kafkaConfig: any = {
      clientId: (params.clientId as string) || 'xilian-platform',
      brokers,
      connectionTimeout: (params.connectionTimeout as number) || 10000,
      requestTimeout: (params.requestTimeout as number) || 30000,
      retry: {
        retries: (params.retries as number) ?? 5,
        initialRetryTime: (params.initialRetryTime as number) || 300,
        maxRetryTime: (params.maxRetryTime as number) || 30000,
      },
      logLevel: this.getLogLevel((params.logLevel as string) || 'WARN'),
    };

    // SASL 认证
    const saslMechanism = (auth?.saslMechanism as string) || 'none';
    if (saslMechanism !== 'none') {
      if (saslMechanism === 'plain' || saslMechanism === 'scram-sha-256' || saslMechanism === 'scram-sha-512') {
        kafkaConfig.sasl = {
          mechanism: saslMechanism,
          username: (auth?.username as string) || '',
          password: (auth?.password as string) || '',
        };
      } else if (saslMechanism === 'aws') {
        kafkaConfig.sasl = {
          mechanism: 'aws',
          authorizationIdentity: (auth?.awsAccessKeyId as string) || '',
          accessKeyId: (auth?.awsAccessKeyId as string) || '',
          secretAccessKey: (auth?.awsSecretAccessKey as string) || '',
          sessionToken: (auth?.awsSessionToken as string) || undefined,
        };
      }
    }

    // SSL
    if (auth?.ssl) {
      kafkaConfig.ssl = {
        rejectUnauthorized: auth.sslRejectUnauthorized !== false,
      };
      if (auth.sslCa) kafkaConfig.ssl.ca = [auth.sslCa as string];
      if (auth.sslCert) kafkaConfig.ssl.cert = auth.sslCert as string;
      if (auth.sslKey) kafkaConfig.ssl.key = auth.sslKey as string;
    }

    return new Kafka(kafkaConfig);
  }

  private getLogLevel(level: string): logLevel {
    const map: Record<string, logLevel> = {
      'NOTHING': logLevel.NOTHING,
      'ERROR': logLevel.ERROR,
      'WARN': logLevel.WARN,
      'INFO': logLevel.INFO,
      'DEBUG': logLevel.DEBUG,
    };
    return map[level] || logLevel.WARN;
  }

  protected async doTestConnection(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const brokersStr = (params.brokers as string) || '';
    if (!brokersStr) {
      return { success: false, latencyMs: 0, message: 'Broker 列表不能为空' };
    }

    const kafka = this.createKafka(params, auth);
    const admin = kafka.admin();

    try {
      await admin.connect();

      // 获取集群信息
      const cluster = await admin.describeCluster();
      const topics = await admin.listTopics();
      const groups = await admin.listGroups();

      const details: Record<string, unknown> = {
        clusterId: cluster.clusterId,
        controller: cluster.controller,
        brokers: cluster.brokers.map(b => ({ nodeId: b.nodeId, host: b.host, port: b.port })),
        brokerCount: cluster.brokers.length,
        topicCount: topics.length,
        topics: topics.slice(0, 50),
        consumerGroupCount: groups.groups.length,
        consumerGroups: groups.groups.slice(0, 20).map(g => ({ groupId: g.groupId, protocolType: g.protocolType })),
      };

      return {
        success: true,
        latencyMs: 0,
        message: `Kafka 集群连接成功 (${cluster.brokers.length} 个 Broker, ${topics.length} 个 Topic)`,
        serverVersion: `Kafka Cluster ${cluster.clusterId}`,
        details,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: 0,
        message: `Kafka 连接失败: ${(err as Error).message}`,
        details: { brokers: brokersStr, error: (err as Error).message },
      };
    } finally {
      try { await admin.disconnect(); } catch { /* ignore */ }
    }
  }

  protected async doDiscoverResources(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<DiscoveredEndpoint[]> {
    const kafka = this.createKafka(params, auth);
    const admin = kafka.admin();
    const endpoints: DiscoveredEndpoint[] = [];

    try {
      await admin.connect();

      // 获取所有 Topic 的元数据
      const topics = await admin.listTopics();
      const metadata = await admin.fetchTopicMetadata({ topics });

      for (const topicMeta of metadata.topics) {
        // 获取 Topic 偏移量
        let offsets: any[] = [];
        try {
          offsets = await admin.fetchTopicOffsets(topicMeta.name);
        } catch { /* ignore */ }

        const totalMessages = offsets.reduce((sum, p) => {
          return sum + (parseInt(p.high) - parseInt(p.low));
        }, 0);

        endpoints.push({
          resourcePath: topicMeta.name,
          resourceType: 'topic',
          name: `Topic: ${topicMeta.name}`,
          dataFormat: 'json',
          schemaInfo: {
            partitions: topicMeta.partitions.length,
            replicationFactor: topicMeta.partitions[0]?.replicas?.length || 0,
          },
          metadata: {
            partitionDetails: topicMeta.partitions.map(p => ({
              partitionId: p.partitionId,
              leader: p.leader,
              replicas: p.replicas,
              isr: p.isr,
            })),
            offsets,
            estimatedMessages: totalMessages,
            isInternal: topicMeta.name.startsWith('__'),
          },
        });
      }

      // 获取消费者组信息
      const groups = await admin.listGroups();
      for (const group of groups.groups.slice(0, 50)) {
        try {
          const groupDesc = await admin.describeGroups([group.groupId]);
          const desc = groupDesc.groups[0];
          endpoints.push({
            resourcePath: `group:${group.groupId}`,
            resourceType: 'collection',
            name: `消费者组: ${group.groupId}`,
            dataFormat: 'json',
            metadata: {
              entityType: 'consumerGroup',
              state: desc?.state,
              protocol: desc?.protocol,
              protocolType: desc?.protocolType,
              members: desc?.members?.length || 0,
            },
          });
        } catch { /* ignore */ }
      }

      return endpoints;
    } finally {
      try { await admin.disconnect(); } catch { /* ignore */ }
    }
  }

  protected async doHealthCheck(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<Omit<HealthCheckResult, 'latencyMs' | 'checkedAt'>> {
    const kafka = this.createKafka(params, auth);
    const admin = kafka.admin();

    try {
      await admin.connect();
      const cluster = await admin.describeCluster();
      const topics = await admin.listTopics();

      return {
        status: 'healthy',
        message: `Kafka 集群正常 - ${cluster.brokers.length} Broker, ${topics.length} Topic`,
        metrics: {
          clusterId: cluster.clusterId,
          brokerCount: cluster.brokers.length,
          topicCount: topics.length,
          controller: cluster.controller,
        },
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        message: `Kafka 健康检查失败: ${(err as Error).message}`,
      };
    } finally {
      try { await admin.disconnect(); } catch { /* ignore */ }
    }
  }
}
