# PortAI Nexus V4 融合 — 统筹盘点

## 一、已完成

### 后端 Drizzle 层
- [x] schema.ts: 72 张表（原 54 + 新增 18）
- [x] 9 张现有表补充 46 个 V4.0 新字段
- [x] relations.ts: 226 行完整关系定义

### 前端数据层 + 设计器组件（已迁移）
- [x] Schema Registry 70 表 / 972 字段 / 14 域
- [x] 7 个设计器组件 + DDL 工具
- [x] useTableSchema hook
- [x] DatabaseOverview 添加统计卡片
- [x] DatabaseWorkbench 添加 lazy import
- [x] navigation.ts 添加 Schema 入口

### 后端 service + router（已通过三层架构路由实现）
- [x] plugin CRUD → server/operations/routes/plugin.routes.ts (registryRouter + instancesRouter + eventsRouter)
- [x] governance CRUD → server/operations/routes/governance.routes.ts (dataExportRouter + lineageRouter + syntheticDatasetsRouter)
- [x] ops CRUD → server/api/ops.router.ts (仪表盘/自动化/边缘计算)
- [x] schedule CRUD → server/platform/routes/system.routes.ts (scheduledTasksRouter)
- [x] alertRules CRUD → server/platform/routes/system.routes.ts (alertRulesRouter)
- [x] auditLogs CRUD → server/platform/routes/system.routes.ts (auditLogsRouter)
- [x] configChangeLogs → server/platform/routes/system.routes.ts (dataPermissionsRouter.configChangeLogs)
- [x] database.router.ts 注册全部路由

### 接入层协议适配器（15个生产级实现）
- [x] BaseAdapter 抽象基类 + 统一错误体系 + 连接池 + 指标收集
- [x] 15个协议适配器全部真实实现（MQTT/OPC-UA/Modbus/MySQL/PG/CH/InfluxDB/Redis/Neo4j/Qdrant/Kafka/MinIO/HTTP/gRPC/WebSocket）
- [x] 前端 AccessLayerManager 高级配置可折叠区域 + JSON 字段 + 分组渲染

## 二、待完成

### 前端集成
- [x] DatabaseWorkbench 完成 Schema/ER/Visual 三个新 Tab 渲染
  - SchemaTableManagement (208行) + DataBrowser (348行) + SqlEditor (312行) + StatusBar + ExportDDLDialog (246行)
  - ERDiagram (557行) 完整 ER 关系图
  - VisualDesigner (507行) 可视化设计器
- [x] Schema Registry 与 Drizzle 72 表精确对齐
- [x] 导航路由确认可达

### 验证
- [x] TypeScript 编译通过（零错误）
- [x] 全链路完整（代码层面，运行时需数据库/ClickHouse/Docker 连接）

### Docker引擎生命周期管理（已完成）
- [x] 后端：dockerManager.service.ts (633行) - Docker Engine API 管理
- [x] 后端：docker.router.ts (117行) - tRPC路由
- [x] 后端：已注册到appRouter
- [x] 前端：Infrastructure页面 DockerEnginePanel 面板（启用/禁用/重启/日志/统计）

## 三、当前任务：协议注册中心自动同步机制

### 核心问题
适配器层更新后，上层 API/类型/前端未自动同步，导致前端只显示 MQTT

### 待完成
- [ ] 后端：适配器注册表新增 listProtocols / listCategories API，自动从注册表生成
- [ ] 后端：protocolSchema API 直接从注册表读取，新增适配器自动可用
- [ ] 前端：移除硬编码 PROTOCOL_META/PROTOCOL_CATEGORIES，改为从 API 动态获取
- [ ] 前端：新建连接器对话框动态渲染协议列表和配置表单
- [ ] 全链路验证：15个协议全部可见可配置

## 四、已完成排查任务

### Pipeline 编排界面排查
- [x] Pipeline 编排页面代码完整（PipelineEditor 679行 + 9个子组件 + Store + 共享类型 1005行）
- [x] 路由 /settings/design/pipeline 已注册，导航栏有入口
- [x] tRPC 路由 pipeline.list/get/save/run/delete 完整实现 (416行)
- [x] 代码层面无结构性问题，运行时需数据库连接支持

### 页面修复
- [x] 插件管理页面代码完整（tRPC 调用路径匹配，运行时需数据库支持）
- [x] ClickHouse 监控页面代码完整（tRPC 调用路径匹配，运行时需 ClickHouse 连接）

## 五、算法库底层平台搭建

### Phase 1: 逻辑设计文档
- [ ] 分析现有 BaseRegistry 架构 + Pipeline 节点类型系统 + model router 接口模式
- [ ] 输出算法应用全流程设计文档（API + 数据接口 + 配置逻辑 + 执行引擎）

### Phase 2: 算法注册中心
- [ ] 创建 algorithm.registry.ts + 6 大分类内置算法定义

### Phase 3: 算法服务层
- [ ] 创建 algorithm.service.ts（CRUD + 执行引擎 + 基准测试 + 版本管理）

### Phase 4: tRPC 路由
- [ ] 创建 algorithm.router.ts（完整 API 接口）

### Phase 5: 集成
- [ ] Pipeline 节点自动注册
- [ ] 模型中心联动
- [ ] KG 算子对接

### Phase 6: 注册 + 验证
- [ ] 注册到 appRouter + RegistryManager
- [ ] TypeScript 编译通过

### Phase 7: 提交
- [ ] git commit + push
