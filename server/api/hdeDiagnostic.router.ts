/**
 * HDE 双轨诊断 tRPC 路由
 *
 * 将 DiagnosticOrchestrator 暴露为 API 端点:
 *   - diagnose       — 执行双轨诊断（物理轨 + 数据轨 → DS 融合 → 物理校验）
 *   - getConfig      — 获取诊断引擎配置
 *   - getPresets     — 获取预设场景
 */

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../core/trpc';
import { getDiagnosisProxy } from '../platform/diagnosis/diagnosis-proxy';
import { createModuleLogger } from '../core/logger';
import { machineIdSchema } from '../../shared/contracts/schemas';

const log = createModuleLogger('hdeDiagnosticRouter');

// ============================================================
// 预设场景（前端快速选择）
// ============================================================

const HDE_PRESETS = [
  {
    id: 'normal',
    name: '正常运行',
    description: '各项振动/温度/电流指标正常，设备健康',
    sensorData: {
      vibration: generateSignal(256, 2.0, 0.5, []),
      temperature: generateSignal(256, 55, 1.0, []),
      current: generateSignal(256, 35, 1.5, []),
    },
    context: { cyclePhase: 'idle', loadWeight: 10 },
  },
  {
    id: 'bearing_damage',
    name: '轴承外圈损伤',
    description: '轴承外圈缺陷，冲击脉冲明显，峰值因子 > 4',
    sensorData: {
      vibration: generateBearingFaultSignal(256),
      temperature: generateRisingSignal(256, 65, 85),
      current: generateSignal(256, 35, 1.5, []),
    },
    context: { cyclePhase: 'lifting', loadWeight: 25 },
  },
  {
    id: 'electrical_fault',
    name: '电气故障',
    description: '电流高度不稳定，变异系数 > 0.3',
    sensorData: {
      vibration: generateSignal(256, 4.0, 2.0, []),
      temperature: generateSignal(256, 58, 1.5, []),
      current: generateSignal(256, 35, 15, []),
    },
    context: { cyclePhase: 'running', loadWeight: 15 },
  },
  {
    id: 'physics_violation',
    name: '物理异常 (传感器故障)',
    description: '振动值出现负数，物理不可能，传感器故障',
    sensorData: {
      vibration: generateSignal(256, -3.0, 2.0, []),
      temperature: generateSignal(256, 55, 1.0, []),
      current: generateSignal(256, 35, 1.5, []),
    },
    context: { cyclePhase: 'idle', loadWeight: 5 },
  },
  {
    id: 'overload_idle',
    name: '空载过电流',
    description: '空载条件下电流异常偏高，可能机械卡阻',
    sensorData: {
      vibration: generateSignal(256, 6.0, 2.0, []),
      temperature: generateSignal(256, 65, 2.0, []),
      current: generateSignal(256, 85, 10, []),
    },
    context: { cyclePhase: 'idle', loadWeight: 2 },
  },
];

// ============================================================
// 信号生成辅助函数
// ============================================================

function generateSignal(n: number, mean: number, noise: number, _harmonics: number[]): number[] {
  const data: number[] = [];
  for (let i = 0; i < n; i++) {
    data.push(mean + (Math.random() - 0.5) * noise * 2);
  }
  return data;
}

function generateBearingFaultSignal(n: number): number[] {
  const data: number[] = [];
  const baseMean = 8.0; // RMS ~8 mm/s — ISO 10816 danger zone
  const bpfoPeriod = 16; // 更密集的冲击脉冲（每 16 个采样点一次）
  for (let i = 0; i < n; i++) {
    let v = baseMean + (Math.random() - 0.5) * 2.0;
    if (i % bpfoPeriod === 0) {
      // 冲击脉冲: 幅值 4x 基线，确保峰值因子 > 4.0
      v += baseMean * 4.0 * (1 + Math.random() * 0.5);
    }
    data.push(Math.abs(v));
  }
  return data;
}

function generateRisingSignal(n: number, start: number, end: number): number[] {
  const data: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    data.push(start + (end - start) * t + (Math.random() - 0.5) * 2);
  }
  return data;
}

// ============================================================
// 路由定义
// ============================================================

export const hdeDiagnosticRouter = router({
  /**
   * 执行双轨诊断
   */
  diagnose: protectedProcedure
    .input(
      z.object({
        machineId: machineIdSchema.default('GJM12'),
        sensorData: z.record(z.string(), z.array(z.number())),
        context: z.object({
          cyclePhase: z.string().optional(),
          loadWeight: z.number().optional(),
        }).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const proxy = getDiagnosisProxy();
      const startTime = Date.now();

      log.info({ machineId: input.machineId }, 'HDE dual-track diagnosis requested');

      const result = await proxy.diagnose({
        machineId: input.machineId,
        timestamp: Date.now(),
        sensorData: input.sensorData,
        context: input.context,
      });

      log.info({
        machineId: input.machineId,
        faultType: result.diagnosis.faultType,
        confidence: result.diagnosis.confidence.toFixed(3),
        duration: Date.now() - startTime,
      }, 'HDE diagnosis completed');

      return {
        success: true,
        data: result,
      };
    }),

  /**
   * 获取引擎配置
   */
  getConfig: publicProcedure.query(() => {
    const proxy = getDiagnosisProxy();
    return proxy.getConfig();
  }),

  /**
   * 获取预设场景列表
   */
  getPresets: publicProcedure.query(() => {
    return HDE_PRESETS.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      context: p.context,
    }));
  }),

  /**
   * 使用预设场景执行诊断
   */
  diagnosePreset: protectedProcedure
    .input(z.object({ presetId: z.string() }))
    .mutation(async ({ input }) => {
      const preset = HDE_PRESETS.find(p => p.id === input.presetId);
      if (!preset) {
        return { success: false, error: `Preset '${input.presetId}' not found` };
      }

      const proxy = getDiagnosisProxy();

      log.info({ presetId: input.presetId, presetName: preset.name }, 'HDE preset diagnosis requested');

      const result = await proxy.diagnose({
        machineId: 'GJM12',
        timestamp: Date.now(),
        sensorData: preset.sensorData,
        context: preset.context,
      });

      return {
        success: true,
        preset: { id: preset.id, name: preset.name, description: preset.description },
        data: result,
      };
    }),
});
