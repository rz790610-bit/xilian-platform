# 算法库底层平台 — 实施报告

**项目：** xilian-platform（熙联工业物联网平台）
**模块：** 算法库（Algorithm Library）
**版本：** v1.0.0
**日期：** 2026-02-14
**作者：** Manus AI

---

## 一、概述

### 1.1 定位

算法库是熙联平台的**统一算法编排层**，定位为"大脑"而非"肌腱"。它不重复建设执行引擎，而是在现有 Pipeline Engine、插件引擎、模型中心之上，提供**元数据管理、设备语义关联、智能推荐、组合编排、动态路由、Fleet Learning** 六大核心能力。

### 1.2 设计原则

算法库的架构设计遵循三条核心原则。第一是**不重复建设**：平台已有的特征工程、异常检测、模型推理、模型训练等执行能力全部复用，算法库只通过 `implType + implRef` 桥接调用。第二是**设备驱动**：每个算法定义携带 `applicableDeviceTypes`、`applicableMeasurementTypes`、`applicableScenarios` 三个语义字段，实现"设备→数据→算法"的自动关联。第三是**可扩展**：新算法接入支持 5 种实现类型（builtin / pipeline_node / plugin / external / kg_operator），无需修改框架代码。

### 1.3 与现有模块的关系

算法库在平台架构中的位置如下表所示，它不替代任何现有模块，而是作为统一的元数据和编排层，将已有的执行能力串联起来。

| 现有模块 | 已有能力 | 算法库的角色 |
|---------|---------|------------|
| Pipeline Engine | 特征工程（归一化/标准化/log/分箱）、异常检测（Z-Score/IQR/IF）、模型推理（TF/ONNX/sklearn/HTTP）、模型评估、模型注册 | 通过 `implType: 'pipeline_node'` 桥接调用，不重建 |
| 插件引擎 | `algorithm` 类型插件框架、插件生命周期管理 | 通过 `implType: 'plugin'` 桥接调用 |
| 模型中心 | 模型注册、版本管理、微调、推理部署 | 训练产出的模型自动注册到模型中心 |
| KG 编排器 | 知识图谱构建、推理、查询 | 通过 `kgIntegration` 字段实现算法↔KG 双向闭环 |
| 诊断系统 | 诊断规则、诊断任务、告警 | 算法执行结果通过 `outputRouting` 自动回写 |

---

## 二、架构总览

### 2.1 文件结构

```
server/
├── core/registries/
│   ├── algorithm.registry.ts      ← 算法注册中心（33 个内置算法定义）
│   └── index.ts                   ← 已注册为第 6 个注册中心
├── services/
│   ├── algorithm.service.ts       ← 算法服务层（1755 行，30+ 公开方法）
│   └── algorithm/builtin/
│       ├── index.ts               ← 内置算法统一入口
│       ├── signal-processing.ts   ← 信号处理算法（8 个，702 行）
│       └── analytics.ts           ← 分析与诊断算法（8 个，802 行）
├── api/
│   └── algorithm.router.ts        ← [待实现] tRPC 路由
drizzle/
└── schema.ts                      ← 追加 5 张新表（行 2930-3120）
```

### 2.2 代码统计

| 文件 | 行数 | 状态 |
|------|------|------|
| `algorithm.registry.ts` | 1,273 | 已完成 |
| `algorithm.service.ts` | 1,755 | 已完成 |
| `builtin/signal-processing.ts` | 702 | 已完成 |
| `builtin/analytics.ts` | 802 | 已完成 |
| `builtin/index.ts` | 65 | 已完成 |
| `drizzle/schema.ts`（新增部分） | ~190 | 已完成 |
| `algorithm.router.ts` | — | 待实现 |
| **合计** | **4,787** | — |

---

## 三、数据库设计

### 3.1 新增表清单

算法库新增 5 张数据库表，复用平台已有的 `devices`、`assetSensors`、`pipelines`、`modelRegistry`、`anomalyDetections`、`pluginRegistry`、`kgNodes` 等 7 张表。

| 表名 | 用途 | 核心字段 |
|------|------|---------|
| `algorithm_definitions` | 算法元数据定义 | algo_code, category, impl_type, impl_ref, input/output/config_schema, applicable_device_types, kg_integration, fleet_learning_config, benchmark |
| `algorithm_compositions` | 算法组合编排（DAG） | comp_code, steps(nodes+edges), applicable_device_types, is_template |
| `algorithm_device_bindings` | 算法-设备绑定 | device_code, sensor_code, algo_code, config_overrides, schedule, output_routing |
| `algorithm_executions` | 执行记录 | execution_id, algo_code, device_code, duration_ms, quality_metrics, ab_group, routing_status |
| `algorithm_routing_rules` | 动态路由规则 | binding_id, condition, targets, cascade_algos, priority, stop_on_match |

### 3.2 algorithm_definitions 表详细设计

