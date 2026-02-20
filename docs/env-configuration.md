# 环境变量配置指南

## 概述

xilian-platform v5.0 使用环境变量进行外部服务配置。所有配置项均有合理默认值，仅 `GROK_API_KEY` 为必填项（启用 AI 推理功能时）。

## 快速开始

```bash
# 复制配置模板
cp .env.template .env

# 编辑配置（至少填写 GROK_API_KEY）
vim .env
```

## 配置项清单

### 1. Grok / xAI API 配置

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `GROK_API_KEY` | **是** | (空) | xAI API Key，从 https://console.x.ai 获取 |
| `GROK_API_BASE_URL` | 否 | `https://api.x.ai/v1` | API 基础 URL |
| `GROK_DEFAULT_MODEL` | 否 | `grok-3` | 默认推理模型 |
| `GROK_REASONING_MODEL` | 否 | `grok-3-mini` | 复杂任务推理模型 |
| `GROK_MAX_CONCURRENCY` | 否 | `5` | 最大并发请求数 (1-50) |
| `GROK_REQUEST_TIMEOUT_MS` | 否 | `60000` | 单次请求超时毫秒 (≥5000) |
| `GROK_MAX_RETRIES` | 否 | `3` | 失败重试次数 |
| `GROK_RETRY_BASE_DELAY_MS` | 否 | `1000` | 重试间隔基数毫秒（指数退避） |
| `GROK_RATE_LIMIT_PER_MINUTE` | 否 | `60` | 每分钟请求限制 |
| `GROK_TOKEN_LIMIT_PER_MINUTE` | 否 | `100000` | 每分钟 Token 限制 |
| `GROK_DEFAULT_TEMPERATURE` | 否 | `0.3` | 默认 temperature (0-2)，工业场景建议低温 |
| `GROK_DEFAULT_MAX_TOKENS` | 否 | `4096` | 默认最大输出 Token 数 |
| `GROK_ENABLE_TOOL_CALLING` | 否 | `true` | 是否启用 12 个内置工具 |
| `GROK_ENABLE_REASONING_PERSISTENCE` | 否 | `true` | 是否持久化推理链 |
| `GROK_ENABLE_REACT_LOOP` | 否 | `true` | 是否启用 ReAct 循环 |
| `GROK_REACT_MAX_ITERATIONS` | 否 | `10` | ReAct 最大循环次数 (1-50) |
| `GROK_ENABLE_STRUCTURED_OUTPUT` | 否 | `true` | 是否启用结构化输出 |

### 2. PostgreSQL 配置

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `DATABASE_URL` | **是** | - | PostgreSQL 连接字符串 |

### 3. ClickHouse 配置（时序数据）

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `CLICKHOUSE_HOST` | 否 | `localhost` | ClickHouse 主机地址 |
| `CLICKHOUSE_PORT` | 否 | `8123` | HTTP 端口 |
| `CLICKHOUSE_DATABASE` | 否 | `xilian` | 数据库名 |
| `CLICKHOUSE_USER` | 否 | `default` | 用户名 |
| `CLICKHOUSE_PASSWORD` | 否 | (空) | 密码 |

### 4. Neo4j 配置（知识图谱）

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `NEO4J_URI` | 否 | `bolt://localhost:7687` | Neo4j 连接 URI |
| `NEO4J_USER` | 否 | `neo4j` | 用户名 |
| `NEO4J_PASSWORD` | 否 | (空) | 密码 |

### 5. MinIO 配置（对象存储）

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `MINIO_ENDPOINT` | 否 | `localhost` | MinIO 服务地址 |
| `MINIO_PORT` | 否 | `9000` | 服务端口 |
| `MINIO_ACCESS_KEY` | 否 | `minioadmin` | Access Key |
| `MINIO_SECRET_KEY` | 否 | `minioadmin` | Secret Key |
| `MINIO_BUCKET_RAW` | 否 | `xilian-raw` | 原始数据桶名 |
| `MINIO_BUCKET_MODELS` | 否 | `xilian-models` | 模型制品桶名 |

### 6. gRPC 微服务配置

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `DEPLOYMENT_MODE` | 否 | `monolith` | 部署模式：`monolith` / `microservices` |
| `DEVICE_SERVICE_HOST` | 否 | `localhost` | 设备服务主机 |
| `DEVICE_SERVICE_PORT` | 否 | `50051` | 设备服务端口 |
| `ALGORITHM_SERVICE_HOST` | 否 | `localhost` | 算法服务主机 |
| `ALGORITHM_SERVICE_PORT` | 否 | `50052` | 算法服务端口 |
| `GRPC_TLS_CERT_PATH` | 否 | - | TLS 证书路径 |
| `GRPC_TLS_KEY_PATH` | 否 | - | TLS 私钥路径 |
| `GRPC_TLS_CA_PATH` | 否 | - | CA 证书路径 |

## 配置验证

启动时系统会自动验证配置完整性。也可以通过代码手动验证：

```typescript
import { loadGrokApiConfig, validateGrokApiConfig } from './server/platform/config/grok-api.config';

const config = loadGrokApiConfig();
const { valid, errors } = validateGrokApiConfig(config);
if (!valid) {
  console.error('配置错误:', errors);
}
```

## 生产环境建议

1. **GROK_API_KEY**: 必须配置，否则 AI 推理功能不可用
2. **GROK_DEFAULT_TEMPERATURE**: 工业场景建议 0.1-0.3，确保输出稳定性
3. **GROK_MAX_CONCURRENCY**: 根据 API 配额调整，避免触发限流
4. **DEPLOYMENT_MODE**: 生产环境建议 `microservices` 模式以实现服务隔离
5. **GRPC_TLS_***: 生产环境必须配置 TLS 证书
