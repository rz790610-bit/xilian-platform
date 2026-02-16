/**
 * 统一异常检测引擎 v1.0
 * 
 * 整合 streamProcessor.service.ts、kafkaStream.processor.ts、flinkProcessor.ts
 * 三处重复的异常检测逻辑为单一权威实现。
 * 
 * 支持算法：Z-Score、IQR、MAD
 * 支持模式：单点检测、滑动窗口检测、批量检测
 */

// ============ 类型定义 ============

export interface AnomalyDetectionResult {
  isAnomaly: boolean;
  score: number;
  deviation: number;
  algorithm: AnomalyAlgorithm;
  threshold: number;
  mean: number;
  stdDev: number;
  severity: AnomalySeverity;
}

export type AnomalyAlgorithm = 'zscore' | 'iqr' | 'mad';
export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SlidingWindowConfig {
  /** 窗口大小（毫秒） */
  windowSizeMs: number;
  /** 滑动步长（毫秒） */
  slideSizeMs: number;
  /** 最小数据点数（低于此数不检测） */
  minDataPoints: number;
}

export interface AnomalyEngineConfig {
  /** 使用的算法列表（按优先级） */
  algorithms: AnomalyAlgorithm[];
  /** Z-Score 阈值（默认 3.0） */
  zscoreThreshold: number;
  /** IQR 乘数（默认 1.5） */
  iqrMultiplier: number;
  /** MAD 阈值（默认 3.5） */
  madThreshold: number;
  /** 滑动窗口配置 */
  window: SlidingWindowConfig;
}

export interface DataPoint {
  value: number;
  timestamp: number;
  deviceId?: string;
  sensorId?: string;
  metricName?: string;
  metadata?: Record<string, unknown>;
}

