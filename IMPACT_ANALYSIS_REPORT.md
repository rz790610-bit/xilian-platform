# 全站去重重构 — 完整影响分析报告

> 分析日期：2026-02-08  
> 分析范围：前端导航/路由/页面 → tRPC Router → Service → 数据库/基础设施客户端  
> 目标：确保零断链、零回归

---

## 一、待删除页面的完整依赖链分析

### 1.1 纯 Mock/静态页面（8个）— 安全删除

| 页面组件 | 行数 | tRPC 调用 | fetch/axios | 数据来源 | 安全评估 |
|---|---|---|---|---|---|
| ResourcesOverview | 71 | 无 | 无 | 纯 Mock 数据 | ✅ 安全删除 |
| DbManagement | 69 | 无 | 无 | 纯 Mock 数据 | ✅ 安全删除 |
| PluginsManager | 60 | 无 | 无 | 纯 Mock 数据 | ✅ 安全删除 |
| EnginesManager | 61 | 无 | 无 | 纯 Mock 数据 | ✅ 安全删除 |
| ModelsManager | 70 | 无 | 无 | 纯 Mock 数据 | ✅ 安全删除 |
| ServicesOverview | 78 | 无 | 无 | 纯 Mock 数据 | ✅ 安全删除 |
| VaultManager | 89 | 无 | 无 | 纯 Mock 数据 | ✅ 安全删除 |
| PkiManager | 90 | 无 | 无 | 纯 Mock 数据 | ✅ 安全删除 |

**结论：** 这 8 个页面无任何后端调用，仅在 `App.tsx`（Route）和各自的 `index.ts`（export）中被引用。删除后只需同步清理 App.tsx 的 import/Route 和 index.ts 的 export。

### 1.2 有后端依赖的页面（2个）— 需谨慎处理

#### SecurityScanner（303行）
- **tRPC 调用：** 无
- **fetch/axios：** 无（代码中出现 "axios" 仅为 Mock 漏洞数据中的包名）
- **数据来源：** 纯 Mock 安全扫描结果
- **结论：** ✅ 安全删除，无后端依赖

#### SmartMonitoring（905行）— 核心分析对象
- **tRPC 调用（7个）：**
  - `trpc.monitoring.getDashboard.useQuery()` — 综合仪表盘数据
  - `trpc.monitoring.getRealDashboard.useQuery()` — 真实监控数据
  - `trpc.monitoring.togglePlugin.useMutation()` — 插件启停
  - `trpc.monitoring.uninstallPlugin.useMutation()` — 插件卸载
  - `trpc.monitoring.controlEngine.useMutation()` — 引擎控制
  - `trpc.monitoring.executeDatabaseAction.useMutation()` — 数据库操作
  - `trpc.monitoring.acknowledgeAlert.useMutation()` — 告警确认

---

## 二、monitoring Router 完整调用链

### 2.1 前端 → Router → Service → 基础设施

```
SmartMonitoring.tsx (唯一前端消费者)
    ↓
monitoring.router.ts (25个procedure)
    ↓
monitoring.service.ts (EnhancedMonitoringService)
    ↓
├── databaseMonitor.ts → MySQL(getDb/drizzle) + Redis(redisClient) + ClickHouse + Qdrant
├── systemMonitor.ts → systeminformation (真实系统指标)
└── healthChecker.ts → HTTP/TCP 健康检查 (Ollama等服务)
```

### 2.2 monitoring Router 的 25 个 Procedure 使用情况

| Procedure | 被引用文件数 | 引用者 |
|---|---|---|
| getDashboard | 1 | SmartMonitoring.tsx |
| getRealDashboard | 1 | SmartMonitoring.tsx |
| togglePlugin | 1 | SmartMonitoring.tsx |
| uninstallPlugin | 1 | SmartMonitoring.tsx |
| controlEngine | 1 | SmartMonitoring.tsx |
| executeDatabaseAction | 1 | SmartMonitoring.tsx |
| acknowledgeAlert | 1 | SmartMonitoring.tsx |
| getDatabaseStatus | 0 | 无引用 |
| getRealDatabaseStatus | 0 | 无引用 |
| getDatabaseByType | 0 | 无引用 |
| getPluginStatus | 0 | 无引用 |
| getPluginById | 0 | 无引用 |
| getEngineStatus | 0 | 无引用 |
| getEngineById | 0 | 无引用 |
| getSystemResources | 0 | 无引用 |
| getRealSystemResources | 0 | 无引用 |
| getDetailedSystemInfo | 0 | 无引用 |
| getServiceHealth | 0 | 无引用 |
| getRealServiceHealth | 0 | 无引用 |
| getServiceHealthByName | 0 | 无引用 |
| getAlerts | 0 | 无引用 |
| deleteAlert | 0 | 无引用 |
| resolveAlert | 0 | 无引用 |
| startMonitoring | 0 | 无引用 |
| stopMonitoring | 0 | 无引用 |

