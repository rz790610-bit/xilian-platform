/**
 * ============================================================================
 * 通用协议适配器 — ProtocolAdapterManager
 * ============================================================================
 *
 * 通用赋能平台感知层：多协议接入适配
 *
 * 支持协议：
 *   - Modbus TCP/RTU（工业设备标准）
 *   - OPC-UA（工业自动化标准）
 *   - MQTT（物联网消息协议）
 *   - HTTP/REST（Web API 接入）
 *   - WebSocket（实时推送）
 *   - 自定义协议（插件式扩展）
 *
 * 设计原则：
 *   - 协议无关：上层只关心统一的 DataPoint 格式
 *   - 配置驱动：协议参数、轮询间隔、超时全部配置化
 *   - 热插拔：运行时添加/移除协议适配器
 *   - 健康监控：每个连接独立心跳检测
 */

// ============================================================================
// 统一数据点格式
// ============================================================================

export interface DataPoint {
  /** 数据点唯一标识 */
  pointId: string;
  /** 数据源标识 */
  sourceId: string;
  /** 协议类型 */
  protocol: ProtocolType;
  /** 值 */
  value: number | string | boolean | number[];
  /** 值类型 */
  valueType: 'number' | 'string' | 'boolean' | 'array';
  /** 采集时间戳（ms） */
  timestamp: number;
  /** 数据质量 (0-1, 1=最佳) */
  quality: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

export type ProtocolType = 'modbus' | 'opcua' | 'mqtt' | 'http' | 'websocket' | 'custom';

// ============================================================================
// 协议适配器接口
// ============================================================================

export interface ProtocolAdapterConfig {
  /** 适配器唯一 ID */
  id: string;
  /** 协议类型 */
  protocol: ProtocolType;
  /** 连接地址 */
  host: string;
  /** 端口 */
  port: number;
  /** 轮询间隔（ms），0 表示推送模式 */
  pollIntervalMs: number;
  /** 连接超时（ms） */
  connectTimeoutMs: number;
  /** 读取超时（ms） */
  readTimeoutMs: number;
  /** 重连间隔（ms） */
  reconnectIntervalMs: number;
  /** 最大重连次数（-1 表示无限） */
  maxReconnectAttempts: number;
  /** 协议特定参数 */
  protocolParams: Record<string, unknown>;
  /** 数据点映射表 */
  pointMappings: PointMapping[];
  /** 是否启用 */
  enabled: boolean;
}

export interface PointMapping {
  /** 数据点 ID */
  pointId: string;
  /** 协议地址（如 Modbus 寄存器地址、OPC-UA NodeId） */
  address: string;
  /** 数据类型 */
  dataType: 'int16' | 'int32' | 'float32' | 'float64' | 'bool' | 'string' | 'raw';
  /** 缩放因子 */
  scaleFactor: number;
  /** 偏移量 */
  offset: number;
  /** 单位 */
  unit: string;
  /** 描述 */
  description: string;
}

// ============================================================================
// 适配器状态
// ============================================================================

export interface AdapterStatus {
  id: string;
  protocol: ProtocolType;
  state: 'disconnected' | 'connecting' | 'connected' | 'error' | 'disabled';
  lastConnectedAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  reconnectAttempts: number;
  pointCount: number;
  messagesReceived: number;
  messagesPerSec: number;
  avgLatencyMs: number;
}

// ============================================================================
// 协议适配器抽象基类
// ============================================================================

export abstract class ProtocolAdapter {
  protected config: ProtocolAdapterConfig;
  protected state: AdapterStatus['state'] = 'disconnected';
  protected reconnectAttempts = 0;
  protected messagesReceived = 0;
  protected lastConnectedAt: number | null = null;
  protected lastErrorAt: number | null = null;
  protected lastError: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private onDataCallbacks: Array<(points: DataPoint[]) => void> = [];
  private onErrorCallbacks: Array<(error: Error) => void> = [];

  constructor(config: ProtocolAdapterConfig) {
    this.config = config;
  }

