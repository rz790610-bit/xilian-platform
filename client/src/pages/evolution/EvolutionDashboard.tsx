/**
 * 进化引擎总览仪表盘
 * 对接 API: evoEvolution.getOverview / getFlywheelStatus / cycle.getTrend
 */
import React from 'react';
import { trpc } from '@/lib/trpc';
import { MetricCard, StatusBadge, SectionHeader } from '@/components/evolution';
import { useLocation } from 'wouter';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart,
} from 'recharts';

/* ─── 进化闭环状态环 ─── */
const LOOP_STAGES = [
  { key: 'discovering', label: '数据发现', icon: '🔍' },
  { key: 'hypothesizing', label: '假设生成', icon: '💡' },
  { key: 'evaluating', label: '影子评估', icon: '⚖️' },
  { key: 'deploying', label: '金丝雀部署', icon: '🐤' },
  { key: 'crystallizing', label: '知识结晶', icon: '💎' },
];

function EvolutionLoop({ currentStatus }: { currentStatus: string }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
      <SectionHeader title="进化闭环状态" />
      <div className="flex items-center justify-between gap-2">
        {LOOP_STAGES.map((s, i) => {
          const isActive = s.key === currentStatus;
          const isPast = LOOP_STAGES.findIndex(x => x.key === currentStatus) > i;
          return (
            <React.Fragment key={s.key}>
              <div className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-lg transition-all ${
                isActive ? 'bg-indigo-500/15 border border-indigo-500/30 scale-105' :
                isPast ? 'opacity-60' : 'opacity-40'
              }`}>
                <span className="text-xl">{s.icon}</span>
                <span className={`text-[10px] font-medium ${isActive ? 'text-indigo-300' : 'text-zinc-500'}`}>{s.label}</span>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />}
              </div>
              {i < LOOP_STAGES.length - 1 && (
                <div className={`flex-1 h-px ${isPast || isActive ? 'bg-indigo-500/40' : 'bg-zinc-700'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 快捷入口 ─── */
const QUICK_LINKS = [
  { label: '影子评估', path: '/evolution/shadow', icon: '👻', desc: '创建影子评估实验' },
  { label: '冠军挑战者', path: '/evolution/champion', icon: '🏆', desc: '模型对比与裁决' },
  { label: '金丝雀部署', path: '/evolution/canary', icon: '🐤', desc: '渐进式模型发布' },
  { label: 'OTA 车队', path: '/evolution/ota', icon: '🚗', desc: '车队 OTA 部署管理' },
  { label: '飞轮周期', path: '/evolution/flywheel', icon: '🔄', desc: '进化周期与调度' },
  { label: '领域路由', path: '/evolution/domain-router', icon: '🧭', desc: '干预率趋势分析' },
  { label: 'FSD 干预', path: '/evolution/fsd', icon: '🎯', desc: '干预记录与视频轨迹' },
  { label: '知识结晶', path: '/evolution/crystals', icon: '💎', desc: '结晶库与验证' },
];

function QuickLinks() {
  const [, setLocation] = useLocation();
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
      <SectionHeader title="快捷入口" />
      <div className="grid grid-cols-4 gap-3">
        {QUICK_LINKS.map(l => (
          <button
            key={l.path}
            onClick={() => setLocation(l.path)}
            className="flex flex-col items-start gap-1 p-3 rounded-lg bg-zinc-800/40 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/70 transition-all text-left group"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{l.icon}</span>
              <span className="text-xs font-medium text-zinc-200 group-hover:text-zinc-100">{l.label}</span>
            </div>
            <span className="text-[10px] text-zinc-500">{l.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── 趋势图 ─── */
function TrendSection({ trend }: { trend: Array<{ cycleNumber: number; accuracyAfter?: number | null; improvementPercent?: number | null }> }) {
  const chartData = trend.map(t => ({
    name: `#${t.cycleNumber}`,
    accuracy: t.accuracyAfter ?? 0,
    improvement: t.improvementPercent ?? 0,
  }));

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
      <SectionHeader title="进化趋势" />
      {chartData.length > 1 ? (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorAcc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} />
            <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#a1a1aa' }}
            />
            <Area type="monotone" dataKey="accuracy" stroke="#6366f1" fill="url(#colorAcc)" strokeWidth={2} name="准确率" />
            <Line type="monotone" dataKey="improvement" stroke="#22d3ee" strokeWidth={1.5} dot={false} name="提升率%" />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[220px] text-zinc-500 text-sm">
          暂无足够数据绘制趋势图
        </div>
      )}
    </div>
  );
}

/* ─── 主页面 ─── */
export default function EvolutionDashboard() {
  const overview = trpc.evoEvolution.getOverview.useQuery(undefined, {
    refetchInterval: 30000,
    retry: 1,
  });
  const flywheel = trpc.evoEvolution.getFlywheelStatus.useQuery(undefined, {
    refetchInterval: 30000,
    retry: 1,
  });
  const trendQuery = trpc.evoEvolution.cycle.getTrend.useQuery({ weeks: 12 }, { retry: 1 });

  const o = overview.data;
  const f = flywheel.data;

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">进化引擎总览</h1>
          <p className="text-xs text-zinc-500 mt-0.5">自主进化闭环 · 实时监控</p>
        </div>
        <StatusBadge status={f?.status ?? 'idle'} className="text-xs px-3 py-1" />
      </div>

      {/* 指标卡片 */}
      <div className="grid grid-cols-5 gap-3">
        <MetricCard label="进化周期" value={o?.totalCycles ?? 0} sub={`${o?.activeCycles ?? 0} 活跃`} />
        <MetricCard label="挑战实验" value={o?.totalExperiments ?? 0} sub={`${o?.activeDeployments ?? 0} 部署中`} />
        <MetricCard
          label="干预率"
          value={o?.interventionRate ? `${(o.interventionRate * 100).toFixed(2)}%` : '0%'}
          sub={`${o?.totalInterventions ?? 0} 总决策`}
          trend={o?.interventionRate && o.interventionRate < 0.05 ? 'down' : 'stable'}
        />
        <MetricCard label="仿真场景" value={o?.totalSimulations ?? 0} />
        <MetricCard label="知识结晶" value={o?.totalCrystals ?? 0} sub={`${o?.activeSchedules ?? 0} 调度活跃`} />
      </div>

      {/* 进化闭环状态 */}
      <EvolutionLoop currentStatus={f?.status ?? 'idle'} />

      {/* 趋势图 */}
      <TrendSection trend={trendQuery.data?.trend ?? []} />

      {/* 快捷入口 */}
      <QuickLinks />
    </div>
  );
}
