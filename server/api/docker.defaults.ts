/**
 * ============================================================================
 * CR-05: Docker 服务默认配置
 * ============================================================================
 *
 * 将 docker.router.ts 中的 31 处 localhost 硬编码迁移为可配置常量。
 * 所有服务地址通过环境变量覆盖，默认值为 localhost（本地开发场景）。
 *
 * 在 Docker Compose 网络中，服务名即主机名（如 portai-mysql → portai-mysql:3306）。
 * 部署时通过 .env 文件覆盖这些默认值即可。
 *
 * ============================================================================
 */

/** 从环境变量读取，默认 localhost（本地开发） */
const DEFAULT_HOST = process.env.DOCKER_SERVICE_HOST || 'localhost';

/**
 * 核心服务配置
 * 每个服务的 host/port 均可通过环境变量独立覆盖
 */
export const SERVICE_DEFAULTS = {
  mysql: {
    host: process.env.MYSQL_HOST || DEFAULT_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'portai',
    password: process.env.MYSQL_PASSWORD || 'portai123',
    database: process.env.MYSQL_DATABASE || 'portai_nexus',
    get url() {
      return `mysql://${this.user}:${this.password}@${this.host}:${this.port}/${this.database}`;
    },
  },
  redis: {
    host: process.env.REDIS_HOST || DEFAULT_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  kafka: {
    host: process.env.KAFKA_HOST || DEFAULT_HOST,
    port: parseInt(process.env.KAFKA_PORT || '9092', 10),
    get brokers() {
      return `${this.host}:${this.port}`;
    },
  },
  clickhouse: {
    host: process.env.CLICKHOUSE_HOST || DEFAULT_HOST,
    port: parseInt(process.env.CLICKHOUSE_PORT || '8123', 10),
    user: process.env.CLICKHOUSE_USER || 'portai',
    password: process.env.CLICKHOUSE_PASSWORD || 'portai123',
    database: process.env.CLICKHOUSE_DATABASE || 'portai_timeseries',
    get url() {
      return `http://${this.host}:${this.port}`;
    },
    get pingUrl() {
      return `http://${this.host}:${this.port}/ping`;
    },
  },
  qdrant: {
    host: process.env.QDRANT_HOST || DEFAULT_HOST,
    port: parseInt(process.env.QDRANT_PORT || '6333', 10),
    get healthUrl() {
      return `http://${this.host}:${this.port}/collections`;
    },
  },
  minio: {
    host: process.env.MINIO_HOST || DEFAULT_HOST,
    port: parseInt(process.env.MINIO_PORT || '9010', 10),
    accessKey: process.env.MINIO_ACCESS_KEY || 'portai',
    secretKey: process.env.MINIO_SECRET_KEY || 'portai123456',
    get endpoint() {
      return `http://${this.host}:${this.port}`;
    },
    get healthUrl() {
      return `http://${this.host}:${this.port}/minio/health/live`;
    },
  },
  ollama: {
    host: process.env.OLLAMA_HOST || DEFAULT_HOST,
    port: parseInt(process.env.OLLAMA_PORT || '11434', 10),
    get healthUrl() {
      return `http://${this.host}:${this.port}/api/tags`;
    },
  },
  neo4j: {
    host: process.env.NEO4J_HOST || DEFAULT_HOST,
    port: parseInt(process.env.NEO4J_PORT || '7687', 10),
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'portai123',
    get uri() {
      return `bolt://${this.host}:${this.port}`;
    },
  },
  prometheus: {
    host: process.env.PROMETHEUS_HOST || DEFAULT_HOST,
    port: parseInt(process.env.PROMETHEUS_PORT || '9090', 10),
    get healthUrl() {
      return `http://${this.host}:${this.port}/-/ready`;
    },
  },
  grafana: {
    host: process.env.GRAFANA_HOST || DEFAULT_HOST,
    port: parseInt(process.env.GRAFANA_PORT || '3001', 10),
    get url() {
      return `http://${this.host}:${this.port}`;
    },
    get healthUrl() {
      return `http://${this.host}:${this.port}/api/health`;
    },
  },
} as const;

/**
 * 本地端口映射表（用于快速检测服务是否已运行）
 * 从 SERVICE_DEFAULTS 自动生成
 */
export const LOCAL_PORT_MAP: Record<string, { type: 'tcp' | 'http'; host: string; port: number; url?: string }> = {
  'portai-mysql':      { type: 'tcp',  host: SERVICE_DEFAULTS.mysql.host, port: SERVICE_DEFAULTS.mysql.port },
  'portai-redis':      { type: 'tcp',  host: SERVICE_DEFAULTS.redis.host, port: SERVICE_DEFAULTS.redis.port },
  'portai-kafka':      { type: 'tcp',  host: SERVICE_DEFAULTS.kafka.host, port: SERVICE_DEFAULTS.kafka.port },
  'portai-clickhouse': { type: 'http', host: SERVICE_DEFAULTS.clickhouse.host, port: SERVICE_DEFAULTS.clickhouse.port, url: SERVICE_DEFAULTS.clickhouse.pingUrl },
  'portai-qdrant':     { type: 'http', host: SERVICE_DEFAULTS.qdrant.host, port: SERVICE_DEFAULTS.qdrant.port, url: SERVICE_DEFAULTS.qdrant.healthUrl },
  'portai-minio':      { type: 'http', host: SERVICE_DEFAULTS.minio.host, port: SERVICE_DEFAULTS.minio.port, url: SERVICE_DEFAULTS.minio.healthUrl },
  'portai-ollama':     { type: 'http', host: SERVICE_DEFAULTS.ollama.host, port: SERVICE_DEFAULTS.ollama.port, url: SERVICE_DEFAULTS.ollama.healthUrl },
  'portai-neo4j':      { type: 'tcp',  host: SERVICE_DEFAULTS.neo4j.host, port: SERVICE_DEFAULTS.neo4j.port },
  'portai-prometheus':  { type: 'http', host: SERVICE_DEFAULTS.prometheus.host, port: SERVICE_DEFAULTS.prometheus.port, url: SERVICE_DEFAULTS.prometheus.healthUrl },
  'portai-grafana':    { type: 'http', host: SERVICE_DEFAULTS.grafana.host, port: SERVICE_DEFAULTS.grafana.port, url: SERVICE_DEFAULTS.grafana.healthUrl },
};
