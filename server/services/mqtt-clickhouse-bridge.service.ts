/**
 * MQTT → ClickHouse 直写桥接服务
 * ============================================================
 *
 * 当 Kafka 降级时，提供 MQTT 数据到 ClickHouse 的直接写入路径。
 * 同时在 Kafka 正常时可作为并行写入通道，确保遥测数据不丢失。
 *
 * 架构位置：
 *   GatewayKafkaBridge
 *        ├── Kafka (主路径)
 *        └── [本服务] → ClickHouse realtime_telemetry (降级/并行路径)
 *
 * 写入目标表：portai_timeseries.realtime_telemetry
 *
 * 设计原则：
 *   1. 降级不崩溃 — ClickHouse 不可用时静默降级，不阻塞上游
 *   2. 批量写入 — 累积 batch 后一次性 INSERT，减少 I/O
 *   3. 去重 — 基于 (device_code, mp_code, timestamp) 的内存 LRU 去重
 *   4. 物理约束 — 传感器值经过基础合理性检查 (ADR-001)
 */

import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { config } from '../core/config';
import { createModuleLogger } from '../core/logger';

const log = createModuleLogger('mqtt-ch-bridge');

// ============================================================
// 配置
// ============================================================

interface MqttChBridgeConfig {
  /** 批量写入大小 */
  batchSize: number;
  /** 刷写间隔（毫秒） */
  flushIntervalMs: number;
  /** 最大缓冲区大小 */
  maxBufferSize: number;
  /** 去重窗口大小（LRU 条目数） */
  dedupWindowSize: number;
  /** 重试次数 */
  maxRetries: number;
  /** ClickHouse 数据库名 */
  database: string;
  /** 目标表名 */
  targetTable: string;
  /** 是否启用 */
  enabled: boolean;
}

const DEFAULT_CONFIG: MqttChBridgeConfig = {
  batchSize: 2000,
  flushIntervalMs: 1000,
  maxBufferSize: 50000,
  dedupWindowSize: 100000,
  maxRetries: 3,
  database: config.clickhouse.database || 'portai_timeseries',
  targetTable: 'realtime_telemetry',
  enabled: true,
};

// ============================================================
// 遥测行类型（对齐 realtime_telemetry DDL）
// ============================================================

interface RealtimeTelemetryRow {
  timestamp: string;          // DateTime64(3) format: 'YYYY-MM-DD HH:MM:SS.sss'
  device_code: string;
  mp_code: string;
  metric_name: string;
  value: number;
  quality_score: number;      // 0-1
  sampling_rate_hz: number;
  condition_id: string;
  condition_phase: string;
  state_vector: string;       // JSON array
  fusion_confidence: number;
  source_protocol: string;
  gateway_id: string;
  batch_id: string;
}

// ============================================================
// 入站消息类型（来自 GatewayKafkaBridge）
// ============================================================

export interface TelemetryMessage {
  device_code: string;
  mp_code: string;
  gateway_id: string;
  timestamp: number | string;
  data_type?: string;
  sample_rate?: number;
  value?: number;
  waveform?: number[];
  raw_value?: number;
  unit?: string;
  quality?: number;           // 0-255
  batch_id?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================
// 桥接服务
// ============================================================

export class MqttClickHouseBridge {
  private config: MqttChBridgeConfig;
  private client: ClickHouseClient | null = null;
  private buffer: RealtimeTelemetryRow[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private isHealthy = false;

  // 去重 LRU（双桶轮转）
  private dedupCurrent = new Set<string>();
  private dedupPrevious = new Set<string>();

  // 统计
  private stats = {
    messagesReceived: 0,
    rowsWritten: 0,
    batchesWritten: 0,
    writeErrors: 0,
    dedupDropped: 0,
    physicsRejected: 0,
    bufferOverflows: 0,
    lastFlushAt: 0,
    lastErrorAt: 0,
    lastError: '',
  };

  constructor(overrides: Partial<MqttChBridgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...overrides };
  }

  // ----------------------------------------------------------
  // 生命周期
  // ----------------------------------------------------------

