# Phase 2 参考代码分析

## 收到的 4 份参考代码

### 1. PhysicsVerifier v1（pasted_content_2.txt）
- 完整的 PhysicsVerifier 类骨架
- 接口定义：PhysicsVerifierConfig, BoundaryViolation, MappingResult, PhysicsVerificationResult
- 核心方法：verify(), verifyBatch(), mapHypothesisToParams()
- 三源映射：ruleBasedMap + embeddingMap + grokStructuredMap
- 依赖：WorldModel, VectorStore, GrokReasoningService
- 部分方法返回硬编码值（computeMappingConfidence=0.85, applyPINNConstraint=0.12）

### 2. PhysicsVerifier v2（pasted_content_3.txt）
- 与 v1 几乎相同，但更完善：
  - config 参数改为 `Partial<PhysicsVerifierConfig>`
  - 提取了 `createSkippedResult()` 和 `createTimeoutResult()` 辅助方法
  - `verifyBatch()` 增加了 `.slice(0, maxConcurrency)` 限制
  - `calculateObservationConsistency()` 独立方法
  - `checkBoundaryConstraints()` 有能量守恒示例实现
- **结论：v2 是更成熟版本，应以此为基础**

### 3. BuiltinCausalGraph（pasted_content_4.txt）
- 实现 KGQueryAdapter 接口
- 使用 graphology 库做内存图
- 核心方法：seedCausalGraph(), loadFromDB(), queryCausalPaths(), doIntervention(), expandWithFiveWhy()
- 膨胀控制：maxNodes=500, maxNewPerExpand=5
- 边衰减：每天5%，最低30%
- 知识反馈：updateFromCrystal() + 最小样本3 + revision_log
- 依赖：VectorStore, DrizzleDB, PhysicsVerifier

### 4. HybridReasoningOrchestrator（pasted_content_5.txt）
- 编排器骨架，6阶段流程
- 依赖全部组件：PhysicsVerifier, CausalGraph, ExperiencePool, VectorStore, DSFusionEngine, GrokService, Observability
- 核心方法：orchestrate(), determineRoute(), checkShortCircuit(), evaluateCostGate(), deepGrokReasoning()
- 引用 TOOL_TEMPLATES（半结构化工具编排）
- 引用 Observability 收集器

## 尚缺的模块（需要新建）
1. **VectorStore** — 向量存储统一层（pgvector）
2. **ExperiencePool** — 三层经验池（Episodic/Semantic/Procedural）
3. **TOOL_TEMPLATES** — 半结构化工具编排模板
4. **Observability** — 可观测性收集器（OpenTelemetry）
5. **KnowledgeFeedbackLoop** — 知识反馈环（EventEmitter）
6. **DB Schema** — 7张新表
7. **reasoning-processor 集成** — ChampionChallenger Shadow Mode

## 关键依赖
- `graphology` — npm 包，内存图
- `pgvector` — PostgreSQL 向量扩展（需确认 DB 是否支持）
- WorldModel 的 `anticipateAnomaly()`, `counterfactual()`, `generatePhysicsExplanation()`, `getKeyEquations()` 方法
- KGQueryAdapter 接口
- Hypothesis 类型来自 reasoning-processor

## 实施顺序建议
1. VectorStore（基础设施，所有模块依赖）
2. PhysicsVerifier（基于 v2 参考代码）
3. BuiltinCausalGraph（依赖 VectorStore + PhysicsVerifier）
4. ExperiencePool（依赖 VectorStore）
5. TOOL_TEMPLATES + Observability（辅助模块）
6. HybridReasoningOrchestrator（依赖全部上游）
7. KnowledgeFeedbackLoop（EventEmitter 异步）
8. reasoning-processor 集成 + Shadow Mode
9. DB Schema + 迁移
10. 前端 Tab 页面
