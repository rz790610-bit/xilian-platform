import { getDb } from "../../lib/db";
import { eq, desc } from "drizzle-orm";
import * as schema from "../../../drizzle/schema";
import { clickhouseConnector } from "../../platform/connectors/clickhouse.connector";

export class TelemetryService {
  async getLatest(deviceCode: string) {
    const db = (await getDb())!;
    return db.select().from(schema.realtimeTelemetry).where(eq(schema.realtimeTelemetry.deviceCode, deviceCode)).orderBy(desc(schema.realtimeTelemetry.timestamp)).limit(100);
  }
  async getHistory(deviceCode: string, from: string, to: string) {
    const db = (await getDb())!;
    return clickhouseConnector.query(`SELECT * FROM ch_telemetry_1s WHERE device_code = '${deviceCode}' AND ts BETWEEN '${from}' AND '${to}' ORDER BY ts`);
  }
  async getGateways() {
    const db = (await getDb())!;
    return db.select().from(schema.edgeGateways);
  }
}
export const telemetryService = new TelemetryService();
