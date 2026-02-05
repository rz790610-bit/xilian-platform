# 西联智能平台 (XiLian Platform)

西联智能平台是一个面向工业物联网的综合性智能运维管理系统，提供设备监控、数据分析、知识管理、AI 辅助等功能。

## 技术栈

### 前端
- **React 19** + **TypeScript**
- **Vite** 构建工具
- **Tailwind CSS 4** 样式框架
- **shadcn/ui** 组件库
- **tRPC** 类型安全的 API 调用

### 后端
- **Node.js** + **Express**
- **tRPC** API 框架
- **Drizzle ORM** 数据库操作
- **MySQL/TiDB** 数据库

### 基础设施集成
- **Kubernetes** 容器编排
- **Prometheus** 指标监控
- **Elasticsearch** 日志分析
- **Jaeger** 分布式追踪
- **Kafka** 消息队列
- **Redis** 缓存

## 功能模块

| 模块 | 描述 | 路径 |
|------|------|------|
| 仪表盘 | 系统概览和关键指标 | `/dashboard` |
| 可观测性 | Prometheus/Grafana、ELK、Jaeger 集成 | `/settings/observability` |
| Kafka 监控 | Kafka 集群和消息流监控 | `/settings/kafka` |
| 数据流监控 | 数据管道和流处理监控 | `/settings/datastream` |
| 基础设施 | Kubernetes、ArgoCD、Vault 管理 | `/settings/infrastructure` |
| 运维管理 | 自动扩缩容、故障自愈、备份恢复 | `/settings/ops` |
| 智能监控 | AI 驱动的异常检测和预测 | `/settings/monitoring` |
| AI 对话 | 智能运维助手 | `/chat` |
| 知识管理 | 知识库和知识图谱 | `/knowledge/manager` |

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 8
- MySQL 8.0+ 或 TiDB

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置必要的环境变量：

```env
# 数据库连接
DATABASE_URL=mysql://user:password@localhost:3306/xilian

# 跳过认证（本地开发）
SKIP_AUTH=true

# 其他可选配置
PROMETHEUS_URL=http://localhost:9090
ELASTICSEARCH_URL=http://localhost:9200
KAFKA_BROKERS=localhost:9092
```

### 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000

### 数据库迁移

```bash
pnpm db:push
```

## 项目结构

```
xilian-platform/
├── client/                 # 前端代码
│   ├── src/
│   │   ├── components/     # 可复用组件
│   │   ├── pages/          # 页面组件
│   │   ├── hooks/          # 自定义 Hooks
│   │   ├── lib/            # 工具库
│   │   └── services/       # 前端服务
│   └── public/             # 静态资源
├── server/                 # 后端代码
│   ├── _core/              # 核心框架
│   ├── database/           # 数据库相关
│   ├── device/             # 设备管理
│   ├── infrastructure/     # 基础设施集成
│   ├── observability/      # 可观测性
│   ├── ops/                # 运维管理
│   └── routers.ts          # tRPC 路由
├── shared/                 # 前后端共享代码
├── drizzle/                # 数据库 Schema
└── deploy/                 # 部署配置
```

## 开发指南

### 代码规范

项目使用 ESLint + Prettier 进行代码规范检查：

```bash
# 格式化代码
pnpm format

# 运行测试
pnpm test
```

### TypeScript 配置

项目启用了严格的 TypeScript 检查：

- `strict: true`
- `strictNullChecks: true`
- `noImplicitReturns: true`
- `noFallthroughCasesInSwitch: true`

### 添加新功能

1. 在 `drizzle/schema.ts` 定义数据表
2. 运行 `pnpm db:push` 同步数据库
3. 在 `server/db.ts` 添加数据库操作函数
4. 在 `server/routers.ts` 添加 tRPC 路由
5. 在 `client/src/pages/` 创建页面组件

## 部署

### Docker 部署

```bash
docker build -t xilian-platform .
docker run -p 3000:3000 xilian-platform
```

### 生产构建

```bash
pnpm build
pnpm start
```

## 许可证

MIT License