export interface WindowState {
  points: DataPoint[];
  startTime: number;
  endTime: number;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: AnomalyEngineConfig = {
  algorithms: ['zscore'],
  zscoreThreshold: 3.0,
  iqrMultiplier: 1.5,
  madThreshold: 3.5,
  window: {
    windowSizeMs: 60000,   // 1 分钟
    slideSizeMs: 10000,    // 10 秒
    minDataPoints: 10,
  },
};

// ============ 核心检测算法 ============

/**
 * Z-Score 异常检测
 * 计算当前值偏离均值的标准差倍数
 */
export function detectZScore(
  currentValue: number,
  mean: number,
  stdDev: number,
  threshold: number = 3.0
): AnomalyDetectionResult {
  if (stdDev === 0) {
    return {
      isAnomaly: false,
      score: 0,
      deviation: currentValue - mean,
      algorithm: 'zscore',
      threshold,
      mean,
      stdDev,
      severity: 'low',
    };
  }

  const zScore = Math.abs((currentValue - mean) / stdDev);
  const deviation = currentValue - mean;

  return {
    isAnomaly: zScore > threshold,
    score: zScore,
    deviation,
    algorithm: 'zscore',
    threshold,
    mean,
    stdDev,
    severity: determineSeverity(zScore),
  };
}

/**
 * IQR (四分位距) 异常检测
 * 基于数据分布的稳健统计方法
 */
export function detectIQR(
  currentValue: number,
  values: number[],
  multiplier: number = 1.5
): AnomalyDetectionResult {
  if (values.length < 4) {
    return {
      isAnomaly: false,
      score: 0,
      deviation: 0,
      algorithm: 'iqr',
      threshold: multiplier,
      mean: 0,
      stdDev: 0,
      severity: 'low',
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const iqr = q3 - q1;
  const lowerBound = q1 - multiplier * iqr;
  const upperBound = q3 + multiplier * iqr;
  const median = sorted[Math.floor(n * 0.5)];
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  const isAnomaly = currentValue < lowerBound || currentValue > upperBound;
  const deviation = currentValue - median;
  const score = iqr > 0 ? Math.abs(deviation) / iqr : 0;

  return {
    isAnomaly,
    score,
    deviation,
    algorithm: 'iqr',
    threshold: multiplier,
    mean,
    stdDev,
    severity: determineSeverity(score),
  };
}

/**
 * MAD (中位数绝对偏差) 异常检测
 * 对离群值更稳健的方法
 */
export function detectMAD(
  currentValue: number,
  values: number[],
  threshold: number = 3.5
): AnomalyDetectionResult {
  if (values.length < 3) {
    return {
      isAnomaly: false,
      score: 0,
      deviation: 0,
      algorithm: 'mad',
      threshold,
      mean: 0,
      stdDev: 0,
      severity: 'low',
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const median = sorted[Math.floor(n / 2)];
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  const absoluteDeviations = values.map(v => Math.abs(v - median));
  const sortedDeviations = [...absoluteDeviations].sort((a, b) => a - b);
  const mad = sortedDeviations[Math.floor(sortedDeviations.length / 2)];

  if (mad === 0) {
    return {
      isAnomaly: false,
      score: 0,
      deviation: currentValue - median,
      algorithm: 'mad',
      threshold,
      mean,
      stdDev,
      severity: 'low',
    };
  }

  const modifiedZScore = 0.6745 * (currentValue - median) / mad;
  const score = Math.abs(modifiedZScore);
  const deviation = currentValue - median;

  return {
    isAnomaly: score > threshold,
    score,
    deviation,
    algorithm: 'mad',
    threshold,
    mean,
    stdDev,
    severity: determineSeverity(score),
  };
}

// ============ 辅助函数 ============

/**
 * 根据异常分数确定严重程度
 * 统一的严重程度判定标准
 */
export function determineSeverity(score: number): AnomalySeverity {
  if (score >= 5) return 'critical';
  if (score >= 4) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

/**
 * 计算基础统计量
 */
export function computeStats(values: number[]): {
  mean: number;
  stdDev: number;
  variance: number;
  min: number;
  max: number;
  median: number;
  count: number;
} {
  const n = values.length;
  if (n === 0) {
    return { mean: 0, stdDev: 0, variance: 0, min: 0, max: 0, median: 0, count: 0 };
  }

  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  const sorted = [...values].sort((a, b) => a - b);

  return {
    mean,
    stdDev,
    variance,
    min: sorted[0],
    max: sorted[n - 1],
    median: sorted[Math.floor(n / 2)],
    count: n,
  };
}

// ============ 统一异常检测引擎 ============

/**
 * 统一异常检测引擎
 * 
 * 提供单点检测和滑动窗口检测两种模式，
 * 所有流处理模块（StreamProcessor、KafkaStreamProcessor、AnomalyDetector）
 * 应统一使用此引擎进行异常检测。
 */
export class UnifiedAnomalyEngine {
  private config: AnomalyEngineConfig;
  private windows: Map<string, WindowState> = new Map();

  constructor(config?: Partial<AnomalyEngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (config?.window) {
      this.config.window = { ...DEFAULT_CONFIG.window, ...config.window };
    }
  }

  /**
   * 单点检测 — 给定当前值和历史统计量
   */
  detectPoint(
    currentValue: number,
    values: number[],
    algorithm?: AnomalyAlgorithm
  ): AnomalyDetectionResult {
    const algo = algorithm || this.config.algorithms[0] || 'zscore';

    switch (algo) {
      case 'iqr':
        return detectIQR(currentValue, values, this.config.iqrMultiplier);
      case 'mad':
        return detectMAD(currentValue, values, this.config.madThreshold);
      case 'zscore':
      default: {
        const stats = computeStats(values);
        return detectZScore(currentValue, stats.mean, stats.stdDev, this.config.zscoreThreshold);
      }
    }
  }

  /**
   * 多算法融合检测 — 使用所有配置的算法，任一触发即为异常
   */
  detectMulti(
    currentValue: number,
    values: number[]
  ): { results: AnomalyDetectionResult[]; isAnomaly: boolean; maxScore: number; severity: AnomalySeverity } {
    const results = this.config.algorithms.map(algo =>
      this.detectPoint(currentValue, values, algo)
    );

    const isAnomaly = results.some(r => r.isAnomaly);
    const maxScore = Math.max(...results.map(r => r.score), 0);

    return {
      results,
      isAnomaly,
      maxScore,
      severity: determineSeverity(maxScore),
    };
  }

  /**
   * 滑动窗口检测 — 自动管理窗口状态
   * @param key  窗口键（通常是 deviceId:sensorId:metricName）
   * @param point 数据点
   */
  detectWithWindow(
    key: string,
    point: DataPoint,
    algorithm?: AnomalyAlgorithm
  ): AnomalyDetectionResult | null {
    // 添加到窗口
    this.addToWindow(key, point);

    // 获取窗口数据
    const window = this.windows.get(key);
    if (!window || window.points.length < this.config.window.minDataPoints) {
      return null; // 数据不足
    }

    const values = window.points.map(p => p.value);
    return this.detectPoint(point.value, values, algorithm);
  }

  /**
   * 添加数据点到窗口
   */
  addToWindow(key: string, point: DataPoint): void {
    const now = point.timestamp || Date.now();

    if (!this.windows.has(key)) {
      this.windows.set(key, {
        points: [],
        startTime: now - this.config.window.windowSizeMs,
        endTime: now,
      });
    }

    const window = this.windows.get(key)!;
    window.points.push(point);
    window.endTime = now;

    // 清理过期数据
    const cutoffTime = now - this.config.window.windowSizeMs;
    window.points = window.points.filter(p => p.timestamp >= cutoffTime);
    window.startTime = cutoffTime;
  }

  /**
   * 滑动所有窗口（清理过期数据）
   */
  slideWindows(): { evictedKeys: string[]; totalPoints: number } {
    const now = Date.now();
    const cutoffTime = now - this.config.window.windowSizeMs;
    const evictedKeys: string[] = [];
    let totalPoints = 0;

    for (const [key, window] of Array.from(this.windows.entries())) {
      window.points = window.points.filter((p: DataPoint) => p.timestamp >= cutoffTime);
      window.startTime = cutoffTime;
      window.endTime = now;
      totalPoints += window.points.length;

      if (window.points.length === 0) {
        this.windows.delete(key);
        evictedKeys.push(key);
      }
    }

    return { evictedKeys, totalPoints };
  }

  /**
   * 获取窗口状态
   */
  getWindow(key: string): WindowState | undefined {
    return this.windows.get(key);
  }

  /**
   * 获取所有窗口的统计信息
   */
  getWindowStats(): { windowCount: number; totalPoints: number; keys: string[] } {
    let totalPoints = 0;
    const keys: string[] = [];
    for (const [key, window] of Array.from(this.windows.entries())) {
      totalPoints += window.points.length;
      keys.push(key);
    }
    return { windowCount: this.windows.size, totalPoints, keys };
  }

  /**
   * 清除所有窗口
   */
  clearWindows(): void {
    this.windows.clear();
  }

  /**
   * 获取当前配置
   */
  getConfig(): AnomalyEngineConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AnomalyEngineConfig>): void {
    Object.assign(this.config, config);
    if (config.window) {
      this.config.window = { ...this.config.window, ...config.window };
    }
  }
}

// ============ 默认单例 ============

export const anomalyEngine = new UnifiedAnomalyEngine();
