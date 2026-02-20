/**
 * ============================================================================
 * 数字孪生引擎 (Digital Twin Engine)
 * ============================================================================
 *
 * 设备数字孪生核心能力：
 *   1. 状态同步：实时同步物理设备状态到数字模型
 *   2. 历史回放：回放任意时间段的设备运行状态
 *   3. 仿真预测：基于当前状态预测未来轨迹
 *   4. 场景模拟：模拟极端工况（高风/重载/故障注入）
 *   5. 优化建议：基于仿真结果生成运行优化建议
 *
 * 孪生模型层级：
 *   L1 — 几何孪生：3D 模型 + 位姿
 *   L2 — 物理孪生：力学/热学/电气模型
 *   L3 — 行为孪生：运行逻辑 + 控制策略
 *   L4 — 认知孪生：诊断 + 预测 + 自优化
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface TwinState {
  twinId: string;
  machineId: string;
  timestamp: number;
  /** L1: 位姿状态 */
  pose: {
    boomAngle: number;       // 臂架角度 (°)
    trolleyPosition: number; // 小车位置 (m)
    hoistHeight: number;     // 起升高度 (m)
    gantryPosition: number;  // 大车位置 (m)
    spreaderState: string;   // 吊具状态
  };
  /** L2: 物理状态 */
  physics: {
    windLoadMoment: number;  // 风载力矩 (kN·m)
    totalBendingMoment: number; // 总弯矩 (kN·m)
    fatigueStress: number;   // 疲劳应力 (MPa)
    bearingTemperature: number; // 轴承温度 (°C)
    motorPower: number;      // 电机功率 (kW)
    structuralStress: number; // 结构应力 (MPa)
  };
  /** L3: 行为状态 */
  behavior: {
    cyclePhase: string;      // 周期阶段
    operationMode: string;   // 运行模式
    controllerState: string; // 控制器状态
    safetyInterlocks: string[]; // 安全联锁状态
  };
  /** L4: 认知状态 */
  cognition: {
    safetyScore: number;
    healthScore: number;
    efficiencyScore: number;
    riskLevel: string;
    activeAlerts: string[];
    predictions: { metric: string; value: number; horizon: string }[];
  };
}

export interface SimulationScenario {
  scenarioId: string;
  name: string;
  description: string;
  /** 初始状态覆盖 */
  initialOverrides: Partial<TwinState>;
  /** 环境条件 */
  environment: {
    windSpeed: number;
    windDirection: number;
    temperature: number;
    humidity: number;
    seaState: number;
  };
  /** 操作序列 */
  operations: {
    timestamp: number;
    action: string;
    parameters: Record<string, number>;
  }[];
  /** 故障注入 */
  faultInjections: {
    timestamp: number;
    component: string;
    faultType: string;
    severity: number;
  }[];
  /** 仿真时长 (秒) */
  durationSeconds: number;
  /** 时间步长 (秒) */
  timeStepSeconds: number;
}

export interface SimulationResult {
  scenarioId: string;
  executionId: string;
  /** 状态轨迹 */
  trajectory: TwinState[];
  /** 关键事件 */
  events: {
    timestamp: number;
    type: 'alert' | 'fault' | 'threshold_breach' | 'optimization';
    description: string;
    severity: string;
  }[];
  /** 统计摘要 */
  summary: {
    maxStress: number;
    maxTemperature: number;
    totalFatigueIncrement: number;
    averageEfficiency: number;
    safetyViolations: number;
    totalEnergy: number;
  };
  /** 优化建议 */
  optimizations: {
    parameter: string;
    currentValue: number;
    suggestedValue: number;
    expectedImprovement: string;
    rationale: string;
  }[];
  durationMs: number;
}

export interface ReplayRequest {
  machineId: string;
  startTime: number;
  endTime: number;
  /** 回放速度倍率 */
  speedMultiplier: number;
  /** 关注维度 */
  focusDimensions: string[];
}

// ============================================================================
// 数字孪生引擎
// ============================================================================

export class DigitalTwinEngine {
  private twins: Map<string, TwinState> = new Map();
  private stateHistory: Map<string, TwinState[]> = new Map();
  private maxHistoryPerTwin: number = 10000;

