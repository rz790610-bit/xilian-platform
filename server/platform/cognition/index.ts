/**
 * ============================================================================
 * 自主认知闭环 — 顶层导出
 * ============================================================================
 *
 * 模块结构：
 *   types/        — 核心类型定义
 *   engines/      — DS 融合引擎、认知状态机、CognitionUnit、TAS、MetaLearner
 *   events/       — EventBus Topic 定义和事件发布器
 *   narrative/    — NarrativeLayer 叙事生成层
 *   scheduler/    — 认知调度器
 *   knowledge/    — 知识结晶器
 *   dimensions/   — 四维处理器实现（感知/推演/融合/决策）
 *   shadow-eval/  — 影子评估器统一版
 *   champion/     — Champion-Challenger 挑战赛
 *   canary/       — 金丝雀发布控制器
 *   integration/  — 流水线认知嵌入点
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

// 四维处理器
export * from './dimensions';

// 影子评估
export * from './shadow-eval';

// Champion-Challenger
export * from './champion';

// 金丝雀发布
export * from './canary';

// 集成
export * from './integration';

// ============================================================================
// v5.0 进化模块（命名空间导出，避免与 types/dimensions 的同名类型冲突）
// ============================================================================
// Grok 深度嵌入
export * as grokModule from './grok';
// WorldModel 世界模型
export * as worldmodelModule from './worldmodel';
// 融合诊断
export * as diagnosisModule from './diagnosis';
// 安全护栏
export * as safetyModule from './safety';
// 链式认知
export * as chainModule from './chain';
// 认知会话服务
export * as servicesModule from './services';
