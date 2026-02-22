/**
 * ============================================================================
 * 数字孪生 — 运行配置（赋能工具）
 * ============================================================================
 *
 * 7 层架构配置面板：
 *   L1 数据采集层 → L2 同步引擎层 → L3 世界模型层 → L4 认知推理层
 *   → L5 仿真引擎层 → L6 事件分发层 → L7 异步任务层
 *
 * 功能：
 *   - 层级熔断开关（一键切断/启用）
 *   - 模块配置面板（查看/编辑/重置配置项）
 *   - 配置变更影响评估（ImpactScore）
 *   - 审计日志查看
 *   - 配置快照 + 一键回滚
 *   - 一键仿真（沙箱模式）
 */
import { useState, useMemo, useCallback } from 'react';
import { PageCard } from '@/components/common/PageCard';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/common/Toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  StateSyncPanel, WorldModelPanel, OrchestratorPanel,
  GrokEnhancerPanel, SimulationPanel,
  ExperiencePoolPanel, CausalGraphPanel, FeedbackLoopPanel,
  PhysicsVerifierPanel, RULPredictorPanel,
  ReplayEnginePanel, EventBusPanel, OutboxRelayPanel, BullMQPanel,
  UncertaintyPanel, VectorStorePanel, DataCollectionPanel,
  ConfigDiffView, SimulateRunner, OTelMetricsPanel,
} from './config-panels';

// ============================================================================
// 类型定义
// ============================================================================
interface LayerInfo {
  id: number;
  layerId: string;
  layerName: string;
  enabled: number;
  priority: number;
  description: string | null;
  modules: string[];
}

interface ConfigItem {
  id: number;
  module: string;
  configKey: string;
  configValue: unknown;
  defaultValue: unknown;
  label: string | null;
  unit: string | null;
  configGroup: string | null;
  constraints: unknown;
  description: string | null;
  enabled: number;
  sortOrder: number;
}

// ============================================================================
// 常量
// ============================================================================
const LAYER_ICONS: Record<string, string> = {
  L1: '📡', L2: '🔄', L3: '🌐', L4: '🧠', L5: '🔮', L6: '📨', L7: '⚙️',
};

const LAYER_COLORS: Record<string, string> = {
  L1: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  L2: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  L3: 'bg-violet-500/10 text-violet-600 border-violet-500/30',
  L4: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  L5: 'bg-rose-500/10 text-rose-600 border-rose-500/30',
  L6: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/30',
  L7: 'bg-gray-500/10 text-gray-600 border-gray-500/30',
};

const MODULE_LABELS: Record<string, string> = {
  deviceSampling: '设备采样配置',
  stateSyncEngine: '状态同步引擎',
  worldModel: '世界模型',
  physicsValidator: '物理验证器',
  vectorStore: '向量存储',
  hybridOrchestrator: '混合编排器',
  grokEnhancer: 'Grok 增强器',
  experiencePool: '经验池',
  causalGraph: '因果图',
  feedbackLoop: '知识反馈环',
  uncertaintyQuantifier: '不确定性量化器',
  rulPredictor: 'RUL 预测器',
  simulationEngine: '仿真引擎',
  replayEngine: '回放引擎',
  outboxRelay: 'Outbox 中继',
  twinEventBus: '事件总线',
  bullmq: 'BullMQ Worker',
};

const IMPACT_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

function getImpactLevel(score: number): string {
  if (score < 25) return 'low';
  if (score < 50) return 'medium';
  if (score < 75) return 'high';
  return 'critical';
}

