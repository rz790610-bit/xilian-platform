# 算法库底层平台设计 v2 — 去重版

> **核心原则：不重复建设。** 算法库不是一个独立的新系统，而是对平台已有能力的**统一编排层**。

---

## 一、重叠性分析：平台已有的算法相关能力

在设计算法库之前，必须先明确平台**已经具备**哪些算法能力，避免重复建设。

### 1.1 已有能力清单

| 已有模块 | 已有能力 | 位置 |
|---------|---------|------|
| **Pipeline Engine** | feature_engineering（归一化/标准化/log变换/分箱）、model_inference（TF/ONNX/sklearn/自定义HTTP推理）、model_evaluate（分类/回归评估指标）、anomaly_detect（Z-Score/IQR/Isolation Forest）、model_register（模型注册到仓库） | `server/services/pipeline.engine.ts` |
| **Pipeline 节点注册中心** | 50+ 节点类型，含 `machine_learning` 分类（5个ML节点）、`multimodal` 分类（3个多模态节点）、`llm` 分类（5个大模型节点） | `server/core/registries/pipeline-node.registry.ts` |
| **插件引擎** | `algorithm` 插件类型，支持 train/predict/evaluate/explain 四种能力，支持 ONNX/TF/PyTorch/sklearn 框架 | `server/core/registries/plugin-type.registry.ts` |
| **模型中心** | Ollama 模型管理、模型推理、模型微调、模型评估、模型仓库（modelRegistry 表） | `server/services/model.service.ts` |
| **异常检测** | anomalyDetections 表（Z-Score/IQR/MAD/Isolation Forest/自定义）、anomalyModels 表（模型文件/超参数/准确率） | `drizzle/schema.ts` |
| **诊断系统** | diagnosisRules 表（规则引擎）、diagnosisTasks 表（诊断任务）、diagnosisResults 表（诊断结果/置信度） | `drizzle/schema.ts` |
| **模型训练** | modelTrainingJobs 表（训练任务/超参数/GPU/损失值）、modelDeployments 表（模型部署） | `drizzle/schema.ts` |
| **设备类型注册中心** | 8大设备分类、每种设备有 measurementTypes（测量指标类型/单位/正常范围/告警阈值） | `server/core/registries/device-type.registry.ts` |
| **KG 算子注册中心** | 6大分类（抽取/转换/增强/查询/推理/导出），含 NER、关系抽取、图神经网络推理等 | `server/core/registries/kg-operator.registry.ts` |

### 1.2 重叠分析矩阵

| 原设计中的算法库能力 | 平台已有？ | 处理方式 |
|---------------------|-----------|---------|
| 特征工程（归一化/标准化/log/分箱） | ✅ Pipeline Engine `execFeatureEngineering` | **复用**，不重建 |
| 异常检测（Z-Score/IQR/IF） | ✅ Pipeline Engine `execAnomalyDetect` + anomalyDetections 表 | **复用**，不重建 |
| 模型推理 | ✅ Pipeline Engine `execModelInference` + 模型中心 | **复用**，不重建 |
| 模型评估 | ✅ Pipeline Engine `execModelEvaluate` + modelEvaluations 表 | **复用**，不重建 |
| 模型注册 | ✅ Pipeline Engine `execModelRegister` + modelRegistry 表 | **复用**，不重建 |
| 模型训练 | ✅ modelTrainingJobs 表 + 模型中心微调 | **复用**，不重建 |
| 算法插件框架 | ✅ 插件引擎 `algorithm` 类型 | **复用**，不重建 |
| 算法执行引擎 | ✅ Pipeline Engine（完整的 source→processor→sink 执行链） | **复用**，不重建 |
| 设备关联推荐 | ❌ 不存在 | **新建** |
| 算法定义与分类管理 | ❌ 不存在（Pipeline 节点是硬编码的，不可动态管理） | **新建** |
| 算法参数自动推荐 | ❌ 不存在 | **新建** |
| 算法组合编排（非 Pipeline 级别） | ❌ 不存在 | **新建** |
| 算法性能基准测试 | ❌ 不存在 | **新建** |
| 算法版本管理 | ❌ 不存在（模型有版本，算法没有） | **新建** |
| 信号处理算法（FFT/小波/包络） | ❌ Pipeline Engine 没有信号处理 | **新建** |
| 统计分析算法（分布检验/相关性） | ❌ 不存在 | **新建** |

