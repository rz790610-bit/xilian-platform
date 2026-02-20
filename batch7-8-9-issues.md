# 第七批（平台服务与中间件层第四轮）

## P0（2项）

### S0-1: auth.service.ts — validateToken 永远返回 valid:true（全平台最高危）
- 任意非空 token 即可获得 admin 权限
- 修复：实现完整 JWT 验证 + MySQL 用户查询 + RBAC + token 黑名单

### S0-2: system.routes.ts — alertRules/scheduledTasks CRUD 无认证
- 8 个 mutation 使用 publicProcedure
- 修复：改为 protectedProcedure/adminProcedure

## P1（4项）

### P1-R4-1: clickhouse.connector.ts — GET 请求 URL 拼接 SQL
- 修复：改用 POST，SQL 放请求体，添加认证

### P1-R4-2: nebula.connector.ts — healthCheck 不校验返回结果
- 修复：校验响应字段 + 添加认证配置

### P1-R4-3: configCenter.ts — rollback() 历史超出窗口静默失败
- 修复：持久化到 MySQL + 失败时抛 TRPCError

### P1-R4-4: dataFlowTracer.ts — TOPIC_TARGET_MAP 硬编码
- 修复：优先使用 metadata.targetModule + 动态构建映射

## P2（6项）

### A2-R4-1: 连接器层质量不均 — 补全 mysql/clickhouse/nebula/qdrant
### A2-R4-2: schema-registry.service.ts — tableName SQL 注入
### A2-R4-3: vaultIntegration.ts — 内存密钥安全
### A2-R4-4: resource-discovery.service.ts — ClickHouseTableScanner 硬编码
### A2-R4-5: serviceRegistry.ts — K8s 发现过于简化
### A2-R4-6: gracefulShutdown.ts — data-artery 关闭优先级冲突

# 第八批（前端组件/数据层/服务层 — 批次16）

## P1（2项）

### P1-QD1: services/qdrant.ts — Qdrant 直连 URL 可绕过 nginx 认证层（重申 P1-C3）
- VITE_QDRANT_URL 被误配置时绕过 nginx 认证直接访问 Qdrant
- 修复：删除 qdrant.ts 前端直连，所有向量库操作通过 tRPC 代理

### P2-DR1（重分类为P1）: services/dimensionReduction.ts — t-SNE 主线程同步 500 迭代阻塞 UI 2-4s
- 修复：移入 Web Worker

## P2（7项）

### P2-PC1: PipelineCanvas.tsx — mousemove 节点位置更新无节流
- 修复：RAF 节流 + batchUpdate

### P2-PC2: PipelineConfigPanel.tsx — password 字段明文写入 Store → localStorage
- 修复：password 字段不持久化，改用 credentialId

### P2-KG1: KGCanvas.tsx — 多选拖拽每帧 O(n) 次 updateNode
- 修复：增加 batchUpdateNodePositions Store Action

### P2-S1: Sidebar.tsx — useAppStore.getState() 非响应式调用
- 修复：改为 useAppStore 响应式订阅

### P2-ER1: ERDiagram.tsx — 多选拖拽 dx/dy 增量累加逻辑错误
- 修复：记录初始位置快照，改用总偏移量计算

### P2-ER2: ERDiagram.tsx — ER 位置写入 localStorage 未做容量防护
- 修复：捕获 QuotaExceededError 并 toast 提示

### P2-OL1: services/ollama.ts — 生产 base URL 为空字符串
- 修复：明确配置 VITE_OLLAMA_URL

### P2-SR1: data/fields/diagnosis.ts + device-ops.ts — tableComment 为空字符串
- 修复：补全表注释

