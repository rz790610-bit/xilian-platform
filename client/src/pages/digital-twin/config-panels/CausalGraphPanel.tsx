/**
 * CausalGraph 因果推理引擎 专属配置面板 (P1)
 * 
 * 因果图剪枝、推理深度、边权重阈值
 */
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

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

export default function CausalGraphPanel({ configs, onUpdate }: Props) {
  const getConfig = (key: string) => configs.find(c => c.configKey === key);
  const getVal = (key: string): string => {
    const c = getConfig(key);
    if (!c) return '';
    const v = c.configValue;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  };

  const maxDepth = Number(getVal('maxInferenceDepth')) || 5;
  const pruneThreshold = Number(getVal('pruneThreshold')) || 0.1;
  const edgeWeightMin = Number(getVal('edgeWeightMin')) || 0.05;
  const enableCycleDetection = getVal('enableCycleDetection') === 'true';
  const maxNodes = Number(getVal('maxNodes')) || 500;
  const cacheEnabled = getVal('graphCacheEnabled') === 'true';
  const cacheTtlMs = Number(getVal('graphCacheTtlMs')) || 300000;

  return (
    <div className="space-y-3">
      {/* 推理参数 */}
      <PageCard title="推理参数" icon={<span className="text-xs">🧠</span>} compact>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">最大推理深度</label>
            <div className="flex items-center gap-1">
              <Input type="number" value={maxDepth}
                onChange={(e) => { const c = getConfig('maxInferenceDepth'); if (c) onUpdate(c.id, e.target.value); }}
                className="h-6 text-[10px] font-mono w-14" min={1} max={20} />
              <span className="text-[9px] text-muted-foreground">层</span>
            </div>
            <div className="text-[8px] text-muted-foreground">因果链最大追溯深度</div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">剪枝阈值</label>
            <div className="flex items-center gap-1">
              <input type="range" min={0.01} max={0.5} step={0.01} value={pruneThreshold}
                onChange={(e) => { const c = getConfig('pruneThreshold'); if (c) onUpdate(c.id, e.target.value); }}
                className="flex-1 h-1 accent-primary" />
              <span className="text-[9px] font-mono w-8 text-right">{pruneThreshold}</span>
            </div>
            <div className="text-[8px] text-muted-foreground">低于此值的边被剪除</div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">边权重下限</label>
            <div className="flex items-center gap-1">
              <input type="range" min={0.01} max={0.3} step={0.01} value={edgeWeightMin}
                onChange={(e) => { const c = getConfig('edgeWeightMin'); if (c) onUpdate(c.id, e.target.value); }}
                className="flex-1 h-1 accent-primary" />
              <span className="text-[9px] font-mono w-8 text-right">{edgeWeightMin}</span>
            </div>
          </div>
        </div>
      </PageCard>

      {/* 图结构约束 */}
      <PageCard title="图结构约束" icon={<span className="text-xs">🔗</span>} compact>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">最大节点数</label>
            <Input type="number" value={maxNodes}
              onChange={(e) => { const c = getConfig('maxNodes'); if (c) onUpdate(c.id, e.target.value); }}
              className="h-6 text-[10px] font-mono" />
            <div className="text-[8px] text-muted-foreground">超过后自动合并低权重子图</div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium">环路检测</label>
              <Switch checked={enableCycleDetection}
                onCheckedChange={(v) => { const c = getConfig('enableCycleDetection'); if (c) onUpdate(c.id, String(v)); }}
                className="scale-[0.6]" />
            </div>
            <div className="text-[8px] text-muted-foreground">
              {enableCycleDetection ? '检测并阻断因果环路' : '允许环路存在（可能导致推理循环）'}
            </div>
          </div>
        </div>
      </PageCard>

      {/* 缓存设置 */}
      <PageCard title="图缓存" icon={<span className="text-xs">💾</span>} compact>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium">启用缓存</label>
              <Switch checked={cacheEnabled}
                onCheckedChange={(v) => { const c = getConfig('graphCacheEnabled'); if (c) onUpdate(c.id, String(v)); }}
                className="scale-[0.6]" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">缓存 TTL</label>
            <div className="flex items-center gap-1">
              <Input type="number" value={cacheTtlMs / 60000} disabled={!cacheEnabled}
                onChange={(e) => { const c = getConfig('graphCacheTtlMs'); if (c) onUpdate(c.id, String(Number(e.target.value) * 60000)); }}
                className="h-6 text-[10px] font-mono w-16" />
              <span className="text-[9px] text-muted-foreground">分钟</span>
            </div>
          </div>
        </div>
      </PageCard>

      {/* 推理深度可视化 */}
      <PageCard title="推理链路示意" icon={<span className="text-xs">🔮</span>} compact>
        <div className="p-2 bg-muted/20 rounded">
          <svg viewBox="0 0 300 40" className="w-full h-8">
            {Array.from({ length: Math.min(maxDepth, 8) }).map((_, i) => (
              <g key={i}>
                <circle cx={20 + i * 35} cy={20} r={8} fill="none" stroke="currentColor" strokeWidth="1"
                  className={i < maxDepth ? 'text-primary' : 'text-muted'} />
                <text x={20 + i * 35} y={23} textAnchor="middle" className="text-[6px] fill-current">
                  L{i + 1}
                </text>
                {i < Math.min(maxDepth, 8) - 1 && (
                  <line x1={28 + i * 35} y1={20} x2={12 + (i + 1) * 35} y2={20}
                    stroke="currentColor" strokeWidth="1" className="text-primary" markerEnd="url(#arrow)" />
                )}
              </g>
            ))}
            <defs>
              <marker id="arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto">
                <path d="M 0 0 L 6 3 L 0 6 z" fill="currentColor" className="text-primary" />
              </marker>
            </defs>
          </svg>
          <div className="text-[8px] text-center text-muted-foreground">
            因果推理最大 {maxDepth} 层深度 · 剪枝阈值 {pruneThreshold}
          </div>
        </div>
      </PageCard>
    </div>
  );
}
