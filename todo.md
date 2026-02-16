# PortAI Nexus V4 融合 — 统筹盘点

## 一、已完成

### 后端 Drizzle 层
- [x] schema.ts: 72 张表（原 54 + 新增 18）
- [x] 9 张现有表补充 46 个 V4.0 新字段
- [x] relations.ts: 226 行完整关系定义

### 前端数据层 + 设计器组件（已迁移）
- [x] Schema Registry 70 表 / 972 字段 / 14 域
- [x] 7 个设计器组件 + DDL 工具
- [x] useTableSchema hook
- [x] DatabaseOverview 添加统计卡片
- [x] DatabaseWorkbench 添加 lazy import
- [x] navigation.ts 添加 Schema 入口

### 后端 service + router（已通过三层架构路由实现）
- [x] plugin CRUD → server/operations/routes/plugin.routes.ts (registryRouter + instancesRouter + eventsRouter)
- [x] governance CRUD → server/operations/routes/governance.routes.ts (dataExportRouter + lineageRouter + syntheticDatasetsRouter)
- [x] ops CRUD → server/api/ops.router.ts (仪表盘/自动化/边缘计算)
- [x] schedule CRUD → server/platform/routes/system.routes.ts (scheduledTasksRouter)
- [x] alertRules CRUD → server/platform/routes/system.routes.ts (alertRulesRouter)
- [x] auditLogs CRUD → server/platform/routes/system.routes.ts (auditLogsRouter)
- [x] configChangeLogs → server/platform/routes/system.routes.ts (dataPermissionsRouter.configChangeLogs)
- [x] database.router.ts 注册全部路由

### 接入层协议适配器（15个生产级实现）
- [x] BaseAdapter 抽象基类 + 统一错误体系 + 连接池 + 指标收集
- [x] 15个协议适配器全部真实实现（MQTT/OPC-UA/Modbus/MySQL/PG/CH/InfluxDB/Redis/Neo4j/Qdrant/Kafka/MinIO/HTTP/gRPC/WebSocket）
- [x] 前端 AccessLayerManager 高级配置可折叠区域 + JSON 字段 + 分组渲染

## 二、待完成

### 前端集成
- [x] DatabaseWorkbench 完成 Schema/ER/Visual 三个新 Tab 渲染
  - SchemaTableManagement (208行) + DataBrowser (348行) + SqlEditor (312行) + StatusBar + ExportDDLDialog (246行)
  - ERDiagram (557行) 完整 ER 关系图
  - VisualDesigner (507行) 可视化设计器
- [x] Schema Registry 与 Drizzle 72 表精确对齐
- [x] 导航路由确认可达

### 验证
- [x] TypeScript 编译通过（零错误）
- [x] 全链路完整（代码层面，运行时需数据库/ClickHouse/Docker 连接）

### Docker引擎生命周期管理（已完成）
- [x] 后端：dockerManager.service.ts (633行) - Docker Engine API 管理
- [x] 后端：docker.router.ts (117行) - tRPC路由
- [x] 后端：已注册到appRouter
- [x] 前端：Infrastructure页面 DockerEnginePanel 面板（启用/禁用/重启/日志/统计）

## 三、当前任务：协议注册中心自动同步机制

### 核心问题
适配器层更新后，上层 API/类型/前端未自动同步，导致前端只显示 MQTT

### 待完成
- [ ] 后端：适配器注册表新增 listProtocols / listCategories API，自动从注册表生成
- [ ] 后端：protocolSchema API 直接从注册表读取，新增适配器自动可用
- [ ] 前端：移除硬编码 PROTOCOL_META/PROTOCOL_CATEGORIES，改为从 API 动态获取
- [ ] 前端：新建连接器对话框动态渲染协议列表和配置表单
- [ ] 全链路验证：15个协议全部可见可配置

## 四、已完成排查任务

