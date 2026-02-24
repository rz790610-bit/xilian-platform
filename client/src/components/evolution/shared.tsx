/**
 * 进化引擎共享 UI 组件
 * StatusBadge / MetricCard / StageTimeline / ConfirmDialog / HealthCheckTable
 */
import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/* ─── StatusBadge ─── */
const statusStyles: Record<string, string> = {
  active:      'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  running:     'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  completed:   'bg-sky-500/15 text-sky-400 border-sky-500/30',
  pending:     'bg-amber-500/15 text-amber-400 border-amber-500/30',
  failed:      'bg-red-500/15 text-red-400 border-red-500/30',
  rolled_back: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  PROMOTE:     'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  REJECT:      'bg-red-500/15 text-red-400 border-red-500/30',
  PENDING:     'bg-amber-500/15 text-amber-400 border-amber-500/30',
  CANARY_EXTENDED: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  idle:        'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  discovering: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  evaluating:  'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  deploying:   'bg-teal-500/15 text-teal-400 border-teal-500/30',
  crystallizing:'bg-purple-500/15 text-purple-400 border-purple-500/30',
  healthy:     'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning:     'bg-amber-500/15 text-amber-400 border-amber-500/30',
  critical:    'bg-red-500/15 text-red-400 border-red-500/30',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const style = statusStyles[status] ?? 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded border', style, className)}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

/* ─── MetricCard ─── */
export function MetricCard({
  label, value, sub, trend, icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: 'up' | 'down' | 'stable';
  icon?: React.ReactNode;
}) {
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const trendColor = trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-zinc-500';
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-500 uppercase tracking-wider">{label}</span>
        {icon && <span className="text-zinc-600">{icon}</span>}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-semibold text-zinc-100 tabular-nums">{value}</span>
        {trend && <span className={cn('text-xs font-medium pb-0.5', trendColor)}>{trendIcon}</span>}
      </div>
      {sub && <span className="text-[11px] text-zinc-500">{sub}</span>}
    </div>
  );
}

/* ─── StageTimeline ─── */
export function StageTimeline({ stages }: {
  stages: Array<{ name: string; status: string; startedAt?: string | Date | null; completedAt?: string | Date | null }>;
}) {
  if (!stages.length) return <p className="text-xs text-zinc-500">暂无阶段数据</p>;
  return (
    <div className="flex items-start gap-0 overflow-x-auto pb-2">
      {stages.map((s, i) => {
        const isLast = i === stages.length - 1;
        const dotColor = s.status === 'completed' ? 'bg-emerald-400' :
          s.status === 'active' || s.status === 'running' ? 'bg-amber-400 animate-pulse' :
          s.status === 'rolled_back' ? 'bg-orange-400' :
          s.status === 'failed' ? 'bg-red-400' : 'bg-zinc-600';
        const startStr = s.startedAt ? new Date(s.startedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
        return (
          <div key={i} className="flex items-start shrink-0">
            <div className="flex flex-col items-center">
              <div className={cn('w-3 h-3 rounded-full border-2 border-zinc-800', dotColor)} />
              <div className="flex flex-col items-center mt-1.5">
                <span className="text-[10px] font-medium text-zinc-300 whitespace-nowrap">{s.name}</span>
                <StatusBadge status={s.status} className="mt-0.5 text-[9px] px-1.5" />
                {startStr && (
                  <span className="text-[9px] text-zinc-600 mt-0.5">{startStr}</span>
                )}
              </div>
            </div>
            {!isLast && (
              <div className="w-12 h-px bg-zinc-700 mt-1.5 mx-1" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── HealthCheckTable ─── */
/**
 * 后端 canaryHealthChecks schema:
 *   id, deploymentId, stageId, checkType (manual|threshold_breach|periodic),
 *   championMetrics (Record<string,number>), challengerMetrics (Record<string,number>),
 *   passed (number/tinyint), failureReason (string|null),
 *   consecutiveFails (number), checkedAt (Date)
 */
export function HealthCheckTable({ checks }: {
  checks: Array<Record<string, any>>;
}) {
  if (!checks.length) return <p className="text-xs text-zinc-500">暂无健康检查记录</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            <th className="text-left py-2 px-2 font-medium">时间</th>
            <th className="text-left py-2 px-2 font-medium">类型</th>
            <th className="text-left py-2 px-2 font-medium">状态</th>
            <th className="text-left py-2 px-2 font-medium">连续失败</th>
            <th className="text-left py-2 px-2 font-medium">失败原因</th>
          </tr>
        </thead>
        <tbody>
          {checks.slice(0, 20).map((c, i) => {
            const checkTypeMap: Record<string, string> = { periodic: '定期', manual: '手动', threshold_breach: '阈值突破' };
            return (
              <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="py-1.5 px-2 text-zinc-400">
                  {c.checkedAt ? new Date(c.checkedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                </td>
                <td className="py-1.5 px-2 text-zinc-300">{checkTypeMap[c.checkType] ?? c.checkType ?? '-'}</td>
                <td className="py-1.5 px-2">
                  <StatusBadge status={c.passed ? 'active' : 'failed'} />
                </td>
                <td className="py-1.5 px-2 text-zinc-300 tabular-nums">{c.consecutiveFails ?? 0}</td>
                <td className="py-1.5 px-2 text-zinc-400 truncate max-w-[200px]">{c.failureReason ?? '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── ConfirmDialog ─── */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, variant, onConfirm, requireReason,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'destructive' | 'default';
  onConfirm: (reason?: string) => void;
  requireReason?: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">{title}</DialogTitle>
          <DialogDescription className="text-zinc-400">{description}</DialogDescription>
        </DialogHeader>
        {requireReason && (
          <Textarea
            placeholder="请输入原因..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="bg-zinc-800 border-zinc-700 text-zinc-200 text-sm"
          />
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-700 text-zinc-300">
            取消
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={() => { onConfirm(reason); onOpenChange(false); setReason(''); }}
            disabled={requireReason && !reason.trim()}
          >
            {confirmLabel ?? '确认'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── EmptyState ─── */
export function EmptyState({ message, icon }: { message: string; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
      <span className="text-3xl mb-3">{icon ?? '📭'}</span>
      <span className="text-sm">{message}</span>
    </div>
  );
}

/* ─── SectionHeader ─── */
export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-semibold text-zinc-200">{title}</h2>
      {action}
    </div>
  );
}

/* ─── DataTable (lightweight) ─── */
export function DataTable<T extends Record<string, any>>({
  data, columns, onRowClick, emptyMessage,
}: {
  data: T[];
  columns: Array<{ key: string; label: string; render?: (row: T) => React.ReactNode; width?: string }>;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}) {
  if (!data.length) return <EmptyState message={emptyMessage ?? '暂无数据'} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            {columns.map(c => (
              <th key={c.key} className="text-left py-2.5 px-3 font-medium text-[11px] uppercase tracking-wider" style={c.width ? { width: c.width } : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              className={cn('border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors', onRowClick && 'cursor-pointer')}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map(c => (
                <td key={c.key} className="py-2.5 px-3 text-zinc-300">
                  {c.render ? c.render(row) : String(row[c.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
