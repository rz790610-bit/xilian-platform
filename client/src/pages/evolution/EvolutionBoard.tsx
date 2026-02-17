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

import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  TrendingUp, Activity, Shield, Settings2, Clock,
  CheckCircle2, AlertTriangle, ArrowUpRight, Zap, Brain,
  Target, MessageSquare, BarChart3, RefreshCw, GitBranch,
  Layers, Gauge
} from 'lucide-react';
import { useToast } from '@/components/common/Toast';

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

// ==================== Mock 数据 ====================

const mockModels: ModelEvolution[] = [
  {
    id: 'bearing', name: '轴承故障分类器', currentVersion: 'v3.2', healthScore: 82,
    status: 'needs_retrain', lastUpdated: '2026-02-15', totalFeedback: 28, pendingFeedback: 5,
    versions: [
      { version: 'v3.0', date: '2025-11-01', accuracy: 85.2, f1: 82.8, trigger: '初始训练', dataSize: 3000, improvement: 0 },
      { version: 'v3.1', date: '2025-12-15', accuracy: 87.1, f1: 85.0, trigger: '主动学习 R3', dataSize: 3500, improvement: 1.9 },
      { version: 'v3.2', date: '2026-01-20', accuracy: 88.5, f1: 86.2, trigger: '反馈修正', dataSize: 4000, improvement: 1.4 },
      { version: 'v3.3*', date: '训练中', accuracy: 91.2, f1: 89.5, trigger: '主动学习 R8', dataSize: 4500, improvement: 2.7 },
    ],
  },
  {
    id: 'anomaly', name: '异常检测模型', currentVersion: 'v4.1', healthScore: 75,
    status: 'training', lastUpdated: '2026-02-14', totalFeedback: 35, pendingFeedback: 8,
    versions: [
      { version: 'v3.8', date: '2025-09-01', accuracy: 87.5, f1: 85.2, trigger: '初始训练', dataSize: 5000, improvement: 0 },
      { version: 'v4.0', date: '2025-11-20', accuracy: 90.2, f1: 88.1, trigger: '架构升级', dataSize: 6500, improvement: 2.7 },
      { version: 'v4.1', date: '2026-01-10', accuracy: 91.5, f1: 89.8, trigger: '主动学习 R5', dataSize: 7800, improvement: 1.3 },
      { version: 'v4.2*', date: '评估中', accuracy: 93.8, f1: 92.1, trigger: '漏检修复', dataSize: 8200, improvement: 2.3 },
    ],
  },
  {
    id: 'gearbox', name: '齿轮箱诊断', currentVersion: 'v2.6', healthScore: 95,
    status: 'healthy', lastUpdated: '2026-02-16', totalFeedback: 12, pendingFeedback: 1,
    versions: [
      { version: 'v2.3', date: '2025-10-01', accuracy: 89.5, f1: 87.2, trigger: '初始训练', dataSize: 2000, improvement: 0 },
      { version: 'v2.4', date: '2025-12-01', accuracy: 90.8, f1: 88.9, trigger: '数据扩充', dataSize: 2400, improvement: 1.3 },
      { version: 'v2.5', date: '2026-01-15', accuracy: 92.1, f1: 90.5, trigger: '主动学习 R4', dataSize: 2800, improvement: 1.3 },
      { version: 'v2.6', date: '2026-02-16', accuracy: 94.5, f1: 93.2, trigger: '标签修正', dataSize: 3200, improvement: 2.4 },
    ],
  },
  {
    id: 'rotating', name: '旋转机械通用模型', currentVersion: 'v1.8', healthScore: 68,
    status: 'degrading', lastUpdated: '2026-01-25', totalFeedback: 18, pendingFeedback: 6,
    versions: [
      { version: 'v1.5', date: '2025-08-01', accuracy: 83.2, f1: 80.5, trigger: '初始训练', dataSize: 4500, improvement: 0 },
      { version: 'v1.6', date: '2025-10-15', accuracy: 85.1, f1: 82.8, trigger: '数据扩充', dataSize: 5200, improvement: 1.9 },
      { version: 'v1.7', date: '2025-12-20', accuracy: 86.8, f1: 84.5, trigger: '主动学习 R2', dataSize: 5800, improvement: 1.7 },
      { version: 'v1.8', date: '2026-01-25', accuracy: 87.5, f1: 85.2, trigger: '反馈修正', dataSize: 6200, improvement: 0.7 },
    ],
  },
];