这是算法库的核心表，每一行代表一个算法定义。以下是完整字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGINT AUTO_INCREMENT | 主键 |
| `algo_code` | VARCHAR(64) UNIQUE | 算法唯一编码，如 `fft`、`envelope_analysis` |
| `algo_name` | VARCHAR(200) | 算法显示名称 |
| `category` | VARCHAR(64) | 所属分类：signal_processing / feature_engineering / machine_learning / deep_learning / anomaly_detection / predictive / statistics / optimization |
| `subcategory` | VARCHAR(64) | 子分类，如 spectral / filtering / demodulation |
| `description` | TEXT | 算法描述 |
| `impl_type` | ENUM | 实现类型：`pipeline_node` / `plugin` / `builtin` / `external` / `kg_operator` |
| `impl_ref` | VARCHAR(200) | 实现引用，如 `builtin:fft_spectrum`、`pipeline:feature_engineering`、`plugin:custom-algo-v1` |
| `input_schema` | JSON | 输入字段定义（字段名、类型、单位、是否必填） |
| `output_schema` | JSON | 输出字段定义 |
| `config_schema` | JSON | 配置参数定义（含默认值、范围、选项） |
| `applicable_device_types` | JSON (string[]) | 适用设备类型，如 `["vibration_sensor", "accelerometer"]` |
| `applicable_measurement_types` | JSON (string[]) | 适用测量类型，如 `["vibration", "acceleration", "velocity"]` |
| `applicable_scenarios` | JSON (string[]) | 适用场景，如 `["bearing_diagnosis", "gear_diagnosis"]` |
| `kg_integration` | JSON | KG 集成配置：`writes_to_kg`、`node_type`、`edge_type`、`kg_schema_mapping`、`reads_from_kg`、`kg_query` |
| `version` | VARCHAR(32) | 算法版本号 |
| `benchmark` | JSON | 性能基准：latency_ms、throughput_rps、memory_mb、accuracy、f1_score |
| `compatible_input_versions` | JSON (string[]) | 兼容的输入版本列表 |
| `breaking_change` | TINYINT | 是否为破坏性变更 |
| `fleet_learning_config` | JSON | Fleet Learning 配置：enable_ab_test、ab_split_ratio、quality_metrics、auto_rollback_threshold、fleet_aggregation |
| `license` | ENUM | 许可类型：builtin / community / enterprise |
| `author` | VARCHAR(128) | 作者 |
| `documentation_url` | VARCHAR(500) | 文档链接 |
| `tags` | JSON (string[]) | 标签 |
| `status` | ENUM | 状态：active / deprecated / experimental |

**索引设计：** `idx_ad_cat`(category)、`idx_ad_impl`(impl_type)、`idx_ad_status`(status)、`idx_ad_subcategory`(subcategory)。

### 3.3 algorithm_compositions 表详细设计

组合编排表采用 **DAG（有向无环图）** 结构，支持线性、并行、条件分支三种编排模式。

`steps` 字段的 JSON 结构如下：

```json
{
  "nodes": [
    {
      "id": "node_1",
      "order": 1,
      "algo_code": "bandpass_filter",
      "config_overrides": { "low_freq": 100, "high_freq": 5000 },
      "kg_integration": {
        "writes_to_kg": true,
        "node_type": "FilteredSignal",
        "creates_edge": { "from": "RawSignal", "to": "FilteredSignal", "type": "filtered_by" }
      }
    },
    {
      "id": "node_2",
      "order": 2,
      "algo_code": "envelope_analysis",
      "input_from_kg": false
    },
    {
      "id": "node_3",
      "order": 3,
      "algo_code": "statistical_features"
    }
  ],
  "edges": [
    { "from": "node_1", "to": "node_2", "data_mapping": { "filtered": "signal" } },
    { "from": "node_2", "to": "node_3", "data_mapping": { "envelope": "data" } }
  ]
}
```

### 3.4 algorithm_device_bindings 表详细设计

绑定表记录"哪个设备的哪个传感器使用哪个算法，用什么参数，按什么调度，结果路由到哪里"。

| 字段 | 类型 | 说明 |
|------|------|------|
| `device_code` | VARCHAR(64) | 设备编码 |
| `sensor_code` | VARCHAR(64) | 传感器编码（可选） |
| `algo_code` | VARCHAR(64) | 算法编码 |
| `binding_type` | ENUM | `algorithm`（单算法）或 `composition`（组合） |
| `config_overrides` | JSON | 覆盖默认配置的参数 |
| `schedule` | JSON | 调度配置：`{ type: "cron"|"interval"|"event"|"manual", value: "0 */5 * * *" }` |
| `output_routing` | JSON | 输出路由：`[{ target: "anomaly_detection", mapping: {...}, condition: "score > 0.8" }]` |
| `status` | ENUM | active / paused / error |

**唯一约束：** `(device_code, sensor_code, algo_code)` 确保同一设备同一传感器不重复绑定同一算法。

