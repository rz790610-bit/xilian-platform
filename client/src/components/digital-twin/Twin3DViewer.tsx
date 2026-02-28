/**
 * 三维查看器主组件
 *
 * 提供:
 *   - React Three Fiber Canvas
 *   - OrbitControls 旋转/缩放
 *   - 灯光设置
 *   - 传感器数据注入（从 tRPC 轮询获取）
 *   - 图例面板
 */
import { Suspense, useMemo, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { PageCard } from '@/components/common/PageCard';
import RTGModel from './rtg-model/RTGModel';
import { RTG_SENSORS, RTG_DIMENSIONS, STATUS_COLORS, getSensorStatus, type RTGSensor } from './rtg-model/rtg-constants';
import { useLocation } from 'wouter';

interface Twin3DViewerProps {
  equipmentId: string;
}

function SceneContent({ sensorValues, onSensorClick }: {
  sensorValues: Record<string, number | null>;
  onSensorClick?: (sensor: RTGSensor) => void;
}) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[30, 20, 25]} fov={45} />
      <OrbitControls
        target={[0, RTG_DIMENSIONS.centerY, 0]}
        maxPolarAngle={Math.PI / 2}
        minDistance={10}
        maxDistance={60}
        enableDamping
        dampingFactor={0.1}
      />
      {/* 灯光 */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[20, 30, 15]} intensity={0.8} castShadow />
      <directionalLight position={[-15, 25, -10]} intensity={0.3} />
      <hemisphereLight intensity={0.3} color="#b1e1ff" groundColor="#444" />
      {/* RTG 模型 */}
      <RTGModel sensorValues={sensorValues} onSensorClick={onSensorClick} />
    </>
  );
}

export default function Twin3DViewer({ equipmentId }: Twin3DViewerProps) {
  const [, setLocation] = useLocation();

  // tRPC 轮询传感器数据
  const stateQuery = trpc.evoPipeline.getEquipmentTwinState.useQuery(
    { equipmentId },
    { refetchInterval: 5000, retry: 2 },
  );

  const data = stateQuery.data as any;
  const stateVector = data?.stateVector ?? {};

  // 将 stateVector 映射到传感器 ID
  const sensorValues = useMemo(() => {
    const values: Record<string, number | null> = {};
    for (const sensor of RTG_SENSORS) {
      // 尝试从 stateVector 中按传感器 ID 或索引获取值
      const key = sensor.id.replace('VT-', '');
      const idx = parseInt(key, 10) - 1;
      const keys = Object.keys(stateVector);
      values[sensor.id] = keys[idx] != null ? (stateVector[keys[idx]] as number ?? null) : null;
    }
    return values;
  }, [stateVector]);

  const handleSensorClick = useCallback((sensor: RTGSensor) => {
    // 可导航到诊断页面
    // setLocation(`/diagnosis?component=${sensor.group.toUpperCase()}.MOTOR`);
  }, []);

  // 统计传感器状态
  const statusCounts = useMemo(() => {
    const counts = { normal: 0, warning: 0, alarm: 0, offline: 0 };
    for (const sensor of RTG_SENSORS) {
      const status = getSensorStatus(sensor, sensorValues[sensor.id]);
      counts[status]++;
    }
    return counts;
  }, [sensorValues]);

  return (
    <div className="space-y-2">
      {/* 状态概览 */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-xs text-muted-foreground">传感器状态：</span>
        {statusCounts.normal > 0 && (
          <Badge variant="outline" className="text-[9px] gap-1">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: STATUS_COLORS.normal }} />
            正常 {statusCounts.normal}
          </Badge>
        )}
        {statusCounts.warning > 0 && (
          <Badge variant="outline" className="text-[9px] gap-1">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: STATUS_COLORS.warning }} />
            预警 {statusCounts.warning}
          </Badge>
        )}
        {statusCounts.alarm > 0 && (
          <Badge variant="destructive" className="text-[9px] gap-1">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: STATUS_COLORS.alarm }} />
            报警 {statusCounts.alarm}
          </Badge>
        )}
        {statusCounts.offline > 0 && (
          <Badge variant="secondary" className="text-[9px] gap-1">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: STATUS_COLORS.offline }} />
            离线 {statusCounts.offline}
          </Badge>
        )}
        <span className="flex-1" />
        <span className="text-[9px] text-muted-foreground">鼠标拖拽旋转 | 滚轮缩放 | 点击传感器查看详情</span>
      </div>

      {/* 三维视图 */}
      <div className="rounded-lg border border-border overflow-hidden" style={{ height: 520 }}>
        <Suspense fallback={
          <div className="flex items-center justify-center h-full bg-muted/30">
            <span className="text-xs text-muted-foreground">加载三维模型...</span>
          </div>
        }>
          <Canvas
            gl={{ antialias: true, alpha: false }}
            style={{ background: '#0a0a0a' }}
          >
            <SceneContent sensorValues={sensorValues} onSensorClick={handleSensorClick} />
          </Canvas>
        </Suspense>
      </div>

      {/* 传感器列表 */}
      <PageCard title="传感器一览" icon={<span>📡</span>} compact>
        <div className="grid grid-cols-4 gap-1">
          {RTG_SENSORS.map(sensor => {
            const val = sensorValues[sensor.id];
            const status = getSensorStatus(sensor, val);
            return (
              <div
                key={sensor.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] hover:bg-muted/50 transition-colors"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: STATUS_COLORS[status] }}
                />
                <span className="font-mono text-muted-foreground w-10 shrink-0">{sensor.id}</span>
                <span className="truncate flex-1">{sensor.label}</span>
                <span className="font-mono font-medium shrink-0">
                  {val != null ? val.toFixed(2) : '--'}
                </span>
                <span className="text-muted-foreground shrink-0">{sensor.unit}</span>
              </div>
            );
          })}
        </div>
      </PageCard>
    </div>
  );
}
