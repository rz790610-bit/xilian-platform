/**
 * P1-4: 跨设备横向对比页面
 *
 * 功能:
 *   1. 共享部件列表 — 显示跨设备共享的同型号部件及关联强度
 *   2. 故障历史 — 关联设备的历史故障记录
 *   3. 传播预警 — 故障传播预警状态和建议动作
 *   4. 设备选择 — 选择源设备触发故障传播查询
 *
 * 数据来源: tRPC crossDevice router (server/api/crossDevice.router.ts)
 */
import { useState, useEffect, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import {
  Network, AlertTriangle, Activity, Shield, Search,
  ArrowRight, CheckCircle2, XCircle, Info, ChevronRight,
  Cpu, Cog, Gauge, Zap, Clock, TrendingDown, Loader2
} from 'lucide-react';

// ==================== 辅助组件 ====================

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    critical: 'bg-red-500/15 text-red-400 border-red-500/30',
    high:     'bg-orange-500/15 text-orange-400 border-orange-500/30',
    medium:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
    low:      'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  };
  const style = styles[severity] || 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded border', style)}>
      {severity}
    </span>
  );
}

function AlertLevelBadge({ level }: { level: string }) {
  const config: Record<string, { style: string; icon: React.ReactNode }> = {
    critical: { style: 'bg-red-500/15 text-red-400 border-red-500/30', icon: <XCircle className="w-3 h-3" /> },
    warning:  { style: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: <AlertTriangle className="w-3 h-3" /> },
    info:     { style: 'bg-sky-500/15 text-sky-400 border-sky-500/30', icon: <Info className="w-3 h-3" /> },
  };
  const c = config[level] || config.info;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border', c.style)}>
      {c.icon} {level}
    </span>
  );
}

function FaultStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:     'bg-red-500/15 text-red-400 border-red-500/30',
    resolved:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    monitoring: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  };
  const labels: Record<string, string> = {
    active: '活跃', resolved: '已解决', monitoring: '监控中',
  };
  const style = styles[status] || 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded border', style)}>
      {labels[status] || status}
    </span>
  );
}

function ComponentTypeBadge({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = {
    bearing: <Gauge className="w-3 h-3" />,
    gearbox: <Cog className="w-3 h-3" />,
    motor:   <Zap className="w-3 h-3" />,
    brake:   <Shield className="w-3 h-3" />,
    encoder: <Cpu className="w-3 h-3" />,
  };
  const labels: Record<string, string> = {
    bearing: '轴承', gearbox: '减速箱', motor: '电机', brake: '制动器', encoder: '编码器',
  };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border bg-zinc-800/60 text-zinc-300 border-zinc-700/50">
      {icons[type] || <Cpu className="w-3 h-3" />}
      {labels[type] || type}
    </span>
  );
}

