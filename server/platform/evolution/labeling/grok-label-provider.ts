/**
 * ============================================================================
 * GrokLabelProvider — Grok 推理链驱动的智能标注提供者
 * ============================================================================
 *
 * 实现 LabelingProvider 接口，为 AutoLabelingPipeline 提供 AI 标注能力。
 *
 * 架构（三层降级）：
 *   1. GrokReasoningService.diagnose() — 多步推理 + 工具调用（最强）
 *   2. invokeLLM() — Forge API 结构化输出（兜底）
 *   3. 返回 null 让 Pipeline 降级到规则矩阵（最终兜底）
 *
 * 集成点：
 *   - 由 evolution-orchestrator.ts 的 getLabelProvider() 创建
 *   - 通过 AutoLabelingPipeline.registerProvider('grok', provider) 注册
 *   - 遵循 LabelingProvider 接口契约
 */
import { grokReasoningService } from '../../cognition/grok/grok-reasoning.service';
import { invokeLLM, type InvokeResult } from '../../../core/llm';
import { createModuleLogger } from '../../../core/logger';
import type { LabelingProvider, AutoLabel } from '../fsd/auto-labeling-pipeline';
import { evolutionConfig } from '../evolution.config';

const log = createModuleLogger('grok-label-provider');

// ============================================================================
// Prompt 模板
// ============================================================================

function buildLabelingPrompt(trajectory: Record<string, unknown>): string {
  return `你是习联平台进化引擎的自动标注专家。

当前需要标注的干预记录：
- 会话 ID：${trajectory.sessionId || 'unknown'}
- 人工决策：${JSON.stringify(trajectory.humanDecision || {}, null, 2)}
- 影子决策：${JSON.stringify(trajectory.shadowDecision || {}, null, 2)}
- 差异分数：${trajectory.divergenceScore || 0}
- 请求数据：${JSON.stringify(trajectory.requestData || {}, null, 2)}

请分析此干预的根因，并生成标注结果。

返回格式（严格 JSON）：
{
  "interventionReason": "干预原因（中文，≤50字）",
  "rootCause": "根因分析（中文，≤80字）",
  "suggestedFix": "建议修复方案（中文，≤80字）",
  "severity": "low|medium|high|critical",
  "impactScope": ["受影响的模块列表"],
  "relatedKGNodes": ["关联的知识图谱节点"],
  "confidence": 0.85
}

只返回合法 JSON，不要任何解释。`;
}

// ============================================================================
// GrokLabelProvider 实现
// ============================================================================

export class GrokLabelProvider implements LabelingProvider {
  private callCount = 0;
  private successCount = 0;
  private fallbackCount = 0;

  /**
   * 标注单条干预轨迹（LabelingProvider 接口实现）
   *
   * 降级策略：
   *   1. Grok 推理链（diagnose）→ 解析结果
   *   2. invokeLLM（Forge API）→ 解析结果
   *   3. 抛出错误，让 Pipeline 降级到规则矩阵
   */
  async labelIntervention(trajectory: Record<string, unknown>): Promise<{
    label: AutoLabel;
    confidence: number;
  }> {
    this.callCount++;
    const prompt = buildLabelingPrompt(trajectory);

    // ── 第一层：Grok 推理链 ──────────────────────────────────────────────
    try {
      const result = await this.labelWithGrok(trajectory, prompt);
      if (result) {
        this.successCount++;
        log.info(`[GrokLabelProvider] Grok 标注成功, session=${trajectory.sessionId}, confidence=${result.confidence}`);
        return result;
      }
    } catch (grokError: any) {
      log.warn(`[GrokLabelProvider] Grok 推理失败, 降级到 LLM`, {
        session: trajectory.sessionId,
        error: grokError.message,
      });
    }

    // ── 第二层：invokeLLM（Forge API）──────────────────────────────────
    try {
      const result = await this.labelWithLLM(prompt);
      if (result) {
        this.fallbackCount++;
        log.info(`[GrokLabelProvider] LLM 标注成功（降级）, session=${trajectory.sessionId}, confidence=${result.confidence}`);
        return result;
      }
    } catch (llmError: any) {
      log.warn(`[GrokLabelProvider] LLM 也失败`, {
        session: trajectory.sessionId,
        error: llmError.message,
      });
    }

    // ── 第三层：抛出错误，让 Pipeline 降级到规则矩阵 ─────────────────────
    log.warn(`[GrokLabelProvider] 所有 AI 标注失败, 将降级到规则矩阵`, {
      session: trajectory.sessionId,
    });
    throw new Error('GrokLabelProvider: 所有 AI 标注方式均失败');
  }

  // ==========================================================================
  // 第一层：Grok 推理链标注
  // ==========================================================================

