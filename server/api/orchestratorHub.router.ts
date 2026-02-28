/**
 * OrchestratorHub tRPC 路由
 * 统一编排调度层 — 协调 Pipeline / KG / DB 三引擎
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../core/trpc';
import { createDefaultHub } from '../platform/orchestrator/orchestrator-hub';

const hub = createDefaultHub();

export const orchestratorHubRouter = router({
  /** 执行编排 */
  orchestrate: protectedProcedure
    .input(z.object({
      deviceType: z.string().min(1),
      diagnosisGoal: z.string().min(1),
      machineId: z.string().min(1),
      sensorData: z.record(z.string(), z.array(z.number())).optional(),
      context: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(({ input }) => hub.orchestrate(input)),

  /** 查询 Hub 状态 */
  getStatus: protectedProcedure
    .query(() => hub.getStatus()),

  /** 获取所有场景模板 */
  getScenarios: protectedProcedure
    .query(() => hub.getScenarios()),

  /** 更新 Hub 配置 */
  updateConfig: protectedProcedure
    .input(z.object({
      enableKG: z.boolean().optional(),
      enablePipeline: z.boolean().optional(),
      enableDatabase: z.boolean().optional(),
      defaultTimeout: z.number().optional(),
      maxConcurrentRequests: z.number().optional(),
    }))
    .mutation(({ input }) => {
      hub.updateConfig(input);
      return { success: true };
    }),
});
