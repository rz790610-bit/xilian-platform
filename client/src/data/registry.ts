/**
 * XiLian Platform — Schema Registry 注册中心
 * 统一管理全部表元数据，所有组件通过此模块获取数据
 */
import type { TableRegistryEntry, DomainId } from "./types";
import {
  BASE_CONFIG_TABLES,
  ASSET_MANAGEMENT_TABLES,
  DEVICE_OPS_TABLES,
  DIAGNOSIS_TABLES,
  DATA_GOVERNANCE_TABLES,
  EDGE_COLLECTION_TABLES,
  REALTIME_TELEMETRY_TABLES,
  MESSAGE_TASK_TABLES,
  AI_KNOWLEDGE_TABLES,
  SYSTEM_TOPOLOGY_TABLES,
  PLUGIN_ENGINE_TABLES,
  AUDIT_LOG_TABLES,
} from "./fields";

/** 全部表注册表（按域排列） */
export const ALL_TABLES: TableRegistryEntry[] = [
  ...BASE_CONFIG_TABLES,
  ...ASSET_MANAGEMENT_TABLES,
  ...DEVICE_OPS_TABLES,
  ...DIAGNOSIS_TABLES,
  ...DATA_GOVERNANCE_TABLES,
  ...EDGE_COLLECTION_TABLES,
  ...REALTIME_TELEMETRY_TABLES,
  ...MESSAGE_TASK_TABLES,
  ...AI_KNOWLEDGE_TABLES,
  ...SYSTEM_TOPOLOGY_TABLES,
  ...PLUGIN_ENGINE_TABLES,
  ...AUDIT_LOG_TABLES,
];

/** 按表名索引 */
const TABLE_INDEX = new Map<string, TableRegistryEntry>();
ALL_TABLES.forEach(t => TABLE_INDEX.set(t.tableName, t));

/** 按域分组索引 */
const DOMAIN_INDEX = new Map<DomainId, TableRegistryEntry[]>();
ALL_TABLES.forEach(t => {
  const list = DOMAIN_INDEX.get(t.domain) || [];
  list.push(t);
  DOMAIN_INDEX.set(t.domain, list);
});

// ===== 查询 API =====

/** 获取单张表 */
export function getTable(tableName: string): TableRegistryEntry | undefined {
  return TABLE_INDEX.get(tableName);
}

/** 获取域下所有表 */
export function getTablesByDomain(domainId: DomainId): TableRegistryEntry[] {
  return DOMAIN_INDEX.get(domainId) || [];
}

/** 获取所有表名列表 */
export function getTableNames(): string[] {
  return ALL_TABLES.map(t => t.tableName);
}

/** 获取所有域 ID 列表 */
export function getDomainIds(): DomainId[] {
  return Array.from(DOMAIN_INDEX.keys());
}

/** 搜索表（按名称或注释模糊匹配） */
export function searchTables(keyword: string): TableRegistryEntry[] {
  if (!keyword.trim()) return ALL_TABLES;
  const kw = keyword.toLowerCase();
  return ALL_TABLES.filter(t =>
    t.tableName.toLowerCase().includes(kw) ||
    t.tableComment.toLowerCase().includes(kw) ||
    t.displayName.toLowerCase().includes(kw)
  );
}

/** 获取域统计信息 */
export function getDomainStats(): { domainId: DomainId; count: number; totalFields: number }[] {
  return Array.from(DOMAIN_INDEX.entries()).map(([domainId, tables]) => ({
    domainId,
    count: tables.length,
    totalFields: tables.reduce((sum, t) => sum + t.fields.length, 0),
  }));
}

/** 总表数 */
export const TOTAL_TABLE_COUNT = ALL_TABLES.length;
