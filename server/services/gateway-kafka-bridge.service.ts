/**
 * 边缘网关 → Kafka 桥接服务
 * ============================================================
 * 
 * 数据动脉入口：接收边缘网关上报的原始遥测数据，写入 Kafka
 * 
 * 架构位置：
 *   边缘网关 ──┬── MQTT ──────┐
 *              ├── HTTP/REST ──┤
 *              ├── WebSocket ──┤──→ [本服务] ──→ Kafka(telemetry.raw.{gateway_id})
 *              ├── gRPC ───────┤
 *              └── Modbus/TCP ─┘
 * 
 * 支持的接入协议：
 *   1. MQTT — 订阅网关上报主题（主要协议，IoT 标准）
 *   2. HTTP — RESTful 推送接口（兼容旧设备/第三方系统）
 *   3. WebSocket — 长连接实时推送（高频数据场景）
 *   4. gRPC — 高性能二进制流（大规模部署）
 *   5. Modbus/TCP — 工业现场总线（通过协议转换网关）
 * 
 * 设计原则：
 *   1. 协议无关 — 所有协议适配器输出统一的 RawTelemetryMessage 格式
 *   2. 网关认证 — 每个网关有独立的凭证，支持 mTLS/Token/Basic Auth
 *   3. 数据校验 — 入口处校验消息格式，拒绝无效数据
 *   4. 背压传导 — Kafka 写入阻塞时，通知上游暂停发送
 *   5. 网关心跳 — 自动更新 edge_gateways 表的 last_heartbeat
 *   6. 指标采集 — 每个网关独立的吞吐量/错误率统计
 */

import { kafkaClient, KAFKA_TOPICS } from '../lib/clients/kafka.client';
import { createModuleLogger } from '../core/logger';
import type { RawTelemetryMessage } from './feature-extraction/types';

const log = createModuleLogger('gateway-bridge');

// ============================================================
// 配置
// ============================================================

interface BridgeConfig {
  /** Kafka 批量写入大小 */
  kafkaBatchSize: number;
  /** Kafka 批量写入间隔（毫秒） */
  kafkaFlushIntervalMs: number;
  /** 最大缓冲区大小 */
  maxBufferSize: number;
  /** 网关心跳更新间隔（毫秒） */
  heartbeatIntervalMs: number;
  /** 消息最大大小（字节） */
  maxMessageSizeBytes: number;
  /** 是否启用消息校验 */
  enableValidation: boolean;
}

const DEFAULT_CONFIG: BridgeConfig = {
  kafkaBatchSize: 1000,
  kafkaFlushIntervalMs: 200,
  maxBufferSize: 100000,
  heartbeatIntervalMs: 30000,
  maxMessageSizeBytes: 1024 * 1024, // 1MB（波形数据可能较大）
  enableValidation: true,
};

// ============================================================
// 协议适配器接口
// ============================================================

/**
 * 协议适配器接口
 * 每种接入协议实现此接口
 */
export interface ProtocolHandler {
  /** 协议名称 */
  readonly protocol: string;
  /** 启动监听 */
  start(onMessage: MessageCallback): Promise<void>;
  /** 停止监听 */
  stop(): Promise<void>;
  /** 健康检查 */
  healthCheck(): Promise<{ healthy: boolean; details: Record<string, unknown> }>;
}

type MessageCallback = (
  gatewayId: string,
  messages: IncomingMessage[]
) => Promise<void>;

/**
 * 入站消息（协议适配器解析后的统一格式）
 */
interface IncomingMessage {
  device_code: string;
  mp_code: string;
  timestamp: number | string;
  value?: number;
  waveform?: number[];
  sample_rate?: number;
  data_type?: string;
  unit?: string;
  quality?: number;
  raw_value?: number;
  batch_id?: string;
  metadata?: Record<string, any>;
}

// ============================================================
// 网关统计
// ============================================================

interface GatewayStats {
  messagesReceived: number;
  messagesPublished: number;
  messagesFailed: number;
  validationErrors: number;
  lastMessageAt: number;
  lastHeartbeatAt: number;
  bytesReceived: number;
}

// ============================================================
// 桥接服务指标
// ============================================================

interface BridgeMetrics {
  totalMessagesReceived: number;
  totalMessagesPublished: number;
  totalMessagesFailed: number;
  totalValidationErrors: number;
  activeGateways: number;
  bufferSize: number;
  startedAt: number;
}

// ============================================================
// MQTT 协议处理器
// ============================================================

