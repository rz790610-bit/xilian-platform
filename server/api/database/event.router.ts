import { z, router, publicProcedure } from './_shared';
import { eventStoreService, eventSnapshotService } from '../../services/database/data.service';

export const eventRouter = router({
  listEvents: publicProcedure
    .input(z.object({
      aggregateType: z.string().optional(),
      aggregateId: z.string().optional(),
      eventType: z.string().optional(),
      nodeId: z.string().optional(),
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    }).optional())
    .query(({ input }) => eventStoreService.list({
      ...input,
      pageSize: input?.limit || input?.pageSize,
    })),

  appendEvent: publicProcedure
    .input(z.object({
      eventId: z.string().max(64).optional(),
      eventType: z.string().min(1).max(100),
      aggregateType: z.string().min(1).max(50),
      aggregateId: z.string().min(1).max(100),
      aggregateVersion: z.number().int().optional(),
      payload: z.any().optional(),
      metadata: z.any().optional(),
      nodeId: z.string().optional(),
      causationId: z.string().optional(),
      correlationId: z.string().optional(),
      actorId: z.string().optional(),
      actorType: z.string().optional(),
    }))
    .mutation(({ input }) => eventStoreService.append({
      ...input,
      eventId: input.eventId || `EVT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      aggregateVersion: input.aggregateVersion ?? 1,
      payload: input.payload || {},
    })),

  getEventStats: publicProcedure
    .query(() => eventStoreService.getStats()),

  listSnapshots: publicProcedure
    .input(z.object({
      aggregateType: z.string().optional(),
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    }).optional())
    .query(({ input }) => eventSnapshotService.list({ ...input, pageSize: input?.limit || input?.pageSize })),

  createSnapshot: publicProcedure
    .input(z.object({
      aggregateType: z.string().min(1),
      aggregateId: z.string().min(1),
      version: z.number().int(),
      state: z.any(),
    }))
    .mutation(({ input }) => eventSnapshotService.create(input)),
});