**关键发现：** monitoring Router 的 **全部 25 个 procedure** 仅被 SmartMonitoring.tsx 使用（其中 7 个被调用，18 个完全无前端引用）。

### 2.3 monitoring 后端数据源分析

| 数据源 | 连接方式 | 是否真实连接 |
|---|---|---|
| MySQL | `getDb()` + Drizzle ORM + `sql` | ✅ 真实连接 |
| Redis | `redisClient` | ✅ 真实连接 |
| ClickHouse | `getClickHouseClient()` | ✅ 真实连接 |
| Qdrant | `QdrantClient` | ✅ 真实连接 |
| 系统资源 | `systeminformation` | ✅ 真实系统指标 |
| 服务健康 | HTTP/TCP 探针 | ✅ 真实健康检查 |

**重要：** monitoring 服务连接真实基础设施，是平台中真正有价值的监控能力。

---

## 三、ops Router 完整调用链

### 3.1 前端 → Router → Service → 数据源

```
OpsDashboard.tsx (唯一前端消费者)
    ↓
ops.router.ts (40+ procedures)
    ↓
├── dashboardService.ts → 全部 Mock 数据（无真实DB连接）
├── automationService.ts → 全部 Mock 数据（无真实DB连接）
└── edgeComputingService.ts → 全部 Mock 数据（无真实DB连接）
```

### 3.2 OpsDashboard 使用的 16 个 tRPC 调用

| 调用 | 类型 | 后端 Service | 数据源 |
|---|---|---|---|
| ops.getClusterOverview | Query | DashboardService | Mock |
| ops.getStorageOverview | Query | DashboardService | Mock |
| ops.getDataFlowOverview | Query | DashboardService | Mock |
| ops.getApiGatewayOverview | Query | DashboardService | Mock |
| ops.getSecurityPosture | Query | DashboardService | Mock |
| ops.listScalingPolicies | Query | AutoScalingService | Mock |
| ops.listHealingRules | Query | SelfHealingService | Mock |
| ops.listBackupPolicies | Query | BackupRecoveryService | Mock |
| ops.listRollbackPolicies | Query | RollbackService | Mock |
| ops.listEdgeNodes | Query | EdgeInferenceService | Mock |
| ops.listEdgeModels | Query | EdgeInferenceService | Mock |
| ops.listEdgeGateways | Query | EdgeGatewayService | Mock |
| ops.triggerScaling | Mutation | AutoScalingService | Mock |
| ops.triggerHealing | Mutation | SelfHealingService | Mock |
| ops.triggerBackup | Mutation | BackupRecoveryService | Mock |
| ops.triggerRollback | Mutation | RollbackService | Mock |

**关键发现：** ops 的 3 个 Service 文件（dashboardService/automationService/edgeComputingService）**全部使用 Mock 数据**，无 `getDb()`、`drizzle`、`schema` 引用。

---

## 四、边缘计算模块分析

### 4.1 EdgeNodes.tsx（208行）
- **tRPC 调用：** 无（纯前端 Mock 数据）
- **当前问题：** 4 个路由（/edge/nodes、/edge/inference、/edge/gateway、/edge/tsn）全部指向同一个 EdgeNodes 组件，但组件内无 Tab 切换逻辑

### 4.2 ops Router 中的边缘计算 Procedure
- `ops.listEdgeNodes` / `ops.getEdgeNode` / `ops.registerEdgeNode`
- `ops.listEdgeModels` / `ops.deployEdgeModel` / `ops.infer`
- `ops.listEdgeGateways` / `ops.getEdgeGateway` / `ops.createEdgeGateway` / `ops.connectGateway` / `ops.disconnectGateway`
- `ops.listTSNConfigs` / `ops.createTSNConfig`
- `ops.list5GConfigs` / `ops.create5GConfig`
- `ops.runLatencyTest` / `ops.getNetworkMetrics`

**结论：** 边缘计算的后端 API 已经非常完善（17+ procedures），但前端 EdgeNodes 组件完全没有调用它们。重构应让 EdgeNodes 接入 ops Router 的边缘计算 API。

---

## 五、交叉引用与文件依赖总结

### 5.1 需要修改的文件清单

| 文件 | 修改类型 | 说明 |
|---|---|---|
| `client/src/config/navigation.ts` | 删除入口 | 删除 10 个重复/Mock 导航项 |
| `client/src/App.tsx` | 删除 import + Route | 删除 10 个页面的 import 和 Route 定义 |
| `client/src/pages/settings/config/index.ts` | 删除 export | 移除 ResourcesOverview、DbManagement |
| `client/src/pages/settings/status/index.ts` | 删除 export | 移除 PluginsManager、EnginesManager、ModelsManager、ServicesOverview |
| `client/src/pages/settings/security/index.ts` | 删除/修改 export | 移除 SmartMonitoring、SecurityScanner、VaultManager、PkiManager |

