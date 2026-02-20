# 未修复问题清单（全部16份报告对比检查结果）

## P0 安全/阻断（必须修复）

### P0-A: docker-compose.yml SKIP_AUTH 默认值仍为 true
- 文件: docker-compose.yml 第34行
- 现状: `SKIP_AUTH=${SKIP_AUTH:-true}` → 应改为 `${SKIP_AUTH:-false}`
- .env.local.template 已修复为 false，但 docker-compose 默认值仍为 true

### P0-B: LOCAL_DEV_USER role 仍为 admin
- 文件: server/core/context.ts
- 现状: `role: "admin"` → 审查建议降为 `"user"`
- 虽然已添加生产环境禁用逻辑，但开发环境默认 admin 仍有风险

### P0-C: workbench.router.ts mutation 仍为 publicProcedure
- 文件: server/api/workbench.router.ts 第25行、第261行
- 现状: testConnection 和 clearHistory 仍为 publicProcedure

### P0-D: GatewayManagement Math.random() 生成 API Key
- 文件: client/src/pages/GatewayManagement.tsx
- 现状: 仍使用 Math.random()，不具备密码学安全性

### P0-E: DEPLOYMENT.md 仍混用 NebulaGraph
- 文件: DEPLOYMENT.md 多处引用 NebulaGraph，但实际实现使用 Neo4j

### P0-F: adminProcedure 未链式调用 requireUser
- 文件: server/core/trpc.ts
- 现状: adminProcedure 仅检查 role !== 'admin'，但未先通过 requireUser 确保 user 不为 null
- 虽然逻辑等价（!ctx.user 会进入 forbidden），但语义不完整

## P1 功能 Bug（应修复）

### P1-A: cookies.ts domain 逻辑仍被注释
- 文件: server/core/cookies.ts
- 现状: 整段 domain 计算逻辑被注释，跨域部署时 cookie 无法正确设置

### P1-B: grokDiagnosticAgent sessions 无大小限制
- 文件: server/services/grokDiagnosticAgent.service.ts 第662行
- 现状: `sessions = new Map()` 无限制，可导致内存泄漏

### P1-C: pluginStorage 无持久化
- 文件: server/services/plugin.engine.ts 第441行
- 现状: `pluginStorage = new Map()`，服务重启后数据丢失
- 标记为 TODO 即可（需对接 Redis）

### P1-D: CleanManager/SliceManager/ConfigManager 删除无确认
- 文件: client/src/pages/database/CleanManager.tsx, SliceManager.tsx, ConfigManager.tsx
- 现状: 删除操作直接调用 mutate，无 confirm 确认

### P1-E: config.ts 与 env.ts 两套并行配置体系
- 文件: server/core/config.ts + server/core/env.ts
- 现状: 两文件并存，管理混乱

### P1-F: GatewayManagement 全 Mock 数据无醒目标记
- 文件: client/src/pages/GatewayManagement.tsx
- 现状: 已有1个 TODO，但缺少醒目的"演示数据"横幅

## P2 架构改进（建议修复）

### P2-A: Kafka 9092 端口暴露
- 文件: docker-compose.yml
- 现状: 9092 端口暴露，建议绑定 127.0.0.1

### P2-B: hashObject djb2 碰撞风险
- 文件: server/algorithms/_core/engine.ts 第119行
- 现状: 使用 djb2 hash，建议改为 crypto hash

### P2-C: unitCounter 重启后 ID 可能重复
- 文件: server/platform/cognition/engines/cognition-unit.ts 第646行
- 现状: 模块级变量，重启后从0开始

### P2-D: Worker fallback 可能双重执行
- 文件: server/algorithms/_core/engine.ts
- 现状: Worker 失败后 fallback 到主线程，但 Worker 可能已有副作用

### P2-E: .env.local.template 缺少 VITE_OLLAMA_URL
- 文件: .env.local.template
- 现状: 有 OLLAMA_HOST 但缺少 VITE_OLLAMA_URL

### P2-F: DEPLOYMENT.md 缺少安全检查清单
- 文件: DEPLOYMENT.md
- 现状: 无上线前安全核查表格

### P2-G: CognitionUnit 并发防护不足
- 文件: server/platform/cognition/engines/cognition-unit.ts
- 现状: executed flag 存在但无原子性保证

### P2-H: featureFlags 模块 import 时立即读取 env
- 文件: server/core/featureFlags.ts
- 现状: 已有 lazyImportIf，但 flag 值本身在 import 时确定
