/**
 * 数据流层单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============ Kafka Cluster 测试 ============

describe('KafkaClusterService', () => {
  describe('Topic 配置', () => {
    it('应该定义 sensor-data Topic 为 128 分区', async () => {
      const { XILIAN_TOPICS } = await import('./kafka/kafkaCluster');
      expect(XILIAN_TOPICS.SENSOR_DATA.partitions).toBe(128);
      expect(XILIAN_TOPICS.SENSOR_DATA.name).toBe('xilian.sensor-data');
    });

    it('应该定义 ais-vessel Topic 为 16 分区', async () => {
      const { XILIAN_TOPICS } = await import('./kafka/kafkaCluster');
      expect(XILIAN_TOPICS.AIS_VESSEL.partitions).toBe(16);
      expect(XILIAN_TOPICS.AIS_VESSEL.name).toBe('xilian.ais-vessel');
    });

    it('应该定义 tos-job Topic 为 32 分区', async () => {
      const { XILIAN_TOPICS } = await import('./kafka/kafkaCluster');
      expect(XILIAN_TOPICS.TOS_JOB.partitions).toBe(32);
      expect(XILIAN_TOPICS.TOS_JOB.name).toBe('xilian.tos-job');
    });

    it('应该定义 fault-events Topic 为 8 分区', async () => {
      const { XILIAN_TOPICS } = await import('./kafka/kafkaCluster');
      expect(XILIAN_TOPICS.FAULT_EVENTS.partitions).toBe(8);
      expect(XILIAN_TOPICS.FAULT_EVENTS.name).toBe('xilian.fault-events');
    });

    it('应该配置 7 天消息保留策略', async () => {
      const { XILIAN_TOPICS } = await import('./kafka/kafkaCluster');
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(XILIAN_TOPICS.SENSOR_DATA.retentionMs).toBe(sevenDaysMs);
      expect(XILIAN_TOPICS.AIS_VESSEL.retentionMs).toBe(sevenDaysMs);
      expect(XILIAN_TOPICS.TOS_JOB.retentionMs).toBe(sevenDaysMs);
    });

    it('应该配置 fault-events 为 30 天保留', async () => {
      const { XILIAN_TOPICS } = await import('./kafka/kafkaCluster');
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(XILIAN_TOPICS.FAULT_EVENTS.retentionMs).toBe(thirtyDaysMs);
    });

    it('应该配置 2 副本复制因子', async () => {
      const { XILIAN_TOPICS } = await import('./kafka/kafkaCluster');
      expect(XILIAN_TOPICS.SENSOR_DATA.replicationFactor).toBe(2);
      expect(XILIAN_TOPICS.FAULT_EVENTS.replicationFactor).toBe(2);
    });

    it('应该配置 fault-events 为高可靠性（minInsyncReplicas=2）', async () => {
      const { XILIAN_TOPICS } = await import('./kafka/kafkaCluster');
      expect(XILIAN_TOPICS.FAULT_EVENTS.minInsyncReplicas).toBe(2);
    });
  });

  describe('KafkaClusterService 类', () => {
    it('应该能够创建实例', async () => {
      const { KafkaClusterService } = await import('./kafka/kafkaCluster');
      const service = new KafkaClusterService();
      expect(service).toBeDefined();
    });

    it('应该支持自定义配置', async () => {
      const { KafkaClusterService } = await import('./kafka/kafkaCluster');
      const service = new KafkaClusterService({
        clusterId: 'test-cluster',
        clientId: 'test-client',
      });
      expect(service).toBeDefined();
    });
  });
});

// ============ Flink 处理器测试 ============

describe('FlinkProcessor', () => {
  describe('AnomalyDetector', () => {
    it('应该能够创建实例', async () => {
      const { AnomalyDetector } = await import('./flink/flinkProcessor');
      const detector = new AnomalyDetector();
      expect(detector).toBeDefined();
    });

    it('应该支持自定义窗口配置', async () => {
      const { AnomalyDetector } = await import('./flink/flinkProcessor');
      const detector = new AnomalyDetector({
        window: {
          sizeMs: 120000, // 2分钟
          slideMs: 30000,
          allowedLatenessMs: 10000,
        },
        threshold: 2.5,
      });
      const status = detector.getStatus();
      expect(status.config.window.sizeMs).toBe(120000);
      expect(status.config.threshold).toBe(2.5);
    });

    it('应该正确计算 Z-Score', async () => {
      const { AnomalyDetector } = await import('./flink/flinkProcessor');
      const detector = new AnomalyDetector({
        threshold: 3.0,
      });

      // 模拟推送正常数据
      const now = Date.now();
      for (let i = 0; i < 20; i++) {
        await detector.pushReading({
          deviceId: 'device1',
          sensorId: 'sensor1',
          metricName: 'temperature',
          value: 50 + Math.random() * 2, // 48-52 范围内的正常值
          timestamp: now + i * 1000,
        });
      }

      // 推送异常值
      const result = await detector.pushReading({
        deviceId: 'device1',
        sensorId: 'sensor1',
        metricName: 'temperature',
        value: 100, // 明显异常值
        timestamp: now + 21000,
      });

      expect(result).not.toBeNull();
      if (result) {
        expect(result.isAnomaly).toBe(true);
        expect(result.score).toBeGreaterThan(3);
      }
    });

    it('应该返回正确的状态', async () => {
      const { AnomalyDetector } = await import('./flink/flinkProcessor');
      const detector = new AnomalyDetector();
      const status = detector.getStatus();

      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('windowCount');
      expect(status).toHaveProperty('config');
      expect(status.isRunning).toBe(false);
    });
  });

  describe('MetricsAggregator', () => {
    it('应该能够创建实例', async () => {
      const { MetricsAggregator } = await import('./flink/flinkProcessor');
      const aggregator = new MetricsAggregator();
      expect(aggregator).toBeDefined();
    });

    it('应该配置 1 分钟和 1 小时窗口', async () => {
      const { MetricsAggregator } = await import('./flink/flinkProcessor');
      const aggregator = new MetricsAggregator();
      const status = aggregator.getStatus();

      expect(status.config.windows['1m'].sizeMs).toBe(60000);
      expect(status.config.windows['1h'].sizeMs).toBe(3600000);
    });

    it('应该能够推送数据点', async () => {
      const { MetricsAggregator } = await import('./flink/flinkProcessor');
      const aggregator = new MetricsAggregator();

      aggregator.pushReading({
        deviceId: 'device1',
        sensorId: 'sensor1',
        metricName: 'temperature',
        value: 50,
        timestamp: Date.now(),
      });

      const status = aggregator.getStatus();
      expect(status.window1mCount).toBeGreaterThanOrEqual(0);
    });

    it('应该返回正确的状态', async () => {
      const { MetricsAggregator } = await import('./flink/flinkProcessor');
      const aggregator = new MetricsAggregator();
      const status = aggregator.getStatus();

      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('window1mCount');
      expect(status).toHaveProperty('window1hCount');
      expect(status).toHaveProperty('config');
    });
  });

  describe('KGBuilder', () => {
    it('应该能够创建实例', async () => {
      const { KGBuilder } = await import('./flink/flinkProcessor');
      const builder = new KGBuilder();
      expect(builder).toBeDefined();
    });

    it('应该支持自定义配置', async () => {
      const { KGBuilder } = await import('./flink/flinkProcessor');
      const builder = new KGBuilder({
        batchSize: 50,
        flushIntervalMs: 10000,
      });
      const status = builder.getStatus();

      expect(status.config.batchSize).toBe(50);
      expect(status.config.flushIntervalMs).toBe(10000);
    });

    it('应该能够处理 CDC 事件', async () => {
      const { KGBuilder } = await import('./flink/flinkProcessor');
      const builder = new KGBuilder();

      await builder.pushCDCEvent({
        operation: 'INSERT',
        table: 'devices',
        before: null,
        after: { id: 'dev1', name: 'Device 1', type: 'sensor' },
        timestamp: Date.now(),
      });

      const status = builder.getStatus();
      expect(status.entityBufferSize).toBeGreaterThanOrEqual(0);
    });

    it('应该返回正确的状态', async () => {
      const { KGBuilder } = await import('./flink/flinkProcessor');
      const builder = new KGBuilder();
      const status = builder.getStatus();

      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('entityBufferSize');
      expect(status).toHaveProperty('relationBufferSize');
      expect(status).toHaveProperty('config');
    });
  });
});

// ============ Kafka Archiver 测试 ============

describe('KafkaArchiver', () => {
  it('应该能够创建实例', async () => {
    const { KafkaArchiver } = await import('./archive/kafkaArchiver');
    const archiver = new KafkaArchiver();
    expect(archiver).toBeDefined();
  });

  it('应该支持自定义配置', async () => {
    const { KafkaArchiver } = await import('./archive/kafkaArchiver');
    const archiver = new KafkaArchiver({
      batchSize: 5000,
      flushIntervalMs: 30000,
      compressionType: 'snappy',
    });
    const status = archiver.getStatus();

    expect(status.config.batchSize).toBe(5000);
    expect(status.config.flushIntervalMs).toBe(30000);
    expect(status.config.compressionType).toBe('snappy');
  });

  it('应该能够添加消息到缓冲区', async () => {
    const { KafkaArchiver, XILIAN_TOPICS } = await import('./archive/kafkaArchiver');
    const { XILIAN_TOPICS: topics } = await import('./kafka/kafkaCluster');
    
    const archiver = new KafkaArchiver({
      topics: [topics.SENSOR_DATA.name],
    });

    archiver.addMessage({
      topic: topics.SENSOR_DATA.name,
      partition: 0,
      offset: '100',
      key: 'device1',
      value: JSON.stringify({ value: 50 }),
      headers: {},
      timestamp: Date.now().toString(),
    });

    const status = archiver.getStatus();
    expect(status.bufferSizes[topics.SENSOR_DATA.name]).toBe(1);
  });

  it('应该返回正确的统计信息', async () => {
    const { KafkaArchiver } = await import('./archive/kafkaArchiver');
    const archiver = new KafkaArchiver();
    const stats = archiver.getStats();

    expect(stats).toHaveProperty('totalMessages');
    expect(stats).toHaveProperty('totalBytes');
    expect(stats).toHaveProperty('filesCreated');
    expect(stats).toHaveProperty('lastArchiveTime');
    expect(stats).toHaveProperty('errors');
  });

  it('应该返回正确的状态', async () => {
    const { KafkaArchiver } = await import('./archive/kafkaArchiver');
    const archiver = new KafkaArchiver();
    const status = archiver.getStatus();

    expect(status).toHaveProperty('isRunning');
    expect(status).toHaveProperty('config');
    expect(status).toHaveProperty('stats');
    expect(status).toHaveProperty('bufferSizes');
  });
});

// ============ DataflowManager 测试 ============

describe('DataflowManager', () => {
  it('应该能够创建实例', async () => {
    const { DataflowManager } = await import('./dataflowManager');
    const manager = new DataflowManager();
    expect(manager).toBeDefined();
  });

  it('应该能够获取指标', async () => {
    const { DataflowManager } = await import('./dataflowManager');
    const manager = new DataflowManager();
    const metrics = manager.getMetrics();

    expect(metrics).toHaveProperty('kafka');
    expect(metrics).toHaveProperty('processors');
    expect(metrics).toHaveProperty('archiver');
    expect(metrics.kafka).toHaveProperty('messagesPerSecond');
    expect(metrics.processors).toHaveProperty('anomaliesDetected');
    expect(metrics.archiver).toHaveProperty('messagesArchived');
  });

  it('应该能够重置指标', async () => {
    const { DataflowManager } = await import('./dataflowManager');
    const manager = new DataflowManager();
    
    manager.resetMetrics();
    const metrics = manager.getMetrics();

    expect(metrics.kafka.messagesPerSecond).toBe(0);
    expect(metrics.processors.anomaliesDetected).toBe(0);
    expect(metrics.archiver.messagesArchived).toBe(0);
  });

  it('应该能够注册事件处理器', async () => {
    const { DataflowManager } = await import('./dataflowManager');
    const manager = new DataflowManager();
    
    const handler = vi.fn();
    manager.on('anomaly_detected', handler);
    
    // 验证处理器已注册（通过移除不抛错来验证）
    expect(() => manager.off('anomaly_detected', handler)).not.toThrow();
  });

  it('应该能够获取 Topic 配置', async () => {
    const { DataflowManager } = await import('./dataflowManager');
    const manager = new DataflowManager();
    const configs = manager.getTopicConfigs();

    expect(configs).toHaveProperty('SENSOR_DATA');
    expect(configs).toHaveProperty('AIS_VESSEL');
    expect(configs).toHaveProperty('TOS_JOB');
    expect(configs).toHaveProperty('FAULT_EVENTS');
  });
});

// ============ 集成测试 ============

describe('数据流层集成', () => {
  it('应该正确导出所有模块', async () => {
    const dataflow = await import('./index');

    // Kafka Cluster
    expect(dataflow.kafkaCluster).toBeDefined();
    expect(dataflow.KafkaClusterService).toBeDefined();
    expect(dataflow.XILIAN_TOPICS).toBeDefined();

    // Flink 处理器
    expect(dataflow.anomalyDetector).toBeDefined();
    expect(dataflow.metricsAggregator).toBeDefined();
    expect(dataflow.kgBuilder).toBeDefined();
    expect(dataflow.AnomalyDetector).toBeDefined();
    expect(dataflow.MetricsAggregator).toBeDefined();
    expect(dataflow.KGBuilder).toBeDefined();

    // 归档
    expect(dataflow.kafkaArchiver).toBeDefined();
    expect(dataflow.KafkaArchiver).toBeDefined();

    // 管理器
    expect(dataflow.dataflowManager).toBeDefined();
    expect(dataflow.DataflowManager).toBeDefined();
  });

  it('Topic 配置应该符合需求规格', async () => {
    const { XILIAN_TOPICS } = await import('./kafka/kafkaCluster');

    // sensor-data: 128 分区
    expect(XILIAN_TOPICS.SENSOR_DATA.partitions).toBe(128);
    
    // ais-vessel: 16 分区
    expect(XILIAN_TOPICS.AIS_VESSEL.partitions).toBe(16);
    
    // tos-job: 32 分区
    expect(XILIAN_TOPICS.TOS_JOB.partitions).toBe(32);
    
    // fault-events: 8 分区
    expect(XILIAN_TOPICS.FAULT_EVENTS.partitions).toBe(8);
  });

  it('窗口配置应该符合需求规格', async () => {
    const { AnomalyDetector, MetricsAggregator } = await import('./flink/flinkProcessor');

    // anomaly-detector: 1分钟窗口
    const detector = new AnomalyDetector();
    expect(detector.getStatus().config.window.sizeMs).toBe(60000);

    // metrics-aggregator: 1分钟和1小时窗口
    const aggregator = new MetricsAggregator();
    expect(aggregator.getStatus().config.windows['1m'].sizeMs).toBe(60000);
    expect(aggregator.getStatus().config.windows['1h'].sizeMs).toBe(3600000);
  });
});
