# 全面真实化改造 TODO

## 需要新建的后端 trpc 路由

- [ ] `server/api/microservice.router.ts` — 微服务监控（读取 circuitBreaker/metricsCollector 真实数据）
- [ ] `server/api/security.router.ts` — 安全中心（Falco 事件、漏洞扫描、PKI、Vault）
- [ ] `server/api/dataStandard.router.ts` — 数据标准 CRUD
- [ ] `server/api/dataLabel.router.ts` — 数据标注 CRUD
- [ ] `server/api/dataInsight.router.ts` — 数据洞察（从真实数据库统计）
- [ ] `server/api/dataManage.router.ts` — 数据管理 CRUD
- [ ] `server/api/document.router.ts` — 文档管理 CRUD
- [ ] `server/api/agent.router.ts` — 智能体配置 CRUD
- [ ] `server/api/baseRule.router.ts` — 基础规则 CRUD
- [ ] `server/api/shm.router.ts` — 结构健康监测数据
- [ ] `server/api/kgOrchestrator.router.ts` — 知识图谱编排模板 CRUD

## CRITICAL 前端页面改造（27个）

### 微服务监控（3）
- [ ] MicroserviceDashboard.tsx → trpc.microservice.*
- [ ] ServiceMonitor.tsx → trpc.microservice.*
- [ ] ServicesOverview.tsx → trpc.microservice.*

### 安全中心（5）
- [ ] FalcoMonitor.tsx → trpc.security.*
- [ ] FalcoSecurityCenter.tsx → trpc.security.*
- [ ] SecurityScanner.tsx → trpc.security.*
- [ ] PkiManager.tsx → trpc.security.*
- [ ] VaultManager.tsx → trpc.security.*

### 设计工具（3）
- [ ] KGOrchestrator.tsx → trpc.kgOrchestrator.*
- [ ] PipelineManager.tsx → trpc.pipeline.*（已有API）
- [ ] SchemaDesigner.tsx → 已有 ERDiagramPage

### 业务数据（6）
- [ ] DataStandard.tsx → trpc.dataStandard.*
- [ ] DataLabel.tsx → trpc.dataLabel.*
- [ ] DataInsight.tsx → trpc.dataInsight.*
- [ ] DataManage.tsx → trpc.dataManage.*
- [ ] KnowledgeBase.tsx → trpc.knowledge.*（已有API）
- [ ] Documents.tsx → trpc.document.*

### 智能体（1）
- [ ] Agents.tsx → trpc.agent.*

### 配置管理（3）
- [ ] SHMDataPreview.tsx → trpc.shm.*
- [ ] DbManagement.tsx → trpc.database.*（已有API）
- [ ] ResourcesOverview.tsx → trpc.infrastructure.*（已有API）

### 状态管理（3）
- [ ] EnginesManager.tsx → trpc.monitoring.*（已有API）
- [ ] ModelsManager.tsx → trpc.monitoring.*（已有API）
- [ ] PluginsManager.tsx → trpc.monitoring.*（已有API）

### 其他（3）
- [ ] BaseRules.tsx → trpc.baseRule.*
- [ ] NotFound.tsx — 保持（404页面无需API）
- [ ] PlaceholderPage.tsx — 保持（通用组件）

## WARNING 前端页面修复（9个）
- [ ] ModelInference.tsx — 移除 mockFreqs
- [ ] PipelineEditor.tsx — templates 从 API 加载
- [ ] PerformanceOverview.tsx — modules 从 API 加载
- [ ] DeviceList.tsx — deviceTypeOptions 从 API 加载
- [ ] AlgorithmCategory.tsx — updated 从 API 加载
- [ ] SystemTopology.tsx — data 初始值从 API 加载
- [ ] AIChat.tsx — quickPrompts 可保留为 UI 配置
- [ ] Dashboard.tsx — quickActions 可保留为 UI 配置
- [ ] DatabaseWorkbench.tsx — COLUMN_TYPES 可保留为常量配置
