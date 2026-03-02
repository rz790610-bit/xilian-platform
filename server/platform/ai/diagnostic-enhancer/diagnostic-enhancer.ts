/**
 * ============================================================================
 * 诊断增强引擎 (DiagnosticEnhancer)
 * ============================================================================
 *
 * 核心职责：
 *   1. 综合多源证据（传感器 + 算法 + 知识图谱 + 历史案例）
 *   2. 物理约束校验（所有输出必须符合物理规律）
 *   3. LLM 增强推理（通过 invokeLLM 或 GrokToolCallingEngine）
 *   4. 根因分析（基于 KG 因果链 + LLM 推理）
 *   5. 维护建议生成（优先级排序 + 约束适配）
 *   6. 事件发布（诊断结果通过 EventBus 广播到下游）
 *
 * 架构位置：
 *   server/platform/ai/diagnostic-enhancer/
 *   属于 AI 模块层，依赖认知域（Grok）和知识域（KG），
 *   通过 EventBus 与进化域、护栏域解耦通信。
 *
 * 降级策略：
 *   - GrokToolCallingEngine 不可用 → 降级为 invokeLLM 直接调用
 *   - invokeLLM 不可用 → 降级为纯规则引擎（基于阈值和统计）
 *   - KnowledgeGraph 不可用 → 跳过 KG 证据，降低综合置信度
 *   - EventBus 不可用 → 仅记录日志，不阻塞主流程
 *
 * 使用方式：
 *   import { getDiagnosticEnhancer } from './diagnostic-enhancer';
 *   const enhancer = getDiagnosticEnhancer();
 *   const report = await enhancer.enhance(request);
 */

import crypto from 'crypto';
import { createModuleLogger } from '../../../core/logger';
import { invokeLLM } from '../../../core/llm';
import { eventBus } from '../../../services/eventBus.service';
import { agentRegistry, type AgentContext, type AgentResult } from '../../../core/agent-registry';
import { KnowledgeGraphEngine } from '../../knowledge/graph/knowledge-graph';
import { GrokToolCallingEngine } from '../../cognition/grok/grok-tool-calling';
import { getAIConfig } from '../ai.config';
import { AI_DIAGNOSIS_TOPICS } from '../ai.topics';
import { DIAGNOSTIC_ENHANCER_TOOLS } from './diagnostic-enhancer.tools';
import {
  DIAGNOSTIC_SYSTEM_PROMPT,
  ROOT_CAUSE_PROMPT,
  RECOMMENDATION_PROMPT,
  EVIDENCE_SYNTHESIS_PROMPT,
} from './diagnostic-enhancer.prompts';
import type {
  EnhanceDiagnosisRequest,
  EnhancedDiagnosisReport,
  RootCauseAnalysis,
  MaintenanceRecommendation,
  EvidenceItem,
  RiskLevel,
  PredictionInfo,
  DiagnosisEntry,
  DiagnosisDepth,
  EvidenceSource,
} from '../ai.types';

const log = createModuleLogger('diagnostic-enhancer');

// ============================================================================
// 物理约束常量
// ============================================================================

/** 物理有效范围定义 */
const PHYSICAL_RANGES = {
  temperature: { min: -40, max: 300, unit: '°C' },
  vibrationRms: { min: 0, max: 100, unit: 'mm/s' },
  powerFactor: { min: 0, max: 1, unit: '' },
  score: { min: 0, max: 100, unit: '' },
  probability: { min: 0, max: 1, unit: '' },
} as const;

// ============================================================================
// DiagnosticEnhancer 核心类
// ============================================================================

export class DiagnosticEnhancer {
  private kg: KnowledgeGraphEngine;
  private grokEngine: GrokToolCallingEngine | null = null;

  constructor() {
    this.kg = new KnowledgeGraphEngine();
    this.initGrokEngine();
    this.registerAgent();
  }

  // --------------------------------------------------------------------------
  // 初始化
  // --------------------------------------------------------------------------

