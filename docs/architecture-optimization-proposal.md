# 西联智能平台架构优化方案

**版本**: 1.0  
**日期**: 2026年2月2日  
**作者**: Manus AI

---

## 摘要

本文档针对西联智能平台的五个核心架构领域提出系统性优化方案：数据库设计、插件引擎规范、容器分类分级、数据流/工作流规范、以及API调用规范。方案借鉴了特斯拉等行业领先企业的架构理念，结合工业物联网平台的最佳实践，旨在构建一个可扩展、高可靠、易维护的智能诊断平台。

---

## 一、数据库总体设计优化

### 1.1 现状分析

当前数据库设计采用单一MySQL存储，包含用户表、知识库表（kb_前缀）和知识图谱表（kg_前缀）。这种设计在初期开发阶段简单有效，但随着平台功能扩展，存在以下局限性：时序数据与关系数据混合存储导致查询效率下降；缺乏数据分层策略；向量嵌入存储在JSON字段中不利于高效检索。

### 1.2 优化方案：分层数据架构

参考特斯拉的数据管道设计理念，建议采用"冷热分离、专库专用"的分层架构 [1]：

| 数据层 | 存储引擎 | 数据类型 | 保留策略 |
|--------|----------|----------|----------|
| **热数据层** | MySQL/TiDB | 用户、配置、元数据 | 永久保留 |
| **时序数据层** | InfluxDB/TimescaleDB | 设备遥测、诊断日志 | 90天滚动 |
| **向量数据层** | Qdrant | 知识点嵌入向量 | 永久保留 |
| **冷数据层** | S3/MinIO | 原始文档、历史归档 | 按需保留 |

### 1.3 数据库Schema重构建议

**新增设备与诊断相关表**：

```sql
-- 设备注册表
CREATE TABLE devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(64) UNIQUE NOT NULL,
  device_type VARCHAR(50) NOT NULL,
  model VARCHAR(100),
  location VARCHAR(255),
  status ENUM('online', 'offline', 'maintenance') DEFAULT 'offline',
  last_heartbeat TIMESTAMP,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 诊断任务表
CREATE TABLE diagnosis_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(64) NOT NULL,
  task_type ENUM('routine', 'emergency', 'scheduled') DEFAULT 'routine',
  status ENUM('pending', 'running', 'completed', 'failed') DEFAULT 'pending',
  priority INT DEFAULT 5,
  input_data JSON,
  result JSON,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 诊断规则表
CREATE TABLE diagnosis_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_id VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  condition_expr TEXT NOT NULL,
  action_type ENUM('alert', 'auto_fix', 'escalate', 'log') DEFAULT 'alert',
  severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 1.4 数据一致性策略

采用事件溯源（Event Sourcing）模式确保跨存储引擎的数据一致性。所有数据变更首先写入事件日志，然后异步同步到各个存储层。这种设计借鉴了特斯拉处理车辆遥测数据的方式：优先保证数据持久性，再进行分发处理 [1]。

---

## 二、插件引擎规范化

### 2.1 设计目标

构建一个类似VSCode或Grafana的插件系统，支持第三方开发者扩展平台功能，同时保证核心系统的稳定性和安全性。

### 2.2 插件架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                      插件管理器 (Plugin Manager)              │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ 诊断插件 │  │ 数据源   │  │ 可视化   │  │ 通知渠道 │    │
│  │ Plugins  │  │ Plugins  │  │ Plugins  │  │ Plugins  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
├─────────────────────────────────────────────────────────────┤
│                      插件API层 (Plugin API)                  │
│  • 生命周期管理  • 权限控制  • 资源隔离  • 事件总线         │
├─────────────────────────────────────────────────────────────┤
│                      核心系统 (Core System)                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 插件接口规范

每个插件必须实现以下标准接口：

```typescript
interface IPlugin {
  // 元数据
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly description: string;
  readonly category: PluginCategory;
  
  // 生命周期
  onActivate(context: PluginContext): Promise<void>;
  onDeactivate(): Promise<void>;
  
