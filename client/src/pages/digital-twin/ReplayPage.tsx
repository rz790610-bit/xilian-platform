/**
 * 数字孪生 — 历史回放页面
 *
 * Phase 3 增强：
 *   ✅ DBSCAN 异常聚类可视化（散点图 + 异常高亮）
 *   ✅ 事件标注（Chart.js annotation plugin）
 *   ✅ 播放控制（播放/暂停/进度条/速度）
 *   ✅ OTel 回放查询耗时指标（后端）
 */
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { PageCard } from '@/components/common/PageCard';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTwinStore } from '@/stores/twinStore';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Filler, Title, Tooltip, Legend,
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Line, Scatter } from 'react-chartjs-2';
import { stateLabels } from './constants';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Title, Tooltip, Legend, annotationPlugin);

// ============================================================================
// 播放控制 Hook
// ============================================================================

function usePlaybackControl(totalFrames: number) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [speed, setSpeed] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPlaying && totalFrames > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentFrame(prev => {
          if (prev >= totalFrames - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 200 / speed);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, speed, totalFrames]);

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const reset = useCallback(() => { setIsPlaying(false); setCurrentFrame(0); }, []);
  const seek = useCallback((frame: number) => setCurrentFrame(Math.max(0, Math.min(frame, totalFrames - 1))), [totalFrames]);

  return { isPlaying, currentFrame, speed, setSpeed, play, pause, reset, seek };
}

// ============================================================================
// DBSCAN 可视化组件
// ============================================================================

