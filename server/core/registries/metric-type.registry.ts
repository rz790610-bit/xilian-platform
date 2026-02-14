/**
 * ============================================================================
 * 监控指标注册中心
 * ============================================================================
 * 
 * 职责：
 *   1. 管理平台支持的监控指标类型（系统指标、业务指标、自定义指标）
 *   2. 定义每种指标的采集器、聚合方式、告警规则模板
 *   3. 支持运行时动态注册新指标类型
 *   4. 自动同步到前端监控仪表盘和告警配置界面
 */

import { BaseRegistry, type RegistryItemMeta, type CategoryMeta } from '../registry';

// ============ 指标采集器定义 ============

export interface MetricCollector {
  /** 采集器类型 */
  type: 'pull' | 'push' | 'computed';
  /** 采集源 */
  source: string;
  /** 采集间隔（秒） */
  intervalSec: number;
  /** 采集查询/表达式 */
  query?: string;
  /** 计算公式（computed 类型） */
  formula?: string;
  /** 依赖的其他指标（computed 类型） */
  dependencies?: string[];
}

// ============ 告警规则模板 ============

export interface AlertRuleTemplate {
  id: string;
  label: string;
  description: string;
  condition: string;
  severity: 'info' | 'warning' | 'critical';
  /** 持续时间（秒） */
  durationSec: number;
  /** 通知渠道 */
  notifyChannels?: string[];
}

// ============ 聚合方式 ============

export type AggregationType = 'avg' | 'sum' | 'min' | 'max' | 'count' | 'p50' | 'p95' | 'p99' | 'rate' | 'delta';

// ============ 指标注册项 ============

export interface MetricTypeRegistryItem extends RegistryItemMeta {
  id: string;
  /** 指标数据类型 */
  dataType: 'gauge' | 'counter' | 'histogram' | 'summary';
  /** 单位 */
  unit: string;
  /** 采集器配置 */
  collector: MetricCollector;
  /** 支持的聚合方式 */
  aggregations: AggregationType[];
  /** 正常范围 */
  normalRange?: { min?: number; max?: number };
  /** 告警规则模板 */
  alertTemplates: AlertRuleTemplate[];
  /** 推荐的可视化类型 */
  visualizationType: 'line' | 'gauge' | 'bar' | 'area' | 'heatmap' | 'table' | 'stat';
  /** 保留策略（天） */
  retentionDays: number;
  /** 是否启用 */
  enabled: boolean;
}

// ============ 指标分类 ============

const METRIC_CATEGORIES: CategoryMeta[] = [
  { id: 'system', label: '系统指标', icon: '🖥️', order: 1, description: '服务器、容器、网络等基础设施指标', color: '#3B82F6' },
  { id: 'database', label: '数据库指标', icon: '🗄️', order: 2, description: 'MySQL、ClickHouse、Redis 等数据库性能指标', color: '#10B981' },
  { id: 'pipeline', label: 'Pipeline 指标', icon: '🔄', order: 3, description: '数据管道吞吐量、延迟、错误率', color: '#8B5CF6' },
  { id: 'device', label: '设备指标', icon: '📡', order: 4, description: '设备在线率、数据采集率、通信延迟', color: '#F59E0B' },
  { id: 'business', label: '业务指标', icon: '📊', order: 5, description: '业务 KPI、数据质量、SLA 达成率', color: '#EF4444' },
  { id: 'custom', label: '自定义指标', icon: '⚙️', order: 6, description: '用户自定义的监控指标', color: '#64748B' },
];

// ============ 内置指标类型 ============

