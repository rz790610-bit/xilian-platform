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
import { RefreshCw, Plus, Trash2, Eye, Clock, FileText, Camera, Search } from 'lucide-react';

export default function EventManager() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('events');
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [searchNodeId, setSearchNodeId] = useState('');
  const [eventForm, setEventForm] = useState<any>({});

  // tRPC 查询
  const { data: eventStats, refetch: refetchStats } = trpc.database.event.getEventStats.useQuery();
  const { data: events, refetch: refetchEvents } = trpc.database.event.listEvents.useQuery({
    nodeId: searchNodeId || undefined,
    limit: 100,
  });
  const { data: snapshots, refetch: refetchSnapshots } = trpc.database.event.listSnapshots.useQuery({ limit: 50 });

  // Mutations
  const appendEvent = trpc.database.event.appendEvent.useMutation({
    onSuccess: () => { toast.success('事件已追加'); refetchEvents(); refetchStats(); setShowCreateEvent(false); setEventForm({}); },
    onError: (e) => toast.error(e.message),
  });
  const createSnapshot = trpc.database.event.createSnapshot.useMutation({
    onSuccess: () => { toast.success('快照已创建'); refetchSnapshots(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <MainLayout title="事件溯源">
      <div className="p-4 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-foreground">事件溯源管理</h2>
            <p className="text-xs text-muted-foreground mt-0.5">事件存储 · 状态快照 · 事件回放</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { refetchEvents(); refetchSnapshots(); refetchStats(); }} className="text-xs">
              <RefreshCw className="w-3 h-3 mr-1" />刷新
            </Button>
            <Button size="sm" onClick={() => setShowCreateEvent(true)} className="text-xs">
              <Plus className="w-3 h-3 mr-1" />追加事件
            </Button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard value={eventStats?.totalEvents ?? 0} label="事件总数" icon="📝" />
          <StatCard value={eventStats?.totalSnapshots ?? 0} label="快照总数" icon="📷" />
          <StatCard value={eventStats?.distinctNodes ?? 0} label="关联节点" icon="🏭" />
          <StatCard value={eventStats?.todayEvents ?? 0} label="今日事件" icon="📅" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="events" className="text-xs">事件流</TabsTrigger>
            <TabsTrigger value="snapshots" className="text-xs">状态快照</TabsTrigger>
          </TabsList>

          {/* 事件流 */}
          <TabsContent value="events">
            <PageCard title="事件存储" icon={<FileText className="w-3.5 h-3.5" />}
              action={
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input placeholder="按节点ID筛选..." className="pl-7 h-6 text-[10px] w-40"
                      value={searchNodeId} onChange={e => setSearchNodeId(e.target.value)} />
                  </div>
                </div>
              }>
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {events?.items && events.items.length > 0 ? events.items.map((e: any) => (
                  <div key={e.id} className="flex items-start gap-2 p-2 rounded bg-secondary/50 text-xs">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{e.eventType}</span>
                        <Badge variant="info" className="text-[9px]">v{e.version}</Badge>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {e.occurredAt ? new Date(e.occurredAt).toLocaleString() : '-'}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        聚合: {e.aggregateType}.{e.aggregateId} · 节点: {e.nodeId || '-'}
                      </div>
                      {e.payload && (
                        <div className="mt-1 p-1.5 rounded bg-background/50 font-mono text-[10px] max-h-20 overflow-y-auto">
                          {typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload, null, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                )) : (
                  <div className="text-xs text-muted-foreground text-center py-8">
                    暂无事件记录，点击"追加事件"开始记录
                  </div>
                )}
              </div>
            </PageCard>
          </TabsContent>

          {/* 状态快照 */}
          <TabsContent value="snapshots">
            <PageCard title="状态快照" icon={<Camera className="w-3.5 h-3.5" />}>
              <div className="space-y-2">
                {snapshots && snapshots.length > 0 ? snapshots.map((s: any) => (
                  <div key={s.id} className="p-2 rounded bg-secondary/50 text-xs">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">
                          {s.aggregateType}.{s.aggregateId}
                          <Badge variant="info" className="ml-1.5 text-[9px]">v{s.version}</Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          快照ID: {s.id} · 创建: {s.createdAt ? new Date(s.createdAt).toLocaleString() : '-'}
                        </div>
                      </div>
                    </div>
                    {s.state && (
                      <div className="mt-1 p-1.5 rounded bg-background/50 font-mono text-[10px] max-h-20 overflow-y-auto">
                        {typeof s.state === 'string' ? s.state : JSON.stringify(s.state, null, 2)}
                      </div>
                    )}
                  </div>
                )) : (
                  <div className="text-xs text-muted-foreground text-center py-8">暂无状态快照</div>
                )}
              </div>
            </PageCard>
          </TabsContent>
        </Tabs>

        {/* 追加事件对话框 */}
        <Dialog open={showCreateEvent} onOpenChange={setShowCreateEvent}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="text-sm">追加事件</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">聚合类型 *</label>
                  <Input className="h-8 text-xs" placeholder="如 device"
                    value={eventForm.aggregateType || ''} onChange={e => setEventForm((p: any) => ({ ...p, aggregateType: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">聚合ID *</label>
                  <Input className="h-8 text-xs" placeholder="如 DEV-001"
                    value={eventForm.aggregateId || ''} onChange={e => setEventForm((p: any) => ({ ...p, aggregateId: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">事件类型 *</label>
                  <Input className="h-8 text-xs" placeholder="如 status_changed"
                    value={eventForm.eventType || ''} onChange={e => setEventForm((p: any) => ({ ...p, eventType: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">节点ID</label>
                  <Input className="h-8 text-xs" placeholder="关联的资产节点"
                    value={eventForm.nodeId || ''} onChange={e => setEventForm((p: any) => ({ ...p, nodeId: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">事件载荷 (JSON)</label>
                <Textarea className="text-xs font-mono" rows={4} placeholder='{"key": "value"}'
                  value={eventForm.payload || ''} onChange={e => setEventForm((p: any) => ({ ...p, payload: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowCreateEvent(false)}>取消</Button>
              <Button size="sm" className="text-xs" onClick={() => appendEvent.mutate({
                aggregateType: eventForm.aggregateType,
                aggregateId: eventForm.aggregateId,
                eventType: eventForm.eventType,
                nodeId: eventForm.nodeId || undefined,
                payload: eventForm.payload ? JSON.parse(eventForm.payload) : undefined,
              })} disabled={appendEvent.isPending}>
                {appendEvent.isPending ? '追加中...' : '追加'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