function DBSCANVisualization({ equipmentId, startTime, endTime }: {
  equipmentId: string; startTime: string; endTime: string;
}) {
  const [eps, setEps] = useState(0.3);
  const [minPts, setMinPts] = useState(5);
  const [xAxis, setXAxis] = useState('temperature');
  const [yAxis, setYAxis] = useState('vibrationRMS');

  const dbscanQuery = trpc.evoPipeline.replay.dbscanAnalysis.useQuery(
    { equipmentId, startTime, endTime, eps, minPts, maxPoints: 500 },
    { enabled: !!startTime && !!endTime, retry: 1 },
  );

  const result = dbscanQuery.data as any;

  if (!result || result.totalPoints === 0) {
    return (
      <PageCard title="DBSCAN 异常聚类" icon={<span>🔍</span>} compact>
        <p className="text-[10px] text-muted-foreground py-2 text-center">
          {dbscanQuery.isLoading ? '分析中...' : '无数据可供聚类分析'}
        </p>
      </PageCard>
    );
  }

  // 聚类颜色映射
  const clusterColors: Record<number, string> = {
    '-1': 'rgba(239, 68, 68, 0.8)',  // 异常点 — 红色
    0: 'rgba(59, 130, 246, 0.6)',
    1: 'rgba(34, 197, 94, 0.6)',
    2: 'rgba(168, 85, 247, 0.6)',
    3: 'rgba(251, 191, 36, 0.6)',
    4: 'rgba(236, 72, 153, 0.6)',
  };

  // 按聚类分组构建散点数据
  const labelGroups = new Map<number, Array<{ x: number; y: number }>>();
  for (const p of result.points) {
    if (!labelGroups.has(p.label)) labelGroups.set(p.label, []);
    labelGroups.get(p.label)!.push({
      x: p.rawValues[xAxis] ?? 0,
      y: p.rawValues[yAxis] ?? 0,
    });
  }

  const datasets = Array.from(labelGroups.entries()).map(([label, points]) => ({
    label: label === -1 ? `异常 (${points.length})` : `簇 ${label} (${points.length})`,
    data: points,
    backgroundColor: clusterColors[label] ?? 'rgba(128,128,128,0.5)',
    pointRadius: label === -1 ? 5 : 3,
    pointStyle: label === -1 ? ('crossRot' as const) : ('circle' as const),
  }));

  const availableChannels = result.points.length > 0 ? Object.keys(result.points[0].rawValues) : [];

  return (
    <PageCard title="DBSCAN 异常聚类" icon={<span>🔍</span>} compact
      action={
        <div className="flex items-center gap-1">
          <Badge variant={result.anomalyCount > 0 ? 'destructive' : 'default'} className="text-[8px]">
            {result.anomalyCount} 异常 / {result.totalPoints} 总点
          </Badge>
          <Badge variant="outline" className="text-[8px]">
            {result.clusters.length} 簇
          </Badge>
        </div>
      }
    >
      {/* 参数控制 */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Label className="text-[9px] text-muted-foreground">eps:</Label>
          <Input className="h-5 text-[10px] w-14" type="number" step={0.05} min={0.05} max={2}
            value={eps} onChange={e => setEps(Number(e.target.value))} />
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-[9px] text-muted-foreground">minPts:</Label>
          <Input className="h-5 text-[10px] w-10" type="number" min={2} max={50}
            value={minPts} onChange={e => setMinPts(Number(e.target.value))} />
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-[9px] text-muted-foreground">X:</Label>
          <select className="text-[9px] bg-background border border-border rounded px-1 h-5"
            value={xAxis} onChange={e => setXAxis(e.target.value)}>
            {availableChannels.map(ch => <option key={ch} value={ch}>{stateLabels[ch] ?? ch}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-[9px] text-muted-foreground">Y:</Label>
          <select className="text-[9px] bg-background border border-border rounded px-1 h-5"
            value={yAxis} onChange={e => setYAxis(e.target.value)}>
            {availableChannels.map(ch => <option key={ch} value={ch}>{stateLabels[ch] ?? ch}</option>)}
          </select>
        </div>
        <span className="text-[8px] text-muted-foreground ml-auto">
          异常率: {(result.anomalyRate * 100).toFixed(1)}%
        </span>
      </div>

      {/* 散点图 */}
      <div style={{ height: '220px' }}>
        <Scatter
          data={{ datasets }}
          options={{
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top', labels: { font: { size: 8 }, usePointStyle: true } },
              tooltip: {
                callbacks: {
                  label: (ctx: any) => `${ctx.dataset.label}: (${ctx.parsed.x.toFixed(2)}, ${ctx.parsed.y.toFixed(2)})`,
                },
              },
            },
            scales: {
              x: { title: { display: true, text: stateLabels[xAxis] ?? xAxis, font: { size: 9 } }, ticks: { font: { size: 8 } } },
              y: { title: { display: true, text: stateLabels[yAxis] ?? yAxis, font: { size: 9 } }, ticks: { font: { size: 8 } } },
            },
          }}
        />
      </div>

      {/* 聚类摘要 */}
      {result.clusters.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          <span className="text-[9px] font-medium">聚类摘要</span>
          <div className="grid grid-cols-3 gap-1">
            {result.clusters.map((c: any) => (
              <div key={c.clusterId} className="border border-border rounded p-1 text-[9px]">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: clusterColors[c.clusterId] ?? '#888' }} />
                  <span className="font-medium">簇 {c.clusterId}</span>
                  <span className="text-muted-foreground">({c.size} 点)</span>
                </div>
                <div className="text-[8px] text-muted-foreground mt-0.5">
                  距离: {c.avgDistance.toFixed(3)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageCard>
  );
}

// ============================================================================
// 主页面
// ============================================================================

export default function ReplayPage({ equipmentId }: { equipmentId: string }) {
  const { replayTimeRange, setReplayTimeRange, replayResolution, setReplayResolution } = useTwinStore();

  const timeRangeQuery = trpc.evoPipeline.replay.getTimeRange.useQuery({ equipmentId }, { retry: 2 });

  const replayDataQuery = trpc.evoPipeline.replay.getData.useQuery(
    {
      equipmentId,
      startTime: replayTimeRange?.start ?? '',
      endTime: replayTimeRange?.end ?? '',
      includeEvents: true,
      maxPoints: 500,
    },
    { enabled: !!replayTimeRange?.start && !!replayTimeRange?.end },
  );

  const timeRange = timeRangeQuery.data as any;
  const replayData = replayDataQuery.data as any;

  // 自动设置时间范围（最近 24h）
  useEffect(() => {
    if (timeRange?.endTime && !replayTimeRange) {
      const end = timeRange.endTime;
      const start = new Date(new Date(end).getTime() - 86400000).toISOString();
      setReplayTimeRange({ start, end });
    }
  }, [timeRange, replayTimeRange, setReplayTimeRange]);

  // 健康指数时间线
  const healthChannel = replayData?.channels?.find((c: any) => c.name === 'healthIndex');
  const healthTimeline = healthChannel?.data ?? [];

  // 播放控制
  const playback = usePlaybackControl(healthTimeline.length);

  // 事件标注（用于 Chart.js annotation plugin）
  const eventAnnotations = useMemo(() => {
    if (!replayData?.events || replayData.events.length === 0) return {};
    const annotations: Record<string, any> = {};
    replayData.events.forEach((e: any, i: number) => {
      const ts = new Date(e.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      // 找到最近的时间索引
      const idx = healthTimeline.findIndex((h: any) => {
        const hTime = new Date(h.timestamp).getTime();
        const eTime = new Date(e.timestamp).getTime();
        return Math.abs(hTime - eTime) < 300000; // 5 分钟内
      });
      if (idx >= 0) {
        annotations[`event_${i}`] = {
          type: 'line',
          xMin: idx,
          xMax: idx,
          borderColor: e.severity === 'critical' ? 'rgba(239, 68, 68, 0.7)' : e.severity === 'error' ? 'rgba(251, 146, 60, 0.7)' : 'rgba(168, 85, 247, 0.5)',
          borderWidth: 1.5,
          borderDash: [3, 2],
          label: {
            display: true,
            content: `${e.type}`,
            position: 'start',
            font: { size: 7 },
            backgroundColor: 'rgba(0,0,0,0.6)',
            color: '#fff',
            padding: 2,
          },
        };
      }
    });
    return annotations;
  }, [replayData?.events, healthTimeline]);

  // 播放指示线
  const playheadAnnotation = useMemo(() => {
    if (healthTimeline.length === 0) return {};
    return {
      playhead: {
        type: 'line',
        xMin: playback.currentFrame,
        xMax: playback.currentFrame,
        borderColor: 'rgba(34, 197, 94, 0.9)',
        borderWidth: 2,
        label: {
          display: true,
          content: healthTimeline[playback.currentFrame]
            ? new Date(healthTimeline[playback.currentFrame].timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : '',
          position: 'end',
          font: { size: 8 },
          backgroundColor: 'rgba(34, 197, 94, 0.8)',
          color: '#fff',
          padding: 2,
        },
      },
    };
  }, [playback.currentFrame, healthTimeline]);

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
            {timeRange && (
              <span className="text-[9px] text-muted-foreground">可回放: {timeRange.totalSnapshots} 个快照</span>
            )}
          </div>
        </div>
      </PageCard>

      {/* 播放控制条 */}
      {healthTimeline.length > 0 && (
        <PageCard compact>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-xs" onClick={playback.reset}>⏮</Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-xs"
              onClick={playback.isPlaying ? playback.pause : playback.play}>
              {playback.isPlaying ? '⏸' : '▶'}
            </Button>
            <div className="flex-1">
              <Slider
                value={[playback.currentFrame]}
                onValueChange={([v]) => playback.seek(v)}
                min={0}
                max={Math.max(0, healthTimeline.length - 1)}
                step={1}
                className="h-2"
              />
            </div>
            <span className="text-[9px] font-mono text-muted-foreground w-16 text-right">
              {playback.currentFrame + 1}/{healthTimeline.length}
            </span>
            <div className="flex items-center gap-0.5">
              <Label className="text-[9px] text-muted-foreground">速度:</Label>
              <select className="text-[9px] bg-background border border-border rounded px-0.5 h-5"
                value={playback.speed} onChange={e => playback.setSpeed(Number(e.target.value))}>
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={5}>5x</option>
                <option value={10}>10x</option>
              </select>
            </div>
            {/* 当前帧状态 */}
            {healthTimeline[playback.currentFrame] && (
              <Badge variant="outline" className="text-[8px]">
                H: {healthTimeline[playback.currentFrame].value?.toFixed(1) ?? '--'}
              </Badge>
            )}
          </div>
        </PageCard>
      )}

      {/* 回放数据可视化 */}
      {healthTimeline.length > 0 ? (
        <div className="space-y-2">
          {/* 健康指数回放 + 事件标注 + 播放指示线 */}
          <PageCard title="健康指数回放" icon={<span>📈</span>} compact
            action={
              <Badge variant="outline" className="text-[8px]">
                {replayData?.events?.length ?? 0} 事件标注
              </Badge>
            }
          >
            <div style={{ height: '220px' }}>
              <Line
                data={{
                  labels: healthTimeline.map((t: any) =>
                    new Date(t.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                  ),
                  datasets: [{
                    label: '健康指数',
                    data: healthTimeline.map((t: any) => t.value),
                    borderColor: 'hsl(210, 80%, 55%)',
                    backgroundColor: 'hsl(210, 80%, 55%, 0.1)',
                    fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.5,
                  }],
                }}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: { mode: 'index', intersect: false },
                    annotation: {
                      annotations: { ...eventAnnotations, ...playheadAnnotation },
                    },
                  },
                  scales: {
                    x: { ticks: { maxTicksLimit: 12, font: { size: 9 } }, grid: { display: false } },
                    y: { min: 0, max: 100, ticks: { font: { size: 9 } }, grid: { color: 'rgba(128,128,128,0.15)' } },
                  },
                }}
              />
            </div>
          </PageCard>

          {/* 多通道回放 */}
          {replayData?.channels && replayData.channels.filter((c: any) => c.name !== 'healthIndex').length > 0 && (
            <PageCard title="多通道数据" icon={<span>📊</span>} compact>
              <div className="grid grid-cols-2 gap-2">
                {replayData.channels.filter((c: any) => c.name !== 'healthIndex').map((ch: any) => (
                  <div key={ch.name} style={{ height: '120px' }}>
                    <Line
                      data={{
                        labels: ch.data.map((d: any) =>
                          new Date(d.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                        ),
                        datasets: [{
                          label: stateLabels[ch.name] ?? ch.name,
                          data: ch.data.map((d: any) => d.value),
                          borderColor: ch.name === 'temperature' ? 'hsl(0, 70%, 55%)' :
                            ch.name === 'vibration' ? 'hsl(45, 90%, 50%)' :
                            ch.name === 'pressure' ? 'hsl(210, 80%, 55%)' : 'hsl(280, 60%, 55%)',
                          backgroundColor: 'transparent',
                          fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1.5,
                        }],
                      }}
                      options={{
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                          legend: { display: true, labels: { font: { size: 8 } } },
                          tooltip: { mode: 'index', intersect: false },
                          annotation: {
                            annotations: playheadAnnotation,
                          },
                        },
                        scales: {
                          x: { display: false },
                          y: { ticks: { font: { size: 7 } }, grid: { color: 'rgba(128,128,128,0.1)' } },
                        },
                      }}
                    />
                  </div>
                ))}
              </div>
            </PageCard>
          )}

          {/* DBSCAN 异常聚类 */}
          {replayTimeRange?.start && replayTimeRange?.end && (
            <DBSCANVisualization
              equipmentId={equipmentId}
              startTime={replayTimeRange.start}
              endTime={replayTimeRange.end}
            />
          )}

          {/* 事件列表 */}
          <div className="grid grid-cols-2 gap-2">
            <PageCard title={`认知事件 (${replayData?.events?.length ?? 0})`} icon={<span>🧠</span>} compact>
              {(!replayData?.events || replayData.events.length === 0) ? (
                <p className="text-[10px] text-muted-foreground py-2 text-center">时间范围内无认知事件</p>
              ) : (
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {replayData.events.filter((e: any) => e.type !== 'alert').slice(0, 20).map((e: any, i: number) => (
                    <div key={i} className="flex items-center gap-1 text-[10px]">
                      <span className="text-muted-foreground w-12 shrink-0">
                        {new Date(e.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <Badge variant="outline" className="text-[8px]">{e.type}</Badge>
                      <Badge variant={e.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[8px]">{e.severity}</Badge>
                      <span className="truncate flex-1">{e.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </PageCard>

            <PageCard title={`告警事件 (${replayData?.events?.filter((e: any) => e.severity === 'critical' || e.severity === 'error').length ?? 0})`} icon={<span>🚨</span>} compact>
              {(!replayData?.events || replayData.events.filter((e: any) => e.severity === 'critical' || e.severity === 'error').length === 0) ? (
                <p className="text-[10px] text-muted-foreground py-2 text-center">时间范围内无严重告警</p>
              ) : (
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {replayData.events.filter((e: any) => e.severity === 'critical' || e.severity === 'error').slice(0, 20).map((a: any, i: number) => (
                    <div key={i} className="flex items-center gap-1 text-[10px]">
                      <span className="text-muted-foreground w-12 shrink-0">
                        {new Date(a.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <Badge variant="destructive" className="text-[8px]">{a.severity}</Badge>
                      <span className="truncate flex-1">{a.title}</span>
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
