#!/usr/bin/env tsx
/**
 * ============================================================================
 * L1 契约基层 — CI 完整度审计脚本
 * ============================================================================
 * 
 * v3.1 自适应智能架构 · Alpha 阶段 · A-04
 * 
 * 用法:
 *   npx tsx scripts/audit-completeness.ts           # 扫描并更新基线
 *   npx tsx scripts/audit-completeness.ts --check   # CI 模式，仅检查回归
 *   npx tsx scripts/audit-completeness.ts --json    # JSON 输出（供其他工具消费）
 * 
 * 退出码:
 *   0 — 完整度未回归（或首次扫描）
 *   1 — 发现回归（桩函数增加）
 * 
 * 扫描范围:
 *   - server/ 目录下所有 .ts 文件
 *   - 检测 @stub('...') 装饰器和 stubFn('...', '...', ...) 函数调用
 *   - 检测 TODO/FIXME/HACK 注释
 * 
 * 输出:
 *   - 桩函数清单（文件、函数名、行号）
 *   - 按文件聚合的桩函数分布
 *   - 与基线的对比（新增/移除）
 *   - .completeness-baseline.json 基线文件
 */

import * as fs from 'fs';
import * as path from 'path';

// ============ 类型定义 ============

interface StubEntry {
  filePath: string;
  functionName: string;
  lineNumber: number;
  type: 'decorator' | 'stubFn';
  context: string; // 上下文行
}

interface TodoEntry {
  filePath: string;
  lineNumber: number;
  type: 'TODO' | 'FIXME' | 'HACK';
  text: string;
}

interface ScanResult {
  timestamp: string;
  stubs: StubEntry[];
  todos: TodoEntry[];
  stubsByFile: Record<string, number>;
  totalStubs: number;
  totalTodos: number;
  scannedFiles: number;
}

interface Baseline {
  timestamp: string;
  totalStubs: number;
  totalTodos: number;
  stubs: StubEntry[];
}

// ============ 扫描逻辑 ============

const SERVER_DIR = path.join(__dirname, '../server');
const BASELINE_FILE = path.join(__dirname, '../.completeness-baseline.json');

// 正则模式
const STUB_DECORATOR_RE = /@stub\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
const STUB_FN_RE = /stubFn\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/g;
const TODO_RE = /\/\/\s*(TODO|FIXME|HACK)\s*[:\s]*(.*)/gi;

function scanFile(filePath: string): { stubs: StubEntry[]; todos: TodoEntry[] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relativePath = path.relative(path.join(__dirname, '..'), filePath);
  const stubs: StubEntry[] = [];
  const todos: TodoEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // 检测 @stub 装饰器
    let match: RegExpExecArray | null;
    STUB_DECORATOR_RE.lastIndex = 0;
    while ((match = STUB_DECORATOR_RE.exec(line)) !== null) {
      // 函数名在下一行或同一行
      const nextLine = lines[i + 1] || '';
      const funcMatch = nextLine.match(/(?:async\s+)?(\w+)\s*\(/);
      stubs.push({
        filePath: relativePath,
        functionName: funcMatch ? funcMatch[1] : 'unknown',
        lineNumber: lineNum,
        type: 'decorator',
        context: line.trim(),
      });
    }

    // 检测 stubFn 调用
    STUB_FN_RE.lastIndex = 0;
    while ((match = STUB_FN_RE.exec(line)) !== null) {
      stubs.push({
        filePath: relativePath,
        functionName: match[2],
        lineNumber: lineNum,
        type: 'stubFn',
        context: line.trim(),
      });
    }

    // 检测 TODO/FIXME/HACK
    TODO_RE.lastIndex = 0;
    while ((match = TODO_RE.exec(line)) !== null) {
      todos.push({
        filePath: relativePath,
        lineNumber: lineNum,
        type: match[1].toUpperCase() as 'TODO' | 'FIXME' | 'HACK',
        text: match[2].trim(),
      });
    }
  }

  return { stubs, todos };
}

