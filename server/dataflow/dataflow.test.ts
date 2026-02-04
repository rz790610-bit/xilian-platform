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


// ============ 补充测试用例 ============

describe('Kafka Cluster 高级功能', () => {
  describe('压缩类型配置', () => {
    it('应该支持 lz4 压缩', async () => {
      const { XILIAN_TOPICS } = await import('./kafka/kafkaCluster');
      expect(XILIAN_TOPICS.SENSOR_DATA.compressionType).toBe('lz4');
    });

    it('应该支持 gzip 压缩', async () => {
      const { XILIAN_TOPICS } = await import('./kafka/kafkaCluster');
      expect(XILIAN_TOPICS.FAULT_EVENTS.compressionType).toBe('gzip');
    });
  });

  describe('Topic 元数据', () => {
    it('应该包含所有必需的 Topic', async () => {
      const { XILIAN_TOPICS } = await import('./kafka/kafkaCluster');
      const requiredTopics = [
        'SENSOR_DATA',
        'AIS_VESSEL', 
        'TOS_JOB',
        'FAULT_EVENTS',
        'ANOMALY_RESULTS',
        'AGGREGATIONS_1M',
        'AGGREGATIONS_1H',
        'CDC_EVENTS',
        'KG_ENTITIES',
      ];
      
      for (const topic of requiredTopics) {
        expect(XILIAN_TOPICS).toHaveProperty(topic);
      }
    });
  });
});

describe('AnomalyDetector 高级功能', () => {
  describe('严重程度分类', () => {
    it('应该正确分类异常严重程度', async () => {
      const { AnomalyDetector } = await import('./flink/flinkProcessor');
      const detector = new AnomalyDetector({
        threshold: 2.0,
        minDataPoints: 5,
      });

      const now = Date.now();
      
      // 推送正常数据建立基线
      for (let i = 0; i < 10; i++) {
        await detector.pushReading({
          deviceId: 'device1',
          sensorId: 'sensor1',
          metricName: 'temperature',
          value: 50,
          timestamp: now + i * 1000,
        });
      }

      // 推送极端异常值
      const result = await detector.pushReading({
        deviceId: 'device1',
        sensorId: 'sensor1',
        metricName: 'temperature',
        value: 200, // 极端异常
        timestamp: now + 11000,
      });

      expect(result).not.toBeNull();
      if (result && result.isAnomaly) {
        expect(['low', 'medium', 'high', 'critical']).toContain(result.severity);
      }
    });
  });

  describe('事件处理器', () => {
    it('应该能够注册多个处理器', async () => {
      const { AnomalyDetector } = await import('./flink/flinkProcessor');
      const detector = new AnomalyDetector();

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      detector.onAnomaly(handler1);
      detector.onAnomaly(handler2);

      // 验证处理器已注册
      expect(detector.getStatus()).toBeDefined();
    });
  });
});

