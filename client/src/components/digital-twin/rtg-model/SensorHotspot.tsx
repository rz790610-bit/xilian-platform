/**
 * 传感器热点 — 可点击球体
 *
 * 颜色根据传感器状态动态变化：
 *   - normal  → 绿色
 *   - warning → 黄色
 *   - alarm   → 红色（脉冲动画）
 *   - offline → 灰色
 */
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import { type RTGSensor, type SensorStatus, STATUS_COLORS, getSensorStatus } from './rtg-constants';

interface SensorHotspotProps {
  sensor: RTGSensor;
  value: number | null | undefined;
  onClick?: (sensor: RTGSensor) => void;
}

export default function SensorHotspot({ sensor, value, onClick }: SensorHotspotProps) {
  const meshRef = useRef<Mesh>(null!);
  const [hovered, setHovered] = useState(false);
  const status = getSensorStatus(sensor, value);
  const color = STATUS_COLORS[status];

  // 故障脉冲动画
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    if (status === 'alarm') {
      const scale = 1 + Math.sin(clock.getElapsedTime() * 4) * 0.3;
      meshRef.current.scale.setScalar(scale);
    } else {
      meshRef.current.scale.setScalar(hovered ? 1.4 : 1);
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={sensor.position}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(sensor);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
    >
      <sphereGeometry args={[0.25, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={status === 'alarm' ? 0.6 : hovered ? 0.3 : 0.15}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}
