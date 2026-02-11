/**
 * DataBrowser — 数据浏览面板
 * V4.0: 接入 Schema Registry (64张表)，消除硬编码 Mock 数据
 * Design: 域分组表选择器 + 工具栏 + 数据表格(分页/排序) + 导入向导弹窗
 */
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Upload, Download, RefreshCw, ChevronLeft, ChevronRight, Filter, ArrowUpDown,
  FileSpreadsheet, FileJson, FileCode, CheckCircle2, Search, Database, ChevronDown, ChevronRight as ChevronR
} from "lucide-react";
import { toast } from "sonner";
import { useTableSchema } from "@/hooks/useTableSchema";
import { resolveIcon } from "@/data/icon-resolver";

const IMPORT_STEPS = ["选择文件", "字段映射", "预览确认", "执行导入"];

export default function DataBrowser() {
  const schema = useTableSchema();
  const [selectedTable, setSelectedTable] = useState("asset_nodes");
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [importStep, setImportStep] = useState(0);
  const [tableSearch, setTableSearch] = useState("");
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set(["asset-management"]));

  // Get mock rows and columns for the selected table
  const mockRows = schema.getMockRows(selectedTable);
  const entry = schema.getTable(selectedTable);
  const domainMeta = entry ? schema.getDomain(entry.domain) : null;

  // Use fields from registry as column headers, fallback to mock data keys
  const columns = useMemo(() => {
    if (entry) return entry.columns.map(c => c.name);
    if (mockRows.length > 0) return Object.keys(mockRows[0]);
    return [];
  }, [entry, mockRows]);

  // Filtered tables for sidebar
  const filteredTables = useMemo(() => {
    if (!tableSearch.trim()) return schema.allTables;
    const kw = tableSearch.toLowerCase();
    return schema.allTables.filter(t =>
      t.tableName.toLowerCase().includes(kw) ||
      t.tableComment.toLowerCase().includes(kw)
    );
  }, [schema.allTables, tableSearch]);

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

  return (
    <div className="h-full flex">
      {/* Left: Table Selector */}
      <div className="w-56 border-r border-border bg-card/50 flex flex-col shrink-0">
        <div className="panel-header px-3 py-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">数据表</span>
          <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">{schema.totalCount}</Badge>
        </div>
        <div className="px-2 py-1.5 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="搜索表..."
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
              className="pl-7 h-7 text-[11px] bg-secondary border-border"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-1.5">
            {schema.domains.map(domain => {
              const tables = groupedTables[domain.id];
              if (!tables || tables.length === 0) return null;
              const isExpanded = expandedDomains.has(domain.id);
              const DomainIcon = resolveIcon(domain.icon);
              return (
                <div key={domain.id} className="mb-0.5">
                  <button
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] hover:bg-secondary/50 rounded-sm transition-colors"
                    onClick={() => toggleDomain(domain.id)}
                  >
                    {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronR className="w-3 h-3 text-muted-foreground shrink-0" />}
                    <DomainIcon className="w-3.5 h-3.5 shrink-0" style={{ color: domain.color }} />
                    <span className="font-medium truncate">{domain.label}</span>
                    <span className="ml-auto text-[9px] text-muted-foreground font-mono shrink-0">{tables.length}</span>
                  </button>
                  {isExpanded && (
                    <div className="ml-3 border-l border-border/50 pl-1">
                      {tables.map(t => (
                        <button
                          key={t.tableName}
                          className={`w-full text-left px-2 py-1.5 rounded-sm transition-colors text-[10px] font-mono truncate ${selectedTable === t.tableName ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"}`}
                          onClick={() => { setSelectedTable(t.tableName); setPage(1); }}
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

      {/* Right: Data View */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="panel-header px-4 py-2 flex items-center gap-3 shrink-0">
          <Database className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-mono font-semibold text-primary">{selectedTable}</span>
          {entry && (
            <span className="text-[10px] text-muted-foreground">— {entry.tableComment}</span>
          )}
          {domainMeta && (
            <Badge variant="outline" className="text-[8px] px-1 py-0" style={{ borderColor: `${domainMeta.color}40`, color: domainMeta.color }}>
              {domainMeta.label}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
            {mockRows.length > 0 ? `${mockRows.length} 行示例` : `${entry?.fields.length || 0} 字段`}
          </Badge>
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => toast("功能即将上线")}>
            <Filter className="w-3 h-3" /> 筛选
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => toast("刷新成功")}>
            <RefreshCw className="w-3 h-3" /> 刷新
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setShowImport(true)}>
            <Upload className="w-3 h-3" /> 导入
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => toast("功能即将上线")}>
            <Download className="w-3 h-3" /> 导出
          </Button>
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-auto">
          {mockRows.length > 0 ? (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-secondary/50 text-muted-foreground">
                  {Object.keys(mockRows[0]).map(col => (
                    <th key={col} className="text-left px-3 py-2.5 font-medium font-mono text-[10px] whitespace-nowrap cursor-pointer hover:text-foreground transition-colors">
                      <div className="flex items-center gap-1">
                        {col}
                        <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mockRows.map((row, i) => (
                  <tr key={i} className={`border-t border-border/30 hover:bg-secondary/20 transition-colors ${i % 2 === 0 ? "" : "bg-secondary/5"}`}>
                    {Object.entries(row).map(([k, v], j) => (
                      <td key={j} className="px-3 py-2 font-mono text-[11px] whitespace-nowrap">
                        {k === "status" && (typeof v === "number" || v === "active" || v === "inactive" || v === "online" || v === "offline") ? (
                          <div className="flex items-center gap-1.5">
                            <span className={`status-led ${v === 1 || v === "active" || v === "online" ? "status-led-online" : "status-led-offline"}`} />
                            <span className={v === 1 || v === "active" || v === "online" ? "text-emerald-400" : "text-red-400"}>
                              {v === 1 ? "在线" : v === 0 ? "离线" : String(v)}
                            </span>
                          </div>
                        ) : k === "id" ? (
                          <span className="text-muted-foreground">{String(v)}</span>
                        ) : typeof v === "number" ? (
                          <span className="text-emerald-400">{v}</span>
                        ) : v === null ? (
                          <span className="text-muted-foreground/40 italic">NULL</span>
                        ) : (
                          String(v)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* Show field structure when no mock data */
            <div className="p-4">
              <div className="text-center mb-4">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs text-muted-foreground mb-1">暂无示例数据</p>
                <p className="text-[10px] text-muted-foreground/60">以下为表结构定义（{columns.length} 个字段）</p>
              </div>
              {entry && (
                <div className="max-w-2xl mx-auto border border-border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-secondary/50 text-muted-foreground">
                        <th className="text-left px-3 py-2 font-medium">字段名</th>
                        <th className="text-left px-3 py-2 font-medium">类型</th>
                        <th className="text-center px-3 py-2 font-medium">PK</th>
                        <th className="text-center px-3 py-2 font-medium">NULL</th>
                        <th className="text-left px-3 py-2 font-medium">注释</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.fields.map((f, i) => (
                        <tr key={i} className={`border-t border-border/30 ${i % 2 === 0 ? "" : "bg-secondary/5"}`}>
                          <td className="px-3 py-1.5 font-mono">{f.name}</td>
                          <td className="px-3 py-1.5 font-mono text-muted-foreground">{f.type}{f.length ? `(${f.length})` : ""}</td>
                          <td className="px-3 py-1.5 text-center">{f.primaryKey ? "✓" : ""}</td>
                          <td className="px-3 py-1.5 text-center">{f.nullable ? "✓" : ""}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{f.comment}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pagination */}
        {mockRows.length > 0 && (
          <div className="px-4 py-2 border-t border-border flex items-center justify-between shrink-0">
            <span className="text-[10px] text-muted-foreground font-mono">
              显示 1-{mockRows.length} / 共 {mockRows.length} 行（示例数据）
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-6 w-6 p-0" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-3 h-3" />
              </Button>
              <Button variant={page === 1 ? "default" : "outline"} size="sm" className="h-6 min-w-6 px-1.5 text-[10px] font-mono" onClick={() => setPage(1)}>
                1
              </Button>
              <Button variant="outline" size="sm" className="h-6 w-6 p-0" disabled onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Import Dialog */}
        <Dialog open={showImport} onOpenChange={setShowImport}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-sm">数据导入向导</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                将 CSV 或 JSON 数据导入到 <span className="font-mono text-primary">{selectedTable}</span> 表
              </DialogDescription>
            </DialogHeader>

            {/* Steps */}
            <div className="flex items-center gap-2 py-3">
              {IMPORT_STEPS.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono ${
                    i < importStep ? "bg-primary text-primary-foreground" :
                    i === importStep ? "bg-primary/20 text-primary border border-primary" :
                    "bg-secondary text-muted-foreground"
                  }`}>
                    {i < importStep ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={`text-[10px] ${i === importStep ? "text-foreground" : "text-muted-foreground"}`}>{step}</span>
                  {i < IMPORT_STEPS.length - 1 && <div className="w-6 h-px bg-border" />}
                </div>
              ))}
            </div>

            {/* Step Content */}
            <div className="min-h-[120px] bg-secondary/30 rounded-md p-4">
              {importStep === 0 && (
                <div className="text-center space-y-3">
                  <div className="flex justify-center gap-3">
                    <button className="p-4 border border-border rounded-lg hover:border-primary/50 transition-colors" onClick={() => setImportStep(1)}>
                      <FileSpreadsheet className="w-8 h-8 text-emerald-400 mx-auto mb-1" />
                      <span className="text-[10px]">CSV</span>
                    </button>
                    <button className="p-4 border border-border rounded-lg hover:border-primary/50 transition-colors" onClick={() => setImportStep(1)}>
                      <FileJson className="w-8 h-8 text-amber-400 mx-auto mb-1" />
                      <span className="text-[10px]">JSON</span>
                    </button>
                    <button className="p-4 border border-border rounded-lg hover:border-primary/50 transition-colors" onClick={() => setImportStep(1)}>
                      <FileCode className="w-8 h-8 text-blue-400 mx-auto mb-1" />
                      <span className="text-[10px]">SQL</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">选择文件格式并上传</p>
                </div>
              )}
              {importStep === 1 && entry && (
                <div className="space-y-2">
                  <p className="text-xs font-medium mb-3">字段映射 — {entry.tableName}</p>
                  <div className="space-y-1.5 max-h-32 overflow-auto">
                    {entry.fields.slice(0, 8).map(f => (
                      <div key={f.name} className="flex items-center gap-2 text-[11px] font-mono bg-secondary/50 rounded px-2 py-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        {f.name} → {f.name}
                        <span className="text-muted-foreground/50 ml-auto">{f.type}</span>
                      </div>
                    ))}
                    {entry.fields.length > 8 && (
                      <p className="text-[10px] text-muted-foreground/60 pl-2">+{entry.fields.length - 8} 更多字段...</p>
                    )}
                  </div>
                </div>
              )}
              {importStep >= 2 && (
                <div className="text-center py-4">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                  <p className="text-xs">预览确认：将导入数据到 <span className="font-mono text-primary">{selectedTable}</span></p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" className="text-xs" onClick={() => { setShowImport(false); setImportStep(0); }}>
                取消
              </Button>
              <Button size="sm" className="text-xs" onClick={() => {
                if (importStep < 3) setImportStep(s => s + 1);
                else { setShowImport(false); setImportStep(0); toast.success("数据导入成功"); }
              }}>
                {importStep < 3 ? "下一步" : "执行导入"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
