# Phase 2 技术方案：认知层推理引擎增强（v4.0 终版）

> **文档版本**: v4.0  
> **作者**: Manus AI  
> **日期**: 2026-02-21  
> **状态**: 待审阅  
> **前置依赖**: Phase 1 感知层增强（已完成）  
> **变更记录**: v1.0 初版 → v2.0 整合 HybridOrchestrator/VectorStore/CostGate → v3.0 整合三份深度评审意见 → **v4.0 整合意见2.0深度评审（量化目标校准、PINN落地策略、统计显著性晋升、不确定性传播等）**

---

## 一、v4.0 变更摘要

v4.0 在 v3.0 基础上整合了意见 2.0 两份深度评审的 **16 项增强**，聚焦于 **量化目标可信度校准**、**PINN 工程化落地策略**、**冷启动鲁棒性**、**统计显著性晋升标准**、**端到端不确定性传播**和**可观测性工业化**。

| 序号 | 增强项 | 来源 | 影响模块 | 优先级 |
|------|--------|------|---------|--------|
| 15 | 分阶段命中率目标（冷启动≥60%→成熟≥88%） | 意见1-风险1 | 全局指标 | P0 |
| 16 | CostGate 阈值压力测试 + 反向校准 | 意见1-风险2 | HybridOrchestrator | P0 |
| 17 | physics_verification_rate 计算口径明确化 | 意见1-风险3 | 可观测性 | P0 |
| 18 | PINN 改为方程残差代理（解析式），真 PINN 推迟 v4.1 | 意见1-问题4 + 意见2-1 | PhysicsVerifier | P0 |
| 19 | 经验池自适应降维衰减（<50→单维，50-200→二维，>200→三维） | 意见1-问题5 | ExperiencePool | P0 |
| 20 | doIntervention() 可识别性检验 + 未观测混淆变量警告 | 意见1-问题6 | CausalGraph | P1 |
| 21 | Shadow Mode 统计显著性晋升标准（100次+5pp+p<0.05+延迟≤120%） | 意见1-问题7 | ChampionChallenger | P0 |
| 22 | 新增 P2-13 单元测试阶段（6-8h） | 意见1-注意8 | 实施计划 | P0 |
| 23 | 种子因果图领域专家评审会 | 意见1-注意9 | CausalGraph | P0 |
| 24 | 前端 challenger 路径"实验模式"水印 | 意见1-注意10 | 前端 | P1 |
| 25 | 端到端不确定性传播（分布输出而非点估计） | 意见1-追加 | 全链路 | P1 |
| 26 | maxConcurrency 自适应（根据 currentLoad 动态 4~12） | 意见2-2 | HybridOrchestrator | P0 |
| 27 | 可观测性接入 OpenTelemetry + Prometheus exporter | 意见2-3 | 可观测性 | P1 |
| 28 | 种子数据补充"液压系统泄漏"+"钢丝绳疲劳断股" | 意见2-4 | CausalGraph | P0 |
| 29 | 前端因果图使用 react-force-graph | 意见2-5 | 前端 | P1 |
| 30 | PINN 落地路径专项预研（2-3h） | 意见1-总结 | PhysicsVerifier | P0 |

---

## 二、现状分析与问题复盘

### 2.1 认知层现有架构

当前认知层（`server/platform/cognition/`）已建立完整的四维认知闭环框架，包含 CognitionUnit 调度器、ReasoningProcessor 推理处理器、WorldModel 物理模型、DS-Fusion Engine 融合引擎、GrokReasoningService 深度推理、KnowledgeCrystallizer 知识结晶器和 ChampionChallenger 评估框架。

| 模块 | 当前能力 | 关键短板 |
|------|---------|---------|
| **CognitionUnit** | 四维调度器，串行/并行执行感知→推演→融合→决策 | 各路径独立运行，缺乏统一的置信度融合调度 |
| **ReasoningProcessor** | 假设生成（模板映射 + KG + 通用规则 + Grok 附加） | 模板驱动，缺乏物理机理深层推理 |
| **WorldModel** | 物理预测（风载、疲劳S-N、腐蚀、倾覆） | 仅前端调用，未接入推演维做假设验证 |
| **DS-Fusion Engine** | 6 策略自适应 D-S 融合 | 证据源权重静态，缺乏知识反馈更新 |
| **GrokReasoningService** | ReAct 循环 + Tool Calling | 工具调用顺序完全由 LLM 决定，缺乏领域编排 |
| **KnowledgeCrystallizer** | 5 类知识自动结晶 | 结晶后仅存储，未反馈到推理各组件 |
| **ChampionChallenger** | A/B 模型评估框架 | 未用于新旧推理路径的 Shadow 对比 |

### 2.2 v1.0~v3.0 方案复盘

v1.0 方案设计了 6 个模块，但存在核心架构缺陷：PhysicsVerifier、CausalGraph、ExperiencePool 是并列的"插件"，未形成真正的混合闭环。v2.0 引入 HybridReasoningOrchestrator 解决了调度问题。v3.0 整合了三份深度评审意见的 14 项增强，解决了映射置信度、短路机制、动态路由、并行扇出、误反馈保护和可观测性等问题。

v4.0 评审意见指出了 v3.0 仍然存在的 **三类深层问题**：

1. **量化目标与实现手段不匹配**：假设命中率 ≥88% 在冷启动期不可达、CostGate 公式在港口场景下自然通过率过高、物理验证率的分母定义不清。
2. **技术设计路径不清晰**：PINN 依赖预训练模型但无训练基础设施、三维衰减在冷启动期是伪精度、doIntervention() 缺少可识别性检验、Shadow Mode 晋升缺少统计显著性。
3. **工程实施缺口**：缺少单元测试工时、种子数据未经专家验证、前端未区分实验/生产路径、不确定性未贯穿推理链。

---

## 三、增强目标（v4.0 终版）

### 3.1 分阶段量化目标（v4.0 核心变更）

v4.0 将原来的单一目标拆分为 **三阶段递进目标**，解决冷启动期目标不可达的预期管理问题：

| 指标 | Phase 1 后 | 冷启动期（<100次会话） | 成长期（100-500次） | 成熟期（>500次） | 可观测手段 |
|------|-----------|---------------------|-------------------|-----------------|-----------|
| 假设命中率（Top-3） | ~45% | **≥60%** | **≥75%** | **≥88%** | `metrics.hypothesisHitRate` |
| 物理验证率 | 0% | **≥70%** | **≥85%** | **≥95%** | `metrics.physicsVerificationRate`（口径：通过映射过滤的假设中完成验证的比例） |
| 因果覆盖率 | 依赖外部KG | **≥60%** | **≥85%** | **100% 自洽** | `metrics.causalCoverage` |
| Grok 调用率 | 100% | **< 40%** | **< 25%** | **< 15%** | `metrics.grokInvocationRate` |
| 端到端推理延迟 | 未定义 | **P95 < 12s** | **P95 < 10s** | **P95 < 8s** | `metrics.e2eLatencyP95` |
| 经验命中率 | 无 | **≥10%** | **≥40%** | **≥65%** | `metrics.experienceHitRate` |

