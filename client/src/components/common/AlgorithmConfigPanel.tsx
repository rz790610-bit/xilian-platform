/**
 * 统一算法配置面板组件
 *
 * 三个算法模块（融合诊断、高级知识蒸馏、工况归一化）共用的配置界面风格。
 * 提供：
 *   - ConfigSection: 配置分组卡片
 *   - ConfigSlider: 带标签的滑块配置项
 *   - ConfigInput: 带标签的输入框配置项
 *   - ConfigSelect: 带标签的下拉选择配置项
 *   - ConfigSwitch: 带标签的开关配置项
 *   - ConfigActions: 保存/重置/导出按钮组
 *   - ApiDocBlock: API 文档展示块
 */
import { useState, useCallback, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// ConfigSection — 配置分组卡片
// ============================================================================

interface ConfigSectionProps {
  title: string;
  icon?: ReactNode;
  description?: string;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  badge?: string;
}

export function ConfigSection({
  title, icon, description, children, className, collapsible, defaultOpen = true, badge,
}: ConfigSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn('bg-card rounded-xl border border-border/50 overflow-hidden', className)}>
      <div
        className={cn(
          'flex items-center justify-between px-5 py-3.5 border-b border-border/30',
          collapsible && 'cursor-pointer hover:bg-accent/20 transition-colors',
        )}
        onClick={collapsible ? () => setOpen(!open) : undefined}
      >
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-primary/80">{icon}</span>}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              {badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                  {badge}
                </span>
              )}
            </div>
            {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
          </div>
        </div>
        {collapsible && (
          <span className={cn('text-muted-foreground transition-transform text-xs', open && 'rotate-180')}>
            ▼
          </span>
        )}
      </div>
      {(!collapsible || open) && (
        <div className="px-5 py-4 space-y-4">{children}</div>
      )}
    </div>
  );
}

// ============================================================================
// ConfigSlider — 滑块配置项
// ============================================================================

interface ConfigSliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  description?: string;
  disabled?: boolean;
  showValue?: boolean;
  formatValue?: (v: number) => string;
}

