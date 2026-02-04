/**
 * Falco 运行时安全服务
 * 西联智能平台 - 容器安全监控和威胁检测
 * 
 * 功能特性:
 * - 运行时威胁检测
 * - 安全事件管理
 * - 规则配置管理
 * - 告警路由和通知
 * - 安全态势分析
 */

import { EventEmitter } from 'events';

// ============================================
// 类型定义
// ============================================

/**
 * Falco 事件优先级
 */
export enum FalcoPriority {
  EMERGENCY = 'Emergency',
  ALERT = 'Alert',
  CRITICAL = 'Critical',
  ERROR = 'Error',
  WARNING = 'Warning',
  NOTICE = 'Notice',
  INFORMATIONAL = 'Informational',
  DEBUG = 'Debug'
}

/**
 * 安全事件分类
 */
export enum SecurityEventCategory {
  CONTAINER_ESCAPE = 'container_escape',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  CREDENTIAL_ACCESS = 'credential_access',
  NETWORK_ANOMALY = 'network_anomaly',
  FILE_ACCESS = 'file_access',
  PROCESS_ANOMALY = 'process_anomaly',
  CRYPTOMINING = 'cryptomining',
  REVERSE_SHELL = 'reverse_shell',
  DATA_EXFILTRATION = 'data_exfiltration',
  IOT_SECURITY = 'iot_security',
  AI_MODEL_ACCESS = 'ai_model_access'
}

/**
 * Falco 安全事件
 */
export interface FalcoEvent {
  uuid: string;
  time: Date;
  priority: FalcoPriority;
  rule: string;
  output: string;
  outputFields: Record<string, any>;
  hostname: string;
  source: string;
  tags: string[];
  category?: SecurityEventCategory;
}

/**
 * Falco 规则
 */
export interface FalcoRule {
  name: string;
  description: string;
  condition: string;
  output: string;
  priority: FalcoPriority;
  tags: string[];
  enabled: boolean;
  source?: string;
  exceptions?: FalcoRuleException[];
}

/**
 * 规则例外
 */
export interface FalcoRuleException {
  name: string;
  fields: string[];
  comps: string[];
  values: any[][];
}

/**
 * Falco 节点状态
 */
export interface FalcoNodeStatus {
  nodeName: string;
  status: 'running' | 'stopped' | 'error';
  version: string;
  rulesLoaded: number;
  eventsProcessed: number;
  droppedEvents: number;
  lastHeartbeat: Date;
  resourceUsage: {
    cpuPercent: number;
    memoryMB: number;
  };
}

/**
 * 安全态势统计
 */
export interface SecurityPosture {
  totalEvents: number;
  eventsByPriority: Record<FalcoPriority, number>;
  eventsByCategory: Record<SecurityEventCategory, number>;
  topRules: Array<{ rule: string; count: number }>;
  topContainers: Array<{ container: string; count: number }>;
  topNamespaces: Array<{ namespace: string; count: number }>;
  timeRange: { start: Date; end: Date };
  trend: 'improving' | 'stable' | 'degrading';
}

/**
 * 告警路由配置
 */
export interface AlertRoute {
  id: string;
  name: string;
  match: {
    priorities?: FalcoPriority[];
    categories?: SecurityEventCategory[];
    rules?: string[];
    tags?: string[];
  };
  receivers: AlertReceiver[];
  groupBy?: string[];
  groupWait?: number;
  groupInterval?: number;
  repeatInterval?: number;
}

/**
 * 告警接收器
 */
export interface AlertReceiver {
  type: 'alertmanager' | 'slack' | 'wechat' | 'dingtalk' | 'email' | 'webhook' | 'kafka';
  config: Record<string, any>;
  enabled: boolean;
}

/**
 * Falco 服务配置
 */
export interface FalcoServiceConfig {
  grpcEndpoint: string;
  httpEndpoint: string;
  sidekickEndpoint: string;
  alertRoutes: AlertRoute[];
  retentionDays: number;
  enableMetrics: boolean;
}

// ============================================
// Falco 服务实现
// ============================================

/**
 * Falco 运行时安全服务
 */
