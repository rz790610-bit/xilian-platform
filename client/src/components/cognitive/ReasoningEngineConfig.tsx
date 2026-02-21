/**
 * ============================================================================
 * Phase 2 — 推理引擎配置管理面板
 * ============================================================================
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

// ============================================================================
// 配置编辑器子组件
// ============================================================================

function ConfigField({ label, value, onChange, type = 'number', unit, description }: {
  label: string; value: number | string | boolean; onChange: (v: any) => void;
  type?: 'number' | 'text' | 'boolean'; unit?: string; description?: string;
}) {
  if (type === 'boolean') {
    return (
      <div className="flex items-center justify-between py-1">
        <div>
          <span className="text-xs font-medium">{label}</span>
          {description && <p className="text-[10px] text-muted-foreground">{description}</p>}
        </div>
        <Switch checked={value as boolean} onCheckedChange={onChange} />
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] text-muted-foreground">{label}</Label>
        {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
      </div>
      <Input
        type={type}
        value={String(value)}
        onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
        className="h-7 text-xs"
      />
      {description && <p className="text-[10px] text-muted-foreground">{description}</p>}
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export function ReasoningEngineConfig() {
  const [configTab, setConfigTab] = useState('orchestrator');

  const configQuery = trpc.evoCognition.reasoningEngine.getEngineConfig.useQuery(undefined, { retry: 2 });
  const updateMutation = trpc.evoCognition.reasoningEngine.updateEngineConfig.useMutation({
    onSuccess: (data) => { configQuery.refetch(); toast.success(`${data.module} 配置已更新`); },
    onError: (e) => toast.error(`更新失败: ${e.message}`),
  });
  const resetMutation = trpc.evoCognition.reasoningEngine.resetEngineConfig.useMutation({
    onSuccess: (data) => { configQuery.refetch(); toast.success(`${data.module} 已重置为默认值`); },
    onError: (e) => toast.error(`重置失败: ${e.message}`),
  });

  const shadowQuery = trpc.evoCognition.reasoningEngine.getShadowModeStats.useQuery(undefined, { retry: 2, refetchInterval: 10000 });
  const promoteMutation = trpc.evoCognition.reasoningEngine.forcePromote.useMutation({
    onSuccess: () => { shadowQuery.refetch(); toast.success('已晋升 Challenger 为主引擎'); },
  });
  const rollbackMutation = trpc.evoCognition.reasoningEngine.forceRollback.useMutation({
    onSuccess: () => { shadowQuery.refetch(); toast.success('已回退到 Champion 引擎'); },
  });
  const shadowModeMutation = trpc.evoCognition.reasoningEngine.enterShadowMode.useMutation({
    onSuccess: () => { shadowQuery.refetch(); toast.success('已进入 Shadow 模式'); },
  });

  const config = configQuery.data;
  const shadow = shadowQuery.data;

  if (configQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-muted-foreground">加载配置中...</span>
      </div>
    );
  }

  if (!config) {
    return <div className="text-center py-8 text-xs text-muted-foreground">无法加载配置</div>;
  }

  const handleUpdate = (module: string, configPatch: Record<string, unknown>) => {
    updateMutation.mutate({ module: module as any, config: configPatch });
  };

  return (
    <div className="space-y-3">
      {/* Shadow Mode 控制面板 */}
      {shadow && (
        <PageCard title="Champion-Challenger Shadow Mode" icon="🔄">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
            <StatCard
              value={shadow.mode === 'champion' ? 'Champion' : shadow.mode === 'challenger' ? 'Challenger' : 'Shadow'}
              label="当前模式"
              icon={shadow.mode === 'shadow' ? '🔄' : shadow.mode === 'challenger' ? '🏆' : '🛡️'}
            />
            <StatCard value={shadow.totalSessions} label="总会话数" icon="📊" />
            <StatCard value={`${shadow.hitRateDelta.toFixed(1)}pp`} label="命中率差值" icon="📈" />
            <StatCard value={shadow.pValue.toFixed(3)} label="p 值" icon="🧪" />
            <StatCard value={`${shadow.avgLatencyRatio.toFixed(2)}x`} label="延迟比" icon="⏱️" />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="text-xs">
              <span className="text-muted-foreground">Challenger 命中率: </span>
              <span className="font-mono font-medium">{(shadow.challengerHitRate * 100).toFixed(1)}%</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Champion 命中率: </span>
              <span className="font-mono font-medium">{(shadow.championHitRate * 100).toFixed(1)}%</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">降级次数: </span>
              <span className="font-mono font-medium">{shadow.fallbackCount}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">晋升就绪: </span>
              <Badge variant={shadow.promotionReady ? 'default' : 'secondary'} className="text-[10px]">
                {shadow.promotionReady ? '✓ 满足条件' : '✗ 未满足'}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Button size="sm" className="h-7 text-xs" onClick={() => promoteMutation.mutate()} disabled={shadow.mode === 'challenger'}>
              晋升 Challenger
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => rollbackMutation.mutate()} disabled={shadow.mode === 'champion'}>
              回退 Champion
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => shadowModeMutation.mutate()} disabled={shadow.mode === 'shadow'}>
              进入 Shadow
            </Button>
          </div>
        </PageCard>
      )}

      {/* 模块配置 Tabs */}
      <Tabs value={configTab} onValueChange={setConfigTab}>
        <div className="flex items-center justify-between mb-2">
          <TabsList>
            <TabsTrigger value="orchestrator" className="text-xs">编排器</TabsTrigger>
            <TabsTrigger value="causalGraph" className="text-xs">因果图</TabsTrigger>
            <TabsTrigger value="experiencePool" className="text-xs">经验池</TabsTrigger>
            <TabsTrigger value="physicsVerifier" className="text-xs">物理验证</TabsTrigger>
            <TabsTrigger value="feedbackLoop" className="text-xs">反馈环</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => resetMutation.mutate({ module: configTab as any })}>
            重置默认
          </Button>
        </div>

        {/* ===== 编排器配置 ===== */}
        <TabsContent value="orchestrator">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PageCard title="路由阈值" icon="🔀">
              <div className="space-y-2">
                <ConfigField label="快速路径置信度阈值" value={config.orchestrator.routing.fastPathConfidence} onChange={(v) => handleUpdate('orchestrator', { routing: { ...config.orchestrator.routing, fastPathConfidence: v } })} description="经验命中置信度 ≥ 此值时走快速路径" />
                <ConfigField label="深度路径触发阈值" value={config.orchestrator.routing.deepPathTrigger} onChange={(v) => handleUpdate('orchestrator', { routing: { ...config.orchestrator.routing, deepPathTrigger: v } })} description="标准路径置信度 < 此值时触发深度推理" />
                <ConfigField label="降级超时" value={config.orchestrator.routing.fallbackTimeoutMs} onChange={(v) => handleUpdate('orchestrator', { routing: { ...config.orchestrator.routing, fallbackTimeoutMs: v } })} unit="ms" />
              </div>
            </PageCard>
            <PageCard title="CostGate 配置" icon="💰">
              <div className="space-y-2">
                <ConfigField label="每日 Grok 调用预算" value={config.orchestrator.costGate.dailyGrokBudget} onChange={(v) => handleUpdate('orchestrator', { costGate: { ...config.orchestrator.costGate, dailyGrokBudget: v } })} />
                <div className="text-xs"><span className="text-muted-foreground">今日已用: </span><span className="font-mono">{config.orchestrator.costGate.dailyGrokUsed}</span></div>
                <ConfigField label="经验命中抑制因子" value={config.orchestrator.costGate.experienceHitSuppression} onChange={(v) => handleUpdate('orchestrator', { costGate: { ...config.orchestrator.costGate, experienceHitSuppression: v } })} description="[0, 1]" />
                <ConfigField label="短路抑制因子" value={config.orchestrator.costGate.shortCircuitSuppression} onChange={(v) => handleUpdate('orchestrator', { costGate: { ...config.orchestrator.costGate, shortCircuitSuppression: v } })} description="[0, 1]" />
              </div>
            </PageCard>
            <PageCard title="全局参数" icon="⚙️">
              <div className="space-y-2">
                <ConfigField label="短路置信度阈值" value={config.orchestrator.shortCircuitConfidence} onChange={(v) => handleUpdate('orchestrator', { shortCircuitConfidence: v })} description="超过此值直接返回" />
                <ConfigField label="延迟预算 P95" value={config.orchestrator.latencyBudgetMs} onChange={(v) => handleUpdate('orchestrator', { latencyBudgetMs: v })} unit="ms" />
              </div>
            </PageCard>
            <PageCard title="并行扇出" icon="🔱">
              <div className="space-y-2">
                <ConfigField label="最大并发数" value={config.orchestrator.parallelFanout.maxConcurrency} onChange={(v) => handleUpdate('orchestrator', { parallelFanout: { ...config.orchestrator.parallelFanout, maxConcurrency: v } })} />
                <ConfigField label="单任务超时" value={config.orchestrator.parallelFanout.taskTimeoutMs} onChange={(v) => handleUpdate('orchestrator', { parallelFanout: { ...config.orchestrator.parallelFanout, taskTimeoutMs: v } })} unit="ms" />
                <ConfigField label="全局超时" value={config.orchestrator.parallelFanout.globalTimeoutMs} onChange={(v) => handleUpdate('orchestrator', { parallelFanout: { ...config.orchestrator.parallelFanout, globalTimeoutMs: v } })} unit="ms" />
              </div>
            </PageCard>
          </div>
        </TabsContent>

        {/* ===== 因果图配置 ===== */}
        <TabsContent value="causalGraph">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PageCard title="图结构参数" icon="🕸️">
              <div className="space-y-2">
                <ConfigField label="最大节点数" value={config.causalGraph.maxNodes} onChange={(v) => handleUpdate('causalGraph', { maxNodes: v })} description="膨胀控制" />
                <ConfigField label="边权衰减率/天" value={config.causalGraph.edgeDecayRatePerDay} onChange={(v) => handleUpdate('causalGraph', { edgeDecayRatePerDay: v })} />
                <ConfigField label="最小边权重" value={config.causalGraph.minEdgeWeight} onChange={(v) => handleUpdate('causalGraph', { minEdgeWeight: v })} description="低于此值自动剪枝" />
              </div>
            </PageCard>
            <PageCard title="Grok 补全" icon="🤖">
              <div className="space-y-2">
                <ConfigField label="启用 Grok 动态补全" value={config.causalGraph.enableGrokCompletion} onChange={(v) => handleUpdate('causalGraph', { enableGrokCompletion: v })} type="boolean" />
                <ConfigField label="5-Why 最大深度" value={config.causalGraph.maxWhyDepth} onChange={(v) => handleUpdate('causalGraph', { maxWhyDepth: v })} />
              </div>
            </PageCard>
          </div>
        </TabsContent>

        {/* ===== 经验池配置 ===== */}
        <TabsContent value="experiencePool">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PageCard title="三层内存容量" icon="🧠">
              <div className="space-y-2">
                <ConfigField label="情景记忆 (Episodic)" value={config.experiencePool.capacity.episodic} onChange={(v) => handleUpdate('experiencePool', { capacity: { ...config.experiencePool.capacity, episodic: v } })} />
                <ConfigField label="语义记忆 (Semantic)" value={config.experiencePool.capacity.semantic} onChange={(v) => handleUpdate('experiencePool', { capacity: { ...config.experiencePool.capacity, semantic: v } })} />
                <ConfigField label="程序记忆 (Procedural)" value={config.experiencePool.capacity.procedural} onChange={(v) => handleUpdate('experiencePool', { capacity: { ...config.experiencePool.capacity, procedural: v } })} />
              </div>
            </PageCard>
            <PageCard title="三维衰减参数" icon="📉">
              <div className="space-y-2">
                <ConfigField label="时间衰减半衰期" value={config.experiencePool.decay.timeHalfLifeDays} onChange={(v) => handleUpdate('experiencePool', { decay: { ...config.experiencePool.decay, timeHalfLifeDays: v } })} unit="天" />
                <ConfigField label="设备相似度权重" value={config.experiencePool.decay.deviceSimilarityWeight} onChange={(v) => handleUpdate('experiencePool', { decay: { ...config.experiencePool.decay, deviceSimilarityWeight: v } })} description="[0, 1]" />
                <ConfigField label="工况相似度权重" value={config.experiencePool.decay.conditionSimilarityWeight} onChange={(v) => handleUpdate('experiencePool', { decay: { ...config.experiencePool.decay, conditionSimilarityWeight: v } })} description="[0, 1]" />
              </div>
            </PageCard>
          </div>
        </TabsContent>

        {/* ===== 物理验证器配置 ===== */}
        <TabsContent value="physicsVerifier">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PageCard title="验证参数" icon="🔬">
              <div className="space-y-2">
                <ConfigField label="映射置信度阈值" value={config.physicsVerifier.mappingConfidenceThreshold} onChange={(v) => handleUpdate('physicsVerifier', { mappingConfidenceThreshold: v })} description="低于此值的映射被丢弃" />
                <ConfigField label="残差阈值" value={config.physicsVerifier.residualThreshold} onChange={(v) => handleUpdate('physicsVerifier', { residualThreshold: v })} description="残差 > 此值视为物理不可行" />
                <ConfigField label="Monte-Carlo 采样次数" value={config.physicsVerifier.monteCarloSamples} onChange={(v) => handleUpdate('physicsVerifier', { monteCarloSamples: v })} />
                <ConfigField label="启用 Grok 映射" value={config.physicsVerifier.enableGrokMapping} onChange={(v) => handleUpdate('physicsVerifier', { enableGrokMapping: v })} type="boolean" />
              </div>
            </PageCard>
            <PageCard title="三源映射权重" icon="⚖️">
              <div className="space-y-2">
                <ConfigField label="规则映射权重" value={config.physicsVerifier.sourceWeights.rule} onChange={(v) => handleUpdate('physicsVerifier', { sourceWeights: { ...config.physicsVerifier.sourceWeights, rule: v } })} />
                <ConfigField label="Embedding 映射权重" value={config.physicsVerifier.sourceWeights.embedding} onChange={(v) => handleUpdate('physicsVerifier', { sourceWeights: { ...config.physicsVerifier.sourceWeights, embedding: v } })} />
                <ConfigField label="Grok 映射权重" value={config.physicsVerifier.sourceWeights.grok} onChange={(v) => handleUpdate('physicsVerifier', { sourceWeights: { ...config.physicsVerifier.sourceWeights, grok: v } })} />
                <div className="text-[10px] text-muted-foreground pt-1">三源权重之和应为 1.0，当前: {(config.physicsVerifier.sourceWeights.rule + config.physicsVerifier.sourceWeights.embedding + config.physicsVerifier.sourceWeights.grok).toFixed(2)}</div>
              </div>
            </PageCard>
          </div>
        </TabsContent>

        {/* ===== 反馈环配置 ===== */}
        <TabsContent value="feedbackLoop">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PageCard title="反馈参数" icon="🔄">
              <div className="space-y-2">
                <ConfigField label="最小样本数保护" value={config.feedbackLoop.minSamplesForUpdate} onChange={(v) => handleUpdate('feedbackLoop', { minSamplesForUpdate: v })} description="低于此数不更新权重" />
                <ConfigField label="修订日志保留天数" value={config.feedbackLoop.revisionLogRetentionDays} onChange={(v) => handleUpdate('feedbackLoop', { revisionLogRetentionDays: v })} unit="天" />
                <ConfigField label="启用自动反馈" value={config.feedbackLoop.enableAutoFeedback} onChange={(v) => handleUpdate('feedbackLoop', { enableAutoFeedback: v })} type="boolean" />
              </div>
            </PageCard>
            <PageCard title="学习率（自适应）" icon="📐">
              <div className="space-y-2">
                <ConfigField label="初始学习率" value={config.feedbackLoop.learningRate.initial} onChange={(v) => handleUpdate('feedbackLoop', { learningRate: { ...config.feedbackLoop.learningRate, initial: v } })} />
                <ConfigField label="最小学习率" value={config.feedbackLoop.learningRate.min} onChange={(v) => handleUpdate('feedbackLoop', { learningRate: { ...config.feedbackLoop.learningRate, min: v } })} />
                <ConfigField label="最大学习率" value={config.feedbackLoop.learningRate.max} onChange={(v) => handleUpdate('feedbackLoop', { learningRate: { ...config.feedbackLoop.learningRate, max: v } })} />
                <ConfigField label="衰减因子" value={config.feedbackLoop.learningRate.decayFactor} onChange={(v) => handleUpdate('feedbackLoop', { learningRate: { ...config.feedbackLoop.learningRate, decayFactor: v } })} />
              </div>
            </PageCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
