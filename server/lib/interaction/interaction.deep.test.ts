/**
 * 用户交互层深度单元测试
 * 
 * 验证核心逻辑的正确性
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphQLGateway } from './graphqlGateway';
import { WebPortalConfigService } from './webPortalConfig';
import { MobileAppConfigService } from './mobileAppConfig';
import { VoiceUIConfigService, XILIAN_VOICE_COMMANDS } from './voiceUIConfig';
import { Neo4jBloomConfigService } from './neo4jBloomConfig';
import { InteractionManager } from './interactionManager';

// ============ GraphQL Gateway 深度测试 ============

describe('GraphQL Gateway 深度测试', () => {
  let gateway: GraphQLGateway;

  beforeEach(async () => {
    gateway = new GraphQLGateway({
      batchingEnabled: true,
      batchingMaxSize: 10,
    });
    await gateway.initialize();
  });

  afterEach(async () => {
    await gateway.close();
  });

  describe('查询缓存', () => {
    it('应该正确执行查询', async () => {
      const query = { id: '1', query: 'query { devices { id } }', variables: { limit: 10 } };
      const result = await gateway.executeQuery(query);
      
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it('应该记录查询统计', async () => {
      const query = { id: '1', query: 'query { devices { id } }' };
      await gateway.executeQuery(query);
      
      const stats = gateway.getStats();
      expect(stats.totalQueries).toBeGreaterThanOrEqual(1);
    });
  });

  describe('批量查询', () => {
    it('应该正确创建和执行批量查询', async () => {
      const queries = [
        { id: '1', query: 'query { device(id: "1") { name } }' },
        { id: '2', query: 'query { device(id: "2") { name } }' },
        { id: '3', query: 'query { device(id: "3") { name } }' },
      ];
      const batch = gateway.createBatch(queries);

      const results = await gateway.executeBatch(batch.id);
      
      expect(results).toHaveLength(3);
      expect(results[0].queryId).toBe('1');
      expect(results[1].queryId).toBe('2');
      expect(results[2].queryId).toBe('3');
    });
  });

  describe('订阅管理', () => {
    it('应该正确创建和管理订阅', async () => {
      const events: unknown[] = [];
      
      const subId = gateway.subscribe(
        'subscription { deviceUpdated { id status } }',
        {},
        (data) => events.push(data)
      );

      expect(subId).toBeDefined();
      
      const subscriptions = gateway.getSubscriptions();
      expect(subscriptions.length).toBeGreaterThanOrEqual(1);

      // 取消订阅
      gateway.unsubscribe(subId);
      
      const afterUnsubscribe = gateway.getSubscriptions();
      expect(afterUnsubscribe.find(s => s.id === subId)).toBeUndefined();
    });
  });

  describe('操作类型解析', () => {
    it('应该正确识别查询和变更', async () => {
      await gateway.executeQuery({ id: '1', query: 'query { devices { id } }' });
      await gateway.executeQuery({ id: '2', query: 'mutation { createDevice(name: "test") { id } }' });

      const stats = gateway.getStats();
      expect(stats.totalQueries).toBeGreaterThanOrEqual(1);
      expect(stats.totalMutations).toBeGreaterThanOrEqual(1);
    });
  });
});

// ============ Web Portal 深度测试 ============

describe('Web Portal 深度测试', () => {
  let webPortal: WebPortalConfigService;

  beforeEach(() => {
    webPortal = new WebPortalConfigService();
  });

  describe('路由配置', () => {
    it('应该包含所有必需的路由', () => {
      const routes = webPortal.getRoutes();
      
      // 检查核心路由
      expect(routes.find(r => r.path === '/')).toBeDefined();
      expect(routes.find(r => r.path === '/dashboard')).toBeDefined();
      expect(routes.find(r => r.path === '/devices')).toBeDefined();
      expect(routes.find(r => r.path === '/knowledge')).toBeDefined();
    });

    it('应该正确配置嵌套路由', () => {
      const routes = webPortal.getRoutes();
      
      const devicesRoute = routes.find(r => r.path === '/devices');
      expect(devicesRoute?.children).toBeDefined();
      expect(devicesRoute?.children?.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('主题配置', () => {
    it('应该支持主题切换', () => {
      const initialTheme = webPortal.getTheme();
      expect(initialTheme.mode).toBeDefined();

      webPortal.setThemeMode('dark');
      expect(webPortal.getTheme().mode).toBe('dark');

      webPortal.setThemeMode('light');
      expect(webPortal.getTheme().mode).toBe('light');
    });

    it('应该支持自定义颜色', () => {
      webPortal.setPrimaryColor('#ff0000');
      expect(webPortal.getTheme().primaryColor).toBe('#ff0000');
    });
  });

  describe('国际化配置', () => {
    it('应该支持多语言', () => {
      const i18n = webPortal.getI18nConfig();
      
      expect(i18n.supportedLocales).toContain('zh-CN');
      expect(i18n.supportedLocales).toContain('en-US');
    });
  });

  describe('组件配置', () => {
    it('应该正确配置组件', () => {
      const components = webPortal.getComponents();
      expect(components.length).toBeGreaterThan(0);
    });
  });
});

// ============ Mobile App 深度测试 ============

describe('Mobile App 深度测试', () => {
  let mobileApp: MobileAppConfigService;

  beforeEach(() => {
    mobileApp = new MobileAppConfigService();
  });

  describe('离线存储配置', () => {
    it('应该正确配置离线存储', () => {
      const offline = mobileApp.getOfflineConfig();
      
      expect(offline.enabled).toBe(true);
      expect(offline.storage.type).toBe('sqlite');
      expect(offline.storage.encryption).toBe(true);
    });

    it('应该生成有效的 SQLite Schema', () => {
      const schema = mobileApp.generateOfflineSchema();
      
      expect(schema).toContain('CREATE TABLE');
      expect(schema).toContain('cached_devices');
    });
  });

  describe('同步配置', () => {
    it('应该正确配置同步策略', () => {
      const sync = mobileApp.getSyncConfig();
      
      expect(sync.enabled).toBe(true);
      expect(['periodic', 'realtime', 'manual']).toContain(sync.strategy);
      expect(['server-wins', 'client-wins', 'manual']).toContain(sync.conflictResolution);
    });

    it('应该正确配置重试策略', () => {
      const sync = mobileApp.getSyncConfig();
      
      expect(sync.retryPolicy.maxRetries).toBeGreaterThan(0);
      expect(sync.retryPolicy.backoffMultiplier).toBeGreaterThan(1);
    });
  });

  describe('推送通知配置', () => {
    it('应该正确配置推送通知', () => {
      const push = mobileApp.getPushConfig();
      
      expect(push.enabled).toBe(true);
      expect(push.providers.apns.enabled).toBe(true);
      expect(push.providers.fcm.enabled).toBe(true);
    });
  });

  describe('原生功能配置', () => {
    it('应该正确配置相机功能', () => {
      const native = mobileApp.getNativeConfig();
      
      expect(native.camera.enabled).toBe(true);
    });

    it('应该正确配置定位功能', () => {
      const native = mobileApp.getNativeConfig();
      
      expect(native.location.enabled).toBe(true);
      expect(['high', 'balanced', 'low']).toContain(native.location.accuracy);
    });
  });
});

// ============ Voice UI 深度测试 ============

describe('Voice UI 深度测试', () => {
  let voiceUI: VoiceUIConfigService;

  beforeEach(() => {
    voiceUI = new VoiceUIConfigService();
  });

  describe('命令解析', () => {
    it('应该正确解析设备列表命令', () => {
      const result = voiceUI.parseCommand('列出所有设备');
      
      expect(result.success).toBe(true);
      expect(result.intent).toBe('list_devices');
    });

    it('应该正确处理无法识别的命令', () => {
      const result = voiceUI.parseCommand('这是一个完全无关的句子');
      
      expect(result.success).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe('命令管理', () => {
    it('应该包含所有预定义命令', () => {
      const commands = voiceUI.getCommands();
      
      expect(commands.length).toBeGreaterThanOrEqual(XILIAN_VOICE_COMMANDS.length);
    });

    it('应该支持按类别获取命令', () => {
      const deviceCommands = voiceUI.getCommandsByCategory('device');
      
      expect(deviceCommands.length).toBeGreaterThan(0);
    });

    it('应该支持添加自定义命令', () => {
      const customCommand = {
        id: 'custom_1',
        patterns: ['自定义命令'],
        intent: 'custom_action',
        slots: [],
        action: 'doCustomAction',
        response: '执行自定义操作',
        requiresConfirmation: false,
        category: 'custom',
      };

      voiceUI.addCommand(customCommand);
      
      const commands = voiceUI.getCommands();
      expect(commands.find(c => c.id === 'custom_1')).toBeDefined();
    });
  });

  describe('TTS 配置', () => {
    it('应该正确配置 TTS', () => {
      const tts = voiceUI.getTTSConfig();
      
      expect(tts.enabled).toBe(true);
      expect(tts.provider).toBeDefined();
    });

    it('应该支持调整语速', () => {
      voiceUI.setTTSSpeed(1.5);
      expect(voiceUI.getTTSConfig().speed).toBe(1.5);
    });
  });

  describe('多语言支持', () => {
    it('应该支持多种语言', () => {
      const languages = voiceUI.getLanguages();
      
      expect(languages.find(l => l.code === 'zh-CN')).toBeDefined();
      expect(languages.find(l => l.code === 'en-US')).toBeDefined();
    });

    it('应该正确切换默认语言', () => {
      voiceUI.setDefaultLanguage('en-US');
      const config = voiceUI.getConfig();
      expect(config.languages.defaultLanguage).toBe('en-US');

      voiceUI.setDefaultLanguage('zh-CN');
      const config2 = voiceUI.getConfig();
      expect(config2.languages.defaultLanguage).toBe('zh-CN');
    });
  });
});

// ============ Neo4j Bloom 深度测试 ============

describe('Neo4j Bloom 深度测试', () => {
  let bloomViz: Neo4jBloomConfigService;

  beforeEach(() => {
    bloomViz = new Neo4jBloomConfigService();
  });

  describe('节点样式', () => {
    it('应该包含所有预定义节点样式', () => {
      const styles = bloomViz.getNodeStyles();
      
      expect(styles.find(s => s.label === 'Equipment')).toBeDefined();
      expect(styles.find(s => s.label === 'Component')).toBeDefined();
      expect(styles.find(s => s.label === 'Fault')).toBeDefined();
      expect(styles.find(s => s.label === 'Solution')).toBeDefined();
    });

    it('应该支持自定义节点样式', () => {
      bloomViz.setNodeStyle('CustomNode', {
        color: '#ff0000',
        size: 40,
        shape: 'diamond',
      });

      const style = bloomViz.getNodeStyle('CustomNode');
      expect(style?.color).toBe('#ff0000');
      expect(style?.size).toBe(40);
      expect(style?.shape).toBe('diamond');
    });
  });

  describe('关系样式', () => {
    it('应该包含所有预定义关系样式', () => {
      const styles = bloomViz.getRelationshipStyles();
      
      expect(styles.find(s => s.type === 'HAS_PART')).toBeDefined();
      expect(styles.find(s => s.type === 'CAUSES')).toBeDefined();
      expect(styles.find(s => s.type === 'SIMILAR_TO')).toBeDefined();
      expect(styles.find(s => s.type === 'RESOLVED_BY')).toBeDefined();
    });

    it('应该支持自定义关系样式', () => {
      bloomViz.setRelationshipStyle('CUSTOM_REL', {
        color: '#00ff00',
        width: 4,
        style: 'dashed',
      });

      const style = bloomViz.getRelationshipStyle('CUSTOM_REL');
      expect(style?.color).toBe('#00ff00');
      expect(style?.width).toBe(4);
      expect(style?.style).toBe('dashed');
    });
  });

  describe('布局配置', () => {
    it('应该支持多种布局算法', () => {
      const layout = bloomViz.getLayoutConfig();
      
      expect(['force-directed', 'hierarchical', 'circular', 'grid', 'radial', 'tree'])
        .toContain(layout.algorithm);
    });

    it('应该支持切换布局算法', () => {
      bloomViz.setLayoutAlgorithm('hierarchical');
      expect(bloomViz.getLayoutConfig().algorithm).toBe('hierarchical');

      bloomViz.setLayoutAlgorithm('circular');
      expect(bloomViz.getLayoutConfig().algorithm).toBe('circular');
    });

    it('应该支持调整力导向参数', () => {
      bloomViz.setForceDirectedParams({
        strength: 0.5,
        distance: 200,
      });

      const layout = bloomViz.getLayoutConfig();
      expect(layout.forceDirected.strength).toBe(0.5);
      expect(layout.forceDirected.distance).toBe(200);
    });
  });

  describe('搜索功能', () => {
    it('应该支持全文搜索', () => {
      // 添加测试数据
      bloomViz.setGraphData({
        nodes: [
          { id: '1', label: 'Equipment', properties: { name: '起重机', description: '港口起重设备' } },
          { id: '2', label: 'Equipment', properties: { name: '叉车', description: '仓库搬运设备' } },
        ],
        relationships: [],
      });

      const results = bloomViz.search('起重');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].label).toBe('Equipment');
    });
  });

  describe('导出功能', () => {
    it('应该支持多种导出格式', () => {
      const config = bloomViz.getExportConfig();
      
      expect(config.formats).toContain('png');
      expect(config.formats).toContain('svg');
      expect(config.formats).toContain('json');
    });

    it('应该正确导出 JSON 格式', () => {
      bloomViz.setGraphData({
        nodes: [{ id: '1', label: 'Test', properties: {} }],
        relationships: [],
      });

      const exported = bloomViz.exportToJSON();
      
      expect(exported).toBeDefined();
      const parsed = JSON.parse(exported);
      expect(parsed.data).toBeDefined();
    });
  });

  describe('视角管理', () => {
    it('应该支持创建和切换视角', () => {
      bloomViz.addPerspective({
        id: 'fault-analysis',
        name: '故障分析视角',
        description: '专注于故障相关节点和关系',
        filters: {
          nodeLabels: ['Fault', 'Solution'],
          relationshipTypes: ['CAUSES', 'RESOLVED_BY'],
        },
        styles: {
          nodes: [{ label: 'Fault', color: '#ff0000', size: 40, shape: 'circle' }],
          relationships: [{ type: 'CAUSES', color: '#ff0000', width: 3, style: 'solid', arrow: true, arrowSize: 8, curvature: 0 }],
        },
      });

      const perspectives = bloomViz.getPerspectives();
      expect(perspectives.find(p => p.id === 'fault-analysis')).toBeDefined();

      bloomViz.setCurrentPerspective('fault-analysis');
      expect(bloomViz.getCurrentPerspective()?.id).toBe('fault-analysis');
    });
  });
});

// ============ InteractionManager 深度测试 ============

describe('InteractionManager 深度测试', () => {
  let manager: InteractionManager;

  beforeEach(async () => {
    manager = new InteractionManager();
    await manager.initialize();
  });

  afterEach(async () => {
    await manager.close();
  });

  describe('会话管理', () => {
    it('应该正确创建和管理会话', () => {
      const session = manager.createSession('user-1', 'web');
      
      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      
      const retrievedSession = manager.getSession(session.id);
      expect(retrievedSession?.userId).toBe('user-1');
      expect(retrievedSession?.platform).toBe('web');
    });

    it('应该正确更新会话活动时间', () => {
      const session = manager.createSession('user-1', 'web');
      const initialTime = session.lastActivityAt;

      // 模拟活动
      manager.updateSessionActivity(session.id);
      
      const session2 = manager.getSession(session.id);
      expect(session2?.lastActivityAt).toBeGreaterThanOrEqual(initialTime);
    });

    it('应该正确结束会话', () => {
      const session = manager.createSession('user-1', 'web');
      
      manager.endSession(session.id);
      
      const retrievedSession = manager.getSession(session.id);
      expect(retrievedSession).toBeUndefined();
    });

    it('应该支持获取活跃会话', () => {
      manager.createSession('user-1', 'web');
      manager.createSession('user-1', 'mobile');
      manager.createSession('user-2', 'web');

      const allSessions = manager.getActiveSessions();
      expect(allSessions.length).toBe(3);

      const webSessions = manager.getActiveSessions('web');
      expect(webSessions.length).toBe(2);

      const mobileSessions = manager.getActiveSessions('mobile');
      expect(mobileSessions.length).toBe(1);
    });
  });

  describe('健康状态', () => {
    it('应该返回初始化状态', () => {
      expect(manager.isInitialized()).toBe(true);
    });

    it('关闭后应该返回未初始化状态', async () => {
      await manager.close();
      expect(manager.isInitialized()).toBe(false);
      // 重新初始化以便后续测试
      await manager.initialize();
    });
  });

  describe('统计信息', () => {
    it('应该返回所有组件的统计信息', async () => {
      const stats = await manager.getStats();
      
      expect(stats.graphql).toBeDefined();
      expect(stats.web).toBeDefined();
      expect(stats.mobile).toBeDefined();
      expect(stats.voice).toBeDefined();
      expect(stats.bloom).toBeDefined();
    });
  });

  describe('组件访问', () => {
    it('应该能访问 GraphQL Gateway', () => {
      const gateway = manager.getGraphQLGateway();
      expect(gateway).toBeDefined();
    });

    it('应该能访问 Web Portal 配置', () => {
      const webPortal = manager.getWebPortal();
      expect(webPortal).toBeDefined();
    });

    it('应该能访问 Mobile App 配置', () => {
      const mobileApp = manager.getMobileApp();
      expect(mobileApp).toBeDefined();
    });

    it('应该能访问 Voice UI 配置', () => {
      const voiceUI = manager.getVoiceUI();
      expect(voiceUI).toBeDefined();
    });

    it('应该能访问 Bloom Viz 配置', () => {
      const bloomViz = manager.getBloomViz();
      expect(bloomViz).toBeDefined();
    });
  });
});