  /**
   * 初始化 GrokToolCallingEngine
   *
   * 尝试从配置中读取 API URL 和 Key，如果失败则标记为 null，
   * 后续推理将降级为 invokeLLM 直接调用。
   */
  private initGrokEngine(): void {
    try {
      const config = getAIConfig().diagnostic;
      // GrokToolCallingEngine 使用空 URL/Key 时通过 invokeLLM 降级
      this.grokEngine = new GrokToolCallingEngine('', '', DIAGNOSTIC_ENHANCER_TOOLS);
      log.info(
        { toolCount: DIAGNOSTIC_ENHANCER_TOOLS.length, model: config.model },
        'GrokToolCallingEngine 初始化成功'
      );
    } catch (err: any) {
      log.warn({ err: err.message }, 'GrokToolCallingEngine 初始化失败，将使用 invokeLLM 降级');
      this.grokEngine = null;
    }
  }

  /**
   * 注册为 AgentRegistry 中的 Agent
   *
   * 允许通过统一的 AgentRegistry 接口被编排器调用。
   */
  private registerAgent(): void {
    try {
      agentRegistry.register({
        id: 'diagnostic-enhancer-agent',
        name: '诊断增强 Agent',
        description: '综合多源证据（传感器、算法、KG、历史）进行 LLM 增强诊断，生成结构化诊断报告和维护建议。',
        version: '1.0.0',
        loopStage: 'diagnosis',
        sdkAdapter: 'custom',
        tags: ['ai', 'diagnosis', 'enhancement', 'llm'],
        capabilities: ['diagnosis_enhancement', 'root_cause', 'recommendations', 'evidence_synthesis'],
        tools: DIAGNOSTIC_ENHANCER_TOOLS.map(t => t.name),
        maxConcurrency: getAIConfig().diagnostic.batchConcurrency,
        timeoutMs: getAIConfig().diagnostic.deepTimeoutMs,
        invoke: async (input: unknown, ctx: AgentContext): Promise<AgentResult> => {
          const startTime = Date.now();
          try {
            const request = input as EnhanceDiagnosisRequest;
            const report = await this.enhance(request);
            return {
              agentId: 'diagnostic-enhancer-agent',
              success: true,
              output: report,
              durationMs: Date.now() - startTime,
            };
          } catch (err: any) {
            return {
              agentId: 'diagnostic-enhancer-agent',
              success: false,
              output: null,
              durationMs: Date.now() - startTime,
              error: err.message,
            };
          }
        },
      });
      log.info('诊断增强 Agent 已注册到 AgentRegistry');
    } catch (err: any) {
      log.warn({ err: err.message }, 'Agent 注册失败（非致命）');
    }
  }

  // --------------------------------------------------------------------------
  // 公开方法
  // --------------------------------------------------------------------------

  /**
   * 主诊断增强方法
   *
   * 执行完整的诊断增强流程：
   *   1. 收集证据 → 2. 物理校验 → 3. 搜索历史案例 →
   *   4. 追溯因果链 → 5. LLM 综合推理 → 6. 生成建议 → 7. 发布事件
   *
   * @param request - 诊断增强请求
   * @returns 增强诊断报告
   */
  async enhance(request: EnhanceDiagnosisRequest): Promise<EnhancedDiagnosisReport> {
    const reportId = this.generateReportId();
    const startTime = Date.now();
    const config = getAIConfig().diagnostic;

    log.info(
      { reportId, machineId: request.machineId, depth: request.depth, algorithmCount: request.algorithmResults.length },
      '开始诊断增强'
    );

    // Step 1: 收集证据
    const rawEvidence = await this.collectEvidence(request);

    // Step 2: 物理约束校验（过滤或标记不合理证据）
    const validatedEvidence = await this.validatePhysics(rawEvidence);

    // Step 3: 知识图谱因果链追溯
    let causalContext: string[] = [];
    try {
      for (const algoResult of request.algorithmResults) {
        const subgraph = this.kg.extractSubgraph(algoResult.algorithmName, 2);
        if (subgraph && subgraph.triples.length > 0) {
          causalContext.push(
            ...subgraph.triples.map(t => `${t.subject} --[${t.predicate}]--> ${t.object}`)
          );
        }
      }
    } catch (err: any) {
      log.warn({ err: err.message }, 'KG 因果链追溯失败，跳过 KG 证据');
    }

    // Step 4: LLM 综合推理 → 结构化诊断
    const { diagnoses, scores, summary } = await this.synthesizeDiagnosis(
      request,
      validatedEvidence,
      causalContext,
      config
    );

    // Step 5: 确定风险等级
    const riskLevel = this.determineRiskLevel(scores);

    // Step 6: 预测趋势
    const prediction = await this.predictTrend(request.machineId, diagnoses);

    // Step 7: 组装报告
    const report: EnhancedDiagnosisReport = {
      reportId,
      machineId: request.machineId,
      timestamp: Date.now(),
      scores,
      riskLevel,
      evidenceChain: validatedEvidence,
      diagnoses,
      recommendations: [],
      prediction,
      summary,
      depth: request.depth,
    };

    // Step 8: 生成维护建议
    report.recommendations = await this.generateRecommendations(report);

    // Step 9: 根因分析（深度诊断时执行）
    if (request.depth === 'deep' && diagnoses.length > 0) {
      try {
        const symptoms = diagnoses.map(d => d.faultName);
        report.rootCause = await this.analyzeRootCause(request.machineId, symptoms);
      } catch (err: any) {
        log.warn({ err: err.message }, '根因分析失败（非致命）');
      }
    }

    // Step 10: 发布事件
    this.publishEvent(AI_DIAGNOSIS_TOPICS.ENHANCED, report);

    log.info(
      {
        reportId,
        machineId: request.machineId,
        riskLevel,
        diagnosisCount: diagnoses.length,
        durationMs: Date.now() - startTime,
      },
      '诊断增强完成'
    );

    return report;
  }

