/**
 * ============================================================================
 * Phase 2 — ExperiencePool 三层内存经验池
 * ============================================================================
 *
 * 核心职责：跨会话经验传递，为推理提供历史知识支撑
 *
 * 三层内存架构：
 *   - Episodic（情景记忆）：原始诊断会话快照，向量检索 + 三维衰减
 *   - Semantic（语义记忆）：从情景中抽象的规则，关键词匹配
 *   - Procedural（程序记忆）：操作序列，域 + 步骤匹配
 *
 * 设计原则：
 *   - 自适应降维衰减（<50 单维，50-200 二维，>200 三维）
 *   - LRU 淘汰策略（容量满时淘汰最久未访问的记录）
 *   - VectorStore 集成（情景记忆的语义检索）
 *   - Record & Replay（完整会话上下文保存）
 *   - 依赖注入（VectorStore、Observability 从构造函数传入）
 */

import { createModuleLogger } from '../../../../core/logger';
import type { VectorStore } from '../vector-store/vector-store';
import type { Observability } from '../observability/observability';
import type {
  ExperiencePoolConfig,
  EpisodicExperience,
  SemanticExperience,
  ProceduralExperience,
  ExperienceRetrievalResult,
  AnomalyDomain,
} from '../reasoning.types';

const logger = createModuleLogger('experience-pool');

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: ExperiencePoolConfig = {
  capacity: { episodic: 1000, semantic: 500, procedural: 200 },
  decay: {
    timeHalfLifeDays: 30,
    deviceSimilarityWeight: 0.3,
    conditionSimilarityWeight: 0.2,
  },
  adaptiveDimensionThresholds: { singleDimension: 50, twoDimension: 200 },
  retrievalTopK: 10,
  minSimilarity: 0.3,
};

// ============================================================================
// 检索查询
// ============================================================================

export interface ExperienceQuery {
  /** 异常描述（用于向量检索） */
  anomalyDescription: string;
  /** 异常域 */
  domain?: AnomalyDomain;
  /** 设备类型 */
  deviceType?: string;
  /** 设备编码 */
  deviceCode?: string;
  /** 工况 ID */
  ocProfileId?: string;
  /** 特征向量（如果已有，跳过文本转向量） */
  featureVector?: number[];
  /** 最大返回数 */
  topK?: number;
}

// ============================================================================
// ExperiencePool
// ============================================================================

export class ExperiencePool {
  private readonly config: ExperiencePoolConfig;

  // 三层内存存储
  private readonly episodicMemory: Map<string, EpisodicExperience> = new Map();
  private readonly semanticMemory: Map<string, SemanticExperience> = new Map();
  private readonly proceduralMemory: Map<string, ProceduralExperience> = new Map();

  // LRU 访问时间追踪
  private readonly episodicAccessOrder: Map<string, number> = new Map();

  constructor(
    private readonly vectorStore: VectorStore,
    private readonly observability: Observability,
    config?: Partial<ExperiencePoolConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info({
      capacity: this.config.capacity,
      decay: this.config.decay,
    }, '[ExperiencePool] 初始化完成');
  }

  // =========================================================================
  // 情景记忆 — 写入
  // =========================================================================

  /** 记录一次诊断经验（Record） */
  recordEpisodic(experience: EpisodicExperience): void {
    const spanId = `exp_record_${Date.now()}`;
    this.observability.startSpan(spanId, 'experience_record');

    try {
      // LRU 淘汰
      if (this.episodicMemory.size >= this.config.capacity.episodic) {
        this.evictOldestEpisodic();
      }

      this.episodicMemory.set(experience.id, experience);
      this.episodicAccessOrder.set(experience.id, Date.now());

      // 注册到 VectorStore
      if (experience.featureVector.length > 0) {
        this.vectorStore.upsert(
          `exp_${experience.id}`,
          experience.featureVector,
          {
            type: 'episodic_experience',
            domain: experience.domain,
            deviceType: experience.deviceType,
            deviceCode: experience.deviceCode,
            wasCorrect: experience.wasCorrect,
          }
        );
      }

      logger.info({
        id: experience.id,
        domain: experience.domain,
        device: experience.deviceCode,
      }, '[ExperiencePool] 情景记忆已记录');

      // 检查是否可以抽象为语义记忆
      this.tryAbstractToSemantic(experience);
    } finally {
      this.observability.endSpan(spanId);
    }
  }

