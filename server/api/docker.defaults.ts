/**
 * ============================================================================
 * CR-05: Docker 服务默认配置
 * ============================================================================
 *
 * 所有服务地址统一从 config.ts 读取，不再直接引用 process.env。
 * config.ts 是环境变量的唯一入口（env() → process.env → 默认值）。
 *
 * 在 Docker Compose 网络中，服务名即主机名（如 portai-mysql → portai-mysql:3306）。
 * 部署时通过 .env 文件覆盖 config.ts 中的环境变量即可。
 *
 * ============================================================================
 */

import { config } from '../core/config';

/**
 * 核心服务配置
 * 全部从 config.ts 派生，保持单一配置源
 */
export const SERVICE_DEFAULTS = {
  mysql: {
    get host() { return config.mysql.host; },
    get port() { return config.mysql.port; },
    get user() { return config.mysql.user; },
    get password() { return config.mysql.password; },
    get database() { return config.mysql.database; },
    get url() { return config.mysql.url; },
  },
  redis: {
    get host() { return config.redis.host; },
    get port() { return config.redis.port; },
  },
  kafka: {
    get host() { return config.kafka.brokers[0]?.split(':')[0] || 'localhost'; },
    get port() { return parseInt(config.kafka.brokers[0]?.split(':')[1] || '9092', 10); },
    get brokers() { return config.kafka.brokers.join(','); },
  },
  clickhouse: {
    get host() { return config.clickhouse.host; },
    get port() { return config.clickhouse.port; },
    get user() { return config.clickhouse.user; },
    get password() { return config.clickhouse.password; },
    get database() { return config.clickhouse.database; },
    get url() { return config.clickhouse.url; },
    get pingUrl() { return `${config.clickhouse.url}/ping`; },
  },
  qdrant: {
    get host() { return config.qdrant.host; },
    get port() { return config.qdrant.port; },
    get healthUrl() { return `${config.qdrant.url}/collections`; },
  },
  minio: {
    get host() { return config.minio.endpoint; },
    get port() { return config.minio.port; },
    get accessKey() { return config.minio.accessKey; },
    get secretKey() { return config.minio.secretKey; },
    get endpoint() { return `http://${config.minio.endpoint}:${config.minio.port}`; },
    get healthUrl() { return `http://${config.minio.endpoint}:${config.minio.port}/minio/health/live`; },
  },
  ollama: {
    get host() { return config.ollama.host; },
    get port() { return config.ollama.port; },
    get healthUrl() { return `http://${this.host}:${this.port}/api/tags`; },
  },
  neo4j: {
    get host() { return config.neo4j.host; },
    get port() { return config.neo4j.port; },
    get user() { return config.neo4j.user; },
    get password() { return config.neo4j.password; },
    get uri() { return config.neo4j.url; },
  },
  prometheus: {
    get host() { return config.monitoring.prometheusHost; },
    get port() { return config.monitoring.prometheusPort; },
    get healthUrl() { return `http://${this.host}:${this.port}/-/ready`; },
  },
  grafana: {
    get host() { return config.monitoring.grafanaHost; },
    get port() { return config.monitoring.grafanaPort; },
    get url() { return `http://${this.host}:${this.port}`; },
    get healthUrl() { return `http://${this.host}:${this.port}/api/health`; },
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
