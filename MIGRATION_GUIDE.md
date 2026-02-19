# 西联平台 — 数据库迁移工作流指南

## 核心原则

> **`drizzle/schema.ts` 是唯一权威的数据库 Schema 定义。所有 SQL 迁移必须从它生成。**

## 目录结构

```
drizzle/
  schema.ts              ← 唯一权威 Schema 定义（TypeScript）
  relations.ts           ← 表关系定义
  meta/_journal.json     ← Drizzle 迁移历史追踪
  0000_*.sql             ← Drizzle 自动生成的迁移 SQL

docker/mysql/
  init/
    01-schema.sql        ← Docker 首次部署初始化（从 drizzle 同步）
    02-seed-data.sql     ← 种子数据
  migrations/
    archive/             ← 历史迁移归档（仅供参考，不再执行）

server/services/
  access-layer.service.ts ← 运行时兜底建表（CREATE IF NOT EXISTS）
```

## 修改数据库 Schema 的标准流程

### 1. 修改 Schema 定义

编辑 `drizzle/schema.ts`，添加或修改表/列定义。

```typescript
// 示例：添加新表
export const myNewTable = mysqlTable("my_new_table", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

**列名规范**：TypeScript 属性名使用 camelCase，SQL 列名使用 snake_case。

### 2. 生成迁移 SQL

```bash
# 生成增量迁移
npx drizzle-kit generate

# 检查生成的 SQL 文件
cat drizzle/0001_*.sql
```

### 3. 应用迁移

```bash
# 开发环境：直接推送（跳过迁移追踪）
npx drizzle-kit push

# 生产环境：执行迁移（带版本追踪）
npx drizzle-kit migrate
```

### 4. 同步 Docker 初始化脚本

```bash
# 重新生成全量 SQL
python3 scripts/generate_full_schema.py > docker/mysql/init/01-schema.sql
```

### 5. 提交代码

```bash
git add drizzle/ docker/mysql/init/01-schema.sql
git commit -m "feat(db): add my_new_table"
```

## 注意事项

### 列名风格

- TypeScript 属性名：`camelCase`（如 `createdAt`）
- SQL 列名：`snake_case`（如 `created_at`）
- Drizzle ORM 自动映射两者

### 运行时兜底建表

`server/services/access-layer.service.ts` 中的 `ensureAccessLayerTables()` 使用 `CREATE TABLE IF NOT EXISTS` 作为运行时兜底。这是为了确保即使未执行 drizzle migrate 也能正常工作。**不要在其他地方添加类似的兜底逻辑**——新表应通过 drizzle 迁移创建。

### ClickHouse 表

ClickHouse 时序表（`sensor_readings_raw`、`sensor_readings_1m`、`sensor_readings_1h`、`fault_events`）在 `server/lib/storage/clickhouse.storage.ts` 中通过 `ensureTable` 创建。这些表不在 MySQL 中，不受 drizzle 管理。

### 禁止事项

- ❌ 不要手动创建 SQL 迁移文件
- ❌ 不要在 `docker/mysql/migrations/` 中添加新文件（已归档）
- ❌ 不要在 `migrations/` 目录中添加文件（已废弃）
- ❌ 不要在服务代码中添加新的 `CREATE TABLE IF NOT EXISTS`
- ❌ 不要使用 camelCase 作为 SQL 列名
