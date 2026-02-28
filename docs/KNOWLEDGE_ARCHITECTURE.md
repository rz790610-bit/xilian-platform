# 西联平台知识体系基础架构设计

> **版本**: 1.0.0
> **状态**: 设计稿
> **日期**: 2026-02-28
> **作用**: 8 域微服务底层知识基础设施的统一规范

---

## 目录

1. [概述](#1-概述)
2. [统一编码规则体系](#2-统一编码规则体系)
3. [知识图谱架构](#3-知识图谱架构)
4. [标注标准体系](#4-标注标准体系)
5. [跨模块集成](#5-跨模块集成)
6. [附录](#6-附录)

---

## 1. 概述

### 1.1 设计目标

西联平台需要一套统一的知识体系基础架构，作为 8 域微服务（感知、认知、护栏、进化、知识、工具、管线、平台）的底层支撑。当前代码库已有零散的编码规则（`baseCodeRules`）、Neo4j 图存储（6 节点类型 + 5 关系类型）、标注维度（`baseLabelDimensions`）等基础设施，但缺少以下统一规范：

- **统一编码体系**：设备、部件、故障、工况四个维度的结构化编码
- **完整图谱 Schema**：覆盖工况和案例的知识图谱扩展
- **标准化标注流程**：多层降级的自动标注 + 人工审核闭环

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| **向后兼容** | 扩展现有 JSON 字段（`baseCodeRules.segments`），不改 Schema 结构 |
| **物理约束优先** | 编码和图谱设计必须反映设备物理层级关系 |
| **闭环集成** | 编码 → 图谱 → 标注 → 编码注册表扩展，形成自增强生态 |
| **最小改动** | 复用 `baseDictCategories`、`baseLabelDimensions` 等现有表 |

### 1.3 架构全景

```
┌─────────────────────────────────────────────────────────────────┐
│                        知识体系基础架构                          │
├─────────────────┬───────────────────┬───────────────────────────┤
│  §2 统一编码体系 │  §3 知识图谱架构   │  §4 标注标准体系           │
│                 │                   │                           │
│  设备编码 (5级)  │  8 节点类型        │  标注字段规范              │
│  部件编码 (4级)  │  15 关系类型       │  质量评分模型              │
│  故障编码 (3级)  │  知识融合机制      │  审核流程                  │
│  工况编码 (3级)  │  图算法应用        │  自动标注辅助              │
│  编码注册表      │  双引擎架构        │  3 层降级策略              │
├─────────────────┴───────────────────┴───────────────────────────┤
│                    §5 跨模块集成闭环                              │
│   编码定义词汇 → 图谱提供上下文 → 标注发现新编码 → 注册表扩展     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 统一编码规则体系

### 2.1 编码架构总览

```
                         ┌──────────────────────┐
                         │    编码注册表          │
                         │ baseDictCategories +  │
                         │ baseDictItems         │
                         └─────────┬────────────┘
                                   │ 校验/扩展
          ┌────────────┬───────────┼───────────┬────────────┐
          ▼            ▼           ▼           ▼            ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ 设备编码  │ │ 部件编码  │ │ 故障编码  │ │ 工况编码  │
   │  5 级    │ │  4 级    │ │  3 级    │ │  3 级    │
   │ PORT.STS │ │ HOIST.   │ │ MECH.    │ │ HOIST.   │
   │ .ZPMC.   │ │ GBX.     │ │ BEARING  │ │ FULL_    │
   │ STS-65t  │ │ GEAR.    │ │ _WEAR.   │ │ LOAD.    │
   │ .SN...   │ │ PINION   │ │ MAJOR    │ │ HIGH_W   │
   └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

**通用设计决策**：
- 分隔符使用 `.`（点号），避免与含横杠的型号名冲突（如 `STS-65t`）
- 每段采用大写字母 + 下划线 + 数字命名法
- 严重程度统一为 4 级：`INFO` / `MINOR` / `MAJOR` / `CRITICAL`

### 2.2 设备编码（5 级）

**格式**：`{行业}.{设备类型}.{制造商}.{型号}.{序列号}`

**示例**：`PORT.STS.ZPMC.STS-65t.SN20240001`（33 字符）

| 段位 | 名称 | 最大长度 | 允许字符 | 示例 | 说明 |
|------|------|----------|----------|------|------|
| 1 | 行业 | 8 | `[A-Z_]` | `PORT` | 港口、矿山、电力等 |
| 2 | 设备类型 | 10 | `[A-Z_]` | `STS` | STS/RTG/MHC/AGV 等 |
| 3 | 制造商 | 12 | `[A-Z0-9_]` | `ZPMC` | 制造商缩写 |
| 4 | 型号 | 20 | `[A-Za-z0-9_-]` | `STS-65t` | 允许横杠（型号惯例） |
| 5 | 序列号 | 16 | `[A-Z0-9]` | `SN20240001` | 自动递增 |

**正则校验**：
```
^[A-Z_]{2,8}\.[A-Z_]{2,10}\.[A-Z0-9_]{2,12}\.[A-Za-z0-9_-]{2,20}\.[A-Z0-9]{4,16}$
```

**集成点**：

| 现有设施 | 位置 | 集成方式 |
|----------|------|----------|
| `baseCodeRules.segments` | `schema.ts:797` | JSON 数组存储 5 段定义，每段含 `{name, maxLength, charset, regex}` |
| `baseCodeRules.currentSequences` | `schema.ts:798` | JSON 对象存储各前缀的当前序列号，自动递增 |
| `assetNodes.code` | `schema.ts:888` | varchar(100) 存储完整编码字符串（示例 33 字符，充裕） |
| `baseNodeTemplates.codeRule` | `schema.ts:824` | 关联 `baseCodeRules.ruleCode`，模板级编码规则 |
| `baseNodeTemplates.codePrefix` | `schema.ts:825` | varchar(30) 存储模板编码前缀 |
| `assetNodes.levelCodes` | `schema.ts:897` | varchar(200) 存储各层级编码拼接，用于树查询 |

### 2.3 部件编码（4 级）

**格式**：`{系统}.{子系统}.{部件}.{零件}`

**示例**：`HOIST.GBX.GEAR.PINION_01`

| 段位 | 名称 | 最大长度 | 示例 | 说明 |
|------|------|----------|------|------|
| 1 | 系统 | 10 | `HOIST` | 起升/行走/俯仰/回转/小车 |
| 2 | 子系统 | 10 | `GBX` | 齿轮箱/电机/制动器/联轴器 |
| 3 | 部件 | 12 | `GEAR` | 齿轮/轴承/轴/壳体 |
| 4 | 零件 | 16 | `PINION_01` | 具体零件+位号 |

**正则校验**：
```
^[A-Z_]{2,10}\.[A-Z_]{2,10}\.[A-Z_]{2,12}\.[A-Z0-9_]{2,16}$
```

**集成点**：

| 现有设施 | 集成方式 |
|----------|----------|
| `assetNodes` depth 2-5 层 | 部件编码的 4 级对应设备树深度 2-5 |
| `assetMeasurementPoints.position` | `schema.ts:935`，varchar(100)，对应部件编码后两级 |
| `KnowledgeGraphEngine` 岸桥模板 | `knowledge-graph.ts` 中 5 大机构 → 零件的层级映射 |

### 2.4 故障编码（3 级）

**格式**：`{故障类别}.{故障模式}.{严重程度}`

**示例**：`MECH.BEARING_WEAR.MAJOR`

| 段位 | 名称 | 最大长度 | 有效值 | 说明 |
|------|------|----------|--------|------|
| 1 | 故障类别 | 12 | `MECH` / `ELEC` / `STRUCT` / `THERMAL` / `VIBR` / `CORR` / `FATIGUE` | 与 `diagnosisPhysicsFormulas.category` 对齐 |
| 2 | 故障模式 | 30 | `BEARING_WEAR` / `GEAR_PITTING` / `MOTOR_OVERHEAT` / ... | 与 `equipmentProfiles.failureModes[].name` 对齐 |
| 3 | 严重程度 | 8 | `INFO` / `MINOR` / `MAJOR` / `CRITICAL` | 全局统一 4 级 |

**正则校验**：
```
^[A-Z_]{2,12}\.[A-Z_]{2,30}\.(INFO|MINOR|MAJOR|CRITICAL)$
```

**集成点**：

| 现有设施 | 位置 | 集成方式 |
|----------|------|----------|
| `diagnosisPhysicsFormulas.category` | `evolution-schema.ts:295` | 枚举值 → 故障类别第一级映射 |
| `equipmentProfiles.failureModes[].name` | `evolution-schema.ts:665` | 故障模式名 → 第二级 |
| `equipmentProfiles.failureModes[].severity` | `evolution-schema.ts:665` | `critical`/`major`/`minor` → 第三级 |
| `FaultNode.code` | `neo4j.storage.ts:82` | 存储完整 3 级故障编码 |
| `FaultNode.severity` | `neo4j.storage.ts:85` | `info`/`warning`/`error`/`critical` |
| `dataSlices.faultTypeCode` | `schema.ts:1092` | varchar(64) 存储切片级故障编码 |

**严重程度对齐表**：

| 统一级别 | Neo4j FaultNode | equipmentProfiles | KGDiagnosisResult | 护栏 violation | 标注 |
|----------|-----------------|-------------------|-------------------|---------------|------|
| `INFO` | `info` | — | `info` | `info` | `INFO` |
| `MINOR` | `warning` | `minor` | `warning` | `warning` | `MINOR` |
| `MAJOR` | `error` | `major` | `error` | `error` | `MAJOR` |
| `CRITICAL` | `critical` | `critical` | `critical` | `critical` | `CRITICAL` |

### 2.5 工况编码（3 级）

**格式**：`{作业类型}.{负载区间}.{环境条件}`

**示例**：`HOIST.FULL_LOAD.HIGH_WIND`

| 段位 | 名称 | 最大长度 | 有效值 | 说明 |
|------|------|----------|--------|------|
| 1 | 作业类型 | 12 | `HOIST` / `TROLLEY` / `GANTRY` / `BOOM` / `IDLE` | 设备作业模式 |
| 2 | 负载区间 | 12 | `NO_LOAD` / `LIGHT_LOAD` / `HALF_LOAD` / `FULL_LOAD` / `OVERLOAD` | 载荷百分比区间 |
| 3 | 环境条件 | 12 | `NORMAL` / `HIGH_WIND` / `LOW_TEMP` / `HIGH_TEMP` / `RAIN` / `SALT_FOG` | 环境因素 |

**正则校验**：
```
^[A-Z_]{2,12}\.[A-Z_]{2,12}\.[A-Z_]{2,12}$
```

**集成点**：

| 现有设施 | 位置 | 集成方式 |
|----------|------|----------|
| `conditionProfiles.name` | `evolution-schema.ts:33` | varchar(200) 存储完整工况编码 |
| `conditionProfiles.parameters` | `evolution-schema.ts:38` | JSON 数组存储各级参数范围 `[{name, range, unit}]` |
| `conditionProfiles.industry` | `evolution-schema.ts:34` | 与编码第一级对应的行业上下文 |
| `conditionProfiles.equipmentType` | `evolution-schema.ts:35` | 与编码第一级对应的设备类型 |
| `conditionInstances.stateSnapshot` | `evolution-schema.ts:83` | JSON 快照存储工况切换时的参数值 |
| `dataSlices.workConditionCode` | `schema.ts:1090` | varchar(64) 存储切片工况编码 |

### 2.6 编码注册表

基于现有 `baseDictCategories` + `baseDictItems`（`schema.ts:1294-1337`）实现，不新增表。

**分类设计**：

| `baseDictCategory.code` | `name` | `isSystem` | 说明 |
|--------------------------|--------|------------|------|
| `ENCODING_DEVICE` | 设备编码字典 | 1 | 设备编码各段有效值 |
| `ENCODING_COMPONENT` | 部件编码字典 | 1 | 部件编码各段有效值 |
| `ENCODING_FAULT` | 故障编码字典 | 1 | 故障编码各段有效值 |
| `ENCODING_CONDITION` | 工况编码字典 | 1 | 工况编码各段有效值 |

**层级结构**：每个有效值对应一条 `baseDictItem`，`parentCode` 形成层级树。

```
baseDictItems 示例：
├── categoryCode: "ENCODING_FAULT"
│   ├── code: "MECH",        label: "机械故障",     parentCode: null
│   │   ├── code: "BEARING_WEAR", label: "轴承磨损", parentCode: "MECH"
│   │   ├── code: "GEAR_PITTING", label: "齿轮点蚀", parentCode: "MECH"
│   │   └── ...
│   ├── code: "ELEC",        label: "电气故障",     parentCode: null
│   │   ├── code: "MOTOR_OVERHEAT", label: "电机过热", parentCode: "ELEC"
│   │   └── ...
│   └── ...
```

**`metadata` JSON 扩展字段**：

```json
{
  "regex": "^[A-Z_]{2,12}$",
  "synonyms": ["mechanical", "机械"],
  "crossRef": { "physicsCategory": "vibration" },
  "deprecated": false,
  "replacedBy": null
}
```

**操作规范**：

| 操作 | 实现方式 | 版本控制 |
|------|----------|----------|
| 新增编码值 | 插入 `baseDictItem`，`isActive=1` | `version` 字段递增 |
| 废弃编码值 | `metadata.deprecated=true`，`isActive=0` | 保留记录，不物理删除 |
| 合并编码值 | `metadata.replacedBy` 指向目标编码 | 旧编码自动重定向 |
| 系统内置 vs 用户扩展 | `baseDictCategory.isSystem`：1=不可变，0=可扩展 | — |

---

## 3. 知识图谱架构

### 3.1 双引擎架构

```
┌─────────────────────────────────────────────────┐
│               应用层查询                          │
│  traceCausalChain() │ findShortestPath()         │
│  extractSubgraph()  │ transitiveInference()      │
└────────────┬────────────────────┬────────────────┘
             │ 读取优先            │ 复杂查询降级
             ▼                    ▼
┌──────────────────────┐  ┌──────────────────────┐
│   内存引擎            │  │   Neo4j 持久化        │
│  KnowledgeGraphEngine │  │   Neo4jStorage        │
│                      │  │                      │
│  adjacency Map       │  │  6+2 节点类型         │
│  reverseAdjacency Map│  │  5+3 关系类型         │
│  entities Map        │  │  GDS 图算法           │
│  triples Map         │  │  全文索引             │
│                      │  │  向量索引             │
└──────────┬───────────┘  └──────────┬───────────┘
           │                         │
           └────────┬────────────────┘
                    ▼
           ┌──────────────┐
           │  数据同步策略  │
           │              │
           │  写入：双写    │
           │  读取：内存优先 │
           │  启动：全量加载 │
           │  对账：定时校验 │
           └──────────────┘
```

**数据同步规则**：
- **写入时双写**：新增/更新三元组时，同步写入内存引擎和 Neo4j
- **读取时优先内存**：推理查询使用内存引擎（亚毫秒级），复杂图算法降级到 Neo4j GDS
- **启动时全量加载**：服务启动时从 Neo4j 加载全部三元组到内存引擎
- **定时对账**：每小时对比内存与 Neo4j 的三元组数量和校验和

### 3.2 节点类型扩展

**现有 6 类节点保留**（`neo4j.storage.ts:5-11`）：

| 节点 | Neo4j Label | 关键属性 | 来源 |
|------|-------------|----------|------|
| Equipment | `:Equipment` | id, name, type, model, manufacturer, location, status | `neo4j.storage.ts:57-67` |
| Component | `:Component` | id, name, type, partNumber, manufacturer, specifications, lifespan | `neo4j.storage.ts:69-78` |
| Fault | `:Fault` | id, code, name, type, severity, description, symptoms, rootCause, embedding | `neo4j.storage.ts:80-92` |
| Solution | `:Solution` | id, name, description, steps, requiredParts, successRate, cost, embedding | `neo4j.storage.ts:94-104` |
| Vessel | `:Vessel` | id, name, imo, type, length, width, draft, capacity, flag | `neo4j.storage.ts:106-116` |
| Berth | `:Berth` | id, name, terminal, length, depth, maxVesselSize, equipment | `neo4j.storage.ts:118-126` |

**新增 2 类节点**：

#### Condition 节点（工况）

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | Y | 唯一标识 |
| `encoding` | string | Y | 工况编码（引用 §2.5），如 `HOIST.FULL_LOAD.HIGH_WIND` |
| `operationType` | string | Y | 作业类型（编码第 1 级） |
| `loadRange` | string | Y | 负载区间（编码第 2 级） |
| `envCondition` | string | Y | 环境条件（编码第 3 级） |
| `parameters` | JSON | N | 参数范围 `[{name, range, unit}]`，与 `conditionProfiles.parameters` 同构 |
| `createdAt` | datetime | Y | 创建时间 |

**与 `kgOrchestratorTypes.ts` 集成**：

- `KGNodeCategory` 扩展：增加 `'condition'`
- `KGNodeSubType` 扩展：增加 `'condition_profile'` | `'condition_instance'`
- `KGNodeTypeInfo` 定义：

```
{
  category: 'condition',
  subType: 'condition_profile',
  label: '工况模板',
  description: '工况定义（作业类型+负载+环境）',
  configSchema: [
    { key: 'encoding', label: '工况编码', type: 'string', required: true },
    { key: 'operationType', label: '作业类型', type: 'select', options: [...] },
    { key: 'loadRange', label: '负载区间', type: 'select', options: [...] },
    { key: 'envCondition', label: '环境条件', type: 'select', options: [...] },
    { key: 'parameters', label: '参数范围', type: 'json' },
  ],
  allowedOutRelations: [],
  allowedInRelations: ['UNDER_CONDITION'],
}
```

#### Case 节点（案例）

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | Y | 唯一标识 |
| `caseCode` | string | Y | 案例编码 `CASE-{年月}-{序号}` |
| `deviceEncoding` | string | Y | 设备编码（引用 §2.2） |
| `faultEncoding` | string | Y | 故障编码（引用 §2.4） |
| `conditionEncoding` | string | N | 工况编码（引用 §2.5） |
| `diagnosis` | string | Y | 诊断结论 |
| `outcome` | string | Y | 处置结果（`resolved` / `mitigated` / `recurring` / `misdiagnosed`） |
| `confidence` | float | Y | 诊断置信度 [0, 1] |
| `timestamp` | datetime | Y | 案例时间 |
| `createdAt` | datetime | Y | 创建时间 |

**与 `kgOrchestratorTypes.ts` 集成**：

- `KGNodeCategory` 扩展：增加 `'case'`
- `KGNodeSubType` 扩展：增加 `'diagnosis_case'` | `'maintenance_case'`

### 3.3 关系类型扩展

**现有 12 种关系保留**（`kgOrchestratorTypes.ts:26-38`）：

| 关系 | 语义 | 方向性 | 来源 |
|------|------|--------|------|
| `HAS_PART` | 设备包含组件 | 有向 | Neo4j + KG 编排器 |
| `HAS_SENSOR` | 安装传感器 | 有向 | KG 编排器 |
| `CAUSES` | 因果关系 | 有向 | Neo4j + KG 编排器 |
| `MANIFESTS` | 表现为症状 | 有向 | KG 编排器 |
| `DIAGNOSED_BY` | 诊断依据 | 有向 | KG 编排器 |
| `RESOLVED_BY` | 解决方案 | 有向 | Neo4j + KG 编排器 |
| `AFFECTS` | 影响范围 | 有向 | Neo4j + KG 编排器 |
| `SIMILAR_TO` | 相似故障 | 无向 | Neo4j + KG 编排器 |
| `DEGRADES_TO` | 退化演变 | 有向 | KG 编排器 |
| `TRIGGERS` | 触发动作 | 有向 | KG 编排器 |
| `FEEDS` | 数据供给 | 有向 | KG 编排器 |
| `REFERENCES` | 引用知识 | 有向 | KG 编排器 |

**新增 3 种关系**：

#### UNDER_CONDITION

| 属性 | 说明 |
|------|------|
| **起点 → 终点** | `Fault` → `Condition` |
| **语义** | 故障在特定工况下发生 |
| `probability` | 该工况下故障发生概率 [0, 1] |
| `frequencyDelta` | 相比基线工况的频率变化百分比 |
| `observedCount` | 观测次数 |
| `lastObservedAt` | 最后观测时间 |

**场景**：`(Fault:MECH.BEARING_WEAR.MAJOR)-[:UNDER_CONDITION {probability: 0.35}]->(Condition:HOIST.FULL_LOAD.HIGH_WIND)` — 表示满载大风工况下轴承磨损故障概率为 35%。

#### VALIDATES

| 属性 | 说明 |
|------|------|
| **起点 → 终点** | `Case` → `Fault` |
| **语义** | 案例验证（或否定）故障模式 |
| `outcome` | 验证结果（`confirmed` / `refuted` / `partial`） |
| `confidence` | 验证置信度 [0, 1] |
| `validatedAt` | 验证时间 |
| `evidenceRef` | 证据引用（切片ID 或传感器数据路径） |

**场景**：`(Case:CASE-202601-0042)-[:VALIDATES {outcome: 'confirmed', confidence: 0.92}]->(Fault:MECH.BEARING_WEAR.MAJOR)` — 案例确认了该故障模式。

#### SHARED_COMPONENT

| 属性 | 说明 |
|------|------|
| **起点 ↔ 终点** | `Equipment` ↔ `Equipment`（无向） |
| **语义** | 跨设备共享同型号部件 |
| `componentType` | 共享部件类型（如 `GEAR`） |
| `manufacturer` | 部件制造商 |
| `model` | 部件型号 |
| `partCount` | 该型号部件在两设备中的总数量 |

**场景**：`(Equipment:STS-01)-[:SHARED_COMPONENT {componentType: 'BEARING', manufacturer: 'SKF', model: '6310'}]->(Equipment:STS-02)` — 两台岸桥使用相同型号的 SKF 6310 轴承。

**`KGRelationType` 联合类型更新**（12 → 15）：

```typescript
export type KGRelationType =
  | 'HAS_PART' | 'HAS_SENSOR' | 'CAUSES' | 'MANIFESTS'
  | 'DIAGNOSED_BY' | 'RESOLVED_BY' | 'AFFECTS' | 'SIMILAR_TO'
  | 'DEGRADES_TO' | 'TRIGGERS' | 'FEEDS' | 'REFERENCES'
  // 新增
  | 'UNDER_CONDITION' | 'VALIDATES' | 'SHARED_COMPONENT';
```

**`KGRelationTypeInfo` 新增定义**：

| type | allowedSources | allowedTargets | directed |
|------|---------------|----------------|----------|
| `UNDER_CONDITION` | `['fault']` | `['condition']` | true |
| `VALIDATES` | `['case']` | `['fault']` | true |
| `SHARED_COMPONENT` | `['equipment']` | `['equipment']` | false |

### 3.4 知识融合机制

#### a) 同型号部件图谱自动合并

**触发条件**：两个 `Equipment` 节点具有相同 `type + manufacturer + model`（与 `equipmentProfiles` 表中 `type`、`manufacturer`、`model` 字段对齐，`evolution-schema.ts:655-657`）。

**流程**：

```
 同型号设备 A         同型号设备 B
     │                    │
     ▼                    ▼
 子图提取            子图提取
 extractSubgraph()    extractSubgraph()
     │                    │
     └────────┬───────────┘
              ▼
     三元组冲突检测
     KGEvolutionService.detectConflicts()
              │
     ┌────────┼────────┐
     ▼        ▼        ▼
  无冲突    可合并    有矛盾
  直接合并  加权合并  标记人审
```

**合并策略**：

| 冲突类型 | 检测逻辑 | 处理 |
|----------|----------|------|
| 无冲突 | 新三元组在目标子图中无同 subject+predicate | 直接添加 |
| 可合并（supersession） | 同 subject+predicate，新三元组置信度更高 | 高置信度覆盖低置信度 |
| 可合并（refinement） | 同 subject+predicate，置信度差 < 0.1 | 频次加权平均 |
| 矛盾（contradiction） | 同 subject+predicate，object 互斥且置信度均高 | 标记人工审核，状态 `pending` |

- 冲突检测复用 `KGEvolutionService.detectConflicts()`（`kg-evolution.service.ts`）
- 冲突分类基于置信度差值：|Δconfidence| < 0.1 = refinement, > 0.3 = contradiction, 其余 = supersession

#### b) 跨客户脱敏图谱融合

直接引用 `docs/FEDERATED_KNOWLEDGE_DISTILLATION.md` §5 知识包格式——"不传数据，只传知识"。

**流程**：

```
远端客户站点                         中心平台
┌──────────────┐                  ┌──────────────────┐
│ 本地知识结晶  │                  │  知识包接收        │
│ KnowledgeCryst│──知识包──MQTT──→│                  │
│ allizer       │  (加密+签名)     │  脱敏验证          │
└──────────────┘                  │  ↓                │
                                  │  特征空间对齐评估    │
                                  │  TransferLearning  │
                                  │  Engine.assess     │
                                  │  Alignment()       │
                                  │  ↓                │
                                  │  条件性合并         │
                                  │  (对齐度 ≥ 0.7)    │
                                  └──────────────────┘
```

**隔离策略**：站点标签 `:Site{id}:` 命名空间隔离，与分布式架构文档一致。

- 每个客户站点的知识在 Neo4j 中使用 `:Site001:Fault` 双标签区分来源
- 融合后的全局知识使用 `:Global:` 前缀
- 查询时可指定站点范围或全局范围

#### c) 诊断阶段版本管理

基于 `KGGraphDefinition.version` + `.status`（`kgOrchestratorTypes.ts:116-117`）。

**图谱快照生命周期**：

```
  draft ──编辑──→ active ──归档──→ archived
    ↑               │
    └───回退────────┘
                    │
                    ▼
                evolving ──进化完成──→ active (新版本)
```

| 状态 | 说明 | 允许操作 |
|------|------|----------|
| `draft` | 编辑中 | 编辑节点/边、删除、提交 |
| `active` | 生产使用 | 只读推理、触发进化 |
| `archived` | 历史版本 | 只读查看 |
| `evolving` | 自进化中 | 系统自动修改权重/节点 |

**阶段追踪**：

每个诊断阶段（感知 → 认知 → 护栏 → 进化）在 KG 快照上操作：

| 阶段 | 操作 | KG 变更记录 |
|------|------|-------------|
| 感知 | 读取设备→传感器路径 | 无变更 |
| 认知 | 推理因果链，生成诊断结论 | `KGEvolutionEvent.evolutionType = 'accuracy_update'` |
| 护栏 | 校验诊断结论是否违规 | `KGEvolutionEvent.evolutionType = 'weight_adjust'` |
| 进化 | 提取新知识，注入图谱 | `KGEvolutionEvent.evolutionType = 'new_pattern'` / `'fleet_merge'` |

- `KGEvolutionEvent`（`kgOrchestratorTypes.ts:178-190`）追踪每次变异，包含：`addedNodes`、`addedEdges`、`updatedWeights`、`deprecatedNodes`、`accuracyDelta`、`triggeredBy`
- 与 `knowledgeCrystals.status` 生命周期对齐（`evolution-schema.ts:551`）：`draft` → `pending_review` → `approved` → `deprecated`

### 3.5 图算法应用

| 算法 | 实现位置 | 用途 | 配置 |
|------|----------|------|------|
| **Louvain 社区检测** | `neo4j.storage.ts:700-741` | 发现共享根因的故障社区 | 投影 `SIMILAR_TO`(无向) + `CAUSES`(有向) |
| **PageRank** | `neo4j.storage.ts:746-783` | 故障传播影响力排名，Top 100 | 投影 `CAUSES` 关系 |
| **向量相似度** | `neo4j.storage.ts:788-818` | `FaultNode.embedding` + `SolutionNode.embedding` 余弦相似度搜索 | 阈值 > 0.5，Top 10 |
| **因果链追踪** | `knowledge-graph.ts:traceCausalChain()` | 反向 DFS 遍历因果谓词（`causes`, `leads_to`, `triggers`, `results_in`, `contributes_to`） | 默认最大深度 10 |
| **最短路径** | `knowledge-graph.ts:findShortestPath()` | BFS 查找两实体间最短路径 | 置信度沿路径相乘 |
| **子图提取** | `knowledge-graph.ts:extractSubgraph()` | 双向 BFS 提取局部子图 | 指定中心实体+深度 |
| **传递推理** | `knowledge-graph.ts:transitiveInference()` | 单谓词传递闭包计算 | 无深度限制（visited 集合去环） |

**算法应用场景**：

1. **Louvain**：当新增故障节点时，重新检测社区，将新故障归入已有社区或创建新社区。用于"故障族群"管理。
2. **PageRank**：定期（每日）运行，更新故障影响力排名。高排名故障优先监控。
3. **向量相似度**：输入新故障描述的 embedding，搜索历史相似故障和解决方案（案例推理 CBR）。
4. **因果链追踪**：给定故障效应，反向追溯根因。例如 `"设备停机"` → `traceCausalChain()` → `"轴承磨损"` → `"润滑不足"`。

### 3.6 Cypher 示例

#### 创建 Condition 节点

```cypher
CREATE (c:Condition {
  id: $id,
  encoding: 'HOIST.FULL_LOAD.HIGH_WIND',
  operationType: 'HOIST',
  loadRange: 'FULL_LOAD',
  envCondition: 'HIGH_WIND',
  parameters: $parameters,
  createdAt: datetime()
})
RETURN c
```

#### 创建 Case 节点

```cypher
CREATE (cs:Case {
  id: $id,
  caseCode: 'CASE-202601-0042',
  deviceEncoding: 'PORT.STS.ZPMC.STS-65t.SN20240001',
  faultEncoding: 'MECH.BEARING_WEAR.MAJOR',
  conditionEncoding: 'HOIST.FULL_LOAD.HIGH_WIND',
  diagnosis: '起升机构主轴承内圈磨损，BPFI 特征频率显著',
  outcome: 'resolved',
  confidence: 0.92,
  timestamp: datetime('2026-01-15T08:30:00'),
  createdAt: datetime()
})
RETURN cs
```

#### 创建 UNDER_CONDITION 关系

```cypher
MATCH (f:Fault {code: 'MECH.BEARING_WEAR.MAJOR'})
MATCH (c:Condition {encoding: 'HOIST.FULL_LOAD.HIGH_WIND'})
MERGE (f)-[r:UNDER_CONDITION]->(c)
SET r.probability = 0.35,
    r.frequencyDelta = 0.45,
    r.observedCount = 23,
    r.lastObservedAt = datetime(),
    r.createdAt = datetime()
RETURN r
```

#### 创建 VALIDATES 关系

```cypher
MATCH (cs:Case {caseCode: 'CASE-202601-0042'})
MATCH (f:Fault {code: 'MECH.BEARING_WEAR.MAJOR'})
MERGE (cs)-[r:VALIDATES]->(f)
SET r.outcome = 'confirmed',
    r.confidence = 0.92,
    r.validatedAt = datetime(),
    r.evidenceRef = 'slice:SL-20260115-0001'
RETURN r
```

#### 创建 SHARED_COMPONENT 关系

```cypher
MATCH (e1:Equipment {id: 'STS-01'})
MATCH (e2:Equipment {id: 'STS-02'})
MERGE (e1)-[r:SHARED_COMPONENT]->(e2)
SET r.componentType = 'BEARING',
    r.manufacturer = 'SKF',
    r.model = '6310',
    r.partCount = 8,
    r.createdAt = datetime()
RETURN r
```

#### 复杂查询：给定设备+工况，查询所有可能故障及历史案例

```cypher
// 给定设备编码和工况编码，查询所有可能的故障模式及其历史案例
MATCH (e:Equipment)-[:HAS_PART*0..3]->(comp)
WHERE e.id = $equipmentId
MATCH (f:Fault)-[:AFFECTS]->(comp)
MATCH (f)-[uc:UNDER_CONDITION]->(c:Condition {encoding: $conditionEncoding})
OPTIONAL MATCH (cs:Case)-[v:VALIDATES]->(f)
WHERE v.outcome = 'confirmed'
RETURN f.code AS faultCode,
       f.name AS faultName,
       f.severity AS severity,
       uc.probability AS conditionProbability,
       collect(DISTINCT {
         caseCode: cs.caseCode,
         diagnosis: cs.diagnosis,
         outcome: cs.outcome,
         confidence: v.confidence
       }) AS historicalCases
ORDER BY uc.probability DESC
```

#### 查询共享部件的跨设备故障传播

```cypher
// 查找与目标设备共享部件的设备上发生过的故障（横向对比）
MATCH (target:Equipment {id: $targetEquipmentId})
MATCH (target)-[sc:SHARED_COMPONENT]-(peer:Equipment)
MATCH (f:Fault)-[:AFFECTS]->(:Component)<-[:HAS_PART]-(peer)
WHERE f.severity IN ['error', 'critical']
RETURN peer.id AS peerEquipment,
       sc.componentType AS sharedComponent,
       sc.model AS componentModel,
       collect(DISTINCT {
         faultCode: f.code,
         severity: f.severity,
         frequency: f.frequency
       }) AS peerFaults
ORDER BY size(peerFaults) DESC
```

---

## 4. 标注标准体系

### 4.1 标注架构总览

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   数据采集    │────→│  自动标注      │────→│  人工审核      │────→│  入库         │
│              │     │              │     │              │     │              │
│ 传感器数据    │     │ 3 层降级策略   │     │ 专家确认/退回  │     │ dataSlices    │
│ 工况切换      │     │              │     │              │     │ KG 反哺       │
│ 设备事件      │     │ Tier1: Grok  │     │ ≥0.85 自动    │     │ 编码注册扩展   │
│              │     │ Tier2: LLM   │     │ 0.6~0.85 确认 │     │              │
│              │     │ Tier3: 规则   │     │ <0.6 人工     │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

**3 层降级策略**（`grok-label-provider.ts`）：

| 层级 | 提供者 | 置信度范围 | 降级条件 |
|------|--------|----------|----------|
| Tier 1 | `GrokReasoningService.diagnose()` | 高（0.7-0.95） | 服务可用时优先 |
| Tier 2 | `invokeLLM()` (Forge API) | 中（0.5-0.8） | Grok 不可用/超时 |
| Tier 3 | 规则矩阵 `ruleMatrixLabel()` | 基础（0.6-0.82） | AI 全部失败时降级 |

### 4.2 标注字段规范

三类字段，全部映射到 `baseLabelDimensions`（`schema.ts:1000-1017`）：

#### 必填字段（`dimType = 'required'`, `isRequired = 1`）

| 字段 | `baseLabelDimension.code` | 数据类型 | 数据来源 | 编码引用 |
|------|--------------------------|----------|----------|----------|
| 设备编码 | `deviceCode` | varchar(100) | 系统自动 | §2.2 设备编码 |
| 工况编码 | `workConditionCode` | varchar(64) | 感知域自动识别 | §2.5 工况编码 |
| 故障类型编码 | `faultTypeCode` | varchar(64) | AI 推荐 / 工程师选择 | §2.4 故障编码 |
| 严重程度 | `severity` | enum | AI 推荐 / 工程师选择 | `INFO`/`MINOR`/`MAJOR`/`CRITICAL` |
| 开始时间 | `startTime` | datetime(3) | 切片规则自动 | — |
| 结束时间 | `endTime` | datetime(3) | 切片规则自动 | — |

#### 选填字段（`dimType = 'optional'`, `isRequired = 0`）

| 字段 | `baseLabelDimension.code` | 数据类型 | 数据来源 |
|------|--------------------------|----------|----------|
| 根因分析 | `rootCause` | text | 工程师 / AI |
| 症状描述 | `symptoms` | JSON (string[]) | 工程师 / AI |
| 关联 KG 节点 | `relatedKGNodes` | JSON (string[]) | AI / 图谱查询 |
| 物理公式引用 | `physicsFormula` | varchar(200) | 工程师 |
| 备注 | `notes` | text | 工程师 |

#### 自动填充字段（`dimType = 'auto_fill'`, `isRequired = 0`）

| 字段 | `baseLabelDimension.code` | 数据类型 | 计算来源 |
|------|--------------------------|----------|----------|
| 质量评分 | `qualityScore` | double | §4.3 质量评分公式 |
| 标注状态 | `labelStatus` | varchar(20) | 流程状态机 |
| 置信度 | `confidence` | double | AI 输出 / 规则矩阵计算 |
| 标注来源 | `labelSource` | varchar(32) | `grok_agent` / `world_model` / `rule_based` / `ensemble` / `manual` |
| 特征向量 | `featureVector` | JSON (6D) | `AutoLabelingPipeline.extractFeatureVector()` |

**`allowSources` JSON 配置**：

```json
// baseLabelDimensions.allowSources 示例
{
  "auto": ["grok_agent", "world_model", "rule_based", "ensemble"],
  "manual": ["engineer", "senior_engineer", "expert"]
}
```

**`applyTo` JSON 配置**：

```json
// baseLabelDimensions.applyTo 示例
{
  "dataTypes": ["vibration", "current", "temperature", "pressure", "displacement"],
  "equipmentTypes": ["STS", "RTG", "MHC", "AGV"]
}
```

**有效值管理**：通过 `baseLabelOptions`（`schema.ts:1025-1044`）管理，`parentCode` 支持层级结构，引用 §2 编码体系中的有效值。

### 4.3 标注质量评分

#### 评分维度

| 维度 | 权重 | 计算方式 | 合格阈值 | 说明 |
|------|------|----------|----------|------|
| 完整性 (C) | 0.4 | 必填字段填写率 | ≥ 0.8 | `C = 已填必填字段数 / 总必填字段数` |
| 准确性 (A) | 0.4 | 专家审核一致率 | ≥ 0.9 | `A = 专家确认标注数 / 总审核标注数` |
| 可追溯性 (T) | 0.2 | 有审计记录+来源证据 | ≥ 0.7 | `T = (有审计日志 ? 0.5 : 0) + (有来源证据 ? 0.5 : 0)` |

#### 综合质量评分公式

```
qualityScore = completeness × 0.4 + accuracy × 0.4 + traceability × 0.2
```

**推导**：
- 全部必填字段填写 + 专家全部确认 + 完整审计 = `1.0 × 0.4 + 1.0 × 0.4 + 1.0 × 0.2 = 1.0`
- 最低合格线 = `0.8 × 0.4 + 0.9 × 0.4 + 0.7 × 0.2 = 0.32 + 0.36 + 0.14 = 0.82`
- 建议合格阈值：**≥ 0.75**

#### 存储位置

| 字段 | 位置 | 说明 |
|------|------|------|
| `dataSlices.qualityScore` | `schema.ts:1105` | double，综合质量评分 |
| `dataSlices.dataQuality` | `schema.ts:1106` | JSON，分维度明细 `{completeness, accuracy, traceability}` |
| `dataSlices.labelStatus` | `schema.ts:1098` | 不合格切片标记为 `needs_review` |

**不合格处理**：`qualityScore < 0.75` 的切片自动标记 `labelStatus = 'needs_review'`，进入复审队列。

### 4.4 标注审核流程

```
                    ┌────────────┐
                    │  自动标注    │
                    │ (auto_only) │
                    └──────┬─────┘
                           │ AI 标注完成
                           ▼
                    ┌────────────┐
            ┌──────│  待审核     │──────┐
            │      │ (pending)   │      │
            │      └──────┬─────┘      │
     置信度 ≥ 0.85        │        置信度 < 0.6
     自动接受           0.6~0.85     标记人工
            │         人工确认         │
            ▼              │           ▼
     ┌────────────┐       │    ┌────────────┐
     │  已入库     │       │    │  需人工标注  │
     │ (approved)  │◄──────┘    │ (manual)    │
     └────────────┘             └──────┬─────┘
            ▲                          │
            │                   工程师标注
            │                          │
            │                   ┌──────▼─────┐
            │                   │  专家审核    │
            │                   │ (reviewing) │
            │                   └──────┬─────┘
            │              ┌───────────┼───────────┐
            │              ▼           ▼           ▼
            │        approved      rejected    需补充
            └──────────────┘           │           │
                                       ▼           │
                                  ┌────────────┐   │
                                  │  退回修改    │◄──┘
                                  │ (rejected)  │
                                  └──────┬─────┘
                                         │ 重新标注
                                         └───→ (manual)
```

**状态追踪**：`dataSliceLabelHistory.reviewStatus`（`schema.ts:1143`）

**审计记录**：每次标注变更 → `dataSliceLabelHistory` 插入一条记录：

| 字段 | 来源 | 说明 |
|------|------|------|
| `sliceId` | 切片 ID | 关联目标切片 |
| `dimensionCode` | 标注维度 | 变更的字段 |
| `oldValue` / `newValue` | 变更前后值 | — |
| `oldSource` / `newSource` | 标注来源变化 | 如 `grok_agent` → `manual` |
| `changedBy` | 操作者 | 系统/工程师/专家 |
| `reason` | 变更原因 | 必填 |
| `confidence` | 置信度 | AI 标注时的置信度 |
| `reviewStatus` | 审核状态 | `pending`/`approved`/`rejected` |
| `reviewerId` | 审核人 | 专家 ID |

**与知识结晶对齐**：标注审核流程与 `knowledgeCrystals` 的生命周期一致（`evolution-schema.ts:551`）：

| 标注状态 | 知识结晶状态 | 说明 |
|----------|-------------|------|
| `auto_only` | `draft` | 初始生成 |
| `pending` | `pending_review` | 等待审核 |
| `approved` | `approved` | 审核通过 |
| `rejected` | `rejected` | 审核拒绝 |
| — | `deprecated` | 被更新的知识替代 |

**审核权限**：

| 角色 | 可审核范围 | 操作 |
|------|----------|------|
| 工程师 | 自己的标注 | 提交、修改 |
| 高级工程师 | 工程师标注 + MINOR/MAJOR 故障 | 确认、退回 |
| 专家 | 全部 + CRITICAL 故障 | 确认、退回、覆盖 |

### 4.5 自动标注辅助

基于 `GrokLabelProvider`（`grok-label-provider.ts`）和 `AutoLabelingPipeline`（`auto-labeling-pipeline.ts`）。

#### 标注输出结构

```typescript
interface AutoLabel {
  interventionReason: string;    // 标注理由
  rootCause: string;             // 根因（引用 §2.4 故障编码）
  suggestedFix: string;          // 建议修复方案
  severity: 'low' | 'medium' | 'high' | 'critical';  // 严重程度
  impactScope: string[];         // 影响范围
  relatedKGNodes: string[];      // 关联 KG 节点 ID（引用 §3 知识图谱）
  confidence: number;            // 置信度 [0, 1]
}
```

#### 置信度分级处理

| 置信度范围 | 处理方式 | 用户交互 | `labelStatus` |
|-----------|----------|----------|---------------|
| ≥ 0.85 | 自动接受 | 仅记录审计日志 | `approved` |
| 0.6 ~ 0.85 | AI 预填 + 人工确认 | 推送移动端确认 UI | `pending` |
| < 0.6 | 标记为"需人工标注" | 进入人工标注队列 | `manual` |

#### 6 维特征向量

`AutoLabelingPipeline.extractFeatureVector()` 提取 6 维特征，用于规则矩阵匹配和不确定性检测：

| 维度 | 名称 | 范围 | 计算方式 |
|------|------|------|----------|
| 1 | `divergenceScore` | [0, 1] | 决策差异度，clamped |
| 2 | `decisionTypeMismatch` | {0, 1} | 人工 vs 影子决策类型是否不同 |
| 3 | `confidenceGap` | [0, 1] | `|humanConf - shadowConf|` |
| 4 | `requestComplexity` | [0, 1] | 输入字段数归一化（/50） |
| 5 | `recencyFactor` | [0, 1] | `exp(-0.693 × age / halfLife)`，半衰期 7 天 |
| 6 | `historicalRepeatRate` | [0, 1] | `min(1, repeatCount / 10)` |

#### 不确定性检测

```
不确定性 = stddev(severitySignals) > 1.0
```

其中 `severitySignals` 将 6 维特征映射到严重程度信号（0=low, 1=medium, 2=high, 3=critical）。当各维度指向的严重程度冲突时（标准差 > 1.0），标记 `isUncertain = true`，置信度降低 20%。

#### 不确定样本优先推送

- 标记 `isUncertain = true` 的样本优先进入人工标注队列
- `baseLabelOptions.samplePriority`（`schema.ts:1034`）控制队列排序（1=最高优先）
- 事件总线发布 `labeling.review_needed` 事件，前端实时推送通知

---

## 5. 跨模块集成

### 5.1 集成闭环

```
                    ┌─────────────────┐
                    │  §2 编码体系     │
                    │  统一词汇表      │
                    └───┬─────────┬───┘
            定义词汇 │             │ 定义词汇
                    ▼             ▼
           ┌──────────┐    ┌──────────┐
           │ §3 知识   │    │ §4 标注   │
           │ 图谱      │◄───│ 体系     │
           │          │提供  │          │
           │          │上下文│          │
           └────┬─────┘    └────┬─────┘
                │               │
      KG 演化   │               │ 标注发现
      注入图谱   │               │ 新编码值
                ▼               ▼
           ┌──────────────────────┐
           │  §2.6 编码注册表      │
           │  baseDictCategories + │
           │  baseDictItems       │
           │  新增/废弃/合并       │
           └──────────────────────┘
```

### 5.2 数据流路径

#### 路径 1：编码 → 图谱

编码为图谱节点属性提供统一词汇：
- `Equipment.id` 使用设备编码（§2.2）
- `Fault.code` 使用故障编码（§2.4）
- `Condition.encoding` 使用工况编码（§2.5）
- `Case.deviceEncoding` / `.faultEncoding` / `.conditionEncoding` 交叉引用三类编码

#### 路径 2：图谱 → 标注

图谱因果链辅助自动标注推理：
- `traceCausalChain()` 反向追溯根因 → 填充 `AutoLabel.rootCause`
- `extractSubgraph()` 提取关联子图 → 填充 `AutoLabel.relatedKGNodes`
- `UNDER_CONDITION` 关系 → 辅助判断工况相关性 → 填充 `workConditionCode`

#### 路径 3：标注 → 图谱反哺

标注结果通过 `KGEvolutionService.extractFromDiagnosis()` 反哺图谱：
- 审核通过的标注 → 提取三元组 → 注入 KG
- 高置信度案例 → 创建 `Case` 节点 + `VALIDATES` 关系
- 新工况关联 → 创建 `UNDER_CONDITION` 关系

#### 路径 4：标注 → 编码注册表扩展

新发现的故障模式触发编码注册表扩展：
- 标注中出现未注册的故障模式 → 创建 `baseDictItem` 草稿
- 专家审核确认 → `isActive = 1`，编码正式生效
- 事件总线发布 `encoding.new_value` 事件

#### 路径 5：进化飞轮集成

与进化引擎的闭环（`evolutionCycles`，`evolution-schema.ts:580`）：

```
进化周期 → 影子评估 → 边缘案例发现 → 自动标注 → 知识结晶
    ↑                                              │
    │         ← 图谱注入 ← 结晶审核通过 ←──────────┘
    │                                              │
    └──────── 标注优化 ← 图谱上下文增强 ←───────────┘
```

每轮 `evolutionCycle` 产出：
1. 边缘案例 → `AutoLabelingPipeline.batchLabel()` 批量标注
2. 标注通过审核 → `CrystalService.create()` 创建知识结晶
3. 结晶审核通过 → `KGEvolutionService.extractFromDiagnosis()` 注入图谱
4. 图谱更新 → 下轮标注上下文增强

---

## 6. 附录

### 附录 A：完整编码格式规范

#### A.1 设备编码

```
格式:  {行业}.{设备类型}.{制造商}.{型号}.{序列号}
正则:  ^[A-Z_]{2,8}\.[A-Z_]{2,10}\.[A-Z0-9_]{2,12}\.[A-Za-z0-9_-]{2,20}\.[A-Z0-9]{4,16}$
长度:  最短 14 字符 (XX.XX.XX.XX.XXXX)
       最长 70 字符 (XXXXXXXX.XXXXXXXXXX.XXXXXXXXXXXX.XXXXXXXXXXXXXXXXXXXX.XXXXXXXXXXXXXXXX)
       典型 30-40 字符
字符集: 大写字母 A-Z, 数字 0-9, 下划线 _, 横杠 - (仅型号段)
分隔符: . (点号)
```

#### A.2 部件编码

```
格式:  {系统}.{子系统}.{部件}.{零件}
正则:  ^[A-Z_]{2,10}\.[A-Z_]{2,10}\.[A-Z_]{2,12}\.[A-Z0-9_]{2,16}$
长度:  最短 11 字符, 最长 52 字符
字符集: 大写字母 A-Z, 数字 0-9 (仅零件段), 下划线 _
分隔符: . (点号)
```

#### A.3 故障编码

```
格式:  {故障类别}.{故障模式}.{严重程度}
正则:  ^[A-Z_]{2,12}\.[A-Z_]{2,30}\.(INFO|MINOR|MAJOR|CRITICAL)$
长度:  最短 10 字符, 最长 51 字符
字符集: 大写字母 A-Z, 下划线 _
分隔符: . (点号)
严重程度枚举: INFO, MINOR, MAJOR, CRITICAL
```

#### A.4 工况编码

```
格式:  {作业类型}.{负载区间}.{环境条件}
正则:  ^[A-Z_]{2,12}\.[A-Z_]{2,12}\.[A-Z_]{2,12}$
长度:  最短 8 字符, 最长 38 字符
字符集: 大写字母 A-Z, 下划线 _
分隔符: . (点号)
```

### 附录 B：Neo4j DDL（约束 + 索引）

#### B.1 唯一约束（现有 + 新增）

```cypher
-- 现有约束（neo4j.storage.ts:237-243）
CREATE CONSTRAINT equipment_id IF NOT EXISTS FOR (e:Equipment) REQUIRE e.id IS UNIQUE;
CREATE CONSTRAINT component_id IF NOT EXISTS FOR (c:Component) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT fault_id IF NOT EXISTS FOR (f:Fault) REQUIRE f.id IS UNIQUE;
CREATE CONSTRAINT solution_id IF NOT EXISTS FOR (s:Solution) REQUIRE s.id IS UNIQUE;
CREATE CONSTRAINT vessel_id IF NOT EXISTS FOR (v:Vessel) REQUIRE v.id IS UNIQUE;
CREATE CONSTRAINT berth_id IF NOT EXISTS FOR (b:Berth) REQUIRE b.id IS UNIQUE;

-- 新增约束
CREATE CONSTRAINT condition_id IF NOT EXISTS FOR (c:Condition) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT condition_encoding IF NOT EXISTS FOR (c:Condition) REQUIRE c.encoding IS UNIQUE;
CREATE CONSTRAINT case_id IF NOT EXISTS FOR (cs:Case) REQUIRE cs.id IS UNIQUE;
CREATE CONSTRAINT case_code IF NOT EXISTS FOR (cs:Case) REQUIRE cs.caseCode IS UNIQUE;
```

#### B.2 索引（现有 + 新增）

```cypher
-- 现有全文索引（neo4j.storage.ts:255-258）
CREATE FULLTEXT INDEX fault_search IF NOT EXISTS FOR (f:Fault) ON EACH [f.name, f.description, f.code];
CREATE FULLTEXT INDEX solution_search IF NOT EXISTS FOR (s:Solution) ON EACH [s.name, s.description];
CREATE FULLTEXT INDEX equipment_search IF NOT EXISTS FOR (e:Equipment) ON EACH [e.name, e.type, e.model];

-- 新增索引
CREATE INDEX condition_operation IF NOT EXISTS FOR (c:Condition) ON (c.operationType);
CREATE INDEX condition_load IF NOT EXISTS FOR (c:Condition) ON (c.loadRange);
CREATE INDEX case_device IF NOT EXISTS FOR (cs:Case) ON (cs.deviceEncoding);
CREATE INDEX case_fault IF NOT EXISTS FOR (cs:Case) ON (cs.faultEncoding);
CREATE INDEX case_timestamp IF NOT EXISTS FOR (cs:Case) ON (cs.timestamp);
CREATE FULLTEXT INDEX case_search IF NOT EXISTS FOR (cs:Case) ON EACH [cs.diagnosis, cs.caseCode];
```

### 附录 C：质量评分公式推导

#### 完整性 (Completeness)

```
C = Σ(filled_required_fields) / Σ(total_required_fields)

其中 required_fields = baseLabelDimensions WHERE isRequired = 1 AND isActive = 1
```

**示例**：6 个必填字段中填写了 5 个 → `C = 5/6 = 0.833`

#### 准确性 (Accuracy)

```
A = Σ(expert_confirmed_labels) / Σ(total_reviewed_labels)

仅统计 reviewStatus = 'approved' 或 'rejected' 的记录
```

**示例**：专家审核了 10 条标注，确认了 9 条 → `A = 9/10 = 0.9`

#### 可追溯性 (Traceability)

```
T = has_audit_log × 0.5 + has_evidence × 0.5

has_audit_log = dataSliceLabelHistory 中存在该切片的变更记录 ? 1 : 0
has_evidence  = labels JSON 中包含 labelSource 且非空 ? 1 : 0
```

**示例**：有审计日志、有标注来源 → `T = 0.5 + 0.5 = 1.0`

#### 综合评分

```
qualityScore = C × 0.4 + A × 0.4 + T × 0.2
             = 0.833 × 0.4 + 0.9 × 0.4 + 1.0 × 0.2
             = 0.333 + 0.36 + 0.2
             = 0.893
```

### 附录 D：与现有代码集成点清单

| # | 模块路径 | 集成点 | 影响范围 |
|---|----------|--------|----------|
| 1 | `drizzle/schema.ts:793-807` | `baseCodeRules` — 编码规则段定义 | 编码体系 §2 |
| 2 | `drizzle/schema.ts:817-843` | `baseNodeTemplates` — 设备模板+编码前缀 | 编码体系 §2.2 |
| 3 | `drizzle/schema.ts:885-920` | `assetNodes` — 设备树+code字段 | 编码体系 §2.2 |
| 4 | `drizzle/schema.ts:928-947` | `assetMeasurementPoints` — 测点实例 | 编码体系 §2.3 |
| 5 | `drizzle/schema.ts:1000-1047` | `baseLabelDimensions` + `baseLabelOptions` | 标注体系 §4.2 |
| 6 | `drizzle/schema.ts:1084-1149` | `dataSlices` + `dataSliceLabelHistory` | 标注体系 §4.3-4.4 |
| 7 | `drizzle/schema.ts:1294-1337` | `baseDictCategories` + `baseDictItems` | 编码注册表 §2.6 |
| 8 | `drizzle/evolution-schema.ts:31-93` | `conditionProfiles` + `conditionInstances` | 工况编码 §2.5 |
| 9 | `drizzle/evolution-schema.ts:292-315` | `diagnosisPhysicsFormulas` | 故障编码 §2.4 |
| 10 | `drizzle/evolution-schema.ts:533-575` | `knowledgeCrystals` | 标注审核 §4.4 |
| 11 | `drizzle/evolution-schema.ts:580+` | `evolutionCycles` | 进化飞轮 §5.2 |
| 12 | `drizzle/evolution-schema.ts:653-681` | `equipmentProfiles` | 故障编码 §2.4 |
| 13 | `server/lib/storage/neo4j.storage.ts` | Neo4j 存储（6 节点 + 5 关系） | 知识图谱 §3 |
| 14 | `shared/kgOrchestratorTypes.ts` | KG 类型注册表（6 类 21 子类型 12 关系） | 知识图谱 §3.2-3.3 |
| 15 | `server/platform/knowledge/graph/knowledge-graph.ts` | 内存 KG 引擎 | 知识图谱 §3.1 |
| 16 | `server/platform/knowledge/services/kg-evolution.service.ts` | KG 演化+冲突检测 | 知识图谱 §3.4 |
| 17 | `server/platform/knowledge/services/crystal.service.ts` | 知识结晶服务 | 进化集成 §5.2 |
| 18 | `server/platform/evolution/labeling/grok-label-provider.ts` | AI 标注 3 层降级 | 标注体系 §4.5 |
| 19 | `server/platform/evolution/fsd/auto-labeling-pipeline.ts` | 自动标注管线 | 标注体系 §4.5 |
| 20 | `docs/FEDERATED_KNOWLEDGE_DISTILLATION.md` | 联邦知识蒸馏 | 知识融合 §3.4b |

### 附录 E：术语表

| 术语 | 英文 | 定义 |
|------|------|------|
| 编码注册表 | Encoding Registry | 基于 `baseDictCategories` + `baseDictItems` 的编码有效值管理系统 |
| 知识结晶 | Knowledge Crystal | 从诊断经验中提炼的可复用知识模式（`knowledgeCrystals` 表） |
| 三元组 | Triple | 知识图谱中的基本单元 `(subject, predicate, object)` |
| 因果链 | Causal Chain | 通过 `CAUSES` 关系连接的故障传播路径 |
| 影子评估 | Shadow Evaluation | 新模型与生产模型并行运行，对比输出但不实际生效 |
| 冠军挑战者 | Champion-Challenger | 新模型（挑战者）与旧模型（冠军）的 A/B 测试 |
| 工况 | Operating Condition | 设备运行时的作业类型、负载、环境组合 |
| 边缘案例 | Edge Case | 影子评估中人工决策与AI决策出现分歧的案例 |
| 知识包 | Knowledge Package | 联邦学习中站点间传输的脱敏知识载体 |
| 双引擎 | Dual Engine | Neo4j（持久化）+ 内存 KG 引擎（推理加速）的混合架构 |
| 数据切片 | Data Slice | 时间窗口内特定设备的传感器数据片段（`dataSlices` 表） |
| 规则矩阵 | Rule Matrix | `AutoLabelingPipeline` 中的 6 维 × 4 级规则匹配系统 |
| 社区检测 | Community Detection | Louvain 算法发现故障节点群落的图分析方法 |
| 特征向量 | Feature Vector | 标注管线中 6 维数值向量，描述干预事件特征 |
| 置信度衰减 | Confidence Decay | 知识三元组随时间自动降低置信度的机制（衰减率 0.1%/天） |
