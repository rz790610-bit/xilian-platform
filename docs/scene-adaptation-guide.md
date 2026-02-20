# 场景适配指南 — 赋能平台 v5.0

## 概述

本平台是**通用工业智能赋能平台**，所有引擎（感知、诊断、护栏、进化）均为场景无关设计。通过配置（而非改代码）适配任何工业场景。

本文档说明如何将平台适配到新的业务场景。

---

## 适配三步法

```
Step 1: 工况配置（定义设备运行阶段和采样策略）
    ↓
Step 2: 知识注入（注册领域知识、物理模型、护栏规则）
    ↓
Step 3: 验证闭环（端到端测试 → 影子评估 → 上线）
```

---

## Step 1: 工况配置

### 1.1 定义工况 Profile

每个场景需要定义一个工况 Profile，描述设备的运行阶段、采样策略和阈值。

```typescript
// server/platform/perception/condition/profiles/my-scene.profile.ts

import type { ConditionProfile } from '../condition-profile-manager';

export const mySceneProfile: ConditionProfile = {
  id: 'my_scene_001',
  name: '场景名称',
  description: '场景描述',
  
  // 运行阶段定义
  phases: [
    {
      name: 'idle',           // 空闲
      samplingRate: 100,      // Hz
      features: ['temperature', 'vibration'],
      retentionPolicy: 'downsample_10x',
    },
    {
      name: 'startup',        // 启动
      samplingRate: 5000,
      features: ['vibration', 'current', 'speed', 'temperature'],
      retentionPolicy: 'keep_all',
    },
    {
      name: 'running',        // 正常运行
      samplingRate: 1000,
      features: ['vibration', 'temperature', 'load', 'speed'],
      retentionPolicy: 'downsample_5x',
    },
    {
      name: 'overload',       // 过载
      samplingRate: 10000,
      features: ['vibration', 'current', 'temperature', 'force', 'speed'],
      retentionPolicy: 'keep_all',
    },
    {
      name: 'shutdown',       // 停机
      samplingRate: 2000,
      features: ['vibration', 'temperature', 'position'],
      retentionPolicy: 'keep_all',
    },
  ],

  // 阈值定义
  thresholds: {
    vibration: { warning: 5.0, critical: 10.0, unit: 'mm/s' },
    temperature: { warning: 60, critical: 80, unit: '°C' },
    load: { warning: 0.85, critical: 0.95, unit: 'ratio' },
    current: { warning: 80, critical: 100, unit: 'A' },
  },

  // 工况自动检测规则
  phaseDetection: {
    method: 'rule_based',  // 'rule_based' | 'ml_based'
    rules: [
      { phase: 'idle', condition: 'speed < 10 && load < 0.05' },
      { phase: 'startup', condition: 'speed_derivative > 100' },
      { phase: 'running', condition: 'speed >= 10 && load >= 0.05 && load < 0.85' },
      { phase: 'overload', condition: 'load >= 0.85' },
      { phase: 'shutdown', condition: 'speed_derivative < -100' },
    ],
  },
};
```

### 1.2 注册协议适配器

根据设备通信协议注册适配器：

```typescript
import { ProtocolAdapterFactory } from '../perception/collection';

// 示例：OPC-UA 设备
ProtocolAdapterFactory.create({
  type: 'opcua',
  config: {
    endpoint: 'opc.tcp://192.168.1.100:4840',
    securityMode: 'SignAndEncrypt',
    nodeMapping: {
      'vibration': 'ns=2;s=Vibration_RMS',
      'temperature': 'ns=2;s=Motor_Temperature',
      'speed': 'ns=2;s=Spindle_Speed',
      'load': 'ns=2;s=Load_Ratio',
    },
  },
});

// 示例：Modbus TCP 设备
ProtocolAdapterFactory.create({
  type: 'modbus',
  config: {
    host: '192.168.1.101',
    port: 502,
    unitId: 1,
    registerMapping: {
      'vibration': { address: 100, type: 'float32', scale: 0.01 },
      'temperature': { address: 102, type: 'int16', scale: 0.1 },
    },
  },
});

// 示例：MQTT 设备
ProtocolAdapterFactory.create({
  type: 'mqtt',
  config: {
    broker: 'mqtt://192.168.1.200:1883',
    topics: {
      'vibration': 'equipment/001/vibration',
      'temperature': 'equipment/001/temperature',
    },
    parseFormat: 'json',  // 'json' | 'csv' | 'binary'
  },
});
```

