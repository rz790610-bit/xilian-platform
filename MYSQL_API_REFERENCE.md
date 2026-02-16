# MySQL 状态页面 — 可用 API 参考

## 1. 健康检查（快速）
**trpc 路径**: `platformSystem.health.check`
**返回**: `{ mysql: { status: "healthy"|"unhealthy", latency: number }, clickhouse, redis, timestamp }`
**底层**: `mysqlConnector.healthCheck()` → `SELECT 1` 测试连接

## 2. 连接详情（完整）
**trpc 路径**: `database.workbench.connection.getStatus`
**返回**:
```ts
{
  connected: boolean,
  host: string,        // 从 DATABASE_URL 解析
  port: number,
  database: string,    // DATABASE()
  version: string,     // VERSION()
  uptime: number,      // SHOW STATUS LIKE 'Uptime'
  charset: string,     // @@character_set_database
  maxConnections: number,     // SHOW VARIABLES LIKE 'max_connections'
  currentConnections: number, // SHOW STATUS LIKE 'Threads_connected'
  dataSize: string,    // 格式化后的字节 (如 "12.5 MB")
  indexSize: string,
  totalTables: number, // information_schema.TABLES COUNT
}
```
**未连接时**: 全部返回默认空值, connected=false

## 3. 连接测试
**trpc 路径**: `database.workbench.connection.testConnection`
**返回**: `{ success: boolean, latency: number, error?: string }`

## 4. 表列表
**trpc 路径**: `platformSystem.health.listTables`
**返回**: `string[]` — 所有表名

## 5. 表数量
**trpc 路径**: `platformSystem.health.tableCount`
**返回**: `number`

## 6. Docker 容器启动 MySQL
**trpc 路径**: `docker.startEngine`
**输入**: `{ containerName: "portai-mysql" }`
**返回**: `DockerActionResult`
**底层**: `dockerManager.startEngine("portai-mysql")`

## 7. Docker 容器列表
**trpc 路径**: `docker.listEngines`
**返回**: `{ success: boolean, engines: Engine[] }`
**可用于**: 检查 portai-mysql 容器是否存在/运行中

---

## 页面设计
- 路径: `/settings/status/mysql`
- 导航: 状态监控 → MySQL 状态
- 顶部: 一键启动 MySQL 按钮 (`docker.startEngine({ containerName: "portai-mysql" })`)
- 主体: 简单明了的状态卡片
  - 连接状态 (在线/离线)
  - 版本、主机、端口、数据库名
  - 运行时间
  - 连接数 (当前/最大)
  - 存储 (数据大小/索引大小)
  - 表数量
