/**
 * 插件安全策略引擎
 * 
 * 职责：
 * 1. 安装前安全审查（manifest 校验 + 签名验证 + 权限审批）
 * 2. 运行时安全策略执行（权限拦截 + 资源限制 + 异常熔断）
 * 3. 安全事件审计与告警
 * 4. 插件信任等级管理
 */
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import {
  PluginManifest,
  PluginPermission,
  ManifestValidationResult,
  SignatureVerificationResult,
  HIGH_RISK_PERMISSIONS,
  validateManifest,
  verifyPluginSignature,
  computeDigest,
  trustedSignerStore,
} from './plugin.manifest';
import {
  SandboxManager,
  PermissionGateway,
  ResourceMonitor,
  PermissionAuditEntry,
  ResourceSnapshot,
  sandboxManager,
} from './plugin.sandbox';

// ==================== 类型定义 ====================

/** 插件信任等级 */
export type TrustLevel = 'untrusted' | 'basic' | 'verified' | 'trusted' | 'system';

/** 信任等级对应的默认策略 */
export const TRUST_LEVEL_POLICIES: Record<TrustLevel, {
  requireSignature: boolean;
  autoApprovePermissions: boolean;
  maxPermissions: number;
  allowHighRisk: boolean;
  resourcePreset: string;
  networkAccess: boolean;
}> = {
  untrusted: {
    requireSignature: true,
    autoApprovePermissions: false,
    maxPermissions: 3,
    allowHighRisk: false,
    resourcePreset: 'minimal',
    networkAccess: false,
  },
  basic: {
    requireSignature: false,
    autoApprovePermissions: false,
    maxPermissions: 8,
    allowHighRisk: false,
    resourcePreset: 'standard',
    networkAccess: false,
  },
  verified: {
    requireSignature: true,
    autoApprovePermissions: true,
    maxPermissions: 15,
    allowHighRisk: true,
    resourcePreset: 'standard',
    networkAccess: true,
  },
  trusted: {
    requireSignature: true,
    autoApprovePermissions: true,
    maxPermissions: 50,
    allowHighRisk: true,
    resourcePreset: 'performance',
    networkAccess: true,
  },
  system: {
    requireSignature: false,
    autoApprovePermissions: true,
    maxPermissions: 999,
    allowHighRisk: true,
    resourcePreset: 'unlimited',
    networkAccess: true,
  },
};

/** 安全审查结果 */
export interface SecurityReviewResult {
  reviewId: string;
  pluginId: string;
  timestamp: string;
  status: 'approved' | 'rejected' | 'pending_approval' | 'pending_review';
  trustLevel: TrustLevel;
  manifestValidation: ManifestValidationResult;
  signatureVerification: SignatureVerificationResult | null;
  permissionAnalysis: {
    requested: PluginPermission[];
    highRisk: PluginPermission[];
    autoApproved: PluginPermission[];
    pendingApproval: PluginPermission[];
    denied: PluginPermission[];
  };
  riskScore: number;        // 0-100, 越高越危险
  riskFactors: string[];
  recommendations: string[];
}

/** 安全事件 */
export interface SecurityEvent {
  id: string;
  timestamp: string;
  pluginId: string;
  type: 'permission_denied' | 'resource_exceeded' | 'execution_timeout' |
        'sandbox_error' | 'network_violation' | 'signature_invalid' |
        'circuit_breaker_open' | 'suspicious_activity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metadata?: Record<string, unknown>;
  resolved: boolean;
}

/** 熔断器状态 */
export interface CircuitBreakerState {
  pluginId: string;
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: string | null;
  openedAt: string | null;
  halfOpenAt: string | null;
  cooldownMs: number;
}

// ==================== 安全审查引擎 ====================

export class SecurityReviewEngine extends EventEmitter {
  private reviews: Map<string, SecurityReviewResult> = new Map();
  private trustLevels: Map<string, TrustLevel> = new Map();

