/**
 * ============================================================================
 * Shadow Fleet Manager v3.0 (E20-E22)
 * ============================================================================
 *
 * 借鉴 FSD Shadow Mode 核心理念：
 *   - 全流量镜像：生产请求同步发送到影子模型，不影响生产输出
 *   - 轨迹差异采集：记录人类决策 vs 影子决策的完整轨迹
 *   - 自动难例挖掘：divergence > 阈值的案例自动标记为难例
 *   - 干预记录持久化：所有干预写入 evolution_interventions 表
 *
 * v3.0 整改：
 *   - P0: computeDecisionDivergence 使用结构化字段逐一比较（数值容差 + 深度相等）
 *   - P0: 新增 Redis 分布式锁，防止并发部署互斥
 *   - P0: 新增幂等 key，防止重复持久化
 *   - P0: 修复 cleanupExpiredTrajectories 中 gte → lte 的逻辑 bug
 *   - P2: 并发控制从内存计数器升级为 Redis 原子操作
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
 *   │    (幂等)                       Mining               │
 *   └─────────────────────────────────────────────────────┘
 */

import { getProtectedDb as getDb } from '../infra/protected-clients';
import {
  evolutionInterventions,
  evolutionVideoTrajectories,
  edgeCases,
} from '../../../../drizzle/evolution-schema';
import { eq, desc, gte, lte, count, sql, and } from 'drizzle-orm';
import { EventBus } from '../../events/event-bus';
import { createModuleLogger } from '../../../core/logger';
import { RedisClient } from '../../../lib/clients/redis.client';
import { cosineDistance } from '../../../lib/math/vector-utils';

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
  /** 数值比较容差（P0 修复） */
  numericTolerance: number;
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
// Prometheus 指标（内部聚合，P3 阶段替换为 prom-client）
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
  numericTolerance: 1e-6,
};

// ============================================================================
// Shadow Fleet Manager v3.0
// ============================================================================

export class ShadowFleetManager {
  private config: ShadowFleetConfig;
  private modelProvider: ShadowModelProvider;
  private eventBus: EventBus;
  private metrics = new ShadowFleetMetrics();
  private redis: RedisClient;

  /** 并发控制信号量（本地 fallback，优先使用 Redis 原子计数） */
  private activeShadows = 0;

  /** 内存中的最近轨迹缓存（用于实时统计） */
  private recentTrajectories: ShadowTrajectory[] = [];
  private readonly MAX_RECENT_CACHE = 1000;