---

## 二、算法库的精确定位：统一编排层

### 2.1 算法库不是什么

- **不是**另一个 Pipeline Engine — 不重建执行引擎
- **不是**另一个模型中心 — 不重建模型管理
- **不是**另一个插件引擎 — 不重建插件框架
- **不是**另一个异常检测模块 — 不重建检测算法

### 2.2 算法库是什么

算法库是一个**算法元数据管理 + 智能编排 + 设备关联**的统一层，它：

1. **管理算法定义**（元数据、分类、版本、参数 Schema、性能基准）
2. **关联设备上下文**（根据设备类型/传感器类型/测量指标自动推荐适用算法）
3. **编排算法组合**（将多个原子算法组合为场景化方案，如"轴承诊断方案 = FFT → 包络分析 → 特征提取 → 异常检测"）
4. **补充缺失算法**（信号处理、统计分析等 Pipeline Engine 尚未覆盖的算法）
5. **桥接已有模块**（调用 Pipeline Engine 执行、调用模型中心推理、调用插件引擎扩展）

### 2.3 架构层级关系

```
┌─────────────────────────────────────────────────────┐
│                   算法库（新建）                       │
│  算法定义 │ 设备关联 │ 智能推荐 │ 组合编排 │ 基准测试  │
├─────────────────────────────────────────────────────┤
│                 调用层（桥接，不重建）                  │
│  Pipeline Engine │ 模型中心 │ 插件引擎 │ 异常检测     │
├─────────────────────────────────────────────────────┤
│                 数据层（复用已有表）                    │
│  modelRegistry │ anomalyModels │ pipelines │ plugins  │
└─────────────────────────────────────────────────────┘
```

---

## 三、算法库的数据模型（仅新建部分）

### 3.1 新建表：`algorithm_definitions`（算法定义表）

> 这是算法库的**核心表**，管理算法的元数据。不存储算法实现（实现在 Pipeline Engine / 插件引擎中）。

```sql
CREATE TABLE algorithm_definitions (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  algo_code       VARCHAR(64) NOT NULL UNIQUE,        -- 算法编码（如 fft_spectrum）
  algo_name       VARCHAR(200) NOT NULL,               -- 算法名称
  category        VARCHAR(64) NOT NULL,                -- 分类（signal_processing / feature_engineering / ml / dl / anomaly / statistics / optimization）
  subcategory     VARCHAR(64),                         -- 子分类（如 frequency_domain / time_domain）
  description     TEXT,                                -- 算法描述
  
  -- 实现桥接（指向已有模块，不重建）
  impl_type       ENUM('pipeline_node', 'plugin', 'builtin', 'external') NOT NULL,
  impl_ref        VARCHAR(200),                        -- 实现引用：
                                                       --   pipeline_node → 节点 subType（如 'anomaly_detect'）
                                                       --   plugin → pluginCode
                                                       --   builtin → 内置函数名
                                                       --   external → HTTP endpoint
  
  -- 输入输出 Schema
  input_schema    JSON NOT NULL,                       -- 输入参数定义（字段名/类型/描述）
  output_schema   JSON NOT NULL,                       -- 输出结果定义
  config_schema   JSON NOT NULL,                       -- 配置参数定义（与 Pipeline configFields 格式一致）
  
  -- 设备关联（拓展性核心）
  applicable_device_types   JSON,                      -- 适用设备类型 ["vibration_sensor", "temperature_sensor"]
  applicable_measurement_types JSON,                   -- 适用测量指标 ["acceleration", "velocity", "temperature"]
  applicable_scenarios      JSON,                      -- 适用场景 ["bearing_diagnosis", "gear_diagnosis"]
  
  -- 版本与性能
  version         VARCHAR(32) NOT NULL DEFAULT 'v1.0',
  benchmark       JSON,                                -- 性能基准 { latency_ms, throughput_rps, accuracy, memory_mb }
  
  -- 商业化属性
  license         ENUM('builtin', 'community', 'enterprise') DEFAULT 'builtin',
  author          VARCHAR(128),
  documentation_url VARCHAR(500),
  tags            JSON,
  
  -- 元数据
  status          ENUM('active', 'deprecated', 'experimental') DEFAULT 'active',
  created_at      TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  
  INDEX idx_ad_cat (category),
  INDEX idx_ad_impl (impl_type),
  INDEX idx_ad_status (status)
);
```

