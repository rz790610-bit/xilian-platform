/**
 * ============================================================================
 * 感知管线编排器 — 协议采集到状态向量的端到端数据通路
 * ============================================================================
 *
 * P0-2 核心模块。串联所有感知层组件，实现完整数据流：
 *
 *   协议消息(MQTT/Modbus/OPC UA)
 *     → 解析为 RawSensorMessage
 *       → 单位换算 (UnitRegistry)
 *         → RingBuffer 缓冲
 *           → 跨设备时间对齐 (MultiDeviceAligner)
 *             → BPA 构建 + DS 融合 (PerceptionPipeline)
 *               → 状态向量输出
 *                 → ClickHouse 写入
 *                   → Kafka 发布 sensor.data.ready
 *
 * 遵循 ADR-003: 边缘层 → 汇聚层 → 平台层，不可跳层。
 * 遵循 ARCH-002: 单例 + get/reset 工厂函数。
 *
 * 降级策略：
 *   - ClickHouse 不可用 → 跳过写入，仅输出状态向量
 *   - Kafka 不可用 → 跳过发布，仅输出状态向量
 *   - 单位换算未知 → 使用原值，标记 quality = 'raw'
 */

import { createModuleLogger } from '../../core/logger';
import { getUnitRegistry, type UnitRegistry, type PhysicalQuantity } from './normalization/unit-registry';
import { MultiDeviceAligner, createCraneAligner, type DeviceStreamConfig, type AlignmentResult, type DataGap } from './alignment/multi-device-aligner';
import { MultiChannelRingBufferManager, type SensorSample } from './collection/ring-buffer';
import { PerceptionPipeline, type PerceptionPipelineConfig } from './perception-pipeline';
import { getDataQualityScorer, type DataQualityScorer, type QualityScore, type QualityGrade, type ScoringInput } from './quality/data-quality-scorer';
import type { SensorStats } from './fusion/bpa.types';
import type { EnhancedFusionResult } from './fusion/ds-fusion-engine';
import type { SynthesizedStateVector } from './encoding/state-vector-synthesizer';
import type { UnifiedStateVector } from './encoding/state-vector-encoder';

const log = createModuleLogger('pipeline-orchestrator');

// ============================================================================
// 类型定义
// ============================================================================

/** 原始传感器消息（协议适配器解析后的标准格式） */
export interface RawSensorMessage {
  /** 设备 ID (如 "RTG-001") */
  deviceId: string;
  /** 传感器/通道 ID (如 "VT-01") */
  sensorId: string;
  /** 测量值 */
  value: number;
  /** 原始单位 (如 "g", "degF", "psi") */
  unit: string;
  /** 物理量类别 */
  quantity: PhysicalQuantity;
  /** 时间戳 (Unix ms) */
  timestamp: number;
  /** 数据质量 (0=bad, 1=uncertain, 2=good) */
  quality?: number;
  /** 元数据 (协议特定信息) */
  metadata?: Record<string, unknown>;
}

/** 标准化后的传感器消息 */
export interface NormalizedSensorMessage {
  deviceId: string;
  sensorId: string;
  /** 标准化后的值 */
  value: number;
  /** 标准单位 */
  unit: string;
  /** 原始值（换算前） */
  rawValue: number;
  /** 原始单位 */
  rawUnit: string;
  quantity: PhysicalQuantity;
  timestamp: number;
  quality: number;
  /** 是否通过了物理合理性校验 */
  physicallyValid: boolean;
  /** 换算是否为近似 */
  isApproximate: boolean;
}

/** 管线处理结果（单次批量） */
export interface PipelineBatchResult {
  /** 批次 ID */
  batchId: string;
  /** 处理的原始消息数 */
  rawMessageCount: number;
  /** 标准化成功数 */
  normalizedCount: number;
  /** 物理约束校验失败数 */
  physicsRejectCount: number;
  /** 对齐后的通道数 */
  alignedChannelCount: number;
  /** 检测到的数据缺口 */
  gaps: DataGap[];
  /** 状态向量（如果成功生成） */
  stateVector: SynthesizedStateVector | null;
  /** 融合结果（如果成功） */
  fusionResult: EnhancedFusionResult | null;
  /** 数据质量评分结果 (P0-3) */
  qualityScore: QualityScore | null;
  /** 质量等级 (A/B/C/D/F) */
  qualityGrade: QualityGrade | null;
  /** 是否标记 needs_review (评分 < 75) */
  needsReview: boolean;
  /** ClickHouse 写入是否成功 */
  clickhouseWritten: boolean;
  /** Kafka 发布是否成功 */
  kafkaPublished: boolean;
  /** 处理耗时 (ms) */
  durationMs: number;
  /** 错误列表 */
  errors: string[];
}

