/**
 * ============================================================================
 * 质量看板 — Quality Dashboard
 * ============================================================================
 *
 * 5 个面板:
 *   1. FIX 修复进度（环形图 + 严重度柱状图）
 *   2. 代码健康趋势（折线图: TS 错误 / 测试数 / any 数）
 *   3. 流程状态矩阵（14 条流程热力图）
 *   4. 算法健康（评级分布饼图）
 *   5. 技术债务雷达图（6 维）
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

// ============================================================================
// 类型
// ============================================================================

type TabId = 'fix' | 'health' | 'flow' | 'algorithm' | 'debt';

interface SeverityStats { total: number; fixed: number }
interface TrendRow { date: string; tsErrors: number; testsPassed: number; anyCount: number }
interface FlowNode { name: string; status: string }
interface Flow { id: number; name: string; nodes: FlowNode[] }
interface DebtDimension { name: string; current: number; target: number; max: number }

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'fix', label: 'FIX 修复进度', icon: '🎯' },
  { id: 'health', label: '代码健康', icon: '💚' },
  { id: 'flow', label: '流程状态', icon: '🔄' },
  { id: 'algorithm', label: '算法健康', icon: '🧮' },
  { id: 'debt', label: '技术债务', icon: '📐' },
];

// ============================================================================
// 主组件
// ============================================================================

export default function QualityDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('fix');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">质量看板</h1>
        <span className="text-sm text-muted-foreground">
          数据来源: pnpm quality:full | 143 个 FIX 追踪
        </span>
      </div>

      {/* Tab 导航 */}
      <div className="flex gap-2 border-b pb-2">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* 面板内容 */}
      {activeTab === 'fix' && <FixProgressPanel />}
      {activeTab === 'health' && <CodeHealthPanel />}
      {activeTab === 'flow' && <FlowStatusPanel />}
      {activeTab === 'algorithm' && <AlgorithmHealthPanel />}
      {activeTab === 'debt' && <TechDebtPanel />}
    </div>
  );
}

// ============================================================================
// 面板 1: FIX 修复进度
// ============================================================================

