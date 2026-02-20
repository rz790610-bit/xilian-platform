# 最终系统性修复 TODO — 全部未修复问题汇总

## P0 — 数据管道致命断点 + 安全漏洞（必须修复）

- [ ] P0-DATA-1: kafkaStream.processor.ts — 订阅废弃 Topic TELEMETRY → 改为 TELEMETRY_FEATURE
- [ ] P0-DATA-2: telemetry.db.service.ts — 振动聚合写 MySQL → 添加 ClickHouse 路由注释+TODO
- [ ] P0-DATA-3: telemetry.service.ts — getHistory SQL 注入 → 参数化查询
- [ ] P0-CODE-1: grokDiagnosticAgent.service.ts — getDb() 同步调用 → await getDb()
- [ ] P0-CODE-2: shadow-evaluator.ts — TASCalculator 类不存在 → 改为函数调用
- [ ] P0-CODE-3: fusion-processor.ts — 调用 .fuse() 但方法名为 fuseMultiple() → 修正
- [ ] P0-CODE-4: DimensionProcessor.process() 签名不一致 → 统一为 (stimulus, context)
- [ ] P0-AUTH-1: system.routes.ts — alertRules list/stats/asyncLogs 用 publicProcedure → 改为 protectedProcedure
- [ ] P0-AUTH-2: gateway.service.ts — 全部操作 publicProcedure → mutation 改 adminProcedure
- [ ] P0-AUTH-3: topology.service.ts — 全部写操作 publicProcedure → 改 protectedProcedure
- [ ] P0-AUTH-4: clickhouse.connector.ts — GET 请求 URL 拼接 SQL → 改 POST

## P1 — 功能缺陷（高优先级）

- [ ] P1-1: grokDiagnosticAgent sessions 无大小限制 → 加 MAX_SESSIONS=1000 + LRU 淘汰
- [ ] P1-2: plugin.engine.ts pluginStorage 内存 Map → 添加 TODO 持久化注释
- [ ] P1-3: kafka-topics.const.ts 废弃 Topic 仍被引用 → 确认标记完整
- [ ] P1-4: Sidebar.tsx getState() 破坏响应性 → 改为 useAppStore(s => s.currentSubPage)
- [ ] P1-5: qdrant.ts 前端直连 Qdrant API → 添加安全警告注释
- [ ] P1-6: configCenter.ts rollback() 静默失败 → 抛 TRPCError
- [ ] P1-7: nebula.connector.ts healthCheck 不校验返回 → 添加校验
- [ ] P1-8: monitoring.routes.ts 审计日志 publicProcedure → protectedProcedure

## P2 — 架构改进

- [ ] P2-1: ThemeContext 主题持久化不生效 → 分离 switchable 和 defaultTheme
- [ ] P2-2: PipelineAPIPanel 展示错误 REST 路径 → 添加注释标记
- [ ] P2-3: KGConfigPanel Unicode 乱码 → 修正 emoji
- [ ] P2-4: ERDiagram columns/fields 混用 → 统一为 fields
- [ ] P2-5: ddl-generator.ts 外键名重复 → 修正命名规则
- [ ] P2-6: App.tsx 旧路由 Redirect 无提示 → 添加 deprecation warning
- [ ] P2-7: AutoTrain.tsx Mock 数据 → 添加 TODO 标记
- [ ] P2-8: ConditionNormalizer.tsx Mock Tab → 添加 TODO 标记
- [ ] P2-9: murphyCombination 逻辑误差 → 修正平均证据组合方式
- [ ] P2-10: 缓存键 djb2 hash 碰撞风险 → 改用 SHA-256
