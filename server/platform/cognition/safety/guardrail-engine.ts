/**
 * ============================================================================
 * 安全护栏引擎 (Guardrail Engine) — Phase 4 v5.0 升级版
 * ============================================================================
 *
 * 升级内容：
 *   G1: 趋势条件评估（EWMA + 线性回归）
 *   G2: 升级链（Escalation）— severity 驱动三级升级
 *   G5: 适用范围过滤 — null=全部适用，[]=不适用任何
 *   G7: DB 加载失败 Fallback — 12 条内置规则兜底
 *   G8: EWMA 趋势检测 — 默认算法
 *   G9: 告警严重度量化 — 三因子加权 0-1 连续值
 *
 * BUG 修复：
 *   BUG-1: trendBuffer 复合键 ${machineId}:${field}
 *   BUG-2: ActiveEscalation 仅在无活跃升级时创建新记录
 *   除零保护: baseline 接近 0 时使用绝对变化量
 *
 * 三类护栏规则（共 12 条内置）：
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ 类别   │ 规则ID │ 规则名称         │ 阈值          │ 物理依据           │
 * ├────────┼────────┼─────────────────┼──────────────┼───────────────────┤
 * │ 安全   │ S-01   │ 倾覆风险         │ >20%         │ K=M_stab/M_over   │
 * │ 安全   │ S-02   │ 风速超限         │ >13 m/s      │ GB/T 3811-2008    │
 * │ 安全   │ S-03   │ 振动超限         │ >4.5 mm/s    │ ISO 10816-3       │
 * │ 安全   │ S-04   │ 温度超限         │ >80°C        │ 轴承允许温升       │
 * │ 安全   │ S-05   │ 多因素叠加       │ ≥3维warning  │ 复合风险           │
 * ├────────┼────────┼─────────────────┼──────────────┼───────────────────┤
 * │ 健康   │ H-01   │ 疲劳临界         │ >80%         │ S-N曲线            │
 * │ 健康   │ H-02   │ 腐蚀加速         │ >0.7         │ r=k[Cl⁻][H]       │
 * │ 健康   │ H-03   │ 轴承退化         │ 状态=critical │ 温度+振动          │
 * │ 健康   │ H-04   │ 剩余寿命不足     │ <30天        │ 累积损伤           │
 * ├────────┼────────┼─────────────────┼──────────────┼───────────────────┤
 * │ 高效   │ E-01   │ 周期超时         │ >+20%        │ 基准偏差           │
 * │ 高效   │ E-02   │ 功率因数低       │ <0.75        │ 电气效率           │
 * │ 高效   │ E-03   │ 瓶颈累积         │ ≥2个瓶颈     │ 流程分析           │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import type { DiagnosisReport } from '../diagnosis/fusion-diagnosis.service';
import { createModuleLogger } from '../../../lib/logger';

const logger = createModuleLogger('guardrail-engine');

// ============================================================================
// 类型定义
// ============================================================================

/** 评估上下文 — 适用范围过滤使用 */
export interface EvalContext {
  equipmentType: string;
  conditionProfile: string;
}

export interface GuardrailRule {
  id: string;
  name: string;
  category: 'safety' | 'health' | 'efficiency';
  description: string;
  physicalBasis: string;
  enabled: boolean;
  priority: number; // 0=最高
  condition: GuardrailCondition;
  actions: GuardrailAction[];
  cooldownMs: number; // 触发冷却时间
  /** 适用设备类型（null=全部适用，[]=不适用任何） */
  applicableEquipment?: string[] | null;
  /** 适用工况（null=全部适用，[]=不适用任何） */
  applicableConditions?: string[] | null;
  /** 升级链配置 */
  escalationConfig?: {
    levels: Array<{ action: string; delayMs: number }>;
  } | null;
}

export interface GuardrailCondition {
  type: 'threshold' | 'compound' | 'trend' | 'custom';
  /** 阈值条件 */
  threshold?: {
    field: string;
    operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
    value: number;
  };
  /** 复合条件 */
  compound?: {
    logic: 'and' | 'or';
    conditions: GuardrailCondition[];
  };
  /** 趋势条件（G1 + G8） */
  trend?: {
    field: string;
    direction: 'increasing' | 'decreasing';
    windowSteps: number;
    minChangePercent: number;
    algorithm?: 'ewma' | 'linear_regression'; // 默认 'ewma'
    ewmaAlpha?: number;                       // 默认 0.3
  };
  /** 自定义评估函数名 */
  customEvaluator?: string;
}

