import { getDb } from "../../lib/db";
import * as schema from "../../../drizzle/schema";

export class DiagnosisService {
  async listRules() {
    const db = (await getDb())!;
    return db.select().from(schema.diagnosisRules);
  }
  async listTasks() {
    const db = (await getDb())!;
    return db.select().from(schema.diagnosisTasks);
  }
  async listAnomalies() {
    const db = (await getDb())!;
    return db.select().from(schema.anomalyDetections);
  }
  async listCalibrations() {
    const db = (await getDb())!;
    return db.select().from(schema.sensorCalibrations);
  }
  async createTask(data: { ruleName: string; deviceCode: string; config: any }) {
    const db = (await getDb())!;
    return db.insert(schema.diagnosisTasks).values({ taskName: data.ruleName, deviceCode: data.deviceCode, config: data.config, status: "pending" } as any);
  }
}
export const diagnosisService = new DiagnosisService();
