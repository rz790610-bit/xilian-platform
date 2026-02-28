/**
 * RTG 三维网格模型 — 程序化几何体组合
 *
 * 双悬臂轨道吊 (DCRG-45t) 简化模型:
 *   - 门架结构 (portal-frame): 大梁、悬臂、门腿、底座、连接节点、横梁
 *   - 小车 (trolley): 车架、电机、减速箱
 *   - 起升机构 (hoist): 卷筒、电机、减速箱、吊具、钢丝绳
 *   - 大车电机 (gantry-motors): 两台底部电机
 *   - 传感器 (sensors): 16 个 SensorHotspot
 */
import { useState } from 'react';
import { Line } from '@react-three/drei';
import { STRUCTURE_COLORS, RTG_SENSORS, type RTGSensor } from './rtg-constants';
import SensorHotspot from './SensorHotspot';
import SensorInfoPanel from './SensorInfoPanel';

interface RTGModelProps {
  sensorValues: Record<string, number | null>;
  onSensorClick?: (sensor: RTGSensor) => void;
}

/** 简化 Box 组件 */
function SBox({ args, position, color }: {
  args: [number, number, number];
  position: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

/** 简化 Cylinder 组件 */
function SCyl({ radius, height, position, color, rotation }: {
  radius: number;
  height: number;
  position: [number, number, number];
  color: string;
  rotation?: [number, number, number];
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <cylinderGeometry args={[radius, radius, height, 16]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

export default function RTGModel({ sensorValues, onSensorClick }: RTGModelProps) {
  const [selectedSensor, setSelectedSensor] = useState<RTGSensor | null>(null);

  const handleSensorClick = (sensor: RTGSensor) => {
    setSelectedSensor(prev => prev?.id === sensor.id ? null : sensor);
    onSensorClick?.(sensor);
  };

  return (
    <group name="rtg-root">
      {/* ══════════════════════════════════════════
          门架结构 (Portal Frame)
         ══════════════════════════════════════════ */}
      <group name="portal-frame">
        {/* 前大梁 */}
        <SBox args={[23.5, 2.5, 1.0]} position={[0, 19.25, 1.0]} color={STRUCTURE_COLORS.mainBeam} />
        {/* 后大梁 */}
        <SBox args={[23.5, 2.5, 1.0]} position={[0, 19.25, -1.0]} color={STRUCTURE_COLORS.mainBeam} />

        {/* 前悬臂（海侧延伸） */}
        <SBox args={[5.75, 2.0, 0.8]} position={[-14.625, 19.0, 1.0]} color={STRUCTURE_COLORS.mainBeam} />
        {/* 后悬臂（陆侧延伸） */}
        <SBox args={[5.75, 2.0, 0.8]} position={[14.625, 19.0, -1.0]} color={STRUCTURE_COLORS.mainBeam} />

        {/* 海侧门腿 */}
        <SBox args={[1.2, 18.0, 1.5]} position={[-11.75, 9.0, 0]} color={STRUCTURE_COLORS.mainBeam} />
        {/* 陆侧门腿 */}
        <SBox args={[1.2, 18.0, 1.5]} position={[11.75, 9.0, 0]} color={STRUCTURE_COLORS.mainBeam} />

        {/* 海侧底座 */}
        <SBox args={[2.0, 0.8, 3.0]} position={[-11.75, 0.4, 0]} color={STRUCTURE_COLORS.base} />
        {/* 陆侧底座 */}
        <SBox args={[2.0, 0.8, 3.0]} position={[11.75, 0.4, 0]} color={STRUCTURE_COLORS.base} />

        {/* 连接节点（大梁-门腿交接处） */}
        <SBox args={[2.0, 2.5, 2.0]} position={[-11.75, 19.25, 0]} color={STRUCTURE_COLORS.mainBeam} />
        <SBox args={[2.0, 2.5, 2.0]} position={[11.75, 19.25, 0]} color={STRUCTURE_COLORS.mainBeam} />

        {/* 横梁（加强结构） */}
        <SBox args={[0.3, 0.3, 3.0]} position={[-5, 14, 0]} color={STRUCTURE_COLORS.bracing} />
        <SBox args={[0.3, 0.3, 3.0]} position={[0, 14, 0]} color={STRUCTURE_COLORS.bracing} />
        <SBox args={[0.3, 0.3, 3.0]} position={[5, 14, 0]} color={STRUCTURE_COLORS.bracing} />
      </group>

      {/* ══════════════════════════════════════════
          小车 (Trolley) — 沿 X 轴移动
         ══════════════════════════════════════════ */}
      <group name="trolley">
        {/* 车架 */}
        <SBox args={[3.0, 1.0, 2.5]} position={[1.5, 18.5, 0]} color={STRUCTURE_COLORS.base} />
        {/* 小车电机 */}
        <SCyl radius={0.3} height={0.6} position={[1.5, 18.8, 0.8]} color={STRUCTURE_COLORS.base} rotation={[Math.PI / 2, 0, 0]} />
        {/* 减速箱 */}
        <SBox args={[0.5, 0.4, 0.4]} position={[2.2, 18.5, 0.6]} color={STRUCTURE_COLORS.bracing} />
      </group>

      {/* ══════════════════════════════════════════
          起升机构 (Hoist) — 在小车上
         ══════════════════════════════════════════ */}
      <group name="hoist">
        {/* 卷筒 */}
        <SCyl radius={0.5} height={1.2} position={[0, 18.0, 0]} color={STRUCTURE_COLORS.base} rotation={[0, 0, Math.PI / 2]} />
        {/* 电机 */}
        <SCyl radius={0.4} height={0.8} position={[0, 17.5, 0.6]} color={STRUCTURE_COLORS.base} rotation={[Math.PI / 2, 0, 0]} />
        {/* 减速箱 */}
        <SBox args={[0.6, 0.5, 0.5]} position={[0.7, 17.5, 0]} color={STRUCTURE_COLORS.bracing} />

        {/* 吊具 (Spreader) */}
        <SBox args={[12.2, 0.3, 2.5]} position={[0, 5, 0]} color={STRUCTURE_COLORS.spreader} />

        {/* 钢丝绳 × 4 */}
        <Line
          points={[[-2.5, 17.5, 0.5], [-5, 5.15, 0.5]]}
          color={STRUCTURE_COLORS.wireRope} lineWidth={1.5}
        />
        <Line
          points={[[2.5, 17.5, 0.5], [5, 5.15, 0.5]]}
          color={STRUCTURE_COLORS.wireRope} lineWidth={1.5}
        />
        <Line
          points={[[-2.5, 17.5, -0.5], [-5, 5.15, -0.5]]}
          color={STRUCTURE_COLORS.wireRope} lineWidth={1.5}
        />
        <Line
          points={[[2.5, 17.5, -0.5], [5, 5.15, -0.5]]}
          color={STRUCTURE_COLORS.wireRope} lineWidth={1.5}
        />
      </group>

      {/* ══════════════════════════════════════════
          大车电机 (Gantry Motors) — 门腿底部
         ══════════════════════════════════════════ */}
      <group name="gantry-motors">
        {/* 电机 A（海侧） */}
        <SCyl radius={0.25} height={0.5} position={[-11.75, 0.8, 0.8]} color={STRUCTURE_COLORS.base} rotation={[Math.PI / 2, 0, 0]} />
        {/* 电机 B（陆侧） */}
        <SCyl radius={0.25} height={0.5} position={[11.75, 0.8, 0.8]} color={STRUCTURE_COLORS.base} rotation={[Math.PI / 2, 0, 0]} />
      </group>

      {/* ══════════════════════════════════════════
          传感器热点 × 16
         ══════════════════════════════════════════ */}
      <group name="sensors">
        {RTG_SENSORS.map(sensor => (
          <SensorHotspot
            key={sensor.id}
            sensor={sensor}
            value={sensorValues[sensor.id] ?? null}
            onClick={handleSensorClick}
          />
        ))}
      </group>

      {/* 选中传感器的信息面板 */}
      {selectedSensor && (
        <SensorInfoPanel
          sensor={selectedSensor}
          value={sensorValues[selectedSensor.id] ?? null}
          onClose={() => setSelectedSensor(null)}
        />
      )}

      {/* 地面参考网格 */}
      <gridHelper args={[40, 40, '#333', '#222']} position={[0, -0.01, 0]} />
    </group>
  );
}
