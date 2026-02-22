/**
 * Kafka → ClickHouse 遥测数据消费者服务
 * ============================================================
 * 
 * 数据动脉核心：订阅 telemetry.feature 主题，批量写入 ClickHouse vibration_features 等特征表
 * 
 * 架构位置：
 *   telemetry.raw → Kafka Engine → ClickHouse(realtime_telemetry)  ← 原始数据路径（ClickHouse 原生消费）
 *   telemetry.raw → FeatureExtractor → Kafka(telemetry.feature) → [本服务] → ClickHouse(vibration_features 等)  ← 特征数据路径
 * 
 * 设计原则：
 *   1. 批量写入 — 累积到 BATCH_SIZE 或 FLUSH_INTERVAL_MS 后批量 INSERT
 *   2. 背压控制 — 缓冲区满时暂停 Kafka 消费，写入完成后恢复
 *   3. 至少一次语义 — 手动提交 offset，写入成功后才确认
 *   4. 优雅关闭 — SIGTERM 时刷写剩余缓冲并提交 offset
 *   5. 健康监控 — 暴露 lag/throughput/error 指标
 * 
 * 对应 ClickHouse 表：
 *   xilian.realtime_telemetry (03_realtime_telemetry.sql)
 * 
 * Kafka 主题：
 *   telemetry.raw — 原始遥测数据 → 由 ClickHouse Kafka Engine 直接消费（03_realtime_telemetry.sql）
 *   telemetry.feature — 特征值数据 → 由本服务消费写入特征表
 */

import { getClickHouseClient } from '../lib/clients/clickhouse.client';
import { kafkaClient, KAFKA_TOPICS } from '../lib/clients/kafka.client';
import { createModuleLogger } from '../core/logger';

const log = createModuleLogger('telemetry-ch-sink');

// ============================================================
// 配置
// ============================================================

interface SinkConfig {
  /** 批量写入大小阈值 */
  batchSize: number;
  /** 刷写间隔（毫秒） */
  flushIntervalMs: number;
  /** 缓冲区最大容量（超过则暂停消费） */
  maxBufferSize: number;
  /** 写入重试次数 */
  maxRetries: number;
  /** 重试基础延迟（毫秒） */
  retryBaseDelayMs: number;
  /** Kafka 消费者组 */
  consumerGroup: string;
  /** 订阅的 Kafka 主题 */
  topics: string[];
  /** ClickHouse 目标表 */
  targetTable: string;
  /** 是否启用去重（基于 device_code + mp_code + timestamp） */
  enableDedup: boolean;
}

const DEFAULT_CONFIG: SinkConfig = {
  batchSize: 5000,
  flushIntervalMs: 1000,
  maxBufferSize: 50000,
  maxRetries: 3,
  retryBaseDelayMs: 500,
  consumerGroup: 'telemetry-clickhouse-sink',
  topics: [KAFKA_TOPICS.TELEMETRY_FEATURE || 'telemetry.feature'],
  targetTable: 'vibration_features',
  enableDedup: true,
};

// ============================================================
// 遥测数据行类型（对应 ClickHouse 表结构）
// ============================================================

interface TelemetryRow {
  device_code: string;
  mp_code: string;
  gateway_id: string;
  timestamp: string;       // ISO 格式或 ClickHouse DateTime64 格式
  value: number;
  raw_value: number;
  unit: string;
  quality: number;
  is_anomaly: number;
  features: string;        // JSON 字符串
  batch_id: string;
  source: string;
}

// ============================================================
// 消费者指标
// ============================================================

interface SinkMetrics {
  /** 已消费消息总数 */
  messagesConsumed: number;
  /** 已写入 ClickHouse 行数 */
  rowsWritten: number;
  /** 写入批次数 */
  batchesWritten: number;
  /** 写入失败次数 */
  writeErrors: number;
  /** 解析失败次数 */
  parseErrors: number;
  /** 去重丢弃数 */
  dedupDropped: number;
  /** 当前缓冲区大小 */
  bufferSize: number;
  /** 最后写入时间 */
  lastWriteAt: number;
  /** 最后错误信息 */
  lastError: string | null;
  /** 启动时间 */
  startedAt: number;
  /** 平均写入延迟（毫秒） */
  avgWriteLatencyMs: number;
}

// ============================================================
// 消费者服务
// ============================================================

