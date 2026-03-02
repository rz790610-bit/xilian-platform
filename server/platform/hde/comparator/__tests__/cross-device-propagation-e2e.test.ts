/**
 * ============================================================================
 * P1-4 E2E 测试: 跨设备横向对比 — SHARED_COMPONENT 自动发现 + 故障传播预警
 * ============================================================================
 *
 * 验收标准:
 *   AC-1: 2 台 STS 共享 SKF 6310 轴承 → 自动创建 SHARED_COMPONENT 关系
 *   AC-2: 设备 A 诊断 bearing_damage → 查询返回设备 B 同型号部件及其健康状态
 *   AC-3: Cypher 查询（§3.6 跨设备故障传播）在 < 500ms 内返回结果
 *   AC-4: 前端横向对比页面展示：共享部件列表、对应故障历史、预警状态
 *        （前端由浏览器截图验证，此处验证数据完整性）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SharedComponentDiscoveryService,
  getSharedComponentDiscoveryService,
  resetSharedComponentDiscoveryService,
  type EquipmentInfo,
  type ComponentInfo,
  type FaultHistoryEntry,
} from '../shared-component-discovery.service';

// ============================================================================
// 测试数据工厂
// ============================================================================

/** 创建 STS 设备 */
function createSTS(id: string, name: string, location: string): EquipmentInfo {
  return {
    equipmentId: id,
    equipmentName: name,
    equipmentType: 'STS',
    manufacturer: 'ZPMC',
    model: 'STS-65t',
    location,
  };
}

/** 创建 RTG 设备 */
function createRTG(id: string, name: string, location: string): EquipmentInfo {
  return {
    equipmentId: id,
    equipmentName: name,
    equipmentType: 'RTG',
    manufacturer: 'Liebherr',
    model: 'RTG-45t',
    location,
  };
}

/** 创建 SKF 6310 轴承部件 */
function createSKF6310Bearing(
  compId: string,
  parentId: string,
  healthScore: number = 85,
): ComponentInfo {
  return {
    componentId: compId,
    componentName: 'SKF 6310 深沟球轴承',
    componentType: 'bearing',
    partNumber: 'SKF-6310-2RS',
    manufacturer: 'SKF',
    model: '6310-2RS',
    parentEquipmentId: parentId,
    installDate: '2024-06-15',
    healthScore,
  };
}

/** 创建通用减速箱齿轮部件 */
function createGearbox(
  compId: string,
  parentId: string,
  healthScore: number = 90,
): ComponentInfo {
  return {
    componentId: compId,
    componentName: 'SEW K87 减速箱',
    componentType: 'gearbox',
    partNumber: 'SEW-K87-R57',
    manufacturer: 'SEW',
    model: 'K87-R57',
    parentEquipmentId: parentId,
    installDate: '2024-03-10',
    healthScore,
  };
}

/** 创建电机部件 */
function createMotor(
  compId: string,
  parentId: string,
  healthScore: number = 92,
): ComponentInfo {
  return {
    componentId: compId,
    componentName: 'Siemens 1LE0 电机',
    componentType: 'motor',
    partNumber: 'SIE-1LE0-37KW',
    manufacturer: 'Siemens',
    model: '1LE0-37KW',
    parentEquipmentId: parentId,
    installDate: '2024-01-20',
    healthScore,
  };
}

/** 创建故障历史 */
function createFault(
  equipId: string,
  equipName: string,
  faultType: string,
  faultCode: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  status: 'active' | 'resolved' | 'monitoring' = 'active',
  componentType: string = 'bearing',
  componentId: string = 'comp-unknown',
): FaultHistoryEntry {
  return {
    equipmentId: equipId,
    equipmentName: equipName,
    faultType,
    faultCode,
    severity,
    occurredAt: new Date().toISOString(),
    status,
    componentType,
    componentId,
  };
}

// ============================================================================
// 测试用例
// ============================================================================

