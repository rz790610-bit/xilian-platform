import { z, router, publicProcedure } from './_shared';
import { realtimeDataService, vibrationAggService } from '../../services/database/telemetry.db.service';

export const telemetryDbRouter = router({
  listRealtimeData: publicProcedure
    .input(z.object({ deviceCode: z.string().optional(), mpCode: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => realtimeDataService.list(input ?? undefined)),
  getLatestData: publicProcedure
    .input(z.object({ deviceCode: z.string(), mpCode: z.string() }))
    .query(({ input }) => realtimeDataService.getLatest(input.deviceCode, input.mpCode)),
  upsertRealtimeData: publicProcedure
    .input(z.object({ deviceCode: z.string(), mpCode: z.string(), value: z.number().optional(), stringValue: z.string().optional(), quality: z.number(), sourceTimestamp: z.string().transform(v => new Date(v)), serverTimestamp: z.string().transform(v => new Date(v)) }))
    .mutation(({ input }) => realtimeDataService.upsert(input)),
  listVibrationAgg: publicProcedure
    .input(z.object({ deviceCode: z.string().optional(), mpCode: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => vibrationAggService.list(input ?? undefined)),
  createVibrationAgg: publicProcedure
    .input(z.object({ deviceCode: z.string(), mpCode: z.string(), hourStart: z.string().transform(v => new Date(v)), rmsAvg: z.number().optional(), rmsMax: z.number().optional(), peakAvg: z.number().optional(), peakMax: z.number().optional(), kurtosisAvg: z.number().optional(), sampleCount: z.number() }))
    .mutation(({ input }) => vibrationAggService.create(input)),
});
