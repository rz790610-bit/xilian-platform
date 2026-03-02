# Skill: 新增 Kafka 消费者

## 触发条件

- 用户要求"新增/添加 Kafka 消费者/订阅者"
- 用户要求处理某类事件流（如传感器数据、告警事件）
- 用户提到 "consumer" / "subscriber" / "事件消费" / "topic 订阅"

## 前置检查

1. **确认 topic 是否已定义** — 检查 `server/shared/constants/kafka-topics.const.ts`
2. **确认事件 payload 类型** — 检查 `server/platform/contracts/data-contracts.ts`
3. **确认消费模式** — 高吞吐持久化用 Kafka，低延迟进程内用 Memory EventBus
4. **确认消费者组 ID** — 格式 `{feature}-{component}-consumer`
5. **确认是否需要 Schema 校验** — 生产级消费者必须校验

## 标准步骤

### Step 1: 定义 Topic (如果是新 topic)

**文件**: `server/shared/constants/kafka-topics.const.ts`

```typescript
// 在 KAFKA_TOPICS 中添加
MY_FEATURE_EVENTS: 'my-feature.events',

// 在 KAFKA_TOPIC_CLUSTER_CONFIGS 中添加
MY_FEATURE_EVENTS: {
  name: 'my-feature.events',
  partitions: 8,
  replicationFactor: 2,
  retentionMs: 30 * 24 * 60 * 60 * 1000,  // 30 天
  compressionType: 'gzip',
  minInsyncReplicas: 1,
},
```

### Step 2: 定义 Payload 类型

**文件**: `server/platform/contracts/data-contracts.ts`

```typescript
export interface MyFeatureEventPayload {
  eventId: string;
  machineId: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// 添加到 EventPayloadMap
type EventPayloadMap = {
  // ...现有
  'my-feature.event.created': MyFeatureEventPayload;
};
```

### Step 3: 创建消费者类

**文件**: `server/platform/[domain]/[feature]-consumer.ts`

```typescript
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('my-feature-consumer');

interface MyFeatureConsumerConfig {
  maxConcurrent: number;
  maxRetries: number;
  retryDelayMs: number;
  enabled: boolean;
}

export class MyFeatureConsumer {
  private config: MyFeatureConsumerConfig = {
    maxConcurrent: 5,
    maxRetries: 3,
    retryDelayMs: 2000,
    enabled: true,
  };
  private unsubscribers: Array<() => void> = [];
  private activeCount = 0;
  private stats = { processed: 0, failed: 0, retried: 0 };

  start(): void {
    if (!this.config.enabled) return;

    // EventBus 模式 (进程内)
    const unsub = eventBus.subscribe('my-feature.events', async (event) => {
      await this.handleEvent(event);
    });
    this.unsubscribers.push(unsub);

    log.info('[MyFeatureConsumer] Started');
  }

  private async handleEvent(event: unknown): Promise<void> {
    // 背压控制
    if (this.activeCount >= this.config.maxConcurrent) {
      log.warn('Backpressure: max concurrent reached, skipping');
      return;
    }

    this.activeCount++;
    try {
      await this.withRetry(async () => {
        // 核心处理逻辑
        this.stats.processed++;
      });
    } catch (err) {
      this.stats.failed++;
      log.error('Event processing failed after retries:', err);
      // 不抛出 — 不阻塞事件循环
    } finally {
      this.activeCount--;
    }
  }

  private async withRetry(fn: () => Promise<void>): Promise<void> {
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        await fn();
        return;
      } catch (err) {
        if (attempt === this.config.maxRetries) throw err;
        this.stats.retried++;
        await new Promise(r => setTimeout(r, this.config.retryDelayMs * attempt));
      }
    }
  }

  stop(): void {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
    log.info('[MyFeatureConsumer] Stopped');
  }

  getStats() { return { ...this.stats, activeCount: this.activeCount }; }

  // 单例工厂
  private static _instance: MyFeatureConsumer | null = null;
  static getInstance(): MyFeatureConsumer {
    if (!this._instance) this._instance = new MyFeatureConsumer();
    return this._instance;
  }
  static reset(): void { this._instance?.stop(); this._instance = null; }
}
```

### Step 4: 注册启动任务

**文件**: `server/core/startup-tasks.ts`

```typescript
{
  id: 'my-feature-consumer',
  label: 'My Feature Event Consumer',
  dependencies: ['config-center', 'event-bus'],
  critical: false,        // 降级不崩溃
  timeout: 5000,
  init: async () => {
    const { MyFeatureConsumer } = await import('../platform/[domain]/my-feature-consumer');
    MyFeatureConsumer.getInstance().start();
  },
},
```

### Step 5: 验证

```bash
pnpm check        # TypeScript 编译通过
pnpm test          # 单元测试通过
pnpm dev           # 启动后日志显示 consumer started
```

## 必须满足的验收标准

- [ ] 消费者类有 `start()` / `stop()` / `getStats()` 方法
- [ ] 使用单例 + 工厂模式（`getInstance()` / `reset()`）
- [ ] 有背压控制（`maxConcurrent` 限制）
- [ ] 有重试逻辑（`withRetry` + 指数退避）
- [ ] 错误不抛出到事件循环（log 但不 throw）
- [ ] `critical: false` — 消费者失败不阻塞启动
- [ ] 有 unsubscriber 用于优雅关闭
- [ ] `pnpm check` 通过

## 常见错误和预防

| 错误 | 后果 | 预防 |
|------|------|------|
| `critical: true` | 消费者失败导致平台无法启动 | 始终 `critical: false` |
| 处理函数中 throw 未捕获 | 事件循环阻塞 | try-catch 包装，log 不 throw |
| 无背压控制 | OOM 或 CPU 100% | `maxConcurrent` 限制并发 |
| 无 `stop()` 方法 | 热重载时资源泄漏 | 存储 unsubscriber 用于清理 |
| 直接用 Kafka client 而非 EventBus | 两套系统不统一 | 优先用 EventBus，需持久化时加 Kafka 层 |
| Schema 校验放在消费者外部 | 错误消息进入处理逻辑 | 在 handleEvent 入口处校验 |

## 示例

### 好的示例 — 完整的错误处理和背压

```typescript
private async handleEvent(event: unknown): Promise<void> {
  if (this.activeCount >= this.config.maxConcurrent) {
    log.warn('Backpressure triggered');
    return;
  }
  this.activeCount++;
  try {
    await this.withRetry(async () => { /* 处理逻辑 */ });
  } catch (err) {
    log.error('Failed after retries:', err);
  } finally {
    this.activeCount--;
  }
}
```

### 坏的示例 — 无保护

```typescript
private async handleEvent(event: any): Promise<void> {
  // 无背压、无重试、无错误处理
  await processEvent(event);  // 如果抛出，整个消费者崩溃
}
```

## 涉及文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/platform/[domain]/[feature]-consumer.ts` | **创建** | 消费者类 |
| `server/core/startup-tasks.ts` | **修改** | 添加启动任务 |
| `server/shared/constants/kafka-topics.const.ts` | 可选修改 | 新 topic |
| `server/platform/contracts/data-contracts.ts` | 可选修改 | 新 payload 类型 |
| `server/services/eventBus.service.ts` | 只读参考 | EventBus 接口 |
