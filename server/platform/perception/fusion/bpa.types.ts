/**
 * ============================================================================
 * BPA 构建器类型定义 — 可配置、可追溯、可复用
 * ============================================================================
 *
 * 定义 Dempster-Shafer 证据融合的输入/输出类型：
 *   - SensorStats：感知层输出的特征向量（可扩展）
 *   - BasicProbabilityAssignment：信念质量分配
 *   - BpaRule：单条模糊隶属度规则
 *   - BpaConfig：完整的 BPA 配置（假设空间 + 规则集）
 *   - 三种模糊函数参数：梯形、三角形、高斯
 *
 * 设计原则：
 *   - 所有类型均为纯数据结构，无行为逻辑
 *   - SensorStats 通过索引签名支持任意扩展
 *   - BpaConfig 从数据库加载，前端可编辑
 *   - 与感知层 DS 引擎（Map<string,number>）和认知层 DS 引擎（Record<string,number>）均兼容
 */

// ============================================================================
// 传感器统计特征向量
// ============================================================================

/**
 * 感知层输出的传感器统计特征向量
 *
 * 核心字段覆盖港口岸桥/场桥主要传感器类型，
 * 通过索引签名 [key: string]: number 支持任意扩展。
 */
export interface SensorStats {
  /** 振动 RMS (mm/s) */
  vibrationRms: number;
  /** 温度偏差 (℃)，相对于基线温度的偏差 */
  temperatureDev: number;
  /** 电流峰值 (A) */
  currentPeak: number;
  /** 应力变化量 (MPa) */
  stressDelta: number;
  /** 60m 高度风速 (m/s) */
  windSpeed60m: number;
  /** 可扩展：任意传感器统计值 */
  [key: string]: number;
}

// ============================================================================
// 信念质量分配（BPA）
// ============================================================================

/**
 * 基本概率分配 — Dempster-Shafer 证据理论核心数据结构
 *
 * m(A) 表示对假设 A 的信念质量，
 * ignorance = m(Θ) 表示对全集的不确定性（剩余信念）。
 *
 * 约束：Σm(A) + m(Θ) = 1
 */
export interface BasicProbabilityAssignment {
  /** 各假设的信念质量 m(A)，key 为假设名称 */
  m: Record<string, number>;
  /** 不确定性 m(Θ)，即剩余信念分配给全集 */
  ignorance: number;
}

// ============================================================================
// 模糊隶属度函数参数
// ============================================================================

/** 模糊函数类型 */
export type FuzzyFunctionType = 'trapezoidal' | 'triangular' | 'gaussian';

/**
 * 梯形隶属度函数参数
 *
 * 形状：
 *        b_____c
 *       /       \
 *      /         \
 *   __/           \__
 *   a               d
 *
 * μ(x) =
 *   0                   if x <= a
 *   (x - a) / (b - a)  if a < x <= b
 *   1                   if b < x <= c
 *   (d - x) / (d - c)  if c < x <= d
 *   0                   if x > d
 */
export interface TrapezoidalParams {
  a: number;
  b: number;
  c: number;
  d: number;
}

/**
 * 三角形隶属度函数参数
 *
 * 形状：
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
export interface TriangularParams {
  a: number;
  b: number;
  c: number;
}

/**
 * 高斯隶属度函数参数
 *
 * μ(x) = exp(-(x - μ)² / (2σ²))
 */
export interface GaussianParams {
  mu: number;
  sigma: number;
}

/** 模糊函数参数联合类型 */
export type FuzzyFunctionParams = TrapezoidalParams | TriangularParams | GaussianParams;

// ============================================================================
// BPA 规则与配置
// ============================================================================

/**
 * 单条 BPA 规则 — 定义一个证据源对一个假设的模糊映射
 *
 * 示例：
 *   { source: 'vibration', hypothesis: 'BearingFatigue',
 *     functionType: 'triangular', params: { a: 4, b: 7, c: 10 } }
 *
 * 含义：当振动 RMS 在 4~10 mm/s 范围内时，
 *        对"轴承疲劳"假设产生信念，峰值在 7 mm/s。
 */
