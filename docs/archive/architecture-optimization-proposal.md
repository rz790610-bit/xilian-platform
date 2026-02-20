# 西联智能平台架构优化方案

**版本**: 2.0  
**日期**: 2026年2月2日  
**作者**: Manus AI

---

## 摘要

本文档针对西联智能平台的五个核心架构领域提出系统性优化方案：数据库设计、插件引擎规范、容器分类分级、数据流/工作流规范、以及API调用规范。方案借鉴了特斯拉等行业领先企业的架构理念，采用**七层架构体系**，融合**Lambda+Kappa**数据处理模式，结合**多模态RAG**技术，旨在构建一个可扩展、高可靠、易维护的工业智能诊断平台。

---

## 一、七层架构体系总览

西联智能平台采用七层架构设计，从底层基础设施到顶层应用展示，层层递进：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        第七层：应用展示层 (Presentation)                      │
│  React 19 + Tailwind 4 + shadcn/ui + ECharts + 3D可视化                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                        第六层：业务逻辑层 (Business Logic)                    │
│  诊断引擎 + 知识推理 + 规则引擎 + 工作流编排                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                        第五层：AI能力层 (AI Services)                         │
│  Ollama LLM + nomic-embed-text + 多模态RAG + 知识图谱                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                        第四层：数据处理层 (Data Processing)                   │
│  Lambda+Kappa融合架构 + 实时流处理 + 批量分析                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                        第三层：数据存储层 (Data Storage)                      │
│  MySQL/TiDB + Qdrant + InfluxDB + S3/MinIO                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                        第二层：服务治理层 (Service Governance)                │
│  API网关 + 服务发现 + 负载均衡 + 熔断限流                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                        第一层：基础设施层 (Infrastructure)                    │
│  Docker + Kubernetes + Traefik + Prometheus + Grafana                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、数据库总体设计优化

### 2.1 分层数据架构

采用"冷热分离、专库专用"的分层架构，参考特斯拉的数据管道设计理念：

| 数据层 | 存储引擎 | 数据类型 | 保留策略 | 访问模式 |
|--------|----------|----------|----------|----------|
| **热数据层** | MySQL/TiDB | 用户、配置、元数据 | 永久保留 | 高频读写 |
| **时序数据层** | InfluxDB/TimescaleDB | 设备遥测、诊断日志 | 90天滚动 | 高频写入、范围查询 |
| **向量数据层** | Qdrant | 知识点嵌入向量 | 永久保留 | 相似度检索 |
| **图数据层** | Neo4j/ArangoDB | 知识图谱、实体关系 | 永久保留 | 图遍历查询 |
| **冷数据层** | S3/MinIO | 原始文档、历史归档 | 按需保留 | 低频访问 |

### 2.2 核心数据表设计

#### 2.2.1 设备管理模块

```sql
-- 设备注册表
CREATE TABLE devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(64) UNIQUE NOT NULL COMMENT '设备唯一标识',
  device_name VARCHAR(255) NOT NULL COMMENT '设备名称',
  device_type VARCHAR(50) NOT NULL COMMENT '设备类型：motor/pump/compressor/gearbox',
  model VARCHAR(100) COMMENT '设备型号',
  manufacturer VARCHAR(100) COMMENT '制造商',
  location VARCHAR(255) COMMENT '安装位置',
  status ENUM('online', 'offline', 'maintenance', 'fault') DEFAULT 'offline',
  last_heartbeat TIMESTAMP COMMENT '最后心跳时间',
  metadata JSON COMMENT '扩展元数据',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_device_type (device_type),
  INDEX idx_status (status)
);

-- 设备传感器配置表
CREATE TABLE device_sensors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(64) NOT NULL,
  sensor_id VARCHAR(64) NOT NULL COMMENT '传感器标识',
  sensor_type VARCHAR(50) NOT NULL COMMENT '传感器类型：vibration/temperature/pressure/current',
  unit VARCHAR(20) COMMENT '测量单位',
  sampling_rate INT COMMENT '采样频率(Hz)',
  threshold_config JSON COMMENT '阈值配置',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_device_sensor (device_id, sensor_id),
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);
```

#### 2.2.2 诊断任务模块

```sql
-- 诊断任务表
CREATE TABLE diagnosis_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(64) UNIQUE NOT NULL COMMENT '任务唯一标识',
  device_id VARCHAR(64) NOT NULL,
  task_type ENUM('routine', 'emergency', 'scheduled', 'manual') DEFAULT 'routine',
  status ENUM('pending', 'queued', 'running', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
  priority INT DEFAULT 5 COMMENT '优先级1-10，10最高',
  input_data JSON COMMENT '输入数据',
  result JSON COMMENT '诊断结果',
  confidence DECIMAL(5,4) COMMENT '置信度0-1',
  execution_time_ms INT COMMENT '执行耗时(毫秒)',
  error_message TEXT COMMENT '错误信息',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_by INT COMMENT '创建者用户ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_status (device_id, status),
  INDEX idx_created_at (created_at)
);

-- 诊断规则表
CREATE TABLE diagnosis_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_id VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) COMMENT '规则类别：vibration/thermal/electrical/mechanical',
  device_types JSON COMMENT '适用设备类型列表',
  condition_expr TEXT NOT NULL COMMENT '条件表达式(DSL)',
  action_type ENUM('alert', 'auto_fix', 'escalate', 'log', 'workflow') DEFAULT 'alert',
  action_config JSON COMMENT '动作配置',
  severity ENUM('info', 'low', 'medium', 'high', 'critical') DEFAULT 'medium',
  is_active BOOLEAN DEFAULT TRUE,
  version INT DEFAULT 1,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_severity (severity)
);

-- 诊断结果历史表
CREATE TABLE diagnosis_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  fault_type VARCHAR(100) COMMENT '故障类型',
  fault_code VARCHAR(50) COMMENT '故障代码',
  severity ENUM('info', 'low', 'medium', 'high', 'critical'),
  description TEXT COMMENT '故障描述',
  recommendation TEXT COMMENT '处理建议',
  matched_rules JSON COMMENT '匹配的规则ID列表',
  raw_data JSON COMMENT '原始诊断数据',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_time (device_id, created_at),
  INDEX idx_fault_type (fault_type)
);
```

