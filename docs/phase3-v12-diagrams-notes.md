# v1.2 新增图表渲染结果

| 图表 | 文件 | 渲染状态 |
|------|------|---------|
| Outbox Pattern 时序图 | phase3-outbox-pattern.png | ✅ 清晰展示 BullMQ→DB事务→outbox→Relay Worker→tRPC Subscription 流程 |
| Registry 热迁移时序图 | phase3-registry-migration.png | ✅ 清晰展示 源节点→Redis→TwinEventBus→目标节点 迁移流程，延迟<2s |
| GrokEnhancer 治理门面 | phase3-grok-enhancer.png | ✅ 展示 CircuitBreaker→TokenBucket→PromptVersionManager→CostMeter 调用链 + FallbackManager 降级路径 |