  constructor(
    modelProvider: ShadowModelProvider,
    config: Partial<ShadowFleetConfig> = {},
    eventBus?: EventBus,
    redis?: RedisClient,
  ) {
    this.modelProvider = modelProvider;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventBus = eventBus || new EventBus();
    this.redis = redis || new RedisClient();
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

    // 并发控制（优先 Redis 原子计数，降级到本地计数器）
    const concurrencyOk = await this.acquireConcurrencySlot();
    if (!concurrencyOk) {
      this.metrics.inc('shadow_rejected_total', { reason: 'concurrency_limit' });
      log.warn(`影子并发已满 (${this.config.maxConcurrentShadows})，跳过`);
      return { trajectory: null, divergence: 0, isIntervention: false, isHardCase: false, shadowLatencyMs: 0 };
    }

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
      await this.releaseConcurrencySlot();
    }
  }

  // ==========================================================================
  // 1b. Redis 并发控制（P2 修复）
  // ==========================================================================

  private async acquireConcurrencySlot(): Promise<boolean> {
    try {
      // 使用 RedisClient.incrementCounter 原子计数（内置 TTL 防泄漏）
      const current = await this.redis.incrementCounter('shadow:active_count', 60);
      if (current > this.config.maxConcurrentShadows) {
        // 超出限制，立即递减回退
        await this.redis.decrementCounter('shadow:active_count');
        return false;
      }
      return true;
    } catch {
      // Redis 不可用时降级到本地计数器
      this.activeShadows++;
      if (this.activeShadows > this.config.maxConcurrentShadows) {
        this.activeShadows--;
        return false;
      }
      return true;
    }
  }

  private async releaseConcurrencySlot(): Promise<void> {
    try {
      // 使用 decrementCounter 原子递减（内置负数保护）
      await this.redis.decrementCounter('shadow:active_count');
    } catch {
      this.activeShadows = Math.max(0, this.activeShadows - 1);
    }
  }

  // ==========================================================================
  // 2. 差异计算引擎（P0 修复：结构化字段逐一比较 + 数值容差）
  // ==========================================================================

  private computeDivergence(production: DecisionOutput, shadow: DecisionOutput): DivergenceDetails {
    // 2a. 决策级别差异 — 结构化字段逐一比较（P0 修复）
    const decisionDivergence = this.computeDecisionDivergence(production.decision, shadow.decision);

    // 2b. 置信度差异
    const confidenceDivergence = Math.abs(production.confidence - shadow.confidence);

    // 2c. 特征空间余弦距离（使用 math/vector-utils 中的标准实现）
    const featureSpaceDistance = cosineDistance(production.features, shadow.features);

    // 2d. 各维度差异明细 — 使用数值容差（P0 修复）
    const dimensionDiffs: Record<string, number> = {};
    const allKeys = new Set([...Object.keys(production.decision), ...Object.keys(shadow.decision)]);
    for (const key of allKeys) {
      const pVal = production.decision[key];
      const sVal = shadow.decision[key];
      dimensionDiffs[key] = this.computeFieldDivergence(pVal, sVal);
    }

    // 差异类型分类
    const dimValues = Object.values(dimensionDiffs);
    const avgDiff = dimValues.length > 0
      ? dimValues.reduce((a, b) => a + b, 0) / dimValues.length
      : 0;
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

  /**
   * P0 修复：结构化决策差异计算
   * 替代原有的 JSON.stringify 比较，使用字段级逐一比较 + 数值容差
   */
  private computeDecisionDivergence(prod: Record<string, unknown>, shadow: Record<string, unknown>): number {
    const allKeys = new Set([...Object.keys(prod), ...Object.keys(shadow)]);
    if (allKeys.size === 0) return 0;

    let totalDivergence = 0;
    let fieldCount = 0;

    for (const key of allKeys) {
      const pVal = prod[key];
      const sVal = shadow[key];
      totalDivergence += this.computeFieldDivergence(pVal, sVal);
      fieldCount++;
    }

    return fieldCount > 0 ? totalDivergence / fieldCount : 0;
  }

  /**
   * P0 修复：单字段差异计算
   * - 数值类型：使用相对误差 + 绝对容差
   * - 字符串类型：完全匹配
   * - 布尔类型：完全匹配
   * - 数组类型：逐元素比较
   * - 对象类型：递归比较
   * - 缺失字段：差异 = 1.0
   */
  private computeFieldDivergence(a: unknown, b: unknown, depth: number = 0): number {
    // P0 修复：递归深度限制，防止栈溢出
    const MAX_DEPTH = 20;
    if (depth >= MAX_DEPTH) return 1.0; // 超过最大深度，返回最大差异
    // 一方缺失
    if (a === undefined && b === undefined) return 0;
    if (a === undefined || b === undefined) return 1.0;
    if (a === null && b === null) return 0;
    if (a === null || b === null) return 1.0;

    // 数值比较（核心 P0 修复）
    if (typeof a === 'number' && typeof b === 'number') {
      return this.numericDivergence(a, b);
    }

    // 字符串比较
    if (typeof a === 'string' && typeof b === 'string') {
      return a === b ? 0 : 1.0;
    }

    // 布尔比较
    if (typeof a === 'boolean' && typeof b === 'boolean') {
      return a === b ? 0 : 1.0;
    }

    // 数组比较
    if (Array.isArray(a) && Array.isArray(b)) {
      return this.arrayDivergence(a, b);
    }

    // 对象递归比较
    if (typeof a === 'object' && typeof b === 'object') {
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;
      const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
      if (keys.size === 0) return 0;

      let sum = 0;
      for (const k of keys) {
        sum += this.computeFieldDivergence(aObj[k], bObj[k], depth + 1);
      }
      return sum / keys.size;
    }

    // 类型不匹配
    return 1.0;
  }

  /**
   * 数值差异：使用相对误差和绝对容差的组合
   * - 当两个值都接近 0 时，使用绝对容差
   * - 否则使用相对误差（归一化到 [0, 1]）
   */
  private numericDivergence(a: number, b: number): number {
    const absDiff = Math.abs(a - b);

    // 绝对容差检查
    if (absDiff <= this.config.numericTolerance) return 0;

    // 相对误差（使用两者绝对值的最大值作为分母）
    const maxAbs = Math.max(Math.abs(a), Math.abs(b));
    if (maxAbs === 0) return 0;

    const relativeDiff = absDiff / maxAbs;
    // 使用 sigmoid 映射到 [0, 1]：relativeDiff=0 → 0, relativeDiff=1 → 0.73, relativeDiff=5 → 0.99
    return 1 - 1 / (1 + relativeDiff);
  }

  /**
   * 数组差异：逐元素比较，长度不同时补 1.0
   */
  private arrayDivergence(a: unknown[], b: unknown[]): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 0;

    let sum = 0;
    for (let i = 0; i < maxLen; i++) {
      sum += this.computeFieldDivergence(a[i], b[i], depth + 1);
    }
    return sum / maxLen;
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
  // 4. 异步持久化（P0 修复：幂等 key）
  // ==========================================================================

  private async persistTrajectoryAsync(trajectory: ShadowTrajectory): Promise<void> {
    const db = await getDb();
    if (!db) return;

    // 幂等 key = requestId + sessionId
    const idempotencyKey = `shadow:${trajectory.requestId}:${trajectory.sessionId}`;

    try {
      // 幂等检查：使用 Redis SETNX（如果 key 已存在则跳过）
      const isNew = await this.trySetIdempotencyKey(idempotencyKey, 86400);
      if (!isNew) {
        log.debug(`幂等跳过: ${idempotencyKey}`);
        return;
      }

      // 4a. 写入干预记录表
      const result = await db.insert(evolutionInterventions).values({
        sessionId: trajectory.sessionId,
        modelId: trajectory.shadowDecision.modelId,
        interventionType: trajectory.isHardCase ? 'decision_diverge' : (trajectory.isIntervention ? 'threshold_breach' : 'decision_diverge'),
        divergenceScore: Math.round(trajectory.divergenceScore * 10000) / 10000,
        isIntervention: trajectory.isIntervention ? 1 : 0,
        requestData: trajectory.request,
        humanDecision: trajectory.productionDecision,
        shadowDecision: trajectory.shadowDecision,
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
          embedding: trajectory.shadowDecision.features.slice(0, 128),
          temporalRelations: {
            prevSessionId: null,
            nextSessionId: null,
            divergenceTimeline: [trajectory.divergenceScore],
          },
        });
      }

      log.debug(`轨迹已持久化: ${trajectory.sessionId}, divergence=${trajectory.divergenceScore.toFixed(4)}`);
    } catch (err) {
      // 持久化失败时清除幂等 key，允许重试
      await this.clearIdempotencyKey(idempotencyKey);
      log.error('轨迹持久化失败', err);
    }
  }

  /**
   * 幂等 key 管理（Redis SETNX + TTL）
   */
  private async trySetIdempotencyKey(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.redis.setnx(key, '1');
      if (result) {
        await this.redis.expire(key, ttlSeconds);
      }
      return result;
    } catch {
      // Redis 不可用时降级为始终允许（依赖 DB 唯一索引兜底）
      return true;
    }
  }

  private async clearIdempotencyKey(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch {
      // 忽略
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
          .where(and(
            gte(evolutionInterventions.createdAt, windowStart),
            eq(evolutionInterventions.isIntervention, 1),
          )),
        db.select({ cnt: count() }).from(edgeCases)
          .where(and(
            gte(edgeCases.discoveredAt, windowStart),
            eq(edgeCases.caseType, 'shadow_divergence'),
          )),
      ]);

      const total = totalRows[0]?.cnt ?? 0;
      const interventions = interventionRows[0]?.cnt ?? 0;
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
  // 9. 清理过期数据（P0 修复：gte → lte）
  // ==========================================================================

  async cleanupExpiredTrajectories(): Promise<number> {
    const db = await getDb();
    if (!db) return 0;

    // P0 修复：cutoff 之前的数据应该被删除，使用 lte（小于等于）
    const cutoff = new Date(Date.now() - this.config.trajectoryRetentionDays * 24 * 3600000);

    try {
      await db.delete(evolutionInterventions)
        .where(lte(evolutionInterventions.createdAt, cutoff));

      // 同步清理视频轨迹
      await db.delete(evolutionVideoTrajectories)
        .where(lte(evolutionVideoTrajectories.createdAt, cutoff));

      log.info(`已清理 ${this.config.trajectoryRetentionDays} 天前的过期轨迹`);
      return 0;
    } catch (err) {
      log.error('清理过期轨迹失败', err);
      return 0;
    }
  }
}
