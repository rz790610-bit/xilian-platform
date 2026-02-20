/**
 * ============================================================================
 * Grok API 配置
 * ============================================================================
 *
 * 集中管理 Grok/xAI API 的连接配置、模型参数、限流策略
 * 通过环境变量注入，支持动态配置热更新
 */

// ============================================================================
// 环境变量读取
// ============================================================================

export interface GrokApiConfig {
  /** xAI API 基础 URL */
  baseUrl: string;
  /** API Key */
  apiKey: string;
  /** 默认模型 */
  defaultModel: string;
  /** 推理模型（复杂任务） */
  reasoningModel: string;
  /** 最大并发请求数 */
  maxConcurrency: number;
  /** 单次请求超时（毫秒） */
  requestTimeoutMs: number;
  /** 重试次数 */
  maxRetries: number;
  /** 重试间隔基数（毫秒，指数退避） */
  retryBaseDelayMs: number;
  /** 每分钟请求限制 */
  rateLimitPerMinute: number;
  /** 每分钟 Token 限制 */
  tokenLimitPerMinute: number;
  /** 默认 temperature */
  defaultTemperature: number;
  /** 默认 max_tokens */
  defaultMaxTokens: number;
  /** 是否启用 Tool Calling */
  enableToolCalling: boolean;
  /** 是否启用推理链持久化 */
  enableReasoningPersistence: boolean;
  /** 是否启用 ReAct 循环 */
  enableReactLoop: boolean;
  /** ReAct 最大循环次数 */
  reactMaxIterations: number;
  /** 是否启用结构化输出 */
  enableStructuredOutput: boolean;
}

/**
 * 从环境变量加载 Grok API 配置
 * 支持 process.env 和 DynamicConfig 双重来源
 */
export function loadGrokApiConfig(): GrokApiConfig {
  return {
    baseUrl: process.env.GROK_API_BASE_URL || 'https://api.x.ai/v1',
    apiKey: process.env.GROK_API_KEY || '',
    defaultModel: process.env.GROK_DEFAULT_MODEL || 'grok-3',
    reasoningModel: process.env.GROK_REASONING_MODEL || 'grok-3-mini',
    maxConcurrency: parseInt(process.env.GROK_MAX_CONCURRENCY || '5', 10),
    requestTimeoutMs: parseInt(process.env.GROK_REQUEST_TIMEOUT_MS || '60000', 10),
    maxRetries: parseInt(process.env.GROK_MAX_RETRIES || '3', 10),
    retryBaseDelayMs: parseInt(process.env.GROK_RETRY_BASE_DELAY_MS || '1000', 10),
    rateLimitPerMinute: parseInt(process.env.GROK_RATE_LIMIT_PER_MINUTE || '60', 10),
    tokenLimitPerMinute: parseInt(process.env.GROK_TOKEN_LIMIT_PER_MINUTE || '100000', 10),
    defaultTemperature: parseFloat(process.env.GROK_DEFAULT_TEMPERATURE || '0.3'),
    defaultMaxTokens: parseInt(process.env.GROK_DEFAULT_MAX_TOKENS || '4096', 10),
    enableToolCalling: process.env.GROK_ENABLE_TOOL_CALLING !== 'false',
    enableReasoningPersistence: process.env.GROK_ENABLE_REASONING_PERSISTENCE !== 'false',
    enableReactLoop: process.env.GROK_ENABLE_REACT_LOOP !== 'false',
    reactMaxIterations: parseInt(process.env.GROK_REACT_MAX_ITERATIONS || '10', 10),
    enableStructuredOutput: process.env.GROK_ENABLE_STRUCTURED_OUTPUT !== 'false',
  };
}

/**
 * 验证 Grok API 配置完整性
 */
