import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface KGNode { id: string; label: string; type: string; properties: Record<string, string>; }
interface KGEdge { id: string; source: string; target: string; relation: string; weight: number; }

const MOCK_NODES: KGNode[] = [
  { id: "N-001", label: "轴承6205", type: "component", properties: { manufacturer: "SKF", model: "6205-2RS" } },
  { id: "N-002", label: "内圈磨损", type: "fault", properties: { severity: "high", frequency: "BPFI" } },
  { id: "N-003", label: "振动频谱分析", type: "method", properties: { algorithm: "FFT+Envelope" } },
  { id: "N-004", label: "电机M-001", type: "device", properties: { power: "75kW", rpm: "1480" } },
  { id: "N-005", label: "轴不对中", type: "fault", properties: { severity: "medium", symptom: "2X振动" } },
  { id: "N-006", label: "温度监测", type: "method", properties: { sensor: "PT100" } },
];

const MOCK_EDGES: KGEdge[] = [
  { id: "E-001", source: "N-004", target: "N-001", relation: "has_component", weight: 1.0 },
  { id: "E-002", source: "N-001", target: "N-002", relation: "may_have_fault", weight: 0.85 },
  { id: "E-003", source: "N-002", target: "N-003", relation: "diagnosed_by", weight: 0.92 },
  { id: "E-004", source: "N-004", target: "N-005", relation: "may_have_fault", weight: 0.65 },
  { id: "E-005", source: "N-005", target: "N-006", relation: "diagnosed_by", weight: 0.78 },
];

export default function KnowledgeGraphPage() {
  const [nodes] = useState(MOCK_NODES);
  const [edges] = useState(MOCK_EDGES);
  const [search, setSearch] = useState("");
  

  const filteredNodes = nodes.filter(n => n.label.includes(search) || n.type.includes(search));
  const typeColors: Record<string, string> = { component: "default", fault: "destructive", method: "secondary", device: "outline" };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">知识图谱</h1>
        <p className="text-muted-foreground mt-1">设备-故障-诊断方法的知识图谱可视化与管理 (NebulaGraph)</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{nodes.length}</div><p className="text-xs text-muted-foreground">节点数</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{edges.length}</div><p className="text-xs text-muted-foreground">边数</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{new Set(nodes.map(n => n.type)).size}</div><p className="text-xs text-muted-foreground">节点类型</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{new Set(edges.map(e => e.relation)).size}</div><p className="text-xs text-muted-foreground">关系类型</p></CardContent></Card>
      </div>

      <Tabs defaultValue="nodes">
        <TabsList><TabsTrigger value="nodes">节点管理</TabsTrigger><TabsTrigger value="edges">关系管理</TabsTrigger><TabsTrigger value="visual">图谱可视化</TabsTrigger></TabsList>

        <TabsContent value="nodes">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div><CardTitle>知识节点</CardTitle><CardDescription>管理知识图谱中的所有节点</CardDescription></div>
                <Input placeholder="搜索节点..." value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50"><th className="p-3 text-left">ID</th><th className="p-3 text-left">标签</th><th className="p-3 text-left">类型</th><th className="p-3 text-left">属性</th><th className="p-3 text-left">操作</th></tr></thead>
                  <tbody>
                    {filteredNodes.map(n => (
                      <tr key={n.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">{n.id}</td>
                        <td className="p-3 font-medium">{n.label}</td>
                        <td className="p-3"><Badge variant={typeColors[n.type] as any || "default"}>{n.type}</Badge></td>
                        <td className="p-3 text-xs">{Object.entries(n.properties).map(([k,v]) => `${k}=${v}`).join(", ")}</td>
                        <td className="p-3"><Button variant="ghost" size="sm" onClick={() => toast.success("功能开发中")}>编辑</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="edges">
          <Card>
            <CardHeader><CardTitle>知识关系</CardTitle><CardDescription>管理节点之间的关系</CardDescription></CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50"><th className="p-3 text-left">ID</th><th className="p-3 text-left">源节点</th><th className="p-3 text-left">关系</th><th className="p-3 text-left">目标节点</th><th className="p-3 text-left">权重</th></tr></thead>
                  <tbody>
                    {edges.map(e => (
                      <tr key={e.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">{e.id}</td>
                        <td className="p-3">{nodes.find(n => n.id === e.source)?.label || e.source}</td>
                        <td className="p-3"><code className="text-xs bg-muted px-1 rounded">{e.relation}</code></td>
                        <td className="p-3">{nodes.find(n => n.id === e.target)?.label || e.target}</td>
                        <td className="p-3">{e.weight.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visual">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-center h-96 border-2 border-dashed rounded-lg bg-muted/20">
                <div className="text-center text-muted-foreground">
                  <p className="text-lg font-medium">知识图谱可视化</p>
                  <p className="text-sm mt-1">NebulaGraph 图数据库可视化引擎</p>
                  <p className="text-xs mt-2">需要连接 NebulaGraph 服务后启用</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
