# 算法库底层平台 — 完整逻辑设计文档

> **设计原则：工程化、商业化、自动化**
> 
> - **工程化**：算法从定义 → 配置 → 测试 → 部署 → 监控的完整生命周期，每一步都有标准化流程和可追溯记录
> - **商业化**：算法作为可交付的产品组件，支持版本管理、许可授权、性能基准、SLA 承诺
> - **自动化**：设备接入后自动推荐适用算法，参数自动调优，Pipeline 自动编排，结果自动回写

---

## 一、平台现有数据模型梳理（算法库的上下文）

算法库不是孤立模块，它必须深度嵌入平台现有的数据链路。以下是算法库需要对接的核心数据实体：

### 1.1 设备层级模型（已有）

```
资产树 (asset_nodes)
  ├── 测点 (asset_measurement_points)    ← 物理安装位置
  │     └── 传感器 (asset_sensors)       ← 具体采集硬件
  │           └── 遥测数据 (realtime_data_latest / vibration_1hour_agg)
  └── 设备类型注册表 (device-type.registry)  ← 8大类 × N种设备类型
        ├── 属性模型 (DeviceProperty[])
        ├── 指令集 (DeviceCommand[])
        └── 遥测字段 (TelemetryField[])
```

### 1.2 数据接入链路（已有）

```
协议适配器 (15个) → 数据连接器 (data_connectors) → 数据端点 (data_endpoints) → 数据绑定 (data_bindings) → 平台消费者
```

### 1.3 诊断链路（已有）

```
异常检测 (anomaly_detections)  ← 已有 algorithmType 字段（zscore/iqr/mad/isolation_forest/custom）
诊断规则 (diagnosis_rules)     ← 已有 deviceType + sensorType 字段
诊断任务 (diagnosis_tasks)     ← 已有 inputData + result JSON 字段
```

### 1.4 Pipeline 链路（已有）

```
Pipeline 定义 (pipelines) → Pipeline 运行 (pipeline_runs) → 节点指标 (pipeline_node_metrics)
Pipeline 节点类型：ML_NODES (4个) + LLM_NODES (5个) + DATA_ENGINEERING_NODES (8个)
```

### 1.5 模型链路（已有）

```
模型注册表 (model_registry) → 训练任务 (model_training_jobs) → 部署 (model_deployments) → 推理日志 (model_inference_logs)
```

---

## 二、算法应用全流程（端到端数据流）

### 2.1 全流程概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        算法应用全流程（端到端）                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ① 设备接入         ② 数据采集         ③ 算法匹配         ④ 算法配置        │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐       │
│  │ 设备注册  │─────→│ 传感器绑定│─────→│ 自动推荐  │─────→│ 参数配置  │       │
│  │ 类型识别  │      │ 数据端点  │      │ 适用算法  │      │ 阈值设定  │       │
│  └──────────┘      └──────────┘      └──────────┘      └──────────┘       │
│       │                  │                  │                  │            │
│       ▼                  ▼                  ▼                  ▼            │
│  ⑤ 算法执行         ⑥ 结果输出         ⑦ 结果回写         ⑧ 闭环反馈       │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐       │
│  │ Pipeline  │─────→│ 诊断结果  │─────→│ 告警生成  │─────→│ 模型迭代  │       │
│  │ 执行引擎  │      │ 异常标记  │      │ 维护工单  │      │ 参数优化  │       │
│  └──────────┘      └──────────┘      └──────────┘      └──────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 各阶段详细逻辑

**阶段 ①②：设备接入 → 数据采集（已有，算法库不需要重复实现）**

设备通过接入层（15 个协议适配器）接入平台后，数据自动流入 `data_endpoints`，并通过 `data_bindings` 绑定到平台内部消费者。算法库在此阶段的角色是**被动接收者**——它不负责采集数据，而是从已有的数据端点读取。

**阶段 ③：算法匹配（算法库核心能力之一）**

当一个新设备/传感器接入平台时，算法库根据以下维度自动推荐适用算法：

