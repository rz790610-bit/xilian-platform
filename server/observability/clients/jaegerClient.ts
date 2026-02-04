/**
 * Jaeger 真实客户端
 * 连接 Jaeger Query API 进行分布式追踪查询
 */

import http from 'http';
import https from 'https';

// 配置
const JAEGER_CONFIG = {
  host: process.env.JAEGER_HOST || 'localhost',
  port: parseInt(process.env.JAEGER_PORT || '16686'),
  protocol: process.env.JAEGER_PROTOCOL || 'http',
  timeout: 30000,
};

// ============================================================
// 类型定义
// ============================================================

export interface JaegerService {
  name: string;
  operations: string[];
}

export interface JaegerSpan {
  traceID: string;
  spanID: string;
  operationName: string;
  references: Array<{
    refType: 'CHILD_OF' | 'FOLLOWS_FROM';
    traceID: string;
    spanID: string;
  }>;
  startTime: number; // microseconds
  duration: number; // microseconds
  tags: Array<{ key: string; type: string; value: unknown }>;
  logs: Array<{
    timestamp: number;
    fields: Array<{ key: string; type: string; value: unknown }>;
  }>;
  processID: string;
  warnings: string[] | null;
}

export interface JaegerProcess {
  serviceName: string;
  tags: Array<{ key: string; type: string; value: unknown }>;
}

export interface JaegerTrace {
  traceID: string;
  spans: JaegerSpan[];
  processes: Record<string, JaegerProcess>;
  warnings: string[] | null;
}

export interface JaegerDependency {
  parent: string;
  child: string;
  callCount: number;
  // 别名以兼容前端
  source?: string;
  target?: string;
}

// ============================================================
// HTTP 请求工具
// ============================================================

