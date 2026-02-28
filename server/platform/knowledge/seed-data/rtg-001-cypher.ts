/**
 * RTG-001 双悬臂轨道吊 — Neo4j 知识图谱种子 Cypher
 *
 * 平台第一台真实设备的知识图谱建库语句。
 * 设备编码: PORT.RTG.ZPMC.DCRG-45t.SN20260001
 *
 * 节点: Equipment(1) + Component(11) + Sensor(31) + Fault(12) + Solution(6) + Condition(5)
 * 关系: HAS_PART + HAS_SENSOR + CAUSES + RESOLVED_BY + UNDER_CONDITION + DIAGNOSED_BY
 */

// ============================================================
// 使用方式:
//   import { RTG_001_SEED_CYPHER } from './rtg-001-cypher';
//   await neo4jDriver.executeWrite(tx => {
//     for (const stmt of RTG_001_SEED_CYPHER) {
//       tx.run(stmt);
//     }
//   });
// ============================================================

export const RTG_001_SEED_CYPHER: string[] = [

  // ============================================================
  // §0 约束与索引（幂等）
  // ============================================================

  `CREATE CONSTRAINT equipment_id IF NOT EXISTS FOR (e:Equipment) REQUIRE e.id IS UNIQUE`,
  `CREATE CONSTRAINT component_id IF NOT EXISTS FOR (c:Component) REQUIRE c.id IS UNIQUE`,
  `CREATE CONSTRAINT sensor_id IF NOT EXISTS FOR (s:Sensor) REQUIRE s.id IS UNIQUE`,
  `CREATE CONSTRAINT fault_code IF NOT EXISTS FOR (f:Fault) REQUIRE f.code IS UNIQUE`,
  `CREATE CONSTRAINT solution_id IF NOT EXISTS FOR (s:Solution) REQUIRE s.id IS UNIQUE`,
  `CREATE CONSTRAINT condition_encoding IF NOT EXISTS FOR (c:Condition) REQUIRE c.encoding IS UNIQUE`,

  `CREATE INDEX equipment_type IF NOT EXISTS FOR (e:Equipment) ON (e.type)`,
  `CREATE INDEX component_type IF NOT EXISTS FOR (c:Component) ON (c.type)`,
  `CREATE INDEX sensor_type IF NOT EXISTS FOR (s:Sensor) ON (s.sensorType)`,
  `CREATE INDEX fault_category IF NOT EXISTS FOR (f:Fault) ON (f.category)`,

  // ============================================================
  // §1 设备节点 (Equipment)
  // ============================================================

  `MERGE (e:Equipment {id: 'PORT.RTG.ZPMC.DCRG-45t.SN20260001'})
   SET e.name       = '1号双悬臂轨道吊',
       e.type       = 'RTG',
       e.model      = 'DCRG-45t',
       e.manufacturer = 'ZPMC',
       e.location   = '堆场A区',
       e.status     = 'active',
       e.installDate = date('2024-06-15'),
       e.metadata   = '{"liftCapacity_t":45,"span_m":23.47,"cantilever":"double","gauge_m":16}',
       e.createdAt  = datetime()`,

  // ============================================================
  // §2 部件节点 (Component) — 4 大系统 11 个部件
  // ============================================================

  // --- 起升机构 ---
  `MERGE (c:Component {id: 'HOIST'})
   SET c.name = '起升机构', c.type = 'mechanism', c.createdAt = datetime()`,
  `MERGE (c:Component {id: 'HOIST.MOTOR'})
   SET c.name = '起升电机', c.type = 'motor',
       c.specifications = '{"power_kw":200,"rpm":1480,"voltage_v":380,"poles":4,"insulation":"F"}',
       c.createdAt = datetime()`,
  `MERGE (c:Component {id: 'HOIST.GBX'})
   SET c.name = '起升减速箱', c.type = 'gearbox',
       c.specifications = '{"ratio":31.5,"stages":3,"type":"helical","lubrication":"splash"}',
       c.createdAt = datetime()`,

  // --- 小车运行机构 ---
  `MERGE (c:Component {id: 'TROLLEY'})
   SET c.name = '小车运行机构', c.type = 'mechanism', c.createdAt = datetime()`,
  `MERGE (c:Component {id: 'TROLLEY.MOTOR'})
   SET c.name = '小车电机', c.type = 'motor',
       c.specifications = '{"power_kw":30,"rpm":1460,"voltage_v":380,"poles":4,"insulation":"F"}',
       c.createdAt = datetime()`,
  `MERGE (c:Component {id: 'TROLLEY.GBX'})
   SET c.name = '小车减速箱', c.type = 'gearbox',
       c.specifications = '{"ratio":25,"stages":2,"type":"helical","lubrication":"splash"}',
       c.createdAt = datetime()`,

  // --- 大车运行机构 ---
  `MERGE (c:Component {id: 'GANTRY'})
   SET c.name = '大车运行机构', c.type = 'mechanism', c.createdAt = datetime()`,
  `MERGE (c:Component {id: 'GANTRY.MOTOR_A'})
   SET c.name = '大车电机A（海侧）', c.type = 'motor',
       c.specifications = '{"power_kw":22,"rpm":1460,"voltage_v":380,"poles":4,"side":"sea"}',
       c.createdAt = datetime()`,
  `MERGE (c:Component {id: 'GANTRY.MOTOR_B'})
   SET c.name = '大车电机B（陆侧）', c.type = 'motor',
       c.specifications = '{"power_kw":22,"rpm":1460,"voltage_v":380,"poles":4,"side":"land"}',
       c.createdAt = datetime()`,

  // --- 钢结构 ---
  `MERGE (c:Component {id: 'STRUCTURE'})
   SET c.name = '钢结构', c.type = 'structure', c.createdAt = datetime()`,
  `MERGE (c:Component {id: 'STRUCTURE.FBEAM'})
   SET c.name = '前大梁', c.type = 'beam',
       c.specifications = '{"material":"Q345B","section":"box","length_m":23.47}',
       c.createdAt = datetime()`,
  `MERGE (c:Component {id: 'STRUCTURE.RBEAM'})
   SET c.name = '后大梁', c.type = 'beam',
       c.specifications = '{"material":"Q345B","section":"box","length_m":23.47}',
       c.createdAt = datetime()`,
  `MERGE (c:Component {id: 'STRUCTURE.SLEG'})
   SET c.name = '海侧门腿', c.type = 'leg',
       c.specifications = '{"material":"Q345B","section":"box","height_m":18.5,"side":"sea"}',
       c.createdAt = datetime()`,
  `MERGE (c:Component {id: 'STRUCTURE.LLEG'})
   SET c.name = '陆侧门腿', c.type = 'leg',
       c.specifications = '{"material":"Q345B","section":"box","height_m":18.5,"side":"land"}',
       c.createdAt = datetime()`,
  `MERGE (c:Component {id: 'STRUCTURE.FCANT'})
   SET c.name = '前悬臂', c.type = 'cantilever',
       c.specifications = '{"material":"Q345B","length_m":8.5,"side":"front"}',
       c.createdAt = datetime()`,
  `MERGE (c:Component {id: 'STRUCTURE.RCANT'})
   SET c.name = '后悬臂', c.type = 'cantilever',
       c.specifications = '{"material":"Q345B","length_m":8.5,"side":"rear"}',
       c.createdAt = datetime()`,
  `MERGE (c:Component {id: 'STRUCTURE.JUNCT'})
   SET c.name = '大梁-门腿连接节点', c.type = 'junction',
       c.specifications = '{"material":"Q345B","weldType":"full_penetration"}',
       c.createdAt = datetime()`,

  // ============================================================
  // §3 HAS_PART 关系 — 设备→系统→部件
  // ============================================================

  // 设备→系统
  `MATCH (e:Equipment {id: 'PORT.RTG.ZPMC.DCRG-45t.SN20260001'})
   MATCH (c:Component {id: 'HOIST'})
   MERGE (e)-[:HAS_PART {role: 'mechanism', order: 1}]->(c)`,
  `MATCH (e:Equipment {id: 'PORT.RTG.ZPMC.DCRG-45t.SN20260001'})
   MATCH (c:Component {id: 'TROLLEY'})
   MERGE (e)-[:HAS_PART {role: 'mechanism', order: 2}]->(c)`,
  `MATCH (e:Equipment {id: 'PORT.RTG.ZPMC.DCRG-45t.SN20260001'})
   MATCH (c:Component {id: 'GANTRY'})
   MERGE (e)-[:HAS_PART {role: 'mechanism', order: 3}]->(c)`,
  `MATCH (e:Equipment {id: 'PORT.RTG.ZPMC.DCRG-45t.SN20260001'})
   MATCH (c:Component {id: 'STRUCTURE'})
   MERGE (e)-[:HAS_PART {role: 'structure', order: 4}]->(c)`,

  // 系统→部件
  `MATCH (p:Component {id: 'HOIST'}) MATCH (c:Component {id: 'HOIST.MOTOR'})     MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id: 'HOIST'}) MATCH (c:Component {id: 'HOIST.GBX'})       MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id: 'TROLLEY'}) MATCH (c:Component {id: 'TROLLEY.MOTOR'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id: 'TROLLEY'}) MATCH (c:Component {id: 'TROLLEY.GBX'})   MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id: 'GANTRY'}) MATCH (c:Component {id: 'GANTRY.MOTOR_A'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id: 'GANTRY'}) MATCH (c:Component {id: 'GANTRY.MOTOR_B'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id: 'STRUCTURE'}) MATCH (c:Component {id: 'STRUCTURE.FBEAM'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id: 'STRUCTURE'}) MATCH (c:Component {id: 'STRUCTURE.RBEAM'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id: 'STRUCTURE'}) MATCH (c:Component {id: 'STRUCTURE.SLEG'})  MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id: 'STRUCTURE'}) MATCH (c:Component {id: 'STRUCTURE.LLEG'})  MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id: 'STRUCTURE'}) MATCH (c:Component {id: 'STRUCTURE.FCANT'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id: 'STRUCTURE'}) MATCH (c:Component {id: 'STRUCTURE.RCANT'}) MERGE (p)-[:HAS_PART]->(c)`,
  `MATCH (p:Component {id: 'STRUCTURE'}) MATCH (c:Component {id: 'STRUCTURE.JUNCT'}) MERGE (p)-[:HAS_PART]->(c)`,

  // ============================================================
  // §4 传感器节点 (Sensor) — 16 振温 + 15 应力 = 31 个
  // ============================================================

  // --- 振温测点 1-6: 起升机构 ---
  `MERGE (s:Sensor {id: 'VT-01'}) SET s.name='起升电机驱动端振动',     s.sensorType='vibration',    s.position='驱动端水平',         s.unit='mm/s', s.sampleRate=12800, s.model='KL-ACC-100', s.collector='DAQ-VT-01', s.channel='CH1', s.warningThreshold=7.1,  s.criticalThreshold=11.2`,
  `MERGE (s:Sensor {id: 'VT-02'}) SET s.name='起升电机非驱动端振动',   s.sensorType='vibration',    s.position='非驱动端水平',       s.unit='mm/s', s.sampleRate=12800, s.model='KL-ACC-100', s.collector='DAQ-VT-01', s.channel='CH2', s.warningThreshold=7.1,  s.criticalThreshold=11.2`,
  `MERGE (s:Sensor {id: 'VT-03'}) SET s.name='起升电机绕组温度',       s.sensorType='temperature',  s.position='定子绕组',           s.unit='°C',   s.sampleRate=1,     s.model='PT100',      s.collector='DAQ-VT-01', s.channel='CH3', s.warningThreshold=75,   s.criticalThreshold=90`,
  `MERGE (s:Sensor {id: 'VT-04'}) SET s.name='起升减速箱高速轴振动',   s.sensorType='vibration',    s.position='输入端（高速轴）',   s.unit='mm/s', s.sampleRate=12800, s.model='KL-ACC-100', s.collector='DAQ-VT-01', s.channel='CH4', s.warningThreshold=7.1,  s.criticalThreshold=11.2`,
  `MERGE (s:Sensor {id: 'VT-05'}) SET s.name='起升减速箱低速轴振动',   s.sensorType='vibration',    s.position='输出端（低速轴）',   s.unit='mm/s', s.sampleRate=12800, s.model='KL-ACC-100', s.collector='DAQ-VT-01', s.channel='CH5', s.warningThreshold=7.1,  s.criticalThreshold=11.2`,
  `MERGE (s:Sensor {id: 'VT-06'}) SET s.name='起升减速箱油温',         s.sensorType='temperature',  s.position='油池',               s.unit='°C',   s.sampleRate=1,     s.model='PT100',      s.collector='DAQ-VT-01', s.channel='CH6', s.warningThreshold=70,   s.criticalThreshold=85`,

  // --- 振温测点 7-12: 小车机构 ---
  `MERGE (s:Sensor {id: 'VT-07'}) SET s.name='小车电机驱动端振动',     s.sensorType='vibration',    s.position='驱动端水平',         s.unit='mm/s', s.sampleRate=12800, s.model='KL-ACC-100', s.collector='DAQ-VT-01', s.channel='CH7', s.warningThreshold=7.1,  s.criticalThreshold=11.2`,
  `MERGE (s:Sensor {id: 'VT-08'}) SET s.name='小车电机非驱动端振动',   s.sensorType='vibration',    s.position='非驱动端水平',       s.unit='mm/s', s.sampleRate=12800, s.model='KL-ACC-100', s.collector='DAQ-VT-01', s.channel='CH8', s.warningThreshold=7.1,  s.criticalThreshold=11.2`,
  `MERGE (s:Sensor {id: 'VT-09'}) SET s.name='小车电机绕组温度',       s.sensorType='temperature',  s.position='定子绕组',           s.unit='°C',   s.sampleRate=1,     s.model='PT100',      s.collector='DAQ-VT-02', s.channel='CH1', s.warningThreshold=75,   s.criticalThreshold=90`,
  `MERGE (s:Sensor {id: 'VT-10'}) SET s.name='小车减速箱高速轴振动',   s.sensorType='vibration',    s.position='输入端（高速轴）',   s.unit='mm/s', s.sampleRate=12800, s.model='KL-ACC-100', s.collector='DAQ-VT-02', s.channel='CH2', s.warningThreshold=7.1,  s.criticalThreshold=11.2`,
  `MERGE (s:Sensor {id: 'VT-11'}) SET s.name='小车减速箱低速轴振动',   s.sensorType='vibration',    s.position='输出端（低速轴）',   s.unit='mm/s', s.sampleRate=12800, s.model='KL-ACC-100', s.collector='DAQ-VT-02', s.channel='CH3', s.warningThreshold=7.1,  s.criticalThreshold=11.2`,
  `MERGE (s:Sensor {id: 'VT-12'}) SET s.name='小车减速箱油温',         s.sensorType='temperature',  s.position='油池',               s.unit='°C',   s.sampleRate=1,     s.model='PT100',      s.collector='DAQ-VT-02', s.channel='CH4', s.warningThreshold=70,   s.criticalThreshold=85`,

  // --- 振温测点 13-16: 大车机构 ---
  `MERGE (s:Sensor {id: 'VT-13'}) SET s.name='大车电机A驱动端振动',    s.sensorType='vibration',    s.position='驱动端水平',         s.unit='mm/s', s.sampleRate=12800, s.model='KL-ACC-100', s.collector='DAQ-VT-02', s.channel='CH5', s.warningThreshold=7.1,  s.criticalThreshold=11.2`,
  `MERGE (s:Sensor {id: 'VT-14'}) SET s.name='大车电机A绕组温度',      s.sensorType='temperature',  s.position='定子绕组',           s.unit='°C',   s.sampleRate=1,     s.model='PT100',      s.collector='DAQ-VT-02', s.channel='CH6', s.warningThreshold=75,   s.criticalThreshold=90`,
  `MERGE (s:Sensor {id: 'VT-15'}) SET s.name='大车电机B驱动端振动',    s.sensorType='vibration',    s.position='驱动端水平',         s.unit='mm/s', s.sampleRate=12800, s.model='KL-ACC-100', s.collector='DAQ-VT-02', s.channel='CH7', s.warningThreshold=7.1,  s.criticalThreshold=11.2`,
  `MERGE (s:Sensor {id: 'VT-16'}) SET s.name='大车电机B绕组温度',      s.sensorType='temperature',  s.position='定子绕组',           s.unit='°C',   s.sampleRate=1,     s.model='PT100',      s.collector='DAQ-VT-02', s.channel='CH8', s.warningThreshold=75,   s.criticalThreshold=90`,

  // --- 应力测点 1-15: 钢结构 ---
  `MERGE (s:Sensor {id: 'ST-01'}) SET s.name='前大梁跨中上翼缘',       s.sensorType='stress', s.position='跨中-上翼缘',       s.unit='MPa', s.sampleRate=100, s.model='BX120-3AA', s.collector='DAQ-ST-01', s.channel='CH1',  s.warningThreshold=120, s.criticalThreshold=160`,
  `MERGE (s:Sensor {id: 'ST-02'}) SET s.name='前大梁跨中下翼缘',       s.sensorType='stress', s.position='跨中-下翼缘',       s.unit='MPa', s.sampleRate=100, s.model='BX120-3AA', s.collector='DAQ-ST-01', s.channel='CH2',  s.warningThreshold=120, s.criticalThreshold=160`,
  `MERGE (s:Sensor {id: 'ST-03'}) SET s.name='前大梁1/4跨',            s.sensorType='stress', s.position='1/4跨-腹板',        s.unit='MPa', s.sampleRate=100, s.model='BX120-3AA', s.collector='DAQ-ST-01', s.channel='CH3',  s.warningThreshold=100, s.criticalThreshold=140`,
  `MERGE (s:Sensor {id: 'ST-04'}) SET s.name='后大梁跨中上翼缘',       s.sensorType='stress', s.position='跨中-上翼缘',       s.unit='MPa', s.sampleRate=100, s.model='BX120-3AA', s.collector='DAQ-ST-01', s.channel='CH4',  s.warningThreshold=120, s.criticalThreshold=160`,
  `MERGE (s:Sensor {id: 'ST-05'}) SET s.name='后大梁跨中下翼缘',       s.sensorType='stress', s.position='跨中-下翼缘',       s.unit='MPa', s.sampleRate=100, s.model='BX120-3AA', s.collector='DAQ-ST-01', s.channel='CH5',  s.warningThreshold=120, s.criticalThreshold=160`,
  `MERGE (s:Sensor {id: 'ST-06'}) SET s.name='后大梁1/4跨',            s.sensorType='stress', s.position='1/4跨-腹板',        s.unit='MPa', s.sampleRate=100, s.model='BX120-3AA', s.collector='DAQ-ST-01', s.channel='CH6',  s.warningThreshold=100, s.criticalThreshold=140`,
  `MERGE (s:Sensor {id: 'ST-07'}) SET s.name='海侧门腿上端',           s.sensorType='stress', s.position='上端连接处',        s.unit='MPa', s.sampleRate=100, s.model='BX120-3AA', s.collector='DAQ-ST-01', s.channel='CH7',  s.warningThreshold=100, s.criticalThreshold=140`,
  `MERGE (s:Sensor {id: 'ST-08'}) SET s.name='海侧门腿下端',           s.sensorType='stress', s.position='下端根部',          s.unit='MPa', s.sampleRate=100, s.model='BX120-3AA', s.collector='DAQ-ST-01', s.channel='CH8',  s.warningThreshold=100, s.criticalThreshold=140`,
  `MERGE (s:Sensor {id: 'ST-09'}) SET s.name='陆侧门腿上端',           s.sensorType='stress', s.position='上端连接处',        s.unit='MPa', s.sampleRate=100, s.model='BX120-3AA', s.collector='DAQ-ST-01', s.channel='CH9',  s.warningThreshold=100, s.criticalThreshold=140`,
  `MERGE (s:Sensor {id: 'ST-10'}) SET s.name='陆侧门腿下端',           s.sensorType='stress', s.position='下端根部',          s.unit='MPa', s.sampleRate=100, s.model='BX120-3AA', s.collector='DAQ-ST-01', s.channel='CH10', s.warningThreshold=100, s.criticalThreshold=140`,
  `MERGE (s:Sensor {id: 'ST-11'}) SET s.name='前悬臂根部',             s.sensorType='stress', s.position='根部连接焊缝',      s.unit='MPa', s.sampleRate=100, s.model='BX120-3AA', s.collector='DAQ-ST-01', s.channel='CH11', s.warningThreshold=80,  s.criticalThreshold=120`,
  `MERGE (s:Sensor {id: 'ST-12'}) SET s.name='前悬臂中部',             s.sensorType='stress', s.position='中部上翼缘',        s.unit='MPa', s.sampleRate=100, s.model='BX120-3AA', s.collector='DAQ-ST-01', s.channel='CH12', s.warningThreshold=80,  s.criticalThreshold=120`,
  `MERGE (s:Sensor {id: 'ST-13'}) SET s.name='后悬臂根部',             s.sensorType='stress', s.position='根部连接焊缝',      s.unit='MPa', s.sampleRate=100, s.model='BX120-3AA', s.collector='DAQ-ST-01', s.channel='CH13', s.warningThreshold=80,  s.criticalThreshold=120`,
  `MERGE (s:Sensor {id: 'ST-14'}) SET s.name='后悬臂中部',             s.sensorType='stress', s.position='中部上翼缘',        s.unit='MPa', s.sampleRate=100, s.model='BX120-3AA', s.collector='DAQ-ST-01', s.channel='CH14', s.warningThreshold=80,  s.criticalThreshold=120`,
  `MERGE (s:Sensor {id: 'ST-15'}) SET s.name='大梁与门腿连接节点',     s.sensorType='stress', s.position='节点板焊缝',        s.unit='MPa', s.sampleRate=100, s.model='BX120-3AA', s.collector='DAQ-ST-01', s.channel='CH15', s.warningThreshold=90,  s.criticalThreshold=130`,

  // ============================================================
  // §5 HAS_SENSOR 关系 — 部件→传感器
  // ============================================================

  // 起升电机
  `MATCH (c:Component {id: 'HOIST.MOTOR'}) MATCH (s:Sensor {id: 'VT-01'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'HOIST.MOTOR'}) MATCH (s:Sensor {id: 'VT-02'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'HOIST.MOTOR'}) MATCH (s:Sensor {id: 'VT-03'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  // 起升减速箱
  `MATCH (c:Component {id: 'HOIST.GBX'}) MATCH (s:Sensor {id: 'VT-04'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'HOIST.GBX'}) MATCH (s:Sensor {id: 'VT-05'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'HOIST.GBX'}) MATCH (s:Sensor {id: 'VT-06'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  // 小车电机
  `MATCH (c:Component {id: 'TROLLEY.MOTOR'}) MATCH (s:Sensor {id: 'VT-07'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'TROLLEY.MOTOR'}) MATCH (s:Sensor {id: 'VT-08'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'TROLLEY.MOTOR'}) MATCH (s:Sensor {id: 'VT-09'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  // 小车减速箱
  `MATCH (c:Component {id: 'TROLLEY.GBX'}) MATCH (s:Sensor {id: 'VT-10'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'TROLLEY.GBX'}) MATCH (s:Sensor {id: 'VT-11'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'TROLLEY.GBX'}) MATCH (s:Sensor {id: 'VT-12'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  // 大车电机A
  `MATCH (c:Component {id: 'GANTRY.MOTOR_A'}) MATCH (s:Sensor {id: 'VT-13'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'GANTRY.MOTOR_A'}) MATCH (s:Sensor {id: 'VT-14'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  // 大车电机B
  `MATCH (c:Component {id: 'GANTRY.MOTOR_B'}) MATCH (s:Sensor {id: 'VT-15'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'GANTRY.MOTOR_B'}) MATCH (s:Sensor {id: 'VT-16'}) MERGE (c)-[:HAS_SENSOR]->(s)`,

  // 钢结构应力
  `MATCH (c:Component {id: 'STRUCTURE.FBEAM'}) MATCH (s:Sensor {id: 'ST-01'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'STRUCTURE.FBEAM'}) MATCH (s:Sensor {id: 'ST-02'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'STRUCTURE.FBEAM'}) MATCH (s:Sensor {id: 'ST-03'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'STRUCTURE.RBEAM'}) MATCH (s:Sensor {id: 'ST-04'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'STRUCTURE.RBEAM'}) MATCH (s:Sensor {id: 'ST-05'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'STRUCTURE.RBEAM'}) MATCH (s:Sensor {id: 'ST-06'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'STRUCTURE.SLEG'})  MATCH (s:Sensor {id: 'ST-07'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'STRUCTURE.SLEG'})  MATCH (s:Sensor {id: 'ST-08'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'STRUCTURE.LLEG'})  MATCH (s:Sensor {id: 'ST-09'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'STRUCTURE.LLEG'})  MATCH (s:Sensor {id: 'ST-10'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'STRUCTURE.FCANT'}) MATCH (s:Sensor {id: 'ST-11'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'STRUCTURE.FCANT'}) MATCH (s:Sensor {id: 'ST-12'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'STRUCTURE.RCANT'}) MATCH (s:Sensor {id: 'ST-13'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'STRUCTURE.RCANT'}) MATCH (s:Sensor {id: 'ST-14'}) MERGE (c)-[:HAS_SENSOR]->(s)`,
  `MATCH (c:Component {id: 'STRUCTURE.JUNCT'}) MATCH (s:Sensor {id: 'ST-15'}) MERGE (c)-[:HAS_SENSOR]->(s)`,

  // ============================================================
  // §6 故障模式节点 (Fault) — 机械 + 结构
  // ============================================================

  // 机械故障
  `MERGE (f:Fault {code: 'MECH.BEARING_WEAR.MAJOR'})
   SET f.name = '轴承磨损', f.category = 'MECH', f.type = 'bearing',
       f.severity = 'MAJOR', f.description = '滚动轴承内/外圈磨损，BPFI/BPFO特征频率显著',
       f.symptoms = '["振动RMS升高","高频冲击","温升异常"]',
       f.rootCause = '润滑不良、过载、安装不当',
       f.frequency = 0.15`,
  `MERGE (f:Fault {code: 'MECH.BEARING_FATIGUE.CRITICAL'})
   SET f.name = '轴承疲劳剥落', f.category = 'MECH', f.type = 'bearing',
       f.severity = 'CRITICAL', f.description = '轴承滚道或滚动体表面疲劳剥落',
       f.symptoms = '["峭度>6","包络谱特征频率及谐波","冲击脉冲值超标"]',
       f.rootCause = '长期过载运行、材料疲劳',
       f.frequency = 0.05`,
  `MERGE (f:Fault {code: 'MECH.GEAR_PITTING.MAJOR'})
   SET f.name = '齿面点蚀', f.category = 'MECH', f.type = 'gear',
       f.severity = 'MAJOR', f.description = '齿轮啮合面出现点蚀坑，啮合频率边带增强',
       f.symptoms = '["啮合频率边带增强","倒频谱齿轮间距分量","油温升高"]',
       f.rootCause = '齿面接触应力超限、润滑油品质下降',
       f.frequency = 0.08`,
  `MERGE (f:Fault {code: 'MECH.GEAR_WEAR.MINOR'})
   SET f.name = '齿面磨损', f.category = 'MECH', f.type = 'gear',
       f.severity = 'MINOR', f.description = '齿轮正常磨损，啮合频率幅值缓慢上升',
       f.symptoms = '["啮合频率幅值缓慢上升","油品铁含量增加"]',
       f.rootCause = '正常运行磨损',
       f.frequency = 0.20`,
  `MERGE (f:Fault {code: 'MECH.MISALIGNMENT.MINOR'})
   SET f.name = '轴不对中', f.category = 'MECH', f.type = 'shaft',
       f.severity = 'MINOR', f.description = '电机与减速箱联轴器不对中，2X转频突出',
       f.symptoms = '["2X转频幅值大于1X","轴向振动偏大","联轴器温升"]',
       f.rootCause = '安装精度不足、基础沉降',
       f.frequency = 0.12`,
  `MERGE (f:Fault {code: 'MECH.IMBALANCE.MINOR'})
   SET f.name = '转子不平衡', f.category = 'MECH', f.type = 'rotor',
       f.severity = 'MINOR', f.description = '电机转子质量不平衡，1X转频振动主导',
       f.symptoms = '["1X转频主导","振动随转速平方增长","径向振动为主"]',
       f.rootCause = '转子积垢、风扇叶片损伤、制造偏差',
       f.frequency = 0.10`,
  `MERGE (f:Fault {code: 'MECH.BRAKE_WEAR.MAJOR'})
   SET f.name = '制动器磨损', f.category = 'MECH', f.type = 'brake',
       f.severity = 'MAJOR', f.description = '制动器摩擦片磨损，1X转频边带特征',
       f.symptoms = '["1X转频主导伴边带","制动力矩下降","制动距离增长"]',
       f.rootCause = '摩擦片正常磨损或异常摩擦',
       f.frequency = 0.06`,

  // 结构故障
  `MERGE (f:Fault {code: 'STRUCT.FATIGUE_CRACK.CRITICAL'})
   SET f.name = '疲劳裂纹', f.category = 'STRUCT', f.type = 'fatigue',
       f.severity = 'CRITICAL', f.description = '钢结构焊缝处疲劳裂纹扩展',
       f.symptoms = '["应力集中区Miner损伤度>0.7","裂纹扩展速率加快","固有频率下降"]',
       f.rootCause = '循环载荷、焊接缺陷、应力集中',
       f.frequency = 0.02`,
  `MERGE (f:Fault {code: 'STRUCT.WELD_DEFECT.MAJOR'})
   SET f.name = '焊缝缺陷', f.category = 'STRUCT', f.type = 'weld',
       f.severity = 'MAJOR', f.description = '焊缝气孔、夹渣或未焊透导致的应力集中',
       f.symptoms = '["热点应力超标","超声检测缺陷信号","应力比异常"]',
       f.rootCause = '焊接工艺不当、材料缺陷',
       f.frequency = 0.03`,
  `MERGE (f:Fault {code: 'STRUCT.DEFORMATION.MAJOR'})
   SET f.name = '结构变形', f.category = 'STRUCT', f.type = 'deformation',
       f.severity = 'MAJOR', f.description = '门腿或大梁发生塑性变形，固有频率偏移',
       f.symptoms = '["静态应力偏移","固有频率变化>5%","挠度超标"]',
       f.rootCause = '超载、碰撞、基础不均匀沉降',
       f.frequency = 0.01`,
  `MERGE (f:Fault {code: 'STRUCT.CORROSION.MINOR'})
   SET f.name = '腐蚀减薄', f.category = 'STRUCT', f.type = 'corrosion',
       f.severity = 'MINOR', f.description = '海洋环境导致钢结构截面腐蚀减薄',
       f.symptoms = '["壁厚减小","应力水平缓慢上升","表面锈蚀"]',
       f.rootCause = '盐雾腐蚀、防腐层失效',
       f.frequency = 0.15`,
  `MERGE (f:Fault {code: 'STRUCT.BOLT_LOOSE.MINOR'})
   SET f.name = '连接螺栓松动', f.category = 'STRUCT', f.type = 'connection',
       f.severity = 'MINOR', f.description = '高强螺栓预紧力下降，连接处应力分布异常',
       f.symptoms = '["局部应力异常波动","振动传递路径变化","异响"]',
       f.rootCause = '振动松弛、预紧力不足',
       f.frequency = 0.08`,

  // ============================================================
  // §7 解决方案节点 (Solution)
  // ============================================================

  `MERGE (s:Solution {id: 'SOL-BEARING-REPLACE'})
   SET s.name = '轴承更换', s.description = '拆卸并更换损坏轴承，重新对中调整',
       s.steps = '["停机隔离","拆卸联轴器","拆卸旧轴承","清洁轴承座","加热安装新轴承","联轴器对中","试运行"]',
       s.estimatedTime = '8h', s.successRate = 0.95`,
  `MERGE (s:Solution {id: 'SOL-GEAR-REPAIR'})
   SET s.name = '齿轮修复/更换', s.description = '齿面修磨或更换齿轮副，调整啮合间隙',
       s.steps = '["停机拆箱","检查齿面状况","修磨或更换齿轮","调整间隙","换油","试运行"]',
       s.estimatedTime = '24h', s.successRate = 0.90`,
  `MERGE (s:Solution {id: 'SOL-ALIGNMENT'})
   SET s.name = '轴对中调整', s.description = '使用激光对中仪重新调整电机-减速箱同轴度',
       s.steps = '["松开联轴器螺栓","安装对中仪","测量偏差","调整垫片","复测","紧固"]',
       s.estimatedTime = '4h', s.successRate = 0.98`,
  `MERGE (s:Solution {id: 'SOL-WELD-REPAIR'})
   SET s.name = '焊缝修复', s.description = '打磨缺陷焊缝，补焊后热处理消除残余应力',
       s.steps = '["缺陷标定","碳弧气刨清除","预热","补焊","后热处理","NDT复检"]',
       s.estimatedTime = '16h', s.successRate = 0.88`,
  `MERGE (s:Solution {id: 'SOL-FATIGUE-REINFORCE'})
   SET s.name = '疲劳加强', s.description = '在裂纹区域加焊加强板或打磨止裂孔',
       s.steps = '["裂纹尖端打止裂孔","表面打磨","焊接加强板","NDT检测","涂装防腐"]',
       s.estimatedTime = '12h', s.successRate = 0.85`,
  `MERGE (s:Solution {id: 'SOL-BRAKE-REPLACE'})
   SET s.name = '制动器检修', s.description = '更换摩擦片，调整制动间隙和弹簧预紧力',
       s.steps = '["停机制动器分离","拆卸摩擦片","检查制动盘","安装新摩擦片","调整间隙","试验制动力矩"]',
       s.estimatedTime = '4h', s.successRate = 0.96`,

  // ============================================================
  // §8 故障→解决方案 (RESOLVED_BY)
  // ============================================================

  `MATCH (f:Fault {code: 'MECH.BEARING_WEAR.MAJOR'})     MATCH (s:Solution {id: 'SOL-BEARING-REPLACE'}) MERGE (f)-[:RESOLVED_BY {confidence: 0.95}]->(s)`,
  `MATCH (f:Fault {code: 'MECH.BEARING_FATIGUE.CRITICAL'}) MATCH (s:Solution {id: 'SOL-BEARING-REPLACE'}) MERGE (f)-[:RESOLVED_BY {confidence: 0.98}]->(s)`,
  `MATCH (f:Fault {code: 'MECH.GEAR_PITTING.MAJOR'})     MATCH (s:Solution {id: 'SOL-GEAR-REPAIR'})     MERGE (f)-[:RESOLVED_BY {confidence: 0.90}]->(s)`,
  `MATCH (f:Fault {code: 'MECH.GEAR_WEAR.MINOR'})        MATCH (s:Solution {id: 'SOL-GEAR-REPAIR'})     MERGE (f)-[:RESOLVED_BY {confidence: 0.85}]->(s)`,
  `MATCH (f:Fault {code: 'MECH.MISALIGNMENT.MINOR'})     MATCH (s:Solution {id: 'SOL-ALIGNMENT'})       MERGE (f)-[:RESOLVED_BY {confidence: 0.98}]->(s)`,
  `MATCH (f:Fault {code: 'MECH.BRAKE_WEAR.MAJOR'})       MATCH (s:Solution {id: 'SOL-BRAKE-REPLACE'})   MERGE (f)-[:RESOLVED_BY {confidence: 0.96}]->(s)`,
  `MATCH (f:Fault {code: 'STRUCT.FATIGUE_CRACK.CRITICAL'}) MATCH (s:Solution {id: 'SOL-FATIGUE-REINFORCE'}) MERGE (f)-[:RESOLVED_BY {confidence: 0.85}]->(s)`,
  `MATCH (f:Fault {code: 'STRUCT.WELD_DEFECT.MAJOR'})     MATCH (s:Solution {id: 'SOL-WELD-REPAIR'})     MERGE (f)-[:RESOLVED_BY {confidence: 0.88}]->(s)`,

  // ============================================================
  // §9 故障因果链 (CAUSES / DEGRADES_TO)
  // ============================================================

  `MATCH (f1:Fault {code: 'MECH.MISALIGNMENT.MINOR'}) MATCH (f2:Fault {code: 'MECH.BEARING_WEAR.MAJOR'})
   MERGE (f1)-[:CAUSES {probability: 0.4, mechanism: '不对中导致轴承偏载'}]->(f2)`,
  `MATCH (f1:Fault {code: 'MECH.BEARING_WEAR.MAJOR'}) MATCH (f2:Fault {code: 'MECH.BEARING_FATIGUE.CRITICAL'})
   MERGE (f1)-[:DEGRADES_TO {probability: 0.6, timeframe: '3-6个月'}]->(f2)`,
  `MATCH (f1:Fault {code: 'MECH.GEAR_WEAR.MINOR'}) MATCH (f2:Fault {code: 'MECH.GEAR_PITTING.MAJOR'})
   MERGE (f1)-[:DEGRADES_TO {probability: 0.35, timeframe: '6-12个月'}]->(f2)`,
  `MATCH (f1:Fault {code: 'STRUCT.CORROSION.MINOR'}) MATCH (f2:Fault {code: 'STRUCT.FATIGUE_CRACK.CRITICAL'})
   MERGE (f1)-[:CAUSES {probability: 0.2, mechanism: '截面减薄导致应力集中'}]->(f2)`,
  `MATCH (f1:Fault {code: 'STRUCT.WELD_DEFECT.MAJOR'}) MATCH (f2:Fault {code: 'STRUCT.FATIGUE_CRACK.CRITICAL'})
   MERGE (f1)-[:CAUSES {probability: 0.5, mechanism: '焊接缺陷作为裂纹源'}]->(f2)`,
  `MATCH (f1:Fault {code: 'STRUCT.BOLT_LOOSE.MINOR'}) MATCH (f2:Fault {code: 'STRUCT.FATIGUE_CRACK.CRITICAL'})
   MERGE (f1)-[:CAUSES {probability: 0.15, mechanism: '松动导致局部应力重分布'}]->(f2)`,

  // ============================================================
  // §10 工况节点 (Condition)
  // ============================================================

  `MERGE (c:Condition {encoding: 'HOIST.FULL_LOAD.NORMAL'})
   SET c.operationType = 'HOIST', c.loadRange = 'FULL_LOAD', c.envCondition = 'NORMAL',
       c.parameters = '{"liftWeight_t":45,"speed_m_min":20}', c.createdAt = datetime()`,
  `MERGE (c:Condition {encoding: 'HOIST.NO_LOAD.NORMAL'})
   SET c.operationType = 'HOIST', c.loadRange = 'NO_LOAD', c.envCondition = 'NORMAL',
       c.parameters = '{"liftWeight_t":0,"speed_m_min":40}', c.createdAt = datetime()`,
  `MERGE (c:Condition {encoding: 'TROLLEY.FULL_LOAD.NORMAL'})
   SET c.operationType = 'TROLLEY', c.loadRange = 'FULL_LOAD', c.envCondition = 'NORMAL',
       c.parameters = '{"trolleySpeed_m_min":70}', c.createdAt = datetime()`,
  `MERGE (c:Condition {encoding: 'GANTRY.NO_LOAD.NORMAL'})
   SET c.operationType = 'GANTRY', c.loadRange = 'NO_LOAD', c.envCondition = 'NORMAL',
       c.parameters = '{"gantrySpeed_m_min":25}', c.createdAt = datetime()`,
  `MERGE (c:Condition {encoding: 'GANTRY.NO_LOAD.HIGH_WIND'})
   SET c.operationType = 'GANTRY', c.loadRange = 'NO_LOAD', c.envCondition = 'HIGH_WIND',
       c.parameters = '{"gantrySpeed_m_min":15,"windSpeed_m_s":20}', c.createdAt = datetime()`,

  // ============================================================
  // §11 故障-工况关联 (UNDER_CONDITION)
  // ============================================================

  `MATCH (f:Fault {code: 'MECH.BEARING_WEAR.MAJOR'}) MATCH (c:Condition {encoding: 'HOIST.FULL_LOAD.NORMAL'})
   MERGE (f)-[:UNDER_CONDITION {probability: 0.35, observedCount: 12}]->(c)`,
  `MATCH (f:Fault {code: 'MECH.GEAR_PITTING.MAJOR'}) MATCH (c:Condition {encoding: 'HOIST.FULL_LOAD.NORMAL'})
   MERGE (f)-[:UNDER_CONDITION {probability: 0.25, observedCount: 8}]->(c)`,
  `MATCH (f:Fault {code: 'STRUCT.FATIGUE_CRACK.CRITICAL'}) MATCH (c:Condition {encoding: 'GANTRY.NO_LOAD.HIGH_WIND'})
   MERGE (f)-[:UNDER_CONDITION {probability: 0.15, observedCount: 3, note: '大风下门腿应力循环加剧'}]->(c)`,

  // ============================================================
  // §12 诊断算法关联 (DIAGNOSED_BY)
  // ============================================================

  // 振动故障 → 机械算法
  `MATCH (f:Fault {code: 'MECH.BEARING_WEAR.MAJOR'})
   MERGE (a:Algorithm {id: 'envelope_demod'}) SET a.name = '包络解调', a.category = 'mechanical'
   MERGE (f)-[:DIAGNOSED_BY {confidence: 0.92, standard: 'ISO 10816'}]->(a)`,
  `MATCH (f:Fault {code: 'MECH.BEARING_WEAR.MAJOR'})
   MERGE (a:Algorithm {id: 'spectral_kurtosis'}) SET a.name = '谱峭度', a.category = 'mechanical'
   MERGE (f)-[:DIAGNOSED_BY {confidence: 0.88}]->(a)`,
  `MATCH (f:Fault {code: 'MECH.GEAR_PITTING.MAJOR'})
   MERGE (a:Algorithm {id: 'cepstrum_analysis'}) SET a.name = '倒频谱分析', a.category = 'mechanical'
   MERGE (f)-[:DIAGNOSED_BY {confidence: 0.85}]->(a)`,
  `MATCH (f:Fault {code: 'MECH.GEAR_PITTING.MAJOR'})
   MERGE (a:Algorithm {id: 'fft_spectrum'}) SET a.name = 'FFT频谱分析', a.category = 'mechanical'
   MERGE (f)-[:DIAGNOSED_BY {confidence: 0.80, standard: 'ISO 10816'}]->(a)`,
  `MATCH (f:Fault {code: 'MECH.MISALIGNMENT.MINOR'})
   MERGE (a:Algorithm {id: 'fft_spectrum'})
   MERGE (f)-[:DIAGNOSED_BY {confidence: 0.90, feature: '2X转频'}]->(a)`,
  `MATCH (f:Fault {code: 'MECH.IMBALANCE.MINOR'})
   MERGE (a:Algorithm {id: 'fft_spectrum'})
   MERGE (f)-[:DIAGNOSED_BY {confidence: 0.92, feature: '1X转频'}]->(a)`,
  `MATCH (f:Fault {code: 'MECH.BRAKE_WEAR.MAJOR'})
   MERGE (a:Algorithm {id: 'fft_spectrum'})
   MERGE (f)-[:DIAGNOSED_BY {confidence: 0.75, feature: '1X转频+边带'}]->(a)`,

  // 应力故障 → 结构算法
  `MATCH (f:Fault {code: 'STRUCT.FATIGUE_CRACK.CRITICAL'})
   MERGE (a:Algorithm {id: 'rainflow_counting'}) SET a.name = '雨流计数', a.category = 'structural'
   MERGE (f)-[:DIAGNOSED_BY {confidence: 0.90, standard: 'ASTM E1049'}]->(a)`,
  `MATCH (f:Fault {code: 'STRUCT.FATIGUE_CRACK.CRITICAL'})
   MERGE (a:Algorithm {id: 'miner_damage'}) SET a.name = 'Miner累积损伤', a.category = 'structural'
   MERGE (f)-[:DIAGNOSED_BY {confidence: 0.88, standard: 'IIW-2259'}]->(a)`,
  `MATCH (f:Fault {code: 'STRUCT.FATIGUE_CRACK.CRITICAL'})
   MERGE (a:Algorithm {id: 'hot_spot_stress'}) SET a.name = '热点应力法', a.category = 'structural'
   MERGE (f)-[:DIAGNOSED_BY {confidence: 0.85, standard: 'IIW-2259'}]->(a)`,
  `MATCH (f:Fault {code: 'STRUCT.DEFORMATION.MAJOR'})
   MERGE (a:Algorithm {id: 'modal_analysis'}) SET a.name = '模态分析', a.category = 'structural'
   MERGE (f)-[:DIAGNOSED_BY {confidence: 0.82}]->(a)`,
  `MATCH (f:Fault {code: 'STRUCT.BOLT_LOOSE.MINOR'})
   MERGE (a:Algorithm {id: 'modal_analysis'})
   MERGE (f)-[:DIAGNOSED_BY {confidence: 0.70, feature: '固有频率偏移'}]->(a)`,

];

// ============================================================
// 统计信息
// ============================================================
export const RTG_001_STATS = {
  totalStatements: RTG_001_SEED_CYPHER.length,
  nodes: {
    Equipment: 1,
    Component: 18,   // 4系统 + 11部件 + 3子结构
    Sensor: 31,      // 16振温 + 15应力
    Fault: 12,       // 7机械 + 5结构
    Solution: 6,
    Condition: 5,
    Algorithm: 7,    // 去重后
  },
  relationships: {
    HAS_PART: 17,
    HAS_SENSOR: 31,
    RESOLVED_BY: 8,
    CAUSES: 4,
    DEGRADES_TO: 2,
    UNDER_CONDITION: 3,
    DIAGNOSED_BY: 12,
  },
};
