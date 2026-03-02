# 全面修复计划 (COMPLETE FIX PLAN)

> **版本**: 1.0.0 | **日期**: 2026-03-02 | **分支**: feature/hde-v3-phase0
> **问题总数**: 143 | **致命**: 18 | **严重**: 42 | **中等**: 55 | **低**: 28
> **数据来源**: SESSION_STATE.md, PITFALLS.md, ARCHITECTURE_DESIGN.md, 代码库全量审计

---

## 1. 问题总览

### 1.1 分类统计

| 类别 | 代码 | 问题数 | 致命 | 严重 | 中等 | 低 |
|------|------|--------|------|------|------|-----|
| 命名混乱 | A | 15 | 2 | 5 | 6 | 2 |
| 数据契约断裂 | B | 31 | 3 | 12 | 12 | 4 |
| 类型安全 | C | 15 | 1 | 5 | 7 | 2 |
| 功能缺失/Stub | D | 20 | 1 | 8 | 8 | 3 |
| 算法 Bug | E | 8 | 0 | 4 | 4 | 0 |
| 流程断点 | F | 10 | 3 | 4 | 2 | 1 |
| 配置错误 | G | 11 | 3 | 2 | 4 | 2 |
| 前端空壳 | H | 8 | 0 | 1 | 3 | 4 |
| 架构隐患 | I | 15 | 3 | 4 | 5 | 3 |
| 测试缺失 | J | 10 | 2 | 1 | 4 | 3 |
| **合计** | | **143** | **18** | **46** | **55** | **24** |

### 1.2 工作量估算

| 工作量 | 问题数 | 占比 |
|--------|--------|------|
| XS (< 1h) | 28 | 19.6% |
| S (1-4h) | 45 | 31.5% |
| M (4h-1d) | 38 | 26.6% |
| L (1-3d) | 22 | 15.4% |
| XL (3-5d) | 10 | 7.0% |

### 1.3 严重度定义

| 等级 | 含义 | SLA |
|------|------|-----|
| 致命 | 数据错误/安全漏洞/流程完全不通 | 本周内修复 |
| 严重 | 功能不可用/类型不安全/诊断不可信 | 2 周内修复 |
| 中等 | 代码质量差/配置误导/部分功能缺失 | 1 月内修复 |
| 低 | 文档缺失/命名不规范/UI 不完善 | 按优先级排期 |

---

## 2. 完整修复矩阵

### A. 命名混乱 (15 项)

| ID | 描述 | 严重度 | 工作量 | 影响流程 | 依赖 | 涉及文件 |
|----|------|--------|--------|----------|------|----------|
| FIX-001 | 设备 ID 四种命名混用: machineId(539处)/deviceId(159处)/device_id(57处)/machine_id(2处)，跨服务查询断裂 | 致命 | L | 全部14条流程 | 无 | 143+ 文件，drizzle/schema.ts, drizzle/evolution-schema.ts, server/domains/perception/, server/platform/evolution/ |
| FIX-002 | Severity 枚举三套定义: SeverityLevel(4级)/Severity(5级)/AnomalySeverity(4级)，值域互不兼容 | 致命 | M | 流程2,3,4 | 无 | server/algorithms/_core/types.ts:16, server/platform/events/domain-models.ts:47, server/lib/dataflow/anomalyEngine.ts:25 |
| FIX-003 | 时间戳类型混用: Date(20处)/number(35处)/string(25处)，跨模块比较和序列化出错 | 严重 | L | 流程1,6,10 | 无 | shared/apiSpec.ts:89, drizzle/evolution-schema.ts:1315-1327, server/services/streamProcessor.service.ts:27 |
| FIX-004 | DiagnosisConclusion 两套定义: algorithm版(8字段)和HDE版(6字段)，severity/urgency 枚举不同 | 严重 | M | 流程2,4 | FIX-002 | server/algorithms/_core/types.ts:50-67, server/platform/hde/types/index.ts:101-114 |
| FIX-005 | UrgencyLevel 三套定义: algorithm版含attention, HDE版含priority, AI版用planned/defer | 严重 | S | 流程2,4 | FIX-004 | server/algorithms/_core/types.ts:19, server/platform/hde/types/index.ts:109, server/platform/ai/ai.types.ts:21 |
| FIX-006 | PipelineStatus 两套定义: shared版含draft/archived, engine版含created，值域不兼容 | 中等 | S | 流程7 | 无 | shared/pipelineTypes.ts:8, server/services/pipeline.engine.ts:37 |
| FIX-007 | MaintenancePriority 与 UrgencyLevel 语义重叠但值域不同 | 中等 | S | 流程2 | FIX-005 | server/platform/ai/ai.types.ts:21, server/algorithms/_core/types.ts:19 |
| FIX-008 | Kafka 消息体使用 snake_case (device_id/sensor_id/metric_name)与后端 camelCase 不一致 | 中等 | M | 流程1,10 | FIX-001 | scripts/sensor-simulator.ts:190-197, server/services/gateway-kafka-bridge.service.ts:95 |
| FIX-009 | eventBus.publish() 调用时 topic 参数重复传递 (topic, topic, payload) | 中等 | XS | 流程10 | 无 | server/platform/ai/diagnostic-enhancer/diagnostic-enhancer.ts:873 |
| FIX-010 | 前端使用 equipmentId(45处) 与后端 machineId 无映射层 | 严重 | M | 流程8,13 | FIX-001 | client/src/pages/digital-twin/ReplayPage.tsx:70, client/src/pages/digital-twin/SimulationPage.tsx:127 |
| FIX-011 | Neo4j 知识图谱使用 deviceId 与后端 machineId 不一致 | 严重 | M | 流程5,12 | FIX-001 | server/lib/storage/neo4j.storage.ts:335,1209,1539 |
| FIX-012 | sensor-simulator.ts 使用 snake_case (device_id/sensor_id) 与后端命名不一致 | 低 | S | 流程1 | FIX-001 | scripts/sensor-simulator.ts:190 |
| FIX-013 | evolution 模块 SNAKE_TO_CAMEL 映射表暗示命名未统一 | 中等 | S | 流程6 | FIX-001 | shared/evolution-modules.ts:59-96 |
| FIX-014 | config 对象属性路径命名不一致: nl/lab/rules/modules/window/physicsParams | 中等 | S | 无 | FIX-043 | server/core/config.ts |
| FIX-015 | metrics 相关代码使用 snake_case (status_code) 而非 camelCase | 低 | XS | 无 | 无 | server/platform/middleware/metricsCollector.ts:58, server/api/microservice.router.ts:93 |

### B. 数据契约断裂 (31 项)

