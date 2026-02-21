/**
 * ============================================================================
 * BPA 构建器 — 可配置、可追溯、可复用
 * ============================================================================
 *
 * 核心职责：
 *   1. 从传感器统计值 + 模糊规则配置 → 构建 BPA（基本概率分配）
 *   2. 支持三种模糊隶属度函数：梯形、三角形、高斯
 *   3. 配置从 DB 加载（bpa_configs 表），支持前端编辑
 *   4. 完整追溯日志：每次构建记录输入、规则、输出
 *
 * 数学基础：
 *   对于每个证据源 s，遍历其所有规则 r_i：
 *     rawMembership_i = μ(x; params_i)     // 模糊隶属度
 *     totalRaw = Σ rawMembership_i
 *     if totalRaw > 0:
 *       m(hypothesis_i) = rawMembership_i / totalRaw * (1 - ignoranceBase)
 *     ignorance = ignoranceBase + (1 - ignoranceBase) * (1 - max(rawMembership_i))
 *
 * 设计原则：
 *   - 纯计算类，无 IO 依赖（DB 加载由外部注入配置）
 *   - 支持任意设备类型（通过 BpaConfig 配置不同规则集）
 *   - 每次构建产生 BpaConstructionLog，支持审计追溯
 *   - 与感知层 DS 引擎和认知层 DS 引擎均兼容（通过适配器函数）
 */

import { createModuleLogger } from '../../../core/logger';
import type {
  SensorStats,
  BasicProbabilityAssignment,
  BpaConfig,
  BpaRule,
  BpaConstructionLog,
  FuzzyFunctionType,
  FuzzyFunctionParams,
  TrapezoidalParams,
  TriangularParams,
  GaussianParams,
} from './bpa.types';

const log = createModuleLogger('bpa-builder');

// ============================================================================
// BPA 构建器配置
// ============================================================================

export interface BPABuilderOptions {
  /**
   * 基础不确定性（ignorance base）
   * 即使所有规则都完美匹配，也保留这个比例给全集 Θ
   * 默认 0.05（5%），防止过度自信
   */
  ignoranceBase: number;

  /**
   * 最小信念质量阈值
   * 低于此值的假设信念将被归零（减少噪声）
   * 默认 0.01
   */
  minMassThreshold: number;

  /**
   * 是否启用追溯日志
   * 生产环境可关闭以提升性能
   * 默认 true
   */
  enableTracing: boolean;

  /**
   * 配置版本标识（用于追溯）
   */
  configVersion: string;
}

const DEFAULT_OPTIONS: BPABuilderOptions = {
  ignoranceBase: 0.05,
  minMassThreshold: 0.01,
  enableTracing: true,
  configVersion: 'default',
};

// ============================================================================
// BPA 构建器
// ============================================================================

export class BPABuilder {
  private readonly options: BPABuilderOptions;
  private config: BpaConfig;
  private readonly constructionLogs: BpaConstructionLog[] = [];

  /** 日志缓冲区最大容量（防止内存泄漏） */
  private static readonly MAX_LOG_BUFFER = 1000;

  constructor(config: BpaConfig, options?: Partial<BPABuilderOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.config = config;
    this.validateConfig(config);
    log.info({
      hypotheses: config.hypotheses,
      rulesCount: config.rules.length,
      configVersion: this.options.configVersion,
    }, 'BPABuilder initialized');
  }

  // ==========================================================================
  // 公共 API
  // ==========================================================================

