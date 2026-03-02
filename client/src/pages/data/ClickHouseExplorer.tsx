import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  RefreshCw, Database, Activity, AlertTriangle, Search,
  Clock, BarChart3, HardDrive, Wifi, WifiOff,
} from "lucide-react";

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "object") try { return JSON.stringify(v); } catch { return "[obj]"; }
  return String(v);
}

export default function ClickHouseExplorer() {
  const [deviceFilter, setDeviceFilter] = useState("");
  const [anomalyLimit, setAnomalyLimit] = useState(50);

  const health = trpc.clickhouse.healthCheck.useQuery();
  const stats = trpc.clickhouse.getStats.useQuery(undefined, { retry: false });

  const readings = trpc.clickhouse.querySensorReadings.useQuery(
    {
      limit: 100,
      orderBy: "desc",
      ...(deviceFilter ? { nodeIds: [deviceFilter] } : {}),
    },
    { enabled: true, retry: false },
  );

  const anomalies = trpc.clickhouse.queryAnomalies.useQuery(
    { limit: anomalyLimit },
    { retry: false },
  );

  const connected = health.data?.connected ?? false;

  return (
    <MainLayout title="ClickHouse 时序查询">
      <div className="space-y-6">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">ClickHouse 时序数据查询</h2>
            <p className="text-muted-foreground">传感器历史数据查看、聚合查询、异常记录</p>
          </div>
          <Button variant="outline" onClick={() => { health.refetch(); stats.refetch(); readings.refetch(); anomalies.refetch(); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
        </div>

        {/* 状态概览 */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                {connected ? <Wifi className="w-5 h-5 text-green-500" /> : <WifiOff className="w-5 h-5 text-red-500" />}
                <div>
                  <div className="text-2xl font-bold">{connected ? "在线" : "离线"}</div>
                  <p className="text-xs text-muted-foreground">连接状态</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold">{fmt(stats.data?.totalTables)}</div>
                  <p className="text-xs text-muted-foreground">数据表</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-500" />
                <div>
                  <div className="text-2xl font-bold">{fmt(stats.data?.totalRows)}</div>
                  <p className="text-xs text-muted-foreground">总行数</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-orange-500" />
                <div>
                  <div className="text-2xl font-bold">{fmt(stats.data?.diskUsage)}</div>
                  <p className="text-xs text-muted-foreground">磁盘占用</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 传感器数据查询 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" /> 传感器读数
              </CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="设备ID筛选..."
                  value={deviceFilter}
                  onChange={e => setDeviceFilter(e.target.value)}
                  className="w-48"
                />
                <Button size="sm" variant="outline" onClick={() => readings.refetch()}>
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {readings.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : !readings.data || (Array.isArray(readings.data) && readings.data.length === 0) ? (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>暂无传感器读数数据</p>
                <p className="text-xs mt-1">请确认 ClickHouse 已有数据写入</p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[400px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr>
                      <th className="text-left p-2">时间</th>
                      <th className="text-left p-2">设备</th>
                      <th className="text-left p-2">传感器</th>
                      <th className="text-left p-2">指标</th>
                      <th className="text-right p-2">值</th>
                      <th className="text-left p-2">质量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(readings.data) ? readings.data : []).map((r: any, i: number) => (
                      <tr key={i} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-mono text-xs">{r.timestamp ? new Date(r.timestamp).toLocaleString("zh-CN") : "-"}</td>
                        <td className="p-2">{r.device_id || r.deviceCode || "-"}</td>
                        <td className="p-2">{r.sensor_id || r.sensorId || "-"}</td>
                        <td className="p-2">{r.metric_name || r.metricName || "-"}</td>
                        <td className="p-2 text-right font-mono">{typeof r.value === "number" ? r.value.toFixed(3) : fmt(r.value)}</td>
                        <td className="p-2">
                          <Badge variant={r.quality === "good" ? "default" : r.quality === "bad" ? "destructive" : "secondary"}>
                            {r.quality || "unknown"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 异常检测记录 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> 异常检测记录
              </CardTitle>
              <select
                className="bg-background border rounded px-2 py-1 text-sm"
                value={anomalyLimit}
                onChange={e => setAnomalyLimit(Number(e.target.value))}
              >
                <option value={20}>最近 20 条</option>
                <option value={50}>最近 50 条</option>
                <option value={100}>最近 100 条</option>
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {anomalies.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : !anomalies.data || (Array.isArray(anomalies.data) && anomalies.data.length === 0) ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>暂无异常检测记录</p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[400px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr>
                      <th className="text-left p-2">时间</th>
                      <th className="text-left p-2">设备</th>
                      <th className="text-left p-2">传感器</th>
                      <th className="text-left p-2">算法</th>
                      <th className="text-right p-2">当前值</th>
                      <th className="text-right p-2">期望值</th>
                      <th className="text-right p-2">偏差</th>
                      <th className="text-left p-2">严重度</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(anomalies.data) ? anomalies.data : []).map((a: any, i: number) => (
                      <tr key={i} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-mono text-xs">{a.timestamp ? new Date(a.timestamp).toLocaleString("zh-CN") : "-"}</td>
                        <td className="p-2">{a.device_id || "-"}</td>
                        <td className="p-2">{a.sensor_id || "-"}</td>
                        <td className="p-2"><Badge variant="outline">{a.algorithm_type || "-"}</Badge></td>
                        <td className="p-2 text-right font-mono">{typeof a.current_value === "number" ? a.current_value.toFixed(3) : "-"}</td>
                        <td className="p-2 text-right font-mono">{typeof a.expected_value === "number" ? a.expected_value.toFixed(3) : "-"}</td>
                        <td className="p-2 text-right font-mono">{typeof a.deviation === "number" ? a.deviation.toFixed(3) : "-"}</td>
                        <td className="p-2">
                          <Badge variant={a.severity === "critical" ? "destructive" : a.severity === "high" ? "destructive" : "secondary"}>
                            {a.severity || "unknown"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
