# 数据库设计器融合到 PortAI Nexus 平台 — TODO

## Phase 1: 分析平台现状
- [ ] 梳理平台导航结构（侧边栏菜单）
- [ ] 检查"设计工具 > 数据库工作台"当前页面内容
- [ ] 检查"数据库"菜单下的现有页面
- [ ] 了解平台路由和页面组织方式

## Phase 2: 对比分析
- [ ] 列出 db-designer-proto 中的所有组件
- [ ] 列出已在平台中的组件（避免重复）
- [ ] 确定需要迁移的组件清单

## Phase 3: 融合组件和数据
- [ ] 迁移缺失的组件到平台
- [ ] 迁移 data 层（fields、registry、domains 等）
- [ ] 迁移 hooks（useTableSchema 等）
- [ ] 迁移 lib 工具（ddl-generator 等）

## Phase 4: 更新导航和路由
- [ ] 将设计器页面接入平台路由
- [ ] 更新侧边栏导航
- [ ] 确保页面间跳转正确

## Phase 5: 验证
- [ ] TypeScript 编译通过
- [ ] 页面正常渲染
- [ ] 功能完整性验证

## Phase 6: 提交
- [ ] git commit + push
