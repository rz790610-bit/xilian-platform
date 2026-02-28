import { z, router, publicProcedure } from './_shared';
import { alertEventLogService, deviceDailySummaryService, deviceFirmwareService, deviceMaintenanceService, deviceStatusLogService } from '../../services/database/device.db.service';

export const deviceDbRouter = router({
  listAlertEvents: publicProcedure
    .input(z.object({ deviceCode: z.string().optional(), severity: z.string().optional(), alertType: z.string().optional(), acknowledged: z.number().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => alertEventLogService.list(input ?? undefined)),
  getAlertEvent: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => alertEventLogService.getById(input.id)),
  createAlertEvent: publicProcedure
    .input(z.object({ alertId: z.string(), ruleId: z.number().optional(), deviceCode: z.string(), severity: z.string(), alertType: z.string(), message: z.string(), metricValue: z.number().optional(), thresholdValue: z.number().optional() }))
    .mutation(({ input }) => alertEventLogService.create(input)),
  acknowledgeAlert: publicProcedure
    .input(z.object({ id: z.number(), acknowledgedBy: z.string() }))
    .mutation(({ input }) => alertEventLogService.acknowledge(input.id, input.acknowledgedBy)),
  listDailySummaries: publicProcedure
    .input(z.object({ deviceCode: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => deviceDailySummaryService.list(input ?? undefined)),
  createDailySummary: publicProcedure
    .input(z.object({ deviceCode: z.string(), summaryDate: z.string(), onlineHours: z.number().optional(), alertCount: z.number(), dataPoints: z.number(), avgCpuUsage: z.number().optional(), avgMemoryUsage: z.number().optional(), maxTemperature: z.number().optional() }))
    .mutation(({ input }) => deviceDailySummaryService.create(input)),
  listFirmware: publicProcedure
    .input(z.object({ deviceType: z.string().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => deviceFirmwareService.list(input ?? undefined)),
  getFirmware: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => deviceFirmwareService.getById(input.id)),
  createFirmware: publicProcedure
    .input(z.object({ deviceType: z.string(), firmwareVersion: z.string(), releaseNotes: z.string().optional(), fileUrl: z.string(), fileHash: z.string(), fileSize: z.number(), isMandatory: z.number(), status: z.string().optional() }))
    .mutation(({ input }) => deviceFirmwareService.create(input)),
  updateFirmwareStatus: publicProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(({ input }) => deviceFirmwareService.updateStatus(input.id, input.status)),
  listMaintenanceLogs: publicProcedure
    .input(z.object({ deviceCode: z.string().optional(), maintenanceType: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => deviceMaintenanceService.list(input ?? undefined)),
  getMaintenanceLog: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => deviceMaintenanceService.getById(input.id)),
  createMaintenanceLog: publicProcedure
    .input(z.object({ deviceCode: z.string(), maintenanceType: z.string(), title: z.string(), description: z.string().optional(), operator: z.string(), startedAt: z.string().transform(v => new Date(v)), completedAt: z.string().optional().transform(v => v ? new Date(v) : undefined), result: z.string().optional(), cost: z.number().optional(), partsReplaced: z.any().optional(), attachments: z.any().optional(), nextMaintenanceDate: z.string().optional() }))
    .mutation(({ input }) => deviceMaintenanceService.create(input)),
  listStatusLogs: publicProcedure
    .input(z.object({ deviceCode: z.string().optional(), currentStatus: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => deviceStatusLogService.list(input ?? undefined)),
  createStatusLog: publicProcedure
    .input(z.object({ deviceCode: z.string(), previousStatus: z.string().optional(), currentStatus: z.string(), reason: z.string().optional(), triggeredBy: z.string().optional(), metadata: z.any().optional() }))
    .mutation(({ input }) => deviceStatusLogService.create(input)),
});
