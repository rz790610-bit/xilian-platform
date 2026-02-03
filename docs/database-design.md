# 西联智能平台数据库表结构设计文档

**版本**: 2.0  
**日期**: 2026年2月3日  
**作者**: Manus AI

---

## 一、数据库架构概述

### 1.1 分层数据架构

西联智能平台采用"冷热分离、专库专用"的分层架构：

| 数据层 | 存储引擎 | 数据类型 | 保留策略 | 访问模式 |
|--------|----------|----------|----------|----------|
| **热数据层** | MySQL/TiDB | 用户、配置、元数据 | 永久保留 | 高频读写 |
| **时序数据层** | InfluxDB/TimescaleDB | 设备遥测、诊断日志 | 90天滚动 | 高频写入、范围查询 |
| **向量数据层** | Qdrant | 知识点嵌入向量 | 永久保留 | 相似度检索 |
| **图数据层** | Neo4j/ArangoDB | 知识图谱、实体关系 | 永久保留 | 图遍历查询 |
| **冷数据层** | S3/MinIO | 原始文档、历史归档 | 按需保留 | 低频访问 |

### 1.2 数据库选型说明

| 组件 | 当前实现 | 推荐升级 | 说明 |
|------|---------|---------|------|
| 关系数据库 | MySQL 8.0 | TiDB | 分布式扩展能力 |
| 向量数据库 | Qdrant | Qdrant | 已满足需求 |
| 时序数据库 | - | InfluxDB | 设备遥测数据存储 |
| 图数据库 | MySQL JSON | Neo4j | 知识图谱高效查询 |
| 对象存储 | S3 | S3/MinIO | 文档和媒体文件 |

---

## 二、当前已实现表结构

### 2.1 用户管理模块

#### users - 用户表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 用户ID |
| openId | VARCHAR(64) | UNIQUE, NOT NULL | Manus OAuth标识 |
| name | TEXT | - | 用户名称 |
| email | VARCHAR(320) | - | 邮箱地址 |
| loginMethod | VARCHAR(64) | - | 登录方式 |
| role | ENUM('user','admin') | DEFAULT 'user' | 用户角色 |
| createdAt | TIMESTAMP | DEFAULT NOW | 创建时间 |
| updatedAt | TIMESTAMP | ON UPDATE | 更新时间 |
| lastSignedIn | TIMESTAMP | DEFAULT NOW | 最后登录时间 |

```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  openId VARCHAR(64) NOT NULL UNIQUE COMMENT 'Manus OAuth标识',
  name TEXT COMMENT '用户名称',
  email VARCHAR(320) COMMENT '邮箱地址',
  loginMethod VARCHAR(64) COMMENT '登录方式',
  role ENUM('user', 'admin') DEFAULT 'user' NOT NULL COMMENT '用户角色',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  lastSignedIn TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

---

### 2.2 知识库模块 (kb_ 前缀)

#### kb_collections - 知识库集合表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 集合ID |
| name | VARCHAR(100) | UNIQUE, NOT NULL | 集合名称 |
| description | TEXT | - | 集合描述 |
| userId | INT | FK | 创建者ID |
| isPublic | BOOLEAN | DEFAULT TRUE | 是否公开 |
| createdAt | TIMESTAMP | DEFAULT NOW | 创建时间 |
| updatedAt | TIMESTAMP | ON UPDATE | 更新时间 |

```sql
CREATE TABLE kb_collections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE COMMENT '集合名称',
  description TEXT COMMENT '集合描述',
  userId INT COMMENT '创建者ID',
  isPublic BOOLEAN DEFAULT TRUE NOT NULL COMMENT '是否公开',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);
