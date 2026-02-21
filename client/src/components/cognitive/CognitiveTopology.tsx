/**
 * ============================================================================
 * 认知中枢实时拓扑 — CognitiveTopology
 * ============================================================================
 *
 * 展示 v5.0 认知中枢完整处理流程的实时拓扑图。
 * 每个节点从 getTopologyStatus API 获取真实数据库指标，
 * 连线反映真实数据流方向和活跃状态，5秒轮询刷新。
 *
 * 架构层级：
 *   L0 数据契约层 → L1 感知层 → L2 认知诊断/安全护栏 → L3 知识层
 *   → L4 进化层 → L5 工具层 / L6 管线层 / L7 数字孪生
 *   进化层反馈回路 → L1/L2（闭环）
 */

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Database, Cpu, Shield, BookOpen, RefreshCw,
  Activity, Server, Layers, Box, Wrench, GitBranch, Radio,
  ZoomIn, ZoomOut, Maximize2,
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

interface DataFlowEdge {
  from: string;
  to: string;
  label: string;
  active: boolean;
}

interface TopologyData {
  timestamp: string;
  layers: Record<string, LayerData>;
  dataFlow: DataFlowEdge[];
}

// ============================================================================
// 节点布局配置
// ============================================================================

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
}

const NODES: NodeConfig[] = [
  { key: 'L0_contracts',  label: '数据契约层',   icon: Radio,     x: 80,  y: 40,  w: 200, h: 100, color: '#334155', activeColor: '#0ea5e9' },
  { key: 'L1_perception', label: '感知层',       icon: Activity,  x: 80,  y: 200, w: 200, h: 100, color: '#334155', activeColor: '#22c55e' },
  { key: 'L2_cognition',  label: '认知诊断层',   icon: Cpu,       x: 350, y: 200, w: 200, h: 100, color: '#334155', activeColor: '#8b5cf6' },
  { key: 'L2_guardrail',  label: '安全护栏',     icon: Shield,    x: 620, y: 200, w: 200, h: 100, color: '#334155', activeColor: '#f59e0b' },
  { key: 'L3_knowledge',  label: '知识层',       icon: BookOpen,  x: 620, y: 360, w: 200, h: 100, color: '#334155', activeColor: '#06b6d4' },
  { key: 'L4_evolution',  label: '进化层',       icon: RefreshCw, x: 350, y: 360, w: 200, h: 100, color: '#334155', activeColor: '#ec4899' },
  { key: 'L5_tooling',    label: '工具层',       icon: Wrench,    x: 80,  y: 360, w: 200, h: 100, color: '#334155', activeColor: '#14b8a6' },
  { key: 'L6_pipeline',   label: '管线层',       icon: GitBranch, x: 80,  y: 520, w: 200, h: 100, color: '#334155', activeColor: '#a855f7' },
  { key: 'L7_digitalTwin',label: '数字孪生',     icon: Box,       x: 350, y: 520, w: 200, h: 100, color: '#334155', activeColor: '#f97316' },
];

const NODE_MAP = new Map(NODES.map(n => [n.key, n]));

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
    connectorTotal: '连接器总数', connectorOnline: '在线', connectorError: '异常',
    conditionProfiles: '工况配置', samplingConfigs: '采样策略',
    activeSessions: '活跃会话', todayDiagnosis: '今日诊断', totalSessions: '总会话',
    completedSessions: '已完成', failedSessions: '失败', grokChainsTotal: 'Grok推理链', grokChainsToday: '今日推理',
    rulesTotal: '规则总数', rulesEnabled: '已启用', violationsTotal: '违规总数', violationsToday: '今日违规',
    crystals: '知识结晶', features: '特征定义', kgNodes: 'KG节点', kgEdges: 'KG关系',
    cycles: '进化周期', shadowEvals: '影子评估', championExperiments: '冠军挑战', edgeCases: '边缘案例',
    toolsRegistered: '已注册工具',
    pipelinesDefined: '管线定义', pipelineRuns: '执行次数',
    equipmentProfiles: '设备模型',
  };
  return map[key] || key;
}

// ============================================================================
// SVG 连线（带箭头 + 动画脉冲）
// ============================================================================

