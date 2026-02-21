/**
 * ============================================================================
 * 状态向量维度管理 — DimensionManager
 * ============================================================================
 *
 * 功能：
 *   - 查看/编辑 21 维状态向量的维度定义
 *   - 按分组（周期特征/不确定性因子/累积退化）分类展示
 *   - 批量保存维度定义
 *   - 启用/禁用单个维度
 */

import { useState, useMemo, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

// ============================================================================
// 类型 & 常量
// ============================================================================

interface DimensionDef {
  index: number;
  key: string;
  label: string;
  unit: string;
  group: 'cycle_features' | 'uncertainty_factors' | 'cumulative_metrics';
  metricNames: string[];
  aggregation: 'mean' | 'max' | 'min' | 'rms' | 'latest' | 'sum' | 'std';
  defaultValue: number;
  normalizeRange: [number, number];
  source: 'clickhouse' | 'mysql' | 'computed' | 'external';
  enabled: boolean;
}

const GROUP_LABELS: Record<string, string> = {
  cycle_features: '周期特征',
  uncertainty_factors: '不确定性因子',
  cumulative_metrics: '累积退化指标',
};

const GROUP_COLORS: Record<string, string> = {
  cycle_features: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  uncertainty_factors: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  cumulative_metrics: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

const GROUP_DESCRIPTIONS: Record<string, string> = {
  cycle_features: '反映设备运行周期内的特征值，如振动 RMS、温度均值、电流峰值等',
  uncertainty_factors: '量化数据不确定性的因子，如传感器噪声、缺失率、采样抖动等',
  cumulative_metrics: '长期累积退化指标，如累积疲劳、磨损量、运行小时数等',
};

const AGGREGATION_LABELS: Record<string, string> = {
  mean: '均值',
  max: '最大值',
  min: '最小值',
  rms: 'RMS',
  latest: '最新值',
  sum: '求和',
  std: '标准差',
};

const SOURCE_LABELS: Record<string, string> = {
  clickhouse: 'ClickHouse',
  mysql: 'MySQL',
  computed: '计算派生',
  external: '外部输入',
};

// 默认 21 维定义（岸桥）
const DEFAULT_DIMENSIONS: DimensionDef[] = [
  // 周期特征 (0-9)
  { index: 0, key: 'vib_rms', label: '振动 RMS', unit: 'mm/s', group: 'cycle_features', metricNames: ['vibration_rms'], aggregation: 'rms', defaultValue: 0, normalizeRange: [0, 50], source: 'clickhouse', enabled: true },
  { index: 1, key: 'vib_peak', label: '振动峰值', unit: 'mm/s', group: 'cycle_features', metricNames: ['vibration_peak'], aggregation: 'max', defaultValue: 0, normalizeRange: [0, 100], source: 'clickhouse', enabled: true },
  { index: 2, key: 'vib_kurtosis', label: '振动峭度', unit: '-', group: 'cycle_features', metricNames: ['vibration_kurtosis'], aggregation: 'mean', defaultValue: 3, normalizeRange: [1, 20], source: 'clickhouse', enabled: true },
  { index: 3, key: 'temp_mean', label: '温度均值', unit: '°C', group: 'cycle_features', metricNames: ['temperature_mean'], aggregation: 'mean', defaultValue: 25, normalizeRange: [-20, 120], source: 'clickhouse', enabled: true },
  { index: 4, key: 'temp_rise_rate', label: '温升速率', unit: '°C/min', group: 'cycle_features', metricNames: ['temperature_rise_rate'], aggregation: 'max', defaultValue: 0, normalizeRange: [0, 5], source: 'clickhouse', enabled: true },
  { index: 5, key: 'current_rms', label: '电流 RMS', unit: 'A', group: 'cycle_features', metricNames: ['current_rms'], aggregation: 'rms', defaultValue: 0, normalizeRange: [0, 500], source: 'clickhouse', enabled: true },
  { index: 6, key: 'current_thd', label: '电流 THD', unit: '%', group: 'cycle_features', metricNames: ['current_thd'], aggregation: 'mean', defaultValue: 0, normalizeRange: [0, 30], source: 'clickhouse', enabled: true },
  { index: 7, key: 'stress_max', label: '应力峰值', unit: 'MPa', group: 'cycle_features', metricNames: ['stress_max'], aggregation: 'max', defaultValue: 0, normalizeRange: [0, 500], source: 'clickhouse', enabled: true },
  { index: 8, key: 'wind_speed', label: '风速', unit: 'm/s', group: 'cycle_features', metricNames: ['wind_speed'], aggregation: 'mean', defaultValue: 0, normalizeRange: [0, 40], source: 'clickhouse', enabled: true },
  { index: 9, key: 'load_factor', label: '负载系数', unit: '-', group: 'cycle_features', metricNames: ['load_factor'], aggregation: 'mean', defaultValue: 0.5, normalizeRange: [0, 1.5], source: 'clickhouse', enabled: true },
  // 不确定性因子 (10-14)
  { index: 10, key: 'sensor_noise', label: '传感器噪声', unit: 'dB', group: 'uncertainty_factors', metricNames: ['sensor_noise_level'], aggregation: 'mean', defaultValue: 0, normalizeRange: [0, 60], source: 'computed', enabled: true },
  { index: 11, key: 'data_completeness', label: '数据完整度', unit: '%', group: 'uncertainty_factors', metricNames: ['data_completeness'], aggregation: 'mean', defaultValue: 1, normalizeRange: [0, 1], source: 'computed', enabled: true },
  { index: 12, key: 'sampling_jitter', label: '采样抖动', unit: 'ms', group: 'uncertainty_factors', metricNames: ['sampling_jitter'], aggregation: 'std', defaultValue: 0, normalizeRange: [0, 100], source: 'computed', enabled: true },
  { index: 13, key: 'cross_correlation', label: '交叉相关性', unit: '-', group: 'uncertainty_factors', metricNames: ['cross_correlation'], aggregation: 'mean', defaultValue: 0, normalizeRange: [-1, 1], source: 'computed', enabled: true },
  { index: 14, key: 'anomaly_score', label: '异常评分', unit: '-', group: 'uncertainty_factors', metricNames: ['anomaly_score'], aggregation: 'max', defaultValue: 0, normalizeRange: [0, 1], source: 'computed', enabled: true },
  // 累积退化 (15-20)
  { index: 15, key: 'fatigue_cycles', label: '疲劳循环数', unit: '次', group: 'cumulative_metrics', metricNames: ['fatigue_cycle_count'], aggregation: 'sum', defaultValue: 0, normalizeRange: [0, 1e7], source: 'mysql', enabled: true },
  { index: 16, key: 'wear_index', label: '磨损指数', unit: '-', group: 'cumulative_metrics', metricNames: ['wear_index'], aggregation: 'latest', defaultValue: 0, normalizeRange: [0, 1], source: 'mysql', enabled: true },
  { index: 17, key: 'operating_hours', label: '运行小时数', unit: 'h', group: 'cumulative_metrics', metricNames: ['operating_hours'], aggregation: 'latest', defaultValue: 0, normalizeRange: [0, 100000], source: 'mysql', enabled: true },
  { index: 18, key: 'overload_count', label: '过载次数', unit: '次', group: 'cumulative_metrics', metricNames: ['overload_count'], aggregation: 'sum', defaultValue: 0, normalizeRange: [0, 10000], source: 'mysql', enabled: true },
  { index: 19, key: 'corrosion_rate', label: '腐蚀速率', unit: 'mm/yr', group: 'cumulative_metrics', metricNames: ['corrosion_rate'], aggregation: 'mean', defaultValue: 0, normalizeRange: [0, 2], source: 'external', enabled: true },
  { index: 20, key: 'remaining_life', label: '剩余寿命估计', unit: '%', group: 'cumulative_metrics', metricNames: ['remaining_life_pct'], aggregation: 'latest', defaultValue: 100, normalizeRange: [0, 100], source: 'computed', enabled: true },
];

// ============================================================================
// 维度编辑对话框
// ============================================================================

function DimensionEditDialog({
  open,
  onOpenChange,
  dimension,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dimension: DimensionDef;
  onSave: (dim: DimensionDef) => void;
}) {
  const [form, setForm] = useState<DimensionDef>({ ...dimension });
  const [metricInput, setMetricInput] = useState('');

  const addMetric = () => {
    if (metricInput.trim() && !form.metricNames.includes(metricInput.trim())) {
      setForm(prev => ({ ...prev, metricNames: [...prev.metricNames, metricInput.trim()] }));
      setMetricInput('');
    }
  };

  const removeMetric = (name: string) => {
    setForm(prev => ({ ...prev, metricNames: prev.metricNames.filter(m => m !== name) }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑维度 #{form.index}: {form.label}</DialogTitle>
          <DialogDescription>修改状态向量维度的定义参数</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">维度标识 (key)</Label>
              <Input
                value={form.key}
                onChange={(e) => setForm(prev => ({ ...prev, key: e.target.value }))}
                className="h-8 text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">显示标签</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm(prev => ({ ...prev, label: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">单位</Label>
              <Input
                value={form.unit}
                onChange={(e) => setForm(prev => ({ ...prev, unit: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">分组</Label>
              <Select value={form.group} onValueChange={(v) => setForm(prev => ({ ...prev, group: v as any }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cycle_features">周期特征</SelectItem>
                  <SelectItem value="uncertainty_factors">不确定性因子</SelectItem>
                  <SelectItem value="cumulative_metrics">累积退化</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">聚合方式</Label>
              <Select value={form.aggregation} onValueChange={(v) => setForm(prev => ({ ...prev, aggregation: v as any }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(AGGREGATION_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">默认值</Label>
              <Input
                type="number"
                step="any"
                value={form.defaultValue}
                onChange={(e) => setForm(prev => ({ ...prev, defaultValue: parseFloat(e.target.value) || 0 }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">归一化下界</Label>
              <Input
                type="number"
                step="any"
                value={form.normalizeRange[0]}
                onChange={(e) => setForm(prev => ({ ...prev, normalizeRange: [parseFloat(e.target.value) || 0, prev.normalizeRange[1]] }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">归一化上界</Label>
              <Input
                type="number"
                step="any"
                value={form.normalizeRange[1]}
                onChange={(e) => setForm(prev => ({ ...prev, normalizeRange: [prev.normalizeRange[0], parseFloat(e.target.value) || 1] }))}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">数据源</Label>
            <Select value={form.source} onValueChange={(v) => setForm(prev => ({ ...prev, source: v as any }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 测点名称 */}
          <div className="space-y-1.5">
            <Label className="text-xs">关联测点名称</Label>
            <div className="flex gap-2">
              <Input
                value={metricInput}
                onChange={(e) => setMetricInput(e.target.value)}
                placeholder="输入测点名称..."
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMetric())}
              />
              <Button variant="outline" size="sm" onClick={addMetric}>添加</Button>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {form.metricNames.map(name => (
                <Badge key={name} variant="secondary" className="text-xs cursor-pointer" onClick={() => removeMetric(name)}>
                  {name} ✕
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => { onSave(form); onOpenChange(false); }}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 维度分组卡片
// ============================================================================

function DimensionGroupCard({
  group,
  dimensions,
  onEdit,
  onToggle,
}: {
  group: string;
  dimensions: DimensionDef[];
  onEdit: (dim: DimensionDef) => void;
  onToggle: (dim: DimensionDef) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${GROUP_COLORS[group] ?? ''}`}>
            {GROUP_LABELS[group] ?? group}
          </span>
          <span className="text-xs text-muted-foreground">
            {dimensions.length} 个维度 · {dimensions.filter(d => d.enabled).length} 个已启用
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{GROUP_DESCRIPTIONS[group] ?? ''}</p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead className="w-28">标识</TableHead>
              <TableHead>标签</TableHead>
              <TableHead className="w-16">单位</TableHead>
              <TableHead className="w-16">聚合</TableHead>
              <TableHead className="w-32">归一化范围</TableHead>
              <TableHead className="w-24">数据源</TableHead>
              <TableHead className="w-16">状态</TableHead>
              <TableHead className="w-16">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dimensions.map(dim => (
              <TableRow key={dim.index} className={!dim.enabled ? 'opacity-50' : ''}>
                <TableCell className="font-mono text-xs text-muted-foreground">{dim.index}</TableCell>
                <TableCell className="font-mono text-xs">{dim.key}</TableCell>
                <TableCell className="text-sm font-medium">{dim.label}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{dim.unit}</TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline" className="text-xs">
                    {AGGREGATION_LABELS[dim.aggregation] ?? dim.aggregation}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs font-mono">
                  <div className="flex items-center gap-1">
                    <span>[{dim.normalizeRange[0]},</span>
                    <span>{dim.normalizeRange[1]}]</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  <Badge variant="secondary" className="text-xs">
                    {SOURCE_LABELS[dim.source] ?? dim.source}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={dim.enabled}
                    onCheckedChange={() => onToggle(dim)}
                  />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onEdit(dim)}>
                    ✏️
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export function DimensionManagerContent() {
  const [editDim, setEditDim] = useState<DimensionDef | null>(null);
  const [localDims, setLocalDims] = useState<DimensionDef[] | null>(null);
  const [equipmentType, setEquipmentType] = useState('quay_crane');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // API
  const listQuery = trpc.evoPerception.dimension.list.useQuery({});
  const saveBatchMutation = trpc.evoPerception.dimension.saveBatch.useMutation({
    onSuccess: () => {
      toast.success('维度定义保存成功');
      listQuery.refetch();
      setHasUnsavedChanges(false);
    },
    onError: (err) => toast.error(`保存失败: ${err.message}`),
  });
  const toggleMutation = trpc.evoPerception.dimension.toggleEnabled.useMutation({
    onSuccess: () => {
      listQuery.refetch();
    },
  });

  // 从 DB 加载或使用默认值
  const dimensions = useMemo(() => {
    if (localDims) return localDims;
    const dbDims = listQuery.data;
    if (Array.isArray(dbDims) && dbDims.length > 0) {
      return dbDims.map((d: any) => ({
        index: d.dimensionIndex,
        key: d.dimensionKey,
        label: d.label,
        unit: d.unit,
        group: d.dimensionGroup,
        metricNames: d.metricNames ?? [],
        aggregation: d.aggregation,
        defaultValue: d.defaultValue ?? 0,
        normalizeRange: d.normalizeRange ?? [0, 1],
        source: d.source,
        enabled: d.enabled,
      })) as DimensionDef[];
    }
    return DEFAULT_DIMENSIONS;
  }, [localDims, listQuery.data]);

  // 分组
  const grouped = useMemo(() => {
    const groups: Record<string, DimensionDef[]> = {
      cycle_features: [],
      uncertainty_factors: [],
      cumulative_metrics: [],
    };
    for (const dim of dimensions) {
      (groups[dim.group] ?? (groups[dim.group] = [])).push(dim);
    }
    return groups;
  }, [dimensions]);

  const handleEdit = (dim: DimensionDef) => {
    setEditDim(dim);
  };

  const handleSaveDim = (updated: DimensionDef) => {
    const newDims = dimensions.map(d => d.index === updated.index ? updated : d);
    setLocalDims(newDims);
    setHasUnsavedChanges(true);
  };

  const handleToggle = (dim: DimensionDef) => {
    // 如果有 DB ID，直接调 API
    const dbDim = (listQuery.data as any[])?.find((d: any) => d.dimensionIndex === dim.index);
    if (dbDim?.id) {
      toggleMutation.mutate({ id: dbDim.id, enabled: !dim.enabled });
    }
    // 同时更新本地
    const newDims = dimensions.map(d => d.index === dim.index ? { ...d, enabled: !d.enabled } : d);
    setLocalDims(newDims);
    setHasUnsavedChanges(true);
  };

  const handleSaveAll = () => {
    saveBatchMutation.mutate({
      equipmentType,
      version: '1.0.0',
      dimensions: dimensions,
    });
  };

  const handleResetToDefaults = () => {
    setLocalDims([...DEFAULT_DIMENSIONS]);
    setHasUnsavedChanges(true);
    toast.info('已重置为默认 21 维定义（未保存）');
  };

  return (
      <div className="space-y-4">
        {/* 工具栏 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">设备类型:</Label>
            <Input
              value={equipmentType}
              onChange={(e) => setEquipmentType(e.target.value)}
              className="h-8 w-40 text-sm"
            />
          </div>
          <div className="flex-1" />
          {hasUnsavedChanges && (
            <Badge variant="destructive" className="text-xs animate-pulse">
              有未保存的更改
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={handleResetToDefaults}>
            重置为默认
          </Button>
          <Button
            size="sm"
            onClick={handleSaveAll}
            disabled={saveBatchMutation.isPending}
          >
            {saveBatchMutation.isPending ? '保存中...' : '💾 批量保存'}
          </Button>
        </div>

        {/* 统计概览 */}
        <div className="grid grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">总维度数</p>
              <p className="text-2xl font-bold">{dimensions.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">已启用</p>
              <p className="text-2xl font-bold text-emerald-400">{dimensions.filter(d => d.enabled).length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">ClickHouse 源</p>
              <p className="text-2xl font-bold text-cyan-400">{dimensions.filter(d => d.source === 'clickhouse').length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">计算派生</p>
              <p className="text-2xl font-bold text-purple-400">{dimensions.filter(d => d.source === 'computed').length}</p>
            </CardContent>
          </Card>
        </div>

        {/* 维度向量可视化 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">21 维状态向量结构</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-0.5">
              {dimensions.map(dim => (
                <div
                  key={dim.index}
                  className={`flex-1 h-8 rounded-sm flex items-center justify-center text-[10px] font-mono cursor-pointer transition-all hover:scale-y-125 ${
                    !dim.enabled ? 'bg-muted/30 text-muted-foreground/50' :
                    dim.group === 'cycle_features' ? 'bg-cyan-500/20 text-cyan-400' :
                    dim.group === 'uncertainty_factors' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-rose-500/20 text-rose-400'
                  }`}
                  title={`${dim.label} (${dim.key})`}
                  onClick={() => handleEdit(dim)}
                >
                  {dim.index}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-cyan-500/20" />
                <span>周期特征 (0-9)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-amber-500/20" />
                <span>不确定性因子 (10-14)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-rose-500/20" />
                <span>累积退化 (15-20)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-muted/30" />
                <span>已禁用</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 分组详情 */}
        <Tabs defaultValue="cycle_features">
          <TabsList>
            <TabsTrigger value="cycle_features">周期特征 ({grouped.cycle_features?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="uncertainty_factors">不确定性因子 ({grouped.uncertainty_factors?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="cumulative_metrics">累积退化 ({grouped.cumulative_metrics?.length ?? 0})</TabsTrigger>
          </TabsList>

          {Object.entries(grouped).map(([group, dims]) => (
            <TabsContent key={group} value={group}>
              <DimensionGroupCard
                group={group}
                dimensions={dims}
                onEdit={handleEdit}
                onToggle={handleToggle}
              />
            </TabsContent>
          ))}
        </Tabs>

        {/* 编辑对话框 */}
        {editDim && (
          <DimensionEditDialog
            open={!!editDim}
            onOpenChange={(open) => { if (!open) setEditDim(null); }}
            dimension={editDim}
            onSave={handleSaveDim}
          />
        )}
      </div>
  );
}

export default function DimensionManager() {
  return (
    <MainLayout title="状态向量维度管理">
      <DimensionManagerContent />
    </MainLayout>
  );
}
