import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/common/Toast";
import { RefreshCw, GitBranch, Upload, RotateCcw } from "lucide-react";

export default function RuleVersions() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const { data: listData, refetch, isLoading } = trpc.opsDevice.ruleVersions.list.useQuery({ page, pageSize: 20 });
  const { data: stats } = trpc.opsDevice.ruleVersions.stats.useQuery();
  const publishMut = trpc.opsDevice.ruleVersions.publish.useMutation({ onSuccess: () => { toast.success("版本已发布"); refetch(); }, onError: (e) => toast.error("发布失败: " + e.message) });
  const rollbackMut = trpc.opsDevice.ruleVersions.rollback.useMutation({ onSuccess: () => { toast.success("版本已回滚"); refetch(); }, onError: (e) => toast.error("回滚失败: " + e.message) });

  const versions = listData?.rows || [];
  const total = listData?.total || 0;
  const statusColor = (s: string): "default" | "secondary" | "outline" | "destructive" => s === "published" ? "default" : s === "draft" ? "secondary" : s === "gray" ? "outline" : "destructive";

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">规则版本管理</h2><p className="text-muted-foreground">管理诊断规则和告警规则的版本发布与灰度控制</p></div>
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{stats?.total ?? "-"}</div><p className="text-xs text-muted-foreground">总版本数</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-500">{stats?.published ?? "-"}</div><p className="text-xs text-muted-foreground">已发布</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-blue-500">{stats?.draft ?? "-"}</div><p className="text-xs text-muted-foreground">草稿</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-yellow-500">{stats?.gray ?? "-"}</div><p className="text-xs text-muted-foreground">灰度中</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><div className="flex items-center justify-between"><div><CardTitle>版本列表</CardTitle><CardDescription>共 {total} 个版本</CardDescription></div><Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button></div></CardHeader>
        <CardContent>
          {isLoading ? <div className="text-center py-8 text-muted-foreground">加载中...</div> : versions.length === 0 ? <div className="text-center py-8 text-muted-foreground">暂无规则版本</div> :
          <div className="space-y-3">{versions.map((v: any) => (
            <div key={v.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-3"><GitBranch className="w-4 h-4 text-muted-foreground" />
                <div><div className="flex items-center gap-2"><span className="font-medium">{v.ruleId}</span><Badge variant={statusColor(v.status)}>{v.status}</Badge><code className="text-xs bg-muted px-1.5 py-0.5 rounded">v{v.version}</code>{v.isCurrent === 1 && <Badge variant="default">当前</Badge>}</div>
                <div className="text-xs text-muted-foreground mt-1">灰度比例: {v.grayRatio}% · {v.changeReason || "无变更说明"} · {new Date(v.createdAt).toLocaleDateString("zh-CN")}</div></div>
              </div>
              <div className="flex gap-1">
                {v.status === "draft" && <Button variant="outline" size="sm" onClick={() => publishMut.mutate({ id: v.id })} disabled={publishMut.isPending}><Upload className="w-3 h-3 mr-1" />发布</Button>}
                {v.status === "published" && <Button variant="outline" size="sm" onClick={() => rollbackMut.mutate({ id: v.id, reason: "手动回滚" })} disabled={rollbackMut.isPending}><RotateCcw className="w-3 h-3 mr-1" />回滚</Button>}
              </div>
            </div>
          ))}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
