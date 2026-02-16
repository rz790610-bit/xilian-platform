/**
 * Prometheus 真实客户端
 * 连接 Prometheus HTTP API 获取指标数据
 */

import http from 'http';
import https from 'https';
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('prometheus');

// 配置

const PROMETHEUS_CONFIG = {
  host: process.env.PROMETHEUS_HOST || 'localhost',
  port: parseInt(process.env.PROMETHEUS_PORT || '9090'),
  protocol: process.env.PROMETHEUS_PROTOCOL || 'http',
  timeout: 30000,
};

// ============================================================
// 类型定义
// ============================================================

export interface PrometheusQueryResult {
  status: 'success' | 'error';
  data?: {
    resultType: 'matrix' | 'vector' | 'scalar' | 'string';
    result: PrometheusMetric[];
  };
  error?: string;
  errorType?: string;
}

export interface PrometheusMetric {
  metric: Record<string, string>;
  value?: [number, string]; // [timestamp, value] for vector
  values?: [number, string][]; // for matrix
}

export interface PrometheusTarget {
  discoveredLabels: Record<string, string>;
  labels: Record<string, string>;
  scrapePool: string;
  scrapeUrl: string;
  globalUrl: string;
  lastError: string;
  lastScrape: string;
  lastScrapeDuration: number;
  health: 'up' | 'down' | 'unknown';
}

export interface PrometheusAlertRule {
  id?: string;
  name: string;
  query: string;
  duration: number;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  alerts: PrometheusAlert[];
  health: string;
  type: string;
  enabled?: boolean;
  severity?: string;
}

export interface PrometheusAlert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: 'firing' | 'pending' | 'inactive';
  activeAt: string;
  value: string;
}

// ============================================================
// HTTP 请求工具
// ============================================================

async function prometheusRequest<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const queryString = params
      ? '?' + new URLSearchParams(params).toString()
      : '';
    
    const options = {
      hostname: PROMETHEUS_CONFIG.host,
      port: PROMETHEUS_CONFIG.port,
      path: `/api/v1${path}${queryString}`,
      method: 'GET',
      timeout: PROMETHEUS_CONFIG.timeout,
      headers: {
        'Accept': 'application/json',
      },
    };

    const protocol = PROMETHEUS_CONFIG.protocol === 'https' ? https : http;
    
    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Failed to parse Prometheus response: ${error}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Prometheus request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Prometheus request timeout'));
    });

    req.end();
  });
}

// ============================================================
// Prometheus 客户端类
// ============================================================

export class PrometheusClient {
  private static instance: PrometheusClient;

  private constructor() {
    log.debug('[Prometheus] Client initialized');
  }

  static getInstance(): PrometheusClient {
    if (!PrometheusClient.instance) {
      PrometheusClient.instance = new PrometheusClient();
    }
    return PrometheusClient.instance;
  }

  /**
   * 检查 Prometheus 连接状态
   */
  async checkConnection(): Promise<boolean> {
    try {
      const result = await prometheusRequest<{ status: string }>('/status/buildinfo');
      return result.status === 'success';
    } catch {
      return false;
    }
  }

