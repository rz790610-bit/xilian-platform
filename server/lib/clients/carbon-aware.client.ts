/**
 * Carbon-Aware 调度客户端
 *
 * 集成 WattTime API 获取电网碳强度数据，
 * 为 Dojo Training Scheduler 提供低碳窗口调度能力。
 *
 * 降级策略：当 WattTime API 不可用时，使用基于时间规则的启发式调度。
 */

import { createModuleLogger } from '../../core/logger';
import appConfig from '../../core/config';

const log = createModuleLogger('carbon-aware');

// ============================================================
// 类型定义
// ============================================================

export interface CarbonWindow {
  start: Date;
  end: Date;
  avgCarbonIntensity: number; // gCO2/kWh
  region: string;
  source: 'watttime' | 'heuristic';
}

export interface CarbonIntensityPoint {
  timestamp: Date;
  intensity: number; // gCO2/kWh
  region: string;
}

interface WattTimeConfig {
  apiUrl: string;
  username: string;
  password: string;
  region: string;
  timeoutMs: number;
}

// ============================================================
// WattTime 客户端
// ============================================================

export class CarbonAwareClient {
  private config: WattTimeConfig;
  private authToken: string | null = null;
  private tokenExpiry = 0;

  constructor(config?: Partial<WattTimeConfig>) {
    this.config = {
      apiUrl: process.env.WATTTIME_API_URL || 'https://api.watttime.org/v3',
      username: process.env.WATTTIME_USERNAME || '',
      password: process.env.WATTTIME_PASSWORD || '',
      region: process.env.WATTTIME_REGION || 'CAISO_NORTH',
      timeoutMs: 10_000,
      ...config,
    };
  }

  /**
   * 获取指定时长的最低碳排放窗口
   *
   * @param durationMs 训练任务持续时间（毫秒）
   * @param lookAheadHours 向前搜索的小时数，默认 24
   * @returns 最优低碳窗口
   */
  async findLowCarbonWindow(durationMs: number, lookAheadHours = 24): Promise<CarbonWindow> {
    try {
      const forecast = await this.getForecast(lookAheadHours);
      if (forecast.length === 0) {
        log.warn('碳强度预测数据为空，降级到启发式调度');
        return this.heuristicWindow(durationMs);
      }

      return this.findOptimalWindow(forecast, durationMs);
    } catch (error) {
      log.warn('WattTime API 调用失败，降级到启发式调度:', error);
      return this.heuristicWindow(durationMs);
    }
  }

  /**
   * 获取当前碳强度
   */
  async getCurrentIntensity(): Promise<CarbonIntensityPoint> {
    try {
      const token = await this.authenticate();
      const response = await this.httpGet(`${this.config.apiUrl}/signal-index`, {
        region: this.config.region,
        signal_type: 'co2_moer',
      }, token);

      return {
        timestamp: new Date(),
        intensity: response.data?.[0]?.value ?? 400,
        region: this.config.region,
      };
    } catch {
      // 降级：返回中等碳强度
      return {
        timestamp: new Date(),
        intensity: 400,
        region: this.config.region,
      };
    }
  }

  // ==========================================================================
  // 内部方法
  // ==========================================================================

  private async getForecast(hours: number): Promise<CarbonIntensityPoint[]> {
    if (!this.config.username || !this.config.password) {
      log.info('WattTime 未配置凭证，使用启发式预测');
      return this.heuristicForecast(hours);
    }

    const token = await this.authenticate();
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + hours * 3600_000);

    const response = await this.httpGet(`${this.config.apiUrl}/forecast`, {
      region: this.config.region,
      signal_type: 'co2_moer',
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    }, token);

    if (!response.data || !Array.isArray(response.data)) {
      return this.heuristicForecast(hours);
    }

