# 商用级基础设施架构设计文档

> 版本: 1.0.0 | 日期: 2026-03-02 | 分支: feature/hde-v3-phase0

---

## 设计原则

| 原则 | 含义 |
|------|------|
| **商用级** | 每个组件都有 SLA、错误处理、监控、降级方案 |
| **可升级迭代** | 版本化、向后兼容、灰度发布、回滚能力 |
| **快速扩展** | 插件化、事件驱动、契约先行、低耦合 |

---

## 1. Agent 架构设计

### 1.1 现状诊断

当前存在**两套独立工具系统**：

| 系统 | 位置 | 工具数 | 状态 |
|------|------|--------|------|
| GrokTool | `cognition/grok/grok-tools.ts` | 12 | 仅 2/12 实现 |
| ToolDefinition | `tooling/framework/tool-framework.ts` | 7 | 多为 mock 数据 |

**核心问题**: 两套接口不互通，无版本协商，ReAct 链无回放能力，EventBus 未接入。

### 1.2 商用架构设计

```
┌─────────────────────────────────────────────────────┐
│                  Unified Tool Registry               │
│  ┌───────────┐  ┌───────────┐  ┌─────────────────┐  │
│  │ GrokTool  │  │ Platform  │  │  Plugin Tool     │  │
│  │ Adapter   │  │ Tool      │  │  (Sandbox)       │  │
│  └─────┬─────┘  └─────┬─────┘  └───────┬─────────┘  │
│        └───────────────┼────────────────┘            │
│                   ToolContract v1                     │
│  { id, version, inputSchema, outputSchema,           │
│    category, permissions, sla, circuitBreaker }      │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              ReAct Execution Engine                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Planning │→│ Execution │→│ Result Bridge      │  │
│  │ (Reason) │  │ (Act)    │  │ ToolResult→       │  │
│  │          │  │          │  │ DSEvidence         │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
│  Circuit Breaker: 5次失败/30s → 半开 → 恢复          │
│  Chain Replay: 完整 step 序列化 + Mermaid 可视化     │
└──────────────────────┬──────────────────────────────┘
                       │
           ┌───────────▼───────────┐
           │    Audit + Trace      │
           │  OTel span per step   │
           │  MySQL 持久化链路     │
           │  Kafka 事件发布       │
           └───────────────────────┘
```

### 1.3 关键接口

```typescript
/** 统一工具契约 — 合并 GrokTool + ToolDefinition */
interface ToolContract {
  id: string;
  version: string;                    // SemVer
  name: string;
  description: string;
  category: 'query' | 'analyze' | 'execute' | 'integrate';
  inputSchema: ZodSchema;
  outputSchema: ZodSchema;
  permissions: string[];
  sla: { timeoutMs: number; maxRetries: number };
  circuitBreaker: { threshold: number; resetMs: number };
  execute(input: unknown, ctx: ToolExecutionContext): Promise<ToolResult>;
}

/** 工具执行结果 → 诊断证据桥接 */
interface ToolResult {
  toolId: string;
  version: string;
  success: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
  traceId: string;
}

function toolResultToDSEvidence(result: ToolResult): DSEvidence {
  return {
    sourceType: 'tool',
    sourceId: result.toolId,
    confidence: result.success ? 0.85 : 0,
    data: result.output,
    timestamp: Date.now(),
    traceId: result.traceId,
  };
}
```

### 1.4 复用分析

| 组件 | 决策 | 理由 |
|------|------|------|
| `grok-tool-calling.ts` ReAct 循环 | **复用** | 核心循环稳定，仅需添加熔断 |
| `tool-framework.ts` 执行引擎 | **复用** | 权限/审计/超时已完善 |
| `grok-tools.ts` 12 个工具定义 | **重写** | 10/12 为 stub，需统一接口 |
| `ReasoningChainManager` | **复用+增强** | 添加 replay API |

---

## 2. API 层架构设计

### 2.1 现状诊断

| 问题 | 详情 |
|------|------|
| 无版本路由 | `apiSpec.ts` 声明 v1 但路由无 `/v1/` 前缀 |
| 错误码未使用 | 100001-504001 定义完整但 tRPC 未接入 |
| 输出无校验 | 100% 输入校验 (Zod)，0% 输出校验 |
| Schema 内联 | 70% 路由使用内联 Zod，无共享契约 |
| gRPC 类型缺失 | 全部用 `Record<string, unknown>` |

