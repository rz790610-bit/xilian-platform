/**
 * 向量工具库单元测试
 *
 * 覆盖：余弦相似度、欧氏距离、深度比较（键顺序不同、深层嵌套、浮点容差、类型不匹配）
 */
import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  cosineDistance,
  euclideanDistance,
  deepStructuralEqual,
  flattenToVector,
} from '../../../lib/math/vector-utils';

describe('cosineSimilarity', () => {
  it('相同向量的相似度为 1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0, 6);
  });

  it('正交向量的相似度为 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0, 6);
  });

  it('反向向量的相似度为 -1', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0, 6);
  });

  it('零向量返回 0（不抛异常）', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('不同长度向量截断到最短长度', () => {
    // 实现截断到 minLen，[1,2] vs [1,2] 的余弦相似度为 1
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBeCloseTo(1.0, 6);
  });

  it('单元素向量', () => {
    expect(cosineSimilarity([5], [5])).toBeCloseTo(1.0, 6);
  });
});

describe('cosineDistance', () => {
  it('相同向量距离为 0', () => {
    expect(cosineDistance([1, 2, 3], [1, 2, 3])).toBeCloseTo(0.0, 6);
  });

  it('正交向量距离为 1', () => {
    expect(cosineDistance([1, 0], [0, 1])).toBeCloseTo(1.0, 6);
  });

  it('反向向量距离为 2', () => {
    expect(cosineDistance([1, 0], [-1, 0])).toBeCloseTo(2.0, 6);
  });
});

describe('euclideanDistance', () => {
  it('相同点距离为 0', () => {
    expect(euclideanDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it('标准距离计算', () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBeCloseTo(5.0, 6);
  });
});

describe('deepStructuralEqual', () => {
  it('键顺序不同的对象应相等', () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { z: 3, x: 1, y: 2 };
    expect(deepStructuralEqual(a, b)).toBe(true);
  });

  it('深层嵌套对象应正确比较', () => {
    const a = { level1: { level2: { level3: { value: 42 } } } };
    const b = { level1: { level2: { level3: { value: 42 } } } };
    expect(deepStructuralEqual(a, b)).toBe(true);
  });

  it('浮点数容差比较', () => {
    const a = { score: 0.1 + 0.2 };
    const b = { score: 0.3 };
    expect(deepStructuralEqual(a, b, 1e-9)).toBe(true);
  });

  it('超出容差的浮点数应不等', () => {
    const a = { score: 0.5 };
    const b = { score: 0.6 };
    expect(deepStructuralEqual(a, b, 0.01)).toBe(false);
  });

  it('类型不匹配应不等', () => {
    expect(deepStructuralEqual({ a: 1 }, { a: '1' })).toBe(false);
  });

  it('null 和 undefined 应不等', () => {
    expect(deepStructuralEqual({ a: null }, { a: undefined })).toBe(false);
  });

  it('数组应按序比较', () => {
    expect(deepStructuralEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepStructuralEqual([1, 2, 3], [1, 3, 2])).toBe(false);
  });

  it('空对象应相等', () => {
    expect(deepStructuralEqual({}, {})).toBe(true);
  });

  it('额外键应不等', () => {
    expect(deepStructuralEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});

describe('flattenToVector', () => {
  it('扁平对象提取数值', () => {
    const result = flattenToVector({ a: 1, b: 2.5, c: 'text', d: true });
    expect(result).toEqual([1, 2.5]);
  });

  it('嵌套对象递归提取', () => {
    const result = flattenToVector({ outer: { inner: 3.14 }, top: 1 });
    expect(result).toContain(3.14);
    expect(result).toContain(1);
  });

  it('空对象返回空数组', () => {
    expect(flattenToVector({})).toEqual([]);
  });
});
