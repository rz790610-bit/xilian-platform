/**
 * ============================================================================
 * CarbonAwareClient — WattTime API 碳强度预测客户端
 * ============================================================================
 *
 * 接入 WattTime v3 API 获取实时碳强度数据和未来预测，
 * 为 Dojo 训练调度器提供碳感知决策依据。
 *
 * 核心能力：
 *   1. getToken() — OAuth2 认证获取访问令牌
 *   2. getForecast() — 获取未来 N 小时碳强度预测
 *   3. getOptimalTrainingWindow() — 计算最优训练时间窗口
 *   4. 内置缓存 + 降级策略
 *
 * 架构位置: server/platform/evolution/
 * 依赖: evolution.config.ts (CarbonAwareConfig)
 */

import { createModuleLogger } from '../../core/logger';
import { evolutionConfig } from './evolution.config';

const log = createModuleLogger('carbon-aware-client');

// ============================================================================
// 类型定义
// ============================================================================

/** WattTime 碳强度预测数据点 */
export interface CarbonForecastPoint {
  /** 时间点 (ISO 8601) */
  pointTime: string;
  /** 碳强度值 (lbs CO2/MWh) */
  value: number;
  /** 数据版本 */
  version: string;
}

/** 碳强度预测结果 */
export interface CarbonForecast {
  /** 区域标识 */
  region: string;
  /** 信号类型 */
  signalType: string;
  /** 预测数据点 */
  data: CarbonForecastPoint[];
  /** 获取时间 */
  generatedAt: number;
}

/** 最优训练窗口 */
export interface OptimalTrainingWindow {
  /** 推荐开始时间 (ISO 8601) */
  startTime: string;
  /** 推荐结束时间 (ISO 8601) */
  endTime: string;
  /** 该窗口的平均碳强度 (gCO2/kWh) */
  avgCarbonIntensity: number;
  /** 当前碳强度 (gCO2/kWh) */
  currentIntensity: number;
  /** 是否建议立即训练 */
  trainNow: boolean;
  /** 预计节省的碳排放百分比 */
  savingsPercent: number;
}

// ============================================================================
// CarbonAwareClient
// ============================================================================

export class CarbonAwareClient {
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private forecastCache: CarbonForecast | null = null;
  private forecastCacheExpiresAt = 0;

  /**
   * 获取 WattTime API 访问令牌
   */
  async getToken(): Promise<string> {
    const cfg = evolutionConfig.carbonAware;

    // 检查缓存令牌
    if (this.token && Date.now() < this.tokenExpiresAt) {
      return this.token;
    }

    if (!cfg.username || !cfg.password) {
      throw new Error('WattTime 凭据未配置（WATTTIME_USERNAME / WATTTIME_PASSWORD）');
    }

    try {
      const response = await fetch(`${cfg.apiBaseUrl}/login`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}`,
        },
      });

      if (!response.ok) {
        throw new Error(`WattTime 认证失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { token: string };
      this.token = data.token;
      // 令牌有效期 30 分钟，提前 5 分钟刷新
      this.tokenExpiresAt = Date.now() + 25 * 60 * 1000;

      log.debug('WattTime 令牌获取成功');
      return this.token;
    } catch (error) {
      log.error('WattTime 令牌获取失败', { error });
      throw error;
    }
  }

