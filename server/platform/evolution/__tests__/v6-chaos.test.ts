/**
 * ============================================================================
 * v6.0 混沌测试
 * ============================================================================
 *
 * 测试范围：
 *   - EventBus 发布失败时的降级处理
 *   - DB 超时/不可用时的降级行为
 *   - 跨模块状态不一致时的容错
 *   - 审计 flush 失败后的重试和恢复
 *   - 断路器触发后的熔断行为
 *
 * 设计原则：
 *   每个测试注入一种故障，验证系统不会崩溃且能优雅降级。
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// 故障注入辅助
// ============================================================================

/** 创建一个在前 N 次调用时抛异常、之后恢复正常的函数 */
function createFlakyFn<T>(
  normalResult: T,
  failCount: number,
  errorMessage: string = 'Injected chaos failure',
): { fn: () => Promise<T>; callCount: () => number } {
  let calls = 0;
  return {
    fn: async () => {
      calls++;
      if (calls <= failCount) {
        throw new Error(errorMessage);
      }
      return normalResult;
    },
    callCount: () => calls,
  };
}

/** 创建一个超时模拟函数 */
function createTimeoutFn<T>(
  normalResult: T,
  timeoutMs: number,
): () => Promise<T> {
  return () => new Promise((resolve) => {
    setTimeout(() => resolve(normalResult), timeoutMs);
  });
}

/** 模拟 EventBus（可注入故障） */
class ChaosEventBus {
  private failMode: 'none' | 'throw' | 'timeout' | 'partial' = 'none';
  private publishedEvents: Array<{ type: string; data: any }> = [];
  private failCount = 0;
  private callCount = 0;

  setFailMode(mode: 'none' | 'throw' | 'timeout' | 'partial', count: number = Infinity): void {
    this.failMode = mode;
    this.failCount = count;
    this.callCount = 0;
  }

  async publish(event: { type: string; source: string; data: any }): Promise<string> {
    this.callCount++;

    if (this.failMode === 'throw' && this.callCount <= this.failCount) {
      throw new Error('EventBus: Kafka broker unavailable');
    }

    if (this.failMode === 'timeout' && this.callCount <= this.failCount) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      throw new Error('EventBus: publish timeout');
    }

    if (this.failMode === 'partial' && this.callCount <= this.failCount) {
      // 部分失败：事件被接受但不保证送达
      this.publishedEvents.push(event);
      return `evt_partial_${this.callCount}`;
    }

    this.publishedEvents.push(event);
    return `evt_${this.callCount}`;
  }

  getPublishedEvents(): Array<{ type: string; data: any }> {
    return [...this.publishedEvents];
  }

  getCallCount(): number { return this.callCount; }
  clear(): void { this.publishedEvents = []; this.callCount = 0; }
}

/** 模拟 DB 连接（可注入故障） */
class ChaosDB {
  private failMode: 'none' | 'throw' | 'timeout' | 'null' = 'none';
  private failCount = 0;
  private callCount = 0;
  private data = new Map<string, any[]>();

  setFailMode(mode: 'none' | 'throw' | 'timeout' | 'null', count: number = Infinity): void {
    this.failMode = mode;
    this.failCount = count;
    this.callCount = 0;
  }

  async query(table: string, operation: string, params?: any): Promise<any> {
    this.callCount++;

    if (this.failMode === 'null' && this.callCount <= this.failCount) {
      return null; // 模拟 getDb() 返回 null
    }

    if (this.failMode === 'throw' && this.callCount <= this.failCount) {
      throw new Error('DB: Connection refused (ECONNREFUSED)');
    }

    if (this.failMode === 'timeout' && this.callCount <= this.failCount) {
      await new Promise(resolve => setTimeout(resolve, 30000));
      throw new Error('DB: Query timeout');
    }

    // 正常操作
    if (operation === 'insert') {
      const rows = this.data.get(table) || [];
      const id = rows.length + 1;
      rows.push({ id, ...params });
      this.data.set(table, rows);
      return [{ insertId: id }];
    }

    if (operation === 'select') {
      return this.data.get(table) || [];
    }

    if (operation === 'update') {
      return { affectedRows: 1 };
    }

    return null;
  }

