/**
 * ============================================================================
 * 动态配置引擎 — DynamicConfigEngine
 * ============================================================================
 *
 * 职责：
 *   1. 运行时配置热更新（无需重启）
 *   2. 配置版本管理（回滚/历史）
 *   3. 配置校验（Schema 验证）
 *   4. 配置继承（全局 → 场景 → 设备）
 *   5. 配置变更通知（观察者模式）
 *   6. 特性开关（Feature Flags）
 */

// ============================================================================
// 配置类型
// ============================================================================

export interface ConfigEntry {
  key: string;
  value: unknown;
  type: 'string' | 'number' | 'boolean' | 'json' | 'array';
  scope: 'global' | 'profile' | 'equipment';
  scopeId: string; // '*' for global, profile name, or equipment id
  description: string;
  version: number;
  updatedBy: string;
  updatedAt: number;
  validationSchema?: Record<string, unknown>; // JSON Schema
}

export interface ConfigVersion {
  version: number;
  entries: ConfigEntry[];
  createdBy: string;
  createdAt: number;
  description: string;
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
  rolloutPercentage: number; // 0-100
  conditions: Array<{
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'lt' | 'in' | 'contains';
    value: unknown;
  }>;
  updatedAt: number;
}

export type ConfigChangeHandler = (key: string, oldValue: unknown, newValue: unknown) => void;

// ============================================================================
// 动态配置引擎
// ============================================================================

export class DynamicConfigEngine {
  private entries = new Map<string, ConfigEntry>(); // compositeKey → entry
  private versions: ConfigVersion[] = [];
  private currentVersion = 0;
  private watchers = new Map<string, Set<ConfigChangeHandler>>(); // key pattern → handlers
  private featureFlags = new Map<string, FeatureFlag>();

  constructor() {
    this.registerBuiltinDefaults();
  }

  // --------------------------------------------------------------------------
  // 配置 CRUD
  // --------------------------------------------------------------------------

  /**
   * 获取配置值（支持继承：设备 → 场景 → 全局）
   */
  get<T = unknown>(key: string, scope?: { profileId?: string; equipmentId?: string }): T | undefined {
    // 优先级：设备 > 场景 > 全局
    if (scope?.equipmentId) {
      const equipEntry = this.entries.get(this.compositeKey(key, 'equipment', scope.equipmentId));
      if (equipEntry) return equipEntry.value as T;
    }

    if (scope?.profileId) {
      const profileEntry = this.entries.get(this.compositeKey(key, 'profile', scope.profileId));
      if (profileEntry) return profileEntry.value as T;
    }

    const globalEntry = this.entries.get(this.compositeKey(key, 'global', '*'));
    return globalEntry?.value as T | undefined;
  }

  /**
   * 设置配置值
   */
  set(
    key: string,
    value: unknown,
    options: {
      scope?: 'global' | 'profile' | 'equipment';
      scopeId?: string;
      type?: ConfigEntry['type'];
      description?: string;
      updatedBy?: string;
      validationSchema?: Record<string, unknown>;
    } = {},
  ): boolean {
    const scope = options.scope || 'global';
    const scopeId = options.scopeId || '*';
    const ck = this.compositeKey(key, scope, scopeId);

    const existing = this.entries.get(ck);
    const oldValue = existing?.value;

    // 类型校验
    if (options.validationSchema) {
      const valid = this.validateValue(value, options.validationSchema);
      if (!valid) return false;
    }

    const entry: ConfigEntry = {
      key,
      value,
      type: options.type || this.inferType(value),
      scope,
      scopeId,
      description: options.description || existing?.description || '',
      version: (existing?.version || 0) + 1,
      updatedBy: options.updatedBy || 'system',
      updatedAt: Date.now(),
      validationSchema: options.validationSchema || existing?.validationSchema,
    };

    this.entries.set(ck, entry);

    // 通知观察者
    if (oldValue !== value) {
      this.notifyWatchers(key, oldValue, value);
    }

    return true;
  }

  /**
   * 删除配置
   */
  delete(key: string, scope: 'global' | 'profile' | 'equipment' = 'global', scopeId: string = '*'): boolean {
    const ck = this.compositeKey(key, scope, scopeId);
    const existing = this.entries.get(ck);
    if (!existing) return false;

    this.entries.delete(ck);
    this.notifyWatchers(key, existing.value, undefined);
    return true;
  }

