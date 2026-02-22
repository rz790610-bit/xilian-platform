# Phase 3 完整实现 — 修复清单

## P0 — 必须立即修复
- [ ] 1. 安装 KaTeX，WorldModelPage 渲染 7 条物理方程
- [ ] 2. SimulationPage 添加 P5-P95 带状置信区间图
- [ ] 3. 前端连接 tRPC Subscription（设备状态实时更新）
- [ ] 4. 种子数据：03-v5-seed-data.sql 新增 Phase 3 数据
- [ ] 5. 删除旧 DigitalTwinView.tsx + App.tsx 死代码 + api-gap-analysis.md

## P1 — 高优先级
- [ ] 6. 数据库 ALTER TABLE 补全 9 个缺失字段 + Drizzle schema 更新
- [ ] 7. DBSCAN 异常聚类（后端 replay-engine + 前端高亮）
- [ ] 8. ReplayPage 事件标注（垂直线 + tooltip）+ 播放/暂停/倍速控制
- [ ] 9. 写操作 RBAC 保护（publicProcedure → protectedProcedure）
- [ ] 10. 审计日志实现

## P2 — 中优先级
- [ ] 11. 拆分 pipeline.domain-router.ts 为 4 个子路由
- [ ] 12. 抽离 simulation-engine.ts 独立文件
- [ ] 13. 抽离 replay-engine.ts 独立文件
- [ ] 14. BullMQ 异步仿真任务队列
- [ ] 15. OTel 13 个指标埋点

## P3 — 低优先级
- [ ] 16. Grok Tool 注册（generate_simulation_params, explain_physics_violation）
- [ ] 17. HybridOrchestrator 集成 WorldModel
- [ ] 18. twin_sync_logs RANGE PARTITION
- [ ] 19. 集成测试
- [ ] 20. Grafana Dashboard JSON
- [ ] 21. 提交全部代码到 GitHub
