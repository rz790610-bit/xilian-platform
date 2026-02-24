/**
 * 统计工具库
 *
 * 提供 KL 散度、JS 散度、熵、t-digest 近似分位数等算法，
 * 用于仿真引擎保真度计算、FSD Metrics 分位数统计等场景。
 */

// ============================================================
// 1. 信息论度量
// ============================================================

/**
 * KL 散度 D_KL(P || Q)
 * P 和 Q 必须是归一化的概率分布（和为 1）
 * 当 Q[i] 接近 0 但 P[i] > 0 时，使用平滑处理避免 log(0)
 *
 * @param p 真实分布
 * @param q 近似分布
 * @param smoothing 拉普拉斯平滑系数，默认 1e-10
 * @returns [0, +∞)，0 表示两个分布完全一致
 */
export function klDivergence(p: number[], q: number[], smoothing = 1e-10): number {
  if (p.length !== q.length || p.length === 0) return Infinity;

  // 归一化
  const sumP = p.reduce((a, b) => a + b, 0) || 1;
  const sumQ = q.reduce((a, b) => a + b, 0) || 1;

  let kl = 0;
  for (let i = 0; i < p.length; i++) {
    const pi = p[i] / sumP + smoothing;
    const qi = q[i] / sumQ + smoothing;
    kl += pi * Math.log(pi / qi);
  }

  return Math.max(0, kl);
}

/**
 * JS 散度（Jensen-Shannon Divergence）— KL 散度的对称版本
 * @returns [0, ln(2)]，0 表示完全一致
 */
export function jsDivergence(p: number[], q: number[]): number {
  if (p.length !== q.length || p.length === 0) return Math.LN2;

  const sumP = p.reduce((a, b) => a + b, 0) || 1;
  const sumQ = q.reduce((a, b) => a + b, 0) || 1;

  const m = p.map((_, i) => (p[i] / sumP + q[i] / sumQ) / 2);
  const pNorm = p.map(v => v / sumP);
  const qNorm = q.map(v => v / sumQ);

  return (klDivergence(pNorm, m) + klDivergence(qNorm, m)) / 2;
}

/**
 * 信息熵 H(P)
 */
export function entropy(p: number[]): number {
  const sum = p.reduce((a, b) => a + b, 0) || 1;
  let h = 0;
  for (const v of p) {
    const pi = v / sum;
    if (pi > 0) h -= pi * Math.log2(pi);
  }
  return h;
}

// ============================================================
// 2. 分布比较
// ============================================================

/**
 * 将连续数值数组转换为直方图概率分布
 * @param values 原始数值
 * @param bins 分桶数量
 * @returns 归一化的概率分布
 */
export function toHistogram(values: number[], bins: number = 20): number[] {
  if (values.length === 0) return Array(bins).fill(1 / bins);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const hist = Array(bins).fill(0);

  for (const v of values) {
    const idx = Math.min(Math.floor(((v - min) / range) * bins), bins - 1);
    hist[idx]++;
  }

  const total = values.length;
  return hist.map(h => h / total);
}

/**
 * 基于 KL 散度的分布保真度评分
 * 将两组数值转换为直方图后计算 KL 散度，再映射到 [0, 1]
 *
 * @returns [0, 1]，1 表示完全保真
 */
export function distributionFidelity(actual: number[], expected: number[], bins = 20): number {
  const pHist = toHistogram(expected, bins);
  const qHist = toHistogram(actual, bins);
  const kl = klDivergence(pHist, qHist);
  // 使用 sigmoid 映射：kl=0 → 1.0，kl=1 → 0.73，kl=5 → 0.007
  return 1 / (1 + kl);
}

// ============================================================
// 3. T-Digest 近似分位数（简化版）
// ============================================================

/**
 * 简化版 T-Digest，用于高频指标的近似分位数计算
 * 避免全量排序的 O(n log n) 开销
 *
 * 基于 Centroid 聚合，支持 add() 和 quantile() 操作
 */
interface Centroid {
  mean: number;
  count: number;
}

export class TDigest {
  private centroids: Centroid[] = [];
  private totalCount = 0;
  private readonly compression: number;
  private readonly maxCentroids: number;
  private buffer: number[] = [];
  private readonly bufferSize: number;

  constructor(compression = 100) {
    this.compression = compression;
    this.maxCentroids = Math.ceil(compression * Math.PI / 2);
    this.bufferSize = Math.max(this.maxCentroids * 5, 500);
  }