  /**
   * 创建数字孪生
   */
  createTwin(machineId: string, initialState?: Partial<TwinState>): TwinState {
    const twinId = `twin_${machineId}`;
    const state: TwinState = {
      twinId,
      machineId,
      timestamp: Date.now(),
      pose: {
        boomAngle: 0, trolleyPosition: 0, hoistHeight: 0,
        gantryPosition: 0, spreaderState: 'closed',
        ...initialState?.pose,
      },
      physics: {
        windLoadMoment: 0, totalBendingMoment: 0, fatigueStress: 0,
        bearingTemperature: 25, motorPower: 0, structuralStress: 0,
        ...initialState?.physics,
      },
      behavior: {
        cyclePhase: 'idle', operationMode: 'normal',
        controllerState: 'ready', safetyInterlocks: [],
        ...initialState?.behavior,
      },
      cognition: {
        safetyScore: 1, healthScore: 1, efficiencyScore: 1,
        riskLevel: 'safe', activeAlerts: [], predictions: [],
        ...initialState?.cognition,
      },
    };

    this.twins.set(twinId, state);
    this.stateHistory.set(twinId, [state]);
    return state;
  }

  /**
   * 同步状态（从物理设备到数字孪生）
   */
  syncState(machineId: string, update: Partial<TwinState>): TwinState | null {
    const twinId = `twin_${machineId}`;
    const current = this.twins.get(twinId);
    if (!current) return null;

    const updated: TwinState = {
      ...current,
      timestamp: Date.now(),
      pose: { ...current.pose, ...update.pose },
      physics: { ...current.physics, ...update.physics },
      behavior: { ...current.behavior, ...update.behavior },
      cognition: { ...current.cognition, ...update.cognition },
    };

    this.twins.set(twinId, updated);

    // 记录历史
    const history = this.stateHistory.get(twinId) || [];
    history.push(updated);
    if (history.length > this.maxHistoryPerTwin) {
      history.splice(0, history.length - this.maxHistoryPerTwin);
    }
    this.stateHistory.set(twinId, history);

    return updated;
  }

