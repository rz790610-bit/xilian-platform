# 微服务配置平台架构设计

> **版本**: v1.0 | **日期**: 2026-02-27 | **状态**: 设计阶段
> **目标**: 将核心能力拆分为 5 大独立可配置微服务，支持按客户定制、独立扩缩容、新设备零代码接入

---

## 一、总体架构

### 1.1 五大微服务拓扑

```
                        ┌──────────────────────────┐
                        │   API Gateway (Kong)      │
                        │   tRPC / REST / gRPC      │
                        └────────────┬─────────────┘
                                     │
         ┌──────────┬────────────────┼────────────┬─────────────┐
         │          │                │            │             │
    ┌────▼────┐ ┌───▼──────┐  ┌─────▼────┐ ┌────▼─────┐ ┌─────▼────┐
    │ MS-1    │ │ MS-2     │  │ MS-3     │ │ MS-4     │ │ MS-5     │
    │算法服务  │ │智能体诊断 │  │自进化服务 │ │AI推理服务│ │ 配置中心  │
    │ :3002   │ │  :3005   │  │  :3007   │ │  :3008   │ │  :3009   │
    └────┬────┘ └───┬──────┘  └────┬─────┘ └────┬─────┘ └────┬─────┘
         │          │              │             │            │
    ClickHouse  MySQL/CH      MySQL/Neo4j    Ollama/xAI   Redis/MySQL
    Redis       Redis         Redis          Redis        Redis
```

### 1.2 服务间通信

| 调用方 | 被调用方 | 协议 | 场景 |
|--------|---------|------|------|
| 智能体诊断 → 算法服务 | **gRPC** | 算法执行（低延迟、高吞吐） |
| 智能体诊断 → AI推理 | **HTTP** | LLM 推理请求 |
| 自进化 → 智能体诊断 | **HTTP** | 读取诊断历史 |
| 所有服务 → 配置中心 | **HTTP** + Redis Pub/Sub 缓存失效 | 配置读取 |
| 智能体诊断 → 自进化 | **Kafka** | `diagnosis.completed` 事件 |
| 自进化 → 配置中心 | **Kafka** | `evolution.crystal.approved` 规则更新 |

### 1.3 Kafka Topic 规划

```
sensor.data.ready              # 感知层 → 智能体诊断
diagnosis.completed            # 智能体诊断 → 自进化
algorithm.execution.completed  # 算法服务 → 指标采集
evolution.crystal.approved     # 自进化 → 配置中心
evolution.model.promoted       # 自进化 → 智能体诊断
inference.completed            # AI推理 → 指标采集
```

### 1.4 核心事件流

```
[传感器数据]
    │ Kafka: sensor.data.ready
    ▼
[智能体诊断服务]
    ├──(gRPC)──> [算法服务]    ─── 执行 FFT/包络/BPFO
    ├──(HTTP)──> [AI推理服务]  ─── Grok 推理
    ├──(HTTP)──> [配置中心]    ─── 获取融合配置
    │
    │ ← 汇聚结果 ←
    │
    ├── DS 融合（内部）
    ├── 物理约束校验（内部）
    │
    │ Kafka: diagnosis.completed
    ▼
[自进化服务]
    ├── 模式挖掘（批处理）
    ├── 知识结晶
    ├── 影子评估
    │
    │ Kafka: evolution.crystal.approved
    ▼
[配置中心]
    ├── 更新护栏规则
    ├── Redis Pub/Sub: config.changed
    ▼
[所有服务] ── 热加载新配置
```

---

## 二、MS-1：算法服务

### 2.1 定位

纯计算服务。接收传感器数据，执行信号处理和诊断算法，返回结构化结果。**无状态**（仅 LRU 缓存）。

### 2.2 现有代码映射

| 组件 | 文件路径 | 行数 | 封装难度 |
|------|---------|------|---------|
| IAlgorithmExecutor 接口 | `server/algorithms/_core/types.ts` | 149 | 直接封装 |
| AlgorithmEngine 单例 | `server/algorithms/_core/engine.ts` | 694 | 直接封装 |
| DSP 核心库（FFT/包络/倒谱/统计量） | `server/algorithms/_core/dsp.ts` | ~740 | 直接封装 |
| Worker 线程池 | `server/algorithms/_core/workerPool.ts` | ~300 | 直接封装 |
| 依赖注入接口 | `server/algorithms/_core/dependencies.ts` | ~454 | **小改**：设备信息查询改为 HTTP |
| 10 类算法（机械/电气/异常等） | `server/algorithms/mechanical/index.ts` 等 | ~8,977 | 直接封装 |
| 物理参数计算器（BPFO/BPFI/BSF/FTF） | `server/shared/.../physics-parameter-calculator.ts` | 62 | 直接封装 |

