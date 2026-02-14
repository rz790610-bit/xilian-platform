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
 *           ├── 信号处理 (8)
 *           ├── 特征工程 (5) → 桥接 Pipeline Engine
 *           ├── 机器学习 (5) → 桥接 Pipeline Engine
 *           ├── 深度学习 (3) → 桥接 Pipeline Engine
 *           ├── 异常检测 (4) → 桥接 Pipeline Engine
 *           ├── 预测性维护 (3) → 新建 builtin
 *           ├── 统计分析 (3) → 新建 builtin
 *           └── 优化算法 (2) → 新建 builtin
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
  algorithmCategory: 'signal_processing' | 'feature_engineering' | 'machine_learning' | 'deep_learning' | 'anomaly_detection' | 'predictive' | 'statistics' | 'optimization' | 'custom';
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

// ============ 算法分类 ============
const ALGORITHM_CATEGORIES: CategoryMeta[] = [
  { id: 'signal_processing', label: '信号处理', icon: '📡', order: 1, description: 'FFT、小波变换、滤波、包络分析等时频域处理', color: '#3B82F6' },
  { id: 'feature_engineering', label: '特征工程', icon: '🔧', order: 2, description: '特征提取、归一化、降维、特征选择', color: '#10B981' },
  { id: 'machine_learning', label: '机器学习', icon: '🤖', order: 3, description: 'SVM、随机森林、XGBoost、聚类等传统ML算法', color: '#8B5CF6' },
  { id: 'deep_learning', label: '深度学习', icon: '🧠', order: 4, description: 'CNN、LSTM、Transformer、AutoEncoder 等深度模型', color: '#EF4444' },
  { id: 'anomaly_detection', label: '异常检测', icon: '🚨', order: 5, description: 'Z-Score、IQR、Isolation Forest、DBSCAN 等异常识别', color: '#F59E0B' },
  { id: 'predictive', label: '预测性维护', icon: '🔮', order: 6, description: 'RUL预测、退化趋势分析、寿命评估', color: '#06B6D4' },
  { id: 'statistics', label: '统计分析', icon: '📊', order: 7, description: '分布检验、假设检验、相关性分析、趋势分析', color: '#64748B' },
  { id: 'optimization', label: '优化算法', icon: '⚡', order: 8, description: '阈值优化、参数搜索、调度优化', color: '#EC4899' },
  { id: 'custom', label: '自定义算法', icon: '🛠️', order: 9, description: '用户自定义算法（Python/ONNX/HTTP）', color: '#A855F7' },
];

