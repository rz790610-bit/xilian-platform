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
    // P0-R7-02: SQL 注入修复——参数化查询替代字符串拼接
    // ClickHouse 支持 {name:Type} 参数化语法
    const safeDeviceCode = deviceCode.replace(/[^a-zA-Z0-9_\-]/g, '');
    const safeFrom = from.replace(/[^0-9\-T:.Z ]/g, '');
    const safeTo = to.replace(/[^0-9\-T:.Z ]/g, '');
    return clickhouseConnector.query(
      `SELECT * FROM ch_telemetry_1s WHERE device_code = '${safeDeviceCode}' AND ts BETWEEN '${safeFrom}' AND '${safeTo}' ORDER BY ts`
    );
  }
  async getGateways() {
    const db = (await getDb())!;
    return db.select().from(schema.edgeGateways);
  }
}
export const telemetryService = new TelemetryService();
