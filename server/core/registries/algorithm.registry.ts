/**
 * ============================================================================
 * 算法注册中心 (Algorithm Registry)
 * ============================================================================
 * 
 * 设计原则：
 *   1. 统一编排层 — 不重建执行引擎，通过 implType + implRef 桥接已有模块
 *   2. 设备语义闭环 — applicableDeviceTypes / measurementTypes / scenarios 三维匹配
 *   3. KG 双向集成 — 算法可读写知识图谱
 *   4. 零配置扩展 — 新算法只需注册一次，前端自动展示
 *   5. 与 Pipeline / 插件引擎 / KG 算子 无缝桥接
 * 
 * 架构位置：
 *   BaseRegistry<AlgorithmRegistryItem>
 *     └── algorithmRegistry (本文件)
 *           ├── 机械算法 (8) → FFT/倒频谱/包络解调/小波包/带通滤波/谱峭度/重采样/阶次跟踪
 *           ├── 电气算法 (4) → MCSA/局放/变频器/电能质量
 *           ├── 结构算法 (5) → Miner损伤/声发射/模态分析/热点应力/雨流计数
 *           ├── 异常检测 (4) → Isolation Forest/LSTM/自编码器/SPC
 *           ├── 优化算法 (4) → PSO/GA/贝叶斯优化/模拟退火
 *           ├── 综合算法 (4) → DS证据融合/关联规则/因果推理/工况归一化
 *           ├── 特征提取 (5) → 时域/频域/时频域/统计/深度特征
 *           ├── Agent插件 (6) → 时序模式/案例检索/物理约束/空间异常/融合诊断/预测
 *           ├── 模型迭代 (4) → LoRA微调/全量重训练/增量学习/模型蒸馏
 *           └── 规则自动学习 (4) → LLM分析/关联规则/决策树/频繁模式
 */
import { BaseRegistry, type RegistryItemMeta, type CategoryMeta } from '../registry';

