# 人工验收清单 (REVIEW CHECKPOINTS)

> **版本**: 1.0.0 | **日期**: 2026-03-02
> **用途**: Sprint 验收、随机抽查、流程验证、数据库校验

---

## 1. Sprint 验收清单 (10 项人工检查)

每个 Sprint 结束时，必须逐项检查并签字确认：

| # | 检查项 | 验证方法 | 通过标准 | 签字 |
|---|--------|----------|----------|------|
| 1 | `pnpm check` 零错误 | 运行命令 | 退出码 0 | ☐ |
| 2 | `pnpm test` 全部通过 | 运行命令 | 零失败（排除已知 flaky） | ☐ |
| 3 | `pnpm quality:gate` 通过 | 运行命令 | 退出码 0 | ☐ |
| 4 | 新增代码有对应测试 | `git diff --stat` 对比 | 每个新 .ts 有对应 .test.ts | ☐ |
| 5 | 无新增 any 类型 | `pnpm quality:gate` 报告 | any 数量 ≤ 基线 | ☐ |
| 6 | 安全扫描通过 | `grep -rn 'password\|secret' docker-compose.yml` | 无明文密码 | ☐ |
| 7 | FIX 完成率达标 | `pnpm fix:status` | Sprint 目标 FIX 全部 ✅ | ☐ |
| 8 | 物理约束校验完整 | 抽查诊断输出 | 异常值经过物理合理性检查 | ☐ |
| 9 | 降级不崩溃验证 | 停止 Redis/ClickHouse 后启动 | 服务正常启动（降级模式） | ☐ |
| 10 | 文档同步 | 检查 CLAUDE.md, SPRINT_PLAN.md | Sprint 状态已更新 | ☐ |

---

## 2. 随机抽查指引

### 2.1 抽查方法

每次抽查随机选取 3-5 个 FIX，验证是否真正解决：

```bash
# 步骤 1: 获取已标记为 fixed 的 FIX 列表
pnpm fix:status 2>&1 | grep '✅'

# 步骤 2: 随机选取（用 shuf 或手动选）
pnpm fix:status 2>&1 | grep '✅' | shuf -n 3

# 步骤 3: 对每个 FIX 执行验证
```

### 2.2 分类别抽查方法

#### A. 命名混乱类 (FIX-001 ~ FIX-015)
```bash
# 验证：搜索旧命名是否还存在
grep -rn 'deviceId' server/ --include='*.ts' | grep -v __tests__ | head -10
grep -rn 'device_id' server/ --include='*.ts' | grep -v __tests__ | head -10
# 标准：核心模块（domains/, platform/）应使用 machineId
```

#### B. 数据契约类 (FIX-016 ~ FIX-046)
```bash
# 验证：检查契约文件是否存在和被引用
ls shared/contracts/v1/
grep -rn "from.*contracts/v1" server/ | wc -l
# 标准：统一契约文件存在且被 ≥5 个模块引用
```

#### C. 类型安全类 (FIX-047 ~ FIX-061)
```bash
# 验证：检查 any 使用
grep -rn ': any' server/lib/clients/grpcClients.ts | wc -l
# 标准：gRPC 客户端不应有 any 类型
```

#### D. 功能缺失类 (FIX-062 ~ FIX-081)
```bash
# 验证：搜索 stub/mock 残留
grep -rn 'stub.*true' server/platform/ | grep -v __tests__ | head -10
grep -rn 'mock.*data' server/platform/cognition/grok/ | head -10
# 标准：核心模块无 stub:true 残留
```

#### E. 算法Bug类 (FIX-082 ~ FIX-089)
```bash
# 验证：检查 hardcoded confidence
grep -rn 'confidence.*0\.[5-9]' server/algorithms/ | head -10
grep -rn 'confidence.*0\.[5-9]' server/services/ | head -10
# 标准：confidence 值应从数据计算，不应是字面量
```

#### F. 流程断点类 (FIX-090 ~ FIX-099)
```bash
# 验证：运行端到端测试
npx vitest run server/platform/perception/__tests__/perception-pipeline-e2e.test.ts
npx vitest run server/platform/hde/orchestrator/__tests__/
# 标准：所有 E2E 测试通过
```

#### G. 配置错误类 (FIX-101 ~ FIX-110)
```bash
# 验证：搜索弱密码
grep -n 'root123\|changeme\|minioadmin\|admin123' docker-compose.yml
grep -n 'xilian-portai-nexus' docker-compose.yml
# 标准：零匹配
```

---

## 3. 流程手动验证步骤

### 14 条核心流程

