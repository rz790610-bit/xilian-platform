/**
 * API 网关层单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Kong 网关', () => {
  describe('JWT 认证', () => {
    it('应该正确生成 JWT Token', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      const token = kong.generateJWT({
        userId: 'user-123',
        username: 'testuser',
        roles: ['operator'],
      });

      expect(token).toBeDefined();
      expect(token.split('.').length).toBe(3);

      await kong.close();
    });

    it('应该正确验证有效的 JWT Token', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      const token = kong.generateJWT({
        userId: 'user-123',
        username: 'testuser',
        roles: ['operator'],
      });

      const result = kong.verifyJWT(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.userId).toBe('user-123');
      expect(result.payload?.username).toBe('testuser');
      expect(result.payload?.roles).toContain('operator');

      await kong.close();
    });

    it('应该拒绝无效的 JWT Token', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      const result = kong.verifyJWT('invalid.token.here');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();

      await kong.close();
    });

    it('应该拒绝格式错误的 Token', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      const result = kong.verifyJWT('not-a-jwt');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');

      await kong.close();
    });
  });

  describe('RBAC 权限控制', () => {
    it('应该允许 admin 访问所有资源', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      expect(kong.checkPermission(['admin'], '/api/v1/devices', 'read')).toBe(true);
      expect(kong.checkPermission(['admin'], '/api/v1/devices', 'write')).toBe(true);
      expect(kong.checkPermission(['admin'], '/api/v1/devices', 'delete')).toBe(true);
      expect(kong.checkPermission(['admin'], '/api/v1/devices', 'admin')).toBe(true);

      await kong.close();
    });

    it('应该限制 viewer 只能读取', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      expect(kong.checkPermission(['viewer'], '/api/v1/devices/123', 'read')).toBe(true);
      expect(kong.checkPermission(['viewer'], '/api/v1/devices/123', 'write')).toBe(false);
      expect(kong.checkPermission(['viewer'], '/api/v1/devices/123', 'delete')).toBe(false);

      await kong.close();
    });

    it('应该允许 operator 读写设备', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      expect(kong.checkPermission(['operator'], '/api/v1/devices/123', 'read')).toBe(true);
      expect(kong.checkPermission(['operator'], '/api/v1/devices/123', 'write')).toBe(true);
      expect(kong.checkPermission(['operator'], '/api/v1/devices/123', 'admin')).toBe(false);

      await kong.close();
    });

    it('应该正确处理多角色', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      // viewer + operator 应该有两者的权限
      expect(kong.checkPermission(['viewer', 'operator'], '/api/v1/devices/123', 'read')).toBe(true);
      expect(kong.checkPermission(['viewer', 'operator'], '/api/v1/devices/123', 'write')).toBe(true);

      await kong.close();
    });
  });

  describe('限流', () => {
    it('应该允许在限制内的请求', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway({
        rateLimit: {
          defaultLimit: 10,
          vipLimit: 100,
          windowSizeMs: 1000,
        },
      });
      await kong.initialize();

      const result = await kong.checkRateLimit('test-user-1', false);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(10);

      await kong.close();
    });

    it('应该为 VIP 用户提供更高限制', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway({
        rateLimit: {
          defaultLimit: 10,
          vipLimit: 100,
          windowSizeMs: 1000,
        },
      });
      await kong.initialize();

      const result = await kong.checkRateLimit('vip-user-1', true);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(100);

      await kong.close();
    });
  });

  describe('路由匹配', () => {
    it('应该正确匹配 API 路由', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      const route = kong.matchRoute('/api/v1/devices', 'GET');

      expect(route).not.toBeNull();
      expect(route?.name).toBe('api-v1');

      await kong.close();
    });

    it('应该正确匹配 WebSocket 路由', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      const route = kong.matchRoute('/ws/connect', 'GET');

      expect(route).not.toBeNull();
      expect(route?.name).toBe('websocket');

      await kong.close();
    });

    it('应该返回 null 对于不存在的路由', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      const route = kong.matchRoute('/nonexistent', 'GET');

      expect(route).toBeNull();

      await kong.close();
    });
  });

  describe('请求处理', () => {
    it('应该处理有效的认证请求', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      const token = kong.generateJWT({
        userId: 'user-123',
        username: 'testuser',
        roles: ['admin'],
      });

      const result = await kong.handleRequest({
        path: '/api/v1/devices',
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
        clientIp: '192.168.1.1',
      });

      expect(result.allowed).toBe(true);
      expect(result.user?.userId).toBe('user-123');

      await kong.close();
    });

    it('应该拒绝缺少认证的请求', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      const result = await kong.handleRequest({
        path: '/api/v1/devices',
        method: 'GET',
        headers: {},
        clientIp: '192.168.1.1',
      });

      expect(result.allowed).toBe(false);
      expect(result.error).toContain('authorization');

      await kong.close();
    });

    it('应该允许健康检查路由无需认证', async () => {
      const { KongGateway } = await import('./kong/kongGateway');
      const kong = new KongGateway();
      await kong.initialize();

      const result = await kong.handleRequest({
        path: '/health',
        method: 'GET',
        headers: {},
        clientIp: '192.168.1.1',
      });

      expect(result.allowed).toBe(true);

      await kong.close();
    });
  });
});

describe('Istio 服务网格', () => {
  describe('mTLS 管理', () => {
    it('应该设置 mTLS 模式', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      const peerAuth = istio.setMTLSMode('default', 'STRICT');

      expect(peerAuth.mtls.mode).toBe('STRICT');

      await istio.close();
    });

    it('应该获取 mTLS 状态', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      const status = istio.getMTLSStatus('default');

      expect(status.mode).toBe('STRICT');
      expect(status.enabled).toBe(true);

      await istio.close();
    });
  });

  describe('Canary 发布', () => {
    it('应该创建 Canary 发布', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      const deployment = istio.createCanaryDeployment(
        'xilian-api',
        'default',
        'v1.0.0',
        'v1.1.0'
      );

      expect(deployment.name).toBe('xilian-api-canary');
      expect(deployment.status).toBe('pending');
      expect(deployment.currentStage).toBe(0);
      expect(deployment.stages[0].weight).toBe(10);

      await istio.close();
    });

    it('应该推进 Canary 阶段', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      istio.createCanaryDeployment('xilian-api', 'default', 'v1.0.0', 'v1.1.0');
      const advanced = istio.advanceCanaryStage('xilian-api-canary');

      expect(advanced?.currentStage).toBe(1);
      expect(advanced?.status).toBe('in_progress');

      await istio.close();
    });

    it('应该回滚 Canary 发布', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      istio.createCanaryDeployment('xilian-api', 'default', 'v1.0.0', 'v1.1.0');
      const rolledBack = istio.rollbackCanary('xilian-api-canary');

      expect(rolledBack?.status).toBe('rollback');
      expect(rolledBack?.currentStage).toBe(0);

      await istio.close();
    });

    it('应该完成 Canary 发布', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      istio.createCanaryDeployment('xilian-api', 'default', 'v1.0.0', 'v1.1.0');
      
      // 推进所有阶段
      istio.advanceCanaryStage('xilian-api-canary'); // 10% -> 50%
      istio.advanceCanaryStage('xilian-api-canary'); // 50% -> 100%
      const completed = istio.advanceCanaryStage('xilian-api-canary'); // 完成

      expect(completed?.status).toBe('completed');

      await istio.close();
    });
  });

  describe('分布式追踪', () => {
    it('应该创建追踪 Span', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      const span = istio.createSpan('GET /api/v1/devices', 'xilian-api');

      expect(span.traceId).toBeDefined();
      expect(span.spanId).toBeDefined();
      expect(span.operationName).toBe('GET /api/v1/devices');
      expect(span.serviceName).toBe('xilian-api');

      await istio.close();
    });

    it('应该完成追踪 Span', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh({ jaeger: { endpoint: '', samplingRate: 1.0 } });
      await istio.initialize();

      const span = istio.createSpan('GET /api/v1/devices', 'xilian-api');
      
      // 模拟一些延迟
      await new Promise(resolve => setTimeout(resolve, 10));
      
      istio.finishSpan(span, 'ok');

      expect(span.duration).toBeGreaterThan(0);
      expect(span.status).toBe('ok');

      await istio.close();
    });

    it('应该添加 Span 标签', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      const span = istio.createSpan('GET /api/v1/devices', 'xilian-api');
      istio.addSpanTag(span, 'http.status_code', '200');
      istio.addSpanTag(span, 'user.id', 'user-123');

      expect(span.tags['http.status_code']).toBe('200');
      expect(span.tags['user.id']).toBe('user-123');

      await istio.close();
    });

    it('应该查询追踪', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh({ jaeger: { endpoint: '', samplingRate: 1.0 } });
      await istio.initialize();

      // 创建一些追踪
      for (let i = 0; i < 5; i++) {
        const span = istio.createSpan(`operation-${i}`, 'xilian-api');
        istio.finishSpan(span, 'ok');
      }

      const traces = istio.queryTraces({ service: 'xilian-api', limit: 3 });

      expect(traces.length).toBeLessThanOrEqual(3);

      await istio.close();
    });
  });

  describe('混沌工程', () => {
    it('应该创建延迟实验', async () => {
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

      expect(experiment.name).toBe('delay-test');
      expect(experiment.type).toBe('delay');
      expect(experiment.status).toBe('pending');

      await istio.close();
    });

    it('应该创建故障注入实验', async () => {
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

    it('应该启动和停止实验', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      const experiment = istio.createChaosExperiment(
        'test-experiment',
        'xilian-api',
        'default',
        'delay',
        { percentage: 50, delay: '5s' },
        '10m'
      );

      const started = istio.startChaosExperiment(experiment.id);
      expect(started?.status).toBe('running');
      expect(started?.startTime).toBeDefined();

      const stopped = istio.stopChaosExperiment(experiment.id);
      expect(stopped?.status).toBe('completed');
      expect(stopped?.endTime).toBeDefined();

      await istio.close();
    });
  });

  describe('流量管理', () => {
    it('应该配置流量镜像', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      istio.configureMirroring('xilian-api', 'xilian-api-shadow', 50);

      const vs = istio.getVirtualService('xilian-api');
      expect(vs?.http[0].mirror?.host).toBe('xilian-api-shadow');
      expect(vs?.http[0].mirrorPercentage?.value).toBe(50);

      await istio.close();
    });

    it('应该移除流量镜像', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      istio.configureMirroring('xilian-api', 'xilian-api-shadow', 50);
      istio.removeMirroring('xilian-api');

      const vs = istio.getVirtualService('xilian-api');
      expect(vs?.http[0].mirror).toBeUndefined();

      await istio.close();
    });

    it('应该配置熔断器', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      istio.configureCircuitBreaker('xilian-api', {
        consecutiveErrors: 10,
        interval: '30s',
        baseEjectionTime: '60s',
        maxEjectionPercent: 30,
      });

      const dr = istio.getDestinationRule('xilian-api');
      expect(dr?.trafficPolicy?.outlierDetection?.consecutiveErrors).toBe(10);

      await istio.close();
    });

    it('应该配置重试策略', async () => {
      const { IstioMesh } = await import('./istio/istioMesh');
      const istio = new IstioMesh();
      await istio.initialize();

      istio.configureRetry('xilian-api', {
        attempts: 5,
        perTryTimeout: '5s',
        retryOn: 'connect-failure,refused-stream',
      });

      const vs = istio.getVirtualService('xilian-api');
      expect(vs?.http[0].retries?.attempts).toBe(5);

      await istio.close();
    });
  });
});

describe('GatewayManager 统一管理', () => {
  it('应该初始化所有网关组件', async () => {
    const { GatewayManager } = await import('./gatewayManager');
    const manager = new GatewayManager();
    await manager.initialize();

    const status = manager.getStatus();

    expect(status.initialized).toBe(true);
    expect(status.kong.initialized).toBe(true);
    expect(status.istio.initialized).toBe(true);

    await manager.close();
  });

  it('应该处理统一请求', async () => {
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

    expect(result.allowed).toBe(true);
    expect(result.kongResult?.user?.userId).toBe('user-123');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    await manager.close();
  });

  it('应该获取统一统计信息', async () => {
    const { GatewayManager } = await import('./gatewayManager');
    const manager = new GatewayManager();
    await manager.initialize();

    const stats = manager.getStats();

    expect(stats.kong).toBeDefined();
    expect(stats.istio).toBeDefined();
    expect(stats.combined).toBeDefined();

    await manager.close();
  });

  it('应该执行健康检查', async () => {
    const { GatewayManager } = await import('./gatewayManager');
    const manager = new GatewayManager();
    await manager.initialize();

    const health = await manager.healthCheck();

    expect(health.healthy).toBe(true);
    expect(health.kong).toBeDefined();
    expect(health.istio).toBeDefined();

    await manager.close();
  });

  it('应该管理 Canary 发布', async () => {
    const { GatewayManager } = await import('./gatewayManager');
    const manager = new GatewayManager();
    await manager.initialize();

    const deployment = manager.createCanaryDeployment(
      'xilian-api',
      'default',
      'v1.0.0',
      'v1.1.0'
    );

    expect(deployment.name).toBe('xilian-api-canary');

    const advanced = manager.advanceCanaryStage('xilian-api-canary');
    expect(advanced?.currentStage).toBe(1);

    const rolledBack = manager.rollbackCanary('xilian-api-canary');
    expect(rolledBack?.status).toBe('rollback');

    await manager.close();
  });

  it('应该管理混沌实验', async () => {
    const { GatewayManager } = await import('./gatewayManager');
    const manager = new GatewayManager();
    await manager.initialize();

    const experiment = manager.createChaosExperiment(
      'test-chaos',
      'xilian-api',
      'default',
      'delay',
      { percentage: 50, delay: '5s' },
      '10m'
    );

    expect(experiment.name).toBe('test-chaos');

    const started = manager.startChaosExperiment(experiment.id);
    expect(started?.status).toBe('running');

    const stopped = manager.stopChaosExperiment(experiment.id);
    expect(stopped?.status).toBe('completed');

    await manager.close();
  });
});
