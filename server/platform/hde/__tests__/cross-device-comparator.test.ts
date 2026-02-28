/**
 * CrossDeviceComparator 单元测试
 *
 * 测试命令: npx vitest run server/platform/hde/__tests__/cross-device-comparator.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CrossDeviceComparator,
  createCrossDeviceComparator,
  type CrossDeviceCompareRequest,
  type DeviceMetricData,
} from '../comparator';

describe('CrossDeviceComparator', () => {
  let comparator: CrossDeviceComparator;

  beforeEach(() => {
    comparator = createCrossDeviceComparator();
  });

  describe('基础功能', () => {
    it('应该成功创建实例', () => {
      expect(comparator).toBeInstanceOf(CrossDeviceComparator);
    });

    it('应该能生成模拟数据', () => {
      const request: CrossDeviceCompareRequest = {
        deviceCodes: ['CRANE-001', 'CRANE-002', 'CRANE-003'],
        metricName: 'vibration_rms',
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-02'),
        },
        dataSource: 'mock',
      };

      const mockData = comparator.generateMockData(request);

      expect(mockData).toHaveLength(3);
      expect(mockData[0].deviceCode).toBe('CRANE-001');
      expect(mockData[0].values.length).toBeGreaterThan(0);
      expect(mockData[0].timestamps.length).toBe(mockData[0].values.length);
    });
  });

  describe('跨设备对比', () => {
    it('应该完成基本的跨设备对比', async () => {
      const request: CrossDeviceCompareRequest = {
        deviceCodes: ['CRANE-001', 'CRANE-002', 'CRANE-003'],
        metricName: 'vibration_rms',
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-02'),
        },
        dataSource: 'mock',
      };

      const result = await comparator.compare(request);

      // 验证结果结构
      expect(result.request.deviceCount).toBe(3);
      expect(result.request.metricName).toBe('vibration_rms');

      // 验证排名
      expect(result.rankings).toHaveLength(3);
      expect(result.rankings[0].rank).toBe(1);
      expect(result.rankings[0].healthScore).toBeGreaterThanOrEqual(0);
      expect(result.rankings[0].healthScore).toBeLessThanOrEqual(100);

      // 验证群体统计
      expect(result.fleetStats.deviceCount).toBe(3);
      expect(result.fleetStats.meanAnomalyRate).toBeGreaterThanOrEqual(0);

      // 验证对标分析
      expect(result.peerComparison.bestPracticeDevices.length).toBeGreaterThan(0);

      // 验证元数据
      expect(result.metadata.executionTimeMs).toBeGreaterThan(0);
      expect(result.metadata.dataSource).toBe('mock');
    });

    it('应该计算每台设备的异常率', async () => {
      const request: CrossDeviceCompareRequest = {
        deviceCodes: ['CRANE-001', 'CRANE-002', 'CRANE-003'],
        metricName: 'vibration_rms',
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-02'),
        },
        dataSource: 'mock',
      };

      const result = await comparator.compare(request);

      // 验证每台设备都有异常率计算
      for (const ranking of result.rankings) {
        expect(ranking.anomalyRate).toBeGreaterThanOrEqual(0);
        expect(ranking.anomalyRate).toBeLessThanOrEqual(1);
      }

      // 验证群体统计中的异常率统计
      expect(result.fleetStats.meanAnomalyRate).toBeGreaterThanOrEqual(0);
      expect(result.fleetStats.stdAnomalyRate).toBeGreaterThanOrEqual(0);
    });

    it('应该生成跨设备奇点', async () => {
      const request: CrossDeviceCompareRequest = {
        deviceCodes: ['CRANE-001', 'CRANE-002', 'CRANE-003'],
        metricName: 'vibration_rms',
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-02'),
        },
        dataSource: 'mock',
      };

      const result = await comparator.compare(request);

      // 应该有一些奇点（由于 mock 数据中注入了异常）
      expect(result.singularities).toBeInstanceOf(Array);

      // 如果有奇点，验证结构
      if (result.singularities.length > 0) {
        const singularity = result.singularities[0];
        expect(singularity.deviceCode).toBeDefined();
        expect(singularity.timestamp).toBeGreaterThan(0);
        expect(singularity.zScoreVsFleet).toBeDefined();
        expect(['low', 'medium', 'high', 'critical']).toContain(singularity.severity);
      }
    });

    it('应该为少于2台设备抛出错误', async () => {
      const request: CrossDeviceCompareRequest = {
        deviceCodes: ['CRANE-001'],
        metricName: 'vibration_rms',
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-02'),
        },
        dataSource: 'mock',
      };

      await expect(comparator.compare(request)).rejects.toThrow('至少需要2台设备');
    });
  });

  describe('排名逻辑', () => {
    it('排名应该按健康分数降序', async () => {
      const request: CrossDeviceCompareRequest = {
        deviceCodes: ['CRANE-001', 'CRANE-002', 'CRANE-003', 'CRANE-004', 'CRANE-005'],
        metricName: 'vibration_rms',
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-02'),
        },
        dataSource: 'mock',
      };

      const result = await comparator.compare(request);

      // 验证排名顺序
      for (let i = 1; i < result.rankings.length; i++) {
        expect(result.rankings[i - 1].healthScore).toBeGreaterThanOrEqual(result.rankings[i].healthScore);
        expect(result.rankings[i - 1].rank).toBeLessThan(result.rankings[i].rank);
      }
    });

    it('健康类别应该正确分配', async () => {
      const request: CrossDeviceCompareRequest = {
        deviceCodes: ['CRANE-001', 'CRANE-002'],
        metricName: 'vibration_rms',
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-02'),
        },
        dataSource: 'mock',
      };

      const result = await comparator.compare(request);

      for (const ranking of result.rankings) {
        expect(['excellent', 'normal', 'attention', 'critical']).toContain(ranking.category);

        // 验证类别与分数对应
        if (ranking.healthScore >= 90) {
          expect(ranking.category).toBe('excellent');
        } else if (ranking.healthScore >= 70) {
          expect(ranking.category).toBe('normal');
        } else if (ranking.healthScore >= 50) {
          expect(ranking.category).toBe('attention');
        } else {
          expect(ranking.category).toBe('critical');
        }
      }
    });
  });

  describe('对标分析', () => {
    it('应该正确识别最佳实践设备', async () => {
      const request: CrossDeviceCompareRequest = {
        deviceCodes: ['CRANE-001', 'CRANE-002', 'CRANE-003', 'CRANE-004', 'CRANE-005'],
        metricName: 'vibration_rms',
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-02'),
        },
        dataSource: 'mock',
      };

      const result = await comparator.compare(request);

      // 最佳实践设备应该是排名靠前的
      const topRankedCodes = result.rankings.slice(0, 2).map(r => r.deviceCode);
      for (const bestDevice of result.peerComparison.bestPracticeDevices) {
        expect(topRankedCodes).toContain(bestDevice);
      }
    });

    it('应该计算合理的基准线', async () => {
      const request: CrossDeviceCompareRequest = {
        deviceCodes: ['CRANE-001', 'CRANE-002', 'CRANE-003'],
        metricName: 'vibration_rms',
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-02'),
        },
        dataSource: 'mock',
      };

      const result = await comparator.compare(request);

      const baseline = result.peerComparison.baseline;
      expect(baseline.mean).toBeGreaterThan(0);
      expect(baseline.upperBound).toBeGreaterThan(baseline.mean);
      expect(baseline.lowerBound).toBeLessThan(baseline.mean);
    });
  });

  describe('快速健康检查', () => {
    it('应该返回排名和需关注设备', async () => {
      const result = await comparator.quickHealthCheck(
        ['CRANE-001', 'CRANE-002', 'CRANE-003'],
        'vibration_rms',
        60,
      );

      expect(result.rankings).toHaveLength(3);
      expect(result.attentionDevices).toBeInstanceOf(Array);
    });
  });
});

describe('设备指标统计', () => {
  let comparator: CrossDeviceComparator;

  beforeEach(() => {
    comparator = createCrossDeviceComparator();
  });

  it('应该正确计算每台设备的统计指标', async () => {
    const request: CrossDeviceCompareRequest = {
      deviceCodes: ['CRANE-001', 'CRANE-002'],
      metricName: 'vibration_rms',
      timeRange: {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-02'),
      },
      dataSource: 'mock',
    };

    const result = await comparator.compare(request);

    for (const ranking of result.rankings) {
      expect(ranking.stats).toBeDefined();
      expect(ranking.stats.mean).toBeGreaterThan(0);
      expect(ranking.stats.std).toBeGreaterThanOrEqual(0);
      expect(ranking.stats.min).toBeLessThanOrEqual(ranking.stats.mean);
      expect(ranking.stats.max).toBeGreaterThanOrEqual(ranking.stats.mean);
      expect(ranking.stats.dataPoints).toBeGreaterThan(0);
    }
  });
});
