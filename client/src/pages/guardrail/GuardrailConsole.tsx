/**
 * ============================================================================
 * 护栏控制台 — GuardrailConsole (紧凑风格)
 * ============================================================================
 */

import { useState, useCallback, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

// ============================================================================
// 类型
// ============================================================================

interface GuardrailRule { id: string; name: string; category: 'safety' | 'health' | 'efficiency'; enabled: boolean; severity: 'critical' | 'high' | 'medium' | 'low'; description: string; conditionSummary: string; triggerCount: number; lastTriggeredAt: string | null; cooldownMs: number; escalationConfig?: any }
interface AlertHistory { id: string; ruleId: string; category: 'safety' | 'health' | 'efficiency'; severity: 'critical' | 'high' | 'medium' | 'low'; equipmentId: string; message: string; acknowledged: boolean; createdAt: string; escalationLevel?: number; violationSeverity?: number | null; resolvedAt?: string | null }
interface EffectivenessOverview { totalTriggers: number; executionRate: number; falsePositiveRate: number; dataAsOf: string | null }
interface RuleEffectiveness { ruleId: number; ruleName: string; ruleType: string; totalTriggers: number; truePositives: number; falsePositives: number; avgSeverity: number; precision: number; periodStart: string; periodEnd: string }
interface DailyStat { date: string; count: number; avgSeverity: number }

// ============================================================================
// 创建/编辑规则对话框
// ============================================================================

interface RuleFormData { name: string; type: 'safety' | 'health' | 'efficiency'; description: string; conditionField: string; conditionOperator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq' | 'between'; conditionThreshold: number; conditionThresholdHigh: number; actionType: string; priority: number; physicalBasis: string }

const defaultFormData: RuleFormData = { name: '', type: 'safety', description: '', conditionField: 'vibration_rms', conditionOperator: 'gt', conditionThreshold: 0, conditionThresholdHigh: 0, actionType: 'alert', priority: 100, physicalBasis: '' };

function RuleFormDialog({ open, onOpenChange, editRule, onSubmit, isSubmitting }: {
  open: boolean; onOpenChange: (open: boolean) => void; editRule: GuardrailRule | null; onSubmit: (data: RuleFormData) => void; isSubmitting: boolean;
}) {
  const [form, setForm] = useState<RuleFormData>(defaultFormData);

  useState(() => {
    if (editRule) {
      setForm({ name: editRule.name, type: editRule.category, description: editRule.description, conditionField: 'vibration_rms', conditionOperator: 'gt', conditionThreshold: 0, conditionThresholdHigh: 0, actionType: 'alert', priority: editRule.severity === 'critical' ? 10 : editRule.severity === 'high' ? 50 : editRule.severity === 'medium' ? 100 : 200, physicalBasis: '' });
    } else { setForm(defaultFormData); }
  });

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!form.name.trim()) { toast.error('请输入规则名称'); return; } onSubmit(form); };
  const updateField = <K extends keyof RuleFormData>(key: K, value: RuleFormData[K]) => { setForm(prev => ({ ...prev, [key]: value })); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-3 gap-1.5 max-h-[75vh] overflow-y-auto">
        <DialogHeader className="gap-0.5 pb-0">
          <DialogTitle className="text-sm">{editRule ? '编辑护栏规则' : '创建护栏规则'}</DialogTitle>
          <DialogDescription className="text-[10px]">{editRule ? '修改现有护栏规则的配置参数' : '定义新的护栏规则来保护设备安全运行'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">规则名称 *</Label><Input className="h-7 text-xs" value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="如：振动超限告警" /></div>
            <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">规则类别</Label>
              <Select value={form.type} onValueChange={v => updateField('type', v as RuleFormData['type'])}><SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="safety">安全护栏</SelectItem><SelectItem value="health">健康护栏</SelectItem><SelectItem value="efficiency">效率护栏</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">规则描述</Label><Textarea className="text-xs min-h-[36px]" value={form.description} onChange={e => updateField('description', e.target.value)} placeholder="描述规则的用途和触发条件..." rows={2} /></div>
          <div className="border border-border rounded p-2 space-y-1.5">
            <h4 className="text-[10px] font-semibold text-foreground">触发条件</h4>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">监测字段</Label>
                <Select value={form.conditionField} onValueChange={v => updateField('conditionField', v)}><SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="vibration_rms">振动 RMS</SelectItem><SelectItem value="temperature">温度</SelectItem><SelectItem value="load_ratio">负载比</SelectItem><SelectItem value="speed">转速</SelectItem><SelectItem value="pressure">压力</SelectItem><SelectItem value="fatigue_damage">疲劳损伤</SelectItem><SelectItem value="remaining_life">剩余寿命</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">比较运算</Label>
                <Select value={form.conditionOperator} onValueChange={v => updateField('conditionOperator', v as RuleFormData['conditionOperator'])}><SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="gt">大于 (&gt;)</SelectItem><SelectItem value="lt">小于 (&lt;)</SelectItem><SelectItem value="gte">≥</SelectItem><SelectItem value="lte">≤</SelectItem><SelectItem value="eq">=</SelectItem><SelectItem value="neq">≠</SelectItem><SelectItem value="between">范围</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">阈值</Label>
                <div className="flex gap-1.5"><Input type="number" className="h-7 text-xs" value={form.conditionThreshold} onChange={e => updateField('conditionThreshold', parseFloat(e.target.value) || 0)} />{form.conditionOperator === 'between' && <Input type="number" className="h-7 text-xs" value={form.conditionThresholdHigh} onChange={e => updateField('conditionThresholdHigh', parseFloat(e.target.value) || 0)} placeholder="上限" />}</div>
              </div>
            </div>
          </div>
          <div className="border border-border rounded p-2 space-y-1.5">
            <h4 className="text-[10px] font-semibold text-foreground">响应动作</h4>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">动作类型</Label>
                <Select value={form.actionType} onValueChange={v => updateField('actionType', v)}><SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="alert">发送告警</SelectItem><SelectItem value="throttle">限流降速</SelectItem><SelectItem value="shutdown">紧急停机</SelectItem><SelectItem value="switch_condition">切换工况</SelectItem><SelectItem value="notify">通知运维</SelectItem><SelectItem value="log">仅记录</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">优先级</Label><Input type="number" className="h-7 text-xs" value={form.priority} onChange={e => updateField('priority', parseInt(e.target.value) || 100)} min={1} max={1000} /></div>
            </div>
          </div>
          <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">物理依据 (可选)</Label><Textarea className="text-xs min-h-[36px]" value={form.physicalBasis} onChange={e => updateField('physicalBasis', e.target.value)} placeholder="如：ISO 10816-3 振动标准..." rows={2} /></div>
          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={isSubmitting}>{isSubmitting ? '提交中...' : editRule ? '保存修改' : '创建规则'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 删除确认对话框
// ============================================================================

function DeleteConfirmDialog({ open, onOpenChange, ruleName, onConfirm, isDeleting }: {
  open: boolean; onOpenChange: (open: boolean) => void; ruleName: string; onConfirm: () => void; isDeleting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs p-3 gap-1.5">
        <DialogHeader className="gap-0.5 pb-0">
          <DialogTitle className="text-sm">确认删除</DialogTitle>
          <DialogDescription className="text-[10px]">确定要删除护栏规则 "<strong>{ruleName}</strong>" 吗？此操作不可撤销。</DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-1">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={onConfirm} disabled={isDeleting}>{isDeleting ? '删除中...' : '确认删除'}</Button>
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

  const rulesQuery = trpc.evoGuardrail.listRules.useQuery(undefined, { retry: 2 });
  const historyQuery = trpc.evoGuardrail.listAlertHistory.useQuery({ limit: 100 }, { retry: 2 });
  const alertsQuery = trpc.evoGuardrail.listAlerts.useQuery({ limit: 100, acknowledged: false }, { retry: 2 });
  const effectivenessOverviewQuery = trpc.evoGuardrail.effectiveness.overview.useQuery({ days: 30 }, { enabled: activeTab === 'effectiveness', retry: 2 });
  const effectivenessByRuleQuery = trpc.evoGuardrail.effectiveness.byRule.useQuery({ days: 30 }, { enabled: activeTab === 'effectiveness', retry: 2 });
  const dailyStatsQuery = trpc.evoGuardrail.violation.dailyStats.useQuery({ days: 30 }, { enabled: activeTab === 'effectiveness', retry: 2 });

  const toggleRuleMutation = trpc.evoGuardrail.toggleRule.useMutation({ onSuccess: () => { rulesQuery.refetch(); toast.success('规则状态已更新'); }, onError: (e) => toast.error(`操作失败: ${e.message}`) });
  const acknowledgeMutation = trpc.evoGuardrail.acknowledgeAlert.useMutation({ onSuccess: () => { historyQuery.refetch(); alertsQuery.refetch(); toast.success('告警已确认'); }, onError: (e) => toast.error(`操作失败: ${e.message}`) });
  const createRuleMutation = trpc.evoGuardrail.rule.create.useMutation({ onSuccess: () => { rulesQuery.refetch(); setCreateDialogOpen(false); toast.success('规则创建成功'); }, onError: (e) => toast.error(`创建失败: ${e.message}`) });
  const updateRuleMutation = trpc.evoGuardrail.rule.update.useMutation({ onSuccess: () => { rulesQuery.refetch(); setEditRule(null); toast.success('规则更新成功'); }, onError: (e) => toast.error(`更新失败: ${e.message}`) });
  const deleteRuleMutation = trpc.evoGuardrail.rule.delete.useMutation({ onSuccess: () => { rulesQuery.refetch(); setDeleteRule(null); toast.success('规则已删除'); }, onError: (e) => toast.error(`删除失败: ${e.message}`) });

  const rules: GuardrailRule[] = (rulesQuery.data as GuardrailRule[]) ?? [];
  const history: AlertHistory[] = (historyQuery.data as AlertHistory[]) ?? [];
  const pendingAlerts: AlertHistory[] = (alertsQuery.data as AlertHistory[]) ?? [];

  const toggleRule2 = useCallback((ruleId: string) => { const rule = rules.find(r => r.id === ruleId); if (rule) toggleRuleMutation.mutate({ ruleId, enabled: !rule.enabled }); }, [rules, toggleRuleMutation]);
  const acknowledgeAlert = useCallback((alertId: string) => { acknowledgeMutation.mutate({ alertId }); }, [acknowledgeMutation]);

  const handleCreateSubmit = useCallback((data: RuleFormData) => {
    createRuleMutation.mutate({ name: data.name, type: data.type, description: data.description || undefined, condition: { field: data.conditionField, operator: data.conditionOperator, threshold: data.conditionThreshold, thresholds: data.conditionOperator === 'between' ? [data.conditionThreshold, data.conditionThresholdHigh] : undefined }, action: { action: data.actionType, params: {} }, priority: data.priority, physicalBasis: data.physicalBasis || undefined });
  }, [createRuleMutation]);

  const handleEditSubmit = useCallback((data: RuleFormData) => {
    if (!editRule) return;
    updateRuleMutation.mutate({ id: Number(editRule.id), name: data.name, type: data.type, description: data.description || undefined, condition: { field: data.conditionField, operator: data.conditionOperator, threshold: data.conditionThreshold, thresholds: data.conditionOperator === 'between' ? [data.conditionThreshold, data.conditionThresholdHigh] : undefined }, action: { action: data.actionType, params: {} }, priority: data.priority, physicalBasis: data.physicalBasis || undefined });
  }, [editRule, updateRuleMutation]);

  const handleDeleteConfirm = useCallback(() => { if (!deleteRule) return; deleteRuleMutation.mutate({ id: Number(deleteRule.id) }); }, [deleteRule, deleteRuleMutation]);

  const filteredRules = filterCategory === 'all' ? rules : rules.filter(r => r.category === filterCategory);
  const filteredHistory = filterCategory === 'all' ? history : history.filter(h => h.category === filterCategory);

  const categoryLabels: Record<string, string> = { safety: '安全', health: '健康', efficiency: '效率' };
  const severityVariant = (s: string) => s === 'critical' ? 'destructive' as const : 'secondary' as const;

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
    ackRate: history.length > 0 ? Math.round(history.filter(h => h.acknowledged).length / history.length * 100) : 100,
  }), [rules, pendingAlerts, history]);

  const isLoading = rulesQuery.isLoading;

  return (
    <MainLayout title="护栏控制台">
    <div className="animate-fade-up">
      {/* 页头 */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold">🛡️ 护栏控制台</h2>
          <p className="text-xs text-muted-foreground">规则管理 · 告警处理 · 统计分析</p>
        </div>
        <div className="flex items-center gap-1.5">
          {pendingAlerts.length > 0 && <Badge variant="destructive" className="text-[10px]">{pendingAlerts.length} 条待处理</Badge>}
          <Button size="sm" className="h-7 text-xs" onClick={() => { setEditRule(null); setCreateDialogOpen(true); }}>+ 创建规则</Button>
        </div>
      </div>

      {/* 概览指标 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <StatCard value={stats.totalRules} label="总规则数" icon="📋" />
        <StatCard value={stats.totalTriggers} label="总触发次数" icon="⚡" />
        <StatCard value={stats.unacknowledged} label="待处理告警" icon="🔔" />
        <StatCard value={`${stats.ackRate}%`} label="告警确认率" icon="✅" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-2">
          <TabsList>
            <TabsTrigger value="rules" className="text-xs">规则管理</TabsTrigger>
            <TabsTrigger value="alerts" className="text-xs">
              实时告警
              {pendingAlerts.length > 0 && <span className="ml-1 text-[10px] bg-red-500 text-white rounded-full px-1">{pendingAlerts.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs">告警历史</TabsTrigger>
            <TabsTrigger value="stats" className="text-xs">统计分析</TabsTrigger>
            <TabsTrigger value="effectiveness" className="text-xs">效果分析</TabsTrigger>
          </TabsList>
          <div className="flex gap-0.5 bg-muted p-0.5 rounded-md">
            {(['all', 'safety', 'health', 'efficiency'] as const).map(cat => (
              <button key={cat} className={`px-2 py-1 text-[10px] rounded transition-colors ${filterCategory === cat ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setFilterCategory(cat)}>
                {cat === 'all' ? '全部' : categoryLabels[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* ===== 规则管理 ===== */}
        <TabsContent value="rules" className="mt-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /><span className="text-xs text-muted-foreground">加载中...</span></div>
          ) : filteredRules.length === 0 ? (
            <div className="text-center py-8"><p className="text-xs text-muted-foreground">暂无护栏规则</p><Button size="sm" className="mt-2 h-7 text-xs" onClick={() => setCreateDialogOpen(true)}>创建第一条规则</Button></div>
          ) : (
            <PageCard noPadding>
              <div className="p-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] py-1 w-12">状态</TableHead>
                      <TableHead className="text-[10px] py-1">名称</TableHead>
                      <TableHead className="text-[10px] py-1">类别</TableHead>
                      <TableHead className="text-[10px] py-1">级别</TableHead>
                      <TableHead className="text-[10px] py-1">描述</TableHead>
                      <TableHead className="text-[10px] py-1 text-right">触发</TableHead>
                      <TableHead className="text-[10px] py-1 text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRules.map(rule => (
                      <TableRow key={rule.id} className={!rule.enabled ? 'opacity-50' : ''}>
                        <TableCell className="py-1"><Switch checked={rule.enabled} onCheckedChange={() => toggleRule2(rule.id)} className="scale-75" /></TableCell>
                        <TableCell className="text-xs font-medium py-1">{rule.name}</TableCell>
                        <TableCell className="py-1"><Badge variant="outline" className="text-[10px]">{categoryLabels[rule.category]}</Badge></TableCell>
                        <TableCell className="py-1"><Badge variant={severityVariant(rule.severity)} className="text-[10px]">{rule.severity}</Badge></TableCell>
                        <TableCell className="max-w-[160px] truncate text-[10px] text-muted-foreground py-1">{rule.description}</TableCell>
                        <TableCell className="text-right font-mono text-xs py-1">{rule.triggerCount}</TableCell>
                        <TableCell className="text-right py-1">
                          <div className="flex gap-0.5 justify-end">
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5" onClick={() => { setEditRule(rule); setCreateDialogOpen(false); }}>编辑</Button>
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-destructive hover:text-destructive" onClick={() => setDeleteRule(rule)}>删除</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </PageCard>
          )}
        </TabsContent>

        {/* ===== 实时告警 ===== */}
        <TabsContent value="alerts" className="mt-2">
          {pendingAlerts.length === 0 ? (
            <div className="text-center py-8"><p className="text-xs text-muted-foreground">✓ 当前无待处理告警</p><p className="text-[10px] text-muted-foreground mt-0.5">所有告警已确认处理</p></div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{pendingAlerts.length} 条待处理</span>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { pendingAlerts.forEach(a => acknowledgeMutation.mutate({ alertId: a.id })); }}>全部确认</Button>
              </div>
              <div className="space-y-1.5">
                {pendingAlerts.map(alert => (
                  <PageCard key={alert.id} className="border-orange-300/30">
                    <div className="flex items-center gap-2">
                      <Badge variant={severityVariant(alert.severity)} className="text-[10px]">{alert.severity}</Badge>
                      <Badge variant="outline" className="text-[10px]">{categoryLabels[alert.category]}</Badge>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{alert.message}</div>
                        <div className="text-[10px] text-muted-foreground">设备: {alert.equipmentId} · {new Date(alert.createdAt).toLocaleString()}</div>
                      </div>
                      <Button size="sm" className="h-6 text-[10px]" onClick={() => acknowledgeAlert(alert.id)}>确认</Button>
                    </div>
                  </PageCard>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===== 告警历史 ===== */}
        <TabsContent value="history" className="mt-2">
          {filteredHistory.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">暂无告警记录</div>
          ) : (
            <PageCard noPadding>
              <div className="p-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] py-1">时间</TableHead>
                      <TableHead className="text-[10px] py-1">类别</TableHead>
                      <TableHead className="text-[10px] py-1">级别</TableHead>
                      <TableHead className="text-[10px] py-1">设备</TableHead>
                      <TableHead className="text-[10px] py-1">告警信息</TableHead>
                      <TableHead className="text-[10px] py-1">状态</TableHead>
                      <TableHead className="text-[10px] py-1 text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.map(alert => (
                      <TableRow key={alert.id} className={alert.acknowledged ? 'opacity-60' : ''}>
                        <TableCell className="text-[10px] text-muted-foreground py-1 whitespace-nowrap">{new Date(alert.createdAt).toLocaleString()}</TableCell>
                        <TableCell className="py-1"><Badge variant="outline" className="text-[10px]">{categoryLabels[alert.category]}</Badge></TableCell>
                        <TableCell className="py-1"><Badge variant={severityVariant(alert.severity)} className="text-[10px]">{alert.severity}</Badge></TableCell>
                        <TableCell className="font-mono text-[10px] py-1">{alert.equipmentId}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs py-1">{alert.message}</TableCell>
                        <TableCell className="py-1">{alert.acknowledged ? <Badge variant="outline" className="text-[10px] text-green-600">已确认</Badge> : <Badge variant="destructive" className="text-[10px]">待处理</Badge>}</TableCell>
                        <TableCell className="text-right py-1">{!alert.acknowledged && <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => acknowledgeAlert(alert.id)}>确认</Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </PageCard>
          )}
        </TabsContent>

        {/* ===== 统计分析 ===== */}
        <TabsContent value="stats" className="mt-2">
          <PageCard title="分类统计" icon="📊">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] py-1">类别</TableHead>
                  <TableHead className="text-[10px] py-1">规则数</TableHead>
                  <TableHead className="text-[10px] py-1">触发次数</TableHead>
                  <TableHead className="text-[10px] py-1">占比</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(['safety', 'health', 'efficiency'] as const).map(cat => (
                  <TableRow key={cat}>
                    <TableCell className="text-xs font-medium py-1">{categoryLabels[cat]}</TableCell>
                    <TableCell className="text-xs py-1">{stats.byCategory[cat].rules}</TableCell>
                    <TableCell className="text-xs py-1">{stats.byCategory[cat].triggers}</TableCell>
                    <TableCell className="py-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${cat === 'safety' ? 'bg-red-500' : cat === 'health' ? 'bg-blue-500' : 'bg-green-500'}`} style={{ width: `${stats.totalTriggers > 0 ? (stats.byCategory[cat].triggers / stats.totalTriggers * 100) : 0}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{stats.totalTriggers > 0 ? Math.round(stats.byCategory[cat].triggers / stats.totalTriggers * 100) : 0}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PageCard>
        </TabsContent>

        {/* ===== G6: 效果分析 ===== */}
        <TabsContent value="effectiveness" className="mt-2">
          {(() => {
            const overview = effectivenessOverviewQuery.data as EffectivenessOverview | undefined;
            const byRuleData = (effectivenessByRuleQuery.data as { stats: RuleEffectiveness[] } | undefined)?.stats ?? [];
            const dailyStats = (dailyStatsQuery.data as DailyStat[]) ?? [];
            const isEffLoading = effectivenessOverviewQuery.isLoading;

            if (isEffLoading) return <div className="flex items-center justify-center py-8 gap-2"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /><span className="text-xs text-muted-foreground">加载效果数据...</span></div>;

            return (
              <div className="space-y-3">
                {/* 效果概览卡片 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <StatCard value={overview?.totalTriggers ?? 0} label="30天总触发" icon="⚡" />
                  <StatCard value={`${Math.round((overview?.executionRate ?? 0) * 100)}%`} label="执行率" icon="✅" />
                  <StatCard value={`${Math.round((overview?.falsePositiveRate ?? 0) * 100)}%`} label="误报率" icon="⚠️" />
                  <StatCard value={overview?.dataAsOf ? new Date(overview.dataAsOf).toLocaleDateString() : '暂无'} label="数据截至" icon="📅" />
                </div>

                {/* 每日触发趋势 */}
                {dailyStats.length > 0 && (
                  <PageCard title="每日触发趋势（近30天）" icon="📈">
                    <div className="h-32 flex items-end gap-0.5">
                      {(() => {
                        const maxCount = Math.max(...dailyStats.map(d => Number(d.count)), 1);
                        return dailyStats.map((d, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                            <span className="text-[8px] text-muted-foreground">{Number(d.count)}</span>
                            <div className="w-full bg-primary/80 rounded-t" style={{ height: `${(Number(d.count) / maxCount) * 100}px`, minHeight: '2px' }} title={`${d.date}: ${d.count}次, 平均严重度 ${Number(d.avgSeverity).toFixed(2)}`} />
                            {i % 5 === 0 && <span className="text-[7px] text-muted-foreground">{String(d.date).slice(5)}</span>}
                          </div>
                        ));
                      })()}
                    </div>
                  </PageCard>
                )}

                {/* 规则效果表格 */}
                <PageCard title="规则效果评估" icon="📊" noPadding>
                  <div className="p-2">
                    {byRuleData.length === 0 ? (
                      <div className="text-center py-4 text-xs text-muted-foreground">暂无效果评估数据，请先运行批处理任务</div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px] py-1">规则</TableHead>
                            <TableHead className="text-[10px] py-1">类别</TableHead>
                            <TableHead className="text-[10px] py-1 text-right">总触发</TableHead>
                            <TableHead className="text-[10px] py-1 text-right">真阳性</TableHead>
                            <TableHead className="text-[10px] py-1 text-right">误报</TableHead>
                            <TableHead className="text-[10px] py-1 text-right">精确率</TableHead>
                            <TableHead className="text-[10px] py-1 text-right">平均严重度</TableHead>
                            <TableHead className="text-[10px] py-1">评估周期</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {byRuleData.map(stat => (
                            <TableRow key={stat.ruleId}>
                              <TableCell className="text-xs font-medium py-1">{stat.ruleName}</TableCell>
                              <TableCell className="py-1"><Badge variant="outline" className="text-[10px]">{categoryLabels[stat.ruleType] ?? stat.ruleType}</Badge></TableCell>
                              <TableCell className="text-right font-mono text-xs py-1">{stat.totalTriggers}</TableCell>
                              <TableCell className="text-right font-mono text-xs py-1 text-green-600">{stat.truePositives}</TableCell>
                              <TableCell className="text-right font-mono text-xs py-1 text-red-600">{stat.falsePositives}</TableCell>
                              <TableCell className="text-right py-1">
                                <div className="flex items-center justify-end gap-1">
                                  <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full ${stat.precision > 0.8 ? 'bg-green-500' : stat.precision > 0.6 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${stat.precision * 100}%` }} /></div>
                                  <span className="text-[10px] font-mono">{Math.round(stat.precision * 100)}%</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono text-[10px] py-1">{Number(stat.avgSeverity).toFixed(2)}</TableCell>
                              <TableCell className="text-[10px] text-muted-foreground py-1 whitespace-nowrap">{stat.periodStart?.slice(0, 10)} ~ {stat.periodEnd?.slice(0, 10)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </PageCard>
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>

      <RuleFormDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} editRule={null} onSubmit={handleCreateSubmit} isSubmitting={createRuleMutation.isPending} />
      <RuleFormDialog open={!!editRule} onOpenChange={(open) => { if (!open) setEditRule(null); }} editRule={editRule} onSubmit={handleEditSubmit} isSubmitting={updateRuleMutation.isPending} />
      <DeleteConfirmDialog open={!!deleteRule} onOpenChange={(open) => { if (!open) setDeleteRule(null); }} ruleName={deleteRule?.name ?? ''} onConfirm={handleDeleteConfirm} isDeleting={deleteRuleMutation.isPending} />
    </div>
    </MainLayout>
  );
}
