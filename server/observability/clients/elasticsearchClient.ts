/**
 * Elasticsearch 真实客户端
 * 连接 Elasticsearch REST API 进行日志查询和分析
 */

import http from 'http';
import https from 'https';

// 配置
const ES_CONFIG = {
  host: process.env.ELASTICSEARCH_HOST || 'localhost',
  port: parseInt(process.env.ELASTICSEARCH_PORT || '9200'),
  protocol: process.env.ELASTICSEARCH_PROTOCOL || 'http',
  username: process.env.ELASTICSEARCH_USERNAME,
  password: process.env.ELASTICSEARCH_PASSWORD,
  timeout: 30000,
};

// ============================================================
// 类型定义
// ============================================================

export interface ESSearchResult<T = Record<string, unknown>> {
  took: number;
  timed_out: boolean;
  _shards: {
    total: number;
    successful: number;
    skipped: number;
    failed: number;
  };
  hits: {
    total: { value: number; relation: 'eq' | 'gte' };
    max_score: number | null;
    hits: Array<{
      _index: string;
      _id: string;
      _score: number | null;
      _source: T;
      highlight?: Record<string, string[]>;
    }>;
  };
  aggregations?: Record<string, unknown>;
}

export interface ESClusterHealth {
  cluster_name: string;
  status: 'green' | 'yellow' | 'red';
  timed_out: boolean;
  number_of_nodes: number;
  number_of_data_nodes: number;
  active_primary_shards: number;
  active_shards: number;
  relocating_shards: number;
  initializing_shards: number;
  unassigned_shards: number;
  delayed_unassigned_shards: number;
  number_of_pending_tasks: number;
  number_of_in_flight_fetch: number;
  task_max_waiting_in_queue_millis: number;
  active_shards_percent_as_number: number;
}

export interface ESNodeStats {
  name: string;
  transport_address: string;
  host: string;
  ip: string;
  roles: string[];
  os: {
    cpu: { percent: number };
    mem: {
      total_in_bytes: number;
      free_in_bytes: number;
      used_in_bytes: number;
      free_percent: number;
      used_percent: number;
    };
  };
  jvm: {
    mem: {
      heap_used_in_bytes: number;
      heap_max_in_bytes: number;
      heap_used_percent: number;
    };
  };
  fs: {
    total: {
      total_in_bytes: number;
      free_in_bytes: number;
      available_in_bytes: number;
    };
  };
}

export interface ESIndexStats {
  index: string;
  health: 'green' | 'yellow' | 'red';
  status: 'open' | 'close';
  pri: number;
  rep: number;
  docs_count: number;
  docs_deleted: number;
  store_size: string;
  pri_store_size: string;
}

export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  service?: string;
  host?: string;
  traceId?: string;
  spanId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================
// HTTP 请求工具
// ============================================================