**关键设计说明：**
- `impl_type` + `impl_ref` 是桥接字段，指向已有模块的具体实现，**不在算法库中重新实现算法逻辑**
- `applicable_device_types` 关联到 `device-type.registry.ts` 中的设备类型 ID
- `applicable_measurement_types` 关联到设备类型注册中心的 `measurementTypes`
- `config_schema` 与 Pipeline 的 `ConfigFieldSchema` 格式完全一致，确保配置 UI 可复用

### 3.2 新建表：`algorithm_compositions`（算法组合表）

> 将多个原子算法编排为场景化方案。

```sql
CREATE TABLE algorithm_compositions (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  comp_code       VARCHAR(64) NOT NULL UNIQUE,         -- 组合编码
  comp_name       VARCHAR(200) NOT NULL,               -- 组合名称（如"轴承故障诊断方案"）
  description     TEXT,
  
  -- 组合定义
  steps           JSON NOT NULL,                       -- 有序步骤列表：
                                                       -- [{ order: 1, algo_code: "fft_spectrum", config_overrides: {...} },
                                                       --  { order: 2, algo_code: "envelope_analysis", config_overrides: {...} },
                                                       --  { order: 3, algo_code: "anomaly_zscore", config_overrides: {...} }]
  
  -- 设备关联
  applicable_device_types   JSON,
  applicable_scenarios      JSON,
  
  -- 元数据
  version         VARCHAR(32) NOT NULL DEFAULT 'v1.0',
  is_template     TINYINT DEFAULT 0,                   -- 是否为平台预设模板
  status          ENUM('active', 'deprecated', 'draft') DEFAULT 'active',
  created_by      VARCHAR(64),
  created_at      TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  
  INDEX idx_ac_status (status)
);
```

### 3.3 新建表：`algorithm_device_bindings`（算法-设备绑定表）

> 记录具体设备实例与算法实例的绑定关系。

```sql
CREATE TABLE algorithm_device_bindings (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_code     VARCHAR(64) NOT NULL,                -- 设备编码（关联 assetNodes.nodeCode）
  sensor_code     VARCHAR(64),                         -- 传感器编码（关联 assetSensors.sensorCode，可选）
  algo_code       VARCHAR(64) NOT NULL,                -- 算法编码（或组合编码）
  binding_type    ENUM('algorithm', 'composition') NOT NULL,
  
  -- 实例化配置（覆盖算法默认配置）
  config_overrides JSON,                               -- 针对该设备的参数覆盖
  schedule        JSON,                                -- 执行调度 { type: 'cron'|'interval'|'event', value: ... }
  
  -- 输出路由（自动化核心）
  output_routing  JSON,                                -- 结果写入目标：
                                                       -- [{ target: 'anomaly_detections', mapping: {...} },
                                                       --  { target: 'device_kpis', mapping: {...} },
                                                       --  { target: 'alert_rules', condition: 'is_anomaly == true' }]
  
  -- 状态
  status          ENUM('active', 'paused', 'error') DEFAULT 'active',
  last_run_at     TIMESTAMP(3),
  last_run_status VARCHAR(32),
  error_message   TEXT,
  
  created_at      TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  
  INDEX idx_adb_device (device_code),
  INDEX idx_adb_algo (algo_code),
  INDEX idx_adb_status (status),
  UNIQUE INDEX idx_adb_unique (device_code, sensor_code, algo_code)
);
```

### 3.4 新建表：`algorithm_executions`（算法执行记录表）

> 记录每次算法执行的详细信息，用于审计和性能分析。

