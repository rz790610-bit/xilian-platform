/**
 * API 网关统一管理服务
 * 
 * 整合 Kong 和 Istio，提供统一的网关管理接口
 */

import { KongGateway, kongGateway, type GatewayStats, type Route, type Service, type RBACRole, type RateLimitResult } from './kongGateway';
import { IstioMesh, istioMesh, type MeshStats, type CanaryDeployment, type ChaosExperiment, type TraceSpan } from './istioMesh';

// ============ 类型定义 ============

export interface GatewayManagerConfig {
  kong: {
    enabled: boolean;
  };
  istio: {
    enabled: boolean;
  };
}

export interface UnifiedGatewayStats {
  kong: GatewayStats;
  istio: MeshStats;
  combined: {
    totalRequests: number;
    totalServices: number;
    healthyServices: number;
    activeCanaries: number;
    activeExperiments: number;
  };
}

export interface RequestContext {
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
  clientIp: string;
  traceId?: string;
}

export interface RequestResult {
  allowed: boolean;
  kongResult?: {
    route?: Route;
    service?: Service;
    user?: { userId: string; username: string; roles: string[] };
    rateLimitInfo?: RateLimitResult;
  };
  istioResult?: {
    traceSpan?: TraceSpan;
    canaryVersion?: string;
  };
  error?: string;
  latencyMs: number;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: GatewayManagerConfig = {
  kong: {
    enabled: true,
  },
  istio: {
    enabled: true,
  },
};

// ============ API 网关管理服务 ============

export class GatewayManager {
  private config: GatewayManagerConfig;
  private kong: KongGateway;
  private istio: IstioMesh;
  private isInitialized: boolean = false;
  private requestCount: number = 0;
  private errorCount: number = 0;

  constructor(config?: Partial<GatewayManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.kong = kongGateway;
    this.istio = istioMesh;
  }

  /**
   * 初始化网关管理器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[GatewayManager] Already initialized');
      return;
    }

    console.log('[GatewayManager] Initializing...');
    const startTime = Date.now();

    try {
      // 初始化 Kong
      if (this.config.kong.enabled) {
        await this.kong.initialize();
        console.log('[GatewayManager] Kong gateway initialized');
      }

      // 初始化 Istio
      if (this.config.istio.enabled) {
        await this.istio.initialize();
        console.log('[GatewayManager] Istio mesh initialized');
      }

      this.isInitialized = true;
      const elapsed = Date.now() - startTime;
      console.log(`[GatewayManager] Initialization completed in ${elapsed}ms`);
    } catch (error) {
      console.error('[GatewayManager] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * 关闭网关管理器
   */
  async close(): Promise<void> {
    console.log('[GatewayManager] Shutting down...');

    if (this.config.kong.enabled) {
      await this.kong.close();
    }

    if (this.config.istio.enabled) {
      await this.istio.close();
    }

    this.isInitialized = false;
    console.log('[GatewayManager] Shutdown complete');
  }

  // ============ 统一请求处理 ============