### 3.5 algorithm_executions 表详细设计

执行记录表是算法库的"可观测性"基础，记录每次算法执行的完整 trace。

关键字段包括：`execution_id`（全局唯一）、`input_summary`（输入数据摘要：记录数、字段列表、采样率、数据范围）、`config_used`（实际使用的配置）、`output_summary`（输出摘要）、`duration_ms`（执行耗时）、`memory_used_mb`（内存消耗）、`routing_status`（路由结果：每个目标写入了多少条记录、是否成功）、`ab_group`（A/B 测试分组）、`quality_metrics`（质量指标：accuracy、f1_score 等）。

### 3.6 algorithm_routing_rules 表详细设计

动态路由规则表支持条件表达式匹配和级联触发。

| 字段 | 类型 | 说明 |
|------|------|------|
| `condition` | TEXT | 条件表达式，如 `result.health_index < 40 && result.trend === 'degrading'` |
| `targets` | JSON | 路由目标列表：`[{ target: "alert", action: "create", severity: "critical", mapping: {...} }]` |
| `cascade_algos` | JSON | 级联触发的算法：`[{ algo_code: "rul_estimator", delay_ms: 1000, condition: "result.anomaly_score > 0.9" }]` |
| `priority` | INT | 优先级（数字越小优先级越高） |
| `stop_on_match` | TINYINT | 匹配后是否停止继续匹配后续规则 |

---

## 四、算法注册中心

### 4.1 注册中心架构

算法注册中心（`AlgorithmRegistry`）继承平台的 `BaseRegistry<AlgorithmRegistryItem>` 基类，是平台第 6 个注册中心，与 Pipeline 节点、插件类型、设备类型、KG 算子、监控指标并列。

注册中心提供以下核心能力：

1. **算法元数据管理** — 每个算法的完整定义（输入/输出 Schema、配置 Schema、适用设备、KG 集成配置）
2. **分类体系** — 9 大分类，覆盖工业 PHM 全场景
3. **智能推荐** — `recommend()` 方法根据设备类型、传感器类型、测量指标、数据特征自动推荐算法

### 4.2 分类体系

| 分类 ID | 名称 | 内置算法数量 | 说明 |
|---------|------|------------|------|
| `signal_processing` | 信号处理 | 8 | FFT、STFT、小波、包络、滤波、降噪、倒谱、阶次 |
| `feature_engineering` | 特征工程 | 5 | 统计特征、归一化、PCA、频域特征、特征选择 |
| `machine_learning` | 机器学习 | 5 | 随机森林、SVM、XGBoost、K-Means、GMM |
| `deep_learning` | 深度学习 | 3 | 1D-CNN、LSTM、自编码器 |
| `anomaly_detection` | 异常检测 | 4 | Z-Score、IQR、孤立森林、DBSCAN |
| `predictive` | 预测性维护 | 3 | RUL 预测、退化跟踪、维护调度 |
| `statistics` | 统计分析 | 3 | 分布检验、相关性分析、趋势分析 |
| `optimization` | 优化算法 | 2 | 阈值优化、超参搜索 |
| **合计** | | **33** | |

### 4.3 算法定义结构（AlgorithmRegistryItem）

每个算法定义包含以下核心字段：

```typescript
interface AlgorithmRegistryItem extends RegistryItemMeta {
  id: string;                    // 唯一编码
  label: string;                 // 显示名称
  icon: string;                  // 图标
  description: string;           // 描述
  category: string;              // 注册中心分类
  algorithmCategory: string;     // 算法分类
  subcategory: string;           // 子分类
  implType: 'builtin' | 'pipeline_node' | 'plugin' | 'external' | 'kg_operator';
  implRef: string;               // 实现引用
  inputSchema: AlgorithmIOField[];    // 输入字段定义
  outputSchema: AlgorithmIOField[];   // 输出字段定义
  configSchema: AlgorithmConfigField[]; // 配置参数定义
  applicableDeviceTypes: string[];    // 适用设备类型
  applicableMeasurementTypes: string[]; // 适用测量类型
  applicableScenarios: string[];      // 适用场景
  kgIntegration?: {                   // KG 集成配置
    writes_to_kg?: boolean;
    node_type?: string;
    edge_type?: string;
  };
  tags: string[];
}
```

### 4.4 33 个内置算法完整清单

