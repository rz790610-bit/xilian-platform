/**
 * 业务域元数据定义
 */
import type { DomainMeta } from "./types";

export const DOMAINS: DomainMeta[] = [
  { id: "base-config",        label: "基础配置",   icon: "Settings",      color: "oklch(0.65 0.1 90)",   tableCount: 10 },
  { id: "asset-management",   label: "资产管理",   icon: "Building2",     color: "oklch(0.75 0.18 170)", tableCount: 4 },
  { id: "device-ops",         label: "设备运维",   icon: "Cpu",           color: "oklch(0.65 0.15 45)",  tableCount: 8 },
  { id: "diagnosis",          label: "诊断分析",   icon: "AlertTriangle", color: "oklch(0.65 0.2 25)",   tableCount: 4 },
  { id: "data-governance",    label: "数据治理",   icon: "Shield",        color: "oklch(0.7 0.12 300)",  tableCount: 11 },
  { id: "edge-collection",    label: "边缘采集",   icon: "Radio",         color: "oklch(0.6 0.15 60)",   tableCount: 2 },
  { id: "realtime-telemetry", label: "实时遥测",   icon: "Activity",      color: "oklch(0.55 0.15 260)", tableCount: 5 },
  { id: "message-task",       label: "消息与任务", icon: "Zap",           color: "oklch(0.6 0.18 200)",  tableCount: 5 },
  { id: "ai-knowledge",       label: "AI知识",     icon: "Brain",         color: "oklch(0.7 0.16 170)",  tableCount: 11 },
  { id: "system-topology",    label: "系统拓扑",   icon: "Network",       color: "oklch(0.65 0.12 200)", tableCount: 7 },
  { id: "plugin-engine",      label: "插件引擎",   icon: "Plug",          color: "oklch(0.7 0.14 130)",  tableCount: 3 },
  { id: "audit-log",          label: "审计日志",   icon: "FileText",      color: "oklch(0.6 0.1 340)",   tableCount: 2 },
];

export const DOMAIN_MAP = Object.fromEntries(DOMAINS.map(d => [d.id, d])) as Record<string, DomainMeta>;

export function getDomainColor(domainId: string): string {
  return DOMAIN_MAP[domainId]?.color ?? "oklch(0.6 0.1 250)";
}

export function getDomainLabel(domainId: string): string {
  return DOMAIN_MAP[domainId]?.label ?? domainId;
}
