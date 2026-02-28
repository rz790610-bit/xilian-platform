/**
 * ============================================================================
 * 技术情报系统 (TechIntelligence)
 * ============================================================================
 *
 * 持续监测外部技术源，进行差距分析，提出改进建议。
 * 保持平台算法与前沿研究同步，驱动进化实验室的改进实验。
 *
 * 核心流程（完整扫描周期）：
 *   1. 扫描所有配置的技术来源（论文、标准、专利等）
 *   2. 按相关性过滤文档
 *   3. 从相关文档中提取前沿技术方法
 *   4. 分析当前平台算法与前沿的差距
 *   5. 生成评分后的差距报告和候选算法
 *   6. 发布事件通知（EventBus）
 *   7. 可选：自动推送到进化实验室触发改进实验
 *
 * 架构位置：
 *   - 上游：外部技术源（arXiv、IEEE、ISO 标准库、专利库）
 *   - 下游：进化实验室 (EvolutionLab)、编排器 (Orchestrator)
 *   - 事件：通过 EventBus 发布扫描结果和差距发现
 *
 * 设计原则：
 *   - 单例 + 工厂模式（getTechIntelligence / resetTechIntelligence）
 *   - LLM 优先，规则兜底
 *   - 降级不崩溃：任何环节失败不阻塞整体流程
 *   - 物理约束优先：推荐的改进方案必须适用于港机物理场景
 */

import crypto from 'node:crypto';
import { createModuleLogger } from '../../../core/logger';
import { invokeLLM } from '../../../core/llm';
import { eventBus } from '../../../services/eventBus.service';
import { agentRegistry, type AgentContext } from '../../../core/agent-registry';
import { getAIConfig } from '../ai.config';
import { AI_INTELLIGENCE_TOPICS } from '../ai.topics';
import { TechSourceScanner } from './tech-source-scanner';
import { TechGapAnalyzer } from './tech-gap-analyzer';
import type {
  TechSource,
  IntelligenceReport,
  TopicSearchResult,
  DocumentAnalysis,
  TechGapReport,
  AlgorithmCandidate,
  ScannedDocument,
  TechGap,
  IntelligenceFinding,
  ExtractedTechnique,
  ScoredGap,
} from '../ai.types';

const log = createModuleLogger('tech-intelligence');

// ============================================================================
// 默认技术来源配置
// ============================================================================

/** 默认技术来源配置 — 覆盖港机运维核心关注领域 */
const DEFAULT_TECH_SOURCES: TechSource[] = [
  {
    type: 'arxiv',
    name: 'arXiv 机械故障诊断',
    searchQueries: [
      'mechanical fault diagnosis',
      'bearing fault detection',
      'vibration analysis deep learning',
    ],
    priority: 1,
    enabled: true,
  },
  {
    type: 'ieee',
    name: 'IEEE 港机设备',
    searchQueries: [
      'port crane monitoring',
      'container crane predictive maintenance',
    ],
    priority: 2,
    enabled: true,
  },
  {
    type: 'standard',
    name: '国际标准',
    searchQueries: [
      'ISO 10816 vibration',
      'ISO 13373 condition monitoring',
    ],
    priority: 3,
    enabled: true,
  },
  {
    type: 'patent',
    name: '专利库',
    searchQueries: [
      'crane fault diagnosis patent',
      'industrial IoT predictive maintenance',
    ],
    priority: 4,
    enabled: true,
  },
];

// ============================================================================
// TechIntelligence 核心类
// ============================================================================

/**
 * 技术情报系统
 *
 * 整合技术来源扫描器和差距分析器，提供完整的技术情报生命周期管理：
 * 扫描 → 过滤 → 提取 → 分析 → 推荐 → 发布。
 */
export class TechIntelligence {
  /** 技术来源扫描器 */
  private scanner: TechSourceScanner;
  /** 技术差距分析器 */
  private gapAnalyzer: TechGapAnalyzer;
  /** 扫描历史记录（内存中，最多保留 20 条） */
  private scanHistory: IntelligenceReport[] = [];
  /** 最大扫描历史条数 */
  private static readonly MAX_HISTORY = 20;

