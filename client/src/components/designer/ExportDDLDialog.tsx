/**
 * ExportDDLDialog — DDL 导出对话框
 * 支持全量导出、按域导出、单表导出
 * 支持复制到剪贴板和下载 .sql 文件
 */
import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Download, Check, Database, FileCode2 } from "lucide-react";
import { toast } from "sonner";
import { useTableSchema } from "@/hooks/useTableSchema";
import { generateFullDDL, generateDomainDDL, generateTableDDL } from "@/lib/ddl-generator";
import { RELATIONS } from "@/data/relations";

type ExportMode = "all" | "domain" | "table";

interface ExportDDLDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 预选的表名（从其他组件打开时） */
  preselectedTable?: string;
  /** 预选的域（从其他组件打开时） */
  preselectedDomain?: string;
}

export default function ExportDDLDialog({
  open,
  onOpenChange,
  preselectedTable,
  preselectedDomain,
}: ExportDDLDialogProps) {
  const schema = useTableSchema();

  const [mode, setMode] = useState<ExportMode>(
    preselectedTable ? "table" : preselectedDomain ? "domain" : "all"
  );
  const [selectedDomain, setSelectedDomain] = useState(preselectedDomain || "base-config");
  const [selectedTable, setSelectedTable] = useState(preselectedTable || "");
  const [includeDropIfExists, setIncludeDropIfExists] = useState(true);
  const [includeForeignKeys, setIncludeForeignKeys] = useState(true);
  const [copied, setCopied] = useState(false);

  // 域标签映射
  const domainLabels = useMemo(() => {
    const map: Record<string, string> = {};
    schema.domains.forEach(d => { map[d.id] = d.label; });
    return map;
  }, [schema.domains]);

  // 生成 DDL
  const ddl = useMemo(() => {
    if (mode === "all") {
      return generateFullDDL(schema.allTables, RELATIONS, {
        includeDropIfExists,
        includeForeignKeys,
        groupByDomain: true,
        domainLabels,
      });
    } else if (mode === "domain") {
      return generateDomainDDL(
        schema.allTables,
        RELATIONS,
        selectedDomain,
        domainLabels[selectedDomain] || selectedDomain,
        { includeDropIfExists }
      );
    } else {
      const table = schema.getTable(selectedTable);
      if (!table) return "-- 请选择一张表";
      return generateTableDDL(table, { includeDropIfExists, includeComment: true });
    }
  }, [mode, selectedDomain, selectedTable, includeDropIfExists, includeForeignKeys, schema, domainLabels]);

  // 统计
  const stats = useMemo(() => {
    if (mode === "all") {
      return { tables: schema.totalCount, fields: schema.allTables.reduce((s, t) => s + t.fields.length, 0), relations: RELATIONS.length };
    } else if (mode === "domain") {
      const tables = schema.allTables.filter(t => t.domain === selectedDomain);
      return {
        tables: tables.length,
        fields: tables.reduce((s, t) => s + t.fields.length, 0),
        relations: RELATIONS.filter(r => tables.some(t => t.tableName === r.from || t.tableName === r.to)).length,
      };
    } else {
      const table = schema.getTable(selectedTable);
      return { tables: 1, fields: table?.fields.length ?? 0, relations: 0 };
    }
  }, [mode, selectedDomain, selectedTable, schema]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(ddl);
    setCopied(true);
    toast.success("DDL 已复制到剪贴板");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const filename = mode === "all"
      ? "iot_platform_ddl.sql"
      : mode === "domain"
        ? `${selectedDomain}_ddl.sql`
        : `${selectedTable}_ddl.sql`;

    const blob = new Blob([ddl], { type: "text/sql;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`已下载 ${filename}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <FileCode2 className="w-4 h-4 text-primary" />
            导出 Schema DDL
          </DialogTitle>
          <DialogDescription className="text-xs">
            生成 MySQL DDL 脚本，支持全量导出、按域导出或单表导出
          </DialogDescription>
        </DialogHeader>

        {/* Controls */}
        <div className="flex items-center gap-4 py-2 border-b border-border">
          {/* Mode selector */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground shrink-0">导出范围</Label>
            <Select value={mode} onValueChange={v => setMode(v as ExportMode)}>
              <SelectTrigger className="h-7 text-xs w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部表</SelectItem>
                <SelectItem value="domain">按域</SelectItem>
                <SelectItem value="table">单表</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Domain selector */}
          {mode === "domain" && (
            <Select value={selectedDomain} onValueChange={setSelectedDomain}>
              <SelectTrigger className="h-7 text-xs w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {schema.domains.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Table selector */}
          {mode === "table" && (
            <Select value={selectedTable} onValueChange={setSelectedTable}>
              <SelectTrigger className="h-7 text-xs w-52">
                <SelectValue placeholder="选择表..." />
              </SelectTrigger>
              <SelectContent>
                {schema.allTables.map(t => (
                  <SelectItem key={t.tableName} value={t.tableName}>
                    {t.tableName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex-1" />

          {/* Options */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Switch
                id="drop-if-exists"
                checked={includeDropIfExists}
                onCheckedChange={setIncludeDropIfExists}
                className="scale-75"
              />
              <Label htmlFor="drop-if-exists" className="text-[10px] text-muted-foreground cursor-pointer">
                DROP IF EXISTS
              </Label>
            </div>
            {mode !== "table" && (
              <div className="flex items-center gap-1.5">
                <Switch
                  id="foreign-keys"
                  checked={includeForeignKeys}
                  onCheckedChange={setIncludeForeignKeys}
                  className="scale-75"
                />
                <Label htmlFor="foreign-keys" className="text-[10px] text-muted-foreground cursor-pointer">
                  外键约束
                </Label>
              </div>
            )}
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-3 py-1.5">
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono gap-1">
            <Database className="w-2.5 h-2.5" /> {stats.tables} 表
          </Badge>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono">
            {stats.fields} 字段
          </Badge>
          {stats.relations > 0 && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono">
              {stats.relations} 外键
            </Badge>
          )}
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono">
            {ddl.length.toLocaleString()} 字符
          </Badge>
          <div className="flex-1" />
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleCopy}>
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            {copied ? "已复制" : "复制"}
          </Button>
          <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleDownload}>
            <Download className="w-3 h-3" /> 下载 .sql
          </Button>
        </div>

        {/* DDL Preview */}
        <ScrollArea className="flex-1 min-h-0 border border-border rounded-md bg-secondary/30">
          <pre className="p-4 text-[11px] font-mono text-foreground/90 leading-relaxed whitespace-pre">
            {ddl}
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
