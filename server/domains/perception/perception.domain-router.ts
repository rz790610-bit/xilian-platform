/**
 * ============================================================================
 * 感知领域路由聚合 — ①感知闭环
 * ============================================================================
 * 职责边界：数据采集 + 协议适配 + 工况管理 + 自适应采样 + 设备接入
 */

import { router, publicProcedure, protectedProcedure } from '../../core/trpc';
import { z } from 'zod';
import { getDb } from '../../lib/db';
import { eq, desc, count } from 'drizzle-orm';
import {
  conditionProfiles,
  samplingConfigs,
  equipmentProfiles,
} from '../../../drizzle/evolution-schema';

// ============================================================================
// 工况管理路由（新增）
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
      } catch (e) { console.error('[perception.createProfile]', e); return { id: 0, success: false }; }
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
// 自适应采样路由（增强）
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
        // Upsert: try update first, insert if not exists
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
      } catch (e) { console.error('[perception.updateConfig]', e); return { success: false }; }
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
// 统一状态向量路由（新增）
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
});

// ============================================================================
// 感知领域聚合路由
// ============================================================================

export const perceptionDomainRouter = router({
  condition: conditionRouter,
  sampling: samplingRouter,
  stateVector: stateVectorRouter,

  // ========== 前端仪表盘 Facade 方法 ==========

  /** 列出数据采集状态（PerceptionMonitor 页面使用） */
  listCollectionStatus: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      try {
        // samplingConfigs 字段: id, profileId, cyclePhase, baseSamplingRate, highFreqSamplingRate, ...
        // 用 profileId 分组聚合采集状态
        const configs = await db.select().from(samplingConfigs);
        const profiles = await db.select().from(conditionProfiles);
        const equipment = await db.select().from(equipmentProfiles);

        // 按 profileId 分组
        const profileMap = new Map(profiles.map(p => [p.id, p]));
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

        // 为每台设备生成采集状态
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

        // 从安全/健康/效率评分中计算融合质量
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
});
