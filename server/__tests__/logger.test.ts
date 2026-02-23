/**
 * logger.ts 日志系统测试
 * 
 * 覆盖范围：
 * - 日志级别过滤行为
 * - 全局级别动态切换（P1-1 修复验证）
 * - 模块日志器创建和子日志器
 * - 日志缓冲区和监听器
 * - 结构化日志输出格式
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger, createModuleLogger, setLogLevel, addLogListener, getRecentLogs } from '../core/logger';

describe('Logger', () => {
  beforeEach(() => {
    // 重置全局级别为 info
    setLogLevel('info');
  });

  describe('日志级别过滤', () => {
    it('info 级别应过滤 debug 和 trace', () => {
      const log = createModuleLogger('test');
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      log.debug('should not appear');
      log.trace('should not appear');
      expect(spy).not.toHaveBeenCalled();

      log.info('should appear');
      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockRestore();
    });

    it('warn 和 error 应始终输出（在 info 级别下）', () => {
      const log = createModuleLogger('test');
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      log.warn('warning message');
      log.error('error message');
      // warn 输出到 stdout，error 输出到 stderr
      expect(stdoutSpy.mock.calls.length + stderrSpy.mock.calls.length).toBe(2);

      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    });
  });

  describe('全局级别动态切换（P1-1 修复验证）', () => {
    it('setGlobalLevel 应影响已创建的日志器实例', () => {
      const log = createModuleLogger('test-dynamic');
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      // 初始 info 级别，debug 不输出
      log.debug('hidden');
      expect(spy).not.toHaveBeenCalled();

      // 切换到 debug 级别
      setLogLevel('debug');
      log.debug('now visible');
      expect(spy).toHaveBeenCalledTimes(1);

      // 切换回 info 级别
      setLogLevel('info');
      log.debug('hidden again');
      expect(spy).toHaveBeenCalledTimes(1); // 没有新增调用

      spy.mockRestore();
    });
  });

  describe('模块日志器', () => {
    it('createModuleLogger 应创建带模块名的日志器', () => {
      const log = createModuleLogger('mqtt-adapter');
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      log.info('connected');
      expect(spy).toHaveBeenCalledTimes(1);
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('[mqtt-adapter]');
      expect(output).toContain('connected');

      spy.mockRestore();
    });

    it('child() 应创建带层级模块名的子日志器', () => {
      const log = createModuleLogger('kafka');
      const childLog = log.child('consumer');
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      childLog.info('message received');
      expect(spy).toHaveBeenCalledTimes(1);
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('[kafka:consumer]');

      spy.mockRestore();
    });
  });

  describe('日志监听器', () => {
    it('addLogListener 应接收所有日志事件', () => {
      const entries: any[] = [];
      const unsubscribe = addLogListener((entry) => entries.push(entry));
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const log = createModuleLogger('test-listener');
      log.info('test message');
      log.warn('warning');

      expect(entries).toHaveLength(2);
      expect(entries[0].level).toBe('info');
      expect(entries[0].message).toBe('test message');
      expect(entries[1].level).toBe('warn');

      unsubscribe();
      log.info('after unsubscribe');
      expect(entries).toHaveLength(2); // 不再增加

      spy.mockRestore();
    });
  });

  describe('日志缓冲区', () => {
    it('getRecentLogs 应返回最近的日志条目', () => {
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const log = createModuleLogger('test-buffer');

      log.info('entry 1');
      log.info('entry 2');
      log.info('entry 3');

      const recent = getRecentLogs(3);
      expect(recent.length).toBeGreaterThanOrEqual(3);
      // 最后三条应包含我们的消息
      const last3 = recent.slice(-3);
      expect(last3[0].message).toBe('entry 1');
      expect(last3[1].message).toBe('entry 2');
      expect(last3[2].message).toBe('entry 3');

      spy.mockRestore();
    });
  });

  describe('结构化日志（生产模式）', () => {
    it('非 pretty 模式应输出 JSON 格式', () => {
      // 创建一个非 pretty 的日志器
      const log = new Logger({ module: 'json-test', pretty: false });
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      log.info({ userId: 123 }, 'user login');
      expect(spy).toHaveBeenCalledTimes(1);
      
      const output = spy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());
      expect(parsed.level).toBe('info');
      expect(parsed.module).toBe('json-test');
      expect(parsed.message).toBe('user login');
      expect(parsed.userId).toBe(123);

      spy.mockRestore();
    });
  });
});
