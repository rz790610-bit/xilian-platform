/**
 * 运维模块单元测试
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DashboardService } from './dashboard/dashboardService';
import {
  AutoScalingService,
  SelfHealingService,
  BackupRecoveryService,
  RollbackService,
} from './automation/automationService';
import {
  EdgeInferenceService,
  EdgeGatewayService,
  TSNService,
} from './edge/edgeComputingService';

// ==================== 仪表盘服务测试 ====================

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(() => {
    service = new DashboardService();
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('getClusterOverview', () => {
    it('should return cluster overview data', async () => {
      const data = await service.getClusterOverview();

      expect(data).toBeDefined();
      expect(data.summary).toBeDefined();
      expect(data.summary.totalNodes).toBeGreaterThan(0);
      expect(data.summary.totalPods).toBeGreaterThan(0);
      expect(data.resources).toBeDefined();
      expect(data.resources.cpu.percent).toBeGreaterThanOrEqual(0);
      expect(data.resources.cpu.percent).toBeLessThanOrEqual(100);
    });

    it('should include node information', async () => {
      const data = await service.getClusterOverview();

      expect(data.nodes).toBeInstanceOf(Array);
      expect(data.nodes.length).toBeGreaterThan(0);
      expect(data.nodes[0].name).toBeDefined();
      expect(data.nodes[0].status).toBeDefined();
      expect(data.nodes[0].cpu).toBeDefined();
    });

    it('should include alert summary', async () => {
      const data = await service.getClusterOverview();

      expect(data.alerts).toBeDefined();
      expect(typeof data.alerts.critical).toBe('number');
      expect(typeof data.alerts.warning).toBe('number');
      expect(typeof data.alerts.total).toBe('number');
    });

    it('should cache results', async () => {
      const data1 = await service.getClusterOverview();
      const data2 = await service.getClusterOverview();

      // 由于缓存，两次调用应该返回相同的数据
      expect(data1.summary.totalNodes).toBe(data2.summary.totalNodes);
    });
  });

  describe('getStorageOverview', () => {
    it('should return storage overview data', async () => {
      const data = await service.getStorageOverview();

      expect(data).toBeDefined();
      expect(data.databases).toBeDefined();
      expect(data.databases.clickhouse).toBeDefined();
      expect(data.databases.postgresql).toBeDefined();
      expect(data.databases.neo4j).toBeDefined();
      expect(data.databases.qdrant).toBeDefined();
      expect(data.databases.redis).toBeDefined();
      expect(data.databases.minio).toBeDefined();
    });

    it('should include database metrics', async () => {
      const data = await service.getStorageOverview();

      expect(data.databases.clickhouse.metrics.queriesPerSecond).toBeDefined();
      expect(data.databases.postgresql.metrics.transactionsPerSecond).toBeDefined();
      expect(data.databases.redis.metrics.opsPerSecond).toBeDefined();
    });
  });

  describe('getDataFlowOverview', () => {
    it('should return data flow overview', async () => {
      const data = await service.getDataFlowOverview();

      expect(data).toBeDefined();
      expect(data.kafka).toBeDefined();
      expect(data.flink).toBeDefined();
      expect(data.airflow).toBeDefined();
      expect(data.connectors).toBeDefined();
    });

    it('should include Kafka topics', async () => {
      const data = await service.getDataFlowOverview();

      expect(data.kafka.topics).toBeInstanceOf(Array);
      expect(data.kafka.topics.length).toBeGreaterThan(0);
      expect(data.kafka.topics[0].name).toBeDefined();
      expect(data.kafka.topics[0].partitions).toBeGreaterThan(0);
    });

    it('should include Flink jobs', async () => {
      const data = await service.getDataFlowOverview();

      expect(data.flink.jobs).toBeInstanceOf(Array);
      expect(data.flink.jobs.length).toBeGreaterThan(0);
      expect(data.flink.jobs[0].name).toBeDefined();
      expect(data.flink.jobs[0].status).toBeDefined();
    });
  });

  describe('getApiGatewayOverview', () => {
    it('should return API gateway overview', async () => {
      const data = await service.getApiGatewayOverview();

      expect(data).toBeDefined();
      expect(data.kong).toBeDefined();
      expect(data.istio).toBeDefined();
      expect(data.rateLimit).toBeDefined();
    });

    it('should include Kong routes', async () => {
      const data = await service.getApiGatewayOverview();

      expect(data.kong.routes).toBeInstanceOf(Array);
      expect(data.kong.routes.length).toBeGreaterThan(0);
      expect(data.kong.routes[0].name).toBeDefined();
      expect(data.kong.routes[0].requestsPerSecond).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getSecurityPosture', () => {
    it('should return security posture data', async () => {
      const data = await service.getSecurityPosture();

      expect(data).toBeDefined();
      expect(data.overview).toBeDefined();
      expect(data.overview.score).toBeGreaterThanOrEqual(0);
      expect(data.overview.score).toBeLessThanOrEqual(100);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(data.overview.grade);
    });

    it('should include vulnerability summary', async () => {
      const data = await service.getSecurityPosture();

      expect(data.vulnerabilities).toBeDefined();
      expect(data.vulnerabilities.summary).toBeDefined();
      expect(typeof data.vulnerabilities.summary.critical).toBe('number');
      expect(typeof data.vulnerabilities.summary.total).toBe('number');
    });

    it('should include compliance frameworks', async () => {
      const data = await service.getSecurityPosture();

      expect(data.compliance.frameworks).toBeInstanceOf(Array);
      expect(data.compliance.frameworks.length).toBeGreaterThan(0);
      expect(data.compliance.frameworks[0].name).toBeDefined();
      expect(data.compliance.frameworks[0].score).toBeGreaterThanOrEqual(0);
    });
  });
});

// ==================== 自动扩缩容服务测试 ====================

describe('AutoScalingService', () => {
  let service: AutoScalingService;

  beforeEach(() => {
    service = new AutoScalingService();
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('createPolicy', () => {
    it('should create a scaling policy', () => {
      const policy = service.createPolicy({
        name: 'test-policy',
        target: {
          kind: 'Deployment',
          name: 'api-server',
          namespace: 'default',
        },
        minReplicas: 2,
        maxReplicas: 10,
        metrics: [
          { type: 'cpu', targetValue: 70, targetType: 'Utilization' },
        ],
        behavior: {
          scaleUp: {
            stabilizationWindowSeconds: 60,
            policies: [{ type: 'Pods', value: 2, periodSeconds: 60 }],
          },
          scaleDown: {
            stabilizationWindowSeconds: 300,
            policies: [{ type: 'Percent', value: 10, periodSeconds: 60 }],
          },
        },
        enabled: false,
      });

      expect(policy.id).toBeDefined();
      expect(policy.name).toBe('test-policy');
      expect(policy.minReplicas).toBe(2);
      expect(policy.maxReplicas).toBe(10);
    });
  });

  describe('listPolicies', () => {
    it('should list all policies', async () => {
      service.createPolicy({
        name: 'policy-1',
        target: { kind: 'Deployment', name: 'app-1', namespace: 'default' },
        minReplicas: 1,
        maxReplicas: 5,
        metrics: [],
        behavior: {
          scaleUp: { stabilizationWindowSeconds: 60, policies: [] },
          scaleDown: { stabilizationWindowSeconds: 60, policies: [] },
        },
        enabled: false,
      });

      // 等待一下确保 ID 不冲突
      await new Promise(resolve => setTimeout(resolve, 10));

      service.createPolicy({
        name: 'policy-2',
        target: { kind: 'Deployment', name: 'app-2', namespace: 'default' },
        minReplicas: 2,
        maxReplicas: 8,
        metrics: [],
        behavior: {
          scaleUp: { stabilizationWindowSeconds: 60, policies: [] },
          scaleDown: { stabilizationWindowSeconds: 60, policies: [] },
        },
        enabled: false,
      });

      const policies = service.listPolicies();
      expect(policies.length).toBe(2);
    });
  });

  describe('triggerScaling', () => {
    it('should trigger manual scaling', async () => {
      const policy = service.createPolicy({
        name: 'test-policy',
        target: { kind: 'Deployment', name: 'app', namespace: 'default' },
        minReplicas: 1,
        maxReplicas: 10,
        metrics: [],
        behavior: {
          scaleUp: { stabilizationWindowSeconds: 60, policies: [] },
          scaleDown: { stabilizationWindowSeconds: 60, policies: [] },
        },
        enabled: false,
      });

      const event = await service.triggerScaling(policy.id, 5);

      expect(event.policyId).toBe(policy.id);
      expect(event.toReplicas).toBe(5);
      expect(event.status).toBe('completed');
    });
  });
});

// ==================== 故障自愈服务测试 ====================

describe('SelfHealingService', () => {
  let service: SelfHealingService;

  beforeEach(() => {
    service = new SelfHealingService();
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('createRule', () => {
    it('should create a healing rule', () => {
      const rule = service.createRule({
        name: 'pod-crash-restart',
        description: 'Restart crashed pods',
        condition: {
          type: 'pod-crash',
          threshold: 3,
          duration: 300,
        },
        action: {
          type: 'restart-pod',
        },
        cooldown: 300,
        maxRetries: 3,
        enabled: false,
      });

      expect(rule.id).toBeDefined();
      expect(rule.name).toBe('pod-crash-restart');
      expect(rule.condition.type).toBe('pod-crash');
    });
  });

  describe('triggerHealing', () => {
    it('should trigger manual healing', async () => {
      const rule = service.createRule({
        name: 'test-rule',
        description: 'Test rule',
        condition: { type: 'pod-crash' },
        action: { type: 'restart-pod' },
        cooldown: 60,
        maxRetries: 3,
        enabled: false,
      });

      const event = await service.triggerHealing(rule.id, 'test-pod');

      expect(event.ruleId).toBe(rule.id);
      expect(event.action.target).toBe('test-pod');
      expect(event.status).toBe('completed');
    });
  });
});

// ==================== 备份恢复服务测试 ====================

describe('BackupRecoveryService', () => {
  let service: BackupRecoveryService;

  beforeEach(() => {
    service = new BackupRecoveryService();
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('createPolicy', () => {
    it('should create a backup policy', () => {
      const policy = service.createPolicy({
        name: 'daily-db-backup',
        description: 'Daily database backup',
        source: {
          type: 'database',
          name: 'postgresql',
        },
        destination: {
          type: 's3',
          bucket: 'backups',
          path: '/postgresql/daily',
        },
        schedule: '0 2 * * *',
        retention: {
          daily: 7,
          weekly: 4,
          monthly: 12,
          yearly: 3,
        },
        options: {
          compression: true,
          encryption: true,
          incremental: false,
          parallelism: 4,
        },
        enabled: false,
      });

      expect(policy.id).toBeDefined();
      expect(policy.name).toBe('daily-db-backup');
      expect(policy.source.type).toBe('database');
    });
  });

  describe('triggerBackup', () => {
    it('should trigger manual backup', async () => {
      const policy = service.createPolicy({
        name: 'test-backup',
        description: 'Test backup',
        source: { type: 'database', name: 'test-db' },
        destination: { type: 's3', path: '/test' },
        schedule: '0 0 * * *',
        retention: { daily: 1, weekly: 0, monthly: 0, yearly: 0 },
        options: { compression: false, encryption: false, incremental: false, parallelism: 1 },
        enabled: false,
      });

      const job = await service.triggerBackup(policy.id);

      expect(job.policyId).toBe(policy.id);
      expect(job.type).toBe('manual');
      expect(job.status).toBe('completed');
      expect(job.progress).toBe(100);
    });
  });
});

// ==================== 版本回滚服务测试 ====================

describe('RollbackService', () => {
  let service: RollbackService;

  beforeEach(() => {
    service = new RollbackService();
  });

  describe('createPolicy', () => {
    it('should create a rollback policy', () => {
      const policy = service.createPolicy({
        name: 'api-rollback',
        target: {
          kind: 'Deployment',
          name: 'api-server',
          namespace: 'default',
        },
        strategy: {
          type: 'revision',
          maxRevisions: 10,
          autoRollback: true,
          healthCheck: {
            enabled: true,
            timeout: 300,
            successThreshold: 3,
            failureThreshold: 3,
          },
        },
        enabled: true,
      });

      expect(policy.id).toBeDefined();
      expect(policy.name).toBe('api-rollback');
      expect(policy.strategy.autoRollback).toBe(true);
    });
  });

  describe('getRevisionHistory', () => {
    it('should return revision history', () => {
      const policy = service.createPolicy({
        name: 'test-rollback',
        target: { kind: 'Deployment', name: 'test-app', namespace: 'default' },
        strategy: {
          type: 'revision',
          maxRevisions: 5,
          autoRollback: false,
          healthCheck: { enabled: false, timeout: 0, successThreshold: 0, failureThreshold: 0 },
        },
        enabled: true,
      });

      const history = service.getRevisionHistory(policy.id);

      expect(history).toBeInstanceOf(Array);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].revision).toBeDefined();
      expect(history[0].timestamp).toBeDefined();
    });
  });
});

// ==================== 边缘推理服务测试 ====================

describe('EdgeInferenceService', () => {
  let service: EdgeInferenceService;

  beforeEach(() => {
    service = new EdgeInferenceService();
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('registerNode', () => {
    it('should register an edge node', () => {
      const node = service.registerNode({
        name: 'edge-node-1',
        location: { zone: 'zone-a' },
        hardware: {
          cpu: { model: 'Intel Xeon', cores: 8, frequency: 3.0 },
          memory: { total: 32, type: 'DDR4' },
          gpu: { model: 'NVIDIA T4', memory: 16, tensorCores: 320 },
          storage: { type: 'nvme', capacity: 500 },
          network: [{ name: 'eth0', speed: 10000, type: 'ethernet' }],
        },
        status: 'online',
        metrics: {
          cpu: 45,
          memory: 60,
          gpu: 30,
          network: { rx: 1000, tx: 500 },
          temperature: 55,
          uptime: 86400,
        },
        capabilities: ['tensorrt', 'cuda'],
        lastHeartbeat: Date.now(),
      });

      expect(node.id).toBeDefined();
      expect(node.name).toBe('edge-node-1');
      expect(node.status).toBe('online');
    });
  });

  describe('deployModel', () => {
    it('should deploy a model', () => {
      const model = service.deployModel({
        name: 'fault-detector',
        version: '1.0.0',
        type: 'vision',
        framework: 'tensorrt',
        size: 500000000,
        precision: 'fp16',
        inputShape: [1, 3, 640, 640],
        outputShape: [1, 100, 6],
        performance: {
          latency: 15,
          throughput: 60,
          memoryUsage: 2000,
        },
        deployedNodes: [],
      });

      expect(model.id).toBeDefined();
      expect(model.name).toBe('fault-detector');
      expect(model.status).toBe('deploying');
    });
  });

  describe('infer', () => {
    it('should perform inference', async () => {
      // 注册节点
      service.registerNode({
        name: 'test-node',
        location: { zone: 'test' },
        hardware: {
          cpu: { model: 'Test', cores: 4, frequency: 2.0 },
          memory: { total: 16, type: 'DDR4' },
          storage: { type: 'ssd', capacity: 100 },
          network: [{ name: 'eth0', speed: 1000, type: 'ethernet' }],
        },
        status: 'online',
        metrics: {
          cpu: 30,
          memory: 40,
          network: { rx: 100, tx: 50 },
          temperature: 45,
          uptime: 3600,
        },
        capabilities: [],
        lastHeartbeat: Date.now(),
      });

      // 部署模型
      const model = service.deployModel({
        name: 'test-model',
        version: '1.0',
        type: 'llm',
        framework: 'tensorrt',
        size: 1000000,
        precision: 'fp16',
        inputShape: [1, 512],
        outputShape: [1, 512],
        performance: { latency: 50, throughput: 20, memoryUsage: 500 },
        deployedNodes: [],
      });

      // 执行推理
      const result = await service.infer({
        modelId: model.id,
        input: { text: 'Hello world' },
        priority: 'normal',
        timeout: 5000,
      });

      expect(result.requestId).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.latency).toBeGreaterThan(0);
    });
  });
});

// ==================== 边缘网关服务测试 ====================

describe('EdgeGatewayService', () => {
  let service: EdgeGatewayService;

  beforeEach(() => {
    service = new EdgeGatewayService();
  });

  describe('createGateway', () => {
    it('should create a gateway', () => {
      const gateway = service.createGateway({
        name: 'mqtt-gateway',
        type: 'mqtt',
        endpoint: 'mqtt://localhost:1883',
        status: 'disconnected',
        config: {
          protocol: 'mqtt',
          port: 1883,
          tls: false,
          bufferSize: 1000,
          retryPolicy: { maxRetries: 3, backoffMs: 1000 },
        },
        connectedDevices: 0,
        lastActivity: Date.now(),
      });

      expect(gateway.id).toBeDefined();
      expect(gateway.name).toBe('mqtt-gateway');
      expect(gateway.type).toBe('mqtt');
    });
  });

  describe('connectGateway', () => {
    it('should connect to gateway', async () => {
      const gateway = service.createGateway({
        name: 'test-gateway',
        type: 'mqtt',
        endpoint: 'mqtt://localhost:1883',
        status: 'disconnected',
        config: {
          protocol: 'mqtt',
          port: 1883,
          tls: false,
          bufferSize: 100,
          retryPolicy: { maxRetries: 3, backoffMs: 1000 },
        },
        connectedDevices: 0,
        lastActivity: Date.now(),
      });

      await service.connectGateway(gateway.id);

      const updated = service.getGateway(gateway.id);
      expect(updated?.status).toBe('connected');
    });
  });

  describe('subscribe', () => {
    it('should subscribe to topic', () => {
      const gateway = service.createGateway({
        name: 'test-gateway',
        type: 'mqtt',
        endpoint: 'mqtt://localhost:1883',
        status: 'connected',
        config: {
          protocol: 'mqtt',
          port: 1883,
          tls: false,
          bufferSize: 100,
          retryPolicy: { maxRetries: 3, backoffMs: 1000 },
        },
        connectedDevices: 0,
        lastActivity: Date.now(),
      });

      let receivedMessage: unknown = null;
      service.subscribe(gateway.id, 'test/topic', (msg) => {
        receivedMessage = msg;
      });

      // 模拟消息
      service.simulateMessage(gateway.id, 'test/topic', { data: 'test' });

      expect(receivedMessage).toEqual({ data: 'test' });
    });
  });
});

// ==================== TSN 服务测试 ====================

describe('TSNService', () => {
  let service: TSNService;

  beforeEach(() => {
    service = new TSNService();
  });

  describe('createTSNConfig', () => {
    it('should create TSN configuration', () => {
      const config = service.createTSNConfig({
        name: 'crane-control',
        network: {
          vlan: 100,
          priority: 7,
          bandwidth: 1000,
          latencyTarget: 1,
        },
        schedule: {
          cycleTime: 1000,
          gateControlList: [
            { gateState: 0xff, timeInterval: 500 },
            { gateState: 0x01, timeInterval: 500 },
          ],
        },
        streams: [
          {
            id: 'stream-1',
            source: '00:11:22:33:44:55',
            destination: '00:11:22:33:44:66',
            priority: 7,
            maxFrameSize: 1500,
            interval: 1000,
          },
        ],
      });

      expect(config.id).toBeDefined();
      expect(config.name).toBe('crane-control');
      expect(config.network.latencyTarget).toBe(1);
    });
  });

  describe('create5GConfig', () => {
    it('should create 5G configuration', () => {
      const config = service.create5GConfig({
        name: 'urllc-slice',
        slice: {
          type: 'urllc',
          qos: {
            latency: 1,
            reliability: 0.99999,
            bandwidth: 100,
          },
        },
        connection: {
          apn: 'industrial.5g',
          status: 'disconnected',
          signalStrength: -80,
          technology: '5g-sa',
        },
      });

      expect(config.id).toBeDefined();
      expect(config.name).toBe('urllc-slice');
      expect(config.slice.type).toBe('urllc');
    });
  });

  describe('runLatencyTest', () => {
    it('should run latency test', async () => {
      const config = service.createTSNConfig({
        name: 'test-tsn',
        network: { vlan: 1, priority: 7, bandwidth: 1000, latencyTarget: 1 },
        schedule: { cycleTime: 1000, gateControlList: [] },
        streams: [],
      });

      const result = await service.runLatencyTest(config.id, 'tsn');

      expect(result.minLatency).toBeGreaterThan(0);
      expect(result.maxLatency).toBeGreaterThanOrEqual(result.minLatency);
      expect(result.avgLatency).toBeGreaterThan(0);
      expect(result.jitter).toBeGreaterThanOrEqual(0);
      expect(result.packetLoss).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getNetworkMetrics', () => {
    it('should return network metrics', () => {
      service.createTSNConfig({
        name: 'tsn-1',
        network: { vlan: 1, priority: 7, bandwidth: 1000, latencyTarget: 1 },
        schedule: { cycleTime: 1000, gateControlList: [] },
        streams: [],
      });

      service.create5GConfig({
        name: '5g-1',
        slice: { type: 'urllc', qos: { latency: 1, reliability: 0.99999, bandwidth: 100 } },
        connection: { apn: 'test', status: 'disconnected', signalStrength: -80, technology: '5g-sa' },
      });

      const metrics = service.getNetworkMetrics();

      expect(metrics.tsn).toBeInstanceOf(Array);
      expect(metrics.fiveG).toBeInstanceOf(Array);
      expect(metrics.tsn.length).toBe(1);
      expect(metrics.fiveG.length).toBe(1);
    });
  });
});
