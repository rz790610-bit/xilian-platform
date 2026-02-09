# PortAI Nexus 平台部署说明

**版本: v2.1**
**日期: 2026年02月09日**

---

本文档详细说明了 PortAI Nexus 平台的两种部署方式：**本地开发部署**和 **Docker 容器化部署**，以及相关的环境要求、配置、启动/停止和备份恢复流程。

## 1. 环境要求

在开始之前，请确保您的系统满足以下要求。

### 1.1. 硬件要求

| 组件 | 最低要求 | 推荐要求 |
| :--- | :--- | :--- |
| **CPU** | 4 核 | 8 核+ (Apple Silicon M1/M2/M3 Pro/Max/Ultra) |
| **内存** | 16 GB | 32 GB+ |
| **磁盘空间** | 150 GB | 256 GB+ (SSD) |

> **注意**: 运行大语言模型（如 70b 参数模型）对内存要求较高，建议 32GB 以上以获得流畅体验。

### 1.2. 软件要求

| 软件 | 版本 | 安装说明 |
| :--- | :--- | :--- |
| **Git** | 2.x+ | [https://git-scm.com/downloads](https://git-scm.com/downloads) |
| **Node.js** | 22.x | [https://nodejs.org/](https://nodejs.org/) (推荐使用 `nvm` 管理) |
| **pnpm** | 10.x+ | `corepack enable && corepack prepare pnpm@latest --activate` |
| **Docker** | 最新版 | [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/) |
| **Ollama** | 最新版 | [https://ollama.com/](https://ollama.com/) (用于本地运行大模型) |

## 2. 获取代码

所有部署方式的第一步都是从 GitHub 克隆最新的代码。

```bash
# 推荐克隆到桌面或常用的开发目录
cd ~/Desktop

# 克隆项目
git clone https://github.com/rz790610-bit/xilian-platform.git

# 进入项目目录
cd xilian-platform
```

## 3. 本地开发部署 (Native)

此模式直接在您的操作系统上运行 Node.js 服务，适合快速开发、调试和前端工作。它依赖本地安装的数据库、Redis 等服务。

### 3.1. 步骤

1.  **安装依赖:**

    ```bash
    pnpm install
    ```

2.  **配置环境变量:**

    复制环境变量模板文件，并根据您的本地环境进行修改。

    ```bash
    cp .env.local.template .env.local
    ```

    通常，您需要确保 `.env.local` 中的 `DATABASE_URL`, `REDIS_HOST`, `KAFKA_BROKERS` 等指向您本地运行的相应服务地址。

3.  **启动开发服务器:**

    此命令会同时启动前端 Vite 开发服务器和后端 Node.js 服务，并支持热重载。

    ```bash
    pnpm dev:local
    ```

4.  **访问平台:**

    服务启动后，默认可在浏览器中访问 `http://localhost:3000`。

### 3.2. 常用命令 (本地开发)

-   `pnpm dev`: 启动开发服务器（不加载 `.env.local`）。
-   `pnpm build`: 构建生产版本到 `dist/` 目录。
-   `pnpm start`: 运行生产构建版本。
-   `pnpm db:push`: 根据 `drizzle/schema.ts` 更新数据库结构。

## 4. Docker 容器化部署

此模式是**推荐的生产和标准化部署方式**。它使用 Docker Compose 将平台及其所有 11 个依赖服务（MySQL, Redis, Kafka, Ollama 等）打包成独立的容器，实现一键启动和环境隔离。

### 4.1. 步骤

1.  **启动所有服务:**

    在项目根目录执行以下命令。首次运行时，Docker 会自动拉取所有镜像并进行构建。

    ```bash
    # -d: 后台运行
    # --build: 如果 Dockerfile 或相关文件有变动，则强制重新构建
    docker-compose up -d --build
    ```

2.  **检查服务状态:**

    等待所有服务启动（特别是数据库和 Kafka 可能需要几十秒初始化），然后检查状态。

    ```bash
    docker-compose ps
    ```

    当所有服务的 `State` 都显示为 `Up (healthy)` 时，表示平台已准备就绪。

3.  **访问平台:**

    -   **PortAI Nexus 平台**: `http://localhost:3000`
    -   **Grafana 监控面板**: `http://localhost:3001` (用户: `admin`, 密码: `admin123`)
    -   **MinIO 对象存储控制台**: `http://localhost:9011` (用户: `portai`, 密码: `portai123456`)

### 4.2. 环境变量 (Docker)

Docker Compose 会自动读取项目根目录下的 `.env` 文件（如果存在）来覆盖 `docker-compose.yml` 中的默认环境变量。您可以创建一个 `.env` 文件来定制端口、密码等配置。

### 4.3. 常用命令 (Docker)

-   `docker-compose up -d`: 在后台启动所有服务。
-   `docker-compose down`: 停止并移除所有容器。
-   `docker-compose logs -f <service_name>`: 实时查看指定服务的日志（如 `docker-compose logs -f app`）。
-   `docker-compose exec <service_name> /bin/sh`: 进入正在运行的容器内部（如 `docker-compose exec mysql /bin/sh`）。
-   `docker-compose build <service_name>`: 单独重新构建某个服务的镜像。

## 5. 日常运维

### 5.1. 停止服务

-   **本地开发**: 在运行 `pnpm dev:local` 的终端中按 `Ctrl + C`。
-   **Docker 部署**: `docker-compose down`

### 5.2. 清理端口

如果遇到端口被占用的问题，可以使用以下命令查找并停止占用进程。

```bash
# 查找占用 3000 端口的进程 PID
lsof -t -i :3000

# 停止该进程 (将 <PID> 替换为上一步找到的数字)
kill <PID>
```

### 5.3. 备份与恢复

#### 5.3.1. 代码备份

定期将代码推送到 Git 远程仓库是最好的备份方式。如果需要创建本地快照，可以使用 `tar` 命令。

```bash
# 在项目根目录的上一级执行
cd ~/Desktop

# 创建备份压缩包 (排除了 node_modules, .git, dist 等大目录)
tar -czf xilian-platform-backup-$(date +%Y%m%d).tar.gz --exclude='node_modules' --exclude='.git' --exclude='dist' xilian-platform
```

#### 5.3.2. 数据备份 (Docker)

平台所有数据都存储在 Docker 的命名卷 (Named Volumes) 中。备份这些卷即可实现数据备份。

```bash
# 备份 MySQL 数据
docker run --rm -v portai-mysql-data:/data -v $(pwd)/backups:/backups busybox tar -czf /backups/mysql-backup-$(date +%Y%m%d).tar.gz /data

# 备份 MinIO 数据
docker run --rm -v portai-minio-data:/data -v $(pwd)/backups:/backups busybox tar -czf /backups/minio-backup-$(date +%Y%m%d).tar.gz /data
```

恢复时，先停止并移除容器，然后将备份文件解压到对应的卷目录即可。

---

**文档结束**
