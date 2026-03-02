# PITFALLS.md — 已知陷阱与防坑指南

> 新开发者必读。每条记录来自实际踩坑，附教训和预防措施。
> 最后更新: 2026-03-02 | 分支: feature/hde-v3-phase0

---

## §1 设备 ID 四种命名混用

**严重性**: 致命 | **影响范围**: 跨模块查询断裂、数据关联失败

### 现象

同一个"设备标识"概念在代码库中有 4 种命名：

| 命名 | 出现次数 | 使用场景 |
|------|---------|---------|
| `machineId` | ~539 | 后端 API、tRPC 路由、Drizzle 表字段 |
| `deviceId` | ~159 | 进化域类型、前端 store、部分 API |
| `device_id` | ~57 | 数据库列名 (snake_case)、gRPC proto |
| `machine_id` | ~2 | 数据库列名 (少量表) |

### 典型冲突

```typescript
// server/domains/perception/perception.domain-router.ts:110
input: z.object({ machineId: z.string() })
// → DB查询: eq(conditionInstances.machineId, input.machineId)

// server/platform/evolution/models/world-model-types.ts:29
interface WorldModelContext { deviceId?: string }
// → 如果从 perception 传给 evolution，字段名不匹配

// server/platform/algorithm/algorithm-proxy.ts:181
context: { device_id: context?.equipmentId || '' }
// → 第三种命名，还引入了 equipmentId
```

### 教训

- 早期未定义统一命名规范，各模块独立发展导致分裂
- 搜索 `device_id` 会漏掉 `machineId` 的引用，debug 困难

### 预防措施

1. **标准**: 后端统一用 `machineId` (camelCase)，数据库列用 `machine_id` (snake_case)
2. **检查**: 新代码中禁止出现 `deviceId` / `device_id` / `equipmentId`
3. **迁移**: 创建 `DeviceIdMapper` 工具类做跨层翻译，逐步统一

---

## §2 Severity 枚举至少 3 套定义

**严重性**: 致命 | **影响范围**: 算法→诊断→存储全链路类型不匹配

### 现象

```typescript
// 定义 1: server/platform/events/domain-models.ts:47
type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
// 5 级，含 'info'

// 定义 2: server/algorithms/_core/types.ts:16
type SeverityLevel = 'normal' | 'attention' | 'warning' | 'critical';
// 4 级，含 'normal'/'attention'，无 'high'/'low'/'info'

// 定义 3: server/lib/dataflow/anomalyEngine.ts:25
type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';
// 4 级，无 'info'/'normal'/'attention'/'warning'
```

### 影响

| 场景 | 问题 |
|------|------|
| 算法输出 `'attention'` → 事件系统 | 事件系统无 `'attention'`，类型报错或丢失 |
| 异常检测输出 `'low'` → 算法层 | 算法层无 `'low'`，需要映射 |
| 前端展示 severity 颜色 | 需要 switch-case 处理所有变体 |
| 数据库 mysqlEnum 定义 | 每张表的 severity 字段值域不同 |

### 教训

- 每个模块作者定义了"对自己最直觉"的枚举，没检查全局是否已有
- TypeScript 的 `as const` 枚举无法跨文件强制一致

### 预防措施

1. **统一到** `shared/contracts/v1/severity.ts`:
   ```typescript
   export const SEVERITY_LEVELS = ['info', 'low', 'medium', 'high', 'critical'] as const;
   export type SeverityLevel = typeof SEVERITY_LEVELS[number];
   ```
2. **映射函数**: 为算法层旧类型提供转换:
   ```typescript
   const ALGO_SEVERITY_MAP = { normal: 'info', attention: 'low', warning: 'medium', critical: 'critical' };
   ```
3. **CI 检查**: grep 禁止新增 `type.*Severity` 定义

---

## §3 时间戳类型混用 (Date / number / string)

**严重性**: 高 | **影响范围**: 时间计算错误、序列化 bug、跨模块比较失败

### 现象