  constructor() {
    this.scanner = new TechSourceScanner();
    this.gapAnalyzer = new TechGapAnalyzer();
    this.registerAgent();
  }

  // ==========================================================================
  // 公开方法
  // ==========================================================================

  /**
   * 执行完整扫描周期
   *
   * 这是技术情报系统的核心方法。按以下步骤执行：
   *   1. 扫描所有已启用的技术来源
   *   2. 按相关性过滤文档
   *   3. 从相关文档中提取前沿技术
   *   4. 分析与当前平台算法的差距
   *   5. 评分改进潜力并生成候选算法
   *   6. 构建情报报告
   *   7. 发布事件通知
   *   8. 可选：自动推送到进化实验室
   *
   * @returns 完整的情报扫描报告
   */
  async runScanCycle(): Promise<IntelligenceReport> {
    const startTime = Date.now();
    const reportId = crypto.randomUUID();
    log.info({ reportId }, '开始技术情报扫描周期');

    const config = getAIConfig().intelligence;

    // 步骤 1: 扫描所有技术来源
    let scannedDocs: ScannedDocument[] = [];
    try {
      scannedDocs = await this.scanner.scan(DEFAULT_TECH_SOURCES);
    } catch (err) {
      log.error({ err: (err as Error).message }, '技术来源扫描失败');
    }

    // 步骤 2: 按相关性过滤
    let relevantDocs = scannedDocs;
    try {
      const filtered = await this.scanner.filterByRelevance(scannedDocs);
      relevantDocs = filtered;
    } catch (err) {
      log.warn({ err: (err as Error).message }, '相关性过滤失败，使用全部文档');
    }

    // 步骤 3: 提取技术方法
    const allTechniques: ExtractedTechnique[] = [];
    const findings: IntelligenceFinding[] = [];

    for (const doc of relevantDocs) {
      try {
        const techniques = await this.scanner.extractTechniques(doc);
        allTechniques.push(...techniques);
        findings.push(this.buildFinding(doc, techniques));
      } catch (err) {
        log.warn(
          { title: doc.title, err: (err as Error).message },
          '技术提取失败，跳过该文档'
        );
      }
    }

    // 步骤 4: 分析技术差距
    const currentAlgorithms = this.gapAnalyzer.getCurrentAlgorithms();
    let gaps: TechGap[] = [];
    try {
      gaps = await this.gapAnalyzer.analyzeGaps(allTechniques, currentAlgorithms);
    } catch (err) {
      log.warn({ err: (err as Error).message }, '差距分析失败');
    }

    // 步骤 5: 评分并生成候选
    let scoredGaps: ScoredGap[] = [];
    let candidates: AlgorithmCandidate[] = [];
    try {
      scoredGaps = await this.gapAnalyzer.scoreImprovementPotential(gaps);
      candidates = await this.gapAnalyzer.suggestCandidates(scoredGaps);
    } catch (err) {
      log.warn({ err: (err as Error).message }, '评分或候选生成失败');
    }

    // 步骤 6: 构建报告
    const durationMs = Date.now() - startTime;
    const report: IntelligenceReport = {
      reportId,
      scanDate: Date.now(),
      sourcesScanned: DEFAULT_TECH_SOURCES.filter(s => s.enabled).length,
      documentsFound: scannedDocs.length,
      relevantDocuments: relevantDocs.length,
      findings,
      gaps,
      candidates,
      durationMs,
    };

    // 保存到历史
    this.scanHistory.push(report);
    if (this.scanHistory.length > TechIntelligence.MAX_HISTORY) {
      this.scanHistory.shift();
    }

    // 步骤 7: 发布事件
    this.publishEvents(report, scoredGaps, candidates);

    // 步骤 8: 自动推送到进化实验室
    if (config.autoPushToLab && candidates.length > 0) {
      this.pushToEvolutionLab(candidates, gaps);
    }

    log.info(
      {
        reportId,
        durationMs,
        docsFound: scannedDocs.length,
        relevant: relevantDocs.length,
        techniques: allTechniques.length,
        gaps: gaps.length,
        candidates: candidates.length,
      },
      '技术情报扫描周期完成'
    );

    return report;
  }

