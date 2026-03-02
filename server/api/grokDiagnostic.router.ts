/**
 * Grok 诊断 Agent tRPC 路由
 * 
 * 提供设备故障诊断、会话管理、状态查询等 API
 */

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../core/trpc';
import {
  getAgentStatus,
  clearSession,
  getSessionHistory,
  type DiagnosticRequest,
} from '../services/grokDiagnosticAgent.service';
import { getAIInferenceProxy } from '../platform/ai-inference/ai-inference-proxy';
import { createModuleLogger } from '../core/logger';
import { diagnosisInputSchema, sessionIdSchema } from '../../shared/contracts/schemas';

const log = createModuleLogger('grokDiagnosticRouter');

export const grokDiagnosticRouter = router({
  /**
   * 执行设备诊断
   */
  // S0-2: 诊断执行消耗 AI 推理资源，必须认证
  diagnose: protectedProcedure
    .input(diagnosisInputSchema)
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

      const proxy = getAIInferenceProxy();
      const result = await proxy.diagnose(request);

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
   * P0-6: 会话历史包含诊断敏感数据，改为 protectedProcedure
   */
  sessionHistory: protectedProcedure
    .input(z.object({ sessionId: sessionIdSchema }))
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
  clearSession: protectedProcedure
    .input(z.object({ sessionId: sessionIdSchema }))
    .mutation(({ input }) => {
      const cleared = clearSession(input.sessionId);
      return { success: cleared };
    }),

  /**
   * 批量诊断（多设备）
   */
  // S0-2: 批量诊断最多10设备，资源消耗大，必须认证
  batchDiagnose: protectedProcedure
    .input(
      z.object({
        devices: z.array(
          z.object({
            deviceCode: z.string(),
            description: z.string(),
            sensorReadings: z.record(z.string(), z.number()).optional(),
          })
        ).min(1).max(10),
        mode: diagnosisInputSchema.shape.mode,
      })
    )
    .mutation(async ({ input }) => {
      log.info(`Batch diagnostic request for ${input.devices.length} devices`);

      const proxy = getAIInferenceProxy();
      const batchResult = await proxy.batchDiagnose(
        input.devices.map(device => ({
          deviceCode: device.deviceCode,
          description: device.description,
          sensorReadings: device.sensorReadings,
          mode: input.mode || 'quick',
        })),
        input.mode,
      );

      return batchResult;
    }),
});