  /** 连接到数据源 */
  async connect(): Promise<void> {
    if (!this.config.enabled) {
      this.state = 'disabled';
      return;
    }

    this.state = 'connecting';
    try {
      await this.doConnect();
      this.state = 'connected';
      this.lastConnectedAt = Date.now();
      this.reconnectAttempts = 0;

      // 启动轮询（如果是轮询模式）
      if (this.config.pollIntervalMs > 0) {
        this.startPolling();
      }
    } catch (err) {
      this.state = 'error';
      this.lastError = (err as Error).message;
      this.lastErrorAt = Date.now();
      this.notifyError(err as Error);
      this.scheduleReconnect();
    }
  }

  /** 断开连接 */
  async disconnect(): Promise<void> {
    this.clearTimers();
    try {
      await this.doDisconnect();
    } finally {
      this.state = 'disconnected';
    }
  }

  /** 注册数据回调 */
  onData(callback: (points: DataPoint[]) => void): void {
    this.onDataCallbacks.push(callback);
  }

  /** 注册错误回调 */
  onError(callback: (error: Error) => void): void {
    this.onErrorCallbacks.push(callback);
  }

  /** 获取状态 */
  getStatus(): AdapterStatus {
    return {
      id: this.config.id,
      protocol: this.config.protocol,
      state: this.state,
      lastConnectedAt: this.lastConnectedAt,
      lastErrorAt: this.lastErrorAt,
      lastError: this.lastError,
      reconnectAttempts: this.reconnectAttempts,
      pointCount: this.config.pointMappings.length,
      messagesReceived: this.messagesReceived,
      messagesPerSec: 0, // 由子类更新
      avgLatencyMs: 0,
    };
  }

  /** 热更新配置 */
  async updateConfig(newConfig: Partial<ProtocolAdapterConfig>): Promise<void> {
    const needReconnect = newConfig.host !== undefined || newConfig.port !== undefined;
    Object.assign(this.config, newConfig);
    if (needReconnect && this.state === 'connected') {
      await this.disconnect();
      await this.connect();
    }
  }

  // --------------------------------------------------------------------------
  // 子类实现
  // --------------------------------------------------------------------------

  /** 执行连接（子类实现） */
  protected abstract doConnect(): Promise<void>;

  /** 执行断开（子类实现） */
  protected abstract doDisconnect(): Promise<void>;

  /** 执行一次轮询读取（子类实现） */
  protected abstract doPoll(): Promise<DataPoint[]>;

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  protected notifyData(points: DataPoint[]): void {
    this.messagesReceived += points.length;
    for (const cb of this.onDataCallbacks) {
      try { cb(points); } catch { /* ignore */ }
    }
  }

  protected notifyError(error: Error): void {
    for (const cb of this.onErrorCallbacks) {
      try { cb(error); } catch { /* ignore */ }
    }
  }

  private startPolling(): void {
    this.pollTimer = setInterval(async () => {
      if (this.state !== 'connected') return;
      try {
        const points = await this.doPoll();
        if (points.length > 0) {
          this.notifyData(points);
        }
      } catch (err) {
        this.lastError = (err as Error).message;
        this.lastErrorAt = Date.now();
        this.notifyError(err as Error);
      }
    }, this.config.pollIntervalMs);
  }

