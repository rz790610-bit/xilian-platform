/**
 * ============================================================================
 * FIX-139: 算法库 10 分类 × 2 测试 = 20 个单元测试
 * ============================================================================
 *
 * 所有算法实现 IAlgorithmExecutor 接口:
 *   execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput>
 */
import { describe, it, expect } from 'vitest';
import type { AlgorithmInput } from '../_core/types';

// 生成正弦测试信号
function sinSignal(length: number, freq: number, sampleRate: number, amp = 1): number[] {
  return Array.from({ length }, (_, i) => amp * Math.sin(2 * Math.PI * freq * i / sampleRate));
}

function makeInput(data: number[] | number[][] | Record<string, number[]>, opts: Partial<AlgorithmInput> = {}): AlgorithmInput {
  return { data, ...opts };
}

// ============================================================================
// 1. agent-plugins
// ============================================================================
describe('agent-plugins', () => {
  it('TimeSeriesPatternExpert 检测趋势', async () => {
    const { TimeSeriesPatternExpert } = await import('../agent-plugins');
    const expert = new TimeSeriesPatternExpert();
    const rising = Array.from({ length: 200 }, (_, i) => i * 0.5 + Math.random() * 0.1);
    const input = makeInput(rising);
    const result = await expert.execute(input, expert.getDefaultConfig());
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });

  it('FusionDiagnosisExpert 融合多结果', async () => {
    const { FusionDiagnosisExpert } = await import('../agent-plugins');
    const expert = new FusionDiagnosisExpert();
    const input = makeInput([1, 2, 3], {
      context: {
        diagnosticResults: [
          { faultType: 'bearing_damage', confidence: 0.8, source: 'vibration' },
          { faultType: 'bearing_damage', confidence: 0.7, source: 'temperature' },
        ],
      },
    });
    const result = await expert.execute(input, expert.getDefaultConfig());
    expect(result.status).toBe('completed');
    expect(result.diagnosis).toBeDefined();
  });
});

// ============================================================================
// 2. anomaly
// ============================================================================
describe('anomaly', () => {
  it('IsolationForestDetector 检测异常点', async () => {
    const { IsolationForestDetector } = await import('../anomaly');
    const detector = new IsolationForestDetector();
    const data = Array.from({ length: 200 }, () => Math.random() * 2 - 1);
    data[100] = 100; data[101] = -100; // inject outliers
    const input = makeInput(data);
    const result = await detector.execute(input, detector.getDefaultConfig());
    expect(result.status).toBe('completed');
    expect(result.results.anomalyIndices || result.results.scores).toBeDefined();
  });

  it('SPCAnalyzer 统计过程控制', async () => {
    const { SPCAnalyzer } = await import('../anomaly');
    const analyzer = new SPCAnalyzer();
    const data = Array.from({ length: 100 }, () => 100 + Math.random() * 2 - 1);
    for (let i = 80; i < 100; i++) data[i] = 115; // inject shift
    const input = makeInput(data);
    const result = await analyzer.execute(input, analyzer.getDefaultConfig());
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });
});

// ============================================================================
// 3. comprehensive
// ============================================================================
describe('comprehensive', () => {
  it('DSEvidenceFusion Dempster-Shafer 融合', async () => {
    const { DSEvidenceFusion } = await import('../comprehensive');
    const fusion = new DSEvidenceFusion();
    const input = makeInput([1], {
      context: {
        evidences: [
          { frameOfDiscernment: ['fault', 'normal'], masses: { fault: 0.7, normal: 0.1, theta: 0.2 } },
          { frameOfDiscernment: ['fault', 'normal'], masses: { fault: 0.6, normal: 0.2, theta: 0.2 } },
        ],
      },
    });
    const result = await fusion.execute(input, fusion.getDefaultConfig());
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });

  it('CausalInference Granger 因果检验', async () => {
    const { CausalInference } = await import('../comprehensive');
    const inference = new CausalInference();
    const x = Array.from({ length: 200 }, () => Math.random());
    const y = x.map((_, i) => (i > 2 ? x[i - 2] * 0.8 + Math.random() * 0.2 : Math.random()));
    const input = makeInput({ x, y });
    const result = await inference.execute(input, { ...inference.getDefaultConfig(), maxLag: 5 });
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });
});

