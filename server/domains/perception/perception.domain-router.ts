/**
 * ============================================================================
 * 感知领域路由聚合 — ①感知闭环（Phase 1 增强版）
 * ============================================================================
 * 职责边界：数据采集 + 协议适配 + 工况管理 + 自适应采样 + 设备接入
 *           + BPA 配置管理 + 维度定义管理 + 状态向量日志
 */

import { router, publicProcedure, protectedProcedure } from '../../core/trpc';
import { z } from 'zod';
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('perception');
import { getDb } from '../../lib/db';
import { eq, and, desc, count } from 'drizzle-orm';
import {
  conditionProfiles,
  samplingConfigs,
  equipmentProfiles,
  bpaConfigs,
  stateVectorDimensions,
  stateVectorLogs,
} from '../../../drizzle/evolution-schema';
import { perceptionPersistenceService } from '../../platform/perception/services/perception-persistence.service';

// ============================================================================
// 工况管理路由（保持原有）
// ============================================================================

const conditionRouter = router({
  listProfiles: publicProcedure
    .input(z.object({
      industry: z.string().optional(),
      equipmentType: z.string().optional(),
      enabled: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { profiles: [], total: 0 };
      try {
        const conditions = [];
        if (input?.equipmentType) conditions.push(eq(conditionProfiles.equipmentType, input.equipmentType));
        if (input?.enabled !== undefined) conditions.push(eq(conditionProfiles.enabled, input.enabled));
        const rows = await db.select().from(conditionProfiles).orderBy(desc(conditionProfiles.id));
        const totalRows = await db.select({ cnt: count() }).from(conditionProfiles);
        return { profiles: rows, total: totalRows[0]?.cnt ?? 0 };
      } catch { return { profiles: [], total: 0 }; }
    }),

  getProfile: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return { profile: null };
    }),

  createProfile: publicProcedure
    .input(z.object({
      name: z.string(),
      industry: z.string(),
      equipmentType: z.string(),
      parameters: z.array(z.object({
        name: z.string(),
        range: z.tuple([z.number(), z.number()]),
        unit: z.string(),
        description: z.string(),
      })),
      sensorMapping: z.array(z.object({
        logicalName: z.string(),
        physicalChannel: z.string(),
        samplingRate: z.number(),
        unit: z.string(),
      })),
      thresholdStrategy: z.object({
        type: z.enum(['static', 'dynamic', 'worldmodel']),
        staticThresholds: z.record(z.string(), z.number()).optional(),
        dynamicConfig: z.object({
          baselineWindow: z.string(),
          sigma: z.number(),
        }).optional(),
      }),
      cognitionConfig: z.object({
        perceptionSensitivity: z.number(),
        reasoningDepth: z.number(),
        fusionStrategy: z.enum(['ds', 'bayesian', 'ensemble']),
        decisionUrgency: z.number(),
      }),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { id: 0, success: false };
      try {
        const result = await db.insert(conditionProfiles).values({
          name: input.name,
          industry: input.industry,
          equipmentType: input.equipmentType,
          parameters: input.parameters,
          sensorMapping: input.sensorMapping,
          thresholdStrategy: input.thresholdStrategy,
          cognitionConfig: input.cognitionConfig,
          enabled: true,
          version: '1.0.0',
        });
        return { id: Number(result[0].insertId), success: true };
      } catch (e) { log.warn({ err: e }, '[perception.createProfile] failed'); return { id: 0, success: false }; }
    }),

  switchCondition: publicProcedure
    .input(z.object({
      machineId: z.string(),
      profileId: z.number(),
      trigger: z.enum(['auto_detection', 'manual', 'scheduler', 'threshold_breach']),
    }))
    .mutation(async ({ input }) => {
      return { instanceId: 0, success: true };
    }),

  getCurrentCondition: publicProcedure
    .input(z.object({ machineId: z.string() }))
    .query(async ({ input }) => {
      return { instance: null, profile: null };
    }),

  getConditionHistory: publicProcedure
    .input(z.object({
      machineId: z.string(),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      return { history: [], total: 0 };
    }),
});

// ============================================================================
// 自适应采样路由（保持原有）
// ============================================================================

const samplingRouter = router({
  getConfig: publicProcedure
    .input(z.object({
      profileId: z.number(),
      cyclePhase: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return { configs: [] };
    }),

  updateConfig: publicProcedure
    .input(z.object({
      profileId: z.number(),
      cyclePhase: z.string(),
      baseSamplingRate: z.number(),
      highFreqSamplingRate: z.number(),
      highFreqTrigger: z.object({
        conditions: z.array(z.object({
          field: z.string(),
          operator: z.string(),
          threshold: z.number(),
        })),
        logic: z.enum(['and', 'or']),
      }).optional(),
      retentionPolicy: z.enum(['all', 'features_only', 'aggregated', 'sampled']),
      compression: z.enum(['none', 'delta', 'fft', 'wavelet']),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      try {
        const existing = await db.select().from(samplingConfigs)
          .where(and(
            eq(samplingConfigs.profileId, input.profileId),
            eq(samplingConfigs.cyclePhase, input.cyclePhase)
          )).limit(1);
        if (existing.length > 0) {
          await db.update(samplingConfigs).set({
            baseSamplingRate: input.baseSamplingRate,
            highFreqSamplingRate: input.highFreqSamplingRate,
            highFreqTrigger: input.highFreqTrigger ?? null,
            retentionPolicy: input.retentionPolicy,
            compression: input.compression,
            updatedAt: new Date(),
          }).where(eq(samplingConfigs.id, existing[0].id));
        } else {
          await db.insert(samplingConfigs).values({
            profileId: input.profileId,
            cyclePhase: input.cyclePhase,
            baseSamplingRate: input.baseSamplingRate,
            highFreqSamplingRate: input.highFreqSamplingRate,
            highFreqTrigger: input.highFreqTrigger ?? null,
            retentionPolicy: input.retentionPolicy,
            compression: input.compression,
            enabled: true,
          });
        }
        return { success: true };
      } catch (e) { log.warn({ err: e }, '[perception.updateConfig] failed'); return { success: false }; }
    }),

  getStats: publicProcedure
    .input(z.object({ machineId: z.string() }))
    .query(async ({ input }) => {
      return {
        currentRate: 0,
        dataReduction: 0,
        bufferUsage: 0,
      };
    }),
});

// ============================================================================
// 统一状态向量路由（增强）
// ============================================================================

const stateVectorRouter = router({
  getLatest: publicProcedure
    .input(z.object({ machineId: z.string() }))
    .query(async ({ input }) => {
      return { stateVector: null, timestamp: null };
    }),

  getHistory: publicProcedure
    .input(z.object({
      machineId: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      resolution: z.enum(['raw', '1min', '5min', '1hour']).default('5min'),
    }))
    .query(async ({ input }) => {
      return { vectors: [], total: 0 };
    }),

  /** 查询状态向量日志（Phase 1 新增） */
  getLogs: publicProcedure
    .input(z.object({
      machineId: z.string(),
      limit: z.number().default(100),
    }))
    .query(async ({ input }) => {
      return await perceptionPersistenceService.queryStateVectorLogs(
        input.machineId,
        input.limit,
      );
    }),
});

// ============================================================================
// BPA 配置管理路由（Phase 1 新增）
// ============================================================================

const bpaConfigRouter = router({
  /** 列出 BPA 配置 */
  list: publicProcedure
    .input(z.object({
      equipmentType: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await perceptionPersistenceService.listBpaConfigs(input?.equipmentType);
    }),

  /** 加载指定设备类型的 BPA 配置 */
  load: publicProcedure
    .input(z.object({
      equipmentType: z.string(),
      conditionPhase: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return await perceptionPersistenceService.loadBpaConfig(
        input.equipmentType,
        input.conditionPhase,
      );
    }),

  /** 保存 BPA 配置 */
  save: publicProcedure
    .input(z.object({
      name: z.string(),
      equipmentType: z.string(),
      hypotheses: z.array(z.string()),
      rules: z.array(z.object({
        source: z.string(),
        hypothesis: z.string(),
        functionType: z.enum(['trapezoidal', 'triangular', 'gaussian']),
        params: z.record(z.string(), z.number()),
      })),
      conditionPhase: z.string().optional(),
      version: z.string().optional(),
      description: z.string().optional(),
      ignoranceBase: z.number().optional(),
      minMassThreshold: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { name, equipmentType, hypotheses, rules, ...options } = input;
      const config = { hypotheses, rules: rules as any };
      const id = await perceptionPersistenceService.saveBpaConfig(
        name,
        equipmentType,
        config,
        options,
      );
      return { id, success: id !== null };
    }),

  /** 切换 BPA 配置启用状态 */
  toggleEnabled: publicProcedure
    .input(z.object({
      id: z.number(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      try {
        await db.update(bpaConfigs)
          .set({ enabled: input.enabled, updatedAt: new Date() })
          .where(eq(bpaConfigs.id, input.id));
        return { success: true };
      } catch (e) {
        log.warn({ err: e }, '[bpaConfig.toggleEnabled] failed');
        return { success: false };
      }
    }),

  /** 初始化默认种子数据 */
  seedDefaults: publicProcedure
    .mutation(async () => {
      await perceptionPersistenceService.seedDefaultConfigs();
      return { success: true };
    }),
});

// ============================================================================
// 维度定义管理路由（Phase 1 新增）
// ============================================================================

const dimensionRouter = router({
  /** 列出维度定义 */
  list: publicProcedure
    .input(z.object({
      equipmentType: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await perceptionPersistenceService.listDimensionDefs(input?.equipmentType);
    }),

  /** 加载指定设备类型的维度定义 */
  load: publicProcedure
    .input(z.object({
      equipmentType: z.string(),
    }))
    .query(async ({ input }) => {
      return await perceptionPersistenceService.loadDimensionDefs(input.equipmentType);
    }),

  /** 批量保存维度定义 */
  saveBatch: publicProcedure
    .input(z.object({
      equipmentType: z.string(),
      version: z.string().default('1.0.0'),
      dimensions: z.array(z.object({
        index: z.number(),
        key: z.string(),
        label: z.string(),
        unit: z.string(),
        group: z.enum(['cycle_features', 'uncertainty_factors', 'cumulative_metrics']),
        metricNames: z.array(z.string()),
        aggregation: z.enum(['mean', 'max', 'min', 'rms', 'latest', 'sum', 'std']),
        defaultValue: z.number(),
        normalizeRange: z.tuple([z.number(), z.number()]),
        source: z.enum(['clickhouse', 'mysql', 'computed', 'external']),
        enabled: z.boolean().default(true),
      })),
    }))
    .mutation(async ({ input }) => {
      const success = await perceptionPersistenceService.saveDimensionDefs(
        input.equipmentType,
        input.dimensions as any,
        input.version,
      );
      return { success };
    }),

  /** 切换维度启用状态 */
  toggleEnabled: publicProcedure
    .input(z.object({
      id: z.number(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      try {
        await db.update(stateVectorDimensions)
          .set({ enabled: input.enabled, updatedAt: new Date() })
          .where(eq(stateVectorDimensions.id, input.id));
        return { success: true };
      } catch (e) {
        log.warn({ err: e }, '[dimension.toggleEnabled] failed');
        return { success: false };
      }
    }),
});

// ============================================================================
// 感知领域聚合路由
// ============================================================================

export const perceptionDomainRouter = router({
  condition: conditionRouter,
  sampling: samplingRouter,
  stateVector: stateVectorRouter,
  // Phase 1 新增
  bpaConfig: bpaConfigRouter,
  dimension: dimensionRouter,

  // ========== 前端仪表盘 Facade 方法 ==========

  /** 列出数据采集状态（PerceptionMonitor 页面使用） */
  listCollectionStatus: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      try {
        const configs = await db.select().from(samplingConfigs);
        const profiles = await db.select().from(conditionProfiles);
        const equipment = await db.select().from(equipmentProfiles);

        const groupByProfile = new Map<number, typeof configs>();
        for (const cfg of configs) {
          const arr = groupByProfile.get(cfg.profileId) ?? [];
          arr.push(cfg);
          groupByProfile.set(cfg.profileId, arr);
        }

        const result: Array<{
          equipmentId: string;
          sensorCount: number;
          samplingRateHz: number;
          bufferUsage: number;
          backpressure: 'normal' | 'warning' | 'critical';
          protocol: string;
          lastDataAt: string;
        }> = [];

        for (const eq of equipment) {
          const profile = profiles.find(p => p.equipmentType === eq.type);
          const cfgs = profile ? (groupByProfile.get(profile.id) ?? []) : [];
          const maxRate = cfgs.reduce((max, c) => Math.max(max, c.highFreqSamplingRate), 0);
          const baseRate = cfgs.reduce((max, c) => Math.max(max, c.baseSamplingRate), 1);
          const ratio = maxRate > 0 ? maxRate / baseRate : 1;
          const backpressure = ratio > 2.5 ? 'critical' as const : ratio > 1.5 ? 'warning' as const : 'normal' as const;

          result.push({
            equipmentId: `EQ-${String(eq.id).padStart(3, '0')}`,
            sensorCount: profile?.sensorMapping?.length ?? 4,
            samplingRateHz: maxRate || baseRate,
            bufferUsage: Math.min(ratio * 0.3, 0.95),
            backpressure,
            protocol: eq.type.includes('pump') ? 'OPC-UA' : 'MQTT',
            lastDataAt: eq.updatedAt?.toISOString() ?? new Date().toISOString(),
          });
        }

        return result;
      } catch { return []; }
    }),

  /** 获取融合质量指标（PerceptionMonitor 页面使用） */
  getFusionQuality: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return {
        overallConfidence: 0, conflictRate: 0, evidenceSources: 0, uncertaintyLevel: 0, lastFusionAt: '',
      };
      try {
        const { cognitionSessions } = await import('../../../drizzle/evolution-schema');
        const sessions = await db.select().from(cognitionSessions)
          .where(eq(cognitionSessions.status, 'completed'))
          .orderBy(desc(cognitionSessions.completedAt))
          .limit(10);

        if (sessions.length === 0) {
          return { overallConfidence: 0, conflictRate: 0, evidenceSources: 0, uncertaintyLevel: 0, lastFusionAt: '' };
        }

        let totalConfidence = 0;
        let cnt = 0;
        for (const s of sessions) {
          const scores = [s.safetyScore, s.healthScore, s.efficiencyScore].filter((v): v is number => v !== null);
          if (scores.length > 0) {
            totalConfidence += scores.reduce((a, b) => a + b, 0) / scores.length;
            cnt++;
          }
        }

        const avgConfidence = cnt > 0 ? Math.round((totalConfidence / cnt) * 100) / 100 : 0;
        const equipmentCount = new Set(sessions.map(s => s.machineId)).size;

        return {
          overallConfidence: avgConfidence,
          conflictRate: Math.round((1 - avgConfidence) * 0.5 * 100) / 100,
          evidenceSources: equipmentCount * 4,
          uncertaintyLevel: Math.round((1 - avgConfidence) * 100) / 100,
          lastFusionAt: sessions[0]?.completedAt?.toISOString() ?? '',
        };
      } catch {
        return { overallConfidence: 0, conflictRate: 0, evidenceSources: 0, uncertaintyLevel: 0, lastFusionAt: '' };
      }
    }),

  /** 列出工况模板（PerceptionMonitor 页面使用） */
  listConditionProfiles: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      try {
        const profiles = await db.select().from(conditionProfiles);
        return profiles.map(p => ({
          id: p.id,
          name: p.name,
          active: p.enabled,
          equipmentCount: 1,
          features: p.sensorMapping?.map((s: any) => s.logicalName) ?? [],
        }));
      } catch { return []; }
    }),

  // ========== Phase 1 新增 Facade 方法 ==========

  /** 获取感知层增强统计（Phase 1 仪表盘） */
  getPerceptionEnhancementStats: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return {
        bpaConfigCount: 0,
        dimensionCount: 0,
        logCount: 0,
        latestLogAt: null,
      };
      try {
        const bpaCount = await db.select({ cnt: count() }).from(bpaConfigs);
        const dimCount = await db.select({ cnt: count() }).from(stateVectorDimensions);
        const logCount = await db.select({ cnt: count() }).from(stateVectorLogs);
        const latestLog = await db.select()
          .from(stateVectorLogs)
          .orderBy(desc(stateVectorLogs.synthesizedAt))
          .limit(1);

        return {
          bpaConfigCount: bpaCount[0]?.cnt ?? 0,
          dimensionCount: dimCount[0]?.cnt ?? 0,
          logCount: logCount[0]?.cnt ?? 0,
          latestLogAt: latestLog[0]?.synthesizedAt?.toISOString() ?? null,
        };
      } catch {
        return { bpaConfigCount: 0, dimensionCount: 0, logCount: 0, latestLogAt: null };
      }
    }),
});
