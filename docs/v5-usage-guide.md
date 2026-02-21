# 西联平台 v5.0 深度进化模块 — 使用指南

## 一、部署前置条件

在 v5.0 模块能够正常工作之前，需要完成以下 3 个步骤：

### 1. 执行数据库迁移（MySQL — 24 张新表）

```bash
# 方式一：使用 Drizzle 迁移
cd /path/to/xilian-platform
npx drizzle-kit push

# 方式二：使用迁移脚本
bash scripts/migrate-v5.sh
```

### 2. 导入 Seed 数据

```bash
# 在 MySQL 中执行 seed 脚本
mysql -u root -p xilian_platform < docker/mysql/init/03-v5-seed-data.sql
```

Seed 数据包含：

| 表名 | 数据量 | 说明 |
|------|--------|------|
| `equipment_profiles` | 5 条 | 5 种设备类型（离心泵、汽轮机、压缩机、电动机、齿轮箱） |
| `condition_profiles` | 3 条 | 3 种工况配置（正常运行、启停过渡、极端工况） |
| `sampling_configs` | 6 条 | 采样率配置（基础 100Hz / 高频 1000Hz） |
| `feature_definitions` | 5 条 | 特征工程定义（振动 RMS、FFT 峰值频率等） |
| `guardrail_rules` | 5 条 | 安全护栏规则（温度、振动、效率、转速、疲劳） |
| `cognition_sessions` | 10 条 | 认知会话历史（含四维诊断结果） |
| `grok_reasoning_chains` | 30 条 | Grok 推理链步骤 |
| `guardrail_violations` | 8 条 | 护栏触发记录 |
| `evolution_cycles` | 3 条 | 进化周期记录 |
| `knowledge_crystals` | 4 条 | 知识结晶 |
| `shadow_eval_records` | 2 条 | 影子评估记录 |
| `shadow_eval_metrics` | 6 条 | 影子评估指标 |
| `champion_challenger_experiments` | 1 条 | 冠军挑战者实验 |
| `edge_cases` | 3 条 | 边缘案例 |

### 3. 执行 ClickHouse DDL（可选，用于时序分析）

```bash
bash scripts/clickhouse-v5-migrate.sh
```

### 4. 配置 Grok API（可选，用于深度推理）

在 `.env` 中添加：

```env
XAI_API_URL=https://api.x.ai/v1
XAI_API_KEY=your-api-key-here
XAI_MODEL=grok-3
```

---

## 二、5 个仪表盘页面功能说明

### 1. 认知仪表盘 (`/v5/cognitive`)

**数据来源**：`cognition_sessions` + `grok_reasoning_chains` + `guardrail_violations`

**展示内容**：
- 活跃认知会话数、今日诊断总数、平均诊断耗时、收敛率
- 四维指标（感知、推理、融合、决策）的准确率和延迟
- 推理链列表：每个认知会话的 Grok 推理步骤详情
- 进化飞轮状态（来自 `evoEvolution.getFlywheelStatus`）
- 最近护栏告警（来自 `evoGuardrail.listAlerts`）

### 2. 感知层监控 (`/v5/perception`)

**数据来源**：`sampling_configs` + `condition_profiles` + `cognition_sessions`

**展示内容**：
- 数据采集状态：各采样配置的基础/高频采样率、启用状态
- 融合质量指标：基于最近认知会话的诊断评分计算
- 工况配置列表：工况名称、行业、设备类型、传感器映射数量

### 3. 护栏控制台 (`/v5/guardrail`)

**数据来源**：`guardrail_rules` + `guardrail_violations`

**展示内容**：
- 护栏规则列表：规则名称、类型（安全/健康/效率）、优先级、启用状态
- 告警历史：护栏触发记录，包含设备 ID、触发值、执行动作、结果
- 实时告警：最近 24 小时内的未处理告警
- 规则开关：可启用/禁用单条规则
- 告警确认：可将告警标记为已处理

### 4. 数字孪生 (`/v5/digital-twin`)

**数据来源**：`equipment_profiles` + `cognition_sessions`

**展示内容**：
- 数字孪生体列表：每台设备的同步状态、状态向量（振动、温度、负载等）
- 健康/安全/效率三维评分
- 仿真场景：过载仿真、高温工况、加速退化、共振分析
- 历史回放：基于已完成的认知会话进行事件回放

