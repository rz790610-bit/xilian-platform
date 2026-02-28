/**
 * 热力图 — 传感器 × 时间 网格
 *
 * Canvas 2D 实现，ImageData 像素写入 + jet 色图
 * 支持 DPR 适配、鼠标 tooltip
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import { jetColormap, type HeatmapChartProps } from './types';

const AXIS_LEFT = 80;
const AXIS_BOTTOM = 50;
const AXIS_TOP = 28;
const AXIS_RIGHT = 60; // 色标栏

export default function HeatmapChart({
  matrix,
  rowLabels,
  colLabels,
  title = '热力图',
  colorLabel = '值',
  width: propWidth,
  height: propHeight = 280,
}: HeatmapChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; row: string; col: string; value: string } | null>(null);
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
    const rows = matrix.length;
    const cols = matrix[0]?.length ?? 0;
    if (rows === 0 || cols === 0) return;

    let min = Infinity, max = -Infinity;
    for (const row of matrix) {
      for (const v of row) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    const range = max - min || 1;

    // 绘制网格
    const cellW = plotW / cols;
    const cellH = plotH / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const normalized = (matrix[r][c] - min) / range;
        const [cr, cg, cb] = jetColormap(normalized);
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.fillRect(
          AXIS_LEFT + c * cellW,
          AXIS_TOP + r * cellH,
          Math.ceil(cellW),
          Math.ceil(cellH),
        );
      }
    }

    // 坐标轴
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(AXIS_LEFT, AXIS_TOP);
    ctx.lineTo(AXIS_LEFT, AXIS_TOP + plotH);
    ctx.lineTo(AXIS_LEFT + plotW, AXIS_TOP + plotH);
    ctx.stroke();

    // Y 轴 — 行标签
    ctx.fillStyle = '#aaa';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    for (let r = 0; r < rows; r++) {
      const y = AXIS_TOP + r * cellH + cellH / 2 + 3;
      ctx.fillText(rowLabels[r] ?? '', AXIS_LEFT - 4, y);
    }

    // X 轴 — 列标签（取部分显示）
    ctx.textAlign = 'center';
    const maxXLabels = 10;
    const step = Math.max(1, Math.floor(cols / maxXLabels));
    for (let c = 0; c < cols; c += step) {
      const x = AXIS_LEFT + c * cellW + cellW / 2;
      ctx.save();
      ctx.translate(x, AXIS_TOP + plotH + 8);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = 'right';
      ctx.fillText(colLabels[c] ?? '', 0, 0);
      ctx.restore();
    }

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
    ctx.fillText(max.toFixed(1), barX + barW + 3, AXIS_TOP + 8);
    ctx.fillText(((max + min) / 2).toFixed(1), barX + barW + 3, AXIS_TOP + barH / 2 + 3);
    ctx.fillText(min.toFixed(1), barX + barW + 3, AXIS_TOP + barH);

    // 标题
    ctx.fillStyle = '#ddd';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, 16);
  }, [matrix, rowLabels, colLabels, containerWidth, propHeight, title]);

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
      row: rowLabels[rowIdx] ?? '',
      col: colLabels[colIdx] ?? '',
      value: matrix[rowIdx]?.[colIdx]?.toFixed(3) ?? '--',
    });
  }, [matrix, rowLabels, colLabels, containerWidth, propHeight]);

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
          <div>{tooltip.row}</div>
          <div>{tooltip.col}</div>
          <div className="font-mono">{colorLabel}: {tooltip.value}</div>
        </div>
      )}
    </div>
  );
}