> **physics_verification_rate 计算口径（v4.0 明确）**：分母为"通过映射置信度过滤的候选假设数量"，分子为"在这些假设中完成物理验证且 feasibilityScore > 0.2 的数量"。被 `mappingConfidence < 0.4` 跳过的假设不计入分母。这确保了指标反映的是物理验证本身的精度，而非映射过滤的严格程度。

### 3.2 评测数据集构建计划（v4.0 新增）

为使分阶段目标可度量，v4.0 新增评测数据集构建计划：

| 数据集 | 规模 | 来源 | 用途 |
|--------|------|------|------|
| **冷启动评测集** | 50 条标注异常场景 | 历史告警数据 + 维保工单 | 冷启动期命中率基准测试 |
| **回归测试集** | 100 条覆盖 6 大因果链 | 种子数据扩展 + 专家标注 | 每次代码变更后回归验证 |
| **压力测试集** | 500 条混合场景 | 模拟 + 真实数据 | CostGate 阈值校准 + 延迟压测 |

---

## 四、v4.0 总体架构

### 4.1 架构总览

v4.0 在 v3.0 架构基础上新增了 **自适应并发控制**（Adaptive Concurrency）、**方程残差代理**（Residual Proxy，替代 PINN）、**自适应降维衰减**（Adaptive Decay）、**可识别性检验**（Identifiability Check）、**统计显著性晋升**（Statistical Promotion）、**端到端不确定性传播**（Uncertainty Propagation）和 **OpenTelemetry 集成**。

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                          CognitionUnit (调度器)                               │
│  ┌──────────┐  ┌─────────────────────────────────┐  ┌────────┐  ┌────────┐  │
│  │ 感知维   │→│    推演维 — HybridOrchestrator    │→│ 融合维 │→│ 决策维 │  │
│  │(Phase1)  │  │  (单入口 + 动态路由 + 短路)      │  │        │  │        │  │
│  └──────────┘  └───────────────┬───────────────────┘  └────────┘  └────────┘  │
│                                │                                              │
│                   ┌────────────┼────────────┐                                 │
│                   │            │            │                                  │
│                   ▼            ▼            ▼                                  │
│        ┌──────────────┐ ┌──────────┐ ┌───────────────┐                       │
│        │PhysicsVerifier│ │ Causal   │ │ExperiencePool │                       │
│        │方程残差代理   │ │ Graph    │ │三层内存       │                       │
│        │(v4.0替代PINN)│ │5-Why补全 │ │自适应降维衰减 │                       │
│        │映射置信度过滤 │ │膨胀控制  │ │(v4.0)         │                       │
│        │边界校验       │ │边权衰减  │ │上下文匹配     │                       │
│        │不确定性区间   │ │可识别性  │ │Record&Replay  │                       │
│        │              │ │检验(v4.0)│ │               │                       │
│        └──────┬───────┘ └────┬─────┘ └──────┬────────┘                       │
│               │              │              │                                 │
│               └──────────────┼──────────────┘                                 │
│                              ▼                                                │
│                    ┌──────────────────┐                                        │
│                    │  VectorStore      │                                        │
│                    │  pgvector 统一层  │                                        │
│                    └────────┬─────────┘                                        │
│                             ▼                                                  │
│                    ┌──────────────────┐                                        │
│                    │  CostGate        │                                        │
│                    │  + 短路判定      │                                        │
│                    │  + 动态路由      │                                        │
│                    │  + 阈值压力校准  │                                        │
│                    │    (v4.0)        │                                        │
│                    └────────┬─────────┘                                        │
│                             ▼                                                  │
│                    ┌──────────────────┐                                        │
│                    │Confidence Fusion │                                        │
│                    │DS扩展 + Bayesian │                                        │
│                    │+ 不确定性传播   │                                        │
│                    │  (v4.0)          │                                        │
│                    └────────┬─────────┘                                        │
│                             │                                                  │
│              ┌──────────────┼──────────────┐                                   │
│              ▼              ▼              ▼                                   │
│     ┌──────────────┐ ┌───────────┐ ┌──────────────┐                          │
│     │Knowledge     │ │ Narrative │ │ Champion     │                          │
│     │FeedbackLoop  │ │ Layer     │ │ Challenger   │                          │
│     │误反馈保护    │ │JSON-LD图  │ │ 统计显著性   │                          │
│     │RL奖励+衰减  │ │不确定性   │ │ 晋升(v4.0)   │                          │
│     │             │ │可视化(v4.0)│ │              │                          │
│     └──────────────┘ └───────────┘ └──────────────┘                          │
│                                                                               │
│     ┌─────────────────────────────────────────────────────────────────┐       │
│     │              Observability Layer (v4.0 OpenTelemetry)            │       │
│     │  OTel Spans │ Prometheus │ decisionLogs │ hitRates │ alerts     │       │
│     └─────────────────────────────────────────────────────────────────┘       │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 关键架构决策（v4.0 新增/修订）

**决策 1~9（v3.0 保留）**：HybridOrchestrator 单入口、映射置信度过滤、置信度短路、动态路由、并行扇出+超时保护、三维衰减、误反馈保护双保险、端到端延迟目标、半结构化工具编排模板。

**决策 10（v4.0 新增）：方程残差代理替代 PINN**。v3.0 的 PINN 软约束依赖预训练神经网络，但当前缺乏训练数据和模型管理基础设施。v4.0 改为**方程残差代理**（Residual Proxy）：直接使用 WorldModel 已有的偏微分方程（疲劳 S-N、腐蚀速率、热传导等），计算假设参数代入方程后的残差（有限差分近似）。残差越小表示假设越符合物理规律。这种解析式方法不需要训练数据，延迟可控（<50ms），且与 WorldModel 天然集成。真正的 PINN 神经网络推迟到 v4.1，待积累足够训练数据后实施。

> **feasibilityScore = 0.6 × 物理一致性评分 + 0.4 × (1 - normalizedResidual)**
>
> 其中 `normalizedResidual = clamp(residual / referenceResidual, 0, 1)`，`referenceResidual` 为该方程类型的典型残差基准值（从 WorldModel 配置中获取）。

**决策 11（v4.0 新增）：自适应降维衰减**。经验池的衰减函数根据经验条目数量自动调整维度，解决冷启动期三维衰减的伪精度问题：

| 经验条目数 | 衰减维度 | 公式 | 理由 |
|-----------|---------|------|------|
| < 50 | 单维（时间） | `decay = exp(-λ × Δt)` | 样本极度稀疏，工况相似度随机性 > 信号性 |
| 50~200 | 二维（时间 × 设备类型） | `decay = temporal × machineTypeSimilarity` | 设备类型是离散变量，不需要大量样本 |
| > 200 | 三维（时间 × 设备相似度 × 工况相似度） | `decay = temporal × machineSim × opSim` | 样本充足，工况向量余弦相似度有统计意义 |

**决策 12（v4.0 新增）：doIntervention() 可识别性检验**。因果干预分析前内置 **可识别性检验**（Identifiability Check）：检查因果图中目标变量和干预变量之间是否存在未观测混淆变量（通过 back-door criterion 检验）。当检测到潜在的未观测混淆变量时，返回 `identifiable: false` 和警告信息，而非假阳性的干预效果估计。

