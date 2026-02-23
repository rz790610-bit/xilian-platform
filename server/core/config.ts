/**
 * PortAI Nexus — 统一配置中心
 * 所有外部服务地址、端口、凭证的唯一来源
 *
 * 配置迁移追踪表（2026-02-23 v2.2）
 * 已迁移：docker.defaults.ts (31→0)
 * 待迁移：57 文件 274 处 → 目标 ≤3
 * 新增域（22 个）：ollama、xai、grokApi、dbPool、featureFlags、otel、vault、
 *   auditLog、rateLimit、grpc、llm、kong、kafkaCluster、kafkaConnect、
 *   clickhouseCluster、qdrantCluster、redisCluster、postgres、readReplica（扩展）、
 *   storageFlags、visual、dsp
 * 扩展域（4 个）：mysql、monitoring、security、app
 *
 * 使用方式：
 *   import { config } from '../core/config';
 *   const mysqlUrl = config.mysql.url;
 *   const kafkaBrokers = config.kafka.brokers;
 *
 * 环境变量优先级：
 *   环境变量 > .env 文件 > 默认值
 *
 * 零依赖原则：本文件仅依赖 process.env，不导入任何其他模块
 */

// ============================================
// 辅助函数
// ============================================

function env(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function envInt(key: string, defaultValue: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : defaultValue;
}

function envFloat(key: string, defaultValue: number): number {
  const v = process.env[key];
  return v ? parseFloat(v) : defaultValue;
}

function envBool(key: string, defaultValue: boolean): boolean {
  const v = process.env[key];
  if (!v) return defaultValue;
  return v === 'true' || v === '1' || v === 'yes';
}

function envList(key: string, defaultValue: string[]): string[] {
  const v = process.env[key];
  return v ? v.split(',').map(s => s.trim()) : defaultValue;
}

// ============================================
// Mutable 配置（支持运行时更新的字段）
// ============================================

const _mutableOllama = {
  defaultLlm: env('OLLAMA_DEFAULT_LLM', 'qwen2.5:7b'),
  defaultEmbed: env('OLLAMA_DEFAULT_EMBED', 'nomic-embed-text'),
  extraModels: envList('OLLAMA_EXTRA_MODELS', []),
};

/** 运行时更新 Ollama 配置（供 modelAutoInit.service.ts 使用） */
export function updateOllamaConfig(updates: Partial<typeof _mutableOllama>): void {
  Object.assign(_mutableOllama, updates);
}

/** 重置 Ollama 配置到初始值（便于测试） */
export function resetOllamaConfig(): void {
  _mutableOllama.defaultLlm = env('OLLAMA_DEFAULT_LLM', 'qwen2.5:7b');
  _mutableOllama.defaultEmbed = env('OLLAMA_DEFAULT_EMBED', 'nomic-embed-text');
  _mutableOllama.extraModels = envList('OLLAMA_EXTRA_MODELS', []);
}

// ============================================
// 配置结构
// ============================================

export const config = {

  // ──────────────────────────────────────────
  // 应用基础
  // ──────────────────────────────────────────

  /** 应用基础配置 */
  app: {
    name: env('APP_NAME', 'PortAI Nexus'),
    version: env('APP_VERSION', '4.0.0'),
    env: env('NODE_ENV', 'development') as 'development' | 'production' | 'test',
    port: envInt('PORT', 3000),
    host: env('HOST', '0.0.0.0'),
    logLevel: env('LOG_LEVEL', 'info') as 'trace' | 'debug' | 'info' | 'warn' | 'error',
    baseUrl: env('BASE_URL', 'http://localhost:3000'),
    appId: env('VITE_APP_ID', ''),
    /** 日志缓冲区大小 */
    logBufferSize: envInt('LOG_BUFFER_SIZE', 1000),
    /** 信任代理（Nginx/LB 后部署时设为 true） */
    trustProxy: envBool('TRUST_PROXY', false),
    /** 部署模式：standalone | kubernetes | docker-compose */
    deploymentMode: env('DEPLOYMENT_MODE', 'standalone') as 'standalone' | 'kubernetes' | 'docker-compose',
    /** Kubernetes Pod 命名空间 */
    podNamespace: env('POD_NAMESPACE', 'default'),
  },

  /** OAuth / 身份认证 */
  auth: {
    oAuthServerUrl: env('OAUTH_SERVER_URL', ''),
    ownerOpenId: env('OWNER_OPEN_ID', ''),
    skipAuth: envBool('SKIP_AUTH', false),
    /** 跳过认证时使用的默认角色 */
    skipAuthRole: env('SKIP_AUTH_ROLE', 'admin'),
  },

  // ──────────────────────────────────────────
  // 数据库
  // ──────────────────────────────────────────

  /** MySQL 主数据库 */
  mysql: {
    host: env('MYSQL_HOST', 'localhost'),
    port: envInt('MYSQL_PORT', 3306),
    user: env('MYSQL_USER', 'root'),
    password: env('MYSQL_PASSWORD', ''),
    database: env('MYSQL_DATABASE', 'portai_nexus'),
    get url(): string {
      return env('DATABASE_URL', `mysql://${config.mysql.user}:${config.mysql.password}@${config.mysql.host}:${config.mysql.port}/${config.mysql.database}`);
    },
    poolSize: envInt('MYSQL_POOL_SIZE', 10),
    ssl: envBool('MYSQL_SSL', false),
    /** 总存储容量（GB），用于监控告警 */
    totalStorageGb: envInt('MYSQL_TOTAL_STORAGE_GB', 100),
    /** Root 密码（仅 Docker Compose 健康检查使用） */
    rootPassword: env('MYSQL_ROOT_PASSWORD', ''),
    /** 兼容别名：DATABASE_HOST → MYSQL_HOST */
    get hostAlias(): string {
      return env('DATABASE_HOST', config.mysql.host);
    },
    /** 兼容别名：DATABASE_PORT → MYSQL_PORT */
    get portAlias(): number {
      return envInt('DATABASE_PORT', config.mysql.port);
    },
  },

  /** MySQL 连接池高级配置 */
  dbPool: {
    max: envInt('DB_POOL_MAX', 10),
    queueLimit: envInt('DB_POOL_QUEUE_LIMIT', 0),
    idleTimeout: envInt('DB_POOL_IDLE_TIMEOUT', 60000),
    minIdle: envInt('DB_POOL_MIN_IDLE', 2),
  },

  /** MySQL 读副本 */
  mysqlReplica: {
    host: env('MYSQL_REPLICA_HOST', env('MYSQL_HOST', 'localhost')),
    port: envInt('MYSQL_REPLICA_PORT', envInt('MYSQL_PORT', 3306)),
    user: env('MYSQL_REPLICA_USER', env('MYSQL_USER', 'root')),
    password: env('MYSQL_REPLICA_PASSWORD', env('MYSQL_PASSWORD', '')),
    database: env('MYSQL_REPLICA_DATABASE', env('MYSQL_DATABASE', 'portai_nexus')),
    get url(): string {
      return env('DATABASE_REPLICA_URL', `mysql://${config.mysqlReplica.user}:${config.mysqlReplica.password}@${config.mysqlReplica.host}:${config.mysqlReplica.port}/${config.mysqlReplica.database}`);
    },
    enabled: envBool('MYSQL_REPLICA_ENABLED', false),
    /** 读副本主机列表（逗号分隔） */
    replicaHosts: envList('DB_REPLICA_HOSTS', []),
    /** 读副本端口 */
    replicaPort: envInt('DB_REPLICA_PORT', 3306),
  },

  /** PostgreSQL（可选，用于特定存储场景） */
  postgres: {
    poolMax: envInt('PG_POOL_MAX', 10),
    poolMin: envInt('PG_POOL_MIN', 2),
    idleTimeout: envInt('PG_IDLE_TIMEOUT', 30000),
    connTimeout: envInt('PG_CONN_TIMEOUT', 5000),
  },

  // ──────────────────────────────────────────
  // 时序数据库 & 搜索引擎
  // ──────────────────────────────────────────

  /** ClickHouse 时序数据库 */
  clickhouse: {
    host: env('CLICKHOUSE_HOST', 'localhost'),
    port: envInt('CLICKHOUSE_PORT', 8123),
    nativePort: envInt('CLICKHOUSE_NATIVE_PORT', 9000),
    user: env('CLICKHOUSE_USER', 'default'),
    password: env('CLICKHOUSE_PASSWORD', ''),
    database: env('CLICKHOUSE_DATABASE', 'portai_nexus'),
    get url(): string {
      return env('CLICKHOUSE_URL', `http://${config.clickhouse.host}:${config.clickhouse.port}`);
    },
    ssl: envBool('CLICKHOUSE_SSL', false),
    enabled: envBool('CLICKHOUSE_ENABLED', true),
  },

  /** ClickHouse 集群拓扑 */
  clickhouseCluster: {
    clusterMode: envBool('CLICKHOUSE_CLUSTER_MODE', false),
    get enabled(): boolean { return config.clickhouseCluster.clusterMode; },
    node1Host: env('CLICKHOUSE_NODE1_HOST', 'clickhouse-node1'),
    node2Host: env('CLICKHOUSE_NODE2_HOST', 'clickhouse-node2'),
    node3Host: env('CLICKHOUSE_NODE3_HOST', 'clickhouse-node3'),
  },

  /** Elasticsearch 搜索引擎 */
  elasticsearch: {
    host: env('ELASTICSEARCH_HOST', 'localhost'),
    port: envInt('ELASTICSEARCH_PORT', 9200),
    get url(): string {
      const protocol = env('ELASTICSEARCH_PROTOCOL', 'http');
      return env('ELASTICSEARCH_URL', `${protocol}://${config.elasticsearch.host}:${config.elasticsearch.port}`);
    },
    user: env('ELASTICSEARCH_USER', ''),
    username: env('ELASTICSEARCH_USERNAME', ''),
    password: env('ELASTICSEARCH_PASSWORD', ''),
    ssl: envBool('ELASTICSEARCH_SSL', false),
    protocol: env('ELASTICSEARCH_PROTOCOL', 'http'),
  },

  /** InfluxDB 时序数据库 */
  influxdb: {
    host: env('INFLUXDB_HOST', 'localhost'),
    port: envInt('INFLUXDB_PORT', 8086),
    get url(): string {
      return env('INFLUXDB_URL', `http://${config.influxdb.host}:${config.influxdb.port}`);
    },
    token: env('INFLUXDB_TOKEN', ''),
    org: env('INFLUXDB_ORG', 'portai'),
    bucket: env('INFLUXDB_BUCKET', 'portai-nexus'),
  },

  // ──────────────────────────────────────────
  // 缓存 & 消息队列
  // ──────────────────────────────────────────

  /** Redis 缓存 */
  redis: {
    host: env('REDIS_HOST', 'localhost'),
    port: envInt('REDIS_PORT', 6379),
    password: env('REDIS_PASSWORD', ''),
    db: envInt('REDIS_DB', 0),
    get url(): string {
      const auth = config.redis.password ? `:${config.redis.password}@` : '';
      return env('REDIS_URL', `redis://${auth}${config.redis.host}:${config.redis.port}/${config.redis.db}`);
    },
    keyPrefix: env('REDIS_KEY_PREFIX', 'nexus:'),
    maxRetries: envInt('REDIS_MAX_RETRIES', 3),
    enabled: envBool('REDIS_ENABLED', true),
  },

  /** Redis 集群拓扑 */
  redisCluster: {
    clusterMode: envBool('REDIS_CLUSTER_MODE', false),
    get enabled(): boolean { return config.redisCluster.clusterMode; },
    node1Host: env('REDIS_NODE1_HOST', 'redis-node1'),
    node2Host: env('REDIS_NODE2_HOST', 'redis-node2'),
    node3Host: env('REDIS_NODE3_HOST', 'redis-node3'),
    node4Host: env('REDIS_NODE4_HOST', 'redis-node4'),
    node5Host: env('REDIS_NODE5_HOST', 'redis-node5'),
    node6Host: env('REDIS_NODE6_HOST', 'redis-node6'),
  },

  /** Kafka 消息队列 */
  kafka: {
    brokers: envList('KAFKA_BROKERS', ['localhost:9092']),
    /** 单 Broker 地址（兼容旧配置） */
    broker: env('KAFKA_BROKER', 'localhost:9092'),
    clientId: env('KAFKA_CLIENT_ID', 'portai-nexus'),
    groupId: env('KAFKA_GROUP_ID', 'portai-nexus-group'),
    ssl: envBool('KAFKA_SSL', false),
    saslMechanism: env('KAFKA_SASL_MECHANISM', '') as '' | 'plain' | 'scram-sha-256' | 'scram-sha-512',
    saslUsername: env('KAFKA_SASL_USERNAME', ''),
    saslPassword: env('KAFKA_SASL_PASSWORD', ''),
  },

  /** Kafka 集群拓扑 */
  kafkaCluster: {
    broker1Host: env('KAFKA_BROKER1_HOST', 'kafka-broker1'),
    broker2Host: env('KAFKA_BROKER2_HOST', 'kafka-broker2'),
    broker3Host: env('KAFKA_BROKER3_HOST', 'kafka-broker3'),
    /** 逗号分隔的 broker 列表（兼容 storageHealth 等直接读取场景） */
    get brokers(): string {
      return `${config.kafkaCluster.broker1Host}:9092,${config.kafkaCluster.broker2Host}:9092,${config.kafkaCluster.broker3Host}:9092`;
    },
    clusterId: env('KAFKA_CLUSTER_ID', 'portai-kafka-cluster'),
    archivePath: env('KAFKA_ARCHIVE_PATH', '/data/kafka-archive'),
  },

  /** Kafka Connect */
  kafkaConnect: {
    host: env('KAFKA_CONNECT_HOST', 'localhost'),
    port: envInt('KAFKA_CONNECT_PORT', 8083),
    protocol: env('KAFKA_CONNECT_PROTOCOL', 'http'),
  },

  /** ZooKeeper（Kafka 依赖） */
  zookeeper: {
    host: env('ZOOKEEPER_HOST', 'localhost'),
    port: envInt('ZOOKEEPER_PORT', 2181),
  },

  // ──────────────────────────────────────────
  // 对象存储 & 图数据库 & 向量数据库
  // ──────────────────────────────────────────

  /** MinIO / S3 对象存储 */
  minio: {
    endpoint: env('MINIO_ENDPOINT', 'localhost'),
    port: envInt('MINIO_PORT', 9000),
    accessKey: env('MINIO_ACCESS_KEY', 'minioadmin'),
    secretKey: env('MINIO_SECRET_KEY', 'minioadmin'),
    bucket: env('MINIO_BUCKET', 'portai-nexus'),
    useSSL: envBool('MINIO_USE_SSL', false),
    ssl: envBool('MINIO_SSL', false),
    region: env('MINIO_REGION', 'us-east-1'),
    enabled: envBool('MINIO_ENABLED', true),
  },

  /** Neo4j 图数据库 */
  neo4j: {
    host: env('NEO4J_HOST', 'localhost'),
    port: envInt('NEO4J_PORT', 7687),
    httpPort: envInt('NEO4J_HTTP_PORT', 7474),
    user: env('NEO4J_USER', 'neo4j'),
    password: env('NEO4J_PASSWORD', 'neo4j'),
    get url(): string {
      return env('NEO4J_URL', `bolt://${config.neo4j.host}:${config.neo4j.port}`);
    },
    /** NEO4J_URI 兼容别名 */
    get uri(): string {
      return env('NEO4J_URI', config.neo4j.url);
    },
    database: env('NEO4J_DATABASE', 'neo4j'),
    enabled: envBool('NEO4J_ENABLED', true),
  },

  /** Qdrant 向量数据库 */
  qdrant: {
    host: env('QDRANT_HOST', 'localhost'),
    port: envInt('QDRANT_PORT', 6333),
    get url(): string {
      const protocol = envBool('QDRANT_HTTPS', false) ? 'https' : 'http';
      return env('QDRANT_URL', `${protocol}://${config.qdrant.host}:${config.qdrant.port}`);
    },
    apiKey: env('QDRANT_API_KEY', ''),
    enabled: envBool('QDRANT_ENABLED', true),
    https: envBool('QDRANT_HTTPS', false),
    version: env('QDRANT_VERSION', 'latest'),
    totalStorageGb: envInt('QDRANT_TOTAL_STORAGE_GB', 50),
  },

  /** Qdrant 集群拓扑 */
  qdrantCluster: {
    clusterMode: envBool('QDRANT_CLUSTER_MODE', false),
    node1Host: env('QDRANT_NODE1_HOST', 'qdrant-node1'),
    node2Host: env('QDRANT_NODE2_HOST', 'qdrant-node2'),
  },

  // ──────────────────────────────────────────
  // 工业协议
  // ──────────────────────────────────────────

  /** MQTT Broker */
  mqtt: {
    host: env('MQTT_HOST', 'localhost'),
    port: envInt('MQTT_PORT', 1883),
    get url(): string {
      const protocol = config.mqtt.ssl ? 'mqtts' : 'mqtt';
      return env('MQTT_URL', `${protocol}://${config.mqtt.host}:${config.mqtt.port}`);
    },
    /** MQTT_BROKER_URL 兼容别名 */
    get brokerUrl(): string {
      return env('MQTT_BROKER_URL', config.mqtt.url);
    },
    username: env('MQTT_USERNAME', ''),
    password: env('MQTT_PASSWORD', ''),
    ssl: envBool('MQTT_SSL', false),
  },

  /** OPC-UA */
  opcua: {
    endpoint: env('OPCUA_ENDPOINT', 'opc.tcp://localhost:4840'),
  },

  /** Modbus */
  modbus: {
    host: env('MODBUS_HOST', 'localhost'),
    port: envInt('MODBUS_PORT', 502),
  },

  /** Docker 引擎 */
  docker: {
    socketPath: env('DOCKER_SOCKET_PATH', '/var/run/docker.sock'),
    host: env('DOCKER_HOST', ''),
    tlsCert: env('DOCKER_TLS_CERT', ''),
    tlsKey: env('DOCKER_TLS_KEY', ''),
    tlsCa: env('DOCKER_TLS_CA', ''),
  },

  // ──────────────────────────────────────────
  // AI / LLM 服务
  // ──────────────────────────────────────────

  /** Ollama 本地 LLM */
  ollama: {
    host: env('OLLAMA_HOST', 'localhost'),
    port: envInt('OLLAMA_PORT', 11434),
    get url(): string {
      return env('OLLAMA_URL', `http://${config.ollama.host}:${config.ollama.port}`);
    },
    model: env('OLLAMA_MODEL', 'qwen2.5:7b'),
    /** 运行时可变：默认 LLM 模型 */
    get defaultLlm(): string { return _mutableOllama.defaultLlm; },
    /** 运行时可变：默认 Embedding 模型 */
    get defaultEmbed(): string { return _mutableOllama.defaultEmbed; },
    /** 运行时可变：额外加载的模型列表 */
    get extraModels(): string[] { return _mutableOllama.extraModels; },
    autoInit: envBool('OLLAMA_AUTO_INIT', true),
    initDelay: envInt('OLLAMA_INIT_DELAY', 5000),
    initRetry: envInt('OLLAMA_INIT_RETRY', 3),
  },

  /** XAI / Grok API */
  xai: {
    apiUrl: env('XAI_API_URL', 'https://api.x.ai/v1'),
    apiKey: env('XAI_API_KEY', ''),
    model: env('XAI_MODEL', 'grok-3'),
    platformModel: env('XAI_PLATFORM_MODEL', 'grok-3'),
    maxTokens: envInt('XAI_MAX_TOKENS', 4096),
    temperature: envFloat('XAI_TEMPERATURE', 0.7),
    timeout: envInt('XAI_TIMEOUT', 30000),
    fallbackOllama: envBool('XAI_FALLBACK_OLLAMA', true),
  },

  /** Grok API 高级配置 */
  grokApi: {
    baseUrl: env('GROK_API_BASE_URL', 'https://api.x.ai/v1'),
    apiKey: env('GROK_API_KEY', ''),
    defaultModel: env('GROK_DEFAULT_MODEL', 'grok-3'),
    reasoningModel: env('GROK_REASONING_MODEL', 'grok-3-reasoning'),
    defaultMaxTokens: envInt('GROK_DEFAULT_MAX_TOKENS', 4096),
    defaultTemperature: envFloat('GROK_DEFAULT_TEMPERATURE', 0.7),
    maxConcurrency: envInt('GROK_MAX_CONCURRENCY', 10),
    maxRetries: envInt('GROK_MAX_RETRIES', 3),
    retryBaseDelayMs: envInt('GROK_RETRY_BASE_DELAY_MS', 1000),
    requestTimeoutMs: envInt('GROK_REQUEST_TIMEOUT_MS', 30000),
    rateLimitPerMinute: envInt('GROK_RATE_LIMIT_PER_MINUTE', 60),
    tokenLimitPerMinute: envInt('GROK_TOKEN_LIMIT_PER_MINUTE', 100000),
    enableToolCalling: envBool('GROK_ENABLE_TOOL_CALLING', true),
    enableStructuredOutput: envBool('GROK_ENABLE_STRUCTURED_OUTPUT', true),
    enableReactLoop: envBool('GROK_ENABLE_REACT_LOOP', true),
    reactMaxIterations: envInt('GROK_REACT_MAX_ITERATIONS', 10),
    enableReasoningPersistence: envBool('GROK_ENABLE_REASONING_PERSISTENCE', true),
  },

  /** 通用 LLM 配置 */
  llm: {
    model: env('LLM_MODEL', 'grok-3'),
    maxTokens: envInt('LLM_MAX_TOKENS', 4096),
    thinkingBudget: envInt('LLM_THINKING_BUDGET', 10000),
  },

  /** 外部 API */
  externalApis: {
    openaiApiKey: env('OPENAI_API_KEY', ''),
    openaiBaseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
    forgeApiUrl: env('BUILT_IN_FORGE_API_URL', ''),
    forgeApiKey: env('BUILT_IN_FORGE_API_KEY', ''),
    webhookUrl: env('WEBHOOK_URL', ''),
  },

  /** 视觉推理 */
  visual: {
    inferenceUrl: env('VISUAL_INFERENCE_URL', 'http://localhost:8080/predict'),
  },

  // ──────────────────────────────────────────
  // 微服务 & 网关
  // ──────────────────────────────────────────

  /** gRPC 微服务 */
  grpc: {
    deploymentMode: env('DEPLOYMENT_MODE', 'monolith'),
    algorithmServiceHost: env('ALGORITHM_SERVICE_HOST', 'localhost'),
    algorithmServicePort: envInt('ALGORITHM_SERVICE_PORT', 50052),
    deviceServiceHost: env('DEVICE_SERVICE_HOST', 'localhost'),
    deviceServicePort: envInt('DEVICE_SERVICE_PORT', 50051),
    tlsCertPath: env('GRPC_TLS_CERT_PATH', ''),
    tlsKeyPath: env('GRPC_TLS_KEY_PATH', ''),
    tlsCaPath: env('GRPC_TLS_CA_PATH', ''),
  },

  /** Kong API 网关 */
  kong: {
    adminUrl: env('KONG_ADMIN_URL', 'http://localhost:8001'),
    statusUrl: env('KONG_STATUS_URL', 'http://localhost:8100'),
  },

  // ──────────────────────────────────────────
  // 安全 & 限流
  // ──────────────────────────────────────────

  /** 安全配置 */
  security: {
    jwtSecret: env('JWT_SECRET', 'change-me-in-production'),
    jwtExpiresIn: env('JWT_EXPIRES_IN', '24h'),
    bcryptRounds: envInt('BCRYPT_ROUNDS', 12),
    corsOrigins: envList('CORS_ORIGINS', ['*']),
    rateLimitWindowMs: envInt('RATE_LIMIT_WINDOW_MS', 60000),
    rateLimitMax: envInt('RATE_LIMIT_MAX', 100),
    enableHsts: envBool('ENABLE_HSTS', false),
  },

  /** 限流配置（细粒度） */
  rateLimit: {
    enabled: envBool('RATE_LIMIT_ENABLED', true),
    global: envInt('RATE_LIMIT_GLOBAL', 1000),
    api: envInt('RATE_LIMIT_API', 100),
    auth: envInt('RATE_LIMIT_AUTH', 20),
    upload: envInt('RATE_LIMIT_UPLOAD', 10),
    algorithm: envInt('RATE_LIMIT_ALGORITHM', 50),
  },

  /** HashiCorp Vault */
  vault: {
    addr: env('VAULT_ADDR', ''),
    token: env('VAULT_TOKEN', ''),
    roleId: env('VAULT_ROLE_ID', ''),
    secretId: env('VAULT_SECRET_ID', ''),
    namespace: env('VAULT_NAMESPACE', ''),
    caCert: env('VAULT_CACERT', ''),
  },

  // ──────────────────────────────────────────
  // 可观测性
  // ──────────────────────────────────────────

  /** OpenTelemetry */
  otel: {
    enabled: envBool('OTEL_ENABLED', false),
    serviceName: env('OTEL_SERVICE_NAME', 'portai-nexus'),
    collectorEndpoint: env('OTEL_COLLECTOR_ENDPOINT', 'http://localhost:4318'),
    exporterEndpoint: env('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4318'),
    samplingRatio: envFloat('OTEL_SAMPLING_RATIO', 1.0),
    autoInstrument: envBool('OTEL_AUTO_INSTRUMENT', true),
  },

  /** 监控服务 */
  monitoring: {
    prometheusHost: env('PROMETHEUS_HOST', 'localhost'),
    prometheusPort: envInt('PROMETHEUS_PORT', 9090),
    prometheusProtocol: env('PROMETHEUS_PROTOCOL', 'http'),
    grafanaHost: env('GRAFANA_HOST', 'localhost'),
    grafanaPort: envInt('GRAFANA_PORT', 3001),
    jaegerHost: env('JAEGER_HOST', 'localhost'),
    jaegerPort: envInt('JAEGER_PORT', 16686),
    jaegerProtocol: env('JAEGER_PROTOCOL', 'http'),
  },

  /** 审计日志 */
  auditLog: {
    enabled: envBool('AUDIT_LOG_ENABLED', true),
    queueSize: envInt('AUDIT_LOG_QUEUE_SIZE', 10000),
    flushInterval: envInt('AUDIT_LOG_FLUSH_INTERVAL', 5000),
    queries: envBool('AUDIT_LOG_QUERIES', false),
    excludePaths: envList('AUDIT_LOG_EXCLUDE_PATHS', ['/api/rest/_health', '/api/rest/_ready']),
    highRiskKeywords: envList('AUDIT_LOG_HIGH_RISK_KEYWORDS', ['DELETE', 'DROP', 'TRUNCATE']),
    sensitiveKeywords: envList('AUDIT_LOG_SENSITIVE_KEYWORDS', ['password', 'token', 'secret', 'key']),
  },

  // ──────────────────────────────────────────
  // 功能开关 & 存储标志
  // ──────────────────────────────────────────

  /** 功能开关 */
  featureFlags: {
    airflowEnabled: envBool('FEATURE_AIRFLOW_ENABLED', false),
    kafkaConnectEnabled: envBool('FEATURE_KAFKA_CONNECT_ENABLED', false),
    elasticsearchEnabled: envBool('FEATURE_ELASTICSEARCH_ENABLED', false),
    flinkEnabled: envBool('FEATURE_FLINK_ENABLED', false),
    grokEnabled: envBool('FEATURE_GROK_ENABLED', true),
    grokEnhance: envBool('ENABLE_GROK_ENHANCE', true),
  },

  /** 存储引擎开关（用于 storageManager） */
  storageFlags: {
    clickhouseEnabled: envBool('CLICKHOUSE_ENABLED', true),
    neo4jEnabled: envBool('NEO4J_ENABLED', true),
    qdrantEnabled: envBool('QDRANT_ENABLED', true),
    minioEnabled: envBool('MINIO_ENABLED', true),
    redisEnabled: envBool('REDIS_ENABLED', true),
  },

  // ──────────────────────────────────────────
  // 外部编排 & 算法引擎
  // ──────────────────────────────────────────

  /** Airflow 任务编排 */
  airflow: {
    host: env('AIRFLOW_HOST', 'localhost'),
    port: envInt('AIRFLOW_PORT', 8080),
    protocol: env('AIRFLOW_PROTOCOL', 'http'),
    username: env('AIRFLOW_USERNAME', 'admin'),
    password: env('AIRFLOW_PASSWORD', 'admin'),
    get url(): string {
      return `${config.airflow.protocol}://${config.airflow.host}:${config.airflow.port}`;
    },
  },

  /** 算法引擎 / DSP */
  dsp: {
    workerPool: envInt('DSP_WORKER_POOL', 4),
    workerPoolEnabled: envBool('DSP_WORKER_POOL_ENABLED', true),
  },

  /** Kubernetes 服务发现 */
  k8s: {
    serviceHost: env('KUBERNETES_SERVICE_HOST', ''),
  },

} as const;

// ============================================
// 配置验证
// ============================================

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateConfig(): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 生产环境必须配置
  if (config.app.env === 'production') {
    if (config.security.jwtSecret === 'change-me-in-production') {
      // P2-A05 修复：生产环境弱密钥直接阻断进程启动
      console.error('[FATAL] JWT_SECRET is using default value in production. Aborting.');
      process.exit(1);
    }
    if (config.security.corsOrigins.includes('*')) {
      errors.push('CORS_ORIGINS is set to wildcard (*) in production — this is a security risk');
    }
  }

  // 数据库连接检查
  if (!config.mysql.host) {
    warnings.push('MYSQL_HOST is not configured');
  }
  // P1-E: 生产环境必须配置的环境变量
  if (config.app.env === 'production') {
    if (!config.mysql.password) errors.push('MYSQL_PASSWORD is required in production');
    if (!config.redis.host) errors.push('REDIS_HOST is required in production');
    if (!config.mysql.rootPassword) warnings.push('MYSQL_ROOT_PASSWORD not set, docker-compose healthcheck may fail');
    if (!config.xai.apiKey && !config.grokApi.apiKey) warnings.push('XAI_API_KEY / GROK_API_KEY not set, AI features will be unavailable');
    if (!config.vault.addr) warnings.push('VAULT_ADDR not set, secrets will use environment variables directly');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/** 获取所有配置的摘要（隐藏敏感信息） */
export function getConfigSummary(): Record<string, Record<string, string>> {
  const mask = (v: string) => v ? '***' : '(empty)';

  return {
    app: {
      name: config.app.name,
      version: config.app.version,
      env: config.app.env,
      port: String(config.app.port),
      logLevel: config.app.logLevel,
      deploymentMode: config.app.deploymentMode,
    },
    mysql: {
      host: config.mysql.host,
      port: String(config.mysql.port),
      database: config.mysql.database,
      password: mask(config.mysql.password),
      poolSize: String(config.mysql.poolSize),
    },
    clickhouse: {
      host: config.clickhouse.host,
      port: String(config.clickhouse.port),
      database: config.clickhouse.database,
      password: mask(config.clickhouse.password),
      enabled: String(config.clickhouse.enabled),
    },
    redis: {
      host: config.redis.host,
      port: String(config.redis.port),
      password: mask(config.redis.password),
      enabled: String(config.redis.enabled),
    },
    kafka: {
      brokers: config.kafka.brokers.join(','),
      clientId: config.kafka.clientId,
    },
    minio: {
      endpoint: config.minio.endpoint,
      port: String(config.minio.port),
      bucket: config.minio.bucket,
      accessKey: mask(config.minio.accessKey),
    },
    neo4j: {
      host: config.neo4j.host,
      port: String(config.neo4j.port),
      password: mask(config.neo4j.password),
      enabled: String(config.neo4j.enabled),
    },
    qdrant: {
      host: config.qdrant.host,
      port: String(config.qdrant.port),
      enabled: String(config.qdrant.enabled),
    },
    ollama: {
      host: config.ollama.host,
      port: String(config.ollama.port),
      defaultLlm: config.ollama.defaultLlm,
      autoInit: String(config.ollama.autoInit),
    },
    xai: {
      apiUrl: config.xai.apiUrl,
      apiKey: mask(config.xai.apiKey),
      model: config.xai.model,
    },
    otel: {
      enabled: String(config.otel.enabled),
      serviceName: config.otel.serviceName,
    },
    featureFlags: {
      grokEnabled: String(config.featureFlags.grokEnabled),
      airflowEnabled: String(config.featureFlags.airflowEnabled),
      elasticsearchEnabled: String(config.featureFlags.elasticsearchEnabled),
    },
  };
}

export default config;