**核心能力**：

| 算法类别 | 代码量 | 关键算法 |
|---------|-------|---------|
| 机械特征 | 2,402 行 | FFT 频谱、倒谱、包络解调、小波包、阶次跟踪 |
| 异常检测 | 649 行 | IsolationForest、LSTM、Autoencoder、SPC(CUSUM/EWMA) |
| 电气特征 | 659 行 | 谐波失真、电流特征、THD、相位分析 |
| 结构特征 | 633 行 | 疲劳评估、应力集中、振动容限 |
| 特征提取 | 694 行 | 时域/频域特征、小波、熵 |
| 综合评估 | 721 行 | 多源融合、加权投票、严重度映射 |
| 优化算法 | 705 行 | 遗传算法、粒子群、Nelder-Mead |
| 规则学习 | 855 行 | 决策树、模糊逻辑、专家系统 |
| 模型迭代 | 670 行 | 神经网络训练、模型更新、版本管理 |
| Agent 插件 | 850 行 | 模式专家、案例检索、物理约束、融合专家 |

### 2.3 API 设计

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/v1/algorithms/execute` | 单算法执行 |
| POST | `/v1/algorithms/batch` | 批量串行执行 |
| POST | `/v1/algorithms/compose` | DAG 管线组合执行 |
| GET  | `/v1/algorithms/list` | 列出已注册算法（按分类/设备类型/标签过滤） |
| GET  | `/v1/algorithms/{id}/config` | 获取算法默认配置 |
| GET  | `/v1/algorithms/status` | 引擎状态和统计 |

### 2.4 客户级配置

```yaml
algorithm-service:
  # 全局默认
  dsp:
    workerPoolEnabled: true
    workerPoolSize: 4          # 默认 CPU-2
  cache:
    maxSize: 100               # LRU 缓存条目
    defaultTTL: 300000         # 5 分钟
  execution:
    defaultTimeoutMs: 60000
    maxHistorySize: 1000

  # 按客户定制
  customers:
    customer-a:                # 日照港 — 全功能
      enabledCategories: ["mechanical", "electrical", "anomaly", "structural"]
      customThresholds:
        vibration-spectrum:
          warningLevel: 4.5    # ISO 10816 B/C 界限
          criticalLevel: 7.1   # C/D 界限
        bearing-bpfo:
          harmonicCount: 5
      maxConcurrency: 10
    customer-b:                # 新客户 — 仅基础
      enabledCategories: ["mechanical"]
      maxConcurrency: 3
```

### 2.5 扩缩容特征

- **CPU 密集型**：FFT、包络分析、小波变换为计算密集
- **水平扩展**：无状态（LRU 缓存 miss 可接受，重算即可）
- **K8s HPA**：CPU 利用率 70%，min=2，max=8
- **资源配置**：2 CPU, 2GB RAM / Pod

---

## 三、MS-2：智能体诊断服务

### 3.1 定位

诊断流程编排。运行 HDE 双轨诊断（物理轨 + 数据轨），管理 DS 证据融合，调用算法服务和 AI 推理服务，持久化诊断结果。整个诊断管线的"大脑"。

### 3.2 现有代码映射

| 组件 | 文件路径 | 行数 | 封装难度 |
|------|---------|------|---------|
| HDE 诊断编排器 | `server/platform/hde/orchestrator/diagnostic-orchestrator.ts` | ~378 | 直接封装 |
| HDE 类型定义 | `server/platform/hde/types/index.ts` | ~403 | 直接封装 |
| DS 融合引擎 | `server/platform/cognition/engines/ds-fusion.engine.ts` | ~634 | 直接封装 |
| 融合诊断服务 | `server/platform/cognition/diagnosis/fusion-diagnosis.service.ts` | ~575 | **小改**：算法调用改为 gRPC |
| WorldModel | `server/platform/cognition/worldmodel/world-model.ts` | ~400 | 直接封装 |
| 跨设备对比器 | `server/platform/hde/comparator/cross-device-comparator.ts` | ~300 | 直接封装 |
| GrokDiagnosticAgent | `server/services/grokDiagnosticAgent.service.ts` | 1,138 | **大改** |
| HDE 数据库 Schema | `drizzle/hde-schema.ts` | 338 | 直接封装 |

### 3.3 GrokDiagnosticAgent 改造要点

**当前问题**：6 个 tool function 直接调用 `getDb()` 查询数据库，直接调用 xAI/Ollama API。

**改造方案**：
1. 5 个 tool function 中的 `getDb()` 直查 → 通过本服务内部 DAO 层访问
2. 直接调用 xAI/Ollama → 通过 AI 推理服务 HTTP 接口
3. 设备信息/传感器数据查询 → 通过内部 DAO 或 ClickHouse 读取

### 3.4 HDE 双轨诊断流程

```
┌─────────────────────────────────────────────────────┐
│              HDE DiagnosticOrchestrator              │
├─────────────────┬───────────────────────────────────┤
│  物理轨         │  数据轨                            │
│  (Physics)      │  (Data-driven)                    │
│                 │                                    │
│  物理模型       │  ML 模型                           │
│  约束校验       │  统计推断                           │
│  能量/力/材料   │  FFT/包络/异常检测                  │
├─────────────────┴───────────────────────────────────┤
│              DS 融合引擎                             │
│  策略: physics_veto | weighted | cascade            │
│  Dempster (默认) | Murphy (高冲突) | Yager (极端)    │
├─────────────────────────────────────────────────────┤
│  9 种故障假设:                                       │
│  bearing_damage | gear_wear | misalignment          │
│  imbalance | looseness | electrical_fault           │
│  structural_fatigue | corrosion | normal             │
├─────────────────────────────────────────────────────┤
│              物理约束最终校验                          │
│  类型: energy | force | material | temporal | logical│
└─────────────────────────────────────────────────────┘
```

### 3.5 API 设计

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/v1/diagnosis/execute` | HDE 双轨诊断 |
| POST | `/v1/diagnosis/grok` | Grok Agent 诊断 |
| POST | `/v1/diagnosis/fusion` | 四维融合诊断 |
| POST | `/v1/diagnosis/compare` | 跨设备横向对比 |
| GET  | `/v1/diagnosis/sessions` | 诊断会话列表 |
| GET  | `/v1/diagnosis/sessions/{id}` | 诊断详情（含轨道结果和融合日志） |

