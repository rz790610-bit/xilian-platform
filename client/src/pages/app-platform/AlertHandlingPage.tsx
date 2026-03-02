/**
 * 预警处置页面
 * 预警列表 + 统计卡片 + 过滤 + 展开详情 + 确认处置
 */
import { useState, useMemo, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { useAppPlatformStore } from '@/stores/appPlatformStore';
import { useToast } from '@/components/common/Toast';
import { severityInfo, formatTime } from './constants';

import { Button } from '@/components/ui/button';
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
import { Badge } from '@/components/ui/badge';
import {
  Bell,
  Search,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

const PAGE_SIZE = 20;

export default function AlertHandlingPage() {
  const toast = useToast();
  const {
    alertSeverityFilter, setAlertSeverityFilter,
    alertAckFilter, setAlertAckFilter,
    alertDeviceSearch, setAlertDeviceSearch,
  } = useAppPlatformStore();

  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // ── 查询参数 ──────────────────────────────────────
  const queryInput = useMemo(() => {
    const q: Record<string, unknown> = { page, pageSize: PAGE_SIZE };
    if (alertSeverityFilter && alertSeverityFilter !== 'all') q.severity = alertSeverityFilter;
    if (alertAckFilter === 'pending') q.acknowledged = 0;
    if (alertAckFilter === 'done') q.acknowledged = 1;
    if (alertDeviceSearch.trim()) q.deviceCode = alertDeviceSearch.trim();
    return q;
  }, [page, alertSeverityFilter, alertAckFilter, alertDeviceSearch]);

  const alertsQuery = trpc.database.deviceDb.listAlertEvents.useQuery(
    queryInput as Parameters<typeof trpc.database.deviceDb.listAlertEvents.useQuery>[0],
    { refetchInterval: 15_000 },
  );

  const acknowledgeMutation = trpc.database.deviceDb.acknowledgeAlert.useMutation();

  // ── 解析返回数据 ──────────────────────────────────
  const rawData = alertsQuery.data;
  const alerts: Record<string, unknown>[] = Array.isArray(rawData)
    ? rawData
    : Array.isArray((rawData as Record<string, unknown>)?.items)
      ? ((rawData as Record<string, unknown>).items as Record<string, unknown>[])
      : [];
  const totalCount = typeof (rawData as Record<string, unknown>)?.total === 'number'
    ? (rawData as Record<string, unknown>).total as number
    : alerts.length;

  // ── 统计 ──────────────────────────────────────────
  const stats = useMemo(() => {
    const all = alerts.length;
    const critical = alerts.filter((a) => a.severity === 'critical' || a.severity === 'high').length;
    const medium = alerts.filter((a) => a.severity === 'medium').length;
    const acked = alerts.filter((a) => (a.acknowledged as number) === 1).length;
    return { all, critical, medium, acked };
  }, [alerts]);

  // ── 确认处置 ──────────────────────────────────────
  const handleAcknowledge = useCallback(async (alertId: number) => {
    try {
      await acknowledgeMutation.mutateAsync({
        id: alertId,
        acknowledgedBy: 'operator',
      });
      toast.success('预警已确认处置');
      alertsQuery.refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '操作失败';
      toast.error(msg);
    }
  }, [acknowledgeMutation, toast, alertsQuery]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;

  return (
    <div className="space-y-4">
      {/* ── 统计卡片 ──────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <StatChip icon={<Bell className="h-4 w-4" />} label="预警" value={stats.all} />
        <StatChip
          icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
          label="严重/高"
          value={stats.critical}
          className="text-red-500"
        />
        <StatChip
          icon={<AlertTriangle className="h-4 w-4 text-yellow-500" />}
          label="中等"
          value={stats.medium}
          className="text-yellow-500"
        />
        <StatChip
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          label="已处置"
          value={stats.acked}
          className="text-emerald-500"
        />
      </div>

      {/* ── 过滤栏 ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={alertSeverityFilter} onValueChange={(v) => { setAlertSeverityFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="严重程度" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部级别</SelectItem>
            <SelectItem value="critical">严重</SelectItem>
            <SelectItem value="high">高</SelectItem>
            <SelectItem value="medium">中</SelectItem>
            <SelectItem value="low">低</SelectItem>
          </SelectContent>
        </Select>

        <Select value={alertAckFilter} onValueChange={(v) => { setAlertAckFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="处置状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="pending">待处置</SelectItem>
            <SelectItem value="done">已处置</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="设备编号..."
            value={alertDeviceSearch}
            onChange={(e) => { setAlertDeviceSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
      </div>

      {/* ── 预警列表 ──────────────────────────────────── */}
      <div className="rounded-lg border bg-card">
        {alertsQuery.isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载预警数据...
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[32px]" />
                <TableHead className="w-[120px]">时间</TableHead>
                <TableHead className="w-[100px]">设备</TableHead>
                <TableHead className="w-[80px]">严重程度</TableHead>
                <TableHead>预警信息</TableHead>
                <TableHead className="w-[80px]">状态</TableHead>
                <TableHead className="w-[90px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    暂无预警记录
                  </TableCell>
                </TableRow>
              ) : (
                alerts.map((alert) => {
                  const id = alert.id as number;
                  const sev = severityInfo((alert.severity as string) ?? 'medium');
                  const isAcked = (alert.acknowledged as number) === 1;
                  const isExpanded = expandedId === id;

                  return (
                    <TableRowGroup key={id}>
                      <TableRow
                        className="cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => setExpandedId(isExpanded ? null : id)}
                      >
                        <TableCell className="px-2">
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {formatTime(alert.createdAt as string)}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {(alert.deviceCode as string) ?? '-'}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('text-xs', sev.badge)}>{sev.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm truncate max-w-[300px]">
                          {(alert.message as string) ?? '-'}
                        </TableCell>
                        <TableCell>
                          {isAcked ? (
                            <span className="text-xs text-emerald-500 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> 已处置
                            </span>
                          ) : (
                            <span className="text-xs text-yellow-500">待处置</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {!isAcked && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAcknowledge(id);
                              }}
                              disabled={acknowledgeMutation.isPending}
                            >
                              {acknowledgeMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                '确认'
                              )}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* 展开详情行 */}
                      {isExpanded && (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={7} className="py-3 px-8">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">指标值:</span>{' '}
                                <span className="font-medium tabular-nums">
                                  {alert.metricValue != null ? String(alert.metricValue) : '-'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">阈值:</span>{' '}
                                <span className="font-medium tabular-nums">
                                  {alert.thresholdValue != null ? String(alert.thresholdValue) : '-'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">预警类型:</span>{' '}
                                <span>{(alert.alertType as string) ?? '-'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">预警ID:</span>{' '}
                                <span className="font-mono text-xs">{(alert.alertId as string) ?? '-'}</span>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableRowGroup>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ── 分页 ──────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            上一页
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}

// ── 统计 Chip ────────────────────────────────────────────
function StatChip({
  icon,
  label,
  value,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border">
      {icon}
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-lg font-bold tabular-nums', className)}>{value}</span>
    </div>
  );
}

// ── Fragment wrapper for grouped rows ────────────────────
function TableRowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