export interface GuardrailAction {
  type: 'alert' | 'throttle' | 'halt' | 'schedule' | 'optimize' | 'log';
  parameters: Record<string, unknown>;
  message: string;
}

export interface GuardrailTriggerEvent {
  ruleId: string;
  ruleName: string;
  category: string;
  timestamp: number;
  machineId: string;
  triggerValues: Record<string, number>;
  actions: GuardrailAction[];
  /** 兼容旧版字符串 severity */
  severity: 'info' | 'warning' | 'critical' | 'emergency';
  /** G9: 量化严重度 0-1 连续值 */
  severityScore: number;
  acknowledged: boolean;
  /** G2: 当前升级级别 */
  escalationLevel: number;
  /** G7: 是否处于 fallback 模式 */
  fallbackMode?: boolean;
}

/** G2: 活跃升级记录 */
interface ActiveEscalation {
  ruleId: string;
  machineId: string;
  currentLevel: number;        // 1=ALERT, 2=THROTTLE, 3=HALT
  triggeredAt: number;
  lastEscalatedAt: number;
  lastCheckedAt: number;
  maxLevel: number;            // 从 escalation_config.levels.length 读取
  resolved: boolean;
  resolvedAt: number | null;
  violationId: number | null;  // 关联 DB 记录 ID（≥THROTTLE 时写入）
  severity: number;
}

export interface GuardrailEngineStats {
  totalEvaluations: number;
  totalTriggers: number;
  triggersByCategory: Record<string, number>;
  triggersByRule: Record<string, number>;
  lastEvaluationTime: number;
  activeAlerts: number;
  /** G7: 是否处于 fallback 模式 */
  fallbackMode: boolean;
  /** G2: 活跃升级数 */
  activeEscalations: number;
}

// ============================================================================
// 内置护栏规则（12 条）
// ============================================================================