### 3.6 客户级配置

```yaml
agent-diagnostic-service:
  # 全局默认
  hde:
    enablePhysicsTrack: true
    enableDataTrack: true
    fusionStrategy: "physics_veto"
    physicsWeight: 0.6
    autoCrystallizeThreshold: 0.7
  dsFusion:
    defaultStrategy: "dempster"
    highConflictThreshold: 0.7
    extremeConflictThreshold: 0.95
  grok:
    enabled: true
    fallbackToOllama: true
    maxSteps: 8
    temperature: 0.3
    timeoutMs: 30000

  # 按客户定制
  customers:
    customer-a:
      fusionStrategy: "weighted"
      physicsWeight: 0.4
      enabledDimensions: ["safety", "health", "efficiency", "prediction"]
      grokEnabled: true
      maxDiagnosisPerDay: 1000
    customer-b:
      fusionStrategy: "physics_veto"
      enabledDimensions: ["safety", "health"]
      grokEnabled: false               # 不使用 Grok，仅规则诊断
      maxDiagnosisPerDay: 200
```

### 3.7 数据归属

此服务拥有以下数据库表：
- `hde_diagnosis_sessions` — 诊断会话
- `hde_track_results` — 物理轨/数据轨结果
- `hde_fusion_logs` — 融合日志

### 3.8 扩缩容特征

- **混合 I/O + CPU**：编排为 I/O 密集（等待算法服务、AI推理），融合数学为 CPU 轻负载
- **K8s HPA**：基于请求速率，min=2，max=6
- **资源配置**：1 CPU, 1GB RAM / Pod

---

## 四、MS-3：自进化服务

### 4.1 定位

管理整个进化飞轮：案例积累 → 模式发现 → 知识结晶 → 影子评估 → 灰度部署 → 规则优化。以**批处理/异步**模式为主。

### 4.2 现有代码映射

| 组件 | 文件路径 | 行数 | 封装难度 |
|------|---------|------|---------|
| 影子评估器 | `server/platform/evolution/shadow/shadow-evaluator.ts` | 487 | 直接封装（无状态） |
| 冠军挑战者 | `server/platform/evolution/champion/champion-challenger.ts` | 339 | **小改**：内存→Redis/MySQL |
| 知识结晶器 | `server/platform/evolution/crystallization/knowledge-crystallizer.ts` | 508 | 直接封装 |
| 结晶服务 | `server/platform/knowledge/services/crystal.service.ts` | 287 | **大改**：Map→MySQL |
| 统一结晶器 | `server/platform/hde/crystallization/unified-crystallizer.ts` | ~200 | 直接封装 |
| 进化指标 | `server/platform/evolution/metrics/evolution-metrics.ts` | ~200 | 直接封装 |
| 闭环追踪器 | `server/platform/evolution/closed-loop/closed-loop-tracker.ts` | ~200 | 直接封装 |
| 数据引擎 | `server/platform/evolution/data-engine/data-engine.ts` | ~200 | 直接封装 |
| 进化 Schema | `drizzle/evolution-schema.ts` | ~500+ | 直接封装 |

### 4.3 改造要点