function scanDirectory(dir: string): ScanResult {
  const allStubs: StubEntry[] = [];
  const allTodos: TodoEntry[] = [];
  let scannedFiles = 0;

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        scannedFiles++;
        const { stubs, todos } = scanFile(fullPath);
        allStubs.push(...stubs);
        allTodos.push(...todos);
      }
    }
  }

  walk(dir);

  // 按文件聚合
  const stubsByFile: Record<string, number> = {};
  for (const s of allStubs) {
    stubsByFile[s.filePath] = (stubsByFile[s.filePath] || 0) + 1;
  }

  return {
    timestamp: new Date().toISOString(),
    stubs: allStubs,
    todos: allTodos,
    stubsByFile,
    totalStubs: allStubs.length,
    totalTodos: allTodos.length,
    scannedFiles,
  };
}

// ============ 主逻辑 ============

const args = process.argv.slice(2);
const isCheckMode = args.includes('--check');
const isJsonMode = args.includes('--json');

// 执行扫描
const result = scanDirectory(SERVER_DIR);

if (isJsonMode) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

// 打印报告
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║           v3.1 平台完整度审计报告                           ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log();
console.log(`📁 扫描文件数: ${result.scannedFiles}`);
console.log(`🔧 桩函数总数: ${result.totalStubs}`);
console.log(`📝 TODO/FIXME 总数: ${result.totalTodos}`);
console.log();

// 桩函数按文件分布
if (result.totalStubs > 0) {
  console.log('── 桩函数分布 ──');
  const sorted = Object.entries(result.stubsByFile).sort((a, b) => b[1] - a[1]);
  for (const [file, count] of sorted) {
    const bar = '█'.repeat(Math.min(count, 30));
    console.log(`  ${file.padEnd(50)} ${String(count).padStart(3)} ${bar}`);
  }
  console.log();

  // 桩函数详细列表
  console.log('── 桩函数清单 ──');
  for (const s of result.stubs) {
    console.log(`  [${s.type === 'decorator' ? '@stub' : 'stubFn'}] ${s.filePath}:${s.lineNumber} → ${s.functionName}`);
  }
  console.log();
}

// 与基线对比
if (fs.existsSync(BASELINE_FILE)) {
  const baseline: Baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
  const diff = result.totalStubs - baseline.totalStubs;

  if (diff > 0) {
    console.log(`❌ 桩函数回归: ${baseline.totalStubs} → ${result.totalStubs} (+${diff})`);

    // 找出新增的桩函数
    const baselineKeys = new Set(baseline.stubs.map(s => `${s.filePath}::${s.functionName}`));
    const newStubs = result.stubs.filter(s => !baselineKeys.has(`${s.filePath}::${s.functionName}`));
    if (newStubs.length > 0) {
      console.log('  新增桩函数:');
      for (const s of newStubs) {
        console.log(`    + ${s.filePath}:${s.lineNumber} → ${s.functionName}`);
      }
    }

    if (isCheckMode) {
      process.exit(1);
    }
  } else if (diff < 0) {
    console.log(`✅ 桩函数减少: ${baseline.totalStubs} → ${result.totalStubs} (${diff}) 🎉`);
    // 找出已移除的桩函数
    const currentKeys = new Set(result.stubs.map(s => `${s.filePath}::${s.functionName}`));
    const removedStubs = baseline.stubs.filter(s => !currentKeys.has(`${s.filePath}::${s.functionName}`));
    if (removedStubs.length > 0) {
      console.log('  已实现的桩函数:');
      for (const s of removedStubs) {
        console.log(`    ✓ ${s.filePath} → ${s.functionName}`);
      }
    }
  } else {
    console.log(`✅ 桩函数数量不变: ${result.totalStubs}`);
  }
} else {
  console.log('⚠️  无基线文件，创建初始基线');
}

// 更新基线（非 check 模式）
if (!isCheckMode) {
  const newBaseline: Baseline = {
    timestamp: result.timestamp,
    totalStubs: result.totalStubs,
    totalTodos: result.totalTodos,
    stubs: result.stubs,
  };
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(newBaseline, null, 2));
  console.log(`\n✅ 基线已更新: ${BASELINE_FILE}`);
}

console.log('\n── 完成 ──');