```typescript
interface InterventionResult {
  identifiable: boolean;                    // v4.0 新增
  identifiabilityWarning?: string;          // v4.0 新增
  unobservedConfounders?: string[];         // v4.0 新增
  interventionEffect: number;
  confidence: number;
  affectedNodes: string[];
}
```

**决策 13（v4.0 新增）：统计显著性晋升标准**。Shadow Mode 的 `shouldPromoteChallenger()` 从简单的 50 次会话改为基于统计显著性的多条件判断：

> **晋升条件（全部满足）**：
> 1. 至少 **100 次**并行会话比较
> 2. Challenger 假设命中率比 Champion 高 **≥5 个百分点**
> 3. 双样本比例检验 **p-value < 0.05**
> 4. Challenger P95 延迟 **≤ Champion P95 延迟的 120%**
> 5. Challenger 降级次数 **< 3 次**

```typescript
shouldPromoteChallenger(): { promote: boolean; reason: string; stats: PromotionStats } {
  const stats = this.computePromotionStats();
  if (stats.totalSessions < 100) return { promote: false, reason: '样本不足', stats };
  if (stats.hitRateDelta < 0.05) return { promote: false, reason: '命中率提升不足', stats };
  if (stats.pValue >= 0.05) return { promote: false, reason: '未达统计显著性', stats };
  if (stats.challengerP95 > stats.championP95 * 1.2) return { promote: false, reason: '延迟过高', stats };
  if (stats.challengerDegradations >= 3) return { promote: false, reason: '降级次数过多', stats };
  return { promote: true, reason: '全部条件满足', stats };
}
```

**决策 14（v4.0 新增）：自适应并发控制**。物理验证的 `maxConcurrency` 从固定 8 改为根据 `currentLoad` 动态调整：

```typescript
function adaptiveConcurrency(currentLoad: number): number {
  // currentLoad: 0~1, 0=空闲, 1=满载
  const min = 4, max = 12;
  return Math.round(max - (max - min) * currentLoad);
  // 空闲时 12 并发，满载时 4 并发
}
```

**决策 15（v4.0 新增）：端到端不确定性传播**。不确定性从 PhysicsVerifier 的 `±uncertainty` 扩展到贯穿整个推理链：

| 阶段 | 不确定性来源 | 表示方式 |
|------|------------|---------|
| 因果溯源 | 路径置信度区间 | `pathConfidence ± pathUncertainty`（基于边权重的方差传播） |
| 物理验证 | Monte-Carlo Dropout | `feasibilityScore ± uncertainty` |
| 经验匹配 | 相似度分布 | `similarityMean ± similarityStd`（Top-K 结果的标准差） |
| D-S 融合 | 冲突度量 | `conflictMeasure`（已有）+ `beliefInterval: [Bel, Pl]` |
| **最终输出** | **综合不确定性** | **`confidence ± totalUncertainty`**（各阶段不确定性的 RSS 合成） |

最终输出的假设置信度是一个 **区间** 而非点估计，在 `explanationGraph` 中可视化为置信度带。例如："轴承磨损的置信度为 0.82 ± 0.12，不确定性主要来源：因果路径覆盖不全（贡献 60%）、物理验证样本不足（贡献 30%）"。

**决策 16（v4.0 新增）：CostGate 阈值压力校准**。在 P2-5 实施阶段，使用历史告警数据模拟 CostGate 公式的自然通过率。港口机械设备几乎都是高重要度（importance > 0.8），因此需要调整公式权重或引入额外因子：

```typescript
// v3.0 原公式（港口场景下几乎总是触发 Grok）
grokScore = deviceImportance × anomalySeverity / currentLoad;

// v4.0 校准公式：引入经验命中率和短路率作为抑制因子
grokScore = (deviceImportance × anomalySeverity / currentLoad)
            × (1 - experienceHitRate)      // 经验命中率高时抑制 Grok
            × (1 - shortCircuitRate * 0.5); // 短路率高时部分抑制
```

---

## 五、模块详细设计

### 模块 A：PhysicsVerifier（物理验证器）— 方程残差代理 + 边界校验 + 置信度过滤

**文件**: `server/platform/cognition/reasoning/physics-verifier.ts`

**v4.0 核心变更：PINN → 方程残差代理**

v3.0 的 PINN 软约束依赖预训练神经网络，v4.0 改为 **方程残差代理**（Residual Proxy）。核心思路是：将假设参数代入 WorldModel 已有的偏微分方程，计算有限差分近似的残差。残差越小，假设越符合物理规律。

```typescript
/** v4.0: 方程残差代理（替代 PINN） */
interface ResidualProxyResult {
  equationType: 'fatigue_sn' | 'corrosion_rate' | 'heat_transfer' | 'wind_load' | 'overturning';
  residual: number;                    // 原始残差值
  normalizedResidual: number;          // 归一化残差 [0,1]
  referenceResidual: number;           // 该方程类型的典型残差基准
  finiteDiffOrder: 1 | 2;             // 有限差分阶数
  parametersUsed: Record<string, number>;
}

class ResidualProxy {
  constructor(private worldModel: WorldModel) {}

  /** 计算假设参数在物理方程中的残差 */
  computeResidual(
    equationType: string,
    hypothesisParams: Record<string, number>,
    currentState: StateVector,
  ): ResidualProxyResult {
    // 从 WorldModel 获取方程和参考残差
    const equation = this.worldModel.getEquation(equationType);
    const referenceResidual = this.worldModel.getReferenceResidual(equationType);
    
    // 有限差分近似计算残差
    const residual = this.finiteDifference(equation, hypothesisParams, currentState);
    const normalizedResidual = Math.min(residual / referenceResidual, 1.0);
    
    return { equationType, residual, normalizedResidual, referenceResidual, ... };
  }

  /** 一阶/二阶有限差分 */
  private finiteDifference(equation, params, state, order: 1 | 2 = 1): number;
}
```

**增强 A1~A4（v3.0 保留）**：映射置信度过滤、参数边界校验、不确定性建模。其中 `feasibilityScore` 公式中的 `PINN_loss` 替换为 `normalizedResidual`。

**核心接口**:

```typescript
export interface PhysicsVerificationResult {
  hypothesisId: string;
  feasibilityScore: number;
  uncertainty: number;                              // Monte-Carlo Dropout
  residualProxy: ResidualProxyResult;               // v4.0: 替代 pinnLoss
  mappingConfidence: number;
  skippedReason?: 'low_mapping_confidence' | 'timeout' | 'boundary_violation';
  boundaryViolations: BoundaryViolation[];
  prediction: PredictionResult;
  counterfactual: CounterfactualResult;
  formulaChain: FormulaReference[];
  observationConsistency: number;
  mappingSource: { rule: number; embedding: number; grok: number };
}

export class PhysicsVerifier {
  private residualProxy: ResidualProxy;             // v4.0

  constructor(
    private worldModel: WorldModel,
    private vectorStore: VectorStore,
    private grokService?: GrokReasoningService,
    private config?: PhysicsVerifierConfig,
  ) {
    this.residualProxy = new ResidualProxy(worldModel);  // v4.0
  }

  async verify(hypothesis: Hypothesis, currentState: StateVector): Promise<PhysicsVerificationResult>;
  async verifyBatch(hypotheses: Hypothesis[], currentState: StateVector, maxConcurrency: number, timeoutMs: number): Promise<PhysicsVerificationResult[]>;
  
  /** v4.0: PINN 预研接口（预留） */
  async verifyWithPINN?(hypothesis: Hypothesis, currentState: StateVector): Promise<PhysicsVerificationResult>;
}
```

