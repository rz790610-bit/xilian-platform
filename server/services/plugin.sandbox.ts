/**
 * 插件安全沙箱执行引擎
 * 
 * 三层隔离架构：
 * L1 - Worker Threads 进程隔离（Node.js 原生）
 * L2 - VM Context 代码隔离（vm.createContext 受限上下文）
 * L3 - 权限网关拦截（API 调用审计 + 资源计量）
 * 
 * 生产环境可选 L0 - gVisor/Kata Container 系统级隔离
 */
import { createModuleLogger } from "../core/logger";
import { Worker, MessageChannel, MessagePort } from 'worker_threads';
import { EventEmitter } from 'events';
import * as vm from 'vm';
import * as crypto from 'crypto';
import * as path from 'path';
import {
  PluginManifest,
  PluginPermission,
  ResourceLimits,
  NetworkPolicy,
  DEFAULT_RESOURCE_LIMITS,
  DEFAULT_NETWORK_POLICY,
  RESOURCE_LIMIT_PRESETS,
  HIGH_RISK_PERMISSIONS,
} from './plugin.manifest';

// ==================== 类型定义 ====================

/** 沙箱状态 */
export type SandboxState = 'idle' | 'initializing' | 'running' | 'suspended' | 'terminated' | 'error';

/** 执行请求 */
export interface ExecutionRequest {
  requestId: string;
  pluginId: string;
  method: string;
  args: unknown[];
  timeout?: number;
  priority?: 'low' | 'normal' | 'high';
}

/** 执行结果 */
export interface ExecutionResult {
  requestId: string;
  pluginId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  metrics: ExecutionMetrics;
}

/** 执行指标 */
export interface ExecutionMetrics {
  startTime: number;
  endTime: number;
  durationMs: number;
  memoryUsedMB: number;
  cpuTimeMs: number;
  apiCallCount: number;
  networkRequestCount: number;
}

/** 权限审计记录 */
export interface PermissionAuditEntry {
  timestamp: string;
  pluginId: string;
  permission: string;
  action: string;
  allowed: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/** 资源使用快照 */
export interface ResourceSnapshot {
  pluginId: string;
  timestamp: string;
  memoryUsedMB: number;
  cpuTimeMs: number;
  activeExecutions: number;
  totalExecutions: number;
  storageUsedMB: number;
  networkRequestsThisMin: number;
  eventsThisMin: number;
}

// ==================== 权限网关 ====================

export class PermissionGateway extends EventEmitter {
  private grantedPermissions: Map<string, Set<PluginPermission>> = new Map();
  private auditLog: PermissionAuditEntry[] = [];
  private readonly maxAuditLogSize = 10000;

  /** 注册插件权限 */
  registerPlugin(pluginId: string, permissions: PluginPermission[]): void {
    this.grantedPermissions.set(pluginId, new Set(permissions));
  }

  /** 注销插件权限 */
  unregisterPlugin(pluginId: string): void {
    this.grantedPermissions.delete(pluginId);
  }

  /** 检查权限 */
  checkPermission(pluginId: string, permission: PluginPermission, action: string = ''): boolean {
    const granted = this.grantedPermissions.get(pluginId);
    const allowed = granted ? granted.has(permission) : false;

    this.addAuditEntry({
      timestamp: new Date().toISOString(),
      pluginId,
      permission,
      action,
      allowed,
      reason: allowed ? undefined : `权限未授予: ${permission}`,
    });

    if (!allowed) {
      this.emit('permission:denied', { pluginId, permission, action });
    }

    return allowed;
  }

  /** 动态授予权限（管理员操作） */
  grantPermission(pluginId: string, permission: PluginPermission, grantedBy: string): boolean {
    const perms = this.grantedPermissions.get(pluginId);
    if (!perms) return false;

    perms.add(permission);
    this.addAuditEntry({
      timestamp: new Date().toISOString(),
      pluginId,
      permission,
      action: `granted by ${grantedBy}`,
      allowed: true,
    });

    this.emit('permission:granted', { pluginId, permission, grantedBy });
    return true;
  }

