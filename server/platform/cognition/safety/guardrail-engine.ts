/**
 * ============================================================================
 * 安全护栏引擎 (Guardrail Engine)
 * ============================================================================
 *
 * 三类护栏规则（共 12 条）：
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
 *
 * 护栏动作：
 *   - ALERT:    发送告警通知
 *   - THROTTLE: 限速/降载
 *   - HALT:     紧急停机
 *   - SCHEDULE: 安排维护
 *   - OPTIMIZE: 优化建议
 */

import type { DiagnosisReport } from '../diagnosis/fusion-diagnosis.service';

// ============================================================================
// 类型定义
// ============================================================================

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
  /** 趋势条件 */
  trend?: {
    field: string;
    direction: 'increasing' | 'decreasing';
    windowSteps: number;
    minChangePercent: number;
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
  severity: 'info' | 'warning' | 'critical' | 'emergency';
  acknowledged: boolean;
}

export interface GuardrailEngineStats {
  totalEvaluations: number;
  totalTriggers: number;
  triggersByCategory: Record<string, number>;
  triggersByRule: Record<string, number>;
  lastEvaluationTime: number;
  activeAlerts: number;
}

// ============================================================================
// 内置护栏规则
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
      { type: 'optimize', parameters: { target: 'bottleneck_resolution' }, message: '多瓶颈累积，建议系统性优化' },
    ],
  },
];

// ============================================================================
// 护栏引擎
// ============================================================================

