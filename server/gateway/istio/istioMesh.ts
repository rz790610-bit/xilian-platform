/**
 * Istio 服务网格配置服务
 * 
 * 功能：
 * - mTLS 双向认证
 * - Canary 发布（10%-50%-100%）
 * - Jaeger 分布式追踪
 * - 混沌工程（故障注入）
 * - 流量镜像
 * - 熔断和重试策略
 */

// ============ 类型定义 ============

export interface IstioConfig {
  namespace: string;
  meshId: string;
  trustDomain: string;
  jaeger: {
    endpoint: string;
    samplingRate: number;
  };
  mtls: {
    mode: 'STRICT' | 'PERMISSIVE' | 'DISABLE';
  };
}

export interface VirtualService {
  name: string;
  namespace: string;
  hosts: string[];
  gateways?: string[];
  http: HTTPRoute[];
}

export interface HTTPRoute {
  name?: string;
  match?: HTTPMatchRequest[];
  route: HTTPRouteDestination[];
  timeout?: string;
  retries?: RetryPolicy;
  fault?: FaultInjection;
  mirror?: Destination;
  mirrorPercentage?: { value: number };
  headers?: HeaderOperations;
}

export interface HTTPMatchRequest {
  uri?: StringMatch;
  headers?: Record<string, StringMatch>;
  method?: StringMatch;
  sourceLabels?: Record<string, string>;
}

export interface StringMatch {
  exact?: string;
  prefix?: string;
  regex?: string;
}

export interface HTTPRouteDestination {
  destination: Destination;
  weight: number;
  headers?: HeaderOperations;
}

export interface Destination {
  host: string;
  port?: { number: number };
  subset?: string;
}

export interface RetryPolicy {
  attempts: number;
  perTryTimeout: string;
  retryOn: string;
}

export interface FaultInjection {
  delay?: {
    percentage: { value: number };
    fixedDelay: string;
  };
  abort?: {
    percentage: { value: number };
    httpStatus: number;
  };
}

export interface HeaderOperations {
  request?: {
    set?: Record<string, string>;
    add?: Record<string, string>;
    remove?: string[];
  };
  response?: {
    set?: Record<string, string>;
    add?: Record<string, string>;
    remove?: string[];
  };
}

export interface DestinationRule {
  name: string;
  namespace: string;
  host: string;
  trafficPolicy?: TrafficPolicy;
  subsets: Subset[];
}

export interface TrafficPolicy {
  connectionPool?: ConnectionPool;
  loadBalancer?: LoadBalancer;
  outlierDetection?: OutlierDetection;
  tls?: TLSSettings;
}

export interface ConnectionPool {
  tcp?: {
    maxConnections: number;
    connectTimeout: string;
  };
  http?: {
    h2UpgradePolicy?: 'DEFAULT' | 'DO_NOT_UPGRADE' | 'UPGRADE';
    http1MaxPendingRequests: number;
    http2MaxRequests: number;
    maxRequestsPerConnection: number;
    maxRetries: number;
  };
}

export interface LoadBalancer {
  simple?: 'ROUND_ROBIN' | 'LEAST_CONN' | 'RANDOM' | 'PASSTHROUGH';
  consistentHash?: {
    httpHeaderName?: string;
    httpCookie?: { name: string; ttl: string };
    useSourceIp?: boolean;
  };
}

export interface OutlierDetection {
  consecutiveErrors: number;
  interval: string;
  baseEjectionTime: string;
  maxEjectionPercent: number;
  minHealthPercent: number;
}

export interface TLSSettings {
  mode: 'DISABLE' | 'SIMPLE' | 'MUTUAL' | 'ISTIO_MUTUAL';
  clientCertificate?: string;
  privateKey?: string;
  caCertificates?: string;
}

export interface Subset {
  name: string;
  labels: Record<string, string>;
  trafficPolicy?: TrafficPolicy;
}

export interface PeerAuthentication {
  name: string;
  namespace: string;
  selector?: { matchLabels: Record<string, string> };
  mtls: { mode: 'STRICT' | 'PERMISSIVE' | 'DISABLE' };
  portLevelMtls?: Record<number, { mode: 'STRICT' | 'PERMISSIVE' | 'DISABLE' }>;
}

export interface AuthorizationPolicy {
  name: string;
  namespace: string;
  selector?: { matchLabels: Record<string, string> };
  action: 'ALLOW' | 'DENY' | 'AUDIT';
  rules: AuthorizationRule[];
}

