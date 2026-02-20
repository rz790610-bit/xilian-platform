/**
 * ============================================================================
 * 感知层监控 — PerceptionMonitor
 * ============================================================================
 *
 * 采集管线状态 + DS 融合质量 + 状态向量实时可视 + 工况检测
 * 通过 tRPC 接入后端 evoPerception 域路由
 */

import { useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { trpc } from '@/lib/trpc';

// ============================================================================
// 类型
// ============================================================================

interface CollectionStatus {
  equipmentId: string;
  sensorCount: number;
  samplingRateHz: number;
  bufferUsage: number;
  backpressure: 'normal' | 'warning' | 'critical';
  protocol: string;
  lastDataAt: string;
}

interface FusionQuality {
  overallConfidence: number;
  conflictRate: number;
  evidenceSources: number;
  uncertaintyLevel: number;
  lastFusionAt: string;
}

interface ConditionProfile {
  id: string;
  name: string;
  active: boolean;
  equipmentCount: number;
  features: string[];
}

// ============================================================================
// 默认空状态
// ============================================================================

const emptyFusion: FusionQuality = {
  overallConfidence: 0,
  conflictRate: 0,
  evidenceSources: 0,
  uncertaintyLevel: 0,
  lastFusionAt: '',
};

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
        <button className="text-xs px-3 py-1 bg-destructive text-destructive-foreground rounded" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export default function PerceptionMonitor() {
  const [pollInterval] = useState(5000);

  // ---- tRPC 数据查询 ----
  const collectionsQuery = trpc.evoPerception.listCollectionStatus.useQuery(undefined, {
    refetchInterval: pollInterval,
    retry: 2,
  });

  const fusionQuery = trpc.evoPerception.getFusionQuality.useQuery(undefined, {
    refetchInterval: pollInterval,
    retry: 2,
  });

  const profilesQuery = trpc.evoPerception.listConditionProfiles.useQuery(undefined, {
    retry: 2,
  });

  // ---- 数据解构 ----
  const collections: CollectionStatus[] = (collectionsQuery.data as CollectionStatus[]) ?? [];
  const fusion: FusionQuality = (fusionQuery.data as FusionQuality) ?? emptyFusion;
  const profiles: ConditionProfile[] = (profilesQuery.data as ConditionProfile[]) ?? [];

  const isLoading = collectionsQuery.isLoading || fusionQuery.isLoading;
  const error = collectionsQuery.error || fusionQuery.error;

  const bpColor = (bp: string) => bp === 'critical' ? 'text-red-500' : bp === 'warning' ? 'text-yellow-500' : 'text-green-500';
  const bufferColor = (usage: number) => usage > 0.8 ? 'bg-red-500' : usage > 0.6 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <MainLayout title="感知层监控">
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">感知层监控</h1>
        <p className="text-sm text-muted-foreground mt-1">采集管线 · DS 融合质量 · 工况配置</p>
      </div>

      {isLoading && <LoadingSpinner text="正在加载感知层数据..." />}
      {error && <ErrorBanner message={`数据加载失败: ${error.message}`} onRetry={() => collectionsQuery.refetch()} />}

      {!isLoading && !error && (
        <>
          {/* 采集管线状态 */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">采集管线状态</h3>
            {collections.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">暂无采集设备接入</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="pb-2">设备</th>
                    <th className="pb-2">传感器</th>
                    <th className="pb-2">采样率</th>
                    <th className="pb-2">缓冲区</th>
                    <th className="pb-2">背压</th>
                    <th className="pb-2">协议</th>
                    <th className="pb-2">最后数据</th>
                  </tr>
                </thead>
                <tbody>
                  {collections.map(c => (
                    <tr key={c.equipmentId} className="border-b border-border/50">
                      <td className="py-2 font-mono text-foreground">{c.equipmentId}</td>
                      <td className="py-2 text-foreground">{c.sensorCount}</td>
                      <td className="py-2 text-foreground">{c.samplingRateHz} Hz</td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full ${bufferColor(c.bufferUsage)} rounded-full`} style={{ width: `${c.bufferUsage * 100}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{Math.round(c.bufferUsage * 100)}%</span>
                        </div>
                      </td>
                      <td className={`py-2 ${bpColor(c.backpressure)}`}>{c.backpressure}</td>
                      <td className="py-2 text-foreground">{c.protocol}</td>
                      <td className="py-2 text-xs text-muted-foreground">{c.lastDataAt ? new Date(c.lastDataAt).toLocaleTimeString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* DS 融合质量 */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-sm text-muted-foreground">融合置信度</div>
              <div className="text-2xl font-bold text-green-500">{Math.round(fusion.overallConfidence * 100)}%</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-sm text-muted-foreground">冲突率</div>
              <div className="text-2xl font-bold text-yellow-500">{Math.round(fusion.conflictRate * 100)}%</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-sm text-muted-foreground">证据源数量</div>
              <div className="text-2xl font-bold text-blue-500">{fusion.evidenceSources}</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-sm text-muted-foreground">不确定性</div>
              <div className="text-2xl font-bold text-purple-500">{Math.round(fusion.uncertaintyLevel * 100)}%</div>
            </div>
          </div>

          {/* 工况配置 */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">工况配置</h3>
            {profiles.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">暂无工况配置</div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {profiles.map(p => (
                  <div key={p.id} className={`border rounded-lg p-3 ${p.active ? 'border-green-500 bg-green-500/5' : 'border-border'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">{p.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${p.active ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                        {p.active ? '活跃' : '未启用'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mb-1">{p.equipmentCount} 台设备</div>
                    <div className="flex flex-wrap gap-1">
                      {p.features.map(f => (
                        <span key={f} className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{f}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
    </MainLayout>
  );
}
