// server/platform/cognition/hde/physics/physics-parameter-calculator.ts
// HDE Layer1 物理参数计算器（ISO 15243:2017 标准）

export interface BearingGeometry {
  ballCount: number;        // 滚珠数量 Z
  pitchDiameter: number;    // 节圆直径 Dm (mm)
  ballDiameter: number;     // 滚珠直径 Bd (mm)
  contactAngle: number;     // 接触角 θ (degrees)
}

export interface PhysicalParameters {
  bpfo: number;             // 外圈缺陷频率 Hz（需乘以转速）
  bpfi: number;             // 内圈缺陷频率 Hz（需乘以转速）
  bsf: number;              // 滚动体自旋频率 Hz
  ftf: number;              // 保持架旋转频率 Hz
  meshFreqFactor: number;   // 齿轮啮合频率倍数
  snCurveParams?: SNParams;
}

export interface SNParams {
  enduranceLimit: number;   // 疲劳极限 MPa
  slopeFactor: number;      // S-N曲线斜率
  dailyCycles: number;      // 每日循环次数
}

export class PhysicsParameterCalculator {
  /**
   * 计算BPFO/BPFI等轴承特征频率
   * 公式来源：ISO 15243:2017 轴承故障诊断标准
   */
  calculateBearingFrequencies(
    geometry: BearingGeometry,
    rotationSpeedRPM: number
  ): PhysicalParameters {
    const { ballCount: Z, pitchDiameter: Dm, ballDiameter: Bd, contactAngle } = geometry;
    const θ = (contactAngle * Math.PI) / 180;
    const shaftFreq = rotationSpeedRPM / 60;
    const ratio = (Bd / Dm) * Math.cos(θ);

    return {
      bpfo: (Z / 2) * shaftFreq * (1 - ratio),
      bpfi: (Z / 2) * shaftFreq * (1 + ratio),
      bsf: (Dm / (2 * Bd)) * shaftFreq * (1 - ratio ** 2),
      ftf: 0.5 * shaftFreq * (1 - ratio),
      meshFreqFactor: Z,
    };
  }

  /**
   * 计算S-N疲劳曲线剩余寿命（Miner线性累积损伤法则）
   */
  calculateRemainingLife(
    currentStressAmplitude: number,
    snParams: SNParams,
    accumulatedDamage: number
  ): { remainingDamageRatio: number; estimatedDaysLeft: number } {
    const remainingDamageRatio = Math.max(0, 1 - accumulatedDamage);
    const cyclesAtCurrentStress = snParams.enduranceLimit / currentStressAmplitude;
    const estimatedDaysLeft = Math.round(remainingDamageRatio * cyclesAtCurrentStress / snParams.dailyCycles);
    return { remainingDamageRatio, estimatedDaysLeft };
  }
}
