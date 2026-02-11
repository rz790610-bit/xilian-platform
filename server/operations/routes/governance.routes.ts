import { router, publicProcedure } from "../../core/trpc";
import { governanceJobService } from "../services/governance-job.service";
import { dataExportService } from "../services/data-export.service";

export const governanceRoutes = router({
  jobs: publicProcedure.query(() => governanceJobService.listJobs()),
  lineage: publicProcedure.query(() => dataExportService.getDataLineage()),
  policies: publicProcedure.query(() => dataExportService.getLifecyclePolicies()),
  metrics: publicProcedure.query(() => governanceJobService.getCollectionMetrics()),
});