```typescript
// drizzle/evolution-schema.ts:2300 — JSON 字段内用 string
trainingLog: json('training_log').$type<Array<{
  timestamp: string;  // ISO "2026-03-02T10:00:00Z"
}>>(),

// drizzle/evolution-schema.ts:2469 — JSON 字段内用 number
performanceHistory: json('performance_history').$type<Array<{
  timestamp: number;  // epoch ms 1740994800000
}>>(),

// shared/apiSpec.ts:89 — API 响应用 number
{ timestamp: number }

// drizzle/schema.ts Drizzle 列 — 返回 Date 对象
createdAt: timestamp('created_at').defaultNow()  // → JavaScript Date
```

### 影响

| 场景 | 问题 |
|------|------|
| `trainingLog.timestamp > performanceHistory.timestamp` | string vs number 比较，结果永远 false |
| JSON.stringify(row.createdAt) | Date → `"2026-03-02T10:00:00.000Z"` 丢毫秒 |
| ClickHouse 查询 WHERE timestamp > ? | 格式取决于客户端传值类型 |

### 教训

- JSON `$type<T>()` 中的 timestamp 类型各模块作者自行选择，无全局约定
- Drizzle `timestamp()` 列返回 `Date` 对象，与 JSON 字段内的时间戳类型不一致

### 预防措施

1. **规范**: JSON 字段内的时间戳统一用 `number` (epoch ms)
2. **Drizzle 列**: 保持 `timestamp()` 类型（返回 Date），在 API 层转换
3. **工具函数**: `toEpochMs(input: Date | string | number): number`
4. **审查**: 新增 JSON `$type` 中含 `timestamp` 时必须用 `number`

---

## §4 31 处数据格式断裂

**严重性**: 致命 | **影响范围**: data-contracts.ts 定义与实际使用不一致

### 现象

`server/platform/contracts/data-contracts.ts` (~643 行) 定义了跨域数据契约，但多处与实际代码不一致：

| 断裂类型 | 数量 | 典型场景 |
|----------|------|---------|
| 字段名不匹配 | ~12 | 契约写 `deviceId`，实际用 `machineId` |
| 类型不匹配 | ~8 | 契约写 `string`，实际传 `number` |
| 字段缺失 | ~6 | 契约有但实际代码不发送 |
| 多余字段 | ~5 | 实际代码发送但契约未定义 |

### 根因

- 契约文件是后期补充的，不是先设计后编码
- 各域独立开发，直接 import 对方类型而非引用契约
- 没有 CI 自动检测契约与实际代码的偏差

### 教训

- "先写契约再写代码" 很理想但开发节奏快时难以执行
- 没有运行时校验的契约只是文档，不是约束

### 预防措施

1. **Phase 1**: 在 EventBus `publish()` 中加入强制 Schema 校验
2. **Phase 2**: 用 `zod` 定义契约 → 自动生成 TypeScript 类型
3. **Phase 3**: CI 中加入 `contract-test` 步骤
4. **参考**: `docs/ARCHITECTURE_DESIGN.md` §6 数据契约迭代策略

---

## §5 WorldModel 训练是 Stub（假训练）

**严重性**: 高 | **影响范围**: 用户提交训练任务显示成功但模型没有改进

### 现象

```typescript
// server/platform/evolution/models/world-model-engine.ts:317-352

async train(job: WorldModelTrainingJob): Promise<boolean> {
  // 真实场景：await this.runPythonTraining(job);
  // 目前调用的是 simulateTraining:
  await this.simulateTraining(job);
  return true;  // ⚠️ 永远返回 true
}

private async simulateTraining(job: WorldModelTrainingJob): Promise<void> {
  const durationMs = 5000;  // 模拟 5 秒
  await new Promise(resolve => setTimeout(resolve, durationMs));
  await this.reloadModel();  // 只是重载现有 ONNX，没有重新训练
}
```

### 影响

