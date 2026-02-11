import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface ScheduledTask {
  id: string; name: string; cron: string; type: string; status: "running" | "paused" | "error";
  lastRun: string; nextRun: string; duration: string; successRate: number;
}

const MOCK_TASKS: ScheduledTask[] = [
  { id: "ST-001", name: "数据清洗-日维度聚合", cron: "0 2 * * *", type: "data_governance", status: "running", lastRun: "2026-02-11 02:00", nextRun: "2026-02-12 02:00", duration: "12m 30s", successRate: 99.5 },
  { id: "ST-002", name: "模型推理日志归档", cron: "0 3 * * 0", type: "data_archive", status: "running", lastRun: "2026-02-09 03:00", nextRun: "2026-02-16 03:00", duration: "45m 10s", successRate: 100 },
  { id: "ST-003", name: "设备健康度评估", cron: "*/30 * * * *", type: "diagnosis", status: "running", lastRun: "2026-02-11 10:30", nextRun: "2026-02-11 11:00", duration: "2m 15s", successRate: 98.2 },
  { id: "ST-004", name: "知识库向量索引重建", cron: "0 4 1 * *", type: "knowledge_base", status: "paused", lastRun: "2026-02-01 04:00", nextRun: "-", duration: "1h 20m", successRate: 95.0 },
  { id: "ST-005", name: "过期数据清理", cron: "0 1 * * *", type: "data_lifecycle", status: "error", lastRun: "2026-02-11 01:00", nextRun: "2026-02-12 01:00", duration: "ERROR", successRate: 85.0 },
];

export default function ScheduledTasks() {
  const [tasks] = useState(MOCK_TASKS);
  
  const statusColor = (s: string) => s === "running" ? "default" : s === "paused" ? "secondary" : "destructive";
  const statusLabel = (s: string) => s === "running" ? "运行中" : s === "paused" ? "已暂停" : "异常";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">定时任务管理</h1>
        <p className="text-muted-foreground mt-1">管理数据治理、诊断分析等定时任务的调度和执行</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{tasks.length}</div><p className="text-xs text-muted-foreground">总任务数</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-500">{tasks.filter(t => t.status === "running").length}</div><p className="text-xs text-muted-foreground">运行中</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-yellow-500">{tasks.filter(t => t.status === "paused").length}</div><p className="text-xs text-muted-foreground">已暂停</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-red-500">{tasks.filter(t => t.status === "error").length}</div><p className="text-xs text-muted-foreground">异常</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div><CardTitle>任务列表</CardTitle><CardDescription>所有定时任务的调度状态和执行历史</CardDescription></div>
            <Dialog>
              <DialogTrigger asChild><Button>+ 新建任务</Button></DialogTrigger>
              <DialogContent><DialogHeader><DialogTitle>新建定时任务</DialogTitle><DialogDescription>配置任务调度参数</DialogDescription></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2"><Label>任务名称</Label><Input placeholder="例如：数据清洗-日维度聚合" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Cron 表达式</Label><Input placeholder="0 2 * * *" /></div>
                    <div className="space-y-2"><Label>任务类型</Label><Select><SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger><SelectContent><SelectItem value="data_governance">数据治理</SelectItem><SelectItem value="diagnosis">诊断分析</SelectItem><SelectItem value="data_archive">数据归档</SelectItem><SelectItem value="data_lifecycle">生命周期</SelectItem></SelectContent></Select></div>
                  </div>
                </div>
                <DialogFooter><Button onClick={() => toast.success("功能开发中")}>创建</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tasks.map(task => (
              <div key={task.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{task.name}</span>
                    <Badge variant={statusColor(task.status)}>{statusLabel(task.status)}</Badge>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{task.cron}</code>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex gap-4">
                    <span>上次执行: {task.lastRun}</span><span>下次执行: {task.nextRun}</span>
                    <span>耗时: {task.duration}</span><span>成功率: {task.successRate}%</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => toast.success("手动触发已提交")}>{task.status === "paused" ? "恢复" : "执行"}</Button>
                  <Button variant="ghost" size="sm" onClick={() => toast.success("功能开发中")}>历史</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
