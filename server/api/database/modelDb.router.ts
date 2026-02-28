import { z, router, publicProcedure } from './_shared';
import { modelRegistryService, modelDeploymentService, modelTrainingJobService, modelInferenceLogService } from '../../services/database/model.db.service';

export const modelDbRouter = router({
  listModels: publicProcedure
    .input(z.object({ modelType: z.string().optional(), status: z.string().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => modelRegistryService.list(input ?? undefined)),
  getModel: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => modelRegistryService.getById(input.id)),
  getModelByCode: publicProcedure
    .input(z.object({ modelCode: z.string() }))
    .query(({ input }) => modelRegistryService.getByCode(input.modelCode)),
  createModel: publicProcedure
    .input(z.object({ modelCode: z.string(), modelName: z.string(), modelType: z.string(), framework: z.string().optional(), version: z.string(), description: z.string().optional(), modelFileUrl: z.string().optional(), metrics: z.any().optional(), tags: z.any().optional(), status: z.string().optional(), createdBy: z.string().optional() }))
    .mutation(({ input }) => modelRegistryService.create(input)),
  updateModel: publicProcedure
    .input(z.object({ id: z.number(), modelName: z.string().optional(), framework: z.string().optional(), version: z.string().optional(), description: z.string().optional(), modelFileUrl: z.string().optional(), metrics: z.any().optional(), tags: z.any().optional(), status: z.string().optional() }))
    .mutation(({ input }) => { const { id, ...data } = input; return modelRegistryService.update(id, data); }),
  listDeployments: publicProcedure
    .input(z.object({ modelId: z.number().optional(), environment: z.string().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => modelDeploymentService.list(input ?? undefined)),
  getDeployment: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => modelDeploymentService.getById(input.id)),
  createDeployment: publicProcedure
    .input(z.object({ modelId: z.number(), deploymentName: z.string(), environment: z.string(), endpointUrl: z.string().optional(), replicas: z.number(), gpuType: z.string().optional() }))
    .mutation(({ input }) => modelDeploymentService.create(input)),
  updateDeploymentStatus: publicProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(({ input }) => modelDeploymentService.updateStatus(input.id, input.status)),
  listTrainingJobs: publicProcedure
    .input(z.object({ modelId: z.number().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => modelTrainingJobService.list(input ?? undefined)),
  getTrainingJob: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => modelTrainingJobService.getById(input.id)),
  createTrainingJob: publicProcedure
    .input(z.object({ modelId: z.number(), jobName: z.string(), trainingData: z.any().optional(), hyperparams: z.any().optional(), gpuType: z.string().optional(), epochs: z.number().optional() }))
    .mutation(({ input }) => modelTrainingJobService.create(input)),
  updateTrainingProgress: publicProcedure
    .input(z.object({ id: z.number(), currentEpoch: z.number(), loss: z.number().optional(), status: z.string().optional() }))
    .mutation(({ input }) => modelTrainingJobService.updateProgress(input.id, input.currentEpoch, input.loss, input.status)),
  listInferenceLogs: publicProcedure
    .input(z.object({ deploymentId: z.number().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => modelInferenceLogService.list(input ?? undefined)),
  createInferenceLog: publicProcedure
    .input(z.object({ deploymentId: z.number(), requestId: z.string(), inputTokens: z.number().optional(), outputTokens: z.number().optional(), latencyMs: z.number().optional(), status: z.string(), errorMessage: z.string().optional() }))
    .mutation(({ input }) => modelInferenceLogService.create(input)),
});
