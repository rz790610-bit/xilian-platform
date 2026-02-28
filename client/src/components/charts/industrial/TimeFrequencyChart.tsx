/**
 * 时频图 — STFT 频谱图渲染
 *
 * Canvas 2D 实现，ImageData 像素写入 + jet 色图
 * X 轴 = 时间，Y 轴 = 频率，颜色 = 幅值
 * 支持 DPR 适配、鼠标十字线 + 数值 tooltip
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import { jetColormap, type TimeFrequencyChartProps } from './types';

const AXIS_LEFT = 60;
const AXIS_BOTTOM = 36;
const AXIS_TOP = 24;
const AXIS_RIGHT = 60; // 色标栏

export default function TimeFrequencyChart({
  matrix,
  frequencies,
  times,
  title = '时频图 (STFT)',
  width: propWidth,
  height: propHeight = 300,
}: TimeFrequencyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; time: string; freq: string; value: string } | null>(null);
  const [containerWidth, setContainerWidth] = useState(propWidth ?? 600);

  useEffect(() => {
    if (propWidth) { setContainerWidth(propWidth); return; }
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setContainerWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [propWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || matrix.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = containerWidth;
    const h = propHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);

    const plotW = w - AXIS_LEFT - AXIS_RIGHT;
    const plotH = h - AXIS_TOP - AXIS_BOTTOM;
    const timeFrames = matrix.length;    // 时间帧数
    const freqBins = matrix[0]?.length ?? 0; // 频率 bin 数
    if (timeFrames === 0 || freqBins === 0) return;

    // 全局 min/max
    let min = Infinity, max = -Infinity;
    for (const row of matrix) {
      for (const v of row) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    const range = max - min || 1;

    // 像素级写入 — X=时间, Y=频率(低频在下,高频在上)
    const imgData = ctx.createImageData(plotW, plotH);
    for (let py = 0; py < plotH; py++) {
      // Y 轴翻转：py=0 对应高频, py=plotH-1 对应低频
      const freqIdx = Math.floor(((plotH - 1 - py) / plotH) * freqBins);
      for (let px = 0; px < plotW; px++) {
        const timeIdx = Math.floor((px / plotW) * timeFrames);
        const val = matrix[timeIdx]?.[freqIdx] ?? 0;
        const normalized = (val - min) / range;
        const [r, g, b] = jetColormap(normalized);
        const offset = (py * plotW + px) * 4;
        imgData.data[offset] = r;
        imgData.data[offset + 1] = g;
        imgData.data[offset + 2] = b;
        imgData.data[offset + 3] = 255;
      }
    }
    ctx.putImageData(imgData, AXIS_LEFT, AXIS_TOP);

    // 坐标轴
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(AXIS_LEFT, AXIS_TOP);
    ctx.lineTo(AXIS_LEFT, AXIS_TOP + plotH);
    ctx.lineTo(AXIS_LEFT + plotW, AXIS_TOP + plotH);
    ctx.stroke();

    // X 轴标签（时间）
    ctx.fillStyle = '#aaa';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    const xTicks = 8;
    for (let i = 0; i <= xTicks; i++) {
      const idx = Math.floor((i / xTicks) * (timeFrames - 1));
      const x = AXIS_LEFT + (i / xTicks) * plotW;
      ctx.fillText(times[idx]?.toFixed(2) ?? '', x, AXIS_TOP + plotH + 14);
    }
    ctx.fillText('时间 (s)', AXIS_LEFT + plotW / 2, h - 4);

    // Y 轴标签（频率，低在下高在上）
    ctx.textAlign = 'right';
    const yTicks = 6;
    for (let i = 0; i <= yTicks; i++) {
      const idx = Math.floor((i / yTicks) * (freqBins - 1));
      const y = AXIS_TOP + plotH - (i / yTicks) * plotH;
      ctx.fillText(frequencies[idx]?.toFixed(0) ?? '', AXIS_LEFT - 4, y + 3);
    }
    ctx.save();
    ctx.translate(12, AXIS_TOP + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('频率 (Hz)', 0, 0);
    ctx.restore();

    // 色标栏
    const barX = w - AXIS_RIGHT + 10;
    const barW = 12;
    const barH = plotH;
    for (let py = 0; py < barH; py++) {
      const t = 1 - py / barH;
      const [cr, cg, cb] = jetColormap(t);
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.fillRect(barX, AXIS_TOP + py, barW, 1);
    }
    ctx.strokeStyle = '#555';
    ctx.strokeRect(barX, AXIS_TOP, barW, barH);

    ctx.fillStyle = '#aaa';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(max.toFixed(2), barX + barW + 3, AXIS_TOP + 8);
    ctx.fillText(min.toFixed(2), barX + barW + 3, AXIS_TOP + barH);

    // 标题
    ctx.fillStyle = '#ddd';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, 16);
  }, [matrix, frequencies, times, containerWidth, propHeight, title]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || matrix.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const plotW = containerWidth - AXIS_LEFT - AXIS_RIGHT;
    const plotH = propHeight - AXIS_TOP - AXIS_BOTTOM;
    const px = mx - AXIS_LEFT;
    const py = my - AXIS_TOP;

    if (px < 0 || px >= plotW || py < 0 || py >= plotH) {
      setTooltip(null);
      return;
    }

    const timeFrames = matrix.length;
    const freqBins = matrix[0]?.length ?? 0;
    const timeIdx = Math.floor((px / plotW) * timeFrames);
    const freqIdx = Math.floor(((plotH - 1 - py) / plotH) * freqBins);

    setTooltip({
      x: mx,
      y: my,
      time: `${times[timeIdx]?.toFixed(3)} s`,
      freq: `${frequencies[freqIdx]?.toFixed(1)} Hz`,
      value: matrix[timeIdx]?.[freqIdx]?.toFixed(4) ?? '--',
    });
  }, [matrix, frequencies, times, containerWidth, propHeight]);

  return (
    <div ref={containerRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        className="cursor-crosshair"
      />
      {tooltip && (
        <div
          className="absolute pointer-events-none bg-background/90 border border-border rounded px-2 py-1 text-[10px] shadow-lg z-10"
          style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}
        >
          <div>{tooltip.time}</div>
          <div>{tooltip.freq}</div>
          <div className="font-mono">幅值: {tooltip.value}</div>
        </div>
      )}
    </div>
  );
}
