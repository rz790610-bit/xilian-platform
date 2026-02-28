/**
 * ============================================================================
 * 技术差距分析器 (TechGapAnalyzer)
 * ============================================================================
 *
 * 对比当前平台算法能力与前沿技术，识别能力差距并评估改进 ROI。
 * 为进化实验室 (EvolutionLab) 提供改进方向和优先级排序。
 *
 * 核心流程：
 *   1. 将提取的前沿技术与平台现有算法按类别匹配
 *   2. 计算差距幅度（前沿精度 - 当前精度）
 *   3. 评估改进潜力和实施成本，计算 ROI
 *   4. 生成分阶段改进路线图
 *
 * 设计原则：
 *   - LLM 优先，规则兜底
 *   - 物理约束优先：改进建议必须符合港机设备物理特性
 *   - ROI 驱动：优先推荐投入产出比最高的改进方向
 */

import crypto from 'node:crypto';
import { createModuleLogger } from '../../../core/logger';
import { invokeLLM } from '../../../core/llm';
import { getAIConfig } from '../ai.config';
import type {
  ExtractedTechnique,
  AlgorithmMetadata,
  TechGap,
  ScoredGap,
  AlgorithmCandidate,
  ImprovementRoadmap,
} from '../ai.types';

const log = createModuleLogger('tech-gap-analyzer');

/** 实施难度到工作日的映射 */
const EFFORT_DAYS_MAP: Record<TechGap['implementationEffort'], number> = {
  low: 5,
  medium: 15,
  high: 40,
  very_high: 100,
};

/** 实施难度到系数的映射（用于 ROI 计算） */
const EFFORT_COST_MAP: Record<TechGap['implementationEffort'], number> = {
  low: 1,
  medium: 3,
  high: 8,
  very_high: 20,
};

/** 类别相似度映射（用于规则降级时的跨类别匹配） */
const CATEGORY_SIMILARITY: Record<string, string[]> = {
  vibration: ['bearing', 'gear', 'structural'],
  bearing: ['vibration', 'gear'],
  gear: ['vibration', 'bearing'],
  electrical: ['thermal'],
  thermal: ['electrical'],
  structural: ['vibration', 'fatigue'],
  anomaly: ['vibration', 'bearing', 'electrical', 'thermal', 'gear', 'structural'],
  general: ['vibration', 'bearing', 'electrical', 'thermal', 'gear', 'structural', 'anomaly'],
};

/**
 * 技术差距分析器
 *
 * 分析当前平台算法与前沿技术之间的差距，
 * 并生成优先级排序的改进路线图。
 */
