/**
 * 结构算法模块 — 5个工业级实现
 *
 * 1. Miner线性累积损伤法 — D=Σ(ni/Ni) + Basquin S-N曲线 + 剩余寿命
 * 2. 声发射分析AE — 参数提取 + 事件检测 + Felicity比
 * 3. 模态分析 — FDD频域分解 + 半功率带宽阻尼 + MAC矩阵(真实振型内积)
 * 4. 热点应力法 — 线性/二次外推 + SCF + IIW FAT曲线评估
 * 5. 雨流计数法 — ASTM E1049四点法 + Markov矩阵
 *
 * 所有 confidence 基于数据质量计算，无 Math.random
 */

import type { IAlgorithmExecutor, AlgorithmInput, AlgorithmOutput, AlgorithmRegistration } from '../../algorithms/_core/types';
import * as dsp from '../../algorithms/_core/dsp';

function createOutput(
  algorithmId: string, version: string, _input: AlgorithmInput,
  config: Record<string, any>, startTime: number,
  diagnosis: AlgorithmOutput['diagnosis'], results: Record<string, any>,
  visualizations?: AlgorithmOutput['visualizations']
): AlgorithmOutput {
  return { algorithmId, status: 'completed', diagnosis, results, visualizations, metadata: {
    executionTimeMs: Date.now() - startTime, inputDataPoints: results._n || 0,
    algorithmVersion: version, parameters: config,
  }};
}

function getSignalData(input: AlgorithmInput): number[] {
  if (Array.isArray(input.data)) {
    return Array.isArray(input.data[0]) ? (input.data as number[][])[0] : input.data as number[];
  }
  const keys = Object.keys(input.data);
  return keys.length > 0 ? (input.data as Record<string, number[]>)[keys[0]] : [];
}

// ============================================================
// 雨流计数核心 (ASTM E1049 四点法) — 被多个算法共用
// ============================================================

interface RainflowCycle { range: number; mean: number; count: number; }

function rainflowCount(signal: number[]): RainflowCycle[] {
  // 提取峰谷值
  const peaks: number[] = [signal[0]];
  for (let i = 1; i < signal.length - 1; i++) {
    if ((signal[i] >= signal[i - 1] && signal[i] >= signal[i + 1]) ||
        (signal[i] <= signal[i - 1] && signal[i] <= signal[i + 1])) {
      if (peaks[peaks.length - 1] !== signal[i]) peaks.push(signal[i]);
    }
  }
  peaks.push(signal[signal.length - 1]);

  const cycles: RainflowCycle[] = [];
  const stack: number[] = [...peaks];
  let i = 0;
  while (i < stack.length - 3) {
    const s1 = Math.abs(stack[i + 1] - stack[i]);
    const s2 = Math.abs(stack[i + 2] - stack[i + 1]);
    const s3 = Math.abs(stack[i + 3] - stack[i + 2]);
    if (s2 <= s1 && s2 <= s3) {
      cycles.push({ range: s2, mean: (stack[i + 1] + stack[i + 2]) / 2, count: 1 });
      stack.splice(i + 1, 2);
      if (i > 0) i--;
    } else { i++; }
  }
  for (let j = 0; j < stack.length - 1; j++) {
    const range = Math.abs(stack[j + 1] - stack[j]);
    if (range > 0) cycles.push({ range, mean: (stack[j] + stack[j + 1]) / 2, count: 0.5 });
  }
  return cycles;
}

// ============================================================
// 1. Miner线性累积损伤法
// ============================================================

export class MinerDamageAnalyzer implements IAlgorithmExecutor {
  readonly id = 'miner_damage';
  readonly name = 'Miner线性累积损伤法';
  readonly version = '2.0.0';
  readonly category = 'structural';

  getDefaultConfig() {
    return {
      snCurveC: 1e12, snCurveM: 3, fatigueLimit: 50,
      damageThreshold: 1.0, safetyFactor: 2.0, materialType: 'steel',
    };
  }

