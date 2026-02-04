/**
 * 用户交互层统一管理服务
 * 
 * 整合所有用户交互组件：
 * - GraphQL Gateway（Apollo Federation）
 * - React 19 Web Portal
 * - React Native Mobile App
 * - Whisper Voice UI
 * - Neo4j Bloom 3D Viz
 */

import { EventEmitter } from 'events';
import { GraphQLGateway, type GraphQLGatewayConfig } from './graphql/graphqlGateway';
import { WebPortalConfigService, type WebPortalConfig } from './web/webPortalConfig';
import { MobileAppConfigService, type MobileAppConfig } from './mobile/mobileAppConfig';
import { VoiceUIConfigService, type VoiceUIConfig } from './voice/voiceUIConfig';
import { Neo4jBloomConfigService, type BloomConfig } from './visualization/neo4jBloomConfig';

// ============ 类型定义 ============

export interface InteractionManagerConfig {
  graphql?: Partial<GraphQLGatewayConfig>;
  web?: Partial<WebPortalConfig>;
  mobile?: Partial<MobileAppConfig>;
  voice?: Partial<VoiceUIConfig>;
  bloom?: Partial<BloomConfig>;
}

export interface InteractionStats {
  graphql: {
    totalQueries: number;
    cacheHitRate: number;
    avgLatency: number;
    activeSubscriptions: number;
  };
  web: {
    activeUsers: number;
    pageViews: number;
    avgSessionDuration: number;
  };
  mobile: {
    activeDevices: number;
    pushNotificationsSent: number;
    syncOperations: number;
  };
  voice: {
    totalTranscriptions: number;
    commandSuccessRate: number;
    avgConfidence: number;
  };
  bloom: {
    nodesDisplayed: number;
    relationshipsDisplayed: number;
    searchQueries: number;
  };
}

export interface HealthStatus {
  component: string;
  healthy: boolean;
  message?: string;
  lastCheck: number;
}

export interface UserSession {
  id: string;
  userId: string;
  platform: 'web' | 'mobile' | 'voice';
  startedAt: number;
  lastActivityAt: number;
  metadata: Record<string, unknown>;
}

// ============ 交互层管理服务 ============

export class InteractionManager extends EventEmitter {
  private graphqlGateway: GraphQLGateway;
  private webPortal: WebPortalConfigService;
  private mobileApp: MobileAppConfigService;
  private voiceUI: VoiceUIConfigService;
  private bloomViz: Neo4jBloomConfigService;

  private sessions: Map<string, UserSession> = new Map();
  private healthStatuses: Map<string, HealthStatus> = new Map();
  private initialized: boolean = false;

  constructor(config?: InteractionManagerConfig) {
    super();
    this.graphqlGateway = new GraphQLGateway(config?.graphql);
    this.webPortal = new WebPortalConfigService(config?.web);
    this.mobileApp = new MobileAppConfigService(config?.mobile);
    this.voiceUI = new VoiceUIConfigService(config?.voice);
    this.bloomViz = new Neo4jBloomConfigService(config?.bloom);

    this.setupEventListeners();
  }

  // ============ 初始化和生命周期 ============

