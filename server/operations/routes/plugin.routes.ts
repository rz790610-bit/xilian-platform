import { router, publicProcedure } from "../../core/trpc";
import { pluginManager } from "../../platform/services/plugin-manager.service";
import { z } from "zod";

export const pluginRoutes = router({
  list: publicProcedure.query(() => pluginManager.listPlugins()),
  install: publicProcedure.input(z.object({ name: z.string(), version: z.string(), type: z.string() })).mutation(({ input }) => pluginManager.installPlugin(input)),
  start: publicProcedure.input(z.object({ pluginId: z.number() })).mutation(({ input }) => pluginManager.startPlugin(input.pluginId)),
  stop: publicProcedure.input(z.object({ pluginId: z.number() })).mutation(({ input }) => pluginManager.stopPlugin(input.pluginId)),
});
