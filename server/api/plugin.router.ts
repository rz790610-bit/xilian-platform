/**
 * 插件管理 API 路由
 */

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../core/trpc';
import { pluginEngine, PluginType } from '../services/plugin.engine';

export const pluginRouter = router({
  /**
   * 获取所有插件
   */
  list: publicProcedure.query(async () => {
    return pluginEngine.getAllPlugins();
  }),

  /**
   * 按类型获取插件
   */
  listByType: publicProcedure
    .input(z.object({
      type: z.enum(['source', 'processor', 'sink', 'analyzer', 'visualizer', 'integration', 'utility']),
    }))
    .query(async ({ input }) => {
      return pluginEngine.getPluginsByType(input.type as PluginType);
    }),

  /**
   * 获取插件详情
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const status = pluginEngine.getPluginStatus(input.id);
      if (!status) {
        throw new Error(`Plugin ${input.id} not found`);
      }
      return status;
    }),

  /**
   * 启用插件
   */
  enable: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await pluginEngine.enablePlugin(input.id);
      return { success: true };
    }),

  /**
   * 禁用插件
   */
  disable: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await pluginEngine.disablePlugin(input.id);
      return { success: true };
    }),

  /**
   * 卸载插件
   */
  uninstall: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await pluginEngine.uninstallPlugin(input.id);
      return { success: true };
    }),

  /**
   * 执行插件
   */
  execute: protectedProcedure
    .input(z.object({
      id: z.string(),
      config: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await pluginEngine.executePlugin(input.id, input.config || {});
      return { success: true, result };
    }),

  /**
   * 更新插件配置
   */
  updateConfig: protectedProcedure
    .input(z.object({
      id: z.string(),
      config: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ input }) => {
      await pluginEngine.updatePluginConfig(input.id, input.config);
      return { success: true };
    }),

  /**
   * 健康检查所有插件
   */
  healthCheck: publicProcedure.query(async () => {
    return pluginEngine.healthCheckAll();
  }),

  /**
   * 获取可用的插件类型
   */
  getTypes: publicProcedure.query(async () => {
    return [
      { type: 'source', name: '数据源', description: '数据采集插件' },
      { type: 'processor', name: '处理器', description: '数据处理和转换插件' },
      { type: 'sink', name: '目标', description: '数据输出插件' },
      { type: 'analyzer', name: '分析器', description: '数据分析插件' },
      { type: 'visualizer', name: '可视化', description: '数据可视化插件' },
      { type: 'integration', name: '集成', description: '第三方服务集成插件' },
      { type: 'utility', name: '工具', description: '通用工具插件' },
    ];
  }),
});
