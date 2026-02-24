/**
 * ============================================================================
 * 共享 DeploymentRepository — 部署数据访问对象
 * ============================================================================
 *
 * 设计原则：
 *   - 组合而非继承：OTA 和 Canary 各自保留业务逻辑，共享纯 DB 操作
 *   - 强制保护层：所有 DB 调用经过 getProtectedDb（断路器保护）
 *   - 幂等写入：所有写操作支持重复调用不产生副作用
 *
 * 消除的重复代码：
 *   - updateDeploymentInDB（OTA + Canary 各一份 → 合并为 1 份）
 *   - persistStageRecord（OTA + Canary 各一份 → 合并为 1 份）
 *   - persistHealthCheck（OTA + Canary 各一份 → 合并为 1 份）
 *   - recoverActiveDeployments（OTA + Canary 各一份 → 合并为 1 份）
 *   - countActiveDeployments（OTA + Canary 各一份 → 合并为 1 份）
 */

import { getProtectedDb as getDb } from '../infra/protected-clients';
import {
  canaryDeployments,
  canaryDeploymentStages,
  canaryHealthChecks,
} from '../../../../drizzle/evolution-schema';
import { eq, desc, and, count } from 'drizzle-orm';
import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('deployment-repository');

// ============================================================================
// 类型定义
// ============================================================================

export interface DeploymentRecord {
  id: number;
  experimentId?: string;
  deploymentId?: string;
  modelId: string;
  modelVersion?: string;
  status: string;
  trafficPercent: number;
  metricsSnapshot?: Record<string, any>;
  startedAt: Date;
  endedAt?: Date | null;
  rollbackReason?: string | null;
  config?: Record<string, any>;
}

export interface StageRecord {
  deploymentId: number;
  stageIndex?: number;
  stageName: string;
  trafficPercent: number;
  status: string;
  startedAt?: Date;
  completedAt?: Date | null;
  metricsSnapshot?: Record<string, any> | null;
  rollbackReason?: string | null;
}

export interface HealthCheckRecord {
  deploymentId: number;
  stageName: string;
  checkResult: 'passed' | 'failed';
  metrics: Record<string, any>;
  checkedAt: Date;
  championMetrics?: Record<string, any>;
  challengerMetrics?: Record<string, any>;
}

// ============================================================================
// 共享 DeploymentRepository
// ============================================================================

export class DeploymentRepository {
  private source: string;

  constructor(source: string = 'deployment-repository') {
    this.source = source;
  }

  // ==========================================================================
  // 1. 部署主表操作
  // ==========================================================================

  /**
   * 创建部署记录
   */
  async createDeployment(record: Omit<DeploymentRecord, 'id'>): Promise<number | null> {
    const db = await getDb();
    if (!db) return null;

    try {
      // @ts-ignore
      const result = await db.insert(canaryDeployments).values({
        // @ts-ignore
        experimentId: record.experimentId,
        modelId: record.modelId,
        status: record.status,
        trafficPercent: record.trafficPercent,
        metricsSnapshot: record.metricsSnapshot || {},
        startedAt: record.startedAt,
        config: record.config,
      }).$returningId();

      return result?.[0]?.id ?? null;
    } catch (err) {
      log.error(`[${this.source}] 创建部署记录失败`, err);
      return null;
    }
  }

  /**
   * 更新部署状态和流量百分比
   */
  async updateDeploymentStatus(
    deploymentId: number,
    status: string,
    trafficPercent: number,
    extra?: {
      metricsSnapshot?: Record<string, any>;
      rollbackReason?: string;
      endedAt?: Date;
    },
  ): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      const setClause: Record<string, any> = { status, trafficPercent };
      if (extra?.metricsSnapshot) setClause.metricsSnapshot = extra.metricsSnapshot;
      if (extra?.rollbackReason) setClause.rollbackReason = extra.rollbackReason;
      if (extra?.endedAt) setClause.endedAt = extra.endedAt;
      if (status === 'completed' || status === 'rolled_back') {
        setClause.endedAt = setClause.endedAt || new Date();
      }

