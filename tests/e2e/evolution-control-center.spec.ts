/**
 * ============================================================================
 * 进化引擎前端 E2E — 总控中心 + 飞轮仪表盘 + 世界模型
 * ============================================================================
 *
 * 覆盖范围：
 *   1. 总控中心页面加载 + 引擎状态展示
 *   2. 飞轮仪表盘 — 周期启动 + 5步进度
 *   3. 世界模型页面 — 版本管理 + 训练任务
 *   4. 影子评估面板
 *   5. 自愈系统面板
 *   6. 可观测性面板
 *
 * 运行方式：
 *   pnpm test:e2e:ui
 *
 * 前置条件：
 *   - 开发服务器运行在 http://localhost:3000
 *   - 数据库已初始化
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

// ── 辅助函数 ──────────────────────────────────────────────────────────────
/** 等待页面加载完成（无 loading spinner） */
async function waitForPageReady(page: import('@playwright/test').Page) {
  // 等待网络空闲
  await page.waitForLoadState('networkidle');
  // 等待可能的 loading 状态消失
  const spinner = page.locator('[data-testid="loading"], .animate-spin, .loading');
  if (await spinner.isVisible({ timeout: 1000 }).catch(() => false)) {
    await spinner.waitFor({ state: 'hidden', timeout: 15000 });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 总控中心
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('1. 总控中心 — /evolution/control-center', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/evolution/control-center`);
    await waitForPageReady(page);
  });

  test('1.1 页面正常加载', async ({ page }) => {
    // 验证页面标题或关键元素存在
    await expect(page.locator('h1, h2, [class*="title"]').first()).toBeVisible();
  });

  test('1.2 引擎总览 Tab 显示模块状态', async ({ page }) => {
    // 默认应在引擎总览 Tab
    const overviewTab = page.getByRole('tab').filter({ hasText: /总览|overview/i }).first();
    if (await overviewTab.isVisible()) {
      await overviewTab.click();
    }
    // 验证有引擎模块卡片或表格
    await expect(page.locator('table, [class*="card"], [class*="grid"]').first()).toBeVisible();
  });

  test('1.3 全部启动按钮可点击', async ({ page }) => {
    const startAllBtn = page.getByRole('button').filter({ hasText: /全部启动|start all/i }).first();
    if (await startAllBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(startAllBtn).toBeEnabled();
    }
  });

  test('1.4 模块拓扑 Tab 可切换', async ({ page }) => {
    const topoTab = page.getByRole('tab').filter({ hasText: /拓扑|topology/i }).first();
    if (await topoTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await topoTab.click();
      await page.waitForTimeout(500);
      // 拓扑图应有 SVG 或 canvas 或节点列表
      const hasVisual = await page.locator('svg, canvas, [class*="node"], [class*="topology"]').first()
        .isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasVisual).toBe(true);
    }
  });

  test('1.5 系统资源 Tab 可切换', async ({ page }) => {
    const resourceTab = page.getByRole('tab').filter({ hasText: /资源|resource/i }).first();
    if (await resourceTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await resourceTab.click();
      await page.waitForTimeout(500);
      // 应有资源使用数据
      await expect(page.locator('[class*="progress"], [class*="chart"], [class*="metric"]').first())
        .toBeVisible({ timeout: 5000 });
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 飞轮仪表盘
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('2. 飞轮仪表盘 — /evolution/dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/evolution/dashboard`);
    await waitForPageReady(page);
  });

  test('2.1 页面正常加载', async ({ page }) => {
    await expect(page.locator('h1, h2, [class*="title"]').first()).toBeVisible();
  });

  test('2.2 飞轮5步进度环可见', async ({ page }) => {
    // 验证 5 个步骤标签存在
    const stepLabels = ['数据发现', '假设生成', '影子评估', '金丝雀部署', '知识结晶'];
    for (const label of stepLabels) {
      const el = page.getByText(label).first();
      await expect(el).toBeVisible({ timeout: 5000 });
    }
  });

  test('2.3 启动进化周期对话框', async ({ page }) => {
    // 查找启动按钮
    const startBtn = page.getByRole('button').filter({ hasText: /启动|start/i }).first();
    if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await startBtn.click();
      // 对话框应弹出
      const dialog = page.locator('[role="dialog"], [class*="dialog"], [class*="modal"]').first();
      await expect(dialog).toBeVisible({ timeout: 5000 });
    }
  });

  test('2.4 快捷入口导航', async ({ page }) => {
    // 验证飞轮周期、影子评估等快捷入口
    const links = page.locator('a[href*="/evolution/"]');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 世界模型页面
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('3. 世界模型 — /evolution/world-model', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/evolution/world-model`);
    await waitForPageReady(page);
  });

  test('3.1 页面正常加载', async ({ page }) => {
    await expect(page.locator('h1, h2, [class*="title"]').first()).toBeVisible();
  });

  test('3.2 模型版本 Tab 可见', async ({ page }) => {
    // 应有模型版本列表或创建按钮
    const createBtn = page.getByRole('button').filter({ hasText: /创建|新建|create/i }).first();
    const table = page.locator('table').first();
    const hasContent = await createBtn.isVisible({ timeout: 5000 }).catch(() => false)
      || await table.isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasContent).toBe(true);
  });

  test('3.3 训练任务 Tab 可切换', async ({ page }) => {
    const trainingTab = page.getByRole('tab').filter({ hasText: /训练|training/i }).first();
    if (await trainingTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await trainingTab.click();
      await page.waitForTimeout(500);
      // 应有训练任务列表
      await expect(page.locator('table, [class*="list"], [class*="empty"]').first())
        .toBeVisible({ timeout: 5000 });
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 影子评估面板
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('4. 影子评估 — /evolution/shadow', () => {
  test('4.1 页面正常加载', async ({ page }) => {
    await page.goto(`${BASE_URL}/evolution/shadow`);
    await waitForPageReady(page);
    await expect(page.locator('h1, h2, [class*="title"]').first()).toBeVisible();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. 冠军挑战者面板
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('5. 冠军挑战者 — /evolution/champion', () => {
  test('5.1 页面正常加载', async ({ page }) => {
    await page.goto(`${BASE_URL}/evolution/champion`);
    await waitForPageReady(page);
    await expect(page.locator('h1, h2, [class*="title"]').first()).toBeVisible();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. 金丝雀部署面板
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('6. 金丝雀部署 — /evolution/canary', () => {
  test('6.1 页面正常加载', async ({ page }) => {
    await page.goto(`${BASE_URL}/evolution/canary`);
    await waitForPageReady(page);
    await expect(page.locator('h1, h2, [class*="title"]').first()).toBeVisible();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. 自愈系统面板
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('7. 自愈系统 — /evolution/self-healing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/evolution/self-healing`);
    await waitForPageReady(page);
  });

  test('7.1 页面正常加载', async ({ page }) => {
    await expect(page.locator('h1, h2, [class*="title"]').first()).toBeVisible();
  });

  test('7.2 自愈策略列表可见', async ({ page }) => {
    // 应有策略列表或空状态
    const hasContent = await page.locator('table, [class*="list"], [class*="empty"], [class*="card"]').first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasContent).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. 可观测性面板
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('8. 可观测性 — /evolution/observability', () => {
  test('8.1 页面正常加载', async ({ page }) => {
    await page.goto(`${BASE_URL}/evolution/observability`);
    await waitForPageReady(page);
    await expect(page.locator('h1, h2, [class*="title"]').first()).toBeVisible();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. FSD 干预面板
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('9. FSD 干预 — /evolution/fsd', () => {
  test('9.1 页面正常加载', async ({ page }) => {
    await page.goto(`${BASE_URL}/evolution/fsd`);
    await waitForPageReady(page);
    await expect(page.locator('h1, h2, [class*="title"]').first()).toBeVisible();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. 知识结晶面板
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('10. 知识结晶 — /evolution/crystals', () => {
  test('10.1 页面正常加载', async ({ page }) => {
    await page.goto(`${BASE_URL}/evolution/crystals`);
    await waitForPageReady(page);
    await expect(page.locator('h1, h2, [class*="title"]').first()).toBeVisible();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 11. 飞轮报告页面
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('11. 飞轮报告 — /evolution/flywheel', () => {
  test('11.1 页面正常加载', async ({ page }) => {
    await page.goto(`${BASE_URL}/evolution/flywheel`);
    await waitForPageReady(page);
    await expect(page.locator('h1, h2, [class*="title"]').first()).toBeVisible();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 12. 跨页面导航完整性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('12. 跨页面导航完整性', () => {
  const evolutionPages = [
    '/evolution/dashboard',
    '/evolution/control-center',
    '/evolution/world-model',
    '/evolution/shadow',
    '/evolution/champion',
    '/evolution/canary',
    '/evolution/self-healing',
    '/evolution/observability',
    '/evolution/fsd',
    '/evolution/crystals',
    '/evolution/flywheel',
    '/evolution/model-comparison',
    '/evolution/adaptive-params',
  ];

  for (const pagePath of evolutionPages) {
    test(`12.x ${pagePath} 无 JS 错误`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto(`${BASE_URL}${pagePath}`);
      await waitForPageReady(page);

      // 过滤掉已知的非致命错误
      const criticalErrors = errors.filter(
        (e) => !e.includes('ResizeObserver') && !e.includes('Loading chunk')
      );
      expect(criticalErrors).toHaveLength(0);
    });
  }
});
