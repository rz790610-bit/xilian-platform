# 算法赋能模块深度分析

> **文档定位**：本文档从"嵌入现有平台的赋能模块"视角出发，对已完成代码进行深度审视，对 3 条战略建议进行升华推演，最终给出精确的实施判断。
>
> **核心目标**：强大、高效、可靠、简单实用。方向：大数据、AI 赋能、快速技术积累、快速迭代。

---

## 一、算法赋能模块在平台中的精确定位

### 1.1 它是什么

算法赋能模块不是一个独立系统，而是平台的**计算智能层**。它的职责是：让平台上已有的每一个模块——设备管理、数据接入、Pipeline、模型中心、诊断系统、知识图谱——都能方便地调用算法能力，并且让算法的执行结果自动流回这些模块。

用一个类比：如果平台是一个人体，设备管理是骨骼，数据接入是血管，Pipeline 是神经系统，那么算法赋能模块就是**大脑皮层**——它不替代任何器官的功能，但它让所有器官的协作变得智能。

### 1.2 它不是什么

它不是第二个 Pipeline Engine（已有 30+ 处理器），不是第二个插件引擎（已有 algorithm 插件类型），不是第二个模型中心（已有 model_registry + 训练任务管理）。这三个模块是"肌肉"，算法赋能模块是"大脑"——大脑不做肌肉的事，但大脑指挥肌肉。

### 1.3 赋能的三个维度

| 维度 | 含义 | 平台现状 | 算法模块补齐的能力 |
|------|------|---------|------------------|
| **向下赋能设备** | 设备接入后，自动匹配适用算法 | 设备管理有完整的类型注册中心，但不知道该用什么算法 | 设备→算法的智能推荐 + 自动绑定 |
| **向上赋能决策** | 算法结果自动驱动诊断、告警、KPI | Pipeline 能执行算法，但结果停留在 Pipeline 内部 | 结果自动路由到 anomaly_detections / device_alerts / KG |
| **横向赋能积累** | 每次算法执行都沉淀为平台知识资产 | 模型中心管理模型，但算法经验没有沉淀 | 执行记录 + 参数优化 + 算法组合模板 = 可复用的技术积累 |

---

## 二、已完成代码的深度审视

### 2.1 代码清单与规模

| 文件 | 行数 | 职责 |
|------|------|------|
| `server/core/registries/algorithm.registry.ts` | ~600 | 算法注册中心，33 个内置算法定义，9 大分类 |
| `server/services/algorithm.service.ts` | ~850 | 服务层：CRUD + 桥接执行 + 推荐 + 路由 + Fleet Learning |
| `server/services/algorithm/builtin/signal-processing.ts` | ~400 | 8 个信号处理算法（FFT/STFT/小波/包络/滤波/降噪/倒谱/阶次） |
| `server/services/algorithm/builtin/analytics.ts` | ~350 | 8 个分析算法（统计特征/相关性/分布检验/RUL/健康指数/阈值/聚类/趋势） |
| `server/services/algorithm/builtin/index.ts` | ~50 | 内置算法路由入口 |
| `drizzle/schema.ts`（追加部分） | ~200 | 5 张新表 |
| `server/core/registries/index.ts`（修改） | +5 | 注册到 RegistryManager |
| **合计** | **~2,455** | |

### 2.2 什么是真正有价值的

**价值核心 1：算法注册中心（algorithm.registry.ts）**

这是整个模块最有价值的部分。它做了一件平台之前缺失的事：**给算法一个统一的身份**。33 个算法定义，每个都有 `id`、`category`、`implType`、`implRef`、`applicableDeviceTypes`、`measurementTypes`、`inputSchema`、`outputSchema`、`configSchema`。这意味着：

- Pipeline Engine 的 `feature_engineering` 处理器不再是一个黑盒——它在算法注册中心有完整的元数据描述，用户知道它能做什么、适用于什么设备、需要什么输入。
- 插件引擎的 `algorithm` 类型插件不再是孤立的——它们可以通过 `implType: 'plugin'` 被算法注册中心统一管理和推荐。
- 新增一个算法，只需在注册中心添加一条定义，指定 `implType` 和 `implRef`，不需要改任何已有代码。

**价值核心 2：桥接执行层（algorithm.service.ts 中的 executeAlgorithm）**

