# Sprint 执行计划 (SPRINT PLAN)

> **版本**: 1.0.0 | **日期**: 2026-03-02 | **团队规模**: 3-5 人
> **关联文档**: docs/COMPLETE_FIX_PLAN.md, docs/FIX_DEPENDENCY_GRAPH.md
> **总工期**: 4 个 Sprint (4 周)

---

## Sprint 1: 致命问题 + 安全加固 (Week 1: 2026-03-02 ~ 03-06)

### 目标

消除所有致命级问题和安全漏洞，确保核心数据链路的类型一致性。

### 任务列表

| 序号 | FIX-ID | 描述 | 工作量 | 负责主线 | 验收标准 |
|------|--------|------|--------|----------|----------|
| 1 | FIX-002 | Severity 枚举统一: 创建 shared/contracts/v1/common.contract.ts，定义唯一 SeverityLevel 枚举，提供算法层和异常检测层映射函数 | M (4h) | B-契约 | `grep -rn "type.*Severity" server/` 仅返回统一定义和映射器; `pnpm check` 通过 |
| 2 | FIX-040 | 创建 shared/contracts/v1/ 目录结构: index.ts + common.contract.ts + perception.contract.ts + cognition.contract.ts + diagnosis.contract.ts + evolution.contract.ts | M (4h) | B-契约 | 目录和文件存在; 统一类型可 import |
| 3 | FIX-020 | EventBus publish() 强制 Schema 校验: event-schema-registry.ts 的 validate() 集成到 publish()，dev 模式 warn+log，暂不阻断 | M (4h) | C-事件 | 发送不合规 payload 时控制台输出 warning; 单元测试覆盖 |
| 4 | FIX-101 | Docker MySQL 默认密码安全化: 移除 root123，改为必须通过环境变量注入 | XS (<1h) | D-安全 | docker-compose.yml 不含 root123 字面量 |
| 5 | FIX-102 | Docker JWT_SECRET 安全化: 移除弱默认值，启动时无 JWT_SECRET 环境变量则报错退出 | XS (<1h) | D-安全 | config.ts 启动校验; docker-compose 无弱默认值 |
| 6 | FIX-106 | Helm 密码安全化: values.yaml 密码字段添加 Required 注释和 tpl 验证 | S (2h) | D-安全 | helm template 不填密码时报错 |
| 7 | FIX-103 | ES_PASSWORD=changeme 替换为环境变量注入 | XS (<1h) | D-安全 | docker-compose.yml 不含 changeme |
| 8 | FIX-104 | MinIO 默认凭据移除: config.ts 和 docker-compose 中 minioadmin 替换 | XS (<1h) | D-安全 | grep minioadmin 返回 0 行 |
| 9 | FIX-001 | 设备 ID 统一 Phase 1: 创建 DeviceIdMapper 工具类，定义 machineId 为标准名，在关键入口添加转换 | L (2d) | A-命名 | DeviceIdMapper 类存在; 至少 10 个核心模块使用统一命名; `pnpm check` 通过 |
| 10 | FIX-091 | DS 融合引擎 Severity 修正: 输出使用统一 SeverityLevel 枚举 | S (2h) | B-契约 | ds-fusion.engine.ts import 统一枚举; 类型检查通过 |
| 11 | FIX-090 | 感知管线端到端集成 Phase 1: 编写 mock 数据从边缘层→汇聚层→平台层的最简流程测试 | XL (3d) | E-功能 | 集成测试文件存在; mock 数据贯通三层; 测试通过 |
| 12 | FIX-092 | 护栏引擎接入诊断流程 Phase 1: 定义 GuardrailCheck 接口，在诊断输出前增加调用点 | L (2d) | E-功能 | 诊断结论输出前经过 guardrail.validate(); 接口定义完成 |
| 13 | FIX-119 | 插件沙箱升级 Phase 1: 安装 isolated-vm 依赖，创建 IsolatedSandbox 基础类 | L (2d) | D-安全 | npm ls isolated-vm 存在; IsolatedSandbox 类可实例化 |
| 14 | FIX-047 | gRPC 类型生成 Phase 1: 安装 protoc-gen-ts，package.json 添加 proto:gen 脚本 | L (1d) | B-契约 | `pnpm proto:gen` 成功生成 .ts 文件到 shared/generated/proto/ |
| 15 | FIX-134 | 测试覆盖率基线: 运行 coverage 工具，记录当前覆盖率数据 | M (4h) | E-功能 | 覆盖率报告存在; 基线数据记录 |

