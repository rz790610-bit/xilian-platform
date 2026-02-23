# Phase 4 实施笔记

## 现有代码结构盘点

### 护栏引擎
- **引擎文件**: `server/platform/cognition/safety/guardrail-engine.ts` (545 行)
  - 12 条内置规则 (S-01~S-05, H-01~H-04, E-01~E-03)
  - GuardrailEngine 类：evaluate(), evaluateCondition(), evaluateCustomCondition()
  - 缺少 case 'trend' 分支
  - 无升级链、无 severity 量化、无 DB 加载、无 fallback
  - cooldownMs 仅在内存 lastTriggerTime Map 中使用

### 护栏路由
- **路由文件**: `server/domains/guardrail/guardrail.domain-router.ts` (408 行)
  - ruleRouter: list/get/create/update/delete
  - violationRouter: list/get/override
  - effectivenessRouter: byRule (空), overview (硬编码)
  - Facade: listRules, listAlertHistory, listAlerts, toggleRule, acknowledgeAlert
  - 注册路径: `server/routers.ts` → `evoGuardrail`

### 知识路由
- **路由文件**: `server/domains/knowledge/knowledge.domain-router.ts` (258 行)
  - getKnowledgeGraph, listCrystals, listFeatures, listModels, applyCrystal
  - 注册路径: `server/routers.ts` → `evoKnowledge`

### DDL
- **文件**: `docker/mysql/init/02-v5-ddl.sql` (470 行)
  - guardrail_rules: 缺 cooldown_ms, escalation_config
  - guardrail_violations: 缺 escalation_level, resolved_at, severity
  - knowledge_crystals: 缺 type, status, source_type, created_by, application_count, negative_feedback_rate, review_comment, content_hash
  - 无 guardrail_effectiveness_logs 表
  - 无 crystal_applications 表
  - 无 crystal_migrations 表

### Drizzle Schema
- **文件**: `drizzle/evolution-schema.ts` (1550 行)
  - guardrailRules: 缺新字段
  - guardrailViolations: 缺新字段
  - knowledgeCrystals: 缺新字段
  - 无新表定义

### Seed 数据
- **文件**: `docker/mysql/init/06-v5-seed.sql` (297 行)

## 实施顺序
1. DDL 扩展 (02-v5-ddl.sql) + 新表
2. Drizzle Schema 同步 (evolution-schema.ts)
3. Seed 数据 (06-v5-seed.sql)
4. 护栏引擎升级 (guardrail-engine.ts)
5. Domain Router 增强 (guardrail.domain-router.ts + knowledge.domain-router.ts)
6. 前端页面升级
