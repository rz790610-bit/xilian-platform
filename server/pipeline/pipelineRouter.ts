/**
 * Pipeline 管理 API 路由
 */

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../_core/trpc';
import { pipelineEngine, PipelineConfig } from './pipelineEngine';

// Pipeline 配置验证 schema
const pipelineConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  source: z.object({
    type: z.string(),
    config: z.record(z.string(), z.unknown()),
  }),
  processors: z.array(z.object({
    type: z.string(),
    config: z.record(z.string(), z.unknown()),
  })),
  sink: z.object({
    type: z.string(),
    config: z.record(z.string(), z.unknown()),
  }),
  schedule: z.object({
    type: z.enum(['interval', 'cron']),
    value: z.union([z.string(), z.number()]),
  }).optional(),
  batchSize: z.number().optional(),
  retryPolicy: z.object({
    maxRetries: z.number(),
    retryDelayMs: z.number(),
  }).optional(),
});

export const pipelineRouter = router({
  /**
   * 获取所有管道
   */
  list: publicProcedure.query(async () => {
    return pipelineEngine.getAllPipelines();
  }),

  /**
   * 获取管道详情
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const status = pipelineEngine.getPipelineStatus(input.id);
      if (!status) {
        throw new Error(`Pipeline ${input.id} not found`);
      }
      return status;
    }),

  /**
   * 创建管道
   */
  create: protectedProcedure
    .input(pipelineConfigSchema)
    .mutation(async ({ input }) => {
      await pipelineEngine.createPipeline(input as PipelineConfig);
      return { success: true, pipelineId: input.id };
    }),

  /**
   * 启动管道
   */
  start: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await pipelineEngine.startPipeline(input.id);
      return { success: true };
    }),

  /**
   * 停止管道
   */
  stop: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await pipelineEngine.stopPipeline(input.id);
      return { success: true };
    }),

  /**
   * 暂停管道
   */
  pause: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await pipelineEngine.pausePipeline(input.id);
      return { success: true };
    }),

  /**
   * 手动运行管道
   */
  run: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const result = await pipelineEngine.runPipeline(input.id);
      return result;
    }),

  /**
   * 删除管道
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await pipelineEngine.deletePipeline(input.id);
      return { success: true };
    }),

  /**
   * 获取可用的连接器类型
   */
  getConnectorTypes: publicProcedure.query(async () => {
    return {
      sources: [
        { type: 'http', name: 'HTTP API', description: '从 HTTP API 获取数据' },
        { type: 'kafka', name: 'Kafka', description: '从 Kafka 主题消费消息' },
        { type: 'database', name: '数据库', description: '从数据库查询数据' },
      ],
      sinks: [
        { type: 'http', name: 'HTTP API', description: '发送数据到 HTTP API' },
        { type: 'clickhouse', name: 'ClickHouse', description: '写入 ClickHouse 时序数据库' },
        { type: 'redis', name: 'Redis', description: '写入 Redis 缓存' },
      ],
    };
  }),

  /**
   * 获取可用的处理器类型
   */
  getProcessorTypes: publicProcedure.query(async () => {
    return [
      { type: 'field_map', name: '字段映射', description: '重新映射字段名称' },
      { type: 'filter', name: '过滤器', description: '根据条件过滤数据' },
      { type: 'transform', name: '转换器', description: '自定义数据转换' },
      { type: 'aggregate', name: '聚合器', description: '数据聚合计算' },
    ];
  }),
});
