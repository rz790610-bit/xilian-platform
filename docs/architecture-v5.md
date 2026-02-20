# 西联平台 v5.0 深度进化 — 架构文档

## 一、模块清单

| 层级 | 模块 | 路径 | 核心类 | 职责 |
|------|------|------|--------|------|
| L0 | 数据契约层 | `contracts/` | `EventSchemaRegistry`, `PhysicsFormulas` | Schema 注册、事件校验、物理公式 |
| L1 | 感知层 | `perception/` | `PerceptionPipeline`, `RingBuffer`, `DSFusionEngine` | 采集→融合→编码 |
| L2 | 认知诊断层 | `cognition/diagnosis/` | `FusionDiagnosisService`, `WorldModel` | 四维诊断 + 状态预测 |
| L2 | Grok 推理 | `cognition/grok/` | `GrokReasoningService`, `GrokToolCalling` | 12 工具 + ReAct 循环 |
| L2 | 安全护栏 | `cognition/safety/` | `GuardrailEngine` | 12 条护栏规则 |
| L3 | 知识层 | `knowledge/` | `KnowledgeGraphEngine`, `FeatureRegistry`, `ChainReasoningEngine` | KG + 特征注册 + 链式推理 |
| L4 | 进化层 | `evolution/` | `EvolutionFlywheel`, `ShadowEvaluator`, `ChampionChallenger` | 5 步自进化闭环 |
| L5 | 工具层 | `tooling/` | `ToolFramework` | 7 个内置工具 + 注册框架 |
| L6 | 管线层 | `pipeline/` | `PipelineDAGEngine` | DAG 编排 + 拓扑排序 + 并行执行 |
| L7 | 数字孪生 | `digital-twin/` | `DigitalTwinEngine` | 状态同步 + 仿真 + 回放 |
| L8 | 仪表盘 | `dashboard/` | `CognitiveDashboardService` | 四维可视化 + 告警管理 |
| L9 | 编排器 | `orchestrator/` | `PlatformOrchestrator` | 模块生命周期 + 闭环编排 |

## 二、依赖关系

```
orchestrator
  ├── dashboard
  │     ├── cognition/diagnosis
  │     ├── cognition/safety
  │     └── evolution
  ├── pipeline
  │     ├── perception
  │     ├── cognition
  │     ├── guardrail
  │     └── evolution
  ├── digital-twin
  │     ├── perception
  │     └── cognition
  ├── evolution
  │     ├── cognition
  │     ├── knowledge
  │     └── tooling
  ├── cognition
  │     ├── perception
  │     ├── knowledge
  │     └── contracts
  ├── perception
  │     └── contracts
  ├── knowledge
  │     └── contracts
  └── contracts (无依赖)
```

## 三、闭环数据流

```
传感器数据 → RingBuffer(100kHz) → AdaptiveSampler → DSFusion → StateVectorEncoder
                                                                      │
                                                                      ▼
                                                              FusionDiagnosis
                                                              ┌─────────────┐
                                                              │ 安全维度    │
                                                              │ 健康维度    │
                                                              │ 效率维度    │
                                                              │ 预测维度    │
                                                              └─────┬───────┘
                                                                    │
                                                                    ▼
                                                            GuardrailEngine
                                                            ┌─────────────┐
                                                            │ 安全规则 ×5 │
                                                            │ 健康规则 ×4 │
                                                            │ 效率规则 ×3 │
                                                            └─────┬───────┘
                                                                  │
                                                                  ▼
                                                          EvolutionFlywheel
                                                          ┌───────────────┐
                                                          │ 数据发现      │
                                                          │ 假设生成      │
                                                          │ 影子验证      │
                                                          │ 金丝雀部署    │
                                                          │ 知识结晶      │
                                                          └───────┬───────┘
                                                                  │
                                                                  ▼
                                                        CognitiveDashboard
```

## 四、新增数据库表

共 24 张表，按域分组：

