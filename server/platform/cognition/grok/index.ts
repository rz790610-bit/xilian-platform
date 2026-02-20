/**
 * ============================================================================
 * Grok 认知核心模块 — 统一导出
 * ============================================================================
 */

// 工具定义
export {
  BUILTIN_GROK_TOOLS,
  GROK_TOOL_MAP,
  getToolsByStage,
  toGrokApiToolDef,
  type GrokTool,
  type ToolContext,
} from './grok-tools';

// Tool Calling 引擎
export {
  GrokToolCallingEngine,
  type GrokMessage,
  type GrokToolCall,
  type GrokApiResponse,
  type ReasoningStep,
  type ReasoningResult,
  type ReasoningConfig,
} from './grok-tool-calling';

// 推理链管理
export {
  ReasoningChainManager,
  reasoningChainManager,
  type PersistedReasoningChain,
  type ReasoningChainVisualization,
  type ReasoningChainStats,
} from './grok-reasoning-chain';

// 推理服务
export {
  GrokReasoningService,
  grokReasoningService,
  type DiagnoseRequest,
  type DiagnoseResponse,
  type ServiceConfig,
} from './grok-reasoning.service';
