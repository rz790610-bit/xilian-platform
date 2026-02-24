/**
 * FSD 干预面板
 * 对接 API: evoEvolution.fsd.*
 *
 * 后端 fsdRouter 端点:
 *   - listInterventions: { modelId?, interventionType?, minDivergence?, limit? } → { interventions[], total }
 *   - getIntervention: { id } → { intervention, videoTrajectory }
 *   - getInterventionRate: { modelId?, windowHours? } → { rate, inverseMileage, trend, fsdStyle, totalDecisions, interventionCount, windowHours, trendSlope }
 *   - listSimulations: { scenarioType?, difficulty?, limit? } → { simulations[], total }
 *   - getSimulation: { id } → { simulation }
 *   - listVideoTrajectories: { limit? } → { trajectories[], total }
 *
 * 后端 evolutionInterventions schema:
 *   id, sessionId, modelId, divergenceScore, isIntervention, interventionType,
 *   requestData, humanDecision, shadowDecision, contextSnapshot, autoLabel,
 *   labelConfidence, difficultyScore, videoClipUrl, createdAt
 *
 * 后端 evolutionSimulations schema:
 *   id, scenarioId, sourceInterventionId, scenarioType, inputData, expectedOutput,
 *   variations, variationCount, fidelityScore, difficulty, tags, lastRunModelId,
 *   lastRunPassed, lastRunAt, runCount, passCount, createdAt, updatedAt
 *
 * 后端 evolutionVideoTrajectories schema:
 *   id, trajectoryId, interventionId, sessionId, videoUrl, durationMs, frameCount,
 *   embeddingVector, temporalRelations, keyFrames, sensorData, annotations, kgNodeId, createdAt
 */
import React, { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge, MetricCard, SectionHeader, DataTable, EmptyState } from '@/components/evolution';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EvolutionConfigPanel from '@/components/evolution/EvolutionConfigPanel';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie,
} from 'recharts';

/* ─── 干预类型映射 ─── */
const interventionTypeMap: Record<string, { label: string; color: string }> = {
  decision_diverge:  { label: '决策分歧', color: '#f59e0b' },
  threshold_breach:  { label: '阈值突破', color: '#ef4444' },
  safety_override:   { label: '安全覆写', color: '#8b5cf6' },
  manual:            { label: '人工干预', color: '#3b82f6' },
};

/* ─── 仿真难度映射 ─── */
const difficultyMap: Record<string, { label: string; color: string }> = {
  easy:    { label: '简单', color: '#22c55e' },
  medium:  { label: '中等', color: '#f59e0b' },
  hard:    { label: '困难', color: '#ef4444' },
  extreme: { label: '极限', color: '#dc2626' },
};

/* ─── 仿真场景类型映射 ─── */
const scenarioTypeMap: Record<string, string> = {
  regression:  '回归测试',
  stress:      '压力测试',
  edge_case:   '边缘案例',
  adversarial: '对抗测试',
  replay:      '回放测试',
};

/* ─── 干预率概览面板 ─── */
function InterventionRateOverview() {
  const [windowHours, setWindowHours] = useState(24);
  const rateQuery = trpc.evoEvolution.fsd.getInterventionRate.useQuery(
    { windowHours },
    { refetchInterval: 15000 }
  );
  const r = rateQuery.data;

  const trendDirection = r?.trend === 'up' ? 'up' : r?.trend === 'down' ? 'down' : 'stable';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader title="干预率概览" />
        <Select value={String(windowHours)} onValueChange={(v) => setWindowHours(Number(v))}>
          <SelectTrigger className="w-32 bg-zinc-800 border-zinc-700 text-zinc-200 text-xs h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="1">最近 1 小时</SelectItem>
            <SelectItem value="6">最近 6 小时</SelectItem>
            <SelectItem value="24">最近 24 小时</SelectItem>
            <SelectItem value="72">最近 3 天</SelectItem>
            <SelectItem value="168">最近 7 天</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-5 gap-3">
        <MetricCard
          label="FSD 干预率"
          value={r?.fsdStyle ?? '1/9999'}
          sub={`每 ${r?.inverseMileage ?? 9999} 次决策发生 1 次干预`}
          trend={trendDirection}
        />
        <MetricCard
          label="干预百分比"
          value={r ? `${(r.rate * 100).toFixed(2)}%` : '0%'}
          sub={`趋势斜率: ${r?.trendSlope?.toFixed(4) ?? '0'}`}
          trend={trendDirection}
        />
        <MetricCard label="总决策数" value={r?.totalDecisions ?? 0} sub={`窗口: ${windowHours}h`} />
        <MetricCard label="干预次数" value={r?.interventionCount ?? 0} />
        <MetricCard label="趋势方向" value={r?.trend === 'up' ? '上升 ↑' : r?.trend === 'down' ? '下降 ↓' : '稳定 →'} />
      </div>
    </div>
  );
}