export interface BpaRule {
  /** 证据源标识（对应 SensorStats 的取值逻辑） */
  source: string;
  /** 目标假设名称 */
  hypothesis: string;
  /** 模糊函数类型 */
  functionType: FuzzyFunctionType;
  /** 模糊函数参数 */
  params: FuzzyFunctionParams;
}

/**
 * BPA 完整配置 — 假设空间 + 规则集
 *
 * 从 bpa_configs 表加载，前端可编辑。
 * 每种设备类型/工况可以有不同的配置。
 */
export interface BpaConfig {
  /** 假设空间（辨识框架 Θ 的元素） */
  hypotheses: string[];
  /** 模糊隶属度规则集 */
  rules: BpaRule[];
}

// ============================================================================
// BPA 构建日志（可追溯）
// ============================================================================

/**
 * BPA 构建日志条目 — 记录每次 BPA 构建的完整过程
 *
 * 用于审计追溯：谁（source）在什么时候（timestamp）
 * 用什么输入（inputStats）和什么规则（appliedRules）
 * 产生了什么输出（outputBpa）。
 */
export interface BpaConstructionLog {
  /** 时间戳 */
  timestamp: Date;
  /** 证据源 */
  source: string;
  /** 输入的传感器统计值 */
  inputStats: SensorStats;
  /** 输入值（从 SensorStats 中提取的具体值） */
  inputValue: number;
  /** 应用的规则 */
  appliedRules: Array<{
    hypothesis: string;
    functionType: FuzzyFunctionType;
    rawMembership: number;
    normalizedMass: number;
  }>;
  /** 输出的 BPA */
  outputBpa: BasicProbabilityAssignment;
  /** 使用的配置版本 */
  configVersion: string;
  /** 设备/机器 ID */
  machineId?: string;
}

// ============================================================================
// 适配器类型 — 连接 BPABuilder 与两个 DS 引擎
// ============================================================================

/**
 * 将 BasicProbabilityAssignment 转换为感知层 DS 引擎的 BPA 格式
 * 感知层引擎使用 Map<string, number>
 */
export function toPerceptionBPA(
  bpa: BasicProbabilityAssignment,
  sourceName: string,
  weight: number = 1.0,
  reliability: number = 1.0,
): {
  masses: Map<string, number>;
  sourceName: string;
  weight: number;
  reliability: number;
  timestamp: number;
} {
  const masses = new Map<string, number>();
  for (const [hyp, mass] of Object.entries(bpa.m)) {
    if (mass > 0) {
      masses.set(hyp, mass);
    }
  }
  // ignorance → theta（全集）
  if (bpa.ignorance > 0) {
    // 用所有假设的逗号拼接作为全集 key
    const thetaKey = Object.keys(bpa.m).join(',');
    masses.set(thetaKey, (masses.get(thetaKey) || 0) + bpa.ignorance);
  }

  return {
    masses,
    sourceName,
    weight,
    reliability,
    timestamp: Date.now(),
  };
}

/**
 * 将 BasicProbabilityAssignment 转换为认知层 DS 引擎的 DSEvidenceInput 格式
 * 认知层引擎使用 Record<string, number>
 */
export function toCognitionEvidence(
  bpa: BasicProbabilityAssignment,
  sourceId: string,
): {
  sourceId: string;
  beliefMass: Record<string, number>;
  timestamp: Date;
} {
  const beliefMass: Record<string, number> = { ...bpa.m };
  // ignorance → theta
  if (bpa.ignorance > 0) {
    beliefMass.theta = (beliefMass.theta || 0) + bpa.ignorance;
  }

  return {
    sourceId,
    beliefMass,
    timestamp: new Date(),
  };
}