### 工作量汇总

| 主线 | 任务数 | 总工时 |
|------|--------|--------|
| A-命名 | 1 | 2d |
| B-契约 | 4 | 1.5d |
| C-事件 | 1 | 4h |
| D-安全 | 5 | 3d |
| E-功能 | 4 | 4d |
| **合计** | **15** | **~11d (5 人天 × 5d 内完成)** |

### Sprint 1 完成后系统状态

```
✅ Severity 枚举全平台唯一定义
✅ shared/contracts/v1/ 目录已创建，统一类型可引用
✅ EventBus publish() 输出 Schema 校验 warning
✅ Docker/Helm 无明文弱密码
✅ 设备 ID 有统一映射层 (DeviceIdMapper)
✅ DS 融合引擎 Severity 类型正确
✅ 感知管线 mock 端到端可跑通
✅ 护栏引擎接口已定义并接入
✅ 插件沙箱 isolated-vm 依赖就位
✅ gRPC TypeScript 生成工具就位
✅ 测试覆盖率基线已记录
```

---

## Sprint 2: 严重问题 + 核心功能 (Week 2: 2026-03-09 ~ 03-13)

### 目标

解决所有严重级问题，核心诊断流程类型安全，GrokTool 高频工具实现。

### 任务列表

| 序号 | FIX-ID | 描述 | 工作量 | 负责主线 | 验收标准 |
|------|--------|------|--------|----------|----------|
| 1 | FIX-004 | DiagnosisConclusion 合并: 统一为 shared/contracts/v1/diagnosis.contract.ts 单一定义 | M (4h) | B-契约 | `grep -rn "interface DiagnosisConclusion" server/` 返回唯一位置 |
| 2 | FIX-005 | UrgencyLevel 统一: 合并到 common.contract.ts | S (2h) | B-契约 | `grep -rn "type.*Urgency" server/` 返回唯一位置 |
| 3 | FIX-025 | 两套 severity 兼容映射: 算法层和 HDE 层通过映射函数桥接 | S (2h) | B-契约 | 映射函数单元测试覆盖全部枚举值 |
| 4 | FIX-026 | SeverityLevel→Severity 映射函数 | S (2h) | B-契约 | 单元测试: attention→low, warning→medium |
| 5 | FIX-060 | mysqlEnum severity 统一: 所有表使用相同值域 | M (4h) | B-契约 | `grep -rn "mysqlEnum.*severity" drizzle/` 值域一致; 迁移脚本存在 |
| 6 | FIX-010 | 前端 equipmentId 映射: 关键页面使用 DeviceIdMapper 转换 | M (4h) | A-命名 | digital-twin 页面使用 machineId 调用 API |
| 7 | FIX-011 | Neo4j deviceId 统一: 知识图谱查询使用 machineId | M (4h) | A-命名 | neo4j.storage.ts 查询参数为 machineId |
| 8 | FIX-016 | 契约字段名修正: data-contracts.ts 12 处字段名与实际代码对齐 | M (4h) | B-契约 | `pnpm check` 通过; 契约与实际使用一致 |
| 9 | FIX-021 | Schema 注册表激活: event-schema-registry.ts validate() 在 publish() 强制调用 | S (2h) | C-事件 | 单元测试: 不合规 payload 被拒绝 |
| 10 | FIX-043 | 类型断言替换: 消除 as Record<string, unknown> | S (2h) | C-事件 | `grep -rn "as Record<string, unknown>" server/` 返回 0 行 |
| 11 | FIX-096 | Kafka Schema 校验强制: Kafka publish 经过 schema 校验 | M (4h) | C-事件 | Kafka 消费者收到的消息全部通过 schema 校验 |
| 12 | FIX-028 | tRPC 输出校验中间件: 核心 5 个路由添加输出 Zod 校验 | L (2d) | B-契约 | dev 模式输出校验失败抛错; prod 模式 warn+降级 |
| 13 | FIX-029 | 错误码接入 tRPC: PlatformErrorResponse 中间件，错误响应含 XYYZZZ 格式码 | M (4h) | B-契约 | API 错误响应包含 code/message/traceId |
| 14 | FIX-063 | GrokTool getSensorData 实现: 连接 ClickHouse 查询真实传感器数据 | M (4h) | E-功能 | 集成测试: 返回非 stub 数据; isStub 标记不存在 |
| 15 | FIX-064 | GrokTool getMaintenanceHistory 实现: 连接 MySQL 查询维护记录 | M (4h) | E-功能 | 集成测试: 返回 MySQL 真实数据 |
| 16 | FIX-070 | GrokTool getAlarmHistory 实现: 连接 MySQL 查询告警历史 | M (4h) | E-功能 | 返回真实告警记录 |
| 17 | FIX-082 | confidence 硬编码清理 Phase 1: 定义 ConfidenceCalculator 工具类，替换 fusionDiagnosis 中 7 处 | L (2d) | E-功能 | FIX-086 fusionDiagnosis 无 hardcoded confidence |
| 18 | FIX-094 | Neo4j 种子数据导入: 完善设备-部件-故障关系图基础数据 | M (4h) | E-功能 | Neo4j 可查询完整的设备层级关系 |
| 19 | FIX-095 | 进化飞轮持久化: 影子评估和冠军挑战者结果写入 MySQL | M (4h) | E-功能 | 评估结果可从数据库查询 |
| 20 | FIX-120 | 安全检查升级 AST: 用 AST 分析替代正则匹配 | M (4h) | D-安全 | eval 变体无法绕过检测; 单元测试覆盖 |
| 21 | FIX-122 | 插件签名验证: Ed25519 签名校验，无签名插件被拒绝 | M (4h) | D-安全 | 无签名插件执行时抛出 PluginSignatureError |
| 22 | FIX-003 | 时间戳类型统一 Phase 1: 创建 toEpochMs() 工具函数，定义时间戳使用规范 | L (1d) | A-命名 | 工具函数存在; 文档描述规范 |
| 23 | FIX-077 | AlertManager 集成: createAlertRule 调用真实 Prometheus API | M (4h) | E-功能 | 创建规则后 Prometheus 端可见 |
| 24 | FIX-093 | HDE 端到端测试: 物理轨+数据轨→融合→结论完整流程 | L (1d) | E-功能 | 测试文件存在且通过 |
| 25 | FIX-135 | AI 模块测试: server/platform/ai/ 每个子模块至少 1 个测试 | L (1d) | E-功能 | 3 个测试文件存在 |

