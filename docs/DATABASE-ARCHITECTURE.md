# 数据库架构说明

## 架构原则

**单一权威源**：Drizzle ORM schema（`drizzle/schema.ts` + `drizzle/evolution-schema.ts`）是所有 MySQL 表结构的唯一权威定义。Docker init SQL 脚本从 Drizzle schema 精确翻译而来。

**首次初始化即完整**：Docker volume 首次创建时，init 脚本按文件名字母序自动执行，创建全部 163 张表 + 种子数据。无需手动跑 migration。

**幂等安全**：所有 DDL 使用 `CREATE TABLE IF NOT EXISTS`，种子数据使用 `INSERT IGNORE`，可安全重复执行。

---

## MySQL 初始化脚本（执行顺序）

| 序号 | 文件名 | 类型 | 表数 | 说明 |
|------|--------|------|------|------|
| 1 | `01-base-ddl.sql` | DDL | 121 | 基础平台表（用户/设备/告警/诊断/算法等） |
| 2 | `02-v5-ddl.sql` | DDL | 24 | V5 认知层表（工况/认知会话/护栏/进化等） |
| 3 | `03-evolution-ddl.sql` | DDL | 15 | 世界模型/数字孪生 + 认知引擎扩展 |
| 4 | `04-pipeline-ddl.sql` | DDL | 3 | Pipeline 编排表 |
| 5 | `05-base-seed.sql` | Seed | - | 基础种子数据（角色/权限/设备类型等） |
| 6 | `06-v5-seed.sql` | Seed | - | V5 种子数据（工况模板/特征定义等） |
| 7 | `07-evolution-seed.sql` | Seed | - | 进化层种子数据（仿真场景/物理方程） |

**总计：163 张表**

---

## ClickHouse 初始化脚本

| 序号 | 文件名 | 内容 |
|------|--------|------|
| 1 | `01_base_tables.sql` | 15 张基础 MergeTree 表（V1:4 + V4:6 + V5:5） |
| 2 | `02_views_and_indexes.sql` | 2 Kafka 表 + 18 物化视图 + 2 兼容视图 + 20 索引 |

**总计：37 个对象**

---

## Migration 脚本（历史记录）

`docker/mysql/migrations/` 目录保留历史迁移脚本作为变更审计记录。**新部署无需执行这些脚本**——所有内容已合并到 init 脚本中。

仅在**已有数据库升级**时才需要按序执行 migration。

---

## 验证

```bash
./scripts/verify-db.sh
```

该脚本检查：
- MySQL 表数量 >= 163
- ClickHouse 对象数量 >= 37
- 关键表存在性（基础/V5/进化层/Pipeline）
- 种子数据完整性

---

## 新增表的流程

1. 在 `drizzle/evolution-schema.ts`（或 `schema.ts`）中定义 Drizzle table
2. 在对应的 init SQL 文件中添加 `CREATE TABLE IF NOT EXISTS`
3. 创建 migration 脚本（用于已部署环境的增量升级）
4. 更新 `verify-db.sh` 中的预期表数量
5. 更新本文档的表数量统计