| 场景 | 问题 |
|------|------|
| 用户提交训练任务 | 5 秒后显示"完成"，但模型权重没变 |
| 训练指标 (loss, valLoss) | 没有真实值，metrics 为空或虚假 |
| 基于 WorldModel 的预测 | 使用初始/随机权重，预测无价值 |
| 自动标注 (auto-labeling) | 基于假模型的标注结果不可靠 |

### 教训

- Stub 代码 `return true` 掩盖了功能缺失
- 需要明确区分"功能不可用"和"功能已完成"

### 预防措施

1. **短期**: 训练接口返回 `status: 'not_implemented'`，前端显示"功能开发中"
2. **中期**: 实现 Python 子进程训练 + ONNX 导出
3. **标记**: 用 `@stub('WorldModel training requires Python runtime')` 装饰器标记

---

## §6 GrokTool 12 个中 10 个是 Stub

**严重性**: 中 | **影响范围**: Grok AI 诊断能力受限

### 现象

```
server/platform/cognition/grok/grok-tools.ts 定义了 12 个工具:

已实现 (2):
  ✅ queryKnowledgeGraph — Neo4j 查询
  ✅ runAlgorithm — 算法执行

Stub (10):
  ❌ getSensorData — return stubFn(...)
  ❌ getMaintenanceHistory
  ❌ getEquipmentSpecs
  ❌ getSimilarCases
  ❌ getWeatherData
  ❌ runSimulation
  ❌ getOperationalContext
  ❌ getAlarmHistory
  ❌ getTrendAnalysis
  ❌ getExpertKnowledge
```

### 影响

- Grok 推理时调用 stub 工具只返回模拟数据
- 推理结论基于假数据，诊断结果不可信
- 用户看到"AI 诊断"功能但结果实际是虚假的

### 教训

- 工具框架和调用逻辑已完善，但 10/12 的底层数据源未接通
- 优先实现 `getSensorData` 和 `getMaintenanceHistory`（使用频率最高）

### 预防措施

1. **标记**: 在每个 stub 工具的返回中明确注明 `{ isStub: true }`
2. **Grok 推理**: 检测到 stub 数据时降低 confidence
3. **优先级**: getSensorData → getMaintenanceHistory → getAlarmHistory → 其他

---

## §7 11 个配置参数声明但未生效

**严重性**: 中 | **影响范围**: 误导运维配置

### 现象

`server/core/config.ts` 中的部分配置被代码引用但实际未定义或未初始化：

| 配置路径 | 引用次数 | 状态 |
|----------|---------|------|
| `config.test.*` | 16 | 测试模式标志，部分定义 |
| `config.nl.*` | 10 | NLP 接口配置，未定义 |
| `config.params.*` | 9 | 通用参数，未初始化 |
| `config.service.*` | 8 | 服务网格配置，stub |
| `config.lab.*` | 8 | 进化实验室配置，stub |
| `config.retry.*` | 7 | 重试策略，部分定义 |
| `config.rules.*` | 6 | 护栏规则配置，stub |
| `config.modules.*` | 5 | 模块配置，未定义 |
| `config.window.*` | 5 | 窗口函数配置，stub |
| `config.physicsParams.*` | 7 | 物理模型参数，stub |

### 影响

- 运维人员修改配置文件中这些参数，但代码不读取，修改无效
- `config.retry.maxRetries` 未定义时可能返回 `undefined`，导致无限重试

### 预防措施

1. **启动校验**: `ConfigValidator.validateAllKeys()` 检查所有被引用的配置路径
2. **清理**: 移除确认不再需要的配置引用
3. **补全**: 为有效引用的配置添加默认值和类型定义

---

## §8 工况归一化特征顺序不确定

**严重性**: 中低 | **影响范围**: 跨设备对比结果可能不可复现

### 现象

```typescript
// server/platform/perception/condition/condition-normalization-pipeline.ts:34-48

export interface EnvironmentalParams {
  windSpeed?: number;
  ambientTemp?: number;
  humidity?: number;
  salinity?: number;
  // 四个环境参数均为可选
  // 无文档说明计算顺序
}
```

