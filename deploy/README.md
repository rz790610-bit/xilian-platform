# 西联智能平台 - 本地化一键部署

## 快速开始

### Linux / macOS

```bash
# 1. 进入部署目录
cd deploy

# 2. 配置环境变量
cp config/env.template config/.env
# 编辑 .env 文件修改配置

# 3. 执行部署
chmod +x scripts/deploy.sh
./scripts/deploy.sh deploy
```

### Windows

```cmd
:: 1. 进入部署目录
cd deploy

:: 2. 配置环境变量
copy config\env.template config\.env
:: 编辑 .env 文件修改配置

:: 3. 执行部署
scripts\deploy.bat deploy
```

## 访问地址

| 服务 | 地址 | 默认账号 |
|------|------|----------|
| 主应用 | http://localhost:3000 | - |
| Grafana | http://localhost:3001 | admin / admin123 |
| Prometheus | http://localhost:9090 | - |

## 常用命令

```bash
./scripts/deploy.sh status   # 查看状态
./scripts/deploy.sh logs     # 查看日志
./scripts/deploy.sh stop     # 停止服务
./scripts/deploy.sh restart  # 重启服务
```

## 详细文档

查看 [部署指南](docs/DEPLOYMENT_GUIDE.md) 获取完整文档。

## 目录结构

```
deploy/
├── docker/                 # Docker 相关文件
│   ├── docker-compose.yml  # 服务编排配置
│   ├── Dockerfile.app      # 应用镜像构建
│   └── config/             # 服务配置文件
├── config/                 # 环境配置
│   └── env.template        # 环境变量模板
├── scripts/                # 部署脚本
│   ├── deploy.sh           # Linux/Mac 脚本
│   └── deploy.bat          # Windows 脚本
└── docs/                   # 文档
    └── DEPLOYMENT_GUIDE.md # 部署指南
```
