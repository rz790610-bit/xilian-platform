/**
 * ============================================================================
 * 感知层监控 — PerceptionMonitor
 * ============================================================================
 *
 * 完整功能：采集管线状态 + DS融合质量 + 工况配置CRUD + 采样参数配置
 * 通过 tRPC 接入后端 evoPerception 域路由
 */

import { useState, useCallback } from 'react';
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
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';

// ============================================================================
// 类型
// ============================================================================

interface CollectionStatus {
  equipmentId: string;
  sensorCount: number;
  samplingRateHz: number;
  bufferUsage: number;
  backpressure: 'normal' | 'warning' | 'critical';
  protocol: string;
  lastDataAt: string;
}

interface FusionQuality {
  overallConfidence: number;
  conflictRate: number;
  evidenceSources: number;
  uncertaintyLevel: number;
  lastFusionAt: string;
}

interface ConditionProfile {
  id: string;
  name: string;
  active: boolean;
  equipmentCount: number;
  features: string[];
}

const emptyFusion: FusionQuality = {
  overallConfidence: 0, conflictRate: 0, evidenceSources: 0, uncertaintyLevel: 0, lastFusionAt: '',
};

// ============================================================================
// 创建工况配置对话框
// ============================================================================

function CreateProfileDialog({
  open, onOpenChange, onSubmit, isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; description: string; features: string[] }) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [features, setFeatures] = useState<string[]>([]);
  const [featureInput, setFeatureInput] = useState('');

  const addFeature = () => {
    if (featureInput.trim() && !features.includes(featureInput.trim())) {
      setFeatures(prev => [...prev, featureInput.trim()]);
      setFeatureInput('');
    }
  };

  const removeFeature = (f: string) => {
    setFeatures(prev => prev.filter(x => x !== f));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('请输入工况名称'); return; }
    onSubmit({ name, description, features });
    setName(''); setDescription(''); setFeatures([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>创建工况配置</DialogTitle>
          <DialogDescription>定义新的运行工况配置，用于不同运行场景下的采集参数自动调整</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>工况名称 *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="如：满载运行" />
          </div>
          <div className="space-y-2">
            <Label>描述</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="工况描述..." />
          </div>
          <div className="space-y-2">
            <Label>特征标签</Label>
            <div className="flex gap-2">
              <Input value={featureInput} onChange={e => setFeatureInput(e.target.value)} placeholder="输入特征名称" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeature(); } }} />
              <Button type="button" variant="outline" onClick={addFeature}>添加</Button>
            </div>
            {features.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {features.map(f => (
                  <Badge key={f} variant="secondary" className="cursor-pointer" onClick={() => removeFeature(f)}>
                    {f} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '创建中...' : '创建工况'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 采样配置对话框
// ============================================================================

function SamplingConfigDialog({
  open, onOpenChange, equipmentId, currentRate, onSubmit, isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentId: string;
  currentRate: number;
  onSubmit: (data: { equipmentId: string; samplingRateHz: number; bufferSizeMb: number; compressionEnabled: boolean }) => void;
  isSubmitting: boolean;
}) {
  const [rate, setRate] = useState(currentRate);
  const [bufferSize, setBufferSize] = useState(64);
  const [compression, setCompression] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ equipmentId, samplingRateHz: rate, bufferSizeMb: bufferSize, compressionEnabled: compression });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>采样配置 — {equipmentId}</DialogTitle>
          <DialogDescription>调整设备的采样频率和缓冲区参数</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>采样频率: {rate} Hz</Label>
            <Slider value={[rate]} onValueChange={v => setRate(v[0])} min={100} max={50000} step={100} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>100 Hz</span>
              <span>50,000 Hz</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>缓冲区大小: {bufferSize} MB</Label>
            <Slider value={[bufferSize]} onValueChange={v => setBufferSize(v[0])} min={8} max={512} step={8} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>8 MB</span>
              <span>512 MB</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="compression" checked={compression} onChange={e => setCompression(e.target.checked)} className="rounded" />
            <Label htmlFor="compression">启用数据压缩</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '保存中...' : '保存配置'}</Button>
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

  const pollInterval = 5000;

  // ---- tRPC 数据查询 ----
  const collectionsQuery = trpc.evoPerception.listCollectionStatus.useQuery(undefined, {
    refetchInterval: pollInterval, retry: 2,
  });
  const fusionQuery = trpc.evoPerception.getFusionQuality.useQuery(undefined, {
    refetchInterval: pollInterval, retry: 2,
  });
  const profilesQuery = trpc.evoPerception.listConditionProfiles.useQuery(undefined, { retry: 2 });

  // ---- Mutations ----
  const createProfileMutation = trpc.evoPerception.condition.createProfile.useMutation({
    onSuccess: () => { profilesQuery.refetch(); setCreateProfileOpen(false); toast.success('工况配置已创建'); },
    onError: (e) => toast.error(`创建失败: ${e.message}`),
  });

  const updateSamplingMutation = trpc.evoPerception.sampling.updateConfig.useMutation({
    onSuccess: () => { collectionsQuery.refetch(); setSamplingConfig(null); toast.success('采样配置已更新'); },
    onError: (e) => toast.error(`更新失败: ${e.message}`),
  });

  // ---- 数据解构 ----
  const collections: CollectionStatus[] = (collectionsQuery.data as CollectionStatus[]) ?? [];
  const fusion: FusionQuality = (fusionQuery.data as FusionQuality) ?? emptyFusion;
  const profiles: ConditionProfile[] = (profilesQuery.data as ConditionProfile[]) ?? [];

  const bpVariant = (bp: string) => bp === 'critical' ? 'destructive' as const : bp === 'warning' ? 'secondary' as const : 'default' as const;
  const bpLabel = (bp: string) => bp === 'critical' ? '严重' : bp === 'warning' ? '警告' : '正常';

  const handleCreateProfile = useCallback((data: { name: string; description: string; features: string[] }) => {
    createProfileMutation.mutate({
      name: data.name,
      description: data.description || undefined,
      features: data.features,
    });
  }, [createProfileMutation]);

  const handleUpdateSampling = useCallback((data: { equipmentId: string; samplingRateHz: number; bufferSizeMb: number; compressionEnabled: boolean }) => {
    updateSamplingMutation.mutate(data);
  }, [updateSamplingMutation]);

  return (
    <MainLayout title="感知层监控">
    <div className="p-6 space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">感知层监控</h1>
          <p className="text-sm text-muted-foreground mt-1">采集管线 · DS 融合质量 · 工况配置 · 采样参数</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm px-3 py-1">
            {collections.length} 台设备在线
          </Badge>
          <Button onClick={() => setCreateProfileOpen(true)}>+ 创建工况</Button>
        </div>
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">融合置信度</div>
            <div className="text-2xl font-bold text-green-500 mt-1">{Math.round(fusion.overallConfidence * 100)}%</div>
            <Progress value={fusion.overallConfidence * 100} className="h-1.5 mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">冲突率</div>
            <div className="text-2xl font-bold text-yellow-500 mt-1">{Math.round(fusion.conflictRate * 100)}%</div>
            <Progress value={fusion.conflictRate * 100} className="h-1.5 mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">证据源</div>
            <div className="text-2xl font-bold text-blue-500 mt-1">{fusion.evidenceSources}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">不确定性</div>
            <div className="text-2xl font-bold text-purple-500 mt-1">{Math.round(fusion.uncertaintyLevel * 100)}%</div>
            <Progress value={fusion.uncertaintyLevel * 100} className="h-1.5 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pipeline">采集管线</TabsTrigger>
          <TabsTrigger value="profiles">工况配置</TabsTrigger>
          <TabsTrigger value="fusion">融合详情</TabsTrigger>
        </TabsList>

        {/* ===== 采集管线 Tab ===== */}
        <TabsContent value="pipeline" className="mt-4">
          {collectionsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">加载中...</span>
            </div>
          ) : collections.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">暂无采集设备接入</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>设备 ID</TableHead>
                  <TableHead>传感器数</TableHead>
                  <TableHead>采样率</TableHead>
                  <TableHead>缓冲区使用</TableHead>
                  <TableHead>背压状态</TableHead>
                  <TableHead>协议</TableHead>
                  <TableHead>最后数据</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collections.map(c => (
                  <TableRow key={c.equipmentId}>
                    <TableCell className="font-mono font-medium">{c.equipmentId}</TableCell>
                    <TableCell>{c.sensorCount}</TableCell>
                    <TableCell className="font-mono">{c.samplingRateHz} Hz</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={c.bufferUsage * 100} className="h-2 w-20" />
                        <span className="text-xs text-muted-foreground">{Math.round(c.bufferUsage * 100)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={bpVariant(c.backpressure)}>{bpLabel(c.backpressure)}</Badge>
                    </TableCell>
                    <TableCell><Badge variant="outline">{c.protocol}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.lastDataAt ? new Date(c.lastDataAt).toLocaleTimeString() : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSamplingConfig({ equipmentId: c.equipmentId, rate: c.samplingRateHz })}>
                        配置采样
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ===== 工况配置 Tab ===== */}
        <TabsContent value="profiles" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted-foreground">共 {profiles.length} 个工况配置</span>
            <Button onClick={() => setCreateProfileOpen(true)}>+ 创建工况</Button>
          </div>
          {profiles.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">暂无工况配置</p>
              <Button className="mt-4" onClick={() => setCreateProfileOpen(true)}>创建第一个工况</Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {profiles.map(p => (
                <Card key={p.id} className={p.active ? 'border-green-500/50' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      <Badge variant={p.active ? 'default' : 'secondary'}>{p.active ? '活跃' : '未启用'}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground mb-2">{p.equipmentCount} 台设备</div>
                    <div className="flex flex-wrap gap-1">
                      {p.features.map(f => (
                        <Badge key={f} variant="outline" className="text-xs">{f}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== 融合详情 Tab ===== */}
        <TabsContent value="fusion" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">DS 证据融合详情</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">整体置信度</Label>
                  <div className="flex items-center gap-3">
                    <Progress value={fusion.overallConfidence * 100} className="h-3 flex-1" />
                    <span className="font-mono font-bold text-lg">{Math.round(fusion.overallConfidence * 100)}%</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">证据冲突率</Label>
                  <div className="flex items-center gap-3">
                    <Progress value={fusion.conflictRate * 100} className="h-3 flex-1" />
                    <span className="font-mono font-bold text-lg">{Math.round(fusion.conflictRate * 100)}%</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">证据源数量</Label>
                  <div className="text-2xl font-bold text-foreground">{fusion.evidenceSources}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">不确定性水平</Label>
                  <div className="flex items-center gap-3">
                    <Progress value={fusion.uncertaintyLevel * 100} className="h-3 flex-1" />
                    <span className="font-mono font-bold text-lg">{Math.round(fusion.uncertaintyLevel * 100)}%</span>
                  </div>
                </div>
              </div>
              {fusion.lastFusionAt && (
                <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border">
                  最后融合时间: {new Date(fusion.lastFusionAt).toLocaleString()}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 创建工况对话框 */}
      <CreateProfileDialog
        open={createProfileOpen}
        onOpenChange={setCreateProfileOpen}
        onSubmit={handleCreateProfile}
        isSubmitting={createProfileMutation.isPending}
      />

      {/* 采样配置对话框 */}
      {samplingConfig && (
        <SamplingConfigDialog
          open={!!samplingConfig}
          onOpenChange={(open) => { if (!open) setSamplingConfig(null); }}
          equipmentId={samplingConfig.equipmentId}
          currentRate={samplingConfig.rate}
          onSubmit={handleUpdateSampling}
          isSubmitting={updateSamplingMutation.isPending}
        />
      )}
    </div>
    </MainLayout>
  );
}
