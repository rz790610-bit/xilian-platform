# API 参考文档 — 赋能平台 v5.0

## 概述

所有 API 通过 tRPC 暴露，按 8 个 Bounded Context 组织。客户端使用 tRPC client 调用，支持类型安全。

---

## 1. 感知域 (Perception)

### perception.startCollection
启动指定设备的数据采集。

```typescript
input: {
  equipmentId: string;
  profileId?: string;     // 工况配置ID，不传则自动检测
  overrides?: {
    samplingRateHz?: number;
    enabledSensors?: string[];
  };
}
output: {
  sessionId: string;
  status: 'started' | 'already_running';
  effectiveProfile: string;
}
```

### perception.stopCollection
停止指定设备的数据采集。

```typescript
input: { equipmentId: string }
output: { status: 'stopped'; collectedSamples: number; duration: number }
```

### perception.getStateVector
获取设备最新状态向量（21维）。

```typescript
input: { equipmentId: string }
output: {
  vector: number[];           // 21维状态向量
  timestamp: number;
  uncertaintyScore: number;   // 总不确定性
  dominantUncertainty: string;
}
```

### perception.listProfiles
列出所有工况配置。

```typescript
input: { page?: number; pageSize?: number }
output: {
  profiles: Array<{
    id: string; name: string; description: string;
    phaseCount: number; createdAt: string;
  }>;
  total: number;
}
```

### perception.createProfile
创建新的工况配置。

```typescript
input: {
  name: string;
  description: string;
  phases: Array<{
    name: string;
    samplingRate: number;
    features: string[];
    duration?: number;
  }>;
  thresholds: Record<string, { warning: number; critical: number }>;
}
output: { id: string; status: 'created' }
```

---

## 2. 认知域 (Cognition)

### cognition.diagnose
触发设备诊断（四维融合 + Grok 推理）。

```typescript
input: {
  equipmentId: string;
  triggerType: 'manual' | 'anomaly' | 'scheduled';
  depth?: 'quick' | 'standard' | 'deep';  // 默认 standard
}
output: {
  sessionId: string;
  report: {
    safetyScore: number;
    healthScore: number;
    efficiencyScore: number;
    remainingLifeDays: number;
    topIssues: Array<{ type: string; description: string; severity: string; confidence: number }>;
    recommendations: Array<{ action: string; priority: string; deadline: string }>;
    reasoningChain: Array<{ step: number; type: string; content: string; tool: string; durationMs: number }>;
  };
}
```

### cognition.getReasoningChain
获取 Grok 推理链详情。

```typescript
input: { sessionId: string }
output: {
  steps: Array<{
    step: number; type: 'observation' | 'reasoning' | 'action';
    content: string; tool: string; durationMs: number;
  }>;
  mermaidDiagram: string;
  stats: { totalDurationMs: number; toolCallCount: number; stepCount: number };
}
```

### cognition.predictState
WorldModel 状态预测。

```typescript
input: {
  equipmentId: string;
  horizonMinutes: number;    // 预测时间窗口
}
output: {
  predictedState: Record<string, number>;
  confidence: number;
  anomalyProbability: number;
  warnings: string[];
}
```

### cognition.whatIf
WorldModel 反事实推理。

```typescript
input: {
  equipmentId: string;
  hypotheticalChanges: Record<string, number>;  // 假设变更
}
output: {
  originalRisk: number;
  hypotheticalRisk: number;
  riskDelta: number;
  affectedMetrics: Array<{ metric: string; originalValue: number; predictedValue: number }>;
  recommendation: string;
}
```

---

## 3. 护栏域 (Guardrail)

### guardrail.evaluate
手动触发护栏评估。

```typescript
input: { equipmentId: string }
output: {
  triggered: Array<{
    ruleId: string; category: 'safety' | 'health' | 'efficiency';
    severity: 'info' | 'warning' | 'critical' | 'emergency';
    message: string; action: string;
  }>;
  overallStatus: 'clear' | 'warning' | 'critical' | 'emergency';
}
```

### guardrail.listRules
列出所有护栏规则。

```typescript
input: { category?: string }
output: {
  rules: Array<{
    id: string; name: string; category: string;
    severity: string; enabled: boolean; triggerCount: number;
    lastTriggeredAt?: string;
  }>;
}
```

### guardrail.toggleRule
启用/禁用护栏规则。

```typescript
input: { ruleId: string; enabled: boolean }
output: { ruleId: string; enabled: boolean; updatedAt: string }
```

### guardrail.getAlertHistory
获取告警历史。

```typescript
input: {
  equipmentId?: string;
  category?: string;
  startTime?: string;
  endTime?: string;
  page?: number;
  pageSize?: number;
}
output: {
  alerts: Array<{
    id: string; ruleId: string; equipmentId: string;
    category: string; severity: string; message: string;
    action: string; acknowledgedAt?: string; createdAt: string;
  }>;
  total: number;
}
```

---

## 4. 进化域 (Evolution)

