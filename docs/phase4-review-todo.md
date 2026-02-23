# Phase 4 审查报告修订清单

> 来源：Claude AI 深度审查报告（83/100），2026-02-23

## P0 — 必须在实施前完成

- [ ] **升级链状态持久化** (0.5h) — 启动时从 guardrail_violations 恢复 ActiveEscalation，确保重启不丢失告警状态
  - v2.0 已融入（F2），确认描述充分
- [ ] **DB 加载失败 Fallback** (0.5h) — GuardrailEngine 初始化路径中，DB 加载失败时保留内置规则并打印 ERROR 日志
  - v2.0 决策 1 提到"内置规则作为兜底"但未明确 fallback 流程，需补充

## P1 — Phase 4 周期内完成

- [ ] **趋势检测改用 EWMA** (1h) — 用指数加权移动平均替换/补充线性回归，增加 ewmaAlpha 字段
  - 审查指出线性回归对噪声敏感、无法识别非线性趋势
  - 方案：保留 linearRegressionSlope 作为可选算法，新增 EWMA 作为默认算法
- [ ] **告警严重度量化** (1.5h) — GuardrailTriggerEvent 增加 severity（0-1）字段
  - 由超限边距 + 趋势斜率 + 历史误报率计算
  - 升级链触发基于 severity 阈值而非纯时间延迟
- [ ] **效果评估写入分离** (1h) — 独立批处理任务写 guardrail_effectiveness_logs
  - G3 Router 查询预计算结果，避免实时聚合 violations

## P2 — Phase 4 周期内完成

- [ ] **知识结晶向量接口** (2h) — KnowledgeStore 接口定义 generateEmbedding() 方法
  - v2.0 已有 EmbeddingProvider hook（F3），需进一步增强为接口级定义
- [ ] **两系统协同事件流** (2h) — 内部 EventEmitter
  - 护栏 violation 确认 → 触发知识结晶
  - 结晶 outcome 更新 → 修订护栏误报率估算
  - threshold_update 结晶 approved → 触发护栏规则阈值修订
- [ ] **结晶自动失效机制** (1h) — negative 应用占比 > 40% 时自动降级 approved → pending_review

## P3 — 纳入下一迭代（Phase 5 范围，本次仅记录）

- [ ] 规则关联度矩阵 / 复合风险分数
- [ ] 可观测性埋点（evaluate 延迟、DB 加载延迟、触发频率）

## 审查报告额外指出的问题

- [ ] **guardrail_effectiveness_logs 写入时机** — 需明确为独立批处理任务（已纳入 P1）
- [ ] **knowledge_crystals.applicable_conditions 索引** — JSON 字段查询性能差，建议拆关联表或生成列索引
- [ ] **结晶版本血统追踪** — crystal_migrations 仅记录单次迁移，不支持多级血统链
- [ ] **竞争结晶裁定** — 多个结晶对同一工况给出矛盾建议时的置信度裁定

## 验收标准补充

- [ ] 重启恢复：重启服务后 Level≥2 的活跃告警从 DB 正确恢复
- [ ] DB 不可用 Fallback：模拟 DB 连接失败，降级使用内置规则 + ERROR 日志
- [ ] 评估性能：单次 evaluate() 50 条规则 + DB 加载路径，延迟 < 50ms (P99)
- [ ] 写入吞吐：10 台设备并发触发，violation 写入无主键冲突或死锁
- [ ] 趋势准确率：10 组标准趋势数据集，EWMA 检测准确率 > 85%
