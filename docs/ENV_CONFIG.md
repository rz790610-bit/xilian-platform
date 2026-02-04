# PortAI Nexus - 环境变量配置指南

本文档详细说明了 PortAI Nexus 平台所需的所有环境变量配置。

## 快速开始

创建 `.env` 文件并配置以下必需变量：

```bash
# 复制示例配置
cp .env.template .env

# 编辑配置
nano .env
```

---

## 必需配置

### 应用配置

| 变量名 | 说明 | 默认值 | 示例 |
|--------|------|--------|------|
| `NODE_ENV` | 运行环境 | `production` | `production` / `development` |
| `APP_PORT` | 应用端口 | `3000` | `3000` |
| `JWT_SECRET` | JWT 签名密钥（**必须修改**） | - | `your-super-secret-key-min-32-chars` |

### MySQL 数据库

| 变量名 | 说明 | 默认值 | 示例 |
|--------|------|--------|------|
| `MYSQL_HOST` | 数据库主机 | `mysql` | `localhost` / `mysql.example.com` |
| `MYSQL_PORT` | 数据库端口 | `3306` | `3306` |
| `MYSQL_DATABASE` | 数据库名称 | `portai_nexus` | `portai_nexus` |
| `MYSQL_USER` | 数据库用户 | `portai` | `portai` |
| `MYSQL_PASSWORD` | 数据库密码 | `portai123` | `your-secure-password` |
| `DATABASE_URL` | 完整连接字符串 | - | `mysql://user:pass@host:3306/db` |

### Redis 缓存

| 变量名 | 说明 | 默认值 | 示例 |
|--------|------|--------|------|
| `REDIS_HOST` | Redis 主机 | `redis` | `localhost` |
| `REDIS_PORT` | Redis 端口 | `6379` | `6379` |
| `REDIS_PASSWORD` | Redis 密码（可选） | - | `your-redis-password` |

---

## 可选配置

### Kafka 消息队列

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `KAFKA_BROKERS` | Kafka Broker 地址 | `kafka:9092` |

### ClickHouse 分析数据库

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `CLICKHOUSE_HOST` | ClickHouse 主机 | `clickhouse` |
| `CLICKHOUSE_PORT` | ClickHouse HTTP 端口 | `8123` |
| `CLICKHOUSE_DATABASE` | 数据库名称 | `default` |

### Qdrant 向量数据库

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `QDRANT_HOST` | Qdrant 主机 | `qdrant` |
| `QDRANT_PORT` | Qdrant HTTP 端口 | `6333` |

### Ollama LLM 引擎

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `OLLAMA_HOST` | Ollama 主机 | `ollama` |
| `OLLAMA_PORT` | Ollama 端口 | `11434` |
| `OLLAMA_DEFAULT_MODEL` | 默认模型 | `llama3.1:8b` |

### Prometheus 监控

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PROMETHEUS_HOST` | Prometheus 主机 | `prometheus` |
| `PROMETHEUS_PORT` | Prometheus 端口 | `9090` |

### Elasticsearch 日志

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `ELASTICSEARCH_HOST` | Elasticsearch 主机 | `elasticsearch` |
| `ELASTICSEARCH_PORT` | Elasticsearch 端口 | `9200` |
| `ELASTICSEARCH_USERNAME` | 用户名（可选） | - |
| `ELASTICSEARCH_PASSWORD` | 密码（可选） | - |

### Jaeger 追踪

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `JAEGER_HOST` | Jaeger 主机 | `jaeger` |
| `JAEGER_PORT` | Jaeger UI 端口 | `16686` |

### Grafana 仪表盘

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `GRAFANA_PORT` | Grafana 端口 | `3001` |
| `GRAFANA_USER` | 管理员用户名 | `admin` |
| `GRAFANA_PASSWORD` | 管理员密码 | `admin123` |

---

## 高级配置

### Kubernetes 集成

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `KUBECONFIG` | kubeconfig 文件路径 | 自动检测 |

### HashiCorp Vault

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `VAULT_HOST` | Vault 主机 | - |
| `VAULT_PORT` | Vault 端口 | `8200` |
| `VAULT_TOKEN` | Vault 访问令牌 | - |

### ArgoCD

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `ARGOCD_HOST` | ArgoCD 主机 | - |
| `ARGOCD_PORT` | ArgoCD 端口 | `443` |
| `ARGOCD_TOKEN` | ArgoCD API 令牌 | - |

### Apache Airflow

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `AIRFLOW_HOST` | Airflow 主机 | - |
| `AIRFLOW_PORT` | Airflow 端口 | `8080` |
| `AIRFLOW_USERNAME` | Airflow 用户名 | `admin` |
| `AIRFLOW_PASSWORD` | Airflow 密码 | - |

### Kafka Connect

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `KAFKA_CONNECT_HOST` | Kafka Connect 主机 | - |
| `KAFKA_CONNECT_PORT` | Kafka Connect 端口 | `8083` |

---

## 安全建议

1. **生产环境必须修改所有默认密码**
2. **JWT_SECRET 至少 32 个字符**
3. **使用强密码策略**
4. **定期轮换密钥和令牌**
5. **不要将 `.env` 文件提交到版本控制**

---

## 配置示例

### 最小化配置（仅核心服务）

```env
NODE_ENV=production
APP_PORT=3000
JWT_SECRET=your-super-secret-jwt-key-change-in-production

DATABASE_URL=mysql://portai:portai123@localhost:3306/portai_nexus
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 完整配置（所有服务）

```env
NODE_ENV=production
APP_PORT=3000
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Database
DATABASE_URL=mysql://portai:secure-password@mysql:3306/portai_nexus

# Cache
REDIS_HOST=redis
REDIS_PORT=6379

# Message Queue
KAFKA_BROKERS=kafka:9092

# Vector DB
QDRANT_HOST=qdrant
QDRANT_PORT=6333

# LLM
OLLAMA_HOST=ollama
OLLAMA_PORT=11434

# Monitoring
PROMETHEUS_HOST=prometheus
PROMETHEUS_PORT=9090
ELASTICSEARCH_HOST=elasticsearch
ELASTICSEARCH_PORT=9200
JAEGER_HOST=jaeger
JAEGER_PORT=16686
```
