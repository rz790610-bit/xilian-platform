//! 西联智能平台 - 高性能信号处理模块
//!
//! 本模块提供高性能的信号处理功能，用于港口设备传感器数据的实时分析。
//!
//! # 功能特性
//!
//! - **FFT 分析**: 快速傅里叶变换，用于频域分析
//! - **滤波器**: 低通、高通、带通、带阻滤波器
//! - **统计分析**: 均值、方差、标准差、峰值检测
//! - **异常检测**: Z-Score、IQR、MAD 等算法
//! - **特征提取**: 时域和频域特征提取
//! - **并行处理**: 利用 Rayon 进行并行计算
//!
//! # 示例
//!
//! ```rust
//! use signal_processor::{SignalProcessor, FilterType};
//!
//! let processor = SignalProcessor::new(1000.0); // 1kHz 采样率
//! let signal = vec![1.0, 2.0, 3.0, 4.0, 5.0];
//! let filtered = processor.apply_filter(&signal, FilterType::LowPass { cutoff: 100.0 });
//! ```

pub mod fft;
pub mod filters;
pub mod statistics;
pub mod anomaly;
pub mod features;
pub mod window;

use serde::{Deserialize, Serialize};
use std::f64::consts::PI;
use thiserror::Error;

// ============================================
// 错误类型
// ============================================

/// 信号处理错误
#[derive(Error, Debug)]
pub enum SignalError {
    #[error("信号长度不足: 需要 {required}, 实际 {actual}")]
    InsufficientLength { required: usize, actual: usize },

    #[error("无效的采样率: {0}")]
    InvalidSampleRate(f64),

    #[error("无效的滤波器参数: {0}")]
    InvalidFilterParams(String),

    #[error("FFT 计算错误: {0}")]
    FftError(String),

    #[error("数值计算错误: {0}")]
    NumericalError(String),
}

pub type Result<T> = std::result::Result<T, SignalError>;

// ============================================
// 核心类型定义
// ============================================

/// 信号数据点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataPoint {
    pub timestamp: i64,
    pub value: f64,
    pub quality: DataQuality,
}

/// 数据质量标记
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DataQuality {
    Good,
    Uncertain,
    Bad,
}

/// 滤波器类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FilterType {
    /// 低通滤波器
    LowPass { cutoff: f64 },
    /// 高通滤波器
    HighPass { cutoff: f64 },
    /// 带通滤波器
    BandPass { low: f64, high: f64 },
    /// 带阻滤波器
    BandStop { low: f64, high: f64 },
    /// 移动平均滤波器
    MovingAverage { window_size: usize },
    /// 指数移动平均
    ExponentialMovingAverage { alpha: f64 },
    /// 中值滤波器
    Median { window_size: usize },
}

/// 窗函数类型
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum WindowType {
    /// 矩形窗（无窗）
    Rectangular,
    /// 汉宁窗
    Hanning,
    /// 汉明窗
    Hamming,
    /// 布莱克曼窗
    Blackman,
    /// 凯泽窗
    Kaiser { beta: f64 },
    /// 高斯窗
    Gaussian { sigma: f64 },
}

/// 统计结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatisticsResult {
    pub count: usize,
    pub mean: f64,
    pub variance: f64,
    pub std_dev: f64,
    pub min: f64,
    pub max: f64,
    pub range: f64,
    pub median: f64,
    pub q1: f64,
    pub q3: f64,
    pub iqr: f64,
    pub skewness: f64,
    pub kurtosis: f64,
    pub rms: f64,
    pub peak_to_peak: f64,
    pub crest_factor: f64,
}

/// FFT 结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FftResult {
    pub frequencies: Vec<f64>,
    pub magnitudes: Vec<f64>,
    pub phases: Vec<f64>,
    pub power_spectrum: Vec<f64>,
    pub dominant_frequency: f64,
    pub total_power: f64,
}

/// 异常检测结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnomalyResult {
    pub is_anomaly: bool,
    pub score: f64,
    pub threshold: f64,
    pub method: String,
    pub details: Option<String>,
}

/// 特征提取结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureSet {
    // 时域特征
    pub time_domain: TimeDomainFeatures,
    // 频域特征
    pub frequency_domain: FrequencyDomainFeatures,
}

