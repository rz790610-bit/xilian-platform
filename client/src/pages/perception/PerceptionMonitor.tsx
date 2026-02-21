/**
 * ============================================================================
 * 感知层监控 — PerceptionMonitor (紧凑风格)
 * ============================================================================
 */

import { useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';

// ============================================================================
// 类型
// ============================================================================

interface CollectionStatus { equipmentId: string; sensorCount: number; samplingRateHz: number; bufferUsage: number; backpressure: 'normal' | 'warning' | 'critical'; protocol: string; lastDataAt: string }
interface FusionQuality { overallConfidence: number; conflictRate: number; evidenceSources: number; uncertaintyLevel: number; lastFusionAt: string }
interface ConditionProfile { id: string; name: string; active: boolean; equipmentCount: number; features: string[] }

const emptyFusion: FusionQuality = { overallConfidence: 0, conflictRate: 0, evidenceSources: 0, uncertaintyLevel: 0, lastFusionAt: '' };

// ============================================================================
// 创建工况配置对话框
// ============================================================================

function CreateProfileDialog({ open, onOpenChange, onSubmit, isSubmitting }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; description: string; features: string[] }) => void; isSubmitting: boolean;
}) {
  const [name, setName] = useState(''); const [description, setDescription] = useState('');
  const [features, setFeatures] = useState<string[]>([]); const [featureInput, setFeatureInput] = useState('');
  const addFeature = () => { if (featureInput.trim() && !features.includes(featureInput.trim())) { setFeatures(prev => [...prev, featureInput.trim()]); setFeatureInput(''); } };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-3 gap-1.5">
        <DialogHeader className="gap-0.5 pb-0">
          <DialogTitle className="text-sm">创建工况配置</DialogTitle>
          <DialogDescription className="text-[10px]">定义新的运行工况配置</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) { toast.error('请输入工况名称'); return; } onSubmit({ name, description, features }); setName(''); setDescription(''); setFeatures([]); }} className="space-y-1.5">
          <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">工况名称 *</Label><Input className="h-7 text-xs" value={name} onChange={e => setName(e.target.value)} placeholder="如：满载运行" /></div>
          <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">描述</Label><Input className="h-7 text-xs" value={description} onChange={e => setDescription(e.target.value)} placeholder="工况描述..." /></div>
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">特征标签</Label>
            <div className="flex gap-1.5"><Input className="h-7 text-xs" value={featureInput} onChange={e => setFeatureInput(e.target.value)} placeholder="输入特征名称" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeature(); } }} /><Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addFeature}>添加</Button></div>
            {features.length > 0 && <div className="flex flex-wrap gap-1 mt-0.5">{features.map(f => <Badge key={f} variant="secondary" className="text-[10px] cursor-pointer" onClick={() => setFeatures(prev => prev.filter(x => x !== f))}>{f} ×</Badge>)}</div>}
          </div>
          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={isSubmitting}>{isSubmitting ? '创建中...' : '创建工况'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 采样配置对话框
// ============================================================================

function SamplingConfigDialog({ open, onOpenChange, equipmentId, currentRate, onSubmit, isSubmitting }: {
  open: boolean; onOpenChange: (open: boolean) => void; equipmentId: string; currentRate: number;
  onSubmit: (data: { equipmentId: string; samplingRateHz: number; bufferSizeMb: number; compressionEnabled: boolean }) => void; isSubmitting: boolean;
}) {
  const [rate, setRate] = useState(currentRate); const [bufferSize, setBufferSize] = useState(64); const [compression, setCompression] = useState(true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-3 gap-1.5">
        <DialogHeader className="gap-0.5 pb-0">
          <DialogTitle className="text-sm">采样配置 — {equipmentId}</DialogTitle>
          <DialogDescription className="text-[10px]">调整设备的采样频率和缓冲区参数</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({ equipmentId, samplingRateHz: rate, bufferSizeMb: bufferSize, compressionEnabled: compression }); }} className="space-y-1.5">
          <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">采样频率: {rate} Hz</Label><Slider value={[rate]} onValueChange={v => setRate(v[0])} min={100} max={50000} step={100} /><div className="flex justify-between text-[10px] text-muted-foreground"><span>100 Hz</span><span>50,000 Hz</span></div></div>
          <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">缓冲区: {bufferSize} MB</Label><Slider value={[bufferSize]} onValueChange={v => setBufferSize(v[0])} min={8} max={512} step={8} /><div className="flex justify-between text-[10px] text-muted-foreground"><span>8 MB</span><span>512 MB</span></div></div>
          <div className="flex items-center gap-1.5"><input type="checkbox" id="compression" checked={compression} onChange={e => setCompression(e.target.checked)} className="rounded" /><Label htmlFor="compression" className="text-xs">启用数据压缩</Label></div>
          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={isSubmitting}>{isSubmitting ? '保存中...' : '保存配置'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export default function PerceptionMonitor() {
  const [activeTab, setActiveTab] = useState('pipeline');
  const [createProfileOpen, setCreateProfileOpen] = useState(false);
  const [samplingConfig, setSamplingConfig] = useState<{ equipmentId: string; rate: number } | null>(null);

  const collectionsQuery = trpc.evoPerception.listCollectionStatus.useQuery(undefined, { refetchInterval: 5000, retry: 2 });
  const fusionQuery = trpc.evoPerception.getFusionQuality.useQuery(undefined, { refetchInterval: 5000, retry: 2 });
  const profilesQuery = trpc.evoPerception.listConditionProfiles.useQuery(undefined, { retry: 2 });

  const createProfileMutation = trpc.evoPerception.condition.createProfile.useMutation({ onSuccess: () => { profilesQuery.refetch(); setCreateProfileOpen(false); toast.success('工况配置已创建'); }, onError: (e) => toast.error(`创建失败: ${e.message}`) });
  const updateSamplingMutation = trpc.evoPerception.sampling.updateConfig.useMutation({ onSuccess: () => { collectionsQuery.refetch(); setSamplingConfig(null); toast.success('采样配置已更新'); }, onError: (e) => toast.error(`更新失败: ${e.message}`) });

  const collections: CollectionStatus[] = (collectionsQuery.data as CollectionStatus[]) ?? [];
  const fusion: FusionQuality = (fusionQuery.data as FusionQuality) ?? emptyFusion;
  const profiles: ConditionProfile[] = (profilesQuery.data as unknown as ConditionProfile[]) ?? [];

  const bpVariant = (bp: string) => bp === 'critical' ? 'destructive' as const : bp === 'warning' ? 'secondary' as const : 'default' as const;
  const bpLabel = (bp: string) => bp === 'critical' ? '严重' : bp === 'warning' ? '警告' : '正常';

  const handleCreateProfile = useCallback((data: { name: string; description: string; features: string[] }) => {
    createProfileMutation.mutate({ name: data.name, industry: 'manufacturing', equipmentType: 'general', parameters: [], sensorMapping: [], thresholdStrategy: { type: 'static' as const, config: {} }, cognitionConfig: { enableGrok: true, enableEvolution: true, maxConcurrentSessions: 3 } } as any);
  }, [createProfileMutation]);

  const handleUpdateSampling = useCallback((data: { equipmentId: string; samplingRateHz: number; bufferSizeMb: number; compressionEnabled: boolean }) => {
    updateSamplingMutation.mutate({ profileId: 0, cyclePhase: 'normal', baseSamplingRate: data.samplingRateHz, highFreqSamplingRate: data.samplingRateHz * 2, retentionPolicy: 'all' as const, compression: data.compressionEnabled ? 'delta' as const : 'none' as const } as any);
  }, [updateSamplingMutation]);

  return (
    <MainLayout title="感知层监控">
    <div className="animate-fade-up">
      {/* 页头 */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold">📡 感知层监控</h2>
          <p className="text-xs text-muted-foreground">采集管线 · DS 融合质量 · 工况配置 · 采样参数</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">{collections.length} 台设备在线</Badge>
          <Button size="sm" className="h-7 text-xs" onClick={() => setCreateProfileOpen(true)}>+ 创建工况</Button>
        </div>
      </div>

      {/* 概览指标 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <StatCard value={`${Math.round(fusion.overallConfidence * 100)}%`} label="融合置信度" icon="🎯" />
        <StatCard value={`${Math.round(fusion.conflictRate * 100)}%`} label="冲突率" icon="⚡" />
        <StatCard value={fusion.evidenceSources} label="证据源" icon="📊" />
        <StatCard value={`${Math.round(fusion.uncertaintyLevel * 100)}%`} label="不确定性" icon="❓" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="pipeline" className="text-xs">采集管线</TabsTrigger>
          <TabsTrigger value="profiles" className="text-xs">工况配置</TabsTrigger>
          <TabsTrigger value="fusion" className="text-xs">融合详情</TabsTrigger>
        </TabsList>

        {/* ===== 采集管线 ===== */}
        <TabsContent value="pipeline" className="mt-2">
          {collectionsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /><span className="text-xs text-muted-foreground">加载中...</span></div>
          ) : collections.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">暂无采集设备接入</div>
          ) : (
            <PageCard noPadding>
              <div className="p-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] py-1">设备 ID</TableHead>
                      <TableHead className="text-[10px] py-1">传感器</TableHead>
                      <TableHead className="text-[10px] py-1">采样率</TableHead>
                      <TableHead className="text-[10px] py-1">缓冲区</TableHead>
                      <TableHead className="text-[10px] py-1">背压</TableHead>
                      <TableHead className="text-[10px] py-1">协议</TableHead>
                      <TableHead className="text-[10px] py-1">最后数据</TableHead>
                      <TableHead className="text-[10px] py-1 text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collections.map(c => (
                      <TableRow key={c.equipmentId}>
                        <TableCell className="font-mono text-xs font-medium py-1">{c.equipmentId}</TableCell>
                        <TableCell className="text-xs py-1">{c.sensorCount}</TableCell>
                        <TableCell className="font-mono text-xs py-1">{c.samplingRateHz} Hz</TableCell>
                        <TableCell className="py-1"><div className="flex items-center gap-1"><Progress value={c.bufferUsage * 100} className="h-1.5 w-12" /><span className="text-[10px] text-muted-foreground">{Math.round(c.bufferUsage * 100)}%</span></div></TableCell>
                        <TableCell className="py-1"><Badge variant={bpVariant(c.backpressure)} className="text-[10px]">{bpLabel(c.backpressure)}</Badge></TableCell>
                        <TableCell className="py-1"><Badge variant="outline" className="text-[10px]">{c.protocol}</Badge></TableCell>
                        <TableCell className="text-[10px] text-muted-foreground py-1">{c.lastDataAt ? new Date(c.lastDataAt).toLocaleTimeString() : '-'}</TableCell>
                        <TableCell className="text-right py-1"><Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setSamplingConfig({ equipmentId: c.equipmentId, rate: c.samplingRateHz })}>配置</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </PageCard>
          )}
        </TabsContent>

        {/* ===== 工况配置 ===== */}
        <TabsContent value="profiles" className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">共 {profiles.length} 个工况配置</span>
            <Button size="sm" className="h-7 text-xs" onClick={() => setCreateProfileOpen(true)}>+ 创建工况</Button>
          </div>
          {profiles.length === 0 ? (
            <div className="text-center py-8"><p className="text-xs text-muted-foreground">暂无工况配置</p><Button size="sm" className="mt-2 h-7 text-xs" onClick={() => setCreateProfileOpen(true)}>创建第一个工况</Button></div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {profiles.map(p => (
                <PageCard key={p.id} className={p.active ? 'border-green-500/30' : ''}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{p.name}</span>
                    <Badge variant={p.active ? 'default' : 'secondary'} className="text-[10px]">{p.active ? '活跃' : '未启用'}</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground mb-1">{p.equipmentCount} 台设备</div>
                  <div className="flex flex-wrap gap-0.5">{p.features.map(f => <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>)}</div>
                </PageCard>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== 融合详情 ===== */}
        <TabsContent value="fusion" className="mt-2">
          <PageCard title="DS 证据融合详情" icon="🔬">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">整体置信度</span>
                <div className="flex items-center gap-1.5"><Progress value={fusion.overallConfidence * 100} className="h-1.5 flex-1" /><span className="font-mono text-xs font-bold">{Math.round(fusion.overallConfidence * 100)}%</span></div>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">证据冲突率</span>
                <div className="flex items-center gap-1.5"><Progress value={fusion.conflictRate * 100} className="h-1.5 flex-1" /><span className="font-mono text-xs font-bold">{Math.round(fusion.conflictRate * 100)}%</span></div>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">证据源数量</span>
                <div className="text-base font-bold">{fusion.evidenceSources}</div>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">不确定性水平</span>
                <div className="flex items-center gap-1.5"><Progress value={fusion.uncertaintyLevel * 100} className="h-1.5 flex-1" /><span className="font-mono text-xs font-bold">{Math.round(fusion.uncertaintyLevel * 100)}%</span></div>
              </div>
            </div>
            {fusion.lastFusionAt && <div className="text-[10px] text-muted-foreground text-center pt-2 mt-2 border-t border-border">最后融合: {new Date(fusion.lastFusionAt).toLocaleString()}</div>}
          </PageCard>
        </TabsContent>
      </Tabs>

      <CreateProfileDialog open={createProfileOpen} onOpenChange={setCreateProfileOpen} onSubmit={handleCreateProfile} isSubmitting={createProfileMutation.isPending} />
      {samplingConfig && <SamplingConfigDialog open={!!samplingConfig} onOpenChange={(open) => { if (!open) setSamplingConfig(null); }} equipmentId={samplingConfig.equipmentId} currentRate={samplingConfig.rate} onSubmit={handleUpdateSampling} isSubmitting={updateSamplingMutation.isPending} />}
    </div>
    </MainLayout>
  );
}