```

#### kb_points - 知识点表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 知识点ID |
| collectionId | INT | NOT NULL, FK | 所属集合ID |
| title | VARCHAR(255) | NOT NULL | 标题 |
| content | TEXT | NOT NULL | 内容 |
| category | VARCHAR(50) | DEFAULT 'general' | 分类 |
| tags | JSON | - | 标签数组 |
| source | VARCHAR(255) | - | 来源 |
| entities | JSON | - | 实体数组 |
| relations | JSON | - | 关系数组 |
| embedding | JSON | - | 嵌入向量 |
| createdAt | TIMESTAMP | DEFAULT NOW | 创建时间 |
| updatedAt | TIMESTAMP | ON UPDATE | 更新时间 |

```sql
CREATE TABLE kb_points (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collectionId INT NOT NULL COMMENT '所属集合ID',
  title VARCHAR(255) NOT NULL COMMENT '标题',
  content TEXT NOT NULL COMMENT '内容',
  category VARCHAR(50) DEFAULT 'general' NOT NULL COMMENT '分类',
  tags JSON COMMENT '标签数组',
  source VARCHAR(255) COMMENT '来源',
  entities JSON COMMENT '实体数组',
  relations JSON COMMENT '关系数组: [{source, target, type}]',
  embedding JSON COMMENT '嵌入向量',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_collection (collectionId),
  INDEX idx_category (category)
);
```

#### kb_documents - 文档表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 文档ID |
| collectionId | INT | NOT NULL, FK | 所属集合ID |
| filename | VARCHAR(255) | NOT NULL | 文件名 |
| mimeType | VARCHAR(100) | - | MIME类型 |
| fileSize | INT | - | 文件大小(字节) |
| storageUrl | VARCHAR(500) | - | 存储URL |
| status | ENUM | DEFAULT 'pending' | 处理状态 |
| processedAt | TIMESTAMP | - | 处理完成时间 |
| chunksCount | INT | DEFAULT 0 | 分块数量 |
| entitiesCount | INT | DEFAULT 0 | 实体数量 |
| createdAt | TIMESTAMP | DEFAULT NOW | 创建时间 |
| updatedAt | TIMESTAMP | ON UPDATE | 更新时间 |

```sql
CREATE TABLE kb_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collectionId INT NOT NULL COMMENT '所属集合ID',
  filename VARCHAR(255) NOT NULL COMMENT '文件名',
  mimeType VARCHAR(100) COMMENT 'MIME类型',
  fileSize INT COMMENT '文件大小(字节)',
  storageUrl VARCHAR(500) COMMENT '存储URL',
  status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending' NOT NULL,
  processedAt TIMESTAMP COMMENT '处理完成时间',
  chunksCount INT DEFAULT 0 COMMENT '分块数量',
  entitiesCount INT DEFAULT 0 COMMENT '实体数量',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_collection (collectionId),
  INDEX idx_status (status)
);
```

---

### 2.3 知识图谱模块 (kg_ 前缀)

#### kg_nodes - 图谱节点表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 节点ID |
| collectionId | INT | NOT NULL | 所属集合ID |
| nodeId | VARCHAR(100) | NOT NULL | 节点唯一标识 |
| label | VARCHAR(255) | NOT NULL | 节点标签 |
| type | VARCHAR(50) | DEFAULT 'entity' | 节点类型 |
| properties | JSON | - | 节点属性 |
| x | INT | - | X坐标(可视化) |
| y | INT | - | Y坐标(可视化) |
| createdAt | TIMESTAMP | DEFAULT NOW | 创建时间 |
| updatedAt | TIMESTAMP | ON UPDATE | 更新时间 |

```sql
CREATE TABLE kg_nodes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collectionId INT NOT NULL COMMENT '所属集合ID',
  nodeId VARCHAR(100) NOT NULL COMMENT '节点唯一标识',
  label VARCHAR(255) NOT NULL COMMENT '节点标签',
  type VARCHAR(50) DEFAULT 'entity' NOT NULL COMMENT '节点类型',
  properties JSON COMMENT '节点属性',
  x INT COMMENT 'X坐标',
  y INT COMMENT 'Y坐标',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_collection (collectionId),
  INDEX idx_type (type),
  UNIQUE KEY uk_collection_node (collectionId, nodeId)
);
```

#### kg_edges - 图谱边表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 边ID |
| collectionId | INT | NOT NULL | 所属集合ID |
| edgeId | VARCHAR(100) | NOT NULL | 边唯一标识 |
| sourceNodeId | VARCHAR(100) | NOT NULL | 源节点ID |
| targetNodeId | VARCHAR(100) | NOT NULL | 目标节点ID |
| label | VARCHAR(100) | NOT NULL | 关系标签 |
| type | VARCHAR(50) | DEFAULT 'related_to' | 关系类型 |
| weight | INT | DEFAULT 1 | 权重 |
| createdAt | TIMESTAMP | DEFAULT NOW | 创建时间 |
| updatedAt | TIMESTAMP | ON UPDATE | 更新时间 |

```sql
CREATE TABLE kg_edges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collectionId INT NOT NULL COMMENT '所属集合ID',
  edgeId VARCHAR(100) NOT NULL COMMENT '边唯一标识',
  sourceNodeId VARCHAR(100) NOT NULL COMMENT '源节点ID',
  targetNodeId VARCHAR(100) NOT NULL COMMENT '目标节点ID',
  label VARCHAR(100) NOT NULL COMMENT '关系标签',
  type VARCHAR(50) DEFAULT 'related_to' NOT NULL COMMENT '关系类型',
  weight INT DEFAULT 1 COMMENT '权重',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_collection (collectionId),
  INDEX idx_source (sourceNodeId),
  INDEX idx_target (targetNodeId)
);
```

---

## 三、规划扩展表结构

### 3.1 设备管理模块

#### devices - 设备注册表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 设备ID |
| device_id | VARCHAR(64) | UNIQUE, NOT NULL | 设备唯一标识 |
| device_name | VARCHAR(255) | NOT NULL | 设备名称 |
| device_type | VARCHAR(50) | NOT NULL | 设备类型 |
| model | VARCHAR(100) | - | 设备型号 |
| manufacturer | VARCHAR(100) | - | 制造商 |
| location | VARCHAR(255) | - | 安装位置 |
| status | ENUM | DEFAULT 'offline' | 设备状态 |
| last_heartbeat | TIMESTAMP | - | 最后心跳时间 |
| metadata | JSON | - | 扩展元数据 |
| created_at | TIMESTAMP | DEFAULT NOW | 创建时间 |
| updated_at | TIMESTAMP | ON UPDATE | 更新时间 |

```sql
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
```

#### device_sensors - 设备传感器配置表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 传感器配置ID |
| device_id | VARCHAR(64) | NOT NULL, FK | 设备ID |
| sensor_id | VARCHAR(64) | NOT NULL | 传感器标识 |
| sensor_type | VARCHAR(50) | NOT NULL | 传感器类型 |
| unit | VARCHAR(20) | - | 测量单位 |
| sampling_rate | INT | - | 采样频率(Hz) |
| threshold_config | JSON | - | 阈值配置 |
| is_active | BOOLEAN | DEFAULT TRUE | 是否启用 |
| created_at | TIMESTAMP | DEFAULT NOW | 创建时间 |

```sql
CREATE TABLE device_sensors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(64) NOT NULL COMMENT '设备ID',
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

