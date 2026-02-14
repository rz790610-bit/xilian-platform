/**
 * ============================================================================
 * 算法赋能模块 — tRPC 路由
 * ============================================================================
 * 
 * 25 个 API 端点，分为 7 组：
 * 1. 算法定义管理（CRUD + 同步内置 + 推荐）
 * 2. 设备绑定管理（CRUD）
 * 3. 算法组合编排（CRUD）
 * 4. 算法执行（单算法 + 组合 + 执行记录）
 * 5. 路由规则管理（CRUD）
 * 6. 边缘缓存（同步包 + 批量上传）
 * 7. 总览统计
 * 
 * 设计原则：
 * - publicProcedure 用于只读查询（列表/详情/统计）
 * - protectedProcedure 用于写操作（创建/更新/删除/执行）
 * - 所有输入通过 Zod schema 严格校验
 * - 错误统一包装为 TRPCError
 */
import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../core/trpc';
import { TRPCError } from '@trpc/server';
import { algorithmService } from '../services/algorithm.service';

// ============================================================================
// Zod Schemas
// ============================================================================

const listDefinitionsInput = z.object({
  category: z.string().optional(),
  implType: z.enum(['builtin', 'pipeline_node', 'plugin', 'external', 'kg_operator']).optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(100),
  status: z.enum(['active', 'deprecated', 'experimental']).optional(),
}).optional();

const createDefinitionInput = z.object({
  algoCode: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/, '算法编码只能包含小写字母、数字和下划线'),
  algoName: z.string().min(1).max(200),
  category: z.string().min(1),
  description: z.string().optional().default(''),
  implType: z.enum(['builtin', 'pipeline_node', 'plugin', 'external', 'kg_operator']),
  implRef: z.string().min(1).optional(),
  version: z.string().default('v1.0.0'),
  inputSchema: z.any().optional().default({}),
  outputSchema: z.any().optional().default({}),
  configSchema: z.any().optional().default({}),
  applicableDeviceTypes: z.any().optional().default([]),
  applicableMeasurementTypes: z.any().optional().default([]),
  applicableScenarios: z.any().optional().default([]),
  tags: z.any().optional().default([]),
  license: z.enum(['builtin', 'community', 'enterprise']).default('community'),
  author: z.string().optional(),
  documentationUrl: z.string().optional(),
  kgIntegration: z.any().optional(),
  fleetLearningConfig: z.any().optional(),
  benchmark: z.any().optional(),
});

const updateDefinitionInput = z.object({
  algoCode: z.string().min(1),
  updates: z.object({
    algoName: z.string().optional(),
    description: z.string().optional(),
    version: z.string().optional(),
    inputSchema: z.any().optional(),
    outputSchema: z.any().optional(),
    configSchema: z.any().optional(),
    applicableDeviceTypes: z.any().optional(),
    applicableMeasurementTypes: z.any().optional(),
    applicableScenarios: z.any().optional(),
    tags: z.any().optional(),
    status: z.enum(['active', 'deprecated', 'experimental']).optional(),
    documentationUrl: z.string().optional(),
    kgIntegration: z.any().optional(),
    fleetLearningConfig: z.any().optional(),
    benchmark: z.any().optional(),
  }),
});

const createBindingInput = z.object({
  algoCode: z.string().min(1),
  deviceCode: z.string().min(1),
  sensorCode: z.string().optional(),
  bindingType: z.enum(['algorithm', 'composition']).optional().default('algorithm'),
  configOverrides: z.any().optional().default({}),
  schedule: z.any().optional(),
  outputRouting: z.any().optional(),
});

const updateBindingInput = z.object({
  bindingId: z.number().int().positive(),
  updates: z.object({
    configOverrides: z.any().optional(),
    schedule: z.any().optional(),
    outputRouting: z.any().optional(),
    status: z.enum(['active', 'paused', 'error']).optional(),
  }),
});

const createCompositionInput = z.object({
  compCode: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/, '组合编码只能包含小写字母、数字和下划线'),
  compName: z.string().min(1).max(200),
  description: z.string().optional().default(''),
  steps: z.any(), // DAG 结构 { nodes: [...], edges: [...] }
  applicableDeviceTypes: z.any().optional().default([]),
  applicableScenarios: z.any().optional().default([]),
  version: z.string().optional().default('v1.0.0'),
  isTemplate: z.number().optional().default(0),
});

const executeAlgorithmInput = z.object({
  algoCode: z.string().min(1),
  inputData: z.any(),
  config: z.any().optional(),
  deviceCode: z.string().optional(),
  sensorCode: z.string().optional(),
  bindingId: z.number().int().positive().optional(),
});

const executeCompositionInput = z.object({
  compCode: z.string().min(1),
  inputData: z.any(),
  globalConfig: z.any().optional(),
  deviceCode: z.string().optional(),
});

