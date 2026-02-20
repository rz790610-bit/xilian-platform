# 全栈架构代码审查报告 — 问题清单

## P0（5项 — 数据管道致命断点）

### P0-1: kafkaStream.processor.ts — 订阅废弃 Topic
- 订阅 KAFKA_TOPICS.TELEMETRY = "xilian.telemetry"（废弃）
- 真实数据在 TELEMETRY_FEATURE = "telemetry.feature"
- 修复：改订阅 KAFKA_TOPICS.TELEMETRY_FEATURE

### P0-2: clickhouse.client.ts — ClickHouse 表未初始化
- sensor_readings / telemetry_data / 物化视图均不存在
- 修复：执行 ClickHouse 建表脚本

### P0-3: grokDiagnosticAgent.service.ts — getDb() 同步调用
- getDb() 返回 Promise 但代码当作同步使用
- 所有工具调用静默失败返回"数据库未连接"
- 修复：改为 await getDb()

### P0-4: kafkaStream.processor.ts — 聚合数据写 MySQL 而非 ClickHouse
- event_store（MySQL）不适合时序聚合
- 修复：聚合结果写入 ClickHouse

### P0-5: telemetry.db.service.ts — 振动聚合数据写 MySQL
- 2000 传感器高频写入 MySQL 性能瓶颈
- 修复：迁移到 ClickHouse 时序表

## P1（5项）

### P1-1: gateway.service.ts — Admin 操作无鉴权
- 所有 Gateway 操作使用 publicProcedure
- 修复：改为 adminProcedure

### P1-2: meta-learner.ts — 三个 Provider 无实现
- KGHistoryProvider/OCTransferProvider/ShadowEvalProvider 空壳
- 修复：实现 KGHistoryProvider

### P1-3: plugin.engine.ts — pluginStorage 无持久化
- 内存 Map，服务重启丢失
- 修复：对接 Redis

### P1-4: grokDiagnosticAgent.service.ts — sessions 无大小限制
- 并发大量请求时内存泄漏
- 修复：加 LRU 限制（max 1000）

### P1-5: kafka-topics.const.ts — 生产/废弃 Topic 混用
- 修复：废弃 Topic 标记 @deprecated

## P2（5项）

### P2-1: anomalyDetections 双写（MySQL+ClickHouse）
### P2-2: 缓存键碰撞风险（djb2 hash）
### P2-3: murphyCombination 逻辑误差
### P2-4: parseDiagnosticOutput 正则提取不稳定
### P2-5: access-layer 两个建表来源
