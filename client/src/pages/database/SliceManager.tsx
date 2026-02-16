import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import { RefreshCw, Plus, Scissors, Play, Pause, Trash2, Eye, Clock, Tag } from 'lucide-react';

export default function SliceManager() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('rules');
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [showCreateSlice, setShowCreateSlice] = useState(false);
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<any>({});
  const [sliceForm, setSliceForm] = useState<any>({});

  // tRPC 查询
  const { data: sliceStats, refetch: refetchStats } = trpc.database.slice.getSliceStats.useQuery();
  const { data: rules, refetch: refetchRules } = trpc.database.slice.listRules.useQuery();
  const { data: slices, refetch: refetchSlices } = trpc.database.slice.listSlices.useQuery({ limit: 50 });
  const { data: sliceDetail } = trpc.database.slice.getSlice.useQuery(
    { sliceId: selectedSliceId! },
    { enabled: !!selectedSliceId }
  );
  const { data: sliceLabels } = trpc.database.slice.getSliceLabels.useQuery(
    { sliceId: selectedSliceId! },
    { enabled: !!selectedSliceId }
  );

  // Mutations
  const createRule = trpc.database.slice.createRule.useMutation({
    onSuccess: () => { toast.success('切片规则创建成功'); refetchRules(); setShowCreateRule(false); setRuleForm({}); },
    onError: (e) => toast.error(e.message),
  });
  const createSlice = trpc.database.slice.createSlice.useMutation({
    onSuccess: () => { toast.success('数据切片创建成功'); refetchSlices(); refetchStats(); setShowCreateSlice(false); setSliceForm({}); },
    onError: (e) => toast.error(e.message),
  });
  const deleteRule = trpc.database.slice.deleteRule.useMutation({
    onSuccess: () => { toast.success('规则已删除'); refetchRules(); },
  });
  const deleteSlice = trpc.database.slice.deleteSlice.useMutation({
    onSuccess: () => { toast.success('切片已删除'); refetchSlices(); refetchStats(); setSelectedSliceId(null); },
  });

  const statusVariant = (s: string) =>
    s === 'completed' ? 'success' : s === 'recording' ? 'info' : s === 'error' ? 'danger' : 'default';

  return (
    <MainLayout title="数据切片">
      <div className="p-4 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-foreground">数据切片管理</h2>
            <p className="text-xs text-muted-foreground mt-0.5">切片规则 · 切片实例 · 标注管理</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { refetchRules(); refetchSlices(); refetchStats(); }} className="text-xs">
            <RefreshCw className="w-3 h-3 mr-1" />刷新
          </Button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard value={sliceStats?.total ?? 0} label="切片总数" icon="✂️" />
          <StatCard value={sliceStats?.byStatus?.['completed'] ?? 0} label="已完成" icon="✅" />
          <StatCard value={sliceStats?.byStatus?.['recording'] ?? 0} label="录制中" icon="🔴" />
          <StatCard value={rules?.length ?? 0} label="切片规则" icon="📐" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="rules" className="text-xs">切片规则</TabsTrigger>
            <TabsTrigger value="slices" className="text-xs">切片实例</TabsTrigger>
            <TabsTrigger value="detail" className="text-xs">切片详情</TabsTrigger>
          </TabsList>

          {/* 切片规则 */}
          <TabsContent value="rules">
            <PageCard title="切片规则列表" icon={<Scissors className="w-3.5 h-3.5" />}
              action={<Button size="sm" className="text-xs h-6" onClick={() => setShowCreateRule(true)}><Plus className="w-3 h-3 mr-1" />新建规则</Button>}>
              <div className="space-y-2">
                {rules && rules.length > 0 ? rules.map((r: any) => (
                  <div key={r.ruleId} className="flex items-center justify-between p-2 rounded bg-secondary/50 text-xs">
                    <div className="flex-1">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {r.ruleId} · 触发: {r.triggerType} · 窗口: {r.windowSize ?? '-'}s · 重叠: {r.overlapRatio ?? 0}%
                      </div>
                      {r.description && <div className="text-[10px] text-muted-foreground">{r.description}</div>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={r.isActive === 1 ? 'success' : 'default'}>{r.isActive === 1 ? '启用' : '禁用'}</Badge>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                        onClick={() => deleteRule.mutate({ ruleId: r.ruleId })}>
                        <Trash2 className="w-3 h-3 text-danger" />
                      </Button>
                    </div>
                  </div>
                )) : <div className="text-xs text-muted-foreground text-center py-6">暂无切片规则，点击"新建规则"开始创建</div>}
              </div>
            </PageCard>
          </TabsContent>

          {/* 切片实例 */}
          <TabsContent value="slices">
            <PageCard title="切片实例列表" icon={<Clock className="w-3.5 h-3.5" />}
              action={<Button size="sm" className="text-xs h-6" onClick={() => setShowCreateSlice(true)}><Plus className="w-3 h-3 mr-1" />新建切片</Button>}>
              <div className="space-y-2">
                {slices?.items && slices.items.length > 0 ? slices.items.map((s: any) => (
                  <div key={s.sliceId}
                    className={`flex items-center justify-between p-2 rounded text-xs cursor-pointer transition-colors ${
                      selectedSliceId === s.sliceId ? 'bg-primary/20 border border-primary/30' : 'bg-secondary/50 hover:bg-secondary'
                    }`}
                    onClick={() => { setSelectedSliceId(s.sliceId); setActiveTab('detail'); }}>
                    <div className="flex-1">
                      <div className="font-medium">{s.sliceId}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        节点: {s.nodeId} · 测点: {s.mpId || '-'} · 采样率: {s.sampleRate ?? '-'}Hz · 点数: {s.pointCount ?? '-'}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {s.startTime ? new Date(s.startTime).toLocaleString() : '-'} → {s.endTime ? new Date(s.endTime).toLocaleString() : '进行中'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={statusVariant(s.status)} dot>{s.status}</Badge>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                        onClick={(e) => { e.stopPropagation(); deleteSlice.mutate({ sliceId: s.sliceId }); }}>
                        <Trash2 className="w-3 h-3 text-danger" />
                      </Button>
                    </div>
                  </div>
                )) : <div className="text-xs text-muted-foreground text-center py-6">暂无切片实例</div>}
              </div>
            </PageCard>
          </TabsContent>

          {/* 切片详情 */}
          <TabsContent value="detail">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <PageCard title="切片信息" icon={<Eye className="w-3.5 h-3.5" />}>
                {sliceDetail ? (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">切片ID：</span><span className="font-mono">{sliceDetail.sliceId}</span></div>
                    <div><span className="text-muted-foreground">状态：</span><Badge variant={statusVariant(sliceDetail.status)} dot>{sliceDetail.status}</Badge></div>
                    <div><span className="text-muted-foreground">节点：</span>{sliceDetail.nodeId}</div>
                    <div><span className="text-muted-foreground">设备：</span>{sliceDetail.deviceCode || '-'}</div>
                    <div><span className="text-muted-foreground">负载率：</span>{sliceDetail.loadRate ?? '-'}</div>
                    <div><span className="text-muted-foreground">时长(ms)：</span>{sliceDetail.durationMs ?? '-'}</div>
                    <div><span className="text-muted-foreground">开始时间：</span>{sliceDetail.startTime ? new Date(sliceDetail.startTime).toLocaleString() : '-'}</div>
                    <div><span className="text-muted-foreground">结束时间：</span>{sliceDetail.endTime ? new Date(sliceDetail.endTime).toLocaleString() : '-'}</div>
                    <div><span className="text-muted-foreground">标注状态：</span>{sliceDetail.labelStatus || '-'}</div>
                    <div><span className="text-muted-foreground">质量分数：</span>{sliceDetail.qualityScore ?? '-'}</div>
                    <div className="col-span-2"><span className="text-muted-foreground">数据位置：</span><span className="font-mono text-[10px]">{sliceDetail.dataLocation ? JSON.stringify(sliceDetail.dataLocation) : '-'}</span></div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground text-center py-8">请在切片实例列表中选择一个切片查看详情</div>
                )}
              </PageCard>

              <PageCard title="标注记录" icon={<Tag className="w-3.5 h-3.5" />}>
                {sliceLabels && sliceLabels.length > 0 ? (
                  <div className="space-y-2">
                    {sliceLabels.map((l: any) => (
                      <div key={l.labelId} className="p-2 rounded bg-secondary/50 text-xs">
                        <div className="flex justify-between">
                          <span className="font-medium">{l.dimCode}</span>
                          <Badge variant={l.source === 'manual' ? 'success' : 'info'}>{l.source}</Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          值: {l.labelValue} · 置信度: {l.confidence ?? '-'} · 操作人: {l.operatorId || '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground text-center py-8">
                    {selectedSliceId ? '暂无标注记录' : '请先选择切片'}
                  </div>
                )}
              </PageCard>
            </div>
          </TabsContent>
        </Tabs>

        {/* 创建切片规则对话框 */}
        <Dialog open={showCreateRule} onOpenChange={setShowCreateRule}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="text-sm">新建切片规则</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">规则ID *</label>
                  <Input className="h-8 text-xs" placeholder="如 RULE-001"
                    value={ruleForm.ruleId || ''} onChange={e => setRuleForm((p: any) => ({ ...p, ruleId: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">名称 *</label>
                  <Input className="h-8 text-xs" placeholder="规则名称"
                    value={ruleForm.name || ''} onChange={e => setRuleForm((p: any) => ({ ...p, name: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">触发类型</label>
                  <Select value={ruleForm.triggerType || 'time_window'} onValueChange={v => setRuleForm((p: any) => ({ ...p, triggerType: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="time_window">时间窗口</SelectItem>
                      <SelectItem value="event_trigger">事件触发</SelectItem>
                      <SelectItem value="threshold">阈值触发</SelectItem>
                      <SelectItem value="manual">手动</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">窗口大小(秒)</label>
                  <Input className="h-8 text-xs" type="number" placeholder="如 60"
                    value={ruleForm.windowSize || ''} onChange={e => setRuleForm((p: any) => ({ ...p, windowSize: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">描述</label>
                <Textarea className="text-xs" rows={2} placeholder="可选描述"
                  value={ruleForm.description || ''} onChange={e => setRuleForm((p: any) => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowCreateRule(false)}>取消</Button>
              <Button size="sm" className="text-xs" onClick={() => createRule.mutate({
                ruleId: ruleForm.ruleId, name: ruleForm.name,
                triggerType: ruleForm.triggerType || 'time_window',
                                triggerConfig: { windowSize: ruleForm.windowSize ? Number(ruleForm.windowSize) : undefined },

              })} disabled={createRule.isPending}>
                {createRule.isPending ? '创建中...' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 创建切片实例对话框 */}
        <Dialog open={showCreateSlice} onOpenChange={setShowCreateSlice}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="text-sm">新建数据切片</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">切片ID *</label>
                  <Input className="h-8 text-xs" placeholder="如 SLICE-001"
                    value={sliceForm.sliceId || ''} onChange={e => setSliceForm((p: any) => ({ ...p, sliceId: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">节点ID *</label>
                  <Input className="h-8 text-xs" placeholder="关联的资产节点"
                    value={sliceForm.nodeId || ''} onChange={e => setSliceForm((p: any) => ({ ...p, nodeId: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">测点ID</label>
                  <Input className="h-8 text-xs" placeholder="可选"
                    value={sliceForm.mpId || ''} onChange={e => setSliceForm((p: any) => ({ ...p, mpId: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">采样率(Hz)</label>
                  <Input className="h-8 text-xs" type="number" placeholder="如 1000"
                    value={sliceForm.sampleRate || ''} onChange={e => setSliceForm((p: any) => ({ ...p, sampleRate: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowCreateSlice(false)}>取消</Button>
              <Button size="sm" className="text-xs" onClick={() => createSlice.mutate({
                sliceId: sliceForm.sliceId, deviceCode: sliceForm.nodeId, startTime: new Date().toISOString(), endTime: new Date().toISOString(),
              })} disabled={createSlice.isPending}>
                {createSlice.isPending ? '创建中...' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
