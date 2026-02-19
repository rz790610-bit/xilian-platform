/**
 * 特征提取服务 — 类型定义
 * ============================================================
 * 
 * 数据类型枚举与提取器接口定义
 * 支持6种工业数据类型：振动、标量、电气、旋转、声学、视觉
 */

// ============================================================
// 数据类型枚举
// ============================================================

/**
 * 工业传感器数据类型
 * 对应 asset_measurement_points.measurement_type
 */
export enum DataType {
  /** 振动：加速度/速度/位移波形 */
  VIBRATION = 'vibration',
  /** 标量：温度/压力/流量/液位等单值量 */
  SCALAR = 'scalar',
  /** 电气：电压/电流波形 */
  ELECTRICAL = 'electrical',
  /** 旋转：转速/角位移/轴心轨迹 */
  ROTATION = 'rotation',
  /** 声学：麦克风/超声波音频 */
  ACOUSTIC = 'acoustic',
  /** 视觉：热成像/工业相机图像 */
  VISUAL = 'visual',
}

/**
 * measurement_type → DataType 映射表
 * 将 schema 中的 measurement_type 字符串映射到枚举
 */
export const MEASUREMENT_TYPE_MAP: Record<string, DataType> = {
  // 振动类
  'vibration': DataType.VIBRATION,
  'acceleration': DataType.VIBRATION,
  'velocity': DataType.VIBRATION,
  'displacement': DataType.VIBRATION,
  'shock': DataType.VIBRATION,
  // 标量类
  'temperature': DataType.SCALAR,
  'pressure': DataType.SCALAR,
  'flow': DataType.SCALAR,
  'level': DataType.SCALAR,
  'humidity': DataType.SCALAR,
  'weight': DataType.SCALAR,
  'force': DataType.SCALAR,
  'torque': DataType.SCALAR,
  'ph': DataType.SCALAR,
  'conductivity': DataType.SCALAR,
  'scalar': DataType.SCALAR,
  // 电气类
  'voltage': DataType.ELECTRICAL,
  'current': DataType.ELECTRICAL,
  'power': DataType.ELECTRICAL,
  'electrical': DataType.ELECTRICAL,
  'resistance': DataType.ELECTRICAL,
  'impedance': DataType.ELECTRICAL,
  // 旋转类
  'rotation': DataType.ROTATION,
  'rpm': DataType.ROTATION,
  'speed': DataType.ROTATION,
  'angular': DataType.ROTATION,
  'orbit': DataType.ROTATION,
  // 声学类
  'acoustic': DataType.ACOUSTIC,
  'audio': DataType.ACOUSTIC,
  'ultrasonic': DataType.ACOUSTIC,
  'sound': DataType.ACOUSTIC,
  'noise': DataType.ACOUSTIC,
  // 视觉类
  'visual': DataType.VISUAL,
  'thermal': DataType.VISUAL,
  'infrared': DataType.VISUAL,
  'camera': DataType.VISUAL,
  'image': DataType.VISUAL,
};

// ============================================================
// 原始数据输入格式
// ============================================================

/**
 * telemetry.raw 消息格式
 * 边缘网关上报的原始遥测数据
 */
export interface RawTelemetryMessage {
  /** 设备编码 */
  device_code: string;
  /** 测点编码 */
  mp_code: string;
  /** 网关ID */
  gateway_id: string;
  /** 采集时间戳（毫秒 epoch 或 ISO 字符串） */
  timestamp: number | string;
  /** 数据类型（如果网关不提供，从测点配置查询） */
  data_type?: string;
  /** 采样率（Hz，波形数据必填） */
  sample_rate?: number;
  /** 单值（标量类型） */
  value?: number;
  /** 波形数据（振动/电气/声学类型） */
  waveform?: number[];
  /** 原始 ADC 值 */
  raw_value?: number;
  /** 单位 */
  unit?: string;
  /** OPC UA 质量码 */
  quality?: number;
  /** 批次ID */
  batch_id?: string;
  /** 额外元数据 */
  metadata?: Record<string, any>;
}

// ============================================================
// 特征输出格式
// ============================================================

/**
 * telemetry.feature 消息格式
 * 特征提取后输出到 Kafka 的标准格式
 */
export interface FeatureMessage {
  /** 设备编码 */
  device_code: string;
  /** 测点编码 */
  mp_code: string;
  /** 网关ID */
  gateway_id: string;
  /** 原始采集时间戳 */
  timestamp: string;
  /** 数据类型 */
  data_type: DataType;
  /** 提取器名称 */
  extractor: string;
  /** 提取器版本 */
  extractor_version: string;
  /** 提取耗时（毫秒） */
  extraction_latency_ms: number;
  /** 原始工程值（标量类型保留） */
  value?: number;
  /** 单位 */
  unit: string;
  /** 质量码 */
  quality: number;
  /** 特征值（JSON 对象，各提取器输出不同） */
  features: Record<string, number | string | boolean>;
  /** 批次ID */
  batch_id: string;
  /** 来源 */
  source: string;
}

// ============================================================
// 振动特征（对齐 ClickHouse vibration_features 表）
// ============================================================

export interface VibrationFeatures {
  /** 均方根值 (mm/s) */
  rms: number;
  /** 峰值 (mm/s) */
  peak: number;
  /** 峰峰值 (mm/s) */
  peak_to_peak: number;
  /** 峭度（无量纲） */
  kurtosis: number;
  /** 波峰因子（无量纲） */
  crest_factor: number;
  /** 偏度（无量纲） */
  skewness: number;
  /** 主频 (Hz) */
  dominant_freq: number;
  /** 主频幅值 */
  dominant_amp: number;
  /** 频谱重心 (Hz) */
  spectral_centroid: number;
  /** 频谱带宽 (Hz) */
  spectral_bandwidth: number;
  /** 包络 RMS */
  envelope_rms?: number;
  /** 包络峰值 */
  envelope_peak?: number;
}

