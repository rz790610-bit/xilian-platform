export class QdrantConnector {
  private static instance: QdrantConnector;
  private baseUrl: string;
  constructor() { this.baseUrl = process.env.QDRANT_URL || "http://localhost:6333"; }
  static getInstance(): QdrantConnector {
    if (!this.instance) this.instance = new QdrantConnector();
    return this.instance;
  }
  async search(collection: string, vector: number[], limit = 10): Promise<any[]> {
    const r = await fetch(`${this.baseUrl}/collections/${collection}/points/search`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector, limit }),
    });
    const d = await r.json(); return d.result || [];
  }
  async healthCheck() {
    try { const r = await fetch(`${this.baseUrl}/healthz`); return { status: r.ok ? "healthy" : "unhealthy" }; }
    catch { return { status: "unhealthy" }; }
  }
}
export const qdrantConnector = QdrantConnector.getInstance();
