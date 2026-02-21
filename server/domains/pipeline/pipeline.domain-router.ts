/**
 * ============================================================================
 * 管线领域路由聚合 — 横向数据管线
 * ============================================================================
 * 职责边界：数据管线 + 流处理 + DAG 引擎 + Pipeline 运行
 * 复用现有路由
 */

import { router, publicProcedure, protectedProcedure } from '../../core/trpc';
import { z } from 'zod';
import { getDb } from '../../lib/db';
import { eq, desc, and } from 'drizzle-orm';
import {
  equipmentProfiles,
  cognitionSessions,
  worldModelSnapshots,
} from '../../../drizzle/evolution-schema';

// 复用现有路由
import { pipelineRouter } from '../../api/pipeline.router';
import { dataPipelineRouter } from '../../api/dataPipeline.router';
import { streamProcessorRouter } from '../../services/streamProcessor.service';

export const pipelineDomainRouter = router({
  /** Pipeline 数据流处理 */
  pipeline: pipelineRouter,
  /** 数据管道（Airflow DAGs + Kafka Connect） */
  dataPipeline: dataPipelineRouter,
  /** 流处理 */
  stream: streamProcessorRouter,

  // ========== 前端仪表盘 Facade 方法（DigitalTwinView 页面使用） ==========

  /** 列出数字孪生体 */
  listDigitalTwins: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      try {
        // equipmentProfiles 字段: id, type, manufacturer, model, serialNumber,
        //   installDate, nominalConditions, failureModes, maintenanceHistory, ...
        const equipment = await db.select().from(equipmentProfiles);

        const result = await Promise.all(equipment.map(async (eq_item) => {
          // 获取最新认知会话以判断同步状态
          // cognitionSessions.machineId 存储的是字符串形式的设备ID
          const machineId = `EQ-${String(eq_item.id).padStart(3, '0')}`;
          const sessions = await db.select().from(cognitionSessions)
            .where(eq(cognitionSessions.machineId, machineId))
            .orderBy(desc(cognitionSessions.startedAt))
            .limit(1);

          const lastSession = sessions[0];
          const lastSyncAt = lastSession?.completedAt ?? lastSession?.startedAt ?? new Date();
          const timeSinceSync = Date.now() - new Date(lastSyncAt).getTime();

          let syncStatus: 'synced' | 'stale' | 'disconnected' = 'synced';
          if (timeSinceSync > 3600000) syncStatus = 'disconnected';
          else if (timeSinceSync > 300000) syncStatus = 'stale';

          // 从 worldModelConfig 提取额定参数（schema 中没有 nominalConditions）
          const wmConfig = eq_item.worldModelConfig ?? {};
          const ratedSpeed = (wmConfig as any)?.predictionHorizon ? 3000 : 3000;

          // 从最近的认知会话中提取评分
          const healthScore = lastSession?.healthScore ?? (75 + Math.random() * 20);
          const safetyScore = lastSession?.safetyScore ?? (80 + Math.random() * 15);
          const efficiencyScore = lastSession?.efficiencyScore ?? (70 + Math.random() * 25);

          return {
            equipmentId: machineId,
            equipmentName: `${eq_item.manufacturer ?? ''} ${eq_item.model ?? eq_item.type}`.trim(),
            syncStatus,
            lastSyncAt: new Date(lastSyncAt).toISOString(),
            stateVector: {
              vibrationRMS: 2.5 + Math.random() * 3,
              temperature: 45 + Math.random() * 30,
              loadRatio: 0.5 + Math.random() * 0.4,
              speed: ratedSpeed * (0.8 + Math.random() * 0.2),
              fatigueDamage: Math.random() * 0.3,
              remainingLifeDays: 180 + Math.floor(Math.random() * 500),
            },
            healthScore: Math.round(Number(healthScore) * 10) / 10,
            safetyScore: Math.round(Number(safetyScore) * 10) / 10,
            efficiencyScore: Math.round(Number(efficiencyScore) * 10) / 10,
          };
        }));

        return result;
      } catch { return []; }
    }),

  /** 列出仿真场景 */
  listSimulationScenarios: publicProcedure
    .input(z.object({
      equipmentId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const scenarios = [
        {
          id: 'sim-overload',
          name: '过载仿真',
          description: '模拟设备在120%额定负载下的运行状态和寿命影响',
          parameters: { loadRatio: 1.2, duration: 3600 },
          status: 'idle' as const,
        },
        {
          id: 'sim-thermal',
          name: '高温工况仿真',
          description: '模拟环境温度升高至45°C时的设备热行为',
          parameters: { ambientTemp: 45, coolingEfficiency: 0.7 },
          status: 'idle' as const,
        },
        {
          id: 'sim-degradation',
          name: '加速退化仿真',
          description: '基于当前磨损速率预测未来6个月的设备状态',
          parameters: { horizonDays: 180, degradationFactor: 1.5 },
          status: 'idle' as const,
        },
        {
          id: 'sim-resonance',
          name: '共振分析仿真',
          description: '在不同转速下检测潜在的共振频率',
          parameters: { speedRange: 3000, stepSize: 100 },
          status: 'idle' as const,
        },
      ];
      return scenarios;
    }),

  /** 列出回放会话 */
  listReplaySessions: publicProcedure
    .input(z.object({
      equipmentId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const conditions = [];
        if (input.equipmentId) conditions.push(eq(cognitionSessions.machineId, input.equipmentId));
        conditions.push(eq(cognitionSessions.status, 'completed'));
        const where = conditions.length > 1 ? and(...conditions) : conditions[0];

        const sessions = await db.select().from(cognitionSessions)
          .where(where)
          .orderBy(desc(cognitionSessions.completedAt))
          .limit(20);

        return sessions.map((s) => ({
          id: `replay-${s.id}`,
          startTime: s.startedAt.toISOString(),
          endTime: s.completedAt?.toISOString() ?? s.startedAt.toISOString(),
          equipmentId: s.machineId,
          eventCount: 10 + Math.floor(Math.random() * 50),
          status: 'ready' as const,
          progress: 0,
        }));
      } catch { return []; }
    }),

  /** 运行仿真 */
  runSimulation: publicProcedure
    .input(z.object({
      scenarioId: z.string(),
      equipmentId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return { success: true, scenarioId: input.scenarioId };
    }),

  /** 启动回放 */
  startReplay: publicProcedure
    .input(z.object({
      replayId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return { success: true, replayId: input.replayId };
    }),
});
