/**
 * ============================================================================
 * 知识结晶器 (Knowledge Crystallizer)
 * ============================================================================
 *
 * 自进化飞轮第 5 步：反馈结晶
 *
 * 核心能力：
 *   1. 模式发现：从诊断历史中发现重复模式
 *   2. 规则提取：将模式转化为可执行的护栏规则
 *   3. 知识图谱注入：将发现注入知识图谱
 *   4. 跨工况迁移：从一个场景迁移知识到另一个场景
 *   5. 知识评审：人工审核 + 自动验证
 *
 * 结晶流程：
 *   诊断历史 → 模式挖掘 → 置信度评估 → 规则生成 → 人工审核 → 注入
 *
 * 示例：
 *   输入：100 次诊断报告（日照港岸桥）
 *   发现：风速 > 9m/s + 偏心 > 0.3 → 疲劳增速 2.5x
 *   输出：新护栏规则 + KG 三元组 + 跨工况迁移建议
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface DiagnosisHistoryEntry {
  reportId: string;
  machineId: string;
  timestamp: number;
  cyclePhase: string;
  safetyScore: number;
  healthScore: number;
  efficiencyScore: number;
  overallScore: number;
  riskLevel: string;
  keyMetrics: Record<string, number>;
  recommendations: { priority: string; action: string }[];
  metadata?: Record<string, unknown>;
}

export interface DiscoveredPattern {
  patternId: string;
  name: string;
  description: string;
  /** 触发条件 */
  conditions: PatternCondition[];
  /** 后果 */
  consequences: PatternConsequence[];
  /** 置信度 (0-1) */
  confidence: number;
  /** 支持度（出现次数/总样本） */
  support: number;
  /** 发现时间 */
  discoveredAt: number;
  /** 来源场景 */
  sourceScenario: string;
  /** 状态 */
  status: 'discovered' | 'validated' | 'approved' | 'injected' | 'rejected';
}

export interface PatternCondition {
  field: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'between' | 'eq';
  value: number | [number, number];
}

export interface PatternConsequence {
  effect: string;
  magnitude: number;
  unit: string;
  physicalExplanation: string;
}

export interface CrystallizedKnowledge {
  knowledgeId: string;
  sourcePattern: string;
  type: 'guardrail_rule' | 'kg_triple' | 'feature_weight' | 'threshold_update';
  content: Record<string, unknown>;
  applicableScenarios: string[];
  validatedBy: string;
  validatedAt: number;
}

export interface MigrationSuggestion {
  sourceScenario: string;
  targetScenario: string;
  pattern: DiscoveredPattern;
  adaptations: { field: string; sourceRange: string; suggestedRange: string; reason: string }[];
  confidence: number;
}

// ============================================================================
// 知识结晶器
// ============================================================================

export class KnowledgeCrystallizer {
  private patterns: Map<string, DiscoveredPattern> = new Map();
  private crystallized: Map<string, CrystallizedKnowledge> = new Map();
  private migrationSuggestions: MigrationSuggestion[] = [];

  /**
   * 从诊断历史中挖掘模式
   */
  discoverPatterns(history: DiagnosisHistoryEntry[]): DiscoveredPattern[] {
    const discovered: DiscoveredPattern[] = [];

    // 模式 1：高风+偏心 → 疲劳加速
    discovered.push(...this.discoverWindEccentricityPattern(history));

    // 模式 2：温度+振动联合退化
    discovered.push(...this.discoverBearingDegradationPattern(history));

    // 模式 3：周期效率与负载的关系
    discovered.push(...this.discoverEfficiencyLoadPattern(history));

    // 模式 4：季节性腐蚀加速
    discovered.push(...this.discoverSeasonalCorrosionPattern(history));

    // 模式 5：连续作业疲劳累积
    discovered.push(...this.discoverContinuousOperationPattern(history));

    for (const pattern of discovered) {
      this.patterns.set(pattern.patternId, pattern);
    }

    return discovered;
  }

