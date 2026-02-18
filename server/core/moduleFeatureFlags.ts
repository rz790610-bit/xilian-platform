/**
 * ============================================================================
 * L1 契约基层 — 模块级 Feature Flags
 * ============================================================================
 * 
 * v3.1 自适应智能架构 · Alpha 阶段 · A-03
 * 
 * 职责：
 *   1. 为 28 个模块提供独立的 enabled/disabled 开关
 *   2. 与 ConfigCenter 集成，支持运行时热更新
 *   3. 与 ModuleRegistry 联动，模块禁用时自动降级
 *   4. 提供 requireModule() 守卫函数
 * 
 * 与现有 featureFlags.ts 的关系：
 *   - featureFlags.ts 管理外部服务级开关（Airflow/Kafka/ES/Grok）
 *   - moduleFeatureFlags.ts 管理平台模块级开关（28 个业务模块）
 *   - 两者互补，不重叠
 * 
 * 配置方式：
 *   - 环境变量：MODULE_TOPOLOGY_ENABLED=true（默认全部 true）
 *   - ConfigCenter API：运行时动态切换
 * 
 * 架构位置: server/core/moduleFeatureFlags.ts
 * 依赖: server/core/registries/module.registry.ts
 */

import { createModuleLogger } from './logger';

const log = createModuleLogger('module-feature-flags');

// ============ 类型定义 ============

/** 模块 Flag 条目 */
export interface ModuleFlagEntry {
  /** 模块 ID */
  moduleId: string;
  /** 是否启用 */
  enabled: boolean;
  /** 配置来源 */
  source: 'env' | 'config-center' | 'default';
  /** 最后更新时间 */
  updatedAt: Date;
  /** 更新者 */
  updatedBy: string;
}

/** Flag 变更事件 */
export interface FlagChangeEvent {
  moduleId: string;
  oldValue: boolean;
  newValue: boolean;
  source: string;
  timestamp: Date;
}

export type FlagChangeListener = (event: FlagChangeEvent) => void | Promise<void>;

// ============ 28 个模块的默认 Flag 定义 ============

const MODULE_IDS = [
  // core
  'topology', 'device', 'alert', 'gateway', 'accessLayer', 'knowledgeBase', 'model',
  // data
  'dataGovernance', 'dataCollection', 'dataLabel', 'dataAsset',
  // orchestration
  'pipeline', 'plugin', 'algorithm', 'kgOrchestrator', 'erDiagram',
  // intelligence
  'fusionDiagnosis', 'grokAgent', 'distillation', 'evolution',
  // security
  'monitoring', 'auditLog', 'secretManager',
  // infra
  'scheduler', 'eventBus', 'saga', 'outbox', 'deduplication', 'adaptiveSampling',
  'microservice', 'database',
] as const;

export type ModuleId = typeof MODULE_IDS[number];

// ============ 工具函数 ============

function parseBool(value: string | undefined, defaultValue: boolean = true): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/** 将 camelCase 模块 ID 转为环境变量名：dataGovernance → MODULE_DATA_GOVERNANCE_ENABLED */
function toEnvKey(moduleId: string): string {
  const snakeCase = moduleId.replace(/([A-Z])/g, '_$1').toUpperCase();
  return `MODULE_${snakeCase}_ENABLED`;
}

// ============ ModuleFeatureFlags 类 ============

class ModuleFeatureFlags {
  private flags = new Map<string, ModuleFlagEntry>();
  private listeners = new Set<FlagChangeListener>();
  private history: FlagChangeEvent[] = [];

  constructor() {
    this.initializeFromEnv();
  }

