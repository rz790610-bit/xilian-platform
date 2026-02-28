# 西联平台算法清单

> **版本**: 1.0.0
> **日期**: 2026-02-28
> **总计**: 49 个算法，10 大分类，66 个 DSP 底层函数

---

## 目录

1. [架构概述](#1-架构概述)
2. [算法清单总表](#2-算法清单总表)
3. [分类详细清单](#3-分类详细清单)
4. [DSP 底层函数库](#4-dsp-底层函数库)
5. [统计汇总](#5-统计汇总)

---

## 1. 架构概述

### 1.1 统一算法引擎

所有 49 个算法通过 `AlgorithmEngine`（单例）统一管理，路径 `server/algorithms/_core/engine.ts`。

```
┌─────────────────────────────────────────────────────────┐
│                  AlgorithmEngine (单例)                   │
│                                                         │
│  注册: register(AlgorithmRegistration)                   │
│  执行: execute(algorithmId, input, config, context)      │
│  编排: executeComposition(steps[], initialInput)         │
│  批量: executeBatch(tasks[])                             │
│                                                         │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐               │
│  │ 缓存LRU │  │ Worker池 │  │ 依赖注入  │               │
│  │ 100条   │  │ 大数据   │  │ 设备/工况 │               │
│  └─────────┘  │ 自动分流  │  └──────────┘               │
│               └─────────┘                               │
└─────────────────────────────────────────────────────────┘
```

### 1.2 标准化接口

**所有 49 个算法均实现 `IAlgorithmExecutor` 接口**（`server/algorithms/_core/types.ts`）：

```typescript
interface IAlgorithmExecutor {
  readonly id: string;        // 唯一标识
  readonly name: string;      // 中文名称
  readonly version: string;   // 语义化版本
  readonly category: string;  // 所属分类

  execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput>;
  validateInput(input: AlgorithmInput, config: Record<string, any>): { valid: boolean; errors?: string[] };
  getDefaultConfig(): Record<string, any>;
}
```

### 1.3 统一输入输出格式

**输入** (`AlgorithmInput`):
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `data` | `number[] \| number[][] \| Record<string, number[]>` | Y | 时间序列或特征矩阵 |
| `sampleRate` | `number` | 视算法 | 采样率 (Hz) |
| `timestamps` | `string[] \| number[]` | N | 时间戳 |
| `equipment` | `{type, model, ratedSpeed, ratedPower, bearingInfo}` | N | 设备信息 |
| `operatingCondition` | `{speed, load, temperature}` | N | 工况参数 |
| `context` | `Record<string, any>` | N | 附加上下文 |

**输出** (`AlgorithmOutput`):
| 字段 | 类型 | 说明 |
|------|------|------|
| `algorithmId` | `string` | 算法 ID |
| `status` | `AlgorithmStatus` | `pending/running/completed/failed/cancelled` |
| `diagnosis` | `DiagnosisConclusion` | **必须输出** — summary, severity, urgency, confidence, faultType, rootCause, recommendations |
| `results` | `Record<string, any>` | 计算结果数据 |
| `visualizations` | `AlgorithmVisualization[]` | 可视化数据（line/bar/scatter/heatmap/spectrum/waterfall/polar） |
| `metadata` | `{executionTimeMs, inputDataPoints, algorithmVersion, parameters}` | 执行元数据 |

### 1.4 调用方式

所有算法统一通过以下方式调用：

| 方式 | 路径 | 说明 |
|------|------|------|
| **引擎直接调用** | `AlgorithmEngine.execute(id, input, config)` | 主要调用方式，支持缓存、超时、Worker 分流 |
| **tRPC API** | `algorithm.router.ts` → `algorithm.service.ts` → `AlgorithmEngine` | 前端通过 tRPC 调用 |
| **编排执行** | `AlgorithmEngine.executeComposition(steps)` | 多算法串联 Pipeline |
| **批量执行** | `AlgorithmEngine.executeBatch(tasks)` | 串行批量执行 |

无 HTTP/gRPC 独立调用方式——全部经 `AlgorithmEngine` 统一入口。

---

## 2. 算法清单总表

| # | 算法 ID | 名称 | 分类 | 版本 | 算法类型 | 复杂度 | 边缘部署 | 标准化接口 |
|---|---------|------|------|------|----------|--------|----------|------------|
| 1 | `fft_spectrum` | FFT频谱分析 | mechanical | 3.0.0 | 机理 | O(NlogN) | Y | Y |
| 2 | `cepstrum_analysis` | 倒频谱分析 | mechanical | 1.2.0 | 机理 | O(NlogN) | Y | Y |
| 3 | `envelope_demod` | 包络解调分析 | mechanical | 3.6.0 | 机理 | O(L×2^L×NlogN) | Y | Y |
| 4 | `wavelet_packet` | 小波包分解 | mechanical | 1.5.0 | 机理 | O(NlogN) | Y | Y |
| 5 | `bandpass_filter` | 带通滤波 | mechanical | 1.3.0 | 机理 | O(N) | Y | Y |
| 6 | `spectral_kurtosis` | 谱峭度SK | mechanical | 1.4.0 | 机理 | O(N*2^L) | Y | Y |
| 7 | `resampling` | 重采样 | mechanical | 1.1.0 | 机理 | O(N) | Y | Y |
| 8 | `order_tracking` | 阶次跟踪分析 | mechanical | 1.3.0 | 机理 | O(NlogN) | Y | Y |
| 9 | `mcsa_analysis` | 电机电流分析MCSA | electrical | 2.0.0 | 机理 | O(NlogN) | Y | Y |
| 10 | `partial_discharge` | 局部放电PD分析 | electrical | 1.5.0 | 机理 | O(N) | Y | Y |
| 11 | `vfd_analysis` | 变频器状态分析 | electrical | 1.2.0 | 机理 | O(NlogN) | Y | Y |
| 12 | `power_quality` | 电能质量分析 | electrical | 1.3.0 | 机理 | O(NlogN) | Y | Y |
| 13 | `miner_damage` | Miner线性累积损伤法 | structural | 2.0.0 | 机理 | O(N) | Y | Y |
| 14 | `acoustic_emission` | 声发射分析AE | structural | 2.0.0 | 机理 | O(N) | Y | Y |
| 15 | `modal_analysis` | 模态分析 | structural | 2.0.0 | 机理 | O(NlogN) | Y | Y |
| 16 | `hot_spot_stress` | 热点应力法 | structural | 2.0.0 | 机理 | O(N) | Y | Y |
| 17 | `rainflow_counting` | 雨流计数法 | structural | 2.0.0 | 机理 | O(N) | Y | Y |
| 18 | `isolation_forest` | Isolation Forest异常检测 | anomaly_detection | 2.1.0 | ML | O(N*T*logN) | Y | Y |
| 19 | `lstm_anomaly` | LSTM异常检测 | anomaly_detection | 2.1.0 | ML | O(N*W*E) | **N** | Y |
| 20 | `autoencoder_anomaly` | 自编码器异常检测 | anomaly_detection | 2.1.0 | ML | O(N*D*E) | **N** | Y |
| 21 | `spc_control` | 统计过程控制SPC | anomaly_detection | 2.1.0 | 统计 | O(N) | Y | Y |
| 22 | `pso_optimizer` | 粒子群优化PSO | optimization | 2.0.0 | 统计 | O(N*S*D) | Y | Y |
| 23 | `genetic_algorithm` | 遗传算法GA | optimization | 1.5.0 | 统计 | O(G*N*D) | Y | Y |
| 24 | `bayesian_optimization` | 贝叶斯优化 | optimization | 1.2.0 | 统计 | O(N^3) | Y | Y |
| 25 | `simulated_annealing` | 模拟退火SA | optimization | 1.3.0 | 统计 | O(N*D) | Y | Y |
| 26 | `ds_evidence_fusion` | DS证据理论融合 | comprehensive | 1.5.0 | 统计 | O(N*2^M) | Y | Y |
| 27 | `association_rules` | 关联规则挖掘 | comprehensive | 1.3.0 | 统计 | O(2^N) | Y | Y |
| 28 | `causal_inference` | 因果推理 | comprehensive | 1.2.0 | 统计 | O(V^2*L*N) | Y | Y |
| 29 | `condition_normalization` | 工况归一化 | comprehensive | 1.4.0 | 统计 | O(N*D^2) | Y | Y |
| 30 | `time_domain_features` | 时域特征提取 | feature_extraction | 2.1.0 | 统计 | O(N) | Y | Y |
| 31 | `frequency_domain_features` | 频域特征提取 | feature_extraction | 2.1.0 | 机理 | O(NlogN) | Y | Y |
| 32 | `time_frequency_features` | 时频域特征提取 | feature_extraction | 2.1.0 | 机理 | O(N*W*logW) | Y | Y |
| 33 | `statistical_features` | 统计特征提取 | feature_extraction | 2.1.0 | 统计 | O(N^2) | Y | Y |
| 34 | `deep_features` | 深度特征提取 | feature_extraction | 2.1.0 | ML | O(N*D*K) | **N** | Y |
| 35 | `ts_pattern_expert` | 时序模式专家 | agent_plugin | 2.0.0 | 混合 | O(N*L) | Y | Y |
| 36 | `case_retrieval_expert` | 案例检索专家 | agent_plugin | 1.5.0 | 混合 | O(N*D) | Y | Y |
| 37 | `physical_constraint_expert` | 物理约束专家 | agent_plugin | 1.2.0 | 机理 | O(N*C) | Y | Y |
| 38 | `spatial_anomaly_expert` | 空间异常专家 | agent_plugin | 1.3.0 | 统计 | O(S^2*N) | Y | Y |
| 39 | `fusion_diagnosis_expert` | 融合诊断专家 | agent_plugin | 1.5.0 | 混合 | O(N*K) | Y | Y |
| 40 | `prediction_expert` | 预测专家 | agent_plugin | 1.8.0 | 统计 | O(N+H) | Y | Y |
| 41 | `lora_finetuning` | LoRA微调 | model_iteration | 2.0.0 | ML | O(E*N*R*D) | **N** | Y |
| 42 | `full_retraining` | 全量重训练 | model_iteration | 2.0.0 | ML | O(E*N*P) | **N** | Y |
| 43 | `incremental_learning` | 增量学习 | model_iteration | 2.0.0 | ML | O(E*N*P) | Y | Y |
| 44 | `model_distillation` | 模型蒸馏 | model_iteration | 2.0.0 | ML | O(E*N*P) | Y | Y |
| 45 | `llm_analysis` | LLM分析 | rule_learning | 1.0.0 | 大模型 | O(T) | **N** | Y |
| 46 | `association_rule_learning` | 关联规则学习 | rule_learning | 1.5.0 | 统计 | O(2^I*N) | Y | Y |
| 47 | `decision_tree_induction` | 决策树归纳 | rule_learning | 1.3.0 | ML | O(N*D*logN) | Y | Y |
| 48 | `frequent_pattern_mining` | 频繁模式挖掘 | rule_learning | 1.2.0 | 统计 | O(N*L*P) | Y | Y |

---

## 3. 分类详细清单

### 3.1 机械算法 (mechanical) — 8 个

> 路径: `server/algorithms/mechanical/index.ts`
> 定位: 振动信号处理与机械故障诊断

| # | 算法 ID | 名称 | 版本 | 类型 | 说明 | 输入 | 核心输出 | 参考标准 | 复杂度 |
|---|---------|------|------|------|------|------|----------|----------|--------|
| 1 | `fft_spectrum` | FFT频谱分析 | 3.0.0 | 机理 | 多窗函数+滑动窗口+特征频率检测(转频谐波/油膜/轴承倍频/齿轮边带)+规则故障诊断+多数投票聚合+ISO 10816/20816 | `data: number[]`, `sampleRate: number` | frequencies[], amplitudes[], peaks[], velocityRMS, isoEvaluation | ISO 10816-3, ISO 20816-1, ISO 7919 | O(NlogN) |
| 2 | `cepstrum_analysis` | 倒频谱分析 | 1.2.0 | 机理 | 功率倒频谱/实倒频谱分析，齿轮箱故障检测和周期性调制识别 | `data: number[]`, `sampleRate: number` | quefrency[], cepstrum[], peaks[] | ISO 18436-2 | O(NlogN) |
| 3 | `envelope_demod` | 包络解调分析 | 3.6.0 | 机理 | 快速峭度图自动选频+Hilbert变换包络+正负频镜像修复+Parseval全谱能量+峭度/谐波融合评分+多方法故障检测+D5推理链路 | `data: number[]`, `sampleRate: number` | envelopeSpectrum, envelopeSignal[], faults[], optimalBand, kurtogramTop5[], reasoningTrace[], overallStatus, overallConfidence | ISO 15243, ISO 281, ISO 18436-2 | O(L×2^L×NlogN) |
| 4 | `wavelet_packet` | 小波包分解 | 1.5.0 | 机理 | 多层小波包分解，频带能量分布计算，Shannon熵特征提取 | `data: number[]` | nodeEnergies[], shannonEntropy | Mallat 1989 | O(NlogN) |
| 5 | `bandpass_filter` | 带通滤波 | 1.3.0 | 机理 | Butterworth带通滤波器 | `data: number[]`, `sampleRate: number` | filteredSignal[] | — | O(N) |
| 6 | `spectral_kurtosis` | 谱峭度SK | 1.4.0 | 机理 | 快速峭度图(Fast Kurtogram)最佳解调频带选择 | `data: number[]`, `sampleRate: number` | kurtogram, optimalBand, filteredSignal[] | Antoni J. 2006 | O(N*2^L) |
| 7 | `resampling` | 重采样 | 1.1.0 | 机理 | 信号重采样+抗混叠滤波 | `data: number[]`, `sampleRate: number` | resampledSignal[], newSampleRate | — | O(N) |
| 8 | `order_tracking` | 阶次跟踪分析 | 1.3.0 | 机理 | 变速条件下角度域重采样+阶次频谱分析 | `data: number[]`, `sampleRate: number` | orderSpectrum, orderAmplitudes[], dominantOrders[] | ISO 7919, ISO 10816 | O(NlogN) |

**Tags**: 频谱, FFT, 振动, ISO10816, 故障诊断, 特征频率, 滑动窗口, 轴承, 齿轮, 倒频谱, 齿轮箱, 调制, 包络, 解调, Hilbert, 峭度图, 谐波分析, D5合规, 小波, 能量分布, Shannon熵, 滤波, Butterworth, 阶次, 变速, 角度域, 旋转机械

---

### 3.2 电气算法 (electrical) — 4 个

> 路径: `server/algorithms/electrical/index.ts`
> 定位: 电气设备状态监测与故障诊断

| # | 算法 ID | 名称 | 版本 | 类型 | 说明 | 输入 | 核心输出 | 参考标准 | 复杂度 |
|---|---------|------|------|------|------|------|----------|----------|--------|
| 1 | `mcsa_analysis` | 电机电流分析MCSA | 2.0.0 | 机理 | 电机电流频谱分析，转子故障/偏心/轴承故障检测 | `data: number[]`, `sampleRate: number` | spectrum, sidebands[], faultIndicators | IEEE Std 1415, IEC 60034-26 | O(NlogN) |
| 2 | `partial_discharge` | 局部放电PD分析 | 1.5.0 | 机理 | PRPD相位解析+PD脉冲识别+绝缘状态评估 | `data: number[]`, `sampleRate: number` | prpdPattern, pulseCount, insulationStatus | IEC 60270, IEEE Std 400.3 | O(N) |
| 3 | `vfd_analysis` | 变频器状态分析 | 1.2.0 | 机理 | 变频器PWM波形分析+谐波检测+故障诊断 | `data: number[]`, `sampleRate: number` | harmonics[], pwmQuality, faultCodes | IEEE 519, IEC 61800-3 | O(NlogN) |
| 4 | `power_quality` | 电能质量分析 | 1.3.0 | 机理 | THD谐波畸变率+三相不平衡度+功率因数分析 | `data: number[]`, `sampleRate: number` | thd, unbalanceRatio, powerFactor, harmonicSpectrum | IEEE 519-2014, IEC 61000-4-30, GB/T 14549 | O(NlogN) |

**Tags**: MCSA, 电机, 电流, 转子, 故障诊断, 局部放电, PD, PRPD, 绝缘, 高压, 变频器, VFD, 谐波, PWM, 电能质量, THD, 三相不平衡

---

### 3.3 结构算法 (structural) — 5 个

> 路径: `server/algorithms/structural/index.ts`
> 定位: 结构健康监测与疲劳寿命评估

| # | 算法 ID | 名称 | 版本 | 类型 | 说明 | 输入 | 核心输出 | 参考标准 | 复杂度 |
|---|---------|------|------|------|------|------|----------|----------|--------|
| 1 | `miner_damage` | Miner线性累积损伤法 | 2.0.0 | 机理 | 基于S-N曲线的疲劳累积损伤计算+剩余寿命预测 | `data: number[]` | cumulativeDamage, remainingLife, snCurve | Palmgren-Miner Rule, ASTM E1049 | O(N) |
| 2 | `acoustic_emission` | 声发射分析AE | 2.0.0 | 机理 | AE信号参数提取(幅值/能量/计数/持续时间)+裂纹扩展评估 | `data: number[]`, `sampleRate: number` | aeEvents[], severity, crackGrowthRate | ASTM E1316, EN 13554, GB/T 18182 | O(N) |
| 3 | `modal_analysis` | 模态分析 | 2.0.0 | 机理 | FDD频域分解法+固有频率识别+阻尼比估计+模态振型 | `data: number[][]`, `sampleRate: number` | naturalFreqs[], dampingRatios[], modeShapes | ISO 7626, Brincker et al. 2001 | O(NlogN) |
| 4 | `hot_spot_stress` | 热点应力法 | 2.0.0 | 机理 | 焊接节点热点应力计算+应力集中系数SCF+IIW疲劳评估 | `data: number[]` | hotSpotStress, scf, fatigueClass, designLife | IIW Doc. XIII-2460-13, EN 1993-1-9 | O(N) |
| 5 | `rainflow_counting` | 雨流计数法 | 2.0.0 | 机理 | 载荷历程循环计数+应力幅统计+疲劳寿命分析 | `data: number[]` | cycles[], rangeHistogram, meanStressEffect | ASTM E1049, ISO 12110 | O(N) |

**Tags**: 疲劳, Miner, S-N曲线, 寿命预测, 声发射, AE, 无损检测, 结构监测, 模态, FDD, 固有频率, 阻尼比, 热点应力, 焊接, SCF, IIW, 雨流计数, 循环计数, Markov

---

### 3.4 异常检测 (anomaly_detection) — 4 个

> 路径: `server/algorithms/anomaly/index.ts`
> 定位: 多维度异常检测与统计过程控制

| # | 算法 ID | 名称 | 版本 | 类型 | 说明 | 输入 | 核心输出 | 参考标准 | 边缘 | 复杂度 |
|---|---------|------|------|------|------|------|----------|----------|------|--------|
| 1 | `isolation_forest` | Isolation Forest | 2.1.0 | ML | 基于隔离树的无监督多变量异常检测 | `data: number[][]` | anomalyScores[], anomalyFlags[], featureImportance | Liu et al. 2008, 2012 | Y | O(N*T*logN) |
| 2 | `lstm_anomaly` | LSTM异常检测 | 2.1.0 | ML | LSTM序列预测+重构误差异常检测 | `data: number[]`, `sampleRate` | predictions[], errors[], anomalyFlags[] | Malhotra et al. 2015 | **N** | O(N*W*E) |
| 3 | `autoencoder_anomaly` | 自编码器异常检测 | 2.1.0 | ML | 自编码器重构误差+多变量异常检测 | `data: number[][]` | reconstructions[], errors[], anomalyFlags[] | Sakurada & Yairi 2014 | **N** | O(N*D*E) |
| 4 | `spc_control` | 统计过程控制SPC | 2.1.0 | 统计 | Shewhart/CUSUM/EWMA控制图+过程能力指数 | `data: number[]` | controlLimits, outOfControl[], cpk, trendAnalysis | ISO 7870, AIAG SPC Manual | Y | O(N) |

---

### 3.5 优化算法 (optimization) — 4 个

> 路径: `server/algorithms/optimization/index.ts`
> 定位: 智能优化与参数寻优

| # | 算法 ID | 名称 | 版本 | 类型 | 说明 | 输入 | 核心输出 | 参考标准 | 复杂度 |
|---|---------|------|------|------|------|------|----------|----------|--------|
| 1 | `pso_optimizer` | 粒子群优化PSO | 2.0.0 | 统计 | 粒子群寻优+惯性权重递减+多约束处理 | `data` (参数空间) | bestPosition[], bestFitness, convergenceCurve | Kennedy & Eberhart 1995, Shi & Eberhart 1998 | O(N*S*D) |
| 2 | `genetic_algorithm` | 遗传算法GA | 1.5.0 | 统计 | 选择/交叉/变异+精英保留策略+多目标优化 | `data` (参数空间) | bestChromosome[], fitness, generations | Holland 1975, Deb & Agrawal 1995 | O(G*N*D) |
| 3 | `bayesian_optimization` | 贝叶斯优化 | 1.2.0 | 统计 | 高斯过程代理模型+EI采集函数+超参数优化 | `data` (观测点) | bestParams, surrogatePredictions, nextSuggestion | Snoek et al. 2012, Jones et al. 1998 | O(N^3) |
| 4 | `simulated_annealing` | 模拟退火SA | 1.3.0 | 统计 | Metropolis准则+自适应冷却策略+多邻域搜索 | `data` (参数空间) | bestSolution[], energy, coolingHistory | Kirkpatrick et al. 1983, Metropolis et al. 1953 | O(N*D) |

---

### 3.6 综合算法 (comprehensive) — 4 个

> 路径: `server/algorithms/comprehensive/index.ts`
> 定位: 多源信息融合与因果推理

| # | 算法 ID | 名称 | 版本 | 类型 | 说明 | 输入 | 核心输出 | 参考标准 | 复杂度 |
|---|---------|------|------|------|------|------|----------|----------|--------|
| 1 | `ds_evidence_fusion` | DS证据理论融合 | 1.5.0 | 统计 | Dempster-Shafer证据融合+冲突管理+Yager改进 | `data` (证据矩阵) | fusedMassFunction, beliefIntervals, conflictDegree | Dempster 1967, Shafer 1976, Yager 1987 | O(N*2^M) |
| 2 | `association_rules` | 关联规则挖掘 | 1.3.0 | 统计 | Apriori频繁项集+支持度/置信度/提升度 | `data` (事务矩阵) | rules[], frequentItemsets[], metrics | Agrawal et al. 1993 | O(2^N) |
| 3 | `causal_inference` | 因果推理 | 1.2.0 | 统计 | Granger因果检验+PC算法因果图+时滞因果 | `data: Record<string, number[]>` | causalGraph, granger结果, timeDelays | Granger 1969, Spirtes et al. 2000 | O(V^2*L*N) |
| 4 | `condition_normalization` | 工况归一化 | 1.4.0 | 统计 | 多工况回归消除+残差分析+标准化健康指标 | `data: Record<string, number[]>` | normalizedSignal[], residuals[], healthIndex | ISO 13373-9, EPRI Guidelines | O(N*D^2) |

---

### 3.7 特征提取 (feature_extraction) — 5 个

> 路径: `server/algorithms/feature-extraction/index.ts`
> 定位: 时域/频域/时频域特征工程

| # | 算法 ID | 名称 | 版本 | 类型 | 说明 | 输入 | 核心输出 | 参考标准 | 边缘 | 复杂度 |
|---|---------|------|------|------|------|------|----------|----------|------|--------|
| 1 | `time_domain_features` | 时域特征提取 | 2.1.0 | 统计 | RMS/峭度/偏度/波形因子/脉冲因子/AR模型 | `data: number[]` | features{rms, kurtosis, skewness, crestFactor, ...} | ISO 10816, ISO 13373 | Y | O(N) |
| 2 | `frequency_domain_features` | 频域特征提取 | 2.1.0 | 机理 | 频谱重心/带宽/滚降频率/频谱熵/谐波能量比 | `data: number[]`, `sampleRate` | features{centroid, bandwidth, rolloff, spectralEntropy, ...} | ISO 13373, ISO 7919 | Y | O(NlogN) |
| 3 | `time_frequency_features` | 时频域特征提取 | 2.1.0 | 机理 | STFT+瞬时频率/瞬时能量/时频熵 | `data: number[]`, `sampleRate` | stftMatrix, instantFreq[], instantEnergy[], tfEntropy | Cohen 1995, Mallat 2008 | Y | O(N*W*logW) |
| 4 | `statistical_features` | 统计特征提取 | 2.1.0 | 统计 | 近似熵/样本熵/分形维数/Hurst指数/Li-Yorke混沌检测 | `data: number[]` | features{approxEntropy, sampleEntropy, fractalDim, hurstExponent, ...} | Richman & Moorman 2000, Higuchi 1988 | Y | O(N^2) |
| 5 | `deep_features` | 深度特征提取 | 2.1.0 | ML | PCA降维/自编码器特征学习/表征向量提取 | `data: number[][]` | features[], latentVector[], explained变量 | Pearson 1901, Hinton & Salakhutdinov 2006 | **N** | O(N*D*K) |

---

### 3.8 Agent 插件 (agent_plugin) — 6 个

> 路径: `server/algorithms/agent-plugins/index.ts`
> 定位: 智能诊断 Agent 专家插件

| # | 算法 ID | 名称 | 版本 | 类型 | 说明 | 输入 | 核心输出 | 参考标准 | 复杂度 |
|---|---------|------|------|------|------|------|----------|----------|--------|
| 1 | `ts_pattern_expert` | 时序模式专家 | 2.0.0 | 混合 | CUSUM变点检测+模式匹配+趋势识别+语义化描述 | `data: number[]` | changePoints[], patterns[], trendDescription | Page 1954, Killick et al. 2012 | O(N*L) |
| 2 | `case_retrieval_expert` | 案例检索专家 | 1.5.0 | 混合 | DTW时间序列相似度+案例库检索+Top-K匹配 | `data: number[]`, 案例库 | similarCases[], matchScores[], recommendation | Aamodt & Plaza 1994 | O(N*D) |
| 3 | `physical_constraint_expert` | 物理约束专家 | 1.2.0 | 机理 | 物理一致性校验+约束违反检测+数据质量评估 | `data: Record<string, number[]>` | violations[], consistency评分, qualityReport | Physics-Informed ML | O(N*C) |
| 4 | `spatial_anomaly_expert` | 空间异常专家 | 1.3.0 | 统计 | 多传感器空间关联分析+空间异常模式检测 | `data: Record<string, number[]>` | spatialPatterns[], anomalyMap, correlationMatrix | Spatial Statistics | O(S^2*N) |
| 5 | `fusion_diagnosis_expert` | 融合诊断专家 | 1.5.0 | 混合 | 多算法结果集成+加权投票+冲突消解+综合诊断 | 多算法输出 | fusedDiagnosis, algorithmWeights, conflictReport | Ensemble Methods | O(N*K) |
| 6 | `prediction_expert` | 预测专家 | 1.8.0 | 统计 | 指数平滑/Holt-Winters趋势外推+RUL剩余寿命预测 | `data: number[]`, `timestamps` | predictions[], rul, trendCoeffs, confidenceBounds | Holt 1957, Brown 1959 | O(N+H) |

---

### 3.9 模型迭代 (model_iteration) — 4 个

> 路径: `server/algorithms/model-iteration/index.ts`
> 定位: 模型训练、微调、蒸馏与增量学习

| # | 算法 ID | 名称 | 版本 | 类型 | 说明 | 输入 | 核心输出 | 参考标准 | 边缘 | 复杂度 |
|---|---------|------|------|------|------|------|----------|----------|------|--------|
| 1 | `lora_finetuning` | LoRA微调 | 2.0.0 | ML | 低秩适配器参数高效微调+冻结主干 | `data` (训练集) | adaptedModel, loraWeights, trainLoss[] | Hu et al. 2021 | **N** | O(E*N*R*D) |
| 2 | `full_retraining` | 全量重训练 | 2.0.0 | ML | MLP全连接网络+反向传播+SGD/Adam优化 | `data` (训练集) | trainedModel, metrics{accuracy, loss} | Rumelhart et al. 1986 | **N** | O(E*N*P) |
| 3 | `incremental_learning` | 增量学习 | 2.0.0 | ML | EWC弹性权重巩固+Fisher信息矩阵+经验回放 | `data` (增量数据) | updatedModel, fisherInfo, replayBuffer | Kirkpatrick et al. 2017, Ratcliff 1990 | Y | O(E*N*P) |
| 4 | `model_distillation` | 模型蒸馏 | 2.0.0 | ML | Teacher→Student知识迁移+KL散度损失+模型压缩 | Teacher模型 + 数据 | studentModel, compressionRatio, accuracyDelta | Hinton et al. 2015 | Y | O(E*N*P) |

---

### 3.10 规则自动学习 (rule_learning) — 4 个

> 路径: `server/algorithms/rule-learning/index.ts`
> 定位: 自动规则发现与模式挖掘

| # | 算法 ID | 名称 | 版本 | 类型 | 说明 | 输入 | 核心输出 | 参考标准 | 边缘 | 复杂度 |
|---|---------|------|------|------|------|------|----------|----------|------|--------|
| 1 | `llm_analysis` | LLM分析 | 1.0.0 | **大模型** | 大语言模型辅助分析+规则生成+自然语言推理 | 文本/数据描述 | rules[], insights[], nlExplanation | LLM-Assisted Analysis | **N** | O(T) |
| 2 | `association_rule_learning` | 关联规则学习 | 1.5.0 | 统计 | Apriori算法+频繁项集挖掘+规则评估+剪枝 | `data` (事务集) | learnedRules[], itemsetSupport, metrics | Agrawal & Srikant 1994 | Y | O(2^I*N) |
| 3 | `decision_tree_induction` | 决策树归纳 | 1.3.0 | ML | CART/C4.5决策树+信息增益+基尼系数+规则提取 | `data: number[][]` + labels | treeStructure, extractedRules[], featureImportance | Breiman et al. 1984, Quinlan 1993 | Y | O(N*D*logN) |
| 4 | `frequent_pattern_mining` | 频繁模式挖掘 | 1.2.0 | 统计 | PrefixSpan序列模式挖掘+时序关联规则 | `data` (序列集) | frequentPatterns[], sequentialRules[], support[] | Pei et al. 2001 | Y | O(N*L*P) |

---

## 4. DSP 底层函数库

> 路径: `server/algorithms/_core/dsp.ts`
> 总计: 66 个导出函数

### 4.1 FFT / 频谱分析

| 函数 | 说明 |
|------|------|
| `fft(input)` | 快速傅里叶变换 (Cooley-Tukey) |
| `fftComplex(data)` | 复数 FFT |
| `ifft(spectrum)` | 逆 FFT |
| `amplitudeSpectrum(signal, sampleRate)` | 幅值谱 |
| `powerSpectralDensity(signal, sampleRate)` | 功率谱密度 |
| `rmsVelocity(signal, sampleRate)` | 速度有效值 |

### 4.2 窗函数

| 函数 | 说明 |
|------|------|
| `hanningWindow(N)` | 汉宁窗 |
| `hammingWindow(N)` | 汉明窗 |
| `blackmanWindow(N)` | 布莱克曼窗 |
| `flatTopWindow(N)` | 平顶窗 |
| `rectangularWindow(N)` | 矩形窗 |
| `kaiserWindow(N, beta)` | 凯塞窗 |
| `windowCoherentGain(type)` | 窗函数一致增益 |
| `getWindowFunction(name)` | 窗函数工厂 |
| `applyWindow(signal, type)` | 应用窗函数 |

### 4.3 滤波器

| 函数 | 说明 |
|------|------|
| `butterworthLowpass(order, cutoff, sampleRate)` | Butterworth 低通 |
| `butterworthBandpass(order, low, high, sampleRate)` | Butterworth 带通 |
| `butterworthHighpass(order, cutoff, sampleRate)` | Butterworth 高通 |
| `applyFilter(signal, coeffs)` | IIR 前向滤波 |
| `filtfilt(signal, coeffs)` | 零相移双向滤波 |

### 4.4 Hilbert 变换 / 包络

| 函数 | 说明 |
|------|------|
| `hilbertTransform(signal)` | Hilbert 变换 |
| `envelope(signal)` | 包络提取 |
| `instantaneousFrequency(signal, sampleRate)` | 瞬时频率 |
| `unwrapPhase(phase)` | 相位展开 |

### 4.5 倒频谱

| 函数 | 说明 |
|------|------|
| `powerCepstrum(signal)` | 功率倒频谱 |
| `realCepstrum(signal)` | 实倒频谱 |

### 4.6 时频分析

| 函数 | 说明 |
|------|------|
| `stft(signal, windowSize, hopSize, sampleRate)` | 短时傅里叶变换 |

### 4.7 统计特征

| 函数 | 说明 |
|------|------|
| `mean(data)` | 均值 |
| `variance(data)` | 方差 |
| `std(data)` | 标准差 |
| `standardDeviation(data)` | 标准差 (别名) |
| `rms(data)` | 有效值 |
| `peak(data)` | 峰值 |
| `peakToPeak(data)` | 峰峰值 |
| `kurtosis(data)` | 峭度 |
| `skewness(data)` | 偏度 |
| `shapeFactor(data)` | 波形因子 |
| `impulseFactor(data)` | 脉冲因子 |
| `clearanceFactor(data)` | 裕度因子 |
| `crestFactor(data)` | 峰值因子 |

### 4.8 熵特征

| 函数 | 说明 |
|------|------|
| `shannonEntropy(data)` | Shannon 信息熵 |
| `approximateEntropy(data, m, r)` | 近似熵 |
| `sampleEntropy(data, m, r)` | 样本熵 |

### 4.9 信号处理

| 函数 | 说明 |
|------|------|
| `resample(signal, originalRate, targetRate)` | 重采样 |
| `angularResample(signal, tachoPulses, pulsesPerRev, targetOrderResolution)` | 角度域重采样 |
| `autocorrelation(signal, maxLag)` | 自相关 |
| `crossCorrelation(signal1, signal2)` | 互相关 |

### 4.10 轴承 / 振动评估

| 函数 | 说明 |
|------|------|
| `bearingFaultFrequencies(bearing, shaftRPM)` | 轴承特征频率计算 (BPFI/BPFO/BSF/FTF) |
| `evaluateVibrationSeverity(velocityRMS, machineClass, standard)` | ISO 振动严重程度评估 |

### 4.11 线性代数

| 函数 | 说明 |
|------|------|
| `matrixMultiply(A, B)` | 矩阵乘法 |
| `matrixTranspose(A)` | 矩阵转置 |
| `svd(A)` | 奇异值分解 |
| `solveLinearSystem(A, b)` | 线性方程组求解 |
| `polyFit(x, y, degree)` | 多项式拟合 |
| `polyEval(coeffs, x)` | 多项式求值 |

### 4.12 复数运算

| 函数 | 说明 |
|------|------|
| `complexAdd(a, b)` | 复数加法 |
| `complexSub(a, b)` | 复数减法 |
| `complexMul(a, b)` | 复数乘法 |
| `complexAbs(c)` | 复数模 |
| `complexPhase(c)` | 复数辐角 |
| `complexConj(c)` | 复共轭 |
| `complexExp(theta)` | 复指数 |
| `complexLog(c)` | 复对数 |

### 4.13 工具

| 函数 | 说明 |
|------|------|
| `nextPow2(n)` / `nextPowerOf2(n)` | 下一个 2 的幂 |
| `zeroPad(data, length)` | 零填充 |

---

## 5. 统计汇总

### 5.1 按分类统计

| 分类 | 中文名 | 算法数 | 占比 |
|------|--------|--------|------|
| mechanical | 机械算法 | 8 | 16.3% |
| electrical | 电气算法 | 4 | 8.2% |
| structural | 结构算法 | 5 | 10.2% |
| anomaly_detection | 异常检测 | 4 | 8.2% |
| optimization | 优化算法 | 4 | 8.2% |
| comprehensive | 综合算法 | 4 | 8.2% |
| feature_extraction | 特征提取 | 5 | 10.2% |
| agent_plugin | Agent插件 | 6 | 12.2% |
| model_iteration | 模型迭代 | 4 | 8.2% |
| rule_learning | 规则学习 | 4 | 8.2% |
| — | **底层DSP函数** | **66** | — |
| **合计** | — | **49 算法 + 66 函数** | **100%** |

### 5.2 按算法类型统计

| 类型 | 数量 | 算法 ID |
|------|------|---------|
| **机理 (physics-based)** | 18 | fft_spectrum, cepstrum_analysis, envelope_demod, wavelet_packet, bandpass_filter, spectral_kurtosis, resampling, order_tracking, mcsa_analysis, partial_discharge, vfd_analysis, power_quality, miner_damage, acoustic_emission, modal_analysis, hot_spot_stress, rainflow_counting, physical_constraint_expert |
| **统计 (statistical)** | 15 | spc_control, pso_optimizer, genetic_algorithm, bayesian_optimization, simulated_annealing, ds_evidence_fusion, association_rules, causal_inference, condition_normalization, time_domain_features, statistical_features, spatial_anomaly_expert, prediction_expert, association_rule_learning, frequent_pattern_mining |
| **ML (machine learning)** | 10 | isolation_forest, lstm_anomaly, autoencoder_anomaly, deep_features, lora_finetuning, full_retraining, incremental_learning, model_distillation, decision_tree_induction, frequency_domain_features* |
| **混合 (hybrid)** | 3 | ts_pattern_expert, case_retrieval_expert, fusion_diagnosis_expert |
| **大模型 (LLM)** | 1 | llm_analysis |
| **机理+统计** | 2 | time_frequency_features, frequency_domain_features |

*frequency_domain_features 基于 FFT 机理但归类为特征工程

### 5.3 按边缘部署能力统计

| 状态 | 数量 | 不可部署的算法 |
|------|------|----------------|
| **可边缘部署** | 42 (85.7%) | — |
| **不可边缘部署** | 7 (14.3%) | lstm_anomaly, autoencoder_anomaly, deep_features, lora_finetuning, full_retraining, llm_analysis |

不可边缘部署的原因：需要 GPU 计算或大模型 API 调用。

### 5.4 调用方式统一性

| 调用方式 | 数量 | 说明 |
|----------|------|------|
| `AlgorithmEngine.execute()` | **49/49 (100%)** | 全部通过统一引擎调用 |
| tRPC API | 49/49 | 通过 `algorithm.service.ts` → `AlgorithmEngine` |
| 直接实例化 | 49/49 | 可 `new XxxAnalyzer()` 但不推荐 |
| HTTP / gRPC 独立端点 | **0** | 无独立 HTTP/gRPC 调用方式 |

### 5.5 标准化接口覆盖

| 项目 | 覆盖率 |
|------|--------|
| 实现 `IAlgorithmExecutor` | **49/49 (100%)** |
| 有 `validateInput()` | 49/49 |
| 有 `getDefaultConfig()` | 49/49 |
| 输出 `DiagnosisConclusion` | 49/49 |
| 有 `AlgorithmRegistration` 元数据 | 49/49 |
| 有参考标准 | 45/49 (91.8%) |
