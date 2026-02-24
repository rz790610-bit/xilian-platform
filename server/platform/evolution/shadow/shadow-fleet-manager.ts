/**
 * ============================================================================
 * Shadow Fleet Manager (E20-E22)
 * ============================================================================
 *
 * 借鉴 FSD Shadow Mode 核心理念：
 *   - 全流量镜像：生产请求同步发送到影子模型，不影响生产输出
 *   - 轨迹差异采集：记录人类决策 vs 影子决策的完整轨迹
 *   - 自动难例挖掘：divergence > 阈值的案例自动标记为难例
 *   - 干预记录持久化：所有干预写入 evolution_interventions 表
 *
 * 架构：
 *   ┌─────────────────────────────────────────────────────┐
 *   │                  Production Request                  │
 *   │                        │                             │
 *   │              ┌─────────┴─────────┐                  │
 *   │              │                   │                   │
 *   │      ┌───────▼───────┐   ┌──────▼───────┐          │
 *   │      │  Production   │   │   Shadow     │          │
 *   │      │  Model        │   │   Model      │          │
 *   │      └───────┬───────┘   └──────┬───────┘          │
 *   │              │                   │                   │
 *   │              └─────────┬─────────┘                  │
 *   │                        │                             │
 *   │              ┌────────▼────────┐                    │
 *   │              │ Divergence      │                    │
 *   │              │ Analyzer        │                    │
 *   │              └────────┬────────┘                    │
 *   │                       │                              │
 *   │         ┌─────────────┼─────────────┐               │
 *   │         │             │             │                │
 *   │    DB Persist    EventBus      Hard-Case            │
 *   │                               Mining                │
 *   └─────────────────────────────────────────────────────┘
 */

import { getDb } from '../../../lib/db';
import {
  evolutionInterventions,
  evolutionVideoTrajectories,
  edgeCases,
} from '../../../../drizzle/evolution-schema';
import { eq, desc, gte, count, sql } from 'drizzle-orm';
import { EventBus } from '../../events/event-bus';
import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('shadow-fleet-manager');

// ============================================================================
// 类型定义
// ============================================================================

export interface ShadowFleetConfig {
  /** 是否启用影子模式 */
  enabled: boolean;
  /** 镜像流量百分比 (0-100) */
  mirrorPercentage: number;
  /** 最大并发影子请求数 */
  maxConcurrentShadows: number;
  /** 轨迹保留天数 */
  trajectoryRetentionDays: number;
  /** 干预阈值 (divergence > 此值视为干预) */
  interventionThreshold: number;
  /** 难例 divergence 阈值 */
  hardCaseThreshold: number;
  /** 影子模型超时 (ms) */
  shadowTimeoutMs: number;
  /** 是否记录视频轨迹 */
  enableVideoTrajectory: boolean;
}

export interface PlatformRequest {
  requestId: string;
  deviceId: string;
  timestamp: number;
  inputFeatures: Record<string, number>;
  context: Record<string, unknown>;
  requestType: 'prediction' | 'diagnosis' | 'anomaly_detection' | 'optimization';
}

export interface DecisionOutput {
  modelId: string;
  modelVersion: string;
  decision: Record<string, unknown>;
  confidence: number;
  latencyMs: number;
  features: number[];
  metadata: Record<string, unknown>;
}

export interface ShadowTrajectory {
  sessionId: string;
  requestId: string;
  deviceId: string;
  timestamp: number;
  request: PlatformRequest;
  productionDecision: DecisionOutput;
  shadowDecision: DecisionOutput;
  divergenceScore: number;
  divergenceDetails: DivergenceDetails;
  isIntervention: boolean;
  isHardCase: boolean;
}

export interface DivergenceDetails {
  /** 决策级别差异 */
  decisionDivergence: number;
  /** 置信度差异 */
  confidenceDivergence: number;
  /** 特征空间距离 (余弦距离) */
  featureSpaceDistance: number;
  /** 各维度差异明细 */
  dimensionDiffs: Record<string, number>;
  /** 差异类型 */
  divergenceType: 'none' | 'minor' | 'significant' | 'critical';
}

export interface ShadowResult {
  trajectory: ShadowTrajectory | null;
  divergence: number;
  isIntervention: boolean;
  isHardCase: boolean;
  shadowLatencyMs: number;
}

export interface ShadowFleetStats {
  totalRequests: number;
  totalInterventions: number;
  interventionRate: number;
  inverseMileage: number;
  fsdStyle: string;
  totalHardCases: number;
  avgDivergence: number;
  avgShadowLatency: number;
  activeShadowModels: number;
}

