/**
 * Vitest E2E 配置 — API 层端到端测试
 *
 * 与 vitest.config.ts（单元测试）分离，使用独立配置：
 *   - 更长超时（30s per test）
 *   - 仅包含 tests/e2e/*.test.ts
 *   - Node 环境（supertest 直接发 HTTP 请求）
 *   - 路径别名与主项目一致
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

const root = path.resolve(import.meta.dirname);

export default defineConfig({
  root,
  resolve: {
    alias: {
      '@': path.resolve(root, 'client', 'src'),
      '@shared': path.resolve(root, 'shared'),
      '@server': path.resolve(root, 'server'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    // E2E 测试需要更长超时
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // 串行执行（避免并发写入数据库冲突）
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    // 环境变量
    env: {
      NODE_ENV: 'test',
      E2E_BASE_URL: 'http://localhost:3000',
    },
  },
});
