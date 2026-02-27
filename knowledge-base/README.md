# 知识库 (Knowledge Base)

港机设备诊断知识库，用于存储诊断规则、故障模式、修正案例。

## 目录结构

```
knowledge-base/
├── fault_patterns/         # 故障模式库
│   └── brake_vs_gear.json  # 制动器 vs 齿轮故障鉴别
├── diagnostic_rules/       # 诊断规则库
│   └── sideband_diagnosis_rules.json  # 边频带诊断规则
└── README.md
```

## 知识结晶流程

```
现场故障确认
     │
     ▼
┌─────────────────┐
│  诊断修正案例   │
│  (fault_pattern) │
└─────────────────┘
     │
     ▼
┌─────────────────┐
│   规则权重调整  │
│ (diagnostic_rules)│
└─────────────────┘
     │
     ▼
┌─────────────────┐
│  进化飞轮更新   │
│  (HDE Evolution) │
└─────────────────┘
```

## 案例记录格式

### fault_patterns/*.json

```json
{
  "case_record": {           // 案例基本信息
    "case_id": "CASE-xxx",
    "device_id": "设备编号",
    "confirmed_by": "确认方式"
  },
  "spectral_signature": {    // 频谱特征
    "rotation_frequency_hz": 16.5,
    "sideband_pattern": { ... }
  },
  "initial_diagnosis": {     // 系统初判
    "fault_type": "初判故障类型",
    "confidence": 0.85
  },
  "actual_fault": {          // 实际故障
    "fault_type": "确认故障类型",
    "root_cause": "根本原因"
  },
  "differentiation_rules": { // 鉴别规则
    "decision_tree": { ... }
  },
  "rule_weight_adjustment": { // 权重调整
    "adjustments": [ ... ]
  }
}
```

## 当前案例

### CASE-20260227-001: 制动器故障误诊为齿轮故障

| 项目 | 内容 |
|------|------|
| 设备 | 1903000114 减速箱 |
| 初判 | 齿轮啮合异常 (置信度 85%) |
| 实际 | 输入轴制动故障 |
| 修正 | 齿轮故障权重 0.85→0.70，制动器权重 0.30→0.55 |

**教训**:
- 转频边频带 ≠ 齿轮故障
- 1X主导时优先排查制动器/联轴器
- 齿数验证是确认齿轮故障的必要条件
