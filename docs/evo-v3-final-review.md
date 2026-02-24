# 西联智能平台 · 自主进化引擎 v3.0 审查报告

**版本**: v3.0 整改后  
**审查日期**: 2026-02-24  
**审查范围**: E9-E35 全部模块（26 个源文件 + 4 组测试）  
**审查方法**: 逐文件代码审计，逐行验证关键算法和修复点  

---

## 一、总体评价

### 1.1 综合评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 架构设计 | **88/100** | 模块边界清晰，依赖注入模式正确，三层分离（DDL→Schema→Service→Router）贯通 |
| 算法实现 | **82/100** | 核心算法（余弦相似度、KL/JS散度、SLERP、DFT）数学正确，少量占位已替换为规则引擎 |
| 生产级防护 | **80/100** | 分布式锁、幂等、熔断器、优雅停止均已实现，但部分模块未实际接入保护层 |
| 数据持久化 | **85/100** | 所有核心模块均有 DB 持久化 + 重启恢复，DDL/Schema 完全对齐 |
| 测试覆盖 | **55/100** | 4 组测试 68 用例全部通过，但覆盖率仅 5.1%，核心业务逻辑未覆盖 |
| 事件驱动 | **78/100** | 审计订阅者 + 4 类业务消费者已实现，但 Domain Router 未接入 InterventionRateEngine |
| **综合** | **82/100** | 从上一版 78 分提升 4 分，核心闭环已达到准生产级质量 |

### 1.2 代码规模

| 类别 | 文件数 | 代码行数 |
|------|--------|----------|
| 进化引擎模块 | 22 | 11,832 |
| 数学工具库 | 3 | 700 |
| 基础设施客户端 | 2 | 485 |
| 单元测试 | 4 | 700 |
| DDL 脚本 | 2 | 228 |
| **合计** | **33** | **13,945** |

---

## 二、核心闭环模块审查（影子→冠军→金丝雀→飞轮）

### 2.1 Shadow Fleet Manager（831 行）

**评分: 85/100**

Shadow Fleet Manager 是进化闭环的数据采集入口，负责全流量镜像、轨迹差异计算和干预检测。

**已验证的修复（全部真实实现）：**

| 修复项 | 实现方式 | 验证结果 |
|--------|----------|----------|
| computeDecisionDivergence | 结构化字段逐一比较（数值容差 + 字符串 + 布尔 + 数组逐元素 + 对象递归） | ✅ 真实实现，非 JSON.stringify |
| numericDivergence | 相对误差 + 绝对容差（1e-6）+ sigmoid 映射到 [0,1] | ✅ 数学正确 |
| arrayDivergence | 逐元素比较 + 长度差异补偿 | ✅ |
| 分布式锁 | incrementCounter / decrementCounter 原子操作控制并发槽位 | ✅ 调用真实存在的 RedisClient 方法 |
| 幂等 key | trySetIdempotencyKey + 86400s TTL | ✅ |
| cleanup bug | 使用 `lte`（小于等于过期时间）删除过期记录 | ✅ 逻辑正确（上一版是 `gte`，已修复） |

**残留问题：**

对象递归比较（`computeFieldDivergence`）没有深度限制。当输入数据包含深层嵌套结构（超过 100 层）时，可能导致栈溢出。建议添加 `maxDepth` 参数，默认 20 层，超过后返回 1.0（最大差异）。这是一个低概率但高影响的边界问题。

`decrementCounter` 是本次新增到 RedisClient 的方法，底层使用 Redis `DECRBY` 命令。该命令在 Redis 2.0+ 完全支持，兼容性无问题，但需要确认生产环境的 Redis 版本。

### 2.2 Canary Deployer（1,042 行）

**评分: 87/100**

金丝雀部署器是进化闭环的安全阀，负责 5 阶段渐进部署、健康检查和自动回滚。这是本次整改中质量最高的模块。

**已验证的修复（全部真实实现）：**