export const BUILTIN_GUARDRAIL_RULES: GuardrailRule[] = [
  // ==================== 安全类 ====================
  {
    id: 'S-01', name: '倾覆风险', category: 'safety',
    description: '倾覆安全系数不足，风载+偏心力矩接近稳定力矩',
    physicalBasis: 'K = M_stabilizing / M_overturning < 1.25 (GB/T 3811-2008)',
    enabled: true, priority: 0, cooldownMs: 30000,
    condition: {
      type: 'threshold',
      threshold: { field: 'safety.overturningRisk', operator: 'gt', value: 0.20 },
    },
    actions: [
      { type: 'halt', parameters: { gracePeriodSec: 10 }, message: '倾覆风险超过20%，启动紧急停机' },
      { type: 'alert', parameters: { level: 'emergency', channels: ['sms', 'alarm'] }, message: '倾覆风险警报' },
    ],
    escalationConfig: {
      levels: [
        { action: 'alert', delayMs: 0 },
        { action: 'throttle', delayMs: 60000 },
        { action: 'halt', delayMs: 120000 },
      ],
    },
  },
  {
    id: 'S-02', name: '风速超限', category: 'safety',
    description: '风速超过安全作业限值',
    physicalBasis: 'GB/T 3811-2008 起重机设计规范：工作状态风速限值 13 m/s',
    enabled: true, priority: 0, cooldownMs: 60000,
    condition: {
      type: 'threshold',
      threshold: { field: 'cycleFeatures.windSpeedMean', operator: 'gt', value: 13 },
    },
    actions: [
      { type: 'halt', parameters: { gracePeriodSec: 30 }, message: '风速超过13m/s，停止作业并启动防风锚定' },
      { type: 'alert', parameters: { level: 'critical', channels: ['sms', 'alarm', 'dashboard'] }, message: '大风预警' },
    ],
    escalationConfig: {
      levels: [
        { action: 'alert', delayMs: 0 },
        { action: 'throttle', delayMs: 120000 },
        { action: 'halt', delayMs: 300000 },
      ],
    },
  },
  {
    id: 'S-03', name: '振动超限', category: 'safety',
    description: '结构振动超过安全阈值',
    physicalBasis: 'ISO 10816-3：振动烈度 Zone D (>4.5 mm/s) 可能造成损坏',
    enabled: true, priority: 1, cooldownMs: 60000,
    condition: {
      type: 'threshold',
      threshold: { field: 'cycleFeatures.vibrationRms', operator: 'gt', value: 4.5 },
    },
    actions: [
      { type: 'throttle', parameters: { speedPercent: 50 }, message: '振动超限，限速至50%' },
      { type: 'alert', parameters: { level: 'critical', channels: ['dashboard'] }, message: '振动超限警报' },
    ],
    escalationConfig: {
      levels: [
        { action: 'alert', delayMs: 0 },
        { action: 'throttle', delayMs: 90000 },
      ],
    },
  },
  {
    id: 'S-04', name: '温度超限', category: 'safety',
    description: '轴承温度超过允许值',
    physicalBasis: '轴承允许温升：绝对温度不超过80°C（ISO 1101）',
    enabled: true, priority: 1, cooldownMs: 120000,
    condition: {
      type: 'threshold',
      threshold: { field: 'cycleFeatures.temperatureBearing', operator: 'gt', value: 80 },
    },
    actions: [
      { type: 'throttle', parameters: { speedPercent: 30 }, message: '轴承过热，限速至30%' },
      { type: 'schedule', parameters: { urgency: 'immediate' }, message: '安排轴承检查' },
      { type: 'alert', parameters: { level: 'critical', channels: ['dashboard', 'sms'] }, message: '轴承温度超限' },
    ],
    escalationConfig: {
      levels: [
        { action: 'alert', delayMs: 0 },
        { action: 'throttle', delayMs: 90000 },
      ],
    },
  },
  {
    id: 'S-05', name: '多因素叠加', category: 'safety',
    description: '多个维度同时处于警告状态，复合风险',
    physicalBasis: '多因素耦合效应：单因素安全但叠加后风险非线性增长',
    enabled: true, priority: 0, cooldownMs: 60000,
    condition: {
      type: 'custom',
      customEvaluator: 'multiFactorCompound',
    },
    actions: [
      { type: 'throttle', parameters: { speedPercent: 50 }, message: '多因素叠加风险，限速至50%' },
      { type: 'alert', parameters: { level: 'critical', channels: ['dashboard', 'sms'] }, message: '多因素叠加警报' },
    ],
    escalationConfig: {
      levels: [
        { action: 'alert', delayMs: 0 },
        { action: 'throttle', delayMs: 60000 },
        { action: 'halt', delayMs: 120000 },
      ],
    },
  },

  // ==================== 健康类 ====================
  {
    id: 'H-01', name: '疲劳临界', category: 'health',
    description: '疲劳累积接近结构极限',
    physicalBasis: 'S-N曲线：疲劳累积>80%时剩余寿命不确定性急剧增大',
    enabled: true, priority: 1, cooldownMs: 3600000,
    condition: {
      type: 'threshold',
      threshold: { field: 'health.fatigueAccumPercent', operator: 'gt', value: 80 },
    },
    actions: [
      { type: 'throttle', parameters: { loadPercent: 70 }, message: '疲劳临界，限载至70%' },
      { type: 'schedule', parameters: { urgency: 'within_week', type: 'structural_inspection' }, message: '安排结构探伤检测' },
      { type: 'alert', parameters: { level: 'warning', channels: ['dashboard'] }, message: '疲劳累积警告' },
    ],
    escalationConfig: {
      levels: [
        { action: 'alert', delayMs: 0 },
        { action: 'throttle', delayMs: 90000 },
      ],
    },
  },
  {
    id: 'H-02', name: '腐蚀加速', category: 'health',
    description: '腐蚀指数超过安全阈值',
    physicalBasis: '腐蚀速率 r = k·[Cl⁻]·[humidity]，指数>0.7时壁厚减薄显著',
    enabled: true, priority: 2, cooldownMs: 86400000,
    condition: {
      type: 'threshold',
      threshold: { field: 'health.corrosionIndex', operator: 'gt', value: 0.7 },
    },
    actions: [
      { type: 'schedule', parameters: { urgency: 'within_month', type: 'corrosion_inspection' }, message: '安排腐蚀检测和防腐处理' },
      { type: 'alert', parameters: { level: 'warning', channels: ['dashboard'] }, message: '腐蚀加速警告' },
    ],
    escalationConfig: {
      levels: [
        { action: 'alert', delayMs: 0 },
        { action: 'throttle', delayMs: 90000 },
      ],
    },
  },
  {
    id: 'H-03', name: '轴承退化', category: 'health',
    description: '轴承健康状态严重退化',
    physicalBasis: '轴承温度+振动联合判据：温度>60°C且振动>2.8mm/s',
    enabled: true, priority: 1, cooldownMs: 3600000,
    condition: {
      type: 'custom',
      customEvaluator: 'bearingDegradation',
    },
    actions: [
      { type: 'throttle', parameters: { speedPercent: 60 }, message: '轴承退化，限速至60%' },
      { type: 'schedule', parameters: { urgency: 'within_week', type: 'bearing_replacement' }, message: '准备轴承更换' },
    ],
    escalationConfig: {
      levels: [
        { action: 'alert', delayMs: 0 },
        { action: 'throttle', delayMs: 90000 },
      ],
    },
  },
  {
    id: 'H-04', name: '剩余寿命不足', category: 'health',
    description: '预估剩余寿命不足30天',
    physicalBasis: '累积损伤理论：Miner线性累积损伤',
    enabled: true, priority: 1, cooldownMs: 86400000,
    condition: {
      type: 'threshold',
      threshold: { field: 'health.remainingLifeDays', operator: 'lt', value: 30 },
    },
    actions: [
      { type: 'schedule', parameters: { urgency: 'within_week', type: 'comprehensive_maintenance' }, message: '安排综合维护' },
      { type: 'alert', parameters: { level: 'warning', channels: ['dashboard', 'email'] }, message: '剩余寿命不足警告' },
    ],
    escalationConfig: {
      levels: [
        { action: 'alert', delayMs: 0 },
        { action: 'throttle', delayMs: 90000 },
      ],
    },
  },

  // ==================== 高效类 ====================
  {
    id: 'E-01', name: '周期超时', category: 'efficiency',
    description: '作业周期时间超过基准20%',
    physicalBasis: '基准偏差分析：>20%偏差表明存在系统性瓶颈',
    enabled: true, priority: 3, cooldownMs: 600000,
    condition: {
      type: 'threshold',
      threshold: { field: 'efficiency.deviationPercent', operator: 'gt', value: 20 },
    },
    actions: [
      { type: 'optimize', parameters: { target: 'cycle_time' }, message: '周期超时，建议优化作业流程' },
      { type: 'log', parameters: { level: 'info' }, message: '记录周期超时事件' },
    ],
    escalationConfig: {
      levels: [
        { action: 'alert', delayMs: 0 },
      ],
    },
  },
  {
    id: 'E-02', name: '功率因数低', category: 'efficiency',
    description: '电气系统功率因数偏低',
    physicalBasis: '功率因数<0.75表明无功功率过高，能耗浪费',
    enabled: true, priority: 3, cooldownMs: 3600000,
    condition: {
      type: 'threshold',
      threshold: { field: 'efficiency.powerFactor', operator: 'lt', value: 0.75 },
    },
    actions: [
      { type: 'optimize', parameters: { target: 'power_factor' }, message: '功率因数偏低，建议检查电容补偿' },
    ],
    escalationConfig: {
      levels: [
        { action: 'alert', delayMs: 0 },
      ],
    },
  },
  {
    id: 'E-03', name: '瓶颈累积', category: 'efficiency',
    description: '多个工况阶段存在瓶颈',
    physicalBasis: '流程分析：≥2个瓶颈表明系统性效率问题',
    enabled: true, priority: 3, cooldownMs: 3600000,
    condition: {
      type: 'custom',
      customEvaluator: 'bottleneckAccumulation',
    },
    actions: [
      { type: 'optimize', parameters: { target: 'bottleneck' }, message: '多瓶颈累积，建议全流程优化' },
      { type: 'log', parameters: { level: 'info' }, message: '记录瓶颈累积事件' },
    ],
    escalationConfig: {
      levels: [
        { action: 'alert', delayMs: 0 },
      ],
    },
  },
];