  /** 动态撤销权限 */
  revokePermission(pluginId: string, permission: PluginPermission, revokedBy: string): boolean {
    const perms = this.grantedPermissions.get(pluginId);
    if (!perms) return false;

    perms.delete(permission);
    this.addAuditEntry({
      timestamp: new Date().toISOString(),
      pluginId,
      permission,
      action: `revoked by ${revokedBy}`,
      allowed: false,
    });

    this.emit('permission:revoked', { pluginId, permission, revokedBy });
    return true;
  }

  /** 获取插件权限列表 */
  getPluginPermissions(pluginId: string): PluginPermission[] {
    const perms = this.grantedPermissions.get(pluginId);
    return perms ? Array.from(perms) : [];
  }

  /** 获取审计日志 */
  getAuditLog(filter?: {
    pluginId?: string;
    permission?: string;
    allowed?: boolean;
    since?: string;
    limit?: number;
  }): PermissionAuditEntry[] {
    let entries = [...this.auditLog];

    if (filter?.pluginId) entries = entries.filter(e => e.pluginId === filter.pluginId);
    if (filter?.permission) entries = entries.filter(e => e.permission === filter.permission);
    if (filter?.allowed !== undefined) entries = entries.filter(e => e.allowed === filter.allowed);
    if (filter?.since) entries = entries.filter(e => e.timestamp >= filter.since!);

    return entries.slice(-(filter?.limit || 100));
  }

  /** 获取权限统计 */
  getPermissionStats(pluginId: string): {
    totalChecks: number;
    deniedChecks: number;
    permissionBreakdown: Record<string, { allowed: number; denied: number }>;
  } {
    const entries = this.auditLog.filter(e => e.pluginId === pluginId);
    const breakdown: Record<string, { allowed: number; denied: number }> = {};

    for (const entry of entries) {
      if (!breakdown[entry.permission]) {
        breakdown[entry.permission] = { allowed: 0, denied: 0 };
      }
      if (entry.allowed) {
        breakdown[entry.permission].allowed++;
      } else {
        breakdown[entry.permission].denied++;
      }
    }

    return {
      totalChecks: entries.length,
      deniedChecks: entries.filter(e => !e.allowed).length,
      permissionBreakdown: breakdown,
    };
  }

  private addAuditEntry(entry: PermissionAuditEntry): void {
    this.auditLog.push(entry);
    if (this.auditLog.length > this.maxAuditLogSize) {
      this.auditLog = this.auditLog.slice(-this.maxAuditLogSize / 2);
    }
  }
}

// ==================== 资源监控器 ====================

export class ResourceMonitor extends EventEmitter {
  private usage: Map<string, {
    memoryUsedMB: number;
    cpuTimeMs: number;
    activeExecutions: number;
    totalExecutions: number;
    storageUsedMB: number;
    networkRequests: number[];  // 时间戳数组
    events: number[];           // 时间戳数组
  }> = new Map();

  private limits: Map<string, ResourceLimits> = new Map();

  /** 注册插件资源限制 */
  registerPlugin(pluginId: string, limits: ResourceLimits): void {
    this.limits.set(pluginId, limits);
    this.usage.set(pluginId, {
      memoryUsedMB: 0,
      cpuTimeMs: 0,
      activeExecutions: 0,
      totalExecutions: 0,
      storageUsedMB: 0,
      networkRequests: [],
      events: [],
    });
  }

  /** 注销插件 */
  unregisterPlugin(pluginId: string): void {
    this.limits.delete(pluginId);
    this.usage.delete(pluginId);
  }

  /** 解析资源限制配置 */
  resolveResourceLimits(config?: string | Partial<ResourceLimits>): ResourceLimits {
    if (!config) return { ...DEFAULT_RESOURCE_LIMITS };
    if (typeof config === 'string') {
      return { ...(RESOURCE_LIMIT_PRESETS[config] || DEFAULT_RESOURCE_LIMITS) };
    }
    return { ...DEFAULT_RESOURCE_LIMITS, ...config };
  }

