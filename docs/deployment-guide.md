# 部署指南 — 赋能平台 v5.0

## 1. 环境要求

| 组件 | 最低版本 | 推荐版本 | 用途 |
|------|---------|---------|------|
| Node.js | 18.x | 20.x LTS | 运行时 |
| MySQL | 8.0 | 8.0.35+ | 关系型存储 |
| ClickHouse | 23.x | 24.x | 时序分析 |
| MinIO | RELEASE.2024-01 | 最新 | 对象存储 |
| Redis | 7.x | 7.2+ | 缓存/消息 |

### 硬件建议

| 部署规模 | CPU | 内存 | 磁盘 | 适用场景 |
|---------|-----|------|------|---------|
| 开发/测试 | 4 核 | 8 GB | 100 GB SSD | 单设备调试 |
| 小规模 | 8 核 | 16 GB | 500 GB SSD | 10-50 台设备 |
| 中规模 | 16 核 | 32 GB | 1 TB NVMe | 50-200 台设备 |
| 大规模 | 32+ 核 | 64+ GB | 2+ TB NVMe | 200+ 台设备 |

## 2. 快速启动

```bash
# 1. 克隆项目
git clone <repo-url> && cd xilian-platform

# 2. 安装依赖
pnpm install

# 3. 环境配置
cp .env.example .env
# 编辑 .env 填写数据库连接、Grok API Key 等

# 4. 数据库迁移
pnpm db:push

# 5. ClickHouse 物化视图（可选）
mysql -h <clickhouse-host> < server/platform/contracts/clickhouse-views.sql

# 6. 启动开发服务器
pnpm dev
```

## 3. 环境变量

```env
# === 数据库 ===
DATABASE_URL=mysql://user:pass@localhost:3306/xilian

# === ClickHouse ===
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_DATABASE=xilian_ts

# === MinIO ===
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=xilian-artifacts

# === Grok API ===
GROK_API_KEY=xai-xxxxxxxx
GROK_MODEL=grok-3
GROK_MAX_TOKENS=4096
GROK_TEMPERATURE=0.3

# === Redis ===
REDIS_URL=redis://localhost:6379

# === 平台配置 ===
PLATFORM_MODE=production          # development | staging | production
PERCEPTION_BASE_RATE_HZ=1000     # 基础采样率
GUARDRAIL_ENABLED=true            # 护栏总开关
EVOLUTION_AUTO_MODE=false         # 自进化自动模式（建议先关闭，手动审核）
```

## 4. 数据库初始化

### 4.1 MySQL 表创建

Drizzle ORM 自动管理 Schema 迁移：

```bash
# 生成迁移文件
pnpm drizzle-kit generate

# 执行迁移
pnpm drizzle-kit push
```

v5.0 新增 24 张表定义在 `drizzle/evolution-schema.ts`。

### 4.2 ClickHouse 物化视图

```bash
# 创建 5 个物化视图
clickhouse-client < server/platform/contracts/clickhouse-views.sql
```

物化视图列表：
- `mv_equipment_health_hourly` — 设备健康小时聚合
- `mv_perception_state_vector` — 感知状态向量聚合
- `mv_diagnosis_summary_daily` — 诊断摘要日聚合
- `mv_guardrail_trigger_stats` — 护栏触发统计
- `mv_evolution_cycle_metrics` — 进化周期指标

## 5. 模块启用配置

通过动态配置引擎控制各模块启停：

```typescript
import { DynamicConfigEngine } from './server/platform/config/dynamic-config';

const config = new DynamicConfigEngine();

// 特性开关
config.setFeatureFlag('enable_world_model', true);
config.setFeatureFlag('enable_guardrail', true);
config.setFeatureFlag('enable_evolution_flywheel', false); // 初期关闭
config.setFeatureFlag('enable_grok_reasoning', true);
config.setFeatureFlag('enable_digital_twin', true);
config.setFeatureFlag('enable_knowledge_graph', true);
```

## 6. 场景接入指南

### 6.1 创建工况配置

```typescript
import { ConditionProfileManager } from './server/platform/perception/condition';

const manager = new ConditionProfileManager();

// 注册新场景的工况配置
manager.registerProfile({
  id: 'manufacturing_cnc',
  name: '制造业 CNC 加工中心',
  phases: [
    { name: 'idle', samplingRate: 100, features: ['vibration', 'temperature'] },
    { name: 'cutting', samplingRate: 5000, features: ['vibration', 'force', 'temperature', 'spindle_speed'] },
    { name: 'tool_change', samplingRate: 1000, features: ['position', 'force'] },
  ],
  thresholds: {
    vibration: { warning: 5.0, critical: 10.0 },
    temperature: { warning: 60, critical: 80 },
  },
});
```

### 6.2 注册协议适配器

```typescript
import { ProtocolAdapterFactory } from './server/platform/perception/collection';

// OPC-UA 设备
ProtocolAdapterFactory.register('opcua', {
  endpoint: 'opc.tcp://192.168.1.100:4840',
  nodeIds: ['ns=2;s=Temperature', 'ns=2;s=Vibration'],
  pollingIntervalMs: 100,
});

// Modbus 设备
ProtocolAdapterFactory.register('modbus', {
  host: '192.168.1.101',
  port: 502,
  registers: [
    { address: 0, type: 'holding', count: 10, name: 'motor_data' },
  ],
});
```

### 6.3 注册护栏规则

```typescript
import { GuardrailEngine } from './server/platform/cognition/safety';

const engine = new GuardrailEngine();

engine.addRule({
  id: 'cnc_spindle_overspeed',
  category: 'safety',
  name: '主轴超速保护',
  condition: (state) => state.stateVector.spindleSpeed > 12000,
  action: 'emergency_stop',
  severity: 'critical',
  cooldownMs: 0, // 无冷却，立即触发
});
```

## 7. 监控和运维

### 7.1 健康检查

```bash
# 平台健康检查 API
curl http://localhost:3000/api/health

# 各模块状态
curl http://localhost:3000/api/platform/status
```

### 7.2 日志

```bash
# 平台日志
tail -f logs/platform.log

# 认知引擎日志
tail -f logs/cognition.log

# 进化飞轮日志
tail -f logs/evolution.log
```

### 7.3 指标导出

支持 Prometheus 格式指标导出：

```bash
curl http://localhost:3000/metrics
```

## 8. 升级指南

### 从 v4.x 升级到 v5.0

1. **备份数据库**
2. **执行迁移**: `pnpm drizzle-kit push`（新增 24 张表，不影响现有表）
3. **更新环境变量**: 添加 Grok API Key 和 ClickHouse 连接
4. **创建 ClickHouse 物化视图**
5. **重启服务**
6. **验证**: 访问认知仪表盘确认各模块状态

### 回滚

```bash
# 回滚数据库（仅删除新增表，不影响现有数据）
pnpm drizzle-kit drop --table=evolution_*

# 回滚代码
git checkout v4.x
pnpm install && pnpm dev
```