### 工作量汇总

| 主线 | 任务数 | 总工时 |
|------|--------|--------|
| A-命名 | 3 | 1.5d |
| B-契约 | 8 | 4d |
| C-事件 | 3 | 1d |
| D-安全 | 2 | 1d |
| E-功能 | 9 | 5d |
| **合计** | **25** | **~12.5d (5 人天 × 5d 内完成)** |

### Sprint 2 完成后系统状态

```
✅ DiagnosisConclusion 全平台唯一定义
✅ Severity/Urgency 枚举统一 + 旧类型有映射函数
✅ mysqlEnum severity 各表值域一致
✅ 设备 ID: 前端 + Neo4j 使用统一 machineId
✅ data-contracts.ts 字段名与实际代码一致
✅ EventBus Schema 校验强制执行 (dev 模式)
✅ Kafka Schema 校验强制执行
✅ tRPC 核心路由有输出校验 + 统一错误码
✅ GrokTool 3 个高频工具返回真实数据 (getSensorData/getMaintenanceHistory/getAlarmHistory)
✅ confidence 硬编码清理启动 (fusionDiagnosis 完成)
✅ Neo4j 种子数据完整
✅ 进化飞轮结果可持久化
✅ 插件安全: AST 检测 + 签名验证
✅ 时间戳工具函数就位
✅ AlertManager 集成完成
✅ HDE 端到端测试通过
```