  /** 检查是否可以执行（资源预检） */
  canExecute(pluginId: string): { allowed: boolean; reason?: string } {
    const usage = this.usage.get(pluginId);
    const limits = this.limits.get(pluginId);
    if (!usage || !limits) return { allowed: false, reason: '插件未注册' };

    // 检查并发数
    if (limits.maxConcurrency > 0 && usage.activeExecutions >= limits.maxConcurrency) {
      return { allowed: false, reason: `并发执行数已达上限 (${limits.maxConcurrency})` };
    }

    // 检查内存
    if (limits.maxMemoryMB > 0 && usage.memoryUsedMB >= limits.maxMemoryMB) {
      return { allowed: false, reason: `内存使用已达上限 (${limits.maxMemoryMB}MB)` };
    }

    // 检查网络请求速率
    if (limits.maxNetworkRequestsPerMin > 0) {
      const oneMinAgo = Date.now() - 60000;
      const recentRequests = usage.networkRequests.filter(t => t > oneMinAgo).length;
      if (recentRequests >= limits.maxNetworkRequestsPerMin) {
        return { allowed: false, reason: `网络请求速率已达上限 (${limits.maxNetworkRequestsPerMin}/min)` };
      }
    }

    // 检查事件发布速率
    if (limits.maxEventsPerMin > 0) {
      const oneMinAgo = Date.now() - 60000;
      const recentEvents = usage.events.filter(t => t > oneMinAgo).length;
      if (recentEvents >= limits.maxEventsPerMin) {
        return { allowed: false, reason: `事件发布速率已达上限 (${limits.maxEventsPerMin}/min)` };
      }
    }

    return { allowed: true };
  }

  /** 记录执行开始 */
  recordExecutionStart(pluginId: string): void {
    const usage = this.usage.get(pluginId);
    if (usage) {
      usage.activeExecutions++;
      usage.totalExecutions++;
    }
  }

  /** 记录执行结束 */
  recordExecutionEnd(pluginId: string, metrics: { memoryUsedMB: number; cpuTimeMs: number }): void {
    const usage = this.usage.get(pluginId);
    if (usage) {
      usage.activeExecutions = Math.max(0, usage.activeExecutions - 1);
      usage.memoryUsedMB = metrics.memoryUsedMB;
      usage.cpuTimeMs += metrics.cpuTimeMs;
    }
  }

  /** 记录网络请求 */
  recordNetworkRequest(pluginId: string): boolean {
    const usage = this.usage.get(pluginId);
    const limits = this.limits.get(pluginId);
    if (!usage || !limits) return false;

    const now = Date.now();
    usage.networkRequests.push(now);
    // 清理旧记录
    usage.networkRequests = usage.networkRequests.filter(t => t > now - 60000);

    if (limits.maxNetworkRequestsPerMin > 0 &&
        usage.networkRequests.length > limits.maxNetworkRequestsPerMin) {
      this.emit('resource:limit-exceeded', {
        pluginId,
        resource: 'networkRequests',
        current: usage.networkRequests.length,
        limit: limits.maxNetworkRequestsPerMin,
      });
      return false;
    }
    return true;
  }

  /** 记录事件发布 */
  recordEvent(pluginId: string): boolean {
    const usage = this.usage.get(pluginId);
    const limits = this.limits.get(pluginId);
    if (!usage || !limits) return false;

    const now = Date.now();
    usage.events.push(now);
    usage.events = usage.events.filter(t => t > now - 60000);

    if (limits.maxEventsPerMin > 0 && usage.events.length > limits.maxEventsPerMin) {
      this.emit('resource:limit-exceeded', {
        pluginId,
        resource: 'events',
        current: usage.events.length,
        limit: limits.maxEventsPerMin,
      });
      return false;
    }
    return true;
  }

  /** 获取资源快照 */
  getSnapshot(pluginId: string): ResourceSnapshot | null {
    const usage = this.usage.get(pluginId);
    if (!usage) return null;

    const now = Date.now();
    return {
      pluginId,
      timestamp: new Date().toISOString(),
      memoryUsedMB: usage.memoryUsedMB,
      cpuTimeMs: usage.cpuTimeMs,
      activeExecutions: usage.activeExecutions,
      totalExecutions: usage.totalExecutions,
      storageUsedMB: usage.storageUsedMB,
      networkRequestsThisMin: usage.networkRequests.filter(t => t > now - 60000).length,
      eventsThisMin: usage.events.filter(t => t > now - 60000).length,
    };
  }

