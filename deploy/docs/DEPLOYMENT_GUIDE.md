# 西联智能平台 - 本地化部署指南

## 概述

本文档提供西联智能平台（XiLian Intelligent Platform）的本地化一键部署指南。该平台是一个面向工业物联网的智能诊断与运维系统，集成了设备管理、数据分析、AI 推理、安全监控等核心功能。

## 系统要求

### 硬件配置

| 配置项 | 最低要求 | 推荐配置 |
|--------|----------|----------|
| CPU | 4 核 | 8 核及以上 |
| 内存 | 8 GB | 16 GB 及以上 |
| 磁盘 | 50 GB SSD | 200 GB SSD |
| 网络 | 100 Mbps | 1 Gbps |

### 软件依赖

| 软件 | 版本要求 | 说明 |
|------|----------|------|
| Docker | 20.10+ | 容器运行时 |
| Docker Compose | 2.0+ | 容器编排工具 |
| 操作系统 | Linux/macOS/Windows 10+ | 支持 Docker 的系统 |

## 快速开始

### 第一步：获取部署文件

```bash
# 克隆项目仓库
git clone https://github.com/your-org/xilian-platform.git
cd xilian-platform/deploy
```

### 第二步：配置环境变量

```bash
# 复制配置模板
cp config/env.template config/.env

# 编辑配置文件（根据实际情况修改）
vim config/.env
```

**重要配置项说明：**

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `APP_PORT` | 3000 | 应用服务端口 |
| `JWT_SECRET` | - | JWT 签名密钥（生产环境必须修改） |
| `MYSQL_PASSWORD` | xilian123 | MySQL 数据库密码 |
| `GRAFANA_PASSWORD` | admin123 | Grafana 管理员密码 |

### 第三步：执行部署

**Linux / macOS：**
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh deploy
```

**Windows：**
```cmd
scripts\deploy.bat deploy
```

### 第四步：验证部署

部署完成后，可通过以下地址访问各服务：

| 服务 | 地址 | 默认账号 |
|------|------|----------|
| 主应用 | http://localhost:3000 | - |
| Grafana | http://localhost:3001 | admin / admin123 |
| Prometheus | http://localhost:9090 | - |

## 服务架构

本部署方案包含以下核心服务：

```
┌─────────────────────────────────────────────────────────────┐
│                      Nginx (可选)                            │
│                    反向代理 / 负载均衡                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     西联智能平台主应用                        │
│                   (Node.js + React)                         │
└─────────────────────────────────────────────────────────────┘
          │              │              │              │
          ▼              ▼              ▼              ▼
    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
    │  MySQL  │    │  Redis  │    │ClickHouse│   │  Kafka  │
    │ 关系数据 │    │  缓存   │    │ 时序数据 │    │ 消息队列 │
    └─────────┘    └─────────┘    └─────────┘    └─────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────┐
    │                    监控服务                              │
    │           Prometheus + Grafana                          │
    └─────────────────────────────────────────────────────────┘
```

## 命令参考

部署脚本支持以下命令：

| 命令 | 说明 |
|------|------|
| `deploy` | 完整部署（拉取镜像、构建、启动） |
| `start` | 启动所有服务 |
| `stop` | 停止所有服务 |
| `restart` | 重启所有服务 |
| `status` | 查看服务状态 |
| `logs [服务名]` | 查看日志（可指定服务） |
| `cleanup` | 清理所有数据卷 |

**使用示例：**

```bash
# 查看服务状态
./scripts/deploy.sh status

# 查看应用日志
./scripts/deploy.sh logs xilian-app

# 重启服务
./scripts/deploy.sh restart
```

## 高级配置

### 启用可选服务

部署文件支持以下可选服务，通过 Docker Compose profiles 启用：

```bash
# 启用 MinIO 对象存储
docker compose --profile storage up -d

# 启用 Nginx 反向代理
docker compose --profile proxy up -d

# 启用所有可选服务
docker compose --profile storage --profile proxy up -d
```

### 数据持久化

所有数据通过 Docker volumes 持久化存储：

| 数据卷 | 说明 |
|--------|------|
| `mysql-data` | MySQL 数据库文件 |
| `redis-data` | Redis 持久化数据 |
| `clickhouse-data` | ClickHouse 时序数据 |
| `kafka-data` | Kafka 消息数据 |
| `prometheus-data` | Prometheus 监控数据 |
| `grafana-data` | Grafana 配置和仪表盘 |

### 自定义端口

如需修改默认端口，编辑 `config/.env` 文件：

```bash
# 应用端口
APP_PORT=8080

# 数据库端口
MYSQL_PORT=3307
REDIS_PORT=6380

# 监控端口
GRAFANA_PORT=3002
PROMETHEUS_PORT=9091
```

## 故障排查

### 常见问题

**问题 1：Docker 服务未启动**
```bash
# Linux
sudo systemctl start docker

# macOS / Windows
# 启动 Docker Desktop 应用
```

**问题 2：端口被占用**
```bash
# 检查端口占用
netstat -tlnp | grep 3000

# 修改配置文件中的端口
vim config/.env
```

**问题 3：服务启动失败**
```bash
# 查看详细日志
./scripts/deploy.sh logs

# 查看特定服务日志
docker compose logs xilian-app --tail=100
```

**问题 4：数据库连接失败**
```bash
# 检查 MySQL 服务状态
docker compose ps mysql

# 查看 MySQL 日志
docker compose logs mysql
```

### 日志位置

| 服务 | 日志查看命令 |
|------|-------------|
| 应用 | `docker compose logs xilian-app` |
| MySQL | `docker compose logs mysql` |
| Redis | `docker compose logs redis` |
| Kafka | `docker compose logs kafka` |

## 生产环境建议

部署到生产环境时，请注意以下事项：

1. **修改所有默认密码** - 包括 MySQL、Grafana、JWT 密钥等
2. **启用 HTTPS** - 配置 Nginx SSL 证书
3. **配置防火墙** - 仅开放必要端口
4. **设置资源限制** - 在 docker-compose.yml 中配置 CPU/内存限制
5. **配置日志轮转** - 避免日志文件过大
6. **定期备份** - 配置数据库自动备份策略

## 技术支持

如遇到问题，请通过以下方式获取支持：

- 提交 Issue：https://github.com/your-org/xilian-platform/issues
- 技术文档：https://docs.xilian-platform.com
- 邮件支持：support@xilian-platform.com

---

**文档版本：** 1.0.0  
**最后更新：** 2026-02-04  
**作者：** Manus AI