**ChampionChallengerManager**：当前内存存储 `Map<string, ModelRegistryEntry>` + `activePlan`，需持久化到 Redis（活跃部署计划）+ MySQL（回滚历史）。

**CrystalService**：当前 `Map<number, CrystalRecord>` 内存存储，带有 `// TODO: INSERT INTO knowledge_crystals` 注释。改为使用 `drizzle/hde-schema.ts` 中已定义的 `hde_knowledge_crystals` 表。

### 4.4 灰度部署 5 阶段（已实现）

```
┌──────────┬────────┬──────────┬──────────┐
│ 阶段     │ 流量   │ 持续时间  │ 回滚阈值  │
├──────────┼────────┼──────────┼──────────┤
│ Shadow   │ 0%     │ 24h      │ 任何错误  │
│ Canary   │ 5%     │ 48h      │ >5%      │
│ Gray     │ 20%    │ 72h      │ >3%      │
│ Half     │ 50%    │ 48h      │ >2%      │
│ Full     │ 100%   │ -        │ >1%      │
└──────────┴────────┴──────────┴──────────┘
```

### 4.5 影子评估维度

| 维度 | 指标 |
|------|------|
| 准确性 | MAE, RMSE, MAPE, R² |
| 异常检测 | Precision, Recall, F1, AUC |
| 延迟 | P50, P95, P99 (ms) |
| 资源 | 峰值内存(MB), 平均CPU(%) |
| 安全 | 护栏触发率, 误报率, 漏报率 |

**晋升逻辑**：>=3 维度显著改善 + 0 退化 → 晋升；>=2 退化 → 拒绝；安全检查：漏报率不可增加。

### 4.6 知识结晶 5 大物理模式（已实现）

| 模式 | 触发条件 | 物理机理 |
|------|---------|---------|
| 风载+偏心→疲劳加速 | 风速>9m/s AND 偏心>0.3 | M=½ρv²Ah/2 + 偏心力矩 |
| 轴承退化 | 温度>55°C AND 振动>2.0mm/s | 润滑失效→摩擦↑+间隙↑ |
| 载荷效率衰减 | 重量>30吨 | 电机负载+机械阻力 |
| 季节性腐蚀 | 湿度>80% | r=k[Cl⁻][humidity] |
| 连续运行疲劳 | 5+次连续低健康评分 | 疲劳累积>恢复能力 |

### 4.7 API 设计

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/v1/evolution/patterns/discover` | 触发模式挖掘 |
| GET  | `/v1/evolution/patterns` | 已发现模式列表 |
| POST | `/v1/evolution/patterns/{id}/crystallize` | 结晶为规则/三元组/阈值 |
| POST | `/v1/evolution/patterns/{id}/approve` | 审批/拒绝模式 |
| GET  | `/v1/evolution/crystals` | 知识结晶列表 |
| POST | `/v1/evolution/crystals/{id}/review` | 审核结晶 |
| POST | `/v1/evolution/shadow/evaluate` | 触发影子评估 |
| GET  | `/v1/evolution/shadow/reports` | 评估报告列表 |
| POST | `/v1/evolution/deployment/plan` | 创建部署计划 |
| POST | `/v1/evolution/deployment/advance` | 推进部署阶段 |
| POST | `/v1/evolution/deployment/rollback` | 回滚 |
| GET  | `/v1/evolution/deployment/active` | 当前活跃部署计划 |
| POST | `/v1/evolution/migration/suggest` | 跨场景迁移建议 |

### 4.8 客户级配置

```yaml
evolution-service:
  flywheel:
    intervalMs: 604800000          # 7 天
    autoStart: false
  shadow:
    datasetSize: 1000
    evaluationRounds: 3
    significanceLevel: 0.05
    minImprovementPercent: 5
    enableSafetyCheck: true
  deployment:
    stages:     # 见 4.4 五阶段表
  crystallization:
    minConfidence: 0.7
    minSupport: 0.05
    autoApprove: false             # 默认需人工审核

  customers:
    customer-a:
      flywheel.autoStart: true
      crystallization.autoApprove: true   # 成熟客户，信任自动审批
      deployment.maxTrafficPercent: 50
    customer-b:
      flywheel.autoStart: false           # 新客户，手动触发
      shadow.datasetSize: 500             # 较小数据集
      crystallization.autoApprove: false
