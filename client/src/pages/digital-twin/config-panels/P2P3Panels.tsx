/**
 * P2/P3 模块配置面板合集
 * 
 * ReplayEngine, TwinEventBus, OutboxRelay, BullMQ,
 * UncertaintyQuantifier, VectorStore, DataCollection
 */
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ConfigItem {
  id: number; module: string; configKey: string; configValue: unknown;
  defaultValue: unknown; label: string | null; unit: string | null;
  configGroup: string | null; constraints: unknown; description: string | null; enabled: number;
}
interface PanelProps {
  configs: ConfigItem[];
  onUpdate: (id: number, value: string, reason?: string) => void;
  onReset: (id: number) => void;
}

function useConfigHelper(configs: ConfigItem[]) {
  const getConfig = (key: string) => configs.find(c => c.configKey === key);
  const getVal = (key: string): string => {
    const c = getConfig(key);
    if (!c) return '';
    const v = c.configValue;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  };
  return { getConfig, getVal };
}

/* ============================================================================
 * ReplayEngine 回放引擎 (P2)
 * ============================================================================ */
export function ReplayEnginePanel({ configs, onUpdate }: PanelProps) {
  const { getConfig, getVal } = useConfigHelper(configs);
  const speedMultiplier = Number(getVal('replaySpeedMultiplier')) || 1;
  const maxDurationMs = Number(getVal('replayMaxDurationMs')) || 3600000;
  const bufferSize = Number(getVal('replayBufferSize')) || 1000;

  return (
    <div className="space-y-3">
      <PageCard title="回放参数" icon={<span className="text-xs">⏪</span>} compact>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">回放倍速</label>
            <div className="flex items-center gap-1">
              <Select value={String(speedMultiplier)}
                onValueChange={(v) => { const c = getConfig('replaySpeedMultiplier'); if (c) onUpdate(c.id, v); }}>
                <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0.25, 0.5, 1, 2, 4, 8, 16].map(s => (
                    <SelectItem key={s} value={String(s)}>{s}x</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">最大回放时长</label>
            <div className="flex items-center gap-1">
              <Input type="number" value={maxDurationMs / 60000}
                onChange={(e) => { const c = getConfig('replayMaxDurationMs'); if (c) onUpdate(c.id, String(Number(e.target.value) * 60000)); }}
                className="h-6 text-[10px] font-mono w-16" />
              <span className="text-[9px] text-muted-foreground">分钟</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">缓冲区大小</label>
            <div className="flex items-center gap-1">
              <Input type="number" value={bufferSize}
                onChange={(e) => { const c = getConfig('replayBufferSize'); if (c) onUpdate(c.id, e.target.value); }}
                className="h-6 text-[10px] font-mono w-16" />
              <span className="text-[9px] text-muted-foreground">条</span>
            </div>
          </div>
        </div>
      </PageCard>
      <PageCard title="回放控制" icon={<span className="text-xs">🎬</span>} compact>
        <div className="p-2 bg-muted/20 rounded flex items-center justify-center gap-4">
          <div className="flex items-center gap-2">
            {['⏮', '⏪', '▶️', '⏩', '⏭'].map((icon, i) => (
              <button key={i} className="w-7 h-7 rounded bg-muted hover:bg-muted/80 flex items-center justify-center text-sm">
                {icon}
              </button>
            ))}
          </div>
          <Badge variant="outline" className="text-[9px]">{speedMultiplier}x</Badge>
        </div>
      </PageCard>
    </div>
  );
}

/* ============================================================================
 * TwinEventBus 事件总线 (P2)
 * ============================================================================ */
export function EventBusPanel({ configs, onUpdate }: PanelProps) {
  const { getConfig, getVal } = useConfigHelper(configs);
  const maxListeners = Number(getVal('maxListenersPerEvent')) || 50;
  const eventTtlMs = Number(getVal('eventTtlMs')) || 300000;
  const enableDeadLetter = getVal('enableDeadLetterQueue') === 'true';

  return (
    <div className="space-y-3">
      <PageCard title="事件总线参数" icon={<span className="text-xs">📡</span>} compact>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">每事件最大监听器</label>
            <Input type="number" value={maxListeners}
              onChange={(e) => { const c = getConfig('maxListenersPerEvent'); if (c) onUpdate(c.id, e.target.value); }}
              className="h-6 text-[10px] font-mono" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">事件 TTL</label>
            <div className="flex items-center gap-1">
              <Input type="number" value={eventTtlMs / 60000}
                onChange={(e) => { const c = getConfig('eventTtlMs'); if (c) onUpdate(c.id, String(Number(e.target.value) * 60000)); }}
                className="h-6 text-[10px] font-mono w-16" />
              <span className="text-[9px] text-muted-foreground">分钟</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium">死信队列</label>
              <Switch checked={enableDeadLetter}
                onCheckedChange={(v) => { const c = getConfig('enableDeadLetterQueue'); if (c) onUpdate(c.id, String(v)); }}
                className="scale-[0.6]" />
            </div>
            <div className="text-[8px] text-muted-foreground">
              {enableDeadLetter ? '投递失败的事件进入死信队列' : '投递失败直接丢弃'}
            </div>
          </div>
        </div>
      </PageCard>
      {/* 事件类型一览 */}
      <PageCard title="已注册事件类型" icon={<span className="text-xs">📋</span>} compact>
        <div className="flex flex-wrap gap-1">
          {['STATE_UPDATED', 'PREDICTION_READY', 'ANOMALY_DETECTED', 'SYNC_DEGRADED',
            'INSTANCE_CREATED', 'INSTANCE_DESTROYED', 'MIGRATING', 'MIGRATED',
            'HEALTH_CHECK', 'CONFIG_CHANGED', 'SIMULATION_COMPLETE', 'FEEDBACK_APPLIED', 'ALERT_TRIGGERED'
          ].map(evt => (
            <Badge key={evt} variant="outline" className="text-[7px] font-mono">{evt}</Badge>
          ))}
        </div>
      </PageCard>
    </div>
  );
}

/* ============================================================================
 * OutboxRelay (P2)
 * ============================================================================ */
export function OutboxRelayPanel({ configs, onUpdate }: PanelProps) {
  const { getConfig, getVal } = useConfigHelper(configs);
  const pollIntervalMs = Number(getVal('outboxPollIntervalMs')) || 5000;
  const batchSize = Number(getVal('outboxBatchSize')) || 50;
  const maxRetries = Number(getVal('outboxMaxRetries')) || 5;
  const retryBackoffMs = Number(getVal('outboxRetryBackoffMs')) || 1000;

  return (
    <div className="space-y-3">
      <PageCard title="Outbox 投递参数" icon={<span className="text-xs">📤</span>} compact>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">轮询间隔</label>
            <div className="flex items-center gap-1">
              <Input type="number" value={pollIntervalMs / 1000}
                onChange={(e) => { const c = getConfig('outboxPollIntervalMs'); if (c) onUpdate(c.id, String(Number(e.target.value) * 1000)); }}
                className="h-6 text-[10px] font-mono w-16" />
              <span className="text-[9px] text-muted-foreground">秒</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">批量大小</label>
            <Input type="number" value={batchSize}
              onChange={(e) => { const c = getConfig('outboxBatchSize'); if (c) onUpdate(c.id, e.target.value); }}
              className="h-6 text-[10px] font-mono" />
          </div>
        </div>
      </PageCard>
      <PageCard title="重试策略" icon={<span className="text-xs">🔄</span>} compact>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">最大重试次数</label>
            <Input type="number" value={maxRetries}
              onChange={(e) => { const c = getConfig('outboxMaxRetries'); if (c) onUpdate(c.id, e.target.value); }}
              className="h-6 text-[10px] font-mono" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">退避基数</label>
            <div className="flex items-center gap-1">
              <Input type="number" value={retryBackoffMs}
                onChange={(e) => { const c = getConfig('outboxRetryBackoffMs'); if (c) onUpdate(c.id, e.target.value); }}
                className="h-6 text-[10px] font-mono w-20" />
              <span className="text-[9px] text-muted-foreground">ms</span>
            </div>
          </div>
        </div>
        {/* 退避可视化 */}
        <div className="mt-2 p-2 bg-muted/20 rounded">
          <div className="text-[8px] text-muted-foreground mb-1">指数退避时间线</div>
          <div className="flex items-end gap-1 h-8">
            {Array.from({ length: maxRetries }).map((_, i) => {
              const delay = retryBackoffMs * Math.pow(2, i);
              const maxDelay = retryBackoffMs * Math.pow(2, maxRetries - 1);
              return (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div className="bg-primary/60 rounded-t w-full" style={{ height: `${(delay / maxDelay) * 28}px` }} />
                  <span className="text-[6px] text-muted-foreground mt-0.5">
                    {delay >= 1000 ? `${(delay / 1000).toFixed(0)}s` : `${delay}ms`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </PageCard>
    </div>
  );
}

/* ============================================================================
 * BullMQ 异步任务 (P3)
 * ============================================================================ */
export function BullMQPanel({ configs, onUpdate }: PanelProps) {
  const { getConfig, getVal } = useConfigHelper(configs);
  const concurrency = Number(getVal('bullmqConcurrency')) || 5;
  const maxRetries = Number(getVal('bullmqMaxRetries')) || 3;
  const jobTimeoutMs = Number(getVal('bullmqJobTimeoutMs')) || 300000;
  const removeOnComplete = getVal('bullmqRemoveOnComplete') === 'true';

  return (
    <div className="space-y-3">
      <PageCard title="BullMQ 队列参数" icon={<span className="text-xs">🐂</span>} compact>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">Worker 并发数</label>
            <Input type="number" value={concurrency}
              onChange={(e) => { const c = getConfig('bullmqConcurrency'); if (c) onUpdate(c.id, e.target.value); }}
              className="h-6 text-[10px] font-mono" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">最大重试</label>
            <Input type="number" value={maxRetries}
              onChange={(e) => { const c = getConfig('bullmqMaxRetries'); if (c) onUpdate(c.id, e.target.value); }}
              className="h-6 text-[10px] font-mono" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">任务超时</label>
            <div className="flex items-center gap-1">
              <Input type="number" value={jobTimeoutMs / 1000}
                onChange={(e) => { const c = getConfig('bullmqJobTimeoutMs'); if (c) onUpdate(c.id, String(Number(e.target.value) * 1000)); }}
                className="h-6 text-[10px] font-mono w-16" />
              <span className="text-[9px] text-muted-foreground">秒</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium">完成后清理</label>
              <Switch checked={removeOnComplete}
                onCheckedChange={(v) => { const c = getConfig('bullmqRemoveOnComplete'); if (c) onUpdate(c.id, String(v)); }}
                className="scale-[0.6]" />
            </div>
          </div>
        </div>
      </PageCard>
    </div>
  );
}

/* ============================================================================
 * UncertaintyQuantifier 不确定性量化 (P2)
 * ============================================================================ */
export function UncertaintyPanel({ configs, onUpdate }: PanelProps) {
  const { getConfig, getVal } = useConfigHelper(configs);
  const method = getVal('uncertaintyMethod') || 'bootstrap';
  const bootstrapSamples = Number(getVal('bootstrapSamples')) || 1000;
  const confidenceIntervals = getVal('confidenceIntervals') || '[0.9, 0.95, 0.99]';

  return (
    <div className="space-y-3">
      <PageCard title="不确定性量化" icon={<span className="text-xs">📊</span>} compact>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">量化方法</label>
            <Select value={method}
              onValueChange={(v) => { const c = getConfig('uncertaintyMethod'); if (c) onUpdate(c.id, v); }}>
              <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bootstrap">Bootstrap 重采样</SelectItem>
                <SelectItem value="bayesian">贝叶斯推断</SelectItem>
                <SelectItem value="ensemble">集成方差</SelectItem>
                <SelectItem value="conformal">保形预测</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">Bootstrap 采样数</label>
            <Input type="number" value={bootstrapSamples} disabled={method !== 'bootstrap'}
              onChange={(e) => { const c = getConfig('bootstrapSamples'); if (c) onUpdate(c.id, e.target.value); }}
              className="h-6 text-[10px] font-mono" />
          </div>
        </div>
      </PageCard>
      <PageCard title="置信区间" icon={<span className="text-xs">📏</span>} compact>
        <div className="p-2 bg-muted/20 rounded">
          <div className="text-[9px] font-mono text-center">{confidenceIntervals}</div>
          <div className="text-[8px] text-muted-foreground text-center mt-1">
            输出预测值的多级置信区间
          </div>
        </div>
      </PageCard>
    </div>
  );
}

/* ============================================================================
 * VectorStore 向量存储 (P3)
 * ============================================================================ */
export function VectorStorePanel({ configs, onUpdate }: PanelProps) {
  const { getConfig, getVal } = useConfigHelper(configs);
  const dimensions = Number(getVal('vectorDimensions')) || 768;
  const indexType = getVal('vectorIndexType') || 'hnsw';
  const topK = Number(getVal('vectorTopK')) || 10;

  return (
    <div className="space-y-3">
      <PageCard title="向量存储参数" icon={<span className="text-xs">🧬</span>} compact>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">向量维度</label>
            <Input type="number" value={dimensions}
              onChange={(e) => { const c = getConfig('vectorDimensions'); if (c) onUpdate(c.id, e.target.value); }}
              className="h-6 text-[10px] font-mono" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">索引类型</label>
            <Select value={indexType}
              onValueChange={(v) => { const c = getConfig('vectorIndexType'); if (c) onUpdate(c.id, v); }}>
              <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hnsw">HNSW</SelectItem>
                <SelectItem value="ivf_flat">IVF Flat</SelectItem>
                <SelectItem value="brute_force">暴力搜索</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">Top-K</label>
            <Input type="number" value={topK}
              onChange={(e) => { const c = getConfig('vectorTopK'); if (c) onUpdate(c.id, e.target.value); }}
              className="h-6 text-[10px] font-mono" />
          </div>
        </div>
      </PageCard>
    </div>
  );
}

/* ============================================================================
 * DataCollection 数据采集层 (P2)
 * ============================================================================ */
export function DataCollectionPanel({ configs, onUpdate }: PanelProps) {
  const { getConfig, getVal } = useConfigHelper(configs);
  const adaptiveEnabled = getVal('adaptiveSamplingEnabled') === 'true';
  const adaptiveStrategy = getVal('adaptiveStrategy') || 'linear';
  const defaultSamplingRateHz = Number(getVal('defaultSamplingRateHz')) || 1;
  const maxSamplingRateHz = Number(getVal('maxSamplingRateHz')) || 100;

  return (
    <div className="space-y-3">
      <PageCard title="采样参数" icon={<span className="text-xs">📡</span>} compact>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">默认采样率</label>
            <div className="flex items-center gap-1">
              <Input type="number" value={defaultSamplingRateHz}
                onChange={(e) => { const c = getConfig('defaultSamplingRateHz'); if (c) onUpdate(c.id, e.target.value); }}
                className="h-6 text-[10px] font-mono w-16" />
              <span className="text-[9px] text-muted-foreground">Hz</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">最大采样率</label>
            <div className="flex items-center gap-1">
              <Input type="number" value={maxSamplingRateHz}
                onChange={(e) => { const c = getConfig('maxSamplingRateHz'); if (c) onUpdate(c.id, e.target.value); }}
                className="h-6 text-[10px] font-mono w-16" />
              <span className="text-[9px] text-muted-foreground">Hz</span>
            </div>
          </div>
        </div>
      </PageCard>
      <PageCard title="自适应采样" icon={<span className="text-xs">🎯</span>} compact>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium">自适应采样</label>
              <Switch checked={adaptiveEnabled}
                onCheckedChange={(v) => { const c = getConfig('adaptiveSamplingEnabled'); if (c) onUpdate(c.id, String(v)); }}
                className="scale-[0.6]" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">自适应策略</label>
            <Select value={adaptiveStrategy} disabled={!adaptiveEnabled}
              onValueChange={(v) => { const c = getConfig('adaptiveStrategy'); if (c) onUpdate(c.id, v); }}>
              <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="linear">线性</SelectItem>
                <SelectItem value="exponential">指数</SelectItem>
                <SelectItem value="ml_based">ML 自适应</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </PageCard>
    </div>
  );
}
