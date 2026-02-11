import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AuditLog {
  id: string; timestamp: string; userId: string; action: string; resource: string;
  details: string; ipAddress: string; sensitive: boolean; result: "success" | "failed";
}

const MOCK_LOGS: AuditLog[] = [
  { id: "AL-001", timestamp: "2026-02-11 10:30:15", userId: "admin", action: "UPDATE", resource: "device_sampling_config", details: "修改采样频率 100Hz→200Hz", ipAddress: "192.168.1.100", sensitive: false, result: "success" },
  { id: "AL-002", timestamp: "2026-02-11 10:28:00", userId: "operator_01", action: "DELETE", resource: "data_slices", details: "删除过期数据切片 batch_2025Q3", ipAddress: "192.168.1.105", sensitive: true, result: "success" },
  { id: "AL-003", timestamp: "2026-02-11 10:25:30", userId: "admin", action: "CREATE", resource: "diagnosis_rules", details: "新建诊断规则: 轴承故障检测v2", ipAddress: "192.168.1.100", sensitive: false, result: "success" },
  { id: "AL-004", timestamp: "2026-02-11 10:20:00", userId: "viewer_02", action: "EXPORT", resource: "audit_logs", details: "导出审计日志 2026-01 至 2026-02", ipAddress: "192.168.1.110", sensitive: true, result: "success" },
  { id: "AL-005", timestamp: "2026-02-11 10:15:00", userId: "operator_03", action: "UPDATE", resource: "plugin_registry", details: "更新插件 opc-ua-adapter 至 v2.1.0", ipAddress: "192.168.1.108", sensitive: false, result: "failed" },
  { id: "AL-006", timestamp: "2026-02-11 09:50:00", userId: "admin", action: "DELETE", resource: "users", details: "删除用户 test_user_01", ipAddress: "192.168.1.100", sensitive: true, result: "success" },
  { id: "AL-007", timestamp: "2026-02-11 09:30:00", userId: "system", action: "EXECUTE", resource: "data_governance_jobs", details: "执行数据清洗任务 JOB-2026-0211", ipAddress: "127.0.0.1", sensitive: false, result: "success" },
];

export default function AuditLogs() {
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [tab, setTab] = useState("all");

  const filtered = useMemo(() => MOCK_LOGS.filter(log => {
    const matchSearch = log.userId.includes(search) || log.resource.includes(search) || log.details.includes(search);
    const matchAction = filterAction === "all" || log.action === filterAction;
    const matchTab = tab === "all" || (tab === "sensitive" && log.sensitive) || (tab === "failed" && log.result === "failed");
    return matchSearch && matchAction && matchTab;
  }), [search, filterAction, tab]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">审计日志</h1>
        <p className="text-muted-foreground mt-1">查询系统操作记录，筛选敏感操作，支持导出</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{MOCK_LOGS.length}</div><p className="text-xs text-muted-foreground">总记录数</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-orange-500">{MOCK_LOGS.filter(l => l.sensitive).length}</div><p className="text-xs text-muted-foreground">敏感操作</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-red-500">{MOCK_LOGS.filter(l => l.result === "failed").length}</div><p className="text-xs text-muted-foreground">失败操作</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-500">{new Set(MOCK_LOGS.map(l => l.userId)).size}</div><p className="text-xs text-muted-foreground">活跃用户</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div><CardTitle>操作记录</CardTitle><CardDescription>系统所有操作的审计追踪</CardDescription></div>
            <div className="flex gap-2">
              <Input placeholder="搜索用户、资源或详情..." value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部操作</SelectItem>
                  <SelectItem value="CREATE">CREATE</SelectItem>
                  <SelectItem value="UPDATE">UPDATE</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                  <SelectItem value="EXPORT">EXPORT</SelectItem>
                  <SelectItem value="EXECUTE">EXECUTE</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline">导出 CSV</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList><TabsTrigger value="all">全部</TabsTrigger><TabsTrigger value="sensitive">敏感操作</TabsTrigger><TabsTrigger value="failed">失败操作</TabsTrigger></TabsList>
            <TabsContent value={tab} className="mt-4">
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50"><th className="p-3 text-left">时间</th><th className="p-3 text-left">用户</th><th className="p-3 text-left">操作</th><th className="p-3 text-left">资源</th><th className="p-3 text-left">详情</th><th className="p-3 text-left">IP</th><th className="p-3 text-left">状态</th></tr></thead>
                  <tbody>
                    {filtered.map(log => (
                      <tr key={log.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">{log.timestamp}</td>
                        <td className="p-3">{log.userId}</td>
                        <td className="p-3"><Badge variant={log.action === "DELETE" ? "destructive" : "secondary"}>{log.action}</Badge></td>
                        <td className="p-3"><code className="text-xs bg-muted px-1 rounded">{log.resource}</code></td>
                        <td className="p-3 max-w-xs truncate">{log.details}{log.sensitive && <Badge variant="outline" className="ml-2 text-orange-500 border-orange-500">敏感</Badge>}</td>
                        <td className="p-3 font-mono text-xs">{log.ipAddress}</td>
                        <td className="p-3"><Badge variant={log.result === "success" ? "default" : "destructive"}>{log.result === "success" ? "成功" : "失败"}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
