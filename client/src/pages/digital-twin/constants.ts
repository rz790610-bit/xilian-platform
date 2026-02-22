/**
 * 数字孪生模块 — 共享常量与工具
 */

export const stateLabels: Record<string, string> = {
  vibrationRMS: '振动 RMS', temperature: '温度', loadRatio: '负载率',
  speed: '转速', fatigueDamage: '疲劳损伤', remainingLifeDays: '剩余寿命',
  pressure: '压力', current: '电流', humidity: '湿度',
};

export const stateUnits: Record<string, string> = {
  vibrationRMS: 'mm/s', temperature: '°C', loadRatio: '%',
  speed: 'rpm', fatigueDamage: '', remainingLifeDays: '天',
  pressure: 'MPa', current: 'A', humidity: '%',
};

export const syncStatusMap: Record<string, { label: string; color: 'default' | 'secondary' | 'destructive' }> = {
  synced: { label: '已同步', color: 'default' },
  stale: { label: '延迟', color: 'secondary' },
  disconnected: { label: '断连', color: 'destructive' },
};

export const riskLevelMap: Record<string, { label: string; color: 'default' | 'secondary' | 'destructive' }> = {
  low: { label: '低', color: 'default' },
  medium: { label: '中', color: 'secondary' },
  high: { label: '高', color: 'destructive' },
  critical: { label: '严重', color: 'destructive' },
};
