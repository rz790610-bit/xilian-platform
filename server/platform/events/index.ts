// 事件层 — 统一导出
export { EventBus } from './event-bus';
export type { BusEvent, Subscription, DeadLetterEntry, EventBusMetrics } from './event-bus';

export { EventSourcingEngine } from './event-sourcing';
export type { StoredEvent, Snapshot, Projection } from './event-sourcing';

export * from './domain-models';
