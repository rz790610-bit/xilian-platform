/**
 * PortAI Nexus — 统一配置中心
 * 所有外部服务地址、端口、凭证的唯一来源
 * 
 * 使用方式：
 *   import { config } from '../core/config';
 *   const mysqlUrl = config.mysql.url;
 *   const kafkaBrokers = config.kafka.brokers;
 * 
 * 环境变量优先级：
 *   环境变量 > .env 文件 > 默认值
 */

function env(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function envInt(key: string, defaultValue: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : defaultValue;
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
// 配置结构
// ============================================

export const config = {
  /** 应用基础配置 */
  app: {
    name: env('APP_NAME', 'PortAI Nexus'),
    version: env('APP_VERSION', '4.0.0'),
    env: env('NODE_ENV', 'development') as 'development' | 'production' | 'test',
    port: envInt('PORT', 3000),
    host: env('HOST', '0.0.0.0'),
    logLevel: env('LOG_LEVEL', 'info') as 'trace' | 'debug' | 'info' | 'warn' | 'error',
    baseUrl: env('BASE_URL', 'http://localhost:3000'),
  },

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
  },

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
  },

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
  },

  /** Kafka 消息队列 */
  kafka: {
    brokers: envList('KAFKA_BROKERS', ['localhost:9092']),
    clientId: env('KAFKA_CLIENT_ID', 'portai-nexus'),
    groupId: env('KAFKA_GROUP_ID', 'portai-nexus-group'),
    ssl: envBool('KAFKA_SSL', false),
    saslMechanism: env('KAFKA_SASL_MECHANISM', '') as '' | 'plain' | 'scram-sha-256' | 'scram-sha-512',
    saslUsername: env('KAFKA_SASL_USERNAME', ''),
    saslPassword: env('KAFKA_SASL_PASSWORD', ''),
  },

  /** MinIO / S3 对象存储 */
  minio: {
    endpoint: env('MINIO_ENDPOINT', 'localhost'),
    port: envInt('MINIO_PORT', 9000),
    accessKey: env('MINIO_ACCESS_KEY', 'minioadmin'),
    secretKey: env('MINIO_SECRET_KEY', 'minioadmin'),
    bucket: env('MINIO_BUCKET', 'portai-nexus'),
    useSSL: envBool('MINIO_USE_SSL', false),
    region: env('MINIO_REGION', 'us-east-1'),
  },

  /** Neo4j 图数据库 */
  neo4j: {
    host: env('NEO4J_HOST', 'localhost'),
    port: envInt('NEO4J_PORT', 7687),
    user: env('NEO4J_USER', 'neo4j'),
    password: env('NEO4J_PASSWORD', 'neo4j'),
    get url(): string {
      return env('NEO4J_URL', `bolt://${config.neo4j.host}:${config.neo4j.port}`);
    },
    database: env('NEO4J_DATABASE', 'neo4j'),
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

  /** Qdrant 向量数据库 */
  qdrant: {
    host: env('QDRANT_HOST', 'localhost'),
    port: envInt('QDRANT_PORT', 6333),
    get url(): string {
      return env('QDRANT_URL', `http://${config.qdrant.host}:${config.qdrant.port}`);
    },
    apiKey: env('QDRANT_API_KEY', ''),
  },

  /** NebulaGraph 图数据库 */
  nebula: {
    host: env('NEBULA_HOST', 'localhost'),
    port: envInt('NEBULA_PORT', 9669),
    get url(): string {
      return env('NEBULA_URL', `http://${config.nebula.host}:${config.nebula.port}`);
    },
    user: env('NEBULA_USER', 'root'),
    password: env('NEBULA_PASSWORD', 'nebula'),
    space: env('NEBULA_SPACE', 'portai_nexus'),
  },

  /** Elasticsearch 搜索引擎 */
  elasticsearch: {
    host: env('ELASTICSEARCH_HOST', 'localhost'),
    port: envInt('ELASTICSEARCH_PORT', 9200),
    get url(): string {
      return env('ELASTICSEARCH_URL', `http://${config.elasticsearch.host}:${config.elasticsearch.port}`);
    },
    user: env('ELASTICSEARCH_USER', ''),
    password: env('ELASTICSEARCH_PASSWORD', ''),
    ssl: envBool('ELASTICSEARCH_SSL', false),
  },

  /** Docker 引擎 */
  docker: {
    socketPath: env('DOCKER_SOCKET_PATH', '/var/run/docker.sock'),
    host: env('DOCKER_HOST', ''),
    tlsCert: env('DOCKER_TLS_CERT', ''),
    tlsKey: env('DOCKER_TLS_KEY', ''),
    tlsCa: env('DOCKER_TLS_CA', ''),
  },

  /** MQTT Broker */
  mqtt: {
    host: env('MQTT_HOST', 'localhost'),
    port: envInt('MQTT_PORT', 1883),
    get url(): string {
      const protocol = config.mqtt.ssl ? 'mqtts' : 'mqtt';
      return env('MQTT_URL', `${protocol}://${config.mqtt.host}:${config.mqtt.port}`);
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

  /** 安全配置 */
  security: {
    jwtSecret: env('JWT_SECRET', 'change-me-in-production'),
    jwtExpiresIn: env('JWT_EXPIRES_IN', '24h'),
    bcryptRounds: envInt('BCRYPT_ROUNDS', 12),
    corsOrigins: envList('CORS_ORIGINS', ['*']),
    rateLimitWindowMs: envInt('RATE_LIMIT_WINDOW_MS', 60000),
    rateLimitMax: envInt('RATE_LIMIT_MAX', 100),
  },

  /** 外部 API */
  externalApis: {
    openaiApiKey: env('OPENAI_API_KEY', ''),
    openaiBaseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
    /** Forge LLM API（原 env.ts 中的 forgeApiUrl/forgeApiKey，现统一到 config） */
    forgeApiUrl: env('BUILT_IN_FORGE_API_URL', ''),
    forgeApiKey: env('BUILT_IN_FORGE_API_KEY', ''),
    webhookUrl: env('WEBHOOK_URL', ''),
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
      // P2 修复：CORS 通配符从 warning 提升为 error（生产安全隐患）
      errors.push('CORS_ORIGINS is set to wildcard (*) in production — this is a security risk');
    }
  }

  // 数据库连接检查
  if (!config.mysql.host) {
    warnings.push('MYSQL_HOST is not configured');
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
    },
    redis: {
      host: config.redis.host,
      port: String(config.redis.port),
      password: mask(config.redis.password),
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
    },
  };
}

export default config;
