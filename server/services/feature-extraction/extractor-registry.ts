/**
 * 特征提取器注册表与路由器
 * ============================================================
 * 
 * 职责：
 *   1. 管理所有已注册的特征提取器
 *   2. 根据数据类型路由到正确的提取器
 *   3. 支持运行时动态注册/注销提取器
 *   4. 提供提取器健康状态和统计信息
 */

import { createModuleLogger } from '../../core/logger';
import {
  DataType,
  FeatureExtractor,
  MEASUREMENT_TYPE_MAP,
  RawTelemetryMessage,
} from './types';

// 内置提取器
import { VibrationExtractor } from './extractors/vibration.extractor';
import { ScalarExtractor } from './extractors/scalar.extractor';
import { ElectricalExtractor } from './extractors/electrical.extractor';
import { RotationExtractor } from './extractors/rotation.extractor';
import { AcousticExtractor } from './extractors/acoustic.extractor';
import { VisualExtractor } from './extractors/visual.extractor';

const log = createModuleLogger('extractor-registry');

// ============================================================
// 提取器统计
// ============================================================

interface ExtractorStats {
  /** 处理总数 */
  processed: number;
  /** 成功数 */
  succeeded: number;
  /** 失败数 */
  failed: number;
  /** 验证失败数 */
  validationFailed: number;
  /** 平均处理耗时（毫秒） */
  avgLatencyMs: number;
  /** 最后处理时间 */
  lastProcessedAt: number;
}

// ============================================================
// 注册表
// ============================================================

export class ExtractorRegistry {
  /** 按数据类型索引的提取器 */
  private extractors: Map<DataType, FeatureExtractor> = new Map();
  /** 提取器统计 */
  private stats: Map<string, ExtractorStats> = new Map();
  /** 处理延迟滑动窗口 */
  private latencyWindows: Map<string, number[]> = new Map();

  constructor() {
    this.registerBuiltins();
  }

  /**
   * 注册内置提取器
   */
  private registerBuiltins(): void {
    this.register(new VibrationExtractor());
    this.register(new ScalarExtractor());
    this.register(new ElectricalExtractor());
    this.register(new RotationExtractor());
    this.register(new AcousticExtractor());
    this.register(new VisualExtractor());

    log.info(`[ExtractorRegistry] 已注册 ${this.extractors.size} 个内置提取器`);
  }

  /**
   * 注册提取器
   * 如果同一数据类型已有提取器，将被覆盖（支持热替换）
   */
  register(extractor: FeatureExtractor): void {
    for (const type of extractor.supportedTypes) {
      const existing = this.extractors.get(type);
      if (existing) {
        log.info(
          `[ExtractorRegistry] 替换提取器: ${type} ${existing.name}@${existing.version} → ${extractor.name}@${extractor.version}`
        );
      }
      this.extractors.set(type, extractor);
    }

    // 初始化统计
    if (!this.stats.has(extractor.name)) {
      this.stats.set(extractor.name, {
        processed: 0,
        succeeded: 0,
        failed: 0,
        validationFailed: 0,
        avgLatencyMs: 0,
        lastProcessedAt: 0,
      });
      this.latencyWindows.set(extractor.name, []);
    }
  }

  /**
   * 注销指定数据类型的提取器
   */
  unregister(type: DataType): boolean {
    return this.extractors.delete(type);
  }

  /**
   * 获取指定数据类型的提取器
   */
  getExtractor(type: DataType): FeatureExtractor | undefined {
    return this.extractors.get(type);
  }

  /**
   * 解析数据类型
   * 优先级：消息自带 data_type > measurement_type 映射 > 启发式推断
   */
  resolveDataType(raw: RawTelemetryMessage): DataType | null {
    // 1. 消息自带 data_type
    if (raw.data_type) {
      const mapped = MEASUREMENT_TYPE_MAP[raw.data_type.toLowerCase()];
      if (mapped) return mapped;

      // 直接尝试作为 DataType 枚举值
      if (Object.values(DataType).includes(raw.data_type as DataType)) {
        return raw.data_type as DataType;
      }
    }

    // 2. 从 metadata 中的 measurement_type 映射
    if (raw.metadata?.measurement_type) {
      const mapped = MEASUREMENT_TYPE_MAP[raw.metadata.measurement_type.toLowerCase()];
      if (mapped) return mapped;
    }

    // 3. 启发式推断
    return this.inferDataType(raw);
  }

