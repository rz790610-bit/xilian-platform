import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('config-center');

/**
 * 配置中心 - 平台基础设施层
 * 
 * 提供运行时配置热更新能力，支持：
 * - 环境变量 → Redis → 文件系统 三级配置源
 * - 配置变更事件广播（通过 EventBus）
 * - 配置版本追踪
 * - 配置校验与回滚
 * - 敏感配置加密存储
 * 
 * 架构位置: server/platform/services/ (平台服务层)
 * 依赖: server/core/config, server/lib/clients/redis.client, server/services/eventBus.service
 */



// ============================================================
// 类型定义
// ============================================================

export interface ConfigEntry {
  key: string;
  value: string;
  source: 'env' | 'redis' | 'file' | 'api';
  version: number;
  updatedAt: Date;
  updatedBy: string;
  encrypted: boolean;
}

export interface ConfigChangeEvent {
  key: string;
  oldValue: string | null;
  newValue: string;
  source: string;
  version: number;
  timestamp: Date;
}

export type ConfigChangeListener = (event: ConfigChangeEvent) => void | Promise<void>;

export interface ConfigValidationRule {
  key: string;
  validator: (value: string) => boolean;
  errorMessage: string;
}

// ============================================================
// 配置中心实现
// ============================================================

class ConfigCenter {
  private store = new Map<string, ConfigEntry>();
  private listeners = new Map<string, Set<ConfigChangeListener>>();
  private globalListeners = new Set<ConfigChangeListener>();
  private validationRules = new Map<string, ConfigValidationRule>();
  private history: ConfigChangeEvent[] = [];
  private maxHistorySize = 1000;
  private pollTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;

  /**
   * 初始化配置中心
   * 从环境变量加载初始配置，然后尝试从 Redis 加载覆盖配置
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // 阶段 1: 加载环境变量
    this.loadFromEnv();

    // 阶段 2: 尝试从 Redis 加载覆盖配置
    await this.loadFromRedis();

    // 阶段 3: 启动 Redis 配置变更监听
    await this.startRedisWatcher();

    this.isInitialized = true;
    log.info(`Config center initialized (${this.store.size} entries loaded)`);
  }

  /**
   * 获取配置值
   */
  get(key: string, defaultValue?: string): string {
    const entry = this.store.get(key);
    if (entry) return entry.value;
    // 回退到环境变量
    const envValue = process.env[key];
    if (envValue !== undefined) return envValue;
    if (defaultValue !== undefined) return defaultValue;
    return '';
  }

  /**
   * 获取整数配置
   */
  getInt(key: string, defaultValue: number): number {
    const value = this.get(key);
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * 获取布尔配置
   */
  getBool(key: string, defaultValue: boolean): boolean {
    const value = this.get(key);
    if (!value) return defaultValue;
    return value === 'true' || value === '1' || value === 'yes';
  }

  /**
   * 设置配置值（运行时热更新）
   */
  async set(key: string, value: string, updatedBy: string = 'system'): Promise<boolean> {
    // 校验
    const rule = this.validationRules.get(key);
    if (rule && !rule.validator(value)) {
      log.error(`Config validation failed for "${key}": ${rule.errorMessage}`);
      return false;
    }

    const oldEntry = this.store.get(key);
    const version = (oldEntry?.version ?? 0) + 1;

    const entry: ConfigEntry = {
      key,
      value,
      source: 'api',
      version,
      updatedAt: new Date(),
      updatedBy,
      encrypted: false,
    };

    this.store.set(key, entry);

    // 同步到 Redis
    await this.syncToRedis(key, entry);

    // 广播变更事件
    const event: ConfigChangeEvent = {
      key,
      oldValue: oldEntry?.value ?? null,
      newValue: value,
      source: updatedBy,
      version,
      timestamp: new Date(),
    };

    this.recordHistory(event);
    await this.notifyListeners(key, event);

    log.info(`Config updated: ${key} (v${version}, by=${updatedBy})`);
    return true;
  }

  /**
   * 批量设置配置
   */
  async setBatch(entries: Array<{ key: string; value: string }>, updatedBy: string = 'system'): Promise<{ success: number; failed: string[] }> {
    let success = 0;
    const failed: string[] = [];

    for (const { key, value } of entries) {
      const result = await this.set(key, value, updatedBy);
      if (result) success++;
      else failed.push(key);
    }

    return { success, failed };
  }

  /**
   * 监听特定配置变更
   */
  watch(key: string, listener: ConfigChangeListener): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);

