/**
 * XPE v1.1 内置插件 — config-bridge
 *
 * 桥接 ConfigCenter 到 PluginEngine 的配置热更新通道。
 * type: 'infra', infraRole: 'config-bridge'
 *
 * 职责：
 *  1. activate 时订阅 ConfigCenter.watchAll()
 *  2. 每次配置变更自动走 Zod 验证
 *  3. 转发变更事件到 pluginEngine.notifyConfigChange()
 */
import { z } from 'zod';
import type { PluginDefinition } from '../../core/plugin-engine/types';
import type { PluginContext } from '../../core/plugin-engine/plugin-context';
import { configCenter, type ConfigChangeEvent } from '../services/configCenter';
import { getPluginEngine } from '../../core/plugin-engine';

// ── 配置变更验证 Schema（可扩展） ──────────────────────────
const ConfigChangeSchema = z.object({
  key: z.string().min(1),
  newValue: z.string(),
  oldValue: z.string().optional(),
  source: z.string().default('system'),
});

// ── 取消订阅句柄 ───────────────────────────────────────────
let unwatchFn: (() => void) | null = null;

// ── 配置变更处理器 ──────────────────────────────────────────
function createChangeHandler(ctx: PluginContext) {
  return async (event: ConfigChangeEvent) => {
    // Zod 验证每次变更（审查修正 4 要求）
    const result = ConfigChangeSchema.safeParse({
      key: event.key,
      newValue: event.newValue,
      oldValue: event.oldValue,
      source: event.source,
    });

    if (!result.success) {
      ctx.logger.warn('配置变更 Zod 验证失败，跳过转发', {
        key: event.key,
        errors: result.error.format(),
      });
      return;
    }

    ctx.logger.debug(`配置变更: ${event.key}`, {
      source: event.source,
    });

    // 转发到 PluginEngine
    const engine = getPluginEngine();
    await engine.notifyConfigChange([event.key]);

    // 发射进程内事件
    ctx.events.emit('config:changed', {
      key: event.key,
      newValue: event.newValue,
      oldValue: event.oldValue,
    });

    // 统计
    const count = ctx.cache.get<number>('changeCount') ?? 0;
    ctx.cache.set('changeCount', count + 1);
  };
}

// ── 插件定义 ────────────────────────────────────────────────
const configBridgePlugin: PluginDefinition = {
  manifest: {
    id: 'xpe-config-bridge',
    name: 'Config Bridge',
    version: '1.1.0',
    type: 'infra',
    infraRole: 'config-bridge',
    description: '桥接 ConfigCenter 到 PluginEngine 配置热更新通道',
    enabled: true,
    critical: true,
    dependencies: [],
    after: [],
    tags: ['infra', 'config', 'hot-reload'],
    capabilities: ['config-watch', 'zod-validation'],
  },

  async onInstall(ctx: PluginContext) {
    ctx.logger.info('Config Bridge 安装中...');
    // 验证 ConfigCenter 可用性
    if (!configCenter) {
      throw new Error('ConfigCenter 实例不可用');
    }
    ctx.logger.info('ConfigCenter 连接验证通过');
  },

  async onActivate(ctx: PluginContext) {
    ctx.logger.info('Config Bridge 激活中...');

    // 订阅所有配置变更
    const handler = createChangeHandler(ctx);
    unwatchFn = configCenter.watchAll(handler);

    ctx.cache.set('changeCount', 0);
    ctx.logger.info('已订阅 ConfigCenter.watchAll()');
  },

  async onDeactivate(ctx: PluginContext) {
    ctx.logger.info('Config Bridge 停用中...');

    if (unwatchFn) {
      unwatchFn();
      unwatchFn = null;
    }

    const changeCount = ctx.cache.get<number>('changeCount') ?? 0;
    ctx.logger.info(`Config Bridge 已停用，累计转发 ${changeCount} 次配置变更`);
    ctx.cache.clear();
  },

  async healthCheck(): Promise<boolean> {
    return !!configCenter;
  },
};

export default configBridgePlugin;
