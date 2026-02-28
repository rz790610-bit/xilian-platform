/**
 * 瀑布图 — 频谱随时间演变
 *
 * Canvas 2D 实现，ImageData 像素写入 + jet 色图
 * 支持 DPR 适配、鼠标十字线 + 数值 tooltip
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import { jetColormap, type WaterfallChartProps } from './types';

const AXIS_LEFT = 60;
const AXIS_BOTTOM = 36;
const AXIS_TOP = 24;
const AXIS_RIGHT = 16;

export default function WaterfallChart({
  matrix,
  frequencies,
  timeLabels,
  title = '瀑布图',
  width: propWidth,
  height: propHeight = 300,
}: WaterfallChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; freq: string; time: string; value: string } | null>(null);
  const [containerWidth, setContainerWidth] = useState(propWidth ?? 600);

  // 自适应宽度
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

  // 绘制
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

    // 清空
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);

    const plotW = w - AXIS_LEFT - AXIS_RIGHT;
    const plotH = h - AXIS_TOP - AXIS_BOTTOM;
    const rows = matrix.length;
    const cols = matrix[0]?.length ?? 0;
    if (cols === 0 || rows === 0) return;

    // 找全局 min/max
    let min = Infinity, max = -Infinity;
    for (const row of matrix) {
      for (const v of row) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    const range = max - min || 1;

    // 像素级绘制
    const imgData = ctx.createImageData(plotW, plotH);
    for (let py = 0; py < plotH; py++) {
      const rowIdx = Math.floor((py / plotH) * rows);
      const row = matrix[rowIdx];
      for (let px = 0; px < plotW; px++) {
        const colIdx = Math.floor((px / plotW) * cols);
        const normalized = (row[colIdx] - min) / range;
        const [r, g, b] = jetColormap(normalized);
        const offset = (py * plotW + px) * 4;
        imgData.data[offset] = r;
        imgData.data[offset + 1] = g;
        imgData.data[offset + 2] = b;
        imgData.data[offset + 3] = 255;
      }
    }
    ctx.putImageData(imgData, AXIS_LEFT, AXIS_TOP);

    // 绘制坐标轴
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(AXIS_LEFT, AXIS_TOP);
    ctx.lineTo(AXIS_LEFT, AXIS_TOP + plotH);
    ctx.lineTo(AXIS_LEFT + plotW, AXIS_TOP + plotH);
    ctx.stroke();

    // X 轴标签（频率）
    ctx.fillStyle = '#aaa';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    const xTicks = 8;
    for (let i = 0; i <= xTicks; i++) {
      const idx = Math.floor((i / xTicks) * (cols - 1));
      const x = AXIS_LEFT + (i / xTicks) * plotW;
      ctx.fillText(frequencies[idx]?.toFixed(0) ?? '', x, AXIS_TOP + plotH + 14);
    }
    ctx.fillText('频率 (Hz)', AXIS_LEFT + plotW / 2, h - 4);

    // Y 轴标签（时间）
    ctx.textAlign = 'right';
    const yTicks = Math.min(6, rows);
    for (let i = 0; i <= yTicks; i++) {
      const idx = Math.floor((i / yTicks) * (rows - 1));
      const y = AXIS_TOP + (i / yTicks) * plotH;
      ctx.fillText(timeLabels[idx] ?? '', AXIS_LEFT - 4, y + 3);
    }

    // 标题
    ctx.fillStyle = '#ddd';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, 16);
  }, [matrix, frequencies, timeLabels, containerWidth, propHeight, title]);

  // 鼠标移动 → tooltip
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

    const cols = matrix[0]?.length ?? 0;
    const rows = matrix.length;
    const colIdx = Math.floor((px / plotW) * cols);
    const rowIdx = Math.floor((py / plotH) * rows);

    setTooltip({
      x: mx,
      y: my,
      freq: `${frequencies[colIdx]?.toFixed(1)} Hz`,
      time: timeLabels[rowIdx] ?? '',
      value: matrix[rowIdx]?.[colIdx]?.toFixed(4) ?? '--',
    });
  }, [matrix, frequencies, timeLabels, containerWidth, propHeight]);

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
          <div className="font-mono">{tooltip.value}</div>
        </div>
      )}
    </div>
  );
}