  // 配置
  getDefaultConfig(): PluginConfig;
  validateConfig(config: PluginConfig): ValidationResult;
  
  // 健康检查
  healthCheck(): Promise<HealthStatus>;
}

type PluginCategory = 
  | 'diagnosis'      // 诊断算法插件
  | 'datasource'     // 数据源连接器
  | 'visualization'  // 可视化组件
  | 'notification'   // 通知渠道
  | 'integration';   // 第三方集成
```

### 2.4 插件安全沙箱

参考特斯拉OTA更新系统的安全验证机制 [1]，所有插件必须：

1. **数字签名验证**：使用RSA-2048签名，防止恶意代码注入
2. **权限声明**：明确声明所需权限，用户安装时确认
3. **资源限制**：CPU、内存、网络访问受限
4. **API白名单**：只能调用已授权的系统API

---

## 三、容器分类分级

### 3.1 容器分级体系

借鉴Kubernetes的资源管理模型，将平台容器分为四个级别：

| 级别 | 名称 | 资源配额 | 可用性要求 | 典型服务 |
|------|------|----------|------------|----------|
| **P0** | 关键服务 | 无限制 | 99.99% | API网关、认证服务 |
| **P1** | 核心服务 | 高配额 | 99.9% | 诊断引擎、知识库 |
| **P2** | 标准服务 | 标准配额 | 99% | 可视化、报表 |
| **P3** | 后台服务 | 低配额 | 95% | 日志收集、数据清理 |

### 3.2 容器编排规范

```yaml
# docker-compose.yml 示例结构
version: '3.8'

services:
  # P0 - 关键服务
  api-gateway:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
      restart_policy:
        condition: any
        delay: 5s
        max_attempts: 3
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      
  # P1 - 核心服务
  diagnosis-engine:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 4G
      replicas: 2
    depends_on:
      - api-gateway
      - qdrant
      
  # P2 - 标准服务
  visualization:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
          
  # P3 - 后台服务
  log-collector:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
```

### 3.3 服务发现与负载均衡

采用服务网格（Service Mesh）模式，通过Traefik或Envoy实现：

1. **自动服务发现**：容器启动时自动注册
2. **健康检查**：定期探测服务状态
3. **负载均衡**：基于权重的流量分发
4. **熔断降级**：故障服务自动隔离

---

## 四、数据流与工作流规范

### 4.1 数据流架构

参考特斯拉的遥测数据管道设计 [1]，采用事件驱动架构：

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ 数据源  │───▶│ 消息队列│───▶│ 流处理  │───▶│ 存储层  │
│ Sources │    │ Kafka   │    │ Flink   │    │ Storage │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
     │              │              │              │
     ▼              ▼              ▼              ▼
  设备传感器    事件缓冲      实时分析      持久化存储
  API调用      削峰填谷      规则匹配      时序/向量
  文件上传     顺序保证      聚合计算      关系数据
```

### 4.2 工作流定义规范

采用DAG（有向无环图）模式定义工作流，参考Apache Airflow的最佳实践 [2]：

```typescript
interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  
  // 触发条件
  trigger: {
    type: 'manual' | 'scheduled' | 'event';
    schedule?: string;  // cron表达式
    event?: string;     // 事件类型
  };
  
  // 任务节点
  tasks: TaskNode[];
  
  // 依赖关系
  dependencies: {
    [taskId: string]: string[];  // 前置任务ID列表
  };
  
  // 全局配置
  config: {
    timeout: number;
    retryPolicy: RetryPolicy;
    concurrency: number;
  };
}

interface TaskNode {
  id: string;
  name: string;
  type: 'diagnosis' | 'transform' | 'notify' | 'condition';
  executor: string;  // 执行器ID
  params: Record<string, unknown>;
  timeout: number;
}
```

### 4.3 工作流状态机

```
                    ┌──────────┐
                    │ PENDING  │
                    └────┬─────┘
                         │ start
                         ▼
┌──────────┐       ┌──────────┐       ┌──────────┐
│ CANCELLED│◀──────│ RUNNING  │──────▶│ COMPLETED│
└──────────┘ cancel└────┬─────┘ success└──────────┘
                        │ error
                        ▼
                   ┌──────────┐
                   │  FAILED  │
                   └────┬─────┘
                        │ retry
                        ▼
                   ┌──────────┐
                   │ RETRYING │───▶ RUNNING
                   └──────────┘
```