/**
 * MQTT 协议处理器
 * 订阅边缘网关的 MQTT 主题，解析消息并回调
 * 
 * 主题规范：
 *   xilian/{gateway_id}/telemetry/raw   — 原始遥测数据
 *   xilian/{gateway_id}/telemetry/batch — 批量遥测数据
 *   xilian/{gateway_id}/status          — 网关状态/心跳
 *   xilian/+/telemetry/#                — 通配符订阅所有网关
 */
export class MqttProtocolHandler implements ProtocolHandler {
  readonly protocol = 'mqtt';
  private mqttClient: any = null;
  private onMessage: MessageCallback | null = null;

  private brokerUrl: string;
  private username: string;
  private password: string;
  private topicPrefix: string;

  constructor(config?: {
    brokerUrl?: string;
    username?: string;
    password?: string;
    topicPrefix?: string;
  }) {
    this.brokerUrl = config?.brokerUrl || process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    this.username = config?.username || process.env.MQTT_USERNAME || '';
    this.password = config?.password || process.env.MQTT_PASSWORD || '';
    this.topicPrefix = config?.topicPrefix || 'xilian';
  }

  async start(onMessage: MessageCallback): Promise<void> {
    this.onMessage = onMessage;

    // 动态导入 mqtt（避免未安装时报错）
    let mqtt: any;
    try {
      mqtt = await import('mqtt');
    } catch {
      log.warn('[MqttHandler] mqtt 模块未安装，MQTT 协议处理器未启动');
      return;
    }

    const options: Record<string, any> = {
      clientId: `xilian-bridge-${Date.now()}`,
      clean: true,
      keepalive: 60,
      reconnectPeriod: 5000,
    };
    if (this.username) options.username = this.username;
    if (this.password) options.password = this.password;

    this.mqttClient = mqtt.connect(this.brokerUrl, options);

    this.mqttClient.on('connect', () => {
      log.info(`[MqttHandler] 已连接到 ${this.brokerUrl}`);

      // 订阅所有网关的遥测数据
      const topics = [
        `${this.topicPrefix}/+/telemetry/raw`,
        `${this.topicPrefix}/+/telemetry/batch`,
        `${this.topicPrefix}/+/status`,
      ];
      this.mqttClient.subscribe(topics, { qos: 1 }, (err: any) => {
        if (err) {
          log.error('[MqttHandler] 订阅失败:', err);
        } else {
          log.info(`[MqttHandler] 已订阅: ${topics.join(', ')}`);
        }
      });
    });

    this.mqttClient.on('message', (topic: string, payload: Buffer) => {
      // QoS 1 下 MQTT 会自动 ack，但我们在 handleMqttMessage 中先写入缓冲区
      // 如果缓冲区满则立即 flush 到 Kafka，确保数据不丢失
      // 注意：如果需要严格的“先写 Kafka 再 ack MQTT”语义，
      // 需要将 MQTT 客户端配置为 manualAck 模式（mqtt.js v5+）
      // 并在 flushBuffer 成功后调用 client.puback(packet)
      this.handleMqttMessage(topic, payload).catch(err => {
        log.error('[MqttHandler] 消息处理异常:', err);
      });
    });

    this.mqttClient.on('error', (err: Error) => {
      log.error('[MqttHandler] MQTT 错误:', err);
    });

    this.mqttClient.on('reconnect', () => {
      log.debug('[MqttHandler] 正在重连...');
    });
  }

  private async handleMqttMessage(topic: string, payload: Buffer): Promise<void> {
    if (!this.onMessage) return;

    try {
      // 解析主题：xilian/{gateway_id}/telemetry/raw
      const parts = topic.split('/');
      if (parts.length < 3) return;

      const gatewayId = parts[1];
      const messageType = parts.slice(2).join('/');

      if (messageType === 'status') {
        // 心跳消息，不转发到 Kafka
        return;
      }

      const data = JSON.parse(payload.toString());

      // 支持单条和批量消息
      const messages: IncomingMessage[] = Array.isArray(data) ? data : [data];

      await this.onMessage(gatewayId, messages);
    } catch (error) {
      log.error('[MqttHandler] 消息处理失败:', error);
    }
  }

