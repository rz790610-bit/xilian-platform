import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./core/cookies";
import { systemRouter } from "./core/systemRouter";
import { publicProcedure, router } from "./core/trpc";
import { knowledgeRouter } from "./services/knowledge.service";
import { topologyRouter } from "./services/topology.service";
import { modelRouter } from "./services/model.service";
import { eventBusRouter } from "./services/eventBus.service";
import { streamProcessorRouter } from "./services/streamProcessor.service";
import { deviceRouter } from "./services/device.service";
import { kafkaRouter } from "./api/kafka.router";
import { redisRouter } from "./api/redis.router";
import { clickhouseRouter } from "./api/clickhouse.router";
import { pipelineRouter } from "./api/pipeline.router";
import { pluginRouter } from "./api/plugin.router";
import { infrastructureRouter } from "./api/infrastructure.router";
import { observabilityRouter } from "./api/observability.router";
import { dataPipelineRouter } from "./api/dataPipeline.router";
import { opsRouter } from "./api/ops.router";
import { monitoringRouter } from "./api/monitoring.router";
// ============ v1.9 性能优化模块路由 ============
import { outboxRouter } from "./api/outbox.router";
import { sagaRouter } from "./api/saga.router";
import { adaptiveSamplingRouter } from "./api/adaptiveSampling.router";
import { deduplicationRouter } from "./api/deduplication.router";
import { readReplicaRouter } from "./api/readReplica.router";
import { graphQueryRouter } from "./api/graphQuery.router";

// ============ v1.5 数据库模块路由 ============
import { databaseRouter } from "./api/database.router";
// ============ V4.0 三层架构路由 ============
import { systemRoutes } from "./platform/routes/system.routes";
import { authRoutes } from "./platform/routes/auth.routes";
import { deviceRoutes } from "./operations/routes/device.routes";
import { governanceRoutes } from "./operations/routes/governance.routes";
import { pluginRoutes } from "./operations/routes/plugin.routes";
import { assetsRoutes } from "./business/routes/assets.routes";
import { diagnosisRoutes } from "./business/routes/diagnosis.routes";
import { knowledgeRoutes } from "./business/routes/knowledge.routes";
import { monitoringRoutes } from "./business/routes/monitoring.routes";
// ============ Docker 引擎管理 ============
import { dockerRouter } from "./api/docker.router";
// ============ 知识图谱编排器 ============
import { kgOrchestratorRouter } from "./api/kgOrchestrator.router";
// ============ 接入层统一管理 ============
import { accessLayerRouter } from "./api/accessLayer.router";
// ============ 统一注册中心 ============
import { registryRouter } from "./api/registry.router";
// ============ 算法赋能模块 ============
import { algorithmRouter } from "./api/algorithm.router";
// ============ 设备/传感器 CRUD ============
import { deviceCrudRouter } from "./api/deviceCrud.router";
import { sensorCrudRouter } from "./api/sensorCrud.router";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/core/index.ts, all api should start with '/api/' so that the gateway can route correctly
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
  // ============ V4.0 三层架构 ============
  // 平台基础层（系统健康/告警规则/审计日志/定时任务/数据权限/审批流程）
  platformSystem: systemRoutes,
  // 平台认证层
  platformAuth: authRoutes,
  // 运维中心 - 设备运维（采样配置/协议配置/规则版本/回滚触发器）
  opsDevice: deviceRoutes,
  // 运维中心 - 数据治理（导出任务/血缘/合成数据集/生命周期策略）
  opsGovernance: governanceRoutes,
  // 运维中心 - 插件管理（注册表/实例/事件）
  opsPlugin: pluginRoutes,
  // 业务应用 - 资产树
  bizAssets: assetsRoutes,
  // 业务应用 - 诊断
  bizDiagnosis: diagnosisRoutes,
  // 业务应用 - 知识图谱
  bizKnowledge: knowledgeRoutes,
  // 业务应用 - 监控（遥测/ClickHouse仪表盘）
  bizMonitoring: monitoringRoutes,

  // ============ Docker 引擎管理 ============
  docker: dockerRouter,

  // ============ 知识图谱编排器 ============
  kgOrchestrator: kgOrchestratorRouter,

  // ============ 接入层统一管理 ============
  accessLayer: accessLayerRouter,

  // ============ 统一注册中心（所有模块的类型/分类/配置自动同步） ============
  registry: registryRouter,
  // ============ 算法赋能模块（元数据管理 + 智能推荐 + 组合编排 + 桥接执行） ============
  algorithm: algorithmRouter,
  // ============ 设备/传感器 CRUD ============
  deviceCrud: deviceCrudRouter,
  sensorCrud: sensorCrudRouter,
});

export type AppRouter = typeof appRouter;