#### 2.2.3 知识库增强模块

```sql
-- 知识库集合表（增强）
CREATE TABLE kb_collections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collection_id VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category ENUM('fault_diagnosis', 'maintenance', 'operation', 'safety', 'general') DEFAULT 'general',
  embedding_model VARCHAR(100) DEFAULT 'nomic-embed-text',
  vector_dimension INT DEFAULT 768,
  document_count INT DEFAULT 0,
  total_chunks INT DEFAULT 0,
  last_updated TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSON,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 知识文档表
CREATE TABLE kb_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  document_id VARCHAR(64) UNIQUE NOT NULL,
  collection_id VARCHAR(64) NOT NULL,
  title VARCHAR(500) NOT NULL,
  source_type ENUM('upload', 'crawl', 'api', 'manual') DEFAULT 'upload',
  source_url TEXT,
  file_type VARCHAR(20) COMMENT 'pdf/docx/txt/md/xlsx',
  file_size BIGINT COMMENT '文件大小(字节)',
  content_hash VARCHAR(64) COMMENT '内容哈希，用于去重',
  chunk_count INT DEFAULT 0,
  processing_status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
  error_message TEXT,
  metadata JSON,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_collection (collection_id),
  INDEX idx_status (processing_status)
);

-- 知识点/文档块表
CREATE TABLE kb_chunks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  chunk_id VARCHAR(64) UNIQUE NOT NULL,
  document_id VARCHAR(64) NOT NULL,
  collection_id VARCHAR(64) NOT NULL,
  chunk_index INT NOT NULL COMMENT '块在文档中的序号',
  content TEXT NOT NULL COMMENT '文本内容',
  content_length INT COMMENT '内容长度',
  vector_id VARCHAR(64) COMMENT 'Qdrant中的向量ID',
  metadata JSON COMMENT '元数据：页码、标题层级等',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_document (document_id),
  INDEX idx_collection (collection_id),
  UNIQUE KEY uk_doc_chunk (document_id, chunk_index)
);
```

#### 2.2.4 插件系统模块

```sql
-- 插件注册表
CREATE TABLE plugins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plugin_id VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(20) NOT NULL,
  author VARCHAR(100),
  description TEXT,
  category ENUM('diagnosis', 'datasource', 'visualization', 'notification', 'integration', 'processor') NOT NULL,
  entry_point VARCHAR(255) COMMENT '入口文件路径',
  config_schema JSON COMMENT '配置项Schema',
  permissions JSON COMMENT '所需权限列表',
  status ENUM('installed', 'active', 'disabled', 'error') DEFAULT 'installed',
  is_system BOOLEAN DEFAULT FALSE COMMENT '是否系统内置插件',
  install_path VARCHAR(500),
  signature VARCHAR(512) COMMENT '数字签名',
  installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_status (status)
);

-- 插件配置表
CREATE TABLE plugin_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plugin_id VARCHAR(64) NOT NULL,
  config_key VARCHAR(100) NOT NULL,
  config_value JSON NOT NULL,
  is_secret BOOLEAN DEFAULT FALSE COMMENT '是否敏感配置',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_plugin_config (plugin_id, config_key),
  FOREIGN KEY (plugin_id) REFERENCES plugins(plugin_id) ON DELETE CASCADE
);

-- 插件执行日志表
CREATE TABLE plugin_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  plugin_id VARCHAR(64) NOT NULL,
  log_level ENUM('debug', 'info', 'warn', 'error') DEFAULT 'info',
  message TEXT,
  context JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_plugin_time (plugin_id, created_at),
  INDEX idx_level (log_level)
);
```

#### 2.2.5 工作流模块

```sql
-- 工作流定义表
CREATE TABLE workflows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workflow_id VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  version INT DEFAULT 1,
  status ENUM('draft', 'active', 'deprecated') DEFAULT 'draft',
  trigger_type ENUM('manual', 'scheduled', 'event', 'api') DEFAULT 'manual',
  trigger_config JSON COMMENT '触发配置：cron表达式/事件类型等',
  definition JSON NOT NULL COMMENT 'DAG定义',
  timeout_seconds INT DEFAULT 3600,
  retry_policy JSON,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status)
);

-- 工作流实例表
CREATE TABLE workflow_instances (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  instance_id VARCHAR(64) UNIQUE NOT NULL,
  workflow_id VARCHAR(64) NOT NULL,
  workflow_version INT,
  status ENUM('pending', 'running', 'paused', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
  trigger_type VARCHAR(20),
  trigger_data JSON,
  context JSON COMMENT '运行时上下文',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_workflow_status (workflow_id, status),
  INDEX idx_created_at (created_at)
);

-- 工作流任务实例表
CREATE TABLE workflow_task_instances (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  instance_id VARCHAR(64) NOT NULL,
  task_id VARCHAR(64) NOT NULL,
  task_name VARCHAR(255),
  task_type VARCHAR(50),
  status ENUM('pending', 'running', 'completed', 'failed', 'skipped') DEFAULT 'pending',
  input_data JSON,
  output_data JSON,
  retry_count INT DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_instance (instance_id),
  INDEX idx_status (status)
);
```

### 2.3 数据一致性策略

采用**事件溯源（Event Sourcing）**模式确保跨存储引擎的数据一致性：

