# 混合开发工作流全链路诊断报告

> **版本**: v1.0 | **日期**: 2026-02-23 | **范围**: `pnpm dev` 启动链路全面审计

---

## 一、问题现象

用户执行 `pnpm dev` 后，终端日志停在"数据动脉启动完成"，看不到 `Server running on http://localhost:3000/` 消息，误以为 Vite 初始化挂死、服务器未启动。

---

## 二、根因分析（7 个问题）

### P1: 关键启动日志不可见（严重）

`server/core/index.ts` 第 272 行 `server.listen()` 回调中，**所有关键启动信息都使用 `log.debug()`**，而 `dev-bootstrap.sh` 设置 `LOG_LEVEL=info`。`debug < info`，因此用户永远看不到：

```
log.debug(`Server running on http://localhost:${port}/`);  // 看不到
log.debug('[Platform] ✓ Security headers (helmet) enabled');  // 看不到
```

**实际上服务器已经正常启动并在监听**，但用户完全不知道。

### P2: 双 Vite 配置体系冲突（中等）

项目中存在两套 Vite 配置：

| 配置位置 | 用途 | `configFile` |
|---------|------|-------------|
| `vite.config.ts`（根目录） | `pnpm build`（独立 Vite CLI） | 自动加载 |
| `server/core/vite.ts` 内联 | `pnpm dev`（Express 中间件模式） | `configFile: false` |

两者的 `resolve.alias`、`plugins` 配置重复但不完全一致。`vite.config.ts` 中有 `proxy` 配置（指向 3003 端口），但在 Express 中间件模式下根本不会被加载。如果开发者误以为修改 `vite.config.ts` 就能影响 `pnpm dev`，会造成困惑。

### P3: 端口发现逻辑无日志反馈（中等）

`findAvailablePort()` 在端口被占用时只有一行 `log.debug()`，用户在 `LOG_LEVEL=info` 下看不到实际使用的端口号。如果 3000 被占用，服务器可能在 3001/3002 上运行，但用户不知道。

### P4: setupVite() 无超时保护和进度日志（中等）

`setupVite()` 中 `await createViteServer()` 没有任何进度日志、超时保护或错误边界。如果 Vite 的依赖预打包（dep pre-bundling）在大型项目中耗时较长，用户看到的是完全空白——不知道是卡住了还是在工作。

### P5: 基础设施服务连接无优雅降级摘要（低）

启动时大量 `ERROR [topology]` 日志刷屏（因为 MySQL 中缺少表），淹没了真正重要的启动信息。需要聚合这些错误而不是逐条打印。

### P6: dev-bootstrap.sh 未设置 PORT 环境变量（低）

`dev-bootstrap.sh` 没有显式设置 `PORT`，导致 `config.ts` 中默认值 `3000` 生效。而 `vite.config.ts` 中的 proxy target 硬编码为 `3003`，两者不一致。

### P7: 启动序列缺少总耗时统计（低）

用户无法判断启动是否正常完成、耗时多少。

---

## 三、修复方案

### 修复 1: server/core/index.ts — 关键日志提升为 info 级别 + 启动 banner

将 `server.listen()` 回调中的关键日志从 `log.debug()` 改为 `log.info()`，并添加清晰的启动 banner。

### 修复 2: server/core/vite.ts — 添加进度日志和超时保护

在 `setupVite()` 中添加详细的阶段日志和 60 秒超时保护。

### 修复 3: server/core/index.ts — 启动计时器 + 端口日志提升

添加全局启动计时器，在启动完成时输出总耗时。端口发现日志提升为 info。

### 修复 4: vite.config.ts — 添加注释说明双配置关系

明确标注此文件仅用于 `pnpm build`，不影响 `pnpm dev`。

### 修复 5: dev-bootstrap.sh — 显式设置 PORT

确保 PORT 环境变量被正确设置。

---

## 四、验证标准

执行 `pnpm dev` 后，用户应看到：

```
═══════════════════════════════════════════════════
  西联智能平台 (PortAI Nexus) v4.0.0
  ➜ Local:   http://localhost:3000/
  ➜ Mode:    development
  ➜ Startup: 1.2s
═══════════════════════════════════════════════════
```
