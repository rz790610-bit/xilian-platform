import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { RefreshCw, Workflow, Play, Settings, Layers } from "lucide-react";

export default function OrchestratorHubPage() {
  const [deviceType, setDeviceType] = useState("");
  const [diagnosisGoal, setDiagnosisGoal] = useState("");
  const [machineId, setMachineId] = useState("");

  const status = trpc.orchestratorHub.getStatus.useQuery(undefined, { retry: false });
  const scenarios = trpc.orchestratorHub.getScenarios.useQuery(undefined, { retry: false });
  const orchestrate = trpc.orchestratorHub.orchestrate.useMutation();

  function handleOrchestrate() {
    if (!deviceType || !diagnosisGoal || !machineId) return;
    orchestrate.mutate({ deviceType, diagnosisGoal, machineId });
  }

  return (
    <MainLayout title="编排调度">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">编排调度中心</h2>
            <p className="text-muted-foreground">Pipeline / KG / DB 三引擎协调编排</p>
          </div>
          <Button variant="outline" onClick={() => { status.refetch(); scenarios.refetch(); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
        </div>

        {/* Hub 状态 */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5" /> Hub 状态</CardTitle></CardHeader>
          <CardContent>
            {status.data ? (
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(status.data as Record<string, any>).map(([k, v]) => (
                  <div key={k} className="p-3 bg-muted/30 rounded flex items-center justify-between">
                    <span className="text-sm">{k}</span>
                    <Badge variant="outline">{typeof v === "boolean" ? (v ? "启用" : "禁用") : typeof v === "object" ? JSON.stringify(v) : String(v)}</Badge>
                  </div>
                ))}
              </div>
            ) : <p className="text-center py-4 text-muted-foreground">加载中...</p>}
          </CardContent>
        </Card>

        {/* 场景模板 */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Layers className="w-5 h-5" /> 编排场景</CardTitle></CardHeader>
          <CardContent>
            {(Array.isArray(scenarios.data) ? scenarios.data : []).length === 0 ? (
              <p className="text-center py-4 text-muted-foreground">暂无场景模板</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {(Array.isArray(scenarios.data) ? scenarios.data : []).map((s: any, i: number) => (
                  <div key={i} className="p-3 bg-muted/30 rounded">
                    <p className="text-sm font-medium">{s.name || s.id || JSON.stringify(s).slice(0, 40)}</p>
                    {s.description && <p className="text-xs text-muted-foreground mt-1">{s.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 执行编排 */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Workflow className="w-5 h-5" /> 执行编排</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Input placeholder="设备类型" value={deviceType} onChange={e => setDeviceType(e.target.value)} />
              <Input placeholder="诊断目标" value={diagnosisGoal} onChange={e => setDiagnosisGoal(e.target.value)} />
              <Input placeholder="设备ID" value={machineId} onChange={e => setMachineId(e.target.value)} />
            </div>
            <Button onClick={handleOrchestrate} disabled={orchestrate.isPending || !deviceType || !diagnosisGoal || !machineId}>
              <Play className="w-4 h-4 mr-1" /> {orchestrate.isPending ? "编排中..." : "执行编排"}
            </Button>
            {orchestrate.data && (
              <pre className="mt-4 bg-muted/30 rounded p-4 text-xs overflow-auto max-h-[300px]">
                {JSON.stringify(orchestrate.data, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