| 域 | 表名 | 用途 |
|----|------|------|
| 感知 | `condition_profiles` | 工况配置 |
| 感知 | `sensor_channels` | 传感器通道注册 |
| 感知 | `sampling_configs` | 采样策略配置 |
| 感知 | `state_vectors` | 状态向量存储 |
| 诊断 | `diagnosis_reports` | 诊断报告 |
| 诊断 | `diagnosis_dimensions` | 诊断维度详情 |
| 诊断 | `world_model_predictions` | 世界模型预测 |
| 诊断 | `counterfactual_results` | 反事实推理结果 |
| 护栏 | `guardrail_rules` | 护栏规则定义 |
| 护栏 | `guardrail_violations` | 违规记录 |
| 护栏 | `guardrail_actions` | 护栏动作日志 |
| 进化 | `shadow_evaluations` | 影子评估结果 |
| 进化 | `champion_models` | 冠军模型注册 |
| 进化 | `canary_deployments` | 金丝雀部署 |
| 进化 | `crystallized_knowledge` | 结晶知识 |
| 进化 | `flywheel_cycles` | 飞轮周期记录 |
| 知识 | `kg_triples` | 知识图谱三元组 |
| 知识 | `kg_entities` | 知识图谱实体 |
| 知识 | `feature_definitions` | 特征注册表 |
| 知识 | `feature_importance_history` | 特征重要性历史 |
| 工具 | `tool_definitions` | 工具定义 |
| 工具 | `tool_executions` | 工具执行日志 |
| 管线 | `pipeline_definitions` | 管线定义 |
| 管线 | `pipeline_executions` | 管线执行记录 |

## 五、ClickHouse 物化视图

| 视图名 | 聚合维度 | 用途 |
|--------|----------|------|
| `mv_crane_health_hourly` | 设备 × 小时 | 健康趋势 |
| `mv_cycle_efficiency_daily` | 设备 × 天 | 效率对比 |
| `mv_safety_violations_daily` | 设备 × 天 | 安全统计 |
| `mv_fatigue_accumulation` | 设备 × 周期 | 疲劳累积 |
| `mv_energy_consumption` | 设备 × 班次 | 能耗分析 |

## 六、事件目录

| 事件 Topic | 触发时机 | Payload 关键字段 |
|------------|----------|-----------------|
| `perception.state.updated` | 状态向量更新 | `machineId`, `stateVector`, `timestamp` |
| `perception.anomaly.detected` | 异常检测 | `machineId`, `anomalyType`, `severity` |
| `cognition.diagnosis.completed` | 诊断完成 | `reportId`, `scores`, `recommendations` |
| `cognition.prediction.generated` | 预测生成 | `machineId`, `predictions`, `confidence` |
| `guardrail.violation.triggered` | 护栏触发 | `ruleId`, `severity`, `actions` |
| `guardrail.action.executed` | 护栏动作执行 | `actionId`, `result` |
| `evolution.shadow.completed` | 影子评估完成 | `modelId`, `metrics` |
| `evolution.champion.promoted` | 冠军晋升 | `modelId`, `version`, `metrics` |
| `evolution.knowledge.crystallized` | 知识结晶 | `patternId`, `confidence` |
| `evolution.flywheel.cycled` | 飞轮周期完成 | `cycleId`, `improvements` |
| `twin.state.synced` | 孪生同步 | `twinId`, `state` |
| `twin.simulation.completed` | 仿真完成 | `scenarioId`, `results` |
| `dashboard.alert.created` | 告警创建 | `alertId`, `severity`, `category` |

## 七、场景适配

通过 `ConditionProfileManager` 实现一键场景切换：

```typescript
// 港口岸桥
profileManager.loadProfile('port_crane');

// 制造业 CNC
profileManager.loadProfile('manufacturing_cnc');

// 自定义场景
profileManager.createProfile({
  scenarioId: 'custom_energy',
  name: '风力发电机组',
  // ... 配置
});
```

所有模块通过配置适配，不改一行代码即可切换场景。
