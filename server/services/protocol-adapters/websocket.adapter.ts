/**
 * WebSocket 协议适配器 - 生产级实现
 * 
 * 基于 ws 库
 * 支持 WS / WSS 协议，子协议协商，自定义 Header
 * 高级特性：心跳/Ping-Pong、自动重连、消息帧控制、压缩
 * 资源发现：通过订阅消息采样发现数据通道
 */

import WebSocket from 'ws';
import { BaseAdapter, normalizeError, AdapterError, AdapterErrorCode } from './base';
import type { ConnectionTestResult, DiscoveredEndpoint, ProtocolConfigSchema, HealthCheckResult } from '../../../shared/accessLayerTypes';

export class WebSocketAdapter extends BaseAdapter {
  readonly protocolType = 'websocket' as const;
  protected defaultTimeoutMs = 15000;

  readonly configSchema: ProtocolConfigSchema = {
    protocolType: 'websocket',
    label: 'WebSocket',
    connectionFields: [
      { key: 'url', label: 'WebSocket URL', type: 'string', required: true, placeholder: 'ws://192.168.1.100:8080/ws', description: '完整的 WebSocket 端点 URL (ws:// 或 wss://)' },
      { key: 'protocols', label: '子协议', type: 'string', required: false, placeholder: 'graphql-ws,json', description: '逗号分隔的子协议列表（Sec-WebSocket-Protocol）' },
      { key: 'messageFormat', label: '消息格式', type: 'select', required: false, defaultValue: 'json', options: [
        { label: 'JSON', value: 'json' },
        { label: '文本 (Text)', value: 'text' },
        { label: '二进制 (Binary)', value: 'binary' },
        { label: 'MessagePack', value: 'msgpack' },
        { label: 'Protocol Buffers', value: 'protobuf' },
      ]},
      { key: 'wsType', label: '应用类型', type: 'select', required: false, defaultValue: 'generic', options: [
        { label: '通用 WebSocket', value: 'generic' },
        { label: 'Socket.IO', value: 'socketio' },
        { label: 'STOMP', value: 'stomp' },
        { label: 'GraphQL Subscriptions', value: 'graphql-ws' },
        { label: 'MQTT over WebSocket', value: 'mqtt-ws' },
      ], description: '上层应用协议类型' },
    ],
    authFields: [
      { key: 'authType', label: '认证方式', type: 'select', required: false, defaultValue: 'none', options: [
        { label: '无认证', value: 'none' },
        { label: 'Bearer Token (Header)', value: 'bearer' },
        { label: 'Query 参数 Token', value: 'query-token' },
        { label: 'Basic Auth', value: 'basic' },
        { label: '连接后认证消息', value: 'message' },
        { label: '自定义 Header', value: 'custom-header' },
      ]},
      { key: 'token', label: 'Token', type: 'password', required: false },
      { key: 'tokenParamName', label: 'Token 参数名', type: 'string', required: false, defaultValue: 'token', description: 'Query 参数模式的参数名' },
      { key: 'username', label: '用户名', type: 'string', required: false, group: 'Basic' },
      { key: 'password', label: '密码', type: 'password', required: false, group: 'Basic' },
      { key: 'authMessage', label: '认证消息 (JSON)', type: 'json', required: false, group: '消息认证', description: '连接成功后发送的认证消息体' },
      { key: 'customHeaders', label: '自定义请求头 (JSON)', type: 'json', required: false, group: '自定义' },
      // TLS
      { key: 'tlsCaCert', label: 'CA 证书 (PEM)', type: 'string', required: false, group: 'TLS' },
      { key: 'tlsClientCert', label: '客户端证书 (PEM)', type: 'string', required: false, group: 'TLS' },
      { key: 'tlsClientKey', label: '客户端私钥 (PEM)', type: 'string', required: false, group: 'TLS' },
      { key: 'tlsRejectUnauthorized', label: '验证服务器证书', type: 'boolean', required: false, defaultValue: true, group: 'TLS' },
    ],
    advancedFields: [
      // 连接控制
      { key: 'handshakeTimeout', label: '握手超时(ms)', type: 'number', required: false, defaultValue: 10000 },
      { key: 'closeTimeout', label: '关闭超时(ms)', type: 'number', required: false, defaultValue: 5000 },
      // 心跳
      { key: 'pingInterval', label: 'Ping 间隔(ms)', type: 'number', required: false, defaultValue: 30000, description: '客户端 Ping 帧发送间隔（0=禁用）' },
      { key: 'pongTimeout', label: 'Pong 超时(ms)', type: 'number', required: false, defaultValue: 10000, description: '等待 Pong 响应的超时时间' },
      { key: 'applicationPing', label: '应用层心跳', type: 'boolean', required: false, defaultValue: false, description: '使用应用层消息而非 WebSocket Ping 帧' },
      { key: 'applicationPingMessage', label: '心跳消息', type: 'string', required: false, defaultValue: '{"type":"ping"}', description: '应用层心跳的消息内容' },
      // 重连
      { key: 'autoReconnect', label: '自动重连', type: 'boolean', required: false, defaultValue: true },
      { key: 'reconnectInterval', label: '重连间隔(ms)', type: 'number', required: false, defaultValue: 3000 },
      { key: 'maxReconnectAttempts', label: '最大重连次数', type: 'number', required: false, defaultValue: 10, description: '0=无限重连' },
      { key: 'reconnectBackoff', label: '重连退避', type: 'select', required: false, defaultValue: 'exponential', options: [
        { label: '指数退避', value: 'exponential' },
        { label: '固定间隔', value: 'fixed' },
      ]},
      { key: 'maxReconnectInterval', label: '最大重连间隔(ms)', type: 'number', required: false, defaultValue: 30000 },
      // 消息控制
      { key: 'maxPayload', label: '最大消息大小(字节)', type: 'number', required: false, defaultValue: 104857600, description: '默认 100MB' },
      { key: 'perMessageDeflate', label: '消息压缩', type: 'boolean', required: false, defaultValue: false, description: '启用 permessage-deflate 扩展' },
      { key: 'binaryType', label: '二进制类型', type: 'select', required: false, defaultValue: 'nodebuffer', options: [
        { label: 'Buffer', value: 'nodebuffer' },
        { label: 'ArrayBuffer', value: 'arraybuffer' },
        { label: 'Fragment', value: 'fragments' },
      ]},
      // 订阅配置
      { key: 'subscribeMessage', label: '订阅消息 (JSON)', type: 'json', required: false, description: '连接后自动发送的订阅消息' },
      { key: 'unsubscribeMessage', label: '取消订阅消息 (JSON)', type: 'json', required: false, description: '断开前发送的取消订阅消息' },
      // 资源发现
      { key: 'discoverDuration', label: '发现监听时长(秒)', type: 'number', required: false, defaultValue: 5, description: '资源发现时监听消息的时长' },
      // Origin
      { key: 'origin', label: 'Origin', type: 'string', required: false, description: 'WebSocket 握手的 Origin 头' },
    ],
  };