| ID | 描述 | 严重度 | 工作量 | 影响流程 | 依赖 | 涉及文件 |
|----|------|--------|--------|----------|------|----------|
| FIX-016 | data-contracts.ts 12 处字段名不匹配: 契约写 deviceId 实际用 machineId | 致命 | M | 流程1-6 | FIX-001 | server/platform/contracts/data-contracts.ts |
| FIX-017 | data-contracts.ts 8 处类型不匹配: 契约写 string 实际传 number | 致命 | M | 流程1-6 | 无 | server/platform/contracts/data-contracts.ts |
| FIX-018 | data-contracts.ts 6 处字段缺失: 契约有定义但实际代码不发送 | 严重 | S | 流程1-6 | FIX-016,FIX-017 | server/platform/contracts/data-contracts.ts |
| FIX-019 | data-contracts.ts 5 处多余字段: 实际代码发送但契约未定义 | 严重 | S | 流程1-6 | FIX-016,FIX-017 | server/platform/contracts/data-contracts.ts |
| FIX-020 | EventBus publish() 不强制 Schema 校验，77+ 处发布调用无校验 | 致命 | M | 流程10 | 无 | server/platform/services/event-bus.ts, server/platform/contracts/event-schema-registry.ts |
| FIX-021 | event-schema-registry.ts 25 个 topic 的 Zod schema 已定义但从未被 publish() 调用 | 严重 | S | 流程10 | FIX-020 | server/platform/contracts/event-schema-registry.ts |
| FIX-022 | 双总线(内存 EventBus 25 topic + Kafka 19 topic)未统一 Facade | 严重 | L | 流程10 | FIX-020 | server/platform/services/event-bus.ts, server/services/kafkaEventBus.ts |
| FIX-023 | DLQ(死信队列) topic 已定义但无代码写入，消息静默丢失 | 严重 | M | 流程10 | FIX-022 | server/services/kafkaEventBus.ts |
| FIX-024 | Kafka 消费者无健康检查和心跳，消费者离线无告警 | 严重 | M | 流程10 | 无 | server/services/kafkaEventBus.ts |
| FIX-025 | 两套 DiagnosisConclusion 的 severity 枚举不兼容: SeverityLevel vs 字面量联合 | 严重 | S | 流程2,4 | FIX-002,FIX-004 | server/algorithms/_core/types.ts, server/platform/hde/types/index.ts |
| FIX-026 | 算法输出 SeverityLevel('attention') 传入事件系统 Severity 无此值，类型报错或丢失 | 严重 | S | 流程2 | FIX-002 | server/algorithms/_core/types.ts:16, server/platform/events/domain-models.ts:47 |
| FIX-027 | AnomalySeverity('low') 传入算法层无此值，需映射函数 | 中等 | S | 流程2 | FIX-002 | server/lib/dataflow/anomalyEngine.ts:25 |
| FIX-028 | tRPC 输出 0% Zod 校验，100% 输入校验但响应可能含脏数据 | 严重 | L | 流程8 | 无 | server/api/*.router.ts (33 个路由文件) |
| FIX-029 | apiSpec.ts 定义错误码 100001-504001 但 tRPC 未接入使用 | 严重 | M | 流程8 | 无 | shared/apiSpec.ts, server/api/*.router.ts |
| FIX-030 | tRPC 路由无 /api/v1/ 版本前缀，apiSpec 声明 v1 但路由不体现 | 中等 | M | 流程8 | 无 | server/core/trpc.ts, server/routers.ts |
| FIX-031 | 70% tRPC 路由使用内联 Zod schema 而非共享契约定义 | 中等 | L | 流程8 | FIX-040 | server/api/*.router.ts |
| FIX-032 | gRPC 客户端全部使用 Record<string, unknown>，无类型安全 | 严重 | L | 流程8 | FIX-041 | server/lib/clients/grpcClients.ts |
| FIX-033 | shared/ 目录 145+ 类型导出分散在 10 个文件，无版本标记 | 中等 | M | 无 | FIX-040 | shared/*.ts (10 个文件) |
| FIX-034 | 无 @deprecated 标注废弃类型，旧类型与新类型并存无区分 | 低 | S | 无 | FIX-040 | shared/*.ts |
| FIX-035 | evolution-schema.ts JSON 字段 timestamp 类型不一致: trainingLog 用 string, performanceHistory 用 number | 中等 | S | 流程6 | FIX-003 | drizzle/evolution-schema.ts:2300,2469 |
| FIX-036 | API 响应 timestamp 用 number 但 Drizzle 列返回 Date 对象 | 中等 | S | 流程8 | FIX-003 | shared/apiSpec.ts:89, drizzle/schema.ts |
| FIX-037 | ClickHouse 查询 timestamp 格式依赖客户端传值类型，无统一转换 | 中等 | S | 流程1 | FIX-003 | server/lib/storage/clickhouse.storage.ts |
| FIX-038 | streamProcessor 使用 Date 对象但下游期望 number (epoch ms) | 中等 | S | 流程1 | FIX-003 | server/services/streamProcessor.service.ts:27 |
| FIX-039 | feature-extraction types 混用 timestamp: number 和 timestamp: string | 中等 | XS | 流程2 | FIX-003 | server/services/feature-extraction/types.ts:100,137 |
| FIX-040 | shared/contracts/v1/ 目录尚未创建，统一契约无落地位置 | 严重 | M | 全部 | 无 | shared/ (待创建 shared/contracts/v1/) |
| FIX-041 | Proto 文件变更无自动 TypeScript 类型重生成的 CI 流程 | 中等 | M | 流程8 | 无 | proto/*.proto, package.json |
| FIX-042 | Kafka topic schema 无版本兼容策略 (BACKWARD/FORWARD/FULL) | 中等 | M | 流程10 | FIX-022 | server/platform/contracts/event-schema-registry.ts |
| FIX-043 | eventBus.publish() 中使用 as Record<string, unknown> 绕过类型检查 | 严重 | S | 流程10 | FIX-020 | server/platform/ai/diagnostic-enhancer/diagnostic-enhancer.ts:873, server/platform/evolution/ |
| FIX-044 | Schema Registry for Kafka 未配置，Vault 引用 schema_registry_url 但服务不存在 | 低 | M | 流程10 | FIX-022 | docker-compose.yml, docker/vault/init-vault.sh:67 |
| FIX-045 | 跨域数据契约无 CI 兼容性检测，MAJOR 变更无法自动阻断 | 低 | L | 无 | FIX-040 | .github/workflows/ (待创建) |
| FIX-046 | Zod schema 内联导致前后端契约无法自动同步 | 低 | M | 流程8 | FIX-031,FIX-040 | server/api/*.router.ts |

### C. 类型安全 (15 项)

| ID | 描述 | 严重度 | 工作量 | 影响流程 | 依赖 | 涉及文件 |
|----|------|--------|--------|----------|------|----------|
| FIX-047 | gRPC 客户端响应类型全部为 Record<string, unknown>，无编译时类型检查 | 致命 | L | 流程8 | FIX-041 | server/lib/clients/grpcClients.ts |
| FIX-048 | evolution-schema.ts 38+ 处 json 字段用 Record<string, unknown>，业务数据无类型约束 | 严重 | L | 流程6 | 无 | drizzle/evolution-schema.ts:94,135,224-225,270 |
| FIX-049 | hde-schema.ts json 字段用 Record<string, unknown>，诊断上下文无类型 | 严重 | M | 流程4 | 无 | drizzle/hde-schema.ts |
| FIX-050 | toolInput/toolOutput 字段使用 Record<string, unknown>，工具调用无输入输出校验 | 中等 | S | 流程4 | 无 | drizzle/evolution-schema.ts:224-225 |
| FIX-051 | Action/result payloads 缺少具体类型定义 | 中等 | S | 流程6 | 无 | drizzle/evolution-schema.ts:2068,2095-2098 |
| FIX-052 | diagnostic-enhancer.ts 使用 as Record<string, unknown> 类型断言绕过校验 | 严重 | S | 流程4 | FIX-020 | server/platform/ai/diagnostic-enhancer/diagnostic-enhancer.ts:873 |
| FIX-053 | Proto 文件存在但未生成 TypeScript 类型，gRPC 调用无类型推导 | 严重 | M | 流程8 | FIX-041 | proto/**/*.proto, shared/generated/ (待创建) |
| FIX-054 | observability.service.ts createAlertRule 参数类型为 any | 中等 | XS | 无 | 无 | server/services/observability.service.ts:564 |
| FIX-055 | observability.service.ts createSilence 参数类型为 any | 中等 | XS | 无 | 无 | server/services/observability.service.ts:571 |
| FIX-056 | orchestrator-hub.ts 返回 {stub: true} 对象缺少类型定义 | 中等 | S | 流程7 | 无 | server/platform/orchestrator/orchestrator-hub.ts |
| FIX-057 | Kafka 消息体 timestamp 类型 string 和 number 混用无统一转换 | 中等 | S | 流程10 | FIX-003 | server/services/gateway-kafka-bridge.service.ts:95,566,613 |
| FIX-058 | nl-interface.ts 发布 payload 仅做最小化校验 | 中等 | S | 流程10 | FIX-020 | server/platform/ai/nl-interface/nl-interface.ts:796 |
| FIX-059 | ConditionNormalizer.tsx 使用 fetch() 而非 tRPC hooks，绕过类型安全 | 低 | S | 流程8 | 无 | client/src/pages/algorithm/ConditionNormalizer.tsx:3 |
| FIX-060 | mysqlEnum severity 字段各表值域不同，跨表查询无法统一 | 严重 | M | 流程2,6 | FIX-002 | drizzle/schema.ts, drizzle/evolution-schema.ts |
| FIX-061 | 前端 store 与后端 API 类型定义不总是对齐，手动维护易遗漏 | 低 | M | 流程8 | FIX-040 | client/src/stores/, shared/ |