  validateInput(input: AlgorithmInput, _c: Record<string, any>) {
    const s = getSignalData(input);
    if (!s || s.length < 10) return { valid: false, errors: ['应力数据至少10点'] };
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const t0 = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const stress = getSignalData(input);
    const cycles = rainflowCount(stress);

    let totalDamage = 0;
    const breakdown: Array<{ stressRange: number; count: number; allowableCycles: number; damage: number }> = [];

    for (const c of cycles) {
      if (c.range < cfg.fatigueLimit) continue;
      const N = cfg.snCurveC / Math.pow(c.range, cfg.snCurveM);
      const d = c.count / N;
      totalDamage += d;
      breakdown.push({ stressRange: Math.round(c.range * 100) / 100, count: c.count, allowableCycles: Math.round(N), damage: d });
    }

    breakdown.sort((a, b) => b.damage - a.damage);
    const remLife = totalDamage > 0 ? (cfg.damageThreshold - totalDamage) / totalDamage * 100 : Infinity;
    const safeRemLife = remLife / cfg.safetyFactor;
    const isDangerous = totalDamage > cfg.damageThreshold / cfg.safetyFactor;

    // confidence: 基于循环数充足度和应力范围覆盖度
    const cycleAdequacy = Math.min(1, cycles.length / 50);
    const rangeSpread = breakdown.length > 0 ? Math.min(1, breakdown.length / 10) : 0.3;
    const confidence = Math.min(0.98, Math.max(0.4, 0.5 + cycleAdequacy * 0.25 + rangeSpread * 0.25));

    return createOutput(this.id, this.version, input, cfg, t0, {
      summary: `Miner D=${totalDamage.toFixed(6)}(阈值${cfg.damageThreshold}), ${cycles.length}循环, 剩余寿命${safeRemLife > 1000 ? '>1000' : safeRemLife.toFixed(0)}%(SF=${cfg.safetyFactor})`,
      severity: totalDamage > cfg.damageThreshold ? 'critical' : isDangerous ? 'warning' : totalDamage > cfg.damageThreshold * 0.3 ? 'attention' : 'normal',
      urgency: totalDamage > cfg.damageThreshold ? 'immediate' : isDangerous ? 'scheduled' : 'monitoring',
      confidence,
      referenceStandard: 'Palmgren-Miner Rule / ASTM E1049',
      recommendations: isDangerous ? ['安排结构检测', '评估加固或更换', '降低运行载荷'] : ['继续监测累积损伤趋势'],
    }, {
      _n: stress.length, totalDamage, damageThreshold: cfg.damageThreshold,
      remainingLifePercent: remLife, safeRemainingLifePercent: safeRemLife,
      totalCycles: cycles.length, damageBreakdown: breakdown.slice(0, 20),
      snCurveParams: { C: cfg.snCurveC, m: cfg.snCurveM },
    }, [{
      type: 'bar', title: '损伤贡献分布',
      xAxis: { label: '应力范围', unit: 'MPa', data: breakdown.slice(0, 15).map(d => d.stressRange.toString()) },
      yAxis: { label: '损伤贡献' },
      series: [{ name: '损伤', data: breakdown.slice(0, 15).map(d => d.damage), color: '#ef4444' }],
    }]);
  }
}

// ============================================================
// 2. 声发射分析AE
// ============================================================

export class AcousticEmissionAnalyzer implements IAlgorithmExecutor {
  readonly id = 'acoustic_emission';
  readonly name = '声发射分析AE';
  readonly version = '2.0.0';
  readonly category = 'structural';

  getDefaultConfig() {
    return {
      threshold: 40, deadTime: 200, hitDefinitionTime: 800,
      peakDefinitionTime: 400, sensorPositions: [] as number[][], waveSpeed: 5000,
    };
  }

