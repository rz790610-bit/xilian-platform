import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/common/Toast";
import { RefreshCw, Plus, Search, AlertTriangle, Bell, ShieldAlert, Activity } from "lucide-react";

export default function AlertRules() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [newRule, setNewRule] = useState({ ruleCode: "", name: "", deviceType: "", measurementType: "", severity: "warning", cooldownSeconds: 300, description: "" });

  const { data: listData, refetch, isLoading } = trpc.platformSystem.alertRules.list.useQuery({ page, pageSize: 20, severity: filterSeverity !== "all" ? filterSeverity : undefined, keyword: search || undefined });
  const { data: stats, refetch: refetchStats } = trpc.platformSystem.alertRules.stats.useQuery();
  const createMut = trpc.platformSystem.alertRules.create.useMutation({ onSuccess: () => { toast.success("告警规则创建成功"); setShowCreate(false); refetch(); refetchStats(); }, onError: (e) => toast.error("创建失败: " + e.message) });
  const toggleMut = trpc.platformSystem.alertRules.toggleActive.useMutation({ onSuccess: () => { toast.success("状态已更新"); refetch(); refetchStats(); }, onError: (e) => toast.error("更新失败: " + e.message) });
  const deleteMut = trpc.platformSystem.alertRules.delete.useMutation({ onSuccess: () => { toast.success("规则已删除"); refetch(); refetchStats(); }, onError: (e) => toast.error("删除失败: " + e.message) });

  const rules = listData?.rows || [];
  const total = listData?.total || 0;
  const sevColor = (s: string): "destructive" | "secondary" | "outline" => s === "critical" ? "destructive" : s === "warning" ? "secondary" : "outline";

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">告警规则管理</h2><p className="text-muted-foreground">配置和管理设备告警规则，实时监控异常状态</p></div>
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-muted-foreground" /><div><div className="text-2xl font-bold">{stats?.total ?? "-"}</div><p className="text-xs text-muted-foreground">总规则数</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Activity className="w-5 h-5 text-green-500" /><div><div className="text-2xl font-bold text-green-500">{stats?.active ?? "-"}</div><p className="text-xs text-muted-foreground">已启用</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-red-500" /><div><div className="text-2xl font-bold text-red-500">{stats?.critical ?? "-"}</div><p className="text-xs text-muted-foreground">严重级别</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Bell className="w-5 h-5 text-yellow-500" /><div><div className="text-2xl font-bold text-yellow-500">{stats?.warning ?? "-"}</div><p className="text-xs text-muted-foreground">警告级别</p></div></div></CardContent></Card>
      </div>
      <Card>
        <CardHeader><div className="flex items-center justify-between">
          <div><CardTitle>告警规则列表</CardTitle><CardDescription>共 {total} 条规则</CardDescription></div>
          <div className="flex gap-2">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="搜索规则名称..." value={search} onChange={e => setSearch(e.target.value)} className="w-64 pl-9" /></div>
            <Select value={filterSeverity} onValueChange={setFilterSeverity}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部级别</SelectItem><SelectItem value="critical">严重</SelectItem><SelectItem value="warning">警告</SelectItem><SelectItem value="info">信息</SelectItem></SelectContent></Select>
            <Button variant="outline" size="icon" onClick={() => { refetch(); refetchStats(); }}><RefreshCw className="w-4 h-4" /></Button>
            <Dialog open={showCreate} onOpenChange={setShowCreate}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />新建规则</Button></DialogTrigger>
              <DialogContent><DialogHeader><DialogTitle>新建告警规则</DialogTitle><DialogDescription>配置新的告警规则参数</DialogDescription></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>规则编码</Label><Input value={newRule.ruleCode} onChange={e => setNewRule(p => ({ ...p, ruleCode: e.target.value }))} placeholder="AR-XXX" /></div><div className="space-y-2"><Label>规则名称</Label><Input value={newRule.name} onChange={e => setNewRule(p => ({ ...p, name: e.target.value }))} placeholder="振动超限告警" /></div></div>
                  <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>设备类型</Label><Input value={newRule.deviceType} onChange={e => setNewRule(p => ({ ...p, deviceType: e.target.value }))} placeholder="旋转设备" /></div><div className="space-y-2"><Label>监控指标</Label><Input value={newRule.measurementType} onChange={e => setNewRule(p => ({ ...p, measurementType: e.target.value }))} placeholder="vibration_rms" /></div></div>
                  <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>严重级别</Label><Select value={newRule.severity} onValueChange={v => setNewRule(p => ({ ...p, severity: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="critical">严重</SelectItem><SelectItem value="warning">警告</SelectItem><SelectItem value="info">信息</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>冷却时间(秒)</Label><Input type="number" value={newRule.cooldownSeconds} onChange={e => setNewRule(p => ({ ...p, cooldownSeconds: Number(e.target.value) }))} /></div></div>
                  <div className="space-y-2"><Label>描述</Label><Input value={newRule.description} onChange={e => setNewRule(p => ({ ...p, description: e.target.value }))} placeholder="规则描述..." /></div>
                </div>
                <DialogFooter><Button onClick={() => createMut.mutate({ ...newRule, condition: {} })} disabled={createMut.isPending}>{createMut.isPending ? "创建中..." : "创建规则"}</Button></DialogFooter>
              </DialogContent></Dialog>
          </div>
        </div></CardHeader>
        <CardContent>
          {isLoading ? <div className="text-center py-8 text-muted-foreground">加载中...</div> : rules.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无告警规则</div> :
          <div className="space-y-3">{rules.map((rule: any) => (
            <div key={rule.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-4">
                <Switch checked={rule.isActive === 1} onCheckedChange={(c) => toggleMut.mutate({ id: rule.id, isActive: c ? 1 : 0 })} />
                <div><div className="flex items-center gap-2"><span className="font-medium">{rule.name}</span><Badge variant={sevColor(rule.severity)}>{rule.severity === "critical" ? "严重" : rule.severity === "warning" ? "警告" : "信息"}</Badge><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{rule.ruleCode}</code></div>
                <div className="text-xs text-muted-foreground mt-1">设备类型: {rule.deviceType} · 指标: {rule.measurementType} · 冷却: {rule.cooldownSeconds}s{rule.description && ` · ${rule.description}`}</div></div>
              </div>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { if(confirm("确定删除？")) deleteMut.mutate({ id: rule.id }); }}>删除</Button>
            </div>
          ))}</div>}
          {total > 20 && <div className="flex justify-center gap-2 mt-4"><Button variant="outline" size="sm" disabled={page<=1} onClick={() => setPage(p=>p-1)}>上一页</Button><span className="text-sm text-muted-foreground py-2">第{page}页/共{Math.ceil(total/20)}页</span><Button variant="outline" size="sm" disabled={page>=Math.ceil(total/20)} onClick={() => setPage(p=>p+1)}>下一页</Button></div>}
        </CardContent>
      </Card>
    </div>
  );
}
