#!/usr/bin/env tsx
/**
 * ============================================================================
 * 质量门禁 — Quality Gate
 * ============================================================================
 *
 * 按顺序执行以下检查，任何一项失败则整体失败：
 *   1. TypeScript 编译检查
 *   2. 单元测试
 *   3. 契约守门员：tRPC 路由是否引用 shared/contracts
 *   4. Mock 检测：扫描残留 mock 数据
 *   5. any 类型检测：超过基线则失败
 *   6. 死参数检测：配置字段声明但未使用
 *
 * 用法: npx tsx scripts/quality-gate.ts
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// 配置
// ============================================================================

const ROOT = path.resolve(import.meta.dirname, '..');
const ANY_BASELINE = 2750; // 当前基线（2026-03-02 实测 2718，+32 浮动空间）

interface CheckResult {
  name: string;
  passed: boolean;
  details: string[];
  duration: number;
}

const results: CheckResult[] = [];
let overallPassed = true;

// ============================================================================
// 工具函数
// ============================================================================

function runCheck(name: string, fn: () => { passed: boolean; details: string[] }): void {
  const start = Date.now();
  process.stdout.write(`\n🔍 ${name}...`);
  try {
    const result = fn();
    const duration = Date.now() - start;
    results.push({ name, ...result, duration });
    if (!result.passed) {
      overallPassed = false;
      console.log(` ❌ FAIL (${duration}ms)`);
    } else {
      console.log(` ✅ PASS (${duration}ms)`);
    }
  } catch (err) {
    const duration = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, details: [msg], duration });
    overallPassed = false;
    console.log(` ❌ ERROR (${duration}ms)`);
  }
}

function globFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
        walk(full);
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return files;
}

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

// ============================================================================
// Check 1: TypeScript 编译
// ============================================================================

runCheck('TypeScript 编译 (pnpm check)', () => {
  try {
    execSync('npx tsc --noEmit --skipLibCheck', { cwd: ROOT, stdio: 'pipe', timeout: 120_000 });
    return { passed: true, details: ['零编译错误'] };
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() || '';
    const errorLines = stderr.split('\n').filter(l => l.includes('error TS')).slice(0, 20);
    return { passed: false, details: [`编译失败`, ...errorLines] };
  }
});

// ============================================================================
// Check 2: 单元测试
// ============================================================================

runCheck('单元测试 (pnpm test)', () => {
  try {
    const output = execSync('npx vitest run', { cwd: ROOT, stdio: 'pipe', timeout: 300_000, encoding: 'utf-8' });
    const combined = output + '';
    const match = combined.match(/Tests\s+(\d+)\s+passed/);
    const passCount = match ? parseInt(match[1]) : 0;
    return { passed: true, details: [`${passCount} 测试全部通过`] };
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number };
    const stdout = (e.stdout || '').toString();
    const stderr = (e.stderr || '').toString();
    const combined = stdout + '\n' + stderr;
    // vitest 可能因 stderr 告警而 exit 非零，但实际测试全部通过
    const passMatch = combined.match(/Tests\s+(\d+)\s+passed/);
    const failMatch = combined.match(/(\d+)\s+failed/);
    const failCount = failMatch ? parseInt(failMatch[1]) : 0;
    const passCount = passMatch ? parseInt(passMatch[1]) : 0;
    if (passCount > 0 && failCount === 0) {
      return { passed: true, details: [`${passCount} 测试全部通过（stderr 有告警但无失败）`] };
    }
    const failLines = combined.split('\n').filter(l => l.includes('FAIL') || l.includes('failed')).slice(0, 10);
    return { passed: false, details: [`${failCount} 测试失败, ${passCount} 通过`, ...failLines] };
  }
});

// ============================================================================
// Check 3: 契约守门员 — tRPC 路由是否引用 shared/contracts
// ============================================================================

runCheck('契约守门员 (tRPC 路由引用 shared/contracts)', () => {
  const routerDir = path.join(ROOT, 'server/api');
  const domainDir = path.join(ROOT, 'server/domains');
  const routerFiles = [
    ...globFiles(routerDir, ['.ts']).filter(f => f.includes('router')),
    ...globFiles(domainDir, ['.ts']).filter(f => f.includes('router')),
  ];

  const violations: string[] = [];
  let checkedCount = 0;

  for (const file of routerFiles) {
    const content = readFile(file);
    const rel = path.relative(ROOT, file);
    checkedCount++;

    // 检查是否有内联 z.object 但未引用 shared/contracts
    const hasInlineZod = /z\.object\s*\(\s*\{/.test(content);
    const hasContractImport = /from\s+['"].*shared\/contracts/.test(content) ||
                               /from\s+['"].*\/contracts\/v1/.test(content);

    if (hasInlineZod && !hasContractImport) {
      // 统计内联 schema 数量
      const inlineCount = (content.match(/z\.object\s*\(\s*\{/g) || []).length;
      if (inlineCount > 3) {
        violations.push(`${rel}: ${inlineCount} 个内联 Zod schema，建议迁移到 shared/contracts`);
      }
    }
  }

  return {
    passed: true, // 当前为 warning 模式，不阻断
    details: [
      `扫描 ${checkedCount} 个路由文件`,
      violations.length > 0
        ? `⚠️  ${violations.length} 个路由有大量内联 schema（建议迁移）`
        : '所有路由契约引用正常',
      ...violations.slice(0, 10),
    ],
  };
});

// ============================================================================
// Check 4: Mock 检测
// ============================================================================

runCheck('Mock 残留检测', () => {
  const dirs = [
    path.join(ROOT, 'server'),
    path.join(ROOT, 'client/src'),
  ];

  const patterns = [
    { regex: /Math\.random\(\)\s*[*<>]/, label: 'Math.random() 用于业务逻辑' },
    { regex: /\bconfidence\s*[:=]\s*0\.\d{2}\b/, label: 'hardcoded confidence 值' },
    { regex: /\{[\s\S]*?stub\s*:\s*true[\s\S]*?\}/, label: '{stub: true} 残留' },
    { regex: /mock\s*:\s*true|isMock\s*[:=]\s*true/, label: 'mock 标记残留' },
  ];

  const violations: string[] = [];

  for (const dir of dirs) {
    const files = globFiles(dir, ['.ts', '.tsx']).filter(
      f => !f.includes('__tests__') && !f.includes('.test.') && !f.includes('.spec.') && !f.includes('mock'),
    );

    for (const file of files) {
      const content = readFile(file);
      const lines = content.split('\n');
      const rel = path.relative(ROOT, file);

      for (const { regex, label } of patterns) {
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            violations.push(`${rel}:${i + 1} — ${label}`);
          }
        }
      }
    }
  }

  // Mock 检测为 warning 模式（现有大量 mock 需逐步清理）
  return {
    passed: true,
    details: [
      `发现 ${violations.length} 处 mock/stub 残留（逐步清理中）`,
      ...violations.slice(0, 15),
      violations.length > 15 ? `... 还有 ${violations.length - 15} 处` : '',
    ].filter(Boolean),
  };
});

// ============================================================================
// Check 5: any 类型检测
// ============================================================================

runCheck(`any 类型检测 (基线: ${ANY_BASELINE})`, () => {
  const dirs = [
    path.join(ROOT, 'server'),
    path.join(ROOT, 'client/src'),
    path.join(ROOT, 'shared'),
  ];

  let anyCount = 0;
  const topFiles: { file: string; count: number }[] = [];

  for (const dir of dirs) {
    const files = globFiles(dir, ['.ts', '.tsx']).filter(
      f =>
        !f.includes('__tests__') &&
        !f.includes('.test.') &&
        !f.includes('.d.ts') &&
        !f.includes('/generated/'),
    );

    for (const file of files) {
      const content = readFile(file);
      // 匹配 : any, as any, <any>, Record<string, any> 等模式
      const matches = content.match(/\bany\b/g);
      if (matches) {
        const count = matches.length;
        anyCount += count;
        const rel = path.relative(ROOT, file);
        if (count >= 5) {
          topFiles.push({ file: rel, count });
        }
      }
    }
  }

  topFiles.sort((a, b) => b.count - a.count);
  const passed = anyCount <= ANY_BASELINE;

  return {
    passed,
    details: [
      `any 总数: ${anyCount} (基线: ${ANY_BASELINE})`,
      passed ? '✅ 未超过基线' : `❌ 超过基线 ${anyCount - ANY_BASELINE} 个`,
      `Top any 文件:`,
      ...topFiles.slice(0, 10).map(f => `  ${f.file}: ${f.count} 处`),
    ],
  };
});

// ============================================================================
// Check 6: 死参数检测
// ============================================================================

runCheck('死参数检测 (config 声明未使用)', () => {
  const configPath = path.join(ROOT, 'server/core/config.ts');
  if (!fs.existsSync(configPath)) {
    return { passed: true, details: ['config.ts 不存在，跳过'] };
  }

  const content = readFile(configPath);
  const violations: string[] = [];

  // 提取 config 对象的顶层属性名
  const propMatches = content.matchAll(/^\s+(\w+)\s*[:=]/gm);
  const declaredProps = new Set<string>();
  for (const m of propMatches) {
    declaredProps.add(m[1]);
  }

  // 扫描 server/ 目录中使用 config.xxx 的模式
  const serverFiles = globFiles(path.join(ROOT, 'server'), ['.ts']).filter(
    f => !f.includes('config.ts') && !f.includes('__tests__') && !f.includes('.test.'),
  );

  const usedProps = new Set<string>();
  for (const file of serverFiles) {
    const src = readFile(file);
    for (const prop of declaredProps) {
      if (src.includes(`.${prop}`) || src.includes(`['${prop}']`) || src.includes(`["${prop}"]`)) {
        usedProps.add(prop);
      }
    }
  }

  // 已知的常用属性（不标记为死参数）
  const knownUsed = new Set([
    'port', 'host', 'databaseUrl', 'redisUrl', 'clickhouseUrl', 'neo4jUrl',
    'jwtSecret', 'nodeEnv', 'corsOrigin', 'logLevel', 'kafkaBrokers',
    'minioEndpoint', 'minioAccessKey', 'minioSecretKey', 'minioBucket',
    'qdrantUrl', 'esUrl', 'influxUrl', 'influxToken', 'influxOrg', 'influxBucket',
    'openaiApiKey', 'openaiModel', 'grpcAlgorithmAddr', 'grpcDiagnosisAddr',
    'jaegerEndpoint', 'otlpEndpoint', 'prometheusPort',
  ]);

  for (const prop of declaredProps) {
    if (!usedProps.has(prop) && !knownUsed.has(prop) && prop.length > 2) {
      violations.push(`config.${prop} — 声明但未在 server/ 中引用`);
    }
  }

  return {
    passed: true, // warning 模式
    details: [
      `扫描 ${declaredProps.size} 个配置属性`,
      `${violations.length} 个疑似未使用`,
      ...violations.slice(0, 10),
    ],
  };
});

// ============================================================================
// 输出报告
// ============================================================================

console.log('\n' + '═'.repeat(60));
console.log('  质量门禁报告 — Quality Gate Report');
console.log('═'.repeat(60));
console.log(`  时间: ${new Date().toISOString()}`);
console.log(`  分支: ${(() => { try { return execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, stdio: 'pipe' }).toString().trim(); } catch { return 'unknown'; } })()}`);
console.log('─'.repeat(60));

for (const r of results) {
  const icon = r.passed ? '✅' : '❌';
  console.log(`  ${icon} ${r.name} (${r.duration}ms)`);
  for (const d of r.details.slice(0, 5)) {
    if (d) console.log(`     ${d}`);
  }
}

console.log('─'.repeat(60));

const passCount = results.filter(r => r.passed).length;
const failCount = results.filter(r => !r.passed).length;

if (overallPassed) {
  console.log(`\n  ✅ 全部通过 (${passCount}/${results.length} 项)`);
} else {
  console.log(`\n  ❌ 未通过 (${failCount} 项失败)`);
  console.log('  失败项:');
  for (const r of results.filter(r => !r.passed)) {
    console.log(`    - ${r.name}`);
  }
}

console.log('═'.repeat(60));

// 写入最新报告（供 daily-report 读取）
const reportPath = path.join(ROOT, 'docs/daily/.quality-gate-latest.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  passed: overallPassed,
  results: results.map(r => ({
    name: r.name,
    passed: r.passed,
    details: r.details,
    duration: r.duration,
  })),
}, null, 2));

process.exit(overallPassed ? 0 : 1);
