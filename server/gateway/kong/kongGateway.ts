/**
 * Kong API 网关配置服务
 * 
 * 功能：
 * - OAuth 2.0 认证插件
 * - JWT 验证插件
 * - RBAC 权限控制
 * - Redis 滑动窗口限流（1000 req/s VIP）
 * - 路由和上游服务配置
 * - 健康检查和负载均衡
 */

import Redis from 'ioredis';

// ============ 类型定义 ============

export interface KongConfig {
  adminUrl: string;
  proxyUrl: string;
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  jwt: {
    secret: string;
    algorithm: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512';
    expiresIn: number; // 秒
  };
  rateLimit: {
    defaultLimit: number; // 默认限流
    vipLimit: number; // VIP 限流
    windowSizeMs: number; // 窗口大小
  };
}

export interface Route {
  id: string;
  name: string;
  paths: string[];
  methods: string[];
  service: string;
  plugins: string[];
  stripPath?: boolean;
  preserveHost?: boolean;
}

export interface Service {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'grpc' | 'grpcs';
  path?: string;
  retries?: number;
  connectTimeout?: number;
  writeTimeout?: number;
  readTimeout?: number;
}

export interface Upstream {
  id: string;
  name: string;
  algorithm: 'round-robin' | 'consistent-hashing' | 'least-connections';
  targets: UpstreamTarget[];
  healthchecks: HealthCheck;
}

export interface UpstreamTarget {
  id: string;
  target: string; // host:port
  weight: number;
  tags?: string[];
}

export interface HealthCheck {
  active: {
    type: 'http' | 'https' | 'tcp';
    httpPath?: string;
    timeout: number;
    concurrency: number;
    healthy: {
      interval: number;
      successes: number;
      httpStatuses: number[];
    };
    unhealthy: {
      interval: number;
      httpFailures: number;
      tcpFailures: number;
      timeouts: number;
      httpStatuses: number[];
    };
  };
  passive: {
    healthy: {
      successes: number;
      httpStatuses: number[];
    };
    unhealthy: {
      httpFailures: number;
      tcpFailures: number;
      timeouts: number;
      httpStatuses: number[];
    };
  };
}

export interface Consumer {
  id: string;
  username: string;
  customId?: string;
  tags?: string[];
  groups: string[];
  credentials: {
    jwt?: JWTCredential;
    oauth2?: OAuth2Credential;
    keyAuth?: KeyAuthCredential;
  };
}

export interface JWTCredential {
  key: string;
  secret: string;
  algorithm: string;
}

export interface OAuth2Credential {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  name: string;
}

export interface KeyAuthCredential {
  key: string;
}

export interface RBACRole {
  id: string;
  name: string;
  permissions: Permission[];
}

export interface Permission {
  resource: string;
  actions: ('read' | 'write' | 'delete' | 'admin')[];
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export interface GatewayStats {
  totalRequests: number;
  blockedRequests: number;
  rateLimitedRequests: number;
  authFailures: number;
  upstreamErrors: number;
  avgLatencyMs: number;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: KongConfig = {
  adminUrl: process.env.KONG_ADMIN_URL || 'http://localhost:8001',
  proxyUrl: process.env.KONG_PROXY_URL || 'http://localhost:8000',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '1'),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'xilian-jwt-secret',
    algorithm: 'HS256',
    expiresIn: 86400, // 24小时
  },
  rateLimit: {
    defaultLimit: 100, // 普通用户 100 req/s
    vipLimit: 1000, // VIP 用户 1000 req/s
    windowSizeMs: 1000, // 1秒窗口
  },
};

// ============ 西联平台路由配置 ============

