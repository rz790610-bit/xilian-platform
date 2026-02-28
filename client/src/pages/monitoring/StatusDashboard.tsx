/**
 * StatusDashboard — 客户状态大屏
 *
 * 路由: /monitoring/status
 * 数据源: trpc.observabilityHub.getStatusView (15 秒轮询)
 *
 * 布局:
 * - 整体状态 (绿/黄/红)
 * - 4 个 KPI 卡片
 * - 最近 24 小时事件摘要
 * - 设备概况 + 在线率进度条
 */

import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  Server,
  Clock,
  Bell,
  Wrench,
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';

// ── Status config map ──

const STATUS_CONFIG = {
  operational: {
    color: 'bg-green-500',
    textColor: 'text-green-500',
    Icon: CheckCircle,
  },
  degraded: {
    color: 'bg-yellow-500',
    textColor: 'text-yellow-500',
    Icon: AlertTriangle,
  },
  outage: {
    color: 'bg-red-500',
    textColor: 'text-red-500',
    Icon: XCircle,
  },
} as const;

// ── Component ──

export default function StatusDashboard() {
  const { data, isLoading } = trpc.observabilityHub.getStatusView.useQuery(undefined, {
    refetchInterval: 15_000,
  });

  if (isLoading || !data) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">加载中...</div>
        </div>
      </MainLayout>
    );
  }

  const config = STATUS_CONFIG[data.overallStatus];
  const StatusIcon = config.Icon;

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageCard title="平台运行状态" icon={<Shield className="w-5 h-5" />}>

          {/* ── 整体状态横幅 ── */}
          <Card>
            <CardContent className="py-8">
              <div className="flex items-center justify-center gap-3">
                <span className={`w-4 h-4 rounded-full ${config.color} animate-pulse`} />
                <StatusIcon className={`w-6 h-6 ${config.textColor}`} />
                <span className={`text-2xl font-bold ${config.textColor}`}>
                  {data.overallMessage}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ── 4 个 KPI 卡片 ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <StatCard
              value={`${data.devices.onlineRate}%`}
              label="设备在线率"
              icon={<Server className="w-5 h-5 text-blue-500" />}
            />
            <StatCard
              value={`${data.kpis.earlyWarningDays.toFixed(1)} 天`}
              label="预警提前天数"
              icon={<Clock className="w-5 h-5 text-green-500" />}
            />
            <StatCard
              value={`${data.kpis.avoidedDowntimes} 次`}
              label="避免停机次数"
              icon={<Shield className="w-5 h-5 text-purple-500" />}
            />
            <StatCard
              value={`${data.kpis.platformScore.toFixed(0)} 分`}
              label="平台综合评分"
              icon={<TrendingUp className="w-5 h-5 text-cyan-500" />}
            />
          </div>

          {/* ── 最近 24 小时事件摘要 ── */}
          <Card className="mt-6">
            <CardContent className="py-4">
              <div className="text-sm text-muted-foreground mb-3">最近 24 小时:</div>
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-orange-500" />
                  <span>
                    处理告警 <strong>{data.recentSummary.alertsHandled}</strong> 条
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-blue-500" />
                  <span>
                    完成诊断 <strong>{data.recentSummary.diagnosesCompleted}</strong> 次
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-green-500" />
                  <span>
                    安排维护 <strong>{data.recentSummary.maintenancesScheduled}</strong> 项
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── 设备概况 + 进度条 ── */}
          <Card className="mt-6">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm">
                  设备概况: <strong>{data.devices.totalDevices}</strong> 台设备{' · '}
                  <strong>{data.devices.onlineDevices}</strong> 台在线
                </div>
                <Badge
                  variant={
                    data.devices.onlineRate >= 95
                      ? 'success'
                      : data.devices.onlineRate >= 80
                        ? 'warning'
                        : 'destructive'
                  }
                >
                  {data.devices.onlineRate}%
                </Badge>
              </div>
              <Progress value={data.devices.onlineRate} />
              <div className="mt-3 text-xs text-muted-foreground text-right">
                更新时间: {new Date(data.generatedAt).toLocaleString('zh-CN')}
              </div>
            </CardContent>
          </Card>

        </PageCard>
      </div>
    </MainLayout>
  );
}