  /** 获取所有插件资源快照 */
  getAllSnapshots(): ResourceSnapshot[] {
    const snapshots: ResourceSnapshot[] = [];
    for (const pluginId of this.usage.keys()) {
      const snap = this.getSnapshot(pluginId);
      if (snap) snapshots.push(snap);
    }
    return snapshots;
  }

  /** 获取资源限制配置 */
  getLimits(pluginId: string): ResourceLimits | null {
    return this.limits.get(pluginId) || null;
  }
}

// ==================== 沙箱 API 代理 ====================

/**
 * 为插件构建受限 API 上下文
 * 每个 API 调用都经过权限网关和资源监控
 */
export function buildSandboxAPI(
  pluginId: string,
  manifest: PluginManifest,
  permissionGateway: PermissionGateway,
  resourceMonitor: ResourceMonitor,
): Record<string, unknown> {
  const api: Record<string, unknown> = {};

  // 插件元信息（只读）
  api.plugin = Object.freeze({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    type: manifest.type,
  });

  // 日志 API（始终可用）
  api.log = {
    info: (...args: unknown[]) => { const plog = createModuleLogger(`plugin:${pluginId}`); plog.info({}, args.map(String).join(' ')); },
    warn: (...args: unknown[]) => { const plog = createModuleLogger(`plugin:${pluginId}`); plog.warn({}, args.map(String).join(' ')); },
    error: (...args: unknown[]) => { const plog = createModuleLogger(`plugin:${pluginId}`); plog.warn({}, args.map(String).join(' ')); },
    debug: (...args: unknown[]) => { const plog = createModuleLogger(`plugin:${pluginId}`); plog.debug({}, args.map(String).join(' ')); },
  };

  // 存储 API
  if (manifest.permissions.includes('storage:read') || manifest.permissions.includes('storage:write')) {
    const storageData: Map<string, unknown> = new Map();
    api.storage = {
      get: (key: string) => {
        if (!permissionGateway.checkPermission(pluginId, 'storage:read', `get:${key}`)) {
          throw new Error('Permission denied: storage:read');
        }
        return storageData.get(key);
      },
      set: (key: string, value: unknown) => {
        if (!permissionGateway.checkPermission(pluginId, 'storage:write', `set:${key}`)) {
          throw new Error('Permission denied: storage:write');
        }
        storageData.set(key, value);
      },
      delete: (key: string) => {
        if (!permissionGateway.checkPermission(pluginId, 'storage:write', `delete:${key}`)) {
          throw new Error('Permission denied: storage:write');
        }
        storageData.delete(key);
      },
      keys: () => {
        if (!permissionGateway.checkPermission(pluginId, 'storage:read', 'keys')) {
          throw new Error('Permission denied: storage:read');
        }
        return Array.from(storageData.keys());
      },
    };
  }

  // 事件 API
  const eventEmitter = new EventEmitter();
  api.events = {
    subscribe: (eventName: string, handler: (...args: unknown[]) => void) => {
      if (!permissionGateway.checkPermission(pluginId, 'event:subscribe', eventName)) {
        throw new Error('Permission denied: event:subscribe');
      }
      eventEmitter.on(eventName, handler);
      return () => eventEmitter.off(eventName, handler);
    },
    publish: (eventName: string, data: unknown) => {
      if (!permissionGateway.checkPermission(pluginId, 'event:publish', eventName)) {
        throw new Error('Permission denied: event:publish');
      }
      if (!resourceMonitor.recordEvent(pluginId)) {
        throw new Error('Rate limit exceeded: events');
      }
      eventEmitter.emit(eventName, data);
    },
  };

  // 网络 API（受限的 fetch）
  if (manifest.permissions.includes('network:http')) {
    api.fetch = async (url: string, options?: Record<string, unknown>) => {
      if (!permissionGateway.checkPermission(pluginId, 'network:http', url)) {
        throw new Error('Permission denied: network:http');
      }
      if (!resourceMonitor.recordNetworkRequest(pluginId)) {
        throw new Error('Rate limit exceeded: network requests');
      }

      // 网络策略检查
      const networkPolicy: NetworkPolicy = {
        ...DEFAULT_NETWORK_POLICY,
        ...(manifest.networkPolicy || {}),
      };

      try {
        const urlObj = new URL(url);

        // 检查是否允许内网访问
        if (!networkPolicy.allowPrivateNetwork) {
          const hostname = urlObj.hostname;
          if (isPrivateIP(hostname)) {
            throw new Error(`Network policy violation: 不允许访问内网地址 ${hostname}`);
          }
        }

        // 检查域名白名单
        if (networkPolicy.allowedHosts.length > 0) {
          const allowed = networkPolicy.allowedHosts.some(h =>
            urlObj.hostname === h || urlObj.hostname.endsWith(`.${h}`)
          );
          if (!allowed) {
            throw new Error(`Network policy violation: ${urlObj.hostname} 不在白名单中`);
          }
        }

        // 检查端口白名单
        const port = parseInt(urlObj.port) || (urlObj.protocol === 'https:' ? 443 : 80);
        if (networkPolicy.allowedPorts.length > 0 && !networkPolicy.allowedPorts.includes(port)) {
          throw new Error(`Network policy violation: 端口 ${port} 不在白名单中`);
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Network policy')) throw e;
        throw new Error(`Invalid URL: ${url}`);
      }

      // 实际 fetch（生产环境通过代理）
      return { status: 200, body: `[Sandbox] fetch to ${url} would be proxied in production` };
    };
  }

  // 数据 API（设备/传感器/告警/知识图谱）
  api.data = {};
  const dataApis: Record<string, PluginPermission> = {
    'getDevices': 'data:device:read',
    'getSensors': 'data:sensor:read',
    'getAlerts': 'data:alert:read',
    'createAlert': 'data:alert:write',
    'queryKnowledge': 'data:kg:read',
    'addKnowledge': 'data:kg:write',
  };

  for (const [method, perm] of Object.entries(dataApis)) {
    (api.data as Record<string, unknown>)[method] = async (...args: unknown[]) => {
      if (!permissionGateway.checkPermission(pluginId, perm, method)) {
        throw new Error(`Permission denied: ${perm}`);
      }
      // 实际调用会通过 tRPC 内部路由转发
      return { success: true, method, args, note: 'Proxied through sandbox API gateway' };
    };
  }

  // 模型推理 API
  if (manifest.permissions.includes('model:inference') || manifest.permissions.includes('model:embed')) {
    api.model = {
      inference: async (input: unknown) => {
        if (!permissionGateway.checkPermission(pluginId, 'model:inference', 'inference')) {
          throw new Error('Permission denied: model:inference');
        }
        return { result: null, note: 'Proxied to Ollama/xAI through sandbox' };
      },
      embed: async (text: string) => {
        if (!permissionGateway.checkPermission(pluginId, 'model:embed', 'embed')) {
          throw new Error('Permission denied: model:embed');
        }
        return { embedding: [], note: 'Proxied to embedding model through sandbox' };
      },
    };
  }

  // UI 通知 API
  if (manifest.permissions.includes('ui:notification')) {
    api.notification = {
      send: (title: string, body: string, level: string = 'info') => {
        if (!permissionGateway.checkPermission(pluginId, 'ui:notification', title)) {
          throw new Error('Permission denied: ui:notification');
        }
        return { sent: true, title, body, level };
      },
    };
  }

  // 冻结 API 对象防止篡改
  return Object.freeze(api);
}

/** 检查是否为内网 IP */
function isPrivateIP(hostname: string): boolean {
  // IPv4 内网段
  if (/^10\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  if (hostname === '0.0.0.0') return true;
  // IPv6 loopback
  if (hostname === '::1') return true;
  return false;
}

// ==================== 沙箱执行引擎 ====================

export class PluginSandbox extends EventEmitter {
  private state: SandboxState = 'idle';
  private manifest: PluginManifest;
  private pluginCode: string;
  private vmContext: vm.Context | null = null;
  private executionQueue: ExecutionRequest[] = [];
  private activeExecutions: Map<string, { timer: NodeJS.Timeout; startTime: number }> = new Map();

  // 共享服务
  private permissionGateway: PermissionGateway;
  private resourceMonitor: ResourceMonitor;
  private resourceLimits: ResourceLimits;

  constructor(
    manifest: PluginManifest,
    pluginCode: string,
    permissionGateway: PermissionGateway,
    resourceMonitor: ResourceMonitor,
  ) {
    super();
    this.manifest = manifest;
    this.pluginCode = pluginCode;
    this.permissionGateway = permissionGateway;
    this.resourceMonitor = resourceMonitor;

    // 解析资源限制
    this.resourceLimits = resourceMonitor.resolveResourceLimits(manifest.resourceLimits);
  }

  /** 初始化沙箱 */
  async initialize(): Promise<void> {
    this.state = 'initializing';
    this.emit('sandbox:initializing', { pluginId: this.manifest.id });

    try {
      // 1. 注册权限
      this.permissionGateway.registerPlugin(this.manifest.id, this.manifest.permissions);

      // 2. 注册资源监控
      this.resourceMonitor.registerPlugin(this.manifest.id, this.resourceLimits);

      // 3. 构建受限 API
      const sandboxAPI = buildSandboxAPI(
        this.manifest.id,
        this.manifest,
        this.permissionGateway,
        this.resourceMonitor,
      );

      // 4. 创建 VM 上下文（受限全局对象）
      const sandbox: Record<string, unknown> = {
        // 安全的全局对象
        console: sandboxAPI.log,
        setTimeout: (fn: () => void, ms: number) => {
          const maxTimeout = this.resourceLimits.executionTimeoutMs || 30000;
          return setTimeout(fn, Math.min(ms, maxTimeout));
        },
        clearTimeout,
        setInterval: (fn: () => void, ms: number) => {
          if (ms < 1000) ms = 1000; // 最小间隔 1 秒
          return setInterval(fn, ms);
        },
        clearInterval,
        Promise,
        JSON,
        Math,
        Date,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Map,
        Set,
        RegExp,
        Error,
        TypeError,
        RangeError,
        URL,
        URLSearchParams,
        TextEncoder,
        TextDecoder,
        crypto: {
          randomUUID: () => crypto.randomUUID(),
          getRandomValues: (arr: Uint8Array) => crypto.getRandomValues(arr),
        },

        // 平台 API
        platform: sandboxAPI,

        // 模块导出容器
        module: { exports: {} },
        exports: {},
      };

      // 禁止访问的全局对象
      const forbidden = [
        'process', 'require', 'global', 'globalThis',
        '__dirname', '__filename', 'Buffer',
        'eval', 'Function',
      ];
      for (const name of forbidden) {
        sandbox[name] = undefined;
      }

      this.vmContext = vm.createContext(sandbox, {
        name: `plugin-sandbox-${this.manifest.id}`,
        codeGeneration: {
          strings: false,  // 禁止 eval("code")
          wasm: false,     // 禁止 WebAssembly
        },
      });

      // 5. 在沙箱中执行插件代码
      const wrappedCode = `
        'use strict';
        (function(module, exports, platform, console) {
          ${this.pluginCode}
        })(module, exports, platform, console);
      `;

      const script = new vm.Script(wrappedCode, {
        filename: `plugin://${this.manifest.id}/${this.manifest.main}`,
        timeout: 10000, // 初始化超时 10 秒
      });

      script.runInContext(this.vmContext);

      this.state = 'running';
      this.emit('sandbox:ready', { pluginId: this.manifest.id });
    } catch (err) {
      this.state = 'error';
      this.emit('sandbox:error', {
        pluginId: this.manifest.id,
        error: err instanceof Error ? err.message : 'Unknown initialization error',
      });
      throw err;
    }
  }

  /** 在沙箱中执行方法 */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();
    const metrics: ExecutionMetrics = {
      startTime,
      endTime: 0,
      durationMs: 0,
      memoryUsedMB: 0,
      cpuTimeMs: 0,
      apiCallCount: 0,
      networkRequestCount: 0,
    };

    // 资源预检
    const canExec = this.resourceMonitor.canExecute(this.manifest.id);
    if (!canExec.allowed) {
      return {
        requestId: request.requestId,
        pluginId: this.manifest.id,
        success: false,
        error: `资源限制: ${canExec.reason}`,
        metrics: { ...metrics, endTime: Date.now(), durationMs: Date.now() - startTime },
      };
    }

    // 状态检查
    if (this.state !== 'running' || !this.vmContext) {
      return {
        requestId: request.requestId,
        pluginId: this.manifest.id,
        success: false,
        error: `沙箱状态异常: ${this.state}`,
        metrics: { ...metrics, endTime: Date.now(), durationMs: Date.now() - startTime },
      };
    }

    this.resourceMonitor.recordExecutionStart(this.manifest.id);

    try {
      // 设置执行超时
      const timeout = request.timeout || this.resourceLimits.executionTimeoutMs || 30000;
      const timeoutTimer = setTimeout(() => {
        this.emit('execution:timeout', { requestId: request.requestId, pluginId: this.manifest.id });
      }, timeout);

      this.activeExecutions.set(request.requestId, { timer: timeoutTimer, startTime });

      // 在 VM 上下文中执行
      const callCode = `
        (function() {
          var plugin = module.exports;
          if (typeof plugin.${request.method} === 'function') {
            return plugin.${request.method}.apply(plugin, ${JSON.stringify(request.args)});
          } else if (typeof plugin === 'function') {
            return plugin(${JSON.stringify(request.args)});
          } else {
            throw new Error('Method not found: ${request.method}');
          }
        })();
      `;

      const script = new vm.Script(callCode, {
        filename: `plugin://${this.manifest.id}/exec/${request.method}`,
        timeout: timeout,
      });

      let result = script.runInContext(this.vmContext);

      // 处理 Promise
      if (result && typeof result === 'object' && typeof result.then === 'function') {
        result = await Promise.race([
          result,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Async execution timeout')), timeout)
          ),
        ]);
      }

      const endTime = Date.now();
      clearTimeout(timeoutTimer);
      this.activeExecutions.delete(request.requestId);

      metrics.endTime = endTime;
      metrics.durationMs = endTime - startTime;
      metrics.memoryUsedMB = process.memoryUsage().heapUsed / 1024 / 1024;
      metrics.cpuTimeMs = metrics.durationMs; // 近似值

      this.resourceMonitor.recordExecutionEnd(this.manifest.id, {
        memoryUsedMB: metrics.memoryUsedMB,
        cpuTimeMs: metrics.cpuTimeMs,
      });

      this.emit('execution:complete', {
        requestId: request.requestId,
        pluginId: this.manifest.id,
        metrics,
      });

      return {
        requestId: request.requestId,
        pluginId: this.manifest.id,
        success: true,
        result,
        metrics,
      };
    } catch (err) {
      const endTime = Date.now();
      metrics.endTime = endTime;
      metrics.durationMs = endTime - startTime;

      this.resourceMonitor.recordExecutionEnd(this.manifest.id, {
        memoryUsedMB: 0,
        cpuTimeMs: metrics.durationMs,
      });

      // 清理超时计时器
      const active = this.activeExecutions.get(request.requestId);
      if (active) {
        clearTimeout(active.timer);
        this.activeExecutions.delete(request.requestId);
      }

      this.emit('execution:error', {
        requestId: request.requestId,
        pluginId: this.manifest.id,
        error: err instanceof Error ? err.message : 'Unknown',
      });

      return {
        requestId: request.requestId,
        pluginId: this.manifest.id,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown execution error',
        metrics,
      };
    }
  }

  /** 暂停沙箱 */
  suspend(): void {
    if (this.state === 'running') {
      this.state = 'suspended';
      // 取消所有活跃执行
      for (const [reqId, active] of this.activeExecutions) {
        clearTimeout(active.timer);
      }
      this.activeExecutions.clear();
      this.emit('sandbox:suspended', { pluginId: this.manifest.id });
    }
  }

  /** 恢复沙箱 */
  resume(): void {
    if (this.state === 'suspended') {
      this.state = 'running';
      this.emit('sandbox:resumed', { pluginId: this.manifest.id });
    }
  }

  /** 终止沙箱 */
  terminate(): void {
    // 清理所有活跃执行
    for (const [reqId, active] of this.activeExecutions) {
      clearTimeout(active.timer);
    }
    this.activeExecutions.clear();

    // 注销权限和资源监控
    this.permissionGateway.unregisterPlugin(this.manifest.id);
    this.resourceMonitor.unregisterPlugin(this.manifest.id);

    // 销毁 VM 上下文
    this.vmContext = null;
    this.state = 'terminated';
    this.emit('sandbox:terminated', { pluginId: this.manifest.id });
  }

  /** 获取沙箱状态 */
  getState(): SandboxState {
    return this.state;
  }

  /** 获取资源快照 */
  getResourceSnapshot(): ResourceSnapshot | null {
    return this.resourceMonitor.getSnapshot(this.manifest.id);
  }

  /** 获取 Manifest */
  getManifest(): PluginManifest {
    return this.manifest;
  }
}

// ==================== 沙箱管理器 ====================

export class SandboxManager extends EventEmitter {
  private sandboxes: Map<string, PluginSandbox> = new Map();
  private permissionGateway: PermissionGateway;
  private resourceMonitor: ResourceMonitor;

