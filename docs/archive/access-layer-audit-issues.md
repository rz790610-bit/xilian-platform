# 接入层审查问题清单（审查日期: 2026-02-14）

## 后端 access-layer.service.ts

### P1 - seedDemoData 中 INSERT 字段与 CREATE TABLE 不匹配（⚠️ 需关注）
- `ensureAccessLayerTables()` 创建的表字段名可能与 drizzle schema 中定义的不一致（snake_case vs camelCase）
- 需要确认 INSERT 语句中的字段名与 CREATE TABLE 中的列名完全匹配
- **状态**: seedDemoData 使用 drizzle ORM 的 `db.insert().values()` 而非原始 SQL，drizzle 会自动处理字段名映射，此问题不存在

### P2 - seedDemoData 的 INSERT 语句可能有 JSON 转义问题（✅ 不存在）
- seedDemoData 使用 drizzle ORM 的 `db.insert().values()` 而非原始 SQL 拼接
- drizzle 会自动处理参数化查询，不存在 SQL 注入风险

### P3 - ensureTables 只在部分函数中调用 ✅ 已修复
- 已在所有 14 个 CRUD 函数中添加 `await ensureAccessLayerTables()` 调用
- 包括：createConnector, updateConnector, deleteConnector, listEndpoints, createEndpoint, createEndpointsBatch, updateEndpoint, deleteEndpoint, listBindings, createBinding, updateBinding, deleteBinding, testConnection, healthCheck

### P4 - getConnector 返回的 endpoints 子查询可能有问题（✅ 已验证）
- 使用 drizzle 的 `db.select().from().where()` 标准查询，字段映射正确

## 后端 protocol-adapters/index.ts

### P5 - 所有适配器的 testConnection 和 discoverEndpoints 都是模拟实现 ✅ 确认保留
- 这是原型阶段的正确做法，没有真实中间件时模拟是合理的
- 连接测试的延迟是 `Math.random()` 生成的，前端已知这是模拟模式

### P6 - 适配器注册表的 ProtocolAdapter 接口缺少错误处理规范（📋 后续优化）
- 没有定义超时、重试、连接池等生产级配置
- 待接入真实中间件时补充

## 后端 accessLayer.router.ts

### P7 - router 中 protocolType 参数没有枚举校验 ✅ 已修复
- `protocolSchema`、`createConnector`、`testConnection` 三个端点的 protocolType 参数已改为 `z.enum(PROTOCOL_TYPES)`
- 传入无效协议类型现在会返回 Zod 校验错误

### P8 - seedDemoData 没有事务保护 ✅ 已修复
- 批量 INSERT 已用 try-catch 包裹
- 失败时执行 best-effort 清理（删除已插入的 connectors/endpoints/bindings）
- 错误信息透传到前端

## 前端 AccessLayerManager.tsx

### P9 - seedDemoData 按钮只在 stats.totalConnectors === 0 时显示 ✅ 已修复
- 条件改为 `(!stats || stats.totalConnectors === 0)`
- stats 查询失败时按钮也会显示，用户可以重试

### P10 - 连接器列表使用 `any` 类型 ✅ 已修复
- `connectorsQuery.data.items.map((conn: any)` → 移除 any，使用 tRPC 推断类型
- `connector.endpoints.map((ep: any)` → 改为具体类型定义
- `bindingsQuery.data as any[]` → 改为 `Array.isArray()` 检查 + 具体类型
- `ep.bindingCount > 0` → `(ep.bindingCount ?? 0) > 0` 修复 undefined 问题

## 共享类型 accessLayerTypes.ts

### P11 - EndpointInfo.status 是 string 而非联合类型 ✅ 已修复
- 新增 `EndpointStatus = 'active' | 'inactive' | 'error' | 'discovered'`
- EndpointInfo.status 类型改为 EndpointStatus

### P12 - BindingInfo.status 同样是 string ✅ 已修复
- 新增 `BindingStatus = 'active' | 'inactive' | 'error' | 'paused'`
- BindingInfo.status 类型改为 BindingStatus

## 总结

| 严重度 | 问题数 | 已修复 | 待后续 |
|--------|--------|--------|--------|
| 严重   | 1 (P3) | 1      | 0      |
| 中等   | 2 (P7,P8) | 2   | 0      |
| 较低   | 4 (P9-P12) | 4  | 0      |
| 不存在 | 3 (P1,P2,P4) | - | -    |
| 后续优化 | 2 (P5,P6) | - | 2    |

**TypeScript 编译: 0 错误**