/// 时域特征
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeDomainFeatures {
    pub mean: f64,
    pub std_dev: f64,
    pub rms: f64,
    pub peak: f64,
    pub peak_to_peak: f64,
    pub crest_factor: f64,
    pub shape_factor: f64,
    pub impulse_factor: f64,
    pub clearance_factor: f64,
    pub zero_crossings: usize,
}

/// 频域特征
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrequencyDomainFeatures {
    pub dominant_frequency: f64,
    pub spectral_centroid: f64,
    pub spectral_bandwidth: f64,
    pub spectral_rolloff: f64,
    pub spectral_flatness: f64,
    pub spectral_entropy: f64,
    pub band_powers: Vec<f64>,
}

// ============================================
// 信号处理器
// ============================================

/// 信号处理器
pub struct SignalProcessor {
    sample_rate: f64,
    fft_size: usize,
}

impl SignalProcessor {
    /// 创建新的信号处理器
    pub fn new(sample_rate: f64) -> Result<Self> {
        if sample_rate <= 0.0 {
            return Err(SignalError::InvalidSampleRate(sample_rate));
        }
        Ok(Self {
            sample_rate,
            fft_size: 1024,
        })
    }

    /// 设置 FFT 大小
    pub fn with_fft_size(mut self, size: usize) -> Self {
        self.fft_size = size.next_power_of_two();
        self
    }

    /// 获取采样率
    pub fn sample_rate(&self) -> f64 {
        self.sample_rate
    }

    // ============================================
    // 滤波器
    // ============================================

    /// 应用滤波器
    pub fn apply_filter(&self, signal: &[f64], filter_type: FilterType) -> Result<Vec<f64>> {
        match filter_type {
            FilterType::MovingAverage { window_size } => {
                self.moving_average(signal, window_size)
            }
            FilterType::ExponentialMovingAverage { alpha } => {
                self.exponential_moving_average(signal, alpha)
            }
            FilterType::Median { window_size } => {
                self.median_filter(signal, window_size)
            }
            FilterType::LowPass { cutoff } => {
                self.butterworth_lowpass(signal, cutoff, 4)
            }
            FilterType::HighPass { cutoff } => {
                self.butterworth_highpass(signal, cutoff, 4)
            }
            FilterType::BandPass { low, high } => {
                self.butterworth_bandpass(signal, low, high, 4)
            }
            FilterType::BandStop { low, high } => {
                self.butterworth_bandstop(signal, low, high, 4)
            }
        }
    }

    /// 移动平均滤波
    fn moving_average(&self, signal: &[f64], window_size: usize) -> Result<Vec<f64>> {
        if signal.len() < window_size {
            return Err(SignalError::InsufficientLength {
                required: window_size,
                actual: signal.len(),
            });
        }

        let mut result = Vec::with_capacity(signal.len());
        let mut sum: f64 = signal[..window_size].iter().sum();
        
        for i in 0..signal.len() {
            if i >= window_size {
                sum -= signal[i - window_size];
                sum += signal[i];
            }
            result.push(sum / window_size as f64);
        }

        Ok(result)
    }

    /// 指数移动平均滤波
    fn exponential_moving_average(&self, signal: &[f64], alpha: f64) -> Result<Vec<f64>> {
        if alpha <= 0.0 || alpha > 1.0 {
            return Err(SignalError::InvalidFilterParams(
                format!("alpha 必须在 (0, 1] 范围内，实际值: {}", alpha)
            ));
        }

        let mut result = Vec::with_capacity(signal.len());
        let mut ema = signal[0];
        
        for &value in signal {
            ema = alpha * value + (1.0 - alpha) * ema;
            result.push(ema);
        }

        Ok(result)
    }

    /// 中值滤波
    fn median_filter(&self, signal: &[f64], window_size: usize) -> Result<Vec<f64>> {
        if signal.len() < window_size {
            return Err(SignalError::InsufficientLength {
                required: window_size,
                actual: signal.len(),
            });
        }

        let half_window = window_size / 2;
        let mut result = Vec::with_capacity(signal.len());
        
        for i in 0..signal.len() {
            let start = i.saturating_sub(half_window);
            let end = (i + half_window + 1).min(signal.len());
            let mut window: Vec<f64> = signal[start..end].to_vec();
            window.sort_by(|a, b| a.partial_cmp(b).unwrap());
            result.push(window[window.len() / 2]);
        }

        Ok(result)
    }