function HealthBar({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' }) {
  const color = value >= 80 ? 'bg-emerald-500' : value >= 60 ? 'bg-amber-500' : value >= 40 ? 'bg-orange-500' : 'bg-red-500';
  const h = size === 'sm' ? 'h-1.5' : 'h-2';
  return (
    <div className="flex items-center gap-2">
      <div className={cn('flex-1 rounded-full bg-zinc-800', h)}>
        <div className={cn('rounded-full', h, color)} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-zinc-400 w-8 text-right">{value}</span>
    </div>
  );
}

function SimilarityDot({ value }: { value: number }) {
  const color = value >= 0.95 ? 'text-emerald-400' : value >= 0.8 ? 'text-sky-400' : 'text-amber-400';
  return (
    <span className={cn('text-xs tabular-nums font-medium', color)}>
      {(value * 100).toFixed(0)}%
    </span>
  );
}

/** 通用加载占位 */
function LoadingPlaceholder({ text = '加载中...' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-zinc-500 text-sm gap-2">
      <Loader2 className="w-4 h-4 animate-spin" />
      {text}
    </div>
  );
}

// ==================== 主组件 ====================

export default function CrossDeviceComparison() {
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [componentFilter, setComponentFilter] = useState('all');

  // ─── 数据查询 ───

  const devicesQuery = trpc.crossDevice.listDevices.useQuery();

  // 设备列表加载后，默认选中第一个设备
  useEffect(() => {
    if (devicesQuery.data && devicesQuery.data.length > 0 && !selectedDevice) {
      setSelectedDevice(devicesQuery.data[0].id);
    }
  }, [devicesQuery.data, selectedDevice]);

  const sharedComponentsQuery = trpc.crossDevice.getSharedComponents.useQuery(
    {
      deviceId: selectedDevice,
      componentType: componentFilter === 'all' ? undefined : componentFilter,
    },
    { enabled: !!selectedDevice }
  );

  const faultHistoryQuery = trpc.crossDevice.getFaultHistory.useQuery(
    { deviceId: selectedDevice },
    { enabled: !!selectedDevice }
  );

  const alertsQuery = trpc.crossDevice.getAlerts.useQuery(
    { deviceId: selectedDevice },
    { enabled: !!selectedDevice }
  );

  // ─── 派生数据 ───

  const sharedComponents = sharedComponentsQuery.data ?? [];
  const faultHistory = faultHistoryQuery.data ?? [];
  const alerts = alertsQuery.data ?? [];

  const criticalAlerts = useMemo(() => alerts.filter(a => a.alertLevel === 'critical').length, [alerts]);
  const warningAlerts = useMemo(() => alerts.filter(a => a.alertLevel === 'warning').length, [alerts]);
  const activeFaults = useMemo(() => faultHistory.filter(f => f.status === 'active').length, [faultHistory]);

  const devices = devicesQuery.data ?? [];

  return (
    <MainLayout>
      <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
        {/* 标题 + 设备选择 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
              <Network className="w-5 h-5 text-sky-400" />
              跨设备横向对比
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              SHARED_COMPONENT 自动发现 + 故障传播预警 (P1-4)
            </p>
          </div>
          <div className="flex items-center gap-3">
            {devicesQuery.isLoading ? (
              <div className="flex items-center gap-2 text-zinc-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                加载设备...
              </div>
            ) : (
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger className="w-40 bg-zinc-900 border-zinc-700">
                  <SelectValue placeholder="选择设备" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="共享部件关系" value={sharedComponents.length} icon={<Network className="w-4 h-4 text-sky-400" />} />
          <StatCard label="紧急预警" value={criticalAlerts} icon={<XCircle className="w-4 h-4 text-red-400" />} />
          <StatCard label="警告预警" value={warningAlerts} icon={<AlertTriangle className="w-4 h-4 text-amber-400" />} />
          <StatCard label="活跃故障" value={activeFaults} icon={<Activity className="w-4 h-4 text-orange-400" />} />
        </div>

        {/* 三个 Tab */}
        <Tabs defaultValue="shared" className="space-y-4">
          <TabsList className="bg-zinc-900/60 border border-zinc-800">
            <TabsTrigger value="shared" className="gap-1 data-[state=active]:bg-zinc-800">
              <Network className="w-3.5 h-3.5" />
              共享部件 ({sharedComponents.length})
            </TabsTrigger>
            <TabsTrigger value="faults" className="gap-1 data-[state=active]:bg-zinc-800">
              <Activity className="w-3.5 h-3.5" />
              故障历史 ({faultHistory.length})
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-1 data-[state=active]:bg-zinc-800">
              <AlertTriangle className="w-3.5 h-3.5" />
              传播预警 ({alerts.length})
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: 共享部件列表 */}
          <TabsContent value="shared">
            <PageCard title="共享部件关系">
              <div className="flex items-center gap-2 mb-4">
                <Select value={componentFilter} onValueChange={setComponentFilter}>
                  <SelectTrigger className="w-32 bg-zinc-900 border-zinc-700 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部类型</SelectItem>
                    <SelectItem value="bearing">轴承</SelectItem>
                    <SelectItem value="gearbox">减速箱</SelectItem>
                    <SelectItem value="motor">电机</SelectItem>
                    <SelectItem value="brake">制动器</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {sharedComponentsQuery.isLoading ? (
                <LoadingPlaceholder text="加载共享部件..." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                        <th className="text-left py-2 px-3 font-medium">设备 A</th>
                        <th className="text-center py-2 px-1 font-medium w-8"></th>
                        <th className="text-left py-2 px-3 font-medium">设备 B</th>
                        <th className="text-left py-2 px-3 font-medium">部件类型</th>
                        <th className="text-left py-2 px-3 font-medium">型号 / 件号</th>
                        <th className="text-center py-2 px-3 font-medium">匹配度</th>
                        <th className="text-left py-2 px-3 font-medium w-28">健康 A</th>
                        <th className="text-left py-2 px-3 font-medium w-28">健康 B</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sharedComponents.map(sc => (
                        <tr key={sc.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                          <td className="py-2.5 px-3">
                            <span className="text-zinc-200 font-medium">{sc.equipmentAName}</span>
                            <span className="text-zinc-600 text-[10px] ml-1">{sc.equipmentA}</span>
                          </td>
                          <td className="py-2.5 px-1 text-center">
                            <ArrowRight className="w-3.5 h-3.5 text-zinc-600 inline" />
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-zinc-200 font-medium">{sc.equipmentBName}</span>
                            <span className="text-zinc-600 text-[10px] ml-1">{sc.equipmentB}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <ComponentTypeBadge type={sc.componentType} />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="text-zinc-300 text-xs">{sc.manufacturer} {sc.model}</div>
                            <div className="text-zinc-500 text-[10px]">{sc.partNumber}</div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <SimilarityDot value={sc.similarity} />
                          </td>
                          <td className="py-2.5 px-3">
                            <HealthBar value={sc.healthA} size="sm" />
                          </td>
                          <td className="py-2.5 px-3">
                            <HealthBar value={sc.healthB} size="sm" />
                          </td>
                        </tr>
                      ))}
                      {sharedComponents.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-zinc-500 text-sm">
                            未发现共享部件关系
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </PageCard>
          </TabsContent>

          {/* Tab 2: 故障历史 */}
          <TabsContent value="faults">
            <PageCard title="关联设备故障历史">
              {faultHistoryQuery.isLoading ? (
                <LoadingPlaceholder text="加载故障历史..." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                        <th className="text-left py-2 px-3 font-medium">设备</th>
                        <th className="text-left py-2 px-3 font-medium">故障类型</th>
                        <th className="text-left py-2 px-3 font-medium">故障编码</th>
                        <th className="text-center py-2 px-3 font-medium">严重度</th>
                        <th className="text-left py-2 px-3 font-medium">部件</th>
                        <th className="text-center py-2 px-3 font-medium">状态</th>
                        <th className="text-left py-2 px-3 font-medium">发生时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {faultHistory.map((f, idx) => (
                        <tr key={`${f.equipmentId}-${f.faultCode}-${idx}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                          <td className="py-2.5 px-3">
                            <span className="text-zinc-200 font-medium">{f.equipmentName}</span>
                            <span className="text-zinc-600 text-[10px] ml-1">{f.equipmentId}</span>
                          </td>
                          <td className="py-2.5 px-3 text-zinc-300">{f.faultType}</td>
                          <td className="py-2.5 px-3">
                            <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">{f.faultCode}</code>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <SeverityBadge severity={f.severity} />
                          </td>
                          <td className="py-2.5 px-3">
                            <ComponentTypeBadge type={f.componentType} />
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <FaultStatusBadge status={f.status} />
                          </td>
                          <td className="py-2.5 px-3 text-zinc-400 text-xs">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {new Date(f.occurredAt).toLocaleString('zh-CN')}
                          </td>
                        </tr>
                      ))}
                      {faultHistory.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-zinc-500 text-sm">
                            无关联故障历史
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </PageCard>
          </TabsContent>

          {/* Tab 3: 传播预警 */}
          <TabsContent value="alerts">
            <PageCard title="故障传播预警">
              {alertsQuery.isLoading ? (
                <LoadingPlaceholder text="加载传播预警..." />
              ) : (
                <div className="space-y-3">
                  {alerts.map(alert => (
                    <div
                      key={alert.id}
                      className={cn(
                        'rounded-lg border p-4',
                        alert.alertLevel === 'critical'
                          ? 'border-red-500/30 bg-red-500/5'
                          : alert.alertLevel === 'warning'
                            ? 'border-amber-500/30 bg-amber-500/5'
                            : 'border-sky-500/30 bg-sky-500/5'
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <AlertLevelBadge level={alert.alertLevel} />
                          <SeverityBadge severity={alert.severity} />
                          <ComponentTypeBadge type={alert.sharedComponentType} />
                        </div>
                        <span className="text-[10px] text-zinc-500">
                          {new Date(alert.createdAt).toLocaleString('zh-CN')}
                        </span>
                      </div>

                      {/* 传播路径 */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-zinc-200">{alert.sourceEquipmentName}</span>
                        <ChevronRight className="w-4 h-4 text-zinc-600" />
                        <span className="text-sm font-medium text-zinc-200">{alert.affectedEquipmentName}</span>
                        <span className="text-[10px] text-zinc-500 ml-2">共享 {alert.sharedPartNumber}</span>
                      </div>

                      {/* 描述 */}
                      <p className="text-xs text-zinc-400 mb-2">{alert.description}</p>

                      {/* 健康状态 + 建议 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-zinc-500">受影响部件健康:</span>
                          <div className="w-24">
                            <HealthBar value={alert.affectedHealth} size="sm" />
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <TrendingDown className="w-3 h-3 text-zinc-500" />
                          <span className="text-zinc-400">{alert.recommendation}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {alerts.length === 0 && (
                    <div className="py-8 text-center text-zinc-500 text-sm">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500/50" />
                      当前设备无传播预警
                    </div>
                  )}
                </div>
              )}
            </PageCard>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
