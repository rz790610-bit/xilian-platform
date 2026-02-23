/**
 * ============================================================================
 * 数字孪生赋能工具 — 运行配置 tRPC Router
 * ============================================================================
 *
 * 端点清单：
 *   Query:
 *     1. listLayers          — 获取 7 层熔断开关列表
 *     2. listConfigs         — 按模块/层级获取配置项列表
 *     3. getConfig           — 获取单个配置项详情
 *     4. getModuleConfigs    — 获取某模块全部配置项
 *     5. getAuditLog         — 查询配置变更审计日志
 *     6. listSnapshots       — 获取配置快照列表
 *     7. getSnapshot         — 获取单个快照详情
 *     8. getSimulationRuns   — 获取仿真运行记录
 *     9. compareConfigs      — 配置对比（两个快照或当前 vs 快照）
 *
 *   Mutation:
 *     10. updateConfig        — 更新单个配置项
 *     11. batchUpdateConfigs  — 批量更新某层/模块的配置
 *     12. resetConfig         — 重置配置项为默认值
 *     13. toggleLayer         — 切换层级熔断开关
 *     14. createSnapshot      — 手动创建配置快照
 *     15. rollbackToSnapshot  — 回滚到指定快照
 *     16. simulateConfig      — 仿真运行配置（不影响真实孪生体）
 *     17. toggleModule        — 启停模块
 */
import { router, protectedProcedure, publicProcedure } from '../../core/trpc';
import { z } from 'zod';
import { getDb } from '../../lib/db';
import { eq, and, desc, asc, sql, inArray, like } from 'drizzle-orm';
import {
  engineConfigRegistry,
  twinLayerSwitches,
  twinConfigAuditLog,
  twinConfigSnapshot,
  twinConfigSimulationRuns,
} from '../../../drizzle/evolution-schema';
import { createModuleLogger } from '../../core/logger';
import crypto from 'crypto';

const log = createModuleLogger('twinConfig');

// ============================================================================
// 层级 → 模块映射（与 v3.0 文档一致）
// ============================================================================
const LAYER_MODULE_MAP: Record<string, string[]> = {
  L1: ['deviceSampling'],
  L2: ['stateSyncEngine'],
  L3: ['worldModel', 'physicsValidator', 'vectorStore'],
  L4: ['hybridOrchestrator', 'grokEnhancer', 'experiencePool', 'causalGraph', 'feedbackLoop', 'uncertaintyQuantifier', 'rulPredictor'],
  L5: ['simulationEngine', 'replayEngine'],
  L6: ['outboxRelay', 'twinEventBus'],
  L7: ['bullmq'],
};

const MODULE_LAYER_MAP: Record<string, string> = {};
for (const [layer, modules] of Object.entries(LAYER_MODULE_MAP)) {
  for (const m of modules) MODULE_LAYER_MAP[m] = layer;
}

// ============================================================================
// 辅助函数
// ============================================================================
function computeChecksum(data: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16);
}

/**
 * 计算配置变更影响评分（0-100）
 * 基于模块优先级 + 变更幅度
 */
function computeImpactScore(module: string, configKey: string, oldValue: unknown, newValue: unknown): number {
  const criticalModules: Record<string, number> = {
    worldModel: 30, hybridOrchestrator: 25, grokEnhancer: 25,
    stateSyncEngine: 20, simulationEngine: 15, physicsValidator: 15,
  };
  let score = criticalModules[module] ?? 10;
  // 关键配置项加分
  const criticalKeys = ['enabled', 'circuitBreaker.enabled', 'dailyGrokBudget', 'pollingIntervalMs', 'predictionWindowMinutes'];
  if (criticalKeys.some(k => configKey.includes(k))) score += 20;
  // 数值变更幅度
  if (typeof oldValue === 'number' && typeof newValue === 'number' && oldValue !== 0) {
    const changeRatio = Math.abs((newValue - oldValue) / oldValue);
    score += Math.min(30, Math.round(changeRatio * 100));
  }
  return Math.min(100, score);
}

