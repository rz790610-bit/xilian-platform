/**
 * ObservabilityHub tRPC 路由
 *
 * 提供两个查询端点和一个缓存刷新操作：
 * - getOperationsView — 技术运维全量视图 (11 数据源聚合)
 * - getStatusView — 客户状态简洁视图 (3 数据源)
 * - refresh — 手动清除缓存并重新获取
 */

import { router, publicProcedure } from '../core/trpc';
import {
  getObservabilityHub,
  type OperationsView,
  type StatusView,
} from '../platform/observability/observability-hub';

export const observabilityHubRouter = router({
  /** 技术运维全量视图 — 缓存 1 分钟 */
  getOperationsView: publicProcedure.query(async (): Promise<OperationsView> => {
    return getObservabilityHub().getOperationsView();
  }),

  /** 客户状态简洁视图 — 缓存 15 秒 */
  getStatusView: publicProcedure.query(async (): Promise<StatusView> => {
    return getObservabilityHub().getStatusView();
  }),

  /** 手动刷新缓存 */
  refresh: publicProcedure.mutation(async () => {
    getObservabilityHub().clearCache();
    return { success: true as const, refreshedAt: Date.now() };
  }),
});

// Re-export types for client consumption
export type { OperationsView, StatusView };