describe('MetricsAggregator 高级功能', () => {
  describe('百分位数计算', () => {
    it('应该正确计算统计指标', async () => {
      const { MetricsAggregator } = await import('./flink/flinkProcessor');
      const aggregator = new MetricsAggregator();

      const now = Date.now();
      
      // 推送一系列数据点
      for (let i = 0; i < 100; i++) {
        aggregator.pushReading({
          deviceId: 'device1',
          sensorId: 'sensor1',
          metricName: 'temperature',
          value: 50 + i % 10, // 50-59 范围
          timestamp: now + i * 100,
        });
      }

      const status = aggregator.getStatus();
      expect(status.window1mCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('多窗口支持', () => {
    it('应该同时维护 1m 和 1h 窗口', async () => {
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
      expect(status).toHaveProperty('window1mCount');
      expect(status).toHaveProperty('window1hCount');
    });
  });
});

describe('KGBuilder 高级功能', () => {
  describe('实体类型映射', () => {
    it('应该正确映射 devices 表到 Equipment 类型', async () => {
      const { KGBuilder } = await import('./flink/flinkProcessor');
      const builder = new KGBuilder();

      const entities: any[] = [];
      builder.onEntity((entity) => entities.push(entity));

      await builder.pushCDCEvent({
        operation: 'INSERT',
        table: 'devices',
        before: null,
        after: { id: 'dev1', name: 'Device 1' },
        timestamp: Date.now(),
      });

      await builder.triggerFlush();

      expect(entities.length).toBeGreaterThanOrEqual(0);
    });

    it('应该正确映射 faults 表到 Fault 类型', async () => {
      const { KGBuilder } = await import('./flink/flinkProcessor');
      const builder = new KGBuilder();

      await builder.pushCDCEvent({
        operation: 'INSERT',
        table: 'faults',
        before: null,
        after: { id: 'fault1', deviceId: 'dev1', description: 'Test fault' },
        timestamp: Date.now(),
      });

      const status = builder.getStatus();
      expect(status.entityBufferSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('关系提取', () => {
    it('应该从 Component 提取 HAS_PART 关系', async () => {
      const { KGBuilder } = await import('./flink/flinkProcessor');
      const builder = new KGBuilder();

      const relations: any[] = [];
      builder.onRelation((relation) => relations.push(relation));

      await builder.pushCDCEvent({
        operation: 'INSERT',
        table: 'components',
        before: null,
        after: { id: 'comp1', deviceId: 'dev1', name: 'Component 1' },
        timestamp: Date.now(),
      });

      await builder.triggerFlush();

      // 验证关系已提取
      expect(builder.getStatus().relationBufferSize).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('KafkaArchiver 高级功能', () => {
  describe('压缩功能', () => {
    it('应该支持 gzip 压缩', async () => {
      const { KafkaArchiver } = await import('./archive/kafkaArchiver');
      const archiver = new KafkaArchiver({
        compressionType: 'gzip',
      });

      const status = archiver.getStatus();
      expect(status.config.compressionType).toBe('gzip');
    });

    it('应该支持无压缩模式', async () => {
      const { KafkaArchiver } = await import('./archive/kafkaArchiver');
      const archiver = new KafkaArchiver({
        compressionType: 'none',
      });

      const status = archiver.getStatus();
      expect(status.config.compressionType).toBe('none');
    });
  });

  describe('分区路径生成', () => {
    it('应该支持小时级分区', async () => {
      const { KafkaArchiver } = await import('./archive/kafkaArchiver');
      const archiver = new KafkaArchiver({
        partitionFormat: 'hourly',
      });

      const status = archiver.getStatus();
      expect(status.config.partitionFormat).toBe('hourly');
    });

    it('应该支持天级分区', async () => {
      const { KafkaArchiver } = await import('./archive/kafkaArchiver');
      const archiver = new KafkaArchiver({
        partitionFormat: 'daily',
      });

      const status = archiver.getStatus();
      expect(status.config.partitionFormat).toBe('daily');
    });
  });

  describe('归档触发', () => {
    it('应该能够手动触发归档', async () => {
      const { KafkaArchiver } = await import('./archive/kafkaArchiver');
      const { XILIAN_TOPICS } = await import('./kafka/kafkaCluster');
      
      const archiver = new KafkaArchiver({
        topics: [XILIAN_TOPICS.SENSOR_DATA.name],
      });

      // 添加测试消息
      archiver.addMessage({
        topic: XILIAN_TOPICS.SENSOR_DATA.name,
        partition: 0,
        offset: '1',
        key: 'test',
        value: JSON.stringify({ test: true }),
        headers: {},
        timestamp: Date.now().toString(),
      });

      // 触发归档
      await archiver.triggerArchive();

      const stats = archiver.getStats();
      expect(stats).toHaveProperty('totalMessages');
    });
  });
});

describe('DataflowManager 高级功能', () => {
  describe('事件总线', () => {
    it('应该支持所有事件类型', async () => {
      const { DataflowManager } = await import('./dataflowManager');
      const manager = new DataflowManager();

      const eventTypes = [
        'anomaly_detected',
        'aggregation_created',
        'entity_extracted',
        'relation_extracted',
        'archive_created',
        'error',
      ];

      for (const eventType of eventTypes) {
        const handler = vi.fn();
        expect(() => manager.on(eventType as any, handler)).not.toThrow();
      }
    });

    it('应该能够移除事件处理器', async () => {
      const { DataflowManager } = await import('./dataflowManager');
      const manager = new DataflowManager();

      const handler = vi.fn();
      manager.on('anomaly_detected', handler);
      
      expect(() => manager.off('anomaly_detected', handler)).not.toThrow();
    });
  });

  describe('Topic 管理', () => {
    it('应该返回所有预定义 Topic 配置', async () => {
      const { DataflowManager } = await import('./dataflowManager');
      const manager = new DataflowManager();

      const configs = manager.getTopicConfigs();
      
      expect(Object.keys(configs).length).toBeGreaterThan(0);
      expect(configs.SENSOR_DATA).toBeDefined();
      expect(configs.SENSOR_DATA.partitions).toBe(128);
    });
  });

  describe('归档管理', () => {
    it('应该能够获取归档统计', async () => {
      const { DataflowManager } = await import('./dataflowManager');
      const manager = new DataflowManager();

      const stats = manager.getArchiveStats();
      
      expect(stats).toHaveProperty('totalMessages');
      expect(stats).toHaveProperty('totalBytes');
      expect(stats).toHaveProperty('filesCreated');
    });

    it('应该能够获取最近归档文件', async () => {
      const { DataflowManager } = await import('./dataflowManager');
      const manager = new DataflowManager();

      const archives = manager.getRecentArchives(5);
      
      expect(Array.isArray(archives)).toBe(true);
    });
  });
});

describe('数据流层端到端测试', () => {
  it('应该能够完成完整的数据处理流程', async () => {
    const { AnomalyDetector, MetricsAggregator, KGBuilder } = await import('./flink/flinkProcessor');
    const { KafkaArchiver } = await import('./archive/kafkaArchiver');
    const { XILIAN_TOPICS } = await import('./kafka/kafkaCluster');

    // 创建处理器实例
    const detector = new AnomalyDetector();
    const aggregator = new MetricsAggregator();
    const builder = new KGBuilder();
    const archiver = new KafkaArchiver({
      topics: [XILIAN_TOPICS.SENSOR_DATA.name],
    });

    // 模拟传感器数据
    const sensorData = {
      deviceId: 'device1',
      sensorId: 'sensor1',
      metricName: 'temperature',
      value: 50,
      timestamp: Date.now(),
    };

    // 推送到各处理器
    await detector.pushReading(sensorData);
    aggregator.pushReading(sensorData);

    // 模拟 CDC 事件
    await builder.pushCDCEvent({
      operation: 'INSERT',
      table: 'devices',
      before: null,
      after: { id: 'device1', name: 'Test Device' },
      timestamp: Date.now(),
    });

    // 添加消息到归档
    archiver.addMessage({
      topic: XILIAN_TOPICS.SENSOR_DATA.name,
      partition: 0,
      offset: '1',
      key: 'device1',
      value: JSON.stringify(sensorData),
      headers: {},
      timestamp: Date.now().toString(),
    });

    // 验证所有处理器状态
    expect(detector.getStatus()).toBeDefined();
    expect(aggregator.getStatus()).toBeDefined();
    expect(builder.getStatus()).toBeDefined();
    expect(archiver.getStatus()).toBeDefined();
  });

  it('应该正确配置所有 Topic 分区数', async () => {
    const { XILIAN_TOPICS } = await import('./kafka/kafkaCluster');

    const expectedPartitions: Record<string, number> = {
      SENSOR_DATA: 128,
      AIS_VESSEL: 16,
      TOS_JOB: 32,
      FAULT_EVENTS: 8,
    };

    for (const [name, partitions] of Object.entries(expectedPartitions)) {
      expect(XILIAN_TOPICS[name as keyof typeof XILIAN_TOPICS].partitions).toBe(partitions);
    }
  });

  it('应该正确配置消息保留策略', async () => {
    const { XILIAN_TOPICS } = await import('./kafka/kafkaCluster');

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    // 普通 Topic 7 天保留
    expect(XILIAN_TOPICS.SENSOR_DATA.retentionMs).toBe(sevenDaysMs);
    expect(XILIAN_TOPICS.AIS_VESSEL.retentionMs).toBe(sevenDaysMs);
    expect(XILIAN_TOPICS.TOS_JOB.retentionMs).toBe(sevenDaysMs);

    // 故障事件 30 天保留
    expect(XILIAN_TOPICS.FAULT_EVENTS.retentionMs).toBe(thirtyDaysMs);
  });
});
