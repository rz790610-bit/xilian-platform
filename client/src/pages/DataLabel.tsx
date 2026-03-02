/**
 * 数据标注页面
 *
 * 功能：
 * 1. 标注统计概览（总切片/已标注/待标注/进行中/完成率）
 * 2. 数据切片列表（筛选、选择）
 * 3. 标注面板（工况类型/故障类型/严重程度/备注）
 * 4. 审核操作（通过/拒绝）
 * 5. 导出标注数据
 * 6. 标注统计弹窗
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  RefreshCw, Upload, Download, Tag, FileText, Check, Clock,
  Trash2, ChevronRight, BarChart3, Loader2
} from 'lucide-react';
import { useToast } from '@/components/common/Toast';
import { trpc } from '@/lib/trpc';

// ==================== 类型 ====================

type LabelStatusFilter = 'all' | 'auto_only' | 'pending' | 'approved' | 'rejected' | 'manual_required';

/** Mapped from DB dataSlices row for display in this page */
interface MappedSlice {
  sliceId: string;
  deviceCode: string;
  faultTypeCode: string | null;
  workConditionCode: string | null;
  qualityScore: number | null;
  labelStatus: string;
  labels: Record<string, unknown>;
  createdAt: Date | string | null;
  notes: string | null;
  startTime: Date | string;
  durationMs: number | null;
}

// ==================== 标签类型常量 ====================

const LABEL_TYPES = [
  { id: 'normal', name: '正常', color: 'bg-success', description: '设备运行正常' },
  { id: 'warning', name: '预警', color: 'bg-warning', description: '需要关注' },
  { id: 'fault', name: '故障', color: 'bg-danger', description: '设备故障' },
  { id: 'unknown', name: '未知', color: 'bg-muted', description: '无法判断' },
] as const;

// ==================== 工具函数 ====================

const statusDisplayMap: Record<string, { label: string; variant: 'success' | 'warning' | 'default' | 'danger' }> = {
  approved: { label: '已通过', variant: 'success' },
  auto_only: { label: '自动标注', variant: 'warning' },
  pending: { label: '待标注', variant: 'default' },
  rejected: { label: '已拒绝', variant: 'danger' },
  manual_required: { label: '需人工', variant: 'warning' },
};