  /**
   * 模式 1：高风+偏心 → 疲劳加速
   */
  private discoverWindEccentricityPattern(history: DiagnosisHistoryEntry[]): DiscoveredPattern[] {
    const highWindEccentric = history.filter(h =>
      (h.keyMetrics['windSpeedMean'] ?? 0) > 9 &&
      (h.keyMetrics['loadEccentricity'] ?? 0) > 0.3
    );

    const normalCondition = history.filter(h =>
      (h.keyMetrics['windSpeedMean'] ?? 0) <= 9 &&
      (h.keyMetrics['loadEccentricity'] ?? 0) <= 0.3
    );

    if (highWindEccentric.length < 5 || normalCondition.length < 5) return [];

    const avgFatigueHigh = highWindEccentric.reduce((s, h) => s + (h.keyMetrics['fatigueIncrement'] ?? 0), 0) / highWindEccentric.length;
    const avgFatigueNormal = normalCondition.reduce((s, h) => s + (h.keyMetrics['fatigueIncrement'] ?? 0), 0) / normalCondition.length;

    const ratio = avgFatigueNormal > 0 ? avgFatigueHigh / avgFatigueNormal : 1;

    if (ratio > 1.5) {
      return [{
        patternId: `pattern_wind_eccentric_${Date.now()}`,
        name: '高风偏心疲劳加速',
        description: `风速>9m/s且偏心>0.3时，疲劳增速为正常的${ratio.toFixed(1)}倍`,
        conditions: [
          { field: 'windSpeedMean', operator: 'gt', value: 9 },
          { field: 'loadEccentricity', operator: 'gt', value: 0.3 },
        ],
        consequences: [{
          effect: '疲劳增速倍率',
          magnitude: ratio,
          unit: 'x',
          physicalExplanation: `风载力矩 M=½ρv²Ah/2 与偏心力矩叠加，总弯矩增大导致 Δσ=k·M/W 显著增加`,
        }],
        confidence: Math.min(0.95, highWindEccentric.length / (highWindEccentric.length + 10)),
        support: highWindEccentric.length / history.length,
        discoveredAt: Date.now(),
        sourceScenario: 'port_crane',
        status: 'discovered',
      }];
    }

    return [];
  }

  /**
   * 模式 2：轴承退化模式
   */
  private discoverBearingDegradationPattern(history: DiagnosisHistoryEntry[]): DiscoveredPattern[] {
    const degraded = history.filter(h =>
      (h.keyMetrics['temperatureBearing'] ?? 0) > 55 &&
      (h.keyMetrics['vibrationRms'] ?? 0) > 2.0
    );

    if (degraded.length < 3) return [];

    return [{
      patternId: `pattern_bearing_degrade_${Date.now()}`,
      name: '轴承联合退化',
      description: `轴承温度>55°C且振动>2.0mm/s时，设备健康分数平均下降${((1 - degraded.reduce((s, h) => s + h.healthScore, 0) / degraded.length) * 100).toFixed(0)}%`,
      conditions: [
        { field: 'temperatureBearing', operator: 'gt', value: 55 },
        { field: 'vibrationRms', operator: 'gt', value: 2.0 },
      ],
      consequences: [{
        effect: '健康分数下降',
        magnitude: 1 - degraded.reduce((s, h) => s + h.healthScore, 0) / degraded.length,
        unit: '',
        physicalExplanation: '轴承润滑失效导致摩擦增大（温升）和间隙增大（振动），形成正反馈退化',
      }],
      confidence: Math.min(0.9, degraded.length / (degraded.length + 5)),
      support: degraded.length / history.length,
      discoveredAt: Date.now(),
      sourceScenario: 'port_crane',
      status: 'discovered',
    }];
  }

  /**
   * 模式 3：效率-负载关系
   */
  private discoverEfficiencyLoadPattern(history: DiagnosisHistoryEntry[]): DiscoveredPattern[] {
    const heavyLoad = history.filter(h => (h.keyMetrics['loadWeight'] ?? 0) > 30);
    const lightLoad = history.filter(h => (h.keyMetrics['loadWeight'] ?? 0) <= 15 && (h.keyMetrics['loadWeight'] ?? 0) > 0);

    if (heavyLoad.length < 5 || lightLoad.length < 5) return [];

    const avgEffHeavy = heavyLoad.reduce((s, h) => s + h.efficiencyScore, 0) / heavyLoad.length;
    const avgEffLight = lightLoad.reduce((s, h) => s + h.efficiencyScore, 0) / lightLoad.length;
    const drop = avgEffLight - avgEffHeavy;

    if (drop > 0.1) {
      return [{
        patternId: `pattern_load_efficiency_${Date.now()}`,
        name: '重载效率下降',
        description: `载荷>30吨时，效率分数平均下降${(drop * 100).toFixed(0)}%`,
        conditions: [
          { field: 'loadWeight', operator: 'gt', value: 30 },
        ],
        consequences: [{
          effect: '效率分数下降',
          magnitude: drop,
          unit: '',
          physicalExplanation: '重载增加电机负载和机械阻力，延长周期时间',
        }],
        confidence: Math.min(0.85, heavyLoad.length / (heavyLoad.length + 10)),
        support: heavyLoad.length / history.length,
        discoveredAt: Date.now(),
        sourceScenario: 'port_crane',
        status: 'discovered',
      }];
    }

    return [];
  }