export class TechGapAnalyzer {
  /**
   * 分析技术差距
   *
   * 将提取的前沿技术与平台现有算法进行匹配，
   * 计算每个匹配对的差距幅度和改进潜力。
   * LLM 用于处理类别不完全对齐的模糊匹配场景。
   *
   * @param techniques - 从文献中提取的前沿技术
   * @param currentAlgorithms - 当前平台算法清单
   * @returns 识别出的技术差距列表
   */
  async analyzeGaps(
    techniques: ExtractedTechnique[],
    currentAlgorithms: AlgorithmMetadata[]
  ): Promise<TechGap[]> {
    if (techniques.length === 0 || currentAlgorithms.length === 0) {
      log.info('技术列表或算法清单为空，无差距可分析');
      return [];
    }

    log.info(
      { techniqueCount: techniques.length, algorithmCount: currentAlgorithms.length },
      '开始技术差距分析'
    );

    const config = getAIConfig().intelligence;

    try {
      const prompt = `你是港机设备算法工程师。请分析以下前沿技术与当前平台算法之间的差距。

## 当前平台算法
${JSON.stringify(currentAlgorithms.map(a => ({
  id: a.algorithmId,
  name: a.name,
  category: a.category,
  accuracy: a.currentAccuracy,
})), null, 2)}

## 前沿技术
${JSON.stringify(techniques.map(t => ({
  name: t.name,
  category: t.category,
  accuracy: t.reportedAccuracy,
  novelty: t.noveltyScore,
  description: t.description,
})), null, 2)}

请以 JSON 数组格式返回差距分析结果：
[
  {
    "currentAlgorithmId": "当前算法ID",
    "currentAlgorithmName": "当前算法名称",
    "currentAccuracy": 当前精度,
    "technique": "前沿技术名称",
    "source": "来源文档",
    "reportedAccuracy": 报告精度,
    "gapMagnitude": 差距幅度（0~1）,
    "improvementPotential": 改进潜力（0~1）,
    "implementationEffort": "low|medium|high|very_high",
    "reasoning": "匹配理由和差距分析"
  }
]

分析要求：
- 只匹配类别相关或可迁移的技术对
- gapMagnitude = reportedAccuracy - currentAccuracy（如无报告精度则估算）
- improvementPotential 考虑技术成熟度、数据可用性、港机场景适配性
- implementationEffort 考虑算法复杂度、数据需求、工程化难度`;

      const result = await invokeLLM({
        messages: [
          { role: 'system', content: '你是港机设备算法优化专家。请严格以 JSON 数组格式返回分析结果。' },
          { role: 'user', content: prompt },
        ],
        model: config.analysisModel,
        maxTokens: config.sketchMaxTokens,
      });

      const content = typeof result.choices[0]?.message?.content === 'string'
        ? result.choices[0].message.content
        : '';

      const parsed = JSON.parse(this.extractJson(content));
      const gaps: TechGap[] = (Array.isArray(parsed) ? parsed : []).map(
        (g: Record<string, unknown>) => ({
          gapId: crypto.randomUUID(),
          currentCapability: {
            algorithmId: String(g.currentAlgorithmId ?? ''),
            name: String(g.currentAlgorithmName ?? ''),
            accuracy: typeof g.currentAccuracy === 'number' ? g.currentAccuracy : 0,
          },
          stateOfArt: {
            technique: String(g.technique ?? ''),
            source: String(g.source ?? ''),
            reportedAccuracy: typeof g.reportedAccuracy === 'number' ? g.reportedAccuracy : 0,
          },
          gapMagnitude: Math.max(0, Math.min(1, typeof g.gapMagnitude === 'number' ? g.gapMagnitude : 0)),
          improvementPotential: Math.max(0, Math.min(1, typeof g.improvementPotential === 'number' ? g.improvementPotential : 0)),
          implementationEffort: (['low', 'medium', 'high', 'very_high'].includes(String(g.implementationEffort))
            ? String(g.implementationEffort)
            : 'medium') as TechGap['implementationEffort'],
        })
      );

      log.info({ gapCount: gaps.length }, '技术差距分析完成（LLM 模式）');
      return gaps;
    } catch (err) {
      log.warn(
        { err: (err as Error).message },
        'LLM 差距分析失败，降级为规则匹配'
      );
      return this.matchByRules(techniques, currentAlgorithms);
    }
  }

  /**
   * 评分改进潜力
   *
   * 为每个差距计算优先级分数和 ROI 估算。
   * 优先级 = 改进潜力 * (1 / 实施成本系数) * 相关性乘数
   * ROI = 预期收益 / 实施成本
   *
   * @param gaps - 技术差距列表
   * @returns 带评分的差距列表（按优先级降序排列）
   */
  async scoreImprovementPotential(gaps: TechGap[]): Promise<ScoredGap[]> {
    if (gaps.length === 0) return [];

    log.info({ gapCount: gaps.length }, '开始改进潜力评分');

    const scoredGaps: ScoredGap[] = gaps.map(gap => {
      const effortCost = EFFORT_COST_MAP[gap.implementationEffort];

      // 优先级分数 = 改进潜力 * 差距幅度 * (1/实施成本系数)
      const priorityScore = gap.improvementPotential * gap.gapMagnitude * (1 / effortCost);

      // ROI = (差距幅度 * 10) / 实施天数 — 每工作日预期改进百分比
      const effortDays = EFFORT_DAYS_MAP[gap.implementationEffort];
      const roiEstimate = (gap.gapMagnitude * 10) / effortDays;

      return {
        ...gap,
        priorityScore: Math.round(priorityScore * 1000) / 1000,
        roiEstimate: Math.round(roiEstimate * 1000) / 1000,
      };
    });

    // 按优先级分数降序排列
    scoredGaps.sort((a, b) => b.priorityScore - a.priorityScore);

    log.info(
      {
        gapCount: scoredGaps.length,
        topGap: scoredGaps[0]
          ? `${scoredGaps[0].currentCapability.name} (score=${scoredGaps[0].priorityScore})`
          : 'none',
      },
      '改进潜力评分完成'
    );

    return scoredGaps;
  }

