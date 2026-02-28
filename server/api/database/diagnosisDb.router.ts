import { z, router, publicProcedure } from './_shared';
import { anomalyModelService, diagnosisResultService } from '../../services/database/diagnosis.db.service';

export const diagnosisDbRouter = router({
  listAnomalyModels: publicProcedure
    .input(z.object({ modelType: z.string().optional(), status: z.string().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => anomalyModelService.list(input ?? undefined)),
  getAnomalyModel: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => anomalyModelService.getById(input.id)),
  createAnomalyModel: publicProcedure
    .input(z.object({ modelCode: z.string(), modelName: z.string(), modelType: z.string(), targetMetric: z.string(), hyperparams: z.any().optional(), trainingDataRange: z.any().optional(), accuracy: z.number().optional(), modelFileUrl: z.string().optional(), status: z.string().optional() }))
    .mutation(({ input }) => anomalyModelService.create(input)),
  deployAnomalyModel: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => anomalyModelService.deploy(input.id)),
  listDiagnosisResults: publicProcedure
    .input(z.object({ deviceCode: z.string().optional(), diagnosisType: z.string().optional(), severity: z.string().optional(), resolved: z.number().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => diagnosisResultService.list(input ?? undefined)),
  getDiagnosisResult: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => diagnosisResultService.getById(input.id)),
  createDiagnosisResult: publicProcedure
    .input(z.object({ taskId: z.number(), deviceCode: z.string(), diagnosisType: z.string(), severity: z.string(), faultCode: z.string().optional(), faultDescription: z.string().optional(), confidence: z.number().optional(), evidence: z.any().optional(), recommendation: z.string().optional() }))
    .mutation(({ input }) => diagnosisResultService.create(input)),
  resolveDiagnosis: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => diagnosisResultService.resolve(input.id)),
});