---

### 模块 B：BuiltinCausalGraph（内建因果图）— 8 条种子链 + 可识别性检验

**文件**: `server/platform/cognition/reasoning/causal-graph.ts`

**v4.0 核心变更**：

**变更 B1：种子数据扩充至 8 条**。在 v3.0 的 6 条基础上新增 2 条港口高频因果链：

| 序号 | 因果链 | data_source | confidence_level |
|------|--------|-------------|-----------------|
| 1 | 振动异常 → 轴承磨损 → 润滑不良/过载 | expert_input | high |
| 2 | 温度升高 → 绝缘老化 → 过电流/散热不良 | expert_input | high |
| 3 | 电流谐波 → 变频器故障 → 电容老化/IGBT退化 | expert_input | medium |
| 4 | 结构应力异常 → 疲劳裂纹 → 焊缝缺陷/超载 | expert_input | high |
| 5 | 腐蚀速率加速 → 涂层失效 → 盐雾/机械损伤 | expert_input | medium |
| 6 | 齿轮箱油温异常 → 齿面磨损 → 润滑油劣化/齿面点蚀 | expert_input | high |
| **7** | **液压系统压力下降 → 液压泄漏 → 密封件老化/管路破裂** | **expert_input** | **high** |
| **8** | **钢丝绳直径减小 → 钢丝绳疲劳断股 → 弯曲疲劳/腐蚀减薄** | **expert_input** | **high** |

**变更 B2：领域专家评审会**。在 P2-3 实施阶段，安排 1 次领域专家评审会（半天），将 8 条初始因果链的草稿发给 1-2 名港口机械维保工程师审阅，根据反馈修订后再写入数据库。审阅记录存档到 `docs/causal-graph-expert-review.md`。

**变更 B3：可识别性检验**。`doIntervention()` 前内置 back-door criterion 检验：

```typescript
/** v4.0: 可识别性检验 */
checkIdentifiability(
  interventionNodeId: number,
  targetNodeId: number,
): IdentifiabilityResult {
  // 1. 找到所有从 intervention 到 target 的路径
  const paths = this.findAllPaths(interventionNodeId, targetNodeId);
  
  // 2. 检查是否存在 back-door 路径（未被阻断的混淆路径）
  const backdoorPaths = this.findBackdoorPaths(interventionNodeId, targetNodeId);
  
  // 3. 检查是否存在可观测的调整集（adjustment set）
  const adjustmentSet = this.findAdjustmentSet(interventionNodeId, targetNodeId);
  
  if (backdoorPaths.length > 0 && !adjustmentSet) {
    return {
      identifiable: false,
      warning: `存在 ${backdoorPaths.length} 条未阻断的混淆路径，可能包含未观测变量`,
      unobservedConfounders: this.inferUnobservedConfounders(backdoorPaths),
      recommendation: '建议增加传感器覆盖或使用前门准则（front-door criterion）',
    };
  }
  
  return { identifiable: true, adjustmentSet };
}

async doIntervention(
  interventionNodeId: number,
  targetNodeId: number,
  interventionValue: number,
): Promise<InterventionResult> {
  // v4.0: 先检查可识别性
  const identCheck = this.checkIdentifiability(interventionNodeId, targetNodeId);
  if (!identCheck.identifiable) {
    return {
      identifiable: false,
      identifiabilityWarning: identCheck.warning,
      unobservedConfounders: identCheck.unobservedConfounders,
      interventionEffect: NaN,
      confidence: 0,
      affectedNodes: [],
    };
  }
  
  // 可识别时执行正常的 do-calculus
  return this.executeDoCalculus(interventionNodeId, targetNodeId, interventionValue, identCheck.adjustmentSet);
}
```

**其他增强（v3.0 保留）**：5-Why 动态补全、膨胀控制（500 节点上限）、边权衰减（30 天未验证降权 20%）、`data_source` 和 `confidence_level` 字段。

---

### 模块 C：ExperiencePool（经验池）— 自适应降维衰减

**文件**: `server/platform/cognition/reasoning/experience-pool.ts`

**v4.0 核心变更：自适应降维衰减**

```typescript
/** v4.0: 自适应降维衰减 */
computeDecayWeight(
  experience: ReasoningExperience,
  currentContext: ExperienceContext,
): number {
  const totalExperiences = this.getExperienceCount();
  
  // 时间衰减（始终启用）
  const temporalDecay = Math.exp(-this.config.lambda * daysSince(experience.createdAt));
  
  if (totalExperiences < 50) {
    // 冷启动期：仅时间衰减，避免伪精度
    return temporalDecay;
  }
  
  // 设备类型相似度（离散匹配，不需要大量样本）
  const machineTypeSim = experience.machineType === currentContext.machineType ? 1.0
    : this.machineTypeDistance(experience.machineType, currentContext.machineType);
  
  if (totalExperiences < 200) {
    // 成长期：时间 × 设备类型二维衰减
    return temporalDecay * machineTypeSim;
  }
  
  // 成熟期：完整三维衰减
  const operationSim = this.cosineSimilarity(
    experience.operationVector,
    currentContext.operationVector,
  );
  
  return temporalDecay * machineTypeSim * operationSim;
}
```

**其他增强（v3.0 保留）**：三层内存（Episodic/Semantic/Procedural）、Record&Replay、上下文匹配。

**DB 表设计（v3.0 保留 + v4.0 增加 `decay_mode` 字段）**：