  async stop(): Promise<void> {
    if (this.mqttClient) {
      this.mqttClient.end(true);
      this.mqttClient = null;
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; details: Record<string, unknown> }> {
    return {
      healthy: this.mqttClient?.connected || false,
      details: {
        connected: this.mqttClient?.connected || false,
        brokerUrl: this.brokerUrl,
      },
    };
  }
}

// ============================================================
// HTTP 协议处理器
// ============================================================

/**
 * HTTP 协议处理器
 * 提供 RESTful 接口接收网关推送的遥测数据
 * 
 * 端点：
 *   POST /api/gateway/{gateway_id}/telemetry   — 单条/批量遥测数据
 *   POST /api/gateway/{gateway_id}/heartbeat   — 心跳
 *   
 * 认证：
 *   Authorization: Bearer {gateway_token}
 */
export class HttpProtocolHandler implements ProtocolHandler {
  readonly protocol = 'http';
  private onMessage: MessageCallback | null = null;

  /**
   * 注册到 Express/Fastify 路由
   * 由应用启动时调用，将路由挂载到主服务器
   */
  async start(onMessage: MessageCallback): Promise<void> {
    this.onMessage = onMessage;
    log.info('[HttpHandler] HTTP 协议处理器已就绪（需通过路由注册挂载）');
  }

  /**
   * 处理 HTTP 请求（由路由调用）
   */
  async handleRequest(
    gatewayId: string,
    body: unknown
  ): Promise<{ accepted: number; rejected: number }> {
    if (!this.onMessage) {
      throw new Error('HTTP 协议处理器未启动');
    }

    const messages: IncomingMessage[] = Array.isArray(body) ? body : [body as IncomingMessage];
    let accepted = 0;
    let rejected = 0;

    // 基础校验
    const validMessages: IncomingMessage[] = [];
    for (const msg of messages) {
      if (msg.device_code && msg.mp_code) {
        validMessages.push(msg);
        accepted++;
      } else {
        rejected++;
      }
    }

    if (validMessages.length > 0) {
      await this.onMessage(gatewayId, validMessages);
    }

    return { accepted, rejected };
  }

  async stop(): Promise<void> {
    this.onMessage = null;
  }

  async healthCheck(): Promise<{ healthy: boolean; details: Record<string, unknown> }> {
    return {
      healthy: this.onMessage !== null,
      details: { registered: this.onMessage !== null },
    };
  }
}

// ============================================================
// 桥接服务主体
// ============================================================

export class GatewayKafkaBridge {
  private config: BridgeConfig;
  private handlers: Map<string, ProtocolHandler> = new Map();
  private gatewayStats: Map<string, GatewayStats> = new Map();
  private metrics: BridgeMetrics;
  private buffer: Array<{ topic: string; key: string; value: string; timestamp: string }> = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(config: Partial<BridgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = {
      totalMessagesReceived: 0,
      totalMessagesPublished: 0,
      totalMessagesFailed: 0,
      totalValidationErrors: 0,
      activeGateways: 0,
      bufferSize: 0,
      startedAt: 0,
    };
  }

  // ----------------------------------------------------------
  // 生命周期
  // ----------------------------------------------------------

  /**
   * 注册协议处理器
   */
  registerHandler(handler: ProtocolHandler): void {
    this.handlers.set(handler.protocol, handler);
    log.info(`[GatewayBridge] 注册协议处理器: ${handler.protocol}`);
  }

