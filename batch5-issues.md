# 第五批审查问题清单 — 前端核心层（批次15）

## P1 高优先级（3项）

### P1-A1: useAuth.ts — 用户信息明文写入 localStorage
- 第44行: localStorage.setItem('manus-runtime-user-info', JSON.stringify(meQuery.data))
- 含 userId/roles/permissions 等敏感字段
- logout 后 meQuery.data 变为 null 时写入 'null' 而非清除
- key 名 'manus-runtime' 泄露旧平台名称
- 修复: 删除 localStorage 写入，logout 时 removeItem

### P1-A2: appStore.ts — 硬编码 API_BASE = 'http://localhost:8000'
- 第11行: export const API_BASE = 'http://localhost:8000'
- 生产环境指向错误地址
- 应删除该常量，全局搜索使用位置

### P1-V1: EvolutionBoard.tsx — 整页 Mock 数据，无 tRPC 对接
- mockModels/mockRules/mockHealthMetrics 全部静态数据
- 未导入 trpc，所有按钮只触发本地 useState
- 进化引擎是平台核心价值主张，此问题严重
- 需实现 trpc.evolution.* 接口调用

## P2 中优先级（8项）

### P2-E1: main.tsx — 本地开发认证跳过基于 hostname 检测
- window.location.hostname === 'localhost' || '127.0.0.1'
- Docker Compose 环境失效
- 与服务端 SKIP_AUTH 机制不同步

### P2-E2: App.tsx — 旧路由 Redirect 无提示
- /device/list, /device/maintenance 等直接重定向无提示
- 掩盖路径映射错误
- 建议添加 deprecation warning

### P2-S1: pipelineEditorStore.ts — completeConnection 缺少环路检测
- 只检查自连(fromNodeId===toNodeId)
- 未检测有向环(A→B→C→A)
- DAG 有向环导致执行引擎无限循环
- 需 DFS/BFS 环路检测

### P2-T1: types/index.ts — DataSourceConfig 含明文 password 字段
- 若被 zustand persist 序列化，密码明文持久化到 localStorage
- 应从前端类型中移除 password 字段

### P2-M1: ModelCenter.tsx — sendMessage 乐观更新竞态
- slice(0,-1) 在并发时误删错误消息
- 应使用 tempId 精准匹配删除

### P2-F1: FusionDiagnosis.tsx — beliefMass 柱图无归一化校验
- 柱宽基于 value/maxVal 而非 value/1.0
- 总和≠1 时无警告提示

### P2-Tr1: AutoTrain.tsx — 训练任务 CRUD 无后端对接
- mockJobs 硬编码5个训练任务
- mutation 只是 toast + setTimeout 模拟

### P2-CN1: ConditionNormalizer.tsx — 工况定义 Tab 使用 Mock
- 归一化控制台调用真实 tRPC
- 工况定义管理 Tab 使用 useState 维护 mockConditions
- 混用模式导致刷新后重置

### P2-Tp1: SystemTopology.tsx — 节点拖拽无节流
- mousemove 直接触发 updateNodePositionMutation.mutate()
- 每16ms一次请求，拖拽一秒约60次
- 应 mouseup 时才提交最终位置

### P2-Pd1: PlatformDiagnostic.tsx — 模块开关修改后未刷新 overviewQuery
- toggleModule 成功后只 refetch featureFlagsQuery
- overviewQuery 的 totalEnabled/totalDisabled 未同步刷新

### P2-I1: Infrastructure.tsx — 容器操作无确认弹窗
- stop/restart 直接执行，无二次确认
- 生产环境误触风险

## P3 低优先级（6项）

### P3-E1: main.tsx — QueryClient 未配置 staleTime
- 默认 staleTime=0，窗口聚焦频繁重新请求

### P3-E2: App.tsx — MicroserviceDashboard 路由缺失
- navigation.ts 有条目但 App.tsx 无对应路由

### P3-H1: useTableSchema.ts — getERPosition fallback Math.random()
- ER 图位置每次加载随机跳动

### P3-M1: ModelCenter.tsx — createConversationMutation 未 try-catch
- 创建失败后 conversationId 为 null

### P3-F1: FusionDiagnosis.tsx — FAULT_TYPE_LABELS 与后端枚举各自维护
- 漂移风险，应移至 shared/constants

### P3-Tr1: AutoTrain.tsx — statusConfig icon 类型问题
- React.ReactNode 存入普通对象，SSR 场景可能有问题

### P3-K1: KafkaMonitor.tsx — TopicList 硬编码分区/副本数
- 固定显示「分区: 3 | 副本: 1」

### P3-Tp1: SystemTopology.tsx — hasFittedView 状态控制边界
- 可能在 refetchInterval 触发时重复执行 fitView

### P3-A1: AlgorithmOverview.tsx — pageSize=100 无分页
- 硬编码最大100条，超出不提示