  /** 执行安装前安全审查 */
  async reviewPlugin(
    manifest: PluginManifest,
    pluginContent: Buffer | null,
    requestedTrustLevel: TrustLevel = 'basic',
  ): Promise<SecurityReviewResult> {
    const reviewId = `review-${crypto.randomUUID().substring(0, 8)}`;
    const timestamp = new Date().toISOString();

    // 1. Manifest 校验
    const manifestValidation = validateManifest(manifest);

    // 2. 签名验证
    let signatureVerification: SignatureVerificationResult | null = null;
    if (pluginContent && manifest.signature) {
      signatureVerification = verifyPluginSignature(pluginContent, manifest);
    }

    // 3. 获取信任策略
    const policy = TRUST_LEVEL_POLICIES[requestedTrustLevel];

    // 4. 权限分析
    const requested = manifest.permissions || [];
    const highRisk = requested.filter(p => HIGH_RISK_PERMISSIONS.includes(p));
    const autoApproved: PluginPermission[] = [];
    const pendingApproval: PluginPermission[] = [];
    const denied: PluginPermission[] = [];

    for (const perm of requested) {
      if (HIGH_RISK_PERMISSIONS.includes(perm)) {
        if (policy.allowHighRisk) {
          if (policy.autoApprovePermissions) {
            autoApproved.push(perm);
          } else {
            pendingApproval.push(perm);
          }
        } else {
          denied.push(perm);
        }
      } else {
        if (policy.autoApprovePermissions) {
          autoApproved.push(perm);
        } else {
          // 低风险权限自动批准
          autoApproved.push(perm);
        }
      }
    }

    // 5. 风险评分
    const { riskScore, riskFactors } = this.calculateRiskScore(
      manifest,
      manifestValidation,
      signatureVerification,
      highRisk,
      policy,
    );

    // 6. 生成建议
    const recommendations = this.generateRecommendations(
      manifest,
      riskScore,
      riskFactors,
      signatureVerification,
    );

    // 7. 确定审查状态
    let status: SecurityReviewResult['status'];
    if (!manifestValidation.valid) {
      status = 'rejected';
    } else if (policy.requireSignature && (!signatureVerification || !signatureVerification.verified)) {
      status = 'rejected';
    } else if (denied.length > 0) {
      status = 'rejected';
    } else if (pendingApproval.length > 0) {
      status = 'pending_approval';
    } else if (riskScore > 70) {
      status = 'pending_review';
    } else {
      status = 'approved';
    }

    const result: SecurityReviewResult = {
      reviewId,
      pluginId: manifest.id,
      timestamp,
      status,
      trustLevel: requestedTrustLevel,
      manifestValidation,
      signatureVerification,
      permissionAnalysis: {
        requested,
        highRisk,
        autoApproved,
        pendingApproval,
        denied,
      },
      riskScore,
      riskFactors,
      recommendations,
    };

    this.reviews.set(manifest.id, result);
    this.emit('review:complete', result);

    return result;
  }

  /** 管理员审批 */
  approvePlugin(pluginId: string, approvedBy: string, approvedPermissions?: PluginPermission[]): boolean {
    const review = this.reviews.get(pluginId);
    if (!review || (review.status !== 'pending_approval' && review.status !== 'pending_review')) {
      return false;
    }

    // 将待审批权限移到已批准
    if (approvedPermissions) {
      for (const perm of approvedPermissions) {
        const idx = review.permissionAnalysis.pendingApproval.indexOf(perm);
        if (idx >= 0) {
          review.permissionAnalysis.pendingApproval.splice(idx, 1);
          review.permissionAnalysis.autoApproved.push(perm);
        }
      }
    } else {
      // 全部批准
      review.permissionAnalysis.autoApproved.push(...review.permissionAnalysis.pendingApproval);
      review.permissionAnalysis.pendingApproval = [];
    }

    review.status = 'approved';
    this.emit('review:approved', { pluginId, approvedBy });
    return true;
  }

  /** 拒绝插件 */
  rejectPlugin(pluginId: string, rejectedBy: string, reason: string): boolean {
    const review = this.reviews.get(pluginId);
    if (!review) return false;

    review.status = 'rejected';
    review.recommendations.push(`被 ${rejectedBy} 拒绝: ${reason}`);
    this.emit('review:rejected', { pluginId, rejectedBy, reason });
    return true;
  }