    /// Butterworth 低通滤波器
    fn butterworth_lowpass(&self, signal: &[f64], cutoff: f64, order: usize) -> Result<Vec<f64>> {
        let normalized_cutoff = cutoff / (self.sample_rate / 2.0);
        if normalized_cutoff <= 0.0 || normalized_cutoff >= 1.0 {
            return Err(SignalError::InvalidFilterParams(
                format!("截止频率必须在 (0, Nyquist) 范围内")
            ));
        }

        // 简化的 IIR 滤波实现
        let rc = 1.0 / (2.0 * PI * cutoff);
        let dt = 1.0 / self.sample_rate;
        let alpha = dt / (rc + dt);

        let mut result = vec![0.0; signal.len()];
        result[0] = signal[0];
        
        for _ in 0..order {
            for i in 1..signal.len() {
                result[i] = alpha * signal[i] + (1.0 - alpha) * result[i - 1];
            }
        }

        Ok(result)
    }

    /// Butterworth 高通滤波器
    fn butterworth_highpass(&self, signal: &[f64], cutoff: f64, order: usize) -> Result<Vec<f64>> {
        let lowpass = self.butterworth_lowpass(signal, cutoff, order)?;
        Ok(signal.iter().zip(lowpass.iter()).map(|(s, l)| s - l).collect())
    }

    /// Butterworth 带通滤波器
    fn butterworth_bandpass(&self, signal: &[f64], low: f64, high: f64, order: usize) -> Result<Vec<f64>> {
        let highpassed = self.butterworth_highpass(signal, low, order)?;
        self.butterworth_lowpass(&highpassed, high, order)
    }

    /// Butterworth 带阻滤波器
    fn butterworth_bandstop(&self, signal: &[f64], low: f64, high: f64, order: usize) -> Result<Vec<f64>> {
        let lowpassed = self.butterworth_lowpass(signal, low, order)?;
        let highpassed = self.butterworth_highpass(signal, high, order)?;
        Ok(lowpassed.iter().zip(highpassed.iter()).map(|(l, h)| l + h).collect())
    }

    // ============================================
    // FFT 分析
    // ============================================

    /// 执行 FFT 分析
    pub fn fft_analysis(&self, signal: &[f64]) -> Result<FftResult> {
        use rustfft::{FftPlanner, num_complex::Complex};

        let n = signal.len().next_power_of_two();
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(n);

        // 准备输入数据（零填充）
        let mut buffer: Vec<Complex<f64>> = signal
            .iter()
            .map(|&x| Complex::new(x, 0.0))
            .collect();
        buffer.resize(n, Complex::new(0.0, 0.0));

        // 执行 FFT
        fft.process(&mut buffer);

        // 计算频率、幅度和相位
        let freq_resolution = self.sample_rate / n as f64;
        let half_n = n / 2;

        let mut frequencies = Vec::with_capacity(half_n);
        let mut magnitudes = Vec::with_capacity(half_n);
        let mut phases = Vec::with_capacity(half_n);
        let mut power_spectrum = Vec::with_capacity(half_n);

        let mut max_magnitude = 0.0;
        let mut dominant_freq = 0.0;
        let mut total_power = 0.0;

        for i in 0..half_n {
            let freq = i as f64 * freq_resolution;
            let magnitude = buffer[i].norm() * 2.0 / n as f64;
            let phase = buffer[i].arg();
            let power = magnitude * magnitude;

            frequencies.push(freq);
            magnitudes.push(magnitude);
            phases.push(phase);
            power_spectrum.push(power);

            total_power += power;

            if magnitude > max_magnitude {
                max_magnitude = magnitude;
                dominant_freq = freq;
            }
        }

        Ok(FftResult {
            frequencies,
            magnitudes,
            phases,
            power_spectrum,
            dominant_frequency: dominant_freq,
            total_power,
        })
    }