  /**
   * 批量设置
   */
  setBatch(
    entries: Array<{ key: string; value: unknown; scope?: 'global' | 'profile' | 'equipment'; scopeId?: string }>,
    updatedBy: string = 'system',
  ): { success: number; failed: number } {
    let success = 0;
    let failed = 0;

    for (const entry of entries) {
      const ok = this.set(entry.key, entry.value, {
        scope: entry.scope,
        scopeId: entry.scopeId,
        updatedBy,
      });
      if (ok) success++;
      else failed++;
    }

    return { success, failed };
  }

  // --------------------------------------------------------------------------
  // 版本管理
  // --------------------------------------------------------------------------

  /**
   * 创建版本快照
   */
  createVersion(description: string, createdBy: string = 'system'): ConfigVersion {
    this.currentVersion++;
    const version: ConfigVersion = {
      version: this.currentVersion,
      entries: Array.from(this.entries.values()).map(e => ({ ...e })),
      createdBy,
      createdAt: Date.now(),
      description,
    };

    this.versions.push(version);

    // 保留最近 50 个版本
    if (this.versions.length > 50) {
      this.versions.shift();
    }

    return version;
  }

  /**
   * 回滚到指定版本
   */
  rollback(targetVersion: number): boolean {
    const version = this.versions.find(v => v.version === targetVersion);
    if (!version) return false;

    // 清空当前配置
    this.entries.clear();

    // 恢复版本配置
    for (const entry of version.entries) {
      const ck = this.compositeKey(entry.key, entry.scope, entry.scopeId);
      this.entries.set(ck, { ...entry });
    }

    return true;
  }

  /**
   * 获取版本历史
   */
  getVersionHistory(limit: number = 20): ConfigVersion[] {
    return this.versions.slice(-limit).reverse();
  }

  /**
   * 比较两个版本
   */
  diffVersions(v1: number, v2: number): Array<{
    key: string;
    scope: string;
    v1Value: unknown;
    v2Value: unknown;
    changeType: 'added' | 'removed' | 'modified';
  }> {
    const ver1 = this.versions.find(v => v.version === v1);
    const ver2 = this.versions.find(v => v.version === v2);
    if (!ver1 || !ver2) return [];

    const map1 = new Map(ver1.entries.map(e => [this.compositeKey(e.key, e.scope, e.scopeId), e]));
    const map2 = new Map(ver2.entries.map(e => [this.compositeKey(e.key, e.scope, e.scopeId), e]));
    const diffs: Array<{ key: string; scope: string; v1Value: unknown; v2Value: unknown; changeType: 'added' | 'removed' | 'modified' }> = [];

    for (const [ck, entry1] of map1) {
      const entry2 = map2.get(ck);
      if (!entry2) {
        diffs.push({ key: entry1.key, scope: entry1.scope, v1Value: entry1.value, v2Value: undefined, changeType: 'removed' });
      } else if (JSON.stringify(entry1.value) !== JSON.stringify(entry2.value)) {
        diffs.push({ key: entry1.key, scope: entry1.scope, v1Value: entry1.value, v2Value: entry2.value, changeType: 'modified' });
      }
    }

    for (const [ck, entry2] of map2) {
      if (!map1.has(ck)) {
        diffs.push({ key: entry2.key, scope: entry2.scope, v1Value: undefined, v2Value: entry2.value, changeType: 'added' });
      }
    }

    return diffs;
  }

  // --------------------------------------------------------------------------
  // 观察者
  // --------------------------------------------------------------------------