  /** 设置插件信任等级 */
  setTrustLevel(pluginId: string, level: TrustLevel): void {
    this.trustLevels.set(pluginId, level);
  }

  /** 获取插件信任等级 */
  getTrustLevel(pluginId: string): TrustLevel {
    return this.trustLevels.get(pluginId) || 'untrusted';
  }

  /** 获取审查结果 */
  getReview(pluginId: string): SecurityReviewResult | undefined {
    return this.reviews.get(pluginId);
  }

  /** 获取所有审查结果 */
  getAllReviews(): SecurityReviewResult[] {
    return Array.from(this.reviews.values());
  }

  /** 计算风险评分 */
  private calculateRiskScore(
    manifest: PluginManifest,
    validation: ManifestValidationResult,
    signature: SignatureVerificationResult | null,
    highRiskPerms: PluginPermission[],
    policy: typeof TRUST_LEVEL_POLICIES[TrustLevel],
  ): { riskScore: number; riskFactors: string[] } {
    let score = 0;
    const factors: string[] = [];

    // Manifest 校验问题
    if (!validation.valid) {
      score += 40;
      factors.push(`Manifest 校验失败: ${validation.errors.length} 个错误`);
    }
    if (validation.warnings.length > 0) {
      score += validation.warnings.length * 5;
      factors.push(`Manifest 警告: ${validation.warnings.length} 个`);
    }

    // 签名状态
    if (!signature) {
      score += 20;
      factors.push('插件未签名');
    } else if (!signature.verified) {
      score += 35;
      factors.push(`签名验证失败: ${signature.error}`);
    }

    // 高风险权限
    if (highRiskPerms.length > 0) {
      score += highRiskPerms.length * 8;
      factors.push(`请求 ${highRiskPerms.length} 个高风险权限: ${highRiskPerms.join(', ')}`);
    }

    // 权限数量
    if (manifest.permissions.length > 10) {
      score += (manifest.permissions.length - 10) * 3;
      factors.push(`请求权限过多: ${manifest.permissions.length} 个`);
    }

    // 网络访问
    if (manifest.permissions.includes('network:http') || manifest.permissions.includes('network:ws')) {
      score += 10;
      factors.push('请求网络访问权限');
      if (manifest.networkPolicy?.allowPrivateNetwork) {
        score += 15;
        factors.push('请求内网访问权限');
      }
    }

    // 资源限制
    if (manifest.resourceLimits === 'unlimited' || manifest.resourceLimits === 'performance') {
      score += 10;
      factors.push(`请求高资源配额: ${manifest.resourceLimits}`);
    }

    return { riskScore: Math.min(100, score), riskFactors: factors };
  }

  /** 生成安全建议 */
  private generateRecommendations(
    manifest: PluginManifest,
    riskScore: number,
    riskFactors: string[],
    signature: SignatureVerificationResult | null,
  ): string[] {
    const recs: string[] = [];

    if (!signature || !signature.verified) {
      recs.push('建议要求插件开发者提供有效签名');
    }

    if (riskScore > 50) {
      recs.push('风险评分较高，建议在隔离环境中先行测试');
    }

    if (manifest.permissions.includes('network:http') && !manifest.networkPolicy?.allowedHosts?.length) {
      recs.push('插件请求网络访问但未声明域名白名单，建议限制可访问的域名');
    }

    if (manifest.permissions.length > 10) {
      recs.push('权限请求过多，建议审查是否所有权限都是必需的');
    }

    if (!manifest.resourceLimits) {
      recs.push('未声明资源限制，将使用默认限制（128MB 内存，30s 超时）');
    }

    return recs;
  }
}

// ==================== 熔断器 ====================

export class CircuitBreaker extends EventEmitter {
  private states: Map<string, CircuitBreakerState> = new Map();
  private readonly failureThreshold = 5;
  private readonly defaultCooldownMs = 60000; // 1 分钟

  /** 获取或初始化熔断器状态 */
  getState(pluginId: string): CircuitBreakerState {
    if (!this.states.has(pluginId)) {
      this.states.set(pluginId, {
        pluginId,
        state: 'closed',
        failureCount: 0,
        lastFailureTime: null,
        openedAt: null,
        halfOpenAt: null,
        cooldownMs: this.defaultCooldownMs,
      });
    }
    return this.states.get(pluginId)!;
  }