function FixProgressPanel() {
  const { data, isLoading } = trpc.quality.getFixProgress.useQuery();

  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState />;

  const fixedPct = data.total > 0 ? ((data.fixed / data.total) * 100).toFixed(1) : '0';
  const partialPct = data.total > 0 ? ((data.partial / data.total) * 100).toFixed(1) : '0';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 环形进度 */}
      <div className="border rounded-lg p-6">
        <h3 className="font-semibold mb-4">修复进度总览</h3>
        <div className="flex items-center gap-8">
          <div className="relative w-40 h-40">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="40" fill="none" stroke="#22c55e" strokeWidth="8"
                strokeDasharray={`${(data.fixed / data.total) * 251.3} 251.3`}
                strokeLinecap="round"
              />
              <circle
                cx="50" cy="50" r="40" fill="none" stroke="#f59e0b" strokeWidth="8"
                strokeDasharray={`${(data.partial / data.total) * 251.3} 251.3`}
                strokeDashoffset={`${-(data.fixed / data.total) * 251.3}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl font-bold">{fixedPct}%</div>
                <div className="text-xs text-muted-foreground">已修复</div>
              </div>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500" />
              已修复: {data.fixed}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500" />
              部分完成: {data.partial} ({partialPct}%)
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-gray-300" />
              待修复: {data.open}
            </div>
            <div className="font-semibold mt-2">总计: {data.total}</div>
          </div>
        </div>
      </div>

      {/* 严重度分组 */}
      <div className="border rounded-lg p-6">
        <h3 className="font-semibold mb-4">按严重度分布</h3>
        <div className="space-y-3">
          {(Object.entries(data.bySeverity) as [string, SeverityStats][]).map(([severity, stats]) => {
            const pct = stats.total > 0 ? (stats.fixed / stats.total) * 100 : 0;
            const colors: Record<string, string> = {
              '致命': 'bg-red-500',
              '严重': 'bg-orange-500',
              '中等': 'bg-yellow-500',
              '低': 'bg-blue-400',
            };
            return (
              <div key={severity}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{severity} ({stats.total})</span>
                  <span>{stats.fixed}/{stats.total} ({pct.toFixed(0)}%)</span>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${colors[severity] || 'bg-gray-500'} rounded-full transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 今日完成列表 */}
      <div className="border rounded-lg p-6 lg:col-span-2">
        <h3 className="font-semibold mb-4">已修复项目</h3>
        {data.todayFixed.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {data.todayFixed.map((id: string) => (
              <span key={id} className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">
                {id}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">运行 pnpm fix:status 更新数据</p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 面板 2: 代码健康趋势
// ============================================================================

function CodeHealthPanel() {
  const { data, isLoading } = trpc.quality.getCodeHealth.useQuery();

  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <MetricCard
        title="TS 编译错误"
        value={data.current.tsErrors}
        target={0}
        status={data.current.tsErrors === 0 ? 'good' : 'bad'}
      />
      <MetricCard
        title="any 类型数"
        value={data.current.anyCount}
        target={data.current.anyBaseline}
        status={data.current.anyCount <= data.current.anyBaseline ? 'good' : 'bad'}
      />
      <MetricCard
        title="any 基线"
        value={data.current.anyBaseline}
        target={0}
        status="neutral"
      />

      {/* 趋势图 */}
      {data.trend.length > 0 && (
        <div className="border rounded-lg p-6 lg:col-span-3">
          <h3 className="font-semibold mb-4">14 天趋势</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">日期</th>
                  <th className="text-right py-2">TS 错误</th>
                  <th className="text-right py-2">测试通过</th>
                  <th className="text-right py-2">any 数量</th>
                </tr>
              </thead>
              <tbody>
                {(data.trend as TrendRow[]).map((row: TrendRow) => (
                  <tr key={row.date} className="border-b">
                    <td className="py-2">{row.date}</td>
                    <td className="text-right">{row.tsErrors}</td>
                    <td className="text-right">{row.testsPassed}</td>
                    <td className="text-right">{row.anyCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.trend.length === 0 && (
            <p className="text-muted-foreground text-sm">运行 pnpm report:daily 开始记录趋势数据</p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 面板 3: 流程状态矩阵
// ============================================================================

function FlowStatusPanel() {
  const { data, isLoading } = trpc.quality.getFlowStatus.useQuery();
  const [expandedFlow, setExpandedFlow] = useState<number | null>(null);

  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState />;

  const statusColor = (s: string) =>
    s === 'pass' ? 'bg-green-500' : s === 'partial' ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="space-y-6">
      {/* 汇总 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{data.summary.passable}</div>
          <div className="text-sm text-muted-foreground">完全通过</div>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-yellow-600">{data.summary.partial}</div>
          <div className="text-sm text-muted-foreground">部分通过</div>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-600">{data.summary.broken}</div>
          <div className="text-sm text-muted-foreground">断裂</div>
        </div>
      </div>

      {/* 热力图 */}
      <div className="border rounded-lg p-6">
        <h3 className="font-semibold mb-4">14 条核心流程状态</h3>
        <div className="space-y-2">
          {(data.flows as Flow[]).map((flow: Flow) => {
            const passRate = flow.nodes.filter((n: FlowNode) => n.status === 'pass').length / flow.nodes.length;
            return (
              <div key={flow.id}>
                <button
                  onClick={() => setExpandedFlow(expandedFlow === flow.id ? null : flow.id)}
                  className="w-full flex items-center gap-3 py-2 hover:bg-muted rounded px-2 transition-colors"
                >
                  <span className="w-6 text-xs text-muted-foreground">{flow.id}.</span>
                  <span className="flex-1 text-left text-sm">{flow.name}</span>
                  <div className="flex gap-1">
                    {flow.nodes.map((node: FlowNode, i: number) => (
                      <div
                        key={i}
                        className={`w-4 h-4 rounded ${statusColor(node.status)}`}
                        title={`${node.name}: ${node.status}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    {(passRate * 100).toFixed(0)}%
                  </span>
                </button>
                {expandedFlow === flow.id && (
                  <div className="ml-10 mb-2 p-3 bg-muted rounded text-sm">
                    {flow.nodes.map((node: FlowNode, i: number) => (
                      <div key={i} className="flex items-center gap-2 py-1">
                        <span className={`w-2 h-2 rounded-full ${statusColor(node.status)}`} />
                        <span>{node.name}</span>
                        <span className="text-muted-foreground">
                          ({node.status === 'pass' ? '通过' : node.status === 'partial' ? '部分' : '断裂'})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 面板 4: 算法健康
// ============================================================================

function AlgorithmHealthPanel() {
  const { data, isLoading } = trpc.quality.getAlgorithmHealth.useQuery();

  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState />;

  const gradeColors: Record<string, string> = {
    A: 'bg-green-500',
    B: 'bg-blue-500',
    C: 'bg-yellow-500',
    D: 'bg-red-500',
  };

  const total = data.totalAlgorithms || 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 评级分布 */}
      <div className="border rounded-lg p-6">
        <h3 className="font-semibold mb-4">评级分布 ({data.totalAlgorithms} 个算法)</h3>
        <div className="space-y-3">
          {(Object.entries(data.totals) as [string, number][]).map(([grade, count]) => (
            <div key={grade}>
              <div className="flex justify-between text-sm mb-1">
                <span>等级 {grade}</span>
                <span>{count} ({((count / total) * 100).toFixed(0)}%)</span>
              </div>
              <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${gradeColors[grade]} rounded-full`}
                  style={{ width: `${(count / total) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-muted-foreground">
          A = 有测试+无硬编码 | B = 有测试 | C = 有实现 | D = 仅定义
        </div>
      </div>

      {/* 按分类 */}
      <div className="border rounded-lg p-6">
        <h3 className="font-semibold mb-4">按分类</h3>
        <div className="space-y-2">
          {(Object.entries(data.categories) as [string, { total: number; grades: Record<string, number> }][]).map(([cat, catInfo]) => (
            <div key={cat} className="flex items-center justify-between py-2 border-b">
              <span className="text-sm font-medium">{cat}</span>
              <div className="flex items-center gap-2 text-xs">
                {(Object.entries(catInfo.grades) as [string, number][]).map(([g, c]) => (
                  c > 0 && (
                    <span key={g} className={`px-1.5 py-0.5 rounded text-white ${gradeColors[g]}`}>
                      {g}:{c}
                    </span>
                  )
                ))}
                <span className="text-muted-foreground">({catInfo.total})</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 面板 5: 技术债务雷达
// ============================================================================

function TechDebtPanel() {
  const { data, isLoading } = trpc.quality.getTechDebt.useQuery();

  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState />;

  return (
    <div className="border rounded-lg p-6">
      <h3 className="font-semibold mb-4">技术债务 6 维雷达</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(data.dimensions as DebtDimension[]).map((dim: DebtDimension) => {
          const pct = Math.min((dim.current / dim.max) * 100, 100);
          const targetPct = (dim.target / dim.max) * 100;
          const isGood = dim.current <= dim.target;
          return (
            <div key={dim.name} className="border rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-sm">{dim.name}</span>
                <span className={`text-sm font-bold ${isGood ? 'text-green-600' : 'text-red-600'}`}>
                  {dim.current}
                </span>
              </div>
              <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isGood ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: `${pct}%` }}
                />
                {/* 目标线 */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-blue-600"
                  style={{ left: `${targetPct}%` }}
                  title={`目标: ${dim.target}`}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>目标: {dim.target}</span>
                <span>上限: {dim.max}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 通用组件
// ============================================================================

function MetricCard({ title, value, target, status }: {
  title: string;
  value: number;
  target: number;
  status: 'good' | 'bad' | 'neutral';
}) {
  const colors = {
    good: 'border-green-200 bg-green-50',
    bad: 'border-red-200 bg-red-50',
    neutral: 'border-gray-200',
  };
  return (
    <div className={`border rounded-lg p-4 ${colors[status]}`}>
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="text-2xl font-bold mt-1">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground mt-1">目标: {target}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-muted-foreground">加载中...</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center text-muted-foreground">
        <p>暂无数据</p>
        <p className="text-sm mt-2">运行 <code className="bg-muted px-1 rounded">pnpm quality:full</code> 生成数据</p>
      </div>
    </div>
  );
}
