/**
 * 标注管理 — 进化引擎
 *
 * P1-2 补充：自动标注管线闭环的前端管理页面
 *
 * 功能：
 * 1. 标注概览（统计卡片：待审核/已通过/已拒绝/人工标注）
 * 2. 标注列表（设备编码、故障类型、置信度、标注来源、状态）
 * 3. 审核操作（通过/拒绝/人工修改）
 * 4. 审计记录查看
 *
 * 数据来源：trpc.evolutionUI.labeling.*（已移除全部 mock 数据）
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
  Tag, CheckCircle2, XCircle, Clock, Search, Eye, Edit3,
  AlertTriangle, Cpu, Brain, BookOpen, ArrowRight, Filter,
  FileText, History, ThumbsUp, ThumbsDown, BarChart3, Loader2
} from 'lucide-react';
import { useToast } from '@/components/common/Toast';
import { StatusBadge, MetricCard } from '@/components/evolution';
import { trpc } from '@/lib/trpc';

// ==================== 类型 ====================

type LabelStatus = 'approved' | 'pending' | 'rejected' | 'auto_only' | 'manual_required';
type LabelSource = 'grok' | 'llm' | 'rule_matrix' | 'manual';

/** Mapped from DB dataSlices row for display */
interface MappedLabelRecord {
  sliceId: string;
  deviceCode: string;
  faultType: string;
  faultCode: string;
  severity: string;
  confidence: number;
  labelSource: LabelSource;
  labelStatus: LabelStatus;
  rootCause: string;
  suggestedFix: string;
  createdAt: Date | string | null;
}

// ==================== 工具函数 ====================

const statusLabels: Record<LabelStatus, string> = {
  approved: '已通过',
  pending: '待审核',
  rejected: '已拒绝',
  auto_only: '自动标注',
  manual_required: '需人工标注',
};

const sourceLabels: Record<LabelSource, string> = {
  grok: 'Grok AI',
  llm: 'LLM 降级',
  rule_matrix: '规则矩阵',
  manual: '人工标注',
};

const sourceIcons: Record<LabelSource, React.ReactNode> = {
  grok: <Brain className="w-3.5 h-3.5" />,
  llm: <Cpu className="w-3.5 h-3.5" />,
  rule_matrix: <BookOpen className="w-3.5 h-3.5" />,
  manual: <Edit3 className="w-3.5 h-3.5" />,
};

const severityStyles: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10',
  warning: 'text-amber-400 bg-amber-500/10',
  info: 'text-sky-400 bg-sky-500/10',
  normal: 'text-emerald-400 bg-emerald-500/10',
};

const severityLabels: Record<string, string> = {
  critical: '严重',
  warning: '警告',
  info: '提示',
  normal: '正常',
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.85 ? 'bg-emerald-500' : value >= 0.6 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-400 tabular-nums w-10">{pct}%</span>
    </div>
  );
}

function SourceBadge({ source }: { source: LabelSource }) {
  const styles: Record<LabelSource, string> = {
    grok: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    llm: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    rule_matrix: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    manual: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border', styles[source] ?? styles.manual)}>
      {sourceIcons[source]}
      {sourceLabels[source] ?? source}
    </span>
  );
}

// ==================== 主组件 ====================

