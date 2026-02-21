# 认知中枢实时拓扑 TODO

## 后端
- [ ] 在 cognition.domain-router.ts 新增 `getTopologyStatus` 查询，聚合所有域的实时数据
  - 感知层：condition_profiles count, sampling_configs count, state_vectors latest
  - 认知层：cognition_sessions active/today count, avg duration
  - 护栏层：guardrail_rules count/enabled, guardrail_violations today count
  - 知识层：knowledge_crystals count, feature_definitions count, kg_triples count
  - 进化层：flywheel_cycles count, shadow_evaluations count, champion_models count
  - 管线层：pipeline_definitions count, pipeline_executions recent
  - 数字孪生：equipment_profiles count
  - 连接器：connector_configs health status

## 前端
- [ ] 创建 CognitiveTopology.tsx 组件（SVG 实时拓扑）
- [ ] 集成到 CognitiveDashboard 作为新 Tab "实时拓扑"
- [ ] 5秒轮询刷新
