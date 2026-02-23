# 自主进化闭环升级方案 v2.0（FSD 驱动）

> **文档编号**：XLP-EVO-LOOP-002  
> **版本**：v2.0（FSD 驱动升级）  
> **编制日期**：2026-02-24  
> **适用范围**：洗炼平台 — FSD-Evolution Engine v3.0（Mini-FSD 系统）  
> **编制**：Manus AI  
> **版本历史**：  
> - v1.0（2026-02-23）：基础自主进化闭环方案（E1-E19）  
> - v2.0（2026-02-24）：整合 Tesla FSD v14 核心机制，升级为 Mini-FSD 系统（E1-E35）

---

## 一、背景与目标

### 1.1 背景

洗炼平台 v2.0 已实现 Agentic 多代理自治，但仍停留在"平台内闭环"。Tesla FSD v14（2026 年 2 月最新）已证明：**真正的超级智能只能源于真实世界车队级数据飞轮 + 端到端神经网络 + Shadow Mode + Intervention Rate 驱动** [1]。洗炼平台现有四大模块（影子评估、冠军-挑战者、金丝雀部署、飞轮编排）与 FSD 高度同构，因此我们将整个进化引擎直接重构为 **"Mini-FSD 系统"** —— 把每一次模型部署都当成一辆"上路测试车"，把全平台流量当成"全球车队"。

### 1.2 目标（FSD 级量化）

| 目标维度 | 量化指标 | FSD 对标 |
|---|---|---|
| **干预率** | Intervention Rate ≤ 1/800 次 | FSD 城市道路接管里程 |
| **单周期提升** | 单飞轮周期性能提升 ≥15%（准确率/用户满意度） | FSD 版本迭代提升率 |
| **数据飞轮吞吐** | 真实流量 + 仿真双飞轮，百万"虚拟里程"/天 | FSD 全球车队数据量 |
| **端到端支持率** | 端到端模型进化支持率 ≥70%（从模块化到 Video-to-Action） | FSD End-to-End Neural Net |
| **安全部署** | 5 阶段 OTA 渐进部署 + 自动难例挖掘，安全零事故 | FSD Phased OTA Rollout |
| **知识沉淀** | 知识结晶从 DB → Video Trajectory Knowledge Graph + Model Merging | FSD Data Engine |

---

## 二、FSD 核心机制 → 洗炼平台映射表

### 2.1 机制映射

| FSD v14 机制 | 洗炼平台 v3.0 对应模块 | 升级亮点 |
|---|---|---|
| **Shadow Mode** | 影子评估器 → Shadow Fleet Mode | 全流量后台运行 + 轨迹差异采集 |
| **Data Engine + Fleet Learning** | 飞轮编排器 → 双飞轮（Real + Sim） | 自动难例挖掘 + Auto-Labeling |
| **End-to-End Neural Net** | 新增 End-to-End Evolution Agent | Video/Multi-modal 直接输出决策（MindVLA 式） |
| **Intervention / Disengagement Rate** | 全新 KPI 仪表盘 | 干预率成为核心进化信号 |
| **Simulation + Auto Labeling** | 新增 High-Fidelity Simulation Engine | 1:1 复现生产场景 |
| **Phased OTA Rollout** | 金丝雀部署器 → OTA 5 阶段 + Fleet Canary | 车队式分批推送 |
| **Dojo Training Cluster** | 集成 Dojo-style Scalable Training | 视频序列专属超算调度 |
| **Neural Planner** | Champion-Challenger → Fleet Neural Planner | 全局最优挑战者决策 |

### 2.2 FSD 经典数据飞轮（复刻到洗炼平台）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FSD Data Engine → 洗炼平台数据飞轮                     │
│                                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │ 真实流量  │───▶│ 难例挖掘  │───▶│ Auto     │───▶│ 模型训练  │          │
│  │ Shadow   │    │ Interven │    │ Labeling │    │ Dojo     │          │
│  │ Fleet    │    │ Mining   │    │ Pipeline │    │ Training │          │
│  └──────────┘    └──────────┘    └──────────┘    └────┬─────┘          │
│       ▲                                               │                │
│       │              数据飞轮闭环                        │                │
│       │                                               ▼                │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │ 知识结晶  │◀───│ 效果验证  │◀───│ OTA 部署  │◀───│ 端到端   │          │
│  │ Video KG │    │ A/B Test │    │ 5-Stage  │    │ E2E Agent│          │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘          │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │         仿真飞轮 (Simulation Flywheel)                           │   │
│  │  高保真复现 │ 场景生成 │ 自动标注 │ 回归测试 │ 覆盖率分析        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 三、现状审计

