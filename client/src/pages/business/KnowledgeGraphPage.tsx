import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/common/Toast";
import { RefreshCw, Plus, Trash2, Network, Circle, ArrowRight } from "lucide-react";

export default function KnowledgeGraphPage() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [showAddNode, setShowAddNode] = useState(false);
  const [newNode, setNewNode] = useState({ nodeId: "", label: "", type: "entity", collectionId: 1 });

  const { data: graphData, refetch, isLoading } = trpc.bizKnowledge.graph.getData.useQuery({});
  const { data: graphStats } = trpc.bizKnowledge.graph.stats.useQuery();
  const { data: collections } = trpc.bizKnowledge.collections.list.useQuery();

  const createNodeMut = trpc.bizKnowledge.graph.createNode.useMutation({ onSuccess: () => { toast.success("节点创建成功"); setShowAddNode(false); refetch(); }, onError: (e) => toast.error("创建失败: " + e.message) });
  const deleteNodeMut = trpc.bizKnowledge.graph.deleteNode.useMutation({ onSuccess: () => { toast.success("节点已删除"); refetch(); }, onError: (e) => toast.error("删除失败: " + e.message) });

  const nodes = graphData?.nodes || [];
  const edges = graphData?.edges || [];
  const filteredNodes = nodes.filter((n: any) => n.label?.includes(search) || n.type?.includes(search));
  const typeColors: Record<string, "default" | "destructive" | "secondary" | "outline"> = { component: "default", fault: "destructive", method: "secondary", device: "outline", entity: "default" };

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">知识图谱</h2><p className="text-muted-foreground">可视化设备知识关系网络，管理节点和边</p></div>
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Circle className="w-5 h-5 text-blue-500" /><div><div className="text-2xl font-bold">{graphStats?.nodes ?? "-"}</div><p className="text-xs text-muted-foreground">节点数</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><ArrowRight className="w-5 h-5 text-green-500" /><div><div className="text-2xl font-bold">{graphStats?.edges ?? "-"}</div><p className="text-xs text-muted-foreground">关系边数</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Network className="w-5 h-5 text-purple-500" /><div><div className="text-2xl font-bold">{graphStats?.collections ?? "-"}</div><p className="text-xs text-muted-foreground">知识集合</p></div></div></CardContent></Card>
      </div>
      <Tabs defaultValue="nodes">
        <TabsList><TabsTrigger value="nodes">节点列表</TabsTrigger><TabsTrigger value="edges">关系边</TabsTrigger><TabsTrigger value="collections">知识集合</TabsTrigger></TabsList>
        <TabsContent value="nodes"><Card>
          <CardHeader><div className="flex items-center justify-between">
            <CardTitle>知识节点</CardTitle>
            <div className="flex gap-2"><Input placeholder="搜索节点..." value={search} onChange={e => setSearch(e.target.value)} className="w-48" /><Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
              <Dialog open={showAddNode} onOpenChange={setShowAddNode}><DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />添加节点</Button></DialogTrigger>
                <DialogContent><DialogHeader><DialogTitle>添加知识节点</DialogTitle><DialogDescription>创建新的知识图谱节点</DialogDescription></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>节点ID</Label><Input value={newNode.nodeId} onChange={e => setNewNode(p => ({ ...p, nodeId: e.target.value }))} placeholder="N-XXX" /></div><div className="space-y-2"><Label>标签</Label><Input value={newNode.label} onChange={e => setNewNode(p => ({ ...p, label: e.target.value }))} placeholder="轴承6205" /></div></div>
                    <div className="space-y-2"><Label>类型</Label><Input value={newNode.type} onChange={e => setNewNode(p => ({ ...p, type: e.target.value }))} placeholder="component/fault/method/device" /></div>
                  </div>
                  <DialogFooter><Button onClick={() => createNodeMut.mutate(newNode)} disabled={createNodeMut.isPending}>{createNodeMut.isPending ? "创建中..." : "创建节点"}</Button></DialogFooter>
                </DialogContent></Dialog>
            </div>
          </div></CardHeader>
          <CardContent>{isLoading ? <div className="text-center py-8 text-muted-foreground">加载中...</div> : filteredNodes.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无节点</div> :
          <div className="space-y-2">{filteredNodes.map((n: any) => (
            <div key={n.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2"><Circle className="w-3 h-3" /><span className="font-medium">{n.label}</span><Badge variant={typeColors[n.type] || "outline"}>{n.type}</Badge><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{n.nodeId}</code></div>
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { if(confirm("确定删除？")) deleteNodeMut.mutate({ id: n.id }); }}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}</div>}</CardContent>
        </Card></TabsContent>
        <TabsContent value="edges"><Card>
          <CardHeader><CardTitle>关系边</CardTitle></CardHeader>
          <CardContent>{edges.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无关系边</div> :
          <div className="space-y-2">{edges.map((e: any) => (
            <div key={e.id} className="flex items-center gap-3 p-3 rounded-lg border"><span className="text-sm font-medium">{e.sourceNodeId}</span><ArrowRight className="w-4 h-4 text-muted-foreground" /><span className="text-sm font-medium">{e.targetNodeId}</span><Badge variant="outline">{e.label || e.type}</Badge><span className="text-xs text-muted-foreground">权重: {e.weight}</span></div>
          ))}</div>}</CardContent>
        </Card></TabsContent>
        <TabsContent value="collections"><Card>
          <CardHeader><CardTitle>知识集合</CardTitle></CardHeader>
          <CardContent>{!collections || collections.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无知识集合</div> :
          <div className="space-y-2">{collections.map((c: any) => (
            <div key={c.id} className="p-3 rounded-lg border"><span className="font-medium">{c.name}</span>{c.description && <span className="text-xs text-muted-foreground ml-2">{c.description}</span>}</div>
          ))}</div>}</CardContent>
        </Card></TabsContent>
      </Tabs>
    </div>
  );
}
