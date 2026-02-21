/**
 * ============================================================================
 * 认知赋能平台 — 实时拓扑
 * ============================================================================
 *
 * 展示认知中枢如何赋能整个平台的完整拓扑视图：
 *
 * 布局：
 *   - 中心核心区：认知中枢 9 层（L0-L7 + 护栏）
 *   - 外围模块环：平台已有 9 大模块（资产管理、边缘网关、算法引擎等）
 *   - 赋能连接线：平台→认知（数据输入）+ 认知→平台（赋能输出）
 *
 * 所有数据从 getTopologyStatus API 实时查询，5秒轮询刷新。
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Database, Cpu, Shield, BookOpen, RefreshCw,
  Activity, Server, Layers, Box, Wrench, GitBranch, Radio,
  ZoomIn, ZoomOut, Settings, Plug, Router, Brain, FileText,
  Network, Zap, MonitorSpeaker, BarChart3,
} from 'lucide-react';

// ============================================================================
// 类型
// ============================================================================

interface LayerData {
  label: string;
  status: string;
  metrics: Record<string, number>;
  connectors?: Array<{
    id: string; name: string; protocol: string; status: string;
    lastCheck: string | null; lastError: string | null;
  }>;
}

interface FlowEdge {
  from: string;
  to: string;
  label: string;
  active: boolean;
  direction?: string;
}

interface TopologyData {
  timestamp: string;
  cognitiveLayers: Record<string, LayerData>;
  platformModules: Record<string, LayerData>;
  cognitiveDataFlow: FlowEdge[];
  empowermentLinks: FlowEdge[];
}

// ============================================================================
// 布局配置 — 认知中枢核心（中心列）+ 平台模块（两侧）
// ============================================================================

// 画布尺寸
const CW = 1400;
const CH = 900;

interface NodeConfig {
  key: string;
  label: string;
  icon: typeof Database;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  activeColor: string;
  ring: 'cognitive' | 'platform';
}

// 认知中枢核心层 — 中间纵向排列
const COGNITIVE_NODES: NodeConfig[] = [
  { key: 'L0_contracts',   label: 'L0 数据契约层',  icon: Radio,     x: 520, y: 30,  w: 220, h: 80, color: '#334155', activeColor: '#0ea5e9', ring: 'cognitive' },
  { key: 'L1_perception',  label: 'L1 感知层',      icon: Activity,  x: 520, y: 140, w: 220, h: 80, color: '#334155', activeColor: '#22c55e', ring: 'cognitive' },
  { key: 'L2_cognition',   label: 'L2 认知诊断层',  icon: Cpu,       x: 420, y: 260, w: 220, h: 80, color: '#334155', activeColor: '#8b5cf6', ring: 'cognitive' },
  { key: 'L2_guardrail',   label: 'L2 安全护栏',    icon: Shield,    x: 680, y: 260, w: 220, h: 80, color: '#334155', activeColor: '#f59e0b', ring: 'cognitive' },
  { key: 'L3_knowledge',   label: 'L3 知识层',      icon: BookOpen,  x: 520, y: 380, w: 220, h: 80, color: '#334155', activeColor: '#06b6d4', ring: 'cognitive' },
  { key: 'L4_evolution',   label: 'L4 进化层',      icon: RefreshCw, x: 520, y: 490, w: 220, h: 80, color: '#334155', activeColor: '#ec4899', ring: 'cognitive' },
  { key: 'L5_tooling',     label: 'L5 工具层',      icon: Wrench,    x: 380, y: 600, w: 180, h: 70, color: '#334155', activeColor: '#14b8a6', ring: 'cognitive' },
  { key: 'L6_pipeline',    label: 'L6 管线层',      icon: GitBranch, x: 580, y: 600, w: 180, h: 70, color: '#334155', activeColor: '#a855f7', ring: 'cognitive' },
  { key: 'L7_digitalTwin', label: 'L7 数字孪生',    icon: Box,       x: 780, y: 600, w: 180, h: 70, color: '#334155', activeColor: '#f97316', ring: 'cognitive' },
];

// 平台已有模块 — 左右两侧分布
const PLATFORM_NODES: NodeConfig[] = [
  // 左侧 — 数据输入方向
  { key: 'assetManagement',   label: '资产管理',    icon: Server,         x: 40,  y: 60,  w: 200, h: 75, color: '#1e3a5f', activeColor: '#38bdf8', ring: 'platform' },
  { key: 'edgeGateway',       label: '边缘网关',    icon: Router,         x: 40,  y: 170, w: 200, h: 75, color: '#1e3a5f', activeColor: '#34d399', ring: 'platform' },
  { key: 'algorithmEngine',   label: '算法引擎',    icon: Brain,          x: 40,  y: 280, w: 200, h: 75, color: '#1e3a5f', activeColor: '#a78bfa', ring: 'platform' },
  { key: 'diagnosisEngine',   label: '诊断引擎',    icon: BarChart3,      x: 40,  y: 390, w: 200, h: 75, color: '#1e3a5f', activeColor: '#fbbf24', ring: 'platform' },
  { key: 'knowledgeBase',     label: '知识库',      icon: FileText,       x: 40,  y: 500, w: 200, h: 75, color: '#1e3a5f', activeColor: '#22d3ee', ring: 'platform' },
  // 右侧 — 赋能输出方向
  { key: 'modelManagement',   label: '模型管理',    icon: Layers,         x: 1120, y: 60,  w: 200, h: 75, color: '#1e3a5f', activeColor: '#f472b6', ring: 'platform' },
  { key: 'pluginSystem',      label: '插件系统',    icon: Plug,           x: 1120, y: 170, w: 200, h: 75, color: '#1e3a5f', activeColor: '#2dd4bf', ring: 'platform' },
  { key: 'systemTopology',    label: '系统拓扑',    icon: Network,        x: 1120, y: 280, w: 200, h: 75, color: '#1e3a5f', activeColor: '#fb923c', ring: 'platform' },
  { key: 'eventBus',          label: '事件总线',    icon: Zap,            x: 1120, y: 390, w: 200, h: 75, color: '#1e3a5f', activeColor: '#c084fc', ring: 'platform' },
];

const ALL_NODES = [...COGNITIVE_NODES, ...PLATFORM_NODES];
const NODE_MAP = new Map(ALL_NODES.map(n => [n.key, n]));

// ============================================================================
// 辅助函数
// ============================================================================

function getStatusColor(status: string): string {
  switch (status) {
    case 'online': case 'active': return '#22c55e';
    case 'degraded': return '#f59e0b';
    case 'offline': case 'error': return '#ef4444';
    default: return '#64748b';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'online': return '在线';
    case 'active': return '活跃';
    case 'degraded': return '降级';
    case 'offline': return '离线';
    case 'error': return '异常';
    case 'idle': return '空闲';
    default: return status;
  }
}

function formatMetricLabel(key: string): string {
  const map: Record<string, string> = {
    // 认知中枢
    connectorTotal: '连接器', connectorOnline: '在线', connectorError: '异常',
    conditionProfiles: '工况配置', samplingConfigs: '采样策略',
    activeSessions: '活跃会话', todayDiagnosis: '今日诊断', totalSessions: '总会话',
    completedSessions: '已完成', failedSessions: '失败', grokChainsTotal: 'Grok链', grokChainsToday: '今日推理',
    rulesTotal: '规则', rulesEnabled: '启用', violationsTotal: '违规', violationsToday: '今日违规',
    crystals: '结晶', features: '特征', kgNodes: 'KG节点', kgEdges: 'KG关系',
    cycles: '周期', shadowEvals: '影子评估', championExperiments: '冠军挑战', edgeCases: '边缘案例',
    toolsRegistered: '工具',
    pipelinesDefined: '管线', pipelineRuns: '执行',
    equipmentProfiles: '设备模型',
    // 平台模块
    nodes: '节点', measurementPoints: '测点', sensors: '传感器',
    models: '模型', fineTuneTasks: '微调任务',
    collections: '集合', documents: '文档',
    registered: '已注册', instances: '实例',
    gateways: '网关',
    definitions: '定义', compositions: '编排', executions: '执行',
    rules: '规则', tasks: '任务',
    edges: '关系',
    totalEvents: '事件总数',
  };
  return map[key] || key;
}

// ============================================================================
// SVG 连线
// ============================================================================

function calcEdgePoints(fromNode: NodeConfig, toNode: NodeConfig): { fx: number; fy: number; tx: number; ty: number } {
  const fcx = fromNode.x + fromNode.w / 2;
  const fcy = fromNode.y + fromNode.h / 2;
  const tcx = toNode.x + toNode.w / 2;
  const tcy = toNode.y + toNode.h / 2;

  // 从节点边缘出发而非中心
  let fx = fcx, fy = fcy, tx = tcx, ty = tcy;

  if (fromNode.ring === 'platform' && toNode.ring === 'cognitive') {
    // 左侧平台 → 认知中枢：从右边缘到左边缘
    if (fromNode.x < 500) {
      fx = fromNode.x + fromNode.w;
      tx = toNode.x;
    } else {
      fx = fromNode.x;
      tx = toNode.x + toNode.w;
    }
    fy = fcy;
    ty = tcy;
  } else if (fromNode.ring === 'cognitive' && toNode.ring === 'platform') {
    // 认知中枢 → 右侧平台：从右边缘到左边缘
    if (toNode.x > 500) {
      fx = fromNode.x + fromNode.w;
      tx = toNode.x;
    } else {
      fx = fromNode.x;
      tx = toNode.x + toNode.w;
    }
    fy = fcy;
    ty = tcy;
  } else {
    // 认知内部连线
    const dx = tcx - fcx;
    const dy = tcy - fcy;
    if (Math.abs(dy) > Math.abs(dx)) {
      // 纵向连接
      if (dy > 0) { fy = fromNode.y + fromNode.h; ty = toNode.y; }
      else { fy = fromNode.y; ty = toNode.y + toNode.h; }
      fx = fcx; tx = tcx;
    } else {
      // 横向连接
      if (dx > 0) { fx = fromNode.x + fromNode.w; tx = toNode.x; }
      else { fx = fromNode.x; tx = toNode.x + toNode.w; }
      fy = fcy; ty = tcy;
    }
  }

  return { fx, fy, tx, ty };
}

function DataFlowLine({ edge, isPlatformLink }: { edge: FlowEdge; isPlatformLink: boolean }) {
  const fromNode = NODE_MAP.get(edge.from);
  const toNode = NODE_MAP.get(edge.to);
  if (!fromNode || !toNode) return null;

  const { fx, fy, tx, ty } = calcEdgePoints(fromNode, toNode);
  const dx = tx - fx;
  const dy = ty - fy;

  // 贝塞尔曲线
  let pathD: string;
  if (isPlatformLink) {
    // 平台赋能连线用更大弧度
    const cx1 = fx + dx * 0.4;
    const cy1 = fy;
    const cx2 = fx + dx * 0.6;
    const cy2 = ty;
    pathD = `M ${fx} ${fy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}`;
  } else {
    const cx1 = fx + dx * 0.3;
    const cy1 = fy + dy * 0.1;
    const cx2 = fx + dx * 0.7;
    const cy2 = fy + dy * 0.9;
    pathD = `M ${fx} ${fy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}`;
  }

  const edgeId = `edge-${edge.from}-${edge.to}`;
  const isReverse = edge.direction === 'cognitive→platform';
  const baseColor = isPlatformLink
    ? (isReverse ? '#ec4899' : '#3b82f6')
    : '#6366f1';
  const color = edge.active ? baseColor : '#334155';
  const opacity = edge.active ? 0.75 : 0.2;
  const strokeWidth = edge.active ? (isPlatformLink ? 2.5 : 1.8) : 1;

  return (
    <g>
      <defs>
        <marker
          id={`arrow-${edgeId}`}
          viewBox="0 0 10 6"
          refX="9" refY="3"
          markerWidth={isPlatformLink ? 10 : 7}
          markerHeight={isPlatformLink ? 7 : 5}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 3 L 0 6 z" fill={color} opacity={opacity + 0.2} />
        </marker>
      </defs>

      {/* 发光底线（活跃时） */}
      {edge.active && isPlatformLink && (
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={6}
          opacity={0.08}
          filter="blur(4px)"
        />
      )}

      {/* 主连线 */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={opacity}
        strokeDasharray={isPlatformLink && !edge.active ? '6 4' : 'none'}
        markerEnd={`url(#arrow-${edgeId})`}
      />

      {/* 脉冲动画 */}
      {edge.active && (
        <circle r={isPlatformLink ? 4 : 3} fill={color} opacity={0.9}>
          <animateMotion dur={isPlatformLink ? '4s' : '3s'} repeatCount="indefinite" path={pathD} />
        </circle>
      )}

      {/* 标签 */}
      <text
        x={(fx + tx) / 2}
        y={(fy + ty) / 2 - 6}
        textAnchor="middle"
        fill={edge.active ? '#94a3b8' : '#475569'}
        fontSize={isPlatformLink ? '10' : '9'}
        fontFamily="system-ui"
        fontWeight={isPlatformLink ? '500' : '400'}
      >
        {edge.label}
      </text>
    </g>
  );
}

