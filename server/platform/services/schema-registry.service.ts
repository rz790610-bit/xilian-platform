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
  // P2-B: 输入校验——表名只允许字母数字下划线
  private validateTableName(tableName: string): void {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(tableName)) {
      throw new Error(`Invalid table name: ${tableName}`);
    }
  }

  async getTableSchema(tableName: string): Promise<ColumnSchema[]> {
    this.validateTableName(tableName);
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
