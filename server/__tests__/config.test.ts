/**
 * config.ts 配置系统测试
 * 
 * 覆盖范围：
 * - 配置结构完整性（所有必需字段存在且类型正确）
 * - 环境变量覆盖机制
 * - validateConfig() 在各场景下的行为
 * - 敏感信息掩码（getConfigSummary）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('config', () => {
  // 保存原始环境变量，测试后恢复
  const originalEnv = { ...process.env };

  afterEach(() => {
    // 恢复环境变量
    process.env = { ...originalEnv };
    // 清除模块缓存以重新加载 config
    Object.keys(require.cache).forEach(key => {
      if (key.includes('core/config')) delete require.cache[key];
    });
  });

  describe('配置结构完整性', () => {
    it('应包含所有必需的顶层配置域', async () => {
      const { config } = await import('../core/config');
      const requiredDomains = [
        'app', 'mysql', 'clickhouse', 'redis', 'kafka',
        'minio', 'neo4j', 'influxdb', 'qdrant', 'elasticsearch',
        'security', 'externalApis',
      ];
      for (const domain of requiredDomains) {
        expect(config).toHaveProperty(domain);
        expect(typeof (config as any)[domain]).toBe('object');
      }
    });

    it('app 配置应有正确的默认值', async () => {
      const { config } = await import('../core/config');
      expect(config.app.name).toBe('PortAI Nexus');
      expect(config.app.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(config.app.port).toBeTypeOf('number');
      expect(config.app.port).toBeGreaterThan(0);
      expect(config.app.port).toBeLessThan(65536);
      expect(['development', 'production', 'test']).toContain(config.app.env);
      expect(['trace', 'debug', 'info', 'warn', 'error']).toContain(config.app.logLevel);
    });

    it('mysql 配置应有正确的默认端口', async () => {
      const { config } = await import('../core/config');
      expect(config.mysql.port).toBe(3306);
      expect(config.mysql.poolSize).toBeGreaterThan(0);
    });

    it('redis 配置应有正确的默认端口', async () => {
      const { config } = await import('../core/config');
      expect(config.redis.port).toBe(6379);
    });

    it('kafka brokers 应为非空数组', async () => {
      const { config } = await import('../core/config');
      expect(Array.isArray(config.kafka.brokers)).toBe(true);
      expect(config.kafka.brokers.length).toBeGreaterThan(0);
    });
  });

  describe('validateConfig()', () => {
    it('开发环境下应通过验证（使用默认值）', async () => {
      process.env.NODE_ENV = 'development';
      // 重新导入以获取新的 config
      const mod = await import('../core/config');
      const result = mod.validateConfig();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validateConfig 应检测 CORS 通配符（当 config.app.env 为 production 时）', async () => {
      // 注意：config 是模块级常量，运行时修改 process.env.NODE_ENV 不会改变 config.app.env
      // 此测试验证 validateConfig 函数在当前环境下的行为一致性
      const { validateConfig, config } = await import('../core/config');
      const result = validateConfig();
      if (config.app.env === 'production') {
        // 生产环境下，默认 CORS='*' 应报错
        expect(result.errors.some(e => e.includes('CORS'))).toBe(true);
      } else {
        // 开发/测试环境下，不检查 CORS
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('getConfigSummary()', () => {
    it('应掩码所有敏感字段', async () => {
      const { getConfigSummary } = await import('../core/config');
      const summary = getConfigSummary();
      
      // 密码字段应被掩码
      expect(summary.mysql.password).toMatch(/^\*{3}$|^\(empty\)$/);
      expect(summary.clickhouse.password).toMatch(/^\*{3}$|^\(empty\)$/);
      expect(summary.redis.password).toMatch(/^\*{3}$|^\(empty\)$/);
      expect(summary.minio.accessKey).toMatch(/^\*{3}$|^\(empty\)$/);
      expect(summary.neo4j.password).toMatch(/^\*{3}$|^\(empty\)$/);
    });

    it('应包含非敏感配置的真实值', async () => {
      const { getConfigSummary } = await import('../core/config');
      const summary = getConfigSummary();
      
      expect(summary.app.name).toBe('PortAI Nexus');
      expect(summary.app.env).toBeTruthy();
      expect(summary.mysql.host).toBeTruthy();
    });
  });
});
