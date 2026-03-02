/**
 * ============================================================================
 * P0-4: 知识图谱 Condition + Case 种子数据
 * ============================================================================
 *
 * 定义工况条件和历史案例的种子数据，供 Neo4j 图存储写入。
 * 数据基于 GJM12 轨道吊真实运维场景。
 *
 * 用法：
 *   import { CONDITION_SEED, CASE_SEED, RELATION_SEED } from './kg-condition-case-seed';
 */

import type { ConditionNode, CaseNode, UnderConditionRelation, ValidatesRelation, SharedComponentRelation } from '../../../lib/storage/neo4j.storage';

// ============================================================================
// Condition 种子数据（6 个工况条件）
// ============================================================================

export const CONDITION_SEED: ConditionNode[] = [
  {
    id: 'COND-HOIST-FULL-LOAD-HIGH-WIND',
    encoding: 'HOIST.FULL_LOAD.HIGH_WIND',
    name: '起升满载+大风',
    type: 'operating',
    description: '起升机构在满载(>85%额定载荷)且风速>15m/s条件下运行',
    parameters: { loadPercent: [85, 100], windSpeed: [15, 25] },
  },
  {
    id: 'COND-TROLLEY-HIGH-SPEED',
    encoding: 'TROLLEY.HIGH_SPEED',
    name: '小车高速运行',
    type: 'operating',
    description: '小车运行速度>80%额定速度',
    parameters: { speedPercent: [80, 100] },
  },
  {
    id: 'COND-ENV-HIGH-TEMP',
    encoding: 'ENV.HIGH_TEMPERATURE',
    name: '高温环境',
    type: 'environmental',
    description: '环境温度>35°C',
    parameters: { ambientTemp: [35, 50] },
  },
  {
    id: 'COND-ENV-SALT-FOG',
    encoding: 'ENV.SALT_FOG',
    name: '盐雾环境',
    type: 'environmental',
    description: '沿海港口盐雾腐蚀环境',
    parameters: { salinity: [3, 35] },
  },
  {
    id: 'COND-LOAD-ECCENTRIC',
    encoding: 'LOAD.ECCENTRIC',
    name: '偏载工况',
    type: 'load',
    description: '起吊重心偏离吊具中心>500mm',
    parameters: { eccentricity: [500, 2000] },
  },
  {
    id: 'COND-HOIST-FREQUENT-START',
    encoding: 'HOIST.FREQUENT_START',
    name: '频繁启停',
    type: 'operating',
    description: '起升机构每小时启停次数>30',
    parameters: { startsPerHour: [30, 60] },
  },
];

// ============================================================================
// Case 种子数据（5 个历史案例）
// ============================================================================

export const CASE_SEED: CaseNode[] = [
  {
    id: 'CASE-001',
    caseId: 'GJM12-2024-001',
    deviceId: 'GJM12',
    type: 'diagnosis',
    description: '起升减速箱高速轴轴承内圈缺陷，BPFI频率幅值3x基线',
    occurredAt: new Date('2024-08-15T10:30:00Z'),
    outcome: 'confirmed',
    severity: 'moderate',
    confidence: 0.92,
    diagnosisMethod: 'envelope',
    rootCause: '润滑不足导致轴承内圈点蚀',
    resolution: '更换轴承并改善润滑方案',
  },
  {
    id: 'CASE-002',
    caseId: 'GJM12-2024-002',
    deviceId: 'GJM12',
    type: 'maintenance',
    description: '小车运行机构预防性维护——更换车轮轴承',
    occurredAt: new Date('2024-09-20T08:00:00Z'),
    outcome: 'restored',
    severity: 'minor',
    confidence: 0.85,
    diagnosisMethod: 'trend',
    resolution: '按计划更换6个车轮轴承',
  },
  {
    id: 'CASE-003',
    caseId: 'GJM12-2024-003',
    deviceId: 'GJM12',
    type: 'failure',
    description: '起升电机过热停机——大风满载工况下连续作业2小时',
    occurredAt: new Date('2024-10-05T14:15:00Z'),
    outcome: 'confirmed',
    severity: 'severe',
    confidence: 0.95,
    diagnosisMethod: 'expert',
    rootCause: '大风阻力增加导致电机持续过载运行',
    resolution: '降低作业速度，增加电机散热装置',
  },
  {
    id: 'CASE-004',
    caseId: 'GJM12-2025-001',
    deviceId: 'GJM12',
    type: 'diagnosis',
    description: '制动器异常滑动——频繁启停后摩擦片过度磨损',
    occurredAt: new Date('2025-01-10T09:45:00Z'),
    outcome: 'confirmed',
    severity: 'critical',
    confidence: 0.88,
    diagnosisMethod: 'spectrum',
    rootCause: '频繁启停导致制动器温度升高，摩擦片热衰退',
    resolution: '更换制动摩擦片，调整启停间隔策略',
  },
  {
    id: 'CASE-005',
    caseId: 'GJM12-2025-002',
    deviceId: 'GJM12',
    type: 'diagnosis',
    description: '减速箱齿轮啮合异常——偏载工况下齿面点蚀',
    occurredAt: new Date('2025-02-01T11:20:00Z'),
    outcome: 'confirmed',
    severity: 'moderate',
    confidence: 0.90,
    diagnosisMethod: 'spectrum',
    rootCause: '长期偏载运行导致齿轮局部接触应力过大',
    resolution: '修复齿面，调整吊具对中精度',
  },
];

