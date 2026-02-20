/**
 * Qdrant Vector DB Connector
 * 
 * P0-S03: 从 config 统一读取配置（不再直接 process.env）
 * P0-S03: 添加 API Key 认证头
 * P2-A01: 统一错误处理和超时
 */
import { config } from '../../core/config';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('qdrant-connector');

export class QdrantConnector {
  private static instance: QdrantConnector;

  static getInstance(): QdrantConnector {
    if (!this.instance) this.instance = new QdrantConnector();
    return this.instance;
  }

  private get baseUrl(): string {
    return config.qdrant.url;
  }

  private get authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.qdrant.apiKey) {
      headers['api-key'] = config.qdrant.apiKey;
    }
    return headers;
  }

  async search(collection: string, vector: number[], limit = 10, timeoutMs = 15000): Promise<any[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/collections/${encodeURIComponent(collection)}/points/search`, {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify({ vector, limit }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Qdrant error ${res.status}: ${body || res.statusText}`);
      }
      const data = await res.json();
      return data.result || [];
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Qdrant search timeout after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck(): Promise<{ status: string; latency: number }> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${this.baseUrl}/healthz`, {
        headers: this.authHeaders,
        signal: controller.signal,
      });
      clearTimeout(timer);
      return { status: res.ok ? 'healthy' : 'unhealthy', latency: Date.now() - start };
    } catch (err: any) {
      log.warn(`Qdrant health check failed: ${err.message}`);
      return { status: 'unhealthy', latency: Date.now() - start };
    }
  }
}

export const qdrantConnector = QdrantConnector.getInstance();
