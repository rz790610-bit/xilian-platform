export const REDIS_KEYS = {
  CONFIG: (key: string) => `config:${key}`,
  DEVICE: (code: string) => `device:${code}`,
  MODEL: (id: string) => `model:${id}`,
  SESSION: (userId: string) => `session:${userId}`,
  METRIC: (name: string) => `metric:${name}`,
} as const;
