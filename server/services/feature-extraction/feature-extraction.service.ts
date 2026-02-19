/**
 * 特征提取服务
 * ============================================================
 * 
 * 数据动脉中间层：
 *   Kafka(telemetry.raw.*) → [本服务] → Kafka(telemetry.feature.*)
 * 
 * 职责：
 *   1. 订阅 telemetry.raw.* 主题
 *   2. 解析原始遥测数据，路由到对应的特征提取器
 *   3. 将提取结果发布到 telemetry.feature.* 主题
 *   4. 提供健康检查和指标接口
 * 
 * 架构位置：
 *   边缘网关 → MQTT → Kafka(telemetry.raw.*)
 *                          ↓
 *                    [特征提取服务]  ← 本文件
 *                          ↓
 *                    Kafka(telemetry.feature.*)
 *                          ↓
 *                    ClickHouse Kafka Engine → vibration_features 表
 *                          ↓
 *                    物化视图聚合 → 算法层读取
 */

import { kafkaClient, KAFKA_TOPICS } from '../../lib/clients/kafka.client';
import { createModuleLogger } from '../../core/logger';
import { extractorRegistry, ExtractorRegistry } from './extractor-registry';
import {
  DataType,
  FeatureMessage,
  RawTelemetryMessage,
  MEASUREMENT_TYPE_MAP,
} from './types';

const log = createModuleLogger('feature-extraction');

// ============================================================
// 配置
// ============================================================

interface FeatureExtractionConfig {
  /** Kafka 消费者组 */
  consumerGroup: string;
  /** 订阅的主题 */
  inputTopics: string[];
  /** 输出主题前缀（实际主题 = 前缀 + gateway_id） */
  outputTopicPrefix: string;
  /** 输出主题（不带网关后缀时使用） */
  outputTopic: string;
  /** 批量发布大小 */
  publishBatchSize: number;
  /** 批量发布间隔（毫秒） */
  publishFlushIntervalMs: number;
  /** 是否启用测点配置缓存 */
  enableMpConfigCache: boolean;
  /** 测点配置缓存 TTL（秒） */
  mpConfigCacheTtlSec: number;
}

const DEFAULT_CONFIG: FeatureExtractionConfig = {
  consumerGroup: 'feature-extraction-service',
  inputTopics: [KAFKA_TOPICS.TELEMETRY_RAW],
  outputTopicPrefix: 'telemetry.feature.',
  outputTopic: KAFKA_TOPICS.TELEMETRY_FEATURE,
  publishBatchSize: 100,
  publishFlushIntervalMs: 500,
  enableMpConfigCache: true,
  mpConfigCacheTtlSec: 300,
};

// ============================================================
// 服务指标
// ============================================================

interface ServiceMetrics {
  /** 已消费消息数 */
  messagesConsumed: number;
  /** 成功提取数 */
  extractionSucceeded: number;
  /** 提取失败数 */
  extractionFailed: number;
  /** 路由失败数（无法确定数据类型） */
  routingFailed: number;
  /** 已发布特征消息数 */
  featuresPublished: number;
  /** 发布失败数 */
  publishFailed: number;
  /** 启动时间 */
  startedAt: number;
  /** 各数据类型处理计数 */
  typeCounters: Record<string, number>;
}

// ============================================================
// 测点配置缓存
// ============================================================

interface MpConfig {
  measurementType: string;
  dataType: DataType;
  cachedAt: number;
}

// ============================================================
// 特征提取服务
// ============================================================

export class FeatureExtractionService {
  private config: FeatureExtractionConfig;
  private registry: ExtractorRegistry;
  private isRunning: boolean = false;
  private metrics: ServiceMetrics;
  private publishBuffer: Array<{ key: string; value: string }> = [];
  private publishTimer: NodeJS.Timeout | null = null;

  /** 测点配置缓存：key = device_code:mp_code */
  private mpConfigCache: Map<string, MpConfig> = new Map();

