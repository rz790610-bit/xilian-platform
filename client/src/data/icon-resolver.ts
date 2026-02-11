/**
 * Lucide 图标字符串 → React 组件动态解析器
 */
import {
  Settings, Settings2, Building2, Cpu, AlertTriangle, Shield, ShieldAlert, Radio,
  Activity, Zap, Brain, Network, Plug, Database, Server,
  Layers, MapPin, Key, Table, FileText, BarChart3,
  Clock, Hash, Tag, Workflow, GitBranch, Box, ScrollText,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  Settings, Settings2, Building2, Cpu, AlertTriangle, Shield, ShieldAlert, Radio,
  Activity, Zap, Brain, Network, Plug, Database, Server,
  Layers, MapPin, Key, Table, FileText, BarChart3,
  Clock, Hash, Tag, Workflow, GitBranch, Box, ScrollText,
};

export function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] || Database;
}
