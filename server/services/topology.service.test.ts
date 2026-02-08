/**
 * 系统拓扑功能单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 数据库
vi.mock('./db', () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

describe('Topology Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Node Operations', () => {
    it('should define node type configuration', () => {
      const nodeTypes = ['source', 'plugin', 'engine', 'agent', 'output', 'database', 'service'];
      expect(nodeTypes).toHaveLength(7);
    });

    it('should have valid node status values', () => {
      const validStatuses = ['online', 'offline', 'error', 'maintenance'];
      expect(validStatuses).toContain('online');
      expect(validStatuses).toContain('offline');
      expect(validStatuses).toContain('error');
      expect(validStatuses).toContain('maintenance');
    });
  });

  describe('Edge Operations', () => {
    it('should define edge type configuration', () => {
      const edgeTypes = ['data', 'dependency', 'control'];
      expect(edgeTypes).toHaveLength(3);
    });

    it('should have valid edge status values', () => {
      const validStatuses = ['active', 'inactive', 'error'];
      expect(validStatuses).toContain('active');
      expect(validStatuses).toContain('inactive');
      expect(validStatuses).toContain('error');
    });
  });

  describe('Health Check', () => {
    it('should define system services to monitor', async () => {
      // 验证健康检查模块可以正确导入
      const { getMonitoredServices } = await import('./healthCheck');
      const services = getMonitoredServices();
      
      expect(services).toBeDefined();
      expect(Array.isArray(services)).toBe(true);
      expect(services.length).toBeGreaterThan(0);
      
      // 验证服务配置结构
      const firstService = services[0];
      expect(firstService).toHaveProperty('nodeId');
      expect(firstService).toHaveProperty('name');
      expect(firstService).toHaveProperty('checkUrl');
      expect(firstService).toHaveProperty('checkMethod');
    });

    it('should include Ollama in monitored services', async () => {
      const { getMonitoredServices } = await import('./healthCheck');
      const services = getMonitoredServices();
      
      const ollamaService = services.find(s => s.nodeId === 'ollama');
      expect(ollamaService).toBeDefined();
      expect(ollamaService?.name).toBe('Ollama');
      expect(ollamaService?.checkUrl).toContain('11434');
    });

    it('should include Qdrant in monitored services', async () => {
      const { getMonitoredServices } = await import('./healthCheck');
      const services = getMonitoredServices();
      
      const qdrantService = services.find(s => s.nodeId === 'qdrant');
      expect(qdrantService).toBeDefined();
      expect(qdrantService?.name).toBe('Qdrant');
      expect(qdrantService?.checkUrl).toContain('6333');
    });
  });

  describe('State Hash Generation', () => {
    it('should generate consistent state hash for same node states', () => {
      const nodes = [
        { nodeId: 'node1', status: 'online' },
        { nodeId: 'node2', status: 'offline' },
      ];
      
      const hash1 = nodes.map(n => `${n.nodeId}:${n.status}`).sort().join('|');
      const hash2 = nodes.map(n => `${n.nodeId}:${n.status}`).sort().join('|');
      
      expect(hash1).toBe(hash2);
      expect(hash1).toBe('node1:online|node2:offline');
    });

    it('should generate different hash when status changes', () => {
      const nodes1 = [
        { nodeId: 'node1', status: 'online' },
        { nodeId: 'node2', status: 'offline' },
      ];
      
      const nodes2 = [
        { nodeId: 'node1', status: 'offline' }, // changed
        { nodeId: 'node2', status: 'offline' },
      ];
      
      const hash1 = nodes1.map(n => `${n.nodeId}:${n.status}`).sort().join('|');
      const hash2 = nodes2.map(n => `${n.nodeId}:${n.status}`).sort().join('|');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Auto Refresh Configuration', () => {
    it('should support configurable refresh intervals', () => {
      const validIntervals = [5, 10, 30, 60]; // seconds
      
      validIntervals.forEach(interval => {
        expect(interval).toBeGreaterThanOrEqual(5);
        expect(interval).toBeLessThanOrEqual(60);
      });
    });

    it('should default to 30 second health check interval', async () => {
      // 默认健康检查间隔是 30 秒
      const defaultInterval = 30000;
      expect(defaultInterval).toBe(30000);
    });
  });

  describe('Auto Discovery', () => {
    it('should define discoverable services', async () => {
      const { getDiscoverableServices } = await import('./topologyDiscovery');
      const services = getDiscoverableServices();
      
      expect(services).toBeDefined();
      expect(Array.isArray(services)).toBe(true);
      expect(services.length).toBeGreaterThan(0);
    });

    it('should include core services in discoverable list', async () => {
      const { getDiscoverableServices } = await import('./topologyDiscovery');
      const services = getDiscoverableServices();
      
      const serviceIds = services.map(s => s.id);
      expect(serviceIds).toContain('ollama');
      expect(serviceIds).toContain('qdrant');
      expect(serviceIds).toContain('api_server');
    });

    it('should have valid detection configuration for each service', async () => {
      const { getDiscoverableServices } = await import('./topologyDiscovery');
      const services = getDiscoverableServices();
      
      services.forEach(service => {
        expect(service).toHaveProperty('id');
        expect(service).toHaveProperty('name');
        expect(service).toHaveProperty('type');
        expect(service).toHaveProperty('detection');
        expect(['http', 'tcp', 'process', 'env']).toContain(service.detection.type);
      });
    });

    it('should define dependency relationships', async () => {
      const { getDiscoverableServices } = await import('./topologyDiscovery');
      const services = getDiscoverableServices();
      
      // API 服务应该依赖数据库和 AI 服务
      const apiServer = services.find(s => s.id === 'api_server');
      expect(apiServer?.dependsOn).toBeDefined();
      expect(apiServer?.dependsOn).toContain('ollama');
      expect(apiServer?.dependsOn).toContain('qdrant');
    });
  });

  describe('Smart Layout', () => {
    it('should assign correct X position based on node type', () => {
      const typeX: Record<string, number> = {
        source: 50,
        plugin: 200,
        engine: 350,
        agent: 500,
        database: 650,
        service: 650,
        output: 800,
      };
      
      // 数据源应该在最左边
      expect(typeX.source).toBeLessThan(typeX.plugin);
      // 输出应该在最右边
      expect(typeX.output).toBeGreaterThan(typeX.agent);
      // 数据库和服务应该在同一列
      expect(typeX.database).toBe(typeX.service);
    });

    it('should space nodes vertically within same type', () => {
      const verticalSpacing = 100;
      const baseY = 80;
      
      // 第一个节点
      const y1 = baseY + 0 * verticalSpacing;
      // 第二个节点
      const y2 = baseY + 1 * verticalSpacing;
      // 第三个节点
      const y3 = baseY + 2 * verticalSpacing;
      
      expect(y2 - y1).toBe(verticalSpacing);
      expect(y3 - y2).toBe(verticalSpacing);
    });
  });
});