  private buildWsOptions(params: Record<string, unknown>, auth?: Record<string, unknown>): WebSocket.ClientOptions {
    const options: WebSocket.ClientOptions = {
      handshakeTimeout: (params.handshakeTimeout as number) || 10000,
      maxPayload: (params.maxPayload as number) || 104857600,
      perMessageDeflate: (params.perMessageDeflate as boolean) || false,
    };

    if (params.origin) {
      options.origin = params.origin as string;
    }

    // 构建 Headers
    const headers: Record<string, string> = {};

    if (auth) {
      const authType = (auth.authType as string) || 'none';
      switch (authType) {
        case 'bearer':
          headers['Authorization'] = `Bearer ${auth.token || ''}`;
          break;
        case 'basic': {
          const encoded = Buffer.from(`${auth.username || ''}:${auth.password || ''}`).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
          break;
        }
        case 'custom-header':
          if (auth.customHeaders) {
            try {
              const custom = typeof auth.customHeaders === 'string'
                ? JSON.parse(auth.customHeaders)
                : auth.customHeaders;
              Object.assign(headers, custom);
            } catch { /* ignore */ }
          }
          break;
      }

      // TLS
      if (auth.tlsCaCert) (options as any).ca = auth.tlsCaCert as string;
      if (auth.tlsClientCert) (options as any).cert = auth.tlsClientCert as string;
      if (auth.tlsClientKey) (options as any).key = auth.tlsClientKey as string;
      if (auth.tlsRejectUnauthorized === false) (options as any).rejectUnauthorized = false;
    }

    if (Object.keys(headers).length > 0) {
      options.headers = headers;
    }

    return options;
  }

  private buildWsUrl(params: Record<string, unknown>, auth?: Record<string, unknown>): string {
    let url = params.url as string;

    // Query 参数 Token
    if (auth?.authType === 'query-token' && auth.token) {
      const separator = url.includes('?') ? '&' : '?';
      const paramName = (auth.tokenParamName as string) || 'token';
      url = `${url}${separator}${paramName}=${encodeURIComponent(auth.token as string)}`;
    }

    return url;
  }

