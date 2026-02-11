import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface Approval { id: string; title: string; type: string; requester: string; status: "pending" | "approved" | "rejected"; createdAt: string; reviewedBy?: string; reviewedAt?: string; }

const MOCK_APPROVALS: Approval[] = [
  { id: "AP-001", title: "删除过期数据切片 batch_2025Q3", type: "数据删除", requester: "operator_01", status: "pending", createdAt: "2026-02-11 10:00" },
  { id: "AP-002", title: "导出全量审计日志", type: "数据导出", requester: "viewer_02", status: "pending", createdAt: "2026-02-11 09:30" },
  { id: "AP-003", title: "修改诊断规则阈值", type: "配置变更", requester: "engineer_01", status: "approved", createdAt: "2026-02-10 15:00", reviewedBy: "admin", reviewedAt: "2026-02-10 16:30" },
  { id: "AP-004", title: "安装新插件 anomaly-detector-v2", type: "插件安装", requester: "engineer_02", status: "approved", createdAt: "2026-02-09 11:00", reviewedBy: "admin", reviewedAt: "2026-02-09 14:00" },
  { id: "AP-005", title: "删除用户 test_user_01", type: "用户管理", requester: "admin", status: "rejected", createdAt: "2026-02-08 09:00", reviewedBy: "super_admin", reviewedAt: "2026-02-08 10:00" },
];

export default function ApprovalWorkflows() {
  const [approvals] = useState(MOCK_APPROVALS);
  
  const pending = approvals.filter(a => a.status === "pending");
  const history = approvals.filter(a => a.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">审批流程</h1>
        <p className="text-muted-foreground mt-1">管理敏感操作的审批流程和待审批列表</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-orange-500">{pending.length}</div><p className="text-xs text-muted-foreground">待审批</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-500">{approvals.filter(a => a.status === "approved").length}</div><p className="text-xs text-muted-foreground">已通过</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-red-500">{approvals.filter(a => a.status === "rejected").length}</div><p className="text-xs text-muted-foreground">已拒绝</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{approvals.length}</div><p className="text-xs text-muted-foreground">总申请数</p></CardContent></Card>
      </div>

      <Tabs defaultValue="pending">
        <TabsList><TabsTrigger value="pending">待审批 ({pending.length})</TabsTrigger><TabsTrigger value="history">审批历史</TabsTrigger></TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader><CardTitle>待审批列表</CardTitle><CardDescription>需要您审批的敏感操作</CardDescription></CardHeader>
            <CardContent>
              {pending.length === 0 ? <p className="text-muted-foreground text-center py-8">暂无待审批项</p> : (
                <div className="space-y-3">
                  {pending.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                      <div>
                        <div className="flex items-center gap-2"><span className="font-medium">{a.title}</span><Badge variant="outline">{a.type}</Badge></div>
                        <div className="text-xs text-muted-foreground mt-1">申请人: {a.requester} · 时间: {a.createdAt}</div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => toast.success("功能开发中")}>通过</Button>
                        <Button size="sm" variant="destructive" onClick={() => toast.success("功能开发中")}>拒绝</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle>审批历史</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {history.map(a => (
                  <div key={a.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                    <div>
                      <div className="flex items-center gap-2"><span className="font-medium">{a.title}</span><Badge variant="outline">{a.type}</Badge><Badge variant={a.status === "approved" ? "default" : "destructive"}>{a.status === "approved" ? "已通过" : "已拒绝"}</Badge></div>
                      <div className="text-xs text-muted-foreground mt-1">申请人: {a.requester} · 审批人: {a.reviewedBy} · 审批时间: {a.reviewedAt}</div>
                    </div>
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