// ============================================================================
// G9: 告警严重度量化 — 三因子加权
// ============================================================================

/**
 * 计算量化严重度 (0-1)
 * @param margin 超限边距（归一化 0-1）
 * @param trendSlope 趋势斜率（归一化 0-1）
 * @param historicalFPR 历史误报率（0-1）
 */
export function computeSeverity(margin: number, trendSlope: number, historicalFPR: number): number {
  const marginScore = Math.min(1, Math.max(0, margin));
  const trendScore = Math.min(1, Math.max(0, Math.abs(trendSlope)));
  const reliabilityScore = 1 - Math.min(1, Math.max(0, historicalFPR));
  return marginScore * 0.5 + trendScore * 0.3 + reliabilityScore * 0.2;
}

// ============================================================================
// 护栏引擎
// ============================================================================

export class GuardrailEngine {
  private rules: Map<string, GuardrailRule> = new Map();
  private triggerHistory: GuardrailTriggerEvent[] = [];
  private lastTriggerTime: Map<string, number> = new Map();
  /** G1: 趋势缓冲区 — 复合键 ${machineId}:${field} (BUG-1 修复) */
  private trendBuffer: Map<string, number[]> = new Map();
  /** G2: 活跃升级记录 */
  private escalations: Map<string, ActiveEscalation> = new Map();
  /** G7: fallback 模式标志 */
  private fallbackMode: boolean = false;