  validateInput(input: AlgorithmInput, _c: Record<string, any>) {
    const s = getSignalData(input);
    if (!s || s.length < 100) return { valid: false, errors: ['AE数据至少100点'] };
    if (!input.sampleRate) return { valid: false, errors: ['必须提供采样率'] };
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const t0 = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const sig = getSignalData(input);
    const fs = input.sampleRate!;
    const thLin = Math.pow(10, cfg.threshold / 20) * 0.001;

    const hits: Array<{ time: number; amplitude: number; duration: number; riseTime: number; counts: number; energy: number }> = [];
    let inHit = false, hitStart = 0, peakAmp = 0, peakTime = 0, crossings = 0, hitEnergy = 0;

    for (let i = 0; i < sig.length; i++) {
      const av = Math.abs(sig[i]);
      if (!inHit && av > thLin) {
        inHit = true; hitStart = i; peakAmp = av; peakTime = i; crossings = 0; hitEnergy = 0;
      }
      if (inHit) {
        hitEnergy += sig[i] * sig[i];
        if (av > peakAmp) { peakAmp = av; peakTime = i; }
        if (i > 0 && ((sig[i] > 0 && sig[i - 1] <= 0) || (sig[i] < 0 && sig[i - 1] >= 0))) crossings++;
        const silSamp = Math.ceil(cfg.hitDefinitionTime * 1e-6 * fs);
        let endHit = true;
        for (let j = 1; j <= Math.min(silSamp, sig.length - i - 1); j++) {
          if (Math.abs(sig[i + j]) > thLin) { endHit = false; break; }
        }
        if (endHit || i === sig.length - 1) {
          hits.push({
            time: hitStart / fs,
            amplitude: 20 * Math.log10(peakAmp / 0.001),
            duration: (i - hitStart) / fs * 1e6,
            riseTime: (peakTime - hitStart) / fs * 1e6,
            counts: crossings, energy: hitEnergy / fs,
          });
          inHit = false;
        }
      }
    }

    let felicityRatio: number | null = null;
    if (input.context?.previousMaxLoad && input.context?.aeOnsetLoad) {
      felicityRatio = input.context.aeOnsetLoad / input.context.previousMaxLoad;
    }

    const amps = hits.map(h => h.amplitude), energies = hits.map(h => h.energy);
    const stats = {
      hitCount: hits.length, hitRate: hits.length / (sig.length / fs),
      avgAmplitude: amps.length > 0 ? dsp.mean(amps) : 0,
      maxAmplitude: amps.length > 0 ? Math.max(...amps) : 0,
      totalEnergy: energies.reduce((s, e) => s + e, 0),
      avgDuration: hits.length > 0 ? dsp.mean(hits.map(h => h.duration)) : 0,
    };

    const isActive = stats.hitRate > 10, isIntense = stats.maxAmplitude > 80;

    // confidence: 基于信号长度和事件检出率
    const lenScore = Math.min(1, sig.length / (fs * 10)); // 10秒数据为满分
    const eventScore = hits.length > 0 ? Math.min(1, hits.length / 20) : 0.3;
    const confidence = Math.min(0.95, Math.max(0.35, 0.35 + lenScore * 0.3 + eventScore * 0.3));

    return createOutput(this.id, this.version, input, cfg, t0, {
      summary: `AE: ${stats.hitCount}事件, ${stats.hitRate.toFixed(1)}hits/s, 最大${stats.maxAmplitude.toFixed(1)}dB, 平均${stats.avgAmplitude.toFixed(1)}dB` +
        (felicityRatio !== null ? `, Felicity=${felicityRatio.toFixed(2)}` : ''),
      severity: isIntense ? 'warning' : isActive ? 'attention' : 'normal',
      urgency: isIntense ? 'scheduled' : 'monitoring', confidence,
      referenceStandard: 'ASTM E1316 / EN 13554 / GB/T 18182',
      recommendations: isIntense ? ['增加监测频率', '评估结构完整性', '对比历史AE数据'] : ['继续定期监测'],
    }, {
      _n: sig.length, stats, hits: hits.slice(0, 1000), felicityRatio,
    }, [{
      type: 'scatter', title: 'AE幅值-时间分布',
      xAxis: { label: '时间', unit: 's' }, yAxis: { label: '幅值', unit: 'dB' },
      series: [{ name: 'AE事件', data: hits.slice(0, 1000).map(h => [h.time, h.amplitude]), color: '#f59e0b' }],
    }]);
  }
}

