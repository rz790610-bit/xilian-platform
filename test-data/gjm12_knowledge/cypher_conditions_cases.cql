// ============================================================
// GJM12 工况条件 + 历史案例 知识图谱扩展
// P0-4: Condition 和 Case 节点 + UNDER_CONDITION, VALIDATES, SHARED_COMPONENT 关系
// ============================================================

// --- Section 0: 新增约束和索引 ---
CREATE CONSTRAINT IF NOT EXISTS FOR (c:Condition) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (c:Condition) REQUIRE c.encoding IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (cs:Case) REQUIRE cs.id IS UNIQUE;

// --- Section 1: Fault 节点（补充） ---
// 确保关联的故障节点存在
MERGE (f1:Fault {id: "FAULT-BEARING-WEAR"})
  SET f1.code = 'BEARING_WEAR', f1.name = '轴承磨损', f1.type = 'mechanical',
      f1.severity = 'warning', f1.description = '轴承滚道/滚动体表面磨损导致间隙增大';

MERGE (f2:Fault {id: "FAULT-GEAR-MESH"})
  SET f2.code = 'GEAR_MESH_FAULT', f2.name = '齿轮啮合异常', f2.type = 'mechanical',
      f2.severity = 'warning', f2.description = '齿轮磨损或点蚀导致啮合异常振动';

MERGE (f3:Fault {id: "FAULT-MOTOR-OVERHEAT"})
  SET f3.code = 'MOTOR_OVERHEAT', f3.name = '电机过热', f3.type = 'electrical',
      f3.severity = 'error', f3.description = '电机温度超过额定值，可能绝缘老化';

MERGE (f4:Fault {id: "FAULT-BRAKE-SLIP"})
  SET f4.code = 'BRAKE_SLIP', f4.name = '制动器打滑', f4.type = 'mechanical',
      f4.severity = 'critical', f4.description = '制动器摩擦片磨损导致制动力不足';

MERGE (f5:Fault {id: "FAULT-WIRE-ROPE-FATIGUE"})
  SET f5.code = 'WIRE_ROPE_FATIGUE', f5.name = '钢丝绳疲劳', f5.type = 'structural',
      f5.severity = 'error', f5.description = '钢丝绳反复弯曲导致丝断裂';

// --- Section 2: Condition 节点 ---

// 复合工况条件
MERGE (cond1:Condition {id: "COND-HOIST-FULL-LOAD-HIGH-WIND"})
  SET cond1.encoding = 'HOIST.FULL_LOAD.HIGH_WIND',
      cond1.name = '起升满载+大风',
      cond1.type = 'operating',
      cond1.description = '起升机构在满载(>85%额定载荷)且风速>15m/s条件下运行',
      cond1.parameters = '{"loadPercent": [85, 100], "windSpeed": [15, 25]}';

MERGE (cond2:Condition {id: "COND-TROLLEY-HIGH-SPEED"})
  SET cond2.encoding = 'TROLLEY.HIGH_SPEED',
      cond2.name = '小车高速运行',
      cond2.type = 'operating',
      cond2.description = '小车运行速度>80%额定速度',
      cond2.parameters = '{"speedPercent": [80, 100]}';

MERGE (cond3:Condition {id: "COND-ENV-HIGH-TEMP"})
  SET cond3.encoding = 'ENV.HIGH_TEMPERATURE',
      cond3.name = '高温环境',
      cond3.type = 'environmental',
      cond3.description = '环境温度>35°C',
      cond3.parameters = '{"ambientTemp": [35, 50]}';

MERGE (cond4:Condition {id: "COND-ENV-SALT-FOG"})
  SET cond4.encoding = 'ENV.SALT_FOG',
      cond4.name = '盐雾环境',
      cond4.type = 'environmental',
      cond4.description = '沿海港口盐雾腐蚀环境',
      cond4.parameters = '{"salinity": [3, 35]}';

MERGE (cond5:Condition {id: "COND-LOAD-ECCENTRIC"})
  SET cond5.encoding = 'LOAD.ECCENTRIC',
      cond5.name = '偏载工况',
      cond5.type = 'load',
      cond5.description = '起吊重心偏离吊具中心>500mm',
      cond5.parameters = '{"eccentricity": [500, 2000]}';

MERGE (cond6:Condition {id: "COND-HOIST-FREQUENT-START"})
  SET cond6.encoding = 'HOIST.FREQUENT_START',
      cond6.name = '频繁启停',
      cond6.type = 'operating',
      cond6.description = '起升机构每小时启停次数>30',
      cond6.parameters = '{"startsPerHour": [30, 60]}';

// --- Section 3: Case 节点 ---