  private stats: GuardrailEngineStats = {
    totalEvaluations: 0,
    totalTriggers: 0,
    triggersByCategory: {},
    triggersByRule: {},
    lastEvaluationTime: 0,
    activeAlerts: 0,
    fallbackMode: false,
    activeEscalations: 0,
  };

  // 回调
  private onTrigger?: (event: GuardrailTriggerEvent) => void;

  constructor(rules?: GuardrailRule[]) {
    const initialRules = rules || BUILTIN_GUARDRAIL_RULES;
    for (const rule of initialRules) {
      this.rules.set(rule.id, rule);
    }
  }

  /**
   * G7: 从 DB 加载规则（带 fallback）
   * 加载失败时保留 12 条内置规则，设置 fallbackMode=true
   */
  async loadRulesFromDb(loader: () => Promise<GuardrailRule[]>): Promise<void> {
    try {
      const dbRules = await loader();
      if (dbRules.length > 0) {
        // 完全替换语义：DB 规则覆盖内置规则
        this.rules.clear();
        for (const rule of dbRules) {
          this.rules.set(rule.id, rule);
        }
        this.fallbackMode = false;
        this.stats.fallbackMode = false;
        logger.info(`从 DB 加载 ${dbRules.length} 条护栏规则`);
      }
    } catch (error) {
      // Fallback: 保留 12 条内置规则
      this.fallbackMode = true;
      this.stats.fallbackMode = true;
      logger.error('DB 加载护栏规则失败，使用 12 条内置规则兜底', { error });
    }
  }

  /**
   * 评估诊断报告，触发护栏规则
   * G2: 先检查已有升级链
   * G5: 适用范围过滤（context 参数）
   */
  evaluate(
    machineId: string,
    report: DiagnosisReport,
    context?: EvalContext,
  ): GuardrailTriggerEvent[] {
    this.stats.totalEvaluations++;
    this.stats.lastEvaluationTime = Date.now();

    const triggered: GuardrailTriggerEvent[] = [];

    // G2: 先检查已有升级链是否需要升级（不受冷却限制）
    this.checkPendingEscalations();

    // 按优先级排序规则
    const sortedRules = Array.from(this.rules.values())
      .filter(r => r.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      // G5: 适用范围过滤
      if (!this.isApplicable(rule, context)) continue;

      // 冷却检查：仅控制新告警触发频率（G2: 已触发升级链独立运行）
      if (this.isInCooldown(rule.id, machineId)) continue;

      // 评估条件（G1: 传入 machineId 用于趋势缓冲区复合键）
      const result = this.evaluateCondition(rule.condition, report, machineId);

      if (result.matched) {
        // G9: 量化严重度
        const severityScore = result.severity > 0
          ? result.severity
          : computeSeverity(
              this.computeMargin(rule, result.values),
              0,
              0,
            );

        // G2: 处理升级链
        this.handleEscalation(rule.id, machineId, severityScore);

        const escalation = this.escalations.get(`${rule.id}:${machineId}`);

        const event: GuardrailTriggerEvent = {
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          timestamp: Date.now(),
          machineId,
          triggerValues: result.values,
          actions: rule.actions,
          severity: this.severityScoreToLevel(severityScore),
          severityScore,
          acknowledged: false,
          escalationLevel: escalation?.currentLevel ?? 1,
          fallbackMode: this.fallbackMode || undefined,
        };

        triggered.push(event);
        this.triggerHistory.push(event);
        this.lastTriggerTime.set(`${rule.id}:${machineId}`, Date.now());

        // 更新统计
        this.stats.totalTriggers++;
        this.stats.triggersByCategory[rule.category] = (this.stats.triggersByCategory[rule.category] || 0) + 1;
        this.stats.triggersByRule[rule.id] = (this.stats.triggersByRule[rule.id] || 0) + 1;

        // 回调
        this.onTrigger?.(event);
      }
    }

    this.stats.activeAlerts = this.triggerHistory.filter(e => !e.acknowledged).length;
    this.stats.activeEscalations = Array.from(this.escalations.values()).filter(e => !e.resolved).length;

    return triggered;
  }

  // ============================================================================
  // G1: 趋势条件评估（含 G8 EWMA）
  // ============================================================================

