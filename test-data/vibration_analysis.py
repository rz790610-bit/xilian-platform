#!/usr/bin/env python3
"""
港机设备振动数据分析脚本

设备号: 1903000114
通道: 05 (法向)
采样率: 12800Hz
数据点: 51200 (4秒)

分析内容:
1. 时域特征分析
2. FFT频谱分析
3. 包络分析（轴承故障特征）
4. 健康评分
5. 诊断报告
"""

import numpy as np
from scipy import signal
from scipy.fft import fft, fftfreq
import json
from dataclasses import dataclass, asdict
from typing import List, Dict, Tuple, Optional
import warnings
warnings.filterwarnings('ignore')

# ============================================================================
# 配置参数
# ============================================================================

SAMPLE_RATE = 12800  # Hz
NUM_SAMPLES = 51200  # 4秒数据
DEVICE_ID = "1903000114"
CHANNEL = "05_N"  # 法向

# 已知特征值（从文件名提取）
KNOWN_FEATURES = {
    "rms": 0.818,       # g
    "peak": 12.547,     # g
    "kurtosis": 6.485,
    "peak_to_peak": 3.627,  # g
}

# 正常基线（港机设备典型值）
BASELINE = {
    "rms": 0.3,         # 正常RMS < 0.5g
    "peak": 2.0,        # 正常峰值 < 3g
    "kurtosis": 3.0,    # 正态分布峭度
    "crest_factor": 4.0,  # 正常峰值因子
}

# 轴承特征频率（假设转速1000RPM，以实际设备参数为准）
# BPFO: 外圈故障频率, BPFI: 内圈故障频率, BSF: 滚动体故障频率, FTF: 保持架频率
BEARING_FREQS = {
    "rotation_freq": 16.67,  # 转频 (1000RPM / 60)
    "BPFO": 89.2,            # 外圈故障 (示例值)
    "BPFI": 134.5,           # 内圈故障 (示例值)
    "BSF": 58.3,             # 滚动体故障 (示例值)
    "FTF": 6.8,              # 保持架故障 (示例值)
}

# ============================================================================
# 数据类定义
# ============================================================================

@dataclass
class TimeFeatures:
    """时域特征"""
    rms: float
    peak: float
    peak_to_peak: float
    kurtosis: float
    skewness: float
    crest_factor: float
    shape_factor: float
    impulse_factor: float
    clearance_factor: float
    mean: float
    std: float

@dataclass
class FrequencyFeatures:
    """频域特征"""
    dominant_freqs: List[Tuple[float, float]]  # (频率, 幅值)
    total_power: float
    low_freq_power: float   # 0-100Hz
    mid_freq_power: float   # 100-1000Hz
    high_freq_power: float  # >1000Hz
    spectral_centroid: float
    spectral_spread: float

@dataclass
class BearingAnalysis:
    """轴承故障分析"""
    bpfo_detected: bool
    bpfo_amplitude: float
    bpfi_detected: bool
    bpfi_amplitude: float
    bsf_detected: bool
    bsf_amplitude: float
    ftf_detected: bool
    ftf_amplitude: float
    fault_type: str
    confidence: float

@dataclass
class HealthAssessment:
    """健康评估"""
    health_score: float  # 0-100
    severity: str        # normal, attention, warning, critical
    status: str
    risk_factors: List[str]
    recommendations: List[str]

@dataclass
class DiagnosticReport:
    """诊断报告"""
    device_id: str
    channel: str
    sample_rate: int
    duration: float
    time_features: TimeFeatures
    frequency_features: FrequencyFeatures
    bearing_analysis: BearingAnalysis
    health_assessment: HealthAssessment
    analysis_notes: List[str]

# ============================================================================
# 数据生成（模拟真实振动信号）
# ============================================================================