  /**
   * 手动查询特定主题
   *
   * 基于用户输入的查询词创建临时技术来源，
   * 执行扫描 → 过滤 → 提取流程。
   *
   * @param query - 查询关键词
   * @returns 主题搜索结果
   */
  async searchTopic(query: string): Promise<TopicSearchResult> {
    log.info({ query }, '执行主题查询');

    const adHocSource: TechSource = {
      type: 'arxiv',
      name: `临时查询: ${query}`,
      searchQueries: [query],
      priority: 1,
      enabled: true,
    };

    let docs: ScannedDocument[] = [];
    try {
      docs = await this.scanner.scan([adHocSource]);
    } catch (err) {
      log.warn({ query, err: (err as Error).message }, '主题查询扫描失败');
    }

    let relevantDocs = docs;
    try {
      const filtered = await this.scanner.filterByRelevance(docs);
      relevantDocs = filtered.length > 0 ? filtered : docs;
    } catch (err) {
      log.warn({ query, err: (err as Error).message }, '主题查询过滤失败');
    }

    const techniques: ExtractedTechnique[] = [];
    for (const doc of relevantDocs) {
      try {
        const extracted = await this.scanner.extractTechniques(doc);
        techniques.push(...extracted);
      } catch (err) {
        log.warn({ title: doc.title }, '主题查询技术提取失败');
      }
    }

    const result: TopicSearchResult = {
      query,
      documents: relevantDocs.map(doc => ({
        ...doc,
        relevanceScore: 'relevanceScore' in doc
          ? (doc as { relevanceScore: number }).relevanceScore
          : 0.5,
        summary: 'summary' in doc
          ? (doc as { summary: string }).summary
          : doc.abstract ?? doc.title,
        applicableEquipment: 'applicableEquipment' in doc
          ? (doc as { applicableEquipment: string[] }).applicableEquipment
          : [],
      })),
      techniques,
      timestamp: Date.now(),
    };

    log.info(
      { query, docs: result.documents.length, techniques: result.techniques.length },
      '主题查询完成'
    );
    return result;
  }

  /**
   * 分析特定文档的适用性
   *
   * 使用 LLM 深度分析单篇文档在港机运维场景的适用性，
   * 包括相关性评分、技术提取、应用建议和局限性。
   *
   * @param document - 待分析的文档
   * @returns 文档分析结果
   */
  async analyzeDocument(document: ScannedDocument): Promise<DocumentAnalysis> {
    log.info({ title: document.title }, '分析文档适用性');

    const config = getAIConfig().intelligence;

    // 提取技术
    let techniques: ExtractedTechnique[] = [];
    try {
      techniques = await this.scanner.extractTechniques(document);
    } catch (err) {
      log.warn({ title: document.title, err: (err as Error).message }, '文档技术提取失败');
    }

    // 使用 LLM 进行深度分析
    let relevanceScore = 0.5;
    let applicability = '待评估';
    let limitations: string[] = [];

    try {
      const prompt = `你是港机设备技术评审专家。请深度分析以下技术文档在港机智能运维场景的适用性。

文档标题: ${document.title}
文档摘要: ${document.abstract ?? '无摘要'}
来源类型: ${document.sourceType}
提取到的技术: ${techniques.map(t => t.name).join(', ') || '无'}

请以 JSON 格式返回分析结果：
{
  "relevanceScore": 0.0~1.0,
  "applicability": "适用性分析（中文，200字以内）",
  "limitations": ["局限性1", "局限性2", ...],
  "integrationDifficulty": "集成难度说明"
}

分析维度：
1. 技术方法是否适用于港机设备的振动/温度/电流等信号特征
2. 数据需求是否可在港机场景满足
3. 实时性要求是否与港机监控频率匹配
4. 模型复杂度是否与边缘计算资源兼容`;

      const result = await invokeLLM({
        messages: [
          { role: 'system', content: '你是港机设备技术评审专家。请严格以 JSON 格式返回分析结果。' },
          { role: 'user', content: prompt },
        ],
        model: config.analysisModel,
        maxTokens: 800,
      });

      const content = typeof result.choices[0]?.message?.content === 'string'
        ? result.choices[0].message.content
        : '';

      const parsed = JSON.parse(this.extractJson(content));
      relevanceScore = typeof parsed.relevanceScore === 'number'
        ? Math.min(1, Math.max(0, parsed.relevanceScore))
        : 0.5;
      applicability = String(parsed.applicability ?? '待评估');
      limitations = Array.isArray(parsed.limitations)
        ? (parsed.limitations as unknown[]).map(String)
        : [];
    } catch (err) {
      log.warn(
        { title: document.title, err: (err as Error).message },
        'LLM 文档分析失败，使用默认评估'
      );
      applicability = '（LLM 分析不可用，需人工评审）';
      limitations = ['自动分析不可用，建议人工评审'];
    }

    return {
      document,
      relevanceScore,
      techniques,
      applicability,
      limitations,
    };
  }