  /**
   * 获取 Prometheus 版本信息
   */
  async getBuildInfo(): Promise<{
    version: string;
    revision: string;
    branch: string;
    buildDate: string;
    goVersion: string;
  } | null> {
    try {
      const result = await prometheusRequest<{
        status: string;
        data: {
          version: string;
          revision: string;
          branch: string;
          buildDate: string;
          goVersion: string;
        };
      }>('/status/buildinfo');
      
      if (result.status === 'success') {
        return result.data;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 执行即时查询 (PromQL)
   */
  async query(promql: string, time?: Date): Promise<PrometheusQueryResult> {
    const params: Record<string, string> = { query: promql };
    if (time) {
      params.time = (time.getTime() / 1000).toString();
    }
    
    return prometheusRequest<PrometheusQueryResult>('/query', params);
  }

  /**
   * 执行范围查询 (PromQL)
   */
  async queryRange(
    promql: string,
    start: Date,
    end: Date,
    step: string = '15s'
  ): Promise<PrometheusQueryResult> {
    return prometheusRequest<PrometheusQueryResult>('/query_range', {
      query: promql,
      start: (start.getTime() / 1000).toString(),
      end: (end.getTime() / 1000).toString(),
      step,
    });
  }

  /**
   * 获取所有指标名称
   */
  async getMetricNames(): Promise<string[]> {
    try {
      const result = await prometheusRequest<{
        status: string;
        data: string[];
      }>('/label/__name__/values');
      
      if (result.status === 'success') {
        return result.data;
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * 获取标签值
   */
  async getLabelValues(labelName: string): Promise<string[]> {
    try {
      const result = await prometheusRequest<{
        status: string;
        data: string[];
      }>(`/label/${labelName}/values`);
      
      if (result.status === 'success') {
        return result.data;
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * 获取所有抓取目标
   */
  async getTargets(): Promise<{
    activeTargets: PrometheusTarget[];
    droppedTargets: PrometheusTarget[];
  }> {
    try {
      const result = await prometheusRequest<{
        status: string;
        data: {
          activeTargets: PrometheusTarget[];
          droppedTargets: PrometheusTarget[];
        };
      }>('/targets');
      
      if (result.status === 'success') {
        return result.data;
      }
      return { activeTargets: [], droppedTargets: [] };
    } catch {
      return { activeTargets: [], droppedTargets: [] };
    }
  }

  /**
   * 获取告警规则
   */
  async getAlertRules(): Promise<PrometheusAlertRule[]> {
    try {
      const result = await prometheusRequest<{
        status: string;
        data: {
          groups: Array<{
            name: string;
            rules: PrometheusAlertRule[];
          }>;
        };
      }>('/rules');
      
      if (result.status === 'success') {
        return result.data.groups.flatMap(g => g.rules);
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * 获取当前触发的告警
   */
  async getAlerts(): Promise<PrometheusAlert[]> {
    try {
      const result = await prometheusRequest<{
        status: string;
        data: {
          alerts: PrometheusAlert[];
        };
      }>('/alerts');
      
      if (result.status === 'success') {
        return result.data.alerts;
      }
      return [];
    } catch {
      return [];
    }
  }

  // ============================================================
  // 常用指标查询
  // ============================================================

  /**
   * 获取 CPU 使用率
   */
  async getCpuUsage(instance?: string): Promise<number | null> {
    const query = instance
      ? `100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle",instance="${instance}"}[5m])) * 100)`
      : `100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`;
    
    const result = await this.query(query);
    if (result.status === 'success' && result.data?.result[0]?.value) {
      return parseFloat(result.data.result[0].value[1]);
    }
    return null;
  }

  /**
   * 获取内存使用率
   */
  async getMemoryUsage(instance?: string): Promise<number | null> {
    const query = instance
      ? `(1 - (node_memory_MemAvailable_bytes{instance="${instance}"} / node_memory_MemTotal_bytes{instance="${instance}"})) * 100`
      : `(1 - (avg(node_memory_MemAvailable_bytes) / avg(node_memory_MemTotal_bytes))) * 100`;
    
    const result = await this.query(query);
    if (result.status === 'success' && result.data?.result[0]?.value) {
      return parseFloat(result.data.result[0].value[1]);
    }
    return null;
  }

  /**
   * 获取磁盘使用率
   */
  async getDiskUsage(instance?: string, mountpoint: string = '/'): Promise<number | null> {
    const query = instance
      ? `(1 - (node_filesystem_avail_bytes{instance="${instance}",mountpoint="${mountpoint}"} / node_filesystem_size_bytes{instance="${instance}",mountpoint="${mountpoint}"})) * 100`
      : `avg((1 - (node_filesystem_avail_bytes{mountpoint="${mountpoint}"} / node_filesystem_size_bytes{mountpoint="${mountpoint}"})) * 100)`;
    
    const result = await this.query(query);
    if (result.status === 'success' && result.data?.result[0]?.value) {
      return parseFloat(result.data.result[0].value[1]);
    }
    return null;
  }

  /**
   * 获取 HTTP 请求速率
   */
  async getHttpRequestRate(job?: string): Promise<number | null> {
    const query = job
      ? `sum(rate(http_requests_total{job="${job}"}[5m]))`
      : `sum(rate(http_requests_total[5m]))`;
    
    const result = await this.query(query);
    if (result.status === 'success' && result.data?.result[0]?.value) {
      return parseFloat(result.data.result[0].value[1]);
    }
    return null;
  }

  /**
   * 获取 HTTP 错误率
   */
  async getHttpErrorRate(job?: string): Promise<number | null> {
    const query = job
      ? `sum(rate(http_requests_total{job="${job}",status=~"5.."}[5m])) / sum(rate(http_requests_total{job="${job}"}[5m])) * 100`
      : `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100`;
    
    const result = await this.query(query);
    if (result.status === 'success' && result.data?.result[0]?.value) {
      const value = parseFloat(result.data.result[0].value[1]);
      return isNaN(value) ? 0 : value;
    }
    return null;
  }

  /**
   * 获取请求延迟百分位数
   */
  async getRequestLatencyP99(job?: string): Promise<number | null> {
    const query = job
      ? `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{job="${job}"}[5m])) by (le))`
      : `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))`;
    
    const result = await this.query(query);
    if (result.status === 'success' && result.data?.result[0]?.value) {
      return parseFloat(result.data.result[0].value[1]) * 1000; // 转换为毫秒
    }
    return null;
  }
}

// 导出单例
export const prometheusClient = PrometheusClient.getInstance();