```sql
CREATE TABLE algorithm_executions (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  execution_id    VARCHAR(64) NOT NULL UNIQUE,         -- 执行ID
  binding_id      BIGINT,                              -- 关联绑定ID
  algo_code       VARCHAR(64) NOT NULL,
  device_code     VARCHAR(64),
  
  -- 执行详情
  input_summary   JSON,                                -- 输入数据摘要（记录数/时间范围/字段列表）
  config_used     JSON,                                -- 实际使用的配置
  output_summary  JSON,                                -- 输出结果摘要
  
  -- 性能指标
  started_at      TIMESTAMP(3),
  completed_at    TIMESTAMP(3),
  duration_ms     INT,
  records_processed INT,
  memory_used_mb  DOUBLE,
  
  -- 状态
  status          ENUM('running', 'success', 'failed', 'timeout') NOT NULL,
  error_message   TEXT,
  
  -- 结果路由状态
  routing_status  JSON,                                -- 每个输出目标的写入状态
  
  created_at      TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  
  INDEX idx_ae_algo (algo_code),
  INDEX idx_ae_device (device_code),
  INDEX idx_ae_status (status),
  INDEX idx_ae_time (started_at)
);
```

### 3.5 不新建的表（复用已有）

| 需求 | 复用的已有表 | 说明 |
|------|------------|------|
| 模型存储 | `model_registry` | 算法训练产出的模型直接注册到模型仓库 |
| 异常检测结果 | `anomaly_detections` | 异常检测算法的结果通过 output_routing 写入 |
| 诊断结果 | `diagnosis_results` | 诊断算法的结果通过 output_routing 写入 |
| 设备 KPI | `device_kpis` | 特征工程算法的结果通过 output_routing 写入 |
| 告警 | `alert_rules` + `device_alerts` | 算法触发的告警通过 output_routing 写入 |
| Pipeline 定义 | `pipelines` + `pipeline_runs` | 算法组合可自动生成 Pipeline 定义 |
| 插件注册 | `plugin_registry` + `plugin_instances` | 外部算法通过插件引擎接入 |

---

## 四、算法分类体系与内置算法

### 4.1 分类体系（9 大类）

| 分类 ID | 名称 | 说明 | 内置算法数 | impl_type |
|---------|------|------|-----------|-----------|
| `signal_processing` | 信号处理 | FFT、小波变换、包络分析、滤波等 | 8 | `builtin`（**新建**） |
| `feature_engineering` | 特征工程 | 归一化、标准化、统计特征提取等 | 4 | `pipeline_node`（**复用** `feature_engineering`） |
| `machine_learning` | 机器学习 | 分类、回归、聚类 | 3 | `pipeline_node`（**复用** `model_inference`） |
| `deep_learning` | 深度学习 | LSTM、AutoEncoder、CNN | 3 | `pipeline_node`（**复用** `model_inference`） |
| `anomaly_detection` | 异常检测 | Z-Score、IQR、IF、移动平均 | 4 | `pipeline_node`（**复用** `anomaly_detect`） |
| `predictive` | 预测性维护 | RUL 预测、退化趋势、故障概率 | 3 | `builtin`（**新建**） |
| `statistics` | 统计分析 | 分布检验、相关性分析、趋势分析 | 4 | `builtin`（**新建**） |
| `optimization` | 优化算法 | 参数寻优、调度优化 | 2 | `builtin`（**新建**） |
| `custom` | 自定义 | 用户上传的自定义算法 | 0 | `plugin` 或 `external` |

### 4.2 内置算法清单（31 个）

#### 信号处理（8 个，新建 builtin 实现）

| 算法编码 | 名称 | 输入 | 输出 | 适用设备 |
|---------|------|------|------|---------|
| `fft_spectrum` | FFT 频谱分析 | 时域信号 | 频谱数据 + 主频率 | vibration_sensor |
| `stft_spectrogram` | 短时傅里叶变换 | 时域信号 | 时频谱图 | vibration_sensor |
| `wavelet_decompose` | 小波分解 | 时域信号 | 多尺度分量 | vibration_sensor, acoustic_sensor |
| `envelope_analysis` | 包络分析 | 时域信号 | 包络信号 + 包络频谱 | vibration_sensor |
| `bandpass_filter` | 带通滤波 | 时域信号 | 滤波后信号 | vibration_sensor, acoustic_sensor |
| `resampling` | 重采样 | 不等间隔信号 | 等间隔信号 | 所有传感器 |
| `detrend` | 去趋势 | 时域信号 | 去趋势信号 | 所有传感器 |
| `hilbert_transform` | 希尔伯特变换 | 时域信号 | 瞬时频率 + 瞬时幅值 | vibration_sensor |

#### 特征工程（4 个，复用 Pipeline `feature_engineering` 节点）