| 匹配维度 | 数据来源 | 匹配逻辑 |
|----------|---------|---------|
| 设备类型 | `device-type.registry` 的 `deviceClass` | 振动传感器 → 推荐 FFT/包络分析/轴承故障诊断 |
| 物理量类型 | `asset_sensors.physicalQuantity` | 振动(acceleration) → 信号处理算法；温度(temperature) → 趋势预测算法 |
| 采样率 | `asset_sensors.sampleRate` | 高采样率(>1kHz) → 频域分析；低采样率(<10Hz) → 统计分析 |
| 测量类型 | `asset_measurement_points.measurementType` | 振动 → 频谱分析；温度 → 趋势外推 |
| 行业场景 | 用户配置的场景标签 | 港口起重机 → 钢丝绳检测算法；风电 → 叶片裂纹检测 |

**阶段 ④：算法配置（易用性核心）**

算法配置分三层，用户只需关注第一层，高级用户可深入第二、三层：

| 配置层 | 面向用户 | 内容 | 示例 |
|--------|---------|------|------|
| L1 场景配置 | 所有用户 | 选择场景模板，一键应用 | "轴承故障诊断"模板 → 自动配置 FFT + 包络分析 + SVM 分类 |
| L2 参数配置 | 工程师 | 调整算法参数、阈值、窗口大小 | FFT 窗口 = 4096，重叠率 = 75%，频率范围 = 0-5kHz |
| L3 高级配置 | 算法专家 | 自定义算法代码、模型替换、融合策略 | 上传自定义 ONNX 模型替换内置 SVM |

**阶段 ⑤：算法执行（工程化核心）**

算法执行有三种模式，对应不同的触发场景：

| 执行模式 | 触发方式 | 适用场景 | 平台对接 |
|----------|---------|---------|---------|
| **实时流式** | 数据到达即触发 | 异常检测、阈值监控 | Kafka Consumer → 算法引擎 → 结果写入 |
| **批量定时** | Cron 调度 | 趋势分析、健康评估 | Pipeline 调度器 → 算法引擎 → 报告生成 |
| **手动触发** | 用户点击 | 故障诊断、数据回溯分析 | 前端请求 → tRPC → 算法引擎 → 结果返回 |

**阶段 ⑥⑦⑧：结果输出 → 回写 → 闭环（自动化核心）**

算法执行结果自动回写到平台已有的数据表中，不需要新建独立的结果存储：

| 结果类型 | 回写目标 | 自动动作 |
|----------|---------|---------|
| 异常检测结果 | `anomaly_detections` 表 | 自动创建异常记录，触发告警规则 |
| 诊断结论 | `diagnosis_tasks.result` JSON 字段 | 自动填充诊断结论、置信度、建议 |
| 健康评分 | `device_kpis` 表 | 自动更新设备健康指标 |
| 预测结果 | `realtime_data_latest` 表 | 自动写入预测值供前端展示 |
| 训练产出 | `model_registry` 表 | 自动注册新模型版本 |

---

## 三、算法数据模型设计

### 3.1 核心实体关系

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  AlgorithmDefinition │     │  AlgorithmInstance    │     │  AlgorithmExecution  │
│  (算法定义 = 模板)    │────→│  (算法实例 = 已配置)   │────→│  (算法执行 = 运行记录) │
│                     │  1:N │                      │  1:N │                     │
│  - 算法是什么        │     │  - 绑定到哪个设备/传感器│     │  - 什么时候执行的     │
│  - 输入输出是什么     │     │  - 参数配了什么        │     │  - 结果是什么         │
│  - 适用于什么场景     │     │  - 执行策略是什么      │     │  - 耗时多少           │
└─────────────────────┘     └──────────────────────┘     └─────────────────────┘
         │                           │                           │
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  AlgorithmVersion    │     │  DeviceBinding        │     │  ExecutionMetrics    │
│  (算法版本)          │     │  (设备绑定关系)        │     │  (执行指标)          │
│                     │     │                      │     │                     │
│  - 版本号            │     │  - 设备 nodeId        │     │  - 延迟 / 吞吐       │
│  - 变更日志          │     │  - 传感器 sensorId    │     │  - CPU / 内存占用     │
│  - 兼容性矩阵        │     │  - 测点 mpId          │     │  - 准确率 / 召回率    │
└─────────────────────┘     └──────────────────────┘     └─────────────────────┘
```

### 3.2 AlgorithmDefinition（算法定义）

这是算法库的核心实体，定义一个算法"是什么"。它同时注册到 `algorithm.registry` 和数据库中——注册中心存储元数据供前端快速查询，数据库存储完整配置供执行引擎使用。

```typescript
interface AlgorithmDefinition {
  // ===== 基础标识 =====
  algorithmId: string;          // 全局唯一 ID，如 "sig_fft_v1"
  name: string;                 // 显示名称，如 "快速傅里叶变换 (FFT)"
  description: string;          // 算法描述
  version: string;              // 语义化版本号 "1.2.0"
  
