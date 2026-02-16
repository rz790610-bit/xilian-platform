/**
 * Grok 诊断 Agent tRPC 路由
 * 
 * 提供设备故障诊断、会话管理、状态查询等 API
 */

import { z } from 'zod';
import { publicProcedure, router } from '../core/trpc';
import {
  diagnose,
  getAgentStatus,
  clearSession,
  getSessionHistory,
  type DiagnosticRequest,
} from '../services/grokDiagnosticAgent.service';
import { createModuleLogger } from '../core/logger';

const log = createModuleLogger('grokDiagnosticRouter');

export const grokDiagnosticRouter = router({
  /**
   * 执行设备诊断
   */
  diagnose: publicProcedure
    .input(
      z.object({
        deviceCode: z.string().min(1, '设备编码不能为空'),
        description: z.string().min(5, '故障描述至少5个字符'),
        sensorReadings: z.record(z.string(), z.number()).optional(),
        timeRangeHours: z.number().min(1).max(720).optional(),
        sessionId: z.string().optional(),
        mode: z.enum(['quick', 'deep', 'predictive']).optional(),
      })
    )
    .mutation(async ({ input }) => {
      log.info(`Diagnostic request for device: ${input.deviceCode}`, {
        mode: input.mode || 'quick',
        hasReadings: !!input.sensorReadings,
      });

      const request: DiagnosticRequest = {
        deviceCode: input.deviceCode,
        description: input.description,
        sensorReadings: input.sensorReadings,
        timeRangeHours: input.timeRangeHours,
        sessionId: input.sessionId,
        mode: input.mode || 'quick',
      };

      const result = await diagnose(request);

      return {
        success: true,
        data: result,
      };
    }),

  /**
   * 获取诊断 agent 状态
   */
  status: publicProcedure.query(() => {
    return getAgentStatus();
  }),

  /**
   * 获取会话历史
   */
  sessionHistory: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(({ input }) => {
      const history = getSessionHistory(input.sessionId);
      if (!history) {
        return { found: false, messages: [] };
      }
      return {
        found: true,
        messages: history.map(m => ({
          role: m.role,
          content: m.content,
          hasToolCalls: !!m.tool_calls && m.tool_calls.length > 0,
        })),
      };
    }),

  /**
   * 清除诊断会话
   */
  clearSession: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(({ input }) => {
      const cleared = clearSession(input.sessionId);
      return { success: cleared };
    }),

  /**
   * 批量诊断（多设备）
   */
  batchDiagnose: publicProcedure
    .input(
      z.object({
        devices: z.array(
          z.object({
            deviceCode: z.string(),
            description: z.string(),
            sensorReadings: z.record(z.string(), z.number()).optional(),
          })
        ).min(1).max(10),
        mode: z.enum(['quick', 'deep', 'predictive']).optional(),
      })
    )
    .mutation(async ({ input }) => {
      log.info(`Batch diagnostic request for ${input.devices.length} devices`);

      const results = await Promise.allSettled(
        input.devices.map(device =>
          diagnose({
            deviceCode: device.deviceCode,
            description: device.description,
            sensorReadings: device.sensorReadings,
            mode: input.mode || 'quick',
          })
        )
      );

      return {
        total: results.length,
        succeeded: results.filter(r => r.status === 'fulfilled').length,
        failed: results.filter(r => r.status === 'rejected').length,
        results: results.map((r, i) => ({
          deviceCode: input.devices[i].deviceCode,
          status: r.status,
          data: r.status === 'fulfilled' ? r.value : undefined,
          error: r.status === 'rejected' ? String(r.reason) : undefined,
        })),
      };
    }),
});
