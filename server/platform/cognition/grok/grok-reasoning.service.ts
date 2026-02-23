/**
 * ============================================================================
 * Grok 推理服务 — 统一入口
 * ============================================================================
 *
 * 整合：
 *   - GrokToolCallingEngine: ReAct 推理循环
 *   - ReasoningChainManager: 推理链持久化 + 可视化
 *   - EventBus: 推理事件发射
 *   - 降级策略: Grok 不可用时降级到规则引擎
 *
 * 使用方式：
 *   const service = GrokReasoningService.getInstance();
 *   const result = await service.diagnose('QC-001', '振动异常', { ... });
 */

import { createModuleLogger } from "../../../core/logger";
import config from "../../../core/config";
const log = createModuleLogger("grok-reasoning");
import { GrokToolCallingEngine, type ReasoningConfig, type ReasoningResult, type ReasoningStep } from './grok-tool-calling';
import { reasoningChainManager } from './grok-reasoning-chain';
import type { ToolContext } from './grok-tools';
const uuidv4 = () => crypto.randomUUID();

// ============================================================================
// 类型定义
// ============================================================================

export interface DiagnoseRequest {
  machineId: string;
  query: string;
  triggerType: 'anomaly' | 'scheduled' | 'manual' | 'chain' | 'drift' | 'guardrail_feedback';
  priority: 'critical' | 'high' | 'normal';
  conditionId?: string;
  additionalContext?: Record<string, unknown>;
  config?: Partial<ReasoningConfig>;
}

export interface DiagnoseResponse {
  sessionId: string;
  result: ReasoningResult;
  report: unknown;
  visualization: ReturnType<typeof reasoningChainManager.generateVisualization>;
  narrative: string;
  fallbackUsed: boolean;
}

export interface ServiceConfig {
  grokApiUrl: string;
  grokApiKey: string;
  defaultModel: string;
  defaultMaxSteps: number;
  defaultTimeoutMs: number;
  enablePersistence: boolean;
  enableEventEmission: boolean;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_SERVICE_CONFIG: ServiceConfig = {
  grokApiUrl: config.xai.apiUrl,
  grokApiKey: config.xai.apiKey,
  defaultModel: 'grok-3',
  defaultMaxSteps: 8,
  defaultTimeoutMs: 60000,
  enablePersistence: true,
  enableEventEmission: true,
};

// ============================================================================
// Grok 推理服务
// ============================================================================

export class GrokReasoningService {
  private static instance: GrokReasoningService | null = null;
  private engine: GrokToolCallingEngine;
  private config: ServiceConfig;
  private activeSessions: Map<string, { startTime: number; machineId: string }> = new Map();

  private constructor(config: Partial<ServiceConfig> = {}) {
    this.config = { ...DEFAULT_SERVICE_CONFIG, ...config };
    this.engine = new GrokToolCallingEngine(
      this.config.grokApiUrl,
      this.config.grokApiKey
    );
  }

  static getInstance(config?: Partial<ServiceConfig>): GrokReasoningService {
    if (!GrokReasoningService.instance) {
      GrokReasoningService.instance = new GrokReasoningService(config);
    }
    return GrokReasoningService.instance;
  }

