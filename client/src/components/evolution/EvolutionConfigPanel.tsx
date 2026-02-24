/**
 * 进化引擎统一配置面板
 * 复用 engine_config_registry 表，通过 evoEvolution.config 路由访问
 * 支持按模块过滤、分组展示、inline 编辑、新增、删除、重置
 */
import { useState, useMemo, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

interface ConfigItem {
  id: number;
  module: string;
  configGroup: string;
  configKey: string;
  configValue: string;
  valueType: 'number' | 'string' | 'boolean' | 'json';
  defaultValue: string | null;
  label: string;
  description: string | null;
  unit: string | null;
  constraints: { min?: number; max?: number; step?: number; options?: string[] } | null;
  sortOrder: number;
  enabled: number;
  isBuiltin: number;
  impactScore: number | null;
  impactDescription: string | null;
  configVersion: string;
  createdAt: string;
  updatedAt: string;
}

const MODULE_META: Record<string, { label: string; icon: string; color: string }> = {
  shadowEvaluator: { label: '影子评估器', icon: '👻', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  interventionRate: { label: '干预率引擎', icon: '🚨', color: 'bg-red-500/10 text-red-400 border-red-500/30' },
  dualFlywheel: { label: '双飞轮编排', icon: '🔄', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  e2eAgent: { label: 'E2E Agent', icon: '🤖', color: 'bg-violet-500/10 text-violet-400 border-violet-500/30' },
  modelMerge: { label: '模型合并', icon: '🧬', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  autoLabeling: { label: '自动标注', icon: '🏷️', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  dojoScheduler: { label: 'Dojo 调度器', icon: '⚡', color: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  fleetPlanner: { label: '车队规划器', icon: '🚗', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  otaCanary: { label: 'OTA 金丝雀', icon: '🐦', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
  simulationEngine: { label: '仿真引擎', icon: '🎮', color: 'bg-pink-500/10 text-pink-400 border-pink-500/30' },
  metaLearner: { label: '元学习器', icon: '🧠', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
};

interface EvolutionConfigPanelProps {
  /** 只显示指定模块的配置（传 undefined 显示全部） */
  modules?: string[];
  /** 面板标题 */
  title?: string;
  /** 是否紧凑模式 */
  compact?: boolean;
}

export default function EvolutionConfigPanel({ modules, title, compact }: EvolutionConfigPanelProps) {
  const [selectedModule, setSelectedModule] = useState<string | null>(modules?.[0] ?? null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newItem, setNewItem] = useState({
    module: modules?.[0] ?? 'shadowEvaluator',
    configGroup: 'general',
    configKey: '',
    configValue: '',
    valueType: 'string' as 'number' | 'string' | 'boolean' | 'json',
    label: '',
    description: '',
    unit: '',
    constraintMin: '',
    constraintMax: '',
    constraintStep: '',
  });

  const configQuery = trpc.evoEvolution.config.list.useQuery(
    selectedModule ? { module: selectedModule } : undefined,
    { refetchOnWindowFocus: false }
  );

  const seedMutation = trpc.evoEvolution.config.seed.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        configQuery.refetch();
        toast.success(data.message);
      }
    },
  });

  const updateMutation = trpc.evoEvolution.config.update.useMutation({
    onSuccess: (data) => {
      if (data.success) { configQuery.refetch(); setEditingId(null); toast.success('配置已更新'); }
      else toast.error(data.error || '更新失败');
    },
  });

  const addMutation = trpc.evoEvolution.config.add.useMutation({
    onSuccess: (data) => {
      if (data.success) { configQuery.refetch(); setShowAddDialog(false); resetNewItem(); toast.success('配置项已新增'); }
      else toast.error(data.error || '新增失败');
    },
  });

  const deleteMutation = trpc.evoEvolution.config.delete.useMutation({
    onSuccess: (data) => {
      if (data.success) { configQuery.refetch(); toast.success('配置项已删除'); }
      else toast.error(data.error || '删除失败');
    },
  });

  const resetMutation = trpc.evoEvolution.config.reset.useMutation({
    onSuccess: (data) => {
      if (data.success) { configQuery.refetch(); toast.success('已重置为默认值'); }
      else toast.error(data.error || '重置失败');
    },
  });

  // 自动种子化
  useEffect(() => {
    if (configQuery.data && configQuery.data.items.length === 0) {
      seedMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configQuery.data]);

  const items: ConfigItem[] = (configQuery.data?.items ?? []) as ConfigItem[];

  // 按 module 过滤（如果指定了 modules）
  const filteredItems = useMemo(() => {
    if (!modules) return items;
    return items.filter(i => modules.includes(i.module));
  }, [items, modules]);

  // 按 module -> configGroup 分组
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, ConfigItem[]>>();
    for (const item of filteredItems) {
      if (!map.has(item.module)) map.set(item.module, new Map());
      const groupMap = map.get(item.module)!;
      if (!groupMap.has(item.configGroup)) groupMap.set(item.configGroup, []);
      groupMap.get(item.configGroup)!.push(item);
    }
    return map;
  }, [filteredItems]);

  const availableModules = modules ?? Array.from(new Set(items.map(i => i.module)));

  function resetNewItem() {
    setNewItem({ module: modules?.[0] ?? 'shadowEvaluator', configGroup: 'general', configKey: '', configValue: '', valueType: 'string', label: '', description: '', unit: '', constraintMin: '', constraintMax: '', constraintStep: '' });
  }

  function handleSaveEdit(item: ConfigItem) {
    if (item.valueType === 'number' && item.constraints) {
      const num = parseFloat(editValue);
      if (isNaN(num)) { toast.error('请输入有效数字'); return; }
      if (item.constraints.min !== undefined && num < item.constraints.min) { toast.error(`值不能小于 ${item.constraints.min}`); return; }
      if (item.constraints.max !== undefined && num > item.constraints.max) { toast.error(`值不能大于 ${item.constraints.max}`); return; }
    }
    updateMutation.mutate({ id: item.id, configValue: editValue });
  }

  function handleAdd() {
    const constraints = newItem.valueType === 'number' ? {
      min: newItem.constraintMin ? parseFloat(newItem.constraintMin) : undefined,
      max: newItem.constraintMax ? parseFloat(newItem.constraintMax) : undefined,
      step: newItem.constraintStep ? parseFloat(newItem.constraintStep) : undefined,
    } : undefined;
    addMutation.mutate({
      module: newItem.module, configGroup: newItem.configGroup,
      configKey: newItem.configKey, configValue: newItem.configValue,
      valueType: newItem.valueType, label: newItem.label,
      description: newItem.description || undefined, unit: newItem.unit || undefined,
      constraints,
    });
  }

  function renderValueEditor(item: ConfigItem) {
    if (editingId === item.id) {
      return (
        <div className="flex items-center gap-2">
          {item.valueType === 'boolean' ? (
            <Switch checked={editValue === 'true'} onCheckedChange={(v) => setEditValue(v ? 'true' : 'false')} />
          ) : item.constraints?.options ? (
            <Select value={editValue} onValueChange={setEditValue}>
              <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {item.constraints.options.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={editValue} onChange={(e) => setEditValue(e.target.value)}
              type={item.valueType === 'number' ? 'number' : 'text'}
              min={item.constraints?.min} max={item.constraints?.max} step={item.constraints?.step}
              className="h-7 w-32 text-xs bg-background"
            />
          )}
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-green-400" onClick={() => handleSaveEdit(item)}>保存</Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => setEditingId(null)}>取消</Button>
        </div>
      );
    }

    const isModified = item.defaultValue !== null && item.configValue !== item.defaultValue;
    return (
      <div className="flex items-center gap-2">
        {item.valueType === 'boolean' ? (
          <Badge variant={item.configValue === 'true' ? 'default' : 'secondary'} className="text-xs">
            {item.configValue === 'true' ? '启用' : '禁用'}
          </Badge>
        ) : (
          <span className={`font-mono text-sm ${isModified ? 'text-amber-400' : 'text-foreground'}`}>
            {item.configValue}
            {item.unit && <span className="text-muted-foreground ml-1 text-xs">{item.unit}</span>}
          </span>
        )}
        {isModified && <span className="text-[10px] text-muted-foreground line-through">{item.defaultValue}</span>}
        <Button
          size="sm" variant="ghost"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => { setEditingId(item.id); setEditValue(item.configValue); }}
        >编辑</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 模块选择器 + 操作按钮 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {!modules && (
            <Button
              size="sm" variant={selectedModule === null ? 'default' : 'outline'}
              className="h-7 text-xs" onClick={() => setSelectedModule(null)}
            >全部</Button>
          )}
          {availableModules.map(mod => {
            const meta = MODULE_META[mod] ?? { label: mod, icon: '⚙️', color: 'bg-gray-500/10 text-gray-400 border-gray-500/30' };
            return (
              <Button
                key={mod} size="sm"
                variant={selectedModule === mod ? 'default' : 'outline'}
                className={`h-7 text-xs ${selectedModule !== mod ? meta.color : ''}`}
                onClick={() => setSelectedModule(mod)}
              >
                {meta.icon} {meta.label}
              </Button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs">+ 新增配置</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>新增配置项</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">模块</label>
                    <Select value={newItem.module} onValueChange={v => setNewItem(p => ({ ...p, module: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {availableModules.map(mod => (
                          <SelectItem key={mod} value={mod}>{MODULE_META[mod]?.label ?? mod}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">分组</label>
                    <Input value={newItem.configGroup} onChange={e => setNewItem(p => ({ ...p, configGroup: e.target.value }))} className="h-8 text-xs" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">配置键</label>
                  <Input value={newItem.configKey} onChange={e => setNewItem(p => ({ ...p, configKey: e.target.value }))} className="h-8 text-xs" placeholder="如 maxRetries" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">标签</label>
                  <Input value={newItem.label} onChange={e => setNewItem(p => ({ ...p, label: e.target.value }))} className="h-8 text-xs" placeholder="如 最大重试次数" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">值类型</label>
                    <Select value={newItem.valueType} onValueChange={(v: any) => setNewItem(p => ({ ...p, valueType: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="number">数字</SelectItem>
                        <SelectItem value="string">字符串</SelectItem>
                        <SelectItem value="boolean">布尔</SelectItem>
                        <SelectItem value="json">JSON</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">值</label>
                    <Input value={newItem.configValue} onChange={e => setNewItem(p => ({ ...p, configValue: e.target.value }))} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">描述</label>
                    <Input value={newItem.description} onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))} className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">单位</label>
                    <Input value={newItem.unit} onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))} className="h-8 text-xs" placeholder="如 ms, %, 次" />
                  </div>
                </div>
                {newItem.valueType === 'number' && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">最小值</label>
                      <Input type="number" value={newItem.constraintMin} onChange={e => setNewItem(p => ({ ...p, constraintMin: e.target.value }))} className="h-8 text-xs" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">最大值</label>
                      <Input type="number" value={newItem.constraintMax} onChange={e => setNewItem(p => ({ ...p, constraintMax: e.target.value }))} className="h-8 text-xs" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">步长</label>
                      <Input type="number" value={newItem.constraintStep} onChange={e => setNewItem(p => ({ ...p, constraintStep: e.target.value }))} className="h-8 text-xs" />
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button size="sm" variant="outline" onClick={() => setShowAddDialog(false)}>取消</Button>
                <Button size="sm" onClick={handleAdd} disabled={!newItem.configKey || !newItem.label}>新增</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {selectedModule && (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
              onClick={() => resetMutation.mutate({ module: selectedModule })}
            >重置模块默认值</Button>
          )}
        </div>
      </div>

      {/* 配置项列表 */}
      {configQuery.isLoading ? (
        <div className="text-center text-muted-foreground py-8">加载配置中...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-3">暂无配置项</p>
          <Button size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
            {seedMutation.isPending ? '初始化中...' : '🌱 初始化进化引擎配置'}
          </Button>
        </div>
      ) : (
        <TooltipProvider>
          {Array.from(grouped.entries()).map(([mod, groupMap]) => {
            const meta = MODULE_META[mod] ?? { label: mod, icon: '⚙️', color: 'bg-gray-500/10 text-gray-400 border-gray-500/30' };
            return (
              <Card key={mod} className="border-border/50">
                <CardHeader className="py-2 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span>{meta.icon}</span>
                    <span>{meta.label}</span>
                    <Badge variant="outline" className={`text-[10px] ${meta.color}`}>{mod}</Badge>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {Array.from(groupMap.values()).flat().length} 项
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-3">
                  {Array.from(groupMap.entries()).map(([group, groupItems]) => (
                    <div key={group}>
                      <div className="text-[11px] text-muted-foreground font-medium mb-1.5 uppercase tracking-wider">{group}</div>
                      <div className="space-y-1">
                        {groupItems.map(item => (
                          <div key={item.id} className="group flex items-center justify-between py-1 px-2 rounded hover:bg-muted/30 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm truncate cursor-help">{item.label}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <p className="text-xs">{item.description || '无描述'}</p>
                                  <p className="text-[10px] text-muted-foreground mt-1">Key: {item.configKey}</p>
                                  {item.constraints && (
                                    <p className="text-[10px] text-muted-foreground">
                                      范围: [{item.constraints.min ?? '-∞'}, {item.constraints.max ?? '+∞'}]
                                      {item.constraints.step ? ` 步长: ${item.constraints.step}` : ''}
                                    </p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                              {item.isBuiltin ? (
                                <Badge variant="outline" className="text-[9px] h-4 px-1">内置</Badge>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1">
                              {renderValueEditor(item)}
                              {!item.isBuiltin && (
                                <Button size="sm" variant="ghost"
                                  className="h-6 px-1 text-xs text-red-400 opacity-0 group-hover:opacity-100"
                                  onClick={() => { if (confirm('确定删除此配置项？')) deleteMutation.mutate({ id: item.id }); }}
                                >删除</Button>
                              )}
                              {item.defaultValue && item.configValue !== item.defaultValue && (
                                <Button size="sm" variant="ghost"
                                  className="h-6 px-1 text-xs text-blue-400 opacity-0 group-hover:opacity-100"
                                  onClick={() => resetMutation.mutate({ id: item.id })}
                                >重置</Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </TooltipProvider>
      )}
    </div>
  );
}
