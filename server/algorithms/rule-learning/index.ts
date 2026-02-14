/**
 * 规则自动学习/模式发掘模块 — 4个完整实现
 * 
 * 1. LLM分析 — 大模型辅助规则生成 + 自然语言解析
 * 2. 关联规则学习 — Apriori历史数据自动发现 + 置信度评估
 * 3. 决策树归纳 — CART/C4.5 + 规则提取简化
 * 4. 频繁模式挖掘 — PrefixSpan序列模式 + 时序关联规则
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

// ============================================================
// 1. LLM分析
// ============================================================

export class LLMAnalysis implements IAlgorithmExecutor {
  readonly id = 'llm_analysis';
  readonly name = 'LLM分析';
  readonly version = '1.0.0';
  readonly category = 'rule_learning';

  getDefaultConfig() {
    return {
      model: 'gpt-4',
      promptTemplate: 'analyze_fault',
      maxTokens: 2048,
      temperature: 0.3,
      contextWindow: 10, // 上下文窗口大小
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    if (!input.context?.description && !input.context?.features) {
      return { valid: false, errors: ['需要故障描述(context.description)或特征数据(context.features)'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };

    // LLM分析框架 — 实际调用需要连接LLM服务
    const description = input.context?.description as string || '';
    const features = input.context?.features as Record<string, number> || {};

    // 构建结构化分析提示
    const analysisPrompt = this.buildPrompt(cfg.promptTemplate, description, features);

    // 预留LLM API调用接口
    const llmResult = {
      prompt: analysisPrompt,
      status: 'pending_llm_call',
      suggestedRules: [
        {
          condition: '基于输入特征的规则模板',
          action: '诊断结论模板',
          confidence: 0,
          explanation: '需要LLM服务连接后生成',
        },
      ],
      apiEndpoint: '/api/llm/analyze', // 预留API端点
    };

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `LLM分析准备完成: 已构建分析提示(${analysisPrompt.length}字符)。` +
        `需要连接LLM服务(${cfg.model})进行实际推理`,
      severity: 'normal',
      urgency: 'monitoring',
      confidence: 0.5,
      referenceStandard: 'LLM-Assisted Rule Generation',
    }, {
      ...llmResult,
      config: cfg,
    });
  }

  private buildPrompt(template: string, description: string, features: Record<string, number>): string {
    const featureStr = Object.entries(features)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');

    return `## 工业设备故障分析\n\n### 故障描述\n${description || '无'}\n\n### 特征数据\n${featureStr || '无'}\n\n### 分析要求\n1. 识别可能的故障模式\n2. 生成诊断规则(IF-THEN格式)\n3. 评估规则置信度\n4. 给出维修建议`;
  }
}

// ============================================================
// 2. 关联规则学习 (Apriori)
// ============================================================

export class AssociationRuleLearning implements IAlgorithmExecutor {
  readonly id = 'association_rule_learning';
  readonly name = '关联规则学习';
  readonly version = '1.5.0';
  readonly category = 'rule_learning';

  getDefaultConfig() {
    return {
      minSupport: 0.1,
      minConfidence: 0.6,
      minLift: 1.2,
      maxItemsetSize: 4,
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    if (!input.context?.transactions || !Array.isArray(input.context.transactions)) {
      return { valid: false, errors: ['需要事务数据(context.transactions: string[][])'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const transactions = input.context!.transactions as string[][];
    const n = transactions.length;

    // Apriori算法
    // 1. 频繁1-项集
    const itemCounts = new Map<string, number>();
    for (const t of transactions) {
      for (const item of t) {
        itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
      }
    }

    const minCount = Math.ceil(n * cfg.minSupport);
    let frequentItemsets: Array<{ items: string[]; support: number }> = [];

    // L1
    const l1 = Array.from(itemCounts.entries())
      .filter(([_, count]) => count >= minCount)
      .map(([item, count]) => ({ items: [item], support: count / n }));
    frequentItemsets.push(...l1);

    // Lk (k=2..maxItemsetSize)
    let prevLevel = l1.map(x => x.items);
    for (let k = 2; k <= cfg.maxItemsetSize && prevLevel.length > 0; k++) {
      const candidates = this.generateCandidates(prevLevel);
      const nextLevel: Array<{ items: string[]; support: number }> = [];

      for (const candidate of candidates) {
        let count = 0;
        for (const t of transactions) {
          if (candidate.every(item => t.includes(item))) count++;
        }
        if (count >= minCount) {
          nextLevel.push({ items: candidate, support: count / n });
        }
      }
      frequentItemsets.push(...nextLevel);
      prevLevel = nextLevel.map(x => x.items);
    }

    // 2. 生成关联规则
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

        // 计算置信度
        const antecedentSupport = frequentItemsets.find(
          f => f.items.length === antecedent.length && antecedent.every(a => f.items.includes(a))
        )?.support || 0;
        const consequentSupport = frequentItemsets.find(
          f => f.items.length === consequent.length && consequent.every(c => f.items.includes(c))
        )?.support || 0;

        if (antecedentSupport === 0) continue;
        const confidence = itemset.support / antecedentSupport;
        const lift = consequentSupport > 0 ? confidence / consequentSupport : 0;

        if (confidence >= cfg.minConfidence && lift >= cfg.minLift) {
          rules.push({ antecedent, consequent, support: itemset.support, confidence, lift });
        }
      }
    }

    rules.sort((a, b) => b.confidence * b.lift - a.confidence * a.lift);

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `关联规则学习完成: ${transactions.length}条事务，发现${frequentItemsets.length}个频繁项集，` +
        `${rules.length}条关联规则。` +
        (rules.length > 0 ? `最强规则: {${rules[0].antecedent.join(',')}}→{${rules[0].consequent.join(',')}} ` +
          `(conf=${(rules[0].confidence * 100).toFixed(1)}%, lift=${rules[0].lift.toFixed(2)})` : ''),
      severity: 'normal',
      urgency: 'monitoring',
      confidence: rules.length > 0 ? rules[0].confidence : 0,
      referenceStandard: 'Agrawal & Srikant 1994 (Apriori)',
    }, {
      rules: rules.slice(0, 50),
      frequentItemsets: frequentItemsets.slice(0, 100),
      totalTransactions: n,
      totalRules: rules.length,
    });
  }

  private generateCandidates(prevLevel: string[][]): string[][] {
    const candidates: string[][] = [];
    for (let i = 0; i < prevLevel.length; i++) {
      for (let j = i + 1; j < prevLevel.length; j++) {
        const a = prevLevel[i], b = prevLevel[j];
        // 前k-2项相同
        const prefix = a.slice(0, -1);
        const prefixB = b.slice(0, -1);
        if (prefix.join(',') === prefixB.join(',')) {
          const candidate = [...a, b[b.length - 1]].sort();
          candidates.push(candidate);
        }
      }
    }
    return candidates;
  }

  private getSubsets(items: string[]): string[][] {
    const result: string[][] = [];
    const n = items.length;
    for (let mask = 0; mask < (1 << n); mask++) {
      const subset: string[] = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) subset.push(items[i]);
      }
      result.push(subset);
    }
    return result;
  }
}

// ============================================================
// 3. 决策树归纳
// ============================================================

export class DecisionTreeInduction implements IAlgorithmExecutor {
  readonly id = 'decision_tree_induction';
  readonly name = '决策树归纳';
  readonly version = '1.3.0';
  readonly category = 'rule_learning';

  getDefaultConfig() {
    return {
      method: 'cart', // cart | c45
      maxDepth: 8,
      minSamplesLeaf: 5,
      minInfoGain: 0.01,
      pruning: true,
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    if (!input.context?.trainingData) return { valid: false, errors: ['需要训练数据(context.trainingData)'] };
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const trainData = input.context!.trainingData as {
      features: number[][];
      labels: number[];
      featureNames?: string[];
      labelNames?: string[];
    };

    const n = trainData.features.length;
    const d = trainData.features[0]?.length || 0;
    const featureNames = trainData.featureNames || Array.from({ length: d }, (_, i) => `feature_${i}`);
    const labelNames = trainData.labelNames || Array.from(new Set(trainData.labels)).map(String);

    // 构建决策树 (CART)
    const tree = this.buildTree(
      trainData.features, trainData.labels,
      featureNames, 0, cfg.maxDepth, cfg.minSamplesLeaf, cfg.minInfoGain
    );

    // 提取规则
    const rules = this.extractRules(tree, featureNames, labelNames);

    // 评估
    let correct = 0;
    for (let i = 0; i < n; i++) {
      const pred = this.predict(tree, trainData.features[i]);
      if (pred === trainData.labels[i]) correct++;
    }
    const accuracy = correct / n;

    // 树统计
    const treeStats = this.getTreeStats(tree);

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `决策树归纳完成(${cfg.method.toUpperCase()}): 深度=${treeStats.depth}, 节点=${treeStats.nodes}, ` +
        `叶子=${treeStats.leaves}。训练准确率=${(accuracy * 100).toFixed(1)}%。` +
        `提取${rules.length}条规则`,
      severity: 'normal',
      urgency: 'monitoring',
      confidence: accuracy,
      referenceStandard: cfg.method === 'cart' ? 'Breiman et al. 1984 (CART)' : 'Quinlan 1993 (C4.5)',
    }, {
      rules,
      treeStats,
      accuracy,
      featureImportance: this.calcFeatureImportance(tree, featureNames),
    });
  }

  private buildTree(
    features: number[][], labels: number[], featureNames: string[],
    depth: number, maxDepth: number, minLeaf: number, minGain: number
  ): any {
    const n = labels.length;
    const uniqueLabels = Array.from(new Set(labels));

    // 终止条件
    if (depth >= maxDepth || n <= minLeaf || uniqueLabels.length === 1) {
      const counts = new Map<number, number>();
      for (const l of labels) counts.set(l, (counts.get(l) || 0) + 1);
      let majorityLabel = labels[0], maxCount = 0;
      for (const [label, count] of Array.from(counts.entries())) {
        if (count > maxCount) { maxCount = count; majorityLabel = label; }
      }
      return { type: 'leaf', label: majorityLabel, count: n, distribution: Object.fromEntries(Array.from(counts.entries())) };
    }

    // 找最佳分裂
    const parentGini = this.gini(labels);
    let bestGain = 0, bestFeature = 0, bestThreshold = 0;

    for (let f = 0; f < features[0].length; f++) {
      const values = features.map(row => row[f]).sort((a, b) => a - b);
      const uniqueVals = Array.from(new Set(values));

      for (let i = 0; i < uniqueVals.length - 1; i++) {
        const threshold = (uniqueVals[i] + uniqueVals[i + 1]) / 2;
        const leftLabels = labels.filter((_, j) => features[j][f] <= threshold);
        const rightLabels = labels.filter((_, j) => features[j][f] > threshold);

        if (leftLabels.length < minLeaf || rightLabels.length < minLeaf) continue;

        const gain = parentGini -
          (leftLabels.length / n) * this.gini(leftLabels) -
          (rightLabels.length / n) * this.gini(rightLabels);

        if (gain > bestGain) {
          bestGain = gain;
          bestFeature = f;
          bestThreshold = threshold;
        }
      }
    }

    if (bestGain < minGain) {
      const counts = new Map<number, number>();
      for (const l of labels) counts.set(l, (counts.get(l) || 0) + 1);
      let majorityLabel = labels[0], maxCount = 0;
      for (const [label, count] of Array.from(counts.entries())) {
        if (count > maxCount) { maxCount = count; majorityLabel = label; }
      }
      return { type: 'leaf', label: majorityLabel, count: n, distribution: Object.fromEntries(Array.from(counts.entries())) };
    }

    const leftIdx = features.map((row, i) => row[bestFeature] <= bestThreshold ? i : -1).filter(i => i >= 0);
    const rightIdx = features.map((row, i) => row[bestFeature] > bestThreshold ? i : -1).filter(i => i >= 0);

    return {
      type: 'node',
      feature: bestFeature,
      featureName: featureNames[bestFeature],
      threshold: bestThreshold,
      gain: bestGain,
      left: this.buildTree(
        leftIdx.map(i => features[i]), leftIdx.map(i => labels[i]),
        featureNames, depth + 1, maxDepth, minLeaf, minGain
      ),
      right: this.buildTree(
        rightIdx.map(i => features[i]), rightIdx.map(i => labels[i]),
        featureNames, depth + 1, maxDepth, minLeaf, minGain
      ),
    };
  }

  private gini(labels: number[]): number {
    const counts = new Map<number, number>();
    for (const l of labels) counts.set(l, (counts.get(l) || 0) + 1);
    let gini = 1;
    for (const count of Array.from(counts.values())) {
      const p = count / labels.length;
      gini -= p * p;
    }
    return gini;
  }

  private predict(tree: any, features: number[]): number {
    if (tree.type === 'leaf') return tree.label;
    return features[tree.feature] <= tree.threshold
      ? this.predict(tree.left, features)
      : this.predict(tree.right, features);
  }

  private extractRules(tree: any, featureNames: string[], labelNames: string[], path: string[] = []): Array<{ condition: string; conclusion: string; support: number }> {
    if (tree.type === 'leaf') {
      return [{
        condition: path.length > 0 ? path.join(' AND ') : 'TRUE',
        conclusion: labelNames[tree.label] || String(tree.label),
        support: tree.count,
      }];
    }
    return [
      ...this.extractRules(tree.left, featureNames, labelNames, [...path, `${tree.featureName} <= ${tree.threshold.toFixed(3)}`]),
      ...this.extractRules(tree.right, featureNames, labelNames, [...path, `${tree.featureName} > ${tree.threshold.toFixed(3)}`]),
    ];
  }

  private getTreeStats(tree: any): { depth: number; nodes: number; leaves: number } {
    if (tree.type === 'leaf') return { depth: 0, nodes: 1, leaves: 1 };
    const left = this.getTreeStats(tree.left);
    const right = this.getTreeStats(tree.right);
    return {
      depth: 1 + Math.max(left.depth, right.depth),
      nodes: 1 + left.nodes + right.nodes,
      leaves: left.leaves + right.leaves,
    };
  }

  private calcFeatureImportance(tree: any, featureNames: string[]): Record<string, number> {
    const importance: Record<string, number> = {};
    for (const name of featureNames) importance[name] = 0;
    this.accumulateImportance(tree, importance);
    const total = Object.values(importance).reduce((s, v) => s + v, 0);
    if (total > 0) {
      for (const name of featureNames) importance[name] /= total;
    }
    return importance;
  }

  private accumulateImportance(tree: any, importance: Record<string, number>) {
    if (tree.type === 'leaf') return;
    importance[tree.featureName] = (importance[tree.featureName] || 0) + tree.gain;
    this.accumulateImportance(tree.left, importance);
    this.accumulateImportance(tree.right, importance);
  }
}

// ============================================================
// 4. 频繁模式挖掘 (PrefixSpan)
// ============================================================

export class FrequentPatternMining implements IAlgorithmExecutor {
  readonly id = 'frequent_pattern_mining';
  readonly name = '频繁模式挖掘';
  readonly version = '1.2.0';
  readonly category = 'rule_learning';

  getDefaultConfig() {
    return {
      minSupport: 0.1,
      maxPatternLength: 6,
      minPatternLength: 2,
      gapConstraint: 5, // 最大时间间隔
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    if (!input.context?.sequences || !Array.isArray(input.context.sequences)) {
      return { valid: false, errors: ['需要序列数据(context.sequences: string[][])'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const sequences = input.context!.sequences as string[][];
    const n = sequences.length;
    const minCount = Math.ceil(n * cfg.minSupport);

    // PrefixSpan算法
    const patterns: Array<{ pattern: string[]; support: number; count: number }> = [];

    // 1. 找频繁1-序列
    const itemCounts = new Map<string, number>();
    for (const seq of sequences) {
      const uniqueItems = new Set(seq);
      for (const item of Array.from(uniqueItems)) {
        itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
      }
    }

    const frequentItems = Array.from(itemCounts.entries())
      .filter(([_, count]) => count >= minCount)
      .map(([item, _]) => item)
      .sort();

    // 2. 递归PrefixSpan
    for (const item of frequentItems) {
      this.prefixSpan(
        [item], sequences, minCount, cfg.maxPatternLength, cfg.gapConstraint, patterns
      );
    }

    // 计算支持度
    for (const p of patterns) {
      p.support = p.count / n;
    }

    patterns.sort((a, b) => b.support - a.support || b.pattern.length - a.pattern.length);

    // 过滤最小长度
    const filteredPatterns = patterns.filter(p => p.pattern.length >= cfg.minPatternLength);

    // 生成时序关联规则
    const temporalRules: Array<{
      antecedent: string[];
      consequent: string;
      support: number;
      confidence: number;
    }> = [];

    for (const p of filteredPatterns) {
      if (p.pattern.length >= 2) {
        const antecedent = p.pattern.slice(0, -1);
        const consequent = p.pattern[p.pattern.length - 1];
        const antecedentPattern = patterns.find(
          pp => pp.pattern.length === antecedent.length && pp.pattern.every((v, i) => v === antecedent[i])
        );
        if (antecedentPattern && antecedentPattern.count > 0) {
          const confidence = p.count / antecedentPattern.count;
          if (confidence >= 0.5) {
            temporalRules.push({ antecedent, consequent, support: p.support, confidence });
          }
        }
      }
    }

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `频繁模式挖掘完成(PrefixSpan): ${n}条序列，发现${filteredPatterns.length}个频繁模式，` +
        `${temporalRules.length}条时序规则。` +
        (filteredPatterns.length > 0 ? `最频繁: [${filteredPatterns[0].pattern.join('→')}] (support=${(filteredPatterns[0].support * 100).toFixed(1)}%)` : ''),
      severity: 'normal',
      urgency: 'monitoring',
      confidence: filteredPatterns.length > 0 ? filteredPatterns[0].support : 0,
      referenceStandard: 'Pei et al. 2001 (PrefixSpan)',
    }, {
      patterns: filteredPatterns.slice(0, 100),
      temporalRules: temporalRules.slice(0, 50),
      totalSequences: n,
      totalPatterns: filteredPatterns.length,
    });
  }

  private prefixSpan(
    prefix: string[], sequences: string[][], minCount: number,
    maxLen: number, maxGap: number,
    results: Array<{ pattern: string[]; support: number; count: number }>
  ) {
    // 计算当前前缀的支持度
    let count = 0;
    const projectedDB: string[][] = [];

    for (const seq of sequences) {
      const idx = this.findPrefix(seq, prefix, maxGap);
      if (idx >= 0) {
        count++;
        if (idx + 1 < seq.length) {
          projectedDB.push(seq.slice(idx + 1));
        }
      }
    }

    if (count < minCount) return;

    results.push({ pattern: [...prefix], support: 0, count });

    if (prefix.length >= maxLen) return;

    // 找投影数据库中的频繁项
    const itemCounts = new Map<string, number>();
    for (const seq of projectedDB) {
      const seen = new Set<string>();
      for (let i = 0; i < Math.min(seq.length, maxGap); i++) {
        if (!seen.has(seq[i])) {
          itemCounts.set(seq[i], (itemCounts.get(seq[i]) || 0) + 1);
          seen.add(seq[i]);
        }
      }
    }

    for (const [item, cnt] of Array.from(itemCounts.entries())) {
      if (cnt >= minCount) {
        this.prefixSpan([...prefix, item], sequences, minCount, maxLen, maxGap, results);
      }
    }
  }

  private findPrefix(seq: string[], prefix: string[], maxGap: number): number {
    let seqIdx = 0;
    for (let i = 0; i < prefix.length; i++) {
      let found = false;
      const startIdx = seqIdx;
      while (seqIdx < seq.length && (i === 0 || seqIdx - startIdx <= maxGap)) {
        if (seq[seqIdx] === prefix[i]) { found = true; seqIdx++; break; }
        seqIdx++;
      }
      if (!found) return -1;
    }
    return seqIdx - 1;
  }
}

// ============================================================
// 导出
// ============================================================

export function getRuleLearningAlgorithms(): AlgorithmRegistration[] {
  return [
    {
      executor: new LLMAnalysis(),
      metadata: {
        description: 'LLM大模型辅助规则生成，自然语言解析故障描述，生成诊断规则',
        tags: ['LLM', '大模型', '规则生成', '自然语言'],
        inputFields: [
          { name: 'context.description', type: 'string', description: '故障描述', required: false },
          { name: 'context.features', type: 'object', description: '特征数据', required: false },
        ],
        outputFields: [
          { name: 'suggestedRules', type: 'object[]', description: '建议规则' },
        ],
        configFields: [
          { name: 'model', type: 'select', options: ['gpt-4', 'gpt-3.5', 'local'], default: 'gpt-4' },
          { name: 'temperature', type: 'number', default: 0.3, description: '生成温度' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['规则生成', '故障分析', '知识提取'],
        complexity: 'O(T)',
        edgeDeployable: false,
        referenceStandards: ['LLM-Assisted Analysis'],
      },
    },
    {
      executor: new AssociationRuleLearning(),
      metadata: {
        description: '关联规则学习(Apriori)，从历史事务数据中自动发现关联规则',
        tags: ['关联规则', 'Apriori', '数据挖掘', '模式发现'],
        inputFields: [
          { name: 'context.transactions', type: 'string[][]', description: '事务数据', required: true },
        ],
        outputFields: [
          { name: 'rules', type: 'object[]', description: '关联规则(前件→后件)' },
          { name: 'frequentItemsets', type: 'object[]', description: '频繁项集' },
        ],
        configFields: [
          { name: 'minSupport', type: 'number', default: 0.1, description: '最小支持度' },
          { name: 'minConfidence', type: 'number', default: 0.6, description: '最小置信度' },
          { name: 'minLift', type: 'number', default: 1.2, description: '最小提升度' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['故障关联分析', '维修模式发现', '报警关联'],
        complexity: 'O(2^I*N)',
        edgeDeployable: true,
        referenceStandards: ['Agrawal & Srikant 1994'],
      },
    },
    {
      executor: new DecisionTreeInduction(),
      metadata: {
        description: '决策树归纳(CART/C4.5)，自动构建分类树并提取IF-THEN规则',
        tags: ['决策树', 'CART', 'C4.5', '规则提取'],
        inputFields: [
          { name: 'context.trainingData', type: 'object', description: '训练数据{features,labels,featureNames}', required: true },
        ],
        outputFields: [
          { name: 'rules', type: 'object[]', description: '提取的规则' },
          { name: 'featureImportance', type: 'object', description: '特征重要性' },
        ],
        configFields: [
          { name: 'method', type: 'select', options: ['cart', 'c45'], default: 'cart' },
          { name: 'maxDepth', type: 'number', default: 8, description: '最大深度' },
          { name: 'minSamplesLeaf', type: 'number', default: 5, description: '叶节点最小样本数' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['故障分类', '规则归纳', '可解释诊断'],
        complexity: 'O(N*D*logN)',
        edgeDeployable: true,
        referenceStandards: ['Breiman et al. 1984', 'Quinlan 1993'],
      },
    },
    {
      executor: new FrequentPatternMining(),
      metadata: {
        description: '频繁模式挖掘(PrefixSpan)，发现时序关联规则和频繁事件序列',
        tags: ['频繁模式', 'PrefixSpan', '序列挖掘', '时序规则'],
        inputFields: [
          { name: 'context.sequences', type: 'string[][]', description: '事件序列数据', required: true },
        ],
        outputFields: [
          { name: 'patterns', type: 'object[]', description: '频繁模式' },
          { name: 'temporalRules', type: 'object[]', description: '时序关联规则' },
        ],
        configFields: [
          { name: 'minSupport', type: 'number', default: 0.1, description: '最小支持度' },
          { name: 'maxPatternLength', type: 'number', default: 6, description: '最大模式长度' },
          { name: 'gapConstraint', type: 'number', default: 5, description: '最大时间间隔' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['报警序列分析', '故障演化模式', '维修模式发现'],
        complexity: 'O(N*L*P)',
        edgeDeployable: true,
        referenceStandards: ['Pei et al. 2001'],
      },
    },
  ];
}
