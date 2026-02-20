/**
 * Pipeline 工作台 — tRPC 路由
 * 
 * 设计原则：
 *   1. 兼容旧前端：create 接受旧 PipelineConfig，get 返回 { config, status, metrics }
 *   2. 支持新 DAG 引擎：save 接受 PipelineDAGConfig，run 返回完整执行结果
 *   3. 新增管道管理：runs 查询、节点指标、血缘追踪、连接器类型
 */
import { z } from 'zod';
// P0 加固：Pipeline 路由全部改为 protectedProcedure
import { router, protectedProcedure } from '../core/trpc';
const publicProcedure = protectedProcedure;
import { pipelineEngine, PipelineConfig } from '../services/pipeline.engine';
import { ALL_NODE_TYPES } from '../../shared/pipelineTypes';
import type { PipelineCategory, TriggerType } from '../../shared/pipelineTypes';
import { resourceDiscovery } from '../platform/services/resource-discovery.service';

// ============ Zod Schemas ============

/** 旧版线性配置（兼容前端 Toolbar 的 savePipeline 返回值） */
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

/** 新版 DAG 配置 */
const dagConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional().default('custom'),
  nodes: z.array(z.object({
    id: z.string(),
    type: z.enum(['source', 'processor', 'sink', 'control']),
    subType: z.string(),
    config: z.record(z.string(), z.unknown()),
  })),
  connections: z.array(z.object({
    fromNodeId: z.string(),
    toNodeId: z.string(),
    fromPort: z.number().optional().default(0),
    toPort: z.number().optional().default(0),
  })),
  schedule: z.object({
    type: z.enum(['interval', 'cron', 'event']),
    value: z.union([z.string(), z.number()]),
    timezone: z.string().optional(),
  }).optional(),
  retryPolicy: z.object({
    maxRetries: z.number(),
    retryDelayMs: z.number(),
    backoffMultiplier: z.number().optional(),
  }).optional(),
  variables: z.record(z.string(), z.string()).optional(),
});

// ============ 辅助函数 ============

/**
 * 将旧版 PipelineConfig 转换为 PipelineDAGConfig
 * 前端 Toolbar 的 savePipeline 返回的是旧格式，需要转换
 */
function legacyConfigToDAG(config: z.infer<typeof pipelineConfigSchema>) {
  const nodes: Array<{ id: string; type: 'source' | 'processor' | 'sink'; subType: string; config: Record<string, unknown> }> = [];
  const connections: Array<{ fromNodeId: string; toNodeId: string; fromPort: number; toPort: number }> = [];

  // 源节点
  const sourceId = `source-${config.source.type}`;
  nodes.push({ id: sourceId, type: 'source', subType: config.source.type, config: config.source.config });

  // 处理器节点
  let prevId = sourceId;
  config.processors.forEach((p, i) => {
    const procId = `proc-${i}-${p.type}`;
    nodes.push({ id: procId, type: 'processor', subType: p.type, config: p.config });
    connections.push({ fromNodeId: prevId, toNodeId: procId, fromPort: 0, toPort: 0 });
    prevId = procId;
  });

  // 目标节点
  const sinkId = `sink-${config.sink.type}`;
  nodes.push({ id: sinkId, type: 'sink', subType: config.sink.type, config: config.sink.config });
  connections.push({ fromNodeId: prevId, toNodeId: sinkId, fromPort: 0, toPort: 0 });

  return {
    id: config.id,
    name: config.name,
    description: config.description,
    category: 'custom' as PipelineCategory,
    nodes,
    connections,
    retryPolicy: config.retryPolicy ? { ...config.retryPolicy, backoffMultiplier: 2 } : undefined,
    // P1-5: 添加默认 timezone，原始问题: cron 调度时区丢失导致定时任务在错误时间执行
    schedule: config.schedule ? {
      ...config.schedule,
      type: config.schedule.type as 'interval' | 'cron',
      timezone: config.schedule.timezone || 'Asia/Shanghai',
    } : undefined,
  };
}

// ============ Router ============