### 3.1 现有模块盘点

| 模块 | 文件路径 | 行数 | 当前能力 | FSD 对标缺失 |
|---|---|---|---|---|
| 影子评估器 | `evolution/shadow/shadow-evaluator.ts` | 437→580 | McNemar、DS 融合、蒙特卡洛、DB 持久化（v2.0） | Shadow Fleet 全流量模式、轨迹差异采集、干预率计算 |
| 冠军-挑战者 | `evolution/champion/champion-challenger.ts` | 422→550 | 自动晋升、多模型竞争、健康检查（v2.0） | Fleet Neural Planner 全局优化、模型合并 |
| 金丝雀部署器 | `evolution/canary/canary-deployer.ts` | 370 | 流量路由、自动回滚、指标监控 | OTA 5 阶段车队式部署、地域/用户分批 |
| 飞轮编排器 | `evolution/flywheel/evolution-flywheel.ts` | 343 | 5 步闭环编排 | 双飞轮（Real+Sim）、自动难例挖掘、Auto-Labeling |
| Domain Router | `domains/evolution/evolution.domain-router.ts` | 418 | 6 个子路由 | 大部分 mutation 空壳 |
| 前端面板 | `pages/evolution/EvolutionBoard.tsx` | 518 | 4 个 Tab（Mock 数据） | FSD 干预率仪表盘、数据飞轮可视化 |

### 3.2 DDL 现状

| 表名 | 状态 | 用途 |
|---|---|---|
| `evolution_shadow_evaluations` | 已有 | 影子评估记录 |
| `evolution_canary_deployments` | 已有 | 金丝雀部署记录 |
| `evolution_flywheel_cycles` | 已有 | 飞轮周期记录 |
| `evolution_auto_rules` | v2.0 新建 | 自动化规则配置 |
| `evolution_flywheel_logs` | v2.0 新建 | 飞轮步骤日志 |
| `evolution_model_registry` | v2.0 新建 | 模型注册表（含生命周期） |
| `evolution_deployment_plans` | v2.0 新建 | 部署计划详情 |
| `evolution_interventions` | **v3.0 新建** | 干预记录（决策轨迹、视频片段、干预原因） |
| `evolution_simulations` | **v3.0 新建** | 仿真场景库 |
| `evolution_video_trajectories` | **v3.0 新建** | KG 节点（视频嵌入 + 时序关系） |

---

## 四、目标架构（FSD 风格）

### 4.1 FSD-Evolution Engine v3.0 架构

```
┌───────────────────────────────────────────────────────────────────────────┐
│                FSD-Evolution Engine v3.0 (Mini-FSD System)                │
│                                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐          │
│  │ Shadow Fleet │→│ Data Engine  │→│ End-to-End Evolution  │          │
│  │ (全流量影子)  │  │ (真实+仿真)  │  │ Agent (MindVLA 式)    │          │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬────────────┘          │
│         │                 │                      │                       │
│         ▼                 ▼                      ▼                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐          │
│  │ Intervention │  │ Auto-Label + │  │ Fleet Neural Planner  │          │
│  │ Scoring      │  │ KG 结晶      │  │ (冠军挑战者)           │          │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬────────────┘          │
│         │                 │                      │                       │
│         └─────────────────┼──────────────────────┘                       │
│                           ▼                                              │
│              ┌────────────────────────┐                                  │
│              │ OTA Phased Canary      │◀── 5 阶段车队式渐进部署           │
│              │ (0%→5%→20%→50%→100%)   │                                  │
│              └────────────────────────┘                                  │
│                                                                           │
│  Core: LangGraph Multi-Agent + Temporal + Video Trajectory KG            │
│  Observability: Intervention Rate + Phoenix AIOps + Grafana FSD 面板     │
└───────────────────────────────────────────────────────────────────────────┘
```

### 4.2 部署策略矩阵（OTA 5 阶段）

| 阶段 | 流量占比 | 持续时间 | 回滚阈值 | 健康检查维度 | FSD 对标 |
|---|---|---|---|---|---|
| Shadow Fleet | 0%（镜像流量） | 24h | 任何退化 | 延迟、错误率、资源占用 | Shadow Mode |
| Canary | 5% | 48h | >5% 退化 | 延迟、错误率、准确率 | Early Access Fleet |
| Gray | 20% | 72h | >3% 退化 | 延迟、错误率、准确率 | Regional OTA |
| Half | 50% | 48h | >2% 退化 | 全维度 | Wide OTA |
| Full | 100% | — | >1% 退化 | 全维度 | General Availability |

