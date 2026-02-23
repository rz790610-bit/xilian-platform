# 自主进化闭环升级方案 v1.0

> **文档编号**：XLP-EVO-LOOP-001  
> **版本**：v1.0  
> **编制日期**：2026-02-23  
> **适用范围**：洗炼平台 — 深度进化引擎  
> **编制**：Manus AI

---

## 一、背景与目标

### 1.1 背景

洗炼平台的深度进化引擎已具备四大核心模块（影子评估、冠军-挑战者、金丝雀部署、飞轮编排），但各模块之间的协同尚未形成真正的自主闭环。当前状态下，模型升级仍需人工干预决策，缺乏自动化的端到端进化流水线。

### 1.2 目标

构建完整的**自主进化闭环**，实现从"发现改进机会"到"安全部署上线"再到"知识沉淀"的全自动化流水线。具体目标：

1. **影子评估自动化**：新模型注册后自动触发影子评估，产出统计显著性报告
2. **竞争晋升自动化**：基于影子评估得分自动选择最佳挑战者，创建部署计划
3. **金丝雀安全部署**：5 阶段渐进式流量切换（0%→5%→20%→50%→100%），配合多维度健康检查和自动回滚
4. **飞轮自动编排**：周期性自动执行完整进化循环，持久化周期报告，支持性能趋势分析
5. **全链路可观测性**：Prometheus 埋点覆盖所有阶段，支持 Grafana 仪表盘监控

---

## 二、现状审计

### 2.1 现有模块盘点

| 模块 | 文件路径 | 行数 | 当前能力 | 缺失能力 |
|---|---|---|---|---|
| 影子评估器 | `evolution/shadow/shadow-evaluator.ts` | 437 | McNemar 检验、DS 融合、蒙特卡洛模拟 | DB 持久化、A/B 统计显著性、自动触发 |
| 冠军-挑战者 | `evolution/champion/champion-challenger.ts` | 422 | 模型注册、比较、部署计划 | 自动晋升决策、多模型竞争、健康检查集成 |
| 金丝雀部署器 | `evolution/canary/canary-deployer.ts` | 370 | 流量路由、自动回滚、指标监控 | 多阶段渐进、DB 持久化、与 Champion-Challenger 联动 |
| 飞轮编排器 | `evolution/flywheel/evolution-flywheel.ts` | 343 | 5 步闭环编排 | 自动调度、周期报告持久化、性能趋势分析 |
| Domain Router | `domains/evolution/evolution.domain-router.ts` | 418 | 6 个子路由（shadow/champion/canary/data/cycle/crystal） | 大部分 mutation 为空壳 |
| 前端面板 | `pages/evolution/EvolutionBoard.tsx` | 518 | 4 个 Tab（总览/时间线/健康评估/自动化规则） | 全部使用 Mock 数据 |

### 2.2 DDL 现状

| 表名 | 状态 | 用途 |
|---|---|---|
| `evolution_shadow_evaluations` | 已有 | 影子评估记录 |
| `evolution_canary_deployments` | 已有 | 金丝雀部署记录 |
| `evolution_flywheel_cycles` | 已有 | 飞轮周期记录 |
| `evolution_auto_rules` | **需新建** | 自动化规则配置 |
| `evolution_flywheel_logs` | **需新建** | 飞轮步骤日志 |
| `evolution_model_registry` | **需新建** | 模型注册表（含生命周期） |
| `evolution_deployment_plans` | **需新建** | 部署计划详情 |

---

## 三、目标架构

### 3.1 自主进化闭环流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        自主进化闭环 (Autonomous Evolution Loop)          │
│                                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │ 1.发现   │───▶│ 2.假设   │───▶│ 3.影子   │───▶│ 4.竞争   │          │
│  │ Discovery│    │Hypothesis│    │ Shadow   │    │Champion  │          │
│  │          │    │          │    │ Eval     │    │Challenger│          │
│  └──────────┘    └──────────┘    └──────────┘    └────┬─────┘          │
│       ▲                                               │                │
│       │                                               ▼                │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │ 7.结晶   │◀───│ 6.验证   │◀───│ 5.金丝雀 │◀───│ 4b.部署  │          │
│  │Crystallize│   │ Verify   │    │ Canary   │    │ Plan     │          │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘          │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    飞轮编排器 (Flywheel Orchestrator)             │   │
│  │  自动调度 │ 周期管理 │ 步骤追踪 │ 异常处理 │ 报告生成            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    可观测性层 (Observability)                      │   │
│  │  Prometheus 指标 │ Grafana 仪表盘 │ Alertmanager 告警             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 部署策略矩阵