```sql
-- 事件日志表
CREATE TABLE event_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(64) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL COMMENT '事件类型',
  aggregate_type VARCHAR(50) NOT NULL COMMENT '聚合根类型：device/task/document',
  aggregate_id VARCHAR(64) NOT NULL COMMENT '聚合根ID',
  payload JSON NOT NULL COMMENT '事件数据',
  metadata JSON COMMENT '元数据：用户、来源等',
  version INT NOT NULL COMMENT '聚合版本号',
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6),
  INDEX idx_aggregate (aggregate_type, aggregate_id),
  INDEX idx_event_type (event_type),
  INDEX idx_created_at (created_at)
);
```

---

## 三、插件引擎规范化

### 3.1 插件架构设计

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           插件管理器 (Plugin Manager)                         │
│  • 插件发现  • 生命周期管理  • 依赖解析  • 版本控制  • 热插拔支持              │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  诊断插件   │  │  数据源插件  │  │  可视化插件  │  │  通知插件   │        │
│  │ Diagnosis   │  │ DataSource  │  │ Visualization│  │ Notification│        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                         │
│  │  处理器插件  │  │  集成插件   │  │  自定义插件  │                         │
│  │ Processor   │  │ Integration │  │   Custom    │                         │
│  └─────────────┘  └─────────────┘  └─────────────┘                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                           插件API层 (Plugin API)                             │
│  • 标准接口  • 权限控制  • 资源隔离  • 事件总线  • 配置管理                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                           安全沙箱 (Security Sandbox)                        │
│  • 代码签名验证  • 资源限制  • API白名单  • 审计日志                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 插件接口规范

```typescript
// 基础插件接口
interface IPlugin {
  // 元数据
  readonly manifest: PluginManifest;
  
  // 生命周期钩子
  onInstall?(context: PluginContext): Promise<void>;
  onActivate(context: PluginContext): Promise<void>;
  onDeactivate(): Promise<void>;
  onUninstall?(): Promise<void>;
  
  // 配置管理
  getDefaultConfig(): PluginConfig;
  validateConfig(config: PluginConfig): ValidationResult;
  onConfigChange?(newConfig: PluginConfig, oldConfig: PluginConfig): Promise<void>;
  
  // 健康检查
  healthCheck(): Promise<HealthStatus>;
}

// 插件清单
interface PluginManifest {
  id: string;                    // 唯一标识，格式：@scope/plugin-name
  name: string;                  // 显示名称
  version: string;               // 语义化版本
  author: string;
  description: string;
  category: PluginCategory;
  icon?: string;                 // 图标URL
  homepage?: string;             // 主页URL
  repository?: string;           // 代码仓库
  license: string;
  
  // 兼容性
  engines: {
    platform: string;            // 平台版本要求，如 ">=1.0.0"
  };
  
  // 依赖
  dependencies?: {
    [pluginId: string]: string;  // 依赖的其他插件
  };
  
  // 权限声明
  permissions: Permission[];
  
  // 入口点
  main: string;                  // 主入口文件
  browser?: string;              // 浏览器端入口
}

// 权限类型
type Permission = 
  | 'storage:read'           // 读取存储
  | 'storage:write'          // 写入存储
  | 'network:internal'       // 内部网络访问
  | 'network:external'       // 外部网络访问
  | 'device:read'            // 读取设备数据
  | 'device:write'           // 控制设备
  | 'knowledge:read'         // 读取知识库
  | 'knowledge:write'        // 写入知识库
  | 'notification:send'      // 发送通知
  | 'workflow:execute'       // 执行工作流
  | 'llm:invoke';            // 调用LLM

// 诊断插件接口
interface IDiagnosisPlugin extends IPlugin {
  // 支持的设备类型
  getSupportedDeviceTypes(): string[];
  
  // 执行诊断
  diagnose(input: DiagnosisInput): Promise<DiagnosisResult>;
  
  // 获取诊断规则
  getRules?(): DiagnosisRule[];
}

// 数据源插件接口
interface IDataSourcePlugin extends IPlugin {
  // 连接测试
  testConnection(config: DataSourceConfig): Promise<ConnectionResult>;
  
  // 查询数据
  query(query: DataQuery): Promise<DataQueryResult>;
  
  // 订阅实时数据
  subscribe?(subscription: DataSubscription): Observable<DataPoint>;
}

// 可视化插件接口
interface IVisualizationPlugin extends IPlugin {
  // 获取组件列表
  getComponents(): VisualizationComponent[];
  
  // 渲染组件
  render(componentId: string, data: unknown, options: RenderOptions): React.ReactNode;
}
```

### 3.3 插件安全沙箱

```typescript
// 沙箱配置
interface SandboxConfig {
  // 资源限制
  resources: {
    maxMemoryMB: number;         // 最大内存(MB)
    maxCpuPercent: number;       // 最大CPU占用(%)
    maxExecutionTimeMs: number;  // 最大执行时间(ms)
    maxNetworkBandwidthKBps: number; // 最大网络带宽(KB/s)
  };
  
  // API白名单
  allowedAPIs: string[];
  
  // 网络访问控制
  network: {
    allowInternal: boolean;
    allowExternal: boolean;
    allowedHosts?: string[];     // 允许访问的外部主机
    blockedHosts?: string[];     // 禁止访问的主机
  };
  
  // 文件系统访问
  filesystem: {
    allowRead: boolean;
    allowWrite: boolean;
    allowedPaths?: string[];     // 允许访问的路径
  };
}

// 沙箱执行器
class PluginSandbox {
  constructor(private config: SandboxConfig) {}
  
  async execute<T>(
    plugin: IPlugin, 
    method: string, 
    args: unknown[]
  ): Promise<T> {
    // 1. 验证权限
    this.validatePermissions(plugin, method);
    
    // 2. 设置资源限制
    const resourceGuard = this.createResourceGuard();
    
    // 3. 执行并监控
    try {
      const result = await Promise.race([
        plugin[method](...args),
        this.createTimeoutPromise()
      ]);
      return result as T;
    } finally {
      resourceGuard.release();
    }
  }
}
```

