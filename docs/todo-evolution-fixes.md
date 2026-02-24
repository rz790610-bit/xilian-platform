# 进化引擎整改 — 待修复清单

## P0（紧急）
- [ ] 安全认证：所有 evolution mutation 从 publicProcedure → protectedProcedure

## P1
- [ ] 51 处 @ts-ignore：11 处非 Drizzle 精确消除 + 40 处 Drizzle 替换为 @ts-expect-error
- [ ] simulation-engine.ts row.name 字段不存在 → 修复为实际列名
- [ ] EvolutionBoard tRPC 取消注释，接入真实后端数据

## P2
- [ ] log.debug 补充：EventBus/Orchestrator/AI 服务关键路径（20-30 条）
- [ ] GitHub 推送

## P3（后续迭代）
- [ ] E2E 测试
- [ ] 死信队列（DLQ）
