import { useState, useEffect, useRef, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/common/Badge';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';

// 节点类型
interface GraphNode {
  id: string;
  label: string;
  type: 'entity' | 'concept' | 'document' | 'equipment' | 'fault';
  x: number;
  y: number;
  vx: number;
  vy: number;
  properties?: Record<string, string>;
}

// 边类型
interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  type: 'belongs_to' | 'related_to' | 'causes' | 'contains' | 'instance_of';
}

// 图谱数据
interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// 节点颜色映射
const NODE_COLORS: Record<string, string> = {
  entity: '#3B82F6',      // 蓝色
  concept: '#8B5CF6',     // 紫色
  document: '#10B981',    // 绿色
  equipment: '#F59E0B',   // 橙色
  fault: '#EF4444'        // 红色
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

  // 初始化示例数据
  useEffect(() => {
    const sampleData: GraphData = {
      nodes: [
        // 设备节点
        { id: 'eq-1', label: '离心泵', type: 'equipment', x: 400, y: 300, vx: 0, vy: 0, properties: { model: 'CP-100', location: '车间A' } },
        { id: 'eq-2', label: '电机', type: 'equipment', x: 200, y: 200, vx: 0, vy: 0, properties: { model: 'M-75kW', location: '车间A' } },
        { id: 'eq-3', label: '减速机', type: 'equipment', x: 600, y: 200, vx: 0, vy: 0, properties: { model: 'GR-50', location: '车间A' } },
        { id: 'eq-4', label: '轴承', type: 'equipment', x: 300, y: 400, vx: 0, vy: 0, properties: { model: 'SKF-6208', location: '离心泵' } },
        { id: 'eq-5', label: '齿轮', type: 'equipment', x: 500, y: 400, vx: 0, vy: 0, properties: { model: 'G-32T', location: '减速机' } },
        
        // 故障节点
        { id: 'fault-1', label: '轴承外圈故障', type: 'fault', x: 150, y: 450, vx: 0, vy: 0, properties: { severity: '严重', frequency: 'BPFO' } },
        { id: 'fault-2', label: '转子不平衡', type: 'fault', x: 100, y: 300, vx: 0, vy: 0, properties: { severity: '中等', frequency: '1X' } },
        { id: 'fault-3', label: '齿面点蚀', type: 'fault', x: 650, y: 350, vx: 0, vy: 0, properties: { severity: '轻微', frequency: 'GMF' } },
        { id: 'fault-4', label: '气蚀', type: 'fault', x: 450, y: 150, vx: 0, vy: 0, properties: { severity: '中等', cause: 'NPSH不足' } },
        
        // 概念节点
        { id: 'concept-1', label: '振动分析', type: 'concept', x: 250, y: 100, vx: 0, vy: 0 },
        { id: 'concept-2', label: '频谱分析', type: 'concept', x: 550, y: 100, vx: 0, vy: 0 },
        { id: 'concept-3', label: '预测性维护', type: 'concept', x: 400, y: 50, vx: 0, vy: 0 },
        
        // 文档节点
        { id: 'doc-1', label: '轴承诊断手册', type: 'document', x: 100, y: 500, vx: 0, vy: 0 },
        { id: 'doc-2', label: '电机维护指南', type: 'document', x: 50, y: 200, vx: 0, vy: 0 },
      ],
      edges: [
        // 设备关系
        { id: 'e-1', source: 'eq-2', target: 'eq-1', label: '驱动', type: 'related_to' },
        { id: 'e-2', source: 'eq-3', target: 'eq-1', label: '连接', type: 'related_to' },
        { id: 'e-3', source: 'eq-4', target: 'eq-1', label: '属于', type: 'belongs_to' },
        { id: 'e-4', source: 'eq-5', target: 'eq-3', label: '属于', type: 'belongs_to' },
        
        // 故障关系
        { id: 'e-5', source: 'fault-1', target: 'eq-4', label: '发生于', type: 'causes' },
        { id: 'e-6', source: 'fault-2', target: 'eq-2', label: '发生于', type: 'causes' },
        { id: 'e-7', source: 'fault-3', target: 'eq-5', label: '发生于', type: 'causes' },
        { id: 'e-8', source: 'fault-4', target: 'eq-1', label: '发生于', type: 'causes' },
        
        // 概念关系
        { id: 'e-9', source: 'concept-1', target: 'fault-1', label: '诊断', type: 'related_to' },
        { id: 'e-10', source: 'concept-1', target: 'fault-2', label: '诊断', type: 'related_to' },
        { id: 'e-11', source: 'concept-2', target: 'fault-3', label: '诊断', type: 'related_to' },
        { id: 'e-12', source: 'concept-3', target: 'concept-1', label: '包含', type: 'contains' },
        { id: 'e-13', source: 'concept-3', target: 'concept-2', label: '包含', type: 'contains' },
        
        // 文档关系
        { id: 'e-14', source: 'doc-1', target: 'fault-1', label: '描述', type: 'related_to' },
        { id: 'e-15', source: 'doc-2', target: 'eq-2', label: '描述', type: 'related_to' },
      ]
    };
    
    setGraphData(sampleData);
  }, []);

  // 力导向布局动画
  useEffect(() => {
    if (!animationEnabled || graphData.nodes.length === 0) return;

    const animate = () => {
      setGraphData(prev => {
        const nodes = [...prev.nodes];
        const edges = prev.edges;
        
        // 力导向算法
        const repulsion = 5000;
        const attraction = 0.01;
        const damping = 0.9;
        const centerX = 400;
        const centerY = 300;
        
        // 计算斥力
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
        
        // 计算引力（边）
        for (const edge of edges) {
          const source = (nodes || []).find(n => n.id === edge.source);
          const target = (nodes || []).find(n => n.id === edge.target);
          if (!source || !target) continue;
          
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          
          const fx = dx * attraction;
          const fy = dy * attraction;
          
          const si = nodes.indexOf(source);
          const ti = nodes.indexOf(target);
          nodes[si].vx += fx;
          nodes[si].vy += fy;
          nodes[ti].vx -= fx;
          nodes[ti].vy -= fy;
        }
        
        // 中心引力
        for (const node of nodes) {
          node.vx += (centerX - node.x) * 0.001;
          node.vy += (centerY - node.y) * 0.001;
        }
        
        // 更新位置
        for (const node of nodes) {
          node.vx *= damping;
          node.vy *= damping;
          node.x += node.vx;
          node.y += node.vy;
          
          // 边界限制
          node.x = Math.max(50, Math.min(750, node.x));
          node.y = Math.max(50, Math.min(550, node.y));
        }
        
        return { nodes, edges };
      });
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animationEnabled, graphData.nodes.length]);

  // 绘制图谱
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 应用变换
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);
    
    // 绘制边
    for (const edge of graphData.edges) {
      const source = (graphData.nodes || []).find(n => n.id === edge.source);
      const target = (graphData.nodes || []).find(n => n.id === edge.target);
      if (!source || !target) continue;
      
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = EDGE_COLORS[edge.type] || '#6B7280';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      // 绘制箭头
      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      const arrowLen = 10;
      const arrowX = target.x - Math.cos(angle) * 25;
      const arrowY = target.y - Math.sin(angle) * 25;
      
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(
        arrowX - arrowLen * Math.cos(angle - Math.PI / 6),
        arrowY - arrowLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        arrowX - arrowLen * Math.cos(angle + Math.PI / 6),
        arrowY - arrowLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fillStyle = EDGE_COLORS[edge.type] || '#6B7280';
      ctx.fill();
      
      // 绘制边标签
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
      
      // 节点阴影
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 5, 0, Math.PI * 2);
        ctx.fillStyle = `${NODE_COLORS[node.type]}40`;
        ctx.fill();
      }
      
      // 节点圆
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = NODE_COLORS[node.type] || '#6B7280';
      ctx.fill();
      
      // 节点边框
      ctx.strokeStyle = isSelected ? '#FFFFFF' : '#1F2937';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();
      
      // 节点标签
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.label.slice(0, 4), node.x, node.y);
      
      // 完整标签
      if (showLabels) {
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#E5E7EB';
        ctx.fillText(node.label, node.x, node.y + radius + 12);
      }
    }
    
    ctx.restore();
  }, [graphData, selectedNode, hoveredNode, zoom, offset, showLabels]);

  // 鼠标事件处理
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset.x) / zoom;
    const y = (e.clientY - rect.top - offset.y) / zoom;
    
    // 检查是否点击了节点
    const clickedNode = (graphData.nodes || []).find(node => {
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
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
      return;
    }
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset.x) / zoom;
    const y = (e.clientY - rect.top - offset.y) / zoom;
    
    const hovered = (graphData.nodes || []).find(node => {
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

  // 过滤节点
  const filteredNodes = (graphData.nodes || []).filter(node => {
    const matchesSearch = node.label.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || node.type === filterType;
    return matchesSearch && matchesType;
  });

  // 统计数据
  const stats = {
    totalNodes: graphData.nodes.length,
    totalEdges: graphData.edges.length,
    entityCount: (graphData.nodes || []).filter(n => n.type === 'entity').length,
    equipmentCount: (graphData.nodes || []).filter(n => n.type === 'equipment').length,
    faultCount: (graphData.nodes || []).filter(n => n.type === 'fault').length,
    conceptCount: (graphData.nodes || []).filter(n => n.type === 'concept').length
  };

  // 添加节点
  const addNode = () => {
    const newNode: GraphNode = {
      id: `node-${Date.now()}`,
      label: '新节点',
      type: 'entity',
      x: 400 + Math.random() * 100 - 50,
      y: 300 + Math.random() * 100 - 50,
      vx: 0,
      vy: 0
    };
    setGraphData(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));
  };

  // 删除选中节点
  const deleteSelectedNode = () => {
    if (!selectedNode) return;
    setGraphData(prev => ({
      nodes: (prev.nodes || []).filter(n => n.id !== selectedNode.id),
      edges: (prev.edges || []).filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id)
    }));
    setSelectedNode(null);
  };

  // 导出图谱
  const exportGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = `knowledge-graph-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // 重置视图
  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <MainLayout title="知识图谱">
      <div className="space-y-4">
        {/* 页面头部 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">知识图谱</h1>
            <p className="text-gray-400 text-sm mt-1">可视化实体关系网络，支持交互式探索和编辑</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={addNode}>
              ➕ 添加节点
            </Button>
            <Button variant="outline" size="sm" onClick={exportGraph}>
              📥 导出图片
            </Button>
            <Button variant="outline" size="sm" onClick={resetView}>
              🔄 重置视图
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
                  <button
                    onClick={() => setZoom(z => Math.min(3, z * 1.2))}
                    className="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded text-white"
                  >
                    +
                  </button>
                  <button
                    onClick={() => setZoom(z => Math.max(0.3, z / 1.2))}
                    className="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded text-white"
                  >
                    -
                  </button>
                  <button
                    onClick={() => setShowLabels(!showLabels)}
                    className={`w-8 h-8 rounded text-white ${showLabels ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                    title="显示标签"
                  >
                    T
                  </button>
                  <button
                    onClick={() => setAnimationEnabled(!animationEnabled)}
                    className={`w-8 h-8 rounded text-white ${animationEnabled ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                    title="力导向布局"
                  >
                    ⚡
                  </button>
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
                          {type === 'entity' ? '实体' :
                           type === 'concept' ? '概念' :
                           type === 'document' ? '文档' :
                           type === 'equipment' ? '设备' : '故障'}
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
                    <div 
                      className="w-4 h-4 rounded-full" 
                      style={{ backgroundColor: NODE_COLORS[selectedNode.type] }}
                    />
                    <span className="text-white font-medium">{selectedNode.label}</span>
                  </div>
                  <div className="text-sm">
                    <div className="text-gray-400">类型</div>
                    <Badge variant={
                      selectedNode.type === 'fault' ? 'danger' :
                      selectedNode.type === 'equipment' ? 'warning' :
                      selectedNode.type === 'concept' ? 'info' : 'default'
                    }>
                      {selectedNode.type === 'entity' ? '实体' :
                       selectedNode.type === 'concept' ? '概念' :
                       selectedNode.type === 'document' ? '文档' :
                       selectedNode.type === 'equipment' ? '设备' : '故障'}
                    </Badge>
                  </div>
                  {selectedNode.properties && (
                    <div className="text-sm">
                      <div className="text-gray-400 mb-1">属性</div>
                      {Object.entries(selectedNode.properties).map(([key, value]) => (
                        <div key={key} className="flex justify-between py-1 border-b border-gray-700">
                          <span className="text-gray-400">{key}</span>
                          <span className="text-white">{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-sm">
                    <div className="text-gray-400 mb-1">关联关系</div>
                    <div className="text-gray-300">
                      {(graphData.edges || []).filter(e => e.source === selectedNode.id || e.target === selectedNode.id).length} 条
                    </div>
                  </div>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="w-full"
                    onClick={deleteSelectedNode}
                  >
                    删除节点
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
                {(filteredNodes || []).map(node => (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                      selectedNode?.id === node.id 
                        ? 'bg-blue-600/30 border border-blue-500' 
                        : 'hover:bg-gray-700'
                    }`}
                  >
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: NODE_COLORS[node.type] }}
                    />
                    <span className="text-white text-sm truncate">{node.label}</span>
                  </div>
                ))}
              </div>
            </PageCard>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
