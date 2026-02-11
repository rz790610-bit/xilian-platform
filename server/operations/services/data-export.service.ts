import { getDb } from "../../lib/db";
import * as schema from "../../../drizzle/schema";

export class DataExportService {
  async getGovernanceJobs() {
    const db = (await getDb())!;
    return db.select().from(schema.dataGovernanceJobs);
  }
  async getDataLineage() {
    const db = (await getDb())!;
    return db.select().from(schema.dataLineage);
  }
  async getLifecyclePolicies() {
    const db = (await getDb())!;
    return db.select().from(schema.dataLifecyclePolicies);
  }
}
export const dataExportService = new DataExportService();
