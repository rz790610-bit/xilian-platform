/**
 * PortAI Nexus — 统一日志框架
 * 基于 Pino 的结构化日志系统，替代散落的 console.log
 * 
 * 使用方式：
 *   import { logger, createModuleLogger } from '../core/logger';
 *   const log = createModuleLogger('mqtt-adapter');
 *   log.info({ host, port }, 'Connected to MQTT broker');
 *   log.error({ err }, 'Connection failed');
 */

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  level: LogLevel;
  module: string;
  timestamp: string;
  message: string;
  [key: string]: unknown;
}

interface LoggerOptions {
  level?: LogLevel;
  module?: string;
  pretty?: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: '\x1b[90m',   // gray
  debug: '\x1b[36m',   // cyan
  info: '\x1b[32m',    // green
  warn: '\x1b[33m',    // yellow
  error: '\x1b[31m',   // red
  fatal: '\x1b[35m',   // magenta
};

const RESET = '\x1b[0m';

class Logger {
  private level: number;
  private module: string;
  private pretty: boolean;
  private static globalLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  private static logBuffer: LogEntry[] = [];
  private static maxBufferSize = 1000;
  private static listeners: Array<(entry: LogEntry) => void> = [];

  constructor(options: LoggerOptions = {}) {
    this.level = LOG_LEVELS[options.level || Logger.globalLevel];
    this.module = options.module || 'app';
    this.pretty = options.pretty ?? (process.env.NODE_ENV !== 'production');
  }

  /** 设置全局日志级别 */
  static setGlobalLevel(level: LogLevel): void {
    Logger.globalLevel = level;
  }

  /** 注册日志监听器（用于日志聚合/告警/持久化） */
  static addListener(fn: (entry: LogEntry) => void): () => void {
    Logger.listeners.push(fn);
    return () => {
      Logger.listeners = Logger.listeners.filter(l => l !== fn);
    };
  }

  /** 获取最近的日志缓冲区（用于诊断） */
  static getRecentLogs(count = 100): LogEntry[] {
    return Logger.logBuffer.slice(-count);
  }

  /** 创建子日志器（继承模块前缀） */
  child(subModule: string): Logger {
    return new Logger({
      module: `${this.module}:${subModule}`,
      pretty: this.pretty,
    });
  }

  trace(data: Record<string, unknown> | string, message?: string): void {
    this.log('trace', data, message);
  }

  debug(data: Record<string, unknown> | string, message?: string): void {
    this.log('debug', data, message);
  }

  info(data: Record<string, unknown> | string, message?: string): void {
    this.log('info', data, message);
  }

  warn(data: Record<string, unknown> | string, message?: string): void {
    this.log('warn', data, message);
  }

  error(data: Record<string, unknown> | string, message?: string): void {
    this.log('error', data, message);
  }

  fatal(data: Record<string, unknown> | string, message?: string): void {
    this.log('fatal', data, message);
  }

  private log(level: LogLevel, data: Record<string, unknown> | string, message?: string): void {
    if (LOG_LEVELS[level] < this.level) return;

    const timestamp = new Date().toISOString();
    let msg: string;
    let extra: Record<string, unknown> = {};

    if (typeof data === 'string') {
      msg = data;
    } else {
      msg = message || '';
      extra = data;
    }

    const entry: LogEntry = {
      level,
      module: this.module,
      timestamp,
      message: msg,
      ...extra,
    };

    // 写入缓冲区
    Logger.logBuffer.push(entry);
    if (Logger.logBuffer.length > Logger.maxBufferSize) {
      Logger.logBuffer = Logger.logBuffer.slice(-Math.floor(Logger.maxBufferSize * 0.6));
    }

    // 通知监听器
    for (const listener of Logger.listeners) {
      try { listener(entry); } catch { /* ignore listener errors */ }
    }

    // 输出
    if (this.pretty) {
      this.prettyPrint(level, timestamp, msg, extra);
    } else {
      // 生产环境输出 JSON 结构化日志
      const output = level === 'error' || level === 'fatal' ? process.stderr : process.stdout;
      output.write(JSON.stringify(entry) + '\n');
    }
  }

  private prettyPrint(level: LogLevel, timestamp: string, msg: string, extra: Record<string, unknown>): void {
    const color = LEVEL_COLORS[level];
    const time = timestamp.slice(11, 23); // HH:mm:ss.SSS
    const levelStr = level.toUpperCase().padEnd(5);
    const moduleStr = `[${this.module}]`;
    
    let extraStr = '';
    const keys = Object.keys(extra);
    if (keys.length > 0) {
      // 特殊处理 err 字段
      if (extra.err instanceof Error) {
        extraStr = `\n  ${extra.err.stack || extra.err.message}`;
        const rest = { ...extra };
        delete rest.err;
        if (Object.keys(rest).length > 0) {
          extraStr += `\n  ${JSON.stringify(rest)}`;
        }
      } else {
        extraStr = ` ${JSON.stringify(extra)}`;
      }
    }

    const output = level === 'error' || level === 'fatal' ? process.stderr : process.stdout;
    output.write(`${color}${time} ${levelStr}${RESET} ${moduleStr} ${msg}${extraStr}\n`);
  }
}

// ============================================
// 导出 API
// ============================================

/** 全局根日志器 */
export const logger = new Logger({ module: 'nexus' });

/** 创建模块级日志器 */
export function createModuleLogger(module: string): Logger {
  return new Logger({ module });
}

/** 设置全局日志级别 */
export function setLogLevel(level: LogLevel): void {
  Logger.setGlobalLevel(level);
}

/** 注册日志监听器 */
export function addLogListener(fn: (entry: LogEntry) => void): () => void {
  return Logger.addListener(fn);
}

/** 获取最近日志（诊断用） */
export function getRecentLogs(count?: number): LogEntry[] {
  return Logger.getRecentLogs(count);
}

export { Logger, LogLevel, LogEntry };