### 4.3 自动回滚策略

| 回滚类型 | 触发条件 | 回滚动作 | FSD 对标 |
|---|---|---|---|
| `auto_error` | 错误率 > 5%（连续 3 次） | 立即回滚至冠军版本 | Disengagement → Fallback |
| `auto_latency` | P95 延迟 > 500ms（连续 3 次） | 立即回滚至冠军版本 | Latency Spike → Revert |
| `auto_performance` | 准确率退化 > 5%（连续 3 次） | 立即回滚至冠军版本 | Performance Regression |
| `auto_safety` | 内存 > 4096MB | 立即回滚至冠军版本 | Safety Critical |
| `auto_intervention` | 干预率 > 1/200（连续 1h） | 立即回滚至冠军版本 | **FSD 新增：Intervention Rate** |
| `manual` | 人工触发 | 回滚至冠军版本 | Manual Override |

---

## 五、升级项清单

### 5.1 基础进化闭环（E1-E19，v1.0 已规划）

#### E1-E4：影子评估引擎升级

| 编号 | 升级项 | 说明 | 状态 |
|---|---|---|---|
| E1 | DB 持久化 | 评估报告写入 `evolution_shadow_evaluations` | ✅ 已完成 |
| E2 | A/B 统计显著性检验 | Welch's t-test + Bootstrap 置信区间 | ✅ 已完成 |
| E3 | 自动化触发机制 | EventBus 事件驱动触发链 | ✅ 已完成 |
| E4 | Prometheus 埋点 | 评估总数、耗时、得分分布 | ✅ 已完成 |

#### E5-E8：Champion-Challenger 竞争机制升级

| 编号 | 升级项 | 说明 | 状态 |
|---|---|---|---|
| E5 | 自动晋升决策 | 基于影子评估得分自动选择最佳挑战者 | ✅ 已完成 |
| E6 | 多模型竞争排行榜 | 支持 ≥3 个挑战者同时竞争 | ✅ 已完成 |
| E7 | 健康检查集成 | 多维度健康检查 + 自动回滚 | ✅ 已完成 |
| E8 | 模型生命周期追踪 | 完整状态机：registered → champion → retired | ✅ 已完成 |

#### E9-E12：金丝雀发布引擎升级

| 编号 | 升级项 | 说明 | 状态 |
|---|---|---|---|
| E9 | 多阶段渐进式部署 | 5 阶段（0%→5%→20%→50%→100%） | 🔄 进行中 |
| E10 | 与 Champion-Challenger 联动 | 接收部署计划，自动执行流量切换 | ⏳ 待开始 |
| E11 | DB 持久化 | 部署记录含阶段详情、健康检查结果 | ⏳ 待开始 |
| E12 | Prometheus 埋点 | 部署总数、流量百分比、回滚次数 | ⏳ 待开始 |

#### E13-E16：飞轮周期编排器升级

| 编号 | 升级项 | 说明 | 状态 |
|---|---|---|---|
| E13 | 自动调度 | 定时自动触发进化周期 | ⏳ 待开始 |
| E14 | 步骤日志持久化 | 每步执行详情写入 DB | ⏳ 待开始 |
| E15 | 性能趋势分析 | 历史数据自动判断趋势 | ⏳ 待开始 |
| E16 | 闭环验证 | 周期前后关键指标对比 | ⏳ 待开始 |

#### E17-E19：路由 + 前端 + Seed

| 编号 | 升级项 | 说明 | 状态 |
|---|---|---|---|
| E17 | Domain Router 增强 | 填充空壳 mutation，新增 15+ 路由 | ⏳ 待开始 |
| E18 | 前端页面升级 | Mock → tRPC，新增进化闭环 + 飞轮周期 Tab | ⏳ 待开始 |
| E19 | Seed 数据 | 自动化规则和飞轮日志初始化数据 | ⏳ 待开始 |

### 5.2 FSD 专属升级（E20-E35，v2.0 新增）

#### E20-E24：Shadow Fleet Mode 全面重构

全平台实例后台运行影子模型，记录"人类干预"与"模型决策"轨迹差异，实现 FSD Shadow Mode 的工业平台版本。