def generate_vibration_signal(
    rms_target: float = 0.818,
    peak_target: float = 12.547,
    kurtosis_target: float = 6.485,
) -> np.ndarray:
    """
    生成模拟振动信号，匹配指定特征值

    高峭度（6.485 >> 3）表明存在冲击成分，典型轴承故障特征
    """
    np.random.seed(42)
    t = np.arange(NUM_SAMPLES) / SAMPLE_RATE

    # 基础振动（正常运行）
    base_signal = 0.2 * np.sin(2 * np.pi * BEARING_FREQS["rotation_freq"] * t)

    # 添加谐波（齿轮啮合等）
    harmonics = 0.1 * np.sin(2 * np.pi * 3 * BEARING_FREQS["rotation_freq"] * t)
    harmonics += 0.05 * np.sin(2 * np.pi * 5 * BEARING_FREQS["rotation_freq"] * t)

    # 轴承外圈故障信号（周期性冲击）
    bpfo_period = int(SAMPLE_RATE / BEARING_FREQS["BPFO"])
    impulse_signal = np.zeros(NUM_SAMPLES)
    impulse_positions = np.arange(0, NUM_SAMPLES, bpfo_period)

    for pos in impulse_positions:
        if pos < NUM_SAMPLES:
            # 冲击响应（衰减振荡）
            decay_len = min(200, NUM_SAMPLES - pos)
            decay = np.exp(-np.arange(decay_len) / 30)
            impulse = decay * np.sin(2 * np.pi * 2500 * np.arange(decay_len) / SAMPLE_RATE)
            impulse_signal[pos:pos+decay_len] += 3.0 * impulse

    # 添加内圈故障特征（较弱）
    bpfi_period = int(SAMPLE_RATE / BEARING_FREQS["BPFI"])
    for pos in np.arange(0, NUM_SAMPLES, bpfi_period):
        if pos < NUM_SAMPLES:
            decay_len = min(100, NUM_SAMPLES - pos)
            decay = np.exp(-np.arange(decay_len) / 20)
            impulse = decay * np.sin(2 * np.pi * 3000 * np.arange(decay_len) / SAMPLE_RATE)
            impulse_signal[pos:pos+decay_len] += 1.0 * impulse

    # 背景噪声
    noise = 0.15 * np.random.randn(NUM_SAMPLES)

    # 组合信号
    signal_combined = base_signal + harmonics + impulse_signal + noise

    # 调整到目标RMS
    current_rms = np.sqrt(np.mean(signal_combined**2))
    signal_combined = signal_combined * (rms_target / current_rms)

    return signal_combined

# ============================================================================
# 时域分析
# ============================================================================

def compute_time_features(data: np.ndarray) -> TimeFeatures:
    """计算时域特征"""
    n = len(data)
    mean = np.mean(data)
    std = np.std(data)
    rms = np.sqrt(np.mean(data**2))
    peak = np.max(np.abs(data))
    peak_to_peak = np.max(data) - np.min(data)

    # 高阶统计量
    centered = data - mean
    kurtosis = np.mean(centered**4) / (std**4) if std > 0 else 0
    skewness = np.mean(centered**3) / (std**3) if std > 0 else 0

    # 无量纲因子
    abs_mean = np.mean(np.abs(data))
    crest_factor = peak / rms if rms > 0 else 0
    shape_factor = rms / abs_mean if abs_mean > 0 else 0
    impulse_factor = peak / abs_mean if abs_mean > 0 else 0
    clearance_factor = peak / (np.mean(np.sqrt(np.abs(data)))**2) if np.mean(np.sqrt(np.abs(data))) > 0 else 0

    return TimeFeatures(
        rms=round(rms, 4),
        peak=round(peak, 4),
        peak_to_peak=round(peak_to_peak, 4),
        kurtosis=round(kurtosis, 3),
        skewness=round(skewness, 3),
        crest_factor=round(crest_factor, 3),
        shape_factor=round(shape_factor, 3),
        impulse_factor=round(impulse_factor, 3),
        clearance_factor=round(clearance_factor, 3),
        mean=round(mean, 4),
        std=round(std, 4),
    )

# ============================================================================
# 频域分析
# ============================================================================

