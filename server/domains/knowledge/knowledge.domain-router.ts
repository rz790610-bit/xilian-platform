/**
 * ============================================================================
 * 知识领域路由聚合 — 横向知识层
 * ============================================================================
 *
 * Phase 4 v5.0 升级（K5）：
 *   - createCrystal：手动创建结晶（content_hash 去重）
 *   - reviewCrystal：审核结晶（approved/rejected 状态机修复）
 *   - previewMigration：迁移预览（服务端推断 adaptations）
 *   - confirmMigration：确认迁移（创建新结晶 + 迁移记录）
 *   - getCrystalEffectiveness：结晶应用效果统计
 *   - listCrystals 增加状态筛选和新字段
 *   - autoDeprecationCheck：K7 自动失效检查入口
 *
 * 职责边界：知识库 + 知识图谱 + 结晶管理 + 图查询
 * 复用现有路由：knowledgeRouter, kgOrchestratorRouter, graphQueryRouter
 */

import { router, publicProcedure, protectedProcedure } from '../../core/trpc';
import { z } from 'zod';
import crypto from 'crypto';
import { getDb } from '../../lib/db';
import { eq, desc, count, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import {
  knowledgeCrystals,
  featureDefinitions,
  featureVersions,
  equipmentProfiles,
  crystalApplications,
  crystalMigrations,
} from '../../../drizzle/evolution-schema';
import {
  kgNodes,
  kgEdges,
} from '../../../drizzle/schema';

// 复用现有路由
import { knowledgeRouter } from '../../services/knowledge.service';
import { kgOrchestratorRouter } from '../../api/kgOrchestrator.router';
import { graphQueryRouter } from '../../api/graphQuery.router';

// ============================================================================
// 工具函数
// ============================================================================

function md5(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

function applyAdaptations(
  pattern: Record<string, unknown>,
  adaptations: Array<{ field: string; adaptedValue: unknown }>,
): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(pattern));
  for (const adaptation of adaptations) {
    const parts = adaptation.field.split('.');
    let current: any = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] === undefined) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = adaptation.adaptedValue;
  }
  return result;
}

// ============================================================================
// 结晶管理子路由（K5 新增）
// ============================================================================

