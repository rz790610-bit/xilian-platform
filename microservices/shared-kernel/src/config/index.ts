/**
 * @xilian/shared-kernel - 统一配置管理
 *
 * 为所有微服务提供标准化的配置加载、验证和热更新能力。
 * 映射: server/core/config.ts + server/platform/services/configCenter.ts
 */
import { z, type ZodSchema } from 'zod';

// ============================================================
// 基础配置 Schema（所有微服务共享）
// ============================================================

export const BaseConfigSchema = z.object({
  // 服务标识
  serviceName: z.string(),
  serviceVersion: z.string().default('1.0.0'),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  nodeEnv: z.string().default('development'),
  port: z.number().int().min(1).max(65535).default(3000),
  grpcPort: z.number().int().min(1).max(65535).default(50051),

  // 日志
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  logFormat: z.enum(['json', 'pretty']).default('json'),

  // 数据库（MySQL — 映射 config.mysql）
  mysql: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(3306),
    database: z.string().default('portai_nexus'),
    user: z.string().default('root'),
    password: z.string().default(''),
    connectionLimit: z.number().default(20),
    ssl: z.boolean().default(false),
  }).optional(),

  // MySQL 读副本（映射 config.mysqlReplica）
  mysqlReplica: z.object({
    host: z.string(),
    port: z.number().default(3306),
    database: z.string().default('portai_nexus'),
    user: z.string().default('root'),
    password: z.string().default(''),
    connectionLimit: z.number().default(10),
  }).optional(),

  // Redis（映射 config.redis）
  redis: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(6379),
    password: z.string().optional(),
    db: z.number().default(0),
    maxRetries: z.number().default(3),
  }).optional(),

  // Kafka（映射 config.kafka）
  kafka: z.object({
    brokers: z.array(z.string()).default(['localhost:9092']),
    clientId: z.string().optional(),
    groupId: z.string().optional(),
    ssl: z.boolean().default(false),
    sasl: z.object({
      mechanism: z.enum(['plain', 'scram-sha-256', 'scram-sha-512']),
      username: z.string(),
      password: z.string(),
    }).optional(),
  }).optional(),

  // ClickHouse（映射 config.clickhouse）
  clickhouse: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(8123),
    database: z.string().default('xilian'),
    user: z.string().default('default'),
    password: z.string().default(''),
  }).optional(),

  // Qdrant（映射 config.qdrant）
  qdrant: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(6333),
    apiKey: z.string().optional(),
  }).optional(),

  // Neo4j（映射 config.neo4j）
  neo4j: z.object({
    uri: z.string().default('bolt://localhost:7687'),
    user: z.string().default('neo4j'),
    password: z.string().default(''),
  }).optional(),

  // MinIO/S3（映射 config.minio）
  minio: z.object({
    endpoint: z.string().default('localhost'),
    port: z.number().default(9000),
    accessKey: z.string().default(''),
    secretKey: z.string().default(''),
    bucket: z.string().default('xilian'),
    useSSL: z.boolean().default(false),
  }).optional(),

  // Ollama（映射 config.ollama）
  ollama: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(11434),
    model: z.string().default('llama3'),
  }).optional(),

  // MQTT（映射 config.mqtt）
  mqtt: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(1883),
    username: z.string().optional(),
    password: z.string().optional(),
    clientId: z.string().optional(),
  }).optional(),

  // Jaeger（映射 config.jaeger）
  jaeger: z.object({
    endpoint: z.string().default('http://localhost:14268/api/traces'),
    agentHost: z.string().default('localhost'),
    agentPort: z.number().default(6831),
  }).optional(),

  // Prometheus
  prometheus: z.object({
    enabled: z.boolean().default(true),
    port: z.number().default(9090),
    path: z.string().default('/metrics'),
  }).optional(),

  // Elasticsearch
  elasticsearch: z.object({
    node: z.string().default('http://localhost:9200'),
    auth: z.object({
      username: z.string(),
      password: z.string(),
    }).optional(),
  }).optional(),

  // 安全
  jwtSecret: z.string().min(32).optional(),
  corsOrigins: z.array(z.string()).default(['*']),

  // 服务发现
  serviceRegistry: z.object({
    type: z.enum(['static', 'consul', 'kubernetes']).default('static'),
    endpoints: z.record(z.string()).optional(),
  }).optional(),
});