  /** 从环境变量初始化所有模块 Flag */
  private initializeFromEnv(): void {
    for (const moduleId of MODULE_IDS) {
      const envKey = toEnvKey(moduleId);
      const envValue = process.env[envKey];
      const enabled = parseBool(envValue, true); // 默认全部启用

      this.flags.set(moduleId, {
        moduleId,
        enabled,
        source: envValue !== undefined ? 'env' : 'default',
        updatedAt: new Date(),
        updatedBy: 'system-init',
      });
    }

    const disabledCount = Array.from(this.flags.values()).filter(f => !f.enabled).length;
    log.info(`[ModuleFeatureFlags] Initialized ${this.flags.size} module flags (${disabledCount} disabled)`);
  }

  /** 检查模块是否启用 */
  isEnabled(moduleId: string): boolean {
    const flag = this.flags.get(moduleId);
    return flag ? flag.enabled : true; // 未注册的模块默认启用
  }

  /** 设置模块启停状态 */
  async setEnabled(moduleId: string, enabled: boolean, updatedBy: string = 'api'): Promise<void> {
    const flag = this.flags.get(moduleId);
    if (!flag) {
      log.warn(`[ModuleFeatureFlags] Unknown module: ${moduleId}`);
      return;
    }

    const oldValue = flag.enabled;
    if (oldValue === enabled) return; // 无变化

    flag.enabled = enabled;
    flag.source = 'config-center';
    flag.updatedAt = new Date();
    flag.updatedBy = updatedBy;

    const event: FlagChangeEvent = {
      moduleId,
      oldValue,
      newValue: enabled,
      source: updatedBy,
      timestamp: new Date(),
    };

    this.history.push(event);
    log.info(`[ModuleFeatureFlags] ${moduleId}: ${oldValue} → ${enabled} (by ${updatedBy})`);

    // 通知监听器
    for (const listener of this.listeners) {
      try {
        await listener(event);
      } catch (err) {
        log.error(`[ModuleFeatureFlags] Listener error:`, err);
      }
    }
  }

  /** 批量设置 */
  async setBatch(updates: Array<{ moduleId: string; enabled: boolean }>, updatedBy: string = 'api'): Promise<void> {
    for (const { moduleId, enabled } of updates) {
      await this.setEnabled(moduleId, enabled, updatedBy);
    }
  }

  /** 获取所有 Flag */
  getAll(): ModuleFlagEntry[] {
    return Array.from(this.flags.values());
  }

  /** 获取单个 Flag */
  getFlag(moduleId: string): ModuleFlagEntry | undefined {
    return this.flags.get(moduleId);
  }

  /** 获取已禁用的模块列表 */
  getDisabledModules(): string[] {
    return Array.from(this.flags.values())
      .filter(f => !f.enabled)
      .map(f => f.moduleId);
  }

  /** 获取变更历史 */
  getHistory(limit: number = 50): FlagChangeEvent[] {
    return this.history.slice(-limit);
  }

  /** 注册变更监听器 */
  onChange(listener: FlagChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 获取统计摘要 */
  getSummary(): {
    total: number;
    enabled: number;
    disabled: number;
    bySource: Record<string, number>;
  } {
    const all = this.getAll();
    const bySource: Record<string, number> = {};
    for (const f of all) {
      bySource[f.source] = (bySource[f.source] || 0) + 1;
    }
    return {
      total: all.length,
      enabled: all.filter(f => f.enabled).length,
      disabled: all.filter(f => !f.enabled).length,
      bySource,
    };
  }
}

// ============ 全局单例 ============
export const moduleFeatureFlags = new ModuleFeatureFlags();

// ============ 守卫函数 ============

/**
 * 检查模块是否启用，未启用时抛出友好错误
 * 
 * 用法：
 * ```typescript
 * requireModule('pipeline'); // 如果 pipeline 被禁用，抛出错误
 * ```
 */
export function requireModule(moduleId: string, moduleLabel?: string): void {
  if (!moduleFeatureFlags.isEnabled(moduleId)) {
    const label = moduleLabel || moduleId;
    throw new Error(
      `[ModuleDisabled] ${label} 模块已禁用。` +
      `请通过 ConfigCenter 或设置环境变量 ${toEnvKey(moduleId)}=true 启用。`
    );
  }
}