  /**
   * 为单个证据源构建 BPA
   *
   * @param source 证据源标识（如 'vibration', 'electrical'）
   * @param stats 传感器统计特征向量
   * @param machineId 设备 ID（用于追溯）
   * @returns BPA 或 null（当该源无匹配规则时）
   */
  buildForSource(
    source: string,
    stats: SensorStats,
    machineId?: string,
  ): BasicProbabilityAssignment | null {
    // 1. 筛选该证据源的规则
    const sourceRules = this.config.rules.filter(r => r.source === source);
    if (sourceRules.length === 0) {
      log.debug({ source }, 'No rules found for source, skipping');
      return null;
    }

    // 2. 提取输入值
    const inputValue = this.extractInputValue(source, stats);
    if (inputValue === null || inputValue === undefined || !isFinite(inputValue)) {
      log.debug({ source, inputValue }, 'Invalid input value for source, skipping');
      return null;
    }

    // 3. 计算每条规则的模糊隶属度
    const ruleResults: Array<{
      hypothesis: string;
      functionType: FuzzyFunctionType;
      rawMembership: number;
      normalizedMass: number;
    }> = [];

    for (const rule of sourceRules) {
      const rawMembership = this.computeMembership(inputValue, rule.functionType, rule.params);
      ruleResults.push({
        hypothesis: rule.hypothesis,
        functionType: rule.functionType,
        rawMembership,
        normalizedMass: 0, // 稍后归一化
      });
    }

    // 4. 归一化 → BPA
    const bpa = this.normalizeToBPA(ruleResults);

    // 5. 追溯日志
    if (this.options.enableTracing) {
      this.addConstructionLog({
        timestamp: new Date(),
        source,
        inputStats: stats,
        inputValue,
        appliedRules: ruleResults,
        outputBpa: bpa,
        configVersion: this.options.configVersion,
        machineId,
      });
    }

    log.debug({
      source,
      inputValue: +inputValue.toFixed(4),
      masses: Object.fromEntries(
        Object.entries(bpa.m).map(([k, v]) => [k, +v.toFixed(4)])
      ),
      ignorance: +bpa.ignorance.toFixed(4),
    }, 'BPA constructed');

    return bpa;
  }

  /**
   * 为所有配置的证据源批量构建 BPA
   *
   * @param stats 传感器统计特征向量
   * @param machineId 设备 ID
   * @returns 证据源 → BPA 的映射（仅包含成功构建的）
   */
  buildAll(
    stats: SensorStats,
    machineId?: string,
  ): Map<string, BasicProbabilityAssignment> {
    const results = new Map<string, BasicProbabilityAssignment>();

    // 提取所有唯一的证据源
    const sources = [...new Set(this.config.rules.map(r => r.source))];

    for (const source of sources) {
      const bpa = this.buildForSource(source, stats, machineId);
      if (bpa) {
        results.set(source, bpa);
      }
    }

    log.info({
      machineId,
      totalSources: sources.length,
      successfulSources: results.size,
      sources: [...results.keys()],
    }, 'Batch BPA construction completed');

    return results;
  }

  // ==========================================================================
  // 模糊隶属度函数
  // ==========================================================================

  /**
   * 计算模糊隶属度 μ(x)
   *
   * 根据函数类型分派到具体实现
   */
  computeMembership(
    x: number,
    functionType: FuzzyFunctionType,
    params: FuzzyFunctionParams,
  ): number {
    switch (functionType) {
      case 'trapezoidal':
        return this.trapezoidalMembership(x, params as TrapezoidalParams);
      case 'triangular':
        return this.triangularMembership(x, params as TriangularParams);
      case 'gaussian':
        return this.gaussianMembership(x, params as GaussianParams);
      default:
        log.warn({ functionType }, 'Unknown fuzzy function type, returning 0');
        return 0;
    }
  }

  /**
   * 梯形隶属度函数
   *
   *        b_____c
   *       /       \
   *      /         \
   *   __/           \__
   *   a               d
   *
   * μ(x) =
   *   0                   if x <= a or x >= d
   *   (x - a) / (b - a)  if a < x <= b
   *   1                   if b < x <= c
   *   (d - x) / (d - c)  if c < x < d
   */
  private trapezoidalMembership(x: number, p: TrapezoidalParams): number {
    const { a, b, c, d } = p;

    if (x <= a || x >= d) return 0;
    if (x > a && x <= b) return b === a ? 1 : (x - a) / (b - a);
    if (x > b && x <= c) return 1;
    if (x > c && x < d) return d === c ? 1 : (d - x) / (d - c);
    return 0;
  }

  /**
   * 三角形隶属度函数
   *
   *        b
   *       / \
   *      /   \
   *   __/     \__
   *   a         c
   *
   * μ(x) =
   *   0                   if x <= a or x >= c
   *   (x - a) / (b - a)  if a < x <= b
   *   (c - x) / (c - b)  if b < x < c
   */
  private triangularMembership(x: number, p: TriangularParams): number {
    const { a, b, c } = p;

    if (x <= a || x >= c) return 0;
    if (x > a && x <= b) return b === a ? 1 : (x - a) / (b - a);
    if (x > b && x < c) return c === b ? 1 : (c - x) / (c - b);
    return 0;
  }