  // ===== 分类体系 =====
  domain: AlgorithmDomain;      // 所属领域
  category: string;             // 细分类别，如 "频域分析"
  tags: string[];               // 标签，如 ["振动", "频谱", "轴承"]
  
  // ===== 设备适用性（拓展性核心） =====
  applicability: {
    deviceClasses: string[];    // 适用设备大类 ["sensor", "actuator"]
    deviceTypes: string[];      // 适用设备类型 ["vibration_sensor", "accelerometer"]
    physicalQuantities: string[]; // 适用物理量 ["acceleration", "velocity", "displacement"]
    sampleRateRange: {          // 适用采样率范围
      min?: number;             // 最低采样率 (Hz)
      max?: number;             // 最高采样率 (Hz)
    };
    measurementTypes: string[]; // 适用测量类型 ["vibration", "temperature"]
    industries: string[];       // 适用行业 ["port", "wind_energy", "manufacturing"]
    scenarios: string[];        // 适用场景 ["bearing_diagnosis", "gear_diagnosis"]
  };
  
  // ===== 输入输出 Schema（工程化核心） =====
  inputSchema: AlgorithmIOField[];   // 输入字段定义
  outputSchema: AlgorithmIOField[];  // 输出字段定义
  
  // ===== 参数配置 Schema =====
  configSchema: AlgorithmConfigField[];  // 可配置参数
  configPresets: Record<string, Record<string, unknown>>;  // 预设参数组合
  
  // ===== 执行约束 =====
  runtime: {
    engine: 'builtin' | 'python' | 'onnx' | 'wasm' | 'triton' | 'custom_http';
    entrypoint?: string;        // Python: 模块路径; ONNX: 模型文件路径; HTTP: 服务地址
    timeout: number;            // 超时时间(ms)
    maxBatchSize: number;       // 最大批处理大小
    computeRequirement: 'cpu' | 'gpu' | 'edge';
    memoryLimitMB: number;      // 内存限制
    dependencies?: string[];    // Python 依赖包
  };
  
  // ===== 商业化属性 =====
  license: 'builtin' | 'community' | 'enterprise' | 'custom';
  author: string;
  organization?: string;
  documentation?: string;       // 文档 URL
  
  // ===== 性能基准（商业化核心） =====
  benchmark?: {
    avgLatencyMs: number;       // 平均延迟
    p99LatencyMs: number;       // P99 延迟
    throughputPerSec: number;   // 吞吐量
    memoryPeakMB: number;       // 峰值内存
    accuracyMetrics?: Record<string, number>;  // 准确率指标
    testedOn?: string;          // 测试环境描述
    testedAt?: string;          // 测试时间
  };
  
