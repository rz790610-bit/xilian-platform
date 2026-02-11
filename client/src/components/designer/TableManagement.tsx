/**
 * TableManagement — 表管理面板
 * V4.0: 接入 Schema Registry (64张表 × 11个域)，消除硬编码 Mock 数据
 * Design: 统计卡片 + 域筛选 + 搜索 + 表列表(按域分组着色)
 */
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Search, RefreshCw, Download, Trash2, Edit3, Eye, MoreHorizontal,
  Database, HardDrive, Layers, Clock, Filter
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useTableSchema } from "@/hooks/useTableSchema";
import { resolveIcon } from "@/data/icon-resolver";
import ExportDDLDialog from "@/components/designer/ExportDDLDialog";

export default function TableManagement() {
  const schema = useTableSchema();
  const [search, setSearch] = useState("");
  const [filterDomain, setFilterDomain] = useState<string>("all");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTable, setExportTable] = useState<string | undefined>();
  const [exportDomain, setExportDomain] = useState<string | undefined>();

  const filtered = useMemo(() => {
    let tables = schema.allTables;
    if (filterDomain !== "all") {
      tables = tables.filter(t => t.domain === filterDomain);
    }
    if (search.trim()) {
      const kw = search.toLowerCase();
      tables = tables.filter(t =>
        t.tableName.toLowerCase().includes(kw) ||
        t.tableComment.toLowerCase().includes(kw) ||
        t.displayName.toLowerCase().includes(kw)
      );
    }
    return tables;
  }, [schema.allTables, search, filterDomain]);

  // Compute stats from registry
  const totalFields = useMemo(() => schema.allTables.reduce((sum, t) => sum + t.fields.length, 0), [schema.allTables]);

  const STATS = [
    { label: "数据表", value: String(schema.totalCount), icon: Layers, color: "text-primary" },
    { label: "总字段数", value: totalFields.toLocaleString(), icon: HardDrive, color: "text-amber-400" },
    { label: "业务域", value: String(schema.domains.length), icon: Database, color: "text-blue-400" },
    { label: "外键关系", value: String(schema.relations.length), icon: Clock, color: "text-emerald-400" },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-3 p-4 pb-2">
        {STATS.map(s => (
          <div key={s.label} className="bg-card border border-border rounded-md p-3 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-md bg-secondary flex items-center justify-center ${s.color}`}>
              <s.icon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-sm font-semibold font-mono">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索表名或注释..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 w-64 text-xs bg-secondary border-border"
            />
          </div>
          {/* Domain filter chips */}
          <div className="flex items-center gap-1 ml-1">
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
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => { setExportTable(undefined); setExportDomain(filterDomain !== "all" ? filterDomain : undefined); setExportOpen(true); }}>
            <Download className="w-3 h-3" />
            导出 Schema
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => toast("功能即将上线")}>
            <Plus className="w-3 h-3" />
            新建表
          </Button>
        </div>
      </div>

      {/* Table List */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-secondary/50 text-muted-foreground">
                <th className="text-left px-3 py-2.5 font-medium">表名</th>
                <th className="text-left px-3 py-2.5 font-medium">注释</th>
                <th className="text-left px-3 py-2.5 font-medium">业务域</th>
                <th className="text-right px-3 py-2.5 font-medium">字段数</th>
                <th className="text-left px-3 py-2.5 font-medium">引擎</th>
                <th className="text-left px-3 py-2.5 font-medium">编码</th>
                <th className="text-right px-3 py-2.5 font-medium">关系</th>
                <th className="text-center px-3 py-2.5 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => {
                const domainMeta = schema.getDomain(t.domain);
                const relCount = schema.getRelationsFor(t.tableName).length;
                const DomainIcon = resolveIcon(domainMeta?.icon || "Database");
                return (
                  <tr
                    key={t.tableName}
                    className={`border-t border-border hover:bg-secondary/30 transition-colors ${i % 2 === 0 ? "" : "bg-secondary/10"}`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <DomainIcon className="w-3 h-3 shrink-0" style={{ color: domainMeta?.color }} />
                        <span className="font-mono text-primary font-medium">{t.tableName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground max-w-48 truncate">{t.tableComment}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono" style={{ borderColor: `${domainMeta?.color}40`, color: domainMeta?.color }}>
                        {domainMeta?.label || t.domain}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{t.fields.length}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{t.engine}</Badge>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-muted-foreground">{t.charset}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{relCount > 0 ? relCount : "-"}</td>
                    <td className="px-3 py-2.5 text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs">
                          <DropdownMenuItem className="gap-2" onClick={() => toast("功能即将上线")}>
                            <Eye className="w-3 h-3" /> 查看数据
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => toast("功能即将上线")}>
                            <Edit3 className="w-3 h-3" /> 编辑结构
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => { setExportTable(t.tableName); setExportDomain(undefined); setExportOpen(true); }}>
                            <Download className="w-3 h-3" /> 导出 DDL
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-destructive" onClick={() => toast("功能即将上线")}>
                            <Trash2 className="w-3 h-3" /> 删除表
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              <Database className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p>未找到匹配的表</p>
            </div>
          )}
        </div>
      </div>

      {/* Export DDL Dialog */}
      <ExportDDLDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        preselectedTable={exportTable}
        preselectedDomain={exportDomain}
      />
    </div>
  );
}
