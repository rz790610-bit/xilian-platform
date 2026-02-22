/**
 * Phase 2 — 推理引擎动态配置管理器
 * 支持自由配置、可增加、可修改、可删除配置项
 */
import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
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
  enabled: boolean;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

const MODULE_META: Record<string, { label: string; icon: string; color: string }> = {
  orchestrator: { label: '混合编排器', icon: '🎯', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  causalGraph: { label: '因果图', icon: '🕸️', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  experiencePool: { label: '经验池', icon: '🧠', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  physicsVerifier: { label: '物理验证器', icon: '⚛️', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  feedbackLoop: { label: '反馈环', icon: '🔄', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  custom: { label: '自定义', icon: '⚙️', color: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
};

export default function ReasoningEngineConfig() {
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newItem, setNewItem] = useState({
    module: 'custom',
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

  const configQuery = trpc.evoCognition.reasoningEngine.listConfigItems.useQuery(
    selectedModule ? { module: selectedModule } : undefined,
    { refetchOnWindowFocus: false }
  );

  const updateMutation = trpc.evoCognition.reasoningEngine.updateConfigItem.useMutation({
    onSuccess: (data) => {
      if (data.success) { configQuery.refetch(); setEditingId(null); toast.success('配置已更新'); }
      else toast.error(data.error || '更新失败');
    },
  });

  const addMutation = trpc.evoCognition.reasoningEngine.addConfigItem.useMutation({
    onSuccess: (data) => {
      if (data.success) { configQuery.refetch(); setShowAddDialog(false); resetNewItem(); toast.success('配置项已新增'); }
      else toast.error(data.error || '新增失败');
    },
  });

  const deleteMutation = trpc.evoCognition.reasoningEngine.deleteConfigItem.useMutation({
    onSuccess: (data) => {
      if (data.success) { configQuery.refetch(); toast.success('配置项已删除'); }
      else toast.error(data.error || '删除失败');
    },
  });

  const resetMutation = trpc.evoCognition.reasoningEngine.resetConfigItem.useMutation({
    onSuccess: (data) => {
      if (data.success) { configQuery.refetch(); toast.success('已重置为默认值'); }
      else toast.error(data.error || '重置失败');
    },
  });

  // Shadow Mode
  const shadowQuery = trpc.evoCognition.reasoningEngine.getShadowModeStats.useQuery(undefined, { retry: 2, refetchInterval: 10000 });
  const promoteMutation = trpc.evoCognition.reasoningEngine.forcePromote.useMutation({ onSuccess: () => { shadowQuery.refetch(); toast.success('已晋升 Challenger'); } });
  const rollbackMutation = trpc.evoCognition.reasoningEngine.forceRollback.useMutation({ onSuccess: () => { shadowQuery.refetch(); toast.success('已回退 Champion'); } });
  const shadowModeMutation = trpc.evoCognition.reasoningEngine.enterShadowMode.useMutation({ onSuccess: () => { shadowQuery.refetch(); toast.success('已进入 Shadow'); } });

  const items: ConfigItem[] = (configQuery.data?.items ?? []) as ConfigItem[];
  const source = configQuery.data?.source ?? 'memory';
  const shadow = shadowQuery.data;

  // 按 module → configGroup 分组
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, ConfigItem[]>>();
    for (const item of items) {
      if (!map.has(item.module)) map.set(item.module, new Map());
      const groupMap = map.get(item.module)!;
      if (!groupMap.has(item.configGroup)) groupMap.set(item.configGroup, []);
      groupMap.get(item.configGroup)!.push(item);
    }
    return map;
  }, [items]);

  function resetNewItem() {
    setNewItem({ module: 'custom', configGroup: 'general', configKey: '', configValue: '', valueType: 'string', label: '', description: '', unit: '', constraintMin: '', constraintMax: '', constraintStep: '' });
  }

  function handleSaveEdit(item: ConfigItem) {
    // 校验数字类型的范围
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
      module: newItem.module,
      configGroup: newItem.configGroup,
      configKey: newItem.configKey,
      configValue: newItem.configValue,
      valueType: newItem.valueType,
      label: newItem.label,
      description: newItem.description || undefined,
      unit: newItem.unit || undefined,
      constraints,
    });
  }

  function renderValueEditor(item: ConfigItem) {
    if (editingId === item.id) {
      return (
        <div className="flex items-center gap-2">
          {item.valueType === 'boolean' ? (
            <Switch
              checked={editValue === 'true'}
              onCheckedChange={(v) => setEditValue(v ? 'true' : 'false')}
            />
          ) : (
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              type={item.valueType === 'number' ? 'number' : 'text'}
              min={item.constraints?.min}
              max={item.constraints?.max}
              step={item.constraints?.step}
              className="h-7 w-32 text-xs bg-background"
            />
          )}
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-green-400" onClick={() => handleSaveEdit(item)}>
            保存
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => setEditingId(null)}>
            取消
          </Button>
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
        {isModified && (
          <span className="text-[10px] text-muted-foreground line-through">{item.defaultValue}</span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => { setEditingId(item.id); setEditValue(item.configValue); }}
        >
          编辑
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Shadow Mode 控制面板 */}
      {shadow && (
        <Card className="border-border/50">
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              🔄 Champion-Challenger Shadow Mode
              <Badge variant={shadow.mode === 'shadow' ? 'default' : shadow.mode === 'challenger' ? 'destructive' : 'secondary'} className="text-[10px]">
                {shadow.mode === 'champion' ? '🛡️ Champion' : shadow.mode === 'challenger' ? '🏆 Challenger' : '🔄 Shadow'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="grid grid-cols-5 gap-3 mb-3">
              <div className="text-center">
                <div className="text-lg font-mono font-bold">{shadow.totalSessions}</div>
                <div className="text-[10px] text-muted-foreground">总会话</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-mono font-bold text-emerald-400">{(shadow.challengerHitRate * 100).toFixed(1)}%</div>
                <div className="text-[10px] text-muted-foreground">Challenger 命中</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-mono font-bold text-blue-400">{(shadow.championHitRate * 100).toFixed(1)}%</div>
                <div className="text-[10px] text-muted-foreground">Champion 命中</div>
              </div>
              <div className="text-center">
                <div className={`text-lg font-mono font-bold ${shadow.hitRateDelta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {shadow.hitRateDelta > 0 ? '+' : ''}{shadow.hitRateDelta.toFixed(1)}pp
                </div>
                <div className="text-[10px] text-muted-foreground">命中率差</div>
              </div>
              <div className="text-center">
                <div className={`text-lg font-mono font-bold ${shadow.pValue < 0.05 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {shadow.pValue.toFixed(3)}
                </div>
                <div className="text-[10px] text-muted-foreground">p 值</div>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-border/50">
              <Button size="sm" className="h-7 text-xs" onClick={() => promoteMutation.mutate()} disabled={shadow.mode === 'challenger'}>
                晋升 Challenger
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => rollbackMutation.mutate()} disabled={shadow.mode === 'champion'}>
                回退 Champion
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => shadowModeMutation.mutate()} disabled={shadow.mode === 'shadow'}>
                进入 Shadow
              </Button>
              <div className="flex-1" />
              <Badge variant={shadow.promotionReady ? 'default' : 'secondary'} className="text-[10px]">
                {shadow.promotionReady ? '✓ 晋升条件满足' : '✗ 晋升条件未满足'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">配置注册表</h3>
          <Badge variant="outline" className="text-[10px]">
            {source === 'database' ? '📦 数据库' : '💾 内存'}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {items.length} 项
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 模块筛选 */}
          <div className="flex items-center gap-1 flex-wrap">
            <Button
              size="sm"
              variant={selectedModule === null ? 'default' : 'ghost'}
              className="h-6 px-2 text-[10px]"
              onClick={() => setSelectedModule(null)}
            >
              全部
            </Button>
            {Object.entries(MODULE_META).map(([key, meta]) => (
              <Button
                key={key}
                size="sm"
                variant={selectedModule === key ? 'default' : 'ghost'}
                className="h-6 px-2 text-[10px]"
                onClick={() => setSelectedModule(key)}
              >
                {meta.icon} {meta.label}
              </Button>
            ))}
          </div>

          {/* 新增配置项 */}
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-7 text-xs">+ 新增配置项</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>新增配置项</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">所属模块</label>
                    <select
                      className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={newItem.module}
                      onChange={(e) => setNewItem({ ...newItem, module: e.target.value })}
                    >
                      {Object.entries(MODULE_META).map(([k, v]) => (
                        <option key={k} value={k}>{v.icon} {v.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">分组</label>
                    <Input className="h-8 text-xs" value={newItem.configGroup} onChange={(e) => setNewItem({ ...newItem, configGroup: e.target.value })} placeholder="general" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">配置键 (key)</label>
                    <Input className="h-8 text-xs" value={newItem.configKey} onChange={(e) => setNewItem({ ...newItem, configKey: e.target.value })} placeholder="myConfigKey" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">值类型</label>
                    <select
                      className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={newItem.valueType}
                      onChange={(e) => setNewItem({ ...newItem, valueType: e.target.value as any })}
                    >
                      <option value="number">数字</option>
                      <option value="string">字符串</option>
                      <option value="boolean">布尔</option>
                      <option value="json">JSON</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">中文标签</label>
                  <Input className="h-8 text-xs" value={newItem.label} onChange={(e) => setNewItem({ ...newItem, label: e.target.value })} placeholder="配置项名称" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">配置值</label>
                  <Input className="h-8 text-xs" value={newItem.configValue} onChange={(e) => setNewItem({ ...newItem, configValue: e.target.value })} placeholder="值" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">描述</label>
                  <Input className="h-8 text-xs" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} placeholder="可选" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">单位</label>
                    <Input className="h-8 text-xs" value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} placeholder="ms" />
                  </div>
                  {newItem.valueType === 'number' && (
                    <>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">最小值</label>
                        <Input className="h-8 text-xs" type="number" value={newItem.constraintMin} onChange={(e) => setNewItem({ ...newItem, constraintMin: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">最大值</label>
                        <Input className="h-8 text-xs" type="number" value={newItem.constraintMax} onChange={(e) => setNewItem({ ...newItem, constraintMax: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">步长</label>
                        <Input className="h-8 text-xs" type="number" value={newItem.constraintStep} onChange={(e) => setNewItem({ ...newItem, constraintStep: e.target.value })} />
                      </div>
                    </>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowAddDialog(false)}>取消</Button>
                <Button onClick={handleAdd} disabled={!newItem.configKey || !newItem.label || !newItem.configValue}>
                  新增
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 重置模块 */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    if (selectedModule) {
                      resetMutation.mutate({ module: selectedModule });
                    }
                  }}
                  disabled={!selectedModule}
                >
                  重置模块
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">将当前模块所有配置项重置为默认值</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* 配置项列表 */}
      {configQuery.isLoading ? (
        <div className="flex items-center justify-center py-8 gap-2">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground">加载配置中...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([module, groupMap]) => {
            const meta = MODULE_META[module] || MODULE_META.custom;
            return (
              <Card key={module} className="border-border/50">
                <CardHeader className="py-2 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span>{meta.icon}</span>
                    <span>{meta.label}</span>
                    <Badge variant="outline" className={`text-[10px] ${meta.color}`}>
                      {Array.from(groupMap.values()).reduce((s, g) => s + g.length, 0)} 项
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-3">
                  {Array.from(groupMap.entries()).map(([group, groupItems]) => (
                    <div key={group}>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 border-b border-border/30 pb-1">
                        {group}
                      </div>
                      <div className="space-y-0.5">
                        {groupItems.map((item) => (
                          <div
                            key={item.id}
                            className="group flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-foreground truncate">{item.label}</span>
                                        <span className="text-[10px] text-muted-foreground font-mono">{item.configKey}</span>
                                        {item.isBuiltin && (
                                          <Badge variant="outline" className="text-[9px] h-4 px-1">内置</Badge>
                                        )}
                                        {!item.enabled && (
                                          <Badge variant="secondary" className="text-[9px] h-4 px-1">已禁用</Badge>
                                        )}
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <p className="text-xs">{item.description || '无描述'}</p>
                                    {item.constraints && (
                                      <p className="text-[10px] text-muted-foreground mt-1">
                                        范围: [{item.constraints.min ?? '-∞'}, {item.constraints.max ?? '+∞'}]
                                        {item.constraints.step && ` 步长: ${item.constraints.step}`}
                                      </p>
                                    )}
                                    {item.defaultValue && (
                                      <p className="text-[10px] text-muted-foreground">默认值: {item.defaultValue}</p>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {renderValueEditor(item)}

                              {/* 重置单项 */}
                              {item.defaultValue && item.configValue !== item.defaultValue && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[10px] text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => resetMutation.mutate({ id: item.id })}
                                >
                                  重置
                                </Button>
                              )}

                              {/* 删除（仅非内置） */}
                              {!item.isBuiltin && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[10px] text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => {
                                    if (confirm(`确定删除配置项 "${item.label}" (${item.configKey})?`)) {
                                      deleteMutation.mutate({ id: item.id });
                                    }
                                  }}
                                >
                                  删除
                                </Button>
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

          {grouped.size === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              暂无配置项{selectedModule && `（模块: ${MODULE_META[selectedModule]?.label || selectedModule}）`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 兼容旧的命名导出
export { ReasoningEngineConfig };
