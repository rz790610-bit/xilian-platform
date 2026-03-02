# Skill: 新增协议适配器

## 触发条件

- 用户要求"新增/添加协议适配器"
- 用户要求支持新的数据源接入（如某个 PLC、数据库、API）
- 用户提到 "adapter" / "connector" / "协议接入" / "数据采集"

## 前置检查

1. **确认是否已有** — 检查 18 个已有适配器：mqtt, opcua, modbus, ethernet-ip, profinet, ethercat, mysql, postgresql, clickhouse, influxdb, redis, neo4j, qdrant, kafka, minio, http, grpc, websocket
2. **确认协议分类** — industrial / relational / analytical / timeseries / cache / graph / vector / messaging / storage / api
3. **确认 npm 包** — 是否需要安装新的客户端库
4. **确认连接参数** — host/port/auth/TLS 等

## 标准步骤

### Step 1: 创建适配器文件

**文件**: `server/services/protocol-adapters/[protocol].adapter.ts`

```typescript
import { BaseAdapter, normalizeError, AdapterErrorCode } from './base';
import type { ConnectionTestResult, DiscoveredEndpoint, HealthCheckResult, ProtocolConfigSchema } from '../../../shared/accessLayerTypes';

export class MyProtocolAdapter extends BaseAdapter {
  readonly protocolType = 'my-protocol' as const;
  protected defaultTimeoutMs = 15000;

  readonly configSchema: ProtocolConfigSchema = {
    protocolType: 'my-protocol',
    label: 'My Protocol',
    icon: '🔌',
    description: '协议描述',
    category: 'industrial',

    connectionFields: [
      { key: 'host', label: '主机地址', type: 'string', required: true, placeholder: '192.168.1.100' },
      { key: 'port', label: '端口', type: 'number', required: true, defaultValue: 5000 },
    ],

    authFields: [
      { key: 'username', label: '用户名', type: 'string', required: false },
      { key: 'password', label: '密码', type: 'password', required: false },
    ],

    advancedFields: [
      { key: 'timeout', label: '超时(ms)', type: 'number', required: false, defaultValue: 10000 },
      { key: 'retries', label: '重试次数', type: 'number', required: false, defaultValue: 3 },
    ],
  };

  protected async doTestConnection(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>,
  ): Promise<ConnectionTestResult> {
    const host = params.host as string;
    const port = params.port as number;
    const startTime = Date.now();

    try {
      // === 实际连接测试逻辑 ===
      // const client = new MyClient(host, port);
      // await client.connect();
      // await client.ping();
      // await client.disconnect();

      return {
        success: true,
        latencyMs: Date.now() - startTime,
        message: `已连接 ${host}:${port}`,
        details: { /* 协议特定信息 */ },
      };
    } catch (err) {
      const adapterErr = normalizeError(err, this.protocolType);
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        message: adapterErr.message,
        details: adapterErr.toJSON(),
      };
    }
  }

  protected async doDiscoverResources(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>,
  ): Promise<DiscoveredEndpoint[]> {
    // === 资源发现逻辑 ===
    return [
      {
        resourcePath: 'resource/path/1',
        resourceType: 'register',
        name: 'Resource 1',
        dataFormat: 'json',
        metadata: {},
      },
    ];
  }

  protected async doHealthCheck(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>,
  ): Promise<Omit<HealthCheckResult, 'latencyMs' | 'checkedAt'>> {
    const test = await this.doTestConnection(params, auth);
    return {
      status: test.success ? 'healthy' : 'unhealthy',
      message: test.message,
      metrics: test.details,
    };
  }
}
```

### Step 2: 注册到适配器索引

**文件**: `server/services/protocol-adapters/index.ts`

```typescript
import { MyProtocolAdapter } from './my-protocol.adapter';

const myProtocolAdapter = new MyProtocolAdapter();

export const protocolAdapters: Record<string, ProtocolAdapter> = {
  // ...现有 18 个适配器
  'my-protocol': myProtocolAdapter,
};
```

