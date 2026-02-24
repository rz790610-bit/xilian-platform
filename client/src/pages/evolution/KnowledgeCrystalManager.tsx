/**
 * 知识结晶管理器
 * 对接 API: evoEvolution.crystal.*
 *
 * 后端 crystalRouter 端点:
 *   - list: { minConfidence? } → { crystals[], total }
 *   - get: { id } → { crystal }
 *   - verify: { id } → { crystal } (更新 verificationCount 和 lastVerifiedAt)
 *
 * 后端 knowledgeCrystals schema:
 *   id, pattern(text), confidence(double), sourceSessionIds(json string[]),
 *   applicableConditions(json string[]), kgNodeId(varchar), version(varchar),
 *   verificationCount(int), lastVerifiedAt(timestamp),
 *   type: enum['pattern','threshold_update','causal_link','anomaly_signature'],
 *   status: enum['draft','pending_review','approved','rejected','deprecated'],
 *   sourceType: enum['cognition','evolution','manual','guardrail'],
 *   createdBy(varchar), applicationCount(int), negativeFeedbackRate(double),
 *   reviewComment(text), contentHash(varchar), createdAt, updatedAt
 */
import React, { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge, MetricCard, SectionHeader, DataTable, EmptyState } from '@/components/evolution';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis,
} from 'recharts';

/* ─── 类型映射 ─── */
const crystalTypeMap: Record<string, { label: string; icon: string; color: string }> = {
  pattern:           { label: '模式识别', icon: '🔍', color: '#3b82f6' },
  threshold_update:  { label: '阈值更新', icon: '📊', color: '#f59e0b' },
  causal_link:       { label: '因果链接', icon: '🔗', color: '#8b5cf6' },
  anomaly_signature: { label: '异常签名', icon: '⚡', color: '#ef4444' },
};

const statusMap: Record<string, { label: string; color: string }> = {
  draft:          { label: '草稿', color: '#6b7280' },
  pending_review: { label: '待审核', color: '#f59e0b' },
  approved:       { label: '已批准', color: '#22c55e' },
  rejected:       { label: '已拒绝', color: '#ef4444' },
  deprecated:     { label: '已废弃', color: '#9ca3af' },
};

const sourceTypeMap: Record<string, { label: string; icon: string }> = {
  cognition:  { label: '认知引擎', icon: '🧠' },
  evolution:  { label: '进化引擎', icon: '🧬' },
  manual:     { label: '人工创建', icon: '✍️' },
  guardrail:  { label: '护栏系统', icon: '🛡️' },
};