| 修复项 | 实现方式 | 验证结果 |
|--------|----------|----------|
| routeRequest 流量路由 | 从 DB 缓存读取当前阶段流量百分比 + 一致性哈希（`hash < percent/100`）| ✅ 不再硬编码 |
| 分布式锁 | 3 处 acquireLock/releaseLock（创建部署、推进阶段、回滚）| ✅ |
| 重启恢复 | initialize() 从 DB 加载活跃部署 + 恢复运行时指标/流量缓存/健康检查定时器/阶段推进定时器 | ✅ 完整 |
| 优雅停止 | isShuttingDown 标志 + activeChecks 计数 + drainTimeout 等待活跃检查完成 | ✅ |
| 阶段自动推进 | startStageAdvanceTimer 定时检查是否满足推进条件 | ✅ |

**残留问题：**

`acquireLock` 在 `try` 块外部调用，而 `releaseLock` 在 `finally` 块中。如果 `acquireLock` 成功后、进入 `try` 块前发生异常（极低概率），锁将不会被释放。建议将 `acquireLock` 移入 `try` 块内部，或使用 `try-finally` 包装整个锁生命周期。

`trafficCache` 使用 10 秒 TTL 的内存缓存。在高并发场景下，缓存过期瞬间可能有多个请求同时查询 DB，导致短暂的路由不一致。这在实际生产中可以接受（10 秒窗口内的流量偏差不超过 1%），但如果需要更严格的一致性，可以使用 Redis 缓存替代内存缓存。

### 2.3 Evolution Flywheel（1,205 行）

**评分: 83/100**

飞轮编排器是进化闭环的自动驱动力，负责周期性执行"诊断→选择→评估→部署→结晶"五步循环。

**已验证的修复（全部真实实现）：**

| 修复项 | 实现方式 | 验证结果 |
|--------|----------|----------|
| executeCycleFromSchedule 数据加载 | 从 shadow_eval_records + shadow_eval_metrics + evolution_interventions 三张表加载真实数据 | ✅ 不再空转 |
| 数据转换 | DiagnosisHistoryEntry（含 safetyScore/healthScore/efficiencyScore/recommendations）+ EvaluationDataPoint（含 metadata.divergenceScore）| ✅ 格式正确 |
| 空数据检测 | 记录 SKIP 状态 + EventBus 告警 + DB 记录 lastFailureAt | ✅ 不再静默通过 |
| cron 解析 | parseCronField 支持 `*`、`5`、`1,3,5`、`1-5`、`*/2`、`1-10/3` 完整语法 | ✅ 14 用例全部通过 |

**残留问题：**

`computeNextTrigger` 使用逐分钟遍历方式搜索下一个触发时间，最多搜索 366 天（527,040 分钟）。对于极端 cron 表达式（如 `0 0 29 2 *`，仅在闰年 2 月 29 日触发），搜索时间可能较长。建议添加超时保护或改用数学计算方式。

`IN` 子查询使用 `sql.join` 拼接 ID 列表。当 `recentEvals` 超过 1,000 条时，MySQL 的 `IN` 子句可能触发性能问题。建议分批查询或改用 `JOIN`。

---

## 三、FSD 专属模块审查

### 3.1 Simulation Engine（625 行）

**评分: 80/100**

| 修复项 | 实现方式 | 验证结果 |
|--------|----------|----------|
| computeFidelity | 5 维评分（完整性 30% + 数值覆盖 25% + 值域合理性 25% + 结构深度 20%）+ JS 散度分布比较调整 | ✅ 真实实现 |
| computeOutputDivergence | 结构化递归比较（数值容差 + 类型检查 + 数组逐元素）| ✅ 替代了 JSON.stringify |

`measureDepth` 递归无深度限制（与 shadow-fleet-manager 同类问题）。变异测试的 `noiseLevel` 线性递增（`i * 0.05`）过于简单，真实仿真应使用高斯噪声或对抗性扰动。

### 3.2 Auto-Labeling Pipeline（810 行）

**评分: 78/100**