MERGE (case1:Case {id: "CASE-001"})
  SET case1.caseId = 'GJM12-2024-001',
      case1.deviceId = 'GJM12',
      case1.type = 'diagnosis',
      case1.description = '起升减速箱高速轴轴承内圈缺陷，BPFI频率幅值3x基线',
      case1.occurredAt = '2024-08-15T10:30:00Z',
      case1.outcome = 'confirmed',
      case1.severity = 'moderate',
      case1.confidence = 0.92,
      case1.diagnosisMethod = 'envelope',
      case1.rootCause = '润滑不足导致轴承内圈点蚀',
      case1.resolution = '更换轴承并改善润滑方案';

MERGE (case2:Case {id: "CASE-002"})
  SET case2.caseId = 'GJM12-2024-002',
      case2.deviceId = 'GJM12',
      case2.type = 'maintenance',
      case2.description = '小车运行机构预防性维护——更换车轮轴承',
      case2.occurredAt = '2024-09-20T08:00:00Z',
      case2.outcome = 'restored',
      case2.severity = 'minor',
      case2.confidence = 0.85,
      case2.diagnosisMethod = 'trend',
      case2.resolution = '按计划更换6个车轮轴承';

MERGE (case3:Case {id: "CASE-003"})
  SET case3.caseId = 'GJM12-2024-003',
      case3.deviceId = 'GJM12',
      case3.type = 'failure',
      case3.description = '起升电机过热停机——大风满载工况下连续作业2小时',
      case3.occurredAt = '2024-10-05T14:15:00Z',
      case3.outcome = 'confirmed',
      case3.severity = 'severe',
      case3.confidence = 0.95,
      case3.diagnosisMethod = 'expert',
      case3.rootCause = '大风阻力增加导致电机持续过载运行',
      case3.resolution = '降低作业速度，增加电机散热装置';

MERGE (case4:Case {id: "CASE-004"})
  SET case4.caseId = 'GJM12-2025-001',
      case4.deviceId = 'GJM12',
      case4.type = 'diagnosis',
      case4.description = '制动器异常滑动——频繁启停后摩擦片过度磨损',
      case4.occurredAt = '2025-01-10T09:45:00Z',
      case4.outcome = 'confirmed',
      case4.severity = 'critical',
      case4.confidence = 0.88,
      case4.diagnosisMethod = 'spectrum',
      case4.rootCause = '频繁启停导致制动器温度升高，摩擦片热衰退',
      case4.resolution = '更换制动摩擦片，调整启停间隔策略';

MERGE (case5:Case {id: "CASE-005"})
  SET case5.caseId = 'GJM12-2025-002',
      case5.deviceId = 'GJM12',
      case5.type = 'diagnosis',
      case5.description = '减速箱齿轮啮合异常——偏载工况下齿面点蚀',
      case5.occurredAt = '2025-02-01T11:20:00Z',
      case5.outcome = 'confirmed',
      case5.severity = 'moderate',
      case5.confidence = 0.90,
      case5.diagnosisMethod = 'spectrum',
      case5.rootCause = '长期偏载运行导致齿轮局部接触应力过大',
      case5.resolution = '修复齿面，调整吊具对中精度';

// --- Section 4: AFFECTS 关系（Fault → Component） ---
// 故障影响的组件
MATCH (f1:Fault {id: "FAULT-BEARING-WEAR"}), (comp1:Component {code: "GJM12030409"})
  MERGE (f1)-[:AFFECTS {impactLevel: 'high'}]->(comp1);

MATCH (f2:Fault {id: "FAULT-GEAR-MESH"}), (comp2:Component {code: "GJM120303"})
  MERGE (f2)-[:AFFECTS {impactLevel: 'medium'}]->(comp2);

MATCH (f3:Fault {id: "FAULT-MOTOR-OVERHEAT"}), (comp3:Component {code: "GJM120304"})
  MERGE (f3)-[:AFFECTS {impactLevel: 'high'}]->(comp3);

MATCH (f4:Fault {id: "FAULT-BRAKE-SLIP"}), (comp4:Component {code: "GJM12030306"})
  MERGE (f4)-[:AFFECTS {impactLevel: 'critical'}]->(comp4);

MATCH (f5:Fault {id: "FAULT-WIRE-ROPE-FATIGUE"}), (comp5:Component {code: "GJM120305"})
  MERGE (f5)-[:AFFECTS {impactLevel: 'high'}]->(comp5);

// --- Section 5: UNDER_CONDITION 关系 ---

// 轴承磨损 ← 满载大风工况 (概率 35%)
MATCH (f:Fault {id: "FAULT-BEARING-WEAR"}), (c:Condition {id: "COND-HOIST-FULL-LOAD-HIGH-WIND"})
  MERGE (f)-[:UNDER_CONDITION {probability: 0.35, notes: '满载大风下轴承径向力增大'}]->(c);

// 轴承磨损 ← 频繁启停 (概率 25%)
MATCH (f:Fault {id: "FAULT-BEARING-WEAR"}), (c:Condition {id: "COND-HOIST-FREQUENT-START"})
  MERGE (f)-[:UNDER_CONDITION {probability: 0.25, notes: '频繁启停产生冲击载荷'}]->(c);

