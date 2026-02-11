import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { RefreshCw, Database, Activity, HardDrive, BarChart3 } from "lucide-react";

export default function ClickHouseDashboard() {
  const { data: overview, refetch: refetchOverview } = trpc.bizMonitoring.clickhouseDashboard.overview.useQuery();
  const { data: capacityData } = trpc.bizMonitoring.clickhouseDashboard.capacityMetrics.useQuery();
  const { data: qualityData } = trpc.bizMonitoring.clickhouseDashboard.dataQuality.useQuery({});

  const capacity = capacityData || [];
  const quality = qualityData || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold">ClickHouse 监控仪表盘</h2><p className="text-muted-foreground">监控 ClickHouse 时序数据库的运行状态和性能指标</p></div>
        <Button variant="outline" onClick={() => refetchOverview()}><RefreshCw className="w-4 h-4 mr-1" />刷新</Button>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Database className="w-5 h-5 text-blue-500" /><div><div className="text-2xl font-bold">{overview?.connected ? "在线" : "离线"}</div><p className="text-xs text-muted-foreground">连接状态</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><HardDrive className="w-5 h-5 text-green-500" /><div><div className="text-2xl font-bold">{overview?.stats?.totalTables ?? "-"}</div><p className="text-xs text-muted-foreground">数据表数</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-purple-500" /><div><div className="text-2xl font-bold">{overview?.stats?.totalRows ?? "-"}</div><p className="text-xs text-muted-foreground">总行数</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Activity className="w-5 h-5 text-orange-500" /><div><div className="text-2xl font-bold">{overview?.stats?.diskUsage ?? "-"}</div><p className="text-xs text-muted-foreground">存储大小</p></div></div></CardContent></Card>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>容量指标</CardTitle><CardDescription>系统容量和资源使用情况</CardDescription></CardHeader>
          <CardContent>{capacity.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无容量数据</div> :
          <div className="space-y-2">{capacity.slice(0, 15).map((m: any) => (
            <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-2"><span className="text-sm font-medium">{m.componentName}</span><Badge variant={m.status === "normal" ? "default" : m.status === "warning" ? "secondary" : "destructive"}>{m.status}</Badge></div>
              <div className="text-sm"><span className="font-mono">{m.currentValue}</span><span className="text-muted-foreground"> / {m.threshold}</span></div>
            </div>
          ))}</div>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>数据质量报告</CardTitle><CardDescription>最近的数据质量检查结果</CardDescription></CardHeader>
          <CardContent>{quality.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无质量报告</div> :
          <div className="space-y-2">{quality.slice(0, 15).map((q: any) => (
            <div key={q.id} className="flex items-center justify-between p-3 rounded-lg border">
              <div><span className="text-sm font-medium">{q.tableName}</span><span className="text-xs text-muted-foreground ml-2">{q.reportDate}</span></div>
              <div className="flex items-center gap-2"><span className="text-sm font-mono">{q.completenessScore ? `${(Number(q.completenessScore)*100).toFixed(1)}%` : "-"}</span><Badge variant="outline">完整度</Badge></div>
            </div>
          ))}</div>}</CardContent>
        </Card>
      </div>
    </div>
  );
}
