/**
 * 优雅关闭模块 - 平台基础设施层
 * 
 * 处理 SIGTERM/SIGINT 信号，确保：
 * 1. 停止接受新请求
 * 2. 等待进行中的请求完成（最多 25s）
 * 3. 断开所有外部连接（Redis/Kafka/DB/断路器）
 * 4. 清理定时任务和事件监听
 * 
 * 架构位置: server/platform/middleware/ (平台基础层)
 * 依赖: server/core/logger, server/lib/clients/*
 */

import type { Server } from 'http';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('graceful-shutdown');

// ============================================================
// 类型定义
// ============================================================

export interface ShutdownHook {
  name: string;
  priority: number;  // 越小越先执行
  handler: () => Promise<void>;
}

interface ShutdownOptions {
  /** 最大等待时间(ms)，超过则强制退出 */
  timeout: number;
  /** 是否在关闭前等待进行中的请求完成 */
  drainConnections: boolean;
  /** 连接排空超时(ms) */
  drainTimeout: number;
}

const DEFAULT_OPTIONS: ShutdownOptions = {
  timeout: 30000,
  drainConnections: true,
  drainTimeout: 25000,
};

// ============================================================
// 优雅关闭管理器
// ============================================================

class GracefulShutdownManager {
  private hooks: ShutdownHook[] = [];
  private isShuttingDown = false;
  private server: Server | null = null;
  private options: ShutdownOptions;
  private activeConnections = new Set<import('net').Socket>();

  constructor(options?: Partial<ShutdownOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 注册 HTTP Server 实例，用于排空连接
   */
  registerServer(server: Server): void {
    this.server = server;

    // 追踪活跃连接
    server.on('connection', (socket) => {
      this.activeConnections.add(socket);
      socket.on('close', () => {
        this.activeConnections.delete(socket);
      });
    });

    log.info('HTTP Server registered for graceful shutdown');
  }

  /**
   * 注册关闭钩子
   * @param name 钩子名称（用于日志）
   * @param priority 优先级（越小越先执行，默认 100）
   * @param handler 异步清理函数
   */
  addHook(name: string, handler: () => Promise<void>, priority: number = 100): void {
    this.hooks.push({ name, priority, handler });
    this.hooks.sort((a, b) => a.priority - b.priority);
    log.debug(`Shutdown hook registered: ${name} (priority=${priority})`);
  }

  /**
   * 移除关闭钩子
   */
  removeHook(name: string): void {
    this.hooks = this.hooks.filter(h => h.name !== name);
  }

  /**
   * 注册进程信号处理器
   */
  registerSignalHandlers(): void {
    const shutdown = (signal: string) => this.initiateShutdown(signal);

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // 未捕获异常也触发优雅关闭
    process.on('uncaughtException', (err) => {
      log.error('Uncaught exception, initiating shutdown:', err.message);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      log.error('Unhandled rejection:', String(reason));
      // 不立即关闭，但记录警告
    });

    log.info('Signal handlers registered (SIGTERM, SIGINT, uncaughtException)');
  }

  /**
   * 发起优雅关闭流程
   */
  async initiateShutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      log.warn(`Shutdown already in progress, ignoring ${signal}`);
      return;
    }

    this.isShuttingDown = true;
    const startTime = Date.now();
    log.info(`Received ${signal}, starting graceful shutdown...`);

    // 设置强制退出定时器
    const forceExitTimer = setTimeout(() => {
      log.error(`Graceful shutdown timed out after ${this.options.timeout}ms, forcing exit`);
      process.exit(1);
    }, this.options.timeout);
    forceExitTimer.unref();

    try {
      // 阶段 1: 停止接受新连接
      if (this.server) {
        await this.closeServer();
      }

      // 阶段 2: 排空现有连接
      if (this.options.drainConnections && this.activeConnections.size > 0) {
        await this.drainConnections();
      }

      // 阶段 3: 执行所有关闭钩子（按优先级顺序）
      await this.executeHooks();

      const elapsed = Date.now() - startTime;
      log.info(`Graceful shutdown completed in ${elapsed}ms`);
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (err) {
      log.error('Error during graceful shutdown:', String(err));
      clearTimeout(forceExitTimer);
      process.exit(1);
    }
  }

