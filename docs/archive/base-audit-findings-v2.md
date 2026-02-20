# 基座深度审查发现记录 v2

## 场景参数
- 100 台设备
- 100 个边缘终端
- 2000 个测点
- 采样频率假设: 1Hz (保守) / 10Hz (典型振动) / 100Hz (高频)

## 压力建模

### 数据入口吞吐量
- 1Hz: 2000 条/秒
- 10Hz: 20,000 条/秒
- 100Hz: 200,000 条/秒

### EventBus 事件量（假设每 100 条原始数据产生 1 个事件）
- 1Hz: 20 事件/秒 = 1,728,000/天
- 10Hz: 200 事件/秒 = 17,280,000/天
- 100Hz: 2,000 事件/秒 = 172,800,000/天

---

## 一、数据库层

### 1.1 连接池 — 严重问题
- `server/lib/db/index.ts` 第 20 行: `_db = drizzle(process.env.DATABASE_URL)`
- drizzle-orm 传入 string URL 时，底层调用 `mysql2.createPool(url)`
- mysql2 默认连接池: connectionLimit = 10
- 100 个边缘终端并发 → 10 个连接远远不够
- **没有任何连接池参数配置**（无 waitForConnections、queueLimit、connectTimeout）
- **没有连接泄漏检测**
- **没有慢查询监控**

### 1.2 event_logs 表 — 严重问题
- 行 415-429: 表定义
- **只有 PK (id autoincrement) 和 unique (event_id)**
- **没有 topic 索引** — 按 topic 查询全表扫描
- **没有 created_at 索引** — 时间范围查询全表扫描
- **没有 node_id/sensor_id 索引** — 按设备查询全表扫描
- **没有分区策略** — 1.73 亿行/天(100Hz) 单表
- **没有 TTL/归档策略** — 无限增长

### 1.3 schema 全局索引 — 问题
- 整个 schema.ts 中 `.index()` 调用数量: 0
- 所有表只有 PK 和 unique 约束，没有任何辅助索引
- 121+ 张表，全部没有索引

---

## 二、EventBus 层

### 2.1 同步写数据库 — 严重问题
- `eventBus.service.ts` 行 208-210: `await this.persistEvent(event)` 在 publish 方法中同步调用
- persistEvent 行 300-315: 每条事件单独 `db.insert(eventLogs).values({...})`
- **每次 publish 都等待数据库 INSERT 完成后才返回**
- 吞吐量瓶颈: 单条 INSERT 约 2-5ms → 最大 200-500 事件/秒
- 100Hz 场景需要 2,000 事件/秒 → 差 4-10 倍

### 2.2 kafkaEventBus 同样的问题
- `kafkaEventBus.ts` 行 105-120: publish 方法中同步写数据库
- 虽然有 publishBatch 方法（行 135-200），但 publish 仍然是逐条写
- publishBatch 中分批插入（每批 100 条），但仍然是同步等待

### 2.3 两套 EventBus 并存
- `eventBus.service.ts` — 内存 EventEmitter + Redis PubSub + 数据库
- `kafkaEventBus.ts` — Kafka + 数据库
- 两套系统独立运行，没有统一的切换/降级机制
- 同一个事件可能被两套系统分别处理

---

## 三、安全层

### 3.1 路由认证 — 严重问题
- publicProcedure 使用次数: 644
- protectedProcedure 使用次数: 191
- **76.3% 的路由无认证**

### 3.2 高危无认证路由
- docker.router.ts: startEngine/stopEngine/restartEngine/startAll/stopAll/bootstrapAll 全部 publicProcedure
- dataPipeline.router.ts: 几乎所有 Airflow 操作都是 publicProcedure
- gateway.service.ts: Kong Admin API 代理全部 publicProcedure

### 3.3 SQL 注入 — 严重问题
- pipeline.engine.ts 行 182: `db.execute(sql.raw(query))` — query 来自 config.query，用户可控
- pipeline.engine.ts 行 915: `sql.raw(\`INSERT INTO ${table} ...\`)` — table 和 values 来自 records，用户可控
- workbench.service.ts 行 114: `db.execute(sql.raw(rawSQL))` — rawSQL 完全用户可控（SQL Workbench）
- workbench.service.ts 行 538/558/587: CREATE TABLE/DROP TABLE/ALTER TABLE 使用 sql.raw

### 3.4 WebSocket 无认证
- gateway.ws.ts handleConnection: 无任何认证检查
- 任何人可以连接 WebSocket 并订阅所有频道

---

## 四、工况引擎

### 4.1 单线程同步处理
- conditionNormalizer.service.ts: processSlice 是纯同步方法
- 没有批量处理接口
- 没有异步队列
- 2000 测点 × 10Hz = 20,000 次/秒 processSlice 调用
- 每次 processSlice 涉及: 工况识别 + 特征提取 + 归一化 + 状态判定 + EWMA 更新
- 估计单次 processSlice: 0.1-0.5ms → 最大 2,000-10,000 次/秒
- **10Hz 场景可能刚好够用，100Hz 场景不够**

### 4.2 历史记录无限增长
- maxHistory = 500，但只在内存中
- 没有持久化到数据库

---

## 五、流水线引擎

### 5.1 无全局并发限制
- RunExecutor.executeRun: 同层节点无限并行（Promise.all）
- 没有 maxConcurrency 限制
- 100 个设备同时触发流水线 → 100 个 RunExecutor 同时运行
- 每个 RunExecutor 内部同层节点无限并行
- **可能导致数据库连接池耗尽、内存溢出**

### 5.2 SQL 注入（已在安全层记录）

---

## 六、插件引擎

### 6.1 沙箱已实现 — 良好
- plugin.sandbox.ts: 三层隔离架构（Worker Threads + VM Context + 权限网关）
- plugin.security.ts: 五级信任等级（untrusted/basic/verified/trusted/system）
- **这部分实现质量较高**

---

## 七、背压控制

### 7.1 背压控制器已实现但未使用 — 问题
- backpressure.ts: 完整的 TokenBucket + SlidingWindow + AdaptiveBackpressure 实现
- middleware/index.ts: 导出了这些类
- **但在整个 server/ 目录中，除了定义文件和导出文件外，没有任何地方实际使用这些背压控制器**
- EventBus、Kafka、WebSocket、流水线引擎均未集成背压控制

---

## 八、Kafka 层

### 8.1 Kafka 配置
- kafka.client.ts: 基本配置（connectionTimeout=10000, retry=8）
- **没有生产者批量配置**（batch.size, linger.ms, buffer.memory）
- **没有消费者并发配置**（max.poll.records, fetch.min.bytes）
- 默认 KafkaJS 配置可能不适合高吞吐场景

---

## 九、认知闭环层（新增代码）

### 9.1 数据流断点 — 3 处
- pipeline-hooks.ts 定义了 6 个嵌入点但未注入 RunExecutor
- knowledge-crystallizer.ts 的 KG 适配器未绑定实际函数
- cognition-scheduler.ts 的维度处理器需要手动注册

### 9.2 调度器问题（之前已分析）
- 无队列上限
- 降级策略仅基于队列深度，不考虑 CPU/内存
- 无内存自动清理