async function esRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // 添加认证
    if (ES_CONFIG.username && ES_CONFIG.password) {
      const auth = Buffer.from(`${ES_CONFIG.username}:${ES_CONFIG.password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const options: http.RequestOptions = {
      hostname: ES_CONFIG.host,
      port: ES_CONFIG.port,
      path,
      method,
      timeout: ES_CONFIG.timeout,
      headers,
    };

    const protocol = ES_CONFIG.protocol === 'https' ? https : http;
    
    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`ES error: ${parsed.error?.reason || data}`));
          } else {
            resolve(parsed);
          }
        } catch (error) {
          reject(new Error(`Failed to parse ES response: ${error}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`ES request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('ES request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

// ============================================================
// Elasticsearch 客户端类
// ============================================================

export class ElasticsearchClient {
  private static instance: ElasticsearchClient;

  private constructor() {
    console.log('[Elasticsearch] Client initialized');
  }

  static getInstance(): ElasticsearchClient {
    if (!ElasticsearchClient.instance) {
      ElasticsearchClient.instance = new ElasticsearchClient();
    }
    return ElasticsearchClient.instance;
  }

  /**
   * 检查连接状态
   */
  async checkConnection(): Promise<boolean> {
    try {
      await esRequest<{ cluster_name: string }>('GET', '/');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取集群信息
   */
  async getClusterInfo(): Promise<{
    name: string;
    cluster_name: string;
    cluster_uuid: string;
    version: {
      number: string;
      build_flavor: string;
      build_type: string;
      build_date: string;
      lucene_version: string;
    };
  } | null> {
    try {
      return await esRequest('GET', '/');
    } catch {
      return null;
    }
  }

  /**
   * 获取集群健康状态
   */
  async getClusterHealth(): Promise<ESClusterHealth | null> {
    try {
      return await esRequest<ESClusterHealth>('GET', '/_cluster/health');
    } catch {
      return null;
    }
  }

  /**
   * 获取节点统计信息
   */
  async getNodeStats(): Promise<ESNodeStats[]> {
    try {
      const result = await esRequest<{
        nodes: Record<string, ESNodeStats>;
      }>('GET', '/_nodes/stats/os,jvm,fs');
      
      return Object.values(result.nodes);
    } catch {
      return [];
    }
  }

  /**
   * 获取索引列表
   */
  async getIndices(pattern?: string): Promise<ESIndexStats[]> {
    try {
      const path = pattern ? `/_cat/indices/${pattern}?format=json` : '/_cat/indices?format=json';
      return await esRequest<ESIndexStats[]>('GET', path);
    } catch {
      return [];
    }
  }

  /**
   * 搜索日志
   */
  async searchLogs(options: {
    index?: string;
    query?: string;
    level?: string;
    service?: string;
    from?: Date;
    to?: Date;
    size?: number;
    from_offset?: number;
  }): Promise<ESSearchResult<LogEntry>> {
    const index = options.index || 'logs-*';
    const must: unknown[] = [];
    const filter: unknown[] = [];

    // 全文搜索
    if (options.query) {
      must.push({
        query_string: {
          query: options.query,
          default_field: 'message',
        },
      });
    }

    // 日志级别过滤
    if (options.level) {
      filter.push({ term: { level: options.level } });
    }

    // 服务过滤
    if (options.service) {
      filter.push({ term: { service: options.service } });
    }

    // 时间范围
    if (options.from || options.to) {
      const range: Record<string, string> = {};
      if (options.from) range.gte = options.from.toISOString();
      if (options.to) range.lte = options.to.toISOString();
      filter.push({ range: { '@timestamp': range } });
    }

    const body = {
      query: {
        bool: {
          must: must.length > 0 ? must : [{ match_all: {} }],
          filter,
        },
      },
      sort: [{ '@timestamp': { order: 'desc' } }],
      size: options.size || 100,
      from: options.from_offset || 0,
    };

    try {
      return await esRequest<ESSearchResult<LogEntry>>('POST', `/${index}/_search`, body);
    } catch {
      return {
        took: 0,
        timed_out: false,
        _shards: { total: 0, successful: 0, skipped: 0, failed: 0 },
        hits: { total: { value: 0, relation: 'eq' }, max_score: null, hits: [] },
      };
    }
  }

  /**
   * 获取日志级别统计
   */
  async getLogLevelStats(options: {
    index?: string;
    from?: Date;
    to?: Date;
  }): Promise<Record<string, number>> {
    const index = options.index || 'logs-*';
    const filter: unknown[] = [];

    if (options.from || options.to) {
      const range: Record<string, string> = {};
      if (options.from) range.gte = options.from.toISOString();
      if (options.to) range.lte = options.to.toISOString();
      filter.push({ range: { '@timestamp': range } });
    }

    const body = {
      size: 0,
      query: filter.length > 0 ? { bool: { filter } } : { match_all: {} },
      aggs: {
        levels: {
          terms: { field: 'level', size: 10 },
        },
      },
    };

    try {
      const result = await esRequest<{
        aggregations: {
          levels: {
            buckets: Array<{ key: string; doc_count: number }>;
          };
        };
      }>('POST', `/${index}/_search`, body);

      const stats: Record<string, number> = {};
      for (const bucket of result.aggregations.levels.buckets) {
        stats[bucket.key] = bucket.doc_count;
      }
      return stats;
    } catch {
      return {};
    }
  }

  /**
   * 获取服务日志统计
   */
  async getServiceStats(options: {
    index?: string;
    from?: Date;
    to?: Date;
  }): Promise<Array<{ service: string; count: number; errorRate: number }>> {
    const index = options.index || 'logs-*';
    const filter: unknown[] = [];

    if (options.from || options.to) {
      const range: Record<string, string> = {};
      if (options.from) range.gte = options.from.toISOString();
      if (options.to) range.lte = options.to.toISOString();
      filter.push({ range: { '@timestamp': range } });
    }

    const body = {
      size: 0,
      query: filter.length > 0 ? { bool: { filter } } : { match_all: {} },
      aggs: {
        services: {
          terms: { field: 'service', size: 50 },
          aggs: {
            errors: {
              filter: { terms: { level: ['error', 'fatal'] } },
            },
          },
        },
      },
    };

    try {
      const result = await esRequest<{
        aggregations: {
          services: {
            buckets: Array<{
              key: string;
              doc_count: number;
              errors: { doc_count: number };
            }>;
          };
        };
      }>('POST', `/${index}/_search`, body);

      return result.aggregations.services.buckets.map((bucket) => ({
        service: bucket.key,
        count: bucket.doc_count,
        errorRate: bucket.doc_count > 0 
          ? (bucket.errors.doc_count / bucket.doc_count) * 100 
          : 0,
      }));
    } catch {
      return [];
    }
  }

  /**
   * 获取日志趋势
   */
  async getLogTrend(options: {
    index?: string;
    from?: Date;
    to?: Date;
    interval?: string;
  }): Promise<Array<{ timestamp: Date; count: number; errors: number }>> {
    const index = options.index || 'logs-*';
    const interval = options.interval || '1h';
    const filter: unknown[] = [];

    if (options.from || options.to) {
      const range: Record<string, string> = {};
      if (options.from) range.gte = options.from.toISOString();
      if (options.to) range.lte = options.to.toISOString();
      filter.push({ range: { '@timestamp': range } });
    }

    const body = {
      size: 0,
      query: filter.length > 0 ? { bool: { filter } } : { match_all: {} },
      aggs: {
        timeline: {
          date_histogram: {
            field: '@timestamp',
            fixed_interval: interval,
          },
          aggs: {
            errors: {
              filter: { terms: { level: ['error', 'fatal'] } },
            },
          },
        },
      },
    };

    try {
      const result = await esRequest<{
        aggregations: {
          timeline: {
            buckets: Array<{
              key: number;
              doc_count: number;
              errors: { doc_count: number };
            }>;
          };
        };
      }>('POST', `/${index}/_search`, body);

      return result.aggregations.timeline.buckets.map((bucket) => ({
        timestamp: new Date(bucket.key),
        count: bucket.doc_count,
        errors: bucket.errors.doc_count,
      }));
    } catch {
      return [];
    }
  }
}

// 导出单例
export const elasticsearchClient = ElasticsearchClient.getInstance();
