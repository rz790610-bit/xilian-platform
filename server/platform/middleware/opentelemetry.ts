import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('opentelemetry');

/**
 * ============================================================================
 * OpenTelemetry 分布式追踪 — 平台基础设施层
 * ============================================================================
 *
 * 整改方案 v2.1 A-03: 修复 OTel 初始化
 *
 * 根因修复：
 *   1. @opentelemetry/api 未在 package.json 显式声明 → 已添加
 *   2. @opentelemetry/exporter-prometheus 未声明 → 已添加
 *   3. pino-opentelemetry-transport 未安装 → 已添加
 *   4. 初始化失败时无结构化日志 → 已修复
 *
 * 环境感知策略：
 *   - 开发环境（无 Jaeger）：OTel 静默降级，不报 error
 *   - 生产环境（有 Jaeger）：OTel 完整启用，失败报 error
 *
 * 架构位置: server/platform/middleware/ (平台基础层)
 * ============================================================================
 */

// ============================================================
// 配置
// ============================================================

export interface OTelConfig {
  /** 是否启用 OTel */
  enabled: boolean;
  /** 服务名称 */
  serviceName: string;
  /** OTLP 导出端点 */
  traceExporterUrl: string;
  /** 采样率 (0.0 ~ 1.0) */
  samplingRatio: number;
  /** 是否启用自动插桩 */
  autoInstrumentation: boolean;
}

function getConfig(): OTelConfig {
  return {
    enabled: process.env.OTEL_ENABLED !== 'false',
    serviceName: process.env.OTEL_SERVICE_NAME || 'xilian-platform',
    traceExporterUrl: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318',
    samplingRatio: parseFloat(process.env.OTEL_SAMPLING_RATIO || '0.1'),
    autoInstrumentation: process.env.OTEL_AUTO_INSTRUMENT !== 'false',
  };
}

/**
 * 检测 OTel 后端（Jaeger/OTel Collector）是否可达
 * 开发环境下如果后端不可达，静默降级而非报错
 */
async function isOTelBackendReachable(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // 尝试连接 OTLP endpoint 的健康检查
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timer);
    return response !== null;
  } catch {
    return false;
  }
}

// ============================================================
// SDK 初始化
// ============================================================

let sdkInstance: { shutdown(): Promise<void> } | null = null;
let tracerInstance: { startActiveSpan: Function } | null = null;

/**
 * 初始化 OpenTelemetry SDK
 * 必须在应用启动最早期调用（在 import express 之前最佳）
 */
