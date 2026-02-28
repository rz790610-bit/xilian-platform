/**
 * 传感器信息面板 — drie Html 覆盖层
 *
 * 悬浮在传感器球体旁，显示：
 *   - 传感器名称
 *   - 当前值 / 单位
 *   - 状态 / 阈值
 */
import { Html } from '@react-three/drei';
import { type RTGSensor, getSensorStatus, STATUS_COLORS } from './rtg-constants';

interface SensorInfoPanelProps {
  sensor: RTGSensor;
  value: number | null | undefined;
  onClose: () => void;
}

export default function SensorInfoPanel({ sensor, value, onClose }: SensorInfoPanelProps) {
  const status = getSensorStatus(sensor, value);
  const color = STATUS_COLORS[status];

  return (
    <Html
      position={[sensor.position[0], sensor.position[1] + 0.8, sensor.position[2]]}
      center
      distanceFactor={20}
      style={{ pointerEvents: 'auto' }}
    >
      <div
        className="bg-background/95 border border-border rounded-lg shadow-xl px-3 py-2 min-w-[160px] text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-medium text-foreground">{sensor.id}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-[10px]">
            ✕
          </button>
        </div>
        <div className="text-[10px] text-muted-foreground mb-1">{sensor.label}</div>
        <div className="flex items-baseline gap-1.5 mb-1.5">
          <span className="text-lg font-mono font-bold" style={{ color }}>
            {value != null ? value.toFixed(2) : '--'}
          </span>
          <span className="text-muted-foreground">{sensor.unit}</span>
        </div>
        <div className="flex items-center gap-2 text-[9px]">
          <span
            className="px-1.5 py-0.5 rounded font-medium"
            style={{
              backgroundColor: `${color}20`,
              color,
            }}
          >
            {status === 'normal' ? '正常' : status === 'warning' ? '预警' : status === 'alarm' ? '报警' : '离线'}
          </span>
          <span className="text-muted-foreground">
            预警: {sensor.thresholds.warning} | 报警: {sensor.thresholds.alarm}
          </span>
        </div>
      </div>
    </Html>
  );
}
