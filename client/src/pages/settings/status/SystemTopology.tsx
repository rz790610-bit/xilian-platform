import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import { 
  Plus, Trash2, RefreshCw, Save, Download, Upload, 
  ZoomIn, ZoomOut, Maximize2, Move, Link2, Unlink,
  Settings2, Activity, Server, Database, Cpu, Network
} from 'lucide-react';

// 节点类型定义
interface TopoNode {
  id: number;
  nodeId: string;
  name: string;
  type: 'source' | 'plugin' | 'engine' | 'agent' | 'output' | 'database' | 'service';
  icon: string | null;
  description: string | null;
  status: 'online' | 'offline' | 'error' | 'maintenance';
  x: number;
  y: number;
  config: Record<string, unknown> | null;
  metrics: { cpu?: number; memory?: number; latency?: number; throughput?: number } | null;
  lastHeartbeat: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// 连接类型定义
interface TopoEdge {
  id: number;
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: 'data' | 'dependency' | 'control';
  label: string | null;
  config: { bandwidth?: number; latency?: number; protocol?: string } | null;
  status: 'active' | 'inactive' | 'error';
  createdAt: Date;
  updatedAt: Date;
}

// 节点类型配置
const nodeTypeConfig = {
  source: { label: '数据源', icon: '📡', color: 'oklch(0.65 0.18 145)' },
  plugin: { label: '插件', icon: '🔌', color: 'oklch(0.65 0.18 240)' },
  engine: { label: '引擎', icon: '🤖', color: 'oklch(0.65 0.18 290)' },
  agent: { label: '智能体', icon: '🧠', color: 'oklch(0.65 0.18 30)' },
  output: { label: '输出', icon: '📝', color: 'oklch(0.65 0.18 60)' },
  database: { label: '数据库', icon: '🗄️', color: 'oklch(0.65 0.18 180)' },
  service: { label: '服务', icon: '⚙️', color: 'oklch(0.65 0.18 330)' },
};

export default function SystemTopology() {
  const toast = useToast();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 状态
  const [viewMode, setViewMode] = useState<'all' | 'data' | 'dependency' | 'control'>('all');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<TopoNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<TopoEdge | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectSource, setConnectSource] = useState<string | null>(null);
  
  // 弹窗状态
  const [showAddNodeDialog, setShowAddNodeDialog] = useState(false);
  const [showAddEdgeDialog, setShowAddEdgeDialog] = useState(false);
  const [showNodeDetailDialog, setShowNodeDetailDialog] = useState(false);
  const [showSaveLayoutDialog, setShowSaveLayoutDialog] = useState(false);
  
  // 表单状态
  const [newNode, setNewNode] = useState({
    name: '',
    type: 'plugin' as TopoNode['type'],
    icon: '📦',
    description: '',
  });
  const [newEdge, setNewEdge] = useState({
    sourceNodeId: '',
    targetNodeId: '',
    type: 'data' as TopoEdge['type'],
    label: '',
  });
  const [layoutName, setLayoutName] = useState('');
  
  // 自动刷新状态
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(10); // 秒
  const [isPanningCanvas, setIsPanningCanvas] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [hasFittedView, setHasFittedView] = useState(false);
  const [lastStateHash, setLastStateHash] = useState<string>('');
  const [statusChanged, setStatusChanged] = useState(false);
  
  // tRPC 查询 - 使用快照API支持变化检测
  const { data: topologyData, refetch: refetchTopology, isLoading } = trpc.topology.getTopologySnapshot.useQuery(
    undefined,
    {
      refetchInterval: autoRefresh ? refreshInterval * 1000 : false,
      refetchIntervalInBackground: true,
    }
  );
  const { data: layouts } = trpc.topology.getLayouts.useQuery();
  const { data: servicesSummary, refetch: refetchServices } = trpc.topology.getServicesSummary.useQuery(
    undefined,
    { refetchInterval: autoRefresh ? refreshInterval * 1000 : false }
  );
  
  // 手动触发健康检查
  const checkHealthMutation = trpc.topology.checkServicesHealth.useMutation({
    onSuccess: (result) => {
      const onlineCount = (result.results || []).filter(r => r.online).length;
      toast.success(`健康检查完成: ${onlineCount}/${result.results.length} 服务在线`);
      refetchTopology();
      refetchServices();
    },
    onError: (err) => toast.error(`检查失败: ${err.message}`),
  });
  
  // 检测状态变化
  useEffect(() => {
    if (topologyData?.stateHash && lastStateHash && topologyData.stateHash !== lastStateHash) {
      setStatusChanged(true);
      toast.info('拓扑状态已更新');
      setTimeout(() => setStatusChanged(false), 2000);
    }
    if (topologyData?.stateHash) {
      setLastStateHash(topologyData.stateHash);
    }
  }, [topologyData?.stateHash]);
  
  // tRPC 变更
  const createNodeMutation = trpc.topology.createNode.useMutation({
    onSuccess: () => {
      toast.success('节点创建成功');
      refetchTopology();
      setShowAddNodeDialog(false);
      setNewNode({ name: '', type: 'plugin', icon: '📦', description: '' });
    },
    onError: (err) => toast.error(`创建失败: ${err.message}`),
  });
  
  const updateNodePositionMutation = trpc.topology.updateNodePosition.useMutation({
    onError: (err) => console.error('更新位置失败:', err),
  });