export async function initOpenTelemetry(): Promise<void> {
  const config = getConfig();

  if (!config.enabled) {
    log.info('OpenTelemetry disabled (OTEL_ENABLED=false)');
    return;
  }

  const isDev = process.env.NODE_ENV === 'development';

  // 环境感知：开发环境下先检测后端是否可达
  if (isDev) {
    const reachable = await isOTelBackendReachable(config.traceExporterUrl);
    if (!reachable) {
      log.info(
        { endpoint: config.traceExporterUrl },
        'OTel backend not reachable in dev mode, skipping initialization (this is normal if Jaeger is not running)'
      );
      return;
    }
  }

  try {
    // 核心依赖导入
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { resourceFromAttributes } = await import('@opentelemetry/resources');
    const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import('@opentelemetry/semantic-conventions');
    const { BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-node');

    // 构建资源描述（@opentelemetry/resources v2.x 使用 resourceFromAttributes 替代 new Resource）
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '4.0.0',
      'deployment.environment': process.env.NODE_ENV || 'development',
    });

    // Trace 导出器
    const traceExporter = new OTLPTraceExporter({
      url: `${config.traceExporterUrl}/v1/traces`,
    });

    // Metrics 导出器 — 使用 Prometheus 拉取模式（/api/metrics 端点）
    let metricReader: any = undefined;
    try {
      const { PrometheusExporter } = await import('@opentelemetry/exporter-prometheus');
      const prometheusExporter = new PrometheusExporter({
        port: undefined,
        preventServerStart: true,
      });
      metricReader = prometheusExporter;
      log.info('OTel Metrics: Prometheus pull mode configured');
    } catch (promErr) {
      // 降级：尝试 OTLP push 模式
      try {
        const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http');
        const { PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics');
        const otlpCollectorUrl = process.env.OTEL_COLLECTOR_ENDPOINT || 'http://otel-collector:4318';
        const metricExporter = new OTLPMetricExporter({
          url: `${otlpCollectorUrl}/v1/metrics`,
        });
        metricReader = new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: 30000,
        });
        log.info({ endpoint: otlpCollectorUrl }, 'OTel Metrics: OTLP push mode configured');
      } catch (otlpErr) {
        log.warn(
          { promError: (promErr as Error).message, otlpError: (otlpErr as Error).message },
          'OTel Metrics exporters not available, metrics disabled'
        );
      }
    }

    // 采样策略
    let sampler: any = undefined;
    try {
      const traceModule = await import('@opentelemetry/sdk-trace-node');
      const ParentBasedSampler = (traceModule as any).ParentBasedSampler;
      const TraceIdRatioBasedSampler = (traceModule as any).TraceIdRatioBasedSampler;
      if (ParentBasedSampler && TraceIdRatioBasedSampler) {
        sampler = new ParentBasedSampler({
          root: new TraceIdRatioBasedSampler(config.samplingRatio),
        });
      }
    } catch {
      // 采样器配置失败，使用默认（AlwaysOn）
    }

    // 构建 SDK 配置
    const sdkConfig: any = {
      resource,
      spanProcessors: [new BatchSpanProcessor(traceExporter)],
      ...(metricReader ? { metricReader } : {}),
      ...(sampler ? { sampler } : {}),
    };

    // 自动插桩（可选，因为依赖较重）
    if (config.autoInstrumentation) {
      try {
        const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
        sdkConfig.instrumentations = [
          getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-fs': { enabled: false },
            '@opentelemetry/instrumentation-dns': { enabled: false },
            '@opentelemetry/instrumentation-http': {
              ignoreIncomingPaths: ['/healthz', '/healthz/ready', '/api/metrics'],
            },
            '@opentelemetry/instrumentation-express': { enabled: true },
            '@opentelemetry/instrumentation-mysql2': { enabled: true },
            '@opentelemetry/instrumentation-redis-4': { enabled: true },
          }),
        ];
        log.info('OTel auto-instrumentation enabled');
      } catch (err) {
        log.warn(
          { error: (err as Error).message },
          'Auto-instrumentation not available, using manual spans only'
        );
      }
    }

    sdkInstance = new NodeSDK(sdkConfig);
    sdkInstance.start();

    // 获取 tracer 实例
    const { trace } = await import('@opentelemetry/api');
    tracerInstance = trace.getTracer(config.serviceName, '4.0.0');

    log.info({
      serviceName: config.serviceName,
      endpoint: config.traceExporterUrl,
      samplingRatio: config.samplingRatio,
      metrics: metricReader ? 'enabled' : 'disabled',
      autoInstrumentation: config.autoInstrumentation,
    }, 'OpenTelemetry initialized successfully');

  } catch (err) {
    if (isDev) {
      // 开发环境：降级为 warn，不阻塞启动
      log.warn(
        { error: String(err) },
        'OpenTelemetry initialization failed in dev mode, continuing without tracing'
      );
    } else {
      // 生产环境：报 error（但仍不阻塞启动）
      log.warn(
        { error: String(err) },
        'OpenTelemetry initialization failed in production — distributed tracing unavailable'
      );
    }
  }
}

/**
 * 关闭 OTel SDK（在优雅关闭时调用）
 */
export async function shutdownOpenTelemetry(): Promise<void> {
  if (sdkInstance) {
    try {
      await sdkInstance.shutdown();
      log.info('OpenTelemetry SDK shutdown');
    } catch (err) {
      log.warn({ err }, 'Error shutting down OTel SDK');
    }
  }
}

// ============================================================
// 手动追踪 API
// ============================================================

/**
 * 获取 tracer 实例
 */
export function getTracer() {
  return tracerInstance;
}

