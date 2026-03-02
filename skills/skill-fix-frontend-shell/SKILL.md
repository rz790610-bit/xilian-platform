# Skill: 修复前端空壳页面

## 触发条件

- 用户要求"完善/填充/修复某个前端页面"
- 用户提到某页面"只有占位符" / "功能开发中"
- 页面使用了 `PlaceholderPage` 组件或 `Construction` 图标
- 页面代码少于 100 行且无 tRPC 调用

## 前置检查

1. **确认页面位置** — `client/src/pages/[module]/[Page].tsx`
2. **确认对应 API** — 后端是否有 tRPC 路由可调用；若无，先用 skill-add-trpc-route
3. **确认导航配置** — `client/src/config/navigation.ts` 是否已有该页面入口
4. **确认路由注册** — `client/src/App.tsx` 是否已有 Route 定义
5. **确认 UI 组件** — `client/src/components/ui/` 中可用的 shadcn/ui 组件

## 标准步骤

### Step 1: 分析现有空壳页面

```bash
# 确认当前状态
cat client/src/pages/[module]/[Page].tsx | wc -l  # 如果 <100 行 → 空壳
grep -l "PlaceholderPage\|功能开发中\|Construction" client/src/pages/**/*.tsx
```

### Step 2: 搭建页面骨架

**标准结构**（所有完整页面统一模式）：

```tsx
import { useState, useCallback } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import { Plus, Search, RefreshCw } from 'lucide-react';

export default function MyPage() {
  const toast = useToast();

  // ━━━ 1. 本地状态 ━━━
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // ━━━ 2. tRPC 查询 ━━━
  const listQuery = trpc.feature.list.useQuery(
    { page, pageSize, search: searchQuery || undefined },
    { placeholderData: keepPreviousData }
  );

  // ━━━ 3. tRPC 修改 ━━━
  const createMutation = trpc.feature.create.useMutation({
    onSuccess: () => { toast.success('创建成功'); listQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  // ━━━ 4. 派生数据 ━━━
  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // ━━━ 5. 渲染 ━━━
  return (
    <MainLayout title="页面标题">
      <div className="animate-fade-up space-y-6">
        {/* 标题+操作栏 */}
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold mb-2">页面标题</h2>
            <p className="text-muted-foreground">页面描述</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => listQuery.refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />刷新
            </Button>
            <Button><Plus className="w-4 h-4 mr-2" />新建</Button>
          </div>
        </div>

        {/* 统计卡片 (可选) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard value={total} label="总数" icon="📊" />
        </div>

        {/* 搜索+过滤 */}
        <PageCard>
          <div className="flex gap-3 mb-4">
            <Input
              placeholder="搜索..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="flex-1"
            />
          </div>

          {/* 数据列表 */}
          {listQuery.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">加载中...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">暂无数据</div>
          ) : (
            <div className="space-y-2">
              {items.map((item: any) => (
                <div key={item.id} className="flex justify-between items-center p-3 border rounded hover:bg-muted/50">
                  <div>
                    <div className="font-semibold text-sm">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.description}</div>
                  </div>
                  <Badge>{item.status}</Badge>
                </div>
              ))}
            </div>
          )}

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="mt-4 flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                第 {page} 页，共 {totalPages} 页 (总计 {total} 条)
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}>上一页</Button>
                <Button size="sm" variant="outline" disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}>下一页</Button>
              </div>
            </div>
          )}
        </PageCard>
      </div>
    </MainLayout>
  );
}
```

### Step 3: 确认导航和路由

**检查 `client/src/App.tsx`**：
```tsx
<Route path="/feature/list" component={MyPage} />
```

**检查 `client/src/config/navigation.ts`**：
```typescript
{ id: 'feature', label: '功能名', icon: '📦', path: '/feature/list' }
```

### Step 4: 验证

```bash
pnpm check          # TypeScript 编译通过
pnpm dev             # 页面可正常访问和交互
```

## 必须满足的验收标准

- [ ] 使用 `<MainLayout>` 包装
- [ ] 有 tRPC `useQuery` 数据获取
- [ ] 有加载状态（"加载中..."）
- [ ] 有空数据状态（"暂无数据"）
- [ ] 有 `useMutation` + `onSuccess` 刷新 + `onError` toast（如有写操作）
- [ ] 搜索/过滤重置页码到 1
- [ ] 分页功能正常
- [ ] 路由在 `App.tsx` 注册
- [ ] 导航在 `navigation.ts` 配置
- [ ] `pnpm check` 通过

## 常见错误和预防

| 错误 | 后果 | 预防 |
|------|------|------|
| 不用 `MainLayout` 包装 | 页面无侧边栏和顶栏 | 所有页面必须用 MainLayout |
| 不处理 `isLoading` | 页面闪烁 | 必须有加载状态 UI |
| 搜索时不重置 `page` | 翻到第 5 页搜索后看不到结果 | `setSearchQuery` 同时 `setPage(1)` |
| mutation 不 refetch | 创建后列表不更新 | `onSuccess` 中调用 `query.refetch()` |
| 忘记 `keepPreviousData` | 翻页时列表闪空 | `useQuery` 选项加 `placeholderData: keepPreviousData` |
| 使用 `any` 类型 | 类型安全丧失 | tRPC 自动推导类型，不需要手动标注 |

## 示例

### 好的示例 — 完整的数据流

```tsx
const listQuery = trpc.feature.list.useQuery(
  { page, search: searchQuery || undefined },
  { placeholderData: keepPreviousData }
);
const createMutation = trpc.feature.create.useMutation({
  onSuccess: () => { toast.success('成功'); listQuery.refetch(); },
  onError: (err) => toast.error(err.message),
});
```

### 坏的示例 — 不完整的数据流

```tsx
const [data, setData] = useState([]);
useEffect(() => {
  fetch('/api/feature/list').then(r => r.json()).then(setData);  // 绕过 tRPC!
}, []);
```

## 涉及文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `client/src/pages/[module]/[Page].tsx` | **修改** | 填充页面逻辑 |
| `client/src/App.tsx` | 检查 | 确认路由已注册 |
| `client/src/config/navigation.ts` | 检查/修改 | 确认导航已配置 |
| `client/src/components/ui/` | 只读参考 | shadcn/ui 组件 |
| `client/src/components/common/` | 只读参考 | PageCard, StatCard, Toast |
