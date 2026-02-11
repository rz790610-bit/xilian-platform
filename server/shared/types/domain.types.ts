export type DomainId =
  | "base-config" | "asset-management" | "device-ops" | "diagnosis"
  | "data-governance" | "edge-collection" | "message-task"
  | "ai-knowledge" | "system-topology" | "plugin-engine" | "audit-log";

export interface PaginatedResult<T> { data: T[]; total: number; page: number; pageSize: number; }
