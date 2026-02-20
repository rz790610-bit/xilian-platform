/**
 * 融合诊断 tRPC 路由
 *
 * 提供：
 *   - diagnose      — 执行融合诊断（mutation, 需认证）
 *   - getExperts     — 获取已注册专家列表（只读, 公开）
 *   - updateWeight   — 更新专家权重（mutation, 需认证）
 *   - registerExpert — 注册新专家（mutation, 需认证）
 *   - unregisterExpert — 注销专家（mutation, 需认证）
 *   - getFaultTypes  — 获取故障类型映射（只读, 公开）
 *   - getConfig      — 获取引擎配置（只读, 公开）
 *   - getHistory     — 获取诊断历史（只读, 公开）
 *   - clearHistory   — 清空诊断历史（mutation, 需认证）
 *   - setConflictPenalty — 设置冲突惩罚因子（mutation, 需认证）
 *
 * P0-6 修复: 所有 mutation 端点改为 protectedProcedure（原全部使用 publicProcedure）
 * P1-9 修复: diagnosisHistory 内存存储添加容量限制 + 持久化迁移 TODO
 *
 * 鉴权模式参考 algorithm.router.ts（本批最佳实践）：
 *   - 只读查询 → publicProcedure
 *   - 写操作/mutation → protectedProcedure
 */

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../core/trpc';
import {
  getFusionEngine,
  FAULT_TYPES,
  FAULT_TYPE_LABELS,
  SEVERITY_LABELS,
  VibrationExpert,
  TemperatureExpert,
  CurrentExpert,
  type FinalDiagnosis,
} from '../services/fusionDiagnosis.service';
import { createModuleLogger } from '../core/logger';

const log = createModuleLogger('fusionDiagnosisRouter');

// ============================================================
// 诊断历史缓存
// ============================================================
// P1-9: 当前为内存存储，服务重启即丢失，多实例部署时各实例历史不共享。
// TODO: 迁移至 Redis ZSET 或 MySQL diagnosis_history 表实现持久化。
// 临时方案：保留内存缓存 + 容量限制 + 启动时日志警告。

interface DiagnosisHistoryEntry {
  id: string;
  timestamp: string;
  inputData: Record<string, unknown>;
  result: FinalDiagnosis;
  duration: number;
}

const diagnosisHistory: DiagnosisHistoryEntry[] = [];
const MAX_HISTORY = 200;

function addHistory(entry: DiagnosisHistoryEntry) {
  diagnosisHistory.unshift(entry);
  if (diagnosisHistory.length > MAX_HISTORY) {
    diagnosisHistory.length = MAX_HISTORY;
  }
}

// 启动时警告
log.warn(
  `[P1-9] diagnosisHistory 使用内存存储（最多 ${MAX_HISTORY} 条），` +
  '服务重启将丢失所有历史。请尽快迁移至 Redis ZSET 或 MySQL 持久化。'
);

