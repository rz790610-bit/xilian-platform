/**
 * Falco 运行时安全服务单元测试
 * 西联智能平台 - 容器安全监控测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FalcoService,
  FalcoPriority,
  SecurityEventCategory,
  FalcoEvent,
  FalcoRule,
  AlertRoute
} from './falcoService';

describe('FalcoService', () => {
  let service: FalcoService;

  beforeEach(async () => {
    service = new FalcoService({
      retentionDays: 7,
      enableMetrics: true
    });
    await service.start();
  });

  afterEach(async () => {
    await service.stop();
  });

  // ============================================
  // 服务生命周期测试
  // ============================================

  describe('服务生命周期', () => {
    it('应该成功启动服务', async () => {
      const newService = new FalcoService();
      await newService.start();
      
      const health = await newService.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.status).toBe('connected');
      
      await newService.stop();
    });

    it('应该成功停止服务', async () => {
      const newService = new FalcoService();
      await newService.start();
      await newService.stop();
      
      const health = await newService.healthCheck();
      expect(health.healthy).toBe(false);
      expect(health.status).toBe('disconnected');
    });

    it('应该初始化默认规则', () => {
      const rules = service.getRules();
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some(r => r.name === '容器逃逸尝试')).toBe(true);
      expect(rules.some(r => r.name === '挖矿程序检测')).toBe(true);
    });

    it('应该初始化节点状态', () => {
      const nodes = service.getNodeStatuses();
      expect(nodes.length).toBe(5);
      expect(nodes.every(n => n.status === 'running')).toBe(true);
    });

    it('应该初始化告警路由', () => {
      const routes = service.getAlertRoutes();
      expect(routes.length).toBeGreaterThan(0);
      expect(routes.some(r => r.id === 'p0-critical')).toBe(true);
    });
  });

  // ============================================
  // 事件处理测试
  // ============================================

  describe('事件处理', () => {
    it('应该处理安全事件', async () => {
      const event: FalcoEvent = {
        uuid: 'test-uuid-1',
        time: new Date(),
        priority: FalcoPriority.WARNING,
        rule: '敏感配置文件访问',
        output: '敏感文件被访问 (user=root file=/etc/shadow container=test)',
        outputFields: {
          'user.name': 'root',
          'fd.name': '/etc/shadow',
          'container.name': 'test-container'
        },
        hostname: 'xilian-gpu-node-1',
        source: 'syscall',
        tags: ['security', 'file_access', 'xilian', 'P0']
      };

      await service.processEvent(event);
      
      // 显式刷新缓冲区
      await service.flushEventBuffer();
      
      const events = service.getEvents({ limit: 10 });
      expect(events.length).toBeGreaterThan(0);
    });

    it('应该正确分类安全事件', async () => {
      const events: FalcoEvent[] = [
        {
          uuid: 'test-1',
          time: new Date(),
          priority: FalcoPriority.CRITICAL,
          rule: '容器逃逸尝试',
          output: '容器逃逸尝试',
          outputFields: {},
          hostname: 'node-1',
          source: 'syscall',
          tags: ['container_escape']
        },
        {
          uuid: 'test-2',
          time: new Date(),
          priority: FalcoPriority.CRITICAL,
          rule: '挖矿程序检测',
          output: '挖矿程序检测',
          outputFields: {},
          hostname: 'node-1',
          source: 'syscall',
          tags: ['cryptomining']
        },
        {
          uuid: 'test-3',
          time: new Date(),
          priority: FalcoPriority.WARNING,
          rule: '异常外部网络连接',
          output: '异常外部连接',
          outputFields: {},
          hostname: 'node-1',
          source: 'syscall',
          tags: ['network']
        }
      ];

      for (const event of events) {
        await service.processEvent(event);
      }

      // 显式刷新缓冲区
      await service.flushEventBuffer();

      const processed = service.getEvents({ limit: 10 });
      expect(processed.some(e => e.category === SecurityEventCategory.CONTAINER_ESCAPE)).toBe(true);
      expect(processed.some(e => e.category === SecurityEventCategory.CRYPTOMINING)).toBe(true);
      expect(processed.some(e => e.category === SecurityEventCategory.NETWORK_ANOMALY)).toBe(true);
    });

    it('应该按优先级过滤事件', async () => {
      const events: FalcoEvent[] = [
        {
          uuid: 'critical-1',
          time: new Date(),
          priority: FalcoPriority.CRITICAL,
          rule: '关键事件',
          output: '关键事件',
          outputFields: {},
          hostname: 'node-1',
          source: 'syscall',
          tags: []
        },
        {
          uuid: 'warning-1',
          time: new Date(),
          priority: FalcoPriority.WARNING,
          rule: '警告事件',
          output: '警告事件',
          outputFields: {},
          hostname: 'node-1',
          source: 'syscall',
          tags: []
        }
      ];

      for (const event of events) {
        await service.processEvent(event);
      }

      const criticalOnly = service.getEvents({ priority: [FalcoPriority.CRITICAL] });
      expect(criticalOnly.every(e => e.priority === FalcoPriority.CRITICAL)).toBe(true);
    });

    it('应该按时间范围过滤事件', async () => {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const events: FalcoEvent[] = [
        {
          uuid: 'recent-1',
          time: now,
          priority: FalcoPriority.WARNING,
          rule: '最近事件',
          output: '最近事件',
          outputFields: {},
          hostname: 'node-1',
          source: 'syscall',
          tags: []
        },
        {
          uuid: 'old-1',
          time: twoHoursAgo,
          priority: FalcoPriority.WARNING,
          rule: '旧事件',
          output: '旧事件',
          outputFields: {},
          hostname: 'node-1',
          source: 'syscall',
          tags: []
        }
      ];

      for (const event of events) {
        await service.processEvent(event);
      }

      const recentEvents = service.getEvents({ startTime: hourAgo });
      expect(recentEvents.every(e => e.time >= hourAgo)).toBe(true);
    });
  });

  // ============================================
  // 规则管理测试
  // ============================================

  describe('规则管理', () => {
    it('应该获取所有规则', () => {
      const rules = service.getRules();
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
    });

    it('应该获取单个规则', () => {
      const rule = service.getRule('容器逃逸尝试');
      expect(rule).toBeDefined();
      expect(rule?.name).toBe('容器逃逸尝试');
      expect(rule?.priority).toBe(FalcoPriority.CRITICAL);
    });

    it('应该添加新规则', () => {
      const newRule: FalcoRule = {
        name: '测试规则',
        description: '测试规则描述',
        condition: 'test_condition',
        output: '测试输出',
        priority: FalcoPriority.WARNING,
        tags: ['test'],
        enabled: true
      };

      service.addRule(newRule);
      
      const rule = service.getRule('测试规则');
      expect(rule).toBeDefined();
      expect(rule?.name).toBe('测试规则');
    });

    it('应该更新规则', () => {
      const updated = service.updateRule('容器逃逸尝试', {
        description: '更新后的描述'
      });

      expect(updated).toBeDefined();
      expect(updated?.description).toBe('更新后的描述');
    });

    it('应该删除规则', () => {
      service.addRule({
        name: '待删除规则',
        description: '待删除',
        condition: 'test',
        output: 'test',
        priority: FalcoPriority.NOTICE,
        tags: [],
        enabled: true
      });

      const deleted = service.deleteRule('待删除规则');
      expect(deleted).toBe(true);
      
      const rule = service.getRule('待删除规则');
      expect(rule).toBeUndefined();
    });

    it('应该启用/禁用规则', () => {
      const result = service.toggleRule('容器逃逸尝试', false);
      expect(result).toBe(true);
      
      const rule = service.getRule('容器逃逸尝试');
      expect(rule?.enabled).toBe(false);
      
      service.toggleRule('容器逃逸尝试', true);
      expect(service.getRule('容器逃逸尝试')?.enabled).toBe(true);
    });
  });

  // ============================================
  // 告警路由测试
  // ============================================

  describe('告警路由', () => {
    it('应该获取所有告警路由', () => {
      const routes = service.getAlertRoutes();
      expect(Array.isArray(routes)).toBe(true);
      expect(routes.length).toBeGreaterThan(0);
    });

    it('应该添加告警路由', () => {
      const newRoute: AlertRoute = {
        id: 'test-route',
        name: '测试路由',
        match: {
          priorities: [FalcoPriority.ERROR]
        },
        receivers: [
          { type: 'webhook', config: { url: 'http://test' }, enabled: true }
        ]
      };

      service.addAlertRoute(newRoute);
      
      const routes = service.getAlertRoutes();
      expect(routes.some(r => r.id === 'test-route')).toBe(true);
    });

    it('应该更新告警路由', () => {
      const updated = service.updateAlertRoute('p0-critical', {
        name: '更新后的P0路由'
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('更新后的P0路由');
    });

    it('应该删除告警路由', () => {
      service.addAlertRoute({
        id: 'to-delete',
        name: '待删除路由',
        match: {},
        receivers: []
      });

      const deleted = service.deleteAlertRoute('to-delete');
      expect(deleted).toBe(true);
      
      const routes = service.getAlertRoutes();
      expect(routes.some(r => r.id === 'to-delete')).toBe(false);
    });

    it('应该根据优先级匹配路由', async () => {
      const alertSpy = vi.fn();
      service.on('alert', alertSpy);

      const criticalEvent: FalcoEvent = {
        uuid: 'critical-test',
        time: new Date(),
        priority: FalcoPriority.CRITICAL,
        rule: '关键安全事件',
        output: '关键安全事件',
        outputFields: {},
        hostname: 'node-1',
        source: 'syscall',
        tags: ['P0']
      };

      await service.processEvent(criticalEvent);
      
      // 等待事件处理
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(alertSpy).toHaveBeenCalled();
    });
  });

  // ============================================
  // 节点状态测试
  // ============================================

  describe('节点状态', () => {
    it('应该获取所有节点状态', () => {
      const nodes = service.getNodeStatuses();
      expect(nodes.length).toBe(5);
      expect(nodes.every(n => n.version === '0.37.0')).toBe(true);
    });

    it('应该获取单个节点状态', () => {
      const node = service.getNodeStatus('xilian-gpu-node-1');
      expect(node).toBeDefined();
      expect(node?.nodeName).toBe('xilian-gpu-node-1');
      expect(node?.status).toBe('running');
    });

    it('应该更新节点状态', () => {
      service.updateNodeStatus('xilian-gpu-node-1', {
        eventsProcessed: 99999
      });

      const node = service.getNodeStatus('xilian-gpu-node-1');
      expect(node?.eventsProcessed).toBe(99999);
    });

    it('应该在处理事件时更新节点统计', async () => {
      const node = service.getNodeStatus('xilian-gpu-node-1');
      const initialCount = node?.eventsProcessed || 0;

      const event: FalcoEvent = {
        uuid: 'node-test',
        time: new Date(),
        priority: FalcoPriority.WARNING,
        rule: '测试事件',
        output: '测试事件',
        outputFields: {},
        hostname: 'xilian-gpu-node-1',
        source: 'syscall',
        tags: []
      };

      await service.processEvent(event);

      const updatedNode = service.getNodeStatus('xilian-gpu-node-1');
      expect(updatedNode?.eventsProcessed).toBe(initialCount + 1);
    });
  });

  // ============================================
  // 安全态势分析测试
  // ============================================

  describe('安全态势分析', () => {
    beforeEach(async () => {
      // 添加测试事件
      const events: FalcoEvent[] = [
        {
          uuid: 'posture-1',
          time: new Date(),
          priority: FalcoPriority.CRITICAL,
          rule: '容器逃逸尝试',
          output: '容器逃逸',
          outputFields: {
            'container.name': 'container-a',
            'k8s.ns.name': 'namespace-a'
          },
          hostname: 'node-1',
          source: 'syscall',
          tags: ['container_escape']
        },
        {
          uuid: 'posture-2',
          time: new Date(),
          priority: FalcoPriority.WARNING,
          rule: '异常网络连接',
          output: '异常网络',
          outputFields: {
            'container.name': 'container-a',
            'k8s.ns.name': 'namespace-b'
          },
          hostname: 'node-1',
          source: 'syscall',
          tags: ['network']
        },
        {
          uuid: 'posture-3',
          time: new Date(),
          priority: FalcoPriority.WARNING,
          rule: '异常网络连接',
          output: '异常网络',
          outputFields: {
            'container.name': 'container-b',
            'k8s.ns.name': 'namespace-a'
          },
          hostname: 'node-1',
          source: 'syscall',
          tags: ['network']
        }
      ];

      for (const event of events) {
        await service.processEvent(event);
      }
    });

    it('应该计算安全态势', () => {
      const posture = service.getSecurityPosture(24);
      
      expect(posture.totalEvents).toBeGreaterThan(0);
      expect(posture.timeRange.start).toBeInstanceOf(Date);
      expect(posture.timeRange.end).toBeInstanceOf(Date);
      expect(['improving', 'stable', 'degrading']).toContain(posture.trend);
    });

    it('应该统计事件优先级分布', () => {
      const posture = service.getSecurityPosture(24);
      
      expect(posture.eventsByPriority).toBeDefined();
      expect(typeof posture.eventsByPriority[FalcoPriority.CRITICAL]).toBe('number');
      expect(typeof posture.eventsByPriority[FalcoPriority.WARNING]).toBe('number');
    });

    it('应该统计事件分类分布', () => {
      const posture = service.getSecurityPosture(24);
      
      expect(posture.eventsByCategory).toBeDefined();
    });

    it('应该返回 Top 规则', () => {
      const posture = service.getSecurityPosture(24);
      
      expect(Array.isArray(posture.topRules)).toBe(true);
      if (posture.topRules.length > 0) {
        expect(posture.topRules[0]).toHaveProperty('rule');
        expect(posture.topRules[0]).toHaveProperty('count');
      }
    });

    it('应该返回 Top 容器', () => {
      const posture = service.getSecurityPosture(24);
      
      expect(Array.isArray(posture.topContainers)).toBe(true);
    });

    it('应该返回 Top 命名空间', () => {
      const posture = service.getSecurityPosture(24);
      
      expect(Array.isArray(posture.topNamespaces)).toBe(true);
    });
  });

  // ============================================
  // 事件统计测试
  // ============================================

  describe('事件统计', () => {
    beforeEach(async () => {
      const events: FalcoEvent[] = [];
      const now = new Date();
      
      for (let i = 0; i < 10; i++) {
        events.push({
          uuid: `stats-${i}`,
          time: new Date(now.getTime() - i * 60 * 60 * 1000),
          priority: i % 2 === 0 ? FalcoPriority.WARNING : FalcoPriority.ERROR,
          rule: `规则${i % 3}`,
          output: `事件${i}`,
          outputFields: {},
          hostname: 'node-1',
          source: 'syscall',
          tags: []
        });
      }

      for (const event of events) {
        await service.processEvent(event);
      }
      // 显式刷新缓冲区
      await service.flushEventBuffer();
    });

    it('应该返回事件统计', () => {
      const stats = service.getEventStats();
      
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.byPriority).toBeDefined();
      expect(stats.byCategory).toBeDefined();
      expect(Array.isArray(stats.byHour)).toBe(true);
    });

    it('应该按时间范围统计事件', () => {
      const now = new Date();
      const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);
      
      const stats = service.getEventStats({
        start: fiveHoursAgo,
        end: now
      });
      
      expect(stats.total).toBeLessThanOrEqual(10);
    });
  });

  // ============================================
  // 健康检查测试
  // ============================================

  describe('健康检查', () => {
    it('应该返回健康状态', async () => {
      const health = await service.healthCheck();
      
      expect(health.healthy).toBe(true);
      expect(health.status).toBe('connected');
      expect(health.nodes).toBe(5);
      expect(health.activeNodes).toBe(5);
      expect(health.rulesLoaded).toBeGreaterThan(0);
    });

    it('应该返回服务统计', () => {
      const stats = service.getStats();
      
      expect(stats.connected).toBe(true);
      expect(typeof stats.totalEvents).toBe('number');
      expect(typeof stats.totalRules).toBe('number');
      expect(typeof stats.enabledRules).toBe('number');
      expect(typeof stats.totalNodes).toBe('number');
      expect(typeof stats.activeNodes).toBe('number');
      expect(typeof stats.alertRoutes).toBe('number');
    });
  });

  // ============================================
  // 事件发射测试
  // ============================================

  describe('事件发射', () => {
    it('应该在处理事件时发射 event 事件', async () => {
      const eventSpy = vi.fn();
      service.on('event', eventSpy);

      const event: FalcoEvent = {
        uuid: 'emit-test',
        time: new Date(),
        priority: FalcoPriority.WARNING,
        rule: '测试规则',
        output: '测试输出',
        outputFields: {},
        hostname: 'node-1',
        source: 'syscall',
        tags: []
      };

      await service.processEvent(event);
      
      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该在添加规则时发射 ruleAdded 事件', () => {
      const ruleSpy = vi.fn();
      service.on('ruleAdded', ruleSpy);

      service.addRule({
        name: '新规则',
        description: '新规则',
        condition: 'test',
        output: 'test',
        priority: FalcoPriority.NOTICE,
        tags: [],
        enabled: true
      });

      expect(ruleSpy).toHaveBeenCalled();
    });

    it('应该在更新规则时发射 ruleUpdated 事件', () => {
      const ruleSpy = vi.fn();
      service.on('ruleUpdated', ruleSpy);

      service.updateRule('容器逃逸尝试', { description: '更新' });

      expect(ruleSpy).toHaveBeenCalled();
    });
  });

  // ============================================
  // 边界条件测试
  // ============================================

  describe('边界条件', () => {
    it('应该处理空事件列表', () => {
      const newService = new FalcoService();
      const events = newService.getEvents();
      expect(events).toEqual([]);
    });

    it('应该处理不存在的规则', () => {
      const rule = service.getRule('不存在的规则');
      expect(rule).toBeUndefined();
    });

    it('应该处理不存在的节点', () => {
      const node = service.getNodeStatus('不存在的节点');
      expect(node).toBeUndefined();
    });

    it('应该处理删除不存在的规则', () => {
      const deleted = service.deleteRule('不存在的规则');
      expect(deleted).toBe(false);
    });

    it('应该处理更新不存在的规则', () => {
      const updated = service.updateRule('不存在的规则', { description: 'test' });
      expect(updated).toBeUndefined();
    });

    it('应该处理分页参数', async () => {
      // 添加多个事件（使用 CRITICAL 级别以立即刷新）
      for (let i = 0; i < 20; i++) {
        await service.processEvent({
          uuid: `page-${i}`,
          time: new Date(),
          priority: FalcoPriority.CRITICAL,
          rule: `规则${i}`,
          output: `事件${i}`,
          outputFields: {},
          hostname: 'node-1',
          source: 'syscall',
          tags: []
        });
      }

      // 等待缓冲区刷新
      await new Promise(resolve => setTimeout(resolve, 200));

      const page1 = service.getEvents({ limit: 5, offset: 0 });
      const page2 = service.getEvents({ limit: 5, offset: 5 });
      
      expect(page1.length).toBe(5);
      expect(page2.length).toBe(5);
      expect(page1[0].uuid).not.toBe(page2[0].uuid);
    });
  });
});

// ============================================
// 集成测试
// ============================================

describe('Falco 集成测试', () => {
  let service: FalcoService;

  beforeEach(async () => {
    service = new FalcoService();
    await service.start();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('应该完整处理安全事件流程', async () => {
    // 1. 添加自定义规则
    service.addRule({
      name: '自定义测试规则',
      description: '测试规则',
      condition: 'test',
      output: 'test',
      priority: FalcoPriority.WARNING,
      tags: ['test', 'P2'],
      enabled: true
    });

    // 2. 添加告警路由
    service.addAlertRoute({
      id: 'test-integration',
      name: '集成测试路由',
      match: {
        tags: ['test']
      },
      receivers: [
        { type: 'webhook', config: { url: 'http://test' }, enabled: true }
      ]
    });

    // 3. 处理事件
    const event: FalcoEvent = {
      uuid: 'integration-test',
      time: new Date(),
      priority: FalcoPriority.WARNING,
      rule: '自定义测试规则',
      output: '测试输出',
      outputFields: {
        'container.name': 'test-container',
        'k8s.ns.name': 'test-namespace'
      },
      hostname: 'xilian-gpu-node-1',
      source: 'syscall',
      tags: ['test', 'P2']
    };

    await service.processEvent(event);

    // 显式刷新缓冲区
    await service.flushEventBuffer();

    // 4. 验证事件被记录
    const events = service.getEvents({ rule: '自定义测试规则' });
    expect(events.length).toBeGreaterThan(0);

    // 5. 验证安全态势
    const posture = service.getSecurityPosture(1);
    expect(posture.totalEvents).toBeGreaterThan(0);

    // 6. 验证健康状态
    const health = await service.healthCheck();
    expect(health.healthy).toBe(true);
  });

  it('应该处理高并发事件', async () => {
    const eventCount = 100;
    const promises: Promise<void>[] = [];

    for (let i = 0; i < eventCount; i++) {
      promises.push(service.processEvent({
        uuid: `concurrent-${i}`,
        time: new Date(),
        priority: FalcoPriority.WARNING,
        rule: `并发规则${i % 5}`,
        output: `并发事件${i}`,
        outputFields: {},
        hostname: `xilian-cpu-node-${(i % 3) + 1}`,
        source: 'syscall',
        tags: []
      }));
    }

    await Promise.all(promises);

    // 显式刷新缓冲区
    await service.flushEventBuffer();

    const events = service.getEvents({ limit: 200 });
    expect(events.length).toBe(eventCount);
  });
});
