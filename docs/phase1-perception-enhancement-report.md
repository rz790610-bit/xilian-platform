# Phase 1 感知层增强 — 实施报告

## 概述

本次 Phase 1 实施完成了感知层的核心增强，涵盖 6 个主要工作项，新增/重写约 2500 行生产级代码，所有文件通过 TypeScript 编译检查（零类型错误）。

---

## 一、新增文件清单

| 序号 | 文件路径 | 行数 | 职责 |
|------|---------|------|------|
| 1 | `server/platform/perception/fusion/bpa.types.ts` | 268 | BPA 类型定义、模糊函数参数、适配器函数 |
| 2 | `server/platform/perception/fusion/bpa-builder.ts` | 709 | BPA 构建器：三种模糊隶属度函数、配置管理、追溯日志 |
| 3 | `server/platform/perception/encoding/state-vector-synthesizer.ts` | ~540 | 状态向量合成器：ClickHouse → 21D 向量 |
| 4 | `server/platform/perception/services/perception-persistence.service.ts` | ~310 | DB 持久化服务：配置加载/保存、日志归档 |

## 二、修改文件清单

| 序号 | 文件路径 | 变更类型 | 说明 |
|------|---------|---------|------|
| 1 | `server/platform/perception/fusion/ds-fusion-engine.ts` | **重写** | 合并为统一适配器，委托认知层引擎，新增 `fuseWithBPABuilder()` |
| 2 | `server/platform/perception/perception-pipeline.ts` | **重写** | 集成 BPABuilder + StateVectorSynthesizer + EvidenceLearner |
| 3 | `server/platform/perception/fusion/index.ts` | 更新 | 新增 BPABuilder 和 bpa.types 导出 |
| 4 | `server/platform/perception/index.ts` | 更新 | 新增所有 Phase 1 模块导出 |
| 5 | `drizzle/evolution-schema.ts` | 追加 | 新增 3 张 DB 表定义 |
| 6 | `server/domains/perception/perception.domain-router.ts` | **重写** | 新增 bpaConfig、dimension 路由 + 统计端点 |

## 三、核心实现细节

### 3.1 BPABuilder（C2/C3）

**解决的问题**：原 `perception-pipeline.ts` 中的 `buildEvidences()` 方法硬编码了 5 个证据源的 BPA 构建逻辑，无法配置、无法追溯。

**实现方案**：
- 三种模糊隶属度函数：梯形（Trapezoidal）、三角形（Triangular）、高斯（Gaussian）
- 配置从 DB 加载（`bpa_configs` 表），支持前端编辑和热更新
- 每次构建产生 `BpaConstructionLog`，支持审计追溯
- 工厂函数 `createDefaultCraneBpaConfig()` 提供岸桥默认配置（5 源 × 4 假设 = 20 条规则）
- 纯计算类，无 IO 依赖，可独立单元测试

**数学基础**：
```
rawMembership_i = μ(x; params_i)     // 模糊隶属度
totalRaw = Σ rawMembership_i
m(hypothesis_i) = rawMembership_i / totalRaw * (1 - ignoranceBase)
ignorance = 1 - Σ m(A)
```

### 3.2 DS 融合引擎合并（C1）

**解决的问题**：感知层和认知层各有一个 DS 引擎，功能重叠，维护成本高。

**实现方案**：
- 认知层 `DSFusionEngine`（634 行）保留为权威实现
- 感知层 `ds-fusion-engine.ts` 重写为适配器层
- 保持原有 `BPA` 接口（`masses: Map<string, number>`）向后兼容
- 新增 `fuseWithBPABuilder()` 方法，直接接受 `BasicProbabilityAssignment`
- 新增 `EnhancedFusionResult` 类型，包含 `decision`、`confidence`、`cognitiveOutput`

### 3.3 StateVectorSynthesizer（C4）

**解决的问题**：原 `StateVectorEncoder` 需要手动传入所有维度值，无法自动从 ClickHouse 拉取。

**实现方案**：
- 21 维状态向量，分三组：
  - `cycle_features`（0-7）：单次作业周期特征
  - `uncertainty_factors`（8-14）：不确定性因子
  - `cumulative_metrics`（15-20）：累积退化指标
- 从 ClickHouse `telemetry_data` 表查询多测点时序数据
- 支持 7 种聚合方法：mean, max, min, rms, latest, sum, std
- 归一化到 [0, 1] 范围
- 维度定义从 DB 加载（`state_vector_dimensions` 表），支持前端编辑
- 质量评估：completeness、freshnessSeconds、missingDimensions

### 3.4 DB Schema（3 张新表）

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `bpa_configs` | BPA 模糊隶属度规则配置 | hypotheses(JSON), rules(JSON), ignoranceBase, version |
| `state_vector_dimensions` | 状态向量维度定义 | dimensionIndex, metricNames(JSON), aggregation, normalizeRange |
| `state_vector_logs` | 状态向量合成日志 | dimensionValues(JSON), normalizedValues(JSON), completeness, bpaLog(JSON) |

### 3.5 感知管线重构

**新增方法**：
- `synthesizeAndFuse(machineId, cumulativeData)` — Phase 1 核心入口
  - ClickHouse → 21D Vector → SensorStats → BPA → DS Fusion
- `updateBpaConfig(config, version)` — BPA 配置热更新
- `updateDimensionDefs(dimensions)` — 维度定义热更新
- `exportTracingLogs()` — 导出追溯日志用于 DB 归档
- `getLatestSynthesizedVector(machineId)` — 获取最新合成向量

**保留的向后兼容**：
- `processAndEmit()` 方法签名不变，内部已改用 BPABuilder
- `ingestSamples()` 方法不变
- `getStats()` 扩展了 Phase 1 统计字段

### 3.6 API 端点

新增 2 个路由组 + 1 个 Facade 方法：

**`perception.bpaConfig.*`**：
- `list` — 列出 BPA 配置
- `load` — 加载指定设备类型配置
- `save` — 保存配置
- `toggleEnabled` — 启用/禁用
- `seedDefaults` — 初始化种子数据

**`perception.dimension.*`**：
- `list` — 列出维度定义
- `load` — 加载指定设备类型维度
- `saveBatch` — 批量保存
- `toggleEnabled` — 启用/禁用

**`perception.stateVector.getLogs`** — 查询状态向量日志

**`perception.getPerceptionEnhancementStats`** — Phase 1 仪表盘统计

## 四、数据流架构

```
边缘层 (100kHz)
  → RingBuffer → AdaptiveSampler → FeatureVector
    → StateVectorSynthesizer (ClickHouse 21D)
      → BPABuilder (模糊隶属度 → BPA)
        → DSFusionEngine (DS 融合 → 决策)
          → EvidenceLearner (Bayesian 权重自学习)
            → StateVectorEncoder → EventBus → 认知层
```

## 五、编译状态

所有新增/修改文件通过 TypeScript 5.9.3 编译检查，**零类型错误**。

## 六、后续工作

1. **数据库迁移**：运行 drizzle-kit 生成迁移文件并执行
2. **种子数据**：调用 `perception.bpaConfig.seedDefaults` 初始化默认配置
3. **前端集成**：在感知监控页面添加 BPA 配置编辑器和维度管理界面
4. **性能测试**：验证 ClickHouse 查询延迟和 21D 合成吞吐量
5. **Phase 2 准备**：认知层推理引擎增强
