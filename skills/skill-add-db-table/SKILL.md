# Skill: 新增数据库表

## 触发条件

- 用户要求"新增/添加数据库表"
- 用户要求为新功能持久化数据
- 用户提到 "schema" / "drizzle" / "table" / "数据库表"

## 前置检查

1. **确认归属 Schema** — 核心业务 → `drizzle/schema.ts`；进化域 → `drizzle/evolution-schema.ts`；HDE → `drizzle/hde-schema.ts`
2. **确认表名唯一** — `grep -r "mysqlTable.*table_name" drizzle/` 避免冲突
3. **确认命名规范** — TS 变量 camelCase，数据库字段 snake_case
4. **确认是否需要关系** — 一对多/多对多关系在 `drizzle/relations.ts` 定义

## 标准步骤

### Step 1: 定义表结构

**文件**: `drizzle/[target-schema].ts`

```typescript
import { mysqlTable, int, bigint, varchar, text, double, boolean, timestamp, json, mysqlEnum, index, uniqueIndex } from 'drizzle-orm/mysql-core';

export const myFeatureRecords = mysqlTable('my_feature_records', {
  // ── 主键 ──
  id: int('id').autoincrement().primaryKey(),                    // 小表 <1M 行
  // id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),  // 大表 >1M 行

  // ── 业务键 ──
  recordId: varchar('record_id', { length: 64 }).notNull().unique(),  // 外部可见 UUID

  // ── 外键 ──
  machineId: varchar('machine_id', { length: 100 }).notNull(),

  // ── 业务字段 ──
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  status: mysqlEnum('status', ['pending', 'running', 'completed', 'failed']).default('pending').notNull(),
  severity: mysqlEnum('severity', ['info', 'warning', 'error', 'critical']).default('info'),
  score: double('score'),                                        // 0-1 范围
  count: int('count').default(0),
  enabled: boolean('enabled').default(true).notNull(),

  // ── JSON 字段（必须有 $type） ──
  metadata: json('metadata').$type<Record<string, unknown>>(),
  config: json('config').$type<{
    threshold: number;
    enabled: boolean;
  }>(),

  // ── 时间戳 ──
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  // 高精度场景（HDE/Evolution）:
  // createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, (table) => [
  // ── 索引 ──
  index('idx_mfr_machine').on(table.machineId),
  index('idx_mfr_status').on(table.status),
  index('idx_mfr_created').on(table.createdAt),
  uniqueIndex('uq_mfr_record').on(table.recordId),
]);

// ── 导出类型（必须） ──
export type MyFeatureRecord = typeof myFeatureRecords.$inferSelect;
export type InsertMyFeatureRecord = typeof myFeatureRecords.$inferInsert;
```

### Step 2: 定义关系 (如需)

**文件**: `drizzle/relations.ts`

```typescript
import { relations } from 'drizzle-orm';
import { myFeatureRecords } from './schema';
import { users } from './schema';

export const myFeatureRecordsRelations = relations(myFeatureRecords, ({ one }) => ({
  creator: one(users, { fields: [myFeatureRecords.userId], references: [users.id] }),
}));
```

### Step 3: 推送到数据库

```bash
pnpm db:push       # 开发环境：生成 + 应用（一步）
# 或
pnpm db:generate   # 生成迁移文件
pnpm db:migrate    # 应用迁移（生产环境）
```

### Step 4: 验证

```bash
pnpm check         # TypeScript 编译通过
pnpm db:studio     # 在 Web UI 中确认表已创建
```

## 必须满足的验收标准

- [ ] TS 变量名 camelCase，数据库字段 snake_case
- [ ] 有 `id` 主键（int 或 bigint autoincrement）
- [ ] 有 `createdAt` + `updatedAt` 时间戳
- [ ] 业务键有 unique 索引
- [ ] JSON 字段有 `.$type<T>()` 类型标注
- [ ] 常用查询字段有索引（status, machineId, createdAt）
- [ ] 导出 Select 和 Insert 类型
- [ ] 索引命名 `idx_` / `uq_` + 表缩写 + 字段
- [ ] `pnpm check` 通过

## 列类型选择指南

| 用途 | 类型 | 长度 | 示例 |
|------|------|------|------|
| 主键(小表) | `int` | - | `id: int('id').autoincrement().primaryKey()` |
| 主键(大表) | `bigint` | - | `id: bigint('id', { mode: 'number' }).autoincrement()` |
| 业务键/UUID | `varchar` | 64-128 | `sessionId: varchar('session_id', { length: 64 })` |
| 名称/标签 | `varchar` | 100-255 | `name: varchar('name', { length: 200 })` |
| 设备/传感器编码 | `varchar` | 64-100 | `machineId: varchar('machine_id', { length: 100 })` |
| 长文本 | `text` | - | `description: text('description')` |
| 灵活结构 | `json` | - | `metadata: json('metadata').$type<T>()` |
| 固定选项 | `mysqlEnum` | - | `status: mysqlEnum('status', [...])` |
| 分数/比率 | `double` | - | `confidence: double('confidence')` |
| 计数 | `int` | - | `count: int('count').default(0)` |
| 布尔 | `boolean` | - | `enabled: boolean('enabled').default(true)` |

## 常见错误和预防

| 错误 | 后果 | 预防 |
|------|------|------|
| JSON 字段无 `$type<T>()` | 运行时类型不安全 | 所有 json 字段必须标注类型 |
| 忘记导出 Select/Insert 类型 | 服务层需要手动写类型 | 定义表后立即 export type |
| 忘记 `updatedAt` | 无法追踪记录修改时间 | 双时间戳是标配 |
| 索引命名不一致 | 维护困难 | 统一 `idx_` / `uq_` 前缀 |
| 在 `relations.ts` 加了外键但没建索引 | 关联查询慢 | 外键字段必须有索引 |
| 大表用 `int` 主键 | 超过 21 亿行溢出 | 预估超 1M 行用 `bigint` |
| 生产环境用 `db:push` | 可能丢数据 | 生产用 `db:generate` + `db:migrate` |

## 示例

### 好的示例

```typescript
export const diagnosisSessions = mysqlTable('diagnosis_sessions', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  sessionId: varchar('session_id', { length: 64 }).notNull().unique(),
  machineId: varchar('machine_id', { length: 100 }).notNull(),
  status: mysqlEnum('status', ['pending', 'running', 'completed', 'failed']).default('pending').notNull(),
  confidence: double('confidence'),
  metadata: json('metadata').$type<{ tracks: string[]; fusionStrategy: string }>(),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { fsp: 3 }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index('idx_ds_machine').on(table.machineId),
  index('idx_ds_status').on(table.status),
]);
export type DiagnosisSession = typeof diagnosisSessions.$inferSelect;
export type InsertDiagnosisSession = typeof diagnosisSessions.$inferInsert;
```

### 坏的示例

```typescript
export const myTable = mysqlTable('my_table', {
  id: int('id'),                      // 没有 autoincrement 和 primaryKey
  data: json('data'),                 // 没有 $type<T>()
  name: varchar('name', { length: 50 }), // 太短
  // 没有 createdAt / updatedAt
  // 没有索引
});
// 没有导出类型
```

## 涉及文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `drizzle/schema.ts` 或 `evolution-schema.ts` 或 `hde-schema.ts` | **修改** | 添加表定义 |
| `drizzle/relations.ts` | 可选修改 | 添加关系定义 |
| `drizzle/migrations/` | 自动生成 | `pnpm db:generate` |
