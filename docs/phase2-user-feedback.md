# Phase 2 用户反馈 - 优化建议

## 核心优化方向

### 一、总体架构优化（⭐⭐⭐）
- 新增 HybridReasoningOrchestrator（单入口调度器），统一管理 4 条路径的置信度融合（DS扩展 + Bayesian后验）
- 引入 VectorStore 层（pgvector 或 Qdrant），所有假设、经验、因果路径均向量化，支持 Top-K 语义检索
- 添加 Cost-Aware Gate：根据设备重要度 + 实时负载，动态决定是否触发 Grok（目标：Grok 调用率 < 15%）
- 量化目标：假设命中率 75% → 88%；物理验证率 ≥ 92%

### 二、模块细化

#### A. PhysicsVerifier（⭐⭐⭐）
- 映射升级：规则(30%) + Embedding相似度(40%) + Grok structured output(30%)
- PINN 轻量集成：WorldModel 导出 PDE 作为软约束，feasibilityScore = 0.6×物理一致性 + 0.4×PINN loss
- 不确定性输出：feasibilityScore ± uncertainty（Monte-Carlo Dropout）
- 收益：物理验证率 80% → 95%

#### B. BuiltinCausalGraph（⭐⭐⭐）
- 存储升级：Postgres冷存储 + Neo4j主查询（Cypher 5-10x加速）
- 动态更新：KnowledgeCrystal 到来时调用 Grok "5-Why" 因果补全
- 因果干预：doIntervention(nodeId) 接口，支持反事实干预
- 向量列：causal_edges ADD embedding vector(1536)

#### C. ExperiencePool（⭐⭐⭐）
- 三层内存：Episodic(完整trace) / Semantic(策略模板) / Procedural(Tool Sequence JSON Schema)
- Record & Replay：replayForStimulus() 返回 Top-3 历史 trace 作为 Grok hint
- 向量+时间混合检索：embedding <=> query_emb + decay_weight 混合排序
- 新增 abstractExperience() + replay()，约 150 行

#### D. StructuredReasoner（⭐⭐）
- 5阶段 → 带 Gate 的 6 阶段：Deep Reasoning 前加 CostGate
- ReAct 结构化增强：强制 "Vector → Physics → Causal → Grok" 顺序
- 输出结构化：新增 explanationGraph（JSON-LD）

#### E. KnowledgeFeedbackLoop（⭐⭐）
- 改为事件总线（BullMQ / Redis Stream），异步处理
- RL-style 反馈：每条晶化记录"奖励"值，BayesianUpdate 学习率自适应

#### F. ReasoningProcessor 集成
- A/B Shadow Mode（利用 ChampionChallenger）：新路径默认 shadow，达 85% 命中率后切主路径