/** 编排器配置 */
export interface PipelineOrchestratorConfig {
  /** 是否启用 ClickHouse 写入 */
  enableClickHouse: boolean;
  /** 是否启用 Kafka 发布 */
  enableKafka: boolean;
  /** Kafka topic 名称 */
  kafkaTopic: string;
  /** 对齐窗口大小 (ms) */
  alignmentWindowMs: number;
  /** 对齐器配置覆盖 */
  alignerOverrides?: Partial<import('./alignment/multi-device-aligner').AlignmentConfig>;
  /** 感知管线配置覆盖 */
  pipelineOverrides?: Partial<PerceptionPipelineConfig>;
}

/** 编排器运行统计 */
export interface OrchestratorStats {
  /** 总接收消息数 */
  totalReceived: number;
  /** 总标准化成功数 */
  totalNormalized: number;
  /** 总物理校验失败数 */
  totalPhysicsRejects: number;
  /** 总批次处理数 */
  totalBatches: number;
  /** 总 ClickHouse 写入数 */
  totalClickHouseWrites: number;
  /** 总 Kafka 发布数 */
  totalKafkaPublishes: number;
  /** 平均批次耗时 (ms) */
  avgBatchDurationMs: number;
  /** 运行时间 (ms) */
  uptimeMs: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_ORCHESTRATOR_CONFIG: PipelineOrchestratorConfig = {
  enableClickHouse: true,
  enableKafka: true,
  kafkaTopic: 'xilian.sensor-data',
  alignmentWindowMs: 5000,
};

// ============================================================================
// 感知管线编排器
// ============================================================================

export class PipelineOrchestrator {
  private readonly config: PipelineOrchestratorConfig;
  private readonly unitRegistry: UnitRegistry;
  private readonly aligner: MultiDeviceAligner;
  private readonly bufferManager: MultiChannelRingBufferManager;
  private readonly pipeline: PerceptionPipeline;
  private readonly qualityScorer: DataQualityScorer;

  /** 设备入站缓冲: deviceId → NormalizedSensorMessage[] */
  private readonly ingestBuffer: Map<string, NormalizedSensorMessage[]> = new Map();
  /** 已注册设备集合 */
  private readonly registeredDevices: Set<string> = new Set();

  private isRunning = false;
  private startTime = 0;
  private batchCounter = 0;

  // 统计
  private stats = {
    totalReceived: 0,
    totalNormalized: 0,
    totalPhysicsRejects: 0,
    totalBatches: 0,
    totalClickHouseWrites: 0,
    totalKafkaPublishes: 0,
    batchDurationSum: 0,
  };

  // 回调
  private onBatchComplete?: (result: PipelineBatchResult) => void;
  private onStateVectorReady?: (machineId: string, vector: SynthesizedStateVector) => void;

  constructor(config?: Partial<PipelineOrchestratorConfig>) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };

    // 初始化子组件
    this.unitRegistry = getUnitRegistry();
    this.aligner = createCraneAligner(this.config.alignerOverrides);
    this.bufferManager = new MultiChannelRingBufferManager({
      bufferSize: 65536,
    });
    this.pipeline = new PerceptionPipeline(this.config.pipelineOverrides);
    this.qualityScorer = getDataQualityScorer();