| 编号 | 升级项 | 说明 |
|---|---|---|
| E20 | Shadow Fleet 全流量模式 | 每个平台实例后台运行影子模型，镜像所有请求 |
| E21 | 轨迹差异采集 | 记录人类决策 vs 模型决策的完整轨迹差异 |
| E22 | 自动难例挖掘 | Intervention Rate > 阈值的请求自动入库为难例 |
| E23 | 干预率计算引擎 | 实时计算 Intervention Rate，作为核心进化信号 |
| E24 | 视频/多模态序列持久化 | 支持视频、图像、时序数据等多模态输入的持久化存储 |

**核心代码示例（E20 Shadow Fleet）**：

```typescript
// Shadow Fleet Mode — 全流量镜像
interface ShadowFleetConfig {
  enabled: boolean;
  mirrorPercentage: number;        // 镜像流量百分比（默认 100%）
  maxConcurrentShadows: number;    // 最大并发影子实例
  trajectoryRetentionDays: number; // 轨迹保留天数
  interventionThreshold: number;   // 干预率阈值（触发难例挖掘）
}

class ShadowFleetManager {
  // 为每个请求创建影子执行
  async mirrorRequest(request: PlatformRequest): Promise<ShadowResult> {
    const [humanDecision, shadowDecision] = await Promise.all([
      this.executeProduction(request),
      this.executeShadow(request),
    ]);
    
    const trajectory = this.recordTrajectory(humanDecision, shadowDecision);
    
    // 干预检测：人类决策与模型决策不一致 = 一次"干预"
    if (this.isIntervention(humanDecision, shadowDecision)) {
      await this.recordIntervention(trajectory);
      this.interventionCounter.inc({ model: shadowDecision.modelId });
    }
    
    return { trajectory, divergence: this.computeDivergence(humanDecision, shadowDecision) };
  }
}
```

**核心代码示例（E23 干预率计算）**：

```typescript
// Intervention Rate 计算引擎
class InterventionRateEngine {
  // 滑动窗口干预率
  computeRate(windowMs: number = 3600_000): InterventionRate {
    const window = this.getWindow(windowMs);
    return {
      rate: window.interventions / window.totalDecisions,
      inverseMileage: window.totalDecisions / Math.max(window.interventions, 1),
      trend: this.computeTrend(windowMs),
      // FSD 风格：1/N 表示（每 N 次决策发生 1 次干预）
      fsdStyle: `1/${Math.round(window.totalDecisions / Math.max(window.interventions, 1))}`,
    };
  }
}
```

#### E25-E28：双飞轮 + Simulation Engine

真实世界飞轮（生产流量）与仿真飞轮（高保真复现）并行运转，实现 FSD Data Engine 的完整复刻。

| 编号 | 升级项 | 说明 |
|---|---|---|
| E25 | 双飞轮架构 | Real-World Flywheel + Simulation Flywheel 并行 |
| E26 | High-Fidelity Simulation Engine | 1:1 复现生产场景，支持参数化变异 |
| E27 | Auto-Labeling Pipeline | 视频轨迹自动标注，干预率驱动优先级排序 |
| E28 | 难例优先级排序 | 基于干预率和影响范围自动排序难例优先级 |

**核心代码示例（E25 双飞轮）**：

```typescript
class DualFlywheelOrchestrator {
  private realWorldFlywheel: EvolutionFlywheel;
  private simulationFlywheel: SimulationFlywheel;
  
  async runDualCycle(): Promise<DualCycleReport> {
    // 并行运行真实世界飞轮和仿真飞轮
    const [realReport, simReport] = await Promise.all([
      this.realWorldFlywheel.runCycle(),
      this.simulationFlywheel.runCycle(),
    ]);
    
    // 交叉验证：仿真结果必须与真实世界一致
    const crossValidation = this.crossValidate(realReport, simReport);
    
    // 合并难例：真实 + 仿真发现的难例合并去重
    const mergedHardCases = this.mergeHardCases(
      realReport.hardCases,
      simReport.hardCases,
    );
    
    return { realReport, simReport, crossValidation, mergedHardCases };
  }
}
```

**核心代码示例（E26 仿真引擎）**：