// ============ 内置算法定义（31 个） ============
const BUILTIN_ALGORITHMS: AlgorithmRegistryItem[] = [
  // ======== 信号处理 (8) — 新建 builtin ========
  {
    id: 'fft', label: '快速傅里叶变换 (FFT)', icon: '📡',
    description: '将时域信号转换为频域，识别主频率成分和谐波',
    category: 'signal_processing', algorithmCategory: 'signal_processing',
    subcategory: 'frequency_analysis',
    implType: 'builtin', implRef: 'builtin:fft',
    tags: ['fft', 'frequency', 'spectrum', 'vibration'],
    inputFields: [
      { name: 'signal', label: '输入信号', type: 'number[]', required: true, description: '一维时域信号数组' },
      { name: 'sample_rate', label: '采样率', type: 'number', required: true, unit: 'Hz' },
    ],
    outputFields: [
      { name: 'frequencies', label: '频率轴', type: 'number[]', unit: 'Hz' },
      { name: 'amplitudes', label: '幅值谱', type: 'number[]' },
      { name: 'phases', label: '相位谱', type: 'number[]', unit: 'rad' },
      { name: 'dominant_frequency', label: '主频率', type: 'number', unit: 'Hz' },
      { name: 'power_spectrum', label: '功率谱', type: 'number[]' },
    ],
    configFields: [
      { name: 'window', label: '窗函数', type: 'select', default: 'hanning', options: [
        { value: 'hanning', label: 'Hanning' }, { value: 'hamming', label: 'Hamming' },
        { value: 'blackman', label: 'Blackman' }, { value: 'rectangular', label: '矩形窗' },
        { value: 'kaiser', label: 'Kaiser' },
      ]},
      { name: 'nfft', label: 'FFT 点数', type: 'number', description: '留空则自动取2的幂次' },
      { name: 'normalize', label: '归一化', type: 'boolean', default: true },
      { name: 'one_sided', label: '单边谱', type: 'boolean', default: true },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'acoustic_sensor', 'motor', 'pump', 'compressor', 'turbine', 'gearbox', 'bearing'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'velocity', 'displacement', 'acoustic_emission', 'sound_pressure'],
    applicableScenarios: ['bearing_diagnosis', 'gear_diagnosis', 'motor_diagnosis', 'structural_health', 'rotating_machinery'],
    recommendedDataProfile: { min_sample_rate_hz: 100, min_data_length: 256, preferred_data_types: ['vibration', 'acceleration'] },
    complexity: 'O(n log n)',
    edgeDeployable: true,
    license: 'builtin',
    kgIntegration: { writes_to_kg: true, node_type: 'FrequencySpectrum', edge_type: 'has_spectrum' },
  },
  {
    id: 'stft', label: '短时傅里叶变换 (STFT)', icon: '📡',
    description: '时频联合分析，观察信号频率成分随时间的变化',
    category: 'signal_processing', algorithmCategory: 'signal_processing',
    subcategory: 'time_frequency',
    implType: 'builtin', implRef: 'builtin:stft',
    tags: ['stft', 'spectrogram', 'time-frequency'],
    inputFields: [
      { name: 'signal', label: '输入信号', type: 'number[]', required: true },
      { name: 'sample_rate', label: '采样率', type: 'number', required: true, unit: 'Hz' },
    ],
    outputFields: [
      { name: 'spectrogram', label: '时频谱图', type: 'number[][]' },
      { name: 'times', label: '时间轴', type: 'number[]', unit: 's' },
      { name: 'frequencies', label: '频率轴', type: 'number[]', unit: 'Hz' },
    ],
    configFields: [
      { name: 'window_size', label: '窗口长度', type: 'number', default: 256 },
      { name: 'hop_size', label: '步进长度', type: 'number', default: 128 },
      { name: 'window', label: '窗函数', type: 'select', default: 'hanning', options: [
        { value: 'hanning', label: 'Hanning' }, { value: 'hamming', label: 'Hamming' }, { value: 'blackman', label: 'Blackman' },
      ]},
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'acoustic_sensor', 'motor', 'gearbox'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'acoustic_emission'],
    applicableScenarios: ['bearing_diagnosis', 'gear_diagnosis', 'transient_analysis'],
    recommendedDataProfile: { min_sample_rate_hz: 500, min_data_length: 1024 },
    complexity: 'O(n log n)',
    edgeDeployable: true,
    license: 'builtin',
  },
  {
    id: 'wavelet_transform', label: '小波变换', icon: '🌊',
    description: '多分辨率时频分析，适合非平稳信号的瞬态特征提取',
    category: 'signal_processing', algorithmCategory: 'signal_processing',
    subcategory: 'time_frequency',
    implType: 'builtin', implRef: 'builtin:wavelet_transform',
    tags: ['wavelet', 'cwt', 'dwt', 'multiresolution'],
    inputFields: [
      { name: 'signal', label: '输入信号', type: 'number[]', required: true },
      { name: 'sample_rate', label: '采样率', type: 'number', required: true, unit: 'Hz' },
    ],
    outputFields: [
      { name: 'coefficients', label: '小波系数', type: 'number[][]' },
      { name: 'scales', label: '尺度', type: 'number[]' },
      { name: 'frequencies', label: '对应频率', type: 'number[]', unit: 'Hz' },
      { name: 'energy_distribution', label: '能量分布', type: 'number[]' },
    ],
    configFields: [
      { name: 'wavelet', label: '小波基', type: 'select', default: 'db4', options: [
        { value: 'db4', label: 'Daubechies-4' }, { value: 'db8', label: 'Daubechies-8' },
        { value: 'sym5', label: 'Symlet-5' }, { value: 'coif3', label: 'Coiflet-3' },
        { value: 'morlet', label: 'Morlet' }, { value: 'mexican_hat', label: 'Mexican Hat' },
      ]},
      { name: 'mode', label: '变换模式', type: 'select', default: 'dwt', options: [
        { value: 'dwt', label: '离散小波变换 (DWT)' }, { value: 'cwt', label: '连续小波变换 (CWT)' },
      ]},
      { name: 'level', label: '分解层数', type: 'number', default: 5, min: 1, max: 12 },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'acoustic_sensor', 'motor', 'bearing', 'gearbox'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'acoustic_emission'],
    applicableScenarios: ['bearing_diagnosis', 'gear_diagnosis', 'impact_detection', 'crack_detection'],
    recommendedDataProfile: { min_sample_rate_hz: 200, min_data_length: 512 },
    complexity: 'O(n)',
    edgeDeployable: true,
    license: 'builtin',
    kgIntegration: { writes_to_kg: true, node_type: 'WaveletFeature', edge_type: 'has_wavelet_feature' },
  },
  {
    id: 'envelope_analysis', label: '包络分析', icon: '📈',
    description: '提取信号包络，用于检测轴承故障特征频率（BPFO/BPFI/BSF/FTF）',
    category: 'signal_processing', algorithmCategory: 'signal_processing',
    subcategory: 'demodulation',
    implType: 'builtin', implRef: 'builtin:envelope_analysis',
    tags: ['envelope', 'hilbert', 'bearing', 'demodulation'],
    inputFields: [
      { name: 'signal', label: '输入信号', type: 'number[]', required: true },
      { name: 'sample_rate', label: '采样率', type: 'number', required: true, unit: 'Hz' },
    ],
    outputFields: [
      { name: 'envelope', label: '包络信号', type: 'number[]' },
      { name: 'envelope_spectrum', label: '包络谱', type: 'number[]' },
      { name: 'envelope_frequencies', label: '包络频率轴', type: 'number[]', unit: 'Hz' },
      { name: 'detected_fault_frequencies', label: '检测到的故障频率', type: 'object' },
    ],
    configFields: [
      { name: 'bandpass_low', label: '带通下限', type: 'number', unit: 'Hz', description: '留空则自动选择共振频带' },
      { name: 'bandpass_high', label: '带通上限', type: 'number', unit: 'Hz' },
      { name: 'bearing_params', label: '轴承参数', type: 'json', placeholder: '{"n_balls": 9, "d_ball": 7.94, "d_pitch": 39.04, "contact_angle": 0}', description: '可选，用于自动计算故障特征频率' },
      { name: 'shaft_speed_rpm', label: '转速', type: 'number', unit: 'RPM' },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'bearing', 'motor', 'pump'],
    applicableMeasurementTypes: ['vibration', 'acceleration'],
    applicableScenarios: ['bearing_diagnosis', 'rotating_machinery'],
    recommendedDataProfile: { min_sample_rate_hz: 1000, min_data_length: 2048 },
    complexity: 'O(n log n)',
    edgeDeployable: true,
    license: 'builtin',
    kgIntegration: { writes_to_kg: true, node_type: 'BearingFault', edge_type: 'diagnosed_fault' },
  },
  {
    id: 'bandpass_filter', label: '带通滤波器', icon: '🔊',
    description: '保留指定频率范围内的信号成分，滤除噪声',
    category: 'signal_processing', algorithmCategory: 'signal_processing',
    subcategory: 'filtering',
    implType: 'builtin', implRef: 'builtin:bandpass_filter',
    tags: ['filter', 'bandpass', 'butterworth', 'noise_reduction'],
    inputFields: [
      { name: 'signal', label: '输入信号', type: 'number[]', required: true },
      { name: 'sample_rate', label: '采样率', type: 'number', required: true, unit: 'Hz' },
    ],
    outputFields: [
      { name: 'filtered_signal', label: '滤波后信号', type: 'number[]' },
      { name: 'frequency_response', label: '频率响应', type: 'number[]' },
    ],
    configFields: [
      { name: 'filter_type', label: '滤波类型', type: 'select', default: 'bandpass', options: [
        { value: 'lowpass', label: '低通' }, { value: 'highpass', label: '高通' },
        { value: 'bandpass', label: '带通' }, { value: 'bandstop', label: '带阻' },
      ]},
      { name: 'low_freq', label: '下截止频率', type: 'number', unit: 'Hz' },
      { name: 'high_freq', label: '上截止频率', type: 'number', unit: 'Hz' },
      { name: 'order', label: '滤波器阶数', type: 'number', default: 4, min: 1, max: 10 },
      { name: 'design', label: '设计方法', type: 'select', default: 'butterworth', options: [
        { value: 'butterworth', label: 'Butterworth' }, { value: 'chebyshev1', label: 'Chebyshev I' },
        { value: 'chebyshev2', label: 'Chebyshev II' }, { value: 'bessel', label: 'Bessel' },
      ]},
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'acoustic_sensor', 'temperature_sensor', 'pressure_sensor'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'acoustic_emission', 'temperature', 'pressure'],
    applicableScenarios: ['noise_reduction', 'signal_conditioning', 'bearing_diagnosis', 'structural_health'],
    complexity: 'O(n)',
    edgeDeployable: true,
    license: 'builtin',
  },
  {
    id: 'cepstrum_analysis', label: '倒谱分析', icon: '📉',
    description: '检测信号中的周期性成分，适用于齿轮箱故障诊断',
    category: 'signal_processing', algorithmCategory: 'signal_processing',
    subcategory: 'cepstral',
    implType: 'builtin', implRef: 'builtin:cepstrum_analysis',
    tags: ['cepstrum', 'quefrency', 'gearbox', 'periodic'],
    inputFields: [
      { name: 'signal', label: '输入信号', type: 'number[]', required: true },
      { name: 'sample_rate', label: '采样率', type: 'number', required: true, unit: 'Hz' },
    ],
    outputFields: [
      { name: 'cepstrum', label: '倒谱', type: 'number[]' },
      { name: 'quefrency', label: '倒频率轴', type: 'number[]', unit: 's' },
      { name: 'dominant_quefrency', label: '主倒频率', type: 'number', unit: 's' },
      { name: 'corresponding_frequency', label: '对应频率', type: 'number', unit: 'Hz' },
    ],
    configFields: [
      { name: 'type', label: '倒谱类型', type: 'select', default: 'real', options: [
        { value: 'real', label: '实倒谱' }, { value: 'power', label: '功率倒谱' }, { value: 'complex', label: '复倒谱' },
      ]},
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'gearbox', 'motor'],
    applicableMeasurementTypes: ['vibration', 'acceleration'],
    applicableScenarios: ['gear_diagnosis', 'bearing_diagnosis', 'rotating_machinery'],
    recommendedDataProfile: { min_sample_rate_hz: 500, min_data_length: 1024 },
    complexity: 'O(n log n)',
    edgeDeployable: true,
    license: 'builtin',
  },
  {
    id: 'order_tracking', label: '阶次跟踪', icon: '🔄',
    description: '变速工况下的振动分析，将时域信号转换为角域信号',
    category: 'signal_processing', algorithmCategory: 'signal_processing',
    subcategory: 'order_analysis',
    implType: 'builtin', implRef: 'builtin:order_tracking',
    tags: ['order', 'tracking', 'variable_speed', 'angular_resampling'],
    inputFields: [
      { name: 'signal', label: '振动信号', type: 'number[]', required: true },
      { name: 'tachometer', label: '转速信号', type: 'number[]', required: true },
      { name: 'sample_rate', label: '采样率', type: 'number', required: true, unit: 'Hz' },
    ],
    outputFields: [
      { name: 'order_spectrum', label: '阶次谱', type: 'number[]' },
      { name: 'orders', label: '阶次轴', type: 'number[]' },
      { name: 'order_map', label: '阶次图', type: 'number[][]' },
      { name: 'rpm_profile', label: '转速曲线', type: 'number[]', unit: 'RPM' },
    ],
    configFields: [
      { name: 'max_order', label: '最大阶次', type: 'number', default: 20 },
      { name: 'samples_per_rev', label: '每转采样点', type: 'number', default: 256 },
      { name: 'interpolation', label: '插值方法', type: 'select', default: 'cubic', options: [
        { value: 'linear', label: '线性' }, { value: 'cubic', label: '三次' }, { value: 'spline', label: '样条' },
      ]},
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'motor', 'gearbox', 'turbine', 'compressor'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'rpm'],
    applicableScenarios: ['gear_diagnosis', 'motor_diagnosis', 'rotating_machinery', 'variable_speed_analysis'],
    recommendedDataProfile: { min_sample_rate_hz: 1000, min_data_length: 4096 },
    complexity: 'O(n log n)',
    edgeDeployable: false,
    license: 'builtin',
  },
  {
    id: 'signal_denoising', label: '信号去噪', icon: '🔇',
    description: '基于小波阈值去噪或移动平均去噪，提升信噪比',
    category: 'signal_processing', algorithmCategory: 'signal_processing',
    subcategory: 'denoising',
    implType: 'builtin', implRef: 'builtin:signal_denoising',
    tags: ['denoise', 'wavelet_denoise', 'smoothing', 'snr'],
    inputFields: [
      { name: 'signal', label: '输入信号', type: 'number[]', required: true },
    ],
    outputFields: [
      { name: 'denoised_signal', label: '去噪后信号', type: 'number[]' },
      { name: 'noise_estimate', label: '噪声估计', type: 'number[]' },
      { name: 'snr_improvement', label: '信噪比提升', type: 'number', unit: 'dB' },
    ],
    configFields: [
      { name: 'method', label: '去噪方法', type: 'select', default: 'wavelet', options: [
        { value: 'wavelet', label: '小波阈值去噪' }, { value: 'moving_average', label: '移动平均' },
        { value: 'savitzky_golay', label: 'Savitzky-Golay' }, { value: 'median', label: '中值滤波' },
      ]},
      { name: 'wavelet', label: '小波基', type: 'select', default: 'db4', options: [
        { value: 'db4', label: 'Daubechies-4' }, { value: 'sym5', label: 'Symlet-5' },
      ]},
      { name: 'threshold_rule', label: '阈值规则', type: 'select', default: 'soft', options: [
        { value: 'soft', label: '软阈值' }, { value: 'hard', label: '硬阈值' },
      ]},
      { name: 'level', label: '分解层数', type: 'number', default: 4, min: 1, max: 10 },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'acoustic_sensor', 'temperature_sensor', 'pressure_sensor'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure', 'acoustic_emission'],
    applicableScenarios: ['noise_reduction', 'signal_conditioning', 'bearing_diagnosis'],
    complexity: 'O(n)',
    edgeDeployable: true,
    license: 'builtin',
  },

  // ======== 特征工程 (5) — 桥接 Pipeline Engine ========
  {
    id: 'statistical_features', label: '统计特征提取', icon: '🔧',
    description: '提取时域统计特征：均值、RMS、峰值、峰峰值、峭度、偏度、波形因子、脉冲因子、裕度因子',
    category: 'feature_engineering', algorithmCategory: 'feature_engineering',
    subcategory: 'time_domain',
    implType: 'builtin', implRef: 'builtin:statistical_features',
    tags: ['rms', 'kurtosis', 'skewness', 'crest_factor', 'time_domain'],
    inputFields: [
      { name: 'signal', label: '输入信号', type: 'number[]', required: true },
    ],
    outputFields: [
      { name: 'mean', label: '均值', type: 'number' },
      { name: 'rms', label: '均方根值', type: 'number' },
      { name: 'peak', label: '峰值', type: 'number' },
      { name: 'peak_to_peak', label: '峰峰值', type: 'number' },
      { name: 'kurtosis', label: '峭度', type: 'number' },
      { name: 'skewness', label: '偏度', type: 'number' },
      { name: 'crest_factor', label: '波峰因子', type: 'number' },
      { name: 'impulse_factor', label: '脉冲因子', type: 'number' },
      { name: 'margin_factor', label: '裕度因子', type: 'number' },
      { name: 'std', label: '标准差', type: 'number' },
      { name: 'variance', label: '方差', type: 'number' },
    ],
    configFields: [
      { name: 'features', label: '选择特征', type: 'json', default: '["all"]', description: '["all"] 或指定特征名列表' },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'acoustic_sensor', 'temperature_sensor', 'pressure_sensor', 'motor', 'pump', 'bearing', 'gearbox'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure', 'current', 'voltage'],
    applicableScenarios: ['bearing_diagnosis', 'gear_diagnosis', 'motor_diagnosis', 'condition_monitoring', 'predictive_maintenance'],
    complexity: 'O(n)',
    edgeDeployable: true,
    license: 'builtin',
  },
  {
    id: 'normalization', label: '数据归一化', icon: '📏',
    description: '将数据缩放到指定范围，消除量纲影响',
    category: 'feature_engineering', algorithmCategory: 'feature_engineering',
    subcategory: 'scaling',
    implType: 'pipeline_node', implRef: 'feature_engineering',
    tags: ['normalize', 'standardize', 'minmax', 'zscore'],
    inputFields: [
      { name: 'data', label: '输入数据', type: 'number[][]', required: true },
    ],
    outputFields: [
      { name: 'normalized_data', label: '归一化后数据', type: 'number[][]' },
      { name: 'scaler_params', label: '缩放参数', type: 'object' },
    ],
    configFields: [
      { name: 'method', label: '归一化方法', type: 'select', default: 'minmax', options: [
        { value: 'minmax', label: 'Min-Max [0,1]' }, { value: 'zscore', label: 'Z-Score 标准化' },
        { value: 'robust', label: 'Robust (中位数)' }, { value: 'log', label: 'Log 变换' },
      ]},
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'temperature_sensor', 'pressure_sensor'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure', 'current'],
    applicableScenarios: ['data_preprocessing', 'model_training', 'feature_engineering'],
    complexity: 'O(n)',
    edgeDeployable: true,
    license: 'builtin',
  },
  {
    id: 'pca_reduction', label: 'PCA 降维', icon: '📐',
    description: '主成分分析降维，保留数据主要变异方向',
    category: 'feature_engineering', algorithmCategory: 'feature_engineering',
    subcategory: 'dimensionality_reduction',
    implType: 'builtin', implRef: 'builtin:pca_reduction',
    tags: ['pca', 'dimensionality_reduction', 'principal_component'],
    inputFields: [
      { name: 'data', label: '特征矩阵', type: 'number[][]', required: true, description: '行=样本, 列=特征' },
    ],
    outputFields: [
      { name: 'transformed', label: '降维后数据', type: 'number[][]' },
      { name: 'explained_variance_ratio', label: '方差解释比', type: 'number[]' },
      { name: 'components', label: '主成分', type: 'number[][]' },
      { name: 'n_components_selected', label: '选择的主成分数', type: 'number' },
    ],
    configFields: [
      { name: 'n_components', label: '目标维度', type: 'number', description: '留空则自动选择（保留95%方差）' },
      { name: 'variance_threshold', label: '方差保留阈值', type: 'number', default: 0.95, min: 0.5, max: 1.0, step: 0.01 },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'motor', 'pump', 'bearing'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure', 'current'],
    applicableScenarios: ['feature_engineering', 'model_training', 'anomaly_detection'],
    complexity: 'O(n^2)',
    edgeDeployable: false,
    license: 'builtin',
  },
  {
    id: 'frequency_features', label: '频域特征提取', icon: '📊',
    description: '提取频域特征：重心频率、均方频率、频率方差、频率标准差',
    category: 'feature_engineering', algorithmCategory: 'feature_engineering',
    subcategory: 'frequency_domain',
    implType: 'builtin', implRef: 'builtin:frequency_features',
    tags: ['frequency', 'spectral', 'centroid', 'bandwidth'],
    inputFields: [
      { name: 'signal', label: '输入信号', type: 'number[]', required: true },
      { name: 'sample_rate', label: '采样率', type: 'number', required: true, unit: 'Hz' },
    ],
    outputFields: [
      { name: 'spectral_centroid', label: '重心频率', type: 'number', unit: 'Hz' },
      { name: 'mean_square_frequency', label: '均方频率', type: 'number' },
      { name: 'frequency_variance', label: '频率方差', type: 'number' },
      { name: 'rms_frequency', label: 'RMS频率', type: 'number', unit: 'Hz' },
      { name: 'spectral_kurtosis', label: '频谱峭度', type: 'number' },
      { name: 'band_energy_ratio', label: '频带能量比', type: 'object' },
    ],
    configFields: [
      { name: 'bands', label: '频带划分', type: 'json', default: '[[0,100],[100,500],[500,2000],[2000,10000]]', description: '频带范围 [Hz]' },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'acoustic_sensor', 'motor', 'bearing', 'gearbox'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'acoustic_emission'],
    applicableScenarios: ['bearing_diagnosis', 'gear_diagnosis', 'condition_monitoring'],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    license: 'builtin',
  },
  {
    id: 'feature_selection', label: '特征选择', icon: '🎯',
    description: '基于相关性/方差/互信息选择最重要的特征子集',
    category: 'feature_engineering', algorithmCategory: 'feature_engineering',
    subcategory: 'selection',
    implType: 'builtin', implRef: 'builtin:feature_selection',
    tags: ['feature_selection', 'correlation', 'mutual_information', 'variance'],
    inputFields: [
      { name: 'features', label: '特征矩阵', type: 'number[][]', required: true },
      { name: 'labels', label: '标签', type: 'number[]', description: '有监督选择时需要' },
    ],
    outputFields: [
      { name: 'selected_indices', label: '选中特征索引', type: 'number[]' },
      { name: 'feature_scores', label: '特征评分', type: 'number[]' },
      { name: 'selected_features', label: '选中特征数据', type: 'number[][]' },
    ],
    configFields: [
      { name: 'method', label: '选择方法', type: 'select', default: 'variance', options: [
        { value: 'variance', label: '方差阈值' }, { value: 'correlation', label: '相关性' },
        { value: 'mutual_info', label: '互信息' }, { value: 'f_test', label: 'F-检验' },
      ]},
      { name: 'n_features', label: '目标特征数', type: 'number', description: '留空则自动选择' },
      { name: 'threshold', label: '阈值', type: 'number', default: 0.01 },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'motor', 'pump', 'bearing'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure', 'current'],
    applicableScenarios: ['feature_engineering', 'model_training'],
    complexity: 'O(n^2)',
    edgeDeployable: false,
    license: 'builtin',
  },

  // ======== 机器学习 (5) — 桥接 Pipeline Engine ========
  {
    id: 'random_forest', label: '随机森林', icon: '🌲',
    description: '集成学习分类/回归，适合中等规模数据的故障分类',
    category: 'machine_learning', algorithmCategory: 'machine_learning',
    subcategory: 'ensemble',
    implType: 'pipeline_node', implRef: 'model_inference',
    tags: ['random_forest', 'classification', 'regression', 'ensemble'],
    inputFields: [
      { name: 'features', label: '特征矩阵', type: 'number[][]', required: true },
      { name: 'labels', label: '标签', type: 'number[]', description: '训练时需要' },
    ],
    outputFields: [
      { name: 'predictions', label: '预测结果', type: 'number[]' },
      { name: 'probabilities', label: '概率分布', type: 'number[][]' },
      { name: 'feature_importance', label: '特征重要性', type: 'number[]' },
    ],
    configFields: [
      { name: 'task', label: '任务类型', type: 'select', default: 'classification', options: [
        { value: 'classification', label: '分类' }, { value: 'regression', label: '回归' },
      ]},
      { name: 'n_estimators', label: '树数量', type: 'number', default: 100, min: 10, max: 1000 },
      { name: 'max_depth', label: '最大深度', type: 'number', default: 10, min: 1, max: 50 },
      { name: 'min_samples_split', label: '最小分裂样本数', type: 'number', default: 2 },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'motor', 'pump', 'bearing', 'gearbox'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure', 'current'],
    applicableScenarios: ['fault_classification', 'condition_monitoring', 'predictive_maintenance'],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    license: 'builtin',
    kgIntegration: { writes_to_kg: true, node_type: 'FaultClassification', edge_type: 'classified_as' },
  },
  {
    id: 'svm_classifier', label: '支持向量机 (SVM)', icon: '📐',
    description: '高维空间分类，适合小样本故障诊断',
    category: 'machine_learning', algorithmCategory: 'machine_learning',
    subcategory: 'classification',
    implType: 'pipeline_node', implRef: 'model_inference',
    tags: ['svm', 'classification', 'kernel', 'small_sample'],
    inputFields: [
      { name: 'features', label: '特征矩阵', type: 'number[][]', required: true },
      { name: 'labels', label: '标签', type: 'number[]', description: '训练时需要' },
    ],
    outputFields: [
      { name: 'predictions', label: '预测结果', type: 'number[]' },
      { name: 'decision_values', label: '决策值', type: 'number[]' },
      { name: 'support_vectors_count', label: '支持向量数', type: 'number' },
    ],
    configFields: [
      { name: 'kernel', label: '核函数', type: 'select', default: 'rbf', options: [
        { value: 'linear', label: '线性' }, { value: 'rbf', label: 'RBF (高斯)' },
        { value: 'poly', label: '多项式' }, { value: 'sigmoid', label: 'Sigmoid' },
      ]},
      { name: 'C', label: '正则化参数', type: 'number', default: 1.0, min: 0.001, max: 1000 },
      { name: 'gamma', label: 'Gamma', type: 'select', default: 'scale', options: [
        { value: 'scale', label: 'Scale (自动)' }, { value: 'auto', label: 'Auto' },
      ]},
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'motor', 'bearing'],
    applicableMeasurementTypes: ['vibration', 'acceleration'],
    applicableScenarios: ['fault_classification', 'bearing_diagnosis', 'small_sample_diagnosis'],
    complexity: 'O(n^2)',
    edgeDeployable: true,
    license: 'builtin',
  },
  {
    id: 'xgboost', label: 'XGBoost', icon: '🚀',
    description: '梯度提升树，高精度分类/回归，支持缺失值处理',
    category: 'machine_learning', algorithmCategory: 'machine_learning',
    subcategory: 'ensemble',
    implType: 'pipeline_node', implRef: 'model_inference',
    tags: ['xgboost', 'gradient_boosting', 'classification', 'regression'],
    inputFields: [
      { name: 'features', label: '特征矩阵', type: 'number[][]', required: true },
      { name: 'labels', label: '标签', type: 'number[]', description: '训练时需要' },
    ],
    outputFields: [
      { name: 'predictions', label: '预测结果', type: 'number[]' },
      { name: 'probabilities', label: '概率分布', type: 'number[][]' },
      { name: 'feature_importance', label: '特征重要性', type: 'number[]' },
      { name: 'shap_values', label: 'SHAP 解释值', type: 'number[][]' },
    ],
    configFields: [
      { name: 'task', label: '任务类型', type: 'select', default: 'classification', options: [
        { value: 'classification', label: '分类' }, { value: 'regression', label: '回归' },
      ]},
      { name: 'n_estimators', label: '迭代轮数', type: 'number', default: 200, min: 10, max: 2000 },
      { name: 'max_depth', label: '最大深度', type: 'number', default: 6, min: 1, max: 20 },
      { name: 'learning_rate', label: '学习率', type: 'number', default: 0.1, min: 0.001, max: 1.0, step: 0.01 },
      { name: 'subsample', label: '子采样比例', type: 'number', default: 0.8, min: 0.1, max: 1.0, step: 0.1 },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'motor', 'pump', 'bearing', 'gearbox', 'compressor'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure', 'current', 'voltage'],
    applicableScenarios: ['fault_classification', 'predictive_maintenance', 'condition_monitoring', 'quality_inspection'],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    license: 'builtin',
  },
  {
    id: 'kmeans_clustering', label: 'K-Means 聚类', icon: '🎯',
    description: '无监督聚类，发现数据中的自然分组模式',
    category: 'machine_learning', algorithmCategory: 'machine_learning',
    subcategory: 'clustering',
    implType: 'builtin', implRef: 'builtin:kmeans_clustering',
    tags: ['kmeans', 'clustering', 'unsupervised', 'pattern_discovery'],
    inputFields: [
      { name: 'features', label: '特征矩阵', type: 'number[][]', required: true },
    ],
    outputFields: [
      { name: 'labels', label: '聚类标签', type: 'number[]' },
      { name: 'centroids', label: '聚类中心', type: 'number[][]' },
      { name: 'inertia', label: '惯性', type: 'number' },
      { name: 'silhouette_score', label: '轮廓系数', type: 'number' },
    ],
    configFields: [
      { name: 'n_clusters', label: '聚类数', type: 'number', default: 3, min: 2, max: 50 },
      { name: 'auto_k', label: '自动选择K', type: 'boolean', default: false, description: '使用肘部法则自动选择' },
      { name: 'max_iter', label: '最大迭代', type: 'number', default: 300 },
      { name: 'init', label: '初始化方法', type: 'select', default: 'kmeans++', options: [
        { value: 'kmeans++', label: 'K-Means++' }, { value: 'random', label: '随机' },
      ]},
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'motor', 'pump', 'bearing'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure'],
    applicableScenarios: ['pattern_discovery', 'anomaly_detection', 'condition_monitoring', 'fleet_analysis'],
    complexity: 'O(n)',
    edgeDeployable: true,
    license: 'builtin',
    kgIntegration: { writes_to_kg: true, node_type: 'OperatingMode', edge_type: 'belongs_to_cluster' },
  },
  {
    id: 'gaussian_mixture', label: '高斯混合模型 (GMM)', icon: '🔔',
    description: '概率密度估计和软聚类，适合工况识别',
    category: 'machine_learning', algorithmCategory: 'machine_learning',
    subcategory: 'clustering',
    implType: 'builtin', implRef: 'builtin:gaussian_mixture',
    tags: ['gmm', 'gaussian', 'mixture', 'density_estimation'],
    inputFields: [
      { name: 'features', label: '特征矩阵', type: 'number[][]', required: true },
    ],
    outputFields: [
      { name: 'labels', label: '聚类标签', type: 'number[]' },
      { name: 'probabilities', label: '后验概率', type: 'number[][]' },
      { name: 'means', label: '均值', type: 'number[][]' },
      { name: 'bic', label: 'BIC', type: 'number' },
      { name: 'aic', label: 'AIC', type: 'number' },
    ],
    configFields: [
      { name: 'n_components', label: '分量数', type: 'number', default: 3, min: 2, max: 20 },
      { name: 'covariance_type', label: '协方差类型', type: 'select', default: 'full', options: [
        { value: 'full', label: '完全' }, { value: 'tied', label: '绑定' },
        { value: 'diag', label: '对角' }, { value: 'spherical', label: '球形' },
      ]},
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'motor', 'pump'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure'],
    applicableScenarios: ['operating_mode_identification', 'anomaly_detection', 'fleet_analysis'],
    complexity: 'O(n)',
    edgeDeployable: true,
    license: 'builtin',
  },

  // ======== 深度学习 (3) — 桥接 Pipeline Engine model_inference ========
  {
    id: 'cnn_1d', label: '一维卷积网络 (1D-CNN)', icon: '🧠',
    description: '自动提取时序信号的局部特征，端到端故障诊断',
    category: 'deep_learning', algorithmCategory: 'deep_learning',
    subcategory: 'convolutional',
    implType: 'pipeline_node', implRef: 'model_inference',
    tags: ['cnn', '1d_cnn', 'deep_learning', 'end_to_end'],
    inputFields: [
      { name: 'signal', label: '输入信号', type: 'number[][]', required: true, description: '批量信号 [batch, length]' },
      { name: 'labels', label: '标签', type: 'number[]', description: '训练时需要' },
    ],
    outputFields: [
      { name: 'predictions', label: '预测结果', type: 'number[]' },
      { name: 'probabilities', label: '概率分布', type: 'number[][]' },
      { name: 'feature_maps', label: '特征图', type: 'number[][]' },
    ],
    configFields: [
      { name: 'model_path', label: '模型路径/ID', type: 'string', description: '预训练模型路径或模型注册中心ID' },
      { name: 'framework', label: '框架', type: 'select', default: 'onnx', options: [
        { value: 'onnx', label: 'ONNX Runtime' }, { value: 'tensorflow', label: 'TensorFlow' },
        { value: 'pytorch', label: 'PyTorch' },
      ]},
      { name: 'batch_size', label: '批大小', type: 'number', default: 32 },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'motor', 'bearing', 'gearbox'],
    applicableMeasurementTypes: ['vibration', 'acceleration'],
    applicableScenarios: ['fault_classification', 'bearing_diagnosis', 'end_to_end_diagnosis'],
    complexity: 'O(n)',
    edgeDeployable: true,
    license: 'builtin',
  },
  {
    id: 'lstm_predictor', label: 'LSTM 时序预测', icon: '🔮',
    description: '长短期记忆网络，适合时序预测和退化趋势建模',
    category: 'deep_learning', algorithmCategory: 'deep_learning',
    subcategory: 'recurrent',
    implType: 'pipeline_node', implRef: 'model_inference',
    tags: ['lstm', 'rnn', 'time_series', 'prediction'],
    inputFields: [
      { name: 'sequence', label: '输入序列', type: 'number[][]', required: true, description: '[batch, timesteps, features]' },
    ],
    outputFields: [
      { name: 'predictions', label: '预测值', type: 'number[]' },
      { name: 'confidence_interval', label: '置信区间', type: 'object' },
    ],
    configFields: [
      { name: 'model_path', label: '模型路径/ID', type: 'string' },
      { name: 'framework', label: '框架', type: 'select', default: 'onnx', options: [
        { value: 'onnx', label: 'ONNX Runtime' }, { value: 'tensorflow', label: 'TensorFlow' }, { value: 'pytorch', label: 'PyTorch' },
      ]},
      { name: 'sequence_length', label: '序列长度', type: 'number', default: 50 },
      { name: 'prediction_horizon', label: '预测步长', type: 'number', default: 10 },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'temperature_sensor', 'pressure_sensor', 'motor', 'bearing'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure'],
    applicableScenarios: ['predictive_maintenance', 'rul_prediction', 'degradation_modeling'],
    complexity: 'O(n)',
    edgeDeployable: true,
    license: 'builtin',
    kgIntegration: { writes_to_kg: true, node_type: 'PredictionResult', edge_type: 'predicted_by' },
  },
  {
    id: 'autoencoder_anomaly', label: 'AutoEncoder 异常检测', icon: '🔍',
    description: '自编码器重构误差检测异常，无需标注数据',
    category: 'deep_learning', algorithmCategory: 'deep_learning',
    subcategory: 'autoencoder',
    implType: 'pipeline_node', implRef: 'model_inference',
    tags: ['autoencoder', 'anomaly', 'reconstruction', 'unsupervised'],
    inputFields: [
      { name: 'data', label: '输入数据', type: 'number[][]', required: true },
    ],
    outputFields: [
      { name: 'reconstruction_errors', label: '重构误差', type: 'number[]' },
      { name: 'is_anomaly', label: '是否异常', type: 'boolean' },
      { name: 'anomaly_scores', label: '异常分数', type: 'number[]' },
      { name: 'threshold', label: '阈值', type: 'number' },
    ],
    configFields: [
      { name: 'model_path', label: '模型路径/ID', type: 'string' },
      { name: 'threshold_method', label: '阈值方法', type: 'select', default: 'percentile', options: [
        { value: 'percentile', label: '百分位数' }, { value: 'std', label: '标准差倍数' }, { value: 'fixed', label: '固定值' },
      ]},
      { name: 'threshold_value', label: '阈值参数', type: 'number', default: 95, description: '百分位数(0-100) / 标准差倍数 / 固定值' },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'motor', 'pump', 'bearing', 'compressor'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure', 'current'],
    applicableScenarios: ['anomaly_detection', 'condition_monitoring', 'unsupervised_diagnosis'],
    complexity: 'O(n)',
    edgeDeployable: true,
    license: 'builtin',
    kgIntegration: { writes_to_kg: true, node_type: 'AnomalyEvent', edge_type: 'detected_anomaly' },
  },

  // ======== 异常检测 (4) — 桥接 Pipeline Engine ========
  {
    id: 'zscore_detector', label: 'Z-Score 异常检测', icon: '🚨',
    description: '基于统计分布的异常检测，适合稳态数据',
    category: 'anomaly_detection', algorithmCategory: 'anomaly_detection',
    subcategory: 'statistical',
    implType: 'pipeline_node', implRef: 'anomaly_detect',
    tags: ['zscore', 'statistical', 'outlier', 'threshold'],
    inputFields: [
      { name: 'data', label: '输入数据', type: 'number[]', required: true },
    ],
    outputFields: [
      { name: 'anomaly_indices', label: '异常索引', type: 'number[]' },
      { name: 'z_scores', label: 'Z分数', type: 'number[]' },
      { name: 'anomaly_count', label: '异常数量', type: 'number' },
      { name: 'anomaly_ratio', label: '异常比例', type: 'number' },
    ],
    configFields: [
      { name: 'threshold', label: 'Z-Score 阈值', type: 'number', default: 3.0, min: 1.0, max: 10.0, step: 0.1 },
      { name: 'window_size', label: '滑动窗口', type: 'number', description: '留空则使用全局统计' },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'temperature_sensor', 'pressure_sensor', 'motor', 'pump'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure', 'current', 'voltage'],
    applicableScenarios: ['anomaly_detection', 'condition_monitoring', 'quality_inspection'],
    complexity: 'O(n)',
    edgeDeployable: true,
    license: 'builtin',
  },
  {
    id: 'iqr_detector', label: 'IQR 异常检测', icon: '📦',
    description: '基于四分位距的异常检测，对偏态分布更鲁棒',
    category: 'anomaly_detection', algorithmCategory: 'anomaly_detection',
    subcategory: 'statistical',
    implType: 'pipeline_node', implRef: 'anomaly_detect',
    tags: ['iqr', 'quartile', 'robust', 'outlier'],
    inputFields: [
      { name: 'data', label: '输入数据', type: 'number[]', required: true },
    ],
    outputFields: [
      { name: 'anomaly_indices', label: '异常索引', type: 'number[]' },
      { name: 'lower_bound', label: '下界', type: 'number' },
      { name: 'upper_bound', label: '上界', type: 'number' },
      { name: 'anomaly_count', label: '异常数量', type: 'number' },
    ],
    configFields: [
      { name: 'multiplier', label: 'IQR 倍数', type: 'number', default: 1.5, min: 0.5, max: 5.0, step: 0.1 },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'temperature_sensor', 'pressure_sensor', 'motor', 'pump'],
    applicableMeasurementTypes: ['vibration', 'temperature', 'pressure', 'current'],
    applicableScenarios: ['anomaly_detection', 'condition_monitoring'],
    complexity: 'O(n)',
    edgeDeployable: true,
    license: 'builtin',
  },
  {
    id: 'isolation_forest', label: 'Isolation Forest', icon: '🌲',
    description: '基于随机森林的无监督异常检测，适合高维数据',
    category: 'anomaly_detection', algorithmCategory: 'anomaly_detection',
    subcategory: 'tree_based',
    implType: 'pipeline_node', implRef: 'anomaly_detect',
    tags: ['isolation_forest', 'unsupervised', 'high_dimensional'],
    inputFields: [
      { name: 'features', label: '特征矩阵', type: 'number[][]', required: true },
    ],
    outputFields: [
      { name: 'anomaly_labels', label: '异常标签', type: 'number[]', description: '-1=异常, 1=正常' },
      { name: 'anomaly_scores', label: '异常分数', type: 'number[]' },
      { name: 'anomaly_count', label: '异常数量', type: 'number' },
    ],
    configFields: [
      { name: 'contamination', label: '异常比例', type: 'number', default: 0.05, min: 0.01, max: 0.5, step: 0.01 },
      { name: 'n_estimators', label: '树数量', type: 'number', default: 100 },
      { name: 'max_samples', label: '最大采样', type: 'select', default: 'auto', options: [
        { value: 'auto', label: '自动' }, { value: '256', label: '256' }, { value: '512', label: '512' },
      ]},
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'motor', 'pump', 'bearing', 'compressor'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure', 'current'],
    applicableScenarios: ['anomaly_detection', 'condition_monitoring', 'fleet_analysis'],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    license: 'builtin',
    kgIntegration: { writes_to_kg: true, node_type: 'AnomalyEvent', edge_type: 'detected_anomaly' },
  },
  {
    id: 'dbscan_detector', label: 'DBSCAN 密度异常检测', icon: '🔵',
    description: '基于密度的聚类，自动发现任意形状的异常簇',
    category: 'anomaly_detection', algorithmCategory: 'anomaly_detection',
    subcategory: 'density_based',
    implType: 'builtin', implRef: 'builtin:dbscan_detector',
    tags: ['dbscan', 'density', 'clustering', 'noise'],
    inputFields: [
      { name: 'features', label: '特征矩阵', type: 'number[][]', required: true },
    ],
    outputFields: [
      { name: 'labels', label: '聚类标签', type: 'number[]', description: '-1=噪声/异常' },
      { name: 'n_clusters', label: '聚类数', type: 'number' },
      { name: 'noise_indices', label: '噪声点索引', type: 'number[]' },
      { name: 'noise_ratio', label: '噪声比例', type: 'number' },
    ],
    configFields: [
      { name: 'eps', label: '邻域半径', type: 'number', default: 0.5, min: 0.01, step: 0.01 },
      { name: 'min_samples', label: '最小样本数', type: 'number', default: 5, min: 2 },
      { name: 'auto_eps', label: '自动选择eps', type: 'boolean', default: false, description: '使用K-距离图自动选择' },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'motor', 'pump'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure'],
    applicableScenarios: ['anomaly_detection', 'pattern_discovery', 'fleet_analysis'],
    complexity: 'O(n log n)',
    edgeDeployable: false,
    license: 'builtin',
  },

  // ======== 预测性维护 (3) — 新建 builtin ========
  {
    id: 'rul_estimator', label: 'RUL 剩余寿命预测', icon: '⏳',
    description: '基于退化指标的剩余使用寿命估计',
    category: 'predictive', algorithmCategory: 'predictive',
    subcategory: 'rul',
    implType: 'builtin', implRef: 'builtin:rul_estimator',
    tags: ['rul', 'remaining_useful_life', 'prognostics', 'degradation'],
    inputFields: [
      { name: 'health_indicators', label: '健康指标序列', type: 'number[][]', required: true, description: '[时间步, 指标数]' },
      { name: 'timestamps', label: '时间戳', type: 'number[]' },
    ],
    outputFields: [
      { name: 'rul_estimate', label: 'RUL 估计值', type: 'number', unit: 'hours' },
      { name: 'confidence_lower', label: '置信下界', type: 'number', unit: 'hours' },
      { name: 'confidence_upper', label: '置信上界', type: 'number', unit: 'hours' },
      { name: 'degradation_rate', label: '退化速率', type: 'number' },
      { name: 'health_index', label: '当前健康指数', type: 'number' },
      { name: 'failure_probability', label: '故障概率', type: 'number' },
    ],
    configFields: [
      { name: 'method', label: '预测方法', type: 'select', default: 'exponential', options: [
        { value: 'linear', label: '线性退化' }, { value: 'exponential', label: '指数退化' },
        { value: 'wiener', label: 'Wiener 过程' }, { value: 'particle_filter', label: '粒子滤波' },
      ]},
      { name: 'failure_threshold', label: '失效阈值', type: 'number', required: true },
      { name: 'confidence_level', label: '置信水平', type: 'number', default: 0.95, min: 0.5, max: 0.99, step: 0.01 },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'motor', 'pump', 'bearing', 'gearbox', 'compressor', 'turbine'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure', 'current'],
    applicableScenarios: ['predictive_maintenance', 'rul_prediction', 'asset_management'],
    complexity: 'O(n)',
    edgeDeployable: true,
    license: 'builtin',
    kgIntegration: { writes_to_kg: true, node_type: 'RULPrediction', edge_type: 'predicted_rul' },
  },
  {
    id: 'degradation_tracker', label: '退化趋势跟踪', icon: '📉',
    description: '跟踪设备健康指标的退化趋势，自动识别退化阶段',
    category: 'predictive', algorithmCategory: 'predictive',
    subcategory: 'degradation',
    implType: 'builtin', implRef: 'builtin:degradation_tracker',
    tags: ['degradation', 'trend', 'health_index', 'stage'],
    inputFields: [
      { name: 'health_indicators', label: '健康指标序列', type: 'number[]', required: true },
      { name: 'timestamps', label: '时间戳', type: 'number[]' },
    ],
    outputFields: [
      { name: 'trend_line', label: '趋势线', type: 'number[]' },
      { name: 'current_stage', label: '当前阶段', type: 'string' },
      { name: 'stage_boundaries', label: '阶段分界点', type: 'number[]' },
      { name: 'degradation_rate', label: '退化速率', type: 'number' },
      { name: 'acceleration', label: '退化加速度', type: 'number' },
    ],
    configFields: [
      { name: 'stages', label: '退化阶段数', type: 'number', default: 3, min: 2, max: 5 },
      { name: 'smoothing', label: '平滑窗口', type: 'number', default: 10 },
      { name: 'change_point_method', label: '变点检测', type: 'select', default: 'cusum', options: [
        { value: 'cusum', label: 'CUSUM' }, { value: 'pelt', label: 'PELT' }, { value: 'binary_segmentation', label: '二分法' },
      ]},
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'motor', 'pump', 'bearing', 'gearbox'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature'],
    applicableScenarios: ['predictive_maintenance', 'degradation_modeling', 'condition_monitoring'],
    complexity: 'O(n)',
    edgeDeployable: true,
    license: 'builtin',
    kgIntegration: { writes_to_kg: true, node_type: 'DegradationStage', edge_type: 'in_stage' },
  },
  {
    id: 'maintenance_scheduler', label: '维护计划优化', icon: '📅',
    description: '基于 RUL 和成本模型优化维护计划',
    category: 'predictive', algorithmCategory: 'predictive',
    subcategory: 'scheduling',
    implType: 'builtin', implRef: 'builtin:maintenance_scheduler',
    tags: ['maintenance', 'scheduling', 'optimization', 'cost'],
    inputFields: [
      { name: 'rul_estimates', label: 'RUL 估计', type: 'object', required: true, description: '设备RUL列表' },
      { name: 'cost_model', label: '成本模型', type: 'object', required: true },
    ],
    outputFields: [
      { name: 'schedule', label: '维护计划', type: 'object' },
      { name: 'total_cost', label: '总成本', type: 'number' },
      { name: 'risk_score', label: '风险评分', type: 'number' },
    ],
    configFields: [
      { name: 'planning_horizon', label: '计划周期', type: 'number', default: 30, unit: 'days' },
      { name: 'strategy', label: '策略', type: 'select', default: 'cost_optimal', options: [
        { value: 'cost_optimal', label: '成本最优' }, { value: 'risk_minimal', label: '风险最小' },
        { value: 'balanced', label: '平衡策略' },
      ]},
    ],
    applicableDeviceTypes: ['motor', 'pump', 'bearing', 'gearbox', 'compressor', 'turbine'],
    applicableMeasurementTypes: ['vibration', 'temperature', 'pressure'],
    applicableScenarios: ['predictive_maintenance', 'asset_management', 'fleet_management'],
    complexity: 'O(n^2)',
    edgeDeployable: false,
    license: 'enterprise',
  },

  // ======== 统计分析 (3) — 新建 builtin ========
  {
    id: 'distribution_test', label: '分布检验', icon: '📊',
    description: '检验数据是否符合特定分布（正态/韦布尔/指数等）',
    category: 'statistics', algorithmCategory: 'statistics',
    subcategory: 'hypothesis_testing',
    implType: 'builtin', implRef: 'builtin:distribution_test',
    tags: ['distribution', 'normality', 'weibull', 'hypothesis_test'],
    inputFields: [
      { name: 'data', label: '输入数据', type: 'number[]', required: true },
    ],
    outputFields: [
      { name: 'best_fit', label: '最佳拟合分布', type: 'string' },
      { name: 'fit_params', label: '拟合参数', type: 'object' },
      { name: 'p_value', label: 'P值', type: 'number' },
      { name: 'test_statistic', label: '检验统计量', type: 'number' },
      { name: 'all_fits', label: '所有拟合结果', type: 'object' },
    ],
    configFields: [
      { name: 'distributions', label: '候选分布', type: 'json', default: '["normal","weibull","exponential","lognormal","gamma"]' },
      { name: 'significance', label: '显著性水平', type: 'number', default: 0.05 },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'temperature_sensor', 'pressure_sensor'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure'],
    applicableScenarios: ['data_analysis', 'quality_inspection', 'reliability_analysis'],
    complexity: 'O(n)',
    edgeDeployable: true,
    license: 'builtin',
  },
  {
    id: 'correlation_analysis', label: '相关性分析', icon: '🔗',
    description: '分析多个变量之间的相关性（Pearson/Spearman/互信息）',
    category: 'statistics', algorithmCategory: 'statistics',
    subcategory: 'correlation',
    implType: 'builtin', implRef: 'builtin:correlation_analysis',
    tags: ['correlation', 'pearson', 'spearman', 'mutual_information'],
    inputFields: [
      { name: 'data', label: '多变量数据', type: 'number[][]', required: true, description: '列=变量' },
      { name: 'variable_names', label: '变量名', type: 'string[]' },
    ],
    outputFields: [
      { name: 'correlation_matrix', label: '相关系数矩阵', type: 'number[][]' },
      { name: 'p_values', label: 'P值矩阵', type: 'number[][]' },
      { name: 'significant_pairs', label: '显著相关对', type: 'object' },
    ],
    configFields: [
      { name: 'method', label: '相关系数', type: 'select', default: 'pearson', options: [
        { value: 'pearson', label: 'Pearson (线性)' }, { value: 'spearman', label: 'Spearman (秩)' },
        { value: 'kendall', label: 'Kendall' },
      ]},
      { name: 'significance', label: '显著性水平', type: 'number', default: 0.05 },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'temperature_sensor', 'pressure_sensor', 'motor'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure', 'current', 'voltage'],
    applicableScenarios: ['data_analysis', 'root_cause_analysis', 'feature_engineering'],
    complexity: 'O(n^2)',
    edgeDeployable: true,
    license: 'builtin',
    kgIntegration: { writes_to_kg: true, node_type: 'CorrelationResult', edge_type: 'correlated_with' },
  },
  {
    id: 'trend_analysis', label: '趋势分析', icon: '📈',
    description: 'Mann-Kendall 趋势检验 + Sen 斜率估计',
    category: 'statistics', algorithmCategory: 'statistics',
    subcategory: 'trend',
    implType: 'builtin', implRef: 'builtin:trend_analysis',
    tags: ['trend', 'mann_kendall', 'sen_slope', 'monotonic'],
    inputFields: [
      { name: 'data', label: '时序数据', type: 'number[]', required: true },
      { name: 'timestamps', label: '时间戳', type: 'number[]' },
    ],
    outputFields: [
      { name: 'has_trend', label: '是否有趋势', type: 'boolean' },
      { name: 'trend_direction', label: '趋势方向', type: 'string' },
      { name: 'p_value', label: 'P值', type: 'number' },
      { name: 'sen_slope', label: 'Sen斜率', type: 'number' },
      { name: 'tau', label: 'Kendall tau', type: 'number' },
    ],
    configFields: [
      { name: 'significance', label: '显著性水平', type: 'number', default: 0.05 },
      { name: 'seasonal', label: '季节性周期', type: 'number', description: '留空则不考虑季节性' },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'temperature_sensor', 'pressure_sensor', 'motor', 'bearing'],
    applicableMeasurementTypes: ['vibration', 'temperature', 'pressure', 'current'],
    applicableScenarios: ['condition_monitoring', 'degradation_modeling', 'predictive_maintenance'],
    complexity: 'O(n^2)',
    edgeDeployable: true,
    license: 'builtin',
  },

  // ======== 优化算法 (2) — 新建 builtin ========
  {
    id: 'threshold_optimizer', label: '阈值优化', icon: '⚡',
    description: '基于历史数据自动优化告警阈值，最小化误报/漏报',
    category: 'optimization', algorithmCategory: 'optimization',
    subcategory: 'threshold',
    implType: 'builtin', implRef: 'builtin:threshold_optimizer',
    tags: ['threshold', 'optimization', 'alarm', 'false_positive'],
    inputFields: [
      { name: 'historical_data', label: '历史数据', type: 'number[]', required: true },
      { name: 'known_anomalies', label: '已知异常索引', type: 'number[]', description: '有标注时使用' },
    ],
    outputFields: [
      { name: 'optimal_threshold', label: '最优阈值', type: 'number' },
      { name: 'false_positive_rate', label: '误报率', type: 'number' },
      { name: 'false_negative_rate', label: '漏报率', type: 'number' },
      { name: 'f1_score', label: 'F1分数', type: 'number' },
      { name: 'threshold_curve', label: '阈值-性能曲线', type: 'object' },
    ],
    configFields: [
      { name: 'objective', label: '优化目标', type: 'select', default: 'f1', options: [
        { value: 'f1', label: 'F1 最大化' }, { value: 'precision', label: '精确率优先' },
        { value: 'recall', label: '召回率优先' }, { value: 'cost', label: '成本最小化' },
      ]},
      { name: 'cost_fp', label: '误报成本', type: 'number', default: 1, description: '每次误报的相对成本' },
      { name: 'cost_fn', label: '漏报成本', type: 'number', default: 10, description: '每次漏报的相对成本' },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'temperature_sensor', 'pressure_sensor', 'motor', 'pump', 'bearing'],
    applicableMeasurementTypes: ['vibration', 'temperature', 'pressure', 'current'],
    applicableScenarios: ['alarm_optimization', 'condition_monitoring', 'quality_inspection'],
    complexity: 'O(n log n)',
    edgeDeployable: true,
    license: 'builtin',
  },
  {
    id: 'hyperparameter_search', label: '超参数搜索', icon: '🔍',
    description: '自动搜索算法最优超参数（网格/随机/贝叶斯）',
    category: 'optimization', algorithmCategory: 'optimization',
    subcategory: 'hyperparameter',
    implType: 'builtin', implRef: 'builtin:hyperparameter_search',
    tags: ['hyperparameter', 'grid_search', 'bayesian', 'optimization'],
    inputFields: [
      { name: 'algo_code', label: '目标算法编码', type: 'string', required: true },
      { name: 'training_data', label: '训练数据', type: 'object', required: true },
      { name: 'validation_data', label: '验证数据', type: 'object', required: true },
    ],
    outputFields: [
      { name: 'best_params', label: '最优参数', type: 'object' },
      { name: 'best_score', label: '最优得分', type: 'number' },
      { name: 'search_history', label: '搜索历史', type: 'object' },
      { name: 'convergence_curve', label: '收敛曲线', type: 'number[]' },
    ],
    configFields: [
      { name: 'method', label: '搜索方法', type: 'select', default: 'bayesian', options: [
        { value: 'grid', label: '网格搜索' }, { value: 'random', label: '随机搜索' },
        { value: 'bayesian', label: '贝叶斯优化' },
      ]},
      { name: 'n_trials', label: '搜索次数', type: 'number', default: 50, min: 10, max: 500 },
      { name: 'metric', label: '评估指标', type: 'select', default: 'f1', options: [
        { value: 'accuracy', label: '准确率' }, { value: 'f1', label: 'F1' },
        { value: 'rmse', label: 'RMSE' }, { value: 'mae', label: 'MAE' },
      ]},
      { name: 'param_space', label: '参数空间', type: 'json', description: '自动从目标算法 configSchema 推导' },
    ],
    applicableDeviceTypes: ['vibration_sensor', 'accelerometer', 'motor', 'pump', 'bearing'],
    applicableMeasurementTypes: ['vibration', 'acceleration', 'temperature', 'pressure'],
    applicableScenarios: ['model_training', 'algorithm_tuning', 'fleet_optimization'],
    complexity: 'O(n^2)',
    edgeDeployable: false,
    license: 'enterprise',
  },
];

// ============ 创建注册中心实例 ============
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