## P3（8项）
- P3-PC1: PipelineCanvas.tsx — 工具栏添加 fitToView 按钮
- P3-KG1: KGCanvas.tsx — relationPicker 坐标系转换
- P3-KG2: KGConfigPanel.tsx — 节点名 onChange 无防抖
- P3-L1: MainLayout/Sidebar — 宽度硬编码提取常量
- P3-L2: Sidebar.tsx — Logo 本地化
- P3-D1: VisualDesigner.tsx — 统一使用 ddl-generator
- P3-D2: SqlEditor.tsx — 接入 trpc.db.executeQuery
- P3-SR1: topology.ts — 补充拓扑映射
- P3-OL1: ollama.ts — 流式请求添加 AbortSignal
- P3-DR1: dimensionReduction.ts — UMAP 参数改为 discriminated union
- P3-DDL1: ddl-generator.ts — 外键名超长截断

---

# 第九批（服务端代码审查 — 第七轮）

## P0（4项）

### P0-R7-01: .env.local.template — SKIP_AUTH=true 默认启用
- 修复：改为 SKIP_AUTH=false

### P0-R7-02: telemetry.service.ts — ClickHouse SQL 拼接注入
- 修复：使用参数化查询

### P0-R7-03: topology.service.ts — resetToDefault 使用 publicProcedure 可无认证删库
- 修复：改为 protectedProcedure + 管理员角色校验

### P0-R7-04: algorithm-service/server.ts — gRPC 明文传输无 TLS
- 修复：生产环境启用 TLS，开发环境保留 Insecure 用 NODE_ENV 保护

## P1（8项）

### P1-R7-01: server/types/mqtt.d.ts — MQTT 类型声明过于简化
- 修复：使用 mqtt 包内置类型

### P1-R7-02: monitoring.routes.ts — recentQueries 使用 publicProcedure
- 修复：改为 protectedProcedure

### P1-R7-03: healthCheck.job.ts — for...of 单服务失败中断后续检查
- 修复：每服务独立 try-catch + Promise.allSettled

### P1-R7-04: device-service/server.ts — ID 生成用 Date.now()+Math.random() 碰撞风险
- 修复：使用 nanoid/uuid

### P1-R7-05: algorithm-service/server.ts — 执行历史异步写入失败静默丢失
- 修复：先写历史再返回，或 fire-and-forget 失败时告警

### P1-R7-06: sdk/index.ts — 重试逻辑 AbortSignal 不重置
- 修复：每次重试创建新 AbortController

### P1-R7-07: topology.service.ts — getTopology 每次请求都调用 initializeDefaultTopology
- 修复：用应用级 flag 标记已初始化

### P1-R7-08: drizzle/schema.ts — conditionExpr 无格式验证 + threshold 用 int 存浮点
- 修复：添加语法验证 + threshold 改 double

## P2（10项）

### P2-R7-01: shared/_core/errors.ts — HttpError 兼容层应全局迁移至 NexusError
### P2-R7-02: shared/apiSpec.ts — RateLimitPresets 未在路由层落地
### P2-R7-03: shared/pipelineTypes.ts — 纯函数应拆分到 pipelineUtils.ts
### P2-R7-04: device-service/server.ts — DeviceGroup 空实现
### P2-R7-05: healthCheck.job.ts — SYSTEM_SERVICES 硬编码无法持久化
### P2-R7-06: topologyDiscovery.service.ts — TCP 探测用 HTTP fetch 模拟逻辑错误
### P2-R7-07: sdk/index.ts — 缺少 WebSocket/MQTT 实时数据支持
### P2-R7-08: drizzle/schema.ts — 1500+ 行应按领域拆分
### P2-R7-09: package.json — 工业协议库应移至 device-service 独立依赖
### P2-R7-10: server/routers.ts — 非核心路由应动态导入懒加载

---

# 第五批遗留（3项 P2）

### P2-E2: App.tsx — 旧路由 Redirect 无 deprecation warning
### P2-Tr1: AutoTrain.tsx — 训练任务 CRUD 无后端对接
### P2-CN1: ConditionNormalizer.tsx — 工况定义 Tab 使用 Mock
