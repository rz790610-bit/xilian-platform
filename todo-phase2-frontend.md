# Phase 2 认知层推理引擎增强 — 前端可视化界面 + API 路由

## 后端 API 路由
- [ ] 创建 `server/domains/cognition/reasoning.router.ts` — Phase 2 推理引擎 tRPC 路由
  - [ ] `getEngineConfig` — 获取推理引擎全部配置（Orchestrator/CausalGraph/ExperiencePool/PhysicsVerifier/FeedbackLoop）
  - [ ] `updateEngineConfig` — 更新推理引擎配置
  - [ ] `getCausalGraph` — 获取因果图节点和边
  - [ ] `getCausalPaths` — 因果路径追溯
  - [ ] `getExperiencePool` — 获取经验池统计和最近记录
  - [ ] `searchExperience` — 搜索经验
  - [ ] `getFeedbackStats` — 获取反馈环统计
  - [ ] `getRevisionLog` — 获取修订日志
  - [ ] `rollbackRevision` — 回滚修订
  - [ ] `getObservabilityMetrics` — 获取可观测性 12 项指标
  - [ ] `getShadowModeStats` — 获取 Shadow Mode 统计
  - [ ] `forcePromote` / `forceRollback` — 手动晋升/回退
- [ ] 注册到 `cognitionDomainRouter`

## 前端可视化组件
- [ ] `ReasoningEngineConfig.tsx` — 引擎配置管理面板
- [ ] `CausalGraphView.tsx` — 因果图可视化（交互式图谱）
- [ ] `ExperiencePoolView.tsx` — 经验池管理
- [ ] `ReasoningTraceView.tsx` — 推理过程追踪（6 阶段流水线）
- [ ] `FeedbackMonitorView.tsx` — 知识反馈监控

## 集成
- [ ] 在 CognitiveDashboard.tsx 中新增 5 个 Tab
- [ ] 编译验证通过
- [ ] Git 推送