  /** 检查是否允许执行 */
  canExecute(pluginId: string): { allowed: boolean; reason?: string } {
    const state = this.getState(pluginId);

    switch (state.state) {
      case 'closed':
        return { allowed: true };

      case 'open': {
        // 检查冷却期是否已过
        if (state.openedAt) {
          const elapsed = Date.now() - new Date(state.openedAt).getTime();
          if (elapsed >= state.cooldownMs) {
            state.state = 'half-open';
            state.halfOpenAt = new Date().toISOString();
            this.emit('circuit:half-open', { pluginId });
            return { allowed: true }; // 允许一次试探
          }
        }
        return {
          allowed: false,
          reason: `熔断器已打开，冷却中 (剩余 ${Math.ceil((state.cooldownMs - (Date.now() - new Date(state.openedAt!).getTime())) / 1000)}s)`,
        };
      }

      case 'half-open':
        return { allowed: true }; // 半开状态允许一次试探

      default:
        return { allowed: false, reason: '未知熔断器状态' };
    }
  }

  /** 记录成功 */
  recordSuccess(pluginId: string): void {
    const state = this.getState(pluginId);
    if (state.state === 'half-open') {
      state.state = 'closed';
      state.failureCount = 0;
      state.openedAt = null;
      state.halfOpenAt = null;
      this.emit('circuit:closed', { pluginId });
    }
  }

  /** 记录失败 */
  recordFailure(pluginId: string): void {
    const state = this.getState(pluginId);
    state.failureCount++;
    state.lastFailureTime = new Date().toISOString();

    if (state.state === 'half-open') {
      // 半开状态失败，重新打开
      state.state = 'open';
      state.openedAt = new Date().toISOString();
      state.cooldownMs = Math.min(state.cooldownMs * 2, 300000); // 指数退避，最大 5 分钟
      this.emit('circuit:open', { pluginId, reason: 'half-open probe failed' });
    } else if (state.failureCount >= this.failureThreshold) {
      state.state = 'open';
      state.openedAt = new Date().toISOString();
      this.emit('circuit:open', { pluginId, reason: `failure threshold reached (${this.failureThreshold})` });
    }
  }

  /** 手动重置熔断器 */
  reset(pluginId: string): void {
    const state = this.getState(pluginId);
    state.state = 'closed';
    state.failureCount = 0;
    state.openedAt = null;
    state.halfOpenAt = null;
    state.cooldownMs = this.defaultCooldownMs;
    this.emit('circuit:reset', { pluginId });
  }

  /** 获取所有熔断器状态 */
  getAllStates(): CircuitBreakerState[] {
    return Array.from(this.states.values());
  }
}

// ==================== 安全事件管理器 ====================

export class SecurityEventManager extends EventEmitter {
  private events: SecurityEvent[] = [];
  private readonly maxEvents = 5000;

  /** 记录安全事件 */
  record(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'resolved'>): SecurityEvent {
    const fullEvent: SecurityEvent = {
      ...event,
      id: `sec-${crypto.randomUUID().substring(0, 8)}`,
      timestamp: new Date().toISOString(),
      resolved: false,
    };

    this.events.push(fullEvent);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents / 2);
    }

    this.emit('security:event', fullEvent);

    // 高严重度事件触发告警
    if (fullEvent.severity === 'critical' || fullEvent.severity === 'high') {
      this.emit('security:alert', fullEvent);
    }

    return fullEvent;
  }

  /** 标记事件已解决 */
  resolve(eventId: string): boolean {
    const event = this.events.find(e => e.id === eventId);
    if (event) {
      event.resolved = true;
      return true;
    }
    return false;
  }

  /** 查询安全事件 */
  query(filter?: {
    pluginId?: string;
    type?: SecurityEvent['type'];
    severity?: SecurityEvent['severity'];
    resolved?: boolean;
    since?: string;
    limit?: number;
  }): SecurityEvent[] {
    let result = [...this.events];

    if (filter?.pluginId) result = result.filter(e => e.pluginId === filter.pluginId);
    if (filter?.type) result = result.filter(e => e.type === filter.type);
    if (filter?.severity) result = result.filter(e => e.severity === filter.severity);
    if (filter?.resolved !== undefined) result = result.filter(e => e.resolved === filter.resolved);
    if (filter?.since) result = result.filter(e => e.timestamp >= filter.since!);

    return result.slice(-(filter?.limit || 100));
  }

  /** 获取安全统计 */
  getStats(): {
    total: number;
    unresolved: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    byPlugin: Record<string, number>;
  } {
    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byPlugin: Record<string, number> = {};

    for (const event of this.events) {
      bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;
      byType[event.type] = (byType[event.type] || 0) + 1;
      byPlugin[event.pluginId] = (byPlugin[event.pluginId] || 0) + 1;
    }

    return {
      total: this.events.length,
      unresolved: this.events.filter(e => !e.resolved).length,
      bySeverity,
      byType,
      byPlugin,
    };
  }
}