### Step 3: 更新共享类型

**文件**: `shared/accessLayerTypes.ts`

```typescript
export const PROTOCOL_TYPES = [
  // ...现有
  'my-protocol',
] as const;

export const PROTOCOL_META: Record<ProtocolType, ...> = {
  // ...现有
  'my-protocol': {
    label: 'My Protocol',
    icon: '🔌',
    description: '协议描述',
    category: 'industrial',
  },
};
```

### Step 4: 验证

```bash
pnpm check           # TypeScript 编译通过
pnpm dev             # 前端接入层页面自动显示新协议
# 测试连接功能
```

## 必须满足的验收标准

- [ ] 继承 `BaseAdapter`，实现 3 个 `do*` 方法
- [ ] `configSchema` 完整定义（connection + auth + advanced 字段）
- [ ] 错误使用 `normalizeError()` 统一分类
- [ ] 连接测试返回 latencyMs
- [ ] 已在 `index.ts` 注册
- [ ] 已在 `shared/accessLayerTypes.ts` 添加类型
- [ ] 密码字段 type 为 `'password'`
- [ ] `pnpm check` 通过

## BaseAdapter 提供的能力（无需重写）

| 能力 | 方法 | 说明 |
|------|------|------|
| 超时保护 | `withTimeout()` | 自动包装，默认 10s |
| 重试逻辑 | `withRetry()` | 指数退避，最多 3 次 |
| 连接池 | `ConnectionPool<T>` | 可选，有状态协议使用 |
| 指标收集 | `getMetrics()` | 自动统计连接/查询/延迟/错误 |
| 错误规范化 | `normalizeError()` | 正则匹配分类 CONNECTION/AUTH/TIMEOUT 等 |

## 常见错误和预防

| 错误 | 后果 | 预防 |
|------|------|------|
| 不继承 BaseAdapter | 丢失超时/重试/指标能力 | 必须继承 BaseAdapter |
| 密码字段 type 为 'string' | 密码明文显示 | 密码/密钥字段 type = 'password' |
| 不用 normalizeError | 前端显示原始错误 | catch 中调用 normalizeError |
| 忘记更新 accessLayerTypes | 前端看不到新协议 | 3 个文件缺一不可 |
| 连接后不断开 | 连接泄漏 | try-finally 确保 disconnect |
| defaultTimeoutMs 太短 | 慢网络下连接失败 | 工业协议建议 15-30s |

## 示例

### 好的示例 — 完整的错误处理和资源清理

```typescript
protected async doTestConnection(params, auth): Promise<ConnectionTestResult> {
  const start = Date.now();
  let client: MyClient | null = null;
  try {
    client = new MyClient(params.host, params.port);
    await client.connect();
    const info = await client.getServerInfo();
    return { success: true, latencyMs: Date.now() - start, message: '连接成功', details: info };
  } catch (err) {
    return { success: false, latencyMs: Date.now() - start, message: normalizeError(err, this.protocolType).message };
  } finally {
    await client?.disconnect();  // 确保清理
  }
}
```

### 坏的示例 — 无错误处理、无清理

```typescript
protected async doTestConnection(params, auth): Promise<ConnectionTestResult> {
  const client = new MyClient(params.host, params.port);
  await client.connect();  // 如果失败？没有 catch
  return { success: true, latencyMs: 0, message: 'ok' };
  // client 没有 disconnect — 泄漏!
}
```

## 涉及文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/services/protocol-adapters/[protocol].adapter.ts` | **创建** | 适配器实现 |
| `server/services/protocol-adapters/index.ts` | **修改** | 注册适配器 |
| `shared/accessLayerTypes.ts` | **修改** | 添加协议类型 |
| `server/services/protocol-adapters/base.ts` | 只读参考 | BaseAdapter 基类 |
