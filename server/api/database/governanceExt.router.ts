import { z, router, publicProcedure } from './_shared';
import { auditLogsSensitiveService, dataCleanResultService, dataCollectionTaskService } from '../../services/database/governance.db.service';

export const governanceExtRouter = router({
  listSensitiveLogs: publicProcedure
    .input(z.object({ auditLogId: z.number().optional(), sensitiveType: z.string().optional(), riskLevel: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => auditLogsSensitiveService.list(input ?? undefined)),
  createSensitiveLog: publicProcedure
    .input(z.object({ auditLogId: z.number(), sensitiveType: z.string(), sensitiveData: z.any().optional(), riskLevel: z.string(), requiresApproval: z.number() }))
    .mutation(({ input }) => auditLogsSensitiveService.create(input)),
  approveSensitiveLog: publicProcedure
    .input(z.object({ id: z.number(), approvedBy: z.string() }))
    .mutation(({ input }) => auditLogsSensitiveService.approve(input.id, input.approvedBy)),
  listCleanResults: publicProcedure
    .input(z.object({ taskId: z.number().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => dataCleanResultService.list(input ?? undefined)),
  createCleanResult: publicProcedure
    .input(z.object({ taskId: z.number(), sourceTable: z.string(), sourceRowId: z.number(), fieldName: z.string(), originalValue: z.string().optional(), cleanedValue: z.string().optional(), ruleApplied: z.string().optional(), status: z.string().optional() }))
    .mutation(({ input }) => dataCleanResultService.create(input)),
  listCollectionTasks: publicProcedure
    .input(z.object({ gatewayId: z.string().optional(), taskType: z.string().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => dataCollectionTaskService.list(input ?? undefined)),
  getCollectionTask: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => dataCollectionTaskService.getById(input.id)),
  createCollectionTask: publicProcedure
    .input(z.object({ taskId: z.string(), taskName: z.string(), gatewayId: z.string(), taskType: z.string().optional(), sensorIds: z.any(), scheduleConfig: z.any().optional(), samplingConfig: z.any().optional(), preprocessingConfig: z.any().optional(), triggerConfig: z.any().optional(), status: z.string().optional() }))
    .mutation(({ input }) => dataCollectionTaskService.create(input)),
  updateCollectionTaskStatus: publicProcedure
    .input(z.object({ id: z.number(), status: z.string(), errorMessage: z.string().optional() }))
    .mutation(({ input }) => dataCollectionTaskService.updateStatus(input.id, input.status, input.errorMessage)),
});
