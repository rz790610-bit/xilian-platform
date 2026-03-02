/**
 * ============================================================================
 * 质量看板 API — Quality Dashboard Router
 * ============================================================================
 *
 * 5 个 query 端点对应质量仪表盘 5 个面板：
 *   1. getFixProgress    — FIX 修复进度
 *   2. getCodeHealth     — 代码健康趋势
 *   3. getFlowStatus     — 流程状态矩阵
 *   4. getAlgorithmHealth — 算法健康
 *   5. getTechDebt       — 技术债务雷达
 */

import { z } from 'zod';
import { publicProcedure, router } from '../core/trpc';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { createModuleLogger } from '../core/logger';

const log = createModuleLogger('quality-router');
const ROOT = path.resolve(import.meta.dirname, '../..');
const DAILY_DIR = path.join(ROOT, 'docs/daily');

// ============================================================================
// 工具函数
// ============================================================================

function loadJson(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return null; }
}

function grepCount(pattern: string, target: string): number {
  try {
    const out = execSync(
      `grep -rn '${pattern}' --include='*.ts' --include='*.tsx' ${target} 2>/dev/null | grep -v node_modules | grep -v dist | wc -l`,
      { cwd: ROOT, stdio: 'pipe', timeout: 30_000 },
    ).toString().trim();
    return parseInt(out) || 0;
  } catch { return 0; }
}

function loadRecentReports(days: number): Array<{ date: string; data: Record<string, unknown> }> {
  const results: Array<{ date: string; data: Record<string, unknown> }> = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const data = loadJson(path.join(DAILY_DIR, `.report-${dateStr}.json`));
    if (data) results.push({ date: dateStr, data });
  }
  return results;
}

// ============================================================================
// 路由定义
// ============================================================================