```sql
CREATE TABLE reasoning_experiences (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  machine_type TEXT NOT NULL,
  machine_age INTEGER DEFAULT 0,
  anomaly_type TEXT NOT NULL,
  stimulus_summary JSONB DEFAULT '{}',
  hypotheses JSONB DEFAULT '[]',
  final_diagnosis TEXT,
  reward REAL DEFAULT 0,
  trace JSONB DEFAULT '{}',
  operation_vector REAL[] DEFAULT '{}',
  embedding vector(384),
  decay_mode TEXT DEFAULT 'temporal',        -- v4.0: 记录使用的衰减模式
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 模块 D：HybridReasoningOrchestrator — 自适应并发 + CostGate 校准

**文件**: `server/platform/cognition/reasoning/hybrid-orchestrator.ts`

**v4.0 核心变更**：

**变更 D1：自适应并发控制**。物理验证的 `maxConcurrency` 从固定 8 改为根据系统负载动态调整 4~12：

```typescript
private getAdaptiveConcurrency(currentLoad: number): number {
  const min = 4, max = 12;
  return Math.round(max - (max - min) * Math.min(currentLoad, 1.0));
}
```

**变更 D2：CostGate 校准公式**。引入经验命中率和短路率作为抑制因子，防止港口高重要度设备场景下 Grok 调用率过高：

```typescript
private evaluateCostGate(
  deviceImportance: number,
  anomalySeverity: number,
  currentLoad: number,
  experienceHitRate: number,    // v4.0
  shortCircuitRate: number,     // v4.0
): { grokScore: number; shouldTrigger: boolean } {
  const rawScore = (deviceImportance * anomalySeverity) / Math.max(currentLoad, 0.1);
  
  // v4.0: 经验和短路抑制因子
  const suppressionFactor = (1 - experienceHitRate) * (1 - shortCircuitRate * 0.5);
  const grokScore = rawScore * suppressionFactor;
  
  return {
    grokScore,
    shouldTrigger: grokScore > this.config.costGateThreshold,
  };
}
```

**变更 D3：不确定性传播**。置信度融合阶段新增不确定性合成：

```typescript
private fuseConfidencesWithUncertainty(
  hypotheses: WeightedHypothesis[],
  physicsResults: PhysicsVerificationResult[],
  causalResults: CausalTracingResult,
  experienceResults: ExperienceMatchResult[],
): WeightedHypothesisWithUncertainty[] {
  return hypotheses.map(h => {
    const physicsUncertainty = physicsResults.find(p => p.hypothesisId === h.id)?.uncertainty ?? 0.2;
    const causalUncertainty = causalResults.pathUncertainty ?? 0.15;
    const experienceUncertainty = this.computeExperienceUncertainty(experienceResults, h.id);
    
    // RSS (Root Sum of Squares) 合成
    const totalUncertainty = Math.sqrt(
      physicsUncertainty ** 2 + causalUncertainty ** 2 + experienceUncertainty ** 2
    );
    
    // 不确定性来源分解
    const uncertaintySources = {
      physics: { value: physicsUncertainty, contribution: (physicsUncertainty ** 2) / (totalUncertainty ** 2) },
      causal: { value: causalUncertainty, contribution: (causalUncertainty ** 2) / (totalUncertainty ** 2) },
      experience: { value: experienceUncertainty, contribution: (experienceUncertainty ** 2) / (totalUncertainty ** 2) },
    };
    
    return {
      ...h,
      uncertainty: totalUncertainty,
      confidenceInterval: [h.confidence - totalUncertainty, h.confidence + totalUncertainty],
      uncertaintySources,
    };
  });
}
```

**推理流程（v4.0 更新）**：

```
阶段 0: 动态路由（Dynamic Routing）
  ├── 4 条路由通道（v3.0 保留）
  └── 自适应并发数计算（v4.0）

阶段 1: 信号分类（Signal Triage）

阶段 2: 向量检索（Vector Retrieval）

阶段 3: 因果溯源（Causal Tracing）
  └── 路径置信度区间计算（v4.0 不确定性传播）

阶段 4: 物理验证（Physics Validation）
  ├── 方程残差代理（v4.0 替代 PINN）
  ├── 自适应并发 4~12（v4.0）
  └── Monte-Carlo 不确定性

  ┌── 短路判定（Short-Circuit Check）
  └──

阶段 5: CostGate 门控
  └── 校准公式 + 抑制因子（v4.0）

阶段 6: 深度推理（条件触发）

置信度融合
  └── 不确定性 RSS 合成 + 来源分解（v4.0）
```

**半结构化工具编排模板（v3.0 保留）**：

| 主导异常域 | 推荐工具调用顺序 | 约束 |
|-----------|-----------------|------|
| 振动类 | queryHistory → physicsVerify(S-N) → causalTrace(轴承/齿轮) → grokReason | 必须先物理验证 |
| 温度类 | queryHistory → causalTrace(热源) → physicsVerify(热传导) → grokReason | 因果优先 |
| 电气类 | queryHistory → physicsVerify(电路) → causalTrace(绝缘) → grokReason | 必须先物理验证 |
| 结构类 | physicsVerify(FEM) → causalTrace(疲劳) → queryHistory → grokReason | 物理优先 |
| 环境类 | queryHistory → causalTrace(腐蚀) → physicsVerify(腐蚀速率) → grokReason | 因果优先 |
| **液压类** | **queryHistory → physicsVerify(流体) → causalTrace(密封) → grokReason** | **物理优先** |
| **钢丝绳类** | **physicsVerify(疲劳) → causalTrace(磨损) → queryHistory → grokReason** | **物理优先** |

---

### 模块 E：KnowledgeFeedbackLoop（知识反馈环）

**文件**: `server/platform/cognition/reasoning/knowledge-feedback.ts`

v3.0 设计保留，增强 E1~E3 不变（最小样本数保护、revision_log 回滚、RL 学习率自适应）。

---

### 模块 F：VectorStore（向量存储统一层）

**文件**: `server/platform/cognition/reasoning/vector-store.ts`

v3.0 设计保留。

---

### 模块 G：ReasoningProcessor 集成 + Shadow Mode（统计显著性晋升）

**文件**: 修改 `server/platform/cognition/dimensions/reasoning-processor.ts`

**v4.0 核心变更：统计显著性晋升标准**

```typescript
interface PromotionStats {
  totalSessions: number;
  championHitRate: number;
  challengerHitRate: number;
  hitRateDelta: number;
  pValue: number;                    // 双样本比例检验
  championP95: number;
  challengerP95: number;
  challengerDegradations: number;
}

shouldPromoteChallenger(): { promote: boolean; reason: string; stats: PromotionStats } {
  const stats = this.computePromotionStats();
  
  // 条件 1: 最少 100 次会话
  if (stats.totalSessions < 100) 
    return { promote: false, reason: `样本不足 (${stats.totalSessions}/100)`, stats };
  
  // 条件 2: 命中率提升 ≥ 5pp
  if (stats.hitRateDelta < 0.05) 
    return { promote: false, reason: `命中率提升不足 (${(stats.hitRateDelta*100).toFixed(1)}pp < 5pp)`, stats };
  
  // 条件 3: 统计显著性 p < 0.05
  if (stats.pValue >= 0.05) 
    return { promote: false, reason: `未达统计显著性 (p=${stats.pValue.toFixed(3)} ≥ 0.05)`, stats };
  
  // 条件 4: 延迟不超过 120%
  if (stats.challengerP95 > stats.championP95 * 1.2) 
    return { promote: false, reason: `延迟过高 (${stats.challengerP95}ms > ${stats.championP95 * 1.2}ms)`, stats };
  
  // 条件 5: 降级次数 < 3
  if (stats.challengerDegradations >= 3) 
    return { promote: false, reason: `降级次数过多 (${stats.challengerDegradations} ≥ 3)`, stats };
  
  return { promote: true, reason: '全部 5 项条件满足', stats };
}

/** 双样本比例检验（z-test） */
private computePValue(n1: number, p1: number, n2: number, p2: number): number {
  const p = (n1 * p1 + n2 * p2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1/n1 + 1/n2));
  const z = (p2 - p1) / se;
  return 2 * (1 - this.normalCDF(Math.abs(z)));  // 双尾检验
}
```

**降级策略（v3.0 保留）**：5s 超时自动降级到模板路径。

---

### 模块 H：Observability（可观测性层）— OpenTelemetry 集成

**文件**: `server/platform/cognition/reasoning/observability.ts`

**v4.0 核心变更：OpenTelemetry + Prometheus exporter**

```typescript
import { trace, metrics, SpanStatusCode } from '@opentelemetry/api';

export class ReasoningObservabilityCollector {
  private tracer = trace.getTracer('cognition-reasoning');
  private meter = metrics.getMeter('cognition-reasoning');
  