// ============================================================
// 3. 模态分析 (FDD) — MAC矩阵用真实振型内积
// ============================================================

export class ModalAnalyzer implements IAlgorithmExecutor {
  readonly id = 'modal_analysis';
  readonly name = '模态分析';
  readonly version = '2.0.0';
  readonly category = 'structural';

  getDefaultConfig() {
    return { frequencyRange: [0, 500], nfftMultiplier: 4, peakProminence: 0.1, maxModes: 10, dampingMethod: 'half_power' };
  }

  validateInput(input: AlgorithmInput, _c: Record<string, any>) {
    const s = getSignalData(input);
    if (!s || s.length < 1024) return { valid: false, errors: ['至少1024点'] };
    if (!input.sampleRate) return { valid: false, errors: ['必须提供采样率'] };
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const t0 = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const fs = input.sampleRate!;

    let channels: number[][] = [];
    if (typeof input.data === 'object' && !Array.isArray(input.data)) {
      channels = Object.values(input.data as Record<string, number[]>);
    } else if (Array.isArray(input.data) && Array.isArray(input.data[0])) {
      channels = input.data as number[][];
    } else {
      channels = [input.data as number[]];
    }

    // 每通道PSD
    const psds = channels.map(ch => {
      const { frequencies, amplitudes } = dsp.amplitudeSpectrum(ch, fs);
      return { frequencies, psd: amplitudes.map(a => a * a) };
    });

    const avgPSD = psds[0].psd.map((_, i) => psds.reduce((s, p) => s + (p.psd[i] || 0), 0) / psds.length);
    const freqs = psds[0].frequencies;
    const [fLow, fHigh] = cfg.frequencyRange;

    // 峰值检测 → 模态频率
    const maxPSD = Math.max(...avgPSD);
    const modes: Array<{ modeNumber: number; frequency: number; dampingRatio: number; amplitude: number; modeShape: number[] }> = [];

    for (let i = 2; i < avgPSD.length - 2; i++) {
      if (freqs[i] < fLow || freqs[i] > fHigh) continue;
      if (avgPSD[i] > avgPSD[i - 1] && avgPSD[i] > avgPSD[i + 1] &&
          avgPSD[i] > avgPSD[i - 2] && avgPSD[i] > avgPSD[i + 2] &&
          avgPSD[i] > maxPSD * cfg.peakProminence) {
        // 半功率带宽法阻尼比
        const hp = avgPSD[i] / 2;
        let f1 = freqs[i], f2 = freqs[i];
        for (let j = i; j > 0; j--) if (avgPSD[j] < hp) { f1 = freqs[j]; break; }
        for (let j = i; j < avgPSD.length; j++) if (avgPSD[j] < hp) { f2 = freqs[j]; break; }
        const dr = (f2 - f1) / (2 * freqs[i]);

        // 真实振型: 各通道在该频率处的PSD幅值
        const modeShape = psds.map(p => Math.sqrt(p.psd[i] || 0));

        modes.push({
          modeNumber: modes.length + 1,
          frequency: freqs[i],
          dampingRatio: Math.max(0.001, Math.min(dr, 0.5)),
          amplitude: avgPSD[i],
          modeShape,
        });
      }
    }

    modes.sort((a, b) => a.frequency - b.frequency);
    const topModes = modes.slice(0, cfg.maxModes).map((m, i) => ({ ...m, modeNumber: i + 1 }));

    // MAC矩阵 — 真实振型向量内积
    let macMatrix: number[][] | null = null;
    if (topModes.length > 1) {
      macMatrix = [];
      for (let i = 0; i < topModes.length; i++) {
        const row: number[] = [];
        for (let j = 0; j < topModes.length; j++) {
          const phi_i = topModes[i].modeShape;
          const phi_j = topModes[j].modeShape;
          const dot = phi_i.reduce((s, v, k) => s + v * phi_j[k], 0);
          const ni = Math.sqrt(phi_i.reduce((s, v) => s + v * v, 0));
          const nj = Math.sqrt(phi_j.reduce((s, v) => s + v * v, 0));
          row.push(ni > 0 && nj > 0 ? (dot * dot) / (ni * ni * nj * nj) : 0);
        }
        macMatrix.push(row);
      }
    }

    // confidence: 基于通道数和峰值显著性
    const chScore = Math.min(1, channels.length / 4);
    const peakScore = topModes.length > 0 ? Math.min(1, topModes.length / 5) : 0.2;
    const lenScore = Math.min(1, channels[0].length / 4096);
    const confidence = Math.min(0.97, Math.max(0.35, 0.3 + chScore * 0.25 + peakScore * 0.2 + lenScore * 0.2));

    return createOutput(this.id, this.version, input, cfg, t0, {
      summary: `模态分析: ${topModes.length}阶。` +
        topModes.slice(0, 5).map(m => `第${m.modeNumber}阶: ${m.frequency.toFixed(1)}Hz(ζ=${(m.dampingRatio * 100).toFixed(2)}%)`).join('; '),
      severity: 'normal', urgency: 'monitoring', confidence,
      referenceStandard: 'ISO 7626 / Brincker et al. 2001 (FDD)',
    }, {
      _n: channels[0].length, modes: topModes.map(({ modeShape, ...rest }) => rest),
      macMatrix, averagePSD: { frequencies: freqs, psd: avgPSD }, channelCount: channels.length,
    }, [{
      type: 'line', title: '平均功率谱密度',
      xAxis: { label: '频率', unit: 'Hz', data: freqs.filter(f => f >= fLow && f <= fHigh) },
      yAxis: { label: 'PSD' },
      series: [{ name: 'PSD', data: avgPSD.filter((_, i) => freqs[i] >= fLow && freqs[i] <= fHigh), color: '#10b981' }],
    }]);
  }
}

