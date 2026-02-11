/**
 * XiLian Platform — 统一 Schema 类型定义
 * 所有组件共享同一套类型系统，消除重复定义
 */

/** 业务域 ID — V4.0: 11 个域 / 64 张表 */
export type DomainId =
  | "base-config"       // 基础配置域（9张表）
  | "asset-management"  // 资产管理域（4张表）
  | "device-ops"        // 设备运维域（8张表）
  | "diagnosis"         // 诊断分析域（4张表）
  | "data-governance"   // 数据治理域（11张表）
  | "edge-collection"   // 边缘采集域（2张表）
  | "message-task"      // 消息与任务域（5张表）
  | "ai-knowledge"      // AI与知识域（11张表）
  | "system-topology"   // 系统拓扑域（5张表）
  | "plugin-engine"     // 插件引擎域（3张表）
  | "audit-log";        // 审计日志域（2张表）

/** 域元数据 */
export interface DomainMeta {
  id: DomainId;
  label: string;
  icon: string; // Lucide icon name
  color: string; // oklch color
  tableCount: number;
}

/** 完整字段定义（VisualDesigner 建表用） */
export interface FieldDefinition {
  name: string;
  type: string;
  length: string;
  nullable: boolean;
  primaryKey: boolean;
  autoIncrement: boolean;
  unique: boolean;
  defaultVal: string;
  comment: string;
}

/** 精简列定义（ERDiagram 展示用） */
export interface ColumnSummary {
  name: string;
  type: string;
  pk?: boolean;
  fk?: boolean;
  fkRef?: string;
}

/** 表注册条目 */
export interface TableRegistryEntry {
  // 基本信息
  tableName: string;
  tableComment: string;
  displayName: string;
  description: string;
  domain: DomainId;
  icon: string; // Lucide icon name

  // DDL 配置
  engine: string;
  charset: string;
  collate: string;

  // 字段数据
  fields: FieldDefinition[];
  columns: ColumnSummary[];
}

/** 外键关系 */
export interface Relation {
  from: string;
  fromCol: string;
  to: string;
  toCol: string;
  type: "1:N" | "1:1" | "N:M";
  label?: string;
}

/** 拓扑节点 */
export interface TopoNode {
  id: string;
  label: string;
  type: string;
  status: "online" | "offline" | "warning";
  icon: string; // Lucide icon name
}

/** 拓扑边 */
export interface TopoEdge {
  from: string;
  to: string;
  label: string;
}

/** 拓扑映射 */
export interface TopoMapping {
  description: string;
  nodes: TopoNode[];
  edges: TopoEdge[];
}

/** ER 图表节点位置 */
export interface ERNodePosition {
  x: number;
  y: number;
}

/** 行级示例数据 */
export type MockRow = Record<string, string | number | boolean | null>;
