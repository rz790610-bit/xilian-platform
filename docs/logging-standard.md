# PortAI Nexus — 日志语义标准

> 整改方案 v2.1 A-01 | 版本 1.0 | 2026-02-23

## 1. 目的

本文档定义了平台全局统一的日志级别语义标准，解决当前 `error` 日志（463 处）远超 `info` 日志（300 处）的倒挂问题。所有新代码必须遵循此标准，存量代码在修改时逐步对齐。

## 2. 级别定义

| 级别 | 语义 | 触发条件 | 是否告警 | 示例 |
|------|------|----------|----------|------|
| **fatal** | 进程必须退出 | 无法恢复的致命错误 | 立即 PagerDuty | JWT_SECRET 生产环境为默认值 |
| **error** | 需要人工介入 | 影响用户请求的失败、数据丢失风险 | Slack #alerts | 数据库连接池耗尽、Kafka 消费者崩溃 |
| **warn** | 需要关注但可自愈 | 可降级的服务失败、配置不理想 | 日报汇总 | OTel 初始化失败（继续无追踪）、Redis 重连 |
| **info** | 正常业务里程碑 | 启动/关闭、关键业务操作完成 | 不告警 | Server listening on :3000、用户登录 |
| **debug** | 开发诊断 | 详细执行路径、变量值 | 不告警 | SQL 查询详情、缓存命中/未命中 |
| **trace** | 极细粒度 | 函数入口/出口、循环迭代 | 不告警 | 每条 Kafka 消息的 offset |

## 3. 关键规则

### 3.1 catch 块日志级别选择

```typescript
// ✅ 正确：可降级的服务失败用 warn
try {
  await outboxPublisher.start();
} catch (err) {
  log.warn({ err }, 'Outbox Publisher failed to start (degraded mode)');
}

// ✅ 正确：影响核心功能的失败用 error
try {
  await db.connect();
} catch (err) {
  log.error({ err }, 'Database connection failed');
}

// ❌ 错误：所有 catch 都用 error
try {
  await optionalService.start();
} catch (err) {
  log.error(err); // 应该是 warn
}
```

### 3.2 安全警告必须使用结构化日志

```typescript
// ❌ 错误：使用 console.warn（不进入 Pino 日志流）
console.warn('[SECURITY] AIRFLOW_PASSWORD not set');

// ✅ 正确：使用 log.warn + 结构化字段
log.warn({ security: true, field: 'AIRFLOW_PASSWORD' }, 
  'Security credential not configured — MUST set in production');
```

### 3.3 启动序列日志

启动序列中的关键里程碑必须使用 `info` 级别，确保在默认 `LOG_LEVEL=info` 下可见：

```typescript
// ✅ 正确
log.info('[Startup] Server listening on http://localhost:3000/ (1.2s)');
log.info('[Platform] ✓ Security headers enabled');

// ❌ 错误（默认不可见）
log.debug('[Startup] Server listening on http://localhost:3000/');
```

### 3.4 Topology 聚合（高频日志）

对于高频重复日志（如设备心跳、Kafka 消息处理），使用聚合模式而非逐条输出：

```typescript
// ❌ 错误：每条消息都输出
kafkaConsumer.on('message', (msg) => {
  log.info(`Received message from ${msg.topic}`);
});

// ✅ 正确：聚合后定期输出
let messageCount = 0;
const REPORT_INTERVAL = 30_000; // 30秒

kafkaConsumer.on('message', (msg) => {
  messageCount++;
  log.trace({ topic: msg.topic, offset: msg.offset }, 'Kafka message received');
});

setInterval(() => {
  if (messageCount > 0) {
    log.info({ count: messageCount, interval: '30s' }, 'Kafka messages processed');
    messageCount = 0;
  }
}, REPORT_INTERVAL);
```

## 4. 迁移指南

### 4.1 error → warn 降级候选

以下模式的 `log.error` 应降级为 `log.warn`：

1. **可选服务启动失败**：OTel、Outbox Publisher、Saga Orchestrator、Adaptive Sampling 等
2. **外部服务暂时不可用**：Redis 重连、ClickHouse 查询超时（有重试机制）
3. **配置缺失但有默认值**：AIRFLOW_USERNAME 未设置、OTEL_SERVICE_NAME 使用默认值
4. **非关键后台任务失败**：健康检查、算法同步、DataFlowTracer 初始化

### 4.2 保持 error 级别的场景

1. **数据库连接失败**（无法降级）
2. **Kafka 消费者崩溃**（影响数据管道）
3. **tRPC 路由注册失败**（影响 API 可用性）
4. **文件系统写入失败**（数据丢失风险）

## 5. 审查清单

每次 PR 审查时，检查以下项目：

- [ ] 新增的 `log.error` 是否真的需要人工介入？
- [ ] catch 块中的日志级别是否与服务重要性匹配？
- [ ] 是否有 `console.log/warn/error` 遗留？（应全部使用 `createModuleLogger`）
- [ ] 高频路径是否使用了 `trace` 或聚合模式？
