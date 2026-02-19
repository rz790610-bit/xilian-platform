/**
 * ============================================================================
 * 感知维处理器 — PerceptionProcessor
 * ============================================================================
 *
 * 认知闭环四维之一：感知维（好奇引擎）
 *
 * 职责：
 *   1. 异常信号检测 — 从原始数据中识别偏离基线的异常
 *   2. 高熵维度识别 — 找出信息量最大的特征维度
 *   3. 问题链生成 — 基于异常生成递进式问题链
 *   4. 暗数据流发现 — 检测未被充分利用的数据源
 *
 * 与平台现有组件的对接：
 *   - 使用 ConditionNormalizerEngine 获取工况基线
 *   - 使用 EventBus 发布感知事件
 *   - 结果传递给推演维和融合维
 *
 * 对应 v3.0 方案 U-15（感知维部分）
 */

import { createModuleLogger } from '../../../core/logger';
import type { DimensionProcessor } from '../engines/cognition-unit';
import type {
  CognitionStimulus,
  PerceptionOutput,
  DegradationMode,
  OCBaseline,
} from '../types';

const log = createModuleLogger('perceptionProcessor');

// ============================================================================
// 工况基线适配器
// ============================================================================

/**
 * 工况基线适配器 — 获取当前工况的基线统计数据
 */
export interface BaselineAdapter {
  /** 获取指定工况的基线 */
  getBaseline(ocProfileId: string): Promise<OCBaseline | null>;
  /** 获取设备的默认基线 */
  getDeviceBaseline(deviceId: string): Promise<OCBaseline | null>;
}

// ============================================================================
// 感知维处理器配置
// ============================================================================

export interface PerceptionConfig {
  /** 异常检测的 Z-score 阈值 */
  anomalyZScoreThreshold: number;
  /** 高熵维度的最小熵值 */
  minEntropyThreshold: number;
  /** 最大问题链深度 */
  maxQuestionChainDepth: number;
  /** 暗数据流检测的最小价值阈值 */
  darkDataMinValue: number;
}

const DEFAULT_CONFIG: PerceptionConfig = {
  anomalyZScoreThreshold: 2.5,
  minEntropyThreshold: 0.3,
  maxQuestionChainDepth: 5,
  darkDataMinValue: 0.1,
};

// ============================================================================
// 感知维处理器实现
// ============================================================================

export class PerceptionProcessor implements DimensionProcessor<PerceptionOutput> {
  readonly dimension = 'perception' as const;
  private readonly config: PerceptionConfig;
  private readonly baselineAdapter: BaselineAdapter;

  constructor(baselineAdapter: BaselineAdapter, config?: Partial<PerceptionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.baselineAdapter = baselineAdapter;
  }

  /**
   * 执行感知维处理
   */
  async process(
    stimulus: CognitionStimulus,
    degradationMode: DegradationMode,
  ): Promise<PerceptionOutput> {
    const startTime = Date.now();

    try {
      // 获取基线
      const baseline = await this.resolveBaseline(stimulus);

      // 1. 异常检测
      const anomalies = this.detectAnomalies(stimulus.payload, baseline);

      // 2. 高熵维度识别
      const highEntropyDimensions = this.identifyHighEntropyDimensions(stimulus.payload, baseline);

      // 3. 问题链生成（紧急模式下跳过）
      const questionChain = degradationMode === 'emergency'
        ? []
        : this.generateQuestionChain(anomalies, highEntropyDimensions);

      // 4. 暗数据流发现（高压/紧急模式下跳过）
      const darkDataFlows = degradationMode !== 'normal'
        ? []
        : this.discoverDarkDataFlows(stimulus.payload);

      return {
        dimension: 'perception',
        success: true,
        durationMs: Date.now() - startTime,
        data: {
          anomalies,
          highEntropyDimensions,
          questionChain,
          darkDataFlows,
        },
      };
    } catch (err) {
      log.error({
        stimulusId: stimulus.id,
        error: err instanceof Error ? err.message : String(err),
      }, 'Perception processing failed');

      return {
        dimension: 'perception',
        success: false,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
        data: {
          anomalies: [],
          highEntropyDimensions: [],
          questionChain: [],
          darkDataFlows: [],
        },
      };
    }
  }

  // ==========================================================================
  // 核心算法
  // ==========================================================================

