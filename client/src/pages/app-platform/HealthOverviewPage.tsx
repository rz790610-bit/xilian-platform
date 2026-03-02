/**
 * 设备健康总览页面
 * 设备排名表 + 搜索/过滤 + 颜色编码健康评分
 */
import { useMemo } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { useAppPlatformStore } from '@/stores/appPlatformStore';
import {
  healthColor,
  healthBg,
  relativeTime,
  SYNC_STATUS_MAP,
  HEALTH_THRESHOLDS,
  withDemoFallback,
} from './constants';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Search, ChevronRight, Activity, Loader2 } from 'lucide-react';

// ── 设备类型中文标签 ──────────────────────────────────────
const DEVICE_TYPE_LABELS: Record<string, string> = {
  fan: '风机',
  pump: '泵',
  motor: '电机',
  rotating_machinery: '旋转机械',
  compressor: '压缩机',
  RTG: 'RTG 轮胎吊',
  STS: 'STS 岸桥',
  AGV: 'AGV 导引车',
};

function deviceTypeLabel(type: string): string {
  return DEVICE_TYPE_LABELS[type] ?? type;
}

export default function HealthOverviewPage() {
  const [, setLocation] = useLocation();
  const {
    healthSearch, setHealthSearch,
    healthTypeFilter, setHealthTypeFilter,
    healthStatusFilter, setHealthStatusFilter,
    setSelectedDeviceCode,
  } = useAppPlatformStore();

  const twinsQuery = trpc.evoPipeline.listEquipmentTwins.useQuery(undefined, {
    refetchInterval: 30_000,
    retry: 2,
  });

  const rawTwins = twinsQuery.data ?? [];

  // 为每台设备注入确定性演示评分 (当后端尚未接入真实评分时)
  const twins = useMemo(
    () =>
      rawTwins.map((t) => ({
        ...t,
        healthScore: withDemoFallback(t.healthScore, t.equipmentId, 'health'),
        safetyScore: withDemoFallback(t.safetyScore, t.equipmentId, 'safety'),
        efficiencyScore: withDemoFallback(t.efficiencyScore, t.equipmentId, 'efficiency'),
      })),
    [rawTwins],
  );

  // 提取设备类型列表 (去重)
  const deviceTypes = useMemo(() => {
    const types = new Set(twins.map((t) => t.equipmentType));
    return Array.from(types).sort();
  }, [twins]);

  // 过滤 + 排序
  const filtered = useMemo(() => {
    let list = [...twins];

    // 搜索
    if (healthSearch) {
      const q = healthSearch.toLowerCase();
      list = list.filter(
        (t) =>
          t.equipmentName.toLowerCase().includes(q) ||
          t.equipmentId.toLowerCase().includes(q),
      );
    }

    // 设备类型
    if (healthTypeFilter && healthTypeFilter !== 'all') {
      list = list.filter((t) => t.equipmentType === healthTypeFilter);
    }

    // 健康状态
    if (healthStatusFilter && healthStatusFilter !== 'all') {
      list = list.filter((t) => {
        const score = t.healthScore;
        switch (healthStatusFilter) {
          case 'good':
            return score >= HEALTH_THRESHOLDS.GOOD;
          case 'warn':
            return score >= HEALTH_THRESHOLDS.WARN && score < HEALTH_THRESHOLDS.GOOD;
          case 'bad':
            return score < HEALTH_THRESHOLDS.WARN;
          default:
            return true;
        }
      });
    }

    // 按健康评分升序 (差的在前方便关注)
    list.sort((a, b) => a.healthScore - b.healthScore);

    return list;
  }, [twins, healthSearch, healthTypeFilter, healthStatusFilter]);

  const handleRowClick = (deviceCode: string) => {
    setSelectedDeviceCode(deviceCode);
    setLocation(`/app/diagnosis/${deviceCode}`);
  };

  // ── Loading State ────────────────────────────────────
  if (twinsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>加载设备数据...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── 过滤栏 ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索设备名称或编号..."
            value={healthSearch}
            onChange={(e) => setHealthSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={healthTypeFilter} onValueChange={setHealthTypeFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="设备类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            {deviceTypes.map((t) => (
              <SelectItem key={t} value={t}>{deviceTypeLabel(t)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={healthStatusFilter} onValueChange={setHealthStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="健康状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="good">健康 (&ge;{HEALTH_THRESHOLDS.GOOD})</SelectItem>
            <SelectItem value="warn">关注 (&ge;{HEALTH_THRESHOLDS.WARN})</SelectItem>
            <SelectItem value="bad">异常 (&lt;{HEALTH_THRESHOLDS.WARN})</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground ml-auto">
          共 {filtered.length} 台设备
        </span>
      </div>

      {/* ── 设备排名表 ──────────────────────────────────── */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px]">设备名称</TableHead>
              <TableHead className="w-[80px]">类型</TableHead>
              <TableHead className="w-[140px]">健康评分</TableHead>
              <TableHead className="w-[80px] text-center">安全</TableHead>
              <TableHead className="w-[80px] text-center">效率</TableHead>
              <TableHead className="w-[80px]">状态</TableHead>
              <TableHead className="w-[100px]">更新时间</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  {twinsQuery.error ? '数据加载失败，请稍后重试' : '暂无设备数据'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((twin) => {
                const syncInfo = SYNC_STATUS_MAP[twin.syncStatus] ?? { label: twin.syncStatus, dot: 'bg-gray-400' };
                const score = twin.healthScore;
                return (
                  <TableRow
                    key={twin.equipmentId}
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => handleRowClick(twin.equipmentId)}
                  >
                    {/* 设备名称 */}
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Activity className={cn('h-4 w-4', healthColor(twin.healthScore))} />
                        <div>
                          <div>{twin.equipmentName}</div>
                          <div className="text-xs text-muted-foreground">{twin.equipmentId}</div>
                        </div>
                      </div>
                    </TableCell>

                    {/* 类型 */}
                    <TableCell>
                      <span className="text-xs px-2 py-0.5 rounded bg-muted">{deviceTypeLabel(twin.equipmentType)}</span>
                    </TableCell>

                    {/* 健康评分 + Progress */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={cn('text-lg font-bold tabular-nums w-8 text-right', healthColor(score))}>
                          {Math.round(score)}
                        </span>
                        <Progress
                          value={score}
                          className={cn(
                            'h-2 flex-1',
                            score >= HEALTH_THRESHOLDS.GOOD
                              ? '[&>[data-slot=progress-indicator]]:bg-emerald-500'
                              : score >= HEALTH_THRESHOLDS.WARN
                                ? '[&>[data-slot=progress-indicator]]:bg-yellow-500'
                                : '[&>[data-slot=progress-indicator]]:bg-red-500',
                          )}
                        />
                      </div>
                    </TableCell>

                    {/* 安全 */}
                    <TableCell className={cn('text-center tabular-nums', healthColor(twin.safetyScore))}>
                      {Math.round(twin.safetyScore)}
                    </TableCell>

                    {/* 效率 */}
                    <TableCell className={cn('text-center tabular-nums', healthColor(twin.efficiencyScore))}>
                      {Math.round(twin.efficiencyScore)}
                    </TableCell>

                    {/* 状态 */}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className={cn('h-2 w-2 rounded-full', syncInfo.dot)} />
                        <span className="text-sm">{syncInfo.label}</span>
                      </div>
                    </TableCell>

                    {/* 更新时间 */}
                    <TableCell className="text-sm text-muted-foreground">
                      {relativeTime(twin.lastSyncAt)}
                    </TableCell>

                    {/* 箭头 */}
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
