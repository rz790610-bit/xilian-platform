import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/common/Toast";
import { RefreshCw, Plus, Download, Trash2 } from "lucide-react";

export default function DataExport() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({ taskCode: "", name: "", exportType: "full", format: "csv", createdBy: "admin" });

  const { data: listData, refetch, isLoading } = trpc.opsGovernance.dataExport.list.useQuery({ page, pageSize: 20 });
  const { data: stats } = trpc.opsGovernance.dataExport.stats.useQuery();
  const createMut = trpc.opsGovernance.dataExport.create.useMutation({ onSuccess: () => { toast.success("导出任务已创建"); setShowCreate(false); refetch(); }, onError: (e) => toast.error("创建失败: " + e.message) });
  const deleteMut = trpc.opsGovernance.dataExport.delete.useMutation({ onSuccess: () => { toast.success("任务已删除"); refetch(); }, onError: (e) => toast.error("删除失败: " + e.message) });

  const tasks = listData?.rows || [];
  const total = listData?.total || 0;
  const statusColor = (s: string): "default" | "secondary" | "outline" | "destructive" => s === "completed" ? "default" : s === "running" ? "secondary" : s === "pending" ? "outline" : "destructive";

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">数据导出</h2><p className="text-muted-foreground">管理数据导出任务，支持多种格式和增量导出</p></div>
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{stats?.total ?? "-"}</div><p className="text-xs text-muted-foreground">总任务数</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-yellow-500">{stats?.pending ?? "-"}</div><p className="text-xs text-muted-foreground">排队中</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-500">{stats?.completed ?? "-"}</div><p className="text-xs text-muted-foreground">已完成</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-red-500">{stats?.failed ?? "-"}</div><p className="text-xs text-muted-foreground">失败</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><div className="flex items-center justify-between">
          <div><CardTitle>导出任务</CardTitle><CardDescription>共 {total} 个任务</CardDescription></div>
          <div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
            <Dialog open={showCreate} onOpenChange={setShowCreate}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />新建导出</Button></DialogTrigger>
              <DialogContent><DialogHeader><DialogTitle>新建导出任务</DialogTitle><DialogDescription>配置数据导出参数</DialogDescription></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>任务编码</Label><Input value={newTask.taskCode} onChange={e => setNewTask(p => ({ ...p, taskCode: e.target.value }))} placeholder="EX-XXX" /></div><div className="space-y-2"><Label>任务名称</Label><Input value={newTask.name} onChange={e => setNewTask(p => ({ ...p, name: e.target.value }))} placeholder="振动数据导出" /></div></div>
                  <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>导出类型</Label><Select value={newTask.exportType} onValueChange={v => setNewTask(p => ({ ...p, exportType: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="full">全量导出</SelectItem><SelectItem value="incremental">增量导出</SelectItem><SelectItem value="snapshot">快照导出</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>格式</Label><Select value={newTask.format} onValueChange={v => setNewTask(p => ({ ...p, format: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="csv">CSV</SelectItem><SelectItem value="parquet">Parquet</SelectItem><SelectItem value="json">JSON</SelectItem></SelectContent></Select></div></div>
                </div>
                <DialogFooter><Button onClick={() => createMut.mutate({ ...newTask, queryParams: {} })} disabled={createMut.isPending}>{createMut.isPending ? "创建中..." : "创建任务"}</Button></DialogFooter>
              </DialogContent></Dialog>
          </div>
        </div></CardHeader>
        <CardContent>
          {isLoading ? <div className="text-center py-8 text-muted-foreground">加载中...</div> : tasks.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无导出任务</div> :
          <div className="space-y-3">{tasks.map((task: any) => (
            <div key={task.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
              <div className="flex-1"><div className="flex items-center gap-2"><span className="font-medium">{task.name}</span><Badge variant={statusColor(task.status)}>{task.status}</Badge><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{task.format}</code></div>
              <div className="text-xs text-muted-foreground mt-1">类型: {task.exportType} · 编码: {task.taskCode}{task.totalRows ? ` · ${task.totalRows} 行` : ""}{task.fileSize ? ` · ${task.fileSize} bytes` : ""}</div>
              {task.status === "running" && <Progress value={Number(task.progress) || 0} className="mt-2 h-2" />}</div>
              <div className="flex gap-1 ml-4">
                {task.downloadUrl && <Button variant="outline" size="icon" onClick={() => window.open(task.downloadUrl)}><Download className="w-4 h-4" /></Button>}
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { if(confirm("确定删除？")) deleteMut.mutate({ id: task.id }); }}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