---

## Sprint 3: 中优先级 + 体系化 (Week 3: 2026-03-16 ~ 03-20)

### 目标

完善事件系统架构，继续 GrokTool 实现，算法参数配置化，前端核心页面补全。

### 任务列表

| 序号 | FIX-ID | 描述 | 工作量 | 负责主线 | 验收标准 |
|------|--------|------|--------|----------|----------|
| 1 | FIX-022 | EventBus Facade 统一: 创建 unified-event-bus.ts，按特征路由到 Kafka 或内存 | L (2d) | C-事件 | UnifiedEventBus 类通过单元测试; 高吞吐事件走 Kafka |
| 2 | FIX-023 | DLQ 实现: 处理失败消息写入死信队列 + 重试机制 | M (4h) | C-事件 | DLQ 处理器存在; 失败消息可查询 |
| 3 | FIX-024 | 消费者健康检查: 30s 心跳 + 离线告警 | M (4h) | C-事件 | 消费者停止后 30s 内触发告警日志 |
| 4 | FIX-126 | 双总线路由策略: 事件根据 topicConfig 选择通道 | M (4h) | C-事件 | 单元测试覆盖路由逻辑 |
| 5 | FIX-017 | 契约类型修正: data-contracts.ts 8 处类型与实际传值对齐 | M (4h) | B-契约 | `pnpm check` 通过 |
| 6 | FIX-018 | 契约字段补全: 6 处缺失字段添加到契约 | S (2h) | B-契约 | 契约与实际发送字段完全匹配 |
| 7 | FIX-019 | 契约多余字段清理: 5 处实际代码中的字段纳入契约 | S (2h) | B-契约 | 无未定义字段 |
| 8 | FIX-031 | Zod schema 提取: 核心路由的 Zod schema 移至 shared/contracts/ | L (2d) | B-契约 | 至少 10 个路由的 Zod schema 从 contracts/ import |
| 9 | FIX-035 | JSON 时间戳统一: evolution-schema 内 timestamp 全部用 number | S (2h) | A-命名 | evolution-schema JSON 字段 timestamp 类型一致 |
| 10 | FIX-036 | API Date→number 转换: Drizzle Date 字段在 API 层转为 epoch ms | S (2h) | A-命名 | API 响应 timestamp 为 number 类型 |
| 11 | FIX-083 | agent-plugins confidence 配置化: 0.96/0.4/0.35 改为参数对象 | M (4h) | E-功能 | 参数从 config 或 input.params 读取 |
| 12 | FIX-086 | fusionDiagnosis confidence 重构: 7 处硬编码改为从证据链计算 | M (4h) | E-功能 | 无 hardcoded confidence 赋值 |
| 13 | FIX-088 | meta-learner 阈值配置化: 0.7/0.6/0.4 改为配置 | M (4h) | E-功能 | 阈值从 config 读取; 单元测试覆盖 |
| 14 | FIX-065 | GrokTool getEquipmentSpecs 实现 | M (4h) | E-功能 | 返回设备规格真实数据 |
| 15 | FIX-066 | GrokTool getSimilarCases 实现: 连接 Neo4j 查询相似案例 | M (4h) | E-功能 | 返回 Neo4j 匹配案例 |
| 16 | FIX-071 | GrokTool getTrendAnalysis 实现: 调用算法库趋势分析 | M (4h) | E-功能 | 返回趋势分析结果 |
| 17 | FIX-048 | evolution-schema 类型细化: 38 处 Record<string, unknown> 替换为具体接口 | L (2d) | B-契约 | Record<string, unknown> 在 evolution-schema 中减少到 <5 处 |
| 18 | FIX-081 | 工具系统统一 Phase 1: 定义 ToolContract 接口，GrokTool 适配器 | L (1d) | E-功能 | ToolContract 接口存在; GrokTool 通过适配器注册 |
| 19 | FIX-100 | 配置参数清理: 11 个未生效配置添加定义或移除引用 | M (4h) | A-命名 | 所有 config.xxx 引用在 config.ts 有定义 |
| 20 | FIX-123 | 工具系统合并: GrokTool + ToolDefinition 通过 ToolContract 统一 | L (1d) | E-功能 | 两套工具通过统一注册表访问 |
| 21 | FIX-114 | 前端空壳页面批量修复 Phase 1: 优先修复 Dashboard/设备列表/诊断等 5 个高频页面 | XL (3d) | 前端 | 5 个核心页面有功能 UI 而非骨架 |
| 22 | FIX-139 | 算法库测试: 每个分类至少 2 个单元测试 | XL (3d) | E-功能 | 12 个算法分类各 2 个测试用例通过 |

