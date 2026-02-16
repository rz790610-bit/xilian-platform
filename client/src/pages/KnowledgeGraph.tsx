import { useState, useEffect, useRef, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/common/Toast';
import { trpc } from '@/lib/trpc';

// 节点类型
interface GraphNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  properties?: Record<string, unknown>;
  dbId?: number;
}

// 边类型
interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  type: string;
  dbId?: number;
}

// 图谱数据
interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// 节点颜色映射
const NODE_COLORS: Record<string, string> = {
  entity: '#3B82F6',
  concept: '#8B5CF6',
  document: '#10B981',
  equipment: '#F59E0B',
  fault: '#EF4444'
};

// 边颜色映射
const EDGE_COLORS: Record<string, string> = {
  belongs_to: '#6B7280',
  related_to: '#3B82F6',
  causes: '#EF4444',
  contains: '#10B981',
  instance_of: '#8B5CF6'
};

export default function KnowledgeGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showLabels, setShowLabels] = useState(true);
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const animationRef = useRef<number | undefined>(undefined);
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [showAddNodeDialog, setShowAddNodeDialog] = useState(false);
  const [showAddEdgeDialog, setShowAddEdgeDialog] = useState(false);
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [newNodeType, setNewNodeType] = useState('entity');
  const [newEdgeSource, setNewEdgeSource] = useState('');
  const [newEdgeTarget, setNewEdgeTarget] = useState('');
  const [newEdgeLabel, setNewEdgeLabel] = useState('');
  const [newEdgeType, setNewEdgeType] = useState('related_to');
  const toast = useToast();

  // ━━━ tRPC Queries ━━━
  const collectionsQuery = trpc.knowledge.listCollections.useQuery();
  const graphQuery = trpc.knowledge.getGraph.useQuery(
    { collectionId: selectedCollectionId! },
    { enabled: selectedCollectionId !== null }
  );

  // ━━━ tRPC Mutations ━━━
  const addNodeMutation = trpc.knowledge.addNode.useMutation({
    onSuccess: () => {
      toast.success('节点添加成功');
      graphQuery.refetch();
      setShowAddNodeDialog(false);
      setNewNodeLabel('');
    },
    onError: (err) => toast.error(`添加节点失败: ${err.message}`)
  });

  const addEdgeMutation = trpc.knowledge.addEdge.useMutation({
    onSuccess: () => {
      toast.success('关系添加成功');
      graphQuery.refetch();
      setShowAddEdgeDialog(false);
      setNewEdgeLabel('');
    },
    onError: (err) => toast.error(`添加关系失败: ${err.message}`)
  });

  const deleteNodeMutation = trpc.knowledge.deleteNode.useMutation({
    onSuccess: () => {
      toast.success('节点已删除');
      graphQuery.refetch();
      setSelectedNode(null);
    },
    onError: (err) => toast.error(`删除节点失败: ${err.message}`)
  });

  const deleteEdgeMutation = trpc.knowledge.deleteEdge.useMutation({
    onSuccess: () => {
      toast.success('关系已删除');
      graphQuery.refetch();
    },
    onError: (err) => toast.error(`删除关系失败: ${err.message}`)
  });

  const savePositionMutation = trpc.knowledge.saveNodePosition.useMutation();

  // ━━━ 自动选择第一个集合 ━━━
  useEffect(() => {
    if (collectionsQuery.data && collectionsQuery.data.length > 0 && selectedCollectionId === null) {
      setSelectedCollectionId(collectionsQuery.data[0].id);
    }
  }, [collectionsQuery.data, selectedCollectionId]);

  // ━━━ 加载图谱数据 ━━━
  useEffect(() => {
    if (graphQuery.data) {
      const nodes: GraphNode[] = graphQuery.data.nodes.map((n: any) => ({
        id: n.id,
        label: n.label,
        type: n.type || 'entity',
        x: n.x ?? 400 + Math.random() * 200 - 100,
        y: n.y ?? 300 + Math.random() * 200 - 100,
        vx: 0,
        vy: 0,
        properties: n.properties,
        dbId: n.dbId
      }));
      const edges: GraphEdge[] = graphQuery.data.edges.map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        type: e.type || 'related_to',
        dbId: e.dbId
      }));
      setGraphData({ nodes, edges });
    }
  }, [graphQuery.data]);

  // ━━━ 力导向布局动画 ━━━
  useEffect(() => {
    if (!animationEnabled || graphData.nodes.length === 0) return;

    const animate = () => {
      setGraphData(prev => {
        const nodes = [...prev.nodes];
        const edges = prev.edges;
        const repulsion = 5000;
        const attraction = 0.01;
        const damping = 0.9;
        const centerX = 400;
        const centerY = 300;

        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[j].x - nodes[i].x;
            const dy = nodes[j].y - nodes[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = repulsion / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            nodes[i].vx -= fx;
            nodes[i].vy -= fy;
            nodes[j].vx += fx;
            nodes[j].vy += fy;
          }
        }

        for (const edge of edges) {
          const source = nodes.find(n => n.id === edge.source);
          const target = nodes.find(n => n.id === edge.target);
          if (!source || !target) continue;
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const fx = dx * attraction;
          const fy = dy * attraction;
          const si = nodes.indexOf(source);
          const ti = nodes.indexOf(target);
          nodes[si].vx += fx;
          nodes[si].vy += fy;
          nodes[ti].vx -= fx;
          nodes[ti].vy -= fy;
        }

        for (const node of nodes) {
          node.vx += (centerX - node.x) * 0.001;
          node.vy += (centerY - node.y) * 0.001;
        }

        for (const node of nodes) {
          node.vx *= damping;
          node.vy *= damping;
          node.x += node.vx;
          node.y += node.vy;
          node.x = Math.max(50, Math.min(750, node.x));
          node.y = Math.max(50, Math.min(550, node.y));
        }

        return { nodes, edges };
      });
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [animationEnabled, graphData.nodes.length]);

  // ━━━ 绘制图谱 ━━━
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    // 绘制边
    for (const edge of graphData.edges) {
      const source = graphData.nodes.find(n => n.id === edge.source);
      const target = graphData.nodes.find(n => n.id === edge.target);
      if (!source || !target) continue;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = EDGE_COLORS[edge.type] || '#6B7280';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 箭头
      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      const arrowLen = 10;
      const arrowX = target.x - Math.cos(angle) * 25;
      const arrowY = target.y - Math.sin(angle) * 25;
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX - arrowLen * Math.cos(angle - Math.PI / 6), arrowY - arrowLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(arrowX - arrowLen * Math.cos(angle + Math.PI / 6), arrowY - arrowLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = EDGE_COLORS[edge.type] || '#6B7280';
      ctx.fill();

      if (showLabels) {
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#9CA3AF';
        ctx.textAlign = 'center';
        ctx.fillText(edge.label, midX, midY - 5);
      }
    }

    // 绘制节点
    for (const node of graphData.nodes) {
      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredNode?.id === node.id;
      const radius = isSelected ? 25 : isHovered ? 22 : 20;

      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 5, 0, Math.PI * 2);
        ctx.fillStyle = `${NODE_COLORS[node.type] || '#6B7280'}40`;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = NODE_COLORS[node.type] || '#6B7280';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#FFFFFF' : '#1F2937';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.label.slice(0, 4), node.x, node.y);

      if (showLabels) {
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#E5E7EB';
        ctx.fillText(node.label, node.x, node.y + radius + 12);
      }
    }

    ctx.restore();
  }, [graphData, selectedNode, hoveredNode, zoom, offset, showLabels]);

  // ━━━ 鼠标事件 ━━━
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset.x) / zoom;
    const y = (e.clientY - rect.top - offset.y) / zoom;

    const clickedNode = graphData.nodes.find(node => {
      const dx = node.x - x;
      const dy = node.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 25;
    });

    if (clickedNode) {
      setSelectedNode(clickedNode);
    } else {
      setSelectedNode(null);
      setIsDragging(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  }, [graphData.nodes, offset, zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDragging) {
      setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset.x) / zoom;
    const y = (e.clientY - rect.top - offset.y) / zoom;

    const hovered = graphData.nodes.find(node => {
      const dx = node.x - x;
      const dy = node.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 25;
    });
    setHoveredNode(hovered || null);
    canvas.style.cursor = hovered ? 'pointer' : isDragging ? 'grabbing' : 'grab';
  }, [graphData.nodes, isDragging, dragStart, offset, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.3, Math.min(3, prev * delta)));
  }, []);

  // ━━━ 操作函数 ━━━
  const handleAddNode = () => {
    if (!newNodeLabel.trim() || selectedCollectionId === null) return;
    addNodeMutation.mutate({
      collectionId: selectedCollectionId,
      label: newNodeLabel.trim(),
      type: newNodeType
    });
  };

  const handleAddEdge = () => {
    if (!newEdgeSource || !newEdgeTarget || !newEdgeLabel.trim() || selectedCollectionId === null) return;
    addEdgeMutation.mutate({
      collectionId: selectedCollectionId,
      source: newEdgeSource,
      target: newEdgeTarget,
      label: newEdgeLabel.trim(),
      type: newEdgeType
    });
  };

  const handleDeleteNode = () => {
    if (!selectedNode?.dbId) {
      toast.warning('该节点无法删除（无数据库ID）');
      return;
    }
    deleteNodeMutation.mutate({ id: selectedNode.dbId });
  };

  const exportGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `knowledge-graph-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  // ━━━ 过滤和统计 ━━━
  const filteredNodes = graphData.nodes.filter(node => {
    const matchesSearch = node.label.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || node.type === filterType;
    return matchesSearch && matchesType;
  });

  const stats = {
    totalNodes: graphData.nodes.length,
    totalEdges: graphData.edges.length,
    entityCount: graphData.nodes.filter(n => n.type === 'entity').length,
    equipmentCount: graphData.nodes.filter(n => n.type === 'equipment').length,
    faultCount: graphData.nodes.filter(n => n.type === 'fault').length,
    conceptCount: graphData.nodes.filter(n => n.type === 'concept').length
  };

  const collections = collectionsQuery.data || [];

  return (
    <MainLayout title="知识图谱">
      <div className="space-y-4">
        {/* 页面头部 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">知识图谱</h1>
            <p className="text-gray-400 text-sm mt-1">
              可视化实体关系网络，支持交互式探索和编辑
              {graphQuery.isLoading && ' — 加载中...'}
              {graphQuery.isError && ' — 加载失败'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 集合选择器 */}
            <Select
              value={selectedCollectionId?.toString() || ''}
              onValueChange={(v) => setSelectedCollectionId(Number(v))}
            >
              <SelectTrigger className="w-[180px] bg-gray-800 border-gray-600 text-white">
                <SelectValue placeholder="选择知识集合" />
              </SelectTrigger>
              <SelectContent>
                {collections.map((c: any) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setShowAddNodeDialog(true)}
              disabled={selectedCollectionId === null}>
              ➕ 添加节点
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAddEdgeDialog(true)}
              disabled={selectedCollectionId === null || graphData.nodes.length < 2}>
              🔗 添加关系
            </Button>
            <Button variant="outline" size="sm" onClick={exportGraph}>
              📥 导出图片
            </Button>
            <Button variant="outline" size="sm" onClick={resetView}>
              🔄 重置视图
            </Button>
            <Button variant="outline" size="sm" onClick={() => graphQuery.refetch()}>
              🔃 刷新
            </Button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <StatCard label="节点总数" value={stats.totalNodes} icon="🔵" />
          <StatCard label="关系总数" value={stats.totalEdges} icon="🔗" />
          <StatCard label="设备" value={stats.equipmentCount} icon="⚙️" />
          <StatCard label="故障" value={stats.faultCount} icon="⚠️" />
          <StatCard label="概念" value={stats.conceptCount} icon="💡" />
          <StatCard label="实体" value={stats.entityCount} icon="📦" />
        </div>

        {/* 无集合提示 */}
        {collections.length === 0 && !collectionsQuery.isLoading && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-center">
            <p className="text-yellow-400">暂无知识集合。请先在「知识管理」中创建集合并上传文档，系统会自动生成知识图谱。</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* 图谱画布 */}
          <div className="lg:col-span-3">
            <PageCard title="关系图谱">
              <div className="relative">
                {/* 工具栏 */}
                <div className="absolute top-2 left-2 z-10 flex items-center gap-2 bg-gray-800/80 rounded-lg p-2">
                  <input
                    type="text"
                    placeholder="搜索节点..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-400 w-32"
                  />
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                  >
                    <option value="all">全部类型</option>
                    <option value="equipment">设备</option>
                    <option value="fault">故障</option>
                    <option value="concept">概念</option>
                    <option value="document">文档</option>
                    <option value="entity">实体</option>
                  </select>
                </div>

                {/* 控制按钮 */}
                <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 bg-gray-800/80 rounded-lg p-2">
                  <button onClick={() => setZoom(z => Math.min(3, z * 1.2))}
                    className="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded text-white">+</button>
                  <button onClick={() => setZoom(z => Math.max(0.3, z / 1.2))}
                    className="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded text-white">-</button>
                  <button onClick={() => setShowLabels(!showLabels)}
                    className={`w-8 h-8 rounded text-white ${showLabels ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                    title="显示标签">T</button>
                  <button onClick={() => setAnimationEnabled(!animationEnabled)}
                    className={`w-8 h-8 rounded text-white ${animationEnabled ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                    title="力导向布局">⚡</button>
                </div>

                {/* 画布 */}
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={600}
                  className="w-full h-[600px] bg-gray-900 rounded-lg cursor-grab"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onWheel={handleWheel}
                />

                {/* 图例 */}
                <div className="absolute bottom-2 left-2 bg-gray-800/80 rounded-lg p-2">
                  <div className="text-xs text-gray-400 mb-1">图例</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(NODE_COLORS).map(([type, color]) => (
                      <div key={type} className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-xs text-gray-300">
                          {type === 'entity' ? '实体' : type === 'concept' ? '概念' :
                           type === 'document' ? '文档' : type === 'equipment' ? '设备' : '故障'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </PageCard>
          </div>

          {/* 侧边栏 */}
          <div className="space-y-4">
            {/* 节点详情 */}
            <PageCard title="节点详情">
              {selectedNode ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: NODE_COLORS[selectedNode.type] || '#6B7280' }} />
                    <span className="text-white font-medium">{selectedNode.label}</span>
                  </div>
                  <div className="text-sm">
                    <div className="text-gray-400">类型</div>
                    <Badge variant={
                      selectedNode.type === 'fault' ? 'danger' :
                      selectedNode.type === 'equipment' ? 'warning' :
                      selectedNode.type === 'concept' ? 'info' : 'default'
                    }>
                      {selectedNode.type === 'entity' ? '实体' : selectedNode.type === 'concept' ? '概念' :
                       selectedNode.type === 'document' ? '文档' : selectedNode.type === 'equipment' ? '设备' : '故障'}
                    </Badge>
                  </div>
                  {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
                    <div className="text-sm">
                      <div className="text-gray-400 mb-1">属性</div>
                      {Object.entries(selectedNode.properties).map(([key, value]) => (
                        <div key={key} className="flex justify-between py-1 border-b border-gray-700">
                          <span className="text-gray-400">{key}</span>
                          <span className="text-white">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-sm">
                    <div className="text-gray-400 mb-1">关联关系</div>
                    <div className="text-gray-300">
                      {graphData.edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).length} 条
                    </div>
                  </div>
                  <Button variant="destructive" size="sm" className="w-full" onClick={handleDeleteNode}
                    disabled={deleteNodeMutation.isPending}>
                    {deleteNodeMutation.isPending ? '删除中...' : '删除节点'}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <div className="text-3xl mb-2">👆</div>
                  <p>点击节点查看详情</p>
                </div>
              )}
            </PageCard>

            {/* 节点列表 */}
            <PageCard title={`节点列表 (${filteredNodes.length})`}>
              <div className="max-h-[300px] overflow-y-auto space-y-1">
                {filteredNodes.map(node => (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                      selectedNode?.id === node.id
                        ? 'bg-blue-600/30 border border-blue-500'
                        : 'hover:bg-gray-700'
                    }`}
                  >
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: NODE_COLORS[node.type] || '#6B7280' }} />
                    <span className="text-white text-sm truncate">{node.label}</span>
                  </div>
                ))}
                {filteredNodes.length === 0 && (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    {graphData.nodes.length === 0 ? '暂无图谱数据' : '无匹配节点'}
                  </div>
                )}
              </div>
            </PageCard>
          </div>
        </div>
      </div>

      {/* 添加节点对话框 */}
      <Dialog open={showAddNodeDialog} onOpenChange={setShowAddNodeDialog}>
        <DialogContent className="bg-gray-800 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">添加节点</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400">节点名称</label>
              <Input
                value={newNodeLabel}
                onChange={(e) => setNewNodeLabel(e.target.value)}
                placeholder="输入节点名称"
                className="bg-gray-700 border-gray-600 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400">节点类型</label>
              <Select value={newNodeType} onValueChange={setNewNodeType}>
                <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entity">实体</SelectItem>
                  <SelectItem value="equipment">设备</SelectItem>
                  <SelectItem value="fault">故障</SelectItem>
                  <SelectItem value="concept">概念</SelectItem>
                  <SelectItem value="document">文档</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddNodeDialog(false)}>取消</Button>
            <Button onClick={handleAddNode} disabled={!newNodeLabel.trim() || addNodeMutation.isPending}>
              {addNodeMutation.isPending ? '添加中...' : '确认添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加关系对话框 */}
      <Dialog open={showAddEdgeDialog} onOpenChange={setShowAddEdgeDialog}>
        <DialogContent className="bg-gray-800 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">添加关系</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400">源节点</label>
              <Select value={newEdgeSource} onValueChange={setNewEdgeSource}>
                <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                  <SelectValue placeholder="选择源节点" />
                </SelectTrigger>
                <SelectContent>
                  {graphData.nodes.map(n => (
                    <SelectItem key={n.id} value={n.id}>{n.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-gray-400">目标节点</label>
              <Select value={newEdgeTarget} onValueChange={setNewEdgeTarget}>
                <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                  <SelectValue placeholder="选择目标节点" />
                </SelectTrigger>
                <SelectContent>
                  {graphData.nodes.filter(n => n.id !== newEdgeSource).map(n => (
                    <SelectItem key={n.id} value={n.id}>{n.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-gray-400">关系名称</label>
              <Input
                value={newEdgeLabel}
                onChange={(e) => setNewEdgeLabel(e.target.value)}
                placeholder="例如：属于、驱动、诊断"
                className="bg-gray-700 border-gray-600 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400">关系类型</label>
              <Select value={newEdgeType} onValueChange={setNewEdgeType}>
                <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="related_to">相关</SelectItem>
                  <SelectItem value="belongs_to">属于</SelectItem>
                  <SelectItem value="causes">导致</SelectItem>
                  <SelectItem value="contains">包含</SelectItem>
                  <SelectItem value="instance_of">实例</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddEdgeDialog(false)}>取消</Button>
            <Button onClick={handleAddEdge}
              disabled={!newEdgeSource || !newEdgeTarget || !newEdgeLabel.trim() || addEdgeMutation.isPending}>
              {addEdgeMutation.isPending ? '添加中...' : '确认添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
