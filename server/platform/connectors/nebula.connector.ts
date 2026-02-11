export class NebulaConnector {
  private static instance: NebulaConnector;
  private endpoint: string;
  constructor() { this.endpoint = process.env.NEBULA_URL || "http://localhost:9669"; }
  static getInstance(): NebulaConnector {
    if (!this.instance) this.instance = new NebulaConnector();
    return this.instance;
  }
  async executeNGQL(query: string): Promise<any> {
    const r = await fetch(`${this.endpoint}/api/db/exec`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gql: query }),
    });
    return r.json();
  }
  async healthCheck() {
    try { await this.executeNGQL("SHOW SPACES"); return { status: "healthy" }; }
    catch { return { status: "unhealthy" }; }
  }
}
export const nebulaConnector = NebulaConnector.getInstance();