// ============================================================================
// 影子模型接口（由 WorldModel 或 ModelRegistry 实现）
// ============================================================================

export interface ShadowModelProvider {
  /** 获取当前活跃的影子模型 ID */
  getActiveShadowModelId(): Promise<string>;
  /** 获取影子模型版本 */
  getActiveShadowModelVersion(): Promise<string>;
  /** 使用影子模型预测 */
  predict(request: PlatformRequest): Promise<DecisionOutput>;
  /** 使用生产模型预测 */
  predictProduction(request: PlatformRequest): Promise<DecisionOutput>;
}

// ============================================================================
// Prometheus 指标
// ============================================================================

class ShadowFleetMetrics {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histogramData = new Map<string, number[]>();

  inc(name: string, labels: Record<string, string> = {}, value = 1): void {
    const key = `${name}${JSON.stringify(labels)}`;
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  set(name: string, labels: Record<string, string> = {}, value: number): void {
    const key = `${name}${JSON.stringify(labels)}`;
    this.gauges.set(key, value);
  }

  observe(name: string, value: number): void {
    const arr = this.histogramData.get(name) || [];
    arr.push(value);
    if (arr.length > 5000) arr.shift();
    this.histogramData.set(name, arr);
  }

  getAvg(name: string): number {
    const arr = this.histogramData.get(name) || [];
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  getAll(): Record<string, number> {
    const result: Record<string, number> = {};
    this.counters.forEach((v, k) => { result[`counter_${k}`] = v; });
    this.gauges.forEach((v, k) => { result[`gauge_${k}`] = v; });
    return result;
  }
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: ShadowFleetConfig = {
  enabled: true,
  mirrorPercentage: 100,
  maxConcurrentShadows: 50,
  trajectoryRetentionDays: 30,
  interventionThreshold: 0.15,
  hardCaseThreshold: 0.35,
  shadowTimeoutMs: 5000,
  enableVideoTrajectory: true,
};

// ============================================================================
// Shadow Fleet Manager
// ============================================================================

export class ShadowFleetManager {
  private config: ShadowFleetConfig;
  private modelProvider: ShadowModelProvider;
  private eventBus: EventBus;
  private metrics = new ShadowFleetMetrics();

  /** 并发控制信号量 */
  private activeShadows = 0;

  /** 内存中的最近轨迹缓存（用于实时统计） */
  private recentTrajectories: ShadowTrajectory[] = [];
  private readonly MAX_RECENT_CACHE = 1000;

  constructor(
    modelProvider: ShadowModelProvider,
    config: Partial<ShadowFleetConfig> = {},
    eventBus?: EventBus,
  ) {
    this.modelProvider = modelProvider;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventBus = eventBus || new EventBus();
  }

  // ==========================================================================
  // 1. 核心：镜像请求
  // ==========================================================================

  async mirrorRequest(request: PlatformRequest): Promise<ShadowResult> {
    if (!this.config.enabled) {
      return { trajectory: null, divergence: 0, isIntervention: false, isHardCase: false, shadowLatencyMs: 0 };
    }

    // 采样控制
    if (this.config.mirrorPercentage < 100 && Math.random() * 100 > this.config.mirrorPercentage) {
      return { trajectory: null, divergence: 0, isIntervention: false, isHardCase: false, shadowLatencyMs: 0 };
    }

    // 并发控制
    if (this.activeShadows >= this.config.maxConcurrentShadows) {
      this.metrics.inc('shadow_rejected_total', { reason: 'concurrency_limit' });
      log.warn(`影子并发已满 (${this.activeShadows}/${this.config.maxConcurrentShadows})，跳过`);
      return { trajectory: null, divergence: 0, isIntervention: false, isHardCase: false, shadowLatencyMs: 0 };
    }

    this.activeShadows++;
    this.metrics.inc('shadow_requests_total');
    const shadowStart = Date.now();

    try {
      // 并行执行生产模型和影子模型
      const [productionDecision, shadowDecision] = await Promise.all([
        this.modelProvider.predictProduction(request),
        this.executeShadowWithTimeout(request),
      ]);

      const shadowLatencyMs = Date.now() - shadowStart;
      this.metrics.observe('shadow_latency_ms', shadowLatencyMs);

      // 计算差异
      const divergenceDetails = this.computeDivergence(productionDecision, shadowDecision);
      const divergenceScore = this.aggregateDivergence(divergenceDetails);

      // 判断是否为干预
      const isIntervention = divergenceScore > this.config.interventionThreshold;
      const isHardCase = divergenceScore > this.config.hardCaseThreshold;

      // 构建轨迹
      const trajectory: ShadowTrajectory = {
        sessionId: crypto.randomUUID(),
        requestId: request.requestId,
        deviceId: request.deviceId,
        timestamp: Date.now(),
        request,
        productionDecision,
        shadowDecision,
        divergenceScore,
        divergenceDetails,
        isIntervention,
        isHardCase,
      };

      // 缓存
      this.cacheTrajectory(trajectory);

      // 异步持久化（不阻塞主流程）
      this.persistTrajectoryAsync(trajectory).catch(err => {
        log.error('轨迹持久化失败', err);
      });

      // Prometheus
      this.metrics.set('shadow_divergence_current', {}, divergenceScore);
      if (isIntervention) {
        this.metrics.inc('shadow_interventions_total', { modelId: shadowDecision.modelId });
      }
      if (isHardCase) {
        this.metrics.inc('shadow_hard_cases_total');
      }

      // EventBus
      if (isIntervention) {
        await this.eventBus.publish({
          type: 'shadow.intervention.detected',
          source: 'shadow-fleet-manager',
          data: {
            sessionId: trajectory.sessionId,
            divergenceScore,
            divergenceType: divergenceDetails.divergenceType,
            deviceId: request.deviceId,
          },
        });
      }

      if (isHardCase) {
        await this.eventBus.publish({
          type: 'shadow.hard_case.discovered',
          source: 'shadow-fleet-manager',
          data: {
            sessionId: trajectory.sessionId,
            divergenceScore,
            deviceId: request.deviceId,
          },
        });
      }

      return { trajectory, divergence: divergenceScore, isIntervention, isHardCase, shadowLatencyMs };
    } catch (error) {
      this.metrics.inc('shadow_errors_total');
      log.error('影子镜像请求失败', error);
      return { trajectory: null, divergence: 0, isIntervention: false, isHardCase: false, shadowLatencyMs: Date.now() - shadowStart };
    } finally {
      this.activeShadows--;
    }
  }

  // ==========================================================================
  // 2. 差异计算引擎
  // ==========================================================================

  private computeDivergence(production: DecisionOutput, shadow: DecisionOutput): DivergenceDetails {
    // 2a. 决策级别差异
    const decisionDivergence = this.computeDecisionDivergence(production.decision, shadow.decision);

    // 2b. 置信度差异
    const confidenceDivergence = Math.abs(production.confidence - shadow.confidence);

    // 2c. 特征空间余弦距离
    const featureSpaceDistance = this.cosineDistance(production.features, shadow.features);

    // 2d. 各维度差异明细
    const dimensionDiffs: Record<string, number> = {};
    const allKeys = new Set([...Object.keys(production.decision), ...Object.keys(shadow.decision)]);
    for (const key of allKeys) {
      const pVal = production.decision[key];
      const sVal = shadow.decision[key];
      if (typeof pVal === 'number' && typeof sVal === 'number') {
        dimensionDiffs[key] = Math.abs(pVal - sVal);
      } else if (JSON.stringify(pVal) !== JSON.stringify(sVal)) {
        dimensionDiffs[key] = 1.0; // 非数值类型，不同则为 1
      } else {
        dimensionDiffs[key] = 0;
      }
    }

    // 差异类型分类
    const avgDiff = Object.values(dimensionDiffs).reduce((a, b) => a + b, 0) / Math.max(Object.keys(dimensionDiffs).length, 1);
    let divergenceType: DivergenceDetails['divergenceType'] = 'none';
    if (avgDiff > 0.5) divergenceType = 'critical';
    else if (avgDiff > 0.25) divergenceType = 'significant';
    else if (avgDiff > 0.05) divergenceType = 'minor';

    return {
      decisionDivergence,
      confidenceDivergence,
      featureSpaceDistance,
      dimensionDiffs,
      divergenceType,
    };
  }

  private computeDecisionDivergence(prod: Record<string, unknown>, shadow: Record<string, unknown>): number {
    const prodStr = JSON.stringify(prod, Object.keys(prod).sort());
    const shadowStr = JSON.stringify(shadow, Object.keys(shadow).sort());

    if (prodStr === shadowStr) return 0;

    // 计算结构化差异比例
    const allKeys = new Set([...Object.keys(prod), ...Object.keys(shadow)]);
    let diffCount = 0;
    for (const key of allKeys) {
      if (JSON.stringify(prod[key]) !== JSON.stringify(shadow[key])) {
        diffCount++;
      }
    }
    return allKeys.size > 0 ? diffCount / allKeys.size : 0;
  }

  private cosineDistance(a: number[], b: number[]): number {
    if (!a || !b || a.length === 0 || b.length === 0) return 1.0;

    const minLen = Math.min(a.length, b.length);
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < minLen; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 1.0;

    const cosineSimilarity = dotProduct / denom;
    return 1 - Math.max(-1, Math.min(1, cosineSimilarity)); // cosine distance
  }

  private aggregateDivergence(details: DivergenceDetails): number {
    // 加权聚合：决策差异 50%，置信度差异 20%，特征空间距离 30%
    return (
      details.decisionDivergence * 0.5 +
      details.confidenceDivergence * 0.2 +
      details.featureSpaceDistance * 0.3
    );
  }

  // ==========================================================================
  // 3. 影子模型执行（带超时）
  // ==========================================================================

  private async executeShadowWithTimeout(request: PlatformRequest): Promise<DecisionOutput> {
    return new Promise<DecisionOutput>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.metrics.inc('shadow_timeout_total');
        reject(new Error(`影子模型超时 (${this.config.shadowTimeoutMs}ms)`));
      }, this.config.shadowTimeoutMs);

      this.modelProvider.predict(request)
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  // ==========================================================================
  // 4. 异步持久化
  // ==========================================================================

  private async persistTrajectoryAsync(trajectory: ShadowTrajectory): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      // 4a. 写入干预记录表
      const result = await db.insert(evolutionInterventions).values({
        sessionId: trajectory.sessionId,
        modelId: trajectory.shadowDecision.modelId,
        modelVersion: trajectory.shadowDecision.modelVersion,
        requestId: trajectory.requestId,
        deviceId: trajectory.deviceId,
        interventionType: trajectory.isHardCase ? 'decision_diverge' : (trajectory.isIntervention ? 'threshold_breach' : 'decision_diverge'),
        divergenceScore: Math.round(trajectory.divergenceScore * 10000) / 10000,
        isIntervention: trajectory.isIntervention ? 1 : 0,
        requestData: trajectory.request,
        humanDecision: trajectory.productionDecision,
        shadowDecision: trajectory.shadowDecision,
        divergenceDetails: trajectory.divergenceDetails,
      });

      const interventionId = Number(result[0].insertId);

      // 4b. 如果是难例，写入 edge_cases 表
      if (trajectory.isHardCase) {
        await db.insert(edgeCases).values({
          cycleId: null,
          caseType: 'shadow_divergence',
          severity: trajectory.divergenceScore > 0.7 ? 'critical' : 'high',
          inputData: trajectory.request,
          expectedOutput: trajectory.productionDecision,
          actualOutput: trajectory.shadowDecision,
          divergenceScore: Math.round(trajectory.divergenceScore * 10000) / 10000,
          rootCause: `Shadow divergence: ${trajectory.divergenceDetails.divergenceType}`,
          status: 'discovered',
        });
      }

      // 4c. 如果启用视频轨迹，写入视频轨迹表
      if (this.config.enableVideoTrajectory && trajectory.isIntervention) {
        await db.insert(evolutionVideoTrajectories).values({
          interventionId,
          sessionId: trajectory.sessionId,
          sequenceIndex: 0,
          frameData: {
            productionFeatures: trajectory.productionDecision.features,
            shadowFeatures: trajectory.shadowDecision.features,
            inputFeatures: trajectory.request.inputFeatures,
          },
          embedding: trajectory.shadowDecision.features.slice(0, 128), // 截取前 128 维作为嵌入
          temporalRelations: {
            prevSessionId: null,
            nextSessionId: null,
            divergenceTimeline: [trajectory.divergenceScore],
          },
        });
      }

      log.debug(`轨迹已持久化: ${trajectory.sessionId}, divergence=${trajectory.divergenceScore.toFixed(4)}`);
    } catch (err) {
      log.error('轨迹持久化失败', err);
    }
  }