  /**
   * 获取碳强度预测数据
   *
   * @param region 电网区域（默认 CAISO_NORTH — 加州北部）
   * @param horizonHours 预测窗口（小时）
   */
  async getForecast(
    region = 'CAISO_NORTH',
    horizonHours?: number,
  ): Promise<CarbonForecast> {
    const cfg = evolutionConfig.carbonAware;
    const horizon = horizonHours ?? cfg.forecastHorizonHours;

    // 检查缓存
    if (this.forecastCache && Date.now() < this.forecastCacheExpiresAt) {
      return this.forecastCache;
    }

    try {
      const token = await this.getToken();

      const response = await fetch(
        `${cfg.apiBaseUrl}/forecast?region=${region}&signal_type=co2_moer&horizon_hours=${horizon}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`WattTime 预测获取失败: ${response.status} ${response.statusText}`);
      }

      const rawData = await response.json() as {
        data: Array<{ point_time: string; value: number; version: string }>;
        meta: { region: string; signal_type: string };
      };

      const forecast: CarbonForecast = {
        region: rawData.meta?.region || region,
        signalType: rawData.meta?.signal_type || 'co2_moer',
        data: (rawData.data || []).map(d => ({
          pointTime: d.point_time,
          value: d.value,
          version: d.version,
        })),
        generatedAt: Date.now(),
      };

      // 更新缓存
      this.forecastCache = forecast;
      this.forecastCacheExpiresAt = Date.now() + cfg.cacheTtlMs;

      log.debug('WattTime 碳强度预测获取成功', {
        region,
        dataPoints: forecast.data.length,
        horizonHours: horizon,
      });

      return forecast;
    } catch (error) {
      log.error('WattTime 碳强度预测获取失败', { error });
      throw error;
    }
  }

  /**
   * 计算最优训练时间窗口
   *
   * 在未来 N 小时内找到碳强度最低的连续时段，
   * 用于 Dojo 训练调度器的碳感知决策。
   *
   * @param trainingDurationHours 预计训练时长（小时）
   * @param region 电网区域
   */
  async getOptimalTrainingWindow(
    trainingDurationHours = 2,
    region = 'CAISO_NORTH',
  ): Promise<OptimalTrainingWindow> {
    const cfg = evolutionConfig.carbonAware;

    // 如果碳感知未启用，返回"立即训练"
    if (!cfg.enabled) {
      return this.createFallbackWindow(trainingDurationHours);
    }

    try {
      const forecast = await this.getForecast(region);

      if (forecast.data.length === 0) {
        log.warn('碳强度预测数据为空，使用降级策略');
        return this.createFallbackWindow(trainingDurationHours);
      }

      // 当前碳强度
      const currentIntensity = this.lbsToGrams(forecast.data[0].value);

      // 滑动窗口找最优时段
      const windowSize = Math.max(1, Math.ceil(trainingDurationHours * 12)); // 5分钟粒度
      let bestStart = 0;
      let bestAvg = Infinity;

      for (let i = 0; i <= forecast.data.length - windowSize; i++) {
        const windowSlice = forecast.data.slice(i, i + windowSize);
        const avg = windowSlice.reduce((sum, d) => sum + d.value, 0) / windowSlice.length;
        if (avg < bestAvg) {
          bestAvg = avg;
          bestStart = i;
        }
      }

      const bestWindow = forecast.data.slice(bestStart, bestStart + windowSize);
      const avgCarbonIntensity = this.lbsToGrams(bestAvg);

      // 计算节省百分比
      const overallAvg = forecast.data.reduce((s, d) => s + d.value, 0) / forecast.data.length;
      const savingsPercent = overallAvg > 0
        ? Math.max(0, ((overallAvg - bestAvg) / overallAvg) * 100)
        : 0;

      const result: OptimalTrainingWindow = {
        startTime: bestWindow[0]?.pointTime || new Date().toISOString(),
        endTime: bestWindow[bestWindow.length - 1]?.pointTime || new Date().toISOString(),
        avgCarbonIntensity,
        currentIntensity,
        trainNow: currentIntensity <= cfg.carbonThreshold,
        savingsPercent: Math.round(savingsPercent * 10) / 10,
      };

      log.info('最优训练窗口计算完成', {
        startTime: result.startTime,
        avgCarbonIntensity: result.avgCarbonIntensity,
        currentIntensity: result.currentIntensity,
        trainNow: result.trainNow,
        savingsPercent: result.savingsPercent,
      });

      return result;
    } catch (error) {
      log.warn('碳感知计算失败，使用降级策略', { error: String(error) });
      return this.createFallbackWindow(trainingDurationHours);
    }
  }

  /**
   * 获取当前碳强度（gCO2/kWh）
   * 用于替换 world-model-engine.ts 中的 estimateCarbon() 硬编码
   */
  async getCurrentIntensity(region = 'CAISO_NORTH'): Promise<number> {
    try {
      const forecast = await this.getForecast(region);
      if (forecast.data.length > 0) {
        return this.lbsToGrams(forecast.data[0].value);
      }
    } catch {
      // 降级到时间段估算
    }
    return this.estimateCarbonByTimeOfDay();
  }

  // ========================================================================
  // 内部工具
  // ========================================================================

  /** lbs CO2/MWh → gCO2/kWh */
  private lbsToGrams(lbsPerMWh: number): number {
    return Math.round(lbsPerMWh * 0.4536);
  }

  /** 基于时间段的碳强度估算（降级策略） */
  private estimateCarbonByTimeOfDay(): number {
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 6) return 280;  // 夜间低谷
    if (hour >= 9 && hour < 17) return 520;   // 白天高峰
    return 420; // 过渡时段
  }

  /** 创建降级窗口（碳感知不可用时） */
  private createFallbackWindow(durationHours: number): OptimalTrainingWindow {
    const now = new Date();
    const end = new Date(now.getTime() + durationHours * 3600 * 1000);
    const currentIntensity = this.estimateCarbonByTimeOfDay();

    return {
      startTime: now.toISOString(),
      endTime: end.toISOString(),
      avgCarbonIntensity: currentIntensity,
      currentIntensity,
      trainNow: true,
      savingsPercent: 0,
    };
  }
}

/** 全局单例 */
export const carbonAwareClient = new CarbonAwareClient();
