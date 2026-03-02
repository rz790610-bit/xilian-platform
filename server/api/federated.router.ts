/**
 * ============================================================================
 * P3-1: 联邦知识蒸馏 — tRPC 路由
 * ============================================================================
 *
 * 端点：
 *   1. uploadPackage    — 现场上传脱敏知识包
 *   2. validatePackage  — 验证包完整性和签名
 *   3. listPackages     — 列出已接收的知识包
 *   4. fuse             — 执行联邦融合（FedAvg / FedProx）
 *   5. getFusionHistory — 获取融合历史
 *   6. getStats         — 获取融合服务统计
 *
 * 安全约束：
 *   - uploadPackage / fuse 需认证（protectedProcedure）
 *   - 包大小限制 50MB
 *   - 签名验证防篡改
 */

import { router, publicProcedure, protectedProcedure } from '../core/trpc';
import { z } from 'zod';
import { getFederatedFusionService } from '../platform/knowledge/services/federated-fusion.service';

// ============================================================================
// 输入 Schema
// ============================================================================

const knowledgePackageSchema = z.object({
  packageId: z.string().uuid(),
  siteId: z.string().min(1),
  version: z.string(),
  timestamp: z.number(),
  localTraining: z.object({
    datasetSize: z.number().min(0),
    accuracy: z.number().min(0).max(1),
    epochs: z.number().min(0),
    featureStats: z.record(z.string(), z.object({
      mean: z.number(),
      std: z.number(),
      count: z.number(),
    })),
    faultDistribution: z.record(z.string(), z.number()),
    equipmentCategory: z.string(),
    trainedAt: z.number(),
  }),
  distilledKnowledge: z.object({
    weightDeltas: z.array(z.number()),
    featureFaultMappings: z.array(z.object({
      featureName: z.string(),
      faultCode: z.string(),
      confidence: z.number(),
      sampleCount: z.number(),
    })),
    anomalySignatures: z.array(z.object({
      signatureId: z.string(),
      patternType: z.enum(['frequency', 'amplitude', 'trend', 'correlation']),
      featureVector: z.array(z.number()),
      faultCode: z.string(),
      confidence: z.number(),
    })),
    thresholdUpdates: z.array(z.object({
      measurementCode: z.string(),
      oldThreshold: z.number(),
      newThreshold: z.number(),
      evidenceCount: z.number(),
      pValue: z.number(),
    })),
  }),
  knowledgeTriples: z.array(z.object({
    subject: z.string(),
    predicate: z.string(),
    object: z.string(),
    confidence: z.number(),
    sourceType: z.enum(['diagnosis', 'evolution', 'manual', 'guardrail']),
  })),
  signature: z.string(),
  checksum: z.string(),
  sizeBytes: z.number(),
});

// ============================================================================
// 联邦知识蒸馏路由
// ============================================================================

export const federatedRouter = router({
  /** 上传脱敏知识包 */
  uploadPackage: protectedProcedure
    .input(knowledgePackageSchema)
    .mutation(({ input }) => {
      const service = getFederatedFusionService();
      const result = service.addPackage(input);
      return {
        packageId: input.packageId,
        ...result,
      };
    }),

  /** 验证知识包完整性 */
  validatePackage: publicProcedure
    .input(z.object({ packageId: z.string().uuid() }))
    .query(({ input }) => {
      const service = getFederatedFusionService();
      const pkg = service.getPackage(input.packageId);

      if (!pkg) {
        return { valid: false, reason: '知识包不存在' };
      }

      // 基础校验
      const checks = {
        hasSignature: !!pkg.signature,
        hasChecksum: !!pkg.checksum,
        hasTriples: pkg.knowledgeTriples.length > 0,
        hasWeights: pkg.distilledKnowledge.weightDeltas.length > 0,
        sizeValid: pkg.sizeBytes > 0 && pkg.sizeBytes <= 50 * 1024 * 1024,
        datasetValid: pkg.localTraining.datasetSize > 0,
        accuracyValid: pkg.localTraining.accuracy >= 0 && pkg.localTraining.accuracy <= 1,
      };

      const valid = Object.values(checks).every(Boolean);
      return { valid, checks };
    }),

  /** 列出已接收的知识包 */
  listPackages: publicProcedure
    .input(z.object({
      siteId: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
    }).optional())
    .query(({ input }) => {
      const service = getFederatedFusionService();
      let packages = service.listPackages();

      if (input?.siteId) {
        packages = packages.filter(p => p.siteId === input.siteId);
      }

      return {
        packages: packages.slice(-(input?.limit ?? 50)),
        total: packages.length,
      };
    }),

  /** 执行联邦融合 */
  fuse: protectedProcedure
    .input(z.object({
      fusionId: z.string().optional(),
      packageIds: z.array(z.string().uuid()).min(1),
      algorithm: z.enum(['fedavg', 'fedprox', 'scaffold']).default('fedavg'),
      proximalMu: z.number().min(0).max(1).optional(),
      conflictResolution: z.enum(['voting', 'confidence_weighted', 'most_recent']).default('voting'),
      minContributors: z.number().min(1).default(2),
    }))
    .mutation(({ input }) => {
      const service = getFederatedFusionService();

      const result = service.fuse({
        fusionId: input.fusionId || `fusion_${Date.now()}`,
        packageIds: input.packageIds,
        algorithm: input.algorithm,
        proximalMu: input.proximalMu,
        conflictResolution: input.conflictResolution,
        minContributors: input.minContributors,
      });

      return {
        fusionId: result.fusionId,
        globalModelVersion: result.globalModelVersion,
        tripleCount: result.fusedTriples.length,
        signatureCount: result.fusedSignatures.length,
        thresholdCount: result.fusedThresholds.length,
        conflictsResolved: result.conflictsResolved,
        contributions: result.contributions,
        durationMs: result.durationMs,
        fusedAt: result.fusedAt,
        // 完整结果（大对象，可选获取）
        fusedWeights: result.fusedWeights,
        fusedTriples: result.fusedTriples,
        fusedSignatures: result.fusedSignatures,
        fusedThresholds: result.fusedThresholds,
      };
    }),

  /** 获取融合历史 */
  getFusionHistory: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(20),
    }).optional())
    .query(({ input }) => {
      const service = getFederatedFusionService();
      const history = service.getFusionHistory(input?.limit ?? 20);

      return {
        history: history.map(h => ({
          fusionId: h.fusionId,
          globalModelVersion: h.globalModelVersion,
          tripleCount: h.fusedTriples.length,
          signatureCount: h.fusedSignatures.length,
          conflictsResolved: h.conflictsResolved,
          contributors: h.contributions.length,
          durationMs: h.durationMs,
          fusedAt: h.fusedAt,
        })),
        total: history.length,
      };
    }),

  /** 获取统计 */
  getStats: publicProcedure.query(() => {
    const service = getFederatedFusionService();
    return {
      ...service.getStats(),
      packageCount: service.getPackageCount(),
    };
  }),
});
