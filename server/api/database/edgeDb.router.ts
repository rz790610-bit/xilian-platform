import { z, router, publicProcedure } from './_shared';
import { edgeGatewayConfigService } from '../../services/database/edge.db.service';

export const edgeDbRouter = router({
  listGateways: publicProcedure
    .input(z.object({ gatewayType: z.string().optional(), status: z.string().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => edgeGatewayConfigService.list(input ?? undefined)),
  getGateway: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => edgeGatewayConfigService.getById(input.id)),
  getGatewayByCode: publicProcedure
    .input(z.object({ gatewayCode: z.string() }))
    .query(({ input }) => edgeGatewayConfigService.getByCode(input.gatewayCode)),
  createGateway: publicProcedure
    .input(z.object({ gatewayCode: z.string(), gatewayName: z.string(), gatewayType: z.string(), ipAddress: z.string().optional(), port: z.number().optional(), firmwareVersion: z.string().optional(), protocols: z.any().optional(), maxDevices: z.number(), heartbeatInterval: z.number(), status: z.string().optional(), location: z.string().optional() }))
    .mutation(({ input }) => edgeGatewayConfigService.create(input)),
  updateGateway: publicProcedure
    .input(z.object({ id: z.number(), gatewayName: z.string().optional(), ipAddress: z.string().optional(), port: z.number().optional(), firmwareVersion: z.string().optional(), protocols: z.any().optional(), maxDevices: z.number().optional(), heartbeatInterval: z.number().optional(), status: z.string().optional(), location: z.string().optional() }))
    .mutation(({ input }) => { const { id, ...data } = input; return edgeGatewayConfigService.update(id, data); }),
  heartbeat: publicProcedure
    .input(z.object({ gatewayCode: z.string() }))
    .mutation(({ input }) => edgeGatewayConfigService.heartbeat(input.gatewayCode)),
});