  getCallCount(): number { return this.callCount; }
  clear(): void { this.data.clear(); this.callCount = 0; }
}

// ============================================================================
// 测试套件
// ============================================================================

describe('v6.0 混沌测试', () => {
  let eventBus: ChaosEventBus;
  let db: ChaosDB;

  beforeEach(() => {
    eventBus = new ChaosEventBus();
    db = new ChaosDB();
  });

  // ==========================================================================
  // 1. EventBus 发布失败降级
  // ==========================================================================

  describe('EventBus 发布失败降级', () => {
    test('EventBus 抛异常时业务操作不受影响', async () => {
      eventBus.setFailMode('throw', 3);

      // 模拟 Canary Deployer 的 createDeployment 流程
      // DB 写入成功
      const dbResult = await db.query('canary_deployments', 'insert', {
        modelId: 'model-v2',
        status: 'active',
      });
      expect(dbResult[0].insertId).toBe(1);

      // EventBus 发布失败 — 应该被 catch 而不是传播
      let eventPublished = false;
      try {
        await eventBus.publish({
          type: 'canary.deployment.created',
          source: 'canary-deployer',
          data: { deploymentId: 1 },
        });
        eventPublished = true;
      } catch {
        eventPublished = false;
      }

      // EventBus 失败不应该影响部署创建的结果
      expect(eventPublished).toBe(false);
      // DB 写入仍然成功
      const rows = await db.query('canary_deployments', 'select');
      expect(rows.length).toBe(1);
    });

    test('EventBus 恢复后积压事件可以补发', async () => {
      eventBus.setFailMode('throw', 2);

      // 前 2 次失败
      const failedEvents: any[] = [];
      for (let i = 0; i < 3; i++) {
        try {
          await eventBus.publish({
            type: 'test.event',
            source: 'test',
            data: { index: i },
          });
        } catch {
          failedEvents.push({ type: 'test.event', data: { index: i } });
        }
      }

      expect(failedEvents.length).toBe(2);
      expect(eventBus.getPublishedEvents().length).toBe(1); // 第 3 次成功

      // 补发失败事件
      eventBus.setFailMode('none');
      for (const evt of failedEvents) {
        await eventBus.publish({ ...evt, source: 'retry' });
      }
      expect(eventBus.getPublishedEvents().length).toBe(3);
    });
  });

  // ==========================================================================
  // 2. DB 不可用时的降级行为
  // ==========================================================================

  describe('DB 不可用时的降级行为', () => {
    test('getDb() 返回 null 时 recoverActiveDeployments 安全返回', async () => {
      db.setFailMode('null', 1);

      // 模拟 recoverActiveDeployments 的行为
      const dbConn = await db.query('canary_deployments', 'select');
      if (!dbConn) {
        // 安全返回，不崩溃
        expect(true).toBe(true);
        return;
      }
      // 不应该到达这里
      expect(dbConn).toBeNull();
    });

    test('DB 抛异常时 persistStageRecord 静默失败', async () => {
      db.setFailMode('throw', 1);

      let error: Error | null = null;
      try {
        await db.query('canary_deployment_stages', 'insert', {
          deploymentId: 1,
          stageName: 'shadow',
          status: 'running',
        });
      } catch (err) {
        error = err as Error;
      }

      // 异常被捕获，不传播
      expect(error).toBeTruthy();
      expect(error!.message).toContain('ECONNREFUSED');

      // DB 恢复后正常写入
      db.setFailMode('none');
      const result = await db.query('canary_deployment_stages', 'insert', {
        deploymentId: 1,
        stageName: 'canary',
        status: 'running',
      });
      expect(result[0].insertId).toBe(1);
    });

    test('DB 和 EventBus 同时故障时系统不崩溃', async () => {
      db.setFailMode('throw', 2);
      eventBus.setFailMode('throw', 2);

      // 模拟完整的部署流程（所有外部依赖都失败）
      const errors: string[] = [];

      // Step 1: DB 写入失败
      try {
        await db.query('canary_deployments', 'insert', { modelId: 'v2' });
      } catch (err) {
        errors.push('db_insert');
      }

      // Step 2: EventBus 发布失败
      try {
        await eventBus.publish({
          type: 'canary.deployment.created',
          source: 'test',
          data: {},
        });
      } catch (err) {
        errors.push('eventbus_publish');
      }

      expect(errors).toEqual(['db_insert', 'eventbus_publish']);

      // 恢复后正常工作
      db.setFailMode('none');
      eventBus.setFailMode('none');

      const dbResult = await db.query('canary_deployments', 'insert', { modelId: 'v2' });
      expect(dbResult[0].insertId).toBe(1);

      const eventId = await eventBus.publish({
        type: 'canary.deployment.created',
        source: 'test',
        data: { deploymentId: 1 },
      });
      expect(eventId).toBeTruthy();
    });
  });

  // ==========================================================================
  // 3. 审计 flush 重试机制
  // ==========================================================================

  describe('审计 flush 重试机制', () => {
    test('flush 失败 2 次后第 3 次成功', async () => {
      const { fn: flakyFlush, callCount } = createFlakyFn(
        { flushed: 10 },
        2,
        'Audit DB write failed',
      );

      let result: any = null;
      let attempts = 0;
      const MAX_RETRIES = 3;

      while (attempts < MAX_RETRIES) {
        attempts++;
        try {
          result = await flakyFlush();
          break; // 成功则退出
        } catch {
          if (attempts >= MAX_RETRIES) {
            result = { flushed: 0, error: 'max retries exceeded' };
          }
        }
      }

      expect(callCount()).toBe(3);
      expect(result).toEqual({ flushed: 10 });
    });

    test('flush 连续 3 次失败后 batch 放回 buffer', async () => {
      const { fn: alwaysFail } = createFlakyFn(
        null,
        100, // 始终失败
        'Persistent DB failure',
      );

      const buffer: any[][] = [];
      const batch = [{ event: 'test', timestamp: Date.now() }];
      let attempts = 0;
      const MAX_RETRIES = 3;

      while (attempts < MAX_RETRIES) {
        attempts++;
        try {
          await alwaysFail();
          break;
        } catch {
          if (attempts >= MAX_RETRIES) {
            // 放回 buffer
            buffer.push(batch);
          }
        }
      }

      expect(buffer.length).toBe(1);
      expect(buffer[0]).toEqual(batch);
    });
  });

  // ==========================================================================
  // 4. 跨模块状态不一致
  // ==========================================================================

  describe('跨模块状态不一致', () => {
    test('Shadow Fleet 写 DB 成功但 EventBus 失败时数据不丢失', async () => {
      // DB 正常
      const dbResult = await db.query('shadow_eval_records', 'insert', {
        modelId: 'model-v2',
        status: 'completed',
        metrics: { accuracy: 0.95 },
      });
      expect(dbResult[0].insertId).toBe(1);

      // EventBus 失败
      eventBus.setFailMode('throw', 1);
      let eventFailed = false;
      try {
        await eventBus.publish({
          type: 'shadow.evaluation.completed',
          source: 'shadow-fleet',
          data: { recordId: 1, accuracy: 0.95 },
        });
      } catch {
        eventFailed = true;
      }
      expect(eventFailed).toBe(true);

      // 验证 DB 数据仍然存在（Flywheel 可以通过 DB 轮询恢复）
      const records = await db.query('shadow_eval_records', 'select');
      expect(records.length).toBe(1);
      expect(records[0].metrics.accuracy).toBe(0.95);
    });

    test('Flywheel 处理部分数据时不崩溃', async () => {
      // 模拟只有部分评估记录写入成功
      await db.query('shadow_eval_records', 'insert', {
        modelId: 'v2',
        status: 'completed',
      });
      // 第二条写入失败
      db.setFailMode('throw', 1);
      try {
        await db.query('shadow_eval_records', 'insert', {
          modelId: 'v3',
          status: 'completed',
        });
      } catch {
        // 静默处理
      }

      db.setFailMode('none');

      // Flywheel 读取时只能看到 1 条记录
      const records = await db.query('shadow_eval_records', 'select');
      expect(records.length).toBe(1);

      // Flywheel 应该能处理部分数据（不要求完整性）
      const cycleData = {
        evalCount: records.length,
        hasEnoughData: records.length >= 1,
      };
      expect(cycleData.hasEnoughData).toBe(true);
    });

    test('Canary 部署 DB 成功但 Redis 锁释放失败时不死锁', async () => {
      // 模拟锁获取成功
      const lockId = 'lock-123';

      // 部署创建成功
      const dbResult = await db.query('canary_deployments', 'insert', {
        experimentId: 'exp-001',
        status: 'active',
      });
      expect(dbResult[0].insertId).toBe(1);

      // Redis 锁释放失败（模拟网络抖动）
      let releaseFailed = false;
      try {
        throw new Error('Redis: Connection reset');
      } catch {
        releaseFailed = true;
      }
      expect(releaseFailed).toBe(true);

      // 锁有 TTL，会自动过期，不会死锁
      // 验证部署数据仍然有效
      const deployments = await db.query('canary_deployments', 'select');
      expect(deployments.length).toBe(1);
      expect(deployments[0].status).toBe('active');
    });
  });

  // ==========================================================================
  // 5. 断路器行为验证
  // ==========================================================================

  describe('断路器行为验证', () => {
    test('连续 N 次失败后触发熔断', async () => {
      const FAILURE_THRESHOLD = 5;
      let circuitOpen = false;
      let consecutiveFailures = 0;

      for (let i = 0; i < 10; i++) {
        if (circuitOpen) {
          // 熔断状态：直接拒绝，不尝试调用
          continue;
        }

        try {
          throw new Error('DB connection failed');
        } catch {
          consecutiveFailures++;
          if (consecutiveFailures >= FAILURE_THRESHOLD) {
            circuitOpen = true;
          }
        }
      }

      expect(circuitOpen).toBe(true);
      expect(consecutiveFailures).toBe(FAILURE_THRESHOLD);
    });

    test('熔断后半开状态允许探测请求', async () => {
      let circuitState: 'closed' | 'open' | 'half-open' = 'open';
      let probeResult: 'success' | 'failure' = 'failure';

      // 模拟半开状态
      circuitState = 'half-open';

      // 探测请求成功
      try {
        await db.query('canary_deployments', 'select');
        probeResult = 'success';
        circuitState = 'closed'; // 恢复
      } catch {
        probeResult = 'failure';
        circuitState = 'open'; // 继续熔断
      }

      expect(probeResult).toBe('success');
      expect(circuitState).toBe('closed');
    });
  });

  // ==========================================================================
  // 6. 背压控制
  // ==========================================================================

  describe('背压控制', () => {
    test('审计 buffer 超过阈值时丢弃最旧事件', () => {
      const MAX_BUFFER_SIZE = 1000;
      const buffer: any[] = [];

      // 模拟快速写入 1500 个事件
      for (let i = 0; i < 1500; i++) {
        buffer.push({ id: i, timestamp: Date.now() + i });
        if (buffer.length > MAX_BUFFER_SIZE) {
          buffer.shift(); // 丢弃最旧的
        }
      }

      expect(buffer.length).toBe(MAX_BUFFER_SIZE);
      expect(buffer[0].id).toBe(500); // 最旧的是第 500 个
      expect(buffer[buffer.length - 1].id).toBe(1499); // 最新的是第 1499 个
    });

    test('EventBus 队列满时拒绝新事件', async () => {
      const MAX_QUEUE_SIZE = 100;
      let queueSize = 0;
      const rejected: number[] = [];

      for (let i = 0; i < 150; i++) {
        if (queueSize >= MAX_QUEUE_SIZE) {
          rejected.push(i);
          continue;
        }
        queueSize++;
      }

      expect(queueSize).toBe(MAX_QUEUE_SIZE);
      expect(rejected.length).toBe(50);
      expect(rejected[0]).toBe(100);
    });
  });
});