    return response.data.map((point: any) => ({
      timestamp: new Date(point.point_time),
      intensity: point.value,
      region: this.config.region,
    }));
  }

  /**
   * 启发式碳强度预测
   * 基于典型电网模式：凌晨 2-6 点碳强度最低（风电占比高），
   * 下午 4-8 点碳强度最高（天然气调峰）
   */
  private heuristicForecast(hours: number): CarbonIntensityPoint[] {
    const points: CarbonIntensityPoint[] = [];
    const now = Date.now();

    for (let h = 0; h < hours; h++) {
      const ts = new Date(now + h * 3600_000);
      const hour = ts.getUTCHours();

      // 碳强度曲线模型（gCO2/kWh）
      let intensity: number;
      if (hour >= 2 && hour < 6) {
        intensity = 200 + (hour - 2) * 15; // 低谷：200-260
      } else if (hour >= 6 && hour < 10) {
        intensity = 260 + (hour - 6) * 40; // 上升：260-420
      } else if (hour >= 10 && hour < 16) {
        intensity = 350 + (hour - 10) * 10; // 中等：350-410（太阳能补偿）
      } else if (hour >= 16 && hour < 20) {
        intensity = 420 + (hour - 16) * 30; // 高峰：420-540
      } else if (hour >= 20 && hour < 24) {
        intensity = 540 - (hour - 20) * 50; // 下降：540-340
      } else {
        intensity = 340 - hour * 70; // 深夜：340-200
      }

      points.push({ timestamp: ts, intensity: Math.max(150, intensity), region: this.config.region });
    }

    return points;
  }

  /**
   * 在预测序列中找到最优低碳窗口
   */
  private findOptimalWindow(forecast: CarbonIntensityPoint[], durationMs: number): CarbonWindow {
    const durationHours = Math.ceil(durationMs / 3600_000);
    if (forecast.length < durationHours) {
      return {
        start: forecast[0]?.timestamp || new Date(),
        end: new Date((forecast[0]?.timestamp || new Date()).getTime() + durationMs),
        avgCarbonIntensity: forecast.reduce((s, p) => s + p.intensity, 0) / (forecast.length || 1),
        region: this.config.region,
        source: forecast.length > 0 ? 'watttime' : 'heuristic',
      };
    }

    let bestStart = 0;
    let bestAvg = Infinity;

    // 滑动窗口找最低平均碳强度
    let windowSum = 0;
    for (let i = 0; i < durationHours; i++) {
      windowSum += forecast[i].intensity;
    }

    let currentAvg = windowSum / durationHours;
    if (currentAvg < bestAvg) {
      bestAvg = currentAvg;
      bestStart = 0;
    }

    for (let i = durationHours; i < forecast.length; i++) {
      windowSum += forecast[i].intensity - forecast[i - durationHours].intensity;
      currentAvg = windowSum / durationHours;
      if (currentAvg < bestAvg) {
        bestAvg = currentAvg;
        bestStart = i - durationHours + 1;
      }
    }

    return {
      start: forecast[bestStart].timestamp,
      end: new Date(forecast[bestStart].timestamp.getTime() + durationMs),
      avgCarbonIntensity: Math.round(bestAvg * 100) / 100,
      region: this.config.region,
      source: this.config.username ? 'watttime' : 'heuristic',
    };
  }

  /**
   * 启发式窗口（无预测数据时的降级方案）
   */
  private heuristicWindow(durationMs: number): CarbonWindow {
    const now = new Date();
    const currentHour = now.getUTCHours();

    // 找到下一个凌晨 2 点
    let targetHour = 2;
    let hoursUntilTarget = (targetHour - currentHour + 24) % 24;
    if (hoursUntilTarget === 0 && currentHour !== targetHour) hoursUntilTarget = 24;

    const start = new Date(now.getTime() + hoursUntilTarget * 3600_000);
    start.setMinutes(0, 0, 0);

    return {
      start,
      end: new Date(start.getTime() + durationMs),
      avgCarbonIntensity: 220, // 凌晨低谷估计值
      region: this.config.region,
      source: 'heuristic',
    };
  }

  // ==========================================================================
  // HTTP 工具
  // ==========================================================================

  private async authenticate(): Promise<string> {
    if (this.authToken && Date.now() < this.tokenExpiry) {
      return this.authToken;
    }

    if (!this.config.username || !this.config.password) {
      throw new Error('WattTime 凭证未配置');
    }

    const response = await this.httpGet(`${this.config.apiUrl}/login`, {}, undefined, {
      username: this.config.username,
      password: this.config.password,
    });

    this.authToken = response.token;
    this.tokenExpiry = Date.now() + 25 * 60_000; // 25 分钟有效
    return this.authToken!;
  }

  private async httpGet(
    url: string,
    params: Record<string, string>,
    token?: string,
    basicAuth?: { username: string; password: string },
  ): Promise<any> {
    const queryString = new URLSearchParams(params).toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (basicAuth) {
      headers['Authorization'] = `Basic ${Buffer.from(`${basicAuth.username}:${basicAuth.password}`).toString('base64')}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(fullUrl, { headers, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}

// 单例导出
export const carbonAwareClient = new CarbonAwareClient();