```typescript
class HighFidelitySimulationEngine {
  // 从生产难例创建仿真场景
  async createScenarioFromIntervention(intervention: InterventionRecord): Promise<SimScenario> {
    return {
      id: generateId(),
      sourceInterventionId: intervention.id,
      inputData: intervention.request,
      expectedOutput: intervention.humanDecision,
      variations: this.generateVariations(intervention, 10), // 10 个参数化变异
      fidelityScore: await this.computeFidelity(intervention),
    };
  }
  
  // 批量回归测试
  async runRegressionSuite(modelId: string, scenarios: SimScenario[]): Promise<RegressionReport> {
    const results = await Promise.all(
      scenarios.map(s => this.runScenario(modelId, s))
    );
    return {
      totalScenarios: scenarios.length,
      passed: results.filter(r => r.passed).length,
      coverageRate: results.filter(r => r.passed).length / scenarios.length,
      failedScenarios: results.filter(r => !r.passed),
    };
  }
}
```

#### E29-E31：End-to-End Evolution Agent

支持直接从多模态输入到决策输出（MindVLA 风格），以及模型合并（MergeKit + SLERP）自动生成下一代端到端候选。

| 编号 | 升级项 | 说明 |
|---|---|---|
| E29 | End-to-End Evolution Agent | 多模态输入 → 决策输出（MindVLA 式） |
| E30 | Model Merging Pipeline | MergeKit + SLERP 自动生成下一代候选 |
| E31 | 端到端评估框架 | 端到端模型专属评估指标和基准 |

**核心代码示例（E30 模型合并）**：

```typescript
class ModelMergingPipeline {
  // SLERP 合并两个模型权重
  async mergeModels(config: MergeConfig): Promise<MergedModel> {
    const { championModel, challengerModel, mergeRatio } = config;
    
    // 球面线性插值（SLERP）
    const mergedWeights = this.slerpMerge(
      championModel.weights,
      challengerModel.weights,
      mergeRatio, // 0.0 = 全冠军, 1.0 = 全挑战者
    );
    
    // 自动评估合并后模型
    const evaluation = await this.evaluateMergedModel(mergedWeights);
    
    return {
      modelId: `merged-${Date.now()}`,
      parentModels: [championModel.id, challengerModel.id],
      mergeRatio,
      weights: mergedWeights,
      evaluation,
    };
  }
}
```

#### E32：Fleet Neural Planner

全局优化 Champion-Challenger，考虑全车队（全实例）历史表现，而非单点比较。

```typescript
class FleetNeuralPlanner {
  // 全局最优挑战者选择（考虑所有实例的历史表现）
  async selectOptimalChallenger(fleet: FleetStatus[]): Promise<ChallengerDecision> {
    // 聚合全车队指标
    const fleetMetrics = this.aggregateFleetMetrics(fleet);
    
    // 多目标优化：准确率 × 延迟 × 资源效率 × 干预率
    const candidates = this.rankByMultiObjective(fleetMetrics, {
      weights: { accuracy: 0.4, latency: 0.2, efficiency: 0.1, interventionRate: 0.3 },
    });
    
    return candidates[0]; // 帕累托最优
  }
}
```

#### E33：OTA Phased Canary 车队部署

5 阶段 + 按地域/用户分批（类比 Tesla 车队 OTA），支持灰度策略配置。

```typescript
class OTAFleetCanary {
  // 车队式分批部署
  async deployToFleet(plan: DeploymentPlan): Promise<void> {
    const stages: OTAStage[] = [
      { name: 'shadow',  traffic: 0,   fleet: 'internal',     duration: 24 * 3600_000 },
      { name: 'canary',  traffic: 5,   fleet: 'early_access', duration: 48 * 3600_000 },
      { name: 'gray',    traffic: 20,  fleet: 'region_a',     duration: 72 * 3600_000 },
      { name: 'half',    traffic: 50,  fleet: 'global_50pct', duration: 48 * 3600_000 },
      { name: 'full',    traffic: 100, fleet: 'global_all',   duration: 0 },
    ];
    
    for (const stage of stages) {
      await this.executeStage(plan, stage);
      const health = await this.waitAndMonitor(stage);
      if (!health.passed) {
        await this.rollback(plan, stage, health.reason);
        return;
      }
    }
  }
}
```

#### E34：Intervention Rate 核心仪表盘

前端新增 "FSD 干预率趋势" Tab，实时显示百万次决策接管率。

#### E35：Dojo-style 训练集群调度

视频序列优先、Spot 实例 + Carbon-aware + 超大规模并行训练调度。