### D. 功能缺失/Stub (20 项)

| ID | 描述 | 严重度 | 工作量 | 影响流程 | 依赖 | 涉及文件 |
|----|------|--------|--------|----------|------|----------|
| FIX-062 | WorldModel 训练是 stub: simulateTraining() 仅 sleep 5 秒后返回 true，模型权重不变 | 致命 | XL | 流程6 | 无 | server/platform/evolution/models/world-model-engine.ts:317-352 |
| FIX-063 | GrokTool getSensorData 返回 stub 数据，诊断基于假数据 | 严重 | M | 流程4,5 | 无 | server/platform/cognition/grok/grok-tools.ts |
| FIX-064 | GrokTool getMaintenanceHistory 返回 stub 数据 | 严重 | M | 流程4,5 | 无 | server/platform/cognition/grok/grok-tools.ts |
| FIX-065 | GrokTool getEquipmentSpecs 返回 stub 数据 | 中等 | M | 流程4,5 | 无 | server/platform/cognition/grok/grok-tools.ts |
| FIX-066 | GrokTool getSimilarCases 返回 stub 数据 | 中等 | M | 流程5,12 | 无 | server/platform/cognition/grok/grok-tools.ts |
| FIX-067 | GrokTool getWeatherData 返回 stub 数据 | 低 | S | 流程4 | 无 | server/platform/cognition/grok/grok-tools.ts |
| FIX-068 | GrokTool runSimulation 返回 stub 数据 | 中等 | L | 流程4 | FIX-062 | server/platform/cognition/grok/grok-tools.ts |
| FIX-069 | GrokTool getOperationalContext 返回 stub 数据 | 中等 | M | 流程4 | 无 | server/platform/cognition/grok/grok-tools.ts |
| FIX-070 | GrokTool getAlarmHistory 返回 stub 数据 | 严重 | M | 流程4,5 | 无 | server/platform/cognition/grok/grok-tools.ts |
| FIX-071 | GrokTool getTrendAnalysis 返回 stub 数据 | 中等 | M | 流程4,11 | 无 | server/platform/cognition/grok/grok-tools.ts |
| FIX-072 | GrokTool getExpertKnowledge 返回 stub 数据 | 中等 | M | 流程5 | 无 | server/platform/cognition/grok/grok-tools.ts |
| FIX-073 | 前端 ModelFinetune 页面是 placeholder，显示"功能开发中" | 低 | M | 无 | FIX-062 | client/src/pages/PlaceholderPage.tsx |
| FIX-074 | 前端 ModelEval 页面是 placeholder | 低 | M | 无 | 无 | client/src/pages/PlaceholderPage.tsx |
| FIX-075 | 前端 DiagAnalysis 页面是 placeholder | 低 | M | 无 | 无 | client/src/pages/PlaceholderPage.tsx |
| FIX-076 | 前端 DiagReport 页面是 placeholder | 中等 | M | 流程4 | 无 | client/src/pages/PlaceholderPage.tsx |
| FIX-077 | observability.service.ts createAlertRule 返回 mock {success:true, id:'mock'} | 严重 | M | 无 | 无 | server/services/observability.service.ts:564 |
| FIX-078 | observability.service.ts createSilence 返回 mock {success:true, id:'mock'} | 严重 | M | 无 | 无 | server/services/observability.service.ts:571 |
| FIX-079 | orchestrator-hub.ts 多处返回 {stub:true, action, config:{}} | 中等 | L | 流程7 | 无 | server/platform/orchestrator/orchestrator-hub.ts |
| FIX-080 | 工具域 (tooling) domain-router 整体 Stub 状态 | 严重 | XL | 流程4 | FIX-081 | server/domains/tooling/tooling.domain-router.ts |
| FIX-081 | ToolDefinition 7 个工具中多数为 mock 数据，两套工具系统不互通 | 严重 | L | 流程4 | 无 | server/platform/tooling/framework/tool-framework.ts |

### E. 算法 Bug (8 项)

| ID | 描述 | 严重度 | 工作量 | 影响流程 | 依赖 | 涉及文件 |
|----|------|--------|--------|----------|------|----------|
| FIX-082 | 62+ 处 hardcoded confidence 值违反 ADR-001，confidence 必须从数据计算 | 严重 | L | 流程2,4,7 | 无 | 15+ 文件 (server/algorithms/, server/services/, server/platform/) |
| FIX-083 | agent-plugins confidence 计算使用 hardcoded 0.96(max)/0.4(min)/0.35(base)，不适配不同设备 | 严重 | M | 流程2 | FIX-082 | server/algorithms/agent-plugins/index.ts:91 |
| FIX-084 | structural 算法 threshold=40/deadTime=200/hitDefinitionTime=800 硬编码，AE 检测不适配不同材质 | 中等 | M | 流程2 | 无 | server/algorithms/structural/index.ts:156 |
| FIX-085 | agent-plugins cusumChangePoints threshold 逻辑硬编码，无法根据设备类型调整 | 中等 | S | 流程2 | 无 | server/algorithms/agent-plugins/index.ts:121-174 |
| FIX-086 | fusionDiagnosis.service.ts 7 处 hardcoded confidence (行 606/623/628/667/683/721/737) | 严重 | M | 流程2,4 | FIX-082 | server/services/fusionDiagnosis.service.ts |
| FIX-087 | grokDiagnosticAgent.service.ts confidence=0.5 硬编码为默认值 | 中等 | S | 流程4 | FIX-082 | server/services/grokDiagnosticAgent.service.ts:1000 |
| FIX-088 | meta-learner.ts hardcoded 0.7/0.6/0.4 作为模型选择阈值 | 严重 | M | 流程6 | FIX-082 | server/platform/evolution/metalearner/meta-learner.ts:800,832,851 |
| FIX-089 | genetic-strategy.plugin.ts hardcoded 0.55/0.5/0.35 作为适应度计算参数 | 中等 | S | 流程6 | FIX-082 | server/platform/evolution/plugins/strategies/genetic-strategy.plugin.ts:46,67,92 |

