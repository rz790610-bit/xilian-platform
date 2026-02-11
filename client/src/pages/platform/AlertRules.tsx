import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface AlertRule {
  id: string; name: string; metric: string; condition: string; threshold: number;
  severity: "critical" | "warning" | "info"; enabled: boolean; deviceScope: string;
  cooldown: number; notifyChannels: string[]; createdAt: string; lastTriggered?: string;
}

const MOCK_RULES: AlertRule[] = [
  { id: "AR-001", name: "振动超限告警", metric: "vibration_rms", condition: ">", threshold: 12.5, severity: "critical", enabled: true, deviceScope: "全部设备", cooldown: 300, notifyChannels: ["webhook", "email"], createdAt: "2025-12-01", lastTriggered: "2026-02-10 14:30" },
  { id: "AR-002", name: "温度异常告警", metric: "temperature", condition: ">", threshold: 85, severity: "warning", enabled: true, deviceScope: "旋转设备", cooldown: 600, notifyChannels: ["webhook"], createdAt: "2025-12-15", lastTriggered: "2026-02-09 08:15" },
  { id: "AR-003", name: "压力低于阈值", metric: "pressure", condition: "<", threshold: 2.0, severity: "warning", enabled: false, deviceScope: "液压系统", cooldown: 900, notifyChannels: ["email"], createdAt: "2026-01-10" },
  { id: "AR-004", name: "电流波动告警", metric: "current_thd", condition: ">", threshold: 8, severity: "info", enabled: true, deviceScope: "电机设备", cooldown: 1800, notifyChannels: ["webhook", "sms"], createdAt: "2026-01-20", lastTriggered: "2026-02-11 02:00" },
  { id: "AR-005", name: "油液含水量告警", metric: "oil_moisture", condition: ">", threshold: 0.05, severity: "critical", enabled: true, deviceScope: "润滑系统", cooldown: 300, notifyChannels: ["webhook", "email", "sms"], createdAt: "2026-02-01" },
];

export default function AlertRules() {
  const [rules, setRules] = useState<AlertRule[]>(MOCK_RULES);
  const [search, setSearch] = useState("");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  

  const filtered = useMemo(() => rules.filter(r => {
    const matchSearch = r.name.includes(search) || r.metric.includes(search);
    const matchSeverity = filterSeverity === "all" || r.severity === filterSeverity;
    return matchSearch && matchSeverity;
  }), [rules, search, filterSeverity]);

  const toggleRule = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
    toast.success("规则状态已更新");
  };

  const severityColor = (s: string) => s === "critical" ? "destructive" : s === "warning" ? "default" : "secondary";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">告警规则管理</h1>
        <p className="text-muted-foreground mt-1">配置设备告警阈值、通知渠道和冷却时间</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{rules.length}</div><p className="text-xs text-muted-foreground">总规则数</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-500">{rules.filter(r => r.enabled).length}</div><p className="text-xs text-muted-foreground">已启用</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-red-500">{rules.filter(r => r.severity === "critical").length}</div><p className="text-xs text-muted-foreground">严重级别</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-yellow-500">{rules.filter(r => r.lastTriggered).length}</div><p className="text-xs text-muted-foreground">近期触发</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div><CardTitle>告警规则列表</CardTitle><CardDescription>管理所有设备告警规则</CardDescription></div>
            <div className="flex gap-2">
              <Input placeholder="搜索规则名称或指标..." value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
              <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部级别</SelectItem>
                  <SelectItem value="critical">严重</SelectItem>
                  <SelectItem value="warning">警告</SelectItem>
                  <SelectItem value="info">信息</SelectItem>
                </SelectContent>
              </Select>
              <Dialog>
                <DialogTrigger asChild><Button>+ 新建规则</Button></DialogTrigger>
                <DialogContent><DialogHeader><DialogTitle>新建告警规则</DialogTitle><DialogDescription>配置新的告警规则参数</DialogDescription></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2"><Label>规则名称</Label><Input placeholder="例如：振动超限告警" /></div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2"><Label>监控指标</Label><Input placeholder="metric_name" /></div>
                      <div className="space-y-2"><Label>条件</Label><Select><SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger><SelectContent><SelectItem value=">">大于</SelectItem><SelectItem value="<">小于</SelectItem><SelectItem value="=">等于</SelectItem></SelectContent></Select></div>
                      <div className="space-y-2"><Label>阈值</Label><Input type="number" placeholder="0" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>严重级别</Label><Select><SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger><SelectContent><SelectItem value="critical">严重</SelectItem><SelectItem value="warning">警告</SelectItem><SelectItem value="info">信息</SelectItem></SelectContent></Select></div>
                      <div className="space-y-2"><Label>冷却时间(秒)</Label><Input type="number" placeholder="300" /></div>
                    </div>
                  </div>
                  <DialogFooter><Button onClick={() => toast.success("功能开发中: 告警规则创建功能即将上线")}>创建规则</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filtered.map(rule => (
              <div key={rule.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                <div className="flex items-center gap-4">
                  <Switch checked={rule.enabled} onCheckedChange={() => toggleRule(rule.id)} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{rule.name}</span>
                      <Badge variant={severityColor(rule.severity)}>{rule.severity === "critical" ? "严重" : rule.severity === "warning" ? "警告" : "信息"}</Badge>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{rule.metric} {rule.condition} {rule.threshold}</code>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      范围: {rule.deviceScope} · 冷却: {rule.cooldown}s · 通知: {rule.notifyChannels.join(", ")}
                      {rule.lastTriggered && <span> · 最近触发: {rule.lastTriggered}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => toast.success("功能开发中")}>编辑</Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => toast.success("功能开发中")}>删除</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