### 2.2 商用架构设计

```
                    客户端请求
                        │
                ┌───────▼───────┐
                │  API Gateway  │  Kong / 内置网关
                │  /api/v{N}/   │  版本路由
                └───────┬───────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ tRPC v1  │  │ tRPC v2  │  │ gRPC     │
    │ (当前)   │  │ (新增)   │  │ (微服务) │
    └────┬─────┘  └────┬─────┘  └────┬─────┘
         │             │             │
    ┌────▼─────────────▼─────────────▼────┐
    │       Unified Error Handler          │
    │  ErrorCode → { code, message,        │
    │    details, traceId, timestamp }     │
    │  XYYZZZ: X=层 YY=域 ZZZ=具体错误    │
    └────┬────────────────────────────────┘
         │
    ┌────▼────────────────────────────────┐
    │       Output Validation Layer        │
    │  Zod schema 校验每个响应             │
    │  dev: 抛错  prod: 日志+降级          │
    └─────────────────────────────────────┘
```

### 2.3 关键接口

```typescript
/** 统一错误响应 */
interface PlatformErrorResponse {
  code: number;          // XYYZZZ 格式
  message: string;       // 人类可读
  details?: unknown;     // 结构化错误信息
  traceId: string;       // OTel trace ID
  timestamp: number;
}

/** tRPC 输出校验中间件 */
const withOutputValidation = <T extends ZodSchema>(schema: T) =>
  middleware(async ({ next }) => {
    const result = await next();
    if (result.ok) {
      const parsed = schema.safeParse(result.data);
      if (!parsed.success && process.env.NODE_ENV === 'production') {
        logger.error('Output validation failed', parsed.error);
        // 生产环境降级：返回原始数据 + 告警
      }
    }
    return result;
  });

/** API 版本路由注册 */
// server/core/api-versions.ts
export const apiV1Router = router({ ...currentRouters });
// 升级时: export const apiV2Router = router({ ...v2Routers });
// Express 挂载: app.use('/api/v1', trpcExpress(apiV1Router));
```

### 2.4 gRPC 类型生成

```bash
# proto → TypeScript 自动生成
protoc --ts_out=shared/generated/proto \
       --ts_opt=output_typescript \
       proto/**/*.proto

# CI 检查: proto 变更必须重新生成
```

### 2.5 复用分析

| 组件 | 决策 | 理由 |
|------|------|------|
| 33 个 tRPC 路由 | **复用** | 封装为 v1，新版本增量新建 |
| `apiSpec.ts` 错误码 | **复用+接入** | 定义完整，需在 tRPC 中间件接入 |
| Zod 输入校验 | **复用** | 提取到 `shared/contracts/` |
| gRPC 客户端 | **重写类型层** | 从 proto 生成替换 Record |

---

## 3. 插件引擎架构设计

### 3.1 现状诊断

| 问题 | 详情 |
|------|------|
| 假沙箱 | `Function` 构造器，非真正隔离 |
| 安全绕过 | 正则匹配可绕过（如 `eval` → `ev` + `al`） |
| 无生命周期 | 无 install/enable/disable/uninstall 事件 |
| 无签名 | 任何代码可注册执行 |
| 无市场 | 无插件分发和版本管理 |

### 3.2 商用架构设计

```
┌─────────────────────────────────────────────┐
│              Plugin Marketplace              │
│  发布 → 审核 → 签名 → 分发 → 安装          │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│           Plugin Lifecycle Manager           │
│  install → enable → execute → disable →     │
│  uninstall                                   │
│  每个状态转换 → Kafka 事件                   │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│           Plugin SDK (PlatformContext)        │
│  ┌────────────────────────────────────────┐  │
│  │ algorithmExecutor: 调用算法库          │  │
│  │ eventPublisher:    发布事件(受限topic)  │  │
│  │ dataReader:        只读数据访问        │  │
│  │ kvStorage:         插件专属KV存储      │  │
│  │ logger:            结构化日志          │  │
│  └────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│           Isolation Levels                   │
│  L0: 进程内(当前) — 开发/测试               │
│  L1: Worker Thread — 内存隔离               │
│  L2: isolated-vm  — V8 隔离                 │
│  L3: 子进程/容器  — 完全隔离(生产)          │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│           Output Gateway                     │
│  插件输出 → Schema 校验 → 物理约束检查 →    │
│  审计日志 → 下游消费                         │
└─────────────────────────────────────────────┘
```

