/**
 * Neo4j 知识图谱种子数据执行器
 *
 * 启动时幂等执行（所有语句使用 MERGE），重启不重复插入。
 * 执行顺序：设备→部件→传感器→故障→工况→案例→关系
 *
 * 包含数据：
 *   1. RTG-001 双悬臂轨道吊（完整知识图谱，~80 节点）
 *   2. GJM12 轨道吊（小车总成 + 工况/案例，~70 节点）
 *   3. STS-001 岸桥（基本结构，~55 节点）
 *   合计 ≥ 200 节点
 */

import { createModuleLogger } from '../../../core/logger';
import { config } from '../../../core/config';

const log = createModuleLogger('neo4j-seed');

// ============================================================
// GJM12 轨道吊 补充 Cypher（与 RTG-001 互补）
// ============================================================
const GJM12_SEED_CYPHER: string[] = [
  // --- 设备 ---
  `MERGE (e:Equipment {id: 'GJM12'})
   SET e.name = '12号轨道吊', e.type = 'RTG', e.model = 'GJM12',
       e.manufacturer = '日照港', e.location = '堆场B区', e.status = 'active',
       e.metadata = '{"project":"日照港","liftCapacity_t":40,"span_m":23.47}',
       e.createdAt = datetime()`,

  // --- 小车架总成 (4大系统 + 25个子部件) ---
  `MERGE (c:Component {id: 'GJM12.FRAME'}) SET c.name='小车架', c.type='frame', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.HOIST'}) SET c.name='起升机构', c.type='mechanism', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.TRAVEL'}) SET c.name='运行机构', c.type='mechanism', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.SHEAVE'}) SET c.name='滑轮组', c.type='sheave_group', c.createdAt=datetime()`,
  // 起升子部件
  `MERGE (c:Component {id: 'GJM12.HOIST.MOTOR'}) SET c.name='起升电机', c.type='motor', c.specifications='{"power_kw":160,"rpm":1470}', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.HOIST.GBX'}) SET c.name='起升减速箱', c.type='gearbox', c.specifications='{"ratio":28,"stages":3}', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.HOIST.DRUM'}) SET c.name='卷筒', c.type='drum', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.HOIST.BRAKE'}) SET c.name='起升制动器', c.type='brake', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.HOIST.COUPLING'}) SET c.name='起升联轴器', c.type='coupling', c.createdAt=datetime()`,
  // 运行子部件
  `MERGE (c:Component {id: 'GJM12.TRAVEL.MOTOR_L'}) SET c.name='左行走电机', c.type='motor', c.specifications='{"power_kw":15,"side":"left"}', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.TRAVEL.MOTOR_R'}) SET c.name='右行走电机', c.type='motor', c.specifications='{"power_kw":15,"side":"right"}', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.TRAVEL.GBX_L'}) SET c.name='左减速箱', c.type='gearbox', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.TRAVEL.GBX_R'}) SET c.name='右减速箱', c.type='gearbox', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.TRAVEL.WHEEL_L1'}) SET c.name='左前轮', c.type='wheel', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.TRAVEL.WHEEL_L2'}) SET c.name='左后轮', c.type='wheel', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.TRAVEL.WHEEL_R1'}) SET c.name='右前轮', c.type='wheel', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.TRAVEL.WHEEL_R2'}) SET c.name='右后轮', c.type='wheel', c.createdAt=datetime()`,
  // 滑轮组子部件
  `MERGE (c:Component {id: 'GJM12.SHEAVE.UPPER_L'}) SET c.name='左上滑轮组', c.type='sheave', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.SHEAVE.UPPER_R'}) SET c.name='右上滑轮组', c.type='sheave', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.SHEAVE.LOWER'}) SET c.name='下滑轮组(吊具)', c.type='sheave', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.SHEAVE.EQUAL'}) SET c.name='均衡滑轮', c.type='sheave', c.createdAt=datetime()`,
  // 小车架结构件
  `MERGE (c:Component {id: 'GJM12.FRAME.RAIL'}) SET c.name='小车轨道', c.type='rail', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.FRAME.BUFFER'}) SET c.name='缓冲器', c.type='buffer', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'GJM12.FRAME.CABLE'}) SET c.name='电缆卷筒', c.type='cable_reel', c.createdAt=datetime()`,
  // 关键零件(Part)
  `MERGE (p:Part {id: 'GJM12.HOIST.DRUM.AXLE'}) SET p.name='卷筒轴', p.type='axle', p.material='42CrMo', p.createdAt=datetime()`,
  `MERGE (p:Part {id: 'GJM12.HOIST.DRUM.BEARING_DE'}) SET p.name='卷筒驱动端轴承', p.type='bearing', p.model='22326CC/W33', p.createdAt=datetime()`,
  `MERGE (p:Part {id: 'GJM12.HOIST.DRUM.BEARING_NDE'}) SET p.name='卷筒非驱动端轴承', p.type='bearing', p.model='22326CC/W33', p.createdAt=datetime()`,
  `MERGE (p:Part {id: 'GJM12.HOIST.GBX.GEAR_IN'}) SET p.name='输入齿轮', p.type='gear', p.module=3, p.teeth=17, p.createdAt=datetime()`,
  `MERGE (p:Part {id: 'GJM12.HOIST.GBX.GEAR_OUT'}) SET p.name='输出齿轮', p.type='gear', p.module=8, p.teeth=71, p.createdAt=datetime()`,
  `MERGE (p:Part {id: 'GJM12.HOIST.GBX.BEARING_HS'}) SET p.name='高速轴轴承', p.type='bearing', p.model='NU2316', p.createdAt=datetime()`,
  `MERGE (p:Part {id: 'GJM12.HOIST.GBX.BEARING_LS'}) SET p.name='低速轴轴承', p.type='bearing', p.model='23134CC', p.createdAt=datetime()`,
  `MERGE (p:Part {id: 'GJM12.HOIST.BRAKE.PAD'}) SET p.name='制动摩擦片', p.type='brake_pad', p.material='semi-metallic', p.createdAt=datetime()`,
  `MERGE (p:Part {id: 'GJM12.HOIST.BRAKE.DISC'}) SET p.name='制动盘', p.type='brake_disc', p.material='HT250', p.createdAt=datetime()`,
  `MERGE (p:Part {id: 'GJM12.TRAVEL.WHEEL_L1.BEARING'}) SET p.name='左前轮轴承', p.type='bearing', p.model='23040CC', p.createdAt=datetime()`,
  `MERGE (p:Part {id: 'GJM12.TRAVEL.WHEEL_R1.BEARING'}) SET p.name='右前轮轴承', p.type='bearing', p.model='23040CC', p.createdAt=datetime()`,
  `MERGE (p:Part {id: 'GJM12.SHEAVE.UPPER_L.AXLE'}) SET p.name='左上滑轮轴', p.type='axle', p.material='45#', p.createdAt=datetime()`,
  `MERGE (p:Part {id: 'GJM12.SHEAVE.UPPER_L.BEARING'}) SET p.name='左上滑轮轴承', p.type='bearing', p.model='23128CC', p.createdAt=datetime()`,
  `MERGE (p:Part {id: 'GJM12.SHEAVE.UPPER_R.AXLE'}) SET p.name='右上滑轮轴', p.type='axle', p.material='45#', p.createdAt=datetime()`,

  // --- HAS_PART 关系 ---
  `MATCH (e:Equipment {id: 'GJM12'}) MATCH (c:Component {id: 'GJM12.FRAME'}) MERGE (e)-[:HAS_PART {role:'frame'}]->(c)`,
  `MATCH (e:Equipment {id: 'GJM12'}) MATCH (c:Component {id: 'GJM12.HOIST'}) MERGE (e)-[:HAS_PART {role:'mechanism',order:1}]->(c)`,
  `MATCH (e:Equipment {id: 'GJM12'}) MATCH (c:Component {id: 'GJM12.TRAVEL'}) MERGE (e)-[:HAS_PART {role:'mechanism',order:2}]->(c)`,
  `MATCH (e:Equipment {id: 'GJM12'}) MATCH (c:Component {id: 'GJM12.SHEAVE'}) MERGE (e)-[:HAS_PART {role:'sheave',order:3}]->(c)`,
  `MATCH (p:Component {id:'GJM12.HOIST'}) MATCH (c:Component {id:'GJM12.HOIST.MOTOR'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.HOIST'}) MATCH (c:Component {id:'GJM12.HOIST.GBX'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.HOIST'}) MATCH (c:Component {id:'GJM12.HOIST.DRUM'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.HOIST'}) MATCH (c:Component {id:'GJM12.HOIST.BRAKE'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.HOIST'}) MATCH (c:Component {id:'GJM12.HOIST.COUPLING'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.TRAVEL'}) MATCH (c:Component {id:'GJM12.TRAVEL.MOTOR_L'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.TRAVEL'}) MATCH (c:Component {id:'GJM12.TRAVEL.MOTOR_R'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.TRAVEL'}) MATCH (c:Component {id:'GJM12.TRAVEL.GBX_L'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.TRAVEL'}) MATCH (c:Component {id:'GJM12.TRAVEL.GBX_R'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.TRAVEL'}) MATCH (c:Component {id:'GJM12.TRAVEL.WHEEL_L1'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.TRAVEL'}) MATCH (c:Component {id:'GJM12.TRAVEL.WHEEL_L2'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.TRAVEL'}) MATCH (c:Component {id:'GJM12.TRAVEL.WHEEL_R1'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.TRAVEL'}) MATCH (c:Component {id:'GJM12.TRAVEL.WHEEL_R2'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.SHEAVE'}) MATCH (c:Component {id:'GJM12.SHEAVE.UPPER_L'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.SHEAVE'}) MATCH (c:Component {id:'GJM12.SHEAVE.UPPER_R'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.SHEAVE'}) MATCH (c:Component {id:'GJM12.SHEAVE.LOWER'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.SHEAVE'}) MATCH (c:Component {id:'GJM12.SHEAVE.EQUAL'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.FRAME'}) MATCH (c:Component {id:'GJM12.FRAME.RAIL'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.FRAME'}) MATCH (c:Component {id:'GJM12.FRAME.BUFFER'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'GJM12.FRAME'}) MATCH (c:Component {id:'GJM12.FRAME.CABLE'}) MERGE (p)-[:HAS_PART]->(c)`,
  // Parts
  `MATCH (p:Component {id:'GJM12.HOIST.DRUM'}) MATCH (pt:Part {id:'GJM12.HOIST.DRUM.AXLE'}) MERGE (p)-[:HAS_PART]->(pt)`,
  `MATCH (p:Component {id:'GJM12.HOIST.DRUM'}) MATCH (pt:Part {id:'GJM12.HOIST.DRUM.BEARING_DE'}) MERGE (p)-[:HAS_PART]->(pt)`,
  `MATCH (p:Component {id:'GJM12.HOIST.DRUM'}) MATCH (pt:Part {id:'GJM12.HOIST.DRUM.BEARING_NDE'}) MERGE (p)-[:HAS_PART]->(pt)`,
  `MATCH (p:Component {id:'GJM12.HOIST.GBX'}) MATCH (pt:Part {id:'GJM12.HOIST.GBX.GEAR_IN'}) MERGE (p)-[:HAS_PART]->(pt)`,
  `MATCH (p:Component {id:'GJM12.HOIST.GBX'}) MATCH (pt:Part {id:'GJM12.HOIST.GBX.GEAR_OUT'}) MERGE (p)-[:HAS_PART]->(pt)`,
  `MATCH (p:Component {id:'GJM12.HOIST.GBX'}) MATCH (pt:Part {id:'GJM12.HOIST.GBX.BEARING_HS'}) MERGE (p)-[:HAS_PART]->(pt)`,
  `MATCH (p:Component {id:'GJM12.HOIST.GBX'}) MATCH (pt:Part {id:'GJM12.HOIST.GBX.BEARING_LS'}) MERGE (p)-[:HAS_PART]->(pt)`,
  `MATCH (p:Component {id:'GJM12.HOIST.BRAKE'}) MATCH (pt:Part {id:'GJM12.HOIST.BRAKE.PAD'}) MERGE (p)-[:HAS_PART]->(pt)`,
  `MATCH (p:Component {id:'GJM12.HOIST.BRAKE'}) MATCH (pt:Part {id:'GJM12.HOIST.BRAKE.DISC'}) MERGE (p)-[:HAS_PART]->(pt)`,

  // --- GJM12 工况 (Condition) ---
  `MERGE (c:Condition {encoding: 'HOIST.FULL_LOAD.HIGH_WIND'})
   SET c.name='起升满载+大风', c.type='operating',
       c.description='起升机构在满载(>85%额定载荷)且风速>15m/s条件下运行',
       c.parameters='{"loadPercent":[85,100],"windSpeed":[15,25]}', c.createdAt=datetime()`,
  `MERGE (c:Condition {encoding: 'TROLLEY.HIGH_SPEED'})
   SET c.name='小车高速运行', c.type='operating',
       c.description='小车运行速度>80%额定速度',
       c.parameters='{"speedPercent":[80,100]}', c.createdAt=datetime()`,
  `MERGE (c:Condition {encoding: 'ENV.HIGH_TEMPERATURE'})
   SET c.name='高温环境', c.type='environmental',
       c.description='环境温度>35°C',
       c.parameters='{"ambientTemp":[35,50]}', c.createdAt=datetime()`,
  `MERGE (c:Condition {encoding: 'ENV.SALT_FOG'})
   SET c.name='盐雾环境', c.type='environmental',
       c.description='沿海港口盐雾腐蚀环境',
       c.parameters='{"salinity":[3,35]}', c.createdAt=datetime()`,
  `MERGE (c:Condition {encoding: 'LOAD.ECCENTRIC'})
   SET c.name='偏载工况', c.type='load',
       c.description='起吊重心偏离吊具中心>500mm',
       c.parameters='{"eccentricity":[500,2000]}', c.createdAt=datetime()`,
  `MERGE (c:Condition {encoding: 'HOIST.FREQUENT_START'})
   SET c.name='频繁启停', c.type='operating',
       c.description='起升机构每小时启停次数>30',
       c.parameters='{"startsPerHour":[30,60]}', c.createdAt=datetime()`,

  // --- GJM12 案例 (Case) ---
  `MERGE (cs:Case {id: 'GJM12-2024-001'})
   SET cs.caseId='GJM12-2024-001', cs.deviceId='GJM12', cs.type='diagnosis',
       cs.description='起升减速箱高速轴轴承内圈缺陷，BPFI频率幅值3x基线',
       cs.occurredAt=datetime('2024-08-15T10:30:00Z'), cs.outcome='confirmed',
       cs.severity='moderate', cs.confidence=0.92, cs.diagnosisMethod='envelope',
       cs.rootCause='润滑不足导致轴承内圈点蚀', cs.resolution='更换轴承并改善润滑方案'`,
  `MERGE (cs:Case {id: 'GJM12-2024-002'})
   SET cs.caseId='GJM12-2024-002', cs.deviceId='GJM12', cs.type='maintenance',
       cs.description='小车运行机构预防性维护——更换车轮轴承',
       cs.occurredAt=datetime('2024-09-20T08:00:00Z'), cs.outcome='restored',
       cs.severity='minor', cs.confidence=0.85, cs.diagnosisMethod='trend',
       cs.resolution='按计划更换6个车轮轴承'`,
  `MERGE (cs:Case {id: 'GJM12-2024-003'})
   SET cs.caseId='GJM12-2024-003', cs.deviceId='GJM12', cs.type='failure',
       cs.description='起升电机过热停机——大风满载工况下连续作业2小时',
       cs.occurredAt=datetime('2024-10-05T14:15:00Z'), cs.outcome='confirmed',
       cs.severity='severe', cs.confidence=0.95, cs.diagnosisMethod='expert',
       cs.rootCause='大风阻力增加导致电机持续过载运行', cs.resolution='降低作业速度，增加电机散热装置'`,
  `MERGE (cs:Case {id: 'GJM12-2025-001'})
   SET cs.caseId='GJM12-2025-001', cs.deviceId='GJM12', cs.type='diagnosis',
       cs.description='制动器异常滑动——频繁启停后摩擦片过度磨损',
       cs.occurredAt=datetime('2025-01-10T09:45:00Z'), cs.outcome='confirmed',
       cs.severity='critical', cs.confidence=0.88, cs.diagnosisMethod='spectrum',
       cs.rootCause='频繁启停导致制动器温度升高，摩擦片热衰退', cs.resolution='更换制动摩擦片，调整启停间隔策略'`,
  `MERGE (cs:Case {id: 'GJM12-2025-002'})
   SET cs.caseId='GJM12-2025-002', cs.deviceId='GJM12', cs.type='diagnosis',
       cs.description='减速箱齿轮啮合异常——偏载工况下齿面点蚀',
       cs.occurredAt=datetime('2025-02-01T11:20:00Z'), cs.outcome='confirmed',
       cs.severity='moderate', cs.confidence=0.90, cs.diagnosisMethod='spectrum',
       cs.rootCause='长期偏载运行导致齿轮局部接触应力过大', cs.resolution='修复齿面，调整吊具对中精度'`,
];

