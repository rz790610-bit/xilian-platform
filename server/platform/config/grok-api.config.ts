/**
 * ============================================================================
 * Grok API 配置
 * ============================================================================
 *
 * 集中管理 Grok/xAI API 的连接配置、模型参数、限流策略
 * 配置来源：统一从 config.ts 读取，不直接引用 process.env
 */

import { config } from '../../core/config';

// ============================================================================
// 类型定义
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

// ============================================================================
// 配置加载
// ============================================================================

/**
 * 从统一配置中心加载 Grok API 配置
 */
export function loadGrokApiConfig(): GrokApiConfig {
  return {
    baseUrl: config.grokApi.baseUrl,
    apiKey: config.grokApi.apiKey,
    defaultModel: config.grokApi.defaultModel,
    reasoningModel: config.grokApi.reasoningModel,
    maxConcurrency: config.grokApi.maxConcurrency,
    requestTimeoutMs: config.grokApi.requestTimeoutMs,
    maxRetries: config.grokApi.maxRetries,
    retryBaseDelayMs: config.grokApi.retryBaseDelayMs,
    rateLimitPerMinute: config.grokApi.rateLimitPerMinute,
    tokenLimitPerMinute: config.grokApi.tokenLimitPerMinute,
    defaultTemperature: config.grokApi.defaultTemperature,
    defaultMaxTokens: config.grokApi.defaultMaxTokens,
    enableToolCalling: config.grokApi.enableToolCalling,
    enableReasoningPersistence: config.grokApi.enableReasoningPersistence,
    enableReactLoop: config.grokApi.enableReactLoop,
    reactMaxIterations: config.grokApi.reactMaxIterations,
    enableStructuredOutput: config.grokApi.enableStructuredOutput,
  };
}

// ============================================================================
// 配置验证
// ============================================================================

/**
 * 验证 Grok API 配置完整性
 */
export function validateGrokApiConfig(grokConfig: GrokApiConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!grokConfig.apiKey) {
    errors.push('GROK_API_KEY 未配置 — Grok 推理服务将不可用');
  }

  if (!grokConfig.baseUrl) {
    errors.push('GROK_API_BASE_URL 未配置');
  }

  if (grokConfig.maxConcurrency < 1 || grokConfig.maxConcurrency > 50) {
    errors.push(`GROK_MAX_CONCURRENCY 值 ${grokConfig.maxConcurrency} 超出合理范围 [1, 50]`);
  }

  if (grokConfig.requestTimeoutMs < 5000) {
    errors.push(`GROK_REQUEST_TIMEOUT_MS 值 ${grokConfig.requestTimeoutMs}ms 过短，建议 >= 5000ms`);
  }

  if (grokConfig.reactMaxIterations < 1 || grokConfig.reactMaxIterations > 50) {
    errors.push(`GROK_REACT_MAX_ITERATIONS 值 ${grokConfig.reactMaxIterations} 超出合理范围 [1, 50]`);
  }

  if (grokConfig.defaultTemperature < 0 || grokConfig.defaultTemperature > 2) {
    errors.push(`GROK_DEFAULT_TEMPERATURE 值 ${grokConfig.defaultTemperature} 超出范围 [0, 2]`);
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

# [可选] 推理模型（复杂任务，默认: grok-3-reasoning）
# GROK_REASONING_MODEL=grok-3-reasoning

# [可选] 最大并发请求数（默认: 10）
# GROK_MAX_CONCURRENCY=10

# [可选] 单次请求超时毫秒（默认: 30000）
# GROK_REQUEST_TIMEOUT_MS=30000

# [可选] 最大重试次数（默认: 3）
# GROK_MAX_RETRIES=3

# [可选] 每分钟请求限制（默认: 60）
# GROK_RATE_LIMIT_PER_MINUTE=60

# [可选] 每分钟 Token 限制（默认: 100000）
# GROK_TOKEN_LIMIT_PER_MINUTE=100000

# [可选] 默认 temperature（默认: 0.7）
# GROK_DEFAULT_TEMPERATURE=0.7

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
# CLICKHOUSE_DATABASE=portai_timeseries
# CLICKHOUSE_USER=default
# CLICKHOUSE_PASSWORD=

# ============================================================================
# MinIO 配置（可选，用于原始数据归档和模型制品存储）
# ============================================================================

# MINIO_ENDPOINT=localhost
# MINIO_PORT=9000
# MINIO_ACCESS_KEY=minioadmin
# MINIO_SECRET_KEY=minioadmin
# MINIO_BUCKET_RAW=portai-raw
# MINIO_BUCKET_MODELS=portai-models
`.trim();
}
