# 数字孪生系统工程重建 TODO

## 设计原则
- 商业版标准，不是 demo
- 所有数据来自真实数据库查询
- 与平台已有模块（资产管理、传感器、算法引擎）深度集成
- 一键启用机制，用户可控

## Phase 1: 审计数据基础
- [ ] 检查 equipment_profiles 表结构和数据
- [ ] 检查 sensor_readings / realtime_telemetry 表结构
- [ ] 检查 cognition_sessions / cognition_dimension_results 表结构
- [ ] 检查 world_model_snapshots / world_model_predictions 表结构
- [ ] 检查 condition_profiles / condition_instances 表结构
- [ ] 检查 asset_nodes / asset_sensors / asset_measurement_points 表结构
- [ ] 确定仿真推演的数据模型

## Phase 2: 扩展后端 API
- [ ] 设备实时状态聚合（设备 + 传感器 + 最新读数 + 健康度 + 告警）
- [ ] 仿真场景 CRUD + 执行引擎
- [ ] 历史回放数据查询（时间范围 + 多通道 + 事件标注）
- [ ] 世界模型快照查询

## Phase 3: 设备状态面板
- [ ] 设备选择器（从 equipment_profiles 加载）
- [ ] 设备模型可视化（SVG 设备示意图 + 测点位置标注）
- [ ] 传感器实时数据映射（温度/应力/振动/位移等通道）
- [ ] 健康度仪表盘（综合评分 + 各维度雷达图）
- [ ] 异常高亮（超阈值传感器红色标注 + 告警列表）
- [ ] 认知诊断结果关联展示

## Phase 4: 仿真推演面板
- [ ] 场景配置器（工况选择 + 参数调节滑块）
- [ ] What-if 分析（修改参数 → 预测结果）
- [ ] 多方案对比（并排展示不同参数下的预测结果）
- [ ] 推演结果可视化（时序图 + 概率分布 + 风险评估）
- [ ] 仿真历史记录

## Phase 5: 历史回放面板
- [ ] 时间轴控制器（播放/暂停/快进/倒退/跳转）
- [ ] 多通道数据同步回放（温度+应力+振动同步展示）
- [ ] 关键事件标注（告警、诊断、工况切换等事件在时间轴上标注）
- [ ] 异常片段定位（一键跳转到异常时间段）
- [ ] 回放速度控制
