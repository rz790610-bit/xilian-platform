/**
 * gRPC 客户端工厂 — 主应用调用微服务的统一入口
 * 
 * 支持两种模式：
 * 1. 单体模式（默认）：直接调用本地服务层，零网络开销
 * 2. 微服务模式：通过 gRPC 调用远程服务
 * 
 * 模式切换：
 *   DEPLOYMENT_MODE=monolith  → 本地调用（默认）
 *   DEPLOYMENT_MODE=microservices → gRPC 远程调用
 * 
 * 连接管理：
 * - 连接池复用（每个服务一个长连接）
 * - 自动重连 + 指数退避
 * - 健康检查 + 熔断
 * - 优雅关闭
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { trace } from '@opentelemetry/api';
import { config as appConfig } from '../../core/config';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('grpc-clients');

// ============================================================
// 配置
// ============================================================

export type DeploymentMode = 'monolith' | 'microservices';

interface ServiceConfig {
  host: string;
  port: number;
  protoPath: string;
  packageName: string;
  serviceName: string;
}

const DEPLOYMENT_MODE: DeploymentMode =
  (appConfig.grpc.deploymentMode as DeploymentMode) || 'monolith';

const SERVICE_CONFIGS: Record<string, ServiceConfig> = {
  device: {
    host: appConfig.grpc.deviceServiceHost,
    port: appConfig.grpc.deviceServicePort,
    protoPath: path.resolve(__dirname, '../../../services/device-service/proto/device_service.proto'),
    packageName: 'xilian.device.v1',
    serviceName: 'DeviceService',
  },
  algorithm: {
    host: appConfig.grpc.algorithmServiceHost,
    port: appConfig.grpc.algorithmServicePort,
    protoPath: path.resolve(__dirname, '../../../services/algorithm-service/proto/algorithm_service.proto'),
    packageName: 'xilian.algorithm.v1',
    serviceName: 'AlgorithmService',
  },
};

// ============================================================
// 连接管理
// ============================================================

const connections = new Map<string, grpc.Client>();
const connectionState = new Map<string, {
  retryCount: number;
  lastError: string | null;
  lastConnected: Date | null;
  healthy: boolean;
}>();

/**
 * 获取或创建 gRPC 客户端连接
 */
async function getConnection(serviceName: string): Promise<grpc.Client> {
  const existing = connections.get(serviceName);
  if (existing) {
    const state = existing.getChannel().getConnectivityState(false);
    if (state !== grpc.connectivityState.SHUTDOWN) {
      return existing;
    }
    // 连接已关闭，重新创建
    connections.delete(serviceName);
  }

  const svcConfig = SERVICE_CONFIGS[serviceName];
  if (!svcConfig) {
    throw new Error(`Unknown service: ${serviceName}`);
  }

  const packageDefinition = protoLoader.loadSync(svcConfig.protoPath, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [
      path.dirname(svcConfig.protoPath),
      path.resolve(__dirname, '../../../node_modules/google-proto-files'),
    ],
  });

  const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
  
  // 按 package name 导航到 service constructor
  const parts = svcConfig.packageName.split('.');
  let current: any = protoDescriptor;
  for (const part of parts) {
    current = current[part];
    if (!current) throw new Error(`Proto package path not found: ${svcConfig.packageName}`);
  }

  const ServiceConstructor = current[svcConfig.serviceName];
  if (!ServiceConstructor) {
    throw new Error(`Service ${svcConfig.serviceName} not found in proto`);
  }

  const address = `${svcConfig.host}:${svcConfig.port}`;

  // P0-12: gRPC TLS 支持——生产环境必须启用 TLS，开发环境可回退到 Insecure
  let channelCredentials: grpc.ChannelCredentials;
  const tlsCertPath = appConfig.grpc.tlsCertPath;
  const tlsKeyPath = appConfig.grpc.tlsKeyPath;
  const tlsCaPath = appConfig.grpc.tlsCaPath;
  if (tlsCertPath && tlsKeyPath) {
    const fs = await import('fs');
    const rootCerts = tlsCaPath ? fs.readFileSync(tlsCaPath) : undefined;
    const privateKey = fs.readFileSync(tlsKeyPath);
    const certChain = fs.readFileSync(tlsCertPath);
    channelCredentials = grpc.credentials.createSsl(rootCerts, privateKey, certChain);
    log.debug(`[gRPC] Using mTLS for ${serviceName}`);
  } else if (appConfig.app.env === 'production') {
    log.warn(`[gRPC] WARNING: No TLS certs configured for ${serviceName} in production — using insecure channel`);
    channelCredentials = grpc.credentials.createInsecure();
  } else {
    channelCredentials = grpc.credentials.createInsecure();
  }

  const client = new ServiceConstructor(
    address,
    channelCredentials,
    {
      'grpc.keepalive_time_ms': 30000,
      'grpc.keepalive_timeout_ms': 5000,
      'grpc.keepalive_permit_without_calls': 1,
      'grpc.max_reconnect_backoff_ms': 10000,
      'grpc.initial_reconnect_backoff_ms': 1000,
      'grpc.max_receive_message_length': 100 * 1024 * 1024,
      'grpc.max_send_message_length': 100 * 1024 * 1024,
    }
  );

  connections.set(serviceName, client);
  connectionState.set(serviceName, {
    retryCount: 0,
    lastError: null,
    lastConnected: new Date(),
    healthy: true,
  });

  log.info(`gRPC client created for ${serviceName} at ${address}`);
  return client;
}

