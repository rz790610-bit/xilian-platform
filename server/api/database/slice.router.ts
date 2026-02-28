import { z, router, publicProcedure } from './_shared';
import { sliceRuleService, dataSliceService } from '../../services/database/data.service';

export const sliceRouter = router({
  listRules: publicProcedure
    .input(z.object({ triggerType: z.string().optional(), isActive: z.number().optional() }).optional())
    .query(({ input }) => sliceRuleService.list(input ?? undefined)),

  getRule: publicProcedure
    .input(z.object({ ruleId: z.string() }))
    .query(({ input }) => sliceRuleService.getById(input.ruleId)),

  createRule: publicProcedure
    .input(z.object({
      ruleId: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      triggerType: z.string().min(1),
      triggerConfig: z.any(),
      deviceType: z.string().optional(),
      mechanismType: z.string().optional(),
      minDurationSec: z.number().optional(),
      maxDurationSec: z.number().optional(),
      mergeGapSec: z.number().optional(),
      autoLabels: z.any().optional(),
      priority: z.number().optional(),
    }))
    .mutation(({ input }) => sliceRuleService.create(input)),

  updateRule: publicProcedure
    .input(z.object({
      ruleId: z.string(),
      name: z.string().optional(),
      triggerConfig: z.any().optional(),
      isActive: z.number().optional(),
      priority: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const { ruleId, ...data } = input;
      return sliceRuleService.update(ruleId, data);
    }),

  deleteRule: publicProcedure
    .input(z.object({ ruleId: z.string() }))
    .mutation(({ input }) => sliceRuleService.delete(input.ruleId)),

  listSlices: publicProcedure
    .input(z.object({
      deviceCode: z.string().optional(),
      status: z.string().optional(),
      workConditionCode: z.string().optional(),
      faultTypeCode: z.string().optional(),
      labelStatus: z.string().optional(),
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    }).optional())
    .query(({ input }) => dataSliceService.list({ ...input, pageSize: input?.limit || input?.pageSize })),

  getSlice: publicProcedure
    .input(z.object({ sliceId: z.string() }))
    .query(({ input }) => dataSliceService.getById(input.sliceId)),

  getSliceStats: publicProcedure
    .query(() => dataSliceService.getStats()),

  createSlice: publicProcedure
    .input(z.object({
      sliceId: z.string().min(1).max(64),
      deviceCode: z.string().min(1),
      ruleId: z.string().optional(),
      startTime: z.string().min(1),
      endTime: z.string().min(1),
      durationSec: z.number().optional(),
      workConditionCode: z.string().optional(),
      faultTypeCode: z.string().optional(),
      qualityScore: z.number().optional(),
      status: z.string().optional(),
    }))
    .mutation(({ input }) => dataSliceService.create(input)),

  deleteSlice: publicProcedure
    .input(z.object({ sliceId: z.string() }))
    .mutation(({ input }) => dataSliceService.delete(input.sliceId)),

  getSliceLabels: publicProcedure
    .input(z.object({ sliceId: z.string() }))
    .query(({ input }) => dataSliceService.getLabels(input.sliceId)),

  updateSliceLabels: publicProcedure
    .input(z.object({
      sliceId: z.string(),
      labels: z.any(),
    }))
    .mutation(({ input }) => dataSliceService.updateLabels(input.sliceId, input.labels, 'system')),
});