---

## Step 2: 知识注入

### 2.1 注册护栏规则

```typescript
import { GuardrailEngine } from '../cognition/safety';

const engine = new GuardrailEngine();

// 安全类规则
engine.addRule({
  id: 'my_scene_safety_001',
  category: 'safety',
  name: '过温保护',
  description: '电机温度超过临界值时紧急停机',
  condition: (state) => state.stateVector.temperature > 80,
  action: 'emergency_stop',
  severity: 'critical',
  cooldownMs: 0,
  physicalBasis: '电机绝缘等级 F 级，最高允许温度 155°C，安全裕度 80°C',
});

// 健康类规则
engine.addRule({
  id: 'my_scene_health_001',
  category: 'health',
  name: '轴承寿命预警',
  description: '剩余寿命低于阈值时预警',
  condition: (state) => state.cumulativeIndicators.remainingLifeDays < 30,
  action: 'schedule_maintenance',
  severity: 'warning',
  cooldownMs: 24 * 3600 * 1000, // 24h 冷却
});

// 效率类规则
engine.addRule({
  id: 'my_scene_efficiency_001',
  category: 'efficiency',
  name: '能效偏低',
  description: '能效比低于基线时建议优化',
  condition: (state) => state.stateVector.energyEfficiency < 0.7,
  action: 'suggest_optimization',
  severity: 'info',
  cooldownMs: 4 * 3600 * 1000, // 4h 冷却
});
```

### 2.2 注入知识图谱

```typescript
import { KnowledgeGraph } from '../knowledge/graph';

const kg = new KnowledgeGraph();

// 添加设备-部件-故障知识
kg.addNode({ id: 'motor_001', type: 'equipment', label: '主电机', properties: { model: 'ABB-M3BP', power: '75kW' } });
kg.addNode({ id: 'bearing_001', type: 'component', label: '驱动端轴承', properties: { model: 'SKF-6310', position: 'DE' } });
kg.addNode({ id: 'fault_bearing_wear', type: 'failure', label: '轴承磨损', properties: { mtbf: '18000h' } });
kg.addNode({ id: 'symptom_vibration', type: 'symptom', label: '振动增大', properties: { threshold: '8 mm/s' } });

kg.addEdge({ source: 'motor_001', target: 'bearing_001', relation: 'contains', weight: 1.0 });
kg.addEdge({ source: 'bearing_001', target: 'symptom_vibration', relation: 'manifests_as', weight: 0.85 });
kg.addEdge({ source: 'symptom_vibration', target: 'fault_bearing_wear', relation: 'indicates', weight: 0.78 });
```

### 2.3 注册物理模型

```typescript
import { PhysicsFormulas } from '../contracts/physics-formulas';

const formulas = new PhysicsFormulas();

// 注册场景特定公式
formulas.registerCustomFormula({
  id: 'my_scene_thermal_model',
  name: '电机热模型',
  description: 'T(t) = T_ambient + (P_loss / h*A) * (1 - e^(-t/τ))',
  compute: (params: { ambientTemp: number; powerLoss: number; heatTransferCoeff: number; area: number; timeConstant: number; time: number }) => {
    const { ambientTemp, powerLoss, heatTransferCoeff, area, timeConstant, time } = params;
    return ambientTemp + (powerLoss / (heatTransferCoeff * area)) * (1 - Math.exp(-time / timeConstant));
  },
});
```

### 2.4 注册特征