  /**
   * 评估条件 — 增加 machineId 参数用于趋势缓冲区复合键
   */
  private evaluateCondition(
    condition: GuardrailCondition,
    report: DiagnosisReport,
    machineId: string,
  ): { matched: boolean; values: Record<string, number>; severity: number } {
    const values: Record<string, number> = {};

    switch (condition.type) {
      case 'threshold': {
        if (!condition.threshold) return { matched: false, values, severity: 0 };
        const value = this.getNestedValue(report as unknown as Record<string, unknown>, condition.threshold.field);
        if (value === undefined) return { matched: false, values, severity: 0 };
        values[condition.threshold.field] = value;

        let matched = false;
        switch (condition.threshold.operator) {
          case 'gt': matched = value > condition.threshold.value; break;
          case 'lt': matched = value < condition.threshold.value; break;
          case 'gte': matched = value >= condition.threshold.value; break;
          case 'lte': matched = value <= condition.threshold.value; break;
          case 'eq': matched = value === condition.threshold.value; break;
        }

        // G9: 计算超限边距
        const margin = matched
          ? Math.abs(value - condition.threshold.value) / Math.max(Math.abs(condition.threshold.value), 0.001)
          : 0;

        return { matched, values, severity: matched ? Math.min(1, margin) : 0 };
      }

      case 'compound': {
        if (!condition.compound) return { matched: false, values, severity: 0 };
        const results = condition.compound.conditions.map(c => this.evaluateCondition(c, report, machineId));
        const allValues = results.reduce((acc, r) => ({ ...acc, ...r.values }), {} as Record<string, number>);
        const matched = condition.compound.logic === 'and'
          ? results.every(r => r.matched)
          : results.some(r => r.matched);
        const maxSeverity = Math.max(...results.map(r => r.severity), 0);
        return { matched, values: allValues, severity: matched ? maxSeverity : 0 };
      }

      case 'trend': {
        // G1 + G8: 趋势条件评估
        if (!condition.trend) return { matched: false, values: {}, severity: 0 };
        const { field, direction, windowSteps, minChangePercent, algorithm, ewmaAlpha } = condition.trend;
        const currentValue = this.getNestedValue(report as unknown as Record<string, unknown>, field);
        if (currentValue === undefined) return { matched: false, values: {}, severity: 0 };

        // BUG-1 修复：复合键 ${machineId}:${field}
        const bufferKey = `${machineId}:${field}`;
        const buffer = this.trendBuffer.get(bufferKey) ?? [];
        buffer.push(currentValue);
        if (buffer.length > windowSteps) buffer.shift();
        this.trendBuffer.set(bufferKey, buffer);
        if (buffer.length < windowSteps) return { matched: false, values: {}, severity: 0 };

        // G8: 默认使用 EWMA，线性回归可选
        const useEwma = algorithm !== 'linear_regression';
        const trendValue = useEwma
          ? this.ewmaDetect(buffer, ewmaAlpha ?? 0.3)
          : this.linearRegressionSlope(buffer);

        // 除零保护：baseline 接近 0 时使用绝对变化量
        const baseline = Math.abs(buffer[0]);
        const changePercent = baseline < 0.001
          ? Math.abs(trendValue * windowSteps) * 100
          : Math.abs(trendValue * windowSteps / baseline) * 100;

        const directionMatch = direction === 'increasing' ? trendValue > 0 : trendValue < 0;
        const trendValues: Record<string, number> = {
          [field]: currentValue,
          [`${field}_trend`]: trendValue,
          [`${field}_changePercent`]: changePercent,
        };

        const matched = directionMatch && changePercent >= minChangePercent;
        const severity = matched ? Math.min(1, changePercent / (minChangePercent * 3)) : 0;
        return { matched, values: trendValues, severity };
      }

      case 'custom': {
        return this.evaluateCustomCondition(condition.customEvaluator || '', report, machineId);
      }

      default:
        return { matched: false, values, severity: 0 };
    }
  }

  // ============================================================================
  // G8: EWMA 趋势检测
  // ============================================================================

  /**
   * EWMA (Exponentially Weighted Moving Average) 趋势检测
   * 返回最后一步的变化量（正=上升，负=下降）
   */
  private ewmaDetect(buffer: number[], alpha: number): number {
    if (buffer.length < 2) return 0;
    let ewma = buffer[0];
    let prevEwma = ewma;
    for (let i = 1; i < buffer.length; i++) {
      prevEwma = ewma;
      ewma = alpha * buffer[i] + (1 - alpha) * ewma;
    }
    return ewma - prevEwma;
  }

