# Phase 3 世界模型增强 / 数字孪生系统工程重建 — TODO

## 审计结论
- 现有 WorldModel (621行)：物理引擎完整（7条方程），但缺乏状态同步、多设备管理、不确定性量化、蒙特卡洛仿真
- 现有 DigitalTwinView (387行)：前端展示型 demo，数据大量 Math.random()，缺乏真实数据链路
- 现有 pipeline.domain-router (181行)：Facade 返回硬编码仿真场景，runSimulation/startReplay 是空壳
- 设计文档 digital-twin-design.md：完整的商业级方案，需要按此实施

---

## P3-1: 世界模型核心增强 (world-model-enhanced.ts ~800行)
- [ ] 多设备实例管理（WorldModelRegistry：设备ID→WorldModel实例映射）
- [ ] 状态同步引擎（StateSyncEngine：DB快照↔内存状态双向同步）
- [ ] 不确定性量化（UncertaintyQuantifier：蒙特卡洛采样 + 置信区间）
- [ ] 物理方程导出接口（getKeyEquations / generatePhysicsExplanation）
- [ ] 剩余寿命预测（RUL Predictor：基于疲劳累积+腐蚀+S-N曲线）
- [ ] 状态快照持久化（自动写入 world_model_snapshots 表）
- [ ] AbortController + maxConcurrency 并发控制

## P3-2: 仿真推演引擎 (simulation-engine.ts ~600行)
- [ ] 仿真场景管理（CRUD + DB持久化到 simulation_scenarios 表）
- [ ] 仿真执行器（基于 WorldModel.predict + 参数覆盖 + 进度回调）
- [ ] What-if 分析（反事实推理封装 + 多参数组合）
- [ ] 多方案对比引擎（并行执行多场景 + 结果归一化对比）
- [ ] 蒙特卡洛仿真（N次采样 → 概率分布 → 风险评估）
- [ ] 仿真结果持久化（写入 world_model_predictions 表）

## P3-3: 历史回放引擎 (replay-engine.ts ~400行)
- [ ] 时间范围查询（从 realtime_telemetry 获取可回放范围）
- [ ] 多通道数据查询（按设备+时间段+通道+降采样分辨率）
- [ ] 事件叠加（device_alerts + cognition_sessions + condition_instances 事件标注）
- [ ] 异常片段定位（自动识别异常时间段）

## P3-4: 数据库表结构
- [ ] 新增 simulation_scenarios 表（Drizzle schema + SQL脚本）
- [ ] 新增 simulation_results 表（存储仿真执行结果）
- [ ] 新增 twin_sync_logs 表（状态同步日志）

## P3-5: 后端 tRPC 路由重建 (digital-twin.router.ts ~400行)
- [ ] getEquipmentTwinState — 设备完整孪生状态聚合
- [ ] listEquipmentTwins — 设备孪生概览列表
- [ ] simulation.create — 创建仿真场景
- [ ] simulation.execute — 执行仿真
- [ ] simulation.list — 列出仿真场景
- [ ] simulation.compare — 多方案对比
- [ ] replay.getTimeRange — 获取可回放时间范围
- [ ] replay.getData — 获取回放数据
- [ ] worldmodel.getConfig — 获取世界模型配置
- [ ] worldmodel.updateConfig — 更新世界模型配置
- [ ] worldmodel.getEquations — 获取物理方程列表
- [ ] 注册到 pipelineDomainRouter（替换现有 Facade 空壳）

## P3-6: 前端数字孪生界面重建 (DigitalTwinView.tsx ~800行)
- [ ] 设备状态面板：设备选择器 + 传感器实时数据 + 健康仪表盘 + 告警列表
- [ ] 仿真推演面板：场景列表 + 参数配置 + 执行 + 结果可视化(Chart.js)
- [ ] 历史回放面板：时间轴控制器 + 多通道折线图 + 事件标注
- [ ] 世界模型配置面板：物理参数编辑 + 方程展示 + 预测验证

## P3-7: 集成与验证
- [ ] TypeScript 编译零错误
- [ ] 前后端联调验证
- [ ] Git 推送
