import { z, router, publicProcedure } from './_shared';
import { messageRoutingService, minioFileService, minioUploadLogService } from '../../services/database/message.db.service';

export const messageDbRouter = router({
  listRoutes: publicProcedure
    .input(z.object({ search: z.string().optional(), isEnabled: z.number().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => messageRoutingService.list(input ?? undefined)),
  getRoute: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => messageRoutingService.getById(input.id)),
  createRoute: publicProcedure
    .input(z.object({ routeName: z.string(), sourceTopic: z.string(), targetTopic: z.string(), filterExpr: z.string().optional(), transformScript: z.string().optional(), priority: z.number(), isEnabled: z.number().optional() }))
    .mutation(({ input }) => messageRoutingService.create(input)),
  updateRoute: publicProcedure
    .input(z.object({ id: z.number(), routeName: z.string().optional(), sourceTopic: z.string().optional(), targetTopic: z.string().optional(), filterExpr: z.string().optional(), transformScript: z.string().optional(), priority: z.number().optional(), isEnabled: z.number().optional() }))
    .mutation(({ input }) => { const { id, ...data } = input; return messageRoutingService.update(id, data); }),
  listFiles: publicProcedure
    .input(z.object({ bucket: z.string().optional(), contentType: z.string().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => minioFileService.list(input ?? undefined)),
  getFile: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => minioFileService.getById(input.id)),
  createFile: publicProcedure
    .input(z.object({ bucket: z.string(), objectKey: z.string(), contentType: z.string(), fileSize: z.number(), etag: z.string().optional(), tags: z.any().optional(), uploadedBy: z.string().optional() }))
    .mutation(({ input }) => minioFileService.create(input)),
  listUploadLogs: publicProcedure
    .input(z.object({ bucket: z.string().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => minioUploadLogService.list(input ?? undefined)),
  createUploadLog: publicProcedure
    .input(z.object({ bucket: z.string(), objectKey: z.string(), fileSize: z.number(), uploadDurationMs: z.number().optional(), status: z.string(), errorMessage: z.string().optional(), uploadedBy: z.string().optional() }))
    .mutation(({ input }) => minioUploadLogService.create(input)),
});
