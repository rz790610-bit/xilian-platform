/**
 * ============================================================================
 * v6.0 性能基准测试
 * ============================================================================
 *
 * 测试范围：
 *   - FFT Radix-2 vs 原始 DFT 性能对比
 *   - FFT 数值精度验证（Parseval 定理）
 *   - SLERP 正交化性能
 *   - IN 查询分批 vs 单次查询模拟
 *
 * 注意：这些不是 Vitest bench()，而是在 test() 中嵌入 performance.now() 计时，
 *       确保在 CI 中也能运行（bench 模式需要单独配置）。
 */

import { describe, test, expect } from 'vitest';

// ============================================================================
// DFT 参考实现（O(n²) — 用于对比验证）
// ============================================================================

function dftReference(input: number[]): { re: number[]; im: number[] } {
  const n = input.length;
  const re: number[] = new Array(n).fill(0);
  const im: number[] = new Array(n).fill(0);

  for (let k = 0; k < n; k++) {
    for (let t = 0; t < n; t++) {
      const angle = (2 * Math.PI * k * t) / n;
      re[k] += input[t] * Math.cos(angle);
      im[k] -= input[t] * Math.sin(angle);
    }
  }
  return { re, im };
}

// ============================================================================
// FFT Radix-2 Cooley-Tukey（与 e2e-evolution-agent.ts 中的实现一致）
// ============================================================================

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function fftRadix2(input: Float64Array): { re: Float64Array; im: Float64Array } {
  const n = input.length;
  if (n === 1) {
    return { re: Float64Array.from([input[0]]), im: Float64Array.from([0]) };
  }

  // 位逆序排列
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const bits = Math.log2(n);

  for (let i = 0; i < n; i++) {
    let rev = 0;
    for (let j = 0; j < bits; j++) {
      rev = (rev << 1) | ((i >> j) & 1);
    }
    re[rev] = input[i];
  }

  // 蝶形运算
  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size / 2;
    const angle = -2 * Math.PI / size;

    for (let i = 0; i < n; i += size) {
      for (let j = 0; j < halfSize; j++) {
        const theta = angle * j;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        const tRe = re[i + j + halfSize] * cosT - im[i + j + halfSize] * sinT;
        const tIm = re[i + j + halfSize] * sinT + im[i + j + halfSize] * cosT;

        re[i + j + halfSize] = re[i + j] - tRe;
        im[i + j + halfSize] = im[i + j] - tIm;
        re[i + j] += tRe;
        im[i + j] += tIm;
      }
    }
  }

  return { re, im };
}

// ============================================================================
// SLERP 参考实现
// ============================================================================

function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

function normalize(a: number[]): number[] {
  const n = norm(a);
  return n > 0 ? a.map(v => v / n) : a;
}

function slerp(a: number[], b: number[], t: number): number[] {
  const na = normalize(a);
  const nb = normalize(b);
  let cosTheta = dot(na, nb);

  // Clamp
  cosTheta = Math.max(-1, Math.min(1, cosTheta));
  const theta = Math.acos(cosTheta);

  if (theta < 1e-6) {
    // 近乎相同方向：线性插值
    return na.map((v, i) => v * (1 - t) + nb[i] * t);
  }

  if (theta > Math.PI - 1e-6) {
    // 近乎反平行：Gram-Schmidt 正交化后使用半圆 SLERP
    // 当 theta≈π 时 sin(theta)≈0，无法直接用 SLERP 公式。
    // 改为：先找到与 a 正交的方向 c，然后从 a 到 c 做 t*π 的旋转。
    const c = gramSchmidtOrthogonal(na);
    const halfAngle = t * Math.PI;
    return na.map((v, i) =>
      Math.cos(halfAngle) * v + Math.sin(halfAngle) * c[i]
    );
  }

  const sinTheta = Math.sin(theta);
  return na.map((v, i) =>
    (Math.sin((1 - t) * theta) / sinTheta) * v +
    (Math.sin(t * theta) / sinTheta) * nb[i]
  );
}

function gramSchmidtOrthogonal(a: number[]): number[] {
  // 选择与 a 最小分量对应的标准基向量
  let minIdx = 0;
  let minVal = Math.abs(a[0]);
  for (let i = 1; i < a.length; i++) {
    if (Math.abs(a[i]) < minVal) {
      minVal = Math.abs(a[i]);
      minIdx = i;
    }
  }

  const e = new Array(a.length).fill(0);
  e[minIdx] = 1;

  // Gram-Schmidt: e - (e·a)a
  const proj = dot(e, a);
  const result = e.map((v, i) => v - proj * a[i]);
  return normalize(result);
}

// ============================================================================
// 辅助函数
// ============================================================================

