import { router, publicProcedure } from "../../core/trpc";
import { telemetryService } from "../services/telemetry.service";
import { z } from "zod";

export const monitoringRoutes = router({
  gateways: publicProcedure.query(() => telemetryService.getGateways()),
  latest: publicProcedure.input(z.object({ deviceCode: z.string() })).query(({ input }) => telemetryService.getLatest(input.deviceCode)),
  history: publicProcedure.input(z.object({ deviceCode: z.string(), from: z.string(), to: z.string() })).query(({ input }) => telemetryService.getHistory(input.deviceCode, input.from, input.to)),
});
