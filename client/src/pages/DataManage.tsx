import { useState, useCallback } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import {
  RefreshCw,
  Search,
  Trash2,
  Tag,
  Download,
  Plus,
  Database,
  BarChart3,
  Clock,
  CheckCircle,
  AlertCircle,
  Play,
  GitBranch,
  Layers,
} from 'lucide-react';
import { useToast } from '@/components/common/Toast';

type TabId = 'slices' | 'stats' | 'pipelines';

export default function DataManage() {
  const toast = useToast();

  const [tab, setTab] = useState<TabId>('slices');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [selectedSlices, setSelectedSlices] = useState<string[]>([]);
  const [batchMode, setBatchMode] = useState(false);

  // --- Create slice form state ---
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSlice, setNewSlice] = useState({
    sliceId: '',
    deviceCode: '',
    startTime: '',
    endTime: '',
    workConditionCode: '',
    faultTypeCode: '',
    status: 'raw',
  });

  // --- tRPC Queries ---
  const slicesQuery = trpc.database.slice.listSlices.useQuery(
    {
      page,
      pageSize,
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      ...(searchQuery ? { deviceCode: searchQuery } : {}),
    },
    { placeholderData: keepPreviousData },
  );

  const statsQuery = trpc.database.slice.getSliceStats.useQuery(undefined, {
    enabled: tab === 'stats',
  });

  const dagsQuery = trpc.dataPipeline.getDags.useQuery(undefined, {
    enabled: tab === 'pipelines',
    retry: false,
  });

  // --- tRPC Mutations ---
  const createSliceMutation = trpc.database.slice.createSlice.useMutation({
    onSuccess: () => {
      toast.success('数据切片创建成功');
      slicesQuery.refetch();
      statsQuery.refetch();
      setShowCreateForm(false);
      setNewSlice({
        sliceId: '',
        deviceCode: '',
        startTime: '',
        endTime: '',
        workConditionCode: '',
        faultTypeCode: '',
        status: 'raw',
      });
    },
    onError: (err) => {
      toast.error(`创建失败: ${err.message}`);
    },
  });

  const deleteSliceMutation = trpc.database.slice.deleteSlice.useMutation({
    onSuccess: () => {
      toast.success('数据切片已删除');
      slicesQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err) => {
      toast.error(`删除失败: ${err.message}`);
    },
  });

  const triggerDagMutation = trpc.dataPipeline.triggerDag.useMutation({
    onSuccess: () => {
      toast.success('DAG 已触发');
      dagsQuery.refetch();
    },
    onError: (err) => {
      toast.error(`触发失败: ${err.message}`);
    },
  });

  // --- Derived data ---
  const slices = (slicesQuery.data as any)?.items ?? [];
  const totalSlices = (slicesQuery.data as any)?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalSlices / pageSize));

  // --- Handlers ---
  const toggleSliceSelect = (sliceId: string) => {
    setSelectedSlices((prev) =>
      prev.includes(sliceId) ? prev.filter((id) => id !== sliceId) : [...prev, sliceId],
    );
  };

  const clearSelection = () => setSelectedSlices([]);

  const handleBatchDelete = () => {
    if (selectedSlices.length === 0) return;
    if (!confirm(`确定删除选中的 ${selectedSlices.length} 个切片吗？`)) return;

    selectedSlices.forEach((id) => deleteSliceMutation.mutate({ sliceId: id }));
    clearSelection();
  };

  const handleCreateSlice = () => {
    if (!newSlice.sliceId || !newSlice.deviceCode || !newSlice.startTime || !newSlice.endTime) {
      toast.error('请填写必填字段：切片ID、设备编码、开始时间、结束时间');
      return;
    }
    createSliceMutation.mutate(newSlice);
  };

  const handleRefresh = () => {
    slicesQuery.refetch();
    statsQuery.refetch();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'raw':
        return <Badge variant="secondary">原始</Badge>;
      case 'cleaned':
        return <Badge variant="default">已清洗</Badge>;
      case 'labeled':
        return <Badge className="bg-green-600 text-white">已标注</Badge>;
      case 'archived':
        return <Badge variant="outline">已归档</Badge>;
      default:
        return <Badge variant="secondary">{status || '未知'}</Badge>;
    }
  };

  const getLabelStatusBadge = (labelStatus: string) => {
    switch (labelStatus) {
      case 'unlabeled':
        return <Badge variant="outline">未标注</Badge>;
      case 'auto_labeled':
        return <Badge variant="secondary">自动标注</Badge>;
      case 'manual_verified':
        return <Badge className="bg-green-600 text-white">已审核</Badge>;
      default:
        return <Badge variant="outline">{labelStatus || '-'}</Badge>;
    }
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'slices', label: '数据切片', icon: <Layers className="w-4 h-4" /> },
    { id: 'stats', label: '切片统计', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'pipelines', label: '数据管道', icon: <GitBranch className="w-4 h-4" /> },
  ];

  return (
    <MainLayout title="数据管理">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="flex justify-between items-start mb-7">
          <div>
            <h2 className="text-2xl font-bold mb-2">数据管理</h2>
            <p className="text-muted-foreground">
              数据切片管理、质量统计、管道编排
            </p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setShowCreateForm(!showCreateForm)}>
              <Plus className="w-4 h-4 mr-2" />
              新建切片
            </Button>
            <Button variant="ghost" size="icon" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 border-b pb-0 mb-5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1 px-4 py-2 text-sm border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ====== TAB: Slices ====== */}
        {tab === 'slices' && (
          <>
            {/* Create slice form */}
            {showCreateForm && (
              <PageCard className="mb-5" title="新建数据切片" icon={<Plus className="w-4 h-4" />}>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">切片ID *</label>
                    <Input
                      value={newSlice.sliceId}
                      onChange={(e) => setNewSlice({ ...newSlice, sliceId: e.target.value })}
                      placeholder="如: SLC-2026-001"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">设备编码 *</label>
                    <Input
                      value={newSlice.deviceCode}
                      onChange={(e) => setNewSlice({ ...newSlice, deviceCode: e.target.value })}
                      placeholder="如: QC-SH-001"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">开始时间 *</label>
                    <Input
                      type="datetime-local"
                      value={newSlice.startTime}
                      onChange={(e) => setNewSlice({ ...newSlice, startTime: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">结束时间 *</label>
                    <Input
                      type="datetime-local"
                      value={newSlice.endTime}
                      onChange={(e) => setNewSlice({ ...newSlice, endTime: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">工况编码</label>
                    <Input
                      value={newSlice.workConditionCode}
                      onChange={(e) =>
                        setNewSlice({ ...newSlice, workConditionCode: e.target.value })
                      }
                      placeholder="可选"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">故障类型编码</label>
                    <Input
                      value={newSlice.faultTypeCode}
                      onChange={(e) =>
                        setNewSlice({ ...newSlice, faultTypeCode: e.target.value })
                      }
                      placeholder="可选"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button onClick={handleCreateSlice} disabled={createSliceMutation.isPending}>
                    {createSliceMutation.isPending ? '创建中...' : '确认创建'}
                  </Button>
                  <Button variant="secondary" onClick={() => setShowCreateForm(false)}>
                    取消
                  </Button>
                </div>
              </PageCard>
            )}

            {/* Search and filter */}
            <PageCard className="mb-5">
              <div className="flex gap-3 items-center flex-wrap">
                <div className="flex-1 min-w-[300px] relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="按设备编码搜索..."
                    className="pl-10"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="raw">原始</SelectItem>
                    <SelectItem value="cleaned">已清洗</SelectItem>
                    <SelectItem value="labeled">已标注</SelectItem>
                    <SelectItem value="archived">已归档</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </PageCard>

            {/* Batch action bar */}
            {batchMode && selectedSlices.length > 0 && (
              <div className="flex items-center gap-4 p-4 bg-primary/10 rounded-xl mb-5">
                <span className="text-sm">已选择 {selectedSlices.length} 个切片</span>
                <div className="flex gap-2 ml-auto">
                  <Button variant="secondary" size="sm" onClick={() => toast.info('标签功能开发中')}>
                    <Tag className="w-4 h-4 mr-1" />
                    打标签
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => toast.info('导出功能开发中')}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    导出
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleBatchDelete}>
                    <Trash2 className="w-4 h-4 mr-1" />
                    删除
                  </Button>
                </div>
              </div>
            )}

            {/* Slice list */}
            <PageCard
              title={`数据切片 (${totalSlices})`}
              icon={<Layers className="w-4 h-4" />}
              action={
                <Button
                  variant={batchMode ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => {
                    setBatchMode(!batchMode);
                    if (batchMode) clearSelection();
                  }}
                >
                  {batchMode ? '取消批量' : '批量操作'}
                </Button>
              }
            >
              {slicesQuery.isLoading ? (
                <div className="text-center py-12 text-muted-foreground">加载中...</div>
              ) : slices.length > 0 ? (
                <div className="space-y-2">
                  {slices.map((slice: any) => (
                    <div
                      key={slice.sliceId}
                      className={cn(
                        'flex items-center gap-4 p-4 bg-secondary rounded-xl transition-colors',
                        selectedSlices.includes(slice.sliceId) && 'bg-primary/20',
                      )}
                    >
                      {batchMode && (
                        <Checkbox
                          checked={selectedSlices.includes(slice.sliceId)}
                          onCheckedChange={() => toggleSliceSelect(slice.sliceId)}
                        />
                      )}
                      <Database className="w-5 h-5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{slice.sliceId}</div>
                        <div className="text-xs text-muted-foreground">
                          设备: {slice.deviceCode || '-'} | 时长: {slice.durationSec ?? '-'}s |
                          质量: {slice.qualityScore ?? '-'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {slice.startTime
                            ? new Date(slice.startTime).toLocaleString('zh-CN')
                            : '-'}{' '}
                          ~{' '}
                          {slice.endTime
                            ? new Date(slice.endTime).toLocaleString('zh-CN')
                            : '-'}
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        {getStatusBadge(slice.status)}
                        {getLabelStatusBadge(slice.labelStatus)}
                        {slice.workConditionCode && (
                          <Badge variant="outline">{slice.workConditionCode}</Badge>
                        )}
                      </div>
                      {!batchMode && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (!confirm(`确定删除切片 ${slice.sliceId} 吗？`)) return;
                            deleteSliceMutation.mutate({ sliceId: slice.sliceId });
                          }}
                          disabled={deleteSliceMutation.isPending}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}

                  {/* Pagination */}
                  <div className="flex items-center justify-between pt-4">
                    <span className="text-xs text-muted-foreground">
                      共 {totalSlices} 条，第 {page}/{totalPages} 页
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        上一页
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        下一页
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>暂无数据切片</p>
                  <p className="text-sm mt-1">点击上方"新建切片"创建数据切片</p>
                </div>
              )}
            </PageCard>
          </>
        )}

        {/* ====== TAB: Stats ====== */}
        {tab === 'stats' && (
          <div className="space-y-5">
            {statsQuery.isLoading ? (
              <div className="text-center py-12 text-muted-foreground">加载统计信息...</div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-4 gap-4">
                  <PageCard>
                    <div className="flex items-center gap-3">
                      <Database className="w-8 h-8 text-blue-500" />
                      <div>
                        <div className="text-2xl font-bold">
                          {(statsQuery.data as any)?.total ?? 0}
                        </div>
                        <p className="text-xs text-muted-foreground">切片总数</p>
                      </div>
                    </div>
                  </PageCard>
                  <PageCard>
                    <div className="flex items-center gap-3">
                      <BarChart3 className="w-8 h-8 text-green-500" />
                      <div>
                        <div className="text-2xl font-bold">
                          {(statsQuery.data as any)?.avgQualityScore ?? '-'}
                        </div>
                        <p className="text-xs text-muted-foreground">平均质量评分</p>
                      </div>
                    </div>
                  </PageCard>
                  <PageCard>
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-8 h-8 text-emerald-500" />
                      <div>
                        <div className="text-2xl font-bold">
                          {(statsQuery.data as any)?.byLabelStatus?.manual_verified ?? 0}
                        </div>
                        <p className="text-xs text-muted-foreground">已审核</p>
                      </div>
                    </div>
                  </PageCard>
                  <PageCard>
                    <div className="flex items-center gap-3">
                      <AlertCircle className="w-8 h-8 text-amber-500" />
                      <div>
                        <div className="text-2xl font-bold">
                          {(statsQuery.data as any)?.byLabelStatus?.unlabeled ?? 0}
                        </div>
                        <p className="text-xs text-muted-foreground">待标注</p>
                      </div>
                    </div>
                  </PageCard>
                </div>

                {/* Status breakdown */}
                <PageCard title="按状态分布" icon={<BarChart3 className="w-4 h-4" />}>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    {Object.entries((statsQuery.data as any)?.byStatus ?? {}).map(
                      ([status, cnt]) => (
                        <div
                          key={status}
                          className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                        >
                          <span className="text-sm">{getStatusBadge(status)}</span>
                          <span className="text-lg font-bold">{cnt as number}</span>
                        </div>
                      ),
                    )}
                    {Object.keys((statsQuery.data as any)?.byStatus ?? {}).length === 0 && (
                      <div className="col-span-2 text-center py-8 text-muted-foreground">
                        暂无统计数据
                      </div>
                    )}
                  </div>
                </PageCard>

                {/* Label status breakdown */}
                <PageCard title="按标注状态分布" icon={<Tag className="w-4 h-4" />}>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    {Object.entries((statsQuery.data as any)?.byLabelStatus ?? {}).map(
                      ([labelStatus, cnt]) => (
                        <div
                          key={labelStatus}
                          className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                        >
                          <span className="text-sm">{getLabelStatusBadge(labelStatus)}</span>
                          <span className="text-lg font-bold">{cnt as number}</span>
                        </div>
                      ),
                    )}
                    {Object.keys((statsQuery.data as any)?.byLabelStatus ?? {}).length === 0 && (
                      <div className="col-span-2 text-center py-8 text-muted-foreground">
                        暂无标注统计
                      </div>
                    )}
                  </div>
                </PageCard>
              </>
            )}
          </div>
        )}

        {/* ====== TAB: Pipelines ====== */}
        {tab === 'pipelines' && (
          <PageCard title="数据管道 (Airflow DAGs)" icon={<GitBranch className="w-4 h-4" />}>
            {dagsQuery.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : (
              <div className="space-y-2 mt-3">
                {(Array.isArray(dagsQuery.data)
                  ? dagsQuery.data
                  : (dagsQuery.data as any)?.dags ?? []
                ).map((dag: any) => (
                  <div
                    key={dag.dagId || dag.dag_id}
                    className="flex items-center gap-3 p-3 rounded bg-secondary"
                  >
                    <GitBranch className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {dag.dagId || dag.dag_id}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {dag.description || '无描述'}
                      </p>
                    </div>
                    <Badge
                      variant={dag.isPaused || dag.is_paused ? 'secondary' : 'default'}
                    >
                      {dag.isPaused || dag.is_paused ? '已暂停' : '运行中'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {dag.scheduleInterval || dag.schedule_interval || '-'}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        triggerDagMutation.mutate({
                          dagId: dag.dagId || dag.dag_id,
                        })
                      }
                      disabled={triggerDagMutation.isPending}
                    >
                      <Play className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                {(Array.isArray(dagsQuery.data)
                  ? dagsQuery.data
                  : (dagsQuery.data as any)?.dags ?? []
                ).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>暂无 DAG</p>
                    <p className="text-xs mt-1">请确认 Airflow 已配置并连接</p>
                  </div>
                )}
              </div>
            )}
          </PageCard>
        )}
      </div>
    </MainLayout>
  );
}