  constructor(
    config: Partial<FeatureExtractionConfig> = {},
    registry?: ExtractorRegistry
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registry = registry || extractorRegistry;
    this.metrics = {
      messagesConsumed: 0,
      extractionSucceeded: 0,
      extractionFailed: 0,
      routingFailed: 0,
      featuresPublished: 0,
      publishFailed: 0,
      startedAt: 0,
      typeCounters: {},
    };
  }

  // ----------------------------------------------------------
  // 生命周期
  // ----------------------------------------------------------

  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn('[FeatureExtraction] 已在运行中');
      return;
    }

    log.info('[FeatureExtraction] 启动特征提取服务...');
    log.info(`[FeatureExtraction] 已注册提取器: ${this.registry.getRegisteredTypes().join(', ')}`);

    this.isRunning = true;
    this.metrics.startedAt = Date.now();

    // 订阅 Kafka 主题
    await kafkaClient.subscribe(
      this.config.consumerGroup,
      this.config.inputTopics,
      this.handleMessage.bind(this)
    );

    // 启动批量发布定时器
    this.publishTimer = setInterval(
      () => this.flushPublishBuffer(),
      this.config.publishFlushIntervalMs
    );

    log.info(`[FeatureExtraction] 已启动，订阅: ${this.config.inputTopics.join(', ')}`);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    log.info('[FeatureExtraction] 正在关闭...');
    this.isRunning = false;

    if (this.publishTimer) {
      clearInterval(this.publishTimer);
      this.publishTimer = null;
    }

    // 刷写剩余缓冲
    await this.flushPublishBuffer();

    this.mpConfigCache.clear();

    const uptime = Math.round((Date.now() - this.metrics.startedAt) / 1000);
    log.info(
      `[FeatureExtraction] 已关闭。运行 ${uptime}s，处理 ${this.metrics.messagesConsumed} 条，` +
      `成功 ${this.metrics.extractionSucceeded}，失败 ${this.metrics.extractionFailed}，` +
      `发布 ${this.metrics.featuresPublished}`
    );
  }

  // ----------------------------------------------------------
  // 消息处理
  // ----------------------------------------------------------

  private async handleMessage(message: {
    topic: string;
    partition: number;
    offset: string;
    key: string | null;
    value: string | null;
    headers: Record<string, string>;
    timestamp: string;
  }): Promise<void> {
    if (!this.isRunning || !message.value) return;

    this.metrics.messagesConsumed++;

    try {
      const raw: RawTelemetryMessage = JSON.parse(message.value);

      // 补充网关ID（从 topic 后缀提取）
      if (!raw.gateway_id && message.topic.startsWith('telemetry.raw.')) {
        raw.gateway_id = message.topic.replace('telemetry.raw.', '');
      }

      // 尝试从缓存获取数据类型
      if (!raw.data_type && this.config.enableMpConfigCache) {
        const cached = this.getMpConfigFromCache(raw.device_code, raw.mp_code);
        if (cached) {
          raw.data_type = cached.measurementType;
        }
      }

      // 调用注册表处理
      const result = await this.registry.process(raw);

      if (!result) {
        this.metrics.routingFailed++;
        return;
      }

      this.metrics.extractionSucceeded++;

      // 更新类型计数
      this.metrics.typeCounters[result.dataType] =
        (this.metrics.typeCounters[result.dataType] || 0) + 1;

      // 构造输出消息
      const featureMsg: FeatureMessage = {
        device_code: raw.device_code,
        mp_code: raw.mp_code,
        gateway_id: raw.gateway_id || '',
        timestamp: typeof raw.timestamp === 'number'
          ? new Date(raw.timestamp).toISOString()
          : (raw.timestamp || new Date().toISOString()),
        data_type: result.dataType,
        extractor: result.extractor,
        extractor_version: result.extractorVersion,
        extraction_latency_ms: result.latencyMs,
        value: raw.value,
        unit: raw.unit || '',
        quality: raw.quality || 192,
        features: result.features,
        batch_id: raw.batch_id || '',
        source: 'feature-extraction-service',
      };

      // 添加到发布缓冲
      const outputKey = `${raw.device_code}:${raw.mp_code}`;
      this.publishBuffer.push({
        key: outputKey,
        value: JSON.stringify(featureMsg),
      });

      // 缓冲区满时立即刷写
      if (this.publishBuffer.length >= this.config.publishBatchSize) {
        await this.flushPublishBuffer();
      }

    } catch (error) {
      this.metrics.extractionFailed++;
      log.error('[FeatureExtraction] 处理消息失败:', error);
    }
  }

  // ----------------------------------------------------------
  // 批量发布
  // ----------------------------------------------------------

  private async flushPublishBuffer(): Promise<void> {
    if (this.publishBuffer.length === 0) return;

    const batch = this.publishBuffer.splice(0);

    try {
      await kafkaClient.produce(
        this.config.outputTopic,
        batch.map(msg => ({
          key: msg.key,
          value: msg.value,
          timestamp: Date.now().toString(),
        }))
      );

      this.metrics.featuresPublished += batch.length;

    } catch (error) {
      this.metrics.publishFailed += batch.length;
      log.error(`[FeatureExtraction] 发布 ${batch.length} 条特征消息失败:`, error);

      // 放回缓冲区（最多保留 10000 条）
      if (this.publishBuffer.length + batch.length <= 10000) {
        this.publishBuffer.unshift(...batch);
      }
    }
  }

  // ----------------------------------------------------------
  // 测点配置缓存
  // ----------------------------------------------------------

  /**
   * 从缓存获取测点配置
   */
  private getMpConfigFromCache(deviceCode: string, mpCode: string): MpConfig | null {
    const key = `${deviceCode}:${mpCode}`;
    const cached = this.mpConfigCache.get(key);
    if (!cached) return null;

    // 检查 TTL
    if (Date.now() - cached.cachedAt > this.config.mpConfigCacheTtlSec * 1000) {
      this.mpConfigCache.delete(key);
      return null;
    }

    return cached;
  }

  /**
   * 预加载测点配置到缓存
   * 在启动时调用，从数据库批量加载
   */
  async preloadMpConfigs(configs: Array<{
    deviceCode: string;
    mpCode: string;
    measurementType: string;
  }>): Promise<void> {
    const now = Date.now();
    for (const config of configs) {
      const dataType = MEASUREMENT_TYPE_MAP[config.measurementType.toLowerCase()];
      if (dataType) {
        this.mpConfigCache.set(`${config.deviceCode}:${config.mpCode}`, {
          measurementType: config.measurementType,
          dataType,
          cachedAt: now,
        });
      }
    }
    log.info(`[FeatureExtraction] 预加载 ${configs.length} 个测点配置`);
  }

  // ----------------------------------------------------------
  // 健康检查与指标
  // ----------------------------------------------------------

  getMetrics(): ServiceMetrics & {
    uptime: number;
    throughput: number;
    extractorStats: ReturnType<ExtractorRegistry['getStats']>;
  } {
    const uptime = this.metrics.startedAt > 0
      ? Math.round((Date.now() - this.metrics.startedAt) / 1000)
      : 0;
    const throughput = uptime > 0
      ? Math.round(this.metrics.extractionSucceeded / uptime)
      : 0;

    return {
      ...this.metrics,
      uptime,
      throughput,
      extractorStats: this.registry.getStats(),
    };
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    details: {
      running: boolean;
      registeredExtractors: number;
      bufferSize: number;
      errorRate: number;
    };
  }> {
    const total = this.metrics.extractionSucceeded + this.metrics.extractionFailed;
    const errorRate = total > 0 ? this.metrics.extractionFailed / total : 0;

    return {
      healthy: this.isRunning && errorRate < 0.3,
      details: {
        running: this.isRunning,
        registeredExtractors: this.registry.size,
        bufferSize: this.publishBuffer.length,
        errorRate: Math.round(errorRate * 1000) / 1000,
      },
    };
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

// ============================================================
// 单例导出
// ============================================================

export const featureExtractionService = new FeatureExtractionService();

export async function startFeatureExtraction(): Promise<void> {
  await featureExtractionService.start();
}

export async function stopFeatureExtraction(): Promise<void> {
  await featureExtractionService.stop();
}

export default featureExtractionService;
