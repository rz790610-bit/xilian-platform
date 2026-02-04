/**
 * 数据库查询优化器
 * 提供查询计划分析、索引建议、查询重写等功能
 */

import { sql } from 'drizzle-orm';
import { getDb } from '../db';

// 查询统计
interface QueryStats {
  query: string;
  executionCount: number;
  totalTime: number;
  avgTime: number;
  maxTime: number;
  minTime: number;
  lastExecuted: number;
}

// 索引建议
interface IndexSuggestion {
  table: string;
  columns: string[];
  type: 'btree' | 'hash' | 'fulltext';
  reason: string;
  estimatedImprovement: number;
}

// 查询计划
interface QueryPlan {
  id: number;
  selectType: string;
  table: string;
  type: string;
  possibleKeys: string | null;
  key: string | null;
  keyLen: string | null;
  ref: string | null;
  rows: number;
  filtered: number;
  extra: string;
}

// 慢查询记录
interface SlowQuery {
  query: string;
  executionTime: number;
  timestamp: number;
  plan?: QueryPlan[];
}

/**
 * 查询优化器类
 */
export class QueryOptimizer {
  private queryStats: Map<string, QueryStats> = new Map();
  private slowQueries: SlowQuery[] = [];
  private slowQueryThreshold: number = 100; // 毫秒

  /**
   * 分析查询计划
   */
  async analyzeQuery(query: string): Promise<QueryPlan[]> {
    try {
      const db = await getDb();
      if (!db) return [];
      const result = await db.execute(sql.raw(`EXPLAIN ${query}`));
      // MySQL2 返回 [rows, fields] 格式
      const rows = Array.isArray(result) ? result[0] : result;
      return (Array.isArray(rows) ? rows : []) as QueryPlan[];
    } catch (error) {
      console.error('Failed to analyze query:', error);
      return [];
    }
  }

  /**
   * 分析扩展查询计划
   */
  async analyzeQueryExtended(query: string): Promise<any> {
    try {
      const db = await getDb();
      if (!db) return null;
      const result = await db.execute(sql.raw(`EXPLAIN FORMAT=JSON ${query}`));
      // MySQL2 返回 [rows, fields] 格式
      const rows = Array.isArray(result) ? result[0] : result;
      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error('Failed to analyze query extended:', error);
      return null;
    }
  }

  /**
   * 记录查询执行
   */
  recordQueryExecution(query: string, executionTime: number): void {
    const normalizedQuery = this.normalizeQuery(query);
    
    const existing = this.queryStats.get(normalizedQuery);
    if (existing) {
      existing.executionCount++;
      existing.totalTime += executionTime;
      existing.avgTime = existing.totalTime / existing.executionCount;
      existing.maxTime = Math.max(existing.maxTime, executionTime);
      existing.minTime = Math.min(existing.minTime, executionTime);
      existing.lastExecuted = Date.now();
    } else {
      this.queryStats.set(normalizedQuery, {
        query: normalizedQuery,
        executionCount: 1,
        totalTime: executionTime,
        avgTime: executionTime,
        maxTime: executionTime,
        minTime: executionTime,
        lastExecuted: Date.now(),
      });
    }

    // 记录慢查询
    if (executionTime > this.slowQueryThreshold) {
      this.slowQueries.push({
        query: normalizedQuery,
        executionTime,
        timestamp: Date.now(),
      });
      
      // 保持最近 1000 条慢查询
      if (this.slowQueries.length > 1000) {
        this.slowQueries.shift();
      }
    }
  }

  /**
   * 标准化查询（移除具体参数值）
   */
  private normalizeQuery(query: string): string {
    return query
      .replace(/\s+/g, ' ')
      .replace(/'[^']*'/g, '?')
      .replace(/\d+/g, '?')
      .trim();
  }