| 算法编码 | 名称 | impl_ref | 说明 |
|---------|------|----------|------|
| `normalize` | 归一化 | `feature_engineering` (operation: normalize) | 复用已有 |
| `standardize` | 标准化 | `feature_engineering` (operation: standardize) | 复用已有 |
| `log_transform` | 对数变换 | `feature_engineering` (operation: log_transform) | 复用已有 |
| `stat_features` | 统计特征提取 | `builtin` | **新建**：RMS、峰值、峰峰值、波形因子、峰值因子、脉冲因子、裕度因子、偏度、峭度 |

#### 异常检测（4 个，复用 Pipeline `anomaly_detect` 节点）

| 算法编码 | 名称 | impl_ref | 说明 |
|---------|------|----------|------|
| `anomaly_zscore` | Z-Score 异常检测 | `anomaly_detect` (method: zscore) | 复用已有 |
| `anomaly_iqr` | IQR 异常检测 | `anomaly_detect` (method: iqr) | 复用已有 |
| `anomaly_isolation_forest` | Isolation Forest | `anomaly_detect` (method: isolation_forest) | 复用已有 |
| `anomaly_moving_avg` | 移动平均偏差 | `anomaly_detect` (method: moving_avg) | 复用已有 |

#### 机器学习（3 个，复用 Pipeline `model_inference` 节点）

| 算法编码 | 名称 | impl_ref | 说明 |
|---------|------|----------|------|
| `ml_classification` | 分类模型推理 | `model_inference` (taskType: classification) | 复用已有 |
| `ml_regression` | 回归模型推理 | `model_inference` (taskType: regression) | 复用已有 |
| `ml_clustering` | 聚类分析 | `builtin` | **新建**：K-Means / DBSCAN |

#### 深度学习（3 个，复用 Pipeline `model_inference` 节点）

| 算法编码 | 名称 | impl_ref | 说明 |
|---------|------|----------|------|
| `dl_lstm_predict` | LSTM 时序预测 | `model_inference` (modelType: onnx) | 复用已有推理通道 |
| `dl_autoencoder` | AutoEncoder 异常检测 | `model_inference` (modelType: onnx) | 复用已有推理通道 |
| `dl_cnn_classify` | CNN 图像分类 | `model_inference` (modelType: onnx) | 复用已有推理通道 |

#### 预测性维护（3 个，新建 builtin）

| 算法编码 | 名称 | 输入 | 输出 | 适用设备 |
|---------|------|------|------|---------|
| `rul_prediction` | 剩余寿命预测 | 历史趋势数据 | RUL 天数 + 置信区间 | 所有设备 |
| `degradation_trend` | 退化趋势分析 | 历史 KPI 序列 | 趋势方向 + 退化速率 + 预计到阈值时间 | 所有设备 |
| `failure_probability` | 故障概率评估 | 多维特征 | 故障概率 + 风险等级 | 所有设备 |

#### 统计分析（4 个，新建 builtin）

| 算法编码 | 名称 | 输入 | 输出 |
|---------|------|------|------|
| `distribution_test` | 分布检验 | 数值序列 | 正态性检验结果 + 分布类型 |
| `correlation_analysis` | 相关性分析 | 多维数据 | 相关系数矩阵 + 显著性 |
| `trend_analysis` | 趋势分析 | 时序数据 | 趋势方向 + 变点检测 |
| `outlier_grubbs` | Grubbs 离群值检验 | 数值序列 | 离群值标记 |

#### 优化算法（2 个，新建 builtin）

| 算法编码 | 名称 | 输入 | 输出 |
|---------|------|------|------|
| `param_optimization` | 参数寻优 | 目标函数 + 参数范围 | 最优参数组合 |
| `threshold_optimization` | 阈值优化 | 历史数据 + 标签 | 最优告警阈值 |

---

## 五、API 设计（tRPC 路由）

### 5.1 `algorithm` 路由 — 算法定义管理