### evolution.getFlywheel Status
获取自进化飞轮状态。

```typescript
input: {}
output: {
  status: 'idle' | 'running' | 'paused';
  currentStep: string;
  cycleCount: number;
  lastCycleAt?: string;
  improvements: Array<{ metric: string; before: number; after: number; delta: number }>;
  pendingReview: number;
}
```

### evolution.triggerCycle
手动触发一轮进化周期。

```typescript
input: { scope?: string; dryRun?: boolean }
output: {
  cycleId: string;
  status: 'started' | 'dry_run_completed';
  estimatedDurationMs: number;
}
```

### evolution.getChampion
获取当前冠军模型。

```typescript
input: { modelType: string }
output: {
  champion: { id: string; version: string; accuracy: number; deployedAt: string; servingCount: number };
  challengers: Array<{ id: string; version: string; accuracy: number; status: string }>;
}
```

### evolution.reviewImprovement
审核进化改进建议。

```typescript
input: { improvementId: string; decision: 'approve' | 'reject'; comment?: string }
output: { status: 'approved' | 'rejected'; nextAction: string }
```

---

## 5. 知识域 (Knowledge)

### knowledge.queryGraph
查询知识图谱。

```typescript
input: {
  query: string;                    // 自然语言查询或 Cypher-like 查询
  maxDepth?: number;                // 最大遍历深度
  nodeTypes?: string[];             // 过滤节点类型
}
output: {
  nodes: Array<{ id: string; label: string; type: string; properties: Record<string, string> }>;
  edges: Array<{ source: string; target: string; relation: string; weight: number }>;
  paths: Array<Array<string>>;      // 因果链路径
}
```

### knowledge.listCrystals
列出知识结晶。

```typescript
input: { status?: string; type?: string; page?: number; pageSize?: number }
output: {
  crystals: Array<{
    id: string; type: string; name: string; description: string;
    confidence: number; sourceCount: number; appliedCount: number;
    status: string; createdAt: string;
  }>;
  total: number;
}
```

### knowledge.getFeatureRegistry
获取特征注册表。

```typescript
input: { domain?: string; driftStatus?: string }
output: {
  features: Array<{
    id: string; name: string; domain: string; version: string;
    inputDimensions: string[]; outputType: string;
    driftStatus: string; usageCount: number;
  }>;
}
```

### knowledge.getModelRegistry
获取模型注册表。

```typescript
input: { stage?: string; type?: string }
output: {
  models: Array<{
    id: string; name: string; version: string; type: string;
    stage: string; accuracy: number; lastTrainedAt: string; servingCount: number;
  }>;
}
```

---

## 6. 工具域 (Tooling)

### tooling.listTools
列出所有可用工具。

```typescript
input: { category?: string }
output: {
  tools: Array<{
    name: string; description: string; category: string;
    inputSchema: object; outputSchema: object;
  }>;
}
```

### tooling.executeTool
执行指定工具。

```typescript
input: { toolName: string; params: Record<string, unknown> }
output: { result: unknown; durationMs: number; success: boolean; error?: string }
```

---

## 7. 管线域 (Pipeline)

### pipeline.create
创建 Pipeline DAG。

```typescript
input: {
  name: string;
  steps: Array<{
    id: string; type: string;
    input: Record<string, unknown>;
    dependencies: string[];
    condition?: string;
  }>;
}
output: { pipelineId: string; stepCount: number; estimatedDurationMs: number }
```

### pipeline.execute
执行 Pipeline。

```typescript
input: { pipelineId: string; params?: Record<string, unknown> }
output: {
  executionId: string;
  status: 'running' | 'completed' | 'failed';
  stepResults: Array<{ stepId: string; status: string; durationMs: number; output?: unknown }>;
}
```

---

## 8. 平台域 (Platform)

### platform.getStatus
获取平台整体状态。

```typescript
input: {}
output: {
  version: string;
  uptime: number;
  modules: Array<{ name: string; status: 'healthy' | 'degraded' | 'down'; lastCheckAt: string }>;
  metrics: { activeEquipment: number; diagnosisToday: number; alertsToday: number; evolutionCycles: number };
}
```

### platform.getConfig
获取动态配置。

```typescript
input: { namespace?: string }
output: { config: Record<string, unknown>; version: number }
```

### platform.updateConfig
更新动态配置。

```typescript
input: { key: string; value: unknown }
output: { key: string; oldValue: unknown; newValue: unknown; version: number }
```

### platform.getDashboard
获取认知仪表盘数据。

```typescript
input: { timeRange?: { start: string; end: string } }
output: {
  perception: { activeCollections: number; stateVectorCount: number; fusionQuality: number };
  cognition: { diagnosisCount: number; avgReasoningSteps: number; avgDurationMs: number };
  guardrail: { triggeredToday: number; acknowledgedRate: number; topRules: Array<{ ruleId: string; count: number }> };
  evolution: { cycleCount: number; improvementRate: number; crystalCount: number };
}
```
