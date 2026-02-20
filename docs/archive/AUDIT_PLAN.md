# 深度审计删除计划

## 一、前端页面删除

### 1. 运维中心 (operations/) — 全部删除
- `client/src/pages/operations/RuleVersions.tsx` → trpc.opsDevice.ruleVersions
- `client/src/pages/operations/DataExport.tsx` → trpc.opsGovernance.dataExport
- `client/src/pages/operations/RollbackTriggers.tsx` → trpc.opsDevice.rollbackTriggers
- `client/src/pages/operations/PluginManager.tsx` → trpc.opsPlugin.* (也在平台管理导航中)

### 2. 业务应用 (business/) — 全部删除
- `client/src/pages/business/KnowledgeGraphPage.tsx` → trpc.bizKnowledge.*
- `client/src/pages/business/SyntheticDatasets.tsx` → trpc.opsGovernance.syntheticDatasets
- `client/src/pages/business/DataPermissions.tsx` → trpc.platformSystem.dataPermissions
- `client/src/pages/business/ApprovalWorkflows.tsx` → trpc.platformSystem.approval

### 3. 可观测性页面 — 删除
- `client/src/pages/settings/status/Observability.tsx` → trpc.observability.* (依赖Prometheus/ES/Jaeger，ES和Jaeger未部署)

### 4. ClickHouse 监控 — 保留 (ClickHouse在docker-compose.yml中)
- `client/src/pages/monitoring/ClickHouseDashboard.tsx` → trpc.bizMonitoring.clickhouseDashboard (ClickHouse已部署)

## 二、后端路由/服务删除

### 1. 运维中心后端 (server/operations/) — 全部删除
- `server/operations/routes/device.routes.ts` (opsDevice)
- `server/operations/routes/governance.routes.ts` (opsGovernance)
- `server/operations/routes/plugin.routes.ts` (opsPlugin)
- `server/operations/services/device-config.service.ts`
- `server/operations/services/governance-job.service.ts`

### 2. 业务应用后端 (server/business/) — 部分删除
- `server/business/routes/assets.routes.ts` (bizAssets — 0前端调用)
- `server/business/routes/diagnosis.routes.ts` (bizDiagnosis — 0前端调用)
- `server/business/routes/knowledge.routes.ts` (bizKnowledge — 只被KnowledgeGraphPage调用)
- `server/business/services/asset-tree.service.ts`
- `server/business/services/diagnosis.service.ts`
- `server/business/services/knowledge-base.service.ts`
- **保留**: `server/business/routes/monitoring.routes.ts` (bizMonitoring — 被ClickHouseDashboard调用)
- **保留**: `server/business/services/telemetry.service.ts` (被monitoring.routes.ts引用)

### 3. 死代码后端路由
- `server/api/monitoring.router.ts` — 0前端调用，完全死代码

### 4. platformSystem 子路由清理
- 删除 `dataPermissions` 子路由 (只被business/DataPermissions调用)
- 删除 `approval` 子路由 (只被business/ApprovalWorkflows调用)

## 三、routers.ts 路由注册清理
删除以下注册:
- `opsDevice: deviceRoutes`
- `opsGovernance: governanceRoutes`
- `opsPlugin: pluginRoutes`
- `bizAssets: assetsRoutes`
- `bizDiagnosis: diagnosisRoutes`
- `bizKnowledge: knowledgeRoutes`
- `monitoring: monitoringRouter`

## 四、导航清理 (navigation.ts)
- 删除整个"运维中心"section
- 删除整个"业务应用"section
- 从"安全运维"中移除: 数据权限、审批流程
- 从"状态监控"中移除: 插件管理、可观测性

## 五、App.tsx 路由清理
删除所有 /operations/*, /business/* 路由
删除 Observability 路由

## 六、保留的页面 (有真实数据源)
- Infrastructure.tsx → docker.*/infrastructure.* (Docker API)
- PerformanceOverview.tsx → outbox/saga/sampling/dedup/replica/graphQuery (真实后端)
- SystemTopology.tsx → topology.* (真实数据)
- MicroserviceDashboard.tsx → microservice.* (真实数据)
- FalcoSecurityCenter.tsx → docker.* (Docker API)
- ClickHouseDashboard.tsx → bizMonitoring.clickhouseDashboard (ClickHouse已部署)
- AlertRules.tsx → platformSystem.alertRules (DB)
- AuditLogs.tsx → platformSystem.auditLogs (DB)
- ScheduledTasks.tsx → platformSystem.scheduledTasks (DB)
- 所有 settings/design/* 页面 (有真实后端)
- 所有 settings/config/* 页面 (有真实后端)
- AdaptiveSampling/DeduplicationManager/OutboxManager/SagaManager/ReadReplicaManager (有真实后端)