---

## 四、容器分类分级

### 4.1 服务分级体系

| 级别 | 名称 | 资源配额 | 可用性SLA | 恢复时间 | 典型服务 |
|------|------|----------|-----------|----------|----------|
| **P0** | 关键服务 | 无限制 | 99.99% | <1分钟 | API网关、认证服务、数据库 |
| **P1** | 核心服务 | 高配额 | 99.9% | <5分钟 | 诊断引擎、知识库、LLM服务 |
| **P2** | 标准服务 | 标准配额 | 99% | <15分钟 | 可视化、报表、通知服务 |
| **P3** | 后台服务 | 低配额 | 95% | <1小时 | 日志收集、数据清理、备份 |

### 4.2 容器编排规范

```yaml
# docker-compose.production.yml
version: '3.8'

services:
  # ==================== P0 关键服务 ====================
  api-gateway:
    image: traefik:v3.0
    deploy:
      mode: replicated
      replicas: 2
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
        max_attempts: 0  # 无限重试
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
    healthcheck:
      test: ["CMD", "traefik", "healthcheck"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s
    ports:
      - "80:80"
      - "443:443"
    networks:
      - xilian-network

  mysql:
    image: mysql:8.0
    deploy:
      mode: replicated
      replicas: 1
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '2'
          memory: 4G
      restart_policy:
        condition: any
    volumes:
      - mysql-data:/var/lib/mysql
    environment:
      MYSQL_ROOT_PASSWORD_FILE: /run/secrets/mysql_root_password
    secrets:
      - mysql_root_password
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 3

  # ==================== P1 核心服务 ====================
  diagnosis-engine:
    image: xilian/diagnosis-engine:latest
    deploy:
      mode: replicated
      replicas: 2
      resources:
        limits:
          cpus: '4'
          memory: 4G
        reservations:
          cpus: '2'
          memory: 2G
      restart_policy:
        condition: on-failure
        delay: 10s
        max_attempts: 3
    depends_on:
      - mysql
      - qdrant
      - ollama
    environment:
      - NODE_ENV=production
      - DATABASE_URL=mysql://root@mysql:3306/xilian
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  qdrant:
    image: qdrant/qdrant:latest
    deploy:
      mode: replicated
      replicas: 1
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
    volumes:
      - qdrant-data:/qdrant/storage
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  ollama:
    image: ollama/ollama:latest
    deploy:
      mode: replicated
      replicas: 1
      resources:
        limits:
          cpus: '8'
          memory: 16G
        reservations:
          cpus: '4'
          memory: 8G
      placement:
        constraints:
          - node.labels.gpu == true  # GPU节点调度
    volumes:
      - ollama-models:/root/.ollama
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
      interval: 60s
      timeout: 30s
      retries: 3

  # ==================== P2 标准服务 ====================
  frontend:
    image: xilian/frontend:latest
    deploy:
      mode: replicated
      replicas: 2
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
    depends_on:
      - api-gateway

  notification-service:
    image: xilian/notification:latest
    deploy:
      mode: replicated
      replicas: 1
      resources:
        limits:
          cpus: '1'
          memory: 1G

  # ==================== P3 后台服务 ====================
  log-collector:
    image: fluent/fluent-bit:latest
    deploy:
      mode: global  # 每个节点一个
      resources:
        limits:
          cpus: '0.5'
          memory: 512M

  backup-service:
    image: xilian/backup:latest
    deploy:
      mode: replicated
      replicas: 1
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
      restart_policy:
        condition: on-failure
        delay: 60s

networks:
  xilian-network:
    driver: overlay
    attachable: true

volumes:
  mysql-data:
  qdrant-data:
  ollama-models:

secrets:
  mysql_root_password:
    external: true
```

### 4.3 GPU弹性伸缩策略

```yaml
# GPU资源调度配置
gpu_scaling:
  # 基于队列长度的自动伸缩
  auto_scaling:
    enabled: true
    min_replicas: 1
    max_replicas: 4
    metrics:
      - type: queue_length
        target: 10  # 队列超过10个任务时扩容
      - type: gpu_utilization
        target: 80  # GPU利用率超过80%时扩容
    scale_up_cooldown: 60s
    scale_down_cooldown: 300s
  
  # GPU资源池
  resource_pools:
    - name: inference
      gpu_type: nvidia-t4
      min_count: 1
      max_count: 2
      priority: high
    - name: training
      gpu_type: nvidia-a100
      min_count: 0
      max_count: 1
      priority: low
      schedule: "0 2 * * *"  # 凌晨2点启动训练任务
```

---

## 五、数据流与工作流规范

### 5.1 Lambda + Kappa 融合架构

```
                              ┌─────────────────────────────────────┐
                              │         统一数据入口                 │
                              │    (Kafka / Event Hub)              │
                              └──────────────┬──────────────────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
          ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
          │   实时流处理     │      │   批量处理      │      │   交互式查询    │
          │   (Kappa层)     │      │   (Lambda批层)  │      │   (Lambda服务层)│
          │                 │      │                 │      │                 │
          │  • Flink        │      │  • Spark Batch  │      │  • Presto       │
          │  • 实时告警     │      │  • 历史分析     │      │  • 即席查询     │
          │  • 实时仪表盘   │      │  • 模型训练     │      │  • 报表生成     │
          └────────┬────────┘      └────────┬────────┘      └────────┬────────┘
                   │                        │                        │
                   └────────────────────────┼────────────────────────┘
                                            │
                              ┌─────────────▼─────────────┐
                              │       统一存储层          │
                              │  MySQL | Qdrant | S3     │
                              └───────────────────────────┘
```