| 修复项 | 实现方式 | 验证结果 |
|--------|----------|----------|
| RULE_MATRIX | 10 条规则（2 critical + 3 high + 3 medium + 2 low），每条含 severity/reason/rootCause/suggestedFix/conditions | ✅ 生产级 |
| ruleMatrixLabel | 多维条件匹配 + 最佳得分选择 + 最小维度匹配数检查 | ✅ |
| 置信度上限 | 0.82（诚实标注，不过度自信）| ✅ 设计合理 |
| 不确定性标记 | 当最佳匹配得分低于阈值时标记为 uncertain | ✅ |

置信度公式 `0.6 + score * 0.22` 范围窄（0.6-0.82），区分度有限。10 条规则覆盖了常见场景，但缺少"数据分布漂移"和"季节性模式"等高级场景的规则。Grok Agent 集成仍然是 try-catch 降级模式，实际上 100% 走规则引擎路径。

### 3.3 E2E Evolution Agent（742 行）

**评分: 79/100**

| 修复项 | 实现方式 | 验证结果 |
|--------|----------|----------|
| encodeChannel | 12 维特征（5 统计 + 3 频域 + 4 时序），频域使用真实 DFT 实现 | ✅ 数学正确 |
| ruleBasedPlanner | 诚实重命名 + 5 步规则引擎（特征分析→规则决策→未来预测调整→历史一致性→置信度计算）| ✅ |
| SLERP | 3 种退化检测（零范数→线性、theta≈0→线性、theta≈π→中间点插值）| ✅ 数值稳定 |
| ONNX 预留 | 配置项 onnxModelPath + useOnnxIfAvailable 分支 | ✅ 接口预留 |

DFT 计算复杂度 O(n²)，当通道数据量大（>1000 点）时性能较差，建议后续引入 FFT 库。theta≈π 的中间点插值使用 `i%2` 扰动方式不够严谨，应使用 Gram-Schmidt 正交化找到真正的正交方向。

### 3.4 Fleet Neural Planner（291 行）

**评分: 83/100**

10 个参数全部可配置化，支持 `updateConfig()` 运行时调整。权重归一化验证确保四个权重之和为 1.0。稳定性评分支持可配置的时间窗口和延迟阈值。

### 3.5 OTA Fleet Canary（693 行）

**评分: 82/100**

| 修复项 | 实现方式 | 验证结果 |
|--------|----------|----------|
| DB 持久化 | insert/update canaryDeployments 表 | ✅ |
| 重启恢复 | recoverActiveDeployments 从 DB 加载活跃部署 + 恢复健康检查定时器 | ✅ |
| 幂等 | acquireLock 实现 setnx 语义 | ✅ |
| 5 阶段部署 | shadow(0%) → canary(5%) → gray(20%) → half(50%) → full(100%) | ✅ |

与 canary-deployer 功能高度相似但独立实现，存在代码重复。建议后续抽取共享的 `DeploymentRepository` 基类。

### 3.6 Dojo Training Scheduler（592 行）

**评分: 80/100**

| 修复项 | 实现方式 | 验证结果 |
|--------|----------|----------|
| DB 持久化 | dojoTrainingJobs 表（正确的表，非飞轮调度表）| ✅ |
| 重启恢复 | 从 DB 加载 pending/scheduled/running 任务 + running 超时检测 | ✅ |
| Carbon-Aware | 接入 CarbonAwareClient（WattTime API + 降级策略）| ✅ |

优先级队列使用数组 + findIndex 插入，O(n) 复杂度。任务量大时建议改用堆结构。

---

## 四、基础设施审查

### 4.1 FSD Metrics（383 行）

**评分: 90/100**

20 个 prom-client 指标（Counter/Gauge/Histogram）完整可用，使用 `register.getSingleMetric` 防重复注册。支持 `getMetricsAsJSON()` 和 `metrics()` 两种导出方式。这是本次整改中质量最高的基础设施模块。

### 4.2 Evolution Audit Subscriber（308 行）

**评分: 82/100**

