import { router, publicProcedure } from "../../core/trpc";
import { deviceConfigService } from "../services/device-config.service";
import { ruleVersionService } from "../services/rule-version.service";

export const deviceRoutes = router({
  samplingConfigs: publicProcedure.query(() => deviceConfigService.getSamplingConfigs()),
  protocolConfigs: publicProcedure.query(() => deviceConfigService.getProtocolConfigs()),
  ruleVersions: publicProcedure.query(() => ruleVersionService.listVersions()),
  kpis: publicProcedure.query(() => deviceConfigService.getKPIs()),
});