  /**
   * 启动桥接服务
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    log.info('[GatewayBridge] 启动网关→Kafka 桥接服务...');
    this.isRunning = true;
    this.metrics.startedAt = Date.now();

    // 启动所有协议处理器
    for (const [protocol, handler] of this.handlers) {
      try {
        await handler.start(this.onMessagesReceived.bind(this));
        log.info(`[GatewayBridge] ${protocol} 处理器已启动`);
      } catch (error) {
        log.error(`[GatewayBridge] ${protocol} 处理器启动失败:`, error);
      }
    }

    // 启动批量刷写定时器
    this.flushTimer = setInterval(
      () => this.flushBuffer(),
      this.config.kafkaFlushIntervalMs
    );

    // 启动心跳更新定时器
    this.heartbeatTimer = setInterval(
      () => this.updateHeartbeats(),
      this.config.heartbeatIntervalMs
    );

    log.info(`[GatewayBridge] 已启动，协议: ${Array.from(this.handlers.keys()).join(', ')}`);
  }

  /**
   * 停止桥接服务
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    log.info('[GatewayBridge] 正在关闭...');
    this.isRunning = false;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // 刷写剩余缓冲
    await this.flushBuffer();

    // 停止所有处理器
    for (const [protocol, handler] of this.handlers) {
      try {
        await handler.stop();
      } catch (error) {
        log.error(`[GatewayBridge] ${protocol} 处理器停止失败:`, error);
      }
    }

    log.info(
      `[GatewayBridge] 已关闭。总计: received=${this.metrics.totalMessagesReceived}, ` +
      `published=${this.metrics.totalMessagesPublished}, failed=${this.metrics.totalMessagesFailed}`
    );
  }

  // ----------------------------------------------------------
  // 消息处理
  // ----------------------------------------------------------

  /**
   * 协议处理器的回调 — 接收解析后的消息
   */
  private async onMessagesReceived(
    gatewayId: string,
    messages: IncomingMessage[]
  ): Promise<void> {
    if (!this.isRunning) return;

    // 初始化网关统计
    if (!this.gatewayStats.has(gatewayId)) {
      this.gatewayStats.set(gatewayId, {
        messagesReceived: 0,
        messagesPublished: 0,
        messagesFailed: 0,
        validationErrors: 0,
        lastMessageAt: 0,
        lastHeartbeatAt: Date.now(),
        bytesReceived: 0,
      });
      this.metrics.activeGateways = this.gatewayStats.size;
    }

    const stats = this.gatewayStats.get(gatewayId)!;
    stats.lastMessageAt = Date.now();

    // 目标 Kafka topic（按网关分区）
    const topic = `${KAFKA_TOPICS.TELEMETRY_RAW}.${gatewayId}`;

    for (const msg of messages) {
      this.metrics.totalMessagesReceived++;
      stats.messagesReceived++;

      // 校验
      if (this.config.enableValidation) {
        const validation = this.validateMessage(msg);
        if (!validation.valid) {
          this.metrics.totalValidationErrors++;
          stats.validationErrors++;
          log.debug(`[GatewayBridge] 校验失败 [${gatewayId}]: ${validation.reason}`);
          continue;
        }
      }

      // 构造 Kafka 消息
      const rawMsg: RawTelemetryMessage = {
        device_code: msg.device_code,
        mp_code: msg.mp_code,
        gateway_id: gatewayId,
        timestamp: msg.timestamp || Date.now(),
        data_type: msg.data_type,
        sample_rate: msg.sample_rate,
        value: msg.value,
        waveform: msg.waveform,
        raw_value: msg.raw_value,
        unit: msg.unit,
        quality: msg.quality ?? 192,
        batch_id: msg.batch_id,
        metadata: msg.metadata,
      };

      const serialized = JSON.stringify(rawMsg);
      stats.bytesReceived += serialized.length;

      // 大小检查
      if (serialized.length > this.config.maxMessageSizeBytes) {
        this.metrics.totalValidationErrors++;
        stats.validationErrors++;
        log.warn(
          `[GatewayBridge] 消息过大 [${gatewayId}]: ${serialized.length} > ${this.config.maxMessageSizeBytes}`
        );
        continue;
      }

      // 写入统一的 telemetry.raw topic
      // 使用 message key 区分设备，网关信息已包含在消息体的 gateway_id 字段中
      // 不再双写 telemetry.raw.{gateway_id}，避免 Kafka 存储量翻倍
      this.buffer.push({
        topic: KAFKA_TOPICS.TELEMETRY_RAW,
        key: `${msg.device_code}:${msg.mp_code}`,
        value: serialized,
        timestamp: Date.now().toString(),
      });
    }

    this.metrics.bufferSize = this.buffer.length;

    // 缓冲区满时立即刷写
    if (this.buffer.length >= this.config.kafkaBatchSize) {
      await this.flushBuffer();
    }
  }

  /**
   * 消息校验
   */
  private validateMessage(msg: IncomingMessage): { valid: boolean; reason?: string } {
    if (!msg.device_code || typeof msg.device_code !== 'string') {
      return { valid: false, reason: '缺少 device_code' };
    }
    if (!msg.mp_code || typeof msg.mp_code !== 'string') {
      return { valid: false, reason: '缺少 mp_code' };
    }
    // 至少有 value 或 waveform
    if (msg.value === undefined && (!msg.waveform || !Array.isArray(msg.waveform))) {
      return { valid: false, reason: '缺少 value 或 waveform' };
    }
    // device_code 格式检查（防注入）
    if (!/^[a-zA-Z0-9_\-.:]+$/.test(msg.device_code)) {
      return { valid: false, reason: 'device_code 包含非法字符' };
    }
    if (!/^[a-zA-Z0-9_\-.:]+$/.test(msg.mp_code)) {
      return { valid: false, reason: 'mp_code 包含非法字符' };
    }
    return { valid: true };
  }

  // ----------------------------------------------------------
  // Kafka 批量写入
  // ----------------------------------------------------------

  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.config.kafkaBatchSize);
    this.metrics.bufferSize = this.buffer.length;

