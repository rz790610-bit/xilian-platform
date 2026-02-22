/**
 * ERDiagram — 数据库架构视图 (ER图) + 拓扑同步预览
 * V4.0: 接入 Schema Registry (64张表 × 11个域)，消除硬编码 Mock 数据
 * Design: 可缩放画布 + 表卡片(按域着色) + 关系连线 + 拓扑预览面板
 */
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ZoomIn, ZoomOut, Maximize2, Download, Filter, Eye, EyeOff,
  Key, Hash, Type, Calendar, FileJson, X, Network, ArrowRight,
  Database, Search
} from "lucide-react";
import { toast } from "sonner";
import { useTableSchema } from "@/hooks/useTableSchema";
import { resolveIcon } from "@/data/icon-resolver";

const TABLE_WIDTH = 260;
const HEADER_HEIGHT = 32;
const ROW_HEIGHT = 22;
const MAX_VISIBLE_COLS = 8; // 超过此数量的字段折叠显示

function getTypeIcon(type: string) {
  if (type.match(/INT|BIGINT|TINYINT|SMALLINT|DECIMAL|FLOAT|DOUBLE/i)) return Hash;
  if (type.match(/VARCHAR|CHAR|TEXT|ENUM/i)) return Type;
  if (type.match(/DATETIME|TIMESTAMP|DATE|TIME/i)) return Calendar;
  if (type.match(/JSON|BOOLEAN/i)) return FileJson;
  return Hash;
}

interface TableNodeState {
  id: string;
  x: number;
  y: number;
}

