/**
 * SqlEditor — SQL编辑器面板
 * V4.0: 接入 Schema Registry，动态生成示例 SQL 和结果
 * Design: 上部编辑区(行号+语法高亮模拟) + 工具栏 + 下部结果面板 + 表列表侧栏
 */
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Play, AlignLeft, Trash2, Download, Zap, Clock, CheckCircle2, XCircle,
  Search, Database, Table, ChevronDown, ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { useTableSchema } from "@/hooks/useTableSchema";
import { resolveIcon } from "@/data/icon-resolver";

function HighlightedSQL({ sql }: { sql: string }) {
  const keywords = new Set(["SELECT","FROM","LEFT","JOIN","WHERE","AND","OR","GROUP","BY","HAVING","ORDER","LIMIT","AS","ON","COUNT","AVG","MAX","MIN","SUM","DATE_SUB","NOW","INTERVAL","DESC","ASC","DISTINCT","INSERT","UPDATE","DELETE","CREATE","ALTER","DROP","TABLE","INDEX","INTO","VALUES","SET","NOT","NULL","IN","BETWEEN","LIKE","EXISTS","CASE","WHEN","THEN","ELSE","END","INNER","RIGHT","OUTER","CROSS","UNION","ALL"]);
  const tokens = sql.split(/(\s+|[(),;]|'[^']*')/);
  return (
    <>
      {tokens.map((token, i) => {
        if (!token) return null;
        if (token.startsWith("'")) return <span key={i} style={{ color: "#fcd34d" }}>{token}</span>;
        if (keywords.has(token.toUpperCase())) return <span key={i} style={{ color: "#60a5fa", fontWeight: 600 }}>{token}</span>;
        if (/^\d+$/.test(token)) return <span key={i} style={{ color: "#34d399" }}>{token}</span>;
        if (token.startsWith("--")) return <span key={i} style={{ color: "#6b7280", fontStyle: "italic" }}>{token}</span>;
        return <span key={i}>{token}</span>;
      })}
    </>
  );
}

export default function SqlEditor() {
  const schema = useTableSchema();

  // Generate sample SQL from registry
  const defaultSQL = useMemo(() => {
    const t = schema.getTable("asset_nodes");
    if (!t) return "SELECT * FROM asset_nodes LIMIT 20;";
    const cols = t.columns.slice(0, 6).map(c => `  an.${c.name}`).join(",\n");
    return `SELECT\n${cols},\n  COUNT(dk.id) AS kpi_count\nFROM asset_nodes an\nLEFT JOIN device_kpis dk ON an.code = dk.device_code\nWHERE an.status = 'active'\nGROUP BY an.id\nHAVING kpi_count > 0\nORDER BY kpi_count DESC\nLIMIT 20;`;
  }, [schema]);

  const [sql, setSql] = useState(defaultSQL);
  const [executed, setExecuted] = useState(false);
  const [showOptimize, setShowOptimize] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const lines = sql.split("\n");

  // Mock results from registry data
  const mockResults = useMemo(() => {
    const rows = schema.getMockRows("asset_nodes");
    if (rows.length > 0) return rows;
    // Fallback: generate from first available mock data
    for (const t of schema.allTables) {
      const r = schema.getMockRows(t.tableName);
      if (r.length > 0) return r;
    }
    return [];
  }, [schema]);

  // Filtered tables for sidebar
  const filteredTables = useMemo(() => {
    if (!sidebarSearch.trim()) return schema.allTables;
    const kw = sidebarSearch.toLowerCase();
    return schema.allTables.filter(t =>
      t.tableName.toLowerCase().includes(kw) ||
      t.tableComment.toLowerCase().includes(kw)
    );
  }, [schema.allTables, sidebarSearch]);

  const groupedTables = useMemo(() => {
    const groups: Record<string, typeof filteredTables> = {};
    filteredTables.forEach(t => {
      if (!groups[t.domain]) groups[t.domain] = [];
      groups[t.domain].push(t);
    });
    return groups;
  }, [filteredTables]);

  const toggleDomain = (domainId: string) => {
    const next = new Set(expandedDomains);
    if (next.has(domainId)) next.delete(domainId);
    else next.add(domainId);
    setExpandedDomains(next);
  };

  const insertTableRef = (tableName: string) => {
    setSql(prev => prev + (prev.endsWith(" ") || prev.endsWith("\n") ? "" : " ") + tableName);
    toast(`已插入: ${tableName}`);
  };

  const MOCK_OPTIMIZE = {
    plan: "Using index (device_kpis.idx_device_code)",
    suggestions: [
      "建议为 device_kpis.device_code 创建索引以加速 JOIN",
      "WHERE 子句中的字符串比较建议使用参数化查询",
      "LIMIT 20 配合 ORDER BY 可考虑使用覆盖索引优化",
    ],
    cost: "估算扫描行数: 8,450 → 优化后: 1,240",
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="panel-header px-4 py-1.5 flex items-center gap-2 shrink-0">
        <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => { setExecuted(true); toast.success(`查询执行成功 · ${mockResults.length} 行 · 12ms`); }}>
          <Play className="w-3 h-3" /> 执行
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => toast("功能即将上线")}>
          <AlignLeft className="w-3 h-3" /> 格式化
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setShowOptimize(!showOptimize)}>
          <Zap className="w-3 h-3" /> 查询优化
        </Button>
        <Button
          variant={showSidebar ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => setShowSidebar(!showSidebar)}
        >
          <Table className="w-3 h-3" /> 表列表
        </Button>
        <div className="flex-1" />
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono">{schema.totalCount} 表可用</Badge>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => { setSql(""); setExecuted(false); }}>
          <Trash2 className="w-3 h-3" /> 清空
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => toast("功能即将上线")}>
          <Download className="w-3 h-3" /> 导出
        </Button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Table Sidebar */}
        {showSidebar && (
          <div className="w-52 border-r border-border bg-card/50 flex flex-col shrink-0">
            <div className="px-2 py-1.5 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  placeholder="搜索表..."
                  value={sidebarSearch}
                  onChange={e => setSidebarSearch(e.target.value)}
                  className="pl-7 h-7 text-[11px] bg-secondary border-border"
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-1">
                {schema.domains.map(domain => {
                  const tables = groupedTables[domain.id];
                  if (!tables || tables.length === 0) return null;
                  const isExpanded = expandedDomains.has(domain.id);
                  const DomainIcon = resolveIcon(domain.icon);
                  return (
                    <div key={domain.id} className="mb-0.5">
                      <button
                        className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] hover:bg-secondary/50 rounded-sm transition-colors"
                        onClick={() => toggleDomain(domain.id)}
                      >
                        {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                        <DomainIcon className="w-3 h-3 shrink-0" style={{ color: domain.color }} />
                        <span className="font-medium truncate">{domain.label}</span>
                        <span className="ml-auto text-[9px] text-muted-foreground font-mono shrink-0">{tables.length}</span>
                      </button>
                      {isExpanded && (
                        <div className="ml-3 border-l border-border/50 pl-1">
                          {tables.map(t => (
                            <button
                              key={t.tableName}
                              className="w-full text-left px-2 py-1 rounded-sm hover:bg-secondary/50 transition-colors text-[10px] font-mono text-muted-foreground hover:text-primary truncate"
                              onClick={() => insertTableRef(t.tableName)}
                              title={`点击插入: ${t.tableName} — ${t.tableComment}`}
                            >
                              {t.tableName}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Editor Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* SQL Editor */}
          <div className="flex-1 overflow-auto bg-[#0d1117] min-h-[200px]">
            <div className="flex">
              {/* Line Numbers */}
              <div className="shrink-0 py-3 pr-2 text-right select-none border-r border-border/30">
                {lines.map((_, i) => (
                  <div key={i} className="text-[11px] font-mono text-muted-foreground/40 leading-5 px-3">{i + 1}</div>
                ))}
              </div>
              {/* Code Area */}
              <div className="flex-1 relative">
                <textarea
                  value={sql}
                  onChange={e => { setSql(e.target.value); setExecuted(false); }}
                  className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-primary text-[11px] font-mono leading-5 p-3 resize-none outline-none"
                  spellCheck={false}
                />
                <pre className="text-[11px] font-mono leading-5 p-3 pointer-events-none whitespace-pre-wrap break-words">
                  <HighlightedSQL sql={sql} />
                </pre>
              </div>
            </div>
          </div>

          {/* Results Panel */}
          <div className="border-t border-border bg-card flex flex-col" style={{ height: "45%" }}>
            <div className="px-4 py-1.5 flex items-center gap-3 border-b border-border shrink-0">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">结果</span>
              {executed && (
                <>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-1 font-mono">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                    {mockResults.length} 行
                  </Badge>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-1 font-mono">
                    <Clock className="w-2.5 h-2.5 text-amber-400" />
                    12ms
                  </Badge>
                </>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              {executed && mockResults.length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-secondary/30 text-muted-foreground sticky top-0">
                      {Object.keys(mockResults[0]).map(k => (
                        <th key={k} className="text-left px-3 py-2 font-medium font-mono text-[10px]">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mockResults.map((row, i) => (
                      <tr key={i} className="border-t border-border/30 hover:bg-secondary/20">
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="px-3 py-1.5 font-mono text-[11px]">
                            {typeof v === "number" ? <span className="text-emerald-400">{v}</span> :
                             v === null ? <span className="text-muted-foreground/40 italic">NULL</span> :
                             String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  <div className="text-center">
                    <Play className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p>点击"执行"或按 Ctrl+Enter 运行查询</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Optimize Panel (Right Drawer) */}
        {showOptimize && (
          <div className="w-72 border-l border-border bg-card/80 flex flex-col shrink-0">
            <div className="panel-header px-3 py-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">查询优化</span>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setShowOptimize(false)}>
                <XCircle className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-4">
              <div>
                <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">执行计划</h4>
                <div className="bg-secondary/50 rounded-md p-2 text-[11px] font-mono text-emerald-400">
                  {MOCK_OPTIMIZE.plan}
                </div>
              </div>
              <div>
                <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">优化建议</h4>
                <div className="space-y-2">
                  {MOCK_OPTIMIZE.suggestions.map((s, i) => (
                    <div key={i} className="bg-secondary/50 rounded-md p-2 text-[11px] flex gap-2">
                      <Zap className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">性能估算</h4>
                <div className="bg-secondary/50 rounded-md p-2 text-[11px] font-mono text-primary">
                  {MOCK_OPTIMIZE.cost}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