// ============================================================================
// Router
// ============================================================================
export const twinConfigRouter = router({
  // ========================================================================
  // Query 端点
  // ========================================================================

  /** 1. 获取 7 层熔断开关列表 */
  listLayers: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    try {
      const rows = await db.select().from(twinLayerSwitches).orderBy(asc(twinLayerSwitches.priority));
      return rows.map(r => ({
        ...r,
        modules: LAYER_MODULE_MAP[r.layerId] ?? [],
      }));
    } catch (err) {
      log.warn({ err: String(err) }, '[listLayers] Error');
      return [];
    }
  }),

  /** 2. 按模块/层级获取配置项列表 */
  listConfigs: publicProcedure
    .input(z.object({
      module: z.string().optional(),
      layerId: z.string().optional(),
      configGroup: z.string().optional(),
      enabledOnly: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const conditions = [];
        if (input.module) {
          conditions.push(eq(engineConfigRegistry.module, input.module));
        } else if (input.layerId) {
          const modules = LAYER_MODULE_MAP[input.layerId];
          if (modules?.length) {
            conditions.push(inArray(engineConfigRegistry.module, modules));
          }
        }
        if (input.configGroup) {
          conditions.push(eq(engineConfigRegistry.configGroup, input.configGroup));
        }
        if (input.enabledOnly) {
          conditions.push(eq(engineConfigRegistry.enabled, 1));
        }
        const rows = await db.select().from(engineConfigRegistry)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(asc(engineConfigRegistry.module), asc(engineConfigRegistry.sortOrder));
        return rows;
      } catch (err) {
        log.warn({ err: String(err) }, '[listConfigs] Error');
        return [];
      }
    }),

  /** 3. 获取单个配置项详情 */
  getConfig: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      try {
        const rows = await db.select().from(engineConfigRegistry)
          .where(eq(engineConfigRegistry.id, input.id)).limit(1);
        return rows[0] ?? null;
      } catch (err) {
        log.warn({ err: String(err) }, '[getConfig] Error');
        return null;
      }
    }),

  /** 4. 获取某模块全部配置项（按 configGroup 分组） */
  getModuleConfigs: publicProcedure
    .input(z.object({ module: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { module: input.module, layerId: MODULE_LAYER_MAP[input.module] ?? 'unknown', groups: {} };
      try {
        const rows = await db.select().from(engineConfigRegistry)
          .where(eq(engineConfigRegistry.module, input.module))
          .orderBy(asc(engineConfigRegistry.sortOrder));
        const groups: Record<string, typeof rows> = {};
        for (const row of rows) {
          const g = row.configGroup ?? 'general';
          if (!groups[g]) groups[g] = [];
          groups[g].push(row);
        }
        return {
          module: input.module,
          layerId: MODULE_LAYER_MAP[input.module] ?? 'unknown',
          groups,
        };
      } catch (err) {
        log.warn({ err: String(err) }, '[getModuleConfigs] Error');
        return { module: input.module, layerId: MODULE_LAYER_MAP[input.module] ?? 'unknown', groups: {} };
      }
    }),

  /** 5. 查询配置变更审计日志 */
  getAuditLog: protectedProcedure
    .input(z.object({
      module: z.string().optional(),
      configKey: z.string().optional(),
      action: z.enum(['create', 'update', 'delete', 'rollback', 'batch_update', 'simulate']).optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      try {
        const conditions = [];
        if (input.module) conditions.push(eq(twinConfigAuditLog.module, input.module));
        if (input.configKey) conditions.push(eq(twinConfigAuditLog.configKey, input.configKey));
        if (input.action) conditions.push(eq(twinConfigAuditLog.action, input.action));
        const where = conditions.length ? and(...conditions) : undefined;
        const [items, countResult] = await Promise.all([
          db.select().from(twinConfigAuditLog)
            .where(where)
            .orderBy(desc(twinConfigAuditLog.createdAt))
            .limit(input.limit).offset(input.offset),
          db.select({ count: sql<number>`count(*)` }).from(twinConfigAuditLog).where(where),
        ]);
        return { items, total: Number(countResult[0]?.count ?? 0) };
      } catch (err) {
        log.warn({ err: String(err) }, '[getAuditLog] Error');
        return { items: [], total: 0 };
      }
    }),

  /** 6. 获取配置快照列表 */
  listSnapshots: publicProcedure
    .input(z.object({
      snapshotType: z.enum(['auto', 'manual', 'pre_rollback']).optional(),
      module: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const conditions = [];
        if (input.snapshotType) conditions.push(eq(twinConfigSnapshot.snapshotType, input.snapshotType));
        if (input.module) conditions.push(eq(twinConfigSnapshot.module, input.module));
        return await db.select().from(twinConfigSnapshot)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(twinConfigSnapshot.createdAt))
          .limit(input.limit);
      } catch (err) {
        log.warn({ err: String(err) }, '[listSnapshots] Error');
        return [];
      }
    }),

  /** 7. 获取单个快照详情 */
  getSnapshot: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      try {
        const rows = await db.select().from(twinConfigSnapshot)
          .where(eq(twinConfigSnapshot.id, input.id)).limit(1);
        return rows[0] ?? null;
      } catch (err) {
        log.warn({ err: String(err) }, '[getSnapshot] Error');
        return null;
      }
    }),

  /** 8. 获取仿真运行记录 */
  getSimulationRuns: protectedProcedure
    .input(z.object({
      module: z.string().optional(),
      limit: z.number().int().min(1).max(50).default(10),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const conditions = [];
        if (input.module) conditions.push(eq(twinConfigSimulationRuns.module, input.module));
        return await db.select().from(twinConfigSimulationRuns)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(twinConfigSimulationRuns.createdAt))
          .limit(input.limit);
      } catch (err) {
        log.warn({ err: String(err) }, '[getSimulationRuns] Error');
        return [];
      }
    }),

  /** 9. 配置对比（当前 vs 快照 或 快照 vs 快照） */
  compareConfigs: publicProcedure
    .input(z.object({
      snapshotIdA: z.number().int().positive().optional(),
      snapshotIdB: z.number().int().positive().optional(),
      module: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { diffs: [] };
      try {
        let configA: Record<string, unknown> = {};
        let configB: Record<string, unknown> = {};
        let labelA = '当前配置';
        let labelB = '快照';

        // 获取当前配置
        const getCurrentConfigs = async (mod?: string) => {
          const conditions = mod ? [eq(engineConfigRegistry.module, mod)] : [];
          const rows = await db.select().from(engineConfigRegistry)
            .where(conditions.length ? and(...conditions) : undefined);
          const result: Record<string, unknown> = {};
          for (const r of rows) result[`${r.module}.${r.configKey}`] = r.configValue;
          return result;
        };

        if (input.snapshotIdA && input.snapshotIdB) {
          // 快照 vs 快照
          const [snapA] = await db.select().from(twinConfigSnapshot).where(eq(twinConfigSnapshot.id, input.snapshotIdA)).limit(1);
          const [snapB] = await db.select().from(twinConfigSnapshot).where(eq(twinConfigSnapshot.id, input.snapshotIdB)).limit(1);
          configA = (snapA?.configData as Record<string, unknown>) ?? {};
          configB = (snapB?.configData as Record<string, unknown>) ?? {};
          labelA = snapA?.snapshotName ?? `快照 #${input.snapshotIdA}`;
          labelB = snapB?.snapshotName ?? `快照 #${input.snapshotIdB}`;
        } else if (input.snapshotIdB) {
          // 当前 vs 快照
          configA = await getCurrentConfigs(input.module);
          const [snapB] = await db.select().from(twinConfigSnapshot).where(eq(twinConfigSnapshot.id, input.snapshotIdB)).limit(1);
          configB = (snapB?.configData as Record<string, unknown>) ?? {};
          labelB = snapB?.snapshotName ?? `快照 #${input.snapshotIdB}`;
        } else {
          return { diffs: [] };
        }

        // 计算差异
        const allKeys = new Set([...Object.keys(configA), ...Object.keys(configB)]);
        const diffs = [];
        for (const key of allKeys) {
          const valA = JSON.stringify(configA[key]);
          const valB = JSON.stringify(configB[key]);
          if (valA !== valB) {
            diffs.push({ key, valueA: configA[key], valueB: configB[key] });
          }
        }
        return { labelA, labelB, diffs };
      } catch (err) {
        log.warn({ err: String(err) }, '[compareConfigs] Error');
        return { diffs: [] };
      }
    }),

  // ========================================================================
  // Mutation 端点
  // ========================================================================

  /** 10. 更新单个配置项 */
  updateConfig: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      configValue: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      try {
        // 获取旧值
        const [existing] = await db.select().from(engineConfigRegistry)
          .where(eq(engineConfigRegistry.id, input.id)).limit(1);
        if (!existing) throw new Error(`Config #${input.id} not found`);

        // 检查层级开关
        const layerId = MODULE_LAYER_MAP[existing.module];
        if (layerId) {
          const [layerSwitch] = await db.select().from(twinLayerSwitches)
            .where(eq(twinLayerSwitches.layerId, layerId)).limit(1);
          if (layerSwitch && !layerSwitch.enabled) {
            throw new Error(`Layer ${layerId} is disabled. Enable it first.`);
          }
        }

        const impactScore = computeImpactScore(
          existing.module, existing.configKey,
          existing.configValue, input.configValue,
        );

        // 更新配置
        await db.update(engineConfigRegistry)
          .set({ configValue: input.configValue, updatedAt: new Date() })
          .where(eq(engineConfigRegistry.id, input.id));

        // 写审计日志
        const userId = (ctx as any).user?.id ?? 'system';
        const userName = (ctx as any).user?.name ?? 'system';
        await db.insert(twinConfigAuditLog).values({
          userId,
          userName,
          module: existing.module,
          configKey: existing.configKey,
          action: 'update',
          oldValue: existing.configValue,
          newValue: input.configValue,
          impactScore,
          reason: input.reason,
        });

        log.info({ module: existing.module, key: existing.configKey, impactScore }, '[updateConfig] Config updated');
        return { success: true, impactScore };
      } catch (err) {
        log.warn({ err: String(err) }, '[updateConfig] Error');
        throw err;
      }
    }),

  /** 11. 批量更新某层/模块的配置 */
  batchUpdateConfigs: protectedProcedure
    .input(z.object({
      updates: z.array(z.object({
        id: z.number().int().positive(),
        configValue: z.string(),
      })).min(1).max(50),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      try {
        const userId = (ctx as any).user?.id ?? 'system';
        const userName = (ctx as any).user?.name ?? 'system';
        const results = [];

        // 先创建快照
        const allConfigs = await db.select().from(engineConfigRegistry);
        const snapshotData: Record<string, unknown> = {};
        for (const c of allConfigs) snapshotData[`${c.module}.${c.configKey}`] = c.configValue;
        await db.insert(twinConfigSnapshot).values({
          snapshotType: 'pre_rollback',
          snapshotName: `批量更新前自动快照 (${new Date().toISOString()})`,
          configData: snapshotData,
          checksum: computeChecksum(snapshotData),
          createdBy: userId,
        });

        for (const update of input.updates) {
          const [existing] = await db.select().from(engineConfigRegistry)
            .where(eq(engineConfigRegistry.id, update.id)).limit(1);
          if (!existing) continue;

          await db.update(engineConfigRegistry)
            .set({ configValue: update.configValue, updatedAt: new Date() })
            .where(eq(engineConfigRegistry.id, update.id));

          await db.insert(twinConfigAuditLog).values({
            userId, userName,
            module: existing.module,
            configKey: existing.configKey,
            action: 'batch_update',
            oldValue: existing.configValue,
            newValue: update.configValue,
            reason: input.reason,
          });

          results.push({ id: update.id, key: existing.configKey, success: true });
        }

        log.info({ count: results.length }, '[batchUpdateConfigs] Batch update completed');
        return { success: true, updated: results.length, results };
      } catch (err) {
        log.warn({ err: String(err) }, '[batchUpdateConfigs] Error');
        throw err;
      }
    }),

  /** 12. 重置配置项为默认值 */
  resetConfig: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      try {
        const [existing] = await db.select().from(engineConfigRegistry)
          .where(eq(engineConfigRegistry.id, input.id)).limit(1);
        if (!existing) throw new Error(`Config #${input.id} not found`);
        if (!existing.defaultValue) throw new Error('No default value available');

        const userId = (ctx as any).user?.id ?? 'system';
        const userName = (ctx as any).user?.name ?? 'system';

        await db.update(engineConfigRegistry)
          .set({ configValue: existing.defaultValue, updatedAt: new Date() })
          .where(eq(engineConfigRegistry.id, input.id));

        await db.insert(twinConfigAuditLog).values({
          userId, userName,
          module: existing.module,
          configKey: existing.configKey,
          action: 'rollback',
          oldValue: existing.configValue,
          newValue: existing.defaultValue,
          reason: '重置为默认值',
        });

        return { success: true, restoredValue: existing.defaultValue };
      } catch (err) {
        log.warn({ err: String(err) }, '[resetConfig] Error');
        throw err;
      }
    }),

  /** 13. 切换层级熔断开关 */
  toggleLayer: protectedProcedure
    .input(z.object({
      layerId: z.string(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      try {
        const userId = (ctx as any).user?.id ?? 'system';
        await db.update(twinLayerSwitches)
          .set({ enabled: input.enabled ? 1 : 0, updatedBy: userId, updatedAt: new Date() })
          .where(eq(twinLayerSwitches.layerId, input.layerId));

        await db.insert(twinConfigAuditLog).values({
          userId,
          userName: (ctx as any).user?.name ?? 'system',
          module: `layer:${input.layerId}`,
          configKey: 'enabled',
          action: 'update',
          oldValue: !input.enabled,
          newValue: input.enabled,
          reason: `层级 ${input.layerId} ${input.enabled ? '启用' : '禁用'}`,
        });

        log.info({ layerId: input.layerId, enabled: input.enabled }, '[toggleLayer] Layer switch toggled');
        return { success: true };
      } catch (err) {
        log.warn({ err: String(err) }, '[toggleLayer] Error');
        throw err;
      }
    }),

  /** 14. 手动创建配置快照 */
  createSnapshot: protectedProcedure
    .input(z.object({
      snapshotName: z.string().min(1).max(256),
      module: z.string().optional(),
      layerId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      try {
        const conditions = [];
        if (input.module) conditions.push(eq(engineConfigRegistry.module, input.module));
        else if (input.layerId) {
          const modules = LAYER_MODULE_MAP[input.layerId];
          if (modules?.length) conditions.push(inArray(engineConfigRegistry.module, modules));
        }
        const configs = await db.select().from(engineConfigRegistry)
          .where(conditions.length ? and(...conditions) : undefined);

        const configData: Record<string, unknown> = {};
        for (const c of configs) configData[`${c.module}.${c.configKey}`] = c.configValue;

        const layerSwitches = await db.select().from(twinLayerSwitches);

        const userId = (ctx as any).user?.id ?? 'system';
        const result = await db.insert(twinConfigSnapshot).values({
          snapshotType: 'manual',
          snapshotName: input.snapshotName,
          layerId: input.layerId,
          module: input.module,
          configData,
          layerSwitches: layerSwitches.map(l => ({ layerId: l.layerId, enabled: l.enabled })),
          checksum: computeChecksum(configData),
          createdBy: userId,
        });

        log.info({ name: input.snapshotName, configCount: configs.length }, '[createSnapshot] Snapshot created');
        return { success: true, snapshotId: Number(result[0].insertId) };
      } catch (err) {
        log.warn({ err: String(err) }, '[createSnapshot] Error');
        throw err;
      }
    }),

  /** 15. 回滚到指定快照 */
  rollbackToSnapshot: protectedProcedure
    .input(z.object({ snapshotId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      try {
        const [snapshot] = await db.select().from(twinConfigSnapshot)
          .where(eq(twinConfigSnapshot.id, input.snapshotId)).limit(1);
        if (!snapshot) throw new Error(`Snapshot #${input.snapshotId} not found`);

        const userId = (ctx as any).user?.id ?? 'system';
        const userName = (ctx as any).user?.name ?? 'system';

        // 先保存当前状态为 pre_rollback 快照
        const currentConfigs = await db.select().from(engineConfigRegistry);
        const currentData: Record<string, unknown> = {};
        for (const c of currentConfigs) currentData[`${c.module}.${c.configKey}`] = c.configValue;
        await db.insert(twinConfigSnapshot).values({
          snapshotType: 'pre_rollback',
          snapshotName: `回滚前自动快照 → #${input.snapshotId}`,
          configData: currentData,
          checksum: computeChecksum(currentData),
          createdBy: userId,
        });

        // 恢复快照中的配置
        const snapshotData = snapshot.configData as Record<string, unknown>;
        let restoredCount = 0;
        for (const [compositeKey, value] of Object.entries(snapshotData)) {
          const [module, ...keyParts] = compositeKey.split('.');
          const configKey = keyParts.join('.');
          if (!module || !configKey) continue;
          await db.update(engineConfigRegistry)
            .set({ configValue: String(value), updatedAt: new Date() })
            .where(and(
              eq(engineConfigRegistry.module, module),
              eq(engineConfigRegistry.configKey, configKey),
            ));
          restoredCount++;
        }

        // 恢复层级开关
        if (snapshot.layerSwitches && Array.isArray(snapshot.layerSwitches)) {
          for (const ls of snapshot.layerSwitches as Array<{ layerId: string; enabled: number }>) {
            await db.update(twinLayerSwitches)
              .set({ enabled: ls.enabled, updatedBy: userId, updatedAt: new Date() })
              .where(eq(twinLayerSwitches.layerId, ls.layerId));
          }
        }

        await db.insert(twinConfigAuditLog).values({
          userId, userName,
          module: snapshot.module ?? 'all',
          configKey: '*',
          action: 'rollback',
          oldValue: currentData,
          newValue: snapshotData,
          reason: `回滚到快照: ${snapshot.snapshotName ?? `#${input.snapshotId}`}`,
        });

        log.info({ snapshotId: input.snapshotId, restoredCount }, '[rollbackToSnapshot] Rollback completed');
        return { success: true, restoredCount };
      } catch (err) {
        log.warn({ err: String(err) }, '[rollbackToSnapshot] Error');
        throw err;
      }
    }),

  /** 16. 仿真运行配置（沙箱模式，不影响真实孪生体） */
  simulateConfig: protectedProcedure
    .input(z.object({
      module: z.string(),
      tempConfig: z.record(z.string(), z.unknown()),
      durationSeconds: z.number().int().min(5).max(60).default(30),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      try {
        const userId = (ctx as any).user?.id ?? 'system';

        // 获取当前基线配置
        const baselineRows = await db.select().from(engineConfigRegistry)
          .where(eq(engineConfigRegistry.module, input.module));
        const baselineConfig: Record<string, unknown> = {};
        for (const r of baselineRows) baselineConfig[r.configKey] = r.configValue;

        // 创建仿真运行记录
        const result = await db.insert(twinConfigSimulationRuns).values({
          userId,
          module: input.module,
          tempConfig: input.tempConfig,
          baselineConfig,
          status: 'running',
        });
        const runId = Number(result[0].insertId);

        // 异步执行仿真（模拟 30s 运行）
        setImmediate(async () => {
          try {
            const startTime = Date.now();
            // 模拟仿真计算：对比基线和临时配置的差异
            const diffs: Record<string, { baseline: unknown; temp: unknown; delta: string }> = {};
            for (const [key, tempVal] of Object.entries(input.tempConfig)) {
              const baseVal = baselineConfig[key];
              if (JSON.stringify(baseVal) !== JSON.stringify(tempVal)) {
                let delta = 'changed';
                if (typeof baseVal === 'number' && typeof tempVal === 'number') {
                  const pct = ((tempVal - baseVal) / baseVal * 100).toFixed(1);
                  delta = `${pct}%`;
                }
                diffs[key] = { baseline: baseVal, temp: tempVal, delta };
              }
            }

            const simulationResult = {
              diffs,
              estimatedImpact: {
                latencyChange: Object.keys(diffs).length > 3 ? '+15%' : '+5%',
                accuracyChange: Object.keys(diffs).length > 3 ? '-3%' : '+2%',
                costChange: diffs['dailyGrokBudget'] ? `${(diffs['dailyGrokBudget'] as any).delta}` : '0%',
              },
              warnings: [] as string[],
            };

            // 检查危险配置
            if (input.tempConfig['circuitBreaker.enabled'] === false) {
              simulationResult.warnings.push('⚠️ 关闭熔断器可能导致 Grok API 成本失控');
            }
            if (typeof input.tempConfig['pollingIntervalMs'] === 'number' && input.tempConfig['pollingIntervalMs'] < 3000) {
              simulationResult.warnings.push('⚠️ 轮询间隔 < 3s 可能导致数据库压力过大');
            }

            const durationMs = Date.now() - startTime;
            await db.update(twinConfigSimulationRuns)
              .set({ result: simulationResult, status: 'completed', durationMs, completedAt: new Date() })
              .where(eq(twinConfigSimulationRuns.id, runId));

            // 审计日志
            await db.insert(twinConfigAuditLog).values({
              userId,
              module: input.module,
              configKey: '*',
              action: 'simulate',
              newValue: input.tempConfig,
              reason: `仿真运行 #${runId}`,
            });
          } catch (simErr) {
            log.warn({ err: String(simErr) }, '[simulateConfig] Simulation error');
            await db.update(twinConfigSimulationRuns)
              .set({ status: 'failed', completedAt: new Date() })
              .where(eq(twinConfigSimulationRuns.id, runId));
          }
        });

        return { success: true, runId };
      } catch (err) {
        log.warn({ err: String(err) }, '[simulateConfig] Error');
        throw err;
      }
    }),

  /** 17. 启停模块（批量切换模块下所有配置的 enabled 状态） */
  toggleModule: protectedProcedure
    .input(z.object({
      module: z.string(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      try {
        await db.update(engineConfigRegistry)
          .set({ enabled: input.enabled ? 1 : 0, updatedAt: new Date() })
          .where(eq(engineConfigRegistry.module, input.module));

        const userId = (ctx as any).user?.id ?? 'system';
        await db.insert(twinConfigAuditLog).values({
          userId,
          userName: (ctx as any).user?.name ?? 'system',
          module: input.module,
          configKey: '*',
          action: 'update',
          newValue: { enabled: input.enabled },
          reason: `模块 ${input.module} ${input.enabled ? '启用' : '禁用'}`,
        });

        return { success: true };
      } catch (err) {
        log.warn({ err: String(err) }, '[toggleModule] Error');
        throw err;
      }
    }),
});