// ============================================================================
// 关系种子数据
// ============================================================================

/** UNDER_CONDITION 关系 */
export const UNDER_CONDITION_SEED: Array<{
  faultId: string;
  conditionId: string;
  properties: UnderConditionRelation;
}> = [
  { faultId: 'FAULT-BEARING-WEAR', conditionId: 'COND-HOIST-FULL-LOAD-HIGH-WIND', properties: { probability: 0.35, notes: '满载大风下轴承径向力增大' } },
  { faultId: 'FAULT-BEARING-WEAR', conditionId: 'COND-HOIST-FREQUENT-START', properties: { probability: 0.25, notes: '频繁启停产生冲击载荷' } },
  { faultId: 'FAULT-GEAR-MESH', conditionId: 'COND-LOAD-ECCENTRIC', properties: { probability: 0.40, notes: '偏载导致齿轮非均匀接触' } },
  { faultId: 'FAULT-GEAR-MESH', conditionId: 'COND-TROLLEY-HIGH-SPEED', properties: { probability: 0.20, notes: '高速运行加剧齿轮磨损' } },
  { faultId: 'FAULT-MOTOR-OVERHEAT', conditionId: 'COND-HOIST-FULL-LOAD-HIGH-WIND', properties: { probability: 0.45, notes: '大风阻力+满载增加电机负荷' } },
  { faultId: 'FAULT-MOTOR-OVERHEAT', conditionId: 'COND-ENV-HIGH-TEMP', properties: { probability: 0.30, notes: '高温降低散热效率' } },
  { faultId: 'FAULT-BRAKE-SLIP', conditionId: 'COND-HOIST-FREQUENT-START', properties: { probability: 0.50, notes: '频繁制动导致热衰退' } },
  { faultId: 'FAULT-WIRE-ROPE-FATIGUE', conditionId: 'COND-HOIST-FULL-LOAD-HIGH-WIND', properties: { probability: 0.30, notes: '满载大风增加绳索弯曲应力' } },
  { faultId: 'FAULT-WIRE-ROPE-FATIGUE', conditionId: 'COND-ENV-SALT-FOG', properties: { probability: 0.35, notes: '盐雾腐蚀降低绳索强度' } },
];

/** VALIDATES 关系 */
export const VALIDATES_SEED: Array<{
  caseId: string;
  faultId: string;
  properties: ValidatesRelation;
}> = [
  { caseId: 'CASE-001', faultId: 'FAULT-BEARING-WEAR', properties: { outcome: 'confirmed', confidence: 0.92, method: 'envelope' } },
  { caseId: 'CASE-002', faultId: 'FAULT-BEARING-WEAR', properties: { outcome: 'confirmed', confidence: 0.85, method: 'trend' } },
  { caseId: 'CASE-003', faultId: 'FAULT-MOTOR-OVERHEAT', properties: { outcome: 'confirmed', confidence: 0.95, method: 'expert' } },
  { caseId: 'CASE-004', faultId: 'FAULT-BRAKE-SLIP', properties: { outcome: 'confirmed', confidence: 0.88, method: 'spectrum' } },
  { caseId: 'CASE-005', faultId: 'FAULT-GEAR-MESH', properties: { outcome: 'confirmed', confidence: 0.90, method: 'spectrum' } },
];

/** SHARED_COMPONENT 关系 */
export const SHARED_COMPONENT_SEED: Array<{
  componentId1: string;
  componentId2: string;
  properties: SharedComponentRelation;
}> = [
  {
    componentId1: 'GJM12030301',
    componentId2: 'GJM12030302',
    properties: {
      componentType: 'wheel_assembly',
      similarity: 0.95,
      notes: '同型号车轮总成，可交叉参考振动基线',
    },
  },
];
