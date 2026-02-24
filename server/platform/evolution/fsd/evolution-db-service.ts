/**
 * ============================================================================
 * Evolution DB Service (FSD 表 CRUD)
 * ============================================================================
 *
 * 统一的 FSD 进化引擎数据访问层：
 *   - evolution_interventions: 干预记录 CRUD
 *   - evolution_simulations: 仿真场景 CRUD
 *   - evolution_video_trajectories: 视频轨迹 CRUD
 *   - evolution_step_logs: 步骤日志查询
 *   - evolution_flywheel_schedules: 飞轮调度查询
 *   - canary_deployments: 金丝雀部署查询
 *   - 聚合统计查询
 */

import { getProtectedDb as getDb } from '../infra/protected-clients';
import {
  evolutionInterventions,
  evolutionSimulations,
  evolutionVideoTrajectories,
  evolutionStepLogs,
  evolutionFlywheelSchedules,
  canaryDeployments,
  edgeCases,
  evolutionCycles,
} from '../../../../drizzle/evolution-schema';
import { eq, desc, gte, lte, count, avg, and, sql } from 'drizzle-orm';
import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('evolution-db-service');

// ============================================================================
// 类型定义
// ============================================================================

export interface InterventionQuery {
  modelId?: string;
  startDate?: Date;
  endDate?: Date;
  isIntervention?: boolean;
  limit?: number;
  offset?: number;
}

export interface InterventionStats {
  totalRecords: number;
  totalInterventions: number;
  interventionRate: number;
  avgDivergence: number;
  modelDistribution: Record<string, number>;
}

export interface SimulationQuery {
  scenarioType?: string;
  difficulty?: string;
  status?: string;
  limit?: number;
}

export interface EvolutionDashboardData {
  interventionStats: InterventionStats;
  simulationCount: number;
  videoTrajectoryCount: number;
  recentCycles: any[];
  recentDeployments: any[];
  stepLogCount: number;
  scheduleCount: number;
}

// ============================================================================
// Evolution DB Service
// ============================================================================

export class EvolutionDBService {

  // ==========================================================================
  // 1. 干预记录 CRUD
  // ==========================================================================

  async recordIntervention(data: {
    sessionId: string;
    modelId: string;
    modelVersion?: string;
    requestId?: string;
    deviceId?: string;
    interventionType?: string;
    divergenceScore: number;
    isIntervention: number;
    requestData?: Record<string, unknown>;
    humanDecision?: Record<string, unknown>;
    shadowDecision?: Record<string, unknown>;
    divergenceDetails?: Record<string, unknown>;
  }): Promise<number> {
    const db = await getDb();
    if (!db) throw new Error('数据库未连接');

    // @ts-ignore
    const result = await db.insert(evolutionInterventions).values({
      sessionId: data.sessionId,
      modelId: data.modelId,
      modelVersion: data.modelVersion ?? '1.0.0',
      requestId: data.requestId,
      deviceId: data.deviceId,
      interventionType: data.interventionType ?? 'decision_diverge',
      divergenceScore: data.divergenceScore,
      isIntervention: data.isIntervention,
      requestData: data.requestData ?? {},
      humanDecision: data.humanDecision ?? {},
      shadowDecision: data.shadowDecision ?? {},
      divergenceDetails: data.divergenceDetails ?? {},
    });

    return Number(result[0].insertId);
  }

  async getInterventions(query: InterventionQuery = {}): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    const conditions = [];
    if (query.modelId) conditions.push(eq(evolutionInterventions.modelId, query.modelId));
    if (query.startDate) conditions.push(gte(evolutionInterventions.createdAt, query.startDate));
    if (query.endDate) conditions.push(lte(evolutionInterventions.createdAt, query.endDate));
    if (query.isIntervention !== undefined) {
      conditions.push(eq(evolutionInterventions.isIntervention, query.isIntervention ? 1 : 0));
    }

    let q = db.select().from(evolutionInterventions);
    if (conditions.length > 0) {
      q = q.where(and(...conditions)) as any;
    }