### 5.2 事件驱动架构

```typescript
// 事件定义
interface DomainEvent {
  eventId: string;           // 事件唯一ID
  eventType: string;         // 事件类型
  aggregateType: string;     // 聚合根类型
  aggregateId: string;       // 聚合根ID
  payload: unknown;          // 事件数据
  metadata: EventMetadata;   // 元数据
  timestamp: Date;           // 事件时间
  version: number;           // 事件版本
}

interface EventMetadata {
  correlationId: string;     // 关联ID，用于追踪
  causationId?: string;      // 因果ID
  userId?: string;           // 触发用户
  source: string;            // 事件来源
}

// 事件类型枚举
enum EventTypes {
  // 设备事件
  DEVICE_REGISTERED = 'device.registered',
  DEVICE_STATUS_CHANGED = 'device.status_changed',
  DEVICE_DATA_RECEIVED = 'device.data_received',
  
  // 诊断事件
  DIAGNOSIS_TASK_CREATED = 'diagnosis.task_created',
  DIAGNOSIS_TASK_STARTED = 'diagnosis.task_started',
  DIAGNOSIS_TASK_COMPLETED = 'diagnosis.task_completed',
  DIAGNOSIS_FAULT_DETECTED = 'diagnosis.fault_detected',
  
  // 知识库事件
  DOCUMENT_UPLOADED = 'knowledge.document_uploaded',
  DOCUMENT_PROCESSED = 'knowledge.document_processed',
  KNOWLEDGE_POINT_CREATED = 'knowledge.point_created',
  
  // 工作流事件
  WORKFLOW_STARTED = 'workflow.started',
  WORKFLOW_TASK_COMPLETED = 'workflow.task_completed',
  WORKFLOW_COMPLETED = 'workflow.completed',
  
  // 插件事件
  PLUGIN_INSTALLED = 'plugin.installed',
  PLUGIN_ACTIVATED = 'plugin.activated',
  PLUGIN_ERROR = 'plugin.error',
}

// 事件总线接口
interface IEventBus {
  // 发布事件
  publish(event: DomainEvent): Promise<void>;
  
  // 批量发布
  publishBatch(events: DomainEvent[]): Promise<void>;
  
  // 订阅事件
  subscribe(
    eventType: string | string[], 
    handler: EventHandler,
    options?: SubscribeOptions
  ): Subscription;
  
  // 请求-响应模式
  request<T>(event: DomainEvent, timeout?: number): Promise<T>;
}

// 事件处理器
type EventHandler = (event: DomainEvent) => Promise<void>;

interface SubscribeOptions {
  group?: string;            // 消费者组
  fromBeginning?: boolean;   // 是否从头消费
  filter?: (event: DomainEvent) => boolean;  // 过滤器
  retry?: RetryPolicy;       // 重试策略
}
```

### 5.3 工作流定义规范

```typescript
// 工作流定义
interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: number;
  
  // 触发条件
  triggers: WorkflowTrigger[];
  
  // 输入参数
  inputs: WorkflowInput[];
  
  // 任务节点
  tasks: TaskNode[];
  
  // 全局配置
  config: WorkflowConfig;
}

// 触发器类型
type WorkflowTrigger = 
  | { type: 'manual' }
  | { type: 'scheduled'; cron: string }
  | { type: 'event'; eventType: string; filter?: string }
  | { type: 'api'; endpoint: string };

// 任务节点
interface TaskNode {
  id: string;
  name: string;
  type: TaskType;
  
  // 执行器配置
  executor: {
    type: 'builtin' | 'plugin' | 'http' | 'script';
    ref: string;              // 执行器引用
    config?: Record<string, unknown>;
  };
  
  // 输入映射
  inputs: {
    [key: string]: string;    // JSONPath表达式
  };
  
  // 输出映射
  outputs?: {
    [key: string]: string;
  };
  
  // 依赖关系
  dependsOn?: string[];       // 前置任务ID
  
  // 条件执行
  condition?: string;         // 条件表达式
  
  // 重试策略
  retry?: RetryPolicy;
  
  // 超时设置
  timeout?: number;
}

type TaskType = 
  | 'diagnosis'      // 诊断任务
  | 'transform'      // 数据转换
  | 'notify'         // 发送通知
  | 'condition'      // 条件分支
  | 'parallel'       // 并行执行
  | 'loop'           // 循环执行
  | 'wait'           // 等待
  | 'http'           // HTTP调用
  | 'script'         // 脚本执行
  | 'llm'            // LLM调用
  | 'knowledge';     // 知识库操作

// 工作流示例：设备故障自动诊断
const faultDiagnosisWorkflow: WorkflowDefinition = {
  id: 'fault-auto-diagnosis',
  name: '设备故障自动诊断',
  description: '当设备上报异常数据时，自动触发诊断流程',
  version: 1,
  
  triggers: [
    {
      type: 'event',
      eventType: 'device.data_received',
      filter: '$.payload.anomaly_score > 0.8'
    }
  ],
  
  inputs: [
    { name: 'deviceId', type: 'string', required: true },
    { name: 'sensorData', type: 'object', required: true }
  ],
  
  tasks: [
    {
      id: 'fetch-device-info',
      name: '获取设备信息',
      type: 'http',
      executor: {
        type: 'builtin',
        ref: 'http-client'
      },
      inputs: {
        url: '"/api/v1/devices/" + $.inputs.deviceId',
        method: '"GET"'
      },
      outputs: {
        deviceInfo: '$.response.data'
      }
    },
    {
      id: 'run-diagnosis',
      name: '执行诊断',
      type: 'diagnosis',
      dependsOn: ['fetch-device-info'],
      executor: {
        type: 'plugin',
        ref: '@xilian/vibration-diagnosis'
      },
      inputs: {
        deviceType: '$.tasks.fetch-device-info.outputs.deviceInfo.device_type',
        sensorData: '$.inputs.sensorData'
      },
      outputs: {
        diagnosisResult: '$.result'
      },
      timeout: 60000
    },
    {
      id: 'search-knowledge',
      name: '检索相关知识',
      type: 'knowledge',
      dependsOn: ['run-diagnosis'],
      condition: '$.tasks.run-diagnosis.outputs.diagnosisResult.faultDetected == true',
      executor: {
        type: 'builtin',
        ref: 'knowledge-search'
      },
      inputs: {
        query: '$.tasks.run-diagnosis.outputs.diagnosisResult.faultType',
        collection: '"fault_diagnosis"',
        topK: '5'
      }
    },
    {
      id: 'generate-report',
      name: '生成诊断报告',
      type: 'llm',
      dependsOn: ['search-knowledge'],
      executor: {
        type: 'builtin',
        ref: 'llm-invoke'
      },
      inputs: {
        prompt: '"根据以下诊断结果和知识库信息，生成详细的故障诊断报告..."',
        context: '$.tasks.search-knowledge.outputs'
      }
    },
    {
      id: 'notify-maintenance',
      name: '通知维护人员',
      type: 'notify',
      dependsOn: ['generate-report'],
      condition: '$.tasks.run-diagnosis.outputs.diagnosisResult.severity in ["high", "critical"]',
      executor: {
        type: 'builtin',
        ref: 'notification-send'
      },
      inputs: {
        channel: '"dingtalk"',
        template: '"fault_alert"',
        data: {
          deviceId: '$.inputs.deviceId',
          faultType: '$.tasks.run-diagnosis.outputs.diagnosisResult.faultType',
          severity: '$.tasks.run-diagnosis.outputs.diagnosisResult.severity',
          report: '$.tasks.generate-report.outputs.content'
        }
      }
    }
  ],
  
  config: {
    timeout: 300000,
    retryPolicy: {
      maxAttempts: 3,
      backoff: 'exponential',
      initialDelay: 1000
    },
    concurrency: 10
  }
};
```