  /**
   * 获取索引建议
   */
  async getIndexSuggestions(): Promise<IndexSuggestion[]> {
    const suggestions: IndexSuggestion[] = [];

    // 分析慢查询
    for (const slowQuery of this.slowQueries.slice(-100)) {
      const plan = await this.analyzeQuery(slowQuery.query);
      
      for (const step of plan) {
        // 检查全表扫描
        if (step.type === 'ALL' && step.rows > 1000) {
          suggestions.push({
            table: step.table,
            columns: this.extractWhereColumns(slowQuery.query),
            type: 'btree',
            reason: `Full table scan detected on ${step.table} with ${step.rows} rows`,
            estimatedImprovement: 0.8,
          });
        }

        // 检查索引未使用
        if (step.possibleKeys && !step.key) {
          suggestions.push({
            table: step.table,
            columns: step.possibleKeys.split(','),
            type: 'btree',
            reason: `Possible keys exist but not used: ${step.possibleKeys}`,
            estimatedImprovement: 0.5,
          });
        }

        // 检查文件排序
        if (step.extra?.includes('Using filesort')) {
          const orderByColumns = this.extractOrderByColumns(slowQuery.query);
          if (orderByColumns.length > 0) {
            suggestions.push({
              table: step.table,
              columns: orderByColumns,
              type: 'btree',
              reason: 'Using filesort detected, consider adding index for ORDER BY columns',
              estimatedImprovement: 0.6,
            });
          }
        }
      }
    }

    // 去重
    return this.deduplicateSuggestions(suggestions);
  }

  /**
   * 提取 WHERE 子句中的列
   */
  private extractWhereColumns(query: string): string[] {
    const columns: string[] = [];
    const whereMatch = query.match(/WHERE\s+(.+?)(?:ORDER|GROUP|LIMIT|$)/i);
    
    if (whereMatch) {
      const whereClause = whereMatch[1];
      const regex = /(\w+)\s*[=<>!]/g;
      let match;
      while ((match = regex.exec(whereClause)) !== null) {
        columns.push(match[1]);
      }
    }
    
    return Array.from(new Set(columns));
  }

  /**
   * 提取 ORDER BY 子句中的列
   */
  private extractOrderByColumns(query: string): string[] {
    const columns: string[] = [];
    const orderMatch = query.match(/ORDER\s+BY\s+(.+?)(?:LIMIT|$)/i);
    
    if (orderMatch) {
      const orderClause = orderMatch[1];
      const regex = /(\w+)(?:\s+(?:ASC|DESC))?/gi;
      let match;
      while ((match = regex.exec(orderClause)) !== null) {
        columns.push(match[1]);
      }
    }
    
    return columns;
  }

