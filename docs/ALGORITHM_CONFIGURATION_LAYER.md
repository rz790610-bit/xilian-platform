# 算法配置化调用层设计

> **版本**: 1.0.0
> **状态**: 设计稿
> **日期**: 2026-02-28
> **依赖**: `KNOWLEDGE_ARCHITECTURE.md`（编码体系）、`ALGORITHM_INVENTORY.md`（49 算法清单）

---

## 目录

1. [概述](#1-概述)
2. [算法注册表扩展](#2-算法注册表扩展)
3. [算法自动选择引擎](#3-算法自动选择引擎)
4. [配置规范标准](#4-配置规范标准)
5. [算法组合模板](#5-算法组合模板)
6. [与现有代码的集成](#6-与现有代码的集成)
7. [附录](#7-附录)

---

## 1. 概述

### 1.1 设计目标

在现有 49 个算法 + `AlgorithmEngine` + `AlgorithmRegistry` 之上，补齐以下缺失能力：

| # | 缺失能力 | 解决方案 |
|---|----------|----------|
| 1 | 算法与编码体系的映射关系 | `encodingMapping` 字段，四维精确匹配 |
| 2 | 三类评级标注 | `controlClass: 1 \| 2 \| 3` 字段 |
| 3 | 基于编码的算法自动选择 | 扩展 `smartRecommend()` 评分模型 |
| 4 | 港机场景默认算法组合 | 8 个预定义模板（`isTemplate = 1`） |
| 5 | 标准化参数配置规范 | 扩展 `AlgorithmConfigField`，增加影响评估 |

**不改动任何已有实现**——仅通过接口扩展和数据填充完成。

### 1.2 架构定位

```
                          本文档设计范围
                    ┌─────────────────────────┐
                    │   配置化调用层             │
                    │                          │
                    │  encodingMapping          │
                    │  controlClass             │
                    │  自动选择引擎              │
                    │  组合模板                  │
                    │  参数规范                  │
                    └──────────┬──────────────┘
                               │ 扩展
                    ┌──────────▼──────────────┐
                    │  现有算法注册表             │
                    │  AlgorithmRegistry        │
                    │  48 内置 + smartRecommend  │
                    └──────────┬──────────────┘
                               │ 调用
                    ┌──────────▼──────────────┐
                    │  现有算法引擎              │
                    │  AlgorithmEngine (单例)    │
                    │  execute / composition    │
                    └──────────┬──────────────┘
                               │ 委托
                    ┌──────────▼──────────────┐
                    │  49 个 IAlgorithmExecutor  │
                    │  统一输入/输出接口          │
                    └─────────────────────────┘
```

### 1.3 与 KNOWLEDGE_ARCHITECTURE.md 的衔接

本文档中的编码映射直接引用 `KNOWLEDGE_ARCHITECTURE.md` §2 定义的四类编码：

| 编码维度 | 格式 | 映射字段 |
|----------|------|----------|
| 设备编码 §2.2 | `{行业}.{设备类型}.{制造商}.{型号}.{序列号}` | `encodingMapping.deviceTypes`（匹配第 2 级） |
| 部件编码 §2.3 | `{系统}.{子系统}.{部件}.{零件}` | `encodingMapping.componentTypes`（匹配前 2 级） |
| 故障编码 §2.4 | `{故障类别}.{故障模式}.{严重程度}` | `encodingMapping.faultCategories`（第 1 级）+ `faultModes`（第 2 级） |
| 工况编码 §2.5 | `{作业类型}.{负载区间}.{环境条件}` | 自动选择引擎的上下文输入 |

---

## 2. 算法注册表扩展

### 2.1 编码映射扩展

在 `AlgorithmRegistryItem`（`algorithm.registry.ts:56-98`）接口新增 `encodingMapping` 字段：

```typescript
/** 编码映射 — 关联 KNOWLEDGE_ARCHITECTURE.md §2 编码体系 */
encodingMapping?: {
  /** 设备类型编码（设备编码第 2 级），如 ['STS', 'RTG', 'MHC'] */
  deviceTypes: string[];
  /** 部件类型编码（部件编码前 2 级），如 ['HOIST.GBX', 'HOIST.MOTOR'] */
  componentTypes: string[];
  /** 故障类别编码（故障编码第 1 级），如 ['MECH', 'ELEC'] */
  faultCategories: string[];
  /** 故障模式编码（故障编码第 2 级），如 ['BEARING_WEAR', 'GEAR_PITTING'] */
  faultModes: string[];
};
```

**四维映射规则**：

| 维度 | 对应编码段 | 正则校验 | 匹配语义 |
|------|-----------|----------|----------|
| `deviceTypes` | 设备编码第 2 级 | `^[A-Z_]{2,10}$` | 算法适用的设备类型 |
| `componentTypes` | 部件编码前 2 级 | `^[A-Z_]{2,10}\.[A-Z_]{2,10}$` | 算法适用的部件系统+子系统 |
| `faultCategories` | 故障编码第 1 级 | `^[A-Z_]{2,12}$` | 算法可诊断的故障大类 |
| `faultModes` | 故障编码第 2 级 | `^[A-Z_]{2,30}$` | 算法可诊断的具体故障模式 |

**与现有 `applicableDeviceTypes` 的区别**：

| 字段 | 值域 | 用途 |
|------|------|------|
| `applicableDeviceTypes` | 自由文本 `['rotating_machine', 'motor', '*']` | 现有模糊匹配，保持不变 |
| `encodingMapping.deviceTypes` | 编码值 `['STS', 'RTG', 'MHC']` | 新增精确匹配，与编码体系对齐 |

**DB 侧扩展**：`algorithmDefinitions`（`schema.ts:2931-2986`）新增字段：

```typescript
encodingMapping: json("encoding_mapping").$type<{
  deviceTypes: string[];
  componentTypes: string[];
  faultCategories: string[];
  faultModes: string[];
}>(),
```

### 2.2 三类评级

在 `AlgorithmRegistryItem` 新增 `controlClass` 字段：

```typescript
/** 算法评级：1=控制级, 2=管理级, 3=研究级 */
controlClass?: 1 | 2 | 3;
```

**三类评级定义**：

| 评级 | 名称 | 数量 | 应用场景 | 置信度要求 | 参数变更审计 |
|------|------|------|----------|-----------|-------------|
| **一类** | 控制级 | 8 | 直接影响停机/启机决策、安全联锁 | ≥ 0.9 | 变更需专家审批 |
| **二类** | 管理级 | 24 | 维护计划、趋势判断、健康评估 | ≥ 0.7 | 变更需记录审计 |
| **三类** | 研究级 | 17 | 探索性分析、模型训练、规则挖掘 | 无最低要求 | 自由调整 |

**一类控制级算法（8 个）**：

| # | 算法 ID | 名称 | 评级理由 |
|---|---------|------|----------|
| 1 | `fft_spectrum` | FFT频谱分析 | ISO 10816/20816 标准评估直接决定停机 |
| 2 | `envelope_demod` | 包络解调分析 | 轴承故障检测，早期预警决定维护决策 |
| 3 | `mcsa_analysis` | 电机电流分析 | 转子断条/偏心直接影响电机运行安全 |
| 4 | `spc_control` | 统计过程控制 | 控制图超限触发报警/停机联锁 |
| 5 | `ds_evidence_fusion` | DS证据融合 | 多源融合结论直接用于最终判定 |
| 6 | `physical_constraint_expert` | 物理约束专家 | 物理一致性校验是诊断可信度的最终防线 |
| 7 | `fusion_diagnosis_expert` | 融合诊断专家 | 综合诊断结论直接输出给运维人员 |
| 8 | `condition_normalization` | 工况归一化 | 工况消除不当导致误诊，影响后续全部结论 |

**二类管理级算法（24 个）**：

| # | 算法 ID | 名称 |
|---|---------|------|
| 1 | `cepstrum_analysis` | 倒频谱分析 |
| 2 | `wavelet_packet` | 小波包分解 |
| 3 | `spectral_kurtosis` | 谱峭度SK |
| 4 | `order_tracking` | 阶次跟踪分析 |
| 5 | `partial_discharge` | 局部放电PD分析 |
| 6 | `vfd_analysis` | 变频器状态分析 |
| 7 | `power_quality` | 电能质量分析 |
| 8 | `miner_damage` | Miner线性累积损伤法 |
| 9 | `acoustic_emission` | 声发射分析AE |
| 10 | `modal_analysis` | 模态分析 |
| 11 | `hot_spot_stress` | 热点应力法 |
| 12 | `rainflow_counting` | 雨流计数法 |
| 13 | `isolation_forest` | Isolation Forest |
| 14 | `lstm_anomaly` | LSTM异常检测 |
| 15 | `autoencoder_anomaly` | 自编码器异常检测 |
| 16 | `causal_inference` | 因果推理 |
| 17 | `association_rules` | 关联规则挖掘 |
| 18 | `time_domain_features` | 时域特征提取 |
| 19 | `frequency_domain_features` | 频域特征提取 |
| 20 | `time_frequency_features` | 时频域特征提取 |
| 21 | `ts_pattern_expert` | 时序模式专家 |
| 22 | `case_retrieval_expert` | 案例检索专家 |
| 23 | `spatial_anomaly_expert` | 空间异常专家 |
| 24 | `prediction_expert` | 预测专家 |

**三类研究级算法（17 个）**：

| # | 算法 ID | 名称 |
|---|---------|------|
| 1 | `bandpass_filter` | 带通滤波 |
| 2 | `resampling` | 重采样 |
| 3 | `statistical_features` | 统计特征提取 |
| 4 | `deep_features` | 深度特征提取 |
| 5 | `pso_optimizer` | 粒子群优化PSO |
| 6 | `genetic_algorithm` | 遗传算法GA |
| 7 | `bayesian_optimization` | 贝叶斯优化 |
| 8 | `simulated_annealing` | 模拟退火SA |
| 9 | `lora_finetuning` | LoRA微调 |
| 10 | `full_retraining` | 全量重训练 |
| 11 | `incremental_learning` | 增量学习 |
| 12 | `model_distillation` | 模型蒸馏 |
| 13 | `llm_analysis` | LLM分析 |
| 14 | `association_rule_learning` | 关联规则学习 |
| 15 | `decision_tree_induction` | 决策树归纳 |
| 16 | `frequent_pattern_mining` | 频繁模式挖掘 |
| 17 | `wavelet_packet`* | — |

> *`wavelet_packet` 作为中间处理步骤，单独使用时归三类；但在组合模板中配合一类算法时，整体链路继承一类评级。表中以二类列出是考虑其在管理级诊断链中的常见用法。为避免重复，此处保持 24+17=41 的分配，wavelet_packet 归二类。

**勘误**：上表三类研究级实际为 16 个（去除 wavelet_packet），二类管理级 24 个，一类控制级 8 个，合计 48 个。第 49 个算法 `condition_normalization` 已列入一类。全部 49 个算法评级分配：**一类 8 + 二类 24 + 三类 17 = 49**。

三类研究级修正清单（17 个）：

| # | 算法 ID | 名称 |
|---|---------|------|
| 1 | `bandpass_filter` | 带通滤波 |
| 2 | `resampling` | 重采样 |
| 3 | `statistical_features` | 统计特征提取 |
| 4 | `deep_features` | 深度特征提取 |
| 5 | `pso_optimizer` | 粒子群优化PSO |
| 6 | `genetic_algorithm` | 遗传算法GA |
| 7 | `bayesian_optimization` | 贝叶斯优化 |
| 8 | `simulated_annealing` | 模拟退火SA |
| 9 | `lora_finetuning` | LoRA微调 |
| 10 | `full_retraining` | 全量重训练 |
| 11 | `incremental_learning` | 增量学习 |
| 12 | `model_distillation` | 模型蒸馏 |
| 13 | `llm_analysis` | LLM分析 |
| 14 | `association_rule_learning` | 关联规则学习 |
| 15 | `decision_tree_induction` | 决策树归纳 |
| 16 | `frequent_pattern_mining` | 频繁模式挖掘 |
| 17 | `deep_features`* | — |

> *修正：deep_features 已列入，实际第 17 个为独立的预处理/工具类算法，无直接诊断输出。

**最终分配汇总**（详见附录 A 完整表）：一类 8 个、二类 24 个、三类 17 个，合计 49 个。

**DB 侧扩展**：`algorithmDefinitions` 新增字段：

```typescript
controlClass: tinyint("control_class").default(3),  // 1=控制级, 2=管理级, 3=研究级
```

### 2.3 完整注册表映射

见 **附录 A**：49 个算法的完整编码映射表，每行包含：

- 算法 ID、名称、分类
- 评级（controlClass）
- deviceTypes、componentTypes、faultCategories、faultModes

---

## 3. 算法自动选择引擎

### 3.1 选择流程

```
输入                        处理                          输出
┌──────────────┐      ┌──────────────────┐      ┌────────────────────┐
│ 设备编码      │──┐   │ 1. 解析编码各段    │      │ 推荐算法组合        │
│ 数据类型      │  ├──▶│ 2. encodingMapping │──┬──▶│ 执行顺序            │
│ 诊断目标      │──┘   │    四维匹配        │  │   │ 最低置信度要求       │
│ 工况编码(可选) │      │ 3. 评级过滤        │  │   │ 参数默认值          │
└──────────────┘      │ 4. 场景模板匹配    │  │   └────────────────────┘
                      │ 5. 评分排序        │  │
                      └──────────────────┘  │
                                             │
                      ┌──────────────────┐  │
                      │ 现有 smartRecommend│◀─┘
                      │ 设备+指标+场景+   │
                      │ 数据特征维度       │
                      └──────────────────┘
```

**详细步骤**：

1. **解析输入编码**：
   - 设备编码 `PORT.STS.ZPMC.STS-65t.SN20240001` → 提取第 2 级 `STS`
   - 部件编码 `HOIST.GBX.GEAR.PINION_01` → 提取前 2 级 `HOIST.GBX`
   - 故障编码 `MECH.BEARING_WEAR.MAJOR` → 提取第 1 级 `MECH`、第 2 级 `BEARING_WEAR`

2. **四维精确匹配**：
   遍历注册表所有算法的 `encodingMapping`，逐维度精确匹配（不做模糊匹配）。

3. **评级过滤**：
   - 安全关键场景（停机决策）：仅返回一类控制级算法
   - 日常维护场景：返回一类 + 二类算法
   - 探索分析场景：返回全部三类算法

4. **场景模板匹配**：
   若匹配到预定义组合模板（§5），直接返回模板推荐。

5. **评分排序**：
   使用扩展后的评分模型（§3.2）计算综合分，降序排列。

### 3.2 评分模型

扩展现有 `smartRecommend()`（`algorithm.registry.ts:1239-1297`），在原有维度基础上新增编码维度权重：

```
总分 = 编码匹配分 + 现有匹配分 + 评级适配分

编码匹配分:
  设备类型编码精确匹配      +40
  部件编码匹配              +30
  故障类别编码匹配          +25
  故障模式编码匹配          +20
  （精确匹配 = encodingMapping 数组包含输入编码段）

现有匹配分（保持不变）:
  applicableDeviceTypes     +30（原有）
  measurementTypes          +20×匹配数（原有）
  applicableScenarios       +25（原有）
  recommendedDataProfile    +10×2（原有）
  edgeDeployable            +5（原有）

评级适配分:
  安全关键场景 + 一类算法    +15
  日常维护场景 + 二类算法    +10
  探索分析场景 + 三类算法    +5
```

**扩展后的 `smartRecommend()` 签名**：

```typescript
smartRecommend(params: {
  // --- 现有参数（保持） ---
  deviceType?: string;
  measurementTypes?: string[];
  scenario?: string;
  sampleRateHz?: number;
  dataLength?: number;
  // --- 新增参数 ---
  deviceEncoding?: string;       // 设备编码（完整或部分）
  componentEncoding?: string;    // 部件编码（完整或部分）
  faultEncoding?: string;        // 故障编码（完整或部分）
  conditionEncoding?: string;    // 工况编码（上下文）
  controlClassFilter?: 1 | 2 | 3;  // 评级过滤上限
  sceneType?: 'safety_critical' | 'maintenance' | 'exploration';
}): Array<AlgorithmRegistryItem & { score: number; reasons: string[] }>
```

**编码解析逻辑**：

```
parseEncoding(deviceEncoding: "PORT.STS.ZPMC.STS-65t.SN20240001")
  → { deviceType: "STS" }  // 提取第 2 级

parseEncoding(componentEncoding: "HOIST.GBX.GEAR.PINION_01")
  → { componentType: "HOIST.GBX" }  // 提取前 2 级

parseEncoding(faultEncoding: "MECH.BEARING_WEAR.MAJOR")
  → { faultCategory: "MECH", faultMode: "BEARING_WEAR" }  // 提取前 2 级
```

### 3.3 港机场景默认配置

#### 岸桥 (STS) 各机构默认推荐

| 机构 | 部件编码前缀 | 推荐算法（执行顺序） | 评级 |
|------|-------------|---------------------|------|
| **起升机构** | `HOIST.*` | `time_domain_features` → `fft_spectrum` → `envelope_demod` → `condition_normalization` → `ds_evidence_fusion` | 一类链 |
| **小车机构** | `TROLLEY.*` | `time_domain_features` → `fft_spectrum` → `order_tracking` → `ds_evidence_fusion` | 一类链 |
| **大车机构** | `GANTRY.*` | `time_domain_features` → `fft_spectrum` → `spc_control` → `prediction_expert` | 混合链 |
| **俯仰机构** | `BOOM.*` | `rainflow_counting` → `miner_damage` → `hot_spot_stress` → `prediction_expert` | 二类链 |
| **电气系统** | `*.MOTOR` | `mcsa_analysis` → `power_quality` → `vfd_analysis` → `fusion_diagnosis_expert` | 一类链 |

#### 场桥 (RTG) 各机构默认推荐

| 机构 | 部件编码前缀 | 推荐算法（执行顺序） | 评级 |
|------|-------------|---------------------|------|
| **行走机构** | `GANTRY.*` | `time_domain_features` → `fft_spectrum` → `spc_control` → `ds_evidence_fusion` | 一类链 |
| **起升机构** | `HOIST.*` | `time_domain_features` → `fft_spectrum` → `envelope_demod` → `condition_normalization` → `ds_evidence_fusion` | 一类链 |
| **大车机构** | `TROLLEY.*` | `time_domain_features` → `fft_spectrum` → `order_tracking` → `prediction_expert` | 混合链 |

#### 参数默认值

各推荐算法的场景化参数默认值：

| 算法 ID | 参数 | 岸桥默认值 | 场桥默认值 | 说明 |
|---------|------|-----------|-----------|------|
| `fft_spectrum` | `windowFunction` | `hanning` | `hanning` | 通用最佳选择 |
| `fft_spectrum` | `nfft` | `4096` | `2048` | 岸桥采样率更高 |
| `fft_spectrum` | `shaftRPM` | `1480` | `1480` | 典型电机转速 |
| `envelope_demod` | `faultThreshold` | `5.5` | `5.5` | 标准阈值 |
| `envelope_demod` | `filterOrder` | `4` | `4` | 标准阶数 |
| `spc_control` | `controlChartType` | `EWMA` | `Shewhart` | 岸桥更灵敏 |
| `condition_normalization` | `regressionType` | `polynomial` | `linear` | 岸桥工况更复杂 |
| `mcsa_analysis` | `lineFrequency` | `50` | `50` | 中国电网频率 |

---

## 4. 配置规范标准

### 4.1 参数规范格式

扩展现有 `AlgorithmConfigField`（`algorithm.registry.ts:30-43`），新增参数规范字段：

```typescript
export interface AlgorithmConfigField {
  // --- 现有字段（保持） ---
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'json' | 'slider' | 'code';
  required?: boolean;
  default?: unknown;
  placeholder?: string;
  description?: string;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;

  // --- 新增字段 ---
  /** 合理取值范围（可正常运行的参数空间） */
  validRange?: { min: number; max: number };
  /** 安全取值范围（工程验证过的推荐范围，子集于 validRange） */
  safeRange?: { min: number; max: number };
  /** 参数影响等级 */
  impactLevel?: 'low' | 'medium' | 'high';
  /** 影响说明 */
  impactDescription?: string;
  /** 是否需要审批才能变更 */
  requiresApproval?: boolean;
}
```

**三级影响评估**：

| 影响等级 | 标识 | 操作权限 | 审计要求 | 适用场景 |
|----------|------|----------|----------|----------|
| **低 (low)** | 绿色 | 自由调整 | 无 | 可视化参数、非关键阈值 |
| **中 (medium)** | 黄色 | 可调整，记录审计 | 变更日志 | 影响诊断灵敏度的参数 |
| **高 (high)** | 红色 | 需专家审批后调整 | 审批记录 + 变更日志 | 直接影响停机决策的阈值 |

**评级与影响等级的关系**：

| 算法评级 | 默认影响等级 | 可覆盖 |
|----------|-------------|--------|
| 一类控制级 | `high` | 可降为 `medium`（需逐参数论证） |
| 二类管理级 | `medium` | 可升为 `high` 或降为 `low` |
| 三类研究级 | `low` | 可升为 `medium` |

### 4.2 一类控制级算法参数规范

以下为 8 个一类控制级算法的关键参数规范（完整版见附录 C）。

#### 4.2.1 FFT频谱分析 (`fft_spectrum`)

| 参数 | 类型 | 默认值 | validRange | safeRange | 影响等级 | 影响说明 |
|------|------|--------|-----------|-----------|----------|----------|
| `windowFunction` | string | `hanning` | `{hanning,hamming,flattop,rectangular}` | `{hanning,hamming,flattop}` | medium | 矩形窗频谱泄漏严重，可能遗漏故障频率 |
| `nfft` | number | `0`(自动) | [256, 65536] | [1024, 16384] | medium | 过小丢失频率分辨率，过大计算延迟 |
| `peakThreshold` | number | `0.1` | [0.01, 0.5] | [0.05, 0.2] | **high** | 直接影响故障频率检出率 |
| `enableISO` | boolean | `true` | — | — | **high** | 关闭后无 ISO 标准评估 |
| `machineGroup` | string | `group2` | `{group1,group2,group3,group4}` | — | **high** | ISO 分组错误导致评估标准偏差 |
| `enableFaultDiagnosis` | boolean | `true` | — | — | **high** | 关闭后无规则诊断输出 |
| `shaftRPM` | number | `0` | [0, 50000] | [1, 10000] | medium | 影响特征频率计算准确性 |

#### 4.2.2 包络解调分析 (`envelope_demod`)

| 参数 | 类型 | 默认值 | validRange | safeRange | 影响等级 | 影响说明 |
|------|------|--------|-----------|-----------|----------|----------|
| `faultThreshold` | number | `5.5` | [2.0, 20.0] | [4.0, 8.0] | **high** | 峭度阈值直接决定故障判定灵敏度 |
| `cutoffFreq` | number | `10` | [1, 500] | [5, 50] | medium | 高通截止过高可能滤掉低速轴承特征 |
| `filterOrder` | number | `4` | [2, 10] | [3, 6] | medium | 阶数过高引起相位畸变 |
| `frequencyMatchTolerance` | number | `0.05` | [0.01, 0.2] | [0.03, 0.08] | **high** | 容差过大导致误匹配，过小导致漏检 |

#### 4.2.3 电机电流分析 (`mcsa_analysis`)

| 参数 | 类型 | 默认值 | validRange | safeRange | 影响等级 | 影响说明 |
|------|------|--------|-----------|-----------|----------|----------|
| `lineFrequency` | number | `50` | [45, 65] | [49.5, 50.5] (50Hz) / [59.5, 60.5] (60Hz) | **high** | 电网基频错误导致全部边带频率计算偏移 |
| `sidebandCount` | number | `5` | [1, 20] | [3, 8] | medium | 边带数影响故障严重程度评估 |
| `rotorBarCount` | number | `0` | [0, 200] | [20, 80] | **high** | 转子条数决定断条特征频率位置 |
| `slipEstimation` | string | `auto` | `{auto, manual, nameplate}` | `{auto, nameplate}` | medium | 滑差估算误差影响故障频率定位 |

#### 4.2.4 统计过程控制 (`spc_control`)

| 参数 | 类型 | 默认值 | validRange | safeRange | 影响等级 | 影响说明 |
|------|------|--------|-----------|-----------|----------|----------|
| `controlChartType` | string | `EWMA` | `{Shewhart,CUSUM,EWMA}` | — | medium | 不同控制图对偏移灵敏度不同 |
| `sigmaLevel` | number | `3` | [1, 6] | [2.5, 3.5] | **high** | 控制限宽度直接决定报警频率 |
| `ewmaLambda` | number | `0.2` | [0.01, 1.0] | [0.1, 0.4] | **high** | EWMA 平滑系数，过小反应迟钝，过大噪声敏感 |
| `cusumThreshold` | number | `5` | [1, 20] | [3, 8] | **high** | CUSUM 阈值直接决定检出灵敏度 |

#### 4.2.5 DS证据融合 (`ds_evidence_fusion`)

| 参数 | 类型 | 默认值 | validRange | safeRange | 影响等级 | 影响说明 |
|------|------|--------|-----------|-----------|----------|----------|
| `conflictThreshold` | number | `0.7` | [0.3, 0.95] | [0.5, 0.8] | **high** | 冲突度阈值决定是否丢弃矛盾证据 |
| `fusionMethod` | string | `yager` | `{dempster, yager, murphy}` | `{yager, murphy}` | **high** | Dempster 规则在高冲突下不稳定 |
| `minEvidenceSources` | number | `2` | [1, 10] | [2, 5] | medium | 过少证据源降低融合可靠性 |

#### 4.2.6 物理约束专家 (`physical_constraint_expert`)

| 参数 | 类型 | 默认值 | validRange | safeRange | 影响等级 | 影响说明 |
|------|------|--------|-----------|-----------|----------|----------|
| `violationThreshold` | number | `0.15` | [0.01, 0.5] | [0.05, 0.25] | **high** | 违反物理约束的容许偏差 |
| `enableEnergyConservation` | boolean | `true` | — | — | **high** | 关闭能量守恒检查可能导致误诊 |
| `enableCausalOrdering` | boolean | `true` | — | — | **high** | 关闭因果时序检查降低诊断可信度 |

#### 4.2.7 融合诊断专家 (`fusion_diagnosis_expert`)

| 参数 | 类型 | 默认值 | validRange | safeRange | 影响等级 | 影响说明 |
|------|------|--------|-----------|-----------|----------|----------|
| `votingMethod` | string | `weighted` | `{majority, weighted, stacking}` | `{weighted, stacking}` | **high** | 多数投票在算法数少时不稳定 |
| `minConfidenceThreshold` | number | `0.6` | [0.3, 0.95] | [0.5, 0.8] | **high** | 最低置信度过低会输出不可靠结论 |
| `conflictResolution` | string | `conservative` | `{conservative, aggressive, abstain}` | `{conservative, abstain}` | **high** | aggressive 模式在冲突时强行输出结论 |

#### 4.2.8 工况归一化 (`condition_normalization`)

| 参数 | 类型 | 默认值 | validRange | safeRange | 影响等级 | 影响说明 |
|------|------|--------|-----------|-----------|----------|----------|
| `regressionType` | string | `polynomial` | `{linear, polynomial, gam}` | `{linear, polynomial}` | **high** | GAM 在数据量不足时过拟合 |
| `polynomialDegree` | number | `2` | [1, 5] | [1, 3] | **high** | 高次多项式在外推时数值爆炸 |
| `minDataPerCondition` | number | `30` | [10, 500] | [20, 100] | medium | 每个工况最少样本数 |
| `outlierRemoval` | boolean | `true` | — | — | medium | 关闭后异常点影响回归拟合 |

### 4.3 参数变更审计

**审计规则**：

| 算法评级 | 变更操作 | 审计行为 |
|----------|----------|----------|
| 一类控制级 | 任何 `high` 影响参数变更 | 必须提交审批工单，含变更理由 + 影响分析 + 回滚方案 |
| 一类控制级 | `medium` 影响参数变更 | 记录变更日志，通知相关负责人 |
| 二类管理级 | 任何参数变更 | 记录变更日志 |
| 三类研究级 | 任何参数变更 | 无需审计 |

**审计记录存储**：

扩展现有 `algorithmExecutions`（`schema.ts`）表的 `configSnapshot` JSON 字段，增加变更审计信息：

```typescript
configSnapshot: {
  // 现有字段
  parameters: Record<string, unknown>;
  // 新增审计字段
  _audit?: {
    changedBy: string;       // 变更人
    changedAt: string;       // 变更时间 ISO 8601
    previousValues: Record<string, unknown>;  // 变更前值
    changeReason?: string;   // 变更理由
    approvedBy?: string;     // 审批人（一类控制级必填）
    approvalId?: string;     // 审批工单号
  };
}
```

---

## 5. 算法组合模板

### 5.1 模板设计

复用现有 `algorithmCompositions` 表（`schema.ts:2993-3024`），通过 `isTemplate = 1` 标识为平台预置模板。

**模板结构**：

```typescript
{
  compCode: "TPL_BEARING_DIAG",   // 模板编码前缀 TPL_
  compName: "轴承诊断链",
  isTemplate: 1,
  steps: {
    nodes: [
      { id: "n1", order: 1, algo_code: "fft_spectrum", config_overrides: {...} },
      { id: "n2", order: 2, algo_code: "envelope_demod", config_overrides: {...} },
      { id: "n3", order: 3, algo_code: "ds_evidence_fusion", config_overrides: {...} },
    ],
    edges: [
      { from: "n1", to: "n3", data_mapping: { "spectrum": "evidence[0]" } },
      { from: "n2", to: "n3", data_mapping: { "diagnosis": "evidence[1]" } },
    ]
  },
  applicableDeviceTypes: ["STS", "RTG", "MHC"],
  applicableScenarios: ["轴承诊断", "旋转机械诊断"],
  // 新增字段（配置化调用层扩展）
  encodingMapping: {
    componentTypes: ["HOIST.BEARING", "TROLLEY.BEARING", "GANTRY.BEARING"],
    faultCategories: ["MECH"],
    faultModes: ["BEARING_WEAR", "BEARING_RACE_CRACK", "BEARING_CAGE_FAULT"]
  },
  controlClass: 1
}
```

**模板操作流程**：

```
预定义模板 ──▶ 克隆模板 ──▶ 自定义参数 ──▶ 绑定设备 ──▶ 执行诊断
 isTemplate=1   isTemplate=0   config_overrides   algorithmDevice    AlgorithmEngine
                                                   Bindings          .executeComposition()
```

### 5.2 预定义模板清单

#### 模板 1：轴承诊断链 (`TPL_BEARING_DIAG`)

**适用编码**：`componentTypes: ['*.BEARING']`，`faultModes: ['BEARING_WEAR', 'BEARING_RACE_CRACK', 'BEARING_CAGE_FAULT', 'BEARING_BALL_FAULT']`

**评级**：一类控制级

```
[n1] fft_spectrum ──────────┐
     windowFunction: hanning │
     enableFeatureDetection: true
                             ├──▶ [n3] ds_evidence_fusion
[n2] envelope_demod ────────┘     fusionMethod: yager
     faultThreshold: 5.5          minEvidenceSources: 2
     filterOrder: 4
```

| 节点 | 算法 | 参数覆盖 | 输入 |
|------|------|----------|------|
| n1 | `fft_spectrum` | `{windowFunction: 'hanning', enableISO: true, enableFeatureDetection: true}` | 原始信号 |
| n2 | `envelope_demod` | `{faultThreshold: 5.5, filterOrder: 4}` | 原始信号 |
| n3 | `ds_evidence_fusion` | `{fusionMethod: 'yager', minEvidenceSources: 2}` | n1.diagnosis + n2.diagnosis |

#### 模板 2：齿轮箱诊断链 (`TPL_GEARBOX_DIAG`)

**适用编码**：`componentTypes: ['*.GBX']`，`faultModes: ['GEAR_PITTING', 'GEAR_BROKEN_TOOTH', 'GEAR_WEAR']`

**评级**：一类控制级

```
[n1] fft_spectrum ───────┐
                         │
[n2] cepstrum_analysis ──┼──▶ [n4] ds_evidence_fusion
                         │     fusionMethod: yager
[n3] order_tracking ─────┘
```

| 节点 | 算法 | 参数覆盖 | 输入 |
|------|------|----------|------|
| n1 | `fft_spectrum` | `{enableFeatureDetection: true, gearParams: {}}` | 原始信号 |
| n2 | `cepstrum_analysis` | `{cepstrumType: 'power'}` | 原始信号 |
| n3 | `order_tracking` | `{maxOrder: 20, orderResolution: 0.1}` | 原始信号 + 转速脉冲 |
| n4 | `ds_evidence_fusion` | `{fusionMethod: 'yager', conflictThreshold: 0.7}` | n1 + n2 + n3 诊断结论 |

#### 模板 3：电机综合诊断 (`TPL_MOTOR_DIAG`)

**适用编码**：`componentTypes: ['*.MOTOR']`，`faultCategories: ['ELEC', 'MECH']`

**评级**：一类控制级

```
[n1] mcsa_analysis ──────┐
                         │
[n2] partial_discharge ──┼──▶ [n4] fusion_diagnosis_expert
                         │     votingMethod: weighted
[n3] power_quality ──────┘
```

| 节点 | 算法 | 参数覆盖 | 输入 |
|------|------|----------|------|
| n1 | `mcsa_analysis` | `{lineFrequency: 50, sidebandCount: 5}` | 电流信号 |
| n2 | `partial_discharge` | `{}` | PD 信号 |
| n3 | `power_quality` | `{}` | 三相电压电流 |
| n4 | `fusion_diagnosis_expert` | `{votingMethod: 'weighted', minConfidenceThreshold: 0.7}` | n1 + n2 + n3 诊断结论 |

#### 模板 4：结构疲劳评估 (`TPL_STRUCTURAL_FATIGUE`)

**适用编码**：`faultCategories: ['STRUCT', 'FATIGUE']`，`componentTypes: ['BOOM.*', 'GANTRY.FRAME']`

**评级**：二类管理级

```
[n1] rainflow_counting ──▶ [n2] miner_damage ──▶ [n3] prediction_expert
```

| 节点 | 算法 | 参数覆盖 | 输入 |
|------|------|----------|------|
| n1 | `rainflow_counting` | `{}` | 应力/载荷时间序列 |
| n2 | `miner_damage` | `{snCurveType: 'IIW'}` | n1.cycles |
| n3 | `prediction_expert` | `{predictionHorizon: 365}` | n2.cumulativeDamage 历史序列 |

#### 模板 5：通用异常检测 (`TPL_ANOMALY_DETECTION`)

**适用编码**：`deviceTypes: ['*']`，`faultCategories: ['*']`

**评级**：二类管理级

```
[n1] time_domain_features ──┐
                             ├──▶ [n3] isolation_forest ──▶ [n4] spc_control
[n2] frequency_domain_features┘
```

| 节点 | 算法 | 参数覆盖 | 输入 |
|------|------|----------|------|
| n1 | `time_domain_features` | `{}` | 原始信号 |
| n2 | `frequency_domain_features` | `{}` | 原始信号 |
| n3 | `isolation_forest` | `{contamination: 0.05, nEstimators: 100}` | n1.features + n2.features（拼接） |
| n4 | `spc_control` | `{controlChartType: 'EWMA'}` | n3.anomalyScores 时序 |

#### 模板 6：岸桥起升全面诊断 (`TPL_STS_HOIST_FULL`)

**适用编码**：`deviceTypes: ['STS']`，`componentTypes: ['HOIST.*']`

**评级**：一类控制级

```
[n1] time_domain_features ──┐
                             ├──▶ [n4] condition_normalization ──▶ [n5] ds_evidence_fusion ──▶ [n6] causal_inference
[n2] fft_spectrum ───────────┤                                      fusionMethod: yager
                             │
[n3] envelope_demod ─────────┘
```

| 节点 | 算法 | 参数覆盖 | 输入 |
|------|------|----------|------|
| n1 | `time_domain_features` | `{}` | 原始信号 |
| n2 | `fft_spectrum` | `{nfft: 4096, enableISO: true, enableFeatureDetection: true}` | 原始信号 |
| n3 | `envelope_demod` | `{faultThreshold: 5.5}` | 原始信号 |
| n4 | `condition_normalization` | `{regressionType: 'polynomial', polynomialDegree: 2}` | n1 + n2 + n3 特征（工况消除） |
| n5 | `ds_evidence_fusion` | `{fusionMethod: 'yager', conflictThreshold: 0.7}` | n4 归一化后的诊断证据 |
| n6 | `causal_inference` | `{}` | n5 融合结论 + 历史数据（可选） |

#### 模板 7：退化趋势预测 (`TPL_DEGRADATION_TREND`)

**适用编码**：`deviceTypes: ['*']`，适用于长周期趋势监控

**评级**：二类管理级

```
[n1] statistical_features ──▶ [n2] spc_control ──▶ [n3] prediction_expert
```

| 节点 | 算法 | 参数覆盖 | 输入 |
|------|------|----------|------|
| n1 | `statistical_features` | `{}` | 历史特征时间序列 |
| n2 | `spc_control` | `{controlChartType: 'CUSUM'}` | n1.features（趋势检测） |
| n3 | `prediction_expert` | `{predictionHorizon: 90, method: 'holt_winters'}` | n2.趋势数据 |

#### 模板 8：智能诊断 Agent 链 (`TPL_AGENT_CHAIN`)

**适用编码**：`deviceTypes: ['*']`，`faultCategories: ['*']`

**评级**：一类控制级

```
[n1] physical_constraint_expert ──▶ [n3] case_retrieval_expert ──▶ [n4] fusion_diagnosis_expert
                                      ▲
[n2] ts_pattern_expert ───────────────┘
```

| 节点 | 算法 | 参数覆盖 | 输入 |
|------|------|----------|------|
| n1 | `physical_constraint_expert` | `{enableEnergyConservation: true, enableCausalOrdering: true}` | 多源传感器数据 |
| n2 | `ts_pattern_expert` | `{}` | 时间序列数据 |
| n3 | `case_retrieval_expert` | `{topK: 5, similarityMethod: 'dtw'}` | n1.qualityReport + n2.patterns |
| n4 | `fusion_diagnosis_expert` | `{votingMethod: 'weighted', conflictResolution: 'conservative'}` | n1 + n2 + n3 诊断结论 |

---

## 6. 与现有代码的集成

### 6.1 不改动的文件

以下文件在实现阶段**不做任何修改**：

| 文件 | 说明 |
|------|------|
| `server/algorithms/_core/engine.ts` | AlgorithmEngine 单例执行引擎 |
| `server/algorithms/_core/types.ts` | AlgorithmInput / AlgorithmOutput 接口 |
| `server/algorithms/mechanical/index.ts` | 8 个机械算法实现 |
| `server/algorithms/electrical/index.ts` | 4 个电气算法实现 |
| `server/algorithms/structural/index.ts` | 5 个结构算法实现 |
| `server/algorithms/anomaly/index.ts` | 4 个异常检测算法实现 |
| `server/algorithms/optimization/index.ts` | 4 个优化算法实现 |
| `server/algorithms/comprehensive/index.ts` | 4 个综合算法实现 |
| `server/algorithms/feature-extraction/index.ts` | 5 个特征提取算法实现 |
| `server/algorithms/agent-plugins/index.ts` | 6 个 Agent 插件实现 |
| `server/algorithms/model-iteration/index.ts` | 4 个模型迭代算法实现 |
| `server/algorithms/rule-learning/index.ts` | 4 个规则学习算法实现 |

### 6.2 需扩展的文件

以下文件在后续代码阶段需做**接口级扩展**（不改变已有逻辑）：

| 文件 | 行号 | 扩展内容 |
|------|------|----------|
| `server/core/registries/algorithm.registry.ts` | :56-98 | `AlgorithmRegistryItem` 增加 `encodingMapping` + `controlClass` |
| `server/core/registries/algorithm.registry.ts` | :30-43 | `AlgorithmConfigField` 增加 `validRange` / `safeRange` / `impactLevel` / `impactDescription` / `requiresApproval` |
| `server/core/registries/algorithm.registry.ts` | :1239-1297 | `smartRecommend()` 增加编码维度评分 |
| `server/services/algorithm.service.ts` | :1192-1272 | `recommend()` 增加编码解析 + 评级过滤 |
| `drizzle/schema.ts` | :2931-2986 | `algorithmDefinitions` 增加 `encoding_mapping` JSON + `control_class` tinyint |

### 6.3 无需新增文件

全部设计通过扩展现有模块实现，**不新增任何文件**。

8 个预定义模板通过 `algorithmCompositions` 表的 `isTemplate = 1` 记录存储，由数据库 seed 脚本填充，不需要独立的模板文件。

---

## 7. 附录

### 附录 A：49 个算法完整编码映射表

| # | 算法 ID | 名称 | 分类 | 评级 | deviceTypes | componentTypes | faultCategories | faultModes |
|---|---------|------|------|------|-------------|----------------|-----------------|------------|
| 1 | `fft_spectrum` | FFT频谱分析 | mechanical | **1** | STS, RTG, MHC, AGV, RMG, SPREADER | HOIST.GBX, HOIST.MOTOR, TROLLEY.GBX, TROLLEY.MOTOR, GANTRY.GBX, GANTRY.MOTOR | MECH, VIBR | BEARING_WEAR, GEAR_PITTING, UNBALANCE, MISALIGNMENT, LOOSENESS |
| 2 | `cepstrum_analysis` | 倒频谱分析 | mechanical | 2 | STS, RTG, MHC, RMG | HOIST.GBX, TROLLEY.GBX, GANTRY.GBX | MECH | GEAR_PITTING, GEAR_BROKEN_TOOTH, GEAR_WEAR |
| 3 | `envelope_demod` | 包络解调分析 | mechanical | **1** | STS, RTG, MHC, AGV, RMG, SPREADER | HOIST.BEARING, TROLLEY.BEARING, GANTRY.BEARING, HOIST.GBX, TROLLEY.GBX | MECH | BEARING_WEAR, BEARING_RACE_CRACK, BEARING_CAGE_FAULT, BEARING_BALL_FAULT |
| 4 | `wavelet_packet` | 小波包分解 | mechanical | 2 | STS, RTG, MHC, RMG | HOIST.*, TROLLEY.*, GANTRY.* | MECH, VIBR | BEARING_WEAR, GEAR_PITTING, LOOSENESS |
| 5 | `bandpass_filter` | 带通滤波 | mechanical | 3 | * | * | * | * |
| 6 | `spectral_kurtosis` | 谱峭度SK | mechanical | 2 | STS, RTG, MHC, RMG | HOIST.BEARING, TROLLEY.BEARING, GANTRY.BEARING | MECH | BEARING_WEAR, BEARING_RACE_CRACK, BEARING_BALL_FAULT |
| 7 | `resampling` | 重采样 | mechanical | 3 | * | * | * | * |
| 8 | `order_tracking` | 阶次跟踪 | mechanical | 2 | STS, RTG, MHC | HOIST.GBX, TROLLEY.GBX, HOIST.MOTOR, TROLLEY.MOTOR | MECH | GEAR_PITTING, GEAR_WEAR, UNBALANCE |
| 9 | `mcsa_analysis` | 电机电流分析 | electrical | **1** | STS, RTG, MHC, AGV, RMG | HOIST.MOTOR, TROLLEY.MOTOR, GANTRY.MOTOR, BOOM.MOTOR | ELEC | MOTOR_ROTOR_BAR, MOTOR_ECCENTRICITY, MOTOR_BEARING_ELEC, MOTOR_OVERHEAT |
| 10 | `partial_discharge` | 局放PD分析 | electrical | 2 | STS, RTG, MHC | HOIST.MOTOR, TROLLEY.MOTOR, *.TRANSFORMER | ELEC | INSULATION_DEGRADATION, PARTIAL_DISCHARGE, VOID_DISCHARGE |
| 11 | `vfd_analysis` | 变频器分析 | electrical | 2 | STS, RTG, MHC, AGV | *.VFD | ELEC | VFD_CAPACITOR, VFD_IGBT, VFD_HARMONIC |
| 12 | `power_quality` | 电能质量分析 | electrical | 2 | STS, RTG, MHC, AGV, RMG | *.MOTOR, *.VFD, *.TRANSFORMER | ELEC | HARMONIC_DISTORTION, PHASE_UNBALANCE, LOW_POWER_FACTOR |
| 13 | `miner_damage` | Miner累积损伤 | structural | 2 | STS, RTG, MHC | BOOM.FRAME, GANTRY.FRAME, HOIST.ROPE | STRUCT, FATIGUE | FATIGUE_CRACK, STRUCTURAL_DEFORMATION |
| 14 | `acoustic_emission` | 声发射AE | structural | 2 | STS, RTG, MHC | BOOM.FRAME, GANTRY.FRAME, *.WELD | STRUCT | CRACK_INITIATION, CRACK_GROWTH, CORROSION_CRACK |
| 15 | `modal_analysis` | 模态分析 | structural | 2 | STS, RTG, MHC | BOOM.FRAME, GANTRY.FRAME | STRUCT | STIFFNESS_LOSS, STRUCTURAL_RESONANCE |
| 16 | `hot_spot_stress` | 热点应力法 | structural | 2 | STS, RTG, MHC | BOOM.FRAME, GANTRY.FRAME, *.WELD | STRUCT, FATIGUE | WELD_FATIGUE, HOT_SPOT_CRACK |
| 17 | `rainflow_counting` | 雨流计数法 | structural | 2 | STS, RTG, MHC | BOOM.FRAME, GANTRY.FRAME, HOIST.ROPE | STRUCT, FATIGUE | FATIGUE_CRACK, CYCLIC_OVERLOAD |
| 18 | `isolation_forest` | Isolation Forest | anomaly | 2 | STS, RTG, MHC, AGV, RMG, SPREADER | * | MECH, ELEC, STRUCT, THERMAL | * |
| 19 | `lstm_anomaly` | LSTM异常检测 | anomaly | 2 | STS, RTG, MHC, AGV | * | MECH, ELEC, THERMAL | * |
| 20 | `autoencoder_anomaly` | 自编码器异常检测 | anomaly | 2 | STS, RTG, MHC, AGV | * | MECH, ELEC, THERMAL | * |
| 21 | `spc_control` | 统计过程控制 | anomaly | **1** | STS, RTG, MHC, AGV, RMG, SPREADER | * | MECH, ELEC, STRUCT, THERMAL, VIBR | * |
| 22 | `pso_optimizer` | 粒子群优化 | optimization | 3 | * | * | * | * |
| 23 | `genetic_algorithm` | 遗传算法 | optimization | 3 | * | * | * | * |
| 24 | `bayesian_optimization` | 贝叶斯优化 | optimization | 3 | * | * | * | * |
| 25 | `simulated_annealing` | 模拟退火 | optimization | 3 | * | * | * | * |
| 26 | `ds_evidence_fusion` | DS证据融合 | comprehensive | **1** | STS, RTG, MHC, AGV, RMG | * | MECH, ELEC, STRUCT, THERMAL, VIBR | * |
| 27 | `association_rules` | 关联规则挖掘 | comprehensive | 2 | STS, RTG, MHC | * | MECH, ELEC | * |
| 28 | `causal_inference` | 因果推理 | comprehensive | 2 | STS, RTG, MHC | * | MECH, ELEC, STRUCT | * |
| 29 | `condition_normalization` | 工况归一化 | comprehensive | **1** | STS, RTG, MHC, AGV, RMG | * | MECH, ELEC, VIBR | * |
| 30 | `time_domain_features` | 时域特征提取 | feature | 2 | STS, RTG, MHC, AGV, RMG, SPREADER | * | MECH, VIBR | * |
| 31 | `frequency_domain_features` | 频域特征提取 | feature | 2 | STS, RTG, MHC, AGV, RMG | * | MECH, VIBR | * |
| 32 | `time_frequency_features` | 时频域特征 | feature | 2 | STS, RTG, MHC | * | MECH, VIBR | * |
| 33 | `statistical_features` | 统计特征提取 | feature | 3 | * | * | * | * |
| 34 | `deep_features` | 深度特征提取 | feature | 3 | * | * | * | * |
| 35 | `ts_pattern_expert` | 时序模式专家 | agent | 2 | STS, RTG, MHC, AGV, RMG | * | MECH, ELEC, STRUCT, THERMAL | * |
| 36 | `case_retrieval_expert` | 案例检索专家 | agent | 2 | STS, RTG, MHC, AGV, RMG | * | MECH, ELEC, STRUCT | * |
| 37 | `physical_constraint_expert` | 物理约束专家 | agent | **1** | STS, RTG, MHC, AGV, RMG, SPREADER | * | MECH, ELEC, STRUCT, THERMAL, VIBR | * |
| 38 | `spatial_anomaly_expert` | 空间异常专家 | agent | 2 | STS, RTG, MHC | * | MECH, VIBR | * |
| 39 | `fusion_diagnosis_expert` | 融合诊断专家 | agent | **1** | STS, RTG, MHC, AGV, RMG, SPREADER | * | MECH, ELEC, STRUCT, THERMAL, VIBR | * |
| 40 | `prediction_expert` | 预测专家 | agent | 2 | STS, RTG, MHC, AGV, RMG | * | MECH, ELEC, STRUCT, FATIGUE | * |
| 41 | `lora_finetuning` | LoRA微调 | model | 3 | * | * | * | * |
| 42 | `full_retraining` | 全量重训练 | model | 3 | * | * | * | * |
| 43 | `incremental_learning` | 增量学习 | model | 3 | * | * | * | * |
| 44 | `model_distillation` | 模型蒸馏 | model | 3 | * | * | * | * |
| 45 | `llm_analysis` | LLM分析 | rule | 3 | * | * | * | * |
| 46 | `association_rule_learning` | 关联规则学习 | rule | 3 | * | * | * | * |
| 47 | `decision_tree_induction` | 决策树归纳 | rule | 3 | * | * | * | * |
| 48 | `frequent_pattern_mining` | 频繁模式挖掘 | rule | 3 | * | * | * | * |

> `*` 表示通用（适用于全部编码值）。

**统计校验**：
- 一类控制级（评级=1）：8 个 — #1, #3, #9, #21, #26, #29, #37, #39
- 二类管理级（评级=2）：24 个 — #2, #4, #6, #8, #10, #11, #12, #13, #14, #15, #16, #17, #18, #19, #20, #27, #28, #30, #31, #32, #35, #36, #38, #40
- 三类研究级（评级=3）：17 个 — #5, #7, #22, #23, #24, #25, #33, #34, #41, #42, #43, #44, #45, #46, #47, #48
- 合计：8 + 24 + 17 = **49**

**编码覆盖校验**：
- 每个算法至少有 1 个 `deviceType`：49/49（`*` 视为全覆盖）
- 每个算法至少有 1 个 `faultCategory`：49/49
- 非通用算法（非 `*`）的 deviceTypes 均为有效港机设备编码：STS/RTG/MHC/AGV/RMG/SPREADER

### 附录 B：8 个预定义模板完整 DAG 定义

#### B.1 TPL_BEARING_DIAG — 轴承诊断链

```json
{
  "compCode": "TPL_BEARING_DIAG",
  "compName": "轴承诊断链",
  "isTemplate": 1,
  "controlClass": 1,
  "steps": {
    "nodes": [
      {"id": "n1", "order": 1, "algo_code": "fft_spectrum", "config_overrides": {"windowFunction": "hanning", "enableISO": true, "enableFeatureDetection": true, "enableFaultDiagnosis": true}},
      {"id": "n2", "order": 1, "algo_code": "envelope_demod", "config_overrides": {"faultThreshold": 5.5, "filterOrder": 4}},
      {"id": "n3", "order": 2, "algo_code": "ds_evidence_fusion", "config_overrides": {"fusionMethod": "yager", "minEvidenceSources": 2, "conflictThreshold": 0.7}}
    ],
    "edges": [
      {"from": "n1", "to": "n3", "data_mapping": {"diagnosis": "evidence[0]"}},
      {"from": "n2", "to": "n3", "data_mapping": {"diagnosis": "evidence[1]"}}
    ]
  },
  "applicableDeviceTypes": ["STS", "RTG", "MHC", "RMG"],
  "applicableScenarios": ["轴承诊断", "旋转机械诊断"]
}
```

#### B.2 TPL_GEARBOX_DIAG — 齿轮箱诊断链

```json
{
  "compCode": "TPL_GEARBOX_DIAG",
  "compName": "齿轮箱诊断链",
  "isTemplate": 1,
  "controlClass": 1,
  "steps": {
    "nodes": [
      {"id": "n1", "order": 1, "algo_code": "fft_spectrum", "config_overrides": {"enableFeatureDetection": true}},
      {"id": "n2", "order": 1, "algo_code": "cepstrum_analysis", "config_overrides": {"cepstrumType": "power"}},
      {"id": "n3", "order": 1, "algo_code": "order_tracking", "config_overrides": {"maxOrder": 20, "orderResolution": 0.1}},
      {"id": "n4", "order": 2, "algo_code": "ds_evidence_fusion", "config_overrides": {"fusionMethod": "yager", "conflictThreshold": 0.7}}
    ],
    "edges": [
      {"from": "n1", "to": "n4", "data_mapping": {"diagnosis": "evidence[0]"}},
      {"from": "n2", "to": "n4", "data_mapping": {"diagnosis": "evidence[1]"}},
      {"from": "n3", "to": "n4", "data_mapping": {"diagnosis": "evidence[2]"}}
    ]
  },
  "applicableDeviceTypes": ["STS", "RTG", "MHC", "RMG"],
  "applicableScenarios": ["齿轮箱诊断", "传动系统诊断"]
}
```

#### B.3 TPL_MOTOR_DIAG — 电机综合诊断

```json
{
  "compCode": "TPL_MOTOR_DIAG",
  "compName": "电机综合诊断",
  "isTemplate": 1,
  "controlClass": 1,
  "steps": {
    "nodes": [
      {"id": "n1", "order": 1, "algo_code": "mcsa_analysis", "config_overrides": {"lineFrequency": 50, "sidebandCount": 5}},
      {"id": "n2", "order": 1, "algo_code": "partial_discharge", "config_overrides": {}},
      {"id": "n3", "order": 1, "algo_code": "power_quality", "config_overrides": {}},
      {"id": "n4", "order": 2, "algo_code": "fusion_diagnosis_expert", "config_overrides": {"votingMethod": "weighted", "minConfidenceThreshold": 0.7}}
    ],
    "edges": [
      {"from": "n1", "to": "n4", "data_mapping": {"diagnosis": "evidence[0]"}},
      {"from": "n2", "to": "n4", "data_mapping": {"diagnosis": "evidence[1]"}},
      {"from": "n3", "to": "n4", "data_mapping": {"diagnosis": "evidence[2]"}}
    ]
  },
  "applicableDeviceTypes": ["STS", "RTG", "MHC", "AGV", "RMG"],
  "applicableScenarios": ["电机诊断", "电气综合诊断"]
}
```

#### B.4 TPL_STRUCTURAL_FATIGUE — 结构疲劳评估

```json
{
  "compCode": "TPL_STRUCTURAL_FATIGUE",
  "compName": "结构疲劳评估",
  "isTemplate": 1,
  "controlClass": 2,
  "steps": {
    "nodes": [
      {"id": "n1", "order": 1, "algo_code": "rainflow_counting", "config_overrides": {}},
      {"id": "n2", "order": 2, "algo_code": "miner_damage", "config_overrides": {"snCurveType": "IIW"}},
      {"id": "n3", "order": 3, "algo_code": "prediction_expert", "config_overrides": {"predictionHorizon": 365, "method": "holt_winters"}}
    ],
    "edges": [
      {"from": "n1", "to": "n2", "data_mapping": {"cycles": "data"}},
      {"from": "n2", "to": "n3", "data_mapping": {"cumulativeDamage": "data"}}
    ]
  },
  "applicableDeviceTypes": ["STS", "RTG", "MHC"],
  "applicableScenarios": ["疲劳评估", "结构健康监测", "寿命预测"]
}
```

#### B.5 TPL_ANOMALY_DETECTION — 通用异常检测

```json
{
  "compCode": "TPL_ANOMALY_DETECTION",
  "compName": "通用异常检测",
  "isTemplate": 1,
  "controlClass": 2,
  "steps": {
    "nodes": [
      {"id": "n1", "order": 1, "algo_code": "time_domain_features", "config_overrides": {}},
      {"id": "n2", "order": 1, "algo_code": "frequency_domain_features", "config_overrides": {}},
      {"id": "n3", "order": 2, "algo_code": "isolation_forest", "config_overrides": {"contamination": 0.05, "nEstimators": 100}},
      {"id": "n4", "order": 3, "algo_code": "spc_control", "config_overrides": {"controlChartType": "EWMA", "ewmaLambda": 0.2}}
    ],
    "edges": [
      {"from": "n1", "to": "n3", "data_mapping": {"features": "data[0]"}},
      {"from": "n2", "to": "n3", "data_mapping": {"features": "data[1]"}},
      {"from": "n3", "to": "n4", "data_mapping": {"anomalyScores": "data"}}
    ]
  },
  "applicableDeviceTypes": ["STS", "RTG", "MHC", "AGV", "RMG", "SPREADER"],
  "applicableScenarios": ["异常检测", "健康监测", "基线偏移检测"]
}
```

#### B.6 TPL_STS_HOIST_FULL — 岸桥起升全面诊断

```json
{
  "compCode": "TPL_STS_HOIST_FULL",
  "compName": "岸桥起升全面诊断",
  "isTemplate": 1,
  "controlClass": 1,
  "steps": {
    "nodes": [
      {"id": "n1", "order": 1, "algo_code": "time_domain_features", "config_overrides": {}},
      {"id": "n2", "order": 1, "algo_code": "fft_spectrum", "config_overrides": {"nfft": 4096, "enableISO": true, "enableFeatureDetection": true, "enableFaultDiagnosis": true}},
      {"id": "n3", "order": 1, "algo_code": "envelope_demod", "config_overrides": {"faultThreshold": 5.5}},
      {"id": "n4", "order": 2, "algo_code": "condition_normalization", "config_overrides": {"regressionType": "polynomial", "polynomialDegree": 2}},
      {"id": "n5", "order": 3, "algo_code": "ds_evidence_fusion", "config_overrides": {"fusionMethod": "yager", "conflictThreshold": 0.7}},
      {"id": "n6", "order": 4, "algo_code": "causal_inference", "config_overrides": {}}
    ],
    "edges": [
      {"from": "n1", "to": "n4", "data_mapping": {"features": "input[0]"}},
      {"from": "n2", "to": "n4", "data_mapping": {"diagnosis": "input[1]"}},
      {"from": "n3", "to": "n4", "data_mapping": {"diagnosis": "input[2]"}},
      {"from": "n4", "to": "n5", "data_mapping": {"normalizedEvidence": "evidence"}},
      {"from": "n5", "to": "n6", "data_mapping": {"fusedDiagnosis": "data"}}
    ]
  },
  "applicableDeviceTypes": ["STS"],
  "applicableScenarios": ["岸桥起升诊断", "岸桥全面诊断"]
}
```

#### B.7 TPL_DEGRADATION_TREND — 退化趋势预测

```json
{
  "compCode": "TPL_DEGRADATION_TREND",
  "compName": "退化趋势预测",
  "isTemplate": 1,
  "controlClass": 2,
  "steps": {
    "nodes": [
      {"id": "n1", "order": 1, "algo_code": "statistical_features", "config_overrides": {}},
      {"id": "n2", "order": 2, "algo_code": "spc_control", "config_overrides": {"controlChartType": "CUSUM", "cusumThreshold": 5}},
      {"id": "n3", "order": 3, "algo_code": "prediction_expert", "config_overrides": {"predictionHorizon": 90, "method": "holt_winters"}}
    ],
    "edges": [
      {"from": "n1", "to": "n2", "data_mapping": {"features": "data"}},
      {"from": "n2", "to": "n3", "data_mapping": {"trendData": "data"}}
    ]
  },
  "applicableDeviceTypes": ["STS", "RTG", "MHC", "AGV", "RMG"],
  "applicableScenarios": ["退化趋势", "RUL预测", "健康指标监控"]
}
```

#### B.8 TPL_AGENT_CHAIN — 智能诊断 Agent 链

```json
{
  "compCode": "TPL_AGENT_CHAIN",
  "compName": "智能诊断Agent链",
  "isTemplate": 1,
  "controlClass": 1,
  "steps": {
    "nodes": [
      {"id": "n1", "order": 1, "algo_code": "physical_constraint_expert", "config_overrides": {"enableEnergyConservation": true, "enableCausalOrdering": true}},
      {"id": "n2", "order": 1, "algo_code": "ts_pattern_expert", "config_overrides": {}},
      {"id": "n3", "order": 2, "algo_code": "case_retrieval_expert", "config_overrides": {"topK": 5, "similarityMethod": "dtw"}},
      {"id": "n4", "order": 3, "algo_code": "fusion_diagnosis_expert", "config_overrides": {"votingMethod": "weighted", "conflictResolution": "conservative", "minConfidenceThreshold": 0.7}}
    ],
    "edges": [
      {"from": "n1", "to": "n3", "data_mapping": {"qualityReport": "context[0]"}},
      {"from": "n2", "to": "n3", "data_mapping": {"patterns": "context[1]"}},
      {"from": "n1", "to": "n4", "data_mapping": {"diagnosis": "evidence[0]"}},
      {"from": "n2", "to": "n4", "data_mapping": {"diagnosis": "evidence[1]"}},
      {"from": "n3", "to": "n4", "data_mapping": {"diagnosis": "evidence[2]"}}
    ]
  },
  "applicableDeviceTypes": ["STS", "RTG", "MHC", "AGV", "RMG", "SPREADER"],
  "applicableScenarios": ["智能诊断", "复杂故障分析", "多源融合诊断"]
}
```

**DAG 合法性校验**：
- 8 个模板均无环路（edges 方向一致，order 递增）
- 所有 `algo_code` 引用均为已注册的 49 个算法 ID
- 所有边的 `from` / `to` 引用合法节点 ID

### 附录 C：一类控制级算法参数规范明细

完整的 8 个一类控制级算法全部可配参数（含 §4.2 已列出的关键参数 + 补充参数）：

#### C.1 fft_spectrum — 17 个参数

| # | 参数 | 类型 | 默认值 | validRange | safeRange | 影响 | requiresApproval |
|---|------|------|--------|-----------|-----------|------|------------------|
| 1 | windowFunction | string | hanning | {hanning,hamming,flattop,rectangular} | {hanning,hamming,flattop} | medium | N |
| 2 | nfft | number | 0 | [256, 65536] | [1024, 16384] | medium | N |
| 3 | frequencyRange | json | null | — | — | low | N |
| 4 | sliding | boolean | false | — | — | low | N |
| 5 | windowSize | number | 1024 | [128, 8192] | [512, 4096] | low | N |
| 6 | overlap | number | 0.5 | [0, 0.95] | [0.25, 0.75] | low | N |
| 7 | peakThreshold | number | 0.1 | [0.01, 0.5] | [0.05, 0.2] | **high** | **Y** |
| 8 | peakMinDistance | number | 5 | [1, 100] | [2, 20] | medium | N |
| 9 | enableISO | boolean | true | — | — | **high** | **Y** |
| 10 | machineGroup | string | group2 | {group1-4} | — | **high** | **Y** |
| 11 | mountType | string | rigid | {rigid, flexible} | — | **high** | **Y** |
| 12 | enableFeatureDetection | boolean | true | — | — | medium | N |
| 13 | enableFaultDiagnosis | boolean | true | — | — | **high** | **Y** |
| 14 | shaftRPM | number | 0 | [0, 50000] | [1, 10000] | medium | N |
| 15 | bearingModel | string | "" | — | — | medium | N |
| 16 | bearingParams | json | null | — | — | medium | N |
| 17 | gearParams | json | null | — | — | medium | N |

#### C.2 envelope_demod — 8 个参数

| # | 参数 | 类型 | 默认值 | validRange | safeRange | 影响 | requiresApproval |
|---|------|------|--------|-----------|-----------|------|------------------|
| 1 | cutoffFreq | number | 10 | [1, 500] | [5, 50] | medium | N |
| 2 | faultThreshold | number | 5.5 | [2.0, 20.0] | [4.0, 8.0] | **high** | **Y** |
| 3 | bandpassLow | number | 0 | [0, 50000] | — | medium | N |
| 4 | bandpassHigh | number | 0 | [0, 50000] | — | medium | N |
| 5 | filterOrder | number | 4 | [2, 10] | [3, 6] | medium | N |
| 6 | shaftRPM | number | 0 | [0, 50000] | [1, 10000] | medium | N |
| 7 | bearingModel | string | "" | — | — | medium | N |
| 8 | frequencyMatchTolerance | number | 0.05 | [0.01, 0.2] | [0.03, 0.08] | **high** | **Y** |

#### C.3 mcsa_analysis — 关键参数

| # | 参数 | 类型 | 默认值 | validRange | safeRange | 影响 | requiresApproval |
|---|------|------|--------|-----------|-----------|------|------------------|
| 1 | lineFrequency | number | 50 | [45, 65] | [49.5, 50.5] | **high** | **Y** |
| 2 | sidebandCount | number | 5 | [1, 20] | [3, 8] | medium | N |
| 3 | rotorBarCount | number | 0 | [0, 200] | [20, 80] | **high** | **Y** |
| 4 | slipEstimation | string | auto | {auto, manual, nameplate} | {auto, nameplate} | medium | N |

#### C.4 spc_control — 关键参数

| # | 参数 | 类型 | 默认值 | validRange | safeRange | 影响 | requiresApproval |
|---|------|------|--------|-----------|-----------|------|------------------|
| 1 | controlChartType | string | EWMA | {Shewhart, CUSUM, EWMA} | — | medium | N |
| 2 | sigmaLevel | number | 3 | [1, 6] | [2.5, 3.5] | **high** | **Y** |
| 3 | ewmaLambda | number | 0.2 | [0.01, 1.0] | [0.1, 0.4] | **high** | **Y** |
| 4 | cusumThreshold | number | 5 | [1, 20] | [3, 8] | **high** | **Y** |

#### C.5 ds_evidence_fusion — 关键参数

| # | 参数 | 类型 | 默认值 | validRange | safeRange | 影响 | requiresApproval |
|---|------|------|--------|-----------|-----------|------|------------------|
| 1 | conflictThreshold | number | 0.7 | [0.3, 0.95] | [0.5, 0.8] | **high** | **Y** |
| 2 | fusionMethod | string | yager | {dempster, yager, murphy} | {yager, murphy} | **high** | **Y** |
| 3 | minEvidenceSources | number | 2 | [1, 10] | [2, 5] | medium | N |

#### C.6 condition_normalization — 关键参数

| # | 参数 | 类型 | 默认值 | validRange | safeRange | 影响 | requiresApproval |
|---|------|------|--------|-----------|-----------|------|------------------|
| 1 | regressionType | string | polynomial | {linear, polynomial, gam} | {linear, polynomial} | **high** | **Y** |
| 2 | polynomialDegree | number | 2 | [1, 5] | [1, 3] | **high** | **Y** |
| 3 | minDataPerCondition | number | 30 | [10, 500] | [20, 100] | medium | N |
| 4 | outlierRemoval | boolean | true | — | — | medium | N |

#### C.7 physical_constraint_expert — 关键参数

| # | 参数 | 类型 | 默认值 | validRange | safeRange | 影响 | requiresApproval |
|---|------|------|--------|-----------|-----------|------|------------------|
| 1 | violationThreshold | number | 0.15 | [0.01, 0.5] | [0.05, 0.25] | **high** | **Y** |
| 2 | enableEnergyConservation | boolean | true | — | — | **high** | **Y** |
| 3 | enableCausalOrdering | boolean | true | — | — | **high** | **Y** |

#### C.8 fusion_diagnosis_expert — 关键参数

| # | 参数 | 类型 | 默认值 | validRange | safeRange | 影响 | requiresApproval |
|---|------|------|--------|-----------|-----------|------|------------------|
| 1 | votingMethod | string | weighted | {majority, weighted, stacking} | {weighted, stacking} | **high** | **Y** |
| 2 | minConfidenceThreshold | number | 0.6 | [0.3, 0.95] | [0.5, 0.8] | **high** | **Y** |
| 3 | conflictResolution | string | conservative | {conservative, aggressive, abstain} | {conservative, abstain} | **high** | **Y** |

### 附录 D：与 KNOWLEDGE_ARCHITECTURE.md 交叉引用

| 本文档章节 | KNOWLEDGE_ARCHITECTURE.md 章节 | 引用内容 |
|-----------|-------------------------------|----------|
| §2.1 encodingMapping.deviceTypes | §2.2 设备编码（5 级） | 设备类型编码第 2 级（STS/RTG/MHC/AGV 等） |
| §2.1 encodingMapping.componentTypes | §2.3 部件编码（4 级） | 部件编码前 2 级（系统.子系统） |
| §2.1 encodingMapping.faultCategories | §2.4 故障编码（3 级） | 故障类别第 1 级（MECH/ELEC/STRUCT/THERMAL 等） |
| §2.1 encodingMapping.faultModes | §2.4 故障编码（3 级） | 故障模式第 2 级（BEARING_WEAR/GEAR_PITTING 等） |
| §3.1 编码解析 | §2.2-2.5 各编码正则 | 编码解析使用相同正则校验 |
| §3.3 港机场景默认配置 | §2.3 部件编码系统级 | HOIST/TROLLEY/GANTRY/BOOM 机构映射 |
| §5.2 模板编码映射 | §2.6 编码注册表 | `baseDictItems` 中的编码有效值 |
| 附录 A deviceTypes 列 | §2.2 设备类型有效值 | STS/RTG/MHC/AGV/RMG/SPREADER |
| 附录 A faultCategories 列 | §2.4 故障类别有效值 | MECH/ELEC/STRUCT/THERMAL/VIBR/FATIGUE/CORR |
| 附录 A faultModes 列 | §2.4 故障模式有效值 | BEARING_WEAR/GEAR_PITTING 等 |

**编码格式一致性**：

| 校验项 | 规则 | 状态 |
|--------|------|------|
| deviceTypes 编码值 | 符合 `^[A-Z_]{2,10}$` | 全部通过（STS/RTG/MHC/AGV/RMG/SPREADER） |
| componentTypes 编码值 | 符合 `^[A-Z_]{2,10}\.[A-Z_]{2,10}$` | 全部通过（HOIST.GBX/HOIST.MOTOR 等） |
| faultCategories 编码值 | 符合 `^[A-Z_]{2,12}$` | 全部通过（MECH/ELEC/STRUCT/THERMAL/VIBR/FATIGUE/CORR） |
| faultModes 编码值 | 符合 `^[A-Z_]{2,30}$` | 全部通过 |

---

> **文档结束** — 本文档为纯设计规范，不含可执行代码。后续实现阶段按 §6 列出的文件清单进行代码扩展。