export type BaseConfig = z.infer<typeof BaseConfigSchema>;

// ============================================================
// 配置加载器
// ============================================================

export class ConfigLoader<T extends Record<string, unknown> = BaseConfig> {
  private config: T | null = null;
  private watchers: Array<(config: T) => void> = [];

  constructor(
    private schema: ZodSchema<T>,
    private serviceName: string,
  ) {}

  /**
   * 从环境变量加载配置
   */
  load(overrides?: Partial<T>): T {
    const env = process.env;
    const raw: Record<string, unknown> = {
      serviceName: this.serviceName,
      serviceVersion: env.SERVICE_VERSION ?? '1.0.0',
      environment: env.NODE_ENV ?? 'development',
      nodeEnv: env.NODE_ENV ?? 'development',
      port: parseInt(env.PORT ?? '3000', 10),
      grpcPort: parseInt(env.GRPC_PORT ?? '50051', 10),
      logLevel: env.LOG_LEVEL ?? 'info',
      logFormat: env.LOG_FORMAT ?? 'json',
    };

    // MySQL
    if (env.DATABASE_URL || env.MYSQL_HOST) {
      raw.mysql = this.parseMysqlConfig(env);
    }

    // Redis
    if (env.REDIS_URL || env.REDIS_HOST) {
      raw.redis = this.parseRedisConfig(env);
    }

    // Kafka
    if (env.KAFKA_BROKERS) {
      raw.kafka = {
        brokers: env.KAFKA_BROKERS.split(','),
        clientId: env.KAFKA_CLIENT_ID ?? this.serviceName,
        groupId: env.KAFKA_GROUP_ID ?? `${this.serviceName}-group`,
      };
    }

    // ClickHouse
    if (env.CLICKHOUSE_URL || env.CLICKHOUSE_HOST) {
      raw.clickhouse = {
        host: env.CLICKHOUSE_HOST ?? 'localhost',
        port: parseInt(env.CLICKHOUSE_PORT ?? '8123', 10),
        database: env.CLICKHOUSE_DATABASE ?? 'xilian',
        user: env.CLICKHOUSE_USER ?? 'default',
        password: env.CLICKHOUSE_PASSWORD ?? '',
      };
    }

    // Qdrant
    if (env.QDRANT_URL || env.QDRANT_HOST) {
      raw.qdrant = {
        host: env.QDRANT_HOST ?? 'localhost',
        port: parseInt(env.QDRANT_PORT ?? '6333', 10),
        apiKey: env.QDRANT_API_KEY,
      };
    }

    // Neo4j
    if (env.NEO4J_URL || env.NEO4J_URI) {
      raw.neo4j = {
        uri: env.NEO4J_URI ?? env.NEO4J_URL ?? 'bolt://localhost:7687',
        user: env.NEO4J_USER ?? 'neo4j',
        password: env.NEO4J_PASSWORD ?? '',
      };
    }

    // MinIO
    if (env.MINIO_ENDPOINT || env.S3_ENDPOINT) {
      raw.minio = {
        endpoint: env.MINIO_ENDPOINT ?? env.S3_ENDPOINT ?? 'localhost',
        port: parseInt(env.MINIO_PORT ?? '9000', 10),
        accessKey: env.MINIO_ACCESS_KEY ?? env.AWS_ACCESS_KEY_ID ?? '',
        secretKey: env.MINIO_SECRET_KEY ?? env.AWS_SECRET_ACCESS_KEY ?? '',
        bucket: env.MINIO_BUCKET ?? 'xilian',
        useSSL: env.MINIO_USE_SSL === 'true',
      };
    }

    // Ollama
    if (env.OLLAMA_HOST) {
      raw.ollama = {
        host: env.OLLAMA_HOST,
        port: parseInt(env.OLLAMA_PORT ?? '11434', 10),
        model: env.OLLAMA_MODEL ?? 'llama3',
      };
    }

    // MQTT
    if (env.MQTT_HOST) {
      raw.mqtt = {
        host: env.MQTT_HOST,
        port: parseInt(env.MQTT_PORT ?? '1883', 10),
        username: env.MQTT_USERNAME,
        password: env.MQTT_PASSWORD,
        clientId: env.MQTT_CLIENT_ID ?? `${this.serviceName}-mqtt`,
      };
    }

    // Jaeger
    if (env.JAEGER_ENDPOINT || env.OTEL_EXPORTER_OTLP_ENDPOINT) {
      raw.jaeger = {
        endpoint: env.JAEGER_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:14268/api/traces',
        agentHost: env.JAEGER_AGENT_HOST ?? 'localhost',
        agentPort: parseInt(env.JAEGER_AGENT_PORT ?? '6831', 10),
      };
    }

    // JWT
    if (env.JWT_SECRET) {
      raw.jwtSecret = env.JWT_SECRET;
    }

    // CORS
    if (env.CORS_ORIGINS) {
      raw.corsOrigins = env.CORS_ORIGINS.split(',');
    }

    // 合并覆盖
    const merged = { ...raw, ...overrides };
    this.config = this.schema.parse(merged);
    return this.config;
  }

