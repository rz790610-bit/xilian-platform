/**
 * 通用 WebSocket 网关
 * 
 * 支持多通道订阅，客户端可以订阅/取消订阅任意通道。
 * 替代为每个功能创建独立 WebSocket 服务的模式。
 * 
 * 使用 noServer 模式，避免与 Vite HMR WebSocket 冲突。
 * 
 * 通道类型：
 * - kafka-metrics: Kafka 集群指标（兼容现有 kafkaMetrics.ws.ts）
 * - anomaly-alerts: 实时异常告警
 * - device-status: 设备状态变更
 * - pipeline-progress: 管道执行进度
 * - sensor-data: 传感器实时数据流
 * - system-events: 系统事件通知
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';

// ============ 类型定义 ============

export type ChannelType =
  | 'kafka-metrics'
  | 'anomaly-alerts'
  | 'device-status'
  | 'pipeline-progress'
  | 'sensor-data'
  | 'system-events';

interface ClientState {
  ws: WebSocket;
  subscribedChannels: Set<ChannelType>;
  connectedAt: number;
  lastPingAt: number;
  metadata?: Record<string, unknown>;
}

interface GatewayMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'broadcast';
  channel?: ChannelType;
  channels?: ChannelType[];
  data?: unknown;
}

interface GatewayMetrics {
  totalConnections: number;
  activeConnections: number;
  channelSubscriptions: Record<string, number>;
  messagesSent: number;
  messagesReceived: number;
  uptime: number;
}

// ============ 通用 WebSocket 网关 ============

class WebSocketGateway {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ClientState> = new Map();
  private channelHandlers: Map<ChannelType, NodeJS.Timeout | null> = new Map();
  private startTime: number = Date.now();
  private messagesSent: number = 0;
  private messagesReceived: number = 0;

  /**
   * 初始化网关
   */
  init(server: Server, path: string = '/ws/gateway'): void {
    if (this.wss) {
      console.log('[WSGateway] Already initialized');
      return;
    }

    this.wss = new WebSocketServer({ noServer: true });
    console.log(`[WSGateway] Initialized at ${path}`);

    // 手动处理 upgrade 事件
    server.on('upgrade', (request, socket, head) => {
      const { pathname } = new URL(request.url || '/', `http://${request.headers.host}`);

      if (pathname === path) {
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wss!.emit('connection', ws, request);
        });
      }
      // 不匹配的路径不处理，让其他 handler（如 Vite HMR、kafkaMetrics.ws）处理
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    // 心跳检测（每 30 秒）
    setInterval(() => this.heartbeatCheck(), 30000);
  }

  /**
   * 处理新连接
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientState: ClientState = {
      ws,
      subscribedChannels: new Set(),
      connectedAt: Date.now(),
      lastPingAt: Date.now(),
      metadata: {
        remoteAddress: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      },
    };

    this.clients.set(ws, clientState);
    console.log(`[WSGateway] Client connected (total: ${this.clients.size})`);

    // 发送欢迎消息
    this.sendToClient(ws, {
      type: 'connected',
      availableChannels: [
        'kafka-metrics',
        'anomaly-alerts',
        'device-status',
        'pipeline-progress',
        'sensor-data',
        'system-events',
      ],
      timestamp: Date.now(),
    });

    ws.on('message', (data: Buffer) => {
      this.messagesReceived++;
      try {
        const message: GatewayMessage = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch {
        this.sendToClient(ws, { type: 'error', message: 'Invalid JSON' });
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      console.log(`[WSGateway] Client disconnected (total: ${this.clients.size})`);
    });

    ws.on('error', (error: Error) => {
      console.error('[WSGateway] Client error:', error.message);
      this.clients.delete(ws);
    });
  }

  /**
   * 处理客户端消息
   */
  private handleMessage(ws: WebSocket, message: GatewayMessage): void {
    const client = this.clients.get(ws);
    if (!client) return;

    switch (message.type) {
      case 'subscribe': {
        const channels = message.channels || (message.channel ? [message.channel] : []);
        for (const ch of channels) {
          client.subscribedChannels.add(ch);
        }
        this.sendToClient(ws, {
          type: 'subscribed',
          channels: Array.from(client.subscribedChannels),
        });
        break;
      }

      case 'unsubscribe': {
        const channels = message.channels || (message.channel ? [message.channel] : []);
        for (const ch of channels) {
          client.subscribedChannels.delete(ch);
        }
        this.sendToClient(ws, {
          type: 'unsubscribed',
          channels: Array.from(client.subscribedChannels),
        });
        break;
      }

      case 'ping': {
        client.lastPingAt = Date.now();
        this.sendToClient(ws, { type: 'pong', timestamp: Date.now() });
        break;
      }

      default:
        this.sendToClient(ws, { type: 'error', message: `Unknown message type: ${message.type}` });
    }
  }

  /**
   * 向指定通道广播消息
   */
  broadcast(channel: ChannelType, data: unknown): void {
    const message = JSON.stringify({
      type: 'data',
      channel,
      data,
      timestamp: Date.now(),
    });

    let sent = 0;
    for (const [ws, client] of Array.from(this.clients.entries())) {
      if (client.subscribedChannels.has(channel) && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        sent++;
      }
    }
    this.messagesSent += sent;
  }

  /**
   * 向单个客户端发送消息
   */
  private sendToClient(ws: WebSocket, data: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
      this.messagesSent++;
    }
  }

  /**
   * 心跳检测 — 清理超时连接
   */
  private heartbeatCheck(): void {
    const now = Date.now();
    const timeout = 120000; // 2 分钟无心跳断开

    for (const [ws, client] of Array.from(this.clients.entries())) {
      if (now - client.lastPingAt > timeout) {
        console.log('[WSGateway] Client timed out, disconnecting');
        ws.terminate();
        this.clients.delete(ws);
      }
    }
  }

  /**
   * 获取网关指标
   */
  getMetrics(): GatewayMetrics {
    const channelSubscriptions: Record<string, number> = {};
    for (const client of Array.from(this.clients.values())) {
      for (const ch of Array.from(client.subscribedChannels)) {
        channelSubscriptions[ch] = (channelSubscriptions[ch] || 0) + 1;
      }
    }

    return {
      totalConnections: this.clients.size,
      activeConnections: Array.from(this.clients.values()).filter(
        c => c.ws.readyState === WebSocket.OPEN
      ).length,
      channelSubscriptions,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * 获取指定通道的订阅者数量
   */
  getChannelSubscriberCount(channel: ChannelType): number {
    let count = 0;
    for (const client of Array.from(this.clients.values())) {
      if (client.subscribedChannels.has(channel)) count++;
    }
    return count;
  }

  /**
   * 关闭网关
   */
  close(): void {
    for (const [ws] of Array.from(this.clients.entries())) {
      ws.close();
    }
    this.clients.clear();

    for (const timer of Array.from(this.channelHandlers.values())) {
      if (timer) clearInterval(timer);
    }
    this.channelHandlers.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    console.log('[WSGateway] Gateway closed');
  }
}

// ============ 单例导出 ============

export const wsGateway = new WebSocketGateway();

/**
 * 初始化通用 WebSocket 网关
 * 在 server/core/index.ts 中调用
 */
export function initWebSocketGateway(server: Server): void {
  wsGateway.init(server, '/ws/gateway');
}
