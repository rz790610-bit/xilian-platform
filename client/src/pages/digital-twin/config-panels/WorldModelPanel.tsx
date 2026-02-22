/**
 * WorldModel 专属配置面板
 * 
 * 预测窗口滑块、快照策略、LRU 缓存、统计模型参数
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

export default function WorldModelPanel({ configs, onUpdate, onReset }: Props) {
  const getConfig = (key: string) => configs.find(c => c.configKey === key);
  const getVal = (key: string): string => {
    const c = getConfig(key);
    if (!c) return '';
    const v = c.configValue;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  };

  const predictionHorizon = Number(getVal('predictionHorizonMs')) || 300000;
  const snapshotIntervalMs = Number(getVal('snapshotIntervalMs')) || 60000;
  const maxInstances = Number(getVal('maxInstances')) || 1000;
  const ttlMs = Number(getVal('ttlMs')) || 3600000;
  const enablePersistence = getVal('enablePersistence') === 'true';

  return (
    <div className="space-y-3">
      {/* 预测窗口 */}
      <PageCard title="预测窗口" icon={<span className="text-xs">🔮</span>} compact>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium">预测时间窗口</span>
            <span className="text-[11px] font-mono font-semibold text-primary">
              {(predictionHorizon / 60000).toFixed(1)} 分钟
            </span>
          </div>
          <input
            type="range"
            min={60000}
            max={1800000}
            step={30000}
            value={predictionHorizon}
            onChange={(e) => {
              const c = getConfig('predictionHorizonMs');
              if (c) onUpdate(c.id, e.target.value);
            }}
            className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-[8px] text-muted-foreground">
            <span>1 分钟</span>
            <span>5 分钟（默认）</span>
            <span>30 分钟</span>
          </div>
          <div className="grid grid-cols-4 gap-1 mt-1">
            {[60000, 300000, 600000, 1800000].map(v => (
              <button
                key={v}
                onClick={() => {
                  const c = getConfig('predictionHorizonMs');
                  if (c) onUpdate(c.id, String(v));
                }}
                className={`px-2 py-0.5 rounded text-[9px] border transition-colors ${
                  predictionHorizon === v
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                {v / 60000}min
              </button>
            ))}
          </div>
        </div>
      </PageCard>

      {/* 快照与持久化 */}
      <PageCard title="快照与持久化" icon={<span className="text-xs">💾</span>} compact>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
            <div>
              <div className="text-[10px] font-medium">启用持久化</div>
              <div className="text-[9px] text-muted-foreground">
                定期将 WorldModel 状态快照写入数据库
              </div>
            </div>
            <Switch
              checked={enablePersistence}
              onCheckedChange={(checked) => {
                const c = getConfig('enablePersistence');
                if (c) onUpdate(c.id, String(checked));
              }}
              className="scale-[0.7]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium">快照间隔</label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={snapshotIntervalMs / 1000}
                  onChange={(e) => {
                    const c = getConfig('snapshotIntervalMs');
                    if (c) onUpdate(c.id, String(Number(e.target.value) * 1000));
                  }}
                  className="h-6 text-[10px] font-mono w-20"
                  disabled={!enablePersistence}
                />
                <span className="text-[9px] text-muted-foreground">秒</span>
              </div>
            </div>
          </div>
        </div>
      </PageCard>

      {/* LRU 缓存管理 */}
      <PageCard title="实例缓存 (LRU)" icon={<span className="text-xs">🗃️</span>} compact>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">最大实例数</label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={maxInstances}
                onChange={(e) => {
                  const c = getConfig('maxInstances');
                  if (c) onUpdate(c.id, e.target.value);
                }}
                className="h-6 text-[10px] font-mono w-20"
              />
              <span className="text-[9px] text-muted-foreground">个</span>
            </div>
            <div className="text-[8px] text-muted-foreground">
              超过上限时 LRU 淘汰最久未访问的实例
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-medium">实例 TTL</label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={ttlMs / 60000}
                onChange={(e) => {
                  const c = getConfig('ttlMs');
                  if (c) onUpdate(c.id, String(Number(e.target.value) * 60000));
                }}
                className="h-6 text-[10px] font-mono w-20"
              />
              <span className="text-[9px] text-muted-foreground">分钟</span>
            </div>
            <div className="text-[8px] text-muted-foreground">
              实例空闲超过此时间自动销毁
            </div>
          </div>
        </div>

        {/* 缓存状态可视化 */}
        <div className="mt-2 p-2 bg-muted/30 rounded">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-muted-foreground">缓存容量</span>
            <span className="text-[9px] font-mono">0 / {maxInstances}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div className="bg-violet-500 h-1.5 rounded-full" style={{ width: '0%' }} />
          </div>
        </div>
      </PageCard>

      {/* 统计模型参数 */}
      <PageCard title="统计模型参数" icon={<span className="text-xs">📈</span>} compact>
        <div className="grid grid-cols-3 gap-2">
          {configs.filter(c => c.configGroup === 'statisticalModel').map(c => (
            <div key={c.id} className="space-y-0.5">
              <label className="text-[9px] font-medium">{c.label ?? c.configKey}</label>
              <Input
                type="number"
                value={typeof c.configValue === 'number' ? c.configValue : String(c.configValue ?? '')}
                onChange={(e) => onUpdate(c.id, e.target.value)}
                className="h-5 text-[9px] font-mono"
                step="0.01"
              />
              {c.unit && <span className="text-[8px] text-muted-foreground">{c.unit}</span>}
            </div>
          ))}
        </div>
      </PageCard>
    </div>
  );
}