// ============================================================================
// 4. electrical
// ============================================================================
describe('electrical', () => {
  it('MCSAAnalyzer 电机电流特征分析', async () => {
    const { MCSAAnalyzer } = await import('../electrical');
    const analyzer = new MCSAAnalyzer();
    const sr = 10000;
    const signal = sinSignal(10000, 50, sr, 10);
    const input = makeInput(signal, { sampleRate: sr });
    const result = await analyzer.execute(input, { ...analyzer.getDefaultConfig(), lineFrequency: 50, poles: 4 });
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });

  it('PowerQualityAnalyzer 电力质量分析', async () => {
    const { PowerQualityAnalyzer } = await import('../electrical');
    const analyzer = new PowerQualityAnalyzer();
    const sr = 10000;
    const input = makeInput({
      voltageA: sinSignal(10000, 50, sr, 220),
      voltageB: sinSignal(10000, 50, sr, 220),
      voltageC: sinSignal(10000, 50, sr, 220),
      currentA: sinSignal(10000, 50, sr, 10),
      currentB: sinSignal(10000, 50, sr, 10),
      currentC: sinSignal(10000, 50, sr, 10),
    }, { sampleRate: sr });
    const result = await analyzer.execute(input, { ...analyzer.getDefaultConfig(), fundamentalFreq: 50 });
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });
});

// ============================================================================
// 5. feature-extraction
// ============================================================================
describe('feature-extraction', () => {
  it('TimeDomainFeatureExtractor 时域特征', async () => {
    const { TimeDomainFeatureExtractor } = await import('../feature-extraction');
    const extractor = new TimeDomainFeatureExtractor();
    const signal = sinSignal(1024, 10, 1000);
    const input = makeInput(signal, { sampleRate: 1000 });
    const result = await extractor.execute(input, extractor.getDefaultConfig());
    expect(result.status).toBe('completed');
    expect(result.results.mean !== undefined || result.results.rms !== undefined).toBe(true);
  });

  it('FrequencyDomainFeatureExtractor 频域特征', async () => {
    const { FrequencyDomainFeatureExtractor } = await import('../feature-extraction');
    const extractor = new FrequencyDomainFeatureExtractor();
    const signal = sinSignal(1024, 50, 1000);
    const input = makeInput(signal, { sampleRate: 1000 });
    const result = await extractor.execute(input, extractor.getDefaultConfig());
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });
});

// ============================================================================
// 6. mechanical
// ============================================================================
describe('mechanical', () => {
  it('FFTSpectrumAnalyzer 频谱分析', async () => {
    const mod = await import('../mechanical');
    const analyzer = new mod.FFTSpectrumAnalyzer();
    const sr = 4096;
    const signal = Array.from({ length: 4096 }, (_, i) =>
      Math.sin(2 * Math.PI * 25 * i / sr) + 0.3 * Math.sin(2 * Math.PI * 100 * i / sr)
    );
    const input = makeInput(signal, { sampleRate: sr, equipment: { type: 'motor', ratedSpeed: 1500 } });
    const result = await analyzer.execute(input, { ...analyzer.getDefaultConfig(), rpm: 1500 });
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });

  it('EnvelopeDemodAnalyzer 包络解调', async () => {
    const mod = await import('../mechanical');
    const analyzer = new mod.EnvelopeDemodAnalyzer();
    const sr = 8192;
    const signal = Array.from({ length: 8192 }, (_, i) =>
      (1 + 0.5 * Math.sin(2 * Math.PI * 150 * i / sr)) * Math.sin(2 * Math.PI * 3000 * i / sr)
    );
    const input = makeInput(signal, { sampleRate: sr });
    const result = await analyzer.execute(input, analyzer.getDefaultConfig());
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });
});