    // ============================================
    // 统计分析
    // ============================================

    /// 计算统计指标
    pub fn calculate_statistics(&self, signal: &[f64]) -> Result<StatisticsResult> {
        if signal.is_empty() {
            return Err(SignalError::InsufficientLength {
                required: 1,
                actual: 0,
            });
        }

        let n = signal.len() as f64;

        // 基本统计
        let mean = signal.iter().sum::<f64>() / n;
        let variance = signal.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n;
        let std_dev = variance.sqrt();

        // 极值
        let min = signal.iter().cloned().fold(f64::INFINITY, f64::min);
        let max = signal.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let range = max - min;

        // 排序后的数据用于分位数
        let mut sorted = signal.to_vec();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let median = if sorted.len() % 2 == 0 {
            (sorted[sorted.len() / 2 - 1] + sorted[sorted.len() / 2]) / 2.0
        } else {
            sorted[sorted.len() / 2]
        };

        let q1_idx = sorted.len() / 4;
        let q3_idx = 3 * sorted.len() / 4;
        let q1 = sorted[q1_idx];
        let q3 = sorted[q3_idx];
        let iqr = q3 - q1;

        // 高阶矩
        let skewness = signal.iter()
            .map(|x| ((x - mean) / std_dev).powi(3))
            .sum::<f64>() / n;

        let kurtosis = signal.iter()
            .map(|x| ((x - mean) / std_dev).powi(4))
            .sum::<f64>() / n - 3.0;

        // RMS
        let rms = (signal.iter().map(|x| x.powi(2)).sum::<f64>() / n).sqrt();

        // 峰峰值
        let peak_to_peak = max - min;

        // 波峰因子
        let crest_factor = if rms > 0.0 { max.abs().max(min.abs()) / rms } else { 0.0 };

        Ok(StatisticsResult {
            count: signal.len(),
            mean,
            variance,
            std_dev,
            min,
            max,
            range,
            median,
            q1,
            q3,
            iqr,
            skewness,
            kurtosis,
            rms,
            peak_to_peak,
            crest_factor,
        })
    }

    // ============================================
    // 异常检测
    // ============================================

    /// Z-Score 异常检测
    pub fn detect_anomaly_zscore(&self, value: f64, history: &[f64], threshold: f64) -> AnomalyResult {
        let stats = self.calculate_statistics(history).unwrap_or_else(|_| StatisticsResult {
            count: 0,
            mean: 0.0,
            variance: 1.0,
            std_dev: 1.0,
            min: 0.0,
            max: 0.0,
            range: 0.0,
            median: 0.0,
            q1: 0.0,
            q3: 0.0,
            iqr: 0.0,
            skewness: 0.0,
            kurtosis: 0.0,
            rms: 0.0,
            peak_to_peak: 0.0,
            crest_factor: 0.0,
        });

        let z_score = if stats.std_dev > 0.0 {
            (value - stats.mean).abs() / stats.std_dev
        } else {
            0.0
        };

        AnomalyResult {
            is_anomaly: z_score > threshold,
            score: z_score,
            threshold,
            method: "Z-Score".to_string(),
            details: Some(format!("mean={:.4}, std={:.4}", stats.mean, stats.std_dev)),
        }
    }

    /// IQR 异常检测
    pub fn detect_anomaly_iqr(&self, value: f64, history: &[f64], k: f64) -> AnomalyResult {
        let stats = self.calculate_statistics(history).unwrap_or_else(|_| StatisticsResult {
            count: 0,
            mean: 0.0,
            variance: 1.0,
            std_dev: 1.0,
            min: 0.0,
            max: 0.0,
            range: 0.0,
            median: 0.0,
            q1: 0.0,
            q3: 0.0,
            iqr: 1.0,
            skewness: 0.0,
            kurtosis: 0.0,
            rms: 0.0,
            peak_to_peak: 0.0,
            crest_factor: 0.0,
        });

        let lower_bound = stats.q1 - k * stats.iqr;
        let upper_bound = stats.q3 + k * stats.iqr;
        let is_anomaly = value < lower_bound || value > upper_bound;

        let score = if stats.iqr > 0.0 {
            if value < stats.median {
                (stats.q1 - value) / stats.iqr
            } else {
                (value - stats.q3) / stats.iqr
            }
        } else {
            0.0
        };

        AnomalyResult {
            is_anomaly,
            score: score.max(0.0),
            threshold: k,
            method: "IQR".to_string(),
            details: Some(format!("bounds=[{:.4}, {:.4}]", lower_bound, upper_bound)),
        }
    }

