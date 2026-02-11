export class MinIOConnector {
  private static instance: MinIOConnector;
  private endpoint: string;
  constructor() { this.endpoint = process.env.MINIO_ENDPOINT || "http://localhost:9000"; }
  static getInstance(): MinIOConnector {
    if (!this.instance) this.instance = new MinIOConnector();
    return this.instance;
  }
  getEndpoint() { return this.endpoint; }
  async healthCheck() {
    try { const r = await fetch(`${this.endpoint}/minio/health/live`); return { status: r.ok ? "healthy" : "unhealthy" }; }
    catch { return { status: "unhealthy" }; }
  }
}
export const minioConnector = MinIOConnector.getInstance();