### 3.3 关键接口

```typescript
/** 插件 SDK 上下文 */
interface PlatformContext {
  algorithmExecutor: {
    run(algorithmId: string, input: AlgorithmInput): Promise<AlgorithmOutput>;
    list(category?: string): Promise<AlgorithmMeta[]>;
  };
  eventPublisher: {
    publish(topic: string, payload: unknown): Promise<void>;  // 白名单 topic
  };
  dataReader: {
    queryTimeSeries(params: TimeSeriesQuery): Promise<DataPoint[]>;
    queryKnowledgeGraph(cypher: string): Promise<unknown>;      // 只读
  };
  kvStorage: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown, ttlMs?: number): Promise<void>;
  };
  logger: StructuredLogger;
}

/** 插件清单 */
interface PluginManifest {
  id: string;
  version: string;           // SemVer
  name: string;
  author: string;
  signature: string;         // Ed25519 签名
  permissions: string[];     // 声明所需权限
  isolationLevel: 0 | 1 | 2 | 3;
  entryPoint: string;
  configSchema?: ZodSchema;
}
```

### 3.4 复用分析

| 组件 | 决策 | 理由 |
|------|------|------|
| `tool-sandbox.ts` | **替换** | Function 构造器不安全，升级 isolated-vm |
| `tool-framework.ts` 注册逻辑 | **复用** | 扩展支持插件生命周期 |
| `tooling.domain-router.ts` | **复用+扩展** | 添加插件管理端点 |
| 安全检查正则 | **替换** | AST 分析替代正则匹配 |

---

## 4. 消息队列架构设计

### 4.1 现状诊断

| 问题 | 详情 |
|------|------|
| 双总线未统一 | 内存 EventBus (25+ topic) 和 Kafka EventBus 并行，未集成 |
| Schema 未强制 | `event-schema-registry.ts` 有 Zod 校验但 publish() 不强制 |
| 死信队列空置 | `DLQ` topic 已定义但无代码写入 |
| 无消费者健康检查 | 消费者离线无告警 |

### 4.2 商用架构设计

```
┌─────────────────────────────────────────────────────┐
│              Topic Registry (SSOT)                   │
│  { topicId, schema(Zod), producer[], consumer[],    │
│    partitions, retention, sla, compatibility }       │
│                                                      │
│  兼容模式: BACKWARD (默认) / FORWARD / FULL          │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│           Unified EventBus Facade                    │
│                                                      │
│  publish(topic, payload)                             │
│    → Schema 校验 (强制)                              │
│    → 兼容性检查                                      │
│    → 路由决策:                                       │
│        高吞吐/持久化 → Kafka                         │
│        低延迟/临时   → Memory EventBus               │
│    → OTel trace 注入                                 │
│    → 发布确认 / 失败 → Dead Letter                   │
│                                                      │
│  subscribe(topic, handler, options)                  │
│    → 消费者组管理                                    │
│    → 背压控制                                        │
│    → 心跳健康检查 (30s)                              │
│    → 处理失败 → 重试(3次) → Dead Letter              │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │  Kafka   │ │  Memory  │ │   DLQ    │
    │ 19 topic │ │ 25 topic │ │ 处理器   │
    │ 持久化   │ │ 进程内   │ │ 告警+    │
    │          │ │          │ │ 重试     │
    └──────────┘ └──────────┘ └──────────┘
```

### 4.3 关键接口

```typescript
/** Topic 注册表条目 */
interface TopicRegistryEntry {
  topicId: string;
  schema: ZodSchema;
  version: string;
  compatibility: 'BACKWARD' | 'FORWARD' | 'FULL';
  producers: string[];         // 允许的生产者服务
  consumers: string[];         // 已注册消费者
  partitions: number;
  retentionMs: number;
  sla: {
    maxLatencyMs: number;      // P99 延迟
    minThroughput: number;     // 最低吞吐 msg/s
  };
}

/** 死信处理器 */
interface DeadLetterHandler {
  process(entry: DeadLetterEntry): Promise<'retry' | 'archive' | 'alert'>;
}

interface DeadLetterEntry {
  originalTopic: string;
  payload: unknown;
  error: string;
  attempts: number;
  firstFailedAt: number;
  lastFailedAt: number;
}
```

### 4.4 复用分析

