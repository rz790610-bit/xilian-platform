# v3.0 审计笔记

## 1. shadow-fleet-manager.ts (831行)
### 已验证修复
- [x] computeDecisionDivergence: 结构化字段逐一比较（数值容差+字符串+布尔+数组+对象递归）✅ 真实实现
- [x] numericDivergence: 相对误差+绝对容差+sigmoid映射 ✅ 数学正确
- [x] arrayDivergence: 逐元素比较+长度补偿 ✅
- [x] 分布式锁: incrementCounter/decrementCounter 原子操作 ✅ 调用真实存在
- [x] 幂等 key: trySetIdempotencyKey + 86400s TTL ✅
- [x] cleanup: 使用 lte (小于等于过期时间) ✅ 逻辑正确
### 残留问题
- 对象递归比较无深度限制（可能栈溢出）
- decrementCounter 是新增方法，需确认 Redis DECR 命令兼容性

## 2. canary-deployer.ts (1042行)
### 已验证修复
- [x] routeRequest: 从 DB 缓存读取流量百分比 + 一致性哈希 ✅ 真实实现
- [x] 分布式锁: 3处 acquireLock/releaseLock（创建/推进/回滚）✅
- [x] 重启恢复: initialize() 从 DB 加载活跃部署 + 恢复指标/缓存/定时器 ✅ 完整
- [x] 优雅停止: isShuttingDown + activeChecks + drainTimeout ✅
### 残留问题
- releaseLock 在 finally 块中但 acquireLock 在 try 外，如果 acquireLock 后 try 前异常会泄漏锁
- trafficCache 10秒 TTL 在高并发下可能导致短暂路由不一致（可接受）

## 3. evolution-flywheel.ts (1205行)
### 已验证修复
- [x] executeCycleFromSchedule: 从 shadow_eval_records + shadow_eval_metrics + evolution_interventions 加载真实数据 ✅
- [x] 数据转换: DiagnosisHistoryEntry + EvaluationDataPoint 格式正确 ✅
- [x] 空数据检测: SKIP + EventBus 告警 + DB 记录 lastFailureAt ✅
- [x] cron 解析: parseCronField 支持 */步进/范围/逗号 ✅
### 残留问题
- computeNextTrigger 最多搜索 366 天，极端 cron 表达式可能超时
- IN 子查询用 sql.join 拼接，超过 1000 条时可能有 MySQL 限制

## 4. simulation-engine.ts (625行)
### 已验证修复
- [x] computeFidelity: 5维评分（完整性+数值覆盖+值域合理性+结构深度+JS散度分布比较）✅ 真实实现
- [x] JS 散度调整：有历史分布时用 jsDivergence 调整保真度 ✅
- [x] measureDepth: 递归测量对象深度 ✅
### 残留问题
- measureDepth 无深度限制
- 变异测试的 noiseLevel 线性递增过于简单

## 5. auto-labeling-pipeline.ts (810行)
### 已验证修复
- [x] RULE_MATRIX: 10条规则（2 critical + 3 high + 3 medium + 2 low）✅ 完整
- [x] 每条规则含 severity/reason/rootCause/suggestedFix/conditions ✅ 生产级
- [x] ruleMatrixLabel: 多维条件匹配 + 最佳得分选择 ✅
- [x] 置信度上限 0.82（诚实标注，不过度自信）✅
### 残留问题
- 置信度公式 0.6 + score * 0.22 范围窄（0.6-0.82），区分度有限

## 6. e2e-evolution-agent.ts (742行)
### 已验证修复
- [x] encodeChannel: 12维特征（5统计 + 3频域 + 4时序）✅ 真实DFT实现
- [x] 频域特征: 主频能量占比 + 谱质心 + 谱平坦度 ✅ 数学正确
- [x] ruleBasedPlanner: 诚实命名 + ONNX 预留接口 ✅
- [x] SLERP: 3种退化检测（零范数→线性、theta≈0→线性、theta≈π→中间点）✅ 数值稳定