    log.info({
      enableClickHouse: this.config.enableClickHouse,
      enableKafka: this.config.enableKafka,
      alignmentWindowMs: this.config.alignmentWindowMs,
    }, 'PipelineOrchestrator initialized');
  }

  // ==========================================================================
  // 生命周期
  // ==========================================================================

  /** 启动编排器 */
  start(): void {
    this.isRunning = true;
    this.startTime = Date.now();
    this.pipeline.start();
    log.info('PipelineOrchestrator started');
  }

  /** 停止编排器 */
  stop(): void {
    this.isRunning = false;
    this.pipeline.stop();
    log.info('PipelineOrchestrator stopped');
  }

  // ==========================================================================
  // 设备注册
  // ==========================================================================

  /**
   * 注册设备（必须在接收数据前调用）
   */
  registerDevice(config: DeviceStreamConfig): void {
    this.aligner.registerDevice(config);
    this.registeredDevices.add(config.deviceId);
    this.ingestBuffer.set(config.deviceId, []);
    log.info({ deviceId: config.deviceId, channels: config.channels.length }, 'Device registered');
  }

  /**
   * 批量注册设备
   */
  registerDevices(configs: DeviceStreamConfig[]): void {
    for (const config of configs) {
      this.registerDevice(config);
    }
  }

  // ==========================================================================
  // 数据入站 — 边缘层（ADR-003 Layer 1）
  // ==========================================================================

  /**
   * 接收原始传感器消息
   *
   * 处理流程：
   *   1. 单位换算 → 标准单位
   *   2. 物理合理性校验
   *   3. 写入 RingBuffer
   *   4. 写入对齐器缓冲
   *
   * @param messages 原始传感器消息列表
   * @returns 标准化后的消息列表
   */
  ingest(messages: RawSensorMessage[]): NormalizedSensorMessage[] {
    if (!this.isRunning) return [];

    this.stats.totalReceived += messages.length;
    const normalized: NormalizedSensorMessage[] = [];

    for (const msg of messages) {
      const result = this.normalizeMessage(msg);
      if (!result) continue;

      normalized.push(result);

      // 写入入站缓冲
      const buf = this.ingestBuffer.get(msg.deviceId);
      if (buf) {
        buf.push(result);
      }

      // 写入 RingBuffer（用于 PerceptionPipeline 的 ingestSamples）
      const sample: SensorSample = {
        channelIndex: this.sensorIdToChannel(msg.sensorId),
        value: result.value,
        timestamp: result.timestamp,
        quality: result.quality,
      };
      this.bufferManager.writeSamples([sample]);

      // 写入对齐器
      this.aligner.ingestRaw(
        msg.deviceId,
        msg.sensorId,
        [result.timestamp],
        [result.value],
        [result.quality],
      );

      // 同时注入 PerceptionPipeline（用于特征提取）
      this.pipeline.ingestSamples(msg.deviceId, [sample]);
    }

    this.stats.totalNormalized += normalized.length;
    return normalized;
  }

  // ==========================================================================
  // 批量处理 — 汇聚层 + 平台层（ADR-003 Layer 2+3）
  // ==========================================================================

  /**
   * 执行一次完整的批量处理
   *
   * 触发时机：
   *   - 定时触发（每 alignmentWindowMs 一次）
   *   - 手动触发（测试或事件驱动）
   *
   * 处理流程：
   *   1. 时间对齐
   *   2. BPA 构建 + DS 融合（通过 PerceptionPipeline）
   *   3. ClickHouse 写入
   *   4. Kafka 发布
   */
  async processBatch(machineId: string): Promise<PipelineBatchResult> {
    const startTime = Date.now();
    const batchId = `batch-${++this.batchCounter}-${Date.now()}`;
    const errors: string[] = [];
    let stateVector: SynthesizedStateVector | null = null;
    let fusionResult: EnhancedFusionResult | null = null;
    let clickhouseWritten = false;
    let kafkaPublished = false;

    // 收集入站统计
    const buf = this.ingestBuffer.get(machineId) ?? [];
    const rawMessageCount = buf.length;

    // Step 1: 执行时间对齐
    let alignResult: AlignmentResult | null = null;
    try {
      alignResult = this.aligner.alignAndFlush();
    } catch (err) {
      errors.push(`时间对齐失败: ${(err as Error).message}`);
    }

    // Step 2: BPA + DS 融合（通过 PerceptionPipeline）
    try {
      const pipelineResult = await this.pipeline.synthesizeAndFuse(machineId);
      if (pipelineResult) {
        stateVector = pipelineResult.stateVector;
        fusionResult = pipelineResult.fusionResult;
      }
    } catch (err) {
      errors.push(`融合失败: ${(err as Error).message}`);
    }

    // Step 2.5: 数据质量评分 (P0-3)
    let qualityScore: QualityScore | null = null;
    let qualityGrade: QualityGrade | null = null;
    let needsReview = false;

    try {
      const scoringInput = this.buildScoringInput(machineId, buf);
      qualityScore = this.qualityScorer.score(scoringInput);
      qualityGrade = qualityScore.grade;
      needsReview = qualityScore.overall < 75;

      // 将质量标签附加到状态向量 metadata
      if (stateVector) {
        const sv = stateVector as unknown as Record<string, unknown>;
        sv.qualityGrade = qualityGrade;
        sv.qualityScore = qualityScore.overall;
        sv.needsReview = needsReview;
        if (needsReview) {
          sv.labelStatus = 'needs_review';
        }
      }

      log.info({
        machineId,
        overall: qualityScore.overall,
        grade: qualityGrade,
        completeness: qualityScore.completeness.overall,
        accuracy: qualityScore.accuracy.overall,
        needsReview,
      }, 'Quality score calculated');
    } catch (err) {
      errors.push(`质量评分失败: ${(err as Error).message}`);
      log.warn({ error: (err as Error).message }, 'Quality scoring failed, degrading');
    }

    // Step 3: ClickHouse 写入
    if (this.config.enableClickHouse && stateVector) {
      try {
        await this.writeToClickHouse(machineId, stateVector, buf, qualityScore);
        clickhouseWritten = true;
        this.stats.totalClickHouseWrites++;
      } catch (err) {
        errors.push(`ClickHouse 写入失败: ${(err as Error).message}`);
        log.warn({ error: (err as Error).message }, 'ClickHouse write failed, degrading');
      }
    }

    // Step 4: Kafka 发布
    if (this.config.enableKafka && stateVector) {
      try {
        await this.publishToKafka(machineId, stateVector, fusionResult, qualityScore);
        kafkaPublished = true;
        this.stats.totalKafkaPublishes++;
      } catch (err) {
        errors.push(`Kafka 发布失败: ${(err as Error).message}`);
        log.warn({ error: (err as Error).message }, 'Kafka publish failed, degrading');
      }
    }

    // 清空入站缓冲
    this.ingestBuffer.set(machineId, []);

    const durationMs = Date.now() - startTime;
    this.stats.totalBatches++;
    this.stats.batchDurationSum += durationMs;

    const result: PipelineBatchResult = {
      batchId,
      rawMessageCount,
      normalizedCount: rawMessageCount, // 入站时已标准化
      physicsRejectCount: this.stats.totalPhysicsRejects,
      alignedChannelCount: alignResult?.channels.length ?? 0,
      gaps: alignResult?.gaps ?? [],
      stateVector,
      fusionResult,
      qualityScore,
      qualityGrade,
      needsReview,
      clickhouseWritten,
      kafkaPublished,
      durationMs,
      errors,
    };

    // 触发回调
    this.onBatchComplete?.(result);
    if (stateVector) {
      this.onStateVectorReady?.(machineId, stateVector);
    }

    log.info({
      batchId,
      machineId,
      messages: rawMessageCount,
      aligned: alignResult?.channels.length ?? 0,
      gaps: alignResult?.gaps.length ?? 0,
      decision: fusionResult?.decision,
      confidence: fusionResult?.confidence?.toFixed(3),
      quality: qualityGrade,
      score: qualityScore?.overall?.toFixed(1),
      needsReview,
      ch: clickhouseWritten,
      kafka: kafkaPublished,
      ms: durationMs,
    }, 'Batch processed');

    return result;
  }

  // ==========================================================================
  // 单位换算（边缘层核心）
  // ==========================================================================

  /**
   * 标准化单条传感器消息
   *
   * 执行：
   *   1. 单位换算到标准单位
   *   2. 物理合理性校验
   *
   * 验收标准: 输入 2.5 g → 输出 24.525 m/s²
   */
  private normalizeMessage(msg: RawSensorMessage): NormalizedSensorMessage | null {
    try {
      const conversion = this.unitRegistry.toStandard(msg.value, msg.unit);

      // 物理合理性校验
      const physicallyValid = this.unitRegistry.isPhysicallyValid(
        conversion.value,
        msg.quantity,
      );

      if (!physicallyValid) {
        this.stats.totalPhysicsRejects++;
        log.debug({
          deviceId: msg.deviceId,
          sensorId: msg.sensorId,
          value: conversion.value,
          quantity: msg.quantity,
        }, 'Physics validity check failed');
        // 仍然返回消息，但标记为不合理（不丢弃 — 让下游决定）
      }

      return {
        deviceId: msg.deviceId,
        sensorId: msg.sensorId,
        value: conversion.value,
        unit: conversion.toUnit,
        rawValue: msg.value,
        rawUnit: msg.unit,
        quantity: msg.quantity,
        timestamp: msg.timestamp,
        quality: physicallyValid ? (msg.quality ?? 2) : 1,
        physicallyValid,
        isApproximate: conversion.isApproximate,
      };
    } catch (err) {
      // 单位换算失败 → 使用原值，标记质量为 uncertain
      log.debug({
        error: (err as Error).message,
        unit: msg.unit,
        sensorId: msg.sensorId,
      }, 'Unit conversion failed, using raw value');

      return {
        deviceId: msg.deviceId,
        sensorId: msg.sensorId,
        value: msg.value,
        unit: msg.unit,
        rawValue: msg.value,
        rawUnit: msg.unit,
        quantity: msg.quantity,
        timestamp: msg.timestamp,
        quality: 1, // uncertain
        physicallyValid: true, // 无法判断
        isApproximate: false,
      };
    }
  }

  // ==========================================================================
  // ClickHouse 写入（降级不崩溃）
  // ==========================================================================

  private async writeToClickHouse(
    machineId: string,
    _stateVector: SynthesizedStateVector,
    messages: NormalizedSensorMessage[],
    qualityScore: QualityScore | null,
  ): Promise<void> {
    // 动态导入，避免 ClickHouse 不可用时影响启动
    const { insertTelemetryData } = await import('../../lib/clients/clickhouse.client');

    const telemetryRows = messages.map(msg => ({
      device_id: msg.deviceId,
      sensor_id: msg.sensorId,
      metric_name: msg.quantity,
      value: msg.value,
      unit: msg.unit,
      quality: msg.quality >= 2 ? 'good' as const : msg.quality >= 1 ? 'uncertain' as const : 'bad' as const,
      timestamp: new Date(msg.timestamp),
      batch_id: `${machineId}-${Date.now()}`,
      source: 'pipeline-orchestrator',
      // P0-3: 质量评分写入 quality_score 列
      quality_score: qualityScore?.overall ?? null,
      quality_grade: qualityScore?.grade ?? null,
      label_status: qualityScore && qualityScore.overall < 75 ? 'needs_review' : 'normal',
    }));

    await insertTelemetryData(telemetryRows);
  }

  // ==========================================================================
  // Kafka 发布（降级不崩溃）
  // ==========================================================================

  private async publishToKafka(
    machineId: string,
    stateVector: SynthesizedStateVector,
    fusionResult: EnhancedFusionResult | null,
    qualityScore: QualityScore | null,
  ): Promise<void> {
    // 动态导入，避免 Kafka 不可用时影响启动
    const { kafkaClient } = await import('../../lib/clients/kafka.client');

    const message = {
      key: machineId,
      value: JSON.stringify({
        type: 'sensor.data.ready',
        machineId,
        timestamp: stateVector.timestamp,
        stateVector: {
          dimensions: stateVector.dimensions,
          quality: stateVector.quality,
        },
        fusion: fusionResult ? {
          decision: fusionResult.decision,
          confidence: fusionResult.confidence,
          conflictFactor: fusionResult.conflictFactor,
          method: fusionResult.method,
        } : null,
        // P0-3: 质量评分随 Kafka 事件流转
        qualityScore: qualityScore ? {
          overall: qualityScore.overall,
          grade: qualityScore.grade,
          completeness: qualityScore.completeness.overall,
          accuracy: qualityScore.accuracy.overall,
          needsReview: qualityScore.overall < 75,
        } : null,
      }),
      headers: {
        'event-type': 'sensor.data.ready',
        'machine-id': machineId,
      },
    };

    await kafkaClient.produce(this.config.kafkaTopic, [message]);
  }

  // ==========================================================================
  // 查询接口
  // ==========================================================================

  /** 获取编排器统计 */
  getStats(): OrchestratorStats {
    return {
      totalReceived: this.stats.totalReceived,
      totalNormalized: this.stats.totalNormalized,
      totalPhysicsRejects: this.stats.totalPhysicsRejects,
      totalBatches: this.stats.totalBatches,
      totalClickHouseWrites: this.stats.totalClickHouseWrites,
      totalKafkaPublishes: this.stats.totalKafkaPublishes,
      avgBatchDurationMs: this.stats.totalBatches > 0
        ? this.stats.batchDurationSum / this.stats.totalBatches
        : 0,
      uptimeMs: this.isRunning ? Date.now() - this.startTime : 0,
    };
  }

  /** 获取对齐器引用 */
  getAligner(): MultiDeviceAligner {
    return this.aligner;
  }

  /** 获取感知管线引用 */
  getPipeline(): PerceptionPipeline {
    return this.pipeline;
  }

  /** 获取单位注册表引用 */
  getUnitRegistry(): UnitRegistry {
    return this.unitRegistry;
  }

  /** 设置回调 */
  setCallbacks(callbacks: {
    onBatchComplete?: (result: PipelineBatchResult) => void;
    onStateVectorReady?: (machineId: string, vector: SynthesizedStateVector) => void;
  }): void {
    this.onBatchComplete = callbacks.onBatchComplete;
    this.onStateVectorReady = callbacks.onStateVectorReady;
  }

  // ==========================================================================
  // 辅助方法
  // ==========================================================================

  /**
   * 构建数据质量评分输入 (P0-3)
   *
   * 将入站缓冲中的标准化消息按通道名称分组，
   * 转换为 DataQualityScorer 需要的 ScoringInput 格式。
   */
  private buildScoringInput(machineId: string, messages: NormalizedSensorMessage[]): ScoringInput {
    const channels: Record<string, { values: number[]; timestamps: number[] }> = {};

    for (const msg of messages) {
      // 用 quantity + sensorId 组合作为通道名
      const channelName = this.quantityToChannelName(msg.quantity, msg.sensorId);
      if (!channels[channelName]) {
        channels[channelName] = { values: [], timestamps: [] };
      }
      channels[channelName].values.push(msg.value);
      channels[channelName].timestamps.push(msg.timestamp);
    }

    // 计算时间窗口
    let windowStartMs = Infinity;
    let windowEndMs = -Infinity;
    for (const msg of messages) {
      if (msg.timestamp < windowStartMs) windowStartMs = msg.timestamp;
      if (msg.timestamp > windowEndMs) windowEndMs = msg.timestamp;
    }
    if (!isFinite(windowStartMs)) windowStartMs = Date.now();
    if (!isFinite(windowEndMs)) windowEndMs = windowStartMs + 1000;

    return {
      deviceId: machineId,
      windowStartMs,
      windowEndMs,
      channels,
    };
  }

  /**
   * 物理量 → 评分通道名映射
   *
   * DataQualityScorer 识别的通道名：
   *   机械类: vibrationRms, vibrationPeak, bearingTemp, motorSpeed, peakFrequency
   *   电气类: current, voltage, powerFactor
   *   结构类: stress, strain, displacement
   *   环境类: windSpeed, ambientTemp, humidity, salinity
   *   作业类: loadWeight, liftHeight, cycleCount, slewAngle, trolleyPosition
   */
  private quantityToChannelName(quantity: PhysicalQuantity, sensorId: string): string {
    const sensorLower = sensorId.toLowerCase();

    switch (quantity) {
      case 'vibration_acceleration':
      case 'vibration_velocity':
        return sensorLower.includes('peak') ? 'vibrationPeak' : 'vibrationRms';
      case 'vibration_displacement':
        return 'displacement';
      case 'temperature':
        if (sensorLower.includes('bearing')) return 'bearingTemp';
        if (sensorLower.includes('motor')) return 'bearingTemp';
        if (sensorLower.includes('ambient') || sensorLower.includes('env')) return 'ambientTemp';
        return 'bearingTemp';
      case 'rotational_speed':
        return 'motorSpeed';
      case 'current':
        return 'current';
      case 'force':
      case 'pressure':
      case 'stress':
        return 'stress';
      case 'length':
        return 'displacement';
      case 'frequency':
        return 'peakFrequency';
      default:
        return quantity;
    }
  }

  /** 传感器 ID 映射到通道索引 */
  private sensorIdToChannel(sensorId: string): number {
    // VT-01 → 0, VT-02 → 1, ..., VT-16 → 15
    const match = sensorId.match(/(\d+)$/);
    if (match) {
      return parseInt(match[1], 10) - 1;
    }
    return 0;
  }
}

// ============================================================================
// 单例 + 工厂函数（ARCH-002 模式）
// ============================================================================

let _instance: PipelineOrchestrator | null = null;

/** 获取全局 PipelineOrchestrator 单例 */
export function getPipelineOrchestrator(config?: Partial<PipelineOrchestratorConfig>): PipelineOrchestrator {
  if (!_instance) {
    _instance = new PipelineOrchestrator(config);
  }
  return _instance;
}

/** 重置单例（用于测试） */
export function resetPipelineOrchestrator(): void {
  if (_instance) {
    _instance.stop();
  }
  _instance = null;
}