export interface AuthorizationRule {
  from?: { source: AuthorizationSource }[];
  to?: { operation: AuthorizationOperation }[];
  when?: AuthorizationCondition[];
}

export interface AuthorizationSource {
  principals?: string[];
  notPrincipals?: string[];
  requestPrincipals?: string[];
  namespaces?: string[];
  ipBlocks?: string[];
}

export interface AuthorizationOperation {
  hosts?: string[];
  ports?: string[];
  methods?: string[];
  paths?: string[];
}

export interface AuthorizationCondition {
  key: string;
  values?: string[];
  notValues?: string[];
}

export interface CanaryDeployment {
  name: string;
  namespace: string;
  service: string;
  stableVersion: string;
  canaryVersion: string;
  stages: CanaryStage[];
  currentStage: number;
  status: 'pending' | 'in_progress' | 'completed' | 'rollback';
  metrics: CanaryMetrics;
}

export interface CanaryStage {
  weight: number;
  duration: string;
  analysis?: {
    successRate: number;
    latencyP99: number;
  };
}

export interface CanaryMetrics {
  successRate: number;
  latencyP50: number;
  latencyP99: number;
  requestCount: number;
  errorCount: number;
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  duration: number;
  tags: Record<string, string>;
  logs: { timestamp: number; fields: Record<string, string> }[];
  status: 'ok' | 'error';
}

export interface ChaosExperiment {
  id: string;
  name: string;
  namespace: string;
  targetService: string;
  type: 'delay' | 'abort' | 'partition';
  config: {
    percentage: number;
    delay?: string;
    httpStatus?: number;
  };
  duration: string;
  status: 'pending' | 'running' | 'completed' | 'aborted';
  startTime?: number;
  endTime?: number;
  results?: {
    affectedRequests: number;
    successRate: number;
    avgLatency: number;
  };
}

export interface MeshStats {
  totalServices: number;
  totalPods: number;
  mtlsEnabled: number;
  canaryDeployments: number;
  activeExperiments: number;
  tracesCollected: number;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: IstioConfig = {
  namespace: process.env.ISTIO_NAMESPACE || 'istio-system',
  meshId: process.env.MESH_ID || 'xilian-mesh',
  trustDomain: process.env.TRUST_DOMAIN || 'cluster.local',
  jaeger: {
    endpoint: process.env.JAEGER_ENDPOINT || 'http://jaeger-collector.istio-system:14268/api/traces',
    samplingRate: parseFloat(process.env.JAEGER_SAMPLING_RATE || '0.1'),
  },
  mtls: {
    mode: (process.env.MTLS_MODE as 'STRICT' | 'PERMISSIVE' | 'DISABLE') || 'STRICT',
  },
};

// ============ 西联平台 VirtualService 配置 ============

export const XILIAN_VIRTUAL_SERVICES: VirtualService[] = [
  {
    name: 'xilian-api',
    namespace: 'default',
    hosts: ['xilian-api'],
    http: [
      {
        name: 'primary',
        route: [
          {
            destination: { host: 'xilian-api', subset: 'stable' },
            weight: 100,
          },
        ],
        timeout: '30s',
        retries: {
          attempts: 3,
          perTryTimeout: '10s',
          retryOn: 'connect-failure,refused-stream,unavailable,cancelled,retriable-4xx,retriable-status-codes',
        },
      },
    ],
  },
  {
    name: 'xilian-realtime',
    namespace: 'default',
    hosts: ['xilian-realtime'],
    http: [
      {
        name: 'websocket',
        match: [{ uri: { prefix: '/ws' } }],
        route: [
          {
            destination: { host: 'xilian-realtime', subset: 'stable' },
            weight: 100,
          },
        ],
        timeout: '0s', // WebSocket 无超时
      },
    ],
  },
];

// ============ 西联平台 DestinationRule 配置 ============

export const XILIAN_DESTINATION_RULES: DestinationRule[] = [
  {
    name: 'xilian-api',
    namespace: 'default',
    host: 'xilian-api',
    trafficPolicy: {
      connectionPool: {
        tcp: {
          maxConnections: 1000,
          connectTimeout: '5s',
        },
        http: {
          h2UpgradePolicy: 'UPGRADE',
          http1MaxPendingRequests: 100,
          http2MaxRequests: 1000,
          maxRequestsPerConnection: 100,
          maxRetries: 3,
        },
      },
      loadBalancer: {
        simple: 'ROUND_ROBIN',
      },
      outlierDetection: {
        consecutiveErrors: 5,
        interval: '10s',
        baseEjectionTime: '30s',
        maxEjectionPercent: 50,
        minHealthPercent: 30,
      },
      tls: {
        mode: 'ISTIO_MUTUAL',
      },
    },
    subsets: [
      {
        name: 'stable',
        labels: { version: 'stable' },
      },
      {
        name: 'canary',
        labels: { version: 'canary' },
      },
    ],
  },
];

// ============ 西联平台 PeerAuthentication 配置 ============

export const XILIAN_PEER_AUTH: PeerAuthentication[] = [
  {
    name: 'default',
    namespace: 'default',
    mtls: { mode: 'STRICT' },
  },
  {
    name: 'xilian-api',
    namespace: 'default',
    selector: { matchLabels: { app: 'xilian-api' } },
    mtls: { mode: 'STRICT' },
  },
];

// ============ Istio 服务网格服务 ============

export class IstioMesh {
  private config: IstioConfig;
  private virtualServices: Map<string, VirtualService> = new Map();
  private destinationRules: Map<string, DestinationRule> = new Map();
  private peerAuthentications: Map<string, PeerAuthentication> = new Map();
  private authorizationPolicies: Map<string, AuthorizationPolicy> = new Map();
  private canaryDeployments: Map<string, CanaryDeployment> = new Map();
  private chaosExperiments: Map<string, ChaosExperiment> = new Map();
  private traces: TraceSpan[] = [];
  private stats: MeshStats = {
    totalServices: 0,
    totalPods: 0,
    mtlsEnabled: 0,
    canaryDeployments: 0,
    activeExperiments: 0,
    tracesCollected: 0,
  };
  private isInitialized: boolean = false;

