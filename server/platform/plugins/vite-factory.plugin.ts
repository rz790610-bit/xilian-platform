/**
 * XPE v1.1 内置插件 — vite-factory
 *
 * Vite 配置插件层抽象：VitePluginFactory + dev/build 双配置分叉。
 * type: 'infra', infraRole: 'security'（审查修正 1：Vite 插件不入 Manifest Schema）
 *
 * 职责：
 *  1. 提供 VitePluginFactory 注册表
 *  2. 按 devOnly/buildOnly 标志组合插件集
 *  3. 消除 vite.config.ts 与 vite.config.shared.ts 的双配置分叉
 *  4. 其他插件在 onActivate 时向 VitePluginFactory 注册 Vite 插件
 */
import type { PluginDefinition } from '../../core/plugin-engine/types';
import type { PluginContext } from '../../core/plugin-engine/plugin-context';

// ── Vite 插件注册表条目 ────────────────────────────────────
export interface VitePluginEntry {
  /** 插件名称（用于日志和去重） */
  name: string;
  /** Vite 插件工厂函数（延迟创建，避免 import 副作用） */
  factory: () => unknown | Promise<unknown>;
  /** 仅在 dev 模式下启用 */
  devOnly?: boolean;
  /** 仅在 build 模式下启用 */
  buildOnly?: boolean;
  /** 优先级（数字越小越先加载，默认 100） */
  priority?: number;
  /** 来源插件 ID */
  sourcePluginId?: string;
}

// ── VitePluginFactory 单例 ──────────────────────────────────
class VitePluginFactory {
  private registry: VitePluginEntry[] = [];

  /**
   * 注册一个 Vite 插件
   */
  register(entry: VitePluginEntry): void {
    // 去重
    const existing = this.registry.findIndex(e => e.name === entry.name);
    if (existing >= 0) {
      this.registry[existing] = entry;
    } else {
      this.registry.push(entry);
    }
  }

  /**
   * 批量注册
   */
  registerAll(entries: VitePluginEntry[]): void {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  /**
   * 获取指定模式下的 Vite 插件列表
   *
   * @param mode - 'development' | 'production'
   * @returns 按优先级排序的 Vite 插件实例数组
   */
  async resolve(mode: 'development' | 'production'): Promise<unknown[]> {
    const isDev = mode === 'development';

    // 过滤
    const applicable = this.registry.filter(entry => {
      if (isDev && entry.buildOnly) return false;
      if (!isDev && entry.devOnly) return false;
      return true;
    });

    // 按优先级排序
    applicable.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

    // 实例化
    const plugins: unknown[] = [];
    for (const entry of applicable) {
      try {
        const plugin = await entry.factory();
        plugins.push(plugin);
      } catch (err) {
        console.warn(`[VitePluginFactory] 插件 "${entry.name}" 创建失败:`, err);
      }
    }

    return plugins;
  }

  /**
   * 获取注册表快照
   */
  getEntries(): VitePluginEntry[] {
    return [...this.registry];
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.registry = [];
  }

  /**
   * 获取注册数量
   */
  get size(): number {
    return this.registry.length;
  }
}

// ── 全局单例 ────────────────────────────────────────────────
let factoryInstance: VitePluginFactory | null = null;

export function getVitePluginFactory(): VitePluginFactory {
  if (!factoryInstance) {
    factoryInstance = new VitePluginFactory();
  }
  return factoryInstance;
}

export function resetVitePluginFactory(): void {
  factoryInstance?.clear();
  factoryInstance = null;
}

// ── 插件定义 ────────────────────────────────────────────────
const viteFactoryPlugin: PluginDefinition = {
  manifest: {
    id: 'xpe-vite-factory',
    name: 'Vite Plugin Factory',
    version: '1.1.0',
    type: 'infra',
    infraRole: 'security', // 审查修正 1：使用 security 而非 config-bridge
    description: 'Vite 配置插件层抽象，按 dev/build 模式组合插件集',
    enabled: true,
    critical: false,
    dependencies: [],
    after: [],
    tags: ['infra', 'vite', 'build'],
    capabilities: ['vite-dev', 'vite-build'],
  },

  async onInstall(ctx: PluginContext) {
    ctx.logger.info('Vite Plugin Factory 安装中...');
  },

  async onActivate(ctx: PluginContext) {
    ctx.logger.info('Vite Plugin Factory 激活中...');

    const factory = getVitePluginFactory();

    // 注册默认 Vite 插件（从 vite.config.shared.ts 迁移）
    factory.registerAll([
      {
        name: '@vitejs/plugin-react',
        factory: async () => {
          const react = (await import('@vitejs/plugin-react')).default;
          return react();
        },
        priority: 10,
        sourcePluginId: 'xpe-vite-factory',
      },
      {
        name: '@tailwindcss/vite',
        factory: async () => {
          const tailwindcss = (await import('@tailwindcss/vite')).default;
          return tailwindcss();
        },
        priority: 20,
        sourcePluginId: 'xpe-vite-factory',
      },
    ]);

    ctx.cache.set('registeredCount', factory.size);
    ctx.logger.info(`已注册 ${factory.size} 个默认 Vite 插件`);
  },

  async onDeactivate(ctx: PluginContext) {
    ctx.logger.info('Vite Plugin Factory 停用中...');
    resetVitePluginFactory();
    ctx.cache.clear();
  },

  async healthCheck(): Promise<boolean> {
    const factory = getVitePluginFactory();
    return factory.size > 0;
  },
};

export default viteFactoryPlugin;
