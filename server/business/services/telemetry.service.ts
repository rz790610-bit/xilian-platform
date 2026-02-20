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
    // P0-10: SQL 注入修复——使用 ClickHouse 原生参数化查询语法 {name:Type}
    // ClickHouse HTTP 接口支持通过 URL params 传递参数：param_name=value
    // 这里使用严格的白名单校验 + 参数化查询双重防护
    const safeDeviceCode = deviceCode.replace(/[^a-zA-Z0-9_\-]/g, '');
    const safeFrom = from.replace(/[^0-9\-T:.Z ]/g, '');
    const safeTo = to.replace(/[^0-9\-T:.Z ]/g, '');
    if (!safeDeviceCode || !safeFrom || !safeTo) {
      throw new Error('Invalid query parameters: deviceCode, from, and to are required');
    }
    // 使用 ClickHouse 参数化查询——参数通过 query_params 传递，不拼接到 SQL 中
    return clickhouseConnector.queryWithParams(
      `SELECT * FROM ch_telemetry_1s WHERE device_code = {deviceCode:String} AND ts BETWEEN {fromTs:String} AND {toTs:String} ORDER BY ts`,
      { deviceCode: safeDeviceCode, fromTs: safeFrom, toTs: safeTo }
    );
  }
  async getGateways() {
    const db = (await getDb())!;
    return db.select().from(schema.edgeGateways);
  }
}
export const telemetryService = new TelemetryService();