---

## 五、API调用规范

### 5.1 API设计原则

遵循RESTful设计规范，同时借鉴特斯拉的API网关模式 [1]：

1. **统一入口**：所有API通过 `/api/v1` 前缀访问
2. **版本控制**：URL路径包含版本号
3. **一致性响应**：统一的响应格式和错误码
4. **幂等性**：POST/PUT操作支持幂等键

### 5.2 API命名规范

| 资源类型 | HTTP方法 | URL模式 | 示例 |
|----------|----------|---------|------|
| 列表查询 | GET | `/api/v1/{resources}` | `/api/v1/devices` |
| 单个查询 | GET | `/api/v1/{resources}/{id}` | `/api/v1/devices/123` |
| 创建 | POST | `/api/v1/{resources}` | `/api/v1/diagnosis-tasks` |
| 更新 | PUT | `/api/v1/{resources}/{id}` | `/api/v1/rules/456` |
| 删除 | DELETE | `/api/v1/{resources}/{id}` | `/api/v1/plugins/789` |
| 操作 | POST | `/api/v1/{resources}/{id}/{action}` | `/api/v1/tasks/123/start` |

### 5.3 统一响应格式

```typescript
// 成功响应
interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    timestamp: string;
  };
}

// 错误响应
interface ErrorResponse {
  success: false;
  error: {
    code: string;      // 错误码，如 "AUTH_001"
    message: string;   // 用户友好的错误信息
    details?: unknown; // 详细错误信息（开发环境）
  };
  requestId: string;   // 请求追踪ID
}
```

### 5.4 错误码规范

| 错误码前缀 | 模块 | 示例 |
|------------|------|------|
| AUTH_xxx | 认证授权 | AUTH_001: Token过期 |
| DEV_xxx | 设备管理 | DEV_001: 设备不存在 |
| DIAG_xxx | 诊断服务 | DIAG_001: 规则解析失败 |
| KB_xxx | 知识库 | KB_001: 集合不存在 |
| PLUGIN_xxx | 插件系统 | PLUGIN_001: 插件加载失败 |
| SYS_xxx | 系统错误 | SYS_001: 内部服务错误 |

### 5.5 API限流策略

```typescript
// 限流配置
const rateLimitConfig = {
  // 全局限流
  global: {
    windowMs: 60 * 1000,  // 1分钟窗口
    maxRequests: 1000,    // 最大请求数
  },
  // 按用户限流
  perUser: {
    windowMs: 60 * 1000,
    maxRequests: 100,
  },
  // 按端点限流
  perEndpoint: {
    '/api/v1/diagnosis/run': { windowMs: 60000, maxRequests: 10 },
    '/api/v1/knowledge/search': { windowMs: 60000, maxRequests: 50 },
  }
};
```

---

## 六、实施路线图

### 第一阶段：基础架构（2-4周）

1. 重构数据库Schema，添加设备和诊断相关表
2. 实现统一API响应格式和错误码规范
3. 配置容器资源限制和健康检查

### 第二阶段：核心功能（4-6周）

1. 实现插件引擎框架和安全沙箱
2. 构建事件驱动的数据流管道
3. 实现工作流编排引擎

### 第三阶段：优化完善（2-4周）

1. 添加API限流和熔断机制
2. 实现服务发现和负载均衡
3. 完善监控和告警系统

---

## 参考文献

[1] System Design Handbook. "Tesla System Design Interview: A Complete Preparation Guide." https://www.systemdesignhandbook.com/guides/tesla-system-design-interview/

[2] Apache Software Foundation. "Apache Airflow Best Practices." https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html

[3] Confluent. "Event-Driven Architecture (EDA): A Complete Introduction." https://www.confluent.io/learn/event-driven-architecture/

---

*本文档由 Manus AI 生成，基于特斯拉等行业领先企业的架构实践。*