  /**
   * 解析基线
   */
  private async resolveBaseline(stimulus: CognitionStimulus): Promise<OCBaseline | null> {
    const ocProfileId = stimulus.payload?.ocProfileId as string | undefined;
    const deviceId = stimulus.payload?.deviceId as string | undefined;

    if (ocProfileId) {
      const baseline = await this.baselineAdapter.getBaseline(ocProfileId);
      if (baseline) return baseline;
    }

    if (deviceId) {
      return this.baselineAdapter.getDeviceBaseline(deviceId);
    }

    return null;
  }

  /**
   * 异常检测 — 基于 Z-score 的统计异常检测
   *
   * 对 payload 中的每个数值字段，计算其相对于基线的 Z-score，
   * 超过阈值的标记为异常。
   */
  private detectAnomalies(
    payload: Record<string, unknown>,
    baseline: OCBaseline | null,
  ): PerceptionOutput['data']['anomalies'] {
    const anomalies: PerceptionOutput['data']['anomalies'] = [];

    if (!baseline || baseline.learningStatus !== 'converged') {
      // 无基线或基线未收敛，无法进行异常检测
      return anomalies;
    }

    const numericFields = this.extractNumericFields(payload);

    for (const [fieldName, value] of numericFields) {
      const stats = baseline.statistics[fieldName];
      if (!stats || stats.std === 0) continue;

      const zScore = Math.abs((value - stats.mean) / stats.std);

      if (zScore >= this.config.anomalyZScoreThreshold) {
        // 判断异常类型
        const direction = value > stats.mean ? 'high' : 'low';
        const severity = Math.min(1.0, zScore / (this.config.anomalyZScoreThreshold * 3));

        anomalies.push({
          type: `${fieldName}_${direction}`,
          severity,
          source: fieldName,
          description:
            `${fieldName} 值为 ${value.toFixed(4)}，偏离基线均值 ${stats.mean.toFixed(4)}，` +
            `Z-score = ${zScore.toFixed(2)}（阈值 ${this.config.anomalyZScoreThreshold}）`,
        });
      }
    }

    return anomalies;
  }

  /**
   * 高熵维度识别
   *
   * 计算每个特征维度的信息熵（基于其在基线分布中的位置），
   * 返回熵值最高的维度。
   */
  private identifyHighEntropyDimensions(
    payload: Record<string, unknown>,
    baseline: OCBaseline | null,
  ): PerceptionOutput['data']['highEntropyDimensions'] {
    const dimensions: PerceptionOutput['data']['highEntropyDimensions'] = [];
    const numericFields = this.extractNumericFields(payload);

    for (const [fieldName, value] of numericFields) {
      const stats = baseline?.statistics[fieldName];

      if (stats && stats.std > 0) {
        // 基于高斯分布计算信息熵的近似
        // 使用 Z-score 的绝对值作为偏离度，偏离越大信息量越高
        const zScore = Math.abs((value - stats.mean) / stats.std);
        // 信息熵近似：-log2(p)，其中 p 是观测值在正态分布中的概率密度
        // 简化为 zScore 的归一化值
        const entropy = Math.min(1.0, zScore / 5.0);

        if (entropy >= this.config.minEntropyThreshold) {
          dimensions.push({
            name: fieldName,
            entropy,
            currentValue: value,
            baselineValue: stats.mean,
            deviation: (value - stats.mean) / stats.std,
          });
        }
      } else {
        // 无基线时，使用值本身的变异性估计
        dimensions.push({
          name: fieldName,
          entropy: 0.5, // 中性熵值
          currentValue: value,
          baselineValue: 0,
          deviation: 0,
        });
      }
    }

    // 按熵值降序排序
    dimensions.sort((a, b) => b.entropy - a.entropy);
    return dimensions.slice(0, 10); // 最多返回 10 个
  }