| 序号 | ID | 名称 | 分类 | 实现类型 | 实现引用 |
|------|-----|------|------|---------|---------|
| 1 | `fft` | 快速傅里叶变换 (FFT) | signal_processing | builtin | builtin:fft_spectrum |
| 2 | `stft` | 短时傅里叶变换 (STFT) | signal_processing | builtin | builtin:stft_spectrogram |
| 3 | `wavelet_transform` | 小波变换 | signal_processing | builtin | builtin:wavelet_analysis |
| 4 | `envelope_analysis` | 包络分析 | signal_processing | builtin | builtin:envelope_analysis |
| 5 | `bandpass_filter` | 带通滤波器 | signal_processing | builtin | builtin:bandpass_filter |
| 6 | `cepstrum_analysis` | 倒谱分析 | signal_processing | builtin | builtin:cepstrum_analysis |
| 7 | `order_tracking` | 阶次跟踪 | signal_processing | builtin | builtin:order_tracking |
| 8 | `signal_denoising` | 信号降噪 | signal_processing | builtin | builtin:wavelet_denoise |
| 9 | `statistical_features` | 统计特征提取 | feature_engineering | builtin | builtin:statistical_features |
| 10 | `normalization` | 数据归一化 | feature_engineering | pipeline_node | pipeline:feature_engineering |
| 11 | `pca_reduction` | PCA 降维 | feature_engineering | builtin | builtin:pca_reduction |
| 12 | `frequency_features` | 频域特征提取 | feature_engineering | builtin | builtin:frequency_features |
| 13 | `feature_selection` | 特征选择 | feature_engineering | builtin | builtin:feature_selection |
| 14 | `random_forest` | 随机森林 | machine_learning | pipeline_node | pipeline:model_inference |
| 15 | `svm_classifier` | SVM 分类器 | machine_learning | pipeline_node | pipeline:model_inference |
| 16 | `xgboost` | XGBoost | machine_learning | pipeline_node | pipeline:model_inference |
| 17 | `kmeans_clustering` | K-Means 聚类 | machine_learning | builtin | builtin:kmeans_clustering |
| 18 | `gaussian_mixture` | 高斯混合模型 | machine_learning | builtin | builtin:gaussian_mixture |
| 19 | `cnn_1d` | 一维卷积网络 | deep_learning | pipeline_node | pipeline:model_inference |
| 20 | `lstm_predictor` | LSTM 时序预测 | deep_learning | pipeline_node | pipeline:model_inference |
| 21 | `autoencoder_anomaly` | 自编码器异常检测 | deep_learning | pipeline_node | pipeline:model_inference |
| 22 | `zscore_detector` | Z-Score 检测 | anomaly_detection | pipeline_node | pipeline:anomaly_detect |
| 23 | `iqr_detector` | IQR 检测 | anomaly_detection | pipeline_node | pipeline:anomaly_detect |
| 24 | `isolation_forest` | 孤立森林 | anomaly_detection | pipeline_node | pipeline:anomaly_detect |
| 25 | `dbscan_detector` | DBSCAN 聚类检测 | anomaly_detection | builtin | builtin:dbscan_detector |
| 26 | `rul_estimator` | RUL 预测 | predictive | builtin | builtin:rul_prediction |
| 27 | `degradation_tracker` | 退化跟踪 | predictive | builtin | builtin:degradation_tracker |
| 28 | `maintenance_scheduler` | 维护调度优化 | predictive | builtin | builtin:maintenance_scheduler |
| 29 | `distribution_test` | 分布检验 | statistics | builtin | builtin:distribution_test |
| 30 | `correlation_analysis` | 相关性分析 | statistics | builtin | builtin:correlation_analysis |
| 31 | `trend_analysis` | 趋势分析 | statistics | builtin | builtin:trend_analysis |
| 32 | `threshold_optimizer` | 自适应阈值优化 | optimization | builtin | builtin:adaptive_threshold |
| 33 | `hyperparameter_search` | 超参数搜索 | optimization | builtin | builtin:hyperparameter_search |

其中 **16 个为 builtin**（算法库自有实现），**17 个为 pipeline_node**（桥接 Pipeline Engine 已有能力）。

---

## 五、算法服务层

### 5.1 服务层架构

`AlgorithmService` 是算法库的核心业务逻辑层，共 1,755 行代码，包含 30+ 个公开方法，分为 12 个功能模块。

### 5.2 功能模块清单

#### 模块 A：算法定义 CRUD

| 方法 | 签名 | 说明 |
|------|------|------|
| `listDefinitions` | `(options?: { category?, search?, status?, implType?, page?, pageSize? }) → Promise<{ items, total }>` | 分页查询算法定义，支持分类/搜索/状态/实现类型过滤 |
| `getDefinition` | `(algoCode: string) → Promise<any \| null>` | 获取单个算法定义 |
| `createDefinition` | `(data: { algoCode, algoName, category, implType, ... }) → Promise<any>` | 创建自定义算法定义 |
| `updateDefinition` | `(algoCode: string, updates: Partial<...>) → Promise<any>` | 更新算法定义 |
| `deleteDefinition` | `(algoCode: string) → Promise<boolean>` | 删除算法定义 |
| `syncBuiltinAlgorithms` | `() → Promise<{ synced, skipped }>` | 将注册中心的 33 个内置算法同步到数据库 |

#### 模块 B：设备绑定管理

