/**
 * GrokEnhancer 专属配置面板 (P0+)
 * 
 * 熔断器控制、令牌桶限流、模型选择、成本预算
 */
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

export default function GrokEnhancerPanel({ configs, onUpdate, onReset }: Props) {
  const getConfig = (key: string) => configs.find(c => c.configKey === key);
  const getVal = (key: string): string => {
    const c = getConfig(key);
    if (!c) return '';
    const v = c.configValue;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  };

  const circuitBreakerEnabled = getVal('circuitBreaker.enabled') !== 'false';
  const failureThreshold = Number(getVal('circuitBreaker.failureThreshold')) || 5;
  const resetTimeoutMs = Number(getVal('circuitBreaker.resetTimeoutMs')) || 30000;
  const halfOpenMax = Number(getVal('circuitBreaker.halfOpenMaxRequests')) || 2;
  
  const rateLimitEnabled = getVal('rateLimit.enabled') !== 'false';
  const tokensPerMinute = Number(getVal('rateLimit.tokensPerMinute')) || 60;
  const burstSize = Number(getVal('rateLimit.burstSize')) || 10;
  
  const dailyBudget = Number(getVal('dailyGrokBudget')) || 500;
  const modelVersion = getVal('modelVersion') || 'grok-2';
  const temperature = Number(getVal('temperature')) || 0.3;
  const topP = Number(getVal('topP')) || 0.9;
  const maxTokens = Number(getVal('maxTokens')) || 4096;

  return (
    <div className="space-y-3">
      {/* 熔断器 */}
      <PageCard title="熔断器 (Circuit Breaker)" icon={<span className="text-xs">🔌</span>} compact>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
            <div>
              <div className="text-[10px] font-medium">启用熔断器</div>
              <div className="text-[9px] text-muted-foreground">
                连续失败超过阈值时自动断开 Grok API 调用
              </div>
            </div>
            <Switch
              checked={circuitBreakerEnabled}
              onCheckedChange={(checked) => {
                const c = getConfig('circuitBreaker.enabled');
                if (c) onUpdate(c.id, String(checked));
              }}
              className="scale-[0.7]"
            />
          </div>

          {circuitBreakerEnabled && (
            <>
              {/* 熔断器状态可视化 */}
              <div className="flex items-center justify-center gap-3 py-2">
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mb-0.5">
                    <span className="text-sm">✅</span>
                  </div>
                  <span className="text-[8px] font-medium text-green-600">CLOSED</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[8px] text-muted-foreground">失败 ≥{failureThreshold}次</span>
                  <span className="text-muted-foreground">→</span>
                </div>
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mb-0.5">
                    <span className="text-sm">🔴</span>
                  </div>
                  <span className="text-[8px] font-medium text-red-600">OPEN</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[8px] text-muted-foreground">{resetTimeoutMs / 1000}s 后</span>
                  <span className="text-muted-foreground">→</span>
                </div>
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mb-0.5">
                    <span className="text-sm">🟡</span>
                  </div>
                  <span className="text-[8px] font-medium text-amber-600">HALF-OPEN</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-0.5">
                  <label className="text-[9px] font-medium">失败阈值</label>
                  <Input
                    type="number"
                    value={failureThreshold}
                    onChange={(e) => {
                      const c = getConfig('circuitBreaker.failureThreshold');
                      if (c) onUpdate(c.id, e.target.value);
                    }}
                    className="h-5 text-[9px] font-mono"
                  />
                </div>
                <div className="space-y-0.5">
                  <label className="text-[9px] font-medium">重置超时</label>
                  <div className="flex items-center gap-0.5">
                    <Input
                      type="number"
                      value={resetTimeoutMs / 1000}
                      onChange={(e) => {
                        const c = getConfig('circuitBreaker.resetTimeoutMs');
                        if (c) onUpdate(c.id, String(Number(e.target.value) * 1000));
                      }}
                      className="h-5 text-[9px] font-mono"
                    />
                    <span className="text-[8px]">s</span>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <label className="text-[9px] font-medium">半开最大请求</label>
                  <Input
                    type="number"
                    value={halfOpenMax}
                    onChange={(e) => {
                      const c = getConfig('circuitBreaker.halfOpenMaxRequests');
                      if (c) onUpdate(c.id, e.target.value);
                    }}
                    className="h-5 text-[9px] font-mono"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </PageCard>

      {/* 令牌桶限流 */}
      <PageCard title="令牌桶限流 (Rate Limiter)" icon={<span className="text-xs">🪣</span>} compact>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
            <div>
              <div className="text-[10px] font-medium">启用限流</div>
              <div className="text-[9px] text-muted-foreground">
                控制 Grok API 调用频率，防止超额消费
              </div>
            </div>
            <Switch
              checked={rateLimitEnabled}
              onCheckedChange={(checked) => {
                const c = getConfig('rateLimit.enabled');
                if (c) onUpdate(c.id, String(checked));
              }}
              className="scale-[0.7]"
            />
          </div>

          {rateLimitEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium">每分钟令牌数</label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={tokensPerMinute}
                    onChange={(e) => {
                      const c = getConfig('rateLimit.tokensPerMinute');
                      if (c) onUpdate(c.id, e.target.value);
                    }}
                    className="h-6 text-[10px] font-mono w-20"
                  />
                  <span className="text-[9px] text-muted-foreground">次/min</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium">突发容量</label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={burstSize}
                    onChange={(e) => {
                      const c = getConfig('rateLimit.burstSize');
                      if (c) onUpdate(c.id, e.target.value);
                    }}
                    className="h-6 text-[10px] font-mono w-20"
                  />
                  <span className="text-[9px] text-muted-foreground">次</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </PageCard>

      {/* 模型参数 & 成本 */}
      <PageCard title="模型参数 & 成本控制" icon={<span className="text-xs">🤖</span>} compact>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">模型版本</label>
            <Select
              value={modelVersion}
              onValueChange={(v) => {
                const c = getConfig('modelVersion');
                if (c) onUpdate(c.id, v);
              }}
            >
              <SelectTrigger className="h-6 text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="grok-2">Grok-2 (推荐)</SelectItem>
                <SelectItem value="grok-2-mini">Grok-2 Mini (低成本)</SelectItem>
                <SelectItem value="grok-3">Grok-3 (最新)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-medium">每日预算</label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={dailyBudget}
                onChange={(e) => {
                  const c = getConfig('dailyGrokBudget');
                  if (c) onUpdate(c.id, e.target.value);
                }}
                className="h-6 text-[10px] font-mono w-20"
              />
              <span className="text-[9px] text-muted-foreground">次</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-medium">Temperature</label>
            <div className="flex items-center gap-1">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={temperature}
                onChange={(e) => {
                  const c = getConfig('temperature');
                  if (c) onUpdate(c.id, e.target.value);
                }}
                className="flex-1 h-1 accent-primary"
              />
              <span className="text-[9px] font-mono w-8 text-right">{temperature}</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-medium">Top-P</label>
            <div className="flex items-center gap-1">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={topP}
                onChange={(e) => {
                  const c = getConfig('topP');
                  if (c) onUpdate(c.id, e.target.value);
                }}
                className="flex-1 h-1 accent-primary"
              />
              <span className="text-[9px] font-mono w-8 text-right">{topP}</span>
            </div>
          </div>
        </div>

        {/* 成本预估 */}
        <div className="mt-2 p-2 bg-amber-50 rounded">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-amber-700">预估日成本</span>
            <span className="text-[10px] font-semibold text-amber-700">
              ~${((dailyBudget * (modelVersion === 'grok-2-mini' ? 0.002 : modelVersion === 'grok-3' ? 0.01 : 0.005)) * maxTokens / 1000).toFixed(2)}/天
            </span>
          </div>
          <div className="text-[8px] text-amber-600 mt-0.5">
            基于 {dailyBudget} 次调用 × {maxTokens} tokens × {modelVersion} 费率估算
          </div>
        </div>
      </PageCard>
    </div>
  );
}
