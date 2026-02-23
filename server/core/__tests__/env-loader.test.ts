/**
 * env-loader 分层加载器测试
 * 整改方案 v2.1 — B-05 配置管理分层
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { config as dotenvConfig } from 'dotenv';

// Mock fs 和 dotenv
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

const mockedExistsSync = vi.mocked(existsSync);
const mockedDotenvConfig = vi.mocked(dotenvConfig);

describe('env-loader 分层加载器', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockedExistsSync.mockReset();
    mockedDotenvConfig.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('应该按优先级顺序加载配置文件', async () => {
    process.env.NODE_ENV = 'development';
    mockedExistsSync.mockReturnValue(true);
    mockedDotenvConfig.mockReturnValue({ parsed: {} });

    const mod = await import('../env-loader');

    // 应该加载了 3 个文件
    expect(mod.loadedEnvFiles).toContain('.env.development');
    expect(mod.loadedEnvFiles).toContain('.env.local');
    expect(mod.loadedEnvFiles).toContain('.env');
  });

  it('应该跳过不存在的配置文件', async () => {
    process.env.NODE_ENV = 'development';
    // 只有 .env.development 存在
    mockedExistsSync.mockImplementation((path: any) => {
      return String(path).endsWith('.env.development');
    });
    mockedDotenvConfig.mockReturnValue({ parsed: {} });

    const mod = await import('../env-loader');

    expect(mod.loadedEnvFiles).toEqual(['.env.development']);
  });

  it('production 模式应该加载 .env.production', async () => {
    process.env.NODE_ENV = 'production';
    mockedExistsSync.mockImplementation((path: any) => {
      return String(path).endsWith('.env.production');
    });
    mockedDotenvConfig.mockReturnValue({ parsed: {} });

    const mod = await import('../env-loader');

    expect(mod.loadedEnvFiles).toContain('.env.production');
    expect(mod.loadedEnvFiles).not.toContain('.env.development');
  });

  it('没有任何配置文件时应该返回空数组', async () => {
    process.env.NODE_ENV = 'test';
    mockedExistsSync.mockReturnValue(false);

    const mod = await import('../env-loader');

    expect(mod.loadedEnvFiles).toEqual([]);
  });

  it('应该使用 override: true 调用 dotenv', async () => {
    process.env.NODE_ENV = 'development';
    mockedExistsSync.mockReturnValue(true);
    mockedDotenvConfig.mockReturnValue({ parsed: {} });

    await import('../env-loader');

    // 每次调用都应该使用 override: true
    for (const call of mockedDotenvConfig.mock.calls) {
      expect(call[0]).toHaveProperty('override', true);
    }
  });
});