  /** 批量记录（从 DB 恢复时使用） */
  bulkLoadEpisodic(experiences: EpisodicExperience[]): void {
    for (const exp of experiences) {
      this.episodicMemory.set(exp.id, exp);
      this.episodicAccessOrder.set(exp.id, exp.lastAccessedAt.getTime());

      if (exp.featureVector.length > 0) {
        this.vectorStore.upsert(
          `exp_${exp.id}`,
          exp.featureVector,
          {
            type: 'episodic_experience',
            domain: exp.domain,
            deviceType: exp.deviceType,
            deviceCode: exp.deviceCode,
            wasCorrect: exp.wasCorrect,
          }
        );
      }
    }

    logger.info({ count: experiences.length }, '[ExperiencePool] 批量加载情景记忆完成');
  }

  // =========================================================================
  // 情景记忆 — 检索（Replay）
  // =========================================================================

  /** 综合检索 — 向量 + 过滤 + 三维衰减 */
  retrieve(query: ExperienceQuery): ExperienceRetrievalResult {
    const startTime = Date.now();
    const spanId = `exp_retrieve_${startTime}`;
    this.observability.startSpan(spanId, 'experience_retrieval');

    try {
      const topK = query.topK ?? this.config.retrievalTopK;

      // ── Step 1: 情景记忆检索 ──
      const episodicResults = this.retrieveEpisodic(query, topK);

      // ── Step 2: 语义记忆检索 ──
      const semanticResults = this.retrieveSemantic(query, topK);

      // ── Step 3: 程序记忆检索 ──
      const proceduralResults = this.retrieveProcedural(query, topK);

      // ── Step 4: 计算综合命中率 ──
      const hitRate = this.computeHitRate(episodicResults, semanticResults, proceduralResults);

      const durationMs = Date.now() - startTime;

      this.observability.recordMetric('experience_retrieval_duration_ms', durationMs);
      this.observability.recordMetric('experience_hit_rate', hitRate);

      return {
        episodic: episodicResults,
        semantic: semanticResults,
        procedural: proceduralResults,
        hitRate,
        durationMs,
      };
    } finally {
      this.observability.endSpan(spanId);
    }
  }

  /** 情景记忆检索 — 向量相似度 + 三维衰减 */
  private retrieveEpisodic(
    query: ExperienceQuery,
    topK: number
  ): Array<EpisodicExperience & { similarity: number; decayedScore: number }> {
    // 向量检索
    const featureVector = query.featureVector ?? this.textToVector(query.anomalyDescription);
    const vectorResults = this.vectorStore.search({
      vector: featureVector,
      topK: topK * 3, // 多检索一些，衰减后再截断
      minSimilarity: this.config.minSimilarity,
      filter: {
        type: 'episodic_experience',
        ...(query.domain ? { domain: query.domain } : {}),
      },
    });

    const results: Array<EpisodicExperience & { similarity: number; decayedScore: number }> = [];

    for (const vr of vectorResults) {
      const expId = vr.id.replace('exp_', '');
      const exp = this.episodicMemory.get(expId);
      if (!exp) continue;

      // 三维自适应衰减
      const decayScore = this.computeDecayScore(exp, query);
      const finalScore = vr.similarity * decayScore;

      if (finalScore >= this.config.minSimilarity * 0.5) {
        results.push({ ...exp, similarity: vr.similarity, decayedScore: finalScore });

        // 更新访问时间
        exp.lastAccessedAt = new Date();
        this.episodicAccessOrder.set(expId, Date.now());
      }
    }

    // 按衰减后分数排序
    results.sort((a, b) => b.decayedScore - a.decayedScore);
    return results.slice(0, topK);
  }

