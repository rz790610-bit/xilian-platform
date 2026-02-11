import { MainLayout } from "@/components/layout/MainLayout";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/common/Toast";
import { RefreshCw, Plus, Trash2, Database } from "lucide-react";

export default function SyntheticDatasets() {
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newDs, setNewDs] = useState({ taskCode: "", name: "", format: "csv", createdBy: "admin" });

  const { data: listData, refetch, isLoading } = trpc.opsGovernance.syntheticDatasets.list.useQuery({ page: 1, pageSize: 20 });
  const { data: stats } = trpc.opsGovernance.syntheticDatasets.stats.useQuery();
  const createMut = trpc.opsGovernance.syntheticDatasets.create.useMutation({ onSuccess: () => { toast.success("合成数据集任务已创建"); setShowCreate(false); refetch(); }, onError: (e) => toast.error("创建失败: " + e.message) });
  const deleteMut = trpc.opsGovernance.syntheticDatasets.delete.useMutation({ onSuccess: () => { toast.success("已删除"); refetch(); }, onError: (e) => toast.error("删除失败: " + e.message) });

  const datasets = listData?.rows || [];
  const statusColor = (s: string): "default" | "secondary" | "destructive" | "outline" => s === "completed" ? "default" : s === "running" ? "secondary" : s === "failed" ? "destructive" : "outline";

  return (
    <MainLayout title="合成数据集">
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">合成数据集</h2><p className="text-muted-foreground">管理 AI 训练用合成数据集的生成和管理</p></div>
      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Database className="w-5 h-5" /><div><div className="text-2xl font-bold">{stats?.total ?? "-"}</div><p className="text-xs text-muted-foreground">总数据集</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-500">{stats?.completed ?? "-"}</div><p className="text-xs text-muted-foreground">已完成</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><div className="flex items-center justify-between">
          <CardTitle>数据集列表</CardTitle>
          <div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
            <Dialog open={showCreate} onOpenChange={setShowCreate}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />新建数据集</Button></DialogTrigger>
              <DialogContent><DialogHeader><DialogTitle>新建合成数据集</DialogTitle><DialogDescription>配置合成数据集参数</DialogDescription></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>编码</Label><Input value={newDs.taskCode} onChange={e => setNewDs(p => ({ ...p, taskCode: e.target.value }))} placeholder="SD-XXX" /></div><div className="space-y-2"><Label>名称</Label><Input value={newDs.name} onChange={e => setNewDs(p => ({ ...p, name: e.target.value }))} placeholder="轴承故障合成数据集" /></div></div>
                </div>
                <DialogFooter><Button onClick={() => createMut.mutate({ ...newDs, queryParams: { method: "GAN" } })} disabled={createMut.isPending}>{createMut.isPending ? "创建中..." : "创建"}</Button></DialogFooter>
              </DialogContent></Dialog>
          </div>
        </div></CardHeader>
        <CardContent>
          {isLoading ? <div className="text-center py-8 text-muted-foreground">加载中...</div> : datasets.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无合成数据集</div> :
          <div className="space-y-3">{datasets.map((ds: any) => (
            <div key={ds.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
              <div><div className="flex items-center gap-2"><span className="font-medium">{ds.name}</span><Badge variant={statusColor(ds.status)}>{ds.status}</Badge><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{ds.taskCode}</code></div>
              <div className="text-xs text-muted-foreground mt-1">格式: {ds.format} · 创建者: {ds.createdBy}{ds.totalRows ? ` · ${ds.totalRows} 行` : ""}</div></div>
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { if(confirm("确定删除？")) deleteMut.mutate({ id: ds.id }); }}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}</div>}
        </CardContent>
      </Card>
    </div>
    </MainLayout>
  );
}