### 工作量汇总

| 主线 | 任务数 | 总工时 |
|------|--------|--------|
| A-命名 | 3 | 1d |
| B-契约 | 5 | 4d |
| C-事件 | 4 | 3d |
| E-功能 | 8 | 5d |
| 前端 | 1 | 3d |
| **合计** | **22** | **~14d (适合 5 人 3d 或 3 人 5d)** |

### Sprint 3 完成后系统状态

```
✅ UnifiedEventBus Facade 统一 Kafka + 内存双通道
✅ DLQ 死信队列 + 消费者健康检查 + 路由策略完成
✅ data-contracts.ts 31 处断裂全部修复
✅ Zod schema 核心路由已提取到 shared/contracts/
✅ JSON 时间戳和 API Date 统一为 number
✅ 算法 confidence 硬编码清理: agent-plugins/fusionDiagnosis/meta-learner 完成
✅ GrokTool: 6/12 工具已实现 (getSensorData/getMaintenanceHistory/getAlarmHistory/getEquipmentSpecs/getSimilarCases/getTrendAnalysis)
✅ evolution-schema 类型细化基本完成
✅ ToolContract 统一接口定义完成
✅ 配置参数全部有效
✅ 前端 5 个核心页面功能完整
✅ 算法库 12 分类各有测试
```

---

## Sprint 4: 低优先级 + 收尾 (Week 4: 2026-03-23 ~ 03-27)

### 目标

完成剩余所有修复，测试覆盖率达标，文档和基础设施收尾。

### 任务列表