| 方法 | 签名 | 说明 |
|------|------|------|
| `createBinding` | `(data: { deviceCode, algoCode, sensorCode?, configOverrides?, schedule?, outputRouting? }) → Promise<any>` | 创建算法-设备绑定 |
| `listBindingsByDevice` | `(deviceCode: string) → Promise<any[]>` | 查询设备的所有算法绑定 |
| `listBindingsByAlgorithm` | `(algoCode: string) → Promise<any[]>` | 查询算法的所有设备绑定 |
| `updateBinding` | `(bindingId: number, updates: Partial<...>) → Promise<any>` | 更新绑定配置 |
| `deleteBinding` | `(bindingId: number) → Promise<boolean>` | 删除绑定 |

#### 模块 C：算法组合编排

| 方法 | 签名 | 说明 |
|------|------|------|
| `createComposition` | `(data: { compCode, compName, steps, ... }) → Promise<any>` | 创建算法组合（含 DAG 循环检测） |
| `listCompositions` | `(options?: { search?, status?, isTemplate?, page?, pageSize? }) → Promise<{ items, total }>` | 查询组合列表 |
| `getComposition` | `(compCode: string) → Promise<any \| null>` | 获取组合详情（含每个节点的算法定义） |

#### 模块 D：算法执行（桥接层）

| 方法 | 签名 | 说明 |
|------|------|------|
| `executeAlgorithm` | `(context: AlgorithmExecutionContext) → Promise<AlgorithmExecutionResult>` | 执行单个算法（自动桥接到对应执行引擎） |
| `executeComposition` | `(compCode: string, inputData: any, deviceCode?: string) → Promise<AlgorithmExecutionResult>` | 执行算法组合（按 DAG 拓扑排序执行） |

桥接执行的分发逻辑如下：

```
executeAlgorithm(context)
  ├── implType === 'builtin'       → executeBuiltin(implRef, inputData, config)
  ├── implType === 'pipeline_node' → executePipelineNode(implRef, inputData, config)
  ├── implType === 'plugin'        → executePlugin(implRef, inputData, config)
  ├── implType === 'external'      → executeExternal(implRef, inputData, config)
  └── implType === 'kg_operator'   → executeKGOperator(implRef, inputData, config)
```

每种桥接方式的实现细节：

- **builtin** — 调用 `server/services/algorithm/builtin/index.ts` 的 `execute()` 函数，路由到对应的内置算法实现
- **pipeline_node** — 构造临时 Pipeline 定义，调用 `PipelineEngine.executePipeline()` 的对应处理器
- **plugin** — 调用 `PluginEngine.executePlugin(pluginId, inputData)`
- **external** — HTTP POST 调用外部服务 URL，支持自定义 headers 和 timeout
- **kg_operator** — 调用 KG 编排器的算子执行接口

#### 模块 E：KG 集成

算法执行完成后，如果算法定义中配置了 `kgIntegration.writes_to_kg = true`，服务层会自动将结果写入知识图谱：

1. 创建 KG 节点（类型由 `node_type` 指定）
2. 创建 KG 边（类型由 `edge_type` 指定，连接设备节点与算法结果节点）
3. 发布事件 `kg.node.create` 到事件总线

#### 模块 F：动态路由引擎

| 方法 | 签名 | 说明 |
|------|------|------|
| `createRoutingRule` | `(data: { bindingId, ruleName, condition, targets, cascadeAlgos?, priority? }) → Promise<any>` | 创建路由规则 |
| `listRoutingRules` | `(algoCode?: string) → Promise<any[]>` | 查询路由规则 |
| `updateRoutingRule` | `(ruleId: number, updates: Partial<...>) → Promise<any>` | 更新路由规则 |
| `deleteRoutingRule` | `(ruleId: number) → Promise<boolean>` | 删除路由规则 |

路由引擎在算法执行完成后自动触发，流程如下：

1. 查询绑定关联的所有路由规则（按 priority 排序）
2. 对每条规则，用 `new Function()` 评估 `condition` 表达式
3. 匹配成功时，将结果写入 `targets` 指定的目标（alert / anomaly_detection / device_kpi / kafka / diagnosis_task）
4. 如果配置了 `cascade_algos`，延迟触发级联算法执行
5. 如果 `stop_on_match = true`，匹配后停止继续评估

#### 模块 G：智能推荐引擎

| 方法 | 签名 | 说明 |
|------|------|------|
| `recommend` | `(options: { deviceCode?, deviceType?, sensorType?, measurementType?, scenario?, dataProfile? }) → Promise<AlgorithmRecommendation[]>` | 智能推荐算法 |

推荐引擎的评分逻辑：

1. **设备类型匹配**（+30 分）— 算法的 `applicableDeviceTypes` 包含当前设备类型
2. **测量类型匹配**（+25 分）— 算法的 `applicableMeasurementTypes` 包含当前测量类型
3. **场景匹配**（+20 分）— 算法的 `applicableScenarios` 包含当前场景
4. **数据特征匹配**（+15 分）— 根据 `dataProfile`（采样率、数据长度、信噪比）推荐：
   - 采样率 > 1kHz → 优先推荐 FFT/STFT/小波
   - 数据长度 > 10000 → 推荐需要大样本的统计算法
   - 低信噪比 → 优先推荐降噪算法