```typescript
// server/api/algorithm.router.ts
export const algorithmRouter = router({
  // ======== 算法定义 CRUD ========
  list:           查询算法列表（支持分类/设备类型/场景过滤）,
  getById:        获取算法详情,
  create:         创建自定义算法定义,
  update:         更新算法定义,
  delete:         删除算法定义,
  
  // ======== 智能推荐（新能力，不重复） ========
  recommend:      根据设备类型 + 传感器类型 + 测量指标，推荐适用算法,
  autoConfig:     根据数据特征（采样率/数据量/值域），自动推荐算法参数,
  
  // ======== 算法组合 ========
  listCompositions:    查询算法组合列表,
  getComposition:      获取组合详情,
  createComposition:   创建算法组合,
  updateComposition:   更新算法组合,
  deleteComposition:   删除算法组合,
  
  // ======== 设备绑定 ========
  listBindings:        查询设备-算法绑定列表,
  createBinding:       创建绑定（算法 + 设备 + 配置 + 调度 + 输出路由）,
  updateBinding:       更新绑定,
  deleteBinding:       删除绑定,
  
  // ======== 执行控制（桥接 Pipeline Engine，不重建） ========
  execute:             手动触发一次算法执行,
  getExecutionHistory: 查询执行历史,
  getExecutionDetail:  获取执行详情,
  
  // ======== 基准测试 ========
  runBenchmark:        对算法运行基准测试,
  
  // ======== 分类与注册中心 ========
  listCategories:      获取算法分类列表,
  getRegistryStats:    获取注册中心统计信息,
});
```

### 5.2 执行流程（桥接，不重建执行引擎）

```
用户点击"执行" 
  → algorithm.execute({ bindingId, inputData })
    → 算法服务查询 binding 的 algo_code
    → 查询 algorithm_definitions 获取 impl_type + impl_ref
    → 根据 impl_type 分发：
        ├── pipeline_node → 构造临时 Pipeline，调用 Pipeline Engine 执行
        ├── plugin       → 调用 pluginEngine.executePlugin()
        ├── builtin      → 调用内置算法函数（仅信号处理/统计/预测等新算法）
        └── external     → HTTP 调用外部服务
    → 收集执行结果
    → 根据 output_routing 写入目标表（anomaly_detections / device_kpis / alert_rules 等）
    → 写入 algorithm_executions 记录
```

---

## 六、与现有模块的集成接口（桥接而非重建）

### 6.1 与 Pipeline Engine 的桥接

```typescript
// 算法库 → Pipeline Engine
// 当 impl_type === 'pipeline_node' 时，算法库构造一个临时 Pipeline 配置
function buildTempPipeline(algoDefinition, inputData, config) {
  return {
    id: `algo-exec-${Date.now()}`,
    source: { type: 'memory', config: { data: inputData } },
    processors: [{ type: algoDefinition.impl_ref, config: mergeConfig(algoDefinition.config_schema, config) }],
    sink: { type: 'memory', config: {} },
  };
}
// 调用 Pipeline Engine 的 ConnectorFactory.execute() 执行
```

### 6.2 与插件引擎的桥接

```typescript
// 算法库 → 插件引擎
// 当 impl_type === 'plugin' 时
async function executeViaPlugin(algoDefinition, inputData, config) {
  return pluginEngine.executePlugin(algoDefinition.impl_ref, {
    ...config,
    inputData,
  });
}
```

### 6.3 与设备类型注册中心的联动

```typescript
// 智能推荐：根据设备类型查询适用算法
async function recommendAlgorithms(deviceTypeId: string) {
  // 1. 从 device-type.registry 获取设备类型信息
  const deviceType = deviceTypeRegistry.get(deviceTypeId);
  // 2. 获取该设备类型的测量指标
  const measurementTypes = deviceType.measurementTypes.map(m => m.name);
  // 3. 查询 algorithm_definitions 中 applicable_device_types 包含该设备类型的算法
  // 4. 按相关性排序返回
}
```

### 6.4 与模型中心的联动

```typescript
// 算法执行产出模型 → 自动注册到 model_registry
// 当算法的 output_schema 包含 model_file 字段时
async function registerModelFromAlgorithm(executionResult) {
  // 复用 Pipeline Engine 的 execModelRegister 逻辑
}
```

---

## 七、后端文件结构

