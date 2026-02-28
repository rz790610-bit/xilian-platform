import { z, router, publicProcedure } from './_shared';
import { topoAlertService, topoLayerService, topoSnapshotService } from '../../services/database/topo.db.service';

export const topoDbRouter = router({
  listAlerts: publicProcedure
    .input(z.object({ nodeId: z.string().optional(), alertType: z.string().optional(), severity: z.string().optional(), resolved: z.number().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => topoAlertService.list(input ?? undefined)),
  createAlert: publicProcedure
    .input(z.object({ nodeId: z.string(), alertType: z.string(), severity: z.string(), message: z.string() }))
    .mutation(({ input }) => topoAlertService.create(input)),
  resolveAlert: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => topoAlertService.resolve(input.id)),
  listLayers: publicProcedure
    .query(() => topoLayerService.list()),
  getLayer: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => topoLayerService.getById(input.id)),
  createLayer: publicProcedure
    .input(z.object({ layerCode: z.string(), layerName: z.string(), layerOrder: z.number(), color: z.string().optional(), description: z.string().optional() }))
    .mutation(({ input }) => topoLayerService.create(input)),
  updateLayer: publicProcedure
    .input(z.object({ id: z.number(), layerName: z.string().optional(), layerOrder: z.number().optional(), color: z.string().optional(), description: z.string().optional() }))
    .mutation(({ input }) => { const { id, ...data } = input; return topoLayerService.update(id, data); }),
  listSnapshots: publicProcedure
    .input(z.object({ page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => topoSnapshotService.list(input ?? undefined)),
  getSnapshot: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => topoSnapshotService.getById(input.id)),
  createSnapshot: publicProcedure
    .input(z.object({ snapshotName: z.string(), snapshotData: z.any(), nodeCount: z.number(), edgeCount: z.number(), createdBy: z.string().optional() }))
    .mutation(({ input }) => topoSnapshotService.create(input)),
});
