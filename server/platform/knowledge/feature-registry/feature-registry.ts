/**
 * ============================================================================
 * 特征注册表 (Feature Registry)
 * ============================================================================
 *
 * 管理所有可用特征的元数据：
 *   - 特征定义：名称、类型、来源、计算方法
 *   - 特征血缘：从原始数据到派生特征的完整链路
 *   - 特征重要性：基于模型反馈的动态权重
 *   - 特征版本：支持特征演进和回滚
 *   - 特征发现：自动推荐新特征
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface FeatureDefinition {
  featureId: string;
  name: string;
  description: string;
  /** 特征类型 */
  type: 'raw' | 'derived' | 'aggregated' | 'interaction' | 'temporal';
  /** 数据类型 */
  dataType: 'numeric' | 'categorical' | 'boolean' | 'vector';
  /** 来源 */
  source: string;
  /** 计算方法（派生特征） */
  computation?: {
    method: string;
    inputs: string[];
    formula?: string;
    windowSize?: number;
  };
  /** 统计信息 */
  statistics: {
    mean?: number;
    std?: number;
    min?: number;
    max?: number;
    nullRatio?: number;
    distinctCount?: number;
  };
  /** 重要性权重 (0-1) */
  importance: number;
  /** 适用场景 */
  applicableScenarios: string[];
  /** 版本 */
  version: string;
  /** 状态 */
  status: 'active' | 'deprecated' | 'experimental';
  /** 血缘 */
  lineage: string[];
  /** 标签 */
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface FeatureGroup {
  groupId: string;
  name: string;
  description: string;
  featureIds: string[];
  scenario: string;
}

// ============================================================================
// 特征注册表
// ============================================================================

export class FeatureRegistry {
  private features: Map<string, FeatureDefinition> = new Map();
  private groups: Map<string, FeatureGroup> = new Map();
  private importanceHistory: Map<string, { timestamp: number; importance: number }[]> = new Map();

