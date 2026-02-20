/**
 * ============================================================================
 * Grok 推理链管理 — 多步推理持久化 + 推理轨迹可视化
 * ============================================================================
 *
 * 职责：
 *   1. 将 ReasoningStep[] 持久化到 grok_reasoning_chains 表
 *   2. 查询历史推理链（按 sessionId）
 *   3. 推理轨迹可视化数据生成（Mermaid 流程图 + 时间线）
 *   4. 推理链统计分析（工具使用频率、平均步数、耗时分布）
 */

import type { ReasoningStep, ReasoningResult } from './grok-tool-calling';

// ============================================================================
// 类型定义
// ============================================================================

export interface PersistedReasoningChain {
  id: number;
  sessionId: string;
  stepIndex: number;
  toolName: string | null;
  toolInput: Record<string, unknown> | null;
  toolOutput: Record<string, unknown> | null;
  reasoning: string | null;
  durationMs: number;
  createdAt: Date;
}

export interface ReasoningChainVisualization {
  mermaidDiagram: string;
  timeline: Array<{
    step: number;
    action: string;
    duration: number;
    status: 'success' | 'error' | 'skip';
  }>;
  summary: {
    totalSteps: number;
    totalDuration: number;
    toolsUsed: string[];
    uniqueToolCount: number;
    avgStepDuration: number;
  };
}

export interface ReasoningChainStats {
  totalSessions: number;
  avgStepsPerSession: number;
  avgDurationPerSession: number;
  toolUsageFrequency: Record<string, number>;
  topTools: Array<{ name: string; count: number; avgDuration: number }>;
  stepDistribution: Record<number, number>;
}

// ============================================================================
// 推理链管理器
// ============================================================================

export class ReasoningChainManager {
  /**
   * 持久化推理结果到数据库
   */
  async persist(result: ReasoningResult): Promise<void> {
    // TODO: 使用 Drizzle ORM 插入 grok_reasoning_chains 表
    for (const step of result.steps) {
      // await db.insert(grokReasoningChains).values({
      //   sessionId: result.sessionId,
      //   stepIndex: step.stepIndex,
      //   toolName: step.toolName ?? 'thought',
      //   toolInput: step.toolInput ?? {},
      //   toolOutput: step.toolOutput ?? {},
      //   reasoning: step.thought,
      //   durationMs: step.durationMs,
      // });
    }
  }

  /**
   * 查询会话的推理链
   */
  async getBySession(sessionId: string): Promise<PersistedReasoningChain[]> {
    // TODO: 从 grok_reasoning_chains 表查询
    return [];
  }

  /**
   * 生成推理链可视化数据
   */
  generateVisualization(steps: ReasoningStep[]): ReasoningChainVisualization {
    // 生成 Mermaid 流程图
    const mermaidLines: string[] = ['graph TD'];
    const timeline: ReasoningChainVisualization['timeline'] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const nodeId = `S${i}`;
      const label = step.toolName
        ? `${step.toolName}\\n(${step.durationMs}ms)`
        : `Thought\\n(${step.durationMs}ms)`;

      if (step.toolName) {
        mermaidLines.push(`  ${nodeId}[/"${label}"/]`);
      } else {
        mermaidLines.push(`  ${nodeId}("${label}")`);
      }

      if (i > 0) {
        mermaidLines.push(`  S${i - 1} --> ${nodeId}`);
      }

      timeline.push({
        step: i,
        action: step.toolName || 'thought',
        duration: step.durationMs,
        status: step.toolOutput ? 'success' : (step.toolName ? 'error' : 'skip'),
      });
    }

    // 统计
    const toolsUsed = steps
      .filter(s => s.toolName)
      .map(s => s.toolName!);
    const uniqueTools = [...new Set(toolsUsed)];
    const totalDuration = steps.reduce((sum, s) => sum + s.durationMs, 0);

    return {
      mermaidDiagram: mermaidLines.join('\n'),
      timeline,
      summary: {
        totalSteps: steps.length,
        totalDuration,
        toolsUsed,
        uniqueToolCount: uniqueTools.length,
        avgStepDuration: steps.length > 0 ? totalDuration / steps.length : 0,
      },
    };
  }

  /**
   * 推理链统计分析（跨多个会话）
   */
  async getStats(timeRangeHours: number = 24): Promise<ReasoningChainStats> {
    // TODO: 从 grok_reasoning_chains 表聚合统计
    return {
      totalSessions: 0,
      avgStepsPerSession: 0,
      avgDurationPerSession: 0,
      toolUsageFrequency: {},
      topTools: [],
      stepDistribution: {},
    };
  }

  /**
   * 生成推理链的自然语言摘要
   */
  generateNarrativeSummary(steps: ReasoningStep[]): string {
    if (steps.length === 0) return '无推理步骤。';

    const parts: string[] = [];
    parts.push(`共执行 ${steps.length} 步推理：`);

    for (const step of steps) {
      if (step.toolName) {
        const inputSummary = step.toolInput
          ? Object.keys(step.toolInput).join(', ')
          : '无参数';
        parts.push(`  Step ${step.stepIndex + 1}: 调用工具 ${step.toolName}(${inputSummary}) → ${step.durationMs}ms`);
      } else if (step.thought) {
        const thoughtPreview = step.thought.length > 100
          ? step.thought.substring(0, 100) + '...'
          : step.thought;
        parts.push(`  Step ${step.stepIndex + 1}: 思考 — "${thoughtPreview}"`);
      }
    }

    const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0);
    parts.push(`总耗时: ${totalMs}ms`);

    return parts.join('\n');
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const reasoningChainManager = new ReasoningChainManager();
