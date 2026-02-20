/**
 * ============================================================================
 * 西联平台 v5.0 深度进化 — 统一导出
 * ============================================================================
 *
 * 模块层级：
 *   L0  — contracts     数据契约层
 *   L1  — perception    感知层
 *   L2  — cognition     认知诊断层（含 Grok + 护栏 + 链式认知）
 *   L3  — knowledge     知识层（含服务层）
 *   L4  — evolution     进化层
 *   L5  — tooling       工具层
 *   L6  — pipeline      管线层
 *   L7  — digital-twin  数字孪生
 *   L8  — dashboard     仪表盘
 *   L9  — orchestrator  编排器
 *   L10 — events        事件总线 + 事件溯源 + 领域模型
 *   L11 — config        动态配置引擎
 */

// L0: 数据契约层（命名空间导出，避免与下游模块的同名类型冲突）
export * as contracts from './contracts';

// L1: 感知层
export * as perception from './perception';

// L2: 认知诊断层（命名空间导出，避免 ReasoningConfig/ReasoningResult 等冲突）
export * as worldmodel from './cognition/worldmodel';
export * as diagnosis from './cognition/diagnosis';
export * as grok from './cognition/grok';
export * as safety from './cognition/safety';
export * as chain from './cognition/chain';

// L3: 知识层（含服务层）
export * as knowledge from './knowledge';

// L4: 进化层
export * as evolution from './evolution';

// L5: 工具层
export * as tooling from './tooling';

// L6: 管线层
export * as pipeline from './pipeline';

// L7: 数字孪生
export * as digitalTwin from './digital-twin';

// L8: 仪表盘
export * as dashboard from './dashboard';

// L9: 编排器
export * as orchestrator from './orchestrator';

// L10: 事件层
export * as events from './events';

// L11: 动态配置引擎
export * as config from './config';
