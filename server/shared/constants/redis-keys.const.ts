/**
 * V4.0 Redis Key 模式与 TTL 策略
 * 参考：xilian_v4_production.md §25
 */
export const REDIS_KEYS = {
  // ===== 类别 1：设备实时状态 =====
  DEVICE_STATUS: {
    pattern: 'device:status:{device_code}',
    ttl: 60,
    structure: 'hash' as const,
    fields: ['status', 'last_heartbeat', 'current_rms', 'current_temperature', 'current_rpm', 'alert_count_today'],
  },

  // ===== 类别 2：传感器最新值 =====
  SENSOR_LATEST: {
    pattern: 'sensor:latest:{device_code}:{mp_code}',
    ttl: 10,
    structure: 'hash' as const,
    fields: ['value', 'timestamp', 'quality', 'unit'],
  },

  // ===== 类别 3：活跃告警 =====
  ALERT_ACTIVE: {
    pattern: 'alert:active:{device_code}',
    ttl: 300,
    structure: 'list' as const,
    maxLength: 100,
  },

  // ===== 类别 4：配置缓存 =====
  CONFIG_SAMPLING: {
    pattern: 'config:sampling:{gateway_id}',
    ttl: 3600,
    structure: 'string' as const,
    invalidateOn: ['device_sampling_config.updated'],
  },

  // ===== 类别 5：查询结果缓存 =====
  QUERY_RESULT: {
    pattern: 'query:result:{hash}',
    ttl: 300,
    structure: 'string' as const,
    maxSize: '10MB',
  },

  // ===== 类别 6：Schema 元数据缓存 =====
  SCHEMA_TABLE: {
    pattern: 'schema:table:{name}',
    ttl: 86400,
    structure: 'string' as const,
  },
} as const;

/**
 * 构建 Redis Key
 */
export function buildRedisKey(pattern: string, params: Record<string, string>): string {
  let key = pattern;
  for (const [k, v] of Object.entries(params)) {
    key = key.replace(`{${k}}`, v);
  }
  return key;
}

export type RedisKeyType = keyof typeof REDIS_KEYS;
