/**
 * @xilian/shared-kernel - 结构化日志
 *
 * 为所有微服务提供统一的 JSON 结构化日志，
 * 自动注入 traceId/spanId/serviceName，支持 ELK 聚合。
 * 映射: server/core/logger.ts
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  traceId?: string;
  spanId?: string;
  requestId?: string;
  [key: string]: unknown;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private minLevel: number;

  constructor(
    private serviceName: string,
    private level: LogLevel = 'info',
    private context: Record<string, unknown> = {},
  ) {
    this.minLevel = LOG_LEVEL_PRIORITY[level];
  }

  /**
   * 创建子 Logger（继承上下文 + 追加新上下文）
   */
  child(additionalContext: Record<string, unknown>): Logger {
    const child = new Logger(this.serviceName, this.level, {
      ...this.context,
      ...additionalContext,
    });
    return child;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }

  /**
   * 记录错误对象（自动提取 stack）
   */
  errorObj(message: string, err: Error, meta?: Record<string, unknown>): void {
    this.log('error', message, {
      ...meta,
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
    });
  }

  /**
   * 计时器 — 自动记录操作耗时
   */
  timer(operation: string): { end: (meta?: Record<string, unknown>) => void } {
    const start = performance.now();
    return {
      end: (meta?: Record<string, unknown>) => {
        const duration = Math.round(performance.now() - start);
        this.info(`${operation} completed`, { ...meta, duration_ms: duration });
      },
    };
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LOG_LEVEL_PRIORITY[level] < this.minLevel) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      ...this.context,
      ...meta,
    };

    const output = JSON.stringify(entry);

    switch (level) {
      case 'error':
        process.stderr.write(output + '\n');
        break;
      default:
        process.stdout.write(output + '\n');
        break;
    }
  }
}

/**
 * 创建服务 Logger
 */
export function createLogger(
  serviceName: string,
  level?: LogLevel,
): Logger {
  return new Logger(
    serviceName,
    level ?? (process.env.LOG_LEVEL as LogLevel) ?? 'info',
  );
}
