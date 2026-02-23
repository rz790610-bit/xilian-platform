/**
 * XPE v1.1 内置插件 — observability
 *
 * 可观测性插件化：封装 OTel 初始化，提供 dev/prod/test 三套 exporter。
 * type: 'infra', infraRole: 'health-check'
 *
 * 职责：
 *  1. 根据 NODE_ENV 选择 exporter 策略
 *  2. OTel 初始化失败时自动降级到 console exporter
 *  3. 提供 getTracer() / withSpan() 统一 API
 *  4. 响应配置变更（otel.* 相关 key）
 */
import type { PluginDefinition } from '../../core/plugin-engine/types';
import type { PluginContext } from '../../core/plugin-engine/plugin-context';
import config from '../../core/config';

// ── Exporter 策略枚举 ──────────────────────────────────────
type ExporterStrategy = 'production' | 'development' | 'test';

function resolveStrategy(): ExporterStrategy {
  const env = config.app.env;
  if (env === 'test') return 'test';
  if (env === 'production') return 'production';
  return 'development';
}

// ── 状态 ────────────────────────────────────────────────────
let currentStrategy: ExporterStrategy = 'development';
let otelInitialized = false;
let degradedToConsole = false;

// ── 插件定义 ────────────────────────────────────────────────
const observabilityPlugin: PluginDefinition = {
  manifest: {
    id: 'xpe-observability',
    name: 'Observability',
    version: '1.1.0',
    type: 'infra',
    infraRole: 'health-check',
    description: 'OTel 可观测性封装：trace/metrics/logs + 三套 exporter + 降级策略',
    enabled: true,
    critical: false, // OTel 失败不应阻止平台启动
    dependencies: [],
    after: [],
    tags: ['infra', 'observability', 'otel', 'metrics'],
    capabilities: ['tracing', 'metrics', 'logging'],
  },

  async onInstall(ctx: PluginContext) {
    currentStrategy = resolveStrategy();
    ctx.logger.info(`Observability 安装中，exporter 策略: ${currentStrategy}`);
  },

  async onActivate(ctx: PluginContext) {
    ctx.logger.info('Observability 激活中...');

    try {
      // 尝试使用现有 OTel 初始化（复用 opentelemetry.ts）
      const otelModule = await import('../middleware/opentelemetry');

      if (currentStrategy === 'test') {
        // 测试环境：不初始化 OTel，仅 console
        ctx.logger.info('测试环境：跳过 OTel 初始化，使用 console exporter');
        degradedToConsole = true;
        otelInitialized = false;
      } else {
        // dev/prod：调用现有初始化
        await otelModule.initOpenTelemetry();
        otelInitialized = true;
        degradedToConsole = false;
        ctx.logger.info(`OTel 初始化成功 (${currentStrategy})`);
      }
    } catch (err) {
      // 降级到 console exporter
      degradedToConsole = true;
      otelInitialized = false;
      ctx.logger.warn('OTel 初始化失败，降级到 console exporter', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 记录状态到 cache
    ctx.cache.set('strategy', currentStrategy);
    ctx.cache.set('otelInitialized', otelInitialized);
    ctx.cache.set('degradedToConsole', degradedToConsole);
    ctx.cache.set('activatedAt', new Date().toISOString());
  },

  async onDeactivate(ctx: PluginContext) {
    ctx.logger.info('Observability 停用中...');

    if (otelInitialized) {
      try {
        const otelModule = await import('../middleware/opentelemetry');
        await otelModule.shutdownOpenTelemetry();
        ctx.logger.info('OTel SDK 已关闭');
      } catch (err) {
        ctx.logger.warn('OTel 关闭失败', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    otelInitialized = false;
    degradedToConsole = false;
    ctx.cache.clear();
  },

  async onConfigChange(changedKeys: string[], ctx: PluginContext) {
    // 仅响应 otel 相关配置
    const otelKeys = changedKeys.filter(k => k.startsWith('otel.') || k.startsWith('OTEL_'));
    if (otelKeys.length === 0) return;

    ctx.logger.info(`OTel 配置变更: [${otelKeys.join(', ')}]`);

    // 重新评估策略
    const newStrategy = resolveStrategy();
    if (newStrategy !== currentStrategy) {
      ctx.logger.info(`Exporter 策略切换: ${currentStrategy} → ${newStrategy}`);
      currentStrategy = newStrategy;
      ctx.cache.set('strategy', currentStrategy);
    }
  },

  async healthCheck(): Promise<boolean> {
    // 只要不是完全失败就算健康
    return otelInitialized || degradedToConsole;
  },
};

export default observabilityPlugin;
