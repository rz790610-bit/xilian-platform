/**
 * 传感器图表弹窗
 *
 * P1-5 增强:
 *   - tRPC 查询 getEquipmentWaveform 获取真实/演示波形
 *   - ClickHouse 不可用时自动降级，UI 显示"演示数据"标签
 *   - 频谱/包络谱基于服务端波形渲染，BPFO/BPFI 标注线位置由服务端计算
 *
 * 图表类型自动选择:
 *   vibration  → [频谱图, 包络谱, 瀑布图, 时频图]
 *   temperature → [时域趋势]
 *   stress     → [频谱图, 时域趋势]
 */
import { useState, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  SpectrumChart, EnvelopeChart, WaterfallChart, TimeFrequencyChart,
  type SpectrumPoint,
} from '@/components/charts/industrial';
import { type RTGSensor, type SensorMeasurementType } from './rtg-model/rtg-constants';
import { trpc } from '@/lib/trpc';

interface SensorChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sensor: RTGSensor | null;
  equipmentId?: string;
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

/** 简单 FFT（Cooley-Tukey radix-2） */
function fft(signal: number[]): SpectrumPoint[] {
  const n = signal.length;
  const fs = 12800;
  let N = 1;
  while (N < n) N <<= 1;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < n; i++) re[i] = signal[i];

  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

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
    for (let i = 0; i < frame.length; i++) {
      frame[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / (frame.length - 1)));
    }
    const spectrum = fft(frame);
    frames.push(spectrum.map(p => p.amplitude));
    times.push((start + windowSize / 2) / fs);
  }

  const halfN = windowSize;
  const correctedFreqs = Array.from({ length: frames[0]?.length ?? 0 }, (_, i) => ((i + 1) * fs) / halfN);
  return { matrix: frames, freqs: correctedFreqs, times };
}

export default function SensorChartDialog({ open, onOpenChange, sensor, equipmentId = 'EQ-001' }: SensorChartDialogProps) {
  if (!sensor) return null;

  const tabs = TABS_BY_TYPE[sensor.measurementType] ?? TABS_BY_TYPE.vibration;
  const [activeTab, setActiveTab] = useState<ChartTab>(tabs[0].key);

  // P1-5: tRPC 查询波形数据（含降级）
  const waveformQuery = trpc.evoPipeline.getEquipmentWaveform.useQuery(
    { equipmentId, sensorId: sensor.id, sampleCount: 2048 },
    { enabled: open, retry: 1, staleTime: 10000 },
  );

  const waveformData = waveformQuery.data;
  const isDemoData = waveformData?.isDemoData ?? true;

  // 从服务端波形或查询结果计算图表数据
  const chartData = useMemo(() => {
    const waveform = waveformData?.waveform ?? [];
    if (waveform.length === 0) return null;

    const spectrum = fft(waveform);
    const env = envelope(waveform);
    const envSpectrum = fft(env.slice(0, 2048));
    const stftResult = stft(waveform);

    // 瀑布图 — 基于同一波形的不同窗位置
    const waterfallMatrix: number[][] = [];
    const waterfallLabels: string[] = [];
    const wfWindowSize = Math.floor(waveform.length / 10);
    for (let t = 0; t < 10; t++) {
      const start = t * Math.floor(waveform.length / 10);
      const end = Math.min(start + wfWindowSize, waveform.length);
      const segment = waveform.slice(start, end);
      if (segment.length > 0) {
        const spec = fft(segment);
        waterfallMatrix.push(spec.map(p => p.amplitude));
        waterfallLabels.push(`T-${10 - t}`);
      }
    }

    const rpm = waveformData?.rpm ?? 1470;
    const rotFreq = rpm / 60;
    const bf = waveformData?.bearingFrequencies ?? {
      BPFO: rotFreq * 3.06,
      BPFI: rotFreq * 4.94,
      BSF: rotFreq * 1.98,
      FTF: rotFreq * 0.39,
    };

    return {
      spectrum,
      envSpectrum,
      waterfallMatrix,
      waterfallFreqs: spectrum.map(p => p.frequency),
      waterfallLabels,
      stftMatrix: stftResult.matrix,
      stftFreqs: stftResult.freqs,
      stftTimes: stftResult.times,
      bearingFreqs: bf,
      rotFreq,
    };
  }, [waveformData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <span className="font-mono text-muted-foreground">{sensor.id}</span>
            {sensor.label}
            {/* P1-5: 数据来源标签 */}
            {isDemoData ? (
              <Badge variant="outline" className="text-[9px] ml-2 border-amber-500/50 text-amber-400">
                演示数据
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[9px] ml-2 border-emerald-500/50 text-emerald-400">
                实时数据
              </Badge>
            )}
            {waveformQuery.isLoading && (
              <span className="text-[9px] text-muted-foreground animate-pulse">加载中...</span>
            )}
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
          {!chartData && (
            <div className="text-center py-8 text-xs text-muted-foreground">
              {waveformQuery.isLoading ? '正在加载波形数据...' : '无可用数据'}
            </div>
          )}

          {chartData && activeTab === 'spectrum' && (
            <SpectrumChart
              data={chartData.spectrum}
              title={`${sensor.label} — 频谱图`}
              yUnit={sensor.unit}
              characteristicFrequencies={[
                { frequency: chartData.rotFreq, label: '1X', color: '#3b82f6', harmonics: 3 },
                { frequency: chartData.bearingFreqs.BPFO, label: 'BPFO', color: '#ef4444' },
                { frequency: chartData.bearingFreqs.BPFI, label: 'BPFI', color: '#f97316' },
              ]}
              height={280}
            />
          )}

          {chartData && activeTab === 'envelope' && (
            <EnvelopeChart
              data={chartData.envSpectrum}
              title={`${sensor.label} — 包络谱`}
              yUnit="g"
              bearingFrequencies={chartData.bearingFreqs}
              harmonicCount={4}
              height={280}
            />
          )}

          {chartData && activeTab === 'waterfall' && (
            <WaterfallChart
              matrix={chartData.waterfallMatrix}
              frequencies={chartData.waterfallFreqs}
              timeLabels={chartData.waterfallLabels}
              title={`${sensor.label} — 瀑布图`}
              height={320}
            />
          )}

          {chartData && activeTab === 'timefreq' && (
            <TimeFrequencyChart
              matrix={chartData.stftMatrix}
              frequencies={chartData.stftFreqs}
              times={chartData.stftTimes}
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

        {/* P1-5: 数据来源信息栏 */}
        <div className="text-[9px] text-muted-foreground mt-2 border-t border-border pt-2 flex items-center justify-between">
          <span>
            {isDemoData
              ? `演示数据 — ${waveformData?.fallbackReason ?? '合成信号含转频谐波 + 轴承缺陷特征频率'}`
              : `实时数据 — ClickHouse 查询 ${Math.round(waveformData?.queryTimeMs ?? 0)}ms`
            }
          </span>
          <span>
            {waveformData?.sampleRate ?? 12800} Hz / {waveformData?.sampleCount ?? 2048} pts
            {waveformData?.rpm ? ` / RPM=${waveformData.rpm}` : ''}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