const BUILTIN_METRIC_TYPES: MetricTypeRegistryItem[] = [
  // === 系统指标 ===
  {
    id: 'cpu_usage', label: 'CPU 使用率', icon: '💻',
    description: '服务器 CPU 使用百分比', category: 'system',
    tags: ['cpu', 'system', 'performance'],
    dataType: 'gauge', unit: '%',
    collector: { type: 'pull', source: 'node_exporter', intervalSec: 15, query: '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)' },
    aggregations: ['avg', 'max', 'p95', 'p99'],
    normalRange: { min: 0, max: 100 },
    alertTemplates: [
      { id: 'cpu_high', label: 'CPU 使用率过高', description: 'CPU 持续高于阈值', condition: 'value > 80', severity: 'warning', durationSec: 300 },
      { id: 'cpu_critical', label: 'CPU 使用率严重过高', description: 'CPU 持续严重过高', condition: 'value > 95', severity: 'critical', durationSec: 120 },
    ],
    visualizationType: 'line', retentionDays: 30, enabled: true,
  },
  {
    id: 'memory_usage', label: '内存使用率', icon: '🧠',
    description: '服务器内存使用百分比', category: 'system',
    tags: ['memory', 'ram', 'system'],
    dataType: 'gauge', unit: '%',
    collector: { type: 'pull', source: 'node_exporter', intervalSec: 15, query: '(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100' },
    aggregations: ['avg', 'max', 'p95'],
    normalRange: { min: 0, max: 100 },
    alertTemplates: [
      { id: 'mem_high', label: '内存使用率过高', description: '内存持续高于阈值', condition: 'value > 85', severity: 'warning', durationSec: 300 },
      { id: 'mem_critical', label: '内存不足', description: '内存严重不足', condition: 'value > 95', severity: 'critical', durationSec: 60 },
    ],
    visualizationType: 'gauge', retentionDays: 30, enabled: true,
  },
  {
    id: 'disk_usage', label: '磁盘使用率', icon: '💾',
    description: '磁盘空间使用百分比', category: 'system',
    tags: ['disk', 'storage', 'system'],
    dataType: 'gauge', unit: '%',
    collector: { type: 'pull', source: 'node_exporter', intervalSec: 60, query: '(1 - node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100' },
    aggregations: ['avg', 'max'],
    normalRange: { min: 0, max: 100 },
    alertTemplates: [
      { id: 'disk_high', label: '磁盘空间不足', description: '磁盘使用率过高', condition: 'value > 85', severity: 'warning', durationSec: 600 },
      { id: 'disk_critical', label: '磁盘空间严重不足', description: '磁盘即将满', condition: 'value > 95', severity: 'critical', durationSec: 60 },
    ],
    visualizationType: 'gauge', retentionDays: 90, enabled: true,
  },
  {
    id: 'network_io', label: '网络 I/O', icon: '🌐',
    description: '网络收发速率', category: 'system',
    tags: ['network', 'bandwidth', 'io'],
    dataType: 'counter', unit: 'bytes/s',
    collector: { type: 'pull', source: 'node_exporter', intervalSec: 15, query: 'rate(node_network_receive_bytes_total[5m])' },
    aggregations: ['avg', 'max', 'sum', 'rate'],
    alertTemplates: [
      { id: 'net_high', label: '网络带宽过高', description: '网络流量异常', condition: 'value > 100000000', severity: 'warning', durationSec: 300 },
    ],
    visualizationType: 'area', retentionDays: 30, enabled: true,
  },

  // === 数据库指标 ===
  {
    id: 'mysql_qps', label: 'MySQL QPS', icon: '🐬',
    description: 'MySQL 每秒查询数', category: 'database',
    tags: ['mysql', 'qps', 'query'],
    dataType: 'counter', unit: 'queries/s',
    collector: { type: 'pull', source: 'mysqld_exporter', intervalSec: 10, query: 'rate(mysql_global_status_queries[5m])' },
    aggregations: ['avg', 'max', 'p95', 'rate'],
    alertTemplates: [
      { id: 'mysql_qps_high', label: 'MySQL QPS 过高', description: '查询压力异常', condition: 'value > 10000', severity: 'warning', durationSec: 300 },
    ],
    visualizationType: 'line', retentionDays: 30, enabled: true,
  },
  {
    id: 'mysql_slow_queries', label: 'MySQL 慢查询', icon: '🐢',
    description: 'MySQL 慢查询数量', category: 'database',
    tags: ['mysql', 'slow', 'query'],
    dataType: 'counter', unit: 'queries',
    collector: { type: 'pull', source: 'mysqld_exporter', intervalSec: 30, query: 'rate(mysql_global_status_slow_queries[5m])' },
    aggregations: ['sum', 'rate', 'delta'],
    alertTemplates: [
      { id: 'slow_query', label: '慢查询增多', description: '慢查询数量异常增加', condition: 'delta(5m) > 10', severity: 'warning', durationSec: 300 },
    ],
    visualizationType: 'bar', retentionDays: 30, enabled: true,
  },
  {
    id: 'clickhouse_insert_rate', label: 'ClickHouse 写入速率', icon: '⚡',
    description: 'ClickHouse 每秒写入行数', category: 'database',
    tags: ['clickhouse', 'insert', 'write'],
    dataType: 'counter', unit: 'rows/s',
    collector: { type: 'pull', source: 'clickhouse_exporter', intervalSec: 10, query: 'rate(ClickHouseProfileEvents_InsertedRows[5m])' },
    aggregations: ['avg', 'max', 'sum', 'rate'],
    alertTemplates: [
      { id: 'ch_insert_low', label: '写入速率下降', description: 'ClickHouse 写入速率异常下降', condition: 'value < 100', severity: 'warning', durationSec: 600 },
    ],
    visualizationType: 'line', retentionDays: 30, enabled: true,
  },
  {
    id: 'redis_ops', label: 'Redis OPS', icon: '🔴',
    description: 'Redis 每秒操作数', category: 'database',
    tags: ['redis', 'ops', 'performance'],
    dataType: 'counter', unit: 'ops/s',
    collector: { type: 'pull', source: 'redis_exporter', intervalSec: 10, query: 'rate(redis_commands_processed_total[5m])' },
    aggregations: ['avg', 'max', 'p95'],
    alertTemplates: [
      { id: 'redis_ops_high', label: 'Redis OPS 过高', description: 'Redis 操作压力异常', condition: 'value > 100000', severity: 'warning', durationSec: 300 },
    ],
    visualizationType: 'line', retentionDays: 30, enabled: true,
  },

  // === Pipeline 指标 ===
  {
    id: 'pipeline_throughput', label: 'Pipeline 吞吐量', icon: '🔄',
    description: '数据管道每秒处理记录数', category: 'pipeline',
    tags: ['pipeline', 'throughput', 'records'],
    dataType: 'counter', unit: 'records/s',
    collector: { type: 'push', source: 'pipeline_engine', intervalSec: 5 },
    aggregations: ['avg', 'max', 'sum', 'rate'],
    alertTemplates: [
      { id: 'pipeline_low', label: '吞吐量下降', description: 'Pipeline 吞吐量异常下降', condition: 'value < 10', severity: 'warning', durationSec: 300 },
    ],
    visualizationType: 'area', retentionDays: 30, enabled: true,
  },
  {
    id: 'pipeline_latency', label: 'Pipeline 延迟', icon: '⏱️',
    description: '数据管道端到端处理延迟', category: 'pipeline',
    tags: ['pipeline', 'latency', 'delay'],
    dataType: 'histogram', unit: 'ms',
    collector: { type: 'push', source: 'pipeline_engine', intervalSec: 5 },
    aggregations: ['avg', 'p50', 'p95', 'p99', 'max'],
    normalRange: { min: 0, max: 5000 },
    alertTemplates: [
      { id: 'latency_high', label: '延迟过高', description: 'Pipeline P95 延迟超标', condition: 'p95 > 2000', severity: 'warning', durationSec: 300 },
      { id: 'latency_critical', label: '延迟严重超标', description: 'Pipeline P99 延迟严重超标', condition: 'p99 > 10000', severity: 'critical', durationSec: 120 },
    ],
    visualizationType: 'line', retentionDays: 30, enabled: true,
  },
  {
    id: 'pipeline_error_rate', label: 'Pipeline 错误率', icon: '❌',
    description: '数据管道处理错误率', category: 'pipeline',
    tags: ['pipeline', 'error', 'failure'],
    dataType: 'gauge', unit: '%',
    collector: { type: 'computed', source: 'pipeline_engine', intervalSec: 10, formula: '(pipeline_errors / pipeline_total) * 100', dependencies: ['pipeline_throughput'] },
    aggregations: ['avg', 'max'],
    normalRange: { min: 0, max: 100 },
    alertTemplates: [
      { id: 'error_high', label: '错误率过高', description: 'Pipeline 错误率超标', condition: 'value > 5', severity: 'warning', durationSec: 300 },
      { id: 'error_critical', label: '错误率严重超标', description: 'Pipeline 大量错误', condition: 'value > 20', severity: 'critical', durationSec: 60 },
    ],
    visualizationType: 'stat', retentionDays: 30, enabled: true,
  },

  // === 设备指标 ===
  {
    id: 'device_online_rate', label: '设备在线率', icon: '📡',
    description: '设备在线数量占比', category: 'device',
    tags: ['device', 'online', 'availability'],
    dataType: 'gauge', unit: '%',
    collector: { type: 'computed', source: 'device_manager', intervalSec: 30, formula: '(online_devices / total_devices) * 100' },
    aggregations: ['avg', 'min'],
    normalRange: { min: 0, max: 100 },
    alertTemplates: [
      { id: 'online_low', label: '设备在线率下降', description: '大量设备离线', condition: 'value < 80', severity: 'warning', durationSec: 300 },
      { id: 'online_critical', label: '设备大面积离线', description: '设备在线率严重下降', condition: 'value < 50', severity: 'critical', durationSec: 60 },
    ],
    visualizationType: 'gauge', retentionDays: 90, enabled: true,
  },
  {
    id: 'data_collection_rate', label: '数据采集率', icon: '📈',
    description: '设备数据采集成功率', category: 'device',
    tags: ['device', 'collection', 'data'],
    dataType: 'gauge', unit: '%',
    collector: { type: 'computed', source: 'device_manager', intervalSec: 60, formula: '(successful_collections / expected_collections) * 100' },
    aggregations: ['avg', 'min'],
    normalRange: { min: 0, max: 100 },
    alertTemplates: [
      { id: 'collection_low', label: '采集率下降', description: '数据采集成功率下降', condition: 'value < 95', severity: 'warning', durationSec: 600 },
    ],
    visualizationType: 'gauge', retentionDays: 90, enabled: true,
  },

  // === 业务指标 ===
  {
    id: 'data_quality_score', label: '数据质量评分', icon: '✅',
    description: '数据质量综合评分（完整性、准确性、时效性）', category: 'business',
    tags: ['quality', 'data', 'score'],
    dataType: 'gauge', unit: '分',
    collector: { type: 'computed', source: 'data_quality_engine', intervalSec: 300, formula: '(completeness * 0.4 + accuracy * 0.35 + timeliness * 0.25) * 100' },
    aggregations: ['avg', 'min'],
    normalRange: { min: 0, max: 100 },
    alertTemplates: [
      { id: 'quality_low', label: '数据质量下降', description: '数据质量评分低于阈值', condition: 'value < 80', severity: 'warning', durationSec: 600 },
    ],
    visualizationType: 'gauge', retentionDays: 365, enabled: true,
  },
  {
    id: 'sla_compliance', label: 'SLA 达成率', icon: '📋',
    description: '服务等级协议达成率', category: 'business',
    tags: ['sla', 'compliance', 'availability'],
    dataType: 'gauge', unit: '%',
    collector: { type: 'computed', source: 'sla_monitor', intervalSec: 300, formula: '(compliant_periods / total_periods) * 100' },
    aggregations: ['avg', 'min'],
    normalRange: { min: 0, max: 100 },
    alertTemplates: [
      { id: 'sla_breach', label: 'SLA 违约风险', description: 'SLA 达成率低于目标', condition: 'value < 99.5', severity: 'warning', durationSec: 300 },
      { id: 'sla_critical', label: 'SLA 严重违约', description: 'SLA 达成率严重低于目标', condition: 'value < 95', severity: 'critical', durationSec: 60 },
    ],
    visualizationType: 'stat', retentionDays: 365, enabled: true,
  },
];