  /**
   * 高斯隶属度函数
   *
   * μ(x) = exp(-(x - μ)² / (2σ²))
   */
  private gaussianMembership(x: number, p: GaussianParams): number {
    const { mu, sigma } = p;
    if (sigma <= 0) return x === mu ? 1 : 0;
    return Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2));
  }

  // ==========================================================================
  // 归一化与 BPA 构建
  // ==========================================================================

  /**
   * 将原始隶属度归一化为 BPA
   *
   * 算法：
   *   1. 计算 totalRaw = Σ rawMembership_i
   *   2. 如果 totalRaw > 0：
   *      m(hypothesis_i) = rawMembership_i / totalRaw * (1 - ignoranceBase)
   *   3. ignorance = 1 - Σ m(hypothesis_i)
   *   4. 过滤低于 minMassThreshold 的假设，重新归一化
   *
   * 约束保证：Σ m(A) + ignorance = 1
   */
  private normalizeToBPA(
    ruleResults: Array<{
      hypothesis: string;
      functionType: FuzzyFunctionType;
      rawMembership: number;
      normalizedMass: number;
    }>,
  ): BasicProbabilityAssignment {
    const totalRaw = ruleResults.reduce((sum, r) => sum + r.rawMembership, 0);

    const m: Record<string, number> = {};

    if (totalRaw > 0) {
      // 分配信念质量
      const availableMass = 1 - this.options.ignoranceBase;

      for (const result of ruleResults) {
        const mass = (result.rawMembership / totalRaw) * availableMass;
        result.normalizedMass = mass;

        // 同一假设可能有多条规则（不同函数类型），累加
        m[result.hypothesis] = (m[result.hypothesis] || 0) + mass;
      }

      // 过滤低于阈值的假设
      for (const [hyp, mass] of Object.entries(m)) {
        if (mass < this.options.minMassThreshold) {
          delete m[hyp];
        }
      }
    }

    // 确保所有假设都在 m 中（即使为 0）
    for (const hyp of this.config.hypotheses) {
      if (!(hyp in m)) {
        m[hyp] = 0;
      }
    }

    // 计算 ignorance = 1 - Σm(A)
    const totalMass = Object.values(m).reduce((sum, v) => sum + v, 0);
    const ignorance = Math.max(0, 1 - totalMass);

    return { m, ignorance };
  }

  // ==========================================================================
  // 输入值提取
  // ==========================================================================

  /**
   * 从 SensorStats 中提取证据源对应的输入值
   *
   * 映射规则（可扩展）：
   *   - vibration → vibrationRms
   *   - temperature → temperatureDev
   *   - electrical / motor_current → currentPeak
   *   - stress → stressDelta
   *   - wind / environmental → windSpeed60m
   *   - 其他 → 尝试直接按 source 名称查找
   */
  private extractInputValue(source: string, stats: SensorStats): number | null {
    // 预定义映射（覆盖常见场景）
    const mappings: Record<string, keyof SensorStats | string> = {
      vibration: 'vibrationRms',
      temperature: 'temperatureDev',
      electrical: 'currentPeak',
      motor_current: 'currentPeak',
      stress: 'stressDelta',
      wind: 'windSpeed60m',
      environmental: 'windSpeed60m',
    };

    const key = mappings[source] || source;
    const value = stats[key];

    if (typeof value === 'number' && isFinite(value)) {
      return value;
    }

    // 尝试模糊匹配（source 名称的变体）
    const lowerSource = source.toLowerCase();
    for (const [statKey, statValue] of Object.entries(stats)) {
      if (statKey.toLowerCase().includes(lowerSource) && typeof statValue === 'number') {
        return statValue;
      }
    }

    return null;
  }

  // ==========================================================================
  // 配置管理
  // ==========================================================================

  /**
   * 热更新配置（从 DB 重新加载后调用）
   */
  updateConfig(newConfig: BpaConfig, newVersion?: string): void {
    this.validateConfig(newConfig);
    this.config = newConfig;
    if (newVersion) {
      (this.options as BPABuilderOptions).configVersion = newVersion;
    }
    log.info({
      hypotheses: newConfig.hypotheses,
      rulesCount: newConfig.rules.length,
      configVersion: this.options.configVersion,
    }, 'BPABuilder config updated');
  }

  /**
   * 获取当前配置（只读）
   */
  getConfig(): Readonly<BpaConfig> {
    return { ...this.config, rules: [...this.config.rules] };
  }

  /**
   * 获取配置版本
   */
  getConfigVersion(): string {
    return this.options.configVersion;
  }

  // ==========================================================================
  // 追溯日志
  // ==========================================================================

  /**
   * 获取构建日志（最近 N 条）
   */
  getConstructionLogs(limit: number = 100): BpaConstructionLog[] {
    return this.constructionLogs.slice(-limit);
  }

  /**
   * 获取指定设备的构建日志
   */
  getLogsByMachine(machineId: string, limit: number = 50): BpaConstructionLog[] {
    return this.constructionLogs
      .filter(l => l.machineId === machineId)
      .slice(-limit);
  }

  /**
   * 清空日志缓冲区
   */
  clearLogs(): void {
    this.constructionLogs.length = 0;
  }

  /**
   * 导出日志（用于持久化到 DB 或 ClickHouse）
   */
  exportAndClearLogs(): BpaConstructionLog[] {
    const logs = [...this.constructionLogs];
    this.constructionLogs.length = 0;
    return logs;
  }

  // ==========================================================================
  // 内部方法
  // ==========================================================================

  private addConstructionLog(entry: BpaConstructionLog): void {
    this.constructionLogs.push(entry);
    // 防止内存泄漏：超过上限时丢弃旧日志
    if (this.constructionLogs.length > BPABuilder.MAX_LOG_BUFFER) {
      this.constructionLogs.splice(0, this.constructionLogs.length - BPABuilder.MAX_LOG_BUFFER);
    }
  }

  /**
   * 验证配置合法性
   */
  private validateConfig(config: BpaConfig): void {
    if (!config.hypotheses || config.hypotheses.length === 0) {
      throw new Error('BpaConfig.hypotheses must not be empty');
    }
    if (!config.rules || config.rules.length === 0) {
      throw new Error('BpaConfig.rules must not be empty');
    }

    // 验证每条规则的假设是否在假设空间中
    for (const rule of config.rules) {
      if (!config.hypotheses.includes(rule.hypothesis)) {
        throw new Error(
          `Rule hypothesis "${rule.hypothesis}" not in hypotheses: [${config.hypotheses.join(', ')}]`
        );
      }
      // 验证模糊函数参数
      this.validateFuzzyParams(rule);
    }
  }

  /**
   * 验证模糊函数参数
   */
  private validateFuzzyParams(rule: BpaRule): void {
    switch (rule.functionType) {
      case 'trapezoidal': {
        const p = rule.params as TrapezoidalParams;
        if (p.a > p.b || p.b > p.c || p.c > p.d) {
          throw new Error(
            `Trapezoidal params must satisfy a <= b <= c <= d, got: a=${p.a}, b=${p.b}, c=${p.c}, d=${p.d} (source: ${rule.source}, hypothesis: ${rule.hypothesis})`
          );
        }
        break;
      }
      case 'triangular': {
        const p = rule.params as TriangularParams;
        if (p.a > p.b || p.b > p.c) {
          throw new Error(
            `Triangular params must satisfy a <= b <= c, got: a=${p.a}, b=${p.b}, c=${p.c} (source: ${rule.source}, hypothesis: ${rule.hypothesis})`
          );
        }
        break;
      }
      case 'gaussian': {
        const p = rule.params as GaussianParams;
        if (p.sigma <= 0) {
          throw new Error(
            `Gaussian sigma must be > 0, got: ${p.sigma} (source: ${rule.source}, hypothesis: ${rule.hypothesis})`
          );
        }
        break;
      }
      default:
        throw new Error(`Unknown fuzzy function type: ${rule.functionType}`);
    }
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建岸桥默认 BPA 配置
 *
 * 这是一个示例配置，生产环境应从 DB 加载。
 * 覆盖 5 个证据源 × 4 个假设 = 20 条规则。
 */
export function createDefaultCraneBpaConfig(): BpaConfig {
  return {
    hypotheses: ['normal', 'degraded', 'fault', 'critical'],
    rules: [
      // ── 振动证据源 ──
      {
        source: 'vibration',
        hypothesis: 'normal',
        functionType: 'trapezoidal',
        params: { a: 0, b: 0, c: 2.0, d: 3.5 },
      },
      {
        source: 'vibration',
        hypothesis: 'degraded',
        functionType: 'triangular',
        params: { a: 2.0, b: 4.0, c: 6.0 },
      },
      {
        source: 'vibration',
        hypothesis: 'fault',
        functionType: 'triangular',
        params: { a: 4.5, b: 7.0, c: 10.0 },
      },
      {
        source: 'vibration',
        hypothesis: 'critical',
        functionType: 'trapezoidal',
        params: { a: 8.0, b: 11.0, c: 100, d: 100 },
      },

      // ── 电气证据源（电流峰值） ──
      {
        source: 'electrical',
        hypothesis: 'normal',
        functionType: 'trapezoidal',
        params: { a: 0, b: 0, c: 70, d: 90 },
      },
      {
        source: 'electrical',
        hypothesis: 'degraded',
        functionType: 'triangular',
        params: { a: 75, b: 95, c: 115 },
      },
      {
        source: 'electrical',
        hypothesis: 'fault',
        functionType: 'triangular',
        params: { a: 100, b: 120, c: 150 },
      },
      {
        source: 'electrical',
        hypothesis: 'critical',
        functionType: 'trapezoidal',
        params: { a: 130, b: 150, c: 500, d: 500 },
      },

      // ── 温度证据源（温度偏差） ──
      {
        source: 'temperature',
        hypothesis: 'normal',
        functionType: 'trapezoidal',
        params: { a: -5, b: -2, c: 2, d: 5 },
      },
      {
        source: 'temperature',
        hypothesis: 'degraded',
        functionType: 'triangular',
        params: { a: 3, b: 8, c: 15 },
      },
      {
        source: 'temperature',
        hypothesis: 'fault',
        functionType: 'triangular',
        params: { a: 10, b: 20, c: 35 },
      },
      {
        source: 'temperature',
        hypothesis: 'critical',
        functionType: 'trapezoidal',
        params: { a: 25, b: 35, c: 100, d: 100 },
      },

      // ── 应力证据源（应力变化量 MPa） ──
      {
        source: 'stress',
        hypothesis: 'normal',
        functionType: 'trapezoidal',
        params: { a: 0, b: 0, c: 30, d: 50 },
      },
      {
        source: 'stress',
        hypothesis: 'degraded',
        functionType: 'triangular',
        params: { a: 35, b: 60, c: 90 },
      },
      {
        source: 'stress',
        hypothesis: 'fault',
        functionType: 'triangular',
        params: { a: 70, b: 100, c: 140 },
      },
      {
        source: 'stress',
        hypothesis: 'critical',
        functionType: 'trapezoidal',
        params: { a: 120, b: 150, c: 500, d: 500 },
      },

      // ── 风速证据源（60m 高度风速 m/s） ──
      {
        source: 'wind',
        hypothesis: 'normal',
        functionType: 'trapezoidal',
        params: { a: 0, b: 0, c: 7, d: 10 },
      },
      {
        source: 'wind',
        hypothesis: 'degraded',
        functionType: 'triangular',
        params: { a: 8, b: 12, c: 16 },
      },
      {
        source: 'wind',
        hypothesis: 'fault',
        functionType: 'triangular',
        params: { a: 14, b: 18, c: 22 },
      },
      {
        source: 'wind',
        hypothesis: 'critical',
        functionType: 'trapezoidal',
        params: { a: 20, b: 25, c: 100, d: 100 },
      },
    ],
  };
}

/**
 * 创建 BPABuilder 实例（工厂方法）
 */
export function createBPABuilder(
  config?: BpaConfig,
  options?: Partial<BPABuilderOptions>,
): BPABuilder {
  const effectiveConfig = config || createDefaultCraneBpaConfig();
  return new BPABuilder(effectiveConfig, options);
}
