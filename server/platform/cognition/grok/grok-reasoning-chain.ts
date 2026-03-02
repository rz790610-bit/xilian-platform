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
import { createModuleLogger } from '../../../core/logger';
import { getDb } from '../../../lib/db';
import { grokReasoningChains } from '../../../../drizzle/schema';
import { eq, sql, desc, count } from 'drizzle-orm';

const log = createModuleLogger('reasoning-chain');

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
    try {
      const db = await getDb();
      if (!db) {
        log.debug('[reasoning-chain] DB unavailable, skipping persist');
        return;
      }

      const rows = result.steps.map(step => ({
        sessionId: result.sessionId,
        stepIndex: step.stepIndex,
        toolName: step.toolName ?? null,
        toolInput: (step.toolInput ?? null) as any,
        toolOutput: (step.toolOutput ?? null) as any,
        reasoning: step.thought ?? null,
        durationMs: step.durationMs,
      }));

      if (rows.length > 0) {
        await db.insert(grokReasoningChains).values(rows);
        log.info({ sessionId: result.sessionId, steps: rows.length }, '[reasoning-chain] Persisted');
      }
    } catch (err) {
      log.warn({ err, sessionId: result.sessionId }, '[reasoning-chain] DB persist failed');
    }
  }

  /**
   * 查询会话的推理链
   */
  async getBySession(sessionId: string): Promise<PersistedReasoningChain[]> {
    try {
      const db = await getDb();
      if (!db) return [];

      const rows = await db.select()
        .from(grokReasoningChains)
        .where(eq(grokReasoningChains.sessionId, sessionId))
        .orderBy(grokReasoningChains.stepIndex);

      return rows.map(r => ({
        id: r.id,
        sessionId: r.sessionId,
        stepIndex: r.stepIndex,
        toolName: r.toolName,
        toolInput: r.toolInput as Record<string, unknown> | null,
        toolOutput: r.toolOutput as Record<string, unknown> | null,
        reasoning: r.reasoning,
        durationMs: r.durationMs,
        createdAt: r.createdAt,
      }));
    } catch (err) {
      log.warn({ err, sessionId }, '[reasoning-chain] DB query failed');
      return [];
    }
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
    try {
      const db = await getDb();
      if (!db) return this.emptyStats();

      const since = new Date(Date.now() - timeRangeHours * 3600 * 1000);

      // 聚合：每个 session 的步数和总时长
      const sessionAgg = await db.select({
        sessionId: grokReasoningChains.sessionId,
        stepCount: count(),
        totalDuration: sql<number>`SUM(${grokReasoningChains.durationMs})`,
      })
        .from(grokReasoningChains)
        .where(sql`${grokReasoningChains.createdAt} >= ${since}`)
        .groupBy(grokReasoningChains.sessionId);

      const totalSessions = sessionAgg.length;
      const avgSteps = totalSessions > 0
        ? sessionAgg.reduce((s, r) => s + r.stepCount, 0) / totalSessions
        : 0;
      const avgDuration = totalSessions > 0
        ? sessionAgg.reduce((s, r) => s + (r.totalDuration ?? 0), 0) / totalSessions
        : 0;

      // 工具使用频率
      const toolAgg = await db.select({
        toolName: grokReasoningChains.toolName,
        cnt: count(),
        avgDur: sql<number>`AVG(${grokReasoningChains.durationMs})`,
      })
        .from(grokReasoningChains)
        .where(sql`${grokReasoningChains.createdAt} >= ${since} AND ${grokReasoningChains.toolName} IS NOT NULL`)
        .groupBy(grokReasoningChains.toolName)
        .orderBy(desc(count()));

      const toolUsageFrequency: Record<string, number> = {};
      const topTools: ReasoningChainStats['topTools'] = [];
      for (const row of toolAgg) {
        if (row.toolName) {
          toolUsageFrequency[row.toolName] = row.cnt;
          topTools.push({ name: row.toolName, count: row.cnt, avgDuration: row.avgDur ?? 0 });
        }
      }

      // 步数分布
      const stepDistribution: Record<number, number> = {};
      for (const s of sessionAgg) {
        const bucket = s.stepCount;
        stepDistribution[bucket] = (stepDistribution[bucket] || 0) + 1;
      }

      return {
        totalSessions,
        avgStepsPerSession: avgSteps,
        avgDurationPerSession: avgDuration,
        toolUsageFrequency,
        topTools: topTools.slice(0, 10),
        stepDistribution,
      };
    } catch (err) {
      log.warn({ err }, '[reasoning-chain] DB stats query failed');
      return this.emptyStats();
    }
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

  private emptyStats(): ReasoningChainStats {
    return {
      totalSessions: 0,
      avgStepsPerSession: 0,
      avgDurationPerSession: 0,
      toolUsageFrequency: {},
      topTools: [],
      stepDistribution: {},
    };
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const reasoningChainManager = new ReasoningChainManager();
