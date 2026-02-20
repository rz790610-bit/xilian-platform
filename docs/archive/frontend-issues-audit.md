# 前端问题排查发现

## 问题1: 拓扑图拖拽不流畅

**根因**: `handleMouseMove` 在每次 mousemove 事件时都调用 `setLocalNodes(prev => prev.map(...))`:
- 每次 mousemove 都创建新数组（`prev.map()`），触发 React 重新渲染
- mousemove 事件频率高达 60-120 次/秒
- 没有 requestAnimationFrame 节流
- 每次渲染都重绘整个 SVG（1318行组件）

**修复方案**:
1. 用 `requestAnimationFrame` 节流 mousemove
2. 拖拽时只更新被拖动节点的 transform，不重建整个数组
3. 或者用 `useRef` 存储拖拽位置，只在 mouseup 时 setState

## 问题2: Kafka 等服务显示离线

**根因**: 健康检查逻辑本身是正确的（`kafkaClient.getConnectionStatus()`），但：
- 本地开发环境没有运行 Kafka/Redis/ClickHouse 等服务
- 健康检查返回 `online: false`，拓扑图正确显示为离线
- 这不是 bug，是预期行为 — 本地没有这些服务

**但可以改进**:
- 初始加载时自动执行一次健康检查
- 对于已知不可用的服务，显示"未配置"而非"离线"
- 添加连接配置提示

## 问题3: 接入层管理 404

**根因**: 路由和组件都已正确注册：
- App.tsx 第64行: `import { AccessLayerManager } from './pages/settings/config';`
- 路由: `<Route path="/settings/config/access-layer" component={AccessLayerManager} />`
- 导航: navigation.ts 中已添加入口

**可能原因**:
- 组件导入了不存在的 trpc 路由（`trpc.accessLayer.*`），编译时可能报错
- 需要检查 Vite 编译日志确认是否有 TypeScript 错误