| 流程 | 描述 | 验证步骤 |
|------|------|----------|
| 1 | 传感器数据采集→存储 | 1) 启动 sensor-simulator 2) 检查 ClickHouse 有数据写入 3) 验证数据格式 |
| 2 | 数据→特征提取→诊断 | 1) 注入测试数据 2) 调用诊断 API 3) 验证返回 severity 和 confidence |
| 3 | 诊断→护栏校验→输出 | 1) 构造异常诊断结论 2) 验证护栏拦截 3) 验证严重度升级 |
| 4 | Grok 推理→工具调用→结论 | 1) 发起 Grok 诊断 2) 验证工具调用日志 3) 验证推理链完整 |
| 5 | 知识图谱→查询→推理 | 1) 确认 Neo4j 种子数据 2) 执行知识查询 3) 验证返回结果 |
| 6 | 进化飞轮→训练→评估 | 1) 触发影子评估 2) 验证冠军挑战者 3) 检查持久化 |
| 7 | 管线 DAG→执行→监控 | 1) 创建管线 2) 执行 DAG 3) 验证节点状态 |
| 8 | 前端→tRPC→后端→响应 | 1) 打开前端页面 2) 检查 Network tab 3) 验证数据正确 |
| 9 | 告警→通知→确认 | 1) 触发告警规则 2) 验证通知发送 3) 确认告警状态变更 |
| 10 | 事件总线→订阅→处理 | 1) 发布事件 2) 验证订阅者收到 3) 检查 Schema 校验日志 |
| 11 | 数据质量→评分→分级 | 1) 注入不同质量数据 2) 验证评分 3) 验证等级 (A/B/C/D/F) |
| 12 | 跨设备→对比→报告 | 1) 选择同型号设备 2) 执行对比 3) 验证差异标注 |
| 13 | 用户→登录→权限 | 1) 登录获取 JWT 2) 验证权限过滤 3) 测试越权拦截 |
| 14 | 协议适配→数据归一化 | 1) 发送 MQTT/Modbus 数据 2) 验证单位转换 3) 验证时间对齐 |

### 验证脚本

```bash
# 快速验证（自动化部分）
pnpm test                    # 单元测试
pnpm quality:gate            # 质量门禁
pnpm fix:status              # FIX 追踪

# 手动验证（需要运行环境）
pnpm dev                     # 启动开发服务器
# 然后在浏览器中逐条验证流程
```

---

## 4. 数据库验证步骤

### 4.1 MySQL (Drizzle ORM)

```bash
# 检查 schema 同步
pnpm db:push

# 验证表数量
mysql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='xilian_platform';"
# 预期: ~160 张表

# 验证关键表有数据
mysql -e "SELECT COUNT(*) FROM devices;"
mysql -e "SELECT COUNT(*) FROM diagnosis_sessions;"
```

### 4.2 ClickHouse

```bash
# 验证表存在
clickhouse-client -q "SHOW TABLES FROM xilian_ts;"

# 验证物化视图
clickhouse-client -q "SHOW CREATE TABLE xilian_ts.sensor_data_5m_mv;"

# 验证数据写入
clickhouse-client -q "SELECT COUNT(*) FROM xilian_ts.sensor_data WHERE event_time > now() - INTERVAL 1 HOUR;"
```

### 4.3 Neo4j

```bash
# 验证知识图谱节点
cypher-shell -u neo4j "MATCH (n) RETURN labels(n), count(n);"

# 验证关系
cypher-shell -u neo4j "MATCH ()-[r]->() RETURN type(r), count(r);"
```

### 4.4 Redis

```bash
# 验证连接
redis-cli ping
# 预期: PONG

# 检查缓存键
redis-cli --scan --pattern 'xilian:*' | head -20
```

---

## 5. 不通过的处理流程

### 5.1 处理流程图

```
验收检查不通过
  ├── 致命问题 → 立即停止发布 → 创建 Hotfix 分支 → 修复 → 重新验收
  ├── 严重问题 → 评估影响范围 → 决定是否延期发布
  │     ├── 影响核心流程 → 修复后重新验收
  │     └── 不影响核心 → 记录到下一 Sprint，条件发布
  ├── 中等问题 → 记录到 FIX Plan → 下一 Sprint 处理
  └── 低优先级 → 记录到 Backlog
```

### 5.2 回退策略

```bash
# 如果需要回退到上一个稳定版本
git log --oneline -10              # 查看最近提交
git revert <commit-hash>           # 回退特定提交（安全方式）

# 紧急回退（最后手段）
git stash                          # 保存当前工作
git checkout <stable-tag>          # 切换到稳定标签
```

### 5.3 问题升级规则

| 问题等级 | 首次发现 | 未按时修复 | 升级到 |
|----------|----------|------------|--------|
| 致命 | 立即处理 | 4h 内未修复 | 项目负责人 |
| 严重 | 当天处理 | 2d 内未修复 | 技术主管 |
| 中等 | 本 Sprint | 下一 Sprint 未修复 | 周会评审 |
| 低 | Backlog | 30 天未处理 | 定期清理 |

---

> 本文档随项目进展更新 | 最后更新: 2026-03-02
