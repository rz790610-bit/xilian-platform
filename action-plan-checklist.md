# 行动方案问题清单 — 逐项核查

## P0 问题（20项）

### 身份验证类
| ID | 文件 | 问题 | 风险 |
|----|------|------|------|
| P0-1 | context.ts, sdk.ts | SKIP_AUTH机制过于宽泛，硬编码admin权限 | 极高 |
| P0-2 | auth.service.ts | validateToken函数永远返回true | 极高 |
| P0-3 | sdk.ts | JWT密钥硬编码为"nexus-secret" | 高 |
| P0-4 | .env.local.template | 环境变量模板默认SKIP_AUTH=true | 高 |

### API权限类
| ID | 文件 | 问题 | 风险 |
|----|------|------|------|
| P0-5 | accessLayer.router.ts | 接入层管理接口完全暴露，全部使用publicProcedure | 极高 |
| P0-6 | 核心业务路由 | 6个核心路由缺乏鉴权 | 高 |
| P0-7 | docker.router.ts | Docker API缺乏权限验证 | 高 |
| P0-8 | plugin.router.ts | 插件路径未验证，存在路径穿越风险 | 高 |
| P0-9 | topology.service.ts | resetToDefault存在越权数据删除漏洞 | 高 |

### 数据注入类
| ID | 文件 | 问题 | 风险 |
|----|------|------|------|
| P0-10 | mysql.connector.ts, telemetry.service.ts | SQL注入风险（ClickHouse查询拼接） | 极高 |
| P0-11 | pipeline.router.ts | Pipeline执行缺乏沙箱隔离 | 高 |

### 通信安全类
| ID | 文件 | 问题 | 风险 |
|----|------|------|------|
| P0-12 | grpcClients.ts | gRPC通信未启用TLS加密 | 高 |
| P0-13 | kafka.client.ts | Kafka连接未配置SASL认证 | 高 |
| P0-14 | vaultIntegration.ts | Vault Token硬编码 | 高 |

### 数据管道断点
| ID | 文件 | 问题 | 风险 |
|----|------|------|------|
| P0-15 | kafkaStream.processor.ts | 订阅错误：订阅已废弃主题 | 致命 |
| P0-16 | Docker/DB | ClickHouse数据库未初始化 | 致命 |
| P0-17 | Router/Gateway | 数据路由错误：高频数据误入MySQL | 致命 |

### 其他
| ID | 文件 | 问题 | 风险 |
|----|------|------|------|
| P0-18 | auditLog.ts | 审计日志明文存储 | 中 |
| P0-19 | redis.connector.ts | Redis单点故障风险 | 中 |
| P0-20 | ClickHouse | 批量写入缺乏事务保证 | 中 |

## P1 问题（约15项）

| 分类 | 问题 | 文件 |
|------|------|------|
| 数据质量 | MQTT类型声明不足 | mqtt.d.ts |
| 数据质量 | 高并发ID冲突 | device-service |
| 数据质量 | 算法执行历史丢失 | algorithm-service |
| 数据质量 | SDK重试逻辑缺陷 | sdk/typescript |
| 数据质量 | 拓扑初始化竞态条件 | topology.service.ts |
| 数据质量 | Schema验证缺失 | drizzle/schema.ts |
| 监控 | 健康检查Job容错缺陷 | healthCheck.job.ts |
| 监控 | 敏感审计日志泄露 | monitoring.routes.ts |
| 监控 | CPU使用率计算错误 | systemMonitor.ts |
| 监控 | Kafka主题上报不准确 | - |
| 架构 | DimensionProcessor签名不一致 | 四维处理器 |
| 架构 | TASCalculator类不存在 | - |
| 架构 | DS融合引擎方法调用错误 | - |

## P2 问题（约10项）

| 分类 | 问题 |
|------|------|
| Schema管理 | 三套迁移系统共存，schema.ts超1500行 |
| 配置体系 | config.ts和env.ts两套体系并行 |
| 基础设施 | tRPC路由未挂载到HTTP服务器；10种中间件重复实现 |
| AI能力 | Qdrant耦合在监控模块；缺乏Embedding抽象 |
