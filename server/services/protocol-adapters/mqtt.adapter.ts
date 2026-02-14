/**
 * MQTT 协议适配器 - 生产级实现
 * 
 * 基于 mqtt.js (v5) 客户端库
 * 支持 MQTT 3.1.1 / 5.0 协议，TLS/SSL 加密，QoS 0/1/2
 * 高级特性：LWT (遗嘱消息)、消息保留、主题别名、会话过期
 * 资源发现：通过 $SYS 主题和通配符订阅发现活跃 Topic
 */

import mqtt from 'mqtt';
import { BaseAdapter, AdapterError, AdapterErrorCode, normalizeError } from './base';
import type { ConnectionTestResult, DiscoveredEndpoint, ProtocolConfigSchema, HealthCheckResult } from '../../../shared/accessLayerTypes';

export class MqttAdapter extends BaseAdapter {
  readonly protocolType = 'mqtt' as const;
  protected defaultTimeoutMs = 15000;

  readonly configSchema: ProtocolConfigSchema = {
    protocolType: 'mqtt',
    label: 'MQTT Broker',
    connectionFields: [
      { key: 'host', label: '主机地址', type: 'string', required: true, placeholder: '192.168.1.100', description: 'MQTT Broker 主机名或 IP' },
      { key: 'port', label: '端口', type: 'number', required: true, defaultValue: 1883, description: '默认 1883 (TCP), 8883 (TLS), 8083 (WebSocket)' },
      { key: 'protocol', label: '传输协议', type: 'select', required: true, defaultValue: 'mqtt', options: [
        { label: 'MQTT (TCP)', value: 'mqtt' },
        { label: 'MQTTS (TLS)', value: 'mqtts' },
        { label: 'WS (WebSocket)', value: 'ws' },
        { label: 'WSS (WebSocket + TLS)', value: 'wss' },
      ]},
      { key: 'mqttVersion', label: 'MQTT 版本', type: 'select', required: false, defaultValue: '4', options: [
        { label: 'MQTT 3.1.1 (v4)', value: '4' },
        { label: 'MQTT 5.0 (v5)', value: '5' },
      ]},
      { key: 'clientId', label: '客户端 ID', type: 'string', required: false, placeholder: '留空自动生成', description: '唯一标识此连接的客户端 ID，集群部署需确保唯一' },
      { key: 'keepalive', label: '心跳间隔(秒)', type: 'number', required: false, defaultValue: 60, description: 'PINGREQ 发送间隔，0 表示禁用心跳' },
      { key: 'cleanSession', label: '清除会话', type: 'boolean', required: false, defaultValue: true, description: 'true=每次连接创建新会话; false=恢复持久会话' },
    ],
    authFields: [
      { key: 'username', label: '用户名', type: 'string', required: false },
      { key: 'password', label: '密码', type: 'password', required: false },
      { key: 'caCert', label: 'CA 证书 (PEM)', type: 'string', required: false, description: 'TLS 模式下的 CA 根证书', group: 'TLS' },
      { key: 'clientCert', label: '客户端证书 (PEM)', type: 'string', required: false, group: 'TLS' },
      { key: 'clientKey', label: '客户端私钥 (PEM)', type: 'string', required: false, group: 'TLS' },
      { key: 'rejectUnauthorized', label: '验证服务器证书', type: 'boolean', required: false, defaultValue: true, group: 'TLS' },
    ],
    advancedFields: [
      // 连接控制
      { key: 'connectTimeout', label: '连接超时(ms)', type: 'number', required: false, defaultValue: 10000 },
      { key: 'reconnectPeriod', label: '重连间隔(ms)', type: 'number', required: false, defaultValue: 5000, description: '0 表示禁用自动重连' },
      { key: 'qos', label: '默认 QoS', type: 'select', required: false, defaultValue: '1', options: [
        { label: 'QoS 0 (最多一次)', value: '0' },
        { label: 'QoS 1 (至少一次)', value: '1' },
        { label: 'QoS 2 (恰好一次)', value: '2' },
      ]},
      // MQTT 5.0 特性
      { key: 'sessionExpiryInterval', label: '会话过期(秒)', type: 'number', required: false, description: 'MQTT 5.0: 会话过期间隔，0=连接断开时立即过期' },
      { key: 'receiveMaximum', label: '接收最大值', type: 'number', required: false, defaultValue: 65535, description: 'MQTT 5.0: 客户端同时处理的最大 QoS 1/2 消息数' },
      { key: 'topicAliasMaximum', label: '主题别名最大值', type: 'number', required: false, defaultValue: 0, description: 'MQTT 5.0: 主题别名数量上限（减少带宽）' },
      { key: 'maximumPacketSize', label: '最大包大小(字节)', type: 'number', required: false, description: 'MQTT 5.0: 客户端愿意接受的最大包大小' },
      // LWT 遗嘱消息
      { key: 'lwtTopic', label: 'LWT 主题', type: 'string', required: false, placeholder: 'devices/xilian/status', description: '遗嘱消息主题（客户端异常断开时发布）', group: 'LWT' },
      { key: 'lwtPayload', label: 'LWT 消息体', type: 'string', required: false, placeholder: '{"status":"offline"}', group: 'LWT' },
      { key: 'lwtQos', label: 'LWT QoS', type: 'select', required: false, defaultValue: '1', options: [
        { label: 'QoS 0', value: '0' }, { label: 'QoS 1', value: '1' }, { label: 'QoS 2', value: '2' },
      ], group: 'LWT' },
      { key: 'lwtRetain', label: 'LWT 保留', type: 'boolean', required: false, defaultValue: true, group: 'LWT' },
      // 性能调优
      { key: 'reschedulePings', label: '重调度心跳', type: 'boolean', required: false, defaultValue: true, description: '收到消息后重置心跳计时器' },
      { key: 'queueQoSZero', label: '缓存 QoS 0', type: 'boolean', required: false, defaultValue: true, description: '离线时是否缓存 QoS 0 消息' },
    ],
  };