    /// MAD (Median Absolute Deviation) 异常检测
    pub fn detect_anomaly_mad(&self, value: f64, history: &[f64], threshold: f64) -> AnomalyResult {
        let stats = self.calculate_statistics(history).unwrap_or_else(|_| StatisticsResult {
            count: 0,
            mean: 0.0,
            variance: 1.0,
            std_dev: 1.0,
            min: 0.0,
            max: 0.0,
            range: 0.0,
            median: 0.0,
            q1: 0.0,
            q3: 0.0,
            iqr: 1.0,
            skewness: 0.0,
            kurtosis: 0.0,
            rms: 0.0,
            peak_to_peak: 0.0,
            crest_factor: 0.0,
        });

        // 计算 MAD
        let mut abs_deviations: Vec<f64> = history
            .iter()
            .map(|x| (x - stats.median).abs())
            .collect();
        abs_deviations.sort_by(|a, b| a.partial_cmp(b).unwrap());
        
        let mad = if abs_deviations.len() % 2 == 0 {
            (abs_deviations[abs_deviations.len() / 2 - 1] + abs_deviations[abs_deviations.len() / 2]) / 2.0
        } else {
            abs_deviations[abs_deviations.len() / 2]
        };

        // 修正的 MAD（用于正态分布）
        let mad_corrected = mad * 1.4826;

        let score = if mad_corrected > 0.0 {
            (value - stats.median).abs() / mad_corrected
        } else {
            0.0
        };

        AnomalyResult {
            is_anomaly: score > threshold,
            score,
            threshold,
            method: "MAD".to_string(),
            details: Some(format!("median={:.4}, mad={:.4}", stats.median, mad)),
        }
    }

    // ============================================
    // 特征提取
    // ============================================

