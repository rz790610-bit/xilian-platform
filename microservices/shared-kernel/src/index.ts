/**
 * @xilian/shared-kernel
 *
 * 微服务共享内核 — 所有微服务的公共依赖。
 * 包含类型定义、事件契约、配置管理、日志、追踪、指标、健康检查、工具函数。
 */

// 类型定义
export * from './types/index.js';

// 事件契约与 Schema 版本管理
export * from './events/index.js';

// 配置管理
export * from './config/index.js';

// 结构化日志
export * from './logger/index.js';

// 分布式追踪
export * from './tracing/index.js';

// Prometheus 指标
export * from './metrics/index.js';

// 健康检查
export * from './health/index.js';

// 工具函数
export * from './utils/index.js';
