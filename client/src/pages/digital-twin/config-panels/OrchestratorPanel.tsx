/**
 * HybridOrchestrator 专属配置面板
 * 
 * 路由策略选择、成本门控、并发控制、超时配置
 */
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

interface ConfigItem {
  id: number;
  module: string;
  configKey: string;
  configValue: unknown;
  defaultValue: unknown;
  label: string | null;
  unit: string | null;
  configGroup: string | null;
  constraints: unknown;
  description: string | null;
  enabled: number;
}

interface Props {
  configs: ConfigItem[];
  onUpdate: (id: number, value: string, reason?: string) => void;
  onReset: (id: number) => void;
}

export default function OrchestratorPanel({ configs, onUpdate, onReset }: Props) {
  const getConfig = (key: string) => configs.find(c => c.configKey === key);
  const getVal = (key: string): string => {
    const c = getConfig(key);
    if (!c) return '';
    const v = c.configValue;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  };

  const routingStrategy = getVal('routing.strategy') || 'cost_aware';
  const costThreshold = Number(getVal('routing.costThreshold')) || 0.7;
  const maxConcurrent = Number(getVal('concurrency.maxConcurrent')) || 10;
  const queueSize = Number(getVal('concurrency.queueSize')) || 100;
  const enableCostGating = getVal('routing.enableCostGating') === 'true';
  const timeoutMs = Number(getVal('timeoutMs')) || 30000;

  const strategies = [
    { key: 'cost_aware', label: '成本感知', desc: '优先选择低成本推理路径，平衡精度与成本', icon: '💰', color: 'emerald' },
    { key: 'accuracy_first', label: '精度优先', desc: '选择最高精度路径，不考虑成本', icon: '🎯', color: 'blue' },
    { key: 'latency_first', label: '延迟优先', desc: '选择最快响应路径，适用于实时场景', icon: '⚡', color: 'amber' },
    { key: 'round_robin', label: '轮询', desc: '均匀分配到各推理引擎', icon: '🔄', color: 'gray' },
  ];

  return (
    <div className="space-y-3">
      {/* 路由策略 */}
      <PageCard title="路由策略" icon={<span className="text-xs">🧭</span>} compact>
        <div className="grid grid-cols-2 gap-2">
          {strategies.map(s => (
            <button
              key={s.key}
              onClick={() => {
                const c = getConfig('routing.strategy');
                if (c) onUpdate(c.id, s.key);
              }}
              className={`p-2.5 rounded border-2 transition-all text-left ${
                routingStrategy === s.key
                  ? `border-${s.color}-500 bg-${s.color}-50`
                  : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-sm">{s.icon}</span>
                <span className="text-[10px] font-semibold">{s.label}</span>
                {routingStrategy === s.key && (
                  <Badge variant="outline" className="text-[7px] ml-auto">当前</Badge>
                )}
              </div>
              <p className="text-[8px] text-muted-foreground">{s.desc}</p>
            </button>
          ))}
        </div>
      </PageCard>

      {/* 成本门控 */}
      <PageCard title="成本门控" icon={<span className="text-xs">💰</span>} compact>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
            <div>
              <div className="text-[10px] font-medium">启用成本门控</div>
              <div className="text-[9px] text-muted-foreground">
                推理成本超过阈值时自动降级到低成本路径
              </div>
            </div>
            <Switch
              checked={enableCostGating}
              onCheckedChange={(checked) => {
                const c = getConfig('routing.enableCostGating');
                if (c) onUpdate(c.id, String(checked));
              }}
              className="scale-[0.7]"
            />
          </div>

          {enableCostGating && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-medium">成本阈值</label>
                <span className="text-[11px] font-mono font-semibold text-primary">
                  {(costThreshold * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={costThreshold}
                onChange={(e) => {
                  const c = getConfig('routing.costThreshold');
                  if (c) onUpdate(c.id, e.target.value);
                }}
                className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[8px] text-muted-foreground">
                <span>10%（严格）</span>
                <span>70%（默认）</span>
                <span>100%（宽松）</span>
              </div>
            </div>
          )}
        </div>
      </PageCard>

      {/* 并发控制 */}
      <PageCard title="并发控制" icon={<span className="text-xs">🔧</span>} compact>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">最大并发</label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={maxConcurrent}
                onChange={(e) => {
                  const c = getConfig('concurrency.maxConcurrent');
                  if (c) onUpdate(c.id, e.target.value);
                }}
                className="h-6 text-[10px] font-mono w-16"
              />
              <span className="text-[9px] text-muted-foreground">个</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-medium">队列大小</label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={queueSize}
                onChange={(e) => {
                  const c = getConfig('concurrency.queueSize');
                  if (c) onUpdate(c.id, e.target.value);
                }}
                className="h-6 text-[10px] font-mono w-16"
              />
              <span className="text-[9px] text-muted-foreground">条</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-medium">超时时间</label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={timeoutMs / 1000}
                onChange={(e) => {
                  const c = getConfig('timeoutMs');
                  if (c) onUpdate(c.id, String(Number(e.target.value) * 1000));
                }}
                className="h-6 text-[10px] font-mono w-16"
              />
              <span className="text-[9px] text-muted-foreground">秒</span>
            </div>
          </div>
        </div>

        {/* 并发状态可视化 */}
        <div className="mt-2 p-2 bg-muted/30 rounded space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground">并发使用率</span>
            <span className="text-[9px] font-mono">0 / {maxConcurrent}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: '0%' }} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground">队列深度</span>
            <span className="text-[9px] font-mono">0 / {queueSize}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: '0%' }} />
          </div>
        </div>
      </PageCard>

      {/* 路由决策流程图 */}
      <PageCard title="路由决策流程" icon={<span className="text-xs">📊</span>} compact>
        <div className="flex items-center justify-center gap-1 py-2 flex-wrap">
          <div className="px-2 py-1 bg-violet-100 text-violet-700 rounded text-[9px] font-medium">
            推理请求
          </div>
          <span className="text-[10px] text-muted-foreground">→</span>
          <div className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-[9px] font-medium">
            {routingStrategy === 'cost_aware' ? '成本评估' :
             routingStrategy === 'accuracy_first' ? '精度评估' :
             routingStrategy === 'latency_first' ? '延迟评估' : '轮询分配'}
          </div>
          <span className="text-[10px] text-muted-foreground">→</span>
          {enableCostGating && (
            <>
              <div className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-[9px] font-medium">
                成本门控 ≤{(costThreshold * 100).toFixed(0)}%
              </div>
              <span className="text-[10px] text-muted-foreground">→</span>
            </>
          )}
          <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-[9px] font-medium">
            执行推理
          </div>
        </div>
      </PageCard>
    </div>
  );
}