  // Prometheus 指标
  private e2eLatencyHistogram = this.meter.createHistogram('reasoning_e2e_latency_ms');
  private hypothesisHitRateGauge = this.meter.createObservableGauge('reasoning_hypothesis_hit_rate');
  private grokInvocationCounter = this.meter.createCounter('reasoning_grok_invocations');
  private shortCircuitCounter = this.meter.createCounter('reasoning_short_circuits');
  private degradationCounter = this.meter.createCounter('reasoning_degradations');
  private physicsVerificationGauge = this.meter.createObservableGauge('reasoning_physics_verification_rate');
  
  /** 创建推理会话 Span */
  startReasoningSpan(sessionId: string, machineId: string): Span {
    return this.tracer.startSpan('reasoning.orchestrate', {
      attributes: { 'reasoning.session_id': sessionId, 'reasoning.machine_id': machineId },
    });
  }
  
  /** 记录阶段耗时 */
  recordPhaseDuration(parentSpan: Span, phaseName: string, durationMs: number): void {
    const childSpan = this.tracer.startSpan(`reasoning.${phaseName}`, { parent: parentSpan });
    childSpan.setAttribute('duration_ms', durationMs);
    childSpan.end();
  }
  
  /** 记录推理结果指标 */
  recordResult(result: HybridReasoningResult): void {
    this.e2eLatencyHistogram.record(result.observability.e2eLatencyMs);
    if (result.costGateDecision.grokTriggered) this.grokInvocationCounter.add(1);
    if (result.shortCircuit.triggered) this.shortCircuitCounter.add(1);
  }
  
  /** 记录降级事件 */
  recordDegradation(error: Error): void {
    this.degradationCounter.add(1, { error: error.message });
  }
}
```

---

## 六、可观测性体系（v4.0 增强）

### 6.1 核心指标（v4.0 增强：分阶段告警阈值）

| 指标名称 | 类型 | 采集点 | 冷启动期告警 | 成熟期告警 | Prometheus 名称 |
|---------|------|--------|------------|----------|----------------|
| `e2e_latency_ms` | Histogram | Orchestrator 入口/出口 | P95 > 12000ms | P95 > 8000ms | `reasoning_e2e_latency_ms` |
| `hypothesis_hit_rate` | Gauge | 置信度融合后 | < 0.5 | < 0.7 | `reasoning_hypothesis_hit_rate` |
| `physics_verification_rate` | Gauge | 物理验证阶段 | < 0.5 | < 0.8 | `reasoning_physics_verification_rate` |
| `grok_invocation_rate` | Gauge | CostGate 出口 | > 0.50 | > 0.20 | `reasoning_grok_invocation_rate` |
| `causal_graph_hit_rate` | Gauge | 因果溯源阶段 | < 0.3 | < 0.5 | `reasoning_causal_hit_rate` |
| `experience_hit_rate` | Gauge | 经验检索阶段 | < 0.05 | < 0.3 | `reasoning_experience_hit_rate` |
| `short_circuit_rate` | Gauge | 短路判定点 | — | — | `reasoning_short_circuit_rate` |
| `mapping_skip_rate` | Gauge | 映射置信度过滤 | > 0.7 | > 0.5 | `reasoning_mapping_skip_rate` |
| `boundary_violation_rate` | Gauge | 参数边界校验 | > 0.5 | > 0.3 | `reasoning_boundary_violation_rate` |
| `feedback_error_rate` | Gauge | 知识反馈环 | > 0.2 | > 0.1 | `reasoning_feedback_error_rate` |
| `degradation_count` | Counter | 降级保护 | > 5/hour | > 3/hour | `reasoning_degradations_total` |
| `causal_graph_size` | Gauge | 因果图统计 | nodes > 500 | nodes > 500 | `reasoning_causal_graph_nodes` |

> **physics_verification_rate 计算口径（v4.0 明确）**：分母 = 通过映射置信度过滤的候选假设数量；分子 = 完成物理验证且 feasibilityScore > 0.2 的假设数量。被 `mappingConfidence < 0.4` 跳过的假设不计入分母。

### 6.2 决策日志

每个推理会话自动记录完整的决策日志（`DecisionLogEntry[]`），包含每阶段的输入数量、输出数量、过滤掉的假设及原因、关键决策点。决策日志存储在 `reasoning_experiences.trace` 字段中，支持前端可视化回放。

### 6.3 延迟预算分配

| 路由类型 | 总预算 | 阶段 0-1 | 阶段 2 | 阶段 3 | 阶段 4 | 阶段 5-6 | 融合 |
|---------|--------|---------|--------|--------|--------|---------|------|
| 完整流程 | 8000ms | 200ms | 500ms | 1000ms | 3000ms | 3000ms | 300ms |
| 紧急通道 | 3000ms | 100ms | 300ms | — | 2000ms | — | 600ms |
| 快速通道 | 1000ms | 100ms | — | — | — | — | 900ms |
| LLM 直推 | 15000ms | 100ms | — | — | — | 14500ms | 400ms |

### 6.4 OpenTelemetry 集成架构（v4.0 新增）

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ Reasoning   │────▶│ OTel SDK     │────▶│ Prometheus   │
│ Orchestrator│     │ (Spans +     │     │ Exporter     │
│             │     │  Metrics)    │     │              │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                │
                                         ┌──────▼───────┐
                                         │  Grafana     │
                                         │  Dashboard   │
                                         └──────────────┘
```

---

## 七、前端增强（v4.0）

### 7.1 因果图可视化 — react-force-graph（v4.0 变更）

**文件**: `client/src/pages/cognitive/CausalGraphView.tsx`

v4.0 将因果图可视化库从 Cytoscape.js 改为 **react-force-graph**（力导向图），更轻量且交互性更好：

- **节点颜色**：按 `data_source` 区分（expert_input=蓝色、auto_generated=灰色、grok_5why=橙色）
- **边宽度**：按 `strength` 映射（0~1 → 1~5px）
- **干预高亮**：`doIntervention()` 结果中的 `affectedNodes` 高亮为红色
- **可识别性标记**：不可识别的路径用虚线标注 + 警告 tooltip
- **实验模式水印**：当显示 challenger 路径的推理结果时，界面右上角显示"实验模式"水印

### 7.2 经验池管理

**文件**: `client/src/pages/cognitive/ExperiencePoolView.tsx`

- 三层内存切换 Tab（Episodic/Semantic/Procedural）
- 衰减模式指示器（显示当前使用的衰减维度：单维/二维/三维）
- 经验条目数量和阶段指示（冷启动/成长/成熟）

### 7.3 不确定性可视化（v4.0 新增）

在认知仪表盘的推理结果展示中，假设置信度显示为 **置信度带**（而非单一数值）：

```
轴承磨损   ████████████░░░   0.82 ± 0.12
           ↑ Bel=0.70        ↑ Pl=0.94
           不确定性来源：因果路径(60%) | 物理验证(30%) | 经验匹配(10%)
```

---

## 八、DB 表设计

### 8.1 新增表（7 张 + 1 张 revision_log）

