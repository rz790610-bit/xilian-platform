# v3.0 整改清单

- [x] #1 飞轮空数据集 — executeCycleFromSchedule 从业务表加载真实数据
- [x] #2 OTA Fleet Canary DB 持久化 — 新增 DDL + Drizzle + 重启恢复
- [x] #3 Shadow Fleet 分布式锁 — mirrorRequest 中实际调用 acquireLock
- [x] #4 Auto-Labeling 多维特征规则矩阵 + 不确定性标记 + 置信度衰减
- [x] #5 neuralPlanner 诚实重命名 + ONNX 预留接口
- [x] #6 飞轮 cron 支持范围/步进语法
- [x] #7 金丝雀定时器优雅停止
- [x] #8 全局熔断器 — 创建进化引擎专用基础设施保护层（getProtectedDb + ProtectedRedisClient + protectedPromQuery）
- [x] #9 核心模块 Vitest 单元测试（4 组，68 用例全部通过）
- [x] #10 EventBus 业务消费者（4 类事件：干预→仿真+标注、部署→飞轮、飞轮→指标、分歧→难例）
- [ ] 其他小修复：递归深度保护、encodeChannel 长度注释、neuralPlanner 权重可配置、KL 散度参数校验、审计 flush 高可靠模式