  /**
   * 生成改进路线图
   *
   * 使用 LLM 将评分后的差距分为三个阶段：
   *   - Phase 1: 快速见效（低成本高回报）
   *   - Phase 2: 中期改进（中等投入）
   *   - Phase 3: 长期研究方向（高投入前沿探索）
   *
   * @param gaps - 评分后的差距列表
   * @returns 分阶段改进路线图
   */
  async generateRoadmap(gaps: ScoredGap[]): Promise<ImprovementRoadmap> {
    if (gaps.length === 0) {
      return { phases: [], totalEstimatedEffortDays: 0, expectedOverallImprovement: 0 };
    }

    log.info({ gapCount: gaps.length }, '开始生成改进路线图');

    const config = getAIConfig().intelligence;

    try {
      const prompt = `你是港机设备算法战略规划专家。请根据以下技术差距评分结果，生成分阶段改进路线图。

## 评分后的技术差距（按优先级降序）
${JSON.stringify(gaps.map(g => ({
  gapId: g.gapId,
  currentAlgorithm: g.currentCapability.name,
  stateOfArt: g.stateOfArt.technique,
  gapMagnitude: g.gapMagnitude,
  effort: g.implementationEffort,
  priorityScore: g.priorityScore,
  roiEstimate: g.roiEstimate,
})), null, 2)}

请以 JSON 格式返回路线图：
{
  "phases": [
    {
      "phase": 1,
      "name": "快速见效",
      "duration": "预计时长（如 2周）",
      "gapIds": ["要解决的 gapId 列表"],
      "summary": "本阶段概述"
    },
    {
      "phase": 2,
      "name": "中期改进",
      "duration": "预计时长",
      "gapIds": ["gapId 列表"],
      "summary": "本阶段概述"
    },
    {
      "phase": 3,
      "name": "长期研究",
      "duration": "预计时长",
      "gapIds": ["gapId 列表"],
      "summary": "本阶段概述"
    }
  ],
  "totalEstimatedEffortDays": 总预计工作日,
  "expectedOverallImprovement": 预计整体精度提升（0~1）
}

规划原则：
- Phase 1: effort=low 且 priorityScore 最高的差距
- Phase 2: effort=medium 的差距
- Phase 3: effort=high/very_high 的前沿研究方向
- 每个阶段应有明确的里程碑和可验证目标`;

      const result = await invokeLLM({
        messages: [
          { role: 'system', content: '你是港机设备算法战略规划专家。请严格以 JSON 格式返回路线图。' },
          { role: 'user', content: prompt },
        ],
        model: config.analysisModel,
        maxTokens: config.sketchMaxTokens,
      });

      const content = typeof result.choices[0]?.message?.content === 'string'
        ? result.choices[0].message.content
        : '';

      const parsed = JSON.parse(this.extractJson(content));
      const gapMap = new Map(gaps.map(g => [g.gapId, g]));

      const roadmap: ImprovementRoadmap = {
        phases: (Array.isArray(parsed.phases) ? parsed.phases : []).map(
          (p: Record<string, unknown>) => {
            const phaseGapIds: string[] = Array.isArray(p.gapIds) ? p.gapIds as string[] : [];
            const phaseGaps = phaseGapIds
              .map(id => gapMap.get(id))
              .filter((g): g is ScoredGap => g !== undefined);

            return {
              phase: typeof p.phase === 'number' ? p.phase : 0,
              name: String(p.name ?? `Phase ${p.phase}`),
              duration: String(p.duration ?? '未定'),
              gaps: phaseGaps,
              candidates: [], // 候选算法在 suggestCandidates 中填充
            };
          }
        ),
        totalEstimatedEffortDays: typeof parsed.totalEstimatedEffortDays === 'number'
          ? parsed.totalEstimatedEffortDays
          : gaps.reduce((sum, g) => sum + EFFORT_DAYS_MAP[g.implementationEffort], 0),
        expectedOverallImprovement: typeof parsed.expectedOverallImprovement === 'number'
          ? Math.min(1, Math.max(0, parsed.expectedOverallImprovement))
          : 0,
      };

      log.info(
        { phases: roadmap.phases.length, totalDays: roadmap.totalEstimatedEffortDays },
        '改进路线图生成完成（LLM 模式）'
      );
      return roadmap;
    } catch (err) {
      log.warn(
        { err: (err as Error).message },
        'LLM 路线图生成失败，降级为规则分配'
      );
      return this.buildRoadmapByRules(gaps);
    }
  }