| 组件 | 决策 | 理由 |
|------|------|------|
| `event-schema-registry.ts` | **复用+强制化** | 已有 Zod+SemVer，需接入 publish() |
| `eventBus.service.ts` | **复用** | 作为低延迟通道保留 |
| `kafkaEventBus.ts` | **复用+增强** | 添加 DLQ 写入和消费者健康检查 |
| Kafka topic 常量 | **复用** | 已有 19 topic 定义 |

---

## 5. 数据库架构设计

### 5.1 现状诊断

| 数据库 | 表数 | 问题 |
|--------|------|------|
| MySQL | 203 表 (3 schema 文件) | 字段命名不统一，缺少分片策略 |
| ClickHouse | 4 核心表 + 物化视图 | 冷热分层已有 (7d/2y/5y) |
| Neo4j | 8 节点类型 | 无备份策略 |
| Redis | 5 命名空间 | 无淘汰策略文档 |

### 5.2 商用架构设计

```
┌─────────────────────────────────────────────────────┐
│                  数据分层策略                         │
│                                                      │
│  热数据 (Hot)     ← Redis + MySQL                    │
│  │ TTL: 7天       ← 实时查询、当前会话               │
│  │                                                   │
│  温数据 (Warm)    ← ClickHouse 1-min 聚合            │
│  │ TTL: 2年       ← 趋势分析、报表                   │
│  │                                                   │
│  冷数据 (Cold)    ← ClickHouse 1-hour 聚合 + MinIO   │
│  │ TTL: 5年+      ← 合规审计、历史回溯               │
│  │                                                   │
│  归档 (Archive)   ← MinIO (S3) + 元数据索引          │
│    TTL: 永久      ← 法规要求、案例库                  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│               跨库一致性 (Saga + Outbox)              │
│                                                      │
│  MySQL (事务源)                                      │
│    → Outbox 表 (事件待发)                            │
│    → Poller 轮询 (500ms)                             │
│    → Kafka 发布                                      │
│    → ClickHouse/Neo4j 消费写入                       │
│    → Saga 状态机管理补偿逻辑                         │
│                                                      │
│  乐观锁: version 字段 (~45 张表已有)                  │
│  分片键: device_id (设备维度) + 时间范围分区          │
└─────────────────────────────────────────────────────┘
```

### 5.3 备份与恢复

| 指标 | 目标 | 方案 |
|------|------|------|
| RTO | < 1 小时 | MySQL: 主从切换; CH: 副本集; Neo4j: 热备 |
| RPO | < 5 分钟 | MySQL: binlog 实时同步; CH: 2 副本; Redis: AOF |
| 备份 | 每日全量 + 持续增量 | mysqldump + binlog; CH 快照; Neo4j dump |

### 5.4 分片策略

```
MySQL 分片 (TiDB 兼容):
  ├── 按 device_id hash → 设备相关表
  ├── 按 created_at range → 诊断/事件/日志表
  └── 全局表 → 配置/字典/元数据表

ClickHouse 分区:
  ├── sensor_readings_raw  → toYYYYMMDD(timestamp)
  ├── sensor_readings_1m   → toYYYYMM(timestamp)
  └── sensor_readings_1h   → toYear(timestamp)
```

### 5.5 复用分析

| 组件 | 决策 | 理由 |
|------|------|------|
| `drizzle/schema.ts` 203 表 | **复用** | 稳定运行，字段对齐通过视图/别名 |
| ClickHouse 物化视图 | **复用** | 分层策略已实现 |
| Saga/Outbox 模式 | **复用+完善** | 补偿逻辑需补全 |
| Neo4j 图模型 | **复用** | 8 节点类型覆盖业务 |

---

## 6. 数据契约迭代策略

### 6.1 现状诊断

| 问题 | 详情 |
|------|------|
| 类型重复 | 2 个 `DiagnosisConclusion`（severity 枚举不同） |
| 枚举碎片化 | 3 种 Severity 定义分散在 6+ 文件 |
| 无版本标记 | 无 `@deprecated`，无 per-type 版本 |
| 共享类型散乱 | `shared/` 下 145+ 类型导出，10 个文件 |

### 6.2 商用架构设计