```sql
-- 1. 因果节点
CREATE TABLE causal_nodes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  node_type TEXT NOT NULL CHECK (node_type IN ('symptom','mechanism','root_cause','condition')),
  domain TEXT NOT NULL CHECK (domain IN ('vibration','thermal','electrical','structural','corrosion','hydraulic','wire_rope')),
  description TEXT DEFAULT '',
  data_source TEXT DEFAULT 'expert_input' CHECK (data_source IN ('expert_input','auto_generated','grok_5why')),
  confidence_level TEXT DEFAULT 'medium' CHECK (confidence_level IN ('high','medium','low')),
  observable BOOLEAN DEFAULT true,          -- v4.0: 标记是否可直接观测
  embedding vector(384),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ
);

-- 2. 因果边
CREATE TABLE causal_edges (
  id SERIAL PRIMARY KEY,
  source_id INTEGER REFERENCES causal_nodes(id),
  target_id INTEGER REFERENCES causal_nodes(id),
  relation_type TEXT NOT NULL CHECK (relation_type IN ('causes','indicates','accelerates','inhibits')),
  strength REAL DEFAULT 0.5 CHECK (strength BETWEEN 0 AND 1),
  data_source TEXT DEFAULT 'expert_input',
  confidence_level TEXT DEFAULT 'medium',
  verification_count INTEGER DEFAULT 0,
  last_verified_at TIMESTAMPTZ,
  decay_factor REAL DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 因果边变更日志（v3.0 新增）
CREATE TABLE causal_edge_revisions (
  id SERIAL PRIMARY KEY,
  edge_id INTEGER REFERENCES causal_edges(id),
  old_strength REAL,
  new_strength REAL,
  change_reason TEXT,
  crystal_id TEXT,
  reward REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 推理经验
CREATE TABLE reasoning_experiences (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  machine_type TEXT NOT NULL,
  machine_age INTEGER DEFAULT 0,
  anomaly_type TEXT NOT NULL,
  stimulus_summary JSONB DEFAULT '{}',
  hypotheses JSONB DEFAULT '[]',
  final_diagnosis TEXT,
  reward REAL DEFAULT 0,
  trace JSONB DEFAULT '{}',
  operation_vector REAL[] DEFAULT '{}',
  embedding vector(384),
  memory_layer TEXT DEFAULT 'episodic' CHECK (memory_layer IN ('episodic','semantic','procedural')),
  decay_mode TEXT DEFAULT 'temporal',        -- v4.0
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 推理策略
CREATE TABLE reasoning_strategies (
  id TEXT PRIMARY KEY,
  anomaly_domain TEXT NOT NULL,
  strategy_type TEXT NOT NULL,
  description TEXT DEFAULT '',
  success_rate REAL DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  embedding vector(384),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 推理过程模板
CREATE TABLE reasoning_procedures (
  id TEXT PRIMARY KEY,
  tool_sequence JSONB DEFAULT '[]',
  json_schema JSONB DEFAULT '{}',
  success_rate REAL DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 推理可观测性日志（v4.0 增强）
CREATE TABLE reasoning_observability_logs (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  route_used TEXT NOT NULL,
  e2e_latency_ms INTEGER NOT NULL,
  phase_durations JSONB DEFAULT '{}',
  grok_invoked BOOLEAN DEFAULT false,
  short_circuit_triggered BOOLEAN DEFAULT false,
  hypothesis_hit BOOLEAN DEFAULT false,
  degradation BOOLEAN DEFAULT false,
  uncertainty_total REAL DEFAULT 0,         -- v4.0
  uncertainty_sources JSONB DEFAULT '{}',   -- v4.0
  promotion_stats JSONB,                    -- v4.0: Shadow Mode 统计
  decision_log JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_exp_embedding ON reasoning_experiences
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX idx_exp_machine ON reasoning_experiences (machine_type, machine_age);
CREATE INDEX idx_strategy_embedding ON reasoning_strategies
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);
CREATE INDEX idx_causal_node_domain ON causal_nodes (domain, node_type);
CREATE INDEX idx_causal_edge_source ON causal_edges (source_id);
CREATE INDEX idx_causal_edge_target ON causal_edges (target_id);
CREATE INDEX idx_obs_session ON reasoning_observability_logs (session_id);
CREATE INDEX idx_obs_created ON reasoning_observability_logs (created_at);
```

---

## 九、新增文件清单

| 序号 | 文件路径 | 预估行数 | 说明 |
|------|---------|---------|------|
| 1 | `cognition/reasoning/physics-verifier.ts` | ~520 | 方程残差代理 + 边界校验 + 映射置信度过滤 + 不确定性 |
| 2 | `cognition/reasoning/residual-proxy.ts` | ~180 | 方程残差代理独立模块（v4.0 新增） |
| 3 | `cognition/reasoning/causal-graph.ts` | ~680 | 8条种子链 + 5-Why + 膨胀控制 + 可识别性检验（v4.0） |
| 4 | `cognition/reasoning/experience-pool.ts` | ~580 | 三层内存 + 自适应降维衰减（v4.0） |
| 5 | `cognition/reasoning/hybrid-orchestrator.ts` | ~800 | 动态路由 + 短路 + 自适应并发（v4.0）+ CostGate校准 + 不确定性传播 |
| 6 | `cognition/reasoning/knowledge-feedback.ts` | ~300 | 误反馈保护 + RL 奖励 + revision_log |
| 7 | `cognition/reasoning/vector-store.ts` | ~200 | pgvector 统一层 + fallback |
| 8 | `cognition/reasoning/tool-templates.ts` | ~180 | 半结构化工具编排模板（7 域） |
| 9 | `cognition/reasoning/observability.ts` | ~250 | OpenTelemetry + Prometheus exporter（v4.0） |
| 10 | `cognition/reasoning/statistical-utils.ts` | ~80 | 双样本比例检验 + normalCDF（v4.0 新增） |
| 11 | `cognition/reasoning/index.ts` | ~35 | 模块导出 |
| 12 | `drizzle/evolution-schema.ts`（追加） | ~120 | 8 张新表（含向量列 + revision_log + observability_logs） |
| 13 | `domains/cognition/cognition.domain-router.ts`（修改） | ~280 | 新增因果图/经验池/编排器/可观测性/晋升统计 API |
| 14 | `client/src/pages/cognitive/CausalGraphView.tsx` | ~520 | react-force-graph 因果图可视化 + 可识别性标记 |
| 15 | `client/src/pages/cognitive/ExperiencePoolView.tsx` | ~420 | 经验池三层内存管理 + 衰减模式指示 |

**合计**: 新增约 5145 行，修改约 400 行。

---

## 十、修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `cognition/dimensions/reasoning-processor.ts` | 集成 HybridOrchestrator + Shadow Mode + 统计显著性晋升（v4.0）+ 降级保护 |
| `cognition/knowledge/knowledge-crystallizer.ts` | 新增 KnowledgeFeedbackLoop 事件发布 |
| `cognition/engines/cognition-unit.ts` | 注入 HybridOrchestrator 和 VectorStore |
| `cognition/grok/grok-tool-calling.ts` | 接收半结构化工具编排模板 + Procedural 层 hint |
| `cognition/champion/champion-challenger.ts` | 新增统计显著性晋升逻辑（v4.0） |
| `cognition/worldmodel/world-model.ts` | 导出方程接口 + 参考残差配置（v4.0） |
| `cognition/index.ts` | 导出新模块 |
| `client/src/pages/cognitive/CognitiveDashboard.tsx` | 新增/替换 Tab 内容 + 不确定性可视化 + 实验模式水印 |

