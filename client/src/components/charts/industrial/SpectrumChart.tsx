/**
 * 频谱图 — 振动频率分析
 *
 * 基于 Chart.js Line，支持:
 *   - Log / Linear Y 轴切换
 *   - 特征频率标注线（BPFO / BPFI / BSF 等）
 *   - 鼠标悬停显示频率和幅值
 */
import { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, LogarithmicScale,
  PointElement, LineElement,
  Title, Tooltip, Legend,
  type Plugin,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { SpectrumChartProps, CharacteristicFrequency } from './types';

ChartJS.register(
  CategoryScale, LinearScale, LogarithmicScale,
  PointElement, LineElement,
  Title, Tooltip, Legend,
);

/** 在频谱上绘制特征频率标注垂直虚线 */
function makeAnnotationPlugin(
  charFreqs: CharacteristicFrequency[] | undefined,
  frequencies: number[],
): Plugin<'line'> {
  return {
    id: 'characteristicFreqAnnotation',
    beforeDraw(chart) {
      if (!charFreqs?.length) return;
      const { ctx, scales } = chart;
      const xScale = scales.x;
      const yScale = scales.y;
      if (!xScale || !yScale) return;

      ctx.save();
      for (const cf of charFreqs) {
        const harmonicCount = cf.harmonics ?? 1;
        for (let h = 1; h <= harmonicCount; h++) {
          const freq = cf.frequency * h;
          // 找到最近的频率索引
          let closestIdx = 0;
          let minDist = Infinity;
          for (let i = 0; i < frequencies.length; i++) {
            const d = Math.abs(frequencies[i] - freq);
            if (d < minDist) { minDist = d; closestIdx = i; }
          }
          const x = xScale.getPixelForValue(closestIdx);
          if (x < xScale.left || x > xScale.right) continue;

          const alpha = h === 1 ? 0.8 : Math.max(0.2, 0.8 - h * 0.15);
          const color = cf.color ?? '#ef4444';

          // 垂直虚线
          ctx.strokeStyle = color;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(x, yScale.top);
          ctx.lineTo(x, yScale.bottom);
          ctx.stroke();

          // 标签（仅基频）
          if (h === 1) {
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            ctx.fillStyle = color;
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(cf.label, x, yScale.top - 4);
          }
        }
      }
      ctx.restore();
    },
  };
}

export default function SpectrumChart({
  data,
  title = '频谱图',
  xLabel = '频率 (Hz)',
  yLabel = '幅值',
  yUnit = 'mm/s',
  characteristicFrequencies,
  allowLogScale = true,
  height = 260,
}: SpectrumChartProps) {
  const [logScale, setLogScale] = useState(false);

  const frequencies = useMemo(() => data.map(d => d.frequency), [data]);
  const amplitudes = useMemo(() => data.map(d => d.amplitude), [data]);

  const annotationPlugin = useMemo(
    () => makeAnnotationPlugin(characteristicFrequencies, frequencies),
    [characteristicFrequencies, frequencies],
  );

  const chartData = useMemo(() => ({
    labels: frequencies.map(f => f.toFixed(1)),
    datasets: [{
      label: `${yLabel} (${yUnit})`,
      data: amplitudes,
      borderColor: 'hsl(210, 80%, 55%)',
      backgroundColor: 'hsla(210, 80%, 55%, 0.08)',
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
        type: logScale ? 'logarithmic' as const : 'linear' as const,
        display: true,
        title: { display: true, text: `${yLabel} (${yUnit})`, font: { size: 10 } },
        ticks: { font: { size: 9 } },
        grid: { color: 'rgba(128,128,128,0.15)' },
        min: logScale ? undefined : 0,
      },
    },
  }), [title, xLabel, yLabel, yUnit, logScale, frequencies]);

  return (
    <div>
      {allowLogScale && (
        <div className="flex justify-end mb-1">
          <button
            onClick={() => setLogScale(!logScale)}
            className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            {logScale ? 'Linear' : 'Log'} 切换
          </button>
        </div>
      )}
      <div style={{ height }}>
        <Line data={chartData} options={options} plugins={[annotationPlugin]} />
      </div>
    </div>
  );
}
