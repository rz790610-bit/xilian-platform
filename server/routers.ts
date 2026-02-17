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
// [DEPRECATED] deviceCrud 已统一到 database.asset，保留文件但不再注册
// import { deviceCrudRouter } from "./api/deviceCrud.router";
import { sensorCrudRouter } from "./api/sensorCrud.router";
// ============ 微服务监控 ============
import { microserviceRouter } from "./api/microservice.router";
// ============ xAI Grok 诊断 Agent ============
import { grokDiagnosticRouter } from "./api/grokDiagnostic.router";
// ============ 融合诊断引擎（DS证据理论） ============
import { fusionDiagnosisRouter } from "./api/fusionDiagnosis.router";
// ============ 高级知识蒸馏（DistilLib v2.4） ============
import { advancedDistillationRouter } from "./api/advancedDistillation.router";
// ============ 工况归一化引擎 ============
import { conditionNormalizerRouter } from "./api/conditionNormalizer.router";

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
  // deviceCrud: deviceCrudRouter,  // [DEPRECATED] 已统一到 database.asset + 基础设置
  sensorCrud: sensorCrudRouter,
  // ============ 微服务监控（断路器/Prometheus/拓扑） ============
  microservice: microserviceRouter,
  // ============ xAI Grok 诊断 Agent（设备故障诊断/多轮对话/Tool Calling） ============
  grokDiagnostic: grokDiagnosticRouter,
  // ============ 融合诊断引擎（DS证据理论 + 专家注册 + 冲突处理） ============
  fusionDiagnosis: fusionDiagnosisRouter,
  // ============ 高级知识蒸馏（动态温度 + 特征/关系/融合蒸馏 + 多模态） ============
  advancedDistillation: advancedDistillationRouter,
  conditionNormalizer: conditionNormalizerRouter,
});

export type AppRouter = typeof appRouter;
