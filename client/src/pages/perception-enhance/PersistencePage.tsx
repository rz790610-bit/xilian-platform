/**
 * ============================================================================
 * 持久化服务 — 独立页面
 * ============================================================================
 * 展示感知层持久化服务的状态向量日志、采集状态、存储统计
 * 后端路由: evoPerception.getLogs / .getHistory / .listCollectionStatus / .getStats
 */
import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

export function PersistenceContent() {
  const [activeTab, setActiveTab] = useState('logs');
  const [machineFilter, setMachineFilter] = useState('');

  // 状态向量日志
  const logsQuery = trpc.evoPerception.getLogs.useQuery(
    { limit: 50 },
    { refetchInterval: 15000, retry: 2 }
  );

  // 采集通道状态
  const collectionQuery = trpc.evoPerception.listCollectionStatus.useQuery(undefined, {
    refetchInterval: 10000, retry: 2
  });

  // 统计
  const statsQuery = trpc.evoPerception.getStats.useQuery(undefined, {
    refetchInterval: 15000, retry: 2
  });

  const logs = (logsQuery.data as any)?.logs ?? logsQuery.data ?? [];
  const collections = (collectionQuery.data as any[]) ?? [];
  const stats = statsQuery.data as any;

  const filteredLogs = useMemo(() => {
    if (!Array.isArray(logs)) return [];
    if (!machineFilter) return logs;
    return logs.filter((l: any) => l.machineId?.includes(machineFilter) || l.equipmentId?.includes(machineFilter));
  }, [logs, machineFilter]);

  return (
    <div className="space-y-3">
      {/* 顶部统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard value={Array.isArray(logs) ? logs.length : 0} label="日志条数" icon="📝" />
        <StatCard value={collections.length} label="采集通道" icon="📡" />
        <StatCard value={stats?.activeBpaConfigs ?? 0} label="活跃 BPA" icon="🎯" />
        <StatCard value={stats?.activeDimensions ?? 0} label="活跃维度" icon="📐" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="logs" className="text-xs">状态向量日志</TabsTrigger>
          <TabsTrigger value="collection" className="text-xs">采集通道</TabsTrigger>
          <TabsTrigger value="storage" className="text-xs">存储统计</TabsTrigger>
        </TabsList>

        {/* 状态向量日志 */}
        <TabsContent value="logs">
          <PageCard title="状态向量持久化日志" icon="📝">
            <div className="mb-2">
              <Input
                placeholder="按设备 ID 筛选..."
                value={machineFilter}
                onChange={(e) => setMachineFilter(e.target.value)}
                className="h-7 max-w-[200px] text-xs"
              />
            </div>
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] w-[120px]">时间</TableHead>
                    <TableHead className="text-[10px] w-[100px]">设备 ID</TableHead>
                    <TableHead className="text-[10px] w-[80px]">维度数</TableHead>
                    <TableHead className="text-[10px] w-[80px]">置信度</TableHead>
                    <TableHead className="text-[10px]">工况</TableHead>
                    <TableHead className="text-[10px] w-[80px]">状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-[10px] text-muted-foreground py-4">
                        暂无日志数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.map((log: any, idx: number) => (
                      <TableRow key={log.id ?? idx}>
                        <TableCell className="text-[10px] font-mono">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell className="text-[10px] font-mono">{log.machineId ?? log.equipmentId ?? '—'}</TableCell>
                        <TableCell className="text-[10px] font-mono">{log.dimensionCount ?? log.dimensions ?? '—'}</TableCell>
                        <TableCell className="text-[10px] font-mono">
                          {log.confidence != null ? `${(log.confidence * 100).toFixed(1)}%` : '—'}
                        </TableCell>
                        <TableCell className="text-[10px]">
                          <Badge variant="outline" className="text-[10px]">{log.conditionProfile ?? log.condition ?? '—'}</Badge>
                        </TableCell>
                        <TableCell className="text-[10px]">
                          <Badge variant={log.status === 'success' ? 'default' : 'secondary'} className="text-[10px]">
                            {log.status ?? 'ok'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </PageCard>
        </TabsContent>

        {/* 采集通道 */}
        <TabsContent value="collection">
          <PageCard title="采集通道状态" icon="📡">
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">设备 ID</TableHead>
                    <TableHead className="text-[10px]">传感器数</TableHead>
                    <TableHead className="text-[10px]">采样率 (Hz)</TableHead>
                    <TableHead className="text-[10px]">缓冲区</TableHead>
                    <TableHead className="text-[10px]">背压</TableHead>
                    <TableHead className="text-[10px]">协议</TableHead>
                    <TableHead className="text-[10px]">最后数据</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collections.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-[10px] text-muted-foreground py-4">
                        暂无采集通道
                      </TableCell>
                    </TableRow>
                  ) : (
                    collections.map((ch: any, idx: number) => (
                      <TableRow key={ch.equipmentId ?? idx}>
                        <TableCell className="text-[10px] font-mono">{ch.equipmentId}</TableCell>
                        <TableCell className="text-[10px] font-mono">{ch.sensorCount}</TableCell>
                        <TableCell className="text-[10px] font-mono">{ch.samplingRateHz}</TableCell>
                        <TableCell className="text-[10px]">
                          <div className="flex items-center gap-1">
                            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${ch.bufferUsage > 0.8 ? 'bg-red-500' : ch.bufferUsage > 0.5 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                                style={{ width: `${(ch.bufferUsage ?? 0) * 100}%` }}
                              />
                            </div>
                            <span className="font-mono">{((ch.bufferUsage ?? 0) * 100).toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-[10px]">
                          <Badge
                            variant={ch.backpressure === 'normal' ? 'default' : ch.backpressure === 'warning' ? 'secondary' : 'destructive'}
                            className="text-[10px]"
                          >
                            {ch.backpressure}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[10px]">{ch.protocol}</TableCell>
                        <TableCell className="text-[10px] font-mono">
                          {ch.lastDataAt ? new Date(ch.lastDataAt).toLocaleTimeString() : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </PageCard>
        </TabsContent>

        {/* 存储统计 */}
        <TabsContent value="storage">
          <PageCard title="存储统计" icon="💾">
            {stats ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(stats).map(([key, val]) => (
                  <div key={key} className="p-2 rounded bg-muted/30 border border-border/30">
                    <div className="text-[10px] text-muted-foreground">{key}</div>
                    <div className="text-sm font-semibold font-mono">
                      {typeof val === 'number' ? val.toLocaleString() : String(val)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground text-[10px]">加载中...</div>
            )}
          </PageCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function PersistencePage() {
  return (
    <MainLayout title="持久化服务" subtitle="状态向量日志、采集通道与存储管理">
      <PersistenceContent />
    </MainLayout>
  );
}