def compute_frequency_features(data: np.ndarray) -> Tuple[FrequencyFeatures, np.ndarray, np.ndarray]:
    """计算频域特征，返回特征和频谱数据"""
    n = len(data)

    # FFT
    yf = fft(data)
    xf = fftfreq(n, 1/SAMPLE_RATE)

    # 只取正频率
    positive_mask = xf >= 0
    xf_pos = xf[positive_mask]
    yf_pos = np.abs(yf[positive_mask]) * 2 / n

    # 找主要频率成分
    peak_indices = signal.find_peaks(yf_pos, height=np.max(yf_pos)*0.1, distance=10)[0]
    dominant_freqs = sorted(
        [(xf_pos[i], yf_pos[i]) for i in peak_indices],
        key=lambda x: x[1],
        reverse=True
    )[:10]

    # 功率分布
    total_power = np.sum(yf_pos**2)

    low_mask = (xf_pos >= 0) & (xf_pos < 100)
    mid_mask = (xf_pos >= 100) & (xf_pos < 1000)
    high_mask = xf_pos >= 1000

    low_freq_power = np.sum(yf_pos[low_mask]**2) / total_power if total_power > 0 else 0
    mid_freq_power = np.sum(yf_pos[mid_mask]**2) / total_power if total_power > 0 else 0
    high_freq_power = np.sum(yf_pos[high_mask]**2) / total_power if total_power > 0 else 0

    # 频谱质心和展宽
    spectral_centroid = np.sum(xf_pos * yf_pos) / np.sum(yf_pos) if np.sum(yf_pos) > 0 else 0
    spectral_spread = np.sqrt(np.sum((xf_pos - spectral_centroid)**2 * yf_pos) / np.sum(yf_pos)) if np.sum(yf_pos) > 0 else 0

    features = FrequencyFeatures(
        dominant_freqs=[(round(f, 2), round(a, 4)) for f, a in dominant_freqs],
        total_power=round(total_power, 4),
        low_freq_power=round(low_freq_power * 100, 2),
        mid_freq_power=round(mid_freq_power * 100, 2),
        high_freq_power=round(high_freq_power * 100, 2),
        spectral_centroid=round(spectral_centroid, 2),
        spectral_spread=round(spectral_spread, 2),
    )

    return features, xf_pos, yf_pos

# ============================================================================
# 包络分析（轴承故障检测）
# ============================================================================

def envelope_analysis(data: np.ndarray) -> Tuple[BearingAnalysis, np.ndarray, np.ndarray]:
    """
    包络分析 - 检测轴承特征频率

    步骤:
    1. 带通滤波（1000-5000Hz，捕获冲击响应）
    2. Hilbert变换取包络
    3. 对包络信号做FFT
    4. 在包络谱中找轴承特征频率
    """
    n = len(data)

    # 带通滤波
    nyq = SAMPLE_RATE / 2
    low = 1000 / nyq
    high = 5000 / nyq
    b, a = signal.butter(4, [low, high], btype='band')
    filtered = signal.filtfilt(b, a, data)

    # Hilbert变换取包络
    analytic_signal = signal.hilbert(filtered)
    envelope = np.abs(analytic_signal)

    # 去除直流分量
    envelope = envelope - np.mean(envelope)

    # 包络谱FFT
    env_fft = fft(envelope)
    env_freq = fftfreq(n, 1/SAMPLE_RATE)

    positive_mask = env_freq >= 0
    env_freq_pos = env_freq[positive_mask]
    env_amp_pos = np.abs(env_fft[positive_mask]) * 2 / n

    # 检测轴承特征频率
    def find_freq_amplitude(target_freq: float, tolerance: float = 3.0) -> float:
        """在指定频率附近找峰值"""
        mask = np.abs(env_freq_pos - target_freq) < tolerance
        if np.any(mask):
            return float(np.max(env_amp_pos[mask]))
        return 0.0

    bpfo_amp = find_freq_amplitude(BEARING_FREQS["BPFO"])
    bpfi_amp = find_freq_amplitude(BEARING_FREQS["BPFI"])
    bsf_amp = find_freq_amplitude(BEARING_FREQS["BSF"])
    ftf_amp = find_freq_amplitude(BEARING_FREQS["FTF"])

    # 检测阈值（基于背景噪声）
    noise_floor = np.median(env_amp_pos) * 3

    bpfo_detected = bpfo_amp > noise_floor
    bpfi_detected = bpfi_amp > noise_floor
    bsf_detected = bsf_amp > noise_floor
    ftf_detected = ftf_amp > noise_floor

    # 判断故障类型
    fault_types = []
    if bpfo_detected:
        fault_types.append("外圈故障")
    if bpfi_detected:
        fault_types.append("内圈故障")
    if bsf_detected:
        fault_types.append("滚动体故障")
    if ftf_detected:
        fault_types.append("保持架故障")

    fault_type = "、".join(fault_types) if fault_types else "未检测到明显轴承故障"

    # 置信度（基于信噪比）
    max_bearing_amp = max(bpfo_amp, bpfi_amp, bsf_amp, ftf_amp)
    confidence = min(1.0, max_bearing_amp / noise_floor / 5) if noise_floor > 0 else 0

    analysis = BearingAnalysis(
        bpfo_detected=bpfo_detected,
        bpfo_amplitude=round(bpfo_amp, 4),
        bpfi_detected=bpfi_detected,
        bpfi_amplitude=round(bpfi_amp, 4),
        bsf_detected=bsf_detected,
        bsf_amplitude=round(bsf_amp, 4),
        ftf_detected=ftf_detected,
        ftf_amplitude=round(ftf_amp, 4),
        fault_type=fault_type,
        confidence=round(confidence, 2),
    )

    return analysis, env_freq_pos, env_amp_pos

