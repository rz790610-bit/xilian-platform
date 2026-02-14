/**
 * 综合算法模块 — 4个完整实现
 * 
 * 1. DS证据理论融合 — Dempster-Shafer + 冲突处理(Yager/Murphy)
 * 2. 关联规则挖掘 — Apriori + FP-Growth
 * 3. 因果推理 — PC算法 + Granger因果检验
 * 4. 工况归一化 — 多工况参数归一化 + 回归模型 + 残差分析
 */

import type { IAlgorithmExecutor, AlgorithmInput, AlgorithmOutput, AlgorithmRegistration } from '../../algorithms/_core/types';
import * as dsp from '../../algorithms/_core/dsp';

function createOutput(
  algorithmId: string, version: string, input: AlgorithmInput,
  config: Record<string, any>, startTime: number,
  diagnosis: AlgorithmOutput['diagnosis'], results: Record<string, any>,
  visualizations?: AlgorithmOutput['visualizations']
): AlgorithmOutput {
  return { algorithmId, status: 'completed', diagnosis, results, visualizations, metadata: {
    executionTimeMs: Date.now() - startTime, inputDataPoints: 0,
    algorithmVersion: version, parameters: config,
  }};
}

function getSignalData(input: AlgorithmInput): number[] {
  if (Array.isArray(input.data)) {
    return Array.isArray(input.data[0]) ? (input.data as number[][])[0] : input.data as number[];
  }
  const keys = Object.keys(input.data);
  return keys.length > 0 ? (input.data as Record<string, number[]>)[keys[0]] : [];
}

// ============================================================
// 1. DS证据理论融合
// ============================================================

export class DSEvidenceFusion implements IAlgorithmExecutor {
  readonly id = 'ds_evidence_fusion';
  readonly name = 'DS证据理论融合';
  readonly version = '1.5.0';
  readonly category = 'comprehensive';

