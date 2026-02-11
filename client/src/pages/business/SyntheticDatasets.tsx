import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

interface Dataset { id: string; name: string; sourceSlice: string; method: string; status: "completed" | "generating" | "failed"; sampleCount: number; progress: number; createdAt: string; labelStats: { labeled: number; total: number }; }

const MOCK_DATASETS: Dataset[] = [
  { id: "SD-001", name: "轴承故障合成数据集-v1", sourceSlice: "bearing_vibration_2025", method: "GAN + 时间扭曲", status: "completed", sampleCount: 50000, progress: 100, createdAt: "2026-02-05", labelStats: { labeled: 48000, total: 50000 } },
  { id: "SD-002", name: "电机电流异常数据集", sourceSlice: "motor_current_2025Q4", method: "SMOTE + 噪声注入", status: "completed", sampleCount: 30000, progress: 100, createdAt: "2026-02-08", labelStats: { labeled: 30000, total: 30000 } },
  { id: "SD-003", name: "多工况振动数据集", sourceSlice: "multi_condition_2026", method: "条件 GAN", status: "generating", sampleCount: 0, progress: 45, createdAt: "2026-02-11", labelStats: { labeled: 0, total: 100000 } },
  { id: "SD-004", name: "稀有故障模式数据集", sourceSlice: "rare_faults_collection", method: "变分自编码器", status: "failed", sampleCount: 0, progress: 12, createdAt: "2026-02-10", labelStats: { labeled: 0, total: 20000 } },
];

export default function SyntheticDatasets() {
  const [datasets] = useState(MOCK_DATASETS);
  

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">合成数据集</h1>
        <p className="text-muted-foreground mt-1">生成和管理合成训练数据集，支持 GAN/SMOTE/VAE 等方法</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{datasets.length}</div><p className="text-xs text-muted-foreground">数据集总数</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-500">{datasets.filter(d => d.status === "completed").length}</div><p className="text-xs text-muted-foreground">已完成</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{datasets.reduce((s, d) => s + d.sampleCount, 0).toLocaleString()}</div><p className="text-xs text-muted-foreground">总样本数</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{Math.round(datasets.filter(d => d.status === "completed").reduce((s, d) => s + d.labelStats.labeled / d.labelStats.total, 0) / datasets.filter(d => d.status === "completed").length * 100)}%</div><p className="text-xs text-muted-foreground">平均标注率</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div><CardTitle>数据集列表</CardTitle><CardDescription>管理所有合成数据集的生成和标注</CardDescription></div>
            <Button onClick={() => toast.success("功能开发中")}>+ 新建数据集</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {datasets.map(d => (
              <div key={d.id} className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{d.name}</span>
                    <Badge variant={d.status === "completed" ? "default" : d.status === "generating" ? "secondary" : "destructive"}>
                      {d.status === "completed" ? "已完成" : d.status === "generating" ? "生成中" : "失败"}
                    </Badge>
                    <Badge variant="outline">{d.method}</Badge>
                  </div>
                  <div className="flex gap-2">
                    {d.status === "completed" && <Button variant="ghost" size="sm" onClick={() => toast.success("功能开发中")}>标注</Button>}
                    {d.status === "failed" && <Button variant="ghost" size="sm" onClick={() => toast.success("功能开发中")}>重试</Button>}
                  </div>
                </div>
                {d.status === "generating" && <Progress value={d.progress} className="h-2 mb-2" />}
                <div className="text-xs text-muted-foreground flex gap-4">
                  <span>数据源: <code>{d.sourceSlice}</code></span>
                  <span>样本数: {d.sampleCount.toLocaleString()}</span>
                  <span>标注: {d.labelStats.labeled.toLocaleString()}/{d.labelStats.total.toLocaleString()}</span>
                  <span>创建: {d.createdAt}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