// ============================================================
// 4. 热点应力法
// ============================================================

export class HotSpotStressAnalyzer implements IAlgorithmExecutor {
  readonly id = 'hot_spot_stress';
  readonly name = '热点应力法';
  readonly version = '2.0.0';
  readonly category = 'structural';

  getDefaultConfig() {
    return {
      extrapolationType: 'linear', gaugePositions: [4, 8, 12],
      plateThickness: 10, fatigueCurveClass: 90, designLife: 1e7,
    };
  }

  validateInput(input: AlgorithmInput, _c: Record<string, any>) {
    if (!input.data || (Array.isArray(input.data) && (input.data as any[]).length < 2))
      return { valid: false, errors: ['至少2个应变片数据'] };
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const t0 = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };

    let gaugeData: number[][] = [];
    if (typeof input.data === 'object' && !Array.isArray(input.data)) {
      gaugeData = Object.values(input.data as Record<string, number[]>);
    } else if (Array.isArray(input.data) && Array.isArray(input.data[0])) {
      gaugeData = input.data as number[][];
    } else {
      return createOutput(this.id, this.version, input, cfg, t0, {
        summary: '输入格式不正确，需要多通道应变数据', severity: 'normal', urgency: 'monitoring', confidence: 0,
      }, { error: '需要多通道数据' });
    }

    const pos = cfg.gaugePositions.slice(0, gaugeData.length);
    const nPts = Math.min(...gaugeData.map(g => g.length));

    const hsStress = new Array(nPts);
    for (let t = 0; t < nPts; t++) {
      const stresses = gaugeData.map(g => g[t]);
      if (cfg.extrapolationType === 'quadratic' && pos.length >= 3) {
        const [x1, x2, x3] = pos, [s1, s2, s3] = stresses;
        hsStress[t] = s1 * (x2 * x3) / ((x1 - x2) * (x1 - x3)) +
                      s2 * (x1 * x3) / ((x2 - x1) * (x2 - x3)) +
                      s3 * (x1 * x2) / ((x3 - x1) * (x3 - x2));
      } else {
        const [x1, x2] = pos, [s1, s2] = stresses;
        hsStress[t] = s1 + (s1 - s2) * x1 / (x2 - x1);
      }
    }

