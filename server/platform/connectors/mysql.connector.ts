import { getDb } from "../../lib/db";
export class MySQLConnector {
  private static instance: MySQLConnector;
  static getInstance(): MySQLConnector {
    if (!this.instance) this.instance = new MySQLConnector();
    return this.instance;
  }
  async getConnection() {
    const db = (await getDb())!;
    return db;
  }
  async healthCheck(): Promise<{ status: string; latency: number }> {
    const db = (await getDb())!;
    const start = Date.now();
    try {
      await db.execute("SELECT 1" as any);
      return { status: "healthy", latency: Date.now() - start };
    } catch (e) {
      return { status: "unhealthy", latency: Date.now() - start };
    }
  }
}
export const mysqlConnector = MySQLConnector.getInstance();
