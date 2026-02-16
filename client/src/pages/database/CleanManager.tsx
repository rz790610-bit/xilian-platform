import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import { RefreshCw, Plus, Trash2, Play, CheckCircle, XCircle, Filter, FileText, BarChart3 } from 'lucide-react';

export default function CleanManager() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('rules');
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [ruleForm, setRuleForm] = useState<any>({});

  // tRPC 查询
  const { data: qualityStats, refetch: refetchStats } = trpc.database.clean.getQualityStats.useQuery();
  const { data: cleanRules, refetch: refetchRules } = trpc.database.clean.listRules.useQuery();
  const { data: cleanTasks, refetch: refetchTasks } = trpc.database.clean.listTasks.useQuery({ limit: 50 });
  const { data: qualityReports, refetch: refetchReports } = trpc.database.clean.listQualityReports.useQuery({ limit: 50 });

  // Mutations
  const createRule = trpc.database.clean.createRule.useMutation({
    onSuccess: () => { toast.success('清洗规则创建成功'); refetchRules(); setShowCreateRule(false); setRuleForm({}); },
    onError: (e) => toast.error(e.message),
  });
  const deleteRule = trpc.database.clean.deleteRule.useMutation({
    onSuccess: () => { toast.success('规则已删除'); refetchRules(); },
  });
  const executeTask = trpc.database.clean.executeTask.useMutation({
    onSuccess: (data) => { toast.success(`清洗任务 ${data.taskId} 已启动`); refetchTasks(); },
    onError: (e) => toast.error(e.message),
  });

  const statusVariant = (s: string) =>
    s === 'completed' ? 'success' : s === 'running' ? 'info' : s === 'failed' ? 'danger' : s === 'pending' ? 'warning' : 'default';

  return (
    <MainLayout title="数据清洗">
      <div className="p-4 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-foreground">数据清洗管理</h2>
            <p className="text-xs text-muted-foreground mt-0.5">清洗规则 · 清洗任务 · 质量报告</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { refetchRules(); refetchTasks(); refetchReports(); refetchStats(); }} className="text-xs">
            <RefreshCw className="w-3 h-3 mr-1" />刷新
          </Button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard value={cleanRules?.length ?? 0} label="清洗规则" icon="🧹" />
          <StatCard value={cleanTasks?.total ?? 0} label="清洗任务" icon="⚡" />
          <StatCard value={qualityStats?.totalReports ?? 0} label="质量报告" icon="📋" />
          <StatCard value={qualityStats?.avgScore ?? '-'} label="平均质量分" icon="✅" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="rules" className="text-xs">清洗规则</TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs">清洗任务</TabsTrigger>
            <TabsTrigger value="reports" className="text-xs">质量报告</TabsTrigger>
          </TabsList>

          {/* 清洗规则 */}
          <TabsContent value="rules">
            <PageCard title="清洗规则列表" icon={<Filter className="w-3.5 h-3.5" />}
              action={<Button size="sm" className="text-xs h-6" onClick={() => setShowCreateRule(true)}><Plus className="w-3 h-3 mr-1" />新建规则</Button>}>
              <div className="space-y-2">
                {cleanRules && cleanRules.length > 0 ? cleanRules.map((r: any) => (
                  <div key={r.ruleId} className="flex items-center justify-between p-2 rounded bg-secondary/50 text-xs">
                    <div className="flex-1">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {r.ruleId} · 类型: {r.ruleType} · 优先级: {r.priority ?? 0}
                      </div>
                      {r.description && <div className="text-[10px] text-muted-foreground">{r.description}</div>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={r.isActive === 1 ? 'success' : 'default'}>{r.isActive === 1 ? '启用' : '禁用'}</Badge>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                        onClick={() => executeTask.mutate({ ruleId: r.ruleId })}>
                        <Play className="w-3 h-3 text-primary" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                        onClick={() => deleteRule.mutate({ ruleId: r.ruleId })}>
                        <Trash2 className="w-3 h-3 text-danger" />
                      </Button>
                    </div>
                  </div>
                )) : <div className="text-xs text-muted-foreground text-center py-6">暂无清洗规则</div>}
              </div>
            </PageCard>
          </TabsContent>

          {/* 清洗任务 */}
          <TabsContent value="tasks">
            <PageCard title="清洗任务列表" icon={<Play className="w-3.5 h-3.5" />}>
              <div className="space-y-2">
                {cleanTasks?.items && cleanTasks.items.length > 0 ? cleanTasks.items.map((t: any) => (
                  <div key={t.taskId} className="flex items-center justify-between p-2 rounded bg-secondary/50 text-xs">
                    <div className="flex-1">
                      <div className="font-medium font-mono">{t.taskId}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        规则: {t.ruleId} · 输入: {t.inputCount ?? '-'} · 输出: {t.outputCount ?? '-'} · 丢弃: {t.droppedCount ?? '-'}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {t.startedAt ? new Date(t.startedAt).toLocaleString() : '-'} → {t.completedAt ? new Date(t.completedAt).toLocaleString() : '进行中'}
                      </div>
                    </div>
                    <Badge variant={statusVariant(t.status)} dot>{t.status}</Badge>
                  </div>
                )) : <div className="text-xs text-muted-foreground text-center py-6">暂无清洗任务</div>}
              </div>
            </PageCard>
          </TabsContent>

          {/* 质量报告 */}
          <TabsContent value="reports">
            <PageCard title="数据质量报告" icon={<BarChart3 className="w-3.5 h-3.5" />}>
              <div className="space-y-2">
                {qualityReports?.items && qualityReports.items.length > 0 ? qualityReports.items.map((r: any) => (
                  <div key={r.reportId} className="p-2 rounded bg-secondary/50 text-xs">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium font-mono">{r.reportId}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          节点: {r.nodeId || '-'} · 切片: {r.sliceId || '-'} · 日期: {r.reportDate}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-bold ${
                          (r.overallScore ?? 0) >= 80 ? 'text-success' :
                          (r.overallScore ?? 0) >= 60 ? 'text-warning' : 'text-danger'
                        }`}>{r.overallScore ?? '-'}</div>
                        <div className="text-[9px] text-muted-foreground">质量分</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      <div className="text-center">
                        <div className="text-[10px] text-muted-foreground">完整性</div>
                        <div className="font-mono">{r.completenessScore ?? '-'}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-muted-foreground">准确性</div>
                        <div className="font-mono">{r.accuracyScore ?? '-'}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-muted-foreground">一致性</div>
                        <div className="font-mono">{r.consistencyScore ?? '-'}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-muted-foreground">时效性</div>
                        <div className="font-mono">{r.timelinessScore ?? '-'}</div>
                      </div>
                    </div>
                  </div>
                )) : <div className="text-xs text-muted-foreground text-center py-6">暂无质量报告</div>}
              </div>
            </PageCard>
          </TabsContent>
        </Tabs>

        {/* 创建清洗规则对话框 */}
        <Dialog open={showCreateRule} onOpenChange={setShowCreateRule}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="text-sm">新建清洗规则</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">规则ID *</label>
                  <Input className="h-8 text-xs" placeholder="如 CLEAN-001"
                    value={ruleForm.ruleId || ''} onChange={e => setRuleForm((p: any) => ({ ...p, ruleId: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">名称 *</label>
                  <Input className="h-8 text-xs" placeholder="规则名称"
                    value={ruleForm.name || ''} onChange={e => setRuleForm((p: any) => ({ ...p, name: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">规则类型</label>
                  <Select value={ruleForm.ruleType || 'outlier_removal'} onValueChange={v => setRuleForm((p: any) => ({ ...p, ruleType: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="outlier_removal">异常值去除</SelectItem>
                      <SelectItem value="missing_fill">缺失值填充</SelectItem>
                      <SelectItem value="deduplication">去重</SelectItem>
                      <SelectItem value="normalization">归一化</SelectItem>
                      <SelectItem value="resampling">重采样</SelectItem>
                      <SelectItem value="custom">自定义</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">优先级</label>
                  <Input className="h-8 text-xs" type="number" placeholder="0-100"
                    value={ruleForm.priority || ''} onChange={e => setRuleForm((p: any) => ({ ...p, priority: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">描述</label>
                <Textarea className="text-xs" rows={2} placeholder="可选描述"
                  value={ruleForm.description || ''} onChange={e => setRuleForm((p: any) => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowCreateRule(false)}>取消</Button>
              <Button size="sm" className="text-xs" onClick={() => createRule.mutate({
                ruleId: ruleForm.ruleId, name: ruleForm.name,
                ruleType: ruleForm.ruleType || 'outlier_removal',
                priority: ruleForm.priority ? Number(ruleForm.priority) : undefined,
                description: ruleForm.description,
              })} disabled={createRule.isPending}>
                {createRule.isPending ? '创建中...' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
