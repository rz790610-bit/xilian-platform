/**
 * ============================================================================
 * 统一 Prometheus 指标出口 — server/lib/metrics.ts
 * ============================================================================
 *
 * 合并两个 Registry 的输出：
 *   1. metricsCollector 的私有 Registry（nexus_* 前缀 + Node.js 默认指标）
 *   2. prom-client 全局 register（evo_* 前缀，由 fsd-metrics.ts 注册）
 *
 * 暴露 getMetrics() 供 /api/metrics 端点调用，返回合并后的 Prometheus 文本格式。
 *
 * 架构位置: server/lib/ (共享基础层)
 * 依赖: prom-client, metricsCollector
 */
import { Registry, register as globalRegister } from 'prom-client';
import { metricsCollector } from '../platform/middleware/metricsCollector';
import { createModuleLogger } from '../core/logger';

const log = createModuleLogger('metrics-unified');

/**
 * 获取合并后的 Prometheus 指标文本
 *
 * 使用 Registry.merge() 将 metricsCollector 的私有 Registry
 * 与 prom-client 全局 register（fsd-metrics 注册的 evo_* 指标）合并。
 *
 * @returns Prometheus exposition format 文本
 */
export async function getMetrics(): Promise<string> {
  const platformRegistry = metricsCollector.getRegistry();
  const merged = Registry.merge([platformRegistry, globalRegister]);
  return merged.metrics();
}

/**
 * 获取合并后的 Content-Type（用于 HTTP 响应头）
 */
export function getContentType(): string {
  return metricsCollector.getRegistry().contentType;
}

log.info('Unified metrics exporter initialized (platform + evolution registries)');
