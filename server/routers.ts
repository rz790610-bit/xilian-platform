import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { knowledgeRouter } from "./knowledge";
import { topologyRouter } from "./topology";
import { modelRouter } from "./modelService";
import { eventBusRouter } from "./eventBus";
import { streamProcessorRouter } from "./streamProcessor";
import { deviceRouter } from "./deviceService";
import { deviceCrudRouter } from "./device/deviceCrudRouter";
import { kafkaRouter } from "./kafka/kafkaRouter";
import { redisRouter } from "./redis/redisRouter";
import { clickhouseRouter } from "./clickhouse/clickhouseRouter";
import { pipelineRouter } from "./pipeline/pipelineRouter";
import { pluginRouter } from "./plugin/pluginRouter";
import { infrastructureRouter } from "./infrastructure/infrastructureRouter";
import { observabilityRouter } from "./observability/observabilityRouter";
import { dataPipelineRouter } from "./dataPipeline/dataPipelineRouter";
import { opsRouter } from "./ops/opsRouter";
import { monitoringRouter } from "./monitoring/monitoringRouter";
// ============ v1.9 性能优化模块路由 ============
import { outboxRouter } from "./outbox/outboxRouter";
import { sagaRouter } from "./saga/sagaRouter";
import { adaptiveSamplingRouter } from "./monitoring/adaptiveSamplingRouter";
import { deduplicationRouter } from "./redis/deduplicationRouter";
import { readReplicaRouter } from "./db/readReplicaRouter";
import { graphQueryRouter } from "./knowledge/graphQueryRouter";

// ============ v1.5 数据库模块路由 ============
import { databaseRouter } from "./database/databaseRouter";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // 知识库路由
  knowledge: knowledgeRouter,

  // 系统拓扑路由
  topology: topologyRouter,

  // 大模型管理路由
  model: modelRouter,

  // 事件总线路由
  eventBus: eventBusRouter,

  // 流处理路由
  stream: streamProcessorRouter,

  // 设备管理路由
  device: deviceRouter,

  // 设备 CRUD 增强路由
  deviceCrud: deviceCrudRouter,

  // Kafka 管理路由
  kafka: kafkaRouter,

  // Redis 缓存管理路由
  redis: redisRouter,

  // ClickHouse 时序数据库路由
  clickhouse: clickhouseRouter,

  // Pipeline 数据流处理路由
  pipeline: pipelineRouter,

  // 插件管理路由
  plugin: pluginRouter,

  // 基础设施管理路由
  infrastructure: infrastructureRouter,

  // 可观测性管理路由
  observability: observabilityRouter,

  // 数据管道路由（Airflow DAGs + Kafka Connect）
  dataPipeline: dataPipelineRouter,

  // 运维管理路由（仪表盘、自动化、边缘计算）
  ops: opsRouter,

  // 智能监控路由
  monitoring: monitoringRouter,

  // ============ v1.9 性能优化模块 ============

  // Outbox 混合发布器（CDC + 轮询）
  outbox: outboxRouter,

  // Saga 补偿机制（分布式事务）
  saga: sagaRouter,

  // 自适应采样配置
  adaptiveSampling: adaptiveSamplingRouter,

  // Redis 去重服务
  deduplication: deduplicationRouter,

  // 读写分离管理
  readReplica: readReplicaRouter,

  // 图查询优化
  graphQuery: graphQueryRouter,

  // ============ v1.5 数据库模块 ============
  // 数据库管理（资产/配置/切片/清洗/事件）
  database: databaseRouter,
});

export type AppRouter = typeof appRouter;