describe('P1-4: 跨设备横向对比 — SHARED_COMPONENT + 故障传播', () => {
  let service: SharedComponentDiscoveryService;

  beforeEach(() => {
    resetSharedComponentDiscoveryService();
    service = getSharedComponentDiscoveryService();
  });

  // ==========================================================================
  // AC-1: 2 台 STS 共享 SKF 6310 轴承 → 自动创建 SHARED_COMPONENT 关系
  // ==========================================================================

  describe('AC-1: SHARED_COMPONENT 自动发现', () => {
    it('2 台 STS 共享 SKF 6310 → 创建 SHARED_COMPONENT', () => {
      const sts1 = createSTS('STS-001', '岸桥 #1', '泊位 A1');
      const sts2 = createSTS('STS-002', '岸桥 #2', '泊位 A2');

      const bearing1 = createSKF6310Bearing('COMP-STS1-BRG', 'STS-001', 85);
      const bearing2 = createSKF6310Bearing('COMP-STS2-BRG', 'STS-002', 78);

      service.registerBatch([sts1, sts2], [bearing1, bearing2]);
      const relations = service.discoverSharedComponents();

      // 应发现 1 条 SHARED_COMPONENT 关系
      expect(relations.length).toBe(1);

      const rel = relations[0];
      expect(rel.equipmentA).toBe('STS-001');
      expect(rel.equipmentB).toBe('STS-002');
      expect(rel.componentType).toBe('bearing');
      expect(rel.manufacturer).toBe('SKF');
      expect(rel.partNumber).toBe('SKF-6310-2RS');
      // 完全匹配 partNumber + manufacturer → 相似度 1.0
      expect(rel.similarity).toBe(1.0);
    });

    it('3 台设备共享同型号部件 → 创建 3 条关系（C(3,2)）', () => {
      const sts1 = createSTS('STS-001', '岸桥 #1', '泊位 A1');
      const sts2 = createSTS('STS-002', '岸桥 #2', '泊位 A2');
      const sts3 = createSTS('STS-003', '岸桥 #3', '泊位 A3');

      const b1 = createSKF6310Bearing('COMP-B1', 'STS-001');
      const b2 = createSKF6310Bearing('COMP-B2', 'STS-002');
      const b3 = createSKF6310Bearing('COMP-B3', 'STS-003');

      service.registerBatch([sts1, sts2, sts3], [b1, b2, b3]);
      const relations = service.discoverSharedComponents();

      // C(3,2) = 3 条关系
      expect(relations.length).toBe(3);
    });

    it('同设备内的部件不创建 SHARED_COMPONENT', () => {
      const sts1 = createSTS('STS-001', '岸桥 #1', '泊位 A1');

      // 同一设备上两个相同型号轴承
      const b1 = createSKF6310Bearing('COMP-B1', 'STS-001');
      const b2 = createSKF6310Bearing('COMP-B2', 'STS-001');

      service.registerBatch([sts1], [b1, b2]);
      const relations = service.discoverSharedComponents();

      expect(relations.length).toBe(0);
    });

    it('不同制造商的同型号不创建关系', () => {
      const sts1 = createSTS('STS-001', '岸桥 #1', '泊位 A1');
      const sts2 = createSTS('STS-002', '岸桥 #2', '泊位 A2');

      const b1: ComponentInfo = {
        componentId: 'COMP-B1',
        componentName: 'SKF 轴承',
        componentType: 'bearing',
        partNumber: 'SKF-6310-2RS',
        manufacturer: 'SKF',
        model: '6310-2RS',
        parentEquipmentId: 'STS-001',
        healthScore: 85,
      };
      const b2: ComponentInfo = {
        componentId: 'COMP-B2',
        componentName: 'NSK 轴承',
        componentType: 'bearing',
        partNumber: 'NSK-6310-DDU',  // 不同 partNumber
        manufacturer: 'NSK',          // 不同制造商
        model: '6310-DDU',
        parentEquipmentId: 'STS-002',
        healthScore: 80,
      };

      service.registerBatch([sts1, sts2], [b1, b2]);
      const relations = service.discoverSharedComponents();

      expect(relations.length).toBe(0);
    });

    it('多种部件类型 → 每种类型独立发现关系', () => {
      const sts1 = createSTS('STS-001', '岸桥 #1', '泊位 A1');
      const sts2 = createSTS('STS-002', '岸桥 #2', '泊位 A2');

      const b1 = createSKF6310Bearing('COMP-B1', 'STS-001');
      const b2 = createSKF6310Bearing('COMP-B2', 'STS-002');
      const g1 = createGearbox('COMP-G1', 'STS-001');
      const g2 = createGearbox('COMP-G2', 'STS-002');
      const m1 = createMotor('COMP-M1', 'STS-001');
      const m2 = createMotor('COMP-M2', 'STS-002');

      service.registerBatch([sts1, sts2], [b1, b2, g1, g2, m1, m2]);
      const relations = service.discoverSharedComponents();

      // 3 种部件 × 1 对设备 = 3 条关系
      expect(relations.length).toBe(3);

      const types = new Set(relations.map(r => r.componentType));
      expect(types.has('bearing')).toBe(true);
      expect(types.has('gearbox')).toBe(true);
      expect(types.has('motor')).toBe(true);
    });
  });

  // ==========================================================================
  // AC-2: 设备 A 诊断 bearing_damage → 返回设备 B 同型号部件及健康状态
  // ==========================================================================

  describe('AC-2: 故障传播查询', () => {
    it('设备 A bearing_damage → 返回设备 B 同型号轴承 + 健康分', () => {
      const sts1 = createSTS('STS-001', '岸桥 #1', '泊位 A1');
      const sts2 = createSTS('STS-002', '岸桥 #2', '泊位 A2');

      const b1 = createSKF6310Bearing('COMP-B1', 'STS-001', 30); // A 设备轴承健康差
      const b2 = createSKF6310Bearing('COMP-B2', 'STS-002', 75); // B 设备轴承

      service.registerBatch([sts1, sts2], [b1, b2]);
      service.discoverSharedComponents();

      // 设备 A 诊断 bearing_damage
      const result = service.queryFaultPropagation(
        'STS-001', 'bearing_damage', 'F-BRG-001', 'high', 0.92
      );

      // 验证源设备
      expect(result.sourceEquipment.equipmentId).toBe('STS-001');
      expect(result.sourceEquipment.equipmentName).toBe('岸桥 #1');

      // 验证共享部件关系
      expect(result.sharedComponents.length).toBe(1);
      expect(result.sharedComponents[0].componentType).toBe('bearing');
      expect(result.sharedComponents[0].partNumber).toBe('SKF-6310-2RS');

      // 验证传播预警
      expect(result.alerts.length).toBe(1);
      const alert = result.alerts[0];
      expect(alert.affectedEquipmentId).toBe('STS-002');
      expect(alert.affectedEquipmentName).toBe('岸桥 #2');
      expect(alert.faultType).toBe('bearing_damage');
      expect(alert.severity).toBe('high');
      expect(alert.confidence).toBe(0.92);
      expect(alert.affectedComponentHealth).toBe(75);
      expect(alert.sharedComponent.partNumber).toBe('SKF-6310-2RS');
    });

    it('高严重度 + 低健康分 → critical 预警', () => {
      const sts1 = createSTS('STS-001', '岸桥 #1', '泊位 A1');
      const sts2 = createSTS('STS-002', '岸桥 #2', '泊位 A2');

      const b1 = createSKF6310Bearing('COMP-B1', 'STS-001', 20);
      const b2 = createSKF6310Bearing('COMP-B2', 'STS-002', 45); // 低健康分

      service.registerBatch([sts1, sts2], [b1, b2]);
      service.discoverSharedComponents();

      const result = service.queryFaultPropagation(
        'STS-001', 'bearing_damage', 'F-BRG-001', 'critical', 0.95
      );

      expect(result.alerts[0].alertLevel).toBe('critical');
      expect(result.alerts[0].recommendation).toContain('立即检查');
    });

    it('低严重度 → info 预警', () => {
      const sts1 = createSTS('STS-001', '岸桥 #1', '泊位 A1');
      const sts2 = createSTS('STS-002', '岸桥 #2', '泊位 A2');

      const b1 = createSKF6310Bearing('COMP-B1', 'STS-001', 85);
      const b2 = createSKF6310Bearing('COMP-B2', 'STS-002', 80);

      service.registerBatch([sts1, sts2], [b1, b2]);
      service.discoverSharedComponents();

      const result = service.queryFaultPropagation(
        'STS-001', 'minor_wear', 'F-BRG-010', 'low', 0.6
      );

      expect(result.alerts[0].alertLevel).toBe('info');
      expect(result.alerts[0].recommendation).toContain('维护计划');
    });

    it('不存在的设备 → 返回空结果', () => {
      const result = service.queryFaultPropagation(
        'NOT-EXIST', 'bearing_damage', 'F-001', 'high', 0.9
      );

      expect(result.sourceEquipment.equipmentId).toBe('NOT-EXIST');
      expect(result.sharedComponents.length).toBe(0);
      expect(result.alerts.length).toBe(0);
    });

    it('传播预警包含故障历史', () => {
      const sts1 = createSTS('STS-001', '岸桥 #1', '泊位 A1');
      const sts2 = createSTS('STS-002', '岸桥 #2', '泊位 A2');

      const b1 = createSKF6310Bearing('COMP-B1', 'STS-001', 30);
      const b2 = createSKF6310Bearing('COMP-B2', 'STS-002', 65);

      service.registerBatch([sts1, sts2], [b1, b2]);
      service.discoverSharedComponents();

      // 设备 B 有历史故障
      service.addFaultHistory(
        createFault('STS-002', '岸桥 #2', 'bearing_wear', 'F-BRG-005', 'medium', 'resolved', 'bearing', 'COMP-B2')
      );
      service.addFaultHistory(
        createFault('STS-002', '岸桥 #2', 'vibration_anomaly', 'F-VIB-003', 'high', 'monitoring', 'bearing', 'COMP-B2')
      );

      const result = service.queryFaultPropagation(
        'STS-001', 'bearing_damage', 'F-BRG-001', 'high', 0.88
      );

      // 关联设备的故障历史应包含在结果中
      expect(result.faultHistory.length).toBe(2);
      expect(result.faultHistory[0].equipmentId).toBe('STS-002');
    });
  });

  // ==========================================================================
  // AC-3: Cypher 查询（§3.6 跨设备故障传播）在 < 500ms 内返回
  // ==========================================================================

  describe('AC-3: Cypher 查询性能 < 500ms', () => {
    it('§3.6 Cypher 查询 < 500ms（10 台设备 × 5 部件/台 = 50 部件）', () => {
      // 注册 10 台设备
      const devices: EquipmentInfo[] = [];
      const components: ComponentInfo[] = [];

      for (let i = 1; i <= 10; i++) {
        devices.push(createSTS(`STS-${String(i).padStart(3, '0')}`, `岸桥 #${i}`, `泊位 A${i}`));

        // 每台设备 5 个部件（其中轴承和减速箱共享）
        components.push(createSKF6310Bearing(`COMP-B-${i}`, `STS-${String(i).padStart(3, '0')}`, 70 + i * 2));
        components.push(createGearbox(`COMP-G-${i}`, `STS-${String(i).padStart(3, '0')}`, 80 + i));
        components.push(createMotor(`COMP-M-${i}`, `STS-${String(i).padStart(3, '0')}`, 85 + i));
        components.push({
          componentId: `COMP-BRAKE-${i}`,
          componentName: '制动器',
          componentType: 'brake',
          partNumber: 'SIBRE-TE500',
          manufacturer: 'SIBRE',
          model: 'TE500',
          parentEquipmentId: `STS-${String(i).padStart(3, '0')}`,
          healthScore: 88,
        });
        components.push({
          componentId: `COMP-ENCODER-${i}`,
          componentName: '编码器',
          componentType: 'encoder',
          partNumber: 'HEIDENHAIN-ERN1387',
          manufacturer: 'HEIDENHAIN',
          model: 'ERN1387',
          parentEquipmentId: `STS-${String(i).padStart(3, '0')}`,
          healthScore: 95,
        });
      }

      service.registerBatch(devices, components);
      service.discoverSharedComponents();

      // 添加一些故障历史
      for (let i = 1; i <= 5; i++) {
        service.addFaultHistory(
          createFault(
            `STS-${String(i).padStart(3, '0')}`, `岸桥 #${i}`,
            'bearing_wear', `F-BRG-${i}`, 'high', 'monitoring',
            'bearing', `COMP-B-${i}`
          )
        );
      }

      // Cypher 查询性能测试
      const startTime = performance.now();
      const result = service.cypherCrossDeviceFaultPropagation('STS-001');
      const durationMs = performance.now() - startTime;

      // 严格 < 500ms
      expect(durationMs).toBeLessThan(500);

      // 查询应返回其他 9 台设备（每种共享部件一条）
      // STS-001 与其他 9 台设备各共享 5 种部件 → 45 条关系 → 9 台设备 × 5 部件
      expect(result.results.length).toBeGreaterThan(0);

      // 验证结果中包含 peer 设备信息
      const peerIds = new Set(result.results.map(r => r.peerEquipment));
      expect(peerIds.has('STS-002')).toBe(true);
      expect(peerIds.has('STS-010')).toBe(true);

      // 验证高严重度故障被收集
      const withFaults = result.results.filter(r => r.peerFaults.length > 0);
      expect(withFaults.length).toBeGreaterThan(0);
    });

    it('空图谱查询 < 1ms', () => {
      const startTime = performance.now();
      const result = service.cypherCrossDeviceFaultPropagation('STS-001');
      const durationMs = performance.now() - startTime;

      expect(durationMs).toBeLessThan(1);
      expect(result.results.length).toBe(0);
    });

    it('100 台设备 Cypher 查询 < 500ms', () => {
      const devices: EquipmentInfo[] = [];
      const components: ComponentInfo[] = [];

      for (let i = 1; i <= 100; i++) {
        const id = `DEV-${String(i).padStart(4, '0')}`;
        devices.push(createSTS(id, `设备 #${i}`, `位置 ${i}`));
        components.push(createSKF6310Bearing(`BRG-${i}`, id, 70 + (i % 30)));
        components.push(createGearbox(`GBX-${i}`, id, 80 + (i % 20)));
      }

      service.registerBatch(devices, components);
      service.discoverSharedComponents();

      // 添加大量故障
      for (let i = 1; i <= 50; i++) {
        service.addFaultHistory(
          createFault(
            `DEV-${String(i).padStart(4, '0')}`, `设备 #${i}`,
            'bearing_defect', `F-${i}`, i % 3 === 0 ? 'critical' : 'high',
            'active', 'bearing', `BRG-${i}`
          )
        );
      }

      const startTime = performance.now();
      const result = service.cypherCrossDeviceFaultPropagation('DEV-0001');
      const durationMs = performance.now() - startTime;

      expect(durationMs).toBeLessThan(500);
      expect(result.results.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // AC-4: 数据完整性（前端由截图验证，此处验证数据结构）
  // ==========================================================================

  describe('AC-4: 完整数据结构验证', () => {
    it('CrossDeviceComparisonResult 包含所有必需字段', () => {
      const sts1 = createSTS('STS-001', '岸桥 #1', '泊位 A1');
      const sts2 = createSTS('STS-002', '岸桥 #2', '泊位 A2');
      const sts3 = createSTS('STS-003', '岸桥 #3', '泊位 A3');

      const b1 = createSKF6310Bearing('COMP-B1', 'STS-001', 30);
      const b2 = createSKF6310Bearing('COMP-B2', 'STS-002', 65);
      const b3 = createSKF6310Bearing('COMP-B3', 'STS-003', 88);

      service.registerBatch([sts1, sts2, sts3], [b1, b2, b3]);
      service.discoverSharedComponents();

      // 设备 B 历史故障
      service.addFaultHistory(
        createFault('STS-002', '岸桥 #2', 'bearing_wear', 'F-BRG-005', 'high', 'resolved', 'bearing', 'COMP-B2')
      );
      // 设备 C 历史故障
      service.addFaultHistory(
        createFault('STS-003', '岸桥 #3', 'vibration_anomaly', 'F-VIB-010', 'medium', 'monitoring', 'bearing', 'COMP-B3')
      );

      const result = service.queryFaultPropagation(
        'STS-001', 'bearing_damage', 'F-BRG-001', 'critical', 0.95
      );

      // 1. 源设备完整
      expect(result.sourceEquipment).toMatchObject({
        equipmentId: 'STS-001',
        equipmentName: '岸桥 #1',
        equipmentType: 'STS',
      });

      // 2. 共享部件列表
      expect(result.sharedComponents.length).toBe(2); // STS-002 和 STS-003

      // 3. 故障历史
      expect(result.faultHistory.length).toBe(2);

      // 4. 预警状态
      expect(result.alerts.length).toBe(2);
      for (const alert of result.alerts) {
        expect(alert).toHaveProperty('sourceEquipmentId');
        expect(alert).toHaveProperty('affectedEquipmentId');
        expect(alert).toHaveProperty('faultType');
        expect(alert).toHaveProperty('severity');
        expect(alert).toHaveProperty('confidence');
        expect(alert).toHaveProperty('sharedComponent');
        expect(alert).toHaveProperty('affectedComponentHealth');
        expect(alert).toHaveProperty('alertLevel');
        expect(alert).toHaveProperty('description');
        expect(alert).toHaveProperty('recommendation');
        expect(alert).toHaveProperty('createdAt');
        expect(alert.sharedComponent).toHaveProperty('componentType');
        expect(alert.sharedComponent).toHaveProperty('manufacturer');
        expect(alert.sharedComponent).toHaveProperty('model');
        expect(alert.sharedComponent).toHaveProperty('partNumber');
      }

      // 5. 执行时间
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('混合设备类型（STS + RTG）的跨类型共享部件', () => {
      const sts = createSTS('STS-001', '岸桥 #1', '泊位 A1');
      const rtg = createRTG('RTG-001', '场桥 #1', '堆场 B1');

      // STS 和 RTG 共享同型号轴承
      const b1 = createSKF6310Bearing('COMP-B1', 'STS-001', 72);
      const b2 = createSKF6310Bearing('COMP-B2', 'RTG-001', 81);

      service.registerBatch([sts, rtg], [b1, b2]);
      const relations = service.discoverSharedComponents();

      // 不同设备类型也可以发现共享部件
      expect(relations.length).toBe(1);
      expect(relations[0].equipmentA).toBe('STS-001');
      expect(relations[0].equipmentB).toBe('RTG-001');
    });
  });

  // ==========================================================================
  // 工厂函数测试
  // ==========================================================================

  describe('单例工厂函数', () => {
    it('getSharedComponentDiscoveryService 返回单例', () => {
      resetSharedComponentDiscoveryService();
      const a = getSharedComponentDiscoveryService();
      const b = getSharedComponentDiscoveryService();
      expect(a).toBe(b);
    });

    it('resetSharedComponentDiscoveryService 清空状态', () => {
      const s1 = getSharedComponentDiscoveryService();
      s1.registerEquipment(createSTS('STS-001', '岸桥 #1', '泊位 A1'));
      expect(s1.getAllEquipment().length).toBe(1);

      resetSharedComponentDiscoveryService();
      const s2 = getSharedComponentDiscoveryService();
      expect(s2.getAllEquipment().length).toBe(0);
    });
  });

  // ==========================================================================
  // 端到端集成: 完整故障传播流程
  // ==========================================================================

  describe('端到端: 完整故障传播流程', () => {
    it('发现 → 注入故障 → 查询传播 → 生成预警', () => {
      // 1. 注册设备和部件
      const sts1 = createSTS('STS-001', '岸桥 #1', '泊位 A1');
      const sts2 = createSTS('STS-002', '岸桥 #2', '泊位 A2');
      const rtg1 = createRTG('RTG-001', '场桥 #1', '堆场 B1');

      const b1 = createSKF6310Bearing('COMP-B1', 'STS-001', 25);
      const b2 = createSKF6310Bearing('COMP-B2', 'STS-002', 68);
      const b3 = createSKF6310Bearing('COMP-B3', 'RTG-001', 82);
      const g1 = createGearbox('COMP-G1', 'STS-001', 90);
      const g2 = createGearbox('COMP-G2', 'STS-002', 85);

      service.registerBatch([sts1, sts2, rtg1], [b1, b2, b3, g1, g2]);

      // 2. 自动发现共享部件
      const relations = service.discoverSharedComponents();
      expect(relations.length).toBe(4); // 3 个轴承关系 + 1 个减速箱关系

      // 3. 注入故障历史
      service.addFaultHistory(
        createFault('STS-002', '岸桥 #2', 'bearing_temperature_high', 'F-BRG-T01', 'high', 'monitoring', 'bearing', 'COMP-B2')
      );

      // 4. STS-001 诊断 bearing_damage → 查询传播
      const result = service.queryFaultPropagation(
        'STS-001', 'bearing_damage', 'F-BRG-001', 'critical', 0.93
      );

      // 验证: 返回 STS-002 和 RTG-001 的轴承预警
      const bearingAlerts = result.alerts.filter(a => a.sharedComponent.componentType === 'bearing');
      expect(bearingAlerts.length).toBe(2);

      // STS-002 轴承健康分 68 >= 60 + critical 严重度 → warning 预警
      const sts2Alert = bearingAlerts.find(a => a.affectedEquipmentId === 'STS-002');
      expect(sts2Alert).toBeDefined();
      expect(sts2Alert!.alertLevel).toBe('warning');
      expect(sts2Alert!.affectedComponentHealth).toBe(68);

      // RTG-001 轴承健康分 82 + critical 严重度 → warning 预警
      const rtg1Alert = bearingAlerts.find(a => a.affectedEquipmentId === 'RTG-001');
      expect(rtg1Alert).toBeDefined();
      expect(rtg1Alert!.alertLevel).toBe('warning');
      expect(rtg1Alert!.affectedComponentHealth).toBe(82);

      // 5. 验证 STS-002 的故障历史被包含
      const sts2Faults = result.faultHistory.filter(f => f.equipmentId === 'STS-002');
      expect(sts2Faults.length).toBe(1);

      // 6. Cypher 查询也能正常工作
      const cypherResult = service.cypherCrossDeviceFaultPropagation('STS-001');
      expect(cypherResult.results.length).toBeGreaterThan(0);
      expect(cypherResult.executionTimeMs).toBeLessThan(500);
    });
  });
});