/* ─── 干预详情对话框 ─── */
function InterventionDetailDialog({ id, open, onOpenChange }: { id: number; open: boolean; onOpenChange: (v: boolean) => void }) {
  const detail = trpc.evoEvolution.fsd.getIntervention.useQuery({ id }, { enabled: open });
  const d = detail.data?.intervention;
  const video = detail.data?.videoTrajectory;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">干预记录详情 #{id}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {d ? `会话 ${d.sessionId} · 模型 ${d.modelId}` : '加载中...'}
          </DialogDescription>
        </DialogHeader>
        {d ? (
          <div className="space-y-4">
            {/* 基本信息 */}
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="分歧分数" value={typeof d.divergenceScore === 'number' ? d.divergenceScore.toFixed(4) : '-'} />
              <MetricCard label="干预类型" value={interventionTypeMap[d.interventionType]?.label ?? d.interventionType} />
              <MetricCard label="难度分数" value={typeof d.difficultyScore === 'number' ? d.difficultyScore.toFixed(2) : '-'} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="标签置信度" value={typeof d.labelConfidence === 'number' ? `${(d.labelConfidence * 100).toFixed(1)}%` : '-'} />
              <MetricCard label="是否干预" value={d.isIntervention ? '是' : '否'} />
            </div>

            {/* 决策对比 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-800/40 rounded-lg p-4">
                <h4 className="text-xs font-medium text-zinc-400 mb-2">🧑 人类决策</h4>
                <pre className="text-xs text-zinc-300 overflow-x-auto max-h-40 whitespace-pre-wrap">
                  {JSON.stringify(d.humanDecision, null, 2)}
                </pre>
              </div>
              <div className="bg-zinc-800/40 rounded-lg p-4">
                <h4 className="text-xs font-medium text-zinc-400 mb-2">🤖 影子决策</h4>
                <pre className="text-xs text-zinc-300 overflow-x-auto max-h-40 whitespace-pre-wrap">
                  {JSON.stringify(d.shadowDecision, null, 2)}
                </pre>
              </div>
            </div>

            {/* 上下文快照 */}
            {d.contextSnapshot && (
              <div className="bg-zinc-800/40 rounded-lg p-4">
                <h4 className="text-xs font-medium text-zinc-400 mb-2">📋 上下文快照</h4>
                <pre className="text-xs text-zinc-300 overflow-x-auto max-h-32 whitespace-pre-wrap">
                  {JSON.stringify(d.contextSnapshot, null, 2)}
                </pre>
              </div>
            )}

            {/* 自动标签 */}
            {d.autoLabel && (
              <div className="bg-zinc-800/40 rounded-lg p-4">
                <h4 className="text-xs font-medium text-zinc-400 mb-2">🏷️ 自动标签</h4>
                <pre className="text-xs text-zinc-300 overflow-x-auto max-h-24 whitespace-pre-wrap">
                  {JSON.stringify(d.autoLabel, null, 2)}
                </pre>
              </div>
            )}

            {/* 视频轨迹 */}
            {video && (
              <div className="bg-zinc-800/40 rounded-lg p-4">
                <h4 className="text-xs font-medium text-zinc-400 mb-2">🎬 关联视频轨迹</h4>
                <div className="grid grid-cols-3 gap-3 mb-2">
                  <MetricCard label="轨迹 ID" value={video.trajectoryId} />
                  <MetricCard label="时长" value={`${(video.durationMs / 1000).toFixed(1)}s`} />
                  <MetricCard label="帧数" value={video.frameCount ?? '-'} />
                </div>
                {video.videoUrl && (
                  <a href={video.videoUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline">
                    打开视频链接 →
                  </a>
                )}
                {video.keyFrames && Array.isArray(video.keyFrames) && video.keyFrames.length > 0 && (
                  <div className="mt-3">
                    <h5 className="text-[10px] text-zinc-500 mb-1">关键帧</h5>
                    <div className="flex gap-2 overflow-x-auto">
                      {video.keyFrames.slice(0, 8).map((kf: any, i: number) => (
                        <div key={i} className="shrink-0 bg-zinc-700/40 rounded p-2 text-center">
                          <span className="text-[10px] text-zinc-400 block">{(kf.timestamp / 1000).toFixed(1)}s</span>
                          <span className="text-[10px] text-zinc-300 block mt-0.5 max-w-[80px] truncate">{kf.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 视频剪辑链接 */}
            {d.videoClipUrl && !video && (
              <div className="bg-zinc-800/40 rounded-lg p-3">
                <a href={d.videoClipUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-indigo-400 hover:text-indigo-300 underline">
                  🎬 查看视频剪辑 →
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-zinc-500">加载中...</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── 干预记录列表 ─── */
function InterventionList() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const listQuery = trpc.evoEvolution.fsd.listInterventions.useQuery(
    {
      interventionType: typeFilter !== 'all' ? typeFilter as any : undefined,
      limit: 100,
    },
    { refetchInterval: 15000 }
  );

  const interventions = listQuery.data?.interventions ?? [];
  const total = listQuery.data?.total ?? 0;

  // 类型分布统计
  const typeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    interventions.forEach((r: any) => {
      const t = r.interventionType ?? 'unknown';
      counts[t] = (counts[t] ?? 0) + 1;
    });
    return Object.entries(counts).map(([type, count]) => ({
      name: interventionTypeMap[type]?.label ?? type,
      value: count,
      fill: interventionTypeMap[type]?.color ?? '#6b7280',
    }));
  }, [interventions]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader title={`干预记录 (${total})`} />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 bg-zinc-800 border-zinc-700 text-zinc-200 text-xs h-8">
            <SelectValue placeholder="全部类型" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="decision_diverge">决策分歧</SelectItem>
            <SelectItem value="threshold_breach">阈值突破</SelectItem>
            <SelectItem value="safety_override">安全覆写</SelectItem>
            <SelectItem value="manual">人工干预</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 类型分布图 */}
      {typeDistribution.length > 0 && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
          <h4 className="text-xs font-medium text-zinc-400 mb-3">干预类型分布</h4>
          <div className="flex items-center gap-8">
            <div style={{ width: 160, height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeDistribution}
                    cx="50%" cy="50%"
                    innerRadius={40} outerRadius={70}
                    dataKey="value"
                    stroke="none"
                  >
                    {typeDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: '#e4e4e7' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-2">
              {typeDistribution.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: d.fill }} />
                  <span className="text-xs text-zinc-300">{d.name}</span>
                  <span className="text-xs text-zinc-500 tabular-nums">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 干预记录表 */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
        <DataTable
          data={interventions}
          onRowClick={(row: any) => setSelectedId(row.id)}
          columns={[
            { key: 'id', label: 'ID', width: '60px' },
            { key: 'sessionId', label: '会话 ID', render: (r: any) => (
              <span className="text-zinc-200 font-mono text-[11px]">{r.sessionId?.slice(0, 12)}...</span>
            )},
            { key: 'modelId', label: '模型', render: (r: any) => (
              <span className="text-zinc-300 text-xs">{r.modelId}</span>
            )},
            { key: 'interventionType', label: '类型', width: '100px', render: (r: any) => {
              const t = interventionTypeMap[r.interventionType];
              return <span className="text-xs font-medium" style={{ color: t?.color ?? '#9ca3af' }}>{t?.label ?? r.interventionType}</span>;
            }},
            { key: 'divergenceScore', label: '分歧分数', width: '90px', render: (r: any) => {
              const score = r.divergenceScore;
              const color = score > 0.8 ? 'text-red-400' : score > 0.5 ? 'text-amber-400' : 'text-emerald-400';
              return <span className={`text-xs tabular-nums font-medium ${color}`}>{typeof score === 'number' ? score.toFixed(3) : '-'}</span>;
            }},
            { key: 'difficultyScore', label: '难度', width: '70px', render: (r: any) => (
              <span className="text-xs tabular-nums text-zinc-400">{typeof r.difficultyScore === 'number' ? r.difficultyScore.toFixed(2) : '-'}</span>
            )},
            { key: 'isIntervention', label: '干预', width: '60px', render: (r: any) => (
              <StatusBadge status={r.isIntervention ? 'critical' : 'healthy'} />
            )},
            { key: 'createdAt', label: '时间', render: (r: any) => (
              <span className="text-zinc-500 text-xs">{r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '-'}</span>
            )},
          ]}
          emptyMessage="暂无干预记录"
        />
      </div>

      {/* 详情对话框 */}
      {selectedId && (
        <InterventionDetailDialog id={selectedId} open={!!selectedId} onOpenChange={(v) => { if (!v) setSelectedId(null); }} />
      )}
    </div>
  );
}

/* ─── 仿真场景面板 ─── */
function SimulationPanel() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const listQuery = trpc.evoEvolution.fsd.listSimulations.useQuery(
    {
      scenarioType: typeFilter !== 'all' ? typeFilter as any : undefined,
      limit: 50,
    },
    { refetchInterval: 30000 }
  );

  const simulations = listQuery.data?.simulations ?? [];
  const total = listQuery.data?.total ?? 0;

  // 详情查询
  const detailQuery = trpc.evoEvolution.fsd.getSimulation.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId }
  );

  // 难度分布
  const difficultyDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    simulations.forEach((s: any) => {
      const d = s.difficulty ?? 'medium';
      counts[d] = (counts[d] ?? 0) + 1;
    });
    return Object.entries(counts).map(([diff, count]) => ({
      name: difficultyMap[diff]?.label ?? diff,
      value: count,
      fill: difficultyMap[diff]?.color ?? '#6b7280',
    }));
  }, [simulations]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader title={`仿真场景库 (${total})`} />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-32 bg-zinc-800 border-zinc-700 text-zinc-200 text-xs h-8">
            <SelectValue placeholder="全部类型" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="regression">回归测试</SelectItem>
            <SelectItem value="stress">压力测试</SelectItem>
            <SelectItem value="edge_case">边缘案例</SelectItem>
            <SelectItem value="adversarial">对抗测试</SelectItem>
            <SelectItem value="replay">回放测试</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 概览指标 */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="总场景数" value={total} />
        <MetricCard label="通过率" value={simulations.length > 0
          ? `${((simulations.filter((s: any) => s.lastRunPassed === 1).length / simulations.length) * 100).toFixed(1)}%`
          : '-'
        } />
        <MetricCard label="极限难度" value={simulations.filter((s: any) => s.difficulty === 'extreme').length} />
        <MetricCard label="总运行次数" value={simulations.reduce((acc: number, s: any) => acc + (s.runCount ?? 0), 0)} />
      </div>

      {/* 难度分布 */}
      {difficultyDistribution.length > 0 && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
          <h4 className="text-xs font-medium text-zinc-400 mb-3">难度分布</h4>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={difficultyDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                  itemStyle={{ color: '#e4e4e7' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {difficultyDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 场景列表 */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
        <DataTable
          data={simulations}
          onRowClick={(row: any) => setSelectedId(row.id)}
          columns={[
            { key: 'id', label: 'ID', width: '50px' },
            { key: 'scenarioId', label: '场景 ID', render: (r: any) => (
              <span className="text-zinc-200 font-mono text-[11px]">{r.scenarioId?.slice(0, 16)}</span>
            )},
            { key: 'scenarioType', label: '类型', width: '90px', render: (r: any) => (
              <span className="text-xs text-zinc-300">{scenarioTypeMap[r.scenarioType] ?? r.scenarioType}</span>
            )},
            { key: 'difficulty', label: '难度', width: '70px', render: (r: any) => {
              const d = difficultyMap[r.difficulty];
              return <span className="text-xs font-medium" style={{ color: d?.color ?? '#9ca3af' }}>{d?.label ?? r.difficulty}</span>;
            }},
            { key: 'fidelityScore', label: '保真度', width: '80px', render: (r: any) => (
              <span className="text-xs tabular-nums text-zinc-300">{typeof r.fidelityScore === 'number' ? r.fidelityScore.toFixed(2) : '-'}</span>
            )},
            { key: 'runCount', label: '运行/通过', width: '90px', render: (r: any) => (
              <span className="text-xs tabular-nums text-zinc-300">{r.runCount ?? 0}/{r.passCount ?? 0}</span>
            )},
            { key: 'lastRunPassed', label: '最近结果', width: '80px', render: (r: any) => (
              <StatusBadge status={r.lastRunPassed === 1 ? 'completed' : r.lastRunPassed === 0 ? 'failed' : 'pending'} />
            )},
            { key: 'variationCount', label: '变体数', width: '70px', render: (r: any) => (
              <span className="text-xs tabular-nums text-zinc-400">{r.variationCount ?? 0}</span>
            )},
          ]}
          emptyMessage="暂无仿真场景"
        />
      </div>

      {/* 场景详情对话框 */}
      {selectedId && detailQuery.data?.simulation && (
        <Dialog open={!!selectedId} onOpenChange={(v) => { if (!v) setSelectedId(null); }}>
          <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">仿真场景详情</DialogTitle>
              <DialogDescription className="text-zinc-400">
                {detailQuery.data.simulation.scenarioId}
              </DialogDescription>
            </DialogHeader>
            {(() => {
              const s = detailQuery.data.simulation;
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <MetricCard label="场景类型" value={scenarioTypeMap[s.scenarioType] ?? s.scenarioType} />
                    <MetricCard label="难度" value={difficultyMap[s.difficulty]?.label ?? s.difficulty} />
                    <MetricCard label="保真度" value={typeof s.fidelityScore === 'number' ? s.fidelityScore.toFixed(2) : '-'} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-800/40 rounded-lg p-4">
                      <h4 className="text-xs font-medium text-zinc-400 mb-2">输入数据</h4>
                      <pre className="text-xs text-zinc-300 overflow-x-auto max-h-32 whitespace-pre-wrap">
                        {JSON.stringify(s.inputData, null, 2)}
                      </pre>
                    </div>
                    <div className="bg-zinc-800/40 rounded-lg p-4">
                      <h4 className="text-xs font-medium text-zinc-400 mb-2">期望输出</h4>
                      <pre className="text-xs text-zinc-300 overflow-x-auto max-h-32 whitespace-pre-wrap">
                        {JSON.stringify(s.expectedOutput, null, 2)}
                      </pre>
                    </div>
                  </div>
                  {s.tags && Array.isArray(s.tags) && s.tags.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {s.tags.map((tag: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-[10px] rounded border border-zinc-700">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <MetricCard label="运行次数" value={s.runCount ?? 0} />
                    <MetricCard label="通过次数" value={s.passCount ?? 0} />
                    <MetricCard label="变体数" value={s.variationCount ?? 0} />
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ─── 视频轨迹面板 ─── */
function VideoTrajectoryPanel() {
  const listQuery = trpc.evoEvolution.fsd.listVideoTrajectories.useQuery(
    { limit: 50 },
    { refetchInterval: 30000 }
  );

  const trajectories = listQuery.data?.trajectories ?? [];
  const total = listQuery.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <SectionHeader title={`视频轨迹 (${total})`} />

      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="总轨迹数" value={total} />
        <MetricCard label="总时长" value={`${(trajectories.reduce((acc: number, t: any) => acc + (t.durationMs ?? 0), 0) / 1000).toFixed(0)}s`} />
        <MetricCard label="有 KG 节点" value={trajectories.filter((t: any) => t.kgNodeId).length} />
        <MetricCard label="有关键帧" value={trajectories.filter((t: any) => t.keyFrames && Array.isArray(t.keyFrames) && t.keyFrames.length > 0).length} />
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
        <DataTable
          data={trajectories}
          columns={[
            { key: 'id', label: 'ID', width: '50px' },
            { key: 'trajectoryId', label: '轨迹 ID', render: (r: any) => (
              <span className="text-zinc-200 font-mono text-[11px]">{r.trajectoryId?.slice(0, 16)}</span>
            )},
            { key: 'interventionId', label: '关联干预', width: '90px', render: (r: any) => (
              <span className="text-xs tabular-nums text-zinc-400">{r.interventionId ?? '-'}</span>
            )},
            { key: 'durationMs', label: '时长', width: '80px', render: (r: any) => (
              <span className="text-xs tabular-nums text-zinc-300">{r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : '-'}</span>
            )},
            { key: 'frameCount', label: '帧数', width: '70px', render: (r: any) => (
              <span className="text-xs tabular-nums text-zinc-400">{r.frameCount ?? '-'}</span>
            )},
            { key: 'kgNodeId', label: 'KG 节点', width: '100px', render: (r: any) => (
              r.kgNodeId ? <span className="text-xs text-indigo-400 font-mono">{r.kgNodeId.slice(0, 10)}</span> : <span className="text-zinc-600">-</span>
            )},
            { key: 'videoUrl', label: '视频', width: '60px', render: (r: any) => (
              r.videoUrl ? (
                <a href={r.videoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:text-indigo-300">
                  查看
                </a>
              ) : <span className="text-zinc-600">-</span>
            )},
            { key: 'createdAt', label: '时间', render: (r: any) => (
              <span className="text-zinc-500 text-xs">{r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '-'}</span>
            )},
          ]}
          emptyMessage="暂无视频轨迹"
        />
      </div>
    </div>
  );
}

/* ─── 主页面 ─── */
export default function FSDInterventionPanel() {
  return (
    <MainLayout title="FSD 干预">
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">FSD 干预分析</h1>
        <p className="text-xs text-zinc-500 mt-0.5">FSD Intervention · 干预记录追踪、仿真场景管理与视频轨迹回放</p>
      </div>

      {/* 干预率概览 */}
      <InterventionRateOverview />

      {/* 标签页切换 */}
      <Tabs defaultValue="interventions" className="w-full">
        <TabsList className="bg-zinc-800/60 border border-zinc-700">
          <TabsTrigger value="interventions" className="text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100">
            干预记录
          </TabsTrigger>
          <TabsTrigger value="simulations" className="text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100">
            仿真场景
          </TabsTrigger>
          <TabsTrigger value="trajectories" className="text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100">
            视频轨迹
          </TabsTrigger>
          <TabsTrigger value="config" className="text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100">
            ⚙️ 引擎配置
          </TabsTrigger>
        </TabsList>

        <TabsContent value="interventions" className="mt-4">
          <InterventionList />
        </TabsContent>
        <TabsContent value="simulations" className="mt-4">
          <SimulationPanel />
        </TabsContent>
        <TabsContent value="trajectories" className="mt-4">
          <VideoTrajectoryPanel />
        </TabsContent>
        <TabsContent value="config" className="mt-4">
          <EvolutionConfigPanel modules={['simEngine', 'autoLabeler']} title="仿真引擎 / 自动标注配置" />
        </TabsContent>
      </Tabs>
    </div>
    </MainLayout>
  );
}