    return () => {
      this.listeners.get(key)?.delete(listener);
    };
  }

  /**
   * 监听所有配置变更
   */
  watchAll(listener: ConfigChangeListener): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  /**
   * 注册配置校验规则
   */
  addValidation(rule: ConfigValidationRule): void {
    this.validationRules.set(rule.key, rule);
  }

  /**
   * 获取配置变更历史
   */
  getHistory(key?: string, limit: number = 50): ConfigChangeEvent[] {
    let history = this.history;
    if (key) {
      history = history.filter(e => e.key === key);
    }
    return history.slice(-limit);
  }

  /**
   * 获取所有配置的快照
   */
  getSnapshot(): Record<string, { value: string; source: string; version: number; updatedAt: Date }> {
    const snapshot: Record<string, any> = {};
    this.store.forEach((entry, key) => {
      snapshot[key] = {
        value: entry.encrypted ? '***' : entry.value,
        source: entry.source,
        version: entry.version,
        updatedAt: entry.updatedAt,
      };
    });
    return snapshot;
  }

  /**
   * 回滚配置到指定版本
   */
  async rollback(key: string, targetVersion: number, updatedBy: string = 'system'): Promise<boolean> {
    // P2-CC1: rollback 添加审计日志
    const historyEntry = this.history.find(e => e.key === key && e.version === targetVersion);
    if (!historyEntry) {
      log.error(`Cannot rollback "${key}" to version ${targetVersion}: not found in history`);
      return false;
    }
    const current = this.store.get(key);
    log.info(`[ConfigCenter] Rolling back "${key}" from v${current?.version ?? '?'} to v${targetVersion} by ${updatedBy}`);
    return this.set(key, historyEntry.newValue, `rollback:${updatedBy}`);
  }

  /**
   * 关闭配置中心
   */
  shutdown(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.listeners.clear();
    this.globalListeners.clear();
    log.info('Config center shutdown');
  }

  // ============================================================
  // 内部方法
  // ============================================================

  private loadFromEnv(): void {
    // 加载所有以 NEXUS_ 或 APP_ 开头的环境变量
    const prefixes = ['NEXUS_', 'APP_', 'RATE_LIMIT_', 'OTEL_', 'CORS_'];
    let count = 0;

    for (const [key, value] of Object.entries(process.env)) {
      if (value && prefixes.some(p => key.startsWith(p))) {
        this.store.set(key, {
          key,
          value,
          source: 'env',
          version: 1,
          updatedAt: new Date(),
          updatedBy: 'env',
          encrypted: false,
        });
        count++;
      }
    }

    log.debug(`Loaded ${count} entries from environment variables`);
  }

  private async loadFromRedis(): Promise<void> {
    try {
      const { redisClient } = await import('../../lib/clients/redis.client');
      const client = redisClient.getClient();
      if (!client) return;

      // P1-5: 替换 keys() 为 SCAN 模式，避免大量 key 时阻塞 Redis
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [nextCursor, batch] = await (client as any).scan(cursor, { MATCH: 'config:*', COUNT: 100 });
        cursor = nextCursor;
        keys.push(...batch);
      } while (cursor !== '0');
      let count = 0;

      for (const redisKey of keys) {
        const raw = await client.get(redisKey);
        if (!raw) continue;

        try {
          const entry = JSON.parse(raw) as ConfigEntry;
          const existingEntry = this.store.get(entry.key);

          // Redis 配置覆盖环境变量（除非环境变量版本更高）
          if (!existingEntry || entry.version > existingEntry.version) {
            this.store.set(entry.key, entry);
            count++;
          }
        } catch {
          log.warn(`Invalid config entry in Redis: ${redisKey}`);
        }
      }

      log.debug(`Loaded ${count} entries from Redis`);
    } catch (err) {
      log.warn('Failed to load config from Redis (continuing with env only):', (err as Error).message);
    }
  }

  private async syncToRedis(key: string, entry: ConfigEntry): Promise<void> {
    try {
      const { redisClient } = await import('../../lib/clients/redis.client');
      const client = redisClient.getClient();
      if (!client) return;

      await client.set(`config:${key}`, JSON.stringify(entry));

      // 发布变更通知（其他进程通过 Redis Pub/Sub 接收）
      await client.publish('config:changed', JSON.stringify({ key, version: entry.version }));
    } catch (err) {
      log.warn(`Failed to sync config to Redis: ${key}`, (err as Error).message);
    }
  }

  private async startRedisWatcher(): Promise<void> {
    try {
      const { redisClient } = await import('../../lib/clients/redis.client');

      // 通过 Redis Pub/Sub 监听其他进程的配置变更
      await redisClient.psubscribe('config:changed', async (_pattern, _channel, message) => {
        try {
          const { key } = JSON.parse(message);
          // 从 Redis 重新加载该配置
          const client = redisClient.getClient();
          if (!client) return;

          const raw = await client.get(`config:${key}`);
          if (!raw) return;

          const entry = JSON.parse(raw) as ConfigEntry;
          const existing = this.store.get(key);

          if (!existing || entry.version > existing.version) {
            this.store.set(key, entry);
            log.info(`Config hot-reloaded from Redis: ${key} (v${entry.version})`);

            await this.notifyListeners(key, {
              key,
              oldValue: existing?.value ?? null,
              newValue: entry.value,
              source: 'redis-sync',
              version: entry.version,
              timestamp: new Date(),
            });
          }
        } catch (err) {
          log.warn('Failed to process config change notification:', (err as Error).message);
        }
      });

      log.debug('Redis config watcher started');
    } catch (err) {
      log.warn('Failed to start Redis config watcher:', (err as Error).message);
    }
  }

  private async notifyListeners(key: string, event: ConfigChangeEvent): Promise<void> {
    // 通知特定 key 的监听者
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      const listenersArr = Array.from(keyListeners);
      for (const listener of listenersArr) {
        try {
          await listener(event);
        } catch (err) {
          log.error(`Config change listener error for "${key}":`, String(err));
        }
      }
    }

    // 通知全局监听者
    const globalArr = Array.from(this.globalListeners);
    for (const listener of globalArr) {
      try {
        await listener(event);
      } catch (err) {
        log.error('Global config change listener error:', String(err));
      }
    }

    // 通过 EventBus 广播
    try {
      const { eventBus, TOPICS } = await import('../../services/eventBus.service');
      eventBus.publish(
        (TOPICS as any).SYSTEM_CONFIG_CHANGED || 'system.config.changed',
        'ConfigChanged',
        { key, version: event.version },
        { source: 'configCenter' },
      );
    } catch {
      // EventBus 可能未初始化
    }
  }

  private recordHistory(event: ConfigChangeEvent): void {
    this.history.push(event);
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
  }
}

