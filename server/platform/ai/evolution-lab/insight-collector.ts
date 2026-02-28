/**
 * ============================================================================
 * 多源洞察收集器 (Insight Collector)
 * ============================================================================
 *
 * 从技术情报、运维反馈、性能数据、飞轮历史等来源收集改进洞察。
 * 洞察是进化实验的起点——每条洞察描述一个可能的改进方向。
 *
 * 数据来源：
 *   1. 技术情报系统（模块 3）— 学术论文/专利中发现的新算法
 *   2. 运维人员反馈 — 一线工程师的经验和问题报告
 *   3. 性能劣化信号 — 算法准确率下降、误报率升高
 *   4. 飞轮历史 — 过往进化周期的模式和经验
 *
 * 架构定位：
 *   InsightCollector → ExperimentDesigner → EvolutionLab
 *   收集阶段          设计阶段              编排阶段
 */

import { createModuleLogger } from '../../../core/logger';
import { invokeLLM } from '../../../core/llm';
import { eventBus } from '../../../services/eventBus.service';
import { AI_INTELLIGENCE_TOPICS } from '../ai.topics';
import { getAIConfig } from '../ai.config';
import type { LabInsight, ExperimentTriggerType, IntelligenceFinding } from '../ai.types';

const log = createModuleLogger('insight-collector');

/**
 * 多源洞察收集器
 *
 * 负责从多个来源汇聚改进洞察，进行去重、优先级排序后供实验设计器使用。
 */
export class InsightCollector {
  /** 内存存储的洞察（按 insightId 去重） */
  private insights: Map<string, LabInsight> = new Map();

  /** 缓存的技术情报发现（来自 EventBus 事件） */
  private pendingFindings: IntelligenceFinding[] = [];

  constructor() {
    this.subscribeToEvents();
  }

  // ==========================================================================
  // 公开方法
  // ==========================================================================