### F. 流程断点 (10 项)

| ID | 描述 | 严重度 | 工作量 | 影响流程 | 依赖 | 涉及文件 |
|----|------|--------|--------|----------|------|----------|
| FIX-090 | 感知三层管线未端到端集成: 边缘层→汇聚层→平台层各自独立，无贯通测试 | 致命 | XL | 流程1 | 无 | server/platform/perception/perception-pipeline.ts |
| FIX-091 | DS 融合→诊断 Severity 枚举不匹配: 融合输出 SeverityLevel 但诊断期望 Severity | 致命 | S | 流程2 | FIX-002 | server/platform/cognition/engines/ds-fusion.engine.ts |
| FIX-092 | 护栏引擎未接入诊断流程: 诊断结论直接输出不经过物理约束护栏校验 | 致命 | L | 流程3 | 无 | server/domains/guardrail/ |
| FIX-093 | HDE 双轨诊断缺端到端测试: 物理轨+数据轨→融合→结论流程未验证 | 严重 | L | 流程4 | FIX-002 | server/platform/hde/orchestrator/diagnostic-orchestrator.ts |
| FIX-094 | Neo4j 种子数据未完整导入: 知识图谱推理链缺少基础数据 | 严重 | M | 流程5 | 无 | server/platform/knowledge/seed-data/ |
| FIX-095 | 进化飞轮持久化未接入: 影子评估和冠军挑战者结果不持久化 | 严重 | M | 流程6 | 无 | server/platform/evolution/ |
| FIX-096 | Kafka 事件 Schema 校验未强制: 校验逻辑存在但 publish() 不调用 | 严重 | M | 流程10 | FIX-020 | server/platform/contracts/event-schema-registry.ts |
| FIX-097 | 数据质量评分→分级→告警集成测试缺失 | 中等 | M | 流程11 | 无 | server/platform/perception/quality/data-quality-scorer.ts |
| FIX-098 | 跨设备对比图查询优化缺失: 大规模设备查询性能差 | 中等 | L | 流程12 | 无 | server/platform/hde/comparator/ |
| FIX-099 | 工况归一化特征顺序不确定: 环境参数处理依赖 JS 对象属性顺序，跨版本不稳定 | 低 | S | 流程2 | 无 | server/platform/perception/condition/condition-normalization-pipeline.ts:34-48 |

### G. 配置错误 (11 项)

| ID | 描述 | 严重度 | 工作量 | 影响流程 | 依赖 | 涉及文件 |
|----|------|--------|--------|----------|------|----------|
| FIX-100 | 11 个配置参数声明但运行时被忽略: nl/params/service/lab/retry/rules/modules/window/physicsParams | 中等 | M | 无 | 无 | server/core/config.ts |
| FIX-101 | docker-compose.yml MySQL 默认密码 root123 暴露在版本控制 | 致命 | XS | 无 | 无 | docker-compose.yml:101 |
| FIX-102 | docker-compose.yml JWT_SECRET 弱默认值 xilian-portai-nexus-docker-deploy-secret-2026 | 致命 | XS | 无 | 无 | docker-compose.yml:74 |
| FIX-103 | docker-compose.yml ES_PASSWORD=changeme 占位符未替换 | 严重 | XS | 无 | 无 | docker-compose.yml:692 |
| FIX-104 | MinIO 默认凭据 minioadmin 在 config.ts 和 docker-compose 中硬编码 | 严重 | XS | 无 | 无 | server/core/config.ts:311-312, docker-compose.yml:196 |
| FIX-105 | Grafana admin 默认密码 admin123 暴露 | 中等 | XS | 无 | 无 | docker-compose.yml:507 |
| FIX-106 | Helm values.yaml 所有密码默认空字符串: MySQL/ClickHouse/MinIO/secrets | 致命 | S | 无 | 无 | helm/xilian-platform/values.yaml:320-435 |
| FIX-107 | Vault 运行 dev 模式 (VAULT_DEV_ROOT_TOKEN_ID)，不适合生产 | 中等 | M | 无 | 无 | docker-compose.yml:660 |
| FIX-108 | Prometheus 3 个 metrics target 被注释: ClickHouse/ES/KafkaConnect | 中等 | S | 无 | 无 | docker/prometheus/prometheus.yml:58-87 |
| FIX-109 | Helm ingress hostname 硬编码为 platform.xilian.io，非环境无关 | 低 | XS | 无 | 无 | helm/xilian-platform/values.yaml:106 |
| FIX-110 | microservice-deployments.yaml gRPC 健康检查用 localhost，K8s 环境下会失败 | 低 | S | 无 | 无 | helm/xilian-platform/templates/microservice-deployments.yaml:97,113,129 |

### H. 前端空壳 (8 项)

| ID | 描述 | 严重度 | 工作量 | 影响流程 | 依赖 | 涉及文件 |
|----|------|--------|--------|----------|------|----------|
| FIX-111 | PlaceholderPage.tsx 导出 4 个 placeholder 组件 (ModelFinetune/ModelEval/DiagAnalysis/DiagReport) | 中等 | L | 无 | 无 | client/src/pages/PlaceholderPage.tsx |
| FIX-112 | Agents.tsx 系统提示已定义但交互逻辑不完整 | 中等 | M | 无 | 无 | client/src/pages/Agents.tsx |
| FIX-113 | VectorAdmin.tsx 维度归约 UI 已搭建但后端集成不完整 | 中等 | M | 无 | 无 | client/src/pages/VectorAdmin.tsx |
| FIX-114 | 20-30 个前端页面内容极少，仅有骨架 UI | 严重 | XL | 流程8,13 | 无 | client/src/pages/ (多个子目录) |
| FIX-115 | DiagnosticEnhancerPage.tsx 使用 mock 数据 (confidence:0.85/0.5) | 低 | S | 无 | 无 | client/src/pages/ai/DiagnosticEnhancerPage.tsx:85,144 |
| FIX-116 | reasoning.router.ts 返回 mock 诊断数据 (confidence:0.92/0.87/0.95) | 低 | M | 流程4 | 无 | server/domains/cognition/reasoning.router.ts:167-174 |
| FIX-117 | ConditionNormalizer.tsx 使用 fetch() 未迁移到 tRPC hooks | 低 | S | 无 | 无 | client/src/pages/algorithm/ConditionNormalizer.tsx:3 |
| FIX-118 | 前端 147 页面中约 60% 为 Partial 状态，未达到 Done 标准 | 低 | XL | 流程8 | 无 | client/src/pages/ (全局) |

