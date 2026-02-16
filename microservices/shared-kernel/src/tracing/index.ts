/**
 * @xilian/shared-kernel - OpenTelemetry 分布式追踪
 *
 * 为所有微服务提供统一的 OTel SDK 初始化和 Span 创建。
 * 映射: server/platform/middleware/opentelemetry.ts
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import {
  trace,
  context,
  SpanStatusCode,
  type Span,
  type Tracer,
  type SpanOptions,
} from '@opentelemetry/api';

let sdk: NodeSDK | null = null;
let _tracer: Tracer | null = null;

export interface TracingConfig {
  serviceName: string;
  serviceVersion?: string;
  endpoint?: string;       // OTLP HTTP endpoint
  enabled?: boolean;
  sampleRate?: number;     // 0.0 - 1.0
}

/**
 * 初始化 OpenTelemetry SDK
 * 必须在应用启动时最先调用（在任何 import 之前）
 */
export function initTracing(config: TracingConfig): void {
  if (!config.enabled && config.enabled !== undefined) return;

  const endpoint = config.endpoint
    ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ?? 'http://jaeger:4318/v1/traces';

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion ?? '1.0.0',
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
  });

  sdk.start();
  _tracer = trace.getTracer(config.serviceName, config.serviceVersion);
}

/**
 * 获取 Tracer 实例
 */
export function getTracer(): Tracer {
  if (!_tracer) {
    // 未初始化时返回 NoOp Tracer
    return trace.getTracer('noop');
  }
  return _tracer;
}

/**
 * 创建 Span 并执行异步操作
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions,
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, options ?? {}, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * 从当前上下文提取 traceId 和 spanId
 */
export function getTraceContext(): { traceId: string; spanId: string } | null {
  const span = trace.getActiveSpan();
  if (!span) return null;
  const ctx = span.spanContext();
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
  };
}

/**
 * 优雅关闭 OTel SDK
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
    _tracer = null;
  }
}

// 重新导出 OTel API 常用类型
export { trace, context, SpanStatusCode, type Span, type Tracer };