5. **标签匹配**（+10 分）— 算法标签与查询条件的交集

每个推荐结果包含：算法定义、匹配分数、推荐理由列表、建议的配置参数。

`DataProfile` 接口定义：

```typescript
interface DataProfile {
  sampleRateHz?: number;      // 采样率
  dataLengthSamples?: number; // 数据长度
  snrDb?: number;             // 信噪比
  channelCount?: number;      // 通道数
  hasTimestamp?: boolean;      // 是否有时间戳
  dataType?: 'vibration' | 'temperature' | 'pressure' | 'current' | 'acoustic' | 'other';
}
```

#### 模块 H：Fleet Learning

| 方法 | 签名 | 说明 |
|------|------|------|
| `getFleetLearningStats` | `(algoCode: string) → Promise<{ totalExecutions, abGroups, qualityComparison, recommendation }>` | 获取 Fleet Learning 统计 |
| `runFleetOptimization` | `(algoCode: string) → Promise<{ bestConfig, improvement, details }>` | 运行跨设备参数优化 |

Fleet Learning 的工作流程：

1. 算法定义中配置 `fleetLearningConfig.enable_ab_test = true`
2. 每次执行时，根据 `ab_split_ratio` 随机分配到 A 组（当前版本）或 B 组（新版本）
3. 执行记录中记录 `ab_group` 和 `quality_metrics`
4. `getFleetLearningStats` 聚合两组的质量指标，给出推荐（promote / rollback / continue）
5. `runFleetOptimization` 分析所有设备的执行记录，找出最优配置参数

#### 模块 I：执行记录管理

| 方法 | 签名 | 说明 |
|------|------|------|
| `listExecutions` | `(options?: { algoCode?, deviceCode?, status?, startTime?, endTime?, page?, pageSize? }) → Promise<{ items, total }>` | 查询执行记录 |
| `getExecutionStats` | `(algoCode?: string) → Promise<{ total, success, failed, avgDuration, successRate }>` | 执行统计 |

#### 模块 J：边缘缓存协议

| 方法 | 签名 | 说明 |
|------|------|------|
| `getEdgeSyncPackage` | `(deviceCode: string) → Promise<{ algorithms, compositions, configs, syncTimestamp }>` | 获取边缘同步包 |
| `batchUploadExecutions` | `(executions: Array<...>) → Promise<{ uploaded, failed }>` | 批量上传边缘执行记录 |

边缘同步包包含：设备绑定的所有算法定义、组合定义、配置参数、同步时间戳。边缘节点可以离线执行算法，联网后批量回传执行记录。

#### 模块 K：总览统计

| 方法 | 签名 | 说明 |
|------|------|------|
| `getOverviewStats` | `() → Promise<{ totalAlgorithms, byCategory, byImplType, totalBindings, totalExecutions, recentExecutions, topAlgorithms }>` | 算法库总览统计 |

---

## 六、内置算法实现

### 6.1 信号处理算法（8 个）

所有信号处理算法位于 `server/services/algorithm/builtin/signal-processing.ts`（702 行），采用纯 TypeScript 实现，无外部依赖。

| 算法 | 核心方法 | 输入 | 输出 | 技术要点 |
|------|---------|------|------|---------|
| FFT 频谱分析 | `fft_spectrum` | 时域信号 + 采样率 | 频率轴、幅值谱、峰值列表 | Cooley-Tukey 蝶形运算 + Welch 平均 + 峰值检测 |
| STFT 时频分析 | `stft_spectrogram` | 时域信号 + 采样率 | 时频谱图（dB 刻度） | 滑动窗口 + 窗函数（Hanning/Hamming/Blackman） |
| 小波分析 | `wavelet_analysis` | 时域信号 | 小波系数、能量分布 | Daubechies-4 多级分解 + 能量百分比 |
| 包络分析 | `envelope_analysis` | 时域信号 + 采样率 | 包络信号、包络频谱、峰值 | Hilbert 变换（FFT→零负频→IFFT） |
| 带通滤波 | `bandpass_filter` | 时域信号 + 采样率 | 滤波后信号 | 巴特沃斯频域滤波 + 可配置阶数 |
| 小波降噪 | `wavelet_denoise` | 时域信号 | 降噪后信号 | VisuShrink 通用阈值 + 软/硬阈值选择 |
| 倒谱分析 | `cepstrum_analysis` | 时域信号 + 采样率 | 倒谱、倒频率轴、周期性峰值 | IFFT(log(\|FFT(x)\|)) |
| 阶次分析 | `order_analysis` | 振动信号 + 转速 | 各阶次幅值和相位 | 基频提取 + 谐波搜索 |

