/**
 * 高级知识蒸馏配置管理
 *
 * 1. Python DistilLib v2.4 ↔ TypeScript 字段映射
 * 2. 预设场景配置
 * 3. 算法注册表元数据（供 algorithm.registry 使用）
 * 4. 损失分量权重约束
 */

// ============================================================================
// Python ↔ TypeScript 字段映射
// ============================================================================

/**
 * Python snake_case → TypeScript camelCase 映射
 * 用于 Python 端调用 tRPC API 时的字段转换
 */
export const PYTHON_TO_TS_FIELD_MAP: Record<string, string> = {
  // DistilLib 配置
  'base_temp': 'baseTemp',
  'alpha_ema': 'alphaEma',
  'warmup_epochs': 'warmupEpochs',
  'temp_range': 'tempRange',
  'dataset_size': 'datasetSize',
  'teacher_input_dims': 'teacherInputDims',
  'teacher_hidden_dim': 'teacherHiddenDim',
  'teacher_feat_dim': 'teacherFeatDim',
  'student_input_dims': 'studentInputDims',
  'student_hidden_dim': 'studentHiddenDim',
  'student_feat_dim': 'studentFeatDim',
  'n_classes': 'nClasses',
  'learning_rate': 'learningRate',
  'validation_split': 'validationSplit',
  'modality_split': 'modalitySplit',
  'compute_budget': 'computeBudget',
  'num_classes': 'numClasses',

  // 输出字段
  'val_acc': 'valAcc',
  'compression_ratio': 'compressionRatio',
  'avg_latency_ms': 'avgLatencyMs',
  'teacher_student_agreement': 'teacherStudentAgreement',
  'est_flops_m': 'estFlopsM',
  'teacher_accuracy': 'teacherAccuracy',
  'student_precision': 'studentPrecision',
  'student_recall': 'studentRecall',
  'student_f1': 'studentF1',
  'teacher_params': 'teacherParams',
  'student_params': 'studentParams',
  'train_loss': 'trainLoss',
  'val_acc_history': 'valAccHistory',
  'loss_details': 'lossDetails',
  'best_val_acc': 'bestValAcc',
  'final_metrics': 'finalMetrics',
  'duration_ms': 'durationMs',
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
// 预设场景配置
// ============================================================================

export interface PresetScenario {
  id: string;
  name: string;
  description: string;
  modalities: number[];
  computeBudget: number;
  numClasses: number;
  datasetSize: number;
  recommendedWeights: Record<string, number>;
  recommendedTempRange: [number, number];
  tags: string[];
}

export const PRESET_SCENARIOS: PresetScenario[] = [
  {
    id: 'lightweight_single',
    name: '轻量单模态',
    description: '单一传感器数据，小规模分类任务，适合边缘部署',
    modalities: [64],
    computeBudget: 5e5,
    numClasses: 5,
    datasetSize: 5000,
    recommendedWeights: { alpha: 0.3, beta: 0.5, gamma: 0.2 },
    recommendedTempRange: [2, 4],
    tags: ['边缘部署', '单模态', '轻量'],
  },
  {
    id: 'standard_dual',
    name: '标准双模态',
    description: '振动+电流双模态，中等规模分类，平衡精度与速度',
    modalities: [128, 64],
    computeBudget: 1e6,
    numClasses: 10,
    datasetSize: 10000,
    recommendedWeights: { alpha: 0.3, beta: 0.4, gamma: 0.3 },
    recommendedTempRange: [2, 4],
    tags: ['双模态', '标准', '平衡'],
  },
  {
    id: 'complex_multi',
    name: '复杂多模态',
    description: '三模态以上，大规模分类，需要关系蒸馏和融合蒸馏',
    modalities: [256, 128, 64],
    computeBudget: 5e6,
    numClasses: 50,
    datasetSize: 50000,
    recommendedWeights: { alpha: 0.2, beta: 0.3, gamma: 0.2, relation: 0.15, fusion: 0.15 },
    recommendedTempRange: [3, 6],
    tags: ['多模态', '复杂', '关系蒸馏'],
  },
  {
    id: 'ultra_scale',
    name: '超大规模',
    description: '高维多模态，100+类别，工业级全量蒸馏',
    modalities: [512, 256, 128],
    computeBudget: 1e7,
    numClasses: 100,
    datasetSize: 200000,
    recommendedWeights: { alpha: 0.15, beta: 0.25, gamma: 0.2, relation: 0.2, fusion: 0.2 },
    recommendedTempRange: [3, 6],
    tags: ['超大规模', '全量蒸馏', '工业级'],
  },
  {
    id: 'crane_vibration_current',
    name: '港机振动+电流',
    description: '港口起重机专用：振动信号+电流信号双模态蒸馏',
    modalities: [128, 64],
    computeBudget: 2e6,
    numClasses: 8,
    datasetSize: 20000,
    recommendedWeights: { alpha: 0.25, beta: 0.35, gamma: 0.25, fusion: 0.15 },
    recommendedTempRange: [2, 5],
    tags: ['港机', '振动', '电流', '双模态'],
  },
];

// ============================================================================
// 损失分量配置
// ============================================================================

export interface LossComponentConfig {
  key: string;
  name: string;
  pythonClass: string;
  formula: string;
  description: string;
  defaultWeight: number;
  color: string;
  icon: string;
  requiresMultiModal: boolean;
  minSamples: number;
}

export const LOSS_COMPONENTS: LossComponentConfig[] = [
  {
    key: 'alpha',
    name: '硬标签损失',
    pythonClass: 'CrossEntropyLoss',
    formula: 'CE(student_logits, labels)',
    description: '学生模型对真实标签的分类损失，确保学生学到基本分类能力',
    defaultWeight: 0.3,
    color: '#3b82f6',
    icon: '🎯',
    requiresMultiModal: false,
    minSamples: 10,
  },
  {
    key: 'beta',
    name: '响应蒸馏损失',
    pythonClass: 'KLDivLoss + DynamicTemperature',
    formula: 'KL(teacher_soft ∥ student_soft) × T²',
    description: '教师软标签知识迁移，动态温度自适应调节软化程度',
    defaultWeight: 0.4,
    color: '#ef4444',
    icon: '🔥',
    requiresMultiModal: false,
    minSamples: 10,
  },
  {
    key: 'gamma',
    name: '特征蒸馏损失',
    pythonClass: 'FeatureDistillLoss',
    formula: 'MSE(L2Norm(proj(s_feat)), L2Norm(t_feat))',
    description: '中间特征层对齐，投影层适配维度差异，L2归一化消除尺度影响',
    defaultWeight: 0.3,
    color: '#22c55e',
    icon: '🧬',
    requiresMultiModal: false,
    minSamples: 20,
  },
  {
    key: 'relation',
    name: '关系蒸馏损失',
    pythonClass: 'RelationDistillLoss',
    formula: 'MSE(CosSim_matrix_S, CosSim_matrix_T)',
    description: '样本间余弦相似度矩阵对齐，保持教师模型的关系结构知识',
    defaultWeight: 0,
    color: '#f97316',
    icon: '🔗',
    requiresMultiModal: false,
    minSamples: 30,
  },
  {
    key: 'fusion',
    name: '融合蒸馏损失',
    pythonClass: 'MultimodalFusionLoss',
    formula: 'Σ_m KL(T_subset_m ∥ S_subset_m) / M',
    description: '子集模态KL对齐，确保学生模型在缺失模态时仍能保持性能',
    defaultWeight: 0,
    color: '#8b5cf6',
    icon: '🧩',
    requiresMultiModal: true,
    minSamples: 30,
  },
];

// ============================================================================
// 算法注册表元数据
// ============================================================================

export const ALGORITHM_REGISTRY_METADATA = {
  id: 'advanced_distillation',
  name: '高级知识蒸馏',
  version: '2.4.0',
  category: 'model_iteration',
  subcategory: 'knowledge_distillation',
  description: 'DistilLib v2.4 — 多模态知识蒸馏引擎，支持动态温度、特征蒸馏、关系蒸馏、融合蒸馏',
  tags: ['蒸馏', '模型压缩', '知识迁移', '多模态', '动态温度', '特征对齐', '关系蒸馏'],
  inputFields: [
    { name: 'trainingData.features', type: 'number[][]', description: '训练特征矩阵', required: true },
    { name: 'trainingData.labels', type: 'number[]', description: '训练标签', required: true },
    { name: 'trainingData.modalitySplit', type: 'number[]', description: '模态分割偏移量', required: false },
  ],
  outputFields: [
    { name: 'valAcc', type: 'number', description: '验证准确率' },
    { name: 'compressionRatio', type: 'number', description: '压缩比' },
    { name: 'teacherStudentAgreement', type: 'number', description: '师生一致率' },
    { name: 'studentF1', type: 'number', description: '学生F1分数' },
  ],
  configFields: [
    { name: 'weights', type: 'json', default: { alpha: 0.3, beta: 0.4, gamma: 0.3 }, description: '损失权重' },
    { name: 'tempRange', type: 'json', default: [2, 4], description: '动态温度范围' },
    { name: 'teacherHiddenDim', type: 'number', default: 512, description: '教师隐藏层维度' },
    { name: 'studentHiddenDim', type: 'number', default: 128, description: '学生隐藏层维度' },
    { name: 'epochs', type: 'number', default: 20, description: '训练轮数' },
    { name: 'learningRate', type: 'number', default: 0.001, description: '学习率' },
    { name: 'patience', type: 'number', default: 5, description: '早停耐心值' },
  ],
  applicableDeviceTypes: ['*'],
  applicableScenarios: ['模型压缩', '边缘部署', '推理加速', '多模态融合', '缺失模态'],
  complexity: 'O(E*N*M*P)',
  edgeDeployable: true,
  referenceStandards: [
    'Hinton et al. 2015 (Knowledge Distillation)',
    'Romero et al. 2015 (FitNets)',
    'Park et al. 2019 (Relational KD)',
    'Tian et al. 2020 (CRD)',
  ],
};

// ============================================================================
// Python 端调用示例（供文档使用）
// ============================================================================

export const PYTHON_CALL_EXAMPLE = `
# Python 端调用高级知识蒸馏 tRPC API 示例
import requests

BASE_URL = "http://localhost:3000/api/trpc"

# 1. 策略推荐
resp = requests.post(f"{BASE_URL}/advancedDistillation.recommendStrategy", json={
    "modalities": [128, 64],
    "compute_budget": 1e6,
    "num_classes": 10,
    "dataset_size": 10000,
})
strategy = resp.json()["result"]["data"]
print(f"推荐策略: {strategy['base']}, 权重: {strategy['weights']}")

# 2. 执行蒸馏训练
resp = requests.post(f"{BASE_URL}/advancedDistillation.train", json={
    "config": {
        "weights": strategy["weights"],
        "temp_range": strategy["temp_range"],
        "dataset_size": 10000,
        "teacher_input_dims": [128, 64],
        "teacher_hidden_dim": 512,
        "teacher_feat_dim": 256,
        "student_input_dims": [128, 64],
        "student_hidden_dim": 128,
        "student_feat_dim": 128,
        "n_classes": 10,
        "epochs": 20,
        "learning_rate": 1e-3,
        "patience": 5,
        "validation_split": 0.2,
    },
    "training_data": {
        "features": [...],  # number[][]
        "labels": [...],    # number[]
    },
})
result = resp.json()["result"]["data"]
print(f"最佳准确率: {result['best_val_acc']:.1%}")
print(f"压缩比: {result['final_metrics']['compression_ratio']:.1f}x")
`;