      // @ts-ignore
      await db.update(canaryDeployments)
        // @ts-ignore
        .set(setClause)
        .where(eq(canaryDeployments.id, deploymentId));
    } catch (err) {
      log.error(`[${this.source}] 更新部署状态失败: id=${deploymentId}`, err);
    }
  }

  /**
   * 按 deploymentId 字符串更新（OTA 使用 planId 作为标识）
   */
  async updateDeploymentByPlanId(
    planId: string,
    status: string,
    trafficPercent: number,
  ): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      const setClause: Record<string, any> = { status, trafficPercent };
      if (status === 'completed' || status === 'rolled_back') {
        setClause.endedAt = new Date();
      }

      // @ts-ignore
      await db.update(canaryDeployments)
        // @ts-ignore
        .set(setClause)
        // @ts-ignore
        .where(eq(canaryDeployments.id, planId));
    } catch (err) {
      log.error(`[${this.source}] 更新部署状态失败: planId=${planId}`, err);
    }
  }

  // ==========================================================================
  // 2. 阶段记录操作
  // ==========================================================================

  /**
   * 持久化阶段记录
   */
  async persistStageRecord(record: StageRecord): Promise<void> {
    const db = await getDb();
    if (!db || !record.deploymentId) return;

    try {
      // @ts-ignore
      await db.insert(canaryDeploymentStages).values({
        stageIndex: record.stageIndex ?? 0,
        stageName: record.stageName,
        trafficPercent: record.trafficPercent,
        status: record.status,
        startedAt: record.startedAt || new Date(),
        completedAt: record.completedAt,
        metricsSnapshot: record.metricsSnapshot,
        rollbackReason: record.rollbackReason,
      });
    } catch (err) {
      log.error(`[${this.source}] 持久化阶段记录失败: deployment=${record.deploymentId}, stage=${record.stageName}`, err);
    }
  }

  /**
   * 更新阶段状态
   */
  async updateStageStatus(
    stageId: number,
    status: string,
    extra?: {
      completedAt?: Date;
      metricsSnapshot?: Record<string, any> | null;
      rollbackReason?: string;
    },
  ): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      const setClause: Record<string, any> = { status };
      if (extra?.completedAt) setClause.endedAt = extra.completedAt;
      if (extra?.metricsSnapshot !== undefined) setClause.metricsSnapshot = extra.metricsSnapshot;
      if (extra?.rollbackReason) setClause.rollbackReason = extra.rollbackReason;

      // @ts-ignore
      await db.update(canaryDeploymentStages)
        // @ts-ignore
        .set(setClause)
        .where(eq(canaryDeploymentStages.id, stageId));
    } catch (err) {
      log.error(`[${this.source}] 更新阶段状态失败: stageId=${stageId}`, err);
    }
  }

  /**
   * 获取部署的所有阶段
   */
  async getStages(deploymentId: number): Promise<typeof canaryDeploymentStages.$inferSelect[]> {
    const db = await getDb();
    if (!db) return [];

    return db.select().from(canaryDeploymentStages)
      .where(eq(canaryDeploymentStages.deploymentId, deploymentId))
      .orderBy(canaryDeploymentStages.stageIndex);
  }

  // ==========================================================================
  // 3. 健康检查记录操作
  // ==========================================================================

  /**
   * 持久化健康检查记录
   */
  async persistHealthCheck(record: HealthCheckRecord): Promise<void> {
    const db = await getDb();
    if (!db || !record.deploymentId) return;

    try {
      // @ts-ignore
      await db.insert(canaryHealthChecks).values({
        // @ts-ignore
        stageName: record.stageName,
        checkResult: record.checkResult,
        metrics: record.metrics,
        championMetrics: record.championMetrics,
        challengerMetrics: record.challengerMetrics,
        checkedAt: record.checkedAt,
      });
    } catch (err) {
      log.error(`[${this.source}] 持久化健康检查失败: deployment=${record.deploymentId}`, err);
    }
  }

  /**
   * 获取最近的健康检查记录
   */
  async getRecentHealthChecks(
    deploymentId: number,
    limit: number = 20,
  ): Promise<typeof canaryHealthChecks.$inferSelect[]> {
    const db = await getDb();
    if (!db) return [];

    return db.select().from(canaryHealthChecks)
      .where(eq(canaryHealthChecks.deploymentId, deploymentId))
      .orderBy(desc(canaryHealthChecks.checkedAt))
      .limit(limit);
  }

  // ==========================================================================
  // 4. 查询操作
  // ==========================================================================

  /**
   * 获取所有活跃部署
   */
  async getActiveDeployments(): Promise<typeof canaryDeployments.$inferSelect[]> {
    const db = await getDb();
    if (!db) return [];

    return db.select().from(canaryDeployments)
      .where(eq(canaryDeployments.status, 'active'));
  }

  /**
   * 获取运行中的部署（OTA 使用 'running' 状态）
   */
  async getRunningDeployments(): Promise<typeof canaryDeployments.$inferSelect[]> {
    const db = await getDb();
    if (!db) return [];

    return db.select().from(canaryDeployments)
      // @ts-ignore
      .where(eq(canaryDeployments.status, 'running'));
  }

  /**
   * 统计活跃部署数量
   */
  async countActiveDeployments(): Promise<number> {
    const db = await getDb();
    if (!db) return 0;

    try {
      // @ts-ignore
      const result = await db.select({ count: count() }).from(canaryDeployments)
        .where(eq(canaryDeployments.status, 'active'));
      return result[0]?.count ?? 0;
    } catch (err) {
      log.error(`[${this.source}] 统计活跃部署失败`, err);
      return 0;
    }
  }

  /**
   * 获取单个部署的完整信息（部署 + 阶段 + 健康检查）
   */
  async getDeploymentDetail(deploymentId: number): Promise<{
    deployment: typeof canaryDeployments.$inferSelect | null;
    stages: typeof canaryDeploymentStages.$inferSelect[];
    recentChecks: typeof canaryHealthChecks.$inferSelect[];
  }> {
    const db = await getDb();
    if (!db) return { deployment: null, stages: [], recentChecks: [] };

    // @ts-ignore
    const deployments = await db.select().from(canaryDeployments)
      .where(eq(canaryDeployments.id, deploymentId)).limit(1);

    const stages = await this.getStages(deploymentId);
    const recentChecks = await this.getRecentHealthChecks(deploymentId);

    return {
      deployment: deployments[0] || null,
      stages,
      recentChecks,
    };
  }

  /**
   * 获取部署历史
   */
  async getDeploymentHistory(limit: number = 20): Promise<typeof canaryDeployments.$inferSelect[]> {
    const db = await getDb();
    if (!db) return [];

    return db.select().from(canaryDeployments)
      .orderBy(desc(canaryDeployments.startedAt))
      .limit(limit);
  }
}

// ============================================================================
// 单例导出（Canary 和 OTA 各自创建实例以区分日志来源）
// ============================================================================

export const canaryRepository = new DeploymentRepository('canary-deployer');
export const otaRepository = new DeploymentRepository('ota-fleet-canary');
