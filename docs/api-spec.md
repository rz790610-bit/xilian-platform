# 西联智能平台 API 规范文档

## 概述

本文档定义了西联智能平台的 API 规范，包括统一响应格式、错误码体系、限流策略等。

## API 版本

- **当前版本**: v1
- **支持版本**: v1
- **基础路径**: `/api/trpc`

## 统一响应格式

### 成功响应

```json
{
  "success": true,
  "code": 0,
  "message": "操作成功",
  "data": { ... },
  "timestamp": 1706000000000,
  "requestId": "req_abc123_xyz789",
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### 错误响应

```json
{
  "success": false,
  "code": 300001,
  "message": "参数错误",
  "error": {
    "details": "字段 deviceId 不能为空",
    "field": "deviceId"
  },
  "timestamp": 1706000000000,
  "requestId": "req_abc123_xyz789"
}
```

## 错误码体系

错误码格式: `XYYZZZ`
- X: 错误类别 (1-系统, 2-认证, 3-业务, 4-数据, 5-外部服务)
- YY: 模块代码
- ZZZ: 具体错误

### 系统错误 (1XXYYY)

| 错误码 | 名称 | 说明 | HTTP 状态码 |
|--------|------|------|-------------|
| 100001 | SYSTEM_INTERNAL_ERROR | 系统内部错误 | 500 |
| 100002 | SYSTEM_SERVICE_UNAVAILABLE | 服务暂不可用 | 503 |
| 100003 | SYSTEM_TIMEOUT | 请求超时 | 504 |
| 100004 | SYSTEM_RATE_LIMITED | 请求过于频繁 | 429 |
| 100005 | SYSTEM_MAINTENANCE | 系统维护中 | 503 |

### 认证错误 (2XXYYY)

| 错误码 | 名称 | 说明 | HTTP 状态码 |
|--------|------|------|-------------|
| 200001 | AUTH_UNAUTHORIZED | 未登录或登录已过期 | 401 |
| 200002 | AUTH_FORBIDDEN | 无权限访问 | 403 |
| 200003 | AUTH_TOKEN_INVALID | Token 无效 | 401 |
| 200004 | AUTH_TOKEN_EXPIRED | Token 已过期 | 401 |
| 200005 | AUTH_USER_DISABLED | 用户已被禁用 | 403 |
| 200006 | AUTH_ROLE_REQUIRED | 需要特定角色权限 | 403 |

### 业务错误 - 通用 (3XXYYY)

| 错误码 | 名称 | 说明 | HTTP 状态码 |
|--------|------|------|-------------|
| 300001 | BIZ_INVALID_PARAMS | 参数错误 | 400 |
| 300002 | BIZ_RESOURCE_NOT_FOUND | 资源不存在 | 404 |
| 300003 | BIZ_RESOURCE_EXISTS | 资源已存在 | 409 |
| 300004 | BIZ_OPERATION_FAILED | 操作失败 | 400 |
| 300005 | BIZ_VALIDATION_FAILED | 数据验证失败 | 400 |

### 业务错误 - 设备管理 (301YYY)

| 错误码 | 名称 | 说明 | HTTP 状态码 |
|--------|------|------|-------------|
| 301001 | DEVICE_NOT_FOUND | 设备不存在 | 404 |
| 301002 | DEVICE_OFFLINE | 设备离线 | 400 |
| 301003 | DEVICE_BUSY | 设备忙碌中 | 400 |
| 301004 | DEVICE_CONFIG_INVALID | 设备配置无效 | 400 |

### 业务错误 - 知识库 (302YYY)

| 错误码 | 名称 | 说明 | HTTP 状态码 |
|--------|------|------|-------------|
| 302001 | KNOWLEDGE_NOT_FOUND | 知识条目不存在 | 404 |
| 302002 | KNOWLEDGE_DUPLICATE | 知识条目已存在 | 409 |
| 302003 | KNOWLEDGE_VECTOR_FAILED | 向量化失败 | 500 |

### 业务错误 - Pipeline (303YYY)

| 错误码 | 名称 | 说明 | HTTP 状态码 |
|--------|------|------|-------------|
| 303001 | PIPELINE_NOT_FOUND | 管道不存在 | 404 |
| 303002 | PIPELINE_ALREADY_RUNNING | 管道已在运行中 | 400 |
| 303003 | PIPELINE_CONFIG_INVALID | 管道配置无效 | 400 |
| 303004 | PIPELINE_EXECUTION_FAILED | 管道执行失败 | 500 |

### 业务错误 - 插件 (304YYY)

| 错误码 | 名称 | 说明 | HTTP 状态码 |
|--------|------|------|-------------|
| 304001 | PLUGIN_NOT_FOUND | 插件不存在 | 404 |
| 304002 | PLUGIN_ALREADY_INSTALLED | 插件已安装 | 409 |
| 304003 | PLUGIN_DEPENDENCY_MISSING | 插件依赖缺失 | 400 |
| 304004 | PLUGIN_EXECUTION_FAILED | 插件执行失败 | 500 |

### 数据错误 (4XXYYY)

| 错误码 | 名称 | 说明 | HTTP 状态码 |
|--------|------|------|-------------|
| 400001 | DATA_INVALID_FORMAT | 数据格式错误 | 400 |
| 400002 | DATA_TOO_LARGE | 数据过大 | 413 |
| 400003 | DATA_INTEGRITY_ERROR | 数据完整性错误 | 400 |
| 400004 | DATA_QUERY_FAILED | 数据查询失败 | 500 |

### 外部服务错误 (5XXYYY)

| 错误码 | 名称 | 说明 | HTTP 状态码 |
|--------|------|------|-------------|
| 500001 | EXTERNAL_SERVICE_ERROR | 外部服务错误 | 502 |
| 500002 | EXTERNAL_SERVICE_TIMEOUT | 外部服务超时 | 504 |
| 501001 | EXTERNAL_KAFKA_ERROR | Kafka 服务错误 | 502 |
| 502001 | EXTERNAL_REDIS_ERROR | Redis 服务错误 | 502 |
| 503001 | EXTERNAL_CLICKHOUSE_ERROR | ClickHouse 服务错误 | 502 |
| 504001 | EXTERNAL_QDRANT_ERROR | Qdrant 服务错误 | 502 |

## 限流策略

### 预定义策略

| 策略名称 | 时间窗口 | 最大请求数 | 适用场景 |
|----------|----------|------------|----------|
| RELAXED | 60秒 | 1000 | 读取操作 |
| STANDARD | 60秒 | 100 | 一般操作 |
| STRICT | 60秒 | 30 | 写入操作 |
| VERY_STRICT | 60秒 | 10 | 敏感操作 |
| BULK | 300秒 | 20 | 批量操作 |

### 限流响应头

| 响应头 | 说明 |
|--------|------|
| X-RateLimit-Limit | 时间窗口内的最大请求数 |
| X-RateLimit-Remaining | 剩余可用请求数 |
| X-RateLimit-Reset | 限流重置时间（Unix 时间戳） |

## 请求/响应头

### 标准请求头

| 请求头 | 说明 | 是否必须 |
|--------|------|----------|
| X-Request-ID | 请求唯一标识 | 否（自动生成） |
| X-API-Version | API 版本 | 否 |
| X-Client-Version | 客户端版本 | 否 |

### 标准响应头

| 响应头 | 说明 |
|--------|------|
| X-Request-ID | 请求唯一标识 |
| X-Response-Time | 响应时间（毫秒） |

## API 端点列表

### 认证 (auth)

| 端点 | 方法 | 说明 |
|------|------|------|
| auth.me | Query | 获取当前用户信息 |
| auth.logout | Mutation | 退出登录 |

### 设备管理 (device)

| 端点 | 方法 | 说明 |
|------|------|------|
| device.register | Mutation | 注册设备 |
| device.list | Query | 获取设备列表 |
| device.get | Query | 获取设备详情 |
| device.updateStatus | Mutation | 更新设备状态 |
| device.delete | Mutation | 删除设备 |

### 知识库 (knowledge)

| 端点 | 方法 | 说明 |
|------|------|------|
| knowledge.create | Mutation | 创建知识条目 |
| knowledge.list | Query | 获取知识列表 |
| knowledge.search | Query | 搜索知识 |
| knowledge.update | Mutation | 更新知识条目 |
| knowledge.delete | Mutation | 删除知识条目 |

### Pipeline (pipeline)

| 端点 | 方法 | 说明 |
|------|------|------|
| pipeline.create | Mutation | 创建管道 |
| pipeline.list | Query | 获取管道列表 |
| pipeline.get | Query | 获取管道详情 |
| pipeline.start | Mutation | 启动管道 |
| pipeline.stop | Mutation | 停止管道 |
| pipeline.run | Mutation | 手动运行管道 |
| pipeline.delete | Mutation | 删除管道 |

### 插件 (plugin)

| 端点 | 方法 | 说明 |
|------|------|------|
| plugin.list | Query | 获取插件列表 |
| plugin.get | Query | 获取插件详情 |
| plugin.enable | Mutation | 启用插件 |
| plugin.disable | Mutation | 禁用插件 |
| plugin.execute | Mutation | 执行插件 |
| plugin.updateConfig | Mutation | 更新插件配置 |

### 时序数据 (clickhouse)

| 端点 | 方法 | 说明 |
|------|------|------|
| clickhouse.insertSensorReadings | Mutation | 插入传感器读数 |
| clickhouse.querySensorReadings | Query | 查询传感器读数 |
| clickhouse.queryAggregatedData | Query | 查询聚合数据 |
| clickhouse.queryAnomalies | Query | 查询异常数据 |
| clickhouse.getDeviceStats | Query | 获取设备统计 |

### Kafka (kafka)

| 端点 | 方法 | 说明 |
|------|------|------|
| kafka.getTopics | Query | 获取主题列表 |
| kafka.createTopic | Mutation | 创建主题 |
| kafka.deleteTopic | Mutation | 删除主题 |
| kafka.getMetrics | Query | 获取 Kafka 指标 |

### Redis (redis)

| 端点 | 方法 | 说明 |
|------|------|------|
| redis.getKeys | Query | 获取键列表 |
| redis.getValue | Query | 获取键值 |
| redis.setValue | Mutation | 设置键值 |
| redis.deleteKey | Mutation | 删除键 |
| redis.checkRateLimit | Query | 检查限流状态 |

## 使用示例

### JavaScript/TypeScript

```typescript
import { trpc } from '@/lib/trpc';