  /**
   * 启发式推断数据类型
   * 基于消息结构特征判断
   */
  private inferDataType(raw: RawTelemetryMessage): DataType | null {
    // 有波形数据
    if (raw.waveform && Array.isArray(raw.waveform) && raw.waveform.length > 0) {
      if (raw.sample_rate) {
        // 高采样率（>8kHz）→ 声学
        if (raw.sample_rate >= 8000) return DataType.ACOUSTIC;
        // 中采样率（1kHz-8kHz）→ 振动
        if (raw.sample_rate >= 1000) return DataType.VIBRATION;
        // 低采样率（<1kHz）→ 电气（工频采样）
        return DataType.ELECTRICAL;
      }
      // 无采样率但有波形 → 默认振动
      return DataType.VIBRATION;
    }

    // 有热成像数据
    if (raw.metadata?.thermal_matrix || raw.metadata?.thermal_data) {
      return DataType.VISUAL;
    }

    // 有媒体引用
    if (raw.metadata?.media_ref) {
      return DataType.VISUAL;
    }

    // 单值 → 默认标量
    if (raw.value !== undefined && raw.value !== null) {
      return DataType.SCALAR;
    }

    return null;
  }

  /**
   * 处理一条原始遥测消息
   * 自动路由到正确的提取器
   * 
   * @returns 特征结果，或 null（无法处理）
   */
  async process(raw: RawTelemetryMessage): Promise<{
    dataType: DataType;
    extractor: string;
    extractorVersion: string;
    features: Record<string, number | string | boolean>;
    latencyMs: number;
  } | null> {
    // 解析数据类型
    const dataType = this.resolveDataType(raw);
    if (!dataType) {
      log.debug(
        `[ExtractorRegistry] 无法确定数据类型: device=${raw.device_code}, mp=${raw.mp_code}`
      );
      return null;
    }

    // 查找提取器
    const extractor = this.extractors.get(dataType);
    if (!extractor) {
      log.debug(`[ExtractorRegistry] 未注册 ${dataType} 类型的提取器`);
      return null;
    }

    const stats = this.stats.get(extractor.name)!;
    stats.processed++;

    // 验证输入
    const validation = extractor.validate(raw);
    if (!validation.valid) {
      stats.validationFailed++;
      log.debug(
        `[ExtractorRegistry] 验证失败 [${extractor.name}]: ${validation.reason}`
      );
      return null;
    }

    // 执行提取
    const startTime = Date.now();
    try {
      const features = await extractor.extract(raw);
      const latencyMs = Date.now() - startTime;

      stats.succeeded++;
      stats.lastProcessedAt = Date.now();

      // 更新延迟统计
      const latencies = this.latencyWindows.get(extractor.name)!;
      latencies.push(latencyMs);
      if (latencies.length > 100) latencies.shift();
      stats.avgLatencyMs = Math.round(
        latencies.reduce((a, b) => a + b, 0) / latencies.length
      );

      return {
        dataType,
        extractor: extractor.name,
        extractorVersion: extractor.version,
        features,
        latencyMs,
      };
    } catch (error) {
      stats.failed++;
      log.warn(`[ExtractorRegistry] 提取失败 [${extractor.name}]:`, error);
      return null;
    }
  }

  /**
   * 获取所有提取器的统计信息
   */
  getStats(): Record<string, ExtractorStats & { dataTypes: DataType[] }> {
    const result: Record<string, ExtractorStats & { dataTypes: DataType[] }> = {};

    for (const [type, extractor] of this.extractors) {
      const stats = this.stats.get(extractor.name);
      if (!stats) continue;

      if (!result[extractor.name]) {
        result[extractor.name] = { ...stats, dataTypes: [] };
      }
      result[extractor.name].dataTypes.push(type);
    }

    return result;
  }

  /**
   * 获取已注册的数据类型列表
   */
  getRegisteredTypes(): DataType[] {
    return Array.from(this.extractors.keys());
  }

  /**
   * 获取提取器数量
   */
  get size(): number {
    return this.extractors.size;
  }
}

// ============================================================
// 单例导出
// ============================================================

export const extractorRegistry = new ExtractorRegistry();
export default extractorRegistry;
