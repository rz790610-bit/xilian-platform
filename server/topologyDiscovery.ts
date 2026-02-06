/**
 * 系统拓扑自动发现和生成服务
 * 自动扫描系统服务、创建节点、发现依赖关系并生成拓扑
 */

import { createTopoNode, getTopoNodes, createTopoEdge, getTopoEdges, deleteTopoNode, deleteTopoEdge } from './topology';

// 可发现的服务定义
interface DiscoverableService {
  id: string;
  name: string;
  type: 'source' | 'plugin' | 'engine' | 'agent' | 'output' | 'database' | 'service';
  icon: string;
  description: string;
  // 检测方式
  detection: {
    type: 'http' | 'tcp' | 'process' | 'env';
    // HTTP 检测
    url?: string;
    method?: 'GET' | 'POST';
    // TCP 端口检测
    host?: string;
    port?: number;
    // 进程名检测
    processName?: string;
    // 环境变量检测
    envVar?: string;
  };
  // 依赖的服务 ID 列表
  dependsOn?: string[];
  // 被哪些服务依赖
  dependedBy?: string[];
}

// 预定义的可发现服务列表
const DISCOVERABLE_SERVICES: DiscoverableService[] = [
  // ============ 核心服务 ============
  {
    id: 'web_frontend',
    name: 'Web前端',
    type: 'output',
    icon: '🖥️',
    description: '西联平台Web界面',
    detection: { type: 'http', url: 'http://localhost:3000', method: 'GET' },
    dependsOn: ['api_server'],
  },
  {
    id: 'api_server',
    name: 'API服务',
    type: 'service',
    icon: '🌐',
    description: '西联平台后端API',
    detection: { type: 'tcp', host: 'localhost', port: 3000 },
    dependsOn: ['mysql_db', 'ollama', 'qdrant'],
  },
  
  // ============ AI 服务 ============
  {
    id: 'ollama',
    name: 'Ollama',
    type: 'engine',
    icon: '🦙',
    description: '本地大模型推理服务',
    detection: { type: 'http', url: 'http://localhost:11434/api/tags', method: 'GET' },
    dependedBy: ['api_server', 'ai_chat'],
  },
  {
    id: 'ai_chat',
    name: 'AI对话',
    type: 'agent',
    icon: '💬',
    description: 'AI智能对话模块',
    detection: { type: 'http', url: 'http://localhost:3000/chat', method: 'GET' },
    dependsOn: ['ollama', 'qdrant'],
  },
  
  // ============ 数据存储 ============
  {
    id: 'qdrant',
    name: 'Qdrant',
    type: 'database',
    icon: '🔴',
    description: '向量数据库',
    detection: { type: 'http', url: 'http://localhost:6333/collections', method: 'GET' },
    dependedBy: ['api_server', 'knowledge_base'],
  },
  {
    id: 'mysql_db',
    name: 'MySQL',
    type: 'database',
    icon: '🐬',
    description: '关系型数据库',
    detection: { type: 'tcp', host: 'localhost', port: 3306 },
    dependedBy: ['api_server'],
  },
  {
    id: 'redis_cache',
    name: 'Redis',
    type: 'database',
    icon: '🔶',
    description: '缓存服务',
    detection: { type: 'tcp', host: 'localhost', port: 6379 },
    dependedBy: ['api_server'],
  },
  
  // ============ 知识库模块 ============
  {
    id: 'knowledge_base',
    name: '知识库',
    type: 'plugin',
    icon: '📚',
    description: '知识库管理模块',
    detection: { type: 'http', url: 'http://localhost:3000/knowledge/manager', method: 'GET' },
    dependsOn: ['qdrant', 'ollama'],
  },
  {
    id: 'knowledge_graph',
    name: '知识图谱',
    type: 'plugin',
    icon: '🕸️',
    description: '知识图谱可视化',
    detection: { type: 'http', url: 'http://localhost:3000/knowledge/graph', method: 'GET' },
    dependsOn: ['mysql_db'],
  },
  
  // ============ 数据处理 ============
  {
    id: 'data_source',
    name: '数据源',
    type: 'source',
    icon: '📡',
    description: '外部数据接入',
    detection: { type: 'http', url: 'http://localhost:3000/data/access', method: 'GET' },
    dependedBy: ['data_processor'],
  },
  {
    id: 'data_processor',
    name: '数据处理',
    type: 'engine',
    icon: '⚙️',
    description: '数据清洗和转换',
    detection: { type: 'http', url: 'http://localhost:3000/data/manage', method: 'GET' },
    dependsOn: ['data_source'],
    dependedBy: ['ai_chat', 'knowledge_base'],
  },
  
  // ============ 诊断模块 ============
  {
    id: 'diagnosis_agent',
    name: '诊断智能体',
    type: 'agent',
    icon: '🤖',
    description: '智能诊断分析',
    detection: { type: 'http', url: 'http://localhost:3000/agents', method: 'GET' },
    dependsOn: ['ollama', 'knowledge_base'],
  },

  // ============ v1.9 性能优化服务 ============
  {
    id: 'outbox_publisher',
    name: 'Outbox发布器',
    type: 'engine',
    icon: '📤',
    description: 'CDC+轮询混合事件发布',
    detection: { type: 'env', envVar: 'KAFKA_BROKERS' },
    dependsOn: ['mysql_db', 'kafka_service'],
    dependedBy: ['api_server'],
  },
  {
    id: 'saga_orchestrator',
    name: 'Saga编排器',
    type: 'engine',
    icon: '🔄',
    description: '分布式事务补偿机制',
    detection: { type: 'env', envVar: 'DATABASE_URL' },
    dependsOn: ['mysql_db'],
    dependedBy: ['api_server'],
  },
  {
    id: 'adaptive_sampling',
    name: '自适应采样',
    type: 'engine',
    icon: '📉',
    description: '实时监控触发采样调整',
    detection: { type: 'env', envVar: 'KAFKA_BROKERS' },
    dependsOn: ['kafka_service'],
    dependedBy: ['data_processor'],
  },
  {
    id: 'dedup_service',
    name: 'Redis去重',
    type: 'plugin',
    icon: '🔒',
    description: 'Redis辅助去重+异步刷盘',
    detection: { type: 'tcp', host: 'localhost', port: 6379 },
    dependsOn: ['redis_cache'],
    dependedBy: ['api_server'],
  },
  {
    id: 'read_replica',
    name: '读写分离',
    type: 'service',
    icon: '📊',
    description: '只读副本分离服务',
    detection: { type: 'env', envVar: 'DATABASE_URL' },
    dependsOn: ['mysql_db'],
    dependedBy: ['api_server'],
  },
  {
    id: 'graph_optimizer',
    name: '图查询优化',
    type: 'plugin',
    icon: '🗂️',
    description: 'Nebula索引+LOOKUP查询优化',
    detection: { type: 'env', envVar: 'DATABASE_URL' },
    dependsOn: ['knowledge_graph'],
    dependedBy: ['knowledge_base'],
  },
];

