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
// ============ v3.1 自适应智能架构 — 平台健康 ============
import { platformHealthRouter } from "./api/platformHealth.router";
// ============ 统一编排调度层 + 业务配置入口 ============
import { orchestratorHubRouter } from "./api/orchestratorHub.router";
import { businessConfigRouter } from "./api/businessConfig.router";
// ============ 统一观测中枢 ============
import { observabilityHubRouter } from "./api/observability-hub.router";
// ============ HDE 双轨诊断引擎（物理轨+数据轨 → DS融合 → 物理约束校验） ============
import { hdeDiagnosticRouter } from "./api/hdeDiagnostic.router";
// ============ P1-4 跨设备横向对比（共享部件发现 + 故障传播预警） ============
import { crossDeviceRouter } from "./api/crossDevice.router";
// ============ P0-1 统一编码注册表（4类编码校验 + Seed + 字典查询） ============
import { encodingRouter } from "./api/encoding.router";
// ============ P2-9 大模型价值发挥（诊断增强/NL交互/技术情报/进化实验室） ============
import { aiRouter } from "./api/ai.router";
// ============ P2-10 评估与组合优化体系（四维评估/模块排行/组合推荐） ============
import { evaluationRouter } from "./api/evaluation.router";
// ============ P3-1 联邦知识蒸馏（跨客户脱敏图谱融合） ============
import { federatedRouter } from "./api/federated.router";
// ============ 进化 UI（反馈中心/标注管理/主动学习） ============
import { evolutionUIRouter } from "./api/evolution-ui.router";

// ============ v5.0 深度进化 — 8 域路由 ============
import { perceptionDomainRouter } from "./domains/perception/perception.domain-router";
import { cognitionDomainRouter } from "./domains/cognition/cognition.domain-router";
import { guardrailDomainRouter } from "./domains/guardrail/guardrail.domain-router";
import { evolutionDomainRouter } from "./domains/evolution/evolution.domain-router";
import { knowledgeDomainRouter } from "./domains/knowledge/knowledge.domain-router";
import { toolingDomainRouter } from "./domains/tooling/tooling.domain-router";
import { pipelineDomainRouter } from "./domains/pipeline/pipeline.domain-router";
import { platformDomainRouter } from "./domains/platform/platform.domain-router";
import { qualityRouter } from "./api/quality.router";

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
  // ============ v3.1 自适应智能架构 — L1 契约基层 + L2 自省层 ============
  platformHealth: platformHealthRouter,
  // ============ 统一编排调度层（Pipeline/KG/DB 三引擎协调） ============
  orchestratorHub: orchestratorHubRouter,
  // ============ 业务配置入口（设备类型→三引擎配置自动生成） ============
  businessConfig: businessConfigRouter,
  // ============ 统一观测中枢（运维仪表盘 + 客户状态大屏） ============
  observabilityHub: observabilityHubRouter,
  // ============ HDE 双轨诊断引擎（物理轨+数据轨 → DS融合 → 物理约束校验） ============
  hdeDiagnostic: hdeDiagnosticRouter,
  // ============ P1-4 跨设备横向对比（共享部件发现 + 故障传播预警） ============
  crossDevice: crossDeviceRouter,
  // ============ P0-1 统一编码注册表（4类编码校验 + Seed + 字典查询） ============
  encoding: encodingRouter,
  // ============ P2-9 大模型价值发挥（诊断增强/NL交互/技术情报/进化实验室） ============
  ai: aiRouter,
  // ============ P2-10 评估与组合优化体系（四维评估/模块排行/组合推荐） ============
  evaluation: evaluationRouter,
  // ============ P3-1 联邦知识蒸馏（跨客户脱敏图谱融合） ============
  federated: federatedRouter,
  // ============ 进化 UI（反馈中心/标注管理/主动学习） ============
  evolutionUI: evolutionUIRouter,

  // ============ v5.0 深度进化 — 8 域路由 ============
  // 感知域（采集/融合/编码/工况管理）
  evoPerception: perceptionDomainRouter,
  // 认知域（Grok推理/WorldModel/四维诊断/报告）
  evoCognition: cognitionDomainRouter,
  // 护栏域（安全/健康/高效规则引擎）
  evoGuardrail: guardrailDomainRouter,
  // 进化域（影子评估/冠军挑战者/知识结晶/MetaLearner/飞轮）
  evoEvolution: evolutionDomainRouter,
  // 知识域（知识图谱/特征注册表/链式推理）
  evoKnowledge: knowledgeDomainRouter,
  // 工具域（工具注册/发现/执行/沙箱）
  evoTooling: toolingDomainRouter,
  // 管线域（DAG引擎/数字孪生/回放/仿真）
  evoPipeline: pipelineDomainRouter,
  // 平台域（编排器/仪表盘/健康检查/配置）
  evoPlatform: platformDomainRouter,

  // ============ 质量看板 ============
  quality: qualityRouter,
});

export type AppRouter = typeof appRouter;