// ============================================================
// 标量特征
// ============================================================

export interface ScalarFeatures {
  /** 当前值 */
  current_value: number;
  /** 窗口均值 */
  mean: number;
  /** 窗口标准差 */
  std_dev: number;
  /** 窗口最小值 */
  min: number;
  /** 窗口最大值 */
  max: number;
  /** 变化率（单位/秒） */
  rate_of_change: number;
  /** 趋势斜率（线性回归） */
  trend_slope: number;
  /** 偏移量（相对基线） */
  offset_from_baseline: number;
  /** 是否突变 */
  is_step_change: boolean;
}

// ============================================================
// 电气特征
// ============================================================

export interface ElectricalFeatures {
  /** 基波幅值 */
  fundamental_amplitude: number;
  /** 基波频率 (Hz) */
  fundamental_freq: number;
  /** 总谐波失真 THD (%) */
  thd: number;
  /** 各次谐波幅值 [2次, 3次, ..., N次] */
  harmonic_amplitudes: number[];
  /** RMS 有效值 */
  rms: number;
  /** 峰值 */
  peak: number;
  /** 波形因子 */
  form_factor: number;
}

// ============================================================
// 旋转特征
// ============================================================

export interface RotationFeatures {
  /** 当前转速 (RPM) */
  rpm: number;
  /** 转速波动率 (%) */
  rpm_fluctuation: number;
  /** 1X 频率幅值（不平衡） */
  order_1x_amplitude: number;
  /** 2X 频率幅值（不对中） */
  order_2x_amplitude: number;
  /** 3X 频率幅值 */
  order_3x_amplitude: number;
  /** 亚同步分量 */
  sub_synchronous: number;
  /** 转速稳定性指数 */
  stability_index: number;
}

// ============================================================
// 声学特征
// ============================================================

export interface AcousticFeatures {
  /** 声压级 (dB SPL) */
  spl_db: number;
  /** A 计权声压级 (dBA) */
  spl_dba: number;
  /** MFCC 系数 (前13个) */
  mfcc: number[];
  /** 频谱质心 (Hz) */
  spectral_centroid: number;
  /** 频谱滚降点 (Hz) */
  spectral_rolloff: number;
  /** 频谱平坦度 */
  spectral_flatness: number;
  /** 过零率 */
  zero_crossing_rate: number;
  /** 短时能量 */
  short_time_energy: number;
}

// ============================================================
// 视觉特征
// ============================================================

export interface VisualFeatures {
  /** 最高温度 (°C) — 热成像 */
  max_temperature?: number;
  /** 最低温度 (°C) — 热成像 */
  min_temperature?: number;
  /** 平均温度 (°C) — 热成像 */
  avg_temperature?: number;
  /** 热点数量 */
  hotspot_count?: number;
  /** 缺陷区域数量 */
  defect_count?: number;
  /** 缺陷置信度 (0-1) */
  defect_confidence?: number;
  /** 变化检测分数 (0-1) */
  change_score?: number;
  /** 推理模型名称 */
  model_name?: string;
  /** 推理模型版本 */
  model_version?: string;
  /** 媒体文件引用（MinIO 路径） */
  media_ref?: string;
}

// ============================================================
// 提取器接口
// ============================================================

/**
 * 特征提取器接口
 * 所有提取器必须实现此接口
 */
export interface FeatureExtractor {
  /** 提取器名称 */
  readonly name: string;
  /** 提取器版本 */
  readonly version: string;
  /** 支持的数据类型 */
  readonly supportedTypes: DataType[];

  /**
   * 提取特征
   * @param raw 原始遥测消息
   * @returns 特征键值对
   */
  extract(raw: RawTelemetryMessage): Promise<Record<string, number | string | boolean>>;

  /**
   * 验证输入数据是否满足提取要求
   * @param raw 原始遥测消息
   * @returns 验证结果
   */
  validate(raw: RawTelemetryMessage): { valid: boolean; reason?: string };
}

// ============================================================
// 提取器配置
// ============================================================

export interface ExtractorConfig {
  /** 振动分析窗口大小（采样点数） */
  vibrationWindowSize: number;
  /** FFT 零填充倍数 */
  fftPadMultiplier: number;
  /** 标量滑动窗口大小（秒） */
  scalarWindowSec: number;
  /** 标量基线值缓存 TTL（秒） */
  scalarBaselineTtlSec: number;
  /** 声学帧长度（毫秒） */
  acousticFrameLenMs: number;
  /** MFCC 系数数量 */
  mfccCoefficients: number;
  /** 视觉推理服务地址 */
  visualInferenceUrl: string;
  /** 视觉推理超时（毫秒） */
  visualInferenceTimeoutMs: number;
}

export const DEFAULT_EXTRACTOR_CONFIG: ExtractorConfig = {
  vibrationWindowSize: 4096,
  fftPadMultiplier: 2,
  scalarWindowSec: 60,
  scalarBaselineTtlSec: 3600,
  acousticFrameLenMs: 25,
  mfccCoefficients: 13,
  visualInferenceUrl: process.env.VISUAL_INFERENCE_URL || 'http://triton:8000',
  visualInferenceTimeoutMs: 5000,
};