export default function LabelingManager() {
  const [tab, setTab] = useState('labels');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<MappedLabelRecord | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [correctedFaultType, setCorrectedFaultType] = useState('');
  const toast = useToast();

  const utils = trpc.useUtils();

  // ━━━ 数据查询 ━━━

  // 统计数据
  const statsQuery = trpc.evolutionUI.labeling.getStats.useQuery();

  // 标注列表
  const listQuery = trpc.evolutionUI.labeling.list.useQuery({
    limit: 200,
  });

  // 审计记录
  const auditQuery = trpc.evolutionUI.labeling.auditTrail.useQuery({
    limit: 100,
  });

  // 审核 mutation
  const reviewMutation = trpc.evolutionUI.labeling.review.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        const actionLabel = data.newStatus === 'approved' ? '通过' : '拒绝';
        toast.success(`标注 ${selectedLabel?.sliceId} 已${actionLabel}`);
        // Invalidate related queries
        utils.evolutionUI.labeling.list.invalidate();
        utils.evolutionUI.labeling.getStats.invalidate();
        utils.evolutionUI.labeling.auditTrail.invalidate();
      } else {
        toast.error('审核操作失败，请重试');
      }
      setReviewDialogOpen(false);
      setReviewReason('');
      setCorrectedFaultType('');
    },
    onError: () => {
      toast.error('审核操作失败，请重试');
    },
  });

  // ━━━ 映射 DB 行到显示格式 ━━━

  const labelRecords: MappedLabelRecord[] = useMemo(() => {
    return (listQuery.data?.items ?? []).map(row => {
      const labelsData = (row.labels ?? {}) as Record<string, any>;
      return {
        sliceId: row.sliceId,
        deviceCode: row.deviceCode ?? '',
        faultType: labelsData.faultType ?? row.faultTypeCode ?? '\u2014',
        faultCode: labelsData.faultCode ?? row.faultTypeCode ?? '\u2014',
        severity: labelsData.severity ?? 'info',
        confidence: labelsData.confidence ?? row.qualityScore ?? 0,
        labelSource: (labelsData.source ?? 'rule_matrix') as LabelSource,
        labelStatus: (row.labelStatus ?? 'pending') as LabelStatus,
        rootCause: labelsData.rootCause ?? '',
        suggestedFix: labelsData.suggestedFix ?? '',
        createdAt: row.createdAt,
      };
    });
  }, [listQuery.data]);

  // ━━━ 客户端过滤 ━━━

  const filteredLabels = useMemo(() => {
    return labelRecords.filter(l => {
      if (statusFilter !== 'all' && l.labelStatus !== statusFilter) return false;
      if (sourceFilter !== 'all' && l.labelSource !== sourceFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return l.deviceCode.toLowerCase().includes(q)
          || l.faultType.toLowerCase().includes(q)
          || l.faultCode.toLowerCase().includes(q);
      }
      return true;
    });
  }, [labelRecords, statusFilter, sourceFilter, searchQuery]);

  // ━━━ 统计 ━━━

  const stats = statsQuery.data ?? {
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    manualRequired: 0,
    avgConfidence: 0,
  };

  // ━━━ 审核操作 ━━━

  const handleReview = (action: 'approve' | 'reject') => {
    if (!selectedLabel) return;
    reviewMutation.mutate({
      sliceId: selectedLabel.sliceId,
      action,
      reason: reviewReason || undefined,
      correctedFaultType: correctedFaultType || undefined,
      reviewedBy: '当前用户',
    });
  };

  // 打开审核弹窗
  const openReview = (label: MappedLabelRecord) => {
    setSelectedLabel(label);
    setReviewReason('');
    setCorrectedFaultType('');
    setReviewDialogOpen(true);
  };

  // 打开详情弹窗
  const openDetail = (label: MappedLabelRecord) => {
    setSelectedLabel(label);
    setDetailDialogOpen(true);
  };

  const isLoading = listQuery.isLoading || statsQuery.isLoading;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">标注管理</h1>
            <p className="text-sm text-zinc-500 mt-1">
              自动标注管线闭环 — Grok/LLM/规则矩阵三层降级 · 置信度分级审核 · 知识图谱反馈
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> 自动入库 ≥85%
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> 待确认 60~85%
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" /> 人工标注 &lt;60%
            </span>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <MetricCard label="总标注数" value={stats.total} icon={<Tag className="w-4 h-4" />} />
          <MetricCard label="已通过" value={stats.approved} icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} />
          <MetricCard label="待审核" value={stats.pending} icon={<Clock className="w-4 h-4 text-amber-400" />} />
          <MetricCard label="已拒绝" value={stats.rejected} icon={<XCircle className="w-4 h-4 text-red-400" />} />
          <MetricCard label="需人工" value={stats.manualRequired} icon={<Edit3 className="w-4 h-4 text-sky-400" />} />
          <MetricCard label="平均置信度" value={`${Math.round(stats.avgConfidence * 100)}%`} icon={<BarChart3 className="w-4 h-4" />} />
        </div>

        {/* Tab 切换 */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="labels" className="gap-1">
              <Tag className="w-3.5 h-3.5" /> 标注列表
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1">
              <History className="w-3.5 h-3.5" /> 审计记录
            </TabsTrigger>
          </TabsList>

          {/* ━━━ 标注列表 Tab ━━━ */}
          <TabsContent value="labels" className="mt-4">
            <PageCard>
              {/* 过滤器 */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-[320px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <Input
                    placeholder="搜索设备编码 / 故障类型 ..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9 bg-zinc-900/50 border-zinc-700"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px] bg-zinc-900/50 border-zinc-700">
                    <SelectValue placeholder="状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="pending">待审核</SelectItem>
                    <SelectItem value="approved">已通过</SelectItem>
                    <SelectItem value="rejected">已拒绝</SelectItem>
                    <SelectItem value="manual_required">需人工标注</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-[140px] bg-zinc-900/50 border-zinc-700">
                    <SelectValue placeholder="来源" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部来源</SelectItem>
                    <SelectItem value="grok">Grok AI</SelectItem>
                    <SelectItem value="llm">LLM 降级</SelectItem>
                    <SelectItem value="rule_matrix">规则矩阵</SelectItem>
                    <SelectItem value="manual">人工标注</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-zinc-500">
                  共 {filteredLabels.length} 条
                </span>
              </div>

              {/* Loading state */}
              {listQuery.isLoading && (
                <div className="flex items-center justify-center py-16 text-zinc-500 text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  加载标注数据中...
                </div>
              )}

              {/* 标注表格 */}
              {!listQuery.isLoading && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                        <th className="text-left py-2 px-3 font-medium">设备编码</th>
                        <th className="text-left py-2 px-3 font-medium">故障类型</th>
                        <th className="text-left py-2 px-3 font-medium">严重度</th>
                        <th className="text-left py-2 px-3 font-medium">置信度</th>
                        <th className="text-left py-2 px-3 font-medium">标注来源</th>
                        <th className="text-left py-2 px-3 font-medium">状态</th>
                        <th className="text-left py-2 px-3 font-medium">时间</th>
                        <th className="text-right py-2 px-3 font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLabels.map(label => (
                        <tr
                          key={label.sliceId}
                          className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                        >
                          <td className="py-3 px-3">
                            <div>
                              <div className="text-zinc-200 font-mono text-xs">{label.deviceCode}</div>
                              <div className="text-[11px] text-zinc-500 mt-0.5 font-mono">{label.sliceId}</div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div>
                              <div className="text-zinc-200">{label.faultType}</div>
                              <div className="text-[11px] text-zinc-500 font-mono mt-0.5">{label.faultCode}</div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className={cn('inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded', severityStyles[label.severity] ?? severityStyles.info)}>
                              {severityLabels[label.severity] ?? label.severity}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <ConfidenceBar value={label.confidence} />
                          </td>
                          <td className="py-3 px-3">
                            <SourceBadge source={label.labelSource} />
                          </td>
                          <td className="py-3 px-3">
                            <StatusBadge status={label.labelStatus} />
                          </td>
                          <td className="py-3 px-3 text-xs text-zinc-500 whitespace-nowrap">
                            {label.createdAt
                              ? new Date(label.createdAt).toLocaleString('zh-CN', {
                                  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                                })
                              : '\u2014'}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openDetail(label)}>
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              {(label.labelStatus === 'pending' || label.labelStatus === 'manual_required') && (
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-amber-400 hover:text-amber-300" onClick={() => openReview(label)}>
                                  <Edit3 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!listQuery.isLoading && filteredLabels.length === 0 && (
                <div className="text-center py-12 text-zinc-500 text-sm">
                  无匹配的标注记录
                </div>
              )}
            </PageCard>
          </TabsContent>

          {/* ━━━ 审计记录 Tab ━━━ */}
          <TabsContent value="audit" className="mt-4">
            <PageCard>
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-zinc-500" />
                <span className="text-sm text-zinc-400">dataSliceLabelHistory 审计记录</span>
                <span className="text-xs text-zinc-600">— 记录每次标注状态变更的完整审计链</span>
              </div>

              {/* Loading state */}
              {auditQuery.isLoading && (
                <div className="flex items-center justify-center py-16 text-zinc-500 text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  加载审计记录中...
                </div>
              )}

              {!auditQuery.isLoading && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                        <th className="text-left py-2 px-3 font-medium">切片 ID</th>
                        <th className="text-left py-2 px-3 font-medium">维度</th>
                        <th className="text-left py-2 px-3 font-medium">旧值</th>
                        <th className="text-center py-2 px-3 font-medium" />
                        <th className="text-left py-2 px-3 font-medium">新值</th>
                        <th className="text-left py-2 px-3 font-medium">来源</th>
                        <th className="text-left py-2 px-3 font-medium">状态</th>
                        <th className="text-left py-2 px-3 font-medium">操作人</th>
                        <th className="text-left py-2 px-3 font-medium">原因</th>
                        <th className="text-left py-2 px-3 font-medium">时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(auditQuery.data?.items ?? []).map(entry => (
                        <tr key={entry.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                          <td className="py-2.5 px-3 text-xs font-mono text-zinc-400">{(entry.sliceId ?? '').replace('slice-', '')}</td>
                          <td className="py-2.5 px-3">
                            <Badge variant="outline" className="text-[10px] border-zinc-700">{entry.dimensionCode}</Badge>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-zinc-500 max-w-[160px] truncate">
                            {entry.oldValue ?? <span className="italic text-zinc-600">{'\u2014'}</span>}
                          </td>
                          <td className="py-2.5 px-1 text-center">
                            <ArrowRight className="w-3 h-3 text-zinc-600 inline" />
                          </td>
                          <td className="py-2.5 px-3 text-xs text-zinc-300 max-w-[200px] truncate">{entry.newValue}</td>
                          <td className="py-2.5 px-3">
                            <span className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded',
                              (entry.labelSource ?? '') === 'grok' ? 'bg-violet-500/15 text-violet-400'
                                : (entry.labelSource ?? '') === 'llm' ? 'bg-sky-500/15 text-sky-400'
                                : (entry.labelSource ?? '').includes('manual') ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-amber-500/15 text-amber-400'
                            )}>
                              {entry.labelSource ?? '\u2014'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusBadge status={entry.reviewStatus ?? 'pending'} />
                          </td>
                          <td className="py-2.5 px-3 text-xs text-zinc-400 whitespace-nowrap">{entry.changedBy}</td>
                          <td className="py-2.5 px-3 text-xs text-zinc-500 max-w-[200px] truncate" title={entry.reason ?? ''}>{entry.reason ?? '\u2014'}</td>
                          <td className="py-2.5 px-3 text-xs text-zinc-500 whitespace-nowrap">
                            {entry.changedAt
                              ? new Date(entry.changedAt).toLocaleString('zh-CN', {
                                  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                                })
                              : '\u2014'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!auditQuery.isLoading && (auditQuery.data?.items ?? []).length === 0 && (
                <div className="text-center py-12 text-zinc-500 text-sm">
                  暂无审计记录
                </div>
              )}
            </PageCard>
          </TabsContent>
        </Tabs>
      </div>

      {/* ━━━ 审核弹窗 ━━━ */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-lg bg-zinc-900 border-zinc-700">
          <DialogHeader>
            <DialogTitle>标注审核</DialogTitle>
          </DialogHeader>
          {selectedLabel && (
            <div className="space-y-4">
              {/* 标注摘要 */}
              <div className="bg-zinc-800/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">设备</span>
                  <span className="text-sm text-zinc-200 font-mono">{selectedLabel.deviceCode}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">故障类型</span>
                  <span className="text-sm text-zinc-200">{selectedLabel.faultType}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">故障编码</span>
                  <span className="text-sm text-zinc-300 font-mono">{selectedLabel.faultCode}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">置信度</span>
                  <ConfidenceBar value={selectedLabel.confidence} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">标注来源</span>
                  <SourceBadge source={selectedLabel.labelSource} />
                </div>
                {selectedLabel.rootCause && (
                  <div className="pt-2 border-t border-zinc-700">
                    <span className="text-xs text-zinc-500">根因分析</span>
                    <p className="text-sm text-zinc-300 mt-1">{selectedLabel.rootCause}</p>
                  </div>
                )}
                {selectedLabel.suggestedFix && (
                  <div>
                    <span className="text-xs text-zinc-500">建议措施</span>
                    <p className="text-sm text-zinc-300 mt-1">{selectedLabel.suggestedFix}</p>
                  </div>
                )}
              </div>

              {/* 修改故障类型（可选） */}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">修正故障类型（留空则不修改）</label>
                <Input
                  value={correctedFaultType}
                  onChange={e => setCorrectedFaultType(e.target.value)}
                  placeholder={selectedLabel.faultType}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>

              {/* 审核原因 */}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">审核意见</label>
                <Textarea
                  value={reviewReason}
                  onChange={e => setReviewReason(e.target.value)}
                  placeholder="请输入审核意见或拒绝原因 ..."
                  rows={3}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" size="sm" className="border-zinc-700" onClick={() => setReviewDialogOpen(false)}>
              取消
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-red-700 text-red-400 hover:bg-red-500/10"
              onClick={() => handleReview('reject')}
              disabled={reviewMutation.isPending}
            >
              {reviewMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ThumbsDown className="w-3.5 h-3.5 mr-1" />} 拒绝
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => handleReview('approve')}
              disabled={reviewMutation.isPending}
            >
              {reviewMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5 mr-1" />} 通过
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ━━━ 详情弹窗 ━━━ */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-xl bg-zinc-900 border-zinc-700">
          <DialogHeader>
            <DialogTitle>标注详情</DialogTitle>
          </DialogHeader>
          {selectedLabel && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-800/50 rounded p-3">
                  <span className="text-[11px] text-zinc-500 block">设备编码</span>
                  <span className="text-sm text-zinc-200 font-mono">{selectedLabel.deviceCode}</span>
                </div>
                <div className="bg-zinc-800/50 rounded p-3">
                  <span className="text-[11px] text-zinc-500 block">切片 ID</span>
                  <span className="text-sm text-zinc-200 font-mono">{selectedLabel.sliceId}</span>
                </div>
                <div className="bg-zinc-800/50 rounded p-3">
                  <span className="text-[11px] text-zinc-500 block">故障类型</span>
                  <span className="text-sm text-zinc-200">{selectedLabel.faultType}</span>
                </div>
                <div className="bg-zinc-800/50 rounded p-3">
                  <span className="text-[11px] text-zinc-500 block">故障编码</span>
                  <span className="text-sm text-zinc-300 font-mono">{selectedLabel.faultCode}</span>
                </div>
                <div className="bg-zinc-800/50 rounded p-3">
                  <span className="text-[11px] text-zinc-500 block">严重度</span>
                  <span className={cn('inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded mt-1', severityStyles[selectedLabel.severity] ?? severityStyles.info)}>
                    {severityLabels[selectedLabel.severity] ?? selectedLabel.severity}
                  </span>
                </div>
                <div className="bg-zinc-800/50 rounded p-3">
                  <span className="text-[11px] text-zinc-500 block">置信度</span>
                  <div className="mt-1">
                    <ConfidenceBar value={selectedLabel.confidence} />
                  </div>
                </div>
                <div className="bg-zinc-800/50 rounded p-3">
                  <span className="text-[11px] text-zinc-500 block">标注来源</span>
                  <div className="mt-1"><SourceBadge source={selectedLabel.labelSource} /></div>
                </div>
                <div className="bg-zinc-800/50 rounded p-3">
                  <span className="text-[11px] text-zinc-500 block">审核状态</span>
                  <div className="mt-1"><StatusBadge status={selectedLabel.labelStatus} /></div>
                </div>
              </div>

              {selectedLabel.rootCause && (
                <div className="bg-zinc-800/50 rounded p-3">
                  <span className="text-[11px] text-zinc-500 block mb-1">根因分析</span>
                  <p className="text-sm text-zinc-300">{selectedLabel.rootCause}</p>
                </div>
              )}
              {selectedLabel.suggestedFix && (
                <div className="bg-zinc-800/50 rounded p-3">
                  <span className="text-[11px] text-zinc-500 block mb-1">建议措施</span>
                  <p className="text-sm text-zinc-300">{selectedLabel.suggestedFix}</p>
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-zinc-500 pt-2 border-t border-zinc-800">
                <span>切片: <span className="font-mono text-zinc-400">{selectedLabel.sliceId}</span></span>
                {selectedLabel.createdAt && (
                  <span>创建时间: <span className="text-zinc-400">{new Date(selectedLabel.createdAt).toLocaleString('zh-CN')}</span></span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