### 残留问题
- theta≈π 的中间点插值使用 i%2 扰动，不够严谨（应找真正的正交方向）
- DFT 计算 O(n²)，大数据集性能差（应用 FFT 替代）

## 7. fleet-neural-planner.ts (291行)
### 已验证修复
- [x] 10个参数可配置化 ✅
- [x] updateConfig 运行时调整 ✅
- [x] 权重归一化验证 ✅

## 8. ota-fleet-canary.ts (693行)
### 已验证修复
- [x] DB 持久化: insert/update canaryDeployments ✅
- [x] 重启恢复: recoverActiveDeployments 从 DB 加载活跃部署 ✅
- [x] 幂等: acquireLock 实现 setnx 语义 ✅
- [x] 健康检查定时器恢复 ✅

## 9. dojo-training-scheduler.ts (592行)
### 已验证修复
- [x] DB 持久化: dojoTrainingJobs 表 ✅
- [x] 重启恢复: 从 DB 加载 pending/scheduled/running 任务 ✅
- [x] running 超时检测: 超过 maxDuration 标记为 failed ✅

## 10. fsd-metrics.ts (383行)
### 已验证
- [x] 20 个 prom-client 指标（Counter/Gauge/Histogram）✅
- [x] register.getSingleMetric 防重复注册 ✅
- [x] getMetricsAsJSON() 和 metrics() 导出 ✅
### 残留问题
- 无

## 11. evolution-audit-subscriber.ts (308行)
### 已验证
- [x] 批量写入（batchSize=100, flushInterval=5s）✅
- [x] subscribeAll 全事件监听 ✅
- [x] 降级策略（DB 失败不阻塞主流程）✅

## 12. evolution-event-consumers.ts (337行)
### 已验证
- [x] 4 类事件消费者（intervention.detected, canary.stage.completed, canary.rollback, flywheel.cycle.completed）✅
- [x] 动态 import 避免循环依赖 ✅
- [x] 独立 unsubscribe 管理 ✅
### 残留问题
- subscribe 函数从 eventBus.service 导入，需确认与 EventBus 实例一致

## 13. protected-clients.ts (185行)
### 已验证
- [x] withCircuitBreaker 包装 DB/Redis/Prometheus ✅
- [x] 降级回调注册 ✅
- [x] 复用现有 circuitBreaker 中间件 ✅

## 14. math 工具库 (vector-utils 364行 + stats 336行 = 700行)
### 已验证
- [x] 13 个导出函数（余弦/欧氏/曼哈顿/L2范数/归一化/深度比较/扁平化）✅
- [x] 9 个统计函数（KL/JS散度/熵/直方图/分布保真度/TDigest/描述统计/线性回归/趋势分类）✅
- [x] 68 用例全部通过 ✅

## 15. DDL/Schema 一致性
- DDL v2: 7 张表 ✅
- DDL v3: 2 张表 + ALTER TABLE 增量字段 ✅
- Drizzle Schema: 14 张进化相关表（含原有 5 张）✅
- 表名完全对齐 ✅

## 16. Domain Router
- 10 个子路由（shadowEval, championChallenger, canary, dataEngine, cycle, crystal, fsd, schedule + 2个facade）
- fsdRouter: 7 个路由（listInterventions, getIntervention, getInterventionRate, listSimulations, getSimulation, listVideoTrajectories）
- scheduleRouter: list + create + update + delete
- 所有路由都有 zod 输入验证 ✅
- 所有路由都有 try-catch 降级 ✅
### 残留问题
- getInterventionRate 的 trend 硬编码 'improving'，未使用 InterventionRateEngine
- listInterventions 未使用 minDivergence 和 interventionType 过滤条件

## 17. 测试覆盖
- 4 组测试文件，700 行，68 用例
- 覆盖: math 工具库 + cron 解析 + shadow divergence
- 未覆盖: canary-deployer, flywheel 业务逻辑, auto-labeling, OTA, Dojo
- 测试代码占比: 700 / 13745 = 5.1%
