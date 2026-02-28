/**
 * 工业图表共享类型
 *
 * 对齐后端 AlgorithmVisualization（server/algorithms/_core/types.ts）
 */

/** 频谱数据点 */
export interface SpectrumPoint {
  frequency: number; // Hz
  amplitude: number; // mm/s 或 g
}

/** 特征频率标注线 */
export interface CharacteristicFrequency {
  frequency: number;
  label: string;
  color?: string;
  /** 标注谐波数（2~n 次） */
  harmonics?: number;
}

/** 频谱图 props */
export interface SpectrumChartProps {
  data: SpectrumPoint[];
  title?: string;
  xLabel?: string;
  yLabel?: string;
  yUnit?: string;
  characteristicFrequencies?: CharacteristicFrequency[];
  /** 是否允许 log/linear 切换 */
  allowLogScale?: boolean;
  height?: number;
}

/** 包络谱图 props */
export interface EnvelopeChartProps {
  data: SpectrumPoint[];
  title?: string;
  xLabel?: string;
  yLabel?: string;
  yUnit?: string;
  bearingFrequencies?: {
    BPFO?: number;
    BPFI?: number;
    BSF?: number;
    FTF?: number;
  };
  /** 显示几次谐波 */
  harmonicCount?: number;
  height?: number;
}

/** 瀑布图数据 — 二维矩阵 rows=时间片, cols=频率 */
export interface WaterfallChartProps {
  /** 二维幅值矩阵 [timeSlice][freqBin] */
  matrix: number[][];
  /** 频率轴数组（Hz） */
  frequencies: number[];
  /** 时间轴标签 */
  timeLabels: string[];
  title?: string;
  width?: number;
  height?: number;
}

/** 热力图 props */
export interface HeatmapChartProps {
  /** 二维数值矩阵 [row][col] */
  matrix: number[][];
  /** 行标签（如传感器 ID） */
  rowLabels: string[];
  /** 列标签（如时间戳） */
  colLabels: string[];
  title?: string;
  colorLabel?: string;
  width?: number;
  height?: number;
}

/** 时频图 (STFT 频谱图) props */
export interface TimeFrequencyChartProps {
  /** 二维矩阵 [timeFrame][freqBin] */
  matrix: number[][];
  /** 频率轴（Hz） */
  frequencies: number[];
  /** 时间轴（秒） */
  times: number[];
  title?: string;
  width?: number;
  height?: number;
}

/** jet 色图 — amplitude 归一化到 [0, 1] 后映射到 RGB */
export function jetColormap(t: number): [number, number, number] {
  const v = Math.max(0, Math.min(1, t));
  let r: number, g: number, b: number;
  if (v < 0.125) {
    r = 0; g = 0; b = 0.5 + v * 4;
  } else if (v < 0.375) {
    r = 0; g = (v - 0.125) * 4; b = 1;
  } else if (v < 0.625) {
    r = (v - 0.375) * 4; g = 1; b = 1 - (v - 0.375) * 4;
  } else if (v < 0.875) {
    r = 1; g = 1 - (v - 0.625) * 4; b = 0;
  } else {
    r = 1 - (v - 0.875) * 4; g = 0; b = 0;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