export class GuardrailEngine {
  private rules: Map<string, GuardrailRule> = new Map();
  private triggerHistory: GuardrailTriggerEvent[] = [];
  private lastTriggerTime: Map<string, number> = new Map();
  private stats: GuardrailEngineStats = {
    totalEvaluations: 0,
    totalTriggers: 0,
    triggersByCategory: {},
    triggersByRule: {},
    lastEvaluationTime: 0,
    activeAlerts: 0,
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
   * 评估诊断报告，触发护栏规则
   */
  evaluate(machineId: string, report: DiagnosisReport): GuardrailTriggerEvent[] {
    this.stats.totalEvaluations++;
    this.stats.lastEvaluationTime = Date.now();

    const triggered: GuardrailTriggerEvent[] = [];

    // 按优先级排序规则
    const sortedRules = Array.from(this.rules.values())
      .filter(r => r.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      // 冷却检查
      const lastTrigger = this.lastTriggerTime.get(rule.id) || 0;
      if (Date.now() - lastTrigger < rule.cooldownMs) continue;

      // 评估条件
      const { matched, values } = this.evaluateCondition(rule.condition, report);

      if (matched) {
        const event: GuardrailTriggerEvent = {
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          timestamp: Date.now(),
          machineId,
          triggerValues: values,
          actions: rule.actions,
          severity: this.determineSeverity(rule),
          acknowledged: false,
        };

        triggered.push(event);
        this.triggerHistory.push(event);
        this.lastTriggerTime.set(rule.id, Date.now());

        // 更新统计
        this.stats.totalTriggers++;
        this.stats.triggersByCategory[rule.category] = (this.stats.triggersByCategory[rule.category] || 0) + 1;
        this.stats.triggersByRule[rule.id] = (this.stats.triggersByRule[rule.id] || 0) + 1;

        // 回调
        this.onTrigger?.(event);
      }
    }

    this.stats.activeAlerts = this.triggerHistory.filter(e => !e.acknowledged).length;

    return triggered;
  }

  /**
   * 评估条件
   */
  private evaluateCondition(
    condition: GuardrailCondition,
    report: DiagnosisReport
  ): { matched: boolean; values: Record<string, number> } {
    const values: Record<string, number> = {};

    switch (condition.type) {
      case 'threshold': {
        if (!condition.threshold) return { matched: false, values };
        const value = this.getNestedValue(report as unknown as Record<string, unknown>, condition.threshold.field);
        if (value === undefined) return { matched: false, values };
        values[condition.threshold.field] = value;

        let matched = false;
        switch (condition.threshold.operator) {
          case 'gt': matched = value > condition.threshold.value; break;
          case 'lt': matched = value < condition.threshold.value; break;
          case 'gte': matched = value >= condition.threshold.value; break;
          case 'lte': matched = value <= condition.threshold.value; break;
          case 'eq': matched = value === condition.threshold.value; break;
        }
        return { matched, values };
      }

      case 'compound': {
        if (!condition.compound) return { matched: false, values };
        const results = condition.compound.conditions.map(c => this.evaluateCondition(c, report));
        const allValues = results.reduce((acc, r) => ({ ...acc, ...r.values }), {});
        const matched = condition.compound.logic === 'and'
          ? results.every(r => r.matched)
          : results.some(r => r.matched);
        return { matched, values: allValues };
      }

      case 'custom': {
        return this.evaluateCustomCondition(condition.customEvaluator || '', report);
      }

      default:
        return { matched: false, values };
    }
  }

  /**
   * 自定义条件评估
   */
  private evaluateCustomCondition(
    evaluator: string,
    report: DiagnosisReport
  ): { matched: boolean; values: Record<string, number> } {
    switch (evaluator) {
      case 'multiFactorCompound': {
        // ≥3 个维度处于 warning 状态
        let warningCount = 0;
        const values: Record<string, number> = {};

        if (report.safety.score < 0.7) { warningCount++; values['safety.score'] = report.safety.score; }
        if (report.health.score < 0.6) { warningCount++; values['health.score'] = report.health.score; }
        if (report.efficiency.score < 0.6) { warningCount++; values['efficiency.score'] = report.efficiency.score; }
        if (report.prediction.confidence < 0.5) { warningCount++; values['prediction.confidence'] = report.prediction.confidence; }
        if (report.safety.overturningRisk > 0.15) { warningCount++; values['safety.overturningRisk'] = report.safety.overturningRisk; }

        return { matched: warningCount >= 3, values };
      }

      case 'bearingDegradation': {
        const temp = report.health.bearingHealth.temperature;
        const vib = report.health.bearingHealth.vibrationRms;
        return {
          matched: report.health.bearingHealth.status === 'critical' || (temp > 60 && vib > 2.8),
          values: { 'bearingTemp': temp, 'bearingVib': vib },
        };
      }

      case 'bottleneckAccumulation': {
        const count = report.efficiency.bottlenecks.length;
        return {
          matched: count >= 2,
          values: { 'bottleneckCount': count },
        };
      }

      default:
        return { matched: false, values: {} };
    }
  }

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
   * 确定严重程度
   */
  private determineSeverity(rule: GuardrailRule): GuardrailTriggerEvent['severity'] {
    if (rule.priority === 0) return 'emergency';
    if (rule.priority === 1) return 'critical';
    if (rule.priority === 2) return 'warning';
    return 'info';
  }

  // ============================================================================
  // 管理接口
  // ============================================================================

  /**
   * 启用/禁用规则
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.get(ruleId);
    if (rule) rule.enabled = enabled;
  }

  /**
   * 更新规则阈值
   */
  updateRuleThreshold(ruleId: string, value: number): void {
    const rule = this.rules.get(ruleId);
    if (rule?.condition.threshold) {
      rule.condition.threshold.value = value;
    }
  }

  /**
   * 注册新规则
   */
  registerRule(rule: GuardrailRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * 确认告警
   */
  acknowledgeAlert(eventIndex: number): void {
    if (this.triggerHistory[eventIndex]) {
      this.triggerHistory[eventIndex].acknowledged = true;
      this.stats.activeAlerts = this.triggerHistory.filter(e => !e.acknowledged).length;
    }
  }

  /**
   * 获取触发历史
   */
  getTriggerHistory(limit: number = 100): GuardrailTriggerEvent[] {
    return this.triggerHistory.slice(-limit);
  }

  /**
   * 获取统计
   */
  getStats(): GuardrailEngineStats {
    return { ...this.stats };
  }

  /**
   * 获取所有规则
   */
  getAllRules(): GuardrailRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 设置触发回调
   */
  setOnTrigger(callback: (event: GuardrailTriggerEvent) => void): void {
    this.onTrigger = callback;
  }
}