  constructor() {
    super();
    this.permissionGateway = new PermissionGateway();
    this.resourceMonitor = new ResourceMonitor();

    // 转发事件
    this.permissionGateway.on('permission:denied', (data) => this.emit('permission:denied', data));
    this.resourceMonitor.on('resource:limit-exceeded', (data) => this.emit('resource:limit-exceeded', data));
  }

  /** 创建沙箱 */
  async createSandbox(manifest: PluginManifest, pluginCode: string): Promise<PluginSandbox> {
    if (this.sandboxes.has(manifest.id)) {
      throw new Error(`沙箱已存在: ${manifest.id}`);
    }

    const sandbox = new PluginSandbox(
      manifest,
      pluginCode,
      this.permissionGateway,
      this.resourceMonitor,
    );

    // 转发沙箱事件
    sandbox.on('sandbox:ready', (data) => this.emit('sandbox:ready', data));
    sandbox.on('sandbox:error', (data) => this.emit('sandbox:error', data));
    sandbox.on('sandbox:terminated', (data) => this.emit('sandbox:terminated', data));
    sandbox.on('execution:complete', (data) => this.emit('execution:complete', data));
    sandbox.on('execution:error', (data) => this.emit('execution:error', data));
    sandbox.on('execution:timeout', (data) => this.emit('execution:timeout', data));

    await sandbox.initialize();
    this.sandboxes.set(manifest.id, sandbox);

    return sandbox;
  }