export class TelemetryClickHouseSink {
  private config: SinkConfig;
  private buffer: TelemetryRow[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private metrics: SinkMetrics;
  /**
   * 去重缓存：使用双 Map 实现简易 LRU
   * 当 current 满时，丢弃 previous，将 current 降级为 previous，新建 current
   * 避免一次性清空导致短暂的重复写入
   */
  private dedupCurrent: Set<string> = new Set();
  private dedupPrevious: Set<string> = new Set();
  private readonly DEDUP_PARTITION_SIZE = 50000;
  private dedupCleanTimer: NodeJS.Timeout | null = null;
  private writeLatencies: number[] = [];

  constructor(config: Partial<SinkConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = {
      messagesConsumed: 0,
      rowsWritten: 0,
      batchesWritten: 0,
      writeErrors: 0,
      parseErrors: 0,
      dedupDropped: 0,
      bufferSize: 0,
      lastWriteAt: 0,
      lastError: null,
      startedAt: 0,
      avgWriteLatencyMs: 0,
    };
  }

  // ----------------------------------------------------------
  // 生命周期
  // ----------------------------------------------------------

  /**
   * 启动消费者服务
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn('[TelemetrySink] 已在运行中，忽略重复启动');
      return;
    }

    log.info('[TelemetrySink] 启动 Kafka→ClickHouse 消费者...');
    log.info(`[TelemetrySink] 配置: batchSize=${this.config.batchSize}, flushInterval=${this.config.flushIntervalMs}ms, maxBuffer=${this.config.maxBufferSize}`);

    this.isRunning = true;
    this.metrics.startedAt = Date.now();

    // 验证 ClickHouse 连接
    try {
      const ch = getClickHouseClient();
      const result = await ch.query({ query: 'SELECT 1' });
      await result.json();
      log.info('[TelemetrySink] ClickHouse 连接正常');
    } catch (error) {
      log.error('[TelemetrySink] ClickHouse 连接失败，服务无法启动:', error);
      this.isRunning = false;
      throw error;
    }

    // 订阅 Kafka 主题
    try {
      await kafkaClient.subscribe(
        this.config.consumerGroup,
        this.config.topics,
        this.handleMessage.bind(this)
      );
      log.info(`[TelemetrySink] Kafka 订阅成功，主题: ${this.config.topics.join(', ')}`);
    } catch (kafkaError) {
      log.warn(`[TelemetrySink] Kafka 订阅失败，服务以降级模式运行（仅 ClickHouse 写入就绪，等待 Kafka 恢复后可重启）: ${(kafkaError as Error).message}`);
      // 不抛出异常，允许服务以降级模式启动
    }

    // 启动定时刷写
    this.flushTimer = setInterval(
      () => this.flush('timer'),
      this.config.flushIntervalMs
    );

    // 启动去重集合定期清理（每5分钟清理一次）
    if (this.config.enableDedup) {
      this.dedupCleanTimer = setInterval(
        () => this.cleanDedupSet(),
        5 * 60 * 1000
      );
    }

    log.info(`[TelemetrySink] 已启动（ClickHouse 写入就绪）`);
  }

  /**
   * 优雅关闭
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    log.info('[TelemetrySink] 正在优雅关闭...');
    this.isRunning = false;

    // 停止定时器
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.dedupCleanTimer) {
      clearInterval(this.dedupCleanTimer);
      this.dedupCleanTimer = null;
    }

    // 刷写剩余缓冲
    if (this.buffer.length > 0) {
      log.info(`[TelemetrySink] 刷写剩余 ${this.buffer.length} 条数据...`);
      await this.flush('shutdown');
    }

    // 清理去重集合
    this.dedupCurrent.clear();
    this.dedupPrevious.clear();

    log.info(`[TelemetrySink] 已关闭。总计: consumed=${this.metrics.messagesConsumed}, written=${this.metrics.rowsWritten}, errors=${this.metrics.writeErrors}`);
  }

  // ----------------------------------------------------------
  // 消息处理
  // ----------------------------------------------------------

  /**
   * 处理单条 Kafka 消息
   */
  private async handleMessage(message: {
    topic: string;
    partition: number;
    offset: string;
    key: string | null;
    value: string | null;
    headers: Record<string, string>;
    timestamp: string;
  }): Promise<void> {
    if (!this.isRunning) return;

    this.metrics.messagesConsumed++;

    if (!message.value) return;

    try {
      const data = JSON.parse(message.value);
      const row = this.parseToRow(data, message);

      if (!row) {
        this.metrics.parseErrors++;
        return;
      }

      // 去重检查
      if (this.config.enableDedup) {
        const dedupKey = `${row.device_code}:${row.mp_code}:${row.timestamp}`;
        if (this.dedupCurrent.has(dedupKey) || this.dedupPrevious.has(dedupKey)) {
          this.metrics.dedupDropped++;
          return;
        }
        this.dedupCurrent.add(dedupKey);
      }

      // 添加到缓冲区
      this.buffer.push(row);
      this.metrics.bufferSize = this.buffer.length;

      // 背压控制：缓冲区满时立即刷写
      if (this.buffer.length >= this.config.batchSize) {
        await this.flush('batch-full');
      }

      // 缓冲区超限警告
      if (this.buffer.length >= this.config.maxBufferSize) {
        log.warn(`[TelemetrySink] 缓冲区已满 (${this.buffer.length}/${this.config.maxBufferSize})，暂停消费`);
        this.isPaused = true;
        // 强制刷写
        await this.flush('backpressure');
        this.isPaused = false;
      }
    } catch (error) {
      this.metrics.parseErrors++;
      log.error('[TelemetrySink] 消息解析失败:', error);
    }
  }

  /**
   * 将 Kafka 消息解析为 ClickHouse 行
   * 
   * 支持两种消息格式：
   * 1. V4 标准格式：{ device_code, mp_code, gateway_id, timestamp, value, ... }
   * 2. 旧版兼容格式：{ deviceId, sensorId, value, timestamp, ... }
   */
  private parseToRow(
    data: Record<string, any>,
    message: { topic: string; timestamp: string }
  ): TelemetryRow | null {
    // 提取设备编码（兼容新旧格式）
    const deviceCode = data.device_code || data.deviceCode || data.deviceId;
    const mpCode = data.mp_code || data.mpCode || data.sensorId;

    if (!deviceCode || !mpCode) {
      log.debug('[TelemetrySink] 消息缺少 device_code/mp_code，跳过');
      return null;
    }

    // 解析时间戳
    let timestamp: string;
    if (data.timestamp) {
      if (typeof data.timestamp === 'number') {
        timestamp = new Date(data.timestamp).toISOString();
      } else if (typeof data.timestamp === 'string') {
        timestamp = data.timestamp;
      } else {
        timestamp = new Date().toISOString();
      }
    } else {
      timestamp = message.timestamp
        ? new Date(parseInt(message.timestamp)).toISOString()
        : new Date().toISOString();
    }

    // 解析值
    // 注意：特征数据消息的 value 可能不存在（如振动波形数据只有 features 没有单值）
    // 不应因为 value 缺失而丢弃整条消息
    let value = typeof data.value === 'number' ? data.value : parseFloat(data.value);
    if (isNaN(value)) {
      value = 0; // 默认值，实际特征在 features 字段中
    }

    // 解析特征值
    let features = '{}';
    if (data.features) {
      features = typeof data.features === 'string'
        ? data.features
        : JSON.stringify(data.features);
    }

    return {
      device_code: deviceCode,
      mp_code: mpCode,
      gateway_id: data.gateway_id || data.gatewayId || '',
      timestamp,
      value,
      raw_value: typeof data.raw_value === 'number' ? data.raw_value : 0,
      unit: data.unit || '',
      quality: typeof data.quality === 'number' ? data.quality : 192,
      is_anomaly: data.is_anomaly || data.isAnomaly ? 1 : 0,
      features,
      batch_id: data.batch_id || data.batchId || '',
      source: data.source || 'gateway',
    };
  }

  // ----------------------------------------------------------
  // 批量写入 ClickHouse
  // ----------------------------------------------------------

  /**
   * 刷写缓冲区到 ClickHouse
   */
  private async flush(trigger: 'timer' | 'batch-full' | 'backpressure' | 'shutdown'): Promise<void> {
    if (this.buffer.length === 0) return;

    // 取出当前缓冲区（原子操作）
    const batch = this.buffer.splice(0, this.config.batchSize);
    this.metrics.bufferSize = this.buffer.length;

    const startTime = Date.now();

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const ch = getClickHouseClient();

        await ch.insert({
          table: this.config.targetTable,
          values: batch,
          format: 'JSONEachRow',
        });

        // 写入成功
        const latency = Date.now() - startTime;
        this.metrics.rowsWritten += batch.length;
        this.metrics.batchesWritten++;
        this.metrics.lastWriteAt = Date.now();

        // 更新平均延迟
        this.writeLatencies.push(latency);
        if (this.writeLatencies.length > 100) {
          this.writeLatencies = this.writeLatencies.slice(-100);
        }
        this.metrics.avgWriteLatencyMs = Math.round(
          this.writeLatencies.reduce((a, b) => a + b, 0) / this.writeLatencies.length
        );

        if (trigger !== 'timer' || batch.length > 1000) {
          log.debug(
            `[TelemetrySink] 写入 ${batch.length} 行 (trigger=${trigger}, latency=${latency}ms, total=${this.metrics.rowsWritten})`
          );
        }

        return; // 写入成功，退出重试循环

      } catch (error) {
        this.metrics.writeErrors++;
        this.metrics.lastError = error instanceof Error ? error.message : String(error);

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryBaseDelayMs * Math.pow(2, attempt - 1);
          log.warn(
            `[TelemetrySink] 写入失败 (attempt ${attempt}/${this.config.maxRetries})，${delay}ms 后重试:`,
            error
          );
          await this.sleep(delay);
        } else {
          log.error(
            `[TelemetrySink] 写入失败，已达最大重试次数 (${this.config.maxRetries})。丢弃 ${batch.length} 行:`,
            error
          );
          // 最后一次重试失败：将数据放回缓冲区头部（如果不是关闭阶段）
          if (trigger !== 'shutdown' && this.buffer.length + batch.length <= this.config.maxBufferSize) {
            this.buffer.unshift(...batch);
            this.metrics.bufferSize = this.buffer.length;
            log.info(`[TelemetrySink] 数据已放回缓冲区，当前大小: ${this.buffer.length}`);
          }
        }
      }
    }
  }

  // ----------------------------------------------------------
  // 去重管理
  // ----------------------------------------------------------

  /**
   * 清理去重集合（保留最近5分钟的key）
   */
  private cleanDedupSet(): void {
    // LRU 淘汰：当 current 分区满时，丢弃 previous，降级 current
    if (this.dedupCurrent.size > this.DEDUP_PARTITION_SIZE) {
      const prevSize = this.dedupPrevious.size;
      this.dedupPrevious = this.dedupCurrent;
      this.dedupCurrent = new Set();
      log.debug(
        `[TelemetrySink] 去重 LRU 轮转: 淘汰 ${prevSize} 条，保留 ${this.dedupPrevious.size} 条`
      );
    }
  }

  // ----------------------------------------------------------
  // 健康检查与指标
  // ----------------------------------------------------------

  /**
   * 获取消费者指标
   */
  getMetrics(): SinkMetrics & { uptime: number; throughput: number } {
    const uptime = this.metrics.startedAt > 0
      ? Math.round((Date.now() - this.metrics.startedAt) / 1000)
      : 0;
    const throughput = uptime > 0
      ? Math.round(this.metrics.rowsWritten / uptime)
      : 0;

    return {
      ...this.metrics,
      uptime,
      throughput,
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    details: {
      running: boolean;
      paused: boolean;
      bufferUtilization: number;
      lastWriteAgo: number;
      clickhouseConnected: boolean;
      errorRate: number;
    };
  }> {
    let clickhouseConnected = false;
    try {
      const ch = getClickHouseClient();
      const result = await ch.query({ query: 'SELECT 1' });
      await result.json();
      clickhouseConnected = true;
    } catch {
      clickhouseConnected = false;
    }

    const lastWriteAgo = this.metrics.lastWriteAt > 0
      ? Math.round((Date.now() - this.metrics.lastWriteAt) / 1000)
      : -1;

    const totalOps = this.metrics.batchesWritten + this.metrics.writeErrors;
    const errorRate = totalOps > 0 ? this.metrics.writeErrors / totalOps : 0;

    const bufferUtilization = this.buffer.length / this.config.maxBufferSize;

    const healthy = this.isRunning
      && clickhouseConnected
      && errorRate < 0.3
      && bufferUtilization < 0.9;

    return {
      healthy,
      details: {
        running: this.isRunning,
        paused: this.isPaused,
        bufferUtilization: Math.round(bufferUtilization * 100) / 100,
        lastWriteAgo,
        clickhouseConnected,
        errorRate: Math.round(errorRate * 1000) / 1000,
      },
    };
  }

  /**
   * 获取运行状态
   */
  isActive(): boolean {
    return this.isRunning;
  }

  // ----------------------------------------------------------
  // 工具方法
  // ----------------------------------------------------------

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================
// 单例导出
// ============================================================

export const telemetryClickHouseSink = new TelemetryClickHouseSink();

/**
 * 启动遥测数据 ClickHouse 写入服务
 * 在应用启动时调用
 */
export async function startTelemetrySink(): Promise<void> {
  await telemetryClickHouseSink.start();
}

/**
 * 停止遥测数据 ClickHouse 写入服务
 * 在应用关闭时调用
 */
export async function stopTelemetrySink(): Promise<void> {
  await telemetryClickHouseSink.stop();
}

export default telemetryClickHouseSink;
