/**
 * P1-4: 跨设备横向对比 tRPC 路由
 *
 * 将 SharedComponentDiscoveryService 暴露为 API 端点:
 *   - listDevices          — 获取可用设备列表
 *   - getSharedComponents  — 获取指定设备的共享部件关系
 *   - getFaultHistory      — 获取关联设备的故障历史
 *   - getAlerts            — 获取故障传播预警
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../core/trpc';
import { machineIdSchema } from '../../shared/contracts/schemas';
import {
  SharedComponentDiscoveryService,
  type EquipmentInfo,
  type ComponentInfo,
  type SharedComponentRelation,
  type FaultHistoryEntry,
} from '../platform/hde/comparator/shared-component-discovery.service';

// ============================================================================
// 单例懒加载（含开发用种子数据）
// ============================================================================

let svcInstance: SharedComponentDiscoveryService | null = null;

function getService(): SharedComponentDiscoveryService {
  if (!svcInstance) {
    svcInstance = new SharedComponentDiscoveryService();

    // Seed with demo equipment + components for development
    svcInstance.registerBatch(
      [
        { equipmentId: 'STS-001', equipmentName: '岸桥 #1', equipmentType: 'STS', manufacturer: 'ZPMC', model: 'STS-65t', location: '泊位1' },
        { equipmentId: 'STS-002', equipmentName: '岸桥 #2', equipmentType: 'STS', manufacturer: 'ZPMC', model: 'STS-65t', location: '泊位2' },
        { equipmentId: 'STS-003', equipmentName: '岸桥 #3', equipmentType: 'STS', manufacturer: 'ZPMC', model: 'STS-65t', location: '泊位3' },
        { equipmentId: 'RTG-001', equipmentName: '场桥 #1', equipmentType: 'RTG', manufacturer: 'ZPMC', model: 'RTG-40t', location: '堆场A' },
        { equipmentId: 'RTG-002', equipmentName: '场桥 #2', equipmentType: 'RTG', manufacturer: 'ZPMC', model: 'RTG-40t', location: '堆场B' },
      ],
      [
        { componentId: 'C-STS001-BRG1', componentName: '起升轴承', componentType: 'bearing', partNumber: 'SKF-6310-2RS', manufacturer: 'SKF', model: '6310-2RS', parentEquipmentId: 'STS-001', healthScore: 72 },
        { componentId: 'C-STS002-BRG1', componentName: '起升轴承', componentType: 'bearing', partNumber: 'SKF-6310-2RS', manufacturer: 'SKF', model: '6310-2RS', parentEquipmentId: 'STS-002', healthScore: 65 },
        { componentId: 'C-STS003-BRG1', componentName: '起升轴承', componentType: 'bearing', partNumber: 'SKF-6310-2RS', manufacturer: 'SKF', model: '6310-2RS', parentEquipmentId: 'STS-003', healthScore: 88 },
        { componentId: 'C-RTG001-BRG1', componentName: '起升轴承', componentType: 'bearing', partNumber: 'SKF-6310-2RS', manufacturer: 'SKF', model: '6310-2RS', parentEquipmentId: 'RTG-001', healthScore: 81 },
        { componentId: 'C-STS001-GBX1', componentName: '起升减速箱', componentType: 'gearbox', partNumber: 'SEW-K87-R57', manufacturer: 'SEW', model: 'K87-R57', parentEquipmentId: 'STS-001', healthScore: 90 },
        { componentId: 'C-STS002-GBX1', componentName: '起升减速箱', componentType: 'gearbox', partNumber: 'SEW-K87-R57', manufacturer: 'SEW', model: 'K87-R57', parentEquipmentId: 'STS-002', healthScore: 85 },
        { componentId: 'C-STS002-MTR1', componentName: '起升电机', componentType: 'motor', partNumber: 'SIE-1LE0-37KW', manufacturer: 'Siemens', model: '1LE0-37KW', parentEquipmentId: 'STS-002', healthScore: 91 },
        { componentId: 'C-STS003-MTR1', componentName: '起升电机', componentType: 'motor', partNumber: 'SIE-1LE0-37KW', manufacturer: 'Siemens', model: '1LE0-37KW', parentEquipmentId: 'STS-003', healthScore: 94 },
        { componentId: 'C-RTG001-BRK1', componentName: '制动器', componentType: 'brake', partNumber: 'SIBRE-TE500', manufacturer: 'SIBRE', model: 'TE500', parentEquipmentId: 'RTG-001', healthScore: 87 },
        { componentId: 'C-RTG002-BRK1', componentName: '制动器', componentType: 'brake', partNumber: 'SIBRE-TE500', manufacturer: 'SIBRE', model: 'TE500', parentEquipmentId: 'RTG-002', healthScore: 79 },
      ]
    );

    // Run discovery
    svcInstance.discoverSharedComponents();
  }
  return svcInstance;
}

// ============================================================================
// Router
// ============================================================================

export const crossDeviceRouter = router({
  /**
   * 获取可用设备列表
   * 从 service 已注册的设备中返回 id + name
   */
  listDevices: protectedProcedure.query(() => {
    const svc = getService();
    return svc.getAllEquipment().map(e => ({ id: e.equipmentId, name: e.equipmentName }));
  }),

  /**
   * 获取指定设备的共享部件关系
   * 可选按部件类型过滤
   */
  getSharedComponents: protectedProcedure
    .input(z.object({ deviceId: machineIdSchema, componentType: z.string().optional() }))
    .query(({ input }) => {
      const svc = getService();
      const relations = svc.getSharedRelations();
      let filtered = relations.filter(
        r => r.equipmentA === input.deviceId || r.equipmentB === input.deviceId
      );
      if (input.componentType) {
        filtered = filtered.filter(r => r.componentType === input.componentType);
      }

      // Access private components map for health scores via type assertion
      // (no public getAllComponents accessor on the service)
      const components = (svc as unknown as { components: Map<string, ComponentInfo> }).components;

      return filtered.map(r => ({
        ...r,
        id: `SC-${r.equipmentA}-${r.equipmentB}-${r.componentType}`,
        equipmentAName: svc.getEquipment(r.equipmentA)?.equipmentName ?? r.equipmentA,
        equipmentBName: svc.getEquipment(r.equipmentB)?.equipmentName ?? r.equipmentB,
        healthA: components.get(r.componentIdA)?.healthScore ?? 0,
        healthB: components.get(r.componentIdB)?.healthScore ?? 0,
      }));
    }),

  /**
   * 获取关联设备的故障历史
   * 根据共享部件关系找出 peer 设备，返回 peer 设备的故障记录
   */
  getFaultHistory: protectedProcedure
    .input(z.object({ deviceId: machineIdSchema }))
    .query(({ input }) => {
      const svc = getService();
      const faultHistory = svc.getFaultHistory();
      const relations = svc.getSharedRelations();

      // 获取 peer 设备 ID 集合
      const peerIds = new Set<string>();
      for (const r of relations) {
        if (r.equipmentA === input.deviceId) peerIds.add(r.equipmentB);
        if (r.equipmentB === input.deviceId) peerIds.add(r.equipmentA);
      }

      return faultHistory.filter(f => peerIds.has(f.equipmentId));
    }),

  /**
   * 获取故障传播预警
   * 根据共享部件的健康分数生成预警
   */
  getAlerts: protectedProcedure
    .input(z.object({ deviceId: machineIdSchema }))
    .query(({ input }) => {
      const svc = getService();
      const relations = svc.getSharedRelations();
      const components = (svc as unknown as { components: Map<string, ComponentInfo> }).components;

      const alerts: Array<{
        id: string;
        sourceEquipmentName: string;
        affectedEquipmentName: string;
        faultType: string;
        severity: string;
        alertLevel: string;
        sharedComponentType: string;
        sharedPartNumber: string;
        affectedHealth: number;
        recommendation: string;
        description: string;
        createdAt: string;
      }> = [];

      const deviceRelations = relations.filter(
        r => r.equipmentA === input.deviceId || r.equipmentB === input.deviceId
      );

      for (const r of deviceRelations) {
        const peerId = r.equipmentA === input.deviceId ? r.equipmentB : r.equipmentA;
        const peerComp = r.equipmentA === input.deviceId ? r.componentIdB : r.componentIdA;
        const health = components.get(peerComp)?.healthScore ?? 100;

        if (health < 85) {
          const alertLevel = health < 70 ? 'critical' : health < 80 ? 'warning' : 'info';
          const sourceName = svc.getEquipment(input.deviceId)?.equipmentName ?? input.deviceId;
          const peerName = svc.getEquipment(peerId)?.equipmentName ?? peerId;

          alerts.push({
            id: `ALT-${r.equipmentA}-${r.equipmentB}-${r.componentType}`,
            sourceEquipmentName: sourceName,
            affectedEquipmentName: peerName,
            faultType: `${r.componentType}_wear`,
            severity: alertLevel === 'critical' ? 'critical' : alertLevel === 'warning' ? 'high' : 'medium',
            alertLevel,
            sharedComponentType: r.componentType,
            sharedPartNumber: r.partNumber,
            affectedHealth: health,
            recommendation: alertLevel === 'critical'
              ? `立即检查 ${peerName} 的 ${r.componentType}，安排紧急维护`
              : alertLevel === 'warning'
                ? `安排 ${peerName} 的 ${r.componentType} 专项检测`
                : `将 ${peerName} 的 ${r.componentType} 加入下次维护计划`,
            description: `${sourceName} 与 ${peerName} 共享同型号 ${r.componentType}(${r.partNumber})，当前健康分 ${health}`,
            createdAt: new Date().toISOString(),
          });
        }
      }

      return alerts;
    }),
});