```
shared/
├── contracts/
│   ├── v1/                          # 当前版本
│   │   ├── perception.contract.ts   # 感知域契约
│   │   ├── cognition.contract.ts    # 认知域契约
│   │   ├── diagnosis.contract.ts    # 诊断契约 (统一 Conclusion)
│   │   ├── evolution.contract.ts    # 进化域契约
│   │   ├── common.contract.ts       # 公共枚举/基础类型
│   │   └── index.ts                 # 统一导出
│   ├── v2/                          # 下一版本 (需要时创建)
│   └── compatibility.ts             # 版本兼容适配器
├── generated/
│   └── proto/                       # gRPC 生成类型
└── (现有文件保留，标记 @deprecated)
```

### 6.3 版本兼容规则

| 变更类型 | 兼容性 | 处理方式 |
|----------|--------|---------|
| **PATCH** (文档/注释) | 完全兼容 | 直接更新 |
| **MINOR** (新增可选字段) | 向后兼容 | 旧消费者忽略新字段 |
| **MAJOR** (删除/重命名/类型变更) | 不兼容 | 新建 v{N+1}，保留旧版 2 个大版本 |

### 6.4 统一 DiagnosisConclusion

```typescript
// shared/contracts/v1/diagnosis.contract.ts

/** 统一严重度枚举 — 合并 algorithm + HDE 两套定义 */
export enum Severity {
  Normal   = 'normal',
  Attention = 'attention',   // 原 HDE: low
  Warning  = 'warning',      // 原 HDE: medium
  Critical = 'critical',     // 两套一致
}

/** 统一紧急度枚举 */
export enum Urgency {
  Monitoring = 'monitoring',
  Scheduled  = 'scheduled',
  Priority   = 'priority',
  Immediate  = 'immediate',
}

/** 统一诊断结论 — 单一真相源 */
export interface DiagnosisConclusion {
  faultType: string;
  severity: Severity;
  urgency: Urgency;
  confidence: number;        // [0, 1]
  description: string;
  evidence: string[];
  recommendations: string[];
  physicsValidated: boolean;  // ADR-001 物理约束标记
}
```

### 6.5 CI 兼容性检测

```bash
# .github/workflows/contract-check.yml
# 每次 shared/contracts/ 变更时触发:
# 1. 对比新旧 schema (zod-to-json-schema → json-schema-diff)
# 2. 按兼容规则判定 PATCH/MINOR/MAJOR
# 3. MAJOR 变更 → 阻断 PR，要求创建 v{N+1} 目录
# 4. 生成迁移适配器骨架代码
```

### 6.6 废弃策略

- 标记 `@deprecated` + 废弃日期
- 保留 **2 个大版本** 的向后兼容
- 废弃版本的消费者收到 `X-Deprecated-Version` 响应头
- 监控废弃版本调用量，归零后删除

---

## 7. 迭代影响矩阵

### 7.1 变更场景 × 基础设施影响

| 变更场景 | Agent | API 层 | 插件引擎 | 消息队列 | 数据库 | 数据契约 |
|----------|-------|--------|---------|---------|--------|---------|
| **新增算法** | 注册新 Tool | 无需改动 | 可作为插件 | 新 topic (可选) | 无 | 输入/输出契约 |
| **契约 MAJOR 升级** | 工具版本升级 | 新版本路由 | SDK 适配层 | Schema 迁移 | 字段迁移 | v{N+1} 目录 |
| **新增设备类型** | 无 | 设备 API 扩展 | 协议插件 | 新分区策略 | 新编码+表分区 | 设备契约扩展 |
| **插件调用核心算法** | Tool 代理调用 | 权限校验 | SDK.algorithmExecutor | 审计事件 | 执行日志 | 算法 I/O 契约 |

### 7.2 影响等级说明

| 等级 | 含义 | 预估工作量 |
|------|------|-----------|
| 无需改动 | 架构已支持 | 0 |
| 配置变更 | 修改配置/注册 | < 1 天 |
| 新增模块 | 新文件不改旧代码 | 1-3 天 |
| 接口变更 | 需要版本升级 | 3-5 天 |

---

## 8. 实施路线图

### Phase 1: Week 1-2 — 契约统一 + 核心加固

| 优先级 | 任务 | 交付物 |
|--------|------|--------|
| P0 | 创建 `shared/contracts/v1/` 目录结构 | 统一类型定义 |
| P0 | 合并 2 套 DiagnosisConclusion | `diagnosis.contract.ts` |
| P0 | 统一 Severity/Urgency 枚举 | `common.contract.ts` |
| P1 | tRPC 接入统一错误码 | 错误处理中间件 |
| P1 | EventBus publish() 强制 Schema 校验 | `event-schema-registry.ts` 改造 |
| P1 | 合并 GrokTool + ToolDefinition 接口 | `ToolContract` 类型 |

