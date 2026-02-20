import { getDb } from "../../lib/db";
import { sql } from "drizzle-orm";

// P2-A06: 消除 any，定义具体返回类型
interface ColumnSchema {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_KEY: string;
  COLUMN_COMMENT: string;
}

interface TableRow {
  TABLE_NAME: string;
}

interface CountRow {
  cnt: number;
}

export class SchemaRegistryService {
  async getTableSchema(tableName: string): Promise<ColumnSchema[]> {
    const db = (await getDb())!;
    const result = await db.execute(sql`SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${tableName} ORDER BY ORDINAL_POSITION`);
    return result[0] as unknown as ColumnSchema[];
  }

  async listTables(): Promise<string[]> {
    const db = (await getDb())!;
    const result = await db.execute(sql`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`);
    return (result[0] as unknown as TableRow[]).map(r => r.TABLE_NAME);
  }

  async getTableCount(): Promise<number> {
    const db = (await getDb())!;
    const result = await db.execute(sql`SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`);
    return (result[0] as unknown as CountRow[])[0]?.cnt || 0;
  }
}
export const schemaRegistry = new SchemaRegistryService();
