import { router, publicProcedure } from "../../core/trpc";
import { assetTreeService } from "../services/asset-tree.service";
import { z } from "zod";

export const assetsRoutes = router({
  tree: publicProcedure.query(() => assetTreeService.getTree()),
  children: publicProcedure.input(z.object({ parentId: z.string() })).query(({ input }) => assetTreeService.getNodeChildren(input.parentId)),
  measurementPoints: publicProcedure.input(z.object({ nodeId: z.string() })).query(({ input }) => assetTreeService.getNodeMeasurementPoints(input.nodeId)),
});