  /**
   * 初始化所有交互组件
   */
  async initialize(): Promise<void> {
    console.log('[InteractionManager] Initializing all interaction components...');

    try {
      // 初始化 GraphQL Gateway
      await this.graphqlGateway.initialize();
      this.updateHealthStatus('graphql', true, 'GraphQL Gateway initialized');

      // Web Portal 配置（无需异步初始化）
      this.updateHealthStatus('web', true, 'Web Portal configured');

      // Mobile App 配置（无需异步初始化）
      this.updateHealthStatus('mobile', true, 'Mobile App configured');

      // Voice UI 配置（无需异步初始化）
      this.updateHealthStatus('voice', true, 'Voice UI configured');

      // Bloom Viz 配置（无需异步初始化）
      this.updateHealthStatus('bloom', true, 'Bloom Viz configured');

      this.initialized = true;
      console.log('[InteractionManager] All components initialized successfully');
      this.emit('initialized');
    } catch (error) {
      console.error('[InteractionManager] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * 关闭所有交互组件
   */
  async close(): Promise<void> {
    console.log('[InteractionManager] Closing all interaction components...');

    // 清理会话
    this.sessions.clear();

    // 关闭 GraphQL Gateway
    await this.graphqlGateway.close();

    this.initialized = false;
    console.log('[InteractionManager] All components closed');
    this.emit('closed');
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ============ 事件监听设置 ============

  private setupEventListeners(): void {
    // GraphQL Gateway 事件
    this.graphqlGateway.on('query-executed', (data) => {
      this.emit('graphql:query', data);
    });

    this.graphqlGateway.on('subscription-created', (data) => {
      this.emit('graphql:subscription', data);
    });

    // Voice UI 事件
    this.voiceUI.on('transcription', (result) => {
      this.emit('voice:transcription', result);
    });

    this.voiceUI.on('synthesis', (result) => {
      this.emit('voice:synthesis', result);
    });

    // Bloom Viz 事件
    this.bloomViz.on('node-selected', (id) => {
      this.emit('bloom:node-selected', id);
    });

    this.bloomViz.on('search-completed', (data) => {
      this.emit('bloom:search', data);
    });
  }

  // ============ 组件访问器 ============

  /**
   * 获取 GraphQL Gateway
   */
  getGraphQLGateway(): GraphQLGateway {
    return this.graphqlGateway;
  }

  /**
   * 获取 Web Portal 配置服务
   */
  getWebPortal(): WebPortalConfigService {
    return this.webPortal;
  }

  /**
   * 获取 Mobile App 配置服务
   */
  getMobileApp(): MobileAppConfigService {
    return this.mobileApp;
  }

  /**
   * 获取 Voice UI 配置服务
   */
  getVoiceUI(): VoiceUIConfigService {
    return this.voiceUI;
  }

  /**
   * 获取 Bloom Viz 配置服务
   */
  getBloomViz(): Neo4jBloomConfigService {
    return this.bloomViz;
  }

  // ============ 会话管理 ============

  /**
   * 创建用户会话
   */
  createSession(userId: string, platform: UserSession['platform'], metadata?: Record<string, unknown>): UserSession {
    const session: UserSession = {
      id: this.generateId(),
      userId,
      platform,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      metadata: metadata || {},
    };

    this.sessions.set(session.id, session);
    this.emit('session:created', session);
    return session;
  }

  /**
   * 获取会话
   */
  getSession(id: string): UserSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * 更新会话活动时间
   */
  updateSessionActivity(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActivityAt = Date.now();
    }
  }

  /**
   * 结束会话
   */
  endSession(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      this.sessions.delete(id);
      this.emit('session:ended', session);
    }
  }

  /**
   * 获取活跃会话数
   */
  getActiveSessions(platform?: UserSession['platform']): UserSession[] {
    const sessions = Array.from(this.sessions.values());
    if (platform) {
      return sessions.filter(s => s.platform === platform);
    }
    return sessions;
  }

  /**
   * 清理过期会话
   */
  cleanupExpiredSessions(maxIdleTime: number = 30 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    const sessionEntries = Array.from(this.sessions.entries());
    for (const [id, session] of sessionEntries) {
      if (now - session.lastActivityAt > maxIdleTime) {
        this.sessions.delete(id);
        cleaned++;
        this.emit('session:expired', session);
      }
    }

    return cleaned;
  }

  // ============ 健康检查 ============

  /**
   * 更新健康状态
   */
  private updateHealthStatus(component: string, healthy: boolean, message?: string): void {
    this.healthStatuses.set(component, {
      component,
      healthy,
      message,
      lastCheck: Date.now(),
    });
  }

  /**
   * 执行健康检查
   */
  async healthCheck(): Promise<HealthStatus[]> {
    const statuses: HealthStatus[] = [];

    // GraphQL Gateway 健康检查
    try {
      const graphqlHealth = await this.graphqlGateway.healthCheck();
      this.updateHealthStatus('graphql', graphqlHealth.healthy, 
        graphqlHealth.healthy ? 'OK' : 'Unhealthy subgraphs detected');
    } catch (error) {
      this.updateHealthStatus('graphql', false, String(error));
    }

    // 其他组件状态（配置服务始终健康）
    this.updateHealthStatus('web', true, 'Web Portal configured');
    this.updateHealthStatus('mobile', true, 'Mobile App configured');
    this.updateHealthStatus('voice', true, 'Voice UI configured');
    this.updateHealthStatus('bloom', true, 'Bloom Viz configured');

    return Array.from(this.healthStatuses.values());
  }

  /**
   * 获取所有健康状态
   */
  getHealthStatuses(): HealthStatus[] {
    return Array.from(this.healthStatuses.values());
  }

  /**
   * 检查整体健康状态
   */
  isHealthy(): boolean {
    const statuses = Array.from(this.healthStatuses.values());
    return statuses.every(s => s.healthy);
  }

  // ============ 统计信息 ============

  /**
   * 获取交互层统计信息
   */
  getStats(): InteractionStats {
    const graphqlStats = this.graphqlGateway.getStats();
    const voiceStats = this.voiceUI.getStats();
    const bloomStats = this.bloomViz.getStats();

    const webSessions = this.getActiveSessions('web');
    const mobileSessions = this.getActiveSessions('mobile');

    return {
      graphql: {
        totalQueries: graphqlStats.totalQueries,
        cacheHitRate: graphqlStats.cacheHits / Math.max(graphqlStats.totalQueries, 1),
        avgLatency: graphqlStats.avgLatencyMs,
        activeSubscriptions: this.graphqlGateway.getStatus().activeSubscriptions,
      },
      web: {
        activeUsers: webSessions.length,
        pageViews: 0, // 需要实际实现
        avgSessionDuration: this.calculateAvgSessionDuration(webSessions),
      },
      mobile: {
        activeDevices: mobileSessions.length,
        pushNotificationsSent: 0, // 需要实际实现
        syncOperations: 0, // 需要实际实现
      },
      voice: {
        totalTranscriptions: voiceStats.totalTranscriptions,
        commandSuccessRate: voiceStats.successfulCommands / Math.max(voiceStats.totalCommands, 1),
        avgConfidence: voiceStats.avgConfidence,
      },
      bloom: {
        nodesDisplayed: bloomStats.visibleNodeCount,
        relationshipsDisplayed: bloomStats.relationshipCount,
        searchQueries: 0, // 需要实际实现
      },
    };
  }

  private calculateAvgSessionDuration(sessions: UserSession[]): number {
    if (sessions.length === 0) return 0;
    const now = Date.now();
    const totalDuration = sessions.reduce((sum, s) => sum + (now - s.startedAt), 0);
    return totalDuration / sessions.length;
  }

  // ============ 统一 API 处理 ============

  /**
   * 处理 GraphQL 请求
   */
  async handleGraphQLRequest(
    query: string,
    variables?: Record<string, unknown>,
    context?: { userId?: string; sessionId?: string }
  ): Promise<unknown> {
    if (context?.sessionId) {
      this.updateSessionActivity(context.sessionId);
    }

    return this.graphqlGateway.executeQuery({
      id: this.generateId(),
      query,
      variables,
      operationName: undefined,
    });
  }

  /**
   * 处理语音输入
   */
  async handleVoiceInput(audioData: ArrayBuffer): Promise<{
    transcription: string;
    command?: { intent: string; slots: Record<string, unknown> };
    response?: string;
  }> {
    // 语音转文字
    const transcription = await this.voiceUI.transcribe(audioData);

    // 解析命令
    const parseResult = this.voiceUI.parseCommand(transcription.text);

    if (parseResult.success && parseResult.intent) {
      // 获取命令配置
      const commands = this.voiceUI.getCommands();
      const command = commands.find(c => c.intent === parseResult.intent);

      return {
        transcription: transcription.text,
        command: {
          intent: parseResult.intent,
          slots: parseResult.slots || {},
        },
        response: command ? this.voiceUI.generateResponse(command, parseResult.slots || {}) : undefined,
      };
    }

    return { transcription: transcription.text };
  }

  /**
   * 处理图谱搜索
   */
  handleGraphSearch(query: string): unknown[] {
    return this.bloomViz.search(query);
  }

  // ============ 配置同步 ============

  /**
   * 同步主题配置到所有平台
   */
  syncTheme(theme: { primaryColor: string; mode: 'light' | 'dark' }): void {
    // 同步到 Web Portal
    this.webPortal.setPrimaryColor(theme.primaryColor);
    this.webPortal.setThemeMode(theme.mode);

    // 发出主题同步事件
    this.emit('theme:synced', theme);
  }

  /**
   * 同步语言配置到所有平台
   */
  syncLanguage(locale: string): void {
    // 同步到 Web Portal
    this.webPortal.setDefaultLocale(locale);

    // 同步到 Voice UI
    this.voiceUI.setDefaultLanguage(locale);

    // 发出语言同步事件
    this.emit('language:synced', locale);
  }

  // ============ 辅助方法 ============

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}

// 导出单例
export const interactionManager = new InteractionManager();