---

## 六、API调用规范

### 6.1 API设计原则

1. **RESTful风格**：资源导向，使用标准HTTP方法
2. **版本控制**：URL路径包含版本号 `/api/v1/`
3. **一致性响应**：统一的响应格式和错误码
4. **幂等性**：POST/PUT操作支持幂等键
5. **分页规范**：统一的分页参数和响应格式

### 6.2 API路由规范

```typescript
// API路由结构
const apiRoutes = {
  // 设备管理
  devices: {
    list:   'GET    /api/v1/devices',
    get:    'GET    /api/v1/devices/:id',
    create: 'POST   /api/v1/devices',
    update: 'PUT    /api/v1/devices/:id',
    delete: 'DELETE /api/v1/devices/:id',
    // 设备操作
    status: 'GET    /api/v1/devices/:id/status',
    sensors:'GET    /api/v1/devices/:id/sensors',
    data:   'GET    /api/v1/devices/:id/data',
  },
  
  // 诊断服务
  diagnosis: {
    tasks: {
      list:   'GET    /api/v1/diagnosis/tasks',
      get:    'GET    /api/v1/diagnosis/tasks/:id',
      create: 'POST   /api/v1/diagnosis/tasks',
      cancel: 'POST   /api/v1/diagnosis/tasks/:id/cancel',
      result: 'GET    /api/v1/diagnosis/tasks/:id/result',
    },
    rules: {
      list:   'GET    /api/v1/diagnosis/rules',
      get:    'GET    /api/v1/diagnosis/rules/:id',
      create: 'POST   /api/v1/diagnosis/rules',
      update: 'PUT    /api/v1/diagnosis/rules/:id',
      delete: 'DELETE /api/v1/diagnosis/rules/:id',
      test:   'POST   /api/v1/diagnosis/rules/:id/test',
    },
    // 快捷诊断
    run:    'POST   /api/v1/diagnosis/run',
  },
  
  // 知识库
  knowledge: {
    collections: {
      list:   'GET    /api/v1/knowledge/collections',
      get:    'GET    /api/v1/knowledge/collections/:id',
      create: 'POST   /api/v1/knowledge/collections',
      update: 'PUT    /api/v1/knowledge/collections/:id',
      delete: 'DELETE /api/v1/knowledge/collections/:id',
    },
    documents: {
      list:   'GET    /api/v1/knowledge/collections/:collectionId/documents',
      get:    'GET    /api/v1/knowledge/documents/:id',
      upload: 'POST   /api/v1/knowledge/collections/:collectionId/documents',
      delete: 'DELETE /api/v1/knowledge/documents/:id',
    },
    // 搜索
    search: 'POST   /api/v1/knowledge/search',
    // 问答
    qa:     'POST   /api/v1/knowledge/qa',
  },
  
  // 插件系统
  plugins: {
    list:     'GET    /api/v1/plugins',
    get:      'GET    /api/v1/plugins/:id',
    install:  'POST   /api/v1/plugins/install',
    uninstall:'DELETE /api/v1/plugins/:id',
    activate: 'POST   /api/v1/plugins/:id/activate',
    deactivate:'POST  /api/v1/plugins/:id/deactivate',
    config:   'PUT    /api/v1/plugins/:id/config',
  },
  
  // 工作流
  workflows: {
    list:     'GET    /api/v1/workflows',
    get:      'GET    /api/v1/workflows/:id',
    create:   'POST   /api/v1/workflows',
    update:   'PUT    /api/v1/workflows/:id',
    delete:   'DELETE /api/v1/workflows/:id',
    execute:  'POST   /api/v1/workflows/:id/execute',
    instances:'GET    /api/v1/workflows/:id/instances',
  },
  
  // AI服务
  ai: {
    chat:     'POST   /api/v1/ai/chat',
    complete: 'POST   /api/v1/ai/complete',
    embed:    'POST   /api/v1/ai/embed',
  },
};
```

