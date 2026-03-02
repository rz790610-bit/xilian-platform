/**
 * 应用平台 — 常量定义
 * 颜色编码、健康阈值、标签映射
 */

// ── 健康评分阈值 ──────────────────────────────────────────
export const HEALTH_THRESHOLDS = {
  GOOD: 80,
  WARN: 60,
} as const;

export function healthColor(score: number | null | undefined): string {
  if (score == null) return 'text-muted-foreground';
  if (score >= HEALTH_THRESHOLDS.GOOD) return 'text-emerald-500';
  if (score >= HEALTH_THRESHOLDS.WARN) return 'text-yellow-500';
  return 'text-red-500';
}

export function healthBg(score: number | null | undefined): string {
  if (score == null) return 'bg-muted';
  if (score >= HEALTH_THRESHOLDS.GOOD) return 'bg-emerald-500';
  if (score >= HEALTH_THRESHOLDS.WARN) return 'bg-yellow-500';
  return 'bg-red-500';
}

// ── 预警严重程度 ──────────────────────────────────────────
export const SEVERITY_MAP: Record<string, { label: string; color: string; badge: string }> = {
  critical: { label: '严重', color: 'text-red-500', badge: 'bg-red-500/15 text-red-500 border-red-500/30' },
  high:     { label: '高',   color: 'text-orange-500', badge: 'bg-orange-500/15 text-orange-500 border-orange-500/30' },
  medium:   { label: '中',   color: 'text-yellow-500', badge: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30' },
  low:      { label: '低',   color: 'text-blue-400', badge: 'bg-blue-400/15 text-blue-400 border-blue-400/30' },
};

export function severityInfo(severity: string) {
  return SEVERITY_MAP[severity] ?? { label: severity, color: 'text-muted-foreground', badge: 'bg-muted text-muted-foreground' };
}

// ── 同步状态 ──────────────────────────────────────────────
export const SYNC_STATUS_MAP: Record<string, { label: string; dot: string }> = {
  synced:       { label: '在线', dot: 'bg-emerald-500' },
  stale:        { label: '延迟', dot: 'bg-yellow-500' },
  disconnected: { label: '离线', dot: 'bg-red-500' },
};

// ── 诊断模式 ──────────────────────────────────────────────
export const DIAGNOSIS_MODES = [
  { value: 'quick',      label: '快速诊断' },
  { value: 'deep',       label: '深度诊断' },
  { value: 'predictive', label: '预测诊断' },
] as const;

// ── 诊断步骤 (动画) ──────────────────────────────────────
export const DIAGNOSIS_STEPS = [
  { key: 'collect', label: '采集数据' },
  { key: 'analyze', label: '智能分析' },
  { key: 'conclude', label: '生成结论' },
] as const;

// ── 演示评分 (后端未接入真实评分时的确定性回退) ──────────
// 基于设备 ID 的简单哈希，保证每台设备评分稳定且有绿/黄/红分布
function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** 设备 ID → 演示健康评分 (42-98)，分布: ~40% 绿 / ~30% 黄 / ~30% 红 */
export function demoHealthScore(equipmentId: string): number {
  const h = simpleHash(equipmentId + 'health');
  return 42 + (h % 57);  // 42-98
}

export function demoSafetyScore(equipmentId: string): number {
  const h = simpleHash(equipmentId + 'safety');
  return 50 + (h % 50);  // 50-99
}

export function demoEfficiencyScore(equipmentId: string): number {
  const h = simpleHash(equipmentId + 'efficiency');
  return 45 + (h % 53);  // 45-97
}

/** 如果 real 为 null 则用演示值 */
export function withDemoFallback(
  real: number | null | undefined,
  equipmentId: string,
  kind: 'health' | 'safety' | 'efficiency',
): number {
  if (real != null) return real;
  switch (kind) {
    case 'health': return demoHealthScore(equipmentId);
    case 'safety': return demoSafetyScore(equipmentId);
    case 'efficiency': return demoEfficiencyScore(equipmentId);
  }
}

// ── 时间格式化 ─────────────────────────────────────────
export function relativeTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '-';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`;
  return d.toLocaleDateString('zh-CN');
}

export function formatTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '-';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  return d.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit' });
}
