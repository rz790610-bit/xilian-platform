import { z, router, publicProcedure } from './_shared';
import { pluginRegistryService, pluginInstanceService, pluginEventService } from '../../services/database/plugin.db.service';

export const pluginDbRouter = router({
  listPlugins: publicProcedure
    .input(z.object({ pluginType: z.string().optional(), status: z.string().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => pluginRegistryService.list(input ?? undefined)),
  getPlugin: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => pluginRegistryService.getById(input.id)),
  getPluginByCode: publicProcedure
    .input(z.object({ pluginCode: z.string() }))
    .query(({ input }) => pluginRegistryService.getByCode(input.pluginCode)),
  createPlugin: publicProcedure
    .input(z.object({ pluginCode: z.string(), name: z.string(), pluginType: z.string(), version: z.string(), entryPoint: z.string(), description: z.string().optional(), configSchema: z.any().optional(), defaultConfig: z.any().optional(), capabilities: z.any().optional(), dependencies: z.any().optional(), author: z.string().optional(), license: z.string().optional(), isBuiltin: z.number().optional(), createdBy: z.string().optional() }))
    .mutation(({ input }) => pluginRegistryService.create(input)),
  updatePlugin: publicProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), version: z.string().optional(), entryPoint: z.string().optional(), description: z.string().optional(), configSchema: z.any().optional(), defaultConfig: z.any().optional(), capabilities: z.any().optional(), dependencies: z.any().optional(), status: z.string().optional(), updatedBy: z.string().optional() }))
    .mutation(({ input }) => { const { id, ...data } = input; return pluginRegistryService.update(id, data); }),
  deletePlugin: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => pluginRegistryService.delete(input.id)),
  getPluginStats: publicProcedure.query(() => pluginRegistryService.getStats()),

  listInstances: publicProcedure
    .input(z.object({ pluginId: z.number().optional(), status: z.string().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => pluginInstanceService.list(input ?? undefined)),
  getInstance: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => pluginInstanceService.getById(input.id)),
  createInstance: publicProcedure
    .input(z.object({ instanceCode: z.string(), pluginId: z.number(), name: z.string(), boundEntityType: z.string().optional(), boundEntityId: z.string().optional(), config: z.any().optional(), createdBy: z.string().optional() }))
    .mutation(({ input }) => pluginInstanceService.create(input)),
  updateInstanceStatus: publicProcedure
    .input(z.object({ id: z.number(), status: z.string(), errorMessage: z.string().optional() }))
    .mutation(({ input }) => pluginInstanceService.updateStatus(input.id, input.status, input.errorMessage)),
  heartbeatInstance: publicProcedure
    .input(z.object({ id: z.number(), runtimeState: z.any().optional() }))
    .mutation(({ input }) => pluginInstanceService.heartbeat(input.id, input.runtimeState)),
  deleteInstance: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => pluginInstanceService.delete(input.id)),

  listEvents: publicProcedure
    .input(z.object({ instanceId: z.number().optional(), eventType: z.string().optional(), severity: z.string().optional(), processed: z.number().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => pluginEventService.list(input ?? undefined)),
  emitEvent: publicProcedure
    .input(z.object({ eventId: z.string(), instanceId: z.number(), eventType: z.string(), payload: z.any().optional(), severity: z.string().optional(), sourcePlugin: z.string().optional(), targetPlugin: z.string().optional(), expiresAt: z.date().optional() }))
    .mutation(({ input }) => pluginEventService.emit(input)),
  markEventProcessed: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => pluginEventService.markProcessed(input.id)),
});