  // ST-1 修复：添加批量位置更新接口
  const updateNodePositionsMutation = trpc.topology.updateNodePositions.useMutation({
    onError: (err) => console.error('批量更新位置失败:', err),
  });
  
  const updateNodeStatusMutation = trpc.topology.updateNodeStatus.useMutation({
    onSuccess: () => {
      toast.success('状态已更新');
      refetchTopology();
    },
  });
  
  const deleteNodeMutation = trpc.topology.deleteNode.useMutation({
    onSuccess: () => {
      toast.success('节点已删除');
      refetchTopology();
      setSelectedNode(null);
    },
  });
  
  const createEdgeMutation = trpc.topology.createEdge.useMutation({
    onSuccess: () => {
      toast.success('连接创建成功');
      refetchTopology();
      setShowAddEdgeDialog(false);
      setNewEdge({ sourceNodeId: '', targetNodeId: '', type: 'data', label: '' });
    },
  });
  
  const deleteEdgeMutation = trpc.topology.deleteEdge.useMutation({
    onSuccess: () => {
      toast.success('连接已删除');
      refetchTopology();
      setSelectedEdge(null);
    },
  });
  
  const saveLayoutMutation = trpc.topology.saveLayout.useMutation({
    onSuccess: () => {
      toast.success('布局已保存');
      setShowSaveLayoutDialog(false);
      setLayoutName('');
    },
  });
  
  const resetTopologyMutation = trpc.topology.resetToDefault.useMutation({
    onSuccess: () => {
      toast.success('已重置为默认拓扑');
      refetchTopology();
    },
  });

  // 自动发现并生成拓扑
  const autoDiscoverMutation = trpc.topology.autoDiscover.useMutation({
    onSuccess: (result) => {
      const onlineServices = (result.discovered || []).filter(s => s.online).length;
      toast.success(`自动发现完成: 发现 ${onlineServices} 个在线服务\n新增 ${result.nodesCreated} 个节点, ${result.edgesCreated} 个连接`);
      refetchTopology();
    },
    onError: (err) => toast.error(`自动发现失败: ${err.message}`),
  });

  // 重新生成拓扑（清空后重建）
  const regenerateMutation = trpc.topology.regenerate.useMutation({
    onSuccess: (result) => {
      const onlineServices = (result.discovered || []).filter(s => s.online).length;
      toast.success(`拓扑已重新生成: 发现 ${onlineServices} 个在线服务\n创建 ${result.nodesCreated} 个节点, ${result.edgesCreated} 个连接`);
      refetchTopology();
    },
    onError: (err) => toast.error(`重新生成失败: ${err.message}`),
  });

  // 智能重新布局
  const autoLayoutMutation = trpc.topology.autoLayout.useMutation({
    onSuccess: () => {
      toast.success('已按类型自动重新布局');
      refetchTopology();
    },
    onError: (err) => toast.error(`自动布局失败: ${err.message}`),
  });
  
  // ST-2 修复：使用本地 state 管理拖拽中的节点位置，避免直接修改 React Query 缓存
  const [localNodes, setLocalNodes] = useState<TopoNode[]>([]);
  const edges = topologyData?.edges || [];

  // 当后端数据更新时同步到本地（仅在非拖拽时）
  useEffect(() => {
    if (!isDragging && topologyData?.nodes) {
      setLocalNodes(topologyData.nodes as TopoNode[]);
    }
  }, [topologyData?.nodes, isDragging]);

  const nodes = localNodes;
  
  // 适应画布：计算所有节点包围盒，自动调整zoom和pan使节点居中
  const fitToView = useCallback(() => {
    if (!nodes.length || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const cw = containerRect.width;
    const ch = containerRect.height;
    if (cw === 0 || ch === 0) return;
    
    const NODE_W = 120, NODE_H = 60, PADDING = 80;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_W);
      maxY = Math.max(maxY, n.y + NODE_H);
    }
    const bw = maxX - minX + PADDING * 2;
    const bh = maxY - minY + PADDING * 2;
    const newZoom = Math.max(0.25, Math.min(1.5, Math.min(cw / bw, ch / bh)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setPan({
      x: (cw / 2 / newZoom) - centerX,
      y: (ch / 2 / newZoom) - centerY,
    });
    setZoom(newZoom);
  }, [nodes]);
  
  // 数据首次加载后自动居中
  useEffect(() => {
    if (nodes.length > 0 && !hasFittedView) {
      // 延迟一帧确保容器已渲染
      requestAnimationFrame(() => {
        fitToView();
        setHasFittedView(true);
      });
    }
  }, [nodes.length, hasFittedView, fitToView]);
  
  // 过滤显示的连接
  const visibleEdges = viewMode === 'all' 
    ? edges 
    : (edges || []).filter(e => e.type === viewMode);
  
  // ============================================================
  // 拖拽系统 — 使用 useRef 存储拖拽状态，避免闭包陈旧值
  // ============================================================
  const dragStateRef = useRef({
    dragNode: null as string | null,
    dragOffset: { x: 0, y: 0 },
    // 多选拖动时记录每个选中节点的初始位置
    initialPositions: new Map<string, { x: number; y: number }>(),
    // 鼠标按下时的初始世界坐标
    startWorldPos: { x: 0, y: 0 },
  });
  const nodeRafRef = useRef<number | null>(null);
  const canvasRafRef = useRef<number | null>(null);
  
  // 同步 zoom/pan 到 ref（供 rAF 回调读取）
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);
  
