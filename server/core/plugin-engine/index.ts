/**
 * XPE v1.1 — PluginEngine 主类
 *
 * 平台唯一插件总线，所有可扩展能力通过 Manifest 声明式注册。
 * 职责：discover → register → install → activate → 运行时管理 → shutdown
 */
import { EventEmitter } from 'events';
import { PluginManifestSchema, type PluginManifest } from './manifest.schema';
import type { PluginInstance, PluginDefinition, PluginState, ModuleCacheEntry } from './types';
import { createPluginContext, type PluginLogger, type ContextDependencies } from './plugin-context';
import { topologicalSort, generateFlowDiagram, CyclicDependencyError, type DAGNode } from './dag';
import { executeStartupSequence, executeShutdown, executePhase } from './lifecycle';

// ── PluginEngine 配置 ───────────────────────────────────────
export interface PluginEngineOptions {
  /** 插件扫描目录（相对于项目根） */
  pluginDirs?: string[];
  /** 全局日志器 */
  logger?: PluginLogger;
  /** 是否启用热重载 */
  hotReload?: boolean;
}

// ── PluginEngine 事件 ───────────────────────────────────────
export type PluginEngineEvent =
  | 'plugin:registered'
  | 'plugin:installed'
  | 'plugin:activated'
  | 'plugin:deactivated'
  | 'plugin:degraded'
  | 'plugin:configChanged'
  | 'engine:bootstrapped'
  | 'engine:shutdown';

// ── PluginEngine 主类 ───────────────────────────────────────
export class PluginEngine {
  private instances = new Map<string, PluginInstance>();
  private moduleCache = new Map<string, ModuleCacheEntry>();
  private emitter = new EventEmitter();
  private logger: PluginLogger;
  private bootstrapped = false;
  private readonly options: Required<PluginEngineOptions>;

  constructor(options: PluginEngineOptions = {}) {
    this.options = {
      pluginDirs: options.pluginDirs ?? ['server/platform/plugins'],
      logger: options.logger ?? createDefaultLogger(),
      hotReload: options.hotReload ?? false,
    };
    this.logger = this.options.logger;
    this.emitter.setMaxListeners(100);
  }

  // ── 事件 API ────────────────────────────────────────────
  on(event: PluginEngineEvent, handler: (...args: unknown[]) => void): void {
    this.emitter.on(event, handler);
  }

  off(event: PluginEngineEvent, handler: (...args: unknown[]) => void): void {
    this.emitter.off(event, handler);
  }

  private emit(event: PluginEngineEvent, data?: unknown): void {
    this.emitter.emit(event, data);
  }

  // ── 注册插件定义 ────────────────────────────────────────
  /**
   * 注册一个插件定义（编程式注册，不经过文件系统 discover）
   */
  register(definition: PluginDefinition): void {
    const { manifest } = definition;

    // Zod 验证
    const result = PluginManifestSchema.safeParse(manifest);
    if (!result.success) {
      this.logger.error(`Manifest 验证失败: ${manifest.id ?? 'unknown'}`, {
        errors: result.error.format(),
      });
      throw new Error(`Manifest 验证失败: ${JSON.stringify(result.error.format())}`);
    }

    const validatedManifest = result.data;

    if (this.instances.has(validatedManifest.id)) {
      this.logger.warn(`插件 "${validatedManifest.id}" 已注册，跳过重复注册`);
      return;
    }

    if (!validatedManifest.enabled) {
      this.logger.info(`插件 "${validatedManifest.id}" 已禁用，跳过注册`);
      return;
    }

    // 创建 PluginContext
    const contextDeps = this.createContextDeps();
    const context = createPluginContext(validatedManifest, contextDeps);

    // 创建 PluginInstance
    const instance: PluginInstance = {
      manifest: validatedManifest,
      context,
      state: 'registered',
      onRegister: definition.onRegister,
      onInstall: definition.onInstall,
      onActivate: definition.onActivate,
      onDeactivate: definition.onDeactivate,
      onConfigChange: definition.onConfigChange,
      execute: definition.execute,
      healthCheck: definition.healthCheck,
    };

    this.instances.set(validatedManifest.id, instance);
    this.logger.info(`已注册插件: ${validatedManifest.id} (${validatedManifest.type})`);
    this.emit('plugin:registered', { pluginId: validatedManifest.id });
  }