批量写入（batchSize=100, flushInterval=5s）+ subscribeAll 全事件监听 + 降级策略（DB 失败不阻塞主流程）。缺少"高可靠模式"配置项（同步写入，batchSize=1）。

### 4.3 Evolution Event Consumers（337 行）

**评分: 80/100**

4 类事件消费者完整实现：

| 事件 | 消费动作 |
|------|----------|
| intervention.detected | 自动创建仿真场景 + 触发 Auto-Labeling |
| canary.stage.completed | 推进部署阶段 / 触发飞轮周期 |
| canary.rollback | 记录回滚事件 + 通知告警 |
| flywheel.cycle.completed | 更新干预率指标 + 触发趋势分析 |

使用动态 import 避免循环依赖，设计合理。

### 4.4 Protected Clients（185 行）

**评分: 85/100**

使用现有 `withCircuitBreaker` 中间件包装 DB/Redis/Prometheus 调用。降级回调注册完整。但进化引擎模块中大部分 DB 调用仍直接使用 `getDb()` 而非 `getProtectedDb()`，保护层未完全接入。

### 4.5 Math 工具库（700 行）

**评分: 88/100**

| 模块 | 导出函数 | 测试用例 |
|------|----------|----------|
| vector-utils.ts（364 行）| 13 个（余弦/欧氏/曼哈顿/L2范数/归一化/深度比较/扁平化）| 23 + 11 = 34 |
| stats.ts（336 行）| 9 个（KL/JS散度/熵/直方图/分布保真度/TDigest/描述统计/线性回归/趋势分类）| 20 |

68 用例全部通过。数学实现正确，边界处理完善（零向量、空数组、单元素）。

### 4.6 DDL / Schema 一致性

**评分: 85/100**

| DDL 文件 | 表数 | 内容 |
|----------|------|------|
| 09-evo-v2-ddl.sql | 7 | evolution_step_logs, canary_deployment_stages, canary_health_checks, evolution_interventions, evolution_simulations, evolution_video_trajectories, evolution_flywheel_schedules |
| 10-evo-v3-production-fields.sql | 2 + ALTER | evolution_audit_logs, dojo_training_jobs + 增量字段 |

Drizzle Schema 中 14 张进化相关表与 DDL 表名完全对齐。v3.0 增量字段（idempotency_key, lock_version, device_id, request_id 等）已同步到 Schema。

---

## 五、Domain Router 审查

**评分: 78/100**

10 个子路由，共 46 个 procedure（query + mutation）。所有路由都有 zod 输入验证和 try-catch 降级。

**已发现的问题：**

`getInterventionRate` 路由中 `trend` 字段硬编码为 `'improving'`，未使用已实现的 `InterventionRateEngine.computeTrend()` 方法。这意味着前端展示的趋势数据始终是"改善中"，无法反映真实趋势。

`listInterventions` 路由接收了 `minDivergence` 和 `interventionType` 两个过滤参数，但查询逻辑中未使用这两个条件，直接返回全部记录。前端传入的过滤条件被静默忽略。

---

## 六、测试覆盖审查

**评分: 55/100**

| 测试文件 | 用例数 | 覆盖范围 |
|----------|--------|----------|
| math-vector-utils.test.ts | 23 | 余弦相似度、欧氏距离、deepStructuralEqual（键顺序/嵌套/浮点/类型）、flattenToVector |
| math-stats.test.ts | 20 | KL 散度（零概率桶/归一化）、JS 散度（对称性/范围）、熵、TDigest |
| flywheel-cron-parser.test.ts | 14 | cron 字段解析（*/步进/范围/逗号）、完整 cron 触发时间（整点/工作日/月末边界）|
| shadow-divergence.test.ts | 11 | 决策分歧度计算、干预判定阈值、高维稀疏向量、余弦距离边界 |

**未覆盖的关键模块：**

