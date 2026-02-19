/**
 * 特征提取模块
 * ============================================================
 * 
 * 数据动脉中间层：telemetry.raw → [特征提取] → telemetry.feature
 * 
 * 导出：
 *   - FeatureExtractionService: 主服务（Kafka 消费 → 提取 → 发布）
 *   - ExtractorRegistry: 提取器注册表（路由 + 管理）
 *   - 各类型提取器: Vibration / Scalar / Electrical / Rotation / Acoustic / Visual
 *   - DSP 工具: FFT / 窗函数 / 统计 / 频谱分析 / MFCC
 *   - 类型定义: DataType / RawTelemetryMessage / FeatureMessage / ...
 */

// 主服务
export {
  FeatureExtractionService,
  featureExtractionService,
  startFeatureExtraction,
  stopFeatureExtraction,
} from './feature-extraction.service';

// 注册表
export {
  ExtractorRegistry,
  extractorRegistry,
} from './extractor-registry';

// 提取器
export { VibrationExtractor } from './extractors/vibration.extractor';
export { ScalarExtractor } from './extractors/scalar.extractor';
export { ElectricalExtractor } from './extractors/electrical.extractor';
export { RotationExtractor } from './extractors/rotation.extractor';
export { AcousticExtractor } from './extractors/acoustic.extractor';
export { VisualExtractor } from './extractors/visual.extractor';

// 类型
export {
  DataType,
  MEASUREMENT_TYPE_MAP,
  FeatureExtractor,
  RawTelemetryMessage,
  FeatureMessage,
  VibrationFeatures,
  ScalarFeatures,
  ElectricalFeatures,
  RotationFeatures,
  AcousticFeatures,
  VisualFeatures,
  ExtractorConfig,
  DEFAULT_EXTRACTOR_CONFIG,
} from './types';

// DSP 工具
export {
  fft,
  magnitude,
  zeroPad,
  nextPow2,
  hanningWindow,
  hammingWindow,
  blackmanWindow,
  flatTopWindow,
  mean,
  variance,
  stdDev,
  rms,
  peak,
  peakToPeak,
  kurtosis,
  skewness,
  crestFactor,
  linearSlope,
  rateOfChange,
  detectStepChange,
  dominantFrequency,
  spectralCentroid,
  spectralBandwidth,
  spectralRolloff,
  spectralFlatness,
  zeroCrossingRate,
  shortTimeEnergy,
  envelope,
  hzToMel,
  melToHz,
  melFilterBank,
  computeMFCC,
  extractHarmonics,
  computeTHD,
} from './dsp-utils';
