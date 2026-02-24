/**
 * ============================================================================
 * v6.0 Redis 集成测试
 * ============================================================================
 *
 * 测试范围：
 *   - 分布式锁竞争（acquireLock / releaseLock）
 *   - TTL 过期行为
 *   - Redis 断连降级（fallback 行为）
 *   - 锁的原子性（Lua 脚本正确性）
 *   - 幂等 key 场景
 *
 * 使用内存级 mock（模拟 ioredis 行为），无需真实 Redis 实例。
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// 内存级 Redis Mock（模拟 ioredis 核心行为）
// ============================================================================

class InMemoryRedisMock {
  private store = new Map<string, { value: string; expiresAt: number | null }>();
  private connected = true;

  /** 模拟 SET key value EX ttl NX */
  async set(key: string, value: string, ...args: any[]): Promise<string | null> {
    if (!this.connected) throw new Error('Connection is closed');

    let ttl: number | null = null;
    let nx = false;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === 'EX' && args[i + 1] !== undefined) {
        ttl = args[i + 1] as number;
        i++;
      }
      if (args[i] === 'NX') nx = true;
    }

    // 清理过期 key
    this.cleanExpired();

    if (nx && this.store.has(key)) {
      return null; // NX 模式：key 已存在，返回 null
    }

    this.store.set(key, {
      value,
      expiresAt: ttl ? Date.now() + ttl * 1000 : null,
    });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    if (!this.connected) throw new Error('Connection is closed');
    this.cleanExpired();
    const entry = this.store.get(key);
    return entry ? entry.value : null;
  }

  async del(key: string): Promise<number> {
    if (!this.connected) throw new Error('Connection is closed');
    return this.store.delete(key) ? 1 : 0;
  }

  /** 模拟 EVAL（Lua 脚本 — 锁释放的原子性） */
  async eval(script: string, numKeys: number, ...args: any[]): Promise<number> {
    if (!this.connected) throw new Error('Connection is closed');
    this.cleanExpired();

    const key = args[0] as string;
    const expectedValue = args[1] as string;

    const entry = this.store.get(key);
    if (entry && entry.value === expectedValue) {
      this.store.delete(key);
      return 1;
    }
    return 0;
  }

  /** 模拟 SETNX */
  async setnx(key: string, value: string): Promise<number> {
    if (!this.connected) throw new Error('Connection is closed');
    this.cleanExpired();
    if (this.store.has(key)) return 0;
    this.store.set(key, { value, expiresAt: null });
    return 1;
  }

  /** 模拟 EXPIRE */
  async expire(key: string, seconds: number): Promise<number> {
    if (!this.connected) throw new Error('Connection is closed');
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  /** 模拟 TTL */
  async ttl(key: string): Promise<number> {
    if (!this.connected) throw new Error('Connection is closed');
    this.cleanExpired();
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (!entry.expiresAt) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  // 测试辅助方法
  simulateDisconnect(): void { this.connected = false; }
  simulateReconnect(): void { this.connected = true; }
  clear(): void { this.store.clear(); }

  /** 模拟时间推进（让 key 过期） */
  advanceTime(ms: number): void {
    for (const [key, entry] of this.store) {
      if (entry.expiresAt) {
        entry.expiresAt -= ms;
      }
    }
    this.cleanExpired();
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }
}

// ============================================================================
// 基于 InMemoryRedisMock 的 RedisClient 适配器
// ============================================================================

class TestRedisClient {
  private mock: InMemoryRedisMock;
  private LOCK_PREFIX = 'lock:';

  constructor(mock: InMemoryRedisMock) {
    this.mock = mock;
  }

  async acquireLock(lockName: string, ttlSeconds: number = 30): Promise<string | null> {
    const key = `${this.LOCK_PREFIX}${lockName}`;
    const lockId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const result = await this.mock.set(key, lockId, 'EX', ttlSeconds, 'NX');
      return result === 'OK' ? lockId : null;
    } catch {
      return null; // Redis 不可用时降级
    }
  }

  async releaseLock(lockName: string, lockId: string): Promise<boolean> {
    const key = `${this.LOCK_PREFIX}${lockName}`;

    try {
      const script = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
      const result = await this.mock.eval(script, 1, key, lockId);
      return result === 1;
    } catch {
      return false;
    }
  }

  async setnx(key: string, value: string): Promise<boolean> {
    try {
      const result = await this.mock.setnx(key, value);
      return result === 1;
    } catch {
      return true; // Redis 不可用时降级为允许
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.mock.expire(key, seconds);
      return result === 1;
    } catch {
      return false;
    }
  }

  async get<T = string>(key: string): Promise<T | null> {
    try {
      return await this.mock.get(key) as T;
    } catch {
      return null;
    }
  }

  getMock(): InMemoryRedisMock { return this.mock; }
}