  /**
   * 核心诊断入口
   */
  async diagnose(request: DiagnoseRequest): Promise<DiagnoseResponse> {
    const sessionId = uuidv4();
    const traceId = uuidv4();

    // 注册活跃会话
    this.activeSessions.set(sessionId, {
      startTime: Date.now(),
      machineId: request.machineId,
    });

    try {
      // 构建工具上下文
      const toolContext: ToolContext = {
        sessionId,
        machineId: request.machineId,
        traceId,
        conditionId: request.conditionId,
      };

      // 构建查询（增强上下文）
      const enhancedQuery = this.buildEnhancedQuery(request);

      // 推理配置
      const reasoningConfig: Partial<ReasoningConfig> = {
        maxSteps: request.config?.maxSteps ?? this.config.defaultMaxSteps,
        timeoutMs: request.config?.timeoutMs ?? this.config.defaultTimeoutMs,
        model: request.config?.model ?? this.config.defaultModel,
        temperature: request.priority === 'critical' ? 0.05 : 0.1,
        ...request.config,
      };

      // 执行推理循环
      const result = await this.engine.reasoningLoop(
        enhancedQuery,
        toolContext,
        reasoningConfig,
        (step) => this.onReasoningStep(sessionId, step)
      );

      // 生成可视化
      const visualization = reasoningChainManager.generateVisualization(result.steps);
      const narrative = reasoningChainManager.generateNarrativeSummary(result.steps);

      // 持久化推理链
      if (this.config.enablePersistence) {
        await reasoningChainManager.persist(result);
      }

      // 发射事件
      if (this.config.enableEventEmission) {
        this.emitDiagnosisEvent(sessionId, request, result);
      }

      return {
        sessionId,
        result,
        report: result.finalOutput,
        visualization,
        narrative,
        fallbackUsed: result.fallbackUsed,
      };
    } finally {
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * 批量诊断（多设备并行）
   */
  async diagnoseBatch(requests: DiagnoseRequest[]): Promise<DiagnoseResponse[]> {
    return Promise.all(requests.map(req => this.diagnose(req)));
  }

  /**
   * 获取活跃会话
   */
  getActiveSessions(): Array<{ sessionId: string; machineId: string; durationMs: number }> {
    const now = Date.now();
    return Array.from(this.activeSessions.entries()).map(([sessionId, info]) => ({
      sessionId,
      machineId: info.machineId,
      durationMs: now - info.startTime,
    }));
  }

  /**
   * 获取引擎统计
   */
  getEngineStats() {
    return this.engine.getStats();
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 构建增强查询（注入上下文信息）
   */
  private buildEnhancedQuery(request: DiagnoseRequest): string {
    const parts: string[] = [];

    parts.push(`设备 ${request.machineId} 诊断请求：`);
    parts.push(`触发类型: ${request.triggerType}`);
    parts.push(`优先级: ${request.priority}`);
    parts.push(`查询: ${request.query}`);

    if (request.conditionId) {
      parts.push(`当前工况: ${request.conditionId}`);
    }

    if (request.additionalContext) {
      parts.push(`附加上下文: ${JSON.stringify(request.additionalContext)}`);
    }

    parts.push('');
    parts.push('请按以下步骤诊断：');
    parts.push('1. 查询设备实时传感器数据');
    parts.push('2. 查询知识图谱获取设备故障模式');
    parts.push('3. 使用物理公式量化风险');
    parts.push('4. 预测设备未来状态');
    parts.push('5. 生成结构化诊断报告');

    return parts.join('\n');
  }

  /**
   * 推理步骤回调
   */
  private onReasoningStep(sessionId: string, step: ReasoningStep): void {
    // 实时日志
    if (step.toolName) {
      log.debug({ sessionId, stepIndex: step.stepIndex, toolName: step.toolName, durationMs: step.durationMs }, 'Reasoning step completed (tool)');
    } else {
      log.debug({ sessionId, stepIndex: step.stepIndex, durationMs: step.durationMs }, 'Reasoning step completed (thought)');
    }
  }

  /**
   * 发射诊断事件
   */
  private emitDiagnosisEvent(
    sessionId: string,
    request: DiagnoseRequest,
    result: ReasoningResult
  ): void {
    // TODO: 通过 ValidatedEventEmitter 发射事件
    // eventBus.emit('diagnosis.report.generated', {
    //   sessionId,
    //   machineId: request.machineId,
    //   report: result.finalOutput,
    //   stepsCount: result.totalSteps,
    //   durationMs: result.totalDurationMs,
    //   fallbackUsed: result.fallbackUsed,
    // });
  }
}

// ============================================================================
// 便捷导出
// ============================================================================

export const grokReasoningService = GrokReasoningService.getInstance();
