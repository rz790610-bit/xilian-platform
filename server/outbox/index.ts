/**
 * Outbox 模块索引
 * 导出所有 Outbox 相关的服务和路由
 */

// 发布器
export { outboxPublisher, registerProcessor } from './outboxPublisher';
export type { RoutingConfig, OutboxEventInput, EventProcessor } from './outboxPublisher';

// 路由
export { outboxRouter } from './outboxRouter';
export type { OutboxRouter } from './outboxRouter';
