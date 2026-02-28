/**
 * RTG（轨道吊）三维模型常量
 *
 * 双悬臂轨道吊 DCRG-45t 简化模型参数
 * Y-up 坐标系，单位：米
 */

/** 传感器测量类型 */
export type SensorMeasurementType = 'vibration' | 'temperature' | 'stress';

/** 传感器状态 */
export type SensorStatus = 'normal' | 'warning' | 'alarm' | 'offline';

/** 传感器定义 */
export interface RTGSensor {
  id: string;
  label: string;
  /** 3D 坐标 [x, y, z] 米 */
  position: [number, number, number];
  /** 所属组件组 */
  group: 'hoist' | 'trolley' | 'gantry';
  /** 测量类型 */
  measurementType: SensorMeasurementType;
  /** 单位 */
  unit: string;
  /** 阈值 */
  thresholds: {
    warning: number;
    alarm: number;
  };
}

/** 16 个 VT 传感器 3D 坐标及参数（基于设备物理布局） */
export const RTG_SENSORS: RTGSensor[] = [
  // ── HOIST（起升机构） ──
  { id: 'VT-01', label: '起升电机 DE 振动', position: [0, 17.5, 0.4], group: 'hoist', measurementType: 'vibration', unit: 'mm/s', thresholds: { warning: 4.5, alarm: 7.1 } },
  { id: 'VT-02', label: '起升电机 NDE 振动', position: [0, 17.5, -0.4], group: 'hoist', measurementType: 'vibration', unit: 'mm/s', thresholds: { warning: 4.5, alarm: 7.1 } },
  { id: 'VT-03', label: '起升电机温度', position: [0, 17.5, 0], group: 'hoist', measurementType: 'temperature', unit: '°C', thresholds: { warning: 80, alarm: 105 } },
  { id: 'VT-04', label: '减速箱高速轴振动', position: [0.7, 17.5, 0.3], group: 'hoist', measurementType: 'vibration', unit: 'mm/s', thresholds: { warning: 4.5, alarm: 7.1 } },
  { id: 'VT-05', label: '减速箱低速轴振动', position: [0.7, 17.5, -0.3], group: 'hoist', measurementType: 'vibration', unit: 'mm/s', thresholds: { warning: 4.5, alarm: 7.1 } },
  { id: 'VT-06', label: '减速箱油温', position: [0.7, 17.2, 0], group: 'hoist', measurementType: 'temperature', unit: '°C', thresholds: { warning: 70, alarm: 85 } },

  // ── TROLLEY（小车运行机构） ──
  { id: 'VT-07', label: '小车电机 DE 振动', position: [1.5, 18.3, 0.3], group: 'trolley', measurementType: 'vibration', unit: 'mm/s', thresholds: { warning: 4.5, alarm: 7.1 } },
  { id: 'VT-08', label: '小车电机 NDE 振动', position: [1.5, 18.3, -0.3], group: 'trolley', measurementType: 'vibration', unit: 'mm/s', thresholds: { warning: 4.5, alarm: 7.1 } },
  { id: 'VT-09', label: '小车电机温度', position: [1.5, 18.3, 0], group: 'trolley', measurementType: 'temperature', unit: '°C', thresholds: { warning: 80, alarm: 105 } },
  { id: 'VT-10', label: '小车减速箱高速轴振动', position: [2.0, 18.3, 0.2], group: 'trolley', measurementType: 'vibration', unit: 'mm/s', thresholds: { warning: 4.5, alarm: 7.1 } },
  { id: 'VT-11', label: '小车减速箱低速轴振动', position: [2.0, 18.3, -0.2], group: 'trolley', measurementType: 'vibration', unit: 'mm/s', thresholds: { warning: 4.5, alarm: 7.1 } },
  { id: 'VT-12', label: '小车减速箱油温', position: [2.0, 18.0, 0], group: 'trolley', measurementType: 'temperature', unit: '°C', thresholds: { warning: 70, alarm: 85 } },

  // ── GANTRY（大车电机，门腿底部） ──
  { id: 'VT-13', label: '大车电机 A 振动（海侧）', position: [-11.75, 0.8, 0], group: 'gantry', measurementType: 'vibration', unit: 'mm/s', thresholds: { warning: 4.5, alarm: 7.1 } },
  { id: 'VT-14', label: '大车电机 A 温度', position: [-11.75, 0.5, 0], group: 'gantry', measurementType: 'temperature', unit: '°C', thresholds: { warning: 80, alarm: 105 } },
  { id: 'VT-15', label: '大车电机 B 振动（陆侧）', position: [11.75, 0.8, 0], group: 'gantry', measurementType: 'vibration', unit: 'mm/s', thresholds: { warning: 4.5, alarm: 7.1 } },
  { id: 'VT-16', label: '大车电机 B 温度', position: [11.75, 0.5, 0], group: 'gantry', measurementType: 'temperature', unit: '°C', thresholds: { warning: 80, alarm: 105 } },
];

/** 根据传感器值返回状态 */
export function getSensorStatus(sensor: RTGSensor, value: number | null | undefined): SensorStatus {
  if (value == null) return 'offline';
  if (value >= sensor.thresholds.alarm) return 'alarm';
  if (value >= sensor.thresholds.warning) return 'warning';
  return 'normal';
}

/** 状态对应的颜色（hex） */
export const STATUS_COLORS: Record<SensorStatus, string> = {
  normal: '#22c55e',   // green-500
  warning: '#f59e0b',  // amber-500
  alarm: '#ef4444',    // red-500
  offline: '#6b7280',  // gray-500
};

/** RTG 结构件颜色 */
export const STRUCTURE_COLORS = {
  mainBeam: '#4a5568',
  base: '#2d3748',
  bracing: '#718096',
  spreader: '#e53e3e',
  wireRope: '#a0aec0',
} as const;

/** RTG 整体尺寸参考（用于相机定位） */
export const RTG_DIMENSIONS = {
  width: 23.5,       // X 轴跨度
  height: 20.5,      // Y 轴高度
  depth: 3.0,        // Z 轴深度
  centerY: 10,       // 模型重心高度
} as const;