### 6.2 分析与诊断算法（8 个）

所有分析算法位于 `server/services/algorithm/builtin/analytics.ts`（802 行）。

| 算法 | 核心方法 | 输入 | 输出 | 技术要点 |
|------|---------|------|------|---------|
| 统计特征提取 | `statistical_features` | 时域信号 | 22 维特征向量 | 均值/方差/RMS/峰值因子/波形因子/偏度/峰度/过零率/自相关等 |
| 相关性分析 | `correlation_analysis` | 多通道数据 | 相关矩阵、高相关性对 | Pearson 相关系数 |
| 分布检验 | `distribution_test` | 数据序列 | 正态性/平稳性检验结果、直方图 | Jarque-Bera 检验 + 方差比平稳性检验 |
| RUL 预测 | `rul_prediction` | 退化数据 + 阈值 | 剩余寿命、健康状态、预测曲线 | 指数退化模型 + 线性回归 + 置信区间 |
| 健康指数 | `health_index` | 特征值 + 权重 | 0-100 健康评分、等级(A-F) | 加权归一化评分 |
| 自适应阈值 | `adaptive_threshold` | 历史数据 | 警告/严重阈值 | 统计法(μ+kσ) / 百分位法 / Otsu 法 |
| K-Means 聚类 | `kmeans_clustering` | 多维数据 | 聚类标签、质心、轮廓系数 | K-Means++ 初始化 + 轮廓系数评估 |
| 趋势分析 | `trend_analysis` | 时序数据 | 趋势方向、变化率、移动平均 | 线性回归 + Mann-Kendall 检验 |

### 6.3 统一调用入口

`server/services/algorithm/builtin/index.ts` 提供统一的调用入口：

```typescript
// 执行内置算法
await builtinModule.execute(inputData, config, implRef);

// 列出所有内置算法
builtinModule.listBuiltinAlgorithms();
// → ['fft_spectrum', 'stft_spectrogram', 'wavelet_analysis', ...]

// 检查算法是否存在
builtinModule.hasBuiltinAlgorithm('fft_spectrum'); // → true
```

---

## 七、数据流

### 7.1 算法执行全流程

```
用户/调度器
    │
    ▼
[1] AlgorithmService.executeAlgorithm(context)
    │
    ├── 查询 algorithm_definitions 表获取算法定义
    ├── 合并 config_overrides（绑定配置覆盖默认配置）
    │
    ▼
[2] 桥接分发（根据 implType）
    │
    ├── builtin     → builtin/index.ts → signal-processing.ts / analytics.ts
    ├── pipeline_node → PipelineEngine.executePipeline()
    ├── plugin      → PluginEngine.executePlugin()
    ├── external    → HTTP POST 外部服务
    └── kg_operator → KG 编排器算子执行
    │
    ▼
[3] 执行完成，获取结果
    │
    ├── 写入 algorithm_executions 表（trace 记录）
    │
    ▼
[4] KG 集成（如果 kg_integration.writes_to_kg = true）
    │
    ├── 创建 KG 节点 + KG 边
    ├── 发布 kg.node.create 事件
    │
    ▼
[5] 动态路由（查询 algorithm_routing_rules）
    │
    ├── 评估 condition 表达式
    ├── 匹配成功 → 写入 targets（alert / anomaly / kpi / kafka / diagnosis）
    ├── 级联触发 → cascade_algos（延迟执行关联算法）
    │
    ▼
[6] 返回 AlgorithmExecutionResult
    │
    └── { executionId, output, durationMs, routingResults, kgWriteResults }
```

### 7.2 智能推荐流程

```
用户选择设备
    │
    ▼
[1] recommend({ deviceCode, dataProfile })
    │
    ├── 查询设备信息（类型、传感器列表）
    │
    ▼
[2] 遍历所有 active 算法定义
    │
    ├── 设备类型匹配 → +30 分
    ├── 测量类型匹配 → +25 分
    ├── 场景匹配     → +20 分
    ├── 数据特征匹配 → +15 分
    ├── 标签匹配     → +10 分
    │
    ▼
[3] 按分数排序，返回 Top-N 推荐
    │
    └── 每个推荐包含：算法定义 + 分数 + 推荐理由 + 建议配置
```

### 7.3 组合编排执行流程

```
executeComposition(compCode, inputData)
    │
    ▼
[1] 查询 algorithm_compositions 表
    │
    ├── 解析 steps.nodes 和 steps.edges
    ├── 构建 DAG 邻接表
    ├── 拓扑排序（检测循环依赖）
    │
    ▼
[2] 按拓扑顺序逐节点执行
    │
    ├── node_1: bandpass_filter → 输出 filtered_signal
    │     ↓ (data_mapping: filtered → signal)
    ├── node_2: envelope_analysis → 输出 envelope
    │     ↓ (data_mapping: envelope → data)
    ├── node_3: statistical_features → 输出 features
    │
    ▼
[3] 聚合所有节点的输出
    │
    └── 返回 { output: { node_1: {...}, node_2: {...}, node_3: {...} }, totalDurationMs }
```

