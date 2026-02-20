/**
 * ClickHouse Connector
 * 
 * P0-S03: 从 config 统一读取配置（不再直接 process.env）
 * P0-S03: 添加 Basic Auth 认证头
 * P2-A01: 统一错误处理和超时
 */
import { config } from '../../core/config';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('clickhouse-connector');

export class ClickHouseConnector {
  private static instance: ClickHouseConnector;

  static getInstance(): ClickHouseConnector {
    if (!this.instance) this.instance = new ClickHouseConnector();
    return this.instance;
  }

  private get baseUrl(): string {
    return config.clickhouse.url;
  }

  private get authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'X-ClickHouse-Format': 'JSONEachRow',
    };
    if (config.clickhouse.user) {
      headers['X-ClickHouse-User'] = config.clickhouse.user;
    }
    if (config.clickhouse.password) {
      headers['X-ClickHouse-Key'] = config.clickhouse.password;
    }
    return headers;
  }

  async query(sql: string, timeoutMs = 30000): Promise<any[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // P1-R4-1: 改用 POST 请求，SQL 放请求体，避免 URL 长度限制和日志泄露
      const res = await fetch(`${this.baseUrl}/`, {
        method: 'POST',
        headers: { ...this.authHeaders, 'Content-Type': 'text/plain' },
        body: sql + ' FORMAT JSONEachRow',
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`ClickHouse error ${res.status}: ${body || res.statusText}`);
      }
      const text = await res.text();
      return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`ClickHouse query timeout after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck(): Promise<{ status: string; latency: number }> {
    const start = Date.now();
    try {
      await this.query('SELECT 1', 5000);
      return { status: 'healthy', latency: Date.now() - start };
    } catch (err: any) {
      log.warn(`ClickHouse health check failed: ${err.message}`);
      return { status: 'unhealthy', latency: Date.now() - start };
    }
  }
}

export const clickhouseConnector = ClickHouseConnector.getInstance();
