import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  RefreshCw, Plus, Pencil, Trash2, Search,
  Radio, Activity, AlertCircle, BarChart3,
} from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  vibration: "振动", temperature: "温度", pressure: "压力",
  current: "电流", voltage: "电压", speed: "转速",
  position: "位置", humidity: "湿度", flow: "流量",
  level: "液位", other: "其他",
};

const STATUS_COLORS: Record<string, "default" | "destructive" | "secondary"> = {
  active: "default", inactive: "secondary", error: "destructive",
};

export default function SensorManager() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // 表单状态
  const [form, setForm] = useState({ sensorId: "", nodeId: "", name: "", type: "vibration" as string, unit: "", samplingRate: 1000 });

  const sensors = trpc.sensorCrud.list.useQuery({ search: search || undefined, page, pageSize: 20 });
  const statistics = trpc.sensorCrud.getStatistics.useQuery();
  const createMut = trpc.sensorCrud.create.useMutation({ onSuccess: () => { sensors.refetch(); statistics.refetch(); setShowCreate(false); resetForm(); } });
  const updateMut = trpc.sensorCrud.update.useMutation({ onSuccess: () => { sensors.refetch(); setEditId(null); } });
  const deleteMut = trpc.sensorCrud.delete.useMutation({ onSuccess: () => { sensors.refetch(); statistics.refetch(); } });

  function resetForm() { setForm({ sensorId: "", nodeId: "", name: "", type: "vibration", unit: "", samplingRate: 1000 }); }

  const total = sensors.data?.total ?? 0;
  const items = sensors.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <MainLayout title="传感器管理">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">传感器管理</h2>
            <p className="text-muted-foreground">传感器生命周期管理 — 增删改查与统计分析</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { sensors.refetch(); statistics.refetch(); }}>
              <RefreshCw className="w-4 h-4 mr-1" /> 刷新
            </Button>
            <Button onClick={() => { resetForm(); setShowCreate(true); }}>
              <Plus className="w-4 h-4 mr-1" /> 新增传感器
            </Button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold">{statistics.data?.total ?? 0}</div>
                  <p className="text-xs text-muted-foreground">传感器总数</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-green-500" />
                <div>
                  <div className="text-2xl font-bold">{(statistics.data?.byStatus as any)?.active ?? 0}</div>
                  <p className="text-xs text-muted-foreground">在线</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <div>
                  <div className="text-2xl font-bold">{(statistics.data?.byStatus as any)?.error ?? 0}</div>
                  <p className="text-xs text-muted-foreground">异常</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-500" />
                <div>
                  <div className="text-2xl font-bold">{Object.keys(statistics.data?.byType ?? {}).length}</div>
                  <p className="text-xs text-muted-foreground">类型数</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 新建/编辑表单 */}
        {(showCreate || editId) && (
          <Card className="border-primary/50">
            <CardHeader>
              <CardTitle>{editId ? "编辑传感器" : "新增传感器"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {!editId && <Input placeholder="传感器ID" value={form.sensorId} onChange={e => setForm(f => ({ ...f, sensorId: e.target.value }))} />}
                {!editId && <Input placeholder="所属设备ID" value={form.nodeId} onChange={e => setForm(f => ({ ...f, nodeId: e.target.value }))} />}
                <Input placeholder="名称" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                <select className="border rounded px-3 py-2 bg-background" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <Input placeholder="单位" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
                <Input placeholder="采样率(Hz)" type="number" value={form.samplingRate} onChange={e => setForm(f => ({ ...f, samplingRate: Number(e.target.value) }))} />
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  onClick={() => {
                    if (editId) {
                      updateMut.mutate({ sensorId: editId, data: { name: form.name, type: form.type as any, unit: form.unit || undefined, samplingRate: form.samplingRate } });
                    } else {
                      createMut.mutate({ sensorId: form.sensorId, nodeId: form.nodeId, name: form.name, type: form.type as any, unit: form.unit || undefined, samplingRate: form.samplingRate });
                    }
                  }}
                  disabled={createMut.isPending || updateMut.isPending}
                >
                  {editId ? "保存" : "创建"}
                </Button>
                <Button variant="outline" onClick={() => { setShowCreate(false); setEditId(null); }}>取消</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 列表 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>传感器列表</CardTitle>
              <div className="flex items-center gap-2">
                <Input placeholder="搜索传感器..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-48" />
                <Search className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {sensors.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Radio className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>暂无传感器</p>
                <p className="text-xs mt-1">点击"新增传感器"添加第一个传感器</p>
              </div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left p-2">传感器ID</th>
                      <th className="text-left p-2">名称</th>
                      <th className="text-left p-2">设备</th>
                      <th className="text-left p-2">类型</th>
                      <th className="text-left p-2">单位</th>
                      <th className="text-left p-2">状态</th>
                      <th className="text-left p-2">采样率</th>
                      <th className="text-right p-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((s: any) => (
                      <tr key={s.sensorId || s.id} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-mono text-xs">{s.sensorId}</td>
                        <td className="p-2">{s.name}</td>
                        <td className="p-2">{s.deviceCode || "-"}</td>
                        <td className="p-2">{TYPE_LABELS[s.physicalQuantity] || s.physicalQuantity || "-"}</td>
                        <td className="p-2">{s.unit || "-"}</td>
                        <td className="p-2">
                          <Badge variant={STATUS_COLORS[s.status] || "secondary"}>
                            {s.status === "active" ? "在线" : s.status === "error" ? "异常" : "离线"}
                          </Badge>
                        </td>
                        <td className="p-2">{s.sampleRate ? `${s.sampleRate}Hz` : "-"}</td>
                        <td className="p-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => { setEditId(s.sensorId); setForm({ sensorId: s.sensorId, nodeId: s.deviceCode || "", name: s.name, type: s.physicalQuantity || "other", unit: s.unit || "", samplingRate: s.sampleRate || 1000 }); }}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("确认删除该传感器？")) deleteMut.mutate({ sensorId: s.sensorId }); }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">共 {total} 条</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
                    <span className="text-sm px-2 py-1">{page}/{totalPages}</span>
                    <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
