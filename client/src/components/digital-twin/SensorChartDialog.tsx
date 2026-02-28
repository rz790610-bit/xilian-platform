/**
 * 传感器图表弹窗
 *
 * 根据传感器测量类型自动选择合适的图表：
 *   vibration  → [频谱图, 包络谱, 瀑布图, 时频图]
 *   temperature → [时域趋势, 热力图]
 *   stress     → [时域趋势, 频谱图, 热力图]
 *
 * Phase 1: 使用客户端生成的演示波形数据
 */
import { useState, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  SpectrumChart, EnvelopeChart, WaterfallChart, TimeFrequencyChart,
  type SpectrumPoint,
} from '@/components/charts/industrial';
import { type RTGSensor, type SensorMeasurementType } from './rtg-model/rtg-constants';

interface SensorChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sensor: RTGSensor | null;
}

type ChartTab = 'spectrum' | 'envelope' | 'waterfall' | 'timefreq' | 'trend' | 'heatmap';

const TABS_BY_TYPE: Record<SensorMeasurementType, { key: ChartTab; label: string }[]> = {
  vibration: [
    { key: 'spectrum', label: '频谱图' },
    { key: 'envelope', label: '包络谱' },
    { key: 'waterfall', label: '瀑布图' },
    { key: 'timefreq', label: '时频图' },
  ],
  temperature: [
    { key: 'trend', label: '时域趋势' },
  ],
  stress: [
    { key: 'spectrum', label: '频谱图' },
    { key: 'trend', label: '时域趋势' },
  ],
};

/** 生成演示波形（含物理特征的合成信号） */
function generateDemoWaveform(type: SensorMeasurementType, n = 2048, rpm = 1470): number[] {
  const fs = 12800; // 采样率
  const dt = 1 / fs;
  const signal: number[] = [];

  if (type === 'vibration') {
    const rotFreq = rpm / 60; // 转频
    // 模拟轴承参数（6208 轴承，8 滚动体，接触角 0°）
    const BPFO = rotFreq * 3.06;
    const BPFI = rotFreq * 4.94;

    for (let i = 0; i < n; i++) {
      const t = i * dt;
      let v = 0;
      // 转频及谐波
      v += 1.2 * Math.sin(2 * Math.PI * rotFreq * t);
      v += 0.6 * Math.sin(2 * Math.PI * 2 * rotFreq * t);
      v += 0.3 * Math.sin(2 * Math.PI * 3 * rotFreq * t);
      // 轴承外圈缺陷 — BPFO 及谐波
      v += 0.4 * Math.sin(2 * Math.PI * BPFO * t);
      v += 0.15 * Math.sin(2 * Math.PI * 2 * BPFO * t);
      // 轴承内圈 — BPFI（较弱信号）
      v += 0.2 * Math.sin(2 * Math.PI * BPFI * t);
      // 噪声
      v += (Math.random() - 0.5) * 0.3;
      signal.push(v);
    }
  } else {
    // 温度/应力 — 缓慢变化
    const base = type === 'temperature' ? 65 : 120;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      signal.push(base + 5 * Math.sin(2 * Math.PI * t * 2) + (Math.random() - 0.5) * 1.5);
    }
  }
  return signal;
}

/** 简单 FFT（Cooley-Tukey radix-2） */
function fft(signal: number[]): SpectrumPoint[] {
  const n = signal.length;
  const fs = 12800;
  // 零填充到 2^N
  let N = 1;
  while (N < n) N <<= 1;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < n; i++) re[i] = signal[i];

  // 位反转
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // Butterfly
  for (let len = 2; len <= N; len <<= 1) {
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < N; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const tRe = curRe * re[i + j + len / 2] - curIm * im[i + j + len / 2];
        const tIm = curRe * im[i + j + len / 2] + curIm * re[i + j + len / 2];
        re[i + j + len / 2] = re[i + j] - tRe;
        im[i + j + len / 2] = im[i + j] - tIm;
        re[i + j] += tRe;
        im[i + j] += tIm;
        const newRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newRe;
      }
    }
  }

  // 取单边幅值谱
  const halfN = N / 2;
  const result: SpectrumPoint[] = [];
  for (let i = 1; i < halfN; i++) {
    const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]) * 2 / N;
    result.push({ frequency: (i * fs) / N, amplitude: mag });
  }
  return result;
}

/** 简单包络处理 — Hilbert 变换近似 */
function envelope(signal: number[]): number[] {
  // 简化：取绝对值 + 低通平滑
  const abs = signal.map(Math.abs);
  const smoothed = [];
  const win = 5;
  for (let i = 0; i < abs.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(abs.length - 1, i + win); j++) {
      sum += abs[j]; count++;
    }
    smoothed.push(sum / count);
  }
  return smoothed;
}

