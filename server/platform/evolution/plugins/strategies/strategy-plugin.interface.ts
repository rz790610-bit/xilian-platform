/**
 * ============================================================================
 * StrategyPlugin — MetaLearner 策略插件接口
 * ============================================================================
 *
 * 将 MetaLearner 的假设生成策略插件化：
 *   - 每个策略是一个独立插件，实现 execute(context) → Hypothesis[]
 *   - 通过 pluginEngine.installPlugin() 注册，支持热插拔
 *   - MetaLearner 按 preferredStrategy 选择插件执行
 *
 * 架构位置: server/platform/evolution/plugins/strategies/
 * 依赖: plugin.engine (Plugin 接口), meta-learner (Hypothesis 类型)
 */
import type { Plugin, PluginMetadata, PluginContext } from '../../../../services/plugin.engine';
import type { Hypothesis, HypothesisGenerationContext } from '../../metalearner/meta-learner';

// ============================================================================
// 策略插件接口
// ============================================================================

/**
 * 策略插件扩展 Plugin 接口，增加强类型 executeStrategy 方法
 */
export interface StrategyPlugin extends Plugin {
  /** 策略执行入口 — 接收优化上下文，返回假设列表 */
  executeStrategy(context: HypothesisGenerationContext): Promise<Hypothesis[]>;
}

// ============================================================================
// 策略插件工厂
// ============================================================================

/**
 * 创建策略插件的便捷工厂函数
 *
 * @param id      插件 ID（如 'meta-learner.bayesian'）
 * @param name    插件名称（如 '贝叶斯优化策略'）
 * @param version 版本号
 * @param executeFn 策略执行函数
 */
export function createStrategyPlugin(
  id: string,
  name: string,
  version: string,
  executeFn: (ctx: HypothesisGenerationContext) => Promise<Hypothesis[]>,
): StrategyPlugin {
  return {
    metadata: {
      id,
      name,
      version,
      type: 'analyzer',          // 复用 PluginType，策略本质是"分析器"
      tags: ['evolution', 'strategy', id],
      description: `MetaLearner ${name} 优化策略插件`,
      author: 'xilian-team',
      entryPoint: 'builtin',
      config: { schema: {}, defaults: {} },
    },

    // ── 策略执行 ──
    executeStrategy: executeFn,

    // ── Plugin 标准 execute（桥接到 executeStrategy） ──
    async execute(ctx: PluginContext): Promise<unknown> {
      const context = ctx.config as unknown as HypothesisGenerationContext;
      return executeFn(context);
    },

    // ── 生命周期钩子 ──
    async onInstall() { /* 安装时预热 */ },
    async onEnable()  { /* 启用 */ },
    async onDisable() { /* 禁用 */ },
    async onUninstall() { /* 清理资源 */ },
    async onConfigChange(_newConfig: Record<string, unknown>) { /* 热更新 */ },

    // ── 健康检查 ──
    async healthCheck() {
      return { healthy: true, message: `Strategy plugin ${id} is healthy` };
    },
  };
}
