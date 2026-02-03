# 西联智能平台 - Kafka 企业级消息队列部署指南

## 概述

本文档介绍如何在西联智能平台中部署和配置 Apache Kafka 企业级消息队列系统。Kafka 用于实现高吞吐量、低延迟的实时数据流处理，支持设备遥测数据采集、异常检测告警、工作流事件等场景。

## 架构说明

### 组件说明

| 组件 | 说明 | 端口 |
|------|------|------|
| Kafka Broker | 消息队列核心服务 | 9092 (外部), 9093 (内部) |
| Zookeeper | Kafka 集群协调服务 | 2181 |
| Kafka UI | Web 管理界面 | 8080 |
| Schema Registry | 消息模式管理（可选） | 8081 |

### 主题定义

| 主题名称 | 用途 |
|----------|------|
| `xilian.sensor.readings` | 传感器读数数据流 |
| `xilian.telemetry` | 设备遥测数据流 |
| `xilian.device.events` | 设备事件（状态变化、错误等） |
| `xilian.anomaly.alerts` | 异常告警通知 |
| `xilian.anomalies` | 异常检测结果 |
| `xilian.aggregations` | 数据聚合结果 |
| `xilian.diagnosis.tasks` | 诊断任务队列 |
| `xilian.workflow.events` | 工作流事件 |
| `xilian.system.logs` | 系统日志 |

## 快速部署

### 前置条件

- Docker 20.10+
- Docker Compose 2.0+
- 至少 4GB 可用内存
- 至少 10GB 可用磁盘空间

### 步骤 1: 启动 Kafka 集群

```bash
# 进入项目目录
cd xilian-platform/docker

# 启动基础服务（Kafka + Kafka UI）
docker-compose -f docker-compose.kafka.yml up -d

# 或启动完整服务（包含 Schema Registry、Kafka Connect、ksqlDB）
docker-compose -f docker-compose.kafka.yml --profile full up -d
```

### 步骤 2: 验证服务状态

```bash
# 检查容器状态
docker-compose -f docker-compose.kafka.yml ps

# 检查 Kafka 日志
docker logs xilian-kafka

# 列出主题
docker exec xilian-kafka kafka-topics.sh --bootstrap-server localhost:9092 --list
```

### 步骤 3: 配置环境变量

在项目根目录的 `.env` 文件中添加：

```env
# Kafka 配置
KAFKA_BROKERS=localhost:9092

# 可选：多 broker 配置
# KAFKA_BROKERS=kafka1:9092,kafka2:9092,kafka3:9092
```

### 步骤 4: 重启应用服务

```bash
# 重启西联平台服务以加载 Kafka 配置
pnpm run dev
```

## 管理界面

### Kafka UI

访问 http://localhost:8080 可以使用 Kafka UI 管理界面：

- 查看集群状态
- 浏览主题和分区
- 查看消费者组
- 发送测试消息
- 查看消息内容

### 平台内置管理

西联平台提供内置的 Kafka 管理功能：

1. **系统设置 > 数据流监控**：查看事件流和异常检测
2. **API 接口**：通过 tRPC 调用 Kafka 管理 API

## API 使用示例

### 获取 Kafka 状态

```typescript
// 前端调用
const status = await trpc.kafka.getClusterStatus.query();
console.log(status);
// { isConfigured: true, mode: 'kafka', brokers: ['localhost:9092'], ... }
```

### 发布事件

```typescript
// 后端调用
import { kafkaEventBus } from './server/kafka';

await kafkaEventBus.publish('xilian.sensor.readings', {
  eventType: 'sensor_reading',
  severity: 'info',
  source: 'sensor',
  data: { value: 25.5, unit: '°C' },
  metadata: { deviceId: 'dev001', sensorId: 'temp001' },
});
```

### 订阅事件

```typescript
import { kafkaEventBus } from './server/kafka';

await kafkaEventBus.subscribe(
  'xilian.anomaly.alerts',
  async (event) => {
    console.log('收到异常告警:', event);
    // 处理告警...
  },
  'anomaly-handler-group'
);
```

## 生产环境配置

### 高可用配置

对于生产环境，建议部署多节点 Kafka 集群：

```yaml
# docker-compose.kafka-cluster.yml
services:
  kafka1:
    image: confluentinc/cp-kafka:7.5.0
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zk1:2181,zk2:2181,zk3:2181
      # ...

  kafka2:
    image: confluentinc/cp-kafka:7.5.0
    environment:
      KAFKA_BROKER_ID: 2
      # ...

  kafka3:
    image: confluentinc/cp-kafka:7.5.0
    environment:
      KAFKA_BROKER_ID: 3
      # ...
```

### 性能调优

```env
# 生产环境推荐配置
KAFKA_NUM_PARTITIONS=6
KAFKA_DEFAULT_REPLICATION_FACTOR=3
KAFKA_MIN_INSYNC_REPLICAS=2
KAFKA_LOG_RETENTION_HOURS=168
KAFKA_MESSAGE_MAX_BYTES=10485760
```

### 安全配置

```env
# 启用 SASL/SSL 认证
KAFKA_SECURITY_PROTOCOL=SASL_SSL
KAFKA_SASL_MECHANISM=PLAIN
KAFKA_SASL_USERNAME=admin
KAFKA_SASL_PASSWORD=your-secure-password
```

## 监控与告警

### Prometheus 指标

Kafka 暴露 JMX 指标，可通过 JMX Exporter 导出到 Prometheus：

```yaml
# 添加 JMX Exporter
kafka:
  environment:
    KAFKA_JMX_PORT: 9999
    KAFKA_JMX_HOSTNAME: localhost
```

### 关键监控指标

| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| `kafka_server_BrokerTopicMetrics_MessagesInPerSec` | 消息入站速率 | > 10000/s |
| `kafka_server_ReplicaManager_UnderReplicatedPartitions` | 副本不足分区数 | > 0 |
| `kafka_consumer_lag` | 消费者延迟 | > 1000 |

## 故障排查

### 常见问题

**1. Kafka 连接失败**

```bash
# 检查 Kafka 是否运行
docker ps | grep kafka

# 检查端口是否开放
nc -zv localhost 9092

# 检查网络连接
docker network inspect xilian-network
```

**2. 消费者延迟过高**

```bash
# 查看消费者组状态
docker exec xilian-kafka kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe --group your-consumer-group
```

**3. 磁盘空间不足**

```bash
# 清理旧日志
docker exec xilian-kafka kafka-delete-records.sh \
  --bootstrap-server localhost:9092 \
  --offset-json-file /tmp/offsets.json
```

### 日志位置

- Kafka 日志：`docker logs xilian-kafka`
- Zookeeper 日志：`docker logs xilian-zookeeper`
- 应用日志：`./logs/` 目录

## 回退到内存模式

如果 Kafka 不可用，系统会自动回退到内存模式：

1. 移除 `KAFKA_BROKERS` 环境变量
2. 重启应用服务
3. 系统将使用内存事件总线

内存模式特点：
- 无需外部依赖
- 适合开发和测试
- 不支持持久化
- 不支持分布式

## 更新日志

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2026-02-03 | 初始版本，支持 Kafka 3.6 |
