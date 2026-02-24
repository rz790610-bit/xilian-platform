/**
 * ============================================================================
 * High-Fidelity Simulation Engine (E26)
 * ============================================================================
 *
 * 借鉴 FSD 仿真系统：
 *   - 从干预记录自动生成仿真场景
 *   - 参数变异（噪声注入 + 环境扰动）
 *   - 回归测试套件
 *   - 保真度评分
 *   - DB 持久化（evolution_simulations 表）
 *
 * 场景类型：
 *   - regression:   回归测试（确保已修复的问题不再复现）
 *   - stress:       压力测试（极端参数组合）
 *   - edge_case:    边缘案例（从难例挖掘中提取）
 *   - adversarial:  对抗测试（故意构造对抗样本）
 *   - replay:       历史回放（真实数据重放）
 */

import { getProtectedDb as getDb } from '../infra/protected-clients';
import { evolutionSimulations, evolutionInterventions } from '../../../../drizzle/evolution-schema';
import { eq, desc, count } from 'drizzle-orm';
import { EventBus } from '../../events/event-bus';
import { createModuleLogger } from '../../../core/logger';
import { klDivergence, jsDivergence } from '../../../lib/math/stats';

const log = createModuleLogger('simulation-engine');

// ============================================================================
// 类型定义
// ============================================================================

export interface SimScenario {
  id: string;
  name: string;
  scenarioType: 'regression' | 'stress' | 'edge_case' | 'adversarial' | 'replay';
  sourceInterventionId: number | null;
  inputData: Record<string, unknown>;
  expectedOutput: Record<string, unknown>;
  variations: ScenarioVariation[];
  fidelityScore: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'extreme';
  tags: string[];
}

export interface ScenarioVariation {
  variationIndex: number;
  noiseLevel: number;
  envParams: Record<string, number>;
  perturbedInput: Record<string, unknown>;
}

export interface SimulationResult {
  scenarioId: string;
  passed: boolean;
  actualOutput: Record<string, unknown>;
  expectedOutput: Record<string, unknown>;
  divergenceScore: number;
  latencyMs: number;
  variationResults: VariationResult[];
}

export interface VariationResult {
  variationIndex: number;
  passed: boolean;
  divergenceScore: number;
}

export interface RegressionSuiteReport {
  suiteId: string;
  modelId: string;
  total: number;
  passed: number;
  failed: number;
  coverageRate: number;
  avgDivergence: number;
  avgLatency: number;
  failedScenarios: string[];
  executedAt: number;
  durationMs: number;
}