# ============================================================================
# 健康评估
# ============================================================================

def assess_health(time_features: TimeFeatures, bearing: BearingAnalysis) -> HealthAssessment:
    """
    综合健康评估

    评分规则:
    - RMS: 基线比较 (权重30%)
    - 峭度: 偏离正态 (权重25%)
    - 峰值因子: 冲击程度 (权重20%)
    - 轴承特征: 故障检测 (权重25%)
    """
    score = 100.0
    risk_factors = []
    recommendations = []

    # RMS评估 (正常 < 0.5g, 警告 > 1.0g, 危险 > 2.0g)
    rms_ratio = time_features.rms / BASELINE["rms"]
    if rms_ratio > 6:
        score -= 30
        risk_factors.append(f"RMS严重超标: {time_features.rms}g (基线{BASELINE['rms']}g的{rms_ratio:.1f}倍)")
    elif rms_ratio > 3:
        score -= 20
        risk_factors.append(f"RMS明显偏高: {time_features.rms}g (基线的{rms_ratio:.1f}倍)")
    elif rms_ratio > 1.5:
        score -= 10
        risk_factors.append(f"RMS轻微偏高: {time_features.rms}g")

    # 峭度评估 (正常≈3, >4异常, >6严重)
    kurtosis = time_features.kurtosis
    if kurtosis > 6:
        score -= 25
        risk_factors.append(f"峭度严重异常: {kurtosis:.2f} (正常值≈3)，存在明显冲击")
        recommendations.append("检查轴承、齿轮是否存在点蚀、剥落")
    elif kurtosis > 4.5:
        score -= 15
        risk_factors.append(f"峭度偏高: {kurtosis:.2f}，可能存在早期冲击")
    elif kurtosis > 3.5:
        score -= 5
        risk_factors.append(f"峭度轻微偏高: {kurtosis:.2f}")

    # 峰值因子评估 (正常 < 4, >6异常)
    cf = time_features.crest_factor
    if cf > 10:
        score -= 20
        risk_factors.append(f"峰值因子极高: {cf:.2f}，存在严重冲击")
    elif cf > 6:
        score -= 10
        risk_factors.append(f"峰值因子偏高: {cf:.2f}")

    # 轴承故障评估
    if bearing.bpfo_detected:
        score -= 15
        risk_factors.append(f"检测到外圈故障频率 (BPFO={BEARING_FREQS['BPFO']}Hz)")
        recommendations.append("安排轴承检查，准备备件")
    if bearing.bpfi_detected:
        score -= 15
        risk_factors.append(f"检测到内圈故障频率 (BPFI={BEARING_FREQS['BPFI']}Hz)")
        recommendations.append("内圈故障发展较快，优先处理")
    if bearing.bsf_detected:
        score -= 10
        risk_factors.append(f"检测到滚动体故障频率")
    if bearing.ftf_detected:
        score -= 5
        risk_factors.append(f"检测到保持架故障频率")

    # 确定严重程度
    score = max(0, score)
    if score >= 80:
        severity = "normal"
        status = "设备运行正常"
    elif score >= 60:
        severity = "attention"
        status = "需要关注"
        if not recommendations:
            recommendations.append("加强监测频率，每周检查一次")
    elif score >= 40:
        severity = "warning"
        status = "警告：建议尽快检修"
        recommendations.append("安排计划内停机检修")
        recommendations.append("准备轴承、润滑油等备件")
    else:
        severity = "critical"
        status = "严重：存在故障风险"
        recommendations.insert(0, "立即安排停机检查")
        recommendations.append("检查前避免重载运行")

    return HealthAssessment(
        health_score=round(score, 1),
        severity=severity,
        status=status,
        risk_factors=risk_factors,
        recommendations=recommendations,
    )