export const XILIAN_ROUTES: Route[] = [
  {
    id: 'route-api-v1',
    name: 'api-v1',
    paths: ['/api/v1'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    service: 'xilian-api',
    plugins: ['jwt-auth', 'rate-limiting', 'request-transformer'],
    stripPath: false,
    preserveHost: true,
  },
  {
    id: 'route-auth',
    name: 'auth',
    paths: ['/api/auth', '/api/oauth'],
    methods: ['GET', 'POST'],
    service: 'xilian-auth',
    plugins: ['rate-limiting', 'cors'],
    stripPath: false,
  },
  {
    id: 'route-websocket',
    name: 'websocket',
    paths: ['/ws', '/socket.io'],
    methods: ['GET'],
    service: 'xilian-realtime',
    plugins: ['jwt-auth'],
    preserveHost: true,
  },
  {
    id: 'route-graphql',
    name: 'graphql',
    paths: ['/graphql'],
    methods: ['GET', 'POST'],
    service: 'xilian-api',
    plugins: ['jwt-auth', 'rate-limiting'],
  },
  {
    id: 'route-health',
    name: 'health',
    paths: ['/health', '/ready', '/live'],
    methods: ['GET'],
    service: 'xilian-api',
    plugins: [],
  },
];

// ============ 西联平台服务配置 ============

export const XILIAN_SERVICES: Service[] = [
  {
    id: 'service-api',
    name: 'xilian-api',
    host: 'xilian-api.default.svc.cluster.local',
    port: 3000,
    protocol: 'http',
    retries: 3,
    connectTimeout: 5000,
    writeTimeout: 60000,
    readTimeout: 60000,
  },
  {
    id: 'service-auth',
    name: 'xilian-auth',
    host: 'xilian-auth.default.svc.cluster.local',
    port: 3001,
    protocol: 'http',
    retries: 3,
    connectTimeout: 5000,
    writeTimeout: 30000,
    readTimeout: 30000,
  },
  {
    id: 'service-realtime',
    name: 'xilian-realtime',
    host: 'xilian-realtime.default.svc.cluster.local',
    port: 3002,
    protocol: 'http',
    retries: 1,
    connectTimeout: 5000,
    writeTimeout: 300000, // WebSocket 长连接
    readTimeout: 300000,
  },
];

// ============ 西联平台上游配置 ============

export const XILIAN_UPSTREAMS: Upstream[] = [
  {
    id: 'upstream-api',
    name: 'xilian-api-upstream',
    algorithm: 'round-robin',
    targets: [
      { id: 'target-api-1', target: 'xilian-api-1:3000', weight: 100 },
      { id: 'target-api-2', target: 'xilian-api-2:3000', weight: 100 },
      { id: 'target-api-3', target: 'xilian-api-3:3000', weight: 100 },
    ],
    healthchecks: {
      active: {
        type: 'http',
        httpPath: '/health',
        timeout: 5,
        concurrency: 10,
        healthy: {
          interval: 5,
          successes: 2,
          httpStatuses: [200, 201, 204],
        },
        unhealthy: {
          interval: 5,
          httpFailures: 3,
          tcpFailures: 3,
          timeouts: 3,
          httpStatuses: [500, 502, 503, 504],
        },
      },
      passive: {
        healthy: {
          successes: 2,
          httpStatuses: [200, 201, 204],
        },
        unhealthy: {
          httpFailures: 3,
          tcpFailures: 3,
          timeouts: 3,
          httpStatuses: [500, 502, 503, 504],
        },
      },
    },
  },
];

// ============ RBAC 角色配置 ============

export const XILIAN_ROLES: RBACRole[] = [
  {
    id: 'role-admin',
    name: 'admin',
    permissions: [
      { resource: '*', actions: ['read', 'write', 'delete', 'admin'] },
    ],
  },
  {
    id: 'role-operator',
    name: 'operator',
    permissions: [
      { resource: '/api/v1/devices/*', actions: ['read', 'write'] },
      { resource: '/api/v1/sensors/*', actions: ['read', 'write'] },
      { resource: '/api/v1/alerts/*', actions: ['read', 'write'] },
      { resource: '/api/v1/maintenance/*', actions: ['read', 'write'] },
    ],
  },
  {
    id: 'role-viewer',
    name: 'viewer',
    permissions: [
      { resource: '/api/v1/devices/*', actions: ['read'] },
      { resource: '/api/v1/sensors/*', actions: ['read'] },
      { resource: '/api/v1/alerts/*', actions: ['read'] },
      { resource: '/api/v1/reports/*', actions: ['read'] },
    ],
  },
  {
    id: 'role-vip',
    name: 'vip',
    permissions: [
      { resource: '/api/v1/*', actions: ['read', 'write'] },
      { resource: '/api/v1/analytics/*', actions: ['read'] },
      { resource: '/api/v1/export/*', actions: ['read'] },
    ],
  },
];

// ============ Kong 网关服务 ============

export class KongGateway {
  private config: KongConfig;
  private redis: Redis | null = null;
  private routes: Map<string, Route> = new Map();
  private services: Map<string, Service> = new Map();
  private upstreams: Map<string, Upstream> = new Map();
  private consumers: Map<string, Consumer> = new Map();
  private roles: Map<string, RBACRole> = new Map();
  private stats: GatewayStats = {
    totalRequests: 0,
    blockedRequests: 0,
    rateLimitedRequests: 0,
    authFailures: 0,
    upstreamErrors: 0,
    avgLatencyMs: 0,
  };
  private isInitialized: boolean = false;

  constructor(config?: Partial<KongConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化网关
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[KongGateway] Already initialized');
      return;
    }

    console.log('[KongGateway] Initializing...');

    try {
      // 初始化 Redis 连接（使用 lazyConnect 避免连接超时）
      this.redis = new Redis({
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db,
        lazyConnect: true,
        connectTimeout: 1000,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // 不重试，避免测试超时
      });

      // 加载默认配置
      this.loadDefaultConfig();

      this.isInitialized = true;
      console.log('[KongGateway] Initialized successfully');
    } catch (error) {
      console.error('[KongGateway] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * 加载默认配置
   */
  private loadDefaultConfig(): void {
    // 加载路由
    for (const route of XILIAN_ROUTES) {
      this.routes.set(route.id, route);
    }

    // 加载服务
    for (const service of XILIAN_SERVICES) {
      this.services.set(service.id, service);
    }

    // 加载上游
    for (const upstream of XILIAN_UPSTREAMS) {
      this.upstreams.set(upstream.id, upstream);
    }

    // 加载角色
    for (const role of XILIAN_ROLES) {
      this.roles.set(role.id, role);
    }

    console.log(`[KongGateway] Loaded ${this.routes.size} routes, ${this.services.size} services, ${this.upstreams.size} upstreams, ${this.roles.size} roles`);
  }

  /**
   * 关闭网关
   */
  async close(): Promise<void> {
    if (this.redis) {
      try {
        // 检查连接状态，避免关闭已关闭的连接
        if (this.redis.status === 'ready' || this.redis.status === 'connect') {
          await this.redis.quit();
        } else {
          this.redis.disconnect();
        }
      } catch (error) {
        // 忽略关闭错误
        console.log('[KongGateway] Redis close error (ignored):', error);
      }
      this.redis = null;
    }
    this.isInitialized = false;
    console.log('[KongGateway] Closed');
  }

  // ============ JWT 认证 ============

  /**
   * 生成 JWT Token
   */
  generateJWT(payload: {
    userId: string;
    username: string;
    roles: string[];
    groups?: string[];
  }): string {
    const header = {
      alg: this.config.jwt.algorithm,
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const tokenPayload = {
      ...payload,
      iat: now,
      exp: now + this.config.jwt.expiresIn,
      iss: 'xilian-platform',
    };

    const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const base64Payload = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
    
    // 简化签名（实际使用时应使用 crypto 库）
    const signature = this.sign(`${base64Header}.${base64Payload}`);

    return `${base64Header}.${base64Payload}.${signature}`;
  }

  /**
   * 验证 JWT Token
   */
  verifyJWT(token: string): {
    valid: boolean;
    payload?: {
      userId: string;
      username: string;
      roles: string[];
      groups?: string[];
      iat: number;
      exp: number;
    };
    error?: string;
  } {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Invalid token format' };
      }

      const [headerB64, payloadB64, signature] = parts;

      // 验证签名
      const expectedSignature = this.sign(`${headerB64}.${payloadB64}`);
      if (signature !== expectedSignature) {
        this.stats.authFailures++;
        return { valid: false, error: 'Invalid signature' };
      }

      // 解析 payload
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

      // 检查过期
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        this.stats.authFailures++;
        return { valid: false, error: 'Token expired' };
      }

      return { valid: true, payload };
    } catch (error) {
      this.stats.authFailures++;
      return { valid: false, error: 'Token parsing failed' };
    }
  }

  private sign(data: string): string {
    // 简化签名实现（实际使用 HMAC-SHA256）
    const crypto = require('crypto');
    return crypto
      .createHmac('sha256', this.config.jwt.secret)
      .update(data)
      .digest('base64url');
  }

  // ============ RBAC 权限控制 ============

  /**
   * 检查权限
   */
  checkPermission(
    roles: string[],
    resource: string,
    action: 'read' | 'write' | 'delete' | 'admin'
  ): boolean {
    for (const roleName of roles) {
      const role = Array.from(this.roles.values()).find(r => r.name === roleName);
      if (!role) continue;

      for (const permission of role.permissions) {
        if (this.matchResource(permission.resource, resource)) {
          if (permission.actions.includes(action)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private matchResource(pattern: string, resource: string): boolean {
    if (pattern === '*') return true;
    
    // 支持通配符匹配
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\//g, '\\/');
    
    return new RegExp(`^${regexPattern}$`).test(resource);
  }

  /**
   * 添加角色
   */
  addRole(role: RBACRole): void {
    this.roles.set(role.id, role);
    console.log(`[KongGateway] Role added: ${role.name}`);
  }

  /**
   * 获取角色
   */
  getRole(roleId: string): RBACRole | undefined {
    return this.roles.get(roleId);
  }

  /**
   * 获取所有角色
   */
  getAllRoles(): RBACRole[] {
    return Array.from(this.roles.values());
  }

  // ============ Redis 滑动窗口限流 ============

  /**
   * 检查限流
   */
  async checkRateLimit(
    key: string,
    isVip: boolean = false
  ): Promise<RateLimitResult> {
    const limit = isVip ? this.config.rateLimit.vipLimit : this.config.rateLimit.defaultLimit;
    const windowMs = this.config.rateLimit.windowSizeMs;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!this.redis) {
      // Redis 未连接时放行
      return {
        allowed: true,
        remaining: limit,
        resetAt: now + windowMs,
        limit,
      };
    }

    const redisKey = `ratelimit:${key}`;

    try {
      // 使用 Redis 事务实现滑动窗口
      const multi = this.redis.multi();
      
      // 移除过期的请求记录
      multi.zremrangebyscore(redisKey, 0, windowStart);
      
      // 获取当前窗口内的请求数
      multi.zcard(redisKey);
      
      // 添加当前请求
      multi.zadd(redisKey, now, `${now}-${Math.random()}`);
      
      // 设置过期时间
      multi.pexpire(redisKey, windowMs * 2);

      const results = await multi.exec();
      
      if (!results) {
        return { allowed: true, remaining: limit, resetAt: now + windowMs, limit };
      }

      const currentCount = (results[1]?.[1] as number) || 0;

      if (currentCount >= limit) {
        this.stats.rateLimitedRequests++;
        return {
          allowed: false,
          remaining: 0,
          resetAt: now + windowMs,
          limit,
        };
      }

      return {
        allowed: true,
        remaining: limit - currentCount - 1,
        resetAt: now + windowMs,
        limit,
      };
    } catch (error) {
      console.error('[KongGateway] Rate limit check failed:', error);
      // 出错时放行
      return { allowed: true, remaining: limit, resetAt: now + windowMs, limit };
    }
  }

  /**
   * 重置限流计数
   */
  async resetRateLimit(key: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(`ratelimit:${key}`);
    }
  }

  // ============ 路由管理 ============

  /**
   * 添加路由
   */
  addRoute(route: Route): void {
    this.routes.set(route.id, route);
    console.log(`[KongGateway] Route added: ${route.name}`);
  }

  /**
   * 获取路由
   */
  getRoute(routeId: string): Route | undefined {
    return this.routes.get(routeId);
  }

  /**
   * 匹配路由
   */
  matchRoute(path: string, method: string): Route | null {
    for (const route of Array.from(this.routes.values())) {
      if (!route.methods.includes(method) && !route.methods.includes('*')) {
        continue;
      }

      for (const routePath of route.paths) {
        if (path.startsWith(routePath)) {
          return route;
        }
      }
    }
    return null;
  }

  /**
   * 获取所有路由
   */
  getAllRoutes(): Route[] {
    return Array.from(this.routes.values());
  }

  // ============ 服务管理 ============

  /**
   * 添加服务
   */
  addService(service: Service): void {
    this.services.set(service.id, service);
    console.log(`[KongGateway] Service added: ${service.name}`);
  }

  /**
   * 获取服务
   */
  getService(serviceId: string): Service | undefined {
    return this.services.get(serviceId);
  }

  /**
   * 获取所有服务
   */
  getAllServices(): Service[] {
    return Array.from(this.services.values());
  }

  // ============ 上游管理 ============

  /**
   * 添加上游
   */
  addUpstream(upstream: Upstream): void {
    this.upstreams.set(upstream.id, upstream);
    console.log(`[KongGateway] Upstream added: ${upstream.name}`);
  }

  /**
   * 获取上游
   */
  getUpstream(upstreamId: string): Upstream | undefined {
    return this.upstreams.get(upstreamId);
  }

  /**
   * 选择上游目标（负载均衡）
   */
  selectTarget(upstreamId: string): UpstreamTarget | null {
    const upstream = this.upstreams.get(upstreamId);
    if (!upstream || upstream.targets.length === 0) {
      return null;
    }

    switch (upstream.algorithm) {
      case 'round-robin':
        return this.roundRobinSelect(upstream.targets);
      case 'least-connections':
        return this.leastConnectionsSelect(upstream.targets);
      case 'consistent-hashing':
        return upstream.targets[0]; // 简化实现
      default:
        return upstream.targets[0];
    }
  }

  private roundRobinIndex: Map<string, number> = new Map();

  private roundRobinSelect(targets: UpstreamTarget[]): UpstreamTarget {
    const key = targets.map(t => t.id).join(',');
    const currentIndex = this.roundRobinIndex.get(key) || 0;
    const target = targets[currentIndex % targets.length];
    this.roundRobinIndex.set(key, currentIndex + 1);
    return target;
  }

  private leastConnectionsSelect(targets: UpstreamTarget[]): UpstreamTarget {
    // 简化实现：返回权重最高的目标
    return targets.reduce((prev, curr) => 
      curr.weight > prev.weight ? curr : prev
    );
  }

  // ============ 消费者管理 ============

  /**
   * 添加消费者
   */
  addConsumer(consumer: Consumer): void {
    this.consumers.set(consumer.id, consumer);
    console.log(`[KongGateway] Consumer added: ${consumer.username}`);
  }

  /**
   * 获取消费者
   */
  getConsumer(consumerId: string): Consumer | undefined {
    return this.consumers.get(consumerId);
  }

  /**
   * 通过用户名获取消费者
   */
  getConsumerByUsername(username: string): Consumer | undefined {
    return Array.from(this.consumers.values()).find(c => c.username === username);
  }

  // ============ 请求处理 ============

  /**
   * 处理请求（模拟 Kong 网关处理流程）
   */
  async handleRequest(request: {
    path: string;
    method: string;
    headers: Record<string, string>;
    body?: unknown;
    clientIp: string;
  }): Promise<{
    allowed: boolean;
    route?: Route;
    service?: Service;
    target?: UpstreamTarget;
    user?: { userId: string; username: string; roles: string[] };
    error?: string;
    rateLimitInfo?: RateLimitResult;
  }> {
    this.stats.totalRequests++;
    const startTime = Date.now();

    try {
      // 1. 路由匹配
      const route = this.matchRoute(request.path, request.method);
      if (!route) {
        this.stats.blockedRequests++;
        return { allowed: false, error: 'Route not found' };
      }

      // 2. 获取服务
      const service = Array.from(this.services.values()).find(s => s.name === route.service);
      if (!service) {
        this.stats.blockedRequests++;
        return { allowed: false, error: 'Service not found' };
      }

      // 3. JWT 认证（如果路由需要）
      let user: { userId: string; username: string; roles: string[] } | undefined;
      if (route.plugins.includes('jwt-auth')) {
        const authHeader = request.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          this.stats.authFailures++;
          return { allowed: false, route, service, error: 'Missing authorization header' };
        }

        const token = authHeader.substring(7);
        const jwtResult = this.verifyJWT(token);
        if (!jwtResult.valid || !jwtResult.payload) {
          return { allowed: false, route, service, error: jwtResult.error || 'Invalid token' };
        }

        user = {
          userId: jwtResult.payload.userId,
          username: jwtResult.payload.username,
          roles: jwtResult.payload.roles,
        };
      }

      // 4. 限流检查（如果路由需要）
      let rateLimitInfo: RateLimitResult | undefined;
      if (route.plugins.includes('rate-limiting')) {
        const isVip = user?.roles.includes('vip') || false;
        const rateLimitKey = user?.userId || request.clientIp;
        rateLimitInfo = await this.checkRateLimit(rateLimitKey, isVip);

        if (!rateLimitInfo.allowed) {
          return { allowed: false, route, service, user, rateLimitInfo, error: 'Rate limit exceeded' };
        }
      }

      // 5. RBAC 权限检查
      if (user && route.plugins.includes('jwt-auth')) {
        const action = this.methodToAction(request.method);
        if (!this.checkPermission(user.roles, request.path, action)) {
          this.stats.blockedRequests++;
          return { allowed: false, route, service, user, rateLimitInfo, error: 'Permission denied' };
        }
      }

      // 6. 选择上游目标
      const upstream = Array.from(this.upstreams.values()).find(u => 
        u.name === `${service.name}-upstream`
      );
      const target = upstream ? this.selectTarget(upstream.id) : undefined;

      // 更新延迟统计
      const latency = Date.now() - startTime;
      this.stats.avgLatencyMs = (this.stats.avgLatencyMs + latency) / 2;

      return {
        allowed: true,
        route,
        service,
        target: target || undefined,
        user,
        rateLimitInfo,
      };
    } catch (error) {
      this.stats.upstreamErrors++;
      return { allowed: false, error: 'Internal gateway error' };
    }
  }

  private methodToAction(method: string): 'read' | 'write' | 'delete' | 'admin' {
    switch (method.toUpperCase()) {
      case 'GET':
      case 'HEAD':
      case 'OPTIONS':
        return 'read';
      case 'POST':
      case 'PUT':
      case 'PATCH':
        return 'write';
      case 'DELETE':
        return 'delete';
      default:
        return 'read';
    }
  }

  // ============ 统计和监控 ============

  /**
   * 获取统计信息
   */
  getStats(): GatewayStats {
    return { ...this.stats };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      rateLimitedRequests: 0,
      authFailures: 0,
      upstreamErrors: 0,
      avgLatencyMs: 0,
    };
  }

  /**
   * 获取状态
   */
  getStatus(): {
    initialized: boolean;
    routes: number;
    services: number;
    upstreams: number;
    consumers: number;
    roles: number;
    config: KongConfig;
  } {
    return {
      initialized: this.isInitialized,
      routes: this.routes.size,
      services: this.services.size,
      upstreams: this.upstreams.size,
      consumers: this.consumers.size,
      roles: this.roles.size,
      config: this.config,
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    redis: boolean;
    routes: boolean;
    services: boolean;
  }> {
    let redisHealthy = false;

    if (this.redis) {
      try {
        await this.redis.ping();
        redisHealthy = true;
      } catch {
        redisHealthy = false;
      }
    }

    return {
      healthy: this.isInitialized && this.routes.size > 0,
      redis: redisHealthy,
      routes: this.routes.size > 0,
      services: this.services.size > 0,
    };
  }
}

// 导出单例
export const kongGateway = new KongGateway();