  /**
   * 添加一个观测值
   */
  add(value: number, count = 1): void {
    this.buffer.push(value);
    this.totalCount += count;

    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }
  }

  /**
   * 查询分位数
   * @param q 分位数 [0, 1]，例如 0.5 表示中位数，0.99 表示 P99
   */
  quantile(q: number): number {
    this.flush();

    if (this.centroids.length === 0) return 0;
    if (this.centroids.length === 1) return this.centroids[0].mean;
    if (q <= 0) return this.centroids[0].mean;
    if (q >= 1) return this.centroids[this.centroids.length - 1].mean;

    const targetCount = q * this.totalCount;
    let cumCount = 0;

    for (let i = 0; i < this.centroids.length; i++) {
      const c = this.centroids[i];
      const nextCum = cumCount + c.count;

      if (nextCum >= targetCount) {
        // 线性插值
        if (i === 0) return c.mean;
        const prev = this.centroids[i - 1];
        const fraction = (targetCount - cumCount) / c.count;
        return prev.mean + (c.mean - prev.mean) * fraction;
      }

      cumCount = nextCum;
    }

    return this.centroids[this.centroids.length - 1].mean;
  }

  /**
   * 获取当前总观测数
   */
  count(): number {
    return this.totalCount;
  }

  /**
   * 重置
   */
  reset(): void {
    this.centroids = [];
    this.totalCount = 0;
    this.buffer = [];
  }

  private flush(): void {
    if (this.buffer.length === 0) return;

    // 将 buffer 转为 centroids
    const newCentroids: Centroid[] = this.buffer.map(v => ({ mean: v, count: 1 }));
    this.centroids = this.mergeCentroids([...this.centroids, ...newCentroids]);
    this.buffer = [];
  }

  private mergeCentroids(input: Centroid[]): Centroid[] {
    if (input.length === 0) return [];

    // 按 mean 排序
    input.sort((a, b) => a.mean - b.mean);

    const merged: Centroid[] = [{ ...input[0] }];

    for (let i = 1; i < input.length; i++) {
      const last = merged[merged.length - 1];
      const current = input[i];

      // 基于 compression 参数决定是否合并
      const q = (last.count / 2 + current.count / 2) / this.totalCount;
      const maxSize = 4 * this.totalCount * q * (1 - q) / this.compression;

      if (last.count + current.count <= Math.max(maxSize, 1)) {
        // 合并
        const totalCount = last.count + current.count;
        last.mean = (last.mean * last.count + current.mean * current.count) / totalCount;
        last.count = totalCount;
      } else {
        merged.push({ ...current });
      }
    }

    // 如果超过最大 centroid 数，强制合并
    while (merged.length > this.maxCentroids) {
      let minGap = Infinity;
      let minIdx = 0;
      for (let i = 0; i < merged.length - 1; i++) {
        const gap = merged[i + 1].mean - merged[i].mean;
        if (gap < minGap) {
          minGap = gap;
          minIdx = i;
        }
      }
      const a = merged[minIdx];
      const b = merged[minIdx + 1];
      const total = a.count + b.count;
      a.mean = (a.mean * a.count + b.mean * b.count) / total;
      a.count = total;
      merged.splice(minIdx + 1, 1);
    }

    return merged;
  }
}

// ============================================================
// 4. 描述性统计
// ============================================================

export interface DescriptiveStats {
  mean: number;
  std: number;
  min: number;
  max: number;
  median: number;
  p95: number;
  p99: number;
  count: number;
}

/**
 * 计算描述性统计
 */
export function descriptiveStats(values: number[]): DescriptiveStats {
  if (values.length === 0) {
    return { mean: 0, std: 0, min: 0, max: 0, median: 0, p95: 0, p99: 0, count: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / n;

  return {
    mean,
    std: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[n - 1],
    median: sorted[Math.floor(n / 2)],
    p95: sorted[Math.floor(n * 0.95)],
    p99: sorted[Math.floor(n * 0.99)],
    count: n,
  };
}

// ============================================================
// 5. 趋势检测
// ============================================================

/**
 * 简单线性回归斜率 — 用于趋势检测
 * @returns 正值表示上升趋势，负值表示下降趋势
 */
export function linearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-12) return 0;

  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * 趋势分类
 */
export function classifyTrend(
  values: number[],
  improvingThreshold = -0.001,
  degradingThreshold = 0.001,
): 'improving' | 'stable' | 'degrading' {
  const slope = linearRegressionSlope(values);
  if (slope < improvingThreshold) return 'improving';
  if (slope > degradingThreshold) return 'degrading';
  return 'stable';
}
