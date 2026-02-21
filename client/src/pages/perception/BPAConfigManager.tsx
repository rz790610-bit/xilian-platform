/**
 * ============================================================================
 * BPA 配置管理 — BPAConfigManager
 * ============================================================================
 *
 * 功能：
 *   - 查看/创建/编辑 BPA 模糊隶属度规则配置
 *   - 可视化模糊函数曲线预览
 *   - 启用/禁用配置
 *   - 初始化种子数据
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
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

// ============================================================================
// 类型
// ============================================================================

interface BpaRule {
  source: string;
  hypothesis: string;
  functionType: 'trapezoidal' | 'triangular' | 'gaussian';
  params: Record<string, number>;
}

interface BpaConfigForm {
  name: string;
  equipmentType: string;
  hypotheses: string[];
  rules: BpaRule[];
  conditionPhase?: string;
  version: string;
  description: string;
  ignoranceBase: number;
  minMassThreshold: number;
}

const DEFAULT_SOURCES = ['vibration', 'electrical', 'temperature', 'stress', 'wind'];
const DEFAULT_HYPOTHESES = ['normal', 'degraded', 'fault', 'critical'];

const HYPOTHESIS_LABELS: Record<string, string> = {
  normal: '正常',
  degraded: '退化',
  fault: '故障',
  critical: '严重',
};

const SOURCE_LABELS: Record<string, string> = {
  vibration: '振动',
  electrical: '电气',
  temperature: '温度',
  stress: '应力',
  wind: '风速',
};

const FUNCTION_TYPE_LABELS: Record<string, string> = {
  trapezoidal: '梯形',
  triangular: '三角形',
  gaussian: '高斯',
};

// ============================================================================
// 模糊函数可视化 SVG
// ============================================================================

function FuzzyFunctionPreview({
  functionType,
  params,
  width = 200,
  height = 60,
}: {
  functionType: string;
  params: Record<string, number>;
  width?: number;
  height?: number;
}) {
  const points = useMemo(() => {
    const pts: Array<{ x: number; y: number }> = [];
    const steps = 50;

    if (functionType === 'trapezoidal') {
      const { a = 0, b = 0.3, c = 0.7, d = 1 } = params;
      const range = d - a;
      const margin = range * 0.1;
      const xMin = a - margin;
      const xMax = d + margin;
      for (let i = 0; i <= steps; i++) {
        const x = xMin + (xMax - xMin) * (i / steps);
        let y = 0;
        if (x <= a) y = 0;
        else if (x <= b) y = (x - a) / (b - a);
        else if (x <= c) y = 1;
        else if (x <= d) y = (d - x) / (d - c);
        else y = 0;
        pts.push({ x: (i / steps) * width, y: height - y * (height - 4) - 2 });
      }
    } else if (functionType === 'triangular') {
      const { a = 0, b = 1, c = 0.5 } = params;
      const range = b - a;
      const margin = range * 0.1;
      const xMin = a - margin;
      const xMax = b + margin;
      for (let i = 0; i <= steps; i++) {
        const x = xMin + (xMax - xMin) * (i / steps);
        let y = 0;
        if (x <= a) y = 0;
        else if (x <= c) y = (x - a) / (c - a);
        else if (x <= b) y = (b - x) / (b - c);
        else y = 0;
        pts.push({ x: (i / steps) * width, y: height - y * (height - 4) - 2 });
      }
    } else if (functionType === 'gaussian') {
      const { center = 0.5, sigma = 0.15 } = params;
      const xMin = center - 4 * sigma;
      const xMax = center + 4 * sigma;
      for (let i = 0; i <= steps; i++) {
        const x = xMin + (xMax - xMin) * (i / steps);
        const y = Math.exp(-0.5 * Math.pow((x - center) / sigma, 2));
        pts.push({ x: (i / steps) * width, y: height - y * (height - 4) - 2 });
      }
    }

    return pts;
  }, [functionType, params, width, height]);

  if (points.length === 0) return null;

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const colors: Record<string, string> = {
    trapezoidal: '#3b82f6',
    triangular: '#10b981',
    gaussian: '#a855f7',
  };
  const color = colors[functionType] ?? '#6b7280';

  return (
    <svg width={width} height={height} className="rounded bg-background/50">
      {/* 基线 */}
      <line x1="0" y1={height - 2} x2={width} y2={height - 2} stroke="currentColor" strokeOpacity="0.15" strokeWidth="0.5" />
      {/* 曲线 */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* 填充 */}
      <path
        d={`${pathD} L ${width} ${height - 2} L 0 ${height - 2} Z`}
        fill={color}
        fillOpacity="0.1"
      />
    </svg>
  );
}