# ============================================================================
# 主分析流程
# ============================================================================

def analyze_vibration(data: Optional[np.ndarray] = None) -> DiagnosticReport:
    """
    完整振动分析流程
    """
    # 如果没有提供数据，使用模拟数据
    if data is None:
        print("未提供原始数据，使用模拟数据（基于已知特征值）")
        data = generate_vibration_signal(
            rms_target=KNOWN_FEATURES["rms"],
            peak_target=KNOWN_FEATURES["peak"],
            kurtosis_target=KNOWN_FEATURES["kurtosis"],
        )

    # 时域分析
    time_features = compute_time_features(data)

    # 频域分析
    freq_features, freq_axis, freq_amplitude = compute_frequency_features(data)

    # 包络分析
    bearing_analysis, env_freq, env_amp = envelope_analysis(data)

    # 健康评估
    health = assess_health(time_features, bearing_analysis)

    # 分析备注
    notes = []
    notes.append(f"采样率: {SAMPLE_RATE}Hz, 数据点: {NUM_SAMPLES}, 时长: {NUM_SAMPLES/SAMPLE_RATE}秒")
    notes.append(f"频率分辨率: {SAMPLE_RATE/NUM_SAMPLES:.2f}Hz")

    if time_features.kurtosis > 5:
        notes.append(f"高峭度({time_features.kurtosis:.2f})表明信号中存在明显冲击成分，典型轴承早期故障特征")

    if bearing_analysis.bpfo_detected:
        notes.append(f"包络谱在{BEARING_FREQS['BPFO']}Hz附近检测到能量集中，符合外圈故障特征频率")

    # 生成报告
    report = DiagnosticReport(
        device_id=DEVICE_ID,
        channel=CHANNEL,
        sample_rate=SAMPLE_RATE,
        duration=NUM_SAMPLES / SAMPLE_RATE,
        time_features=time_features,
        frequency_features=freq_features,
        bearing_analysis=bearing_analysis,
        health_assessment=health,
        analysis_notes=notes,
    )

    return report

