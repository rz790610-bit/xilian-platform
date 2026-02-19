# 代码审查发现记录

## 第一轮：P0 基座加固

### 1. 认知调度器（cognition-scheduler.ts）

**问题 1 [中] — scheduleNext 中 dequeue 在 acquire 之前**
- `dequeue()` 在 `semaphore.acquire()` 之前执行
- 如果信号量满，item 已经从队列中取出但还没执行，此时 item 被 Promise 闭包持有
- 如果 scheduleNext 被多次调用，可能同时 dequeue 多个 item 然后全部等待 acquire
- 这不是 bug（因为 acquire 最终会 resolve），但会导致队列深度指标不准确
- **建议**：在 acquire 成功后再 dequeue，或者添加 "pending" 状态计数

**问题 2 [低] — 重试时 unshift 到优先队列头部**
- 重试的 item 被 `unshift` 到队列头部
- 如果一个 item 持续失败，它会反复占据队列头部，阻塞同优先级的其他 item
- **建议**：重试的 item 应该 push 到队列尾部，或者使用单独的重试队列

**问题 3 [低] — concurrencyMultipliers.high_pressure = 1.5 反直觉**
- 高压模式下并发乘数是 1.5（增加并发）
- 这意味着高压时反而增加并发，可能加剧系统压力
- **确认**：如果设计意图是"高压时加速消化队列"则合理，但需要文档说明

### 2. EventBus 异步批写（kafkaEventBus.ts）

**问题 4 [低] — flushDbBuffer 中 dbFlushing 标志非原子**
- `if (this.dbFlushing) return` + `this.dbFlushing = true`
- **结论**：在 Node.js 事件循环模型下实际安全，无需修复

**问题 5 [中] — dbFlushTimer 启动位置**
- 已确认：timer 在 `initialize()` 方法中启动
- **结论**：无问题

**问题 6 [低] — 背压只丢弃 info，但 warning/error/critical 无上限**
- 背压时只丢弃 info 级别
- 如果大量 warning/error 事件涌入，缓冲区仍会无限增长
- **建议**：设置绝对上限（如 10000），超过时所有级别都丢弃

### 3. SQL 注入修复（pipeline.engine.ts）

**问题 7 [高] — execMySQL SELECT 仍可 UNION 注入** ⚠️ 需修复
- 虽然有 validateReadOnlyQuery 白名单验证，但 SELECT 语句仍可能包含 UNION
- 例如：`SELECT * FROM users WHERE 1=1 UNION SELECT password FROM admin_users`
- UNION 不在 FORBIDDEN_SQL_KEYWORDS 中
- **建议**：将 UNION 加入黑名单

**问题 8 [中] — validateIdentifier 的正则不支持中文表名**
- `/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/` 不支持 Unicode
- **建议**：根据实际需求决定是否支持

### 4. 连接池配置（db/index.ts）

**问题 9 [低] — 连接池无健康检查**
- 没有定期 ping 来检测死连接
- **建议**：添加定期健康检查

### 5. 路由鉴权（docker.router.ts 等）

**问题 10 [中] — adminProcedure 实现已确认**
- 已确认 trpc.ts 中 adminProcedure 有独立的管理员角色检查（检查 ctx.user.role === 'admin'）
- **结论**：实现正确

---

## 第二轮：ID 体系统一

### 整体评价
类型层面统一做得干净，所有接口都添加了 nodeId/deviceCode 字段，deviceId 标记为 @deprecated。

**问题 11 [中] — streamProcessor.persistReading 参数名仍为 deviceId** ⚠️ 需修复
- 参数名仍是 `deviceId`，但实际传入的是 `deviceCode`
- **建议**：将参数名改为 `deviceCode`

**问题 12 [中] — streamProcessor.saveAggregate 中 result.deviceId 残留** ⚠️ 需修复
- `deviceCode: result.deviceId` — AggregateResult 接口应添加 deviceCode 字段
- **建议**：修复接口和赋值

**问题 13 [低] — kafkaStream.processor 异常表 nodeId 字段存储的是 deviceCode**
- 语义混乱但不影响功能
- **建议**：在 schema 中添加 deviceCode 列

**问题 14 [低] — cognition-unit.ts fallback 链歧义**
- `nodeId: stimulus.nodeId || stimulus.deviceId` — 旧数据中 deviceId 含义不确定
- **建议**：添加日志警告

**问题 15 [低] — streamProcessor 事件 payload 仍使用 deviceId 键名**
- 为兼容性保留，但新消费者会继续使用 deviceId
- **建议**：同时输出 deviceCode 和 deviceId

---

## 第三轮：数据动脉全链路

### 1. ClickHouse SQL（03_realtime_telemetry.sql）

**问题 16 [高] — Kafka Engine 与 TelemetryClickHouseSink 双重消费** ⚠️ 需修复
- ClickHouse 的 Kafka Engine 表（realtime_telemetry_kafka_queue）直接订阅 `telemetry.raw`
- 同时 TelemetryClickHouseSink 服务也订阅 `telemetry.raw` 并写入同一张表
- 这会导致**数据重复写入**：每条消息被写入两次
- **建议**：二选一。保留 Kafka Engine（ClickHouse 原生消费，性能更好），删除 Sink 服务对 telemetry.raw 的订阅；或者保留 Sink 服务（更灵活，支持解析/去重/背压），删除 Kafka Engine 表

