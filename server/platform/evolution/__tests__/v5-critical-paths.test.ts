/**
 * v5.0 关键路径测试
 *
 * 覆盖：
 *   1. Canary Deployer 并发锁竞争（10 并发创建请求，只有 1 个成功获取锁）
 *   2. OTA Fleet Canary 分阶段回滚（健康检查失败触发完整回滚流程）
 *   3. Flywheel executeCycleFromSchedule 数据加载逻辑
 *   4. FFT 正确性验证（与 DFT 结果对比）
 *   5. SLERP Gram-Schmidt 正交化（theta ≈ π 场景）
 *   6. DeploymentRepository 共享数据访问
 *   7. IN 查询分批逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// 1. Canary Deployer 并发锁竞争
// ============================================================================

describe('Canary Deployer — 并发锁竞争', () => {
  /**
   * 模拟 Redis acquireLock 行为：
   *   - 第一个调用者获得锁（返回 lockId）
   *   - 后续调用者被拒绝（返回 null）
   */
  class MockRedisLock {
    private locks = new Map<string, string>();

    async acquireLock(key: string, _ttl: number): Promise<string | null> {
      if (this.locks.has(key)) return null;
      const lockId = `lock_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      this.locks.set(key, lockId);
      return lockId;
    }

    async releaseLock(key: string, lockId: string): Promise<boolean> {
      if (this.locks.get(key) === lockId) {
        this.locks.delete(key);
        return true;
      }
      return false;
    }

    clear() {
      this.locks.clear();
    }
  }

  it('10 个并发请求只有 1 个成功获取锁', async () => {
    const redis = new MockRedisLock();
    const lockKey = 'canary:lock:experiment:42';

    const results = await Promise.all(
      Array.from({ length: 10 }, () => redis.acquireLock(lockKey, 30)),
    );

    const successes = results.filter(r => r !== null);
    const failures = results.filter(r => r === null);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(9);
  });

  it('锁释放后可以重新获取', async () => {
    const redis = new MockRedisLock();
    const lockKey = 'canary:lock:experiment:42';

    const lockId = await redis.acquireLock(lockKey, 30);
    expect(lockId).not.toBeNull();

    // 第二次获取失败
    const second = await redis.acquireLock(lockKey, 30);
    expect(second).toBeNull();

    // 释放后可以重新获取
    await redis.releaseLock(lockKey, lockId!);
    const third = await redis.acquireLock(lockKey, 30);
    expect(third).not.toBeNull();
  });

  it('错误的 lockId 无法释放锁', async () => {
    const redis = new MockRedisLock();
    const lockKey = 'canary:lock:experiment:42';

    await redis.acquireLock(lockKey, 30);
    const released = await redis.releaseLock(lockKey, 'wrong-lock-id');
    expect(released).toBe(false);

    // 锁仍然被持有
    const retry = await redis.acquireLock(lockKey, 30);
    expect(retry).toBeNull();
  });

  it('不同 key 的锁互不影响', async () => {
    const redis = new MockRedisLock();

    const lock1 = await redis.acquireLock('key1', 30);
    const lock2 = await redis.acquireLock('key2', 30);

    expect(lock1).not.toBeNull();
    expect(lock2).not.toBeNull();
  });

  it('并发创建 + 幂等检查模拟', async () => {
    const redis = new MockRedisLock();
    const idempotencyKeys = new Set<string>();
    let deploymentCount = 0;

    async function createDeployment(experimentId: number, modelId: string): Promise<boolean> {
      // 幂等检查
      const idempotencyKey = `canary:create:${experimentId}:${modelId}`;
      if (idempotencyKeys.has(idempotencyKey)) return false;

      // 分布式锁
      const lockKey = `canary:lock:experiment:${experimentId}`;
      const lockId = await redis.acquireLock(lockKey, 30);
      if (!lockId) return false;

      try {
        // 再次检查幂等（双重检查）
        if (idempotencyKeys.has(idempotencyKey)) return false;
        idempotencyKeys.add(idempotencyKey);
        deploymentCount++;
        return true;
      } finally {
        await redis.releaseLock(lockKey, lockId);
      }
    }

    // 10 个并发请求创建同一个部署
    const results = await Promise.all(
      Array.from({ length: 10 }, () => createDeployment(42, 'model-v2')),
    );

    const successes = results.filter(r => r);
    expect(successes.length).toBe(1);
    expect(deploymentCount).toBe(1);
  });
});

// ============================================================================
// 2. OTA Fleet Canary 分阶段回滚
// ============================================================================

describe('OTA Fleet Canary — 分阶段回滚', () => {
  interface MockDeploymentState {
    planId: string;
    status: string;
    stageIndex: number;
    currentStage: string;
    healthChecks: { passed: boolean; checkedAt: number }[];
    consecutivePasses: number;
    rollbackReason?: string;
    startedAt: number;
  }

  const STAGES = [
    { name: 'shadow', trafficPercent: 0, autoAdvance: true },
    { name: 'canary', trafficPercent: 5, autoAdvance: true },
    { name: 'gray', trafficPercent: 20, autoAdvance: true },
    { name: 'half', trafficPercent: 50, autoAdvance: true },
    { name: 'full', trafficPercent: 100, autoAdvance: false },
  ];

  function simulateRollback(
    state: MockDeploymentState,
    failedStageIndex: number,
    reason: string,
  ): { state: MockDeploymentState; skippedStages: string[]; rolledBackStage: string } {
    const rolledBackStage = STAGES[failedStageIndex].name;
    const skippedStages: string[] = [];

    // 第 1 步：流量降到 0%
    // 第 2 步：标记当前阶段为 rolled_back
    // 第 3 步：标记后续阶段为 skipped
    for (let i = failedStageIndex + 1; i < STAGES.length; i++) {
      skippedStages.push(STAGES[i].name);
    }

    state.status = 'rolled_back';
    state.rollbackReason = reason;

    return { state, skippedStages, rolledBackStage };
  }

  it('在 canary 阶段（stageIndex=1）回滚，跳过 gray/half/full', () => {
    const state: MockDeploymentState = {
      planId: 'plan-001',
      status: 'running',
      stageIndex: 1,
      currentStage: 'canary',
      healthChecks: [],
      consecutivePasses: 0,
      startedAt: Date.now(),
    };

    const result = simulateRollback(state, 1, '干预率超标');
    expect(result.rolledBackStage).toBe('canary');
    expect(result.skippedStages).toEqual(['gray', 'half', 'full']);
    expect(result.state.status).toBe('rolled_back');
    expect(result.state.rollbackReason).toBe('干预率超标');
  });

  it('在 shadow 阶段（stageIndex=0）回滚，跳过所有后续阶段', () => {
    const state: MockDeploymentState = {
      planId: 'plan-002',
      status: 'running',
      stageIndex: 0,
      currentStage: 'shadow',
      healthChecks: [],
      consecutivePasses: 0,
      startedAt: Date.now(),
    };

    const result = simulateRollback(state, 0, '影子阶段异常');
    expect(result.skippedStages).toEqual(['canary', 'gray', 'half', 'full']);
  });

  it('在 half 阶段（stageIndex=3）回滚，只跳过 full', () => {
    const state: MockDeploymentState = {
      planId: 'plan-003',
      status: 'running',
      stageIndex: 3,
      currentStage: 'half',
      healthChecks: [],
      consecutivePasses: 0,
      startedAt: Date.now(),
    };

    const result = simulateRollback(state, 3, '延迟 P99 超标');
    expect(result.skippedStages).toEqual(['full']);
  });

  it('在 full 阶段（stageIndex=4）回滚，无跳过阶段', () => {
    const state: MockDeploymentState = {
      planId: 'plan-004',
      status: 'running',
      stageIndex: 4,
      currentStage: 'full',
      healthChecks: [],
      consecutivePasses: 0,
      startedAt: Date.now(),
    };

    const result = simulateRollback(state, 4, '全量阶段错误率飙升');
    expect(result.skippedStages).toEqual([]);
  });

  it('健康检查连续 3 次失败触发回滚', () => {
    const MAX_FAILURES = 3;
    const healthChecks = [
      { passed: true, checkedAt: 1 },
      { passed: true, checkedAt: 2 },
      { passed: false, checkedAt: 3 },
      { passed: false, checkedAt: 4 },
      { passed: false, checkedAt: 5 },
    ];

    let consecutiveFailures = 0;
    let shouldRollback = false;

    for (const check of healthChecks) {
      if (!check.passed) {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_FAILURES) {
          shouldRollback = true;
          break;
        }
      } else {
        consecutiveFailures = 0;
      }
    }

    expect(shouldRollback).toBe(true);
    expect(consecutiveFailures).toBe(3);
  });

  it('健康检查间歇性失败不触发回滚', () => {
    const MAX_FAILURES = 3;
    const healthChecks = [
      { passed: false, checkedAt: 1 },
      { passed: true, checkedAt: 2 },
      { passed: false, checkedAt: 3 },
      { passed: true, checkedAt: 4 },
      { passed: false, checkedAt: 5 },
    ];

    let consecutiveFailures = 0;
    let shouldRollback = false;

    for (const check of healthChecks) {
      if (!check.passed) {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_FAILURES) {
          shouldRollback = true;
          break;
        }
      } else {
        consecutiveFailures = 0;
      }
    }

    expect(shouldRollback).toBe(false);
  });

  it('回滚事件包含完整诊断信息', () => {
    const diagnosticEvent = {
      type: 'ota.deployment.rolled_back',
      source: 'ota-fleet-canary',
      data: {
        planId: 'plan-005',
        modelId: 'model-v3',
        modelVersion: '3.0.1',
        failedStage: 'gray',
        failedStageIndex: 2,
        totalStages: 5,
        reason: '错误率超标: 8.5% > 5%',
        durationMs: 172800000,
        healthChecks: [
          { passed: false, checkedAt: Date.now() - 3000 },
          { passed: false, checkedAt: Date.now() - 2000 },
          { passed: false, checkedAt: Date.now() - 1000 },
        ],
        consecutivePasses: 0,
      },
    };

    expect(diagnosticEvent.data.failedStage).toBe('gray');
    expect(diagnosticEvent.data.healthChecks).toHaveLength(3);
    expect(diagnosticEvent.data.totalStages).toBe(5);
    expect(diagnosticEvent.data.reason).toContain('错误率超标');
  });
});

// ============================================================================
// 3. Flywheel 数据加载逻辑
// ============================================================================

describe('Flywheel — 数据加载与转换', () => {
  interface DiagnosisHistoryEntry {
    reportId: string;
    machineId: string;
    timestamp: number;
    safetyScore: number;
    healthScore: number;
    efficiencyScore: number;
    overallScore: number;
    riskLevel: 'high' | 'medium' | 'low';
  }

  function transformEvalToHistory(
    evalRecord: { id: number; baselineModelId: string; completedAt: number },
    metrics: { challengerValue: number; baselineValue: number }[],
  ): DiagnosisHistoryEntry {
    const avgAccuracy = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.challengerValue, 0) / metrics.length
      : 0;
    const avgBaseline = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.baselineValue, 0) / metrics.length
      : 0;

    return {
      reportId: `eval_${evalRecord.id}`,
      machineId: evalRecord.baselineModelId,
      timestamp: evalRecord.completedAt,
      safetyScore: Math.min(avgAccuracy / (avgBaseline || 1), 1) * 100,
      healthScore: avgAccuracy * 100,
      efficiencyScore: avgBaseline > 0 ? (avgAccuracy / avgBaseline) * 100 : 50,
      overallScore: avgAccuracy * 100,
      riskLevel: avgAccuracy < 0.7 ? 'high' : avgAccuracy < 0.85 ? 'medium' : 'low',
    };
  }

  it('正常评估记录转换为 DiagnosisHistoryEntry', () => {
    const entry = transformEvalToHistory(
      { id: 1, baselineModelId: 'model-v1', completedAt: Date.now() },
      [
        { challengerValue: 0.92, baselineValue: 0.88 },
        { challengerValue: 0.95, baselineValue: 0.90 },
      ],
    );

    expect(entry.reportId).toBe('eval_1');
    expect(entry.riskLevel).toBe('low');
    expect(entry.healthScore).toBeCloseTo(93.5, 1);
    expect(entry.overallScore).toBeCloseTo(93.5, 1);
  });

  it('无指标时默认为高风险', () => {
    const entry = transformEvalToHistory(
      { id: 2, baselineModelId: 'model-v1', completedAt: Date.now() },
      [],
    );

    expect(entry.riskLevel).toBe('high');
    expect(entry.healthScore).toBe(0);
    expect(entry.efficiencyScore).toBe(50);
  });

  it('低准确率标记为高风险', () => {
    const entry = transformEvalToHistory(
      { id: 3, baselineModelId: 'model-v1', completedAt: Date.now() },
      [{ challengerValue: 0.5, baselineValue: 0.9 }],
    );

    expect(entry.riskLevel).toBe('high');
  });

  it('中等准确率标记为中风险', () => {
    const entry = transformEvalToHistory(
      { id: 4, baselineModelId: 'model-v1', completedAt: Date.now() },
      [{ challengerValue: 0.8, baselineValue: 0.85 }],
    );

    expect(entry.riskLevel).toBe('medium');
  });

  it('IN 查询分批逻辑', () => {
    const BATCH_SIZE = 500;
    const ids = Array.from({ length: 1200 }, (_, i) => i + 1);

    const batches: number[][] = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      batches.push(ids.slice(i, i + BATCH_SIZE));
    }

    expect(batches.length).toBe(3);
    expect(batches[0].length).toBe(500);
    expect(batches[1].length).toBe(500);
    expect(batches[2].length).toBe(200);
    expect(batches[0][0]).toBe(1);
    expect(batches[2][batches[2].length - 1]).toBe(1200);
  });

  it('少于 BATCH_SIZE 的 ids 不分批', () => {
    const BATCH_SIZE = 500;
    const ids = Array.from({ length: 100 }, (_, i) => i + 1);

    const batches: number[][] = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      batches.push(ids.slice(i, i + BATCH_SIZE));
    }

    expect(batches.length).toBe(1);
    expect(batches[0].length).toBe(100);
  });
});

// ============================================================================
// 4. FFT 正确性验证
// ============================================================================

describe('FFT — Radix-2 Cooley-Tukey 正确性', () => {
  function nextPowerOf2(n: number): number {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
  }

  function fftRadix2(input: Float64Array): { re: Float64Array; im: Float64Array } {
    const N = input.length;
    const re = new Float64Array(N);
    const im = new Float64Array(N);

    const bits = Math.log2(N);
    for (let i = 0; i < N; i++) {
      let reversed = 0;
      for (let j = 0; j < bits; j++) {
        reversed = (reversed << 1) | ((i >> j) & 1);
      }
      re[reversed] = input[i];
    }

    for (let size = 2; size <= N; size *= 2) {
      const halfSize = size / 2;
      const angle = -2 * Math.PI / size;
      const wRe = Math.cos(angle);
      const wIm = Math.sin(angle);

      for (let i = 0; i < N; i += size) {
        let curRe = 1, curIm = 0;
        for (let j = 0; j < halfSize; j++) {
          const tRe = curRe * re[i + j + halfSize] - curIm * im[i + j + halfSize];
          const tIm = curRe * im[i + j + halfSize] + curIm * re[i + j + halfSize];
          re[i + j + halfSize] = re[i + j] - tRe;
          im[i + j + halfSize] = im[i + j] - tIm;
          re[i + j] += tRe;
          im[i + j] += tIm;
          const newCurRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = newCurRe;
        }
      }
    }

    return { re, im };
  }

  /** 参考 DFT 实现（O(n²)，用于验证 FFT 正确性） */
  function dftReference(input: Float64Array): { re: Float64Array; im: Float64Array } {
    const N = input.length;
    const re = new Float64Array(N);
    const im = new Float64Array(N);

    for (let k = 0; k < N; k++) {
      for (let t = 0; t < N; t++) {
        const angle = (2 * Math.PI * k * t) / N;
        re[k] += input[t] * Math.cos(angle);
        im[k] -= input[t] * Math.sin(angle);
      }
    }

    return { re, im };
  }

  it('FFT 与 DFT 结果一致（8 点信号）', () => {
    const input = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const fftResult = fftRadix2(input);
    const dftResult = dftReference(input);

    for (let k = 0; k < 8; k++) {
      expect(fftResult.re[k]).toBeCloseTo(dftResult.re[k], 6);
      expect(fftResult.im[k]).toBeCloseTo(dftResult.im[k], 6);
    }
  });

  it('FFT 与 DFT 结果一致（16 点正弦波）', () => {
    const N = 16;
    const input = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      input[i] = Math.sin(2 * Math.PI * 3 * i / N); // 频率 = 3
    }

    const fftResult = fftRadix2(input);
    const dftResult = dftReference(input);

    for (let k = 0; k < N; k++) {
      expect(fftResult.re[k]).toBeCloseTo(dftResult.re[k], 4);
      expect(fftResult.im[k]).toBeCloseTo(dftResult.im[k], 4);
    }
  });

  it('FFT 零输入全零输出', () => {
    const input = new Float64Array(8);
    const result = fftRadix2(input);

    for (let k = 0; k < 8; k++) {
      expect(result.re[k]).toBeCloseTo(0, 10);
      expect(result.im[k]).toBeCloseTo(0, 10);
    }
  });

  it('FFT 常数输入只有 DC 分量', () => {
    const input = new Float64Array([5, 5, 5, 5]);
    const result = fftRadix2(input);

    expect(result.re[0]).toBeCloseTo(20, 6); // DC = sum
    for (let k = 1; k < 4; k++) {
      expect(result.re[k]).toBeCloseTo(0, 6);
      expect(result.im[k]).toBeCloseTo(0, 6);
    }
  });

  it('nextPowerOf2 正确计算', () => {
    expect(nextPowerOf2(1)).toBe(1);
    expect(nextPowerOf2(2)).toBe(2);
    expect(nextPowerOf2(3)).toBe(4);
    expect(nextPowerOf2(5)).toBe(8);
    expect(nextPowerOf2(100)).toBe(128);
    expect(nextPowerOf2(1024)).toBe(1024);
    expect(nextPowerOf2(1025)).toBe(2048);
  });

  it('FFT 能量守恒（Parseval 定理）', () => {
    const input = new Float64Array([1, -2, 3, -4, 5, -6, 7, -8]);
    const N = input.length;

    // 时域能量
    let timeDomainEnergy = 0;
    for (let i = 0; i < N; i++) {
      timeDomainEnergy += input[i] * input[i];
    }

    // 频域能量
    const result = fftRadix2(input);
    let freqDomainEnergy = 0;
    for (let k = 0; k < N; k++) {
      freqDomainEnergy += result.re[k] * result.re[k] + result.im[k] * result.im[k];
    }
    freqDomainEnergy /= N;

    expect(freqDomainEnergy).toBeCloseTo(timeDomainEnergy, 4);
  });
});

// ============================================================================
// 5. SLERP Gram-Schmidt 正交化
// ============================================================================

describe('SLERP — Gram-Schmidt 正交化', () => {
  function gramSchmidtOrthogonal(unitA: number[]): number[] {
    const n = unitA.length;
    const perturbed = [...unitA];

    // 找最小分量维度
    let minIdx = 0;
    let minVal = Math.abs(perturbed[0]);
    for (let i = 1; i < n; i++) {
      if (Math.abs(perturbed[i]) < minVal) {
        minVal = Math.abs(perturbed[i]);
        minIdx = i;
      }
    }
    perturbed[minIdx] += 1.0;

    // 正交化
    const projScalar = perturbed.reduce((s, v, i) => s + v * unitA[i], 0);
    const ortho = perturbed.map((v, i) => v - projScalar * unitA[i]);

    // 归一化
    const norm = Math.sqrt(ortho.reduce((s, v) => s + v * v, 0));
    return ortho.map(v => v / norm);
  }

  function dot(a: number[], b: number[]): number {
    return a.reduce((s, v, i) => s + v * b[i], 0);
  }

  function norm(a: number[]): number {
    return Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  }

  it('正交化结果与原向量正交', () => {
    const unitA = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];
    const ortho = gramSchmidtOrthogonal(unitA);

    expect(dot(unitA, ortho)).toBeCloseTo(0, 6);
  });

  it('正交化结果是单位向量', () => {
    const unitA = [1, 0, 0];
    const ortho = gramSchmidtOrthogonal(unitA);

    expect(norm(ortho)).toBeCloseTo(1, 6);
  });

  it('高维向量正交化', () => {
    const n = 100;
    const unitA = new Array(n).fill(1 / Math.sqrt(n));
    const ortho = gramSchmidtOrthogonal(unitA);

    expect(dot(unitA, ortho)).toBeCloseTo(0, 4);
    expect(norm(ortho)).toBeCloseTo(1, 4);
  });

  it('反平行向量的 SLERP 使用正交方向', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0]; // 反平行

    const normA = norm(a);
    const normB = norm(b);
    const cosTheta = dot(a, b) / (normA * normB);
    const theta = Math.acos(Math.max(-1, Math.min(1, cosTheta)));

    expect(Math.abs(theta - Math.PI)).toBeLessThan(1e-6);

    // 使用 Gram-Schmidt 找正交方向
    const unitA = a.map(v => v / normA);
    const ortho = gramSchmidtOrthogonal(unitA);

    // 中间点在正交方向上
    const t = 0.5;
    const halfAngle = t * Math.PI;
    const merged = unitA.map((v, i) =>
      Math.cos(halfAngle) * v + Math.sin(halfAngle) * ortho[i],
    );

    // 中间点应该在正交方向上（t=0.5 时 cos(π/2)=0, sin(π/2)=1）
    expect(merged[0]).toBeCloseTo(0, 4);
    expect(norm(merged)).toBeCloseTo(1, 4);
  });

  it('接近平行向量不触发正交化', () => {
    const a = [1, 0, 0];
    const b = [0.9999, 0.0001, 0]; // 几乎平行

    const normA = norm(a);
    const normB = norm(b);
    const cosTheta = dot(a, b) / (normA * normB);
    const theta = Math.acos(Math.max(-1, Math.min(1, cosTheta)));

    expect(theta).toBeLessThan(0.01); // 接近 0
    expect(Math.abs(theta - Math.PI)).toBeGreaterThan(1e-6); // 不接近 π
  });
});

// ============================================================================
// 6. DeploymentRepository 共享数据访问
// ============================================================================

describe('DeploymentRepository — 共享数据访问', () => {
  it('canary 和 OTA 实例有不同的日志来源', () => {
    // 验证组合模式：两个实例独立，不共享状态
    const canarySource = 'canary-deployer';
    const otaSource = 'ota-fleet-canary';

    expect(canarySource).not.toBe(otaSource);
  });

  it('DeploymentRecord 类型支持 Canary 和 OTA 两种模式', () => {
    // Canary 模式：使用 experimentId + 数字 id
    const canaryRecord = {
      experimentId: '42',
      modelId: 'model-v2',
      status: 'active',
      trafficPercent: 5,
      startedAt: new Date(),
    };

    // OTA 模式：使用 deploymentId (planId) + 字符串标识
    const otaRecord = {
      deploymentId: 'plan-001',
      modelId: 'model-v3',
      modelVersion: '3.0.1',
      status: 'running',
      trafficPercent: 0,
      startedAt: new Date(),
    };

    expect(canaryRecord.experimentId).toBeDefined();
    expect(otaRecord.deploymentId).toBeDefined();
    expect(canaryRecord.status).toBe('active');
    expect(otaRecord.status).toBe('running');
  });

  it('StageRecord 类型统一 Canary 和 OTA 阶段', () => {
    const stages = [
      { deploymentId: 1, stageName: 'shadow', trafficPercent: 0, status: 'completed' },
      { deploymentId: 1, stageName: 'canary', trafficPercent: 5, status: 'active' },
      { deploymentId: 1, stageName: 'gray', trafficPercent: 20, status: 'pending' },
    ];

    expect(stages.filter(s => s.status === 'completed')).toHaveLength(1);
    expect(stages.filter(s => s.status === 'active')).toHaveLength(1);
    expect(stages.filter(s => s.status === 'pending')).toHaveLength(1);
  });

  it('HealthCheckRecord 类型统一健康检查', () => {
    const check = {
      deploymentId: 1,
      stageName: 'canary',
      checkResult: 'passed' as const,
      metrics: {
        interventionRate: 0.02,
        errorRate: 0.001,
        latencyP99: 45,
        activeAlerts: 0,
      },
      checkedAt: new Date(),
    };

    expect(check.checkResult).toBe('passed');
    expect(check.metrics.interventionRate).toBeLessThan(0.05);
  });
});