  /**
   * 获取当前配置（必须先调用 load）
   */
  get(): T {
    if (!this.config) {
      throw new Error(`Config not loaded. Call load() first for service: ${this.serviceName}`);
    }
    return this.config;
  }

  /**
   * 热更新配置
   */
  update(partial: Partial<T>): T {
    const current = this.get();
    const merged = { ...current, ...partial };
    this.config = this.schema.parse(merged);
    this.watchers.forEach((fn) => fn(this.config!));
    return this.config;
  }

  /**
   * 监听配置变更
   */
  onChange(callback: (config: T) => void): () => void {
    this.watchers.push(callback);
    return () => {
      this.watchers = this.watchers.filter((fn) => fn !== callback);
    };
  }

  private parseMysqlConfig(env: NodeJS.ProcessEnv) {
    if (env.DATABASE_URL) {
      const url = new URL(env.DATABASE_URL);
      return {
        host: url.hostname,
        port: parseInt(url.port || '3306', 10),
        database: url.pathname.slice(1),
        user: url.username,
        password: url.password,
        connectionLimit: parseInt(env.MYSQL_POOL_SIZE ?? '20', 10),
        ssl: env.MYSQL_SSL === 'true',
      };
    }
    return {
      host: env.MYSQL_HOST ?? 'localhost',
      port: parseInt(env.MYSQL_PORT ?? '3306', 10),
      database: env.MYSQL_DATABASE ?? 'portai_nexus',
      user: env.MYSQL_USER ?? 'root',
      password: env.MYSQL_PASSWORD ?? '',
      connectionLimit: parseInt(env.MYSQL_POOL_SIZE ?? '20', 10),
      ssl: env.MYSQL_SSL === 'true',
    };
  }

  private parseRedisConfig(env: NodeJS.ProcessEnv) {
    if (env.REDIS_URL) {
      const url = new URL(env.REDIS_URL);
      return {
        host: url.hostname,
        port: parseInt(url.port || '6379', 10),
        password: url.password || undefined,
        db: parseInt(env.REDIS_DB ?? '0', 10),
        maxRetries: parseInt(env.REDIS_MAX_RETRIES ?? '3', 10),
      };
    }
    return {
      host: env.REDIS_HOST ?? 'localhost',
      port: parseInt(env.REDIS_PORT ?? '6379', 10),
      password: env.REDIS_PASSWORD,
      db: parseInt(env.REDIS_DB ?? '0', 10),
      maxRetries: parseInt(env.REDIS_MAX_RETRIES ?? '3', 10),
    };
  }
}

/**
 * 创建服务配置加载器的便捷方法
 */
export function createConfigLoader(serviceName: string): ConfigLoader<BaseConfig> {
  return new ConfigLoader(BaseConfigSchema, serviceName);
}