```

### 4.9 扩缩容特征

- **批处理为主**：模式挖掘和影子评估为周期性批作业
- **K8s CronJob**：定时飞轮执行
- **资源配置**：0.5 CPU, 512MB RAM / Pod，评估期间可突发到 2 CPU
- **min=1, max=3**

---

## 五、MS-4：AI 推理服务

### 5.1 定位

统一 LLM 网关。路由推理请求到合适的 Provider，管理重试/降级、速率限制、Token 预算、模型生命周期。所有其他服务的 AI 需求统一通过此服务。

### 5.2 现有代码映射

| 组件 | 文件路径 | 行数 | 封装难度 |
|------|---------|------|---------|
| LLM 抽象层 | `server/core/llm.ts` | 431 | 直接封装 |
| Ollama 配置 | `server/core/config.ts` (L406-422) | ~16 | 直接封装 |
| xAI/Grok 配置 | `server/core/config.ts` (L425-455) | ~30 | 直接封装 |
| Agent 注册表 | `server/core/agent-registry.ts` | ~200 | 直接封装 |

### 5.3 Provider 降级链

```
Forge API (priority=1)
    │ 失败
    ▼
xAI Grok (priority=2)
    │ 失败
    ▼
Ollama 本地 (priority=3)

每级: 指数退避重试 (1s → 2s → 4s, 最多 3 次)
```

### 5.4 API 设计（OpenAI 兼容格式）

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/v1/inference/chat` | Chat Completion |
| POST | `/v1/inference/structured` | 结构化输出（JSON Schema 强制） |
| POST | `/v1/inference/tools` | Tool Calling 推理 |
| POST | `/v1/inference/embeddings` | 生成 Embedding（RAG 用） |
| GET  | `/v1/inference/models` | 可用模型列表 |
| GET  | `/v1/inference/health` | 各 Provider 健康状态 |

### 5.5 客户级配置

```yaml
ai-inference-service:
  providers:
    forge:
      apiUrl: ${BUILT_IN_FORGE_API_URL}
      apiKey: ${BUILT_IN_FORGE_API_KEY}
      priority: 1
    xai:
      apiUrl: "https://api.x.ai/v1"
      apiKey: ${XAI_API_KEY}
      model: "grok-3"
      maxTokens: 4096
      temperature: 0.7
      timeout: 30000
      maxConcurrency: 10
      rateLimitPerMinute: 60
      priority: 2
    ollama:
      host: "ollama"
      port: 11434
      model: "qwen2.5:7b"
      defaultEmbed: "nomic-embed-text"
      autoInit: true
      priority: 3
  routing:
    default: "forge"
    fallbackChain: ["forge", "xai", "ollama"]
    diagnosticModel: "grok-3"
    embeddingModel: "nomic-embed-text"
  retry:
    maxRetries: 3
    baseDelayMs: 1000

  customers:
    customer-a:
      tokenBudgetPerMonth: 1000000
      allowedModels: ["grok-3", "qwen2.5:7b"]
      maxConcurrency: 5
      preferredProvider: "xai"
    customer-b:
      tokenBudgetPerMonth: 500000
      allowedModels: ["qwen2.5:7b"]       # 仅 Ollama — 成本敏感
      maxConcurrency: 2
      preferredProvider: "ollama"
```

### 5.6 扩缩容特征

- **I/O 密集型**：等待外部 API 响应
- **受限于外部速率**：Token/请求限制
- **K8s HPA**：基于请求队列深度，min=2，max=4
- **资源配置**：0.5 CPU, 512MB RAM / Pod

---

## 六、MS-5：配置中心

### 6.1 定位

所有运行时配置的**唯一真实来源**。管理客户级服务开关、阈值参数、特性标志、设备类型模板、配置版本管理。

### 6.2 现有代码映射

| 组件 | 文件路径 | 行数 | 封装难度 |
|------|---------|------|---------|
| DynamicConfigEngine | `server/platform/config/dynamic-config.ts` | 502 | 直接封装 |
| 模块特性标志 | `server/core/moduleFeatureFlags.ts` | ~100 | 直接封装 |
| 设备类型注册表 | `server/core/registries/device-type.registry.ts` | 380 | 直接封装 |
| BaseRegistry 泛型模式 | `server/core/registry.ts` | 333 | 直接封装 |
| 事件总线 | `server/platform/events/event-bus.ts` | 338 | **小改**：需 Redis Pub/Sub 后端 |

### 6.3 三级配置继承（DynamicConfigEngine 已实现）

```
global:*:key                   ← 平台默认值
  └── profile:customer-a:key   ← 客户级覆盖
        └── equipment:CRANE-001:key  ← 设备级覆盖
```

查询时自动继承：设备级 > 客户级 > 全局，逐级 fallback。

### 6.4 API 设计

