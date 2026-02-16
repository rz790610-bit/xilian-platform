/**
 * @xilian/shared-kernel - 通用工具函数
 *
 * 跨微服务共享的工具函数，消除重复定义。
 * 映射: server/lib/utils/ 中的公共函数
 */

// ============================================================
// 重试
// ============================================================

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;       // ms
  maxDelay?: number;       // ms
  backoffMultiplier?: number;
  retryOn?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    maxAttempts,
    baseDelay,
    maxDelay = 30000,
    backoffMultiplier = 2,
    retryOn,
    onRetry,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) break;
      if (retryOn && !retryOn(lastError)) break;

      const jitter = Math.random() * 0.3 + 0.85; // 0.85 - 1.15
      const delay = Math.min(
        baseDelay * Math.pow(backoffMultiplier, attempt - 1) * jitter,
        maxDelay,
      );

      onRetry?.(attempt, lastError, delay);
      await sleep(delay);
    }
  }

  throw lastError;
}

// ============================================================
// 超时
// ============================================================

export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  message?: string,
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(message ?? `Operation timed out after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ]);
}

// ============================================================
// 幂等键生成
// ============================================================

export function generateIdempotencyKey(...parts: string[]): string {
  const input = parts.join(':');
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `idem_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
}

// ============================================================
// 格式化
// ============================================================

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

// ============================================================
// 批处理
// ============================================================

export async function batchProcess<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
  }
  return results;
}

// ============================================================
// 深度合并
// ============================================================

export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceVal = source[key];
    const targetVal = result[key];
    if (
      sourceVal &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      ) as T[keyof T];
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T];
    }
  }
  return result;
}

// ============================================================
// 基础工具
// ============================================================

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}