### I. 架构隐患 (15 项)

| ID | 描述 | 严重度 | 工作量 | 影响流程 | 依赖 | 涉及文件 |
|----|------|--------|--------|----------|------|----------|
| FIX-119 | 插件沙箱使用 Function 构造器: 可访问 global/process/require，非真正隔离 | 致命 | L | 流程7 | 无 | server/platform/tooling/ |
| FIX-120 | 安全检查用正则匹配可绕过: eval→ev+al 即可绕过检测 | 致命 | M | 流程7 | FIX-119 | server/platform/tooling/ |
| FIX-121 | 插件无生命周期管理: 无 install/enable/disable/uninstall 状态机 | 中等 | L | 流程7 | FIX-119 | server/platform/tooling/ |
| FIX-122 | 插件无签名验证: 任何代码可注册执行，无来源可信度检查 | 致命 | M | 流程7 | FIX-119 | server/platform/tooling/ |
| FIX-123 | 两套工具系统不互通: GrokTool(12个) vs ToolDefinition(7个)，接口不兼容 | 严重 | L | 流程4 | 无 | server/platform/cognition/grok/grok-tools.ts, server/platform/tooling/framework/tool-framework.ts |
| FIX-124 | ReAct 链无回放能力: 诊断推理过程不可复现和审计 | 严重 | M | 流程4 | 无 | server/platform/cognition/grok/grok-reasoning-chain.ts |
| FIX-125 | EventBus 未接入工具系统: 工具执行结果不发布事件 | 中等 | S | 流程4,10 | FIX-020 | server/platform/tooling/framework/tool-framework.ts |
| FIX-126 | 双总线路由策略缺失: 无规则决定事件走 Kafka 还是内存 EventBus | 严重 | M | 流程10 | FIX-022 | server/platform/services/event-bus.ts |
| FIX-127 | ClickHouse schema 合并自 4 个版本(V1/V4/V4.1/V5)，存在表名碎片化 | 中等 | M | 流程1 | 无 | docker/clickhouse/init/01_base_tables.sql |
| FIX-128 | Neo4j 无备份策略: 知识图谱数据丢失不可恢复 | 严重 | M | 流程5 | 无 | docker-compose.yml (Neo4j 配置) |
| FIX-129 | Redis 无淘汰策略文档: 缓存满后行为不确定 | 中等 | S | 无 | 无 | docker-compose.yml (Redis 配置) |
| FIX-130 | MySQL 分片策略未实施: 203 张表无分片键定义 | 中等 | XL | 无 | 无 | drizzle/schema.ts |
| FIX-131 | Saga/Outbox 补偿逻辑未补全: 跨库写入失败无回滚 | 严重 | L | 流程1,6 | 无 | server/platform/events/event-sourcing.ts |
| FIX-132 | Grafana dashboard id:null 导致重复导入 | 低 | XS | 无 | 无 | monitoring/grafana/dashboards/*.json |
| FIX-133 | PodSecurityPolicy 已废弃(K8s 1.25+)，应迁移到 PodSecurityStandards | 低 | S | 无 | 无 | helm/xilian-platform/values.yaml:297 |

### J. 测试缺失 (10 项)

| ID | 描述 | 严重度 | 工作量 | 影响流程 | 依赖 | 涉及文件 |
|----|------|--------|--------|----------|------|----------|
| FIX-134 | 平台模块测试覆盖率仅 13.6% (41/301 文件)，远低于合格线 | 致命 | XL | 全部 | 无 | server/platform/ |
| FIX-135 | AI 模块(server/platform/ai/) 3 个子模块 0 测试文件 | 致命 | L | 流程4 | 无 | server/platform/ai/ |
| FIX-136 | Pipeline 模块 DAG 引擎测试覆盖不足 | 中等 | M | 流程7 | 无 | server/platform/pipeline/ |
| FIX-137 | Observability 模块仅 1 个测试文件，监控核心功能未验证 | 中等 | M | 无 | 无 | server/platform/observability/ |
| FIX-138 | 14 个协议适配器测试覆盖有限 | 中等 | L | 流程14 | 无 | server/services/protocol-adapters/ |
| FIX-139 | 算法库 49 个算法缺单元测试，正确性未验证 | 严重 | XL | 流程2,7 | 无 | server/algorithms/ |
| FIX-140 | HDE 双轨诊断无端到端测试 | 中等 | L | 流程4 | FIX-093 | server/platform/hde/ |
| FIX-141 | 感知管线端到端集成测试缺失 | 低 | L | 流程1 | FIX-090 | server/platform/perception/ |
| FIX-142 | Proto 文件编译无 CI 验证 | 低 | S | 无 | FIX-041 | proto/, .github/workflows/ |
| FIX-143 | MySQL 初始化脚本缺失: docker/mysql/init/ 目录不存在 | 低 | S | 无 | 无 | docker/mysql/init/ (待创建) |

---

## 3. 最优执行顺序 (DAG 拓扑排序)

### 3.1 零依赖致命问题 (立即启动)

```
优先级 1 — 并行执行:
  FIX-001 设备ID统一 (L)
  FIX-002 Severity枚举统一 (M)
  FIX-020 EventBus强制Schema校验 (M)
  FIX-090 感知管线端到端集成 (XL)
  FIX-092 护栏引擎接入诊断流程 (L)
  FIX-101 Docker MySQL密码安全化 (XS)
  FIX-102 Docker JWT_SECRET安全化 (XS)
  FIX-106 Helm密码安全化 (S)
  FIX-119 插件沙箱升级isolated-vm (L)
```

### 3.2 第一批依赖解除后 (接续启动)

```
优先级 2 — 依赖 FIX-001:
  FIX-010 前端equipmentId映射 (M)
  FIX-011 Neo4j deviceId统一 (M)
  FIX-016 契约字段名修正 (M)

优先级 2 — 依赖 FIX-002:
  FIX-004 DiagnosisConclusion合并 (M)
  FIX-025 两套DiagnosisConclusion severity兼容 (S)
  FIX-026 SeverityLevel→Severity映射 (S)
  FIX-060 mysqlEnum severity统一 (M)
  FIX-091 DS融合Severity修正 (S)

优先级 2 — 依赖 FIX-020:
  FIX-021 Schema注册表激活 (S)
  FIX-043 类型断言替换 (S)
  FIX-096 Kafka Schema校验强制 (M)

优先级 2 — 依赖 FIX-119:
  FIX-120 安全检查升级AST (M)
  FIX-122 插件签名验证 (M)
```

### 3.3 第二批 (核心功能补全)

```
优先级 3 — 零依赖:
  FIX-003 时间戳类型统一 (L)
  FIX-028 tRPC输出校验 (L)
  FIX-029 错误码接入tRPC (M)
  FIX-040 创建shared/contracts/v1/ (M)
  FIX-047 gRPC类型生成 (L)
  FIX-062 WorldModel训练实现 (XL)
  FIX-063 GrokTool getSensorData实现 (M)
  FIX-064 GrokTool getMaintenanceHistory实现 (M)
  FIX-082 confidence硬编码清理 (L)
  FIX-094 Neo4j种子数据导入 (M)
  FIX-095 进化飞轮持久化 (M)
  FIX-134 测试覆盖率提升计划 (XL)
```

### 3.4 第三批 (质量提升)

```
优先级 4 — 依赖优先级3:
  FIX-005 UrgencyLevel统一 (依赖FIX-004) (S)
  FIX-017 契约类型修正 (M)
  FIX-018 契约字段补全 (S)
  FIX-019 契约多余字段清理 (S)
  FIX-022 EventBus Facade统一 (依赖FIX-020) (L)
  FIX-035 JSON时间戳统一 (依赖FIX-003) (S)
  FIX-048 evolution-schema类型细化 (L)
  FIX-070 GrokTool getAlarmHistory实现 (M)
  FIX-077 AlertManager集成 (M)
  FIX-078 Silence集成 (M)
  FIX-093 HDE端到端测试 (L)
  FIX-100 配置参数清理 (M)
  FIX-123 工具系统统一 (L)
```

### 3.5 第四批 (收尾和优化)

```
优先级 5 — 其余全部:
  FIX-006 PipelineStatus统一 (S)
  FIX-023 DLQ实现 (M)
  FIX-024 消费者健康检查 (M)
  FIX-030 API版本路由 (M)
  FIX-031 Zod schema提取 (L)
  FIX-041 Proto TypeScript生成CI (M)
  FIX-065~072 GrokTool剩余实现
  FIX-079 orchestrator-hub实现 (L)
  FIX-080 tooling域实现 (XL)
  FIX-084~089 算法参数配置化
  FIX-097~099 集成测试补全
  FIX-103~110 配置安全加固
  FIX-111~118 前端页面补全
  FIX-121~133 架构隐患修复
  FIX-135~143 测试补全
```

---

## 4. 验收测试计划

### 4.1 验证方法定义

| 方法 | 代码 | 说明 |
|------|------|------|
| Grep | V-GREP | 代码搜索确认变更 |
| Type | V-TYPE | `pnpm check` 通过 |
| Unit | V-UNIT | 单元测试通过 |
| Integ | V-INTEG | 集成测试通过 |
| E2E | V-E2E | 端到端流程验证 |
| Manual | V-MANUAL | 人工操作验证 |
| CI | V-CI | CI 流水线验证 |
| Scan | V-SCAN | 安全扫描通过 |

### 4.2 每项问题的验证方法

| ID | 验证方法 | 验证步骤 |
|----|----------|----------|
| FIX-001 | V-GREP + V-TYPE | `grep -r "deviceId\|device_id\|equipmentId" server/ client/ shared/` 输出 0 行(排除注释和映射器); `pnpm check` 0 错误 |
| FIX-002 | V-GREP + V-TYPE | `grep -rn "type.*Severity" server/ shared/` 仅返回 shared/contracts/v1/common.contract.ts; `pnpm check` 0 错误 |
| FIX-003 | V-GREP + V-TYPE | JSON $type 中 timestamp 全部为 number 类型; toEpochMs() 工具函数存在且被引用 |
| FIX-004 | V-GREP + V-TYPE | `grep -rn "interface DiagnosisConclusion" server/` 仅返回 1 个位置(shared/contracts/v1/) |
| FIX-005 | V-GREP | `grep -rn "type.*Urgency" server/` 仅返回 1 个位置 |
| FIX-006 | V-GREP | PipelineStatus 定义唯一，所有引用指向同一来源 |
| FIX-007 | V-GREP | MaintenancePriority 使用 Urgency 枚举或提供映射 |
| FIX-008 | V-TYPE | Kafka 消息入口有 camelCase 转换层 |
| FIX-009 | V-GREP | eventBus.publish() 调用签名正确，无重复 topic 参数 |
| FIX-010 | V-GREP + V-TYPE | 前端代码 `grep -rn "equipmentId" client/` 仅在映射层出现 |
| FIX-011 | V-GREP | Neo4j 查询使用 machineId 而非 deviceId |
| FIX-012 | V-GREP | sensor-simulator 使用 camelCase 或有转换层 |
| FIX-013 | V-GREP | SNAKE_TO_CAMEL 映射表与实际命名一致 |
| FIX-014 | V-GREP | 所有 config 属性路径有文档说明和类型定义 |
| FIX-015 | V-GREP | metrics 代码使用 camelCase 或 Prometheus 标准 snake_case 有文档说明 |
| FIX-016 | V-TYPE | data-contracts.ts 字段名与实际使用一致; `pnpm check` 0 错误 |
| FIX-017 | V-TYPE | data-contracts.ts 类型与实际传值类型一致 |
| FIX-018 | V-GREP | 契约定义的字段在实际代码中全部发送 |
| FIX-019 | V-GREP | 实际代码发送的字段全部在契约中定义 |
| FIX-020 | V-UNIT + V-INTEG | publish() 发送非法 payload 时抛出 SchemaValidationError; 单元测试覆盖 |
| FIX-021 | V-GREP | event-schema-registry 的 validate() 在 publish() 中被调用 |
| FIX-022 | V-UNIT | UnifiedEventBus 类存在; 路由策略测试覆盖 |
| FIX-023 | V-UNIT | DLQ 处理器存在; 消息处理失败后写入 DLQ |
| FIX-024 | V-UNIT | 消费者心跳检测存在; 离线告警测试通过 |
| FIX-025 | V-TYPE | 两套 DiagnosisConclusion 合并为一套; `pnpm check` 0 错误 |
| FIX-026 | V-UNIT | Severity 映射函数存在且单元测试覆盖全部枚举值 |
| FIX-027 | V-UNIT | AnomalySeverity 到统一 Severity 的映射测试通过 |
| FIX-028 | V-UNIT | 至少 5 个核心路由有输出 Zod 校验; dev 模式抛错通过 |
| FIX-029 | V-GREP | tRPC 错误响应包含标准错误码 (XYYZZZ 格式) |
| FIX-030 | V-MANUAL | API 请求路径包含 /api/v1/ 前缀 |
| FIX-031 | V-GREP | 核心路由的 Zod schema 从 shared/contracts/ import |
| FIX-032 | V-TYPE | gRPC 客户端方法返回具体类型而非 Record<string, unknown> |
| FIX-033 | V-GREP | shared/ 类型分布在 contracts/v1/ 下按域组织 |
| FIX-034 | V-GREP | 旧类型文件包含 @deprecated JSDoc 注释 |
| FIX-035 | V-GREP | evolution-schema JSON 字段内 timestamp 统一为 number |
| FIX-036 | V-UNIT | API 响应中 Drizzle Date 字段经过 toEpochMs() 转换 |
| FIX-037 | V-UNIT | ClickHouse 查询参数统一使用 number 类型 timestamp |
| FIX-038 | V-TYPE | streamProcessor 输出 timestamp 为 number |
| FIX-039 | V-TYPE | feature-extraction types timestamp 统一为 number |
| FIX-040 | V-GREP | shared/contracts/v1/ 目录存在且包含 index.ts |
| FIX-041 | V-CI | proto 文件变更触发 TypeScript 生成; CI 检查生成文件与 proto 同步 |
| FIX-042 | V-GREP | TopicRegistryEntry 包含 compatibility 字段 |
| FIX-043 | V-GREP | `grep -rn "as Record<string, unknown>" server/` 返回 0 行 |
| FIX-044 | V-MANUAL | docker-compose 包含 Schema Registry 服务定义 |
| FIX-045 | V-CI | .github/workflows/ 包含 contract-check.yml |
| FIX-046 | V-GREP | 前端 tRPC 调用的类型从 shared/contracts/ 推导 |
| FIX-047 | V-TYPE | gRPC 客户端返回类型从 proto 生成; `pnpm check` 0 错误 |
| FIX-048 | V-TYPE | evolution-schema json 字段使用具体接口类型 |
| FIX-049 | V-TYPE | hde-schema json 字段使用具体接口类型 |
| FIX-050 | V-TYPE | toolInput/toolOutput 有具体 Zod schema |
| FIX-051 | V-TYPE | Action/result payload 有 TypeScript 接口定义 |
| FIX-052 | V-GREP | `grep -rn "as Record" server/platform/ai/` 返回 0 行 |
| FIX-053 | V-CI | shared/generated/proto/ 目录包含 .ts 文件 |
| FIX-054 | V-TYPE | createAlertRule 参数类型非 any |
| FIX-055 | V-TYPE | createSilence 参数类型非 any |
| FIX-056 | V-TYPE | orchestrator-hub 返回类型有接口定义 |
| FIX-057 | V-UNIT | Kafka 消息 timestamp 经过类型转换层 |
| FIX-058 | V-UNIT | nl-interface 发布 payload 经过 Schema 校验 |
| FIX-059 | V-GREP | ConditionNormalizer.tsx 使用 trpc.useQuery/useMutation |
| FIX-060 | V-GREP | 所有 mysqlEnum('severity') 使用相同值域 |
| FIX-061 | V-TYPE | 前端 store 类型从 shared/contracts/ import |
| FIX-062 | V-INTEG | WorldModel train() 调用 Python 子进程; 训练后模型权重变化; metrics 包含真实 loss |
| FIX-063 | V-INTEG | getSensorData 返回 ClickHouse 真实数据; isStub 标记不存在 |
| FIX-064 | V-INTEG | getMaintenanceHistory 返回 MySQL 真实数据 |
| FIX-065 | V-INTEG | getEquipmentSpecs 返回设备规格真实数据 |
| FIX-066 | V-INTEG | getSimilarCases 返回 Neo4j 相似案例 |
| FIX-067 | V-INTEG | getWeatherData 返回外部 API 或 mock 标记数据 |
| FIX-068 | V-INTEG | runSimulation 调用数字孪生模拟引擎 |
| FIX-069 | V-INTEG | getOperationalContext 返回作业上下文数据 |
| FIX-070 | V-INTEG | getAlarmHistory 返回 MySQL 告警历史 |
| FIX-071 | V-INTEG | getTrendAnalysis 调用算法库趋势分析 |
| FIX-072 | V-INTEG | getExpertKnowledge 返回知识图谱专家知识 |
| FIX-073 | V-MANUAL | ModelFinetune 页面有功能 UI 而非 placeholder |
| FIX-074 | V-MANUAL | ModelEval 页面有功能 UI |
| FIX-075 | V-MANUAL | DiagAnalysis 页面有功能 UI |
| FIX-076 | V-MANUAL | DiagReport 页面可生成诊断报告 |
| FIX-077 | V-INTEG | createAlertRule 调用 Prometheus/AlertManager API 返回真实 ID |
| FIX-078 | V-INTEG | createSilence 调用 AlertManager API |
| FIX-079 | V-UNIT | orchestrator-hub 不再返回 {stub:true} |
| FIX-080 | V-INTEG | tooling 域路由返回真实工具执行结果 |
| FIX-081 | V-UNIT | ToolDefinition 和 GrokTool 统一为 ToolContract 接口 |
| FIX-082 | V-GREP | `grep -rn "confidence.*=.*0\.\[0-9\]" server/` 仅返回从数据计算的赋值 |
| FIX-083 | V-UNIT | agent-plugins confidence 使用可配置参数对象 |
| FIX-084 | V-UNIT | structural 算法参数从 config 或 input.params 读取 |
| FIX-085 | V-UNIT | cusumChangePoints threshold 从参数传入 |
| FIX-086 | V-UNIT | fusionDiagnosis confidence 从证据链计算 |
| FIX-087 | V-UNIT | grokDiagnosticAgent confidence 从推理结果计算 |
| FIX-088 | V-UNIT | meta-learner 阈值从配置读取 |
| FIX-089 | V-UNIT | genetic-strategy 适应度参数可配置 |
| FIX-090 | V-E2E | 传感器数据→边缘层→汇聚层→平台层完整流程通过 |
| FIX-091 | V-TYPE | DS 融合引擎输出使用统一 Severity 枚举 |
| FIX-092 | V-E2E | 诊断结论经过护栏引擎校验后才输出 |
| FIX-093 | V-E2E | 物理轨+数据轨→融合→结论完整流程测试通过 |
| FIX-094 | V-MANUAL | Neo4j 浏览器可查询完整的设备-部件-故障关系图 |
| FIX-095 | V-INTEG | 影子评估和冠军挑战者结果写入 MySQL |
| FIX-096 | V-UNIT | Kafka publish 拒绝不合规 payload |
| FIX-097 | V-INTEG | 数据质量评分→分级→告警完整流程测试通过 |
| FIX-098 | V-INTEG | 100+ 设备跨设备对比查询 <3 秒 |
| FIX-099 | V-UNIT | 不同参数顺序输入产生相同归一化结果 |
| FIX-100 | V-GREP | 所有 config.xxx 引用在 config.ts 中有定义和默认值 |
| FIX-101 | V-SCAN | docker-compose.yml 不含明文弱密码 |
| FIX-102 | V-SCAN | JWT_SECRET 使用环境变量注入，无默认值 |
| FIX-103 | V-SCAN | ES_PASSWORD 使用环境变量注入 |
| FIX-104 | V-SCAN | MinIO 凭据使用环境变量注入 |
| FIX-105 | V-SCAN | Grafana 密码使用环境变量注入 |
| FIX-106 | V-GREP | Helm values.yaml 密码字段有 Required 注释 |
| FIX-107 | V-GREP | Vault 配置支持非 dev 模式 |
| FIX-108 | V-MANUAL | Prometheus targets 全部可达 |
| FIX-109 | V-GREP | Helm ingress hostname 使用模板变量 |
| FIX-110 | V-GREP | gRPC 健康检查使用 K8s service DNS |
| FIX-111 | V-MANUAL | PlaceholderPage 导出的 4 个组件有功能 UI |
| FIX-112 | V-MANUAL | Agents 页面支持完整交互流程 |
| FIX-113 | V-MANUAL | VectorAdmin 页面后端 API 全部接通 |
| FIX-114 | V-MANUAL | 空壳页面数量降至 10 个以下 |
| FIX-115 | V-GREP | DiagnosticEnhancerPage 数据从后端 API 获取 |
| FIX-116 | V-GREP | reasoning.router.ts 返回真实推理结果 |
| FIX-117 | V-GREP | ConditionNormalizer 使用 tRPC hooks |
| FIX-118 | V-GREP | 前端 Done 状态页面占比 >60% |
| FIX-119 | V-UNIT | 沙箱内代码无法访问 process/require/global |
| FIX-120 | V-UNIT | eval/Function 等危险函数被 AST 检测拦截 |
| FIX-121 | V-UNIT | 插件状态机 install→enable→execute→disable→uninstall 测试通过 |
| FIX-122 | V-UNIT | 无签名插件被拒绝执行 |
| FIX-123 | V-TYPE | ToolContract 接口统一; GrokTool 和 ToolDefinition 通过适配器兼容 |
| FIX-124 | V-UNIT | ReAct 链完整 step 可序列化和反序列化 |
| FIX-125 | V-GREP | 工具执行完成后发布 EventBus 事件 |
| FIX-126 | V-UNIT | 事件根据 topicConfig.routingStrategy 选择 Kafka 或内存总线 |
| FIX-127 | V-GREP | ClickHouse 表名唯一无歧义 |
| FIX-128 | V-MANUAL | Neo4j 备份脚本存在且可恢复 |
| FIX-129 | V-GREP | Redis 配置包含 maxmemory-policy 设置 |
| FIX-130 | V-GREP | 关键表有分片键注释 |
| FIX-131 | V-UNIT | 跨库写入失败后触发补偿逻辑 |
| FIX-132 | V-GREP | Grafana dashboard JSON 有有效 id 字段 |
| FIX-133 | V-GREP | Helm chart 使用 PodSecurityStandards |
| FIX-134 | V-CI | 平台模块测试覆盖率 >40% |
| FIX-135 | V-CI | server/platform/ai/ 每个子模块至少 1 个测试文件 |
| FIX-136 | V-CI | Pipeline DAG 引擎有 >5 个测试用例 |
| FIX-137 | V-CI | Observability 模块有 >3 个测试文件 |
| FIX-138 | V-CI | 至少 5 个核心协议适配器有集成测试 |
| FIX-139 | V-CI | 每个算法分类至少 2 个单元测试用例 |
| FIX-140 | V-E2E | HDE 端到端测试通过 |
| FIX-141 | V-E2E | 感知管线端到端测试通过 |
| FIX-142 | V-CI | Proto 编译步骤在 CI 中通过 |
| FIX-143 | V-GREP | docker/mysql/init/ 目录包含初始化 SQL |

---

## 5. 引用索引

### 5.1 问题来源追溯

| 来源 | 覆盖的 FIX-ID |
|------|---------------|
| SESSION_STATE.md §5 F1 | FIX-001 |
| SESSION_STATE.md §5 F2 | FIX-002 |
| SESSION_STATE.md §5 F3 | FIX-016~019 |
| SESSION_STATE.md §5 H1 | FIX-003 |
| SESSION_STATE.md §5 H2 | FIX-062 |
| SESSION_STATE.md §5 H3 | FIX-020,FIX-021 |
| SESSION_STATE.md §5 H4 | FIX-032,FIX-047 |
| SESSION_STATE.md §5 M1 | FIX-100 |
| SESSION_STATE.md §5 M2 | FIX-099 |
| SESSION_STATE.md §5 M3 | FIX-063~072 |
| SESSION_STATE.md §5 M4 | FIX-119 |
| PITFALLS.md §1 | FIX-001,FIX-010~013 |
| PITFALLS.md §2 | FIX-002,FIX-025~027 |
| PITFALLS.md §3 | FIX-003,FIX-035~039 |
| PITFALLS.md §4 | FIX-016~019 |
| PITFALLS.md §5 | FIX-062 |
| PITFALLS.md §6 | FIX-063~072 |
| PITFALLS.md §7 | FIX-100 |
| PITFALLS.md §8 | FIX-099 |
| PITFALLS.md §9 | FIX-119~122 |
| PITFALLS.md §10 | FIX-020~024 |
| ARCHITECTURE_DESIGN.md §1 | FIX-081,FIX-123~125 |
| ARCHITECTURE_DESIGN.md §2 | FIX-028~032,FIX-047 |
| ARCHITECTURE_DESIGN.md §3 | FIX-119~122 |
| ARCHITECTURE_DESIGN.md §4 | FIX-020~024,FIX-042,FIX-126 |
| ARCHITECTURE_DESIGN.md §5 | FIX-127~131 |
| ARCHITECTURE_DESIGN.md §6 | FIX-004,FIX-040,FIX-045 |
| 代码库审计-命名 | FIX-005~015 |
| 代码库审计-Stub | FIX-073~080,FIX-111~118 |
| 代码库审计-算法 | FIX-082~089 |
| 代码库审计-类型 | FIX-048~061 |
| 代码库审计-配置 | FIX-101~110 |
| 代码库审计-流程 | FIX-090~098 |
| 代码库审计-测试 | FIX-134~143 |

### 5.2 流程影响矩阵

| 流程 | 影响的 FIX-ID (致命标红) |
|------|--------------------------|
| 流程1 传感器→感知管线→状态向量 | **FIX-090**, FIX-001, FIX-003, FIX-008, FIX-037, FIX-038, FIX-127, FIX-141 |
| 流程2 状态向量→DS融合→诊断结论 | **FIX-002**, **FIX-091**, FIX-004, FIX-005, FIX-025, FIX-026, FIX-060, FIX-082~089, FIX-099 |
| 流程3 诊断结论→护栏校验→安全干预 | **FIX-092**, FIX-002 |
| 流程4 HDE双轨→融合结论 | FIX-002, FIX-004, FIX-049, FIX-052, FIX-063~072, FIX-082, FIX-086~087, FIX-093, FIX-123~124, FIX-135, FIX-140 |
| 流程5 知识图谱→推理链→诊断增强 | FIX-011, FIX-063~066, FIX-070, FIX-072, FIX-094 |
| 流程6 进化飞轮→影子评估→冠军挑战者 | FIX-003, FIX-035, FIX-048, FIX-088~089, FIX-095 |
| 流程7 算法库→执行→结果持久化 | FIX-006, FIX-056, FIX-079~080, FIX-119~122, FIX-136 |
| 流程8 tRPC API→前端→数据展示 | FIX-010, FIX-028~032, FIX-036, FIX-040, FIX-046~047, FIX-053, FIX-059, FIX-061, FIX-114, FIX-117~118 |
| 流程10 Kafka事件→Schema校验→消费 | **FIX-020**, FIX-021~024, FIX-042~044, FIX-057~058, FIX-096, FIX-126 |
| 流程11 数据质量评分→分级→告警 | FIX-097 |
| 流程12 跨设备对比→共享组件发现 | FIX-066, FIX-098 |
| 流程13 数字孪生→3D模型→传感器热图 | FIX-010, FIX-114 |
| 流程14 协议适配→接入层→Connector CRUD | FIX-138 |

---

> 本文档基于 2026-03-02 代码库全量审计生成。每个 FIX-ID 唯一且不可重编号。新发现问题追加 FIX-144 起。