  // ==========================================================================
  // 5. 内存缓存管理
  // ==========================================================================

  private cacheTrajectory(trajectory: ShadowTrajectory): void {
    this.recentTrajectories.push(trajectory);
    if (this.recentTrajectories.length > this.MAX_RECENT_CACHE) {
      this.recentTrajectories = this.recentTrajectories.slice(-this.MAX_RECENT_CACHE);
    }
  }

  // ==========================================================================
  // 6. 统计查询
  // ==========================================================================

  async getStats(windowHours = 24): Promise<ShadowFleetStats> {
    const db = await getDb();
    if (!db) {
      return this.getInMemoryStats();
    }

    try {
      const windowStart = new Date(Date.now() - windowHours * 3600000);

      const [totalRows, interventionRows, hardCaseRows] = await Promise.all([
        db.select({ cnt: count() }).from(evolutionInterventions)
          .where(gte(evolutionInterventions.createdAt, windowStart)),
        db.select({ cnt: count() }).from(evolutionInterventions)
          .where(gte(evolutionInterventions.createdAt, windowStart)),
        db.select({ cnt: count() }).from(edgeCases)
          .where(gte(edgeCases.discoveredAt, windowStart)),
      ]);

      const total = totalRows[0]?.cnt ?? 0;
      // 查询实际干预数
      const intRows = await db.select({ cnt: count() }).from(evolutionInterventions)
        .where(gte(evolutionInterventions.createdAt, windowStart));
      const intFiltered = await db.select({ cnt: count() }).from(evolutionInterventions)
        .where(
          gte(evolutionInterventions.createdAt, windowStart),
        );

      const interventions = intFiltered[0]?.cnt ?? 0;
      const hardCases = hardCaseRows[0]?.cnt ?? 0;
      const rate = total > 0 ? interventions / total : 0;
      const inverseMileage = total > 0 ? Math.round(total / Math.max(interventions, 1)) : 9999;

      return {
        totalRequests: total,
        totalInterventions: interventions,
        interventionRate: rate,
        inverseMileage,
        fsdStyle: `1/${inverseMileage}`,
        totalHardCases: hardCases,
        avgDivergence: this.metrics.getAvg('shadow_divergence_current') || 0,
        avgShadowLatency: this.metrics.getAvg('shadow_latency_ms') || 0,
        activeShadowModels: 1,
      };
    } catch (err) {
      log.error('获取统计失败', err);
      return this.getInMemoryStats();
    }
  }

