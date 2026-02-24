# E9-E35 优化修复清单

## P0 — 必须立即修复
- [ ] computeDivergence() 真实余弦相似度实现
- [ ] performHealthCheck() 接入真实 Prometheus PromQL
- [ ] HealthCheckProvider 默认实现（不再返回 passed:true）
- [ ] DDL/Schema 3处字段不一致同步修复
- [ ] isIntervention() 替换 JSON.stringify 为 fast-deep-equal

## P1 — 核心功能补完
- [ ] computeFidelity() 基于 KL 散度的最小可用实现
- [ ] labelTrajectory() 基于规则的最小可用实现
- [ ] neuralPlanner() 基于规则引擎的最小可用实现
- [ ] cron 调度接入 node-cron / BullMQ
- [ ] runScenario() 比较替换为数值容差比较

## P2 — 生产级防护
- [ ] Redis 分布式锁（部署操作入口）
- [ ] opossum 熔断器（外部 API 调用）
- [ ] 幂等 key（deployment_id + stage 联合唯一索引）
- [ ] InterventionRateEngine 窗口数据从 DB 聚合重建
- [ ] Dojo 任务队列持久化到 DB

## P3 — 数据准确性
- [ ] prom-client 替换自建 MetricStore
- [ ] Histogram 分位数改用 t-digest 近似算法
- [ ] FleetNeuralPlanner 权重/稳定性参数提取到配置

## P4 — 长期架构
- [ ] EventBus 审计日志订阅者
- [ ] SLERP 范数归一化 + 退化 fallback
- [ ] encodeChannel() 增加频域特征（FFT 统计量）
