# @deprecated 标记迁移计划

> 整改验收 A-06 遗留项跟踪

## 已完成清理（Phase 2 验收修复）

| 文件 | 标记数 | 处理方式 |
|------|--------|----------|
| server/core/env.ts | 10 | **已删除** — 无外部引用，config.ts 已完全替代 |
| server/api/ws/kafkaMetrics.ws.ts | 1 | **已删除** — gateway.ws.ts 已实现 kafka-metrics 通道 |
| client/src/pages/settings/basic/coding-rules.ts | 3 | **已删除** — 无外部引用 |
| shared/_core/errors.ts | 1 | **已删除** — sdk.ts 已迁移到 server/core/errors.ts |

**清理结果：67 → 53（减少 14 处，删除 4 个文件）**

## 仍在过渡期（需后续迁移）

### 高优先级（Phase 3 处理）

| 文件 | 标记数 | 阻塞原因 | 迁移方案 |
|------|--------|----------|----------|
| server/shared/constants/kafka-topics.const.ts | 9 | 旧 topic 名仍有 25+ 处引用 | 全局搜索替换为新 topic 名 |
| server/core/types/domain.ts | 6 | deviceId 有 373 处引用 | 分批迁移到 deviceCode |

### 中优先级

| 文件 | 标记数 | 阻塞原因 |
|------|--------|----------|
| server/services/device.service.ts | 7 | 旧设备 API 仍被前端调用 |
| server/services/kafkaStream.processor.ts | 6 | 旧流处理器仍在使用 |
| server/services/eventBus.service.ts | 6 | 旧事件总线仍有订阅者 |
| server/services/deviceCrud.service.ts | 4 | 旧 CRUD 接口仍被路由引用 |

### 低优先级

| 文件 | 标记数 | 阻塞原因 |
|------|--------|----------|
| server/services/streamProcessor.service.ts | 3 | 旧流处理器 |
| server/platform/cognition/* | 8 | 认知引擎重构中 |
| server/lib/dataflow/flinkProcessor.ts | 1 | 旧异常检测方法 |
| client/src/services/qdrant.ts | 1 | 前端直连 Qdrant（应走 tRPC） |
| client/src/App.tsx | 1 | 旧路由重定向（过渡期保留） |

## 迁移原则

1. **不删除仍有引用的 @deprecated 标记** — 标记本身是有价值的文档
2. **迁移顺序**：先迁移调用方，再删除废弃代码
3. **每次迁移后运行全量测试**：`npx vitest run`
