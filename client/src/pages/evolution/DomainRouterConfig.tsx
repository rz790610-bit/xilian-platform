/**
 * 领域路由配置
 * 对接 API: evoEvolution.fsd.* (getInterventionRate, listInterventions)
 *
 * 后端 evolutionInterventions schema:
 *   id, sessionId, modelId, divergenceScore, isIntervention, interventionType,
 *   requestData, humanDecision, shadowDecision, contextSnapshot, autoLabel,
 *   labelConfidence, difficultyScore, videoClipUrl, createdAt
 *
 * fsd.getInterventionRate 返回:
 *   rate, fsdStyle, totalDecisions, interventionCount, windowHours, trend, trendSlope
 *
 * fsd.listInterventions 输入: { modelId?, interventionType?, limit? }
 * fsd.listInterventions 返回: { interventions[], total }
 */
import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { StatusBadge, MetricCard, SectionHeader, DataTable } from '@/components/evolution';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/* ─── 干预率趋势 ─── */
function InterventionTrend() {
  const rate24h = trpc.evoEvolution.fsd.getInterventionRate.useQuery({ windowHours: 24 }, { refetchInterval: 30000 });
  const rate7d = trpc.evoEvolution.fsd.getInterventionRate.useQuery({ windowHours: 168 }, { refetchInterval: 60000 });

  const r24 = rate24h.data;
  const r7d = rate7d.data;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
      <SectionHeader title="干预率趋势" />
      <div className="grid grid-cols-6 gap-3 mb-4">
        <MetricCard label="24h 干预率" value={r24?.fsdStyle ?? '-'} sub={`${((r24?.rate ?? 0) * 100).toFixed(3)}%`}
          trend={r24?.trend === 'improving' ? 'down' : r24?.trend === 'degrading' ? 'up' : 'stable'} />
        <MetricCard label="7d 干预率" value={r7d?.fsdStyle ?? '-'} sub={`${((r7d?.rate ?? 0) * 100).toFixed(3)}%`} />
        <MetricCard label="24h 总决策" value={r24?.totalDecisions ?? 0} />
        <MetricCard label="24h 干预数" value={r24?.interventionCount ?? 0} />
        <MetricCard label="趋势方向" value={r24?.trend === 'improving' ? '改善中' : r24?.trend === 'degrading' ? '恶化中' : '稳定'} />
        <MetricCard label="趋势斜率" value={r24?.trendSlope?.toFixed(6) ?? '0'} />
      </div>
    </div>
  );
}

/* ─── 干预事件列表 ─── */
function InterventionList() {
  const [modelId, setModelId] = useState('');
  const [interventionType, setInterventionType] = useState<string>('all');
  const [page, setPage] = useState(1);
  const limit = 50;

  const listQuery = trpc.evoEvolution.fsd.listInterventions.useQuery({
    modelId: modelId || undefined,
    interventionType: interventionType === 'all' ? undefined : interventionType as any,
    limit,
  }, { refetchInterval: 15000 });

  const interventions = listQuery.data?.interventions ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <SectionHeader title="干预事件记录" />
        <div className="flex items-center gap-2">
          <Select value={interventionType} onValueChange={setInterventionType}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-300 w-36 h-8 text-xs">
              <SelectValue placeholder="干预类型" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="decision_diverge">决策分歧</SelectItem>
              <SelectItem value="threshold_breach">阈值突破</SelectItem>
              <SelectItem value="safety_override">安全覆盖</SelectItem>
              <SelectItem value="manual">手动</SelectItem>
            </SelectContent>
          </Select>
          <Input value={modelId} onChange={e => setModelId(e.target.value)} placeholder="模型 ID"
            className="bg-zinc-800 border-zinc-700 text-zinc-200 w-28 h-8 text-xs" />
        </div>
      </div>

      <DataTable
        data={interventions}
        columns={[
          { key: 'id', label: 'ID', width: '60px' },
          { key: 'sessionId', label: '会话 ID', width: '120px', render: (r: any) => <span className="text-zinc-200 font-mono text-xs truncate max-w-[120px] inline-block">{r.sessionId ?? '-'}</span> },
          { key: 'modelId', label: '模型 ID', width: '100px', render: (r: any) => <span className="text-zinc-200 font-mono text-xs">{r.modelId ?? '-'}</span> },
          { key: 'interventionType', label: '干预类型', width: '100px', render: (r: any) => {
            const typeMap: Record<string, string> = { decision_diverge: '决策分歧', threshold_breach: '阈值突破', safety_override: '安全覆盖', manual: '手动' };
            return <span className="text-zinc-300 text-xs">{typeMap[r.interventionType] ?? r.interventionType ?? '-'}</span>;
          }},
          { key: 'divergenceScore', label: '分歧分', width: '80px', render: (r: any) => <span className="tabular-nums text-amber-400">{r.divergenceScore?.toFixed(3) ?? '-'}</span> },
          { key: 'isIntervention', label: '已干预', width: '60px', render: (r: any) => <span className={r.isIntervention ? 'text-red-400' : 'text-zinc-500'}>{r.isIntervention ? '是' : '否'}</span> },
          { key: 'createdAt', label: '时间', render: (r: any) => <span className="text-zinc-500 text-xs">{r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '-'}</span> },
        ]}
        emptyMessage="暂无干预事件"
      />

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
          <span className="text-xs text-zinc-500">共 {total} 条记录</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="border-zinc-700 text-zinc-400 h-7 text-xs">上一页</Button>
            <span className="text-xs text-zinc-400 px-2">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="border-zinc-700 text-zinc-400 h-7 text-xs">下一页</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── 领域健康状态（基于干预率推断） ─── */
function DomainHealthPanel() {
  const rate = trpc.evoEvolution.fsd.getInterventionRate.useQuery({ windowHours: 24 }, { refetchInterval: 30000 });
  const r = rate.data;
  if (!r) return null;

  const health = (r.rate ?? 0) < 0.01 ? 'healthy' : (r.rate ?? 0) < 0.05 ? 'warning' : 'critical';

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
      <SectionHeader title="领域健康状态" />
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-800/40 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-zinc-200">FSD</span>
            <StatusBadge status={health} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-zinc-500">干预率</span><br /><span className="text-zinc-300">{((r.rate ?? 0) * 100).toFixed(3)}%</span></div>
            <div><span className="text-zinc-500">总决策</span><br /><span className="text-zinc-300">{r.totalDecisions ?? 0}</span></div>
            <div><span className="text-zinc-500">趋势</span><br /><span className="text-zinc-300">{r.trend === 'improving' ? '↑ 改善' : r.trend === 'degrading' ? '↓ 恶化' : '→ 稳定'}</span></div>
            <div><span className="text-zinc-500">干预数</span><br /><span className="text-zinc-300">{r.interventionCount ?? 0}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── 主页面 ─── */
export default function DomainRouterConfig() {
  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">领域路由配置</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Domain Router · 干预率监控、领域健康与事件追踪</p>
      </div>

      <InterventionTrend />
      <DomainHealthPanel />
      <InterventionList />
    </div>
  );
}