| 阶段 | 流量占比 | 持续时间 | 回滚阈值 | 健康检查维度 |
|---|---|---|---|---|
| 影子评估 | 0%（镜像流量） | 24h | 任何退化 | 延迟、错误率、资源占用 |
| 金丝雀 | 5% | 48h | >5% 退化 | 延迟、错误率、准确率 |
| 灰度 | 20% | 72h | >3% 退化 | 延迟、错误率、准确率 |
| 半量 | 50% | 48h | >2% 退化 | 全维度 |
| 全量 | 100% | — | >1% 退化 | 全维度 |

### 3.3 自动回滚策略

| 回滚类型 | 触发条件 | 回滚动作 |
|---|---|---|
| `auto_error` | 错误率 > 5%（连续 3 次健康检查） | 立即回滚至冠军版本 |
| `auto_latency` | P95 延迟 > 500ms（连续 3 次） | 立即回滚至冠军版本 |
| `auto_performance` | 准确率退化 > 5%（连续 3 次） | 立即回滚至冠军版本 |
| `auto_safety` | 内存 > 4096MB | 立即回滚至冠军版本 |
| `manual` | 人工触发 | 回滚至冠军版本 |

---

## 四、升级项清单

### 4.1 影子评估引擎升级（E1-E4）

#### E1：DB 持久化

将影子评估报告写入 `evolution_shadow_evaluations` 表，支持历史查询和趋势分析。

```typescript
// 核心变更：评估完成后自动持久化
async persistReport(report: ShadowReport): Promise<void> {
  const db = await getDb();
  await db.insert(evolutionShadowEvaluations).values({
    modelId: report.modelId,
    modelVersion: report.modelVersion,
    baselineVersion: report.baselineVersion,
    overallScore: report.overallScore,
    statisticalSignificance: report.pValue,
    reportData: report,
    status: report.recommendation,
  });
}
```

#### E2：A/B 统计显著性检验

在现有 McNemar 检验基础上增加 Welch's t-test 和 Bootstrap 置信区间，提供更可靠的统计推断。

```typescript
// Welch's t-test 实现
welchTTest(sampleA: number[], sampleB: number[]): {
  tStatistic: number;
  pValue: number;
  degreesOfFreedom: number;
  significant: boolean;
}
```

#### E3：自动化触发机制

新模型注册后自动触发影子评估，评估完成后自动通知 Champion-Challenger 管理器。

```typescript
// 事件驱动触发链
EventBus.on('model.registered') → ShadowEvaluator.startEvaluation()
EventBus.on('shadow.completed') → ChampionChallenger.updateShadowResult()
EventBus.on('shadow.passed')    → ChampionChallenger.autoCreateDeploymentPlan()
```

#### E4：Prometheus 埋点

```
evo_shadow_evaluations_total{status}     — 评估总数（按状态）
evo_shadow_evaluation_duration_seconds   — 评估耗时
evo_shadow_score_distribution            — 得分分布直方图
```

### 4.2 Champion-Challenger 竞争机制升级（E5-E8）

#### E5：自动晋升决策

基于影子评估得分自动选择最佳挑战者，创建部署计划，无需人工干预。

```typescript
// 自动晋升流程
autoCreateDeploymentPlan(shadowReportId: string): DeploymentPlan | null {
  const bestChallenger = this.selectBestChallenger(); // 按 shadowScore 排序
  if (!bestChallenger) return null;
  return this.createDeploymentPlan(bestChallenger.modelId, bestChallenger.version, {
    autoPromoted: true,
    shadowReportId,
    skipShadow: true, // 已通过影子评估
  });
}
```

#### E6：多模型竞争排行榜

支持多个挑战者同时注册和竞争，通过排行榜展示各模型的影子评估得分和状态。

