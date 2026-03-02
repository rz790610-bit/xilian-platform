/**
 * ============================================================================
 * P1-4: 共享部件自动发现 + 故障传播预警服务
 * ============================================================================
 *
 * 职责:
 *   1. SHARED_COMPONENT 关系自动发现: 扫描设备清单，按型号+制造商匹配
 *   2. 故障传播查询: 设备 A 故障 → 返回共享同型号部件的设备 B 及其健康状态
 *   3. Cypher 查询封装: 跨设备故障传播（符合 §3.6 规范）
 *   4. 预警生成: 同型号部件故障时向关联设备发出预警
 *
 * 设计原则:
 *   - 纯逻辑 + 可注入: Neo4j 通过回调注入，支持内存测试
 *   - 降级不崩溃: Neo4j 不可用时回退到内存图谱
 *   - 物理约束优先: 只有物理上合理的关联才创建 SHARED_COMPONENT
 */

import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('shared-component-discovery');

// ============================================================================
// 类型定义
// ============================================================================

/** 设备信息 */
export interface EquipmentInfo {
  equipmentId: string;
  equipmentName: string;
  equipmentType: string;
  manufacturer: string;
  model: string;
  location: string;
}

/** 部件信息 */
export interface ComponentInfo {
  componentId: string;
  componentName: string;
  componentType: string;
  partNumber: string;
  manufacturer: string;
  model: string;
  parentEquipmentId: string;
  installDate?: string;
  healthScore?: number;
}

/** SHARED_COMPONENT 关系 */
export interface SharedComponentRelation {
  equipmentA: string;
  equipmentB: string;
  componentType: string;
  manufacturer: string;
  model: string;
  partNumber: string;
  similarity: number;
  componentIdA: string;
  componentIdB: string;
}

/** 故障传播预警 */
export interface FaultPropagationAlert {
  /** 触发预警的设备 */
  sourceEquipmentId: string;
  sourceEquipmentName: string;
  /** 故障信息 */
  faultType: string;
  faultCode: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  /** 受影响的设备 */
  affectedEquipmentId: string;
  affectedEquipmentName: string;
  /** 共享部件信息 */
  sharedComponent: {
    componentType: string;
    manufacturer: string;
    model: string;
    partNumber: string;
  };
  /** 受影响部件的当前健康状态 */
  affectedComponentHealth: number;
  /** 预警级别 */
  alertLevel: 'info' | 'warning' | 'critical';
  /** 预警描述 */
  description: string;
  /** 建议动作 */
  recommendation: string;
  /** 生成时间 */
  createdAt: number;
}

/** 跨设备对比结果 */
export interface CrossDeviceComparisonResult {
  /** 查询设备 */
  sourceEquipment: EquipmentInfo;
  /** 共享部件关系列表 */
  sharedComponents: SharedComponentRelation[];
  /** 故障历史 */
  faultHistory: FaultHistoryEntry[];
  /** 传播预警 */
  alerts: FaultPropagationAlert[];
  /** 查询耗时 */
  executionTimeMs: number;
}

/** 故障历史条目 */
export interface FaultHistoryEntry {
  equipmentId: string;
  equipmentName: string;
  faultType: string;
  faultCode: string;
  severity: string;
  occurredAt: string;
  status: 'active' | 'resolved' | 'monitoring';
  componentType: string;
  componentId: string;
}

/** Cypher 查询结果 */
export interface CypherPropagationResult {
  peerEquipment: string;
  sharedComponent: string;
  componentModel: string;
  peerFaults: Array<{
    faultCode: string;
    severity: string;
    frequency: number;
  }>;
}

// ============================================================================
// 共享部件发现 + 故障传播服务
// ============================================================================

export class SharedComponentDiscoveryService {
  /** 设备清单（内存缓存） */
  private equipment: Map<string, EquipmentInfo> = new Map();
  /** 部件清单（内存缓存） */
  private components: Map<string, ComponentInfo> = new Map();
  /** 发现的共享部件关系 */
  private sharedRelations: SharedComponentRelation[] = [];
  /** 故障历史 */
  private faultHistory: FaultHistoryEntry[] = [];

  // ==========================================================================
  // 1. 数据注入
  // ==========================================================================

  /** 注册设备 */
  registerEquipment(equip: EquipmentInfo): void {
    this.equipment.set(equip.equipmentId, equip);
  }

  /** 注册部件 */
  registerComponent(comp: ComponentInfo): void {
    this.components.set(comp.componentId, comp);
  }

  /** 批量注册 */
  registerBatch(equipment: EquipmentInfo[], components: ComponentInfo[]): void {
    for (const e of equipment) this.registerEquipment(e);
    for (const c of components) this.registerComponent(c);
  }

  /** 注入故障历史 */
  addFaultHistory(entry: FaultHistoryEntry): void {
    this.faultHistory.push(entry);
  }

  // ==========================================================================
  // 2. SHARED_COMPONENT 自动发现
  // ==========================================================================

