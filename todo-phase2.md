# Phase 2 认知层推理引擎增强 — TODO

## Phase 1 前置修复
- [ ] DSFusionEngine 依赖注入改造
- [ ] 种子数据外置到 seed-data/ 目录
- [ ] 重读参考代码（4份）和现有认知层代码

## 基础设施
- [ ] Observability 收集器
- [ ] VectorStore（余弦相似度内存实现）
- [ ] Phase 2 公共类型定义（cognition-v2.types.ts）

## 核心模块
- [ ] PhysicsVerifier（三源映射 + 方程残差 + 边界约束 + 并发控制）
- [ ] BuiltinCausalGraph（graphology 内存图 + 8条种子链 + 干预推理）
- [ ] ExperiencePool（三层内存 + 向量检索 + 三维衰减）
- [ ] HybridReasoningOrchestrator（6阶段编排 + 动态路由 + CostGate）
- [ ] KnowledgeFeedbackLoop（事件总线 + 最小样本保护 + revision_log）

## 集成
- [ ] 集成到 ReasoningProcessor（Champion-Challenger Shadow Mode）
- [ ] DB 表（7张新表）
- [ ] 种子数据填充

## 前端
- [ ] 因果图可视化 Tab
- [ ] 经验池管理 Tab

## 验证
- [ ] TypeScript 编译零错误
- [ ] 推送 GitHub