  /**
   * 线性回归斜率（备选算法）
   */
  private linearRegressionSlope(buffer: number[]): number {
    const n = buffer.length;
    if (n < 2) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += buffer[i];
      sumXY += i * buffer[i];
      sumX2 += i * i;
    }
    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return 0;
    return (n * sumXY - sumX * sumY) / denominator;
  }

  // ============================================================================
  // G2: 升级链（Escalation）
  // ============================================================================

  /**
   * 处理升级链 — 仅在无活跃升级时创建新记录（BUG-2 修复）
   */
  private handleEscalation(ruleId: string, machineId: string, severity: number): void {
    const baseKey = `${ruleId}:${machineId}`;
    const existing = this.escalations.get(baseKey);

    if (!existing || existing.resolved) {
      // 创建新升级记录
      const config = this.rules.get(ruleId)?.escalationConfig;
      const initialLevel = severity > 0.9 ? 3 : severity > 0.7 ? 2 : 1;
      this.escalations.set(baseKey, {
        ruleId,
        machineId,
        currentLevel: initialLevel,
        triggeredAt: Date.now(),
        lastEscalatedAt: Date.now(),
        lastCheckedAt: Date.now(),
        maxLevel: config?.levels?.length ?? 3,
        resolved: false,
        resolvedAt: null,
        violationId: null,
        severity,
      });
    } else {
      // 已有活跃升级：更新 severity，不重置 triggeredAt
      existing.severity = Math.max(existing.severity, severity);
      existing.lastCheckedAt = Date.now();
    }
  }

  /**
   * 检查待升级的升级链
   */
  private checkPendingEscalations(): void {
    const now = Date.now();
    for (const [key, esc] of this.escalations) {
      if (esc.resolved) continue;
      if (esc.currentLevel >= esc.maxLevel) continue;

      const rule = this.rules.get(esc.ruleId);
      if (!rule) continue;

      const delay = this.getEscalationDelay(rule, esc.currentLevel);
      if (now - esc.lastEscalatedAt >= delay) {
        esc.currentLevel++;
        esc.lastEscalatedAt = now;
        logger.warn(`升级链升级: ${key} → Level ${esc.currentLevel}`, {
          ruleId: esc.ruleId,
          machineId: esc.machineId,
          severity: esc.severity,
        });
      }
    }
  }

  /**
   * 升级延迟统一从 escalation_config 读取
   */
  private getEscalationDelay(rule: GuardrailRule, level: number): number {
    return rule.escalationConfig?.levels?.[level - 1]?.delayMs ?? 60000;
  }

  /**
   * 解除升级（确认/恢复）
   */
  resolveEscalation(ruleId: string, machineId: string): boolean {
    const key = `${ruleId}:${machineId}`;
    const esc = this.escalations.get(key);
    if (esc && !esc.resolved) {
      esc.resolved = true;
      esc.resolvedAt = Date.now();
      return true;
    }
    return false;
  }

  /**
   * 获取活跃升级列表
   */
  getActiveEscalations(): ActiveEscalation[] {
    return Array.from(this.escalations.values()).filter(e => !e.resolved);
  }

  // ============================================================================
  // G5: 适用范围过滤
  // ============================================================================

  /**
   * 适用范围过滤（语义明确化）
   * null = 适用所有
   * [] = 不适用任何
   */
  private isApplicable(rule: GuardrailRule, context?: EvalContext): boolean {
    if (context?.equipmentType !== undefined) {
      if (rule.applicableEquipment === null || rule.applicableEquipment === undefined) {
        /* null/undefined = 适用所有 */
      } else if (rule.applicableEquipment.length === 0) {
        return false; // [] = 不适用任何
      } else if (!rule.applicableEquipment.includes(context.equipmentType)) {
        return false;
      }
    }
    if (context?.conditionProfile !== undefined) {
      if (rule.applicableConditions === null || rule.applicableConditions === undefined) {
        /* null/undefined = 适用所有 */
      } else if (rule.applicableConditions.length === 0) {
        return false;
      } else if (!rule.applicableConditions.includes(context.conditionProfile)) {
        return false;
      }
    }
    return true;
  }

  /**
   * 冷却检查
   */
  private isInCooldown(ruleId: string, machineId: string): boolean {
    const key = `${ruleId}:${machineId}`;
    const lastTrigger = this.lastTriggerTime.get(key) || 0;
    const rule = this.rules.get(ruleId);
    return Date.now() - lastTrigger < (rule?.cooldownMs ?? 60000);
  }

  // ============================================================================
  // 自定义条件评估
  // ============================================================================

  private evaluateCustomCondition(
    evaluator: string,
    report: DiagnosisReport,
    _machineId: string,
  ): { matched: boolean; values: Record<string, number>; severity: number } {
    switch (evaluator) {
      case 'multiFactorCompound': {
        let warningCount = 0;
        const values: Record<string, number> = {};

        if (report.safety.score < 0.7) { warningCount++; values['safety.score'] = report.safety.score; }
        if (report.health.score < 0.6) { warningCount++; values['health.score'] = report.health.score; }
        if (report.efficiency.score < 0.6) { warningCount++; values['efficiency.score'] = report.efficiency.score; }
        if (report.prediction.confidence < 0.5) { warningCount++; values['prediction.confidence'] = report.prediction.confidence; }
        if (report.safety.overturningRisk > 0.15) { warningCount++; values['safety.overturningRisk'] = report.safety.overturningRisk; }

        const matched = warningCount >= 3;
        const severity = matched ? Math.min(1, warningCount / 5) : 0;
        return { matched, values, severity };
      }

      case 'bearingDegradation': {
        const temp = report.health.bearingHealth.temperature;
        const vib = report.health.bearingHealth.vibrationRms;
        const matched = report.health.bearingHealth.status === 'critical' || (temp > 60 && vib > 2.8);
        const severity = matched ? Math.min(1, (temp / 80 + vib / 4.5) / 2) : 0;
        return {
          matched,
          values: { 'bearingTemp': temp, 'bearingVib': vib },
          severity,
        };
      }

      case 'bottleneckAccumulation': {
        const count = report.efficiency.bottlenecks.length;
        const matched = count >= 2;
        return {
          matched,
          values: { 'bottleneckCount': count },
          severity: matched ? Math.min(1, count / 5) : 0,
        };
      }

      default:
        return { matched: false, values: {}, severity: 0 };
    }
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * 获取嵌套属性值
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): number | undefined {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return typeof current === 'number' ? current : undefined;
  }

  /**
   * G9: 计算超限边距（归一化 0-1）
   */
  private computeMargin(rule: GuardrailRule, values: Record<string, number>): number {
    if (!rule.condition.threshold) return 0.5;
    const field = rule.condition.threshold.field;
    const value = values[field];
    if (value === undefined) return 0;
    const threshold = rule.condition.threshold.value;
    if (threshold === 0) return Math.min(1, Math.abs(value));
    return Math.min(1, Math.abs(value - threshold) / Math.abs(threshold));
  }

  /**
   * G9: 量化严重度 → 字符串级别
   */
  private severityScoreToLevel(score: number): GuardrailTriggerEvent['severity'] {
    if (score > 0.9) return 'emergency';
    if (score > 0.7) return 'critical';
    if (score > 0.4) return 'warning';
    return 'info';
  }

  // ============================================================================
  // 管理接口
  // ============================================================================

  /** 启用/禁用规则 */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.get(ruleId);
    if (rule) rule.enabled = enabled;
  }

  /** 更新规则阈值 */
  updateRuleThreshold(ruleId: string, value: number): void {
    const rule = this.rules.get(ruleId);
    if (rule?.condition.threshold) {
      rule.condition.threshold.value = value;
    }
  }

  /** 注册新规则 */
  registerRule(rule: GuardrailRule): void {
    this.rules.set(rule.id, rule);
  }

  /** 确认告警 */
  acknowledgeAlert(eventIndex: number): void {
    if (this.triggerHistory[eventIndex]) {
      this.triggerHistory[eventIndex].acknowledged = true;
      this.stats.activeAlerts = this.triggerHistory.filter(e => !e.acknowledged).length;
    }
  }

  /** 获取触发历史 */
  getTriggerHistory(limit: number = 100): GuardrailTriggerEvent[] {
    return this.triggerHistory.slice(-limit);
  }

  /** 获取统计 */
  getStats(): GuardrailEngineStats {
    return { ...this.stats };
  }

  /** 获取所有规则 */
  getAllRules(): GuardrailRule[] {
    return Array.from(this.rules.values());
  }

  /** 获取规则数量 */
  getRuleCount(): number {
    return this.rules.size;
  }

  /** 是否处于 fallback 模式 */
  isFallbackMode(): boolean {
    return this.fallbackMode;
  }

  /** 设置触发回调 */
  setOnTrigger(callback: (event: GuardrailTriggerEvent) => void): void {
    this.onTrigger = callback;
  }

  /** 清除趋势缓冲区（用于测试或设备下线） */
  clearTrendBuffer(machineId?: string): void {
    if (machineId) {
      for (const key of this.trendBuffer.keys()) {
        if (key.startsWith(`${machineId}:`)) {
          this.trendBuffer.delete(key);
        }
      }
    } else {
      this.trendBuffer.clear();
    }
  }
}