  async start(): Promise<void> {
    if (this.isRunning) return;
    if (!this.config.enabled) {
      log.info('MQTT→ClickHouse 直写桥接已禁用');
      return;
    }

    log.info('启动 MQTT→ClickHouse 直写桥接...', {
      batchSize: this.config.batchSize,
      flushIntervalMs: this.config.flushIntervalMs,
      targetTable: `${this.config.database}.${this.config.targetTable}`,
    });

    try {
      this.client = this.createClient();
      // 验证连接
      await this.client.ping();
      this.isHealthy = true;
      log.info('ClickHouse 连接正常');
    } catch (err) {
      this.isHealthy = false;
      log.warn('ClickHouse 连接失败，服务以降级模式启动', { err });
    }

    this.isRunning = true;

    // 启动定时刷写
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => {
        log.warn('定时刷写失败', { err });
      });
    }, this.config.flushIntervalMs);

    // 定期轮转去重桶（每 60s）
    setInterval(() => this.rotateDedupBuckets(), 60_000);

    log.info('MQTT→ClickHouse 直写桥接已启动');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // 刷写剩余数据
    if (this.buffer.length > 0) {
      await this.flush();
    }

    if (this.client) {
      await this.client.close();
      this.client = null;
    }

    log.info('MQTT→ClickHouse 直写桥接已关闭', {
      totalReceived: this.stats.messagesReceived,
      totalWritten: this.stats.rowsWritten,
      totalErrors: this.stats.writeErrors,
    });
  }

  // ----------------------------------------------------------
  // 消息接收（由 GatewayKafkaBridge 调用）
  // ----------------------------------------------------------

  /**
   * 接收遥测消息并缓冲
   * @returns true = 已接受, false = 已拒绝（去重/物理校验/缓冲区满）
   */
  ingest(messages: TelemetryMessage[]): { accepted: number; rejected: number } {
    if (!this.isRunning || !this.config.enabled) {
      return { accepted: 0, rejected: messages.length };
    }

    let accepted = 0;
    let rejected = 0;

    for (const msg of messages) {
      this.stats.messagesReceived++;

      // 1. 去重检查
      const dedupKey = `${msg.device_code}:${msg.mp_code}:${msg.timestamp}`;
      if (this.dedupCurrent.has(dedupKey) || this.dedupPrevious.has(dedupKey)) {
        this.stats.dedupDropped++;
        rejected++;
        continue;
      }
      this.dedupCurrent.add(dedupKey);

      // 2. 物理合理性基础检查 (ADR-001)
      if (msg.value !== undefined && !this.physicsCheck(msg)) {
        this.stats.physicsRejected++;
        rejected++;
        continue;
      }

      // 3. 转换为 ClickHouse 行
      const row = this.toRow(msg);
      this.buffer.push(row);
      accepted++;

      // 如果有波形数据，展开为多行（每个采样点一行）
      if (msg.waveform && msg.waveform.length > 0 && msg.sample_rate) {
        const waveRows = this.expandWaveform(msg);
        this.buffer.push(...waveRows);
      }
    }

    // 缓冲区溢出保护
    if (this.buffer.length > this.config.maxBufferSize) {
      const overflow = this.buffer.length - this.config.maxBufferSize;
      this.buffer.splice(0, overflow); // 丢弃最旧数据
      this.stats.bufferOverflows++;
      log.warn('缓冲区溢出，丢弃最旧数据', { overflow });
    }

    // 缓冲区满时触发异步刷写
    if (this.buffer.length >= this.config.batchSize) {
      this.flush().catch(err => log.warn('刷写失败', { err }));
    }

    return { accepted, rejected };
  }

  // ----------------------------------------------------------
  // 刷写到 ClickHouse
  // ----------------------------------------------------------

  async flush(): Promise<void> {
    if (this.buffer.length === 0 || !this.client) return;

    const batch = this.buffer.splice(0, this.config.batchSize);
    const table = `${this.config.database}.${this.config.targetTable}`;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.client.insert({
          table,
          values: batch,
          format: 'JSONEachRow',
        });

        this.stats.rowsWritten += batch.length;
        this.stats.batchesWritten++;
        this.stats.lastFlushAt = Date.now();
        this.isHealthy = true;

        if (batch.length > 100) {
          log.debug('批量写入完成', { rows: batch.length, table });
        }
        return;
      } catch (err) {
        if (attempt === this.config.maxRetries) {
          this.stats.writeErrors++;
          this.stats.lastErrorAt = Date.now();
          this.stats.lastError = err instanceof Error ? err.message : String(err);
          this.isHealthy = false;
          log.warn('写入失败（已达最大重试）', {
            attempt,
            rows: batch.length,
            err,
          });
          // 放回缓冲区头部（下次重试）
          this.buffer.unshift(...batch);
        } else {
          // 指数退避
          await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt - 1)));
        }
      }
    }
  }

  // ----------------------------------------------------------
  // 数据转换
  // ----------------------------------------------------------

  private toRow(msg: TelemetryMessage): RealtimeTelemetryRow {
    return {
      timestamp: this.formatTimestamp(msg.timestamp),
      device_code: msg.device_code,
      mp_code: msg.mp_code,
      metric_name: msg.data_type || 'unknown',
      value: msg.value ?? 0,
      quality_score: this.normalizeQuality(msg.quality),
      sampling_rate_hz: msg.sample_rate ?? 0,
      condition_id: '',
      condition_phase: '',
      state_vector: '[]',
      fusion_confidence: 0,
      source_protocol: 'mqtt',
      gateway_id: msg.gateway_id || '',
      batch_id: msg.batch_id || '',
    };
  }

  /**
   * 展开波形数据为多行
   * 每个采样点写入一行，时间戳按采样率递增
   */
  private expandWaveform(msg: TelemetryMessage): RealtimeTelemetryRow[] {
    if (!msg.waveform || !msg.sample_rate || msg.sample_rate <= 0) return [];

    const baseTs = typeof msg.timestamp === 'number' ? msg.timestamp : Date.parse(String(msg.timestamp));
    if (isNaN(baseTs)) return [];

    const intervalMs = 1000 / msg.sample_rate;
    const rows: RealtimeTelemetryRow[] = [];

    // 限制展开：最多 8192 个采样点，避免内存爆炸
    const maxSamples = Math.min(msg.waveform.length, 8192);

    for (let i = 0; i < maxSamples; i++) {
      rows.push({
        timestamp: this.formatTimestamp(baseTs + i * intervalMs),
        device_code: msg.device_code,
        mp_code: msg.mp_code,
        metric_name: msg.data_type || 'vibration',
        value: msg.waveform[i],
        quality_score: this.normalizeQuality(msg.quality),
        sampling_rate_hz: msg.sample_rate,
        condition_id: '',
        condition_phase: '',
        state_vector: '[]',
        fusion_confidence: 0,
        source_protocol: 'mqtt',
        gateway_id: msg.gateway_id || '',
        batch_id: msg.batch_id || '',
      });
    }

    return rows;
  }

  // ----------------------------------------------------------
  // 工具函数
  // ----------------------------------------------------------

  private formatTimestamp(ts: number | string): string {
    const date = typeof ts === 'number'
      ? new Date(ts)
      : new Date(ts);

    if (isNaN(date.getTime())) {
      return new Date().toISOString().replace('T', ' ').replace('Z', '');
    }

    return date.toISOString().replace('T', ' ').replace('Z', '');
  }

  /**
   * 将 MQTT quality (0-255, OPC UA 风格) 归一化为 0-1 的评分
   */
  private normalizeQuality(quality?: number): number {
    if (quality === undefined || quality === null) return 1.0;
    if (quality >= 192) return 1.0;  // Good
    if (quality >= 64) return 0.5;   // Uncertain
    return 0.1;                       // Bad
  }

  /**
   * ADR-001 物理合理性基础检查
   * 传感器值的基本范围检查，防止明显错误数据写入
   */
  private physicsCheck(msg: TelemetryMessage): boolean {
    if (msg.value === undefined) return true;

    // NaN/Infinity 检查
    if (!Number.isFinite(msg.value)) return false;

    // 极端值检查（通用范围，具体范围由下游评分器判断）
    const absVal = Math.abs(msg.value);
    if (absVal > 1e12) return false; // 超过万亿级不合理

    return true;
  }

  private rotateDedupBuckets(): void {
    this.dedupPrevious = this.dedupCurrent;
    this.dedupCurrent = new Set();
  }

  private createClient(): ClickHouseClient {
    const host = config.clickhouse.host.startsWith('http')
      ? config.clickhouse.host
      : `http://${config.clickhouse.host}`;

    return createClient({
      url: `${host}:${config.clickhouse.port}`,
      username: config.clickhouse.user,
      password: config.clickhouse.password,
      database: this.config.database,
      clickhouse_settings: {
        async_insert: 1,
        wait_for_async_insert: 0,
      },
    });
  }

  // ----------------------------------------------------------
  // 健康检查与指标
  // ----------------------------------------------------------

  getStats() {
    return {
      ...this.stats,
      bufferSize: this.buffer.length,
      isRunning: this.isRunning,
      isHealthy: this.isHealthy,
      dedupCurrentSize: this.dedupCurrent.size,
      dedupPreviousSize: this.dedupPrevious.size,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; details: Record<string, unknown> }> {
    if (!this.client || !this.isRunning) {
      return { healthy: false, details: { reason: 'not running' } };
    }

    try {
      await this.client.ping();
      this.isHealthy = true;
      return {
        healthy: true,
        details: {
          bufferSize: this.buffer.length,
          rowsWritten: this.stats.rowsWritten,
          writeErrors: this.stats.writeErrors,
        },
      };
    } catch {
      this.isHealthy = false;
      return { healthy: false, details: { reason: 'ping failed' } };
    }
  }
}

// ============================================================
// 单例 + 工厂
// ============================================================

let instance: MqttClickHouseBridge | null = null;

export function getMqttClickHouseBridge(overrides?: Partial<MqttChBridgeConfig>): MqttClickHouseBridge {
  if (!instance) {
    instance = new MqttClickHouseBridge(overrides);
  }
  return instance;
}

export function resetMqttClickHouseBridge(): void {
  if (instance) {
    instance.stop().catch(() => {});
    instance = null;
  }
}