  /**
   * 推荐算法候选
   *
   * 使用 LLM 为高优先级差距生成具体的算法实现建议，
   * 包括实现草案、前置条件、复杂度评估和工作量估算。
   *
   * @param gaps - 评分后的差距列表
   * @returns 算法候选列表
   */
  async suggestCandidates(gaps: ScoredGap[]): Promise<AlgorithmCandidate[]> {
    if (gaps.length === 0) return [];

    // 只为 top 5 高优先级差距生成候选
    const topGaps = gaps.slice(0, 5);
    log.info({ gapCount: topGaps.length }, '开始生成算法候选建议');

    const config = getAIConfig().intelligence;

    try {
      const prompt = `你是港机设备算法架构师。请为以下技术差距提出具体的算法候选方案。

## 待改进的技术差距
${JSON.stringify(topGaps.map(g => ({
  gapId: g.gapId,
  currentAlgorithm: g.currentCapability.name,
  currentAccuracy: g.currentCapability.accuracy,
  stateOfArt: g.stateOfArt.technique,
  stateOfArtAccuracy: g.stateOfArt.reportedAccuracy,
  gapMagnitude: g.gapMagnitude,
  effort: g.implementationEffort,
})), null, 2)}

请以 JSON 数组格式返回算法候选方案：
[
  {
    "name": "候选算法名称",
    "sourceGap": "对应的 gapId",
    "expectedImprovement": 预期精度提升（0~1之间的小数）,
    "complexity": "low|medium|high",
    "prerequisites": ["前置条件列表"],
    "implementationSketch": "实现方案概述（中文，200字以内，含关键步骤）",
    "estimatedEffortDays": 预计工作日数
  }
]

方案要求：
- 每个候选必须基于已有成熟技术，不能是纯理论方案
- prerequisites 包括：数据要求、计算资源、依赖库等
- implementationSketch 需要包含具体的技术路线（如模型架构、训练策略等）
- 考虑与现有平台代码（TypeScript/Node.js）的集成可行性`;

      const result = await invokeLLM({
        messages: [
          { role: 'system', content: '你是港机设备算法架构师。请严格以 JSON 数组格式返回候选方案。' },
          { role: 'user', content: prompt },
        ],
        model: config.analysisModel,
        maxTokens: config.sketchMaxTokens,
      });

      const content = typeof result.choices[0]?.message?.content === 'string'
        ? result.choices[0].message.content
        : '';

      const parsed = JSON.parse(this.extractJson(content));
      const candidates: AlgorithmCandidate[] = (Array.isArray(parsed) ? parsed : []).map(
        (c: Record<string, unknown>) => ({
          name: String(c.name ?? '未命名候选'),
          sourceGap: String(c.sourceGap ?? ''),
          expectedImprovement: typeof c.expectedImprovement === 'number'
            ? Math.min(1, Math.max(0, c.expectedImprovement))
            : 0,
          complexity: (['low', 'medium', 'high'].includes(String(c.complexity))
            ? String(c.complexity)
            : 'medium') as AlgorithmCandidate['complexity'],
          prerequisites: Array.isArray(c.prerequisites)
            ? (c.prerequisites as unknown[]).map(String)
            : [],
          implementationSketch: String(c.implementationSketch ?? ''),
          estimatedEffortDays: typeof c.estimatedEffortDays === 'number'
            ? c.estimatedEffortDays
            : 10,
        })
      );

      log.info({ candidateCount: candidates.length }, '算法候选生成完成（LLM 模式）');
      return candidates;
    } catch (err) {
      log.warn(
        { err: (err as Error).message },
        'LLM 候选生成失败，返回基于规则的默认候选'
      );
      return this.buildCandidatesByRules(topGaps);
    }
  }