// ============================================================================
// 规则编辑对话框
// ============================================================================

function RuleEditorDialog({
  open,
  onOpenChange,
  rule,
  onSave,
  hypotheses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: BpaRule | null;
  onSave: (rule: BpaRule) => void;
  hypotheses: string[];
}) {
  const [source, setSource] = useState(rule?.source ?? 'vibration');
  const [hypothesis, setHypothesis] = useState(rule?.hypothesis ?? 'normal');
  const [functionType, setFunctionType] = useState<'trapezoidal' | 'triangular' | 'gaussian'>(
    rule?.functionType ?? 'trapezoidal'
  );
  const [params, setParams] = useState<Record<string, number>>(rule?.params ?? {});

  const updateParam = (key: string, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setParams(prev => ({ ...prev, [key]: num }));
    }
  };

  const getDefaultParams = (type: string): Record<string, number> => {
    switch (type) {
      case 'trapezoidal': return { a: 0, b: 0.3, c: 0.7, d: 1.0 };
      case 'triangular': return { a: 0, b: 1.0, c: 0.5 };
      case 'gaussian': return { center: 0.5, sigma: 0.15 };
      default: return {};
    }
  };

  const handleFunctionTypeChange = (type: 'trapezoidal' | 'triangular' | 'gaussian') => {
    setFunctionType(type);
    setParams(getDefaultParams(type));
  };

  const paramLabels: Record<string, Record<string, string>> = {
    trapezoidal: { a: '左下界 (a)', b: '左上界 (b)', c: '右上界 (c)', d: '右下界 (d)' },
    triangular: { a: '左端点 (a)', b: '右端点 (b)', c: '峰值点 (c)' },
    gaussian: { center: '中心 (μ)', sigma: '标准差 (σ)' },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-3 gap-1.5">
        <DialogHeader className="gap-0.5 pb-0">
          <DialogTitle className="text-sm">{rule ? '编辑规则' : '添加规则'}</DialogTitle>
          <DialogDescription className="text-[10px]">配置证据源到假设的模糊隶属度映射规则</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">证据源</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_SOURCES.map(s => (
                    <SelectItem key={s} value={s}>{SOURCE_LABELS[s] ?? s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">目标假设</Label>
              <Select value={hypothesis} onValueChange={setHypothesis}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {hypotheses.map(h => (
                    <SelectItem key={h} value={h}>{HYPOTHESIS_LABELS[h] ?? h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">函数类型</Label>
            <Select value={functionType} onValueChange={(v) => handleFunctionTypeChange(v as any)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="trapezoidal">梯形函数 (Trapezoidal)</SelectItem>
                <SelectItem value="triangular">三角形函数 (Triangular)</SelectItem>
                <SelectItem value="gaussian">高斯函数 (Gaussian)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 参数编辑 */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">函数参数</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(paramLabels[functionType] ?? {}).map(([key, label]) => (
                <div key={key} className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground">{label}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={params[key] ?? ''}
                    onChange={(e) => updateParam(key, e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 曲线预览 */}
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">曲线预览</Label>
            <div className="p-2 rounded border border-border/50 bg-muted/30 flex justify-center">
              <FuzzyFunctionPreview
                functionType={functionType}
                params={params}
                width={280}
                height={50}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="pt-1">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>取消</Button>
          <Button size="sm" className="h-7 text-xs" onClick={() => {
            onSave({ source, hypothesis, functionType, params });
            onOpenChange(false);
          }}>
            保存规则
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 创建/编辑配置对话框
// ============================================================================

function ConfigEditorDialog({
  open,
  onOpenChange,
  editConfig,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editConfig: any | null;
  onSave: (form: BpaConfigForm) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<BpaConfigForm>(() => {
    if (editConfig) {
      return {
        name: editConfig.name ?? '',
        equipmentType: editConfig.equipmentType ?? 'quay_crane',
        hypotheses: editConfig.hypotheses ?? DEFAULT_HYPOTHESES,
        rules: (editConfig.rules ?? []) as BpaRule[],
        conditionPhase: editConfig.conditionPhase ?? undefined,
        version: editConfig.version ?? '1.0.0',
        description: editConfig.description ?? '',
        ignoranceBase: editConfig.ignoranceBase ?? 0.05,
        minMassThreshold: editConfig.minMassThreshold ?? 0.01,
      };
    }
    return {
      name: '',
      equipmentType: 'quay_crane',
      hypotheses: [...DEFAULT_HYPOTHESES],
      rules: [],
      version: '1.0.0',
      description: '',
      ignoranceBase: 0.05,
      minMassThreshold: 0.01,
    };
  });

  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);

  const handleAddRule = () => {
    setEditingRuleIndex(null);
    setRuleDialogOpen(true);
  };

  const handleEditRule = (index: number) => {
    setEditingRuleIndex(index);
    setRuleDialogOpen(true);
  };

  const handleSaveRule = (rule: BpaRule) => {
    setForm(prev => {
      const newRules = [...prev.rules];
      if (editingRuleIndex !== null) {
        newRules[editingRuleIndex] = rule;
      } else {
        newRules.push(rule);
      }
      return { ...prev, rules: newRules };
    });
  };

  const handleDeleteRule = (index: number) => {
    setForm(prev => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-3 gap-1.5 max-h-[70vh] overflow-y-auto">
        <DialogHeader className="gap-0.5 pb-0">
          <DialogTitle className="text-sm">{editConfig ? '编辑 BPA 配置' : '创建 BPA 配置'}</DialogTitle>
          <DialogDescription className="text-[10px]">配置模糊隶属度函数规则，用于 DS 证据构建</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">配置名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="如：岸桥默认配置"
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">设备类型</Label>
              <Input
                value={form.equipmentType}
                onChange={(e) => setForm(prev => ({ ...prev, equipmentType: e.target.value }))}
                placeholder="如：quay_crane"
                className="h-7 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">版本</Label>
              <Input
                value={form.version}
                onChange={(e) => setForm(prev => ({ ...prev, version: e.target.value }))}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">无知度基准</Label>
              <Input
                type="number"
                step="0.01"
                value={form.ignoranceBase}
                onChange={(e) => setForm(prev => ({ ...prev, ignoranceBase: parseFloat(e.target.value) || 0.05 }))}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">最小质量阈值</Label>
              <Input
                type="number"
                step="0.001"
                value={form.minMassThreshold}
                onChange={(e) => setForm(prev => ({ ...prev, minMassThreshold: parseFloat(e.target.value) || 0.01 }))}
                className="h-7 text-xs"
              />
            </div>
          </div>

          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">描述</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="配置说明..."
              className="h-7 text-xs"
            />
          </div>

          <Separator />

          {/* 规则列表 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-medium">模糊隶属度规则 ({form.rules.length})</Label>
              <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={handleAddRule}>
                + 添加规则
              </Button>
            </div>

            {form.rules.length === 0 ? (
              <div className="text-center py-3 text-muted-foreground text-[10px] border border-dashed border-border rounded">
                暂无规则，点击“添加规则”开始配置
              </div>
            ) : (
              <div className="border rounded overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 text-[10px] py-1">证据源</TableHead>
                      <TableHead className="w-14 text-[10px] py-1">假设</TableHead>
                      <TableHead className="w-14 text-[10px] py-1">函数</TableHead>
                      <TableHead className="text-[10px] py-1">参数</TableHead>
                      <TableHead className="w-32 text-[10px] py-1">曲线</TableHead>
                      <TableHead className="w-14 text-[10px] py-1">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.rules.map((rule, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-[10px] py-1">{SOURCE_LABELS[rule.source] ?? rule.source}</TableCell>
                        <TableCell className="py-1">
                          <span className={`inline-flex items-center px-1 py-0 rounded text-[10px] font-medium ${
                            rule.hypothesis === 'normal' ? 'bg-emerald-500/15 text-emerald-400' :
                            rule.hypothesis === 'degraded' ? 'bg-yellow-500/15 text-yellow-400' :
                            rule.hypothesis === 'fault' ? 'bg-orange-500/15 text-orange-400' :
                            'bg-red-500/15 text-red-400'
                          }`}>
                            {HYPOTHESIS_LABELS[rule.hypothesis] ?? rule.hypothesis}
                          </span>
                        </TableCell>
                        <TableCell className="py-1">
                          <span className={`inline-flex items-center px-1 py-0 rounded text-[10px] font-medium ${
                            rule.functionType === 'trapezoidal' ? 'bg-blue-500/15 text-blue-400' :
                            rule.functionType === 'triangular' ? 'bg-emerald-500/15 text-emerald-400' :
                            'bg-purple-500/15 text-purple-400'
                          }`}>
                            {FUNCTION_TYPE_LABELS[rule.functionType] ?? rule.functionType}
                          </span>
                        </TableCell>
                        <TableCell className="text-[10px] font-mono text-muted-foreground py-1">
                          {Object.entries(rule.params).map(([k, v]) => `${k}=${v}`).join(', ')}
                        </TableCell>
                        <TableCell className="py-1">
                          <FuzzyFunctionPreview
                            functionType={rule.functionType}
                            params={rule.params}
                            width={100}
                            height={24}
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <div className="flex items-center gap-0.5">
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-[10px]" onClick={() => handleEditRule(idx)}>
                              ✏️
                            </Button>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-[10px] text-destructive" onClick={() => handleDeleteRule(idx)}>
                              🗑️
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="pt-1">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            size="sm" className="h-7 text-xs"
            onClick={() => onSave(form)}
            disabled={isSaving || !form.name || form.rules.length === 0}
          >
            {isSaving ? '保存中...' : '保存配置'}
          </Button>
        </DialogFooter>

        {/* 嵌套规则编辑对话框 */}
        <RuleEditorDialog
          open={ruleDialogOpen}
          onOpenChange={setRuleDialogOpen}
          rule={editingRuleIndex !== null ? form.rules[editingRuleIndex] : null}
          onSave={handleSaveRule}
          hypotheses={form.hypotheses}
        />
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export function BPAConfigContent() {
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<any | null>(null);
  const [filterEquipmentType, setFilterEquipmentType] = useState('');

  // API
  const listQuery = trpc.evoPerception.bpaConfig.list.useQuery(
    filterEquipmentType ? { equipmentType: filterEquipmentType } : {},
  );
  const saveMutation = trpc.evoPerception.bpaConfig.save.useMutation({
    onSuccess: () => {
      toast.success('BPA 配置保存成功');
      listQuery.refetch();
      setConfigDialogOpen(false);
      setEditingConfig(null);
    },
    onError: (err) => toast.error(`保存失败: ${err.message}`),
  });
  const toggleMutation = trpc.evoPerception.bpaConfig.toggleEnabled.useMutation({
    onSuccess: () => {
      toast.success('状态已更新');
      listQuery.refetch();
    },
    onError: () => toast.error('状态更新失败'),
  });
  const seedMutation = trpc.evoPerception.bpaConfig.seedDefaults.useMutation({
    onSuccess: () => {
      toast.success('种子数据初始化成功');
      listQuery.refetch();
    },
    onError: () => toast.error('种子数据初始化失败'),
  });

  const configs = listQuery.data ?? [];

  const handleCreate = () => {
    setEditingConfig(null);
    setConfigDialogOpen(true);
  };

  const handleEdit = (cfg: any) => {
    setEditingConfig(cfg);
    setConfigDialogOpen(true);
  };

  const handleSave = (form: BpaConfigForm) => {
    saveMutation.mutate({
      name: form.name,
      equipmentType: form.equipmentType,
      hypotheses: form.hypotheses,
      rules: form.rules,
      conditionPhase: form.conditionPhase,
      version: form.version,
      description: form.description,
      ignoranceBase: form.ignoranceBase,
      minMassThreshold: form.minMassThreshold,
    });
  };

  return (
      <div className="space-y-4">
        {/* 工具栏 */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Input
              placeholder="按设备类型筛选..."
              value={filterEquipmentType}
              onChange={(e) => setFilterEquipmentType(e.target.value)}
              className="h-8 max-w-xs text-sm"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
            {seedMutation.isPending ? '初始化中...' : '🌱 初始化种子数据'}
          </Button>
          <Button size="sm" onClick={handleCreate}>
            + 创建配置
          </Button>
        </div>

        {/* 配置列表 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              BPA 模糊隶属度配置 ({Array.isArray(configs) ? configs.length : 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!Array.isArray(configs) || configs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-lg mb-2">暂无 BPA 配置</p>
                <p className="text-sm">点击"初始化种子数据"创建默认岸桥配置，或手动创建新配置</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(configs as any[]).map((cfg: any) => (
                  <div
                    key={cfg.id}
                    className="border border-border/50 rounded-lg p-4 hover:border-border transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-sm">{cfg.name}</h3>
                          <Badge variant={cfg.enabled ? 'default' : 'secondary'} className="text-xs">
                            {cfg.enabled ? '启用' : '禁用'}
                          </Badge>
                          <span className="text-xs text-muted-foreground font-mono">v{cfg.version ?? '1.0'}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          设备类型: {cfg.equipmentType} | 
                          无知度: {cfg.ignoranceBase ?? 0.05} | 
                          最小阈值: {cfg.minMassThreshold ?? 0.01}
                          {cfg.description && ` | ${cfg.description}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={cfg.enabled}
                          onCheckedChange={(checked) => toggleMutation.mutate({ id: cfg.id, enabled: checked })}
                        />
                        <Button variant="outline" size="sm" onClick={() => handleEdit(cfg)}>
                          编辑
                        </Button>
                      </div>
                    </div>

                    {/* 假设集 */}
                    <div className="flex items-center gap-1.5 mb-3">
                      <span className="text-xs text-muted-foreground">假设集:</span>
                      {(cfg.hypotheses as string[] ?? []).map((h: string) => (
                        <span key={h} className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          h === 'normal' ? 'bg-emerald-500/15 text-emerald-400' :
                          h === 'degraded' ? 'bg-yellow-500/15 text-yellow-400' :
                          h === 'fault' ? 'bg-orange-500/15 text-orange-400' :
                          'bg-red-500/15 text-red-400'
                        }`}>
                          {HYPOTHESIS_LABELS[h] ?? h}
                        </span>
                      ))}
                    </div>

                    {/* 规则预览 */}
                    {Array.isArray(cfg.rules) && cfg.rules.length > 0 && (
                      <div className="border-t border-border/30 pt-3">
                        <p className="text-xs text-muted-foreground mb-2">规则 ({cfg.rules.length}):</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          {(cfg.rules as BpaRule[]).slice(0, 6).map((rule: BpaRule, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 p-2 rounded bg-muted/30 border border-border/30">
                              <FuzzyFunctionPreview
                                functionType={rule.functionType}
                                params={rule.params}
                                width={80}
                                height={30}
                              />
                              <div className="text-xs">
                                <div className="font-medium">{SOURCE_LABELS[rule.source] ?? rule.source} → {HYPOTHESIS_LABELS[rule.hypothesis] ?? rule.hypothesis}</div>
                                <div className="text-muted-foreground">{FUNCTION_TYPE_LABELS[rule.functionType] ?? rule.functionType}</div>
                              </div>
                            </div>
                          ))}
                          {cfg.rules.length > 6 && (
                            <div className="flex items-center justify-center p-2 rounded bg-muted/20 border border-dashed border-border/30 text-xs text-muted-foreground">
                              +{cfg.rules.length - 6} 更多规则
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 编辑对话框 */}
        {configDialogOpen && (
          <ConfigEditorDialog
            open={configDialogOpen}
            onOpenChange={(open) => {
              setConfigDialogOpen(open);
              if (!open) setEditingConfig(null);
            }}
            editConfig={editingConfig}
            onSave={handleSave}
            isSaving={saveMutation.isPending}
          />
        )}
      </div>
  );
}

export default function BPAConfigManager() {
  return (
    <MainLayout title="BPA 配置管理">
      <BPAConfigContent />
    </MainLayout>
  );
}