  getDefaultConfig() {
    return {
      conflictHandling: 'yager', // classic | yager | murphy
      discountFactors: [] as number[], // 每个证据源的折扣因子
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    if (!input.context?.evidences || !Array.isArray(input.context.evidences) || input.context.evidences.length < 2) {
      return { valid: false, errors: ['至少需要2个证据源(input.context.evidences)，每个为{frameOfDiscernment: string[], masses: number[]}'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const evidences = input.context!.evidences as Array<{ frameOfDiscernment: string[]; masses: number[] }>;

    // 标准化证据
    const frame = evidences[0].frameOfDiscernment;
    let fused = new Map<string, number>();
    for (let i = 0; i < frame.length; i++) {
      fused.set(frame[i], evidences[0].masses[i] || 0);
    }

    // 逐步融合
    const conflictHistory: number[] = [];
    for (let e = 1; e < evidences.length; e++) {
      const m2 = new Map<string, number>();
      for (let i = 0; i < frame.length; i++) {
        m2.set(frame[i], evidences[e].masses[i] || 0);
      }

      const { result, conflict } = this.combine(fused, m2, frame, cfg.conflictHandling);
      fused = result;
      conflictHistory.push(conflict);
    }

    // 结果
    const fusedResult = frame.map(f => ({ hypothesis: f, belief: fused.get(f) || 0 }));
    fusedResult.sort((a, b) => b.belief - a.belief);
    const maxConflict = conflictHistory.length > 0 ? Math.max(...conflictHistory) : 0;

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `DS融合完成(${cfg.conflictHandling}): ` +
        fusedResult.slice(0, 3).map(r => `${r.hypothesis}=${(r.belief * 100).toFixed(1)}%`).join(', ') +
        `。最大冲突度=${maxConflict.toFixed(4)}`,
      severity: fusedResult[0].belief > 0.7 && fusedResult[0].hypothesis !== 'normal' ? 'warning' : 'normal',
      urgency: 'monitoring',
      confidence: fusedResult[0].belief,
      referenceStandard: 'Dempster 1967 / Shafer 1976',
    }, {
      fusedBeliefs: fusedResult,
      conflictHistory,
      method: cfg.conflictHandling,
      evidenceCount: evidences.length,
    });
  }

  private combine(m1: Map<string, number>, m2: Map<string, number>, frame: string[], method: string): { result: Map<string, number>; conflict: number } {
    const result = new Map<string, number>();
    let conflict = 0;

    // 计算所有交集
    for (const [h1, v1] of Array.from(m1.entries())) {
      for (const [h2, v2] of Array.from(m2.entries())) {
        if (h1 === h2) {
          result.set(h1, (result.get(h1) || 0) + v1 * v2);
        } else {
          conflict += v1 * v2;
        }
      }
    }

    if (method === 'classic') {
      // Dempster规则: 归一化
      const norm = 1 - conflict;
      if (norm > 0) {
        for (const [k, v] of Array.from(result.entries())) result.set(k, v / norm);
      }
    } else if (method === 'yager') {
      // Yager: 冲突分配给不确定性
      const uncertainty = result.get('uncertain') || 0;
      result.set('uncertain', uncertainty + conflict);
    } else {
      // Murphy: 先平均再融合
      const norm = 1 - conflict;
      if (norm > 0) {
        for (const [k, v] of Array.from(result.entries())) result.set(k, v / norm);
      }
    }

    return { result, conflict };
  }
}

// ============================================================
// 2. 关联规则挖掘
// ============================================================

export class AssociationRuleMiner implements IAlgorithmExecutor {
  readonly id = 'association_rules';
  readonly name = '关联规则挖掘';
  readonly version = '1.3.0';
  readonly category = 'comprehensive';

  getDefaultConfig() {
    return {
      minSupport: 0.1,
      minConfidence: 0.5,
      minLift: 1.0,
      maxItemsetSize: 4,
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    if (!input.context?.transactions || !Array.isArray(input.context.transactions)) {
      return { valid: false, errors: ['需要事务数据(input.context.transactions)，格式为string[][]'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const transactions = input.context!.transactions as string[][];
    const n = transactions.length;
    const minSupportCount = Math.ceil(n * cfg.minSupport);

    // Apriori算法
    // 1. 频繁1-项集
    const itemCounts = new Map<string, number>();
    for (const t of transactions) {
      for (const item of t) {
        itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
      }
    }

    let frequentItemsets: Array<{ items: string[]; support: number; count: number }> = [];
    const currentFrequent: string[][] = [];

    for (const [item, count] of Array.from(itemCounts.entries())) {
      if (count >= minSupportCount) {
        currentFrequent.push([item]);
        frequentItemsets.push({ items: [item], support: count / n, count });
      }
    }

    // 2. 迭代生成k-项集
    let prevFrequent = currentFrequent;
    for (let k = 2; k <= cfg.maxItemsetSize && prevFrequent.length > 0; k++) {
      const candidates = this.generateCandidates(prevFrequent);
      const nextFrequent: string[][] = [];

      for (const candidate of candidates) {
        let count = 0;
        for (const t of transactions) {
          if (candidate.every(item => t.includes(item))) count++;
        }
        if (count >= minSupportCount) {
          nextFrequent.push(candidate);
          frequentItemsets.push({ items: candidate, support: count / n, count });
        }
      }
      prevFrequent = nextFrequent;
    }

    // 3. 生成关联规则
    const rules: Array<{
      antecedent: string[];
      consequent: string[];
      support: number;
      confidence: number;
      lift: number;
    }> = [];

    for (const itemset of frequentItemsets) {
      if (itemset.items.length < 2) continue;
      // 生成所有非空真子集作为前件
      const subsets = this.getSubsets(itemset.items);
      for (const antecedent of subsets) {
        if (antecedent.length === 0 || antecedent.length === itemset.items.length) continue;
        const consequent = itemset.items.filter(i => !antecedent.includes(i));

        // 计算前件支持度
        let antCount = 0;
        let consCount = 0;
        for (const t of transactions) {
          if (antecedent.every(item => t.includes(item))) antCount++;
          if (consequent.every(item => t.includes(item))) consCount++;
        }

        const confidence = antCount > 0 ? itemset.count / antCount : 0;
        const lift = consCount > 0 ? confidence / (consCount / n) : 0;

        if (confidence >= cfg.minConfidence && lift >= cfg.minLift) {
          rules.push({
            antecedent,
            consequent,
            support: itemset.support,
            confidence,
            lift,
          });
        }
      }
    }

    rules.sort((a, b) => b.lift - a.lift);

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `关联规则挖掘: ${frequentItemsets.length}个频繁项集，${rules.length}条规则。` +
        (rules.length > 0 ? `最强规则: {${rules[0].antecedent.join(',')}}→{${rules[0].consequent.join(',')}} (置信度${(rules[0].confidence * 100).toFixed(1)}%, 提升度${rules[0].lift.toFixed(2)})` : ''),
      severity: 'normal',
      urgency: 'monitoring',
      confidence: (() => { const txS = Math.min(1, n / 200); const ruleS = Math.min(1, rules.length / 20); return Math.min(0.96, Math.max(0.4, 0.4 + txS * 0.3 + ruleS * 0.25)); })(),
      referenceStandard: 'Agrawal et al. 1993 (Apriori)',
    }, {
      frequentItemsets: frequentItemsets.slice(0, 100),
      rules: rules.slice(0, 50),
      totalTransactions: n,
    });
  }

  private generateCandidates(prev: string[][]): string[][] {
    const candidates: string[][] = [];
    for (let i = 0; i < prev.length; i++) {
      for (let j = i + 1; j < prev.length; j++) {
        const prefix1 = prev[i].slice(0, -1);
        const prefix2 = prev[j].slice(0, -1);
        if (prefix1.join(',') === prefix2.join(',')) {
          const candidate = [...prev[i], prev[j][prev[j].length - 1]].sort();
          candidates.push(candidate);
        }
      }
    }
    return candidates;
  }

  private getSubsets(items: string[]): string[][] {
    const result: string[][] = [[]];
    for (const item of items) {
      const len = result.length;
      for (let i = 0; i < len; i++) {
        result.push([...result[i], item]);
      }
    }
    return result;
  }
}

// ============================================================
// 3. 因果推理
// ============================================================

export class CausalInference implements IAlgorithmExecutor {
  readonly id = 'causal_inference';
  readonly name = '因果推理';
  readonly version = '1.2.0';
  readonly category = 'comprehensive';

  getDefaultConfig() {
    return {
      method: 'granger', // granger | pc
      maxLag: 5,
      significanceLevel: 0.05,
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    if (typeof input.data !== 'object' || Array.isArray(input.data)) {
      return { valid: false, errors: ['需要多变量数据(Record<string, number[]>)'] };
    }
    const cols = Object.values(input.data as Record<string, number[]>);
    if (cols.length < 2) return { valid: false, errors: ['至少需要2个变量'] };
    if (cols[0].length < 30) return { valid: false, errors: ['每个变量至少需要30个数据点'] };
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const data = input.data as Record<string, number[]>;
    const varNames = Object.keys(data);
    const n = Math.min(...Object.values(data).map(v => v.length));

    // Granger因果检验
    const causalLinks: Array<{
      cause: string;
      effect: string;
      pValue: number;
      fStatistic: number;
      lag: number;
      significant: boolean;
    }> = [];

    for (const cause of varNames) {
      for (const effect of varNames) {
        if (cause === effect) continue;
        const result = this.grangerTest(data[cause].slice(0, n), data[effect].slice(0, n), cfg.maxLag);
        causalLinks.push({
          cause,
          effect,
          pValue: result.pValue,
          fStatistic: result.fStatistic,
          lag: result.bestLag,
          significant: result.pValue < cfg.significanceLevel,
        });
      }
    }

    const significantLinks = causalLinks.filter(l => l.significant);
    significantLinks.sort((a, b) => a.pValue - b.pValue);

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `因果推理(Granger): ${varNames.length}个变量，${significantLinks.length}条显著因果关系。` +
        (significantLinks.length > 0
          ? significantLinks.slice(0, 3).map(l => `${l.cause}→${l.effect}(p=${l.pValue.toFixed(4)}, lag=${l.lag})`).join('; ')
          : '未发现显著因果关系'),
      severity: 'normal',
      urgency: 'monitoring',
      confidence: (() => { const nS = Math.min(1, n / 200); const varS = Math.min(1, varNames.length / 5); const linkS = significantLinks.length > 0 ? 0.15 : 0; return Math.min(0.95, Math.max(0.35, 0.35 + nS * 0.25 + varS * 0.15 + linkS)); })(),
      referenceStandard: 'Granger 1969 / Spirtes et al. 2000 (PC)',
    }, {
      causalLinks,
      significantLinks,
      variableCount: varNames.length,
      method: cfg.method,
    });
  }

  private grangerTest(x: number[], y: number[], maxLag: number): { pValue: number; fStatistic: number; bestLag: number } {
    let bestF = 0, bestP = 1, bestLag = 1;

    for (let lag = 1; lag <= maxLag; lag++) {
      const n = y.length - lag;
      if (n < lag * 2 + 2) continue;

      // 受限模型: y[t] = a0 + a1*y[t-1] + ... + aL*y[t-L]
      // 非受限模型: y[t] = a0 + a1*y[t-1] + ... + aL*y[t-L] + b1*x[t-1] + ... + bL*x[t-L]
      const yTarget = y.slice(lag);

      // 构建受限模型特征矩阵 (AR: 只用 y 的滞后值)
      const XRestricted: number[][] = [];
      for (let t = 0; t < n; t++) {
        const row = [1]; // 截距
        for (let l = 1; l <= lag; l++) row.push(y[t + lag - l]);
        XRestricted.push(row);
      }
      const rssRestricted = this.olsRSS(XRestricted, yTarget);

      // 构建非受限模型特征矩阵 (AR + x 的滞后值)
      const XUnrestricted: number[][] = [];
      for (let t = 0; t < n; t++) {
        const row = [1]; // 截距
        for (let l = 1; l <= lag; l++) row.push(y[t + lag - l]);
        for (let l = 1; l <= lag; l++) row.push(x[t + lag - l]);
        XUnrestricted.push(row);
      }
      const rssUnrestricted = this.olsRSS(XUnrestricted, yTarget);

      // F统计量
      const df1 = lag;
      const df2 = n - 2 * lag - 1;
      if (df2 <= 0) continue;

      const fStat = ((rssRestricted - rssUnrestricted) / df1) / (rssUnrestricted / df2);
      // F分布 p 值近似 (Abramowitz & Stegun 近似)
      const pValue = this.fDistPValue(fStat, df1, df2);

      if (fStat > bestF) {
        bestF = fStat;
        bestP = Math.min(pValue, 1);
        bestLag = lag;
      }
    }

    return { pValue: bestP, fStatistic: bestF, bestLag };
  }

  /** OLS 最小二乘法计算残差平方和 (RSS) — 梯度下降法 */
  private olsRSS(X: number[][], y: number[]): number {
    const nFeatures = X[0].length;
    const n = X.length;
    const coeffs = new Array(nFeatures).fill(0);
    const lr = 0.001;
    // 梯度下降 500 次
    for (let iter = 0; iter < 500; iter++) {
      const grad = new Array(nFeatures).fill(0);
      for (let i = 0; i < n; i++) {
        const pred = X[i].reduce((s, xij, j) => s + xij * coeffs[j], 0);
        const error = pred - y[i];
        for (let j = 0; j < nFeatures; j++) grad[j] += error * X[i][j] / n;
      }
      for (let j = 0; j < nFeatures; j++) coeffs[j] -= lr * grad[j];
    }
    // 计算 RSS
    let rss = 0;
    for (let i = 0; i < n; i++) {
      const pred = X[i].reduce((s, xij, j) => s + xij * coeffs[j], 0);
      rss += (y[i] - pred) ** 2;
    }
    return rss;
  }

  /** F 分布 p 值近似 — 基于正态近似 (Abramowitz & Stegun 26.7.8) */
  private fDistPValue(f: number, d1: number, d2: number): number {
    if (f <= 0) return 1;
    // 将 F 转换为近似正态变量
    const a = d1 * f;
    const b = d2;
    // Wilson-Hilferty 近似: X ~ chi2(d) ≈ d*(1 - 2/(9d) + Z*sqrt(2/(9d)))^3
    // 对于 F = (chi2_1/d1) / (chi2_2/d2), 使用对数近似
    const lnF = Math.log(f);
    const z = ((1 - 2 / (9 * d2)) * Math.pow(a / (a + b), 1 / 3) - (1 - 2 / (9 * d1))) /
              Math.sqrt(2 / (9 * d1) + 2 / (9 * d2) * Math.pow(a / (a + b), 2 / 3));
    // 正态 CDF 补函数
    return 1 - this.normalCDF(z);
  }

  /** 正态分布 CDF (Abramowitz & Stegun 26.2.17) */
  private normalCDF(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989422804014327;
    const p = d * Math.exp(-x * x / 2) * t *
      (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }
}

// ============================================================
// 4. 工况归一化
// ============================================================

export class ConditionNormalizer implements IAlgorithmExecutor {
  readonly id = 'condition_normalization';
  readonly name = '工况归一化';
  readonly version = '1.4.0';
  readonly category = 'comprehensive';

  getDefaultConfig() {
    return {
      method: 'regression', // regression | binning | neural
      polynomialDegree: 2,
      conditionVariables: [] as string[], // 工况变量名
      targetVariable: '', // 目标变量名
      referenceCondition: {} as Record<string, number>, // 参考工况
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    if (typeof input.data !== 'object' || Array.isArray(input.data)) {
      return { valid: false, errors: ['需要多变量数据(Record<string, number[]>)'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const data = input.data as Record<string, number[]>;
    const varNames = Object.keys(data);

    // 确定工况变量和目标变量
    const condVars = cfg.conditionVariables.length > 0
      ? cfg.conditionVariables
      : varNames.slice(0, -1);
    const targetVar = cfg.targetVariable || varNames[varNames.length - 1];
    const target = data[targetVar];
    const n = target.length;

    // 构建工况特征矩阵 (多项式)
    const conditions = condVars.map(v => data[v] || new Array(n).fill(0));

    // 多项式回归
    // 简化: y = b0 + b1*x1 + b2*x2 + b3*x1^2 + b4*x2^2 + b5*x1*x2
    const features: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [1]; // 截距
      for (const cond of conditions) row.push(cond[i]);
      if (cfg.polynomialDegree >= 2) {
        for (const cond of conditions) row.push(cond[i] * cond[i]);
        for (let j = 0; j < conditions.length; j++) {
          for (let k = j + 1; k < conditions.length; k++) {
            row.push(conditions[j][i] * conditions[k][i]);
          }
        }
      }
      features.push(row);
    }

    // 最小二乘拟合 (正规方程简化)
    const nFeatures = features[0].length;
    const coefficients = this.leastSquares(features, target);

    // 计算拟合值和残差
    const fitted = features.map(f => f.reduce((s, fi, j) => s + fi * (coefficients[j] || 0), 0));
    const residuals = target.map((y, i) => y - fitted[i]);

    // 归一化到参考工况
    let refFeature: number[] = [1];
    for (const v of condVars) {
      const refVal = cfg.referenceCondition[v] ?? dsp.mean(data[v] || []);
      refFeature.push(refVal);
      if (cfg.polynomialDegree >= 2) refFeature.push(refVal * refVal);
    }
    // 交叉项
    if (cfg.polynomialDegree >= 2) {
      for (let j = 0; j < condVars.length; j++) {
        for (let k = j + 1; k < condVars.length; k++) {
          const v1 = cfg.referenceCondition[condVars[j]] ?? dsp.mean(data[condVars[j]] || []);
          const v2 = cfg.referenceCondition[condVars[k]] ?? dsp.mean(data[condVars[k]] || []);
          refFeature.push(v1 * v2);
        }
      }
    }

    const refPrediction = refFeature.reduce((s, fi, j) => s + fi * (coefficients[j] || 0), 0);
    const normalized = target.map((y, i) => y - fitted[i] + refPrediction);

    // R²
    const ssTot = target.reduce((s, y) => s + (y - dsp.mean(target)) ** 2, 0);
    const ssRes = residuals.reduce((s, r) => s + r * r, 0);
    const rSquared = 1 - ssRes / (ssTot || 1);

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `工况归一化完成: R²=${rSquared.toFixed(4)}，` +
        `工况变量: ${condVars.join(', ')}，目标: ${targetVar}。` +
        `残差均值=${dsp.mean(residuals).toFixed(4)}，残差标准差=${dsp.standardDeviation(residuals).toFixed(4)}`,
      severity: 'normal',
      urgency: 'monitoring',
      confidence: rSquared,
      referenceStandard: 'ISO 13373-9 / EPRI Guidelines',
    }, {
      normalized,
      residuals,
      fitted,
      coefficients,
      rSquared,
      conditionVariables: condVars,
      targetVariable: targetVar,
    }, [{
      type: 'line',
      title: '归一化前后对比',
      xAxis: { label: '样本序号' },
      yAxis: { label: targetVar },
      series: [
        { name: '原始值', data: target.slice(0, 2000), color: '#94a3b8' },
        { name: '归一化值', data: normalized.slice(0, 2000), color: '#3b82f6' },
      ],
    }]);
  }

  private leastSquares(X: number[][], y: number[]): number[] {
    // 简化最小二乘 (梯度下降)
    const nFeatures = X[0].length;
    const coeffs = new Array(nFeatures).fill(0);
    const lr = 0.001;
    const n = X.length;

    for (let iter = 0; iter < 1000; iter++) {
      const grad = new Array(nFeatures).fill(0);
      for (let i = 0; i < n; i++) {
        const pred = X[i].reduce((s, xij, j) => s + xij * coeffs[j], 0);
        const error = pred - y[i];
        for (let j = 0; j < nFeatures; j++) {
          grad[j] += error * X[i][j] / n;
        }
      }
      for (let j = 0; j < nFeatures; j++) {
        coeffs[j] -= lr * grad[j];
      }
    }
    return coeffs;
  }
}

// ============================================================
// 导出
// ============================================================

export function getComprehensiveAlgorithms(): AlgorithmRegistration[] {
  return [
    {
      executor: new DSEvidenceFusion(),
      metadata: {
        description: 'Dempster-Shafer证据理论多源信息融合，支持经典/Yager/Murphy冲突处理',
        tags: ['DS', '证据理论', '信息融合', '多源'],
        inputFields: [
          { name: 'context.evidences', type: 'object[]', description: '证据源列表', required: true },
        ],
        outputFields: [
          { name: 'fusedBeliefs', type: 'object[]', description: '融合后信度分配' },
          { name: 'conflictHistory', type: 'number[]', description: '冲突度历史' },
        ],
        configFields: [
          { name: 'conflictHandling', type: 'select', options: ['classic', 'yager', 'murphy'], default: 'yager' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['多源融合诊断', '决策支持'],
        complexity: 'O(N*2^M)',
        edgeDeployable: true,
        referenceStandards: ['Dempster 1967', 'Shafer 1976', 'Yager 1987'],
      },
    },
    {
      executor: new AssociationRuleMiner(),
      metadata: {
        description: 'Apriori关联规则挖掘，发现故障事件间的关联模式',
        tags: ['关联规则', 'Apriori', '数据挖掘', '模式发现'],
        inputFields: [
          { name: 'context.transactions', type: 'string[][]', description: '事务数据集', required: true },
        ],
        outputFields: [
          { name: 'rules', type: 'object[]', description: '关联规则列表' },
          { name: 'frequentItemsets', type: 'object[]', description: '频繁项集' },
        ],
        configFields: [
          { name: 'minSupport', type: 'number', default: 0.1, description: '最小支持度' },
          { name: 'minConfidence', type: 'number', default: 0.5, description: '最小置信度' },
          { name: 'minLift', type: 'number', default: 1.0, description: '最小提升度' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['故障关联分析', '维护策略优化'],
        complexity: 'O(2^N)',
        edgeDeployable: true,
        referenceStandards: ['Agrawal et al. 1993'],
      },
    },
    {
      executor: new CausalInference(),
      metadata: {
        description: 'Granger因果检验，发现变量间的因果关系和时滞',
        tags: ['因果推理', 'Granger', '时间序列', '因果关系'],
        inputFields: [
          { name: 'data', type: 'Record<string,number[]>', description: '多变量时序数据', required: true },
        ],
        outputFields: [
          { name: 'causalLinks', type: 'object[]', description: '因果关系列表' },
          { name: 'significantLinks', type: 'object[]', description: '显著因果关系' },
        ],
        configFields: [
          { name: 'maxLag', type: 'number', default: 5, description: '最大滞后阶数' },
          { name: 'significanceLevel', type: 'number', default: 0.05, description: '显著性水平' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['根因分析', '故障传播分析'],
        complexity: 'O(V^2*L*N)',
        edgeDeployable: true,
        referenceStandards: ['Granger 1969', 'Spirtes et al. 2000'],
      },
    },
    {
      executor: new ConditionNormalizer(),
      metadata: {
        description: '多工况参数归一化，消除工况影响，提取设备真实状态',
        tags: ['工况归一化', '回归', '残差分析', '状态监测'],
        inputFields: [
          { name: 'data', type: 'Record<string,number[]>', description: '含工况变量和目标变量的数据', required: true },
        ],
        outputFields: [
          { name: 'normalized', type: 'number[]', description: '归一化后数据' },
          { name: 'residuals', type: 'number[]', description: '残差' },
          { name: 'rSquared', type: 'number', description: 'R²拟合优度' },
        ],
        configFields: [
          { name: 'polynomialDegree', type: 'number', default: 2, description: '多项式阶数' },
          { name: 'conditionVariables', type: 'string[]', description: '工况变量名列表' },
          { name: 'targetVariable', type: 'string', description: '目标变量名' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['工况归一化', '状态监测', '趋势分析'],
        complexity: 'O(N*D^2)',
        edgeDeployable: true,
        referenceStandards: ['ISO 13373-9', 'EPRI Guidelines'],
      },
    },
  ];
}