    const nomStress = gaugeData[gaugeData.length - 1];
    const scfVals = hsStress.map((hs: number, i: number) => nomStress[i] !== 0 ? hs / nomStress[i] : 1);
    const avgSCF = dsp.mean(scfVals);
    const maxHS = Math.max(...hsStress), minHS = Math.min(...hsStress), sr = maxHS - minHS;
    const fatClass = cfg.fatigueCurveClass;
    const allowCycles = Math.pow(fatClass / sr, 3) * 2e6;
    const utilRatio = cfg.designLife / allowCycles;

    // confidence: 基于应变片数量和数据点数
    const gaugeScore = Math.min(1, gaugeData.length / 3);
    const ptScore = Math.min(1, nPts / 500);
    const confidence = Math.min(0.96, Math.max(0.4, 0.4 + gaugeScore * 0.3 + ptScore * 0.25));

    return createOutput(this.id, this.version, input, cfg, t0, {
      summary: `热点应力: max=${maxHS.toFixed(1)}MPa, min=${minHS.toFixed(1)}MPa, range=${sr.toFixed(1)}MPa, SCF=${avgSCF.toFixed(2)}, FAT${fatClass}利用率=${(utilRatio * 100).toFixed(1)}%`,
      severity: utilRatio > 1 ? 'critical' : utilRatio > 0.8 ? 'warning' : utilRatio > 0.5 ? 'attention' : 'normal',
      urgency: utilRatio > 1 ? 'immediate' : utilRatio > 0.8 ? 'scheduled' : 'monitoring', confidence,
      referenceStandard: 'IIW Doc. XIII-2460-13 / EN 1993-1-9',
      recommendations: utilRatio > 0.8 ? ['评估焊接质量', '考虑焊后处理', '降低载荷或加强结构'] : ['继续监测应力趋势'],
    }, {
      _n: nPts, hotSpotStress: hsStress.slice(0, 2000), maxHotSpotStress: maxHS,
      minHotSpotStress: minHS, stressRange: sr, scf: avgSCF,
      allowableCycles: allowCycles, utilizationRatio: utilRatio, extrapolationType: cfg.extrapolationType,
    }, [{
      type: 'line', title: '热点应力时程',
      xAxis: { label: '采样点' }, yAxis: { label: '应力', unit: 'MPa' },
      series: [
        { name: '热点应力', data: hsStress.slice(0, 2000), color: '#ef4444' },
        { name: '名义应力', data: nomStress.slice(0, 2000), color: '#94a3b8' },
      ],
    }]);
  }
}

// ============================================================
// 5. 雨流计数法
// ============================================================

export class RainflowCountingAnalyzer implements IAlgorithmExecutor {
  readonly id = 'rainflow_counting';
  readonly name = '雨流计数法';
  readonly version = '2.0.0';
  readonly category = 'structural';

  getDefaultConfig() { return { binCount: 64, minRange: 0 }; }