export default function ERDiagram() {
  const schema = useTableSchema();

  // Canvas state
  const [zoom, setZoom] = useState(0.55);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showRelations, setShowRelations] = useState(true);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [filterDomain, setFilterDomain] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);

  // Positions state — initialized from ER_POSITIONS, then draggable
  const [positions, setPositions] = useState<Record<string, TableNodeState>>(() => {
    const pos: Record<string, TableNodeState> = {};
    schema.allTables.forEach(t => {
      const p = schema.getERPosition(t.tableName);
      pos[t.tableName] = { id: t.tableName, x: p.x, y: p.y };
    });
    return pos;
  });

  // Filtered tables
  const filteredTables = useMemo(() => {
    let tables = schema.allTables;
    if (filterDomain !== "all") {
      tables = tables.filter(t => t.domain === filterDomain);
    }
    if (searchQuery.trim()) {
      const kw = searchQuery.toLowerCase();
      tables = tables.filter(t =>
        t.tableName.toLowerCase().includes(kw) ||
        t.tableComment.toLowerCase().includes(kw)
      );
    }
    return tables;
  }, [schema.allTables, filterDomain, searchQuery]);

  const filteredTableNames = useMemo(() => new Set(filteredTables.map(t => t.tableName)), [filteredTables]);

  // Filtered relations
  const filteredRelations = useMemo(() => {
    return schema.relations.filter(r =>
      filteredTableNames.has(r.from) && filteredTableNames.has(r.to)
    );
  }, [schema.relations, filteredTableNames]);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent, tableId: string) => {
    e.stopPropagation();
    setDragging(tableId);
    setDragStart({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).tagName === "svg") {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) {
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;
      setPositions(prev => ({
        ...prev,
        [dragging]: { ...prev[dragging], x: (prev[dragging]?.x || 0) + dx, y: (prev[dragging]?.y || 0) + dy },
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [dragging, dragStart, zoom, isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setIsPanning(false);
  }, []);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom(z => Math.max(0.2, Math.min(2, z - e.deltaY * 0.001)));
      }
    };
    const el = canvasRef.current;
    if (el) el.addEventListener("wheel", handleWheel, { passive: false });
    return () => { if (el) el.removeEventListener("wheel", handleWheel); };
  }, []);

  const handleTableClick = useCallback((tableId: string) => {
    setSelectedTable(prev => prev === tableId ? null : tableId);
  }, []);

  // Connection points for relation lines
  const getConnectionPoints = useCallback((from: string, fromCol: string, to: string, toCol: string) => {
    const fromPos = positions[from];
    const toPos = positions[to];
    if (!fromPos || !toPos) return null;

    const fromEntry = schema.getTable(from);
    const toEntry = schema.getTable(to);
    if (!fromEntry || !toEntry) return null;

    const fromColIdx = fromEntry.columns.findIndex(c => c.name === fromCol);
    const toColIdx = toEntry.columns.findIndex(c => c.name === toCol);

    const fromVisibleCols = Math.min(fromEntry.columns.length, MAX_VISIBLE_COLS);
    const toVisibleCols = Math.min(toEntry.columns.length, MAX_VISIBLE_COLS);

    const clampedFromIdx = Math.min(fromColIdx, fromVisibleCols - 1);
    const clampedToIdx = Math.min(toColIdx, toVisibleCols - 1);

    if (clampedFromIdx < 0 || clampedToIdx < 0) return null;

    const fromY = fromPos.y + HEADER_HEIGHT + (clampedFromIdx + 0.5) * ROW_HEIGHT;
    const toY = toPos.y + HEADER_HEIGHT + (clampedToIdx + 0.5) * ROW_HEIGHT;

    const fromRight = fromPos.x + TABLE_WIDTH;
    const toLeft = toPos.x;

    let x1: number, x2: number;
    if (fromRight < toLeft) {
      x1 = fromRight;
      x2 = toLeft;
    } else if (fromPos.x > toPos.x + TABLE_WIDTH) {
      x1 = fromPos.x;
      x2 = toPos.x + TABLE_WIDTH;
    } else {
      x1 = fromRight;
      x2 = toPos.x + TABLE_WIDTH;
    }

    return { x1, y1: fromY, x2, y2: toY };
  }, [positions, schema]);

  // Topo data for selected table
  const topoData = selectedTable ? schema.getTopoMapping(selectedTable) : null;
  const selectedEntry = selectedTable ? schema.getTable(selectedTable) : null;
  const selectedDomain = selectedEntry ? schema.getDomain(selectedEntry.domain) : null;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="panel-header px-4 py-1.5 flex items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setZoom(z => Math.min(2, z + 0.15))}>
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>
        <span className="text-[10px] font-mono text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
        <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setZoom(z => Math.max(0.2, z - 0.15))}>
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>
        <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => { setZoom(0.55); setPan({ x: 20, y: 20 }); }}>
          <Maximize2 className="w-3.5 h-3.5" />
        </Button>
        <div className="w-px h-4 bg-border mx-1" />
        <Button
          variant={showRelations ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => setShowRelations(!showRelations)}
        >
          {showRelations ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          关系线
        </Button>
        {/* Domain Filter */}
        <div className="flex items-center gap-1 ml-2">
          <Filter className="w-3 h-3 text-muted-foreground" />
          <button
            onClick={() => setFilterDomain("all")}
            className={`text-[9px] px-1.5 py-0.5 rounded-sm transition-colors ${filterDomain === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
          >
            全部
          </button>
          {schema.domains.map(d => (
            <button
              key={d.id}
              onClick={() => setFilterDomain(d.id)}
              className={`text-[9px] px-1.5 py-0.5 rounded-sm transition-colors ${filterDomain === d.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
              style={filterDomain === d.id ? {} : { color: d.color }}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="搜索表..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-7 h-7 w-36 text-[11px] bg-secondary border-border"
          />
        </div>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{filteredTables.length} 表</Badge>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{filteredRelations.length} 关系</Badge>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => toast("功能即将上线")}>
          <Download className="w-3 h-3" /> 导出
        </Button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 overflow-hidden dot-grid cursor-grab active:cursor-grabbing relative"
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              position: "absolute",
              width: "3200px",
              height: "2400px",
            }}
          >
            {/* SVG Relations Layer */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="oklch(0.75 0.18 170 / 60%)" />
                </marker>
              </defs>
              {showRelations && filteredRelations.map((rel, i) => {
                const pts = getConnectionPoints(rel.from, rel.fromCol, rel.to, rel.toCol);
                if (!pts) return null;
                const midX = (pts.x1 + pts.x2) / 2;
                return (
                  <g key={i}>
                    <path
                      d={`M ${pts.x1} ${pts.y1} C ${midX} ${pts.y1}, ${midX} ${pts.y2}, ${pts.x2} ${pts.y2}`}
                      fill="none"
                      stroke="oklch(0.75 0.18 170 / 40%)"
                      strokeWidth="1.5"
                      strokeDasharray={rel.type === "1:1" ? "none" : "4 2"}
                      markerEnd="url(#arrow)"
                    />
                    <text
                      x={midX}
                      y={(pts.y1 + pts.y2) / 2 - 6}
                      textAnchor="middle"
                      fill="oklch(0.6 0.01 250)"
                      fontSize="9"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {rel.type}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Table Cards */}
            {filteredTables.map(entry => {
              const pos = positions[entry.tableName] || { x: 100, y: 100 };
              const domainMeta = schema.getDomain(entry.domain);
              const color = domainMeta?.color || "oklch(0.6 0.1 250)";
              const visibleCols = entry.columns.slice(0, MAX_VISIBLE_COLS);
              const hiddenCount = Math.max(0, entry.columns.length - MAX_VISIBLE_COLS);
              const hasTopoMapping = !!schema.getTopoMapping(entry.tableName);

              return (
                <div
                  key={entry.tableName}
                  className={`absolute bg-card border rounded-lg overflow-hidden select-none transition-shadow ${selectedTable === entry.tableName ? "ring-2 ring-primary" : ""}`}
                  style={{
                    left: pos.x,
                    top: pos.y,
                    width: TABLE_WIDTH,
                    boxShadow: `0 0 0 1px ${color}30, 0 4px 12px rgba(0,0,0,0.3)`,
                    borderColor: selectedTable === entry.tableName ? "var(--primary)" : `${color}30`,
                  }}
                  onMouseDown={e => handleMouseDown(e, entry.tableName)}
                  onClick={() => handleTableClick(entry.tableName)}
                >
                  {/* Table Header */}
                  <div
                    className="px-3 flex items-center gap-2 cursor-grab active:cursor-grabbing"
                    style={{ height: HEADER_HEIGHT, background: `${color}15`, borderBottom: `1px solid ${color}30` }}
                  >
                    <Key className="w-3 h-3" style={{ color }} />
                    <span className="text-[11px] font-mono font-semibold flex-1 truncate" style={{ color }}>{entry.tableName}</span>
                    <Badge variant="outline" className="text-[7px] px-1 py-0 shrink-0" style={{ borderColor: `${color}40`, color }}>
                      {domainMeta?.label || entry.domain}
                    </Badge>
                    {hasTopoMapping && (
                      <Network className="w-3 h-3 text-primary/60 shrink-0" />
                    )}
                  </div>
                  {/* Columns */}
                  {visibleCols.map((col, ci) => {
                    const Icon = getTypeIcon(col.type);
                    return (
                      <div
                        key={ci}
                        className="flex items-center gap-1.5 px-3 border-b border-border/30 hover:bg-secondary/20 transition-colors"
                        style={{ height: ROW_HEIGHT }}
                      >
                        {col.pk ? (
                          <Key className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                        ) : col.fk ? (
                          <Key className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                        ) : (
                          <Icon className="w-2.5 h-2.5 text-muted-foreground/60 shrink-0" />
                        )}
                        <span className={`text-[10px] font-mono flex-1 truncate ${col.pk ? "text-amber-400 font-medium" : col.fk ? "text-blue-400" : ""}`}>
                          {col.name}
                        </span>
                        <span className="text-[9px] font-mono text-muted-foreground/60 shrink-0">{col.type}</span>
                      </div>
                    );
                  })}
                  {/* Overflow indicator */}
                  {hiddenCount > 0 && (
                    <div className="flex items-center justify-center px-3 text-[9px] text-muted-foreground/50 font-mono" style={{ height: ROW_HEIGHT }}>
                      +{hiddenCount} 更多字段
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 bg-card/90 border border-border rounded-md px-3 py-2 text-[10px] space-y-1 backdrop-blur-sm">
            <div className="font-medium text-muted-foreground uppercase tracking-wider mb-1.5">图例</div>
            <div className="flex items-center gap-2">
              <Key className="w-2.5 h-2.5 text-amber-400" />
              <span className="text-muted-foreground">主键 (PK)</span>
            </div>
            <div className="flex items-center gap-2">
              <Key className="w-2.5 h-2.5 text-blue-400" />
              <span className="text-muted-foreground">外键 (FK)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-0 border-t border-dashed" style={{ borderColor: "oklch(0.75 0.18 170 / 60%)" }} />
              <span className="text-muted-foreground">1:N 关系</span>
            </div>
            <div className="flex items-center gap-2">
              <Network className="w-2.5 h-2.5 text-primary/60" />
              <span className="text-muted-foreground">有拓扑映射 (可点击)</span>
            </div>
          </div>
        </div>

        {/* Right: Topology Sync Preview Panel */}
        {selectedTable && (
          <div className="w-80 border-l border-border bg-card/80 backdrop-blur-sm flex flex-col shrink-0">
            <div className="panel-header px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Network className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {topoData ? "拓扑位置" : "表详情"}
                </span>
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setSelectedTable(null)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-4">
                {/* Table Info */}
                <div className="p-2.5 rounded-md border border-primary/30 bg-primary/5">
                  <div className="flex items-center gap-2 mb-1">
                    <Database className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-mono font-semibold text-primary">{selectedTable}</span>
                  </div>
                  {selectedEntry && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">{selectedEntry.tableComment}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[8px] px-1 py-0" style={{ borderColor: `${selectedDomain?.color}40`, color: selectedDomain?.color }}>
                          {selectedDomain?.label}
                        </Badge>
                        <Badge variant="outline" className="text-[8px] px-1 py-0 font-mono">
                          {selectedEntry.fields.length} 字段
                        </Badge>
                        <Badge variant="outline" className="text-[8px] px-1 py-0 font-mono">
                          {selectedEntry.engine}
                        </Badge>
                      </div>
                    </div>
                  )}
                  {topoData && (
                    <p className="text-[10px] text-muted-foreground leading-relaxed mt-2">{topoData.description}</p>
                  )}
                </div>

                {/* Topology Flow (if available) */}
                {topoData && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">数据流路径</h4>
                    <div className="space-y-0">
                      {topoData.nodes.map((node, i) => {
                        const NodeIcon = resolveIcon(node.icon);
                        const edge = i < topoData.edges.length ? topoData.edges[i] : null;
                        return (
                          <div key={node.id}>
                            <div className={`flex items-center gap-2.5 p-2 rounded-md border transition-colors ${node.id === selectedTable ? "border-primary/50 bg-primary/10" : "border-border/50 hover:bg-secondary/30"}`}>
                              <div className={`w-7 h-7 rounded-md flex items-center justify-center ${
                                node.status === "online" ? "bg-emerald-500/15" :
                                node.status === "warning" ? "bg-amber-500/15" : "bg-red-500/15"
                              }`}>
                                <NodeIcon className={`w-3.5 h-3.5 ${
                                  node.status === "online" ? "text-emerald-400" :
                                  node.status === "warning" ? "text-amber-400" : "text-red-400"
                                }`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[11px] font-medium truncate">{node.label}</div>
                                <div className="text-[9px] text-muted-foreground">{node.type}</div>
                              </div>
                              <div className={`w-1.5 h-1.5 rounded-full ${
                                node.status === "online" ? "bg-emerald-400" :
                                node.status === "warning" ? "bg-amber-400" : "bg-red-400"
                              }`} />
                            </div>
                            {edge && (
                              <div className="flex items-center gap-1.5 pl-5 py-1">
                                <div className="w-px h-4 bg-border" />
                                <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/50" />
                                <span className="text-[9px] text-muted-foreground font-mono">{edge.label}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Related Tables */}
                <div className="space-y-2">
                  <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">关联表</h4>
                  <div className="space-y-1">
                    {schema.getRelationsFor(selectedTable).map((r, i) => {
                      const other = r.from === selectedTable ? r.to : r.from;
                      const otherEntry = schema.getTable(other);
                      const otherDomain = otherEntry ? schema.getDomain(otherEntry.domain) : null;
                      return (
                        <button
                          key={i}
                          className="w-full flex items-center gap-2 p-2 rounded-md border border-border/50 hover:bg-secondary/30 transition-colors text-left"
                          onClick={() => setSelectedTable(other)}
                        >
                          <Database className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-[10px] font-mono flex-1 truncate">{other}</span>
                          <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0">{r.type}</Badge>
                          {otherDomain && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0" style={{ borderColor: `${otherDomain.color}40`, color: otherDomain.color }}>
                              {otherDomain.label}
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                    {schema.getRelationsFor(selectedTable).length === 0 && (
                      <p className="text-[10px] text-muted-foreground/60 italic px-2">无关联表</p>
                    )}
                  </div>
                </div>

                {/* All Fields List */}
                {selectedEntry && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">全部字段 ({selectedEntry.fields.length})</h4>
                    <div className="space-y-0.5 max-h-48 overflow-auto">
                      {selectedEntry.columns.map((col, i) => {
                        const Icon = getTypeIcon(col.type);
                        return (
                          <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-sm hover:bg-secondary/30 text-[10px]">
                            {col.pk ? (
                              <Key className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                            ) : col.fk ? (
                              <Key className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                            ) : (
                              <Icon className="w-2.5 h-2.5 text-muted-foreground/60 shrink-0" />
                            )}
                            <span className={`font-mono flex-1 truncate ${col.pk ? "text-amber-400" : col.fk ? "text-blue-400" : ""}`}>{col.name}</span>
                            <span className="font-mono text-muted-foreground/60 text-[9px] shrink-0">{col.type}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Sync to Topology Button */}
                {topoData && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs gap-1.5"
                    onClick={() => toast.success("已同步到系统拓扑图", { description: `${selectedTable} 节点已更新` })}
                  >
                    <Network className="w-3 h-3" /> 同步到系统拓扑
                  </Button>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