**问题 17 [中] — SAMPLE BY intHash32(device_code) 对 String 类型效率低**
- SAMPLE BY 需要 ORDER BY 中包含 SAMPLE KEY 的列
- `intHash32(device_code)` 不在 ORDER BY 中，ClickHouse 会报错或忽略
- **建议**：移除 SAMPLE BY 或将 `intHash32(device_code)` 加入 ORDER BY

**问题 18 [中] — 聚合物化视图从 realtime_telemetry 读取而非 Kafka Queue**
- 三级聚合视图（1min/1hour/1day）从 realtime_telemetry 主表 SELECT
- 这意味着它们是在数据**写入主表后**才触发聚合
- 如果使用 Kafka Engine 路径，数据先进 kafka_queue → MV 写入主表 → 聚合 MV 再触发
- 这是正确的（ClickHouse MV 是插入触发的）
- **结论**：设计正确，但需要确认聚合 MV 是否会被 Kafka Engine MV 的 INSERT 触发（答案是会的）

### 2. 特征提取服务

**问题 19 [中] — DSP FFT 对大数组性能问题**
- `peak()` 函数使用 `Math.max(...data.map(Math.abs))`
- 当 data 长度超过 ~65536 时，`Math.max(...array)` 会导致 "Maximum call stack size exceeded"
- 同样的问题存在于 `peakToPeak()`
- **建议**：改用循环实现

**问题 20 [中] — 特征提取服务与 Sink 消费同一 topic 的竞争**
- FeatureExtractionService 订阅 `telemetry.raw`
- TelemetryClickHouseSink 也订阅 `telemetry.raw`
- 如果使用不同的 consumer group，两者都能收到全量数据（正确）
- 但如果 Kafka Engine 也在消费 `telemetry.raw`，就是三方消费
- **建议**：明确消费者拓扑，确保不重复写入

**问题 21 [低] — VibrationExtractor 包络分析无条件执行**
- 包络分析调用 envelope()，内部做两次 FFT
- 对于每条振动消息都执行，可能影响吞吐量
- **建议**：设为可选，或仅在采样率 > 某阈值时执行

### 3. 网关→Kafka 桥接服务

**问题 22 [中] — 每条消息写两个 topic（双倍写入）**
- 第 531-544 行：每条消息同时写入 `telemetry.raw.{gateway_id}` 和 `telemetry.raw`
- 这意味着 Kafka 存储量翻倍
- 如果下游消费者只订阅 `telemetry.raw`，按网关分区的 topic 就是浪费
- **建议**：只写一个 topic，使用 Kafka 消息的 key 或 header 区分网关

**问题 23 [低] — MQTT QoS 1 但无消息确认**
- 订阅使用 QoS 1（至少一次），但 handleMqttMessage 中没有显式 ack
- mqtt.js 默认自动 ack，所以功能正确
- 但如果 Kafka 写入失败，消息已经被 ack 了，会丢数据
- **建议**：使用手动 ack 模式，在 Kafka 写入成功后再确认

### 4. TelemetryClickHouseSink

**问题 24 [中] — parseToRow 中 value 为 NaN 时跳过整条消息**
- 第 336 行：如果 value 不是有效数字，整条消息被丢弃
- 但对于波形数据（振动/声学），value 字段可能不存在或为 null
- 这会导致所有波形类型的原始数据被 Sink 丢弃
- **建议**：波形数据的 value 应该设为 0 或 NaN 标记，而非丢弃

**问题 25 [低] — 去重 Set 清理策略过于粗暴**
- cleanDedupSet 在超过 100,000 条时直接 clear()
- 清空后的短时间内可能出现重复数据
- **建议**：使用时间窗口或 LRU 策略

### 5. 编排器（data-artery.bootstrap.ts）

**问题 26 [低] — 关闭时固定等待 1 秒**
- 第 127、138 行：`await new Promise(resolve => setTimeout(resolve, 1000))`
- 如果中间层有大量待处理消息，1 秒可能不够
- **建议**：改为轮询检查缓冲区是否为空，设置最大等待时间

---

## 需要修复的关键缺陷汇总

| # | 严重度 | 问题 | 文件 |
|---|--------|------|------|
| 7 | 高 | UNION 注入未拦截 | pipeline.engine.ts |
| 16 | 高 | Kafka Engine + Sink 双重消费导致数据重复 | 03_realtime_telemetry.sql + telemetryClickhouseSink.service.ts |
| 17 | 中 | SAMPLE BY 与 ORDER BY 不匹配 | 03_realtime_telemetry.sql |
| 19 | 中 | Math.max(...array) 大数组栈溢出 | dsp-utils.ts |
| 22 | 中 | 每条消息双倍写入 Kafka | gateway-kafka-bridge.service.ts |
| 24 | 中 | 波形数据被 Sink 丢弃 | telemetryClickhouseSink.service.ts |
| 11 | 中 | persistReading 参数名 deviceId 残留 | streamProcessor.service.ts |
| 12 | 中 | saveAggregate 中 result.deviceId 残留 | streamProcessor.service.ts |