export interface SimulationEngineConfig {
  /** 每个干预生成的变异数 */
  variationsPerIntervention: number;
  /** 最大噪声级别 */
  maxNoiseLevel: number;
  /** 通过阈值 (divergence < 此值视为通过) */
  passThreshold: number;
  /** 并行执行数 */
  parallelism: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: SimulationEngineConfig = {
  variationsPerIntervention: 20,
  maxNoiseLevel: 0.5,
  passThreshold: 0.1,
  parallelism: 10,
};

// ============================================================================
// 仿真模型接口
// ============================================================================

export interface SimulationModelProvider {
  predict(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

// ============================================================================
// 高保真仿真引擎
// ============================================================================

export class HighFidelitySimulationEngine {
  private config: SimulationEngineConfig;
  private eventBus: EventBus;

  constructor(config: Partial<SimulationEngineConfig> = {}, eventBus?: EventBus) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventBus = eventBus || new EventBus();
  }

  // ==========================================================================
  // 1. 从干预记录自动生成仿真场景
  // ==========================================================================

  async createScenarioFromIntervention(intervention: {
    id: number;
    requestData: Record<string, unknown>;
    humanDecision: Record<string, unknown>;
    shadowDecision: Record<string, unknown>;
    divergenceScore: number;
  }): Promise<SimScenario> {
    const variations = this.generateVariations(
      intervention.requestData,
      this.config.variationsPerIntervention,
    );

    const difficulty = this.classifyDifficulty(intervention.divergenceScore);
    const fidelityScore = await this.computeFidelity(intervention.requestData);

    const scenario: SimScenario = {
      id: crypto.randomUUID(),
      name: `intervention_${intervention.id}_scenario`,
      scenarioType: 'edge_case',
      sourceInterventionId: intervention.id,
      inputData: intervention.requestData,
      expectedOutput: intervention.humanDecision,
      variations,
      fidelityScore,
      difficulty,
      tags: [`intervention_${intervention.id}`, `difficulty_${difficulty}`],
    };

    // 持久化到 DB
    await this.persistScenario(scenario);

    log.info(`从干预 #${intervention.id} 生成仿真场景: ${scenario.id}, 变异数: ${variations.length}`);
    return scenario;
  }

  // ==========================================================================
  // 2. 批量从干预生成场景
  // ==========================================================================

  async createScenariosFromRecentInterventions(limit = 50): Promise<SimScenario[]> {
    const db = await getDb();
    if (!db) return [];

    try {
      // @ts-ignore
      const interventions = await db.select().from(evolutionInterventions)
        .where(eq(evolutionInterventions.isIntervention, 1))
        .orderBy(desc(evolutionInterventions.createdAt))
        .limit(limit);

      const scenarios: SimScenario[] = [];
      for (const intervention of interventions) {
        const scenario = await this.createScenarioFromIntervention({
          id: intervention.id,
          requestData: (intervention.requestData as Record<string, unknown>) ?? {},
          humanDecision: (intervention.humanDecision as Record<string, unknown>) ?? {},
          shadowDecision: (intervention.shadowDecision as Record<string, unknown>) ?? {},
          divergenceScore: intervention.divergenceScore ?? 0,
        });
        scenarios.push(scenario);
      }

      return scenarios;
    } catch (err) {
      log.error('批量生成仿真场景失败', err);
      return [];
    }
  }

  // ==========================================================================
  // 3. 参数变异生成
  // ==========================================================================

  private generateVariations(
    baseInput: Record<string, unknown>,
    variationCount: number,
  ): ScenarioVariation[] {
    const variations: ScenarioVariation[] = [];

    for (let i = 0; i < variationCount; i++) {
      const noiseLevel = (i / variationCount) * this.config.maxNoiseLevel;
      const envParams: Record<string, number> = {
        temperature: 20 + (Math.random() - 0.5) * 40 * noiseLevel,
        humidity: 50 + (Math.random() - 0.5) * 60 * noiseLevel,
        windSpeed: 5 + Math.random() * 20 * noiseLevel,
        loadFactor: 0.5 + Math.random() * 0.5 * noiseLevel,
      };

      const perturbedInput = this.perturbInput(baseInput, noiseLevel);

      variations.push({
        variationIndex: i,
        noiseLevel,
        envParams,
        perturbedInput,
      });
    }

    return variations;
  }

  private perturbInput(input: Record<string, unknown>, noiseLevel: number): Record<string, unknown> {
    const perturbed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'number') {
        // 高斯噪声
        const noise = this.gaussianNoise() * noiseLevel * Math.abs(value);
        perturbed[key] = value + noise;
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        perturbed[key] = this.perturbInput(value as Record<string, unknown>, noiseLevel);
      } else {
        perturbed[key] = value;
      }
    }

    return perturbed;
  }

