import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface RollbackTrigger { id: string; name: string; targetRule: string; condition: string; threshold: string; action: string; enabled: boolean; lastTriggered?: string; triggerCount: number; }

const MOCK_TRIGGERS: RollbackTrigger[] = [
  { id: "RT-001", name: "误报率回滚", targetRule: "DIAG-BEARING v3.2.1", condition: "false_positive_rate > threshold", threshold: "15%", action: "rollback_to_previous", enabled: true, lastTriggered: "2026-01-28", triggerCount: 2 },
  { id: "RT-002", name: "延迟超限回滚", targetRule: "ALERT-VIBRATION v2.1.0", condition: "avg_latency > threshold", threshold: "500ms", action: "rollback_to_previous", enabled: true, triggerCount: 0 },
  { id: "RT-003", name: "异常率回滚", targetRule: "DIAG-MOTOR v2.0.0", condition: "error_rate > threshold", threshold: "5%", action: "disable_rule", enabled: false, lastTriggered: "2026-02-05", triggerCount: 1 },
];

export default function RollbackTriggers() {
  const [triggers, setTriggers] = useState(MOCK_TRIGGERS);
  

  const toggle = (id: string) => {
    setTriggers(prev => prev.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
    toast.success("触发器状态已更新");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">回滚触发器</h1>
        <p className="text-muted-foreground mt-1">配置自动回滚条件，当规则性能下降时自动回滚到稳定版本</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{triggers.length}</div><p className="text-xs text-muted-foreground">总触发器</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-500">{triggers.filter(t => t.enabled).length}</div><p className="text-xs text-muted-foreground">已启用</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-orange-500">{triggers.reduce((s, t) => s + t.triggerCount, 0)}</div><p className="text-xs text-muted-foreground">累计触发次数</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>触发器列表</CardTitle><CardDescription>自动回滚触发器配置和执行日志</CardDescription></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {triggers.map(t => (
              <div key={t.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                <div className="flex items-center gap-4">
                  <Switch checked={t.enabled} onCheckedChange={() => toggle(t.id)} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      <Badge variant="outline">{t.targetRule}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      条件: <code>{t.condition}</code> · 阈值: {t.threshold} · 动作: {t.action === "rollback_to_previous" ? "回滚到上一版本" : "禁用规则"}
                      {t.lastTriggered && <span> · 最近触发: {t.lastTriggered}</span>} · 累计: {t.triggerCount}次
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => toast.success("功能开发中")}>编辑</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
