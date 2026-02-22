/**
 * ============================================================================
 * Grok Tool 注册 — Phase 3 §4.1
 * ============================================================================
 *
 * 将世界模型的 AI 增强点注册为 Grok Tool Calling 可发现的工具：
 *   1. generate_simulation_params — 生成仿真参数
 *   2. explain_physics_violation — 解释物理违规
 *
 * 架构位置：L7 世界模型层 → AI 工具注册子层
 */

import { grokEnhancer } from './grok-enhancer';
import { physicsValidator } from './world-model-enhanced';
import { createModuleLogger } from '../../../core/logger';
import type { StateVector } from './world-model';

const logger = createModuleLogger('grok-tools');

// ============================================================================
// 工具定义
// ============================================================================

export interface GrokToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  executor: string;
  loopStage: 'perception' | 'diagnosis' | 'guardrail' | 'evolution' | 'utility';
  permissions: {
    requiredRoles: string[];
    maxCallsPerMinute: number;
    requiresApproval: boolean;
  };
}

export interface GrokToolInvocation {
  toolName: string;
  input: Record<string, unknown>;
  context: {
    sessionId?: string;
    machineId?: string;
    traceId: string;
  };
}

export interface GrokToolResult {
  output: unknown;
  durationMs: number;
  source: string;
}

// ============================================================================
// 工具注册表
// ============================================================================

const WORLDMODEL_TOOLS: GrokToolDefinition[] = [
  {
    name: 'generate_simulation_params',
    description: '根据设备上下文和场景描述，智能生成仿真参数。支持 what-if 分析、压力测试、退化模拟等场景类型。',
    inputSchema: {
      type: 'object',
      properties: {
        machineId: { type: 'string', description: '设备 ID' },
        scenarioDescription: { type: 'string', description: '场景描述（自然语言）' },
        scenarioType: {
          type: 'string',
          enum: ['what_if', 'stress_test', 'degradation', 'maintenance_window'],
          description: '场景类型',
        },
        currentState: {
          type: 'object',
          description: '当前设备状态向量（可选）',
          additionalProperties: { type: 'number' },
        },
      },
      required: ['machineId', 'scenarioDescription'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        params: { type: 'object', description: '生成的仿真参数', additionalProperties: { type: 'number' } },
        explanation: { type: 'string', description: '参数选择说明' },
        confidence: { type: 'number', description: '置信度 0-1' },
      },
    },
    executor: 'worldmodel.generateSimulationParams',
    loopStage: 'evolution',
    permissions: {
      requiredRoles: ['operator', 'engineer', 'admin'],
      maxCallsPerMinute: 10,
      requiresApproval: false,
    },
  },
  {
    name: 'explain_physics_violation',
    description: '解释物理自洽性校验违规的原因，提供修复建议和可能的根因分析。',
    inputSchema: {
      type: 'object',
      properties: {
        machineId: { type: 'string', description: '设备 ID' },
        violations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: '违规类型' },
              message: { type: 'string', description: '违规描述' },
              severity: { type: 'string', enum: ['warning', 'error'] },
            },
          },
          description: '物理校验违规列表',
        },
        stateVector: {
          type: 'object',
          description: '当前状态向量',
          additionalProperties: { type: 'number' },
        },
      },
      required: ['machineId', 'violations'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        explanation: { type: 'string', description: '违规解释' },
        rootCauses: { type: 'array', items: { type: 'string' }, description: '可能的根因' },
        recommendations: { type: 'array', items: { type: 'string' }, description: '修复建议' },
      },
    },
    executor: 'worldmodel.explainPhysicsViolation',
    loopStage: 'diagnosis',
    permissions: {
      requiredRoles: ['engineer', 'admin'],
      maxCallsPerMinute: 20,
      requiresApproval: false,
    },
  },
];

// ============================================================================
// 工具执行器
// ============================================================================

async function executeGenerateSimulationParams(
  input: Record<string, unknown>,
): Promise<GrokToolResult> {
  const startTime = Date.now();
  const machineId = input.machineId as string;
  const description = input.scenarioDescription as string;

  const result = await grokEnhancer.enhanceSimulationScenario(machineId, {
    description,
    scenarioType: input.scenarioType ?? 'what_if',
    currentState: input.currentState ?? {},
  });

  let params: Record<string, number> | null = null;
  try {
    params = JSON.parse(result.content);
  } catch {
    // 非 JSON，返回原始文本
  }

  return {
    output: {
      params,
      rawContent: params ? undefined : result.content,
      source: result.source,
      tokensUsed: result.tokensUsed,
    },
    durationMs: Date.now() - startTime,
    source: result.source,
  };
}

async function executeExplainPhysicsViolation(
  input: Record<string, unknown>,
): Promise<GrokToolResult> {
  const startTime = Date.now();
  const machineId = input.machineId as string;
  const violations = input.violations as Array<{ type: string; message: string; severity: string }>;

  const result = await grokEnhancer.enhanceAnomalySummary(machineId, {
    violations,
    stateVector: input.stateVector ?? {},
    analysisType: 'physics_violation',
  });

  return {
    output: {
      explanation: result.content,
      source: result.source,
      tokensUsed: result.tokensUsed,
    },
    durationMs: Date.now() - startTime,
    source: result.source,
  };
}

// ============================================================================
// 工具管理器
// ============================================================================

export class WorldModelToolManager {
  private static instance: WorldModelToolManager;
  private tools: Map<string, GrokToolDefinition> = new Map();
  private executors: Map<string, (input: Record<string, unknown>) => Promise<GrokToolResult>> = new Map();

  private constructor() {
    // 注册内置工具
    for (const tool of WORLDMODEL_TOOLS) {
      this.tools.set(tool.name, tool);
    }
    this.executors.set('generate_simulation_params', executeGenerateSimulationParams);
    this.executors.set('explain_physics_violation', executeExplainPhysicsViolation);

    logger.info(`已注册 ${this.tools.size} 个 Grok 工具: ${Array.from(this.tools.keys()).join(', ')}`);
  }

  static getInstance(): WorldModelToolManager {
    if (!WorldModelToolManager.instance) {
      WorldModelToolManager.instance = new WorldModelToolManager();
    }
    return WorldModelToolManager.instance;
  }

  /** 获取所有工具定义（供 toolRegistry.list 使用） */
  getToolDefinitions(): GrokToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** 获取单个工具定义 */
  getToolDefinition(name: string): GrokToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** 调用工具 */
  async invoke(invocation: GrokToolInvocation): Promise<GrokToolResult> {
    const executor = this.executors.get(invocation.toolName);
    if (!executor) {
      throw new Error(`Unknown tool: ${invocation.toolName}`);
    }

    logger.info(`调用工具 ${invocation.toolName} (traceId: ${invocation.context.traceId})`);
    return executor(invocation.input);
  }
}

export const worldModelToolManager = WorldModelToolManager.getInstance();
