/**
 * 工况归一化配置管理
 *
 * 1. Python snake_case ↔ TypeScript camelCase 字段映射
 * 2. 工况定义元数据
 * 3. 特征名中英文映射
 * 4. 算法注册表元数据
 * 5. Python 端调用示例
 */

// ============================================================================
// Python ↔ TypeScript 字段映射
// ============================================================================

export const PYTHON_TO_TS_FIELD_MAP: Record<string, string> = {
  // ConfigManager
  'config_path': 'configPath',
  'threshold_idle_current': 'thresholdIdleCurrent',
  'load_weight_threshold': 'loadWeightThreshold',
  'adaptive_thresholds': 'adaptiveThresholds',
  'plc_rules': 'plcRules',
  'plc_code': 'plcCode',
  'ratio_bounds': 'ratioBounds',
  'zscore_bounds': 'zscoreBounds',
  'normal_low': 'normalLow',
  'normal_high': 'normalHigh',
  'attention_low': 'attentionLow',
  'attention_high': 'attentionHigh',
  'anomaly_low': 'anomalyLow',
  'anomaly_high': 'anomalyHigh',

  // BaselineLearner
  'max_samples_per_baseline': 'maxSamplesPerBaseline',
  'ewma_alpha': 'ewmaAlpha',
  'feature_name': 'featureName',
  'sample_count': 'sampleCount',

  // DataSlice
  'data_slice': 'dataSlice',
  'normalize_method': 'normalizeMethod',
  'vibration_speed': 'vibrationSpeed',
  'bearing_temp': 'bearingTemp',
  'motor_speed': 'motorSpeed',
  'load_weight': 'loadWeight',
  'trolley_speed': 'trolleySpeed',

  // ConditionDef
  'key_features': 'keyFeatures',
  'typical_duration': 'typicalDuration',

  // NormalizationResult
  'condition_label': 'conditionLabel',
  'normalized_features': 'normalizedFeatures',
  'overall_status': 'overallStatus',

  // HistoryEntry
  'historical_data': 'historicalData',
  'target_condition': 'targetCondition',
};

export const TS_TO_PYTHON_FIELD_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(PYTHON_TO_TS_FIELD_MAP).map(([k, v]) => [v, k])
);

/**
 * 将 Python snake_case 对象转为 TypeScript camelCase
 */
export function pythonToTs(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const tsKey = PYTHON_TO_TS_FIELD_MAP[key] || key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[tsKey] = pythonToTs(value);
    } else {
      result[tsKey] = value;
    }
  }
  return result;
}

/**
 * 将 TypeScript camelCase 对象转为 Python snake_case
 */
export function tsToPython(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const pyKey = TS_TO_PYTHON_FIELD_MAP[key] || key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[pyKey] = tsToPython(value);
    } else {
      result[pyKey] = value;
    }
  }
  return result;
}

// ============================================================================
// 特征名中英文映射
// ============================================================================

export const FEATURE_NAME_MAP: Record<string, string> = {
  // 中文 → 英文
  '振动速度(mm/s)': 'vibrationSpeed',
  '振动速度': 'vibrationSpeed',
  '电流比(%)': 'current',
  '电流': 'current',
  '轴承温度(℃)': 'bearingTemp',
  '轴承温度': 'bearingTemp',
  '电机转速': 'motorSpeed',
  '载荷': 'loadWeight',
  '小车速度': 'trolleySpeed',
};

export const FEATURE_NAME_MAP_REVERSE: Record<string, string> = {
  vibrationSpeed: '振动速度(mm/s)',
  current: '电流比(%)',
  bearingTemp: '轴承温度(℃)',
  motorSpeed: '电机转速(rpm)',
  loadWeight: '载荷(t)',
  trolleySpeed: '小车速度(m/s)',
};

// ============================================================================
// 工况定义元数据
// ============================================================================

export interface ConditionMetadata {
  id: string;
  name: string;
  plcCode: number;
  color: string;
  icon: string;
  description: string;
  keyFeatures: string;
  typicalDuration: string;
  typicalRanges: Record<string, [number, number]>;
}

