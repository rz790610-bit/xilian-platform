/**
 * 数字孪生 — 历史回放页面
 */
import { useEffect } from 'react';
import { PageCard } from '@/components/common/PageCard';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTwinStore } from '@/stores/twinStore';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Filler, Title, Tooltip, Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Title, Tooltip, Legend);

export default function ReplayPage({ equipmentId }: { equipmentId: string }) {
  const { replayTimeRange, setReplayTimeRange, replayResolution, setReplayResolution } = useTwinStore();

  const timeRangeQuery = trpc.evoPipeline.replay.getTimeRange.useQuery({ equipmentId }, { retry: 2 });

  const replayDataQuery = trpc.evoPipeline.replay.getData.useQuery(
    { equipmentId, startTime: replayTimeRange?.start ?? '', endTime: replayTimeRange?.end ?? '' },
    { enabled: !!replayTimeRange?.start && !!replayTimeRange?.end },
  );

  const timeRange = timeRangeQuery.data as any;
  const replayData = replayDataQuery.data as any;

  // 自动设置时间范围（最近 24h）
  useEffect(() => {
    if (timeRange?.available && !replayTimeRange) {
      const end = timeRange.endTime!;
      const start = new Date(new Date(end).getTime() - 86400000).toISOString();
      setReplayTimeRange({ start, end });
    }
  }, [timeRange, replayTimeRange, setReplayTimeRange]);

  return (
    <div className="space-y-2">
      {/* 时间控制器 */}
      <PageCard compact>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground">开始:</Label>
            <Input type="datetime-local" className="h-7 text-xs w-44"
              value={replayTimeRange?.start ? replayTimeRange.start.slice(0, 16) : ''}
              onChange={e => { const v = e.target.value; if (v) setReplayTimeRange({ start: new Date(v).toISOString(), end: replayTimeRange?.end ?? new Date().toISOString() }); }}
            />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground">结束:</Label>
            <Input type="datetime-local" className="h-7 text-xs w-44"
              value={replayTimeRange?.end ? replayTimeRange.end.slice(0, 16) : ''}
              onChange={e => { const v = e.target.value; if (v) setReplayTimeRange({ start: replayTimeRange?.start ?? new Date(Date.now() - 86400000).toISOString(), end: new Date(v).toISOString() }); }}
            />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground">分辨率:</Label>
            <Select value={String(replayResolution)} onValueChange={v => setReplayResolution(Number(v))}>
              <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10s</SelectItem>
                <SelectItem value="30">30s</SelectItem>
                <SelectItem value="60">1min</SelectItem>
                <SelectItem value="300">5min</SelectItem>
                <SelectItem value="600">10min</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            {timeRange?.available && (
              <span className="text-[9px] text-muted-foreground">可回放: {timeRange.snapshotCount} 个快照</span>
            )}
          </div>
        </div>
      </PageCard>

      {/* 回放数据可视化 */}
      {replayData && replayData.timeline && replayData.timeline.length > 0 ? (
        <div className="space-y-2">
          <PageCard title="健康指数回放" icon={<span>📈</span>} compact>
            <div style={{ height: '200px' }}>
              <Line
                data={{
                  labels: replayData.timeline.map((t: any) => new Date(t.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })),
                  datasets: [{
                    label: '健康指数', data: replayData.timeline.map((t: any) => t.healthIndex),
                    borderColor: 'hsl(210, 80%, 55%)', backgroundColor: 'hsl(210, 80%, 55%, 0.1)',
                    fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.5,
                  }],
                }}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                  scales: {
                    x: { ticks: { maxTicksLimit: 12, font: { size: 9 } }, grid: { display: false } },
                    y: { min: 0, max: 100, ticks: { font: { size: 9 } }, grid: { color: 'rgba(128,128,128,0.15)' } },
                  },
                }}
              />
            </div>
          </PageCard>

          <div className="grid grid-cols-2 gap-2">
            <PageCard title={`认知事件 (${replayData.events?.length ?? 0})`} icon={<span>🧠</span>} compact>
              {(!replayData.events || replayData.events.length === 0) ? (
                <p className="text-[10px] text-muted-foreground py-2 text-center">时间范围内无认知事件</p>
              ) : (
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {replayData.events.slice(0, 20).map((e: any) => (
                    <div key={e.id} className="flex items-center gap-1 text-[10px]">
                      <span className="text-muted-foreground w-12 shrink-0">
                        {new Date(e.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <Badge variant="outline" className="text-[8px]">{e.type}</Badge>
                      <Badge variant={e.status === 'completed' ? 'default' : 'secondary'} className="text-[8px]">{e.status}</Badge>
                      {e.healthScore != null && <span className="text-muted-foreground">H:{Number(e.healthScore).toFixed(0)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </PageCard>

            <PageCard title={`告警事件 (${replayData.alerts?.length ?? 0})`} icon={<span>🚨</span>} compact>
              {(!replayData.alerts || replayData.alerts.length === 0) ? (
                <p className="text-[10px] text-muted-foreground py-2 text-center">时间范围内无告警</p>
              ) : (
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {replayData.alerts.slice(0, 20).map((a: any) => (
                    <div key={a.id} className="flex items-center gap-1 text-[10px]">
                      <span className="text-muted-foreground w-12 shrink-0">
                        {new Date(a.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <Badge variant={a.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[8px]">{a.severity}</Badge>
                      <span className="truncate">{a.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </PageCard>
          </div>
        </div>
      ) : (
        <PageCard>
          <div className="text-center py-6">
            <p className="text-xs text-muted-foreground">
              {replayDataQuery.isLoading ? '加载回放数据...' : !replayTimeRange ? '请选择时间范围' : '所选时间范围内无数据'}
            </p>
          </div>
        </PageCard>
      )}
    </div>
  );
}
