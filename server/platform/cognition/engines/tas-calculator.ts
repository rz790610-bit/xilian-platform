/**
 * ============================================================================
 * TAS 综合保证分数计算器 — Total Assurance Score
 * ============================================================================
 *
 * 三维综合评分：
 *   TAS = w1 × McNemar_Score + w2 × DS_Fusion_Score + w3 × MonteCarlo_Score
 *
 * 默认权重：McNemar 30% + DS 融合 40% + Monte Carlo 30%
 *
 * 输出决策：
 *   TAS >= 0.7  → PROMOTE（直接晋升）
 *   TAS >= 0.4  → CANARY_EXTENDED（延长金丝雀观察）
 *   TAS < 0.4   → REJECT（拒绝）
 *
 * 来源：v3.0 方案 U-17 增强，融合 Grok L6 的 TAS 理念
 *
 * 设计原则：
 *   - 纯计算函数，无外部 IO
 *   - 所有统计方法有明确的数学基础
 *   - 配置驱动阈值和权重
 */

import { createModuleLogger } from '../../../core/logger';
import type { ShadowEvalConfig, ShadowEvalResult } from '../types';

const log = createModuleLogger('tasCalculator');

// ============================================================================
// McNemar 检验
// ============================================================================

/**
 * McNemar 检验输入 — 2×2 列联表
 *
 *                  Champion 正确    Champion 错误
 * Challenger 正确      a                b
 * Challenger 错误      c                d
 *
 * 检验统计量：χ² = (|b - c| - 1)² / (b + c)
 * 自由度 = 1
 */
export interface McNemarInput {
  /** Challenger 正确 & Champion 正确 */
  a: number;
  /** Challenger 正确 & Champion 错误 */
  b: number;
  /** Challenger 错误 & Champion 正确 */
  c: number;
  /** Challenger 错误 & Champion 错误 */
  d: number;
}

export interface McNemarResult {
  statistic: number;
  pValue: number;
  significant: boolean;
  challengerBetter: boolean;
}

/**
 * 执行 McNemar 检验
 *
 * @param input 2×2 列联表
 * @param alpha 显著性水平（默认 0.05）
 */
export function mcNemarTest(input: McNemarInput, alpha: number = 0.05): McNemarResult {
  const { b, c } = input;
  const discordant = b + c;

  if (discordant === 0) {
    // 无不一致样本 → 无法判断差异
    return {
      statistic: 0,
      pValue: 1.0,
      significant: false,
      challengerBetter: false,
    };
  }

  // McNemar 检验统计量（带 Yates 连续性校正）
  const statistic = ((Math.abs(b - c) - 1) ** 2) / discordant;

  // 近似 p 值（基于卡方分布 df=1）
  // 使用 Wilson-Hilferty 近似
  const pValue = chiSquaredPValue(statistic, 1);

  return {
    statistic,
    pValue,
    significant: pValue < alpha,
    challengerBetter: b > c, // b > c 表示 Challenger 在 Champion 错误的样本上更多正确
  };
}

// ============================================================================
// Monte Carlo 鲁棒性评估
// ============================================================================

export interface MonteCarloInput {
  /** Challenger 模型在各切片上的准确率 */
  challengerAccuracies: number[];
  /** Champion 模型在各切片上的准确率 */
  championAccuracies: number[];
  /** 扰动次数 */
  runs: number;
  /** 扰动幅度 [0, 1] */
  perturbationMagnitude: number;
}

export interface MonteCarloResult {
  /** Challenger 在扰动下的平均准确率 */
  challengerMeanAccuracy: number;
  /** Challenger 在扰动下的准确率标准差 */
  challengerStdAccuracy: number;
  /** Champion 在扰动下的平均准确率 */
  championMeanAccuracy: number;
  /** Champion 在扰动下的准确率标准差 */
  championStdAccuracy: number;
  /** Challenger 优于 Champion 的比例 */
  challengerWinRate: number;
  /** 鲁棒性评分 [0, 1] */
  robustnessScore: number;
}

/**
 * Monte Carlo 鲁棒性评估
 *
 * 对准确率数据施加随机扰动，评估模型在噪声条件下的稳定性。
 * 使用确定性种子的伪随机数生成器确保可复现性。
 */
