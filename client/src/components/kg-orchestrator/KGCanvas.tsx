/**
 * 知识图谱编排器 — 画布组件
 * 渲染节点和关系连线，支持拖拽、选中、连线
 */
import { useCallback, useRef, useState, useEffect } from "react";
import { useKGOrchestratorStore } from "../../stores/kgOrchestratorStore";
import { getKGNodeTypeInfo, getKGRelationTypeInfo, ALL_KG_RELATION_TYPES } from "../../../../shared/kgOrchestratorTypes";
import type { KGNodeCategory, KGNodeSubType, KGRelationType } from "../../../../shared/kgOrchestratorTypes";

const NODE_W = 180;
const NODE_H = 72;

export default function KGCanvas() {
  const {
    nodes, edges, selectedNodeId, selectedEdgeId, zoom, panX, panY,
    connectingFrom, connectingRelationType,
    addNode, selectNode, selectEdge, updateNode, removeNode, removeEdge,
    startConnecting, finishConnecting, cancelConnecting,
    setZoom, setPan,
  } = useKGOrchestratorStore();

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const [panning, setPanning] = useState<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string; edgeId?: string } | null>(null);
  const [relationPicker, setRelationPicker] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [hasFittedView, setHasFittedView] = useState(false);

  // ============ 适应画布居中 ============
  const fitToView = useCallback(() => {
    if (!nodes.length || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cw = rect.width, ch = rect.height;
    if (cw === 0 || ch === 0) return;
    const PAD = 60;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_W); maxY = Math.max(maxY, n.y + NODE_H);
    }
    if (!isFinite(minX)) return;
    const bw = maxX - minX + PAD * 2, bh = maxY - minY + PAD * 2;
    const newZoom = Math.max(0.15, Math.min(1.5, Math.min(cw / bw, ch / bh)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setZoom(newZoom);
    setPan(cw / 2 - centerX * newZoom, ch / 2 - centerY * newZoom);
  }, [nodes, setZoom, setPan]);

  // 数据首次加载后自动居中
  useEffect(() => {
    if (nodes.length > 0 && !hasFittedView) {
      requestAnimationFrame(() => {
        fitToView();
        setHasFittedView(true);
      });
    }
  }, [nodes.length, hasFittedView, fitToView]);

  // ============ 坐标转换 ============
  const screenToCanvas = useCallback((sx: number, sy: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (sx - rect.left - panX) / zoom,
      y: (sy - rect.top - panY) / zoom,
    };
  }, [zoom, panX, panY]);

  // ============ 拖拽放置（从组件面板拖入） ============
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData("application/kg-node");
    if (!data) return;
    try {
      const { category, subType, label } = JSON.parse(data) as { category: KGNodeCategory; subType: KGNodeSubType; label: string };
      const pos = screenToCanvas(e.clientX, e.clientY);
      addNode(category, subType, label, pos.x - NODE_W / 2, pos.y - NODE_H / 2);
    } catch { /* ignore */ }
  }, [addNode, screenToCanvas]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  // ============ 节点拖拽移动（支持多选） ============
  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const node = nodes.find(n => n.nodeId === nodeId);
    if (!node) return;
    const pos = screenToCanvas(e.clientX, e.clientY);

    // Ctrl/Meta + 点击：切换多选
    if (e.ctrlKey || e.metaKey) {
      setSelectedNodeIds(prev => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
        return next;
      });
      return;
    }

    // 如果拖动的节点不在多选集中，清空多选
    if (!selectedNodeIds.has(nodeId)) {
      setSelectedNodeIds(new Set());
    }

    setDragging({ nodeId, offsetX: pos.x - node.x, offsetY: pos.y - node.y });
    selectNode(nodeId);
  }, [nodes, screenToCanvas, selectNode, selectedNodeIds]);

  // ============ 画布平移 ============
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      setPanning({ startX: e.clientX, startY: e.clientY, startPanX: panX, startPanY: panY });
    } else if (e.button === 0) {
      // 左键点击空白区域：开始平移 + 取消选中
      setPanning({ startX: e.clientX, startY: e.clientY, startPanX: panX, startPanY: panY });
      selectNode(null);
      selectEdge(null);
      setContextMenu(null);
      setRelationPicker(null);
      if (!e.ctrlKey && !e.metaKey) setSelectedNodeIds(new Set());
    }
  }, [panX, panY, selectNode, selectEdge]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pos = screenToCanvas(e.clientX, e.clientY);
    setMousePos(pos);

    if (dragging) {
      const newX = pos.x - dragging.offsetX;
      const newY = pos.y - dragging.offsetY;
      const node = nodes.find(n => n.nodeId === dragging.nodeId);
      if (node) {
        const dx = newX - node.x;
        const dy = newY - node.y;
        // 多选整体拖动
        if (selectedNodeIds.size > 0 && selectedNodeIds.has(dragging.nodeId)) {
          Array.from(selectedNodeIds).forEach(nid => {
            const n = nodes.find(nd => nd.nodeId === nid);
            if (n) updateNode(nid, { x: n.x + dx, y: n.y + dy });
          });
        } else {
          updateNode(dragging.nodeId, { x: newX, y: newY });
        }
      }
    }
    if (panning) {
      setPan(
        panning.startPanX + (e.clientX - panning.startX),
        panning.startPanY + (e.clientY - panning.startY),
      );
    }
  }, [dragging, panning, screenToCanvas, updateNode, setPan, nodes, selectedNodeIds]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setPanning(null);
  }, []);

  // ============ 缩放 ============
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom(Math.max(0.15, Math.min(2.5, zoom + delta)));
  }, [zoom, setZoom]);

  // ============ 右键菜单 ============
  const handleContextMenu = useCallback((e: React.MouseEvent, nodeId?: string, edgeId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId, edgeId });
  }, []);

  // ============ 连线：点击输出端口 → 选择关系类型 ============
  const handleOutputPortClick = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setRelationPicker({ nodeId, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleRelationSelect = useCallback((relationType: KGRelationType) => {
    if (relationPicker) {
      startConnecting(relationPicker.nodeId, relationType);
      setRelationPicker(null);
    }
  }, [relationPicker, startConnecting]);

  const handleInputPortClick = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (connectingFrom) {
      finishConnecting(nodeId);
    }
  }, [connectingFrom, finishConnecting]);

  // ============ ESC 取消连线 ============
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelConnecting();
        setContextMenu(null);
        setRelationPicker(null);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeId) removeNode(selectedNodeId);
        if (selectedEdgeId) removeEdge(selectedEdgeId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cancelConnecting, selectedNodeId, selectedEdgeId, removeNode, removeEdge]);

  // ============ 渲染连线 ============
  const renderEdge = (edge: typeof edges[0]) => {
    const src = nodes.find(n => n.nodeId === edge.sourceNodeId);
    const tgt = nodes.find(n => n.nodeId === edge.targetNodeId);
    if (!src || !tgt) return null;

    const x1 = src.x + NODE_W;
    const y1 = src.y + NODE_H / 2;
    const x2 = tgt.x;
    const y2 = tgt.y + NODE_H / 2;
    const cx1 = x1 + Math.abs(x2 - x1) * 0.4;
    const cx2 = x2 - Math.abs(x2 - x1) * 0.4;

    const relInfo = getKGRelationTypeInfo(edge.relationType);
    const color = relInfo?.color ?? "#94A3B8";
    const isSelected = selectedEdgeId === edge.edgeId;

    return (
      <g key={edge.edgeId}>
        {/* 点击热区 */}
        <path
          d={`M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`}
          fill="none" stroke="transparent" strokeWidth={12} className="cursor-pointer"
          onClick={(e) => { e.stopPropagation(); selectEdge(edge.edgeId); }}
          onContextMenu={(e) => handleContextMenu(e, undefined, edge.edgeId)}
        />
        {/* 可见线 */}
        <path
          d={`M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`}
          fill="none" stroke={color} strokeWidth={isSelected ? 3 : 2}
          strokeDasharray={isSelected ? "none" : "none"}
          markerEnd="url(#arrowhead)"
          style={{ filter: isSelected ? `drop-shadow(0 0 4px ${color})` : undefined }}
        />
        {/* 关系标签 */}
        <text
          x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8}
          textAnchor="middle" fontSize={11} fill={color}
          className="pointer-events-none select-none"
          fontWeight={isSelected ? 600 : 400}
        >
          {edge.label ?? relInfo?.label ?? edge.relationType}
        </text>
        {/* 权重 */}
        {edge.weight !== 1 && (
          <text
            x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 10}
            textAnchor="middle" fontSize={9} fill="#94A3B8"
            className="pointer-events-none select-none"
          >
            权重: {edge.weight}
          </text>
        )}
      </g>
    );
  };

  // ============ 渲染节点 ============
  const renderNode = (node: typeof nodes[0]) => {
    const info = getKGNodeTypeInfo(node.subType);
    const isSelected = selectedNodeId === node.nodeId;
    const isConnecting = connectingFrom === node.nodeId;
    const color = info?.color ?? "#64748B";

    return (
      <g key={node.nodeId}>
        {/* 多选高亮 */}
        {selectedNodeIds.has(node.nodeId) && !isSelected && (
          <rect
            x={node.x - 3} y={node.y - 3} width={NODE_W + 6} height={NODE_H + 6} rx={10}
            fill="none" stroke="#3B82F6" strokeWidth={2} strokeDasharray="6 3"
          />
        )}
        {/* 节点主体 */}
        <rect
          x={node.x} y={node.y} width={NODE_W} height={NODE_H} rx={8}
          fill={isSelected ? `${color}22` : selectedNodeIds.has(node.nodeId) ? `${color}15` : "#1E293B"}
          stroke={isSelected ? color : isConnecting ? "#F59E0B" : selectedNodeIds.has(node.nodeId) ? "#3B82F6" : "#334155"}
          strokeWidth={isSelected ? 2.5 : selectedNodeIds.has(node.nodeId) ? 2 : 1.5}
          className="cursor-grab"
          style={{ filter: isSelected ? `drop-shadow(0 0 8px ${color}40)` : undefined }}
          onMouseDown={(e) => handleNodeMouseDown(e, node.nodeId)}
          onContextMenu={(e) => handleContextMenu(e, node.nodeId)}
        />
        {/* 图标 */}
        <text x={node.x + 14} y={node.y + 30} fontSize={20} className="pointer-events-none select-none">
          {info?.icon ?? "📦"}
        </text>
        {/* 标签 */}
        <text x={node.x + 40} y={node.y + 26} fontSize={13} fill="#F1F5F9" fontWeight={600}
          className="pointer-events-none select-none">
          {node.label.length > 10 ? node.label.slice(0, 10) + "…" : node.label}
        </text>
        {/* 子类型 */}
        <text x={node.x + 40} y={node.y + 44} fontSize={10} fill="#94A3B8"
          className="pointer-events-none select-none">
          {info?.description?.slice(0, 14) ?? node.subType}
        </text>
        {/* 状态指示 */}
        {node.nodeStatus === "deprecated" && (
          <rect x={node.x} y={node.y} width={NODE_W} height={NODE_H} rx={8}
            fill="#EF444420" stroke="#EF4444" strokeWidth={1} strokeDasharray="4 2"
            className="pointer-events-none" />
        )}
        {node.nodeStatus === "pending_confirm" && (
          <rect x={node.x} y={node.y} width={NODE_W} height={NODE_H} rx={8}
            fill="#F59E0B15" stroke="#F59E0B" strokeWidth={1} strokeDasharray="4 2"
            className="pointer-events-none" />
        )}
        {/* 命中次数 */}
        {(node.hitCount ?? 0) > 0 && (
          <g>
            <rect x={node.x + NODE_W - 32} y={node.y - 8} width={36} height={16} rx={8}
              fill="#3B82F6" />
            <text x={node.x + NODE_W - 14} y={node.y + 4} fontSize={9} fill="white"
              textAnchor="middle" className="pointer-events-none select-none">
              ×{node.hitCount}
            </text>
          </g>
        )}
        {/* 输入端口（左侧） */}
        <circle
          cx={node.x} cy={node.y + NODE_H / 2} r={6}
          fill={connectingFrom ? "#22C55E" : "#475569"} stroke="#0F172A" strokeWidth={2}
          className="cursor-crosshair"
          onClick={(e) => handleInputPortClick(e, node.nodeId)}
        />
        {/* 输出端口（右侧） */}
        <circle
          cx={node.x + NODE_W} cy={node.y + NODE_H / 2} r={6}
          fill={isConnecting ? "#F59E0B" : "#22C55E"} stroke="#0F172A" strokeWidth={2}
          className="cursor-crosshair"
          onClick={(e) => handleOutputPortClick(e, node.nodeId)}
        />
        {/* 类别色条 */}
        <rect x={node.x} y={node.y} width={4} height={NODE_H} rx={2}
          fill={color} className="pointer-events-none" />
      </g>
    );
  };

  // ============ 渲染连线中的临时线 ============
  const renderConnectingLine = () => {
    if (!connectingFrom) return null;
    const src = nodes.find(n => n.nodeId === connectingFrom);
    if (!src) return null;
    const x1 = src.x + NODE_W;
    const y1 = src.y + NODE_H / 2;
    const relInfo = connectingRelationType ? getKGRelationTypeInfo(connectingRelationType) : null;
    return (
      <line
        x1={x1} y1={y1} x2={mousePos.x} y2={mousePos.y}
        stroke={relInfo?.color ?? "#F59E0B"} strokeWidth={2} strokeDasharray="6 3"
        className="pointer-events-none"
      />
    );
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* 状态栏 + 工具栏 */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-3 bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-700/50 text-xs text-slate-400">
        <span>{nodes.length} 节点</span>
        <span className="text-slate-600">·</span>
        <span>{edges.length} 关系</span>
        <span className="text-slate-600">·</span>
        <span>{Math.round(zoom * 100)}%</span>
        {selectedNodeIds.size > 0 && (
          <>
            <span className="text-slate-600">·</span>
            <span className="text-blue-400">已选 {selectedNodeIds.size} 节点</span>
          </>
        )}
        {connectingFrom && (
          <>
            <span className="text-slate-600">·</span>
            <span className="text-amber-400">连线中 (ESC取消)</span>
          </>
        )}
        <span className="text-slate-600">·</span>
        <button
          className="text-slate-300 hover:text-white transition-colors px-1.5 py-0.5 rounded hover:bg-slate-700"
          onClick={fitToView}
          title="适应画布居中"
        >
          ⊞ 居中
        </button>
        <button
          className="text-slate-300 hover:text-white transition-colors px-1.5 py-0.5 rounded hover:bg-slate-700"
          onClick={() => {
            if (selectedNodeIds.size === nodes.length) setSelectedNodeIds(new Set());
            else setSelectedNodeIds(new Set(nodes.map(n => n.nodeId)));
          }}
          title="全选/取消全选 (Ctrl+点击多选)"
        >
          {selectedNodeIds.size > 0 ? '✕ 取消选' : '☐ 全选'}
        </button>
      </div>

      {/* SVG 画布 */}
      <svg
        ref={svgRef}
        className="w-full h-full"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => handleContextMenu(e)}
      >
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#94A3B8" />
          </marker>
          <pattern id="kg-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.5" fill="#334155" />
          </pattern>
        </defs>

        <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
          {/* 网格 */}
          <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#kg-grid)" />

          {/* 关系连线 */}
          {edges.map(renderEdge)}

          {/* 临时连线 */}
          {renderConnectingLine()}

          {/* 节点 */}
          {nodes.map(renderNode)}
        </g>
      </svg>

      {/* 关系类型选择器 */}
      {relationPicker && (
        <div
          className="absolute z-30 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 max-h-64 overflow-y-auto"
          style={{ left: relationPicker.x, top: relationPicker.y }}
        >
          <div className="px-3 py-1.5 text-xs text-slate-400 border-b border-slate-700">选择关系类型</div>
          {ALL_KG_RELATION_TYPES.map(rel => (
            <button
              key={rel.type}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-700 flex items-center gap-2"
              onClick={() => handleRelationSelect(rel.type)}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: rel.color }} />
              <span className="text-slate-200">{rel.label}</span>
              <span className="text-xs text-slate-500 ml-auto">{rel.description.slice(0, 8)}</span>
            </button>
          ))}
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="absolute z-30 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.nodeId && (
            <>
              <button className="w-full px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-700"
                onClick={() => { selectNode(contextMenu.nodeId!); setContextMenu(null); }}>
                编辑节点
              </button>
              <button className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-slate-700"
                onClick={() => { removeNode(contextMenu.nodeId!); setContextMenu(null); }}>
                删除节点
              </button>
            </>
          )}
          {contextMenu.edgeId && (
            <>
              <button className="w-full px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-700"
                onClick={() => { selectEdge(contextMenu.edgeId!); setContextMenu(null); }}>
                编辑关系
              </button>
              <button className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-slate-700"
                onClick={() => { removeEdge(contextMenu.edgeId!); setContextMenu(null); }}>
                删除关系
              </button>
            </>
          )}
          {!contextMenu.nodeId && !contextMenu.edgeId && (
            <button className="w-full px-3 py-1.5 text-left text-sm text-slate-400" disabled>
              空白区域
            </button>
          )}
        </div>
      )}

      {/* 空画布提示 */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-slate-500">
            <div className="text-4xl mb-3">🧠</div>
            <div className="text-sm font-medium">从左侧拖拽节点到画布</div>
            <div className="text-xs mt-1">构建诊断知识图谱</div>
          </div>
        </div>
      )}
    </div>
  );
}