  /**
   * 模式 4：季节性腐蚀
   */
  private discoverSeasonalCorrosionPattern(history: DiagnosisHistoryEntry[]): DiscoveredPattern[] {
    const highHumidity = history.filter(h => (h.keyMetrics['ambientHumidity'] ?? 0) > 80);
    const lowHumidity = history.filter(h => (h.keyMetrics['ambientHumidity'] ?? 0) <= 60);

    if (highHumidity.length < 5 || lowHumidity.length < 5) return [];

    const avgCorrHigh = highHumidity.reduce((s, h) => s + (h.keyMetrics['corrosionIndex'] ?? 0), 0) / highHumidity.length;
    const avgCorrLow = lowHumidity.reduce((s, h) => s + (h.keyMetrics['corrosionIndex'] ?? 0), 0) / lowHumidity.length;

    if (avgCorrHigh > avgCorrLow * 1.5) {
      return [{
        patternId: `pattern_seasonal_corrosion_${Date.now()}`,
        name: '高湿腐蚀加速',
        description: `湿度>80%时，腐蚀指数为低湿度的${(avgCorrHigh / Math.max(avgCorrLow, 0.001)).toFixed(1)}倍`,
        conditions: [
          { field: 'ambientHumidity', operator: 'gt', value: 80 },
        ],
        consequences: [{
          effect: '腐蚀速率倍增',
          magnitude: avgCorrHigh / Math.max(avgCorrLow, 0.001),
          unit: 'x',
          physicalExplanation: '腐蚀速率 r=k·[Cl⁻]·[humidity]，高湿度线性加速电化学腐蚀',
        }],
        confidence: 0.85,
        support: highHumidity.length / history.length,
        discoveredAt: Date.now(),
        sourceScenario: 'port_crane',
        status: 'discovered',
      }];
    }

    return [];
  }

  /**
   * 模式 5：连续作业疲劳
   */
  private discoverContinuousOperationPattern(history: DiagnosisHistoryEntry[]): DiscoveredPattern[] {
    // 按设备分组，检测连续低分
    const byMachine = new Map<string, DiagnosisHistoryEntry[]>();
    for (const h of history) {
      const list = byMachine.get(h.machineId) || [];
      list.push(h);
      byMachine.set(h.machineId, list);
    }

    const patterns: DiscoveredPattern[] = [];

    for (const [machineId, entries] of byMachine) {
      const sorted = entries.sort((a, b) => a.timestamp - b.timestamp);
      let consecutiveLow = 0;
      let maxConsecutive = 0;

      for (const entry of sorted) {
        if (entry.healthScore < 0.6) {
          consecutiveLow++;
          maxConsecutive = Math.max(maxConsecutive, consecutiveLow);
        } else {
          consecutiveLow = 0;
        }
      }

      if (maxConsecutive >= 5) {
        patterns.push({
          patternId: `pattern_continuous_fatigue_${machineId}_${Date.now()}`,
          name: `连续作业疲劳（${machineId}）`,
          description: `设备 ${machineId} 出现连续 ${maxConsecutive} 次健康分数<0.6`,
          conditions: [
            { field: 'healthScore', operator: 'lt', value: 0.6 },
          ],
          consequences: [{
            effect: '需要强制维护',
            magnitude: maxConsecutive,
            unit: '连续次数',
            physicalExplanation: '连续高负荷作业导致疲劳累积超过恢复能力',
          }],
          confidence: 0.9,
          support: maxConsecutive / sorted.length,
          discoveredAt: Date.now(),
          sourceScenario: 'port_crane',
          status: 'discovered',
        });
      }
    }

    return patterns;
  }