// 齿轮啮合异常 ← 偏载工况 (概率 40%)
MATCH (f:Fault {id: "FAULT-GEAR-MESH"}), (c:Condition {id: "COND-LOAD-ECCENTRIC"})
  MERGE (f)-[:UNDER_CONDITION {probability: 0.40, notes: '偏载导致齿轮非均匀接触'}]->(c);

// 齿轮啮合异常 ← 小车高速运行 (概率 20%)
MATCH (f:Fault {id: "FAULT-GEAR-MESH"}), (c:Condition {id: "COND-TROLLEY-HIGH-SPEED"})
  MERGE (f)-[:UNDER_CONDITION {probability: 0.20, notes: '高速运行加剧齿轮磨损'}]->(c);

// 电机过热 ← 满载大风 (概率 45%)
MATCH (f:Fault {id: "FAULT-MOTOR-OVERHEAT"}), (c:Condition {id: "COND-HOIST-FULL-LOAD-HIGH-WIND"})
  MERGE (f)-[:UNDER_CONDITION {probability: 0.45, notes: '大风阻力+满载增加电机负荷'}]->(c);

// 电机过热 ← 高温环境 (概率 30%)
MATCH (f:Fault {id: "FAULT-MOTOR-OVERHEAT"}), (c:Condition {id: "COND-ENV-HIGH-TEMP"})
  MERGE (f)-[:UNDER_CONDITION {probability: 0.30, notes: '高温降低散热效率'}]->(c);

// 制动器打滑 ← 频繁启停 (概率 50%)
MATCH (f:Fault {id: "FAULT-BRAKE-SLIP"}), (c:Condition {id: "COND-HOIST-FREQUENT-START"})
  MERGE (f)-[:UNDER_CONDITION {probability: 0.50, notes: '频繁制动导致热衰退'}]->(c);

// 钢丝绳疲劳 ← 满载大风 (概率 30%)
MATCH (f:Fault {id: "FAULT-WIRE-ROPE-FATIGUE"}), (c:Condition {id: "COND-HOIST-FULL-LOAD-HIGH-WIND"})
  MERGE (f)-[:UNDER_CONDITION {probability: 0.30, notes: '满载大风增加绳索弯曲应力'}]->(c);

// 钢丝绳疲劳 ← 盐雾环境 (概率 35%)
MATCH (f:Fault {id: "FAULT-WIRE-ROPE-FATIGUE"}), (c:Condition {id: "COND-ENV-SALT-FOG"})
  MERGE (f)-[:UNDER_CONDITION {probability: 0.35, notes: '盐雾腐蚀降低绳索强度'}]->(c);

// --- Section 6: VALIDATES 关系 ---

// 案例1 验证轴承磨损（确认）
MATCH (cs:Case {id: "CASE-001"}), (f:Fault {id: "FAULT-BEARING-WEAR"})
  MERGE (cs)-[:VALIDATES {outcome: 'confirmed', confidence: 0.92, method: 'envelope'}]->(f);

// 案例2 验证轴承磨损（确认——预防性维护）
MATCH (cs:Case {id: "CASE-002"}), (f:Fault {id: "FAULT-BEARING-WEAR"})
  MERGE (cs)-[:VALIDATES {outcome: 'confirmed', confidence: 0.85, method: 'trend'}]->(f);

// 案例3 验证电机过热（确认）
MATCH (cs:Case {id: "CASE-003"}), (f:Fault {id: "FAULT-MOTOR-OVERHEAT"})
  MERGE (cs)-[:VALIDATES {outcome: 'confirmed', confidence: 0.95, method: 'expert'}]->(f);

// 案例4 验证制动器打滑（确认）
MATCH (cs:Case {id: "CASE-004"}), (f:Fault {id: "FAULT-BRAKE-SLIP"})
  MERGE (cs)-[:VALIDATES {outcome: 'confirmed', confidence: 0.88, method: 'spectrum'}]->(f);

// 案例5 验证齿轮啮合异常（确认）
MATCH (cs:Case {id: "CASE-005"}), (f:Fault {id: "FAULT-GEAR-MESH"})
  MERGE (cs)-[:VALIDATES {outcome: 'confirmed', confidence: 0.90, method: 'spectrum'}]->(f);

// --- Section 7: SHARED_COMPONENT 关系 ---
// 小车车轮总成1 和 小车车轮总成2 共享同型号部件
MATCH (c1:Component {code: "GJM12030301"}), (c2:Component {code: "GJM12030302"})
  MERGE (c1)-[:SHARED_COMPONENT {componentType: 'wheel_assembly', similarity: 0.95, notes: '同型号车轮总成，可交叉参考振动基线'}]->(c2);