  /**
   * 运行仿真
   */
  async simulate(scenario: SimulationScenario): Promise<SimulationResult> {
    const startTime = Date.now();
    const executionId = `sim_${scenario.scenarioId}_${Date.now()}`;
    const trajectory: TwinState[] = [];
    const events: SimulationResult['events'] = [];

    // 初始化仿真状态
    let state = this.createTwin(`sim_${scenario.scenarioId}`, scenario.initialOverrides);
    trajectory.push({ ...state });

    const totalSteps = Math.ceil(scenario.durationSeconds / scenario.timeStepSeconds);
    let totalFatigue = 0;
    let totalEnergy = 0;
    let maxStress = 0;
    let maxTemp = 0;
    let safetyViolations = 0;
    let efficiencySum = 0;

    for (let step = 0; step < totalSteps; step++) {
      const simTime = step * scenario.timeStepSeconds;

      // 应用环境条件
      const windSpeed = scenario.environment.windSpeed * (1 + 0.1 * Math.sin(simTime / 60));

      // 计算物理状态
      const rho = 1.225;
      const A = 120; // 迎风面积
      const h = 45;  // 臂架高度
      const windMoment = 0.5 * rho * windSpeed * windSpeed * A * h / 2;

      // 检查操作序列
      const currentOp = scenario.operations.find(op =>
        op.timestamp <= simTime && op.timestamp + scenario.timeStepSeconds > simTime
      );

      // 检查故障注入
      const currentFault = scenario.faultInjections.find(f =>
        f.timestamp <= simTime && f.timestamp + 60 > simTime
      );

      // 更新物理状态
      const motorPower = currentOp ? (currentOp.parameters['power'] || 50) : 10;
      const bearingTemp = state.physics.bearingTemperature +
        (motorPower * 0.01 - (state.physics.bearingTemperature - scenario.environment.temperature) * 0.005) *
        scenario.timeStepSeconds;

      const fatigueStress = 2.5 * windMoment / (0.05 * 1e6);
      totalFatigue += fatigueStress * scenario.timeStepSeconds / 3600;
      totalEnergy += motorPower * scenario.timeStepSeconds / 3600;
      maxStress = Math.max(maxStress, fatigueStress);
      maxTemp = Math.max(maxTemp, bearingTemp);

      // 故障影响
      let faultMultiplier = 1;
      if (currentFault) {
        faultMultiplier = 1 + currentFault.severity;
        events.push({
          timestamp: simTime,
          type: 'fault',
          description: `故障注入：${currentFault.component} - ${currentFault.faultType}`,
          severity: currentFault.severity > 0.5 ? 'high' : 'medium',
        });
      }

      // 安全检查
      const safetyScore = Math.max(0, 1 - (windMoment / 50000) * faultMultiplier);
      if (safetyScore < 0.5) {
        safetyViolations++;
        events.push({
          timestamp: simTime,
          type: 'threshold_breach',
          description: `安全分数低于阈值：${safetyScore.toFixed(2)}`,
          severity: safetyScore < 0.3 ? 'critical' : 'warning',
        });
      }

      const efficiency = Math.max(0, 1 - motorPower / 200);
      efficiencySum += efficiency;

      // 更新状态
      state = {
        ...state,
        timestamp: Date.now(),
        physics: {
          ...state.physics,
          windLoadMoment: windMoment / 1000,
          fatigueStress,
          bearingTemperature: bearingTemp,
          motorPower,
          structuralStress: fatigueStress * faultMultiplier,
          totalBendingMoment: windMoment / 1000,
        },
        cognition: {
          ...state.cognition,
          safetyScore,
          healthScore: Math.max(0, 1 - totalFatigue / 100),
          efficiencyScore: efficiency,
          riskLevel: safetyScore < 0.3 ? 'danger' : safetyScore < 0.6 ? 'warning' : 'safe',
        },
      };

      // 每 10 步记录一次轨迹
      if (step % 10 === 0) {
        trajectory.push({ ...state });
      }
    }

    // 生成优化建议
    const optimizations: SimulationResult['optimizations'] = [];

    if (maxStress > 5) {
      optimizations.push({
        parameter: '运行速度',
        currentValue: 100,
        suggestedValue: 80,
        expectedImprovement: '疲劳增速降低 36%',
        rationale: `最大应力 ${maxStress.toFixed(2)} MPa 偏高，限速可有效降低`,
      });
    }

    if (maxTemp > 60) {
      optimizations.push({
        parameter: '冷却间隔',
        currentValue: 0,
        suggestedValue: 300,
        expectedImprovement: '轴承温度降低 15°C',
        rationale: `最高温度 ${maxTemp.toFixed(1)}°C 超过建议值，增加冷却间隔`,
      });
    }

    if (safetyViolations > 0) {
      optimizations.push({
        parameter: '风速限制',
        currentValue: scenario.environment.windSpeed,
        suggestedValue: Math.min(scenario.environment.windSpeed, 9),
        expectedImprovement: `消除 ${safetyViolations} 次安全违规`,
        rationale: '高风速条件下应限制作业',
      });
    }

    return {
      scenarioId: scenario.scenarioId,
      executionId,
      trajectory,
      events,
      summary: {
        maxStress,
        maxTemperature: maxTemp,
        totalFatigueIncrement: totalFatigue,
        averageEfficiency: efficiencySum / totalSteps,
        safetyViolations,
        totalEnergy,
      },
      optimizations,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 历史回放
   */
  replay(request: ReplayRequest): TwinState[] {
    const twinId = `twin_${request.machineId}`;
    const history = this.stateHistory.get(twinId) || [];

    return history.filter(s =>
      s.timestamp >= request.startTime && s.timestamp <= request.endTime
    );
  }

  /**
   * 获取当前孪生状态
   */
  getState(machineId: string): TwinState | null {
    return this.twins.get(`twin_${machineId}`) || null;
  }

  /**
   * 获取所有孪生
   */
  getAllTwins(): TwinState[] {
    return Array.from(this.twins.values());
  }

  /**
   * 获取统计
   */
  getStats(): { twinCount: number; totalHistoryPoints: number } {
    let totalHistory = 0;
    for (const history of this.stateHistory.values()) {
      totalHistory += history.length;
    }
    return { twinCount: this.twins.size, totalHistoryPoints: totalHistory };
  }
}