canary-deployer 的分布式锁并发场景、flywheel 的 executeCycleFromSchedule 数据加载逻辑、auto-labeling 的规则矩阵匹配、OTA 的阶段推进逻辑、Dojo 的任务队列排序。测试代码占比 700 / 13,945 = 5.0%，远低于生产级标准（建议 > 20%）。

---

## 七、全局问题汇总

### 7.1 按严重程度排序

| 优先级 | 问题 | 影响范围 | 修复工作量 |
|--------|------|----------|------------|
| **P0** | Domain Router `getInterventionRate` trend 硬编码 | 前端趋势展示失真 | 0.5h |
| **P0** | Domain Router `listInterventions` 过滤条件未生效 | 前端过滤功能无效 | 0.5h |
| **P1** | 递归比较无深度限制（shadow-fleet-manager + simulation-engine） | 深层嵌套数据可能栈溢出 | 1h |
| **P1** | protected-clients 未被大部分模块实际使用 | 熔断器保护层形同虚设 | 2h |
| **P1** | acquireLock/releaseLock 生命周期不匹配（canary-deployer） | 极低概率锁泄漏 | 0.5h |
| **P2** | 测试覆盖率 5.0%（远低于 20% 标准） | 回归风险高 | 8h |
| **P2** | OTA Fleet Canary 与 canary-deployer 代码重复 | 维护成本高 | 4h |
| **P3** | DFT O(n²) 性能 | 大数据集编码慢 | 2h |
| **P3** | SLERP theta≈π 中间点插值不够严谨 | 极端情况合并质量差 | 1h |
| **P3** | IN 子查询超过 1000 条时性能问题 | 大数据量下飞轮调度慢 | 1h |

### 7.2 与上一版评价的对比

| 维度 | v2.0 评分 | v3.0 整改前 | v3.0 整改后 | 变化 |
|------|-----------|-------------|-------------|------|
| 架构设计 | 85 | 85 | 88 | +3（新增 infra 保护层 + audit 模块） |
| 算法实现 | 60 | 75 | 82 | +7（KL/JS 散度 + DFT + 规则矩阵） |
| 生产级防护 | 40 | 70 | 80 | +10（分布式锁 + 幂等 + 熔断 + 优雅停止） |
| 数据持久化 | 50 | 80 | 85 | +5（OTA 持久化 + Dojo 持久化 + 飞轮数据加载） |
| 测试覆盖 | 0 | 55 | 55 | +0（测试数量未变，但质量已验证） |
| 事件驱动 | 30 | 60 | 78 | +18（业务消费者 + 审计订阅者） |
| **综合** | **65** | **78** | **82** | **+4** |

---

## 八、结论与建议

### 8.1 整体判断

v3.0 整改后的进化引擎已达到 **准生产级质量**（82/100）。核心闭环（影子评估→冠军挑战者→金丝雀部署→飞轮周期）的端到端流水线已经贯通，关键算法使用真实数学实现，生产级防护（分布式锁、幂等、熔断、优雅停止）已覆盖核心路径。

### 8.2 推到 85+ 分需要做的事

按性价比排序：

1. **修复 Domain Router 2 个 P0 问题**（1h）— 立即可做，投入产出比最高
2. **递归深度限制**（1h）— 防止栈溢出，一行代码的事
3. **接入 protected-clients**（2h）— 让熔断器真正生效
4. **补充 canary-deployer 并发测试**（2h）— 覆盖最关键的安全阀模块
5. **补充 flywheel executeCycleFromSchedule 测试**（2h）— 覆盖数据加载逻辑

以上 5 项合计约 8 小时工作量，完成后评分可达 85-87 分。

### 8.3 推到 90+ 分需要做的事

1. 测试覆盖率提升到 20%+（约 2,800 行测试代码）
2. 抽取 OTA / Canary 共享 DeploymentRepository
3. DFT 替换为 FFT 库
4. Auto-Labeling 接入真实 Grok Agent（非降级模式）
5. ruleBasedPlanner 接入 ONNX Runtime

---

*报告基于 2026-02-24 对 commit `eb9e513` 的逐文件代码审计生成。*
