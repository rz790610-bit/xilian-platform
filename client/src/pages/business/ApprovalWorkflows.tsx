import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/common/Toast";
import { RefreshCw, CheckCircle, Play } from "lucide-react";

export default function ApprovalWorkflows() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);

  const { data: listData, refetch, isLoading } = trpc.platformSystem.approval.listJobs.useQuery({ page, pageSize: 20, status: filterStatus });
  const { data: stats } = trpc.platformSystem.approval.stats.useQuery();
  const { data: policies } = trpc.platformSystem.approval.listPolicies.useQuery();
  const updateMut = trpc.platformSystem.approval.updateJobStatus.useMutation({ onSuccess: () => { toast.success("状态已更新"); refetch(); }, onError: (e) => toast.error("更新失败: " + e.message) });

  const jobs = listData?.rows || [];
  const total = listData?.total || 0;
  const statusColor = (s: string): "default" | "secondary" | "destructive" | "outline" => s === "completed" ? "default" : s === "running" ? "secondary" : s === "pending" ? "outline" : "destructive";

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">审批流程</h2><p className="text-muted-foreground">管理数据治理任务的审批和执行流程</p></div>
      <div className="grid grid-cols-5 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{stats?.total ?? "-"}</div><p className="text-xs text-muted-foreground">总任务</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-yellow-500">{stats?.pending ?? "-"}</div><p className="text-xs text-muted-foreground">待审批</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-blue-500">{stats?.running ?? "-"}</div><p className="text-xs text-muted-foreground">执行中</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-500">{stats?.completed ?? "-"}</div><p className="text-xs text-muted-foreground">已完成</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-red-500">{stats?.failed ?? "-"}</div><p className="text-xs text-muted-foreground">失败</p></CardContent></Card>
      </div>
      <Tabs defaultValue="jobs">
        <TabsList><TabsTrigger value="jobs">治理任务</TabsTrigger><TabsTrigger value="policies">生命周期策略</TabsTrigger></TabsList>
        <TabsContent value="jobs"><Card>
          <CardHeader><div className="flex items-center justify-between">
            <div><CardTitle>数据治理任务</CardTitle><CardDescription>共 {total} 个任务</CardDescription></div>
            <div className="flex gap-2">
              <Button variant={!filterStatus ? "default" : "outline"} size="sm" onClick={() => setFilterStatus(undefined)}>全部</Button>
              <Button variant={filterStatus === "pending" ? "default" : "outline"} size="sm" onClick={() => setFilterStatus("pending")}>待审批</Button>
              <Button variant={filterStatus === "running" ? "default" : "outline"} size="sm" onClick={() => setFilterStatus("running")}>执行中</Button>
              <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
            </div>
          </div></CardHeader>
          <CardContent>
            {isLoading ? <div className="text-center py-8 text-muted-foreground">加载中...</div> : jobs.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无治理任务</div> :
            <div className="space-y-3">{jobs.map((job: any) => (
              <div key={job.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                <div><div className="flex items-center gap-2"><span className="font-medium">{job.jobId}</span><Badge variant={statusColor(job.status)}>{job.status}</Badge><Badge variant="outline">{job.jobType}</Badge></div>
                <div className="text-xs text-muted-foreground mt-1">目标表: {job.targetTable} · 创建: {new Date(job.createdAt).toLocaleString("zh-CN")}</div></div>
                <div className="flex gap-1">
                  {job.status === "pending" && <Button variant="outline" size="sm" onClick={() => updateMut.mutate({ id: job.id, status: "running" })}><Play className="w-3 h-3 mr-1" />执行</Button>}
                  {job.status === "running" && <Button variant="outline" size="sm" onClick={() => updateMut.mutate({ id: job.id, status: "completed" })}><CheckCircle className="w-3 h-3 mr-1" />完成</Button>}
                </div>
              </div>
            ))}</div>}
          </CardContent>
        </Card></TabsContent>
        <TabsContent value="policies"><Card>
          <CardHeader><CardTitle>生命周期策略</CardTitle></CardHeader>
          <CardContent>{!policies || policies.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无策略</div> :
          <div className="space-y-2">{policies.map((p: any) => (
            <div key={p.id} className="p-3 rounded-lg border"><div className="flex items-center gap-2"><span className="font-medium">{p.policyName || p.name}</span><Badge variant="outline">{p.retentionType || p.policyType}</Badge></div>
            <div className="text-xs text-muted-foreground mt-1">目标: {p.targetTable} · 保留: {p.retentionDays || p.retentionPeriod}天</div></div>
          ))}</div>}</CardContent>
        </Card></TabsContent>
      </Tabs>
    </div>
  );
}
