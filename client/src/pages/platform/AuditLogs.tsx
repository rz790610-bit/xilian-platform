import { MainLayout } from "@/components/layout/MainLayout";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/common/Toast";
import { RefreshCw, Search, FileText, CheckCircle, XCircle, Shield } from "lucide-react";

export default function AuditLogs() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");

  const { data: listData, refetch, isLoading } = trpc.platformSystem.auditLogs.list.useQuery({ page, pageSize: 20, action: filterAction !== "all" ? filterAction : undefined, keyword: search || undefined });
  const { data: stats } = trpc.platformSystem.auditLogs.stats.useQuery();

  const logs = listData?.rows || [];
  const total = listData?.total || 0;

  return (
    <MainLayout title="审计日志">
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">审计日志</h2><p className="text-muted-foreground">查看系统操作审计记录，追踪所有关键操作</p></div>
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><FileText className="w-5 h-5 text-muted-foreground" /><div><div className="text-2xl font-bold">{stats?.total ?? "-"}</div><p className="text-xs text-muted-foreground">总记录数</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-500" /><div><div className="text-2xl font-bold text-green-500">{stats?.success ?? "-"}</div><p className="text-xs text-muted-foreground">成功操作</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><XCircle className="w-5 h-5 text-red-500" /><div><div className="text-2xl font-bold text-red-500">{stats?.fail ?? "-"}</div><p className="text-xs text-muted-foreground">失败操作</p></div></div></CardContent></Card>
      </div>
      <Card>
        <CardHeader><div className="flex items-center justify-between">
          <div><CardTitle>审计记录</CardTitle><CardDescription>共 {total} 条记录</CardDescription></div>
          <div className="flex gap-2">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="搜索..." value={search} onChange={e => setSearch(e.target.value)} className="w-48 pl-9" /></div>
            <Select value={filterAction} onValueChange={setFilterAction}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部操作</SelectItem><SelectItem value="CREATE">创建</SelectItem><SelectItem value="UPDATE">更新</SelectItem><SelectItem value="DELETE">删除</SelectItem><SelectItem value="EXPORT">导出</SelectItem></SelectContent></Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
          </div>
        </div></CardHeader>
        <CardContent>
          {isLoading ? <div className="text-center py-8 text-muted-foreground">加载中...</div> : logs.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无审计记录</div> :
          <div className="space-y-2">{logs.map((log: any) => (
            <div key={log.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-3"><Shield className="w-4 h-4 text-muted-foreground" />
                <div><div className="flex items-center gap-2"><Badge variant={log.result === "success" ? "default" : "destructive"}>{log.result === "success" ? "成功" : "失败"}</Badge><Badge variant="outline">{log.action}</Badge><span className="text-sm font-medium">{log.resourceType}:{log.resourceId}</span></div>
                <div className="text-xs text-muted-foreground mt-1">操作者: {log.operator} · IP: {log.operatorIp || "-"}{log.traceId ? ` · Trace: ${log.traceId}` : ""}</div></div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(log.createdAt).toLocaleString("zh-CN")}</span>
            </div>
          ))}</div>}
          {total > 20 && <div className="flex justify-center gap-2 mt-4"><Button variant="outline" size="sm" disabled={page<=1} onClick={() => setPage(p=>p-1)}>上一页</Button><span className="text-sm text-muted-foreground py-2">第{page}页/共{Math.ceil(total/20)}页</span><Button variant="outline" size="sm" disabled={page>=Math.ceil(total/20)} onClick={() => setPage(p=>p+1)}>下一页</Button></div>}
        </CardContent>
      </Card>
    </div>
    </MainLayout>
  );
}
