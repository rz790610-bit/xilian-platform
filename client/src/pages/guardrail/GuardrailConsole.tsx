/**
 * ============================================================================
 * 护栏控制台 — GuardrailConsole
 * ============================================================================
 *
 * 完整功能：规则 CRUD + 告警管理 + 统计分析
 * 通过 tRPC 接入后端 evoGuardrail 域路由
 */

import { useState, useCallback, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

// ============================================================================
// 类型
// ============================================================================

interface GuardrailRule {
  id: string;
  name: string;
  category: 'safety' | 'health' | 'efficiency';
  enabled: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  conditionSummary: string;
  triggerCount: number;
  lastTriggeredAt: string | null;
  cooldownMs: number;
}

interface AlertHistory {
  id: string;
  ruleId: string;
  category: 'safety' | 'health' | 'efficiency';
  severity: 'critical' | 'high' | 'medium' | 'low';
  equipmentId: string;
  message: string;
  acknowledged: boolean;
  createdAt: string;
}

// ============================================================================
// 创建/编辑规则对话框
// ============================================================================

interface RuleFormData {
  name: string;
  type: 'safety' | 'health' | 'efficiency';
  description: string;
  conditionField: string;
  conditionOperator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq' | 'between';
  conditionThreshold: number;
  conditionThresholdHigh: number;
  actionType: string;
  priority: number;
  physicalBasis: string;
}

const defaultFormData: RuleFormData = {
  name: '',
  type: 'safety',
  description: '',
  conditionField: 'vibration_rms',
  conditionOperator: 'gt',
  conditionThreshold: 0,
  conditionThresholdHigh: 0,
  actionType: 'alert',
  priority: 100,
  physicalBasis: '',
};

function RuleFormDialog({
  open,
  onOpenChange,
  editRule,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editRule: GuardrailRule | null;
  onSubmit: (data: RuleFormData) => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState<RuleFormData>(defaultFormData);

  // 当编辑规则变化时，填充表单
  useState(() => {
    if (editRule) {
      setForm({
        name: editRule.name,
        type: editRule.category,
        description: editRule.description,
        conditionField: 'vibration_rms',
        conditionOperator: 'gt',
        conditionThreshold: 0,
        conditionThresholdHigh: 0,
        actionType: 'alert',
        priority: editRule.severity === 'critical' ? 10 : editRule.severity === 'high' ? 50 : editRule.severity === 'medium' ? 100 : 200,
        physicalBasis: '',
      });
    } else {
      setForm(defaultFormData);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('请输入规则名称');
      return;
    }
    onSubmit(form);
  };

  const updateField = <K extends keyof RuleFormData>(key: K, value: RuleFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-3 gap-1.5 max-h-[75vh] overflow-y-auto">
        <DialogHeader className="gap-0.5 pb-0">
          <DialogTitle className="text-sm">{editRule ? '编辑护栏规则' : '创建护栏规则'}</DialogTitle>
          <DialogDescription className="text-[10px]">
            {editRule ? '修改现有护栏规则的配置参数' : '定义新的护栏规则来保护设备安全运行'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-1.5">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-0.5">
              <Label htmlFor="rule-name" className="text-[10px] text-muted-foreground">规则名称 *</Label>
              <Input
                id="rule-name"
                className="h-7 text-xs"
                value={form.name}
                onChange={e => updateField('name', e.target.value)}
                placeholder="如：振动超限告警"
              />
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="rule-type" className="text-[10px] text-muted-foreground">规则类别</Label>
              <Select value={form.type} onValueChange={v => updateField('type', v as RuleFormData['type'])}>
                <SelectTrigger id="rule-type" className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="safety">安全护栏</SelectItem>
                  <SelectItem value="health">健康护栏</SelectItem>
                  <SelectItem value="efficiency">效率护栏</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-0.5">
            <Label htmlFor="rule-desc" className="text-[10px] text-muted-foreground">规则描述</Label>
            <Textarea
              id="rule-desc"
              className="text-xs min-h-[36px]"
              value={form.description}
              onChange={e => updateField('description', e.target.value)}
              placeholder="描述规则的用途和触发条件..."
              rows={2}
            />
          </div>

          {/* 触发条件 */}
          <div className="border border-border rounded p-2 space-y-1.5">
            <h4 className="text-[10px] font-semibold text-foreground">触发条件</h4>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">监测字段</Label>
                <Select value={form.conditionField} onValueChange={v => updateField('conditionField', v)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vibration_rms">振动 RMS</SelectItem>
                    <SelectItem value="temperature">温度</SelectItem>
                    <SelectItem value="load_ratio">负载比</SelectItem>
                    <SelectItem value="speed">转速</SelectItem>
                    <SelectItem value="pressure">压力</SelectItem>
                    <SelectItem value="fatigue_damage">疲劳损伤</SelectItem>
                    <SelectItem value="remaining_life">剩余寿命</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">比较运算</Label>
                <Select value={form.conditionOperator} onValueChange={v => updateField('conditionOperator', v as RuleFormData['conditionOperator'])}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gt">大于 (&gt;)</SelectItem>
                    <SelectItem value="lt">小于 (&lt;)</SelectItem>
                    <SelectItem value="gte">大于等于 (≥)</SelectItem>
                    <SelectItem value="lte">小于等于 (≤)</SelectItem>
                    <SelectItem value="eq">等于 (=)</SelectItem>
                    <SelectItem value="neq">不等于 (≠)</SelectItem>
                    <SelectItem value="between">范围 (between)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">阈值</Label>
                <div className="flex gap-1.5">
                  <Input
                    type="number"
                    className="h-7 text-xs"
                    value={form.conditionThreshold}
                    onChange={e => updateField('conditionThreshold', parseFloat(e.target.value) || 0)}
                    placeholder="阈值"
                  />
                  {form.conditionOperator === 'between' && (
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      value={form.conditionThresholdHigh}
                      onChange={e => updateField('conditionThresholdHigh', parseFloat(e.target.value) || 0)}
                      placeholder="上限"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 响应动作 */}
          <div className="border border-border rounded p-2 space-y-1.5">
            <h4 className="text-[10px] font-semibold text-foreground">响应动作</h4>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">动作类型</Label>
                <Select value={form.actionType} onValueChange={v => updateField('actionType', v)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alert">发送告警</SelectItem>
                    <SelectItem value="throttle">限流降速</SelectItem>
                    <SelectItem value="shutdown">紧急停机</SelectItem>
                    <SelectItem value="switch_condition">切换工况</SelectItem>
                    <SelectItem value="notify">通知运维</SelectItem>
                    <SelectItem value="log">仅记录</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">优先级 (数值越小越高)</Label>
                <Input
                  type="number"
                  className="h-7 text-xs"
                  value={form.priority}
                  onChange={e => updateField('priority', parseInt(e.target.value) || 100)}
                  min={1}
                  max={1000}
                />
              </div>
            </div>
          </div>

          {/* 物理依据 */}
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">物理依据 (可选)</Label>
            <Textarea
              className="text-xs min-h-[36px]"
              value={form.physicalBasis}
              onChange={e => updateField('physicalBasis', e.target.value)}
              placeholder="如：ISO 10816-3 振动标准，Zone C 边界值 4.5mm/s RMS..."
              rows={2}
            />
          </div>

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={isSubmitting}>
              {isSubmitting ? '提交中...' : editRule ? '保存修改' : '创建规则'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 删除确认对话框
// ============================================================================

function DeleteConfirmDialog({
  open,
  onOpenChange,
  ruleName,
  onConfirm,
  isDeleting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleName: string;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs p-3 gap-1.5">
        <DialogHeader className="gap-0.5 pb-0">
          <DialogTitle className="text-sm">确认删除</DialogTitle>
          <DialogDescription className="text-[10px]">
            确定要删除护栏规则 "<strong>{ruleName}</strong>" 吗？此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-1">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? '删除中...' : '确认删除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export default function GuardrailConsole() {
  const [activeTab, setActiveTab] = useState('rules');
  const [filterCategory, setFilterCategory] = useState<'all' | 'safety' | 'health' | 'efficiency'>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editRule, setEditRule] = useState<GuardrailRule | null>(null);
  const [deleteRule, setDeleteRule] = useState<GuardrailRule | null>(null);

  // ---- tRPC 数据查询 ----
  const rulesQuery = trpc.evoGuardrail.listRules.useQuery(undefined, { retry: 2 });
  const historyQuery = trpc.evoGuardrail.listAlertHistory.useQuery(
    { limit: 100 },
    { retry: 2 }
  );
  const alertsQuery = trpc.evoGuardrail.listAlerts.useQuery(
    { limit: 100, acknowledged: false },
    { retry: 2 }
  );

  // ---- Mutations ----
  const toggleRuleMutation = trpc.evoGuardrail.toggleRule.useMutation({
    onSuccess: () => { rulesQuery.refetch(); toast.success('规则状态已更新'); },
    onError: (e) => toast.error(`操作失败: ${e.message}`),
  });

  const acknowledgeMutation = trpc.evoGuardrail.acknowledgeAlert.useMutation({
    onSuccess: () => { historyQuery.refetch(); alertsQuery.refetch(); toast.success('告警已确认'); },
    onError: (e) => toast.error(`操作失败: ${e.message}`),
  });

  const createRuleMutation = trpc.evoGuardrail.rule.create.useMutation({
    onSuccess: () => {
      rulesQuery.refetch();
      setCreateDialogOpen(false);
      toast.success('规则创建成功');
    },
    onError: (e) => toast.error(`创建失败: ${e.message}`),
  });

  const updateRuleMutation = trpc.evoGuardrail.rule.update.useMutation({
    onSuccess: () => {
      rulesQuery.refetch();
      setEditRule(null);
      toast.success('规则更新成功');
    },
    onError: (e) => toast.error(`更新失败: ${e.message}`),
  });

  const deleteRuleMutation = trpc.evoGuardrail.rule.delete.useMutation({
    onSuccess: () => {
      rulesQuery.refetch();
      setDeleteRule(null);
      toast.success('规则已删除');
    },
    onError: (e) => toast.error(`删除失败: ${e.message}`),
  });

  // ---- 数据解构 ----
  const rules: GuardrailRule[] = (rulesQuery.data as GuardrailRule[]) ?? [];
  const history: AlertHistory[] = (historyQuery.data as AlertHistory[]) ?? [];
  const pendingAlerts: AlertHistory[] = (alertsQuery.data as AlertHistory[]) ?? [];

  const toggleRule = useCallback((ruleId: string) => {
    const rule = rules.find(r => r.id === ruleId);
    if (rule) toggleRuleMutation.mutate({ ruleId, enabled: !rule.enabled });
  }, [rules, toggleRuleMutation]);

  const acknowledgeAlert = useCallback((alertId: string) => {
    acknowledgeMutation.mutate({ alertId });
  }, [acknowledgeMutation]);

  const handleCreateSubmit = useCallback((data: RuleFormData) => {
    createRuleMutation.mutate({
      name: data.name,
      type: data.type,
      description: data.description || undefined,
      condition: {
        field: data.conditionField,
        operator: data.conditionOperator,
        threshold: data.conditionThreshold,
        thresholds: data.conditionOperator === 'between' ? [data.conditionThreshold, data.conditionThresholdHigh] : undefined,
      },
      action: {
        action: data.actionType,
        params: {},
      },
      priority: data.priority,
      physicalBasis: data.physicalBasis || undefined,
    });
  }, [createRuleMutation]);

  const handleEditSubmit = useCallback((data: RuleFormData) => {
    if (!editRule) return;
    updateRuleMutation.mutate({
      id: Number(editRule.id),
      name: data.name,
      type: data.type,
      description: data.description || undefined,
      condition: {
        field: data.conditionField,
        operator: data.conditionOperator,
        threshold: data.conditionThreshold,
        thresholds: data.conditionOperator === 'between' ? [data.conditionThreshold, data.conditionThresholdHigh] : undefined,
      },
      action: {
        action: data.actionType,
        params: {},
      },
      priority: data.priority,
      physicalBasis: data.physicalBasis || undefined,
    });
  }, [editRule, updateRuleMutation]);

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteRule) return;
    deleteRuleMutation.mutate({ id: Number(deleteRule.id) });
  }, [deleteRule, deleteRuleMutation]);

  const filteredRules = filterCategory === 'all' ? rules : rules.filter(r => r.category === filterCategory);
  const filteredHistory = filterCategory === 'all' ? history : history.filter(h => h.category === filterCategory);

  const categoryLabels: Record<string, string> = { safety: '安全', health: '健康', efficiency: '效率' };
  const severityVariant = (s: string) => s === 'critical' ? 'destructive' as const : 'secondary' as const;

  // 统计
  const stats = useMemo(() => ({
    totalRules: rules.length,
    enabledRules: rules.filter(r => r.enabled).length,
    totalTriggers: rules.reduce((sum, r) => sum + r.triggerCount, 0),
    byCategory: {
      safety: { rules: rules.filter(r => r.category === 'safety').length, triggers: rules.filter(r => r.category === 'safety').reduce((s, r) => s + r.triggerCount, 0) },
      health: { rules: rules.filter(r => r.category === 'health').length, triggers: rules.filter(r => r.category === 'health').reduce((s, r) => s + r.triggerCount, 0) },
      efficiency: { rules: rules.filter(r => r.category === 'efficiency').length, triggers: rules.filter(r => r.category === 'efficiency').reduce((s, r) => s + r.triggerCount, 0) },
    },
    unacknowledged: pendingAlerts.length,
  }), [rules, pendingAlerts]);

  const isLoading = rulesQuery.isLoading;

  return (
    <MainLayout title="护栏控制台">
    <div className="p-6 space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">护栏控制台</h1>
          <p className="text-sm text-muted-foreground mt-1">规则管理 · 告警处理 · 统计分析</p>
        </div>
        <div className="flex items-center gap-3">
          {pendingAlerts.length > 0 && (
            <Badge variant="destructive" className="text-sm px-3 py-1">
              {pendingAlerts.length} 条待处理告警
            </Badge>
          )}
          <Button onClick={() => { setEditRule(null); setCreateDialogOpen(true); }}>
            + 创建规则
          </Button>
        </div>
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">总规则数</div>
            <div className="text-2xl font-bold text-foreground mt-1">{stats.totalRules}</div>
            <div className="text-xs text-green-500 mt-1">{stats.enabledRules} 已启用</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">总触发次数</div>
            <div className="text-2xl font-bold text-orange-500 mt-1">{stats.totalTriggers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">待处理告警</div>
            <div className="text-2xl font-bold text-red-500 mt-1">{stats.unacknowledged}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">告警确认率</div>
            <div className="text-2xl font-bold text-green-500 mt-1">
              {history.length > 0 ? Math.round(history.filter(h => h.acknowledged).length / history.length * 100) : 100}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="rules">规则管理</TabsTrigger>
            <TabsTrigger value="alerts">
              实时告警
              {pendingAlerts.length > 0 && (
                <span className="ml-1.5 text-xs bg-red-500 text-white rounded-full px-1.5">{pendingAlerts.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">告警历史</TabsTrigger>
            <TabsTrigger value="stats">统计分析</TabsTrigger>
          </TabsList>
          <div className="flex gap-1 bg-muted p-1 rounded-lg">
            {(['all', 'safety', 'health', 'efficiency'] as const).map(cat => (
              <button key={cat} className={`px-3 py-1.5 text-xs rounded-md transition-colors ${filterCategory === cat ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setFilterCategory(cat)}>
                {cat === 'all' ? '全部' : categoryLabels[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* ===== 规则管理 Tab ===== */}
        <TabsContent value="rules" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">加载中...</span>
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">暂无护栏规则</p>
              <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>创建第一条规则</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">状态</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>类别</TableHead>
                  <TableHead>严重级别</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead className="text-right">触发次数</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRules.map(rule => (
                  <TableRow key={rule.id} className={!rule.enabled ? 'opacity-50' : ''}>
                    <TableCell>
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={() => toggleRule(rule.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{categoryLabels[rule.category]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={severityVariant(rule.severity)}>{rule.severity}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">{rule.description}</TableCell>
                    <TableCell className="text-right font-mono">{rule.triggerCount}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => { setEditRule(rule); setCreateDialogOpen(false); }}>
                          编辑
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteRule(rule)}>
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ===== 实时告警 Tab ===== */}
        <TabsContent value="alerts" className="mt-4">
          {pendingAlerts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg">✓ 当前无待处理告警</p>
              <p className="text-sm text-muted-foreground mt-1">所有告警已确认处理</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">{pendingAlerts.length} 条待处理</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    pendingAlerts.forEach(a => acknowledgeMutation.mutate({ alertId: a.id }));
                  }}
                >
                  全部确认
                </Button>
              </div>
              {pendingAlerts.map(alert => (
                <Card key={alert.id} className="border-orange-300/50">
                  <CardContent className="flex items-center gap-4 py-3">
                    <Badge variant={severityVariant(alert.severity)}>{alert.severity}</Badge>
                    <Badge variant="outline">{categoryLabels[alert.category]}</Badge>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">{alert.message}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        设备: {alert.equipmentId} · {new Date(alert.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => acknowledgeAlert(alert.id)}>
                      确认处理
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== 告警历史 Tab ===== */}
        <TabsContent value="history" className="mt-4">
          {filteredHistory.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">暂无告警记录</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>类别</TableHead>
                  <TableHead>严重级别</TableHead>
                  <TableHead>设备</TableHead>
                  <TableHead>告警信息</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.map(alert => (
                  <TableRow key={alert.id} className={alert.acknowledged ? 'opacity-60' : ''}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(alert.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell><Badge variant="outline">{categoryLabels[alert.category]}</Badge></TableCell>
                    <TableCell><Badge variant={severityVariant(alert.severity)}>{alert.severity}</Badge></TableCell>
                    <TableCell className="font-mono text-sm">{alert.equipmentId}</TableCell>
                    <TableCell className="max-w-[250px] truncate">{alert.message}</TableCell>
                    <TableCell>
                      {alert.acknowledged ? (
                        <Badge variant="outline" className="text-green-600">已确认</Badge>
                      ) : (
                        <Badge variant="destructive">待处理</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!alert.acknowledged && (
                        <Button variant="ghost" size="sm" onClick={() => acknowledgeAlert(alert.id)}>确认</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ===== 统计分析 Tab ===== */}
        <TabsContent value="stats" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">分类统计</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>类别</TableHead>
                    <TableHead>规则数</TableHead>
                    <TableHead>触发次数</TableHead>
                    <TableHead>占比</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(['safety', 'health', 'efficiency'] as const).map(cat => (
                    <TableRow key={cat}>
                      <TableCell className="font-medium">{categoryLabels[cat]}</TableCell>
                      <TableCell>{stats.byCategory[cat].rules}</TableCell>
                      <TableCell>{stats.byCategory[cat].triggers}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${cat === 'safety' ? 'bg-red-500' : cat === 'health' ? 'bg-blue-500' : 'bg-green-500'}`}
                              style={{ width: `${stats.totalTriggers > 0 ? (stats.byCategory[cat].triggers / stats.totalTriggers * 100) : 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {stats.totalTriggers > 0 ? Math.round(stats.byCategory[cat].triggers / stats.totalTriggers * 100) : 0}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 创建规则对话框 */}
      <RuleFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        editRule={null}
        onSubmit={handleCreateSubmit}
        isSubmitting={createRuleMutation.isPending}
      />

      {/* 编辑规则对话框 */}
      <RuleFormDialog
        open={!!editRule}
        onOpenChange={(open) => { if (!open) setEditRule(null); }}
        editRule={editRule}
        onSubmit={handleEditSubmit}
        isSubmitting={updateRuleMutation.isPending}
      />

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        open={!!deleteRule}
        onOpenChange={(open) => { if (!open) setDeleteRule(null); }}
        ruleName={deleteRule?.name ?? ''}
        onConfirm={handleDeleteConfirm}
        isDeleting={deleteRuleMutation.isPending}
      />
    </div>
    </MainLayout>
  );
}
