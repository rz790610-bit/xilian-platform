/**
 * ============================================================================
 * 自主认知闭环 — 顶层导出
 * ============================================================================
 *
 * 模块结构：
 *   types/       — 核心类型定义
 *   engines/     — DS 融合引擎、认知状态机、CognitionUnit
 *   events/      — EventBus Topic 定义和事件发布器
 *   narrative/   — NarrativeLayer 叙事生成层
 *   scheduler/   — 认知调度器
 *   knowledge/   — 知识结晶器
 *   dimensions/  — 四维处理器实现（感知/推演/融合/决策）
 *   tools/       — 工具化框架（采集/存储/标注/训练/评估）
 */

// 核心类型
export * from './types';

// 引擎
export * from './engines';

// 事件
export * from './events';

// 叙事
export * from './narrative';

// 调度器
export * from './scheduler';

// 知识
export * from './knowledge';

// 集成
export * from './integration';
