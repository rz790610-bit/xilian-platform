import { getDb } from "../../lib/db";
import { eq } from "drizzle-orm";
import * as schema from "../../../drizzle/schema";

export class DeviceConfigService {
  async getSamplingConfigs(deviceCode?: string) {
    const db = (await getDb())!;
    if (deviceCode) return db.select().from(schema.deviceSamplingConfig).where(eq(schema.deviceSamplingConfig.nodeId, deviceCode));
    return db.select().from(schema.deviceSamplingConfig);
  }
  async getProtocolConfigs() {
    const db = (await getDb())!;
    return db.select().from(schema.deviceProtocolConfig);
  }
  async getRuleVersions() {
    const db = (await getDb())!;
    return db.select().from(schema.deviceRuleVersions);
  }
  async getKPIs() {
    const db = (await getDb())!;
    return db.select().from(schema.deviceKpis);
  }
}
export const deviceConfigService = new DeviceConfigService();
