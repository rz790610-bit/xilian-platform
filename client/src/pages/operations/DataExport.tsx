import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface ExportTask { id: string; name: string; format: "parquet" | "csv" | "json"; source: string; status: "completed" | "running" | "queued" | "failed"; progress: number; size: string; createdAt: string; duration: string; }

const MOCK_TASKS: ExportTask[] = [
  { id: "EX-001", name: "2026年Q1振动数据导出", format: "parquet", source: "data_slices", status: "completed", progress: 100, size: "2.3 GB", createdAt: "2026-02-10 14:00", duration: "8m 45s" },
  { id: "EX-002", name: "设备资产清单导出", format: "csv", source: "data_assets", status: "completed", progress: 100, size: "15 MB", createdAt: "2026-02-11 09:00", duration: "12s" },
  { id: "EX-003", name: "诊断结果批量导出", format: "json", source: "diagnosis_tasks", status: "running", progress: 67, size: "~800 MB", createdAt: "2026-02-11 10:30", duration: "进行中" },
  { id: "EX-004", name: "模型推理日志导出", format: "parquet", source: "model_usage_logs", status: "queued", progress: 0, size: "-", createdAt: "2026-02-11 10:35", duration: "-" },
  { id: "EX-005", name: "告警历史导出", format: "csv", source: "device_alerts", status: "failed", progress: 23, size: "-", createdAt: "2026-02-11 08:00", duration: "失败" },
];

export default function DataExport() {
  const [tasks] = useState(MOCK_TASKS);
  

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">数据导出</h1>
        <p className="text-muted-foreground mt-1">创建数据导出任务，支持 Parquet/CSV/JSON 格式，S3 直传</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{tasks.length}</div><p className="text-xs text-muted-foreground">总任务数</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-500">{tasks.filter(t => t.status === "completed").length}</div><p className="text-xs text-muted-foreground">已完成</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-blue-500">{tasks.filter(t => t.status === "running").length}</div><p className="text-xs text-muted-foreground">进行中</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">2.3 GB</div><p className="text-xs text-muted-foreground">最大导出量</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div><CardTitle>导出任务</CardTitle><CardDescription>管理所有数据导出任务</CardDescription></div>
            <Dialog>
              <DialogTrigger asChild><Button>+ 新建导出</Button></DialogTrigger>
              <DialogContent><DialogHeader><DialogTitle>新建导出任务</DialogTitle><DialogDescription>选择数据源和导出格式</DialogDescription></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2"><Label>任务名称</Label><Input placeholder="例如：2026年Q1振动数据导出" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>数据源</Label><Select><SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger><SelectContent><SelectItem value="data_slices">数据切片</SelectItem><SelectItem value="data_assets">数据资产</SelectItem><SelectItem value="device_alerts">设备告警</SelectItem><SelectItem value="model_usage_logs">模型日志</SelectItem></SelectContent></Select></div>
                    <div className="space-y-2"><Label>导出格式</Label><Select><SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger><SelectContent><SelectItem value="parquet">Parquet</SelectItem><SelectItem value="csv">CSV</SelectItem><SelectItem value="json">JSON</SelectItem></SelectContent></Select></div>
                  </div>
                </div>
                <DialogFooter><Button onClick={() => toast.success("功能开发中")}>创建任务</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tasks.map(task => (
              <div key={task.id} className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{task.name}</span>
                    <Badge variant="outline">{task.format.toUpperCase()}</Badge>
                    <Badge variant={task.status === "completed" ? "default" : task.status === "running" ? "secondary" : task.status === "failed" ? "destructive" : "outline"}>
                      {task.status === "completed" ? "已完成" : task.status === "running" ? "进行中" : task.status === "failed" ? "失败" : "排队中"}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    {task.status === "completed" && <Button variant="ghost" size="sm">下载</Button>}
                    {task.status === "failed" && <Button variant="ghost" size="sm">重试</Button>}
                  </div>
                </div>
                {task.status === "running" && <Progress value={task.progress} className="h-2 mb-2" />}
                <div className="text-xs text-muted-foreground flex gap-4">
                  <span>数据源: <code>{task.source}</code></span><span>大小: {task.size}</span><span>创建: {task.createdAt}</span><span>耗时: {task.duration}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