  /**
   * 生成技术差距报告
   *
   * 执行或复用最近一次扫描结果，生成综合的差距分析报告，
   * 包括评分后的差距列表和改进路线图。
   *
   * @param focus - 可选的关注领域过滤（如 ['vibration', 'bearing']）
   * @returns 技术差距报告
   */
  async generateGapReport(focus?: string[]): Promise<TechGapReport> {
    log.info({ focus }, '开始生成技术差距报告');

    // 执行扫描周期获取最新数据
    const scanReport = await this.runScanCycle();

    // 如果有关注领域过滤，只保留相关差距
    let gaps = scanReport.gaps;
    if (focus && focus.length > 0) {
      gaps = gaps.filter(g => {
        const algCategory = g.currentCapability.algorithmId;
        return focus.some(f =>
          algCategory.includes(f) ||
          g.stateOfArt.technique.toLowerCase().includes(f.toLowerCase())
        );
      });
    }

    // 评分
    const scoredGaps = await this.gapAnalyzer.scoreImprovementPotential(gaps);

    // 生成路线图
    const roadmap = await this.gapAnalyzer.generateRoadmap(scoredGaps);

    // 生成报告摘要
    let summary = '';
    try {
      summary = await this.generateReportSummary(scoredGaps, roadmap);
    } catch (err) {
      log.warn({ err: (err as Error).message }, '报告摘要生成失败');
      summary = `共发现 ${scoredGaps.length} 个技术差距，最高优先级差距涉及 ${
        scoredGaps[0]?.currentCapability.name ?? '(无)'
      }，路线图包含 ${roadmap.phases.length} 个阶段。`;
    }

    // 发布差距报告事件
    try {
      eventBus.publish(
        AI_INTELLIGENCE_TOPICS.GAP_REPORT_GENERATED,
        'gap_report_generated',
        {
          reportId: crypto.randomUUID(),
          gapCount: scoredGaps.length,
          topGap: scoredGaps[0] ?? null,
          phaseCount: roadmap.phases.length,
        },
        { source: 'tech-intelligence' }
      );
    } catch (err) {
      log.warn({ err: (err as Error).message }, '差距报告事件发布失败');
    }

    const report: TechGapReport = {
      reportId: crypto.randomUUID(),
      generatedAt: Date.now(),
      focusAreas: focus ?? [],
      gaps: scoredGaps,
      roadmap,
      summary,
    };

    log.info(
      { reportId: report.reportId, gaps: scoredGaps.length, phases: roadmap.phases.length },
      '技术差距报告生成完成'
    );

    return report;
  }

