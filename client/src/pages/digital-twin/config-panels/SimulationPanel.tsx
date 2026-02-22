/**
 * SimulationEngine 专属配置面板 (P0+)
 * 
 * 仿真方法选择、蒙特卡洛参数、Sobol 序列、风险评估阈值
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

export default function SimulationPanel({ configs, onUpdate, onReset }: Props) {
  const getConfig = (key: string) => configs.find(c => c.configKey === key);
  const getVal = (key: string): string => {
    const c = getConfig(key);
    if (!c) return '';
    const v = c.configValue;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  };

  const monteCarloSamples = Number(getVal('monteCarloSamples')) || 10000;
  const convergenceThreshold = Number(getVal('convergenceThreshold')) || 0.01;
  const sobolDimensions = Number(getVal('sobolDimensions')) || 8;
  const sobolSkip = Number(getVal('sobolSkip')) || 1024;
  const riskHighThreshold = Number(getVal('riskHighThreshold')) || 0.8;
  const riskMediumThreshold = Number(getVal('riskMediumThreshold')) || 0.5;
  const anomalyZScoreThreshold = Number(getVal('anomalyZScoreThreshold')) || 3.0;
  const maxConcurrentSims = Number(getVal('maxConcurrentSims')) || 4;
  const timeoutMs = Number(getVal('simTimeoutMs')) || 120000;

  const methods = [
    { key: 'monte_carlo', label: '蒙特卡洛', desc: '随机采样，适用于复杂非线性系统', icon: '🎲', samples: monteCarloSamples },
    { key: 'deterministic', label: '确定性仿真', desc: '固定参数，适用于线性系统验证', icon: '📐', samples: 1 },
    { key: 'quasi_monte_carlo', label: '准蒙特卡洛 (Sobol)', desc: 'Sobol 低差异序列，收敛更快', icon: '🔢', samples: monteCarloSamples },
  ];

  return (
    <div className="space-y-3">
      {/* 仿真方法 */}
      <PageCard title="仿真方法" icon={<span className="text-xs">🧪</span>} compact>
        <div className="space-y-2">
          {methods.map(m => (
            <div key={m.key} className="flex items-center gap-2 p-2 bg-muted/20 rounded">
              <span className="text-sm">{m.icon}</span>
              <div className="flex-1">
                <div className="text-[10px] font-semibold">{m.label}</div>
                <div className="text-[8px] text-muted-foreground">{m.desc}</div>
              </div>
              <Badge variant="outline" className="text-[8px]">
                {m.samples.toLocaleString()} 样本
              </Badge>
            </div>
          ))}
        </div>
      </PageCard>

      {/* 蒙特卡洛参数 */}
      <PageCard title="蒙特卡洛参数" icon={<span className="text-xs">🎲</span>} compact>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">采样数量</label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={monteCarloSamples}
                onChange={(e) => {
                  const c = getConfig('monteCarloSamples');
                  if (c) onUpdate(c.id, e.target.value);
                }}
                className="h-6 text-[10px] font-mono w-24"
                step={1000}
              />
              <span className="text-[9px] text-muted-foreground">次</span>
            </div>
            <div className="text-[8px] text-muted-foreground">
              越大精度越高，但计算时间越长
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-medium">收敛阈值</label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={convergenceThreshold}
                onChange={(e) => {
                  const c = getConfig('convergenceThreshold');
                  if (c) onUpdate(c.id, e.target.value);
                }}
                className="h-6 text-[10px] font-mono w-24"
                step={0.001}
              />
            </div>
            <div className="text-[8px] text-muted-foreground">
              方差变化率低于此值时提前终止
            </div>
          </div>
        </div>
      </PageCard>

      {/* Sobol 序列参数 */}
      <PageCard title="Sobol 准蒙特卡洛" icon={<span className="text-xs">🔢</span>} compact>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">维度数</label>
            <Input
              type="number"
              value={sobolDimensions}
              onChange={(e) => {
                const c = getConfig('sobolDimensions');
                if (c) onUpdate(c.id, e.target.value);
              }}
              className="h-6 text-[10px] font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">跳过前 N 个</label>
            <Input
              type="number"
              value={sobolSkip}
              onChange={(e) => {
                const c = getConfig('sobolSkip');
                if (c) onUpdate(c.id, e.target.value);
              }}
              className="h-6 text-[10px] font-mono"
              step={256}
            />
          </div>
        </div>
      </PageCard>

      {/* 风险评估阈值 */}
      <PageCard title="风险评估阈值" icon={<span className="text-xs">⚠️</span>} compact>
        <div className="space-y-2">
          {/* 风险等级可视化 */}
          <div className="flex items-center gap-0.5 h-4">
            <div
              className="bg-green-400 h-full rounded-l"
              style={{ width: `${riskMediumThreshold * 100}%` }}
            />
            <div
              className="bg-amber-400 h-full"
              style={{ width: `${(riskHighThreshold - riskMediumThreshold) * 100}%` }}
            />
            <div
              className="bg-red-400 h-full rounded-r"
              style={{ width: `${(1 - riskHighThreshold) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-[8px]">
            <span className="text-green-600">低风险 (0-{(riskMediumThreshold * 100).toFixed(0)}%)</span>
            <span className="text-amber-600">中风险 ({(riskMediumThreshold * 100).toFixed(0)}-{(riskHighThreshold * 100).toFixed(0)}%)</span>
            <span className="text-red-600">高风险 (&gt;{(riskHighThreshold * 100).toFixed(0)}%)</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-0.5">
              <label className="text-[9px] font-medium">中风险阈值</label>
              <Input
                type="number"
                value={riskMediumThreshold}
                onChange={(e) => {
                  const c = getConfig('riskMediumThreshold');
                  if (c) onUpdate(c.id, e.target.value);
                }}
                className="h-5 text-[9px] font-mono"
                step={0.05}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-[9px] font-medium">高风险阈值</label>
              <Input
                type="number"
                value={riskHighThreshold}
                onChange={(e) => {
                  const c = getConfig('riskHighThreshold');
                  if (c) onUpdate(c.id, e.target.value);
                }}
                className="h-5 text-[9px] font-mono"
                step={0.05}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-[9px] font-medium">异常 Z-Score</label>
              <Input
                type="number"
                value={anomalyZScoreThreshold}
                onChange={(e) => {
                  const c = getConfig('anomalyZScoreThreshold');
                  if (c) onUpdate(c.id, e.target.value);
                }}
                className="h-5 text-[9px] font-mono"
                step={0.5}
              />
            </div>
          </div>
        </div>
      </PageCard>

      {/* 并发与超时 */}
      <PageCard title="并发与超时" icon={<span className="text-xs">⏱️</span>} compact>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">最大并发仿真</label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={maxConcurrentSims}
                onChange={(e) => {
                  const c = getConfig('maxConcurrentSims');
                  if (c) onUpdate(c.id, e.target.value);
                }}
                className="h-6 text-[10px] font-mono w-16"
              />
              <span className="text-[9px] text-muted-foreground">个</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">单次超时</label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={timeoutMs / 1000}
                onChange={(e) => {
                  const c = getConfig('simTimeoutMs');
                  if (c) onUpdate(c.id, String(Number(e.target.value) * 1000));
                }}
                className="h-6 text-[10px] font-mono w-16"
              />
              <span className="text-[9px] text-muted-foreground">秒</span>
            </div>
          </div>
        </div>
      </PageCard>
    </div>
  );
}
