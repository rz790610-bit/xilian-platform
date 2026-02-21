/**
 * ============================================================================
 * 知识领域路由聚合 — 横向知识层
 * ============================================================================
 * 职责边界：知识库 + 知识图谱 + 结晶管理 + 图查询
 * 复用现有路由：knowledgeRouter, kgOrchestratorRouter, graphQueryRouter
 */

import { router, publicProcedure, protectedProcedure } from '../../core/trpc';
import { z } from 'zod';
import { getDb } from '../../lib/db';
import { eq, desc, count } from 'drizzle-orm';
import {
  knowledgeCrystals,
  featureDefinitions,
  featureVersions,
  equipmentProfiles,
} from '../../../drizzle/evolution-schema';
import {
  kgNodes,
  kgEdges,
} from '../../../drizzle/schema';

// 复用现有路由
import { knowledgeRouter } from '../../services/knowledge.service';
import { kgOrchestratorRouter } from '../../api/kgOrchestrator.router';
import { graphQueryRouter } from '../../api/graphQuery.router';

export const knowledgeDomainRouter = router({
  /** 知识库管理（集合/文档/嵌入/QA） */
  kb: knowledgeRouter,
  /** 知识图谱编排器（实体/关系/推理） */
  kgOrchestrator: kgOrchestratorRouter,
  /** 图查询优化（Cypher/SPARQL） */
  graphQuery: graphQueryRouter,

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

        // 设备节点 — equipmentProfiles 字段: id, type, manufacturer, model, ...
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

        // 知识结晶节点 — knowledgeCrystals 字段: id, pattern, confidence, sourceSessionIds, ...
        for (const crystal of crystals) {
          graphNodes.push({
            id: `crystal-${crystal.id}`,
            label: crystal.pattern.substring(0, 50),
            type: 'condition',
            properties: {
              confidence: String(crystal.confidence),
              version: crystal.version,
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

  /** 列出知识结晶 */
  listCrystals: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      try {
        const crystals = await db.select().from(knowledgeCrystals)
          .orderBy(desc(knowledgeCrystals.createdAt));

        // knowledgeCrystals 字段: id, pattern, confidence, sourceSessionIds, applicableConditions,
        //   kgNodeId, version, verificationCount, lastVerifiedAt, createdAt, updatedAt
        return crystals.map(c => ({
          id: String(c.id),
          type: 'pattern' as 'pattern' | 'rule' | 'threshold' | 'model',
          name: c.pattern.substring(0, 80),
          description: c.pattern,
          confidence: Number(c.confidence),
          sourceCount: c.sourceSessionIds?.length ?? 0,
          appliedCount: c.verificationCount,
          status: (c.verificationCount > 0 ? 'reviewed' : 'draft') as 'draft' | 'reviewed' | 'applied' | 'deprecated',
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

        // featureDefinitions 字段: id, name, category, description, inputSignals,
        //   computeLogic, applicableEquipment, outputUnit, outputRange, version, enabled, ...
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
        // featureVersions 字段: id, featureId, version, changelog, schema, createdAt
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

  /** 应用知识结晶 */
  applyCrystal: protectedProcedure
    .input(z.object({
      crystalId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, crystalId: input.crystalId };
      try {
        const id = parseInt(input.crystalId);
        // 增加验证次数作为"应用"的标记
        const rows = await db.select().from(knowledgeCrystals).where(eq(knowledgeCrystals.id, id)).limit(1);
        if (rows[0]) {
          await db.update(knowledgeCrystals)
            .set({ verificationCount: rows[0].verificationCount + 1, lastVerifiedAt: new Date() })
            .where(eq(knowledgeCrystals.id, id));
        }
        return { success: true, crystalId: input.crystalId };
      } catch { return { success: false, crystalId: input.crystalId }; }
    }),
});
