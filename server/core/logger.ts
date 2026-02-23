/**
 * PortAI Nexus — 统一日志框架
 * 基于自定义 Logger 的结构化日志系统，替代散落的 console.log
 * 
 * P1-1 集成：OpenTelemetry trace context 自动注入
 *   - 当 OTel SDK 已初始化时，每条日志自动附带 trace_id / span_id
 *   - 通过 @opentelemetry/api 的 trace.getActiveSpan() 获取当前 span
 *   - 生产环境 JSON 输出中包含 trace_id/span_id，可被 Loki/ELK 关联
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
  trace_id?: string;
  span_id?: string;
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

// ============================================
// OTel trace context 注入
// ============================================

/**
 * 尝试从 @opentelemetry/api 获取当前活跃 span 的 trace context。
 * 如果 OTel SDK 未初始化或无活跃 span，返回空对象。
 * 使用延迟加载避免循环依赖（logger.ts 在 OTel 初始化之前就被导入）。
 */
let otelApi: any = null;
let otelLoadAttempted = false;

function getTraceContext(): { trace_id?: string; span_id?: string } {
  if (!otelLoadAttempted) {
    otelLoadAttempted = true;
    try {
      // 动态 require 避免在 OTel 未安装时报错
      otelApi = require('@opentelemetry/api');
    } catch {
      // @opentelemetry/api 未安装，静默跳过
      otelApi = null;
    }
  }

  if (!otelApi) return {};

  try {
    const span = otelApi.trace.getActiveSpan?.();
    if (!span) return {};

    const ctx = span.spanContext?.();
    if (!ctx || !ctx.traceId || ctx.traceId === '00000000000000000000000000000000') {
      return {};
    }

    return {
      trace_id: ctx.traceId,
      span_id: ctx.spanId,
    };
  } catch {
    return {};
  }
}

// ============================================
// Logger 核心类
// ============================================

class Logger {
  /**
   * P1-1 修复：移除实例级 level 快照。
   * 原先 this.level 在构造时由 Logger.globalLevel 固化为数值，
   * 之后 setGlobalLevel() 修改静态变量但已有实例的 this.level 不会跟着变化。
   * 现改为通过 getter 动态读取 Logger.globalLevel。
   */
  private overrideLevel: number | null;
  private module: string;
  private pretty: boolean;
  // 注意：logger 是最早初始化的模块，在 config 加载之前就可能被使用
  // 因此这里保留 process.env 作为早期引导 fallback（已列入豁免清单）
  private static globalLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  private static logBuffer: LogEntry[] = [];
  // P2-LOG-1: 生产环境建议通过 addListener 将日志转发到 Loki/ELK，而非依赖内存缓冲区
  // 内存缓冲区仅用于诊断端点和开发环境，生产环境应配置外部日志收集器
  // 早期引导 fallback（同上）
  private static maxBufferSize = parseInt(process.env.LOG_BUFFER_SIZE || '1000', 10);
  private static listeners: Array<(entry: LogEntry) => void> = [];

  constructor(options: LoggerOptions = {}) {
    // 仅当显式传入 level 时才固化，否则动态跟随 globalLevel
    this.overrideLevel = options.level ? LOG_LEVELS[options.level] : null;
    this.module = options.module || 'app';
    // 早期引导 fallback（同上）
    this.pretty = options.pretty ?? (process.env.NODE_ENV !== 'production');
  }

  /** 动态计算当前有效级别 */
  private get effectiveLevel(): number {
    return this.overrideLevel ?? LOG_LEVELS[Logger.globalLevel];
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

  trace(data: Record<string, unknown> | string, message?: string | unknown): void {
    this.log('trace', data, message);
  }

  debug(data: Record<string, unknown> | string, message?: string | unknown): void {
    this.log('debug', data, message);
  }

  info(data: Record<string, unknown> | string, message?: string | unknown): void {
    this.log('info', data, message);
  }

  warn(data: Record<string, unknown> | string, message?: string | unknown): void {
    this.log('warn', data, message);
  }

  error(data: Record<string, unknown> | string, message?: string | unknown): void {
    this.log('error', data, message);
  }

  fatal(data: Record<string, unknown> | string, message?: string | unknown): void {
    this.log('fatal', data, message);
  }

  private log(level: LogLevel, data: Record<string, unknown> | string, message?: string | unknown): void {
    if (LOG_LEVELS[level] < this.effectiveLevel) return;

    const timestamp = new Date().toISOString();
    let msg: string;
    let extra: Record<string, unknown> = {};

    if (typeof data === 'string') {
      msg = data;
      // 当第二参数是非字符串值（如 Error 对象），将其附加到 extra
      if (message !== undefined && typeof message !== 'string') {
        extra = { err: message instanceof Error ? { message: message.message, stack: message.stack } : message };
      }
    } else {
      msg = typeof message === 'string' ? message : (message !== undefined ? String(message) : '');
      extra = data;
    }

    // P1-1: 注入 OTel trace context（仅在有活跃 span 时）
    const traceCtx = getTraceContext();

    const entry: LogEntry = {
      level,
      module: this.module,
      timestamp,
      message: msg,
      ...traceCtx,
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
      this.prettyPrint(level, timestamp, msg, extra, traceCtx);
    } else {
      // 生产环境输出 JSON 结构化日志（包含 trace_id/span_id）
      const output = level === 'error' || level === 'fatal' ? process.stderr : process.stdout;
      output.write(JSON.stringify(entry) + '\n');
    }
  }

  private prettyPrint(
    level: LogLevel,
    timestamp: string,
    msg: string,
    extra: Record<string, unknown>,
    traceCtx: { trace_id?: string; span_id?: string }
  ): void {
    const color = LEVEL_COLORS[level];
    const time = timestamp.slice(11, 23); // HH:mm:ss.SSS
    const levelStr = level.toUpperCase().padEnd(5);
    const moduleStr = `[${this.module}]`;
    
    // 在开发环境中，如果有 trace context，显示缩短的 trace_id
    const traceStr = traceCtx.trace_id 
      ? ` \x1b[90m(trace:${traceCtx.trace_id.slice(0, 8)})\x1b[0m` 
      : '';

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
    output.write(`${color}${time} ${levelStr}${RESET} ${moduleStr}${traceStr} ${msg}${extraStr}\n`);
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