// ============================================================================
// 主组件
// ============================================================================
export default function RuntimeConfigPage() {
  const toast = useToast();
  const [selectedLayer, setSelectedLayer] = useState<string>('L1');
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<ConfigItem | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [showSimulateDialog, setShowSimulateDialog] = useState(false);
  const [activePanel, setActivePanel] = useState<'config' | 'audit' | 'snapshots' | 'diff' | 'simulate' | 'otel'>('config');

  // ========================================================================
  // tRPC Queries
  // ========================================================================
  const layersQuery = trpc.evoPipeline.twinConfig.listLayers.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const layers = (layersQuery.data ?? []) as LayerInfo[];

  const configsQuery = trpc.evoPipeline.twinConfig.listConfigs.useQuery(
    { layerId: selectedLayer },
    { enabled: !!selectedLayer },
  );
  const configs = (configsQuery.data ?? []) as ConfigItem[];

  const moduleConfigsQuery = trpc.evoPipeline.twinConfig.getModuleConfigs.useQuery(
    { module: selectedModule! },
    { enabled: !!selectedModule },
  );

  const auditLogQuery = trpc.evoPipeline.twinConfig.getAuditLog.useQuery(
    { limit: 50 },
    { enabled: showAuditLog || activePanel === 'audit' },
  );

  const snapshotsQuery = trpc.evoPipeline.twinConfig.listSnapshots.useQuery(
    { limit: 20 },
    { enabled: activePanel === 'snapshots' },
  );

  // ========================================================================
  // tRPC Mutations
  // ========================================================================
  const toggleLayerMutation = trpc.evoPipeline.twinConfig.toggleLayer.useMutation({
    onSuccess: () => {
      layersQuery.refetch();
      toast.success('层级开关已更新');
    },
    onError: (err) => toast.error('操作失败: ' + err.message),
  });

  const updateConfigMutation = trpc.evoPipeline.twinConfig.updateConfig.useMutation({
    onSuccess: (data) => {
      configsQuery.refetch();
      moduleConfigsQuery.refetch();
      setEditingConfig(null);
      const level = getImpactLevel(data.impactScore);
      toast.success('配置已更新: ' + `影响评分: ${data.impactScore}/100 (${level})`);
    },
    onError: (err) => toast.error('更新失败: ' + err.message),
  });

  const resetConfigMutation = trpc.evoPipeline.twinConfig.resetConfig.useMutation({
    onSuccess: () => {
      configsQuery.refetch();
      moduleConfigsQuery.refetch();
      toast.success('已重置为默认值');
    },
    onError: (err) => toast.error('重置失败: ' + err.message),
  });

  const createSnapshotMutation = trpc.evoPipeline.twinConfig.createSnapshot.useMutation({
    onSuccess: (data) => {
      snapshotsQuery.refetch();
      setShowSnapshotDialog(false);
      setSnapshotName('');
      toast.success('快照已创建: ' + `快照 ID: ${data.snapshotId}`);
    },
    onError: (err) => toast.error('创建失败: ' + err.message),
  });

  const rollbackMutation = trpc.evoPipeline.twinConfig.rollbackToSnapshot.useMutation({
    onSuccess: (data) => {
      configsQuery.refetch();
      layersQuery.refetch();
      toast.success('回滚成功: ' + `已恢复 ${data.restoredCount} 项配置`);
    },
    onError: (err) => toast.error('回滚失败: ' + err.message),
  });

  const simulateMutation = trpc.evoPipeline.twinConfig.simulateConfig.useMutation({
    onSuccess: (data) => {
      setShowSimulateDialog(false);
      toast.success('仿真已启动: ' + `运行 ID: ${data.runId}`);
    },
    onError: (err) => toast.error('仿真失败: ' + err.message),
  });

  const toggleModuleMutation = trpc.evoPipeline.twinConfig.toggleModule.useMutation({
    onSuccess: () => {
      configsQuery.refetch();
      toast.success('模块状态已更新');
    },
    onError: (err) => toast.error('操作失败: ' + err.message),
  });

  // ========================================================================
  // 分组逻辑
  // ========================================================================
  const currentLayer = layers.find(l => l.layerId === selectedLayer);
  const modulesInLayer = currentLayer?.modules ?? [];

  const groupedConfigs = useMemo(() => {
    const groups: Record<string, ConfigItem[]> = {};
    const targetConfigs = selectedModule
      ? configs.filter(c => c.module === selectedModule)
      : configs;
    for (const c of targetConfigs) {
      const group = c.configGroup ?? 'general';
      if (!groups[group]) groups[group] = [];
      groups[group].push(c);
    }
    return groups;
  }, [configs, selectedModule]);

  // ========================================================================
  // 渲染
  // ========================================================================
  return (
    <div className="space-y-2">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <Button
            size="sm" variant={activePanel === 'config' ? 'default' : 'outline'}
            className="h-6 text-[10px]"
            onClick={() => setActivePanel('config')}
          >
            ⚙️ 配置管理
          </Button>
          <Button
            size="sm" variant={activePanel === 'audit' ? 'default' : 'outline'}
            className="h-6 text-[10px]"
            onClick={() => setActivePanel('audit')}
          >
            📋 审计日志
          </Button>
          <Button
            size="sm" variant={activePanel === 'snapshots' ? 'default' : 'outline'}
            className="h-6 text-[10px]"
            onClick={() => setActivePanel('snapshots')}
          >
            📸 配置快照
          </Button>
          <Button
            size="sm" variant={activePanel === 'diff' ? 'default' : 'outline'}
            className="h-6 text-[10px]"
            onClick={() => setActivePanel('diff')}
          >
            🔍 配置对比
          </Button>
          <Button
            size="sm" variant={activePanel === 'simulate' ? 'default' : 'outline'}
            className="h-6 text-[10px]"
            onClick={() => setActivePanel('simulate')}
          >
            🧪 一键仿真
          </Button>
          <Button
            size="sm" variant={activePanel === 'otel' ? 'default' : 'outline'}
            className="h-6 text-[10px]"
            onClick={() => setActivePanel('otel')}
          >
            📈 OTel 指标
          </Button>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-6 text-[10px]"
            onClick={() => setShowSnapshotDialog(true)}>
            💾 创建快照
          </Button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* 配置管理面板 */}
      {/* ================================================================ */}
      {activePanel === 'config' && (
        <div className="grid grid-cols-[200px_1fr] gap-2">
          {/* 左侧：7 层树形导航 */}
          <div className="space-y-1">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
              架构层级
            </div>
            {layers.map((layer) => (
              <div key={layer.layerId}>
                {/* 层级节点 */}
                <div
                  className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-left transition-colors cursor-pointer ${
                    selectedLayer === layer.layerId && !selectedModule
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted/50 text-foreground'
                  }`}
                >
                  <div
                    className="flex items-center gap-1.5 flex-1 min-w-0"
                    onClick={() => { setSelectedLayer(layer.layerId); setSelectedModule(null); }}
                  >
                    <span className="text-sm">{LAYER_ICONS[layer.layerId] ?? '📦'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-medium truncate">{layer.layerName}</div>
                      <div className="text-[9px] text-muted-foreground">{layer.layerId}</div>
                    </div>
                  </div>
                  {/* 层级熔断开关 */}
                  <Switch
                    checked={!!layer.enabled}
                    onCheckedChange={(checked) => {
                      toggleLayerMutation.mutate({ layerId: layer.layerId, enabled: checked });
                    }}
                    className="scale-[0.6]"
                  />
                </div>
                {/* 模块子节点 */}
                {selectedLayer === layer.layerId && layer.modules.map((mod) => (
                  <button
                    key={mod}
                    onClick={() => setSelectedModule(mod)}
                    className={`w-full flex items-center gap-1 pl-7 pr-2 py-1 rounded text-left transition-colors ${
                      selectedModule === mod
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted/30 text-muted-foreground'
                    }`}
                  >
                    <span className="text-[10px] truncate">{MODULE_LABELS[mod] ?? mod}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* 右侧：模块配置面板 */}
          <div className="space-y-2">
            {/* 层级/模块标题 */}
            <PageCard compact noPadding className="p-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{LAYER_ICONS[selectedLayer] ?? '📦'}</span>
                  <div>
                    <div className="text-xs font-semibold">
                      {currentLayer?.layerName ?? selectedLayer}
                      {selectedModule && (
                        <span className="text-muted-foreground"> / {MODULE_LABELS[selectedModule] ?? selectedModule}</span>
                      )}
                    </div>
                    <div className="text-[9px] text-muted-foreground">
                      {currentLayer?.description ?? ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[9px] ${LAYER_COLORS[selectedLayer] ?? ''}`}>
                    {currentLayer?.enabled ? '已启用' : '已禁用'}
                  </Badge>
                  {selectedModule && (
                    <>
                      <Button size="sm" variant="outline" className="h-5 text-[9px]"
                        onClick={() => setShowSimulateDialog(true)}>
                        🧪 仿真运行
                      </Button>
                      <Switch
                        checked={configs.filter(c => c.module === selectedModule).every(c => c.enabled)}
                        onCheckedChange={(checked) => {
                          toggleModuleMutation.mutate({ module: selectedModule, enabled: checked });
                        }}
                        className="scale-[0.6]"
                      />
                    </>
                  )}
                </div>
              </div>
            </PageCard>

            {/* 专属配置面板（P0/P0+ 模块） */}
            {selectedModule === 'stateSyncEngine' && (
              <StateSyncPanel
                configs={configs}
                onUpdate={(id, value, reason) => updateConfigMutation.mutate({ id, configValue: value, reason })}
                onReset={(id) => resetConfigMutation.mutate({ id })}
              />
            )}
            {selectedModule === 'worldModel' && (
              <WorldModelPanel
                configs={configs}
                onUpdate={(id, value, reason) => updateConfigMutation.mutate({ id, configValue: value, reason })}
                onReset={(id) => resetConfigMutation.mutate({ id })}
              />
            )}
            {selectedModule === 'hybridOrchestrator' && (
              <OrchestratorPanel
                configs={configs}
                onUpdate={(id, value, reason) => updateConfigMutation.mutate({ id, configValue: value, reason })}
                onReset={(id) => resetConfigMutation.mutate({ id })}
              />
            )}
            {selectedModule === 'grokEnhancer' && (
              <GrokEnhancerPanel
                configs={configs}
                onUpdate={(id, value, reason) => updateConfigMutation.mutate({ id, configValue: value, reason })}
                onReset={(id) => resetConfigMutation.mutate({ id })}
              />
            )}
            {selectedModule === 'simulationEngine' && (
              <SimulationPanel
                configs={configs}
                onUpdate={(id, value, reason) => updateConfigMutation.mutate({ id, configValue: value, reason })}
                onReset={(id) => resetConfigMutation.mutate({ id })}
              />
            )}
            {selectedModule === 'experiencePool' && (
              <ExperiencePoolPanel
                configs={configs}
                onUpdate={(id, value, reason) => updateConfigMutation.mutate({ id, configValue: value, reason })}
                onReset={(id) => resetConfigMutation.mutate({ id })}
              />
            )}
            {selectedModule === 'causalGraph' && (
              <CausalGraphPanel
                configs={configs}
                onUpdate={(id, value, reason) => updateConfigMutation.mutate({ id, configValue: value, reason })}
                onReset={(id) => resetConfigMutation.mutate({ id })}
              />
            )}
            {selectedModule === 'feedbackLoop' && (
              <FeedbackLoopPanel
                configs={configs}
                onUpdate={(id, value, reason) => updateConfigMutation.mutate({ id, configValue: value, reason })}
                onReset={(id) => resetConfigMutation.mutate({ id })}
              />
            )}
            {selectedModule === 'physicsValidator' && (
              <PhysicsVerifierPanel
                configs={configs}
                onUpdate={(id, value, reason) => updateConfigMutation.mutate({ id, configValue: value, reason })}
                onReset={(id) => resetConfigMutation.mutate({ id })}
              />
            )}
            {selectedModule === 'rulPredictor' && (
              <RULPredictorPanel
                configs={configs}
                onUpdate={(id, value, reason) => updateConfigMutation.mutate({ id, configValue: value, reason })}
                onReset={(id) => resetConfigMutation.mutate({ id })}
              />
            )}
            {selectedModule === 'replayEngine' && (
              <ReplayEnginePanel
                configs={configs}
                onUpdate={(id, value, reason) => updateConfigMutation.mutate({ id, configValue: value, reason })}
                onReset={(id) => resetConfigMutation.mutate({ id })}
              />
            )}
            {selectedModule === 'twinEventBus' && (
              <EventBusPanel
                configs={configs}
                onUpdate={(id, value, reason) => updateConfigMutation.mutate({ id, configValue: value, reason })}
                onReset={(id) => resetConfigMutation.mutate({ id })}
              />
            )}
            {selectedModule === 'outboxRelay' && (
              <OutboxRelayPanel
                configs={configs}
                onUpdate={(id, value, reason) => updateConfigMutation.mutate({ id, configValue: value, reason })}
                onReset={(id) => resetConfigMutation.mutate({ id })}
              />
            )}
            {selectedModule === 'bullmq' && (
              <BullMQPanel
                configs={configs}
                onUpdate={(id, value, reason) => updateConfigMutation.mutate({ id, configValue: value, reason })}
                onReset={(id) => resetConfigMutation.mutate({ id })}
              />
            )}
            {selectedModule === 'uncertaintyQuantifier' && (
              <UncertaintyPanel
                configs={configs}
                onUpdate={(id, value, reason) => updateConfigMutation.mutate({ id, configValue: value, reason })}
                onReset={(id) => resetConfigMutation.mutate({ id })}
              />
            )}
            {selectedModule === 'vectorStore' && (
              <VectorStorePanel
                configs={configs}
                onUpdate={(id, value, reason) => updateConfigMutation.mutate({ id, configValue: value, reason })}
                onReset={(id) => resetConfigMutation.mutate({ id })}
              />
            )}
            {selectedModule === 'deviceSampling' && (
              <DataCollectionPanel
                configs={configs}
                onUpdate={(id, value, reason) => updateConfigMutation.mutate({ id, configValue: value, reason })}
                onReset={(id) => resetConfigMutation.mutate({ id })}
              />
            )}

            {/* 配置项明细表格（按 configGroup 分组） */}
            <Separator className="my-2" />
            <div className="text-[10px] font-medium text-muted-foreground mb-1">📝 配置项明细</div>
            {Object.entries(groupedConfigs).map(([group, items]) => (
              <PageCard key={group} title={group === 'general' ? '通用配置' : group}
                icon={<span className="text-xs">📋</span>} compact>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[9px] py-1 w-[180px]">配置项</TableHead>
                      <TableHead className="text-[9px] py-1 w-[120px]">当前值</TableHead>
                      <TableHead className="text-[9px] py-1 w-[100px]">默认值</TableHead>
                      <TableHead className="text-[9px] py-1 w-[50px]">单位</TableHead>
                      <TableHead className="text-[9px] py-1 w-[50px]">状态</TableHead>
                      <TableHead className="text-[9px] py-1 w-[100px]">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const isModified = JSON.stringify(item.configValue) !== JSON.stringify(item.defaultValue);
                      return (
                        <TableRow key={item.id} className="group">
                          <TableCell className="py-0.5">
                            <div className="text-[10px] font-mono">{item.configKey}</div>
                            {item.label && (
                              <div className="text-[9px] text-muted-foreground">{item.label}</div>
                            )}
                          </TableCell>
                          <TableCell className="py-0.5">
                            <code className={`text-[10px] px-1 py-0.5 rounded ${
                              isModified ? 'bg-amber-100 text-amber-700' : 'bg-muted'
                            }`}>
                              {formatConfigValue(item.configValue)}
                            </code>
                          </TableCell>
                          <TableCell className="py-0.5">
                            <code className="text-[9px] text-muted-foreground">
                              {formatConfigValue(item.defaultValue)}
                            </code>
                          </TableCell>
                          <TableCell className="py-0.5 text-[9px] text-muted-foreground">
                            {item.unit ?? '-'}
                          </TableCell>
                          <TableCell className="py-0.5">
                            <Badge variant="outline" className={`text-[8px] ${
                              item.enabled ? 'text-green-600' : 'text-gray-400'
                            }`}>
                              {item.enabled ? '启用' : '禁用'}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-0.5">
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button size="sm" variant="ghost" className="h-5 text-[9px] px-1.5"
                                onClick={() => {
                                  setEditingConfig(item);
                                  setEditValue(formatConfigValue(item.configValue));
                                  setEditReason('');
                                }}>
                                ✏️ 编辑
                              </Button>
                              {isModified && (
                                <Button size="sm" variant="ghost" className="h-5 text-[9px] px-1.5 text-orange-600"
                                  onClick={() => resetConfigMutation.mutate({ id: item.id })}>
                                  ↩️ 重置
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </PageCard>
            ))}

            {configs.length === 0 && (
              <PageCard compact>
                <div className="text-center py-4 text-[10px] text-muted-foreground">
                  {configsQuery.isLoading ? '加载中...' : '该层级暂无配置项'}
                </div>
              </PageCard>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* 审计日志面板 */}
      {/* ================================================================ */}
      {activePanel === 'audit' && (
        <PageCard title="配置变更审计日志" icon={<span>📋</span>} compact>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[9px] py-1">时间</TableHead>
                <TableHead className="text-[9px] py-1">操作人</TableHead>
                <TableHead className="text-[9px] py-1">模块</TableHead>
                <TableHead className="text-[9px] py-1">配置项</TableHead>
                <TableHead className="text-[9px] py-1">操作</TableHead>
                <TableHead className="text-[9px] py-1">影响</TableHead>
                <TableHead className="text-[9px] py-1">原因</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(auditLogQuery.data?.items ?? []).map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-[9px] py-0.5 font-mono">
                    {new Date(log.createdAt).toLocaleString('zh-CN', { hour12: false })}
                  </TableCell>
                  <TableCell className="text-[9px] py-0.5">{log.userName ?? log.userId}</TableCell>
                  <TableCell className="text-[9px] py-0.5">
                    <Badge variant="outline" className="text-[8px]">
                      {MODULE_LABELS[log.module] ?? log.module}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[9px] py-0.5 font-mono">{log.configKey}</TableCell>
                  <TableCell className="text-[9px] py-0.5">
                    <Badge variant="outline" className={`text-[8px] ${
                      log.action === 'rollback' ? 'text-orange-600' :
                      log.action === 'simulate' ? 'text-purple-600' :
                      'text-blue-600'
                    }`}>
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[9px] py-0.5">
                    {log.impactScore != null && (
                      <Badge className={`text-[8px] ${IMPACT_COLORS[getImpactLevel(log.impactScore)]}`}>
                        {log.impactScore}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-[9px] py-0.5 max-w-[150px] truncate">
                    {log.reason ?? '-'}
                  </TableCell>
                </TableRow>
              ))}
              {(auditLogQuery.data?.items ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-[10px] text-muted-foreground py-4">
                    暂无审计日志
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </PageCard>
      )}

      {/* ================================================================ */}
      {/* 配置快照面板 */}
      {/* ================================================================ */}
      {activePanel === 'snapshots' && (
        <PageCard title="配置快照" icon={<span>📸</span>} compact
          action={
            <Button size="sm" variant="outline" className="h-5 text-[9px]"
              onClick={() => setShowSnapshotDialog(true)}>
              + 创建快照
            </Button>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[9px] py-1">ID</TableHead>
                <TableHead className="text-[9px] py-1">名称</TableHead>
                <TableHead className="text-[9px] py-1">类型</TableHead>
                <TableHead className="text-[9px] py-1">创建时间</TableHead>
                <TableHead className="text-[9px] py-1">创建者</TableHead>
                <TableHead className="text-[9px] py-1">校验和</TableHead>
                <TableHead className="text-[9px] py-1">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(snapshotsQuery.data ?? []).map((snap: any) => (
                <TableRow key={snap.id}>
                  <TableCell className="text-[9px] py-0.5 font-mono">#{snap.id}</TableCell>
                  <TableCell className="text-[9px] py-0.5">{snap.snapshotName ?? '-'}</TableCell>
                  <TableCell className="text-[9px] py-0.5">
                    <Badge variant="outline" className={`text-[8px] ${
                      snap.snapshotType === 'manual' ? 'text-blue-600' :
                      snap.snapshotType === 'pre_rollback' ? 'text-orange-600' :
                      'text-gray-500'
                    }`}>
                      {snap.snapshotType === 'manual' ? '手动' :
                       snap.snapshotType === 'pre_rollback' ? '回滚前' : '自动'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[9px] py-0.5 font-mono">
                    {new Date(snap.createdAt).toLocaleString('zh-CN', { hour12: false })}
                  </TableCell>
                  <TableCell className="text-[9px] py-0.5">{snap.createdBy}</TableCell>
                  <TableCell className="text-[9px] py-0.5 font-mono text-muted-foreground">
                    {snap.checksum?.slice(0, 8) ?? '-'}
                  </TableCell>
                  <TableCell className="text-[9px] py-0.5">
                    <Button size="sm" variant="ghost" className="h-5 text-[9px] px-1.5 text-orange-600"
                      onClick={() => {
                        if (confirm(`确认回滚到快照 "${snap.snapshotName ?? '#' + snap.id}"？`)) {
                          rollbackMutation.mutate({ snapshotId: snap.id });
                        }
                      }}>
                      ↩️ 回滚
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(snapshotsQuery.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-[10px] text-muted-foreground py-4">
                    暂无配置快照
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </PageCard>
      )}

      {/* ================================================================ */}
      {/* 配置对比面板 */}
      {/* ================================================================ */}
      {activePanel === 'diff' && (
        <ConfigDiffView
          configs={configs}
          onReset={(id) => resetConfigMutation.mutate({ id })}
          onResetAll={() => {
            configs.filter(c => JSON.stringify(c.configValue) !== JSON.stringify(c.defaultValue))
              .forEach(c => resetConfigMutation.mutate({ id: c.id }));
          }}
        />
      )}

      {/* ================================================================ */}
      {/* 一键仿真面板 */}
      {/* ================================================================ */}
      {activePanel === 'simulate' && (
        <SimulateRunner moduleId={selectedModule ?? 'all'} />
      )}

      {/* ================================================================ */}
      {/* OTel 指标面板 */}
      {/* ================================================================ */}
      {activePanel === 'otel' && (
        <OTelMetricsPanel selectedModule={selectedModule ?? undefined} />
      )}

      {/* ================================================================ */}
      {/* 编辑配置对话框 */}
      {/* ================================================================ */}
      <Dialog open={!!editingConfig} onOpenChange={() => setEditingConfig(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">编辑配置项</DialogTitle>
            <DialogDescription className="text-[10px]">
              {editingConfig && (
                <>
                  <span className="font-mono">{editingConfig.module}.{editingConfig.configKey}</span>
                  {editingConfig.label && <span className="ml-2 text-muted-foreground">({editingConfig.label})</span>}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {editingConfig?.description && (
              <div className="text-[10px] text-muted-foreground bg-muted/50 p-2 rounded">
                {editingConfig.description}
              </div>
            )}
            <div>
              <label className="text-[10px] font-medium">当前值</label>
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-7 text-xs font-mono mt-1"
              />
              {editingConfig?.constraints != null && (
                <div className="text-[9px] text-muted-foreground mt-0.5">
                  约束: {JSON.stringify(editingConfig.constraints) as string}
                </div>
              )}
            </div>
            <div className="flex gap-2 text-[9px]">
              <span className="text-muted-foreground">默认值:</span>
              <code className="bg-muted px-1 rounded">{formatConfigValue(editingConfig?.defaultValue)}</code>
              {editingConfig?.unit && (
                <>
                  <span className="text-muted-foreground">单位:</span>
                  <span>{editingConfig.unit}</span>
                </>
              )}
            </div>
            <div>
              <label className="text-[10px] font-medium">变更原因（可选）</label>
              <Input
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="说明为什么修改此配置..."
                className="h-7 text-xs mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => setEditingConfig(null)}>
              取消
            </Button>
            <Button size="sm" className="h-7 text-xs"
              disabled={updateConfigMutation.isPending}
              onClick={() => {
                if (editingConfig) {
                  updateConfigMutation.mutate({
                    id: editingConfig.id,
                    configValue: editValue,
                    reason: editReason || undefined,
                  });
                }
              }}>
              {updateConfigMutation.isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================ */}
      {/* 创建快照对话框 */}
      {/* ================================================================ */}
      <Dialog open={showSnapshotDialog} onOpenChange={setShowSnapshotDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">创建配置快照</DialogTitle>
            <DialogDescription className="text-[10px]">
              保存当前所有配置的快照，支持后续一键回滚
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-medium">快照名称</label>
              <Input
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                placeholder="例如：调优前基线配置"
                className="h-7 text-xs mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => setShowSnapshotDialog(false)}>
              取消
            </Button>
            <Button size="sm" className="h-7 text-xs"
              disabled={!snapshotName.trim() || createSnapshotMutation.isPending}
              onClick={() => {
                createSnapshotMutation.mutate({ snapshotName: snapshotName.trim() });
              }}>
              {createSnapshotMutation.isPending ? '创建中...' : '创建快照'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================ */}
      {/* 仿真运行对话框 */}
      {/* ================================================================ */}
      <Dialog open={showSimulateDialog} onOpenChange={setShowSimulateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">🧪 仿真运行配置</DialogTitle>
            <DialogDescription className="text-[10px]">
              在沙箱环境中测试配置变更效果，不影响真实孪生体
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-[10px] bg-amber-50 text-amber-700 p-2 rounded">
              将使用当前 <strong>{MODULE_LABELS[selectedModule ?? ''] ?? selectedModule}</strong> 模块的配置进行 30 秒仿真运行，
              评估延迟变化、精度影响和成本变化。
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => setShowSimulateDialog(false)}>
              取消
            </Button>
            <Button size="sm" className="h-7 text-xs"
              disabled={!selectedModule || simulateMutation.isPending}
              onClick={() => {
                if (selectedModule) {
                  const tempConfig: Record<string, unknown> = {};
                  configs.filter(c => c.module === selectedModule).forEach(c => {
                    tempConfig[c.configKey] = c.configValue;
                  });
                  simulateMutation.mutate({
                    module: selectedModule,
                    tempConfig,
                    durationSeconds: 30,
                  });
                }
              }}>
              {simulateMutation.isPending ? '启动中...' : '开始仿真 (30s)'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// 辅助函数
// ============================================================================
function formatConfigValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const str = JSON.stringify(value);
    return str.length > 50 ? str.slice(0, 47) + '...' : str;
  } catch {
    return String(value);
  }
}
