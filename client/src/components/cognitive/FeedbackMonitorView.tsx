/**
 * ============================================================================
 * Phase 2 — 知识反馈监控
 * ============================================================================
 * 反馈环统计、反馈事件列表、修订日志、回滚操作
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

// ============================================================================
// 常量
// ============================================================================

const eventTypeLabels: Record<string, { label: string; icon: string; color: string }> = {
  hypothesis_confirmed: { label: '假设确认', icon: '✅', color: 'bg-emerald-500/20 text-emerald-400' },
  hypothesis_rejected: { label: '假设否定', icon: '❌', color: 'bg-red-500/20 text-red-400' },
  new_causal_link: { label: '新因果关系', icon: '🔗', color: 'bg-blue-500/20 text-blue-400' },
  experience_recorded: { label: '经验记录', icon: '📝', color: 'bg-amber-500/20 text-amber-400' },
  physics_rule_updated: { label: '物理规则更新', icon: '🔬', color: 'bg-purple-500/20 text-purple-400' },
};

const componentLabels: Record<string, string> = {
  causal_edge: '因果边',
  experience_weight: '经验权重',
  physics_param: '物理参数',
  bpa_config: 'BPA 配置',
};

// ============================================================================
// 主组件
// ============================================================================

export function FeedbackMonitorView() {
  const [revisionFilter, setRevisionFilter] = useState<string>('');

  const feedbackQuery = trpc.evoCognition.reasoningEngine.getFeedbackStats.useQuery(undefined, { retry: 2, refetchInterval: 10000 });
  const revisionQuery = trpc.evoCognition.reasoningEngine.getRevisionLog.useQuery(
    { limit: 50, component: revisionFilter || undefined },
    { retry: 2 }
  );
  const rollbackMutation = trpc.evoCognition.reasoningEngine.rollbackRevision.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        revisionQuery.refetch();
        feedbackQuery.refetch();
        toast.success(`修订 ${data.revisionId} 已回滚`);
      } else {
        toast.error(data.error || '回滚失败');
      }
    },
    onError: (e) => toast.error(`回滚失败: ${e.message}`),
  });

  const feedback = feedbackQuery.data;
  const revisions = revisionQuery.data;

  if (feedbackQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-muted-foreground">加载反馈数据...</span>
      </div>
    );
  }

  if (!feedback) return <div className="text-center py-8 text-xs text-muted-foreground">无法加载反馈数据</div>;

  return (
    <div className="space-y-3">
      {/* 统计概览 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatCard value={feedback.totalEvents} label="总反馈事件" icon="📊" />
        <StatCard value={feedback.avgReward.toFixed(2)} label="平均奖励值" icon="🏆" />
        <StatCard value={feedback.revisionLogCount} label="修订记录" icon="📝" />
        <StatCard value={feedback.rolledBackCount} label="已回滚" icon="↩️" />
        <StatCard value={feedback.byType.hypothesis_confirmed} label="假设确认" icon="✅" />
      </div>

      {/* 反馈事件分布 */}
      <PageCard title="反馈事件分布" icon="📈">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Object.entries(feedback.byType).map(([type, count]) => {
            const info = eventTypeLabels[type];
            if (!info) return null;
            return (
              <div key={type} className="border border-border rounded-lg p-2 text-center">
                <div className="text-lg">{info.icon}</div>
                <div className="text-lg font-bold font-mono">{count as number}</div>
                <div className="text-[10px] text-muted-foreground">{info.label}</div>
              </div>
            );
          })}
        </div>
      </PageCard>

      {/* 最近反馈事件 */}
      <PageCard title="最近反馈事件" icon="🔔">
        <div className="space-y-1.5">
          {feedback.recentEvents.map((event: any, idx: number) => {
            const info = eventTypeLabels[event.type] || { label: event.type, icon: '❓', color: 'bg-muted text-muted-foreground' };
            return (
              <div key={idx} className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
                <Badge className={`text-[10px] shrink-0 ${info.color}`}>{info.icon} {info.label}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-xs">
                    {event.type === 'hypothesis_confirmed' && `假设 ${(event.data as any).hypothesisId} 被确认，置信度 ${(event.data as any).confidence}`}
                    {event.type === 'hypothesis_rejected' && `假设 ${(event.data as any).hypothesisId} 被否定：${(event.data as any).reason}`}
                    {event.type === 'new_causal_link' && `新因果关系：${(event.data as any).source} → ${(event.data as any).target}，权重 ${(event.data as any).weight}`}
                    {event.type === 'experience_recorded' && `新经验记录：${(event.data as any).experienceId}，域 ${(event.data as any).domain}`}
                    {event.type === 'physics_rule_updated' && `物理规则更新：${(event.data as any).equationId}.${(event.data as any).parameter} ${(event.data as any).oldValue} → ${(event.data as any).newValue}`}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                    <span>会话: {event.sessionId}</span>
                    <span>奖励: <span className={`font-mono ${event.reward > 0 ? 'text-emerald-400' : event.reward < 0 ? 'text-red-400' : ''}`}>{event.reward > 0 ? '+' : ''}{event.reward.toFixed(1)}</span></span>
                    <span>{new Date(event.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </PageCard>

      {/* 修订日志 */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold">修订日志</h3>
        <Select value={revisionFilter || 'all'} onValueChange={(v) => setRevisionFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[120px] h-7 text-xs"><SelectValue placeholder="组件筛选" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部组件</SelectItem>
            <SelectItem value="causal_edge">因果边</SelectItem>
            <SelectItem value="experience_weight">经验权重</SelectItem>
            <SelectItem value="physics_param">物理参数</SelectItem>
            <SelectItem value="bpa_config">BPA 配置</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <PageCard noPadding>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] py-1 w-[70px]">ID</TableHead>
              <TableHead className="text-[10px] py-1 w-[70px]">组件</TableHead>
              <TableHead className="text-[10px] py-1 w-[120px]">实体</TableHead>
              <TableHead className="text-[10px] py-1">修改前</TableHead>
              <TableHead className="text-[10px] py-1">修改后</TableHead>
              <TableHead className="text-[10px] py-1 w-[80px]">触发事件</TableHead>
              <TableHead className="text-[10px] py-1 w-[80px]">时间</TableHead>
              <TableHead className="text-[10px] py-1 w-[60px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(revisions ?? []).map((rev: any) => (
              <TableRow key={rev.id} className={rev.rolledBack ? 'opacity-50' : ''}>
                <TableCell className="text-[10px] font-mono py-1">{rev.id}</TableCell>
                <TableCell className="py-1">
                  <Badge variant="outline" className="text-[10px]">{componentLabels[rev.component] || rev.component}</Badge>
                </TableCell>
                <TableCell className="text-[10px] font-mono py-1">{rev.entityId}</TableCell>
                <TableCell className="text-[10px] font-mono py-1 text-muted-foreground">{JSON.stringify(rev.previousValue)}</TableCell>
                <TableCell className="text-[10px] font-mono py-1">{JSON.stringify(rev.newValue)}</TableCell>
                <TableCell className="py-1">
                  <Badge className={`text-[10px] ${eventTypeLabels[rev.feedbackEventType]?.color || ''}`}>
                    {eventTypeLabels[rev.feedbackEventType]?.label || rev.feedbackEventType}
                  </Badge>
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground py-1">{new Date(rev.timestamp).toLocaleString()}</TableCell>
                <TableCell className="py-1">
                  {rev.rolledBack ? (
                    <Badge variant="secondary" className="text-[10px]">已回滚</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px]"
                      onClick={() => rollbackMutation.mutate({ revisionId: rev.id })}
                      disabled={rollbackMutation.isPending}
                    >
                      回滚
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PageCard>
    </div>
  );
}
