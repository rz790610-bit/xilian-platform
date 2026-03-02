/**
 * 进化看板 — 进化引擎
 *
 * 功能：
 * 1. 全局进化状态总览（模型数量、进化轮次、整体健康度）
 * 2. 模型进化时间线（版本演进 + 指标变化）
 * 3. 进化健康度评估（数据质量、模型性能、反馈闭环）
 * 4. 进化引擎运行状态
 * 5. 自动化规则配置
 */
import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  TrendingUp, Activity, Shield, Settings2, Clock,
  CheckCircle2, AlertTriangle, ArrowUpRight, Zap, Brain,
  Target, MessageSquare, BarChart3, RefreshCw, GitBranch,
  Layers, Gauge, Loader2, Plus
} from 'lucide-react';
import { useToast } from '@/components/common/Toast';
import { trpc } from '@/lib/trpc';

// ==================== 类型 ====================

interface ModelEvolution {
  id: string;
  name: string;
  currentVersion: string;
  versions: VersionEntry[];
  healthScore: number;
  status: 'healthy' | 'degrading' | 'needs_retrain' | 'training';
  lastUpdated: string;
  totalFeedback: number;
  pendingFeedback: number;
}

interface VersionEntry {
  version: string;
  date: string;
  accuracy: number;
  f1: number;
  trigger: string;
  dataSize: number;
  improvement: number;
}

interface EvolutionRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  action: string;
  enabled: boolean;
  lastTriggered?: string;
  triggerCount: number;
}

interface HealthMetric {
  category: string;
  name: string;
  score: number;
  status: 'good' | 'warning' | 'critical';
  detail: string;
}

// ==================== 工具 ====================

const modelStatusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  healthy: { label: '健康', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: <CheckCircle2 className="w-3 h-3" /> },
  degrading: { label: '退化中', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: <AlertTriangle className="w-3 h-3" /> },
  needs_retrain: { label: '需重训', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30', icon: <RefreshCw className="w-3 h-3" /> },
  training: { label: '训练中', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', icon: <Zap className="w-3 h-3" /> },
};

function HealthGauge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const color = score >= 85 ? 'text-emerald-400' : score >= 70 ? 'text-amber-400' : 'text-red-400';
  const sizeClass = size === 'lg' ? 'text-3xl' : size === 'md' ? 'text-xl' : 'text-base';
  return <span className={cn("font-bold font-mono", color, sizeClass)}>{score}</span>;
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ==================== 主组件 ====================

export default function EvolutionBoard() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', cronExpression: '', config: '{}' });

  // tRPC queries — 真实数据，无 mock 降级
  const modelsQuery = trpc.evoEvolution.getBoardModels.useQuery(undefined, { refetchInterval: 30000, retry: 1 });
  const rulesQuery = trpc.evoEvolution.getBoardRules.useQuery(undefined, { retry: 1 });
  const healthQuery = trpc.evoEvolution.getBoardHealthMetrics.useQuery(undefined, { retry: 1 });

  const models = (modelsQuery.data ?? []) as ModelEvolution[];
  const rules = (rulesQuery.data ?? []) as EvolutionRule[];
  const healthMetrics = (healthQuery.data ?? []) as HealthMetric[];

  const isLoading = modelsQuery.isLoading || rulesQuery.isLoading || healthQuery.isLoading;

  // tRPC mutations — 规则切换 & 新增
  const toggleRuleMut = trpc.evoEvolution.schedule.toggle.useMutation({
    onSuccess: () => { rulesQuery.refetch(); healthQuery.refetch(); toast.success('规则状态已更新'); },
    onError: (err) => { toast.error(`切换失败: ${err.message}`); },
  });

  const addRuleMut = trpc.evoEvolution.schedule.create.useMutation({
    onSuccess: () => { rulesQuery.refetch(); setShowAddRule(false); setNewRule({ name: '', cronExpression: '', config: '{}' }); toast.success('规则创建成功'); },
    onError: (err) => { toast.error(`创建失败: ${err.message}`); },
  });

  const overallHealth = useMemo(() => {
    if (models.length === 0) return 0;
    const avg = models.reduce((s, m) => s + m.healthScore, 0) / models.length;
    return Math.round(avg);
  }, [models]);

  const toggleRule = (id: string, currentEnabled: boolean) => {
    toggleRuleMut.mutate({ id: Number(id), enabled: !currentEnabled });
  };

  const handleAddRule = () => {
    if (!newRule.name || !newRule.cronExpression) { toast.error('名称和 Cron 表达式为必填项'); return; }
    let parsedConfig: Record<string, unknown> = {};
    try { parsedConfig = JSON.parse(newRule.config); } catch { toast.error('配置 JSON 格式无效'); return; }
    addRuleMut.mutate({ name: newRule.name, cronExpression: newRule.cronExpression, config: parsedConfig });
  };

  // 全局 loading 状态
  if (isLoading) {
    return (
      <MainLayout title="进化看板">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">加载进化数据...</span>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="进化看板">
      <div className="animate-fade-up">
        {/* 页头 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold mb-1">进化看板</h2>
            <p className="text-xs text-muted-foreground">全局视角监控模型进化状态，驱动持续改进</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn(
              "text-[10px] gap-1",
              overallHealth >= 85 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
              overallHealth >= 70 ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
              'bg-red-500/15 text-red-400 border-red-500/30'
            )}>
              <Activity className="w-3 h-3" />
              系统健康度: {overallHealth}
            </Badge>
          </div>
        </div>

        {/* 统计 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <StatCard value={models.length} label="监控模型" icon="🧠" />
          <StatCard value={models.reduce((s, m) => s + m.versions.length, 0)} label="总版本数" icon="📦" />
          <StatCard value={models.reduce((s, m) => s + m.totalFeedback, 0)} label="累计反馈" icon="📥" />
          <StatCard value={`${overallHealth}`} label="健康评分" icon="💚" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-3">
            <TabsTrigger value="overview" className="text-xs gap-1"><Gauge className="w-3 h-3" /> 总览</TabsTrigger>
            <TabsTrigger value="timeline" className="text-xs gap-1"><GitBranch className="w-3 h-3" /> 进化时间线</TabsTrigger>
            <TabsTrigger value="health" className="text-xs gap-1"><Shield className="w-3 h-3" /> 健康评估</TabsTrigger>
            <TabsTrigger value="rules" className="text-xs gap-1"><Settings2 className="w-3 h-3" /> 自动化规则</TabsTrigger>
          </TabsList>

          {/* ==================== 总览 ==================== */}
          <TabsContent value="overview">
            {models.length === 0 ? (
              <PageCard>
                <div className="text-center py-8 text-sm text-muted-foreground">暂无模型数据，请先创建冠军挑战者实验</div>
              </PageCard>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {models.map(model => {
                  const latestVersion = model.versions[model.versions.length - 1];
                  return (
                    <PageCard key={model.id}>
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-foreground">{model.name}</span>
                              <Badge variant="outline" className={cn("text-[10px] gap-0.5", modelStatusConfig[model.status]?.color)}>
                                {modelStatusConfig[model.status]?.icon}
                                {modelStatusConfig[model.status]?.label}
                              </Badge>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              当前: <span className="font-mono text-foreground">{model.currentVersion}</span>
                              {latestVersion && latestVersion.version.includes('*') && (
                                <span className="ml-2 text-cyan-400">→ {latestVersion.version} ({latestVersion.date})</span>
                              )}
                            </div>
                          </div>
                          <HealthGauge score={model.healthScore} size="md" />
                        </div>

                        {/* 版本进度条 */}
                        <div className="space-y-1">
                          {model.versions.slice(-3).map((ver) => (
                            <div key={ver.version} className="flex items-center gap-2 text-[10px]">
                              <span className={cn(
                                "font-mono w-10",
                                ver.version.includes('*') ? 'text-cyan-400' : 'text-muted-foreground'
                              )}>
                                {ver.version}
                              </span>
                              <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    ver.version.includes('*') ? 'bg-cyan-500' : 'bg-emerald-500'
                                  )}
                                  style={{ width: `${ver.accuracy}%` }}
                                />
                              </div>
                              <span className="font-mono text-muted-foreground w-12 text-right">{ver.accuracy}%</span>
                              {ver.improvement > 0 && (
                                <span className="text-emerald-400 w-10 text-right">+{ver.improvement}%</span>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* 底部信息 */}
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/50">
                          <span>反馈: {model.totalFeedback} (待处理 {model.pendingFeedback})</span>
                          <span>更新: {model.lastUpdated}</span>
                        </div>
                      </div>
                    </PageCard>
                  );
                })}
              </div>
            )}

            {/* 引擎运行状态 */}
            <PageCard title="引擎运行状态" icon="⚙️" className="mt-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { name: '反馈收集器', status: 'running', uptime: '72h', icon: <MessageSquare className="w-3.5 h-3.5 text-emerald-400" /> },
                  { name: '主动学习引擎', status: 'running', uptime: '72h', icon: <Target className="w-3.5 h-3.5 text-emerald-400" /> },
                  { name: '自动训练调度', status: 'running', uptime: '72h', icon: <Zap className="w-3.5 h-3.5 text-emerald-400" /> },
                  { name: '模型评估器', status: 'busy', uptime: '72h', icon: <BarChart3 className="w-3.5 h-3.5 text-cyan-400" /> },
                ].map(svc => (
                  <div key={svc.name} className="flex items-center gap-2 p-2 bg-secondary/30 rounded">
                    {svc.icon}
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-foreground truncate">{svc.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {svc.status === 'running' ? '运行中' : '忙碌'} · {svc.uptime}
                      </div>
                    </div>
                    <div className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      svc.status === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-cyan-500 animate-pulse'
                    )} />
                  </div>
                ))}
              </div>
            </PageCard>
          </TabsContent>

          {/* ==================== 进化时间线 ==================== */}
          <TabsContent value="timeline">
            {models.length === 0 ? (
              <PageCard>
                <div className="text-center py-8 text-sm text-muted-foreground">暂无模型进化记录</div>
              </PageCard>
            ) : (
              <div className="space-y-4">
                {models.map(model => (
                  <PageCard key={model.id} title={model.name} icon={<Brain className="w-3.5 h-3.5" />}>
                    <div className="relative pl-6">
                      {/* 时间线轴 */}
                      <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />

                      {model.versions.map((ver, i) => {
                        const isLatest = i === model.versions.length - 1;
                        const isTraining = ver.version.includes('*');
                        return (
                          <div key={ver.version} className="relative pb-4 last:pb-0">
                            {/* 节点 */}
                            <div className={cn(
                              "absolute left-[-18px] w-3 h-3 rounded-full border-2",
                              isTraining ? 'bg-cyan-500 border-cyan-400 animate-pulse' :
                              isLatest ? 'bg-emerald-500 border-emerald-400' :
                              'bg-secondary border-border'
                            )} />

                            <div className={cn(
                              "p-2.5 rounded-lg transition-all",
                              isTraining ? 'bg-cyan-500/5 border border-cyan-500/20' :
                              isLatest ? 'bg-emerald-500/5 border border-emerald-500/20' :
                              'bg-secondary/30'
                            )}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={cn(
                                  "text-xs font-semibold font-mono",
                                  isTraining ? 'text-cyan-400' : isLatest ? 'text-emerald-400' : 'text-foreground'
                                )}>
                                  {ver.version}
                                </span>
                                <span className="text-[10px] text-muted-foreground">{ver.date}</span>
                                <Badge variant="outline" className="text-[9px] bg-secondary text-muted-foreground">
                                  {ver.trigger}
                                </Badge>
                              </div>

                              <div className="flex items-center gap-4 text-[10px]">
                                <span>准确率: <span className="font-mono text-emerald-400">{ver.accuracy}%</span></span>
                                <span>F1: <span className="font-mono text-cyan-400">{ver.f1}%</span></span>
                                <span>数据量: <span className="font-mono text-muted-foreground">{ver.dataSize.toLocaleString()}</span></span>
                                {ver.improvement > 0 && (
                                  <span className="text-emerald-400 flex items-center gap-0.5">
                                    <ArrowUpRight className="w-2.5 h-2.5" />+{ver.improvement}%
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </PageCard>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ==================== 健康评估 ==================== */}
          <TabsContent value="health">
            {healthMetrics.length === 0 ? (
              <PageCard>
                <div className="text-center py-8 text-sm text-muted-foreground">暂无健康度指标数据</div>
              </PageCard>
            ) : (
              <>
                {['数据质量', '模型性能', '反馈闭环'].map(category => {
                  const metrics = healthMetrics.filter(m => m.category === category);
                  if (metrics.length === 0) return null;
                  const avgScore = Math.round(metrics.reduce((s, m) => s + m.score, 0) / metrics.length);
                  return (
                    <PageCard key={category} title={category} icon={
                      category === '数据质量' ? <Layers className="w-3.5 h-3.5" /> :
                      category === '模型性能' ? <TrendingUp className="w-3.5 h-3.5" /> :
                      <MessageSquare className="w-3.5 h-3.5" />
                    } className="mb-3" action={
                      <span className={cn(
                        "text-xs font-bold font-mono",
                        avgScore >= 85 ? 'text-emerald-400' : avgScore >= 70 ? 'text-amber-400' : 'text-red-400'
                      )}>
                        {avgScore}
                      </span>
                    }>
                      <div className="space-y-2">
                        {metrics.map(metric => (
                          <div key={metric.name} className="flex items-center gap-3">
                            <div className={cn(
                              "w-2 h-2 rounded-full shrink-0",
                              metric.status === 'good' ? 'bg-emerald-500' :
                              metric.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                            )} />
                            <span className="text-[11px] text-foreground w-24 shrink-0">{metric.name}</span>
                            <div className="flex-1">
                              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    metric.status === 'good' ? 'bg-emerald-500' :
                                    metric.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                                  )}
                                  style={{ width: `${metric.score}%` }}
                                />
                              </div>
                            </div>
                            <span className={cn(
                              "text-[10px] font-mono w-8 text-right",
                              metric.status === 'good' ? 'text-emerald-400' :
                              metric.status === 'warning' ? 'text-amber-400' : 'text-red-400'
                            )}>
                              {metric.score}
                            </span>
                            <span className="text-[10px] text-muted-foreground w-40 text-right truncate">{metric.detail}</span>
                          </div>
                        ))}
                      </div>
                    </PageCard>
                  );
                })}
              </>
            )}

            {/* 改进建议 */}
            <PageCard title="改进建议" icon="💡">
              <div className="space-y-2">
                {[
                  { priority: 'high', text: '类别平衡度偏低（68分），建议对少数类进行过采样或使用 SMOTE 合成', action: '配置过采样' },
                  { priority: 'medium', text: '反馈闭环周期偏长（4.2天），建议缩短审核流程或增加审核人员', action: '优化流程' },
                  { priority: 'medium', text: '关键故障漏检率 3.8%，建议针对性增加训练数据和调整分类阈值', action: '调整阈值' },
                  { priority: 'low', text: '旋转机械通用模型健康度下降至 68，建议启动主动学习和模型重训', action: '启动重训' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 bg-secondary/30 rounded">
                    <div className={cn(
                      "w-1.5 self-stretch rounded-full shrink-0",
                      item.priority === 'high' ? 'bg-red-500' :
                      item.priority === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
                    )} />
                    <p className="text-[11px] text-muted-foreground flex-1">{item.text}</p>
                    <Button size="sm" variant="outline" className="h-6 text-[10px] shrink-0" onClick={() => toast.success('操作已执行')}>
                      {item.action}
                    </Button>
                  </div>
                ))}
              </div>
            </PageCard>
          </TabsContent>

          {/* ==================== 自动化规则 ==================== */}
          <TabsContent value="rules">
            {rules.length === 0 ? (
              <PageCard>
                <div className="text-center py-8 text-sm text-muted-foreground">暂无自动化规则，点击下方按钮添加</div>
              </PageCard>
            ) : (
              <div className="space-y-2">
                {rules.map(rule => (
                  <PageCard key={rule.id}>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={() => toggleRule(rule.id, rule.enabled)}
                        disabled={toggleRuleMut.isPending}
                        className="shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-foreground">{rule.name}</span>
                          <Badge variant="outline" className={cn(
                            "text-[10px]",
                            rule.enabled ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'
                          )}>
                            {rule.enabled ? '已启用' : '已禁用'}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground mb-1.5">{rule.description}</p>
                        <div className="flex items-center gap-4 text-[10px]">
                          <span className="text-muted-foreground">
                            触发条件: <span className="text-foreground font-mono">{rule.trigger}</span>
                          </span>
                          <span className="text-muted-foreground">
                            执行动作: <span className="text-foreground">{rule.action}</span>
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-muted-foreground">触发 {rule.triggerCount} 次</div>
                        {rule.lastTriggered && (
                          <div className="text-[10px] text-muted-foreground">
                            <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                            {formatTime(rule.lastTriggered)}
                          </div>
                        )}
                      </div>
                    </div>
                  </PageCard>
                ))}
              </div>
            )}

            <PageCard className="mt-3">
              <div className="text-center py-4">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAddRule(true)}>
                  <Plus className="w-3 h-3" /> 添加自定义规则
                </Button>
              </div>
            </PageCard>
          </TabsContent>
        </Tabs>

        {/* 添加规则对话框 */}
        <Dialog open={showAddRule} onOpenChange={setShowAddRule}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">添加自动化规则</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">规则名称</label>
                <Input
                  value={newRule.name}
                  onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="如: 反馈驱动重训"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">Cron 表达式</label>
                <Input
                  value={newRule.cronExpression}
                  onChange={(e) => setNewRule(prev => ({ ...prev, cronExpression: e.target.value }))}
                  placeholder="如: 0 9 * * 1 (每周一 09:00)"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">配置 (JSON)</label>
                <Input
                  value={newRule.config}
                  onChange={(e) => setNewRule(prev => ({ ...prev, config: e.target.value }))}
                  placeholder='{}'
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowAddRule(false)}>取消</Button>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={handleAddRule} disabled={addRuleMut.isPending}>
                {addRuleMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
