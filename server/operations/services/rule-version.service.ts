import { getDb } from "../../lib/db";
import * as schema from "../../../drizzle/schema";

export class RuleVersionService {
  async listVersions() {
    const db = (await getDb())!;
    return db.select().from(schema.deviceRuleVersions);
  }
  async createVersion(data: { ruleCode: string; version: string; content: any }) {
    const db = (await getDb())!;
    return db.insert(schema.deviceRuleVersions).values({ ruleCode: data.ruleCode, versionTag: data.version, ruleContent: data.content, status: "draft" } as any);
  }
}
export const ruleVersionService = new RuleVersionService();