  // ===== Pipeline 集成 =====
  pipelineIntegration?: {
    autoRegisterAsNode: boolean;  // 是否自动注册为 Pipeline 节点
    nodeType: 'processor';        // Pipeline 节点类型
    nodeDomain: 'machine_learning' | 'data_engineering';
  };
}
```

### 3.3 AlgorithmIOField（输入输出字段定义）

```typescript
interface AlgorithmIOField {
  name: string;                 // 字段名
  label: string;                // 显示名称
  dataType: 'number' | 'number[]' | 'string' | 'boolean' | 'json' | 'timeseries' | 'spectrum' | 'image' | 'audio';
  required: boolean;
  description?: string;
  unit?: string;                // 物理单位
  shape?: string;               // 数据形状描述，如 "[N]" "[N, 3]" "[H, W, C]"
  constraints?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    allowedValues?: string[];
  };
  // 自动绑定提示：告诉前端这个字段应该从哪里自动获取数据
  autoBindHint?: {
    source: 'sensor_telemetry' | 'measurement_point' | 'device_property' | 'pipeline_output' | 'user_input';
    fieldMapping?: string;      // 如 "asset_sensors.last_value" 或 "telemetry.acceleration"
  };
}
```

### 3.4 AlgorithmConfigField（参数配置字段）

```typescript
interface AlgorithmConfigField {
  name: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'select' | 'range' | 'array' | 'code' | 'model_selector';
  required: boolean;
  default?: unknown;
  description?: string;
  group?: string;               // 参数分组，如 "基础参数" "高级参数"
  level: 'basic' | 'advanced' | 'expert';  // 配置层级（对应 L1/L2/L3）
  options?: Array<{ value: string; label: string; description?: string }>;
  validation?: {
    min?: number;
    max?: number;
    step?: number;
    pattern?: string;
    message?: string;
  };
  // 参数联动：当其他参数变化时，自动调整此参数
  dependsOn?: {
    field: string;
    condition: Record<string, unknown>;
    effect: 'show' | 'hide' | 'setValue' | 'setOptions';
    value?: unknown;
  };
  // 自动推荐：根据设备/数据特征自动推荐值
  autoRecommend?: {
    strategy: 'from_sample_rate' | 'from_data_range' | 'from_device_type' | 'from_history';
    formula?: string;           // 如 "sampleRate / 2" (奈奎斯特频率)
  };
}
```

### 3.5 AlgorithmInstance（算法实例 — 已绑定设备的算法配置）

```typescript
interface AlgorithmInstance {
  instanceId: string;           // 实例 ID
  algorithmId: string;          // 引用的算法定义 ID
  algorithmVersion: string;     // 使用的算法版本
  name: string;                 // 实例名称，如 "1号泵站轴承诊断"
  
  // ===== 设备绑定（拓展性核心） =====
  bindings: DeviceBinding[];    // 绑定的设备/传感器列表
  
  // ===== 参数配置 =====
  config: Record<string, unknown>;  // 用户配置的参数值
  configPreset?: string;        // 使用的预设名称
  
  // ===== 执行策略 =====
  executionPolicy: {
    mode: 'realtime' | 'scheduled' | 'manual' | 'event_triggered';
    schedule?: string;          // Cron 表达式（scheduled 模式）
    eventTrigger?: {            // 事件触发条件（event_triggered 模式）
      eventType: string;
      condition?: Record<string, unknown>;
    };
    retryPolicy: {
      maxRetries: number;
      retryDelayMs: number;
      backoffMultiplier: number;
    };
  };
  
  // ===== 输出路由（自动化核心） =====
  outputRouting: {
    writeToAnomalyDetection: boolean;   // 写入异常检测表
    writeToDeviceKpi: boolean;          // 写入设备 KPI
    writeToRealtimeData: boolean;       // 写入实时数据
    triggerAlert: boolean;              // 触发告警
    triggerDiagnosisTask: boolean;      // 触发诊断任务
    customTargets?: Array<{             // 自定义输出目标
      targetType: 'kafka' | 'http' | 'database' | 'pipeline';
      targetConfig: Record<string, unknown>;
    }>;
  };
  
  // ===== 状态 =====
  status: 'draft' | 'active' | 'paused' | 'error' | 'archived';
  lastExecutionAt?: string;
  lastExecutionStatus?: 'success' | 'failed' | 'timeout';
  executionCount: number;
  errorCount: number;
  
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
```

### 3.6 DeviceBinding（设备绑定关系）

```typescript
interface DeviceBinding {
  bindingId: string;
  
  // 绑定目标（三选一或组合）
  nodeId?: string;              // 资产节点 ID (asset_nodes)
  mpId?: string;                // 测点 ID (asset_measurement_points)
  sensorId?: string;            // 传感器 ID (asset_sensors)
  
  // 数据源映射
  inputMapping: Array<{
    algorithmInput: string;     // 算法输入字段名
    dataSource: {
      type: 'sensor_realtime' | 'sensor_history' | 'device_property' | 'constant' | 'expression';
      sensorId?: string;        // 传感器 ID
      field?: string;           // 字段名
      timeRange?: {             // 历史数据时间范围
        duration: string;       // 如 "1h" "24h" "7d"
        endAt?: 'now' | string;
      };
      value?: unknown;          // 常量值
      expression?: string;      // 计算表达式
    };
  }>;
  