  /**
   * 监听配置变更
   */
  watch(keyPattern: string, handler: ConfigChangeHandler): () => void {
    const handlers = this.watchers.get(keyPattern) || new Set();
    handlers.add(handler);
    this.watchers.set(keyPattern, handlers);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.watchers.delete(keyPattern);
    };
  }

  // --------------------------------------------------------------------------
  // 特性开关
  // --------------------------------------------------------------------------

  /**
   * 注册特性开关
   */
  registerFeatureFlag(flag: FeatureFlag): void {
    this.featureFlags.set(flag.key, flag);
  }

  /**
   * 检查特性是否启用
   */
  isFeatureEnabled(flagKey: string, context?: Record<string, unknown>): boolean {
    const flag = this.featureFlags.get(flagKey);
    if (!flag) return false;
    if (!flag.enabled) return false;

    // 检查灰度百分比
    if (flag.rolloutPercentage < 100) {
      const hash = this.simpleHash(flagKey + JSON.stringify(context || {}));
      if (hash % 100 >= flag.rolloutPercentage) return false;
    }

    // 检查条件
    if (flag.conditions.length > 0 && context) {
      for (const condition of flag.conditions) {
        const fieldValue = context[condition.field];
        if (!this.evaluateCondition(fieldValue, condition.operator, condition.value)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 列出所有特性开关
   */
  listFeatureFlags(): FeatureFlag[] {
    return Array.from(this.featureFlags.values());
  }

  // --------------------------------------------------------------------------
  // 导出/导入
  // --------------------------------------------------------------------------

  /**
   * 导出所有配置
   */
  exportAll(): { entries: ConfigEntry[]; featureFlags: FeatureFlag[]; version: number } {
    return {
      entries: Array.from(this.entries.values()),
      featureFlags: Array.from(this.featureFlags.values()),
      version: this.currentVersion,
    };
  }

  /**
   * 导入配置
   */
  importAll(data: { entries: ConfigEntry[]; featureFlags?: FeatureFlag[] }, updatedBy: string = 'import'): void {
    for (const entry of data.entries) {
      const ck = this.compositeKey(entry.key, entry.scope, entry.scopeId);
      this.entries.set(ck, { ...entry, updatedBy, updatedAt: Date.now() });
    }

    if (data.featureFlags) {
      for (const flag of data.featureFlags) {
        this.featureFlags.set(flag.key, flag);
      }
    }
  }

  /**
   * 列出所有配置
   */
  listAll(scope?: 'global' | 'profile' | 'equipment', scopeId?: string): ConfigEntry[] {
    let results = Array.from(this.entries.values());
    if (scope) results = results.filter(e => e.scope === scope);
    if (scopeId) results = results.filter(e => e.scopeId === scopeId);
    return results.sort((a, b) => a.key.localeCompare(b.key));
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  private compositeKey(key: string, scope: string, scopeId: string): string {
    return `${scope}:${scopeId}:${key}`;
  }

  private inferType(value: unknown): ConfigEntry['type'] {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    return 'json';
  }

  private validateValue(_value: unknown, _schema: Record<string, unknown>): boolean {
    // TODO: 接入 Zod 或 JSON Schema 验证
    return true;
  }

  private notifyWatchers(key: string, oldValue: unknown, newValue: unknown): void {
    for (const [pattern, handlers] of this.watchers) {
      if (this.matchPattern(key, pattern)) {
        for (const handler of handlers) {
          try {
            handler(key, oldValue, newValue);
          } catch {
            // 观察者错误不影响配置更新
          }
        }
      }
    }
  }

  private matchPattern(key: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('.*')) {
      return key.startsWith(pattern.slice(0, -2));
    }
    return key === pattern;
  }

  private evaluateCondition(fieldValue: unknown, operator: string, conditionValue: unknown): boolean {
    switch (operator) {
      case 'eq': return fieldValue === conditionValue;
      case 'neq': return fieldValue !== conditionValue;
      case 'gt': return (fieldValue as number) > (conditionValue as number);
      case 'lt': return (fieldValue as number) < (conditionValue as number);
      case 'in': return Array.isArray(conditionValue) && conditionValue.includes(fieldValue);
      case 'contains': return typeof fieldValue === 'string' && fieldValue.includes(String(conditionValue));
      default: return false;
    }
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash);
  }

  /**
   * 注册内置默认配置
   */
  private registerBuiltinDefaults(): void {
    const defaults: Array<{ key: string; value: unknown; type: ConfigEntry['type']; description: string }> = [
      // 感知层
      { key: 'perception.sampling.defaultRateHz', value: 1000, type: 'number', description: '默认采样率 (Hz)' },
      { key: 'perception.sampling.adaptiveEnabled', value: true, type: 'boolean', description: '是否启用自适应采样' },
      { key: 'perception.fusion.conflictThreshold', value: 0.3, type: 'number', description: 'DS融合冲突阈值' },
      { key: 'perception.buffer.sizeKB', value: 64, type: 'number', description: '环形缓冲区大小 (KB)' },

      // 认知层
      { key: 'cognition.grok.maxSteps', value: 8, type: 'number', description: 'Grok ReAct 最大步数' },
      { key: 'cognition.grok.temperature', value: 0.3, type: 'number', description: 'Grok 生成温度' },
      { key: 'cognition.grok.timeoutMs', value: 30000, type: 'number', description: 'Grok 推理超时 (ms)' },
      { key: 'cognition.worldmodel.horizonMinutes', value: 60, type: 'number', description: 'WorldModel 预测时间窗 (分钟)' },
      { key: 'cognition.worldmodel.anomalyThreshold', value: 0.7, type: 'number', description: '异常概率阈值' },
      { key: 'cognition.diagnosis.convergenceThreshold', value: 0.85, type: 'number', description: '四维收敛阈值' },

      // 护栏层
      { key: 'guardrail.enabled', value: true, type: 'boolean', description: '是否启用护栏' },
      { key: 'guardrail.cooldownMs', value: 300000, type: 'number', description: '护栏冷却时间 (ms)' },
      { key: 'guardrail.autoAcknowledge', value: false, type: 'boolean', description: '是否自动确认告警' },

      // 进化层
      { key: 'evolution.flywheel.intervalMs', value: 604800000, type: 'number', description: '飞轮周期 (ms, 默认7天)' },
      { key: 'evolution.flywheel.autoStart', value: false, type: 'boolean', description: '是否自动启动飞轮' },
      { key: 'evolution.shadow.minSamples', value: 100, type: 'number', description: '影子评估最小样本数' },
      { key: 'evolution.canary.maxTrafficPercent', value: 10, type: 'number', description: '金丝雀最大流量百分比' },

      // 知识层
      { key: 'knowledge.kg.decayEnabled', value: true, type: 'boolean', description: '知识图谱是否启用衰减' },
      { key: 'knowledge.kg.decayHalfLifeDays', value: 90, type: 'number', description: '知识半衰期 (天)' },
      { key: 'knowledge.crystal.autoApply', value: false, type: 'boolean', description: '结晶知识是否自动应用' },

      // 平台
      { key: 'platform.logLevel', value: 'info', type: 'string', description: '日志级别' },
      { key: 'platform.metricsEnabled', value: true, type: 'boolean', description: '是否启用指标收集' },
      { key: 'platform.maxConcurrentDiagnosis', value: 10, type: 'number', description: '最大并发诊断数' },
    ];

    for (const d of defaults) {
      this.set(d.key, d.value, {
        scope: 'global',
        type: d.type,
        description: d.description,
        updatedBy: 'system_default',
      });
    }

    // 注册内置特性开关
    const flags: FeatureFlag[] = [
      { key: 'grok_tool_calling', enabled: true, description: 'Grok Tool Calling 功能', rolloutPercentage: 100, conditions: [], updatedAt: Date.now() },
      { key: 'worldmodel_prediction', enabled: true, description: 'WorldModel 预测功能', rolloutPercentage: 100, conditions: [], updatedAt: Date.now() },
      { key: 'evolution_flywheel', enabled: false, description: '自进化飞轮（需手动启用）', rolloutPercentage: 100, conditions: [], updatedAt: Date.now() },
      { key: 'auto_code_gen', enabled: false, description: '自动代码生成（实验性）', rolloutPercentage: 10, conditions: [], updatedAt: Date.now() },
      { key: 'transfer_learning', enabled: false, description: '跨工况迁移学习', rolloutPercentage: 50, conditions: [], updatedAt: Date.now() },
      { key: 'chain_reasoning', enabled: true, description: '链式认知推理', rolloutPercentage: 100, conditions: [], updatedAt: Date.now() },
    ];

    for (const flag of flags) {
      this.featureFlags.set(flag.key, flag);
    }
  }
}
