/**
 * 融合诊断 tRPC 路由
 *
 * 提供：
 *   - diagnose      — 执行融合诊断（mutation）
 *   - getExperts     — 获取已注册专家列表
 *   - updateWeight   — 更新专家权重
 *   - registerExpert — 注册新专家（内置类型）
 *   - unregisterExpert — 注销专家
 *   - getFaultTypes  — 获取故障类型映射
 *   - getConfig      — 获取引擎配置
 *   - getHistory     — 获取诊断历史（内存缓存）
 */

import { z } from 'zod';
import { publicProcedure, router } from '../core/trpc';
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

// 诊断历史缓存（内存，最多保留 200 条）
interface DiagnosisHistoryEntry {
  id: string;
  timestamp: string;
  inputData: Record<string, any>;
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

export const fusionDiagnosisRouter = router({
  /**
   * 执行融合诊断
   */
  diagnose: publicProcedure
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

      const data: Record<string, any> = {
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
   * 获取已注册专家列表
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
   */
  updateWeight: publicProcedure
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
   */
  registerExpert: publicProcedure
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
   */
  unregisterExpert: publicProcedure
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
   * 获取故障类型映射表
   */
  getFaultTypes: publicProcedure.query(() => {
    return {
      types: FAULT_TYPES,
      labels: FAULT_TYPE_LABELS,
      severityLabels: SEVERITY_LABELS,
    };
  }),

  /**
   * 获取引擎配置信息
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
   */
  setConflictPenalty: publicProcedure
    .input(z.object({ factor: z.number().min(0).max(1) }))
    .mutation(({ input }) => {
      const engine = getFusionEngine();
      engine.setConflictPenalty(input.factor);
      return { success: true, message: `Conflict penalty factor set to ${input.factor}`, factor: input.factor };
    }),

  /**
   * 获取诊断历史
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
      };
    }),

  /**
   * 清空诊断历史
   */
  clearHistory: publicProcedure.mutation(() => {
    const count = diagnosisHistory.length;
    diagnosisHistory.length = 0;
    return { success: true, cleared: count };
  }),
});
