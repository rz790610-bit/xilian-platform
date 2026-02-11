import { getDb } from "../../lib/db";
import * as schema from "../../../drizzle/schema";

export class GovernanceJobService {
  async listJobs() {
    const db = (await getDb())!;
    return db.select().from(schema.dataGovernanceJobs);
  }
  async createJob(data: { jobName: string; jobType: string; config: any }) {
    const db = (await getDb())!;
    return db.insert(schema.dataGovernanceJobs).values({ jobName: data.jobName, jobType: data.jobType, config: data.config, status: "pending" } as any);
  }
  async getCollectionMetrics() {
    const db = (await getDb())!;
    return db.select().from(schema.dataCollectionMetrics);
  }
}
export const governanceJobService = new GovernanceJobService();