| 序号 | FIX-ID | 描述 | 工作量 | 负责主线 | 验收标准 |
|------|--------|------|--------|----------|----------|
| 1 | FIX-006 | PipelineStatus 统一 | S (2h) | B-契约 | 唯一定义 |
| 2 | FIX-007 | MaintenancePriority 消除重叠 | S (2h) | B-契约 | 使用 Urgency 或提供映射 |
| 3 | FIX-008 | Kafka 消息体命名转换层 | M (4h) | A-命名 | camelCase 转换器存在 |
| 4 | FIX-009 | eventBus.publish() topic 参数修正 | XS (<1h) | C-事件 | 调用签名正确 |
| 5 | FIX-012 | sensor-simulator 命名统一 | S (2h) | A-命名 | 使用 camelCase |
| 6 | FIX-013 | SNAKE_TO_CAMEL 映射表清理 | S (2h) | A-命名 | 映射表与实际一致 |
| 7 | FIX-014 | config 属性路径文档化 | S (2h) | A-命名 | 每个属性有 JSDoc |
| 8 | FIX-015 | metrics snake_case 文档说明 | XS (<1h) | A-命名 | 注释说明 Prometheus 规范 |
| 9 | FIX-027 | AnomalySeverity 映射函数 | S (2h) | B-契约 | 单元测试覆盖 |
| 10 | FIX-030 | API 版本路由 /api/v1/ | M (4h) | B-契约 | API 路径包含版本号 |
| 11 | FIX-033 | shared/ 类型按域重组 | M (4h) | B-契约 | 类型分布在 contracts/v1/ 下 |
| 12 | FIX-034 | 旧类型 @deprecated 标注 | S (2h) | B-契约 | JSDoc @deprecated 标注 |
| 13 | FIX-037 | ClickHouse timestamp 统一 | S (2h) | A-命名 | 查询参数使用 number |
| 14 | FIX-038 | streamProcessor timestamp 修正 | S (2h) | A-命名 | 输出 timestamp 为 number |
| 15 | FIX-039 | feature-extraction timestamp 统一 | XS (<1h) | A-命名 | 类型一致 |
| 16 | FIX-042 | Kafka topic 版本兼容策略 | M (4h) | C-事件 | TopicRegistryEntry 含 compatibility |
| 17 | FIX-044 | Schema Registry 服务配置 | M (4h) | C-事件 | docker-compose 包含服务 |
| 18 | FIX-045 | CI 契约兼容性检测 | L (1d) | B-契约 | .github/workflows/contract-check.yml 存在 |
| 19 | FIX-046 | 前后端契约同步 | M (4h) | B-契约 | 前端类型从 contracts/ 推导 |
| 20 | FIX-049 | hde-schema 类型细化 | M (4h) | B-契约 | json 字段有具体接口 |
| 21 | FIX-050 | toolInput/toolOutput Zod schema | S (2h) | B-契约 | Zod 校验存在 |
| 22 | FIX-051 | Action/result payload 类型定义 | S (2h) | B-契约 | 接口定义存在 |
| 23 | FIX-053 | gRPC TypeScript 生成完善 | M (4h) | B-契约 | 所有 proto 有对应 .ts |
| 24 | FIX-054 | createAlertRule 参数类型修正 | XS (<1h) | B-契约 | 非 any 类型 |
| 25 | FIX-055 | createSilence 参数类型修正 | XS (<1h) | B-契约 | 非 any 类型 |
| 26 | FIX-056 | orchestrator-hub 返回类型 | S (2h) | B-契约 | 接口定义存在 |
| 27 | FIX-057 | Kafka 消息 timestamp 转换 | S (2h) | C-事件 | 类型转换层存在 |
| 28 | FIX-058 | nl-interface payload 校验 | S (2h) | C-事件 | Schema 校验后发布 |
| 29 | FIX-059 | ConditionNormalizer fetch→tRPC | S (2h) | 前端 | 使用 tRPC hooks |
| 30 | FIX-061 | Store 与 API 类型对齐 | M (4h) | 前端 | 类型从 contracts/ import |
| 31 | FIX-067 | GrokTool getWeatherData | S (2h) | E-功能 | 返回数据或明确标记不可用 |
| 32 | FIX-068 | GrokTool runSimulation | L (1d) | E-功能 | 调用数字孪生引擎 |
| 33 | FIX-069 | GrokTool getOperationalContext | M (4h) | E-功能 | 返回作业上下文 |
| 34 | FIX-072 | GrokTool getExpertKnowledge | M (4h) | E-功能 | 返回知识图谱知识 |
| 35 | FIX-052 | diagnostic-enhancer 类型断言消除 | S (2h) | B-契约 | 无 as Record |
| 36 | FIX-062 | WorldModel 训练接口: status:'not_implemented' + 前端提示 | XL (按需) | E-功能 | 前端显示"功能开发中" |
| 37 | FIX-073~076 | 前端 placeholder 页面标记 | S (2h) | 前端 | 页面明确显示开发状态 |
| 38 | FIX-078 | AlertManager createSilence 集成 | M (4h) | E-功能 | 调用真实 API |
| 39 | FIX-079 | orchestrator-hub 实现 | L (1d) | E-功能 | 不返回 {stub:true} |
| 40 | FIX-084 | structural 算法参数配置化 | M (4h) | E-功能 | 从 config 读取 |
| 41 | FIX-085 | cusumChangePoints 参数化 | S (2h) | E-功能 | threshold 从参数传入 |
| 42 | FIX-087 | grokDiagnosticAgent confidence 计算 | S (2h) | E-功能 | 从推理结果计算 |
| 43 | FIX-089 | genetic-strategy 参数配置化 | S (2h) | E-功能 | 适应度参数可配置 |
| 44 | FIX-097 | 数据质量集成测试 | M (4h) | E-功能 | 评分→分级→告警流程通过 |
| 45 | FIX-098 | 跨设备对比优化 | L (1d) | E-功能 | 100+ 设备查询 <3 秒 |
| 46 | FIX-099 | 工况归一化顺序修正 | S (2h) | E-功能 | 参数顺序无关性测试通过 |
| 47 | FIX-105 | Grafana 密码安全化 | XS (<1h) | D-安全 | 环境变量注入 |
| 48 | FIX-107 | Vault 非 dev 模式配置 | M (4h) | D-安全 | 支持生产模式 |
| 49 | FIX-108 | Prometheus targets 启用 | S (2h) | D-安全 | 全部 target 可达 |
| 50 | FIX-109 | Helm ingress 模板化 | XS (<1h) | D-安全 | hostname 使用变量 |
| 51 | FIX-110 | gRPC 健康检查修正 | S (2h) | D-安全 | 使用 K8s service DNS |
| 52 | FIX-121 | 插件生命周期管理 | L (1d) | D-安全 | 状态机测试通过 |
| 53 | FIX-124 | ReAct 链回放 | M (4h) | E-功能 | step 可序列化/反序列化 |
| 54 | FIX-125 | EventBus 接入工具系统 | S (2h) | C-事件 | 工具执行后发布事件 |
| 55 | FIX-127 | ClickHouse 表名清理 | M (4h) | D-安全 | 表名唯一无歧义 |
| 56 | FIX-128 | Neo4j 备份策略 | M (4h) | D-安全 | 备份脚本存在 |
| 57 | FIX-129 | Redis 淘汰策略 | S (2h) | D-安全 | maxmemory-policy 设置 |
| 58 | FIX-130 | MySQL 分片键注释 | XL (5d) | D-安全 | 关键表有分片键 |
| 59 | FIX-131 | Saga/Outbox 补偿逻辑 | L (1d) | E-功能 | 写入失败触发补偿 |
| 60 | FIX-132 | Grafana dashboard ID | XS (<1h) | D-安全 | 有效 id 值 |
| 61 | FIX-133 | PodSecurityStandards 迁移 | S (2h) | D-安全 | 使用新标准 |
| 62 | FIX-136 | Pipeline DAG 引擎测试 | M (4h) | E-功能 | >5 个测试用例 |
| 63 | FIX-137 | Observability 模块测试 | M (4h) | E-功能 | >3 个测试文件 |
| 64 | FIX-138 | 协议适配器测试 | L (1d) | E-功能 | 5 个核心适配器有测试 |
| 65 | FIX-140 | HDE 端到端测试文件 | L (1d) | E-功能 | 测试通过 |
| 66 | FIX-141 | 感知管线端到端测试 | L (1d) | E-功能 | 测试通过 |
| 67 | FIX-142 | Proto CI 验证 | S (2h) | B-契约 | CI 中 proto 编译通过 |
| 68 | FIX-143 | MySQL 初始化脚本 | S (2h) | D-安全 | docker/mysql/init/ 存在 |
| 69 | FIX-080 | tooling 域实现 | XL (3d) | E-功能 | 真实工具执行结果 |
| 70 | FIX-111~118 | 前端页面补全 Phase 2 | XL (3d) | 前端 | 空壳页面 <10 个 |