  private getInMemoryStats(): ShadowFleetStats {
    const total = this.recentTrajectories.length;
    const interventions = this.recentTrajectories.filter(t => t.isIntervention).length;
    const hardCases = this.recentTrajectories.filter(t => t.isHardCase).length;
    const rate = total > 0 ? interventions / total : 0;
    const inverseMileage = total > 0 ? Math.round(total / Math.max(interventions, 1)) : 9999;
    const avgDiv = total > 0
      ? this.recentTrajectories.reduce((s, t) => s + t.divergenceScore, 0) / total
      : 0;

    return {
      totalRequests: total,
      totalInterventions: interventions,
      interventionRate: rate,
      inverseMileage,
      fsdStyle: `1/${inverseMileage}`,
      totalHardCases: hardCases,
      avgDivergence: avgDiv,
      avgShadowLatency: this.metrics.getAvg('shadow_latency_ms') || 0,
      activeShadowModels: 1,
    };
  }

  // ==========================================================================
  // 7. 难例挖掘（E22）
  // ==========================================================================

  async mineHardCases(topN = 50): Promise<ShadowTrajectory[]> {
    // 从内存缓存中按 divergence 降序排列
    const hardCases = this.recentTrajectories
      .filter(t => t.isHardCase)
      .sort((a, b) => b.divergenceScore - a.divergenceScore)
      .slice(0, topN);

    return hardCases;
  }