// ============================================================================
// 7. model-iteration
// ============================================================================
describe('model-iteration', () => {
  it('FullRetraining MLP 训练', async () => {
    const { FullRetraining } = await import('../model-iteration');
    const trainer = new FullRetraining();
    const features = Array.from({ length: 20 }, (_, i) => [Math.sin(i), Math.cos(i)]);
    const labels = features.map(f => (f[0] > 0 ? 1 : 0));
    const input = makeInput([1], {
      context: { trainingData: { features, labels } },
    });
    const result = await trainer.execute(input, { ...trainer.getDefaultConfig(), hiddenLayers: [8], epochs: 10 });
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });

  it('IncrementalLearning 增量学习', async () => {
    const { IncrementalLearning } = await import('../model-iteration');
    const learner = new IncrementalLearning();
    const oldFeatures = Array.from({ length: 20 }, (_, i) => [Math.sin(i), Math.cos(i)]);
    const oldLabels = oldFeatures.map(f => (f[0] > 0 ? 1 : 0));
    const newFeatures = Array.from({ length: 10 }, (_, i) => [Math.sin(i + 20), Math.cos(i + 20)]);
    const newLabels = newFeatures.map(f => (f[0] > 0 ? 1 : 0));
    const input = makeInput([1], {
      context: {
        oldData: { features: oldFeatures, labels: oldLabels },
        newData: { features: newFeatures, labels: newLabels },
      },
    });
    const result = await learner.execute(input, { ...learner.getDefaultConfig(), method: 'ewc', epochs: 3 });
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });
});

// ============================================================================
// 8. optimization
// ============================================================================
describe('optimization', () => {
  it('PSOOptimizer 粒子群优化', async () => {
    const { PSOOptimizer } = await import('../optimization');
    const optimizer = new PSOOptimizer();
    // Sphere function: data represents bounds
    const input = makeInput([[-5, 5], [-5, 5]], {
      context: {
        objectiveFunction: 'sphere', // x[0]^2 + x[1]^2
      },
    });
    const result = await optimizer.execute(input, { ...optimizer.getDefaultConfig(), swarmSize: 20, maxIterations: 50 });
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });

  it('GeneticAlgorithm 遗传算法', async () => {
    const { GeneticAlgorithm } = await import('../optimization');
    const ga = new GeneticAlgorithm();
    const input = makeInput([[-5, 5], [-5, 5]], {
      context: { objectiveFunction: 'sphere' },
    });
    const result = await ga.execute(input, { ...ga.getDefaultConfig(), populationSize: 20, generations: 30 });
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });
});

// ============================================================================
// 9. rule-learning
// ============================================================================
describe('rule-learning', () => {
  it('AssociationRuleLearning 关联规则', async () => {
    const { AssociationRuleLearning } = await import('../rule-learning');
    const learner = new AssociationRuleLearning();
    const input = makeInput([1], {
      context: {
        transactions: [
          ['high_vibration', 'bearing_fault'],
          ['high_vibration', 'high_temp', 'bearing_fault'],
          ['high_temp', 'electrical_fault'],
          ['high_vibration', 'bearing_fault'],
        ],
      },
    });
    const result = await learner.execute(input, { ...learner.getDefaultConfig(), minSupport: 0.3, minConfidence: 0.5 });
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });

  it('DecisionTreeInduction 决策树', async () => {
    const { DecisionTreeInduction } = await import('../rule-learning');
    const inducer = new DecisionTreeInduction();
    const input = makeInput([1], {
      context: {
        trainingData: {
          features: [[7.5, 85], [2.0, 40], [8.0, 90], [1.5, 38], [6.0, 80]],
          labels: [1, 0, 1, 0, 2],
          featureNames: ['vibration', 'temperature'],
          labelNames: ['normal', 'fault', 'attention'],
        },
      },
    });
    const result = await inducer.execute(input, { ...inducer.getDefaultConfig(), maxDepth: 3 });
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });
});

// ============================================================================
// 10. structural
// ============================================================================
describe('structural', () => {
  it('MinerDamageAnalyzer 疲劳累积损伤', async () => {
    const { MinerDamageAnalyzer } = await import('../structural');
    const analyzer = new MinerDamageAnalyzer();
    const stressData = Array.from({ length: 500 }, (_, i) =>
      50 + 30 * Math.sin(2 * Math.PI * i / 50) + Math.random() * 5
    );
    const input = makeInput(stressData);
    const result = await analyzer.execute(input, analyzer.getDefaultConfig());
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });

  it('RainflowCountingAnalyzer 雨流计数', async () => {
    const { RainflowCountingAnalyzer } = await import('../structural');
    const counter = new RainflowCountingAnalyzer();
    const signal = Array.from({ length: 500 }, (_, i) =>
      50 + 30 * Math.sin(2 * Math.PI * i / 50) + 15 * Math.sin(2 * Math.PI * i / 17)
    );
    const input = makeInput(signal);
    const result = await counter.execute(input, counter.getDefaultConfig());
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });
});