export const CONDITION_METADATA: ConditionMetadata[] = [
  {
    id: 'IDLE',
    name: '待机空闲',
    plcCode: 0,
    color: '#94a3b8',
    icon: '💤',
    description: '设备处于待机状态，电机停止',
    keyFeatures: '电机停止，无振动，低温',
    typicalDuration: '不定',
    typicalRanges: {
      current: [0, 0.1],
      vibrationSpeed: [0, 0.5],
      bearingTemp: [15, 35],
      motorSpeed: [0, 10],
    },
  },
  {
    id: 'LIFT_EMPTY',
    name: '空载起升',
    plcCode: 1,
    color: '#3b82f6',
    icon: '🔼',
    description: '起升电机启动，无负载运行',
    keyFeatures: '起升电机启动，无负载',
    typicalDuration: '30-60s',
    typicalRanges: {
      current: [25, 45],
      vibrationSpeed: [1.2, 2.8],
      bearingTemp: [35, 55],
      motorSpeed: [1400, 1480],
    },
  },
  {
    id: 'LIFT_LOADED',
    name: '重载起升',
    plcCode: 2,
    color: '#ef4444',
    icon: '🏋️',
    description: '额定负载起升，高电流高振动',
    keyFeatures: '额定负载起升',
    typicalDuration: '30-60s',
    typicalRanges: {
      current: [65, 95],
      vibrationSpeed: [2.5, 4.5],
      bearingTemp: [50, 75],
      motorSpeed: [1380, 1450],
    },
  },
  {
    id: 'TROLLEY_MOVE',
    name: '小车行走',
    plcCode: 3,
    color: '#f59e0b',
    icon: '🚃',
    description: '小车水平移动',
    keyFeatures: '小车水平移动',
    typicalDuration: '20-40s',
    typicalRanges: {
      current: [20, 35],
      vibrationSpeed: [1.5, 2.5],
      bearingTemp: [35, 50],
      motorSpeed: [1420, 1470],
    },
  },
  {
    id: 'LANDING',
    name: '集装箱落地',
    plcCode: 4,
    color: '#8b5cf6',
    icon: '📦',
    description: '集装箱落地产生冲击载荷',
    keyFeatures: '冲击载荷',
    typicalDuration: '5-10s',
    typicalRanges: {
      current: [10, 25],
      vibrationSpeed: [5, 10],
      bearingTemp: [45, 65],
      motorSpeed: [100, 400],
    },
  },
];

// ============================================================================
// 归一化方法说明
// ============================================================================

export interface NormMethodInfo {
  id: string;
  name: string;
  formula: string;
  description: string;
  pros: string[];
  cons: string[];
  bestFor: string;
}

export const NORM_METHODS: NormMethodInfo[] = [
  {
    id: 'ratio',
    name: '比值法 (Ratio)',
    formula: 'normalized = value / baseline.mean',
    description: '将当前值除以基线均值，得到相对比值。1.0 表示与基线一致。',
    pros: ['直观易理解', '物理意义明确', '适合趋势监测'],
    cons: ['对基线均值为0的情况不适用', '不考虑离散度'],
    bestFor: '日常状态监测、趋势分析',
  },
  {
    id: 'zscore',
    name: 'Z-Score 标准化',
    formula: 'normalized = (value - baseline.mean) / baseline.std',
    description: '将当前值减去基线均值后除以标准差，得到标准分数。0 表示与基线一致。',
    pros: ['考虑离散度', '统计意义明确', '适合异常检测'],
    cons: ['需要足够样本估计标准差', '对非正态分布不理想'],
    bestFor: '异常检测、统计过程控制',
  },
];

// ============================================================================
// 算法注册表元数据
// ============================================================================

