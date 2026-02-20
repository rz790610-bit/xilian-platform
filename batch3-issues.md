# 第三批审查报告问题清单

## P0 (1个)
| 编号 | 文件 | 问题 | 修复方案 |
|------|------|------|----------|
| P0-6 | fusionDiagnosis.router.ts | diagnose/updateWeight/registerExpert等写操作全用publicProcedure | 所有mutation改为protectedProcedure |

## P1 (5个)
| 编号 | 文件 | 问题 | 修复方案 |
|------|------|------|----------|
| P1-6 | circuitBreaker.ts | forceOpen/forceClose无鉴权 | 通过admin专用protectedProcedure路由暴露 |
| P1-7 | rateLimiter.ts | skip()用url.includes()匹配可被绕过 | ✅ 已修复（精确白名单匹配） |
| P1-8 | 4个中间件文件 | 中间件已实现但未确认挂载状态 | 检查server/index.ts确认集成 |
| P1-9 | fusionDiagnosis.router.ts | diagnosisHistory内存存储，重启丢失 | 迁移至Redis或持久化存储 |
| P1-10 | plugin.router.ts | getAuditLog/getSecurityEvents用publicProcedure | 改为protectedProcedure |

## P2 (5个)
| 编号 | 文件 | 问题 | 修复方案 |
|------|------|------|----------|
| P2-8 | knowledge.db.service.ts | 向量数据双写(MySQL TEXT + Qdrant) | 删除vectorData字段，仅存Qdrant point ID |
| P2-9 | auditLog.ts | 敏感日志通过traceId关联存在竞态 | 使用insert().returning()直接获取主键 |
| P2-10 | data.service.ts | EventStore无乐观锁 | 添加WHERE aggregateVersion = expected |
| P2-11 | database.router.ts | publicProcedure别名技巧掩盖真实鉴权意图 | 移除别名，直接使用protectedProcedure |
| P2-12 | edge.db.service.ts | ipAddress存明文；heartbeat()未校验gatewayCode | 添加IP格式校验；heartbeat改为upsert语义 |