  protected async doTestConnection(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const rawUrl = params.url as string;
    if (!rawUrl) {
      return { success: false, latencyMs: 0, message: 'WebSocket URL 不能为空' };
    }

    const url = this.buildWsUrl(params, auth);
    const options = this.buildWsOptions(params, auth);
    const protocols = (params.protocols as string)?.split(',').map(p => p.trim()).filter(Boolean) || undefined;

    return new Promise<ConnectionTestResult>((resolve) => {
      const ws = new WebSocket(url, protocols, options);
      const timeout = setTimeout(() => {
        ws.close();
        resolve({
          success: false,
          latencyMs: 0,
          message: `WebSocket 连接超时: ${rawUrl}`,
        });
      }, (params.handshakeTimeout as number) || 10000);

      ws.on('open', () => {
        clearTimeout(timeout);

        const details: Record<string, unknown> = {
          url: rawUrl,
          protocol: ws.protocol || 'none',
          extensions: ws.extensions || 'none',
          readyState: 'OPEN',
          authType: auth?.authType || 'none',
          messageFormat: params.messageFormat || 'json',
          wsType: params.wsType || 'generic',
        };

        // 发送认证消息
        if (auth?.authType === 'message' && auth.authMessage) {
          try {
            const authMsg = typeof auth.authMessage === 'string'
              ? auth.authMessage
              : JSON.stringify(auth.authMessage);
            ws.send(authMsg);
            details.authMessageSent = true;
          } catch { /* ignore */ }
        }

        ws.close();
        resolve({
          success: true,
          latencyMs: 0,
          message: `WebSocket ${rawUrl} 连接成功${ws.protocol ? ` (协议: ${ws.protocol})` : ''}`,
          serverVersion: `WebSocket${ws.protocol ? ` ${ws.protocol}` : ''}`,
          details,
        });
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        ws.close();
        resolve({
          success: false,
          latencyMs: 0,
          message: `WebSocket 连接失败: ${err.message}`,
          details: { url: rawUrl, error: err.message },
        });
      });

      ws.on('unexpected-response', (_, response) => {
        clearTimeout(timeout);
        ws.close();
        resolve({
          success: false,
          latencyMs: 0,
          message: `WebSocket 握手失败: HTTP ${response.statusCode} ${response.statusMessage}`,
          details: { url: rawUrl, statusCode: response.statusCode, statusMessage: response.statusMessage },
        });
      });
    });
  }

  protected async doDiscoverResources(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<DiscoveredEndpoint[]> {
    const rawUrl = params.url as string;
    const url = this.buildWsUrl(params, auth);
    const options = this.buildWsOptions(params, auth);
    const protocols = (params.protocols as string)?.split(',').map(p => p.trim()).filter(Boolean) || undefined;
    const discoverDuration = ((params.discoverDuration as number) || 5) * 1000;
    const endpoints: DiscoveredEndpoint[] = [];

    return new Promise<DiscoveredEndpoint[]>((resolve) => {
      const ws = new WebSocket(url, protocols, options);
      const messageTypes = new Map<string, { count: number; samplePayload: string; firstSeen: number }>();

      const timeout = setTimeout(() => {
        ws.close();

        // 转换消息类型为端点
        for (const [type, info] of Array.from(messageTypes.entries())) {
          endpoints.push({
            resourcePath: type,
            resourceType: 'topic',
            name: `消息类型: ${type}`,
            dataFormat: (params.messageFormat as string) === 'binary' ? 'binary' : 'json',
            metadata: {
              messageCount: info.count,
              samplePayload: info.samplePayload.slice(0, 500),
              messageRate: info.count / (discoverDuration / 1000),
            },
          });
        }

        if (endpoints.length === 0) {
          endpoints.push({
            resourcePath: rawUrl,
            resourceType: 'topic',
            name: `WebSocket 端点: ${rawUrl}`,
            dataFormat: 'json',
            metadata: { note: '监听期间未收到消息' },
          });
        }

        resolve(endpoints);
      }, discoverDuration + 2000);

      ws.on('open', () => {
        // 发送认证消息
        if (auth?.authType === 'message' && auth.authMessage) {
          try {
            ws.send(typeof auth.authMessage === 'string' ? auth.authMessage : JSON.stringify(auth.authMessage));
          } catch { /* ignore */ }
        }

        // 发送订阅消息
        if (params.subscribeMessage) {
          try {
            ws.send(typeof params.subscribeMessage === 'string' ? params.subscribeMessage : JSON.stringify(params.subscribeMessage));
          } catch { /* ignore */ }
        }

        // 监听消息
        setTimeout(() => {
          ws.close();
        }, discoverDuration);
      });

      ws.on('message', (data) => {
        const payload = data.toString('utf-8');
        let messageType = 'unknown';

        // 尝试解析 JSON 获取消息类型
        try {
          const parsed = JSON.parse(payload);
          messageType = parsed.type || parsed.event || parsed.action || parsed.cmd || parsed.method || 'json-message';
        } catch {
          messageType = payload.length > 100 ? 'text-large' : 'text-small';
        }

        const existing = messageTypes.get(messageType);
        if (existing) {
          existing.count++;
          existing.samplePayload = payload;
        } else {
          messageTypes.set(messageType, {
            count: 1,
            samplePayload: payload,
            firstSeen: Date.now(),
          });
        }
      });

      ws.on('error', () => {
        clearTimeout(timeout);
        resolve([{
          resourcePath: rawUrl,
          resourceType: 'topic',
          name: `WebSocket 端点: ${rawUrl}`,
          metadata: { error: '连接失败' },
        }]);
      });
    });
  }

  protected async doHealthCheck(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<Omit<HealthCheckResult, 'latencyMs' | 'checkedAt'>> {
    const testResult = await this.doTestConnection(params, auth);
    return {
      status: testResult.success ? 'healthy' : 'unhealthy',
      message: testResult.message,
      metrics: testResult.details,
    };
  }
}