  /**
   * 将模式结晶为可执行知识
   */
  crystallize(patternId: string, type: CrystallizedKnowledge['type']): CrystallizedKnowledge | null {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return null;

    let content: Record<string, unknown> = {};

    switch (type) {
      case 'guardrail_rule':
        content = this.crystallizeAsGuardrailRule(pattern);
        break;
      case 'kg_triple':
        content = this.crystallizeAsKGTriple(pattern);
        break;
      case 'feature_weight':
        content = this.crystallizeAsFeatureWeight(pattern);
        break;
      case 'threshold_update':
        content = this.crystallizeAsThresholdUpdate(pattern);
        break;
    }

    const knowledge: CrystallizedKnowledge = {
      knowledgeId: `crystal_${Date.now()}`,
      sourcePattern: patternId,
      type,
      content,
      applicableScenarios: [pattern.sourceScenario],
      validatedBy: 'auto',
      validatedAt: Date.now(),
    };

    this.crystallized.set(knowledge.knowledgeId, knowledge);
    pattern.status = 'validated';

    return knowledge;
  }

  private crystallizeAsGuardrailRule(pattern: DiscoveredPattern): Record<string, unknown> {
    return {
      ruleId: `AUTO_${pattern.patternId}`,
      name: pattern.name,
      category: 'health',
      conditions: pattern.conditions.map(c => ({
        field: c.field,
        operator: c.operator,
        value: c.value,
      })),
      actions: [
        { type: 'alert', message: pattern.description },
        { type: 'log', message: `自动发现规则触发：${pattern.name}` },
      ],
      confidence: pattern.confidence,
      autoGenerated: true,
    };
  }

  private crystallizeAsKGTriple(pattern: DiscoveredPattern): Record<string, unknown> {
    const triples = pattern.conditions.map((c, i) => ({
      subject: c.field,
      predicate: 'causes',
      object: pattern.consequences[0]?.effect || 'unknown_effect',
      confidence: pattern.confidence,
      evidence: `${pattern.support * 100}% support from ${pattern.sourceScenario}`,
    }));
    return { triples };
  }

  private crystallizeAsFeatureWeight(pattern: DiscoveredPattern): Record<string, unknown> {
    return {
      features: pattern.conditions.map(c => ({
        name: c.field,
        importanceWeight: pattern.confidence * pattern.support,
        direction: c.operator === 'gt' || c.operator === 'gte' ? 'positive' : 'negative',
      })),
    };
  }

  private crystallizeAsThresholdUpdate(pattern: DiscoveredPattern): Record<string, unknown> {
    return {
      updates: pattern.conditions.map(c => ({
        field: c.field,
        currentThreshold: c.value,
        suggestedThreshold: typeof c.value === 'number' ? c.value * 0.9 : c.value,
        reason: pattern.description,
      })),
    };
  }

  /**
   * 生成跨工况迁移建议
   */
  generateMigrationSuggestions(
    targetScenario: string,
    targetCharacteristics: Record<string, { min: number; max: number }>
  ): MigrationSuggestion[] {
    const suggestions: MigrationSuggestion[] = [];

    for (const pattern of this.patterns.values()) {
      if (pattern.status === 'rejected') continue;

      const adaptations: MigrationSuggestion['adaptations'] = [];
      let applicable = true;

      for (const condition of pattern.conditions) {
        const targetRange = targetCharacteristics[condition.field];
        if (!targetRange) {
          applicable = false;
          break;
        }

        const sourceValue = typeof condition.value === 'number' ? condition.value : (condition.value as [number, number])[0];
        if (sourceValue < targetRange.min || sourceValue > targetRange.max) {
          adaptations.push({
            field: condition.field,
            sourceRange: `${condition.operator} ${condition.value}`,
            suggestedRange: `${condition.operator} ${(sourceValue * targetRange.max / Math.max(sourceValue, 1)).toFixed(2)}`,
            reason: `目标场景 ${condition.field} 范围 [${targetRange.min}, ${targetRange.max}]`,
          });
        }
      }

      if (applicable) {
        suggestions.push({
          sourceScenario: pattern.sourceScenario,
          targetScenario,
          pattern,
          adaptations,
          confidence: pattern.confidence * (adaptations.length === 0 ? 1 : 0.7),
        });
      }
    }

    this.migrationSuggestions = suggestions;
    return suggestions;
  }

  /**
   * 获取所有发现的模式
   */
  getPatterns(): DiscoveredPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * 获取所有结晶知识
   */
  getCrystallizedKnowledge(): CrystallizedKnowledge[] {
    return Array.from(this.crystallized.values());
  }

  /**
   * 审批模式
   */
  approvePattern(patternId: string): void {
    const pattern = this.patterns.get(patternId);
    if (pattern) pattern.status = 'approved';
  }

  /**
   * 拒绝模式
   */
  rejectPattern(patternId: string): void {
    const pattern = this.patterns.get(patternId);
    if (pattern) pattern.status = 'rejected';
  }
}