```typescript
getLeaderboard(): LeaderboardEntry[] {
  // 冠军排第一，其余按 shadowScore 降序
  return entries.map((e, i) => ({
    modelId, version, status, shadowScore, metrics, rank: i + 1,
  }));
}
```

#### E7：健康检查集成

部署期间持续执行多维度健康检查，支持自动回滚策略（连续 N 次失败触发）。

```typescript
performHealthCheck(metrics: {
  latencyMs: number;
  errorRate: number;
  accuracyDelta: number;
  memoryUsageMb: number;
}): { healthy: boolean; rollbackTriggered: boolean; reason?: string }
```

#### E8：模型生命周期追踪

完整的模型状态机：`registered → shadow → canary → gray → half → champion → retired`。

### 4.3 金丝雀发布引擎升级（E9-E12）

#### E9：多阶段渐进式部署

从现有的线性递增改为 5 阶段渐进式部署（影子→金丝雀→灰度→半量→全量），每阶段有独立的回滚阈值和观察窗口。

```typescript
// 5 阶段部署策略
const stages = [
  { name: 'shadow',  traffic: 0,   duration: 24h, rollbackThreshold: 0%  },
  { name: 'canary',  traffic: 5,   duration: 48h, rollbackThreshold: 5%  },
  { name: 'gray',    traffic: 20,  duration: 72h, rollbackThreshold: 3%  },
  { name: 'half',    traffic: 50,  duration: 48h, rollbackThreshold: 2%  },
  { name: 'full',    traffic: 100, duration: 0,   rollbackThreshold: 1%  },
];
```

#### E10：与 Champion-Challenger 联动

金丝雀部署器接收 Champion-Challenger 的部署计划，自动执行流量切换。部署完成后通知 Champion-Challenger 晋升新冠军。

#### E11：DB 持久化

部署记录写入 `evolution_canary_deployments` 表，包含阶段详情、健康检查结果、回滚原因。

#### E12：Prometheus 埋点

```
evo_canary_deployments_total{status}     — 部署总数（按状态）
evo_canary_traffic_percent               — 当前流量百分比
evo_canary_rollback_total{type}          — 回滚次数（按类型）
evo_canary_stage_duration_seconds{stage} — 各阶段耗时
```

### 4.4 飞轮周期编排器升级（E13-E16）

#### E13：自动调度

支持定时自动触发进化周期（如每 24h 执行一次完整闭环），可配置调度策略。

```typescript
// 自动调度配置
interface FlywheelSchedule {
  enabled: boolean;
  intervalMs: number;        // 周期间隔
  maxConcurrentCycles: number; // 最大并发周期数
  autoStartOnModelRegister: boolean; // 新模型注册时自动启动
}
```

#### E14：步骤日志持久化

每个飞轮步骤的执行详情写入 `evolution_flywheel_logs` 表，支持审计和故障排查。

```typescript
// 步骤日志结构
interface FlywheelStepLog {
  cycleId: string;
  stepName: string;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  durationMs: number;
  errorMessage: string | null;
}
```

#### E15：性能趋势分析

基于历史周期数据，自动分析模型性能趋势（准确率、延迟、错误率），生成趋势报告。

```typescript
analyzeTrend(modelId: string, windowSize: number): {
  accuracyTrend: 'improving' | 'stable' | 'degrading';
  latencyTrend: 'improving' | 'stable' | 'degrading';
  overallHealth: 'healthy' | 'warning' | 'critical';
  recommendation: string;
}
```

#### E16：闭环验证

飞轮完成一个完整周期后，自动验证进化效果（对比周期前后的关键指标），确保每次进化都是正向的。

### 4.5 Domain Router 增强（E17）

填充空壳 mutation 为真实实现，新增以下路由：

