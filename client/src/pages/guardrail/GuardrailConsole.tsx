/**
 * ============================================================================
 * 护栏控制台 — GuardrailConsole
 * ============================================================================
 *
 * 护栏规则管理 + 告警历史 + 护栏统计 + 规则启停
 * 通过 tRPC 接入后端 evoGuardrail 域路由
 */

import { useState, useCallback, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { trpc } from '@/lib/trpc';

// ============================================================================
// 类型
// ============================================================================

interface GuardrailRule {
  id: string;
  name: string;
  category: 'safety' | 'health' | 'efficiency';
  enabled: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  conditionSummary: string;
  triggerCount: number;
  lastTriggeredAt: string | null;
  cooldownMs: number;
}

interface AlertHistory {
  id: string;
  ruleId: string;
  ruleName: string;
  category: 'safety' | 'health' | 'efficiency';
  severity: 'critical' | 'high' | 'medium' | 'low';
  equipmentId: string;
  message: string;
  action: string;
  acknowledged: boolean;
  createdAt: string;
  acknowledgedAt: string | null;
}

// ============================================================================
// 子组件
// ============================================================================

function LoadingSpinner({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-12 gap-3">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-muted-foreground">{text}</span>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-center justify-between">
      <span className="text-sm text-destructive">{message}</span>
      {onRetry && (
        <button className="text-xs px-3 py-1 bg-destructive text-destructive-foreground rounded" onClick={onRetry}>重试</button>
      )}
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export default function GuardrailConsole() {
  const [activeTab, setActiveTab] = useState<'rules' | 'history' | 'stats'>('rules');
  const [filterCategory, setFilterCategory] = useState<'all' | 'safety' | 'health' | 'efficiency'>('all');

  // ---- tRPC 数据查询 ----
  const rulesQuery = trpc.evoGuardrail.listRules.useQuery(undefined, { retry: 2 });
  const historyQuery = trpc.evoGuardrail.listAlertHistory.useQuery(
    { limit: 100 },
    { retry: 2, enabled: activeTab === 'history' || activeTab === 'stats' }
  );

  const toggleRuleMutation = trpc.evoGuardrail.toggleRule.useMutation({
    onSuccess: () => rulesQuery.refetch(),
  });

  const acknowledgeMutation = trpc.evoGuardrail.acknowledgeAlert.useMutation({
    onSuccess: () => historyQuery.refetch(),
  });

  // ---- 数据解构 ----
  const rules: GuardrailRule[] = (rulesQuery.data as GuardrailRule[]) ?? [];
  const history: AlertHistory[] = (historyQuery.data as AlertHistory[]) ?? [];

  const toggleRule = useCallback((ruleId: string) => {
    const rule = rules.find(r => r.id === ruleId);
    if (rule) {
      toggleRuleMutation.mutate({ ruleId, enabled: !rule.enabled });
    }
  }, [rules, toggleRuleMutation]);

  const acknowledgeAlert = useCallback((alertId: string) => {
    acknowledgeMutation.mutate({ alertId });
  }, [acknowledgeMutation]);

  const filteredRules = filterCategory === 'all' ? rules : rules.filter(r => r.category === filterCategory);
  const filteredHistory = filterCategory === 'all' ? history : history.filter(h => h.category === filterCategory);

  const categoryLabels: Record<string, string> = { safety: '安全', health: '健康', efficiency: '高效' };
  const severityColors: Record<string, string> = { critical: 'bg-red-500 text-white', high: 'bg-orange-500 text-white', medium: 'bg-yellow-500 text-black', low: 'bg-blue-500 text-white' };

  // 统计
  const stats = useMemo(() => ({
    totalRules: rules.length,
    enabledRules: rules.filter(r => r.enabled).length,
    totalTriggers: rules.reduce((sum, r) => sum + r.triggerCount, 0),
    byCategory: {
      safety: { rules: rules.filter(r => r.category === 'safety').length, triggers: rules.filter(r => r.category === 'safety').reduce((s, r) => s + r.triggerCount, 0) },
      health: { rules: rules.filter(r => r.category === 'health').length, triggers: rules.filter(r => r.category === 'health').reduce((s, r) => s + r.triggerCount, 0) },
      efficiency: { rules: rules.filter(r => r.category === 'efficiency').length, triggers: rules.filter(r => r.category === 'efficiency').reduce((s, r) => s + r.triggerCount, 0) },
    },
    unacknowledged: history.filter(h => !h.acknowledged).length,
  }), [rules, history]);

  const isLoading = rulesQuery.isLoading;
  const error = rulesQuery.error;

  return (
    <MainLayout title="护栏控制台">
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">护栏控制台</h1>
        <p className="text-sm text-muted-foreground mt-1">规则管理 · 告警历史 · 统计分析</p>
      </div>

      {/* Tab + 筛选 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-muted p-1 rounded-lg">
          {(['rules', 'history', 'stats'] as const).map(tab => (
            <button key={tab} className={`px-4 py-2 text-sm rounded-md transition-colors ${activeTab === tab ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setActiveTab(tab)}>
              {tab === 'rules' ? '规则管理' : tab === 'history' ? '告警历史' : '统计'}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-muted p-1 rounded-lg">
          {(['all', 'safety', 'health', 'efficiency'] as const).map(cat => (
            <button key={cat} className={`px-3 py-1.5 text-xs rounded-md transition-colors ${filterCategory === cat ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setFilterCategory(cat)}>
              {cat === 'all' ? '全部' : categoryLabels[cat]}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <LoadingSpinner text="正在加载护栏数据..." />}
      {error && <ErrorBanner message={`数据加载失败: ${error.message}`} onRetry={() => rulesQuery.refetch()} />}

      {/* 规则管理 */}
      {activeTab === 'rules' && !isLoading && !error && (
        <div className="space-y-2">
          {filteredRules.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">暂无护栏规则</div>
          ) : filteredRules.map(rule => (
            <div key={rule.id} className={`flex items-center gap-4 p-3 border rounded-lg ${rule.enabled ? 'border-border' : 'border-border opacity-50'}`}>
              <button className={`w-10 h-5 rounded-full transition-colors ${rule.enabled ? 'bg-green-500' : 'bg-muted'}`} onClick={() => toggleRule(rule.id)}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${rule.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className={`text-xs px-2 py-0.5 rounded ${severityColors[rule.severity]}`}>{rule.severity}</span>
              <span className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{categoryLabels[rule.category]}</span>
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">{rule.name}</div>
                <div className="text-xs text-muted-foreground">{rule.description}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono text-foreground">{rule.triggerCount} 次</div>
                <div className="text-xs text-muted-foreground">{rule.lastTriggeredAt ? new Date(rule.lastTriggeredAt).toLocaleString() : '从未触发'}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 告警历史 */}
      {activeTab === 'history' && !isLoading && !error && (
        <div className="space-y-2">
          {filteredHistory.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">暂无告警记录</div>
          ) : filteredHistory.map(alert => (
            <div key={alert.id} className={`flex items-center gap-3 p-3 rounded-lg border ${alert.acknowledged ? 'border-border opacity-60' : 'border-orange-300 bg-orange-50/5'}`}>
              <span className={`text-xs px-2 py-0.5 rounded ${severityColors[alert.severity]}`}>{alert.severity}</span>
              <span className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{categoryLabels[alert.category]}</span>
              <div className="flex-1">
                <div className="text-sm text-foreground">{alert.message}</div>
                <div className="text-xs text-muted-foreground">动作: {alert.action} · 设备: {alert.equipmentId}</div>
              </div>
              <div className="text-xs text-muted-foreground">{new Date(alert.createdAt).toLocaleString()}</div>
              {!alert.acknowledged && (
                <button className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:opacity-80" onClick={() => acknowledgeAlert(alert.id)}>确认</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 统计 */}
      {activeTab === 'stats' && !isLoading && !error && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-sm text-muted-foreground">总规则数</div>
              <div className="text-2xl font-bold text-foreground">{stats.totalRules}</div>
              <div className="text-xs text-green-500">{stats.enabledRules} 已启用</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-sm text-muted-foreground">总触发次数</div>
              <div className="text-2xl font-bold text-orange-500">{stats.totalTriggers}</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-sm text-muted-foreground">未确认告警</div>
              <div className="text-2xl font-bold text-red-500">{stats.unacknowledged}</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-sm text-muted-foreground">告警确认率</div>
              <div className="text-2xl font-bold text-green-500">
                {history.length > 0 ? Math.round(history.filter(h => h.acknowledged).length / history.length * 100) : 0}%
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">分类统计</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-2">类别</th>
                  <th className="pb-2">规则数</th>
                  <th className="pb-2">触发次数</th>
                  <th className="pb-2">占比</th>
                </tr>
              </thead>
              <tbody>
                {(['safety', 'health', 'efficiency'] as const).map(cat => (
                  <tr key={cat} className="border-b border-border/50">
                    <td className="py-2 text-foreground">{categoryLabels[cat]}</td>
                    <td className="py-2 text-foreground">{stats.byCategory[cat].rules}</td>
                    <td className="py-2 text-foreground">{stats.byCategory[cat].triggers}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${stats.totalTriggers > 0 ? (stats.byCategory[cat].triggers / stats.totalTriggers * 100) : 0}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{stats.totalTriggers > 0 ? Math.round(stats.byCategory[cat].triggers / stats.totalTriggers * 100) : 0}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
    </MainLayout>
  );
}
