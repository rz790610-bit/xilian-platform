/**
 * NebulaGraph Connector
 * 
 * P0-S03: 从 config 统一读取配置（不再直接 process.env）
 * P0-S03: 添加 Basic Auth 认证头
 * P2-A01: 统一错误处理和超时
 */
import { config } from '../../core/config';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('nebula-connector');

export class NebulaConnector {
  private static instance: NebulaConnector;

  static getInstance(): NebulaConnector {
    if (!this.instance) this.instance = new NebulaConnector();
    return this.instance;
  }

  private get endpoint(): string {
    return config.nebula.url;
  }

  private get authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.nebula.user && config.nebula.password) {
      const credentials = Buffer.from(`${config.nebula.user}:${config.nebula.password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }
    return headers;
  }

  async executeNGQL(query: string, timeoutMs = 30000): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.endpoint}/api/db/exec`, {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify({ gql: query, space: config.nebula.space }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`NebulaGraph error ${res.status}: ${body || res.statusText}`);
      }
      return res.json();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`NebulaGraph query timeout after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck(): Promise<{ status: string; latency: number }> {
    const start = Date.now();
    try {
      await this.executeNGQL('SHOW SPACES', 5000);
      return { status: 'healthy', latency: Date.now() - start };
    } catch (err: any) {
      log.warn(`NebulaGraph health check failed: ${err.message}`);
      return { status: 'unhealthy', latency: Date.now() - start };
    }
  }
}

export const nebulaConnector = NebulaConnector.getInstance();