| 方法 | 端点 | 说明 |
|------|------|------|
| GET  | `/v1/config/{key}?scope=&scopeId=` | 获取配置（支持继承） |
| PUT  | `/v1/config/{key}` | 设置配置 |
| PUT  | `/v1/config/batch` | 批量设置 |
| GET  | `/v1/config/list?scope=&scopeId=` | 列出配置 |
| POST | `/v1/config/versions` | 创建版本快照 |
| POST | `/v1/config/rollback/{version}` | 回滚到指定版本 |
| GET  | `/v1/config/versions/diff?v1=&v2=` | 版本对比 |
| GET  | `/v1/config/flags` | 特性标志列表 |
| PUT  | `/v1/config/flags/{key}` | 更新特性标志 |
| GET  | `/v1/config/device-types` | 设备类型模板列表 |
| POST | `/v1/config/device-types` | 注册新设备类型 |
| GET  | `/v1/config/export` | 导出全量配置 |
| POST | `/v1/config/import` | 导入配置 |

### 6.5 变更传播机制

```
写入 → 内存更新 → Redis 同步 → Pub/Sub config.changed:{key}
                                       │
                ┌──────────────────────┼──────────────────────┐
                ▼                      ▼                      ▼
          算法服务                智能体诊断              自进化服务
        (本地缓存失效)          (重载融合配置)          (更新飞轮参数)
```

### 6.6 扩缩容特征

- **读多写少**：配置读取远大于写入
- **单写多读**：写入通过此服务；读取可客户端缓存
- **K8s**：固定 2 副本（Redis 缓存 + Pub/Sub 保证 HA）
- **资源配置**：0.25 CPU, 256MB RAM / Pod

---

## 七、客户配置 Schema（完整示例）

```json
{
  "customerId": "customer-a",
  "name": "日照港",
  "tier": "enterprise",
  "services": {
    "algorithm": {
      "enabled": true,
      "enabledCategories": ["mechanical", "electrical", "anomaly", "structural"],
      "customThresholds": {
        "vibration-spectrum": { "warningLevel": 4.5, "criticalLevel": 7.1 },
        "bearing-bpfo": { "harmonicCount": 5 }
      }
    },
    "agentDiagnostic": {
      "enabled": true,
      "fusionStrategy": "physics_veto",
      "physicsWeight": 0.6,
      "enabledDimensions": ["safety", "health", "efficiency", "prediction"],
      "grokEnabled": true,
      "maxDiagnosisPerDay": 1000
    },
    "evolution": {
      "enabled": true,
      "flywheel": { "autoStart": true, "intervalDays": 7 },
      "crystallization": { "autoApprove": false, "minConfidence": 0.7 },
      "deployment": { "canaryEnabled": true, "maxTrafficPercent": 50 }
    },
    "aiInference": {
      "enabled": true,
      "allowedModels": ["grok-3", "qwen2.5:7b"],
      "tokenBudgetPerMonth": 1000000,
      "maxConcurrency": 5,
      "preferredProvider": "xai"
    }
  },
  "devices": {
    "registeredTypes": ["quay_crane", "rtg_crane", "forklift"],
    "customDeviceTypes": [
      {
        "id": "quay_crane_zpmc_sts",
        "extends": "quay_crane",
        "manufacturer": "ZPMC",
        "additionalTelemetry": [
          { "name": "boom_angle", "unit": "deg", "alertThreshold": { "warning": 75, "critical": 85 } }
        ],
        "algorithmMapping": {
          "vibration": ["vibration-spectrum", "bearing-bpfo", "bearing-bpfi"],
          "electrical": ["motor-current-spectrum", "power-factor-analysis"]
        }
      }
    ]
  }
}
```

---

## 八、新设备零代码接入流程

### Step 1：注册设备类型（如有新类型）

```http
POST /v1/config/device-types
{
  "id": "quay_crane_liebherr_sts",
  "extends": "quay_crane",
  "manufacturer": "Liebherr",
  "properties": {
    "maxSWL": { "type": "number", "unit": "tonnes", "default": 65 },
    "boomLength": { "type": "number", "unit": "m", "default": 60 }
  },
  "telemetry": [
    { "name": "vibration_x", "type": "vibration", "sampleRate": 1024 },
    { "name": "temperature_bearing", "type": "temperature", "sampleRate": 1 }
  ],
  "supportedProtocols": ["mqtt", "opcua"],
  "algorithmMapping": {
    "vibration": ["vibration-spectrum", "bearing-bpfo", "envelope-demod"],
    "electrical": ["motor-current-spectrum"]
  }
}
```

→ DeviceTypeRegistry 创建新条目
→ Redis Pub/Sub 通知所有服务

### Step 2：配置设备实例

```http
PUT /v1/config/equipment:CRANE-005
{
  "deviceType": "quay_crane_liebherr_sts",
  "customerId": "customer-a",
  "protocols": ["mqtt"],
  "mqttTopic": "port-a/cranes/005/+",
  "sensorMapping": {
    "vibration_x": { "sensorId": "S-V001", "channel": 0 },
    "temperature_bearing": { "sensorId": "S-T003", "channel": 0 }
  },
  "algorithmProfile": {
    "primary": ["vibration-spectrum", "bearing-bpfo"],
    "scheduled": ["fatigue-sn-curve"],
    "thresholds": {
      "vibration-spectrum.warningLevel": 5.0,
      "bearing-bpfo.harmonicCount": 4
    }
  },
  "diagnosisProfile": {
    "fusionStrategy": "physics_veto",
    "physicsConstraints": ["energy_conservation", "force_balance"],
    "baselineCycleTime": 130
  }
}
```

