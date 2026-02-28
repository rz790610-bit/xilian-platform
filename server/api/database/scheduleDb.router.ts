import { z, router, publicProcedure } from './_shared';
import { scheduledTaskService, rollbackTriggerService, systemConfigService, asyncTaskLogService, messageQueueLogService } from '../../services/database/schedule.db.service';

export const scheduleDbRouter = router({
  listScheduledTasks: publicProcedure
    .input(z.object({ taskType: z.string().optional(), status: z.string().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => scheduledTaskService.list(input ?? undefined)),
  getScheduledTask: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => scheduledTaskService.getById(input.id)),
  createScheduledTask: publicProcedure
    .input(z.object({ taskCode: z.string(), name: z.string(), taskType: z.string(), cronExpression: z.string().optional(), intervalSeconds: z.number().optional(), handler: z.string(), params: z.any().optional(), timeoutSeconds: z.number().optional(), maxRetries: z.number().optional(), description: z.string().optional(), createdBy: z.string().optional() }))
    .mutation(({ input }) => scheduledTaskService.create(input)),
  updateScheduledTaskStatus: publicProcedure
    .input(z.object({ id: z.number(), status: z.string(), lastRunResult: z.string().optional() }))
    .mutation(({ input }) => scheduledTaskService.updateStatus(input.id, input.status, input.lastRunResult)),
  deleteScheduledTask: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => scheduledTaskService.softDelete(input.id)),

  listRollbackTriggers: publicProcedure
    .input(z.object({ targetTable: z.string().optional(), isActive: z.number().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => rollbackTriggerService.list(input ?? undefined)),
  getRollbackTrigger: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => rollbackTriggerService.getById(input.id)),
  createRollbackTrigger: publicProcedure
    .input(z.object({ triggerCode: z.string(), name: z.string(), targetTable: z.string(), conditionType: z.string(), conditionParams: z.any(), rollbackAction: z.string(), actionParams: z.any().optional(), createdBy: z.string().optional() }))
    .mutation(({ input }) => rollbackTriggerService.create(input)),
  toggleRollbackTrigger: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => rollbackTriggerService.toggleActive(input.id)),
  deleteRollbackTrigger: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => rollbackTriggerService.softDelete(input.id)),

  listSystemConfigs: publicProcedure
    .input(z.object({ category: z.string().optional(), environment: z.string().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => systemConfigService.list(input ?? undefined)),
  getSystemConfig: publicProcedure
    .input(z.object({ configKey: z.string(), environment: z.string().optional() }))
    .query(({ input }) => systemConfigService.getByKey(input.configKey, input.environment)),
  upsertSystemConfig: publicProcedure
    .input(z.object({ configKey: z.string(), configValue: z.string(), valueType: z.string(), category: z.string(), environment: z.string().optional(), description: z.string().optional(), isSensitive: z.number().optional(), updatedBy: z.string().optional() }))
    .mutation(({ input }) => systemConfigService.upsert(input)),
  getConfigChangeHistory: publicProcedure
    .input(z.object({ configKey: z.string(), limit: z.number().optional() }))
    .query(({ input }) => systemConfigService.getChangeHistory(input.configKey, input.limit)),

  listAsyncTasks: publicProcedure
    .input(z.object({ taskType: z.string().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => asyncTaskLogService.list(input ?? undefined)),
  createAsyncTask: publicProcedure
    .input(z.object({ taskId: z.string(), taskType: z.string(), inputParams: z.any().optional(), maxRetries: z.number().optional(), createdBy: z.string().optional() }))
    .mutation(({ input }) => asyncTaskLogService.create(input)),
  updateAsyncTaskStatus: publicProcedure
    .input(z.object({ id: z.number(), status: z.string(), outputResult: z.any().optional(), progress: z.number().optional(), errorMessage: z.string().optional() }))
    .mutation(({ input }) => { const { id, status, ...result } = input; return asyncTaskLogService.updateStatus(id, status, result); }),

  listMessageQueueLogs: publicProcedure
    .input(z.object({ topic: z.string().optional(), direction: z.string().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => messageQueueLogService.list(input ?? undefined)),
  createMessageQueueLog: publicProcedure
    .input(z.object({ messageId: z.string(), topic: z.string(), partitionKey: z.string().optional(), payload: z.any(), direction: z.string() }))
    .mutation(({ input }) => messageQueueLogService.create(input)),
  updateMessageQueueStatus: publicProcedure
    .input(z.object({ id: z.number(), status: z.string(), errorMessage: z.string().optional() }))
    .mutation(({ input }) => messageQueueLogService.updateStatus(input.id, input.status, input.errorMessage)),
});
