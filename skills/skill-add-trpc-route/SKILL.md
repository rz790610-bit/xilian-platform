# Skill: 新增 tRPC 路由

## 触发条件

- 用户要求"新增/添加 API 接口"
- 用户要求为新功能创建后端路由
- 用户提到 "router" / "tRPC" / "endpoint"

## 前置检查

1. **确认是否已有相似路由** — 检查 `server/api/` 和 `server/domains/` 避免重复
2. **确认访问级别** — 只读查询用 `publicProcedure`，写操作用 `protectedProcedure`，系统管理用 `adminProcedure`
3. **确认是否需要共享类型** — 复杂类型放 `shared/`，简单的内联 Zod 即可
4. **确认归属域** — 属于哪个业务域（感知/认知/知识/工具/...），大模块考虑子目录聚合

## 标准步骤

### Step 1: 创建路由文件

**文件**: `server/api/[featureName].router.ts`

```typescript
import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../core/trpc';
import { TRPCError } from '@trpc/server';

// ============================================================================
// Zod Input Schemas
// ============================================================================

const listInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
}).optional();

const createInput = z.object({
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().optional().default(''),
});

// ============================================================================
// Router
// ============================================================================

export const featureRouter = router({
  list: publicProcedure
    .input(listInput)
    .query(async ({ input }) => {
      // 业务逻辑
      return { items: [], total: 0 };
    }),

  get: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const result = null; // 查询逻辑
      if (!result) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '未找到' });
      }
      return result;
    }),

  create: protectedProcedure
    .input(createInput)
    .mutation(async ({ input }) => {
      // 创建逻辑
      return { success: true };
    }),
});
```

### Step 2: 注册到主路由

**文件**: `server/routers.ts`

```typescript
import { featureRouter } from "./api/feature.router";

export const appRouter = router({
  // ...现有路由
  feature: featureRouter,  // 添加这行
});
```

### Step 3: 前端调用 (如需)

```typescript
// 查询
const query = trpc.feature.list.useQuery({ page: 1, pageSize: 20 });
// 修改
const mutation = trpc.feature.create.useMutation({
  onSuccess: () => { query.refetch(); toast.success('成功'); },
  onError: (err) => toast.error(err.message),
});
```

### Step 4: 验证

```bash
pnpm check    # TypeScript 编译通过
pnpm dev      # 启动后访问 API 正常
```

## 必须满足的验收标准

- [ ] 路由文件命名 `[featureName].router.ts`（camelCase）
- [ ] 导出名 `export const [featureName]Router`
- [ ] 所有输入都有 Zod schema 校验
- [ ] 查询用 `publicProcedure`，写操作用 `protectedProcedure`
- [ ] 错误用 `TRPCError` 抛出（NOT_FOUND, BAD_REQUEST 等）
- [ ] 已在 `server/routers.ts` 注册
- [ ] `pnpm check` 通过

## 常见错误和预防

| 错误 | 后果 | 预防 |
|------|------|------|
| 忘记在 `routers.ts` 注册 | 路由不可达 | 创建文件后立即注册 |
| 写操作用了 `publicProcedure` | 无权限控制 | 写/删/计算密集 → `protectedProcedure` |
| Zod schema 缺少 `.min(1)` | 允许空字符串 | 字符串一律加 `.min(1)` |
| 返回错误用 `throw new Error()` | 客户端收到 INTERNAL_SERVER_ERROR | 用 `throw new TRPCError({ code: 'NOT_FOUND' })` |
| 大模块全写一个文件 | 文件过大难维护 | >15 个 procedure 时用子目录+聚合 |

## 示例

### 好的示例 — 清晰的分层和错误处理

```typescript
get: publicProcedure
  .input(z.object({ id: z.number().int().positive() }))
  .query(async ({ input }) => {
    const item = await service.findById(input.id);
    if (!item) throw new TRPCError({ code: 'NOT_FOUND', message: `ID ${input.id} 不存在` });
    return item;
  }),
```

### 坏的示例 — 无校验、无错误处理

```typescript
get: publicProcedure
  .input(z.object({ id: z.any() }))  // z.any() 无校验
  .query(async ({ input }) => {
    return await db.select().from(table).where(eq(table.id, input.id));  // 可能返回空数组
  }),
```

## 大模块聚合模式 (>15 procedures)

```
server/api/database/
├── index.ts         # router({ asset: assetRouter, config: configRouter })
├── _shared.ts       # 统一导出 z, router, publicProcedure
├── asset.router.ts
└── config.router.ts
```

## 涉及文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/api/[feature].router.ts` | **创建** | 路由定义 |
| `server/routers.ts` | **修改** | 注册路由（加一行 import + 一行注册） |
| `server/core/trpc.ts` | 只读参考 | procedure 定义 |
| `shared/[feature]Types.ts` | 可选创建 | 复杂共享类型 |
| `client/src/pages/...` | 可选修改 | 前端调用 |