export const pipelineRouter = router({

  // ======== 管道 CRUD ========

  /**
   * 获取所有管道列表
   * 前端 PipelineEditor 和 Toolbar 都调用此接口
   */
  list: publicProcedure.query(async () => {
    return pipelineEngine.getAllPipelines();
  }),

  /**
   * 获取管道详情
   * 前端期望返回 { config, status, metrics } 结构（兼容旧接口）
   * 同时返回完整 DAG 配置
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const dagConfig = await pipelineEngine.getPipeline(input.id);
      if (!dagConfig) {
        throw new Error(`Pipeline ${input.id} not found`);
      }

      // 获取最近的运行记录来构建 metrics
      const runs = await pipelineEngine.getPipelineRuns(input.id, 10);
      const lastRun = runs[0];
      const successRuns = runs.filter(r => r.status === 'completed');
      const avgDuration = successRuns.length > 0
        ? successRuns.reduce((sum, r) => sum + (r.durationMs || 0), 0) / successRuns.length
        : 0;

      // 构建兼容旧前端的返回结构
      return {
        // 旧前端期望的 config 字段（用于 loadPipeline）
        config: dagConfig,
        // DAG 配置（新前端使用）
        dagConfig,
        // 状态信息
        status: lastRun?.status === 'running' ? 'running' : 'draft',
        // 指标
        metrics: {
          totalRecordsProcessed: lastRun?.totalRecordsOut || 0,
          totalErrors: lastRun?.errorCount || 0,
          lastRunAt: lastRun?.startedAt ? new Date(lastRun.startedAt).getTime() : undefined,
          lastRunDurationMs: lastRun?.durationMs || undefined,
          averageProcessingTimeMs: Math.round(avgDuration),
        },
        // 运行记录
        recentRuns: runs,
      };
    }),

  /**
   * 创建/保存管道（兼容旧版 PipelineConfig 格式）
   * 前端 Toolbar 的 handleConfirmSave 调用此接口
   */
  create: protectedProcedure
    .input(pipelineConfigSchema)
    .mutation(async ({ input }) => {
      const dagConfig = legacyConfigToDAG(input);
      const result = await pipelineEngine.savePipeline(dagConfig as any);
      return { success: true, pipelineId: result.id };
    }),

  /**
   * 保存管道（新版 DAG 格式）
   * 新前端直接传入 PipelineDAGConfig
   */
  save: protectedProcedure
    .input(dagConfigSchema)
    .mutation(async ({ input }) => {
      const result = await pipelineEngine.savePipeline(input as any);
      return { success: true, pipelineId: result.id };
    }),

  /**
   * 运行管道
   * 返回兼容旧前端的 { success, recordsProcessed, durationMs, errors } 结构
   * 同时返回完整的 DAG 执行结果
   */
  run: protectedProcedure
    .input(z.object({ 
      id: z.string(),
      trigger: z.enum(['manual', 'schedule', 'api', 'event']).optional().default('manual'),
    }))
    .mutation(async ({ input }) => {
      const result = await pipelineEngine.runPipeline(input.id, input.trigger as TriggerType);

      // 兼容旧前端期望的返回结构
      return {
        success: result.status === 'completed',
        recordsProcessed: result.metrics.totalRecordsProcessed,
        durationMs: result.totalDurationMs,
        errors: result.metrics.totalErrors,
        // 新引擎的完整结果
        runId: result.runId,
        status: result.status,
        totalDurationMs: result.totalDurationMs,
        nodeResults: result.nodeResults,
        lineage: result.lineage,
        metrics: result.metrics,
      };
    }),

  /**
   * 启动管道（兼容旧接口）
   */
  start: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await pipelineEngine.startPipeline(input.id);
      return { success: true };
    }),

  /**
   * 停止管道（兼容旧接口）
   */
  stop: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await pipelineEngine.stopPipeline(input.id);
      return { success: true };
    }),

  /**
   * 暂停管道（兼容旧接口）
   */
  pause: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await pipelineEngine.pausePipeline(input.id);
      return { success: true };
    }),

  /**
   * 取消运行
   */
  cancelRun: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(async ({ input }) => {
      const cancelled = pipelineEngine.cancelRun(input.runId);
      return { success: cancelled };
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

  // ======== 运行记录查询 ========

  /**
   * 获取管道的运行记录列表
   */
  runs: publicProcedure
    .input(z.object({
      pipelineId: z.string(),
      limit: z.number().optional().default(20),
    }))
    .query(async ({ input }) => {
      return pipelineEngine.getPipelineRuns(input.pipelineId, input.limit);
    }),

  /**
   * 获取单次运行详情（含节点级结果和血缘数据）
   */
  runDetail: publicProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ input }) => {
      const run = await pipelineEngine.getRunDetail(input.runId);
      if (!run) throw new Error(`Run ${input.runId} not found`);
      const metrics = await pipelineEngine.getNodeMetrics(input.runId);
      return { ...run, nodeMetrics: metrics };
    }),

  /**
   * 获取节点级指标
   */
  nodeMetrics: publicProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ input }) => {
      return pipelineEngine.getNodeMetrics(input.runId);
    }),

  // ======== 节点类型查询 ========

  /**
   * 获取所有可用的节点类型（从 shared/pipelineTypes.ts 的 ALL_NODE_TYPES 读取）
   * 替代旧的 getConnectorTypes / getProcessorTypes 硬编码列表
   */
  getNodeTypes: publicProcedure.query(() => {
    const grouped: Record<string, Array<{ subType: string; name: string; description: string; domain: string; inputs: number; outputs: number }>> = {};
    for (const info of ALL_NODE_TYPES) {
      const domain = info.domain;
      if (!grouped[domain]) grouped[domain] = [];
      grouped[domain].push({
        subType: info.type,
        name: info.name,
        description: info.description,
        domain,
        inputs: info.inputs ?? 1,
        outputs: info.outputs ?? 1,
      });
    }
    return grouped;
  }),

  /**
   * 获取可用的连接器类型（兼容旧接口）
   * 从 ALL_NODE_TYPES 动态生成，不再硬编码
   */
  getConnectorTypes: publicProcedure.query(() => {
    const sources: Array<{ type: string; name: string; description: string }> = [];
    const sinks: Array<{ type: string; name: string; description: string }> = [];

    for (const info of ALL_NODE_TYPES) {
      if (info.domain === 'source') {
        sources.push({ type: info.type, name: info.name, description: info.description });
      } else if (info.domain === 'sink') {
        sinks.push({ type: info.type, name: info.name, description: info.description });
      }
    }

    return { sources, sinks };
  }),

  /**
   * 获取可用的处理器类型（兼容旧接口）
   * 从 ALL_NODE_TYPES 动态生成
   */
  getProcessorTypes: publicProcedure.query(() => {
    const processors: Array<{ type: string; name: string; description: string }> = [];

    for (const info of ALL_NODE_TYPES) {
      if (info.domain === 'data_engineering' || info.domain === 'machine_learning' || info.domain === 'llm' || info.domain === 'control' || info.domain === 'multimodal') {
        processors.push({ type: info.type, name: info.name, description: info.description });
      }
    }

    return processors;
  }),

  // ======== 资源自动发现 ========

  /**
   * 执行资源扫描，返回所有自动发现的组件
   * 扫描 MySQL 表、Kafka Topic、Qdrant 集合、模型、插件等
   *
   * A2-6: 资源扫描器配置当前硬编码在 resource-discovery.service 中。
   * 建议从统一注册中心动态加载扫描器配置，新增资源类型时无需修改代码。
   * 迁移方案：
   *   1. 在 registryManager 中注册 ResourceScannerRegistry
   *   2. 每个扫描器实现 IResourceScanner 接口
   *   3. resourceDiscovery.scan() 从注册中心动态获取扫描器列表
   */
  discoverResources: publicProcedure.query(async () => {
    const components = await resourceDiscovery.scan();
    const summary = resourceDiscovery.getSummary();
    return { components, summary };
  }),

  /**
   * 获取已缓存的发现组件（不触发重新扫描）
   */
  getDiscoveredComponents: publicProcedure
    .input(z.object({
      nodeType: z.enum(['source', 'processor', 'sink']).optional(),
      resourceType: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      let components = await resourceDiscovery.getComponents();

      if (input?.nodeType) {
        components = components.filter(c => c.nodeType === input.nodeType);
      }
      if (input?.resourceType) {
        components = components.filter(c => c.resourceType === input.resourceType);
      }
      if (input?.search) {
        const q = input.search.toLowerCase();
        components = components.filter(c =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.tags.some(t => t.toLowerCase().includes(q))
        );
      }

      return components;
    }),

  /**
   * 获取发现摘要统计
   */
  getDiscoverySummary: publicProcedure.query(() => {
    return resourceDiscovery.getSummary();
  }),
});