const recommendInput = z.object({
  deviceType: z.string().optional(),
  deviceCode: z.string().optional(),
  measurementType: z.string().optional(),
  scenario: z.string().optional(),
  dataProfile: z.object({
    sampleRate: z.number().optional(),
    dataLength: z.number().optional(),
    channels: z.number().optional(),
    snrEstimate: z.number().optional(),
    hasTimestamp: z.boolean().optional(),
    valueRange: z.object({ min: z.number(), max: z.number() }).optional(),
    dominantFrequency: z.number().optional(),
    stationarity: z.enum(['stationary', 'non_stationary', 'unknown']).optional(),
  }).optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

const listExecutionsInput = z.object({
  algoCode: z.string().optional(),
  deviceCode: z.string().optional(),
  status: z.enum(['running', 'success', 'failed', 'timeout']).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
}).optional();

const createRoutingRuleInput = z.object({
  bindingId: z.number().int().positive(),
  ruleName: z.string().min(1).max(200),
  description: z.string().optional(),
  condition: z.string().min(1),
  targets: z.array(z.object({
    target: z.string(),
    action: z.enum(['create', 'update', 'upsert']),
    mapping: z.record(z.string(), z.string()).optional(),
    params: z.record(z.string(), z.unknown()).optional(),
    severity: z.string().optional(),
  })),
  cascadeAlgos: z.array(z.object({
    algo_code: z.string(),
    delay_ms: z.number().optional(),
    config_overrides: z.record(z.string(), z.unknown()).optional(),
    condition: z.string().optional(),
  })).optional(),
  priority: z.number().int().min(0).max(100).default(50),
  stopOnMatch: z.number().optional().default(1),
});

const updateRoutingRuleInput = z.object({
  ruleId: z.number().int().positive(),
  updates: z.object({
    priority: z.number().int().min(0).max(100).optional(),
    condition: z.string().optional(),
    targets: z.any().optional(),
    cascadeAlgos: z.any().optional(),
    status: z.enum(['active', 'disabled']).optional(),
  }),
});

const batchUploadExecutionsInput = z.object({
  executions: z.array(z.object({
    executionId: z.string(),
    algoCode: z.string(),
    deviceCode: z.string(),
    bindingId: z.number().optional(),
    inputSummary: z.any().optional().default({}),
    outputSummary: z.any().optional().default({}),
    status: z.enum(['running', 'success', 'failed', 'timeout']),
    durationMs: z.number().default(0),
    startedAt: z.string(),
    completedAt: z.string(),
  })),
});

// ============================================================================
// Router 定义
// ============================================================================

export const algorithmRouter = router({

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. 算法定义管理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 列出算法定义（支持分页、分类过滤、搜索） */
  listDefinitions: publicProcedure
    .input(listDefinitionsInput)
    .query(async ({ input }) => {
      return algorithmService.listDefinitions(input ?? {});
    }),

  /** 获取单个算法定义详情 */
  getDefinition: publicProcedure
    .input(z.object({ algoCode: z.string().min(1) }))
    .query(async ({ input }) => {
      const result = await algorithmService.getDefinition(input.algoCode);
      if (!result) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `算法 ${input.algoCode} 不存在` });
      }
      return result;
    }),

  /** 创建算法定义 */
  createDefinition: protectedProcedure
    .input(createDefinitionInput)
    .mutation(async ({ input }) => {
      return algorithmService.createDefinition(input);
    }),

  /** 更新算法定义 */
  updateDefinition: protectedProcedure
    .input(updateDefinitionInput)
    .mutation(async ({ input }) => {
      return algorithmService.updateDefinition(input.algoCode, input.updates);
    }),

  /** 删除算法定义 */
  deleteDefinition: protectedProcedure
    .input(z.object({ algoCode: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return algorithmService.deleteDefinition(input.algoCode);
    }),

  /** 同步内置算法到数据库（首次启动或版本更新时调用） */
  syncBuiltinAlgorithms: protectedProcedure
    .mutation(async () => {
      return algorithmService.syncBuiltinAlgorithms();
    }),

  /** 智能推荐算法（根据设备/传感器/数据特征） */
  recommend: publicProcedure
    .input(recommendInput)
    .query(async ({ input }) => {
      return algorithmService.recommend(input);
    }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. 设备绑定管理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 创建算法-设备绑定 */
  createBinding: protectedProcedure
    .input(createBindingInput)
    .mutation(async ({ input }) => {
      return algorithmService.createBinding(input);
    }),

  /** 列出设备的所有算法绑定 */
  listBindingsByDevice: publicProcedure
    .input(z.object({ deviceCode: z.string().min(1) }))
    .query(async ({ input }) => {
      return algorithmService.listBindingsByDevice(input.deviceCode);
    }),

  /** 列出算法的所有设备绑定 */
  listBindingsByAlgorithm: publicProcedure
    .input(z.object({ algoCode: z.string().min(1) }))
    .query(async ({ input }) => {
      return algorithmService.listBindingsByAlgorithm(input.algoCode);
    }),

  /** 更新绑定配置 */
  updateBinding: protectedProcedure
    .input(updateBindingInput)
    .mutation(async ({ input }) => {
      return algorithmService.updateBinding(input.bindingId, input.updates);
    }),

  /** 删除绑定 */
  deleteBinding: protectedProcedure
    .input(z.object({ bindingId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      return algorithmService.deleteBinding(input.bindingId);
    }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. 算法组合编排
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 创建算法组合 */
  createComposition: protectedProcedure
    .input(createCompositionInput)
    .mutation(async ({ input }) => {
      return algorithmService.createComposition(input);
    }),

  /** 列出算法组合 */
  listCompositions: publicProcedure
    .input(z.object({
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return algorithmService.listCompositions(input ?? {});
    }),

  /** 获取算法组合详情 */
  getComposition: publicProcedure
    .input(z.object({ compCode: z.string().min(1) }))
    .query(async ({ input }) => {
      const result = await algorithmService.getComposition(input.compCode);
      if (!result) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `算法组合 ${input.compCode} 不存在` });
      }
      return result;
    }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4. 算法执行
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 执行单个算法 */
  execute: protectedProcedure
    .input(executeAlgorithmInput)
    .mutation(async ({ input }) => {
      const context = input.deviceCode ? {
        trigger: 'manual' as const,
        deviceContext: {
          deviceCode: input.deviceCode,
          deviceType: 'unknown',
        },
      } : { trigger: 'manual' as const };
      return algorithmService.executeAlgorithm(
        input.algoCode,
        input.inputData || {},
        input.config,
        context,
      );
    }),

  /** 执行算法组合 */
  executeComposition: protectedProcedure
    .input(executeCompositionInput)
    .mutation(async ({ input }) => {
      const context = input.deviceCode ? {
        trigger: 'manual' as const,
        deviceContext: {
          deviceCode: input.deviceCode,
          deviceType: 'unknown',
        },
      } : { trigger: 'manual' as const };
      return algorithmService.executeComposition(input.compCode, input.inputData || {}, context);
    }),

  /** 列出执行记录 */
  listExecutions: publicProcedure
    .input(listExecutionsInput)
    .query(async ({ input }) => {
      const opts = input ?? {} as any;
      return algorithmService.listExecutions({
        algoCode: opts.algoCode as string | undefined,
        deviceCode: opts.deviceCode as string | undefined,
        status: opts.status as 'running' | 'success' | 'failed' | 'timeout' | undefined,
        limit: opts.pageSize as number | undefined,
        offset: opts.page ? ((opts.page as number) - 1) * ((opts.pageSize as number) || 20) : 0,
      });
    }),

  /** 获取执行统计 */
  getExecutionStats: publicProcedure
    .input(z.object({ algoCode: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return algorithmService.getExecutionStats(input?.algoCode);
    }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 5. 路由规则管理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 创建路由规则 */
  createRoutingRule: protectedProcedure
    .input(createRoutingRuleInput)
    .mutation(async ({ input }) => {
      return algorithmService.createRoutingRule(input);
    }),

  /** 列出路由规则 */
  listRoutingRules: publicProcedure
    .input(z.object({ bindingId: z.number().int().positive().optional() }).optional())
    .query(async ({ input }) => {
      return algorithmService.listRoutingRules(input?.bindingId);
    }),

  /** 更新路由规则 */
  updateRoutingRule: protectedProcedure
    .input(updateRoutingRuleInput)
    .mutation(async ({ input }) => {
      return algorithmService.updateRoutingRule(input.ruleId, input.updates);
    }),

  /** 删除路由规则 */
  deleteRoutingRule: protectedProcedure
    .input(z.object({ ruleId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      return algorithmService.deleteRoutingRule(input.ruleId);
    }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 6. 边缘缓存
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 获取边缘设备的算法同步包 */
  getEdgeSyncPackage: publicProcedure
    .input(z.object({ deviceCode: z.string().min(1) }))
    .query(async ({ input }) => {
      return algorithmService.getEdgeSyncPackage(input.deviceCode);
    }),

  /** 边缘设备批量上传执行结果 */
  batchUploadExecutions: protectedProcedure
    .input(batchUploadExecutionsInput)
    .mutation(async ({ input }) => {
      return algorithmService.batchUploadExecutions(input.executions);
    }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 7. 总览统计
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 获取算法库总览统计 */
  getOverviewStats: publicProcedure
    .query(async () => {
      return algorithmService.getOverviewStats();
    }),

  /** Fleet Learning 统计 */
  getFleetLearningStats: publicProcedure
    .input(z.object({ algoCode: z.string().min(1) }))
    .query(async ({ input }) => {
      return algorithmService.getFleetLearningStats(input.algoCode);
    }),

  /** 触发 Fleet 优化 */
  runFleetOptimization: protectedProcedure
    .input(z.object({ algoCode: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return algorithmService.runFleetOptimization(input.algoCode);
    }),
});