---

## 十一、实施计划（v4.0 增强）

| 阶段 | 内容 | 预估工时 | 依赖 | 优先级 |
|------|------|---------|------|--------|
| P2-0 | **PINN 落地路径专项预研**（方程残差代理 vs 预训练模型对比） | 2h | 无 | P0 |
| P2-1 | VectorStore + pgvector 配置 | 1.5h | 无 | P0 |
| P2-2 | PhysicsVerifier + ResidualProxy（方程残差代理）+ DB 表 | 4h | P2-0, P2-1 | P0 |
| P2-3 | BuiltinCausalGraph（8条种子链 + 可识别性检验）+ **领域专家评审会** | 5.5h | P2-1 | P0 |
| P2-4 | ExperiencePool（自适应降维衰减）+ DB 表 | 4h | P2-1 | P0 |
| P2-5 | HybridOrchestrator（自适应并发 + CostGate校准 + 不确定性传播）+ **CostGate 压力测试** | 6h | P2-2, P2-3, P2-4 | P0 |
| P2-6 | 半结构化工具编排模板（7 域） | 1.5h | P2-5 | P1 |
| P2-7 | KnowledgeFeedbackLoop（误反馈保护 + RL 奖励） | 2.5h | P2-3, P2-4 | P0 |
| P2-8 | ReasoningProcessor 集成 + Shadow Mode（统计显著性晋升）+ 降级保护 | 3h | P2-5, P2-7 | P0 |
| P2-9 | 可观测性层（OpenTelemetry + Prometheus + 分阶段告警） | 2.5h | P2-5 | P0 |
| P2-10 | API 端点 + 路由（含晋升统计 API） | 2.5h | P2-5 | P1 |
| P2-11 | 前端界面（react-force-graph 因果图 + 经验池 + 不确定性可视化 + 实验模式水印） | 5h | P2-10 | P1 |
| P2-12 | TypeScript 编译验证 + 推送 | 1h | 全部 | P0 |
| **P2-13** | **单元测试**（computeDecayWeight、checkBoundaryConstraints、computeMappingConfidence、shouldPromoteChallenger、computePValue、computeResidual 等核心函数） | **7h** | 全部 | **P0** |
| **P2-14** | **评测数据集构建**（50条冷启动集 + 100条回归集） | **3h** | P2-3 | **P0** |

**总预估**: 约 **51 小时**（v3.0 为 35h，新增 16h：预研 2h + 专家评审 0.5h + 压力测试 1h + 单元测试 7h + 评测数据集 3h + 各模块增量 2.5h）

**推荐实施顺序**：
1. **预研与基础**（P2-0 → P2-1）：PINN 路径确认 + VectorStore
2. **核心引擎**（P2-3 → P2-2 → P2-4）：因果图（含专家评审）+ 物理验证器 + 经验池
3. **闭环编排**（P2-5 → P2-6 → P2-7 → P2-8 → P2-9）：编排器 + 工具模板 + 反馈环 + 集成 + 可观测性
4. **质量保障**（P2-13 → P2-14）：单元测试 + 评测数据集
5. **界面呈现**（P2-10 → P2-11 → P2-12）：API + 前端 + 验证推送

---

## 十二、风险与缓解（v4.0 增强）

| 风险 | 影响 | 缓解措施 | v4.0 新增保护 |
|------|------|---------|-------------|
| pgvector 扩展未安装 | 向量检索不可用 | fallback 到关键词匹配 | `VectorStore.checkAvailability()` |
| 方程残差精度不如 PINN | 物理验证评分偏差 | WorldModel 方程已验证 | **v4.0: 残差代理 + 预留 PINN 接口** |
| 5-Why 补全生成低质量节点 | 因果图噪声增大 | `auto_generated` 标记 | 膨胀控制 + 30天休眠清理 |
| 三维衰减冷启动伪精度 | 经验池误导推理 | — | **v4.0: 自适应降维（<50→单维）** |
| CostGate 阈值不准 | Grok 调用率偏高 | 初始 0.7，自适应调整 | **v4.0: 压力测试校准 + 抑制因子** |
| Shadow Mode 误晋升 | 不成熟路径上线 | 最短 50 次会话 | **v4.0: 100次+5pp+p<0.05+延迟≤120%** |
| 误反馈污染因果图 | 错误记忆正向强化 | 最小样本数 3 | revision_log 回滚 |
| 推理延迟超标 | 安全性场景不满足 | 延迟预算 + 紧急通道 | **v4.0: 自适应并发 4~12** |
| 未观测混淆变量 | 干预分析假阳性 | — | **v4.0: 可识别性检验 + 警告** |
| 种子数据未经验证 | 推理基础不准确 | data_source 字段 | **v4.0: 领域专家评审会** |
| 单元测试缺失 | 复杂逻辑静默错误 | — | **v4.0: P2-13 专项测试（7h）** |
| 前端混淆实验/生产 | 操作人员误判 | — | **v4.0: 实验模式水印** |

---

## 十三、与 Phase 1 的衔接

Phase 1 的感知层增强为 Phase 2 提供了以下基础设施：

**BPABuilder 的模糊 BPA** 直接为 HybridOrchestrator 的信号分类阶段提供精确的异常严重度量化。BPA 中的梯形/三角形/高斯隶属度值可作为 D-S 证据体的基础质量函数，同时为动态路由提供异常严重度输入。

**StateVectorSynthesizer 的 21 维向量** 作为 PhysicsVerifier 的 `currentState` 参数和 ExperiencePool 的工况向量（`operation_similarity` 计算），提供完整的设备物理状态快照。

**DS-Fusion Engine 的统一适配器** 被 HybridOrchestrator 的置信度融合阶段复用，将 4 条路径的输出统一转换为 D-S 证据体进行融合。

**perception-persistence.service** 的 drizzle 模式被 Phase 2 的 8 张新表复用，保持 DB 操作风格一致。

---

## References

[1]: Enhanced Causal Fault Knowledge Graph (ECFKG) — 2025 工业故障因果知识图谱增强方法  
[2]: Physics-Informed Probabilistic Deep Network (PIPDN) — 2025 物理信息概率深度网络  
[3]: Agent Record & Replay — LLM Agent 经验记录与重放机制  
[4]: Causal Intervention GNN — 因果干预图神经网络  
[5]: How Memory is Implemented in LLM-based Agents — LLM Agent 记忆架构综述 2026  
[6]: Back-door Criterion and Identifiability — Pearl, J. (2009) Causality: Models, Reasoning, and Inference  
[7]: OpenTelemetry Specification — https://opentelemetry.io/docs/specs/  
[8]: react-force-graph — https://github.com/vasturiano/react-force-graph

> **审阅说明**: 本 v4.0 方案在 v3.0 基础上整合了意见 2.0 两份深度评审的 16 项增强，重点解决了量化目标可信度、PINN 工程化路径、冷启动鲁棒性、统计显著性晋升和端到端不确定性传播等深层问题。确认后即可按实施计划开始开发。