### 6.3 统一响应格式

```typescript
// 成功响应
interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: {
    pagination?: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
    timestamp: string;
    requestId: string;
  };
}

// 错误响应
interface ApiErrorResponse {
  success: false;
  error: {
    code: string;           // 错误码
    message: string;        // 用户友好的错误信息
    details?: unknown;      // 详细错误信息
    field?: string;         // 出错字段（验证错误时）
  };
  meta: {
    timestamp: string;
    requestId: string;
  };
}

// 分页请求参数
interface PaginationParams {
  page?: number;            // 页码，从1开始
  pageSize?: number;        // 每页数量，默认20，最大100
  sort?: string;            // 排序字段
  order?: 'asc' | 'desc';   // 排序方向
}

// 过滤参数
interface FilterParams {
  search?: string;          // 全文搜索
  filters?: {               // 字段过滤
    [field: string]: string | string[] | { op: string; value: unknown };
  };
  dateRange?: {
    field: string;
    start: string;
    end: string;
  };
}
```

### 6.4 错误码规范

```typescript
// 错误码定义
const ErrorCodes = {
  // 通用错误 (SYS_xxx)
  SYS_INTERNAL_ERROR: { code: 'SYS_001', message: '系统内部错误', status: 500 },
  SYS_SERVICE_UNAVAILABLE: { code: 'SYS_002', message: '服务暂时不可用', status: 503 },
  SYS_RATE_LIMITED: { code: 'SYS_003', message: '请求过于频繁', status: 429 },
  SYS_MAINTENANCE: { code: 'SYS_004', message: '系统维护中', status: 503 },
  
  // 认证授权 (AUTH_xxx)
  AUTH_INVALID_TOKEN: { code: 'AUTH_001', message: '无效的访问令牌', status: 401 },
  AUTH_TOKEN_EXPIRED: { code: 'AUTH_002', message: '访问令牌已过期', status: 401 },
  AUTH_PERMISSION_DENIED: { code: 'AUTH_003', message: '权限不足', status: 403 },
  AUTH_INVALID_CREDENTIALS: { code: 'AUTH_004', message: '用户名或密码错误', status: 401 },
  
  // 请求错误 (REQ_xxx)
  REQ_INVALID_PARAMS: { code: 'REQ_001', message: '请求参数无效', status: 400 },
  REQ_MISSING_PARAMS: { code: 'REQ_002', message: '缺少必要参数', status: 400 },
  REQ_RESOURCE_NOT_FOUND: { code: 'REQ_003', message: '资源不存在', status: 404 },
  REQ_RESOURCE_CONFLICT: { code: 'REQ_004', message: '资源冲突', status: 409 },
  REQ_PAYLOAD_TOO_LARGE: { code: 'REQ_005', message: '请求体过大', status: 413 },
  
  // 设备管理 (DEV_xxx)
  DEV_NOT_FOUND: { code: 'DEV_001', message: '设备不存在', status: 404 },
  DEV_OFFLINE: { code: 'DEV_002', message: '设备离线', status: 503 },
  DEV_DUPLICATE: { code: 'DEV_003', message: '设备ID已存在', status: 409 },
  DEV_INVALID_TYPE: { code: 'DEV_004', message: '不支持的设备类型', status: 400 },
  
  // 诊断服务 (DIAG_xxx)
  DIAG_TASK_NOT_FOUND: { code: 'DIAG_001', message: '诊断任务不存在', status: 404 },
  DIAG_RULE_INVALID: { code: 'DIAG_002', message: '诊断规则无效', status: 400 },
  DIAG_ENGINE_ERROR: { code: 'DIAG_003', message: '诊断引擎错误', status: 500 },
  DIAG_TIMEOUT: { code: 'DIAG_004', message: '诊断超时', status: 504 },
  
  // 知识库 (KB_xxx)
  KB_COLLECTION_NOT_FOUND: { code: 'KB_001', message: '知识库集合不存在', status: 404 },
  KB_DOCUMENT_NOT_FOUND: { code: 'KB_002', message: '文档不存在', status: 404 },
  KB_PARSE_ERROR: { code: 'KB_003', message: '文档解析失败', status: 400 },
  KB_EMBEDDING_ERROR: { code: 'KB_004', message: '向量化失败', status: 500 },
  KB_SEARCH_ERROR: { code: 'KB_005', message: '搜索失败', status: 500 },
  
  // 插件系统 (PLUGIN_xxx)
  PLUGIN_NOT_FOUND: { code: 'PLUGIN_001', message: '插件不存在', status: 404 },
  PLUGIN_LOAD_ERROR: { code: 'PLUGIN_002', message: '插件加载失败', status: 500 },
  PLUGIN_INVALID_MANIFEST: { code: 'PLUGIN_003', message: '插件清单无效', status: 400 },
  PLUGIN_PERMISSION_DENIED: { code: 'PLUGIN_004', message: '插件权限不足', status: 403 },
  PLUGIN_DEPENDENCY_ERROR: { code: 'PLUGIN_005', message: '插件依赖错误', status: 400 },
  
  // 工作流 (WF_xxx)
  WF_NOT_FOUND: { code: 'WF_001', message: '工作流不存在', status: 404 },
  WF_INVALID_DEFINITION: { code: 'WF_002', message: '工作流定义无效', status: 400 },
  WF_EXECUTION_ERROR: { code: 'WF_003', message: '工作流执行错误', status: 500 },
  WF_TASK_FAILED: { code: 'WF_004', message: '工作流任务失败', status: 500 },
  
  // AI服务 (AI_xxx)
  AI_MODEL_NOT_FOUND: { code: 'AI_001', message: 'AI模型不存在', status: 404 },
  AI_INFERENCE_ERROR: { code: 'AI_002', message: 'AI推理错误', status: 500 },
  AI_CONTEXT_TOO_LONG: { code: 'AI_003', message: '上下文过长', status: 400 },
  AI_SERVICE_UNAVAILABLE: { code: 'AI_004', message: 'AI服务不可用', status: 503 },
};
```