    /// 提取时域和频域特征
    pub fn extract_features(&self, signal: &[f64]) -> Result<FeatureSet> {
        let stats = self.calculate_statistics(signal)?;
        let fft = self.fft_analysis(signal)?;

        // 时域特征
        let zero_crossings = signal.windows(2)
            .filter(|w| (w[0] >= 0.0 && w[1] < 0.0) || (w[0] < 0.0 && w[1] >= 0.0))
            .count();

        let abs_mean = signal.iter().map(|x| x.abs()).sum::<f64>() / signal.len() as f64;
        let shape_factor = if abs_mean > 0.0 { stats.rms / abs_mean } else { 0.0 };
        let impulse_factor = if abs_mean > 0.0 { stats.max.abs().max(stats.min.abs()) / abs_mean } else { 0.0 };
        
        let sqrt_mean = (signal.iter().map(|x| x.abs().sqrt()).sum::<f64>() / signal.len() as f64).powi(2);
        let clearance_factor = if sqrt_mean > 0.0 { stats.max.abs().max(stats.min.abs()) / sqrt_mean } else { 0.0 };

        let time_domain = TimeDomainFeatures {
            mean: stats.mean,
            std_dev: stats.std_dev,
            rms: stats.rms,
            peak: stats.max.abs().max(stats.min.abs()),
            peak_to_peak: stats.peak_to_peak,
            crest_factor: stats.crest_factor,
            shape_factor,
            impulse_factor,
            clearance_factor,
            zero_crossings,
        };

        // 频域特征
        let spectral_centroid = fft.frequencies.iter()
            .zip(fft.magnitudes.iter())
            .map(|(f, m)| f * m)
            .sum::<f64>() / fft.magnitudes.iter().sum::<f64>().max(1e-10);

        let spectral_bandwidth = (fft.frequencies.iter()
            .zip(fft.magnitudes.iter())
            .map(|(f, m)| (f - spectral_centroid).powi(2) * m)
            .sum::<f64>() / fft.magnitudes.iter().sum::<f64>().max(1e-10))
            .sqrt();

        // 频谱滚降点（95% 能量）
        let total_energy: f64 = fft.power_spectrum.iter().sum();
        let mut cumulative = 0.0;
        let mut spectral_rolloff = 0.0;
        for (i, &power) in fft.power_spectrum.iter().enumerate() {
            cumulative += power;
            if cumulative >= 0.95 * total_energy {
                spectral_rolloff = fft.frequencies[i];
                break;
            }
        }

        // 频谱平坦度
        let geometric_mean = fft.magnitudes.iter()
            .map(|m| m.max(1e-10).ln())
            .sum::<f64>()
            .exp()
            .powf(1.0 / fft.magnitudes.len() as f64);
        let arithmetic_mean = fft.magnitudes.iter().sum::<f64>() / fft.magnitudes.len() as f64;
        let spectral_flatness = if arithmetic_mean > 0.0 { geometric_mean / arithmetic_mean } else { 0.0 };

        // 频谱熵
        let total_mag: f64 = fft.magnitudes.iter().sum();
        let spectral_entropy = if total_mag > 0.0 {
            -fft.magnitudes.iter()
                .map(|m| {
                    let p = m / total_mag;
                    if p > 0.0 { p * p.ln() } else { 0.0 }
                })
                .sum::<f64>()
        } else {
            0.0
        };

        // 频带能量（分成 8 个频带）
        let num_bands = 8;
        let band_size = fft.power_spectrum.len() / num_bands;
        let band_powers: Vec<f64> = (0..num_bands)
            .map(|i| {
                let start = i * band_size;
                let end = ((i + 1) * band_size).min(fft.power_spectrum.len());
                fft.power_spectrum[start..end].iter().sum()
            })
            .collect();

        let frequency_domain = FrequencyDomainFeatures {
            dominant_frequency: fft.dominant_frequency,
            spectral_centroid,
            spectral_bandwidth,
            spectral_rolloff,
            spectral_flatness,
            spectral_entropy,
            band_powers,
        };

        Ok(FeatureSet {
            time_domain,
            frequency_domain,
        })
    }

    // ============================================
    // 窗函数
    // ============================================

    /// 应用窗函数
    pub fn apply_window(&self, signal: &[f64], window_type: WindowType) -> Vec<f64> {
        let n = signal.len();
        let window = match window_type {
            WindowType::Rectangular => vec![1.0; n],
            WindowType::Hanning => (0..n)
                .map(|i| 0.5 * (1.0 - (2.0 * PI * i as f64 / (n - 1) as f64).cos()))
                .collect(),
            WindowType::Hamming => (0..n)
                .map(|i| 0.54 - 0.46 * (2.0 * PI * i as f64 / (n - 1) as f64).cos())
                .collect(),
            WindowType::Blackman => (0..n)
                .map(|i| {
                    let x = 2.0 * PI * i as f64 / (n - 1) as f64;
                    0.42 - 0.5 * x.cos() + 0.08 * (2.0 * x).cos()
                })
                .collect(),
            WindowType::Kaiser { beta } => {
                // 简化的 Kaiser 窗实现
                (0..n)
                    .map(|i| {
                        let x = 2.0 * i as f64 / (n - 1) as f64 - 1.0;
                        let arg = beta * (1.0 - x * x).sqrt();
                        bessel_i0(arg) / bessel_i0(beta)
                    })
                    .collect()
            }
            WindowType::Gaussian { sigma } => (0..n)
                .map(|i| {
                    let x = (i as f64 - (n - 1) as f64 / 2.0) / (sigma * (n - 1) as f64 / 2.0);
                    (-0.5 * x * x).exp()
                })
                .collect(),
        };

        signal.iter().zip(window.iter()).map(|(s, w)| s * w).collect()
    }
}

