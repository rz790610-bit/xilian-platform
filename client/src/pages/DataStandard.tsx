/**
 * 数据标准化配置页面
 * 设计风格：深空科技风 - 深色背景、蓝色主色调、微妙光效
 *
 * 数据源：
 *   - 编码类别/项目/校验 → trpc.encoding.* (DB 优先，fallback 降级)
 *   - 单位换算 / 工况阈值 / 数据质量规则 → 本地状态 (可编辑，标注同步状态)
 */

import { useState, useMemo, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/common/Toast';
import { trpc } from '@/lib/trpc';
import {
  Tag,
  AlertTriangle,
  Activity,
  Gauge,
  Plus,
  Edit as EditIcon,
  Trash2,
  Download,
  Upload,
  ChevronRight,
  CheckCircle,
  XCircle,
  Settings2,
  FileCode,
  ArrowRightLeft,
  Loader2,
  Database,
  HardDrive,
} from 'lucide-react';
import type {
  UnitConversion,
  FaultCategory,
  ConditionThreshold,
  DataQualityRule,
} from '@/types';

// ─── 本地配置初始值（无对应 CRUD 端点的数据类型） ───

const INITIAL_UNIT_CONVERSIONS: UnitConversion[] = [
  { id: '1', name: '加速度转速度', category: 'vibration', fromUnit: 'g', toUnit: 'mm/s', formula: 'x * 9.8 * 1000 / (2 * \u03c0 * f)', description: '需要频率参数' },
  { id: '2', name: '华氏转摄氏', category: 'temperature', fromUnit: '\u00b0F', toUnit: '\u00b0C', formula: '(x - 32) * 5 / 9' },
  { id: '3', name: 'PSI转MPa', category: 'pressure', fromUnit: 'PSI', toUnit: 'MPa', formula: 'x * 0.00689476' },
  { id: '4', name: 'RPM转Hz', category: 'speed', fromUnit: 'RPM', toUnit: 'Hz', formula: 'x / 60' },
  { id: '5', name: 'mA转百分比', category: 'current', fromUnit: 'mA', toUnit: '%', formula: '(x - 4) / 16 * 100', description: '4-20mA标准信号' },
];

const INITIAL_CONDITION_THRESHOLDS: ConditionThreshold[] = [
  { id: '1', name: '振动速度阈值', measureType: 'velocity', unit: 'mm/s', normalMin: 0, normalMax: 4.5, warningMin: 4.5, warningMax: 11.2, alarmMin: 11.2, alarmMax: 999, description: 'ISO 10816-3 标准' },
  { id: '2', name: '轴承温度阈值', measureType: 'temperature', unit: '\u00b0C', normalMin: 0, normalMax: 70, warningMin: 70, warningMax: 85, alarmMin: 85, alarmMax: 999, description: '滚动轴承温度标准' },
  { id: '3', name: '电机电流阈值', measureType: 'current', unit: 'A', normalMin: 0, normalMax: 100, warningMin: 100, warningMax: 115, alarmMin: 115, alarmMax: 999, description: '额定电流百分比' },
];

const INITIAL_DATA_QUALITY_RULES: DataQualityRule[] = [
  { id: '1', name: '空值检查', type: 'null', field: '*', condition: 'value == null', action: 'reject', description: '拒绝空值数据', enabled: true },
  { id: '2', name: '振动范围检查', type: 'range', field: 'vibration', condition: 'value < 0 || value > 100', action: 'warn', description: '振动值应在0-100mm/s', enabled: true },
  { id: '3', name: '温度范围检查', type: 'range', field: 'temperature', condition: 'value < -40 || value > 200', action: 'warn', description: '温度值应在-40~200\u00b0C', enabled: true },
  { id: '4', name: '时间戳格式', type: 'format', field: 'timestamp', condition: 'ISO8601', action: 'fix', fixValue: 'auto_convert', description: '自动转换时间格式', enabled: true },
  { id: '5', name: '异常值检测', type: 'outlier', field: '*', condition: '3sigma', action: 'tag', description: '标记3\u03c3外的异常值', enabled: false },
];

const INITIAL_FAULT_CATEGORIES: FaultCategory[] = [
  {
    id: '1', code: 'M', name: '机械故障', level: 1, children: [
      { id: '1-1', code: 'M1', name: '不平衡', parentId: '1', level: 2, symptoms: ['1X振动大', '相位稳定'] },
      { id: '1-2', code: 'M2', name: '不对中', parentId: '1', level: 2, symptoms: ['2X振动大', '轴向振动大'] },
      { id: '1-3', code: 'M3', name: '松动', parentId: '1', level: 2, symptoms: ['多倍频', '相位不稳'] },
      { id: '1-4', code: 'M4', name: '轴承故障', parentId: '1', level: 2, children: [
        { id: '1-4-1', code: 'M4.1', name: '内圈故障', parentId: '1-4', level: 3, symptoms: ['BPFI特征频率'] },
        { id: '1-4-2', code: 'M4.2', name: '外圈故障', parentId: '1-4', level: 3, symptoms: ['BPFO特征频率'] },
        { id: '1-4-3', code: 'M4.3', name: '滚动体故障', parentId: '1-4', level: 3, symptoms: ['BSF特征频率'] },
      ] },
    ],
  },
  {
    id: '2', code: 'E', name: '电气故障', level: 1, children: [
      { id: '2-1', code: 'E1', name: '转子故障', parentId: '2', level: 2, symptoms: ['边频带', '2倍滑差频率'] },
      { id: '2-2', code: 'E2', name: '定子故障', parentId: '2', level: 2, symptoms: ['2倍电源频率'] },
    ],
  },
  {
    id: '3', code: 'F', name: '流体故障', level: 1, children: [
      { id: '3-1', code: 'F1', name: '气蚀', parentId: '3', level: 2, symptoms: ['宽带噪声', '高频振动'] },
      { id: '3-2', code: 'F2', name: '涡流', parentId: '3', level: 2, symptoms: ['低频振动', '压力脉动'] },
    ],
  },
];

// ─── 数据来源标签 ─────────────────────────────────────────────────────

function SourceBadge({ source }: { source: 'database' | 'fallback' | 'local' }) {
  if (source === 'database') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded">
        <Database className="w-2.5 h-2.5" /> DB
      </span>
    );
  }
  if (source === 'fallback') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 bg-yellow-500/15 text-yellow-400 rounded">
        <HardDrive className="w-2.5 h-2.5" /> Fallback
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 bg-slate-500/20 text-gray-400 rounded">
      <HardDrive className="w-2.5 h-2.5" /> 本地
    </span>
  );
}

