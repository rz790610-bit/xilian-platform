import { z, router, publicProcedure } from './_shared';
import { auditLogService, alertRuleService, dataExportTaskService } from '../../services/database/ops.db.service';

export const opsDbRouter = router({
  listAuditLogs: publicProcedure
    .input(z.object({ action: z.string().optional(), resourceType: z.string().optional(), operator: z.string().optional(), startDate: z.date().optional(), endDate: z.date().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => auditLogService.list(input ?? undefined)),
  createAuditLog: publicProcedure
    .input(z.object({ action: z.string(), resourceType: z.string(), resourceId: z.string(), operator: z.string(), operatorIp: z.string().optional(), oldValue: z.any().optional(), newValue: z.any().optional(), result: z.string().optional(), errorMessage: z.string().optional(), durationMs: z.number().optional(), traceId: z.string().optional() }))
    .mutation(({ input }) => auditLogService.create(input)),
  getAuditStats: publicProcedure.query(() => auditLogService.getStats()),

  listAlertRules: publicProcedure
    .input(z.object({ deviceType: z.string().optional(), severity: z.string().optional(), isActive: z.number().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => alertRuleService.list(input ?? undefined)),
  getAlertRule: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => alertRuleService.getById(input.id)),
  createAlertRule: publicProcedure
    .input(z.object({ ruleCode: z.string(), name: z.string(), deviceType: z.string(), measurementType: z.string(), severity: z.string(), condition: z.any(), cooldownSeconds: z.number().optional(), notificationChannels: z.any().optional(), priority: z.number().optional(), description: z.string().optional(), createdBy: z.string().optional() }))
    .mutation(({ input }) => alertRuleService.create(input)),
  updateAlertRule: publicProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), severity: z.string().optional(), condition: z.any().optional(), cooldownSeconds: z.number().optional(), notificationChannels: z.any().optional(), isActive: z.number().optional(), priority: z.number().optional(), description: z.string().optional(), updatedBy: z.string().optional() }))
    .mutation(({ input }) => { const { id, ...data } = input; return alertRuleService.update(id, data); }),
  deleteAlertRule: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => alertRuleService.softDelete(input.id)),
  toggleAlertRule: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => alertRuleService.toggleActive(input.id)),

  listExportTasks: publicProcedure
    .input(z.object({ exportType: z.string().optional(), status: z.string().optional(), createdBy: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => dataExportTaskService.list(input ?? undefined)),
  getExportTask: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => dataExportTaskService.getById(input.id)),
  createExportTask: publicProcedure
    .input(z.object({ taskCode: z.string(), name: z.string(), exportType: z.string(), format: z.string(), queryParams: z.any(), createdBy: z.string().optional() }))
    .mutation(({ input }) => dataExportTaskService.create(input)),
  updateExportProgress: publicProcedure
    .input(z.object({ id: z.number(), progress: z.number(), totalRows: z.number().optional() }))
    .mutation(({ input }) => dataExportTaskService.updateProgress(input.id, input.progress, input.totalRows)),
  markExportFailed: publicProcedure
    .input(z.object({ id: z.number(), errorMessage: z.string() }))
    .mutation(({ input }) => dataExportTaskService.markFailed(input.id, input.errorMessage)),
});
