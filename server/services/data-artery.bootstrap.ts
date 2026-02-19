/**
 * 数据动脉启动编排器
 * ============================================================
 * 
 * 统一管理全链路服务的启动和关闭：
 * 
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  边缘网关 → MQTT/HTTP/WS/gRPC                          │
 *   │       ↓                                                 │
 *   │  [GatewayKafkaBridge]  → Kafka(telemetry.raw.*)        │
 *   │       ↓                                                 │
 *   │  [FeatureExtraction]   → Kafka(telemetry.feature.*)    │
 *   │       ↓                                                 │
 *   │  [TelemetryClickHouseSink] → ClickHouse                │
 *   │       ↓                                                 │
 *   │  物化视图自动聚合 → 1min/1hour/daily 聚合表             │
 *   └─────────────────────────────────────────────────────────┘
 * 
 * 启动顺序（下游先启动）：
 *   1. TelemetryClickHouseSink — 确保 ClickHouse 写入就绪
 *   2. FeatureExtractionService — 确保特征提取就绪
 *   3. GatewayKafkaBridge — 最后启动数据入口
 * 
 * 关闭顺序（上游先关闭）：
 *   3. GatewayKafkaBridge — 停止接收新数据
 *   2. FeatureExtractionService — 处理完剩余消息
 *   1. TelemetryClickHouseSink — 刷写完剩余缓冲
 */

import { createModuleLogger } from '../core/logger';

const log = createModuleLogger('data-artery');

// ============================================================
// 工具函数
// ============================================================

/**
 * 轮询等待条件满足（用于优雅关闭时等待缓冲区清空）
 * @param check 检查函数，返回 true 表示条件已满足
 * @param timeoutMs 最大等待时间
 * @param intervalMs 轮询间隔
 */
async function waitForDrain(
  check: () => Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 200
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  log.warn(`[DataArtery] waitForDrain 超时 (${timeoutMs}ms)，继续关闭流程`);
}

// ============================================================
// 全链路健康状态
// ============================================================

interface ArteryHealth {
  healthy: boolean;
  uptime: number;
  services: {
    clickhouseSink: { running: boolean; healthy: boolean; throughput: number };
    featureExtraction: { running: boolean; healthy: boolean; throughput: number };
    gatewayBridge: { running: boolean; healthy: boolean; activeGateways: number };
  };
  pipeline: {
    /** 全链路是否畅通 */
    endToEnd: boolean;
    /** 各段延迟 */
    latencies: {
      gatewayToKafka: number;
      kafkaToFeature: number;
      featureToClickhouse: number;
    };
  };
}

// ============================================================
// 启动编排
// ============================================================

let arteryStartedAt = 0;

/**
 * 启动数据动脉全链路
 * 在应用启动时调用（server.listen 之后）
 */
export async function startDataArtery(): Promise<void> {
  log.info('[DataArtery] ═══════════════════════════════════════');
  log.info('[DataArtery] 启动数据动脉全链路...');
  log.info('[DataArtery] ═══════════════════════════════════════');

  arteryStartedAt = Date.now();

  // ---- 第 1 层：ClickHouse Sink（下游先就绪）----
  try {
    const { startTelemetrySink } = await import('./telemetryClickhouseSink.service');
    await startTelemetrySink();
    log.info('[DataArtery] ✓ Layer 1: Kafka→ClickHouse Sink 已启动');
  } catch (error) {
    log.error('[DataArtery] ✗ Layer 1: ClickHouse Sink 启动失败:', error);
    log.warn('[DataArtery] 数据动脉降级运行：遥测数据将不会写入 ClickHouse');
  }

  // ---- 第 2 层：特征提取服务 ----
  try {
    const { startFeatureExtraction } = await import('./feature-extraction');
    await startFeatureExtraction();
    log.info('[DataArtery] ✓ Layer 2: 特征提取服务已启动');
  } catch (error) {
    log.error('[DataArtery] ✗ Layer 2: 特征提取服务启动失败:', error);
    log.warn('[DataArtery] 数据动脉降级运行：原始数据将直接写入 ClickHouse（无特征提取）');
  }

  // ---- 第 3 层：网关→Kafka 桥接（上游最后启动）----
  try {
    const { startGatewayBridge } = await import('./gateway-kafka-bridge.service');
    await startGatewayBridge();
    log.info('[DataArtery] ✓ Layer 3: 网关→Kafka 桥接已启动');
  } catch (error) {
    log.error('[DataArtery] ✗ Layer 3: 网关桥接启动失败:', error);
    log.warn('[DataArtery] 数据动脉降级运行：网关数据需通过其他方式接入');
  }

  log.info('[DataArtery] ═══════════════════════════════════════');
  log.info('[DataArtery] 数据动脉启动完成');
  log.info('[DataArtery] ═══════════════════════════════════════');

  // ---- 第 4 层：连接器定时健康巡检 ----
  try {
    const { startConnectorHealthCheck } = await import('../jobs/connectorHealthCheck.job');
    startConnectorHealthCheck(60_000); // 每 60 秒巡检一次
    log.info('[DataArtery] ✓ Layer 4: 连接器健康巡检已启动 (60s 间隔)');
  } catch (error) {
    log.error('[DataArtery] ✗ Layer 4: 连接器健康巡检启动失败:', error);
    log.warn('[DataArtery] 数据动脉降级运行：连接器状态将不会自动更新');
  }
}

