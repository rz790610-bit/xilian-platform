import { getDb } from "../../lib/db";
import { sql } from "drizzle-orm";

export class SchemaRegistryService {
  async getTableSchema(tableName: string) {
    const db = (await getDb())!;
    const result = await db.execute(sql`SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${tableName} ORDER BY ORDINAL_POSITION`);
    return result[0] as unknown as any[];
  }
  async listTables() {
    const db = (await getDb())!;
    const result = await db.execute(sql`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`);
    return (result[0] as unknown as any[]).map(r => r.TABLE_NAME);
  }
  async getTableCount() {
    const db = (await getDb())!;
    const result = await db.execute(sql`SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`);
    return (result[0] as unknown as any[])[0]?.cnt || 0;
  }
}
export const schemaRegistry = new SchemaRegistryService();