// ==================== 安全策略协调器 ====================

/**
 * 安全策略协调器 - 统一管理所有安全组件
 */
export class SecurityOrchestrator extends EventEmitter {
  private reviewEngine: SecurityReviewEngine;
  private circuitBreaker: CircuitBreaker;
  private securityEvents: SecurityEventManager;
  private sandboxMgr: SandboxManager;

  constructor(sandboxMgr: SandboxManager) {
    super();
    this.reviewEngine = new SecurityReviewEngine();
    this.circuitBreaker = new CircuitBreaker();
    this.securityEvents = new SecurityEventManager();
    this.sandboxMgr = sandboxMgr;

    this.wireEvents();
  }

  /** 连接事件管道 */
  private wireEvents(): void {
    // 权限拒绝 → 安全事件
    this.sandboxMgr.on('permission:denied', (data) => {
      this.securityEvents.record({
        pluginId: data.pluginId,
        type: 'permission_denied',
        severity: 'medium',
        description: `权限被拒绝: ${data.permission} (${data.action})`,
        metadata: data,
      });
    });

    // 资源超限 → 安全事件
    this.sandboxMgr.on('resource:limit-exceeded', (data) => {
      this.securityEvents.record({
        pluginId: data.pluginId,
        type: 'resource_exceeded',
        severity: 'high',
        description: `资源超限: ${data.resource} (${data.current}/${data.limit})`,
        metadata: data,
      });
    });

    // 执行超时 → 安全事件 + 熔断器
    this.sandboxMgr.on('execution:timeout', (data) => {
      this.securityEvents.record({
        pluginId: data.pluginId,
        type: 'execution_timeout',
        severity: 'high',
        description: `执行超时: ${data.requestId}`,
        metadata: data,
      });
      this.circuitBreaker.recordFailure(data.pluginId);
    });

    // 执行错误 → 熔断器
    this.sandboxMgr.on('execution:error', (data) => {
      this.securityEvents.record({
        pluginId: data.pluginId,
        type: 'sandbox_error',
        severity: 'medium',
        description: `执行错误: ${data.error}`,
        metadata: data,
      });
      this.circuitBreaker.recordFailure(data.pluginId);
    });

    // 执行成功 → 熔断器恢复
    this.sandboxMgr.on('execution:complete', (data) => {
      this.circuitBreaker.recordSuccess(data.pluginId);
    });

    // 熔断器打开 → 安全事件
    this.circuitBreaker.on('circuit:open', (data) => {
      this.securityEvents.record({
        pluginId: data.pluginId,
        type: 'circuit_breaker_open',
        severity: 'critical',
        description: `熔断器已打开: ${data.reason}`,
        metadata: data,
      });
    });
  }