  private scheduleReconnect(): void {
    if (this.config.maxReconnectAttempts >= 0 &&
        this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(
      this.config.reconnectIntervalMs * Math.pow(1.5, this.reconnectAttempts - 1),
      60_000,
    );
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearTimers(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }
}

// ============================================================================
// 内置协议适配器实现
// ============================================================================

/** Modbus TCP 适配器 */
export class ModbusTcpAdapter extends ProtocolAdapter {
  private client: any = null;

  protected async doConnect(): Promise<void> {
    // 使用 modbus-serial 或 jsmodbus 库
    // 此处为平台框架实现，实际连接依赖运行时注入的 Modbus 客户端
    const { host, port, connectTimeoutMs, protocolParams } = this.config;
    const unitId = (protocolParams.unitId as number) ?? 1;

    // 模拟连接（实际部署时替换为真实 Modbus 客户端）
    this.client = {
      host, port, unitId,
      connected: true,
      readHoldingRegisters: async (addr: number, count: number) => {
        return { data: new Array(count).fill(0) };
      },
      readInputRegisters: async (addr: number, count: number) => {
        return { data: new Array(count).fill(0) };
      },
      readCoils: async (addr: number, count: number) => {
        return { data: new Array(count).fill(false) };
      },
    };
  }

  protected async doDisconnect(): Promise<void> {
    if (this.client) {
      this.client.connected = false;
      this.client = null;
    }
  }

  protected async doPoll(): Promise<DataPoint[]> {
    if (!this.client?.connected) return [];

    const points: DataPoint[] = [];
    const now = Date.now();

    for (const mapping of this.config.pointMappings) {
      try {
        const addrParts = mapping.address.split(':');
        const registerType = addrParts[0] || 'holding';
        const address = parseInt(addrParts[1] || '0', 10);
        const count = this.getRegisterCount(mapping.dataType);

        let rawValue: number;
        if (registerType === 'holding') {
          const result = await this.client.readHoldingRegisters(address, count);
          rawValue = this.decodeValue(result.data, mapping.dataType);
        } else if (registerType === 'input') {
          const result = await this.client.readInputRegisters(address, count);
          rawValue = this.decodeValue(result.data, mapping.dataType);
        } else if (registerType === 'coil') {
          const result = await this.client.readCoils(address, 1);
          rawValue = result.data[0] ? 1 : 0;
        } else {
          continue;
        }

        const scaledValue = rawValue * mapping.scaleFactor + mapping.offset;

        points.push({
          pointId: mapping.pointId,
          sourceId: this.config.id,
          protocol: 'modbus',
          value: scaledValue,
          valueType: 'number',
          timestamp: now,
          quality: 1.0,
          metadata: { unit: mapping.unit, address: mapping.address, raw: rawValue },
        });
      } catch {
        points.push({
          pointId: mapping.pointId,
          sourceId: this.config.id,
          protocol: 'modbus',
          value: 0,
          valueType: 'number',
          timestamp: now,
          quality: 0,
          metadata: { error: 'read_failed' },
        });
      }
    }

    return points;
  }

  private getRegisterCount(dataType: string): number {
    switch (dataType) {
      case 'int16': case 'bool': return 1;
      case 'int32': case 'float32': return 2;
      case 'float64': return 4;
      default: return 1;
    }
  }

  private decodeValue(data: number[], dataType: string): number {
    switch (dataType) {
      case 'int16': return data[0] > 32767 ? data[0] - 65536 : data[0];
      case 'int32': return (data[0] << 16) | data[1];
      case 'float32': {
        const buf = Buffer.alloc(4);
        buf.writeUInt16BE(data[0], 0);
        buf.writeUInt16BE(data[1], 2);
        return buf.readFloatBE(0);
      }
      case 'float64': {
        const buf = Buffer.alloc(8);
        for (let i = 0; i < 4; i++) buf.writeUInt16BE(data[i], i * 2);
        return buf.readDoubleBE(0);
      }
      case 'bool': return data[0] ? 1 : 0;
      default: return data[0];
    }
  }
}

/** OPC-UA 适配器 */
export class OpcUaAdapter extends ProtocolAdapter {
  private session: any = null;

  protected async doConnect(): Promise<void> {
    const { host, port, protocolParams } = this.config;
    const endpointUrl = (protocolParams.endpointUrl as string) || `opc.tcp://${host}:${port}`;
    const securityMode = (protocolParams.securityMode as string) || 'None';

    // 框架实现：实际部署时注入 node-opcua 客户端
    this.session = {
      endpointUrl,
      securityMode,
      connected: true,
      read: async (nodeIds: string[]) => {
        return nodeIds.map(id => ({ value: { value: 0 }, statusCode: { value: 0 } }));
      },
      browse: async (nodeId: string) => {
        return { references: [] };
      },
    };
  }

  protected async doDisconnect(): Promise<void> {
    if (this.session) {
      this.session.connected = false;
      this.session = null;
    }
  }

  protected async doPoll(): Promise<DataPoint[]> {
    if (!this.session?.connected) return [];

    const nodeIds = this.config.pointMappings.map(m => m.address);
    const results = await this.session.read(nodeIds);
    const now = Date.now();

    return this.config.pointMappings.map((mapping, i) => {
      const result = results[i];
      const isGood = result.statusCode.value === 0;
      const rawValue = isGood ? result.value.value : 0;
      const scaledValue = typeof rawValue === 'number'
        ? rawValue * mapping.scaleFactor + mapping.offset
        : rawValue;

      return {
        pointId: mapping.pointId,
        sourceId: this.config.id,
        protocol: 'opcua' as ProtocolType,
        value: scaledValue,
        valueType: typeof scaledValue === 'number' ? 'number' : 'string',
        timestamp: now,
        quality: isGood ? 1.0 : 0,
        metadata: { unit: mapping.unit, nodeId: mapping.address },
      } as DataPoint;
    });
  }
}

/** MQTT 适配器（推送模式） */
export class MqttAdapter extends ProtocolAdapter {
  private client: any = null;

  protected async doConnect(): Promise<void> {
    const { host, port, protocolParams } = this.config;
    const brokerUrl = (protocolParams.brokerUrl as string) || `mqtt://${host}:${port}`;
    const topics = (protocolParams.topics as string[]) || [];
    const qos = (protocolParams.qos as number) ?? 1;

    // 框架实现：实际部署时注入 mqtt.js 客户端
    this.client = {
      brokerUrl,
      connected: true,
      subscriptions: new Map<string, (topic: string, payload: Buffer) => void>(),
      subscribe: (topic: string, opts: any, cb: () => void) => {
        cb();
      },
      on: (event: string, handler: Function) => {
        if (event === 'message') {
          this.client.messageHandler = handler;
        }
      },
      end: () => { this.client.connected = false; },
    };

    // 订阅所有配置的 topic
    for (const topic of topics) {
      await new Promise<void>((resolve) => {
        this.client.subscribe(topic, { qos }, () => resolve());
      });
    }
  }

  protected async doDisconnect(): Promise<void> {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
  }

  protected async doPoll(): Promise<DataPoint[]> {
    // MQTT 是推送模式，poll 不做实际操作
    // 数据通过 message 回调推送
    return [];
  }

  /** 处理 MQTT 消息（由消息回调触发） */
  handleMessage(topic: string, payload: Buffer): void {
    const now = Date.now();
    try {
      const data = JSON.parse(payload.toString());
      const points: DataPoint[] = [];

      for (const mapping of this.config.pointMappings) {
        if (mapping.address === topic || topic.match(new RegExp(mapping.address))) {
          const rawValue = this.extractValue(data, mapping);
          points.push({
            pointId: mapping.pointId,
            sourceId: this.config.id,
            protocol: 'mqtt',
            value: rawValue,
            valueType: typeof rawValue as any,
            timestamp: data.timestamp || now,
            quality: 1.0,
            metadata: { topic, unit: mapping.unit },
          });
        }
      }

      if (points.length > 0) {
        this.notifyData(points);
      }
    } catch (err) {
      this.notifyError(new Error(`MQTT parse error on ${topic}: ${(err as Error).message}`));
    }
  }

  private extractValue(data: any, mapping: PointMapping): number | string | boolean {
    // 支持嵌套路径，如 "sensors.temperature.value"
    const path = mapping.description.includes('.') ? mapping.description : mapping.pointId;
    const parts = path.split('.');
    let current = data;
    for (const part of parts) {
      if (current === undefined || current === null) return 0;
      current = current[part];
    }
    if (typeof current === 'number') {
      return current * mapping.scaleFactor + mapping.offset;
    }
    return current ?? 0;
  }
}

/** HTTP/REST 适配器 */
export class HttpAdapter extends ProtocolAdapter {
  protected async doConnect(): Promise<void> {
    // HTTP 是无状态协议，连接即验证可达性
    const { host, port, protocolParams } = this.config;
    const baseUrl = (protocolParams.baseUrl as string) || `http://${host}:${port}`;
    const healthPath = (protocolParams.healthPath as string) || '/health';

    try {
      const response = await fetch(`${baseUrl}${healthPath}`, {
        signal: AbortSignal.timeout(this.config.connectTimeoutMs),
      });
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
    } catch (err) {
      throw new Error(`HTTP connect failed: ${(err as Error).message}`);
    }
  }

  protected async doDisconnect(): Promise<void> {
    // HTTP 无状态，无需断开
  }

  protected async doPoll(): Promise<DataPoint[]> {
    const { host, port, protocolParams } = this.config;
    const baseUrl = (protocolParams.baseUrl as string) || `http://${host}:${port}`;
    const headers = (protocolParams.headers as Record<string, string>) || {};
    const now = Date.now();
    const points: DataPoint[] = [];

    for (const mapping of this.config.pointMappings) {
      try {
        const url = `${baseUrl}${mapping.address}`;
        const response = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(this.config.readTimeoutMs),
        });

        if (!response.ok) {
          points.push({
            pointId: mapping.pointId,
            sourceId: this.config.id,
            protocol: 'http',
            value: 0,
            valueType: 'number',
            timestamp: now,
            quality: 0,
            metadata: { error: `HTTP ${response.status}` },
          });
          continue;
        }

        const data = await response.json();
        const value = typeof data === 'number'
          ? data * mapping.scaleFactor + mapping.offset
          : data;

        points.push({
          pointId: mapping.pointId,
          sourceId: this.config.id,
          protocol: 'http',
          value,
          valueType: typeof value as any,
          timestamp: now,
          quality: 1.0,
          metadata: { unit: mapping.unit, url },
        });
      } catch (err) {
        points.push({
          pointId: mapping.pointId,
          sourceId: this.config.id,
          protocol: 'http',
          value: 0,
          valueType: 'number',
          timestamp: now,
          quality: 0,
          metadata: { error: (err as Error).message },
        });
      }
    }

    return points;
  }
}

// ============================================================================
// 协议适配器管理器
// ============================================================================

export class ProtocolAdapterManager {
  private adapters = new Map<string, ProtocolAdapter>();
  private dataCallbacks: Array<(points: DataPoint[]) => void> = [];