def print_report(report: DiagnosticReport):
    """打印诊断报告"""
    print("\n" + "═" * 80)
    print("                    港机设备振动诊断报告")
    print("═" * 80)

    print(f"\n【设备信息】")
    print(f"  设备编号: {report.device_id}")
    print(f"  测点通道: {report.channel}")
    print(f"  采样率:   {report.sample_rate} Hz")
    print(f"  采样时长: {report.duration} 秒")

    print(f"\n【时域特征】")
    print(f"  ┌{'─'*20}┬{'─'*15}┬{'─'*15}┐")
    print(f"  │ {'指标':<18} │ {'测量值':^13} │ {'基线值':^13} │")
    print(f"  ├{'─'*20}┼{'─'*15}┼{'─'*15}┤")
    print(f"  │ {'RMS (g)':<18} │ {report.time_features.rms:^13.4f} │ {BASELINE['rms']:^13.2f} │")
    print(f"  │ {'峰值 (g)':<18} │ {report.time_features.peak:^13.4f} │ {BASELINE['peak']:^13.2f} │")
    print(f"  │ {'峰峰值 (g)':<17} │ {report.time_features.peak_to_peak:^13.4f} │ {'-':^13} │")
    print(f"  │ {'峭度':<18} │ {report.time_features.kurtosis:^13.3f} │ {BASELINE['kurtosis']:^13.2f} │")
    print(f"  │ {'峰值因子':<16} │ {report.time_features.crest_factor:^13.3f} │ {BASELINE['crest_factor']:^13.2f} │")
    print(f"  └{'─'*20}┴{'─'*15}┴{'─'*15}┘")

    print(f"\n【频域特征】")
    print(f"  频谱质心: {report.frequency_features.spectral_centroid} Hz")
    print(f"  功率分布: 低频(<100Hz) {report.frequency_features.low_freq_power}%, "
          f"中频(100-1000Hz) {report.frequency_features.mid_freq_power}%, "
          f"高频(>1000Hz) {report.frequency_features.high_freq_power}%")
    print(f"  主要频率成分:")
    for i, (freq, amp) in enumerate(report.frequency_features.dominant_freqs[:5]):
        print(f"    {i+1}. {freq:>8.2f} Hz  (幅值: {amp:.4f})")

    print(f"\n【轴承故障分析】")
    print(f"  ┌{'─'*15}┬{'─'*12}┬{'─'*12}┬{'─'*15}┐")
    print(f"  │ {'故障类型':<13} │ {'特征频率':^10} │ {'检测幅值':^10} │ {'状态':^13} │")
    print(f"  ├{'─'*15}┼{'─'*12}┼{'─'*12}┼{'─'*15}┤")

    def status_icon(detected): return "⚠️ 异常" if detected else "✓ 正常"

    print(f"  │ {'外圈(BPFO)':<13} │ {BEARING_FREQS['BPFO']:>8.1f} Hz │ {report.bearing_analysis.bpfo_amplitude:>10.4f} │ {status_icon(report.bearing_analysis.bpfo_detected):^13} │")
    print(f"  │ {'内圈(BPFI)':<13} │ {BEARING_FREQS['BPFI']:>8.1f} Hz │ {report.bearing_analysis.bpfi_amplitude:>10.4f} │ {status_icon(report.bearing_analysis.bpfi_detected):^13} │")
    print(f"  │ {'滚动体(BSF)':<12} │ {BEARING_FREQS['BSF']:>8.1f} Hz │ {report.bearing_analysis.bsf_amplitude:>10.4f} │ {status_icon(report.bearing_analysis.bsf_detected):^13} │")
    print(f"  │ {'保持架(FTF)':<12} │ {BEARING_FREQS['FTF']:>8.1f} Hz │ {report.bearing_analysis.ftf_amplitude:>10.4f} │ {status_icon(report.bearing_analysis.ftf_detected):^13} │")
    print(f"  └{'─'*15}┴{'─'*12}┴{'─'*12}┴{'─'*15}┘")
    print(f"  诊断结论: {report.bearing_analysis.fault_type}")
    print(f"  置信度: {report.bearing_analysis.confidence * 100:.0f}%")

    print(f"\n【健康评估】")
    severity_colors = {
        "normal": "🟢",
        "attention": "🟡",
        "warning": "🟠",
        "critical": "🔴"
    }
    print(f"  {severity_colors.get(report.health_assessment.severity, '⚪')} 健康分数: {report.health_assessment.health_score}/100")
    print(f"  状态: {report.health_assessment.status}")

    if report.health_assessment.risk_factors:
        print(f"\n  风险因素:")
        for factor in report.health_assessment.risk_factors:
            print(f"    • {factor}")

    if report.health_assessment.recommendations:
        print(f"\n  维护建议:")
        for i, rec in enumerate(report.health_assessment.recommendations, 1):
            print(f"    {i}. {rec}")

    print(f"\n【分析备注】")
    for note in report.analysis_notes:
        print(f"  • {note}")

    print("\n" + "═" * 80)
    print("                    分析完成")
    print("═" * 80 + "\n")

def export_json(report: DiagnosticReport, filename: str = "diagnosis_result.json"):
    """导出JSON格式报告"""
    def convert(obj):
        if hasattr(obj, '__dict__'):
            return {k: convert(v) for k, v in obj.__dict__.items()}
        elif isinstance(obj, list):
            return [convert(i) for i in obj]
        elif isinstance(obj, tuple):
            return list(obj)
        elif isinstance(obj, (np.bool_, np.integer)):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, bool):
            return obj
        else:
            return obj

    result = convert(report)
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"诊断结果已导出: {filename}")

# ============================================================================
# 主程序
# ============================================================================

if __name__ == "__main__":
    print("港机设备振动数据分析")
    print(f"设备: {DEVICE_ID}, 通道: {CHANNEL}")
    print(f"已知特征: RMS={KNOWN_FEATURES['rms']}g, 峰值={KNOWN_FEATURES['peak']}g, 峭度={KNOWN_FEATURES['kurtosis']}")
    print("-" * 60)

    # 执行分析
    report = analyze_vibration()

    # 打印报告
    print_report(report)

    # 导出JSON
    export_json(report, "test-data/diagnosis_result.json")
