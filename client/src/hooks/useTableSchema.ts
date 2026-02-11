/**
 * useTableSchema — 统一数据访问 Hook
 * 所有组件通过此 Hook 获取表信息
 * 后续接入真实 API 时只需修改此文件内部实现
 */
import { useMemo, useCallback } from "react";
import type { TableRegistryEntry, DomainId, Relation, FieldDefinition, ColumnSummary } from "@/data/types";
import type { DomainMeta } from "@/data/types";
import { ALL_TABLES, getTable, getTablesByDomain, searchTables, TOTAL_TABLE_COUNT, getDomainStats } from "@/data/registry";
import { DOMAINS, DOMAIN_MAP } from "@/data/domains";
import { RELATIONS } from "@/data/relations";
import { TOPO_MAP } from "@/data/topology";
import { ER_POSITIONS } from "@/data/er-positions";
import { getMockRows, getMockColumns } from "@/data/mock-rows";

export interface UseTableSchemaReturn {
  // 表查询
  allTables: TableRegistryEntry[];
  totalCount: number;
  totalFieldCount: number;
  getTable: (name: string) => TableRegistryEntry | undefined;
  getTablesByDomain: (domainId: DomainId) => TableRegistryEntry[];
  searchTables: (keyword: string) => TableRegistryEntry[];

  // 域信息
  domains: DomainMeta[];
  getDomain: (id: string) => DomainMeta | undefined;
  domainStats: { domainId: DomainId; count: number; totalFields: number }[];

  // 字段
  getFields: (tableName: string) => FieldDefinition[];
  getColumns: (tableName: string) => ColumnSummary[];

  // 关系
  relations: Relation[];
  getRelationsFor: (tableName: string) => Relation[];

  // 拓扑
  getTopoMapping: (tableName: string) => typeof TOPO_MAP[string] | undefined;

  // ER 位置
  getERPosition: (tableName: string) => { x: number; y: number };

  // Mock 数据
  getMockRows: (tableName: string) => Record<string, unknown>[];
  getMockColumns: (tableName: string) => string[];
}

export function useTableSchema(): UseTableSchemaReturn {
  const domainStats = useMemo(() => getDomainStats(), []);
  const totalFieldCount = useMemo(() => ALL_TABLES.reduce((sum, t) => sum + t.fields.length, 0), []);

  const getRelationsFor = useCallback((tableName: string) => {
    return RELATIONS.filter(r => r.from === tableName || r.to === tableName);
  }, []);

  const getTopoMapping = useCallback((tableName: string) => {
    return TOPO_MAP[tableName];
  }, []);

  const getERPosition = useCallback((tableName: string) => {
    return ER_POSITIONS[tableName] || { x: Math.random() * 800 + 100, y: Math.random() * 600 + 100 };
  }, []);

  const getFields = useCallback((tableName: string) => {
    return getTable(tableName)?.fields || [];
  }, []);

  const getColumns = useCallback((tableName: string) => {
    return getTable(tableName)?.columns || [];
  }, []);

  const getDomain = useCallback((id: string) => {
    return DOMAIN_MAP[id];
  }, []);

  return {
    allTables: ALL_TABLES,
    totalCount: TOTAL_TABLE_COUNT,
    totalFieldCount,
    getTable,
    getTablesByDomain,
    searchTables,
    domains: DOMAINS,
    getDomain,
    domainStats,
    getFields,
    getColumns,
    relations: RELATIONS,
    getRelationsFor,
    getTopoMapping,
    getERPosition,
    getMockRows,
    getMockColumns,
  };
}