function FlowEdge({ edge, nodes }: { edge: DataFlowEdge; nodes: Map<string, NodeConfig> }) {
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);
  if (!from || !to) return null;

  // 计算连接点（从节点中心出发）
  const fx = from.x + from.w / 2;
  const fy = from.y + from.h / 2;
  const tx = to.x + to.w / 2;
  const ty = to.y + to.h / 2;

  // 计算控制点（贝塞尔曲线）
  const dx = tx - fx;
  const dy = ty - fy;
  const cx1 = fx + dx * 0.3;
  const cy1 = fy + dy * 0.1;
  const cx2 = fx + dx * 0.7;
  const cy2 = fy + dy * 0.9;

  const pathD = `M ${fx} ${fy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}`;
  const edgeId = `edge-${edge.from}-${edge.to}`;
  const color = edge.active ? '#3b82f6' : '#475569';
  const opacity = edge.active ? 0.8 : 0.25;

  return (
    <g>
      <defs>
        <marker
          id={`arrow-${edgeId}`}
          viewBox="0 0 10 6"
          refX="9"
          refY="3"
          markerWidth="8"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 3 L 0 6 z" fill={color} opacity={opacity} />
        </marker>
      </defs>
      {/* 底线 */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={edge.active ? 2 : 1}
        opacity={opacity}
        markerEnd={`url(#arrow-${edgeId})`}
      />
      {/* 活跃脉冲 */}
      {edge.active && (
        <circle r="4" fill={color} opacity={0.9}>
          <animateMotion dur="3s" repeatCount="indefinite" path={pathD} />
        </circle>
      )}
      {/* 标签 */}
      <text
        x={(fx + tx) / 2}
        y={(fy + ty) / 2 - 8}
        textAnchor="middle"
        fill={edge.active ? '#94a3b8' : '#475569'}
        fontSize="10"
        fontFamily="system-ui"
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

  // 取前 3 个关键指标
  const metricEntries = layer ? Object.entries(layer.metrics).slice(0, 3) : [];

  return (
    <g
      className="cursor-pointer"
      onClick={() => onSelect(config.key)}
      style={{ transition: 'all 0.2s' }}
    >
      {/* 外发光（活跃时） */}
      {isActive && (
        <rect
          x={config.x - 3}
          y={config.y - 3}
          width={config.w + 6}
          height={config.h + 6}
          rx={10}
          fill="none"
          stroke={config.activeColor}
          strokeWidth={1.5}
          opacity={0.3}
        >
          <animate attributeName="opacity" values="0.3;0.6;0.3" dur="2s" repeatCount="indefinite" />
        </rect>
      )}

      {/* 节点背景 */}
      <rect
        x={config.x}
        y={config.y}
        width={config.w}
        height={config.h}
        rx={8}
        fill={selected ? '#1e293b' : '#0f172a'}
        stroke={borderColor}
        strokeWidth={selected ? 2.5 : 1.5}
      />

      {/* 状态指示灯 */}
      <circle
        cx={config.x + config.w - 14}
        cy={config.y + 14}
        r={5}
        fill={statusColor}
      >
        {isActive && (
          <animate attributeName="r" values="5;6;5" dur="1.5s" repeatCount="indefinite" />
        )}
      </circle>

      {/* 图标 */}
      <foreignObject x={config.x + 12} y={config.y + 10} width={24} height={24}>
        <Icon size={20} color={isActive ? config.activeColor : '#64748b'} />
      </foreignObject>

      {/* 标题 */}
      <text
        x={config.x + 42}
        y={config.y + 26}
        fill={isActive ? '#f1f5f9' : '#94a3b8'}
        fontSize="13"
        fontWeight="600"
        fontFamily="system-ui"
      >
        {config.label}
      </text>

      {/* 状态标签 */}
      <text
        x={config.x + config.w - 28}
        y={config.y + 26}
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
            x={config.x + 14}
            y={config.y + 48 + i * 16}
            fill="#64748b"
            fontSize="10"
            fontFamily="system-ui"
          >
            {formatMetricLabel(key)}
          </text>
          <text
            x={config.x + config.w - 14}
            y={config.y + 48 + i * 16}
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

  return (
    <Card className="absolute top-4 right-4 w-80 z-10 bg-card/95 backdrop-blur-sm border-border/50">
      <CardContent className="pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <config.icon size={18} style={{ color: config.activeColor }} />
            <span className="font-semibold text-sm text-foreground">{config.label}</span>
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
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getStatusColor(c.status) }}
                  />
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
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // 实时数据查询（5秒轮询）
  const topologyQuery = trpc.evoCognition.getTopologyStatus.useQuery(undefined, {
    refetchInterval: 5000,
    retry: 2,
  });

  const data = topologyQuery.data as TopologyData | null;
  const layers = data?.layers ?? {};
  const dataFlow = data?.dataFlow ?? [];

  const handleNodeSelect = useCallback((key: string) => {
    setSelectedNode(prev => prev === key ? null : key);
  }, []);

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z + 0.15, 2)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(z - 0.15, 0.5)), []);
  const handleZoomReset = useCallback(() => setZoom(1), []);

  // 计算活跃数据流数量
  const activeFlows = dataFlow.filter(e => e.active).length;
  const totalFlows = dataFlow.length;
  const layerCount = Object.keys(layers).length;
  const onlineLayers = Object.values(layers).filter(l => l.status === 'online' || l.status === 'active').length;

  return (
    <div className="space-y-4">
      {/* 顶部状态栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${data ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-muted-foreground">
              {data ? `实时数据 · ${new Date(data.timestamp).toLocaleTimeString()}` : '连接中...'}
            </span>
          </div>
          <Badge variant="outline" className="text-xs">
            {onlineLayers}/{layerCount} 层在线
          </Badge>
          <Badge variant="outline" className="text-xs">
            {activeFlows}/{totalFlows} 数据流活跃
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
      <div ref={containerRef} className="relative bg-slate-950 rounded-lg border border-border/30 overflow-hidden" style={{ height: 660 }}>
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
          viewBox="0 0 900 660"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.2s' }}
        >
          {/* 网格背景 */}
          <defs>
            <pattern id="topo-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="900" height="660" fill="url(#topo-grid)" />

          {/* 层级标签 */}
          <text x="30" y="30" fill="#334155" fontSize="10" fontFamily="system-ui" fontWeight="600">L0</text>
          <text x="30" y="190" fill="#334155" fontSize="10" fontFamily="system-ui" fontWeight="600">L1-L2</text>
          <text x="30" y="350" fill="#334155" fontSize="10" fontFamily="system-ui" fontWeight="600">L3-L5</text>
          <text x="30" y="510" fill="#334155" fontSize="10" fontFamily="system-ui" fontWeight="600">L6-L7</text>

          {/* 数据流连线 */}
          {dataFlow.map((edge, i) => (
            <FlowEdge key={i} edge={edge} nodes={NODE_MAP} />
          ))}

          {/* 节点 */}
          {NODES.map(nodeConfig => (
            <TopologyNode
              key={nodeConfig.key}
              config={nodeConfig}
              layer={layers[nodeConfig.key] ?? null}
              onSelect={handleNodeSelect}
              selected={selectedNode === nodeConfig.key}
            />
          ))}

          {/* 闭环反馈标注 */}
          <text x="200" y="310" fill="#ec4899" fontSize="9" fontFamily="system-ui" opacity={0.6} textAnchor="middle">
            ↻ 闭环反馈
          </text>
        </svg>

        {/* 节点详情面板 */}
        {selectedNode && layers[selectedNode] && (
          <NodeDetailPanel
            nodeKey={selectedNode}
            layer={layers[selectedNode]}
            onClose={() => setSelectedNode(null)}
          />
        )}

        {/* 图例 */}
        <div className="absolute bottom-3 left-3 flex items-center gap-4 text-xs text-muted-foreground bg-slate-950/80 px-3 py-1.5 rounded">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>在线/活跃</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span>降级</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span>异常</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-slate-500" />
            <span>空闲</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-8 h-0.5 bg-blue-500" />
            <span>活跃数据流</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-8 h-0.5 bg-slate-600" />
            <span>非活跃</span>
          </div>
        </div>
      </div>
    </div>
  );
}
