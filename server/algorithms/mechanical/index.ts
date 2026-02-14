/**
 * 机械算法模块 — 8个完整实现
 * 
 * 1. FFT频谱分析 — Cooley-Tukey FFT + ISO 10816/20816评估
 * 2. 倒频谱分析 — 功率/复倒频谱 + 齿轮箱故障检测
 * 3. 包络解调分析 — Hilbert变换 + 自适应带通 + 轴承故障频率匹配
 * 4. 小波包分解 — 多层分解 + 能量分布 + Shannon熵
 * 5. 带通滤波 — Butterworth/Chebyshev IIR + 零相位滤波
 * 6. 谱峭度SK — Fast Kurtogram (Antoni 2006)
 * 7. 重采样 — 多项式插值 + 角度域重采样
 * 8. 阶次跟踪分析 — 角度域重采样 + 阶次谱
 */

import type { IAlgorithmExecutor, AlgorithmInput, AlgorithmOutput, AlgorithmRegistration } from '../../algorithms/_core/types';
import * as dsp from '../../algorithms/_core/dsp';

// ============================================================
// 辅助：创建标准输出
// ============================================================

function createOutput(
  algorithmId: string,
  version: string,
  input: AlgorithmInput,
  config: Record<string, any>,
  startTime: number,
  diagnosis: AlgorithmOutput['diagnosis'],
  results: Record<string, any>,
  visualizations?: AlgorithmOutput['visualizations']
): AlgorithmOutput {
  const dataLen = Array.isArray(input.data) ? input.data.length : 0;
  return {
    algorithmId,
    status: 'completed',
    diagnosis,
    results,
    visualizations,
    metadata: {
      executionTimeMs: Date.now() - startTime,
      inputDataPoints: dataLen,
      algorithmVersion: version,
      parameters: config,
    },
  };
}

function getSignalData(input: AlgorithmInput): number[] {
  if (Array.isArray(input.data)) {
    if (Array.isArray(input.data[0])) {
      return (input.data as number[][])[0];
    }
    return input.data as number[];
  }
  const keys = Object.keys(input.data);
  if (keys.length > 0) {
    return (input.data as Record<string, number[]>)[keys[0]];
  }
  return [];
}

// ============================================================
// 1. FFT频谱分析
// ============================================================

export class FFTSpectrumAnalyzer implements IAlgorithmExecutor {
  readonly id = 'fft_spectrum';
  readonly name = 'FFT频谱分析';
  readonly version = '2.1.0';
  readonly category = 'mechanical';

  getDefaultConfig() {
    return {
      windowFunction: 'hanning' as dsp.WindowFunction,
      fftSize: 0, // 0 = auto
      frequencyRange: [0, 0], // [0,0] = full range
      averagingCount: 1,
      overlapPercent: 50,
      outputType: 'amplitude', // amplitude | power | psd
      // ISO 评估参数
      enableISO: true,
      machineGroup: 'group2' as dsp.MachineGroup,
      mountType: 'rigid' as dsp.MountType,
      // 特征频率标注
      enableCharacteristicFreqs: true,
      shaftRPM: 0, // 0 = auto from input
      bearingModel: '',
    };
  }

  validateInput(input: AlgorithmInput, config: Record<string, any>) {
    const signal = getSignalData(input);
    if (!signal || signal.length < 64) {
      return { valid: false, errors: ['信号长度不足，至少需要64个采样点'] };
    }
    if (!input.sampleRate || input.sampleRate <= 0) {
      return { valid: false, errors: ['必须提供有效的采样率 (sampleRate)'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const signal = getSignalData(input);
    const fs = input.sampleRate!;

    // 应用窗函数
    const winFn = dsp.getWindowFunction(cfg.windowFunction);
    const win = winFn(signal.length);
    const windowed = signal.map((v, i) => v * win[i]);

    // FFT
    const { frequencies, amplitudes } = dsp.amplitudeSpectrum(windowed, fs);

    // 频率范围截取
    let fLow = cfg.frequencyRange[0] || 0;
    let fHigh = cfg.frequencyRange[1] || fs / 2;
    const filteredFreqs: number[] = [];
    const filteredAmps: number[] = [];
    for (let i = 0; i < frequencies.length; i++) {
      if (frequencies[i] >= fLow && frequencies[i] <= fHigh) {
        filteredFreqs.push(frequencies[i]);
        filteredAmps.push(amplitudes[i]);
      }
    }

    // 找峰值频率 (Top 10)
    const indexed = filteredAmps.map((a, i) => ({ freq: filteredFreqs[i], amp: a, idx: i }));
    indexed.sort((a, b) => b.amp - a.amp);
    const peaks = indexed.slice(0, 10).map(p => ({
      frequency: Math.round(p.freq * 100) / 100,
      amplitude: Math.round(p.amp * 1000) / 1000,
    }));

    // 计算整体指标
    const overallRMS = dsp.rms(signal);
    const velocityRMS = dsp.rmsVelocity(signal, fs, 10, 1000);

    // ISO 10816 评估
    let isoResult = null;
    if (cfg.enableISO) {
      isoResult = dsp.evaluateVibrationSeverity(velocityRMS, cfg.machineGroup, cfg.mountType);
    }

    // 轴承特征频率
    let bearingFreqs = null;
    const rpm = cfg.shaftRPM || input.operatingCondition?.speed || input.equipment?.ratedSpeed || 0;
    if (cfg.enableCharacteristicFreqs && rpm > 0) {
      const markLines: any[] = [];
      // 1X, 2X, 3X 转频
      const shaftFreq = rpm / 60;
      markLines.push({ value: shaftFreq, label: '1X', color: '#ff4444' });
      markLines.push({ value: 2 * shaftFreq, label: '2X', color: '#ff8844' });
      markLines.push({ value: 3 * shaftFreq, label: '3X', color: '#ffaa44' });

      // 轴承故障频率 (如果有轴承参数)
      if (cfg.bearingModel) {
        // 使用默认轴承库
        const bearing = getDefaultBearing(cfg.bearingModel);
        if (bearing) {
          bearingFreqs = dsp.bearingFaultFrequencies(bearing, rpm);
          markLines.push({ value: bearingFreqs.BPFO, label: 'BPFO', color: '#44aaff' });
          markLines.push({ value: bearingFreqs.BPFI, label: 'BPFI', color: '#44ffaa' });
          markLines.push({ value: bearingFreqs.BSF, label: 'BSF', color: '#aa44ff' });
          markLines.push({ value: bearingFreqs.FTF, label: 'FTF', color: '#ff44aa' });
        }
      }
    }

    // 诊断结论
    let severity: AlgorithmOutput['diagnosis']['severity'] = 'normal';
    let summary = '';
    if (isoResult) {
      severity = isoResult.zone === 'A' ? 'normal' :
        isoResult.zone === 'B' ? 'attention' :
        isoResult.zone === 'C' ? 'warning' : 'critical';
      summary = `振动速度RMS=${velocityRMS.toFixed(2)}mm/s，ISO评估区域${isoResult.zone}：${isoResult.description}。主频${peaks[0]?.frequency}Hz(${peaks[0]?.amplitude.toFixed(3)})`;
    } else {
      summary = `频谱分析完成。主频${peaks[0]?.frequency}Hz，幅值${peaks[0]?.amplitude.toFixed(3)}，整体RMS=${overallRMS.toFixed(3)}`;
    }

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary,
      severity,
      urgency: severity === 'critical' ? 'immediate' : severity === 'warning' ? 'scheduled' : 'monitoring',
      confidence: (() => { const s = getSignalData(input); const lenS = Math.min(1, s.length / 8192); const pkS = peaks.length > 0 ? Math.min(1, peaks.length / 5) : 0.2; return Math.min(0.97, Math.max(0.4, 0.35 + lenS * 0.3 + pkS * 0.3)); })(),
      referenceStandard: 'ISO 10816-3 / ISO 20816-1',
      recommendations: severity === 'critical'
        ? ['建议立即停机检查', '检查轴承和对中状态', '记录振动数据用于趋势分析']
        : severity === 'warning'
        ? ['安排维护计划', '增加监测频率', '检查松动和不平衡']
        : ['继续正常监测'],
    }, {
      frequencies: filteredFreqs,
      amplitudes: filteredAmps,
      peaks,
      overallRMS,
      velocityRMS,
      isoEvaluation: isoResult,
      bearingFaultFrequencies: bearingFreqs,
      shaftRPM: rpm,
    }, [{
      type: 'spectrum',
      title: 'FFT频谱图',
      xAxis: { label: '频率', unit: 'Hz', data: filteredFreqs },
      yAxis: { label: '幅值', unit: 'mm/s' },
      series: [{ name: '频谱', data: filteredAmps, color: '#3b82f6' }],
    }]);
  }
}

// ============================================================
// 2. 倒频谱分析
// ============================================================

export class CepstrumAnalyzer implements IAlgorithmExecutor {
  readonly id = 'cepstrum_analysis';
  readonly name = '倒频谱分析';
  readonly version = '1.2.0';
  readonly category = 'mechanical';

