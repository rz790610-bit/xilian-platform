/**
 * OTA 车队管理
 * 对接 API: evoEvolution.canary.list + fsd.getInterventionRate
 * OTA 部署复用 canary 的数据模型（共享 DeploymentRepository）
 */
import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { StatusBadge, MetricCard, SectionHeader, DataTable, StageTimeline } from '@/components/evolution';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

/* ─── 车队健康概览 ─── */
function FleetHealthOverview() {
  const interventionRate = trpc.evoEvolution.fsd.getInterventionRate.useQuery(
    { windowHours: 24 },
    { refetchInterval: 30000 }
  );
  const r = interventionRate.data;

  const gaugeData = [
    { name: '干预率', value: r?.rate ? r.rate * 100 : 0 },
  ];

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
      <SectionHeader title="车队健康概览" />
      <div className="grid grid-cols-5 gap-3">
        <MetricCard
          label="干预率"
          value={r?.fsdStyle ?? '1/9999'}
          sub={`${(r?.rate ? r.rate * 100 : 0).toFixed(3)}%`}
          trend={r?.trend === 'improving' ? 'down' : r?.trend === 'degrading' ? 'up' : 'stable'}
        />
        <MetricCard label="总决策数" value={r?.totalDecisions ?? 0} sub={`${r?.windowHours ?? 24}h 窗口`} />
        <MetricCard label="干预次数" value={r?.interventionCount ?? 0} />
        <MetricCard
          label="趋势方向"
          value={r?.trend === 'improving' ? '改善中' : r?.trend === 'degrading' ? '恶化中' : '稳定'}
          trend={r?.trend === 'improving' ? 'down' : r?.trend === 'degrading' ? 'up' : 'stable'}
        />
        <MetricCard label="趋势斜率" value={r?.trendSlope?.toFixed(6) ?? '0'} />
      </div>
    </div>
  );
}

/* ─── OTA 部署阶段分布 ─── */
function StageDistribution({ deployments }: { deployments: any[] }) {
  const stageCount: Record<string, number> = {};
  deployments.forEach(d => {
    const stage = d.currentStage ?? 'unknown';
    stageCount[stage] = (stageCount[stage] || 0) + 1;
  });
  const chartData = Object.entries(stageCount).map(([name, value]) => ({ name, value }));
  const COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

  if (!chartData.length) return null;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
      <SectionHeader title="部署阶段分布" />
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} />
          <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
          <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── 主页面 ─── */
export default function OTAFleetManager() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const listQuery = trpc.evoEvolution.canary.list.useQuery({ limit: 100 }, { refetchInterval: 10000 });

  const allDeployments = listQuery.data?.deployments ?? [];
  // OTA 部署通常是较大规模的部署（区分于小规模金丝雀）
  const deployments = allDeployments;

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">OTA 车队管理</h1>
          <p className="text-xs text-zinc-500 mt-0.5">OTA Fleet · 车队级模型部署与健康监控</p>
        </div>
      </div>

      {/* 车队健康 */}
      <FleetHealthOverview />

      {/* 指标卡片 */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="总部署" value={deployments.length} />
        <MetricCard label="活跃部署" value={deployments.filter(d => d.status === 'active').length} />
        <MetricCard label="已完成" value={deployments.filter(d => d.status === 'completed').length} />
        <MetricCard label="已回滚" value={deployments.filter(d => d.status === 'rolled_back').length} />
      </div>

      {/* 阶段分布 */}
      <StageDistribution deployments={deployments.filter(d => d.status === 'active')} />

      {/* 部署列表 */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
        <SectionHeader title="OTA 部署列表" />
        <DataTable
          data={deployments}
          onRowClick={(row) => setSelectedId(row.id)}
          columns={[
            { key: 'id', label: 'ID', width: '60px' },
            { key: 'modelId', label: '模型', render: (r) => <span className="text-zinc-200 font-medium">{r.modelId}</span> },
            { key: 'targetVersion', label: '版本' },
            { key: 'currentStage', label: '阶段', width: '100px' },
            { key: 'currentTrafficPercent', label: '流量', width: '80px', render: (r) => (
              <div className="flex items-center gap-1.5">
                <div className="w-16 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${r.currentTrafficPercent ?? 0}%` }} />
                </div>
                <span className="text-[10px] tabular-nums text-zinc-400">{r.currentTrafficPercent ?? 0}%</span>
              </div>
            )},
            { key: 'status', label: '状态', width: '100px', render: (r) => <StatusBadge status={r.status ?? 'pending'} /> },
            { key: 'createdAt', label: '创建时间', render: (r) => <span className="text-zinc-500 text-xs">{r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '-'}</span> },
          ]}
          emptyMessage="暂无 OTA 部署"
        />
      </div>
    </div>
  );
}