// 查询设备列表
const { data, isLoading, error } = trpc.device.list.useQuery({
  type: 'sensor',
  limit: 20,
});

// 创建管道
const createPipeline = trpc.pipeline.create.useMutation({
  onSuccess: (data) => {
    console.log('Pipeline created:', data);
  },
  onError: (error) => {
    console.error('Error:', error.data.code, error.data.message);
  },
});

createPipeline.mutate({
  id: 'my-pipeline',
  name: '数据采集管道',
  source: { type: 'http', config: { url: 'https://api.example.com/data' } },
  processors: [{ type: 'filter', config: { condition: { field: 'status', operator: 'eq', value: 'active' } } }],
  sink: { type: 'clickhouse', config: { table: 'sensor_readings' } },
});
```

### cURL

```bash
# 获取设备列表
curl -X GET 'http://localhost:3000/api/trpc/device.list?input={"limit":20}' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: req_test_123'

# 创建管道
curl -X POST 'http://localhost:3000/api/trpc/pipeline.create' \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "my-pipeline",
    "name": "数据采集管道",
    "source": { "type": "http", "config": { "url": "https://api.example.com/data" } },
    "processors": [],
    "sink": { "type": "clickhouse", "config": { "table": "sensor_readings" } }
  }'
```

## 更新日志

### v1.0.0 (2026-02-04)

- 初始版本发布
- 定义统一响应格式
- 定义错误码体系
- 定义限流策略
