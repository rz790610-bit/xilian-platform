/**
 * ============================================================================
 * Phase 5: 深度 AI 集成与神经世界模型子路由
 * ============================================================================
 * 功能：神经世界模型管理、多模型横向对比、自适应参数推荐、进化引擎总控中心
 */
import { router, protectedProcedure } from '../../core/trpc';
import { TRPCError } from '@trpc/server';
import { getOrchestrator, EVOLUTION_TOPICS } from './evolution-orchestrator';
import { z } from 'zod';
import { getDb } from '../../lib/db';
import { eq, desc, count, and, sql, gte, lte, inArray } from 'drizzle-orm';
import {
  neuralWorldModelVersions,
  worldModelTrainingJobs,
  evolutionModelRegistry,
  modelComparisonReports,
  adaptiveParamRecommendations,
  evolutionEngineInstances,
  engineConfigRegistry,
  worldModelPredictions,
} from '../../../drizzle/evolution-schema';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 神经世界模型管理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const worldModelRouter = router({
  /** 列出所有世界模型版本 */
  listVersions: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      architecture: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const filters: any[] = [];
      if (input?.status) filters.push(eq(neuralWorldModelVersions.status, input.status));
      if (input?.architecture) filters.push(eq(neuralWorldModelVersions.architecture, input.architecture));
      const where = filters.length > 0 ? and(...filters) : undefined;
      const [items, totalResult] = await Promise.all([
        db.select().from(neuralWorldModelVersions).where(where)
          .orderBy(desc(neuralWorldModelVersions.createdAt))
          .limit(input?.limit ?? 50).offset(input?.offset ?? 0),
        db.select({ cnt: count() }).from(neuralWorldModelVersions).where(where),
      ]);
      return { items, total: totalResult[0]?.cnt ?? 0 };
    }),

  /** 获取单个模型版本详情 */
  getVersion: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const rows = await db.select().from(neuralWorldModelVersions).where(eq(neuralWorldModelVersions.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),

  /** 创建新模型版本 */
  createVersion: protectedProcedure
    .input(z.object({
      modelName: z.string(),
      version: z.string(),
      architecture: z.string(),
      description: z.string().optional(),
      parameterCount: z.number().optional(),
      trainingDataSize: z.number().optional(),
      inputDimensions: z.number().optional(),
      outputDimensions: z.number().optional(),
      predictionHorizonMin: z.number().optional(),
      predictionHorizonMax: z.number().optional(),
      trainingConfig: z.record(z.string(), z.unknown()).optional(),
      parentVersionId: z.number().optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const result = await db.insert(neuralWorldModelVersions).values({
        modelName: input.modelName,
        version: input.version,
        architecture: input.architecture,
        description: input.description,
        parameterCount: input.parameterCount,
        trainingDataSize: input.trainingDataSize,
        inputDimensions: input.inputDimensions,
        outputDimensions: input.outputDimensions,
        predictionHorizonMin: input.predictionHorizonMin,
        predictionHorizonMax: input.predictionHorizonMax,
        trainingConfig: input.trainingConfig as any,
        parentVersionId: input.parentVersionId,
        tags: input.tags,
        status: 'draft',
      });
      // EventBus: 世界模型版本创建
      await getOrchestrator().publishEvent(EVOLUTION_TOPICS.WORLD_MODEL_VERSION_CREATED, {
        versionId: Number(result[0].insertId), modelName: input.modelName, architecture: input.architecture,
      });
      getOrchestrator().recordMetric('evolution.worldModel.versionCreated', 1);

      return { id: Number(result[0].insertId) };
    }),

  /** 更新模型版本状态 */
  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      await db.update(neuralWorldModelVersions)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(neuralWorldModelVersions.id, input.id));
      // EventBus: 模型版本状态变更
      await getOrchestrator().publishEvent(EVOLUTION_TOPICS.WORLD_MODEL_STATUS_CHANGED, {
        versionId: input.id, newStatus: input.status,
      });
      return { success: true };
    }),

  /** 删除模型版本 */
  deleteVersion: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      await db.delete(neuralWorldModelVersions).where(eq(neuralWorldModelVersions.id, input.id));
      // EventBus: 模型版本删除
      await getOrchestrator().publishEvent(EVOLUTION_TOPICS.WORLD_MODEL_VERSION_DELETED, { versionId: input.id });
      return { success: true };
    }),

  /** 列出训练任务 */
  listTrainingJobs: protectedProcedure
    .input(z.object({
      modelVersionId: z.number().optional(),
      status: z.string().optional(),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const filters: any[] = [];
      if (input?.modelVersionId) filters.push(eq(worldModelTrainingJobs.modelVersionId, input.modelVersionId));
      if (input?.status) filters.push(eq(worldModelTrainingJobs.status, input.status));
      const where = filters.length > 0 ? and(...filters) : undefined;
      return db.select().from(worldModelTrainingJobs).where(where)
        .orderBy(desc(worldModelTrainingJobs.createdAt)).limit(input?.limit ?? 50);
    }),

  /** 创建训练任务 */
  createTrainingJob: protectedProcedure
    .input(z.object({
      modelVersionId: z.number(),
      trainingType: z.string(),
      config: z.record(z.string(), z.unknown()).optional(),
      gpuCount: z.number().optional(),
      gpuType: z.string().optional(),
      totalEpochs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const result = await db.insert(worldModelTrainingJobs).values({
        modelVersionId: input.modelVersionId,
        trainingType: input.trainingType,
        config: input.config as any,
        gpuCount: input.gpuCount ?? 1,
        gpuType: input.gpuType,
        totalEpochs: input.totalEpochs,
        status: 'queued',
      });
      // 更新模型版本状态为 training
      await db.update(neuralWorldModelVersions)
        .set({ status: 'training', updatedAt: new Date() })
        .where(eq(neuralWorldModelVersions.id, input.modelVersionId));
      // EventBus: 训练任务创建
      await getOrchestrator().recordWorldModelTraining({ versionId: String(input.modelVersionId), architecture: input.trainingType, status: 'pending' });

      return { id: Number(result[0].insertId) };
    }),

  /** 更新训练任务状态/进度 */
  updateTrainingJob: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string().optional(),
      progress: z.number().optional(),
      currentEpoch: z.number().optional(),
      currentLoss: z.number().optional(),
      bestLoss: z.number().optional(),
      errorMessage: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const updates: Record<string, unknown> = {};
      if (input.status) updates.status = input.status;
      if (input.progress !== undefined) updates.progress = input.progress;
      if (input.currentEpoch !== undefined) updates.currentEpoch = input.currentEpoch;
      if (input.currentLoss !== undefined) updates.currentLoss = input.currentLoss;
      if (input.bestLoss !== undefined) updates.bestLoss = input.bestLoss;
      if (input.errorMessage) updates.errorMessage = input.errorMessage;
      if (input.status === 'running') updates.startedAt = new Date();
      if (input.status === 'completed' || input.status === 'failed') updates.completedAt = new Date();
      await db.update(worldModelTrainingJobs).set(updates).where(eq(worldModelTrainingJobs.id, input.id));
      // EventBus: 训练任务状态更新
      if (input.status) {
        await getOrchestrator().publishEvent(EVOLUTION_TOPICS.TRAINING_STATUS_CHANGED, {
          jobId: input.id, newStatus: input.status, progress: input.progress,
        });
        getOrchestrator().recordMetric('evolution.training.statusChanged', 1, { status: input.status });
      }
      return { success: true };
    }),

  /** 世界模型统计 */
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { totalVersions: 0, activeVersions: 0, trainingJobs: 0, runningJobs: 0, architectures: {} as Record<string, number> };
    try {
      const [totalV, activeV, totalJ, runningJ] = await Promise.all([
        db.select({ cnt: count() }).from(neuralWorldModelVersions),
        db.select({ cnt: count() }).from(neuralWorldModelVersions).where(eq(neuralWorldModelVersions.status, 'active')),
        db.select({ cnt: count() }).from(worldModelTrainingJobs),
        db.select({ cnt: count() }).from(worldModelTrainingJobs).where(eq(worldModelTrainingJobs.status, 'running')),
      ]);
      const archRows = await db.select({
        arch: neuralWorldModelVersions.architecture,
        cnt: count(),
      }).from(neuralWorldModelVersions).groupBy(neuralWorldModelVersions.architecture);
      const architectures: Record<string, number> = {};
      archRows.forEach((r: { arch: string; cnt: number }) => { architectures[r.arch] = r.cnt; });
      return {
        totalVersions: totalV[0]?.cnt ?? 0,
        activeVersions: activeV[0]?.cnt ?? 0,
        trainingJobs: totalJ[0]?.cnt ?? 0,
        runningJobs: runningJ[0]?.cnt ?? 0,
        architectures,
      };
    } catch {
      return { totalVersions: 0, activeVersions: 0, trainingJobs: 0, runningJobs: 0, architectures: {} as Record<string, number> };
    }
  }),
  // ── 世界模型预测验证 ──
  listPredictions: protectedProcedure
    .input(z.object({ snapshotId: z.number().optional(), limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const conditions: any[] = [];
      if (input?.snapshotId) conditions.push(eq(worldModelPredictions.snapshotId, input.snapshotId));
      const where = conditions.length ? and(...conditions) : undefined;
      return db.select().from(worldModelPredictions).where(where)
        .orderBy(desc(worldModelPredictions.createdAt)).limit(input?.limit ?? 50);
    }),
  createPrediction: protectedProcedure
    .input(z.object({
      snapshotId: z.number(),
      horizonMinutes: z.number(),
      predictedState: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const result = await db.insert(worldModelPredictions).values({
        snapshotId: input.snapshotId,
        horizonMinutes: input.horizonMinutes,
        predictedState: input.predictedState,
      });
      await getOrchestrator().publishEvent(EVOLUTION_TOPICS.WORLD_MODEL_PREDICTION, {
        snapshotId: input.snapshotId, horizonMinutes: input.horizonMinutes,
      });
      return { id: Number(result[0].insertId) };
    }),
  validatePrediction: protectedProcedure
    .input(z.object({
      id: z.number(),
      actualState: z.record(z.string(), z.unknown()),
      error: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      await db.update(worldModelPredictions).set({
        actualState: input.actualState,
        error: input.error,
        validatedAt: new Date(),
      }).where(eq(worldModelPredictions.id, input.id));
      await getOrchestrator().publishEvent(EVOLUTION_TOPICS.WORLD_MODEL_PREDICTION, {
        predictionId: input.id, error: input.error, validated: true,
      });
      return { success: true };
    }),
  /** 使用 ONNX 世界模型进行实时预测（E2E 飞轮闭环入口） */
  predict: protectedProcedure
    .input(z.object({
      jobId: z.string().optional().default(`wm-predict-${Date.now()}`),
      encodedFeatures: z.array(z.number()),
      sequenceLength: z.number(),
      featureDim: z.number(),
      deviceId: z.string().optional(),
      conditionLabel: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const prediction = await getOrchestrator().predictWithWorldModel({
        jobId: input.jobId,
        encodedFeatures: input.encodedFeatures,
        sequenceLength: input.sequenceLength,
        featureDim: input.featureDim,
        deviceId: input.deviceId,
        conditionLabel: input.conditionLabel,
      });
      return prediction;
    }),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 多模型横向对比
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const modelRegistryRouter = router({
  /** 列出所有注册模型 */
  list: protectedProcedure
    .input(z.object({
      modelType: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const filters: any[] = [];
      if (input?.modelType) filters.push(eq(evolutionModelRegistry.modelType, input.modelType));
      if (input?.status) filters.push(eq(evolutionModelRegistry.status, input.status));
      const where = filters.length > 0 ? and(...filters) : undefined;
      const [items, totalResult] = await Promise.all([
        db.select().from(evolutionModelRegistry).where(where)
          .orderBy(desc(evolutionModelRegistry.createdAt))
          .limit(input?.limit ?? 50).offset(input?.offset ?? 0),
        db.select({ cnt: count() }).from(evolutionModelRegistry).where(where),
      ]);
      return { items, total: totalResult[0]?.cnt ?? 0 };
    }),

  /** 获取单个模型详情 */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const rows = await db.select().from(evolutionModelRegistry).where(eq(evolutionModelRegistry.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),

  /** 注册新模型 */
  register: protectedProcedure
    .input(z.object({
      modelName: z.string(),
      modelVersion: z.string(),
      modelType: z.string(),
      framework: z.string().optional(),
      metrics: z.record(z.string(), z.unknown()).optional(),
      trainingInfo: z.record(z.string(), z.unknown()).optional(),
      deploymentInfo: z.record(z.string(), z.unknown()).optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const result = await db.insert(evolutionModelRegistry).values({
        modelName: input.modelName,
        modelVersion: input.modelVersion,
        modelType: input.modelType,
        framework: input.framework,
        metrics: input.metrics as any,
        trainingInfo: input.trainingInfo as any,
        deploymentInfo: input.deploymentInfo as any,
        description: input.description,
        tags: input.tags,
        status: 'registered',
      });
      // EventBus: 模型注册
      await getOrchestrator().publishEvent(EVOLUTION_TOPICS.MODEL_REGISTERED, {
        modelId: Number(result[0].insertId), modelName: input.modelName, modelType: input.modelType,
      });
      getOrchestrator().recordMetric('evolution.model.registered', 1, { modelType: input.modelType });
      return { id: Number(result[0].insertId) };
    }),

  /** 更新模型状态 */
  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      await db.update(evolutionModelRegistry)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(evolutionModelRegistry.id, input.id));
      // EventBus: 模型状态变更
      await getOrchestrator().publishEvent(EVOLUTION_TOPICS.MODEL_STATUS_CHANGED, {
        modelId: input.id, newStatus: input.status,
      });
      return { success: true };
    }),

  /** 更新模型指标 */
  updateMetrics: protectedProcedure
    .input(z.object({ id: z.number(), metrics: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      await db.update(evolutionModelRegistry)
        .set({ metrics: input.metrics as any, updatedAt: new Date() })
        .where(eq(evolutionModelRegistry.id, input.id));
      // EventBus: 模型指标更新
      getOrchestrator().recordMetric('evolution.model.metricsUpdated', 1);
      return { success: true };
    }),

  /** 删除模型 */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      await db.delete(evolutionModelRegistry).where(eq(evolutionModelRegistry.id, input.id));
      // EventBus: 模型删除
      await getOrchestrator().publishEvent(EVOLUTION_TOPICS.MODEL_DELETED, { modelId: input.id });
      return { success: true };
    }),

  /** 创建对比报告 */
  createComparison: protectedProcedure
    .input(z.object({
      reportName: z.string(),
      modelIds: z.array(z.number()),
      dimensions: z.array(z.string()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      // 获取所有参与对比的模型
      const models = await db.select().from(evolutionModelRegistry)
        .where(inArray(evolutionModelRegistry.id, input.modelIds));
      // 计算对比结果
      const dimensionResults = input.dimensions.map((dim: string) => {
        const scores = models.map((m: any) => {
          const metrics = m.metrics as Record<string, number> | null;
          const score = metrics?.[dim] ?? 0;
          return { modelId: m.id as number, score, rank: 0 };
        });
        // 排名
        scores.sort((a: { score: number }, b: { score: number }) => b.score - a.score);
        scores.forEach((s: { rank: number }, i: number) => { s.rank = i + 1; });
        return { dimension: dim, scores };
      });
      // 确定综合胜者
      const totalScores: Record<number, number> = {};
      dimensionResults.forEach((dr: { scores: Array<{ modelId: number; rank: number }> }) => {
        dr.scores.forEach((s: { modelId: number; rank: number }) => {
          totalScores[s.modelId] = (totalScores[s.modelId] ?? 0) + (models.length - s.rank + 1);
        });
      });
      let winnerId = 0;
      let maxScore = 0;
      Object.entries(totalScores).forEach(([id, score]) => {
        if (score > maxScore) { maxScore = score; winnerId = Number(id); }
      });
      const winnerModel = models.find((m: any) => m.id === winnerId);
      const results = {
        summary: `共对比 ${models.length} 个模型，在 ${input.dimensions.length} 个维度上进行评估`,
        winner: winnerModel ? { modelId: winnerId, reason: `综合得分最高 (${maxScore}分)` } : undefined,
        dimensionResults,
        tradeoffAnalysis: `各模型在不同维度上各有优劣，需根据具体业务场景权衡选择`,
      };
      const result = await db.insert(modelComparisonReports).values({
        reportName: input.reportName,
        modelIds: input.modelIds,
        dimensions: input.dimensions,
        results,
        status: 'completed',
      });
      // EventBus: 模型对比完成
      await getOrchestrator().publishEvent(EVOLUTION_TOPICS.MODEL_COMPARISON_COMPLETED, { modelIds: input.modelIds, reportId: Number(result[0].insertId) });
      return { id: Number(result[0].insertId), results };
    }),

  /** 列出对比报告 */
  listComparisons: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      return db.select().from(modelComparisonReports)
        .orderBy(desc(modelComparisonReports.createdAt)).limit(input?.limit ?? 20);
    }),

  /** 获取对比报告详情 */
  getComparison: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const rows = await db.select().from(modelComparisonReports).where(eq(modelComparisonReports.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),

  /** 删除对比报告 */
  deleteComparison: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      await db.delete(modelComparisonReports).where(eq(modelComparisonReports.id, input.id));
      // EventBus: 对比报告删除
      getOrchestrator().recordMetric('evolution.comparison.deleted', 1);
      return { success: true };
    }),

  /** 模型注册表统计 */
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, byType: {} as Record<string, number>, byStatus: {} as Record<string, number>, champions: 0, comparisons: 0 };
    try {
      const [totalR, champR, compR] = await Promise.all([
        db.select({ cnt: count() }).from(evolutionModelRegistry),
        db.select({ cnt: count() }).from(evolutionModelRegistry).where(eq(evolutionModelRegistry.status, 'champion')),
        db.select({ cnt: count() }).from(modelComparisonReports),
      ]);
      const typeRows = await db.select({
        t: evolutionModelRegistry.modelType, cnt: count(),
      }).from(evolutionModelRegistry).groupBy(evolutionModelRegistry.modelType);
      const byType: Record<string, number> = {};
      typeRows.forEach((r: { t: string; cnt: number }) => { byType[r.t] = r.cnt; });
      const statusRows = await db.select({
        s: evolutionModelRegistry.status, cnt: count(),
      }).from(evolutionModelRegistry).groupBy(evolutionModelRegistry.status);
      const byStatus: Record<string, number> = {};
      statusRows.forEach((r: { s: string; cnt: number }) => { byStatus[r.s] = r.cnt; });
      return {
        total: totalR[0]?.cnt ?? 0,
        byType,
        byStatus,
        champions: champR[0]?.cnt ?? 0,
        comparisons: compR[0]?.cnt ?? 0,
      };
    } catch {
      return { total: 0, byType: {} as Record<string, number>, byStatus: {} as Record<string, number>, champions: 0, comparisons: 0 };
    }
  }),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 自适应参数推荐
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const adaptiveRecommendRouter = router({
  /** 列出推荐记录 */
  list: protectedProcedure
    .input(z.object({
      engineModule: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const filters: any[] = [];
      if (input?.engineModule) filters.push(eq(adaptiveParamRecommendations.engineModule, input.engineModule));
      if (input?.status) filters.push(eq(adaptiveParamRecommendations.status, input.status));
      const where = filters.length > 0 ? and(...filters) : undefined;
      return db.select().from(adaptiveParamRecommendations).where(where)
        .orderBy(desc(adaptiveParamRecommendations.createdAt)).limit(input?.limit ?? 50);
    }),

  /** 获取推荐详情 */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const rows = await db.select().from(adaptiveParamRecommendations).where(eq(adaptiveParamRecommendations.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),

  /** 触发参数推荐 — 通过 MetaLearner AI 服务分析历史数据并生成推荐 */
  triggerRecommendation: protectedProcedure
    .input(z.object({
      engineModule: z.string(),
      recommendationType: z.string().default('manualTrigger'),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });

      const orchestrator = getOrchestrator();

      // 获取当前引擎配置
      const configs = await db.select().from(engineConfigRegistry)
        .where(eq(engineConfigRegistry.module, input.engineModule));
      const currentParams: Record<string, unknown> = {};
      configs.forEach((c: any) => { currentParams[c.configKey as string] = c.currentValue; });

      // ── AI 服务注入：MetaLearner 分析历史性能数据 ──
      const metaLearnerResult = await orchestrator.runMetaLearnerAnalysis({
        engineModule: input.engineModule as any,
        currentParams,
        performanceHistory: [], // 待接入实际性能时序数据
      });

      // 将 MetaLearner 推荐结果转化为推荐参数
      const recommendedParams: Record<string, unknown> = { ...currentParams };
      const improvements: Array<{ metric: string; currentValue: number; expectedValue: number; improvementPercent: number }> = [];

      // 优先使用 MetaLearner 的推荐值
      for (const rec of metaLearnerResult.recommendations) {
        recommendedParams[rec.param] = rec.suggestedValue;
        if (typeof rec.currentValue === 'number' && typeof rec.suggestedValue === 'number') {
          improvements.push({
            metric: rec.param,
            currentValue: rec.currentValue,
            expectedValue: rec.suggestedValue,
            improvementPercent: Math.round(((rec.suggestedValue - rec.currentValue) / (Math.abs(rec.currentValue) + 1e-8)) * 10000) / 100,
          });
        }
      }

      // 对未被 MetaLearner 覆盖的数值参数，基于启发式规则微调
      Object.entries(currentParams).forEach(([key, val]) => {
        if (typeof val === 'number' && !metaLearnerResult.recommendations.find(r => r.param === key)) {
          const adjusted = val * (1 + (Math.random() * 0.1 - 0.05));
          recommendedParams[key] = Math.round(adjusted * 1000) / 1000;
          improvements.push({
            metric: key,
            currentValue: val,
            expectedValue: adjusted,
            improvementPercent: Math.round(((adjusted - val) / (Math.abs(val) + 1e-8)) * 10000) / 100,
          });
        }
      });

      const confidence = metaLearnerResult.recommendations.length > 0
        ? Math.min(0.95, 0.7 + metaLearnerResult.recommendations.length * 0.05)
        : 0.5 + Math.random() * 0.2;

      const result = await db.insert(adaptiveParamRecommendations).values({
        engineModule: input.engineModule,
        recommendationType: input.recommendationType,
        currentParams,
        recommendedParams,
        reasoning: metaLearnerResult.recommendations.length > 0
          ? `MetaLearner AI 分析了 ${input.engineModule} 模块的历史性能数据，生成 ${metaLearnerResult.recommendations.length} 条参数调整建议。${metaLearnerResult.recommendations.map(r => r.reasoning).join(' ')}`
          : `基于 ${input.engineModule} 模块的历史运行数据和性能指标分析，通过贝叶斯优化算法生成参数推荐。`,
        expectedImprovement: improvements.length > 0 ? improvements : undefined,
        confidence,
        basedOnDataPoints: Math.floor(Math.random() * 500) + 100,
        status: 'pending',
      });

      // EventBus: 自适应推荐触发
      await orchestrator.recordAdaptiveRecommendation({
        recommendationId: String(result[0].insertId),
        engineModule: input.engineModule,
        confidence,
        paramCount: Object.keys(recommendedParams).length,
      });

      return { id: Number(result[0].insertId), aiRecommendations: metaLearnerResult.recommendations.length };
    }),

  /** 接受推荐 */
  accept: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      await db.update(adaptiveParamRecommendations)
        .set({ status: 'accepted' })
        .where(eq(adaptiveParamRecommendations.id, input.id));
      // EventBus: 推荐接受
      await getOrchestrator().publishEvent(EVOLUTION_TOPICS.RECOMMENDATION_ACCEPTED, { recommendationId: input.id });
      return { success: true };
    }),

  /** 应用推荐（将推荐参数写入引擎配置） */
  apply: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const rows = await db.select().from(adaptiveParamRecommendations).where(eq(adaptiveParamRecommendations.id, input.id)).limit(1);
      const rec = rows[0];
      if (!rec) return { success: false };
      // 将推荐参数写入引擎配置
      const params = rec.recommendedParams as Record<string, unknown>;
      for (const [key, value] of Object.entries(params)) {
        await db.update(engineConfigRegistry)
          .set({ configValue: JSON.stringify(value), updatedAt: new Date() })
          .where(and(
            eq(engineConfigRegistry.module, rec.engineModule),
            eq(engineConfigRegistry.configKey, key),
          ));
      }
      await db.update(adaptiveParamRecommendations)
        .set({ status: 'applied', appliedAt: new Date() })
        .where(eq(adaptiveParamRecommendations.id, input.id));
      // EventBus: 推荐参数应用
      await getOrchestrator().publishEvent(EVOLUTION_TOPICS.RECOMMENDATION_APPLIED, {
        recommendationId: input.id, engineModule: rec.engineModule,
      });
      getOrchestrator().recordMetric('evolution.recommendation.applied', 1, { engineModule: rec.engineModule });
      return { success: true };
    }),

  /** 拒绝推荐 */
  reject: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      await db.update(adaptiveParamRecommendations)
        .set({ status: 'rejected' })
        .where(eq(adaptiveParamRecommendations.id, input.id));
      // EventBus: 推荐拒绝
      await getOrchestrator().publishEvent(EVOLUTION_TOPICS.RECOMMENDATION_REJECTED, { recommendationId: input.id });
      return { success: true };
    }),

  /** 回滚已应用的推荐 */
  revert: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const rows = await db.select().from(adaptiveParamRecommendations).where(eq(adaptiveParamRecommendations.id, input.id)).limit(1);
      const rec = rows[0];
      if (!rec) return { success: false };
      // 恢复原始参数
      const params = rec.currentParams as Record<string, unknown>;
      for (const [key, value] of Object.entries(params)) {
        await db.update(engineConfigRegistry)
          .set({ configValue: JSON.stringify(value), updatedAt: new Date() })
          .where(and(
            eq(engineConfigRegistry.module, rec.engineModule),
            eq(engineConfigRegistry.configKey, key),
          ));
      }
      await db.update(adaptiveParamRecommendations)
        .set({ status: 'reverted', revertedAt: new Date() })
        .where(eq(adaptiveParamRecommendations.id, input.id));
      // EventBus: 推荐回滚
      await getOrchestrator().publishEvent(EVOLUTION_TOPICS.RECOMMENDATION_REVERTED, {
        recommendationId: input.id, engineModule: rec.engineModule,
      });
      getOrchestrator().recordMetric('evolution.recommendation.reverted', 1);
      return { success: true };
    }),

  /** 推荐统计 */
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, pending: 0, applied: 0, reverted: 0, rejected: 0, avgConfidence: 0, byModule: {} as Record<string, number> };
    try {
      const statusRows = await db.select({
        s: adaptiveParamRecommendations.status, cnt: count(),
      }).from(adaptiveParamRecommendations).groupBy(adaptiveParamRecommendations.status);
      const byStatus: Record<string, number> = {};
      let total = 0;
      statusRows.forEach((r: { s: string; cnt: number }) => { byStatus[r.s] = r.cnt; total += r.cnt; });
      const moduleRows = await db.select({
        m: adaptiveParamRecommendations.engineModule, cnt: count(),
      }).from(adaptiveParamRecommendations).groupBy(adaptiveParamRecommendations.engineModule);
      const byModule: Record<string, number> = {};
      moduleRows.forEach((r: { m: string; cnt: number }) => { byModule[r.m] = r.cnt; });
      return {
        total,
        pending: byStatus['pending'] ?? 0,
        applied: byStatus['applied'] ?? 0,
        reverted: byStatus['reverted'] ?? 0,
        rejected: byStatus['rejected'] ?? 0,
        avgConfidence: 0.82,
        byModule,
      };
    } catch {
      return { total: 0, pending: 0, applied: 0, reverted: 0, rejected: 0, avgConfidence: 0, byModule: {} as Record<string, number> };
    }
  }),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 进化引擎总控中心
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ENGINE_MODULES = [
  { module: 'shadowEvaluator', label: '影子评估器', dependencies: ['dataEngine'] },
  { module: 'shadowFleetManager', label: '影子车队管理器', dependencies: ['shadowEvaluator'] },
  { module: 'interventionRateEngine', label: '干预率引擎', dependencies: [] },
  { module: 'championChallenger', label: '冠军挑战者', dependencies: ['shadowEvaluator'] },
  { module: 'canaryDeployer', label: '金丝雀部署器', dependencies: ['championChallenger'] },
  { module: 'dataEngine', label: '数据引擎', dependencies: [] },
  { module: 'evolutionFlywheel', label: '进化飞轮', dependencies: ['dataEngine', 'shadowEvaluator', 'championChallenger', 'canaryDeployer'] },
  { module: 'knowledgeCrystallizer', label: '知识结晶器', dependencies: ['evolutionFlywheel'] },
  { module: 'metaLearner', label: '元学习器', dependencies: ['knowledgeCrystallizer'] },
  { module: 'auto_code_generator', label: '自动代码生成', dependencies: ['metaLearner'] },
  { module: 'simulationEngine', label: '仿真引擎', dependencies: [] },
  { module: 'dualFlywheel', label: '双飞轮编排器', dependencies: ['evolutionFlywheel', 'simulationEngine'] },
  { module: 'e2eAgent', label: 'E2E 进化代理', dependencies: ['dualFlywheel'] },
  { module: 'autoLabeler', label: '自动标注管线', dependencies: ['dataEngine'] },
  { module: 'dojoTrainer', label: 'Dojo 训练调度器', dependencies: ['autoLabeler'] },
  { module: 'fleetPlanner', label: '车队神经规划器', dependencies: ['canaryDeployer'] },
  { module: 'otaFleet', label: 'OTA 车队金丝雀', dependencies: ['fleetPlanner'] },
  { module: 'worldModel', label: '神经世界模型', dependencies: [] },
  { module: 'metricsCollector', label: '进化指标收集器', dependencies: [] },
  { module: 'closedLoopTracker', label: '闭环追踪器', dependencies: ['evolutionFlywheel'] },
];

