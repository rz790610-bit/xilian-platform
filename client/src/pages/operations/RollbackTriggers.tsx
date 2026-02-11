import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/common/Toast";
import { RefreshCw, Plus, Trash2, RotateCcw } from "lucide-react";

export default function RollbackTriggers() {
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newTrigger, setNewTrigger] = useState({ triggerCode: "", name: "", targetTable: "", conditionType: "threshold", rollbackAction: "rollback_to_previous" });

  const { data: listData, refetch, isLoading } = trpc.opsDevice.rollbackTriggers.list.useQuery({ page: 1, pageSize: 50 });
  const { data: stats } = trpc.opsDevice.rollbackTriggers.stats.useQuery();
  const { data: execData } = trpc.opsDevice.rollbackTriggers.executions.useQuery({ page: 1, pageSize: 10 });
  const createMut = trpc.opsDevice.rollbackTriggers.create.useMutation({ onSuccess: () => { toast.success("触发器创建成功"); setShowCreate(false); refetch(); }, onError: (e) => toast.error("创建失败: " + e.message) });
  const toggleMut = trpc.opsDevice.rollbackTriggers.toggleActive.useMutation({ onSuccess: () => { toast.success("状态已更新"); refetch(); }, onError: (e) => toast.error("更新失败: " + e.message) });
  const deleteMut = trpc.opsDevice.rollbackTriggers.delete.useMutation({ onSuccess: () => { toast.success("触发器已删除"); refetch(); }, onError: (e) => toast.error("删除失败: " + e.message) });

  const triggers = listData?.rows || [];
  const executions = execData?.rows || [];

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">回滚触发器</h2><p className="text-muted-foreground">配置自动回滚条件，当规则表现异常时自动触发回滚</p></div>
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{stats?.total ?? "-"}</div><p className="text-xs text-muted-foreground">总触发器</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-500">{stats?.active ?? "-"}</div><p className="text-xs text-muted-foreground">已启用</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-blue-500">{stats?.totalExecutions ?? "-"}</div><p className="text-xs text-muted-foreground">历史执行</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><div className="flex items-center justify-between">
          <div><CardTitle>触发器列表</CardTitle></div>
          <div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
            <Dialog open={showCreate} onOpenChange={setShowCreate}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />新建触发器</Button></DialogTrigger>
              <DialogContent><DialogHeader><DialogTitle>新建回滚触发器</DialogTitle><DialogDescription>配置自动回滚条件</DialogDescription></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>触发器编码</Label><Input value={newTrigger.triggerCode} onChange={e => setNewTrigger(p => ({ ...p, triggerCode: e.target.value }))} placeholder="RT-XXX" /></div><div className="space-y-2"><Label>名称</Label><Input value={newTrigger.name} onChange={e => setNewTrigger(p => ({ ...p, name: e.target.value }))} placeholder="误报率回滚" /></div></div>
                  <div className="space-y-2"><Label>目标表</Label><Input value={newTrigger.targetTable} onChange={e => setNewTrigger(p => ({ ...p, targetTable: e.target.value }))} placeholder="device_rule_versions" /></div>
                </div>
                <DialogFooter><Button onClick={() => createMut.mutate({ ...newTrigger, conditionParams: {}, actionParams: {} })} disabled={createMut.isPending}>{createMut.isPending ? "创建中..." : "创建触发器"}</Button></DialogFooter>
              </DialogContent></Dialog>
          </div>
        </div></CardHeader>
        <CardContent>
          {isLoading ? <div className="text-center py-8 text-muted-foreground">加载中...</div> : triggers.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无回滚触发器</div> :
          <div className="space-y-3">{triggers.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-4">
                <Switch checked={t.isActive === 1} onCheckedChange={(c) => toggleMut.mutate({ id: t.id, isActive: c ? 1 : 0 })} />
                <div><div className="flex items-center gap-2"><span className="font-medium">{t.name}</span><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{t.triggerCode}</code></div>
                <div className="text-xs text-muted-foreground mt-1">目标: {t.targetTable} · 条件: {t.conditionType} · 动作: {t.rollbackAction}</div></div>
              </div>
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { if(confirm("确定删除？")) deleteMut.mutate({ id: t.id }); }}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}</div>}
        </CardContent>
      </Card>
      {executions.length > 0 && <Card>
        <CardHeader><CardTitle className="text-lg">最近执行记录</CardTitle></CardHeader>
        <CardContent><div className="space-y-2">{executions.map((e: any) => (
          <div key={e.id} className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-2"><RotateCcw className="w-4 h-4" /><span className="text-sm">{e.triggerCode}</span><Badge variant={e.status === "success" ? "default" : "destructive"}>{e.status}</Badge></div>
            <span className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString("zh-CN")}</span>
          </div>
        ))}</div></CardContent>
      </Card>}
    </div>
  );
}