  /**
   * 推荐新算法候选
   *
   * 基于最近一次扫描结果和差距分析，推荐值得实施的新算法。
   *
   * @returns 算法候选列表
   */
  async suggestAlgorithms(): Promise<AlgorithmCandidate[]> {
    log.info('开始推荐算法候选');

    // 优先使用最近的扫描结果
    const recentReport = this.scanHistory[this.scanHistory.length - 1];

    if (recentReport && recentReport.candidates.length > 0) {
      log.info(
        { candidateCount: recentReport.candidates.length, fromReport: recentReport.reportId },
        '使用最近扫描结果的候选推荐'
      );
      return recentReport.candidates;
    }

    // 没有历史结果，执行新的扫描周期
    log.info('无历史扫描结果，执行新扫描');
    const report = await this.runScanCycle();
    return report.candidates;
  }

  /**
   * 获取扫描历史
   *
   * @returns 扫描历史记录的只读副本
   */
  getScanHistory(): IntelligenceReport[] {
    return [...this.scanHistory];
  }

  // ==========================================================================
  // 私有方法
  // ==========================================================================

  /**
   * 构建情报发现条目
   *
   * 将扫描的文档和提取的技术方法组合成一条情报发现记录。
   *
   * @param doc - 扫描的文档
   * @param techniques - 从文档提取的技术方法
   * @returns 情报发现条目
   */
  private buildFinding(doc: ScannedDocument, techniques: ExtractedTechnique[]): IntelligenceFinding {
    const relevanceScore = 'relevanceScore' in doc
      ? (doc as unknown as { relevanceScore: number }).relevanceScore
      : 0.5;
    const applicableEquipment = 'applicableEquipment' in doc
      ? (doc as unknown as { applicableEquipment: string[] }).applicableEquipment
      : [];
    const summary = 'summary' in doc
      ? (doc as unknown as { summary: string }).summary
      : doc.abstract ?? doc.title;

    return {
      findingId: crypto.randomUUID(),
      source: doc.sourceType,
      title: doc.title,
      summary,
      relevanceScore,
      techniques,
      applicableEquipment,
      discoveredAt: Date.now(),
    };
  }

  /**
   * 发布事件通知
   *
   * 通过 EventBus 发布扫描完成、差距发现和算法推荐等事件。
   * 事件发布失败不阻塞主流程。
   *
   * @param report - 扫描报告
   * @param scoredGaps - 评分后的差距
   * @param candidates - 算法候选
   */
  private publishEvents(
    report: IntelligenceReport,
    scoredGaps: ScoredGap[],
    candidates: AlgorithmCandidate[]
  ): void {
    try {
      // 扫描完成事件
      eventBus.publish(
        AI_INTELLIGENCE_TOPICS.SCAN_COMPLETED,
        'scan_completed',
        {
          reportId: report.reportId,
          sourcesScanned: report.sourcesScanned,
          documentsFound: report.documentsFound,
          relevantDocuments: report.relevantDocuments,
          findingsCount: report.findings.length,
          durationMs: report.durationMs,
        },
        { source: 'tech-intelligence' }
      );

      // 差距发现事件（如果有差距）
      if (scoredGaps.length > 0) {
        eventBus.publish(
          AI_INTELLIGENCE_TOPICS.GAP_DISCOVERED,
          'gap_discovered',
          {
            reportId: report.reportId,
            gapCount: scoredGaps.length,
            topGaps: scoredGaps.slice(0, 3).map(g => ({
              gapId: g.gapId,
              currentAlgorithm: g.currentCapability.name,
              stateOfArt: g.stateOfArt.technique,
              gapMagnitude: g.gapMagnitude,
              priorityScore: g.priorityScore,
            })),
          },
          { source: 'tech-intelligence' }
        );
      }

      // 算法推荐事件（如果有候选）
      if (candidates.length > 0) {
        eventBus.publish(
          AI_INTELLIGENCE_TOPICS.ALGORITHM_SUGGESTED,
          'algorithm_suggested',
          {
            reportId: report.reportId,
            candidateCount: candidates.length,
            topCandidates: candidates.slice(0, 3).map(c => ({
              name: c.name,
              expectedImprovement: c.expectedImprovement,
              complexity: c.complexity,
              estimatedEffortDays: c.estimatedEffortDays,
            })),
          },
          { source: 'tech-intelligence' }
        );
      }
    } catch (err) {
      log.warn(
        { err: (err as Error).message },
        '事件发布失败（降级：不影响主流程）'
      );
    }
  }

