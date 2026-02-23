# Phase 4 v4.0 修订清单

## 来源 1：FSD 优化文档（5 项）
- [ ] FSD-1: 前端迁移至 features/widgets/entities 标准 FSD Layers
- [ ] FSD-2: 后端垂直切片 features/guardrail/ + features/knowledge-crystal/
- [ ] FSD-3: 事件总线按特性隔离到 features/*/events/
- [ ] FSD-4: 统一 barrel index + @features/ 别名
- [ ] FSD-5: 每个特性独立 slice，支持并行开发零冲突

## 来源 2：第二轮深度审查报告（24 项缺陷）

### 上线前必须修复（7 项）
- [ ] BUG-1: trendBuffer 多设备数据污染 → 复合 key ${machineId}:${field}
- [ ] BUG-2: ActiveEscalation 状态覆盖 → 仅在无活跃升级时创建新记录
- [ ] BUG-3: incrementVerification 竞态 → 原子 SQL UPDATE count+1
- [ ] #4: 升级链状态持久化（已在 v3.0 含，补充 fallback 恢复流程）
- [ ] #5: DB 加载失败 Fallback（已在 v3.0 含）
- [ ] #6: avgImprovement 字段缺失 → 补充 DDL 或重定义计算逻辑
- [ ] #7: escalationDelayMs 路径不一致 → 统一从 escalation_config.levels[n].delayMs

### 本期内修复（10 项）
- [ ] #8: 三张新表缺失外键约束
- [ ] #9: Seed 数据硬编码 crystal_id → 子查询引用
- [ ] #10: reviewCrystal rejected→draft 状态机错误 → 新增 rejected 枚举
- [ ] #11: 除零崩溃保护（buffer[0]=0）
- [ ] #12: 冷却机制与升级链相互干扰 → 明确冷却只控制新告警
- [ ] #13: DB 规则覆盖语义未定义 → 完全替换语义
- [ ] #14: 三结晶器并发写入重复 → content_hash + INSERT IGNORE
- [ ] #15: 前端聚合触发趋势图 → 服务端 dailyStats query
- [ ] #16: EWMA 趋势检测（已在 v3.0 含）
- [ ] #17: severity 量化（已在 v3.0 含）

### 下期修复（7 项，记录为 Phase 5 预留）
- [ ] #18: migrateCrystal adaptations 服务端推断（需对接 Phase 3）
- [ ] #19: findSimilar 知识马太效应
- [ ] #20: revisionLog 持久化
- [ ] #21: K6 前端加载态/错误态
- [ ] #22: 两系统协同事件流
- [ ] #23: 结晶向量接口增强
- [ ] #24: 规则关联度矩阵
