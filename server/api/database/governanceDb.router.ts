import { z, router, publicProcedure } from './_shared';
import { dataGovernanceJobService, dataLineageService, anomalyDetectionService } from '../../services/database/governance.db.service';

export const governanceDbRouter = router({
  listGovernanceJobs: publicProcedure
    .input(z.object({ jobType: z.string().optional(), status: z.string().optional(), targetTable: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => dataGovernanceJobService.list(input ?? undefined)),
  getGovernanceJob: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => dataGovernanceJobService.getById(input.id)),
  createGovernanceJob: publicProcedure
    .input(z.object({ jobId: z.string(), policyId: z.string(), jobType: z.string(), targetTable: z.string(), filterCondition: z.any().optional() }))
    .mutation(({ input }) => dataGovernanceJobService.create(input)),
  updateGovernanceJobStatus: publicProcedure
    .input(z.object({ id: z.number(), status: z.string(), affectedRows: z.number().optional(), freedBytes: z.number().optional(), errorMessage: z.string().optional() }))
    .mutation(({ input }) => { const { id, status, ...result } = input; return dataGovernanceJobService.updateStatus(id, status, result); }),
  getGovernanceStats: publicProcedure.query(() => dataGovernanceJobService.getStats()),

  listLineage: publicProcedure
    .input(z.object({ sourceType: z.string().optional(), targetType: z.string().optional(), transformType: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => dataLineageService.list(input ?? undefined)),
  getLineageBySource: publicProcedure
    .input(z.object({ sourceId: z.string() }))
    .query(({ input }) => dataLineageService.getBySourceId(input.sourceId)),
  getLineageByTarget: publicProcedure
    .input(z.object({ targetId: z.string() }))
    .query(({ input }) => dataLineageService.getByTargetId(input.targetId)),
  getFullLineageChain: publicProcedure
    .input(z.object({ entityId: z.string() }))
    .query(({ input }) => dataLineageService.getFullChain(input.entityId)),
  createLineage: publicProcedure
    .input(z.object({ lineageId: z.string(), sourceType: z.string(), sourceId: z.string(), sourceDetail: z.any().optional(), targetType: z.string(), targetId: z.string(), targetDetail: z.any().optional(), transformType: z.string(), transformParams: z.any().optional(), operator: z.string().optional() }))
    .mutation(({ input }) => dataLineageService.create(input)),

  listAnomalies: publicProcedure
    .input(z.object({ sensorId: z.string().optional(), severity: z.string().optional(), status: z.string().optional(), algorithmType: z.string().optional(), startDate: z.date().optional(), endDate: z.date().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => anomalyDetectionService.list(input ?? undefined)),
  getAnomaly: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => anomalyDetectionService.getById(input.id)),
  createAnomaly: publicProcedure
    .input(z.object({ detectionId: z.string(), sensorId: z.string(), nodeId: z.string().optional(), algorithmType: z.string(), windowSize: z.number(), threshold: z.number(), currentValue: z.number(), expectedValue: z.number(), deviation: z.number(), score: z.number(), severity: z.string() }))
    .mutation(({ input }) => anomalyDetectionService.create(input)),
  acknowledgeAnomaly: publicProcedure
    .input(z.object({ id: z.number(), acknowledgedBy: z.string() }))
    .mutation(({ input }) => anomalyDetectionService.acknowledge(input.id, input.acknowledgedBy)),
  resolveAnomaly: publicProcedure
    .input(z.object({ id: z.number(), notes: z.string().optional() }))
    .mutation(({ input }) => anomalyDetectionService.resolve(input.id, input.notes)),
  getAnomalyStats: publicProcedure.query(() => anomalyDetectionService.getStats()),
});
