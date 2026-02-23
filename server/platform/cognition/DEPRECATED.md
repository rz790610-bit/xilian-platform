# ⚠️ Deprecated: Cognition Engine v1

此目录下的文件标记为 `@deprecated`，但仍有活跃引用（canary-controller、dimension-processors、evolution-flywheel 等）。

## 迁移计划
- **目标**：将 cognition 引擎逻辑迁移到 `server/domains/cognition/` 域路由
- **时间线**：阶段二（B 系列行动项）
- **注意**：删除前必须确认所有引用已迁移

## 当前引用方
- `cognition-unit.ts` ← decision-processor.ts, fusion-processor.ts
- `meta-learner.ts` ← evolution-flywheel.ts, metalearner/index.ts
- `emitter.ts` ← canary-controller.ts
- `pipeline-hooks.ts` ← integration/index.ts