  constructor(config?: Partial<IstioConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化服务网格
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[IstioMesh] Already initialized');
      return;
    }

    console.log('[IstioMesh] Initializing...');

    try {
      // 加载默认配置
      this.loadDefaultConfig();

      this.isInitialized = true;
      console.log('[IstioMesh] Initialized successfully');
    } catch (error) {
      console.error('[IstioMesh] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * 加载默认配置
   */
  private loadDefaultConfig(): void {
    // 加载 VirtualService
    for (const vs of XILIAN_VIRTUAL_SERVICES) {
      this.virtualServices.set(vs.name, vs);
    }

    // 加载 DestinationRule
    for (const dr of XILIAN_DESTINATION_RULES) {
      this.destinationRules.set(dr.name, dr);
    }

    // 加载 PeerAuthentication
    for (const pa of XILIAN_PEER_AUTH) {
      this.peerAuthentications.set(pa.name, pa);
    }

    this.stats.totalServices = this.virtualServices.size;
    this.stats.mtlsEnabled = this.peerAuthentications.size;

    console.log(`[IstioMesh] Loaded ${this.virtualServices.size} virtual services, ${this.destinationRules.size} destination rules`);
  }

  /**
   * 关闭服务网格
   */
  async close(): Promise<void> {
    this.isInitialized = false;
    console.log('[IstioMesh] Closed');
  }

  // ============ mTLS 管理 ============

  /**
   * 设置 mTLS 模式
   */
  setMTLSMode(
    namespace: string,
    mode: 'STRICT' | 'PERMISSIVE' | 'DISABLE',
    selector?: Record<string, string>
  ): PeerAuthentication {
    const name = selector ? `mtls-${Object.values(selector).join('-')}` : `mtls-${namespace}`;
    
    const peerAuth: PeerAuthentication = {
      name,
      namespace,
      selector: selector ? { matchLabels: selector } : undefined,
      mtls: { mode },
    };

    this.peerAuthentications.set(name, peerAuth);
    console.log(`[IstioMesh] mTLS mode set to ${mode} for ${namespace}`);

    return peerAuth;
  }

  /**
   * 获取 mTLS 状态
   */
  getMTLSStatus(namespace: string): { mode: string; enabled: boolean } {
    const peerAuth = Array.from(this.peerAuthentications.values())
      .find(pa => pa.namespace === namespace && !pa.selector);

    return {
      mode: peerAuth?.mtls.mode || 'DISABLE',
      enabled: peerAuth?.mtls.mode === 'STRICT' || peerAuth?.mtls.mode === 'PERMISSIVE',
    };
  }

  // ============ Canary 发布 ============

  /**
   * 创建 Canary 发布
   */
  createCanaryDeployment(
    service: string,
    namespace: string,
    stableVersion: string,
    canaryVersion: string,
    stages: CanaryStage[] = [
      { weight: 10, duration: '5m' },
      { weight: 50, duration: '10m' },
      { weight: 100, duration: '0s' },
    ]
  ): CanaryDeployment {
    const deployment: CanaryDeployment = {
      name: `${service}-canary`,
      namespace,
      service,
      stableVersion,
      canaryVersion,
      stages,
      currentStage: 0,
      status: 'pending',
      metrics: {
        successRate: 100,
        latencyP50: 0,
        latencyP99: 0,
        requestCount: 0,
        errorCount: 0,
      },
    };

    this.canaryDeployments.set(deployment.name, deployment);
    this.stats.canaryDeployments = this.canaryDeployments.size;

    // 更新 VirtualService 权重
    this.updateCanaryWeights(service, stages[0].weight);

    console.log(`[IstioMesh] Canary deployment created: ${deployment.name}`);
    return deployment;
  }

  /**
   * 推进 Canary 阶段
   */
  advanceCanaryStage(deploymentName: string): CanaryDeployment | null {
    const deployment = this.canaryDeployments.get(deploymentName);
    if (!deployment) return null;

    if (deployment.currentStage >= deployment.stages.length - 1) {
      deployment.status = 'completed';
      console.log(`[IstioMesh] Canary deployment completed: ${deploymentName}`);
      return deployment;
    }

    deployment.currentStage++;
    deployment.status = 'in_progress';
    const newWeight = deployment.stages[deployment.currentStage].weight;

    this.updateCanaryWeights(deployment.service, newWeight);

    console.log(`[IstioMesh] Canary advanced to stage ${deployment.currentStage} (${newWeight}%)`);
    return deployment;
  }

  /**
   * 回滚 Canary 发布
   */
  rollbackCanary(deploymentName: string): CanaryDeployment | null {
    const deployment = this.canaryDeployments.get(deploymentName);
    if (!deployment) return null;

    deployment.status = 'rollback';
    deployment.currentStage = 0;

    // 将所有流量切回 stable
    this.updateCanaryWeights(deployment.service, 0);

    console.log(`[IstioMesh] Canary rolled back: ${deploymentName}`);
    return deployment;
  }

  /**
   * 更新 Canary 权重
   */
  private updateCanaryWeights(service: string, canaryWeight: number): void {
    const vs = this.virtualServices.get(service);
    if (!vs) return;

    const stableWeight = 100 - canaryWeight;

    vs.http = vs.http.map(route => ({
      ...route,
      route: [
        {
          destination: { host: service, subset: 'stable' },
          weight: stableWeight,
        },
        {
          destination: { host: service, subset: 'canary' },
          weight: canaryWeight,
        },
      ].filter(r => r.weight > 0),
    }));

    this.virtualServices.set(service, vs);
  }

  /**
   * 获取 Canary 发布状态
   */
  getCanaryDeployment(deploymentName: string): CanaryDeployment | undefined {
    return this.canaryDeployments.get(deploymentName);
  }

  /**
   * 获取所有 Canary 发布
   */
  getAllCanaryDeployments(): CanaryDeployment[] {
    return Array.from(this.canaryDeployments.values());
  }

  // ============ Jaeger 分布式追踪 ============

  /**
   * 创建追踪 Span
   */
  createSpan(
    operationName: string,
    serviceName: string,
    parentSpanId?: string,
    traceId?: string
  ): TraceSpan {
    const span: TraceSpan = {
      traceId: traceId || this.generateId(),
      spanId: this.generateId(),
      parentSpanId,
      operationName,
      serviceName,
      startTime: Date.now(),
      duration: 0,
      tags: {},
      logs: [],
      status: 'ok',
    };

    return span;
  }

  /**
   * 完成追踪 Span
   */
  finishSpan(span: TraceSpan, status: 'ok' | 'error' = 'ok'): void {
    span.duration = Date.now() - span.startTime;
    span.status = status;

    // 根据采样率决定是否保存
    if (Math.random() < this.config.jaeger.samplingRate) {
      this.traces.push(span);
      this.stats.tracesCollected++;

      // 限制追踪数量
      if (this.traces.length > 10000) {
        this.traces = this.traces.slice(-5000);
      }
    }
  }

  /**
   * 添加 Span 标签
   */
  addSpanTag(span: TraceSpan, key: string, value: string): void {
    span.tags[key] = value;
  }

  /**
   * 添加 Span 日志
   */
  addSpanLog(span: TraceSpan, fields: Record<string, string>): void {
    span.logs.push({
      timestamp: Date.now(),
      fields,
    });
  }

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
    let results = [...this.traces];

    if (options.service) {
      results = results.filter(t => t.serviceName === options.service);
    }

    if (options.operation) {
      results = results.filter(t => t.operationName.includes(options.operation!));
    }

    if (options.minDuration !== undefined) {
      results = results.filter(t => t.duration >= options.minDuration!);
    }

    if (options.maxDuration !== undefined) {
      results = results.filter(t => t.duration <= options.maxDuration!);
    }

    // 按时间倒序
    results.sort((a, b) => b.startTime - a.startTime);

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
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
    const total = this.traces.length;
    const avgDuration = total > 0
      ? this.traces.reduce((sum, t) => sum + t.duration, 0) / total
      : 0;
    const errorCount = this.traces.filter(t => t.status === 'error').length;
    const errorRate = total > 0 ? errorCount / total : 0;

    // 统计 top operations
    const opCounts = new Map<string, number>();
    for (const trace of this.traces) {
      const count = opCounts.get(trace.operationName) || 0;
      opCounts.set(trace.operationName, count + 1);
    }

    const topOperations = Array.from(opCounts.entries())
      .map(([operation, count]) => ({ operation, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { totalTraces: total, avgDuration, errorRate, topOperations };
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  // ============ 混沌工程 ============

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
    const experiment: ChaosExperiment = {
      id: this.generateId(),
      name,
      namespace,
      targetService,
      type,
      config,
      duration,
      status: 'pending',
    };

    this.chaosExperiments.set(experiment.id, experiment);
    console.log(`[IstioMesh] Chaos experiment created: ${name}`);

    return experiment;
  }

  /**
   * 启动混沌实验
   */
  startChaosExperiment(experimentId: string): ChaosExperiment | null {
    const experiment = this.chaosExperiments.get(experimentId);
    if (!experiment) return null;

    experiment.status = 'running';
    experiment.startTime = Date.now();
    this.stats.activeExperiments++;

    // 应用故障注入到 VirtualService
    this.applyFaultInjection(experiment);

    console.log(`[IstioMesh] Chaos experiment started: ${experiment.name}`);
    return experiment;
  }

  /**
   * 停止混沌实验
   */
  stopChaosExperiment(experimentId: string): ChaosExperiment | null {
    const experiment = this.chaosExperiments.get(experimentId);
    if (!experiment) return null;

    experiment.status = 'completed';
    experiment.endTime = Date.now();
    this.stats.activeExperiments = Math.max(0, this.stats.activeExperiments - 1);

    // 移除故障注入
    this.removeFaultInjection(experiment);

    console.log(`[IstioMesh] Chaos experiment stopped: ${experiment.name}`);
    return experiment;
  }

  /**
   * 应用故障注入
   */
  private applyFaultInjection(experiment: ChaosExperiment): void {
    const vs = this.virtualServices.get(experiment.targetService);
    if (!vs) return;

    const fault: FaultInjection = {};

    switch (experiment.type) {
      case 'delay':
        fault.delay = {
          percentage: { value: experiment.config.percentage },
          fixedDelay: experiment.config.delay || '5s',
        };
        break;
      case 'abort':
        fault.abort = {
          percentage: { value: experiment.config.percentage },
          httpStatus: experiment.config.httpStatus || 500,
        };
        break;
      case 'partition':
        // 网络分区模拟：100% 延迟
        fault.delay = {
          percentage: { value: experiment.config.percentage },
          fixedDelay: '60s',
        };
        break;
    }

    vs.http = vs.http.map(route => ({
      ...route,
      fault,
    }));

    this.virtualServices.set(experiment.targetService, vs);
  }

  /**
   * 移除故障注入
   */
  private removeFaultInjection(experiment: ChaosExperiment): void {
    const vs = this.virtualServices.get(experiment.targetService);
    if (!vs) return;

    vs.http = vs.http.map(route => {
      const { fault, ...rest } = route;
      return rest;
    });

    this.virtualServices.set(experiment.targetService, vs);
  }

  /**
   * 获取混沌实验
   */
  getChaosExperiment(experimentId: string): ChaosExperiment | undefined {
    return this.chaosExperiments.get(experimentId);
  }

  /**
   * 获取所有混沌实验
   */
  getAllChaosExperiments(): ChaosExperiment[] {
    return Array.from(this.chaosExperiments.values());
  }

  // ============ 流量镜像 ============

  /**
   * 配置流量镜像
   */
  configureMirroring(
    service: string,
    mirrorHost: string,
    percentage: number = 100
  ): void {
    const vs = this.virtualServices.get(service);
    if (!vs) return;

    vs.http = vs.http.map(route => ({
      ...route,
      mirror: { host: mirrorHost },
      mirrorPercentage: { value: percentage },
    }));

    this.virtualServices.set(service, vs);
    console.log(`[IstioMesh] Traffic mirroring configured: ${service} -> ${mirrorHost} (${percentage}%)`);
  }

  /**
   * 移除流量镜像
   */
  removeMirroring(service: string): void {
    const vs = this.virtualServices.get(service);
    if (!vs) return;

    vs.http = vs.http.map(route => {
      const { mirror, mirrorPercentage, ...rest } = route;
      return rest;
    });

    this.virtualServices.set(service, vs);
    console.log(`[IstioMesh] Traffic mirroring removed: ${service}`);
  }

  // ============ 熔断和重试 ============

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
    const dr = this.destinationRules.get(service);
    if (!dr) return;

    dr.trafficPolicy = {
      ...dr.trafficPolicy,
      outlierDetection: {
        ...config,
        minHealthPercent: 30,
      },
    };

    this.destinationRules.set(service, dr);
    console.log(`[IstioMesh] Circuit breaker configured: ${service}`);
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
    const vs = this.virtualServices.get(service);
    if (!vs) return;

    vs.http = vs.http.map(route => ({
      ...route,
      retries: config,
    }));

    this.virtualServices.set(service, vs);
    console.log(`[IstioMesh] Retry policy configured: ${service}`);
  }

  // ============ VirtualService 管理 ============

  /**
   * 添加 VirtualService
   */
  addVirtualService(vs: VirtualService): void {
    this.virtualServices.set(vs.name, vs);
    this.stats.totalServices = this.virtualServices.size;
    console.log(`[IstioMesh] VirtualService added: ${vs.name}`);
  }

  /**
   * 获取 VirtualService
   */
  getVirtualService(name: string): VirtualService | undefined {
    return this.virtualServices.get(name);
  }

  /**
   * 获取所有 VirtualService
   */
  getAllVirtualServices(): VirtualService[] {
    return Array.from(this.virtualServices.values());
  }

  // ============ DestinationRule 管理 ============

  /**
   * 添加 DestinationRule
   */
  addDestinationRule(dr: DestinationRule): void {
    this.destinationRules.set(dr.name, dr);
    console.log(`[IstioMesh] DestinationRule added: ${dr.name}`);
  }

  /**
   * 获取 DestinationRule
   */
  getDestinationRule(name: string): DestinationRule | undefined {
    return this.destinationRules.get(name);
  }

  /**
   * 获取所有 DestinationRule
   */
  getAllDestinationRules(): DestinationRule[] {
    return Array.from(this.destinationRules.values());
  }

  // ============ 统计和监控 ============

  /**
   * 获取统计信息
   */
  getStats(): MeshStats {
    return { ...this.stats };
  }

  /**
   * 获取状态
   */
  getStatus(): {
    initialized: boolean;
    config: IstioConfig;
    virtualServices: number;
    destinationRules: number;
    peerAuthentications: number;
    canaryDeployments: number;
    chaosExperiments: number;
    traces: number;
  } {
    return {
      initialized: this.isInitialized,
      config: this.config,
      virtualServices: this.virtualServices.size,
      destinationRules: this.destinationRules.size,
      peerAuthentications: this.peerAuthentications.size,
      canaryDeployments: this.canaryDeployments.size,
      chaosExperiments: this.chaosExperiments.size,
      traces: this.traces.length,
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    mtls: boolean;
    services: boolean;
    tracing: boolean;
  }> {
    return {
      healthy: this.isInitialized,
      mtls: this.peerAuthentications.size > 0,
      services: this.virtualServices.size > 0,
      tracing: this.config.jaeger.samplingRate > 0,
    };
  }
}

// 导出单例
export const istioMesh = new IstioMesh();