// ─── 加载占位 ─────────────────────────────────────────────────────────

function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-slate-800/40 rounded animate-pulse" />
      ))}
    </div>
  );
}

// ─── 故障分类树组件 ───────────────────────────────────────────────────

function FaultCategoryTree({ categories, level = 0 }: { categories: FaultCategory[]; level?: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['1', '1-4']));

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  return (
    <div className="space-y-0.5">
      {(categories || []).map(cat => (
        <div key={cat.id}>
          <div
            className="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-slate-700/30 cursor-pointer"
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={() => cat.children && toggleExpand(cat.id)}
          >
            {cat.children ? (
              <ChevronRight className={`w-3 h-3 text-gray-500 transition-transform ${expanded.has(cat.id) ? 'rotate-90' : ''}`} />
            ) : (
              <div className="w-3 h-3" />
            )}
            <span className="text-[10px] font-mono text-blue-400">{cat.code}</span>
            <span className="text-[10px] text-gray-300">{cat.name}</span>
            {cat.symptoms && (
              <span className="text-[9px] text-gray-500 ml-auto">
                {(cat.symptoms || []).slice(0, 2).join(', ')}
              </span>
            )}
          </div>
          {cat.children && expanded.has(cat.id) && (
            <FaultCategoryTree categories={cat.children} level={level + 1} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── 主页面组件 ───────────────────────────────────────────────────────

export default function DataStandard() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('device');

  // ── tRPC 查询: 编码类别定义 (包含 pattern, example, format) ──
  const categoriesQuery = trpc.encoding.getCategories.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });

  // ── tRPC 查询: DB 中的编码类别记录 ──
  const dbCategoriesQuery = trpc.encoding.queryCategories.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });

  // ── tRPC 查询: 各类编码的字典项 ──
  const deviceItemsQuery = trpc.encoding.queryItems.useQuery(
    { categoryCode: 'ENCODING_DEVICE' },
    { staleTime: 5 * 60_000 },
  );
  const componentItemsQuery = trpc.encoding.queryItems.useQuery(
    { categoryCode: 'ENCODING_COMPONENT' },
    { staleTime: 5 * 60_000 },
  );
  const departmentItemsQuery = trpc.encoding.queryItems.useQuery(
    { categoryCode: 'ENCODING_DEPARTMENT' },
    { staleTime: 5 * 60_000 },
  );

  // ── tRPC 编码校验 ──
  const [validateInput, setValidateInput] = useState('');
  const [validateType, setValidateType] = useState<'device' | 'component' | 'department'>('device');
  const [triggerValidation, setTriggerValidation] = useState(false);

  const validationQuery = trpc.encoding.validate.useQuery(
    { type: validateType, code: validateInput },
    { enabled: triggerValidation && validateInput.length > 0 },
  );

  // ── tRPC seed mutation ──
  const seedMutation = trpc.encoding.seed.useMutation({
    onSuccess: () => {
      toast.success('编码种子数据已写入数据库');
      // refetch after seed
      deviceItemsQuery.refetch();
      componentItemsQuery.refetch();
      departmentItemsQuery.refetch();
      dbCategoriesQuery.refetch();
    },
    onError: (err) => {
      toast.error(`Seed 失败: ${err.message}`);
    },
  });

  // ── 本地状态 (无 CRUD 端点的数据) ──
  const [unitConversions, setUnitConversions] = useState(INITIAL_UNIT_CONVERSIONS);
  const [faultCategories] = useState(INITIAL_FAULT_CATEGORIES);
  const [thresholds, setThresholds] = useState(INITIAL_CONDITION_THRESHOLDS);
  const [qualityRules, setQualityRules] = useState(INITIAL_DATA_QUALITY_RULES);

  // ── 对话框状态 ──
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [dialogType, setDialogType] = useState<'threshold' | 'conversion' | 'rule'>('threshold');

  // ── 对话框表单状态 ──
  const [dialogForm, setDialogForm] = useState<Record<string, string>>({});

  const resetDialogForm = useCallback(() => setDialogForm({}), []);

  // ── 将 API 返回的编码类别格式化为展示用结构 ──
  const encodingCategoryCards = useMemo(() => {
    const cats = categoriesQuery.data;
    if (!cats || !Array.isArray(cats)) return [];
    return cats.map(cat => ({
      code: cat.code,
      name: cat.name,
      description: cat.description,
      format: cat.format,
      example: cat.example,
    }));
  }, [categoriesQuery.data]);

  // ── 获取某个 category 对应的查询 ──
  const getItemsForCategory = (code: string) => {
    if (code === 'ENCODING_DEVICE') return deviceItemsQuery;
    if (code === 'ENCODING_COMPONENT') return componentItemsQuery;
    if (code === 'ENCODING_DEPARTMENT') return departmentItemsQuery;
    return null;
  };

  // ── 按 metadata.level 分组字典项 (兼容 DB schema) ──
  type DictItem = { code: string; label: string; parentCode: string | null; sortOrder: number; metadata: unknown };
  const groupItemsByLevel = (items: DictItem[]) => {
    const groups: Record<number, DictItem[]> = {};
    for (const item of items) {
      const meta = item.metadata as Record<string, unknown> | null;
      const lvl = (meta?.level as number) ?? 0;
      if (!groups[lvl]) groups[lvl] = [];
      groups[lvl].push(item);
    }
    return groups;
  };

  // ── 执行校验 ──
  const handleValidate = () => {
    if (!validateInput.trim()) {
      toast.error('请输入编码');
      return;
    }
    setTriggerValidation(true);
  };

  // ── 添加项 ──
  const handleAddItem = () => {
    if (dialogType === 'threshold') {
      const newTh: ConditionThreshold = {
        id: String(Date.now()),
        name: dialogForm.name || '新阈值',
        measureType: dialogForm.measureType || 'velocity',
        unit: dialogForm.unit || 'mm/s',
        normalMin: parseFloat(dialogForm.normalMin || '0'),
        normalMax: parseFloat(dialogForm.normalMax || '0'),
        warningMin: parseFloat(dialogForm.warningMin || '0'),
        warningMax: parseFloat(dialogForm.warningMax || '0'),
        alarmMin: parseFloat(dialogForm.alarmMin || '0'),
        alarmMax: parseFloat(dialogForm.alarmMax || '999'),
        description: dialogForm.description,
      };
      setThresholds(prev => [...prev, newTh]);
      toast.success('阈值配置已添加（本地保存）');
    } else if (dialogType === 'conversion') {
      const newConv: UnitConversion = {
        id: String(Date.now()),
        name: dialogForm.name || '新换算',
        category: (dialogForm.category as UnitConversion['category']) || 'other',
        fromUnit: dialogForm.fromUnit || '',
        toUnit: dialogForm.toUnit || '',
        formula: dialogForm.formula || '',
        description: dialogForm.description,
      };
      setUnitConversions(prev => [...prev, newConv]);
      toast.success('换算规则已添加（本地保存）');
    } else if (dialogType === 'rule') {
      const newRule: DataQualityRule = {
        id: String(Date.now()),
        name: dialogForm.name || '新规则',
        type: (dialogForm.ruleType as DataQualityRule['type']) || 'custom',
        field: dialogForm.field || '*',
        condition: dialogForm.condition || '',
        action: (dialogForm.action as DataQualityRule['action']) || 'warn',
        description: dialogForm.description,
        enabled: true,
      };
      setQualityRules(prev => [...prev, newRule]);
      toast.success('质量规则已添加（本地保存）');
    }
    setShowAddDialog(false);
    resetDialogForm();
  };

  // ── 删除本地项 ──
  const handleDeleteConversion = (id: string) => {
    setUnitConversions(prev => prev.filter(c => c.id !== id));
    toast.success('已删除');
  };
  const handleDeleteThreshold = (id: string) => {
    setThresholds(prev => prev.filter(t => t.id !== id));
    toast.success('已删除');
  };
  const handleDeleteRule = (id: string) => {
    setQualityRules(prev => prev.filter(r => r.id !== id));
    toast.success('已删除');
  };

  // ── 切换规则启用 ──
  const toggleRuleEnabled = (id: string) => {
    setQualityRules(rules => rules.map(r =>
      r.id === id ? { ...r, enabled: !r.enabled } : r
    ));
  };

  // ── 导出配置 ──
  const handleExportConfig = () => {
    const config = {
      encodingCategories: categoriesQuery.data ?? [],
      encodingDeviceItems: deviceItemsQuery.data?.items ?? [],
      encodingComponentItems: componentItemsQuery.data?.items ?? [],
      encodingDepartmentItems: departmentItemsQuery.data?.items ?? [],
      unitConversions,
      faultCategories,
      conditionThresholds: thresholds,
      dataQualityRules: qualityRules,
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data-standard-config.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('配置已导出');
  };

  // ── 加载状态聚合 ──
  const isLoadingEncoding = categoriesQuery.isLoading || dbCategoriesQuery.isLoading;

  return (
    <MainLayout title="数据标准化">
      <div className="space-y-3">
        {/* 顶部操作栏 */}
        <div className="flex items-center justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-7 bg-slate-800/50">
              <TabsTrigger value="device" className="text-[10px] h-5 px-2">设备编码</TabsTrigger>
              <TabsTrigger value="measure" className="text-[10px] h-5 px-2">测点编码</TabsTrigger>
              <TabsTrigger value="unit" className="text-[10px] h-5 px-2">单位换算</TabsTrigger>
              <TabsTrigger value="fault" className="text-[10px] h-5 px-2">故障分类</TabsTrigger>
              <TabsTrigger value="threshold" className="text-[10px] h-5 px-2">工况阈值</TabsTrigger>
              <TabsTrigger value="quality" className="text-[10px] h-5 px-2">质量规则</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
            >
              {seedMutation.isPending ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Database className="w-3 h-3 mr-1" />
              )}
              Seed 编码数据
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={handleExportConfig}>
              <Download className="w-3 h-3 mr-1" />
              导出配置
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = () => {
                      try {
                        JSON.parse(reader.result as string);
                        toast.success('配置导入成功');
                      } catch {
                        toast.error('配置文件格式错误');
                      }
                    };
                    reader.readAsText(file);
                  }
                };
                input.click();
              }}
            >
              <Upload className="w-3 h-3 mr-1" />
              导入配置
            </Button>
          </div>
        </div>

        {/* ━━━ 设备编码 ━━━ */}
        {activeTab === 'device' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <PageCard title="编码规范" icon={<Tag className="w-3.5 h-3.5" />}>
              {isLoadingEncoding ? (
                <LoadingSkeleton rows={3} />
              ) : categoriesQuery.isError ? (
                <div className="text-[10px] text-red-400 p-2">加载失败: {categoriesQuery.error?.message}</div>
              ) : (
                <div className="space-y-3">
                  {encodingCategoryCards.map(cat => {
                    const itemsQuery = getItemsForCategory(cat.code);
                    const itemsData = itemsQuery?.data;
                    return (
                      <div key={cat.code} className="p-2 bg-slate-800/30 rounded border border-slate-700/50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-white">{cat.name}</span>
                            <span className="text-[8px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">系统</span>
                            {itemsData && <SourceBadge source={itemsData.source} />}
                          </div>
                        </div>
                        <p className="text-[9px] text-gray-400 mb-2">{cat.description}</p>
                        <div className="flex items-center gap-1 mb-2">
                          <span className="text-[9px] text-gray-500">格式:</span>
                          <code className="text-[10px] font-mono text-yellow-400 bg-slate-900/50 px-1.5 py-0.5 rounded">
                            {cat.format}
                          </code>
                        </div>
                        <div className="flex items-center gap-1 mb-2">
                          <span className="text-[9px] text-gray-500">示例:</span>
                          <code className="text-[10px] font-mono text-emerald-400 bg-slate-900/50 px-1.5 py-0.5 rounded">
                            {cat.example}
                          </code>
                        </div>
                        {/* 字典项按级别展示 */}
                        {itemsQuery?.isLoading ? (
                          <div className="flex items-center gap-1 text-[9px] text-gray-500">
                            <Loader2 className="w-3 h-3 animate-spin" /> 加载字典项...
                          </div>
                        ) : itemsData && itemsData.items.length > 0 ? (
                          <div className="space-y-1 mt-2">
                            {Object.entries(groupItemsByLevel(itemsData.items)).map(([lvl, items]) => (
                              <div key={lvl} className="flex flex-wrap gap-1">
                                <span className="text-[8px] text-gray-500 w-10 shrink-0">L{lvl}:</span>
                                {items.slice(0, 8).map(item => (
                                  <span key={item.code} className="text-[8px] px-1.5 py-0.5 bg-slate-700/50 text-gray-300 rounded font-mono">
                                    {item.code}
                                    {item.label ? ` ${item.label}` : ''}
                                  </span>
                                ))}
                                {items.length > 8 && (
                                  <span className="text-[8px] text-gray-500">+{items.length - 8} more</span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </PageCard>

            <PageCard title="编码验证" icon={<CheckCircle className="w-3.5 h-3.5" />}>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-400">编码类型</Label>
                  <Select
                    value={validateType}
                    onValueChange={(v) => {
                      setValidateType(v as 'device' | 'component' | 'department');
                      setTriggerValidation(false);
                    }}
                  >
                    <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="device">设备主体编码</SelectItem>
                      <SelectItem value="component">部件编码</SelectItem>
                      <SelectItem value="department">部门编码</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-400">输入编码进行验证</Label>
                  <Input
                    className="h-8 text-[11px] bg-slate-800 border-slate-700 font-mono"
                    placeholder={
                      validateType === 'device' ? '例如: Mgj-XC001' :
                      validateType === 'component' ? '例如: Mgj-XC001j010101' :
                      '例如: 633G010204'
                    }
                    value={validateInput}
                    onChange={(e) => {
                      setValidateInput(e.target.value);
                      setTriggerValidation(false);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleValidate()}
                  />
                </div>
                <Button
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={handleValidate}
                  disabled={validationQuery.isFetching}
                >
                  {validationQuery.isFetching ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : null}
                  验证编码
                </Button>

                {/* 校验结果 */}
                {triggerValidation && validationQuery.data && (
                  <div className="p-2 bg-slate-800/30 rounded border border-slate-700/50">
                    {validationQuery.data.valid ? (
                      <>
                        <div className="flex items-center gap-1.5 mb-2">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-[10px] text-emerald-400">编码格式正确</span>
                        </div>
                        {validationQuery.data.parsed && (
                          <div className="space-y-1 text-[9px]">
                            {Object.entries(validationQuery.data.parsed).map(([key, value]) => (
                              <div key={key} className="flex justify-between">
                                <span className="text-gray-500">{key}:</span>
                                <span className="text-gray-300 font-mono">{value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 mb-2">
                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                          <span className="text-[10px] text-red-400">编码验证失败</span>
                        </div>
                        <div className="space-y-1 text-[9px]">
                          {validationQuery.data.errors.map((err, idx) => (
                            <div key={idx} className="text-red-300/80">
                              {err}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {triggerValidation && validationQuery.isError && (
                  <div className="p-2 bg-slate-800/30 rounded border border-red-700/50 text-[9px] text-red-400">
                    校验请求出错: {validationQuery.error?.message}
                  </div>
                )}
              </div>
            </PageCard>
          </div>
        )}

        {/* ━━━ 测点编码 ━━━ */}
        {activeTab === 'measure' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <PageCard title="部件编码规范" icon={<Activity className="w-3.5 h-3.5" />}>
              {isLoadingEncoding ? (
                <LoadingSkeleton rows={2} />
              ) : (
                <div className="space-y-3">
                  {/* 部件编码 category from API */}
                  {encodingCategoryCards
                    .filter(c => c.code === 'ENCODING_COMPONENT')
                    .map(cat => (
                      <div key={cat.code} className="p-2 bg-slate-800/30 rounded border border-slate-700/50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-medium text-white">{cat.name}</span>
                          <span className="text-[8px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">系统</span>
                        </div>
                        <p className="text-[9px] text-gray-400 mb-2">{cat.description}</p>
                        <div className="flex items-center gap-1 mb-2">
                          <span className="text-[9px] text-gray-500">格式:</span>
                          <code className="text-[10px] font-mono text-yellow-400 bg-slate-900/50 px-1.5 py-0.5 rounded">
                            {cat.format}
                          </code>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-gray-500">示例:</span>
                          <code className="text-[10px] font-mono text-emerald-400 bg-slate-900/50 px-1.5 py-0.5 rounded">
                            {cat.example}
                          </code>
                        </div>
                      </div>
                    ))}
                  {/* 部门编码 category from API */}
                  {encodingCategoryCards
                    .filter(c => c.code === 'ENCODING_DEPARTMENT')
                    .map(cat => (
                      <div key={cat.code} className="p-2 bg-slate-800/30 rounded border border-slate-700/50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-medium text-white">{cat.name}</span>
                          <span className="text-[8px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">系统</span>
                        </div>
                        <p className="text-[9px] text-gray-400 mb-2">{cat.description}</p>
                        <div className="flex items-center gap-1 mb-2">
                          <span className="text-[9px] text-gray-500">格式:</span>
                          <code className="text-[10px] font-mono text-yellow-400 bg-slate-900/50 px-1.5 py-0.5 rounded">
                            {cat.format}
                          </code>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-gray-500">示例:</span>
                          <code className="text-[10px] font-mono text-emerald-400 bg-slate-900/50 px-1.5 py-0.5 rounded">
                            {cat.example}
                          </code>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </PageCard>

            <PageCard title="编码字典" icon={<FileCode className="w-3.5 h-3.5" />}>
              {componentItemsQuery.isLoading ? (
                <LoadingSkeleton rows={4} />
              ) : componentItemsQuery.data && componentItemsQuery.data.items.length > 0 ? (
                <div className="space-y-2">
                  <SourceBadge source={componentItemsQuery.data.source} />
                  {Object.entries(groupItemsByLevel(componentItemsQuery.data.items)).map(([lvl, items]) => (
                    <div key={lvl} className="p-2 bg-slate-800/30 rounded border border-slate-700/50">
                      <div className="text-[10px] font-medium text-white mb-1.5">Level {lvl}</div>
                      <div className="grid grid-cols-2 gap-1">
                        {items.map(item => (
                          <div key={item.code} className="flex items-center gap-1.5 text-[9px]">
                            <code className="font-mono text-blue-400 bg-slate-900/50 px-1 rounded">{item.code}</code>
                            <span className="text-gray-400">{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[9px] text-gray-500 p-2">
                  暂无字典数据。请点击顶部 "Seed 编码数据" 按钮写入种子数据。
                </div>
              )}
            </PageCard>
          </div>
        )}

        {/* ━━━ 单位换算 ━━━ */}
        {activeTab === 'unit' && (
          <PageCard
            title="单位换算规则"
            icon={<ArrowRightLeft className="w-3.5 h-3.5" />}
            action={<SourceBadge source="local" />}
          >
            <div className="space-y-2">
              <div className="grid grid-cols-6 gap-2 text-[9px] text-gray-500 font-medium pb-1 border-b border-slate-700/50">
                <div>名称</div>
                <div>类别</div>
                <div>源单位</div>
                <div>目标单位</div>
                <div>换算公式</div>
                <div>操作</div>
              </div>
              {unitConversions.map(conv => (
                <div key={conv.id} className="grid grid-cols-6 gap-2 items-center py-1.5 border-b border-slate-700/30">
                  <div className="text-[10px] text-white">{conv.name}</div>
                  <div className="text-[9px] text-gray-400">{conv.category}</div>
                  <div className="text-[10px] font-mono text-blue-400">{conv.fromUnit}</div>
                  <div className="text-[10px] font-mono text-emerald-400">{conv.toUnit}</div>
                  <div className="text-[9px] font-mono text-gray-300">{conv.formula}</div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => toast.info('编辑功能开发中')}>
                      <EditIcon className="w-2.5 h-2.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400" onClick={() => handleDeleteConversion(conv.id)}>
                      <Trash2 className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px]"
                onClick={() => {
                  setDialogType('conversion');
                  resetDialogForm();
                  setShowAddDialog(true);
                }}
              >
                <Plus className="w-3 h-3 mr-1" />
                添加换算规则
              </Button>
            </div>
          </PageCard>
        )}

        {/* ━━━ 故障分类 ━━━ */}
        {activeTab === 'fault' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <PageCard
              title="故障分类树"
              icon={<AlertTriangle className="w-3.5 h-3.5" />}
              className="lg:col-span-2"
              action={<SourceBadge source="local" />}
            >
              <div className="max-h-[400px] overflow-y-auto">
                <FaultCategoryTree categories={faultCategories} />
              </div>
            </PageCard>

            <PageCard title="分类说明" icon={<FileCode className="w-3.5 h-3.5" />}>
              <div className="space-y-2 text-[9px]">
                <p className="text-gray-400">故障分类采用层级编码体系，参考 ISO 13373 标准：</p>
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-blue-400 w-6">M</span>
                    <span className="text-gray-300">机械故障（不平衡、不对中、松动、轴承等）</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-blue-400 w-6">E</span>
                    <span className="text-gray-300">电气故障（转子、定子、绝缘等）</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-blue-400 w-6">F</span>
                    <span className="text-gray-300">流体故障（气蚀、涡流、堵塞等）</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] w-full mt-2"
                  onClick={() => toast.info('故障类型添加功能开发中')}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  添加故障类型
                </Button>
              </div>
            </PageCard>
          </div>
        )}

        {/* ━━━ 工况阈值 ━━━ */}
        {activeTab === 'threshold' && (
          <PageCard
            title="工况阈值配置"
            icon={<Gauge className="w-3.5 h-3.5" />}
            action={<SourceBadge source="local" />}
          >
            <div className="space-y-2">
              <div className="grid grid-cols-8 gap-2 text-[9px] text-gray-500 font-medium pb-1 border-b border-slate-700/50">
                <div className="col-span-2">名称</div>
                <div>单位</div>
                <div>正常范围</div>
                <div>预警范围</div>
                <div>报警范围</div>
                <div>参考标准</div>
                <div>操作</div>
              </div>
              {thresholds.map(th => (
                <div key={th.id} className="grid grid-cols-8 gap-2 items-center py-1.5 border-b border-slate-700/30">
                  <div className="col-span-2 text-[10px] text-white">{th.name}</div>
                  <div className="text-[10px] font-mono text-gray-400">{th.unit}</div>
                  <div className="text-[9px]">
                    <span className="text-emerald-400">{th.normalMin} - {th.normalMax}</span>
                  </div>
                  <div className="text-[9px]">
                    <span className="text-yellow-400">{th.warningMin} - {th.warningMax}</span>
                  </div>
                  <div className="text-[9px]">
                    <span className="text-red-400">{th.alarmMin} - {th.alarmMax}</span>
                  </div>
                  <div className="text-[9px] text-gray-500">{th.description}</div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => toast.info('编辑功能开发中')}>
                      <EditIcon className="w-2.5 h-2.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400" onClick={() => handleDeleteThreshold(th.id)}>
                      <Trash2 className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px]"
                onClick={() => {
                  setDialogType('threshold');
                  resetDialogForm();
                  setShowAddDialog(true);
                }}
              >
                <Plus className="w-3 h-3 mr-1" />
                添加阈值配置
              </Button>
            </div>
          </PageCard>
        )}

        {/* ━━━ 数据质量规则 ━━━ */}
        {activeTab === 'quality' && (
          <PageCard
            title="数据质量规则"
            icon={<Settings2 className="w-3.5 h-3.5" />}
            action={<SourceBadge source="local" />}
          >
            <div className="space-y-2">
              <div className="grid grid-cols-7 gap-2 text-[9px] text-gray-500 font-medium pb-1 border-b border-slate-700/50">
                <div>启用</div>
                <div>规则名称</div>
                <div>类型</div>
                <div>字段</div>
                <div>条件</div>
                <div>处理方式</div>
                <div>操作</div>
              </div>
              {qualityRules.map(rule => (
                <div key={rule.id} className="grid grid-cols-7 gap-2 items-center py-1.5 border-b border-slate-700/30">
                  <div>
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => toggleRuleEnabled(rule.id)}
                      className="scale-75"
                    />
                  </div>
                  <div className="text-[10px] text-white">{rule.name}</div>
                  <div className="text-[9px] text-gray-400">{rule.type}</div>
                  <div className="text-[9px] font-mono text-blue-400">{rule.field}</div>
                  <div className="text-[9px] font-mono text-gray-300 truncate" title={rule.condition}>
                    {rule.condition}
                  </div>
                  <div className={`text-[9px] ${
                    rule.action === 'reject' ? 'text-red-400' :
                    rule.action === 'warn' ? 'text-yellow-400' :
                    rule.action === 'fix' ? 'text-blue-400' :
                    'text-gray-400'
                  }`}>
                    {rule.action === 'reject' ? '拒绝' :
                     rule.action === 'warn' ? '警告' :
                     rule.action === 'fix' ? '修复' : '标记'}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => toast.info('编辑功能开发中')}>
                      <EditIcon className="w-2.5 h-2.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400" onClick={() => handleDeleteRule(rule.id)}>
                      <Trash2 className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px]"
                onClick={() => {
                  setDialogType('rule');
                  resetDialogForm();
                  setShowAddDialog(true);
                }}
              >
                <Plus className="w-3 h-3 mr-1" />
                添加质量规则
              </Button>
            </div>
          </PageCard>
        )}
      </div>

      {/* ━━━ 添加对话框 ━━━ */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm text-white">
              {dialogType === 'threshold' ? '添加工况阈值' :
               dialogType === 'conversion' ? '添加单位换算' : '添加质量规则'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {dialogType === 'threshold' && (
              <>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-400">名称</Label>
                  <Input
                    className="h-8 text-[11px] bg-slate-800 border-slate-700"
                    placeholder="例如：振动速度阈值"
                    value={dialogForm.name || ''}
                    onChange={(e) => setDialogForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-400">测量类型</Label>
                    <Select
                      value={dialogForm.measureType || ''}
                      onValueChange={(v) => setDialogForm(f => ({ ...f, measureType: v }))}
                    >
                      <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
                        <SelectValue placeholder="选择类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="velocity">振动速度</SelectItem>
                        <SelectItem value="acceleration">振动加速度</SelectItem>
                        <SelectItem value="temperature">温度</SelectItem>
                        <SelectItem value="pressure">压力</SelectItem>
                        <SelectItem value="current">电流</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-400">单位</Label>
                    <Input
                      className="h-8 text-[11px] bg-slate-800 border-slate-700"
                      placeholder="mm/s"
                      value={dialogForm.unit || ''}
                      onChange={(e) => setDialogForm(f => ({ ...f, unit: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-emerald-400">正常范围</Label>
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-7 text-[10px] bg-slate-800 border-slate-700"
                        placeholder="最小"
                        value={dialogForm.normalMin || ''}
                        onChange={(e) => setDialogForm(f => ({ ...f, normalMin: e.target.value }))}
                      />
                      <span className="text-gray-500">-</span>
                      <Input
                        className="h-7 text-[10px] bg-slate-800 border-slate-700"
                        placeholder="最大"
                        value={dialogForm.normalMax || ''}
                        onChange={(e) => setDialogForm(f => ({ ...f, normalMax: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-yellow-400">预警范围</Label>
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-7 text-[10px] bg-slate-800 border-slate-700"
                        placeholder="最小"
                        value={dialogForm.warningMin || ''}
                        onChange={(e) => setDialogForm(f => ({ ...f, warningMin: e.target.value }))}
                      />
                      <span className="text-gray-500">-</span>
                      <Input
                        className="h-7 text-[10px] bg-slate-800 border-slate-700"
                        placeholder="最大"
                        value={dialogForm.warningMax || ''}
                        onChange={(e) => setDialogForm(f => ({ ...f, warningMax: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-red-400">报警范围</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      className="h-7 text-[10px] bg-slate-800 border-slate-700"
                      placeholder="最小"
                      value={dialogForm.alarmMin || ''}
                      onChange={(e) => setDialogForm(f => ({ ...f, alarmMin: e.target.value }))}
                    />
                    <span className="text-gray-500">-</span>
                    <Input
                      className="h-7 text-[10px] bg-slate-800 border-slate-700"
                      placeholder="最大"
                      value={dialogForm.alarmMax || ''}
                      onChange={(e) => setDialogForm(f => ({ ...f, alarmMax: e.target.value }))}
                    />
                  </div>
                </div>
              </>
            )}

            {dialogType === 'conversion' && (
              <>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-400">名称</Label>
                  <Input
                    className="h-8 text-[11px] bg-slate-800 border-slate-700"
                    placeholder="例如：加速度转速度"
                    value={dialogForm.name || ''}
                    onChange={(e) => setDialogForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-400">类别</Label>
                  <Select
                    value={dialogForm.category || ''}
                    onValueChange={(v) => setDialogForm(f => ({ ...f, category: v }))}
                  >
                    <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
                      <SelectValue placeholder="选择类别" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vibration">振动</SelectItem>
                      <SelectItem value="temperature">温度</SelectItem>
                      <SelectItem value="pressure">压力</SelectItem>
                      <SelectItem value="speed">转速</SelectItem>
                      <SelectItem value="current">电流</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-400">源单位</Label>
                    <Input
                      className="h-8 text-[11px] bg-slate-800 border-slate-700"
                      placeholder="g"
                      value={dialogForm.fromUnit || ''}
                      onChange={(e) => setDialogForm(f => ({ ...f, fromUnit: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-400">目标单位</Label>
                    <Input
                      className="h-8 text-[11px] bg-slate-800 border-slate-700"
                      placeholder="mm/s"
                      value={dialogForm.toUnit || ''}
                      onChange={(e) => setDialogForm(f => ({ ...f, toUnit: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-400">换算公式（x 代表源值）</Label>
                  <Input
                    className="h-8 text-[11px] bg-slate-800 border-slate-700 font-mono"
                    placeholder="x * 9.8"
                    value={dialogForm.formula || ''}
                    onChange={(e) => setDialogForm(f => ({ ...f, formula: e.target.value }))}
                  />
                </div>
              </>
            )}

            {dialogType === 'rule' && (
              <>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-400">规则名称</Label>
                  <Input
                    className="h-8 text-[11px] bg-slate-800 border-slate-700"
                    placeholder="例如：空值检查"
                    value={dialogForm.name || ''}
                    onChange={(e) => setDialogForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-400">规则类型</Label>
                    <Select
                      value={dialogForm.ruleType || ''}
                      onValueChange={(v) => setDialogForm(f => ({ ...f, ruleType: v }))}
                    >
                      <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
                        <SelectValue placeholder="选择类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="null">空值检查</SelectItem>
                        <SelectItem value="range">范围检查</SelectItem>
                        <SelectItem value="format">格式检查</SelectItem>
                        <SelectItem value="duplicate">重复检查</SelectItem>
                        <SelectItem value="outlier">异常值检测</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-400">处理方式</Label>
                    <Select
                      value={dialogForm.action || ''}
                      onValueChange={(v) => setDialogForm(f => ({ ...f, action: v }))}
                    >
                      <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
                        <SelectValue placeholder="选择处理" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reject">拒绝</SelectItem>
                        <SelectItem value="warn">警告</SelectItem>
                        <SelectItem value="fix">自动修复</SelectItem>
                        <SelectItem value="tag">标记</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-400">应用字段（* 表示所有字段）</Label>
                  <Input
                    className="h-8 text-[11px] bg-slate-800 border-slate-700 font-mono"
                    placeholder="*"
                    value={dialogForm.field || ''}
                    onChange={(e) => setDialogForm(f => ({ ...f, field: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-400">检查条件</Label>
                  <Input
                    className="h-8 text-[11px] bg-slate-800 border-slate-700 font-mono"
                    placeholder="value == null"
                    value={dialogForm.condition || ''}
                    onChange={(e) => setDialogForm(f => ({ ...f, condition: e.target.value }))}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setShowAddDialog(false)}>
              取消
            </Button>
            <Button size="sm" className="h-7 text-[10px]" onClick={handleAddItem}>
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
