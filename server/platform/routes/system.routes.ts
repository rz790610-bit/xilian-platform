import { router, publicProcedure } from "../../core/trpc";
import { schemaRegistry } from "../services/schema-registry.service";
import { mysqlConnector } from "../connectors/mysql.connector";
import { clickhouseConnector } from "../connectors/clickhouse.connector";
import { redisConnector } from "../connectors/redis.connector";
import { z } from "zod";

export const systemRoutes = router({
  healthCheck: publicProcedure.query(async () => {
    const [mysql, ch, redis] = await Promise.all([mysqlConnector.healthCheck(), clickhouseConnector.healthCheck(), redisConnector.healthCheck()]);
    return { mysql, clickhouse: ch, redis, timestamp: new Date().toISOString() };
  }),
  listTables: publicProcedure.query(() => schemaRegistry.listTables()),
  tableSchema: publicProcedure.input(z.object({ tableName: z.string() })).query(({ input }) => schemaRegistry.getTableSchema(input.tableName)),
  tableCount: publicProcedure.query(() => schemaRegistry.getTableCount()),
});