### Step 3：验证并激活

```http
POST /v1/config/device-types/quay_crane_liebherr_sts/validate
→ 校验引用的算法是否存在于算法服务
→ 校验传感器映射完整性
→ 校验协议适配器可用

PUT /v1/config/equipment:CRANE-005.active = true
→ 配置中心发布 config.changed
→ 智能体诊断服务自动接管新设备
→ 算法服务自动识别该设备应执行的算法
```

### 零代码接入的关键支撑

| 能力 | 实现方式 |
|------|---------|
| 设备类型可扩展 | DeviceTypeRegistry 支持运行时 `register()` |
| 算法映射配置化 | `applicableDeviceTypes` 元数据字段 |
| 协议适配器配置化 | 18 个 BaseAdapter 子类，连接参数为 `Record<string, unknown>` |
| 诊断策略配置化 | fusionStrategy、physicsConstraints 均为设备级配置 |
| 阈值参数配置化 | 三级继承（全局 > 客户 > 设备）覆盖 |

---

## 九、代码封装就绪度总评

### 9.1 可直接封装（仅需加 Controller 层）

| 模块 | 代码量 | 原因 |
|------|-------|------|
| AlgorithmEngine + 50+ 算法 | ~9,700 行 | 干净的 IAlgorithmExecutor 接口，单例模式，Worker 池 |
| DSP 核心库 | ~740 行 | 纯函数，零外部依赖 |
| DS 融合引擎 | ~634 行 | 纯计算，配置驱动 |
| DynamicConfigEngine | ~502 行 | 已有完整 CRUD/版本/回滚/Watch |
| ShadowEvaluator | ~487 行 | 无状态，输入模型+数据集→输出报告 |
| KnowledgeCrystallizer | ~508 行 | 5 个物理模式发现函数，纯逻辑 |
| LLM 抽象层 | ~431 行 | Provider 链 + 重试 + 配置驱动 |
| HDE 类型定义 | ~403 行 | 完整类型，可复用为服务间契约 |
| WorldModel | ~400 行 | 状态预测引擎，无 I/O 依赖 |
| BaseRegistry + 所有注册表 | ~700 行 | 干净泛型模式 |

### 9.2 需小改（修改依赖注入或数据访问）

| 模块 | 改动内容 | 工作量 |
|------|---------|-------|
| AlgorithmDependencies | 设备信息查询改为 HTTP 调用 | 1-2 天 |
| ChampionChallengerManager | 内存状态持久化到 Redis/MySQL | 2-3 天 |
| FusionDiagnosisService | 算法调用改为 gRPC 代理 | 1-2 天 |
| EventBus | 内存 Pub/Sub 需 Redis 后端 | 1-2 天 |

### 9.3 需大改

| 模块 | 改动内容 | 工作量 |
|------|---------|-------|
| GrokDiagnosticAgent (1,138行) | 6 个 tool function 的 `getDb()` → DAO 层；LLM → AI推理服务 | 1-2 周 |
| CrystalService (287行) | `Map` 内存 → MySQL 持久化（Schema 已存在） | 2-3 天 |

---

## 十、部署拓扑

### 10.1 与现有基础设施对接

现有 `docker-compose.microservices.yml` 已定义 7 服务分解，映射关系：

| 新服务 | 对应现有服务 | 端口 | gRPC 端口 |
|--------|------------|------|----------|
| 算法服务 | `algorithm-service` | 3002 | 50052 |
| 智能体诊断服务 | `monitoring-service`（改造） | 3005 | 50055 |
| 自进化服务 | **新增** | 3007 | 50057 |
| AI 推理服务 | **新增** | 3008 | 50058 |
| 配置中心 | 从 `infra-service` 拆出 | 3009 | 50059 |

### 10.2 K8s 资源规划

| 服务 | Min 副本 | Max 副本 | CPU 请求 | 内存请求 | HPA 指标 |
|------|---------|---------|---------|---------|---------|
| 算法服务 | 2 | 8 | 1.0 | 1Gi | CPU 70% |
| 智能体诊断 | 2 | 6 | 0.5 | 512Mi | 请求速率 |
| 自进化服务 | 1 | 3 | 0.5 | 512Mi | 作业队列 |
| AI 推理服务 | 2 | 4 | 0.25 | 256Mi | 请求队列 |
| 配置中心 | 2 | 2 | 0.25 | 256Mi | 固定 |

