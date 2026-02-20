# V4.0 全面审计检查清单

## A. 代码错误审计
- [ ] A1. TypeScript 编译错误总数和分布
- [ ] A2. V4.0 新增代码的 TS 错误（三层架构、新页面、Drizzle）
- [ ] A3. import 断链检查（引用不存在的模块/导出）
- [ ] A4. Drizzle schema 与前端 Schema Registry 表名一致性

## B. 数据流审计
- [ ] B1. 前端 Schema Registry → 64张表验证
- [ ] B2. Drizzle Schema → 表数量和字段完整性
- [ ] B3. tRPC Router → 子路由覆盖率
- [ ] B4. 前端 fields → 后端 Drizzle 列名对齐
- [ ] B5. MySQL 实际表 → Drizzle 迁移状态

## C. 模块关系审计
- [ ] C1. 三层架构目录结构完整性（platform/operations/business）
- [ ] C2. 三层架构 service → Drizzle 表引用正确性
- [ ] C3. 导航配置 → 路由 → 页面组件链路
- [ ] C4. 12个新页面 → 导航入口 → 路由注册
- [ ] C5. designer 组件 → data 层 → hooks 依赖链

## D. V4.0 任务完成度
- [ ] D1. 64张MySQL表（11域）
- [ ] D2. 后端三层架构（platform/operations/business）
- [ ] D3. 8大聚合根API
- [ ] D4. 12个新前端页面
- [ ] D5. 导航四区域重组
- [ ] D6. ER关系和拓扑数据对齐
- [ ] D7. 删除10张过度设计表
- [ ] D8. 新增表（plugin_registry等）
