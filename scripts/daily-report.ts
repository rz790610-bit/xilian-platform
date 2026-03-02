#!/usr/bin/env tsx
/**
 * ============================================================================
 * 每日质量报告 — Daily Report
 * ============================================================================
 *
 * 生成 docs/daily/YYYY-MM-DD-quality.md 质量报告。
 *
 * 用法: npx tsx scripts/daily-report.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const today = new Date().toISOString().slice(0, 10);
const dailyDir = path.join(ROOT, 'docs/daily');

// ============================================================================
// 数据收集
// ============================================================================

interface ReportData {
  date: string;
  fixProgress: {
    total: number;
    fixed: number;
    partial: number;
    open: number;
    completionRate: string;
    bySeverity: Record<string, { total: number; fixed: number }>;
    todayFixed: string[];
  };
  codeHealth: {
    tsErrors: number;
    testSuites: number;
    testsPassed: number;
    testsFailed: number;
    anyCount: number;
    anyBaseline: number;
  };
  flowStatus: {
    total: number;
    passable: number;
    partial: number;
    broken: number;
  };
  techDebt: {
    deadParams: number;
    mockResidual: number;
    contractViolation: number;
    namingIssues: number;
    shellPages: number;
    brokenFlows: number;
  };
  yesterday?: ReportData;
}

function loadJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return null; }
}

function countGrep(pattern: string, target: string): number {
  try {
    const out = execSync(
      `grep -rn '${pattern}' --include='*.ts' --include='*.tsx' ${target} 2>/dev/null | grep -v node_modules | grep -v dist | wc -l`,
      { cwd: ROOT, stdio: 'pipe' },
    ).toString().trim();
    return parseInt(out) || 0;
  } catch { return 0; }
}

function collectData(): ReportData {
  // ── FIX 进度 ──
  const fixData = loadJson(path.join(dailyDir, '.fix-tracker-latest.json'));
  const fixProgress = {
    total: (fixData?.total as number) || 143,
    fixed: (fixData?.fixed as number) || 0,
    partial: (fixData?.partial as number) || 0,
    open: (fixData?.open as number) || 143,
    completionRate: (fixData?.completionRate as string) || '0.0',
    bySeverity: (fixData?.bySeverity as Record<string, { total: number; fixed: number }>) || {},
    todayFixed: [] as string[],
  };

  // 查找今日完成的 FIX
  if (fixData?.items) {
    for (const item of fixData.items as Array<{ id: string; status: string }>) {
      if (item.status === 'fixed') fixProgress.todayFixed.push(item.id);
    }
  }

  // ── 代码健康 ──
  let tsErrors = 0;
  try {
    execSync('npx tsc --noEmit --skipLibCheck 2>&1', { cwd: ROOT, stdio: 'pipe', timeout: 120_000 });
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() || '';
    tsErrors = (stderr.match(/error TS/g) || []).length;
  }

  let testSuites = 0, testsPassed = 0, testsFailed = 0;
  try {
    const testOutput = execSync('npx vitest run 2>&1', { cwd: ROOT, stdio: 'pipe', timeout: 300_000 }).toString();
    const suiteMatch = testOutput.match(/Test Files\s+(\d+)\s+passed/);
    const testMatch = testOutput.match(/Tests\s+(\d+)\s+passed/);
    const failMatch = testOutput.match(/(\d+)\s+failed/);
    testSuites = suiteMatch ? parseInt(suiteMatch[1]) : 0;
    testsPassed = testMatch ? parseInt(testMatch[1]) : 0;
    testsFailed = failMatch ? parseInt(failMatch[1]) : 0;
  } catch (err) {
    const stdout = (err as { stdout?: Buffer }).stdout?.toString() || '';
    const failMatch = stdout.match(/(\d+)\s+failed/);
    testsFailed = failMatch ? parseInt(failMatch[1]) : 0;
  }

  const anyCount = countGrep('\\bany\\b', 'server/ client/src/ shared/');

  // ── 流程状态 ──
  // 14 条核心流程的通过性估算
  const flowStatus = { total: 14, passable: 2, partial: 5, broken: 7 };

  // ── 技术债务 ──
  const techDebt = {
    deadParams: countGrep('TODO\\|FIXME\\|HACK', 'server/core/config.ts'),
    mockResidual: countGrep('stub.*true\\|mock.*data', 'server/'),
    contractViolation: countGrep('as Record<string, unknown>', 'server/'),
    namingIssues: countGrep('deviceId', 'server/'),
    shellPages: countGrep('placeholder\\|功能开发中', 'client/src/pages/'),
    brokenFlows: flowStatus.broken,
  };

  // ── 昨日数据 ──
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const yesterdayReport = loadJson(path.join(dailyDir, `.report-${yesterdayStr}.json`));

  return {
    date: today,
    fixProgress,
    codeHealth: {
      tsErrors,
      testSuites,
      testsPassed,
      testsFailed,
      anyCount,
      anyBaseline: 2600,
    },
    flowStatus,
    techDebt,
    yesterday: yesterdayReport as unknown as ReportData,
  };
}

// ============================================================================
// 生成报告
// ============================================================================

function trend(current: number, previous: number | undefined): string {
  if (previous === undefined) return '';
  if (current < previous) return ` (↓${previous - current})`;
  if (current > previous) return ` (↑${current - previous})`;
  return ' (→)';
}

function generateReport(data: ReportData): string {
  const yd = data.yesterday;

  return `# 每日质量报告 — ${data.date}

> 自动生成 | 命令: \`pnpm report:daily\`

---

## 1. FIX 修复进度

| 指标 | 数值 | 趋势 |
|------|------|------|
| 总数 | ${data.fixProgress.total} | - |
| 已修复 | ${data.fixProgress.fixed} | ${trend(data.fixProgress.fixed, yd?.fixProgress?.fixed)} |
| 部分完成 | ${data.fixProgress.partial} | ${trend(data.fixProgress.partial, yd?.fixProgress?.partial)} |
| 待修复 | ${data.fixProgress.open} | ${trend(data.fixProgress.open, yd?.fixProgress?.open)} |
| **完成率** | **${data.fixProgress.completionRate}%** | |

### 按严重度

| 严重度 | 修复/总数 | 完成率 |
|--------|-----------|--------|
${Object.entries(data.fixProgress.bySeverity).map(([sev, s]) =>
  `| ${sev} | ${s.fixed}/${s.total} | ${s.total > 0 ? ((s.fixed / s.total) * 100).toFixed(0) : 0}% |`
).join('\n')}

### 今日完成

${data.fixProgress.todayFixed.length > 0
  ? data.fixProgress.todayFixed.map(id => `- ${id}`).join('\n')
  : '- 无新完成'}

---

## 2. 代码健康

| 指标 | 当前值 | 基线/目标 | 趋势 |
|------|--------|-----------|------|
| TS 编译错误 | ${data.codeHealth.tsErrors} | 0 | ${trend(data.codeHealth.tsErrors, yd?.codeHealth?.tsErrors)} |
| 测试套件数 | ${data.codeHealth.testSuites} | - | ${trend(data.codeHealth.testSuites, yd?.codeHealth?.testSuites)} |
| 测试通过数 | ${data.codeHealth.testsPassed} | - | ${trend(data.codeHealth.testsPassed, yd?.codeHealth?.testsPassed)} |
| 测试失败数 | ${data.codeHealth.testsFailed} | 0 | ${trend(data.codeHealth.testsFailed, yd?.codeHealth?.testsFailed)} |
| any 类型数 | ${data.codeHealth.anyCount} | ${data.codeHealth.anyBaseline} | ${trend(data.codeHealth.anyCount, yd?.codeHealth?.anyCount)} |

---

## 3. 流程状态 (14 条)

| 状态 | 数量 |
|------|------|
| 🟢 可通过 | ${data.flowStatus.passable} |
| 🟡 部分通 | ${data.flowStatus.partial} |
| 🔴 断裂 | ${data.flowStatus.broken} |

---

## 4. 技术债务

| 维度 | 当前值 | 趋势 |
|------|--------|------|
| 死参数/TODO | ${data.techDebt.deadParams} | ${trend(data.techDebt.deadParams, yd?.techDebt?.deadParams)} |
| Mock 残留 | ${data.techDebt.mockResidual} | ${trend(data.techDebt.mockResidual, yd?.techDebt?.mockResidual)} |
| 契约违规 (as Record) | ${data.techDebt.contractViolation} | ${trend(data.techDebt.contractViolation, yd?.techDebt?.contractViolation)} |
| 命名不一致 (deviceId) | ${data.techDebt.namingIssues} | ${trend(data.techDebt.namingIssues, yd?.techDebt?.namingIssues)} |
| 空壳页面 | ${data.techDebt.shellPages} | ${trend(data.techDebt.shellPages, yd?.techDebt?.shellPages)} |
| 断裂流程 | ${data.techDebt.brokenFlows} | ${trend(data.techDebt.brokenFlows, yd?.techDebt?.brokenFlows)} |

---

> 下次运行: \`pnpm report:daily\` | 完整检查: \`pnpm quality:full\`
`;
}

// ============================================================================
// 主流程
// ============================================================================

console.log('📊 生成每日质量报告...\n');
fs.mkdirSync(dailyDir, { recursive: true });

const data = collectData();
const report = generateReport(data);

// 写入 markdown 报告
const reportPath = path.join(dailyDir, `${today}-quality.md`);
fs.writeFileSync(reportPath, report);
console.log(`📄 报告已保存: ${path.relative(ROOT, reportPath)}`);

// 写入 JSON（供下次对比）
const jsonPath = path.join(dailyDir, `.report-${today}.json`);
fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
console.log(`📄 数据已保存: ${path.relative(ROOT, jsonPath)}`);

// 打印摘要
console.log('\n── 摘要 ──');
console.log(`  FIX 完成率: ${data.fixProgress.completionRate}% (${data.fixProgress.fixed}/${data.fixProgress.total})`);
console.log(`  TS 错误: ${data.codeHealth.tsErrors}`);
console.log(`  测试: ${data.codeHealth.testsPassed} 通过 / ${data.codeHealth.testsFailed} 失败`);
console.log(`  流程: ${data.flowStatus.passable} 通 / ${data.flowStatus.partial} 部分 / ${data.flowStatus.broken} 断`);
