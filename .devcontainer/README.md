# Dev Container 开发环境

## 快速开始

### 方式一：VS Code（推荐）

1. 安装 [Dev Containers 扩展](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. 打开项目目录
3. 按 `F1` → 输入 `Dev Containers: Reopen in Container`
4. 等待容器构建完成（首次约 3-5 分钟）
5. 在终端中运行 `pnpm dev`

### 方式二：GitHub Codespaces

1. 在 GitHub 仓库页面点击 `Code` → `Codespaces` → `Create codespace on main`
2. 等待环境初始化
3. 在终端中运行 `pnpm dev`

## 包含的服务

| 服务 | 端口 | 用途 |
|------|------|------|
| 应用 | 3000 | 主应用（前端 + 后端） |
| MySQL | 3306 | 主数据库 |
| Redis | 6379 | 缓存 + 消息队列 |
| ClickHouse | 8123 | 时序分析（可选） |

## 启用可选服务

ClickHouse 默认不启动，需要时：

```bash
# 在 devcontainer 终端中
docker compose -f .devcontainer/docker-compose.devcontainer.yml --profile analytics up -d clickhouse
```

## 预装的 VS Code 扩展

- ESLint + Prettier（自动格式化）
- Tailwind CSS IntelliSense
- Vitest Explorer（测试运行器）
- GitLens + Git Graph
- MySQL + Redis 客户端
- Docker + Kubernetes 工具
- GitHub Copilot

## 环境变量

开发环境变量已预配置在 `docker-compose.devcontainer.yml` 中。如需自定义，创建 `.env.local` 文件（已在 `.gitignore` 中排除）。

## 常见问题

**Q: 容器启动后 `pnpm install` 失败？**

A: 检查 Node.js 版本是否为 22.x：`node -v`。如果不是，运行 `corepack enable && corepack prepare pnpm@10.4.1 --activate`。

**Q: MySQL 连接失败？**

A: 等待 MySQL 健康检查通过（约 30 秒）。可以用 `docker compose -f .devcontainer/docker-compose.devcontainer.yml ps` 检查状态。

**Q: 端口冲突？**

A: 修改 `docker-compose.devcontainer.yml` 中的端口映射，或停止本地占用端口的服务。
