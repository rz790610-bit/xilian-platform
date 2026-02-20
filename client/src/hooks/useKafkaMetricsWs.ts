/**
 * Kafka 指标 WebSocket Hook
 * 提供实时 Kafka 指标数据订阅
 */

import { useState, useEffect, useCallback, useRef } from "react";

// 指标数据结构
export interface KafkaMetrics {
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

// 历史数据结构
export interface MetricsHistory {
  timestamps: number[];
  throughput: number[];
  latency: number[];
}

// WebSocket 消息类型
interface WsMessage {
  type: "init" | "metrics" | "pong";
  data?: KafkaMetrics;
  history?: MetricsHistory;
  timestamp?: number;
}

// Hook 返回类型
interface UseKafkaMetricsWsResult {
  metrics: KafkaMetrics | null;
  history: MetricsHistory;
  isConnected: boolean;
  error: string | null;
  reconnect: () => void;
}

// 获取 WebSocket URL
function getWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}/ws/kafka-metrics`;
}

export function useKafkaMetricsWs(): UseKafkaMetricsWsResult {
  const [metrics, setMetrics] = useState<KafkaMetrics | null>(null);
  const [history, setHistory] = useState<MetricsHistory>({
    timestamps: [],
    throughput: [],
    latency: [],
  });
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000;

  // 连接 WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const wsUrl = getWsUrl();
      console.log("[KafkaMetricsWS] Connecting to:", wsUrl);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[KafkaMetricsWS] Connected");
        setIsConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: WsMessage = JSON.parse(event.data);
          
          if (message.type === "init" && message.history) {
            setHistory(message.history);
          } else if (message.type === "metrics") {
            if (message.data) {
              setMetrics(message.data);
            }
            if (message.history) {
              setHistory(message.history);
            }
          }
        } catch (e) {
          console.error("[KafkaMetricsWS] Failed to parse message:", e);
        }
      };

      ws.onclose = (event) => {
        console.log("[KafkaMetricsWS] Disconnected:", event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;

        // 自动重连
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts.current);
          console.log(`[KafkaMetricsWS] Reconnecting in ${delay}ms...`);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else {
          setError("无法连接到实时数据服务，请刷新页面重试");
        }
      };

      ws.onerror = (event) => {
        console.error("[KafkaMetricsWS] Error:", event);
        setError("WebSocket 连接错误");
      };
    } catch (e) {
      console.error("[KafkaMetricsWS] Failed to connect:", e);
      setError("无法建立 WebSocket 连接");
    }
  }, []);

  // 断开连接
  // [P2-H1 修复] disconnect 时重置 reconnectAttempts，避免手动 reconnect 后只能再尝试剩余次数
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    reconnectAttempts.current = 0; // 重置重连计数器
    setIsConnected(false);
  }, []);

  // 重新连接
  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    disconnect();
    connect();
  }, [connect, disconnect]);

  // 组件挂载时连接，卸载时断开
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // 发送心跳
  useEffect(() => {
    if (!isConnected) return;

    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);

    return () => clearInterval(pingInterval);
  }, [isConnected]);

  return {
    metrics,
    history,
    isConnected,
    error,
    reconnect,
  };
}