/**
 * 关闭数据动脉全链路
 * 在应用关闭时调用（优雅关闭）
 */
export async function stopDataArtery(): Promise<void> {
  log.info('[DataArtery] 正在关闭数据动脉...');

  // 先停止连接器巡检
  try {
    const { stopConnectorHealthCheck } = await import('../jobs/connectorHealthCheck.job');
    stopConnectorHealthCheck();
    log.info('[DataArtery] ✓ Layer 4: 连接器健康巡检已停止');
  } catch { /* 服务未加载 */ }

  // 上游先关闭
  try {
    const { stopGatewayBridge } = await import('./gateway-kafka-bridge.service');
    await stopGatewayBridge();
    log.info('[DataArtery] ✓ Layer 3: 网关桥接已关闭');
  } catch (error) {
    log.error('[DataArtery] ✗ Layer 3 关闭失败:', error);
  }

  // 轮询等待特征提取服务缓冲区清空（最多 5 秒）
  await waitForDrain(async () => {
    try {
      const { featureExtractionService } = await import('./feature-extraction');
      const metrics = featureExtractionService.getMetrics();
      return (metrics as any).bufferSize === 0 || !featureExtractionService.isActive();
    } catch { return true; }
  }, 5000, 200);

  try {
    const { stopFeatureExtraction } = await import('./feature-extraction');
    await stopFeatureExtraction();
    log.info('[DataArtery] ✓ Layer 2: 特征提取服务已关闭');
  } catch (error) {
    log.error('[DataArtery] ✗ Layer 2 关闭失败:', error);
  }

  // 轮询等待 Sink 缓冲区刷写完毕（最多 5 秒）
  await waitForDrain(async () => {
    try {
      const { telemetryClickHouseSink } = await import('./telemetryClickhouseSink.service');
      const metrics = telemetryClickHouseSink.getMetrics();
      return metrics.bufferSize === 0;
    } catch { return true; }
  }, 5000, 200);

  try {
    const { stopTelemetrySink } = await import('./telemetryClickhouseSink.service');
    await stopTelemetrySink();
    log.info('[DataArtery] ✓ Layer 1: ClickHouse Sink 已关闭');
  } catch (error) {
    log.error('[DataArtery] ✗ Layer 1 关闭失败:', error);
  }

  const uptime = Math.round((Date.now() - arteryStartedAt) / 1000);
  log.info(`[DataArtery] 数据动脉已关闭（运行 ${uptime}s）`);
}

/**
 * 获取数据动脉全链路健康状态
 */
export async function getDataArteryHealth(): Promise<ArteryHealth> {
  const health: ArteryHealth = {
    healthy: false,
    uptime: arteryStartedAt > 0 ? Math.round((Date.now() - arteryStartedAt) / 1000) : 0,
    services: {
      clickhouseSink: { running: false, healthy: false, throughput: 0 },
      featureExtraction: { running: false, healthy: false, throughput: 0 },
      gatewayBridge: { running: false, healthy: false, activeGateways: 0 },
    },
    pipeline: {
      endToEnd: false,
      latencies: {
        gatewayToKafka: 0,
        kafkaToFeature: 0,
        featureToClickhouse: 0,
      },
    },
  };

  try {
    // ClickHouse Sink
    const { telemetryClickHouseSink } = await import('./telemetryClickhouseSink.service');
    const sinkHealth = await telemetryClickHouseSink.healthCheck();
    const sinkMetrics = telemetryClickHouseSink.getMetrics();
    health.services.clickhouseSink = {
      running: sinkHealth.details.running,
      healthy: sinkHealth.healthy,
      throughput: sinkMetrics.throughput,
    };
    health.pipeline.latencies.featureToClickhouse = sinkMetrics.avgWriteLatencyMs;
  } catch { /* 服务未加载 */ }

  try {
    // 特征提取
    const { featureExtractionService } = await import('./feature-extraction');
    const feHealth = await featureExtractionService.healthCheck();
    const feMetrics = featureExtractionService.getMetrics();
    health.services.featureExtraction = {
      running: feHealth.details.running,
      healthy: feHealth.healthy,
      throughput: feMetrics.throughput,
    };
  } catch { /* 服务未加载 */ }

  try {
    // 网关桥接
    const { gatewayKafkaBridge } = await import('./gateway-kafka-bridge.service');
    const gwHealth = await gatewayKafkaBridge.healthCheck();
    const gwMetrics = gatewayKafkaBridge.getMetrics();
    health.services.gatewayBridge = {
      running: gwHealth.details.running,
      healthy: gwHealth.healthy,
      activeGateways: gwHealth.details.activeGateways,
    };
    health.pipeline.latencies.gatewayToKafka = 0; // 从 metrics 中获取
  } catch { /* 服务未加载 */ }

  // 全链路健康判定
  health.pipeline.endToEnd =
    health.services.clickhouseSink.running &&
    health.services.featureExtraction.running &&
    health.services.gatewayBridge.running;

  health.healthy =
    health.services.clickhouseSink.healthy &&
    health.services.featureExtraction.healthy &&
    health.services.gatewayBridge.healthy;

  return health;
}

export default { startDataArtery, stopDataArtery, getDataArteryHealth };