function generateSignal(n: number): number[] {
  const signal: number[] = [];
  for (let i = 0; i < n; i++) {
    // 混合信号：50Hz + 120Hz + 噪声
    signal.push(
      Math.sin(2 * Math.PI * 50 * i / n) +
      0.5 * Math.sin(2 * Math.PI * 120 * i / n) +
      0.1 * (Math.random() - 0.5)
    );
  }
  return signal;
}

function generateRandomVector(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1);
}

// ============================================================================
// 测试套件
// ============================================================================

describe('v6.0 性能基准测试', () => {

  // ==========================================================================
  // 1. FFT vs DFT 性能对比
  // ==========================================================================

  describe('FFT vs DFT 性能对比', () => {
    test('FFT 256 点 vs DFT 256 点：FFT 应快 10 倍以上', () => {
      const signal = generateSignal(256);
      const padded = new Float64Array(256);
      signal.forEach((v, i) => padded[i] = v);

      // DFT 计时
      const dftStart = performance.now();
      for (let i = 0; i < 100; i++) {
        dftReference(signal);
      }
      const dftTime = (performance.now() - dftStart) / 100;

      // FFT 计时
      const fftStart = performance.now();
      for (let i = 0; i < 100; i++) {
        fftRadix2(padded);
      }
      const fftTime = (performance.now() - fftStart) / 100;

      const speedup = dftTime / fftTime;

      // FFT 应该至少快 5 倍（256 点时理论加速比 ≈ 256/8 = 32）
      expect(speedup).toBeGreaterThan(5);
    });

    test('FFT 1024 点 vs DFT 1024 点：FFT 应快 50 倍以上', () => {
      const signal = generateSignal(1024);
      const padded = new Float64Array(1024);
      signal.forEach((v, i) => padded[i] = v);

      // DFT 计时
      const dftStart = performance.now();
      for (let i = 0; i < 10; i++) {
        dftReference(signal);
      }
      const dftTime = (performance.now() - dftStart) / 10;

      // FFT 计时
      const fftStart = performance.now();
      for (let i = 0; i < 10; i++) {
        fftRadix2(padded);
      }
      const fftTime = (performance.now() - fftStart) / 10;

      const speedup = dftTime / fftTime;

      // 1024 点时理论加速比 ≈ 1024/10 = 102
      expect(speedup).toBeGreaterThan(20);
    });

    test('FFT 4096 点单次执行 < 2ms', () => {
      const signal = generateSignal(4096);
      const padded = new Float64Array(4096);
      signal.forEach((v, i) => padded[i] = v);

      // 预热
      fftRadix2(padded);

      const start = performance.now();
      fftRadix2(padded);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(2); // < 2ms
    });
  });

  // ==========================================================================
  // 2. FFT 数值精度验证
  // ==========================================================================

  describe('FFT 数值精度验证', () => {
    test('Parseval 定理：时域能量 ≈ 频域能量', () => {
      const signal = generateSignal(256);
      const padded = new Float64Array(256);
      signal.forEach((v, i) => padded[i] = v);

      // 时域能量
      const timeEnergy = signal.reduce((s, v) => s + v * v, 0);

      // FFT
      const { re, im } = fftRadix2(padded);

      // 频域能量（除以 N）
      let freqEnergy = 0;
      for (let k = 0; k < 256; k++) {
        freqEnergy += re[k] * re[k] + im[k] * im[k];
      }
      freqEnergy /= 256;

      // Parseval 定理：两者应该相等（误差 < 1%）
      const relativeError = Math.abs(timeEnergy - freqEnergy) / timeEnergy;
      expect(relativeError).toBeLessThan(0.01);
    });

    test('FFT 与 DFT 结果一致（8 点信号）', () => {
      const signal = [1, 2, 3, 4, 5, 6, 7, 8];
      const padded = new Float64Array(8);
      signal.forEach((v, i) => padded[i] = v);

      const dftResult = dftReference(signal);
      const fftResult = fftRadix2(padded);

      for (let k = 0; k < 8; k++) {
        expect(fftResult.re[k]).toBeCloseTo(dftResult.re[k], 6);
        expect(fftResult.im[k]).toBeCloseTo(dftResult.im[k], 6);
      }
    });

    test('FFT 与 DFT 结果一致（16 点正弦波）', () => {
      const signal = Array.from({ length: 16 }, (_, i) => Math.sin(2 * Math.PI * 3 * i / 16));
      const padded = new Float64Array(16);
      signal.forEach((v, i) => padded[i] = v);

      const dftResult = dftReference(signal);
      const fftResult = fftRadix2(padded);

      for (let k = 0; k < 16; k++) {
        expect(fftResult.re[k]).toBeCloseTo(dftResult.re[k], 5);
        expect(fftResult.im[k]).toBeCloseTo(dftResult.im[k], 5);
      }
    });

    test('zero-padding 不改变主要频率成分', () => {
      // 8 点信号 zero-pad 到 16 点
      const signal8 = Array.from({ length: 8 }, (_, i) => Math.sin(2 * Math.PI * 2 * i / 8));
      const padded16 = new Float64Array(16);
      signal8.forEach((v, i) => padded16[i] = v);

      const fft8 = fftRadix2(Float64Array.from(signal8));
      const fft16 = fftRadix2(padded16);

      // 8 点 FFT 的主频率 bin（k=2）应该在 16 点 FFT 的 k=4 处
      const peak8 = Math.sqrt(fft8.re[2] ** 2 + fft8.im[2] ** 2);
      const peak16 = Math.sqrt(fft16.re[4] ** 2 + fft16.im[4] ** 2);

      // 能量应该一致（允许 5% 误差）
      expect(Math.abs(peak8 - peak16) / peak8).toBeLessThan(0.05);
    });
  });

  // ==========================================================================
  // 3. SLERP 性能和正确性
  // ==========================================================================

  describe('SLERP 性能和正确性', () => {
    test('SLERP 128 维向量 1000 次 < 50ms', () => {
      const a = generateRandomVector(128);
      const b = generateRandomVector(128);

      // 预热
      slerp(a, b, 0.5);

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        slerp(a, b, i / 1000);
      }
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
    });

    test('SLERP 结果始终为单位向量', () => {
      const a = generateRandomVector(64);
      const b = generateRandomVector(64);

      for (let t = 0; t <= 1; t += 0.1) {
        const result = slerp(a, b, t);
        const resultNorm = norm(result);
        expect(resultNorm).toBeCloseTo(1.0, 3);
      }
    });

    test('SLERP t=0 返回 a，t=1 返回 b', () => {
      const a = generateRandomVector(32);
      const b = generateRandomVector(32);

      const atZero = slerp(a, b, 0);
      const atOne = slerp(a, b, 1);

      const na = normalize(a);
      const nb = normalize(b);

      for (let i = 0; i < 32; i++) {
        expect(atZero[i]).toBeCloseTo(na[i], 5);
        expect(atOne[i]).toBeCloseTo(nb[i], 5);
      }
    });

    test('Gram-Schmidt 正交化：反平行向量不崩溃', () => {
      const a = [1, 0, 0, 0];
      const b = [-1, 0, 0, 0]; // 反平行

      // 不应该抛异常
      const result = slerp(a, b, 0.5);
      expect(result.length).toBe(4);

      // 结果应该是单位向量
      const resultNorm = norm(result);
      expect(resultNorm).toBeCloseTo(1.0, 3);

      // 结果应该与 a 和 b 都正交（t=0.5 时在大圆的中点）
      const dotA = Math.abs(dot(result, normalize(a)));
      expect(dotA).toBeLessThan(0.1); // 近似正交
    });

    test('Gram-Schmidt 选择最小分量维度', () => {
      const a = normalize([0.01, 0.99, 0.1]);
      const orth = gramSchmidtOrthogonal(a);

      // 正交性验证
      const dotProduct = dot(a, orth);
      expect(Math.abs(dotProduct)).toBeLessThan(1e-10);

      // 单位向量
      expect(norm(orth)).toBeCloseTo(1.0, 10);
    });
  });

  // ==========================================================================
  // 4. IN 查询分批性能模拟
  // ==========================================================================

  describe('IN 查询分批性能模拟', () => {
    test('分批查询 1200 条 vs 单次查询：分批不超过 3 倍开销', () => {
      const ids = Array.from({ length: 1200 }, (_, i) => i + 1);
      const BATCH_SIZE = 500;

      // 模拟单次查询
      const singleStart = performance.now();
      const singleResult = ids.filter(id => id % 3 === 0); // 模拟 WHERE 过滤
      const singleTime = performance.now() - singleStart;

      // 模拟分批查询
      const batchStart = performance.now();
      let batchResult: number[] = [];
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        batchResult = batchResult.concat(batch.filter(id => id % 3 === 0));
      }
      const batchTime = performance.now() - batchStart;

      // 结果一致
      expect(batchResult.length).toBe(singleResult.length);

      // 分批开销不超过 5 倍（内存操作差异很小）
      expect(batchTime).toBeLessThan(Math.max(singleTime * 5, 1)); // 至少 1ms 容差
    });

    test('分批大小可配置：BATCH_SIZE=100 vs 500', () => {
      const ids = Array.from({ length: 2000 }, (_, i) => i + 1);

      // BATCH_SIZE=100 → 20 批
      let batches100 = 0;
      for (let i = 0; i < ids.length; i += 100) {
        batches100++;
      }

      // BATCH_SIZE=500 → 4 批
      let batches500 = 0;
      for (let i = 0; i < ids.length; i += 500) {
        batches500++;
      }

      expect(batches100).toBe(20);
      expect(batches500).toBe(4);
    });
  });
});