### 影响

- 如果归一化引擎按 JS 对象属性顺序处理环境参数
- `{ windSpeed: 10, ambientTemp: 25 }` 和 `{ ambientTemp: 25, windSpeed: 10 }` 可能产生不同结果
- 不同 Node.js 版本对对象属性顺序的保证不同

### 预防措施

1. **排序**: 处理前将参数排序为固定顺序
2. **文档**: 在接口注释中注明标准处理顺序: windSpeed → ambientTemp → humidity → salinity
3. **测试**: 添加参数顺序无关性测试

---

## §9 插件沙箱使用 Function 构造器（非真隔离）

**严重性**: 中 | **影响范围**: 安全风险

### 现象

工具域的沙箱执行使用 JavaScript `Function` 构造器而非 `isolated-vm` 或 `vm2`：

```typescript
// 插件代码通过 Function() 构造器执行
const fn = new Function('context', pluginCode);
fn(sandboxContext);
// ⚠️ 可以访问 global 对象、process、require
```

### 影响

- 恶意插件可以访问 `process.env`（泄露密钥）
- 可以 `require('child_process')` 执行任意命令
- 可以修改全局对象影响其他模块

### 预防措施

1. **短期**: 只允许内部信任的插件执行
2. **中期**: 迁移到 `isolated-vm`（已在 `docs/ARCHITECTURE_DESIGN.md` §3 规划）
3. **长期**: 每个插件独立 Worker 线程 + 资源限额

---

## §10 EventBus Schema 校验未强制执行

**严重性**: 高 | **影响范围**: 脏数据通过事件系统传播到所有消费者

### 现象

```typescript
// server/platform/contracts/event-schema-registry.ts
// Schema 注册表已定义 ~25 个 topic 的 Zod schema
// 但 EventBus.publish() 没有调用校验

// server/platform/services/event-bus.ts
publish(topic: string, payload: unknown) {
  // ⚠️ 直接广播，不校验 payload 是否匹配 schema
  this.handlers.get(topic)?.forEach(h => h(payload));
}
```

### 影响

| 场景 | 问题 |
|------|------|
| 生产者发送格式错误的事件 | 所有消费者收到脏数据 |
| 字段名拼写错误 | 静默传递，消费者取到 undefined |
| 类型不匹配 | 运行时 crash 而非编译时报错 |

### 预防措施

1. **强制校验**: `publish()` 调用 Schema 注册表校验
2. **错误处理**: 校验失败时拒绝发布 + 记录告警
3. **参考**: `docs/ARCHITECTURE_DESIGN.md` §4 消息队列架构

---

## 速查表

| # | 陷阱 | 严重性 | 修复优先级 | 相关文件 |
|---|------|--------|-----------|---------|
| 1 | 设备 ID 四种命名 | 致命 | P0 | 143+ 文件 |
| 2 | Severity 枚举 3+ 套 | 致命 | P0 | domain-models.ts, types.ts, anomalyEngine.ts |
| 3 | 时间戳类型混用 | 高 | P1 | evolution-schema.ts, apiSpec.ts, schema.ts |
| 4 | 31 处数据格式断裂 | 致命 | P0 | data-contracts.ts |
| 5 | WorldModel 假训练 | 高 | P1 | world-model-engine.ts |
| 6 | GrokTool 10/12 stub | 中 | P2 | grok-tools.ts |
| 7 | 11 个配置未生效 | 中 | P2 | config.ts |
| 8 | 工况归一化顺序 | 中低 | P3 | condition-normalization-pipeline.ts |
| 9 | 插件沙箱不安全 | 中 | P2 | tooling/ |
| 10 | EventBus 无校验 | 高 | P1 | event-bus.ts, event-schema-registry.ts |

---

## 更新日志

| 日期 | 变更 |
|------|------|
| 2026-03-02 | 初始版本，10 条陷阱记录 |
