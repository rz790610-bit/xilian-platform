/**
 * Playwright E2E 配置 — 前端端到端测试
 *
 * 覆盖进化引擎所有前端页面：
 *   - 总控中心、飞轮仪表盘、世界模型、影子评估
 *   - 冠军挑战者、金丝雀部署、自愈系统、可观测性
 *
 * 运行方式：
 *   pnpm test:e2e:ui          # headless 模式
 *   pnpm test:e2e:ui:headed   # 有头模式（调试用）
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',

  /* 全局超时 */
  timeout: 30_000,
  expect: { timeout: 10_000 },

  /* 并行度 */
  fullyParallel: false, // 串行执行避免状态冲突
  workers: 1,

  /* 失败重试 */
  retries: process.env.CI ? 2 : 0,

  /* 报告 */
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'on-failure' }]],

  /* 全局配置 */
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    /* 截图策略 */
    screenshot: 'only-on-failure',
    /* 追踪策略 */
    trace: 'on-first-retry',
    /* 视频策略 */
    video: 'on-first-retry',
  },

  /* 浏览器配置 */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],

  /* 开发服务器（CI 中自动启动） */
  webServer: process.env.CI
    ? {
        command: 'pnpm dev',
        port: 3000,
        timeout: 120_000,
        reuseExistingServer: false,
      }
    : undefined,
});