  /**
   * 去重索引建议
   */
  private deduplicateSuggestions(suggestions: IndexSuggestion[]): IndexSuggestion[] {
    const seen = new Set<string>();
    return suggestions.filter(s => {
      const key = `${s.table}:${s.columns.sort().join(',')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * 获取查询统计
   */
  getQueryStats(): QueryStats[] {
    return Array.from(this.queryStats.values())
      .sort((a, b) => b.totalTime - a.totalTime);
  }

  /**
   * 获取慢查询
   */
  getSlowQueries(limit: number = 100): SlowQuery[] {
    return this.slowQueries
      .slice(-limit)
      .sort((a, b) => b.executionTime - a.executionTime);
  }

  /**
   * 获取热点查询
   */
  getHotQueries(limit: number = 20): QueryStats[] {
    return Array.from(this.queryStats.values())
      .sort((a, b) => b.executionCount - a.executionCount)
      .slice(0, limit);
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.queryStats.clear();
    this.slowQueries = [];
  }

  /**
   * 设置慢查询阈值
   */
  setSlowQueryThreshold(ms: number): void {
    this.slowQueryThreshold = ms;
  }

  /**
   * 生成优化报告
   */
  async generateOptimizationReport(): Promise<OptimizationReport> {
    const stats = this.getQueryStats();
    const slowQueries = this.getSlowQueries(50);
    const hotQueries = this.getHotQueries(20);
    const indexSuggestions = await this.getIndexSuggestions();

    return {
      generatedAt: Date.now(),
      summary: {
        totalQueries: stats.reduce((sum, s) => sum + s.executionCount, 0),
        uniqueQueries: stats.length,
        slowQueryCount: slowQueries.length,
        avgQueryTime: stats.length > 0 
          ? stats.reduce((sum, s) => sum + s.avgTime, 0) / stats.length 
          : 0,
      },
      slowQueries,
      hotQueries,
      indexSuggestions,
      recommendations: this.generateRecommendations(stats, slowQueries, indexSuggestions),
    };
  }

  /**
   * 生成优化建议
   */
  private generateRecommendations(
    stats: QueryStats[],
    slowQueries: SlowQuery[],
    indexSuggestions: IndexSuggestion[]
  ): string[] {
    const recommendations: string[] = [];

    // 基于慢查询数量
    if (slowQueries.length > 50) {
      recommendations.push(
        `检测到 ${slowQueries.length} 条慢查询，建议优先优化执行时间最长的查询`
      );
    }

    // 基于索引建议
    if (indexSuggestions.length > 0) {
      recommendations.push(
        `发现 ${indexSuggestions.length} 个潜在的索引优化点，建议添加相应索引`
      );
    }

    // 基于热点查询
    const hotQuery = stats[0];
    if (hotQuery && hotQuery.executionCount > 10000) {
      recommendations.push(
        `查询 "${hotQuery.query.substring(0, 50)}..." 执行了 ${hotQuery.executionCount} 次，建议考虑缓存`
      );
    }

    // 基于平均执行时间
    const avgTime = stats.length > 0 
      ? stats.reduce((sum, s) => sum + s.avgTime, 0) / stats.length 
      : 0;
    if (avgTime > 50) {
      recommendations.push(
        `平均查询时间为 ${avgTime.toFixed(2)}ms，建议进行整体性能优化`
      );
    }

    return recommendations;
  }
}

// 优化报告接口
interface OptimizationReport {
  generatedAt: number;
  summary: {
    totalQueries: number;
    uniqueQueries: number;
    slowQueryCount: number;
    avgQueryTime: number;
  };
  slowQueries: SlowQuery[];
  hotQueries: QueryStats[];
  indexSuggestions: IndexSuggestion[];
  recommendations: string[];
}

// 导出单例
export const queryOptimizer = new QueryOptimizer();

// 查询包装器（自动记录执行时间）
export async function optimizedQuery<T>(
  queryFn: () => Promise<T>,
  queryDescription: string
): Promise<T> {
  const startTime = performance.now();
  try {
    const result = await queryFn();
    const executionTime = performance.now() - startTime;
    queryOptimizer.recordQueryExecution(queryDescription, executionTime);
    return result;
  } catch (error) {
    const executionTime = performance.now() - startTime;
    queryOptimizer.recordQueryExecution(queryDescription, executionTime);
    throw error;
  }
}

// 批量查询优化器
export class BatchQueryOptimizer {
  private batchSize: number;
  private flushInterval: number;
  private batch: any[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private flushCallback: (batch: any[]) => Promise<void>;

  constructor(
    batchSize: number = 100,
    flushInterval: number = 100,
    flushCallback: (batch: any[]) => Promise<void>
  ) {
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
    this.flushCallback = flushCallback;
  }

  add(item: any): void {
    this.batch.push(item);

    if (this.batch.length >= this.batchSize) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.batch.length === 0) return;

    const toFlush = this.batch;
    this.batch = [];

    await this.flushCallback(toFlush);
  }

  async close(): Promise<void> {
    await this.flush();
  }
}

// 连接池优化配置
export const connectionPoolConfig = {
  // 最大连接数
  maxConnections: 20,
  // 最小空闲连接
  minIdleConnections: 5,
  // 连接超时（毫秒）
  connectionTimeout: 10000,
  // 空闲超时（毫秒）
  idleTimeout: 60000,
  // 最大生命周期（毫秒）
  maxLifetime: 1800000,
  // 验证查询
  validationQuery: 'SELECT 1',
  // 验证间隔（毫秒）
  validationInterval: 30000,
};

// 查询缓存配置
export const queryCacheConfig = {
  // 是否启用
  enabled: true,
  // 最大缓存条目
  maxEntries: 1000,
  // 默认 TTL（秒）
  defaultTTL: 60,
  // 最大 TTL（秒）
  maxTTL: 3600,
  // 缓存键前缀
  keyPrefix: 'query_cache:',
};
