/**
 * ============================================================================
 * 数字孪生可视化 — DigitalTwinView
 * ============================================================================
 *
 * 设备数字孪生状态 + 仿真控制 + 历史回放 + 优化建议
 * 通过 tRPC 接入后端 evoPipeline 域路由
 */

import { useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { trpc } from '@/lib/trpc';

// ============================================================================
// 类型
// ============================================================================

interface TwinState {
  equipmentId: string;
  equipmentName: string;
  syncStatus: 'synced' | 'stale' | 'disconnected';
  lastSyncAt: string;
  stateVector: {
    vibrationRMS: number;
    temperature: number;
    loadRatio: number;
    speed: number;
    fatigueDamage: number;
    remainingLifeDays: number;
  };
  healthScore: number;
  safetyScore: number;
  efficiencyScore: number;
}

interface SimulationScenario {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, number>;
  status: 'idle' | 'running' | 'completed';
  result?: {
    predictedState: Record<string, number>;
    riskLevel: 'low' | 'medium' | 'high';
    recommendations: string[];
  };
}

interface ReplaySession {
  id: string;
  startTime: string;
  endTime: string;
  equipmentId: string;
  eventCount: number;
  status: 'ready' | 'playing' | 'paused' | 'completed';
  progress: number;
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

function ScoreGauge({ label, score, color }: { label: string; score: number; color: string }) {
  const pct = Math.round(score * 100);
  return (
    <div className="text-center">
      <div className="relative w-16 h-16 mx-auto">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" />
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={`${pct}, 100`} className={color} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">{pct}</div>
      </div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export default function DigitalTwinView() {
  const [selectedTwin, setSelectedTwin] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'status' | 'simulate' | 'replay'>('status');

  // ---- tRPC 数据查询 ----
  const twinsQuery = trpc.evoPipeline.listDigitalTwins.useQuery(undefined, {
    refetchInterval: 5000,
    retry: 2,
    onSuccess: (data: TwinState[]) => {
      if (!selectedTwin && data && data.length > 0) {
        setSelectedTwin(data[0].equipmentId);
      }
    },
  });

  const scenariosQuery = trpc.evoPipeline.listSimulationScenarios.useQuery(
    { equipmentId: selectedTwin },
    { enabled: !!selectedTwin && activeTab === 'simulate', retry: 2 }
  );

  const replaysQuery = trpc.evoPipeline.listReplaySessions.useQuery(
    { equipmentId: selectedTwin },
    { enabled: !!selectedTwin && activeTab === 'replay', retry: 2 }
  );

  const runSimulationMutation = trpc.evoPipeline.runSimulation.useMutation({
    onSuccess: () => scenariosQuery.refetch(),
  });

  const startReplayMutation = trpc.evoPipeline.startReplay.useMutation({
    onSuccess: () => replaysQuery.refetch(),
  });

  // ---- 数据解构 ----
  const twins: TwinState[] = (twinsQuery.data as TwinState[]) ?? [];
  const scenarios: SimulationScenario[] = (scenariosQuery.data as SimulationScenario[]) ?? [];
  const replays: ReplaySession[] = (replaysQuery.data as ReplaySession[]) ?? [];

  const currentTwin = twins.find(t => t.equipmentId === selectedTwin) || twins[0];
  const syncColor = currentTwin?.syncStatus === 'synced' ? 'text-green-500' : currentTwin?.syncStatus === 'stale' ? 'text-yellow-500' : 'text-red-500';

  const runSimulation = useCallback((scenarioId: string) => {
    runSimulationMutation.mutate({ scenarioId, equipmentId: selectedTwin });
  }, [runSimulationMutation, selectedTwin]);

  const startReplay = useCallback((replayId: string) => {
    startReplayMutation.mutate({ replayId });
  }, [startReplayMutation]);

  const isLoading = twinsQuery.isLoading;
  const error = twinsQuery.error;

  return (
    <MainLayout title="数字孪生">
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">数字孪生</h1>
        <p className="text-sm text-muted-foreground mt-1">设备状态 · 仿真推演 · 历史回放</p>
      </div>

      {isLoading && <LoadingSpinner text="正在加载数字孪生数据..." />}
      {error && <ErrorBanner message={`数据加载失败: ${error.message}`} onRetry={() => twinsQuery.refetch()} />}

      {!isLoading && !error && twins.length === 0 && (
        <div className="text-center text-muted-foreground py-12">暂无数字孪生设备</div>
      )}

      {!isLoading && !error && twins.length > 0 && (
        <>
          {/* 设备选择 */}
          <div className="flex gap-2">
            {twins.map(t => (
              <button key={t.equipmentId} className={`px-4 py-2 text-sm rounded-lg border transition-colors ${selectedTwin === t.equipmentId ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`} onClick={() => setSelectedTwin(t.equipmentId)}>
                {t.equipmentName}
                <span className={`ml-2 text-xs ${t.syncStatus === 'synced' ? 'text-green-500' : t.syncStatus === 'stale' ? 'text-yellow-500' : 'text-red-500'}`}>●</span>
              </button>
            ))}
          </div>

          {/* Tab */}
          <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
            {(['status', 'simulate', 'replay'] as const).map(tab => (
              <button key={tab} className={`px-4 py-2 text-sm rounded-md transition-colors ${activeTab === tab ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setActiveTab(tab)}>
                {tab === 'status' ? '实时状态' : tab === 'simulate' ? '仿真推演' : '历史回放'}
              </button>
            ))}
          </div>

          {/* 实时状态 */}
          {activeTab === 'status' && currentTwin && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span className={`text-sm ${syncColor}`}>● {currentTwin.syncStatus}</span>
                <span className="text-xs text-muted-foreground">最后同步: {new Date(currentTwin.lastSyncAt).toLocaleTimeString()}</span>
              </div>

              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">综合评分</h3>
                <div className="flex justify-around">
                  <ScoreGauge label="安全" score={currentTwin.safetyScore} color="text-green-500" />
                  <ScoreGauge label="健康" score={currentTwin.healthScore} color="text-blue-500" />
                  <ScoreGauge label="效率" score={currentTwin.efficiencyScore} color="text-purple-500" />
                </div>
              </div>

              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">状态向量</h3>
                <div className="grid grid-cols-3 gap-4">
                  {Object.entries(currentTwin.stateVector).map(([key, value]) => {
                    const labels: Record<string, string> = { vibrationRMS: '振动 RMS', temperature: '温度', loadRatio: '负载率', speed: '转速', fatigueDamage: '疲劳损伤', remainingLifeDays: '剩余寿命' };
                    const units: Record<string, string> = { vibrationRMS: 'mm/s', temperature: '°C', loadRatio: '', speed: 'rpm', fatigueDamage: '', remainingLifeDays: '天' };
                    return (
                      <div key={key} className="flex justify-between items-center py-1">
                        <span className="text-sm text-muted-foreground">{labels[key] || key}</span>
                        <span className="text-sm font-mono text-foreground">{typeof value === 'number' ? value.toFixed(1) : value} {units[key]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 仿真推演 */}
          {activeTab === 'simulate' && (
            <div className="space-y-3">
              {scenarios.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">暂无仿真场景</div>
              ) : scenarios.map(s => (
                <div key={s.id} className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-medium text-foreground">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.description}</div>
                    </div>
                    {s.status === 'idle' && <button className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:opacity-80" onClick={() => runSimulation(s.id)}>运行</button>}
                    {s.status === 'running' && <span className="text-xs text-yellow-500">运行中...</span>}
                    {s.status === 'completed' && <span className="text-xs text-green-500">已完成</span>}
                  </div>
                  {s.result && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-muted-foreground">风险等级:</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${s.result.riskLevel === 'high' ? 'bg-red-500 text-white' : s.result.riskLevel === 'medium' ? 'bg-yellow-500 text-black' : 'bg-green-500 text-white'}`}>{s.result.riskLevel}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mb-1">建议:</div>
                      <ul className="text-xs text-foreground space-y-1">
                        {s.result.recommendations.map((r, i) => <li key={i}>• {r}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 历史回放 */}
          {activeTab === 'replay' && (
            <div className="space-y-3">
              {replays.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">暂无回放记录</div>
              ) : replays.map(r => (
                <div key={r.id} className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">{r.equipmentId}</div>
                      <div className="text-xs text-muted-foreground">{new Date(r.startTime).toLocaleString()} → {new Date(r.endTime).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{r.eventCount} 个事件</div>
                    </div>
                    {r.status === 'ready' && <button className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:opacity-80" onClick={() => startReplay(r.id)}>播放</button>}
                    {r.status === 'playing' && <span className="text-xs text-yellow-500">播放中</span>}
                    {r.status === 'completed' && <span className="text-xs text-green-500">已完成</span>}
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${r.progress}%` }} />
                  </div>
                  <div className="text-xs text-muted-foreground text-right mt-1">{r.progress}%</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
    </MainLayout>
  );
}