  /**
   * 获取当前平台算法清单（模拟）
   *
   * 返回平台已部署的算法元数据。
   * 在生产环境中，将从算法注册表 (AlgorithmRegistry) 查询。
   *
   * @returns 当前平台算法元数据列表
   */
  getCurrentAlgorithms(): AlgorithmMetadata[] {
    return [
      { algorithmId: 'vib-rms', name: '振动RMS分析', category: 'vibration', currentAccuracy: 0.82, lastUpdated: Date.now() },
      { algorithmId: 'bearing-env', name: '轴承包络分析', category: 'bearing', currentAccuracy: 0.78, lastUpdated: Date.now() },
      { algorithmId: 'motor-mcsa', name: '电机电流分析', category: 'electrical', currentAccuracy: 0.75, lastUpdated: Date.now() },
      { algorithmId: 'gear-mesh', name: '齿轮啮合频率分析', category: 'gear', currentAccuracy: 0.80, lastUpdated: Date.now() },
      { algorithmId: 'thermal-trend', name: '温度趋势预测', category: 'thermal', currentAccuracy: 0.85, lastUpdated: Date.now() },
      { algorithmId: 'fatigue-sn', name: 'S-N曲线疲劳分析', category: 'structural', currentAccuracy: 0.88, lastUpdated: Date.now() },
    ];
  }

  /**
   * LLM 降级：基于类别的规则匹配
   *
   * 当 LLM 不可用时，按类别直接匹配前沿技术与当前算法。
   * 同类别精确匹配 + 相似类别交叉匹配。
   *
   * @param techniques - 提取的前沿技术
   * @param algorithms - 当前算法清单
   * @returns 基于规则匹配的差距列表
   */
  private matchByRules(
    techniques: ExtractedTechnique[],
    algorithms: AlgorithmMetadata[]
  ): TechGap[] {
    const gaps: TechGap[] = [];

    for (const technique of techniques) {
      // 精确类别匹配
      let matched = algorithms.find(a => a.category === technique.category);

      // 相似类别匹配
      if (!matched) {
        const similarCategories = CATEGORY_SIMILARITY[technique.category] ?? [];
        matched = algorithms.find(a => similarCategories.includes(a.category));
      }

      if (matched && technique.reportedAccuracy !== undefined) {
        const gapMagnitude = Math.max(0, technique.reportedAccuracy - matched.currentAccuracy);

        if (gapMagnitude > 0.02) { // 忽略 2% 以下的微小差距
          gaps.push({
            gapId: crypto.randomUUID(),
            currentCapability: {
              algorithmId: matched.algorithmId,
              name: matched.name,
              accuracy: matched.currentAccuracy,
            },
            stateOfArt: {
              technique: technique.name,
              source: technique.sourceDocument,
              reportedAccuracy: technique.reportedAccuracy,
            },
            gapMagnitude: Math.min(1, gapMagnitude),
            improvementPotential: Math.min(1, gapMagnitude * (1 + technique.noveltyScore) / 2),
            implementationEffort: technique.noveltyScore > 0.7 ? 'high'
              : technique.noveltyScore > 0.4 ? 'medium'
              : 'low',
          });
        }
      }
    }

    log.info({ gapCount: gaps.length }, '规则匹配差距分析完成（降级模式）');
    return gaps;
  }

