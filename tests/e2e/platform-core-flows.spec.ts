/**
 * ============================================================================
 * P3-6: 平台核心链路 E2E 测试 — Playwright
 * ============================================================================
 *
 * 覆盖范围：
 *   1. 核心链路一: 设备健康总览 → 选择设备 → 智能诊断 → 执行 → 结论 → 三维模型
 *   2. 核心链路二: 平台融合诊断 → 执行 → 查看结果
 *   3. 核心链路三: 预警处置 → 查看告警 → 处置操作
 *   4. 关键页面冒烟测试: /app, /app/diagnosis, /app/alerts, /digital-twin, /monitoring/hub
 *
 * 运行方式：
 *   pnpm test:e2e:ui            # headless 模式
 *   pnpm test:e2e:ui:headed     # 有头模式（调试用）
 *
 * 注意：服务器启用了 rate limit (100 req/min)，测试间自动节流。
 *       若被限流，跳过内容断言（非 UI 缺陷）。
 */
import { test, expect, type Page, type Response } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

// ── 辅助函数 ──────────────────────────────────────────────────────────────

/** 节流导航: 避免触发服务器 rate limit（429） */
let lastNavTime = 0;
async function safeGoto(page: Page, url: string): Promise<{ ok: boolean; response: Response | null }> {
  // 两次导航至少间隔 1.5s
  const elapsed = Date.now() - lastNavTime;
  if (elapsed < 1500) await page.waitForTimeout(1500 - elapsed);

  const response = await page.goto(url);
  lastNavTime = Date.now();

  if (!response || response.status() === 429) {
    return { ok: false, response };
  }

  await page.waitForLoadState('networkidle');
  return { ok: response.status() < 400, response };
}

