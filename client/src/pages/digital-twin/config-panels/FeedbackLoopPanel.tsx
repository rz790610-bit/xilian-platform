/**
 * KnowledgeFeedbackLoop 知识反馈环 专属配置面板 (P1)
 * 
 * 学习率、反馈周期、自动回滚触发器
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

export default function FeedbackLoopPanel({ configs, onUpdate }: Props) {
  const getConfig = (key: string) => configs.find(c => c.configKey === key);
  const getVal = (key: string): string => {
    const c = getConfig(key);
    if (!c) return '';
    const v = c.configValue;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  };

  const learningRate = Number(getVal('learningRate')) || 0.01;
  const feedbackIntervalMs = Number(getVal('feedbackIntervalMs')) || 3600000;
  const autoRollbackEnabled = getVal('autoRollbackEnabled') === 'true';
  const rollbackThreshold = Number(getVal('rollbackThreshold')) || 0.15;
  const minSamplesForUpdate = Number(getVal('minSamplesForUpdate')) || 100;
  const maxLearningRate = Number(getVal('maxLearningRate')) || 0.1;
  const momentumFactor = Number(getVal('momentumFactor')) || 0.9;
  const evaluationWindow = Number(getVal('evaluationWindowMs')) || 86400000;

  return (
    <div className="space-y-3">
      {/* 学习参数 */}
      <PageCard title="学习参数" icon={<span className="text-xs">📚</span>} compact>
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium">学习率</label>
              <div className="flex items-center gap-1">
                <input type="range" min={0.001} max={0.1} step={0.001} value={learningRate}
                  onChange={(e) => { const c = getConfig('learningRate'); if (c) onUpdate(c.id, e.target.value); }}
                  className="flex-1 h-1 accent-primary" />
                <span className="text-[9px] font-mono w-10 text-right">{learningRate}</span>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium">最大学习率</label>
              <div className="flex items-center gap-1">
                <input type="range" min={0.01} max={0.5} step={0.01} value={maxLearningRate}
                  onChange={(e) => { const c = getConfig('maxLearningRate'); if (c) onUpdate(c.id, e.target.value); }}
                  className="flex-1 h-1 accent-primary" />
                <span className="text-[9px] font-mono w-10 text-right">{maxLearningRate}</span>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium">动量因子</label>
              <div className="flex items-center gap-1">
                <input type="range" min={0.5} max={0.99} step={0.01} value={momentumFactor}
                  onChange={(e) => { const c = getConfig('momentumFactor'); if (c) onUpdate(c.id, e.target.value); }}
                  className="flex-1 h-1 accent-primary" />
                <span className="text-[9px] font-mono w-10 text-right">{momentumFactor}</span>
              </div>
            </div>
          </div>
          {/* 学习率可视化 */}
          <div className="p-2 bg-muted/20 rounded">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <div className="text-[8px] text-muted-foreground mb-0.5">有效学习率范围</div>
                <div className="relative w-full bg-muted rounded-full h-2">
                  <div className="absolute bg-primary/30 h-2 rounded-full"
                    style={{ left: `${learningRate / maxLearningRate * 100 * 0.1}%`, width: `${(maxLearningRate - learningRate) / maxLearningRate * 100}%` }} />
                  <div className="absolute bg-primary h-2 rounded-full w-1"
                    style={{ left: `${learningRate / maxLearningRate * 100}%` }} />
                </div>
                <div className="flex justify-between text-[7px] mt-0.5">
                  <span>{learningRate}</span>
                  <span className="text-muted-foreground">当前 → 动量 {momentumFactor}</span>
                  <span>{maxLearningRate}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </PageCard>

      {/* 反馈周期 */}
      <PageCard title="反馈周期" icon={<span className="text-xs">🔄</span>} compact>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium">反馈间隔</label>
            <div className="flex items-center gap-1">
              <Input type="number" value={feedbackIntervalMs / 60000}
                onChange={(e) => { const c = getConfig('feedbackIntervalMs'); if (c) onUpdate(c.id, String(Number(e.target.value) * 60000)); }}
                className="h-6 text-[10px] font-mono w-16" />
              <span className="text-[9px] text-muted-foreground">分钟</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">最少样本数</label>
            <Input type="number" value={minSamplesForUpdate}
              onChange={(e) => { const c = getConfig('minSamplesForUpdate'); if (c) onUpdate(c.id, e.target.value); }}
              className="h-6 text-[10px] font-mono" />
            <div className="text-[8px] text-muted-foreground">不足则跳过本轮更新</div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium">评估窗口</label>
            <div className="flex items-center gap-1">
              <Input type="number" value={evaluationWindow / 3600000}
                onChange={(e) => { const c = getConfig('evaluationWindowMs'); if (c) onUpdate(c.id, String(Number(e.target.value) * 3600000)); }}
                className="h-6 text-[10px] font-mono w-16" />
              <span className="text-[9px] text-muted-foreground">小时</span>
            </div>
          </div>
        </div>
      </PageCard>

      {/* 自动回滚触发器 */}
      <PageCard title="自动回滚保护" icon={<span className="text-xs">🛡️</span>} compact>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-medium">启用自动回滚</div>
              <div className="text-[8px] text-muted-foreground">当模型精度下降超过阈值时，自动回滚到上一版本</div>
            </div>
            <Switch checked={autoRollbackEnabled}
              onCheckedChange={(v) => { const c = getConfig('autoRollbackEnabled'); if (c) onUpdate(c.id, String(v)); }}
              className="scale-[0.7]" />
          </div>
          {autoRollbackEnabled && (
            <div className="p-2 bg-red-50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2">
                <span className="text-[10px]">⚠️</span>
                <div className="flex-1">
                  <div className="text-[9px] font-medium text-red-700 dark:text-red-400">回滚阈值</div>
                  <div className="text-[8px] text-red-600 dark:text-red-500">
                    精度下降超过 {(rollbackThreshold * 100).toFixed(0)}% 时触发
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <input type="range" min={0.05} max={0.5} step={0.01} value={rollbackThreshold}
                    onChange={(e) => { const c = getConfig('rollbackThreshold'); if (c) onUpdate(c.id, e.target.value); }}
                    className="w-20 h-1 accent-red-500" />
                  <span className="text-[9px] font-mono text-red-600 w-8">{(rollbackThreshold * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </PageCard>
    </div>
  );
}