/**
 * 创建一个追踪 span 包装异步函数
 *
 * @example
 * const result = await withSpan('algorithm.execute', { algorithm: 'fft' }, async (span) => {
 *   span.setAttribute('input.size', data.length);
 *   return await executeAlgorithm(data);
 * });
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: any) => Promise<T>,
): Promise<T> {
  if (!tracerInstance) {
    return fn(createNoopSpan());
  }

  const { SpanStatusCode } = await import('@opentelemetry/api');

  return tracerInstance.startActiveSpan(name, async (span: any) => {
    try {
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value);
      }
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * 创建无操作 span（OTel 未启用时使用）
 */
function createNoopSpan() {
  return {
    setAttribute: () => {},
    setStatus: () => {},
    recordException: () => {},
    end: () => {},
    addEvent: () => {},
  };
}

/**
 * 追踪 tRPC 调用的中间件工厂
 */
export function createTrpcTracingMiddleware() {
  return async function tracingMiddleware({ path, type, next }: any) {
    if (!tracerInstance) return next();

    return withSpan(`trpc.${type}`, {
      'rpc.system': 'trpc',
      'rpc.method': path,
      'rpc.type': type,
    }, async (span) => {
      const result = await next();
      if (!result.ok) {
        span.setAttribute('error', true);
      }
      return result;
    });
  };
}

/**
 * 追踪 Kafka 消息处理
 */
export async function traceKafkaMessage<T>(
  topic: string,
  partition: number,
  fn: (span: any) => Promise<T>,
): Promise<T> {
  return withSpan('kafka.consume', {
    'messaging.system': 'kafka',
    'messaging.destination': topic,
    'messaging.kafka.partition': partition,
    'messaging.operation': 'process',
  }, fn);
}

/**
 * 追踪数据库查询
 */
export async function traceDbQuery<T>(
  operation: string,
  table: string,
  fn: (span: any) => Promise<T>,
): Promise<T> {
  return withSpan(`db.${operation}`, {
    'db.system': 'mysql',
    'db.operation': operation,
    'db.sql.table': table,
  }, fn);
}

/**
 * 追踪算法执行
 */
export async function traceAlgorithm<T>(
  algorithmName: string,
  inputSize: number,
  fn: (span: any) => Promise<T>,
): Promise<T> {
  return withSpan(`algorithm.${algorithmName}`, {
    'algorithm.name': algorithmName,
    'algorithm.input_size': inputSize,
  }, fn);
}

/**
 * 追踪 Redis 操作
 */
export async function traceRedis<T>(
  operation: string,
  key: string,
  fn: (span: any) => Promise<T>,
): Promise<T> {
  return withSpan(`redis.${operation}`, {
    'db.system': 'redis',
    'db.operation': operation,
    'db.redis.key': key,
  }, fn);
}

/**
 * 追踪外部 HTTP 调用
 */
export async function traceHttpCall<T>(
  method: string,
  url: string,
  fn: (span: any) => Promise<T>,
): Promise<T> {
  return withSpan(`http.client.${method}`, {
    'http.method': method,
    'http.url': url,
  }, fn);
}

/**
 * 追踪管道执行
 */
export async function tracePipeline<T>(
  pipelineName: string,
  stageCount: number,
  fn: (span: any) => Promise<T>,
): Promise<T> {
  return withSpan(`pipeline.${pipelineName}`, {
    'pipeline.name': pipelineName,
    'pipeline.stage_count': stageCount,
  }, fn);
}

/**
 * 追踪 Kafka 生产者发送
 */
export async function traceKafkaProduce<T>(
  topic: string,
  fn: (span: any) => Promise<T>,
): Promise<T> {
  return withSpan('kafka.produce', {
    'messaging.system': 'kafka',
    'messaging.destination': topic,
    'messaging.operation': 'publish',
  }, fn);
}

/**
 * 追踪 ClickHouse 查询
 */
export async function traceClickHouseQuery<T>(
  operation: string,
  table: string,
  fn: (span: any) => Promise<T>,
): Promise<T> {
  return withSpan(`clickhouse.${operation}`, {
    'db.system': 'clickhouse',
    'db.operation': operation,
    'db.sql.table': table,
  }, fn);
}
