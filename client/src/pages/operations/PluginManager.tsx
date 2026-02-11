import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/common/Toast";
import { RefreshCw, Plus, Play, Square, Trash2, Puzzle } from "lucide-react";

export default function PluginManager() {
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newPlugin, setNewPlugin] = useState({ pluginCode: "", name: "", pluginType: "protocol", version: "1.0.0", entryPoint: "", description: "" });

  const { data: regData, refetch: refetchReg } = trpc.opsPlugin.registry.list.useQuery({ page: 1, pageSize: 50 });
  const { data: regStats } = trpc.opsPlugin.registry.stats.useQuery();
  const { data: instData, refetch: refetchInst } = trpc.opsPlugin.instances.list.useQuery({ page: 1, pageSize: 50 });
  const { data: evtData, refetch: refetchEvt } = trpc.opsPlugin.events.list.useQuery({ page: 1, pageSize: 20 });
  const { data: evtStats } = trpc.opsPlugin.events.stats.useQuery();

  const createMut = trpc.opsPlugin.registry.create.useMutation({ onSuccess: () => { toast.success("插件注册成功"); setShowCreate(false); refetchReg(); }, onError: (e) => toast.error("注册失败: " + e.message) });
  const startMut = trpc.opsPlugin.instances.start.useMutation({ onSuccess: () => { toast.success("实例已启动"); refetchInst(); }, onError: (e) => toast.error("启动失败: " + e.message) });
  const stopMut = trpc.opsPlugin.instances.stop.useMutation({ onSuccess: () => { toast.success("实例已停止"); refetchInst(); }, onError: (e) => toast.error("停止失败: " + e.message) });
  const deleteRegMut = trpc.opsPlugin.registry.delete.useMutation({ onSuccess: () => { toast.success("插件已删除"); refetchReg(); }, onError: (e) => toast.error("删除失败: " + e.message) });

  const plugins = regData?.rows || [];
  const instances = instData?.rows || [];
  const events = evtData?.rows || [];
  const statusColor = (s: string): "default" | "secondary" | "destructive" | "outline" => s === "active" || s === "running" ? "default" : s === "stopped" || s === "draft" ? "secondary" : s === "error" ? "destructive" : "outline";

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">插件管理</h2><p className="text-muted-foreground">管理平台插件注册、实例运行和事件监控</p></div>
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Puzzle className="w-5 h-5" /><div><div className="text-2xl font-bold">{regStats?.total ?? "-"}</div><p className="text-xs text-muted-foreground">注册插件</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-500">{regStats?.active ?? "-"}</div><p className="text-xs text-muted-foreground">活跃插件</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{instances.length}</div><p className="text-xs text-muted-foreground">运行实例</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-red-500">{evtStats?.error ?? "-"}</div><p className="text-xs text-muted-foreground">错误事件</p></CardContent></Card>
      </div>
      <Tabs defaultValue="registry">
        <TabsList><TabsTrigger value="registry">插件注册表</TabsTrigger><TabsTrigger value="instances">运行实例</TabsTrigger><TabsTrigger value="events">事件日志</TabsTrigger></TabsList>
        <TabsContent value="registry"><Card>
          <CardHeader><div className="flex items-center justify-between"><CardTitle>注册表</CardTitle><div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => refetchReg()}><RefreshCw className="w-4 h-4" /></Button>
            <Dialog open={showCreate} onOpenChange={setShowCreate}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />注册插件</Button></DialogTrigger>
              <DialogContent><DialogHeader><DialogTitle>注册新插件</DialogTitle><DialogDescription>填写插件信息</DialogDescription></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>插件编码</Label><Input value={newPlugin.pluginCode} onChange={e => setNewPlugin(p => ({ ...p, pluginCode: e.target.value }))} /></div><div className="space-y-2"><Label>名称</Label><Input value={newPlugin.name} onChange={e => setNewPlugin(p => ({ ...p, name: e.target.value }))} /></div></div>
                  <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>类型</Label><Select value={newPlugin.pluginType} onValueChange={v => setNewPlugin(p => ({ ...p, pluginType: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="protocol">协议适配</SelectItem><SelectItem value="algorithm">算法</SelectItem><SelectItem value="visualization">可视化</SelectItem><SelectItem value="storage">存储</SelectItem><SelectItem value="utility">工具</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>版本</Label><Input value={newPlugin.version} onChange={e => setNewPlugin(p => ({ ...p, version: e.target.value }))} /></div></div>
                  <div className="space-y-2"><Label>入口点</Label><Input value={newPlugin.entryPoint} onChange={e => setNewPlugin(p => ({ ...p, entryPoint: e.target.value }))} placeholder="plugins/my-plugin/index.ts" /></div>
                  <div className="space-y-2"><Label>描述</Label><Input value={newPlugin.description} onChange={e => setNewPlugin(p => ({ ...p, description: e.target.value }))} /></div>
                </div>
                <DialogFooter><Button onClick={() => createMut.mutate(newPlugin)} disabled={createMut.isPending}>{createMut.isPending ? "注册中..." : "注册"}</Button></DialogFooter>
              </DialogContent></Dialog>
          </div></div></CardHeader>
          <CardContent><div className="space-y-3">{plugins.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
              <div><div className="flex items-center gap-2"><span className="font-medium">{p.name}</span><Badge variant={statusColor(p.status)}>{p.status}</Badge><code className="text-xs bg-muted px-1.5 py-0.5 rounded">v{p.version}</code><Badge variant="outline">{p.pluginType}</Badge></div>
              <div className="text-xs text-muted-foreground mt-1">{p.description || p.pluginCode} · 入口: {p.entryPoint}</div></div>
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { if(confirm("确定删除？")) deleteRegMut.mutate({ id: p.id }); }}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}</div></CardContent>
        </Card></TabsContent>
        <TabsContent value="instances"><Card>
          <CardHeader><div className="flex items-center justify-between"><CardTitle>运行实例</CardTitle><Button variant="outline" size="icon" onClick={() => refetchInst()}><RefreshCw className="w-4 h-4" /></Button></div></CardHeader>
          <CardContent>{instances.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无运行实例</div> :
          <div className="space-y-3">{instances.map((i: any) => (
            <div key={i.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
              <div><div className="flex items-center gap-2"><span className="font-medium">{i.name}</span><Badge variant={statusColor(i.status)}>{i.status}</Badge><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{i.instanceCode}</code></div></div>
              <div className="flex gap-1">
                {i.status !== "running" && <Button variant="outline" size="icon" onClick={() => startMut.mutate({ id: i.id })}><Play className="w-4 h-4" /></Button>}
                {i.status === "running" && <Button variant="outline" size="icon" onClick={() => stopMut.mutate({ id: i.id })}><Square className="w-4 h-4" /></Button>}
              </div>
            </div>
          ))}</div>}</CardContent>
        </Card></TabsContent>
        <TabsContent value="events"><Card>
          <CardHeader><div className="flex items-center justify-between"><CardTitle>事件日志</CardTitle><Button variant="outline" size="icon" onClick={() => refetchEvt()}><RefreshCw className="w-4 h-4" /></Button></div></CardHeader>
          <CardContent>{events.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无事件</div> :
          <div className="space-y-2">{events.map((e: any) => (
            <div key={e.id} className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-2"><Badge variant={e.severity === "error" ? "destructive" : e.severity === "warning" ? "secondary" : "outline"}>{e.severity}</Badge><span className="text-sm">{e.eventType}</span><span className="text-xs text-muted-foreground">{e.message}</span></div>
              <span className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString("zh-CN")}</span>
            </div>
          ))}</div>}</CardContent>
        </Card></TabsContent>
      </Tabs>
    </div>
  );
}
