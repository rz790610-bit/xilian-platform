# 进化引擎测试套件

## 测试文件分类

| 文件名 | 模块 | 类型 | 用例数 |
|--------|------|------|--------|
| `math-stats.test.ts` | 数学工具库 | 单元测试 | 15 |
| `math-vector-utils.test.ts` | 数学工具库 | 单元测试 | 23 |
| `flywheel-cron-parser.test.ts` | 飞轮编排器 | 单元测试 | 14 |
| `shadow-divergence.test.ts` | Shadow Fleet | 单元测试 | 16 |
| `v4-fixes.test.ts` | 跨模块修复 | 回归测试 | 35 |
| `v5-critical-paths.test.ts` | Canary/OTA/Flywheel | 集成测试 | 33 |
| `v5-e2e-integration.test.ts` | 全链路 | E2E 测试 | 12 |
| `v6-redis-integration.test.ts` | Redis/分布式锁 | 集成测试 | 17 |
| `v6-chaos.test.ts` | 跨模块容错 | 混沌测试 | 14 |
| `v6-benchmark.test.ts` | FFT/SLERP | 性能基准 | - |

## 命名规范

- `{module}-{feature}.test.ts` — 模块级单元测试
- `v{N}-{scope}.test.ts` — 版本迭代测试（回归/集成/混沌/基准）

## 运行命令

```bash
# 运行全部
npx vitest run server/platform/evolution/__tests__

# 运行指定文件
npx vitest run server/platform/evolution/__tests__/v6-chaos.test.ts

# 运行匹配模式
npx vitest run --reporter=verbose server/platform/evolution/__tests__/v6-*
```