### Phase 2: Week 3-4 — 基础设施升级

| 优先级 | 任务 | 交付物 |
|--------|------|--------|
| P0 | 统一 EventBus Facade | `unified-event-bus.ts` |
| P0 | Dead Letter Queue 实现 | DLQ 处理器 + 告警 |
| P1 | 插件沙箱升级 (isolated-vm) | L2 隔离级别 |
| P1 | API 版本路由 `/api/v1/` | 版本路由中间件 |
| P2 | gRPC proto → TypeScript 生成 | CI 流水线 |
| P2 | tRPC 输出校验中间件 | 生产降级 + dev 严格模式 |

### Phase 3: Month 2 — 商用化完善

| 优先级 | 任务 | 交付物 |
|--------|------|--------|
| P0 | CI 契约兼容性检测 | GitHub Action |
| P1 | 插件 SDK (PlatformContext) | 插件开发框架 |
| P1 | Tool 熔断器 + ReAct 回放 | Agent 可靠性 |
| P1 | 消费者健康检查 + 背压控制 | 队列稳定性 |
| P2 | 数据库分片策略实施 | TiDB 分片规则 |
| P2 | 插件市场 MVP | 发布/安装/版本管理 |
| P2 | 备份策略实施 (RTO<1h, RPO<5min) | 备份脚本 + 恢复演练 |

---

## 9. 设计决策理由

| # | 决策 | 理由 | 备选方案 | 否决原因 |
|---|------|------|---------|---------|
| D1 | 合并双工具系统为 ToolContract | 消除接口碎片，统一生态 | 保持两套共存 | 维护成本翻倍，插件无法跨系统 |
| D2 | 契约目录 `shared/contracts/v1/` | 版本隔离清晰，CI 可检测 | 单文件版本标记 | 无法自动检测 MAJOR 变更 |
| D3 | Unified EventBus Facade | 一个入口，按特征路由 | 全部迁移 Kafka | 低延迟场景不适合 Kafka |
| D4 | isolated-vm 替代 Function 构造器 | V8 级隔离，内存限制 | Docker 容器隔离 | 启动延迟太高 (秒级 vs 毫秒级) |
| D5 | Saga + Outbox 跨库一致性 | 最终一致性，已有基础 | 2PC 分布式事务 | 性能差，锁粒度大 |
| D6 | BACKWARD 兼容作为默认策略 | 新消费者兼容旧消息 | FULL 兼容 | 过于严格，阻碍快速迭代 |
| D7 | 保留 2 个大版本向后兼容 | 平衡兼容性和维护成本 | 保留 1 个版本 | 升级窗口太短，现场部署无法跟上 |
| D8 | 分层存储 热/温/冷/归档 | PB 级数据成本优化 | 全量热存储 | 存储成本不可控 |

---

## 10. 复用 vs 重写总览

| 类别 | 复用 | 重写 | 新增 |
|------|------|------|------|
| **Agent** | ReAct 循环, ToolFramework, ReasoningChainManager | grok-tools 12 工具定义 | ToolContract, 熔断器, 回放 API |
| **API** | 33 tRPC 路由, apiSpec 错误码, Zod 校验 | gRPC 类型层 | 版本路由, 输出校验中间件 |
| **插件** | ToolFramework 注册逻辑 | tool-sandbox (→ isolated-vm) | Plugin SDK, 生命周期, 市场 |
| **消息队列** | Schema Registry, EventBus, KafkaEventBus, Topic 常量 | 无 | Unified Facade, DLQ 处理器, 健康检查 |
| **数据库** | 203 表, ClickHouse 视图, Saga/Outbox, Neo4j 模型 | 无 | 分片策略, 备份脚本 |
| **契约** | 145+ 共享类型 (标记 deprecated) | DiagnosisConclusion 合并 | contracts/v1/ 目录, CI 检测 |

**总计**: ~80% 复用现有代码，~5% 重写，~15% 新增。

---

> 本文档遵循 CLAUDE.md §9 设计原则: 物理世界优先、验证闭环、单例工厂、类型即文档、降级不崩溃、编码即语义、新增不修改。
