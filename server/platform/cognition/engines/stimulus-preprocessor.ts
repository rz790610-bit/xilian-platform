/**
 * ============================================================================
 * 刺激预处理器 — StimulusPreprocessor
 * ============================================================================
 *
 * 在认知活动正式启动前，对刺激信号进行预处理（< 500ms），包括：
 *   1. 高熵维度识别 — 找出信息量最大的特征维度
 *   2. 暗数据流发现 — 检测未被充分利用的数据源
 *   3. 事件流摘要 — 压缩历史事件为紧凑摘要
 *
 * 来源：Grok L6 AGISpine Cycle 的 DataFlowCompressor 理念
 *
 * 设计原则：
 *   - 轻量级：总耗时 < 500ms
 *   - 不修改原始 payload，仅在 payload 中追加预处理结果
 *   - 纯计算，无外部 IO
 */

import { createModuleLogger } from '../../../core/logger';
import type { CognitionStimulus } from '../types';
import type { StimulusPreprocessor } from './cognition-unit';

const log = createModuleLogger('stimulusPreprocessor');

// ============================================================================
// 预处理结果类型
// ============================================================================

export interface PreprocessResult {
  /** 高熵维度（按熵值降序） */
  highEntropyDimensions: Array<{
    name: string;
    entropy: number;
    valueRange: { min: number; max: number };
  }>;
  /** 暗数据流 */
  darkDataFlows: Array<{
    source: string;
    description: string;
    estimatedValue: number;
  }>;
  /** 事件流摘要 */
  eventSummary: {
    totalEvents: number;
    uniqueTypes: number;
    timeSpanMs: number;
    dominantType: string;
    dominantRatio: number;
  };
  /** 预处理耗时（毫秒） */
  preprocessDurationMs: number;
}

// ============================================================================
// 实现
// ============================================================================

export class DefaultStimulusPreprocessor implements StimulusPreprocessor {
  /**
   * 预处理刺激信号
   *
   * 在 payload 中追加 __preprocess 字段，不修改原始数据。
   */
  async preprocess(stimulus: CognitionStimulus): Promise<CognitionStimulus> {
    const startTime = Date.now();

    try {
      const payload = stimulus.payload;

      // 1. 高熵维度识别
      const highEntropyDimensions = this.identifyHighEntropyDimensions(payload);

      // 2. 暗数据流发现
      const darkDataFlows = this.discoverDarkDataFlows(payload);

      // 3. 事件流摘要
      const eventSummary = this.summarizeEventFlow(payload);

      const preprocessDurationMs = Date.now() - startTime;

      const preprocessResult: PreprocessResult = {
        highEntropyDimensions,
        darkDataFlows,
        eventSummary,
        preprocessDurationMs,
      };

      log.debug({
        stimulusId: stimulus.id,
        highEntropyCount: highEntropyDimensions.length,
        darkDataFlowCount: darkDataFlows.length,
        durationMs: preprocessDurationMs,
      }, 'Stimulus preprocessed');

      // 返回增强后的刺激（不修改原始 payload 引用）
      return {
        ...stimulus,
        payload: {
          ...payload,
          __preprocess: preprocessResult,
        },
      };
    } catch (err) {
      log.warn({
        stimulusId: stimulus.id,
        error: err instanceof Error ? err.message : String(err),
      }, 'Stimulus preprocessing failed, returning original');
      return stimulus;
    }
  }

  /**
   * 高熵维度识别
   *
   * 遍历 payload 中的数值字段，计算信息熵的近似值（基于变异系数）。
   * 变异系数越大，说明该维度的信息量越高。
   */
  private identifyHighEntropyDimensions(
    payload: Record<string, unknown>,
  ): PreprocessResult['highEntropyDimensions'] {
    const dimensions: PreprocessResult['highEntropyDimensions'] = [];

    for (const [key, value] of Object.entries(payload)) {
      if (key.startsWith('__')) continue; // 跳过内部字段

      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'number') {
        // 数值数组 → 计算统计量
        const nums = value as number[];
        const stats = this.computeArrayStats(nums);
        if (stats.std > 0) {
          const entropy = Math.log2(1 + stats.cv); // 基于变异系数的熵近似
          dimensions.push({
            name: key,
            entropy,
            valueRange: { min: stats.min, max: stats.max },
          });
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // 嵌套对象 → 递归提取数值字段
        const nested = value as Record<string, unknown>;
        for (const [subKey, subValue] of Object.entries(nested)) {
          if (typeof subValue === 'number') {
            dimensions.push({
              name: `${key}.${subKey}`,
              entropy: Math.abs(subValue) > 0 ? Math.log2(1 + Math.abs(subValue)) : 0,
              valueRange: { min: subValue, max: subValue },
            });
          }
        }
      }
    }

    // 按熵值降序排序
    dimensions.sort((a, b) => b.entropy - a.entropy);
    return dimensions.slice(0, 10); // 最多返回 10 个
  }