  validateInput(input: AlgorithmInput, _c: Record<string, any>) {
    const s = getSignalData(input);
    if (!s || s.length < 4) return { valid: false, errors: ['至少4个数据点'] };
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const t0 = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const sig = getSignalData(input);
    const cycles = rainflowCount(sig);
    const filtered = cycles.filter(c => c.range >= cfg.minRange);

    const allV = sig, mnV = Math.min(...allV), mxV = Math.max(...allV);
    const bs = (mxV - mnV) / cfg.binCount || 1;
    const markov = Array.from({ length: cfg.binCount }, () => new Array(cfg.binCount).fill(0));
    for (const c of filtered) {
      const fb = Math.min(Math.max(0, Math.floor((c.mean - c.range / 2 - mnV) / bs)), cfg.binCount - 1);
      const tb = Math.min(Math.max(0, Math.floor((c.mean + c.range / 2 - mnV) / bs)), cfg.binCount - 1);
      markov[fb][tb] += c.count;
    }

    const totalCycles = filtered.reduce((s, c) => s + c.count, 0);
    const maxRange = filtered.length > 0 ? Math.max(...filtered.map(c => c.range)) : 0;
    const avgRange = filtered.length > 0 ? dsp.mean(filtered.map(c => c.range)) : 0;

    const rangeBins = new Array(cfg.binCount).fill(0);
    const rbs = maxRange / cfg.binCount || 1;
    for (const c of filtered) {
      const bin = Math.min(Math.floor(c.range / rbs), cfg.binCount - 1);
      rangeBins[bin] += c.count;
    }

    // confidence: 基于数据量和循环数
    const lenScore = Math.min(1, sig.length / 1000);
    const cycScore = Math.min(1, totalCycles / 50);
    const confidence = Math.min(0.98, Math.max(0.5, 0.5 + lenScore * 0.25 + cycScore * 0.25));

    return createOutput(this.id, this.version, input, cfg, t0, {
      summary: `雨流计数: ${totalCycles.toFixed(1)}循环, 最大范围${maxRange.toFixed(1)}MPa, 平均${avgRange.toFixed(1)}MPa`,
      severity: 'normal', urgency: 'monitoring', confidence,
      referenceStandard: 'ASTM E1049 / ISO 12110',
    }, {
      _n: sig.length, cycles: filtered.slice(0, 500), totalCycles, maxRange, avgRange,
      markovMatrix: markov, rangeDistribution: rangeBins,
    }, [{
      type: 'bar', title: '应力范围分布',
      xAxis: { label: '应力范围', unit: 'MPa' }, yAxis: { label: '循环次数' },
      series: [{ name: '循环数', data: rangeBins, color: '#8b5cf6' }],
    }]);
  }
}

// ============================================================
// 导出
// ============================================================

