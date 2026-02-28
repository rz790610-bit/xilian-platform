/**
 * 包络谱图 — 轴承缺陷特征频率分析
 *
 * 基于 Chart.js Line，标注 BPFO / BPFI / BSF / FTF 及其谐波
 */
import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement,
  Title, Tooltip, Legend,
  type Plugin,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { EnvelopeChartProps } from './types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

/** 轴承频率名称和颜色 */
const BEARING_FREQ_META: Record<string, { label: string; color: string }> = {
  BPFO: { label: 'BPFO', color: '#ef4444' },
  BPFI: { label: 'BPFI', color: '#f97316' },
  BSF: { label: 'BSF', color: '#8b5cf6' },
  FTF: { label: 'FTF', color: '#06b6d4' },
};

function makeBearingAnnotationPlugin(
  bearingFreqs: EnvelopeChartProps['bearingFrequencies'],
  harmonicCount: number,
  frequencies: number[],
): Plugin<'line'> {
  return {
    id: 'bearingFreqAnnotation',
    beforeDraw(chart) {
      if (!bearingFreqs) return;
      const { ctx, scales } = chart;
      const xScale = scales.x;
      const yScale = scales.y;
      if (!xScale || !yScale) return;

      ctx.save();
      for (const [key, freq] of Object.entries(bearingFreqs)) {
        if (freq == null) continue;
        const meta = BEARING_FREQ_META[key];
        if (!meta) continue;

        for (let h = 1; h <= harmonicCount; h++) {
          const f = freq * h;
          let closestIdx = 0;
          let minDist = Infinity;
          for (let i = 0; i < frequencies.length; i++) {
            const d = Math.abs(frequencies[i] - f);
            if (d < minDist) { minDist = d; closestIdx = i; }
          }
          const x = xScale.getPixelForValue(closestIdx);
          if (x < xScale.left || x > xScale.right) continue;

          const alpha = Math.max(0.25, 1 - (h - 1) * 0.18);

          ctx.strokeStyle = meta.color;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = h === 1 ? 1.5 : 1;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(x, yScale.top);
          ctx.lineTo(x, yScale.bottom);
          ctx.stroke();

          // 标签（仅基频和 2 次谐波）
          if (h <= 2) {
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            ctx.fillStyle = meta.color;
            ctx.font = h === 1 ? 'bold 10px sans-serif' : '9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(
              h === 1 ? meta.label : `${meta.label}×${h}`,
              x,
              yScale.top - 4,
            );
          }
        }
      }
      ctx.restore();
    },
  };
}

export default function EnvelopeChart({
  data,
  title = '包络谱',
  xLabel = '频率 (Hz)',
  yLabel = '幅值',
  yUnit = 'g',
  bearingFrequencies,
  harmonicCount = 4,
  height = 260,
}: EnvelopeChartProps) {
  const frequencies = useMemo(() => data.map(d => d.frequency), [data]);
  const amplitudes = useMemo(() => data.map(d => d.amplitude), [data]);

  const annotationPlugin = useMemo(
    () => makeBearingAnnotationPlugin(bearingFrequencies, harmonicCount, frequencies),
    [bearingFrequencies, harmonicCount, frequencies],
  );

  const chartData = useMemo(() => ({
    labels: frequencies.map(f => f.toFixed(1)),
    datasets: [{
      label: `${yLabel} (${yUnit})`,
      data: amplitudes,
      borderColor: 'hsl(280, 70%, 55%)',
      backgroundColor: 'hsla(280, 70%, 55%, 0.08)',
      fill: true,
      tension: 0,
      pointRadius: 0,
      borderWidth: 1.2,
    }],
  }), [frequencies, amplitudes, yLabel, yUnit]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: {
      legend: { display: false },
      title: { display: true, text: title, font: { size: 12 }, padding: { bottom: 8 } },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          title: (items: any[]) => `${frequencies[items[0]?.dataIndex ?? 0]?.toFixed(2)} Hz`,
          label: (item: any) => `${(item.raw as number).toFixed(4)} ${yUnit}`,
        },
      },
    },
    scales: {
      x: {
        display: true,
        title: { display: true, text: xLabel, font: { size: 10 } },
        ticks: { maxTicksLimit: 12, font: { size: 9 } },
        grid: { display: false },
      },
      y: {
        display: true,
        title: { display: true, text: `${yLabel} (${yUnit})`, font: { size: 10 } },
        ticks: { font: { size: 9 } },
        grid: { color: 'rgba(128,128,128,0.15)' },
        min: 0,
      },
    },
  }), [title, xLabel, yLabel, yUnit, frequencies]);

  // 轴承频率图例
  const legendItems = bearingFrequencies
    ? Object.entries(bearingFrequencies)
        .filter(([, v]) => v != null)
        .map(([k, v]) => ({ key: k, freq: v!, meta: BEARING_FREQ_META[k] }))
    : [];

  return (
    <div>
      {legendItems.length > 0 && (
        <div className="flex gap-2 mb-1 flex-wrap">
          {legendItems.map(item => (
            <span key={item.key} className="flex items-center gap-1 text-[10px]">
              <span className="w-2.5 h-0.5 inline-block" style={{ backgroundColor: item.meta?.color }} />
              {item.meta?.label} ({item.freq.toFixed(1)} Hz)
            </span>
          ))}
        </div>
      )}
      <div style={{ height }}>
        <Line data={chartData} options={options} plugins={[annotationPlugin]} />
      </div>
    </div>
  );
}