### Pipeline 编排界面排查
- [x] Pipeline 编排页面代码完整（PipelineEditor 679行 + 9个子组件 + Store + 共享类型 1005行）
- [x] 路由 /settings/design/pipeline 已注册，导航栏有入口
- [x] tRPC 路由 pipeline.list/get/save/run/delete 完整实现 (416行)
- [x] 代码层面无结构性问题，运行时需数据库连接支持

### 页面修复
- [x] 插件管理页面代码完整（tRPC 调用路径匹配，运行时需数据库支持）
- [x] ClickHouse 监控页面代码完整（tRPC 调用路径匹配，运行时需 ClickHouse 连接）

## 五、算法库完整开发（45个算法 + 平台集成）

### 5.1 核心框架层
- [x] DSP工具库 (server/algorithms/_core/dsp.ts) — FFT/窗函数/滤波器/Hilbert变换/统计函数
- [x] 统一执行引擎 (server/algorithms/_core/engine.ts) — 注册/发现/执行/调度/缓存
- [x] 类型定义 (server/algorithms/_core/types.ts) — AlgorithmInput/Output/DiagnosisConclusion
- [x] 设备依赖接口 (server/algorithms/_core/dependencies.ts) — 设备/轴承/工况/材料/历史数据

### 5.2 机械算法 (8个)
- [ ] FFT频谱分析 — Cooley-Tukey FFT + ISO 10816/20816评估 + 特征频率标注
- [ ] 倒频谱分析 — 功率/复倒频谱 + 齿轮箱故障检测
- [ ] 包络解调分析 — Hilbert变换 + 自适应带通 + BPFO/BPFI/BSF/FTF匹配
- [ ] 小波包分解 — 多层分解(db4/db8/sym5) + 能量分布 + Shannon熵
- [ ] 带通滤波 — Butterworth/Chebyshev IIR + 零相位滤波
- [ ] 谱峭度SK — Fast Kurtogram (Antoni 2006) + 最佳频带选择
- [ ] 重采样 — 多项式插值 + 抗混叠 + 角度域重采样
- [ ] 阶次跟踪分析 — 角度域重采样 + 阶次谱 + 变速工况诊断

### 5.3 电气算法 (4个)
- [ ] 电机电流分析MCSA — 转子/偏心/轴承故障边带检测
- [ ] 局部放电PD分析 — PRPD模式 + IEC 60270 + 缺陷分类
- [ ] 变频器状态分析 — 输入谐波 + PWM质量 + 直流母线纹波
- [ ] 电能质量分析 — THD/TDD (IEEE 519) + 个次谐波 + 三相不平衡

### 5.4 结构算法 (5个)
- [ ] Miner线性累积损伤 — D=Σ(ni/Ni) + S-N曲线 + 剩余寿命
- [ ] 声发射分析AE — 参数分析 + 三角定位(TDOA) + Felicity比
- [ ] 模态分析 — FDD频域分解 + 固有频率/阻尼比/振型 + MAC
- [ ] 热点应力法 — 线性/二次外推 + SCF + IIW焊接疲劳评估
- [ ] 雨流计数法 — ASTM E1049四点法 + Markov矩阵

### 5.5 异常检测算法 (4个)
- [ ] Isolation Forest — 随机森林异常检测 + 异常分数
- [ ] LSTM异常检测 — 预测+残差 + 自适应阈值
- [ ] 自编码器异常检测 — 重构误差 + 多变量
- [ ] 统计过程控制SPC — Shewhart/CUSUM/EWMA + Western Electric规则

### 5.6 优化算法 (4个)
- [ ] 粒子群优化PSO — 自适应惯性权重 + 多目标 + 约束处理
- [ ] 遗传算法GA — 实数编码 + SBX交叉 + 精英保留
- [ ] 贝叶斯优化 — 高斯过程 + EI/UCB/PI采集函数
- [ ] 模拟退火SA — Metropolis准则 + 自适应温度

### 5.7 综合算法 (4个)
- [ ] DS证据理论融合 — Dempster-Shafer + 冲突处理
- [ ] 关联规则挖掘 — Apriori + FP-Growth
- [ ] 因果推理 — PC算法 + Granger因果检验
- [ ] 工况归一化 — 多工况参数归一化 + 回归模型 + 残差分析

