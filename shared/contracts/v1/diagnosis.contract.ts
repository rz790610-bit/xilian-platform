/**
 * ============================================================================
 * 诊断契约类型 — Diagnosis Contracts v1
 * ============================================================================
 *
 * 统一的诊断结论类型，合并以下两个不兼容的旧定义：
 *
 *   1. 算法层 DiagnosisConclusion (server/algorithms/_core/types.ts)
 *      字段: summary, severity(4级ISO), urgency(4级), confidence,
 *            faultType?, rootCause?, recommendations?, referenceStandard?
 *
 *   2. HDE 层 DiagnosisConclusion (server/platform/hde/types/index.ts)
 *      字段: faultType, confidence, severity(4级), urgency(4级),
 *            physicsExplanation?, evidenceChain?
 *
 * 统一后：所有字段取并集，severity/urgency 引用 base.ts 统一枚举。
 *
 * 变更规则：
 *   PATCH — 仅文档/注释修改
 *   MINOR — 新增可选字段（向后兼容）
 *   MAJOR — 删除/重命名/类型变更（需创建 v2/）
 */

import type { SeverityLevel, UrgencyLevel, ConfidenceScore, MachineId, UnixTimestampMs } from './base';

// ============================================================================
// 诊断结论（统一）
// ============================================================================

/**
 * 统一诊断结论 — 全平台唯一定义
 *
 * 合并算法层 8 字段 + HDE 层 6 字段，去重后 10 字段。
 * severity/urgency 使用 base.ts 中的统一枚举。
 */
export interface DiagnosisConclusion {
  /** 结论摘要 — 人类可读的一句话描述 */
  summary: string;

  /** 故障类型（如有）— 编码体系内的故障编码或标准名称 */
  faultType?: string;

  /** 严重度 — 统一 5 级 */
  severity: SeverityLevel;

  /** 紧急度 — 统一 4 级 */
  urgency: UrgencyLevel;

  /** 置信度 [0, 1] — 禁止硬编码（ADR-001） */
  confidence: ConfidenceScore;

  /** 根因分析 — 物理机理层面的原因描述 */
  rootCause?: string;

  /** 物理解释 — 从物理机理角度的解释（HDE 层） */
  physicsExplanation?: string;

  /** 建议措施列表 */
  recommendations?: string[];

  /** 参考标准 — ISO/国标编号 */
  referenceStandard?: string;

  /** 证据链 — DS 融合的证据来源 */
  evidenceChain?: EvidenceItem[];
}

/**
 * 证据项 — 支撑诊断结论的单条证据
 */
export interface EvidenceItem {
  /** 证据来源标识 */
  source: string;

  /** 证据类型 */
  type: 'sensor' | 'model' | 'rule' | 'history' | 'expert';

  /** 证据描述 */
  description: string;

  /** 支持强度 [0, 1] */
  strength: ConfidenceScore;
}

// ============================================================================
// 诊断请求/响应（HDE 统一接口）
// ============================================================================

/**
 * 诊断请求
 */
export interface DiagnosisRequest {
  /** 设备 ID（统一命名） */
  machineId: MachineId;

  /** 诊断时间戳（Unix 毫秒） */
  timestamp: UnixTimestampMs;

  /** 传感器数据 — key 为传感器通道名 */
  sensorData: Record<string, number[]>;

  /** 诊断上下文 */
  context?: DiagnosisContext;
}

/**
 * 诊断上下文 — 辅助诊断的环境信息
 */
export interface DiagnosisContext {
  /** 工况阶段 */
  cyclePhase?: string;

  /** 载荷重量 (吨) */
  loadWeight?: number;

  /** 环境条件 */
  environment?: {
    windSpeed?: number;
    temperature?: number;
    humidity?: number;
  };

  /** 近期故障记录 */
  recentFaults?: string[];

  /** 自定义上下文 */
  custom?: Record<string, unknown>;
}

/**
 * 诊断结果
 */
export interface DiagnosisResult {
  /** 会话 ID */
  sessionId: string;

  /** 设备 ID */
  machineId: MachineId;

  /** 诊断时间戳 */
  timestamp: UnixTimestampMs;

  /** 诊断结论 — 使用统一类型 */
  diagnosis: DiagnosisConclusion;

  /** 建议动作列表 */
  recommendations: Recommendation[];

  /** 元数据 */
  metadata: Record<string, unknown>;

  /** 执行耗时 (ms) */
  durationMs: number;
}

/**
 * 建议动作
 */
export interface Recommendation {
  /** 优先级 — 使用统一严重度 */
  priority: SeverityLevel;

  /** 动作描述 */
  action: string;

  /** 理由 */
  rationale: string;

  /** 预计影响 */
  expectedImpact?: string;

  /** 物理依据 */
  physicsBasis?: string;
}