### 6.5 API限流与熔断

```typescript
// 限流配置
const rateLimitConfig = {
  // 全局限流
  global: {
    windowMs: 60 * 1000,      // 1分钟窗口
    maxRequests: 1000,        // 最大请求数
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
    '/api/v1/ai/chat': { windowMs: 60000, maxRequests: 20 },
    '/api/v1/ai/embed': { windowMs: 60000, maxRequests: 100 },
  },
  
  // 按IP限流（防止恶意请求）
  perIP: {
    windowMs: 60 * 1000,
    maxRequests: 200,
  },
};

// 熔断配置
const circuitBreakerConfig = {
  // 默认配置
  default: {
    failureThreshold: 5,      // 失败阈值
    successThreshold: 3,      // 恢复阈值
    timeout: 30000,           // 超时时间(ms)
    resetTimeout: 60000,      // 熔断恢复时间(ms)
  },
  
  // 按服务配置
  services: {
    'ollama': {
      failureThreshold: 3,
      timeout: 60000,
      resetTimeout: 120000,
    },
    'qdrant': {
      failureThreshold: 5,
      timeout: 10000,
      resetTimeout: 30000,
    },
  },
};
```

---

## 七、可观测性设计

### 7.1 监控指标体系

```typescript
// 核心监控指标
const metrics = {
  // 系统指标
  system: {
    cpu_usage: 'gauge',
    memory_usage: 'gauge',
    disk_usage: 'gauge',
    network_io: 'counter',
  },
  
  // API指标
  api: {
    request_total: 'counter',           // 请求总数
    request_duration_seconds: 'histogram', // 请求延迟
    request_size_bytes: 'histogram',    // 请求大小
    response_size_bytes: 'histogram',   // 响应大小
    error_total: 'counter',             // 错误总数
  },
  
  // 诊断指标
  diagnosis: {
    task_total: 'counter',              // 任务总数
    task_duration_seconds: 'histogram', // 任务耗时
    task_queue_length: 'gauge',         // 队列长度
    fault_detected_total: 'counter',    // 检测到的故障数
  },
  
  // 知识库指标
  knowledge: {
    search_total: 'counter',            // 搜索总数
    search_duration_seconds: 'histogram', // 搜索耗时
    document_total: 'gauge',            // 文档总数
    vector_total: 'gauge',              // 向量总数
  },
  
  // AI指标
  ai: {
    inference_total: 'counter',         // 推理总数
    inference_duration_seconds: 'histogram', // 推理耗时
    token_usage_total: 'counter',       // Token使用量
    model_load_time_seconds: 'gauge',   // 模型加载时间
  },
};
```

### 7.2 日志规范

```typescript
// 日志格式
interface LogEntry {
  timestamp: string;          // ISO8601格式
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  service: string;            // 服务名称
  traceId: string;            // 追踪ID
  spanId?: string;            // 跨度ID
  message: string;            // 日志消息
  context?: Record<string, unknown>; // 上下文数据
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// 日志示例
const logExample: LogEntry = {
  timestamp: '2026-02-02T10:30:00.000Z',
  level: 'error',
  service: 'diagnosis-engine',
  traceId: 'abc123def456',
  spanId: 'span789',
  message: 'Diagnosis task failed',
  context: {
    taskId: 'task-001',
    deviceId: 'device-123',
    duration: 5000,
  },
  error: {
    name: 'DiagnosisError',
    message: 'Model inference timeout',
    stack: '...',
  },
};
```

---

## 八、实施路线图

### 第一阶段：基础架构重构（2-4周）

1. **数据库Schema重构**
   - 创建新的数据表（设备、诊断、工作流）
   - 迁移现有数据
   - 建立索引优化

2. **API规范实施**
   - 统一响应格式
   - 实现错误码体系
   - 添加请求验证

3. **容器化优化**
   - 配置资源限制
   - 添加健康检查
   - 实现服务分级

### 第二阶段：核心功能开发（4-6周）

1. **插件引擎框架**
   - 实现插件加载器
   - 构建安全沙箱
   - 开发示例插件

2. **事件驱动架构**
   - 实现事件总线
   - 构建事件存储
   - 开发事件处理器

3. **工作流引擎**
   - 实现DAG解析器
   - 构建任务执行器
   - 开发可视化编辑器

### 第三阶段：优化完善（2-4周）

1. **性能优化**
   - API限流与熔断
   - 缓存策略优化
   - 数据库查询优化

2. **可观测性**
   - 监控指标采集
   - 日志聚合分析
   - 告警规则配置

3. **文档与测试**
   - API文档生成
   - 集成测试覆盖
   - 性能测试报告

---

## 参考文献

[1] System Design Handbook. "Tesla System Design Interview: A Complete Preparation Guide." https://www.systemdesignhandbook.com/guides/tesla-system-design-interview/

[2] Apache Software Foundation. "Apache Airflow Best Practices." https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html

[3] Confluent. "Event-Driven Architecture (EDA): A Complete Introduction." https://www.confluent.io/learn/event-driven-architecture/

[4] Kubernetes Documentation. "Resource Management for Pods and Containers." https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/

[5] Microsoft Azure. "Microservices Architecture Design." https://docs.microsoft.com/en-us/azure/architecture/microservices/

---

*本文档由 Manus AI 生成，版本 2.0，基于特斯拉等行业领先企业的架构实践，结合用户提供的平台设计文档。*