### 5. 知识探索器 (`/v5/knowledge`)

**数据来源**：`kg_nodes` + `kg_edges` + `knowledge_crystals` + `feature_definitions`

**展示内容**：
- 知识图谱可视化：节点和边的拓扑关系
- 知识结晶列表：从认知会话中提取的模式、置信度、验证次数
- 特征工程定义：特征名称、类别、计算逻辑、适用设备
- 结晶应用：可将知识结晶标记为已验证

---

## 三、tRPC API 端点清单

### evoCognition（认知领域）

| 方法 | 类型 | 说明 |
|------|------|------|
| `getDashboardMetrics` | query | 认知仪表盘聚合指标 |
| `listReasoningChains` | query | 推理链列表（含 Grok 步骤） |
| `session.trigger` | mutation | 触发认知会话 |
| `session.get` | query | 获取会话详情 |
| `session.list` | query | 列出会话 |
| `session.getDimensionResults` | query | 获取四维结果 |
| `session.getReasoningChain` | query | 获取推理链 |

### evoPerception（感知领域）

| 方法 | 类型 | 说明 |
|------|------|------|
| `listCollectionStatus` | query | 数据采集状态 |
| `getFusionQuality` | query | 融合质量指标 |
| `listConditionProfiles` | query | 工况配置列表 |

### evoGuardrail（护栏领域）

| 方法 | 类型 | 说明 |
|------|------|------|
| `listRules` | query | 护栏规则列表 |
| `listAlertHistory` | query | 告警历史 |
| `listAlerts` | query | 实时告警 |
| `toggleRule` | mutation | 启用/禁用规则 |
| `acknowledgeAlert` | mutation | 确认告警 |

### evoPipeline（管线领域）

| 方法 | 类型 | 说明 |
|------|------|------|
| `listDigitalTwins` | query | 数字孪生体列表 |
| `listSimulationScenarios` | query | 仿真场景 |
| `listReplaySessions` | query | 回放会话 |
| `runSimulation` | mutation | 运行仿真 |
| `startReplay` | mutation | 启动回放 |

### evoKnowledge（知识领域）

| 方法 | 类型 | 说明 |
|------|------|------|
| `getKnowledgeGraph` | query | 知识图谱数据 |
| `listCrystals` | query | 知识结晶列表 |
| `listFeatures` | query | 特征定义列表 |
| `listModels` | query | 设备模型列表 |
| `applyCrystal` | mutation | 应用知识结晶 |

### evoEvolution（进化领域）

| 方法 | 类型 | 说明 |
|------|------|------|
| `getFlywheelStatus` | query | 进化飞轮状态 |
| `shadowEval.*` | 多种 | 影子评估 CRUD |
| `championChallenger.*` | 多种 | 冠军挑战者 CRUD |
| `canary.*` | 多种 | 金丝雀发布 CRUD |
| `dataEngine.*` | 多种 | 数据引擎 + 边缘案例 |
| `cycle.*` | 多种 | 进化周期管理 |
| `crystal.*` | 多种 | 知识结晶管理 |

---

## 四、数据流架构

```
设备传感器 → 采样配置(samplingConfigs) → 特征工程(featureDefinitions)
    ↓
工况识别(conditionProfiles) → 认知会话(cognitionSessions)
    ↓
四维诊断: 感知 → 推理(Grok) → 融合 → 决策
    ↓                              ↓
推理链(grokReasoningChains)    护栏检查(guardrailRules → guardrailViolations)
    ↓
诊断结果 → 知识结晶(knowledgeCrystals) → 知识图谱(kgNodes/kgEdges)
    ↓
进化周期(evolutionCycles) → 影子评估 → 冠军挑战 → 金丝雀发布
```

---

## 五、后续开发建议

1. **接入真实传感器数据**：当前 seed 数据是静态的，需要接入 Kafka/MQTT 实时数据流
2. **启用 Grok API**：配置 XAI_API_KEY 后，认知会话将使用 Grok-3 进行深度推理
3. **ClickHouse 时序分析**：执行 DDL 后可启用物化视图进行高性能时序聚合
4. **知识图谱扩展**：当前使用 MySQL 存储图数据，后续可迁移到 Neo4j
5. **仿真引擎实现**：`runSimulation` 和 `startReplay` 当前返回 mock 结果，需要接入物理仿真引擎
