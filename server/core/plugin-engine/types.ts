/**
 * XPE v1.1 — 核心类型定义
 *
 * PluginLifecycle: 四阶段生命周期钩子
 * PluginInstance: 运行时插件实例（Manifest + 状态 + 上下文）
 * PluginDefinition: 开发者编写的插件格式
 */
import type { PluginContext } from './plugin-context';
import type { PluginManifest } from './manifest.schema';

// ── 插件状态 ────────────────────────────────────────────────
export type PluginState = 'registered' | 'installed' | 'active' | 'deactivated' | 'degraded' | 'failed';

// ── 生命周期钩子接口 ────────────────────────────────────────
export interface PluginLifecycle {
  /** 注册阶段 — 声明能力，不执行 I/O */
  onRegister?(ctx: PluginContext): Promise<void>;
  /** 安装阶段 — 初始化资源（数据库连接、文件系统等） */
  onInstall?(ctx: PluginContext): Promise<void>;
  /** 激活阶段 — 开始提供服务 */
  onActivate?(ctx: PluginContext): Promise<void>;
  /** 停用阶段 — 优雅关闭 */
  onDeactivate?(ctx: PluginContext): Promise<void>;
  /** 配置变更通知 */
  onConfigChange?(changedKeys: string[], ctx: PluginContext): Promise<void>;
}

// ── 运行时插件实例 ──────────────────────────────────────────
export interface PluginInstance extends Partial<PluginLifecycle> {
  manifest: PluginManifest;
  context: PluginContext;
  state: PluginState;
  /** 插件执行入口（Tool / Agent 类型使用） */
  execute?: (input: unknown) => Promise<unknown>;
  /** 健康检查 */
  healthCheck?: () => Promise<boolean>;
}

// ── 插件定义（开发者编写格式） ──────────────────────────────
export interface PluginDefinition extends Partial<PluginLifecycle> {
  manifest: PluginManifest;
  execute?: (input: unknown) => Promise<unknown>;
  healthCheck?: () => Promise<boolean>;
}

// ── 模块缓存条目 ───────────────────────────────────────────
export interface ModuleCacheEntry {
  manifest: PluginManifest;
  mod: Record<string, unknown>;
  sourcePath: string;
}