```typescript
import { FeatureRegistry } from '../knowledge/feature-registry';

const registry = new FeatureRegistry();

registry.register({
  name: 'motor_health_index',
  domain: 'health',
  version: '1.0.0',
  inputDimensions: ['vibration_rms', 'temperature', 'current_rms', 'bearing_frequency'],
  outputType: 'float',
  compute: (inputs) => {
    // 加权综合健康指数
    const weights = { vibration: 0.3, temperature: 0.2, current: 0.2, bearing: 0.3 };
    return 1 - (
      weights.vibration * normalize(inputs.vibration_rms, 0, 15) +
      weights.temperature * normalize(inputs.temperature, 20, 100) +
      weights.current * normalize(inputs.current_rms, 0, 120) +
      weights.bearing * normalize(inputs.bearing_frequency, 0, 500)
    );
  },
});

function normalize(value: number, min: number, max: number): number {
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}
```

---

## Step 3: 验证闭环

### 3.1 单元测试

```typescript
// 使用内置测试框架
import { runPerceptionPipelineTests } from '../testing/perception-pipeline.test';
import { runCognitionEngineTests } from '../testing/cognition-engine.test';

// 运行测试
const perceptionResults = await runPerceptionPipelineTests();
const cognitionResults = await runCognitionEngineTests();

console.log('感知管线:', perceptionResults);
console.log('认知引擎:', cognitionResults);
```

### 3.2 影子评估

```typescript
import { ShadowEvaluator } from '../evolution/shadow';

const evaluator = new ShadowEvaluator();

// 使用历史数据回放验证
const result = await evaluator.evaluate({
  testData: historicalData.map(d => ({
    input: d.stateVector,
    expected: d.actualOutcome,
  })),
  metrics: ['mae', 'rmse', 'precision', 'recall'],
});

console.log('影子评估结果:', result);
```

### 3.3 金丝雀上线

```typescript
import { CanaryDeployer } from '../evolution/canary';

const deployer = new CanaryDeployer();

const deployment = deployer.create({
  modelId: 'my_scene_model_v1',
  initialTrafficPercent: 5,
  maxTrafficPercent: 50,
  stepPercent: 5,
  rollbackThreshold: { errorRate: 0.05, latencyP99Ms: 3000 },
});

// 逐步推进
deployer.advance(deployment.id);  // 5% → 10%
// 观察指标...
deployer.advance(deployment.id);  // 10% → 15%
// ...
```

---

## 场景适配清单

| 步骤 | 配置项 | 必须 | 说明 |
|------|--------|------|------|
| 1.1 | 工况 Profile | ✅ | 定义运行阶段和采样策略 |
| 1.2 | 协议适配器 | ✅ | 接入设备数据源 |
| 2.1 | 护栏规则 | ✅ | 至少定义安全类规则 |
| 2.2 | 知识图谱 | 推荐 | 注入领域知识提升诊断准确率 |
| 2.3 | 物理模型 | 推荐 | 注册场景特定公式 |
| 2.4 | 特征注册 | 推荐 | 注册场景特定特征 |
| 3.1 | 单元测试 | ✅ | 验证配置正确性 |
| 3.2 | 影子评估 | ✅ | 用历史数据验证 |
| 3.3 | 金丝雀上线 | 推荐 | 渐进式上线 |

---

## 已验证场景模板

平台内置以下场景模板，可直接使用或作为参考：

| 场景 | Profile ID | 说明 |
|------|-----------|------|
| 港口岸桥 | `port_quay_crane` | 岸桥周期运行（起升/小车/大车/开闭锁） |
| 制造业 CNC | `manufacturing_cnc` | CNC 加工中心（空闲/切削/换刀） |
| 风力发电 | `wind_turbine` | 风力发电机组（启动/发电/限功率/停机） |
| 通用旋转机械 | `generic_rotating` | 通用旋转设备（启停/运行/过载） |

使用模板：

```typescript
import { ConditionProfileManager } from '../perception/condition';

const manager = new ConditionProfileManager();
const profile = manager.getBuiltinProfile('generic_rotating');
manager.registerProfile(profile);
```