---

### 3.2 诊断任务模块

#### diagnosis_tasks - 诊断任务表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 任务ID |
| task_id | VARCHAR(64) | UNIQUE, NOT NULL | 任务唯一标识 |
| device_id | VARCHAR(64) | NOT NULL | 设备ID |
| task_type | ENUM | DEFAULT 'routine' | 任务类型 |
| status | ENUM | DEFAULT 'pending' | 任务状态 |
| priority | INT | DEFAULT 5 | 优先级(1-10) |
| input_data | JSON | - | 输入数据 |
| result | JSON | - | 诊断结果 |
| confidence | DECIMAL(5,4) | - | 置信度(0-1) |
| execution_time_ms | INT | - | 执行耗时(毫秒) |
| error_message | TEXT | - | 错误信息 |
| started_at | TIMESTAMP | - | 开始时间 |
| completed_at | TIMESTAMP | - | 完成时间 |
| created_by | INT | - | 创建者ID |
| created_at | TIMESTAMP | DEFAULT NOW | 创建时间 |

```sql
CREATE TABLE diagnosis_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(64) UNIQUE NOT NULL COMMENT '任务唯一标识',
  device_id VARCHAR(64) NOT NULL COMMENT '设备ID',
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
```

#### diagnosis_rules - 诊断规则表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 规则ID |
| rule_id | VARCHAR(64) | UNIQUE, NOT NULL | 规则唯一标识 |
| name | VARCHAR(255) | NOT NULL | 规则名称 |
| description | TEXT | - | 规则描述 |
| category | VARCHAR(50) | - | 规则类别 |
| device_types | JSON | - | 适用设备类型 |
| condition_expr | TEXT | NOT NULL | 条件表达式(DSL) |
| action_type | ENUM | DEFAULT 'alert' | 动作类型 |
| action_config | JSON | - | 动作配置 |
| severity | ENUM | DEFAULT 'medium' | 严重级别 |
| is_active | BOOLEAN | DEFAULT TRUE | 是否启用 |
| version | INT | DEFAULT 1 | 版本号 |
| created_by | INT | - | 创建者ID |
| created_at | TIMESTAMP | DEFAULT NOW | 创建时间 |
| updated_at | TIMESTAMP | ON UPDATE | 更新时间 |