### 5.8 特征提取算法 (5个)
- [ ] 时域特征提取 — 统计特征 + AR系数
- [ ] 频域特征提取 — 频谱特征 + 频带能量比
- [ ] 时频域特征提取 — STFT + 小波系数 + 瞬时频率
- [ ] 统计特征提取 — 高阶统计量 + 信息熵 + 分形维数
- [ ] 深度特征提取 — 自编码器/1D-CNN + PCA/t-SNE降维

### 5.9 Agent插件 (6个)
- [ ] 时序模式专家 — 趋势/周期/突变识别 + 变点检测(CUSUM/PELT)
- [ ] 案例检索专家 — 相似度检索(余弦/DTW) + 特征匹配
- [ ] 物理约束专家 — 物理模型验证 + 约束一致性检查
- [ ] 空间异常专家 — 多传感器空间关联 + 异常传播路径
- [ ] 融合诊断专家 — 多算法融合(投票/加权/DS) + 置信度综合
- [ ] 预测专家 — 趋势外推 + RUL预测

### 5.10 模型迭代 (4个)
- [ ] LoRA微调 — 低秩自适应 + 参数高效训练
- [ ] 全量重训练 — 完整训练流程 + 数据版本管理
- [ ] 增量学习 — 在线更新 + 灾难性遗忘防护(EWC/LwF)
- [ ] 模型蒸馏 — 知识蒸馏(教师-学生) + 模型压缩

### 5.11 规则自动学习 (4个)
- [ ] LLM分析 — 大模型辅助规则生成 + 自然语言解析
- [ ] 关联规则学习 — 历史数据自动发现 + 置信度评估
- [ ] 决策树归纳 — CART/C4.5 + 规则提取简化
- [ ] 频繁模式挖掘 — PrefixSpan序列模式 + 时序关联规则

### 5.12 平台集成层
- [ ] 重构 ALGORITHM_CATEGORIES (10大分类对齐文档)
- [ ] 重写 BUILTIN_ALGORITHMS (45个算法完整种子数据)
- [ ] 服务启动自动同步 syncBuiltinAlgorithms
- [ ] 前端分类体系对齐 (CATEGORY_META 更新)
- [ ] 前端完整CRUD编辑界面 (新建/编辑/删除/查看)
- [ ] 算法编排新建功能完整可用
- [ ] 算法执行记录查看
- [x] UI字体/对话框规范化

### 5.13 验证与交付
- [ ] TypeScript编译零错误
- [ ] 服务器启动正常
- [ ] API端点测试通过
- [ ] 前端页面渲染正常
- [ ] 同步代码到GitHub

## 六、P0 审计修复任务

- [x] 1. Helm Chart 改单体部署（1 Deployment + HPA，删除微服务循环模板）
- [x] 2. GitHub Actions CI（tsc --noEmit + ESLint + smoke test + MySQL service）
- [x] 3. Prometheus/Grafana 部署配置完善（docker-compose + 3 Exporter + Alertmanager + cAdvisor + Jaeger）
- [x] 4. 初始化 OpenTelemetry traces（Prometheus 拉取模式 + 采样策略 + 自动插桩增强）

### 6.1 影响分析修复（7 项风险全部修复）
- [x] 高风险: 添加 /data emptyDir 卷挂载解决 readOnlyRootFilesystem 与 Kafka 归档冲突
- [x] 高风险: 添加 mysql-exporter/redis-exporter/kafka-exporter 到 docker-compose
- [x] 中风险: OTel Metrics 改为 Prometheus 拉取模式（不再推送到 Jaeger）
- [x] 中风险: 统一所有容器名为 xilian-* 前缀
- [x] 中风险: 恢复 commonEnv 中 REDIS_URL/DATABASE_URL/JWT_SECRET secret 注入
- [x] 低风险: CI 冒烟测试添加 MySQL service container
- [x] 低风险: cAdvisor 添加安全说明注释
