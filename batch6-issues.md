# 第六批审查问题清单 — 基础设施层（Infrastructure & Platform Layer）

综合评分: 6.5/10

## P0 立即修复（5项）

### P0-1: index.ts — tRPC Router 未挂载到 Express
- index.ts 是纯静态文件服务器，tRPC router 未挂载
- 所有 API 路由、WebSocket 等关键功能尚未接入 HTTP Server
- 需引入 router + createExpressMiddleware

### P0-2: airflow/clickhouse — 凭证硬编码默认值
- airflow.client.ts: AIRFLOW_CONFIG.password 默认值 'admin'
- clickhouse.client.ts: CLICKHOUSE_PASSWORD 默认值 'xilian123'
- 生产环境风险极高，启动时应 validate + 抛出

### P0-3: databaseMonitor.ts — Qdrant 客户端混在监控文件中
- Qdrant 客户端在监控文件中初始化，混淆了监控职责与向量 DB 访问职责
- 需独立 qdrant.client.ts，实现完整的向量 CRUD + 搜索 API

### P0-4: 全局 — 无 App Bootstrap 编排
- 各 client 需手动调用 initialize()，缺少统一启动编排器
- 需保证初始化顺序：DB → Redis → Kafka → EventBus → gRPC → HTTP Server

### P0-5: 全局 — 无 Embedding Service / RAG Pipeline 抽象
- 无 IEmbeddingProvider 接口，无法调用 Ollama/OpenAI 生成向量
- 无 RAG Pipeline，无法将传感器异常事件与知识库结合进行 AI 分析
- 是 AI 功能的地基

## P1 短期优化（8项）

### P1-1: databaseMonitor.ts — 硬编码容量魔数
- MySQL 总磁盘: 100GB; ClickHouse: 10TB; Redis: 16GB 均硬编码
- Qdrant 向量维度硬编码为 768
- 与实际部署完全脱节

### P1-2: grpcClients.ts — gRPC 连接使用 createInsecure()
- 所有 gRPC 连接明文传输微服务间数据
- 生产环境应使用 createSsl() 或 mTLS

### P1-3: grpcClients.ts — AlgorithmServiceClient 参数类型全为 any
- 彻底丢失类型安全，算法输入/输出契约不可验证
- 需从 proto 生成强类型 TS 定义

### P1-4: systemMonitor.ts — CPU 使用率计算错误
- calculateCpuUsage() 使用 os.cpus() 累计时间快照
- 实际是开机到现在的平均值，而非「当前」使用率
- 需改为两次采样差值计算

### P1-5: jaeger.client.ts — searchTraces 全量拉取
- limit=1000 拉取全量 trace 到内存做百分位计算
- 数据量大时内存占用高、延迟长

### P1-6: airflow.client.ts — getOverview() 请求数过多
- 并发 listDAGs() + listPools() + listVariables() + listConnections()
- 又串行遍历 dags.slice(0,10)，总请求数可达 60+
- 需添加 Redis 缓存 TTL 60s

### P1-7: healthChecker.ts — SERVICE_CONFIGS 硬编码
- 7 个服务硬编码，addServiceConfig 只能运行时追加内存状态
- 重启丢失，需持久化到 Redis 或 DB

### P1-8: grpcClients.ts — SERVICE_CONFIGS 硬编码
- 设备服务和算法服务端点硬编码，无法动态注册新微服务

## P2 中期增强（7项）

### P2-1: 全局 — 无 PluginRegistry
- 所有 client 直接 new + 单例导出，无法替换/Mock/热重载
- 需设计 PluginRegistry<T> 接口

### P2-2: 全局 — HTTP Client 重复实现
- ES/Prometheus/KafkaConnect/Airflow/Jaeger 各自实现独立 HTTP 请求
- 无重试、无连接复用、认证方式分散
- 需抽取 createHttpClient(config) 工厂函数

### P2-3: redis.client.ts — acquireLock() 降级语义不明
- client=null 时返回 memory-lock-{ts} 字符串
- 调用方可能以为获锁成功，实则无任何保护

### P2-4: kafka.client.ts — Consumer 无复用池
- subscribe() 每次创建新 Consumer 实例
- 同一 groupId 多次 subscribe 会创建冗余消费者

### P2-5: databaseMonitor.ts — getAllDatabaseStatus() 无单独超时
- 并行 4 个 DB 状态查询，任何一个 hang 导致整体超时
- 需为每个查询设置独立 Promise.race + AbortController

### P2-6: redis.client.ts — KEYS 命令暴露
- keys(pattern) 方法暴露了对 KEYS 命令的直接访问
- 大型生产 Redis 中 KEYS 是阻塞操作
- 应提供 scan(pattern) 替代

### P2-7: kafkaEventBus.ts — 本地订阅者串行调用
- notifyLocalSubscribers() 是 async，publishBatch() 中 await 逐一串行
- 丢失并行性能，订阅者超时无上限保护

## P3 长期规划（4项）

### P3-1: 实现 LLM Client + RAG Pipeline
### P3-2: 实现 TransformPlugin 管道
### P3-3: gRPC mTLS
### P3-4: Rate Limit Lua 脚本化