  /**
   * 问题链生成
   *
   * 基于检测到的异常，生成递进式问题链：
   *   Level 1: "什么异常？"
   *   Level 2: "为什么异常？"
   *   Level 3: "影响范围？"
   *   Level 4: "如何处理？"
   *   Level 5: "如何预防？"
   */
  private generateQuestionChain(
    anomalies: PerceptionOutput['data']['anomalies'],
    highEntropyDimensions: PerceptionOutput['data']['highEntropyDimensions'],
  ): string[] {
    const chain: string[] = [];

    if (anomalies.length === 0 && highEntropyDimensions.length === 0) {
      chain.push('当前数据未发现明显异常，是否存在渐进式退化趋势？');
      return chain;
    }

    // Level 1: 什么异常
    if (anomalies.length > 0) {
      const topAnomaly = anomalies.reduce((a, b) => a.severity > b.severity ? a : b);
      chain.push(`检测到 ${anomalies.length} 个异常信号，最严重的是 ${topAnomaly.source}（严重度 ${(topAnomaly.severity * 100).toFixed(0)}%），这是否为真实故障？`);
    }

    // Level 2: 为什么异常
    if (anomalies.length > 0 && chain.length < this.config.maxQuestionChainDepth) {
      const sources = [...new Set(anomalies.map(a => a.source))];
      chain.push(`${sources.join('、')} 的异常是否存在共同根因？是否与工况切换相关？`);
    }

    // Level 3: 影响范围
    if (highEntropyDimensions.length > 0 && chain.length < this.config.maxQuestionChainDepth) {
      const topDims = highEntropyDimensions.slice(0, 3).map(d => d.name);
      chain.push(`高信息量维度 ${topDims.join('、')} 的变化是否影响到下游模型的预测精度？`);
    }

    // Level 4: 如何处理
    if (chain.length < this.config.maxQuestionChainDepth) {
      chain.push('当前异常是否需要触发模型重训练，还是可以通过调整阈值解决？');
    }

    // Level 5: 如何预防
    if (chain.length < this.config.maxQuestionChainDepth) {
      chain.push('是否需要更新基线配置或增加监控维度以预防类似异常？');
    }

    return chain;
  }

  /**
   * 暗数据流发现
   *
   * 检测 payload 中存在但未被充分利用的数据字段。
   */
  private discoverDarkDataFlows(
    payload: Record<string, unknown>,
  ): PerceptionOutput['data']['darkDataFlows'] {
    const darkFlows: PerceptionOutput['data']['darkDataFlows'] = [];

    // 检测嵌套对象中可能被忽略的数据
    const allFields = this.flattenObject(payload);
    const numericFields = this.extractNumericFields(payload);
    const numericFieldNames = new Set(numericFields.map(([name]) => name));

    for (const [path, value] of allFields) {
      // 跳过已经被识别为数值字段的
      if (numericFieldNames.has(path)) continue;

      // 检测可能有价值但未被利用的字段
      if (typeof value === 'string' && value.length > 0) {
        // 字符串字段可能包含有价值的分类信息
        darkFlows.push({
          source: path,
          description: `字符串字段 "${path}" 可能包含有价值的分类信息（当前值：${String(value).substring(0, 50)}）`,
          estimatedValue: 0.3,
        });
      } else if (Array.isArray(value) && value.length > 0) {
        // 数组字段可能包含时序数据
        darkFlows.push({
          source: path,
          description: `数组字段 "${path}" 包含 ${value.length} 个元素，可能是未被利用的时序数据`,
          estimatedValue: 0.5,
        });
      }
    }

    return darkFlows
      .filter(d => d.estimatedValue >= this.config.darkDataMinValue)
      .slice(0, 10);
  }

  // ==========================================================================
  // 工具方法
  // ==========================================================================

  /**
   * 从 payload 中提取数值字段
   */
  private extractNumericFields(payload: Record<string, unknown>): Array<[string, number]> {
    const fields: Array<[string, number]> = [];

    const extract = (obj: Record<string, unknown>, prefix: string) => {
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'number' && isFinite(value)) {
          fields.push([path, value]);
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
          extract(value as Record<string, unknown>, path);
        }
      }
    };

    if (payload && typeof payload === 'object') {
      extract(payload, '');
    }

    return fields;
  }

  /**
   * 扁平化对象
   */
  private flattenObject(
    obj: Record<string, unknown>,
    prefix = '',
  ): Array<[string, unknown]> {
    const result: Array<[string, unknown]> = [];

    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      result.push([path, value]);

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result.push(...this.flattenObject(value as Record<string, unknown>, path));
      }
    }

    return result;
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createPerceptionProcessor(
  baselineAdapter: BaselineAdapter,
  config?: Partial<PerceptionConfig>,
): PerceptionProcessor {
  return new PerceptionProcessor(baselineAdapter, config);
}