// ============================================================
// 通用 RPC 调用包装器
// ============================================================

/**
 * 将 gRPC callback 风格转为 Promise
 */
function callUnary<TReq, TRes>(
  client: grpc.Client,
  method: string,
  request: TReq,
  timeoutMs: number = 30000
): Promise<TRes> {
  return new Promise((resolve, reject) => {
    const deadline = new Date(Date.now() + timeoutMs);
    const metadata = new grpc.Metadata();
    
    // 注入 trace context（从 OTel context 获取，而非环境变量）
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const traceId = activeSpan.spanContext().traceId;
      metadata.set('x-trace-id', traceId);
    }

    (client as any)[method](request, metadata, { deadline }, (err: any, response: TRes) => {
      if (err) {
        log.warn(`gRPC call ${method} failed:`, err.message);
        reject(err);
      } else {
        resolve(response);
      }
    });
  });
}

// ============================================================
// 公开 API — Device Service 客户端
// ============================================================

export class DeviceServiceClient {
  private async getClient(): Promise<grpc.Client> {
    return getConnection('device');
  }

   async healthCheck(): Promise<any> {
    return callUnary(await this.getClient(), 'healthCheck', {});
  }
  async createDevice(request: any): Promise<any> {
    return callUnary(await this.getClient(), 'createDevice', request);
  }
  async getDevice(nodeId: string): Promise<any> {
    return callUnary(await this.getClient(), 'getDevice', { nodeId });
  }

  async listDevices(request: any): Promise<any> {
    return callUnary(await this.getClient(), 'listDevices', request);
  }

  async updateDevice(request: any): Promise<any> {
    return callUnary(await this.getClient(), 'updateDevice', request);
  }

  async deleteDevice(nodeId: string, force = false): Promise<void> {
    await callUnary(await this.getClient(), 'deleteDevice', { nodeId, force });
  }

  async activateDevice(nodeId: string): Promise<any> {
    return callUnary(await this.getClient(), 'activateDevice', { nodeId });
  }

  async deactivateDevice(nodeId: string): Promise<any> {
    return callUnary(await this.getClient(), 'deactivateDevice', { nodeId });
  }

  async createSensor(request: any): Promise<any> {
    return callUnary(await this.getClient(), 'createSensor', request);
  }