  // ── 批量注册 ────────────────────────────────────────────
  registerAll(definitions: PluginDefinition[]): void {
    for (const def of definitions) {
      try {
        this.register(def);
      } catch (err) {
        this.logger.error(`注册失败: ${def.manifest?.id ?? 'unknown'}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // ── 文件系统发现 ────────────────────────────────────────
  /**
   * 从指定目录扫描 *.plugin.ts 文件并注册
   * 模块缓存 sourcePath 以支持热重载（审查修正 5）
   */
  async discover(baseDir: string): Promise<number> {
    const fs = await import('fs');
    const path = await import('path');
    let count = 0;

    for (const pluginDir of this.options.pluginDirs) {
      const fullDir = path.resolve(baseDir, pluginDir);
      if (!fs.existsSync(fullDir)) {
        this.logger.warn(`插件目录不存在: ${fullDir}`);
        continue;
      }

      const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.plugin.ts') || f.endsWith('.plugin.js'));

      for (const file of files) {
        const sourcePath = path.join(fullDir, file);
        try {
          const mod = await import(sourcePath);
          const definition: PluginDefinition = mod.default ?? mod;

          if (!definition.manifest) {
            this.logger.warn(`文件 ${file} 未导出有效的 PluginDefinition，跳过`);
            continue;
          }

          // 缓存模块和路径（审查修正 5：activate 从缓存读取）
          this.moduleCache.set(definition.manifest.id, {
            manifest: definition.manifest,
            mod,
            sourcePath,
          });

          this.register(definition);
          count++;
        } catch (err) {
          this.logger.error(`加载插件文件失败: ${file}`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    this.logger.info(`发现并注册了 ${count} 个插件`);
    return count;
  }

  // ── 启动引导 ────────────────────────────────────────────
  /**
   * 按 DAG 拓扑顺序执行所有已注册插件的启动序列
   */
  async bootstrap(): Promise<Map<string, PluginState>> {
    if (this.bootstrapped) {
      this.logger.warn('PluginEngine 已经启动过，跳过重复 bootstrap');
      return this.getStates();
    }

    this.logger.info(`开始启动 ${this.instances.size} 个插件...`);

    // 构建 DAG 节点
    const nodes: DAGNode[] = [];
    for (const [id, instance] of this.instances) {
      nodes.push({
        id,
        dependencies: instance.manifest.dependencies ?? [],
        after: instance.manifest.after ?? [],
      });
    }

    // 拓扑排序（含环检测 — 审查修正 6）
    let sortedIds: string[];
    try {
      sortedIds = topologicalSort(nodes, new Set(this.instances.keys()));
    } catch (err) {
      if (err instanceof CyclicDependencyError) {
        this.logger.error(`循环依赖检测: ${err.cycle.join(' → ')}`);
      }
      throw err;
    }

    // 按顺序执行启动序列
    const results = new Map<string, PluginState>();
    for (const id of sortedIds) {
      const instance = this.instances.get(id);
      if (!instance) continue;

      const finalState = await executeStartupSequence(instance);
      results.set(id, finalState);

      // 发射事件
      if (finalState === 'active') {
        this.emit('plugin:activated', { pluginId: id });
      } else if (finalState === 'degraded') {
        this.emit('plugin:degraded', { pluginId: id });
      }
    }

    this.bootstrapped = true;
    this.logger.info('PluginEngine 启动完成', {
      total: this.instances.size,
      active: [...results.values()].filter(s => s === 'active').length,
      degraded: [...results.values()].filter(s => s === 'degraded').length,
    });
    this.emit('engine:bootstrapped');

    return results;
  }

  // ── 配置变更通知（方向 4） ──────────────────────────────
  /**
   * 通知所有活跃插件配置发生变更
   * 每次变更自动走 Zod 验证（审查修正 4 验收标准）
   */
  async notifyConfigChange(changedKeys: string[]): Promise<void> {
    this.logger.info(`配置变更通知: [${changedKeys.join(', ')}]`);

    for (const [id, instance] of this.instances) {
      if (instance.state !== 'active') continue;
      if (!instance.onConfigChange) continue;

      try {
        await instance.onConfigChange(changedKeys, instance.context);
        this.emit('plugin:configChanged', { pluginId: id, changedKeys });
      } catch (err) {
        instance.context.logger.warn('配置变更处理失败', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // ── 热重载（方向 4 增强） ──────────────────────────────
  /**
   * 热重载指定插件：deactivate → 重新加载模块 → activate
   * 从 moduleCache 读取 sourcePath（审查修正 5）
   */
  async hotReload(pluginId: string): Promise<PluginState> {
    if (!this.options.hotReload) {
      throw new Error('热重载未启用');
    }

    const instance = this.instances.get(pluginId);
    if (!instance) {
      throw new Error(`插件 "${pluginId}" 不存在`);
    }

    const cached = this.moduleCache.get(pluginId);
    if (!cached) {
      throw new Error(`插件 "${pluginId}" 无模块缓存（非文件系统发现的插件不支持热重载）`);
    }

    // 1. 停用
    if (instance.state === 'active') {
      await executeShutdown(instance);
    }

    // 2. 重新加载模块（从缓存的 sourcePath 读取）
    try {
      // 清除 Node.js 模块缓存
      delete require.cache[require.resolve(cached.sourcePath)];
      const mod = await import(cached.sourcePath);
      const definition: PluginDefinition = mod.default ?? mod;

      // 更新缓存
      cached.mod = mod;

      // 更新实例钩子
      instance.onRegister = definition.onRegister;
      instance.onInstall = definition.onInstall;
      instance.onActivate = definition.onActivate;
      instance.onDeactivate = definition.onDeactivate;
      instance.onConfigChange = definition.onConfigChange;
      instance.execute = definition.execute;
      instance.healthCheck = definition.healthCheck;
    } catch (err) {
      instance.state = 'degraded';
      this.logger.error(`热重载模块加载失败: ${pluginId}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return 'degraded';
    }

    // 3. 重新启动
    instance.state = 'registered';
    return executeStartupSequence(instance);
  }

  // ── 优雅关闭 ────────────────────────────────────────────
  /**
   * 按逆拓扑顺序关闭所有活跃插件
   */
  async shutdown(): Promise<void> {
    this.logger.info('开始关闭 PluginEngine...');

    // 逆拓扑顺序
    const nodes: DAGNode[] = [];
    for (const [id, instance] of this.instances) {
      nodes.push({
        id,
        dependencies: instance.manifest.dependencies ?? [],
        after: instance.manifest.after ?? [],
      });
    }

    let sortedIds: string[];
    try {
      sortedIds = topologicalSort(nodes, new Set(this.instances.keys()));
    } catch {
      // 如果排序失败，按注册顺序关闭
      sortedIds = [...this.instances.keys()];
    }

    // 逆序关闭
    for (const id of sortedIds.reverse()) {
      const instance = this.instances.get(id);
      if (!instance) continue;
      await executeShutdown(instance);
    }

    this.bootstrapped = false;
    this.logger.info('PluginEngine 已关闭');
    this.emit('engine:shutdown');
  }

  // ── 查询 API ────────────────────────────────────────────

  /** 获取插件实例 */
  getPlugin<T = PluginInstance>(id: string): T | undefined {
    return this.instances.get(id) as T | undefined;
  }

  /** 按类型查询 */
  getPluginsByType(type: string): PluginInstance[] {
    return [...this.instances.values()].filter(i => i.manifest.type === type);
  }

  /** 按 tag 查询 */
  getPluginsByTag(tag: string): PluginInstance[] {
    return [...this.instances.values()].filter(i => i.manifest.tags?.includes(tag));
  }

  /** 获取所有插件状态 */
  getStates(): Map<string, PluginState> {
    const states = new Map<string, PluginState>();
    for (const [id, instance] of this.instances) {
      states.set(id, instance.state);
    }
    return states;
  }

  /** 获取活跃插件数量 */
  get activeCount(): number {
    return [...this.instances.values()].filter(i => i.state === 'active').length;
  }

  /** 获取降级插件数量 */
  get degradedCount(): number {
    return [...this.instances.values()].filter(i => i.state === 'degraded').length;
  }

  /** 获取总插件数量 */
  get totalCount(): number {
    return this.instances.size;
  }

  /** 是否已启动 */
  get isBootstrapped(): boolean {
    return this.bootstrapped;
  }

  // ── DAG 可视化（方向 3） ────────────────────────────────

  /**
   * 生成插件依赖关系的 Mermaid 流程图
   */
  getFlowDiagram(options?: { groupByType?: boolean }): string {
    const nodes: DAGNode[] = [];
    const stageMap = new Map<string, string>();
    const parallelIds = new Set<string>();

    for (const [id, instance] of this.instances) {
      nodes.push({
        id,
        dependencies: instance.manifest.dependencies ?? [],
        after: instance.manifest.after ?? [],
      });
      stageMap.set(id, instance.manifest.type);
      if (instance.manifest.type === 'agent' && 'parallel' in instance.manifest && instance.manifest.parallel) {
        parallelIds.add(id);
      }
    }

    return generateFlowDiagram(nodes, {
      title: 'XPE v1.1 Plugin Dependency Graph',
      direction: 'LR',
      groupByStage: options?.groupByType ?? true,
      stageMap,
      parallelIds,
    });
  }

  // ── 健康检查 ────────────────────────────────────────────

  /**
   * 执行所有活跃插件的健康检查
   */
  async healthCheck(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [id, instance] of this.instances) {
      if (instance.state !== 'active') {
        results.set(id, false);
        continue;
      }

      if (!instance.healthCheck) {
        results.set(id, true); // 无健康检查视为健康
        continue;
      }

      try {
        const healthy = await instance.healthCheck();
        results.set(id, healthy);
      } catch {
        results.set(id, false);
      }
    }

    return results;
  }

  // ── 内部辅助 ────────────────────────────────────────────

  private createContextDeps(): ContextDependencies {
    return {
      getPlugin: (id: string) => {
        const inst = this.instances.get(id);
        return inst?.state === 'active' ? inst : undefined;
      },
      getPluginsByType: (type: string) =>
        [...this.instances.values()]
          .filter(i => i.manifest.type === type && i.state === 'active'),
      getPluginsByTag: (tag: string) =>
        [...this.instances.values()]
          .filter(i => i.manifest.tags?.includes(tag) && i.state === 'active'),
      isPluginActive: (id: string) => this.instances.get(id)?.state === 'active',
      parentLogger: this.logger,
    };
  }
}

// ── 默认 Logger ─────────────────────────────────────────────
function createDefaultLogger(): PluginLogger {
  return {
    debug: (msg, meta) => console.debug(`[XPE] ${msg}`, meta ?? ''),
    info: (msg, meta) => console.info(`[XPE] ${msg}`, meta ?? ''),
    warn: (msg, meta) => console.warn(`[XPE] ${msg}`, meta ?? ''),
    error: (msg, meta) => console.error(`[XPE] ${msg}`, meta ?? ''),
  };
}

// ── 单例导出 ────────────────────────────────────────────────
let engineInstance: PluginEngine | null = null;

export function getPluginEngine(options?: PluginEngineOptions): PluginEngine {
  if (!engineInstance) {
    engineInstance = new PluginEngine(options);
  }
  return engineInstance;
}

export function resetPluginEngine(): void {
  engineInstance = null;
}

// ── Re-exports ──────────────────────────────────────────────
export { PluginManifestSchema } from './manifest.schema';
export type { PluginManifest } from './manifest.schema';
export type { PluginInstance, PluginDefinition, PluginState, ModuleCacheEntry } from './types';
export type { PluginContext, PluginLogger, PluginEventBus, PluginQueryAPI } from './plugin-context';
export { PluginCache, createPluginContext } from './plugin-context';
export { topologicalSort, generateFlowDiagram, CyclicDependencyError } from './dag';
export type { DAGNode } from './dag';
export { executeStartupSequence, executeShutdown, executePhase, validateTransition, LifecycleError } from './lifecycle';