export function ConfigSlider({
  label, value, onChange, min, max, step, unit, description, disabled, showValue = true, formatValue,
}: ConfigSliderProps) {
  const displayValue = formatValue ? formatValue(value) : `${value}${unit ? ` ${unit}` : ''}`;

  return (
    <div className={cn('space-y-2', disabled && 'opacity-50 pointer-events-none')}>
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-medium text-foreground">{label}</span>
          {description && <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {showValue && (
          <span className="text-xs font-mono font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
            {displayValue}
          </span>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{min}{unit ? ` ${unit}` : ''}</span>
        <span>{max}{unit ? ` ${unit}` : ''}</span>
      </div>
    </div>
  );
}

// ============================================================================
// ConfigInput — 输入框配置项
// ============================================================================

interface ConfigInputProps {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: 'text' | 'number';
  placeholder?: string;
  description?: string;
  disabled?: boolean;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}

export function ConfigInput({
  label, value, onChange, type = 'text', placeholder, description, disabled, unit, min, max, step,
}: ConfigInputProps) {
  return (
    <div className={cn('space-y-1.5', disabled && 'opacity-50 pointer-events-none')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
      </div>
      {description && <p className="text-[10px] text-muted-foreground">{description}</p>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
      />
    </div>
  );
}

// ============================================================================
// ConfigSelect — 下拉选择配置项
// ============================================================================

interface ConfigSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; description?: string }>;
  description?: string;
  disabled?: boolean;
}

export function ConfigSelect({
  label, value, onChange, options, description, disabled,
}: ConfigSelectProps) {
  return (
    <div className={cn('space-y-1.5', disabled && 'opacity-50 pointer-events-none')}>
      <span className="text-xs font-medium text-foreground">{label}</span>
      {description && <p className="text-[10px] text-muted-foreground">{description}</p>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// ============================================================================
// ConfigSwitch — 开关配置项
// ============================================================================

interface ConfigSwitchProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
  disabled?: boolean;
}

export function ConfigSwitch({
  label, checked, onChange, description, disabled,
}: ConfigSwitchProps) {
  return (
    <div className={cn('flex items-center justify-between py-1', disabled && 'opacity-50 pointer-events-none')}>
      <div>
        <span className="text-xs font-medium text-foreground">{label}</span>
        {description && <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={cn(
          'relative w-10 h-5 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

// ============================================================================
// ConfigActions — 操作按钮组
// ============================================================================

interface ConfigActionsProps {
  onSave: () => void;
  onReset?: () => void;
  onExport?: () => void;
  saving?: boolean;
  dirty?: boolean;
  saveLabel?: string;
  resetLabel?: string;
  exportLabel?: string;
}

export function ConfigActions({
  onSave, onReset, onExport, saving, dirty, saveLabel = '保存配置', resetLabel = '恢复默认', exportLabel = '导出配置',
}: ConfigActionsProps) {
  return (
    <div className="flex items-center justify-between pt-4 border-t border-border/30">
      <div className="flex items-center gap-2">
        {dirty && (
          <span className="text-[10px] text-amber-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            配置已修改，未保存
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onExport && (
          <button
            onClick={onExport}
            className="px-3 py-1.5 rounded-lg bg-accent/50 text-foreground text-xs font-medium hover:bg-accent/70 transition-colors"
          >
            📥 {exportLabel}
          </button>
        )}
        {onReset && (
          <button
            onClick={onReset}
            className="px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-medium hover:bg-amber-500/25 transition-colors"
          >
            🔄 {resetLabel}
          </button>
        )}
        <button
          onClick={onSave}
          disabled={saving}
          className={cn(
            'px-4 py-1.5 rounded-lg text-xs font-semibold transition-all',
            saving
              ? 'bg-primary/30 text-primary/50 cursor-wait'
              : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
          )}
        >
          {saving ? '⏳ 保存中...' : `✅ ${saveLabel}`}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// ConfigKV — 键值对展示行
// ============================================================================

interface ConfigKVProps {
  label: string;
  value: ReactNode;
  mono?: boolean;
}

export function ConfigKV({ label, value, mono }: ConfigKVProps) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-xs text-foreground', mono && 'font-mono')}>{value}</span>
    </div>
  );
}

// ============================================================================
// ApiDocBlock — API 文档展示块
// ============================================================================

interface ApiDocBlockProps {
  title: string;
  icon?: ReactNode;
  endpoints: Array<{
    method: 'GET' | 'POST';
    path: string;
    description: string;
    body?: string;
  }>;
  pythonExample?: string;
  note?: string;
}

export function ApiDocBlock({ title, icon, endpoints, pythonExample, note }: ApiDocBlockProps) {
  const [showPython, setShowPython] = useState(false);

  return (
    <ConfigSection title={title} icon={icon || <span>🔌</span>} description="Python 算法端通过以下 API 与平台对接" collapsible defaultOpen={false}>
      <div className="space-y-3">
        {/* 端点列表 */}
        <div className="bg-muted/30 rounded-lg p-3 space-y-2">
          {endpoints.map((ep, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className={cn(
                'px-1.5 py-0.5 rounded font-mono font-bold text-[10px] shrink-0',
                ep.method === 'GET' ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/15 text-blue-400',
              )}>
                {ep.method}
              </span>
              <div className="min-w-0">
                <code className="text-foreground font-mono text-[11px] break-all">{ep.path}</code>
                <p className="text-muted-foreground text-[10px] mt-0.5">{ep.description}</p>
                {ep.body && (
                  <code className="text-muted-foreground/70 text-[10px] block mt-0.5">{ep.body}</code>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Python 示例 */}
        {pythonExample && (
          <div>
            <button
              onClick={() => setShowPython(!showPython)}
              className="text-[10px] text-primary hover:text-primary/80 transition-colors"
            >
              {showPython ? '▼ 隐藏 Python 示例' : '▶ 查看 Python 调用示例'}
            </button>
            {showPython && (
              <pre className="mt-2 bg-muted/50 rounded-lg p-3 text-[10px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                {pythonExample}
              </pre>
            )}
          </div>
        )}

        {/* 备注 */}
        {note && (
          <p className="text-[10px] text-muted-foreground/70 border-t border-border/20 pt-2">{note}</p>
        )}
      </div>
    </ConfigSection>
  );
}

// ============================================================================
// ConfigRangeInput — 范围输入（两个值）
// ============================================================================

interface ConfigRangeInputProps {
  label: string;
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
  step?: number;
  unit?: string;
  description?: string;
}

export function ConfigRangeInput({
  label, min, max, onChange, step = 0.1, unit, description,
}: ConfigRangeInputProps) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {description && <p className="text-[10px] text-muted-foreground">{description}</p>}
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={min}
          onChange={e => onChange(Number(e.target.value), max)}
          step={step}
          className="flex-1 px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground font-mono text-center"
        />
        <span className="text-xs text-muted-foreground">~</span>
        <input
          type="number"
          value={max}
          onChange={e => onChange(min, Number(e.target.value))}
          step={step}
          className="flex-1 px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground font-mono text-center"
        />
        {unit && <span className="text-[10px] text-muted-foreground shrink-0">{unit}</span>}
      </div>
    </div>
  );
}
