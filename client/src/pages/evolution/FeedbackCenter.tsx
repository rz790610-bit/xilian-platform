/**
 * 反馈中心 — 进化引擎
 *
 * 功能：
 * 1. 反馈统计概览（总反馈、待处理、已采纳、采纳率）
 * 2. 反馈列表（按类型/状态/优先级过滤）
 * 3. 反馈详情弹窗（查看诊断上下文 + 处理反馈）
 * 4. 新建反馈（关联诊断记录）
 * 5. 反馈趋势分析
 */
import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  MessageSquarePlus, ThumbsUp, ThumbsDown, AlertTriangle, CheckCircle2,
  Clock, Filter, Search, ArrowUpRight, Tag, ChevronRight, Send,
  TrendingUp, BarChart3, XCircle, Eye
} from 'lucide-react';
import { useToast } from '@/components/common/Toast';
import { trpc } from '@/lib/trpc';

// ==================== 类型（从 DB eventData 映射） ====================

interface MappedFeedback {
  id: number;
  type: string;
  status: string;
  priority: string;
  title: string;
  description: string;
  diagnosisId?: string;
  deviceName?: string;
  algorithmName?: string;
  modelVersion?: string;
  submittedBy: string;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  tags: string[];
  originalPrediction?: string;
  correctedLabel?: string;
  confidence?: number;
}

// ==================== 工具 ====================

const typeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  correction: { label: '诊断修正', icon: <Tag className="w-3 h-3" />, color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  suggestion: { label: '改进建议', icon: <TrendingUp className="w-3 h-3" />, color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  false_positive: { label: '误报', icon: <XCircle className="w-3 h-3" />, color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  false_negative: { label: '漏检', icon: <AlertTriangle className="w-3 h-3" />, color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  label_error: { label: '标签错误', icon: <Tag className="w-3 h-3" />, color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
  reviewing: { label: '审核中', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  accepted: { label: '已采纳', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  rejected: { label: '已驳回', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  implemented: { label: '已实施', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  low: { label: '低', color: 'text-zinc-400' },
  medium: { label: '中', color: 'text-blue-400' },
  high: { label: '高', color: 'text-orange-400' },
  critical: { label: '紧急', color: 'text-red-400' },
};

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ==================== 主组件 ====================

export default function FeedbackCenter() {
  const toast = useToast();
  const utils = trpc.useUtils();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [selectedFeedback, setSelectedFeedback] = useState<MappedFeedback | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('list');

  // ---------- 新建反馈表单状态 ----------
  const [newType, setNewType] = useState('correction');
  const [newPriority, setNewPriority] = useState('medium');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDiagnosisId, setNewDiagnosisId] = useState('');
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newAlgorithmName, setNewAlgorithmName] = useState('');
  const [newModelVersion, setNewModelVersion] = useState('');
  const [newOriginalPrediction, setNewOriginalPrediction] = useState('');
  const [newCorrectedLabel, setNewCorrectedLabel] = useState('');
  const [newConfidence, setNewConfidence] = useState('');
  const [newTags, setNewTags] = useState('');

  // ---------- tRPC 查询 ----------
  const statsQuery = trpc.evolutionUI.feedback.getStats.useQuery();
  const listQuery = trpc.evolutionUI.feedback.list.useQuery({ limit: 200, offset: 0 });

  const createMutation = trpc.evolutionUI.feedback.create.useMutation({
    onSuccess: () => {
      toast.success('反馈已提交');
      setShowNewDialog(false);
      resetNewForm();
      utils.evolutionUI.feedback.list.invalidate();
      utils.evolutionUI.feedback.getStats.invalidate();
    },
    onError: (err) => {
      toast.error(`提交失败: ${err.message}`);
    },
  });

  const updateStatusMutation = trpc.evolutionUI.feedback.updateStatus.useMutation({
    onSuccess: (_data, variables) => {
      const label = variables.status === 'accepted' ? '已采纳' : variables.status === 'rejected' ? '已驳回' : '审核中';
      toast.success(`反馈${label}`);
      setSelectedFeedback(null);
      utils.evolutionUI.feedback.list.invalidate();
      utils.evolutionUI.feedback.getStats.invalidate();
    },
    onError: (err) => {
      toast.error(`操作失败: ${err.message}`);
    },
  });

  // ---------- 映射 DB 行 → 前端模型 ----------
  const feedbacks: MappedFeedback[] = useMemo(() => {
    return (listQuery.data?.items ?? []).map(row => {
      const d = (row.eventData ?? {}) as Record<string, any>;
      return {
        id: row.id,
        type: d.type ?? 'correction',
        status: d.status ?? 'pending',
        priority: d.priority ?? 'medium',
        title: d.title ?? '',
        description: d.description ?? '',
        diagnosisId: d.diagnosisId,
        deviceName: d.deviceName,
        algorithmName: d.algorithmName,
        modelVersion: d.modelVersion,
        submittedBy: d.submittedBy ?? '系统',
        submittedAt: d.createdAt ?? row.createdAt,
        reviewedBy: d.reviewedBy,
        reviewedAt: d.reviewedAt,
        tags: Array.isArray(d.tags) ? d.tags : [],
        originalPrediction: d.originalPrediction,
        correctedLabel: d.correctedLabel,
        confidence: d.confidence,
      };
    });
  }, [listQuery.data]);

  // ---------- 统计（来自服务端） ----------
  const stats = {
    total: statsQuery.data?.total ?? 0,
    pending: statsQuery.data?.pending ?? 0,
    accepted: statsQuery.data?.accepted ?? 0,
    rate: statsQuery.data?.rate ?? 0,
  };

  // ---------- 客户端过滤 ----------
  const filtered = useMemo(() => {
    let list = feedbacks;
    if (search) list = list.filter(f => f.title.includes(search) || f.description.includes(search) || f.tags.some(t => t.includes(search)));
    if (filterType !== 'all') list = list.filter(f => f.type === filterType);
    if (filterStatus !== 'all') list = list.filter(f => f.status === filterStatus);
    if (filterPriority !== 'all') list = list.filter(f => f.priority === filterPriority);
    return list;
  }, [feedbacks, search, filterType, filterStatus, filterPriority]);

  // 按类型统计（基于实际数据）
  const typeStats = useMemo(() => {
    const map: Record<string, number> = {};
    feedbacks.forEach(f => { map[f.type] = (map[f.type] || 0) + 1; });
    return map;
  }, [feedbacks]);

  // ---------- 新建表单重置 ----------
  function resetNewForm() {
    setNewType('correction');
    setNewPriority('medium');
    setNewTitle('');
    setNewDescription('');
    setNewDiagnosisId('');
    setNewDeviceName('');
    setNewAlgorithmName('');
    setNewModelVersion('');
    setNewOriginalPrediction('');
    setNewCorrectedLabel('');
    setNewConfidence('');
    setNewTags('');
  }

  // ---------- 提交新反馈 ----------
  function handleCreateSubmit() {
    if (!newTitle.trim()) {
      toast.warning('请输入标题');
      return;
    }
    if (!newDescription.trim()) {
      toast.warning('请输入描述');
      return;
    }
    const tags = newTags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    const confidenceNum = newConfidence ? parseFloat(newConfidence) : undefined;

    createMutation.mutate({
      type: newType,
      priority: newPriority,
      title: newTitle.trim(),
      description: newDescription.trim(),
      diagnosisId: newDiagnosisId.trim() || undefined,
      deviceName: newDeviceName.trim() || undefined,
      algorithmName: newAlgorithmName.trim() || undefined,
      modelVersion: newModelVersion.trim() || undefined,
      originalPrediction: newOriginalPrediction.trim() || undefined,
      correctedLabel: newCorrectedLabel.trim() || undefined,
      confidence: confidenceNum && !isNaN(confidenceNum) ? confidenceNum : undefined,
      tags,
    });
  }

  // ---------- 处理反馈状态更新 ----------
  function handleAccept(fb: MappedFeedback) {
    updateStatusMutation.mutate({ id: fb.id, status: 'accepted', reviewedBy: '当前用户' });
  }

  function handleReject(fb: MappedFeedback) {
    updateStatusMutation.mutate({ id: fb.id, status: 'rejected', reviewedBy: '当前用户' });
  }

  // ---------- 加载中 ----------
  const isLoading = listQuery.isLoading || statsQuery.isLoading;

  return (
    <MainLayout title="反馈中心">
      <div className="animate-fade-up">
        {/* 页头 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold mb-1">反馈中心</h2>
            <p className="text-xs text-muted-foreground">收集诊断结果反馈，驱动模型持续进化</p>
          </div>
          <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setShowNewDialog(true)}>
            <MessageSquarePlus className="w-3.5 h-3.5" />
            新建反馈
          </Button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <StatCard value={isLoading ? '...' : stats.total} label="总反馈" icon="📥" />
          <StatCard value={isLoading ? '...' : stats.pending} label="待处理" icon="⏳" />
          <StatCard value={isLoading ? '...' : stats.accepted} label="已采纳" icon="✅" />
          <StatCard value={isLoading ? '...' : `${stats.rate}%`} label="采纳率" icon="📊" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-3">
            <TabsTrigger value="list" className="text-xs gap-1"><Filter className="w-3 h-3" /> 反馈列表</TabsTrigger>
            <TabsTrigger value="analysis" className="text-xs gap-1"><BarChart3 className="w-3 h-3" /> 趋势分析</TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            {/* 过滤栏 */}
            <PageCard className="mb-3">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="搜索反馈..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 h-7 text-xs"
                  />
                </div>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-28 h-7 text-xs"><SelectValue placeholder="类型" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部类型</SelectItem>
                    {Object.entries(typeConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-28 h-7 text-xs"><SelectValue placeholder="状态" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    {Object.entries(statusConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterPriority} onValueChange={setFilterPriority}>
                  <SelectTrigger className="w-28 h-7 text-xs"><SelectValue placeholder="优先级" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部优先级</SelectItem>
                    {Object.entries(priorityConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </PageCard>

            {/* 反馈列表 */}
            {listQuery.isLoading ? (
              <PageCard>
                <div className="text-center py-8 text-muted-foreground text-xs">
                  加载反馈数据中...
                </div>
              </PageCard>
            ) : (
              <div className="space-y-2">
                {filtered.map(fb => (
                  <PageCard
                    key={fb.id}
                    className="cursor-pointer hover:border-primary/30 transition-all"
                    onClick={() => setSelectedFeedback(fb)}
                  >
                    <div className="flex items-start gap-3">
                      {/* 优先级指示器 */}
                      <div className={cn(
                        "w-1 self-stretch rounded-full shrink-0",
                        fb.priority === 'critical' ? 'bg-red-500' :
                        fb.priority === 'high' ? 'bg-orange-500' :
                        fb.priority === 'medium' ? 'bg-blue-500' : 'bg-zinc-600'
                      )} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={cn("text-[10px] gap-1", typeConfig[fb.type]?.color)}>
                            {typeConfig[fb.type]?.icon}
                            {typeConfig[fb.type]?.label}
                          </Badge>
                          <Badge variant="outline" className={cn("text-[10px]", statusConfig[fb.status]?.color)}>
                            {statusConfig[fb.status]?.label}
                          </Badge>
                          <span className={cn("text-[10px] font-medium", priorityConfig[fb.priority]?.color)}>
                            P:{priorityConfig[fb.priority]?.label}
                          </span>
                        </div>

                        <h4 className="text-xs font-semibold text-foreground mb-1">{fb.title}</h4>
                        <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">{fb.description}</p>

                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          {fb.deviceName && <span>🔧 {fb.deviceName}</span>}
                          {fb.algorithmName && <span>⚙️ {fb.algorithmName}</span>}
                          <span>👤 {fb.submittedBy}</span>
                          <span><Clock className="w-2.5 h-2.5 inline mr-0.5" />{formatTime(fb.submittedAt)}</span>
                        </div>

                        {/* 预测修正对比 */}
                        {fb.originalPrediction && fb.correctedLabel && (
                          <div className="flex items-center gap-2 mt-2 p-1.5 bg-secondary/50 rounded text-[10px]">
                            <span className="text-red-400 line-through">{fb.originalPrediction}</span>
                            <ArrowUpRight className="w-3 h-3 text-muted-foreground" />
                            <span className="text-emerald-400 font-medium">{fb.correctedLabel}</span>
                            {fb.confidence && (
                              <span className="text-muted-foreground ml-auto">置信度: {(fb.confidence * 100).toFixed(0)}%</span>
                            )}
                          </div>
                        )}

                        {/* 标签 */}
                        {fb.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {fb.tags.map(tag => (
                              <span key={tag} className="px-1.5 py-0.5 bg-secondary rounded text-[10px] text-muted-foreground">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </PageCard>
                ))}

                {filtered.length === 0 && (
                  <PageCard>
                    <div className="text-center py-8 text-muted-foreground text-xs">
                      暂无匹配的反馈记录
                    </div>
                  </PageCard>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="analysis">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* 按类型分布 */}
              <PageCard title="按类型分布" icon="📊">
                <div className="space-y-2">
                  {Object.entries(typeConfig).map(([key, cfg]) => {
                    const count = typeStats[key] || 0;
                    const total = feedbacks.length;
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-[10px] gap-1 w-20 justify-center", cfg.color)}>
                          {cfg.icon}{cfg.label}
                        </Badge>
                        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/60 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </PageCard>

              {/* 按状态分布 */}
              <PageCard title="按状态分布" icon="📈">
                <div className="space-y-2">
                  {Object.entries(statusConfig).map(([key, cfg]) => {
                    const count = feedbacks.filter(f => f.status === key).length;
                    const total = feedbacks.length;
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-[10px] w-16 justify-center", cfg.color)}>
                          {cfg.label}
                        </Badge>
                        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/60 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </PageCard>

              {/* 高影响反馈 */}
              <PageCard title="高影响反馈" icon="🔥" className="md:col-span-2">
                <div className="space-y-2">
                  {feedbacks
                    .filter(f => f.priority === 'critical' || f.priority === 'high')
                    .map(fb => (
                      <div
                        key={fb.id}
                        className="flex items-center gap-3 p-2 bg-secondary/30 rounded-lg cursor-pointer hover:bg-secondary/50 transition-colors"
                        onClick={() => { setSelectedFeedback(fb); setActiveTab('list'); }}
                      >
                        <span className={cn("text-[10px] font-bold", priorityConfig[fb.priority]?.color)}>
                          {fb.priority === 'critical' ? '🔴' : '🟠'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-foreground truncate">{fb.title}</div>
                          <div className="text-[10px] text-muted-foreground">{fb.deviceName || '全局'} · {fb.submittedBy}</div>
                        </div>
                        <Badge variant="outline" className={cn("text-[10px]", statusConfig[fb.status]?.color)}>
                          {statusConfig[fb.status]?.label}
                        </Badge>
                      </div>
                    ))}
                  {feedbacks.filter(f => f.priority === 'critical' || f.priority === 'high').length === 0 && (
                    <div className="text-center py-4 text-muted-foreground text-xs">暂无高影响反馈</div>
                  )}
                </div>
              </PageCard>

              {/* 模型影响评估（静态派生分析视图） */}
              <PageCard title="受影响模型" icon="🧠" className="md:col-span-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">模型版本</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium">反馈数</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium">误报</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium">漏检</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium">修正</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium">建议重训</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { model: 'bearing-fault-v3.2', total: 3, fp: 1, fn: 0, corr: 1, retrain: true },
                        { model: 'anomaly-v4.1', total: 2, fp: 0, fn: 1, corr: 0, retrain: true },
                        { model: 'gearbox-v2.5', total: 1, fp: 0, fn: 0, corr: 1, retrain: false },
                        { model: 'rotating-v1.8', total: 1, fp: 0, fn: 0, corr: 1, retrain: false },
                      ].map(row => (
                        <tr key={row.model} className="border-b border-border/50 hover:bg-secondary/30">
                          <td className="py-1.5 px-2 font-mono text-foreground">{row.model}</td>
                          <td className="text-center py-1.5 px-2">{row.total}</td>
                          <td className="text-center py-1.5 px-2 text-amber-400">{row.fp}</td>
                          <td className="text-center py-1.5 px-2 text-red-400">{row.fn}</td>
                          <td className="text-center py-1.5 px-2 text-blue-400">{row.corr}</td>
                          <td className="text-center py-1.5 px-2">
                            {row.retrain ? (
                              <Badge variant="outline" className="text-[10px] bg-orange-500/15 text-orange-400 border-orange-500/30">建议</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </PageCard>
            </div>
          </TabsContent>
        </Tabs>

        {/* 反馈详情弹窗 */}
        <Dialog open={!!selectedFeedback} onOpenChange={() => setSelectedFeedback(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                <Eye className="w-4 h-4" />
                反馈详情
              </DialogTitle>
            </DialogHeader>
            {selectedFeedback && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[10px] gap-1", typeConfig[selectedFeedback.type]?.color)}>
                    {typeConfig[selectedFeedback.type]?.icon}
                    {typeConfig[selectedFeedback.type]?.label}
                  </Badge>
                  <Badge variant="outline" className={cn("text-[10px]", statusConfig[selectedFeedback.status]?.color)}>
                    {statusConfig[selectedFeedback.status]?.label}
                  </Badge>
                  <span className={cn("text-[10px] font-medium", priorityConfig[selectedFeedback.priority]?.color)}>
                    优先级: {priorityConfig[selectedFeedback.priority]?.label}
                  </span>
                </div>

                <h3 className="text-sm font-semibold">{selectedFeedback.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{selectedFeedback.description}</p>

                {/* 诊断上下文 */}
                <div className="bg-secondary/50 rounded-lg p-3 space-y-1.5 text-[11px]">
                  <div className="text-xs font-semibold text-foreground mb-2">诊断上下文</div>
                  {selectedFeedback.diagnosisId && (
                    <div className="flex justify-between"><span className="text-muted-foreground">诊断ID</span><span className="font-mono">{selectedFeedback.diagnosisId}</span></div>
                  )}
                  {selectedFeedback.deviceName && (
                    <div className="flex justify-between"><span className="text-muted-foreground">设备</span><span>{selectedFeedback.deviceName}</span></div>
                  )}
                  {selectedFeedback.algorithmName && (
                    <div className="flex justify-between"><span className="text-muted-foreground">算法</span><span>{selectedFeedback.algorithmName}</span></div>
                  )}
                  {selectedFeedback.modelVersion && (
                    <div className="flex justify-between"><span className="text-muted-foreground">模型版本</span><span className="font-mono">{selectedFeedback.modelVersion}</span></div>
                  )}
                </div>

                {/* 预测修正 */}
                {selectedFeedback.originalPrediction && (
                  <div className="bg-secondary/50 rounded-lg p-3 text-[11px]">
                    <div className="text-xs font-semibold text-foreground mb-2">预测修正</div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 text-center p-2 bg-red-500/10 rounded border border-red-500/20">
                        <div className="text-[10px] text-muted-foreground mb-0.5">原始预测</div>
                        <div className="text-red-400 font-medium">{selectedFeedback.originalPrediction}</div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 text-center p-2 bg-emerald-500/10 rounded border border-emerald-500/20">
                        <div className="text-[10px] text-muted-foreground mb-0.5">修正标签</div>
                        <div className="text-emerald-400 font-medium">{selectedFeedback.correctedLabel}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 时间线 */}
                <div className="text-[11px] space-y-1 text-muted-foreground">
                  <div>提交: {selectedFeedback.submittedBy} · {formatTime(selectedFeedback.submittedAt)}</div>
                  {selectedFeedback.reviewedBy && (
                    <div>审核: {selectedFeedback.reviewedBy} · {formatTime(selectedFeedback.reviewedAt!)}</div>
                  )}
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              {selectedFeedback?.status === 'pending' && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 gap-1 text-emerald-400 border-emerald-500/30"
                    disabled={updateStatusMutation.isPending}
                    onClick={() => handleAccept(selectedFeedback)}
                  >
                    <ThumbsUp className="w-3 h-3" /> 采纳
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 gap-1 text-red-400 border-red-500/30"
                    disabled={updateStatusMutation.isPending}
                    onClick={() => handleReject(selectedFeedback)}
                  >
                    <ThumbsDown className="w-3 h-3" /> 驳回
                  </Button>
                </>
              )}
              <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => setSelectedFeedback(null)}>
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 新建反馈弹窗 */}
        <Dialog open={showNewDialog} onOpenChange={(open) => { setShowNewDialog(open); if (!open) resetNewForm(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                <MessageSquarePlus className="w-4 h-4" />
                新建反馈
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">反馈类型</label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">优先级</label>
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorityConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">标题</label>
                <Input className="h-7 text-xs" placeholder="简要描述反馈内容..." value={newTitle} onChange={e => setNewTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">详细描述</label>
                <Textarea className="text-xs min-h-[80px]" placeholder="请详细描述问题现象、现场情况和修正建议..." value={newDescription} onChange={e => setNewDescription(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">关联诊断ID</label>
                  <Input className="h-7 text-xs" placeholder="diag-..." value={newDiagnosisId} onChange={e => setNewDiagnosisId(e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">设备名称</label>
                  <Input className="h-7 text-xs" placeholder="设备名称..." value={newDeviceName} onChange={e => setNewDeviceName(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">算法名称</label>
                  <Input className="h-7 text-xs" placeholder="算法名称..." value={newAlgorithmName} onChange={e => setNewAlgorithmName(e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">模型版本</label>
                  <Input className="h-7 text-xs" placeholder="模型版本..." value={newModelVersion} onChange={e => setNewModelVersion(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">原始预测</label>
                  <Input className="h-7 text-xs" placeholder="模型原始预测..." value={newOriginalPrediction} onChange={e => setNewOriginalPrediction(e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">修正标签</label>
                  <Input className="h-7 text-xs" placeholder="正确标签..." value={newCorrectedLabel} onChange={e => setNewCorrectedLabel(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">置信度 (0-1)</label>
                  <Input className="h-7 text-xs" placeholder="0.85" value={newConfidence} onChange={e => setNewConfidence(e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">标签（逗号分隔）</label>
                  <Input className="h-7 text-xs" placeholder="轴承, 误报, ..." value={newTags} onChange={e => setNewTags(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => { setShowNewDialog(false); resetNewForm(); }}>取消</Button>
              <Button
                size="sm"
                className="text-xs h-7 gap-1"
                disabled={createMutation.isPending}
                onClick={handleCreateSubmit}
              >
                <Send className="w-3 h-3" /> {createMutation.isPending ? '提交中...' : '提交'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