  const selectedNodesRef = useRef(selectedNodes);
  useEffect(() => { selectedNodesRef.current = selectedNodes; }, [selectedNodes]);

  // 处理节点拖拽（支持多选整体拖动）
  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (isConnecting) {
      if (connectSource && connectSource !== nodeId) {
        setNewEdge({
          sourceNodeId: connectSource,
          targetNodeId: nodeId,
          type: 'data',
          label: '',
        });
        setShowAddEdgeDialog(true);
        setIsConnecting(false);
        setConnectSource(null);
      } else {
        setConnectSource(nodeId);
      }
      return;
    }
    
    // Ctrl/Meta + 点击：切换多选
    if (e.ctrlKey || e.metaKey) {
      setSelectedNodes(prev => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
      });
      return;
    }
    
    const node = (nodes || []).find(n => n.nodeId === nodeId);
    if (!node) return;
    
    const svg = svgRef.current;
    if (!svg) return;
    
    const rect = svg.getBoundingClientRect();
    const worldX = (e.clientX - rect.left) / zoom - pan.x;
    const worldY = (e.clientY - rect.top) / zoom - pan.y;
    
    // 如果拖动的节点在多选集中，整体拖动；否则清空多选只拖单个
    if (!selectedNodes.has(nodeId)) {
      setSelectedNodes(new Set());
    }
    
    // 记录初始状态到 ref（不依赖 useState 的异步更新）
    const ds = dragStateRef.current;
    ds.dragNode = nodeId;
    ds.dragOffset = { x: worldX - node.x, y: worldY - node.y };
    ds.startWorldPos = { x: worldX, y: worldY };
    
    // 记录所有选中节点的初始位置（用于多选整体拖动）
    ds.initialPositions.clear();
    const activeSelection = selectedNodes.has(nodeId) ? selectedNodes : new Set<string>();
    if (activeSelection.size > 0) {
      for (const nid of activeSelection) {
        const n = nodes.find(nd => nd.nodeId === nid);
        if (n) ds.initialPositions.set(nid, { x: n.x, y: n.y });
      }
    }
    
    setDragNode(nodeId);
    setDragOffset({ x: worldX - node.x, y: worldY - node.y });
    setIsDragging(true);
  };
  
  // 拖拽更新 — 从 ref 读取状态，不依赖闭包
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const ds = dragStateRef.current;
    if (!ds.dragNode) return;
    
    const svg = svgRef.current;
    if (!svg) return;
    
    // 从 ref 读取最新的 zoom 和 pan
    const currentZoom = zoomRef.current;
    const currentPan = panRef.current;
    
    const rect = svg.getBoundingClientRect();
    const worldX = (e.clientX - rect.left) / currentZoom - currentPan.x;
    const worldY = (e.clientY - rect.top) / currentZoom - currentPan.y;
    
    // 取消上一帧的 rAF
    if (nodeRafRef.current !== null) {
      cancelAnimationFrame(nodeRafRef.current);
    }
    
    // 捕获当前帧的值
    const targetX = Math.max(0, worldX - ds.dragOffset.x);
    const targetY = Math.max(0, worldY - ds.dragOffset.y);
    const dragNodeId = ds.dragNode;
    const initPositions = ds.initialPositions;
    const startWorld = ds.startWorldPos;
    const selNodes = selectedNodesRef.current;
    
    nodeRafRef.current = requestAnimationFrame(() => {
      nodeRafRef.current = null;
      
      setLocalNodes(prev => {
        // 多选整体拖动：基于初始位置 + 鼠标偏移量
        if (initPositions.size > 0 && selNodes.has(dragNodeId)) {
          const dx = worldX - startWorld.x;
          const dy = worldY - startWorld.y;
          
          // 跳过微小移动
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return prev;
          
          return prev.map(n => {
            const initPos = initPositions.get(n.nodeId);
            if (initPos) {
              return { ...n, x: Math.max(0, initPos.x + dx), y: Math.max(0, initPos.y + dy) };
            }
            return n;
          });
        } else {
          // 单节点拖动：直接设置绝对坐标
          return prev.map(n =>
            n.nodeId === dragNodeId
              ? { ...n, x: targetX, y: targetY }
              : n
          );
        }
      });
    });
  }, []); // 空依赖 — 所有状态从 ref 读取
  
  // [P2-Tp1 修复] 节点拖拽仅在 mouseup 时提交最终位置到后端
  // mousemove 期间只更新本地状态，避免每 16ms 触发一次 tRPC 请求
  const handleMouseUp = useCallback(() => {
    // 清理 rAF
    if (nodeRafRef.current !== null) {
      cancelAnimationFrame(nodeRafRef.current);
      nodeRafRef.current = null;
    }
    
    const ds = dragStateRef.current;
    const dragNodeId = ds.dragNode;
    
    if (dragNodeId) {
      // 读取最终位置并保存到后端
      const selNodes = selectedNodesRef.current;
      
      // 使用 setLocalNodes 的回调形式读取最新状态
      setLocalNodes(currentNodes => {
        // 多选整体拖动时批量保存
        if (ds.initialPositions.size > 0 && selNodes.has(dragNodeId)) {
          const updates = Array.from(selNodes)
            .map(nid => {
              const n = currentNodes.find(nd => nd.nodeId === nid);
              return n ? { nodeId: nid, x: Math.round(n.x), y: Math.round(n.y) } : null;
            })
            .filter(Boolean) as { nodeId: string; x: number; y: number }[];
          if (updates.length > 0) {
            updateNodePositionsMutation.mutate(updates);
        }
        } else {
          const node = currentNodes.find(n => n.nodeId === dragNodeId);
          if (node) {
            updateNodePositionMutation.mutate({ nodeId: dragNodeId, x: Math.round(node.x), y: Math.round(node.y) });
          }
        }
        return currentNodes; // 不修改状态，只是读取
      });
    }
    
    // 清理拖拽状态
    ds.dragNode = null;
    ds.initialPositions.clear();
    setIsDragging(false);
    setDragNode(null);
  }, [updateNodePositionMutation, updateNodePositionsMutation]);
  
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
    return undefined;
  }, [isDragging, handleMouseMove, handleMouseUp]);
  
  // 创建节点
  const handleCreateNode = () => {
    if (!newNode.name.trim()) {
      toast.error('请输入节点名称');
      return;
    }
    
    const nodeId = `node_${Date.now()}`;
    const typeX: Record<string, number> = { 
      source: 50, plugin: 200, engine: 350, agent: 350, output: 500, database: 500, service: 500 
    };
    const sameTypeCount = (nodes || []).filter(n => n.type === newNode.type).length;
    
    createNodeMutation.mutate({
      nodeId,
      name: newNode.name,
      type: newNode.type,
      icon: newNode.icon || nodeTypeConfig[newNode.type].icon,
      description: newNode.description,
      x: typeX[newNode.type] || 200,
      y: 50 + sameTypeCount * 100,
    });
  };
  
  // 创建连接
  const handleCreateEdge = () => {
    if (!newEdge.sourceNodeId || !newEdge.targetNodeId) {
      toast.error('请选择源节点和目标节点');
      return;
    }
    
    const edgeId = `edge_${Date.now()}`;
    createEdgeMutation.mutate({
      edgeId,
      sourceNodeId: newEdge.sourceNodeId,
      targetNodeId: newEdge.targetNodeId,
      type: newEdge.type,
      label: newEdge.label || undefined,
    });
  };
  
  // 保存布局
  const handleSaveLayout = () => {
    if (!layoutName.trim()) {
      toast.error('请输入布局名称');
      return;
    }
    
    saveLayoutMutation.mutate({
      name: layoutName,
      layoutData: {
        nodes: (nodes || []).map(n => ({ nodeId: n.nodeId, x: n.x, y: n.y })),
        zoom,
        panX: pan.x,
        panY: pan.y,
      },
    });
  };
  
  // 导出拓扑数据
  const handleExportTopology = () => {
    const data = {
      nodes: (nodes || []).map(n => ({
        nodeId: n.nodeId,
        name: n.name,
        type: n.type,
        icon: n.icon,
        description: n.description,
        x: n.x,
        y: n.y,
        status: n.status,
      })),
      edges: (edges || []).map(e => ({
        edgeId: e.edgeId,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        type: e.type,
        label: e.label,
      })),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `topology-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('拓扑数据已导出');
  };
  
  // 渲染连接线
  const renderEdges = () => {
    return (visibleEdges || []).map((edge) => {
      const fromNode = (nodes || []).find(n => n.nodeId === edge.sourceNodeId);
      const toNode = (nodes || []).find(n => n.nodeId === edge.targetNodeId);
      if (!fromNode || !toNode) return null;
      
      const x1 = fromNode.x + 120;
      const y1 = fromNode.y + 30;
      const x2 = toNode.x;
      const y2 = toNode.y + 30;
      const cx = (x1 + x2) / 2;
      
      const edgeColor = edge.type === 'data' 
        ? 'oklch(0.65 0.18 240)' 
        : edge.type === 'dependency' 
          ? 'oklch(0.60 0.22 290)' 
          : 'oklch(0.60 0.18 60)';
      
      const isSelected = selectedEdge?.edgeId === edge.edgeId;
      
      return (
        <g key={edge.edgeId} className="cursor-pointer" onClick={() => setSelectedEdge(edge)}>
          <path
            d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
            stroke={isSelected ? 'oklch(0.80 0.20 60)' : edgeColor}
            strokeWidth={isSelected ? 3 : 2}
            fill="none"
            strokeDasharray={edge.type === 'dependency' ? '8,4' : edge.type === 'control' ? '4,4' : 'none'}
            className="transition-all duration-200"
          />
          {/* 箭头 */}
          <polygon
            points={`${x2},${y2} ${x2-10},${y2-5} ${x2-10},${y2+5}`}
            fill={isSelected ? 'oklch(0.80 0.20 60)' : edgeColor}
          />
          {/* 标签 */}
          {edge.label && (
            <text
              x={cx}
              y={(y1 + y2) / 2 - 8}
              fontSize="10"
              fill="oklch(0.70 0.05 250)"
              textAnchor="middle"
              className="pointer-events-none"
            >
              {edge.label}
            </text>
          )}
          {/* 状态指示 */}
          {edge.status !== 'active' && (
            <circle
              cx={cx}
              cy={(y1 + y2) / 2}
              r="6"
              fill={edge.status === 'error' ? 'oklch(0.65 0.20 30)' : 'oklch(0.50 0.10 60)'}
            />
          )}
        </g>
      );
    });
  };
  
  // 渲染节点
  const renderNodes = () => {
    return (nodes || []).map((node) => {
      const isSelected = selectedNode?.nodeId === node.nodeId;
      const isMultiSelected = selectedNodes.has(node.nodeId);
      const isConnectSource = connectSource === node.nodeId;
      const typeConfig = nodeTypeConfig[node.type];
      
      const statusColor = {
        online: 'oklch(0.75 0.18 145)',
        offline: 'oklch(0.50 0.10 250)',
        error: 'oklch(0.65 0.20 30)',
        maintenance: 'oklch(0.65 0.18 60)',
      }[node.status];
      
      return (
        <g 
          key={node.nodeId} 
          transform={`translate(${node.x}, ${node.y})`}
          className={cn("cursor-move", isDragging && dragNode === node.nodeId && "opacity-70")}
          onMouseDown={(e) => handleMouseDown(e, node.nodeId)}
          onClick={(e) => {
            e.stopPropagation();
            if (!isDragging) setSelectedNode(node);
          }}
          onDoubleClick={() => setShowNodeDetailDialog(true)}
        >
          {/* 选中高亮 */}
          {(isSelected || isMultiSelected || isConnectSource) && (
            <rect
              x="-4"
              y="-4"
              width="128"
              height="68"
              rx="12"
              fill={isMultiSelected ? 'oklch(0.65 0.18 240 / 0.1)' : 'none'}
              stroke={isConnectSource ? 'oklch(0.75 0.20 145)' : isMultiSelected ? 'oklch(0.70 0.20 200)' : 'oklch(0.65 0.18 240)'}
              strokeWidth="2"
              strokeDasharray={isMultiSelected && !isSelected ? '6,3' : '4,2'}
              className={isMultiSelected ? '' : 'animate-pulse'}
            />
          )}
          
          {/* 节点背景 */}
          <rect
            width="120"
            height="60"
            rx="10"
            fill="oklch(0.18 0.03 250)"
            stroke={typeConfig.color}
            strokeWidth="2"
          />
          
          {/* 图标 */}
          <text x="25" y="38" fontSize="24" textAnchor="middle">
            {node.icon || typeConfig.icon}
          </text>
          
          {/* 名称 */}
          <text x="75" y="32" fontSize="12" fill="white" textAnchor="middle" fontWeight="500">
            {node.name}
          </text>
          
          {/* 类型标签 */}
          <text x="75" y="48" fontSize="9" fill="oklch(0.60 0.05 250)" textAnchor="middle">
            {typeConfig.label}
          </text>
          
          {/* 状态指示灯 */}
          <circle
            cx="110"
            cy="10"
            r="6"
            fill={statusColor}
            className={node.status === 'online' ? 'animate-pulse' : ''}
          />
          
          {/* 指标显示 */}
          {node.metrics && node.status === 'online' && (
            <g transform="translate(5, 52)">
              {node.metrics.cpu !== undefined && (
                <text x="0" y="0" fontSize="8" fill="oklch(0.55 0.05 250)">
                  CPU: {node.metrics.cpu}%
                </text>
              )}
            </g>
          )}
        </g>
      );
    });
  };
  
  return (
    <MainLayout title="系统拓扑">
      <div className="animate-fade-up">
        {/* 页面标题 */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-base font-bold mb-1">📊 系统拓扑</h2>
              <p className="text-xs text-muted-foreground">可视化管理系统组件和数据流</p>
            </div>
            {/* 状态指示器 */}
            {statusChanged && (
              <div className="flex items-center gap-1 px-2 py-1 bg-primary/20 rounded-full animate-pulse">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-[10px] text-primary">状态已更新</span>
              </div>
            )}
            {/* 服务状态摘要 */}
            {servicesSummary && (
              <div className="flex items-center gap-2 px-2 py-1 bg-secondary rounded-lg text-[10px]">
                {servicesSummary.online > 0 ? (
                  <>
                    <span className="text-success">✓ {servicesSummary.online}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-muted-foreground">{servicesSummary.total} 服务</span>
                  </>
                ) : servicesSummary.total > 0 ? (
                  <>
                    <span className="text-amber-400">⚠ 服务未连接</span>
                    <span className="text-muted-foreground">(请检查 Kafka/Redis/ClickHouse 配置)</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">暂无监控服务</span>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2 items-center">
            {/* 自动刷新控制 */}
            <div className="flex items-center gap-2 px-2 py-1 bg-secondary rounded-lg">
              <span className="text-[10px] text-muted-foreground">自动刷新</span>
              <Switch 
                checked={autoRefresh} 
                onCheckedChange={setAutoRefresh}
                className="scale-75"
              />
              {autoRefresh && (
                <Select value={String(refreshInterval)} onValueChange={(v) => setRefreshInterval(Number(v))}>
                  <SelectTrigger className="w-[60px] h-6 text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5秒</SelectItem>
                    <SelectItem value="10">10秒</SelectItem>
                    <SelectItem value="30">30秒</SelectItem>
                    <SelectItem value="60">1分钟</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={() => checkHealthMutation.mutate()}
              disabled={checkHealthMutation.isPending}
              className="h-7 text-[11px] px-2"
            >
              <Activity className="w-3 h-3 mr-1" />
              {checkHealthMutation.isPending ? '检查中...' : '健康检查'}
            </Button>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={() => refetchTopology()}
              className="h-7 text-[11px] px-2"
            >
              <RefreshCw className={cn("w-3 h-3 mr-1", isLoading && "animate-spin")} />
              刷新
            </Button>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={handleExportTopology}
              className="h-7 text-[11px] px-2"
            >
              <Download className="w-3 h-3 mr-1" />
              导出
            </Button>
            <Button 
              size="sm" 
              onClick={() => setShowSaveLayoutDialog(true)}
              className="h-7 text-[11px] px-2"
            >
              <Save className="w-3 h-3 mr-1" />
              保存布局
            </Button>
          </div>
        </div>
        
        {/* 统计卡片 */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
          <StatCard value={nodes.length} label="总节点" icon="🔷" />
          <StatCard value={(nodes || []).filter(n => n.status === 'online').length} label="在线节点" icon="✅" />
          <StatCard value={edges.length} label="连接数" icon="🔗" />
          <StatCard value={(nodes || []).filter(n => n.type === 'source').length} label="数据源" icon="📡" />
          <StatCard value={(nodes || []).filter(n => n.type === 'engine').length} label="引擎" icon="🤖" />
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* 拓扑图主区域 */}
          <div className="lg:col-span-3">
            <PageCard
              title="系统拓扑图"
              icon="📊"
              noPadding
              action={
                <div className="flex gap-2 items-center flex-wrap pr-3">
                  {/* 视图筛选 */}
                  <Select value={viewMode} onValueChange={(v: any) => setViewMode(v)}>
                    <SelectTrigger className="w-[100px] h-7 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      <SelectItem value="data">数据流</SelectItem>
                      <SelectItem value="dependency">依赖</SelectItem>
                      <SelectItem value="control">控制</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {/* 缩放控制 */}
                  <div className="flex items-center gap-1 border rounded px-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0"
                      onClick={() => setZoom(z => Math.max(0.25, z - 0.1))}
                    >
                      <ZoomOut className="w-3 h-3" />
                    </Button>
                    <span className="text-[10px] w-10 text-center">{Math.round(zoom * 100)}%</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0"
                      onClick={() => setZoom(z => Math.min(2.0, z + 0.1))}
                    >
                      <ZoomIn className="w-3 h-3" />
                    </Button>
                  </div>
                  
                  {/* 适应画布 */}
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="h-7 text-[11px] px-2"
                    onClick={fitToView}
                    title="适应画布，居中显示所有节点"
                  >
                    <Maximize2 className="w-3 h-3 mr-1" />
                    居中
                  </Button>
                  
                  {/* 全选/取消全选 */}
                  <Button 
                    variant={selectedNodes.size > 0 ? "default" : "secondary"} 
                    size="sm" 
                    className="h-7 text-[11px] px-2"
                    onClick={() => {
                      if (selectedNodes.size === nodes.length) {
                        setSelectedNodes(new Set());
                      } else {
                        setSelectedNodes(new Set(nodes.map(n => n.nodeId)));
                      }
                    }}
                    title="全选节点后可整体拖动（也可用 Ctrl+点击 多选）"
                  >
                    <Move className="w-3 h-3 mr-1" />
                    {selectedNodes.size > 0 ? `已选 ${selectedNodes.size}` : '全选'}
                  </Button>
                  
                  {/* 连接模式 */}
                  <Button 
                    variant={isConnecting ? "default" : "secondary"} 
                    size="sm" 
                    className="h-7 text-[11px] px-2"
                    onClick={() => {
                      setIsConnecting(!isConnecting);
                      setConnectSource(null);
                    }}
                  >
                    {isConnecting ? <Unlink className="w-3 h-3 mr-1" /> : <Link2 className="w-3 h-3 mr-1" />}
                    {isConnecting ? '取消连接' : '连接模式'}
                  </Button>
                  
                  {/* 添加节点 */}
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="h-7 text-[11px] px-2"
                    onClick={() => setShowAddNodeDialog(true)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    添加节点
                  </Button>
                  
                  {/* 自动发现 */}
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="h-7 text-[11px] px-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                    onClick={() => autoDiscoverMutation.mutate()}
                    disabled={autoDiscoverMutation.isPending}
                  >
                    {autoDiscoverMutation.isPending ? (
                      <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Network className="w-3 h-3 mr-1" />
                    )}
                    自动发现
                  </Button>
                  
                  {/* 重新生成 */}
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="h-7 text-[11px] px-2"
                    onClick={() => {
                      if (confirm('确定要重新生成拓扑吗？这将清空现有节点并重新扫描服务。')) {
                        regenerateMutation.mutate();
                      }
                    }}
                    disabled={regenerateMutation.isPending}
                  >
                    {regenerateMutation.isPending ? (
                      <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3 mr-1" />
                    )}
                    重新生成
                  </Button>
                  
                  {/* 自动布局 */}
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="h-7 text-[11px] px-2"
                    onClick={() => autoLayoutMutation.mutate()}
                    disabled={autoLayoutMutation.isPending}
                  >
                    {autoLayoutMutation.isPending ? (
                      <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Maximize2 className="w-3 h-3 mr-1" />
                    )}
                    自动布局
                  </Button>
                </div>
              }
            >
              <div 
                ref={containerRef}
                className="relative w-full bg-gradient-to-br from-background to-secondary overflow-hidden"
                style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}
              >
                {isLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-muted-foreground">加载中...</div>
                  </div>
                ) : (
                  <svg 
                    ref={svgRef} 
                    className="w-full h-full"
                    onWheel={(e) => {
                      e.preventDefault();
                      const delta = e.deltaY > 0 ? -0.08 : 0.08;
                      setZoom(z => Math.max(0.25, Math.min(2, z + delta)));
                    }}
                    onMouseDown={(e) => {
                      if (e.button === 0 && !isConnecting) {
                        const target = e.target as SVGElement;
                        if (target.tagName === 'svg' || target.tagName === 'rect' && target.getAttribute('fill') === 'url(#grid)') {
                          e.preventDefault();
                          // 点击空白区域清空多选
                          if (!e.ctrlKey && !e.metaKey) {
                            setSelectedNodes(new Set());
                          }
                          setPanStart({ x: e.clientX - pan.x * zoom, y: e.clientY - pan.y * zoom });
                          setIsPanningCanvas(true);
                        }
                      }
                    }}
                    onMouseMove={(e) => {
                      if (isPanningCanvas) {
                        // 使用 canvasRafRef 节流画布平移（与节点拖拽分开）
                        const clientX = e.clientX;
                        const clientY = e.clientY;
                        if (canvasRafRef.current !== null) {
                          cancelAnimationFrame(canvasRafRef.current);
                        }
                        canvasRafRef.current = requestAnimationFrame(() => {
                          canvasRafRef.current = null;
                          setPan({
                            x: (clientX - panStart.x) / zoomRef.current,
                            y: (clientY - panStart.y) / zoomRef.current,
                          });
                        });
                      }
                    }}
                    onMouseUp={() => setIsPanningCanvas(false)}
                    onMouseLeave={() => setIsPanningCanvas(false)}
                    style={{ cursor: isPanningCanvas ? 'grabbing' : 'grab' }}
                  >
                    {/* 网格背景 */}
                    <defs>
                      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="oklch(0.25 0.02 250)" strokeWidth="0.5"/>
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                    
                    {/* 可缩放平移的内容层 */}
                    <g transform={`scale(${zoom}) translate(${pan.x}, ${pan.y})`}>
                      {/* 连接线 */}
                      {renderEdges()}
                      
                      {/* 节点 */}
                      {renderNodes()}
                    </g>
                  </svg>
                )}
                
                {/* 连接模式提示 */}
                {isConnecting && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs">
                    {connectSource ? '点击目标节点完成连接' : '点击源节点开始连接'}
                  </div>
                )}
                
                {/* 图例 */}
                <div className="absolute bottom-4 left-4 flex gap-4 text-xs bg-background/90 p-2 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-success animate-pulse" />
                    <span>在线</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-muted" />
                    <span>离线/未连接</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-danger" />
                    <span>错误</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-4 h-0.5 bg-primary" />
                    <span>数据流</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-4 border-t-2 border-dashed border-purple-500" />
                    <span>依赖</span>
                  </div>
                </div>
              </div>
            </PageCard>
          </div>
          
          {/* 右侧面板 */}
          <div className="space-y-4">
            {/* 节点详情 */}
            {selectedNode && (
              <PageCard title="节点详情" icon="📋">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-2 bg-secondary rounded-lg">
                    <span className="text-2xl">{selectedNode.icon || nodeTypeConfig[selectedNode.type].icon}</span>
                    <div>
                      <div className="font-semibold">{selectedNode.name}</div>
                      <div className="text-xs text-muted-foreground">{nodeTypeConfig[selectedNode.type].label}</div>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center p-2 bg-secondary rounded-lg text-sm">
                    <span className="text-muted-foreground">状态</span>
                    <Badge variant={selectedNode.status === 'online' ? 'success' : selectedNode.status === 'error' ? 'danger' : 'default'}>
                      {selectedNode.status === 'online' ? '在线' : selectedNode.status === 'offline' ? '离线' : selectedNode.status === 'error' ? '错误' : '维护中'}
                    </Badge>
                  </div>
                  
                  {selectedNode.description && (
                    <div className="p-2 bg-secondary rounded-lg text-sm">
                      <div className="text-muted-foreground mb-1">描述</div>
                      <div>{selectedNode.description}</div>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => {
                        const newStatus = selectedNode.status === 'online' ? 'offline' : 'online';
                        updateNodeStatusMutation.mutate({ nodeId: selectedNode.nodeId, status: newStatus });
                      }}
                    >
                      <Activity className="w-3 h-3 mr-1" />
                      切换状态
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => {
                        if (confirm('确定删除此节点？相关连接也会被删除。')) {
                          deleteNodeMutation.mutate({ nodeId: selectedNode.nodeId });
                        }
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </PageCard>
            )}
            
            {/* 连接详情 */}
            {selectedEdge && !selectedNode && (
              <PageCard title="连接详情" icon="🔗">
                <div className="space-y-3">
                  <div className="p-2 bg-secondary rounded-lg text-sm">
                    <div className="text-muted-foreground mb-1">连接类型</div>
                    <Badge>{selectedEdge.type === 'data' ? '数据流' : selectedEdge.type === 'dependency' ? '依赖' : '控制'}</Badge>
                  </div>
                  
                  <div className="p-2 bg-secondary rounded-lg text-sm">
                    <div className="text-muted-foreground mb-1">源节点</div>
                    <div>{nodes.find(n => n.nodeId === selectedEdge.sourceNodeId)?.name || selectedEdge.sourceNodeId}</div>
                  </div>
                  
                  <div className="p-2 bg-secondary rounded-lg text-sm">
                    <div className="text-muted-foreground mb-1">目标节点</div>
                    <div>{nodes.find(n => n.nodeId === selectedEdge.targetNodeId)?.name || selectedEdge.targetNodeId}</div>
                  </div>
                  
                  {selectedEdge.label && (
                    <div className="p-2 bg-secondary rounded-lg text-sm">
                      <div className="text-muted-foreground mb-1">标签</div>
                      <div>{selectedEdge.label}</div>
                    </div>
                  )}
                  
                  <Button 
                    variant="destructive" 
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      if (confirm('确定删除此连接？')) {
                        deleteEdgeMutation.mutate({ edgeId: selectedEdge.edgeId });
                      }
                    }}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    删除连接
                  </Button>
                </div>
              </PageCard>
            )}
            
            {/* 拓扑统计 */}
            <PageCard title="节点分布" icon="📈">
              <div className="space-y-2">
                {Object.entries(nodeTypeConfig).map(([type, config]) => {
                  const count = (nodes || []).filter(n => n.type === type).length;
                  if (count === 0) return null;
                  return (
                    <div key={type} className="flex justify-between items-center p-2 bg-secondary rounded-lg text-sm">
                      <div className="flex items-center gap-2">
                        <span>{config.icon}</span>
                        <span>{config.label}</span>
                      </div>
                      <span className="font-medium">{count}</span>
                    </div>
                  );
                })}
              </div>
            </PageCard>
            
            {/* 快捷操作 */}
            <PageCard title="快捷操作" icon="⚡">
              <div className="space-y-2">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="w-full justify-start"
                  onClick={() => setShowAddEdgeDialog(true)}
                >
                  <Link2 className="w-4 h-4 mr-2" />
                  添加连接
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="w-full justify-start"
                  onClick={() => {
                    if (confirm('确定重置为默认拓扑？当前配置将丢失。')) {
                      resetTopologyMutation.mutate();
                    }
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  重置为默认
                </Button>
              </div>
            </PageCard>
          </div>
        </div>
      </div>
      
      {/* 添加节点弹窗 */}
      <Dialog open={showAddNodeDialog} onOpenChange={setShowAddNodeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加拓扑节点</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">节点名称 *</label>
              <Input
                value={newNode.name}
                onChange={(e) => setNewNode(prev => ({ ...prev, name: e.target.value }))}
                placeholder="如: 新传感器"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">节点类型</label>
              <Select value={newNode.type} onValueChange={(v: any) => setNewNode(prev => ({ ...prev, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(nodeTypeConfig).map(([type, config]) => (
                    <SelectItem key={type} value={type}>
                      {config.icon} {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">图标</label>
              <Input
                value={newNode.icon}
                onChange={(e) => setNewNode(prev => ({ ...prev, icon: e.target.value }))}
                placeholder="📦"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">描述</label>
              <Textarea
                value={newNode.description}
                onChange={(e) => setNewNode(prev => ({ ...prev, description: e.target.value }))}
                placeholder="节点功能描述..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAddNodeDialog(false)}>取消</Button>
            <Button onClick={handleCreateNode} disabled={createNodeMutation.isPending}>
              {createNodeMutation.isPending ? '创建中...' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 添加连接弹窗 */}
      <Dialog open={showAddEdgeDialog} onOpenChange={setShowAddEdgeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加连接</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">源节点 *</label>
              <Select value={newEdge.sourceNodeId} onValueChange={(v) => setNewEdge(prev => ({ ...prev, sourceNodeId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="选择源节点" />
                </SelectTrigger>
                <SelectContent>
                  {(nodes || []).map(node => (
                    <SelectItem key={node.nodeId} value={node.nodeId}>
                      {node.icon || nodeTypeConfig[node.type].icon} {node.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">目标节点 *</label>
              <Select value={newEdge.targetNodeId} onValueChange={(v) => setNewEdge(prev => ({ ...prev, targetNodeId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="选择目标节点" />
                </SelectTrigger>
                <SelectContent>
                  {(nodes || []).filter(n => n.nodeId !== newEdge.sourceNodeId).map(node => (
                    <SelectItem key={node.nodeId} value={node.nodeId}>
                      {node.icon || nodeTypeConfig[node.type].icon} {node.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">连接类型</label>
              <Select value={newEdge.type} onValueChange={(v: any) => setNewEdge(prev => ({ ...prev, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="data">数据流</SelectItem>
                  <SelectItem value="dependency">依赖关系</SelectItem>
                  <SelectItem value="control">控制流</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">标签（可选）</label>
              <Input
                value={newEdge.label}
                onChange={(e) => setNewEdge(prev => ({ ...prev, label: e.target.value }))}
                placeholder="如: 振动数据"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAddEdgeDialog(false)}>取消</Button>
            <Button onClick={handleCreateEdge} disabled={createEdgeMutation.isPending}>
              {createEdgeMutation.isPending ? '创建中...' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 保存布局弹窗 */}
      <Dialog open={showSaveLayoutDialog} onOpenChange={setShowSaveLayoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存布局</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">布局名称 *</label>
              <Input
                value={layoutName}
                onChange={(e) => setLayoutName(e.target.value)}
                placeholder="如: 生产环境布局"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowSaveLayoutDialog(false)}>取消</Button>
            <Button onClick={handleSaveLayout} disabled={saveLayoutMutation.isPending}>
              {saveLayoutMutation.isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
