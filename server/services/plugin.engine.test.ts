/**
 * 插件引擎测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PluginEngine,
  LogAnalyzerPlugin,
  DataValidatorPlugin,
  DataTransformerPlugin,
  Plugin,
  PluginMetadata,
} from './plugin.engine';

describe('插件引擎', () => {
  describe('内置插件', () => {
    it('LogAnalyzerPlugin 应该正确分析日志', async () => {
      const plugin = new LogAnalyzerPlugin();
      
      // 模拟执行上下文
      const context = {
        pluginId: plugin.metadata.id,
        config: {
          logs: [
            '[INFO] Application started',
            '[ERROR] Database connection failed',
            '[WARN] Memory usage high',
            '[INFO] Request processed',
            '[ERROR] Timeout occurred',
          ],
        },
        logger: {
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
        },
        services: {
          http: fetch,
          storage: {
            get: async () => undefined,
            set: async () => {},
            delete: async () => {},
          },
          events: {
            emit: () => {},
            on: () => {},
            off: () => {},
          },
        },
      };

      const result = await plugin.execute!(context);

      expect(result.summary.totalLines).toBe(5);
      expect(result.summary.errorCount).toBe(2);
      expect(result.summary.warnCount).toBe(1);
      expect(result.errors.length).toBe(2);
    });

    it('DataValidatorPlugin 应该正确验证数据', async () => {
      const plugin = new DataValidatorPlugin();
      
      const context = {
        pluginId: plugin.metadata.id,
        config: {
          data: {
            name: 'Test',
            age: 25,
            email: 'test@example.com',
          },
          rules: [
            { field: 'name', type: 'string', required: true },
            { field: 'age', type: 'number', required: true, min: 18, max: 100 },
            { field: 'email', type: 'string', required: true, pattern: '^[^@]+@[^@]+\\.[^@]+$' },
          ],
        },
        logger: {
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
        },
        services: {
          http: fetch,
          storage: {
            get: async () => undefined,
            set: async () => {},
            delete: async () => {},
          },
          events: {
            emit: () => {},
            on: () => {},
            off: () => {},
          },
        },
      };

      const result = await plugin.execute!(context);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('DataValidatorPlugin 应该检测无效数据', async () => {
      const plugin = new DataValidatorPlugin();
      
      const context = {
        pluginId: plugin.metadata.id,
        config: {
          data: {
            name: '',
            age: 15, // 小于最小值
          },
          rules: [
            { field: 'name', type: 'string', required: true },
            { field: 'age', type: 'number', required: true, min: 18 },
          ],
        },
        logger: {
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
        },
        services: {
          http: fetch,
          storage: {
            get: async () => undefined,
            set: async () => {},
            delete: async () => {},
          },
          events: {
            emit: () => {},
            on: () => {},
            off: () => {},
          },
        },
      };

      const result = await plugin.execute!(context);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });

    it('DataTransformerPlugin 应该正确转换为 JSON', async () => {
      const plugin = new DataTransformerPlugin();
      
      const context = {
        pluginId: plugin.metadata.id,
        config: {
          data: { name: 'Test', value: 123 },
          targetFormat: 'json',
        },
        logger: {
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
        },
        services: {
          http: fetch,
          storage: {
            get: async () => undefined,
            set: async () => {},
            delete: async () => {},
          },
          events: {
            emit: () => {},
            on: () => {},
            off: () => {},
          },
        },
      };

      const result = await plugin.execute!(context);

      expect(result.format).toBe('json');
      expect(typeof result.transformed).toBe('string');
      expect(JSON.parse(result.transformed as string)).toEqual({ name: 'Test', value: 123 });
    });

    it('DataTransformerPlugin 应该正确转换为 CSV', async () => {
      const plugin = new DataTransformerPlugin();
      
      const context = {
        pluginId: plugin.metadata.id,
        config: {
          data: [
            { name: 'Alice', age: 30 },
            { name: 'Bob', age: 25 },
          ],
          targetFormat: 'csv',
        },
        logger: {
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
        },
        services: {
          http: fetch,
          storage: {
            get: async () => undefined,
            set: async () => {},
            delete: async () => {},
          },
          events: {
            emit: () => {},
            on: () => {},
            off: () => {},
          },
        },
      };

      const result = await plugin.execute!(context);

      expect(result.format).toBe('csv');
      expect(result.transformed).toContain('name,age');
      expect(result.transformed).toContain('Alice,30');
      expect(result.transformed).toContain('Bob,25');
    });
  });

  describe('插件引擎核心', () => {
    let engine: PluginEngine;

    beforeEach(() => {
      engine = new PluginEngine();
    });

    it('应该自动安装内置插件', () => {
      const plugins = engine.getAllPlugins();
      
      expect(plugins.length).toBeGreaterThanOrEqual(4);
      expect(plugins.some(p => p.id === 'builtin-log-analyzer')).toBe(true);
      expect(plugins.some(p => p.id === 'builtin-data-validator')).toBe(true);
      expect(plugins.some(p => p.id === 'builtin-alert-notifier')).toBe(true);
      expect(plugins.some(p => p.id === 'builtin-data-transformer')).toBe(true);
    });

    it('应该能够启用和禁用插件', async () => {
      await engine.enablePlugin('builtin-log-analyzer');
      let status = engine.getPluginStatus('builtin-log-analyzer');
      expect(status?.status).toBe('enabled');

      await engine.disablePlugin('builtin-log-analyzer');
      status = engine.getPluginStatus('builtin-log-analyzer');
      expect(status?.status).toBe('disabled');
    });

    it('应该能够执行已启用的插件', async () => {
      await engine.enablePlugin('builtin-data-transformer');
      
      const result = await engine.executePlugin('builtin-data-transformer', {
        data: { test: 'value' },
        targetFormat: 'json',
      });

      expect(result).toBeDefined();
    });

    it('执行未启用的插件应该抛出错误', async () => {
      // 确保插件未启用
      const status = engine.getPluginStatus('builtin-log-analyzer');
      if (status?.status === 'enabled') {
        await engine.disablePlugin('builtin-log-analyzer');
      }

      await expect(engine.executePlugin('builtin-log-analyzer', {}))
        .rejects.toThrow('not enabled');
    });

    it('应该能够按类型获取插件', () => {
      const processors = engine.getPluginsByType('processor');
      const analyzers = engine.getPluginsByType('analyzer');

      expect(processors.length).toBeGreaterThan(0);
      expect(analyzers.length).toBeGreaterThan(0);
    });

    it('应该能够更新插件配置', async () => {
      await engine.updatePluginConfig('builtin-alert-notifier', {
        webhookUrl: 'https://example.com/webhook',
      });

      const status = engine.getPluginStatus('builtin-alert-notifier');
      expect(status?.config.webhookUrl).toBe('https://example.com/webhook');
    });

    it('应该能够进行健康检查', async () => {
      await engine.enablePlugin('builtin-log-analyzer');
      
      const results = await engine.healthCheckAll();
      
      expect(results.length).toBeGreaterThan(0);
      const logAnalyzerResult = results.find(r => r.pluginId === 'builtin-log-analyzer');
      expect(logAnalyzerResult?.healthy).toBe(true);
    });

    it('安装自定义插件', async () => {
      const customPlugin: Plugin = {
        metadata: {
          id: 'custom-test-plugin',
          name: '自定义测试插件',
          version: '1.0.0',
          type: 'utility',
          entryPoint: 'custom',
        },
        async execute(context) {
          return { message: 'Custom plugin executed', config: context.config };
        },
      };

      await engine.installPlugin(customPlugin);
      
      const status = engine.getPluginStatus('custom-test-plugin');
      expect(status).not.toBeNull();
      expect(status?.metadata.name).toBe('自定义测试插件');
    });
  });
});