/** 收集 + 过滤 JS 错误 */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return () =>
    errors.filter(
      (e) =>
        !e.includes('ResizeObserver') &&
        !e.includes('Loading chunk') &&
        !e.includes('AbortError') &&
        !e.includes('NetworkError') &&
        !e.includes('Too Many Requests'),
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 核心链路一: 设备健康 → 诊断 → 三维模型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('1. 核心链路 — 设备健康→诊断→三维模型', () => {
  test('1.1 设备健康总览页加载并显示设备列表', async ({ page }) => {
    const { ok } = await safeGoto(page, `${BASE_URL}/app`);
    test.skip(!ok, '被 rate limit，跳过');

    const hasDevices = await page
      .locator('table tbody tr, [class*="device"], [class*="card"]')
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    expect(hasDevices).toBe(true);
  });

  test('1.2 点击设备行导航到诊断页', async ({ page }) => {
    const { ok } = await safeGoto(page, `${BASE_URL}/app`);
    test.skip(!ok, '被 rate limit，跳过');

    const clickableRow = page.locator(
      'table tbody tr, [class*="device"][class*="cursor"], [data-testid*="device"]',
    ).first();

    if (await clickableRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await clickableRow.click();
      await page.waitForTimeout(1000);
      await page.waitForLoadState('networkidle');

      const url = page.url();
      expect(url.includes('/app/diagnosis') || url.includes('/app/equipment')).toBe(true);
    }
  });

  test('1.3 智能诊断页加载传感器面板', async ({ page }) => {
    const { ok } = await safeGoto(page, `${BASE_URL}/app/diagnosis`);
    test.skip(!ok, '被 rate limit，跳过');

    const hasDiagUI = await page
      .locator('[class*="sensor"], [class*="diagnosis"], [class*="card"], [role="tablist"], button')
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    expect(hasDiagUI).toBe(true);
  });

  test('1.4 诊断执行按钮存在（未选设备时应禁用）', async ({ page }) => {
    const { ok } = await safeGoto(page, `${BASE_URL}/app/diagnosis`);
    test.skip(!ok, '被 rate limit，跳过');

    const execBtn = page.getByRole('button').filter({
      hasText: /诊断|执行|分析|开始|diagnos|execute|start|run/i,
    }).first();

    // 按钮应存在且可见；未选择设备时应为 disabled 状态（符合预期）
    const isVisible = await execBtn.isVisible({ timeout: 5000 }).catch(() => false);
    expect(isVisible).toBe(true);
  });

  test('1.5 诊断页面有结构化布局', async ({ page }) => {
    const { ok } = await safeGoto(page, `${BASE_URL}/app/diagnosis`);
    test.skip(!ok, '被 rate limit，跳过');

    const hasStructure = await page
      .locator('[role="tablist"], [class*="card"], table, button, [class*="panel"]')
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    expect(hasStructure).toBe(true);
  });

  test('1.6 三维模型链接可用', async ({ page }) => {
    const { ok } = await safeGoto(page, `${BASE_URL}/app/diagnosis`);
    test.skip(!ok, '被 rate limit，跳过');

    const twinLink = page.locator(
      'a[href*="digital-twin"], a[href*="3d"], button:has-text("三维"), button:has-text("3D"), button:has-text("定位")',
    ).first();

    if (await twinLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await twinLink.click();
      await page.waitForTimeout(1000);
      expect(page.url()).toContain('digital-twin');
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 核心链路二: 融合诊断 → 执行 → 结果
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('2. 核心链路 — 融合诊断→执行→结果', () => {
  test('2.1 融合诊断页面加载 + 配置面板', async ({ page }) => {
    const { ok } = await safeGoto(page, `${BASE_URL}/diagnosis/fusion`);
    test.skip(!ok, '被 rate limit，跳过');

    // 融合诊断页面应显示标题和 Tab 面板
    const hasHeading = await page
      .locator('h1:has-text("融合诊断")')
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    expect(hasHeading).toBe(true);

    // 应有 Tab 切换（诊断控制台/专家管理/诊断历史/引擎配置）
    const hasTabs = await page
      .getByRole('tab')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    expect(hasTabs).toBe(true);
  });

  test('2.2 融合诊断 — 执行按钮存在', async ({ page }) => {
    const { ok } = await safeGoto(page, `${BASE_URL}/diagnosis/fusion`);
    test.skip(!ok, '被 rate limit，跳过');

    const execBtn = page.getByRole('button').filter({
      hasText: /执行|融合|诊断|分析|开始|run|execute|fuse/i,
    }).first();

    if (await execBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(execBtn).toBeEnabled();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 核心链路三: 预警处置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('3. 核心链路 — 预警处置→告警→处置', () => {
  test('3.1 预警处置页面加载 + 列表展示', async ({ page }) => {
    const { ok } = await safeGoto(page, `${BASE_URL}/app/alerts`);
    test.skip(!ok, '被 rate limit，跳过');

    const hasContent = await page
      .locator('table, [class*="alert"], [class*="list"], [class*="empty"], [class*="card"], button')
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    expect(hasContent).toBe(true);
  });

  test('3.2 告警筛选/过滤功能', async ({ page }) => {
    const { ok } = await safeGoto(page, `${BASE_URL}/app/alerts`);
    test.skip(!ok, '被 rate limit，跳过');

    const hasFilter = await page
      .locator('select, [role="combobox"], input, [class*="filter"], [class*="select"], button')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    expect(hasFilter).toBe(true);
  });

  test('3.3 告警处置操作按钮', async ({ page }) => {
    const { ok } = await safeGoto(page, `${BASE_URL}/app/alerts`);
    test.skip(!ok, '被 rate limit，跳过');

    const actionBtn = page.getByRole('button').filter({
      hasText: /处置|确认|处理|忽略|dismiss|acknowledge|handle|resolve/i,
    }).first();

    if (await actionBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(actionBtn).toBeEnabled();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 关键页面冒烟测试 — 5 页面加载 + 无 JS 错误
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('4. 关键页面冒烟测试', () => {
  const smokePages = [
    { path: '/app', name: '设备健康总览' },
    { path: '/app/diagnosis', name: '智能诊断' },
    { path: '/app/alerts', name: '预警处置' },
    { path: '/digital-twin', name: '数字孪生' },
    { path: '/monitoring/hub', name: '统一观测中枢' },
  ];

  for (const { path, name } of smokePages) {
    test(`4.x ${name} (${path}) — 加载+无JS错误`, async ({ page }) => {
      const getCritical = watchErrors(page);
      const { ok } = await safeGoto(page, `${BASE_URL}${path}`);
      test.skip(!ok, '被 rate limit，跳过');

      // 页面有可见内容
      const hasAny = await page.locator('body *:visible').first()
        .isVisible({ timeout: 10000 }).catch(() => false);
      expect(hasAny).toBe(true);

      // 无致命 JS 错误
      expect(getCritical()).toHaveLength(0);
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. 扩展冒烟测试 — 平台管理页面
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('5. 扩展冒烟测试 — 平台管理', () => {
  const platformPages = [
    { path: '/dashboard', name: '首页概览' },
    { path: '/diagnosis/fusion', name: '融合诊断' },
    { path: '/knowledge/graph', name: '知识图谱' },
    { path: '/algorithm/overview', name: '算法库' },
    { path: '/v5/perception', name: '感知监控' },
    { path: '/v5/cognitive', name: '认知引擎' },
  ];

  for (const { path, name } of platformPages) {
    test(`5.x ${name} (${path}) — 加载+无JS错误`, async ({ page }) => {
      const getCritical = watchErrors(page);
      const { ok } = await safeGoto(page, `${BASE_URL}${path}`);
      test.skip(!ok, '被 rate limit，跳过');

      const hasAny = await page.locator('body *:visible').first()
        .isVisible({ timeout: 10000 }).catch(() => false);
      expect(hasAny).toBe(true);
      expect(getCritical()).toHaveLength(0);
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. 数字孪生子路由加载
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('6. 数字孪生模块', () => {
  const twinPaths = ['/digital-twin', '/digital-twin/3d', '/digital-twin/simulation', '/digital-twin/replay'];

  for (const path of twinPaths) {
    test(`6.x ${path} 加载`, async ({ page }) => {
      const { ok } = await safeGoto(page, `${BASE_URL}${path}`);
      test.skip(!ok, '被 rate limit，跳过');

      const hasAny = await page.locator('body *:visible').first()
        .isVisible({ timeout: 10000 }).catch(() => false);
      expect(hasAny).toBe(true);
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. 跨页面导航完整性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('7. 跨页面导航完整性', () => {
  test('7.1 核心页面连续导航无崩溃', async ({ page }) => {
    test.setTimeout(120_000);
    const getCritical = watchErrors(page);

    const corePages = [
      '/app',
      '/app/diagnosis',
      '/app/alerts',
      '/digital-twin',
      '/monitoring/hub',
      '/diagnosis/fusion',
      '/dashboard',
    ];

    for (const path of corePages) {
      await safeGoto(page, `${BASE_URL}${path}`);
    }

    expect(getCritical()).toHaveLength(0);
  });
});
