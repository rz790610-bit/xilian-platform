/**
 * ExperiencePool 专属配置面板 (P1)
 * 
 * 经验池容量管理、衰减策略、相似度阈值
 */
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ConfigItem {
  id: number; module: string; configKey: string; configValue: unknown;
  defaultValue: unknown; label: string | null; unit: string | null;
  configGroup: string | null; constraints: unknown; description: string | null; enabled: number;
}
interface Props {
  configs: ConfigItem[];
  onUpdate: (id: number, value: string, reason?: string) => void;
  onReset: (id: number) => void;
}

export default function ExperiencePoolPanel({ configs, onUpdate }: Props) {
  const getConfig = (key: string) => configs.find(c => c.configKey === key);
  const getVal = (key: string): string => {
    const c = getConfig(key);
    if (!c) return '';
    const v = c.configValue;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  };

  const softLimit = Number(getVal('softLimit')) || 8000;
  const hardLimit = Number(getVal('hardLimit')) || 10000;
  const decayStrategy = getVal('decayStrategy') || 'exponential';
  const decayHalfLifeMs = Number(getVal('decayHalfLifeMs')) || 86400000;
  const similarityThreshold = Number(getVal('similarityThreshold')) || 0.85;
  const minConfidence = Number(getVal('minConfidence')) || 0.6;

  return (
    <div className="space-y-3">
      {/* 容量管理 */}
      <PageCard title="容量管理" icon={<span className="text-xs">📦</span>} compact>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium">软上限</label>
              <div className="flex items-center gap-1">
                <Input type="number" value={softLimit}
                  onChange={(e) => { const c = getConfig('softLimit'); if (c) onUpdate(c.id, e.target.value); }}
                  className="h-6 text-[10px] font-mono w-24" />
                <span className="text-[9px] text-muted-foreground">条</span>
              </div>
              <div className="text-[8px] text-muted-foreground">超过后触发衰减淘汰</div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium">硬上限</label>
              <div className="flex items-center gap-1">
                <Input type="number" value={hardLimit}
                  onChange={(e) => { const c = getConfig('hardLimit'); if (c) onUpdate(c.id, e.target.value); }}
                  className="h-6 text-[10px] font-mono w-24" />
                <span className="text-[9px] text-muted-foreground">条</span>
              </div>
              <div className="text-[8px] text-muted-foreground">超过后强制删除最旧记录</div>
            </div>
          </div>
          {/* 容量可视化 */}
          <div className="p-2 bg-muted/30 rounded">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-muted-foreground">经验池容量</span>
              <span className="text-[9px] font-mono">0 / {hardLimit.toLocaleString()}</span>
            </div>
            <div className="relative w-full bg-muted rounded-full h-2">
              <div className="absolute bg-blue-400 h-2 rounded-full" style={{ width: '0%' }} />
              <div className="absolute h-2 border-r-2 border-amber-500" style={{ left: `${(softLimit / hardLimit) * 100}%` }} />
            </div>
            <div className="flex justify-between text-[8px] mt-0.5">
              <span>0</span>
              <span className="text-amber-600">软上限 {softLimit.toLocaleString()}</span>
              <span className="text-red-600">硬上限 {hardLimit.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </PageCard>

      {/* 衰减策略 */}
      <PageCard title="衰减策略" icon={<span className="text-xs">📉</span>} compact>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium">衰减方式</label>
              <Select value={decayStrategy}
                onValueChange={(v) => { const c = getConfig('decayStrategy'); if (c) onUpdate(c.id, v); }}>
                <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="exponential">指数衰减</SelectItem>
                  <SelectItem value="linear">线性衰减</SelectItem>
                  <SelectItem value="step">阶梯衰减</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium">半衰期</label>
              <div className="flex items-center gap-1">
                <Input type="number" value={decayHalfLifeMs / 3600000}
                  onChange={(e) => { const c = getConfig('decayHalfLifeMs'); if (c) onUpdate(c.id, String(Number(e.target.value) * 3600000)); }}
                  className="h-6 text-[10px] font-mono w-16" />
                <span className="text-[9px] text-muted-foreground">小时</span>
              </div>
            </div>
          </div>
          {/* 衰减曲线示意 */}
          <div className="p-2 bg-muted/20 rounded">
            <div className="text-[9px] font-medium mb-1">衰减曲线预览</div>
            <svg viewBox="0 0 200 60" className="w-full h-12">
              <path d={decayStrategy === 'exponential'
                ? 'M 10 10 Q 60 12 100 30 T 190 55'
                : decayStrategy === 'linear'
                ? 'M 10 10 L 190 55'
                : 'M 10 10 L 60 10 L 60 25 L 120 25 L 120 40 L 190 40 L 190 55'}
                fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
              <text x="10" y="58" className="text-[6px] fill-muted-foreground">0h</text>
              <text x="90" y="58" className="text-[6px] fill-muted-foreground">{(decayHalfLifeMs / 3600000).toFixed(0)}h</text>
              <text x="170" y="58" className="text-[6px] fill-muted-foreground">{(decayHalfLifeMs / 1800000).toFixed(0)}h</text>
            </svg>
          </div>
        </div>
      </PageCard>

      {/* 匹配参数 */}
      <PageCard title="匹配参数" icon={<span className="text-xs">🔍</span>} compact>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">相似度阈值</label>
            <div className="flex items-center gap-1">
              <input type="range" min={0.5} max={1.0} step={0.01} value={similarityThreshold}
                onChange={(e) => { const c = getConfig('similarityThreshold'); if (c) onUpdate(c.id, e.target.value); }}
                className="flex-1 h-1 accent-primary" />
              <span className="text-[9px] font-mono w-10 text-right">{similarityThreshold}</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">最低置信度</label>
            <div className="flex items-center gap-1">
              <input type="range" min={0.1} max={1.0} step={0.05} value={minConfidence}
                onChange={(e) => { const c = getConfig('minConfidence'); if (c) onUpdate(c.id, e.target.value); }}
                className="flex-1 h-1 accent-primary" />
              <span className="text-[9px] font-mono w-10 text-right">{minConfidence}</span>
            </div>
          </div>
        </div>
      </PageCard>
    </div>
  );
}