  private async labelWithGrok(
    trajectory: Record<string, unknown>,
    prompt: string,
  ): Promise<{ label: AutoLabel; confidence: number } | null> {
    const diagnoseRequest = {
      machineId: `labeling-${trajectory.sessionId || 'unknown'}`,
      query: prompt,
      triggerType: 'manual' as const,
      priority: 'normal' as const,
      additionalContext: {
        type: 'auto_labeling',
        divergenceScore: trajectory.divergenceScore,
        sessionId: trajectory.sessionId,
      },
    };

    const response = await grokReasoningService.diagnose(diagnoseRequest);

    if (response && response.result && response.result.finalOutput) {
      return this.parseGrokResponse(response.result.finalOutput);
    }

    // 尝试从 narrative 中提取
    if (response && response.narrative) {
      return this.parseTextResponse(response.narrative);
    }

    return null;
  }

  // ==========================================================================
  // 第二层：invokeLLM 标注
  // ==========================================================================

  private async labelWithLLM(
    prompt: string,
  ): Promise<{ label: AutoLabel; confidence: number } | null> {
    const result: InvokeResult = await invokeLLM({
      model: evolutionConfig.grok.model,
      messages: [
        {
          role: 'system',
          content: '你是习联平台的自动标注专家。只返回合法 JSON，不要任何解释文字。',
        },
        { role: 'user', content: prompt },
      ],
      maxTokens: evolutionConfig.grok.maxTokens,
    });

    if (!result || !result.choices || result.choices.length === 0) return null;

    const content = result.choices[0].message.content;
    if (typeof content !== 'string') return null;

    return this.parseTextResponse(content);
  }

  // ==========================================================================
  // 响应解析
  // ==========================================================================

  /**
   * 解析 Grok 推理链的 finalOutput（可能是对象或字符串）
   */
  private parseGrokResponse(finalOutput: unknown): { label: AutoLabel; confidence: number } | null {
    // 如果已经是对象
    if (typeof finalOutput === 'object' && finalOutput !== null) {
      const obj = finalOutput as Record<string, unknown>;
      if (obj.interventionReason && obj.rootCause) {
        return this.buildLabelResult(obj);
      }
    }

    // 如果是字符串，尝试解析
    if (typeof finalOutput === 'string') {
      return this.parseTextResponse(finalOutput);
    }

    return null;
  }

  /**
   * 从文本响应中解析标注结果（支持 JSON 和 Markdown 代码块）
   */
  private parseTextResponse(text: string): { label: AutoLabel; confidence: number } | null {
    // 尝试直接 JSON 解析
    try {
      const parsed = JSON.parse(text);
      if (parsed.interventionReason && parsed.rootCause) {
        return this.buildLabelResult(parsed);
      }
    } catch {
      // 非 JSON
    }

    // 从 Markdown 代码块中提取
    const jsonMatch = text.match(/```(?:json)?\n?([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        if (parsed.interventionReason && parsed.rootCause) {
          return this.buildLabelResult(parsed);
        }
      } catch {
        // 解析失败
      }
    }

    // 尝试从文本中提取 JSON 对象
    const objectMatch = text.match(/\{[\s\S]*"interventionReason"[\s\S]*\}/);
    if (objectMatch) {
      try {
        const parsed = JSON.parse(objectMatch[0]);
        return this.buildLabelResult(parsed);
      } catch {
        // 解析失败
      }
    }

    return null;
  }

  /**
   * 从解析后的对象构建标准 LabelResult
   */
  private buildLabelResult(obj: Record<string, unknown>): { label: AutoLabel; confidence: number } {
    const validSeverities = ['low', 'medium', 'high', 'critical'];
    const severity = validSeverities.includes(obj.severity as string)
      ? (obj.severity as AutoLabel['severity'])
      : 'medium';

    const label: AutoLabel = {
      interventionReason: String(obj.interventionReason || '未知原因'),
      rootCause: String(obj.rootCause || '待分析'),
      suggestedFix: String(obj.suggestedFix || '需要人工审查'),
      severity,
      impactScope: Array.isArray(obj.impactScope)
        ? obj.impactScope.map(String)
        : [],
      relatedKGNodes: Array.isArray(obj.relatedKGNodes)
        ? obj.relatedKGNodes.map(String)
        : [],
    };

    const confidence = typeof obj.confidence === 'number'
      ? Math.max(0, Math.min(1, obj.confidence))
      : 0.75;

    return { label, confidence };
  }

  // ==========================================================================
  // 统计
  // ==========================================================================

  getStats(): { callCount: number; successCount: number; fallbackCount: number; successRate: number } {
    return {
      callCount: this.callCount,
      successCount: this.successCount,
      fallbackCount: this.fallbackCount,
      successRate: this.callCount > 0 ? this.successCount / this.callCount : 0,
    };
  }
}