  /**
   * 暗数据流发现
   *
   * 检测 payload 中存在但值为空/零/null 的字段，
   * 这些可能是未被充分利用的数据源。
   */
  private discoverDarkDataFlows(
    payload: Record<string, unknown>,
  ): PreprocessResult['darkDataFlows'] {
    const darkFlows: PreprocessResult['darkDataFlows'] = [];

    for (const [key, value] of Object.entries(payload)) {
      if (key.startsWith('__')) continue;

      let isDark = false;
      let description = '';

      if (value === null || value === undefined) {
        isDark = true;
        description = `字段 "${key}" 值为 null/undefined，可能是未接入的数据源`;
      } else if (Array.isArray(value) && value.length === 0) {
        isDark = true;
        description = `字段 "${key}" 为空数组，可能是未采集的数据通道`;
      } else if (typeof value === 'object' && value !== null) {
        const obj = value as Record<string, unknown>;
        const totalKeys = Object.keys(obj).length;
        const nullKeys = Object.values(obj).filter(v => v === null || v === undefined).length;
        if (totalKeys > 0 && nullKeys / totalKeys > 0.5) {
          isDark = true;
          description = `字段 "${key}" 中 ${nullKeys}/${totalKeys} 个子字段为空，数据完整度不足`;
        }
      }

      if (isDark) {
        darkFlows.push({
          source: key,
          description,
          estimatedValue: 0.5, // 默认中等价值
        });
      }
    }

    return darkFlows;
  }

  /**
   * 事件流摘要
   *
   * 如果 payload 中包含 events 数组，则生成摘要。
   */
  private summarizeEventFlow(
    payload: Record<string, unknown>,
  ): PreprocessResult['eventSummary'] {
    const defaultSummary: PreprocessResult['eventSummary'] = {
      totalEvents: 0,
      uniqueTypes: 0,
      timeSpanMs: 0,
      dominantType: 'none',
      dominantRatio: 0,
    };

    const events = payload.events;
    if (!Array.isArray(events) || events.length === 0) {
      return defaultSummary;
    }

    // 统计事件类型分布
    const typeCounts: Record<string, number> = {};
    let minTime = Infinity;
    let maxTime = -Infinity;

    for (const event of events) {
      if (typeof event !== 'object' || event === null) continue;

      const e = event as Record<string, unknown>;
      const eventType = String(e.type || e.topic || 'unknown');
      typeCounts[eventType] = (typeCounts[eventType] || 0) + 1;

      const timestamp = Number(e.timestamp || e.time || 0);
      if (timestamp > 0) {
        minTime = Math.min(minTime, timestamp);
        maxTime = Math.max(maxTime, timestamp);
      }
    }

    const entries = Object.entries(typeCounts);
    entries.sort((a, b) => b[1] - a[1]);

    const dominantType = entries.length > 0 ? entries[0][0] : 'none';
    const dominantCount = entries.length > 0 ? entries[0][1] : 0;

    return {
      totalEvents: events.length,
      uniqueTypes: entries.length,
      timeSpanMs: maxTime > minTime ? maxTime - minTime : 0,
      dominantType,
      dominantRatio: events.length > 0 ? dominantCount / events.length : 0,
    };
  }

  /**
   * 计算数组统计量
   */
  private computeArrayStats(nums: number[]): {
    mean: number;
    std: number;
    cv: number;
    min: number;
    max: number;
  } {
    const n = nums.length;
    if (n === 0) return { mean: 0, std: 0, cv: 0, min: 0, max: 0 };

    let sum = 0;
    let min = Infinity;
    let max = -Infinity;

    for (const v of nums) {
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }

    const mean = sum / n;

    let sumSq = 0;
    for (const v of nums) {
      sumSq += (v - mean) ** 2;
    }
    const std = Math.sqrt(sumSq / n);
    const cv = mean !== 0 ? std / Math.abs(mean) : 0;

    return { mean, std, cv, min, max };
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/** 创建默认刺激预处理器 */
export function createStimulusPreprocessor(): DefaultStimulusPreprocessor {
  return new DefaultStimulusPreprocessor();
}
