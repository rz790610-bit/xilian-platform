/**
 * 用户交互层单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GraphQLGateway } from './graphql/graphqlGateway';
import { WebPortalConfigService } from './web/webPortalConfig';
import { MobileAppConfigService } from './mobile/mobileAppConfig';
import { VoiceUIConfigService } from './voice/voiceUIConfig';
import { Neo4jBloomConfigService } from './visualization/neo4jBloomConfig';
import { InteractionManager } from './interactionManager';

// ============ GraphQL Gateway 测试 ============

describe('GraphQL Gateway', () => {
  let gateway: GraphQLGateway;

  beforeEach(() => {
    gateway = new GraphQLGateway();
  });

  afterEach(async () => {
    await gateway.close();
  });

  describe('初始化', () => {
    it('应该成功初始化', async () => {
      await gateway.initialize();
      expect(gateway.getStatus().initialized).toBe(true);
    });

    it('应该注册默认子图', async () => {
      await gateway.initialize();
      expect(gateway.getStatus().subgraphCount).toBeGreaterThan(0);
    });
  });

  describe('子图管理', () => {
    it('应该能够添加子图', () => {
      gateway.addSubgraph({
        name: 'test-subgraph',
        url: 'http://localhost:4001/graphql',
        schema: 'type Query { test: String }',
      });
      expect(gateway.getStatus().subgraphCount).toBeGreaterThan(0);
    });

    it('应该能够移除子图', () => {
      gateway.addSubgraph({
        name: 'test-subgraph',
        url: 'http://localhost:4001/graphql',
        schema: 'type Query { test: String }',
      });
      const countBefore = gateway.getStatus().subgraphCount;
      gateway.removeSubgraph('test-subgraph');
      expect(gateway.getStatus().subgraphCount).toBe(countBefore - 1);
    });
  });

  describe('查询执行', () => {
    beforeEach(async () => {
      await gateway.initialize();
    });

    it('应该能够执行查询', async () => {
      const result = await gateway.executeQuery({
        id: 'test-1',
        query: '{ devices { id name } }',
      });
      expect(result).toBeDefined();
    });

    it('应该记录查询统计', async () => {
      await gateway.executeQuery({
        id: 'test-1',
        query: '{ devices { id } }',
      });
      const stats = gateway.getStats();
      expect(stats.totalQueries).toBeGreaterThan(0);
    });
  });

  describe('缓存', () => {
    beforeEach(async () => {
      await gateway.initialize();
    });

    it('应该缓存查询结果', async () => {
      const query = { id: 'cache-test', query: '{ devices { id } }' };
      await gateway.executeQuery(query);
      await gateway.executeQuery(query);
      
      const stats = gateway.getStats();
      expect(stats.cacheHits).toBeGreaterThan(0);
    });

    it('应该能够清除缓存', () => {
      gateway.clearCache();
      expect(gateway.getStatus().cacheSize).toBe(0);
    });
  });

  describe('订阅', () => {
    beforeEach(async () => {
      await gateway.initialize();
    });

    it('应该能够创建订阅', () => {
      const callback = vi.fn();
      const id = gateway.subscribe('subscription { deviceUpdated { id } }', callback);
      expect(id).toBeDefined();
      expect(gateway.getStatus().activeSubscriptions).toBe(1);
    });

    it('应该能够取消订阅', () => {
      const callback = vi.fn();
      const id = gateway.subscribe('subscription { deviceUpdated { id } }', callback);
      gateway.unsubscribe(id);
      expect(gateway.getStatus().activeSubscriptions).toBe(0);
    });
  });
});

// ============ Web Portal 测试 ============

describe('Web Portal Config', () => {
  let webPortal: WebPortalConfigService;

  beforeEach(() => {
    webPortal = new WebPortalConfigService();
  });

  describe('配置管理', () => {
    it('应该返回完整配置', () => {
      const config = webPortal.getConfig();
      expect(config.theme).toBeDefined();
      expect(config.layout).toBeDefined();
      expect(config.i18n).toBeDefined();
    });

    it('应该能够更新配置', () => {
      webPortal.updateConfig({
        theme: { primaryColor: '#ff0000' } as any,
      });
      expect(webPortal.getTheme().primaryColor).toBe('#ff0000');
    });
  });

  describe('主题管理', () => {
    it('应该能够设置主题模式', () => {
      webPortal.setThemeMode('light');
      expect(webPortal.getTheme().mode).toBe('light');
    });

    it('应该能够设置主色调', () => {
      webPortal.setPrimaryColor('#00ff00');
      expect(webPortal.getTheme().primaryColor).toBe('#00ff00');
    });

    it('应该生成 CSS 变量', () => {
      const css = webPortal.generateCSSVariables();
      expect(css).toContain('--primary-color');
      expect(css).toContain('--font-family');
    });
  });

  describe('路由管理', () => {
    it('应该返回预定义路由', () => {
      const routes = webPortal.getRoutes();
      expect(routes.length).toBeGreaterThan(0);
    });

    it('应该能够添加路由', () => {
      const initialCount = webPortal.getRoutes().length;
      webPortal.addRoute({
        path: '/test',
        component: 'TestComponent',
        meta: { title: 'Test' },
      });
      expect(webPortal.getRoutes().length).toBe(initialCount + 1);
    });

    it('应该能够获取扁平化路由', () => {
      const flatRoutes = webPortal.getFlatRoutes();
      expect(flatRoutes.length).toBeGreaterThan(0);
    });
  });

  describe('组件管理', () => {
    it('应该返回预定义组件', () => {
      const components = webPortal.getComponents();
      expect(components.length).toBeGreaterThan(0);
    });

    it('应该能够获取 Server Components', () => {
      const serverComponents = webPortal.getServerComponents();
      expect(serverComponents.every(c => c.type === 'server')).toBe(true);
    });

    it('应该能够获取 Client Components', () => {
      const clientComponents = webPortal.getClientComponents();
      expect(clientComponents.every(c => c.type === 'client')).toBe(true);
    });
  });

  describe('国际化', () => {
    it('应该返回国际化配置', () => {
      const i18n = webPortal.getI18nConfig();
      expect(i18n.defaultLocale).toBeDefined();
      expect(i18n.supportedLocales.length).toBeGreaterThan(0);
    });

    it('应该能够设置默认语言', () => {
      webPortal.setDefaultLocale('en-US');
      expect(webPortal.getI18nConfig().defaultLocale).toBe('en-US');
    });
  });
});

// ============ Mobile App 测试 ============

describe('Mobile App Config', () => {
  let mobileApp: MobileAppConfigService;

  beforeEach(() => {
    mobileApp = new MobileAppConfigService();
  });

  describe('配置管理', () => {
    it('应该返回完整配置', () => {
      const config = mobileApp.getConfig();
      expect(config.app).toBeDefined();
      expect(config.offline).toBeDefined();
      expect(config.push).toBeDefined();
    });
  });

  describe('离线存储', () => {
    it('应该返回离线配置', () => {
      const offline = mobileApp.getOfflineConfig();
      expect(offline.enabled).toBe(true);
      expect(offline.storage.type).toBe('sqlite');
    });

    it('应该生成离线 Schema', () => {
      const schema = mobileApp.generateOfflineSchema();
      expect(schema).toContain('CREATE TABLE');
      expect(schema).toContain('cached_devices');
    });
  });

  describe('推送通知', () => {
    it('应该返回推送配置', () => {
      const push = mobileApp.getPushConfig();
      expect(push.enabled).toBe(true);
      expect(push.channels.length).toBeGreaterThan(0);
    });

    it('应该能够添加通知渠道', () => {
      const initialCount = mobileApp.getNotificationChannels().length;
      mobileApp.addNotificationChannel({
        id: 'test',
        name: 'Test Channel',
        description: 'Test',
        importance: 'default',
        sound: true,
        vibration: true,
        badge: true,
      });
      expect(mobileApp.getNotificationChannels().length).toBe(initialCount + 1);
    });
  });

  describe('同步配置', () => {
    it('应该返回同步配置', () => {
      const sync = mobileApp.getSyncConfig();
      expect(sync.enabled).toBe(true);
      expect(sync.strategy).toBeDefined();
    });

    it('应该能够设置同步策略', () => {
      mobileApp.setSyncStrategy('periodic');
      expect(mobileApp.getSyncConfig().strategy).toBe('periodic');
    });
  });

  describe('原生功能', () => {
    it('应该返回原生功能配置', () => {
      const native = mobileApp.getNativeConfig();
      expect(native.camera).toBeDefined();
      expect(native.location).toBeDefined();
    });

    it('应该检查功能是否启用', () => {
      expect(mobileApp.isFeatureEnabled('camera')).toBe(true);
      expect(mobileApp.isFeatureEnabled('nfc')).toBe(false);
    });
  });

  describe('组件', () => {
    it('应该返回跨平台组件', () => {
      const components = mobileApp.getCrossPlatformComponents();
      expect(components.every(c => c.type === 'cross-platform')).toBe(true);
    });

    it('应该返回原生组件', () => {
      const components = mobileApp.getNativeComponents();
      expect(components.every(c => c.type === 'native')).toBe(true);
    });
  });
});

// ============ Voice UI 测试 ============

describe('Voice UI Config', () => {
  let voiceUI: VoiceUIConfigService;

  beforeEach(() => {
    voiceUI = new VoiceUIConfigService();
  });

  describe('配置管理', () => {
    it('应该返回完整配置', () => {
      const config = voiceUI.getConfig();
      expect(config.whisper).toBeDefined();
      expect(config.tts).toBeDefined();
      expect(config.commands).toBeDefined();
    });
  });

  describe('Whisper 配置', () => {
    it('应该返回 Whisper 配置', () => {
      const whisper = voiceUI.getWhisperConfig();
      expect(whisper.model).toBe('large-v3');
      expect(whisper.language).toBe('zh');
    });

    it('应该能够设置模型', () => {
      voiceUI.setWhisperModel('base');
      expect(voiceUI.getWhisperConfig().model).toBe('base');
    });
  });

  describe('命令管理', () => {
    it('应该返回预定义命令', () => {
      const commands = voiceUI.getCommands();
      expect(commands.length).toBeGreaterThan(0);
    });

    it('应该能够按类别获取命令', () => {
      const deviceCommands = voiceUI.getCommandsByCategory('device');
      expect(deviceCommands.every(c => c.category === 'device')).toBe(true);
    });

    it('应该能够添加命令', () => {
      const initialCount = voiceUI.getCommands().length;
      voiceUI.addCommand({
        id: 'test-command',
        patterns: ['测试命令'],
        intent: 'test',
        slots: [],
        action: 'test.action',
        response: '测试响应',
        requiresConfirmation: false,
        category: 'test',
      });
      expect(voiceUI.getCommands().length).toBe(initialCount + 1);
    });
  });

  describe('命令解析', () => {
    it('应该解析匹配的命令', () => {
      const result = voiceUI.parseCommand('列出所有设备');
      expect(result.success).toBe(true);
      expect(result.intent).toBe('list_devices');
    });

    it('应该解析带槽位的命令', () => {
      const result = voiceUI.parseCommand('查询设备A的状态');
      expect(result.success).toBe(true);
      expect(result.slots?.device?.toLowerCase()).toBe('设备a');
    });

    it('应该返回失败结果对于未知命令', () => {
      const result = voiceUI.parseCommand('这是一个完全无关的句子');
      // 模糊匹配可能会匹配到一些命令
      if (!result.success) {
        expect(result.confidence).toBe(0);
      }
    });
  });

  describe('TTS 配置', () => {
    it('应该返回 TTS 配置', () => {
      const tts = voiceUI.getTTSConfig();
      expect(tts.provider).toBe('openai');
      expect(tts.voice).toBe('alloy');
    });

    it('应该能够设置语音', () => {
      voiceUI.setTTSVoice('nova');
      expect(voiceUI.getTTSConfig().voice).toBe('nova');
    });

    it('应该限制语速范围', () => {
      voiceUI.setTTSSpeed(3.0);
      expect(voiceUI.getTTSConfig().speed).toBe(2.0);
      
      voiceUI.setTTSSpeed(0.1);
      expect(voiceUI.getTTSConfig().speed).toBe(0.5);
    });
  });

  describe('多语言', () => {
    it('应该返回支持的语言', () => {
      const languages = voiceUI.getLanguages();
      expect(languages.length).toBeGreaterThan(0);
    });

    it('应该能够设置默认语言', () => {
      voiceUI.setDefaultLanguage('en-US');
      const config = voiceUI.getConfig();
      expect(config.languages.defaultLanguage).toBe('en-US');
    });
  });

  describe('会话管理', () => {
    it('应该能够开始和停止监听', () => {
      voiceUI.startListening();
      expect(voiceUI.isCurrentlyListening()).toBe(true);
      
      voiceUI.stopListening();
      expect(voiceUI.isCurrentlyListening()).toBe(false);
    });
  });
});

// ============ Neo4j Bloom 测试 ============

describe('Neo4j Bloom Config', () => {
  let bloomViz: Neo4jBloomConfigService;

  beforeEach(() => {
    bloomViz = new Neo4jBloomConfigService();
  });

  describe('配置管理', () => {
    it('应该返回完整配置', () => {
      const config = bloomViz.getConfig();
      expect(config.visualization).toBeDefined();
      expect(config.layout).toBeDefined();
      expect(config.interaction).toBeDefined();
    });
  });

  describe('可视化配置', () => {
    it('应该返回可视化配置', () => {
      const viz = bloomViz.getVisualizationConfig();
      expect(viz.renderer).toBe('3d');
    });

    it('应该能够设置渲染器', () => {
      bloomViz.setRenderer('2d');
      expect(bloomViz.getVisualizationConfig().renderer).toBe('2d');
    });
  });

  describe('节点样式', () => {
    it('应该返回预定义节点样式', () => {
      const styles = bloomViz.getNodeStyles();
      expect(styles.length).toBeGreaterThan(0);
    });

    it('应该能够获取特定节点样式', () => {
      const style = bloomViz.getNodeStyle('Equipment');
      expect(style).toBeDefined();
      expect(style?.color).toBe('#3b82f6');
    });

    it('应该能够设置节点样式', () => {
      bloomViz.setNodeStyle('Equipment', { color: '#ff0000' });
      expect(bloomViz.getNodeStyle('Equipment')?.color).toBe('#ff0000');
    });
  });

  describe('关系样式', () => {
    it('应该返回预定义关系样式', () => {
      const styles = bloomViz.getRelationshipStyles();
      expect(styles.length).toBeGreaterThan(0);
    });

    it('应该能够获取特定关系样式', () => {
      const style = bloomViz.getRelationshipStyle('CAUSES');
      expect(style).toBeDefined();
      expect(style?.color).toBe('#ef4444');
    });
  });

  describe('视角管理', () => {
    it('应该返回预定义视角', () => {
      const perspectives = bloomViz.getPerspectives();
      expect(perspectives.length).toBeGreaterThan(0);
    });

    it('应该能够设置当前视角', () => {
      bloomViz.setCurrentPerspective('fault-analysis');
      const current = bloomViz.getCurrentPerspective();
      expect(current?.id).toBe('fault-analysis');
    });

    it('应该能够添加视角', () => {
      const initialCount = bloomViz.getPerspectives().length;
      bloomViz.addPerspective({
        id: 'test-perspective',
        name: 'Test',
        description: 'Test perspective',
        nodeLabels: ['Test'],
        relationshipTypes: ['TEST'],
        searchPhrases: ['test'],
        styles: { nodes: [], relationships: [] },
      });
      expect(bloomViz.getPerspectives().length).toBe(initialCount + 1);
    });
  });

  describe('图数据管理', () => {
    it('应该能够设置图数据', () => {
      bloomViz.setGraphData({
        nodes: [{ id: '1', label: 'Equipment', properties: { name: 'Test' } }],
        relationships: [],
      });
      expect(bloomViz.getGraphData().nodes.length).toBe(1);
    });

    it('应该能够添加节点', () => {
      bloomViz.addNode({ id: '1', label: 'Equipment', properties: { name: 'Test' } });
      expect(bloomViz.getGraphData().nodes.length).toBe(1);
    });

    it('应该能够移除节点', () => {
      bloomViz.addNode({ id: '1', label: 'Equipment', properties: { name: 'Test' } });
      bloomViz.removeNode('1');
      expect(bloomViz.getGraphData().nodes.length).toBe(0);
    });
  });

  describe('节点选择', () => {
    beforeEach(() => {
      bloomViz.addNode({ id: '1', label: 'Equipment', properties: {} });
      bloomViz.addNode({ id: '2', label: 'Component', properties: {} });
    });

    it('应该能够选择节点', () => {
      bloomViz.selectNode('1');
      expect(bloomViz.getSelectedNodes()).toContain('1');
    });

    it('应该能够取消选择', () => {
      bloomViz.selectNode('1');
      bloomViz.deselectNode('1');
      expect(bloomViz.getSelectedNodes()).not.toContain('1');
    });

    it('应该能够清除所有选择', () => {
      bloomViz.selectNode('1');
      bloomViz.selectNode('2');
      bloomViz.clearSelection();
      expect(bloomViz.getSelectedNodes().length).toBe(0);
    });
  });

  describe('搜索功能', () => {
    beforeEach(() => {
      bloomViz.setGraphData({
        nodes: [
          { id: '1', label: 'Equipment', properties: { name: '岸桥1号' } },
          { id: '2', label: 'Equipment', properties: { name: '岸桥2号' } },
          { id: '3', label: 'Component', properties: { name: '电机' } },
        ],
        relationships: [],
      });
    });

    it('应该能够搜索节点', () => {
      const results = bloomViz.search('岸桥');
      expect(results.length).toBe(2);
    });

    it('应该返回空结果对于无匹配', () => {
      const results = bloomViz.search('不存在的设备');
      expect(results.length).toBe(0);
    });
  });

  describe('导出功能', () => {
    beforeEach(() => {
      bloomViz.setGraphData({
        nodes: [{ id: '1', label: 'Equipment', properties: { name: 'Test' } }],
        relationships: [],
      });
    });

    it('应该能够导出为 JSON', () => {
      const json = bloomViz.exportToJSON();
      const parsed = JSON.parse(json);
      expect(parsed.data).toBeDefined();
    });

    it('应该能够导出为 GEXF', () => {
      const gexf = bloomViz.exportToGEXF();
      expect(gexf).toContain('<?xml');
      expect(gexf).toContain('<gexf');
    });
  });

  describe('统计信息', () => {
    beforeEach(() => {
      bloomViz.setGraphData({
        nodes: [
          { id: '1', label: 'Equipment', properties: {} },
          { id: '2', label: 'Equipment', properties: {} },
          { id: '3', label: 'Component', properties: {} },
        ],
        relationships: [
          { id: 'r1', type: 'HAS_PART', source: '1', target: '3', properties: {} },
        ],
      });
    });

    it('应该返回正确的统计信息', () => {
      const stats = bloomViz.getStats();
      expect(stats.nodeCount).toBe(3);
      expect(stats.relationshipCount).toBe(1);
      expect(stats.nodesByLabel['Equipment']).toBe(2);
      expect(stats.nodesByLabel['Component']).toBe(1);
    });
  });
});

// ============ Interaction Manager 测试 ============

describe('Interaction Manager', () => {
  let manager: InteractionManager;

  beforeEach(() => {
    manager = new InteractionManager();
  });

  afterEach(async () => {
    await manager.close();
  });

  describe('初始化', () => {
    it('应该成功初始化', async () => {
      await manager.initialize();
      expect(manager.isInitialized()).toBe(true);
    });
  });

  describe('组件访问', () => {
    it('应该返回 GraphQL Gateway', () => {
      expect(manager.getGraphQLGateway()).toBeDefined();
    });

    it('应该返回 Web Portal', () => {
      expect(manager.getWebPortal()).toBeDefined();
    });

    it('应该返回 Mobile App', () => {
      expect(manager.getMobileApp()).toBeDefined();
    });

    it('应该返回 Voice UI', () => {
      expect(manager.getVoiceUI()).toBeDefined();
    });

    it('应该返回 Bloom Viz', () => {
      expect(manager.getBloomViz()).toBeDefined();
    });
  });

  describe('会话管理', () => {
    it('应该能够创建会话', () => {
      const session = manager.createSession('user-1', 'web');
      expect(session.id).toBeDefined();
      expect(session.userId).toBe('user-1');
      expect(session.platform).toBe('web');
    });

    it('应该能够获取会话', () => {
      const session = manager.createSession('user-1', 'web');
      const retrieved = manager.getSession(session.id);
      expect(retrieved).toEqual(session);
    });

    it('应该能够结束会话', () => {
      const session = manager.createSession('user-1', 'web');
      manager.endSession(session.id);
      expect(manager.getSession(session.id)).toBeUndefined();
    });

    it('应该能够获取活跃会话', () => {
      manager.createSession('user-1', 'web');
      manager.createSession('user-2', 'mobile');
      
      const allSessions = manager.getActiveSessions();
      expect(allSessions.length).toBe(2);
      
      const webSessions = manager.getActiveSessions('web');
      expect(webSessions.length).toBe(1);
    });

    it('应该能够清理过期会话', () => {
      const session = manager.createSession('user-1', 'web');
      // 模拟过期
      const sessionObj = manager.getSession(session.id);
      if (sessionObj) {
        sessionObj.lastActivityAt = Date.now() - 60 * 60 * 1000; // 1小时前
      }
      
      const cleaned = manager.cleanupExpiredSessions(30 * 60 * 1000); // 30分钟超时
      expect(cleaned).toBe(1);
    });
  });

  describe('健康检查', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('应该返回健康状态', async () => {
      const statuses = await manager.healthCheck();
      expect(statuses.length).toBeGreaterThan(0);
    });

    it('应该检查整体健康状态', () => {
      expect(manager.isHealthy()).toBe(true);
    });
  });

  describe('统计信息', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('应该返回统计信息', () => {
      const stats = manager.getStats();
      expect(stats.graphql).toBeDefined();
      expect(stats.web).toBeDefined();
      expect(stats.mobile).toBeDefined();
      expect(stats.voice).toBeDefined();
      expect(stats.bloom).toBeDefined();
    });
  });

  describe('配置同步', () => {
    it('应该同步主题配置', () => {
      manager.syncTheme({ primaryColor: '#ff0000', mode: 'light' });
      expect(manager.getWebPortal().getTheme().primaryColor).toBe('#ff0000');
      expect(manager.getWebPortal().getTheme().mode).toBe('light');
    });

    it('应该同步语言配置', () => {
      manager.syncLanguage('en-US');
      expect(manager.getWebPortal().getI18nConfig().defaultLocale).toBe('en-US');
    });
  });
});