  /**
   * 处理请求（统一入口）
   */
  async handleRequest(context: RequestContext): Promise<RequestResult> {
    const startTime = Date.now();
    this.requestCount++;

    try {
      let kongResult: RequestResult['kongResult'];
      let istioResult: RequestResult['istioResult'];

      // 1. Kong 网关处理（南北流量）
      if (this.config.kong.enabled) {
        const result = await this.kong.handleRequest({
          path: context.path,
          method: context.method,
          headers: context.headers,
          body: context.body,
          clientIp: context.clientIp,
        });

        if (!result.allowed) {
          this.errorCount++;
          return {
            allowed: false,
            error: result.error,
            latencyMs: Date.now() - startTime,
          };
        }

        kongResult = {
          route: result.route,
          service: result.service,
          user: result.user,
          rateLimitInfo: result.rateLimitInfo,
        };
      }

      // 2. Istio 追踪（东西流量）
      if (this.config.istio.enabled) {
        const span = this.istio.createSpan(
          `${context.method} ${context.path}`,
          kongResult?.service?.name || 'unknown',
          undefined,
          context.traceId
        );

        this.istio.addSpanTag(span, 'http.method', context.method);
        this.istio.addSpanTag(span, 'http.url', context.path);
        this.istio.addSpanTag(span, 'client.ip', context.clientIp);

        if (kongResult?.user) {
          this.istio.addSpanTag(span, 'user.id', kongResult.user.userId);
        }

        this.istio.finishSpan(span, 'ok');

        istioResult = {
          traceSpan: span,
        };
      }

      return {
        allowed: true,
        kongResult,
        istioResult,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      this.errorCount++;
      return {
        allowed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - startTime,
      };
    }
  }

  // ============ 认证和授权 ============

  /**
   * 生成 JWT Token
   */
  generateToken(payload: {
    userId: string;
    username: string;
    roles: string[];
    groups?: string[];
  }): string {
    return this.kong.generateJWT(payload);
  }

  /**
   * 验证 JWT Token
   */
  verifyToken(token: string): {
    valid: boolean;
    payload?: {
      userId: string;
      username: string;
      roles: string[];
    };
    error?: string;
  } {
    return this.kong.verifyJWT(token);
  }

  /**
   * 检查权限
   */
  checkPermission(
    roles: string[],
    resource: string,
    action: 'read' | 'write' | 'delete' | 'admin'
  ): boolean {
    return this.kong.checkPermission(roles, resource, action);
  }

  /**
   * 获取所有角色
   */
  getAllRoles(): RBACRole[] {
    return this.kong.getAllRoles();
  }

  // ============ 限流管理 ============

  /**
   * 检查限流
   */
  async checkRateLimit(key: string, isVip: boolean = false): Promise<RateLimitResult> {
    return this.kong.checkRateLimit(key, isVip);
  }

  /**
   * 重置限流
   */
  async resetRateLimit(key: string): Promise<void> {
    return this.kong.resetRateLimit(key);
  }

  // ============ Canary 发布管理 ============

  /**
   * 创建 Canary 发布
   */
  createCanaryDeployment(
    service: string,
    namespace: string,
    stableVersion: string,
    canaryVersion: string
  ): CanaryDeployment {
    return this.istio.createCanaryDeployment(
      service,
      namespace,
      stableVersion,
      canaryVersion
    );
  }

  /**
   * 推进 Canary 阶段
   */
  advanceCanaryStage(deploymentName: string): CanaryDeployment | null {
    return this.istio.advanceCanaryStage(deploymentName);
  }

  /**
   * 回滚 Canary 发布
   */
  rollbackCanary(deploymentName: string): CanaryDeployment | null {
    return this.istio.rollbackCanary(deploymentName);
  }

  /**
   * 获取所有 Canary 发布
   */
  getAllCanaryDeployments(): CanaryDeployment[] {
    return this.istio.getAllCanaryDeployments();
  }

  // ============ 混沌工程管理 ============

  /**
   * 创建混沌实验
   */
  createChaosExperiment(
    name: string,
    targetService: string,
    namespace: string,
    type: 'delay' | 'abort' | 'partition',
    config: {
      percentage: number;
      delay?: string;
      httpStatus?: number;
    },
    duration: string
  ): ChaosExperiment {
    return this.istio.createChaosExperiment(
      name,
      targetService,
      namespace,
      type,
      config,
      duration
    );
  }

  /**
   * 启动混沌实验
   */
  startChaosExperiment(experimentId: string): ChaosExperiment | null {
    return this.istio.startChaosExperiment(experimentId);
  }

  /**
   * 停止混沌实验
   */
  stopChaosExperiment(experimentId: string): ChaosExperiment | null {
    return this.istio.stopChaosExperiment(experimentId);
  }

  /**
   * 获取所有混沌实验
   */
  getAllChaosExperiments(): ChaosExperiment[] {
    return this.istio.getAllChaosExperiments();
  }

  // ============ 追踪管理 ============

  /**
   * 查询追踪
   */
  queryTraces(options: {
    service?: string;
    operation?: string;
    minDuration?: number;
    maxDuration?: number;
    limit?: number;
  }): TraceSpan[] {
    return this.istio.queryTraces(options);
  }

  /**
   * 获取追踪统计
   */
  getTraceStats(): {
    totalTraces: number;
    avgDuration: number;
    errorRate: number;
    topOperations: { operation: string; count: number }[];
  } {
    return this.istio.getTraceStats();
  }

  // ============ 流量管理 ============

  /**
   * 配置流量镜像
   */
  configureMirroring(service: string, mirrorHost: string, percentage: number = 100): void {
    this.istio.configureMirroring(service, mirrorHost, percentage);
  }

  /**
   * 移除流量镜像
   */
  removeMirroring(service: string): void {
    this.istio.removeMirroring(service);
  }

  /**
   * 配置熔断器
   */
  configureCircuitBreaker(
    service: string,
    config: {
      consecutiveErrors: number;
      interval: string;
      baseEjectionTime: string;
      maxEjectionPercent: number;
    }
  ): void {
    this.istio.configureCircuitBreaker(service, config);
  }

  /**
   * 配置重试策略
   */
  configureRetry(
    service: string,
    config: {
      attempts: number;
      perTryTimeout: string;
      retryOn: string;
    }
  ): void {
    this.istio.configureRetry(service, config);
  }

  // ============ mTLS 管理 ============

  /**
   * 设置 mTLS 模式
   */
  setMTLSMode(
    namespace: string,
    mode: 'STRICT' | 'PERMISSIVE' | 'DISABLE'
  ): void {
    this.istio.setMTLSMode(namespace, mode);
  }

  /**
   * 获取 mTLS 状态
   */
  getMTLSStatus(namespace: string): { mode: string; enabled: boolean } {
    return this.istio.getMTLSStatus(namespace);
  }

  // ============ 路由和服务管理 ============

  /**
   * 获取所有路由
   */
  getAllRoutes(): Route[] {
    return this.kong.getAllRoutes();
  }

  /**
   * 获取所有服务
   */
  getAllServices(): Service[] {
    return this.kong.getAllServices();
  }

  // ============ 统计和监控 ============

  /**
   * 获取统一统计信息
   */
  getStats(): UnifiedGatewayStats {
    const kongStats = this.kong.getStats();
    const istioStats = this.istio.getStats();

    return {
      kong: kongStats,
      istio: istioStats,
      combined: {
        totalRequests: this.requestCount,
        totalServices: kongStats.totalRequests > 0 ? this.kong.getAllServices().length : 0,
        healthyServices: this.kong.getAllServices().length,
        activeCanaries: istioStats.canaryDeployments,
        activeExperiments: istioStats.activeExperiments,
      },
    };
  }

  /**
   * 获取状态
   */
  getStatus(): {
    initialized: boolean;
    kong: ReturnType<KongGateway['getStatus']>;
    istio: ReturnType<IstioMesh['getStatus']>;
    requestCount: number;
    errorCount: number;
    errorRate: number;
  } {
    return {
      initialized: this.isInitialized,
      kong: this.kong.getStatus(),
      istio: this.istio.getStatus(),
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    kong: Awaited<ReturnType<KongGateway['healthCheck']>>;
    istio: Awaited<ReturnType<IstioMesh['healthCheck']>>;
  }> {
    const kongHealth = await this.kong.healthCheck();
    const istioHealth = await this.istio.healthCheck();

    return {
      healthy: this.isInitialized && kongHealth.healthy && istioHealth.healthy,
      kong: kongHealth,
      istio: istioHealth,
    };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.kong.resetStats();
    this.requestCount = 0;
    this.errorCount = 0;
  }
}

// 导出单例
export const gatewayManager = new GatewayManager();