/* ─── 结晶详情对话框 ─── */
function CrystalDetailDialog({ id, open, onOpenChange }: { id: number; open: boolean; onOpenChange: (v: boolean) => void }) {
  const detail = trpc.evoEvolution.crystal.get.useQuery({ id }, { enabled: open });
  const utils = trpc.useUtils();
  const verifyMutation = trpc.evoEvolution.crystal.verify.useMutation({
    onSuccess: () => {
      utils.evoEvolution.crystal.get.invalidate({ id });
      utils.evoEvolution.crystal.list.invalidate();
    },
  });

  const c = detail.data?.crystal;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">知识结晶详情 #{id}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {c ? `${crystalTypeMap[c.type]?.icon ?? ''} ${crystalTypeMap[c.type]?.label ?? c.type} · v${c.version}` : '加载中...'}
          </DialogDescription>
        </DialogHeader>
        {c ? (
          <div className="space-y-4">
            {/* 状态与操作 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusBadge status={c.status} />
                <span className="text-xs text-zinc-500">v{c.version}</span>
                {c.kgNodeId && (
                  <span className="text-[10px] text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">
                    KG: {c.kgNodeId}
                  </span>
                )}
              </div>
              <Button
                size="sm"
                onClick={() => verifyMutation.mutate({ id, verified: true })}
                disabled={verifyMutation.isPending}
              >
                {verifyMutation.isPending ? '验证中...' : `✓ 验证 (${c.verificationCount})`}
              </Button>
            </div>

            {/* 核心指标 */}
            <div className="grid grid-cols-4 gap-3">
              <MetricCard label="置信度" value={`${(c.confidence * 100).toFixed(1)}%`} />
              <MetricCard label="验证次数" value={c.verificationCount} />
              <MetricCard label="应用次数" value={c.applicationCount} />
              <MetricCard label="负反馈率" value={`${(c.negativeFeedbackRate * 100).toFixed(1)}%`} />
            </div>

            {/* Pattern 内容 */}
            <div className="bg-zinc-800/40 rounded-lg p-4">
              <h4 className="text-xs font-medium text-zinc-400 mb-2">📝 模式内容</h4>
              <div className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                {c.pattern}
              </div>
            </div>

            {/* 来源信息 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-800/40 rounded-lg p-4">
                <h4 className="text-xs font-medium text-zinc-400 mb-2">来源类型</h4>
                <span className="text-sm text-zinc-200">
                  {sourceTypeMap[c.sourceType]?.icon ?? ''} {sourceTypeMap[c.sourceType]?.label ?? c.sourceType}
                </span>
                {c.createdBy && (
                  <p className="text-xs text-zinc-500 mt-1">创建者: {c.createdBy}</p>
                )}
              </div>
              <div className="bg-zinc-800/40 rounded-lg p-4">
                <h4 className="text-xs font-medium text-zinc-400 mb-2">时间信息</h4>
                <p className="text-xs text-zinc-300">创建: {c.createdAt ? new Date(c.createdAt).toLocaleString('zh-CN') : '-'}</p>
                <p className="text-xs text-zinc-300 mt-0.5">更新: {c.updatedAt ? new Date(c.updatedAt).toLocaleString('zh-CN') : '-'}</p>
                <p className="text-xs text-zinc-300 mt-0.5">最后验证: {c.lastVerifiedAt ? new Date(c.lastVerifiedAt).toLocaleString('zh-CN') : '从未'}</p>
              </div>
            </div>

            {/* 来源会话 */}
            {c.sourceSessionIds && Array.isArray(c.sourceSessionIds) && c.sourceSessionIds.length > 0 && (
              <div className="bg-zinc-800/40 rounded-lg p-4">
                <h4 className="text-xs font-medium text-zinc-400 mb-2">来源会话 ({c.sourceSessionIds.length})</h4>
                <div className="flex gap-1.5 flex-wrap">
                  {c.sourceSessionIds.slice(0, 20).map((sid: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 bg-zinc-700/60 text-zinc-300 text-[10px] rounded font-mono">
                      {sid.slice(0, 12)}...
                    </span>
                  ))}
                  {c.sourceSessionIds.length > 20 && (
                    <span className="text-[10px] text-zinc-500">+{c.sourceSessionIds.length - 20} 更多</span>
                  )}
                </div>
              </div>
            )}

            {/* 适用工况 */}
            {c.applicableConditions && Array.isArray(c.applicableConditions) && c.applicableConditions.length > 0 && (
              <div className="bg-zinc-800/40 rounded-lg p-4">
                <h4 className="text-xs font-medium text-zinc-400 mb-2">适用工况</h4>
                <div className="flex gap-1.5 flex-wrap">
                  {c.applicableConditions.map((cond: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 text-[10px] rounded border border-indigo-500/20">
                      {cond}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 审核意见 */}
            {c.reviewComment && (
              <div className="bg-zinc-800/40 rounded-lg p-4 border-l-2 border-amber-500/50">
                <h4 className="text-xs font-medium text-amber-400 mb-2">审核意见</h4>
                <p className="text-sm text-zinc-300">{c.reviewComment}</p>
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

/* ─── 统计分析面板 ─── */
function CrystalAnalytics({ crystals }: { crystals: any[] }) {
  // 类型分布
  const typeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    crystals.forEach((c: any) => {
      const t = c.type ?? 'pattern';
      counts[t] = (counts[t] ?? 0) + 1;
    });
    return Object.entries(counts).map(([type, count]) => ({
      name: crystalTypeMap[type]?.label ?? type,
      value: count,
      fill: crystalTypeMap[type]?.color ?? '#6b7280',
    }));
  }, [crystals]);

  // 状态分布
  const statusDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    crystals.forEach((c: any) => {
      const s = c.status ?? 'draft';
      counts[s] = (counts[s] ?? 0) + 1;
    });
    return Object.entries(counts).map(([status, count]) => ({
      name: statusMap[status]?.label ?? status,
      value: count,
      fill: statusMap[status]?.color ?? '#6b7280',
    }));
  }, [crystals]);

  // 来源分布
  const sourceDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    crystals.forEach((c: any) => {
      const s = c.sourceType ?? 'cognition';
      counts[s] = (counts[s] ?? 0) + 1;
    });
    return Object.entries(counts).map(([source, count]) => ({
      name: sourceTypeMap[source]?.label ?? source,
      value: count,
      fill: source === 'cognition' ? '#3b82f6' : source === 'evolution' ? '#8b5cf6' : source === 'manual' ? '#22c55e' : '#f59e0b',
    }));
  }, [crystals]);

  // 置信度 vs 验证次数散点图数据
  const scatterData = useMemo(() => {
    return crystals.slice(0, 100).map((c: any) => ({
      x: c.confidence ?? 0,
      y: c.verificationCount ?? 0,
      z: c.applicationCount ?? 1,
      name: `#${c.id}`,
    }));
  }, [crystals]);

  if (crystals.length === 0) return <EmptyState message="暂无数据可供分析" icon="📊" />;

  return (
    <div className="space-y-4">
      {/* 概览指标 */}
      <div className="grid grid-cols-5 gap-3">
        <MetricCard label="总结晶数" value={crystals.length} />
        <MetricCard label="已批准" value={crystals.filter((c: any) => c.status === 'approved').length} />
        <MetricCard label="待审核" value={crystals.filter((c: any) => c.status === 'pending_review').length} />
        <MetricCard label="平均置信度" value={crystals.length > 0
          ? `${((crystals.reduce((acc: number, c: any) => acc + (c.confidence ?? 0), 0) / crystals.length) * 100).toFixed(1)}%`
          : '-'
        } />
        <MetricCard label="总应用次数" value={crystals.reduce((acc: number, c: any) => acc + (c.applicationCount ?? 0), 0)} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* 类型分布 */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
          <h4 className="text-xs font-medium text-zinc-400 mb-3">结晶类型分布</h4>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={typeDistribution} cx="50%" cy="50%" innerRadius={35} outerRadius={70} dataKey="value" stroke="none">
                  {typeDistribution.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }} itemStyle={{ color: '#e4e4e7' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-1.5 mt-2">
            {typeDistribution.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.fill }} />
                <span className="text-[11px] text-zinc-300">{d.name}</span>
                <span className="text-[11px] text-zinc-500 tabular-nums ml-auto">{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 状态分布 */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
          <h4 className="text-xs font-medium text-zinc-400 mb-3">生命周期状态</h4>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis type="number" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 10 }} width={60} />
                <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }} itemStyle={{ color: '#e4e4e7' }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {statusDistribution.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 来源分布 */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
          <h4 className="text-xs font-medium text-zinc-400 mb-3">来源分布</h4>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sourceDistribution} cx="50%" cy="50%" innerRadius={35} outerRadius={70} dataKey="value" stroke="none">
                  {sourceDistribution.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }} itemStyle={{ color: '#e4e4e7' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-1.5 mt-2">
            {sourceDistribution.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.fill }} />
                <span className="text-[11px] text-zinc-300">{d.name}</span>
                <span className="text-[11px] text-zinc-500 tabular-nums ml-auto">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 置信度 vs 验证次数散点图 */}
      {scatterData.length > 0 && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
          <h4 className="text-xs font-medium text-zinc-400 mb-3">置信度 vs 验证次数（气泡大小 = 应用次数）</h4>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis type="number" dataKey="x" name="置信度" tick={{ fill: '#a1a1aa', fontSize: 10 }} domain={[0, 1]} />
                <YAxis type="number" dataKey="y" name="验证次数" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                <ZAxis type="number" dataKey="z" range={[20, 400]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                  itemStyle={{ color: '#e4e4e7' }}
                  formatter={(value: any, name: string) => {
                    if (name === '置信度') return [`${(value * 100).toFixed(1)}%`, name];
                    return [value, name];
                  }}
                />
                <Scatter data={scatterData} fill="#6366f1" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── 主页面 ─── */
export default function KnowledgeCrystalManager() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [minConfidence, setMinConfidence] = useState<number | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');

  const listQuery = trpc.evoEvolution.crystal.list.useQuery(
    { minConfidence },
    { refetchInterval: 15000 }
  );

  const allCrystals = listQuery.data?.crystals ?? [];
  const total = listQuery.data?.total ?? 0;

  // 前端过滤
  const filteredCrystals = useMemo(() => {
    let result = allCrystals;
    if (typeFilter !== 'all') {
      result = result.filter((c: any) => c.type === typeFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter((c: any) => c.status === statusFilter);
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter((c: any) =>
        (c.pattern && c.pattern.toLowerCase().includes(q)) ||
        (c.kgNodeId && c.kgNodeId.toLowerCase().includes(q)) ||
        (c.createdBy && c.createdBy.toLowerCase().includes(q))
      );
    }
    return result;
  }, [allCrystals, typeFilter, statusFilter, searchText]);

  return (
    <MainLayout title="知识结晶">
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">知识结晶管理</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Knowledge Crystal · 模式提炼、因果发现与知识图谱结晶</p>
      </div>

      {/* 标签页 */}
      <Tabs defaultValue="list" className="w-full">
        <TabsList className="bg-zinc-800/60 border border-zinc-700">
          <TabsTrigger value="list" className="text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100">
            结晶列表
          </TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100">
            统计分析
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <div className="space-y-4">
            {/* 过滤器 */}
            <div className="flex items-center gap-3 flex-wrap">
              <Input
                placeholder="搜索模式内容、KG 节点、创建者..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-64 bg-zinc-800 border-zinc-700 text-zinc-200 text-xs h-8"
              />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-32 bg-zinc-800 border-zinc-700 text-zinc-200 text-xs h-8">
                  <SelectValue placeholder="全部类型" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="pattern">模式识别</SelectItem>
                  <SelectItem value="threshold_update">阈值更新</SelectItem>
                  <SelectItem value="causal_link">因果链接</SelectItem>
                  <SelectItem value="anomaly_signature">异常签名</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32 bg-zinc-800 border-zinc-700 text-zinc-200 text-xs h-8">
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="pending_review">待审核</SelectItem>
                  <SelectItem value="approved">已批准</SelectItem>
                  <SelectItem value="rejected">已拒绝</SelectItem>
                  <SelectItem value="deprecated">已废弃</SelectItem>
                </SelectContent>
              </Select>
              <Select value={minConfidence !== undefined ? String(minConfidence) : 'none'} onValueChange={(v) => setMinConfidence(v === 'none' ? undefined : Number(v))}>
                <SelectTrigger className="w-36 bg-zinc-800 border-zinc-700 text-zinc-200 text-xs h-8">
                  <SelectValue placeholder="最低置信度" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="none">不限置信度</SelectItem>
                  <SelectItem value="0.5">≥ 50%</SelectItem>
                  <SelectItem value="0.7">≥ 70%</SelectItem>
                  <SelectItem value="0.8">≥ 80%</SelectItem>
                  <SelectItem value="0.9">≥ 90%</SelectItem>
                  <SelectItem value="0.95">≥ 95%</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-zinc-500 ml-auto">
                显示 {filteredCrystals.length} / {total} 条
              </span>
            </div>

            {/* 概览指标 */}
            <div className="grid grid-cols-5 gap-3">
              <MetricCard label="总结晶数" value={total} />
              <MetricCard label="已批准" value={allCrystals.filter((c: any) => c.status === 'approved').length} icon={<span className="text-emerald-400">✓</span>} />
              <MetricCard label="待审核" value={allCrystals.filter((c: any) => c.status === 'pending_review').length} icon={<span className="text-amber-400">⏳</span>} />
              <MetricCard label="有 KG 节点" value={allCrystals.filter((c: any) => c.kgNodeId).length} icon={<span className="text-indigo-400">🔗</span>} />
              <MetricCard label="平均置信度" value={allCrystals.length > 0
                ? `${((allCrystals.reduce((acc: number, c: any) => acc + (c.confidence ?? 0), 0) / allCrystals.length) * 100).toFixed(1)}%`
                : '-'
              } />
            </div>

            {/* 结晶列表 */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
              <SectionHeader title="知识结晶" />
              <DataTable
                data={filteredCrystals}
                onRowClick={(row: any) => setSelectedId(row.id)}
                columns={[
                  { key: 'id', label: 'ID', width: '50px' },
                  { key: 'type', label: '类型', width: '100px', render: (r: any) => {
                    const t = crystalTypeMap[r.type];
                    return (
                      <span className="text-xs font-medium" style={{ color: t?.color ?? '#9ca3af' }}>
                        {t?.icon ?? ''} {t?.label ?? r.type}
                      </span>
                    );
                  }},
                  { key: 'pattern', label: '模式内容', render: (r: any) => (
                    <span className="text-zinc-200 text-xs line-clamp-2 max-w-[300px]">{r.pattern}</span>
                  )},
                  { key: 'confidence', label: '置信度', width: '80px', render: (r: any) => {
                    const conf = r.confidence ?? 0;
                    const color = conf >= 0.9 ? 'text-emerald-400' : conf >= 0.7 ? 'text-amber-400' : 'text-red-400';
                    return <span className={`text-xs tabular-nums font-medium ${color}`}>{(conf * 100).toFixed(1)}%</span>;
                  }},
                  { key: 'status', label: '状态', width: '80px', render: (r: any) => <StatusBadge status={r.status ?? 'draft'} /> },
                  { key: 'sourceType', label: '来源', width: '90px', render: (r: any) => {
                    const s = sourceTypeMap[r.sourceType];
                    return <span className="text-xs text-zinc-400">{s?.icon ?? ''} {s?.label ?? r.sourceType}</span>;
                  }},
                  { key: 'verificationCount', label: '验证', width: '60px', render: (r: any) => (
                    <span className="text-xs tabular-nums text-zinc-300">{r.verificationCount ?? 0}</span>
                  )},
                  { key: 'applicationCount', label: '应用', width: '60px', render: (r: any) => (
                    <span className="text-xs tabular-nums text-zinc-300">{r.applicationCount ?? 0}</span>
                  )},
                  { key: 'kgNodeId', label: 'KG', width: '50px', render: (r: any) => (
                    r.kgNodeId ? <span className="text-indigo-400 text-[10px]">✓</span> : <span className="text-zinc-600">-</span>
                  )},
                  { key: 'createdAt', label: '创建时间', render: (r: any) => (
                    <span className="text-zinc-500 text-xs">{r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '-'}</span>
                  )},
                ]}
                emptyMessage="暂无知识结晶"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <CrystalAnalytics crystals={allCrystals} />
        </TabsContent>
      </Tabs>

      {/* 详情对话框 */}
      {selectedId && (
        <CrystalDetailDialog id={selectedId} open={!!selectedId} onOpenChange={(v) => { if (!v) setSelectedId(null); }} />
      )}
    </div>
    </MainLayout>
  );
}
