import { z, router, publicProcedure } from './_shared';
import { cleanRuleService, cleanTaskService, qualityReportService, calibrationService } from '../../services/database/data.service';

export const cleanRouter = router({
  listRules: publicProcedure
    .input(z.object({ ruleType: z.string().optional(), isActive: z.number().optional() }).optional())
    .query(({ input }) => cleanRuleService.list(input ?? undefined)),

  getRule: publicProcedure
    .input(z.object({ ruleId: z.string() }))
    .query(({ input }) => cleanRuleService.getById(input.ruleId)),

  createRule: publicProcedure
    .input(z.object({
      ruleId: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      ruleType: z.string().min(1),
      detectConfig: z.any().optional(),
      actionType: z.string().optional(),
      actionConfig: z.any().optional(),
      deviceType: z.string().optional(),
      sensorType: z.string().optional(),
      measurementType: z.string().optional(),
      priority: z.number().optional(),
      description: z.string().optional(),
    }))
    .mutation(({ input }) => cleanRuleService.create({
      ...input,
      detectConfig: input.detectConfig || {},
      actionType: input.actionType || input.ruleType,
    })),

  updateRule: publicProcedure
    .input(z.object({
      ruleId: z.string(),
      name: z.string().optional(),
      detectConfig: z.any().optional(),
      actionConfig: z.any().optional(),
      isActive: z.number().optional(),
      priority: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const { ruleId, ...data } = input;
      return cleanRuleService.update(ruleId, data);
    }),

  deleteRule: publicProcedure
    .input(z.object({ ruleId: z.string() }))
    .mutation(({ input }) => cleanRuleService.delete(input.ruleId)),

  listTasks: publicProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => cleanTaskService.list({ ...input, pageSize: input?.limit || input?.pageSize })),

  getTask: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .query(({ input }) => cleanTaskService.getById(input.taskId)),

  createTask: publicProcedure
    .input(z.object({
      taskId: z.string().min(1).max(64),
      idempotentKey: z.string().min(1).max(64),
      name: z.string().optional(),
      deviceCode: z.string().optional(),
      sensorIds: z.array(z.string()).optional(),
      timeStart: z.string().min(1),
      timeEnd: z.string().min(1),
      ruleIds: z.array(z.string()).optional(),
    }))
    .mutation(({ input }) => cleanTaskService.create(input)),

  executeTask: publicProcedure
    .input(z.object({ ruleId: z.string() }))
    .mutation(async ({ input }) => {
      const taskId = `TASK-${Date.now()}`;
      const now = new Date();
      const result = await cleanTaskService.create({
        taskId,
        idempotentKey: `${input.ruleId}-${taskId}`,
        name: `Auto task for ${input.ruleId}`,
        ruleIds: [input.ruleId],
        timeStart: new Date(now.getTime() - 86400000).toISOString(),
        timeEnd: now.toISOString(),
      });
      return { taskId, success: true };
    }),

  listQualityReports: publicProcedure
    .input(z.object({
      reportType: z.string().optional(),
      deviceCode: z.string().optional(),
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    }).optional())
    .query(({ input }) => qualityReportService.list(input ?? undefined)),

  getQualityStats: publicProcedure
    .query(() => qualityReportService.getStats()),

  listCalibrations: publicProcedure
    .input(z.object({ deviceCode: z.string().optional(), sensorId: z.string().optional() }).optional())
    .query(({ input }) => calibrationService.list(input ?? undefined)),

  createCalibration: publicProcedure
    .input(z.object({
      deviceCode: z.string().min(1),
      sensorId: z.string().min(1),
      calibrationDate: z.string().min(1),
      calibrationType: z.string().min(1),
      offsetBefore: z.number().optional(),
      offsetAfter: z.number().optional(),
      scaleBefore: z.number().optional(),
      scaleAfter: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(({ input }) => calibrationService.create(input)),
});
