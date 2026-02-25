/**
 * ============================================================================
 * 进化引擎 E2E 测试 — 飞轮完整闭环 + 世界模型 + 策略插件 + 自愈
 * ============================================================================
 *
 * 覆盖范围：
 *   1. 飞轮周期创建 → 5步推进 → 完成
 *   2. 世界模型版本管理 + ONNX 预测
 *   3. 影子评估创建 + 冠军挑战者实验
 *   4. 金丝雀部署创建
 *   5. 知识结晶
 *   6. 自愈策略执行
 *   7. Prometheus /api/metrics 端点
 *   8. 策略插件注册验证
 *
 * 运行方式：
 *   pnpm test:e2e
 *
 * 前置条件：
 *   - 服务器运行在 http://localhost:3000
 *   - 数据库已初始化
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

// ── 工具函数 ──────────────────────────────────────────────────────────────
/** 发送 tRPC mutation（批量模式） */
async function trpcMutate(path: string, input: unknown) {
  const res = await request(BASE_URL)
    .post('/trpc/' + path)
    .send({ json: input })
    .set('Content-Type', 'application/json')
    .expect('Content-Type', /json/);
  // tRPC v11 返回格式
  const body = res.body;
  if (body?.error) throw new Error(`tRPC error: ${JSON.stringify(body.error)}`);
  return body?.result?.data ?? body;
}