  /**
   * 推送到进化实验室
   *
   * 当配置 autoPushToLab=true 时，将高优先级候选自动推送到
   * 进化实验室 (EvolutionLab) 触发改进实验。
   *
   * @param candidates - 算法候选
   * @param gaps - 相关差距
   */
  private pushToEvolutionLab(candidates: AlgorithmCandidate[], gaps: TechGap[]): void {
    try {
      // 通过 EventBus 发送到进化实验室
      // EvolutionLab 监听此事件并创建实验
      eventBus.publish(
        'ai.lab.insightSubmitted',
        'insight_submitted',
        {
          source: 'tech-intelligence',
          insights: candidates.map(c => ({
            title: `算法候选: ${c.name}`,
            description: c.implementationSketch,
            expectedImprovement: c.expectedImprovement,
            sourceGap: c.sourceGap,
            priority: c.complexity === 'low' ? 3 : c.complexity === 'medium' ? 2 : 1,
          })),
          relatedGaps: gaps.map(g => g.gapId),
          timestamp: Date.now(),
        },
        { source: 'tech-intelligence' }
      );

      log.info(
        { candidateCount: candidates.length },
        '候选算法已推送到进化实验室'
      );
    } catch (err) {
      log.warn(
        { err: (err as Error).message },
        '推送到进化实验室失败（降级：不影响报告生成）'
      );
    }
  }

  /**
   * 生成报告摘要
   *
   * 使用 LLM 将差距分析和路线图总结为运维管理者可读的中文摘要。
   * LLM 不可用时降级为模板摘要。
   *
   * @param gaps - 评分后的差距
   * @param roadmap - 改进路线图
   * @returns 中文摘要文本
   */
  private async generateReportSummary(
    gaps: ScoredGap[],
    roadmap: { phases: Array<{ name: string; gaps: ScoredGap[] }>; totalEstimatedEffortDays: number }
  ): Promise<string> {
    const config = getAIConfig().intelligence;

    try {
      const prompt = `你是港机设备技术战略顾问。请为以下技术差距分析结果生成管理层摘要。

差距数量: ${gaps.length}
最大差距: ${gaps[0]?.currentCapability.name ?? '无'} (差距幅度: ${gaps[0]?.gapMagnitude ?? 0})
路线图阶段: ${roadmap.phases.length}
总预计投入: ${roadmap.totalEstimatedEffortDays} 工作日

请用中文输出 200 字以内的摘要，包含：
1. 当前平台算法总体水平评估
2. 最值得关注的改进方向（1-2 个）
3. 改进的预期收益
4. 投入产出评估

直接返回文本，不需要 JSON 格式。`;

      const result = await invokeLLM({
        messages: [
          { role: 'system', content: '你是港机设备技术战略顾问，为管理层提供简洁的技术评估。' },
          { role: 'user', content: prompt },
        ],
        model: config.analysisModel,
        maxTokens: 500,
      });

      const content = typeof result.choices[0]?.message?.content === 'string'
        ? result.choices[0].message.content
        : '';

      return content.trim() || this.buildTemplateSummary(gaps, roadmap);
    } catch {
      return this.buildTemplateSummary(gaps, roadmap);
    }
  }

