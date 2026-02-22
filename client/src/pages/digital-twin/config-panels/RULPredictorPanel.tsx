/**
 * RULPredictor 剩余寿命预测器 专属配置面板 (P1)
 * 
 * 预测窗口、告警阈值、模型选择
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
interface Props {
  configs: ConfigItem[];
  onUpdate: (id: number, value: string, reason?: string) => void;
  onReset: (id: number) => void;
}

export default function RULPredictorPanel({ configs, onUpdate }: Props) {
  const getConfig = (key: string) => configs.find(c => c.configKey === key);
  const getVal = (key: string): string => {
    const c = getConfig(key);
    if (!c) return '';
    const v = c.configValue;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  };

  const predictionHorizonDays = Number(getVal('predictionHorizonDays')) || 90;
  const criticalThresholdDays = Number(getVal('criticalThresholdDays')) || 7;
  const warningThresholdDays = Number(getVal('warningThresholdDays')) || 30;
  const confidenceLevel = Number(getVal('confidenceLevel')) || 0.95;
  const modelType = getVal('rulModelType') || 'ensemble';
  const updateFrequencyHours = Number(getVal('rulUpdateFrequencyHours')) || 6;
  const minHistoryDays = Number(getVal('minHistoryDays')) || 30;

  return (
    <div className="space-y-3">
      {/* 预测窗口 */}
      <PageCard title="预测窗口" icon={<span className="text-xs">📅</span>} compact>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium">预测范围</label>
              <div className="flex items-center gap-1">
                <Input type="number" value={predictionHorizonDays}
                  onChange={(e) => { const c = getConfig('predictionHorizonDays'); if (c) onUpdate(c.id, e.target.value); }}
                  className="h-6 text-[10px] font-mono w-16" />
                <span className="text-[9px] text-muted-foreground">天</span>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium">最少历史数据</label>
              <div className="flex items-center gap-1">
                <Input type="number" value={minHistoryDays}
                  onChange={(e) => { const c = getConfig('minHistoryDays'); if (c) onUpdate(c.id, e.target.value); }}
                  className="h-6 text-[10px] font-mono w-16" />
                <span className="text-[9px] text-muted-foreground">天</span>
              </div>
            </div>
          </div>

          {/* 时间轴可视化 */}
          <div className="p-2 bg-muted/20 rounded">
            <div className="text-[9px] font-medium mb-1">RUL 预测时间轴</div>
            <div className="relative w-full h-6">
              <div className="absolute inset-0 bg-muted rounded-full" />
              {/* 危险区 */}
              <div className="absolute bg-red-400 h-6 rounded-l-full"
                style={{ width: `${(criticalThresholdDays / predictionHorizonDays) * 100}%` }} />
              {/* 警告区 */}
              <div className="absolute bg-amber-400 h-6"
                style={{
                  left: `${(criticalThresholdDays / predictionHorizonDays) * 100}%`,
                  width: `${((warningThresholdDays - criticalThresholdDays) / predictionHorizonDays) * 100}%`
                }} />
              {/* 安全区 */}
              <div className="absolute bg-green-400 h-6 rounded-r-full"
                style={{
                  left: `${(warningThresholdDays / predictionHorizonDays) * 100}%`,
                  width: `${((predictionHorizonDays - warningThresholdDays) / predictionHorizonDays) * 100}%`
                }} />
            </div>
            <div className="flex justify-between text-[8px] mt-0.5">
              <span className="text-red-600">危险 ≤{criticalThresholdDays}天</span>
              <span className="text-amber-600">警告 ≤{warningThresholdDays}天</span>
              <span className="text-green-600">安全 &gt;{warningThresholdDays}天</span>
              <span className="text-muted-foreground">{predictionHorizonDays}天</span>
            </div>
          </div>
        </div>
      </PageCard>

      {/* 告警阈值 */}
      <PageCard title="告警阈值" icon={<span className="text-xs">🚨</span>} compact>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-red-600">危险阈值</label>
            <div className="flex items-center gap-1">
              <Input type="number" value={criticalThresholdDays}
                onChange={(e) => { const c = getConfig('criticalThresholdDays'); if (c) onUpdate(c.id, e.target.value); }}
                className="h-6 text-[10px] font-mono w-16 border-red-300" />
              <span className="text-[9px] text-muted-foreground">天</span>
            </div>
            <div className="text-[8px] text-red-500">RUL 低于此值触发紧急告警</div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-amber-600">警告阈值</label>
            <div className="flex items-center gap-1">
              <Input type="number" value={warningThresholdDays}
                onChange={(e) => { const c = getConfig('warningThresholdDays'); if (c) onUpdate(c.id, e.target.value); }}
                className="h-6 text-[10px] font-mono w-16 border-amber-300" />
              <span className="text-[9px] text-muted-foreground">天</span>
            </div>
            <div className="text-[8px] text-amber-500">RUL 低于此值触发预警通知</div>
          </div>
        </div>
      </PageCard>

      {/* 模型配置 */}
      <PageCard title="预测模型" icon={<span className="text-xs">🤖</span>} compact>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">模型类型</label>
            <Select value={modelType}
              onValueChange={(v) => { const c = getConfig('rulModelType'); if (c) onUpdate(c.id, v); }}>
              <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ensemble">集成模型</SelectItem>
                <SelectItem value="lstm">LSTM 深度学习</SelectItem>
                <SelectItem value="weibull">Weibull 分布</SelectItem>
                <SelectItem value="physics_based">物理模型</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">置信水平</label>
            <div className="flex items-center gap-1">
              <input type="range" min={0.8} max={0.99} step={0.01} value={confidenceLevel}
                onChange={(e) => { const c = getConfig('confidenceLevel'); if (c) onUpdate(c.id, e.target.value); }}
                className="flex-1 h-1 accent-primary" />
              <span className="text-[9px] font-mono w-10 text-right">{(confidenceLevel * 100).toFixed(0)}%</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">更新频率</label>
            <div className="flex items-center gap-1">
              <Input type="number" value={updateFrequencyHours}
                onChange={(e) => { const c = getConfig('rulUpdateFrequencyHours'); if (c) onUpdate(c.id, e.target.value); }}
                className="h-6 text-[10px] font-mono w-14" />
              <span className="text-[9px] text-muted-foreground">小时</span>
            </div>
          </div>
        </div>
      </PageCard>
    </div>
  );
}