  private gaussianNoise(): number {
    // Box-Muller 变换
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // ==========================================================================
  // 4. 回归测试套件
  // ==========================================================================

  async runRegressionSuite(
    modelId: string,
    modelProvider: SimulationModelProvider,
    scenarios?: SimScenario[],
  ): Promise<RegressionSuiteReport> {
    const startTime = Date.now();
    const suiteId = `regression_${modelId}_${startTime}`;

    // 如果没有提供场景，从 DB 加载
    if (!scenarios || scenarios.length === 0) {
      scenarios = await this.loadScenariosFromDB();
    }

    if (scenarios.length === 0) {
      return {
        suiteId,
        modelId,
        total: 0,
        passed: 0,
        failed: 0,
        coverageRate: 0,
        avgDivergence: 0,
        avgLatency: 0,
        failedScenarios: [],
        executedAt: startTime,
        durationMs: Date.now() - startTime,
      };
    }

    // 分批并行执行
    const results: SimulationResult[] = [];
    for (let i = 0; i < scenarios.length; i += this.config.parallelism) {
      const batch = scenarios.slice(i, i + this.config.parallelism);
      const batchResults = await Promise.all(
        batch.map(s => this.runScenario(modelProvider, s)),
      );
      results.push(...batchResults);
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const avgDivergence = results.reduce((s, r) => s + r.divergenceScore, 0) / results.length;
    const avgLatency = results.reduce((s, r) => s + r.latencyMs, 0) / results.length;
    const failedScenarios = results.filter(r => !r.passed).map(r => r.scenarioId);

    const report: RegressionSuiteReport = {
      suiteId,
      modelId,
      total: scenarios.length,
      passed,
      failed,
      coverageRate: passed / scenarios.length,
      avgDivergence,
      avgLatency,
      failedScenarios,
      executedAt: startTime,
      durationMs: Date.now() - startTime,
    };

    // EventBus
    await this.eventBus.publish('simulation.regression.completed', {
        suiteId,
        modelId,
        total: scenarios.length,
        passed,
        failed,
        coverageRate: report.coverageRate,
      }, { source: 'simulation-engine' });

    log.info(`回归测试完成: ${suiteId}, 通过率 ${(report.coverageRate * 100).toFixed(1)}%`);
    return report;
  }

  // ==========================================================================
  // 5. 单场景执行
  // ==========================================================================

  private async runScenario(
    modelProvider: SimulationModelProvider,
    scenario: SimScenario,
  ): Promise<SimulationResult> {
    const startTime = Date.now();

    try {
      // 执行主场景
      const actualOutput = await modelProvider.predict(scenario.inputData);
      const mainDivergence = this.computeOutputDivergence(actualOutput, scenario.expectedOutput);
      const mainPassed = mainDivergence < this.config.passThreshold;

      // 执行变异场景
      const variationResults: VariationResult[] = [];
      for (const variation of scenario.variations.slice(0, 5)) { // 限制变异数
        try {
          const varOutput = await modelProvider.predict(variation.perturbedInput);
          const varDivergence = this.computeOutputDivergence(varOutput, scenario.expectedOutput);
          variationResults.push({
            variationIndex: variation.variationIndex,
            passed: varDivergence < this.config.passThreshold * (1 + variation.noiseLevel),
            divergenceScore: varDivergence,
          });
        } catch {
          variationResults.push({
            variationIndex: variation.variationIndex,
            passed: false,
            divergenceScore: 1.0,
          });
        }
      }

      return {
        scenarioId: scenario.id,
        passed: mainPassed,
        actualOutput,
        expectedOutput: scenario.expectedOutput,
        divergenceScore: mainDivergence,
        latencyMs: Date.now() - startTime,
        variationResults,
      };
    } catch (err) {
      return {
        scenarioId: scenario.id,
        passed: false,
        actualOutput: {},
        expectedOutput: scenario.expectedOutput,
        divergenceScore: 1.0,
        latencyMs: Date.now() - startTime,
        variationResults: [],
      };
    }
  }

  // ==========================================================================
  // 6. 输出差异计算
  // ==========================================================================

  /**
   * P1 修复：输出差异计算 — 结构化字段逐一比较（替代 JSON.stringify）
   */
  private computeOutputDivergence(
    actual: Record<string, unknown>,
    expected: Record<string, unknown>,
  ): number {
    const allKeys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
    if (allKeys.size === 0) return 0;

    let totalDiff = 0;
    let keyCount = 0;

    for (const key of allKeys) {
      const aVal = actual[key];
      const eVal = expected[key];
      totalDiff += this.computeFieldDiff(aVal, eVal);
      keyCount++;
    }

    return keyCount > 0 ? totalDiff / keyCount : 0;
  }

  private computeFieldDiff(a: unknown, b: unknown): number {
    if (a === undefined && b === undefined) return 0;
    if (a === undefined || b === undefined) return 1.0;
    if (a === null && b === null) return 0;
    if (a === null || b === null) return 1.0;

    // 数值比较（相对误差 + 绝对容差）
    if (typeof a === 'number' && typeof b === 'number') {
      const absDiff = Math.abs(a - b);
      if (absDiff < 1e-8) return 0;
      const maxAbs = Math.max(Math.abs(a), Math.abs(b), 1);
      const relDiff = absDiff / maxAbs;
      return Math.min(relDiff, 1.0);
    }

    // 字符串比较
    if (typeof a === 'string' && typeof b === 'string') {
      return a === b ? 0 : 1.0;
    }

    // 布尔比较
    if (typeof a === 'boolean' && typeof b === 'boolean') {
      return a === b ? 0 : 1.0;
    }

    // 数组比较
    if (Array.isArray(a) && Array.isArray(b)) {
      const maxLen = Math.max(a.length, b.length);
      if (maxLen === 0) return 0;
      let sum = 0;
      for (let i = 0; i < maxLen; i++) {
        sum += this.computeFieldDiff(a[i], b[i]);
      }
      return sum / maxLen;
    }

    // 对象递归比较
    if (typeof a === 'object' && typeof b === 'object') {
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;
      const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
      if (keys.size === 0) return 0;
      let sum = 0;
      for (const k of keys) {
        sum += this.computeFieldDiff(aObj[k], bObj[k]);
      }
      return sum / keys.size;
    }

    // 类型不匹配
    return 1.0;
  }

  // ==========================================================================
  // 7. 辅助方法
  // ==========================================================================

  private classifyDifficulty(divergenceScore: number): SimScenario['difficulty'] {
    if (divergenceScore > 0.7) return 'extreme';
    if (divergenceScore > 0.4) return 'hard';
    if (divergenceScore > 0.2) return 'medium';
    return 'easy';
  }

  /**
   * P1 修复：保真度评分 — 基于输入数据的多维度评估
   *
   * 评分维度：
   *   1. 完整性 (30%): 输入字段数量 / 期望字段数量
   *   2. 数值覆盖率 (25%): 数值型字段占比
   *   3. 值域合理性 (25%): 数值字段是否在合理范围内（无 NaN/Infinity）
   *   4. 结构深度 (20%): 嵌套对象的深度（越深越接近真实数据）
   *
   * 如果有历史分布数据，额外使用 JS 散度评估与历史分布的偏离程度
   */
  private async computeFidelity(
    inputData: Record<string, unknown>,
    historicalDistribution?: number[],
  ): Promise<number> {
    const entries = Object.entries(inputData);
    const totalFields = entries.length;

    if (totalFields === 0) return 0;

    // 1. 完整性评分
    const completeness = Math.min(totalFields / 10, 1.0);

    // 2. 数值覆盖率
    const numericFields = entries.filter(([_, v]) => typeof v === 'number');
    const numericCoverage = numericFields.length / totalFields;

    // 3. 值域合理性
    let validNumericCount = 0;
    for (const [_, value] of numericFields) {
      const v = value as number;
      if (Number.isFinite(v) && !Number.isNaN(v)) {
        validNumericCount++;
      }
    }
    const valueValidity = numericFields.length > 0
      ? validNumericCount / numericFields.length
      : 0.5;

    // 4. 结构深度
    const depth = this.measureDepth(inputData);
    const depthScore = Math.min(depth / 3, 1.0); // 深度 3 为满分

    // 基础保真度
    let fidelity = completeness * 0.30 + numericCoverage * 0.25 + valueValidity * 0.25 + depthScore * 0.20;

    // 5. 如果有历史分布，使用 JS 散度调整
    if (historicalDistribution && numericFields.length > 0) {
      const currentDist = numericFields.map(([_, v]) => Math.abs(v as number));
      // 归一化为概率分布
      const sumCurrent = currentDist.reduce((a, b) => a + b, 0) || 1;
      const sumHistorical = historicalDistribution.reduce((a, b) => a + b, 0) || 1;
      const pCurrent = currentDist.map(v => v / sumCurrent);
      const pHistorical = historicalDistribution.map(v => v / sumHistorical);

      // 确保长度一致
      const minLen = Math.min(pCurrent.length, pHistorical.length);
      if (minLen > 0) {
        const jsDiv = jsDivergence(pCurrent.slice(0, minLen), pHistorical.slice(0, minLen));
        // JS 散度越小，保真度越高
        const distributionFidelity = Math.max(0, 1 - jsDiv * 2);
        fidelity = fidelity * 0.7 + distributionFidelity * 0.3;
      }
    }

    return Math.max(0, Math.min(1, fidelity));
  }

  private measureDepth(obj: unknown, currentDepth = 0): number {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      return currentDepth;
    }
    let maxDepth = currentDepth;
    for (const value of Object.values(obj)) {
      maxDepth = Math.max(maxDepth, this.measureDepth(value, currentDepth + 1));
    }
    return maxDepth;
  }

  private async persistScenario(scenario: SimScenario): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      // @ts-ignore
      await db.insert(evolutionSimulations).values({
        scenarioId: scenario.id,
        name: scenario.id,
        scenarioType: scenario.scenarioType,
        sourceInterventionId: scenario.sourceInterventionId,
        inputData: scenario.inputData,
        expectedOutput: scenario.expectedOutput,
        variations: scenario.variations,
        fidelityScore: Math.round(scenario.fidelityScore * 10000) / 10000,
        difficulty: scenario.difficulty,
        tags: scenario.tags,
        status: 'active',
      });
    } catch (err) {
      log.error('持久化仿真场景失败', err);
    }
  }

  private async loadScenariosFromDB(): Promise<SimScenario[]> {
    const db = await getDb();
    if (!db) return [];

    try {
      // @ts-ignore
      const rows = await db.select().from(evolutionSimulations)
        // @ts-ignore
        .where(eq(evolutionSimulations.scenarioType, 'active'))
        .orderBy(desc(evolutionSimulations.createdAt))
        .limit(100);

      return rows.map(r => ({
        id: r.scenarioId,
        // @ts-ignore
        name: r.name,
        scenarioType: r.scenarioType as SimScenario['scenarioType'],
        sourceInterventionId: r.sourceInterventionId,
        inputData: (r.inputData as Record<string, unknown>) ?? {},
        expectedOutput: (r.expectedOutput as Record<string, unknown>) ?? {},
        variations: (r.variations as unknown as ScenarioVariation[]) ?? [],
        fidelityScore: r.fidelityScore ?? 0,
        difficulty: (r.difficulty as SimScenario['difficulty']) ?? 'medium',
        tags: (r.tags as string[]) ?? [],
      }));
    } catch { return []; }
  }

  // ==========================================================================
  // 8. 查询方法
  // ==========================================================================

  async getScenarioCount(): Promise<number> {
    const db = await getDb();
    if (!db) return 0;
    try {
      // @ts-ignore
      const rows = await db.select({ cnt: count() }).from(evolutionSimulations);
      return rows[0]?.cnt ?? 0;
    } catch { return 0; }
  }
}
