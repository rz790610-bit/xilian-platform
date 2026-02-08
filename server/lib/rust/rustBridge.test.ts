/**
 * Rust 模块桥接层单元测试
 * 西联智能平台 - 信号处理和数据聚合功能测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SignalProcessor,
  TimeWindowAggregator,
  StreamAggregator,
  FilterType,
  WindowConfig,
} from './rustBridge';

// ============================================
// 信号处理器测试
// ============================================

describe('SignalProcessor', () => {
  let processor: SignalProcessor;

  beforeEach(() => {
    processor = new SignalProcessor(1000); // 1kHz 采样率
  });

  describe('创建和配置', () => {
    it('应该成功创建信号处理器', () => {
      expect(processor).toBeDefined();
    });

    it('应该拒绝无效的采样率', () => {
      expect(() => new SignalProcessor(-1)).toThrow();
      expect(() => new SignalProcessor(0)).toThrow();
    });

    it('应该支持设置 FFT 大小', () => {
      const p = new SignalProcessor(1000).setFftSize(512);
      expect(p).toBeDefined();
    });
  });

  describe('滤波器', () => {
    const testSignal = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    it('应该应用移动平均滤波', () => {
      const filter: FilterType = { type: 'movingAverage', windowSize: 3 };
      const result = processor.applyFilter(testSignal, filter);
      
      expect(result).toHaveLength(testSignal.length);
      expect(result[0]).toBeCloseTo(2, 1); // (1+2+3)/3
    });

    it('应该应用指数移动平均滤波', () => {
      const filter: FilterType = { type: 'exponentialMovingAverage', alpha: 0.5 };
      const result = processor.applyFilter(testSignal, filter);
      
      expect(result).toHaveLength(testSignal.length);
      expect(result[0]).toBe(1);
    });

    it('应该应用中值滤波', () => {
      const filter: FilterType = { type: 'median', windowSize: 3 };
      const result = processor.applyFilter(testSignal, filter);
      
      expect(result).toHaveLength(testSignal.length);
    });

    it('应该应用低通滤波', () => {
      const filter: FilterType = { type: 'lowPass', cutoff: 100 };
      const result = processor.applyFilter(testSignal, filter);
      
      expect(result).toHaveLength(testSignal.length);
    });

    it('应该应用高通滤波', () => {
      const filter: FilterType = { type: 'highPass', cutoff: 100 };
      const result = processor.applyFilter(testSignal, filter);
      
      expect(result).toHaveLength(testSignal.length);
    });

    it('应该应用带通滤波', () => {
      const filter: FilterType = { type: 'bandPass', low: 50, high: 200 };
      const result = processor.applyFilter(testSignal, filter);
      
      expect(result).toHaveLength(testSignal.length);
    });

    it('应该应用带阻滤波', () => {
      const filter: FilterType = { type: 'bandStop', low: 50, high: 200 };
      const result = processor.applyFilter(testSignal, filter);
      
      expect(result).toHaveLength(testSignal.length);
    });

    it('移动平均应该拒绝过短的信号', () => {
      const filter: FilterType = { type: 'movingAverage', windowSize: 20 };
      expect(() => processor.applyFilter(testSignal, filter)).toThrow();
    });

    it('指数移动平均应该拒绝无效的 alpha', () => {
      const filter: FilterType = { type: 'exponentialMovingAverage', alpha: 1.5 };
      expect(() => processor.applyFilter(testSignal, filter)).toThrow();
    });
  });

  describe('统计分析', () => {
    it('应该计算基本统计指标', () => {
      const signal = [1, 2, 3, 4, 5];
      const stats = processor.calculateStatistics(signal);
      
      expect(stats.count).toBe(5);
      expect(stats.mean).toBeCloseTo(3, 10);
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(5);
      expect(stats.range).toBe(4);
    });

    it('应该计算方差和标准差', () => {
      const signal = [2, 4, 4, 4, 5, 5, 7, 9];
      const stats = processor.calculateStatistics(signal);
      
      expect(stats.variance).toBeGreaterThan(0);
      expect(stats.stdDev).toBeCloseTo(Math.sqrt(stats.variance), 10);
    });

    it('应该计算中位数和四分位数', () => {
      const signal = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const stats = processor.calculateStatistics(signal);
      
      expect(stats.median).toBeCloseTo(5.5, 1);
      expect(stats.q1).toBeDefined();
      expect(stats.q3).toBeDefined();
      expect(stats.iqr).toBe(stats.q3 - stats.q1);
    });

    it('应该计算 RMS 和波峰因子', () => {
      const signal = [1, 2, 3, 4, 5];
      const stats = processor.calculateStatistics(signal);
      
      expect(stats.rms).toBeGreaterThan(0);
      expect(stats.crestFactor).toBeGreaterThan(0);
    });

    it('应该拒绝空信号', () => {
      expect(() => processor.calculateStatistics([])).toThrow();
    });
  });

  describe('FFT 分析', () => {
    it('应该执行 FFT 分析', () => {
      // 生成 50Hz 正弦波
      const signal = Array.from({ length: 1024 }, (_, i) =>
        Math.sin(2 * Math.PI * 50 * i / 1000)
      );
      const result = processor.fftAnalysis(signal);
      
      expect(result.frequencies).toBeDefined();
      expect(result.magnitudes).toBeDefined();
      expect(result.phases).toBeDefined();
      expect(result.powerSpectrum).toBeDefined();
      expect(result.dominantFrequency).toBeDefined();
      expect(result.totalPower).toBeGreaterThan(0);
    });

    it('应该检测主频', () => {
      // 生成 100Hz 正弦波
      const signal = Array.from({ length: 1024 }, (_, i) =>
        Math.sin(2 * Math.PI * 100 * i / 1000)
      );
      const result = processor.fftAnalysis(signal);
      
      // 主频应该接近 100Hz
      expect(Math.abs(result.dominantFrequency - 100)).toBeLessThan(10);
    });
  });

  describe('异常检测', () => {
    const history = [1, 2, 3, 4, 5, 4, 3, 2, 1, 2];

    it('Z-Score 应该检测正常值', () => {
      const result = processor.detectAnomalyZScore(3, history, 2);
      
      expect(result.isAnomaly).toBe(false);
      expect(result.method).toBe('Z-Score');
      expect(result.score).toBeLessThan(result.threshold);
    });

    it('Z-Score 应该检测异常值', () => {
      const result = processor.detectAnomalyZScore(100, history, 2);
      
      expect(result.isAnomaly).toBe(true);
      expect(result.score).toBeGreaterThan(result.threshold);
    });

    it('IQR 应该检测正常值', () => {
      const result = processor.detectAnomalyIQR(3, history, 1.5);
      
      expect(result.isAnomaly).toBe(false);
      expect(result.method).toBe('IQR');
    });

    it('IQR 应该检测异常值', () => {
      const result = processor.detectAnomalyIQR(100, history, 1.5);
      
      expect(result.isAnomaly).toBe(true);
    });
  });

  describe('特征提取', () => {
    it('应该提取时域特征', () => {
      const signal = Array.from({ length: 1024 }, (_, i) =>
        Math.sin(2 * Math.PI * 50 * i / 1000) + Math.random() * 0.1
      );
      const features = processor.extractFeatures(signal);
      
      expect(features.timeDomain).toBeDefined();
      expect(features.timeDomain.mean).toBeDefined();
      expect(features.timeDomain.stdDev).toBeDefined();
      expect(features.timeDomain.rms).toBeDefined();
      expect(features.timeDomain.peak).toBeDefined();
      expect(features.timeDomain.zeroCrossings).toBeGreaterThan(0);
    });

    it('应该提取频域特征', () => {
      const signal = Array.from({ length: 1024 }, (_, i) =>
        Math.sin(2 * Math.PI * 50 * i / 1000)
      );
      const features = processor.extractFeatures(signal);
      
      expect(features.frequencyDomain).toBeDefined();
      expect(features.frequencyDomain.dominantFrequency).toBeDefined();
      expect(features.frequencyDomain.spectralCentroid).toBeDefined();
      expect(features.frequencyDomain.spectralBandwidth).toBeDefined();
      expect(features.frequencyDomain.bandPowers).toHaveLength(8);
    });
  });
});

// ============================================
// 时间窗口聚合器测试
// ============================================

describe('TimeWindowAggregator', () => {
  describe('滚动窗口', () => {
    it('应该创建滚动窗口聚合器', () => {
      const config: WindowConfig = {
        windowType: 'tumbling',
        windowSizeMs: 1000,
      };
      const aggregator = new TimeWindowAggregator(config);
      expect(aggregator).toBeDefined();
    });

    it('应该聚合数据点', () => {
      const config: WindowConfig = {
        windowType: 'tumbling',
        windowSizeMs: 1000,
      };
      const aggregator = new TimeWindowAggregator(config);
      
      aggregator.addValue(100, 1);
      aggregator.addValue(200, 2);
      aggregator.addValue(300, 3);
      
      const result = aggregator.getCurrentAggregate();
      expect(result).not.toBeNull();
      expect(result!.count).toBe(3);
      expect(result!.mean).toBeCloseTo(2, 10);
    });

    it('应该计算正确的统计值', () => {
      const config: WindowConfig = {
        windowType: 'tumbling',
        windowSizeMs: 1000,
      };
      const aggregator = new TimeWindowAggregator(config);
      
      aggregator.addValue(100, 10);
      aggregator.addValue(200, 20);
      aggregator.addValue(300, 30);
      aggregator.addValue(400, 40);
      aggregator.addValue(500, 50);
      
      const result = aggregator.getCurrentAggregate();
      expect(result!.sum).toBe(150);
      expect(result!.mean).toBe(30);
      expect(result!.min).toBe(10);
      expect(result!.max).toBe(50);
    });
  });

  describe('滑动窗口', () => {
    it('应该创建滑动窗口聚合器', () => {
      const config: WindowConfig = {
        windowType: 'sliding',
        windowSizeMs: 1000,
        slideSizeMs: 500,
      };
      const aggregator = new TimeWindowAggregator(config);
      expect(aggregator).toBeDefined();
    });
  });

  describe('窗口管理', () => {
    it('应该返回所有窗口的聚合结果', () => {
      const config: WindowConfig = {
        windowType: 'tumbling',
        windowSizeMs: 1000,
      };
      const aggregator = new TimeWindowAggregator(config);
      
      aggregator.addValue(100, 1);
      aggregator.addValue(1100, 2);
      aggregator.addValue(2100, 3);
      
      const results = aggregator.getAllAggregates();
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('应该支持重置', () => {
      const config: WindowConfig = {
        windowType: 'tumbling',
        windowSizeMs: 1000,
      };
      const aggregator = new TimeWindowAggregator(config);
      
      aggregator.addValue(100, 1);
      aggregator.reset();
      
      const result = aggregator.getCurrentAggregate();
      expect(result).toBeNull();
    });
  });
});

// ============================================
// 流式聚合器测试
// ============================================

describe('StreamAggregator', () => {
  it('应该创建流式聚合器', () => {
    const aggregator = new StreamAggregator(1000, 500);
    expect(aggregator).toBeDefined();
  });

  it('应该处理数据点', () => {
    const aggregator = new StreamAggregator(1000, 500);
    
    for (let i = 0; i < 10; i++) {
      aggregator.process(i * 100, i);
    }
    
    expect(aggregator.bufferSize).toBeGreaterThan(0);
  });

  it('应该在滑动间隔后发射结果', () => {
    const aggregator = new StreamAggregator(1000, 500);
    let emitted = false;
    
    for (let i = 0; i < 20; i++) {
      const result = aggregator.process(i * 100, i);
      if (result) {
        emitted = true;
        expect(result.count).toBeGreaterThan(0);
      }
    }
    
    expect(emitted).toBe(true);
  });

  it('应该支持强制刷新', () => {
    const aggregator = new StreamAggregator(1000, 500);
    
    aggregator.process(100, 1);
    aggregator.process(200, 2);
    aggregator.process(300, 3);
    
    const result = aggregator.flush();
    expect(result.count).toBe(3);
    expect(aggregator.bufferSize).toBe(0);
  });

  it('应该移除过期数据', () => {
    const aggregator = new StreamAggregator(500, 100);
    
    // 添加数据点
    aggregator.process(100, 1);
    aggregator.process(200, 2);
    aggregator.process(300, 3);
    
    // 添加超出窗口的数据点
    aggregator.process(1000, 10);
    
    // 早期数据应该被移除
    expect(aggregator.bufferSize).toBeLessThan(4);
  });
});

// ============================================
// 边界条件测试
// ============================================

describe('边界条件', () => {
  it('应该处理单个数据点', () => {
    const processor = new SignalProcessor(1000);
    const stats = processor.calculateStatistics([5]);
    
    expect(stats.count).toBe(1);
    expect(stats.mean).toBe(5);
    expect(stats.min).toBe(5);
    expect(stats.max).toBe(5);
  });

  it('应该处理相同值的信号', () => {
    const processor = new SignalProcessor(1000);
    const signal = [5, 5, 5, 5, 5];
    const stats = processor.calculateStatistics(signal);
    
    expect(stats.variance).toBe(0);
    expect(stats.stdDev).toBe(0);
  });

  it('应该处理负值信号', () => {
    const processor = new SignalProcessor(1000);
    const signal = [-5, -3, -1, 1, 3, 5];
    const stats = processor.calculateStatistics(signal);
    
    expect(stats.mean).toBeCloseTo(0, 10);
    expect(stats.min).toBe(-5);
    expect(stats.max).toBe(5);
  });

  it('应该处理大信号', () => {
    const processor = new SignalProcessor(1000);
    const signal = Array.from({ length: 10000 }, () => Math.random());
    const stats = processor.calculateStatistics(signal);
    
    expect(stats.count).toBe(10000);
    expect(stats.mean).toBeGreaterThan(0);
    expect(stats.mean).toBeLessThan(1);
  });
});