// ============================================================
// STS-001 岸桥 知识图谱
// ============================================================
const STS_001_SEED_CYPHER: string[] = [
  // --- 设备 ---
  `MERGE (e:Equipment {id: 'PORT.STS.ZPMC.STS-65t.SN20250001'})
   SET e.name = '1号岸桥', e.type = 'STS', e.model = 'STS-65t',
       e.manufacturer = 'ZPMC', e.location = '泊位A1', e.status = 'active',
       e.installDate = date('2023-03-20'),
       e.metadata = '{"liftCapacity_t":65,"outreach_m":65,"backreach_m":20,"liftHeight_m":42}',
       e.createdAt = datetime()`,

  // --- 4大系统 ---
  `MERGE (c:Component {id: 'STS.BOOM'}) SET c.name='前大梁(Boom)', c.type='boom', c.specifications='{"length_m":65,"type":"box_girder"}', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.TROLLEY'}) SET c.name='岸桥小车', c.type='mechanism', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.PORTAL'}) SET c.name='门架', c.type='structure', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.MACHINERY'}) SET c.name='机房', c.type='machinery_house', c.createdAt=datetime()`,

  // --- Boom 子部件 ---
  `MERGE (c:Component {id: 'STS.BOOM.HINGE'}) SET c.name='俯仰铰点', c.type='hinge', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.BOOM.CYLINDER'}) SET c.name='俯仰油缸', c.type='hydraulic_cylinder', c.specifications='{"stroke_mm":6000,"bore_mm":400}', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.BOOM.TIE_ROD'}) SET c.name='拉杆', c.type='tie_rod', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.BOOM.RAIL'}) SET c.name='小车轨道', c.type='rail', c.createdAt=datetime()`,

  // --- Trolley 子部件 ---
  `MERGE (c:Component {id: 'STS.TROLLEY.HOIST_MOTOR'}) SET c.name='起升电机', c.type='motor', c.specifications='{"power_kw":500,"rpm":1485,"voltage_v":6000}', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.TROLLEY.HOIST_GBX'}) SET c.name='起升减速箱', c.type='gearbox', c.specifications='{"ratio":40,"stages":3}', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.TROLLEY.TRAVEL_MOTOR'}) SET c.name='小车电机', c.type='motor', c.specifications='{"power_kw":75,"rpm":1460}', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.TROLLEY.SPREADER'}) SET c.name='吊具(Spreader)', c.type='spreader', c.specifications='{"type":"telescopic","size":"20/40ft"}', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.TROLLEY.HEADBLOCK'}) SET c.name='吊架(Headblock)', c.type='headblock', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.TROLLEY.ROPE'}) SET c.name='钢丝绳', c.type='wire_rope', c.specifications='{"diameter_mm":36,"construction":"6x36WS"}', c.createdAt=datetime()`,

  // --- Portal 子部件 ---
  `MERGE (c:Component {id: 'STS.PORTAL.SEALEG'}) SET c.name='海侧门框', c.type='leg', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.PORTAL.LANDLEG'}) SET c.name='陆侧门框', c.type='leg', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.PORTAL.GANTRY_MOTOR_A'}) SET c.name='大车电机A', c.type='motor', c.specifications='{"power_kw":45}', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.PORTAL.GANTRY_MOTOR_B'}) SET c.name='大车电机B', c.type='motor', c.specifications='{"power_kw":45}', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.PORTAL.BOGIE_SEA'}) SET c.name='海侧行走台车', c.type='bogie', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.PORTAL.BOGIE_LAND'}) SET c.name='陆侧行走台车', c.type='bogie', c.createdAt=datetime()`,

  // --- Machinery 子部件 ---
  `MERGE (c:Component {id: 'STS.MACHINERY.E_ROOM'}) SET c.name='电气室', c.type='electrical_room', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.MACHINERY.XFMR'}) SET c.name='变压器', c.type='transformer', c.specifications='{"capacity_kVA":3150}', c.createdAt=datetime()`,
  `MERGE (c:Component {id: 'STS.MACHINERY.VFD'}) SET c.name='变频器', c.type='vfd', c.createdAt=datetime()`,

  // --- 传感器 (VT-17 to VT-28) ---
  `MERGE (s:Sensor {id: 'VT-17'}) SET s.name='岸桥起升电机驱动端振动', s.sensorType='vibration', s.position='驱动端', s.unit='mm/s', s.sampleRate=12800, s.warningThreshold=7.1, s.criticalThreshold=11.2`,
  `MERGE (s:Sensor {id: 'VT-18'}) SET s.name='岸桥起升电机非驱动端振动', s.sensorType='vibration', s.position='非驱动端', s.unit='mm/s', s.sampleRate=12800, s.warningThreshold=7.1, s.criticalThreshold=11.2`,
  `MERGE (s:Sensor {id: 'VT-19'}) SET s.name='岸桥起升电机绕组温度', s.sensorType='temperature', s.position='定子绕组', s.unit='°C', s.sampleRate=1, s.warningThreshold=80, s.criticalThreshold=100`,
  `MERGE (s:Sensor {id: 'VT-20'}) SET s.name='岸桥起升减速箱高速轴振动', s.sensorType='vibration', s.position='高速轴', s.unit='mm/s', s.sampleRate=12800, s.warningThreshold=7.1, s.criticalThreshold=11.2`,
  `MERGE (s:Sensor {id: 'VT-21'}) SET s.name='岸桥起升减速箱油温', s.sensorType='temperature', s.position='油池', s.unit='°C', s.sampleRate=1, s.warningThreshold=75, s.criticalThreshold=90`,
  `MERGE (s:Sensor {id: 'VT-22'}) SET s.name='岸桥小车电机驱动端振动', s.sensorType='vibration', s.position='驱动端', s.unit='mm/s', s.sampleRate=12800, s.warningThreshold=7.1, s.criticalThreshold=11.2`,
  `MERGE (s:Sensor {id: 'VT-23'}) SET s.name='岸桥小车电机绕组温度', s.sensorType='temperature', s.position='定子绕组', s.unit='°C', s.sampleRate=1, s.warningThreshold=75, s.criticalThreshold=90`,
  `MERGE (s:Sensor {id: 'VT-24'}) SET s.name='岸桥大车电机A驱动端振动', s.sensorType='vibration', s.position='驱动端', s.unit='mm/s', s.sampleRate=12800, s.warningThreshold=7.1, s.criticalThreshold=11.2`,
  `MERGE (s:Sensor {id: 'VT-25'}) SET s.name='岸桥大车电机A绕组温度', s.sensorType='temperature', s.position='定子绕组', s.unit='°C', s.sampleRate=1, s.warningThreshold=75, s.criticalThreshold=90`,
  `MERGE (s:Sensor {id: 'VT-26'}) SET s.name='岸桥大车电机B驱动端振动', s.sensorType='vibration', s.position='驱动端', s.unit='mm/s', s.sampleRate=12800, s.warningThreshold=7.1, s.criticalThreshold=11.2`,
  `MERGE (s:Sensor {id: 'VT-27'}) SET s.name='岸桥俯仰油缸位移', s.sensorType='displacement', s.position='油缸', s.unit='mm', s.sampleRate=100, s.warningThreshold=5800, s.criticalThreshold=5950`,
  `MERGE (s:Sensor {id: 'VT-28'}) SET s.name='岸桥吊具重量', s.sensorType='load', s.position='吊架', s.unit='t', s.sampleRate=10, s.warningThreshold=60, s.criticalThreshold=65`,

  // --- STS故障 (5个) ---
  `MERGE (f:Fault {code: 'STS.SPREADER_TWIST.MAJOR'})
   SET f.name='吊具扭锁故障', f.category='STS', f.type='spreader', f.severity='MAJOR',
       f.description='吊具扭锁机构卡死或未完全锁定', f.frequency=0.08`,
  `MERGE (f:Fault {code: 'STS.BOOM_CRACK.CRITICAL'})
   SET f.name='前大梁疲劳裂纹', f.category='STS', f.type='structural', f.severity='CRITICAL',
       f.description='前大梁焊缝处疲劳裂纹，高应力区', f.frequency=0.01`,
  `MERGE (f:Fault {code: 'STS.ROPE_WEAR.MAJOR'})
   SET f.name='钢丝绳磨损', f.category='STS', f.type='wire_rope', f.severity='MAJOR',
       f.description='钢丝绳断丝、磨损超标', f.frequency=0.10`,
  `MERGE (f:Fault {code: 'STS.VFD_FAULT.MAJOR'})
   SET f.name='变频器故障', f.category='STS', f.type='electrical', f.severity='MAJOR',
       f.description='变频器过热/过流/通信故障', f.frequency=0.05`,
  `MERGE (f:Fault {code: 'STS.BOGIE_WHEEL.MINOR'})
   SET f.name='行走台车车轮磨损', f.category='STS', f.type='wheel', f.severity='MINOR',
       f.description='大车行走台车车轮踏面磨损', f.frequency=0.12`,

  // --- STS 关系 ---
  `MATCH (e:Equipment {id:'PORT.STS.ZPMC.STS-65t.SN20250001'}) MATCH (c:Component {id:'STS.BOOM'}) MERGE (e)-[:HAS_PART {role:'boom',order:1}]->(c)`,
  `MATCH (e:Equipment {id:'PORT.STS.ZPMC.STS-65t.SN20250001'}) MATCH (c:Component {id:'STS.TROLLEY'}) MERGE (e)-[:HAS_PART {role:'trolley',order:2}]->(c)`,
  `MATCH (e:Equipment {id:'PORT.STS.ZPMC.STS-65t.SN20250001'}) MATCH (c:Component {id:'STS.PORTAL'}) MERGE (e)-[:HAS_PART {role:'portal',order:3}]->(c)`,
  `MATCH (e:Equipment {id:'PORT.STS.ZPMC.STS-65t.SN20250001'}) MATCH (c:Component {id:'STS.MACHINERY'}) MERGE (e)-[:HAS_PART {role:'machinery',order:4}]->(c)`,
  `MATCH (p:Component {id:'STS.BOOM'}) MATCH (c:Component {id:'STS.BOOM.HINGE'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.BOOM'}) MATCH (c:Component {id:'STS.BOOM.CYLINDER'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.BOOM'}) MATCH (c:Component {id:'STS.BOOM.TIE_ROD'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.BOOM'}) MATCH (c:Component {id:'STS.BOOM.RAIL'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.TROLLEY'}) MATCH (c:Component {id:'STS.TROLLEY.HOIST_MOTOR'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.TROLLEY'}) MATCH (c:Component {id:'STS.TROLLEY.HOIST_GBX'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.TROLLEY'}) MATCH (c:Component {id:'STS.TROLLEY.TRAVEL_MOTOR'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.TROLLEY'}) MATCH (c:Component {id:'STS.TROLLEY.SPREADER'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.TROLLEY'}) MATCH (c:Component {id:'STS.TROLLEY.HEADBLOCK'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.TROLLEY'}) MATCH (c:Component {id:'STS.TROLLEY.ROPE'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.PORTAL'}) MATCH (c:Component {id:'STS.PORTAL.SEALEG'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.PORTAL'}) MATCH (c:Component {id:'STS.PORTAL.LANDLEG'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.PORTAL'}) MATCH (c:Component {id:'STS.PORTAL.GANTRY_MOTOR_A'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.PORTAL'}) MATCH (c:Component {id:'STS.PORTAL.GANTRY_MOTOR_B'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.PORTAL'}) MATCH (c:Component {id:'STS.PORTAL.BOGIE_SEA'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.PORTAL'}) MATCH (c:Component {id:'STS.PORTAL.BOGIE_LAND'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.MACHINERY'}) MATCH (c:Component {id:'STS.MACHINERY.E_ROOM'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.MACHINERY'}) MATCH (c:Component {id:'STS.MACHINERY.XFMR'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id:'STS.MACHINERY'}) MATCH (c:Component {id:'STS.MACHINERY.VFD'}) MERGE (p)-[:HAS_PART]->(c)`,
  // HAS_SENSOR
  `MATCH (c:Component {id:'STS.TROLLEY.HOIST_MOTOR'}) MATCH (s:Sensor {id:'VT-17'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id:'STS.TROLLEY.HOIST_MOTOR'}) MATCH (s:Sensor {id:'VT-18'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id:'STS.TROLLEY.HOIST_MOTOR'}) MATCH (s:Sensor {id:'VT-19'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id:'STS.TROLLEY.HOIST_GBX'}) MATCH (s:Sensor {id:'VT-20'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id:'STS.TROLLEY.HOIST_GBX'}) MATCH (s:Sensor {id:'VT-21'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id:'STS.TROLLEY.TRAVEL_MOTOR'}) MATCH (s:Sensor {id:'VT-22'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id:'STS.TROLLEY.TRAVEL_MOTOR'}) MATCH (s:Sensor {id:'VT-23'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id:'STS.PORTAL.GANTRY_MOTOR_A'}) MATCH (s:Sensor {id:'VT-24'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id:'STS.PORTAL.GANTRY_MOTOR_A'}) MATCH (s:Sensor {id:'VT-25'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id:'STS.PORTAL.GANTRY_MOTOR_B'}) MATCH (s:Sensor {id:'VT-26'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id:'STS.BOOM.CYLINDER'}) MATCH (s:Sensor {id:'VT-27'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id:'STS.TROLLEY.HEADBLOCK'}) MATCH (s:Sensor {id:'VT-28'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  // DIAGNOSED_BY for STS faults
  `MATCH (f:Fault {code:'STS.BOOM_CRACK.CRITICAL'}) MERGE (a:Algorithm {id:'rainflow_counting'}) MERGE (f)-[:DIAGNOSED_BY {confidence:0.90}]->(a)`,
  `MATCH (f:Fault {code:'STS.BOOM_CRACK.CRITICAL'}) MERGE (a:Algorithm {id:'hot_spot_stress'}) MERGE (f)-[:DIAGNOSED_BY {confidence:0.88}]->(a)`,
  `MATCH (f:Fault {code:'STS.ROPE_WEAR.MAJOR'}) MERGE (a:Algorithm {id:'fft_spectrum'}) MERGE (f)-[:DIAGNOSED_BY {confidence:0.75}]->(a)`,
  // SHARED_COMPONENT between RTG-001 and STS-001
  `MATCH (c1:Component {id:'HOIST.MOTOR'}) MATCH (c2:Component {id:'STS.TROLLEY.HOIST_MOTOR'})
   MERGE (c1)-[:SHARED_COMPONENT {componentType:'hoist_motor', similarity:0.80, notes:'同类起升电机，可交叉对比振动基线'}]->(c2)`,
];

// ============================================================
// 执行器
// ============================================================

/**
 * 执行 Neo4j 知识图谱种子数据（幂等）。
 * 失败不阻塞启动，记录 ERROR 日志。
 */
export async function runNeo4jSeed(): Promise<void> {
  if (!config.neo4j.enabled) {
    log.info('Neo4j disabled, skipping seed');
    return;
  }

  let driver: any;
  try {
    const neo4j = await import('neo4j-driver');
    driver = neo4j.default.driver(
      config.neo4j.url,
      neo4j.default.auth.basic(config.neo4j.user, config.neo4j.password),
    );
    await driver.verifyConnectivity();
    log.info('Neo4j connected, starting seed...');
  } catch (err: any) {
    log.error(`Neo4j connection failed, skipping seed: ${err.message}`);
    return;
  }

  const session = driver.session({ database: config.neo4j.database });

  try {
    // 1. RTG-001 seed (已有的完整知识图谱)
    const { RTG_001_SEED_CYPHER } = await import('./rtg-001-cypher');
    let executed = 0;
    let failed = 0;

    const allStatements = [
      ...RTG_001_SEED_CYPHER,
      ...GJM12_SEED_CYPHER,
      ...STS_001_SEED_CYPHER,
    ];

    for (const stmt of allStatements) {
      try {
        await session.run(stmt);
        executed++;
      } catch (err: any) {
        failed++;
        // 约束重复等可忽略的错误
        if (!err.message?.includes('already exists')) {
          log.warn(`Seed statement failed: ${err.message} | ${stmt.substring(0, 80)}...`);
        }
      }
    }

    // 2. 验证节点数量
    const countResult = await session.run('MATCH (n) RETURN count(n) AS total');
    const totalNodes = countResult.records[0]?.get('total')?.toNumber?.() ?? countResult.records[0]?.get('total') ?? 0;

    log.info(`Neo4j seed complete: ${executed} executed, ${failed} failed, ${totalNodes} total nodes`);

    if (totalNodes < 200) {
      log.warn(`Node count ${totalNodes} < 200, some seed statements may have failed`);
    } else {
      log.info(`✓ Neo4j commercial-grade: ${totalNodes} nodes ready`);
    }
  } catch (err: any) {
    log.error(`Neo4j seed execution error: ${err.message}`);
  } finally {
    await session.close();
    await driver.close();
  }
}
