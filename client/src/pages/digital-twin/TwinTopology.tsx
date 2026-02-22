/**
 * ============================================================================
 * 数字孪生 — 运行逻辑拓扑图
 * ============================================================================
 *
 * 展示数字孪生系统的完整执行链路：
 *
 *   传感器层 → 数据同步层 → 世界模型层 → 认知引擎层 → 事件分发层
 *
 * 节点：
 *   1. 传感器/边缘网关（数据源）
 *   2. CDC 实时同步 / Polling 轮询同步
 *   3. StateSyncEngine（状态同步引擎）
 *   4. WorldModel（世界模型）
 *   5. PhysicsValidator（物理校验器）
 *   6. UncertaintyQuantifier（不确定性量化）
 *   7. RULPredictor（剩余寿命预测）
 *   8. SimulationEngine（仿真推演引擎）
 *   9. TwinEventBus（事件总线）
 *  10. OutboxRelay（事务发件箱）
 *
 * 纯 SVG 实现，与 CognitiveTopology 风格一致。
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

// ============================================================================
// 节点配置
// ============================================================================
interface TopoNode {
  id: string;
  label: string;
  sublabel: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;       // 边框/高亮色
  bgColor: string;     // 背景色
  icon: string;         // emoji
  layer: string;        // 所属层
  tables: string[];     // 关联的数据库表
  description: string;  // 功能说明
}

interface TopoEdge {
  from: string;
  to: string;
  label: string;
  color: string;
  dashed?: boolean;
}

// 画布尺寸
const CW = 1200;
const CH = 720;

// 5 层布局：从左到右
const LAYER_X = [40, 260, 480, 700, 960];
const LAYER_LABELS = ['数据采集层', '同步引擎层', '世界模型层', '认知推理层', '事件分发层'];
const LAYER_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444'];

const NODES: TopoNode[] = [
  // Layer 0: 数据采集层
  {
    id: 'sensor', label: '传感器/边缘网关', sublabel: 'Edge Gateway',
    x: LAYER_X[0], y: 120, w: 180, h: 100,
    color: '#3b82f6', bgColor: '#1e3a5f', icon: '📡',
    layer: '数据采集', tables: ['realtime_telemetry', 'edge_gateways', 'edge_gateway_config', 'sensor_calibrations'],
    description: '物理传感器通过边缘网关采集振动、温度、压力等实时遥测数据，经 Kafka 推送至平台',
  },
  {
    id: 'clickhouse', label: 'ClickHouse 时序库', sublabel: 'portai_timeseries',
    x: LAYER_X[0], y: 300, w: 180, h: 100,
    color: '#f59e0b', bgColor: '#3d2e0a', icon: '🗄️',
    layer: '数据采集', tables: ['sensor_data_raw', 'vibration_features_1min', 'device_health_hourly'],
    description: '高频时序数据存储引擎，通过 Kafka Engine + 物化视图实现实时 ETL 和多级聚合',
  },
  {
    id: 'equipment', label: '设备画像', sublabel: 'Equipment Profile',
    x: LAYER_X[0], y: 480, w: 180, h: 100,
    color: '#10b981', bgColor: '#0a3d2e', icon: '🏭',
    layer: '数据采集', tables: ['equipment_profiles', 'asset_nodes', 'asset_sensors', 'device_sampling_config'],
    description: '设备静态属性、资产树结构、传感器配置和采样策略',
  },

  // Layer 1: 同步引擎层
  {
    id: 'cdc', label: 'CDC 实时同步', sublabel: 'Change Data Capture',
    x: LAYER_X[1], y: 140, w: 180, h: 80,
    color: '#8b5cf6', bgColor: '#2d1b69', icon: '⚡',
    layer: '同步引擎', tables: ['twin_sync_logs'],
    description: '基于 Debezium CDC 的实时数据变更捕获，毫秒级延迟同步传感器数据到孪生实例',
  },
  {
    id: 'polling', label: 'Polling 轮询同步', sublabel: 'Fallback Mode',
    x: LAYER_X[1], y: 280, w: 180, h: 80,
    color: '#8b5cf6', bgColor: '#2d1b69', icon: '🔄',
    layer: '同步引擎', tables: ['twin_sync_logs'],
    description: 'CDC 降级时的备用同步模式，通过定时轮询保证数据最终一致性',
  },
  {
    id: 'statesync', label: 'StateSyncEngine', sublabel: '状态同步引擎',
    x: LAYER_X[1], y: 440, w: 180, h: 100,
    color: '#8b5cf6', bgColor: '#2d1b69', icon: '🔗',
    layer: '同步引擎', tables: ['twin_sync_logs', 'state_vector_logs', 'state_vector_dimensions'],
    description: '统一管理 CDC/Polling 双通道，自动降级切换，合成多维状态向量，驱动世界模型更新',
  },

  // Layer 2: 世界模型层
  {
    id: 'worldmodel', label: 'WorldModel', sublabel: '世界模型',
    x: LAYER_X[2], y: 180, w: 180, h: 120,
    color: '#06b6d4', bgColor: '#0a2d3d', icon: '🌍',
    layer: '世界模型', tables: ['world_model_snapshots', 'world_model_predictions', 'condition_profiles', 'condition_baselines'],
    description: '设备数字孪生核心：维护状态向量、物理约束、状态转移概率，生成健康指数和预测',
  },
  {
    id: 'physics', label: 'PhysicsValidator', sublabel: '物理校验器',
    x: LAYER_X[2], y: 400, w: 180, h: 100,
    color: '#06b6d4', bgColor: '#0a2d3d', icon: '⚖️',
    layer: '世界模型', tables: ['diagnosis_physics_formulas', 'bpa_configs'],
    description: '基于物理方程验证传感器数据合理性，检测异常值和物理违规（如温度超出热力学范围）',
  },

  // Layer 3: 认知推理层
  {
    id: 'uncertainty', label: 'UncertaintyQuantifier', sublabel: '不确定性量化',
    x: LAYER_X[3], y: 100, w: 180, h: 80,
    color: '#f59e0b', bgColor: '#3d2e0a', icon: '📊',
    layer: '认知推理', tables: ['cognition_sessions', 'cognition_dimension_results'],
    description: '量化预测结果的置信区间，基于蒙特卡洛采样和贝叶斯推断评估不确定性',
  },
  {
    id: 'rul', label: 'RULPredictor', sublabel: '剩余寿命预测',
    x: LAYER_X[3], y: 240, w: 180, h: 80,
    color: '#f59e0b', bgColor: '#3d2e0a', icon: '⏳',
    layer: '认知推理', tables: ['reasoning_decision_logs', 'reasoning_experiences'],
    description: '基于退化模型和状态向量趋势，预测设备剩余使用寿命（RUL），输出置信区间和退化因素',
  },
  {
    id: 'simulation', label: 'SimulationEngine', sublabel: '仿真推演引擎',
    x: LAYER_X[3], y: 380, w: 180, h: 80,
    color: '#f59e0b', bgColor: '#3d2e0a', icon: '🧪',
    layer: '认知推理', tables: ['simulation_scenarios', 'simulation_results'],
    description: '蒙特卡洛仿真推演：注入故障场景，模拟状态演化轨迹，评估风险等级和维护建议',
  },
  {
    id: 'causal', label: '因果推理引擎', sublabel: 'Causal Reasoning',
    x: LAYER_X[3], y: 520, w: 180, h: 80,
    color: '#f59e0b', bgColor: '#3d2e0a', icon: '🔬',
    layer: '认知推理', tables: ['causal_nodes', 'causal_edges', 'shadow_reasoning_comparisons'],
    description: '基于因果图的根因分析，结合 Champion/Challenger 影子评估对比推理结果',
  },

  // Layer 4: 事件分发层
  {
    id: 'eventbus', label: 'TwinEventBus', sublabel: '事件总线',
    x: LAYER_X[4], y: 180, w: 180, h: 100,
    color: '#ef4444', bgColor: '#3d0a0a', icon: '📢',
    layer: '事件分发', tables: ['twin_events'],
    description: '解耦各子模块通信，通过 Redis Pub/Sub 实现跨节点事件分发，事件持久化支持回放',
  },
  {
    id: 'outbox', label: 'OutboxRelay', sublabel: '事务发件箱',
    x: LAYER_X[4], y: 380, w: 180, h: 100,
    color: '#ef4444', bgColor: '#3d0a0a', icon: '📤',
    layer: '事件分发', tables: ['twin_outbox', 'outbox_events', 'outbox_routing_config'],
    description: 'Outbox Pattern 实现事务性事件发布，确保业务操作与事件发送的原子性，支持重试和死信',
  },
];

// 数据流边
const EDGES: TopoEdge[] = [
  // 数据采集 → 同步引擎
  { from: 'sensor', to: 'cdc', label: 'Kafka CDC', color: '#3b82f6' },
  { from: 'sensor', to: 'polling', label: '定时拉取', color: '#3b82f6', dashed: true },
  { from: 'clickhouse', to: 'statesync', label: '聚合特征', color: '#f59e0b' },
  { from: 'equipment', to: 'statesync', label: '设备配置', color: '#10b981' },
  { from: 'cdc', to: 'statesync', label: '实时数据', color: '#8b5cf6' },
  { from: 'polling', to: 'statesync', label: '轮询数据', color: '#8b5cf6', dashed: true },

  // 同步引擎 → 世界模型
  { from: 'statesync', to: 'worldmodel', label: '状态向量', color: '#06b6d4' },
  { from: 'statesync', to: 'physics', label: '原始数据', color: '#06b6d4' },

  // 世界模型 → 认知推理
  { from: 'worldmodel', to: 'uncertainty', label: '预测结果', color: '#f59e0b' },
  { from: 'worldmodel', to: 'rul', label: '退化趋势', color: '#f59e0b' },
  { from: 'worldmodel', to: 'simulation', label: '初始状态', color: '#f59e0b' },
  { from: 'physics', to: 'worldmodel', label: '校验反馈', color: '#06b6d4' },
  { from: 'physics', to: 'causal', label: '物理违规', color: '#06b6d4' },

  // 认知推理 → 事件总线
  { from: 'uncertainty', to: 'eventbus', label: '异常预警', color: '#ef4444' },
  { from: 'rul', to: 'eventbus', label: 'RUL 更新', color: '#ef4444' },
  { from: 'simulation', to: 'eventbus', label: '仿真完成', color: '#ef4444' },
  { from: 'causal', to: 'eventbus', label: '根因结论', color: '#ef4444' },

  // 事件总线 → Outbox
  { from: 'eventbus', to: 'outbox', label: 'Outbox 持久化', color: '#ef4444' },

  // 反馈回路
  { from: 'worldmodel', to: 'eventbus', label: '快照事件', color: '#06b6d4' },
];

// ============================================================================
// 节点 ID → 节点配置 Map
// ============================================================================
const NODE_MAP = new Map(NODES.map(n => [n.id, n]));

// ============================================================================
// SVG 箭头路径计算
// ============================================================================
function calcEdgePath(from: TopoNode, to: TopoNode): { path: string; midX: number; midY: number } {
  // 计算中心点
  const fx = from.x + from.w / 2;
  const fy = from.y + from.h / 2;
  const tx = to.x + to.w / 2;
  const ty = to.y + to.h / 2;

  // 计算连接点（从边缘出发）
  let startX: number, startY: number, endX: number, endY: number;

  if (Math.abs(tx - fx) > Math.abs(ty - fy)) {
    // 水平为主
    if (tx > fx) {
      startX = from.x + from.w;
      endX = to.x;
    } else {
      startX = from.x;
      endX = to.x + to.w;
    }
    startY = fy;
    endY = ty;
  } else {
    // 垂直为主
    startX = fx;
    endX = tx;
    if (ty > fy) {
      startY = from.y + from.h;
      endY = to.y;
    } else {
      startY = from.y;
      endY = to.y + to.h;
    }
  }

  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;

  // 贝塞尔曲线
  const cx1 = startX + (endX - startX) * 0.4;
  const cy1 = startY;
  const cx2 = startX + (endX - startX) * 0.6;
  const cy2 = endY;

  const path = `M ${startX} ${startY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${endX} ${endY}`;
  return { path, midX, midY };
}

// ============================================================================
// 主组件
// ============================================================================
export default function TwinTopology({ equipmentId }: { equipmentId: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // 高亮与选中节点关联的边
  const highlightedEdges = useMemo(() => {
    if (!selectedNode) return new Set<number>();
    const set = new Set<number>();
    EDGES.forEach((e, i) => {
      if (e.from === selectedNode || e.to === selectedNode) set.add(i);
    });
    return set;
  }, [selectedNode]);

  // 缩放
  const handleZoom = useCallback((delta: number) => {
    setScale(s => Math.max(0.4, Math.min(1.5, s + delta)));
  }, []);

  // 拖拽
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === 'svg') {
      isDragging.current = true;
      dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging.current) {
      setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // 滚轮缩放
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      handleZoom(e.deltaY > 0 ? -0.05 : 0.05);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [handleZoom]);

  // 重置视图
  const resetView = useCallback(() => {
    setScale(0.85);
    setPan({ x: 0, y: 0 });
    setSelectedNode(null);
  }, []);

  const selectedNodeData = selectedNode ? NODE_MAP.get(selectedNode) : null;

  return (
    <div className="space-y-2">
      {/* 控制栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-foreground">🔮 数字孪生运行逻辑</span>
          <Badge variant="outline" className="text-[9px]">{NODES.length} 节点</Badge>
          <Badge variant="outline" className="text-[9px]">{EDGES.length} 数据流</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleZoom(0.1)}>
            <ZoomIn size={12} />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleZoom(-0.1)}>
            <ZoomOut size={12} />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={resetView}>
            <Maximize2 size={12} />
          </Button>
          <span className="text-[9px] text-muted-foreground ml-1">{Math.round(scale * 100)}%</span>
        </div>
      </div>

      {/* 图例 */}
      <div className="flex items-center gap-3 flex-wrap">
        {LAYER_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: LAYER_COLORS[i] }} />
            <span className="text-[9px] text-muted-foreground">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 ml-2">
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#64748b" strokeWidth="1.5" /></svg>
          <span className="text-[9px] text-muted-foreground">实时流</span>
        </div>
        <div className="flex items-center gap-1">
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#64748b" strokeWidth="1.5" strokeDasharray="3,2" /></svg>
          <span className="text-[9px] text-muted-foreground">降级/备用</span>
        </div>
      </div>

      {/* SVG 画布 */}
      <div
        ref={containerRef}
        className="relative bg-background/50 border border-border rounded-lg overflow-hidden"
        style={{ height: '520px', cursor: isDragging.current ? 'grabbing' : 'grab' }}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${CW} ${CH}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ userSelect: 'none' }}
        >
          <defs>
            {/* 箭头标记 */}
            <marker id="arrow" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
              <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
            </marker>
            <marker id="arrow-highlight" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
              <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b" />
            </marker>
            {/* 发光滤镜 */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
            {/* 层背景 */}
            {LAYER_LABELS.map((label, i) => (
              <g key={label}>
                <rect
                  x={LAYER_X[i] - 15}
                  y={60}
                  width={210}
                  height={CH - 100}
                  rx={8}
                  fill={LAYER_COLORS[i]}
                  fillOpacity={0.04}
                  stroke={LAYER_COLORS[i]}
                  strokeOpacity={0.15}
                  strokeWidth={1}
                />
                <text
                  x={LAYER_X[i] + 90}
                  y={85}
                  fill={LAYER_COLORS[i]}
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="system-ui"
                  textAnchor="middle"
                  opacity={0.7}
                >
                  {label}
                </text>
              </g>
            ))}

            {/* 数据流边 */}
            {EDGES.map((edge, i) => {
              const fromNode = NODE_MAP.get(edge.from);
              const toNode = NODE_MAP.get(edge.to);
              if (!fromNode || !toNode) return null;
              const { path, midX, midY } = calcEdgePath(fromNode, toNode);
              const isHighlighted = highlightedEdges.has(i) || hoveredEdge === i;
              const isActive = selectedNode ? highlightedEdges.has(i) : true;

              return (
                <g
                  key={i}
                  onMouseEnter={() => setHoveredEdge(i)}
                  onMouseLeave={() => setHoveredEdge(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <path
                    d={path}
                    fill="none"
                    stroke={isHighlighted ? edge.color : '#475569'}
                    strokeWidth={isHighlighted ? 2 : 1.2}
                    strokeDasharray={edge.dashed ? '6,3' : undefined}
                    strokeOpacity={isActive ? (isHighlighted ? 1 : 0.5) : 0.15}
                    markerEnd={isHighlighted ? 'url(#arrow-highlight)' : 'url(#arrow)'}
                  />
                  {/* 边标签 */}
                  {isHighlighted && (
                    <g>
                      <rect
                        x={midX - 30}
                        y={midY - 8}
                        width={60}
                        height={14}
                        rx={3}
                        fill="#0f172a"
                        fillOpacity={0.9}
                        stroke={edge.color}
                        strokeWidth={0.5}
                      />
                      <text
                        x={midX}
                        y={midY + 3}
                        fill="#e2e8f0"
                        fontSize="8"
                        fontFamily="system-ui"
                        textAnchor="middle"
                      >
                        {edge.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* 节点 */}
            {NODES.map(node => {
              const isSelected = selectedNode === node.id;
              const isConnected = selectedNode ? highlightedEdges.size > 0 && EDGES.some((e, i) => highlightedEdges.has(i) && (e.from === node.id || e.to === node.id)) : true;
              const opacity = selectedNode ? (isSelected || isConnected ? 1 : 0.3) : 1;

              return (
                <g
                  key={node.id}
                  onClick={(e) => { e.stopPropagation(); setSelectedNode(selectedNode === node.id ? null : node.id); }}
                  style={{ cursor: 'pointer', opacity }}
                >
                  {/* 选中发光 */}
                  {isSelected && (
                    <rect
                      x={node.x - 3}
                      y={node.y - 3}
                      width={node.w + 6}
                      height={node.h + 6}
                      rx={10}
                      fill="none"
                      stroke={node.color}
                      strokeWidth={2}
                      filter="url(#glow)"
                      opacity={0.6}
                    />
                  )}
                  {/* 背景 */}
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.w}
                    height={node.h}
                    rx={8}
                    fill={node.bgColor}
                    stroke={node.color}
                    strokeWidth={isSelected ? 2 : 1}
                    strokeOpacity={isSelected ? 1 : 0.6}
                  />
                  {/* Icon + 标题 */}
                  <text
                    x={node.x + 10}
                    y={node.y + 20}
                    fill="#e2e8f0"
                    fontSize="12"
                    fontWeight="600"
                    fontFamily="system-ui"
                  >
                    {node.icon} {node.label}
                  </text>
                  {/* 副标题 */}
                  <text
                    x={node.x + 10}
                    y={node.y + 36}
                    fill="#94a3b8"
                    fontSize="9"
                    fontFamily="system-ui"
                  >
                    {node.sublabel}
                  </text>
                  {/* 关联表数量 */}
                  <text
                    x={node.x + node.w - 10}
                    y={node.y + node.h - 10}
                    fill={node.color}
                    fontSize="9"
                    fontFamily="system-ui"
                    textAnchor="end"
                    opacity={0.7}
                  >
                    {node.tables.length} 表
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* 节点详情面板 */}
        {selectedNodeData && (
          <div className="absolute top-2 right-2 w-72 bg-card/95 backdrop-blur-sm border border-border rounded-lg p-3 z-10 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-base">{selectedNodeData.icon}</span>
                <span className="text-xs font-semibold text-foreground">{selectedNodeData.label}</span>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                ✕
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">
              {selectedNodeData.description}
            </p>
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-foreground">关联数据库表：</span>
              <div className="flex flex-wrap gap-1">
                {selectedNodeData.tables.map(t => (
                  <Badge key={t} variant="outline" className="text-[8px] px-1.5 py-0 font-mono">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-border/50">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">所属层：</span>
                <Badge variant="secondary" className="text-[8px]">{selectedNodeData.layer}</Badge>
              </div>
              {/* 连接的数据流 */}
              <div className="mt-1.5 space-y-0.5">
                <span className="text-[10px] text-muted-foreground">数据流：</span>
                {EDGES.filter(e => e.from === selectedNode || e.to === selectedNode).map((e, i) => {
                  const isIncoming = e.to === selectedNode;
                  const otherNode = NODE_MAP.get(isIncoming ? e.from : e.to);
                  return (
                    <div key={i} className="flex items-center gap-1 text-[9px]">
                      <span className={isIncoming ? 'text-green-400' : 'text-orange-400'}>
                        {isIncoming ? '← 入' : '→ 出'}
                      </span>
                      <span className="text-foreground">{e.label}</span>
                      <span className="text-muted-foreground">
                        {isIncoming ? `来自 ${otherNode?.label}` : `到 ${otherNode?.label}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