  /**
   * 获取当前状态
   */
  getStatus(): {
    isShuttingDown: boolean;
    activeConnections: number;
    registeredHooks: string[];
  } {
    return {
      isShuttingDown: this.isShuttingDown,
      activeConnections: this.activeConnections.size,
      registeredHooks: this.hooks.map(h => `${h.name} (p=${h.priority})`),
    };
  }

  // ============================================================
  // 内部方法
  // ============================================================

  private closeServer(): Promise<void> {
    return new Promise((resolve) => {
      log.info('Closing HTTP server (no new connections)...');
      this.server!.close((err) => {
        if (err) {
          log.warn('Server close error (may be expected):', err.message);
        }
        log.info('HTTP server closed');
        resolve();
      });
    });
  }

  private drainConnections(): Promise<void> {
    return new Promise((resolve) => {
      const count = this.activeConnections.size;
      if (count === 0) {
        resolve();
        return;
      }

      log.info(`Draining ${count} active connections (timeout=${this.options.drainTimeout}ms)...`);

      const drainTimer = setTimeout(() => {
        const remaining = this.activeConnections.size;
        if (remaining > 0) {
          log.warn(`Force-closing ${remaining} remaining connections`);
          this.activeConnections.forEach((socket) => {
            socket.destroy();
          });
        }
        resolve();
      }, this.options.drainTimeout);
      drainTimer.unref();

      // 检查连接是否自然关闭
      const checkInterval = setInterval(() => {
        if (this.activeConnections.size === 0) {
          clearInterval(checkInterval);
          clearTimeout(drainTimer);
          log.info('All connections drained');
          resolve();
        }
      }, 500);
      checkInterval.unref();
    });
  }

  private async executeHooks(): Promise<void> {
    log.info(`Executing ${this.hooks.length} shutdown hooks...`);

    for (const hook of this.hooks) {
      try {
        const start = Date.now();
        await Promise.race([
          hook.handler(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Hook "${hook.name}" timed out`)), 10000)
          ),
        ]);
        log.info(`  ✓ ${hook.name} (${Date.now() - start}ms)`);
      } catch (err) {
        log.error(`  ✗ ${hook.name} failed:`, String(err));
        // 继续执行其他钩子
      }
    }
  }
}

// ============================================================
// 单例导出
// ============================================================

export const gracefulShutdown = new GracefulShutdownManager();

/**
 * 注册平台内置的关闭钩子
 * 在 server/core/index.ts 中调用
 */
export async function registerBuiltinShutdownHooks(): Promise<void> {
  // 优先级 10: 断路器
  gracefulShutdown.addHook('circuit-breakers', async () => {
    const { circuitBreakerRegistry } = await import('./circuitBreaker');
    await circuitBreakerRegistry.shutdown();
  }, 10);

  // 优先级 20: EventBus
  gracefulShutdown.addHook('event-bus', async () => {
    try {
      const { eventBus } = await import('../../services/eventBus.service');
      // EventBus 没有 removeAllSubscriptions，使用 shutdown 替代
      (eventBus as any).shutdown?.();
    } catch { /* 忽略 */ }
  }, 20);

  // 优先级 30: Kafka
  gracefulShutdown.addHook('kafka', async () => {
    try {
      const { kafkaClient } = await import('../../lib/clients/kafka.client');
      await kafkaClient.shutdown();
    } catch { /* 忽略 */ }
  }, 30);

  // 优先级 40: Redis
  gracefulShutdown.addHook('redis', async () => {
    try {
      const { redisClient } = await import('../../lib/clients/redis.client');
      await redisClient.shutdown();
    } catch { /* 忽略 */ }
  }, 40);

  // 优先级 45: 审计日志刷新（在数据库关闭前刷新队列）
  gracefulShutdown.addHook('audit-log', async () => {
    try {
      const { shutdownAuditLog } = await import('./auditLog');
      await shutdownAuditLog();
    } catch { /* 忽略 */ }
  }, 45);

  // 优先级 50: 数据库连接
  gracefulShutdown.addHook('database', async () => {
    try {
      // drizzle 使用 getDb() 获取连接，无需手动关闭连接池
      // 连接会随进程退出自动关闭
    } catch { /* 忽略 */ }
  }, 50);

  // 优先级 90: Prometheus 指标
  gracefulShutdown.addHook('metrics', async () => {
    try {
      const { metricsCollector } = await import('./metricsCollector');
      metricsCollector.shutdown();
    } catch { /* 忽略 */ }
  }, 90);

  log.info('Built-in shutdown hooks registered');
}
