# 合并风险分析报告

**版本**: v1.0 (2026-02-06)
**作者**: Manus AI

## 1. 概述

本文档旨在全面分析将 `dev-continue` 分支（包含 v1.9 性能优化模块和频闪修复）合并到 `main` 分支（包含完整平台功能）的潜在风险，并提供详细的解决方案和验证计划。目标是确保合并后的版本功能完整、稳定可靠，并彻底解决频闪问题。

## 2. 分支差异分析

| 分支 | 独有提交 | 主要变更 |
|---|---|---|
| `main` | 39 | 平台核心功能模块（设备管理、安全中心、边缘计算、微服务、可观测性等） |
| `dev-continue` | 8 | v1.9 性能优化模块（Outbox、Saga、自适应采样等）+ 页面频闪修复 |

两个分支从同一祖先分叉，各自有大量独立开发，合并时存在 8 个文件冲突。

## 3. 核心风险与解决方案

### 3.1. 页面频闪问题（高风险）

- **风险描述**: `dev-continue` 分支包含了针对页面频闪的两次关键修复，如果合并时丢失或不完整，将导致问题复现。
  1. **HMR WebSocket 端口错误**: Vite 在 `middlewareMode` 下 HMR 客户端默认连接 `5173` 端口，而 Express 服务器实际运行在 `3000` 或 `5000` 端口，导致连接失败并无限刷新。
  2. **HMR WebSocket 冲突**: `main` 分支的 Kafka WebSocket 采用 `{ server }` 模式，会拦截并关闭所有路径不匹配的 WebSocket 连接，导致 Vite HMR 无法建立连接。

- **解决方案**: 
  1. **必须采用 `dev-continue` 分支的 `server/_core/vite.ts` 和 `server/_core/index.ts`**，确保 `setupVite` 调用时传入了正确的端口号。
  2. **必须采用 `dev-continue` 分支的 `server/websocket/kafkaMetricsWs.ts`**，使用 `noServer` 模式避免拦截 Vite HMR 连接。

### 3.2. Manus 沙盒专用插件（高风险）

- **风险描述**: `vite.config.ts` 中包含了 `vite-plugin-manus-runtime` 和内嵌的 `vitePluginManusDebugCollector` 两个沙盒专用插件。这些插件在用户本地环境中不仅无用，而且 `vitePluginManusDebugCollector` 会向 `.manus-logs/` 目录写入日志，可能触发 `tsx watch` 重启服务器，导致新的无限刷新循环。

- **解决方案**: 
  1. **必须从 `vite.config.ts` 中彻底移除这两个插件**。
  2. **必须从 `package.json` 中移除 `vite-plugin-manus-runtime` 依赖**。
  3. **必须删除所有相关的调试文件和目录**（`.manus/`, `.manus-logs/`, `client/public/__manus__/` 等）。

### 3.3. 路由和导航合并（中风险）

- **风险描述**: `client/src/App.tsx` (路由) 和 `client/src/config/navigation.ts` (导航) 两个文件在两个分支中都有大量修改，手动合并时容易出错，导致页面白屏或功能入口丢失。

- **解决方案**: 
  1. **仔细合并**，确保保留两边所有的 `import`、路由定义和导航项。
  2. **特别注意**: `main` 分支的 `App.tsx` 使用了 `TooltipProvider` 组件但忘记了 `import`，合并后**必须手动添加 `import { TooltipProvider } from "./components/ui/tooltip";`**，否则会导致整个应用崩溃。

## 4. 依赖和环境检查

| 检查项 | 状态 | 结论 |
|---|---|---|
| **依赖完整性** | ✅ | `main` 分支的 `package.json` 已包含所有必需的依赖（Elasticsearch, K8s, Neo4j 等），合并后保留 `main` 的版本即可。 |
| **环境变量** | ✅ | `.env` 文件未被 git 跟踪，敏感信息安全。合并后保留 `dev-continue` 的 `.env.local.template` 作为开发模板。 |
| **Kafka 功能** | ✅ | `dev-continue` 的 `noServer` 模式修复不影响 Kafka 自身功能，仅解决了 HMR 冲突。 |
| **数据库 Schema** | ✅ | `dev-continue` 新增的 `outbox` 等表定义为纯追加，不影响 `main` 的现有表结构。 |

## 5. 合并与验证计划

1. **备份**: 创建 `main-backup` 和 `dev-continue-backup` 两个分支作为备份。
2. **合并**: 在新的 `main` 分支上，执行 `git merge dev-continue`。
3. **解决冲突**: 按照上述解决方案，逐一解决 8 个文件的冲突。
4. **清理**: 移除所有 Manus 专用插件和文件。
5. **安装**: 执行 `pnpm install` 更新依赖。
6. **验证**: 
   - 启动服务器 (`SKIP_AUTH=true pnpm dev`)，检查所有服务是否正常启动。
   - 逐一测试所有 11 个核心 tRPC API 端点，确保返回 200。
   - 在浏览器中访问 `/dashboard` 和 `/performance/overview` 页面，确认页面显示完整、功能正常、无频闪。
   - 检查浏览器控制台，确认无 HMR 连接错误和其它运行时错误。
7. **交付**: 将合并、清理、修复后的 `main` 分支推送到 GitHub。

## 6. 结论

本次合并风险可控。只要严格按照上述解决方案操作，特别是处理好 **HMR 端口配置**、**沙盒插件清理** 和 **`App.tsx` 的 `TooltipProvider` import** 这三个关键点，就能成功将两个分支合并为一个功能完整、稳定可靠的新版本。