  /** 语义记忆检索 — 关键词 + 条件匹配 */
  private retrieveSemantic(
    query: ExperienceQuery,
    topK: number
  ): Array<SemanticExperience & { relevance: number }> {
    const results: Array<SemanticExperience & { relevance: number }> = [];
    const queryTerms = this.extractKeyTerms(query.anomalyDescription);

    for (const [, sem] of this.semanticMemory) {
      let relevance = 0;

      // 规则描述关键词匹配
      const ruleTerms = this.extractKeyTerms(sem.rule);
      const overlap = queryTerms.filter((t) => ruleTerms.includes(t)).length;
      relevance += overlap / Math.max(queryTerms.length, 1) * 0.5;

      // 适用条件匹配
      for (const cond of sem.applicableConditions) {
        if (query.domain && cond.includes(query.domain)) relevance += 0.2;
        if (query.deviceType && cond.includes(query.deviceType)) relevance += 0.15;
      }

      // 成功率加权
      relevance *= (0.5 + 0.5 * sem.successRate);

      if (relevance > 0.1) {
        results.push({ ...sem, relevance });
      }
    }

    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, topK);
  }

  /** 程序记忆检索 — 域 + 步骤匹配 */
  private retrieveProcedural(
    query: ExperienceQuery,
    topK: number
  ): Array<ProceduralExperience & { applicability: number }> {
    const results: Array<ProceduralExperience & { applicability: number }> = [];

    for (const [, proc] of this.proceduralMemory) {
      let applicability = 0;

      // 域匹配
      if (query.domain && proc.domain === query.domain) {
        applicability += 0.5;
      }

      // 执行次数加权（经验丰富的程序更可靠）
      applicability += Math.min(0.3, proc.executionCount / 100 * 0.3);

      // 描述关键词匹配
      const queryTerms = this.extractKeyTerms(query.anomalyDescription);
      const nameTerms = this.extractKeyTerms(proc.name);
      const overlap = queryTerms.filter((t) => nameTerms.includes(t)).length;
      applicability += overlap / Math.max(queryTerms.length, 1) * 0.2;

      if (applicability > 0.2) {
        results.push({ ...proc, applicability });
      }
    }

    results.sort((a, b) => b.applicability - a.applicability);
    return results.slice(0, topK);
  }

  // =========================================================================
  // 三维自适应衰减
  // =========================================================================

  /**
   * 计算衰减分数 — 自适应降维
   *
   * 经验数 <50：  单维衰减（仅时间）
   * 经验数 50-200：二维衰减（时间 × 设备相似度）
   * 经验数 >200：  三维衰减（时间 × 设备相似度 × 工况相似度）
   */
  private computeDecayScore(exp: EpisodicExperience, query: ExperienceQuery): number {
    const totalExperiences = this.episodicMemory.size;
    const { singleDimension, twoDimension } = this.config.adaptiveDimensionThresholds;

    // ── 维度 1: 时间衰减（始终启用）──
    const daysSinceCreation = (Date.now() - exp.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const timeDecay = Math.pow(0.5, daysSinceCreation / this.config.decay.timeHalfLifeDays);

    if (totalExperiences < singleDimension) {
      return timeDecay;
    }

    // ── 维度 2: 设备相似度（经验 ≥50 时启用）──
    const deviceSimilarity = this.computeDeviceSimilarity(exp, query);
    const deviceWeight = this.config.decay.deviceSimilarityWeight;

    if (totalExperiences < twoDimension) {
      return timeDecay * (1 - deviceWeight + deviceWeight * deviceSimilarity);
    }

    // ── 维度 3: 工况相似度（经验 ≥200 时启用）──
    const conditionSimilarity = this.computeConditionSimilarity(exp, query);
    const conditionWeight = this.config.decay.conditionSimilarityWeight;

    return timeDecay
      * (1 - deviceWeight + deviceWeight * deviceSimilarity)
      * (1 - conditionWeight + conditionWeight * conditionSimilarity);
  }

  /** 设备相似度计算 */
  private computeDeviceSimilarity(exp: EpisodicExperience, query: ExperienceQuery): number {
    let similarity = 0;

    // 完全匹配设备编码
    if (query.deviceCode && exp.deviceCode === query.deviceCode) {
      return 1.0;
    }

    // 设备类型匹配
    if (query.deviceType && exp.deviceType === query.deviceType) {
      similarity += 0.7;
    }

    // 异常域匹配
    if (query.domain && exp.domain === query.domain) {
      similarity += 0.3;
    }

    return Math.min(1, similarity);
  }

  /** 工况相似度计算 */
  private computeConditionSimilarity(exp: EpisodicExperience, query: ExperienceQuery): number {
    // 工况 ID 完全匹配
    if (query.ocProfileId && exp.ocProfileId === query.ocProfileId) {
      return 1.0;
    }

    // 有工况但不匹配
    if (query.ocProfileId && exp.ocProfileId) {
      return 0.3; // 基础相似度
    }

    // 无工况信息
    return 0.5; // 中性
  }

  // =========================================================================
  // 语义记忆抽象
  // =========================================================================

  /** 尝试从情景记忆中抽象语义规则 */
  private tryAbstractToSemantic(newExp: EpisodicExperience): void {
    // 查找同域、同假设的已确认经验
    const samePatternExps = Array.from(this.episodicMemory.values()).filter(
      (e) =>
        e.id !== newExp.id &&
        e.domain === newExp.domain &&
        e.wasCorrect === true &&
        this.isSimilarHypothesis(e.hypothesis, newExp.hypothesis)
    );

    // 至少 3 次相同模式才抽象
    if (samePatternExps.length < 2) return; // 加上 newExp 共 3 次

    const ruleId = `sem_${newExp.domain}_${Date.now()}`;
    const sourceIds = [newExp.id, ...samePatternExps.slice(0, 4).map((e) => e.id)];

    // 检查是否已有类似规则
    for (const [, sem] of this.semanticMemory) {
      if (
        sem.sourceEpisodicIds.some((id) => sourceIds.includes(id)) &&
        this.isSimilarHypothesis(sem.rule, newExp.hypothesis)
      ) {
        // 更新已有规则
        sem.verificationCount++;
        sem.successRate = (sem.successRate * (sem.verificationCount - 1) + (newExp.wasCorrect ? 1 : 0)) / sem.verificationCount;
        sem.confidence = Math.min(1, sem.confidence + 0.02);
        if (!sem.sourceEpisodicIds.includes(newExp.id)) {
          sem.sourceEpisodicIds.push(newExp.id);
        }
        return;
      }
    }

    // 容量检查
    if (this.semanticMemory.size >= this.config.capacity.semantic) {
      this.evictLowestConfidenceSemantic();
    }

    // 创建新语义规则
    const semanticRule: SemanticExperience = {
      id: ruleId,
      rule: `当 ${newExp.deviceType} 出现 ${newExp.anomalyDescription} 时，根因可能为 ${newExp.rootCause}`,
      applicableConditions: [
        `domain:${newExp.domain}`,
        `deviceType:${newExp.deviceType}`,
        ...(newExp.ocProfileId ? [`ocProfile:${newExp.ocProfileId}`] : []),
      ],
      sourceEpisodicIds: sourceIds,
      verificationCount: sourceIds.length,
      successRate: samePatternExps.filter((e) => e.wasCorrect).length / samePatternExps.length,
      confidence: 0.6,
      createdAt: new Date(),
    };

    this.semanticMemory.set(ruleId, semanticRule);

    logger.info({
      ruleId,
      domain: newExp.domain,
      sourceCount: sourceIds.length,
    }, '[ExperiencePool] 语义记忆已抽象');
  }

  // =========================================================================
  // 程序记忆
  // =========================================================================

  /** 记录程序记忆 */
  recordProcedural(procedure: ProceduralExperience): void {
    if (this.proceduralMemory.size >= this.config.capacity.procedural) {
      this.evictLowestExecutionProcedural();
    }

    this.proceduralMemory.set(procedure.id, procedure);

    logger.info({
      id: procedure.id,
      domain: procedure.domain,
      steps: procedure.steps.length,
    }, '[ExperiencePool] 程序记忆已记录');
  }

  /** 更新程序记忆执行统计 */
  updateProceduralExecution(procedureId: string, durationMs: number): void {
    const proc = this.proceduralMemory.get(procedureId);
    if (!proc) return;

    proc.avgDurationMs = (proc.avgDurationMs * proc.executionCount + durationMs) / (proc.executionCount + 1);
    proc.executionCount++;
  }

  // =========================================================================
  // 反馈更新
  // =========================================================================

  /** 更新经验的正确性反馈 */
  updateFeedback(experienceId: string, wasCorrect: boolean): void {
    const exp = this.episodicMemory.get(experienceId);
    if (!exp) return;

    exp.wasCorrect = wasCorrect;

    // 更新 VectorStore 元数据
    if (exp.featureVector.length > 0) {
      this.vectorStore.upsert(
        `exp_${exp.id}`,
        exp.featureVector,
        {
          type: 'episodic_experience',
          domain: exp.domain,
          deviceType: exp.deviceType,
          deviceCode: exp.deviceCode,
          wasCorrect,
        }
      );
    }

    logger.info({
      id: experienceId,
      wasCorrect,
    }, '[ExperiencePool] 经验反馈已更新');
  }

  // =========================================================================
  // 统计
  // =========================================================================

  /** 获取经验池统计 */
  getStats(): {
    episodicCount: number;
    semanticCount: number;
    proceduralCount: number;
    domainDistribution: Record<string, number>;
    correctRate: number;
    avgDecayDimension: string;
  } {
    const domainDistribution: Record<string, number> = {};
    let correctCount = 0;
    let feedbackCount = 0;

    for (const exp of this.episodicMemory.values()) {
      domainDistribution[exp.domain] = (domainDistribution[exp.domain] ?? 0) + 1;
      if (exp.wasCorrect !== null) {
        feedbackCount++;
        if (exp.wasCorrect) correctCount++;
      }
    }

    const totalEpisodic = this.episodicMemory.size;
    const { singleDimension, twoDimension } = this.config.adaptiveDimensionThresholds;
    const avgDecayDimension = totalEpisodic < singleDimension
      ? '单维（仅时间）'
      : totalEpisodic < twoDimension
        ? '二维（时间×设备）'
        : '三维（时间×设备×工况）';

    return {
      episodicCount: totalEpisodic,
      semanticCount: this.semanticMemory.size,
      proceduralCount: this.proceduralMemory.size,
      domainDistribution,
      correctRate: feedbackCount > 0 ? correctCount / feedbackCount : 0,
      avgDecayDimension,
    };
  }

  /** 获取所有情景记忆（用于 DB 持久化） */
  getAllEpisodic(): EpisodicExperience[] {
    return Array.from(this.episodicMemory.values());
  }

  /** 获取所有语义记忆 */
  getAllSemantic(): SemanticExperience[] {
    return Array.from(this.semanticMemory.values());
  }

  /** 获取所有程序记忆 */
  getAllProcedural(): ProceduralExperience[] {
    return Array.from(this.proceduralMemory.values());
  }

  // =========================================================================
  // 内部辅助方法
  // =========================================================================

  /** LRU 淘汰最久未访问的情景记忆 */
  private evictOldestEpisodic(): void {
    let oldestId = '';
    let oldestTime = Infinity;

    for (const [id, time] of this.episodicAccessOrder) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.episodicMemory.delete(oldestId);
      this.episodicAccessOrder.delete(oldestId);
      this.vectorStore.delete(`exp_${oldestId}`);
    }
  }

  /** 淘汰最低置信度的语义记忆 */
  private evictLowestConfidenceSemantic(): void {
    let lowestId = '';
    let lowestConf = Infinity;

    for (const [id, sem] of this.semanticMemory) {
      if (sem.confidence < lowestConf) {
        lowestConf = sem.confidence;
        lowestId = id;
      }
    }

    if (lowestId) {
      this.semanticMemory.delete(lowestId);
    }
  }

  /** 淘汰最低执行次数的程序记忆 */
  private evictLowestExecutionProcedural(): void {
    let lowestId = '';
    let lowestCount = Infinity;

    for (const [id, proc] of this.proceduralMemory) {
      if (proc.executionCount < lowestCount) {
        lowestCount = proc.executionCount;
        lowestId = id;
      }
    }

    if (lowestId) {
      this.proceduralMemory.delete(lowestId);
    }
  }

  /** 判断两个假设是否相似 */
  private isSimilarHypothesis(h1: string, h2: string): boolean {
    const terms1 = this.extractKeyTerms(h1);
    const terms2 = this.extractKeyTerms(h2);
    if (terms1.length === 0 || terms2.length === 0) return false;

    const overlap = terms1.filter((t) => terms2.includes(t)).length;
    const jaccard = overlap / (terms1.length + terms2.length - overlap);
    return jaccard >= 0.4;
  }

  /** 提取关键词 */
  private extractKeyTerms(text: string): string[] {
    const stopWords = new Set(['的', '了', '在', '是', '和', '与', '或', '及', '为', '被', '将', '对', '等', '中', '上', '下']);
    return text
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !stopWords.has(t))
      .map((t) => t.toLowerCase());
  }

  /** 文本转向量（与 VectorStore 兼容的 64 维词袋） */
  private textToVector(text: string): number[] {
    const vocabulary = [
      '轴承', '齿轮', '电机', '疲劳', '液压', '钢丝绳', '泵', '绝缘',
      '振动', '温度', '压力', '流量', '电流', '应力', '转速', '磨损',
      '裂纹', '泄漏', '过热', '老化', '腐蚀', '气蚀', '断裂', '变形',
      '噪声', '冲击', '频谱', 'FFT', 'RMS', '峰值', '波形', '趋势',
      '外圈', '内圈', '滚动体', '保持架', '齿面', '啮合', '点蚀', '剥落',
      '定子', '转子', '绕组', '铁芯', '油膜', '密封', '阀门', '缸体',
      '吊臂', '桁架', '焊缝', '螺栓', '基础', '轨道', '车轮', '减速器',
      '联轴器', '制动器', '卷筒', '滑轮', '吊钩', '抓斗', '门座', '臂架',
    ];

    const vector = new Array(vocabulary.length).fill(0);
    const lowerText = text.toLowerCase();

    for (let i = 0; i < vocabulary.length; i++) {
      if (lowerText.includes(vocabulary[i].toLowerCase())) {
        vector[i] = 1;
      }
    }

    return vector;
  }

  /** 计算综合命中率 */
  private computeHitRate(
    episodic: Array<{ decayedScore: number }>,
    semantic: Array<{ relevance: number }>,
    procedural: Array<{ applicability: number }>
  ): number {
    // 加权命中率：情景 50% + 语义 30% + 程序 20%
    const episodicHit = episodic.length > 0
      ? Math.min(1, episodic[0].decayedScore * 1.2)
      : 0;
    const semanticHit = semantic.length > 0
      ? Math.min(1, semantic[0].relevance * 1.2)
      : 0;
    const proceduralHit = procedural.length > 0
      ? Math.min(1, procedural[0].applicability * 1.2)
      : 0;

    return episodicHit * 0.5 + semanticHit * 0.3 + proceduralHit * 0.2;
  }
}