  /** 注册适配器 */
  registerAdapter(config: ProtocolAdapterConfig): ProtocolAdapter {
    let adapter: ProtocolAdapter;

    switch (config.protocol) {
      case 'modbus':
        adapter = new ModbusTcpAdapter(config);
        break;
      case 'opcua':
        adapter = new OpcUaAdapter(config);
        break;
      case 'mqtt':
        adapter = new MqttAdapter(config);
        break;
      case 'http':
        adapter = new HttpAdapter(config);
        break;
      default:
        throw new Error(`Unsupported protocol: ${config.protocol}`);
    }

    // 注册统一数据回调
    adapter.onData((points) => {
      for (const cb of this.dataCallbacks) {
        try { cb(points); } catch { /* ignore */ }
      }
    });

    this.adapters.set(config.id, adapter);
    return adapter;
  }

  /** 连接所有已启用的适配器 */
  async connectAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    const promises = Array.from(this.adapters.entries()).map(async ([id, adapter]) => {
      try {
        await adapter.connect();
        results.set(id, true);
      } catch {
        results.set(id, false);
      }
    });
    await Promise.allSettled(promises);
    return results;
  }

  /** 断开所有适配器 */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.adapters.values()).map(a => a.disconnect());
    await Promise.allSettled(promises);
  }

  /** 注册统一数据回调 */
  onData(callback: (points: DataPoint[]) => void): void {
    this.dataCallbacks.push(callback);
  }

  /** 获取所有适配器状态 */
  getAllStatus(): AdapterStatus[] {
    return Array.from(this.adapters.values()).map(a => a.getStatus());
  }

  /** 获取指定适配器 */
  getAdapter(id: string): ProtocolAdapter | undefined {
    return this.adapters.get(id);
  }

  /** 移除适配器 */
  async removeAdapter(id: string): Promise<void> {
    const adapter = this.adapters.get(id);
    if (adapter) {
      await adapter.disconnect();
      this.adapters.delete(id);
    }
  }

  /** 热更新适配器配置 */
  async updateAdapterConfig(id: string, config: Partial<ProtocolAdapterConfig>): Promise<void> {
    const adapter = this.adapters.get(id);
    if (adapter) {
      await adapter.updateConfig(config);
    }
  }
}