/// 修正的贝塞尔函数 I0（简化实现）
fn bessel_i0(x: f64) -> f64 {
    let ax = x.abs();
    if ax < 3.75 {
        let y = (x / 3.75).powi(2);
        1.0 + y * (3.5156229 + y * (3.0899424 + y * (1.2067492
            + y * (0.2659732 + y * (0.0360768 + y * 0.0045813)))))
    } else {
        let y = 3.75 / ax;
        (ax.exp() / ax.sqrt()) * (0.39894228 + y * (0.01328592
            + y * (0.00225319 + y * (-0.00157565 + y * (0.00916281
            + y * (-0.02057706 + y * (0.02635537 + y * (-0.01647633
            + y * 0.00392377))))))))
    }
}

// ============================================
// 并行处理
// ============================================

/// 并行信号处理器
pub struct ParallelSignalProcessor {
    processor: SignalProcessor,
}

impl ParallelSignalProcessor {
    pub fn new(sample_rate: f64) -> Result<Self> {
        Ok(Self {
            processor: SignalProcessor::new(sample_rate)?,
        })
    }

    /// 并行处理多个信号
    pub fn process_batch(&self, signals: &[Vec<f64>], filter_type: FilterType) -> Vec<Result<Vec<f64>>> {
        use rayon::prelude::*;
        
        signals
            .par_iter()
            .map(|signal| self.processor.apply_filter(signal, filter_type.clone()))
            .collect()
    }

    /// 并行提取特征
    pub fn extract_features_batch(&self, signals: &[Vec<f64>]) -> Vec<Result<FeatureSet>> {
        use rayon::prelude::*;
        
        signals
            .par_iter()
            .map(|signal| self.processor.extract_features(signal))
            .collect()
    }

    /// 并行异常检测
    pub fn detect_anomalies_batch(
        &self,
        values: &[f64],
        history: &[f64],
        threshold: f64,
    ) -> Vec<AnomalyResult> {
        use rayon::prelude::*;
        
        values
            .par_iter()
            .map(|&value| self.processor.detect_anomaly_zscore(value, history, threshold))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_signal_processor_creation() {
        let processor = SignalProcessor::new(1000.0);
        assert!(processor.is_ok());
        
        let processor = SignalProcessor::new(-1.0);
        assert!(processor.is_err());
    }

    #[test]
    fn test_moving_average() {
        let processor = SignalProcessor::new(1000.0).unwrap();
        let signal = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
        let result = processor.apply_filter(&signal, FilterType::MovingAverage { window_size: 3 });
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), signal.len());
    }

    #[test]
    fn test_statistics() {
        let processor = SignalProcessor::new(1000.0).unwrap();
        let signal = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let stats = processor.calculate_statistics(&signal).unwrap();
        
        assert!((stats.mean - 3.0).abs() < 1e-10);
        assert_eq!(stats.count, 5);
        assert_eq!(stats.min, 1.0);
        assert_eq!(stats.max, 5.0);
    }

    #[test]
    fn test_fft() {
        let processor = SignalProcessor::new(1000.0).unwrap();
        let signal: Vec<f64> = (0..1024)
            .map(|i| (2.0 * PI * 50.0 * i as f64 / 1000.0).sin())
            .collect();
        let result = processor.fft_analysis(&signal);
        assert!(result.is_ok());
        
        let fft = result.unwrap();
        // 主频应该接近 50 Hz
        assert!((fft.dominant_frequency - 50.0).abs() < 5.0);
    }

    #[test]
    fn test_anomaly_detection() {
        let processor = SignalProcessor::new(1000.0).unwrap();
        let history = vec![1.0, 2.0, 3.0, 4.0, 5.0, 4.0, 3.0, 2.0, 1.0, 2.0];
        
        let normal = processor.detect_anomaly_zscore(3.0, &history, 2.0);
        assert!(!normal.is_anomaly);
        
        let anomaly = processor.detect_anomaly_zscore(100.0, &history, 2.0);
        assert!(anomaly.is_anomaly);
    }

    #[test]
    fn test_window_functions() {
        let processor = SignalProcessor::new(1000.0).unwrap();
        let signal = vec![1.0; 100];
        
        let hanning = processor.apply_window(&signal, WindowType::Hanning);
        assert_eq!(hanning.len(), signal.len());
        assert!(hanning[0] < 0.1); // 边缘应该接近 0
        assert!((hanning[50] - 1.0).abs() < 0.1); // 中心应该接近 1
    }
}
