import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { RefreshCw, Users, Shield, FileText } from "lucide-react";

export default function DataPermissions() {
  const { data: usersData, refetch: refetchUsers } = trpc.platformSystem.dataPermissions.listUsers.useQuery({ page: 1, pageSize: 50 });
  const { data: auditData } = trpc.platformSystem.dataPermissions.recentAuditLogs.useQuery();
  const { data: configLogs } = trpc.platformSystem.dataPermissions.configChangeLogs.useQuery({ page: 1, pageSize: 20 });

  const users = usersData?.rows || [];
  const audits = auditData || [];
  const changes = configLogs?.rows || [];

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">数据权限管理</h2><p className="text-muted-foreground">管理用户数据访问权限和配置变更审计</p></div>
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Users className="w-5 h-5" /><div><div className="text-2xl font-bold">{usersData?.total ?? "-"}</div><p className="text-xs text-muted-foreground">系统用户</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><Shield className="w-5 h-5 text-blue-500" /><div><div className="text-2xl font-bold">{audits.length}</div><p className="text-xs text-muted-foreground">近期操作</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-2"><FileText className="w-5 h-5 text-green-500" /><div><div className="text-2xl font-bold">{configLogs?.total ?? "-"}</div><p className="text-xs text-muted-foreground">配置变更</p></div></div></CardContent></Card>
      </div>
      <Tabs defaultValue="users">
        <TabsList><TabsTrigger value="users">用户列表</TabsTrigger><TabsTrigger value="audit">操作审计</TabsTrigger><TabsTrigger value="changes">配置变更</TabsTrigger></TabsList>
        <TabsContent value="users"><Card>
          <CardHeader><div className="flex items-center justify-between"><CardTitle>系统用户</CardTitle><Button variant="outline" size="icon" onClick={() => refetchUsers()}><RefreshCw className="w-4 h-4" /></Button></div></CardHeader>
          <CardContent>{users.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无用户数据</div> :
          <div className="space-y-2">{users.map((u: any) => (
            <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border"><div className="flex items-center gap-2"><Users className="w-4 h-4" /><span className="font-medium">{u.username || u.name || u.email || `User#${u.id}`}</span></div><span className="text-xs text-muted-foreground">{u.role || "user"}</span></div>
          ))}</div>}</CardContent>
        </Card></TabsContent>
        <TabsContent value="audit"><Card>
          <CardHeader><CardTitle>近期操作审计</CardTitle></CardHeader>
          <CardContent>{audits.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无审计记录</div> :
          <div className="space-y-2">{audits.slice(0, 20).map((a: any) => (
            <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-2"><Badge variant={a.status === "success" ? "default" : "destructive"}>{a.action}</Badge><span className="text-sm">{a.resource}</span><span className="text-xs text-muted-foreground">{a.userId}</span></div>
              <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString("zh-CN")}</span>
            </div>
          ))}</div>}</CardContent>
        </Card></TabsContent>
        <TabsContent value="changes"><Card>
          <CardHeader><CardTitle>配置变更日志</CardTitle></CardHeader>
          <CardContent>{changes.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无变更记录</div> :
          <div className="space-y-2">{changes.map((c: any) => (
            <div key={c.id} className="p-3 rounded-lg border"><div className="flex items-center gap-2"><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{c.configKey}</code><span className="text-xs text-muted-foreground">v{c.oldVersion} → v{c.newVersion}</span><span className="text-xs text-muted-foreground">by {c.changedBy}</span></div>
            {c.changeReason && <div className="text-xs text-muted-foreground mt-1">{c.changeReason}</div>}</div>
          ))}</div>}</CardContent>
        </Card></TabsContent>
      </Tabs>
    </div>
  );
}