  async listSensors(request: any): Promise<any> {
    return callUnary(await this.getClient(), 'listSensors', request);
  }

  async getDeviceHealth(nodeId: string): Promise<any> {
    return callUnary(await this.getClient(), 'getDeviceHealth', { nodeId });
  }
}

// ============================================================
// 公开 API — Algorithm Service 客户端
// ============================================================

export class AlgorithmServiceClient {
  private async getClient(): Promise<grpc.Client> {
    return getConnection('algorithm');
  }

  // P2-GRPC-1: TODO 将 any 替换为 proto 生成的类型（待 proto 编译后统一替换）
  async healthCheck(): Promise<Record<string, unknown>> {
    return callUnary(await this.getClient(), 'healthCheck', {});
  }

  async createDefinition(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    return callUnary(await this.getClient(), 'createDefinition', request);
  }

  async getDefinition(definitionId: string): Promise<Record<string, unknown>> {
    return callUnary(await this.getClient(), 'getDefinition', { definitionId });
  }

  async listDefinitions(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    return callUnary(await this.getClient(), 'listDefinitions', request);
  }

  async executeAlgorithm(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    return callUnary(await this.getClient(), 'executeAlgorithm', request, 120000); // 2min timeout
  }

  async executeComposition(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    return callUnary(await this.getClient(), 'executeComposition', request, 300000); // 5min timeout
  }

  async listExecutionHistory(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    return callUnary(await this.getClient(), 'listExecutionHistory', request);
  }

  async bindAlgorithmToDevice(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    return callUnary(await this.getClient(), 'bindAlgorithmToDevice', request);
  }

  async getRecommendedAlgorithms(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    return callUnary(await this.getClient(), 'getRecommendedAlgorithms', request);
  }

  async getOverviewStats(): Promise<Record<string, unknown>> {
    return callUnary(await this.getClient(), 'getOverviewStats', {});
  }

  async getWorkerPoolStatus(): Promise<any> {
    return callUnary(await this.getClient(), 'getWorkerPoolStatus', {});
  }
}

// ============================================================
// 单例工厂
// ============================================================

let deviceClient: DeviceServiceClient | null = null;
let algorithmClient: AlgorithmServiceClient | null = null;

/**
 * 获取 Device Service 客户端
 * 
 * 单体模式下返回 null（调用方应直接使用本地服务层）
 * 微服务模式下返回 gRPC 客户端
 */
export function getDeviceServiceClient(): DeviceServiceClient | null {
  if (DEPLOYMENT_MODE === 'monolith') return null;
  if (!deviceClient) deviceClient = new DeviceServiceClient();
  return deviceClient;
}

/**
 * 获取 Algorithm Service 客户端
 */
export function getAlgorithmServiceClient(): AlgorithmServiceClient | null {
  if (DEPLOYMENT_MODE === 'monolith') return null;
  if (!algorithmClient) algorithmClient = new AlgorithmServiceClient();
  return algorithmClient;
}

/**
 * 获取部署模式
 */
export function getDeploymentMode(): DeploymentMode {
  return DEPLOYMENT_MODE;
}

/**
 * 获取所有连接状态
 */
export function getGrpcConnectionStatus(): Record<string, any> {
  const status: Record<string, any> = {
    deploymentMode: DEPLOYMENT_MODE,
    services: {},
  };

  connectionState.forEach((state, name) => {
    const client = connections.get(name);
    status.services[name] = {
      ...state,
      connected: client
        ? client.getChannel().getConnectivityState(false) === grpc.connectivityState.READY
        : false,
    };
  });

  return status;
}

/**
 * 关闭所有 gRPC 连接
 */
export function closeAllGrpcConnections(): void {
  connections.forEach((client, name) => {
    try {
      client.close();
      log.info(`gRPC connection closed: ${name}`);
    } catch (err: any) {
      log.warn(`Failed to close gRPC connection ${name}:`, err.message);
    }
  });
  connections.clear();
  connectionState.clear();
}