  private buildMqttOptions(params: Record<string, unknown>, auth?: Record<string, unknown>): mqtt.IClientOptions {
    const protocol = (params.protocol as string) || 'mqtt';
    const host = params.host as string;
    const port = (params.port as number) || 1883;
    const mqttVersion = params.mqttVersion === '5' ? 5 : 4;

    const options: mqtt.IClientOptions = {
      protocol: protocol as mqtt.IClientOptions['protocol'],
      hostname: host,
      port,
      clientId: (params.clientId as string) || `xilian_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      keepalive: (params.keepalive as number) ?? 60,
      clean: params.cleanSession !== false,
      connectTimeout: (params.connectTimeout as number) || 10000,
      reconnectPeriod: 0, // 测试连接时不自动重连
      protocolVersion: mqttVersion,
      reschedulePings: params.reschedulePings !== false,
      queueQoSZero: params.queueQoSZero !== false,
    };

    // MQTT 5.0 属性
    if (mqttVersion === 5) {
      options.properties = {};
      if (params.sessionExpiryInterval !== undefined) {
        options.properties.sessionExpiryInterval = params.sessionExpiryInterval as number;
      }
      if (params.receiveMaximum !== undefined) {
        options.properties.receiveMaximum = params.receiveMaximum as number;
      }
      if (params.topicAliasMaximum !== undefined) {
        options.properties.topicAliasMaximum = params.topicAliasMaximum as number;
      }
      if (params.maximumPacketSize !== undefined) {
        options.properties.maximumPacketSize = params.maximumPacketSize as number;
      }
    }

    // LWT 遗嘱消息
    if (params.lwtTopic) {
      options.will = {
        topic: params.lwtTopic as string,
        payload: Buffer.from((params.lwtPayload as string) || '{"status":"offline"}'),
        qos: parseInt((params.lwtQos as string) || '1') as 0 | 1 | 2,
        retain: params.lwtRetain !== false,
      };
    }

    // 认证
    if (auth?.username) options.username = auth.username as string;
    if (auth?.password) options.password = auth.password as string;

    // TLS 配置
    if (protocol === 'mqtts' || protocol === 'wss') {
      options.rejectUnauthorized = auth?.rejectUnauthorized !== false;
      if (auth?.caCert) options.ca = auth.caCert as string;
      if (auth?.clientCert) options.cert = auth.clientCert as string;
      if (auth?.clientKey) options.key = auth.clientKey as string;
    }

    return options;
  }

  protected async doTestConnection(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const options = this.buildMqttOptions(params, auth);
    const url = `${options.protocol}://${options.hostname}:${options.port}`;

    return new Promise<ConnectionTestResult>((resolve) => {
      const client = mqtt.connect(url, options);
      const timeout = setTimeout(() => {
        client.end(true);
        resolve({
          success: false,
          latencyMs: 0,
          message: `连接超时: ${url}`,
        });
      }, (params.connectTimeout as number) || 10000);

      client.on('connect', (connack) => {
        clearTimeout(timeout);
        const details: Record<string, unknown> = {
          sessionPresent: connack.sessionPresent,
          protocolVersion: options.protocolVersion,
          clientId: options.clientId,
          transport: options.protocol,
          keepalive: options.keepalive,
          cleanSession: options.clean,
        };

        // MQTT 5.0 CONNACK 属性
        if (options.protocolVersion === 5 && (connack as any).properties) {
          const props = (connack as any).properties;
          details.serverKeepAlive = props.serverKeepAlive;
          details.assignedClientIdentifier = props.assignedClientIdentifier;
          details.maximumQoS = props.maximumQoS;
          details.retainAvailable = props.retainAvailable;
          details.wildcardSubscriptionAvailable = props.wildcardSubscriptionAvailable;
          details.sharedSubscriptionAvailable = props.sharedSubscriptionAvailable;
          details.topicAliasMaximum = props.topicAliasMaximum;
          details.serverReference = props.serverReference;
        }

        // LWT 配置确认
        if (options.will) {
          details.lwtConfigured = true;
          details.lwtTopic = options.will.topic;
        }

        client.end(true);
        resolve({
          success: true,
          latencyMs: 0,
          message: `成功连接到 MQTT Broker ${url}`,
          serverVersion: `MQTT v${options.protocolVersion === 5 ? '5.0' : '3.1.1'}`,
          details,
        });
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        client.end(true);
        resolve({
          success: false,
          latencyMs: 0,
          message: `连接失败: ${err.message}`,
          details: { error: err.message },
        });
      });
    });
  }

  protected async doDiscoverResources(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<DiscoveredEndpoint[]> {
    const options = this.buildMqttOptions(params, auth);
    const url = `${options.protocol}://${options.hostname}:${options.port}`;
    const discoveredTopics = new Map<string, { messageCount: number; lastPayload: string; firstSeen: number }>();

    return new Promise<DiscoveredEndpoint[]>((resolve, reject) => {
      const client = mqtt.connect(url, { ...options, reconnectPeriod: 0 });
      const listenDuration = 5000; // 监听 5 秒

      const timeout = setTimeout(() => {
        client.end(true);
        reject(new AdapterError(AdapterErrorCode.TIMEOUT, 'mqtt', '资源发现连接超时'));
      }, 15000);

      client.on('connect', () => {
        // 订阅 $SYS 主题获取 broker 信息 + 通配符发现业务 Topic
        client.subscribe(['$SYS/#', '#'], { qos: 0 }, (err) => {
          if (err) {
            clearTimeout(timeout);
            client.end(true);
            reject(normalizeError(err, 'mqtt'));
            return;
          }

          // 监听一段时间收集活跃 Topic
          setTimeout(() => {
            clearTimeout(timeout);
            client.end(true);

            const endpoints: DiscoveredEndpoint[] = [];
            const sysTopics: DiscoveredEndpoint[] = [];

            for (const [topic, info] of Array.from(discoveredTopics.entries())) {
              if (!topic.startsWith('$SYS')) {
                // 尝试检测数据格式
                let dataFormat: 'json' | 'csv' | 'binary' = 'json';
                try {
                  JSON.parse(info.lastPayload);
                } catch {
                  if (info.lastPayload.includes(',') && info.lastPayload.includes('\n')) {
                    dataFormat = 'csv';
                  } else {
                    dataFormat = 'binary';
                  }
                }

                endpoints.push({
                  resourcePath: topic,
                  resourceType: 'topic',
                  name: topic.split('/').pop() || topic,
                  dataFormat,
                  metadata: {
                    messageCount: info.messageCount,
                    samplePayload: info.lastPayload.slice(0, 500),
                    messageRate: info.messageCount / (listenDuration / 1000),
                  },
                });
              } else {
                sysTopics.push({
                  resourcePath: topic,
                  resourceType: 'topic',
                  name: topic.replace('$SYS/', ''),
                  metadata: { systemTopic: true, value: info.lastPayload.slice(0, 200) },
                });
              }
            }

            // 如果没有发现业务 Topic，返回 $SYS 信息
            resolve(endpoints.length > 0 ? endpoints : sysTopics.slice(0, 20));
          }, listenDuration);
        });
      });

      client.on('message', (topic, payload) => {
        const existing = discoveredTopics.get(topic);
        if (existing) {
          existing.messageCount++;
          existing.lastPayload = payload.toString('utf-8');
        } else {
          discoveredTopics.set(topic, {
            messageCount: 1,
            lastPayload: payload.toString('utf-8'),
            firstSeen: Date.now(),
          });
        }
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        client.end(true);
        reject(normalizeError(err, 'mqtt'));
      });
    });
  }

  protected async doHealthCheck(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<Omit<HealthCheckResult, 'latencyMs' | 'checkedAt'>> {
    const testResult = await this.doTestConnection(params, auth);
    return {
      status: testResult.success ? 'healthy' : 'unhealthy',
      message: testResult.message,
      metrics: {
        ...testResult.details,
        protocolType: 'mqtt',
      },
    };
  }
}