function getStatusDisplay(status: string) {
  return statusDisplayMap[status] ?? { label: status, variant: 'default' as const };
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '-';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m ${remSec}s`;
}

// ==================== 主组件 ====================

export default function DataLabel() {
  const toast = useToast();
  const utils = trpc.useUtils();

  // ---------- 本地状态 ----------
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<LabelStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showStatsDialog, setShowStatsDialog] = useState(false);

  // 当前标注表单
  const [labelForm, setLabelForm] = useState({
    condition: '',
    faultType: '',
    severity: 'low',
    notes: '',
  });

  // ---------- tRPC 查询 ----------

  // 统计数据
  const statsQuery = trpc.evolutionUI.labeling.getStats.useQuery(undefined, {
    retry: false,
  });

  // 标注列表
  const listQuery = trpc.evolutionUI.labeling.list.useQuery(
    {
      labelStatus: filterStatus === 'all' ? undefined : filterStatus,
      search: searchQuery || undefined,
      limit: 200,
      offset: 0,
    },
    { retry: false },
  );

  // 审计记录（选中切片时加载）
  const auditQuery = trpc.evolutionUI.labeling.auditTrail.useQuery(
    { sliceId: selectedSliceId ?? undefined, limit: 50 },
    { enabled: !!selectedSliceId, retry: false },
  );

  // ---------- tRPC Mutations ----------

  // 审核（通过/拒绝）
  const reviewMutation = trpc.evolutionUI.labeling.review.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        const actionLabel = data.newStatus === 'approved' ? '通过' : '拒绝';
        toast.success(`标注 ${selectedSliceId} 已${actionLabel}`);
        utils.evolutionUI.labeling.list.invalidate();
        utils.evolutionUI.labeling.getStats.invalidate();
        utils.evolutionUI.labeling.auditTrail.invalidate();
      } else {
        toast.error('操作失败，请重试');
      }
    },
    onError: () => {
      toast.error('操作失败，请重试');
    },
  });

  // ---------- 数据映射 ----------

  const slices: MappedSlice[] = useMemo(() => {
    return (listQuery.data?.items ?? []).map((row) => {
      const labelsData = (row.labels ?? {}) as Record<string, unknown>;
      return {
        sliceId: row.sliceId,
        deviceCode: row.deviceCode,
        faultTypeCode: row.faultTypeCode ?? null,
        workConditionCode: row.workConditionCode ?? null,
        qualityScore: row.qualityScore ?? null,
        labelStatus: row.labelStatus,
        labels: labelsData,
        createdAt: row.createdAt,
        notes: row.notes ?? null,
        startTime: row.startTime,
        durationMs: row.durationMs ?? null,
      };
    });
  }, [listQuery.data]);

  const selectedSlice = useMemo(() => {
    if (!selectedSliceId) return null;
    return slices.find((s) => s.sliceId === selectedSliceId) ?? null;
  }, [slices, selectedSliceId]);

  // ---------- 统计计算 ----------

  const stats = useMemo(() => {
    const data = statsQuery.data;
    if (!data) return { total: 0, approved: 0, pending: 0, rejected: 0, manualRequired: 0, progress: 0 };
    const total = data.total;
    const progress = total > 0 ? Math.round((data.approved / total) * 100) : 0;
    return { ...data, progress };
  }, [statsQuery.data]);

  // ---------- 操作函数 ----------

  const selectSlice = (slice: MappedSlice) => {
    setSelectedSliceId(slice.sliceId);
    // Pre-populate form from existing labels
    const labelsData = slice.labels as Record<string, unknown>;
    const rootCause = (labelsData?.root_cause as string) ?? '';
    const condition = rootCause === '正常' || rootCause === '预警' || rootCause === '故障' || rootCause === '未知'
      ? rootCause
      : '';
    setLabelForm({
      condition,
      faultType: slice.faultTypeCode ?? '',
      severity: 'low',
      notes: slice.notes ?? '',
    });
  };

  const saveLabel = () => {
    if (!selectedSlice) return;
    if (!labelForm.condition) {
      toast.error('请选择工况类型');
      return;
    }

    // Use the review mutation to approve with the selected label data
    reviewMutation.mutate({
      sliceId: selectedSlice.sliceId,
      action: 'approve',
      reason: labelForm.notes || `工况: ${labelForm.condition}, 故障类型: ${labelForm.faultType || '无'}, 严重程度: ${labelForm.severity}`,
      correctedFaultType: labelForm.faultType || undefined,
    });

    // Select next pending slice
    const nextPending = slices.find(
      (s) => s.sliceId !== selectedSlice.sliceId && (s.labelStatus === 'pending' || s.labelStatus === 'auto_only'),
    );
    if (nextPending) {
      selectSlice(nextPending);
    } else {
      setSelectedSliceId(null);
    }
  };

  const rejectLabel = () => {
    if (!selectedSlice) return;

    reviewMutation.mutate({
      sliceId: selectedSlice.sliceId,
      action: 'reject',
      reason: labelForm.notes || '审核拒绝',
    });

    // Select next pending slice
    const nextPending = slices.find(
      (s) => s.sliceId !== selectedSlice.sliceId && (s.labelStatus === 'pending' || s.labelStatus === 'auto_only'),
    );
    if (nextPending) {
      selectSlice(nextPending);
    } else {
      setSelectedSliceId(null);
    }
  };

  const skipFile = () => {
    if (!selectedSlice) return;
    const nextPending = slices.find(
      (s) => s.sliceId !== selectedSlice.sliceId && (s.labelStatus === 'pending' || s.labelStatus === 'auto_only'),
    );
    if (nextPending) {
      selectSlice(nextPending);
    } else {
      setSelectedSliceId(null);
      toast.info('没有更多待标注切片');
    }
  };

  const refreshAll = () => {
    utils.evolutionUI.labeling.list.invalidate();
    utils.evolutionUI.labeling.getStats.invalidate();
    toast.info('已刷新列表');
  };

  // 导出标注数据
  const exportLabels = () => {
    const labeledData = slices
      .filter((s) => s.labelStatus === 'approved')
      .map((s) => ({
        sliceId: s.sliceId,
        deviceCode: s.deviceCode,
        faultTypeCode: s.faultTypeCode,
        workConditionCode: s.workConditionCode,
        labelStatus: s.labelStatus,
        labels: s.labels,
        qualityScore: s.qualityScore,
        createdAt: s.createdAt,
      }));

    const blob = new Blob([JSON.stringify(labeledData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `labels_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${labeledData.length} 条标注数据`);
  };

  // 导入标注
  const importLabels = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target?.result as string);
          toast.success(`已导入 ${Array.isArray(data) ? data.length : 0} 条标注数据`);
          // After import, refresh list
          utils.evolutionUI.labeling.list.invalidate();
          utils.evolutionUI.labeling.getStats.invalidate();
        } catch {
          toast.error('导入失败：文件格式错误');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // ---------- 加载/错误状态 ----------

  const isLoading = listQuery.isLoading || statsQuery.isLoading;

  return (
    <MainLayout title="数据标注">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="flex justify-between items-start mb-7">
          <div>
            <h2 className="text-2xl font-bold mb-2">数据标注</h2>
            <p className="text-muted-foreground">为数据切片添加标签，支持审核和批量管理</p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" size="sm" onClick={() => setShowStatsDialog(true)}>
              <BarChart3 className="w-4 h-4 mr-2" />
              标注统计
            </Button>
            <Button variant="secondary" size="sm" onClick={importLabels}>
              <Upload className="w-4 h-4 mr-2" />
              导入标注
            </Button>
            <Button size="sm" onClick={exportLabels}>
              <Download className="w-4 h-4 mr-2" />
              导出标注
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-5 mb-5">
          <StatCard
            value={statsQuery.isLoading ? '...' : stats.total}
            label="总切片"
            icon="📁"
          />
          <StatCard
            value={statsQuery.isLoading ? '...' : stats.approved}
            label="已标注"
            icon="✅"
          />
          <StatCard
            value={statsQuery.isLoading ? '...' : stats.pending}
            label="待标注"
            icon="⏳"
          />
          <StatCard
            value={statsQuery.isLoading ? '...' : stats.manualRequired}
            label="需人工"
            icon="🔄"
          />
          <StatCard
            value={statsQuery.isLoading ? '...' : `${stats.progress}%`}
            label="完成进度"
            icon="📈"
          />
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Slice list */}
          <PageCard
            title="数据切片列表"
            icon="📁"
            action={
              <div className="flex gap-2">
                <Input
                  placeholder="搜索设备编码..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-[140px] h-8 text-sm"
                />
                <Select
                  value={filterStatus}
                  onValueChange={(v) => setFilterStatus(v as LabelStatusFilter)}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="pending">待标注</SelectItem>
                    <SelectItem value="auto_only">自动标注</SelectItem>
                    <SelectItem value="approved">已通过</SelectItem>
                    <SelectItem value="rejected">已拒绝</SelectItem>
                    <SelectItem value="manual_required">需人工</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={refreshAll}>
                  <RefreshCw className={cn("w-4 h-4", listQuery.isFetching && "animate-spin")} />
                </Button>
              </div>
            }
          >
            <div className="max-h-[500px] overflow-y-auto space-y-2">
              {isLoading ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-50" />
                  <p>加载中...</p>
                </div>
              ) : slices.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>暂无数据切片</p>
                </div>
              ) : (
                slices.map((slice) => {
                  const statusInfo = getStatusDisplay(slice.labelStatus);
                  return (
                    <div
                      key={slice.sliceId}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all",
                        "hover:bg-secondary",
                        selectedSliceId === slice.sliceId && "bg-secondary ring-1 ring-primary",
                      )}
                      onClick={() => selectSlice(slice)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center text-lg">
                          📊
                        </div>
                        <div>
                          <div className="font-medium text-sm">{slice.deviceCode}</div>
                          <div className="text-xs text-muted-foreground">
                            {slice.sliceId} | {formatDuration(slice.durationMs)} | {formatDate(slice.startTime)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {slice.qualityScore != null && (
                          <span className="text-xs text-muted-foreground">
                            Q:{Math.round(slice.qualityScore)}
                          </span>
                        )}
                        <Badge variant={statusInfo.variant}>
                          {statusInfo.label}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </PageCard>

          {/* Label panel */}
          <PageCard title="标注面板" icon="🏷️">
            {selectedSlice ? (
              <div className="space-y-5">
                {/* Slice info */}
                <div className="p-4 bg-secondary rounded-xl">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 bg-background rounded-lg flex items-center justify-center text-2xl">
                      📊
                    </div>
                    <div>
                      <div className="font-semibold">{selectedSlice.deviceCode}</div>
                      <div className="text-sm text-muted-foreground">
                        {selectedSlice.sliceId} | {getStatusDisplay(selectedSlice.labelStatus).label}
                      </div>
                    </div>
                  </div>

                  {/* Slice metadata */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">开始时间: </span>
                      {formatDate(selectedSlice.startTime)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">时长: </span>
                      {formatDuration(selectedSlice.durationMs)}
                    </div>
                    {selectedSlice.workConditionCode && (
                      <div>
                        <span className="text-muted-foreground">工况: </span>
                        {selectedSlice.workConditionCode}
                      </div>
                    )}
                    {selectedSlice.faultTypeCode && (
                      <div>
                        <span className="text-muted-foreground">故障码: </span>
                        {selectedSlice.faultTypeCode}
                      </div>
                    )}
                    {selectedSlice.qualityScore != null && (
                      <div>
                        <span className="text-muted-foreground">质量分: </span>
                        {Math.round(selectedSlice.qualityScore)}
                      </div>
                    )}
                  </div>

                  {/* Existing labels */}
                  {Object.keys(selectedSlice.labels).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="text-sm text-muted-foreground mb-2">现有标注数据:</div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(selectedSlice.labels).map(([key, val]) => (
                          <Badge key={key} variant="default">
                            {key}: {String(val)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Audit trail for this slice */}
                  {auditQuery.data && auditQuery.data.items.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="text-sm text-muted-foreground mb-2">审计记录 ({auditQuery.data.items.length}):</div>
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        {auditQuery.data.items.slice(0, 5).map((audit) => (
                          <div key={audit.id} className="text-xs text-muted-foreground flex gap-2">
                            <Clock className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span>
                              {formatDate(audit.changedAt)} | {audit.changedBy}: {audit.oldValue} → {audit.newValue}
                              {audit.reason && ` (${audit.reason})`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Label form */}
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">工况类型 *</label>
                    <div className="grid grid-cols-4 gap-2">
                      {LABEL_TYPES.map((type) => (
                        <Button
                          key={type.id}
                          variant={labelForm.condition === type.name ? 'default' : 'secondary'}
                          size="sm"
                          className={cn(
                            "w-full",
                            labelForm.condition === type.name && type.color,
                          )}
                          onClick={() => setLabelForm((prev) => ({ ...prev, condition: type.name }))}
                        >
                          {type.name}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">故障类型（可选）</label>
                    <Select
                      value={labelForm.faultType}
                      onValueChange={(v) => setLabelForm((prev) => ({ ...prev, faultType: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择故障类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bearing">轴承故障</SelectItem>
                        <SelectItem value="gear">齿轮故障</SelectItem>
                        <SelectItem value="imbalance">不平衡</SelectItem>
                        <SelectItem value="misalignment">不对中</SelectItem>
                        <SelectItem value="looseness">松动</SelectItem>
                        <SelectItem value="other">其他</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">严重程度</label>
                    <Select
                      value={labelForm.severity}
                      onValueChange={(v) => setLabelForm((prev) => ({ ...prev, severity: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">轻微</SelectItem>
                        <SelectItem value="medium">中等</SelectItem>
                        <SelectItem value="high">严重</SelectItem>
                        <SelectItem value="critical">紧急</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">备注</label>
                    <Textarea
                      value={labelForm.notes}
                      onChange={(e) => setLabelForm((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder="添加备注信息..."
                      rows={3}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    className="flex-1"
                    onClick={saveLabel}
                    disabled={reviewMutation.isPending}
                  >
                    {reviewMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4 mr-2" />
                    )}
                    通过并保存
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={rejectLabel}
                    disabled={reviewMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    拒绝
                  </Button>
                  <Button variant="secondary" onClick={skipFile}>
                    跳过
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <Tag className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg mb-2">请从左侧选择要标注的数据切片</p>
                <p className="text-sm">选择后可进行审核和标注操作</p>
              </div>
            )}
          </PageCard>
        </div>

        {/* Quick actions */}
        <PageCard title="快捷操作" icon="⚡" className="mt-5">
          <div className="flex gap-3 flex-wrap">
            <Button variant="secondary" onClick={exportLabels}>
              <Download className="w-4 h-4 mr-2" />
              导出标注数据
            </Button>
            <Button variant="secondary" onClick={importLabels}>
              <Upload className="w-4 h-4 mr-2" />
              导入标注
            </Button>
            <Button variant="secondary" onClick={() => setShowStatsDialog(true)}>
              <BarChart3 className="w-4 h-4 mr-2" />
              标注统计
            </Button>
            <Button variant="secondary" onClick={refreshAll}>
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新数据
            </Button>
          </div>
        </PageCard>
      </div>

      {/* Stats dialog */}
      <Dialog open={showStatsDialog} onOpenChange={setShowStatsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>标注统计</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Overview */}
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 bg-secondary rounded-xl text-center">
                <div className="text-2xl font-bold text-primary">
                  {statsQuery.isLoading ? '...' : stats.total}
                </div>
                <div className="text-sm text-muted-foreground">总切片</div>
              </div>
              <div className="p-4 bg-secondary rounded-xl text-center">
                <div className="text-2xl font-bold text-success">
                  {statsQuery.isLoading ? '...' : stats.approved}
                </div>
                <div className="text-sm text-muted-foreground">已通过</div>
              </div>
              <div className="p-4 bg-secondary rounded-xl text-center">
                <div className="text-2xl font-bold text-warning">
                  {statsQuery.isLoading ? '...' : stats.pending}
                </div>
                <div className="text-sm text-muted-foreground">待标注</div>
              </div>
              <div className="p-4 bg-secondary rounded-xl text-center">
                <div className="text-2xl font-bold">
                  {statsQuery.isLoading ? '...' : `${stats.progress}%`}
                </div>
                <div className="text-sm text-muted-foreground">完成率</div>
              </div>
            </div>

            {/* Label status distribution */}
            <div>
              <h4 className="font-medium mb-3">标注状态分布</h4>
              <div className="space-y-2">
                {[
                  { label: '已通过', key: 'approved', color: 'bg-success' },
                  { label: '待标注', key: 'pending', color: 'bg-warning' },
                  { label: '已拒绝', key: 'rejected', color: 'bg-danger' },
                  { label: '需人工', key: 'manualRequired', color: 'bg-muted' },
                ].map(({ label, key, color }) => {
                  const value = stats[key as keyof typeof stats] as number;
                  const percent = stats.total > 0 ? (value / stats.total) * 100 : 0;

                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-16 text-sm">{label}</span>
                      <div className="flex-1 h-6 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={cn("h-full transition-all", color)}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="w-12 text-sm text-right">{value}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <h4 className="font-medium mb-3">整体进度</h4>
              <div className="h-4 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${stats.progress}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-sm text-muted-foreground">
                <span>已通过 {stats.approved} 个</span>
                <span>剩余 {stats.pending + stats.manualRequired + stats.rejected} 个</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