  async getHardCasesFromDB(limit = 50): Promise<typeof edgeCases.$inferSelect[]> {
    const db = await getDb();
    if (!db) return [];

    try {
      return db.select().from(edgeCases)
        .where(eq(edgeCases.caseType, 'shadow_divergence'))
        .orderBy(desc(edgeCases.divergenceScore))
        .limit(limit);
    } catch { return []; }
  }

  // ==========================================================================
  // 8. 配置管理
  // ==========================================================================

  getConfig(): ShadowFleetConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<ShadowFleetConfig>): void {
    this.config = { ...this.config, ...updates };
    log.info('Shadow Fleet 配置已更新', updates);
  }

  getPrometheusMetrics(): Record<string, number> {
    return this.metrics.getAll();
  }

  // ==========================================================================
  // 9. 清理过期数据
  // ==========================================================================

  async cleanupExpiredTrajectories(): Promise<number> {
    const db = await getDb();
    if (!db) return 0;

    const cutoff = new Date(Date.now() - this.config.trajectoryRetentionDays * 24 * 3600000);

    try {
      // 注意：Drizzle ORM 的 delete 语法
      const result = await db.delete(evolutionInterventions)
        .where(gte(evolutionInterventions.createdAt, cutoff));

      log.info(`已清理 ${this.config.trajectoryRetentionDays} 天前的过期轨迹`);
      return 0; // Drizzle 不返回 affected rows
    } catch (err) {
      log.error('清理过期轨迹失败', err);
      return 0;
    }
  }
}