### 5.2 不需要修改的后端文件

| 文件 | 原因 |
|---|---|
| `server/routers.ts` | monitoring/ops Router 注册保留（API 仍可用） |
| `server/api/monitoring.router.ts` | 保留完整，供重构后的 OpsDashboard 调用 |
| `server/api/ops.router.ts` | 保留完整，供重构后的 OpsDashboard 和 EdgeNodes 调用 |
| `server/services/monitoring.service.ts` | 真实监控能力，必须保留 |
| `src/ops/**/*Service.ts` | Mock 服务，保留供后续接入真实基础设施 |
| 所有数据库 Schema | 不涉及任何修改 |
| 所有 v1.9 性能优化模块 | 不涉及任何修改 |

---

## 六、重构方案（修订版）

### 方案 A：OpsDashboard 重构
- **现状：** 7-Tab 大杂烩（集群/存储/数据流/网关/安全/自动化/边缘），全部 Mock 数据
- **方案：** 精简为 5-Tab 运维概览（集群/存储/数据流/网关/安全），保留所有 tRPC 调用
- **吸收 SmartMonitoring：** 将 monitoring Router 的真实监控能力（数据库状态、系统资源、服务健康、告警）整合到 OpsDashboard 中
- **移除：** 自动化 Tab（扩缩容/自愈/备份/回滚保留在 ops Router 中，前端暂不展示）
- **移除：** 边缘 Tab（移到独立的 EdgeNodes 组件）
- **后端影响：** 零修改。ops Router 和 monitoring Router 全部保留

### 方案 B：SmartMonitoring 合并
- **现状：** 5-Tab（概览/数据库/插件/引擎/服务），调用 monitoring Router 的真实 API
- **方案：** 将其核心功能（真实数据库监控、系统资源、服务健康）合并到 OpsDashboard 的新 Tab 中
- **后端影响：** 零修改。monitoring Router 保留，只是前端消费者从 SmartMonitoring 变为 OpsDashboard

### 方案 C：FalcoMonitor → FalcoSecurityCenter 重命名
- **现状：** 纯 Mock 数据，无后端调用
- **方案：** 合并 SecurityScanner 的安全扫描功能，重命名为 FalcoSecurityCenter
- **后端影响：** 零修改

### 方案 D：EdgeNodes 重构
- **现状：** 纯 Mock 数据，4 路由指向同一组件但无 Tab 切换
- **方案：** 改为 4-Tab（节点/推理/网关/TSN），接入 ops Router 的边缘计算 API
- **后端影响：** 零修改。ops Router 的边缘计算 procedure 已就绪

---

## 七、风险评估

| 风险项 | 等级 | 说明 | 缓解措施 |
|---|---|---|---|
| monitoring Router 断链 | 低 | SmartMonitoring 删除后，monitoring API 无前端消费者 | OpsDashboard 重构时接入 monitoring API |
| ops Router 边缘 procedure 断链 | 低 | OpsDashboard 移除边缘 Tab 后，边缘 API 无前端消费者 | EdgeNodes 重构时接入 ops 边缘 API |
| 数据库表影响 | 无 | 所有 Service 层均为 Mock 数据或通过 lib/clients 连接 | 不涉及 Schema 修改 |
| 后端 Router 注册影响 | 无 | routers.ts 不做任何修改 | 所有 API 端点保持可用 |
| Legacy 路由重定向失效 | 低 | 部分 Redirect 指向被删除的路由 | 更新 Redirect 目标 |

---

## 八、执行检查清单

### 前端修改（6 个文件）
- [ ] `navigation.ts` — 删除 10 个导航入口
- [ ] `App.tsx` — 删除 10 个 import + Route，更新 Redirect
- [ ] `config/index.ts` — 删除 2 个 export
- [ ] `status/index.ts` — 删除 4 个 export
- [ ] `security/index.ts` — 删除 4 个 export，添加 FalcoSecurityCenter

### 页面重构（3 个文件）
- [ ] `OpsDashboard.tsx` — 精简 Tab + 接入 monitoring API
- [ ] `FalcoMonitor.tsx` → `FalcoSecurityCenter.tsx` — 合并安全扫描
- [ ] `EdgeNodes.tsx` — 4-Tab + 接入 ops 边缘 API

### 后端修改
- [ ] **无** — 所有 Router、Service、Schema 保持不变

### 验证
- [ ] `pnpm build` 无报错
- [ ] 所有保留路由可访问
- [ ] tRPC 调用链完整
- [ ] 被删除路由返回 404 或重定向