```typescript
class DojoTrainingScheduler {
  async scheduleTraining(job: TrainingJob): Promise<TrainingSession> {
    // 优先级：视频序列 > 多模态 > 文本
    const priority = this.computePriority(job);
    
    // Carbon-aware 调度：选择碳排放最低的时段
    const optimalWindow = await this.findLowCarbonWindow(job.estimatedDuration);
    
    // Spot 实例优化：利用闲置 GPU 降低成本
    const resources = await this.allocateResources(job, {
      preferSpot: true,
      maxCostPerHour: job.budget,
      minGpuCount: job.minGpus,
    });
    
    return { jobId: job.id, priority, scheduledAt: optimalWindow.start, resources };
  }
}
```

---

## 六、DDL 增量脚本

### 6.1 v2.0 已创建表（4 张）

已在 `docker/mysql/init/11-evo-loop-ddl.sql` 中创建：

- `evolution_auto_rules` — 自动化规则配置
- `evolution_flywheel_logs` — 飞轮步骤日志
- `evolution_model_registry` — 模型注册表
- `evolution_deployment_plans` — 部署计划详情

### 6.2 v3.0 新增表（3 张）

```sql
-- 1. 干预记录表（FSD Intervention Log）
CREATE TABLE IF NOT EXISTS evolution_interventions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  session_id      VARCHAR(64) NOT NULL,
  model_id        VARCHAR(100) NOT NULL,
  model_version   VARCHAR(50) NOT NULL,
  request_data    JSON NOT NULL COMMENT '原始请求',
  human_decision  JSON NOT NULL COMMENT '人类决策（生产结果）',
  shadow_decision JSON NOT NULL COMMENT '影子模型决策',
  divergence_score DECIMAL(5,4) NOT NULL COMMENT '差异分数 0-1',
  is_intervention TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否为干预（人类覆盖模型）',
  intervention_reason VARCHAR(200) DEFAULT NULL,
  video_trajectory_id INT DEFAULT NULL COMMENT '关联视频轨迹 KG 节点',
  severity        ENUM('low','medium','high','critical') DEFAULT 'low',
  auto_labeled    TINYINT(1) DEFAULT 0,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_model (model_id, model_version),
  INDEX idx_intervention (is_intervention, created_at),
  INDEX idx_severity (severity),
  INDEX idx_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. 仿真场景库表
CREATE TABLE IF NOT EXISTS evolution_simulations (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  scenario_id     VARCHAR(64) NOT NULL UNIQUE,
  source_type     ENUM('intervention','manual','generated','regression') NOT NULL,
  source_id       VARCHAR(64) DEFAULT NULL COMMENT '来源干预记录 ID',
  input_data      JSON NOT NULL,
  expected_output JSON NOT NULL,
  variations      JSON DEFAULT NULL COMMENT '参数化变异列表',
  fidelity_score  DECIMAL(5,4) DEFAULT NULL,
  difficulty      ENUM('easy','medium','hard','extreme') DEFAULT 'medium',
  tags            JSON DEFAULT NULL,
  run_count       INT DEFAULT 0,
  last_run_at     DATETIME DEFAULT NULL,
  pass_rate       DECIMAL(5,4) DEFAULT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_source (source_type, source_id),
  INDEX idx_difficulty (difficulty),
  INDEX idx_pass_rate (pass_rate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 视频轨迹知识图谱节点表
CREATE TABLE IF NOT EXISTS evolution_video_trajectories (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  trajectory_id   VARCHAR(64) NOT NULL UNIQUE,
  session_id      VARCHAR(64) NOT NULL,
  model_id        VARCHAR(100) NOT NULL,
  trajectory_type ENUM('decision','intervention','anomaly','milestone') NOT NULL,
  embedding       JSON DEFAULT NULL COMMENT '视频/多模态嵌入向量',
  temporal_index  INT NOT NULL COMMENT '时序索引',
  parent_id       INT DEFAULT NULL COMMENT '父节点（时序关系）',
  metadata        JSON DEFAULT NULL,
  content_hash    VARCHAR(64) DEFAULT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session (session_id),
  INDEX idx_model (model_id),
  INDEX idx_type (trajectory_type),
  INDEX idx_temporal (session_id, temporal_index),
  FOREIGN KEY (parent_id) REFERENCES evolution_video_trajectories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 扩展 evolution_shadow_evaluations 表
CALL safe_add_column('evolution_shadow_evaluations', 'intervention_rate', 'DECIMAL(10,6) DEFAULT NULL COMMENT "干预率"');
CALL safe_add_column('evolution_shadow_evaluations', 'total_decisions', 'INT DEFAULT 0 COMMENT "总决策数"');
CALL safe_add_column('evolution_shadow_evaluations', 'total_interventions', 'INT DEFAULT 0 COMMENT "总干预数"');
CALL safe_add_column('evolution_shadow_evaluations', 'hard_cases_count', 'INT DEFAULT 0 COMMENT "难例数量"');
```