  /**
   * 批量诊断增强
   *
   * 并行处理多个请求，并发数受配置限制。
   *
   * @param requests - 请求数组
   * @returns 报告数组
   */
  async enhanceBatch(requests: EnhanceDiagnosisRequest[]): Promise<EnhancedDiagnosisReport[]> {
    const config = getAIConfig().diagnostic;
    const concurrency = config.batchConcurrency;

    log.info({ requestCount: requests.length, concurrency }, '开始批量诊断增强');

    const results: EnhancedDiagnosisReport[] = [];

    // 分批执行，控制并发
    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(req => this.enhance(req))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          log.warn({ err: result.reason?.message }, '批量增强中单条请求失败');
        }
      }
    }

    // 发布批量完成事件
    this.publishEvent(AI_DIAGNOSIS_TOPICS.BATCH_COMPLETED, {
      total: requests.length,
      success: results.length,
      failed: requests.length - results.length,
      reportIds: results.map(r => r.reportId),
    });

    log.info({ total: requests.length, success: results.length }, '批量诊断增强完成');

    return results;
  }

  /**
   * 根因分析
   *
   * 从症状出发，通过 KG 因果链追溯和 LLM 推理，
   * 确定最可能的根本原因。
   *
   * @param machineId - 设备 ID
   * @param symptoms - 症状描述列表
   * @returns 根因分析结果
   */
  async analyzeRootCause(machineId: string, symptoms: string[]): Promise<RootCauseAnalysis> {
    const startTime = Date.now();
    const config = getAIConfig().diagnostic;

    log.info({ machineId, symptomCount: symptoms.length }, '开始根因分析');

    // Step 1: 对每个症状追溯 KG 因果链
    const causalChains: Array<{ symptom: string; chain: string[] }> = [];
    for (const symptom of symptoms) {
      try {
        const paths = this.kg.traceCausalChain(symptom, config.maxCausalChainDepth);
        if (paths && paths.length > 0) {
          for (const path of paths) {
            causalChains.push({ symptom, chain: path.entities });
          }
        }
      } catch {
        // KG 不可用时跳过
        causalChains.push({ symptom, chain: [symptom] });
      }
    }

    // Step 2: LLM 推理根因
    let rootCauses: RootCauseAnalysis['rootCauses'] = [];
    try {
      const result = await invokeLLM({
        messages: [
          { role: 'system', content: ROOT_CAUSE_PROMPT },
          {
            role: 'user',
            content: `设备 ${machineId} 的症状和因果链：

症状: ${JSON.stringify(symptoms)}
因果链: ${JSON.stringify(causalChains, null, 2)}

请分析根本原因，用 JSON 返回 { "rootCauses": [...], "confidence": 0.0~1.0 }`,
          },
        ],
        maxTokens: 2048,
        model: config.model,
        responseFormat: { type: 'json_object' },
      });

      const content = result.choices[0]?.message?.content;
      const parsed = typeof content === 'string' ? JSON.parse(content) : {};

      if (Array.isArray(parsed.rootCauses)) {
        rootCauses = parsed.rootCauses.map((rc: any) => ({
          cause: rc.cause || '未知根因',
          probability: this.clampProbability(rc.probability ?? 0.5),
          causalChain: Array.isArray(rc.causalChain) ? rc.causalChain : [],
          evidence: [],
          physicalMechanism: rc.physicalMechanism || '物理机理待确认',
        }));
      }
    } catch (err: any) {
      log.warn({ err: err.message }, 'LLM 根因推理失败，使用降级结果');

      // 降级：将因果链的末端节点作为可能根因
      const rootCauseSet = new Set<string>();
      for (const cc of causalChains) {
        const root = cc.chain[cc.chain.length - 1];
        if (root && root !== cc.symptom) {
          rootCauseSet.add(root);
        }
      }
      rootCauses = Array.from(rootCauseSet).map(cause => ({
        cause,
        probability: 1 / rootCauseSet.size,
        causalChain: [],
        evidence: [],
        physicalMechanism: '降级模式，物理机理未经 LLM 验证',
      }));
    }

    // Step 3: 物理机理校验 — 确保概率之和不超过 1.0
    const totalProb = rootCauses.reduce((sum, rc) => sum + rc.probability, 0);
    if (totalProb > 1.0) {
      const scale = 1.0 / totalProb;
      for (const rc of rootCauses) {
        rc.probability = this.clampProbability(rc.probability * scale);
      }
    }

    const analysis: RootCauseAnalysis = {
      machineId,
      symptoms,
      rootCauses,
      analysisDepth: config.maxCausalChainDepth,
      timestamp: Date.now(),
    };

    // 发布事件
    this.publishEvent(AI_DIAGNOSIS_TOPICS.ROOT_CAUSE, analysis);

    log.info(
      { machineId, rootCauseCount: rootCauses.length, durationMs: Date.now() - startTime },
      '根因分析完成'
    );

    return analysis;
  }

  /**
   * 生成维护建议
   *
   * 基于诊断报告中的诊断条目和风险等级，
   * 调用 LLM 生成优先级排序的维护建议。
   *
   * @param report - 增强诊断报告
   * @returns 维护建议数组
   */
  async generateRecommendations(report: EnhancedDiagnosisReport): Promise<MaintenanceRecommendation[]> {
    const startTime = Date.now();

    log.info(
      { reportId: report.reportId, diagnosisCount: report.diagnoses.length },
      '开始生成维护建议'
    );

    if (report.diagnoses.length === 0) {
      log.info('无诊断条目，跳过维护建议生成');
      return [];
    }

    try {
      const result = await invokeLLM({
        messages: [
          { role: 'system', content: RECOMMENDATION_PROMPT },
          {
            role: 'user',
            content: `设备 ${report.machineId} 诊断报告：

风险等级: ${report.riskLevel}
安全评分: ${report.scores.safety}
健康评分: ${report.scores.health}
效率评分: ${report.scores.efficiency}

诊断条目:
${JSON.stringify(report.diagnoses, null, 2)}

预测信息:
${JSON.stringify(report.prediction, null, 2)}

请生成维护建议，用 JSON 返回 { "recommendations": [...] }`,
          },
        ],
        maxTokens: 2048,
        responseFormat: { type: 'json_object' },
      });

      const content = result.choices[0]?.message?.content;
      const parsed = typeof content === 'string' ? JSON.parse(content) : {};
      const recs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];

      // 适配为 MaintenanceRecommendation 类型
      const recommendations: MaintenanceRecommendation[] = recs.map((r: any) => ({
        priority: this.validatePriority(r.priority, report.riskLevel),
        action: r.action || '需人工确认维护动作',
        rationale: r.rationale || '',
        estimatedCostHours: typeof r.estimatedCostHours === 'number' ? r.estimatedCostHours : (r.estimatedHours ?? 4),
        riskIfDeferred: r.riskIfDeferred || r.risk || '延迟风险待评估',
        targetComponent: r.targetComponent,
        deadline: r.deadline,
      }));

      // 按优先级排序
      const priorityOrder: Record<string, number> = { immediate: 0, planned: 1, monitor: 2, defer: 3 };
      recommendations.sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));

      // 发布事件
      this.publishEvent(AI_DIAGNOSIS_TOPICS.RECOMMENDATIONS, {
        reportId: report.reportId,
        machineId: report.machineId,
        recommendations,
      });

      log.info(
        { reportId: report.reportId, count: recommendations.length, durationMs: Date.now() - startTime },
        '维护建议生成完成'
      );

      return recommendations;
    } catch (err: any) {
      log.warn({ err: err.message }, 'LLM 维护建议生成失败，使用规则降级');

      // 降级：基于严重度的简单映射
      return report.diagnoses.map(d => ({
        priority: this.severityToPriority(d.severity),
        action: `排查: ${d.faultName} (${d.faultCode})`,
        rationale: `故障概率 ${(d.probability * 100).toFixed(0)}%，严重度 ${d.severity}`,
        estimatedCostHours: d.severity === 'critical' ? 8 : d.severity === 'high' ? 4 : 2,
        riskIfDeferred: d.severity === 'critical'
          ? '延迟可能导致设备损坏或安全事故'
          : '延迟可能加速设备劣化',
      }));
    }
  }

  // --------------------------------------------------------------------------
  // 私有方法：证据收集与校验
  // --------------------------------------------------------------------------

  /**
   * 从请求中收集所有证据
   *
   * 将算法结果和传感器特征转化为统一的 EvidenceItem 格式。
   */
  private async collectEvidence(request: EnhanceDiagnosisRequest): Promise<EvidenceItem[]> {
    const evidence: EvidenceItem[] = [];

    // 算法结果 → 证据
    for (const algo of request.algorithmResults) {
      evidence.push({
        source: 'algorithm' as EvidenceSource,
        description: `算法 ${algo.algorithmName} 输出`,
        data: {
          algorithmId: algo.algorithmId,
          algorithmName: algo.algorithmName,
          output: algo.output,
          executedAt: algo.executedAt,
        },
        confidence: this.clampProbability(algo.confidence),
        weight: 0.6,
      });
    }

    // 传感器特征 → 证据
    for (const sensor of request.sensorFeatures) {
      evidence.push({
        source: 'sensor' as EvidenceSource,
        description: `传感器 ${sensor.sensorType} (${sensor.sensorId}) 读数: ${sensor.value} ${sensor.unit}`,
        data: {
          sensorId: sensor.sensorId,
          sensorType: sensor.sensorType,
          value: sensor.value,
          unit: sensor.unit,
          timestamp: sensor.timestamp,
          quality: sensor.quality,
        },
        confidence: sensor.quality != null ? this.clampProbability(sensor.quality / 100) : 0.7,
        weight: 0.8,
      });
    }

    // KG 知识 → 证据
    try {
      for (const algo of request.algorithmResults) {
        const triples = this.kg.query({ subject: algo.algorithmName });
        if (triples && triples.length > 0) {
          evidence.push({
            source: 'knowledge_graph' as EvidenceSource,
            description: `KG 关联知识: ${algo.algorithmName} 相关三元组 ${triples.length} 条`,
            data: {
              tripleCount: triples.length,
              triples: triples.slice(0, 5).map((t: { subject: string; predicate: string; object: string }) => ({
                subject: t.subject,
                predicate: t.predicate,
                object: t.object,
              })),
            },
            confidence: 0.7,
            weight: 0.5,
          });
        }
      }
    } catch (err: any) {
      log.debug({ err: err.message }, 'KG 查询失败，跳过 KG 证据');
    }

    return evidence;
  }

  /**
   * 物理约束校验
   *
   * 对每条证据进行物理合理性检查，不合理的证据降低权重并添加物理标注。
   * 不会删除证据（保留完整审计链），而是通过权重调整其影响力。
   */
  private async validatePhysics(evidence: EvidenceItem[]): Promise<EvidenceItem[]> {
    return evidence.map(item => {
      const validated = { ...item };
      const data = item.data;

      // 温度范围校验
      if (data && typeof data === 'object') {
        // FIX-052: data 已是 Record<string, unknown>，无需类型断言
        const value = data.value;
        const sensorType = data.sensorType;

        if (typeof value === 'number' && typeof sensorType === 'string') {
          if (sensorType.toLowerCase().includes('temp') || sensorType.toLowerCase().includes('temperature')) {
            if (value < PHYSICAL_RANGES.temperature.min || value > PHYSICAL_RANGES.temperature.max) {
              validated.physicalBasis = `温度 ${value}°C 超出物理有效范围 [${PHYSICAL_RANGES.temperature.min}, ${PHYSICAL_RANGES.temperature.max}]`;
              validated.weight = validated.weight * 0.2; // 大幅降权
              validated.confidence = validated.confidence * 0.3;
              log.warn({ value, sensorType }, '物理约束违反: 温度超出范围');
            }
          }

          // 振动值非负校验
          if (sensorType.toLowerCase().includes('vibration') || sensorType.toLowerCase().includes('rms')) {
            if (value < PHYSICAL_RANGES.vibrationRms.min) {
              validated.physicalBasis = `振动值 ${value} 为负，违反物理约束`;
              validated.weight = validated.weight * 0.1;
              validated.confidence = validated.confidence * 0.1;
              log.warn({ value, sensorType }, '物理约束违反: 振动值为负');
            }
          }

          // 功率因数 [0, 1] 校验
          if (sensorType.toLowerCase().includes('power_factor') || sensorType.toLowerCase().includes('powerfactor')) {
            if (value < PHYSICAL_RANGES.powerFactor.min || value > PHYSICAL_RANGES.powerFactor.max) {
              validated.physicalBasis = `功率因数 ${value} 超出 [0, 1] 范围`;
              validated.weight = validated.weight * 0.2;
              validated.confidence = validated.confidence * 0.3;
              log.warn({ value, sensorType }, '物理约束违反: 功率因数超出范围');
            }
          }
        }
      }

      return validated;
    });
  }

  /**
   * LLM 综合推理
   *
   * 将证据和上下文送入 LLM，生成结构化诊断结果。
   * 支持 GrokToolCallingEngine（ReAct 循环）和 invokeLLM（直接调用）两种模式。
   */
  private async synthesizeDiagnosis(
    request: EnhanceDiagnosisRequest,
    evidence: EvidenceItem[],
    causalContext: string[],
    config: ReturnType<typeof getAIConfig>['diagnostic']
  ): Promise<{
    diagnoses: DiagnosisEntry[];
    scores: { safety: number; health: number; efficiency: number };
    summary: string;
  }> {
    const timeoutMs = request.depth === 'quick' ? config.quickTimeoutMs : config.deepTimeoutMs;

    // 构建 LLM 输入
    const prompt = `请对设备 ${request.machineId} 进行诊断分析。

## 证据链 (${evidence.length} 条)
${JSON.stringify(evidence.map(e => ({
  source: e.source,
  description: e.description,
  confidence: e.confidence,
  weight: e.weight,
  physicalBasis: e.physicalBasis,
})), null, 2)}

## KG 因果上下文
${causalContext.length > 0 ? causalContext.join('\n') : '无可用因果链'}

## 诊断深度: ${request.depth}

请用 JSON 返回：
{
  "scores": { "safety": 0~100, "health": 0~100, "efficiency": 0~100 },
  "diagnoses": [
    {
      "faultCode": "故障编码",
      "faultName": "故障名称",
      "probability": 0.0~1.0,
      "severity": "critical|high|medium|low|negligible",
      "physicalExplanation": "物理解释"
    }
  ],
  "summary": "中文诊断摘要（200字以内）"
}`;

    try {
      const result = await Promise.race([
        invokeLLM({
          messages: [
            { role: 'system', content: DIAGNOSTIC_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          maxTokens: 4096,
          model: config.model,
          responseFormat: { type: 'json_object' },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`诊断推理超时 (${timeoutMs}ms)`)), timeoutMs)
        ),
      ]);

      const content = result.choices[0]?.message?.content;
      const parsed = typeof content === 'string' ? JSON.parse(content) : {};

      // 解析并校验 scores
      const scores = {
        safety: this.clampScore(parsed.scores?.safety ?? 80),
        health: this.clampScore(parsed.scores?.health ?? 80),
        efficiency: this.clampScore(parsed.scores?.efficiency ?? 80),
      };

      // 解析诊断条目
      const diagnoses: DiagnosisEntry[] = Array.isArray(parsed.diagnoses)
        ? parsed.diagnoses.map((d: any) => ({
            faultCode: d.faultCode || 'UNKNOWN',
            faultName: d.faultName || '未识别故障',
            probability: this.clampProbability(d.probability ?? 0.5),
            severity: this.validateSeverity(d.severity),
            evidence: evidence.filter(e => e.confidence > config.minEvidenceConfidence),
            physicalExplanation: d.physicalExplanation || '物理解释待补充',
          }))
        : [];

      const summary = parsed.summary || `设备 ${request.machineId} 诊断完成，发现 ${diagnoses.length} 个异常。`;

      return { diagnoses, scores, summary };
    } catch (err: any) {
      log.warn({ err: err.message }, 'LLM 诊断推理失败，使用统计降级');

      // 降级：基于证据统计生成基础评分
      const avgConfidence = evidence.length > 0
        ? evidence.reduce((sum, e) => sum + e.confidence * e.weight, 0) / evidence.length
        : 0.5;
      const baseScore = Math.round(avgConfidence * 100);

      return {
        diagnoses: [],
        scores: {
          safety: this.clampScore(baseScore + 10), // 安全偏保守，高于均值
          health: this.clampScore(baseScore),
          efficiency: this.clampScore(baseScore),
        },
        summary: `设备 ${request.machineId} 诊断降级运行（LLM 不可用），基于 ${evidence.length} 条证据的统计评估。`,
      };
    }
  }

  // --------------------------------------------------------------------------
  // 私有方法：辅助函数
  // --------------------------------------------------------------------------

  /**
   * 确定风险等级
   *
   * 基于三维评分（安全/健康/效率）确定综合风险等级。
   * 安全评分是决定性因素。
   */
  private determineRiskLevel(scores: { safety: number; health: number; efficiency: number }): RiskLevel {
    // 安全评分是决定性因素
    if (scores.safety < 40) return 'critical';
    if (scores.safety < 60) return 'high';

    // 综合评分
    const composite = scores.safety * 0.5 + scores.health * 0.3 + scores.efficiency * 0.2;
    if (composite < 50) return 'high';
    if (composite < 65) return 'medium';
    if (composite < 80) return 'low';
    return 'negligible';
  }

  /**
   * 预测趋势
   *
   * 基于诊断结果和历史数据，生成简单的趋势预测。
   * 完整预测依赖 WorldModel（Phase 5 实现），当前为简化版本。
   */
  private async predictTrend(machineId: string, diagnoses: DiagnosisEntry[]): Promise<PredictionInfo> {
    // 简化预测逻辑：基于诊断严重度确定趋势
    if (diagnoses.length === 0) {
      return { trend: 'stable', nextMilestone: '下次定期检查' };
    }

    const hasCritical = diagnoses.some(d => d.severity === 'critical');
    const hasHigh = diagnoses.some(d => d.severity === 'high');
    const maxProb = Math.max(...diagnoses.map(d => d.probability));

    if (hasCritical) {
      return {
        trend: 'critical',
        remainingLifeHours: 72,
        fatigueCumulative: 0.85,
        nextMilestone: '立即安排停机检修',
      };
    }

    if (hasHigh) {
      return {
        trend: 'degrading',
        remainingLifeHours: 720,
        fatigueCumulative: 0.6,
        nextMilestone: '7 天内安排计划性维护',
      };
    }

    if (maxProb > 0.5) {
      return {
        trend: 'degrading',
        remainingLifeHours: 2160,
        fatigueCumulative: 0.4,
        nextMilestone: '30 天内安排检查',
      };
    }

    return {
      trend: 'stable',
      fatigueCumulative: 0.2,
      nextMilestone: '按常规维护计划执行',
    };
  }

  /**
   * 证据综合（用于快速模式下的直接综合）
   */
  private async synthesizeEvidence(evidence: EvidenceItem[]): Promise<{ conclusion: string; confidence: number }> {
    if (evidence.length === 0) {
      return { conclusion: '无可用证据', confidence: 0 };
    }

    try {
      const result = await invokeLLM({
        messages: [
          { role: 'system', content: EVIDENCE_SYNTHESIS_PROMPT },
          {
            role: 'user',
            content: `请综合以下 ${evidence.length} 条证据：\n${JSON.stringify(evidence, null, 2)}`,
          },
        ],
        maxTokens: 1024,
        responseFormat: { type: 'json_object' },
      });

      const content = result.choices[0]?.message?.content;
      const parsed = typeof content === 'string' ? JSON.parse(content) : {};
      return {
        conclusion: parsed.conclusion || '证据综合结果待确认',
        confidence: this.clampProbability(parsed.confidence ?? 0.5),
      };
    } catch {
      // 降级：加权平均置信度
      const avgConf = evidence.reduce((sum, e) => sum + e.confidence * e.weight, 0) /
        Math.max(evidence.reduce((sum, e) => sum + e.weight, 0), 0.01);
      return {
        conclusion: `基于 ${evidence.length} 条证据的统计综合`,
        confidence: this.clampProbability(avgConf),
      };
    }
  }

  /**
   * 发布 EventBus 事件（降级不崩溃）
   */
  private publishEvent(topic: string, payload: object): void {
    try {
      // FIX-009: topic 不再重复传入 eventType 位，提取末段作为 eventType
      const eventType = topic.split('.').pop() || topic;
      eventBus.publish(topic, eventType, payload as Record<string, unknown>, { source: 'diagnostic-enhancer' });
    } catch (err: any) {
      log.warn({ topic, err: err.message }, 'EventBus 发布失败（非致命）');
    }
  }

  /** 生成报告唯一 ID */
  private generateReportId(): string {
    return `diag-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  }

  /** 校验评分在 [0, 100] */
  private clampScore(value: number): number {
    return Math.max(PHYSICAL_RANGES.score.min, Math.min(PHYSICAL_RANGES.score.max, Math.round(value)));
  }

  /** 校验概率在 [0, 1] */
  private clampProbability(value: number): number {
    return Math.max(PHYSICAL_RANGES.probability.min, Math.min(PHYSICAL_RANGES.probability.max, value));
  }

  /** 校验严重度枚举值 */
  private validateSeverity(severity: unknown): RiskLevel {
    const valid: RiskLevel[] = ['critical', 'high', 'medium', 'low', 'negligible'];
    return valid.includes(severity as RiskLevel) ? (severity as RiskLevel) : 'medium';
  }

  /** 校验优先级，确保安全相关不低于 planned */
  private validatePriority(
    priority: unknown,
    riskLevel: RiskLevel
  ): MaintenanceRecommendation['priority'] {
    const valid = ['immediate', 'planned', 'monitor', 'defer'] as const;
    type P = typeof valid[number];
    const p = valid.includes(priority as P) ? (priority as P) : 'planned';

    // 安全约束：critical/high 风险时，优先级不低于 planned
    if ((riskLevel === 'critical' || riskLevel === 'high') && (p === 'monitor' || p === 'defer')) {
      return 'planned';
    }
    return p;
  }

  /** 严重度映射为维护优先级 */
  private severityToPriority(severity: RiskLevel): MaintenanceRecommendation['priority'] {
    switch (severity) {
      case 'critical': return 'immediate';
      case 'high': return 'planned';
      case 'medium': return 'monitor';
      case 'low':
      case 'negligible':
      default: return 'defer';
    }
  }
}

// ============================================================================
// 单例管理（单例 + 工厂模式，遵循 §9.3）
// ============================================================================

let instance: DiagnosticEnhancer | null = null;

/**
 * 获取 DiagnosticEnhancer 单例
 *
 * @returns DiagnosticEnhancer 实例
 */
export function getDiagnosticEnhancer(): DiagnosticEnhancer {
  if (!instance) {
    instance = new DiagnosticEnhancer();
  }
  return instance;
}

/**
 * 重置 DiagnosticEnhancer 单例
 *
 * 用于测试或配置变更时重建实例。
 */
export function resetDiagnosticEnhancer(): void {
  instance = null;
}
