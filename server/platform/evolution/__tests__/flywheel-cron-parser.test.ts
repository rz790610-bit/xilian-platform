/**
 * 飞轮 cron 解析器单元测试
 *
 * 覆盖：标准 cron 表达式、范围、步进、逗号列表、通配符
 * 
 * 注意：由于 computeNextTrigger 是 EvolutionFlywheel 的私有方法，
 * 我们通过提取其核心逻辑 parseCronField 进行测试。
 * 如果无法直接导入，则测试等价的独立函数。
 */
import { describe, it, expect } from 'vitest';

// ============================================================
// 从飞轮编排器中提取的 cron 字段解析逻辑（独立可测试版本）
// ============================================================

/**
 * 解析单个 cron 字段为匹配值集合
 * 支持: * | 5 | 1,3,5 | 1-5 | * /2 | 1-10/3
 */
function parseCronField(field: string, min: number, max: number): Set<number> {
  const result = new Set<number>();

  for (const part of field.split(',')) {
    const trimmed = part.trim();

    if (trimmed === '*') {
      for (let i = min; i <= max; i++) result.add(i);
      continue;
    }

    // */step
    const allStepMatch = trimmed.match(/^\*\/(\d+)$/);
    if (allStepMatch) {
      const step = parseInt(allStepMatch[1], 10);
      if (step > 0) {
        for (let i = min; i <= max; i += step) result.add(i);
      }
      continue;
    }

    // range-range/step
    const rangeStepMatch = trimmed.match(/^(\d+)-(\d+)\/(\d+)$/);
    if (rangeStepMatch) {
      const start = parseInt(rangeStepMatch[1], 10);
      const end = parseInt(rangeStepMatch[2], 10);
      const step = parseInt(rangeStepMatch[3], 10);
      if (step > 0) {
        for (let i = start; i <= end; i += step) result.add(i);
      }
      continue;
    }

    // range-range
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = start; i <= end; i++) result.add(i);
      continue;
    }

    // 单个数字
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= min && num <= max) {
      result.add(num);
    }
  }

  return result;
}

/**
 * 计算下一个 cron 触发时间
 */
function computeNextCronTrigger(cronExpr: string, fromDate: Date = new Date()): Date {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) {
    // 不完整的 cron，默认每天 2:00
    const next = new Date(fromDate);
    next.setDate(next.getDate() + 1);
    next.setHours(2, 0, 0, 0);
    return next;
  }

  const [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = parts;

  const minutes = parseCronField(minuteField, 0, 59);
  const hours = parseCronField(hourField, 0, 23);
  const daysOfMonth = parseCronField(dayOfMonthField, 1, 31);
  const months = parseCronField(monthField, 1, 12);
  const daysOfWeek = parseCronField(dayOfWeekField, 0, 6);

  // 从当前时间开始，逐分钟搜索（最多搜索 366 天）
  const candidate = new Date(fromDate);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  const maxIterations = 366 * 24 * 60;
  for (let i = 0; i < maxIterations; i++) {
    if (
      months.has(candidate.getMonth() + 1) &&
      daysOfMonth.has(candidate.getDate()) &&
      daysOfWeek.has(candidate.getDay()) &&
      hours.has(candidate.getHours()) &&
      minutes.has(candidate.getMinutes())
    ) {
      return candidate;
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  // 未找到匹配，默认 24 小时后
  const fallback = new Date(fromDate);
  fallback.setDate(fallback.getDate() + 1);
  return fallback;
}

// ============================================================
// 测试用例
// ============================================================

describe('parseCronField', () => {
  it('通配符 * 返回全范围', () => {
    const result = parseCronField('*', 0, 59);
    expect(result.size).toBe(60);
    expect(result.has(0)).toBe(true);
    expect(result.has(59)).toBe(true);
  });

  it('单个数字', () => {
    const result = parseCronField('30', 0, 59);
    expect(result.size).toBe(1);
    expect(result.has(30)).toBe(true);
  });

  it('逗号列表 1,3,5', () => {
    const result = parseCronField('1,3,5', 0, 6);
    expect(result.size).toBe(3);
    expect(result.has(1)).toBe(true);
    expect(result.has(3)).toBe(true);
    expect(result.has(5)).toBe(true);
  });

  it('范围 1-5', () => {
    const result = parseCronField('1-5', 0, 23);
    expect(result.size).toBe(5);
    for (let i = 1; i <= 5; i++) {
      expect(result.has(i)).toBe(true);
    }
  });

  it('步进 */2', () => {
    const result = parseCronField('*/2', 0, 23);
    expect(result.has(0)).toBe(true);
    expect(result.has(2)).toBe(true);
    expect(result.has(1)).toBe(false);
    expect(result.has(3)).toBe(false);
    expect(result.size).toBe(12); // 0,2,4,6,8,10,12,14,16,18,20,22
  });

  it('范围步进 1-10/3', () => {
    const result = parseCronField('1-10/3', 0, 59);
    expect(Array.from(result).sort((a, b) => a - b)).toEqual([1, 4, 7, 10]);
  });

  it('超出范围的数字被忽略', () => {
    const result = parseCronField('100', 0, 59);
    expect(result.size).toBe(0);
  });

  it('空字段返回空集合', () => {
    const result = parseCronField('', 0, 59);
    expect(result.size).toBe(0);
  });
});

describe('computeNextCronTrigger', () => {
  it('每小时整点 (0 * * * *)', () => {
    const from = new Date('2026-01-15T10:30:00');
    const next = computeNextCronTrigger('0 * * * *', from);
    expect(next.getHours()).toBe(11);
    expect(next.getMinutes()).toBe(0);
  });

  it('每天凌晨 2 点 (0 2 * * *)', () => {
    const from = new Date('2026-01-15T10:30:00');
    const next = computeNextCronTrigger('0 2 * * *', from);
    expect(next.getDate()).toBe(16);
    expect(next.getHours()).toBe(2);
    expect(next.getMinutes()).toBe(0);
  });

  it('工作日 9 点 (0 9 * * 1-5)', () => {
    // 2026-01-15 是周四
    const from = new Date('2026-01-15T10:00:00');
    const next = computeNextCronTrigger('0 9 * * 1-5', from);
    // 下一个工作日 9 点是周五 1/16
    expect(next.getDate()).toBe(16);
    expect(next.getHours()).toBe(9);
  });

  it('每隔 15 分钟 (*/15 * * * *)', () => {
    const from = new Date('2026-01-15T10:02:00');
    const next = computeNextCronTrigger('*/15 * * * *', from);
    expect(next.getMinutes()).toBe(15);
  });

  it('不完整 cron 表达式默认次日 2:00', () => {
    const from = new Date('2026-01-15T10:00:00');
    const next = computeNextCronTrigger('invalid', from);
    expect(next.getDate()).toBe(16);
    expect(next.getHours()).toBe(2);
  });

  it('月末边界 (0 0 31 * *)', () => {
    // 2026-02-01，2 月没有 31 号，应跳到 3 月 31 日
    const from = new Date('2026-02-01T00:00:00');
    const next = computeNextCronTrigger('0 0 31 * *', from);
    expect(next.getMonth()).toBe(2); // 3 月（0-indexed）
    expect(next.getDate()).toBe(31);
  });
});
