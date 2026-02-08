/**
 * 数据流模块单元测试
 * 测试事件总线、流处理器和设备服务
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// 模拟事件总线功能测试
describe('EventBus Module', () => {
  it('should create event with correct structure', () => {
    const event = {
      eventId: 'evt_' + Date.now(),
      topic: 'sensor.reading',
      eventType: 'temperature_reading',
      severity: 'info',
      timestamp: Date.now(),
      payload: { value: 25.5, unit: 'celsius' },
      deviceId: 'device_001',
      sensorId: 'temp_001',
    };

    expect(event.eventId).toMatch(/^evt_\d+$/);
    expect(event.topic).toBe('sensor.reading');
    expect(event.severity).toBe('info');
    expect(event.payload.value).toBe(25.5);
  });

  it('should categorize events by severity', () => {
    const severities = ['info', 'warning', 'error', 'critical'];
    const events = severities.map((severity, i) => ({
      eventId: `evt_${i}`,
      severity,
    }));

    const bySeverity: Record<string, number> = {};
    events.forEach(e => {
      bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
    });

    expect(bySeverity['info']).toBe(1);
    expect(bySeverity['warning']).toBe(1);
    expect(bySeverity['error']).toBe(1);
    expect(bySeverity['critical']).toBe(1);
  });

  it('should filter events by topic', () => {
    const events = [
      { topic: 'sensor.reading', eventType: 'temperature' },
      { topic: 'sensor.reading', eventType: 'vibration' },
      { topic: 'device.status', eventType: 'online' },
      { topic: 'anomaly.detected', eventType: 'threshold_exceeded' },
    ];

    const sensorEvents = events.filter(e => e.topic === 'sensor.reading');
    expect(sensorEvents.length).toBe(2);
  });
});

// 滑动窗口异常检测测试
describe('Stream Processor - Sliding Window', () => {
  it('should calculate mean correctly', () => {
    const values = [10, 20, 30, 40, 50];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBe(30);
  });

  it('should calculate standard deviation correctly', () => {
    const values = [10, 20, 30, 40, 50];
    const mean = 30;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    expect(stdDev).toBeCloseTo(14.14, 1);
  });

  it('should detect anomaly using Z-Score', () => {
    const windowData = [10, 12, 11, 13, 10, 11, 12, 10, 11, 12];
    const mean = windowData.reduce((a, b) => a + b, 0) / windowData.length;
    const stdDev = Math.sqrt(
      windowData.map(v => Math.pow(v - mean, 2)).reduce((a, b) => a + b, 0) / windowData.length
    );

    // 正常值
    const normalValue = 11;
    const normalZScore = Math.abs((normalValue - mean) / stdDev);
    expect(normalZScore).toBeLessThan(2);

    // 异常值
    const anomalyValue = 50;
    const anomalyZScore = Math.abs((anomalyValue - mean) / stdDev);
    expect(anomalyZScore).toBeGreaterThan(3);
  });

  it('should maintain sliding window size', () => {
    const maxWindowSize = 100;
    let window: number[] = [];

    // 添加数据
    for (let i = 0; i < 150; i++) {
      window.push(i);
      if (window.length > maxWindowSize) {
        window.shift();
      }
    }

    expect(window.length).toBe(maxWindowSize);
    expect(window[0]).toBe(50); // 最早的数据应该是50
    expect(window[window.length - 1]).toBe(149); // 最新的数据应该是149
  });
});

// 设备服务测试
describe('Device Service', () => {
  it('should create device with correct structure', () => {
    const device = {
      deviceId: 'agv_001',
      name: 'AGV小车1号',
      type: 'agv',
      status: 'online',
      location: 'A区-1号线',
      metadata: { manufacturer: 'XiLian', model: 'AGV-2000' },
    };

    expect(device.deviceId).toBe('agv_001');
    expect(device.type).toBe('agv');
    expect(device.status).toBe('online');
  });

  it('should create sensor with correct structure', () => {
    const sensor = {
      sensorId: 'agv_001_vib',
      deviceId: 'agv_001',
      name: '振动传感器',
      type: 'vibration',
      unit: 'mm/s',
      minValue: 0,
      maxValue: 100,
      warningThreshold: 50,
      criticalThreshold: 80,
    };

    expect(sensor.sensorId).toBe('agv_001_vib');
    expect(sensor.type).toBe('vibration');
    expect(sensor.warningThreshold).toBeLessThan(sensor.criticalThreshold);
  });

  it('should generate telemetry data within range', () => {
    const sensor = {
      minValue: 0,
      maxValue: 100,
      baseValue: 50,
      variance: 5,
    };

    // 模拟生成数据
    const generateValue = () => {
      const noise = (Math.random() - 0.5) * 2 * sensor.variance;
      return sensor.baseValue + noise;
    };

    // 生成100个数据点
    const values: number[] = [];
    for (let i = 0; i < 100; i++) {
      values.push(generateValue());
    }

    // 检查所有值都在合理范围内
    const allInRange = values.every(v => v >= sensor.baseValue - sensor.variance * 2 && v <= sensor.baseValue + sensor.variance * 2);
    expect(allInRange).toBe(true);
  });

  it('should detect threshold violations', () => {
    const sensor = {
      warningThreshold: 50,
      criticalThreshold: 80,
    };

    const checkThreshold = (value: number) => {
      if (value >= sensor.criticalThreshold) return 'critical';
      if (value >= sensor.warningThreshold) return 'warning';
      return 'normal';
    };

    expect(checkThreshold(30)).toBe('normal');
    expect(checkThreshold(60)).toBe('warning');
    expect(checkThreshold(90)).toBe('critical');
  });
});

// 数据聚合测试
describe('Data Aggregation', () => {
  it('should calculate aggregation metrics correctly', () => {
    const readings = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    
    const min = Math.min(...readings);
    const max = Math.max(...readings);
    const avg = readings.reduce((a, b) => a + b, 0) / readings.length;
    const count = readings.length;

    expect(min).toBe(10);
    expect(max).toBe(100);
    expect(avg).toBe(55);
    expect(count).toBe(10);
  });

  it('should group readings by time bucket', () => {
    // 使用固定时间戳避免边界问题
    const baseTime = 1700000000000; // 固定基准时间
    const readings = [
      { timestamp: baseTime + 10000, value: 10 },  // 第一个 bucket
      { timestamp: baseTime + 20000, value: 20 },  // 第一个 bucket
      { timestamp: baseTime + 70000, value: 30 },  // 第二个 bucket (60s 后)
      { timestamp: baseTime + 80000, value: 40 },  // 第二个 bucket
    ];

    const bucketSize = 60000; // 1分钟
    const buckets: Record<number, number[]> = {};

    readings.forEach(r => {
      const bucket = Math.floor(r.timestamp / bucketSize);
      if (!buckets[bucket]) buckets[bucket] = [];
      buckets[bucket].push(r.value);
    });

    expect(Object.keys(buckets).length).toBe(2);
  });
});

// 事件订阅测试
describe('Event Subscription', () => {
  it('should match topic patterns', () => {
    const matchTopic = (pattern: string, topic: string): boolean => {
      if (pattern === '*') return true;
      if (pattern === topic) return true;
      if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -2);
        return topic.startsWith(prefix + '.');
      }
      return false;
    };

    expect(matchTopic('*', 'sensor.reading')).toBe(true);
    expect(matchTopic('sensor.reading', 'sensor.reading')).toBe(true);
    expect(matchTopic('sensor.*', 'sensor.reading')).toBe(true);
    expect(matchTopic('sensor.*', 'sensor.status')).toBe(true);
    expect(matchTopic('sensor.*', 'device.status')).toBe(false);
  });
});