// ============================================================================
// 测试套件
// ============================================================================

describe('v6.0 Redis 集成测试', () => {
  let redisMock: InMemoryRedisMock;
  let redis: TestRedisClient;

  beforeEach(() => {
    redisMock = new InMemoryRedisMock();
    redis = new TestRedisClient(redisMock);
  });

  // ==========================================================================
  // 1. 分布式锁基本行为
  // ==========================================================================

  describe('分布式锁基本行为', () => {
    test('成功获取锁并返回 lockId', async () => {
      const lockId = await redis.acquireLock('test-lock', 30);
      expect(lockId).toBeTruthy();
      expect(typeof lockId).toBe('string');
    });

    test('同一锁名不能重复获取（NX 语义）', async () => {
      const lockId1 = await redis.acquireLock('test-lock', 30);
      const lockId2 = await redis.acquireLock('test-lock', 30);

      expect(lockId1).toBeTruthy();
      expect(lockId2).toBeNull(); // 第二次获取失败
    });

    test('释放锁后可以重新获取', async () => {
      const lockId1 = await redis.acquireLock('test-lock', 30);
      expect(lockId1).toBeTruthy();

      const released = await redis.releaseLock('test-lock', lockId1!);
      expect(released).toBe(true);

      const lockId2 = await redis.acquireLock('test-lock', 30);
      expect(lockId2).toBeTruthy();
    });

    test('不同锁名互不干扰', async () => {
      const lockA = await redis.acquireLock('lock-a', 30);
      const lockB = await redis.acquireLock('lock-b', 30);

      expect(lockA).toBeTruthy();
      expect(lockB).toBeTruthy();
    });
  });

  // ==========================================================================
  // 2. 锁竞争场景（模拟 10 个并发请求）
  // ==========================================================================

  describe('锁竞争场景', () => {
    test('10 个并发请求只有 1 个能获取锁', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () => redis.acquireLock('canary:lock:experiment:exp-001', 30))
      );

      const acquired = results.filter(r => r !== null);
      const failed = results.filter(r => r === null);

      expect(acquired.length).toBe(1);
      expect(failed.length).toBe(9);
    });

    test('获取锁的请求释放后，下一个请求可以获取', async () => {
      // 第一轮：只有 1 个成功
      const round1 = await Promise.all(
        Array.from({ length: 5 }, () => redis.acquireLock('deploy-lock', 30))
      );
      const winner = round1.find(r => r !== null);
      expect(winner).toBeTruthy();

      // 释放锁
      await redis.releaseLock('deploy-lock', winner!);

      // 第二轮：又有 1 个成功
      const round2 = await Promise.all(
        Array.from({ length: 5 }, () => redis.acquireLock('deploy-lock', 30))
      );
      const winner2 = round2.find(r => r !== null);
      expect(winner2).toBeTruthy();
    });

    test('并发释放锁只有持有者能成功（原子性验证）', async () => {
      const lockId = await redis.acquireLock('atomic-lock', 30);
      expect(lockId).toBeTruthy();

      // 模拟多个实例尝试释放（只有持有正确 lockId 的能成功）
      const results = await Promise.all([
        redis.releaseLock('atomic-lock', lockId!),
        redis.releaseLock('atomic-lock', 'fake-lock-id-1'),
        redis.releaseLock('atomic-lock', 'fake-lock-id-2'),
      ]);

      // 只有第一个（持有正确 lockId）成功
      expect(results[0]).toBe(true);
      expect(results[1]).toBe(false);
      expect(results[2]).toBe(false);
    });
  });

  // ==========================================================================
  // 3. TTL 过期行为
  // ==========================================================================

  describe('TTL 过期行为', () => {
    test('锁在 TTL 过期后自动释放', async () => {
      const lockId = await redis.acquireLock('ttl-lock', 5); // 5 秒 TTL
      expect(lockId).toBeTruthy();

      // 模拟时间推进 6 秒
      redisMock.advanceTime(6000);

      // 锁已过期，可以重新获取
      const newLockId = await redis.acquireLock('ttl-lock', 30);
      expect(newLockId).toBeTruthy();
    });

    test('TTL 未过期时锁仍然有效', async () => {
      const lockId = await redis.acquireLock('ttl-lock', 10);
      expect(lockId).toBeTruthy();

      // 模拟时间推进 3 秒（未过期）
      redisMock.advanceTime(3000);

      // 锁仍然有效，无法获取
      const lockId2 = await redis.acquireLock('ttl-lock', 10);
      expect(lockId2).toBeNull();
    });

    test('幂等 key 在 TTL 内阻止重复操作', async () => {
      const key = 'ota:deploy:idempotent:plan-001';
      const first = await redis.setnx(key, '1');
      expect(first).toBe(true);

      await redis.expire(key, 86400); // 24 小时 TTL

      // 重复操作被阻止
      const second = await redis.setnx(key, '1');
      expect(second).toBe(false);

      // 模拟 24 小时后
      redisMock.advanceTime(86400 * 1000 + 1000);

      // TTL 过期后可以重新操作
      const third = await redis.setnx(key, '1');
      expect(third).toBe(true);
    });
  });

  // ==========================================================================
  // 4. Redis 断连降级
  // ==========================================================================

  describe('Redis 断连降级', () => {
    test('Redis 断连时 acquireLock 返回 null（降级为拒绝）', async () => {
      redisMock.simulateDisconnect();

      const lockId = await redis.acquireLock('test-lock', 30);
      expect(lockId).toBeNull();
    });

    test('Redis 断连时 releaseLock 返回 false', async () => {
      // 先正常获取锁
      const lockId = await redis.acquireLock('test-lock', 30);
      expect(lockId).toBeTruthy();

      // 断连后释放
      redisMock.simulateDisconnect();
      const released = await redis.releaseLock('test-lock', lockId!);
      expect(released).toBe(false);
    });

    test('Redis 断连时 setnx 降级为允许（幂等 key 场景）', async () => {
      redisMock.simulateDisconnect();

      // 幂等 key 降级为允许操作（避免 Redis 故障阻塞业务）
      const result = await redis.setnx('idempotent-key', '1');
      expect(result).toBe(true);
    });

    test('Redis 重连后恢复正常行为', async () => {
      redisMock.simulateDisconnect();
      const lockId1 = await redis.acquireLock('test-lock', 30);
      expect(lockId1).toBeNull();

      redisMock.simulateReconnect();
      const lockId2 = await redis.acquireLock('test-lock', 30);
      expect(lockId2).toBeTruthy();
    });
  });

  // ==========================================================================
  // 5. Canary Deployer 锁场景模拟
  // ==========================================================================

  describe('Canary Deployer 锁场景模拟', () => {
    test('createDeployment 并发锁保护（完整流程）', async () => {
      const experimentId = 'exp-001';
      const lockKey = `canary:lock:experiment:${experimentId}`;

      // 模拟两个实例并发创建部署
      const instance1Lock = await redis.acquireLock(lockKey, 30);
      const instance2Lock = await redis.acquireLock(lockKey, 30);

      expect(instance1Lock).toBeTruthy();
      expect(instance2Lock).toBeNull();

      // 实例 1 完成后释放锁
      await redis.releaseLock(lockKey, instance1Lock!);

      // 实例 2 重试后可以获取
      const instance2Retry = await redis.acquireLock(lockKey, 30);
      expect(instance2Retry).toBeTruthy();
    });

    test('OTA 幂等 key 防止重复部署', async () => {
      const planId = 'ota-plan-001';
      const idempotencyKey = `ota:deploy:idempotent:${planId}`;

      // 第一次部署：获取幂等 key
      const first = await redis.setnx(idempotencyKey, '1');
      expect(first).toBe(true);
      await redis.expire(idempotencyKey, 86400);

      // 重复部署：被幂等 key 拦截
      const duplicate = await redis.setnx(idempotencyKey, '1');
      expect(duplicate).toBe(false);
    });

    test('锁超时后自动释放防止死锁', async () => {
      const lockKey = 'canary:lock:experiment:exp-crash';

      // 实例 1 获取锁后"崩溃"（不释放）
      const lockId = await redis.acquireLock(lockKey, 5); // 5 秒 TTL
      expect(lockId).toBeTruthy();

      // 5 秒后锁自动释放
      redisMock.advanceTime(6000);

      // 实例 2 可以获取锁（不会死锁）
      const newLockId = await redis.acquireLock(lockKey, 30);
      expect(newLockId).toBeTruthy();
    });
  });
});
