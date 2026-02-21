/**
 * ============================================================================
 * Phase 2 — 因果图可视化
 * ============================================================================
 * 交互式因果关系图谱，支持域筛选、节点选中、路径追溯
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

// ============================================================================
// 类型
// ============================================================================

interface GraphNode {
  id: string; label: string; type: 'symptom' | 'mechanism' | 'root_cause' | 'condition';
  domain: string; priorProbability: number; sensorTags: string[];
}

interface GraphEdge {
  id: string; source: string; target: string; weight: number;
  mechanism: string; evidenceCount: number; source_type: string;
}

// ============================================================================
// 颜色映射
// ============================================================================

const domainColors: Record<string, string> = {
  bearing_fault: '#ef4444',
  gear_damage: '#f97316',
  motor_degradation: '#eab308',
  structural_fatigue: '#22c55e',
  hydraulic_leak: '#3b82f6',
  wire_rope_break: '#8b5cf6',
  pump_cavitation: '#06b6d4',
  insulation_aging: '#ec4899',
};

const domainLabels: Record<string, string> = {
  bearing_fault: '轴承故障',
  gear_damage: '齿轮损伤',
  motor_degradation: '电机退化',
  structural_fatigue: '结构疲劳',
  hydraulic_leak: '液压泄漏',
  wire_rope_break: '钢丝绳断股',
  pump_cavitation: '泵气蚀',
  insulation_aging: '绝缘老化',
};

const typeLabels: Record<string, string> = {
  symptom: '症状',
  mechanism: '机理',
  root_cause: '根因',
  condition: '工况',
};

const typeShapes: Record<string, string> = {
  symptom: '◆',
  mechanism: '●',
  root_cause: '■',
  condition: '▲',
};

// ============================================================================
// 简单力导向布局（Canvas 渲染）
// ============================================================================

interface LayoutNode extends GraphNode {
  x: number; y: number; vx: number; vy: number;
}

function useForceLayout(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number) {
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([]);

  useEffect(() => {
    if (nodes.length === 0) return;

    // 按域分组，初始化位置
    const domains = [...new Set(nodes.map(n => n.domain))];
    const angleStep = (2 * Math.PI) / domains.length;
    const radius = Math.min(width, height) * 0.3;

    const ln: LayoutNode[] = nodes.map(n => {
      const domainIdx = domains.indexOf(n.domain);
      const angle = angleStep * domainIdx;
      const jitter = (Math.random() - 0.5) * 80;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * radius + jitter,
        y: height / 2 + Math.sin(angle) * radius + jitter,
        vx: 0, vy: 0,
      };
    });

    // 简单力导向迭代
    const iterations = 80;
    for (let iter = 0; iter < iterations; iter++) {
      const alpha = 1 - iter / iterations;

      // 斥力
      for (let i = 0; i < ln.length; i++) {
        for (let j = i + 1; j < ln.length; j++) {
          const dx = ln[j].x - ln[i].x;
          const dy = ln[j].y - ln[i].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = (800 * alpha) / (dist * dist);
          ln[i].vx -= (dx / dist) * force;
          ln[i].vy -= (dy / dist) * force;
          ln[j].vx += (dx / dist) * force;
          ln[j].vy += (dy / dist) * force;
        }
      }

      // 引力（边）
      for (const edge of edges) {
        const src = ln.find(n => n.id === edge.source);
        const tgt = ln.find(n => n.id === edge.target);
        if (!src || !tgt) continue;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = dist * 0.01 * alpha * edge.weight;
        src.vx += (dx / dist) * force;
        src.vy += (dy / dist) * force;
        tgt.vx -= (dx / dist) * force;
        tgt.vy -= (dy / dist) * force;
      }

      // 中心引力
      for (const n of ln) {
        n.vx += (width / 2 - n.x) * 0.001 * alpha;
        n.vy += (height / 2 - n.y) * 0.001 * alpha;
      }

      // 应用速度
      for (const n of ln) {
        n.vx *= 0.6;
        n.vy *= 0.6;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(40, Math.min(width - 40, n.x));
        n.y = Math.max(40, Math.min(height - 40, n.y));
      }
    }

    setLayoutNodes(ln);
  }, [nodes, edges, width, height]);

  return layoutNodes;
}

// ============================================================================
// Canvas 图谱渲染
// ============================================================================

function CausalCanvas({ nodes, edges, selectedNode, onNodeClick, domainFilter, width, height }: {
  nodes: GraphNode[]; edges: GraphEdge[]; selectedNode: string | null;
  onNodeClick: (id: string | null) => void; domainFilter: string; width: number; height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const filteredNodes = useMemo(() => domainFilter === 'all' ? nodes : nodes.filter(n => n.domain === domainFilter), [nodes, domainFilter]);
  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map(n => n.id)), [filteredNodes]);
  const filteredEdges = useMemo(() => edges.filter(e => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)), [edges, filteredNodeIds]);
  const layoutNodes = useForceLayout(filteredNodes, filteredEdges, width, height);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || layoutNodes.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // 绘制边
    for (const edge of filteredEdges) {
      const src = layoutNodes.find(n => n.id === edge.source);
      const tgt = layoutNodes.find(n => n.id === edge.target);
      if (!src || !tgt) continue;

      const isHighlighted = selectedNode && (edge.source === selectedNode || edge.target === selectedNode);
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = isHighlighted ? '#3b82f6' : 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = isHighlighted ? 2 : Math.max(0.5, edge.weight * 2);
      ctx.stroke();

      // 箭头
      const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x);
      const arrowLen = 8;
      const midX = (src.x + tgt.x) / 2;
      const midY = (src.y + tgt.y) / 2;
      ctx.beginPath();
      ctx.moveTo(midX + arrowLen * Math.cos(angle), midY + arrowLen * Math.sin(angle));
      ctx.lineTo(midX + arrowLen * Math.cos(angle + 2.5), midY + arrowLen * Math.sin(angle + 2.5));
      ctx.lineTo(midX + arrowLen * Math.cos(angle - 2.5), midY + arrowLen * Math.sin(angle - 2.5));
      ctx.closePath();
      ctx.fillStyle = isHighlighted ? '#3b82f6' : 'rgba(148, 163, 184, 0.4)';
      ctx.fill();
    }

    // 绘制节点
    for (const node of layoutNodes) {
      const isSelected = node.id === selectedNode;
      const color = domainColors[node.domain] || '#94a3b8';
      const radius = node.type === 'root_cause' ? 10 : node.type === 'symptom' ? 8 : 6;

      ctx.beginPath();
      if (node.type === 'root_cause') {
        ctx.rect(node.x - radius, node.y - radius, radius * 2, radius * 2);
      } else if (node.type === 'symptom') {
        // 菱形
        ctx.moveTo(node.x, node.y - radius);
        ctx.lineTo(node.x + radius, node.y);
        ctx.lineTo(node.x, node.y + radius);
        ctx.lineTo(node.x - radius, node.y);
        ctx.closePath();
      } else {
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = isSelected ? '#ffffff' : color;
      ctx.fill();
      ctx.strokeStyle = isSelected ? color : 'rgba(0,0,0,0.3)';
      ctx.lineWidth = isSelected ? 3 : 1;
      ctx.stroke();

      // 标签
      ctx.font = '10px system-ui';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, node.x, node.y + radius + 12);
    }
  }, [layoutNodes, filteredEdges, selectedNode, width, height]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clicked = layoutNodes.find(n => {
      const dx = n.x - x;
      const dy = n.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 15;
    });
    onNodeClick(clicked?.id ?? null);
  }, [layoutNodes, onNodeClick]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, cursor: 'pointer' }}
      onClick={handleCanvasClick}
    />
  );
}

// ============================================================================
// 主组件
// ============================================================================

export function CausalGraphView() {
  const [domainFilter, setDomainFilter] = useState('all');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const graphQuery = trpc.evoCognition.reasoningEngine.getCausalGraph.useQuery(undefined, { retry: 2 });
  const pathsQuery = trpc.evoCognition.reasoningEngine.getCausalPaths.useQuery(
    { symptomId: selectedNode ?? '', maxDepth: 5 },
    { enabled: !!selectedNode && graphQuery.data?.nodes.find(n => n.id === selectedNode)?.type === 'symptom', retry: 2 }
  );

  const graph = graphQuery.data;

  if (graphQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-muted-foreground">加载因果图...</span>
      </div>
    );
  }

  if (!graph) return <div className="text-center py-8 text-xs text-muted-foreground">无法加载因果图数据</div>;

  const selectedNodeData = graph.nodes.find(n => n.id === selectedNode);
  const connectedEdges = selectedNode
    ? graph.edges.filter(e => e.source === selectedNode || e.target === selectedNode)
    : [];

  return (
    <div className="space-y-3">
      {/* 统计概览 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard value={graph.stats.nodeCount} label="节点数" icon="🔵" />
        <StatCard value={graph.stats.edgeCount} label="边数" icon="🔗" />
        <StatCard value={graph.stats.domains.length} label="异常域" icon="🏷️" />
        <StatCard value={graph.stats.avgEdgeWeight.toFixed(2)} label="平均边权" icon="⚖️" />
      </div>

      {/* 工具栏 */}
      <div className="flex items-center gap-2">
        <Select value={domainFilter} onValueChange={setDomainFilter}>
          <SelectTrigger className="w-[160px] h-7 text-xs"><SelectValue placeholder="筛选异常域" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部异常域</SelectItem>
            {graph.stats.domains.map(d => (
              <SelectItem key={d} value={d}>
                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: domainColors[d] }} />
                {domainLabels[d] || d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedNode && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelectedNode(null)}>
            清除选中
          </Button>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>■ 根因</span>
          <span>◆ 症状</span>
          <span>● 机理</span>
        </div>
      </div>

      {/* 图谱 + 详情 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <PageCard noPadding className="overflow-hidden">
            <div className="bg-slate-900 rounded-lg" style={{ minHeight: 400 }}>
              <CausalCanvas
                nodes={graph.nodes}
                edges={graph.edges}
                selectedNode={selectedNode}
                onNodeClick={setSelectedNode}
                domainFilter={domainFilter}
                width={700}
                height={400}
              />
            </div>
          </PageCard>
        </div>

        <div className="space-y-3">
          {/* 节点详情 */}
          {selectedNodeData ? (
            <PageCard title={`${typeShapes[selectedNodeData.type]} ${selectedNodeData.label}`} icon="">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{typeLabels[selectedNodeData.type]}</Badge>
                  <Badge className="text-[10px]" style={{ backgroundColor: domainColors[selectedNodeData.domain] }}>
                    {domainLabels[selectedNodeData.domain]}
                  </Badge>
                </div>
                <div className="text-xs"><span className="text-muted-foreground">先验概率: </span><span className="font-mono">{selectedNodeData.priorProbability.toFixed(2)}</span></div>
                {selectedNodeData.sensorTags.length > 0 && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">关联测点: </span>
                    {selectedNodeData.sensorTags.map(t => <Badge key={t} variant="outline" className="text-[10px] mr-0.5">{t}</Badge>)}
                  </div>
                )}
                {connectedEdges.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[10px] text-muted-foreground mb-1">关联因果边 ({connectedEdges.length})</div>
                    <ScrollArea className="max-h-[200px]">
                      {connectedEdges.map(e => (
                        <div key={e.id} className="text-[10px] py-1 border-b border-border last:border-0">
                          <div className="flex items-center gap-1">
                            <span className="font-mono">{e.source}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-mono">{e.target}</span>
                            <Badge variant="outline" className="text-[10px] ml-auto">{e.weight.toFixed(2)}</Badge>
                          </div>
                          <div className="text-muted-foreground truncate">{e.mechanism}</div>
                        </div>
                      ))}
                    </ScrollArea>
                  </div>
                )}
              </div>
            </PageCard>
          ) : (
            <PageCard>
              <div className="text-center py-4 text-xs text-muted-foreground">
                点击图谱中的节点查看详情
              </div>
            </PageCard>
          )}

          {/* 因果路径追溯 */}
          {pathsQuery.data && pathsQuery.data.length > 0 && (
            <PageCard title="因果路径追溯" icon="🔍">
              <ScrollArea className="max-h-[200px]">
                {pathsQuery.data.map((trace, i) => (
                  <div key={i} className="py-1.5 border-b border-border last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium">路径 {i + 1}</span>
                      <Badge variant="outline" className="text-[10px]">权重 {trace.pathWeight.toFixed(3)}</Badge>
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      {trace.path.join(' → ')}
                    </div>
                    {trace.mechanisms.map((m, j) => (
                      <div key={j} className="text-[10px] text-muted-foreground pl-2">• {m}</div>
                    ))}
                  </div>
                ))}
              </ScrollArea>
            </PageCard>
          )}
        </div>
      </div>
    </div>
  );
}