  /**
   * LLM 降级：基于规则的路线图生成
   *
   * 按实施难度将差距分配到三个阶段。
   *
   * @param gaps - 评分后的差距列表
   * @returns 基于规则的路线图
   */
  private buildRoadmapByRules(gaps: ScoredGap[]): ImprovementRoadmap {
    const phase1Gaps = gaps.filter(g => g.implementationEffort === 'low');
    const phase2Gaps = gaps.filter(g => g.implementationEffort === 'medium');
    const phase3Gaps = gaps.filter(g =>
      g.implementationEffort === 'high' || g.implementationEffort === 'very_high'
    );

    const totalDays = gaps.reduce((sum, g) => sum + EFFORT_DAYS_MAP[g.implementationEffort], 0);
    const avgImprovement = gaps.length > 0
      ? gaps.reduce((sum, g) => sum + g.gapMagnitude, 0) / gaps.length
      : 0;

    const roadmap: ImprovementRoadmap = {
      phases: [
        {
          phase: 1,
          name: '快速见效',
          duration: `${Math.ceil(phase1Gaps.reduce((s, g) => s + EFFORT_DAYS_MAP[g.implementationEffort], 0) / 5)}周`,
          gaps: phase1Gaps,
          candidates: [],
        },
        {
          phase: 2,
          name: '中期改进',
          duration: `${Math.ceil(phase2Gaps.reduce((s, g) => s + EFFORT_DAYS_MAP[g.implementationEffort], 0) / 5)}周`,
          gaps: phase2Gaps,
          candidates: [],
        },
        {
          phase: 3,
          name: '长期研究',
          duration: `${Math.ceil(phase3Gaps.reduce((s, g) => s + EFFORT_DAYS_MAP[g.implementationEffort], 0) / 5)}周`,
          gaps: phase3Gaps,
          candidates: [],
        },
      ].filter(p => p.gaps.length > 0),
      totalEstimatedEffortDays: totalDays,
      expectedOverallImprovement: Math.min(1, avgImprovement),
    };

    log.info(
      { phases: roadmap.phases.length, totalDays },
      '路线图生成完成（规则降级模式）'
    );
    return roadmap;
  }

  /**
   * LLM 降级：基于规则的候选生成
   *
   * 为每个差距生成一条通用候选建议。
   *
   * @param gaps - 评分后的差距列表
   * @returns 基于规则的候选列表
   */
  private buildCandidatesByRules(gaps: ScoredGap[]): AlgorithmCandidate[] {
    return gaps.map(gap => ({
      name: `${gap.currentCapability.name} 增强方案`,
      sourceGap: gap.gapId,
      expectedImprovement: gap.gapMagnitude * 0.5, // 保守估计实现一半的差距
      complexity: gap.implementationEffort === 'low' ? 'low' as const
        : gap.implementationEffort === 'very_high' ? 'high' as const
        : 'medium' as const,
      prerequisites: [
        '历史训练数据 >= 1000 条',
        'Python 算法原型验证',
        'ONNX 模型导出能力',
      ],
      implementationSketch: `基于 ${gap.stateOfArt.technique} 的方法，对 ${gap.currentCapability.name} 进行增强。需要：1) 收集标注数据；2) 训练模型原型；3) 导出 ONNX 并集成到平台。`,
      estimatedEffortDays: EFFORT_DAYS_MAP[gap.implementationEffort],
    }));
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
