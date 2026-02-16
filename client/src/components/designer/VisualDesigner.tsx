/**
 * VisualDesigner — 可视化建表设计器
 * V4.0: 接入 Schema Registry (64张表 × 11个域)，消除硬编码 Mock 数据
 * Design: 左侧模板面板(按域分组) + 中央画布(表卡片+字段编辑) + 右侧属性面板 + 底部SQL预览
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocalStorage, useAutoSave } from "@/hooks/useLocalStorage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus, GripVertical, Key, Hash, Type, Calendar, FileJson, MapPin,
  ChevronDown, ChevronUp, ChevronRight, Trash2, Copy, Save, Play,
  Search, Database
} from "lucide-react";
import { toast } from "sonner";
import { useTableSchema } from "@/hooks/useTableSchema";
import { resolveIcon } from "@/data/icon-resolver";
import type { DomainId } from "@/data/types";

const COLUMN_TYPES = {
  "数值": ["INT", "BIGINT", "TINYINT", "SMALLINT", "MEDIUMINT", "DECIMAL", "FLOAT", "DOUBLE", "BIT"],
  "字符串": ["VARCHAR", "CHAR", "TEXT", "MEDIUMTEXT", "LONGTEXT", "ENUM", "SET"],
  "时间": ["DATETIME", "TIMESTAMP", "DATE", "TIME", "YEAR"],
  "二进制": ["BLOB", "MEDIUMBLOB", "LONGBLOB", "BINARY", "VARBINARY"],
  "空间": ["GEOMETRY", "POINT", "LINESTRING", "POLYGON"],
  "其他": ["JSON", "BOOLEAN"],
};

interface Column {
  name: string;
  type: string;
  length: string;
  nullable: boolean;
  primaryKey: boolean;
  autoIncrement: boolean;
  unique: boolean;
  defaultVal: string;
  comment: string;
}

function generateSQL(tableName: string, columns: Column[], engine: string, charset: string, collate: string, comment: string): string {
  const lines = columns.map(c => {
    let line = `  \`${c.name}\` ${c.type}`;
    if (c.length) line += `(${c.length})`;
    if (!c.nullable) line += " NOT NULL";
    if (c.autoIncrement) line += " AUTO_INCREMENT";
    if (c.unique && !c.primaryKey) line += " UNIQUE";
    if (c.defaultVal) {
      if (c.defaultVal === "CURRENT_TIMESTAMP" || c.defaultVal.startsWith("CURRENT_TIMESTAMP") || c.defaultVal.startsWith("'")) {
        line += ` DEFAULT ${c.defaultVal}`;
      } else {
        line += ` DEFAULT '${c.defaultVal}'`;
      }
    }
    if (c.comment) line += ` COMMENT '${c.comment}'`;
    return line;
  });
  const pks = columns.filter(c => c.primaryKey).map(c => `\`${c.name}\``);
  if (pks.length > 0) lines.push(`  PRIMARY KEY (${pks.join(", ")})`);
  return `CREATE TABLE \`${tableName}\` (\n${lines.join(",\n")}\n) ENGINE=${engine} DEFAULT CHARSET=${charset} COLLATE=${collate}${comment ? ` COMMENT='${comment}'` : ""};`;
}

function getTypeIcon(type: string) {
  if (["INT", "BIGINT", "TINYINT", "SMALLINT", "MEDIUMINT", "DECIMAL", "FLOAT", "DOUBLE", "BIT"].includes(type)) return Hash;
  if (["VARCHAR", "CHAR", "TEXT", "MEDIUMTEXT", "LONGTEXT", "ENUM", "SET"].includes(type)) return Type;
  if (["DATETIME", "TIMESTAMP", "DATE", "TIME", "YEAR"].includes(type)) return Calendar;
  if (["JSON", "BOOLEAN"].includes(type)) return FileJson;
  if (["GEOMETRY", "POINT", "LINESTRING", "POLYGON"].includes(type)) return MapPin;
  return Hash;
}

export default function VisualDesigner() {
  const schema = useTableSchema();

  // Template browser state
  const [templateSearch, setTemplateSearch] = useState("");
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set(["base-config"]));

  // Editor state — 从 localStorage 恢复（防止意外刷新丢失编辑内容）
  const defaultColumns: Column[] = [
    { name: "id", type: "BIGINT", length: "", nullable: false, primaryKey: true, autoIncrement: true, unique: false, defaultVal: "", comment: "主键" },
    { name: "name", type: "VARCHAR", length: "255", nullable: false, primaryKey: false, autoIncrement: false, unique: false, defaultVal: "", comment: "名称" },
    { name: "status", type: "TINYINT", length: "", nullable: false, primaryKey: false, autoIncrement: false, unique: false, defaultVal: "1", comment: "状态" },
    { name: "created_at", type: "DATETIME", length: "", nullable: false, primaryKey: false, autoIncrement: false, unique: false, defaultVal: "CURRENT_TIMESTAMP", comment: "创建时间" },
    { name: "updated_at", type: "DATETIME", length: "", nullable: true, primaryKey: false, autoIncrement: false, unique: false, defaultVal: "", comment: "更新时间" },
  ];
  const [tableName, setTableName] = useLocalStorage<string>('xilian:designer:tableName', 'new_table');
  const [columns, setColumns] = useLocalStorage<Column[]>('xilian:designer:columns', defaultColumns);
  const [selectedCol, setSelectedCol] = useState<number>(0);
  const [engine, setEngine] = useLocalStorage<string>('xilian:designer:engine', 'InnoDB');
  const [charset, setCharset] = useLocalStorage<string>('xilian:designer:charset', 'utf8mb4');
  const [collate, setCollate] = useLocalStorage<string>('xilian:designer:collate', 'utf8mb4_unicode_ci');
  const [tableComment, setTableComment] = useLocalStorage<string>('xilian:designer:comment', '');
  const [sqlExpanded, setSqlExpanded] = useState(true);

  // Filtered templates from Schema Registry
  const filteredBySearch = useMemo(() => {
    if (!templateSearch.trim()) return schema.allTables;
    const kw = templateSearch.toLowerCase();
    return schema.allTables.filter(t =>
      t.tableName.toLowerCase().includes(kw) ||
      t.tableComment.toLowerCase().includes(kw) ||
      t.displayName.toLowerCase().includes(kw)
    );
  }, [templateSearch, schema.allTables]);

  // Group by domain
  const groupedTemplates = useMemo(() => {
    const groups: Record<string, typeof filteredBySearch> = {};
    filteredBySearch.forEach(t => {
      if (!groups[t.domain]) groups[t.domain] = [];
      groups[t.domain].push(t);
    });
    return groups;
  }, [filteredBySearch]);

  const loadTemplate = (tblName: string) => {
    const entry = schema.getTable(tblName);
    if (!entry) return;
    setTableName(entry.tableName);
    setTableComment(entry.tableComment);
    setColumns(entry.fields.map(f => ({
      name: f.name, type: f.type, length: f.length, nullable: f.nullable,
      primaryKey: f.primaryKey, autoIncrement: f.autoIncrement, unique: f.unique,
      defaultVal: f.defaultVal, comment: f.comment,
    })));
    setEngine(entry.engine);
    setCharset(entry.charset);
    setCollate(entry.collate);
    setSelectedCol(0);
    toast.success(`已加载模板: ${entry.tableName}`, { description: `${entry.fields.length} 个字段 · ${entry.engine} · ${entry.charset}` });
  };

  const updateColumn = (idx: number, field: keyof Column, value: string | boolean) => {
    setColumns(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const addColumn = () => {
    setColumns(prev => [...prev, {
      name: `column_${prev.length + 1}`, type: "VARCHAR", length: "255",
      nullable: true, primaryKey: false, autoIncrement: false, unique: false,
      defaultVal: "", comment: ""
    }]);
    setSelectedCol(columns.length);
  };

  const removeColumn = (idx: number) => {
    setColumns(prev => prev.filter((_, i) => i !== idx));
    if (selectedCol >= columns.length - 1) setSelectedCol(Math.max(0, columns.length - 2));
  };

  const toggleDomain = (domainId: string) => {
    const next = new Set(expandedDomains);
    if (next.has(domainId)) next.delete(domainId);
    else next.add(domainId);
    setExpandedDomains(next);
  };

  const sql = generateSQL(tableName, columns, engine, charset, collate, tableComment);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Template Panel — from Schema Registry */}
        <div className="w-60 border-r border-border bg-card/50 flex flex-col shrink-0">
          <div className="panel-header px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">表模板</span>
            <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">{schema.totalCount}</Badge>
          </div>
          {/* Search */}
          <div className="px-2 py-1.5 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                placeholder="搜索表名或注释..."
                value={templateSearch}
                onChange={e => setTemplateSearch(e.target.value)}
                className="pl-7 h-7 text-[11px] bg-secondary border-border"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-1.5">
              {schema.domains.map(domain => {
                const tables = groupedTemplates[domain.id];
                if (!tables || tables.length === 0) return null;
                const isExpanded = expandedDomains.has(domain.id);
                const DomainIcon = resolveIcon(domain.icon);
                return (
                  <div key={domain.id} className="mb-0.5">
                    <button
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] hover:bg-secondary/50 rounded-sm transition-colors"
                      onClick={() => toggleDomain(domain.id)}
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                      <DomainIcon className="w-3.5 h-3.5 shrink-0" style={{ color: domain.color }} />
                      <span className="font-medium truncate">{domain.label}</span>
                      <span className="ml-auto text-[9px] text-muted-foreground font-mono shrink-0">{tables.length}</span>
                    </button>
                    {isExpanded && (
                      <div className="ml-3 border-l border-border/50 pl-1">
                        {tables.map(t => {
                          const TIcon = resolveIcon(t.icon);
                          return (
                            <button
                              key={t.tableName}
                              className="w-full text-left p-2 rounded-sm hover:bg-secondary/50 transition-colors group"
                              onClick={() => loadTemplate(t.tableName)}
                            >
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <TIcon className="w-3 h-3 text-muted-foreground group-hover:text-primary shrink-0" />
                                <span className="text-[10px] font-mono truncate group-hover:text-primary">{t.tableName}</span>
                              </div>
                              <p className="text-[9px] text-muted-foreground truncate">{t.tableComment}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[8px] text-muted-foreground/60">{t.fields.length} 字段</span>
                                <div className="flex flex-wrap gap-0.5">
                                  {t.fields.slice(0, 3).map(f => (
                                    <Badge key={f.name} variant="outline" className="text-[7px] px-1 py-0 font-mono">{f.name}</Badge>
                                  ))}
                                  {t.fields.length > 3 && (
                                    <Badge variant="outline" className="text-[7px] px-1 py-0">+{t.fields.length - 3}</Badge>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Center: Canvas / Field List */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Table Name Bar */}
          <div className="panel-header px-4 py-2 flex items-center gap-3">
            <Label className="text-xs text-muted-foreground shrink-0">表名</Label>
            <Input
              value={tableName}
              onChange={e => setTableName(e.target.value)}
              className="h-7 text-xs font-mono bg-secondary border-border max-w-48"
            />
            <Label className="text-xs text-muted-foreground shrink-0 ml-2">注释</Label>
            <Input
              value={tableComment}
              onChange={e => setTableComment(e.target.value)}
              placeholder="表说明..."
              className="h-7 text-xs bg-secondary border-border max-w-48"
            />
            <div className="flex-1" />
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono">{columns.length} 字段</Badge>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => toast("功能即将上线")}>
              <Save className="w-3 h-3" /> 保存
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => toast("功能即将上线")}>
              <Play className="w-3 h-3" /> 执行
            </Button>
          </div>

          {/* Field List Canvas */}
          <div className="flex-1 overflow-auto dot-grid">
            <div className="p-4">
              {/* Table Card */}
              <div className="max-w-2xl mx-auto bg-card border border-border rounded-lg overflow-hidden glow-border">
                {/* Table Header */}
                <div className="px-3 py-2 bg-primary/10 border-b border-border flex items-center gap-2">
                  <Key className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-mono font-semibold text-primary">{tableName || "untitled"}</span>
                  {tableComment && <span className="text-[10px] text-muted-foreground ml-2">— {tableComment}</span>}
                </div>

                {/* Column Headers */}
                <div className="grid grid-cols-[24px_1fr_120px_60px_60px_60px_60px_32px] gap-0 px-2 py-1.5 bg-secondary/30 text-[10px] text-muted-foreground font-medium border-b border-border">
                  <div />
                  <div className="px-1">字段名</div>
                  <div className="px-1">类型</div>
                  <div className="text-center">PK</div>
                  <div className="text-center">NN</div>
                  <div className="text-center">AI</div>
                  <div className="text-center">UQ</div>
                  <div />
                </div>

                {/* Column Rows */}
                {columns.map((col, idx) => {
                  const Icon = getTypeIcon(col.type);
                  return (
                    <div
                      key={idx}
                      className={`grid grid-cols-[24px_1fr_120px_60px_60px_60px_60px_32px] gap-0 px-2 py-1 items-center border-b border-border/50 hover:bg-secondary/20 cursor-pointer transition-colors ${selectedCol === idx ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                      onClick={() => setSelectedCol(idx)}
                    >
                      <GripVertical className="w-3 h-3 text-muted-foreground/50 cursor-grab" />
                      <div className="flex items-center gap-1.5 px-1">
                        <Icon className="w-3 h-3 text-muted-foreground" />
                        <input
                          value={col.name}
                          onChange={e => updateColumn(idx, "name", e.target.value)}
                          className="bg-transparent text-xs font-mono outline-none flex-1 min-w-0"
                        />
                      </div>
                      <div className="px-1">
                        <select
                          value={col.type}
                          onChange={e => updateColumn(idx, "type", e.target.value)}
                          className="bg-secondary text-[10px] font-mono rounded px-1 py-0.5 border border-border/50 w-full outline-none"
                        >
                          {Object.entries(COLUMN_TYPES).map(([group, types]) => (
                            <optgroup key={group} label={group}>
                              {types.map(t => <option key={t} value={t}>{t}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                      <div className="text-center">
                        <input type="checkbox" checked={col.primaryKey} onChange={e => updateColumn(idx, "primaryKey", e.target.checked)} className="accent-primary w-3 h-3" />
                      </div>
                      <div className="text-center">
                        <input type="checkbox" checked={!col.nullable} onChange={e => updateColumn(idx, "nullable", !e.target.checked)} className="accent-amber-400 w-3 h-3" />
                      </div>
                      <div className="text-center">
                        <input type="checkbox" checked={col.autoIncrement} onChange={e => updateColumn(idx, "autoIncrement", e.target.checked)} className="accent-blue-400 w-3 h-3" />
                      </div>
                      <div className="text-center">
                        <input type="checkbox" checked={col.unique} onChange={e => updateColumn(idx, "unique", e.target.checked)} className="accent-purple-400 w-3 h-3" />
                      </div>
                      <button onClick={() => removeColumn(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}

                {/* Add Column */}
                <button
                  onClick={addColumn}
                  className="w-full px-3 py-2 text-xs text-muted-foreground hover:text-primary hover:bg-secondary/30 transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3 h-3" /> 添加字段
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Property Panel */}
        <div className="w-64 border-l border-border bg-card/50 flex flex-col shrink-0">
          <div className="panel-header px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">属性配置</span>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-4">
              {/* Table Properties */}
              <div className="space-y-2.5">
                <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">表属性</h4>
                <div className="space-y-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">存储引擎</Label>
                    <Select value={engine} onValueChange={setEngine}>
                      <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="InnoDB">InnoDB</SelectItem>
                        <SelectItem value="MyISAM">MyISAM</SelectItem>
                        <SelectItem value="MEMORY">MEMORY</SelectItem>
                        <SelectItem value="ARCHIVE">ARCHIVE</SelectItem>
                        <SelectItem value="CSV">CSV</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">字符集</Label>
                    <Select value={charset} onValueChange={setCharset}>
                      <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="utf8mb4">utf8mb4</SelectItem>
                        <SelectItem value="utf8">utf8</SelectItem>
                        <SelectItem value="latin1">latin1</SelectItem>
                        <SelectItem value="gbk">gbk</SelectItem>
                        <SelectItem value="ascii">ascii</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">排序规则</Label>
                    <Select value={collate} onValueChange={setCollate}>
                      <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="utf8mb4_unicode_ci">utf8mb4_unicode_ci</SelectItem>
                        <SelectItem value="utf8mb4_general_ci">utf8mb4_general_ci</SelectItem>
                        <SelectItem value="utf8mb4_bin">utf8mb4_bin</SelectItem>
                        <SelectItem value="utf8_general_ci">utf8_general_ci</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Selected Column Properties */}
              {columns[selectedCol] && (
                <div className="space-y-2.5 pt-2 border-t border-border">
                  <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    字段: <span className="text-primary font-mono">{columns[selectedCol].name}</span>
                  </h4>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">长度/精度</Label>
                      <Input
                        value={columns[selectedCol].length}
                        onChange={e => updateColumn(selectedCol, "length", e.target.value)}
                        placeholder="如 255"
                        className="h-7 text-xs mt-1 font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">默认值</Label>
                      <Input
                        value={columns[selectedCol].defaultVal}
                        onChange={e => updateColumn(selectedCol, "defaultVal", e.target.value)}
                        placeholder="NULL"
                        className="h-7 text-xs mt-1 font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">注释</Label>
                      <Input
                        value={columns[selectedCol].comment}
                        onChange={e => updateColumn(selectedCol, "comment", e.target.value)}
                        placeholder="字段说明..."
                        className="h-7 text-xs mt-1"
                      />
                    </div>
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] text-muted-foreground">主键</Label>
                        <Switch
                          checked={columns[selectedCol].primaryKey}
                          onCheckedChange={v => updateColumn(selectedCol, "primaryKey", v)}
                          className="scale-75"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] text-muted-foreground">NOT NULL</Label>
                        <Switch
                          checked={!columns[selectedCol].nullable}
                          onCheckedChange={v => updateColumn(selectedCol, "nullable", !v)}
                          className="scale-75"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] text-muted-foreground">自增</Label>
                        <Switch
                          checked={columns[selectedCol].autoIncrement}
                          onCheckedChange={v => updateColumn(selectedCol, "autoIncrement", v)}
                          className="scale-75"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] text-muted-foreground">唯一</Label>
                        <Switch
                          checked={columns[selectedCol].unique}
                          onCheckedChange={v => updateColumn(selectedCol, "unique", v)}
                          className="scale-75"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Bottom: SQL Preview */}
      <div className={`border-t border-border bg-card transition-all ${sqlExpanded ? "h-48" : "h-8"}`}>
        <button
          onClick={() => setSqlExpanded(!sqlExpanded)}
          className="w-full h-8 px-4 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium uppercase tracking-wider text-[10px]">SQL 预览</span>
            <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">实时</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(sql); toast("SQL 已复制到剪贴板"); }}>
              <Copy className="w-2.5 h-2.5" /> 复制
            </Button>
            {sqlExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </div>
        </button>
        {sqlExpanded && (
          <div className="px-4 pb-3 h-[calc(100%-2rem)] overflow-auto">
            <pre className="text-[11px] font-mono text-primary/90 leading-relaxed whitespace-pre-wrap">{sql}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
