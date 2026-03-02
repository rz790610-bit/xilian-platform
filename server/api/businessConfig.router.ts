/**
 * 业务配置入口 tRPC 路由
 * 基于设备编码体系，选择设备类型 → 自动生成三引擎配置
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../core/trpc';
import { BusinessConfigService } from '../platform/orchestrator/business-config.service';

const service = new BusinessConfigService();

export const businessConfigRouter = router({
  /** 获取所有支持的设备类型 */
  getDeviceTypes: protectedProcedure
    .query(() => service.getDeviceTypes()),

  /** 获取设备类型的可用场景 */
  getScenarios: protectedProcedure
    .input(z.object({ deviceType: z.string().min(1) }))
    .query(({ input }) => service.getScenariosForDevice(input.deviceType)),

  /** 根据设备类型+场景生成配置 */
  generateConfig: protectedProcedure
    .input(z.object({
      deviceType: z.string().min(1),
      scenario: z.string().min(1),
      options: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(({ input }) => service.generateConfig(input.deviceType, input.scenario, input.options)),

  /** 保存生成的配置到数据库 */
  saveConfig: protectedProcedure
    .input(z.object({
      deviceType: z.string().min(1),
      scenario: z.string().min(1),
      pipeline: z.any(),
      kg: z.any(),
      database: z.any(),
      orchestration: z.any(),
    }))
    .mutation(({ input, ctx }) => {
      const userId = (ctx as any).user?.id as number | undefined;
      return service.saveConfig(input as any, userId);
    }),

  /** 查询已保存的配置列表 */
  getSavedConfigs: protectedProcedure
    .query(() => service.getSavedConfigs()),

  /** 根据 ID 获取完整配置详情 */
  getSavedConfigById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => service.getSavedConfigById(input.id)),
});
