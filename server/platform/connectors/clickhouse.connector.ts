export class ClickHouseConnector {
  private static instance: ClickHouseConnector;
  private baseUrl: string;
  constructor() { this.baseUrl = process.env.CLICKHOUSE_URL || "http://localhost:8123"; }
  static getInstance(): ClickHouseConnector {
    if (!this.instance) this.instance = new ClickHouseConnector();
    return this.instance;
  }
  async query(sql: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/?query=${encodeURIComponent(sql)}`, {
      method: "GET", headers: { "X-ClickHouse-Format": "JSONEachRow" },
    });
    if (!res.ok) throw new Error(`ClickHouse error: ${res.statusText}`);
    const text = await res.text();
    return text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  }
  async healthCheck() {
    try { await this.query("SELECT 1"); return { status: "healthy" }; }
    catch { return { status: "unhealthy" }; }
  }
}
export const clickhouseConnector = ClickHouseConnector.getInstance();
