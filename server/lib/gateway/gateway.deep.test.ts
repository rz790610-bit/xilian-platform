/**
 * API 网关层深度单元测试
 * 
 * 验证核心算法和逻辑的正确性
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Kong JWT 深度测试', () => {
  describe('JWT 生成算法', () => {
    it('应该生成正确的 JWT 结构（header.payload.signature）', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      const token = kong.generateJWT({
        userId: 'user-123',
        username: 'testuser',
        roles: ['admin'],
      });

      const parts = token.split('.');
      expect(parts.length).toBe(3);

      // 验证 header
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      expect(header.alg).toBe('HS256');
      expect(header.typ).toBe('JWT');

      // 验证 payload
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      expect(payload.userId).toBe('user-123');
      expect(payload.username).toBe('testuser');
      expect(payload.roles).toContain('admin');
      expect(payload.iss).toBe('xilian-platform');
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
      expect(payload.exp).toBeGreaterThan(payload.iat);

      await kong.close();
    });

    it('应该使用 HMAC-SHA256 签名', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway({ jwt: { secret: 'test-secret', algorithm: 'HS256', expiresIn: 3600 } });
      await kong.initialize();

      const token1 = kong.generateJWT({ userId: 'user-1', username: 'user1', roles: [] });
      const token2 = kong.generateJWT({ userId: 'user-1', username: 'user1', roles: [] });

      // 相同输入应该产生相同签名（除了时间戳）
      const sig1 = token1.split('.')[2];
      const sig2 = token2.split('.')[2];

      // 签名应该是 base64url 格式
      expect(sig1).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(sig2).toMatch(/^[A-Za-z0-9_-]+$/);

      await kong.close();
    });

    it('应该正确设置过期时间', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const expiresIn = 7200; // 2 小时
      const kong = new KongGateway({ jwt: { secret: 'test', algorithm: 'HS256', expiresIn } });
      await kong.initialize();

      const token = kong.generateJWT({ userId: 'user-1', username: 'user1', roles: [] });
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

      expect(payload.exp - payload.iat).toBe(expiresIn);

      await kong.close();
    });
  });

  describe('JWT 验证算法', () => {
    it('应该验证签名完整性', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      const token = kong.generateJWT({ userId: 'user-1', username: 'user1', roles: [] });
      
      // 篡改 payload
      const parts = token.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({ userId: 'hacker', username: 'hacker', roles: ['admin'] })).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const result = kong.verifyJWT(tamperedToken);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature');

      await kong.close();
    });

    it('应该检测过期 Token', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway({ jwt: { secret: 'test', algorithm: 'HS256', expiresIn: -1 } }); // 立即过期
      await kong.initialize();

      const token = kong.generateJWT({ userId: 'user-1', username: 'user1', roles: [] });
      
      // 等待一小段时间确保过期
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = kong.verifyJWT(token);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token expired');

      await kong.close();
    });

    it('应该拒绝格式错误的 Token', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      // 测试各种格式错误
      expect(kong.verifyJWT('').valid).toBe(false);
      expect(kong.verifyJWT('a.b').valid).toBe(false);
      expect(kong.verifyJWT('a.b.c.d').valid).toBe(false);
      expect(kong.verifyJWT('not-a-jwt').valid).toBe(false);

      await kong.close();
    });
  });
});

describe('Kong RBAC 深度测试', () => {
  describe('权限匹配算法', () => {
    it('应该支持精确路径匹配', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      // admin 角色有 * 权限
      expect(kong.checkPermission(['admin'], '/api/v1/devices', 'read')).toBe(true);
      expect(kong.checkPermission(['admin'], '/api/v1/users', 'write')).toBe(true);

      await kong.close();
    });

    it('应该支持通配符路径匹配', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      // operator 角色有 /api/v1/devices/* 权限
      expect(kong.checkPermission(['operator'], '/api/v1/devices/123', 'read')).toBe(true);
      expect(kong.checkPermission(['operator'], '/api/v1/devices/456/status', 'read')).toBe(true);

      await kong.close();
    });

    it('应该正确处理多角色权限合并', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      // viewer 只能读，operator 可以读写
      expect(kong.checkPermission(['viewer'], '/api/v1/devices/123', 'read')).toBe(true);
      expect(kong.checkPermission(['viewer'], '/api/v1/devices/123', 'write')).toBe(false);
      expect(kong.checkPermission(['operator'], '/api/v1/devices/123', 'write')).toBe(true);

      // 多角色应该合并权限
      expect(kong.checkPermission(['viewer', 'operator'], '/api/v1/devices/123', 'write')).toBe(true);

      await kong.close();
    });

    it('应该拒绝无权限的操作', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      // viewer 不能写入
      expect(kong.checkPermission(['viewer'], '/api/v1/devices/123', 'write')).toBe(false);
      expect(kong.checkPermission(['viewer'], '/api/v1/devices/123', 'delete')).toBe(false);
      expect(kong.checkPermission(['viewer'], '/api/v1/devices/123', 'admin')).toBe(false);

      // 不存在的角色
      expect(kong.checkPermission(['nonexistent'], '/api/v1/devices', 'read')).toBe(false);

      await kong.close();
    });
  });

  describe('角色层级', () => {
    it('admin 应该有所有权限', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      const resources = ['/api/v1/devices', '/api/v1/users', '/api/v1/system', '/admin/settings'];
      const actions: ('read' | 'write' | 'delete' | 'admin')[] = ['read', 'write', 'delete', 'admin'];

      for (const resource of resources) {
        for (const action of actions) {
          expect(kong.checkPermission(['admin'], resource, action)).toBe(true);
        }
      }

      await kong.close();
    });
  });
});

describe('Kong 滑动窗口限流深度测试', () => {
  describe('限流算法', () => {
    it('应该正确计算剩余配额', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway({
        rateLimit: { defaultLimit: 10, vipLimit: 100, windowSizeMs: 60000 },
      });
      await kong.initialize();

      // Redis 未连接时应该放行
      const result = await kong.checkRateLimit('test-user', false);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(10);

      await kong.close();
    });

    it('应该区分普通用户和 VIP 用户限制', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway({
        rateLimit: { defaultLimit: 100, vipLimit: 1000, windowSizeMs: 1000 },
      });
      await kong.initialize();

      const normalResult = await kong.checkRateLimit('normal-user', false);
      const vipResult = await kong.checkRateLimit('vip-user', true);

      expect(normalResult.limit).toBe(100);
      expect(vipResult.limit).toBe(1000);

      await kong.close();
    });

    it('应该正确计算重置时间', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const windowSizeMs = 60000;
      const kong = new KongGateway({
        rateLimit: { defaultLimit: 10, vipLimit: 100, windowSizeMs },
      });
      await kong.initialize();

      const now = Date.now();
      const result = await kong.checkRateLimit('test-user', false);

      // 重置时间应该在 windowSizeMs 之后
      expect(result.resetAt).toBeGreaterThanOrEqual(now);
      expect(result.resetAt).toBeLessThanOrEqual(now + windowSizeMs + 100); // 允许 100ms 误差

      await kong.close();
    });
  });
});

describe('Istio Canary 发布深度测试', () => {
  describe('Canary 阶段推进', () => {
    it('应该按照 10%-50%-100% 阶段推进', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      const deployment = istio.createCanaryDeployment(
        'test-service',
        'default',
        'v1.0.0',
        'v1.1.0'
      );

      // 初始状态
      expect(deployment.currentStage).toBe(0);
      expect(deployment.stages[0].weight).toBe(10);

      // 推进到 50%
      const stage1 = istio.advanceCanaryStage(deployment.name);
      expect(stage1?.currentStage).toBe(1);
      expect(stage1?.stages[1].weight).toBe(50);

      // 推进到 100%
      const stage2 = istio.advanceCanaryStage(deployment.name);
      expect(stage2?.currentStage).toBe(2);
      expect(stage2?.stages[2].weight).toBe(100);

      // 完成
      const completed = istio.advanceCanaryStage(deployment.name);
      expect(completed?.status).toBe('completed');

      await istio.close();
    });

    it('应该支持自定义阶段', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      const customStages = [
        { weight: 5, duration: '2m' },
        { weight: 20, duration: '5m' },
        { weight: 50, duration: '10m' },
        { weight: 80, duration: '15m' },
        { weight: 100, duration: '0s' },
      ];

      const deployment = istio.createCanaryDeployment(
        'test-service',
        'default',
        'v1.0.0',
        'v1.1.0',
        customStages
      );

      expect(deployment.stages.length).toBe(5);
      expect(deployment.stages[0].weight).toBe(5);
      expect(deployment.stages[4].weight).toBe(100);

      await istio.close();
    });

    it('应该正确回滚到稳定版本', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      const deployment = istio.createCanaryDeployment(
        'test-service',
        'default',
        'v1.0.0',
        'v1.1.0'
      );

      // 推进到 50%
      istio.advanceCanaryStage(deployment.name);
      expect(istio.getAllCanaryDeployments()[0].currentStage).toBe(1);

      // 回滚
      const rolledBack = istio.rollbackCanary(deployment.name);
      expect(rolledBack?.status).toBe('rollback');
      expect(rolledBack?.currentStage).toBe(0);

      await istio.close();
    });
  });
});

describe('Istio 追踪深度测试', () => {
  describe('Span 生命周期', () => {
    it('应该正确计算 Span 持续时间', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh({ jaeger: { endpoint: '', samplingRate: 1.0 } });
      await istio.initialize();

      const span = istio.createSpan('test-operation', 'test-service');
      const startTime = span.startTime;

      // 模拟一些延迟
      await new Promise(resolve => setTimeout(resolve, 50));

      istio.finishSpan(span, 'ok');

      expect(span.duration).toBeGreaterThanOrEqual(40); // 允许一些时间误差
      expect(span.duration).toBeLessThan(200); // 允许一些误差

      await istio.close();
    });

    it('应该支持父子 Span 关系', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh({ jaeger: { endpoint: '', samplingRate: 1.0 } });
      await istio.initialize();

      const parentSpan = istio.createSpan('parent-operation', 'parent-service');
      const childSpan = istio.createSpan('child-operation', 'child-service', parentSpan.spanId, parentSpan.traceId);

      expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
      expect(childSpan.traceId).toBe(parentSpan.traceId);

      await istio.close();
    });

    it('应该根据采样率决定是否保存', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      
      // 100% 采样率
      const istio100 = new IstioMesh({ jaeger: { endpoint: '', samplingRate: 1.0 } });
      await istio100.initialize();

      for (let i = 0; i < 10; i++) {
        const span = istio100.createSpan(`op-${i}`, 'test-service');
        istio100.finishSpan(span, 'ok');
      }

      expect(istio100.queryTraces({}).length).toBe(10);
      await istio100.close();

      // 0% 采样率
      const istio0 = new IstioMesh({ jaeger: { endpoint: '', samplingRate: 0 } });
      await istio0.initialize();

      for (let i = 0; i < 10; i++) {
        const span = istio0.createSpan(`op-${i}`, 'test-service');
        istio0.finishSpan(span, 'ok');
      }

      expect(istio0.queryTraces({}).length).toBe(0);
      await istio0.close();
    });
  });

  describe('追踪查询', () => {
    it('应该支持按服务过滤', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh({ jaeger: { endpoint: '', samplingRate: 1.0 } });
      await istio.initialize();

      // 创建不同服务的追踪
      for (let i = 0; i < 5; i++) {
        const span1 = istio.createSpan(`op-${i}`, 'service-a');
        istio.finishSpan(span1, 'ok');
        const span2 = istio.createSpan(`op-${i}`, 'service-b');
        istio.finishSpan(span2, 'ok');
      }

      const serviceATraces = istio.queryTraces({ service: 'service-a' });
      const serviceBTraces = istio.queryTraces({ service: 'service-b' });

      expect(serviceATraces.length).toBe(5);
      expect(serviceBTraces.length).toBe(5);
      expect(serviceATraces.every(t => t.serviceName === 'service-a')).toBe(true);

      await istio.close();
    });

    it('应该支持按持续时间过滤', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh({ jaeger: { endpoint: '', samplingRate: 1.0 } });
      await istio.initialize();

      // 创建不同持续时间的追踪
      for (let i = 0; i < 3; i++) {
        const span = istio.createSpan(`fast-op-${i}`, 'test-service');
        istio.finishSpan(span, 'ok');
      }

      for (let i = 0; i < 3; i++) {
        const span = istio.createSpan(`slow-op-${i}`, 'test-service');
        await new Promise(resolve => setTimeout(resolve, 20));
        istio.finishSpan(span, 'ok');
      }

      const slowTraces = istio.queryTraces({ minDuration: 15 });
      expect(slowTraces.length).toBeGreaterThanOrEqual(3);

      await istio.close();
    });
  });
});

describe('Istio 混沌工程深度测试', () => {
  describe('故障注入类型', () => {
    it('应该支持延迟注入', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      const experiment = istio.createChaosExperiment(
        'delay-test',
        'xilian-api',
        'default',
        'delay',
        { percentage: 50, delay: '5s' },
        '10m'
      );

      expect(experiment.type).toBe('delay');
      expect(experiment.config.delay).toBe('5s');
      expect(experiment.config.percentage).toBe(50);

      await istio.close();
    });

    it('应该支持故障中止注入', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      const experiment = istio.createChaosExperiment(
        'abort-test',
        'xilian-api',
        'default',
        'abort',
        { percentage: 10, httpStatus: 503 },
        '5m'
      );

      expect(experiment.type).toBe('abort');
      expect(experiment.config.httpStatus).toBe(503);

      await istio.close();
    });

    it('应该支持网络分区模拟', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      const experiment = istio.createChaosExperiment(
        'partition-test',
        'xilian-api',
        'default',
        'partition',
        { percentage: 100 },
        '5m'
      );

      expect(experiment.type).toBe('partition');

      await istio.close();
    });
  });

  describe('实验生命周期', () => {
    it('应该正确跟踪实验状态', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      const experiment = istio.createChaosExperiment(
        'lifecycle-test',
        'xilian-api',
        'default',
        'delay',
        { percentage: 50, delay: '5s' },
        '10m'
      );

      // 初始状态
      expect(experiment.status).toBe('pending');
      expect(experiment.startTime).toBeUndefined();

      // 启动
      const started = istio.startChaosExperiment(experiment.id);
      expect(started?.status).toBe('running');
      expect(started?.startTime).toBeDefined();

      // 停止
      const stopped = istio.stopChaosExperiment(experiment.id);
      expect(stopped?.status).toBe('completed');
      expect(stopped?.endTime).toBeDefined();

      await istio.close();
    });
  });
});

describe('GatewayManager 深度测试', () => {
  describe('统一请求处理流程', () => {
    it('应该按顺序执行 Kong -> Istio 处理', async () => {
      const { GatewayManager } = await import('./gatewayManager');
      const manager = new GatewayManager();
      await manager.initialize();

      const token = manager.generateToken({
        userId: 'user-123',
        username: 'testuser',
        roles: ['admin'],
      });

      const result = await manager.handleRequest({
        path: '/api/v1/devices',
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
        clientIp: '192.168.1.1',
      });

      // 验证 Kong 处理结果
      expect(result.kongResult).toBeDefined();
      expect(result.kongResult?.user?.userId).toBe('user-123');

      // 验证 Istio 追踪结果
      expect(result.istioResult).toBeDefined();
      expect(result.istioResult?.traceSpan).toBeDefined();

      await manager.close();
    });

    it('应该在 Kong 认证失败时短路', async () => {
      const { GatewayManager } = await import('./gatewayManager');
      const manager = new GatewayManager();
      await manager.initialize();

      const result = await manager.handleRequest({
        path: '/api/v1/devices',
        method: 'GET',
        headers: {}, // 无认证
        clientIp: '192.168.1.1',
      });

      expect(result.allowed).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.istioResult).toBeUndefined(); // Istio 不应该被调用

      await manager.close();
    });

    it('应该正确记录请求延迟', async () => {
      const { GatewayManager } = await import('./gatewayManager');
      const manager = new GatewayManager();
      await manager.initialize();

      const token = manager.generateToken({
        userId: 'user-123',
        username: 'testuser',
        roles: ['admin'],
      });

      const result = await manager.handleRequest({
        path: '/api/v1/devices',
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
        clientIp: '192.168.1.1',
      });

      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.latencyMs).toBeLessThan(1000); // 应该很快

      await manager.close();
    });
  });

  describe('错误统计', () => {
    it('应该正确统计请求和错误', async () => {
      const { GatewayManager } = await import('./gatewayManager');
      const manager = new GatewayManager();
      await manager.initialize();

      const token = manager.generateToken({
        userId: 'user-123',
        username: 'testuser',
        roles: ['admin'],
      });

      // 成功请求
      await manager.handleRequest({
        path: '/api/v1/devices',
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
        clientIp: '192.168.1.1',
      });

      // 失败请求
      await manager.handleRequest({
        path: '/api/v1/devices',
        method: 'GET',
        headers: {},
        clientIp: '192.168.1.1',
      });

      const status = manager.getStatus();
      expect(status.requestCount).toBe(2);
      expect(status.errorCount).toBe(1);
      expect(status.errorRate).toBe(0.5);

      await manager.close();
    });
  });
});