// 检测服务是否在线
async function detectService(service: DiscoverableService): Promise<{
  online: boolean;
  latency: number;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    switch (service.detection.type) {
      case 'http': {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(service.detection.url!, {
          method: service.detection.method || 'GET',
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        return {
          online: response.ok || response.status < 500,
          latency: Date.now() - startTime,
        };
      }
      
      case 'tcp': {
        // TCP 端口检测 - 使用 HTTP 请求模拟
        const url = `http://${service.detection.host}:${service.detection.port}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        try {
          await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          return { online: true, latency: Date.now() - startTime };
        } catch (err: any) {
          clearTimeout(timeoutId);
          // 连接被拒绝说明端口没有服务
          // 但如果是其他错误（如 ECONNREFUSED），可能服务存在但不是 HTTP
          if (err.cause?.code === 'ECONNREFUSED') {
            return { online: false, latency: Date.now() - startTime, error: 'Connection refused' };
          }
          // 其他错误可能意味着服务存在
          return { online: true, latency: Date.now() - startTime };
        }
      }
      
      case 'env': {
        const envValue = process.env[service.detection.envVar!];
        return {
          online: !!envValue,
          latency: Date.now() - startTime,
        };
      }
      
      default:
        return { online: false, latency: 0, error: 'Unknown detection type' };
    }
  } catch (error: any) {
    return {
      online: false,
      latency: Date.now() - startTime,
      error: error.message,
    };
  }
}

// 智能布局算法 - 按类型分层排列
function calculateNodePosition(
  type: string, 
  index: number, 
  typeCount: Record<string, number>
): { x: number; y: number } {
  // 按类型分配 X 坐标（从左到右的数据流）
  const typeX: Record<string, number> = {
    source: 50,      // 数据源在最左边
    plugin: 200,     // 插件
    engine: 350,     // 引擎
    agent: 500,      // 智能体
    database: 650,   // 数据库
    service: 650,    // 服务
    output: 800,     // 输出在最右边
  };
  
  const x = typeX[type] || 400;
  
  // 计算同类型节点的 Y 坐标（垂直分布）
  const currentTypeIndex = typeCount[type] || 0;
  const y = 80 + currentTypeIndex * 100;
  
  return { x, y };
}

// 自动发现并生成拓扑
export async function autoDiscoverAndGenerateTopology(): Promise<{
  discovered: Array<{ id: string; name: string; online: boolean }>;
  nodesCreated: number;
  edgesCreated: number;
  totalNodes: number;
  totalEdges: number;
}> {
  const discovered: Array<{ id: string; name: string; online: boolean }> = [];
  let nodesCreated = 0;
  let edgesCreated = 0;
  
  // 获取现有节点
  const existingNodes = await getTopoNodes();
  const existingNodeIds = new Set(existingNodes.map(n => n.nodeId));
  
  // 获取现有连接
  const existingEdges = await getTopoEdges();
  const existingEdgeKeys = new Set(existingEdges.map(e => `${e.sourceNodeId}->${e.targetNodeId}`));
  
  // 统计每种类型的节点数量（用于布局）
  const typeCount: Record<string, number> = {};
  
  // 扫描所有可发现的服务
  for (const service of DISCOVERABLE_SERVICES) {
    const detection = await detectService(service);
    
    discovered.push({
      id: service.id,
      name: service.name,
      online: detection.online,
    });
    
    // 只为在线服务创建节点
    if (detection.online && !existingNodeIds.has(service.id)) {
      // 计算位置
      const position = calculateNodePosition(service.type, typeCount[service.type] || 0, typeCount);
      typeCount[service.type] = (typeCount[service.type] || 0) + 1;
      
      // 创建节点
      await createTopoNode({
        nodeId: service.id,
        name: service.name,
        type: service.type,
        icon: service.icon,
        description: service.description,
        status: 'online',
        x: position.x,
        y: position.y,
      });
      
      nodesCreated++;
      existingNodeIds.add(service.id);
    }
  }
  
  // 生成依赖关系连接
  for (const service of DISCOVERABLE_SERVICES) {
    // 只为已存在的节点创建连接
    if (!existingNodeIds.has(service.id)) continue;
    
    // 处理 dependsOn 关系
    if (service.dependsOn) {
      for (const depId of service.dependsOn) {
        if (existingNodeIds.has(depId)) {
          const edgeKey = `${depId}->${service.id}`;
          if (!existingEdgeKeys.has(edgeKey)) {
            await createTopoEdge({
              edgeId: `edge_${depId}_to_${service.id}`,
              sourceNodeId: depId,
              targetNodeId: service.id,
              type: 'dependency',
              label: '依赖',
              status: 'active',
            });
            edgesCreated++;
            existingEdgeKeys.add(edgeKey);
          }
        }
      }
    }
    
    // 处理 dependedBy 关系（数据流方向）
    if (service.dependedBy) {
      for (const depId of service.dependedBy) {
        if (existingNodeIds.has(depId)) {
          const edgeKey = `${service.id}->${depId}`;
          if (!existingEdgeKeys.has(edgeKey)) {
            await createTopoEdge({
              edgeId: `edge_${service.id}_to_${depId}`,
              sourceNodeId: service.id,
              targetNodeId: depId,
              type: 'data',
              label: '数据流',
              status: 'active',
            });
            edgesCreated++;
            existingEdgeKeys.add(edgeKey);
          }
        }
      }
    }
  }
  
  // 获取最终统计
  const finalNodes = await getTopoNodes();
  const finalEdges = await getTopoEdges();
  
  return {
    discovered,
    nodesCreated,
    edgesCreated,
    totalNodes: finalNodes.length,
    totalEdges: finalEdges.length,
  };
}

// 重新生成拓扑（清空后重建）
export async function regenerateTopology(): Promise<{
  discovered: Array<{ id: string; name: string; online: boolean }>;
  nodesCreated: number;
  edgesCreated: number;
}> {
  // 获取并删除所有现有节点和连接
  const existingNodes = await getTopoNodes();
  const existingEdges = await getTopoEdges();
  
  for (const edge of existingEdges) {
    await deleteTopoEdge(edge.edgeId);
  }
  
  for (const node of existingNodes) {
    await deleteTopoNode(node.nodeId);
  }
  
  // 重新发现并生成
  return await autoDiscoverAndGenerateTopology();
}

// 获取可发现服务列表
export function getDiscoverableServices(): DiscoverableService[] {
  return [...DISCOVERABLE_SERVICES];
}

// 添加自定义可发现服务
export function addDiscoverableService(service: DiscoverableService): void {
  const existing = DISCOVERABLE_SERVICES.find(s => s.id === service.id);
  if (!existing) {
    DISCOVERABLE_SERVICES.push(service);
  }
}

// 智能重新布局现有节点
export async function autoLayoutNodes(): Promise<boolean> {
  const nodes = await getTopoNodes();
  
  // 按类型分组
  const nodesByType: Record<string, typeof nodes> = {};
  for (const node of nodes) {
    if (!nodesByType[node.type]) {
      nodesByType[node.type] = [];
    }
    nodesByType[node.type].push(node);
  }
  
  // 重新计算位置
  const typeX: Record<string, number> = {
    source: 50,
    plugin: 200,
    engine: 350,
    agent: 500,
    database: 650,
    service: 650,
    output: 800,
  };
  
  const { updateTopoNodePosition } = await import('./topology');
  
  for (const [type, typeNodes] of Object.entries(nodesByType)) {
    const x = typeX[type] || 400;
    
    for (let i = 0; i < typeNodes.length; i++) {
      const y = 80 + i * 100;
      await updateTopoNodePosition(typeNodes[i].nodeId, x, y);
    }
  }
  
  return true;
}