### 10.3 数据库归属

| 服务 | 拥有的数据 | 存储 |
|------|-----------|------|
| 算法服务 | 无（纯计算） | LRU 缓存 |
| 智能体诊断 | 诊断会话/轨道结果/融合日志 | MySQL + ClickHouse(读) |
| 自进化服务 | 进化模型/部署计划/知识结晶 | MySQL + Neo4j |
| AI 推理服务 | Token 用量统计 | Redis |
| 配置中心 | 全量配置/版本历史/设备类型 | Redis + MySQL |

---

## 十一、迁移策略（Strangler Fig 绞杀者模式）

### Phase 0 — 基础准备（2 周）

- 部署配置中心为独立服务（DynamicConfigEngine 已就绪，最低改造量）
- 单体代码通过 HTTP（本地缓存）读取配置，静态 `config.ts` 保留为引导/降级
- 建立 Kafka Topic 和 Redis Pub/Sub Channel
- 部署 API Gateway（Kong，已有 `config.kong.adminUrl` 配置）

### Phase 1 — 抽取算法服务（3 周）

- AlgorithmEngine + 10 类算法已自包含，仅需加 gRPC Controller
- 单体中 `algorithmEngine` 直接调用 → gRPC Client 调用
- 特性标志切换：`MODULE_ALGORITHM_REMOTE=true`

### Phase 2 — 抽取 AI 推理服务（2 周）

- 包装 `invokeLLM()` 为 HTTP API
- 单体中所有 LLM 调用 → HTTP Client 调用
- Ollama 作为 Sidecar / 独立 Pod

### Phase 3 — 抽取智能体诊断服务（4 周，最复杂）

- 重构 GrokDiagnosticAgent：DB 直查 → DAO 层
- HDE 表数据归属迁移
- 对接算法服务(gRPC) + AI推理服务(HTTP)

### Phase 4 — 抽取自进化服务（3 周）

- ChampionChallenger 状态持久化
- CrystalService MySQL 化
- 建立 Kafka Consumer 消费 `diagnosis.completed`
- 定时模式挖掘作业（K8s CronJob）

### Phase 5 — 退役单体路由（2 周）

- API Gateway 逐步切流（Kong rate limiting + request routing）
- 保留单体只读模式 2 周作安全网
- 现有 Prometheus/Grafana/Jaeger 监控全程覆盖

**总迁移周期：约 16 周（4 个月）**

---

## 十二、关键架构决策

| 决策 | 理由 |
|------|------|
| 算法服务用 gRPC | 唯一在关键路径上的高吞吐低延迟需求（传感器→FFT < 100ms），二进制序列化 + HTTP/2 多路复用 |
| 进化用 Kafka 而非直接 HTTP | 诊断结果→模式挖掘天然异步，Kafka 提供持久存储、回放和背压 |
| 配置中心独立部署 | DynamicConfigEngine 已有版本管理/回滚，独立部署确保单一真实来源和原子版本快照 |
| AI 推理独立于诊断 | Token 预算独立管理、集中限流、Provider 故障隔离、推理与编排独立扩缩 |
| 物理约束优先 | 符合平台核心原则"物理约束优先于数据驱动结论"，HDE fusionStrategy 默认 `physics_veto` |
| Strangler Fig 迁移 | 渐进式抽取，每步可验证可回滚，零停机迁移 |

---

## 附录 A：关键文件索引

| 服务 | 核心文件 |
|------|---------|
| **算法服务** | `server/algorithms/_core/engine.ts`, `server/algorithms/_core/dsp.ts`, `server/algorithms/_core/types.ts`, `server/algorithms/_core/workerPool.ts`, `server/algorithms/mechanical/index.ts` (+9 类) |
| **智能体诊断** | `server/platform/hde/orchestrator/diagnostic-orchestrator.ts`, `server/platform/hde/types/index.ts`, `server/platform/cognition/engines/ds-fusion.engine.ts`, `server/services/grokDiagnosticAgent.service.ts`, `drizzle/hde-schema.ts` |
| **自进化** | `server/platform/evolution/shadow/shadow-evaluator.ts`, `server/platform/evolution/champion/champion-challenger.ts`, `server/platform/evolution/crystallization/knowledge-crystallizer.ts`, `server/platform/knowledge/services/crystal.service.ts`, `drizzle/evolution-schema.ts` |
| **AI 推理** | `server/core/llm.ts`, `server/core/config.ts` (L406-455), `server/core/agent-registry.ts` |
| **配置中心** | `server/platform/config/dynamic-config.ts`, `server/core/moduleFeatureFlags.ts`, `server/core/registries/device-type.registry.ts`, `server/core/registry.ts`, `server/platform/events/event-bus.ts` |