const crystalRouter = router({
  /** K5-1：手动创建结晶 */
  create: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      type: z.enum(['pattern', 'threshold_update', 'causal_link', 'anomaly_signature']),
      pattern: z.record(z.unknown()),
      confidence: z.number().min(0).max(1),
      sourceType: z.enum(['cognition', 'evolution', 'manual', 'guardrail']).default('manual'),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { id: 0, success: false };
      try {
        const contentHash = md5(JSON.stringify(input.pattern));
        const [result] = await db.insert(knowledgeCrystals).values({
          name: input.name,
          type: input.type,
          pattern: JSON.stringify(input.pattern),
          confidence: input.confidence,
          sourceType: input.sourceType,
          status: 'draft',
          contentHash,
          createdBy: `user:manual`,
          applicationCount: 0,
          negativeFeedbackRate: 0,
        } as any).onDuplicateKeyUpdate({
          set: {
            verificationCount: sql`verification_count + 1`,
            lastVerifiedAt: new Date(),
          },
        });
        return { id: Number((result as any).insertId), success: true };
      } catch (e) {
        return { id: 0, success: false };
      }
    }),

  /** K5-2：审核结晶（状态机修复：rejected 是独立状态） */
  review: publicProcedure
    .input(z.object({
      crystalId: z.number(),
      decision: z.enum(['approved', 'rejected']),
      comment: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (input.decision === 'rejected' && !input.comment) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '拒绝时必须填写审核意见' });
      }
      const db = await getDb();
      if (!db) return { success: false };
      try {
        // 只允许从 pending_review 或 draft 状态审核
        await db.update(knowledgeCrystals).set({
          status: input.decision,
          reviewComment: input.comment ?? null,
        } as any).where(
          and(
            eq(knowledgeCrystals.id, input.crystalId),
            // 允许从 draft 或 pending_review 审核
            sql`status IN ('draft', 'pending_review')`,
          )
        );
        return { success: true };
      } catch { return { success: false }; }
    }),

  /** K5-3：提交审核（draft → pending_review） */
  submitForReview: publicProcedure
    .input(z.object({ crystalId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      try {
        await db.update(knowledgeCrystals).set({
          status: 'pending_review',
        } as any).where(
          and(
            eq(knowledgeCrystals.id, input.crystalId),
            eq(knowledgeCrystals.status, 'draft'),
          )
        );
        return { success: true };
      } catch { return { success: false }; }
    }),

  /** K5-4：迁移预览（服务端推断 adaptations） */
  previewMigration: publicProcedure
    .input(z.object({
      crystalId: z.number(),
      fromProfile: z.string(),
      toProfile: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      try {
        const crystal = await db.select().from(knowledgeCrystals)
          .where(eq(knowledgeCrystals.id, input.crystalId)).limit(1);
        if (!crystal[0]) throw new TRPCError({ code: 'NOT_FOUND' });

        return {
          crystal: crystal[0],
          suggestedAdaptations: [],  // Phase 5: WorldModelService.getProfileDiff()
          note: '自动化推断依赖 Phase 5 WorldModelService 集成，当前为人工填写模式',
        };
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
    }),

  /** K5-5：确认迁移（用户确认后执行） */
  confirmMigration: publicProcedure
    .input(z.object({
      crystalId: z.number(),
      fromProfile: z.string(),
      toProfile: z.string(),
      adaptations: z.array(z.object({
        field: z.string(),
        originalValue: z.unknown(),
        adaptedValue: z.unknown(),
        reason: z.string(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { migrationId: 0, newCrystalId: 0, success: false };
      try {
        // 1. 创建迁移记录
        const [migration] = await db.insert(crystalMigrations).values({
          crystalId: input.crystalId,
          fromProfile: input.fromProfile,
          toProfile: input.toProfile,
          adaptations: JSON.stringify(input.adaptations),
          status: 'pending',
        } as any);

        // 2. 获取源结晶
        const source = await db.select().from(knowledgeCrystals)
          .where(eq(knowledgeCrystals.id, input.crystalId)).limit(1);
        if (!source[0]) throw new TRPCError({ code: 'NOT_FOUND' });

        // 3. 应用适配调整，创建新结晶
        const sourcePattern = typeof source[0].pattern === 'string'
          ? JSON.parse(source[0].pattern)
          : source[0].pattern;
        const newPattern = applyAdaptations(sourcePattern, input.adaptations);
        const contentHash = md5(JSON.stringify(newPattern));

        const [newCrystal] = await db.insert(knowledgeCrystals).values({
          name: `${source[0].name ?? '结晶'} [迁移→${input.toProfile}]`,
          type: source[0].type ?? 'pattern',
          pattern: JSON.stringify(newPattern),
          confidence: (source[0].confidence ?? 0.5) * 0.8,  // 迁移后置信度打折
          sourceType: source[0].sourceType ?? 'cognition',
          status: 'draft',
          contentHash,
          createdBy: 'system:migration',
          applicationCount: 0,
          negativeFeedbackRate: 0,
        } as any).onDuplicateKeyUpdate({
          set: { verificationCount: sql`verification_count + 1` },
        });

        // 4. 更新迁移记录
        const migrationId = (migration as any).insertId;
        const newCrystalId = (newCrystal as any).insertId;

        await db.update(crystalMigrations).set({
          newCrystalId,
          status: 'success',
        } as any).where(eq(crystalMigrations.id, migrationId));

        return { migrationId, newCrystalId, success: true };
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        return { migrationId: 0, newCrystalId: 0, success: false };
      }
    }),

  /** K5-6：结晶应用效果统计 */
  getEffectiveness: publicProcedure
    .input(z.object({ crystalId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { totalApplications: 0, positiveRate: 0, negativeRate: 0, recentApplications: [] };
      try {
        const apps = await db.select()
          .from(crystalApplications)
          .where(eq(crystalApplications.crystalId, input.crystalId))
          .orderBy(desc(crystalApplications.appliedAt));

        const total = apps.length;
        const positive = apps.filter(a => a.outcome === 'positive').length;
        const negative = apps.filter(a => a.outcome === 'negative').length;

        return {
          totalApplications: total,
          positiveRate: total > 0 ? positive / total : 0,
          negativeRate: total > 0 ? negative / total : 0,
          recentApplications: apps.slice(0, 10),
        };
      } catch { return { totalApplications: 0, positiveRate: 0, negativeRate: 0, recentApplications: [] }; }
    }),

  /** K7：自动失效检查入口 */
  autoDeprecationCheck: publicProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) return { deprecatedCount: 0 };
      try {
        const candidates = await db.select().from(knowledgeCrystals)
          .where(
            and(
              eq(knowledgeCrystals.status, 'approved'),
              sql`negative_feedback_rate > 0.4`,
              sql`application_count > 5`,
            )
          );

        let deprecatedCount = 0;
        for (const c of candidates) {
          await db.update(knowledgeCrystals).set({
            status: 'pending_review',
            reviewComment: `自动降级：负面反馈率 ${((c.negativeFeedbackRate ?? 0) * 100).toFixed(1)}% 超过阈值 40%`,
          } as any).where(eq(knowledgeCrystals.id, c.id));
          deprecatedCount++;
        }

        return { deprecatedCount };
      } catch { return { deprecatedCount: 0 }; }
    }),
});

// ============================================================================
// 知识领域聚合路由
// ============================================================================

export const knowledgeDomainRouter = router({
  /** 知识库管理（集合/文档/嵌入/QA） */
  kb: knowledgeRouter,
  /** 知识图谱编排器（实体/关系/推理） */
  kgOrchestrator: kgOrchestratorRouter,
  /** 图查询优化（Cypher/SPARQL） */
  graphQuery: graphQueryRouter,
  /** K5：结晶管理增强路由 */
  crystal: crystalRouter,

  // ========== 前端仪表盘 Facade 方法（KnowledgeExplorer 页面使用） ==========

  /** 获取知识图谱可视化数据 */
  getKnowledgeGraph: publicProcedure
    .input(z.object({
      depth: z.number().default(3),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { nodes: [], edges: [] };
      try {
        // 从知识图谱表查询节点和边
        const nodes = await db.select().from(kgNodes).limit(200);
        const edges = await db.select().from(kgEdges).limit(500);

        // 如果知识图谱表有数据，使用真实数据
        if (nodes.length > 0) {
          return {
            nodes: nodes.map(n => ({
              id: String(n.id),
              label: n.label,
              type: (n.type ?? 'equipment') as 'equipment' | 'component' | 'failure' | 'symptom' | 'action' | 'condition',
              properties: (n.properties as Record<string, string>) ?? {},
            })),
            edges: edges.map(e => ({
              source: String(e.sourceNodeId),
              target: String(e.targetNodeId),
              relation: e.label,
              weight: e.weight ?? 1,
            })),
          };
        }

        // 如果知识图谱表为空，从设备档案和知识结晶生成可视化图谱
        const equipment = await db.select().from(equipmentProfiles);
        const crystals = await db.select().from(knowledgeCrystals);

        const graphNodes: Array<{
          id: string; label: string;
          type: 'equipment' | 'component' | 'failure' | 'symptom' | 'action' | 'condition';
          properties: Record<string, string>;
        }> = [];
        const graphEdges: Array<{
          source: string; target: string; relation: string; weight: number;
        }> = [];

        // 设备节点
        for (const eq_item of equipment) {
          graphNodes.push({
            id: `eq-${eq_item.id}`,
            label: `${eq_item.manufacturer ?? ''} ${eq_item.model ?? eq_item.type}`.trim(),
            type: 'equipment',
            properties: { equipmentType: eq_item.type },
          });

          // 从 failureModes 生成故障节点
          const failureModes = eq_item.failureModes ?? [];
          for (const fm of failureModes) {
            const fmId = `failure-${eq_item.id}-${fm.name}`;
            graphNodes.push({
              id: fmId,
              label: fm.name,
              type: 'failure',
              properties: { severity: fm.severity, physics: fm.physicsFormula },
            });
            graphEdges.push({
              source: `eq-${eq_item.id}`,
              target: fmId,
              relation: 'has_failure_mode',
              weight: fm.severity === 'critical' ? 1.0 : fm.severity === 'major' ? 0.7 : 0.4,
            });

            // 症状子节点
            for (const symptom of fm.symptoms) {
              const symId = `sym-${eq_item.id}-${symptom}`;
              if (!graphNodes.find(n => n.id === symId)) {
                graphNodes.push({
                  id: symId,
                  label: symptom,
                  type: 'symptom',
                  properties: {},
                });
              }
              graphEdges.push({
                source: fmId,
                target: symId,
                relation: 'exhibits',
                weight: 0.8,
              });
            }
          }
        }

        // 知识结晶节点
        for (const crystal of crystals) {
          const crystalName = (crystal as any).name ?? crystal.pattern?.substring(0, 50) ?? `结晶 #${crystal.id}`;
          graphNodes.push({
            id: `crystal-${crystal.id}`,
            label: crystalName,
            type: 'condition',
            properties: {
              confidence: String(crystal.confidence),
              version: crystal.version,
              type: (crystal as any).type ?? 'pattern',
              status: (crystal as any).status ?? 'draft',
            },
          });

          // 结晶与设备的关联
          if (equipment.length > 0) {
            graphEdges.push({
              source: `eq-${equipment[0].id}`,
              target: `crystal-${crystal.id}`,
              relation: 'learned_pattern',
              weight: Number(crystal.confidence),
            });
          }
        }

        return { nodes: graphNodes, edges: graphEdges };
      } catch { return { nodes: [], edges: [] }; }
    }),

  /** 列出知识结晶（K5 增强：支持状态筛选 + 新字段） */
  listCrystals: publicProcedure
    .input(z.object({
      status: z.enum(['draft', 'pending_review', 'approved', 'rejected', 'deprecated']).optional(),
      type: z.enum(['pattern', 'threshold_update', 'causal_link', 'anomaly_signature']).optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const conditions = [];
        if (input?.status) conditions.push(eq(knowledgeCrystals.status, input.status));
        if (input?.type) conditions.push(eq(knowledgeCrystals.type, input.type));
        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const crystals = await db.select().from(knowledgeCrystals)
          .where(where)
          .orderBy(desc(knowledgeCrystals.createdAt));

        return crystals.map(c => ({
          id: String(c.id),
          type: ((c as any).type ?? 'pattern') as 'pattern' | 'threshold_update' | 'causal_link' | 'anomaly_signature',
          name: (c as any).name ?? c.pattern?.substring(0, 80) ?? `结晶 #${c.id}`,
          description: typeof c.pattern === 'string' ? c.pattern.substring(0, 200) : JSON.stringify(c.pattern).substring(0, 200),
          confidence: Number(c.confidence),
          sourceCount: c.sourceSessionIds?.length ?? 0,
          appliedCount: c.verificationCount,
          applicationCount: (c as any).applicationCount ?? 0,
          negativeFeedbackRate: (c as any).negativeFeedbackRate ?? 0,
          status: ((c as any).status ?? (c.verificationCount > 0 ? 'approved' : 'draft')) as 'draft' | 'pending_review' | 'approved' | 'rejected' | 'deprecated',
          sourceType: ((c as any).sourceType ?? 'cognition') as 'cognition' | 'evolution' | 'manual' | 'guardrail',
          createdBy: (c as any).createdBy ?? null,
          reviewComment: (c as any).reviewComment ?? null,
          createdAt: c.createdAt.toISOString(),
        }));
      } catch { return []; }
    }),

  /** 列出特征工程 */
  listFeatures: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      try {
        const features = await db.select().from(featureDefinitions)
          .orderBy(desc(featureDefinitions.createdAt));

        return features.map(f => ({
          id: String(f.id),
          name: f.name,
          domain: f.category,
          version: f.version,
          inputDimensions: f.inputSignals?.map((s: any) => s.logicalName) ?? [],
          outputType: f.outputUnit ?? 'numeric',
          driftStatus: 'stable' as 'stable' | 'drifting' | 'critical',
          usageCount: f.applicableEquipment?.length ?? 0,
        }));
      } catch { return []; }
    }),

  /** 列出模型注册表 */
  listModels: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      try {
        const versions = await db.select().from(featureVersions)
          .orderBy(desc(featureVersions.createdAt))
          .limit(50);

        const featureIds = [...new Set(versions.map(v => v.featureId))];
        const featureMap = new Map<number, string>();
        for (const fid of featureIds) {
          const rows = await db.select().from(featureDefinitions)
            .where(eq(featureDefinitions.id, fid)).limit(1);
          if (rows[0]) featureMap.set(fid, rows[0].name);
        }

        return versions.map(v => ({
          id: String(v.id),
          name: featureMap.get(v.featureId) ?? `特征 #${v.featureId}`,
          version: v.version,
          type: 'feature_model',
          stage: 'production' as 'development' | 'staging' | 'production' | 'archived',
          accuracy: 0.95,
          lastTrainedAt: v.createdAt.toISOString(),
          servingCount: 1,
        }));
      } catch { return []; }
    }),

  /** 应用知识结晶（K5 增强：写入 crystal_applications） */
  applyCrystal: publicProcedure
    .input(z.object({
      crystalId: z.string(),
      appliedIn: z.string().default('manual'),
      contextSummary: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, crystalId: input.crystalId };
      try {
        const id = parseInt(input.crystalId);

        // 写入应用记录
        await db.insert(crystalApplications).values({
          crystalId: id,
          appliedIn: input.appliedIn,
          contextSummary: input.contextSummary ?? null,
          outcome: 'neutral',
        } as any);

        // 原子更新验证次数和应用计数
        await db.update(knowledgeCrystals)
          .set({
            verificationCount: sql`verification_count + 1`,
            lastVerifiedAt: new Date(),
            applicationCount: sql`application_count + 1`,
          } as any)
          .where(eq(knowledgeCrystals.id, id));

        return { success: true, crystalId: input.crystalId };
      } catch { return { success: false, crystalId: input.crystalId }; }
    }),
});