`executeAlgorithm` 方法通过 `implType` 分发到 5 种执行后端（builtin / pipeline_node / plugin / external / kg_operator），这是真正的"赋能"——它不重建执行引擎，而是让已有的 Pipeline Engine、插件引擎、KG 编排器都成为算法的执行载体。用户只需要调用一个统一接口 `algorithmService.executeAlgorithm(algoCode, input, config)`，不需要知道底层是谁在执行。

**价值核心 3：16 个 builtin 信号处理/分析算法**

这 16 个算法填补了 Pipeline Engine 的空白。Pipeline Engine 有 `feature_engineering`（归一化/标准化/log/分箱）和 `anomaly_detect`（Z-Score/IQR/IF），但没有 FFT、小波分析、包络分析、倒谱分析、阶次分析这些工业振动诊断的核心算法。这 16 个 builtin 算法是平台从"通用数据处理平台"升级为"工业 SHM/PHM 赋能平台"的关键差异化能力。

**价值核心 4：5 张数据库表**

`algorithm_definitions` 表让算法成为可管理的数据资产。`algorithm_device_bindings` 表建立了设备→算法的关联关系。`algorithm_executions` 表记录每次执行的完整 trace，这是"快速技术积累"的数据基础。`algorithm_compositions` 表支持算法组合编排。`algorithm_routing_rules` 表支持结果的动态路由。

### 2.3 什么需要精简或调整

**过度设计 1：Fleet Learning**

`getFleetLearningStats` 和 `runFleetOptimization` 两个方法的前提是：同一算法在大量同类设备上运行，积累足够的执行数据后做跨设备参数优化。这在当前阶段不实用——平台还没有大规模设备接入，没有足够的执行数据。Fleet Learning 的价值是真实的，但时机不对。

**判断**：保留 `algorithm_definitions` 表中的 `fleetLearningConfig` 字段（JSON，不影响表结构），但服务层的 Fleet Learning 方法标记为 `@experimental`，不在 tRPC 路由中暴露。等平台有了真实的大规模执行数据后再激活。

**过度设计 2：边缘缓存协议**

`getEdgeSyncPackage` 和 `batchUploadExecutions` 假设边缘节点需要离线运行算法并批量回传结果。这是一个真实需求，但它应该由边缘计算模块（`ops.listEdgeNodes`）来驱动，而不是算法模块主动推送。

**判断**：删除这两个方法。边缘场景下的算法部署，由边缘计算模块调用算法注册中心获取算法定义，自行管理缓存和同步。算法模块只需要提供"获取算法定义 + 配置"的 API，不需要管理边缘生命周期。

**需要调整：`feature_engineering` ID 冲突**

算法注册中心的分类 ID `feature_engineering` 与 Pipeline Engine 的处理器 type `feature_engineering` 重叠。虽然它们在不同的命名空间中（注册中心 vs Pipeline Engine），但语义上容易混淆。

**判断**：算法注册中心中，`feature_engineering` 作为**分类名**保留（它描述的是一类算法），但该分类下的具体算法 ID 使用更精确的命名，如 `algo_normalization`、`algo_pca`、`algo_feature_selection`，避免与 Pipeline 节点 type 冲突。已有的桥接算法（`implType: 'pipeline_node', implRef: 'feature_engineering'`）的算法 ID 改为 `algo_feature_engineering`，加 `algo_` 前缀区分。

---

## 三、3 条战略建议的升华

### 3.1 建议 1 的升华：KG 集成 → 算法执行的知识沉淀

原始建议的核心是：算法执行结果应该自动写入知识图谱，形成"算法→KG→推理→算法"的闭环。

**升华后的理解**：这不仅仅是"把结果写到 KG"，而是在说——算法赋能模块的每一次执行，都应该让平台变得更聪明。KG 是平台的长期记忆，算法执行结果写入 KG，就是把"这次计算发现了什么"变成"平台知道了什么"。

**落地方式**：不在算法服务层硬编码 KG 写入逻辑，而是通过 `output_routing` 机制实现。`algorithm_device_bindings` 表的 `outputRouting` 字段已经支持配置多个输出目标，只需要在路由目标中增加 `kg_nodes` 和 `kg_edges` 两种类型。这样：

