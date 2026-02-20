# 第四批审查问题清单 — API路由层

## P0 安全漏洞（3项）

### S0-1: accessLayer.router.ts — 全部12个端点无认证
- 所有 mutation 改为 protectedProcedure
- 只读 query 至少改为 protectedProcedure

### S0-2: 6个核心业务路由全部 publicProcedure
- advancedDistillation.router.ts — mutation 改为 protectedProcedure
- conditionNormalizer.router.ts — mutation 改为 protectedProcedure
- fusionDiagnosis.router.ts — ✅ 已在第三批修复
- grokDiagnostic.router.ts — mutation 改为 protectedProcedure
- kgOrchestrator.router.ts — mutation 改为 protectedProcedure
- platformHealth.router.ts — mutation 改为 protectedProcedure

### S0-3: registry.router.ts — 元数据暴露
- 添加速率限制
- 评估是否改为 protectedProcedure

## P1 功能 Bug（5项）

### P1-1: docker.router.ts — MySQL 迁移失败后仍继续启动
- migrate 失败时立即返回 success:false 并阻断后续服务启动

### P1-2: kafka.router.ts — listTopics 未标记数据来源
- 返回结构添加 source 字段（'kafka'|'predefined'）

### P1-3: microservice.router.ts — getPrometheusMetrics 伪随机数据
- 优先从真实 Prometheus 查询
- 若不可用，明确标记 isSimulated:true

### P1-4: observability.router.ts — getNodeMetrics 数据源不一致
- 统一回退逻辑：优先真实 prometheusClient
- 模拟数据添加来源标记

### P1-5: pipeline.router.ts — legacyConfigToDAG timezone 丢失
- 添加默认 timezone（Asia/Shanghai）

## P2 架构改进（7项）

### A2-1: 权限控制策略不一致 — 31个文件权限混乱
### A2-2: database.router.ts 超大文件（1200行）
### A2-3: Docker 服务启动顺序硬编码
### A2-4: 微服务定义硬编码
### A2-5: 可观测性数据源混用
### A2-6: Pipeline 资源扫描器硬编码
### A2-7: WebSocket 服务功能重复