  /**
   * 收集所有来源的洞察
   *
   * 并行调用四个来源，合并结果后去重存储。
   * 使用 Promise.allSettled 确保单个来源失败不影响其他来源。
   *
   * @returns 去重后的洞察列表
   */
  async collectAll(): Promise<LabInsight[]> {
    log.info('开始收集所有来源的洞察...');
    const startTime = Date.now();

    const results = await Promise.allSettled([
      this.fromTechIntelligence(),
      this.fromOperatorFeedback(),
      this.fromPerformanceData(),
      this.fromFlywheelHistory(),
    ]);

    let totalCollected = 0;
    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const insight of result.value) {
          if (!this.insights.has(insight.insightId)) {
            this.insights.set(insight.insightId, insight);
            totalCollected++;
          }
        }
      } else {
        log.warn({ error: String(result.reason) }, '洞察来源收集失败（已降级跳过）');
      }
    }

    log.info(
      { totalCollected, totalStored: this.insights.size, durationMs: Date.now() - startTime },
      '洞察收集完成',
    );

    return this.getInsights();
  }

  /**
   * 从技术情报收集（模块 3 输出）
   *
   * 将 IntelligenceFinding 转换为 LabInsight。
   * 技术情报通过 EventBus 订阅自动缓存到 pendingFindings。
   *
   * @returns 技术情报来源的洞察列表
   */
  async fromTechIntelligence(): Promise<LabInsight[]> {
    const insights: LabInsight[] = [];

    if (this.pendingFindings.length === 0) {
      log.debug('无待处理的技术情报发现');
      return insights;
    }

    for (const finding of this.pendingFindings) {
      const insight: LabInsight = {
        insightId: `insight_intel_${finding.findingId}`,
        source: 'intelligence',
        title: finding.title,
        description: finding.summary,
        priority: this.computeIntelligencePriority(finding),
        metadata: {
          findingId: finding.findingId,
          sourceType: finding.source,
          relevanceScore: finding.relevanceScore,
          techniques: finding.techniques.map(t => t.name),
          applicableEquipment: finding.applicableEquipment,
        },
        createdAt: Date.now(),
      };
      insights.push(insight);
    }

    // 清空已处理的发现
    this.pendingFindings = [];

    log.debug({ count: insights.length }, '从技术情报收集洞察');
    return insights;
  }

  /**
   * 从运维人员反馈收集
   *
   * 查询反馈存储（当前为模拟实现），将运维反馈转换为洞察。
   * 运维反馈通常包含一线工程师发现的具体问题和改进建议。
   *
   * @returns 运维反馈来源的洞察列表
   */
  async fromOperatorFeedback(): Promise<LabInsight[]> {
    const insights: LabInsight[] = [];

    try {
      // 模拟查询反馈存储（未来接入实际 feedback 数据库）
      // TODO: 接入 server/services/feedback.service.ts
      const feedbacks = await this.queryFeedbackStore();

      for (const fb of feedbacks) {
        const insight: LabInsight = {
          insightId: `insight_feedback_${fb.feedbackId}`,
          source: 'feedback',
          title: fb.title,
          description: fb.description,
          priority: fb.urgency === 'high' ? 8 : fb.urgency === 'medium' ? 5 : 3,
          metadata: {
            feedbackId: fb.feedbackId,
            submittedBy: fb.operatorId,
            machineId: fb.machineId,
            category: fb.category,
          },
          createdAt: Date.now(),
        };
        insights.push(insight);
      }
    } catch (err) {
      log.warn({ error: String(err) }, '运维反馈查询失败（降级跳过）');
    }

    log.debug({ count: insights.length }, '从运维反馈收集洞察');
    return insights;
  }

  /**
   * 从性能劣化数据收集
   *
   * 检查算法性能指标，识别准确率下降的算法，
   * 生成对应的改进洞察。
   *
   * @returns 性能劣化来源的洞察列表
   */
  async fromPerformanceData(): Promise<LabInsight[]> {
    const insights: LabInsight[] = [];

    try {
      // 模拟查询性能数据（未来接入 ClickHouse 性能指标表）
      // TODO: 接入 server/lib/clients/clickhouse.client.ts
      const perfMetrics = await this.queryPerformanceMetrics();

      for (const metric of perfMetrics) {
        if (metric.trend === 'declining' && metric.declinePercent > 3) {
          const insight: LabInsight = {
            insightId: `insight_perf_${metric.algorithmId}_${Date.now()}`,
            source: 'performance',
            title: `算法 ${metric.algorithmName} 性能下降 ${metric.declinePercent.toFixed(1)}%`,
            description: `${metric.algorithmName} 在过去 ${metric.windowDays} 天内准确率从 ${metric.previousAccuracy.toFixed(1)}% 下降至 ${metric.currentAccuracy.toFixed(1)}%，需要排查原因并优化。`,
            priority: metric.declinePercent > 10 ? 9 : metric.declinePercent > 5 ? 7 : 4,
            metadata: {
              algorithmId: metric.algorithmId,
              algorithmName: metric.algorithmName,
              previousAccuracy: metric.previousAccuracy,
              currentAccuracy: metric.currentAccuracy,
              declinePercent: metric.declinePercent,
              windowDays: metric.windowDays,
            },
            createdAt: Date.now(),
          };
          insights.push(insight);
        }
      }
    } catch (err) {
      log.warn({ error: String(err) }, '性能数据查询失败（降级跳过）');
    }

    log.debug({ count: insights.length }, '从性能数据收集洞察');
    return insights;
  }

  /**
   * 从飞轮历史收集
   *
   * 检查过往进化周期的模式，识别反复出现的问题，
   * 生成对应的系统性改进洞察。
   *
   * @returns 飞轮历史来源的洞察列表
   */
  async fromFlywheelHistory(): Promise<LabInsight[]> {
    const insights: LabInsight[] = [];

    try {
      // 模拟查询飞轮历史（未来接入 evolution flywheel 日志）
      // TODO: 接入 server/platform/evolution/flywheel/evolution-flywheel.ts
      const history = await this.queryFlywheelHistory();

      for (const entry of history) {
        if (entry.recurringIssue && entry.occurrenceCount >= 3) {
          const insight: LabInsight = {
            insightId: `insight_flywheel_${entry.issueId}`,
            source: 'scheduled',
            title: `飞轮周期反复出现: ${entry.issueName}`,
            description: `问题 "${entry.issueName}" 在过去 ${entry.occurrenceCount} 个进化周期中反复出现，建议进行系统性根因分析和针对性优化。`,
            priority: Math.min(10, entry.occurrenceCount + 3),
            metadata: {
              issueId: entry.issueId,
              issueName: entry.issueName,
              occurrenceCount: entry.occurrenceCount,
              affectedAlgorithms: entry.affectedAlgorithms,
              lastOccurrence: entry.lastOccurrence,
            },
            createdAt: Date.now(),
          };
          insights.push(insight);
        }
      }
    } catch (err) {
      log.warn({ error: String(err) }, '飞轮历史查询失败（降级跳过）');
    }

    log.debug({ count: insights.length }, '从飞轮历史收集洞察');
    return insights;
  }

  /**
   * 优先级排序
   *
   * 先尝试使用 LLM 进行智能排序（考虑影响范围、紧急程度、可行性），
   * 失败时降级为基于 priority 字段的规则排序。
   *
   * @param insights 待排序的洞察列表
   * @returns 按优先级降序排列的洞察列表
   */
  async prioritize(insights: LabInsight[]): Promise<LabInsight[]> {
    if (insights.length <= 1) return insights;

    try {
      const config = getAIConfig();
      const insightSummaries = insights.map(i => ({
        id: i.insightId,
        title: i.title,
        source: i.source,
        priority: i.priority,
        description: i.description.substring(0, 100),
      }));

      const result = await invokeLLM({
        messages: [
          {
            role: 'system',
            content: `你是港机设备智能运维平台的进化实验优先级排序专家。
请根据以下维度对洞察进行排序：
1. 安全影响（最高权重）— 是否涉及设备安全
2. 性能影响 — 能带来多大的准确率/效率提升
3. 实施可行性 — 技术难度和资源需求
4. 紧急程度 — 是否有时效性

只返回 JSON 数组，包含按优先级降序排列的 insightId。格式：["id1", "id2", ...]`,
          },
          {
            role: 'user',
            content: `以下洞察需要排序：\n${JSON.stringify(insightSummaries, null, 2)}`,
          },
        ],
        model: config.lab.prioritizationModel,
        maxTokens: 500,
      });

      const content = result.choices?.[0]?.message?.content;
      if (content && typeof content === 'string') {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const orderedIds = JSON.parse(jsonMatch[0]) as string[];
          const insightMap = new Map(insights.map(i => [i.insightId, i]));
          const sorted: LabInsight[] = [];

          for (const id of orderedIds) {
            const insight = insightMap.get(id);
            if (insight) {
              sorted.push(insight);
              insightMap.delete(id);
            }
          }
          // 追加 LLM 未提及的洞察
          for (const remaining of insightMap.values()) {
            sorted.push(remaining);
          }

          log.debug({ count: sorted.length }, 'LLM 优先级排序完成');
          return sorted;
        }
      }
    } catch (err) {
      log.warn({ error: String(err) }, 'LLM 优先级排序失败，降级为规则排序');
    }

    // 降级：按 priority 字段降序排列
    return [...insights].sort((a, b) => b.priority - a.priority);
  }

  /**
   * 手动提交洞察
   *
   * 允许运维人员或系统管理员直接提交改进洞察。
   *
   * @param insight 洞察内容（不含 insightId 和 createdAt，由系统生成）
   * @returns 完整的洞察对象
   */
  submit(insight: Omit<LabInsight, 'insightId' | 'createdAt'>): LabInsight {
    const fullInsight: LabInsight = {
      ...insight,
      insightId: `insight_manual_${crypto.randomUUID()}`,
      createdAt: Date.now(),
    };

    this.insights.set(fullInsight.insightId, fullInsight);
    log.info({ insightId: fullInsight.insightId, title: fullInsight.title }, '手动提交洞察');
    return fullInsight;
  }

  /**
   * 获取已收集的所有洞察
   *
   * @returns 洞察列表的副本
   */
  getInsights(): LabInsight[] {
    return Array.from(this.insights.values());
  }

  /**
   * 按来源类型获取洞察
   *
   * @param source 来源类型
   * @returns 指定来源的洞察列表
   */
  getInsightsBySource(source: ExperimentTriggerType): LabInsight[] {
    return this.getInsights().filter(i => i.source === source);
  }

  /**
   * 清除所有洞察
   */
  clear(): void {
    this.insights.clear();
    this.pendingFindings = [];
    log.debug('洞察存储已清空');
  }

  // ==========================================================================
  // 私有方法
  // ==========================================================================

  /**
   * 订阅 EventBus 事件
   *
   * 监听技术情报扫描完成事件，自动缓存新发现。
   */
  private subscribeToEvents(): void {
    try {
      eventBus.subscribe(AI_INTELLIGENCE_TOPICS.SCAN_COMPLETED, (event) => {
        const findings = (event.payload as Record<string, unknown>)?.findings;
        if (Array.isArray(findings)) {
          this.pendingFindings.push(...(findings as IntelligenceFinding[]));
          log.debug({ count: findings.length }, '收到技术情报扫描完成事件，缓存新发现');
        }
      });
      log.debug('已订阅技术情报扫描完成事件');
    } catch (err) {
      log.warn({ error: String(err) }, '订阅事件失败（不影响手动收集）');
    }
  }

  /**
   * 计算技术情报洞察优先级
   *
   * 基于相关性评分和技术数量综合计算。
   */
  private computeIntelligencePriority(finding: IntelligenceFinding): number {
    const relevanceWeight = finding.relevanceScore * 7;
    const techniqueBonus = Math.min(finding.techniques.length * 0.5, 2);
    const equipmentBonus = finding.applicableEquipment.length > 0 ? 1 : 0;
    return Math.min(10, Math.round(relevanceWeight + techniqueBonus + equipmentBonus));
  }

  /**
   * 查询反馈存储（模拟实现）
   *
   * 未来接入实际反馈数据库后替换此方法。
   */
  private async queryFeedbackStore(): Promise<Array<{
    feedbackId: string;
    title: string;
    description: string;
    operatorId: string;
    machineId: string;
    category: string;
    urgency: 'high' | 'medium' | 'low';
  }>> {
    // 模拟实现：返回空数组，未来从数据库查询
    return [];
  }

  /**
   * 查询性能指标（模拟实现）
   *
   * 未来接入 ClickHouse 性能指标表后替换此方法。
   */
  private async queryPerformanceMetrics(): Promise<Array<{
    algorithmId: string;
    algorithmName: string;
    currentAccuracy: number;
    previousAccuracy: number;
    declinePercent: number;
    trend: 'improving' | 'stable' | 'declining';
    windowDays: number;
  }>> {
    // 模拟实现：返回空数组，未来从 ClickHouse 查询
    return [];
  }

  /**
   * 查询飞轮历史（模拟实现）
   *
   * 未来接入飞轮历史日志后替换此方法。
   */
  private async queryFlywheelHistory(): Promise<Array<{
    issueId: string;
    issueName: string;
    recurringIssue: boolean;
    occurrenceCount: number;
    affectedAlgorithms: string[];
    lastOccurrence: number;
  }>> {
    // 模拟实现：返回空数组，未来从飞轮日志查询
    return [];
  }
}