export const fusionDiagnosisRouter = router({
  /**
   * 执行融合诊断
   * P0-6: mutation → protectedProcedure（原 publicProcedure）
   */
  diagnose: protectedProcedure
    .input(
      z.object({
        /** 传感器数据 */
        sensorData: z.record(z.string(), z.any()),
        /** 设备编码（可选） */
        deviceCode: z.string().optional(),
        /** 设备组件（可选） */
        component: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const engine = getFusionEngine();
      const startTime = Date.now();

      log.info(`Fusion diagnosis requested: device=${input.deviceCode || 'N/A'}, experts=${engine.registry.getExpertCount()}`);

      const data: Record<string, unknown> = {
        ...input.sensorData,
        component: input.component,
        deviceCode: input.deviceCode,
      };

      const result = engine.diagnose(data);
      const duration = Date.now() - startTime;

      // 记录历史
      const entry: DiagnosisHistoryEntry = {
        id: `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        inputData: input.sensorData,
        result,
        duration,
      };
      addHistory(entry);

      log.info(`Fusion diagnosis completed in ${duration}ms: ${result.faultType} (${(result.confidence * 100).toFixed(1)}%)`);

      return {
        success: true,
        data: {
          ...result,
          diagnosisId: entry.id,
          timestamp: entry.timestamp,
          duration,
          faultLabel: FAULT_TYPE_LABELS[result.faultType] || FAULT_TYPE_LABELS.unknown,
          severityLabel: SEVERITY_LABELS[result.severity] || SEVERITY_LABELS.unknown,
        },
      };
    }),

  /**
   * 获取已注册专家列表（只读 → publicProcedure）
   */
  getExperts: publicProcedure.query(() => {
    const engine = getFusionEngine();
    const experts = engine.registry.getAllExperts();
    return {
      count: experts.length,
      experts: experts.map(e => ({
        name: e.name,
        weight: e.weight,
      })),
      weights: engine.registry.getWeights(),
    };
  }),

  /**
   * 更新专家权重
   * P0-6: mutation → protectedProcedure（原 publicProcedure）
   */
  updateWeight: protectedProcedure
    .input(
      z.object({
        expertName: z.string(),
        weight: z.number().min(0).max(5),
      }),
    )
    .mutation(({ input }) => {
      const engine = getFusionEngine();
      const success = engine.registry.updateWeight(input.expertName, input.weight);
      if (!success) {
        return { success: false, message: `Expert '${input.expertName}' not found` };
      }
      return { success: true, message: `Weight updated: ${input.expertName} → ${input.weight}` };
    }),

  /**
   * 注册内置专家
   * P0-6: mutation → protectedProcedure（原 publicProcedure）
   */
  registerExpert: protectedProcedure
    .input(
      z.object({
        type: z.enum(['vibration', 'temperature', 'current']),
        weight: z.number().min(0).max(5).optional(),
      }),
    )
    .mutation(({ input }) => {
      const engine = getFusionEngine();
      const weight = input.weight ?? 1.0;

      const nameMap: Record<string, string> = {
        vibration: 'VibrationExpert',
        temperature: 'TemperatureExpert',
        current: 'CurrentExpert',
      };

      // 检查是否已注册
      if (engine.registry.getExpert(nameMap[input.type])) {
        return { success: false, message: `Expert '${nameMap[input.type]}' already registered` };
      }

      switch (input.type) {
        case 'vibration':
          engine.registerExpert(new VibrationExpert(weight));
          break;
        case 'temperature':
          engine.registerExpert(new TemperatureExpert(weight));
          break;
        case 'current':
          engine.registerExpert(new CurrentExpert(weight));
          break;
      }

      return {
        success: true,
        message: `Expert '${nameMap[input.type]}' registered with weight ${weight}`,
      };
    }),

  /**
   * 注销专家
   * P0-6: mutation → protectedProcedure（已是 protectedProcedure，保持不变）
   */
  unregisterExpert: protectedProcedure
    .input(z.object({ expertName: z.string() }))
    .mutation(({ input }) => {
      const engine = getFusionEngine();
      const success = engine.registry.unregister(input.expertName);
      return {
        success,
        message: success
          ? `Expert '${input.expertName}' unregistered`
          : `Expert '${input.expertName}' not found`,
      };
    }),

  /**
   * 获取故障类型映射表（只读 → publicProcedure）
   */
  getFaultTypes: publicProcedure.query(() => {
    return {
      types: FAULT_TYPES,
      labels: FAULT_TYPE_LABELS,
      severityLabels: SEVERITY_LABELS,
    };
  }),

  /**
   * 获取引擎配置信息（只读 → publicProcedure）
   */
  getConfig: publicProcedure.query(() => {
    const engine = getFusionEngine();
    return {
      frameOfDiscernment: engine.dsFusion.frameOfDiscernment,
      expertCount: engine.registry.getExpertCount(),
      experts: engine.registry.toJSON(),
      faultTypes: [...FAULT_TYPES],
      conflictPenaltyFactor: engine.getConflictPenalty(),
    };
  }),

  /**
   * 设置冲突惩罚因子
   * P0-6: mutation → protectedProcedure（已是 protectedProcedure，保持不变）
   */
  setConflictPenalty: protectedProcedure
    .input(z.object({ factor: z.number().min(0).max(1) }))
    .mutation(({ input }) => {
      const engine = getFusionEngine();
      engine.setConflictPenalty(input.factor);
      return { success: true, message: `Conflict penalty factor set to ${input.factor}`, factor: input.factor };
    }),

  /**
   * 获取诊断历史（只读 → publicProcedure）
   */
  getHistory: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).optional(),
        offset: z.number().min(0).optional(),
      }).optional(),
    )
    .query(({ input }) => {
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;
      const items = diagnosisHistory.slice(offset, offset + limit);
      return {
        total: diagnosisHistory.length,
        items,
        // P1-9: 提示前端当前为内存存储
        _warning: 'History is stored in memory and will be lost on server restart',
      };
    }),

  /**
   * 清空诊断历史
   * P0-6: mutation → protectedProcedure（原 publicProcedure）
   */
  clearHistory: protectedProcedure.mutation(() => {
    const count = diagnosisHistory.length;
    diagnosisHistory.length = 0;
    log.warn(`Diagnosis history cleared: ${count} entries removed`);
    return { success: true, cleared: count };
  }),
});