export function monteCarloRobustness(input: MonteCarloInput): MonteCarloResult {
  const { challengerAccuracies, championAccuracies, runs, perturbationMagnitude } = input;

  if (challengerAccuracies.length === 0 || championAccuracies.length === 0) {
    return {
      challengerMeanAccuracy: 0,
      challengerStdAccuracy: 0,
      championMeanAccuracy: 0,
      championStdAccuracy: 0,
      challengerWinRate: 0,
      robustnessScore: 0,
    };
  }

  // 使用简单的线性同余生成器（确定性种子）
  let seed = 42;
  const nextRandom = (): number => {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const challengerResults: number[] = [];
  const championResults: number[] = [];
  let challengerWins = 0;

  for (let run = 0; run < runs; run++) {
    // 对每个切片的准确率施加高斯扰动
    let challengerSum = 0;
    for (const acc of challengerAccuracies) {
      const noise = (nextRandom() - 0.5) * 2 * perturbationMagnitude;
      challengerSum += Math.max(0, Math.min(1, acc + noise));
    }
    const challengerAvg = challengerSum / challengerAccuracies.length;
    challengerResults.push(challengerAvg);

    let championSum = 0;
    for (const acc of championAccuracies) {
      const noise = (nextRandom() - 0.5) * 2 * perturbationMagnitude;
      championSum += Math.max(0, Math.min(1, acc + noise));
    }
    const championAvg = championSum / championAccuracies.length;
    championResults.push(championAvg);

    if (challengerAvg > championAvg) {
      challengerWins++;
    }
  }

  const challengerMean = mean(challengerResults);
  const challengerStd = std(challengerResults);
  const championMean = mean(championResults);
  const championStd = std(championResults);

  // 鲁棒性评分：Challenger 胜率 × (1 - Challenger 波动性)
  const challengerWinRate = challengerWins / runs;
  const volatility = challengerStd / (challengerMean || 1);
  const robustnessScore = challengerWinRate * Math.max(0, 1 - volatility);

  return {
    challengerMeanAccuracy: challengerMean,
    challengerStdAccuracy: challengerStd,
    championMeanAccuracy: championMean,
    championStdAccuracy: championStd,
    challengerWinRate,
    robustnessScore: Math.max(0, Math.min(1, robustnessScore)),
  };
}

// ============================================================================
// TAS 综合计算
// ============================================================================

export interface TASInput {
  /** McNemar 检验结果 */
  mcNemar: McNemarResult;
  /** DS 融合证据评分 [0, 1] */
  dsFusionScore: number;
  /** Monte Carlo 鲁棒性结果 */
  monteCarlo: MonteCarloResult;
  /** 权重配置 */
  weights: ShadowEvalConfig['tasWeights'];
}

export interface TASOutput {
  /** TAS 综合分数 [0, 1] */
  score: number;
  /** 各维度得分 */
  components: {
    mcNemarScore: number;
    dsFusionScore: number;
    monteCarloScore: number;
  };
  /** 决策 */
  decision: 'PROMOTE' | 'CANARY_EXTENDED' | 'REJECT';
  /** 决策理由 */
  reason: string;
}

/**
 * 计算 TAS 综合保证分数
 */
export function calculateTAS(input: TASInput): TASOutput {
  const { mcNemar, dsFusionScore, monteCarlo, weights } = input;

  // McNemar 得分：显著且 Challenger 更好 → 1.0；显著但 Challenger 更差 → 0.0；不显著 → 0.5
  let mcNemarScore: number;
  if (mcNemar.significant) {
    mcNemarScore = mcNemar.challengerBetter ? 1.0 : 0.0;
  } else {
    // 不显著时，根据 p 值给出渐变分数
    mcNemarScore = 0.5 + (mcNemar.challengerBetter ? 0.1 : -0.1) * (1 - mcNemar.pValue);
  }

  // Monte Carlo 得分
  const monteCarloScore = monteCarlo.robustnessScore;

  // 加权求和
  const score = weights.mcNemar * mcNemarScore +
                weights.dsFusion * dsFusionScore +
                weights.monteCarlo * monteCarloScore;

  // 确保在 [0, 1] 范围
  const clampedScore = Math.max(0, Math.min(1, score));

  // 决策
  let decision: TASOutput['decision'];
  let reason: string;

  if (clampedScore >= 0.7) {
    decision = 'PROMOTE';
    reason = `TAS=${clampedScore.toFixed(3)} >= 0.7，Challenger 通过综合评估，建议直接晋升。` +
      ` McNemar=${mcNemarScore.toFixed(2)}(p=${mcNemar.pValue.toFixed(4)})，` +
      `DS融合=${dsFusionScore.toFixed(2)}，` +
      `MC鲁棒性=${monteCarloScore.toFixed(2)}(胜率${(monteCarlo.challengerWinRate * 100).toFixed(1)}%)`;
  } else if (clampedScore >= 0.4) {
    decision = 'CANARY_EXTENDED';
    reason = `TAS=${clampedScore.toFixed(3)} ∈ [0.4, 0.7)，Challenger 表现尚可但不够确定，建议延长金丝雀观察。` +
      ` McNemar=${mcNemarScore.toFixed(2)}(p=${mcNemar.pValue.toFixed(4)})，` +
      `DS融合=${dsFusionScore.toFixed(2)}，` +
      `MC鲁棒性=${monteCarloScore.toFixed(2)}(胜率${(monteCarlo.challengerWinRate * 100).toFixed(1)}%)`;
  } else {
    decision = 'REJECT';
    reason = `TAS=${clampedScore.toFixed(3)} < 0.4，Challenger 未通过综合评估，建议拒绝。` +
      ` McNemar=${mcNemarScore.toFixed(2)}(p=${mcNemar.pValue.toFixed(4)})，` +
      `DS融合=${dsFusionScore.toFixed(2)}，` +
      `MC鲁棒性=${monteCarloScore.toFixed(2)}(胜率${(monteCarlo.challengerWinRate * 100).toFixed(1)}%)`;
  }

  log.info({
    score: clampedScore,
    decision,
    mcNemarScore,
    dsFusionScore,
    monteCarloScore,
  }, 'TAS calculated');

  return {
    score: clampedScore,
    components: { mcNemarScore, dsFusionScore, monteCarloScore },
    decision,
    reason,
  };
}

// ============================================================================
// 统计工具函数
// ============================================================================

/** 卡方分布 p 值近似（Wilson-Hilferty 方法） */
function chiSquaredPValue(x: number, df: number): number {
  if (x <= 0) return 1.0;
  if (df <= 0) return 1.0;

  // 使用正态近似
  const z = ((x / df) ** (1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  return 1 - normalCDF(z);
}

/** 标准正态分布 CDF 近似（Abramowitz and Stegun） */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

/** 数组均值 */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** 数组标准差 */
function std(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}