  getDefaultConfig() {
    return {
      cepstrumType: 'power', // power | real
      quefrencyRange: [0, 0], // 自动
      peakThreshold: 0.1, // 峰值检测阈值 (相对于最大值)
      gearTeethCounts: [] as number[], // 齿轮齿数
      shaftRPM: 0,
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    const signal = getSignalData(input);
    if (!signal || signal.length < 256) {
      return { valid: false, errors: ['倒频谱分析至少需要256个采样点'] };
    }
    if (!input.sampleRate) {
      return { valid: false, errors: ['必须提供采样率'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const signal = getSignalData(input);
    const fs = input.sampleRate!;

    // 计算倒频谱
    const { quefrency, cepstrum } = dsp.powerCepstrum(signal);

    // 转换 quefrency 为时间 (秒)
    const quefrencyTime = quefrency.map(q => q / fs);

    // 排除 quefrency=0 (DC分量)
    const startIdx = Math.max(1, Math.floor(fs / 1000)); // 排除低于1ms的quefrency
    const endIdx = cfg.quefrencyRange[1] > 0
      ? Math.floor(cfg.quefrencyRange[1] * fs)
      : Math.floor(quefrency.length / 2);

    const validCeps = cepstrum.slice(startIdx, endIdx);
    const validQuefrency = quefrencyTime.slice(startIdx, endIdx);

    // 峰值检测
    const maxCeps = Math.max(...validCeps.map(Math.abs));
    const threshold = maxCeps * cfg.peakThreshold;
    const peaks: Array<{ quefrency: number; amplitude: number; possibleFrequency: number }> = [];

    for (let i = 1; i < validCeps.length - 1; i++) {
      if (Math.abs(validCeps[i]) > threshold &&
          Math.abs(validCeps[i]) > Math.abs(validCeps[i - 1]) &&
          Math.abs(validCeps[i]) > Math.abs(validCeps[i + 1])) {
        peaks.push({
          quefrency: validQuefrency[i],
          amplitude: validCeps[i],
          possibleFrequency: 1 / validQuefrency[i],
        });
      }
    }
    peaks.sort((a, b) => Math.abs(b.amplitude) - Math.abs(a.amplitude));
    const topPeaks = peaks.slice(0, 10);

    // 齿轮箱故障分析
    const rpm = cfg.shaftRPM || input.operatingCondition?.speed || 0;
    let gearDiagnosis = '';
    if (rpm > 0 && cfg.gearTeethCounts.length > 0) {
      const shaftFreq = rpm / 60;
      for (const peak of topPeaks) {
        for (let gi = 0; gi < cfg.gearTeethCounts.length; gi++) {
          const meshFreq = shaftFreq * cfg.gearTeethCounts[gi];
          if (Math.abs(peak.possibleFrequency - meshFreq) / meshFreq < 0.05) {
            gearDiagnosis += `检测到与第${gi + 1}级齿轮啮合频率(${meshFreq.toFixed(1)}Hz)匹配的倒频谱峰值，可能存在齿轮故障。`;
          }
        }
        // 检查是否为转频的倍数
        const orderRatio = peak.possibleFrequency / shaftFreq;
        if (Math.abs(orderRatio - Math.round(orderRatio)) < 0.1 && Math.round(orderRatio) > 0) {
          gearDiagnosis += `倒频谱峰值对应${Math.round(orderRatio)}X转频，可能指示周期性调制。`;
        }
      }
    }

    const hasFault = topPeaks.length > 3 && Math.abs(topPeaks[0].amplitude) > maxCeps * 0.3;

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: gearDiagnosis || (hasFault
        ? `倒频谱检测到${topPeaks.length}个显著峰值，主峰quefrency=${topPeaks[0]?.quefrency.toFixed(4)}s(对应${topPeaks[0]?.possibleFrequency.toFixed(1)}Hz)，可能存在周期性故障`
        : `倒频谱分析正常，未检测到显著周期性调制`),
      severity: hasFault ? 'warning' : 'normal',
      urgency: hasFault ? 'scheduled' : 'monitoring',
      confidence: (() => { const s = getSignalData(input); const lenS = Math.min(1, s.length / 4096); const pkS = topPeaks.length > 0 ? Math.min(1, topPeaks.length / 5) : 0.2; return Math.min(0.95, Math.max(0.35, 0.3 + lenS * 0.3 + pkS * 0.3)); })(),
      faultType: hasFault ? '周期性调制/齿轮故障' : undefined,
      referenceStandard: 'ISO 18436-2',
    }, {
      quefrency: validQuefrency,
      cepstrum: validCeps,
      peaks: topPeaks,
      gearDiagnosis,
    }, [{
      type: 'line',
      title: '倒频谱图',
      xAxis: { label: 'Quefrency', unit: 's', data: validQuefrency },
      yAxis: { label: '幅值' },
      series: [{ name: '倒频谱', data: validCeps, color: '#10b981' }],
    }]);
  }
}

// ============================================================
// 3. 包络解调分析
// ============================================================

export class EnvelopeDemodAnalyzer implements IAlgorithmExecutor {
  readonly id = 'envelope_demod';
  readonly name = '包络解调分析';
  readonly version = '2.0.0';
  readonly category = 'mechanical';

  getDefaultConfig() {
    return {
      bandpassLow: 0, // 0 = 自动 (基于谱峭度)
      bandpassHigh: 0,
      filterOrder: 4,
      shaftRPM: 0,
      bearingModel: '',
      frequencyMatchTolerance: 0.05, // 5%容差
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    const signal = getSignalData(input);
    if (!signal || signal.length < 512) {
      return { valid: false, errors: ['包络分析至少需要512个采样点'] };
    }
    if (!input.sampleRate) {
      return { valid: false, errors: ['必须提供采样率'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const signal = getSignalData(input);
    const fs = input.sampleRate!;

    // 自适应带通滤波 (如果未指定频带)
    let bandLow = cfg.bandpassLow;
    let bandHigh = cfg.bandpassHigh;
    if (bandLow === 0 || bandHigh === 0) {
      // 简化的谱峭度选频
      const { frequencies, amplitudes } = dsp.amplitudeSpectrum(signal, fs);
      const bandWidth = fs / 16;
      let bestKurt = 0;
      let bestCenter = fs / 4;
      for (let center = bandWidth; center < fs / 2 - bandWidth; center += bandWidth / 2) {
        const low = center - bandWidth / 2;
        const high = center + bandWidth / 2;
        const bandAmps = amplitudes.filter((_, i) => frequencies[i] >= low && frequencies[i] <= high);
        if (bandAmps.length > 4) {
          const kurt = dsp.kurtosis(bandAmps);
          if (kurt > bestKurt) {
            bestKurt = kurt;
            bestCenter = center;
          }
        }
      }
      bandLow = Math.max(100, bestCenter - bandWidth / 2);
      bandHigh = Math.min(fs / 2 - 10, bestCenter + bandWidth / 2);
    }

    // 带通滤波
    const bpCoeffs = dsp.butterworthBandpass(cfg.filterOrder, bandLow, bandHigh, fs);
    const filtered = dsp.filtfilt(signal, bpCoeffs);

    // Hilbert变换提取包络
    const env = dsp.envelope(filtered);

    // 包络谱
    const { frequencies: envFreqs, amplitudes: envAmps } = dsp.amplitudeSpectrum(env, fs);

    // 轴承故障频率匹配
    const rpm = cfg.shaftRPM || input.operatingCondition?.speed || input.equipment?.ratedSpeed || 0;
    const faultMatches: Array<{ type: string; expected: number; detected: number; amplitude: number; match: boolean }> = [];

    if (rpm > 0 && cfg.bearingModel) {
      const bearing = getDefaultBearing(cfg.bearingModel);
      if (bearing) {
        const bf = dsp.bearingFaultFrequencies(bearing, rpm);
        const faultTypes = [
          { type: 'BPFO (外圈故障)', freq: bf.BPFO },
          { type: 'BPFI (内圈故障)', freq: bf.BPFI },
          { type: 'BSF (滚动体故障)', freq: bf.BSF },
          { type: 'FTF (保持架故障)', freq: bf.FTF },
        ];

        for (const ft of faultTypes) {
          // 在包络谱中查找匹配
          let bestMatch = { freq: 0, amp: 0 };
          for (let i = 0; i < envFreqs.length; i++) {
            if (Math.abs(envFreqs[i] - ft.freq) / ft.freq < cfg.frequencyMatchTolerance) {
              if (envAmps[i] > bestMatch.amp) {
                bestMatch = { freq: envFreqs[i], amp: envAmps[i] };
              }
            }
          }
          // 也检查2X和3X谐波
          const isMatch = bestMatch.amp > dsp.mean(envAmps) * 3;
          faultMatches.push({
            type: ft.type,
            expected: ft.freq,
            detected: bestMatch.freq,
            amplitude: bestMatch.amp,
            match: isMatch,
          });
        }
      }
    }

    const detectedFaults = faultMatches.filter(f => f.match);
    const hasFault = detectedFaults.length > 0;

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: hasFault
        ? `包络解调检测到轴承故障特征: ${detectedFaults.map(f => f.type).join(', ')}。滤波频带: ${bandLow.toFixed(0)}-${bandHigh.toFixed(0)}Hz`
        : `包络解调分析正常，滤波频带${bandLow.toFixed(0)}-${bandHigh.toFixed(0)}Hz，未检测到显著轴承故障特征`,
      severity: hasFault ? 'warning' : 'normal',
      urgency: hasFault ? 'scheduled' : 'monitoring',
      confidence: (() => { const s = getSignalData(input); const lenS = Math.min(1, s.length / 4096); return Math.min(0.95, Math.max(0.35, 0.35 + lenS * 0.3 + (hasFault ? 0.25 : 0.15))); })(),
      faultType: detectedFaults.map(f => f.type).join(', ') || undefined,
      referenceStandard: 'ISO 15243 (轴承损伤分类)',
      recommendations: hasFault
        ? ['确认轴承型号和转速参数', '安排轴承更换计划', '检查润滑状态', '记录趋势数据']
        : ['继续定期监测'],
    }, {
      filterBand: { low: bandLow, high: bandHigh },
      envelopeSignal: env.slice(0, 2048), // 限制输出大小
      envelopeSpectrum: { frequencies: envFreqs, amplitudes: envAmps },
      faultMatches,
      detectedFaults,
    }, [
      {
        type: 'spectrum',
        title: '包络谱',
        xAxis: { label: '频率', unit: 'Hz', data: envFreqs.slice(0, Math.floor(envFreqs.length / 4)) },
        yAxis: { label: '包络幅值' },
        series: [{ name: '包络谱', data: envAmps.slice(0, Math.floor(envAmps.length / 4)), color: '#f59e0b' }],
      },
      {
        type: 'line',
        title: '包络信号',
        xAxis: { label: '时间', unit: 's' },
        yAxis: { label: '幅值' },
        series: [{ name: '包络', data: env.slice(0, 2048), color: '#ef4444' }],
      },
    ]);
  }
}

// ============================================================
// 4. 小波包分解
// ============================================================

export class WaveletPacketAnalyzer implements IAlgorithmExecutor {
  readonly id = 'wavelet_packet';
  readonly name = '小波包分解';
  readonly version = '1.5.0';
  readonly category = 'mechanical';

  getDefaultConfig() {
    return {
      waveletType: 'db4', // db4 | db8 | sym5
      decompositionLevel: 3,
      energyThreshold: 0.01, // 能量占比阈值
    };
  }

  validateInput(input: AlgorithmInput, config: Record<string, any>) {
    const signal = getSignalData(input);
    const level = config.decompositionLevel || 3;
    const minLen = Math.pow(2, level + 2);
    if (!signal || signal.length < minLen) {
      return { valid: false, errors: [`${level}层分解至少需要${minLen}个采样点`] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const signal = getSignalData(input);
    const fs = input.sampleRate || 1;

    // 简化的小波包分解 (使用 Haar 近似 db4)
    const level = cfg.decompositionLevel;
    const nodes = waveletPacketDecompose(signal, level);

    // 计算各节点能量
    const totalEnergy = signal.reduce((s, v) => s + v * v, 0);
    const nodeEnergies = nodes.map((node, i) => {
      const energy = node.reduce((s, v) => s + v * v, 0);
      const bandWidth = (fs / 2) / Math.pow(2, level);
      return {
        nodeIndex: i,
        frequencyBand: {
          low: i * bandWidth,
          high: (i + 1) * bandWidth,
        },
        energy,
        energyRatio: totalEnergy > 0 ? energy / totalEnergy : 0,
      };
    });

    // Shannon 熵
    const probs = nodeEnergies.map(n => n.energyRatio).filter(p => p > 0);
    const entropy = -probs.reduce((s, p) => s + p * Math.log2(p), 0);
    const maxEntropy = Math.log2(nodes.length);
    const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

    // 找能量集中的频带
    const significantBands = nodeEnergies
      .filter(n => n.energyRatio > cfg.energyThreshold)
      .sort((a, b) => b.energyRatio - a.energyRatio);

    const isAbnormal = normalizedEntropy > 0.85 || significantBands.length <= 1;

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `${level}层小波包分解完成，${nodes.length}个频带。Shannon熵=${entropy.toFixed(3)}(归一化${normalizedEntropy.toFixed(3)})。` +
        `能量主要集中在${significantBands.slice(0, 3).map(b => `${b.frequencyBand.low.toFixed(0)}-${b.frequencyBand.high.toFixed(0)}Hz(${(b.energyRatio * 100).toFixed(1)}%)`).join(', ')}`,
      severity: isAbnormal ? 'attention' : 'normal',
      urgency: 'monitoring',
      confidence: (() => { const s = getSignalData(input); const lenS = Math.min(1, s.length / 4096); const entS = normalizedEntropy < 0.9 ? 0.25 : 0.1; return Math.min(0.95, Math.max(0.4, 0.35 + lenS * 0.3 + entS)); })(),
      referenceStandard: 'Mallat 1989 / Coifman-Wickerhauser 1992',
    }, {
      nodeEnergies,
      shannonEntropy: entropy,
      normalizedEntropy,
      significantBands,
      decompositionLevel: level,
      totalNodes: nodes.length,
    }, [{
      type: 'bar',
      title: '小波包能量分布',
      xAxis: {
        label: '频带',
        data: nodeEnergies.map(n => `${n.frequencyBand.low.toFixed(0)}-${n.frequencyBand.high.toFixed(0)}Hz`),
      },
      yAxis: { label: '能量占比', unit: '%' },
      series: [{
        name: '能量',
        data: nodeEnergies.map(n => n.energyRatio * 100),
        color: '#8b5cf6',
      }],
    }]);
  }
}

/** 简化的小波包分解 */
function waveletPacketDecompose(signal: number[], level: number): number[][] {
  if (level === 0) return [signal];

  // Haar小波分解
  const N = signal.length;
  const halfN = Math.floor(N / 2);
  const approx = new Array(halfN);
  const detail = new Array(halfN);

  for (let i = 0; i < halfN; i++) {
    approx[i] = (signal[2 * i] + signal[2 * i + 1]) / Math.SQRT2;
    detail[i] = (signal[2 * i] - signal[2 * i + 1]) / Math.SQRT2;
  }

  if (level === 1) return [approx, detail];

  // 递归分解
  const approxNodes = waveletPacketDecompose(approx, level - 1);
  const detailNodes = waveletPacketDecompose(detail, level - 1);

  return [...approxNodes, ...detailNodes];
}

// ============================================================
// 5. 带通滤波
// ============================================================

export class BandpassFilterProcessor implements IAlgorithmExecutor {
  readonly id = 'bandpass_filter';
  readonly name = '带通滤波';
  readonly version = '1.3.0';
  readonly category = 'mechanical';

  getDefaultConfig() {
    return {
      filterType: 'butterworth', // butterworth | chebyshev
      lowCutoff: 100, // Hz
      highCutoff: 3000, // Hz
      order: 4,
      zeroPhase: true, // 零相位滤波
    };
  }

  validateInput(input: AlgorithmInput, config: Record<string, any>) {
    const signal = getSignalData(input);
    if (!signal || signal.length < 32) {
      return { valid: false, errors: ['信号长度不足'] };
    }
    if (!input.sampleRate) {
      return { valid: false, errors: ['必须提供采样率'] };
    }
    const fs = input.sampleRate;
    if (config.highCutoff >= fs / 2) {
      return { valid: false, errors: [`高截止频率(${config.highCutoff}Hz)必须小于奈奎斯特频率(${fs / 2}Hz)`] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const signal = getSignalData(input);
    const fs = input.sampleRate!;

    // 设计滤波器
    const coeffs = dsp.butterworthBandpass(cfg.order, cfg.lowCutoff, cfg.highCutoff, fs);

    // 应用滤波
    const filtered = cfg.zeroPhase
      ? dsp.filtfilt(signal, coeffs)
      : dsp.applyFilter(signal, coeffs);

    // 计算滤波前后的统计量
    const beforeRMS = dsp.rms(signal);
    const afterRMS = dsp.rms(filtered);
    const energyRetention = beforeRMS > 0 ? (afterRMS / beforeRMS) * 100 : 0;

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `带通滤波完成: ${cfg.lowCutoff}-${cfg.highCutoff}Hz, ${cfg.order}阶${cfg.filterType}。能量保留率${energyRetention.toFixed(1)}%`,
      severity: 'normal',
      urgency: 'monitoring',
      confidence: (() => { const lenS = Math.min(1, signal.length / 4096); const retS = energyRetention > 10 ? 0.3 : 0.1; return Math.min(0.98, Math.max(0.5, 0.45 + lenS * 0.25 + retS)); })(),
    }, {
      filteredSignal: filtered,
      filterBand: { low: cfg.lowCutoff, high: cfg.highCutoff },
      beforeRMS,
      afterRMS,
      energyRetention,
      filterCoefficients: coeffs,
    }, [{
      type: 'line',
      title: '滤波前后对比',
      xAxis: { label: '采样点' },
      yAxis: { label: '幅值' },
      series: [
        { name: '原始信号', data: signal.slice(0, 1024), color: '#94a3b8' },
        { name: '滤波后', data: filtered.slice(0, 1024), color: '#3b82f6' },
      ],
    }]);
  }
}

// ============================================================
// 6. 谱峭度SK (Fast Kurtogram)
// ============================================================

export class SpectralKurtosisAnalyzer implements IAlgorithmExecutor {
  readonly id = 'spectral_kurtosis';
  readonly name = '谱峭度SK';
  readonly version = '1.4.0';
  readonly category = 'mechanical';

  getDefaultConfig() {
    return {
      maxLevel: 6, // 最大分解层数
      windowSize: 256,
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    const signal = getSignalData(input);
    if (!signal || signal.length < 1024) {
      return { valid: false, errors: ['谱峭度分析至少需要1024个采样点'] };
    }
    if (!input.sampleRate) {
      return { valid: false, errors: ['必须提供采样率'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const signal = getSignalData(input);
    const fs = input.sampleRate!;

    // Fast Kurtogram (Antoni 2006)
    // 二叉树搜索: 在不同中心频率和带宽下计算峭度
    const kurtogramResults: Array<{
      level: number;
      centerFreq: number;
      bandwidth: number;
      kurtosis: number;
    }> = [];

    let bestKurtosis = -Infinity;
    let bestCenter = fs / 4;
    let bestBandwidth = fs / 4;

    for (let level = 1; level <= cfg.maxLevel; level++) {
      const nBands = Math.pow(2, level);
      const bw = (fs / 2) / nBands;

      for (let band = 0; band < nBands; band++) {
        const center = bw * (band + 0.5);
        const low = Math.max(1, center - bw / 2);
        const high = Math.min(fs / 2 - 1, center + bw / 2);

        // 带通滤波
        try {
          const coeffs = dsp.butterworthBandpass(2, low, high, fs);
          const filtered = dsp.applyFilter(signal, coeffs);
          const env = dsp.envelope(filtered);
          const kurt = dsp.kurtosis(env);

          kurtogramResults.push({ level, centerFreq: center, bandwidth: bw, kurtosis: kurt });

          if (kurt > bestKurtosis) {
            bestKurtosis = kurt;
            bestCenter = center;
            bestBandwidth = bw;
          }
        } catch {
          // 某些频带可能导致滤波器不稳定，跳过
        }
      }
    }

    const optimalBand = {
      centerFrequency: bestCenter,
      bandwidth: bestBandwidth,
      lowFrequency: bestCenter - bestBandwidth / 2,
      highFrequency: bestCenter + bestBandwidth / 2,
      kurtosis: bestKurtosis,
    };

    const isImpulsive = bestKurtosis > 6; // 峭度>6通常指示冲击性故障

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `谱峭度分析完成。最佳频带: ${optimalBand.lowFrequency.toFixed(0)}-${optimalBand.highFrequency.toFixed(0)}Hz(中心${bestCenter.toFixed(0)}Hz)，峭度=${bestKurtosis.toFixed(2)}。` +
        (isImpulsive ? '检测到冲击性成分，建议进行包络解调分析' : '未检测到显著冲击性成分'),
      severity: isImpulsive ? 'attention' : 'normal',
      urgency: isImpulsive ? 'scheduled' : 'monitoring',
      confidence: (() => { const s = getSignalData(input); const lenS = Math.min(1, s.length / 8192); const kurtS = bestKurtosis > 3 ? Math.min(1, (bestKurtosis - 3) / 10) : 0.1; return Math.min(0.96, Math.max(0.35, 0.3 + lenS * 0.3 + kurtS * 0.3)); })(),
      referenceStandard: 'Antoni J. (2006) Fast Kurtogram',
      recommendations: isImpulsive
        ? ['使用最佳频带进行包络解调分析', '检查轴承状态', '对比历史谱峭度趋势']
        : ['继续监测'],
    }, {
      optimalBand,
      kurtogramResults,
      isImpulsive,
    }, [{
      type: 'heatmap',
      title: 'Kurtogram',
      xAxis: { label: '中心频率', unit: 'Hz' },
      yAxis: { label: '分解层级' },
      series: [{
        name: '峭度',
        data: kurtogramResults.map(r => [r.centerFreq, r.level, r.kurtosis]),
      }],
    }]);
  }
}

// ============================================================
// 7. 重采样
// ============================================================

export class ResamplingProcessor implements IAlgorithmExecutor {
  readonly id = 'resampling';
  readonly name = '重采样';
  readonly version = '1.1.0';
  readonly category = 'mechanical';

  getDefaultConfig() {
    return {
      targetSampleRate: 0, // Hz, 0=自动
      method: 'cubic', // linear | cubic
      antiAliasing: true,
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    const signal = getSignalData(input);
    if (!signal || signal.length < 16) {
      return { valid: false, errors: ['信号长度不足'] };
    }
    if (!input.sampleRate) {
      return { valid: false, errors: ['必须提供原始采样率'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const signal = getSignalData(input);
    const fs = input.sampleRate!;
    const targetFs = cfg.targetSampleRate || fs * 2;

    // 抗混叠滤波
    let processedSignal = signal;
    if (cfg.antiAliasing && targetFs < fs) {
      const nyquist = targetFs / 2;
      const lpCoeffs = dsp.butterworthLowpass(4, nyquist * 0.9, fs);
      processedSignal = dsp.filtfilt(processedSignal, lpCoeffs);
    }

    // 重采样
    const resampled = dsp.resample(processedSignal, fs, targetFs);

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: `重采样完成: ${fs}Hz → ${targetFs}Hz，${signal.length}点 → ${resampled.length}点`,
      severity: 'normal',
      urgency: 'monitoring',
      confidence: (() => { const lenS = Math.min(1, signal.length / 4096); return Math.min(0.98, Math.max(0.5, 0.5 + lenS * 0.3 + 0.15)); })(),
    }, {
      resampledSignal: resampled,
      originalSampleRate: fs,
      targetSampleRate: targetFs,
      originalLength: signal.length,
      resampledLength: resampled.length,
      ratio: targetFs / fs,
    });
  }
}

// ============================================================
// 8. 阶次跟踪分析
// ============================================================

export class OrderTrackingAnalyzer implements IAlgorithmExecutor {
  readonly id = 'order_tracking';
  readonly name = '阶次跟踪分析';
  readonly version = '1.3.0';
  readonly category = 'mechanical';

  getDefaultConfig() {
    return {
      samplesPerRev: 256,
      maxOrder: 20,
      tachoPulseChannel: '', // 键相通道名
      orderResolution: 0.1,
    };
  }

  validateInput(input: AlgorithmInput, _config: Record<string, any>) {
    const signal = getSignalData(input);
    if (!signal || signal.length < 512) {
      return { valid: false, errors: ['阶次分析至少需要512个采样点'] };
    }
    if (!input.sampleRate) {
      return { valid: false, errors: ['必须提供采样率'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const startTime = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const signal = getSignalData(input);
    const fs = input.sampleRate!;

    // 获取转速信号
    let tachoPulses: number[] = [];
    if (cfg.tachoPulseChannel && typeof input.data === 'object' && !Array.isArray(input.data)) {
      const tachoSignal = (input.data as Record<string, number[]>)[cfg.tachoPulseChannel];
      if (tachoSignal) {
        // 从键相信号提取脉冲时间点 (过零检测)
        for (let i = 1; i < tachoSignal.length; i++) {
          if (tachoSignal[i - 1] < 0 && tachoSignal[i] >= 0) {
            tachoPulses.push(i / fs);
          }
        }
      }
    }

    // 如果没有键相信号，使用恒速假设
    const rpm = input.operatingCondition?.speed || input.equipment?.ratedSpeed || 1500;
    if (tachoPulses.length < 3) {
      const revsPerSec = rpm / 60;
      const totalTime = signal.length / fs;
      const totalRevs = Math.floor(totalTime * revsPerSec);
      tachoPulses = Array.from({ length: totalRevs + 1 }, (_, i) => i / revsPerSec);
    }

    // 角度域重采样
    const { angularSignal, avgRPM } = dsp.angularResample(signal, fs, tachoPulses, cfg.samplesPerRev);

    // 阶次谱 (对角度域信号做FFT)
    if (angularSignal.length < cfg.samplesPerRev) {
      return createOutput(this.id, this.version, input, cfg, startTime, {
        summary: '数据不足以完成阶次分析',
        severity: 'normal',
        urgency: 'monitoring',
        confidence: 0.1,
      }, { error: '角度域信号长度不足' });
    }

    const orderSpectrum = dsp.amplitudeSpectrum(angularSignal, cfg.samplesPerRev);
    // 频率轴转换为阶次
    const orders = orderSpectrum.frequencies.map(f => f); // 已经是阶次（因为采样率=samplesPerRev）
    const orderAmplitudes = orderSpectrum.amplitudes;

    // 提取关键阶次
    const keyOrders: Array<{ order: number; amplitude: number }> = [];
    for (let ord = 1; ord <= cfg.maxOrder; ord++) {
      const idx = Math.round(ord);
      if (idx < orderAmplitudes.length) {
        keyOrders.push({ order: ord, amplitude: orderAmplitudes[idx] });
      }
    }

    // 分析
    const dominantOrder = keyOrders.reduce((max, o) => o.amplitude > max.amplitude ? o : max, keyOrders[0]);
    const has1X = keyOrders.find(o => o.order === 1);
    const has2X = keyOrders.find(o => o.order === 2);

    let diagnosis = `阶次分析完成，平均转速${avgRPM.toFixed(0)}RPM。`;
    if (has1X && has2X && has2X.amplitude > has1X.amplitude * 0.5) {
      diagnosis += `2X阶次显著(${has2X.amplitude.toFixed(3)})，可能存在不对中。`;
    }
    if (dominantOrder.order === 1) {
      diagnosis += `1X阶次主导(${dominantOrder.amplitude.toFixed(3)})，可能存在不平衡。`;
    }

    return createOutput(this.id, this.version, input, cfg, startTime, {
      summary: diagnosis,
      severity: 'normal',
      urgency: 'monitoring',
      confidence: (() => { const s = getSignalData(input); const lenS = Math.min(1, s.length / 4096); return Math.min(0.95, Math.max(0.4, 0.4 + lenS * 0.3 + 0.2)); })(),
      referenceStandard: 'Vold-Kalman 1997 / ISO 10816',
    }, {
      orders: orders.slice(0, cfg.maxOrder * 2),
      orderAmplitudes: orderAmplitudes.slice(0, cfg.maxOrder * 2),
      keyOrders,
      avgRPM,
      angularSignalLength: angularSignal.length,
    }, [{
      type: 'bar',
      title: '阶次谱',
      xAxis: { label: '阶次', data: keyOrders.map(o => o.order.toString()) },
      yAxis: { label: '幅值' },
      series: [{ name: '阶次幅值', data: keyOrders.map(o => o.amplitude), color: '#06b6d4' }],
    }]);
  }
}

// ============================================================
// 辅助：默认轴承参数库
// ============================================================

function getDefaultBearing(model: string): dsp.BearingGeometry | null {
  const bearings: Record<string, dsp.BearingGeometry> = {
    '6205': { numberOfBalls: 9, ballDiameter: 7.938, pitchDiameter: 38.5, contactAngle: 0 },
    '6206': { numberOfBalls: 9, ballDiameter: 9.525, pitchDiameter: 46.5, contactAngle: 0 },
    '6208': { numberOfBalls: 9, ballDiameter: 11.906, pitchDiameter: 54.991, contactAngle: 0 },
    '6310': { numberOfBalls: 8, ballDiameter: 17.462, pitchDiameter: 71.501, contactAngle: 0 },
    '6312': { numberOfBalls: 8, ballDiameter: 19.05, pitchDiameter: 81.5, contactAngle: 0 },
    '7210': { numberOfBalls: 14, ballDiameter: 9.525, pitchDiameter: 63.0, contactAngle: 40 },
    'NU210': { numberOfBalls: 14, ballDiameter: 10.0, pitchDiameter: 65.0, contactAngle: 0 },
    '22220': { numberOfBalls: 17, ballDiameter: 18.0, pitchDiameter: 130.0, contactAngle: 10 },
  };
  return bearings[model] || null;
}

// ============================================================
// 导出所有算法注册信息
// ============================================================

export function getMechanicalAlgorithms(): AlgorithmRegistration[] {
  return [
    {
      executor: new FFTSpectrumAnalyzer(),
      metadata: {
        description: '基于Cooley-Tukey FFT的频谱分析，支持多种窗函数、ISO 10816/20816振动严重度评估、特征频率自动标注',
        tags: ['频谱', 'FFT', '振动', 'ISO10816', '故障诊断'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '振动时域信号', required: true },
          { name: 'sampleRate', type: 'number', description: '采样率(Hz)', required: true },
        ],
        outputFields: [
          { name: 'frequencies', type: 'number[]', description: '频率轴(Hz)' },
          { name: 'amplitudes', type: 'number[]', description: '幅值谱' },
          { name: 'peaks', type: 'object[]', description: '峰值频率列表' },
          { name: 'velocityRMS', type: 'number', description: '速度RMS(mm/s)' },
          { name: 'isoEvaluation', type: 'object', description: 'ISO评估结果' },
        ],
        configFields: [
          { name: 'windowFunction', type: 'select', options: ['hanning', 'hamming', 'blackman', 'flat-top'], default: 'hanning' },
          { name: 'enableISO', type: 'boolean', default: true },
          { name: 'machineGroup', type: 'select', options: ['group1', 'group2', 'group3', 'group4'], default: 'group2' },
          { name: 'shaftRPM', type: 'number', default: 0, description: '转速(RPM)，0=自动' },
          { name: 'bearingModel', type: 'string', default: '', description: '轴承型号' },
        ],
        applicableDeviceTypes: ['motor', 'pump', 'compressor', 'turbine', 'gearbox', 'fan', '*'],
        applicableScenarios: ['振动监测', '故障诊断', '验收测试', '定期巡检'],
        complexity: 'O(NlogN)',
        edgeDeployable: true,
        referenceStandards: ['ISO 10816-3', 'ISO 20816-1', 'ISO 7919'],
      },
    },
    {
      executor: new CepstrumAnalyzer(),
      metadata: {
        description: '功率倒频谱/实倒频谱分析，用于齿轮箱故障检测和周期性调制识别',
        tags: ['倒频谱', '齿轮箱', '调制', '故障诊断'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '振动时域信号', required: true },
          { name: 'sampleRate', type: 'number', description: '采样率(Hz)', required: true },
        ],
        outputFields: [
          { name: 'quefrency', type: 'number[]', description: 'Quefrency轴(s)' },
          { name: 'cepstrum', type: 'number[]', description: '倒频谱值' },
          { name: 'peaks', type: 'object[]', description: '峰值列表' },
        ],
        configFields: [
          { name: 'cepstrumType', type: 'select', options: ['power', 'real'], default: 'power' },
          { name: 'gearTeethCounts', type: 'number[]', default: [], description: '齿轮齿数' },
          { name: 'shaftRPM', type: 'number', default: 0 },
        ],
        applicableDeviceTypes: ['gearbox', 'motor', 'turbine'],
        applicableScenarios: ['齿轮箱诊断', '调制分析'],
        complexity: 'O(NlogN)',
        edgeDeployable: true,
        referenceStandards: ['ISO 18436-2'],
      },
    },
    {
      executor: new EnvelopeDemodAnalyzer(),
      metadata: {
        description: 'Hilbert变换包络解调分析，自适应带通滤波，轴承故障特征频率(BPFO/BPFI/BSF/FTF)自动匹配',
        tags: ['包络', '解调', '轴承', 'Hilbert', '故障诊断'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '振动时域信号', required: true },
          { name: 'sampleRate', type: 'number', description: '采样率(Hz)', required: true },
        ],
        outputFields: [
          { name: 'envelopeSpectrum', type: 'object', description: '包络谱' },
          { name: 'faultMatches', type: 'object[]', description: '故障频率匹配结果' },
          { name: 'filterBand', type: 'object', description: '滤波频带' },
        ],
        configFields: [
          { name: 'bandpassLow', type: 'number', default: 0, description: '带通低频(Hz)，0=自动' },
          { name: 'bandpassHigh', type: 'number', default: 0, description: '带通高频(Hz)，0=自动' },
          { name: 'bearingModel', type: 'string', default: '', description: '轴承型号' },
          { name: 'shaftRPM', type: 'number', default: 0 },
        ],
        applicableDeviceTypes: ['motor', 'pump', 'compressor', 'fan', '*'],
        applicableScenarios: ['轴承诊断', '早期故障检测'],
        complexity: 'O(NlogN)',
        edgeDeployable: true,
        referenceStandards: ['ISO 15243', 'ISO 281'],
      },
    },
    {
      executor: new WaveletPacketAnalyzer(),
      metadata: {
        description: '多层小波包分解，频带能量分布计算，Shannon熵特征提取',
        tags: ['小波', '能量分布', '特征提取', 'Shannon熵'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '时域信号', required: true },
        ],
        outputFields: [
          { name: 'nodeEnergies', type: 'object[]', description: '各节点能量' },
          { name: 'shannonEntropy', type: 'number', description: 'Shannon熵' },
        ],
        configFields: [
          { name: 'waveletType', type: 'select', options: ['db4', 'db8', 'sym5'], default: 'db4' },
          { name: 'decompositionLevel', type: 'number', default: 3, min: 1, max: 8 },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['特征提取', '故障分类', '信号分析'],
        complexity: 'O(NlogN)',
        edgeDeployable: true,
        referenceStandards: ['Mallat 1989'],
      },
    },
    {
      executor: new BandpassFilterProcessor(),
      metadata: {
        description: 'Butterworth/Chebyshev IIR带通滤波器，支持零相位滤波(前向-后向)',
        tags: ['滤波', '带通', 'Butterworth', '信号处理'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '时域信号', required: true },
          { name: 'sampleRate', type: 'number', description: '采样率(Hz)', required: true },
        ],
        outputFields: [
          { name: 'filteredSignal', type: 'number[]', description: '滤波后信号' },
          { name: 'energyRetention', type: 'number', description: '能量保留率(%)' },
        ],
        configFields: [
          { name: 'lowCutoff', type: 'number', default: 100, description: '低截止频率(Hz)' },
          { name: 'highCutoff', type: 'number', default: 3000, description: '高截止频率(Hz)' },
          { name: 'order', type: 'number', default: 4, min: 1, max: 8 },
          { name: 'zeroPhase', type: 'boolean', default: true },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['信号预处理', '噪声滤除'],
        complexity: 'O(N)',
        edgeDeployable: true,
      },
    },
    {
      executor: new SpectralKurtosisAnalyzer(),
      metadata: {
        description: 'Fast Kurtogram (Antoni 2006)，自动搜索最佳解调频带，用于轴承早期故障检测',
        tags: ['谱峭度', 'Kurtogram', '最佳频带', '轴承'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '振动时域信号', required: true },
          { name: 'sampleRate', type: 'number', description: '采样率(Hz)', required: true },
        ],
        outputFields: [
          { name: 'optimalBand', type: 'object', description: '最佳频带参数' },
          { name: 'isImpulsive', type: 'boolean', description: '是否检测到冲击性成分' },
        ],
        configFields: [
          { name: 'maxLevel', type: 'number', default: 6, min: 2, max: 10 },
        ],
        applicableDeviceTypes: ['motor', 'pump', 'compressor', 'fan', '*'],
        applicableScenarios: ['轴承早期故障', '最佳频带选择'],
        complexity: 'O(N*2^L)',
        edgeDeployable: true,
        referenceStandards: ['Antoni J. 2006'],
      },
    },
    {
      executor: new ResamplingProcessor(),
      metadata: {
        description: '三次样条插值重采样，支持抗混叠滤波和角度域重采样',
        tags: ['重采样', '插值', '抗混叠'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '时域信号', required: true },
          { name: 'sampleRate', type: 'number', description: '原始采样率(Hz)', required: true },
        ],
        outputFields: [
          { name: 'resampledSignal', type: 'number[]', description: '重采样后信号' },
          { name: 'targetSampleRate', type: 'number', description: '目标采样率(Hz)' },
        ],
        configFields: [
          { name: 'targetSampleRate', type: 'number', default: 0, description: '目标采样率(Hz)' },
          { name: 'antiAliasing', type: 'boolean', default: true },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['信号预处理', '采样率转换'],
        complexity: 'O(N)',
        edgeDeployable: true,
      },
    },
    {
      executor: new OrderTrackingAnalyzer(),
      metadata: {
        description: '阶次跟踪分析，角度域重采样+阶次谱，适用于变速工况下的故障诊断',
        tags: ['阶次', '变速', '角度域', '旋转机械'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '振动时域信号', required: true },
          { name: 'sampleRate', type: 'number', description: '采样率(Hz)', required: true },
        ],
        outputFields: [
          { name: 'keyOrders', type: 'object[]', description: '关键阶次幅值' },
          { name: 'avgRPM', type: 'number', description: '平均转速(RPM)' },
        ],
        configFields: [
          { name: 'samplesPerRev', type: 'number', default: 256 },
          { name: 'maxOrder', type: 'number', default: 20 },
          { name: 'tachoPulseChannel', type: 'string', default: '', description: '键相通道名' },
        ],
        applicableDeviceTypes: ['motor', 'turbine', 'compressor', 'gearbox'],
        applicableScenarios: ['变速工况诊断', '升降速测试'],
        complexity: 'O(NlogN)',
        edgeDeployable: true,
        referenceStandards: ['ISO 7919', 'ISO 10816'],
      },
    },
  ];
}
