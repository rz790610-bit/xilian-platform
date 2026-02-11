import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface RuleVersion {
  id: string; ruleCode: string; ruleName: string; version: string; status: "active" | "draft" | "deprecated";
  author: string; createdAt: string; changelog: string; rolloutPercent: number;
}

const MOCK_VERSIONS: RuleVersion[] = [
  { id: "RV-001", ruleCode: "DIAG-BEARING", ruleName: "轴承故障检测", version: "v3.2.1", status: "active", author: "admin", createdAt: "2026-02-08", changelog: "优化频谱分析算法，降低误报率", rolloutPercent: 100 },
  { id: "RV-002", ruleCode: "DIAG-BEARING", ruleName: "轴承故障检测", version: "v3.3.0-beta", status: "draft", author: "engineer_01", createdAt: "2026-02-10", changelog: "新增包络解调分析", rolloutPercent: 10 },
  { id: "RV-003", ruleCode: "ALERT-VIBRATION", ruleName: "振动超限告警", version: "v2.1.0", status: "active", author: "admin", createdAt: "2026-01-15", changelog: "调整阈值计算方式为动态基线", rolloutPercent: 100 },
  { id: "RV-004", ruleCode: "DIAG-MOTOR", ruleName: "电机健康评估", version: "v1.0.0", status: "deprecated", author: "engineer_02", createdAt: "2025-11-20", changelog: "初始版本", rolloutPercent: 0 },
  { id: "RV-005", ruleCode: "ALERT-TEMP", ruleName: "温度异常检测", version: "v1.2.0", status: "active", author: "admin", createdAt: "2026-02-05", changelog: "增加环境温度补偿", rolloutPercent: 80 },
];

export default function RuleVersions() {
  const [versions] = useState(MOCK_VERSIONS);
  
  const statusColor = (s: string) => s === "active" ? "default" : s === "draft" ? "secondary" : "outline";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">规则版本管理</h1>
        <p className="text-muted-foreground mt-1">管理诊断规则和告警规则的版本、灰度发布和回滚</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{versions.length}</div><p className="text-xs text-muted-foreground">总版本数</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-500">{versions.filter(v => v.status === "active").length}</div><p className="text-xs text-muted-foreground">活跃版本</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-blue-500">{versions.filter(v => v.status === "draft").length}</div><p className="text-xs text-muted-foreground">草稿版本</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{new Set(versions.map(v => v.ruleCode)).size}</div><p className="text-xs text-muted-foreground">规则数</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>版本列表</CardTitle><CardDescription>所有规则的版本历史和灰度发布状态</CardDescription></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {versions.map(v => (
              <div key={v.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{v.ruleName}</span>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{v.version}</code>
                    <Badge variant={statusColor(v.status)}>{v.status === "active" ? "活跃" : v.status === "draft" ? "草稿" : "已废弃"}</Badge>
                    {v.rolloutPercent > 0 && v.rolloutPercent < 100 && <Badge variant="outline" className="text-blue-500">灰度 {v.rolloutPercent}%</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    <code>{v.ruleCode}</code> · {v.author} · {v.createdAt} · {v.changelog}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => toast.success("功能开发中")}>对比</Button>
                  {v.status === "draft" && <Button variant="ghost" size="sm" onClick={() => toast.success("功能开发中")}>发布</Button>}
                  {v.status === "active" && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => toast.success("功能开发中")}>回滚</Button>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
