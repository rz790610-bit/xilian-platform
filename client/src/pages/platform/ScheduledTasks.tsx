import { MainLayout } from "@/components/layout/MainLayout";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/common/Toast";
import { RefreshCw, Plus, Clock, Play, Pause, Trash2 } from "lucide-react";

export default function ScheduledTasks() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({ taskCode: "", name: "", taskType: "data_governance", handler: "", cronExpression: "", status: "active" });

  const { data: listData, refetch, isLoading } = trpc.platformSystem.scheduledTasks.list.useQuery({ page, pageSize: 20 });
  const { data: stats } = trpc.platformSystem.scheduledTasks.stats.useQuery();
  const createMut = trpc.platformSystem.scheduledTasks.create.useMutation({ onSuccess: () => { toast.success("任务创建成功"); setShowCreate(false); refetch(); }, onError: (e) => toast.error("创建失败: " + e.message) });
  const toggleMut = trpc.platformSystem.scheduledTasks.toggleStatus.useMutation({ onSuccess: () => { toast.success("状态已更新"); refetch(); }, onError: (e) => toast.error("更新失败: " + e.message) });
  const deleteMut = trpc.platformSystem.scheduledTasks.delete.useMutation({ onSuccess: () => { toast.success("任务已删除"); refetch(); }, onError: (e) => toast.error("删除失败: " + e.message) });

  const tasks = listData?.rows || [];
  const total = listData?.total || 0;
  const statusColor = (s: string): "default" | "secondary" | "destructive" => s === "active" ? "default" : s === "paused" ? "secondary" : "destructive";

  return (
    <MainLayout title="定时任务">
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">定时任务管理</h2><p className="text-muted-foreground">管理系统定时任务，包括数据清洗、归档、健康检查等</p></div>
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Clock className="w-5 h-5" /><div><div className="text-2xl font-bold">{stats?.total ?? "-"}</div><p className="text-xs text-muted-foreground">总任务数</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-500">{stats?.active ?? "-"}</div><p className="text-xs text-muted-foreground">运行中</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-yellow-500">{stats?.paused ?? "-"}</div><p className="text-xs text-muted-foreground">已暂停</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><div className="flex items-center justify-between">
          <div><CardTitle>任务列表</CardTitle><CardDescription>共 {total} 个任务</CardDescription></div>
          <div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
            <Dialog open={showCreate} onOpenChange={setShowCreate}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />新建任务</Button></DialogTrigger>
              <DialogContent><DialogHeader><DialogTitle>新建定时任务</DialogTitle><DialogDescription>配置定时任务参数</DialogDescription></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>任务编码</Label><Input value={newTask.taskCode} onChange={e => setNewTask(p => ({ ...p, taskCode: e.target.value }))} placeholder="ST-XXX" /></div><div className="space-y-2"><Label>任务名称</Label><Input value={newTask.name} onChange={e => setNewTask(p => ({ ...p, name: e.target.value }))} placeholder="数据清洗任务" /></div></div>
                  <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Cron 表达式</Label><Input value={newTask.cronExpression} onChange={e => setNewTask(p => ({ ...p, cronExpression: e.target.value }))} placeholder="0 2 * * *" /></div><div className="space-y-2"><Label>处理器</Label><Input value={newTask.handler} onChange={e => setNewTask(p => ({ ...p, handler: e.target.value }))} placeholder="dataCleanHandler" /></div></div>
                  <div className="space-y-2"><Label>任务类型</Label><Select value={newTask.taskType} onValueChange={v => setNewTask(p => ({ ...p, taskType: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="data_governance">数据治理</SelectItem><SelectItem value="data_archive">数据归档</SelectItem><SelectItem value="diagnosis">诊断</SelectItem><SelectItem value="data_lifecycle">生命周期</SelectItem></SelectContent></Select></div>
                </div>
                <DialogFooter><Button onClick={() => createMut.mutate(newTask)} disabled={createMut.isPending}>{createMut.isPending ? "创建中..." : "创建任务"}</Button></DialogFooter>
              </DialogContent></Dialog>
          </div>
        </div></CardHeader>
        <CardContent>
          {isLoading ? <div className="text-center py-8 text-muted-foreground">加载中...</div> : tasks.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无定时任务</div> :
          <div className="space-y-3">{tasks.map((task: any) => (
            <div key={task.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
              <div><div className="flex items-center gap-2"><span className="font-medium">{task.name}</span><Badge variant={statusColor(task.status)}>{task.status === "active" ? "运行中" : task.status === "paused" ? "已暂停" : "异常"}</Badge><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{task.cronExpression || "N/A"}</code></div>
              <div className="text-xs text-muted-foreground mt-1">类型: {task.taskType} · 处理器: {task.handler} · 编码: {task.taskCode}</div></div>
              <div className="flex gap-1">
                {task.status === "active" ? <Button variant="ghost" size="icon" onClick={() => toggleMut.mutate({ id: task.id, status: "paused" })}><Pause className="w-4 h-4" /></Button> : <Button variant="ghost" size="icon" onClick={() => toggleMut.mutate({ id: task.id, status: "active" })}><Play className="w-4 h-4" /></Button>}
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { if(confirm("确定删除？")) deleteMut.mutate({ id: task.id }); }}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}</div>}
        </CardContent>
      </Card>
    </div>
    </MainLayout>
  );
}
