# 基座审查关键发现

## 1. 数据库连接层

### 发现 1.1: drizzle 传 string URL 时自动调用 mysql2.createPool()
- drizzle-orm v0.44.7 的 `drizzle(url)` 底层调用 `mysql2.createPool({ uri: url })`
- **这意味着已经有连接池**，但使用的是 mysql2 的默认配置
- mysql2 默认 connectionLimit = 10
- 100 边缘终端并发下，10 个连接可能不够

### 发现 1.2: getDb() 被调用 527 次
- 遍布整个代码库，每个数据库操作都通过 getDb() 获取同一个 drizzle 实例
- 好处：单例模式，不会重复创建连接池
- 问题：没有连接池大小配置，也没有连接健康检查

### 发现 1.3: docker.router.ts 中有 2 处额外的 drizzle() 调用
- 第 23 行和第 38 行各创建了一个新的 drizzle 实例
- 这会创建额外的连接池，但用于 Docker 启动后的数据库测试和迁移

### 发现 1.4: mysql.adapter.ts 使用 createConnection 而非 createPool
- 第 124、196、273 行各创建独立连接
- 这是协议适配器用于连接外部 MySQL 数据源，不是平台自身数据库

## 2. EventBus 层

### 发现 2.1: publish() 中 await persistEvent() 是同步阻塞
- 第 208-209 行: `await this.persistEvent(event)`
- 每次 publish 都等待数据库写入完成才返回
- 在 2000 测点 x 1/秒 = 2000 TPS 场景下，这是核心瓶颈

### 发现 2.2: publishBatch() 是假批量
- 第 231-248 行: 循环调用 publish()，每次都单独 await persistEvent()
- 没有真正的批量 INSERT

### 发现 2.3: eventBuffer 是内存数组，无上限保护
- bufferSize = 1000，超过后 shift() 丢弃最旧的
- 但这只是内存缓冲，不影响数据库写入

## 3. SQL 注入

### 发现 3.1: pipeline.engine.ts 两处高危
- 第 182 行: `sql.raw(query)` — query 来自 config.query，用户可配置
- 第 915 行: `sql.raw(INSERT INTO ${table} ...)` — table 和 values 来自用户数据

### 发现 3.2: workbench.service.ts 16 处
- 第 114、538、558、587、626、639、651、668、681、697、834、862、882、959 行
- 这些是数据库工作台功能，设计上就是执行用户输入的 SQL
- 但缺少白名单校验和权限控制

## 4. 路由安全

### 待统计: publicProcedure vs protectedProcedure 的精确数量
