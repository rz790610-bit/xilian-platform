import { router, publicProcedure } from "../../core/trpc";
import { telemetryService } from "../services/telemetry.service";
import { clickhouseClient } from "../../lib/clients/clickhouse.client";
import { getDb } from "../../lib/db";
import * as schema from "../../../drizzle/schema";
import { desc, count, eq } from "drizzle-orm";
import { z } from "zod";

// ============ ClickHouse 监控仪表盘 ============
const clickhouseDashboardRouter = router({
  overview: publicProcedure.query(async () => {
    const connected = await clickhouseClient.checkConnection();
    const rawStats = connected ? await clickhouseClient.getDatabaseStats() : null;
    // 将 Date 对象转为字符串，避免前端序列化问题
    const stats = rawStats ? {
      totalTables: rawStats.totalTables,
      totalRows: rawStats.totalRows,
      diskUsage: rawStats.diskUsage,
      oldestData: rawStats.oldestData?.toISOString() ?? null,
      newestData: rawStats.newestData?.toISOString() ?? null,
    } : null;
    return { connected, stats };
  }),
  tables: publicProcedure.query(async () => {
    try {
      const stats = await clickhouseClient.getDatabaseStats();
      return stats;
    } catch (e) {
      return { error: "ClickHouse not available", tables: [] };
    }
  }),
  recentQueries: publicProcedure
    .input(z.object({ limit: z.number().default(20) }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      // 从审计日志中获取最近的ClickHouse相关查询
      const rows = await db.select().from(schema.auditLogs)
        .where(eq(schema.auditLogs.resourceType, "clickhouse"))
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(input?.limit || 20);
      return rows;
    }),
  capacityMetrics: publicProcedure.query(async () => {
    const db = (await getDb())!;
    return db.select().from(schema.systemCapacityMetrics).orderBy(desc(schema.systemCapacityMetrics.createdAt)).limit(50);
  }),
  dataQuality: publicProcedure
    .input(z.object({ limit: z.number().default(20) }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(schema.dataQualityReports).orderBy(desc(schema.dataQualityReports.reportDate)).limit(input?.limit || 20);
    }),
});

export const monitoringRoutes = router({
  gateways: publicProcedure.query(() => telemetryService.getGateways()),
  latest: publicProcedure.input(z.object({ deviceCode: z.string() })).query(({ input }) => telemetryService.getLatest(input.deviceCode)),
  history: publicProcedure.input(z.object({ deviceCode: z.string(), from: z.string(), to: z.string() })).query(({ input }) => telemetryService.getHistory(input.deviceCode, input.from, input.to)),
  clickhouseDashboard: clickhouseDashboardRouter,
});
