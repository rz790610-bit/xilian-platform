/**
 * ============================================================================
 * 前端统一日志库
 * ============================================================================
 *
 * CR-01: 替代 client 端所有 console.log/warn/error 直接调用
 *
 * 功能：
 *   1. 统一日志级别管理（开发环境 debug，生产环境 warn）
 *   2. 模块化日志标签（自动添加 [module] 前缀）
 *   3. 结构化日志输出（时间戳 + 级别 + 模块）
 *   4. 生产环境自动静默 debug/info 级别日志
 *
 * 使用方式：
 *   import { createLogger } from '@/lib/logger';
 *   const log = createLogger('KafkaMetricsWS');
 *   log.debug('Connecting to:', wsUrl);
 *   log.info('Connected');
 *   log.warn('Reconnecting in', delay, 'ms');
 *   log.error('Failed to connect:', error);
 *
 * ============================================================================
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const isDev = import.meta.env.DEV;
const envLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel) || (isDev ? 'debug' : 'warn');

let globalLevel: LogLevel = envLevel;

export function setLogLevel(level: LogLevel): void {
  globalLevel = level;
}

export function getLogLevel(): LogLevel {
  return globalLevel;
}

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export function createLogger(module: string): Logger {
  const prefix = `[${module}]`;

  function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[globalLevel];
  }

  return {
    debug: (...args: unknown[]) => {
      if (shouldLog('debug')) {
        console.debug(prefix, ...args);
      }
    },
    info: (...args: unknown[]) => {
      if (shouldLog('info')) {
        console.log(prefix, ...args);
      }
    },
    warn: (...args: unknown[]) => {
      if (shouldLog('warn')) {
        console.warn(prefix, ...args);
      }
    },
    error: (...args: unknown[]) => {
      if (shouldLog('error')) {
        console.error(prefix, ...args);
      }
    },
  };
}

/** 全局默认 logger（用于不需要模块标签的场景） */
export const log = createLogger('App');
