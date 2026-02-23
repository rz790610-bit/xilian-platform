/**
 * ============================================================================
 * 特征注册表持久化服务 — FeatureRegistryService
 * ============================================================================
 *
 * 职责：
 *   1. 特征定义 CRUD（MySQL feature_registry 表）
 *   2. 特征版本管理
 *   3. 特征血缘追踪（哪些模型/诊断使用了该特征）
 *   4. 特征质量监控（漂移检测）
 *   5. 特征组合推荐
 */

import { createModuleLogger } from '../../../core/logger';
const log = createModuleLogger('feature-registry');


// ============================================================================
// 特征类型
// ============================================================================

export interface FeatureDefinition {
  id: number;
  name: string;
  displayName: string;
  description: string;
  dataType: 'numeric' | 'categorical' | 'boolean' | 'timestamp' | 'vector';
  unit: string;
  source: {
    type: 'raw_sensor' | 'computed' | 'aggregated' | 'external';
    expression: string; // 计算表达式或数据源路径
    dependencies: string[]; // 依赖的其他特征
  };
  statistics: {
    mean: number;
    std: number;
    min: number;
    max: number;
    nullRate: number;
    lastComputedAt: number;
  } | null;
  qualityScore: number;
  version: number;
  tags: string[];
  conditionProfiles: string[]; // 适用的工况
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface FeatureLineage {
  featureId: number;
  consumers: Array<{
    type: 'model' | 'diagnosis' | 'guardrail' | 'dashboard';
    id: string;
    name: string;
  }>;
  producers: Array<{
    type: 'sensor' | 'computation' | 'aggregation';
    id: string;
    name: string;
  }>;
}

export interface DriftDetection {
  featureId: number;
  baselineStats: { mean: number; std: number };
  currentStats: { mean: number; std: number };
  driftScore: number; // 0-1, 越高漂移越严重
  driftType: 'none' | 'gradual' | 'sudden' | 'recurring';
  detectedAt: number;
}

// ============================================================================
// 特征注册表服务
// ============================================================================

export class FeatureRegistryService {
  private features = new Map<number, FeatureDefinition>();
  private lineages = new Map<number, FeatureLineage>();
  private driftHistory: DriftDetection[] = [];
  private nextId = 1;