const mockRules: EvolutionRule[] = [
  { id: 'r1', name: '反馈驱动重训', description: '当累计未处理反馈超过阈值时自动触发模型重训', trigger: '待处理反馈 ≥ 10', action: '创建训练任务', enabled: true, lastTriggered: '2026-02-17T07:00:00Z', triggerCount: 5 },
  { id: 'r2', name: '性能退化告警', description: '当模型在线指标连续下降时触发告警和重训', trigger: '准确率连续下降 3 天', action: '告警 + 主动学习', enabled: true, lastTriggered: '2026-02-10T12:00:00Z', triggerCount: 2 },
  { id: 'r3', name: '定期主动学习', description: '按固定周期自动执行主动学习采样和标注任务创建', trigger: '每周一 09:00', action: '主动学习采样', enabled: true, lastTriggered: '2026-02-17T09:00:00Z', triggerCount: 8 },
  { id: 'r4', name: '标签修正触发', description: '当发现训练数据标签错误时自动触发受影响模型重训', trigger: '标签错误反馈被采纳', action: '数据清洗 + 重训', enabled: true, lastTriggered: '2026-02-14T16:00:00Z', triggerCount: 3 },
  { id: 'r5', name: '新数据自动评估', description: '当新数据入库时自动评估现有模型在新数据上的表现', trigger: '新数据批次入库', action: '模型评估', enabled: false, triggerCount: 0 },
  { id: 'r6', name: 'AutoML 定期搜索', description: '定期运行 AutoML 搜索以发现更优超参数组合', trigger: '每月 1 日', action: 'AutoML 搜索', enabled: false, triggerCount: 0 },
];

const mockHealthMetrics: HealthMetric[] = [
  { category: '数据质量', name: '标注一致性', score: 92, status: 'good', detail: '标注者间一致性 κ=0.87' },
  { category: '数据质量', name: '数据新鲜度', score: 85, status: 'good', detail: '最新数据 2 天前' },
  { category: '数据质量', name: '类别平衡度', score: 68, status: 'warning', detail: '少数类占比 8.5%，建议过采样' },
  { category: '数据质量', name: '特征完整性', score: 95, status: 'good', detail: '缺失值率 0.3%' },
  { category: '模型性能', name: '整体准确率', score: 91, status: 'good', detail: '加权平均 91.2%' },
  { category: '模型性能', name: '漏检率', score: 72, status: 'warning', detail: '关键故障漏检率 3.8%' },
  { category: '模型性能', name: '误报率', score: 78, status: 'warning', detail: '误报率 5.2%' },
  { category: '模型性能', name: '推理延迟', score: 96, status: 'good', detail: 'P99 延迟 45ms' },
  { category: '反馈闭环', name: '反馈处理率', score: 75, status: 'warning', detail: '20/28 已处理' },
  { category: '反馈闭环', name: '反馈采纳率', score: 82, status: 'good', detail: '采纳率 62.5%' },
  { category: '反馈闭环', name: '闭环周期', score: 70, status: 'warning', detail: '平均 4.2 天' },
  { category: '反馈闭环', name: '模型更新频率', score: 88, status: 'good', detail: '平均 2 周/次' },
];

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
  const [rules, setRules] = useState(mockRules);

  const overallHealth = useMemo(() => {
    const avg = mockModels.reduce((s, m) => s + m.healthScore, 0) / mockModels.length;
    return Math.round(avg);
  }, []);

  const toggleRule = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
    toast.success('规则已更新');
  };

  return (
    <MainLayout title="进化看板">
      <div className="animate-fade-up">
        {/* 页头 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold mb-1">🧬 进化看板</h2>
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
          <StatCard value={mockModels.length} label="监控模型" icon="🧠" />
          <StatCard value={mockModels.reduce((s, m) => s + m.versions.length, 0)} label="总版本数" icon="📦" />
          <StatCard value={mockModels.reduce((s, m) => s + m.totalFeedback, 0)} label="累计反馈" icon="📥" />
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {mockModels.map(model => {
                const latestVersion = model.versions[model.versions.length - 1];
                const prevVersion = model.versions.length > 1 ? model.versions[model.versions.length - 2] : null;
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
                            {latestVersion.version.includes('*') && (
                              <span className="ml-2 text-cyan-400">→ {latestVersion.version} ({latestVersion.date})</span>
                            )}
                          </div>
                        </div>
                        <HealthGauge score={model.healthScore} size="md" />
                      </div>

                      {/* 版本进度条 */}
                      <div className="space-y-1">
                        {model.versions.slice(-3).map((ver, i) => (
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
            <div className="space-y-4">
              {mockModels.map(model => (
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
          </TabsContent>

          {/* ==================== 健康评估 ==================== */}
          <TabsContent value="health">
            {['数据质量', '模型性能', '反馈闭环'].map(category => {
              const metrics = mockHealthMetrics.filter(m => m.category === category);
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
            <div className="space-y-2">
              {rules.map(rule => (
                <PageCard key={rule.id}>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => toggleRule(rule.id)}
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

            <PageCard className="mt-3">
              <div className="text-center py-4">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => toast.success('功能开发中')}>
                  <Settings2 className="w-3 h-3" /> 添加自定义规则
                </Button>
              </div>
            </PageCard>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
