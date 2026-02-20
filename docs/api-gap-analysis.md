# 前端 tRPC 调用 vs 后端 Domain Router 差异分析

## 1. evoCognition (CognitiveDashboard)

前端调用:
- getDashboardMetrics → 后端无此方法（有 get, list, getDimensionResults, getReasoningChain, getSnapshot, predict, counterfactual）
- listReasoningChains → 后端无此方法（有 getReasoningChain 单个查询）

需要新增: getDashboardMetrics, listReasoningChains

## 2. evoPerception (PerceptionMonitor)

前端调用:
- listCollectionStatus → 后端无此方法（有 listProfiles, getProfile, createProfile）
- getFusionQuality → 后端无此方法
- listConditionProfiles → 后端有 listProfiles（名称不同）

需要新增: listCollectionStatus, getFusionQuality
需要别名: listConditionProfiles → listProfiles

## 3. evoGuardrail (GuardrailConsole + CognitiveDashboard)

前端调用:
- listRules → 后端有 list（名称不同）
- listAlertHistory → 后端无此方法
- listAlerts → 后端无此方法
- toggleRule → 后端无此方法（有 create, update, toggle）
- acknowledgeAlert → 后端无此方法

需要新增: listAlertHistory, listAlerts, acknowledgeAlert
需要别名: listRules → list, toggleRule → toggle

## 4. evoPipeline (DigitalTwinView)

前端调用:
- listDigitalTwins → 后端无此方法（pipeline 是嵌套路由 pipeline/dataPipeline/stream）
- listSimulationScenarios → 后端无此方法
- listReplaySessions → 后端无此方法
- runSimulation → 后端无此方法
- startReplay → 后端无此方法

需要新增: 全部 5 个方法

## 5. evoKnowledge (KnowledgeExplorer)

前端调用:
- getKnowledgeGraph → 后端无此方法（knowledge 是嵌套路由 kb/kgOrchestrator/graphQuery）
- listCrystals → 后端无此方法
- listFeatures → 后端无此方法
- listModels → 后端无此方法
- applyCrystal → 后端无此方法

需要新增: 全部 5 个方法

## 6. evoEvolution (CognitiveDashboard)

前端调用:
- getFlywheelStatus → 后端无 evoEvolution 路由

需要新增: 整个 evoEvolution 路由 + getFlywheelStatus 方法

## 总结

| Router | 前端方法数 | 后端已有 | 需新增 |
|--------|-----------|---------|--------|
| evoCognition | 2 | 0 直接匹配 | 2 |
| evoPerception | 3 | 1 (别名) | 2 |
| evoGuardrail | 5 | 2 (别名) | 3 |
| evoPipeline | 5 | 0 | 5 |
| evoKnowledge | 5 | 0 | 5 |
| evoEvolution | 1 | 0 (路由不存在) | 1 |
| **合计** | **21** | **3** | **18** |