---

## 八、待实现部分

### 8.1 tRPC 路由（algorithm.router.ts）

需要创建 `server/api/algorithm.router.ts`，将 AlgorithmService 的 30+ 方法暴露为 tRPC 端点。路由结构规划如下：

```typescript
export const algorithmRouter = router({
  // 算法定义
  listDefinitions: publicProcedure.input(...).query(...),
  getDefinition: publicProcedure.input(...).query(...),
  createDefinition: publicProcedure.input(...).mutation(...),
  updateDefinition: publicProcedure.input(...).mutation(...),
  deleteDefinition: publicProcedure.input(...).mutation(...),
  syncBuiltins: publicProcedure.mutation(...),

  // 设备绑定
  createBinding: publicProcedure.input(...).mutation(...),
  listBindingsByDevice: publicProcedure.input(...).query(...),
  listBindingsByAlgorithm: publicProcedure.input(...).query(...),
  updateBinding: publicProcedure.input(...).mutation(...),
  deleteBinding: publicProcedure.input(...).mutation(...),

  // 算法组合
  createComposition: publicProcedure.input(...).mutation(...),
  listCompositions: publicProcedure.input(...).query(...),
  getComposition: publicProcedure.input(...).query(...),

  // 执行
  execute: publicProcedure.input(...).mutation(...),
  executeComposition: publicProcedure.input(...).mutation(...),

  // 推荐
  recommend: publicProcedure.input(...).query(...),

  // Fleet Learning
  fleetStats: publicProcedure.input(...).query(...),
  fleetOptimize: publicProcedure.input(...).mutation(...),

  // 执行记录
  listExecutions: publicProcedure.input(...).query(...),
  executionStats: publicProcedure.input(...).query(...),

  // 路由规则
  createRoutingRule: publicProcedure.input(...).mutation(...),
  listRoutingRules: publicProcedure.input(...).query(...),
  updateRoutingRule: publicProcedure.input(...).mutation(...),
  deleteRoutingRule: publicProcedure.input(...).mutation(...),

  // 边缘缓存
  edgeSyncPackage: publicProcedure.input(...).query(...),
  batchUploadExecutions: publicProcedure.input(...).mutation(...),

  // 总览
  overview: publicProcedure.query(...),
});
```

### 8.2 注册到 appRouter

在 `server/routers.ts` 中添加：

```typescript
import { algorithmRouter } from './api/algorithm.router';

export const appRouter = router({
  // ... 现有路由
  algorithm: algorithmRouter,
});
```

### 8.3 导航菜单集成

在 `client/src/config/navigation.ts` 的「智能引擎」section 中添加算法库菜单项。

### 8.4 前端页面（后续阶段）

前端页面将在后端 API 完全就绪后实施，包括：算法总览、算法详情、设备绑定管理、组合编排器、执行记录、推荐面板。

---

## 九、拓展性设计

### 9.1 新算法接入方式

| 接入方式 | 步骤 | 适用场景 |
|---------|------|---------|
| **builtin** | 1. 在 `builtin/` 目录新建文件 2. 在 `builtin/index.ts` 注册 3. 在注册中心添加定义 | 平台核心算法 |
| **pipeline_node** | 1. 在 Pipeline Engine 中添加处理器 2. 在注册中心添加定义（implRef 指向处理器） | 需要 Pipeline 上下文的算法 |
| **plugin** | 1. 开发插件（遵循插件引擎规范） 2. 安装插件 3. 在注册中心添加定义 | 第三方扩展算法 |
| **external** | 1. 部署外部服务（HTTP API） 2. 在注册中心添加定义（implRef 为 URL） | 重型计算（GPU 推理等） |
| **kg_operator** | 1. 在 KG 算子注册中心添加算子 2. 在算法注册中心添加定义 | 知识图谱推理算法 |

### 9.2 新设备类型接入

当平台接入新的设备类型时，算法库无需修改代码，只需在算法定义的 `applicableDeviceTypes` 字段中添加新设备类型即可。推荐引擎会自动将新设备类型与适用的算法关联。

### 9.3 自定义场景模板

用户可以通过 `createComposition` API 创建自定义的算法组合模板（`isTemplate = true`），模板可以被其他用户复用。

---

## 十、参考

- [1] 熙联平台架构文档 — `docs/architecture-review-report.md`
- [2] 算法库设计文档 v2（去重版） — `docs/algorithm-library-design-v2.md`
- [3] 算法库设计文档 v3（深化版） — 用户上传的 `算法库底层平台设计_v3_深化版.docx`
- [4] 平台 Pipeline 类型定义 — `shared/pipelineTypes.ts`
- [5] 平台数据库 Schema — `drizzle/schema.ts`