async function jaegerRequest<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: JAEGER_CONFIG.host,
      port: JAEGER_CONFIG.port,
      path: `/api${path}`,
      method: 'GET',
      timeout: JAEGER_CONFIG.timeout,
      headers: {
        'Accept': 'application/json',
      },
    };

    const protocol = JAEGER_CONFIG.protocol === 'https' ? https : http;
    
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
          reject(new Error(`Failed to parse Jaeger response: ${error}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Jaeger request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Jaeger request timeout'));
    });

    req.end();
  });
}

// ============================================================
// Jaeger 客户端类
// ============================================================

export class JaegerClient {
  private static instance: JaegerClient;

  private constructor() {
    console.log('[Jaeger] Client initialized');
  }

  static getInstance(): JaegerClient {
    if (!JaegerClient.instance) {
      JaegerClient.instance = new JaegerClient();
    }
    return JaegerClient.instance;
  }

  /**
   * 检查连接状态
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.getServices();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取所有服务列表
   */
  async getServices(): Promise<string[]> {
    try {
      const result = await jaegerRequest<{ data: string[] }>('/services');
      return result.data || [];
    } catch {
      return [];
    }
  }

  /**
   * 获取服务的操作列表
   */
  async getOperations(service: string): Promise<string[]> {
    try {
      const result = await jaegerRequest<{ data: string[] }>(
        `/services/${encodeURIComponent(service)}/operations`
      );
      return result.data || [];
    } catch {
      return [];
    }
  }

  /**
   * 搜索追踪
   */
  async searchTraces(options: {
    service: string;
    operation?: string;
    tags?: Record<string, string>;
    minDuration?: string;
    maxDuration?: string;
    start?: Date;
    end?: Date;
    limit?: number;
  }): Promise<JaegerTrace[]> {
    const params = new URLSearchParams();
    params.set('service', options.service);
    
    if (options.operation) {
      params.set('operation', options.operation);
    }
    if (options.tags) {
      const tagStr = Object.entries(options.tags)
        .map(([k, v]) => `${k}:${v}`)
        .join(' ');
      params.set('tags', tagStr);
    }
    if (options.minDuration) {
      params.set('minDuration', options.minDuration);
    }
    if (options.maxDuration) {
      params.set('maxDuration', options.maxDuration);
    }
    if (options.start) {
      params.set('start', (options.start.getTime() * 1000).toString());
    }
    if (options.end) {
      params.set('end', (options.end.getTime() * 1000).toString());
    }
    params.set('limit', (options.limit || 20).toString());

    try {
      const result = await jaegerRequest<{ data: JaegerTrace[] }>(
        `/traces?${params.toString()}`
      );
      return result.data || [];
    } catch {
      return [];
    }
  }

  /**
   * 获取单个追踪详情
   */
  async getTrace(traceId: string): Promise<JaegerTrace | null> {
    try {
      const result = await jaegerRequest<{ data: JaegerTrace[] }>(
        `/traces/${traceId}`
      );
      return result.data?.[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * 获取服务依赖关系
   */
  async getDependencies(options?: {
    endTs?: Date;
    lookback?: number; // milliseconds
  }): Promise<JaegerDependency[]> {
    const params = new URLSearchParams();
    
    if (options?.endTs) {
      params.set('endTs', options.endTs.getTime().toString());
    } else {
      params.set('endTs', Date.now().toString());
    }
    
    if (options?.lookback) {
      params.set('lookback', options.lookback.toString());
    } else {
      params.set('lookback', (24 * 60 * 60 * 1000).toString()); // 24 hours
    }

    try {
      const result = await jaegerRequest<{ data: JaegerDependency[] }>(
        `/dependencies?${params.toString()}`
      );
      return result.data || [];
    } catch {
      return [];
    }
  }

  // ============================================================
  // 高级分析方法
  // ============================================================

  /**
   * 获取服务延迟统计
   */
  async getServiceLatencyStats(
    service: string,
    operation?: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<{
    count: number;
    avgDurationMs: number;
    minDurationMs: number;
    maxDurationMs: number;
    p50DurationMs: number;
    p95DurationMs: number;
    p99DurationMs: number;
    errorRate: number;
  }> {
    const traces = await this.searchTraces({
      service,
      operation,
      start: timeRange?.start,
      end: timeRange?.end,
      limit: 1000,
    });

    if (traces.length === 0) {
      return {
        count: 0,
        avgDurationMs: 0,
        minDurationMs: 0,
        maxDurationMs: 0,
        p50DurationMs: 0,
        p95DurationMs: 0,
        p99DurationMs: 0,
        errorRate: 0,
      };
    }

    // 提取根 span 的延迟
    const durations: number[] = [];
    let errorCount = 0;

    for (const trace of traces) {
      // 找到根 span
      const rootSpan = trace.spans.find(
        (s) => s.references.length === 0 || 
               !trace.spans.some((other) => 
                 s.references.some((ref) => ref.spanID === other.spanID)
               )
      );
      
      if (rootSpan) {
        durations.push(rootSpan.duration / 1000); // 转换为毫秒
        
        // 检查是否有错误标签
        const hasError = rootSpan.tags.some(
          (t) => t.key === 'error' && t.value === true
        );
        if (hasError) errorCount++;
      }
    }

    // 排序用于计算百分位数
    durations.sort((a, b) => a - b);

    const percentile = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0;
      const index = Math.ceil((p / 100) * arr.length) - 1;
      return arr[Math.max(0, index)];
    };

    const sum = durations.reduce((a, b) => a + b, 0);

    return {
      count: durations.length,
      avgDurationMs: durations.length > 0 ? sum / durations.length : 0,
      minDurationMs: durations[0] || 0,
      maxDurationMs: durations[durations.length - 1] || 0,
      p50DurationMs: percentile(durations, 50),
      p95DurationMs: percentile(durations, 95),
      p99DurationMs: percentile(durations, 99),
      errorRate: durations.length > 0 ? (errorCount / durations.length) * 100 : 0,
    };
  }

  /**
   * 获取服务拓扑图
   */
  async getServiceTopology(): Promise<{
    nodes: Array<{ id: string; name: string; type: 'service' }>;
    edges: Array<{ source: string; target: string; callCount: number }>;
  }> {
    const dependencies = await this.getDependencies();
    
    const nodeSet = new Set<string>();
    const edges: Array<{ source: string; target: string; callCount: number }> = [];

    for (const dep of dependencies) {
      nodeSet.add(dep.parent);
      nodeSet.add(dep.child);
      edges.push({
        source: dep.parent,
        target: dep.child,
        callCount: dep.callCount,
      });
    }

    const nodes = Array.from(nodeSet).map((name) => ({
      id: name,
      name,
      type: 'service' as const,
    }));

    return { nodes, edges };
  }

  /**
   * 分析追踪中的错误
   */
  async analyzeErrors(
    service: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<Array<{
    operation: string;
    errorCount: number;
    lastError: string;
    lastOccurrence: Date;
  }>> {
    const traces = await this.searchTraces({
      service,
      tags: { error: 'true' },
      start: timeRange?.start,
      end: timeRange?.end,
      limit: 500,
    });

    const errorMap = new Map<string, {
      count: number;
      lastError: string;
      lastTime: number;
    }>();

    for (const trace of traces) {
      for (const span of trace.spans) {
        const hasError = span.tags.some(
          (t) => t.key === 'error' && t.value === true
        );
        
        if (hasError) {
          const existing = errorMap.get(span.operationName);
          const errorMsg = span.logs
            .flatMap((l) => l.fields)
            .find((f) => f.key === 'message')?.value as string || 'Unknown error';
          
          if (!existing || span.startTime > existing.lastTime) {
            errorMap.set(span.operationName, {
              count: (existing?.count || 0) + 1,
              lastError: errorMsg,
              lastTime: span.startTime,
            });
          } else {
            existing.count++;
          }
        }
      }
    }

    return Array.from(errorMap.entries()).map(([operation, data]) => ({
      operation,
      errorCount: data.count,
      lastError: data.lastError,
      lastOccurrence: new Date(data.lastTime / 1000),
    }));
  }
}

// 导出单例
export const jaegerClient = JaegerClient.getInstance();