// ============ 创建并初始化注册中心实例 ============

class MetricTypeRegistry extends BaseRegistry<MetricTypeRegistryItem> {
  constructor() {
    super('MetricTypeRegistry');
    this.registerCategories(METRIC_CATEGORIES);
    this.registerAll(BUILTIN_METRIC_TYPES);
  }

  /** 按数据类型查询 */
  getByDataType(dataType: string): MetricTypeRegistryItem[] {
    return this.listItems().filter(item => item.dataType === dataType);
  }

  /** 获取指标的告警规则模板 */
  getAlertTemplates(metricId: string): AlertRuleTemplate[] {
    return this.get(metricId)?.alertTemplates || [];
  }

  /** 获取所有启用的指标 */
  getEnabled(): MetricTypeRegistryItem[] {
    return this.listItems().filter(item => item.enabled);
  }

  /** 获取计算型指标的依赖关系图 */
  getDependencyGraph(): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    const allItems = Array.from(this.items.values());
    for (const item of allItems) {
      if (item.collector.type === 'computed' && item.collector.dependencies) {
        graph.set(item.id, item.collector.dependencies);
      }
    }
    return graph;
  }

  /** 按可视化类型查询 */
  getByVisualizationType(vizType: string): MetricTypeRegistryItem[] {
    return this.listItems().filter(item => item.visualizationType === vizType);
  }
}

// ============ 导出单例 ============

export const metricTypeRegistry = new MetricTypeRegistry();