```
server/
├── api/
│   └── algorithm.router.ts          ← tRPC 路由（新建）
├── core/
│   └── registries/
│       └── algorithm.registry.ts    ← 算法注册中心（新建，继承 BaseRegistry）
├── services/
│   └── algorithm/
│       ├── algorithm.service.ts     ← 算法服务主文件（CRUD + 推荐 + 执行桥接）
│       ├── builtin/                 ← 仅新建的内置算法实现
│       │   ├── signal-processing.ts ← FFT/小波/包络/滤波（新建）
│       │   ├── statistics.ts        ← 分布检验/相关性/趋势（新建）
│       │   ├── predictive.ts        ← RUL/退化趋势/故障概率（新建）
│       │   ├── optimization.ts      ← 参数寻优/阈值优化（新建）
│       │   ├── stat-features.ts     ← 统计特征提取（新建）
│       │   └── clustering.ts        ← K-Means/DBSCAN（新建）
│       ├── bridge/                  ← 桥接层（调用已有模块）
│       │   ├── pipeline.bridge.ts   ← 桥接 Pipeline Engine（复用）
│       │   ├── plugin.bridge.ts     ← 桥接插件引擎（复用）
│       │   └── model.bridge.ts      ← 桥接模型中心（复用）
│       └── recommend.service.ts     ← 智能推荐引擎（新建）
drizzle/
└── schema.ts                        ← 追加 4 张新表（不修改已有表）
```

---

## 八、拓展性设计

### 8.1 新设备类型接入（零代码改动）

当 `device-type.registry.ts` 新增设备类型时：
1. 算法库的 `recommend` API 自动感知新设备类型
2. 只需在 `algorithm_definitions.applicable_device_types` 中添加新设备类型 ID
3. 无需修改任何算法实现代码

### 8.2 新算法接入（5 种方式）

| 接入方式 | impl_type | 适用场景 | 需要改动 |
|---------|-----------|---------|---------|
| Pipeline 节点 | `pipeline_node` | 在 Pipeline Engine 中新增处理器 | 修改 pipeline.engine.ts |
| 插件 | `plugin` | 通过插件引擎安装 | 安装插件，创建 algorithm_definition |
| 内置函数 | `builtin` | 在 `builtin/` 目录新增 | 新增 .ts 文件 + algorithm_definition |
| HTTP 服务 | `external` | 调用外部 Python/Java 算法服务 | 只需创建 algorithm_definition |
| ONNX 模型 | `pipeline_node` → `model_inference` | 上传 ONNX 模型文件 | 上传模型 + 创建 algorithm_definition |

### 8.3 用户自定义场景模板

用户可以通过 `algorithm_compositions` 创建自己的算法组合模板：
- 选择多个原子算法
- 定义执行顺序和数据传递
- 绑定到特定设备类型
- 保存为可复用模板

---

## 九、易用性设计

### 9.1 自动推荐流程

```
用户选择设备 → 系统自动推荐适用算法
  → 用户选择算法 → 系统根据数据特征自动推荐参数
  → 用户确认/调整参数 → 系统自动配置输出路由
  → 一键绑定并启动
```

### 9.2 配置逻辑简化

- 算法的 `config_schema` 与 Pipeline 的 `ConfigFieldSchema` 格式一致，前端可复用同一套配置表单组件
- `autoConfig` API 根据数据特征（采样率、数据量、值域）自动推荐参数默认值
- `output_routing` 提供预设模板（如"异常检测结果 → anomaly_detections + 告警"）

### 9.3 一键式操作

- **一键诊断**：选择设备 → 自动推荐算法组合 → 一键执行 → 结果自动写入诊断报告
- **一键监控**：选择设备 → 绑定算法 → 配置调度 → 自动持续监控
- **一键对比**：选择多个算法 → 同一数据集 → 并行执行 → 对比结果

---

## 十、实施优先级

| 优先级 | 内容 | 工作量 | 依赖 |
|--------|------|--------|------|
| P0 | 4 张数据库表 + algorithm.registry.ts + algorithm.router.ts | 中 | 无 |
| P0 | algorithm.service.ts（CRUD + 桥接层） | 中 | P0 表 |
| P1 | 内置信号处理算法（FFT/小波/包络/滤波） | 大 | P0 服务 |
| P1 | 智能推荐引擎（recommend + autoConfig） | 中 | P0 服务 + 设备注册中心 |
| P2 | 内置统计分析算法 | 中 | P0 服务 |
| P2 | 内置预测性维护算法 | 中 | P0 服务 |
| P2 | 算法组合编排 | 中 | P0 服务 |
| P3 | 基准测试 | 小 | P0 服务 |
| P3 | 内置优化算法 | 小 | P0 服务 |