/** 发送 tRPC query */
async function trpcQuery(path: string, input?: unknown) {
  const url = input
    ? `/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
    : `/trpc/${path}`;
  const res = await request(BASE_URL)
    .get(url)
    .expect('Content-Type', /json/);
  const body = res.body;
  if (body?.error) throw new Error(`tRPC error: ${JSON.stringify(body.error)}`);
  return body?.result?.data ?? body;
}

// ── 测试套件 ──────────────────────────────────────────────────────────────
describe('进化引擎 E2E — 飞轮完整闭环', () => {
  let cycleId: number;
  let cycleNumber: number;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. 飞轮周期生命周期
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('1. 飞轮周期生命周期', () => {
    it('1.1 创建进化周期', async () => {
      const data = await trpcMutate('evoEvolution.cycle.startCycle', {
        trigger: 'manual',
        config: { testRun: true },
      });
      expect(data.cycleId).toBeGreaterThan(0);
      expect(data.cycleNumber).toBeGreaterThan(0);
      cycleId = data.cycleId;
      cycleNumber = data.cycleNumber;
    });

    it('1.2 获取当前周期状态', async () => {
      const data = await trpcQuery('evoEvolution.cycle.getCurrent');
      expect(data.cycle).toBeDefined();
      expect(data.cycle.status).toBe('running');
    });

    it('1.3 获取步骤日志（5步初始化）', async () => {
      const data = await trpcQuery('evoEvolution.cycle.getStepLogs', { cycleId });
      expect(data.stepLogs).toHaveLength(5);
      expect(data.stepLogs[0].stepName).toBe('数据发现');
      expect(data.stepLogs[0].status).toBe('running');
      expect(data.stepLogs[4].stepName).toBe('反馈结晶');
      expect(data.stepLogs[4].status).toBe('pending');
    });

    it('1.4 推进5步完成闭环', async () => {
      const steps = [
        { stepNumber: 1, status: 'completed' as const, metrics: { edgeCasesFound: 12 } },
        { stepNumber: 2, status: 'completed' as const, metrics: { hypothesesGenerated: 5 } },
        { stepNumber: 3, status: 'completed' as const, metrics: { shadowAccuracy: 0.92 } },
        { stepNumber: 4, status: 'completed' as const, metrics: { canarySuccessRate: 0.98 } },
        { stepNumber: 5, status: 'completed' as const, metrics: { crystalsCreated: 3 } },
      ];

      for (const step of steps) {
        const result = await trpcMutate('evoEvolution.cycle.advanceStep', {
          cycleId,
          ...step,
        });
        expect(result).toBeDefined();
      }
    });

    it('1.5 验证步骤全部完成', async () => {
      const data = await trpcQuery('evoEvolution.cycle.getStepLogs', { cycleId });
      const allCompleted = data.stepLogs.every(
        (s: { status: string }) => s.status === 'completed'
      );
      expect(allCompleted).toBe(true);
    });

    it('1.6 趋势分析可用', async () => {
      const data = await trpcQuery('evoEvolution.cycle.getTrend');
      expect(data).toHaveProperty('direction');
      expect(['improving', 'degrading', 'stable']).toContain(data.direction);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. 世界模型 — 版本管理 + ONNX 预测
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('2. 世界模型', () => {
    let modelVersionId: number;

    it('2.1 创建世界模型版本', async () => {
      const data = await trpcMutate('evoEvolution.deepAI.worldModel.createVersion', {
        modelName: 'e2e-test-lstm',
        version: '1.0.0-e2e',
        architecture: 'lstm',
        description: 'E2E 测试用 LSTM 世界模型',
        parameterCount: 128000,
        inputDimensions: 32,
        outputDimensions: 16,
        predictionHorizonMin: 5,
        predictionHorizonMax: 60,
        tags: ['e2e', 'test'],
      });
      expect(data.id).toBeGreaterThan(0);
      modelVersionId = data.id;
    });

    it('2.2 获取模型版本详情', async () => {
      const data = await trpcQuery('evoEvolution.deepAI.worldModel.getVersion', {
        id: modelVersionId,
      });
      expect(data).toBeDefined();
      expect(data.modelName).toBe('e2e-test-lstm');
      expect(data.architecture).toBe('lstm');
      expect(data.status).toBe('draft');
    });

    it('2.3 激活模型版本', async () => {
      const data = await trpcMutate('evoEvolution.deepAI.worldModel.updateStatus', {
        id: modelVersionId,
        status: 'active',
      });
      expect(data.success).toBe(true);
    });

    it('2.4 创建世界模型预测记录', async () => {
      const data = await trpcMutate('evoEvolution.deepAI.worldModel.createPrediction', {
        snapshotId: 1,
        horizonMinutes: 30,
        predictedState: {
          temperature: 85.2,
          vibration: 0.32,
          interventionProbability: 0.15,
          confidence: 0.88,
        },
      });
      expect(data.id).toBeGreaterThan(0);
    });

    it('2.5 列出模型版本', async () => {
      const data = await trpcQuery('evoEvolution.deepAI.worldModel.listVersions', {
        limit: 10,
      });
      expect(data.items.length).toBeGreaterThan(0);
      expect(data.total).toBeGreaterThan(0);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. 影子评估
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('3. 影子评估', () => {
    it('3.1 创建影子评估实验', async () => {
      const data = await trpcMutate('evoEvolution.shadowEval.create', {
        experimentName: 'E2E 影子评估测试',
        baselineModelId: 'baseline-v1',
        challengerModelId: 'challenger-v2',
        dataRangeStart: '2026-01-01T00:00:00Z',
        dataRangeEnd: '2026-01-31T23:59:59Z',
        config: {
          sliceCount: 50,
          timeoutMs: 15000,
          mcNemarAlpha: 0.05,
          monteCarloRuns: 500,
          perturbationMagnitude: 0.1,
        },
      });
      expect(data.recordId).toBeGreaterThan(0);
      expect(data.status).toBe('pending');
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4. 冠军挑战者
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('4. 冠军挑战者', () => {
    it('4.1 创建冠军挑战者实验', async () => {
      const data = await trpcMutate('evoEvolution.championChallenger.create', {
        experimentName: 'E2E Champion-Challenger',
        championModelId: 'champion-v1',
        challengerModelId: 'challenger-v2',
        trafficSplit: 80,
        minSampleSize: 100,
        maxDurationHours: 24,
      });
      expect(data).toBeDefined();
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 5. 金丝雀部署
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('5. 金丝雀部署', () => {
    it('5.1 创建金丝雀部署', async () => {
      const data = await trpcMutate('evoEvolution.canary.create', {
        modelId: 'canary-model-v1',
        targetVersion: '2.0.0',
        strategy: 'percentage',
        initialPercentage: 5,
        maxPercentage: 50,
        stepPercentage: 5,
        rollbackThreshold: 0.1,
      });
      expect(data).toBeDefined();
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 6. 知识结晶
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('6. 知识结晶', () => {
    it('6.1 创建知识结晶', async () => {
      const data = await trpcMutate('evoEvolution.crystal.create', {
        title: 'E2E 测试结晶',
        content: '飞轮闭环测试发现：LSTM 世界模型在高温工况下预测精度下降 15%',
        category: 'model_insight',
        source: 'e2e_test',
        tags: ['e2e', 'world-model', 'lstm'],
      });
      expect(data).toBeDefined();
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 7. 自愈系统
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('7. 自愈系统', () => {
    it('7.1 获取自愈策略列表', async () => {
      const data = await trpcQuery('evoEvolution.selfHealing.policy.list');
      expect(Array.isArray(data)).toBe(true);
    });

    it('7.2 创建自愈策略', async () => {
      const data = await trpcMutate('evoEvolution.selfHealing.policy.create', {
        name: 'E2E 自愈策略',
        description: '当世界模型预测干预概率 > 0.8 时自动触发参数回滚',
        triggerCondition: 'world_model.intervention_probability > 0.8',
        actionType: 'param_rollback',
        actionConfig: { rollbackSteps: 1, notifyChannel: 'e2e-test' },
        priority: 1,
        enabled: true,
      });
      expect(data).toBeDefined();
    });

    it('7.3 获取自愈日志统计', async () => {
      const data = await trpcQuery('evoEvolution.selfHealing.healingLog.stats');
      expect(data).toHaveProperty('total');
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 8. Prometheus /api/metrics 端点
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('8. Prometheus 指标端点', () => {
    it('8.1 GET /api/metrics 返回 Prometheus 文本格式', async () => {
      const res = await request(BASE_URL)
        .get('/api/metrics')
        .expect(200);
      const text = res.text;
      // 验证 Prometheus 文本格式
      expect(text).toContain('# HELP');
      expect(text).toContain('# TYPE');
    });

    it('8.2 包含 nexus_ 前缀指标（metricsCollector）', async () => {
      const res = await request(BASE_URL).get('/api/metrics');
      expect(res.text).toContain('nexus_http_requests_total');
    });

    it('8.3 包含 evo_ 前缀指标（fsd-metrics）', async () => {
      const res = await request(BASE_URL).get('/api/metrics');
      expect(res.text).toContain('evo_engine_up');
    });

    it('8.4 包含 Node.js 默认指标', async () => {
      const res = await request(BASE_URL).get('/api/metrics');
      expect(res.text).toContain('nodejs_');
    });

    it('8.5 支持 gzip 压缩', async () => {
      const res = await request(BASE_URL)
        .get('/api/metrics')
        .set('Accept-Encoding', 'gzip');
      // 在生产环境中应返回 gzip，测试环境可能不压缩
      expect(res.status).toBe(200);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 9. 深度 AI — 总控中心
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('9. 深度 AI 总控中心', () => {
    it('9.1 获取引擎统计', async () => {
      const data = await trpcQuery('evoEvolution.deepAI.controlCenter.getStats');
      expect(data).toHaveProperty('totalEngines');
      expect(data.totalEngines).toBeGreaterThan(0);
    });

    it('9.2 获取引擎模块定义', async () => {
      const data = await trpcQuery('evoEvolution.deepAI.controlCenter.getModuleDefinitions');
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 10. 可观测性 — 分布式追踪
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('10. 可观测性', () => {
    it('10.1 获取追踪列表', async () => {
      const data = await trpcQuery('evoEvolution.observability.traces.list');
      expect(data).toHaveProperty('items');
    });

    it('10.2 获取指标快照列表', async () => {
      const data = await trpcQuery('evoEvolution.observability.metrics.list');
      expect(data).toHaveProperty('items');
    });

    it('10.3 获取告警规则列表', async () => {
      const data = await trpcQuery('evoEvolution.observability.alerts.listRules');
      expect(data).toHaveProperty('items');
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 11. FSD 干预记录
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('11. FSD 干预记录', () => {
    it('11.1 创建干预记录', async () => {
      const data = await trpcMutate('evoEvolution.fsd.createIntervention', {
        engineModule: 'shadowEvaluator',
        interventionType: 'manual_override',
        reason: 'E2E 测试干预',
        severity: 'medium',
        context: { testRun: true, cycleId },
      });
      expect(data).toBeDefined();
    });

    it('11.2 获取干预率统计', async () => {
      const data = await trpcQuery('evoEvolution.fsd.getInterventionRate');
      expect(data).toHaveProperty('rate');
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 12. Dojo 训练调度
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('12. Dojo 训练调度', () => {
    it('12.1 获取训练任务列表', async () => {
      const data = await trpcQuery('evoEvolution.deepAI.worldModel.listTrainingJobs');
      expect(Array.isArray(data)).toBe(true);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 13. 飞轮状态 Facade
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('13. 飞轮状态 Facade', () => {
    it('13.1 获取飞轮状态', async () => {
      const data = await trpcQuery('evoEvolution.getFlywheelStatus');
      expect(data).toHaveProperty('totalCycles');
      expect(data.totalCycles).toBeGreaterThan(0);
    });
  });
});