    // 按 topic 分组
    const topicBatches = new Map<string, Array<{ key: string; value: string; timestamp: string }>>();
    for (const msg of batch) {
      if (!topicBatches.has(msg.topic)) {
        topicBatches.set(msg.topic, []);
      }
      topicBatches.get(msg.topic)!.push({
        key: msg.key,
        value: msg.value,
        timestamp: msg.timestamp,
      });
    }

    // 逐 topic 写入
    for (const [topic, messages] of topicBatches) {
      try {
        await kafkaClient.produce(topic, messages);
        this.metrics.totalMessagesPublished += messages.length;
      } catch (error) {
        this.metrics.totalMessagesFailed += messages.length;
        log.error(`[GatewayBridge] Kafka 写入失败 [${topic}]:`, error);

        // 放回缓冲区
        if (this.buffer.length + messages.length <= this.config.maxBufferSize) {
          for (const msg of messages) {
            this.buffer.push({ topic, ...msg });
          }
        }
      }
    }
  }

  // ----------------------------------------------------------
  // 心跳管理
  // ----------------------------------------------------------

  /**
   * 更新活跃网关的心跳时间
   * 定期将心跳写入 edge_gateways 表
   */
  private async updateHeartbeats(): Promise<void> {
    const now = Date.now();
    const activeGatewayIds: string[] = [];

    for (const [gatewayId, stats] of this.gatewayStats) {
      // 最近 5 分钟有消息的网关视为活跃
      if (now - stats.lastMessageAt < 5 * 60 * 1000) {
        activeGatewayIds.push(gatewayId);
        stats.lastHeartbeatAt = now;
      }
    }

    if (activeGatewayIds.length === 0) return;

    try {
      // 批量更新心跳（通过 Kafka 事件通知，避免直接写 DB）
      await kafkaClient.produce(KAFKA_TOPICS.DEVICE_EVENTS, [{
        key: 'gateway-heartbeat',
        value: JSON.stringify({
          type: 'GATEWAY_HEARTBEAT_BATCH',
          gatewayIds: activeGatewayIds,
          timestamp: new Date().toISOString(),
        }),
        timestamp: now.toString(),
      }]);
    } catch (error) {
      log.error('[GatewayBridge] 心跳更新失败:', error);
    }
  }

  // ----------------------------------------------------------
  // 健康检查与指标
  // ----------------------------------------------------------

  getMetrics(): BridgeMetrics & {
    uptime: number;
    throughput: number;
    gatewayDetails: Record<string, GatewayStats>;
  } {
    const uptime = this.metrics.startedAt > 0
      ? Math.round((Date.now() - this.metrics.startedAt) / 1000)
      : 0;
    const throughput = uptime > 0
      ? Math.round(this.metrics.totalMessagesPublished / uptime)
      : 0;

    const gatewayDetails: Record<string, GatewayStats> = {};
    for (const [id, stats] of this.gatewayStats) {
      gatewayDetails[id] = { ...stats };
    }

    return {
      ...this.metrics,
      uptime,
      throughput,
      gatewayDetails,
    };
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    details: {
      running: boolean;
      protocols: Record<string, boolean>;
      activeGateways: number;
      bufferUtilization: number;
    };
  }> {
    const protocols: Record<string, boolean> = {};
    for (const [protocol, handler] of this.handlers) {
      const check = await handler.healthCheck();
      protocols[protocol] = check.healthy;
    }

    return {
      healthy: this.isRunning,
      details: {
        running: this.isRunning,
        protocols,
        activeGateways: this.gatewayStats.size,
        bufferUtilization: this.buffer.length / this.config.maxBufferSize,
      },
    };
  }

  /**
   * 获取 HTTP 协议处理器（供路由注册使用）
   */
  getHttpHandler(): HttpProtocolHandler | null {
    const handler = this.handlers.get('http');
    return handler instanceof HttpProtocolHandler ? handler : null;
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

// ============================================================
// 单例导出
// ============================================================

export const gatewayKafkaBridge = new GatewayKafkaBridge();

/**
 * 初始化并启动网关桥接服务
 * 在应用启动时调用
 */
export async function startGatewayBridge(): Promise<void> {
  // 注册协议处理器
  gatewayKafkaBridge.registerHandler(new MqttProtocolHandler());
  gatewayKafkaBridge.registerHandler(new HttpProtocolHandler());

  // 启动
  await gatewayKafkaBridge.start();
}

export async function stopGatewayBridge(): Promise<void> {
  await gatewayKafkaBridge.stop();
}

export default gatewayKafkaBridge;
