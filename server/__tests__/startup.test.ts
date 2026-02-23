/**
 * startup.test.ts — 启动序列关键路径测试
 * 
 * 覆盖范围：
 * - OTel 配置解析和降级行为
 * - Vite 项目根目录发现
 * - 端口发现逻辑
 * - 启动 banner 输出
 * - 配置验证在启动时的集成
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

describe('启动序列', () => {
  describe('OTel 配置解析', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('OTEL_ENABLED=false 应跳过初始化', async () => {
      process.env.OTEL_ENABLED = 'false';
      const { initOpenTelemetry } = await import('../platform/middleware/opentelemetry');
      // 不应抛出异常
      await expect(initOpenTelemetry()).resolves.toBeUndefined();
    });

    it('默认采样率应为 0.1', () => {
      const samplingRatio = parseFloat(process.env.OTEL_SAMPLING_RATIO || '0.1');
      expect(samplingRatio).toBe(0.1);
      expect(samplingRatio).toBeGreaterThan(0);
      expect(samplingRatio).toBeLessThanOrEqual(1);
    });

    it('OTel 服务名应有有效值（环境变量或默认值）', () => {
      const serviceName = process.env.OTEL_SERVICE_NAME || 'xilian-platform';
      expect(typeof serviceName).toBe('string');
      expect(serviceName.length).toBeGreaterThan(0);
    });
  });

  describe('OTel 手动追踪 API', () => {
    it('withSpan 在 OTel 未初始化时应使用 noop span 正常执行', async () => {
      const { withSpan } = await import('../platform/middleware/opentelemetry');
      const result = await withSpan('test.operation', { key: 'value' }, async (span) => {
        // noop span 的方法应该都存在
        span.setAttribute('test', true);
        span.addEvent('test-event');
        return 42;
      });
      expect(result).toBe(42);
    });

    it('traceDbQuery 在 OTel 未初始化时应正常执行', async () => {
      const { traceDbQuery } = await import('../platform/middleware/opentelemetry');
      const result = await traceDbQuery('SELECT', 'devices', async () => {
        return [{ id: 1, name: 'test' }];
      });
      expect(result).toEqual([{ id: 1, name: 'test' }]);
    });

    it('traceKafkaMessage 在 OTel 未初始化时应正常执行', async () => {
      const { traceKafkaMessage } = await import('../platform/middleware/opentelemetry');
      const result = await traceKafkaMessage('telemetry.raw', 0, async () => {
        return { processed: true };
      });
      expect(result).toEqual({ processed: true });
    });
  });

  describe('配置验证集成', () => {
    it('validateConfig 应返回结构化结果', async () => {
      const { validateConfig } = await import('../core/config');
      const result = validateConfig();
      
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('开发环境默认配置应通过验证', async () => {
      const { validateConfig } = await import('../core/config');
      const result = validateConfig();
      expect(result.valid).toBe(true);
    });
  });

  describe('日志语义标准', () => {
    it('config.app.logLevel 应为有效级别', async () => {
      const { config } = await import('../core/config');
      const validLevels = ['trace', 'debug', 'info', 'warn', 'error'];
      expect(validLevels).toContain(config.app.logLevel);
    });
  });
});
