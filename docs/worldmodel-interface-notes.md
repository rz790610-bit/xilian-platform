# WorldModel 接口笔记（Phase 2 实施参考）

## 已有方法
- `predict(currentState, horizon?)` → PredictionResult
- `counterfactual(currentState, parameterChanges, horizon?)` → CounterfactualResult
- `anticipateAnomaly(currentState)` → AnomalyAnticipation
- `simulate(currentState, scenario)` → PredictionResult
- `recordState(state)` → void
- `updatePhysicsParams(params)` → void
- `getStateHistory()` → StateVector[]
- `static getBuiltinScenarios()` → SimulationScenario[]

## 参考代码需要但 WorldModel 缺少的方法
- `generatePhysicsExplanation(params)` → FormulaReference[] — 参考代码需要，WorldModel 有私有方法但签名不同
- `getKeyEquations()` → PhysicsEquation[] — 参考代码需要，WorldModel 没有

## 需要扩展的类型
- `FormulaReference` — 参考代码引用但未定义
- `PhysicsEquation` — 参考代码引用但未定义

## WorldModel 物理方程（可用于方程残差代理）
1. 风载力矩: M_wind = ½ρv²·A·h/2
2. 疲劳增量: Δσ = k × M / W
3. S-N 曲线寿命: N = C / (Δσ)^m
4. 腐蚀速率: r = k·[Cl⁻]·[humidity]
5. 倾覆安全系数: K = M_stab / M_overturn
6. 热传导简化: dT = (I²R - dissipation) × dt/60
7. 振动预测: v_rms = base × wearFactor + noise

## StateVector 结构
```ts
interface StateVector {
  timestamp: number;
  values: Record<string, number>;
}
```

## 异常阈值
- vibrationRms: warning 2.8, critical 4.5 mm/s
- motorCurrentMean: warning 80, critical 100 A
- windSpeedMean: warning 9, critical 13 m/s
- fatigueAccumPercent: warning 60, critical 80 %
- corrosionIndex: warning 0.5, critical 0.7
- temperatureBearing: warning 60, critical 80 °C
- overturningRisk: warning 0.15, critical 0.20
