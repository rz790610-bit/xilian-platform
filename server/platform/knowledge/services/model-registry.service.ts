/**
 * ============================================================================
 * 模型注册表服务 — ModelRegistryService
 * ============================================================================
 *
 * 职责：
 *   1. 模型元数据 CRUD（MySQL model_registry 表）
 *   2. 模型版本管理（语义版本 + 自动递增）
 *   3. 模型制品管理（MinIO 存储 + 校验和）
 *   4. 模型生命周期（draft → staging → production → deprecated）
 *   5. 模型性能追踪（与 shadow-evaluator 联动）
 */

// ============================================================================
// 模型类型
// ============================================================================

export interface ModelRecord {
  id: number;
  name: string;
  displayName: string;
  description: string;
  modelType: 'classifier' | 'regressor' | 'anomaly_detector' | 'forecaster' | 'transformer' | 'ensemble';
  framework: 'pytorch' | 'tensorflow' | 'onnx' | 'sklearn' | 'xgboost' | 'custom';
  version: string; // 语义版本 e.g. "1.2.3"
  stage: 'draft' | 'staging' | 'production' | 'deprecated' | 'archived';
  artifact: {
    path: string; // MinIO 路径
    sizeBytes: number;
    checksum: string;
    format: string;
  };
  metrics: {
    accuracy?: number;
    precision?: number;
    recall?: number;
    f1Score?: number;
    mae?: number;
    rmse?: number;
    latencyP50Ms?: number;
    latencyP99Ms?: number;
    custom: Record<string, number>;
  };
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  hyperparameters: Record<string, unknown>;
  trainingConfig: {
    datasetId: string;
    epochs: number;
    batchSize: number;
    learningRate: number;
    trainedAt: number;
    trainingDurationSec: number;
  } | null;
  conditionProfiles: string[];
  tags: string[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface ModelComparison {
  modelA: { id: number; name: string; version: string; metrics: ModelRecord['metrics'] };
  modelB: { id: number; name: string; version: string; metrics: ModelRecord['metrics'] };
  winner: 'A' | 'B' | 'tie';
  comparisonMetrics: Record<string, { a: number; b: number; diff: number; winner: 'A' | 'B' | 'tie' }>;
}

// ============================================================================
// 模型注册表服务
// ============================================================================

export class ModelRegistryService {
  private models = new Map<number, ModelRecord>();
  private nextId = 1;

  /**
   * 注册模型
   */
  register(params: {
    name: string;
    displayName: string;
    description: string;
    modelType: ModelRecord['modelType'];
    framework: ModelRecord['framework'];
    version?: string;
    artifactPath: string;
    artifactSize: number;
    artifactChecksum: string;
    artifactFormat: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
    hyperparameters?: Record<string, unknown>;
    conditionProfiles?: string[];
    tags?: string[];
    createdBy: string;
  }): ModelRecord {
    // 自动版本递增
    const existingVersions = Array.from(this.models.values())
      .filter(m => m.name === params.name)
      .map(m => m.version)
      .sort();
    const version = params.version || this.incrementVersion(existingVersions[existingVersions.length - 1] || '0.0.0');

    const model: ModelRecord = {
      id: this.nextId++,
      name: params.name,
      displayName: params.displayName,
      description: params.description,
      modelType: params.modelType,
      framework: params.framework,
      version,
      stage: 'draft',
      artifact: {
        path: params.artifactPath,
        sizeBytes: params.artifactSize,
        checksum: params.artifactChecksum,
        format: params.artifactFormat,
      },
      metrics: { custom: {} },
      inputSchema: params.inputSchema,
      outputSchema: params.outputSchema,
      hyperparameters: params.hyperparameters || {},
      trainingConfig: null,
      conditionProfiles: params.conditionProfiles || ['*'],
      tags: params.tags || [],
      createdBy: params.createdBy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.models.set(model.id, model);
    // TODO: INSERT INTO model_registry ...
    return model;
  }

  /**
   * 获取模型
   */
  get(id: number): ModelRecord | null {
    return this.models.get(id) || null;
  }

  /**
   * 按名称获取最新版本
   */
  getLatest(name: string, stage?: ModelRecord['stage']): ModelRecord | null {
    const candidates = Array.from(this.models.values())
      .filter(m => m.name === name)
      .filter(m => !stage || m.stage === stage)
      .sort((a, b) => this.compareVersions(b.version, a.version));
    return candidates[0] || null;
  }

  /**
   * 获取生产模型
   */
  getProduction(name: string): ModelRecord | null {
    return this.getLatest(name, 'production');
  }

  /**
   * 列出模型
   */
  list(params?: {
    name?: string;
    modelType?: ModelRecord['modelType'];
    stage?: ModelRecord['stage'];
    conditionProfile?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): { models: ModelRecord[]; total: number } {
    let results = Array.from(this.models.values());

    if (params?.name) results = results.filter(m => m.name === params.name);
    if (params?.modelType) results = results.filter(m => m.modelType === params.modelType);
    if (params?.stage) results = results.filter(m => m.stage === params.stage);
    if (params?.conditionProfile) {
      results = results.filter(m =>
        m.conditionProfiles.includes('*') || m.conditionProfiles.includes(params.conditionProfile!),
      );
    }
    if (params?.tags?.length) {
      results = results.filter(m => params.tags!.some(t => m.tags.includes(t)));
    }

    const total = results.length;
    return {
      models: results.slice(params?.offset || 0, (params?.offset || 0) + (params?.limit || 50)),
      total,
    };
  }

  /**
   * 更新模型指标
   */
  updateMetrics(id: number, metrics: Partial<ModelRecord['metrics']>): boolean {
    const model = this.models.get(id);
    if (!model) return false;

    model.metrics = { ...model.metrics, ...metrics };
    model.updatedAt = Date.now();
    return true;
  }

  /**
   * 推进模型阶段
   */
  promote(id: number, targetStage: ModelRecord['stage']): boolean {
    const model = this.models.get(id);
    if (!model) return false;

    const validTransitions: Record<string, string[]> = {
      draft: ['staging'],
      staging: ['production', 'draft'],
      production: ['deprecated'],
      deprecated: ['archived'],
    };

    if (!validTransitions[model.stage]?.includes(targetStage)) {
      log.warn({ currentStage: model.stage, targetStage }, "Invalid stage transition");
      return false;
    }

    // 如果推进到 production，将同名其他 production 模型降级
    if (targetStage === 'production') {
      for (const m of this.models.values()) {
        if (m.name === model.name && m.id !== id && m.stage === 'production') {
          m.stage = 'deprecated';
          m.updatedAt = Date.now();
        }
      }
    }

    model.stage = targetStage;
    model.updatedAt = Date.now();
    return true;
  }

  /**
   * 比较两个模型
   */
  compare(idA: number, idB: number): ModelComparison | null {
    const a = this.models.get(idA);
    const b = this.models.get(idB);
    if (!a || !b) return null;

    const comparisonMetrics: ModelComparison['comparisonMetrics'] = {};
    const allKeys = new Set([
      ...Object.keys(a.metrics).filter(k => k !== 'custom'),
      ...Object.keys(b.metrics).filter(k => k !== 'custom'),
    ]);

    let aWins = 0;
    let bWins = 0;

    for (const key of allKeys) {
      const valA = (a.metrics as Record<string, unknown>)[key] as number || 0;
      const valB = (b.metrics as Record<string, unknown>)[key] as number || 0;
      const diff = valA - valB;
      // 对于 latency/mae/rmse，越小越好
      const lowerIsBetter = key.includes('latency') || key === 'mae' || key === 'rmse';
      const winner = Math.abs(diff) < 0.001 ? 'tie' as const
        : (lowerIsBetter ? (diff < 0 ? 'A' as const : 'B' as const) : (diff > 0 ? 'A' as const : 'B' as const));

      if (winner === 'A') aWins++;
      if (winner === 'B') bWins++;

      comparisonMetrics[key] = { a: valA, b: valB, diff, winner };
    }

    return {
      modelA: { id: a.id, name: a.name, version: a.version, metrics: a.metrics },
      modelB: { id: b.id, name: b.name, version: b.version, metrics: b.metrics },
      winner: aWins > bWins ? 'A' : bWins > aWins ? 'B' : 'tie',
      comparisonMetrics,
    };
  }

  /**
   * 设置训练配置
   */
  setTrainingConfig(id: number, config: ModelRecord['trainingConfig']): boolean {
    const model = this.models.get(id);
    if (!model) return false;
    model.trainingConfig = config;
    model.updatedAt = Date.now();
    return true;
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  private incrementVersion(current: string): string {
    const parts = current.split('.').map(Number);
    parts[2] = (parts[2] || 0) + 1;
    return parts.join('.');
  }

  private compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    }
    return 0;
  }
}