  /**
   * 模板摘要（LLM 降级）
   *
   * @param gaps - 评分后的差距
   * @param roadmap - 改进路线图
   * @returns 模板化的摘要文本
   */
  private buildTemplateSummary(
    gaps: ScoredGap[],
    roadmap: { phases: Array<{ name: string }>; totalEstimatedEffortDays: number }
  ): string {
    if (gaps.length === 0) {
      return '当前平台算法与前沿技术未发现显著差距，建议持续监测。';
    }

    const topGap = gaps[0];
    return `技术情报分析发现 ${gaps.length} 个技术差距。最高优先级差距涉及"${
      topGap.currentCapability.name
    }"（当前精度 ${(topGap.currentCapability.accuracy * 100).toFixed(1)}%，`
      + `前沿精度 ${(topGap.stateOfArt.reportedAccuracy * 100).toFixed(1)}%）。`
      + `改进路线图包含 ${roadmap.phases.length} 个阶段，`
      + `总预计投入 ${roadmap.totalEstimatedEffortDays} 工作日。`
      + `建议优先实施快速见效阶段的改进方案。`;
  }

  /**
   * 注册到 Agent 注册中心
   *
   * 将 TechIntelligence 注册为平台级 Agent，
   * 支持通过编排器统一调度。
   */
  private registerAgent(): void {
    try {
      agentRegistry.register({
        id: 'tech-intelligence-agent',
        name: '技术情报 Agent',
        description: '持续监测外部技术源，分析技术差距，推荐算法改进方案',
        version: '1.0.0',
        loopStage: 'evolution',
        sdkAdapter: 'custom',
        tags: ['ai', 'intelligence', 'evolution'],
        capabilities: ['tech_scanning', 'gap_analysis', 'algorithm_discovery'],
        timeoutMs: 120_000,
        invoke: async (input: unknown, ctx: AgentContext) => {
          const startTime = Date.now();
          try {
            const params = input as Record<string, unknown> | null;
            const action = params?.action ?? 'scan';

            let output: unknown;
            switch (action) {
              case 'scan':
                output = await this.runScanCycle();
                break;
              case 'search':
                output = await this.searchTopic(String(params?.query ?? ''));
                break;
              case 'gap_report':
                output = await this.generateGapReport(
                  Array.isArray(params?.focus) ? (params.focus as string[]) : undefined
                );
                break;
              case 'suggest':
                output = await this.suggestAlgorithms();
                break;
              default:
                output = await this.runScanCycle();
            }

            return {
              agentId: 'tech-intelligence-agent',
              success: true,
              output,
              durationMs: Date.now() - startTime,
            };
          } catch (err) {
            return {
              agentId: 'tech-intelligence-agent',
              success: false,
              output: null,
              durationMs: Date.now() - startTime,
              error: (err as Error).message,
            };
          }
        },
      });

      log.info('技术情报 Agent 已注册到注册中心');
    } catch (err) {
      log.warn(
        { err: (err as Error).message },
        '技术情报 Agent 注册失败（降级：独立运行模式）'
      );
    }
  }

  /**
   * 从 LLM 返回内容中提取 JSON 字符串
   *
   * @param content - LLM 原始返回内容
   * @returns 提取出的 JSON 字符串
   */
  private extractJson(content: string): string {
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }
    const jsonMatch = content.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) {
      return jsonMatch[0];
    }
    return content.trim();
  }
}

// ============================================================================
// 单例管理（遵循项目规范：单例 + 工厂模式）
// ============================================================================

/** 单例实例 */
let instance: TechIntelligence | null = null;

/**
 * 获取 TechIntelligence 单例
 *
 * 首次调用时创建实例并注册 Agent。
 * 后续调用返回同一实例。
 *
 * @returns TechIntelligence 单例
 */
export function getTechIntelligence(): TechIntelligence {
  if (!instance) {
    instance = new TechIntelligence();
  }
  return instance;
}

/**
 * 重置 TechIntelligence 单例
 *
 * 用于测试场景或需要重新初始化时。
 * 重置后下次调用 getTechIntelligence() 将创建新实例。
 */
export function resetTechIntelligence(): void {
  instance = null;
}