- 用户在绑定算法到设备时，可以选择"结果写入 KG"
- 写入的节点类型、边类型、属性映射都在配置中定义
- 算法服务层的 `routeOutput` 方法只需要增加一个 case，调用已有的 KG 服务写入
- 不需要在 `algorithm_definitions` 表增加 `kg_integration` 字段——因为 KG 集成是**绑定级别**的配置（同一个 FFT 算法，绑定到设备 A 时写入 KG，绑定到设备 B 时不写入），不是算法级别的固有属性

这个调整比原始建议更精确：KG 集成是绑定行为，不是算法属性。

### 3.2 建议 2 的升华：动态路由 → 算法结果的智能分发

原始建议的核心是：output_routing 应该支持条件表达式，根据算法输出值动态决定写入哪个目标。

**升华后的理解**：这其实是在说——算法赋能模块不应该只是"执行算法然后把结果扔出去"，而应该具备**决策能力**。当 FFT 检测到异常频率时，不仅要记录结果，还要自动触发告警；当健康指数低于阈值时，不仅要更新 KPI，还要自动创建诊断任务。

**落地方式**：`algorithm_routing_rules` 表已经存在，它的 `conditionExpr` 字段支持条件表达式。但当前设计中，路由规则和设备绑定是分离的两张表，这增加了配置复杂度。

精简方案：将路由规则**内嵌到 `algorithm_device_bindings.outputRouting` 的 JSON 中**，每个路由目标可以带一个 `condition` 字段。这样用户在一个地方就能完成"这个算法绑定到这个设备，结果写到哪里，什么条件下写"的全部配置。`algorithm_routing_rules` 表改为存储**全局路由规则**（不绑定到特定设备的通用规则），作为高级功能保留。

```json
// algorithm_device_bindings.outputRouting 示例
{
  "routes": [
    {
      "target": "algorithm_executions",
      "always": true
    },
    {
      "target": "anomaly_detections",
      "condition": "output.anomaly_score > 0.8",
      "mapping": { "score": "severity", "description": "detail" }
    },
    {
      "target": "device_alerts",
      "condition": "output.health_index < 30",
      "mapping": { "health_index": "value" },
      "alertLevel": "critical"
    },
    {
      "target": "kg_nodes",
      "condition": "output.peak_freq > 0",
      "nodeType": "FrequencyFeature",
      "mapping": { "peak_freq": "dominant_frequency", "rms": "rms_value" }
    }
  ]
}
```

这比独立的 `algorithm_routing_rules` 表更简单、更直观、更实用。用户不需要理解"路由规则"这个抽象概念，只需要在绑定配置中勾选"异常时告警"、"结果写入 KG"等选项。

### 3.3 建议 3 的升华：Fleet Learning → 执行数据驱动的持续优化

原始建议的核心是：同类设备上的算法执行数据应该被聚合分析，用于跨设备的参数优化和 A/B 测试。

**升华后的理解**：这是在说——算法赋能模块应该具备**自我进化**的能力。但自我进化不是一个独立功能，而是整个模块的数据闭环的自然结果。

**落地方式**：不需要专门的 Fleet Learning 服务。`algorithm_executions` 表已经记录了每次执行的 `algoCode`、`deviceCode`、`inputConfig`、`outputResult`、`durationMs`、`status`。只需要在算法服务层提供一个 `getExecutionAnalytics` 方法，对执行数据做聚合分析：

- 同一算法在不同设备上的平均耗时、成功率、异常检出率
- 同一算法不同参数配置的效果对比
- 同一设备上不同算法的效果对比

这些分析结果通过 tRPC API 暴露给前端，在算法详情页展示为"算法效果报告"。用户可以根据报告手动调整参数，也可以在未来版本中实现自动优化。

这比完整的 Fleet Learning 系统更务实：先有数据，再有分析，最后才有自动优化。不跳步。

---

## 四、冲突检测结果与修复方案

### 4.1 已确认的冲突

| 冲突类型 | 具体内容 | 严重程度 | 修复方案 |
|---------|---------|---------|---------|
| ID 重叠 | 算法分类 `feature_engineering` 与 Pipeline 处理器 type `feature_engineering` | 低（不同命名空间） | 算法 ID 加 `algo_` 前缀，分类名保留 |
| 语义重叠 | 算法注册中心的 `anomaly_detection` 分类 vs Pipeline 的 `anomaly_detect` 处理器 | 无冲突 | 算法注册中心是元数据层，Pipeline 是执行层，职责不同 |
| 导入路径 | `algorithm.service.ts` 导入 `PipelineEngine` 和 `PluginEngine` | 需验证 | 确认单例模式和初始化顺序兼容 |
| 表名 | 5 张新表与现有 50+ 张表无命名冲突 | 无冲突 | 已通过检测 |
| 路由命名 | 计划使用 `algorithm` 作为 tRPC 路由命名空间 | 无冲突 | 现有 appRouter 无 `algorithm` 路由 |