  /**
   * 注册特征
   */
  register(params: {
    name: string;
    displayName: string;
    description: string;
    dataType: FeatureDefinition['dataType'];
    unit: string;
    sourceType: FeatureDefinition['source']['type'];
    expression: string;
    dependencies?: string[];
    tags?: string[];
    conditionProfiles?: string[];
  }): FeatureDefinition {
    const feature: FeatureDefinition = {
      id: this.nextId++,
      name: params.name,
      displayName: params.displayName,
      description: params.description,
      dataType: params.dataType,
      unit: params.unit,
      source: {
        type: params.sourceType,
        expression: params.expression,
        dependencies: params.dependencies || [],
      },
      statistics: null,
      qualityScore: 1.0,
      version: 1,
      tags: params.tags || [],
      conditionProfiles: params.conditionProfiles || ['*'],
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.features.set(feature.id, feature);
    this.lineages.set(feature.id, {
      featureId: feature.id,
      consumers: [],
      producers: [],
    });

    // TODO: INSERT INTO feature_registry ...
    return feature;
  }

  /**
   * 获取特征
   */
  get(id: number): FeatureDefinition | null {
    return this.features.get(id) || null;
  }

  /**
   * 按名称查找
   */
  getByName(name: string): FeatureDefinition | null {
    return Array.from(this.features.values()).find(f => f.name === name) || null;
  }

  /**
   * 列出特征
   */
  list(params?: {
    tags?: string[];
    conditionProfile?: string;
    isActive?: boolean;
    dataType?: FeatureDefinition['dataType'];
    limit?: number;
    offset?: number;
  }): { features: FeatureDefinition[]; total: number } {
    let results = Array.from(this.features.values());

    if (params?.tags?.length) {
      results = results.filter(f => params.tags!.some(t => f.tags.includes(t)));
    }
    if (params?.conditionProfile) {
      results = results.filter(f =>
        f.conditionProfiles.includes('*') || f.conditionProfiles.includes(params.conditionProfile!),
      );
    }
    if (params?.isActive !== undefined) {
      results = results.filter(f => f.isActive === params.isActive);
    }
    if (params?.dataType) {
      results = results.filter(f => f.dataType === params.dataType);
    }

    const total = results.length;
    return {
      features: results.slice(params?.offset || 0, (params?.offset || 0) + (params?.limit || 50)),
      total,
    };
  }

  /**
   * 更新特征统计
   */
  updateStatistics(
    featureId: number,
    stats: FeatureDefinition['statistics'],
  ): boolean {
    const feature = this.features.get(featureId);
    if (!feature || !stats) return false;

    // 漂移检测
    if (feature.statistics) {
      const drift = this.detectDrift(featureId, feature.statistics, stats);
      if (drift.driftScore > 0.3) {
        this.driftHistory.push(drift);
      }
    }

    feature.statistics = stats;
    feature.updatedAt = Date.now();
    return true;
  }

  /**
   * 注册消费者
   */
  registerConsumer(
    featureId: number,
    consumer: FeatureLineage['consumers'][0],
  ): boolean {
    const lineage = this.lineages.get(featureId);
    if (!lineage) return false;

    if (!lineage.consumers.find(c => c.id === consumer.id)) {
      lineage.consumers.push(consumer);
    }
    return true;
  }

  /**
   * 获取血缘
   */
  getLineage(featureId: number): FeatureLineage | null {
    return this.lineages.get(featureId) || null;
  }

  /**
   * 漂移检测
   */
  detectDrift(
    featureId: number,
    baseline: { mean: number; std: number },
    current: { mean: number; std: number },
  ): DriftDetection {
    // Population Stability Index (PSI) 简化版
    const meanShift = Math.abs(current.mean - baseline.mean) / Math.max(baseline.std, 0.001);
    const stdRatio = current.std / Math.max(baseline.std, 0.001);
    const driftScore = Math.min(1, meanShift * 0.5 + Math.abs(1 - stdRatio) * 0.5);

    let driftType: DriftDetection['driftType'] = 'none';
    if (driftScore > 0.7) driftType = 'sudden';
    else if (driftScore > 0.3) driftType = 'gradual';

    return {
      featureId,
      baselineStats: baseline,
      currentStats: current,
      driftScore,
      driftType,
      detectedAt: Date.now(),
    };
  }

  /**
   * 获取漂移历史
   */
  getDriftHistory(featureId?: number): DriftDetection[] {
    if (featureId) {
      return this.driftHistory.filter(d => d.featureId === featureId);
    }
    return [...this.driftHistory];
  }

  /**
   * 特征组合推荐
   */
  recommendFeatures(params: {
    targetVariable: string;
    conditionProfile: string;
    maxFeatures?: number;
  }): FeatureDefinition[] {
    const max = params.maxFeatures || 10;

    // 基于质量分和相关性推荐
    return Array.from(this.features.values())
      .filter(f => f.isActive)
      .filter(f => f.conditionProfiles.includes('*') || f.conditionProfiles.includes(params.conditionProfile))
      .sort((a, b) => {
        // 优先高质量、有统计信息的特征
        const scoreA = a.qualityScore * (a.statistics ? 1.2 : 0.8);
        const scoreB = b.qualityScore * (b.statistics ? 1.2 : 0.8);
        return scoreB - scoreA;
      })
      .slice(0, max);
  }

  /**
   * 停用特征
   */
  deactivate(featureId: number): boolean {
    const feature = this.features.get(featureId);
    if (!feature) return false;

    feature.isActive = false;
    feature.updatedAt = Date.now();

    // 检查是否有活跃消费者
    const lineage = this.lineages.get(featureId);
    if (lineage && lineage.consumers.length > 0) {
      log.warn({ featureName: feature.name, consumerCount: lineage.consumers.length }, "Deactivating feature with active consumers");
    }

    return true;
  }
}