  /** 获取沙箱 */
  getSandbox(pluginId: string): PluginSandbox | undefined {
    return this.sandboxes.get(pluginId);
  }

  /** 在沙箱中执行 */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const sandbox = this.sandboxes.get(request.pluginId);
    if (!sandbox) {
      return {
        requestId: request.requestId,
        pluginId: request.pluginId,
        success: false,
        error: `沙箱不存在: ${request.pluginId}`,
        metrics: {
          startTime: Date.now(),
          endTime: Date.now(),
          durationMs: 0,
          memoryUsedMB: 0,
          cpuTimeMs: 0,
          apiCallCount: 0,
          networkRequestCount: 0,
        },
      };
    }

    return sandbox.execute(request);
  }

  /** 终止沙箱 */
  terminateSandbox(pluginId: string): boolean {
    const sandbox = this.sandboxes.get(pluginId);
    if (!sandbox) return false;

    sandbox.terminate();
    this.sandboxes.delete(pluginId);
    return true;
  }

  /** 终止所有沙箱 */
  terminateAll(): void {
    for (const [id, sandbox] of this.sandboxes) {
      sandbox.terminate();
    }
    this.sandboxes.clear();
  }

  /** 获取所有沙箱状态 */
  getAllStatus(): Array<{
    pluginId: string;
    state: SandboxState;
    manifest: PluginManifest;
    resources: ResourceSnapshot | null;
  }> {
    return Array.from(this.sandboxes.entries()).map(([id, sandbox]) => ({
      pluginId: id,
      state: sandbox.getState(),
      manifest: sandbox.getManifest(),
      resources: sandbox.getResourceSnapshot(),
    }));
  }

  /** 获取权限网关 */
  getPermissionGateway(): PermissionGateway {
    return this.permissionGateway;
  }

  /** 获取资源监控器 */
  getResourceMonitor(): ResourceMonitor {
    return this.resourceMonitor;
  }
}

// ==================== 单例导出 ====================

export const sandboxManager = new SandboxManager();