export function validateGrokApiConfig(config: GrokApiConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.apiKey) {
    errors.push('GROK_API_KEY 未配置 — Grok 推理服务将不可用');
  }

  if (!config.baseUrl) {
    errors.push('GROK_API_BASE_URL 未配置');
  }

  if (config.maxConcurrency < 1 || config.maxConcurrency > 50) {
    errors.push(`GROK_MAX_CONCURRENCY 值 ${config.maxConcurrency} 超出合理范围 [1, 50]`);
  }

  if (config.requestTimeoutMs < 5000) {
    errors.push(`GROK_REQUEST_TIMEOUT_MS 值 ${config.requestTimeoutMs}ms 过短，建议 >= 5000ms`);
  }

  if (config.reactMaxIterations < 1 || config.reactMaxIterations > 50) {
    errors.push(`GROK_REACT_MAX_ITERATIONS 值 ${config.reactMaxIterations} 超出合理范围 [1, 50]`);
  }

  if (config.defaultTemperature < 0 || config.defaultTemperature > 2) {
    errors.push(`GROK_DEFAULT_TEMPERATURE 值 ${config.defaultTemperature} 超出范围 [0, 2]`);
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// .env 模板生成
// ============================================================================

/**
 * 生成 .env 模板内容（含注释说明）
 */
export function generateEnvTemplate(): string {
  return `
# ============================================================================
# Grok / xAI API 配置
# ============================================================================

# [必填] xAI API Key — 从 https://console.x.ai 获取
GROK_API_KEY=

# [可选] API 基础 URL（默认: https://api.x.ai/v1）
# GROK_API_BASE_URL=https://api.x.ai/v1

# [可选] 默认模型（默认: grok-3）
# GROK_DEFAULT_MODEL=grok-3

# [可选] 推理模型（复杂任务，默认: grok-3-mini）
# GROK_REASONING_MODEL=grok-3-mini

# [可选] 最大并发请求数（默认: 5）
# GROK_MAX_CONCURRENCY=5

# [可选] 单次请求超时毫秒（默认: 60000）
# GROK_REQUEST_TIMEOUT_MS=60000

# [可选] 最大重试次数（默认: 3）
# GROK_MAX_RETRIES=3

# [可选] 每分钟请求限制（默认: 60）
# GROK_RATE_LIMIT_PER_MINUTE=60

# [可选] 每分钟 Token 限制（默认: 100000）
# GROK_TOKEN_LIMIT_PER_MINUTE=100000

# [可选] 默认 temperature（默认: 0.3，工业场景建议低温）
# GROK_DEFAULT_TEMPERATURE=0.3

# [可选] 默认 max_tokens（默认: 4096）
# GROK_DEFAULT_MAX_TOKENS=4096

# [可选] 是否启用 Tool Calling（默认: true）
# GROK_ENABLE_TOOL_CALLING=true

# [可选] 是否启用推理链持久化（默认: true）
# GROK_ENABLE_REASONING_PERSISTENCE=true

# [可选] 是否启用 ReAct 循环（默认: true）
# GROK_ENABLE_REACT_LOOP=true

# [可选] ReAct 最大循环次数（默认: 10）
# GROK_REACT_MAX_ITERATIONS=10

# [可选] 是否启用结构化输出（默认: true）
# GROK_ENABLE_STRUCTURED_OUTPUT=true

# ============================================================================
# ClickHouse 配置（可选，用于时序数据存储和物化视图）
# ============================================================================

# CLICKHOUSE_HOST=localhost
# CLICKHOUSE_PORT=8123
# CLICKHOUSE_DATABASE=xilian
# CLICKHOUSE_USER=default
# CLICKHOUSE_PASSWORD=

# ============================================================================
# MinIO 配置（可选，用于原始数据归档和模型制品存储）
# ============================================================================

# MINIO_ENDPOINT=localhost
# MINIO_PORT=9000
# MINIO_ACCESS_KEY=minioadmin
# MINIO_SECRET_KEY=minioadmin
# MINIO_BUCKET_RAW=xilian-raw
# MINIO_BUCKET_MODELS=xilian-models
`.trim();
}
