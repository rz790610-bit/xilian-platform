/**
 * ============================================================================
 * 统一注册中心 API 路由
 * ============================================================================
 * 
 * 提供所有注册中心的统一查询接口。
 * 前端通过这些 API 动态获取各模块的类型列表、分类、配置 Schema，
 * 无需硬编码任何类型定义。
 * 
 * 新增注册中心后，只需在 registries/index.ts 中注册，
 * 本路由自动暴露，前端自动可用。
 */

import { z } from 'zod';
// S0-3: 统一注册中心暴露平台所有能力元数据，攻击者可枚举平台能力发现攻击面。
// 改为 protectedProcedure 防止未认证访问；生产环境应额外添加速率限制（建议每 IP 每分钟 100 次）
import { protectedProcedure, router } from '../core/trpc';
import { registryManager } from '../core/registries';

export const registryRouter = router({
  /**
   * 列出所有注册中心的概览信息
   * 用于前端展示"平台能力总览"
   */
  listRegistries: protectedProcedure.query(() => {
    return registryManager.getStats();
  }),

  /**
   * 查询指定注册中心的数据
   * 支持按分类过滤、关键词搜索、标签过滤
   */
  query: protectedProcedure
    .input(z.object({
      registry: z.string(),
      category: z.string().optional(),
      search: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }))
    .query(({ input }) => {
      const result = registryManager.query(input.registry, {
        category: input.category,
        search: input.search,
        tags: input.tags,
      });
      if (!result) {
        throw new Error(`注册中心 "${input.registry}" 不存在`);
      }
      return result;
    }),

  /**
   * 获取指定注册中心的分类列表
   */
  listCategories: protectedProcedure
    .input(z.object({ registry: z.string() }))
    .query(({ input }) => {
      const reg = registryManager.getRegistry(input.registry);
      if (!reg) throw new Error(`注册中心 "${input.registry}" 不存在`);
      return reg.getCategories();
    }),

  /**
   * 获取指定注册中心中某个项的详细信息
   */
  getItem: protectedProcedure
    .input(z.object({
      registry: z.string(),
      itemId: z.string(),
    }))
    .query(({ input }) => {
      const reg = registryManager.getRegistry(input.registry);
      if (!reg) throw new Error(`注册中心 "${input.registry}" 不存在`);
      const item = reg.get(input.itemId);
      if (!item) throw new Error(`项 "${input.itemId}" 在注册中心 "${input.registry}" 中不存在`);
      return item;
    }),

  /**
   * 搜索所有注册中心
   * 全局搜索，返回匹配的项及其所属注册中心
   */
  globalSearch: protectedProcedure
    .input(z.object({ keyword: z.string().min(1) }))
    .query(({ input }) => {
      const results: Array<{ registry: string; registryLabel: string; items: any[] }> = [];
      
      for (const info of registryManager.listRegistries()) {
        const queryResult = registryManager.query(info.name, { search: input.keyword });
        if (queryResult && queryResult.items.length > 0) {
          results.push({
            registry: info.name,
            registryLabel: info.label,
            items: queryResult.items,
          });
        }
      }

      return results;
    }),
});