### 工作量汇总

| 主线 | 任务数 | 总工时 |
|------|--------|--------|
| A-命名 | 7 | 1.5d |
| B-契约 | 18 | 7d |
| C-事件 | 5 | 2d |
| D-安全 | 12 | 5d |
| E-功能 | 22 | 12d |
| 前端 | 6 | 5d |
| **合计** | **70** | **~32.5d** |

> Sprint 4 工作量大于前 3 个 Sprint，因为包含大量低优先级收尾任务。
> 建议: 从中选择 ROI 最高的 30-40 个任务完成，剩余推入下一迭代。

### Sprint 4 完成后系统状态

```
✅ 143 项问题全部修复或明确标记开发状态
✅ 命名: 全平台 machineId 统一 + 映射层
✅ 契约: shared/contracts/v1/ 覆盖 6 个域 + CI 检测
✅ 事件: UnifiedEventBus + DLQ + 健康检查 + 路由策略
✅ 安全: isolated-vm 沙箱 + AST 检测 + 签名验证 + 密码安全
✅ GrokTool: 12/12 工具全部实现或明确不可用
✅ confidence: 62 处硬编码全部替换为计算值或配置值
✅ 流程: 14 条流程中 10+ 条端到端可通
✅ 测试: 覆盖率从 13.6% 提升至 40%+
✅ 前端: 空壳页面 <10 个
✅ 文档: PITFALLS.md 中所有条目有对应修复
```