| 路由 | 类型 | 功能 |
|---|---|---|
| `evolution.shadow.startEvaluation` | mutation | 启动影子评估 |
| `evolution.shadow.getReport` | query | 获取评估报告 |
| `evolution.champion.register` | mutation | 注册新模型 |
| `evolution.champion.getLeaderboard` | query | 获取竞争排行榜 |
| `evolution.champion.startDeployment` | mutation | 启动部署 |
| `evolution.champion.advanceStage` | mutation | 推进部署阶段 |
| `evolution.champion.rollback` | mutation | 回滚部署 |
| `evolution.canary.getStatus` | query | 获取金丝雀状态 |
| `evolution.cycle.start` | mutation | 启动飞轮周期 |
| `evolution.cycle.getHistory` | query | 获取周期历史 |
| `evolution.cycle.getTrend` | query | 获取性能趋势 |
| `evolution.autoRules.list` | query | 获取自动化规则 |
| `evolution.autoRules.create` | mutation | 创建自动化规则 |
| `evolution.autoRules.update` | mutation | 更新自动化规则 |
| `evolution.autoRules.delete` | mutation | 删除自动化规则 |

### 4.6 前端页面升级（E18）

替换 EvolutionBoard.tsx 中的 Mock 数据为 tRPC 调用，新增两个 Tab：

| Tab | 内容 |
|---|---|
| 进化闭环 | 影子评估→冠军挑战→金丝雀→结晶 流水线视图，实时状态展示 |
| 飞轮周期 | 周期历史列表、性能趋势折线图、当前步骤进度、自动化规则管理 |

### 4.7 Seed 数据（E19）

为 `evolution_auto_rules` 和 `evolution_flywheel_logs` 提供初始化数据。

---

## 五、DDL 增量脚本

### 5.1 新增表