  /** 安全安装流程 */
  async secureInstall(
    manifest: PluginManifest,
    pluginCode: string,
    pluginContent: Buffer | null = null,
    trustLevel: TrustLevel = 'basic',
  ): Promise<{
    success: boolean;
    review: SecurityReviewResult;
    error?: string;
  }> {
    // 1. 安全审查
    const review = await this.reviewEngine.reviewPlugin(manifest, pluginContent, trustLevel);

    if (review.status === 'rejected') {
      return {
        success: false,
        review,
        error: `安全审查未通过: ${review.riskFactors.join('; ')}`,
      };
    }

    if (review.status === 'pending_approval' || review.status === 'pending_review') {
      return {
        success: false,
        review,
        error: `需要管理员审批: ${review.permissionAnalysis.pendingApproval.join(', ')}`,
      };
    }

    // 2. 创建沙箱
    try {
      await this.sandboxMgr.createSandbox(manifest, pluginCode);
      this.reviewEngine.setTrustLevel(manifest.id, trustLevel);
      return { success: true, review };
    } catch (err) {
      return {
        success: false,
        review,
        error: `沙箱创建失败: ${err instanceof Error ? err.message : 'Unknown'}`,
      };
    }
  }

  /** 安全执行流程 */
  async secureExecute(request: {
    pluginId: string;
    method: string;
    args: unknown[];
    timeout?: number;
  }): Promise<{
    success: boolean;
    result?: unknown;
    error?: string;
    metrics?: Record<string, unknown>;
  }> {
    // 1. 熔断器检查
    const canExec = this.circuitBreaker.canExecute(request.pluginId);
    if (!canExec.allowed) {
      return { success: false, error: canExec.reason };
    }

    // 2. 沙箱执行
    const execResult = await this.sandboxMgr.execute({
      requestId: `exec-${crypto.randomUUID().substring(0, 8)}`,
      pluginId: request.pluginId,
      method: request.method,
      args: request.args,
      timeout: request.timeout,
    });

    return {
      success: execResult.success,
      result: execResult.result,
      error: execResult.error,
      metrics: execResult.metrics as unknown as Record<string, unknown>,
    };
  }

  /** 安全卸载流程 */
  secureUninstall(pluginId: string): boolean {
    this.sandboxMgr.terminateSandbox(pluginId);
    this.circuitBreaker.reset(pluginId);
    return true;
  }

  // ==================== 查询接口 ====================

  getReviewEngine(): SecurityReviewEngine { return this.reviewEngine; }
  getCircuitBreaker(): CircuitBreaker { return this.circuitBreaker; }
  getSecurityEvents(): SecurityEventManager { return this.securityEvents; }

  /** 获取插件安全概览 */
  getPluginSecurityOverview(pluginId: string): {
    trustLevel: TrustLevel;
    review: SecurityReviewResult | undefined;
    circuitBreaker: CircuitBreakerState;
    recentEvents: SecurityEvent[];
    resources: ResourceSnapshot | null;
    permissions: PluginPermission[];
    permissionStats: ReturnType<PermissionGateway['getPermissionStats']>;
  } {
    return {
      trustLevel: this.reviewEngine.getTrustLevel(pluginId),
      review: this.reviewEngine.getReview(pluginId),
      circuitBreaker: this.circuitBreaker.getState(pluginId),
      recentEvents: this.securityEvents.query({ pluginId, limit: 20 }),
      resources: this.sandboxMgr.getResourceMonitor().getSnapshot(pluginId),
      permissions: this.sandboxMgr.getPermissionGateway().getPluginPermissions(pluginId),
      permissionStats: this.sandboxMgr.getPermissionGateway().getPermissionStats(pluginId),
    };
  }

  /** 获取全局安全仪表盘数据 */
  getSecurityDashboard(): {
    sandboxes: ReturnType<SandboxManager['getAllStatus']>;
    circuitBreakers: CircuitBreakerState[];
    securityStats: ReturnType<SecurityEventManager['getStats']>;
    recentAlerts: SecurityEvent[];
    pendingReviews: SecurityReviewResult[];
  } {
    return {
      sandboxes: this.sandboxMgr.getAllStatus(),
      circuitBreakers: this.circuitBreaker.getAllStates(),
      securityStats: this.securityEvents.getStats(),
      recentAlerts: this.securityEvents.query({ severity: 'critical', limit: 10 })
        .concat(this.securityEvents.query({ severity: 'high', limit: 10 })),
      pendingReviews: this.reviewEngine.getAllReviews().filter(
        r => r.status === 'pending_approval' || r.status === 'pending_review'
      ),
    };
  }
}

// ==================== 单例导出 ====================

export const securityOrchestrator = new SecurityOrchestrator(sandboxManager);
