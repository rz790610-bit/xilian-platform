/**
 * 视觉特征提取器
 * ============================================================
 * 
 * 输入：热成像/工业相机图像（通过 media_ref 引用或内嵌 base64）
 * 输出：温度分布 + 缺陷检测 + 变化检测
 * 
 * 架构说明：
 *   视觉特征提取需要 GPU 推理，本提取器作为代理层：
 *   1. 热成像数据 → 直接在本地计算温度统计（无需 GPU）
 *   2. 缺陷检测/变化检测 → 委托给外部推理服务（Triton/TorchServe）
 *   3. 推理服务不可用时 → 降级为仅输出基础温度统计
 * 
 * 数据流：
 *   media.raw.* → [本提取器] → 推理服务 → telemetry.feature.*
 */

import {
  DataType,
  FeatureExtractor,
  RawTelemetryMessage,
  VisualFeatures,
} from '../types';
import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('visual-extractor');

export class VisualExtractor implements FeatureExtractor {
  readonly name = 'VisualExtractor';
  readonly version = '1.0.0';
  readonly supportedTypes = [DataType.VISUAL];

  private inferenceUrl: string;
  private inferenceTimeoutMs: number;
  private inferenceAvailable: boolean = true;
  private lastInferenceCheck: number = 0;
  private inferenceCheckIntervalMs: number = 60000; // 1分钟重试

  constructor(
    inferenceUrl: string = process.env.VISUAL_INFERENCE_URL || 'http://triton:8000',
    inferenceTimeoutMs: number = 5000
  ) {
    this.inferenceUrl = inferenceUrl;
    this.inferenceTimeoutMs = inferenceTimeoutMs;
  }

  validate(raw: RawTelemetryMessage): { valid: boolean; reason?: string } {
    // 热成像数据可以是矩阵（metadata.thermal_matrix）或单值
    const hasThermal = raw.metadata?.thermal_matrix || raw.metadata?.thermal_data;
    const hasMediaRef = raw.metadata?.media_ref;
    const hasValue = raw.value !== undefined;

    if (!hasThermal && !hasMediaRef && !hasValue) {
      return { valid: false, reason: '需要 thermal_matrix、media_ref 或 value' };
    }
    return { valid: true };
  }

  async extract(raw: RawTelemetryMessage): Promise<Record<string, number | string | boolean>> {
    const result: Record<string, number | string | boolean> = {};

    // ---- 热成像数据处理（本地计算，无需 GPU） ----
    if (raw.metadata?.thermal_matrix || raw.metadata?.thermal_data) {
      const thermalFeatures = this.extractThermalFeatures(raw);
      Object.assign(result, thermalFeatures);
    }

    // ---- 图像缺陷检测（委托推理服务） ----
    if (raw.metadata?.media_ref) {
      const inferenceFeatures = await this.callInferenceService(raw);
      if (inferenceFeatures) {
        Object.assign(result, inferenceFeatures);
      }
    }

    // 如果没有任何特征输出，至少记录基础信息
    if (Object.keys(result).length === 0 && raw.value !== undefined) {
      result.current_value = raw.value;
    }

    return result;
  }

  /**
   * 热成像特征提取（纯计算，无外部依赖）
   */
  private extractThermalFeatures(raw: RawTelemetryMessage): Record<string, number | string | boolean> {
    const matrix: number[] = raw.metadata?.thermal_matrix
      || raw.metadata?.thermal_data
      || [];

    if (!Array.isArray(matrix) || matrix.length === 0) {
      return {};
    }

    // 展平为一维数组（如果是二维矩阵）
    const flat: number[] = Array.isArray(matrix[0])
      ? (matrix as unknown as number[][]).flat()
      : matrix;

    const validTemps = flat.filter(t => typeof t === 'number' && !isNaN(t) && t > -273.15);
    if (validTemps.length === 0) return {};

    const maxTemp = Math.max(...validTemps);
    const minTemp = Math.min(...validTemps);
    const avgTemp = validTemps.reduce((a, b) => a + b, 0) / validTemps.length;

    // 热点检测：超过平均温度 + 2σ 的区域
    const variance = validTemps.reduce((a, b) => a + (b - avgTemp) ** 2, 0) / validTemps.length;
    const stdDev = Math.sqrt(variance);
    const hotspotThreshold = avgTemp + 2 * stdDev;
    const hotspotCount = validTemps.filter(t => t > hotspotThreshold).length;

    return {
      max_temperature: round(maxTemp, 1),
      min_temperature: round(minTemp, 1),
      avg_temperature: round(avgTemp, 1),
      thermal_range: round(maxTemp - minTemp, 1),
      thermal_std_dev: round(stdDev, 2),
      hotspot_count: hotspotCount,
      hotspot_threshold: round(hotspotThreshold, 1),
    };
  }

  /**
   * 调用外部推理服务进行缺陷检测
   * 降级策略：推理服务不可用时返回 null
   */
  private async callInferenceService(
    raw: RawTelemetryMessage
  ): Promise<Record<string, number | string | boolean> | null> {
    // 检查推理服务可用性
    if (!this.inferenceAvailable) {
      const now = Date.now();
      if (now - this.lastInferenceCheck < this.inferenceCheckIntervalMs) {
        return null; // 仍在冷却期
      }
      this.lastInferenceCheck = now;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.inferenceTimeoutMs);

      const response = await fetch(`${this.inferenceUrl}/v2/models/defect_detector/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: [{
            name: 'image_ref',
            shape: [1],
            datatype: 'BYTES',
            data: [raw.metadata?.media_ref],
          }],
          parameters: {
            device_code: raw.device_code,
            mp_code: raw.mp_code,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`推理服务返回 ${response.status}`);
      }

      const result = await response.json() as {
        outputs?: Array<{
          name: string;
          data: number[];
        }>;
        model_name?: string;
        model_version?: string;
      };

      this.inferenceAvailable = true;

      // 解析推理结果
      const features: Record<string, number | string | boolean> = {};

      if (result.outputs) {
        for (const output of result.outputs) {
          if (output.name === 'defect_count') {
            features.defect_count = output.data[0] || 0;
          } else if (output.name === 'defect_confidence') {
            features.defect_confidence = round(output.data[0] || 0, 4);
          } else if (output.name === 'change_score') {
            features.change_score = round(output.data[0] || 0, 4);
          }
        }
      }

      if (result.model_name) features.model_name = result.model_name;
      if (result.model_version) features.model_version = result.model_version;
      if (raw.metadata?.media_ref) features.media_ref = raw.metadata.media_ref;

      return Object.keys(features).length > 0 ? features : null;

    } catch (error) {
      if (!this.inferenceAvailable) {
        // 已经知道不可用，静默降级
      } else {
        log.warn(`[VisualExtractor] 推理服务调用失败，降级为仅热成像分析:`, error);
        this.inferenceAvailable = false;
        this.lastInferenceCheck = Date.now();
      }
      return null;
    }
  }
}

function round(val: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

export default VisualExtractor;
