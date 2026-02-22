/**
 * PhysicsVerifier 物理验证器 专属配置面板 (P1)
 * 
 * 物理约束范围、违规处理策略、per-device-type 配置
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

export default function PhysicsVerifierPanel({ configs, onUpdate }: Props) {
  const getConfig = (key: string) => configs.find(c => c.configKey === key);
  const getVal = (key: string): string => {
    const c = getConfig(key);
    if (!c) return '';
    const v = c.configValue;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  };

  const strictMode = getVal('strictMode') === 'true';
  const violationAction = getVal('violationAction') || 'warn';
  const tolerancePercent = Number(getVal('tolerancePercent')) || 5;
  const enablePerDeviceType = getVal('enablePerDeviceType') === 'true';
  const maxViolationsBeforeReject = Number(getVal('maxViolationsBeforeReject')) || 3;

  // 物理约束示例数据
  const physicsConstraints = [
    { param: '温度', unit: '°C', min: -40, max: 150, icon: '🌡️' },
    { param: '振动', unit: 'mm/s', min: 0, max: 50, icon: '📳' },
    { param: '压力', unit: 'MPa', min: 0, max: 25, icon: '🔴' },
    { param: '转速', unit: 'RPM', min: 0, max: 6000, icon: '⚙️' },
    { param: '电流', unit: 'A', min: 0, max: 500, icon: '⚡' },
  ];

  return (
    <div className="space-y-3">
      {/* 验证模式 */}
      <PageCard title="验证模式" icon={<span className="text-xs">🔬</span>} compact>
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-medium">严格模式</label>
                <Switch checked={strictMode}
                  onCheckedChange={(v) => { const c = getConfig('strictMode'); if (c) onUpdate(c.id, String(v)); }}
                  className="scale-[0.6]" />
              </div>
              <div className="text-[8px] text-muted-foreground">
                {strictMode ? '任何违规立即拒绝' : '允许容差范围内通过'}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium">违规处理</label>
              <Select value={violationAction}
                onValueChange={(v) => { const c = getConfig('violationAction'); if (c) onUpdate(c.id, v); }}>
                <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="warn">⚠️ 警告</SelectItem>
                  <SelectItem value="reject">🚫 拒绝</SelectItem>
                  <SelectItem value="clamp">📏 钳位修正</SelectItem>
                  <SelectItem value="log_only">📝 仅记录</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium">容差百分比</label>
              <div className="flex items-center gap-1">
                <Input type="number" value={tolerancePercent} disabled={strictMode}
                  onChange={(e) => { const c = getConfig('tolerancePercent'); if (c) onUpdate(c.id, e.target.value); }}
                  className="h-6 text-[10px] font-mono w-14" />
                <span className="text-[9px] text-muted-foreground">%</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-medium">按设备类型验证</label>
                <Switch checked={enablePerDeviceType}
                  onCheckedChange={(v) => { const c = getConfig('enablePerDeviceType'); if (c) onUpdate(c.id, String(v)); }}
                  className="scale-[0.6]" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium">拒绝前最大违规次数</label>
              <Input type="number" value={maxViolationsBeforeReject}
                onChange={(e) => { const c = getConfig('maxViolationsBeforeReject'); if (c) onUpdate(c.id, e.target.value); }}
                className="h-6 text-[10px] font-mono" />
            </div>
          </div>
        </div>
      </PageCard>

      {/* 物理约束范围 */}
      <PageCard title="物理约束范围（示例）" icon={<span className="text-xs">📐</span>} compact>
        <div className="space-y-1.5">
          {physicsConstraints.map((pc) => (
            <div key={pc.param} className="flex items-center gap-2 p-1.5 bg-muted/20 rounded">
              <span className="text-sm w-5 text-center">{pc.icon}</span>
              <span className="text-[10px] font-medium w-12">{pc.param}</span>
              <div className="flex-1">
                <div className="relative w-full bg-muted rounded-full h-1.5">
                  <div className="absolute bg-green-400 h-1.5 rounded-full"
                    style={{
                      left: `${(pc.min / (pc.max * 1.2)) * 100}%`,
                      width: `${((pc.max - pc.min) / (pc.max * 1.2)) * 100}%`
                    }} />
                  {!strictMode && (
                    <>
                      <div className="absolute bg-amber-300 h-1.5 rounded-l"
                        style={{
                          left: `${Math.max(0, (pc.min - pc.max * tolerancePercent / 100) / (pc.max * 1.2)) * 100}%`,
                          width: `${(pc.max * tolerancePercent / 100 / (pc.max * 1.2)) * 100}%`
                        }} />
                      <div className="absolute bg-amber-300 h-1.5 rounded-r"
                        style={{
                          left: `${(pc.max / (pc.max * 1.2)) * 100}%`,
                          width: `${(pc.max * tolerancePercent / 100 / (pc.max * 1.2)) * 100}%`
                        }} />
                    </>
                  )}
                </div>
              </div>
              <span className="text-[8px] font-mono text-muted-foreground w-20 text-right">
                {pc.min} ~ {pc.max} {pc.unit}
              </span>
              {!strictMode && (
                <Badge variant="outline" className="text-[7px] text-amber-600">±{tolerancePercent}%</Badge>
              )}
            </div>
          ))}
          <div className="text-[8px] text-muted-foreground text-center mt-1">
            实际约束范围从 twin_physics_bounds 表读取 · 上方为示例展示
          </div>
        </div>
      </PageCard>
    </div>
  );
}