```sql
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
```

#### diagnosis_history - 诊断结果历史表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGINT | PK, AUTO_INCREMENT | 历史ID |
| task_id | VARCHAR(64) | NOT NULL | 任务ID |
| device_id | VARCHAR(64) | NOT NULL | 设备ID |
| fault_type | VARCHAR(100) | - | 故障类型 |
| fault_code | VARCHAR(50) | - | 故障代码 |
| severity | ENUM | - | 严重级别 |
| description | TEXT | - | 故障描述 |
| recommendation | TEXT | - | 处理建议 |
| matched_rules | JSON | - | 匹配的规则ID列表 |
| raw_data | JSON | - | 原始诊断数据 |
| created_at | TIMESTAMP | DEFAULT NOW | 创建时间 |

```sql
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

---

### 3.3 插件系统模块

#### plugins - 插件注册表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 插件ID |
| plugin_id | VARCHAR(64) | UNIQUE, NOT NULL | 插件唯一标识 |
| name | VARCHAR(255) | NOT NULL | 插件名称 |
| version | VARCHAR(20) | NOT NULL | 版本号 |
| author | VARCHAR(100) | - | 作者 |
| description | TEXT | - | 描述 |
| category | ENUM | NOT NULL | 插件类别 |
| entry_point | VARCHAR(255) | - | 入口文件路径 |
| config_schema | JSON | - | 配置项Schema |
| permissions | JSON | - | 所需权限列表 |
| status | ENUM | DEFAULT 'installed' | 插件状态 |
| is_system | BOOLEAN | DEFAULT FALSE | 是否系统内置 |
| install_path | VARCHAR(500) | - | 安装路径 |
| signature | VARCHAR(512) | - | 数字签名 |
| installed_at | TIMESTAMP | DEFAULT NOW | 安装时间 |
| updated_at | TIMESTAMP | ON UPDATE | 更新时间 |

```sql
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
```

#### plugin_configs - 插件配置表

```sql
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
```

#### plugin_logs - 插件执行日志表

```sql
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

---

### 3.4 工作流模块

#### workflows - 工作流定义表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT | PK, AUTO_INCREMENT | 工作流ID |
| workflow_id | VARCHAR(64) | UNIQUE, NOT NULL | 工作流唯一标识 |
| name | VARCHAR(255) | NOT NULL | 工作流名称 |
| description | TEXT | - | 描述 |
| version | INT | DEFAULT 1 | 版本号 |
| status | ENUM | DEFAULT 'draft' | 状态 |
| trigger_type | ENUM | DEFAULT 'manual' | 触发类型 |
| trigger_config | JSON | - | 触发配置 |
| definition | JSON | NOT NULL | DAG定义 |
| timeout_seconds | INT | DEFAULT 3600 | 超时时间(秒) |
| retry_policy | JSON | - | 重试策略 |
| created_by | INT | - | 创建者ID |
| created_at | TIMESTAMP | DEFAULT NOW | 创建时间 |
| updated_at | TIMESTAMP | ON UPDATE | 更新时间 |

```sql
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
```

#### workflow_instances - 工作流实例表

```sql
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
```

#### workflow_task_instances - 工作流任务实例表

```sql
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

---

### 3.5 事件日志模块

#### event_log - 事件日志表

用于实现事件溯源（Event Sourcing），确保跨存储引擎的数据一致性：

```sql
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

## 四、ER 关系图