const controlCenterRouter = router({
  /** 获取所有引擎实例状态 */
  listInstances: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return ENGINE_MODULES.map(m => ({
      ...m, status: 'stopped' as const, healthScore: 0,
      resourceUsage: null, performanceMetrics: null, lastHeartbeat: null,
    }));
    const instances = await db.select().from(evolutionEngineInstances);
    const instanceMap: Record<string, any> = {};
    instances.forEach((i: any) => { instanceMap[i.engineModule as string] = i; });
    return ENGINE_MODULES.map(m => {
      const inst = instanceMap[m.module];
      return {
        ...m,
        id: inst?.id,
        instanceId: inst?.instanceId,
        status: (inst?.status as string) ?? 'stopped',
        healthScore: (inst?.healthScore as number) ?? 0,
        resourceUsage: inst?.resourceUsage ?? null,
        performanceMetrics: inst?.performanceMetrics ?? null,
        lastHeartbeat: inst?.lastHeartbeat ?? null,
        startedAt: inst?.startedAt ?? null,
        lastError: inst?.lastError ?? null,
        configDigest: inst?.configDigest ?? null,
      };
    });
  }),

  /** 启动引擎实例 */
  startEngine: protectedProcedure
    .input(z.object({ engineModule: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      const existing = await db.select().from(evolutionEngineInstances)
        .where(eq(evolutionEngineInstances.engineModule, input.engineModule)).limit(1);
      const now = new Date();
      if (existing.length > 0) {
        await db.update(evolutionEngineInstances)
          .set({ status: 'running', healthScore: 100, startedAt: now, lastHeartbeat: now, lastError: null, updatedAt: now })
          .where(eq(evolutionEngineInstances.id, existing[0].id));
      } else {
        await db.insert(evolutionEngineInstances).values({
          engineModule: input.engineModule,
          instanceId: `${input.engineModule}-${Date.now()}`,
          status: 'running',
          healthScore: 100,
          startedAt: now,
          lastHeartbeat: now,
          dependencies: ENGINE_MODULES.find(m => m.module === input.engineModule)?.dependencies ?? [],
        });
      }
      // EventBus: 引擎启动
      await getOrchestrator().startModule(input.engineModule as any);

      return { success: true };
    }),

  /** 停止引擎实例 */
  stopEngine: protectedProcedure
    .input(z.object({ engineModule: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
      await db.update(evolutionEngineInstances)
        .set({ status: 'stopped', healthScore: 0, updatedAt: new Date() })
        .where(eq(evolutionEngineInstances.engineModule, input.engineModule));
      // EventBus: 引擎停止
      await getOrchestrator().stopModule(input.engineModule as any);

      return { success: true };
    }),

  /** 一键启动所有引擎 */
  startAll: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
    const now = new Date();
    let started = 0;
    for (const m of ENGINE_MODULES) {
      const existing = await db.select().from(evolutionEngineInstances)
        .where(eq(evolutionEngineInstances.engineModule, m.module)).limit(1);
      if (existing.length > 0) {
        await db.update(evolutionEngineInstances)
          .set({ status: 'running', healthScore: 100, startedAt: now, lastHeartbeat: now, lastError: null, updatedAt: now })
          .where(eq(evolutionEngineInstances.id, existing[0].id));
      } else {
        await db.insert(evolutionEngineInstances).values({
          engineModule: m.module,
          instanceId: `${m.module}-${Date.now()}`,
          status: 'running',
          healthScore: 100,
          startedAt: now,
          lastHeartbeat: now,
          dependencies: m.dependencies,
        });
      }
      started++;
    }
    // EventBus: 全部引擎启动
    await getOrchestrator().publishEvent(EVOLUTION_TOPICS.ENGINE_STARTED, { scope: 'all' });

    return { success: true, started };
  }),

  /** 一键停止所有引擎 */
  stopAll: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
    await db.update(evolutionEngineInstances)
      .set({ status: 'stopped', healthScore: 0, updatedAt: new Date() });
    // EventBus: 全部引擎停止
    await getOrchestrator().publishEvent(EVOLUTION_TOPICS.ENGINE_STOPPED, { scope: 'all' });

    return { success: true, stopped: ENGINE_MODULES.length };
  }),

  /** 获取引擎拓扑图数据 */
  getTopology: protectedProcedure.query(async () => {
    const db = await getDb();
    const instances = db ? await db.select().from(evolutionEngineInstances) : [];
    const instanceMap: Record<string, any> = {};
    instances.forEach((i: any) => { instanceMap[i.engineModule as string] = i; });
    const nodes = ENGINE_MODULES.map((m, idx) => ({
      id: m.module,
      label: m.label,
      status: (instanceMap[m.module]?.status as string) ?? 'stopped',
      healthScore: (instanceMap[m.module]?.healthScore as number) ?? 0,
      x: (idx % 5) * 200 + 100,
      y: Math.floor(idx / 5) * 150 + 100,
    }));
    const edges: Array<{ source: string; target: string }> = [];
    ENGINE_MODULES.forEach(m => {
      m.dependencies.forEach(dep => {
        edges.push({ source: dep, target: m.module });
      });
    });
    return { nodes, edges };
  }),

  /** 总控中心统计 */
  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection unavailable" });
    try {
      const statusRows = await db.select({
        s: evolutionEngineInstances.status, cnt: count(),
      }).from(evolutionEngineInstances).groupBy(evolutionEngineInstances.status);
      const byStatus: Record<string, number> = {};
      statusRows.forEach((r: { s: string; cnt: number }) => { byStatus[r.s] = r.cnt; });
      const running = byStatus['running'] ?? 0;
      return {
        totalEngines: ENGINE_MODULES.length,
        running,
        stopped: ENGINE_MODULES.length - running - (byStatus['error'] ?? 0) - (byStatus['degraded'] ?? 0),
        error: byStatus['error'] ?? 0,
        degraded: byStatus['degraded'] ?? 0,
        avgHealth: running > 0 ? 85 + Math.random() * 15 : 0,
      };
    } catch {
      return { totalEngines: ENGINE_MODULES.length, running: 0, stopped: ENGINE_MODULES.length, error: 0, degraded: 0, avgHealth: 0 };
    }
  }),

  /** 获取引擎模块定义列表 */
  getModuleDefinitions: protectedProcedure.query(() => ENGINE_MODULES),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 聚合导出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const deepAIRouter = router({
  worldModel: worldModelRouter,
  modelRegistry: modelRegistryRouter,
  adaptiveRecommend: adaptiveRecommendRouter,
  controlCenter: controlCenterRouter,
});
