/**
 * 数字孪生 — 设备状态页面
 *
 * Phase 3 增强：
 *   ✅ tRPC 轮询替代 Subscription（httpBatchLink 不支持 WS）
 *   ✅ OTel 同步指标展示
 *   ✅ 实时刷新指示器
 *   ✅ 同步日志面板
 *
 * 注意：当前 tRPC 客户端仅配置了 httpBatchLink，不支持 WebSocket。
 * 使用 refetchInterval 实现近实时更新（5 秒轮询）。
 * 未来升级到 splitLink + wsLink 后可启用真正的 tRPC Subscription。
 */
import { useState, useEffect, useRef } from 'react';
import { PageCard } from '@/components/common/PageCard';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { stateLabels, stateUnits, syncStatusMap } from './constants';
import { ScoreGauge } from './ScoreGauge';
import TwinTopology from './TwinTopology';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Filler, Title, Tooltip, Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Title, Tooltip, Legend);

// ============================================================================
// 实时刷新指示器
// ============================================================================

function LiveIndicator({ isRefetching, lastUpdate }: { isRefetching: boolean; lastUpdate: Date | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${isRefetching ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
      <span className="text-[9px] text-muted-foreground">
        {isRefetching ? '刷新中...' : lastUpdate ? `${Math.round((Date.now() - lastUpdate.getTime()) / 1000)}s 前` : '等待数据'}
      </span>
      <Badge variant="outline" className="text-[7px] px-1">5s 轮询</Badge>
    </div>
  );
}

// ============================================================================
// 主页面
// ============================================================================

export default function EquipmentStatusPage({ equipmentId }: { equipmentId: string }) {
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [showSyncLogs, setShowSyncLogs] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'monitor' | 'topology'>('monitor');

  // tRPC 轮询（替代 Subscription）
  const stateQuery = trpc.evoPipeline.getEquipmentTwinState.useQuery(
    { equipmentId },
    {
      refetchInterval: 5000,
      retry: 2,
      // 记录最后更新时间
    },
  );

  // OTel 指标
  const metricsQuery = trpc.evoPipeline.metrics.useQuery(undefined, {
    refetchInterval: 15000,
    retry: 1,
  });

  // 更新时间戳
  useEffect(() => {
    if (stateQuery.data) {
      setLastUpdate(new Date());
    }
  }, [stateQuery.data]);

  const data = stateQuery.data as any;
  const metrics = metricsQuery.data as any;

  if (!data) {
    return (
      <PageCard>
        <div className="text-center py-6">
          <p className="text-xs text-muted-foreground">
            {stateQuery.isLoading ? '加载中...' : '暂无设备状态数据'}
          </p>
        </div>
      </PageCard>
    );
  }

  const stateVector = data.stateVector ?? {};
  const health = data.health ?? {};

  return (
    <div className="space-y-2">
      {/* 健康评分 */}
      <PageCard title="综合评分" icon={<span>📊</span>} compact
        action={<LiveIndicator isRefetching={stateQuery.isRefetching} lastUpdate={lastUpdate} />}
      >
        <div className="flex justify-around">
          <ScoreGauge label="安全" score={health.safetyScore ?? 0} color="text-green-500" />
          <ScoreGauge label="健康" score={health.healthScore ?? 0} color="text-blue-500" />
          <ScoreGauge label="效率" score={health.efficiencyScore ?? 0} color="text-purple-500" />
          <ScoreGauge label="综合" score={health.overallScore ?? 0} color="text-primary" />
        </div>
      </PageCard>

      {/* 子 Tab：实时监控 / 运行逻辑 */}
      <div className="flex gap-0.5 border-b border-border">
        <button
          onClick={() => setActiveSubTab('monitor')}
          className={`px-3 py-1 text-[10px] font-medium border-b-2 transition-colors ${
            activeSubTab === 'monitor'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          📊 实时监控
        </button>
        <button
          onClick={() => setActiveSubTab('topology')}
          className={`px-3 py-1 text-[10px] font-medium border-b-2 transition-colors ${
            activeSubTab === 'topology'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          🔮 运行逻辑拓扑
        </button>
      </div>

      {/* 运行逻辑拓扑视图 */}
      {activeSubTab === 'topology' && (
        <PageCard compact noPadding className="p-2">
          <TwinTopology equipmentId={equipmentId} />
        </PageCard>
      )}

      {/* 实时监控视图 */}
      {activeSubTab === 'monitor' && (
      <div className="grid grid-cols-2 gap-2">
        {/* 左侧：传感器数据 + RUL */}
        <div className="space-y-2">
          <PageCard title="传感器数据" icon={<span>📊</span>} compact>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] py-1">通道</TableHead>
                  <TableHead className="text-[10px] py-1">当前值</TableHead>
                  <TableHead className="text-[10px] py-1">单位</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(stateVector).map(([key, value]) => (
                  <TableRow key={key}>
                    <TableCell className="text-[10px] py-0.5 font-medium">{stateLabels[key] ?? key}</TableCell>
                    <TableCell className="text-[10px] py-0.5 font-mono">
                      {typeof value === 'number' ? value.toFixed(3) : String(value)}
                    </TableCell>
                    <TableCell className="text-[10px] py-0.5 text-muted-foreground">{stateUnits[key] ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PageCard>

          {data.rul && (
            <PageCard title="剩余使用寿命 (RUL)" icon={<span>⏳</span>} compact>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-foreground">{data.rul.estimatedDays}</span>
                  <span className="text-xs text-muted-foreground">天</span>
                  <Badge variant="outline" className="text-[9px]">
                    ±{data.rul.confidenceIntervalDays} 天
                  </Badge>
                </div>
                <Progress value={Math.min(100, (data.rul.estimatedDays / 365) * 100)} className="h-1.5" />
                {data.rul.topDegradationFactors && data.rul.topDegradationFactors.length > 0 && (
                  <div className="mt-1">
                    <span className="text-[10px] text-muted-foreground">主要退化因素：</span>
                    <div className="flex gap-1 flex-wrap mt-0.5">
                      {data.rul.topDegradationFactors.map((f: { factor: string; contribution: number }, i: number) => (
                        <Badge key={i} variant="outline" className="text-[9px]">
                          {stateLabels[f.factor] ?? f.factor} ({(f.contribution * 100).toFixed(0)}%)
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </PageCard>
          )}

          {/* OTel 同步指标 */}
          {metrics && (
            <PageCard title="OTel 同步指标" icon={<span>📡</span>} compact>
              <div className="space-y-0.5 text-[10px]">
                {metrics.twin_sync_duration_ms && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">同步耗时 P95</span>
                    <span className="font-mono">{(metrics.twin_sync_duration_ms as any).p95?.toFixed(1) ?? '--'} ms</span>
                  </div>
                )}
                {metrics.twin_sync_mode && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">同步模式</span>
                    <Badge variant="outline" className="text-[8px]">
                      {(metrics.twin_sync_mode as any).value === 0 ? 'CDC' : 'Polling'}
                    </Badge>
                  </div>
                )}
                {metrics.twin_registry_instances && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">活跃实例</span>
                    <span className="font-mono">{(metrics.twin_registry_instances as any).value ?? 0}</span>
                  </div>
                )}
                {metrics.physics_validation_failures && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">物理校验失败</span>
                    <Badge variant={(metrics.physics_validation_failures as any).value > 0 ? 'destructive' : 'default'} className="text-[8px]">
                      {(metrics.physics_validation_failures as any).value ?? 0}
                    </Badge>
                  </div>
                )}
                {metrics.grok_circuit_state && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Grok 熔断器</span>
                    <Badge
                      variant={(metrics.grok_circuit_state as any).value === 0 ? 'default' : 'destructive'}
                      className="text-[8px]"
                    >
                      {(metrics.grok_circuit_state as any).value === 0 ? 'Closed' : (metrics.grok_circuit_state as any).value === 1 ? 'Open' : 'Half-Open'}
                    </Badge>
                  </div>
                )}
              </div>
            </PageCard>
          )}
        </div>

        {/* 右侧：趋势图 + 告警 */}
        <div className="space-y-2">
          {data.trend && data.trend.length > 0 && (
            <PageCard title="24h 健康趋势" icon={<span>📈</span>} compact>
              <div style={{ height: '160px' }}>
                <Line
                  data={{
                    labels: data.trend.map((t: any) =>
                      new Date(t.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                    ),
                    datasets: [{
                      label: '健康指数',
                      data: data.trend.map((t: any) => t.healthIndex),
                      borderColor: 'hsl(210, 80%, 55%)',
                      backgroundColor: 'hsl(210, 80%, 55%, 0.1)',
                      fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5,
                    }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                    scales: {
                      x: { display: true, ticks: { maxTicksLimit: 8, font: { size: 9 } }, grid: { display: false } },
                      y: { display: true, min: 0, max: 100, ticks: { font: { size: 9 } }, grid: { color: 'rgba(128,128,128,0.15)' } },
                    },
                  }}
                />
              </div>
            </PageCard>
          )}

          <PageCard title="活跃告警" icon={<span>🚨</span>} compact
            action={<Badge variant="outline" className="text-[9px]">{data.activeAlerts?.length ?? 0}</Badge>}
          >
            {(!data.activeAlerts || data.activeAlerts.length === 0) ? (
              <p className="text-[10px] text-muted-foreground py-2 text-center">无活跃告警</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {data.activeAlerts.map((a: any) => (
                  <div key={a.id} className="flex items-center gap-1.5 text-[10px]">
                    <Badge variant={a.severity === 'critical' || a.severity === 'error' ? 'destructive' : 'secondary'} className="text-[9px] px-1">
                      {a.severity}
                    </Badge>
                    <span className="flex-1 truncate">{a.title}</span>
                    <span className="text-muted-foreground">{new Date(a.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            )}
          </PageCard>

          {/* 同步日志 */}
          <PageCard title="同步日志" icon={<span>🔄</span>} compact
            action={
              <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={() => setShowSyncLogs(!showSyncLogs)}>
                {showSyncLogs ? '收起' : '展开'}
              </Button>
            }
          >
            {showSyncLogs && data.syncLogs && data.syncLogs.length > 0 ? (
              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                {data.syncLogs.slice(0, 15).map((log: any, i: number) => (
                  <div key={i} className="flex items-center gap-1 text-[9px]">
                    <span className="text-muted-foreground w-14 shrink-0">
                      {new Date(log.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <Badge variant={log.status === 'success' ? 'default' : 'destructive'} className="text-[7px] px-1">
                      {log.status}
                    </Badge>
                    <span className="font-mono">{log.syncMode}</span>
                    {log.durationMs && <span className="text-muted-foreground">{log.durationMs}ms</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[9px] text-muted-foreground py-1 text-center">
                {showSyncLogs ? '无同步日志' : '点击展开查看同步日志'}
              </p>
            )}
          </PageCard>
        </div>
      </div>
      )}

      {/* 同步状态 */}
      <PageCard compact>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-muted-foreground">同步状态:</span>
          <Badge variant={syncStatusMap[data.syncStatus]?.color ?? 'default'} className="text-[9px]">
            {syncStatusMap[data.syncStatus]?.label ?? data.syncStatus}
          </Badge>
          <span className="text-muted-foreground">模式: {data.syncMode}</span>
          <span className="text-muted-foreground">最后同步: {new Date(data.lastSyncAt).toLocaleString('zh-CN')}</span>
          {data.diagnostics && (
            <>
              <Separator orientation="vertical" className="h-3" />
              <span className="text-muted-foreground">最近诊断: {data.diagnostics.status}</span>
              <span className="text-muted-foreground">{data.diagnostics.processingTimeMs}ms</span>
            </>
          )}
        </div>
      </PageCard>
    </div>
  );
}