// ============================================================================
// SVG 节点
// ============================================================================

function TopologyNode({
  config,
  layer,
  onSelect,
  selected,
}: {
  config: NodeConfig;
  layer: LayerData | null;
  onSelect: (key: string) => void;
  selected: boolean;
}) {
  const Icon = config.icon;
  const status = layer?.status ?? 'offline';
  const statusColor = getStatusColor(status);
  const isActive = status === 'online' || status === 'active';
  const borderColor = selected ? '#3b82f6' : isActive ? config.activeColor : '#475569';
  const isPlatform = config.ring === 'platform';

  // 取前 2 个关键指标
  const metricEntries = layer ? Object.entries(layer.metrics).slice(0, 2) : [];

  return (
    <g className="cursor-pointer" onClick={() => onSelect(config.key)}>
      {/* 外发光（活跃时） */}
      {isActive && (
        <rect
          x={config.x - 3} y={config.y - 3}
          width={config.w + 6} height={config.h + 6}
          rx={isPlatform ? 12 : 8}
          fill="none"
          stroke={config.activeColor}
          strokeWidth={1.5}
          opacity={0.25}
        >
          <animate attributeName="opacity" values="0.2;0.5;0.2" dur="2.5s" repeatCount="indefinite" />
        </rect>
      )}

      {/* 节点背景 */}
      <rect
        x={config.x} y={config.y}
        width={config.w} height={config.h}
        rx={isPlatform ? 10 : 6}
        fill={selected ? '#1e293b' : (isPlatform ? '#0c1929' : '#0f172a')}
        stroke={borderColor}
        strokeWidth={selected ? 2.5 : 1.5}
      />

      {/* 平台模块左侧色条 */}
      {isPlatform && (
        <rect
          x={config.x} y={config.y}
          width={4} height={config.h}
          rx={2}
          fill={isActive ? config.activeColor : '#334155'}
          opacity={0.8}
        />
      )}

      {/* 状态灯 */}
      <circle
        cx={config.x + config.w - 14}
        cy={config.y + 14}
        r={4}
        fill={statusColor}
      >
        {isActive && (
          <animate attributeName="r" values="4;5;4" dur="1.5s" repeatCount="indefinite" />
        )}
      </circle>

      {/* 图标 */}
      <foreignObject x={config.x + 10} y={config.y + 8} width={22} height={22}>
        <Icon size={18} color={isActive ? config.activeColor : '#64748b'} />
      </foreignObject>

      {/* 标题 */}
      <text
        x={config.x + 36}
        y={config.y + 22}
        fill={isActive ? '#f1f5f9' : '#94a3b8'}
        fontSize="12"
        fontWeight="600"
        fontFamily="system-ui"
      >
        {config.label}
      </text>

      {/* 状态文字 */}
      <text
        x={config.x + config.w - 26}
        y={config.y + 22}
        fill={statusColor}
        fontSize="9"
        fontFamily="system-ui"
        textAnchor="end"
      >
        {getStatusLabel(status)}
      </text>

      {/* 指标 */}
      {metricEntries.map(([key, val], i) => (
        <g key={key}>
          <text
            x={config.x + 12}
            y={config.y + 42 + i * 15}
            fill="#64748b"
            fontSize="10"
            fontFamily="system-ui"
          >
            {formatMetricLabel(key)}
          </text>
          <text
            x={config.x + config.w - 12}
            y={config.y + 42 + i * 15}
            fill={isActive ? '#e2e8f0' : '#94a3b8'}
            fontSize="11"
            fontWeight="600"
            fontFamily="system-ui, monospace"
            textAnchor="end"
          >
            {val}
          </text>
        </g>
      ))}
    </g>
  );
}

