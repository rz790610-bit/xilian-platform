/**
 * 平台导航配置 — 四级菜单结构
 * 按报告 M8/M9 建议组织：系统设置 / 运维中心 / 业务应用 / 监控大屏
 */
import type { LucideIcon } from "lucide-react";
import {
  Settings, Database, GitBranch, Network, Plug, Shield, Lock,
  Cpu, Bell, BarChart3, Activity, Brain, BookOpen, Boxes,
  Monitor, Gauge, Wrench, Radio, Layers, FileCode,
  Table2, Paintbrush, Code2, GitFork, ScrollText,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  path?: string;
  children?: NavItem[];
  badge?: string;
}

export const NAVIGATION: NavItem[] = [
  {
    id: "design",
    label: "系统设置",
    icon: Settings,
    children: [
      {
        id: "design-tools",
        label: "设计工具",
        icon: Wrench,
        children: [
          { id: "db-designer", label: "数据库设计", icon: Database, path: "/" },
          { id: "pipeline", label: "Pipeline 编排", icon: GitBranch, path: "/design/pipeline" },
        ],
      },
      {
        id: "config",
        label: "配置管理",
        icon: Layers,
        children: [
          { id: "gateway-config", label: "网关配置", icon: Network, path: "/config/gateways" },
          { id: "protocol-config", label: "协议配置", icon: FileCode, path: "/config/protocols" },
          { id: "template-mgr", label: "模板管理", icon: Boxes, path: "/config/templates" },
        ],
      },
      {
        id: "state",
        label: "状态管理",
        icon: Activity,
        children: [
          { id: "plugin-mgr", label: "插件管理", icon: Plug, path: "/state/plugins" },
          { id: "topo-viewer", label: "拓扑视图", icon: Network, path: "/state/topology" },
          { id: "engine-status", label: "引擎状态", icon: Cpu, path: "/state/engines" },
        ],
      },
      {
        id: "security",
        label: "安全中心",
        icon: Shield,
        children: [
          { id: "audit-log", label: "审计日志", icon: ScrollText, path: "/security/audit" },
          { id: "permission", label: "权限管理", icon: Lock, path: "/security/permissions" },
        ],
      },
    ],
  },
  {
    id: "ops",
    label: "运维中心",
    icon: Cpu,
    children: [
      { id: "device-mgr", label: "设备管理", icon: Cpu, path: "/ops/devices" },
      { id: "alert-center", label: "告警中心", icon: Bell, path: "/ops/alerts" },
      { id: "data-governance", label: "数据治理", icon: BarChart3, path: "/ops/governance" },
      { id: "edge-mgr", label: "边缘网关", icon: Radio, path: "/ops/edge" },
    ],
  },
  {
    id: "biz",
    label: "业务应用",
    icon: Brain,
    children: [
      { id: "diagnosis", label: "诊断分析", icon: Activity, path: "/biz/diagnosis" },
      { id: "knowledge", label: "知识库", icon: BookOpen, path: "/biz/knowledge" },
      { id: "model-hub", label: "模型中心", icon: Boxes, path: "/biz/models" },
    ],
  },
  {
    id: "monitor",
    label: "监控大屏",
    icon: Monitor,
    children: [
      { id: "realtime-dash", label: "实时监控", icon: Gauge, path: "/monitor/realtime" },
      { id: "data-quality", label: "数据质量", icon: BarChart3, path: "/monitor/quality" },
    ],
  },
];

/** 数据库设计器子导航（Tab 式） */
export const DB_DESIGNER_TABS = [
  { id: "tables", label: "表管理", icon: Table2 },
  { id: "designer", label: "可视化设计器", icon: Paintbrush },
  { id: "sql", label: "SQL 编辑器", icon: Code2 },
  { id: "data", label: "数据浏览", icon: Database },
  { id: "erd", label: "架构视图", icon: GitFork },
];
