# 依赖升级标准操作流程（SOP）

> 整改方案 v2.1 — B-01 Vite 版本锁定 + 升级策略

---

## 一、版本锁定策略

### 锁定的关键构建工具

以下依赖使用**精确版本**（无 `^` 前缀），升级必须走 SOP：

| 包名 | 当前版本 | 锁定原因 |
|---|---|---|
| `vite` | 7.1.9 | 构建核心，中间件模式 API 可能变更 |
| `@vitejs/plugin-react` | 5.0.4 | 与 Vite 版本强耦合 |
| `vitest` | 2.1.4 | 测试框架，与 Vite 版本强耦合 |
| `@vitest/coverage-v8` | 2.1.9 | 覆盖率工具，与 Vitest 版本强耦合 |
| `esbuild` | 0.25.0 | 生产构建核心 |
| `typescript` | 5.9.3 | 类型系统，大版本可能有 breaking changes |

### 非锁定依赖

其他依赖保持 `^` 前缀（semver 兼容范围），通过 Dependabot 自动更新。

---

## 二、升级流程

### 步骤 1：创建升级分支

```bash
git checkout -b upgrade/vite-x.y.z
```

### 步骤 2：更新版本号

```bash
# 修改 package.json 中的精确版本号
# 例如：将 "vite": "7.1.9" 改为 "vite": "7.2.0"
pnpm install
```

### 步骤 3：验证清单

| 检查项 | 命令 | 预期结果 |
|---|---|---|
| 测试通过 | `pnpm test` | 125/125 通过 |
| 类型检查 | `pnpm check` | 无错误 |
| 开发模式 | `pnpm dev` | Vite HMR 正常，Banner 显示 |
| 生产构建 | `pnpm build` | 无错误，dist/ 生成 |
| 启动无 ERROR | 检查启动日志 | ERROR 行数 = 0 |
| OTel 正常 | 检查 `/api/metrics` | Prometheus 指标可用 |

### 步骤 4：提交 PR

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: upgrade vite to x.y.z

Verified: tests pass, dev/build modes work, OTel unaffected"
git push origin upgrade/vite-x.y.z
```

### 步骤 5：CI 验证

PR 触发 CI Pipeline（lint → test → security → build），全部通过后合并。

---

## 三、紧急回滚

如果升级后发现问题：

```bash
git revert HEAD
pnpm install
```

---

## 四、Vite 大版本升级注意事项

Vite 大版本升级（如 7.x → 8.x）需要额外关注：

1. **中间件模式 API**：`server/core/vite.ts` 中的 `createViteServer({ server: { middlewareMode: true } })` 是否有 API 变更
2. **共享配置**：`vite.config.shared.ts` 中的 `getSharedViteConfig()` 是否需要适配
3. **插件兼容性**：`@vitejs/plugin-react`、`@tailwindcss/vite` 是否有对应版本
4. **Node.js 版本要求**：Vite 新版本可能要求更高的 Node.js 版本