export class FalcoService extends EventEmitter {
  private config: FalcoServiceConfig;
  private events: FalcoEvent[] = [];
  private rules: Map<string, FalcoRule> = new Map();
  private nodeStatuses: Map<string, FalcoNodeStatus> = new Map();
  private alertRoutes: Map<string, AlertRoute> = new Map();
  private isConnected: boolean = false;
  private eventBuffer: FalcoEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<FalcoServiceConfig> = {}) {
    super();
    this.config = {
      grpcEndpoint: config.grpcEndpoint || 'unix:///var/run/falco/falco.sock',
      httpEndpoint: config.httpEndpoint || 'http://falco.falco-system:8765',
      sidekickEndpoint: config.sidekickEndpoint || 'http://falco-sidekick.falco-system:2801',
      alertRoutes: config.alertRoutes || [],
      retentionDays: config.retentionDays || 30,
      enableMetrics: config.enableMetrics ?? true
    };

    // 初始化告警路由
    this.initializeAlertRoutes();
    
    // 加载默认规则
    this.loadDefaultRules();
  }

  /**
   * 初始化告警路由
   */
  private initializeAlertRoutes(): void {
    // P0 关键告警路由
    this.alertRoutes.set('p0-critical', {
      id: 'p0-critical',
      name: 'P0 关键安全事件',
      match: {
        priorities: [FalcoPriority.CRITICAL, FalcoPriority.EMERGENCY],
        tags: ['P0']
      },
      receivers: [
        { type: 'alertmanager', config: { severity: 'critical' }, enabled: true },
        { type: 'slack', config: { channel: '#security-critical' }, enabled: true },
        { type: 'wechat', config: { touser: '@all' }, enabled: true }
      ],
      groupWait: 0,
      groupInterval: 60,
      repeatInterval: 300
    });

    // P1 高优先级告警路由
    this.alertRoutes.set('p1-high', {
      id: 'p1-high',
      name: 'P1 高优先级安全事件',
      match: {
        priorities: [FalcoPriority.ERROR],
        tags: ['P1']
      },
      receivers: [
        { type: 'alertmanager', config: { severity: 'error' }, enabled: true },
        { type: 'kafka', config: { topic: 'security-alerts' }, enabled: true }
      ],
      groupBy: ['rule', 'container'],
      groupWait: 30,
      groupInterval: 300,
      repeatInterval: 3600
    });

    // P2 中优先级告警路由
    this.alertRoutes.set('p2-medium', {
      id: 'p2-medium',
      name: 'P2 中优先级安全事件',
      match: {
        priorities: [FalcoPriority.WARNING],
        tags: ['P2']
      },
      receivers: [
        { type: 'kafka', config: { topic: 'security-events' }, enabled: true }
      ],
      groupBy: ['rule', 'namespace'],
      groupWait: 60,
      groupInterval: 600,
      repeatInterval: 7200
    });

    // 添加配置的路由
    for (const route of this.config.alertRoutes) {
      this.alertRoutes.set(route.id, route);
    }
  }

  /**
   * 加载默认规则
   */
  private loadDefaultRules(): void {
    const defaultRules: FalcoRule[] = [
      {
        name: '敏感配置文件访问',
        description: '检测对西联平台敏感配置文件的访问',
        condition: 'open_read and xilian_sensitive_files and container',
        output: '敏感文件被访问 (user=%user.name file=%fd.name container=%container.name)',
        priority: FalcoPriority.WARNING,
        tags: ['security', 'file_access', 'xilian', 'P0'],
        enabled: true
      },
      {
        name: '容器逃逸尝试',
        description: '检测容器逃逸攻击尝试',
        condition: 'spawned_process and container and escape_attempt',
        output: '容器逃逸尝试 (user=%user.name container=%container.name command=%proc.cmdline)',
        priority: FalcoPriority.CRITICAL,
        tags: ['security', 'container_escape', 'xilian', 'P0'],
        enabled: true
      },
      {
        name: '挖矿程序检测',
        description: '检测加密货币挖矿程序',
        condition: 'spawned_process and container and mining_process',
        output: '挖矿程序检测 (container=%container.name process=%proc.name)',
        priority: FalcoPriority.CRITICAL,
        tags: ['security', 'cryptomining', 'xilian', 'P0'],
        enabled: true
      },
      {
        name: '反弹Shell检测',
        description: '检测反弹Shell连接尝试',
        condition: 'spawned_process and container and reverse_shell',
        output: '反弹Shell检测 (container=%container.name command=%proc.cmdline)',
        priority: FalcoPriority.CRITICAL,
        tags: ['security', 'reverse_shell', 'xilian', 'P0'],
        enabled: true
      },
      {
        name: '异常外部网络连接',
        description: '检测到非预期的外部网络连接',
        condition: 'outbound and container and not allowed_network',
        output: '异常外部连接 (container=%container.name connection=%fd.name)',
        priority: FalcoPriority.WARNING,
        tags: ['security', 'network', 'xilian', 'P1'],
        enabled: true
      },
      {
        name: '特权容器启动',
        description: '检测特权容器的启动',
        condition: 'container_started and container.privileged = true',
        output: '特权容器启动 (container=%container.name image=%container.image.repository)',
        priority: FalcoPriority.ERROR,
        tags: ['security', 'privileged', 'xilian', 'P0'],
        enabled: true
      },
      {
        name: '设备控制命令异常',
        description: '检测对港口设备的异常控制命令',
        condition: 'spawned_process and container and iot_command',
        output: '设备控制命令 (container=%container.name command=%proc.cmdline)',
        priority: FalcoPriority.WARNING,
        tags: ['security', 'iot', 'industrial', 'xilian', 'P1'],
        enabled: true
      },
      {
        name: 'AI模型文件访问',
        description: '检测对 AI 模型文件的访问',
        condition: 'open_read and container and model_file',
        output: 'AI模型文件访问 (container=%container.name file=%fd.name)',
        priority: FalcoPriority.NOTICE,
        tags: ['security', 'ai_model', 'xilian', 'P2'],
        enabled: true
      }
    ];

    for (const rule of defaultRules) {
      this.rules.set(rule.name, rule);
    }
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    console.log('[Falco] 启动 Falco 安全服务...');
    
    // 启动事件缓冲刷新
    this.flushInterval = setInterval(() => {
      this.flushEventBuffer();
    }, 5000);

    // 模拟连接到 Falco
    this.isConnected = true;
    
    // 初始化节点状态
    this.initializeNodeStatuses();
    
    this.emit('started');
    console.log('[Falco] Falco 安全服务已启动');
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    console.log('[Falco] 停止 Falco 安全服务...');
    
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    // 刷新剩余事件
    await this.flushEventBuffer();
    
    this.isConnected = false;
    this.emit('stopped');
    console.log('[Falco] Falco 安全服务已停止');
  }

  /**
   * 初始化节点状态
   */
  private initializeNodeStatuses(): void {
    const nodes = [
      'xilian-gpu-node-1',
      'xilian-gpu-node-2',
      'xilian-cpu-node-1',
      'xilian-cpu-node-2',
      'xilian-cpu-node-3'
    ];

    for (const nodeName of nodes) {
      this.nodeStatuses.set(nodeName, {
        nodeName,
        status: 'running',
        version: '0.37.0',
        rulesLoaded: this.rules.size,
        eventsProcessed: Math.floor(Math.random() * 10000),
        droppedEvents: Math.floor(Math.random() * 10),
        lastHeartbeat: new Date(),
        resourceUsage: {
          cpuPercent: Math.random() * 5,
          memoryMB: 256 + Math.random() * 256
        }
      });
    }
  }

  /**
   * 处理安全事件
   */
  async processEvent(event: FalcoEvent): Promise<void> {
    // 分类事件
    event.category = this.categorizeEvent(event);
    
    // 添加到缓冲区
    this.eventBuffer.push(event);
    
    // 更新节点统计
    const nodeName = event.hostname;
    const nodeStatus = this.nodeStatuses.get(nodeName);
    if (nodeStatus) {
      nodeStatus.eventsProcessed++;
      nodeStatus.lastHeartbeat = new Date();
    }
    
    // 路由告警
    await this.routeAlert(event);
    
    // 发出事件
    this.emit('event', event);
    
    // 如果是关键事件，立即刷新
    if (event.priority === FalcoPriority.CRITICAL || event.priority === FalcoPriority.EMERGENCY) {
      await this.flushEventBuffer();
    }
  }

  /**
   * 分类安全事件
   */
  private categorizeEvent(event: FalcoEvent): SecurityEventCategory {
    const rule = event.rule.toLowerCase();
    const output = event.output.toLowerCase();
    const tags = event.tags.map(t => t.toLowerCase());

    if (tags.includes('container_escape') || rule.includes('逃逸')) {
      return SecurityEventCategory.CONTAINER_ESCAPE;
    }
    if (tags.includes('cryptomining') || rule.includes('挖矿')) {
      return SecurityEventCategory.CRYPTOMINING;
    }
    if (tags.includes('reverse_shell') || rule.includes('反弹')) {
      return SecurityEventCategory.REVERSE_SHELL;
    }
    if (tags.includes('credentials') || rule.includes('凭证') || rule.includes('密钥')) {
      return SecurityEventCategory.CREDENTIAL_ACCESS;
    }
    if (tags.includes('network') || rule.includes('网络')) {
      return SecurityEventCategory.NETWORK_ANOMALY;
    }
    if (tags.includes('file_access') || rule.includes('文件')) {
      return SecurityEventCategory.FILE_ACCESS;
    }
    if (tags.includes('privileged') || rule.includes('特权')) {
      return SecurityEventCategory.PRIVILEGE_ESCALATION;
    }
    if (tags.includes('iot') || tags.includes('industrial') || rule.includes('设备')) {
      return SecurityEventCategory.IOT_SECURITY;
    }
    if (tags.includes('ai_model') || rule.includes('模型')) {
      return SecurityEventCategory.AI_MODEL_ACCESS;
    }
    if (tags.includes('data_exfil') || rule.includes('传输')) {
      return SecurityEventCategory.DATA_EXFILTRATION;
    }
    
    return SecurityEventCategory.PROCESS_ANOMALY;
  }

  /**
   * 路由告警
   */
  private async routeAlert(event: FalcoEvent): Promise<void> {
    for (const [routeId, route] of this.alertRoutes) {
      if (this.matchRoute(event, route)) {
        for (const receiver of route.receivers) {
          if (receiver.enabled) {
            await this.sendAlert(event, receiver, route);
          }
        }
      }
    }
  }

  /**
   * 匹配路由规则
   */
  private matchRoute(event: FalcoEvent, route: AlertRoute): boolean {
    const { match } = route;
    
    // 检查优先级
    if (match.priorities && !match.priorities.includes(event.priority)) {
      return false;
    }
    
    // 检查分类
    if (match.categories && event.category && !match.categories.includes(event.category)) {
      return false;
    }
    
    // 检查规则名
    if (match.rules && !match.rules.some(r => event.rule.includes(r))) {
      return false;
    }
    
    // 检查标签
    if (match.tags && !match.tags.some(t => event.tags.includes(t))) {
      return false;
    }
    
    return true;
  }

  /**
   * 发送告警
   */
  private async sendAlert(event: FalcoEvent, receiver: AlertReceiver, route: AlertRoute): Promise<void> {
    const alert = {
      event,
      route: route.name,
      receiver: receiver.type,
      timestamp: new Date()
    };
    
    this.emit('alert', alert);
    
    // 模拟发送到不同接收器
    switch (receiver.type) {
      case 'alertmanager':
        console.log(`[Falco] 发送告警到 Alertmanager: ${event.rule}`);
        break;
      case 'slack':
        console.log(`[Falco] 发送告警到 Slack: ${event.rule}`);
        break;
      case 'wechat':
        console.log(`[Falco] 发送告警到企业微信: ${event.rule}`);
        break;
      case 'dingtalk':
        console.log(`[Falco] 发送告警到钉钉: ${event.rule}`);
        break;
      case 'kafka':
        console.log(`[Falco] 发送告警到 Kafka: ${event.rule}`);
        break;
      case 'webhook':
        console.log(`[Falco] 发送告警到 Webhook: ${event.rule}`);
        break;
    }
  }

  /**
   * 刷新事件缓冲区
   */
  async flushEventBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) return;
    
    const events = [...this.eventBuffer];
    this.eventBuffer = [];
    
    // 添加到历史记录
    this.events.push(...events);
    
    // 清理过期事件
    this.cleanupOldEvents();
    
    this.emit('flush', events.length);
  }

  /**
   * 清理过期事件
   */
  private cleanupOldEvents(): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.retentionDays);
    
    this.events = this.events.filter(e => e.time >= cutoff);
  }

  // ============================================
  // 规则管理
  // ============================================

  /**
   * 获取所有规则
   */
  getRules(): FalcoRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 获取规则
   */
  getRule(name: string): FalcoRule | undefined {
    return this.rules.get(name);
  }

  /**
   * 添加规则
   */
  addRule(rule: FalcoRule): void {
    this.rules.set(rule.name, rule);
    this.emit('ruleAdded', rule);
  }

  /**
   * 更新规则
   */
  updateRule(name: string, updates: Partial<FalcoRule>): FalcoRule | undefined {
    const rule = this.rules.get(name);
    if (!rule) return undefined;
    
    const updated = { ...rule, ...updates };
    this.rules.set(name, updated);
    this.emit('ruleUpdated', updated);
    return updated;
  }

  /**
   * 删除规则
   */
  deleteRule(name: string): boolean {
    const deleted = this.rules.delete(name);
    if (deleted) {
      this.emit('ruleDeleted', name);
    }
    return deleted;
  }

  /**
   * 启用/禁用规则
   */
  toggleRule(name: string, enabled: boolean): boolean {
    const rule = this.rules.get(name);
    if (!rule) return false;
    
    rule.enabled = enabled;
    this.emit('ruleToggled', { name, enabled });
    return true;
  }

  // ============================================
  // 事件查询
  // ============================================

  /**
   * 获取事件
   */
  getEvents(options: {
    priority?: FalcoPriority[];
    category?: SecurityEventCategory[];
    rule?: string;
    container?: string;
    namespace?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    offset?: number;
  } = {}): FalcoEvent[] {
    let filtered = [...this.events];
    
    if (options.priority?.length) {
      filtered = filtered.filter(e => options.priority!.includes(e.priority));
    }
    
    if (options.category?.length) {
      filtered = filtered.filter(e => e.category && options.category!.includes(e.category));
    }
    
    if (options.rule) {
      filtered = filtered.filter(e => e.rule.includes(options.rule!));
    }
    
    if (options.container) {
      filtered = filtered.filter(e => 
        e.outputFields['container.name']?.includes(options.container!)
      );
    }
    
    if (options.namespace) {
      filtered = filtered.filter(e => 
        e.outputFields['k8s.ns.name']?.includes(options.namespace!)
      );
    }
    
    if (options.startTime) {
      filtered = filtered.filter(e => e.time >= options.startTime!);
    }
    
    if (options.endTime) {
      filtered = filtered.filter(e => e.time <= options.endTime!);
    }
    
    // 按时间倒序
    filtered.sort((a, b) => b.time.getTime() - a.time.getTime());
    
    // 分页
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    
    return filtered.slice(offset, offset + limit);
  }

  /**
   * 获取事件统计
   */
  getEventStats(timeRange?: { start: Date; end: Date }): {
    total: number;
    byPriority: Record<string, number>;
    byCategory: Record<string, number>;
    byHour: Array<{ hour: string; count: number }>;
  } {
    let events = [...this.events];
    
    if (timeRange) {
      events = events.filter(e => e.time >= timeRange.start && e.time <= timeRange.end);
    }
    
    const byPriority: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byHour: Map<string, number> = new Map();
    
    for (const event of events) {
      // 按优先级统计
      byPriority[event.priority] = (byPriority[event.priority] || 0) + 1;
      
      // 按分类统计
      if (event.category) {
        byCategory[event.category] = (byCategory[event.category] || 0) + 1;
      }
      
      // 按小时统计
      const hour = event.time.toISOString().slice(0, 13);
      byHour.set(hour, (byHour.get(hour) || 0) + 1);
    }
    
    return {
      total: events.length,
      byPriority,
      byCategory,
      byHour: Array.from(byHour.entries())
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => a.hour.localeCompare(b.hour))
    };
  }

  // ============================================
  // 安全态势分析
  // ============================================

  /**
   * 获取安全态势
   */
  getSecurityPosture(hours: number = 24): SecurityPosture {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    
    const events = this.events.filter(e => e.time >= start && e.time <= end);
    
    // 按优先级统计
    const eventsByPriority: Record<FalcoPriority, number> = {} as any;
    for (const priority of Object.values(FalcoPriority)) {
      eventsByPriority[priority] = events.filter(e => e.priority === priority).length;
    }
    
    // 按分类统计
    const eventsByCategory: Record<SecurityEventCategory, number> = {} as any;
    for (const category of Object.values(SecurityEventCategory)) {
      eventsByCategory[category] = events.filter(e => e.category === category).length;
    }
    
    // Top 规则
    const ruleCount = new Map<string, number>();
    for (const event of events) {
      ruleCount.set(event.rule, (ruleCount.get(event.rule) || 0) + 1);
    }
    const topRules = Array.from(ruleCount.entries())
      .map(([rule, count]) => ({ rule, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Top 容器
    const containerCount = new Map<string, number>();
    for (const event of events) {
      const container = event.outputFields['container.name'] || 'unknown';
      containerCount.set(container, (containerCount.get(container) || 0) + 1);
    }
    const topContainers = Array.from(containerCount.entries())
      .map(([container, count]) => ({ container, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Top 命名空间
    const namespaceCount = new Map<string, number>();
    for (const event of events) {
      const namespace = event.outputFields['k8s.ns.name'] || 'unknown';
      namespaceCount.set(namespace, (namespaceCount.get(namespace) || 0) + 1);
    }
    const topNamespaces = Array.from(namespaceCount.entries())
      .map(([namespace, count]) => ({ namespace, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // 趋势分析
    const midpoint = new Date(start.getTime() + (end.getTime() - start.getTime()) / 2);
    const firstHalf = events.filter(e => e.time < midpoint).length;
    const secondHalf = events.filter(e => e.time >= midpoint).length;
    
    let trend: 'improving' | 'stable' | 'degrading';
    if (secondHalf < firstHalf * 0.8) {
      trend = 'improving';
    } else if (secondHalf > firstHalf * 1.2) {
      trend = 'degrading';
    } else {
      trend = 'stable';
    }
    
    return {
      totalEvents: events.length,
      eventsByPriority,
      eventsByCategory,
      topRules,
      topContainers,
      topNamespaces,
      timeRange: { start, end },
      trend
    };
  }

  // ============================================
  // 节点管理
  // ============================================

  /**
   * 获取节点状态
   */
  getNodeStatuses(): FalcoNodeStatus[] {
    return Array.from(this.nodeStatuses.values());
  }

  /**
   * 获取单个节点状态
   */
  getNodeStatus(nodeName: string): FalcoNodeStatus | undefined {
    return this.nodeStatuses.get(nodeName);
  }

  /**
   * 更新节点状态
   */
  updateNodeStatus(nodeName: string, status: Partial<FalcoNodeStatus>): void {
    const current = this.nodeStatuses.get(nodeName);
    if (current) {
      this.nodeStatuses.set(nodeName, { ...current, ...status });
    }
  }

  // ============================================
  // 告警路由管理
  // ============================================

  /**
   * 获取告警路由
   */
  getAlertRoutes(): AlertRoute[] {
    return Array.from(this.alertRoutes.values());
  }

  /**
   * 添加告警路由
   */
  addAlertRoute(route: AlertRoute): void {
    this.alertRoutes.set(route.id, route);
    this.emit('routeAdded', route);
  }

  /**
   * 更新告警路由
   */
  updateAlertRoute(id: string, updates: Partial<AlertRoute>): AlertRoute | undefined {
    const route = this.alertRoutes.get(id);
    if (!route) return undefined;
    
    const updated = { ...route, ...updates };
    this.alertRoutes.set(id, updated);
    this.emit('routeUpdated', updated);
    return updated;
  }

  /**
   * 删除告警路由
   */
  deleteAlertRoute(id: string): boolean {
    const deleted = this.alertRoutes.delete(id);
    if (deleted) {
      this.emit('routeDeleted', id);
    }
    return deleted;
  }

  // ============================================
  // 健康检查
  // ============================================

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    status: string;
    nodes: number;
    activeNodes: number;
    rulesLoaded: number;
    eventsProcessed: number;
  }> {
    const nodes = Array.from(this.nodeStatuses.values());
    const activeNodes = nodes.filter(n => n.status === 'running').length;
    const totalEventsProcessed = nodes.reduce((sum, n) => sum + n.eventsProcessed, 0);
    
    return {
      healthy: this.isConnected && activeNodes > 0,
      status: this.isConnected ? 'connected' : 'disconnected',
      nodes: nodes.length,
      activeNodes,
      rulesLoaded: this.rules.size,
      eventsProcessed: totalEventsProcessed
    };
  }

  /**
   * 获取服务统计
   */
  getStats(): {
    connected: boolean;
    totalEvents: number;
    totalRules: number;
    enabledRules: number;
    totalNodes: number;
    activeNodes: number;
    alertRoutes: number;
    bufferSize: number;
  } {
    const nodes = Array.from(this.nodeStatuses.values());
    const rules = Array.from(this.rules.values());
    
    return {
      connected: this.isConnected,
      totalEvents: this.events.length,
      totalRules: rules.length,
      enabledRules: rules.filter(r => r.enabled).length,
      totalNodes: nodes.length,
      activeNodes: nodes.filter(n => n.status === 'running').length,
      alertRoutes: this.alertRoutes.size,
      bufferSize: this.eventBuffer.length
    };
  }
}

// 导出单例
export const falcoService = new FalcoService();
export default falcoService;