### 4.2 需要验证的风险

**风险 1：服务初始化顺序**

`AlgorithmService` 在构造函数中需要访问 `PipelineEngine` 和 `PluginEngine` 的单例。如果算法服务在 Pipeline Engine 之前初始化，会导致空引用。

**修复**：算法服务采用懒加载模式——不在构造函数中获取依赖，而是在首次调用 `executeAlgorithm` 时通过 `getPipelineEngine()` 获取。

**风险 2：数据库迁移**

5 张新表需要执行 `drizzle-kit push` 或手动 SQL 创建。如果迁移失败，不影响现有表。

**修复**：提供独立的迁移脚本 `scripts/migrate-algorithm-tables.mjs`，可单独执行和回滚。

**风险 3：内置算法的数值精度**

FFT、小波分析等信号处理算法使用纯 TypeScript 实现，在大数据量下可能存在精度和性能问题。

**修复**：当前实现作为 MVP 可用。后续可通过 `implType: 'external'` 桥接到 Python 科学计算服务（NumPy/SciPy），获得生产级精度和性能。这正是桥接架构的优势——替换执行后端不需要改任何上层代码。

---

## 五、精简后的实施路径

### 5.1 已完成（可直接使用）

| 组件 | 状态 | 说明 |
|------|------|------|
| 算法注册中心 | 已完成 | 33 个算法定义，已注册到 RegistryManager |
| 算法服务层 | 已完成 | CRUD + 桥接执行 + 推荐 + 路由 + 组合编排 |
| 16 个内置算法 | 已完成 | 8 信号处理 + 8 分析算法 |
| 5 张数据库表 | 已完成 | schema 已追加，待迁移 |

### 5.2 待完成（按优先级排序）

**P0：让模块可用（tRPC 路由 + appRouter 注册）**

这是最紧迫的——已完成的服务层没有暴露 API，前端无法调用。需要：

1. 创建 `server/api/algorithm.router.ts`，暴露核心 API（约 25 个端点）
2. 在 `server/routers.ts` 中注册 `algorithm: algorithmRouter`
3. 执行数据库迁移，创建 5 张新表

预计工作量：1 个文件 + 2 行修改 + 1 个迁移脚本。

**P0 的 API 端点规划：**

| 分组 | 端点 | 说明 |
|------|------|------|
| 算法定义 | `list` / `get` / `create` / `update` / `delete` | 算法 CRUD |
| 算法定义 | `syncBuiltin` | 将注册中心的内置算法同步到数据库 |
| 算法定义 | `listCategories` | 获取分类列表 |
| 设备绑定 | `bind` / `unbind` / `listByDevice` / `listByAlgorithm` / `updateBinding` | 设备↔算法关联 |
| 执行 | `execute` / `executeComposition` | 执行单个算法 / 组合 |
| 执行记录 | `listExecutions` / `getExecutionStats` | 查看历史执行 |
| 推荐 | `recommend` / `autoConfig` | 智能推荐 + 参数自动配置 |
| 组合 | `createComposition` / `listCompositions` / `getComposition` | 算法组合管理 |
| 路由规则 | `createRule` / `listRules` / `updateRule` / `deleteRule` | 全局路由规则 |
| 总览 | `overview` | 统计数据 |

**P1：前端页面（算法总览 + 算法详情 + 设备绑定配置）**

让用户能在界面上浏览算法、绑定到设备、查看执行结果。导航位置：智能引擎 → 算法库。

**P2：KG 集成路由 + 条件路由**

在 `routeOutput` 方法中增加 `kg_nodes` 和 `device_alerts` 两种路由目标，支持条件表达式。

**P3：执行数据分析**

`getExecutionAnalytics` 方法，对执行记录做聚合分析，支持前端展示算法效果报告。

### 5.3 明确不做的事