export const ALGORITHM_REGISTRY_METADATA = {
  id: 'condition_normalization_v2',
  name: '工况归一化 v2',
  version: '2.0.0',
  category: 'comprehensive',
  subcategory: 'condition_normalization',
  description: '多工况参数归一化引擎 — 自适应基线学习 + EWMA在线更新 + 自适应阈值状态判定',
  tags: ['工况归一化', '基线学习', 'EWMA', '自适应阈值', '状态监测', 'PLC', '港机'],
  inputFields: [
    { name: 'dataSlice', type: 'object', description: '传感器数据片段', required: true },
    { name: 'method', type: 'string', description: '归一化方法 (ratio/zscore)', required: false },
  ],
  outputFields: [
    { name: 'condition', type: 'string', description: '识别的工况' },
    { name: 'normalizedFeatures', type: 'object', description: '归一化后特征' },
    { name: 'status', type: 'object', description: '各特征状态判定' },
    { name: 'overallStatus', type: 'string', description: '综合状态' },
  ],
  configFields: [
    { name: 'method', type: 'select', options: ['ratio', 'zscore'], default: 'ratio', description: '归一化方法' },
    { name: 'thresholdIdleCurrent', type: 'number', default: 0.1, description: '空闲电流阈值' },
    { name: 'loadWeightThreshold', type: 'number', default: 10.0, description: '载荷判定阈值' },
  ],
  applicableDeviceTypes: ['crane', 'motor', 'pump', 'fan', '*'],
  applicableScenarios: ['工况归一化', '状态监测', '趋势分析', '异常检测'],
  complexity: 'O(N*F)',
  edgeDeployable: true,
  referenceStandards: [
    'ISO 13373-9 (Condition monitoring)',
    'EPRI Guidelines (Power equipment)',
    'IQR Outlier Detection (Tukey 1977)',
    'EWMA (Roberts 1959)',
  ],
};

// ============================================================================
// Python 端调用示例
// ============================================================================

export const PYTHON_CALL_EXAMPLE = `
# Python 端调用工况归一化 tRPC API 示例
import requests

BASE_URL = "http://localhost:3000/api/trpc"

# 1. 学习基线
resp = requests.post(f"{BASE_URL}/conditionNormalizer.learnBaseline", json={
    "historical_data": [
        {"plc_code": 2, "current": 82, "load_weight": 35, "vibration_speed": 3.5, "bearing_temp": 65},
        # ... 更多历史数据
    ],
    "target_condition": None,  # 自动识别工况
})
print(f"学习结果: {resp.json()['result']['data']['count']} 条基线")

# 2. 执行归一化
resp = requests.post(f"{BASE_URL}/conditionNormalizer.processSlice", json={
    "data_slice": {
        "plc_code": 2,
        "current": 95,
        "load_weight": 38,
        "vibration_speed": 5.2,
        "bearing_temp": 78,
        "motor_speed": 1380,
    },
    "method": "ratio",
})
result = resp.json()["result"]["data"]["data"]
print(f"工况: {result['condition']} ({result['condition_label']})")
print(f"综合状态: {result['overall_status']}")
for feat, status in result["status"].items():
    print(f"  {feat}: {status} (ratio={result['ratios'][feat]:.3f})")

# 3. 获取基线
resp = requests.get(f"{BASE_URL}/conditionNormalizer.getBaselines")
baselines = resp.json()["result"]["data"]["data"]

# 4. 更新阈值
resp = requests.post(f"{BASE_URL}/conditionNormalizer.updateThreshold", json={
    "condition": "LIFT_LOADED",
    "feature_name": "振动速度(mm/s)",
    "thresholds": {
        "normal": [0, 5.0],
        "warning": [5.0, 8.0],
        "danger": [8.0, 999],
    },
})

# 5. 批量处理
resp = requests.post(f"{BASE_URL}/conditionNormalizer.processBatch", json={
    "data_slices": [
        {"plc_code": 2, "current": 82, "vibration_speed": 3.5, "bearing_temp": 65},
        {"plc_code": 1, "current": 35, "vibration_speed": 1.8, "bearing_temp": 42},
    ],
    "method": "ratio",
})
results = resp.json()["result"]["data"]["data"]
print(f"批量处理: {len(results)} 条结果")

# 6. 添加自定义工况
resp = requests.post(f"{BASE_URL}/conditionNormalizer.addCondition", json={
    "id": "GANTRY_MOVE",
    "description": "大车行走",
    "key_features": "大车电机启动，水平移动",
    "typical_duration": "60-120s",
    "plc_code": 5,
})
`;
