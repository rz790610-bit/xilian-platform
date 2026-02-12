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

## 二、待完成

### 后端 service + router
- [ ] 新建 plugin.db.service.ts（pluginRegistry/Instances/Events CRUD）
- [ ] 新建 governance.db.service.ts（dataGovernanceJobs/dataLineage/minioCleanupLog CRUD）
- [ ] 新建 ops.db.service.ts（auditLogs/alertRules/dataExportTasks CRUD）
- [ ] 新建 schedule.db.service.ts（scheduledTasks/rollbackTriggers CRUD）
- [ ] 扩展 config.service.ts（systemConfigs/configChangeLogs）
- [ ] 扩展 asset.service.ts（sensorMpMapping）
- [ ] 扩展 data.service.ts（anomalyDetections）
- [ ] 扩展 database.router.ts 注册全部新路由

### 前端集成
- [ ] DatabaseWorkbench 完成 Schema/ER/Visual 三个新 Tab 渲染
- [ ] Schema Registry 与 Drizzle 72 表精确对齐
- [ ] 导航路由确认可达

### 验证
- [ ] TypeScript 编译通过
- [ ] 全链路完整

## 三、Docker引擎生命周期管理（当前任务）

- [ ] 后端：dockerManager.service.ts - 通过Docker Engine API管理容器
- [ ] 后端：docker.router.ts - tRPC路由（list/start/stop/restart/inspect）
- [ ] 后端：注册到appRouter
- [ ] 前端：Infrastructure页面增加引擎管理面板（启用/禁用/重启按钮）
- [ ] 前端：实时状态轮询 + 操作反馈
- [ ] 集成storageHealth与docker状态
- [ ] 提交并推送代码

## 四、页面修复（当前任务）

- [ ] 插件管理页面问题排查与修复
- [ ] ClickHouse监控页面问题排查与修复