---

## 风险和应急

### Sprint 级别风险

| Sprint | 风险 | 概率 | 影响 | 应急 |
|--------|------|------|------|------|
| Sprint 1 | FIX-001 设备 ID 重命名引发大量编译错误 | 高 | 阻断 | 分批重命名 + 每批 pnpm check |
| Sprint 1 | FIX-119 isolated-vm 系统不兼容 | 中 | 阻断 | 回退到 Worker Thread 方案 |
| Sprint 2 | FIX-060 mysqlEnum 变更影响现有数据 | 中 | 数据丢失 | 先 ALTER ADD 新值再 UPDATE 再 DROP 旧值 |
| Sprint 2 | FIX-020 EventBus 校验阻断现有事件流 | 高 | 功能中断 | dev 先 warn 不阻断 |
| Sprint 3 | FIX-022 双总线统一引入消息丢失 | 中 | 数据丢失 | 保留旧总线作为 fallback |
| Sprint 4 | 工作量超出预期 | 高 | 延期 | 优先级排序，低优先级推入下一迭代 |

### 每日站会检查点

```
每日必答三个问题:
1. 昨天完成了哪些 FIX-ID？
2. 今天计划处理哪些 FIX-ID？
3. 哪些 FIX-ID 遇到阻塞？阻塞原因？
```

---

## 度量指标

### Sprint 结束统计

| 指标 | Sprint 1 目标 | Sprint 2 目标 | Sprint 3 目标 | Sprint 4 目标 |
|------|-------------|-------------|-------------|-------------|
| 致命问题剩余 | 0 | 0 | 0 | 0 |
| 严重问题剩余 | ≤35 | ≤10 | ≤3 | 0 |
| 中等问题剩余 | ≤55 | ≤45 | ≤25 | ≤5 |
| 低问题剩余 | ≤24 | ≤24 | ≤20 | ≤5 |
| pnpm check 错误 | 0 | 0 | 0 | 0 |
| 测试覆盖率 | 记录基线 | 20% | 30% | 40% |
| 流程可通数 (14条) | 5 | 8 | 11 | 13 |

---

> 本文档与 docs/COMPLETE_FIX_PLAN.md 和 docs/FIX_DEPENDENCY_GRAPH.md 联动使用。
> FIX-ID 全局唯一，跨文档引用一致。