/** 生成 STFT 矩阵 */
function stft(signal: number[], windowSize = 256, hopSize = 128): { matrix: number[][]; freqs: number[]; times: number[] } {
  const fs = 12800;
  const frames: number[][] = [];
  const times: number[] = [];

  for (let start = 0; start + windowSize <= signal.length; start += hopSize) {
    const frame = signal.slice(start, start + windowSize);
    // Hanning 窗
    for (let i = 0; i < frame.length; i++) {
      frame[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / (frame.length - 1)));
    }
    const spectrum = fft(frame);
    frames.push(spectrum.map(p => p.amplitude));
    times.push((start + windowSize / 2) / fs);
  }

  const freqs = frames[0]?.length
    ? Array.from({ length: frames[0].length }, (_, i) => ((i + 1) * fs) / (windowSize * 2) * 2)
    : [];

  // 简化频率轴
  const halfN = windowSize;
  const correctedFreqs = Array.from({ length: frames[0]?.length ?? 0 }, (_, i) => ((i + 1) * fs) / halfN);

  return { matrix: frames, freqs: correctedFreqs, times };
}

export default function SensorChartDialog({ open, onOpenChange, sensor }: SensorChartDialogProps) {
  if (!sensor) return null;

  const tabs = TABS_BY_TYPE[sensor.measurementType] ?? TABS_BY_TYPE.vibration;
  const [activeTab, setActiveTab] = useState<ChartTab>(tabs[0].key);

  // 生成演示数据（稳定引用）
  const demoData = useMemo(() => {
    const waveform = generateDemoWaveform(sensor.measurementType);
    const spectrum = fft(waveform);
    const env = envelope(waveform);
    const envSpectrum = fft(env.slice(0, 2048));
    const stftResult = stft(waveform);

    // 瀑布图 — 模拟多个时间片
    const waterfallMatrix: number[][] = [];
    const waterfallLabels: string[] = [];
    for (let t = 0; t < 10; t++) {
      const wave = generateDemoWaveform(sensor.measurementType);
      const spec = fft(wave);
      waterfallMatrix.push(spec.map(p => p.amplitude));
      waterfallLabels.push(`T-${10 - t}`);
    }

    const rpm = 1470;
    const rotFreq = rpm / 60;

    return {
      spectrum,
      envSpectrum,
      waterfallMatrix,
      waterfallFreqs: spectrum.map(p => p.frequency),
      waterfallLabels,
      stftMatrix: stftResult.matrix,
      stftFreqs: stftResult.freqs,
      stftTimes: stftResult.times,
      bearingFreqs: {
        BPFO: rotFreq * 3.06,
        BPFI: rotFreq * 4.94,
        BSF: rotFreq * 1.98,
        FTF: rotFreq * 0.39,
      },
      rotFreq,
    };
  }, [sensor.measurementType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <span className="font-mono text-muted-foreground">{sensor.id}</span>
            {sensor.label}
          </DialogTitle>
        </DialogHeader>

        {/* Tab 切换 */}
        <div className="flex gap-0.5 border-b border-border">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 图表内容 */}
        <div className="mt-2">
          {activeTab === 'spectrum' && (
            <SpectrumChart
              data={demoData.spectrum}
              title={`${sensor.label} — 频谱图`}
              yUnit={sensor.unit}
              characteristicFrequencies={[
                { frequency: demoData.rotFreq, label: '1X', color: '#3b82f6', harmonics: 3 },
                { frequency: demoData.bearingFreqs.BPFO, label: 'BPFO', color: '#ef4444' },
                { frequency: demoData.bearingFreqs.BPFI, label: 'BPFI', color: '#f97316' },
              ]}
              height={280}
            />
          )}

          {activeTab === 'envelope' && (
            <EnvelopeChart
              data={demoData.envSpectrum}
              title={`${sensor.label} — 包络谱`}
              yUnit="g"
              bearingFrequencies={demoData.bearingFreqs}
              harmonicCount={4}
              height={280}
            />
          )}

          {activeTab === 'waterfall' && (
            <WaterfallChart
              matrix={demoData.waterfallMatrix}
              frequencies={demoData.waterfallFreqs}
              timeLabels={demoData.waterfallLabels}
              title={`${sensor.label} — 瀑布图`}
              height={320}
            />
          )}

          {activeTab === 'timefreq' && (
            <TimeFrequencyChart
              matrix={demoData.stftMatrix}
              frequencies={demoData.stftFreqs}
              times={demoData.stftTimes}
              title={`${sensor.label} — 时频图 (STFT)`}
              height={320}
            />
          )}

          {activeTab === 'trend' && (
            <div className="text-center py-8 text-xs text-muted-foreground">
              时域趋势图（需连接实时数据源）
            </div>
          )}

          {activeTab === 'heatmap' && (
            <div className="text-center py-8 text-xs text-muted-foreground">
              热力图（需多传感器历史数据）
            </div>
          )}
        </div>

        <div className="text-[9px] text-muted-foreground mt-2 border-t border-border pt-2">
          演示数据 — 合成信号含转频谐波 + 轴承缺陷特征频率 (RPM=1470, 6208 轴承)
        </div>
      </DialogContent>
    </Dialog>
  );
}