---

## 七、实施计划

### 7.1 阶段划分

| 阶段 | 内容 | 升级项 | 预估工时 | 状态 |
|---|---|---|---|---|
| 6.0 | DDL + Drizzle Schema（v2.0） | — | 1h | ✅ 已完成 |
| 6.1 | 影子评估引擎 v2.0 | E1-E4 | 3h | ✅ 已完成 |
| 6.2 | Champion-Challenger v2.0 | E5-E8 | 3h | ✅ 已完成 |
| 6.3 | 金丝雀部署器 v2.0 | E9-E12 | 3h | 🔄 进行中 |
| 6.4 | 飞轮编排器 v2.0 | E13-E16 | 3h | ⏳ 待开始 |
| 6.5 | Domain Router 增强 | E17 | 2h | ⏳ 待开始 |
| 6.6 | 前端页面升级（基础） | E18 | 3h | ⏳ 待开始 |
| 6.7 | Seed 数据 | E19 | 0.5h | ⏳ 待开始 |
| 6.8 | 集成验证 | — | 1.5h | ⏳ 待开始 |
| **6.9** | **DDL + Schema（v3.0 FSD）** | — | **1.5h** | ⏳ 待开始 |
| **6.10** | **Shadow Fleet Mode 重构** | **E20-E24** | **4h** | ⏳ 待开始 |
| **6.11** | **双飞轮 + Simulation Engine** | **E25-E28** | **4h** | ⏳ 待开始 |
| **6.12** | **End-to-End Evolution Agent** | **E29-E31** | **4h** | ⏳ 待开始 |
| **6.13** | **Fleet Neural Planner + OTA** | **E32-E33** | **3h** | ⏳ 待开始 |
| **6.14** | **Intervention Rate 仪表盘** | **E34** | **2h** | ⏳ 待开始 |
| **6.15** | **Dojo-style 训练调度** | **E35** | **2h** | ⏳ 待开始 |
| **6.16** | **FSD 集成验证** | — | **2h** | ⏳ 待开始 |
| **合计** | | **35 项** | **42.5h** | |

### 7.2 优先级建议

**第一优先级（核心闭环，E1-E19）**：完成基础自主进化闭环，确保端到端流水线可用。

**第二优先级（FSD 核心，E20-E28）**：Shadow Fleet + 双飞轮 + 仿真引擎，这是 FSD 数据飞轮的核心。

**第三优先级（高级能力，E29-E35）**：端到端 Agent + 模型合并 + Dojo 训练，这些是长期竞争力。

---

## 八、文件变更清单

| 操作 | 文件路径 | 说明 |
|---|---|---|
| 已创建 | `docker/mysql/init/11-evo-loop-ddl.sql` | v2.0 DDL（4 张表） |
| **新建** | `docker/mysql/init/13-fsd-ddl.sql` | v3.0 FSD DDL（3 张表 + 字段扩展） |
| 修改 | `drizzle/evolution-schema.ts` | 新增 7 张表的 Drizzle Schema |
| 已重写 | `server/platform/evolution/shadow/shadow-evaluator.ts` | v2.0 影子评估引擎 |
| 已重写 | `server/platform/evolution/champion/champion-challenger.ts` | v2.0 Champion-Challenger |
| 重写 | `server/platform/evolution/canary/canary-deployer.ts` | v2.0 金丝雀部署器 |
| 重写 | `server/platform/evolution/flywheel/evolution-flywheel.ts` | v2.0 飞轮编排器 |
| **新建** | `server/platform/evolution/shadow/shadow-fleet-manager.ts` | Shadow Fleet 全流量管理器 |
| **新建** | `server/platform/evolution/shadow/intervention-rate-engine.ts` | 干预率计算引擎 |
| **新建** | `server/platform/evolution/simulation/simulation-engine.ts` | 高保真仿真引擎 |
| **新建** | `server/platform/evolution/simulation/auto-labeling-pipeline.ts` | 自动标注流水线 |
| **新建** | `server/platform/evolution/flywheel/dual-flywheel-orchestrator.ts` | 双飞轮编排器 |
| **新建** | `server/platform/evolution/e2e/e2e-evolution-agent.ts` | 端到端进化 Agent |
| **新建** | `server/platform/evolution/e2e/model-merging-pipeline.ts` | 模型合并流水线 |
| **新建** | `server/platform/evolution/champion/fleet-neural-planner.ts` | Fleet Neural Planner |
| **新建** | `server/platform/evolution/canary/ota-fleet-canary.ts` | OTA 车队式金丝雀 |
| **新建** | `server/platform/evolution/training/dojo-scheduler.ts` | Dojo-style 训练调度 |
| 重写 | `server/domains/evolution/evolution.domain-router.ts` | Domain Router 增强 |
| 修改 | `client/src/pages/evolution/EvolutionBoard.tsx` | 前端 FSD 仪表盘 |
| 新建 | `docker/mysql/init/12-evo-loop-seed.sql` | Seed 数据 |
| **新建** | `docker/mysql/init/14-fsd-seed.sql` | FSD Seed 数据 |