  /**
   * 注册特征
   */
  register(feature: Omit<FeatureDefinition, 'createdAt' | 'updatedAt'>): FeatureDefinition {
    const full: FeatureDefinition = {
      ...feature,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.features.set(feature.featureId, full);
    return full;
  }

  /**
   * 批量注册
   */
  registerAll(features: Omit<FeatureDefinition, 'createdAt' | 'updatedAt'>[]): FeatureDefinition[] {
    return features.map(f => this.register(f));
  }

  /**
   * 获取特征
   */
  get(featureId: string): FeatureDefinition | undefined {
    return this.features.get(featureId);
  }

  /**
   * 按场景获取特征
   */
  getByScenario(scenario: string): FeatureDefinition[] {
    return Array.from(this.features.values()).filter(
      f => f.applicableScenarios.includes(scenario) && f.status === 'active'
    );
  }

  /**
   * 按重要性排序
   */
  getByImportance(topN: number = 20): FeatureDefinition[] {
    return Array.from(this.features.values())
      .filter(f => f.status === 'active')
      .sort((a, b) => b.importance - a.importance)
      .slice(0, topN);
  }

  /**
   * 更新重要性
   */
  updateImportance(featureId: string, importance: number): void {
    const feature = this.features.get(featureId);
    if (!feature) return;

    feature.importance = importance;
    feature.updatedAt = Date.now();

    if (!this.importanceHistory.has(featureId)) {
      this.importanceHistory.set(featureId, []);
    }
    this.importanceHistory.get(featureId)!.push({ timestamp: Date.now(), importance });
  }

  /**
   * 创建特征组
   */
  createGroup(group: FeatureGroup): void {
    this.groups.set(group.groupId, group);
  }

  /**
   * 获取特征血缘
   */
  getLineage(featureId: string): FeatureDefinition[] {
    const feature = this.features.get(featureId);
    if (!feature) return [];

    const lineage: FeatureDefinition[] = [];
    for (const ancestorId of feature.lineage) {
      const ancestor = this.features.get(ancestorId);
      if (ancestor) lineage.push(ancestor);
    }
    return lineage;
  }

  /**
   * 推荐新特征
   */
  suggestFeatures(existingFeatureIds: string[]): {
    featureId: string;
    name: string;
    reason: string;
    expectedImportance: number;
  }[] {
    const existing = new Set(existingFeatureIds);
    const suggestions: { featureId: string; name: string; reason: string; expectedImportance: number }[] = [];

    // 推荐交叉特征
    const numericFeatures = Array.from(this.features.values()).filter(
      f => f.dataType === 'numeric' && f.status === 'active' && f.importance > 0.3
    );

    for (let i = 0; i < numericFeatures.length; i++) {
      for (let j = i + 1; j < numericFeatures.length; j++) {
        const crossId = `cross_${numericFeatures[i].featureId}_${numericFeatures[j].featureId}`;
        if (!existing.has(crossId)) {
          suggestions.push({
            featureId: crossId,
            name: `${numericFeatures[i].name} × ${numericFeatures[j].name}`,
            reason: `两个高重要性特征的交叉项`,
            expectedImportance: numericFeatures[i].importance * numericFeatures[j].importance,
          });
        }
      }
    }

    // 推荐时序特征
    for (const feature of numericFeatures) {
      const rollingId = `rolling_mean_${feature.featureId}`;
      if (!existing.has(rollingId)) {
        suggestions.push({
          featureId: rollingId,
          name: `${feature.name} 滚动均值`,
          reason: '时序平滑可捕获趋势',
          expectedImportance: feature.importance * 0.8,
        });
      }

      const rateId = `rate_of_change_${feature.featureId}`;
      if (!existing.has(rateId)) {
        suggestions.push({
          featureId: rateId,
          name: `${feature.name} 变化率`,
          reason: '变化率可捕获突变',
          expectedImportance: feature.importance * 0.7,
        });
      }
    }

    return suggestions.sort((a, b) => b.expectedImportance - a.expectedImportance).slice(0, 10);
  }

  /**
   * 加载港口岸桥特征模板
   */
  loadPortCraneTemplate(): void {
    const features: Omit<FeatureDefinition, 'createdAt' | 'updatedAt'>[] = [
      // 原始特征
      { featureId: 'vibration_rms', name: '振动有效值', description: '轴承振动 RMS', type: 'raw', dataType: 'numeric', source: 'sensor', statistics: { mean: 1.8, std: 0.5, min: 0.2, max: 5.0 }, importance: 0.85, applicableScenarios: ['port_crane'], version: '1.0', status: 'active', lineage: [], tags: ['vibration', 'health'] },
      { featureId: 'motor_current', name: '电机电流', description: '起升电机电流均值', type: 'raw', dataType: 'numeric', source: 'sensor', statistics: { mean: 65, std: 10, min: 0, max: 120 }, importance: 0.80, applicableScenarios: ['port_crane'], version: '1.0', status: 'active', lineage: [], tags: ['electrical', 'efficiency'] },
      { featureId: 'wind_speed', name: '风速', description: '环境风速均值', type: 'raw', dataType: 'numeric', source: 'sensor', statistics: { mean: 6, std: 3, min: 0, max: 25 }, importance: 0.90, applicableScenarios: ['port_crane'], version: '1.0', status: 'active', lineage: [], tags: ['environment', 'safety'] },
      { featureId: 'temperature_bearing', name: '轴承温度', description: '关键轴承温度', type: 'raw', dataType: 'numeric', source: 'sensor', statistics: { mean: 45, std: 8, min: 15, max: 85 }, importance: 0.75, applicableScenarios: ['port_crane'], version: '1.0', status: 'active', lineage: [], tags: ['temperature', 'health'] },
      { featureId: 'load_weight', name: '载荷重量', description: '吊具载荷', type: 'raw', dataType: 'numeric', source: 'sensor', statistics: { mean: 25, std: 10, min: 0, max: 65 }, importance: 0.70, applicableScenarios: ['port_crane'], version: '1.0', status: 'active', lineage: [], tags: ['load', 'efficiency'] },
      { featureId: 'load_eccentricity', name: '载荷偏心', description: '货物偏心率', type: 'raw', dataType: 'numeric', source: 'sensor', statistics: { mean: 0.15, std: 0.1, min: 0, max: 0.5 }, importance: 0.82, applicableScenarios: ['port_crane'], version: '1.0', status: 'active', lineage: [], tags: ['load', 'safety'] },

      // 派生特征
      { featureId: 'fatigue_increment', name: '疲劳增量', description: 'Δσ=k·M/W', type: 'derived', dataType: 'numeric', source: 'calculation', computation: { method: 'physics', inputs: ['wind_speed', 'load_weight', 'load_eccentricity'], formula: 'Δσ=k·M/W' }, statistics: { mean: 0.5, std: 0.3 }, importance: 0.92, applicableScenarios: ['port_crane'], version: '1.0', status: 'active', lineage: ['wind_speed', 'load_weight', 'load_eccentricity'], tags: ['fatigue', 'health'] },
      { featureId: 'wind_load_moment', name: '风载力矩', description: 'M=½ρv²Ah/2', type: 'derived', dataType: 'numeric', source: 'calculation', computation: { method: 'physics', inputs: ['wind_speed'], formula: 'M=½ρv²Ah/2' }, statistics: { mean: 500, std: 300 }, importance: 0.88, applicableScenarios: ['port_crane'], version: '1.0', status: 'active', lineage: ['wind_speed'], tags: ['wind', 'safety'] },
      { featureId: 'corrosion_rate', name: '腐蚀速率', description: 'r=k[Cl⁻][humidity]', type: 'derived', dataType: 'numeric', source: 'calculation', computation: { method: 'physics', inputs: ['chloride_concentration', 'ambient_humidity'], formula: 'r=k[Cl⁻][humidity]' }, statistics: { mean: 0.05, std: 0.02 }, importance: 0.72, applicableScenarios: ['port_crane'], version: '1.0', status: 'active', lineage: ['chloride_concentration', 'ambient_humidity'], tags: ['corrosion', 'health'] },

      // 聚合特征
      { featureId: 'cycle_time_mean', name: '周期时间均值', description: '最近N个周期的平均时间', type: 'aggregated', dataType: 'numeric', source: 'aggregation', computation: { method: 'mean', inputs: ['cycle_time'], windowSize: 10 }, statistics: { mean: 120, std: 15 }, importance: 0.65, applicableScenarios: ['port_crane'], version: '1.0', status: 'active', lineage: ['cycle_time'], tags: ['efficiency', 'temporal'] },
      { featureId: 'vibration_trend', name: '振动趋势', description: '振动RMS的线性回归斜率', type: 'temporal', dataType: 'numeric', source: 'aggregation', computation: { method: 'linear_regression_slope', inputs: ['vibration_rms'], windowSize: 50 }, statistics: { mean: 0.001, std: 0.005 }, importance: 0.78, applicableScenarios: ['port_crane'], version: '1.0', status: 'active', lineage: ['vibration_rms'], tags: ['trend', 'health'] },
    ];

    this.registerAll(features);

    // 创建特征组
    this.createGroup({
      groupId: 'safety_features',
      name: '安全特征组',
      description: '用于安全评估的特征集合',
      featureIds: ['wind_speed', 'load_eccentricity', 'wind_load_moment'],
      scenario: 'port_crane',
    });

    this.createGroup({
      groupId: 'health_features',
      name: '健康特征组',
      description: '用于健康评估的特征集合',
      featureIds: ['vibration_rms', 'temperature_bearing', 'fatigue_increment', 'corrosion_rate', 'vibration_trend'],
      scenario: 'port_crane',
    });

    this.createGroup({
      groupId: 'efficiency_features',
      name: '效率特征组',
      description: '用于效率评估的特征集合',
      featureIds: ['motor_current', 'load_weight', 'cycle_time_mean'],
      scenario: 'port_crane',
    });
  }

  /**
   * 获取统计
   */
  getStats(): { totalFeatures: number; activeFeatures: number; featureTypes: Record<string, number>; groups: number } {
    const features = Array.from(this.features.values());
    const types: Record<string, number> = {};
    for (const f of features) {
      types[f.type] = (types[f.type] || 0) + 1;
    }
    return {
      totalFeatures: features.length,
      activeFeatures: features.filter(f => f.status === 'active').length,
      featureTypes: types,
      groups: this.groups.size,
    };
  }
}