```
┌─────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   users     │       │  kb_collections │       │   kb_documents  │
├─────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)     │──┐    │ id (PK)         │──┬────│ id (PK)         │
│ openId      │  │    │ name            │  │    │ collectionId(FK)│
│ name        │  │    │ description     │  │    │ filename        │
│ email       │  └───▶│ userId (FK)     │  │    │ status          │
│ role        │       │ isPublic        │  │    └─────────────────┘
└─────────────┘       └─────────────────┘  │
                              │            │    ┌─────────────────┐
                              │            └────│   kb_points     │
                              │                 ├─────────────────┤
                              │                 │ id (PK)         │
                              └────────────────▶│ collectionId(FK)│
                                                │ title           │
                                                │ content         │
                                                │ embedding       │
                                                └─────────────────┘

┌─────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  kg_nodes   │       │    kg_edges     │       │    devices      │
├─────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)     │◀──────│ sourceNodeId    │       │ id (PK)         │
│ collectionId│       │ targetNodeId    │──────▶│ device_id       │
│ nodeId      │◀──────│ label           │       │ device_name     │
│ label       │       │ type            │       │ status          │
│ type        │       └─────────────────┘       └────────┬────────┘
└─────────────┘                                          │
                                                         │
┌─────────────────┐       ┌─────────────────┐           │
│ device_sensors  │       │ diagnosis_tasks │           │
├─────────────────┤       ├─────────────────┤           │
│ id (PK)         │       │ id (PK)         │           │
│ device_id (FK)  │◀──────│ device_id (FK)  │◀──────────┘
│ sensor_id       │       │ task_id         │
│ sensor_type     │       │ status          │
└─────────────────┘       │ result          │
                          └─────────────────┘
```

---

## 五、索引设计建议

### 5.1 主要索引

| 表名 | 索引名 | 字段 | 类型 | 说明 |
|------|--------|------|------|------|
| users | uk_openId | openId | UNIQUE | 用户唯一标识 |
| kb_collections | uk_name | name | UNIQUE | 集合名称唯一 |
| kb_points | idx_collection | collectionId | INDEX | 按集合查询 |
| kb_points | idx_category | category | INDEX | 按分类查询 |
| kg_nodes | uk_collection_node | collectionId, nodeId | UNIQUE | 集合内节点唯一 |
| devices | uk_device_id | device_id | UNIQUE | 设备唯一标识 |
| devices | idx_status | status | INDEX | 按状态查询 |
| diagnosis_tasks | idx_device_status | device_id, status | INDEX | 按设备和状态查询 |
| diagnosis_tasks | idx_created_at | created_at | INDEX | 按时间查询 |

### 5.2 复合索引建议

```sql
-- 诊断任务查询优化
CREATE INDEX idx_task_query ON diagnosis_tasks(device_id, status, created_at DESC);

-- 知识点检索优化
CREATE INDEX idx_kb_search ON kb_points(collectionId, category, createdAt DESC);

-- 工作流实例查询优化
CREATE INDEX idx_workflow_query ON workflow_instances(workflow_id, status, created_at DESC);
```

---

## 六、数据迁移脚本

### 6.1 从当前版本升级

```sql
-- 添加设备管理表
SOURCE /path/to/devices.sql;

-- 添加诊断任务表
SOURCE /path/to/diagnosis.sql;

-- 添加插件系统表
SOURCE /path/to/plugins.sql;

-- 添加工作流表
SOURCE /path/to/workflows.sql;

-- 添加事件日志表
SOURCE /path/to/event_log.sql;
```

### 6.2 数据备份命令

```bash
# 备份所有表
mysqldump -u root -p xilian_platform > backup_$(date +%Y%m%d).sql

# 备份指定表
mysqldump -u root -p xilian_platform users kb_collections kb_points > backup_core.sql
```

---

## 七、版本历史

| 版本 | 日期 | 变更说明 |
|------|------|----------|
| 1.0 | 2026-01-20 | 初始版本：users, kb_*, kg_* 表 |
| 2.0 | 2026-02-03 | 新增设备管理、诊断任务、插件系统、工作流模块 |

---

## 附录：完整建表脚本

完整的 SQL 建表脚本请参考项目目录：
- `/drizzle/schema.ts` - Drizzle ORM Schema 定义
- `/drizzle/*.sql` - SQL 迁移文件