// ============================================================
// v5.0 进化模块配置命名空间
// ============================================================

/** v5.0 进化模块默认配置值 */
export const V5_CONFIG_DEFAULTS: Record<string, string> = {
  // 感知层
  'v5.perception.ringBuffer.sizeKB': '64',
  'v5.perception.adaptiveSampler.enabled': 'true',
  'v5.perception.dsFusion.highConflictThreshold': '0.5',
  'v5.perception.uncertainty.enabled': 'true',
  'v5.perception.stateVector.dimensions': '21',
  // Grok 推理
  'v5.grok.enabled': 'false',
  'v5.grok.maxSteps': '10',
  'v5.grok.timeoutMs': '30000',
  'v5.grok.model': 'grok-3',
  'v5.grok.temperature': '0.1',
  'v5.grok.maxTokens': '4096',
  'v5.grok.enableToolCalling': 'true',
  // WorldModel
  'v5.worldModel.predictionHorizon': '3600',
  'v5.worldModel.counterfactualEnabled': 'true',
  'v5.worldModel.anomalyThreshold': '0.8',
  // 护栏
  'v5.guardrail.enabled': 'true',
  'v5.guardrail.cooldownMs': '60000',
  'v5.guardrail.safetyRulesEnabled': 'true',
  'v5.guardrail.healthRulesEnabled': 'true',
  'v5.guardrail.efficiencyRulesEnabled': 'true',
  // 进化飞轮
  'v5.evolution.flywheelEnabled': 'false',
  'v5.evolution.shadowEvalScenarios': '100',
  'v5.evolution.championMinConfidence': '0.95',
  'v5.evolution.canaryTrafficPercent': '5',
  'v5.evolution.crystallizationMinSamples': '50',
  'v5.evolution.metaLearnerEnabled': 'false',
  // 知识层
  'v5.knowledge.graphEnabled': 'true',
  'v5.knowledge.featureRegistryEnabled': 'true',
  'v5.knowledge.chainReasoningMaxDepth': '5',
  // Pipeline
  'v5.pipeline.dagMaxParallel': '4',
  'v5.pipeline.dagTimeoutMs': '300000',
  // 数字孪生
  'v5.digitalTwin.syncIntervalMs': '1000',
  'v5.digitalTwin.replaySpeedMultiplier': '1',
  // 仪表盘
  'v5.dashboard.wsEnabled': 'true',
  'v5.dashboard.refreshIntervalMs': '5000',
};

// ============================================================
// 单例导出
// ============================================================

export const configCenter = new ConfigCenter();

/**
 * v5.0: 初始化进化模块配置默认值
 * 在平台启动时调用，将 v5 默认值加载到 configCenter（不覆盖已有值）
 */
export async function initV5ConfigDefaults(): Promise<void> {
  for (const [key, defaultValue] of Object.entries(V5_CONFIG_DEFAULTS)) {
    const existing = configCenter.get(key);
    if (!existing) {
      await configCenter.set(key, defaultValue, 'v5-init');
    }
  }
  log.info(`v5.0 config defaults loaded (${Object.keys(V5_CONFIG_DEFAULTS).length} keys)`);
}