export const qualityRouter = router({
  /**
   * 面板 1: FIX 修复进度
   */
  getFixProgress: publicProcedure.query(() => {
    const fixData = loadJson(path.join(DAILY_DIR, '.fix-tracker-latest.json'));

    if (!fixData) {
      return {
        total: 143,
        fixed: 0,
        partial: 0,
        open: 143,
        completionRate: 0,
        bySeverity: {
          '致命': { total: 18, fixed: 0 },
          '严重': { total: 46, fixed: 0 },
          '中等': { total: 55, fixed: 0 },
          '低': { total: 24, fixed: 0 },
        },
        todayFixed: [] as string[],
        items: [] as Array<{ id: string; description: string; severity: string; status: string }>,
      };
    }

    return {
      total: fixData.total as number,
      fixed: fixData.fixed as number,
      partial: fixData.partial as number,
      open: fixData.open as number,
      completionRate: parseFloat(fixData.completionRate as string),
      bySeverity: fixData.bySeverity as Record<string, { total: number; fixed: number }>,
      todayFixed: ((fixData.items as Array<{ id: string; status: string }>) || [])
        .filter(i => i.status === 'fixed')
        .map(i => i.id),
      items: ((fixData.items as Array<{ id: string; description: string; severity: string; status: string }>) || [])
        .map(i => ({
          id: i.id,
          description: i.description,
          severity: i.severity,
          status: i.status,
        })),
    };
  }),

  /**
   * 面板 2: 代码健康趋势（过去 14 天）
   */
  getCodeHealth: publicProcedure.query(() => {
    const reports = loadRecentReports(14);

    // 实时数据
    let currentTsErrors = 0;
    try {
      execSync('npx tsc --noEmit --skipLibCheck 2>&1', { cwd: ROOT, stdio: 'pipe', timeout: 120_000 });
    } catch (err) {
      const stderr = (err as { stderr?: Buffer }).stderr?.toString() || '';
      currentTsErrors = (stderr.match(/error TS/g) || []).length;
    }

    const currentAnyCount = grepCount('\\bany\\b', 'server/ client/src/ shared/');

    // 历史趋势
    const trend = reports.map(r => {
      const ch = r.data.codeHealth as Record<string, number> | undefined;
      return {
        date: r.date,
        tsErrors: ch?.tsErrors ?? 0,
        testsPassed: ch?.testsPassed ?? 0,
        anyCount: ch?.anyCount ?? 0,
      };
    }).reverse();

    return {
      current: {
        tsErrors: currentTsErrors,
        anyCount: currentAnyCount,
        anyBaseline: 2750,
      },
      trend,
    };
  }),

  /**
   * 面板 3: 流程状态矩阵（14 条核心流程）
   */
  getFlowStatus: publicProcedure.query(() => {
    // 14 条核心流程及其节点状态
    const flows = [
      {
        id: 1, name: '传感器数据采集→存储',
        nodes: [
          { name: 'MQTT/Modbus采集', status: 'pass' as const },
          { name: '协议适配', status: 'pass' as const },
          { name: '单位归一化', status: 'pass' as const },
          { name: 'ClickHouse写入', status: 'partial' as const },
        ],
      },
      {
        id: 2, name: '数据→特征提取→诊断',
        nodes: [
          { name: '特征提取', status: 'pass' as const },
          { name: 'BPA构建', status: 'pass' as const },
          { name: 'DS融合', status: 'pass' as const },
          { name: '诊断结论', status: 'pass' as const },
        ],
      },
      {
        id: 3, name: '诊断→护栏校验→输出',
        nodes: [
          { name: '诊断生成', status: 'pass' as const },
          { name: '护栏接口', status: 'pass' as const },
          { name: '护栏规则执行', status: 'partial' as const },
          { name: '安全输出', status: 'partial' as const },
        ],
      },
      {
        id: 4, name: 'Grok推理→工具调用→结论',
        nodes: [
          { name: 'Grok引擎', status: 'pass' as const },
          { name: '工具调用', status: 'fail' as const },
          { name: '推理链', status: 'partial' as const },
          { name: '结论生成', status: 'partial' as const },
        ],
      },
      {
        id: 5, name: '知识图谱→查询→推理',
        nodes: [
          { name: 'Neo4j连接', status: 'pass' as const },
          { name: '种子数据', status: 'fail' as const },
          { name: '图查询', status: 'partial' as const },
          { name: '推理链', status: 'fail' as const },
        ],
      },
      {
        id: 6, name: '进化飞轮→训练→评估',
        nodes: [
          { name: '影子评估', status: 'partial' as const },
          { name: '训练', status: 'fail' as const },
          { name: '冠军挑战者', status: 'partial' as const },
          { name: '持久化', status: 'fail' as const },
        ],
      },
      {
        id: 7, name: '管线DAG→执行→监控',
        nodes: [
          { name: 'DAG定义', status: 'pass' as const },
          { name: '节点执行', status: 'partial' as const },
          { name: '状态监控', status: 'partial' as const },
        ],
      },
      {
        id: 8, name: '前端→tRPC→后端→响应',
        nodes: [
          { name: 'tRPC类型安全', status: 'pass' as const },
          { name: '路由注册', status: 'pass' as const },
          { name: '响应格式', status: 'partial' as const },
        ],
      },
      {
        id: 9, name: '告警→通知→确认',
        nodes: [
          { name: '告警规则', status: 'fail' as const },
          { name: '通知发送', status: 'fail' as const },
          { name: '状态变更', status: 'fail' as const },
        ],
      },
      {
        id: 10, name: '事件总线→订阅→处理',
        nodes: [
          { name: 'EventBus发布', status: 'pass' as const },
          { name: 'Schema校验', status: 'pass' as const },
          { name: '订阅处理', status: 'pass' as const },
          { name: 'Kafka桥接', status: 'partial' as const },
        ],
      },
      {
        id: 11, name: '数据质量→评分→分级',
        nodes: [
          { name: '质量评分', status: 'pass' as const },
          { name: 'A-F分级', status: 'pass' as const },
          { name: '告警触发', status: 'fail' as const },
        ],
      },
      {
        id: 12, name: '跨设备→对比→报告',
        nodes: [
          { name: '设备选择', status: 'pass' as const },
          { name: '对比计算', status: 'partial' as const },
          { name: '报告生成', status: 'fail' as const },
        ],
      },
      {
        id: 13, name: '用户→登录→权限',
        nodes: [
          { name: 'JWT认证', status: 'pass' as const },
          { name: '权限校验', status: 'partial' as const },
          { name: '越权拦截', status: 'partial' as const },
        ],
      },
      {
        id: 14, name: '协议适配→数据归一化',
        nodes: [
          { name: 'MQTT适配', status: 'pass' as const },
          { name: 'Modbus适配', status: 'pass' as const },
          { name: '单位换算', status: 'pass' as const },
          { name: '时间对齐', status: 'pass' as const },
        ],
      },
    ];

    const summary = {
      total: flows.length,
      passable: flows.filter(f => f.nodes.every(n => n.status === 'pass')).length,
      partial: flows.filter(f => f.nodes.some(n => n.status === 'pass') && f.nodes.some(n => n.status !== 'pass')).length,
      broken: flows.filter(f => f.nodes.every(n => n.status === 'fail')).length,
    };

    return { flows, summary };
  }),

  /**
   * 面板 4: 算法健康
   */
  getAlgorithmHealth: publicProcedure.query(() => {
    // 扫描算法目录
    const algDir = path.join(ROOT, 'server/algorithms');
    const categories: Record<string, { total: number; grades: Record<string, number> }> = {};

    if (fs.existsSync(algDir)) {
      for (const entry of fs.readdirSync(algDir, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name !== '_core' && entry.name !== 'node_modules') {
          const catDir = path.join(algDir, entry.name);
          const files = fs.readdirSync(catDir).filter(f => f.endsWith('.ts') && !f.includes('.test.'));
          const total = files.length;

          // 评级逻辑：有测试 + 无 hardcoded → A; 有测试 → B; 有实现 → C; 仅定义 → D
          let aCount = 0, bCount = 0, cCount = 0, dCount = 0;
          for (const file of files) {
            const content = fs.readFileSync(path.join(catDir, file), 'utf-8');
            const hasHardcoded = /confidence\s*[:=]\s*0\.\d{2}/.test(content);
            const testExists = fs.existsSync(path.join(catDir, '__tests__', file.replace('.ts', '.test.ts')));
            const hasImplementation = content.length > 500;

            if (testExists && !hasHardcoded && hasImplementation) aCount++;
            else if (testExists && hasImplementation) bCount++;
            else if (hasImplementation) cCount++;
            else dCount++;
          }

          categories[entry.name] = {
            total,
            grades: { A: aCount, B: bCount, C: cCount, D: dCount },
          };
        }
      }
    }

    // 汇总
    const totals = { A: 0, B: 0, C: 0, D: 0 };
    for (const cat of Object.values(categories)) {
      for (const [grade, count] of Object.entries(cat.grades)) {
        totals[grade as keyof typeof totals] += count;
      }
    }

    return {
      categories,
      totals,
      totalAlgorithms: Object.values(totals).reduce((s, v) => s + v, 0),
    };
  }),

  /**
   * 面板 5: 技术债务雷达图
   */
  getTechDebt: publicProcedure.query(() => {
    const dimensions = [
      {
        name: '死参数',
        current: grepCount('TODO\\|FIXME\\|HACK', 'server/'),
        target: 20,
        max: 200,
      },
      {
        name: 'Mock残留',
        current: grepCount('stub.*true', 'server/') + grepCount('mock.*data', 'server/'),
        target: 0,
        max: 100,
      },
      {
        name: '契约违规',
        current: grepCount('as Record<string, unknown>', 'server/'),
        target: 5,
        max: 80,
      },
      {
        name: '命名混乱',
        current: Math.min(grepCount('deviceId', 'server/') / 10, 100),
        target: 0,
        max: 100,
      },
      {
        name: '空壳页面',
        current: grepCount('placeholder\\|功能开发中', 'client/src/pages/'),
        target: 0,
        max: 30,
      },
      {
        name: '断裂流程',
        current: 7, // 来自 flowStatus
        target: 0,
        max: 14,
      },
    ];

    return { dimensions };
  }),
});
