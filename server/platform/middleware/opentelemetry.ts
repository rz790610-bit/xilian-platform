import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('opentelemetry');

/**
 * OpenTelemetry 分布式追踪 - 平台基础设施层
 * 
 * 基于 OTel SDK 实现自动插桩，为所有 HTTP/gRPC/Kafka/DB 调用
 * 生成 trace span，导出到 Jaeger（与现有 jaeger.client.ts 查询端对齐）。
 * 
 * 架构位置: server/platform/middleware/ (平台基础层)
 * 依赖: @opentelemetry/sdk-node, @opentelemetry/auto-instrumentations-node
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
    serviceName: process.env.OTEL_SERVICE_NAME || 'portai-nexus',
    traceExporterUrl: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318',
    samplingRatio: parseFloat(process.env.OTEL_SAMPLING_RATIO || '0.1'),
    autoInstrumentation: process.env.OTEL_AUTO_INSTRUMENT !== 'false',
  };
}

// ============================================================
// SDK 初始化
// ============================================================

let sdkInstance: any = null;
let tracerInstance: any = null;

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

  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const resources = await import('@opentelemetry/resources');
    const Resource = (resources as any).Resource ?? (resources as any).default?.Resource ?? resources.default;
    const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import('@opentelemetry/semantic-conventions');
    const { BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-node');

    // 构建资源描述
    const resource = new Resource({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '4.0.0',
      'deployment.environment': process.env.NODE_ENV || 'development',
    });

    // Trace 导出器
    const traceExporter = new OTLPTraceExporter({
      url: `${config.traceExporterUrl}/v1/traces`,
    });

    // 构建 SDK 配置
    const sdkConfig: any = {
      resource,
      spanProcessors: [new BatchSpanProcessor(traceExporter)],
    };

    // 自动插桩（可选，因为依赖较重）
    if (config.autoInstrumentation) {
      try {
        const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
        sdkConfig.instrumentations = [
          getNodeAutoInstrumentations({
            // 禁用 fs 插桩（太吵）
            '@opentelemetry/instrumentation-fs': { enabled: false },
            // 禁用 dns 插桩
            '@opentelemetry/instrumentation-dns': { enabled: false },
          }),
        ];
      } catch (err) {
        log.warn('Auto-instrumentation not available, using manual spans only:', (err as Error).message);
      }
    }

    sdkInstance = new NodeSDK(sdkConfig);
    sdkInstance.start();

    // 获取 tracer 实例
    const { trace } = await import('@opentelemetry/api');
    tracerInstance = trace.getTracer(config.serviceName, '4.0.0');

    log.info(`OpenTelemetry initialized (service=${config.serviceName}, endpoint=${config.traceExporterUrl}, sampling=${config.samplingRatio})`);
  } catch (err) {
    log.error('Failed to initialize OpenTelemetry:', String(err));
    log.warn('Continuing without distributed tracing');
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
      log.error('Error shutting down OTel SDK:', String(err));
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
    // OTel 未初始化，直接执行
    return fn(createNoopSpan());
  }

  const { SpanStatusCode } = await import('@opentelemetry/api');

  return tracerInstance.startActiveSpan(name, async (span: any) => {
    try {
      // 设置属性
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
