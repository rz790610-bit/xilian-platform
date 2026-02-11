import { router, publicProcedure } from "../../core/trpc";
import { diagnosisService } from "../services/diagnosis.service";

export const diagnosisRoutes = router({
  rules: publicProcedure.query(() => diagnosisService.listRules()),
  tasks: publicProcedure.query(() => diagnosisService.listTasks()),
  anomalies: publicProcedure.query(() => diagnosisService.listAnomalies()),
  calibrations: publicProcedure.query(() => diagnosisService.listCalibrations()),
});