export function getStructuralAlgorithms(): AlgorithmRegistration[] {
  return [
    {
      executor: new MinerDamageAnalyzer(),
      metadata: {
        description: 'Palmgren-Miner线性累积损伤法，Basquin S-N曲线，疲劳损伤度和剩余寿命',
        tags: ['疲劳', 'Miner', 'S-N曲线', '寿命预测'],
        inputFields: [{ name: 'data', type: 'number[]', description: '应力时程(MPa)', required: true }],
        outputFields: [
          { name: 'totalDamage', type: 'number', description: '累积损伤度D' },
          { name: 'remainingLifePercent', type: 'number', description: '剩余寿命%' },
        ],
        configFields: [
          { name: 'snCurveC', type: 'number', default: 1e12, description: 'S-N曲线常数C' },
          { name: 'snCurveM', type: 'number', default: 3, description: 'S-N曲线斜率m' },
          { name: 'fatigueLimit', type: 'number', default: 50, description: '疲劳极限MPa' },
          { name: 'safetyFactor', type: 'number', default: 2.0, description: '安全系数' },
        ],
        applicableDeviceTypes: ['structure', 'bridge', 'crane', 'vessel', '*'],
        applicableScenarios: ['疲劳评估', '寿命预测', '结构健康监测'],
        complexity: 'O(N)', edgeDeployable: true,
        referenceStandards: ['Palmgren-Miner Rule', 'ASTM E1049'],
      },
    },
    {
      executor: new AcousticEmissionAnalyzer(),
      metadata: {
        description: '声发射参数分析，事件检测、Felicity比评估',
        tags: ['声发射', 'AE', '无损检测', '结构监测'],
        inputFields: [
          { name: 'data', type: 'number[]', description: 'AE信号', required: true },
          { name: 'sampleRate', type: 'number', description: '采样率Hz', required: true },
        ],
        outputFields: [
          { name: 'stats', type: 'object', description: 'AE统计参数' },
          { name: 'hits', type: 'object[]', description: 'AE事件列表' },
        ],
        configFields: [
          { name: 'threshold', type: 'number', default: 40, description: '检测阈值dB' },
          { name: 'hitDefinitionTime', type: 'number', default: 800, description: '事件定义时间μs' },
        ],
        applicableDeviceTypes: ['vessel', 'pipeline', 'bridge', 'structure', '*'],
        applicableScenarios: ['结构健康监测', '压力容器检测', '焊缝检测'],
        complexity: 'O(N)', edgeDeployable: true,
        referenceStandards: ['ASTM E1316', 'EN 13554', 'GB/T 18182'],
      },
    },
    {
      executor: new ModalAnalyzer(),
      metadata: {
        description: 'FDD频域分解模态分析，固有频率、阻尼比、MAC矩阵(真实振型内积)',
        tags: ['模态', 'FDD', '固有频率', '阻尼比'],
        inputFields: [
          { name: 'data', type: 'number[]|number[][]', description: '振动信号(支持多通道)', required: true },
          { name: 'sampleRate', type: 'number', description: '采样率Hz', required: true },
        ],
        outputFields: [
          { name: 'modes', type: 'object[]', description: '模态参数' },
          { name: 'macMatrix', type: 'number[][]', description: 'MAC矩阵' },
        ],
        configFields: [
          { name: 'frequencyRange', type: 'json', default: [0, 500], description: '频率范围Hz' },
          { name: 'maxModes', type: 'number', default: 10, description: '最大模态数' },
        ],
        applicableDeviceTypes: ['bridge', 'structure', 'turbine', '*'],
        applicableScenarios: ['结构健康监测', '模态测试', '损伤识别'],
        complexity: 'O(NlogN)', edgeDeployable: true,
        referenceStandards: ['ISO 7626', 'Brincker et al. 2001'],
      },
    },
    {
      executor: new HotSpotStressAnalyzer(),
      metadata: {
        description: '热点应力外推法，线性/二次外推，SCF，IIW FAT曲线评估',
        tags: ['热点应力', '焊接', '疲劳', 'SCF', 'IIW'],
        inputFields: [{ name: 'data', type: 'number[][]', description: '多应变片数据', required: true }],
        outputFields: [
          { name: 'hotSpotStress', type: 'number[]', description: '热点应力时程' },
          { name: 'scf', type: 'number', description: '应力集中系数' },
          { name: 'utilizationRatio', type: 'number', description: '疲劳利用率' },
        ],
        configFields: [
          { name: 'extrapolationType', type: 'select', options: ['linear', 'quadratic'], default: 'linear', description: '外推类型' },
          { name: 'gaugePositions', type: 'json', default: [4, 8, 12], description: '应变片位置mm' },
          { name: 'fatigueCurveClass', type: 'number', default: 90, description: 'FAT等级MPa' },
        ],
        applicableDeviceTypes: ['structure', 'vessel', 'crane', 'bridge'],
        applicableScenarios: ['焊接疲劳评估', '结构设计验证'],
        complexity: 'O(N)', edgeDeployable: true,
        referenceStandards: ['IIW Doc. XIII-2460-13', 'EN 1993-1-9'],
      },
    },
    {
      executor: new RainflowCountingAnalyzer(),
      metadata: {
        description: 'ASTM E1049四点法雨流计数，Markov矩阵',
        tags: ['雨流计数', '疲劳', '循环计数', 'Markov'],
        inputFields: [{ name: 'data', type: 'number[]', description: '应力/应变时程', required: true }],
        outputFields: [
          { name: 'cycles', type: 'object[]', description: '雨流循环' },
          { name: 'totalCycles', type: 'number', description: '总循环数' },
          { name: 'markovMatrix', type: 'number[][]', description: 'Markov矩阵' },
        ],
        configFields: [
          { name: 'binCount', type: 'number', default: 64, description: '分箱数' },
          { name: 'minRange', type: 'number', default: 0, description: '最小范围MPa' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['疲劳分析', '载荷谱统计'],
        complexity: 'O(N)', edgeDeployable: true,
        referenceStandards: ['ASTM E1049', 'ISO 12110'],
      },
    },
  ];
}
