# 平台架构审计笔记

## 关键文件和集成点

### 后端集成点
1. **主路由**: `server/routers.ts` - 注册所有 tRPC 路由
2. **服务初始化**: `server/_core/index.ts` - 服务启动入口，初始化 WebSocket、健康检查
3. **事件总线**: `server/eventBus.ts` - 内存事件总线，支持 publish/subscribe，持久化到 DB
4. **健康检查**: `server/healthCheck.ts` - 定时检查服务状态，更新拓扑节点
5. **拓扑发现**: `server/topologyDiscovery.ts` - 自动发现服务并生成拓扑
6. **Redis 客户端**: `server/redis/redisClient.ts` - 已有完善的 Redis 客户端
7. **Kafka 客户端**: `server/kafka/kafkaClient.ts` - 已有 Kafka 集成

### 前端集成点
1. **导航配置**: `client/src/config/navigation.ts` - 左侧菜单配置
2. **路由**: `client/src/App.tsx` - 前端路由注册
3. **仪表盘**: `client/src/pages/Dashboard.tsx` - 首页概览
4. **系统设置**: `client/src/pages/Settings.tsx` - 系统设置页面

### 需要集成的新模块
1. outbox 混合发布器 → 注册到 routers.ts + 对接 eventBus + 添加到拓扑发现
2. saga 补偿机制 → 注册到 routers.ts + 对接 eventBus + 添加到拓扑发现
3. 自适应采样 → 注册到 routers.ts + 对接 kafka + 添加到健康检查
4. Redis 去重 → 注册到 routers.ts + 对接 redisClient + 对接 eventBus
5. 读写分离 → 注册到 routers.ts + 对接 db.ts + 添加到健康检查
6. 图查询优化 → 注册到 routers.ts + 对接 knowledge 模块

### 拓扑集成
- topologyDiscovery.ts 的 DISCOVERABLE_SERVICES 数组需要添加新服务
- healthCheck.ts 的 SYSTEM_SERVICES 数组需要添加新服务监控
- 事件总线 TOPICS 需要添加新主题

### 前端集成
- navigation.ts 需要在"系统设置"下添加新菜单项
- App.tsx 需要添加新路由
- 需要创建新的前端页面组件