---

## 九、验收标准

### 9.1 基础功能验收（E1-E19）

| 编号 | 验收项 | 验收标准 |
|---|---|---|
| F1 | 影子评估自动触发 | 新模型注册后 5s 内自动启动影子评估 |
| F2 | 统计显著性检验 | McNemar + Welch's t-test 双重检验，p-value < 0.05 |
| F3 | 自动晋升决策 | 影子评估通过后自动创建部署计划 |
| F4 | 多模型竞争 | 支持 ≥3 个挑战者同时注册和竞争 |
| F5 | 5 阶段渐进部署 | 流量按 0%→5%→20%→50%→100% 渐进切换 |
| F6 | 自动回滚 | 连续 3 次健康检查失败后 10s 内自动回滚 |
| F7 | 飞轮自动调度 | 支持定时自动触发进化周期 |
| F8 | 步骤日志持久化 | 每个飞轮步骤的执行详情可在 DB 中查询 |
| F9 | 性能趋势分析 | 基于历史数据自动判断趋势 |
| F10 | 前端实时数据 | EvolutionBoard 所有 Tab 使用 tRPC 实时数据 |

### 9.2 FSD 级验收（E20-E35）

| 编号 | 验收项 | 验收标准 |
|---|---|---|
| F15 | Intervention Rate | 24h 内干预率下降 ≥30% |
| F16 | 百万决策级数据飞轮 | 完整闭环可运行 |
| F17 | 端到端模型进化 | 成功进化 ≥3 代 |
| F18 | 仿真覆盖率 | ≥95% 真实难例 |
| F19 | FSD 仪表盘 | 实时刷新干预率趋势 |
| F20 | 干预日志追溯 | 可追溯到具体视频片段，0 延迟回放 |

### 9.3 技术验收

| 编号 | 验收项 | 验收标准 |
|---|---|---|
| T1 | TypeScript 编译 | `tsc --noEmit` 零错误 |
| T2 | 前端渲染 | 所有页面无 JS 崩溃 |
| T3 | Prometheus 指标 | 所有模块暴露标准指标 |
| T4 | DB 持久化 | 所有关键数据可在 DB 中查询 |

---

## 十、风险与缓解

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 自动回滚误触发 | 正常部署被中断 | 连续 N 次失败才触发，支持调整阈值 |
| 飞轮死循环 | 资源耗尽 | 最大并发周期数限制，周期间隔下限 |
| 影子评估样本不足 | 统计推断不可靠 | 最小样本量检查，样本不足时延长评估 |
| 多模型竞争冲突 | 部署计划冲突 | 同一时间只允许一个活跃部署计划 |
| Shadow Fleet 性能开销 | 生产延迟增加 | 异步镜像，影子模型不阻塞生产请求 |
| 仿真与真实偏差 | 仿真结果不可信 | 交叉验证 + Fidelity Score 门槛 |
| 模型合并质量退化 | 合并后模型性能下降 | 合并后自动评估，不达标则丢弃 |
| 干预率统计偏差 | 进化方向错误 | 多窗口滑动平均 + 异常值剔除 |

---

## 参考资料

[1]: Tesla FSD v14 Architecture — https://x.com  
[2]: FSD Data Engine 全流程 — https://eu.36kr.com  
[3]: Tesla Shadow Mode 原理 — https://en.eeworld.com.cn  
[4]: MindVLA 端到端架构 — https://mrmaheshrajput.medium.com  
