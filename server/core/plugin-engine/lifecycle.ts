/**
 * XPE v1.1 — 插件生命周期状态机
 *
 * 状态流转：registered → installed → active → deactivated
 * 异常降级：任意阶段失败 → degraded（critical 插件直接 throw）
 */
import type { PluginState, PluginInstance } from './types';
import type { PluginContext } from './plugin-context';

// ── 合法状态转换表 ──────────────────────────────────────────
const VALID_TRANSITIONS: Record<PluginState, PluginState[]> = {
  registered: ['installed', 'degraded'],
  installed: ['active', 'degraded'],
  active: ['deactivated', 'degraded'],
  deactivated: ['installed', 'degraded'],  // 可重新安装
  degraded: ['installed'],                  // 降级后可尝试恢复
  failed: ['registered'],                    // 失败后可重新注册
};

export class LifecycleError extends Error {
  public readonly pluginId: string;
  public readonly fromState: PluginState;
  public readonly toState: PluginState;

  constructor(pluginId: string, fromState: PluginState, toState: PluginState, cause?: Error) {
    super(
      `插件 "${pluginId}" 状态转换失败: ${fromState} → ${toState}` +
      (cause ? ` — ${cause.message}` : ''),
    );
    this.name = 'LifecycleError';
    this.pluginId = pluginId;
    this.fromState = fromState;
    this.toState = toState;
    if (cause) this.cause = cause;
  }
}

/**
 * 验证状态转换是否合法
 */
export function validateTransition(
  pluginId: string,
  from: PluginState,
  to: PluginState,
): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new LifecycleError(pluginId, from, to);
  }
}

/**
 * 执行单个生命周期阶段
 *
 * @param instance - 插件实例
 * @param phase - 目标阶段
 * @returns 是否成功
 */
export async function executePhase(
  instance: PluginInstance,
  phase: 'register' | 'install' | 'activate' | 'deactivate',
): Promise<boolean> {
  const { manifest, context } = instance;
  const stateMap: Record<string, PluginState> = {
    register: 'registered',
    install: 'installed',
    activate: 'active',
    deactivate: 'deactivated',
  };
  const targetState = stateMap[phase];

  // 特殊处理：register 阶段不需要前置状态校验（初始状态）
  if (phase !== 'register') {
    validateTransition(manifest.id, instance.state, targetState);
  }

  const hookName = `on${phase.charAt(0).toUpperCase()}${phase.slice(1)}` as keyof typeof instance;
  const hook = instance[hookName] as ((ctx: PluginContext) => Promise<void>) | undefined;

  try {
    if (hook) {
      await hook(context);
    }
    instance.state = targetState;
    context.logger.info(`生命周期 → ${targetState}`);
    return true;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));

    if (manifest.critical) {
      // critical 插件失败：不降级，直接抛出
      context.logger.error(`critical 插件 ${phase} 失败，中止启动`, { error: error.message });
      throw new LifecycleError(manifest.id, instance.state, targetState, error);
    }

    // 非 critical 插件：降级
    context.logger.warn(`${phase} 失败，降级处理`, { error: error.message });
    instance.state = 'degraded';
    return false;
  }
}

/**
 * 执行完整的启动序列：register → install → activate
 *
 * @param instance - 插件实例
 * @returns 最终状态
 */
export async function executeStartupSequence(
  instance: PluginInstance,
): Promise<PluginState> {
  const phases = ['register', 'install', 'activate'] as const;

  for (const phase of phases) {
    const success = await executePhase(instance, phase);
    if (!success) {
      return instance.state; // 'degraded'
    }
  }

  return instance.state; // 'active'
}

/**
 * 执行优雅关闭
 *
 * @param instance - 插件实例
 * @returns 是否成功
 */
export async function executeShutdown(
  instance: PluginInstance,
): Promise<boolean> {
  if (instance.state !== 'active') {
    return true; // 非活跃状态无需关闭
  }

  return executePhase(instance, 'deactivate');
}

/**
 * 获取所有合法的状态转换
 */
export function getValidTransitions(): Record<PluginState, PluginState[]> {
  return { ...VALID_TRANSITIONS };
}