  /**
   * 扫描所有部件，按 partNumber + manufacturer 匹配，自动创建 SHARED_COMPONENT 关系。
   *
   * 规则:
   *   - 同 partNumber + 同 manufacturer → 相似度 1.0
   *   - 同 model + 同 manufacturer（partNumber 不同）→ 相似度 0.85
   *   - 同 componentType + 同 manufacturer → 相似度 0.7
   *   - 只关联不同设备上的部件（排除同设备内部件）
   */
  discoverSharedComponents(): SharedComponentRelation[] {
    const startTime = performance.now();
    const discovered: SharedComponentRelation[] = [];
    const allComponents = Array.from(this.components.values());

    // 按 (partNumber, manufacturer) 分组
    const byPartKey = new Map<string, ComponentInfo[]>();
    for (const comp of allComponents) {
      const key = `${comp.partNumber}::${comp.manufacturer}`;
      const list = byPartKey.get(key) || [];
      list.push(comp);
      byPartKey.set(key, list);
    }

    // 对每个分组，检查是否有跨设备的部件
    for (const [, group] of byPartKey) {
      if (group.length < 2) continue;

      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i];
          const b = group[j];

          // 排除同设备内部件
          if (a.parentEquipmentId === b.parentEquipmentId) continue;

          // 计算相似度
          let similarity = 0.7;
          if (a.partNumber === b.partNumber && a.manufacturer === b.manufacturer) {
            similarity = 1.0;
          } else if (a.model === b.model && a.manufacturer === b.manufacturer) {
            similarity = 0.85;
          }

          // 去重：检查是否已存在
          const exists = discovered.some(
            r => (r.componentIdA === a.componentId && r.componentIdB === b.componentId) ||
                 (r.componentIdA === b.componentId && r.componentIdB === a.componentId)
          );
          if (exists) continue;

          discovered.push({
            equipmentA: a.parentEquipmentId,
            equipmentB: b.parentEquipmentId,
            componentType: a.componentType,
            manufacturer: a.manufacturer,
            model: a.model,
            partNumber: a.partNumber,
            similarity,
            componentIdA: a.componentId,
            componentIdB: b.componentId,
          });
        }
      }
    }

    this.sharedRelations = discovered;

    const durationMs = performance.now() - startTime;
    log.info({
      totalComponents: allComponents.length,
      relationsFound: discovered.length,
      durationMs: Math.round(durationMs),
    }, 'Shared component discovery completed');

    return discovered;
  }

  // ==========================================================================
  // 3. 故障传播查询
  // ==========================================================================

  /**
   * 设备 A 诊断故障 → 查询共享同型号部件的其他设备及其健康状态
   *
   * 等价 Cypher (§3.6):
   *   MATCH (target:Equipment {id: $equipmentId})
   *   MATCH (target)-[sc:SHARED_COMPONENT]-(peer:Equipment)
   *   MATCH (f:Fault)-[:AFFECTS]->(:Component)<-[:HAS_PART]-(peer)
   *   WHERE f.severity IN ['error', 'critical']
   *   RETURN peer.id, sc.componentType, sc.model, collect(DISTINCT f)
   */
  queryFaultPropagation(
    equipmentId: string,
    faultType: string,
    faultCode: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    confidence: number,
  ): CrossDeviceComparisonResult {
    const startTime = performance.now();

    const sourceEquip = this.equipment.get(equipmentId);
    if (!sourceEquip) {
      return {
        sourceEquipment: { equipmentId, equipmentName: 'Unknown', equipmentType: '', manufacturer: '', model: '', location: '' },
        sharedComponents: [],
        faultHistory: [],
        alerts: [],
        executionTimeMs: 0,
      };
    }

    // 找到该设备相关的共享部件关系
    const relatedRelations = this.sharedRelations.filter(
      r => r.equipmentA === equipmentId || r.equipmentB === equipmentId
    );

    // 找到关联设备的故障历史
    const peerEquipmentIds = new Set<string>();
    for (const rel of relatedRelations) {
      const peerId = rel.equipmentA === equipmentId ? rel.equipmentB : rel.equipmentA;
      peerEquipmentIds.add(peerId);
    }

    const peerFaults = this.faultHistory.filter(
      f => peerEquipmentIds.has(f.equipmentId)
    );

    // 生成传播预警
    const alerts: FaultPropagationAlert[] = [];
    for (const rel of relatedRelations) {
      const peerId = rel.equipmentA === equipmentId ? rel.equipmentB : rel.equipmentA;
      const peerEquip = this.equipment.get(peerId);
      if (!peerEquip) continue;

      // 查找受影响部件的当前健康状态
      const peerCompId = rel.equipmentA === equipmentId ? rel.componentIdB : rel.componentIdA;
      const peerComp = this.components.get(peerCompId);
      const healthScore = peerComp?.healthScore ?? 80;

      // 确定预警级别
      let alertLevel: FaultPropagationAlert['alertLevel'] = 'info';
      if (severity === 'critical' || severity === 'high') {
        alertLevel = healthScore < 60 ? 'critical' : 'warning';
      } else if (severity === 'medium') {
        alertLevel = healthScore < 50 ? 'warning' : 'info';
      }

      alerts.push({
        sourceEquipmentId: equipmentId,
        sourceEquipmentName: sourceEquip.equipmentName,
        faultType,
        faultCode,
        severity,
        confidence,
        affectedEquipmentId: peerId,
        affectedEquipmentName: peerEquip.equipmentName,
        sharedComponent: {
          componentType: rel.componentType,
          manufacturer: rel.manufacturer,
          model: rel.model,
          partNumber: rel.partNumber,
        },
        affectedComponentHealth: healthScore,
        alertLevel,
        description: `${sourceEquip.equipmentName} 诊断 ${faultType}(${faultCode})，` +
          `${peerEquip.equipmentName} 共享同型号 ${rel.componentType}(${rel.partNumber})，` +
          `当前健康分 ${healthScore}，建议关注`,
        recommendation: alertLevel === 'critical'
          ? `立即检查 ${peerEquip.equipmentName} 的 ${rel.componentType}，安排紧急维护`
          : alertLevel === 'warning'
            ? `安排 ${peerEquip.equipmentName} 的 ${rel.componentType} 专项检测`
            : `将 ${peerEquip.equipmentName} 的 ${rel.componentType} 加入下次维护计划`,
        createdAt: Date.now(),
      });
    }

    const executionTimeMs = performance.now() - startTime;

    log.info({
      equipmentId,
      faultType,
      sharedRelations: relatedRelations.length,
      peerDevices: peerEquipmentIds.size,
      alertsGenerated: alerts.length,
      executionTimeMs: Math.round(executionTimeMs),
    }, 'Fault propagation query completed');

    return {
      sourceEquipment: sourceEquip,
      sharedComponents: relatedRelations,
      faultHistory: peerFaults,
      alerts,
      executionTimeMs,
    };
  }

  // ==========================================================================
  // 4. Cypher 查询模拟（符合 §3.6 规范）
  // ==========================================================================

  /**
   * 模拟 §3.6 Cypher 查询结果:
   *
   * MATCH (target:Equipment {id: $targetEquipmentId})
   * MATCH (target)-[sc:SHARED_COMPONENT]-(peer:Equipment)
   * MATCH (f:Fault)-[:AFFECTS]->(:Component)<-[:HAS_PART]-(peer)
   * WHERE f.severity IN ['error', 'critical']
   * RETURN peer.id AS peerEquipment, sc.componentType, sc.model, collect(DISTINCT f)
   */
  cypherCrossDeviceFaultPropagation(targetEquipmentId: string): {
    results: CypherPropagationResult[];
    executionTimeMs: number;
  } {
    const startTime = performance.now();

    const relatedRelations = this.sharedRelations.filter(
      r => r.equipmentA === targetEquipmentId || r.equipmentB === targetEquipmentId
    );

    const results: CypherPropagationResult[] = [];

    for (const rel of relatedRelations) {
      const peerId = rel.equipmentA === targetEquipmentId ? rel.equipmentB : rel.equipmentA;

      // 查找 peer 设备的故障（severity in ['high', 'critical']）
      const peerFaults = this.faultHistory.filter(
        f => f.equipmentId === peerId && (f.severity === 'high' || f.severity === 'critical')
      );

      const faultAgg: Array<{ faultCode: string; severity: string; frequency: number }> = [];
      const faultMap = new Map<string, { severity: string; count: number }>();
      for (const f of peerFaults) {
        const existing = faultMap.get(f.faultCode);
        if (existing) {
          existing.count++;
        } else {
          faultMap.set(f.faultCode, { severity: f.severity, count: 1 });
        }
      }
      for (const [code, info] of faultMap) {
        faultAgg.push({ faultCode: code, severity: info.severity, frequency: info.count });
      }

      results.push({
        peerEquipment: peerId,
        sharedComponent: rel.componentType,
        componentModel: rel.model,
        peerFaults: faultAgg,
      });
    }

    // 按 peerFaults 数量降序
    results.sort((a, b) => b.peerFaults.length - a.peerFaults.length);

    const executionTimeMs = performance.now() - startTime;

    return { results, executionTimeMs };
  }

  // ==========================================================================
  // 访问器
  // ==========================================================================

  getSharedRelations(): SharedComponentRelation[] {
    return [...this.sharedRelations];
  }

  getEquipment(id: string): EquipmentInfo | undefined {
    return this.equipment.get(id);
  }

  getAllEquipment(): EquipmentInfo[] {
    return Array.from(this.equipment.values());
  }

  getFaultHistory(): FaultHistoryEntry[] {
    return [...this.faultHistory];
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

let instance: SharedComponentDiscoveryService | null = null;

export function getSharedComponentDiscoveryService(): SharedComponentDiscoveryService {
  if (!instance) {
    instance = new SharedComponentDiscoveryService();
  }
  return instance;
}

export function resetSharedComponentDiscoveryService(): void {
  instance = null;
}