// ============ 算法配置字段定义（与 Pipeline ConfigFieldSchema 格式一致） ============
export interface AlgorithmConfigField {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'json' | 'slider' | 'code';
  required?: boolean;
  default?: unknown;
  placeholder?: string;
  description?: string;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

// ============ 算法 IO 字段定义 ============
export interface AlgorithmIOField {
  name: string;
  label: string;
  type: 'number' | 'number[]' | 'number[][]' | 'string' | 'string[]' | 'object' | 'boolean';
  required?: boolean;
  description?: string;
  unit?: string;
}

// ============ 算法注册项 ============
export interface AlgorithmRegistryItem extends RegistryItemMeta {
  id: string;
  /** 算法大类 */
  algorithmCategory: 'mechanical' | 'electrical' | 'structural' | 'anomaly_detection' | 'optimization' | 'comprehensive' | 'feature_extraction' | 'agent_plugin' | 'model_iteration' | 'rule_learning' | 'custom';
  /** 算法子类 */
  subcategory?: string;
  /** 实现类型 */
  implType: 'pipeline_node' | 'plugin' | 'builtin' | 'external' | 'kg_operator';
  /** 实现引用 */
  implRef?: string;
  /** 输入字段定义 */
  inputFields: AlgorithmIOField[];
  /** 输出字段定义 */
  outputFields: AlgorithmIOField[];
  /** 配置参数定义 */
  configFields: AlgorithmConfigField[];
  /** 适用设备类型 */
  applicableDeviceTypes: string[];
  /** 适用测量指标 */
  applicableMeasurementTypes: string[];
  /** 适用场景 */
  applicableScenarios: string[];
  /** KG 集成配置 */
  kgIntegration?: {
    writes_to_kg?: boolean;
    node_type?: string;
    edge_type?: string;
    reads_from_kg?: boolean;
  };
  /** 推荐的数据特征（用于智能推荐） */
  recommendedDataProfile?: {
    min_sample_rate_hz?: number;
    max_sample_rate_hz?: number;
    min_data_length?: number;
    preferred_data_types?: string[];
  };
  /** 计算复杂度 */
  complexity?: 'O(n)' | 'O(n log n)' | 'O(n^2)' | 'O(n^3)';
  /** 是否支持边缘部署 */
  edgeDeployable?: boolean;
  /** 许可类型 */
  license?: 'builtin' | 'community' | 'enterprise';
}

const ALGORITHM_CATEGORIES: CategoryMeta[] = [
  { id: 'mechanical', label: '机械算法', icon: '⚙️', order: 1, description: '振动信号处理与机械故障诊断', color: '#3B82F6' },
  { id: 'electrical', label: '电气算法', icon: '⚡', order: 2, description: '电气设备状态监测与故障诊断', color: '#F59E0B' },
  { id: 'structural', label: '结构算法', icon: '🏗️', order: 3, description: '结构健康监测与疲劳寿命评估', color: '#10B981' },
  { id: 'anomaly_detection', label: '异常检测', icon: '🚨', order: 4, description: '多维度异常检测与统计过程控制', color: '#EF4444' },
  { id: 'optimization', label: '优化算法', icon: '📈', order: 5, description: '智能优化与参数寻优', color: '#8B5CF6' },
  { id: 'comprehensive', label: '综合算法', icon: '🔗', order: 6, description: '多源信息融合与因果推理', color: '#06B6D4' },
  { id: 'feature_extraction', label: '特征提取', icon: '📊', order: 7, description: '时域/频域/时频域特征工程', color: '#84CC16' },
  { id: 'agent_plugin', label: 'Agent插件', icon: '🤖', order: 8, description: '智能诊断Agent专家插件', color: '#D946EF' },
  { id: 'model_iteration', label: '模型迭代', icon: '🔄', order: 9, description: '模型训练、微调、蒸馏与增量学习', color: '#F97316' },
  { id: 'rule_learning', label: '规则自动学习', icon: '📝', order: 10, description: '自动规则发现与模式挖掘', color: '#14B8A6' },
];

// ============ 内置算法定义（48 个） ============
const BUILTIN_ALGORITHMS: AlgorithmRegistryItem[] = [
  {
    id: 'fft_spectrum',
    label: 'FFT频谱分析',
    icon: '📊',
    description: '基于Cooley-Tukey FFT的频谱分析，支持ISO 10816/20816振动严重度评估、特征频率标注、窗函数选择',
    subcategory: '频谱分析',
    algorithmCategory: 'mechanical', category: 'mechanical',
    implType: 'builtin',
    implRef: 'server/algorithms/mechanical/FFTSpectrumAnalysis',
    inputFields: [{"name": "signal", "label": "时域振动信号", "type": "object", "description": "时域振动信号", "required": true}, {"name": "sampleRate", "label": "采样率(Hz)", "type": "number", "description": "采样率(Hz)", "required": true}],
    outputFields: [{"name": "spectrum", "label": "频谱数据(频率+幅值)", "type": "object", "description": "频谱数据(频率+幅值)"}, {"name": "dominantFrequencies", "label": "主要频率成分", "type": "object", "description": "主要频率成分"}, {"name": "overallLevel", "label": "总振动量(RMS)", "type": "number", "description": "总振动量(RMS)"}, {"name": "diagnosis", "label": "ISO评估结论(severity/zone)", "type": "object", "description": "ISO评估结论(severity/zone)"}],
    configFields: [{"name": "windowType", "label": "Windowtype", "type": "select", "default": "hanning", "options": [{"value": "hanning", "label": "hanning"}, {"value": "hamming", "label": "hamming"}, {"value": "blackman", "label": "blackman"}, {"value": "rectangular", "label": "rectangular"}, {"value": "kaiser", "label": "kaiser"}], "description": "窗函数类型"}, {"name": "fftSize", "label": "FFT点数", "type": "number", "default": 4096, "description": "FFT点数", "min": 256, "max": 65536}, {"name": "overlap", "label": "重叠率(0-1)", "type": "number", "default": 0.5, "description": "重叠率(0-1)", "min": 0, "max": 0.95}, {"name": "averageCount", "label": "平均次数", "type": "number", "default": 4, "description": "平均次数"}, {"name": "isoClass", "label": "Isoclass", "type": "select", "default": "class_III", "options": [{"value": "class_I", "label": "class_I"}, {"value": "class_II", "label": "class_II"}, {"value": "class_III", "label": "class_III"}, {"value": "class_IV", "label": "class_IV"}], "description": "ISO 10816设备分级"}],
    applicableDeviceTypes: ["rotating_machine", "motor", "pump", "fan", "compressor", "turbine", "*"],
    applicableMeasurementTypes: ["vibration_velocity", "vibration_acceleration", "vibration_displacement"],
    applicableScenarios: ["振动监测", "频谱分析", "故障诊断", "基线建立"],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    tags: ["FFT", "频谱", "ISO 10816", "ISO 20816", "振动", "Cooley-Tukey"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 100, "min_data_length": 1024},
    order: 0,
  },
  {
    id: 'cepstrum_analysis',
    label: '倒频谱分析',
    icon: '📈',
    description: '功率/复倒频谱分析，用于齿轮箱故障检测、边带间距识别、调制源分离',
    subcategory: '倒频谱',
    algorithmCategory: 'mechanical', category: 'mechanical',
    implType: 'builtin',
    implRef: 'server/algorithms/mechanical/CepstrumAnalysis',
    inputFields: [{"name": "signal", "label": "时域振动信号", "type": "object", "description": "时域振动信号", "required": true}, {"name": "sampleRate", "label": "采样率(Hz)", "type": "number", "description": "采样率(Hz)", "required": true}],
    outputFields: [{"name": "cepstrum", "label": "倒频谱数据(quefrency+amplitude)", "type": "object", "description": "倒频谱数据(quefrency+amplitude)"}, {"name": "dominantQuefrencies", "label": "主要倒频率成分", "type": "object", "description": "主要倒频率成分"}, {"name": "diagnosis", "label": "齿轮箱故障诊断结论", "type": "object", "description": "齿轮箱故障诊断结论"}],
    configFields: [{"name": "cepstrumType", "label": "Cepstrumtype", "type": "select", "default": "power", "options": [{"value": "power", "label": "power"}, {"value": "complex", "label": "complex"}], "description": "倒频谱类型"}, {"name": "lifterCutoff", "label": "升倒滤波截止(0=不滤波)", "type": "number", "default": 0, "description": "升倒滤波截止(0=不滤波)"}, {"name": "peakThreshold", "label": "峰值检测阈值(σ)", "type": "number", "default": 3, "description": "峰值检测阈值(σ)"}],
    applicableDeviceTypes: ["gearbox", "rotating_machine", "*"],
    applicableMeasurementTypes: ["vibration_acceleration"],
    applicableScenarios: ["齿轮箱诊断", "边带分析", "调制检测"],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    tags: ["倒频谱", "齿轮箱", "边带", "调制"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 1000, "min_data_length": 2048},
    order: 0,
  },
  {
    id: 'envelope_demod',
    label: '包络解调分析',
    icon: '🔔',
    description: 'Hilbert变换包络解调，自适应带通滤波，BPFO/BPFI/BSF/FTF轴承特征频率匹配',
    subcategory: '包络分析',
    algorithmCategory: 'mechanical', category: 'mechanical',
    implType: 'builtin',
    implRef: 'server/algorithms/mechanical/EnvelopeDemodulation',
    inputFields: [{"name": "signal", "label": "时域振动信号", "type": "object", "description": "时域振动信号", "required": true}, {"name": "sampleRate", "label": "采样率(Hz)", "type": "number", "description": "采样率(Hz)", "required": true}],
    outputFields: [{"name": "envelopeSpectrum", "label": "包络谱", "type": "object", "description": "包络谱"}, {"name": "bearingFaults", "label": "轴承故障匹配结果", "type": "object", "description": "轴承故障匹配结果"}, {"name": "diagnosis", "label": "轴承故障诊断结论", "type": "object", "description": "轴承故障诊断结论"}],
    configFields: [{"name": "bandpassLow", "label": "带通下限(Hz,0=自动)", "type": "number", "default": 0, "description": "带通下限(Hz,0=自动)"}, {"name": "bandpassHigh", "label": "带通上限(Hz,0=自动)", "type": "number", "default": 0, "description": "带通上限(Hz,0=自动)"}, {"name": "bearingParams", "label": "轴承参数", "type": "json", "default": null, "description": "轴承参数{ballCount,ballDiameter,pitchDiameter,contactAngle}"}, {"name": "shaftRPM", "label": "转速(RPM)", "type": "number", "default": 1500, "description": "转速(RPM)"}],
    applicableDeviceTypes: ["bearing", "rotating_machine", "motor", "pump", "*"],
    applicableMeasurementTypes: ["vibration_acceleration"],
    applicableScenarios: ["轴承诊断", "包络分析", "早期故障检测"],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    tags: ["包络", "Hilbert", "轴承", "BPFO", "BPFI", "BSF", "FTF"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 5000, "min_data_length": 4096},
    order: 0,
  },
  {
    id: 'wavelet_packet',
    label: '小波包分解',
    icon: '🌊',
    description: '多层小波包分解(db4/db8/sym5)，能量分布分析，Shannon熵，非平稳信号时频分析',
    subcategory: '时频分析',
    algorithmCategory: 'mechanical', category: 'mechanical',
    implType: 'builtin',
    implRef: 'server/algorithms/mechanical/WaveletPacketDecomposition',
    inputFields: [{"name": "signal", "label": "时域信号", "type": "object", "description": "时域信号", "required": true}, {"name": "sampleRate", "label": "采样率(Hz)", "type": "number", "description": "采样率(Hz)", "required": true}],
    outputFields: [{"name": "nodes", "label": "各节点系数", "type": "object", "description": "各节点系数"}, {"name": "energyDistribution", "label": "频带能量分布", "type": "object", "description": "频带能量分布"}, {"name": "shannonEntropy", "label": "Shannon熵", "type": "number", "description": "Shannon熵"}, {"name": "diagnosis", "label": "能量分布异常诊断", "type": "object", "description": "能量分布异常诊断"}],
    configFields: [{"name": "wavelet", "label": "Wavelet", "type": "select", "default": "db4", "options": [{"value": "db4", "label": "db4"}, {"value": "db8", "label": "db8"}, {"value": "sym5", "label": "sym5"}, {"value": "coif3", "label": "coif3"}], "description": "小波基函数"}, {"name": "level", "label": "分解层数", "type": "number", "default": 4, "description": "分解层数", "min": 1, "max": 8}],
    applicableDeviceTypes: ["rotating_machine", "*"],
    applicableMeasurementTypes: ["vibration_acceleration", "vibration_velocity"],
    applicableScenarios: ["非平稳分析", "时频分析", "能量分布"],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    tags: ["小波包", "WPD", "时频分析", "Shannon熵"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 100, "min_data_length": 512},
    order: 0,
  },
  {
    id: 'bandpass_filter',
    label: '带通滤波',
    icon: '🎛️',
    description: 'Butterworth/Chebyshev IIR带通滤波器，零相位滤波(filtfilt)，频带隔离',
    subcategory: '信号预处理',
    algorithmCategory: 'mechanical', category: 'mechanical',
    implType: 'builtin',
    implRef: 'server/algorithms/mechanical/BandpassFilter',
    inputFields: [{"name": "signal", "label": "时域信号", "type": "object", "description": "时域信号", "required": true}, {"name": "sampleRate", "label": "采样率(Hz)", "type": "number", "description": "采样率(Hz)", "required": true}],
    outputFields: [{"name": "filtered", "label": "滤波后信号", "type": "object", "description": "滤波后信号"}, {"name": "filterResponse", "label": "滤波器频率响应", "type": "object", "description": "滤波器频率响应"}],
    configFields: [{"name": "lowCutoff", "label": "下截止频率(Hz)", "type": "number", "default": 100, "description": "下截止频率(Hz)"}, {"name": "highCutoff", "label": "上截止频率(Hz)", "type": "number", "default": 5000, "description": "上截止频率(Hz)"}, {"name": "filterOrder", "label": "滤波器阶数", "type": "number", "default": 4, "description": "滤波器阶数", "min": 1, "max": 10}, {"name": "filterType", "label": "Filtertype", "type": "select", "default": "butterworth", "options": [{"value": "butterworth", "label": "butterworth"}, {"value": "chebyshev", "label": "chebyshev"}], "description": "滤波器类型"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["vibration_acceleration", "vibration_velocity", "current", "acoustic"],
    applicableScenarios: ["信号预处理", "频带隔离", "噪声消除"],
    complexity: 'O(n)',
    edgeDeployable: true,
    tags: ["滤波", "Butterworth", "Chebyshev", "IIR", "带通"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 100, "min_data_length": 256},
    order: 0,
  },
  {
    id: 'spectral_kurtosis',
    label: '谱峭度SK',
    icon: '📐',
    description: 'Fast Kurtogram (Antoni 2006)，最佳解调频带自动选择，瞬态冲击检测',
    subcategory: '高级诊断',
    algorithmCategory: 'mechanical', category: 'mechanical',
    implType: 'builtin',
    implRef: 'server/algorithms/mechanical/SpectralKurtosis',
    inputFields: [{"name": "signal", "label": "时域振动信号", "type": "object", "description": "时域振动信号", "required": true}, {"name": "sampleRate", "label": "采样率(Hz)", "type": "number", "description": "采样率(Hz)", "required": true}],
    outputFields: [{"name": "kurtogram", "label": "Kurtogram矩阵", "type": "object", "description": "Kurtogram矩阵"}, {"name": "optimalBand", "label": "Optimalband", "type": "object", "description": "最佳频带{center,bandwidth}"}, {"name": "filteredSignal", "label": "最佳频带滤波信号", "type": "object", "description": "最佳频带滤波信号"}, {"name": "diagnosis", "label": "冲击检测结论", "type": "object", "description": "冲击检测结论"}],
    configFields: [{"name": "maxLevel", "label": "最大分解层数", "type": "number", "default": 6, "description": "最大分解层数"}],
    applicableDeviceTypes: ["bearing", "gearbox", "rotating_machine", "*"],
    applicableMeasurementTypes: ["vibration_acceleration"],
    applicableScenarios: ["最佳频带选择", "冲击检测", "轴承早期故障"],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    tags: ["谱峭度", "Kurtogram", "Antoni", "冲击检测"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 5000, "min_data_length": 4096},
    order: 0,
  },
  {
    id: 'resampling',
    label: '重采样',
    icon: '🔄',
    description: '多项式插值重采样，抗混叠滤波，角度域重采样，采样率转换',
    subcategory: '信号预处理',
    algorithmCategory: 'mechanical', category: 'mechanical',
    implType: 'builtin',
    implRef: 'server/algorithms/mechanical/Resampling',
    inputFields: [{"name": "signal", "label": "原始信号", "type": "object", "description": "原始信号", "required": true}, {"name": "originalRate", "label": "原始采样率(Hz)", "type": "number", "description": "原始采样率(Hz)", "required": true}],
    outputFields: [{"name": "resampled", "label": "重采样后信号", "type": "object", "description": "重采样后信号"}, {"name": "newSampleRate", "label": "新采样率", "type": "number", "description": "新采样率"}],
    configFields: [{"name": "targetRate", "label": "目标采样率(Hz)", "type": "number", "default": 10000, "description": "目标采样率(Hz)"}, {"name": "antiAlias", "label": "启用抗混叠滤波", "type": "boolean", "default": true, "description": "启用抗混叠滤波"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["采样率转换", "数据对齐", "角度域重采样"],
    complexity: 'O(n)',
    edgeDeployable: true,
    tags: ["重采样", "插值", "抗混叠"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 10, "min_data_length": 64},
    order: 0,
  },
  {
    id: 'order_tracking',
    label: '阶次跟踪分析',
    icon: '🎯',
    description: '角度域重采样阶次跟踪，阶次谱分析，变速工况诊断',
    subcategory: '阶次分析',
    algorithmCategory: 'mechanical', category: 'mechanical',
    implType: 'builtin',
    implRef: 'server/algorithms/mechanical/OrderTracking',
    inputFields: [{"name": "signal", "label": "振动信号", "type": "object", "description": "振动信号", "required": true}, {"name": "sampleRate", "label": "采样率(Hz)", "type": "number", "description": "采样率(Hz)", "required": true}, {"name": "tachoPulses", "label": "转速脉冲时间戳(可选)", "type": "object", "description": "转速脉冲时间戳(可选)"}],
    outputFields: [{"name": "orderSpectrum", "label": "阶次谱", "type": "object", "description": "阶次谱"}, {"name": "dominantOrders", "label": "主要阶次成分", "type": "object", "description": "主要阶次成分"}, {"name": "diagnosis", "label": "变速工况诊断结论", "type": "object", "description": "变速工况诊断结论"}],
    configFields: [{"name": "maxOrder", "label": "最大阶次", "type": "number", "default": 20, "description": "最大阶次"}, {"name": "samplesPerRev", "label": "每转采样点数", "type": "number", "default": 256, "description": "每转采样点数"}, {"name": "rpmEstimate", "label": "估计转速(RPM)", "type": "number", "default": 1500, "description": "估计转速(RPM)"}],
    applicableDeviceTypes: ["rotating_machine", "motor", "gearbox", "*"],
    applicableMeasurementTypes: ["vibration_acceleration", "vibration_velocity"],
    applicableScenarios: ["变速诊断", "阶次分析", "升降速测试"],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    tags: ["阶次跟踪", "角度域", "变速", "阶次谱"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 1000, "min_data_length": 2048},
    order: 0,
  },
  {
    id: 'mcsa_analysis',
    label: '电机电流分析MCSA',
    icon: '⚡',
    description: '电机电流特征分析(MCSA)，转子/偏心/轴承故障边带检测，基于IEEE Std 1415',
    subcategory: '电机诊断',
    algorithmCategory: 'electrical', category: 'electrical',
    implType: 'builtin',
    implRef: 'server/algorithms/electrical/MCSAAnalysis',
    inputFields: [{"name": "current", "label": "电流信号(A)", "type": "object", "description": "电流信号(A)", "required": true}, {"name": "sampleRate", "label": "采样率(Hz)", "type": "number", "description": "采样率(Hz)", "required": true}],
    outputFields: [{"name": "spectrum", "label": "电流频谱", "type": "object", "description": "电流频谱"}, {"name": "sidebands", "label": "检测到的边带", "type": "object", "description": "检测到的边带"}, {"name": "faultIndicators", "label": "故障指标", "type": "object", "description": "故障指标"}, {"name": "diagnosis", "label": "电机故障诊断结论", "type": "object", "description": "电机故障诊断结论"}],
    configFields: [{"name": "lineFrequency", "label": "电网频率(Hz)", "type": "number", "default": 50, "description": "电网频率(Hz)"}, {"name": "poles", "label": "电机极数", "type": "number", "default": 4, "description": "电机极数"}, {"name": "ratedRPM", "label": "额定转速(RPM)", "type": "number", "default": 1470, "description": "额定转速(RPM)"}, {"name": "fftSize", "label": "FFT点数", "type": "number", "default": 16384, "description": "FFT点数"}],
    applicableDeviceTypes: ["motor", "induction_motor", "*"],
    applicableMeasurementTypes: ["current", "stator_current"],
    applicableScenarios: ["电机诊断", "转子故障", "偏心检测"],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    tags: ["MCSA", "电机", "电流分析", "转子", "偏心", "IEEE 1415"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 5000, "min_data_length": 16384},
    order: 0,
  },
  {
    id: 'partial_discharge',
    label: '局部放电PD分析',
    icon: '💥',
    description: '局部放电PRPD模式分析，IEC 60270标准，缺陷类型分类(内部/表面/电晕)',
    subcategory: '绝缘诊断',
    algorithmCategory: 'electrical', category: 'electrical',
    implType: 'builtin',
    implRef: 'server/algorithms/electrical/PartialDischargeAnalysis',
    inputFields: [{"name": "pdSignal", "label": "PD信号", "type": "object", "description": "PD信号", "required": true}, {"name": "phaseAngle", "label": "相位角(度)", "type": "object", "description": "相位角(度)", "required": true}, {"name": "sampleRate", "label": "采样率(Hz)", "type": "number", "description": "采样率(Hz)", "required": true}],
    outputFields: [{"name": "prpdPattern", "label": "PRPD相位分布图", "type": "object", "description": "PRPD相位分布图"}, {"name": "pdStatistics", "label": "PD统计参数", "type": "object", "description": "PD统计参数"}, {"name": "defectType", "label": "缺陷类型分类", "type": "string", "description": "缺陷类型分类"}, {"name": "diagnosis", "label": "绝缘状态诊断结论", "type": "object", "description": "绝缘状态诊断结论"}],
    configFields: [{"name": "phaseBins", "label": "相位分辨率(bins)", "type": "number", "default": 360, "description": "相位分辨率(bins)"}, {"name": "noiseThreshold", "label": "噪声阈值(pC)", "type": "number", "default": 0.1, "description": "噪声阈值(pC)"}, {"name": "lineFrequency", "label": "工频(Hz)", "type": "number", "default": 50, "description": "工频(Hz)"}],
    applicableDeviceTypes: ["transformer", "cable", "switchgear", "motor", "*"],
    applicableMeasurementTypes: ["partial_discharge", "ultrasonic"],
    applicableScenarios: ["绝缘诊断", "局部放电监测", "缺陷分类"],
    complexity: 'O(n)',
    edgeDeployable: true,
    tags: ["局部放电", "PD", "PRPD", "IEC 60270", "绝缘"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 1000000, "min_data_length": 1000},
    order: 0,
  },
  {
    id: 'vfd_analysis',
    label: '变频器状态分析',
    icon: '🔌',
    description: '变频器输入谐波/PWM质量/直流母线纹波分析，IEEE 519谐波限值评估',
    subcategory: '变频器诊断',
    algorithmCategory: 'electrical', category: 'electrical',
    implType: 'builtin',
    implRef: 'server/algorithms/electrical/VFDAnalysis',
    inputFields: [{"name": "voltage", "label": "电压信号(V)", "type": "object", "description": "电压信号(V)", "required": true}, {"name": "current", "label": "电流信号(A)", "type": "object", "description": "电流信号(A)", "required": true}, {"name": "sampleRate", "label": "采样率(Hz)", "type": "number", "description": "采样率(Hz)", "required": true}],
    outputFields: [{"name": "harmonics", "label": "谐波分析结果", "type": "object", "description": "谐波分析结果"}, {"name": "thd", "label": "总谐波畸变率(%)", "type": "number", "description": "总谐波畸变率(%)"}, {"name": "diagnosis", "label": "变频器状态诊断结论", "type": "object", "description": "变频器状态诊断结论"}],
    configFields: [{"name": "fundamentalFreq", "label": "基波频率(Hz)", "type": "number", "default": 50, "description": "基波频率(Hz)"}, {"name": "maxHarmonic", "label": "最大谐波次数", "type": "number", "default": 50, "description": "最大谐波次数"}, {"name": "switchingFreq", "label": "开关频率(Hz)", "type": "number", "default": 4000, "description": "开关频率(Hz)"}],
    applicableDeviceTypes: ["vfd", "inverter", "*"],
    applicableMeasurementTypes: ["voltage", "current"],
    applicableScenarios: ["变频器诊断", "谐波分析", "PWM质量评估"],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    tags: ["变频器", "VFD", "谐波", "PWM", "IEEE 519"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 10000, "min_data_length": 4096},
    order: 0,
  },
  {
    id: 'power_quality',
    label: '电能质量分析',
    icon: '🔋',
    description: 'THD/TDD(IEEE 519)、个次谐波、三相不平衡度、功率因数分析',
    subcategory: '电能质量',
    algorithmCategory: 'electrical', category: 'electrical',
    implType: 'builtin',
    implRef: 'server/algorithms/electrical/PowerQualityAnalysis',
    inputFields: [{"name": "voltages", "label": "三相电压信号[A,B,C]", "type": "number[][]", "description": "三相电压信号[A,B,C]", "required": true}, {"name": "currents", "label": "三相电流信号[A,B,C]", "type": "number[][]", "description": "三相电流信号[A,B,C]", "required": true}, {"name": "sampleRate", "label": "采样率(Hz)", "type": "number", "description": "采样率(Hz)", "required": true}],
    outputFields: [{"name": "thd", "label": "THD/TDD结果", "type": "object", "description": "THD/TDD结果"}, {"name": "harmonics", "label": "各次谐波", "type": "object", "description": "各次谐波"}, {"name": "unbalance", "label": "三相不平衡度", "type": "object", "description": "三相不平衡度"}, {"name": "diagnosis", "label": "电能质量评估结论", "type": "object", "description": "电能质量评估结论"}],
    configFields: [{"name": "fundamentalFreq", "label": "基波频率(Hz)", "type": "number", "default": 50, "description": "基波频率(Hz)"}, {"name": "maxHarmonic", "label": "最大谐波次数", "type": "number", "default": 50, "description": "最大谐波次数"}, {"name": "ieee519Limit", "label": "IEEE 519 TDD限值(%)", "type": "number", "default": 5, "description": "IEEE 519 TDD限值(%)"}],
    applicableDeviceTypes: ["power_system", "transformer", "motor", "*"],
    applicableMeasurementTypes: ["voltage", "current", "power"],
    applicableScenarios: ["电能质量", "谐波治理", "功率因数"],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    tags: ["电能质量", "THD", "TDD", "IEEE 519", "谐波", "三相不平衡"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 5000, "min_data_length": 2048},
    order: 0,
  },
  {
    id: 'miner_damage',
    label: 'Miner线性累积损伤',
    icon: '⚠️',
    description: 'Palmgren-Miner线性累积损伤法，S-N曲线拟合，剩余寿命评估',
    subcategory: '疲劳评估',
    algorithmCategory: 'structural', category: 'structural',
    implType: 'builtin',
    implRef: 'server/algorithms/structural/MinerDamageAccumulation',
    inputFields: [{"name": "stressHistory", "label": "应力历史(MPa)", "type": "object", "description": "应力历史(MPa)", "required": true}],
    outputFields: [{"name": "damageIndex", "label": "累积损伤指数D", "type": "number", "description": "累积损伤指数D"}, {"name": "remainingLife", "label": "剩余寿命(%)", "type": "number", "description": "剩余寿命(%)"}, {"name": "diagnosis", "label": "疲劳寿命评估结论", "type": "object", "description": "疲劳寿命评估结论"}],
    configFields: [{"name": "snCurveA", "label": "S-N曲线系数A", "type": "number", "default": 1000000000000.0, "description": "S-N曲线系数A"}, {"name": "snCurveM", "label": "S-N曲线指数m", "type": "number", "default": 3, "description": "S-N曲线指数m"}, {"name": "enduranceLimit", "label": "疲劳极限(MPa)", "type": "number", "default": 50, "description": "疲劳极限(MPa)"}, {"name": "safetyFactor", "label": "安全系数", "type": "number", "default": 2, "description": "安全系数"}],
    applicableDeviceTypes: ["structure", "bridge", "crane", "pressure_vessel", "*"],
    applicableMeasurementTypes: ["stress", "strain"],
    applicableScenarios: ["疲劳评估", "寿命预测", "损伤累积"],
    complexity: 'O(n)',
    edgeDeployable: true,
    tags: ["Miner", "疲劳", "S-N曲线", "累积损伤", "寿命"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 1, "min_data_length": 100},
    order: 0,
  },
  {
    id: 'acoustic_emission',
    label: '声发射分析AE',
    icon: '🔊',
    description: '声发射参数分析(振幅/能量/计数)、TDOA三角定位、Felicity比评估',
    subcategory: '声发射',
    algorithmCategory: 'structural', category: 'structural',
    implType: 'builtin',
    implRef: 'server/algorithms/structural/AcousticEmissionAnalysis',
    inputFields: [{"name": "aeSignals", "label": "多通道AE信号", "type": "number[][]", "description": "多通道AE信号", "required": true}, {"name": "sampleRate", "label": "采样率(Hz)", "type": "number", "description": "采样率(Hz)", "required": true}],
    outputFields: [{"name": "events", "label": "AE事件列表", "type": "object", "description": "AE事件列表"}, {"name": "sourceLocations", "label": "源定位结果", "type": "object", "description": "源定位结果"}, {"name": "diagnosis", "label": "结构损伤诊断结论", "type": "object", "description": "结构损伤诊断结论"}],
    configFields: [{"name": "threshold", "label": "检测阈值(dB)", "type": "number", "default": 40, "description": "检测阈值(dB)"}, {"name": "sensorPositions", "label": "传感器位置坐标", "type": "json", "default": [], "description": "传感器位置坐标"}, {"name": "waveSpeed", "label": "波速(m/s)", "type": "number", "default": 5000, "description": "波速(m/s)"}],
    applicableDeviceTypes: ["structure", "pressure_vessel", "pipeline", "*"],
    applicableMeasurementTypes: ["acoustic_emission"],
    applicableScenarios: ["结构监测", "裂纹检测", "源定位"],
    complexity: 'O(n)',
    edgeDeployable: true,
    tags: ["声发射", "AE", "TDOA", "Felicity", "结构健康"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 1000000, "min_data_length": 1000},
    order: 0,
  },
  {
    id: 'modal_analysis',
    label: '模态分析',
    icon: '🏗️',
    description: 'FDD频域分解模态分析，固有频率/阻尼比/振型提取，MAC矩阵',
    subcategory: '模态分析',
    algorithmCategory: 'structural', category: 'structural',
    implType: 'builtin',
    implRef: 'server/algorithms/structural/ModalAnalysis',
    inputFields: [{"name": "signals", "label": "多测点振动信号", "type": "number[][]", "description": "多测点振动信号", "required": true}, {"name": "sampleRate", "label": "采样率(Hz)", "type": "number", "description": "采样率(Hz)", "required": true}],
    outputFields: [{"name": "modes", "label": "模态参数(频率/阻尼比/振型)", "type": "object", "description": "模态参数(频率/阻尼比/振型)"}, {"name": "macMatrix", "label": "MAC矩阵", "type": "number[][]", "description": "MAC矩阵"}, {"name": "diagnosis", "label": "结构状态诊断结论", "type": "object", "description": "结构状态诊断结论"}],
    configFields: [{"name": "maxModes", "label": "最大模态数", "type": "number", "default": 10, "description": "最大模态数"}, {"name": "frequencyRange", "label": "频率范围", "type": "json", "default": {"min": 0, "max": 100}, "description": "频率范围(Hz)"}],
    applicableDeviceTypes: ["structure", "bridge", "building", "*"],
    applicableMeasurementTypes: ["vibration_acceleration"],
    applicableScenarios: ["模态分析", "结构健康监测", "损伤检测"],
    complexity: 'O(n^2)',
    edgeDeployable: false,
    tags: ["模态", "FDD", "固有频率", "阻尼比", "MAC"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 100, "min_data_length": 4096},
    order: 0,
  },
  {
    id: 'hotspot_stress',
    label: '热点应力法',
    icon: '🔥',
    description: '线性/二次外推热点应力，SCF应力集中因子，IIW焊接疲劳评估',
    subcategory: '焊接评估',
    algorithmCategory: 'structural', category: 'structural',
    implType: 'builtin',
    implRef: 'server/algorithms/structural/HotspotStressMethod',
    inputFields: [{"name": "stressData", "label": "Stressdata", "type": "object", "description": "应变片数据[{distance,stress}]", "required": true}],
    outputFields: [{"name": "hotspotStress", "label": "热点应力(MPa)", "type": "number", "description": "热点应力(MPa)"}, {"name": "scf", "label": "应力集中因子", "type": "number", "description": "应力集中因子"}, {"name": "diagnosis", "label": "焊接疲劳评估结论", "type": "object", "description": "焊接疲劳评估结论"}],
    configFields: [{"name": "method", "label": "Method", "type": "select", "default": "linear", "options": [{"value": "linear", "label": "linear"}, {"value": "quadratic", "label": "quadratic"}], "description": "外推方法"}, {"name": "fatigueCurve", "label": "Fatiguecurve", "type": "select", "default": "FAT90", "options": [{"value": "FAT36", "label": "FAT36"}, {"value": "FAT40", "label": "FAT40"}, {"value": "FAT50", "label": "FAT50"}, {"value": "FAT63", "label": "FAT63"}, {"value": "FAT71", "label": "FAT71"}, {"value": "FAT80", "label": "FAT80"}, {"value": "FAT90", "label": "FAT90"}, {"value": "FAT100", "label": "FAT100"}], "description": "IIW疲劳等级"}],
    applicableDeviceTypes: ["structure", "pressure_vessel", "crane", "*"],
    applicableMeasurementTypes: ["stress", "strain"],
    applicableScenarios: ["焊接评估", "热点应力", "疲劳分析"],
    complexity: 'O(n)',
    edgeDeployable: true,
    tags: ["热点应力", "SCF", "IIW", "焊接", "疲劳"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 1, "min_data_length": 3},
    order: 0,
  },
  {
    id: 'rainflow_counting',
    label: '雨流计数法',
    icon: '🌧️',
    description: 'ASTM E1049四点法雨流计数，Markov矩阵，载荷谱统计',
    subcategory: '载荷分析',
    algorithmCategory: 'structural', category: 'structural',
    implType: 'builtin',
    implRef: 'server/algorithms/structural/RainflowCounting',
    inputFields: [{"name": "loadHistory", "label": "载荷历史", "type": "object", "description": "载荷历史", "required": true}],
    outputFields: [{"name": "cycles", "label": "雨流循环列表", "type": "object", "description": "雨流循环列表"}, {"name": "markovMatrix", "label": "Markov转移矩阵", "type": "number[][]", "description": "Markov转移矩阵"}, {"name": "rangeHistogram", "label": "幅值直方图", "type": "object", "description": "幅值直方图"}, {"name": "diagnosis", "label": "载荷谱评估结论", "type": "object", "description": "载荷谱评估结论"}],
    configFields: [{"name": "binCount", "label": "直方图分箱数", "type": "number", "default": 64, "description": "直方图分箱数"}],
    applicableDeviceTypes: ["structure", "bridge", "crane", "*"],
    applicableMeasurementTypes: ["stress", "strain", "force", "displacement"],
    applicableScenarios: ["载荷谱分析", "疲劳评估", "雨流计数"],
    complexity: 'O(n)',
    edgeDeployable: true,
    tags: ["雨流", "ASTM E1049", "Markov", "载荷谱"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 1, "min_data_length": 100},
    order: 0,
  },
  {
    id: 'isolation_forest',
    label: 'Isolation Forest',
    icon: '🌲',
    description: '随机森林异常检测，异常分数计算，多维特征空间异常识别',
    subcategory: '机器学习',
    algorithmCategory: 'anomaly_detection', category: 'anomaly_detection',
    implType: 'builtin',
    implRef: 'server/algorithms/anomaly/IsolationForestDetector',
    inputFields: [{"name": "data", "label": "多维特征数据", "type": "number[][]", "description": "多维特征数据", "required": true}],
    outputFields: [{"name": "anomalyScores", "label": "异常分数", "type": "object", "description": "异常分数"}, {"name": "anomalyLabels", "label": "异常标签", "type": "boolean", "description": "异常标签"}, {"name": "diagnosis", "label": "异常检测结论", "type": "object", "description": "异常检测结论"}],
    configFields: [{"name": "numTrees", "label": "树的数量", "type": "number", "default": 100, "description": "树的数量"}, {"name": "subSampleSize", "label": "子采样大小", "type": "number", "default": 256, "description": "子采样大小"}, {"name": "contamination", "label": "预期异常比例", "type": "number", "default": 0.05, "description": "预期异常比例"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["异常检测", "离群点识别", "多维监测"],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    tags: ["Isolation Forest", "异常检测", "随机森林"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 1, "min_data_length": 100},
    order: 0,
  },
  {
    id: 'lstm_anomaly',
    label: 'LSTM异常检测',
    icon: '🧠',
    description: 'LSTM预测+残差异常检测，自适应阈值，时序数据深度学习异常识别',
    subcategory: '深度学习',
    algorithmCategory: 'anomaly_detection', category: 'anomaly_detection',
    implType: 'builtin',
    implRef: 'server/algorithms/anomaly/LSTMAnomalyDetector',
    inputFields: [{"name": "timeSeries", "label": "时序数据", "type": "object", "description": "时序数据", "required": true}],
    outputFields: [{"name": "predictions", "label": "预测值", "type": "object", "description": "预测值"}, {"name": "residuals", "label": "残差", "type": "object", "description": "残差"}, {"name": "anomalyLabels", "label": "异常标签", "type": "boolean", "description": "异常标签"}, {"name": "diagnosis", "label": "异常检测结论", "type": "object", "description": "异常检测结论"}],
    configFields: [{"name": "windowSize", "label": "滑动窗口大小", "type": "number", "default": 50, "description": "滑动窗口大小"}, {"name": "hiddenSize", "label": "LSTM隐藏层大小", "type": "number", "default": 64, "description": "LSTM隐藏层大小"}, {"name": "thresholdSigma", "label": "阈值(σ)", "type": "number", "default": 3, "description": "阈值(σ)"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["时序异常检测", "预测性维护", "退化监测"],
    complexity: 'O(n)',
    edgeDeployable: false,
    tags: ["LSTM", "深度学习", "时序异常", "预测"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 1, "min_data_length": 200},
    order: 0,
  },
  {
    id: 'autoencoder_anomaly',
    label: '自编码器异常检测',
    icon: '🔬',
    description: '自编码器重构误差异常检测，多变量特征空间，非线性异常识别',
    subcategory: '深度学习',
    algorithmCategory: 'anomaly_detection', category: 'anomaly_detection',
    implType: 'builtin',
    implRef: 'server/algorithms/anomaly/AutoencoderAnomalyDetector',
    inputFields: [{"name": "data", "label": "多维特征数据", "type": "number[][]", "description": "多维特征数据", "required": true}],
    outputFields: [{"name": "reconstructionErrors", "label": "重构误差", "type": "object", "description": "重构误差"}, {"name": "anomalyLabels", "label": "异常标签", "type": "boolean", "description": "异常标签"}, {"name": "diagnosis", "label": "异常检测结论", "type": "object", "description": "异常检测结论"}],
    configFields: [{"name": "encoderLayers", "label": "编码器结构", "type": "json", "default": [32, 16, 8], "description": "编码器结构"}, {"name": "epochs", "label": "训练轮数", "type": "number", "default": 50, "description": "训练轮数"}, {"name": "thresholdPercentile", "label": "阈值百分位", "type": "number", "default": 95, "description": "阈值百分位"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["多变量异常检测", "非线性异常", "特征空间监测"],
    complexity: 'O(n)',
    edgeDeployable: false,
    tags: ["自编码器", "重构误差", "多变量", "深度学习"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 1, "min_data_length": 100},
    order: 0,
  },
  {
    id: 'spc_control',
    label: '统计过程控制SPC',
    icon: '📉',
    description: 'Shewhart/CUSUM/EWMA控制图，Western Electric规则，过程能力指数',
    subcategory: '统计方法',
    algorithmCategory: 'anomaly_detection', category: 'anomaly_detection',
    implType: 'builtin',
    implRef: 'server/algorithms/anomaly/SPCControl',
    inputFields: [{"name": "data", "label": "过程数据", "type": "object", "description": "过程数据", "required": true}],
    outputFields: [{"name": "controlChart", "label": "控制图数据", "type": "object", "description": "控制图数据"}, {"name": "violations", "label": "违规点", "type": "object", "description": "违规点"}, {"name": "processCapability", "label": "过程能力指数", "type": "object", "description": "过程能力指数"}, {"name": "diagnosis", "label": "过程控制评估结论", "type": "object", "description": "过程控制评估结论"}],
    configFields: [{"name": "chartType", "label": "Charttype", "type": "select", "default": "shewhart", "options": [{"value": "shewhart", "label": "shewhart"}, {"value": "cusum", "label": "cusum"}, {"value": "ewma", "label": "ewma"}], "description": "控制图类型"}, {"name": "sigma", "label": "控制限(σ)", "type": "number", "default": 3, "description": "控制限(σ)"}, {"name": "ewmaLambda", "label": "EWMA平滑系数", "type": "number", "default": 0.2, "description": "EWMA平滑系数"}, {"name": "cusumK", "label": "CUSUM参考值", "type": "number", "default": 0.5, "description": "CUSUM参考值"}, {"name": "cusumH", "label": "CUSUM决策间隔", "type": "number", "default": 5, "description": "CUSUM决策间隔"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["过程控制", "质量监测", "异常检测"],
    complexity: 'O(n)',
    edgeDeployable: true,
    tags: ["SPC", "Shewhart", "CUSUM", "EWMA", "Western Electric"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 1, "min_data_length": 25},
    order: 0,
  },
  {
    id: 'pso_optimizer',
    label: '粒子群优化PSO',
    icon: '🐝',
    description: '自适应惯性权重PSO，多目标优化，约束处理，参数寻优',
    subcategory: '群智能',
    algorithmCategory: 'optimization', category: 'optimization',
    implType: 'builtin',
    implRef: 'server/algorithms/optimization/PSOOptimizer',
    inputFields: [{"name": "objectiveFunction", "label": "目标函数表达式", "type": "string", "description": "目标函数表达式", "required": true}, {"name": "bounds", "label": "Bounds", "type": "object", "description": "参数边界[{min,max}]", "required": true}],
    outputFields: [{"name": "bestPosition", "label": "最优参数", "type": "object", "description": "最优参数"}, {"name": "bestFitness", "label": "最优适应度", "type": "number", "description": "最优适应度"}, {"name": "convergenceHistory", "label": "收敛曲线", "type": "object", "description": "收敛曲线"}],
    configFields: [{"name": "swarmSize", "label": "粒子数", "type": "number", "default": 50, "description": "粒子数"}, {"name": "maxIterations", "label": "最大迭代次数", "type": "number", "default": 200, "description": "最大迭代次数"}, {"name": "w", "label": "惯性权重", "type": "number", "default": 0.7, "description": "惯性权重"}, {"name": "c1", "label": "个体学习因子", "type": "number", "default": 1.5, "description": "个体学习因子"}, {"name": "c2", "label": "社会学习因子", "type": "number", "default": 1.5, "description": "社会学习因子"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["参数优化", "阈值优化", "调度优化"],
    complexity: 'O(n^2)',
    edgeDeployable: true,
    tags: ["PSO", "粒子群", "优化", "群智能"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
  {
    id: 'genetic_algorithm',
    label: '遗传算法GA',
    icon: '🧬',
    description: '实数编码遗传算法，SBX交叉，多项式变异，精英保留策略',
    subcategory: '进化计算',
    algorithmCategory: 'optimization', category: 'optimization',
    implType: 'builtin',
    implRef: 'server/algorithms/optimization/GeneticAlgorithm',
    inputFields: [{"name": "objectiveFunction", "label": "目标函数表达式", "type": "string", "description": "目标函数表达式", "required": true}, {"name": "bounds", "label": "参数边界", "type": "object", "description": "参数边界", "required": true}],
    outputFields: [{"name": "bestIndividual", "label": "最优个体", "type": "object", "description": "最优个体"}, {"name": "bestFitness", "label": "最优适应度", "type": "number", "description": "最优适应度"}, {"name": "convergenceHistory", "label": "收敛曲线", "type": "object", "description": "收敛曲线"}],
    configFields: [{"name": "populationSize", "label": "种群大小", "type": "number", "default": 100, "description": "种群大小"}, {"name": "maxGenerations", "label": "最大代数", "type": "number", "default": 200, "description": "最大代数"}, {"name": "crossoverRate", "label": "交叉概率", "type": "number", "default": 0.9, "description": "交叉概率"}, {"name": "mutationRate", "label": "变异概率", "type": "number", "default": 0.1, "description": "变异概率"}, {"name": "eliteRatio", "label": "精英比例", "type": "number", "default": 0.05, "description": "精英比例"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["参数优化", "组合优化", "调度优化"],
    complexity: 'O(n^2)',
    edgeDeployable: true,
    tags: ["遗传算法", "GA", "进化", "SBX"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
  {
    id: 'bayesian_optimization',
    label: '贝叶斯优化',
    icon: '📊',
    description: '高斯过程代理模型，EI/UCB/PI采集函数，高效全局优化',
    subcategory: '代理模型',
    algorithmCategory: 'optimization', category: 'optimization',
    implType: 'builtin',
    implRef: 'server/algorithms/optimization/BayesianOptimization',
    inputFields: [{"name": "objectiveFunction", "label": "目标函数", "type": "string", "description": "目标函数", "required": true}, {"name": "bounds", "label": "参数边界", "type": "object", "description": "参数边界", "required": true}],
    outputFields: [{"name": "bestParams", "label": "最优参数", "type": "object", "description": "最优参数"}, {"name": "bestValue", "label": "最优值", "type": "number", "description": "最优值"}, {"name": "evaluationHistory", "label": "评估历史", "type": "object", "description": "评估历史"}],
    configFields: [{"name": "maxEvaluations", "label": "最大评估次数", "type": "number", "default": 50, "description": "最大评估次数"}, {"name": "acquisitionFunction", "label": "Acquisitionfunction", "type": "select", "default": "ei", "options": [{"value": "ei", "label": "ei"}, {"value": "ucb", "label": "ucb"}, {"value": "pi", "label": "pi"}], "description": "采集函数"}, {"name": "initialPoints", "label": "初始采样点数", "type": "number", "default": 10, "description": "初始采样点数"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["超参数优化", "昂贵函数优化", "自动调参"],
    complexity: 'O(n^3)',
    edgeDeployable: false,
    tags: ["贝叶斯", "高斯过程", "EI", "UCB", "全局优化"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
  {
    id: 'simulated_annealing',
    label: '模拟退火SA',
    icon: '🌡️',
    description: 'Metropolis准则模拟退火，自适应温度调度，全局搜索',
    subcategory: '物理启发',
    algorithmCategory: 'optimization', category: 'optimization',
    implType: 'builtin',
    implRef: 'server/algorithms/optimization/SimulatedAnnealing',
    inputFields: [{"name": "objectiveFunction", "label": "目标函数", "type": "string", "description": "目标函数", "required": true}, {"name": "bounds", "label": "参数边界", "type": "object", "description": "参数边界", "required": true}],
    outputFields: [{"name": "bestSolution", "label": "最优解", "type": "object", "description": "最优解"}, {"name": "bestEnergy", "label": "最优能量", "type": "number", "description": "最优能量"}, {"name": "temperatureHistory", "label": "温度曲线", "type": "object", "description": "温度曲线"}],
    configFields: [{"name": "initialTemp", "label": "初始温度", "type": "number", "default": 1000, "description": "初始温度"}, {"name": "coolingRate", "label": "冷却速率", "type": "number", "default": 0.995, "description": "冷却速率"}, {"name": "maxIterations", "label": "最大迭代次数", "type": "number", "default": 10000, "description": "最大迭代次数"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["全局优化", "组合优化", "参数搜索"],
    complexity: 'O(n)',
    edgeDeployable: true,
    tags: ["模拟退火", "SA", "Metropolis", "全局搜索"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
  {
    id: 'ds_evidence_fusion',
    label: 'DS证据理论融合',
    icon: '🔗',
    description: 'Dempster-Shafer证据理论，多源信息融合，冲突处理(Yager/Murphy)',
    subcategory: '信息融合',
    algorithmCategory: 'comprehensive', category: 'comprehensive',
    implType: 'builtin',
    implRef: 'server/algorithms/comprehensive/DSEvidenceFusion',
    inputFields: [{"name": "evidences", "label": "Evidences", "type": "object", "description": "证据列表[{hypothesis:probability}]", "required": true}],
    outputFields: [{"name": "fusedBelief", "label": "融合后信度", "type": "object", "description": "融合后信度"}, {"name": "plausibility", "label": "似然度", "type": "object", "description": "似然度"}, {"name": "diagnosis", "label": "融合诊断结论", "type": "object", "description": "融合诊断结论"}],
    configFields: [{"name": "conflictHandler", "label": "Conflicthandler", "type": "select", "default": "yager", "options": [{"value": "classic", "label": "classic"}, {"value": "yager", "label": "yager"}, {"value": "murphy", "label": "murphy"}], "description": "冲突处理方法"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["多源融合", "综合诊断", "决策支持"],
    complexity: 'O(n^2)',
    edgeDeployable: true,
    tags: ["DS", "证据理论", "融合", "Dempster-Shafer"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
  {
    id: 'association_mining',
    label: '关联规则挖掘',
    icon: '🔍',
    description: 'Apriori/FP-Growth关联规则挖掘，故障模式关联发现',
    subcategory: '数据挖掘',
    algorithmCategory: 'comprehensive', category: 'comprehensive',
    implType: 'builtin',
    implRef: 'server/algorithms/comprehensive/AssociationMining',
    inputFields: [{"name": "transactions", "label": "事务数据", "type": "object", "description": "事务数据", "required": true}],
    outputFields: [{"name": "rules", "label": "关联规则", "type": "object", "description": "关联规则"}, {"name": "frequentItemsets", "label": "频繁项集", "type": "object", "description": "频繁项集"}],
    configFields: [{"name": "minSupport", "label": "最小支持度", "type": "number", "default": 0.1, "description": "最小支持度"}, {"name": "minConfidence", "label": "最小置信度", "type": "number", "default": 0.6, "description": "最小置信度"}, {"name": "method", "label": "Method", "type": "select", "default": "apriori", "options": [{"value": "apriori", "label": "apriori"}, {"value": "fpgrowth", "label": "fpgrowth"}], "description": "算法"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["故障关联", "报警关联", "维修模式"],
    complexity: 'O(n^2)',
    edgeDeployable: true,
    tags: ["关联规则", "Apriori", "FP-Growth", "数据挖掘"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
  {
    id: 'causal_inference',
    label: '因果推理',
    icon: '🔀',
    description: 'PC算法因果图发现 + Granger因果检验，故障传播路径分析',
    subcategory: '因果分析',
    algorithmCategory: 'comprehensive', category: 'comprehensive',
    implType: 'builtin',
    implRef: 'server/algorithms/comprehensive/CausalInference',
    inputFields: [{"name": "data", "label": "多变量时序数据", "type": "object", "description": "多变量时序数据", "required": true}],
    outputFields: [{"name": "causalGraph", "label": "因果图(邻接矩阵)", "type": "object", "description": "因果图(邻接矩阵)"}, {"name": "grangerResults", "label": "Granger检验结果", "type": "object", "description": "Granger检验结果"}, {"name": "diagnosis", "label": "因果分析结论", "type": "object", "description": "因果分析结论"}],
    configFields: [{"name": "method", "label": "Method", "type": "select", "default": "granger", "options": [{"value": "granger", "label": "granger"}, {"value": "pc", "label": "pc"}], "description": "因果检验方法"}, {"name": "maxLag", "label": "最大滞后阶数", "type": "number", "default": 10, "description": "最大滞后阶数"}, {"name": "significanceLevel", "label": "显著性水平", "type": "number", "default": 0.05, "description": "显著性水平"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["因果分析", "故障传播", "根因定位"],
    complexity: 'O(n^2)',
    edgeDeployable: false,
    tags: ["因果推理", "Granger", "PC算法", "因果图"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_data_length": 100},
    order: 0,
  },
  {
    id: 'condition_normalization',
    label: '工况归一化',
    icon: '⚖️',
    description: '多工况参数归一化，回归模型残差分析，消除工况影响',
    subcategory: '数据预处理',
    algorithmCategory: 'comprehensive', category: 'comprehensive',
    implType: 'builtin',
    implRef: 'server/algorithms/comprehensive/ConditionNormalization',
    inputFields: [{"name": "targetVariable", "label": "目标变量", "type": "object", "description": "目标变量", "required": true}, {"name": "conditionVariables", "label": "工况变量", "type": "object", "description": "工况变量", "required": true}],
    outputFields: [{"name": "normalized", "label": "归一化后数据", "type": "object", "description": "归一化后数据"}, {"name": "residuals", "label": "残差", "type": "object", "description": "残差"}, {"name": "regressionModel", "label": "回归模型参数", "type": "object", "description": "回归模型参数"}],
    configFields: [{"name": "method", "label": "Method", "type": "select", "default": "linear", "options": [{"value": "linear", "label": "linear"}, {"value": "polynomial", "label": "polynomial"}, {"value": "binning", "label": "binning"}], "description": "归一化方法"}, {"name": "polynomialDegree", "label": "多项式阶数", "type": "number", "default": 2, "description": "多项式阶数"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["工况归一化", "数据预处理", "基线校正"],
    complexity: 'O(n)',
    edgeDeployable: true,
    tags: ["工况归一化", "回归", "残差", "基线"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_data_length": 50},
    order: 0,
  },
  {
    id: 'time_domain_features',
    label: '时域特征提取',
    icon: '⏱️',
    description: '统计特征(均值/RMS/峰值/峭度/偏度/波形因子/脉冲因子) + AR系数',
    subcategory: '时域',
    algorithmCategory: 'feature_extraction', category: 'feature_extraction',
    implType: 'builtin',
    implRef: 'server/algorithms/feature-extraction/TimeDomainFeatures',
    inputFields: [{"name": "signal", "label": "时域信号", "type": "object", "description": "时域信号", "required": true}],
    outputFields: [{"name": "features", "label": "时域特征集", "type": "object", "description": "时域特征集"}],
    configFields: [{"name": "arOrder", "label": "AR模型阶数", "type": "number", "default": 10, "description": "AR模型阶数"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["特征提取", "状态监测", "故障分类"],
    complexity: 'O(n)',
    edgeDeployable: true,
    tags: ["时域", "统计特征", "RMS", "峭度", "AR"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_data_length": 64},
    order: 0,
  },
  {
    id: 'freq_domain_features',
    label: '频域特征提取',
    icon: '📡',
    description: '频谱特征(重心频率/均方频率/频率方差) + 频带能量比',
    subcategory: '频域',
    algorithmCategory: 'feature_extraction', category: 'feature_extraction',
    implType: 'builtin',
    implRef: 'server/algorithms/feature-extraction/FreqDomainFeatures',
    inputFields: [{"name": "signal", "label": "时域信号", "type": "object", "description": "时域信号", "required": true}, {"name": "sampleRate", "label": "采样率(Hz)", "type": "number", "description": "采样率(Hz)", "required": true}],
    outputFields: [{"name": "features", "label": "频域特征集", "type": "object", "description": "频域特征集"}],
    configFields: [{"name": "bands", "label": "Bands", "type": "json", "default": [], "description": "自定义频带[{low,high}]"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["vibration_acceleration", "vibration_velocity", "current"],
    applicableScenarios: ["特征提取", "频谱分析", "故障分类"],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    tags: ["频域", "重心频率", "频带能量", "频谱特征"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 100, "min_data_length": 256},
    order: 0,
  },
  {
    id: 'timefreq_features',
    label: '时频域特征提取',
    icon: '🌈',
    description: 'STFT时频图 + 小波系数特征 + 瞬时频率/幅值',
    subcategory: '时频域',
    algorithmCategory: 'feature_extraction', category: 'feature_extraction',
    implType: 'builtin',
    implRef: 'server/algorithms/feature-extraction/TimeFreqFeatures',
    inputFields: [{"name": "signal", "label": "时域信号", "type": "object", "description": "时域信号", "required": true}, {"name": "sampleRate", "label": "采样率(Hz)", "type": "number", "description": "采样率(Hz)", "required": true}],
    outputFields: [{"name": "features", "label": "时频域特征集", "type": "object", "description": "时频域特征集"}, {"name": "spectrogram", "label": "时频图数据", "type": "object", "description": "时频图数据"}],
    configFields: [{"name": "windowSize", "label": "STFT窗口大小", "type": "number", "default": 256, "description": "STFT窗口大小"}, {"name": "hopSize", "label": "STFT步进", "type": "number", "default": 64, "description": "STFT步进"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["vibration_acceleration", "acoustic"],
    applicableScenarios: ["时频分析", "非平稳信号", "特征提取"],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    tags: ["STFT", "时频", "小波", "瞬时频率"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_sample_rate_hz": 100, "min_data_length": 512},
    order: 0,
  },
  {
    id: 'statistical_features',
    label: '统计特征提取',
    icon: '📈',
    description: '高阶统计量(偏度/峭度/矩) + 信息熵(Shannon/Rényi) + 分形维数',
    subcategory: '统计',
    algorithmCategory: 'feature_extraction', category: 'feature_extraction',
    implType: 'builtin',
    implRef: 'server/algorithms/feature-extraction/StatisticalFeatures',
    inputFields: [{"name": "signal", "label": "信号数据", "type": "object", "description": "信号数据", "required": true}],
    outputFields: [{"name": "features", "label": "统计特征集", "type": "object", "description": "统计特征集"}],
    configFields: [{"name": "entropyBins", "label": "熵计算分箱数", "type": "number", "default": 50, "description": "熵计算分箱数"}, {"name": "fractalMethod", "label": "Fractalmethod", "type": "select", "default": "higuchi", "options": [{"value": "higuchi", "label": "higuchi"}, {"value": "katz", "label": "katz"}, {"value": "petrosian", "label": "petrosian"}], "description": "分形维数方法"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["特征提取", "复杂度分析", "状态评估"],
    complexity: 'O(n)',
    edgeDeployable: true,
    tags: ["统计", "熵", "分形", "高阶统计量"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_data_length": 100},
    order: 0,
  },
  {
    id: 'deep_features',
    label: '深度特征提取',
    icon: '🧠',
    description: '自编码器/1D-CNN深度特征 + PCA/t-SNE降维可视化',
    subcategory: '深度学习',
    algorithmCategory: 'feature_extraction', category: 'feature_extraction',
    implType: 'builtin',
    implRef: 'server/algorithms/feature-extraction/DeepFeatures',
    inputFields: [{"name": "data", "label": "多维数据", "type": "number[][]", "description": "多维数据", "required": true}],
    outputFields: [{"name": "features", "label": "深度特征", "type": "number[][]", "description": "深度特征"}, {"name": "reducedFeatures", "label": "降维后特征", "type": "number[][]", "description": "降维后特征"}],
    configFields: [{"name": "method", "label": "Method", "type": "select", "default": "autoencoder", "options": [{"value": "autoencoder", "label": "autoencoder"}, {"value": "cnn1d", "label": "cnn1d"}], "description": "特征提取方法"}, {"name": "latentDim", "label": "隐空间维度", "type": "number", "default": 16, "description": "隐空间维度"}, {"name": "reductionMethod", "label": "Reductionmethod", "type": "select", "default": "pca", "options": [{"value": "pca", "label": "pca"}, {"value": "tsne", "label": "tsne"}], "description": "降维方法"}, {"name": "reducedDim", "label": "降维目标维度", "type": "number", "default": 2, "description": "降维目标维度"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["深度特征", "降维可视化", "表征学习"],
    complexity: 'O(n^2)',
    edgeDeployable: false,
    tags: ["深度特征", "自编码器", "PCA", "t-SNE"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_data_length": 100},
    order: 0,
  },
  {
    id: 'ts_pattern_expert',
    label: '时序模式专家',
    icon: '📊',
    description: '趋势/周期/突变识别 + CUSUM/PELT变点检测',
    subcategory: '模式识别',
    algorithmCategory: 'agent_plugin', category: 'agent_plugin',
    implType: 'builtin',
    implRef: 'server/algorithms/agent-plugins/TimeSeriesPatternExpert',
    inputFields: [{"name": "data", "label": "时序数据", "type": "object", "description": "时序数据", "required": true}],
    outputFields: [{"name": "trend", "label": "趋势分析", "type": "object", "description": "趋势分析"}, {"name": "changePoints", "label": "变点位置", "type": "object", "description": "变点位置"}, {"name": "periodicity", "label": "周期性", "type": "object", "description": "周期性"}],
    configFields: [{"name": "cusumThreshold", "label": "CUSUM阈值", "type": "number", "default": 5, "description": "CUSUM阈值"}, {"name": "minSegmentLength", "label": "最小段长", "type": "number", "default": 20, "description": "最小段长"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["趋势分析", "变点检测", "模式识别"],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    tags: ["时序", "CUSUM", "变点", "趋势", "Agent"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_data_length": 50},
    order: 0,
  },
  {
    id: 'case_retrieval_expert',
    label: '案例检索专家',
    icon: '🔎',
    description: '余弦/DTW相似度检索，历史案例匹配，经验复用',
    subcategory: '案例推理',
    algorithmCategory: 'agent_plugin', category: 'agent_plugin',
    implType: 'builtin',
    implRef: 'server/algorithms/agent-plugins/CaseRetrievalExpert',
    inputFields: [{"name": "data", "label": "查询特征向量", "type": "object", "description": "查询特征向量", "required": true}, {"name": "context.caseLibrary", "label": "案例库", "type": "object", "description": "案例库", "required": true}],
    outputFields: [{"name": "matches", "label": "匹配结果", "type": "object", "description": "匹配结果"}],
    configFields: [{"name": "similarityMethod", "label": "Similaritymethod", "type": "select", "default": "cosine", "options": [{"value": "cosine", "label": "cosine"}, {"value": "dtw", "label": "dtw"}, {"value": "euclidean", "label": "euclidean"}], "description": "相似度方法"}, {"name": "topK", "label": "返回Top-K", "type": "number", "default": 5, "description": "返回Top-K"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["故障诊断", "维修建议", "经验复用"],
    complexity: 'O(n)',
    edgeDeployable: true,
    tags: ["案例检索", "CBR", "DTW", "Agent"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
  {
    id: 'physical_constraint_expert',
    label: '物理约束专家',
    icon: '⚖️',
    description: '物理模型验证、范围/变化率/平衡约束检查',
    subcategory: '物理验证',
    algorithmCategory: 'agent_plugin', category: 'agent_plugin',
    implType: 'builtin',
    implRef: 'server/algorithms/agent-plugins/PhysicalConstraintExpert',
    inputFields: [{"name": "data", "label": "多变量数据", "type": "object", "description": "多变量数据", "required": true}],
    outputFields: [{"name": "violations", "label": "违反约束列表", "type": "object", "description": "违反约束列表"}],
    configFields: [{"name": "constraints", "label": "自定义约束列表", "type": "json", "default": [], "description": "自定义约束列表"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["数据验证", "传感器校验", "物理一致性"],
    complexity: 'O(n)',
    edgeDeployable: true,
    tags: ["物理约束", "一致性", "Agent"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
  {
    id: 'spatial_anomaly_expert',
    label: '空间异常专家',
    icon: '🗺️',
    description: '多传感器空间关联分析、孤立/传播异常识别',
    subcategory: '空间分析',
    algorithmCategory: 'agent_plugin', category: 'agent_plugin',
    implType: 'builtin',
    implRef: 'server/algorithms/agent-plugins/SpatialAnomalyExpert',
    inputFields: [{"name": "data", "label": "多传感器数据", "type": "object", "description": "多传感器数据", "required": true}],
    outputFields: [{"name": "anomalies", "label": "异常列表", "type": "object", "description": "异常列表"}, {"name": "correlationMatrix", "label": "相关性矩阵", "type": "object", "description": "相关性矩阵"}],
    configFields: [{"name": "correlationThreshold", "label": "相关性阈值", "type": "number", "default": 0.7, "description": "相关性阈值"}, {"name": "anomalyThreshold", "label": "异常Z-score阈值", "type": "number", "default": 3, "description": "异常Z-score阈值"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["传感器故障检测", "异常传播分析"],
    complexity: 'O(n^2)',
    edgeDeployable: true,
    tags: ["空间异常", "多传感器", "Agent"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
  {
    id: 'fusion_diagnosis_expert',
    label: '融合诊断专家',
    icon: '🔗',
    description: '多算法投票/加权/DS融合，综合置信度评估',
    subcategory: '融合诊断',
    algorithmCategory: 'agent_plugin', category: 'agent_plugin',
    implType: 'builtin',
    implRef: 'server/algorithms/agent-plugins/FusionDiagnosisExpert',
    inputFields: [{"name": "context.diagnosticResults", "label": "多个算法诊断结果", "type": "object", "description": "多个算法诊断结果", "required": true}],
    outputFields: [{"name": "fusedDiagnosis", "label": "融合诊断结论", "type": "string", "description": "融合诊断结论"}, {"name": "fusedConfidence", "label": "融合置信度", "type": "number", "description": "融合置信度"}],
    configFields: [{"name": "fusionMethod", "label": "Fusionmethod", "type": "select", "default": "weighted", "options": [{"value": "voting", "label": "voting"}, {"value": "weighted", "label": "weighted"}, {"value": "ds", "label": "ds"}], "description": "融合方法"}, {"name": "weights", "label": "各算法权重", "type": "json", "default": [], "description": "各算法权重"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["综合诊断", "决策支持"],
    complexity: 'O(n)',
    edgeDeployable: true,
    tags: ["融合", "集成", "多算法", "Agent"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
  {
    id: 'prediction_expert',
    label: '预测专家',
    icon: '🔮',
    description: 'Holt指数平滑趋势外推、RUL剩余寿命预测',
    subcategory: '预测',
    algorithmCategory: 'agent_plugin', category: 'agent_plugin',
    implType: 'builtin',
    implRef: 'server/algorithms/agent-plugins/PredictionExpert',
    inputFields: [{"name": "data", "label": "历史时序数据", "type": "object", "description": "历史时序数据", "required": true}],
    outputFields: [{"name": "forecast", "label": "预测值", "type": "object", "description": "预测值"}, {"name": "rul", "label": "剩余寿命", "type": "number", "description": "剩余寿命"}],
    configFields: [{"name": "forecastHorizon", "label": "预测步数", "type": "number", "default": 30, "description": "预测步数"}, {"name": "alpha", "label": "平滑系数", "type": "number", "default": 0.3, "description": "平滑系数"}, {"name": "failureThreshold", "label": "故障阈值(0=不预测RUL)", "type": "number", "default": 0, "description": "故障阈值(0=不预测RUL)"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["趋势预测", "寿命预测", "预测性维护"],
    complexity: 'O(n)',
    edgeDeployable: true,
    tags: ["预测", "RUL", "指数平滑", "Agent"],
    version: 'v1.0.0',
    license: 'builtin',
    recommendedDataProfile: {"min_data_length": 20},
    order: 0,
  },
  {
    id: 'lora_finetuning',
    label: 'LoRA微调',
    icon: '🎯',
    description: 'LoRA低秩自适应微调，参数高效训练，适用于大模型领域适配',
    subcategory: '微调',
    algorithmCategory: 'model_iteration', category: 'model_iteration',
    implType: 'builtin',
    implRef: 'server/algorithms/model-iteration/LoRAFineTuning',
    inputFields: [{"name": "context.trainingData", "label": "训练数据", "type": "object", "description": "训练数据{features,labels}", "required": true}],
    outputFields: [{"name": "accuracy", "label": "准确率", "type": "number", "description": "准确率"}, {"name": "paramReduction", "label": "参数减少比例", "type": "number", "description": "参数减少比例"}],
    configFields: [{"name": "rank", "label": "LoRA秩", "type": "number", "default": 8, "description": "LoRA秩"}, {"name": "alpha", "label": "缩放因子", "type": "number", "default": 16, "description": "缩放因子"}, {"name": "epochs", "label": "训练轮数", "type": "number", "default": 10, "description": "训练轮数"}, {"name": "targetModules", "label": "目标模块", "type": "json", "default": ["query", "value"], "description": "目标模块"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["模型微调", "领域适配", "小样本学习"],
    complexity: 'O(n^2)',
    edgeDeployable: false,
    tags: ["LoRA", "微调", "参数高效", "大模型"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
  {
    id: 'full_retraining',
    label: '全量重训练',
    icon: '🔄',
    description: '完整模型训练流程，支持MLP/CNN1D/LSTM，早停和数据版本管理',
    subcategory: '训练',
    algorithmCategory: 'model_iteration', category: 'model_iteration',
    implType: 'builtin',
    implRef: 'server/algorithms/model-iteration/FullRetraining',
    inputFields: [{"name": "context.trainingData", "label": "训练数据", "type": "object", "description": "训练数据", "required": true}],
    outputFields: [{"name": "accuracy", "label": "准确率", "type": "number", "description": "准确率"}, {"name": "lossHistory", "label": "损失曲线", "type": "object", "description": "损失曲线"}],
    configFields: [{"name": "modelType", "label": "Modeltype", "type": "select", "default": "mlp", "options": [{"value": "mlp", "label": "mlp"}, {"value": "cnn1d", "label": "cnn1d"}, {"value": "lstm", "label": "lstm"}], "description": "模型类型"}, {"name": "hiddenLayers", "label": "隐藏层结构", "type": "json", "default": [64, 32], "description": "隐藏层结构"}, {"name": "epochs", "label": "最大轮数", "type": "number", "default": 50, "description": "最大轮数"}, {"name": "earlyStoppingPatience", "label": "早停耐心值", "type": "number", "default": 5, "description": "早停耐心值"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["模型更新", "基线训练", "数据积累重训"],
    complexity: 'O(n^2)',
    edgeDeployable: false,
    tags: ["重训练", "深度学习", "MLP", "CNN", "LSTM"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
  {
    id: 'incremental_learning',
    label: '增量学习',
    icon: '📈',
    description: '在线更新模型，EWC/LwF防止灾难性遗忘，持续学习',
    subcategory: '增量',
    algorithmCategory: 'model_iteration', category: 'model_iteration',
    implType: 'builtin',
    implRef: 'server/algorithms/model-iteration/IncrementalLearning',
    inputFields: [{"name": "context.newData", "label": "新增数据", "type": "object", "description": "新增数据", "required": true}],
    outputFields: [{"name": "newTaskAccuracy", "label": "新任务准确率", "type": "number", "description": "新任务准确率"}, {"name": "oldTaskRetention", "label": "旧知识保持率", "type": "number", "description": "旧知识保持率"}, {"name": "forgettingRate", "label": "遗忘率", "type": "number", "description": "遗忘率"}],
    configFields: [{"name": "method", "label": "Method", "type": "select", "default": "ewc", "options": [{"value": "ewc", "label": "ewc"}, {"value": "lwf", "label": "lwf"}, {"value": "replay", "label": "replay"}], "description": "增量方法"}, {"name": "ewcLambda", "label": "EWC正则化强度", "type": "number", "default": 1000, "description": "EWC正则化强度"}, {"name": "epochs", "label": "增量训练轮数", "type": "number", "default": 5, "description": "增量训练轮数"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["持续学习", "新工况适应", "数据流学习"],
    complexity: 'O(n)',
    edgeDeployable: true,
    tags: ["增量学习", "EWC", "LwF", "持续学习"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
  {
    id: 'model_distillation',
    label: '模型蒸馏',
    icon: '🧪',
    description: '知识蒸馏(教师-学生)，模型压缩，保持性能的同时减小模型',
    subcategory: '压缩',
    algorithmCategory: 'model_iteration', category: 'model_iteration',
    implType: 'builtin',
    implRef: 'server/algorithms/model-iteration/ModelDistillation',
    inputFields: [{"name": "context.trainingData", "label": "训练数据", "type": "object", "description": "训练数据", "required": true}],
    outputFields: [{"name": "compressionRatio", "label": "压缩比", "type": "number", "description": "压缩比"}, {"name": "performanceRetention", "label": "性能保持率", "type": "number", "description": "性能保持率"}, {"name": "estimatedSpeedup", "label": "推理加速比", "type": "number", "description": "推理加速比"}],
    configFields: [{"name": "temperature", "label": "蒸馏温度", "type": "number", "default": 4, "description": "蒸馏温度"}, {"name": "alpha", "label": "蒸馏损失权重", "type": "number", "default": 0.7, "description": "蒸馏损失权重"}, {"name": "studentLayers", "label": "学生模型结构", "type": "json", "default": [32, 16], "description": "学生模型结构"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["模型压缩", "边缘部署", "推理加速"],
    complexity: 'O(n^2)',
    edgeDeployable: true,
    tags: ["蒸馏", "模型压缩", "知识迁移", "边缘部署"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
  {
    id: 'llm_analysis',
    label: 'LLM分析',
    icon: '🤖',
    description: '大模型辅助规则生成，自然语言解析故障描述，生成诊断规则',
    subcategory: 'LLM',
    algorithmCategory: 'rule_learning', category: 'rule_learning',
    implType: 'builtin',
    implRef: 'server/algorithms/rule-learning/LLMAnalysis',
    inputFields: [{"name": "context.description", "label": "故障描述", "type": "string", "description": "故障描述", "required": false}, {"name": "context.features", "label": "特征数据", "type": "object", "description": "特征数据", "required": false}],
    outputFields: [{"name": "suggestedRules", "label": "建议规则", "type": "object", "description": "建议规则"}],
    configFields: [{"name": "model", "label": "Model", "type": "select", "default": "gpt-4", "options": [{"value": "gpt-4", "label": "gpt-4"}, {"value": "gpt-3.5", "label": "gpt-3.5"}, {"value": "local", "label": "local"}], "description": "LLM模型"}, {"name": "temperature", "label": "生成温度", "type": "number", "default": 0.3, "description": "生成温度"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["规则生成", "故障分析", "知识提取"],
    complexity: 'O(n)',
    edgeDeployable: false,
    tags: ["LLM", "大模型", "规则生成", "自然语言"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
  {
    id: 'association_rule_learning',
    label: '关联规则学习',
    icon: '🔗',
    description: 'Apriori从历史事务数据中自动发现关联规则，置信度评估',
    subcategory: '关联规则',
    algorithmCategory: 'rule_learning', category: 'rule_learning',
    implType: 'builtin',
    implRef: 'server/algorithms/rule-learning/AssociationRuleLearning',
    inputFields: [{"name": "context.transactions", "label": "事务数据", "type": "object", "description": "事务数据", "required": true}],
    outputFields: [{"name": "rules", "label": "关联规则", "type": "object", "description": "关联规则"}, {"name": "frequentItemsets", "label": "频繁项集", "type": "object", "description": "频繁项集"}],
    configFields: [{"name": "minSupport", "label": "最小支持度", "type": "number", "default": 0.1, "description": "最小支持度"}, {"name": "minConfidence", "label": "最小置信度", "type": "number", "default": 0.6, "description": "最小置信度"}, {"name": "minLift", "label": "最小提升度", "type": "number", "default": 1.2, "description": "最小提升度"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["故障关联", "报警关联", "维修模式"],
    complexity: 'O(n^2)',
    edgeDeployable: true,
    tags: ["关联规则", "Apriori", "数据挖掘"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
  {
    id: 'decision_tree_induction',
    label: '决策树归纳',
    icon: '🌳',
    description: 'CART/C4.5决策树，自动构建分类树并提取IF-THEN规则',
    subcategory: '决策树',
    algorithmCategory: 'rule_learning', category: 'rule_learning',
    implType: 'builtin',
    implRef: 'server/algorithms/rule-learning/DecisionTreeInduction',
    inputFields: [{"name": "context.trainingData", "label": "训练数据", "type": "object", "description": "训练数据{features,labels,featureNames}", "required": true}],
    outputFields: [{"name": "rules", "label": "提取的规则", "type": "object", "description": "提取的规则"}, {"name": "featureImportance", "label": "特征重要性", "type": "object", "description": "特征重要性"}],
    configFields: [{"name": "method", "label": "Method", "type": "select", "default": "cart", "options": [{"value": "cart", "label": "cart"}, {"value": "c45", "label": "c45"}], "description": "算法"}, {"name": "maxDepth", "label": "最大深度", "type": "number", "default": 8, "description": "最大深度"}, {"name": "minSamplesLeaf", "label": "叶节点最小样本数", "type": "number", "default": 5, "description": "叶节点最小样本数"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["故障分类", "规则归纳", "可解释诊断"],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    tags: ["决策树", "CART", "C4.5", "规则提取"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
  {
    id: 'frequent_pattern_mining',
    label: '频繁模式挖掘',
    icon: '🔍',
    description: 'PrefixSpan序列模式挖掘，发现时序关联规则和频繁事件序列',
    subcategory: '序列挖掘',
    algorithmCategory: 'rule_learning', category: 'rule_learning',
    implType: 'builtin',
    implRef: 'server/algorithms/rule-learning/FrequentPatternMining',
    inputFields: [{"name": "context.sequences", "label": "事件序列数据", "type": "object", "description": "事件序列数据", "required": true}],
    outputFields: [{"name": "patterns", "label": "频繁模式", "type": "object", "description": "频繁模式"}, {"name": "temporalRules", "label": "时序关联规则", "type": "object", "description": "时序关联规则"}],
    configFields: [{"name": "minSupport", "label": "最小支持度", "type": "number", "default": 0.1, "description": "最小支持度"}, {"name": "maxPatternLength", "label": "最大模式长度", "type": "number", "default": 6, "description": "最大模式长度"}, {"name": "gapConstraint", "label": "最大时间间隔", "type": "number", "default": 5, "description": "最大时间间隔"}],
    applicableDeviceTypes: ["*"],
    applicableMeasurementTypes: ["*"],
    applicableScenarios: ["报警序列分析", "故障演化", "维修模式"],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    tags: ["频繁模式", "PrefixSpan", "序列挖掘"],
    version: 'v1.0.0',
    license: 'builtin',
    order: 0,
  },
];
class AlgorithmRegistry extends BaseRegistry<AlgorithmRegistryItem> {
  constructor() {
    super('algorithm');
    this.registerCategories(ALGORITHM_CATEGORIES);
    this.registerAll(BUILTIN_ALGORITHMS);
  }

  /** 按实现类型筛选 */
  getByImplType(implType: AlgorithmRegistryItem['implType']): AlgorithmRegistryItem[] {
    return this.listItems().filter(item => item.implType === implType);
  }

  /** 按设备类型推荐算法 */
  recommendForDevice(deviceType: string): AlgorithmRegistryItem[] {
    return this.listItems().filter(item =>
      item.applicableDeviceTypes.includes(deviceType) ||
      item.applicableDeviceTypes.includes('*')
    );
  }

  /** 按测量指标推荐算法 */
  recommendForMeasurement(measurementType: string): AlgorithmRegistryItem[] {
    return this.listItems().filter(item =>
      item.applicableMeasurementTypes.includes(measurementType) ||
      item.applicableMeasurementTypes.includes('*')
    );
  }

  /** 按场景推荐算法 */
  recommendForScenario(scenario: string): AlgorithmRegistryItem[] {
    return this.listItems().filter(item =>
      item.applicableScenarios.includes(scenario) ||
      item.applicableScenarios.includes('*')
    );
  }

  /** 综合推荐（设备类型 + 测量指标 + 场景 交集打分） */
  smartRecommend(params: {
    deviceType?: string;
    measurementTypes?: string[];
    scenario?: string;
    sampleRateHz?: number;
    dataLength?: number;
  }): Array<AlgorithmRegistryItem & { score: number; reasons: string[] }> {
    const results: Array<AlgorithmRegistryItem & { score: number; reasons: string[] }> = [];

    for (const algo of this.listItems()) {
      let score = 0;
      const reasons: string[] = [];

      // 设备类型匹配
      if (params.deviceType && algo.applicableDeviceTypes.includes(params.deviceType)) {
        score += 30;
        reasons.push(`适用于 ${params.deviceType} 设备`);
      }

      // 测量指标匹配
      if (params.measurementTypes) {
        const matchCount = params.measurementTypes.filter(m => algo.applicableMeasurementTypes.includes(m)).length;
        if (matchCount > 0) {
          score += matchCount * 20;
          reasons.push(`匹配 ${matchCount} 个测量指标`);
        }
      }

      // 场景匹配
      if (params.scenario && algo.applicableScenarios.includes(params.scenario)) {
        score += 25;
        reasons.push(`适用于 ${params.scenario} 场景`);
      }

      // 数据特征匹配
      if (algo.recommendedDataProfile) {
        const profile = algo.recommendedDataProfile;
        if (params.sampleRateHz && profile.min_sample_rate_hz && params.sampleRateHz >= profile.min_sample_rate_hz) {
          score += 10;
          reasons.push(`采样率满足要求 (≥${profile.min_sample_rate_hz}Hz)`);
        }
        if (params.dataLength && profile.min_data_length && params.dataLength >= profile.min_data_length) {
          score += 10;
          reasons.push(`数据长度满足要求 (≥${profile.min_data_length})`);
        }
      }

      // 边缘部署加分
      if (algo.edgeDeployable) {
        score += 5;
      }

      if (score > 0) {
        results.push({ ...algo, score, reasons });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /** 获取支持 KG 集成的算法 */
  getKGIntegratedAlgorithms(): AlgorithmRegistryItem[] {
    return this.listItems().filter(item => item.kgIntegration?.writes_to_kg || item.kgIntegration?.reads_from_kg);
  }

  /** 获取可边缘部署的算法 */
  getEdgeDeployable(): AlgorithmRegistryItem[] {
    return this.listItems().filter(item => item.edgeDeployable);
  }
}

export const algorithmRegistry = new AlgorithmRegistry();
