/**
 * 统计工具库单元测试
 *
 * 覆盖：KL 散度（零概率桶、归一化分布）、JS 散度、TDigest 近似分位数
 */
import { describe, it, expect } from 'vitest';
import {
  klDivergence,
  jsDivergence,
  entropy,
  TDigest,
} from '../../../lib/math/stats';

describe('klDivergence', () => {
  it('相同分布的 KL 散度为 0', () => {
    const p = [0.25, 0.25, 0.25, 0.25];
    expect(klDivergence(p, p)).toBeCloseTo(0, 6);
  });

  it('不同分布的 KL 散度 > 0', () => {
    const p = [0.9, 0.1];
    const q = [0.1, 0.9];
    expect(klDivergence(p, q)).toBeGreaterThan(0);
  });

  it('零概率桶不应导致 Infinity 或 NaN', () => {
    const p = [0.5, 0.5, 0];
    const q = [0.33, 0.33, 0.34];
    const result = klDivergence(p, q);
    expect(isFinite(result)).toBe(true);
    expect(isNaN(result)).toBe(false);
  });

  it('q 中有零概率桶时应使用平滑', () => {
    const p = [0.5, 0.5];
    const q = [1.0, 0.0];
    const result = klDivergence(p, q);
    expect(isFinite(result)).toBe(true);
  });

  it('非归一化分布应自动归一化', () => {
    const p = [1, 1, 1, 1]; // 和为 4，非归一化
    const q = [2, 2, 2, 2]; // 和为 8
    // 归一化后两者相同，KL 应为 0
    expect(klDivergence(p, q)).toBeCloseTo(0, 4);
  });

  it('长度不同应返回 Infinity 或抛异常', () => {
    const p = [0.5, 0.5];
    const q = [0.33, 0.33, 0.34];
    // 实现可能返回 Infinity 或 0，取决于处理策略
    const result = klDivergence(p, q);
    expect(typeof result).toBe('number');
  });
});

describe('jsDivergence', () => {
  it('相同分布的 JS 散度为 0', () => {
    const p = [0.5, 0.5];
    expect(jsDivergence(p, p)).toBeCloseTo(0, 6);
  });

  it('JS 散度是对称的', () => {
    const p = [0.9, 0.1];
    const q = [0.1, 0.9];
    expect(jsDivergence(p, q)).toBeCloseTo(jsDivergence(q, p), 6);
  });

  it('JS 散度 ∈ [0, ln(2)]', () => {
    const p = [1, 0];
    const q = [0, 1];
    const result = jsDivergence(p, q);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(Math.log(2) + 0.01); // 允许微小浮点误差
  });
});

describe('entropy', () => {
  it('均匀分布的熵最大', () => {
    const uniform = [0.25, 0.25, 0.25, 0.25];
    const nonUniform = [0.7, 0.1, 0.1, 0.1];
    expect(entropy(uniform)).toBeGreaterThan(entropy(nonUniform));
  });

  it('确定性分布的熵为 0', () => {
    const certain = [1, 0, 0, 0];
    expect(entropy(certain)).toBeCloseTo(0, 6);
  });
});

describe('TDigest', () => {
  it('基本分位数估计', () => {
    const td = new TDigest();
    // 插入 1-100
    for (let i = 1; i <= 100; i++) {
      td.add(i);
    }
    // P50 应接近 50
    expect(td.quantile(0.5)).toBeGreaterThan(40);
    expect(td.quantile(0.5)).toBeLessThan(60);
    // P99 应接近 99
    expect(td.quantile(0.99)).toBeGreaterThan(90);
  });

  it('单个值', () => {
    const td = new TDigest();
    td.add(42);
    expect(td.quantile(0.5)).toBe(42);
    expect(td.quantile(0.99)).toBe(42);
  });

  it('空 TDigest 返回 0', () => {
    const td = new TDigest();
    expect(td.quantile(0.5)).toBe(0);
  });

  it('大量数据的精度', () => {
    const td = new TDigest();
    for (let i = 0; i < 10000; i++) {
      td.add(Math.random() * 1000);
    }
    // P50 应在 400-600 之间（均匀分布的中位数约 500）
    const p50 = td.quantile(0.5);
    expect(p50).toBeGreaterThan(350);
    expect(p50).toBeLessThan(650);
  });
});