    return q.orderBy(desc(evolutionInterventions.createdAt))
      .limit(query.limit ?? 50)
      .offset(query.offset ?? 0);
  }

  async getInterventionRate(modelId?: string, windowHours = 24): Promise<{
    rate: number;
    inverseMileage: number;
    fsdStyle: string;
    total: number;
    interventions: number;
  }> {
    const db = await getDb();
    if (!db) return { rate: 0, inverseMileage: 9999, fsdStyle: '1/9999', total: 0, interventions: 0 };

    const windowStart = new Date(Date.now() - windowHours * 3600000);
    const conditions = [gte(evolutionInterventions.createdAt, windowStart)];
    if (modelId) conditions.push(eq(evolutionInterventions.modelId, modelId));

    // @ts-ignore
    const totalRows = await db.select({ cnt: count() }).from(evolutionInterventions)
      .where(and(...conditions));

    const intConditions = [...conditions, eq(evolutionInterventions.isIntervention, 1)];
    // @ts-ignore
    const intRows = await db.select({ cnt: count() }).from(evolutionInterventions)
      .where(and(...intConditions));

    const total = totalRows[0]?.cnt ?? 0;
    const interventions = intRows[0]?.cnt ?? 0;
    const rate = total > 0 ? interventions / total : 0;
    const inverseMileage = total > 0 ? Math.round(total / Math.max(interventions, 1)) : 9999;

    return {
      rate,
      inverseMileage,
      fsdStyle: `1/${inverseMileage}`,
      total,
      interventions,
    };
  }

  async getInterventionStats(windowHours = 24): Promise<InterventionStats> {
    const db = await getDb();
    if (!db) return { totalRecords: 0, totalInterventions: 0, interventionRate: 0, avgDivergence: 0, modelDistribution: {} };

    const windowStart = new Date(Date.now() - windowHours * 3600000);

    // @ts-ignore
    const totalRows = await db.select({ cnt: count() }).from(evolutionInterventions)
      .where(gte(evolutionInterventions.createdAt, windowStart));

    // @ts-ignore
    const intRows = await db.select({ cnt: count() }).from(evolutionInterventions)
      .where(and(
        gte(evolutionInterventions.createdAt, windowStart),
        eq(evolutionInterventions.isIntervention, 1),
      ));

    const totalRecords = totalRows[0]?.cnt ?? 0;
    const totalInterventions = intRows[0]?.cnt ?? 0;

    return {
      totalRecords,
      totalInterventions,
      interventionRate: totalRecords > 0 ? totalInterventions / totalRecords : 0,
      avgDivergence: 0, // 简化
      modelDistribution: {},
    };
  }

  // ==========================================================================
  // 2. 仿真场景 CRUD
  // ==========================================================================

  async createSimulation(data: {
    scenarioId: string;
    name: string;
    scenarioType: string;
    sourceInterventionId?: number | null;
    inputData: Record<string, unknown>;
    expectedOutput: Record<string, unknown>;
    variations?: unknown[];
    fidelityScore?: number;
    difficulty?: string;
    tags?: string[];
  }): Promise<void> {
    const db = await getDb();
    if (!db) return;

    // @ts-ignore
    await db.insert(evolutionSimulations).values({
      // @ts-ignore
      scenarioId: data.scenarioId,
      name: data.name,
      scenarioType: data.scenarioType,
      sourceInterventionId: data.sourceInterventionId ?? null,
      inputData: data.inputData,
      expectedOutput: data.expectedOutput,
      variations: data.variations ?? [],
      fidelityScore: data.fidelityScore ?? 0,
      difficulty: data.difficulty ?? 'medium',
      tags: data.tags ?? [],
      status: 'active',
    });
  }

  async getSimulations(query: SimulationQuery = {}): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    const conditions = [];
    // @ts-ignore
    if (query.scenarioType) conditions.push(eq(evolutionSimulations.scenarioType, query.scenarioType));
    // @ts-ignore
    if (query.difficulty) conditions.push(eq(evolutionSimulations.difficulty, query.difficulty));
    // @ts-ignore
    if (query.status) conditions.push(eq(evolutionSimulations.scenarioType, query.status));

    let q = db.select().from(evolutionSimulations);
    if (conditions.length > 0) {
      q = q.where(and(...conditions)) as any;
    }

    return q.orderBy(desc(evolutionSimulations.createdAt)).limit(query.limit ?? 50);
  }

  async getSimulationCount(): Promise<number> {
    const db = await getDb();
    if (!db) return 0;
    // @ts-ignore
    const rows = await db.select({ cnt: count() }).from(evolutionSimulations);
    return rows[0]?.cnt ?? 0;
  }

  // ==========================================================================
  // 3. 视频轨迹 CRUD
  // ==========================================================================

  async recordVideoTrajectory(data: {
    interventionId: number;
    sessionId: string;
    sequenceIndex: number;
    frameData: Record<string, unknown>;
    embedding?: number[];
    temporalRelations?: Record<string, unknown>;
  }): Promise<void> {
    const db = await getDb();
    if (!db) return;

    // @ts-ignore
    await db.insert(evolutionVideoTrajectories).values({
      interventionId: data.interventionId,
      sessionId: data.sessionId,
      sequenceIndex: data.sequenceIndex,
      frameData: data.frameData,
      embedding: data.embedding ?? [],
      temporalRelations: data.temporalRelations ?? {},
    });
  }

  async getVideoTrajectories(sessionId: string): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    return db.select().from(evolutionVideoTrajectories)
      .where(eq(evolutionVideoTrajectories.sessionId, sessionId))
      .orderBy(evolutionVideoTrajectories.id);
  }

  async getVideoTrajectoryCount(): Promise<number> {
    const db = await getDb();
    if (!db) return 0;
    // @ts-ignore
    const rows = await db.select({ cnt: count() }).from(evolutionVideoTrajectories);
    return rows[0]?.cnt ?? 0;
  }

  // ==========================================================================
  // 4. 步骤日志查询
  // ==========================================================================

  async getStepLogs(cycleId: string): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    return db.select().from(evolutionStepLogs)
      // @ts-ignore
      .where(eq(evolutionStepLogs.cycleId, cycleId))
      .orderBy(evolutionStepLogs.stepNumber as any);
  }

  async getStepLogCount(): Promise<number> {
    const db = await getDb();
    if (!db) return 0;
    // @ts-ignore
    const rows = await db.select({ cnt: count() }).from(evolutionStepLogs);
    return rows[0]?.cnt ?? 0;
  }

  // ==========================================================================
  // 5. 飞轮调度查询
  // ==========================================================================

  async getActiveSchedules(): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    return db.select().from(evolutionFlywheelSchedules)
      // @ts-ignore
      .where(eq(evolutionFlywheelSchedules.enabled, 'active'))
      .orderBy(desc(evolutionFlywheelSchedules.createdAt));
  }

  async getScheduleCount(): Promise<number> {
    const db = await getDb();
    if (!db) return 0;
    // @ts-ignore
    const rows = await db.select({ cnt: count() }).from(evolutionFlywheelSchedules);
    return rows[0]?.cnt ?? 0;
  }

  // ==========================================================================
  // 6. 金丝雀部署查询
  // ==========================================================================

  async getRecentDeployments(limit = 10): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    return db.select().from(canaryDeployments)
      .orderBy(desc(canaryDeployments.createdAt))
      .limit(limit);
  }

  // ==========================================================================
  // 7. 进化周期查询
  // ==========================================================================

  async getRecentCycles(limit = 10): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    return db.select().from(evolutionCycles)
      .orderBy(desc(evolutionCycles.startedAt))
      .limit(limit);
  }

  // ==========================================================================
  // 8. 综合仪表盘数据
  // ==========================================================================

  async getDashboardData(windowHours = 24): Promise<EvolutionDashboardData> {
    const [
      interventionStats,
      simulationCount,
      videoTrajectoryCount,
      recentCycles,
      recentDeployments,
      stepLogCount,
      scheduleCount,
    ] = await Promise.all([
      this.getInterventionStats(windowHours),
      this.getSimulationCount(),
      this.getVideoTrajectoryCount(),
      this.getRecentCycles(5),
      this.getRecentDeployments(5),
      this.getStepLogCount(),
      this.getScheduleCount(),
    ]);

    return {
      interventionStats,
      simulationCount,
      videoTrajectoryCount,
      recentCycles,
      recentDeployments,
      stepLogCount,
      scheduleCount,
    };
  }
}