```sql
-- 1. 自动化规则配置表
CREATE TABLE IF NOT EXISTS evolution_auto_rules (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  rule_name       VARCHAR(100) NOT NULL,
  rule_type       ENUM('shadow_trigger','auto_promote','auto_rollback','schedule') NOT NULL,
  trigger_condition JSON NOT NULL COMMENT '触发条件配置',
  action_config   JSON NOT NULL COMMENT '执行动作配置',
  priority        INT DEFAULT 0,
  enabled         TINYINT(1) DEFAULT 1,
  last_triggered_at DATETIME DEFAULT NULL,
  trigger_count   INT DEFAULT 0,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_rule_type (rule_type),
  INDEX idx_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. 飞轮步骤日志表
CREATE TABLE IF NOT EXISTS evolution_flywheel_logs (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id        VARCHAR(64) NOT NULL,
  step_name       VARCHAR(50) NOT NULL,
  step_index      INT NOT NULL,
  status          ENUM('started','completed','failed','skipped') NOT NULL,
  input_data      JSON DEFAULT NULL,
  output_data     JSON DEFAULT NULL,
  duration_ms     INT DEFAULT NULL,
  error_message   TEXT DEFAULT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cycle_id (cycle_id),
  INDEX idx_step_status (step_name, status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 模型注册表
CREATE TABLE IF NOT EXISTS evolution_model_registry (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  model_id        VARCHAR(100) NOT NULL,
  version         VARCHAR(50) NOT NULL,
  model_type      VARCHAR(50) NOT NULL,
  description     TEXT DEFAULT NULL,
  parameters      JSON DEFAULT NULL,
  metrics         JSON DEFAULT NULL,
  status          ENUM('registered','shadow','canary','gray','half','champion','retired','rolled_back') DEFAULT 'registered',
  traffic_percent INT DEFAULT 0,
  shadow_score    DECIMAL(5,4) DEFAULT NULL,
  shadow_report_id VARCHAR(64) DEFAULT NULL,
  tags            JSON DEFAULT NULL,
  registered_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  promoted_at     DATETIME DEFAULT NULL,
  retired_at      DATETIME DEFAULT NULL,
  UNIQUE KEY uk_model_version (model_id, version),
  INDEX idx_status (status),
  INDEX idx_shadow_score (shadow_score DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. 部署计划详情表
CREATE TABLE IF NOT EXISTS evolution_deployment_plans (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  plan_id         VARCHAR(64) NOT NULL UNIQUE,
  challenger_id   VARCHAR(100) NOT NULL,
  challenger_version VARCHAR(50) NOT NULL,
  champion_id     VARCHAR(100) DEFAULT NULL,
  stages          JSON NOT NULL COMMENT '部署阶段详情',
  current_stage   INT DEFAULT 0,
  status          ENUM('planned','executing','completed','rolled_back','cancelled') DEFAULT 'planned',
  auto_promoted   TINYINT(1) DEFAULT 0,
  shadow_report_id VARCHAR(64) DEFAULT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at    DATETIME DEFAULT NULL,
  INDEX idx_status (status),
  INDEX idx_challenger (challenger_id, challenger_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 六、实施计划

### 6.1 阶段划分

| 阶段 | 内容 | 升级项 | 预估工时 |
|---|---|---|---|
| 6.0 | DDL + Drizzle Schema 扩展 | — | 1h |
| 6.1 | 影子评估引擎 v2.0 | E1-E4 | 3h |
| 6.2 | Champion-Challenger v2.0 | E5-E8 | 3h |
| 6.3 | 金丝雀部署器 v2.0 | E9-E12 | 3h |
| 6.4 | 飞轮编排器 v2.0 | E13-E16 | 3h |
| 6.5 | Domain Router 增强 | E17 | 2h |
| 6.6 | 前端页面升级 | E18 | 3h |
| 6.7 | Seed 数据 | E19 | 0.5h |
| 6.8 | TypeScript 编译检查 + 集成验证 | — | 1.5h |
| **合计** | | **19 项** | **20h** |

### 6.2 当前进度

| 阶段 | 状态 |
|---|---|
| 6.0 DDL + Drizzle Schema | ✅ 已完成 |
| 6.1 影子评估引擎 v2.0 | ✅ 已完成（580+ 行） |
| 6.2 Champion-Challenger v2.0 | ✅ 已完成（550+ 行） |
| 6.3 金丝雀部署器 v2.0 | 🔄 进行中 |
| 6.4 飞轮编排器 v2.0 | ⏳ 待开始 |
| 6.5 Domain Router 增强 | ⏳ 待开始 |
| 6.6 前端页面升级 | ⏳ 待开始 |
| 6.7 Seed 数据 | ⏳ 待开始 |
| 6.8 集成验证 | ⏳ 待开始 |

---

## 七、文件变更清单

| 操作 | 文件路径 | 说明 |
|---|---|---|
| 新建 | `docker/mysql/init/11-evo-loop-ddl.sql` | 自主进化闭环 DDL 增量脚本 |
| 修改 | `drizzle/evolution-schema.ts` | 新增 4 张表的 Drizzle Schema |
| 重写 | `server/platform/evolution/shadow/shadow-evaluator.ts` | 影子评估引擎 v2.0 |
| 重写 | `server/platform/evolution/champion/champion-challenger.ts` | Champion-Challenger v2.0 |
| 重写 | `server/platform/evolution/canary/canary-deployer.ts` | 金丝雀部署器 v2.0 |
| 重写 | `server/platform/evolution/flywheel/evolution-flywheel.ts` | 飞轮编排器 v2.0 |
| 重写 | `server/domains/evolution/evolution.domain-router.ts` | Domain Router 增强 |
| 修改 | `client/src/pages/evolution/EvolutionBoard.tsx` | 前端页面升级 |
| 新建 | `docker/mysql/init/12-evo-loop-seed.sql` | Seed 数据 |

---

## 八、验收标准

### 8.1 功能验收

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
| F9 | 性能趋势分析 | 基于历史数据自动判断趋势（improving/stable/degrading） |
| F10 | 前端实时数据 | EvolutionBoard 所有 Tab 使用 tRPC 实时数据 |

### 8.2 技术验收

| 编号 | 验收项 | 验收标准 |
|---|---|---|
| T1 | TypeScript 编译 | `tsc --noEmit` 零错误 |
| T2 | 前端渲染 | 所有页面无 JS 崩溃 |
| T3 | Prometheus 指标 | 所有模块暴露标准指标 |
| T4 | DB 持久化 | 所有关键数据可在 DB 中查询 |

---

## 九、风险与缓解

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 自动回滚误触发 | 正常部署被中断 | 连续 N 次失败才触发，支持调整阈值 |
| 飞轮死循环 | 资源耗尽 | 最大并发周期数限制，周期间隔下限 |
| 影子评估样本不足 | 统计推断不可靠 | 最小样本量检查，样本不足时延长评估 |
| 多模型竞争冲突 | 部署计划冲突 | 同一时间只允许一个活跃部署计划 |
