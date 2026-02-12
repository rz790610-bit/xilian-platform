/**
 * Docker 引擎管理 tRPC 路由
 * 提供容器生命周期管理 API
 */
import { z } from 'zod';
import { publicProcedure, router } from '../core/trpc';
import { dockerManager } from '../services/docker/dockerManager.service';

export const dockerRouter = router({
  /**
   * 检查 Docker Engine 连接状态
   */
  checkConnection: publicProcedure.query(async () => {
    return dockerManager.checkConnection();
  }),

  /**
   * 列出所有 PortAI 引擎容器
   */
  listEngines: publicProcedure.query(async () => {
    try {
      const engines = await dockerManager.listEngines();
      return { success: true, engines };
    } catch (e: any) {
      return {
        success: false,
        engines: [],
        error: e.message,
      };
    }
  }),

  /**
   * 启动指定引擎
   */
  startEngine: publicProcedure
    .input(z.object({ containerName: z.string() }))
    .mutation(async ({ input }) => {
      return dockerManager.startEngine(input.containerName);
    }),

  /**
   * 停止指定引擎
   */
  stopEngine: publicProcedure
    .input(z.object({ containerName: z.string() }))
    .mutation(async ({ input }) => {
      return dockerManager.stopEngine(input.containerName);
    }),

  /**
   * 重启指定引擎
   */
  restartEngine: publicProcedure
    .input(z.object({ containerName: z.string() }))
    .mutation(async ({ input }) => {
      return dockerManager.restartEngine(input.containerName);
    }),

  /**
   * 一键启动所有引擎
   */
  startAll: publicProcedure.mutation(async () => {
    const results = await dockerManager.startAll();
    const successCount = results.filter(r => r.success).length;
    return {
      success: true,
      total: results.length,
      started: successCount,
      failed: results.length - successCount,
      results,
    };
  }),

  /**
   * 一键停止所有引擎（保留 MySQL）
   */
  stopAll: publicProcedure
    .input(z.object({ keepMySQL: z.boolean().optional().default(true) }).optional())
    .mutation(async ({ input }) => {
      const results = await dockerManager.stopAll(input?.keepMySQL ?? true);
      const successCount = results.filter(r => r.success).length;
      return {
        success: true,
        total: results.length,
        stopped: successCount,
        failed: results.length - successCount,
        results,
      };
    }),

  /**
   * 获取引擎日志
   */
  getEngineLogs: publicProcedure
    .input(z.object({
      containerName: z.string(),
      tail: z.number().optional().default(100),
    }))
    .query(async ({ input }) => {
      try {
        const logs = await dockerManager.getEngineLogs(input.containerName, input.tail);
        return { success: true, logs };
      } catch (e: any) {
        return { success: false, logs: '', error: e.message };
      }
    }),

  /**
   * 获取引擎资源统计
   */
  getEngineStats: publicProcedure
    .input(z.object({ containerName: z.string() }))
    .query(async ({ input }) => {
      return dockerManager.getEngineStats(input.containerName);
    }),
});
