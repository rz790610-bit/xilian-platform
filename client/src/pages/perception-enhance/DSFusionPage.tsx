/**
 * ============================================================================
 * DS 融合引擎 — 独立页面
 * ============================================================================
 * 展示 Dempster-Shafer 融合引擎的运行状态、融合质量、冲突率等
 * 后端路由: evoPerception.getFusionQuality / .getStats / .getLatest
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

// ============================================================================
// 不确定度条
// ============================================================================
function UncertaintyBar({ value, color = 'primary' }: { value: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const colorClass = pct > 80 ? 'bg-emerald-500' : pct > 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color === 'conflict' ? (pct > 30 ? 'bg-red-500' : pct > 15 ? 'bg-yellow-500' : 'bg-emerald-500') : colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ============================================================================
// 主内容
// ============================================================================
export function DSFusionContent() {
  const [activeTab, setActiveTab] = useState('quality');

  const fusionQuery = trpc.evoPerception.getFusionQuality.useQuery(undefined, { refetchInterval: 10000, retry: 2 });
  const statsQuery = trpc.evoPerception.getStats.useQuery(undefined, { refetchInterval: 15000, retry: 2 });
  const enhancementQuery = trpc.evoPerception.getPerceptionEnhancementStats.useQuery(undefined, { refetchInterval: 15000, retry: 2 });

  const fusion = fusionQuery.data;
  const stats = statsQuery.data as any;
  const enhancement = enhancementQuery.data as any;

  return (
    <div className="space-y-3">
      {/* 顶部指标卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard
          value={fusion?.overallConfidence ? `${(fusion.overallConfidence * 100).toFixed(1)}%` : '—'}
          label="整体置信度"
          icon="🎯"
        />
        <StatCard
          value={fusion?.conflictRate ? `${(fusion.conflictRate * 100).toFixed(1)}%` : '—'}
          label="冲突率"
          icon="⚠️"
        />
        <StatCard
          value={fusion?.evidenceSources ?? '—'}
          label="证据源数量"
          icon="📡"
        />
        <StatCard
          value={fusion?.uncertaintyLevel ? `${(fusion.uncertaintyLevel * 100).toFixed(1)}%` : '—'}
          label="不确定度"
          icon="❓"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="quality" className="text-xs">融合质量</TabsTrigger>
          <TabsTrigger value="pipeline" className="text-xs">管线状态</TabsTrigger>
          <TabsTrigger value="enhancement" className="text-xs">增强统计</TabsTrigger>
        </TabsList>

        {/* 融合质量 Tab */}
        <TabsContent value="quality">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <PageCard title="DS 融合质量" icon="🎯">
              <div className="space-y-2">
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">整体置信度</span>
                    <span className="font-mono">{fusion?.overallConfidence ? (fusion.overallConfidence * 100).toFixed(1) + '%' : '—'}</span>
                  </div>
                  <UncertaintyBar value={fusion?.overallConfidence ?? 0} />
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">冲突率</span>
                    <span className="font-mono">{fusion?.conflictRate ? (fusion.conflictRate * 100).toFixed(1) + '%' : '—'}</span>
                  </div>
                  <UncertaintyBar value={fusion?.conflictRate ?? 0} color="conflict" />
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">不确定度</span>
                    <span className="font-mono">{fusion?.uncertaintyLevel ? (fusion.uncertaintyLevel * 100).toFixed(1) + '%' : '—'}</span>
                  </div>
                  <UncertaintyBar value={1 - (fusion?.uncertaintyLevel ?? 0)} />
                </div>
              </div>
              {fusion?.lastFusionAt && (
                <div className="text-[10px] text-muted-foreground mt-2 border-t border-border/30 pt-1">
                  最近融合: {new Date(fusion.lastFusionAt).toLocaleString()}
                </div>
              )}
            </PageCard>

            <PageCard title="融合参数" icon="⚙️">
              <div className="space-y-1.5 text-[10px]">
                <div className="flex justify-between py-1 border-b border-border/20">
                  <span className="text-muted-foreground">融合算法</span>
                  <Badge variant="outline" className="text-[10px]">Dempster-Shafer</Badge>
                </div>
                <div className="flex justify-between py-1 border-b border-border/20">
                  <span className="text-muted-foreground">冲突处理</span>
                  <Badge variant="outline" className="text-[10px]">Yager 修正</Badge>
                </div>
                <div className="flex justify-between py-1 border-b border-border/20">
                  <span className="text-muted-foreground">证据源</span>
                  <span className="font-mono">{fusion?.evidenceSources ?? 0} 个</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">无知度基线</span>
                  <span className="font-mono">0.05</span>
                </div>
              </div>
            </PageCard>
          </div>
        </TabsContent>

        {/* 管线状态 Tab */}
        <TabsContent value="pipeline">
          <PageCard title="感知管线运行状态" icon="🔗">
            {stats ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="p-2 rounded bg-muted/30 border border-border/30">
                    <div className="text-[10px] text-muted-foreground">活跃 BPA 配置</div>
                    <div className="text-sm font-semibold">{stats.activeBpaConfigs ?? 0}</div>
                  </div>
                  <div className="p-2 rounded bg-muted/30 border border-border/30">
                    <div className="text-[10px] text-muted-foreground">活跃维度</div>
                    <div className="text-sm font-semibold">{stats.activeDimensions ?? 0}</div>
                  </div>
                  <div className="p-2 rounded bg-muted/30 border border-border/30">
                    <div className="text-[10px] text-muted-foreground">工况配置</div>
                    <div className="text-sm font-semibold">{stats.conditionProfiles ?? 0}</div>
                  </div>
                  <div className="p-2 rounded bg-muted/30 border border-border/30">
                    <div className="text-[10px] text-muted-foreground">采集通道</div>
                    <div className="text-sm font-semibold">{stats.collectionChannels ?? 0}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground text-[10px]">加载中...</div>
            )}
          </PageCard>
        </TabsContent>

        {/* 增强统计 Tab */}
        <TabsContent value="enhancement">
          <PageCard title="感知增强统计" icon="📊">
            {enhancement ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(enhancement).map(([key, val]) => (
                    <div key={key} className="p-2 rounded bg-muted/30 border border-border/30">
                      <div className="text-[10px] text-muted-foreground">{key}</div>
                      <div className="text-sm font-semibold font-mono">{typeof val === 'number' ? val.toLocaleString() : String(val)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground text-[10px]">加载中...</div>
            )}
          </PageCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function DSFusionPage() {
  return (
    <MainLayout title="DS 融合引擎" subtitle="Dempster-Shafer 证据融合与冲突处理">
      <DSFusionContent />
    </MainLayout>
  );
}
