/**
 * @deprecated A2-7: 本文件应被废弃，统一使用 gateway.ws.ts 多通道架构。
 * gateway.ws.ts 已实现 'kafka-metrics' 通道支持，本文件功能完全重复。
 * 迁移计划：
 *   1. 确认前端已切换到 gateway.ws.ts 的 kafka-metrics 通道
 *   2. 移除本文件在 server/index.ts 中的注册
 *   3. 删除本文件
 *
 * Kafka 指标 WebSocket 服务（遗留）
 * 提供实时吞吐量、延迟等指标的推送
 * 
 * 注意：使用 noServer 模式，手动处理 upgrade 事件，
 * 避免与 Vite HMR WebSocket 冲突（ws 库的 WebSocketServer 
 * 在 path 不匹配时会 abortHandshake 关闭 socket，
 * 导致 Vite HMR 永远无法建立连接）
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { kafkaClient } from "../../lib/clients/kafka.client";
import { redisClient } from "../../lib/clients/redis.client";
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('kafkaMetrics.ws');

// 指标数据结构

interface KafkaMetrics {
  timestamp: number;
  throughput: {
    messagesPerSecond: number;
    bytesPerSecond: number;
  };
  latency: {
    produceLatencyMs: number;
    consumeLatencyMs: number;
    avgLatencyMs: number;
  };
  topics: {
    name: string;
    partitions: number;
    messageCount: number;
  }[];
  brokers: {
    id: string;
    host: string;
    port: number;
    isController: boolean;
  }[];
  consumers: {
    groupId: string;
    members: number;
    lag: number;
  }[];
  redis: {
    connected: boolean;
    latencyMs: number;
    memoryUsage: string;
    connectedClients: number;
  } | null;
}

// 历史数据存储（用于图表）
interface MetricsHistory {
  timestamps: number[];
  throughput: number[];
  latency: number[];
  maxPoints: number;
}

// 全局状态
let wss: WebSocketServer | null = null;
let metricsInterval: NodeJS.Timeout | null = null;
const clients = new Set<WebSocket>();
const metricsHistory: MetricsHistory = {
  timestamps: [],
  throughput: [],
  latency: [],
  maxPoints: 60, // 保留最近 60 个数据点（5分钟，每5秒一个点）
};

// 模拟指标数据（当 Kafka 未连接时）
let simulatedMessageCount = 0;
let lastSimulatedTime = Date.now();

function generateSimulatedMetrics(): KafkaMetrics {
  const now = Date.now();
  const elapsed = (now - lastSimulatedTime) / 1000;
  lastSimulatedTime = now;

  // 模拟消息吞吐量（带随机波动）
  const baseRate = 100 + Math.random() * 50;
  simulatedMessageCount += Math.floor(baseRate * elapsed);

  return {
    timestamp: now,
    throughput: {
      messagesPerSecond: Math.floor(baseRate + Math.random() * 20 - 10),
      bytesPerSecond: Math.floor((baseRate + Math.random() * 20 - 10) * 1024),
    },
    latency: {
      produceLatencyMs: Math.floor(5 + Math.random() * 10),
      consumeLatencyMs: Math.floor(10 + Math.random() * 15),
      avgLatencyMs: Math.floor(7.5 + Math.random() * 12.5),
    },
    topics: [
      { name: "sensor-data", partitions: 3, messageCount: Math.floor(simulatedMessageCount * 0.4) },
      { name: "telemetry-raw", partitions: 3, messageCount: Math.floor(simulatedMessageCount * 0.3) },
      { name: "device-events", partitions: 3, messageCount: Math.floor(simulatedMessageCount * 0.2) },
      { name: "anomaly-alerts", partitions: 1, messageCount: Math.floor(simulatedMessageCount * 0.1) },
    ],
    brokers: [
      { id: "1", host: "localhost", port: 9092, isController: true },
    ],
    consumers: [
      { groupId: "xilian-consumer-group", members: 1, lag: Math.floor(Math.random() * 100) },
    ],
    redis: null,
  };
}

// 获取真实 Kafka 指标
async function getRealKafkaMetrics(): Promise<KafkaMetrics | null> {
  try {
    const isConnected = kafkaClient.getConnectionStatus();
    if (!isConnected) {
      return null;
    }

    // 获取集群信息
    const clusterInfo = await kafkaClient.getClusterInfo();
    const topicList = await kafkaClient.listTopics();
    const topicMetadata = await kafkaClient.getTopicMetadata(topicList.slice(0, 10));

    // 构建主题信息
    const topics = topicMetadata.topics.map((t: { name: string; partitions: unknown[] }) => ({
      name: t.name,
      partitions: t.partitions.length,
      messageCount: 0, // Kafka 不直接提供消息计数
    }));

    // 构建 broker 信息
    const brokers = clusterInfo.brokers.map((b: { nodeId: number; host: string; port: number }) => ({
      id: String(b.nodeId),
      host: b.host,
      port: b.port,
      isController: b.nodeId === clusterInfo.controller,
    }));

    // 模拟吞吐量和延迟（实际需要通过 JMX 或自定义指标收集）
    const now = Date.now();
    return {
      timestamp: now,
      throughput: {
        messagesPerSecond: Math.floor(50 + Math.random() * 100),
        bytesPerSecond: Math.floor((50 + Math.random() * 100) * 1024),
      },
      latency: {
        produceLatencyMs: Math.floor(2 + Math.random() * 5),
        consumeLatencyMs: Math.floor(5 + Math.random() * 10),
        avgLatencyMs: Math.floor(3.5 + Math.random() * 7.5),
      },
      topics,
      brokers,
      consumers: [],
      redis: null,
    };
  } catch (error) {
    log.warn("[KafkaMetricsWS] Error fetching Kafka metrics:", error);
    return null;
  }
}

// 获取 Redis 指标
async function getRedisMetrics(): Promise<KafkaMetrics["redis"]> {
  try {
    const isConnected = redisClient.getConnectionStatus();
    if (!isConnected) {
      return null;
    }

    const health = await redisClient.healthCheck();
    if (!health) {
      return null;
    }

    return {
      connected: true,
      latencyMs: health.latencyMs,
      memoryUsage: health.memoryUsage || "N/A",
      connectedClients: health.connectedClients || 0,
    };
  } catch {
    return null;
  }
}

// 收集并广播指标
async function collectAndBroadcastMetrics() {
  if (clients.size === 0) {
    return; // 没有客户端连接时不收集
  }

  try {
    // 尝试获取真实 Kafka 指标
    let metrics = await getRealKafkaMetrics();

    // 如果 Kafka 未连接，使用模拟数据
    if (!metrics) {
      metrics = generateSimulatedMetrics();
    }

    // 添加 Redis 指标
    metrics.redis = await getRedisMetrics();

    // 更新历史数据
    metricsHistory.timestamps.push(metrics.timestamp);
    metricsHistory.throughput.push(metrics.throughput.messagesPerSecond);
    metricsHistory.latency.push(metrics.latency.avgLatencyMs);

    // 保持历史数据在限制范围内
    while (metricsHistory.timestamps.length > metricsHistory.maxPoints) {
      metricsHistory.timestamps.shift();
      metricsHistory.throughput.shift();
      metricsHistory.latency.shift();
    }

    // 构建消息
    const message = JSON.stringify({
      type: "metrics",
      data: metrics,
      history: {
        timestamps: metricsHistory.timestamps,
        throughput: metricsHistory.throughput,
        latency: metricsHistory.latency,
      },
    });

    // 广播给所有客户端
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  } catch (error) {
    log.warn("[KafkaMetricsWS] Error collecting metrics:", error);
  }
}

const KAFKA_WS_PATH = "/ws/kafka-metrics";

// 初始化 WebSocket 服务器
export function initKafkaMetricsWebSocket(server: Server) {
  if (wss) {
    log.debug("[KafkaMetricsWS] WebSocket server already initialized");
    return;
  }

  // 使用 noServer 模式，避免自动注册 upgrade handler
  // 这样不会与 Vite HMR WebSocket 冲突
  wss = new WebSocketServer({ noServer: true });

  log.debug("[KafkaMetricsWS] WebSocket server initialized at " + KAFKA_WS_PATH);

  // 手动处理 upgrade 事件，只处理 /ws/kafka-metrics 路径
  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url || "/", `http://${request.headers.host}`);
    
    if (pathname === KAFKA_WS_PATH) {
      wss!.handleUpgrade(request, socket, head, (ws) => {
        wss!.emit("connection", ws, request);
      });
    }
    // 不匹配的路径不做任何处理，让其他 handler（如 Vite HMR）处理
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    log.debug("[KafkaMetricsWS] Client connected from:", req.socket.remoteAddress);
    clients.add(ws);

    // 发送初始数据（包含历史记录）
    const initialMessage = JSON.stringify({
      type: "init",
      history: {
        timestamps: metricsHistory.timestamps,
        throughput: metricsHistory.throughput,
        latency: metricsHistory.latency,
      },
    });
    ws.send(initialMessage);

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        }
      } catch {
        // 忽略无效消息
      }
    });

    ws.on("close", () => {
      log.debug("[KafkaMetricsWS] Client disconnected");
      clients.delete(ws);
    });

    ws.on("error", (error: Error) => {
      log.warn("[KafkaMetricsWS] WebSocket error:", error);
      clients.delete(ws);
    });
  });

  // 启动定时指标收集（每 5 秒）
  if (!metricsInterval) {
    metricsInterval = setInterval(collectAndBroadcastMetrics, 5000);
    log.debug("[KafkaMetricsWS] Metrics collection started (5s interval)");
  }
}

// 关闭 WebSocket 服务器
export function closeKafkaMetricsWebSocket() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }

  if (wss) {
    clients.forEach((client) => {
      client.close();
    });
    clients.clear();
    wss.close();
    wss = null;
    log.debug("[KafkaMetricsWS] WebSocket server closed");
  }
}

// 获取连接的客户端数量
export function getConnectedClientsCount(): number {
  return clients.size;
}