// ============================================================================
// 节点详情面板
// ============================================================================

function NodeDetailPanel({
  nodeKey,
  layer,
  onClose,
}: {
  nodeKey: string;
  layer: LayerData;
  onClose: () => void;
}) {
  const config = NODE_MAP.get(nodeKey);
  if (!config) return null;

  const statusColor = getStatusColor(layer.status);
  const isPlatform = config.ring === 'platform';

  return (
    <Card className="absolute top-4 right-4 w-80 z-10 bg-card/95 backdrop-blur-sm border-border/50">
      <CardContent className="pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <config.icon size={18} style={{ color: config.activeColor }} />
            <span className="font-semibold text-sm text-foreground">{config.label}</span>
            {isPlatform && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">平台模块</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-xs"
              style={{ borderColor: statusColor, color: statusColor }}
            >
              {getStatusLabel(layer.status)}
            </Badge>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
          </div>
        </div>

        {/* 全部指标 */}
        <div className="space-y-1.5">
          {Object.entries(layer.metrics).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{formatMetricLabel(key)}</span>
              <span className="font-mono font-semibold text-foreground">{val}</span>
            </div>
          ))}
        </div>

        {/* 连接器详情（仅 L0） */}
        {layer.connectors && layer.connectors.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-border/50">
            <span className="text-xs font-medium text-muted-foreground">连接器状态</span>
            {layer.connectors.map(c => (
              <div key={c.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getStatusColor(c.status) }} />
                  <span className="text-foreground truncate max-w-[140px]">{c.name}</span>
                </div>
                <span className="text-muted-foreground">{c.protocol}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export function CognitiveTopology() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // 实时数据查询（5秒轮询）
  const topologyQuery = trpc.evoCognition.getTopologyStatus.useQuery(undefined, {
    refetchInterval: 5000,
    retry: 2,
  });

  const data = topologyQuery.data as TopologyData | null;

  // 合并认知层和平台模块数据
  const allLayers: Record<string, LayerData> = {
    ...(data?.cognitiveLayers ?? {}),
    ...(data?.platformModules ?? {}),
  };

  const cognitiveDataFlow = data?.cognitiveDataFlow ?? [];
  const empowermentLinks = data?.empowermentLinks ?? [];

  const handleNodeSelect = useCallback((key: string) => {
    setSelectedNode(prev => prev === key ? null : key);
  }, []);

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z + 0.1, 2)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(z - 0.1, 0.4)), []);
  const handleZoomReset = useCallback(() => { setZoom(0.85); setPan({ x: 0, y: 0 }); }, []);

  // 拖拽平移
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
  }, [isPanning]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  // 统计
  const cognitiveLayerKeys = Object.keys(data?.cognitiveLayers ?? {});
  const platformModuleKeys = Object.keys(data?.platformModules ?? {});
  const onlineCognitive = Object.values(data?.cognitiveLayers ?? {}).filter(l => l.status === 'online' || l.status === 'active').length;
  const onlinePlatform = Object.values(data?.platformModules ?? {}).filter(l => l.status === 'online' || l.status === 'active').length;
  const activeInternalFlows = cognitiveDataFlow.filter(e => e.active).length;
  const activeEmpowerLinks = empowermentLinks.filter(e => e.active).length;

  return (
    <div className="space-y-3">
      {/* 顶部状态栏 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${data ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-sm text-muted-foreground">
              {data ? `实时 · ${new Date(data.timestamp).toLocaleTimeString()}` : '连接中...'}
            </span>
          </div>
          <Badge variant="outline" className="text-xs bg-violet-500/10 text-violet-400 border-violet-500/30">
            认知中枢 {onlineCognitive}/{cognitiveLayerKeys.length}
          </Badge>
          <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30">
            平台模块 {onlinePlatform}/{platformModuleKeys.length}
          </Badge>
          <Badge variant="outline" className="text-xs bg-indigo-500/10 text-indigo-400 border-indigo-500/30">
            内部流 {activeInternalFlows}/{cognitiveDataFlow.length}
          </Badge>
          <Badge variant="outline" className="text-xs bg-pink-500/10 text-pink-400 border-pink-500/30">
            赋能链路 {activeEmpowerLinks}/{empowermentLinks.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleZoomOut} className="h-7 w-7 p-0">
            <ZoomOut size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleZoomReset} className="h-7 px-2 text-xs">
            {Math.round(zoom * 100)}%
          </Button>
          <Button variant="ghost" size="sm" onClick={handleZoomIn} className="h-7 w-7 p-0">
            <ZoomIn size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => topologyQuery.refetch()} className="h-7 w-7 p-0 ml-2">
            <RefreshCw size={14} className={topologyQuery.isFetching ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* 拓扑画布 */}
      <div
        className="relative bg-slate-950 rounded-lg border border-border/30 overflow-hidden select-none"
        style={{ height: 700, cursor: isPanning ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {topologyQuery.isLoading && !data && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">加载拓扑数据...</span>
            </div>
          </div>
        )}

        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${CW} ${CH}`}
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.2s',
          }}
        >
          {/* 网格背景 */}
          <defs>
            <pattern id="topo-grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#0f172a" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width={CW} height={CH} fill="url(#topo-grid)" />

          {/* 认知中枢区域背景 */}
          <rect
            x={340} y={10}
            width={600} height={690}
            rx={16}
            fill="none"
            stroke="#1e293b"
            strokeWidth={1}
            strokeDasharray="8 4"
            opacity={0.6}
          />
          <text x={640} y={710} textAnchor="middle" fill="#334155" fontSize="12" fontFamily="system-ui" fontWeight="600">
            认知中枢
          </text>

          {/* 左侧平台区域标签 */}
          <text x={140} y={630} textAnchor="middle" fill="#1e3a5f" fontSize="11" fontFamily="system-ui" fontWeight="600">
            平台模块（数据输入）
          </text>

          {/* 右侧平台区域标签 */}
          <text x={1220} y={500} textAnchor="middle" fill="#1e3a5f" fontSize="11" fontFamily="system-ui" fontWeight="600">
            平台模块（赋能输出）
          </text>

          {/* 认知中枢内部数据流 */}
          {cognitiveDataFlow.map((edge, i) => (
            <DataFlowLine key={`cog-${i}`} edge={edge} isPlatformLink={false} />
          ))}

          {/* 平台赋能连接线 */}
          {empowermentLinks.map((edge, i) => (
            <DataFlowLine key={`emp-${i}`} edge={edge} isPlatformLink={true} />
          ))}

          {/* 认知中枢节点 */}
          {COGNITIVE_NODES.map(nodeConfig => (
            <TopologyNode
              key={nodeConfig.key}
              config={nodeConfig}
              layer={allLayers[nodeConfig.key] ?? null}
              onSelect={handleNodeSelect}
              selected={selectedNode === nodeConfig.key}
            />
          ))}

          {/* 平台模块节点 */}
          {PLATFORM_NODES.map(nodeConfig => (
            <TopologyNode
              key={nodeConfig.key}
              config={nodeConfig}
              layer={allLayers[nodeConfig.key] ?? null}
              onSelect={handleNodeSelect}
              selected={selectedNode === nodeConfig.key}
            />
          ))}

          {/* 闭环反馈标注 */}
          <text x={640} y={560} fill="#ec4899" fontSize="10" fontFamily="system-ui" opacity={0.5} textAnchor="middle">
            ↻ 进化闭环反馈
          </text>
        </svg>

        {/* 节点详情面板 */}
        {selectedNode && allLayers[selectedNode] && (
          <NodeDetailPanel
            nodeKey={selectedNode}
            layer={allLayers[selectedNode]}
            onClose={() => setSelectedNode(null)}
          />
        )}

        {/* 图例 */}
        <div className="absolute bottom-3 left-3 flex items-center gap-3 text-[10px] text-muted-foreground bg-slate-950/90 px-3 py-1.5 rounded">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>在线</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span>降级</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span>异常</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-slate-500" />
            <span>空闲</span>
          </div>
          <div className="border-l border-border/30 pl-3 flex items-center gap-1">
            <div className="w-6 h-0.5 bg-indigo-500" />
            <span>内部流</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-0.5 bg-blue-500" />
            <span>平台→认知</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-0.5 bg-pink-500" />
            <span>认知→平台</span>
          </div>
        </div>
      </div>
    </div>
  );
}
