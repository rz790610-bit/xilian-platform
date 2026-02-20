# Bounded Context Map — 洗炼平台 v5.0

> **文档版本**: v5.0  
> **日期**: 2026-02-20  
> **架构模式**: Domain-Driven Design (DDD) + 闭环四阶段对齐

---

## 上下文映射

```
┌─────────────────────────────────────────────────────────────────┐
│                        闭环主动脉                                │
│   ①感知 ──→ ②诊断 ──→ ③护栏 ──→ ④进化 ──→ ①感知（循环）        │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  perception  │───→│  cognition   │───→│  guardrail   │───→│  evolution   │
│  ①感知领域    │    │  ②诊断领域    │    │  ③护栏领域    │    │  ④进化领域    │
│              │    │              │    │              │    │              │
│ • condition  │    │ • session    │    │ • rule       │    │ • shadowEval │
│ • sampling   │    │ • worldModel │    │ • violation  │    │ • champion   │
│ • stateVector│    │ • physics    │    │ • effective. │    │ • canary     │
│              │    │ • diagnosis  │    │              │    │ • dataEngine │
│              │    │              │    │              │    │ • cycle      │
│              │    │              │    │              │    │ • crystal    │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │                   │
       └───────────────────┴───────────────────┴───────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
              ┌─────┴──────┐ ┌────┴─────┐ ┌─────┴──────┐
              │  knowledge │ │ tooling  │ │  pipeline  │
              │  知识层     │ │ 工具层    │ │  管线层     │
              │            │ │          │ │            │
              │ • kb       │ │ • registry│ │ • pipeline │
              │ • kgOrch.  │ │ • algorithm│ │ • dataPipe│
              │ • graphQ.  │ │ • distill.│ │ • stream  │
              └────────────┘ └──────────┘ └────────────┘
                                   │
                          ┌────────┴────────┐
                          │    platform     │
                          │    平台基础      │
                          │                 │
                          │ • system/auth   │
                          │ • database      │
                          │ • infra/observ. │
                          │ • kafka/redis   │
                          │ • docker/plugin │
                          └─────────────────┘
```

## 8 个 Bounded Context

| Context | 闭环位置 | 路由数 | 职责边界 |
|---------|----------|--------|----------|
| **perception** | ①感知 | 3 | 数据采集 + 协议适配 + 工况管理 + 自适应采样 |
| **cognition** | ②诊断 | 4 | 认知引擎 + 世界模型 + 物理公式 + 诊断报告 |
| **guardrail** | ③护栏 | 3 | 安全/健康/高效干预规则 + 触发审计 + 效果评估 |
| **evolution** | ④进化 | 6 | 影子评估 + 冠军挑战 + 金丝雀 + 数据引擎 + 周期 + 结晶 |
| **knowledge** | 横向 | 3 | 知识库 + 知识图谱 + 图查询 |
| **tooling** | 横向 | 3 | 工具注册 + 算法赋能 + 知识蒸馏 |
| **pipeline** | 横向 | 3 | 数据管线 + 流处理 + DAG |
| **platform** | 基础 | 17 | 系统 + 认证 + 数据库 + 基础设施 + 可观测性 |

## 上下文间通信

| 上游 | 下游 | 通信方式 | 事件 |
|------|------|----------|------|
| perception | cognition | EventBus | `perception.state.vector` |
| cognition | guardrail | 同步调用 | `diagnosis.report.generated` |
| guardrail | perception | EventBus | `guardrail.safety.intervention` |
| guardrail | evolution | EventBus | `guardrail.rule.triggered` |
| evolution | cognition | 配置更新 | `evolution.model.updated` |
| evolution | knowledge | 写入 | `evolution.knowledge.crystallized` |
| knowledge | cognition | 查询 | Cypher/向量搜索 |
| tooling | cognition | 工具调用 | Tool Calling |
| pipeline | perception | 数据流 | Kafka Topic |
| platform | 全部 | 基础设施 | 认证/数据库/监控 |

## 反腐败层（ACL）

每个域路由聚合文件（`*.domain-router.ts`）充当反腐败层：
- 对外暴露统一的 tRPC 接口
- 对内复用现有路由或新建路由
- 隔离域间的实现细节
- 通过 EventBus + Schema Registry 保证跨域通信的类型安全