| 不做 | 原因 |
|------|------|
| 重建执行引擎 | Pipeline Engine 已有 30+ 处理器，桥接即可 |
| 重建模型管理 | model_registry + 训练任务管理已完整 |
| 重建插件框架 | 插件引擎已有 algorithm 类型 |
| 独立的 Fleet Learning 服务 | 当前无大规模执行数据，先积累再优化 |
| 独立的边缘缓存协议 | 由边缘计算模块自行管理 |
| 独立的 KG 写入服务 | 通过 output_routing 配置驱动，复用已有 KG 服务 |

---

## 六、模块嵌入方式总结

算法赋能模块嵌入平台的方式是**四点接入**：

```
                    ┌─────────────────────┐
                    │   算法注册中心       │ ← 第6个注册中心，与其他5个并列
                    │  (algorithm.registry)│
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   算法服务层         │ ← 统一入口：executeAlgorithm()
                    │ (algorithm.service)  │
                    └──┬────┬────┬────┬───┘
                       │    │    │    │
              ┌────────▼┐ ┌▼────▼┐ ┌▼────────┐
              │ builtin  │ │Pipeline│ │ Plugin  │ ← 桥接到3个已有执行引擎
              │ 16个算法 │ │Engine  │ │ Engine  │
              └──────────┘ └───────┘ └─────────┘
                               │
                    ┌──────────▼──────────┐
                    │   输出路由器         │ ← 结果自动写入已有表
                    │  (output router)    │
                    └──┬────┬────┬────┬───┘
                       │    │    │    │
                       ▼    ▼    ▼    ▼
                    anomaly  alerts  KG   device_kpis
                    _detections       nodes
```

**接入点 1：注册中心层** — `algorithm.registry.ts` 注册到 `RegistryManager`，与 `deviceType`、`pipelineNode`、`kgOperator`、`metricType`、`pluginType` 并列。通过 `registry.router.ts` 的统一 API 可查询。

**接入点 2：tRPC 路由层** — `algorithm.router.ts` 注册到 `appRouter`，与其他 25+ 路由并列。前端通过 `trpc.algorithm.*` 调用。

**接入点 3：服务层桥接** — `algorithm.service.ts` 通过懒加载获取 `PipelineEngine` 和 `PluginEngine` 单例，调用它们的执行方法。不修改 Pipeline Engine 和插件引擎的任何代码。

**接入点 4：数据库层** — 5 张新表追加到 `drizzle/schema.ts`，不修改任何已有表。通过外键（`deviceCode`）与 `devices` 表关联，通过 `algoCode` 与 `algorithm_definitions` 表自关联。

**零侵入原则**：算法赋能模块的所有代码都是新增文件，对现有代码的修改仅限于 `registries/index.ts`（+5行注册）和 `routers.ts`（+3行路由注册）。任何时候可以通过删除这些文件和注释掉这几行代码来完全移除算法模块，不影响平台其他功能。

---

## 七、对"快速技术积累"和"快速迭代"的回应

### 7.1 快速技术积累

每次算法执行都会在 `algorithm_executions` 表中留下完整记录：用了什么算法、什么参数、处理了什么数据、耗时多少、结果是什么。这些记录就是技术积累的原始素材。

随着执行记录的积累，平台能回答这些问题：
- "这个设备用什么算法效果最好？" → 查 `algorithm_executions` 按设备分组统计
- "这个算法的最佳参数是什么？" → 查 `algorithm_executions` 按参数分组对比
- "这类故障用什么算法组合最准？" → 查 `algorithm_compositions` 的执行成功率

这就是数据驱动的技术积累，不需要人工总结经验。

### 7.2 快速迭代

新增一个算法的完整步骤：

1. 在 `algorithm.registry.ts` 的 `BUILTIN_ALGORITHMS` 数组中添加一条定义（约 20 行 JSON）
2. 如果是 builtin 类型，在 `builtin/` 目录下实现算法函数
3. 如果是桥接类型（pipeline_node / plugin / external），只需指定 `implRef`，不需要写任何代码
4. 调用 `syncBuiltin` API，自动同步到数据库

新增一个设备类型的算法支持：

1. 在已有算法定义的 `applicableDeviceTypes` 数组中添加新设备类型 ID
2. 完成。推荐引擎自动感知。

修改算法参数配置：

1. 更新 `algorithm_definitions` 表的 `configSchema` 字段
2. 前端配置表单自动适配（复用 Pipeline 的 ConfigFieldSchema 渲染组件）

这就是"快速迭代"——新增算法是分钟级操作，不需要改架构、不需要改前端、不需要改数据库。
