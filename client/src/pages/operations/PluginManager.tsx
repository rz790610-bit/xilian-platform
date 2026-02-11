import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface Plugin { id: string; name: string; version: string; type: string; status: "running" | "stopped" | "error" | "installed"; instances: number; author: string; description: string; }
interface PluginEvent { id: string; pluginId: string; pluginName: string; eventType: string; level: string; message: string; timestamp: string; }

const MOCK_PLUGINS: Plugin[] = [
  { id: "PL-001", name: "opc-ua-adapter", version: "2.1.0", type: "protocol", status: "running", instances: 3, author: "xilian-team", description: "OPC-UA 协议适配器，支持 DA/HDA/AC" },
  { id: "PL-002", name: "modbus-collector", version: "1.5.2", type: "protocol", status: "running", instances: 5, author: "xilian-team", description: "Modbus TCP/RTU 数据采集插件" },
  { id: "PL-003", name: "mqtt-bridge", version: "3.0.0", type: "protocol", status: "running", instances: 2, author: "xilian-team", description: "MQTT v5 桥接器，支持 SparkplugB" },
  { id: "PL-004", name: "anomaly-detector-lstm", version: "1.0.0", type: "algorithm", status: "stopped", instances: 0, author: "ai-lab", description: "基于 LSTM 的时序异常检测算法" },
  { id: "PL-005", name: "report-generator", version: "2.0.1", type: "utility", status: "error", instances: 1, author: "xilian-team", description: "自动诊断报告生成器" },
];

const MOCK_EVENTS: PluginEvent[] = [
  { id: "PE-001", pluginId: "PL-001", pluginName: "opc-ua-adapter", eventType: "health_check", level: "info", message: "所有实例运行正常", timestamp: "2026-02-11 10:30:00" },
  { id: "PE-002", pluginId: "PL-005", pluginName: "report-generator", eventType: "error", level: "error", message: "模板渲染失败: 缺少 diagnosis_result 字段", timestamp: "2026-02-11 10:25:00" },
  { id: "PE-003", pluginId: "PL-002", pluginName: "modbus-collector", eventType: "scale", level: "info", message: "实例数从 3 扩展到 5", timestamp: "2026-02-11 09:00:00" },
  { id: "PE-004", pluginId: "PL-004", pluginName: "anomaly-detector-lstm", eventType: "stopped", level: "warning", message: "手动停止: 模型精度不达标", timestamp: "2026-02-10 16:00:00" },
];

export default function PluginManager() {
  const [plugins] = useState(MOCK_PLUGINS);
  const [events] = useState(MOCK_EVENTS);
  
  const statusColor = (s: string) => s === "running" ? "default" : s === "stopped" ? "secondary" : s === "error" ? "destructive" : "outline";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">插件管理</h1>
        <p className="text-muted-foreground mt-1">管理平台插件的安装、启停和实例监控</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{plugins.length}</div><p className="text-xs text-muted-foreground">已安装插件</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-500">{plugins.filter(p => p.status === "running").length}</div><p className="text-xs text-muted-foreground">运行中</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{plugins.reduce((s, p) => s + p.instances, 0)}</div><p className="text-xs text-muted-foreground">总实例数</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-red-500">{plugins.filter(p => p.status === "error").length}</div><p className="text-xs text-muted-foreground">异常插件</p></CardContent></Card>
      </div>

      <Tabs defaultValue="plugins">
        <TabsList><TabsTrigger value="plugins">插件列表</TabsTrigger><TabsTrigger value="events">事件日志</TabsTrigger></TabsList>

        <TabsContent value="plugins">
          <Card>
            <CardHeader><CardTitle>已安装插件</CardTitle><CardDescription>管理所有插件的生命周期</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {plugins.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">v{p.version}</code>
                        <Badge variant={statusColor(p.status)}>{p.status === "running" ? "运行中" : p.status === "stopped" ? "已停止" : p.status === "error" ? "异常" : "已安装"}</Badge>
                        <Badge variant="outline">{p.type}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{p.description} · 实例: {p.instances} · 作者: {p.author}</div>
                    </div>
                    <div className="flex gap-2">
                      {p.status === "stopped" && <Button variant="ghost" size="sm" onClick={() => toast.success("功能开发中")}>启动</Button>}
                      {p.status === "running" && <Button variant="ghost" size="sm" onClick={() => toast.success("功能开发中")}>停止</Button>}
                      {p.status === "error" && <Button variant="ghost" size="sm" onClick={() => toast.success("功能开发中")}>重启</Button>}
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => toast.success("功能开发中")}>卸载</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader><CardTitle>插件事件日志</CardTitle><CardDescription>所有插件的运行时事件</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {events.map(e => (
                  <div key={e.id} className="flex items-center gap-3 p-3 rounded border text-sm">
                    <Badge variant={e.level === "error" ? "destructive" : e.level === "warning" ? "default" : "secondary"}>{e.level}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{e.timestamp}</span>
                    <code className="text-xs bg-muted px-1 rounded">{e.pluginName}</code>
                    <span>{e.message}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