  // 输出映射
  outputMapping: Array<{
    algorithmOutput: string;    // 算法输出字段名
    target: {
      type: 'sensor_kpi' | 'device_kpi' | 'anomaly_detection' | 'custom';
      targetField?: string;
    };
  }>;
}
```

---

## 四、算法分类体系（面向工业 SHM 场景，可扩展）

### 4.1 领域分类

```typescript
type AlgorithmDomain = 
  | 'signal_processing'      // 信号处理
  | 'feature_engineering'     // 特征工程
  | 'machine_learning'        // 机器学习
  | 'deep_learning'           // 深度学习
  | 'anomaly_detection'       // 异常检测
  | 'predictive_maintenance'  // 预测性维护
  | 'optimization'            // 优化算法
  | 'statistics'              // 统计分析
  | 'custom';                 // 自定义
```

### 4.2 内置算法清单（首批 30+ 算法）

| 领域 | 算法 ID | 名称 | 适用设备 | 适用物理量 | 执行引擎 |
|------|---------|------|---------|-----------|---------|
| **信号处理** | `sig_fft` | 快速傅里叶变换 | 振动传感器 | acceleration, velocity | builtin |
| | `sig_stft` | 短时傅里叶变换 | 振动传感器 | acceleration | builtin |
| | `sig_cwt` | 连续小波变换 | 振动传感器 | acceleration | python |
| | `sig_envelope` | 包络分析 | 振动传感器 | acceleration | builtin |
| | `sig_bandpass` | 带通滤波 | 所有传感器 | * | builtin |
| | `sig_denoise` | 信号去噪 | 所有传感器 | * | builtin |
| | `sig_resample` | 重采样 | 所有传感器 | * | builtin |
| **特征工程** | `feat_time_domain` | 时域特征提取 | 振动传感器 | acceleration, velocity | builtin |
| | `feat_freq_domain` | 频域特征提取 | 振动传感器 | acceleration | builtin |
| | `feat_time_freq` | 时频特征提取 | 振动传感器 | acceleration | python |
| | `feat_statistical` | 统计特征 | 所有传感器 | * | builtin |
| | `feat_normalize` | 特征归一化 | - | - | builtin |
| | `feat_pca` | 主成分分析 | - | - | builtin |
| **机器学习** | `ml_svm` | 支持向量机 | - | - | python |
| | `ml_random_forest` | 随机森林 | - | - | python |
| | `ml_xgboost` | XGBoost | - | - | python |
| | `ml_kmeans` | K-Means 聚类 | - | - | builtin |
| | `ml_dbscan` | DBSCAN 聚类 | - | - | python |
| **深度学习** | `dl_cnn1d` | 一维卷积网络 | 振动传感器 | acceleration | onnx |
| | `dl_lstm` | LSTM 时序网络 | 所有传感器 | * | onnx |
| | `dl_transformer` | Transformer | 所有传感器 | * | onnx |
| | `dl_autoencoder` | 自编码器 | 所有传感器 | * | onnx |
| **异常检测** | `ad_zscore` | Z-Score 检测 | 所有传感器 | * | builtin |
| | `ad_iqr` | IQR 四分位距 | 所有传感器 | * | builtin |
| | `ad_isolation_forest` | 孤立森林 | 所有传感器 | * | python |
| | `ad_lof` | 局部离群因子 | 所有传感器 | * | python |
| | `ad_moving_avg` | 移动平均偏差 | 所有传感器 | * | builtin |
| **预测性维护** | `pm_rul_estimation` | 剩余寿命估计 | 旋转设备 | acceleration, temperature | onnx |
| | `pm_degradation_trend` | 退化趋势分析 | 所有设备 | * | builtin |
| | `pm_health_index` | 健康指数计算 | 所有设备 | * | builtin |
| **优化** | `opt_bayesian` | 贝叶斯优化 | - | - | python |
| | `opt_grid_search` | 网格搜索 | - | - | builtin |

---

## 五、API 设计（tRPC 路由）

### 5.1 算法定义管理

```typescript
algorithm.router = {
  // ===== 查询类 =====
  list:             查询算法列表（支持分页、过滤、搜索）
  getById:          获取算法详情
  listByDomain:     按领域查询
  listByCategory:   按分类查询
  search:           全文搜索（名称、描述、标签）
  
  // ===== 推荐类（自动化核心） =====
  recommend:        根据设备/传感器信息推荐适用算法
  getConfigPresets: 获取算法的预设参数组合
  autoConfig:       根据数据特征自动推荐参数值
  
  // ===== 管理类 =====
  create:           创建自定义算法定义
  update:           更新算法定义
  delete:           删除算法定义
  publish:          发布算法新版本
  deprecate:        废弃算法版本
  
  // ===== 测试类 =====
  testRun:          使用样本数据测试算法
  benchmark:        运行性能基准测试
  validate:         验证算法配置有效性
}
```

### 5.2 算法实例管理

```typescript
algorithmInstance.router = {
  // ===== CRUD =====
  list:             查询实例列表（支持按设备、状态过滤）
  getById:          获取实例详情
  create:           创建算法实例（绑定设备 + 配置参数 + 设置执行策略）
  update:           更新实例配置
  delete:           删除实例
  
  // ===== 设备绑定 =====
  bindDevice:       绑定设备/传感器/测点
  unbindDevice:     解绑设备
  listBindings:     查询实例的所有绑定关系
  
  // ===== 执行控制 =====
  activate:         激活实例（开始执行）
  pause:            暂停实例
  resume:           恢复实例
  triggerOnce:      手动触发一次执行
  
  // ===== 监控 =====
  getExecutionHistory: 查询执行历史
  getMetrics:          查询执行指标（延迟、吞吐、错误率）
  getHealthStatus:     查询实例健康状态
}
```

### 5.3 算法执行引擎

```typescript
algorithmEngine.router = {
  // ===== 执行 =====
  execute:          同步执行算法（小数据量，直接返回结果）
  executeAsync:     异步执行算法（大数据量，返回任务 ID）
  executeBatch:     批量执行（多设备同一算法）
  
  // ===== 任务管理 =====
  getTaskStatus:    查询异步任务状态
  cancelTask:       取消正在执行的任务
  listRunningTasks: 查询所有正在执行的任务
  
  // ===== 引擎状态 =====
  getEngineStatus:  查询执行引擎状态（队列长度、工作线程数、资源使用）
  getCapacity:      查询引擎容量（可并发执行数、GPU 可用性）
}
```

### 5.4 API 调用示例

**场景：为 1 号泵站的振动传感器配置轴承故障诊断**

```
Step 1: 查询推荐算法
POST /trpc/algorithm.recommend
{
  "deviceType": "vibration_sensor",
  "physicalQuantity": "acceleration",
  "sampleRate": 25600,
  "scenario": "bearing_diagnosis"
}
→ 返回: [sig_fft, sig_envelope, feat_time_domain, ml_svm, ad_zscore]

Step 2: 创建算法实例
POST /trpc/algorithmInstance.create
{
  "algorithmId": "sig_envelope",
  "name": "1号泵站驱动端轴承包络分析",
  "bindings": [{
    "sensorId": "sensor_pump1_de_vib",
    "inputMapping": [{ "algorithmInput": "signal", "dataSource": { "type": "sensor_realtime", "sensorId": "sensor_pump1_de_vib" } }]
  }],
  "config": { "bandpassLow": 500, "bandpassHigh": 5000, "envelopeMethod": "hilbert" },
  "executionPolicy": { "mode": "scheduled", "schedule": "0 */4 * * *" },
  "outputRouting": { "writeToAnomalyDetection": true, "triggerAlert": true }
}

Step 3: 激活实例
POST /trpc/algorithmInstance.activate
{ "instanceId": "inst_xxx" }

Step 4: 查看执行结果
GET /trpc/algorithmInstance.getExecutionHistory
{ "instanceId": "inst_xxx", "limit": 10 }
```

---

## 六、数据库表设计（新增 4 张表）

### 6.1 algorithm_definitions（算法定义表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint PK | 主键 |
| algorithm_id | varchar(64) UNIQUE | 算法唯一标识 |
| name | varchar(200) | 算法名称 |
| description | text | 算法描述 |
| domain | varchar(32) | 所属领域 |
| category | varchar(64) | 细分类别 |
| tags | json | 标签数组 |
| version | varchar(32) | 当前版本号 |
| applicability | json | 设备适用性配置 |
| input_schema | json | 输入字段定义 |
| output_schema | json | 输出字段定义 |
| config_schema | json | 参数配置定义 |
| config_presets | json | 预设参数组合 |
| runtime | json | 执行约束配置 |
| benchmark | json | 性能基准数据 |
| license | varchar(32) | 许可类型 |
| author | varchar(100) | 作者 |
| documentation_url | varchar(500) | 文档链接 |
| pipeline_integration | json | Pipeline 集成配置 |
| status | varchar(32) | 状态(active/deprecated/draft) |
| is_builtin | tinyint | 是否内置算法 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

### 6.2 algorithm_instances（算法实例表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint PK | 主键 |
| instance_id | varchar(64) UNIQUE | 实例唯一标识 |
| algorithm_id | varchar(64) FK | 引用算法定义 |
| algorithm_version | varchar(32) | 使用的算法版本 |
| name | varchar(200) | 实例名称 |
| config | json | 用户配置的参数 |
| config_preset | varchar(64) | 使用的预设名称 |
| execution_policy | json | 执行策略 |
| output_routing | json | 输出路由配置 |
| status | varchar(32) | 状态 |
| last_execution_at | timestamp | 最后执行时间 |
| last_execution_status | varchar(32) | 最后执行状态 |
| execution_count | int | 累计执行次数 |
| error_count | int | 累计错误次数 |
| created_by | varchar(64) | 创建人 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

### 6.3 algorithm_device_bindings（算法-设备绑定表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint PK | 主键 |
| binding_id | varchar(64) UNIQUE | 绑定唯一标识 |
| instance_id | varchar(64) FK | 引用算法实例 |
| node_id | varchar(64) | 资产节点 ID |
| mp_id | varchar(64) | 测点 ID |
| sensor_id | varchar(64) | 传感器 ID |
| input_mapping | json | 输入映射配置 |
| output_mapping | json | 输出映射配置 |
| status | varchar(32) | 绑定状态 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

### 6.4 algorithm_executions（算法执行记录表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint PK | 主键 |
| execution_id | varchar(64) UNIQUE | 执行唯一标识 |
| instance_id | varchar(64) FK | 引用算法实例 |
| trigger_type | varchar(32) | 触发方式(scheduled/manual/event/realtime) |
| input_summary | json | 输入数据摘要 |
| output_result | json | 输出结果 |
| status | varchar(32) | 执行状态 |
| error_message | text | 错误信息 |
| started_at | timestamp | 开始时间 |
| completed_at | timestamp | 完成时间 |
| duration_ms | int | 执行耗时 |
| cpu_usage_percent | double | CPU 使用率 |
| memory_usage_mb | double | 内存使用量 |
| created_at | timestamp | 创建时间 |

---

## 七、与现有模块的集成接口

### 7.1 与 Pipeline 编排器集成

算法定义中 `pipelineIntegration.autoRegisterAsNode = true` 的算法，会自动注册为 Pipeline 可用节点。注册逻辑：

```typescript
// 算法注册中心监听 register 事件，自动同步到 Pipeline 节点注册中心
algorithmRegistry.on((event, item) => {
  if (event === 'register' && item.pipelineIntegration?.autoRegisterAsNode) {
    pipelineNodeRegistry.register({
      type: `algo_${item.algorithmId}`,
      nodeType: 'processor',
      domain: item.pipelineIntegration.nodeDomain,
      name: item.name,
      description: item.description,
      icon: domainIconMap[item.domain],
      configFields: item.configSchema.map(convertToConfigFieldSchema),
    });
  }
});
```

### 7.2 与模型中心集成

深度学习算法执行后产出的模型，自动注册到 `model_registry` 表：

```typescript
// 算法执行引擎在 DL 算法训练完成后自动注册模型
if (algorithm.domain === 'deep_learning' && execution.status === 'success') {
  await modelRegistryService.register({
    modelCode: `algo_${algorithm.algorithmId}_${Date.now()}`,
    modelName: `${algorithm.name} - 自动训练`,
    modelType: inferModelType(algorithm),
    framework: algorithm.runtime.engine,
    version: '1.0.0',
    modelFileUrl: execution.outputResult.modelPath,
    metrics: execution.outputResult.metrics,
  });
}
```

### 7.3 与异常检测表集成

异常检测算法执行结果自动写入 `anomaly_detections` 表：

```typescript
// 当 outputRouting.writeToAnomalyDetection = true 时
if (instance.outputRouting.writeToAnomalyDetection && result.isAnomaly) {
  await anomalyDetectionService.create({
    sensorId: binding.sensorId,
    nodeId: binding.nodeId,
    algorithmType: algorithm.algorithmId,  // 扩展 anomaly_detections.algorithmType 枚举
    score: result.anomalyScore,
    severity: inferSeverity(result.anomalyScore),
    currentValue: result.currentValue,
    expectedValue: result.expectedValue,
    deviation: result.deviation,
  });
}
```

### 7.4 与设备类型注册中心集成

设备类型注册中心的 `deviceClass` 和 `supportedProtocols` 用于算法推荐：

```typescript
// algorithm.recommend API 的核心逻辑
function recommendAlgorithms(deviceInfo: { deviceType: string; physicalQuantity: string; sampleRate: number }) {
  const deviceTypeMeta = deviceTypeRegistry.get(deviceInfo.deviceType);
  return algorithmRegistry.listItems().filter(algo => {
    const app = algo.applicability;
    return (
      (!app.deviceClasses.length || app.deviceClasses.includes(deviceTypeMeta.deviceClass)) &&
      (!app.physicalQuantities.length || app.physicalQuantities.includes(deviceInfo.physicalQuantity)) &&
      (!app.sampleRateRange.min || deviceInfo.sampleRate >= app.sampleRateRange.min) &&
      (!app.sampleRateRange.max || deviceInfo.sampleRate <= app.sampleRateRange.max)
    );
  });
}
```

---

## 八、拓展性设计要点

### 8.1 新设备类型接入

当平台新增一种设备类型时，算法库的适配路径：

1. 在 `device-type.registry` 注册新设备类型（已有机制）
2. 在算法定义的 `applicability.deviceTypes` 中添加新设备类型 ID
3. 算法推荐 API 自动包含新设备类型 → **无需修改算法代码**

### 8.2 新算法接入

通过 `algorithm.create` API 或注册中心的 `register()` 方法添加新算法：

1. **内置算法**：在 `algorithm.registry.ts` 的 `BUILTIN_ALGORITHMS` 数组中添加
2. **Python 算法**：上传 Python 脚本 + 定义 inputSchema/outputSchema/configSchema
3. **ONNX 模型**：上传 .onnx 文件 + 定义输入输出 Schema
4. **HTTP 服务**：配置服务地址 + 定义输入输出 Schema
5. **插件算法**：通过插件引擎动态注册

### 8.3 新场景扩展

场景模板（`configPresets`）支持用户自定义：

```typescript
// 用户可以创建自己的场景模板
{
  "bearing_diagnosis_pump": {
    "bandpassLow": 500,
    "bandpassHigh": 5000,
    "envelopeMethod": "hilbert",
    "faultFrequencies": { "BPFO": 5.12, "BPFI": 7.88, "BSF": 3.24, "FTF": 0.39 }
  },
  "gear_diagnosis_reducer": {
    "bandpassLow": 100,
    "bandpassHigh": 3000,
    "meshFrequency": 1200,
    "harmonics": 5
  }
}
```

---

## 九、后端文件结构

```
server/
├── core/registries/
│   ├── algorithm.registry.ts           ← 算法类型注册中心（元数据 + 内置算法定义）
│   └── index.ts                        ← 添加 algorithmRegistry 注册
├── api/
│   ├── algorithm.router.ts             ← 算法定义 + 实例 + 执行引擎的 tRPC 路由
│   └── ...
├── services/
│   └── algorithm/
│       ├── algorithm.service.ts        ← 算法定义 CRUD + 推荐引擎
│       ├── algorithmInstance.service.ts ← 算法实例 CRUD + 设备绑定
│       ├── algorithmEngine.service.ts  ← 执行引擎（调度 + 执行 + 结果回写）
│       ├── algorithmBenchmark.service.ts ← 性能基准测试
│       └── builtins/                   ← 内置算法实现
│           ├── signal/                 ← 信号处理算法
│           ├── feature/               ← 特征工程算法
│           ├── ml/                    ← 机器学习算法
│           ├── anomaly/               ← 异常检测算法
│           └── predictive/            ← 预测性维护算法
drizzle/
└── schema.ts                           ← 添加 4 张新表
```
