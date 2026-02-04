/**
 * Neo4j Bloom 3D 可视化配置服务
 * 
 * 提供知识图谱 3D 可视化配置，支持：
 * - Neo4j Bloom 集成
 * - 3D 力导向布局
 * - 节点/关系样式配置
 * - 交互式探索
 */

import { EventEmitter } from 'events';

// ============ 类型定义 ============

export interface BloomConfig {
  connection: BloomConnectionConfig;
  visualization: VisualizationConfig;
  layout: LayoutConfig;
  interaction: InteractionConfig;
  search: SearchConfig;
  export: ExportConfig;
}

export interface BloomConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  encrypted: boolean;
  maxConnectionPoolSize: number;
}

export interface VisualizationConfig {
  renderer: '2d' | '3d' | 'webgl';
  nodeStyles: NodeStyleConfig[];
  relationshipStyles: RelationshipStyleConfig[];
  defaultNodeSize: number;
  defaultEdgeWidth: number;
  backgroundColor: string;
  showLabels: boolean;
  labelFontSize: number;
  antialiasing: boolean;
  shadows: boolean;
}

export interface NodeStyleConfig {
  label: string;
  color: string;
  size: number;
  shape: 'circle' | 'square' | 'diamond' | 'triangle' | 'hexagon' | 'star';
  icon?: string;
  borderColor?: string;
  borderWidth?: number;
  opacity?: number;
  glow?: boolean;
  glowColor?: string;
}

export interface RelationshipStyleConfig {
  type: string;
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
  arrow: boolean;
  arrowSize: number;
  curvature: number;
  opacity?: number;
  animated?: boolean;
}

export interface LayoutConfig {
  algorithm: 'force-directed' | 'hierarchical' | 'circular' | 'grid' | 'radial' | 'tree';
  forceDirected: {
    strength: number;
    distance: number;
    iterations: number;
    gravity: number;
    charge: number;
    friction: number;
  };
  hierarchical: {
    direction: 'TB' | 'BT' | 'LR' | 'RL';
    levelSeparation: number;
    nodeSpacing: number;
    treeSpacing: number;
  };
  circular: {
    radius: number;
    startAngle: number;
    endAngle: number;
  };
  animation: {
    enabled: boolean;
    duration: number;
    easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  };
}

export interface InteractionConfig {
  zoom: {
    enabled: boolean;
    min: number;
    max: number;
    speed: number;
  };
  pan: {
    enabled: boolean;
    speed: number;
  };
  rotation: {
    enabled: boolean;
    speed: number;
  };
  selection: {
    enabled: boolean;
    multiSelect: boolean;
    highlightNeighbors: boolean;
    highlightColor: string;
  };
  tooltip: {
    enabled: boolean;
    delay: number;
    properties: string[];
  };
  contextMenu: {
    enabled: boolean;
    items: ContextMenuItem[];
  };
}

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  action: string;
  shortcut?: string;
}

export interface SearchConfig {
  enabled: boolean;
  fullText: boolean;
  fuzzy: boolean;
  fuzzyThreshold: number;
  maxResults: number;
  highlightResults: boolean;
  searchableProperties: string[];
}

export interface ExportConfig {
  formats: ('png' | 'svg' | 'json' | 'csv' | 'gexf')[];
  resolution: number;
  includeStyles: boolean;
  includeData: boolean;
}

export interface GraphNode {
  id: string;
  label: string;
  properties: Record<string, unknown>;
  x?: number;
  y?: number;
  z?: number;
  size?: number;
  color?: string;
}

export interface GraphRelationship {
  id: string;
  type: string;
  source: string;
  target: string;
  properties: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

export interface Perspective {
  id: string;
  name: string;
  description: string;
  nodeLabels: string[];
  relationshipTypes: string[];
  searchPhrases: string[];
  styles: {
    nodes: NodeStyleConfig[];
    relationships: RelationshipStyleConfig[];
  };
}

// ============ 默认配置 ============

export const DEFAULT_VISUALIZATION: VisualizationConfig = {
  renderer: '3d',
  nodeStyles: [],
  relationshipStyles: [],
  defaultNodeSize: 30,
  defaultEdgeWidth: 2,
  backgroundColor: '#1a1a2e',
  showLabels: true,
  labelFontSize: 12,
  antialiasing: true,
  shadows: true,
};

export const DEFAULT_LAYOUT: LayoutConfig = {
  algorithm: 'force-directed',
  forceDirected: {
    strength: -300,
    distance: 100,
    iterations: 300,
    gravity: 0.1,
    charge: -100,
    friction: 0.9,
  },
  hierarchical: {
    direction: 'TB',
    levelSeparation: 150,
    nodeSpacing: 100,
    treeSpacing: 200,
  },
  circular: {
    radius: 300,
    startAngle: 0,
    endAngle: 360,
  },
  animation: {
    enabled: true,
    duration: 500,
    easing: 'ease-out',
  },
};

export const DEFAULT_INTERACTION: InteractionConfig = {
  zoom: {
    enabled: true,
    min: 0.1,
    max: 10,
    speed: 0.1,
  },
  pan: {
    enabled: true,
    speed: 1,
  },
  rotation: {
    enabled: true,
    speed: 0.5,
  },
  selection: {
    enabled: true,
    multiSelect: true,
    highlightNeighbors: true,
    highlightColor: '#ffd700',
  },
  tooltip: {
    enabled: true,
    delay: 300,
    properties: ['name', 'type', 'status'],
  },
  contextMenu: {
    enabled: true,
    items: [
      { id: 'expand', label: '展开关系', icon: 'expand', action: 'expand' },
      { id: 'collapse', label: '收起节点', icon: 'collapse', action: 'collapse' },
      { id: 'focus', label: '聚焦节点', icon: 'focus', action: 'focus' },
      { id: 'hide', label: '隐藏节点', icon: 'hide', action: 'hide' },
      { id: 'details', label: '查看详情', icon: 'info', action: 'details' },
    ],
  },
};

// ============ PortAI Nexus节点样式 ============

export const XILIAN_NODE_STYLES: NodeStyleConfig[] = [
  {
    label: 'Equipment',
    color: '#3b82f6',
    size: 40,
    shape: 'hexagon',
    icon: 'device',
    borderColor: '#1d4ed8',
    borderWidth: 2,
    glow: true,
    glowColor: '#3b82f6',
  },
  {
    label: 'Component',
    color: '#10b981',
    size: 30,
    shape: 'circle',
    icon: 'component',
    borderColor: '#059669',
    borderWidth: 1,
  },
  {
    label: 'Fault',
    color: '#ef4444',
    size: 35,
    shape: 'diamond',
    icon: 'alert',
    borderColor: '#dc2626',
    borderWidth: 2,
    glow: true,
    glowColor: '#ef4444',
  },
  {
    label: 'Solution',
    color: '#22c55e',
    size: 32,
    shape: 'star',
    icon: 'solution',
    borderColor: '#16a34a',
    borderWidth: 1,
  },
  {
    label: 'Vessel',
    color: '#8b5cf6',
    size: 45,
    shape: 'triangle',
    icon: 'ship',
    borderColor: '#7c3aed',
    borderWidth: 2,
  },
  {
    label: 'Berth',
    color: '#f59e0b',
    size: 38,
    shape: 'square',
    icon: 'berth',
    borderColor: '#d97706',
    borderWidth: 2,
  },
];

export const XILIAN_RELATIONSHIP_STYLES: RelationshipStyleConfig[] = [
  {
    type: 'HAS_PART',
    color: '#6b7280',
    width: 2,
    style: 'solid',
    arrow: true,
    arrowSize: 8,
    curvature: 0,
  },
  {
    type: 'CAUSES',
    color: '#ef4444',
    width: 3,
    style: 'solid',
    arrow: true,
    arrowSize: 10,
    curvature: 0.2,
    animated: true,
  },
  {
    type: 'SIMILAR_TO',
    color: '#8b5cf6',
    width: 1,
    style: 'dashed',
    arrow: false,
    arrowSize: 6,
    curvature: 0.3,
    opacity: 0.6,
  },
  {
    type: 'RESOLVED_BY',
    color: '#22c55e',
    width: 2,
    style: 'solid',
    arrow: true,
    arrowSize: 8,
    curvature: 0.1,
  },
  {
    type: 'AFFECTS',
    color: '#f59e0b',
    width: 2,
    style: 'dotted',
    arrow: true,
    arrowSize: 8,
    curvature: 0.15,
  },
];

// ============ PortAI Nexus视角配置 ============

export const XILIAN_PERSPECTIVES: Perspective[] = [
  {
    id: 'equipment-overview',
    name: '设备总览',
    description: '展示所有设备及其组件关系',
    nodeLabels: ['Equipment', 'Component'],
    relationshipTypes: ['HAS_PART'],
    searchPhrases: ['设备', '组件', '部件'],
    styles: {
      nodes: XILIAN_NODE_STYLES.filter(s => ['Equipment', 'Component'].includes(s.label)),
      relationships: XILIAN_RELATIONSHIP_STYLES.filter(s => s.type === 'HAS_PART'),
    },
  },
  {
    id: 'fault-analysis',
    name: '故障分析',
    description: '展示故障传播路径和解决方案',
    nodeLabels: ['Equipment', 'Fault', 'Solution'],
    relationshipTypes: ['CAUSES', 'RESOLVED_BY', 'AFFECTS'],
    searchPhrases: ['故障', '异常', '解决方案'],
    styles: {
      nodes: XILIAN_NODE_STYLES.filter(s => ['Equipment', 'Fault', 'Solution'].includes(s.label)),
      relationships: XILIAN_RELATIONSHIP_STYLES.filter(s => 
        ['CAUSES', 'RESOLVED_BY', 'AFFECTS'].includes(s.type)
      ),
    },
  },
  {
    id: 'similarity-network',
    name: '相似性网络',
    description: '展示设备和故障的相似性关系',
    nodeLabels: ['Equipment', 'Fault'],
    relationshipTypes: ['SIMILAR_TO'],
    searchPhrases: ['相似', '类似', '关联'],
    styles: {
      nodes: XILIAN_NODE_STYLES.filter(s => ['Equipment', 'Fault'].includes(s.label)),
      relationships: XILIAN_RELATIONSHIP_STYLES.filter(s => s.type === 'SIMILAR_TO'),
    },
  },
  {
    id: 'vessel-berth',
    name: '船舶泊位',
    description: '展示船舶和泊位的关系',
    nodeLabels: ['Vessel', 'Berth', 'Equipment'],
    relationshipTypes: ['AFFECTS', 'HAS_PART'],
    searchPhrases: ['船舶', '泊位', '码头'],
    styles: {
      nodes: XILIAN_NODE_STYLES.filter(s => ['Vessel', 'Berth', 'Equipment'].includes(s.label)),
      relationships: XILIAN_RELATIONSHIP_STYLES.filter(s => 
        ['AFFECTS', 'HAS_PART'].includes(s.type)
      ),
    },
  },
];

// ============ Neo4j Bloom 配置服务 ============

export class Neo4jBloomConfigService extends EventEmitter {
  private config: BloomConfig;
  private perspectives: Map<string, Perspective> = new Map();
  private currentPerspective: string | null = null;
  private graphData: GraphData = { nodes: [], relationships: [] };
  private selectedNodes: Set<string> = new Set();
  private hiddenNodes: Set<string> = new Set();

  constructor(config?: Partial<BloomConfig>) {
    super();
    this.config = {
      connection: {
        host: 'localhost',
        port: 7687,
        database: 'neo4j',
        username: 'neo4j',
        encrypted: true,
        maxConnectionPoolSize: 50,
        ...config?.connection,
      },
      visualization: { ...DEFAULT_VISUALIZATION, ...config?.visualization },
      layout: { ...DEFAULT_LAYOUT, ...config?.layout },
      interaction: { ...DEFAULT_INTERACTION, ...config?.interaction },
      search: {
        enabled: true,
        fullText: true,
        fuzzy: true,
        fuzzyThreshold: 0.7,
        maxResults: 100,
        highlightResults: true,
        searchableProperties: ['name', 'description', 'type', 'code'],
        ...config?.search,
      },
      export: {
        formats: ['png', 'svg', 'json'],
        resolution: 2,
        includeStyles: true,
        includeData: true,
        ...config?.export,
      },
    };

    // 加载默认节点和关系样式
    this.config.visualization.nodeStyles = [...XILIAN_NODE_STYLES];
    this.config.visualization.relationshipStyles = [...XILIAN_RELATIONSHIP_STYLES];

    // 加载默认视角
    for (const perspective of XILIAN_PERSPECTIVES) {
      this.perspectives.set(perspective.id, perspective);
    }
  }

  // ============ 配置管理 ============

  getConfig(): BloomConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<BloomConfig>): void {
    Object.assign(this.config, updates);
    this.emit('config-updated', this.config);
  }

  // ============ 可视化配置 ============

  getVisualizationConfig(): VisualizationConfig {
    return { ...this.config.visualization };
  }

  setRenderer(renderer: VisualizationConfig['renderer']): void {
    this.config.visualization.renderer = renderer;
    this.emit('renderer-changed', renderer);
  }

  setBackgroundColor(color: string): void {
    this.config.visualization.backgroundColor = color;
    this.emit('background-changed', color);
  }

  // ============ 节点样式 ============

  getNodeStyles(): NodeStyleConfig[] {
    return [...this.config.visualization.nodeStyles];
  }

  getNodeStyle(label: string): NodeStyleConfig | undefined {
    return this.config.visualization.nodeStyles.find(s => s.label === label);
  }

  setNodeStyle(label: string, style: Partial<NodeStyleConfig>): void {
    const index = this.config.visualization.nodeStyles.findIndex(s => s.label === label);
    if (index >= 0) {
      this.config.visualization.nodeStyles[index] = {
        ...this.config.visualization.nodeStyles[index],
        ...style,
      };
    } else {
      this.config.visualization.nodeStyles.push({
        label,
        color: '#6b7280',
        size: 30,
        shape: 'circle',
        ...style,
      } as NodeStyleConfig);
    }
    this.emit('node-style-changed', label);
  }

  // ============ 关系样式 ============

  getRelationshipStyles(): RelationshipStyleConfig[] {
    return [...this.config.visualization.relationshipStyles];
  }

  getRelationshipStyle(type: string): RelationshipStyleConfig | undefined {
    return this.config.visualization.relationshipStyles.find(s => s.type === type);
  }

  setRelationshipStyle(type: string, style: Partial<RelationshipStyleConfig>): void {
    const index = this.config.visualization.relationshipStyles.findIndex(s => s.type === type);
    if (index >= 0) {
      this.config.visualization.relationshipStyles[index] = {
        ...this.config.visualization.relationshipStyles[index],
        ...style,
      };
    } else {
      this.config.visualization.relationshipStyles.push({
        type,
        color: '#6b7280',
        width: 2,
        style: 'solid',
        arrow: true,
        arrowSize: 8,
        curvature: 0,
        ...style,
      } as RelationshipStyleConfig);
    }
    this.emit('relationship-style-changed', type);
  }

  // ============ 布局配置 ============

  getLayoutConfig(): LayoutConfig {
    return { ...this.config.layout };
  }

  setLayoutAlgorithm(algorithm: LayoutConfig['algorithm']): void {
    this.config.layout.algorithm = algorithm;
    this.emit('layout-changed', algorithm);
  }

  setForceDirectedParams(params: Partial<LayoutConfig['forceDirected']>): void {
    this.config.layout.forceDirected = {
      ...this.config.layout.forceDirected,
      ...params,
    };
    this.emit('force-params-changed', this.config.layout.forceDirected);
  }

  // ============ 视角管理 ============

  getPerspectives(): Perspective[] {
    return Array.from(this.perspectives.values());
  }

  getPerspective(id: string): Perspective | undefined {
    return this.perspectives.get(id);
  }

  addPerspective(perspective: Perspective): void {
    this.perspectives.set(perspective.id, perspective);
    this.emit('perspective-added', perspective);
  }

  removePerspective(id: string): void {
    this.perspectives.delete(id);
    this.emit('perspective-removed', id);
  }

  setCurrentPerspective(id: string): void {
    const perspective = this.perspectives.get(id);
    if (perspective) {
      this.currentPerspective = id;
      // 应用视角样式
      this.config.visualization.nodeStyles = [...perspective.styles.nodes];
      this.config.visualization.relationshipStyles = [...perspective.styles.relationships];
      this.emit('perspective-changed', perspective);
    }
  }

  getCurrentPerspective(): Perspective | null {
    return this.currentPerspective ? this.perspectives.get(this.currentPerspective) || null : null;
  }

  // ============ 图数据管理 ============

  setGraphData(data: GraphData): void {
    this.graphData = data;
    this.emit('data-loaded', data);
  }

  getGraphData(): GraphData {
    return { ...this.graphData };
  }

  addNode(node: GraphNode): void {
    this.graphData.nodes.push(node);
    this.emit('node-added', node);
  }

  removeNode(id: string): void {
    this.graphData.nodes = this.graphData.nodes.filter(n => n.id !== id);
    this.graphData.relationships = this.graphData.relationships.filter(
      r => r.source !== id && r.target !== id
    );
    this.emit('node-removed', id);
  }

  addRelationship(relationship: GraphRelationship): void {
    this.graphData.relationships.push(relationship);
    this.emit('relationship-added', relationship);
  }

  removeRelationship(id: string): void {
    this.graphData.relationships = this.graphData.relationships.filter(r => r.id !== id);
    this.emit('relationship-removed', id);
  }

  // ============ 节点选择 ============

  selectNode(id: string): void {
    this.selectedNodes.add(id);
    this.emit('node-selected', id);
  }

  deselectNode(id: string): void {
    this.selectedNodes.delete(id);
    this.emit('node-deselected', id);
  }

  clearSelection(): void {
    this.selectedNodes.clear();
    this.emit('selection-cleared');
  }

  getSelectedNodes(): string[] {
    return Array.from(this.selectedNodes);
  }

  // ============ 节点隐藏 ============

  hideNode(id: string): void {
    this.hiddenNodes.add(id);
    this.emit('node-hidden', id);
  }

  showNode(id: string): void {
    this.hiddenNodes.delete(id);
    this.emit('node-shown', id);
  }

  showAllNodes(): void {
    this.hiddenNodes.clear();
    this.emit('all-nodes-shown');
  }

  getHiddenNodes(): string[] {
    return Array.from(this.hiddenNodes);
  }

  getVisibleGraphData(): GraphData {
    const visibleNodes = this.graphData.nodes.filter(n => !this.hiddenNodes.has(n.id));
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    const visibleRelationships = this.graphData.relationships.filter(
      r => visibleNodeIds.has(r.source) && visibleNodeIds.has(r.target)
    );
    return { nodes: visibleNodes, relationships: visibleRelationships };
  }

  // ============ 搜索功能 ============

  search(query: string): GraphNode[] {
    if (!this.config.search.enabled || !query) return [];

    const normalizedQuery = query.toLowerCase();
    const results: GraphNode[] = [];

    for (const node of this.graphData.nodes) {
      let matched = false;

      for (const prop of this.config.search.searchableProperties) {
        const value = node.properties[prop];
        if (value && String(value).toLowerCase().includes(normalizedQuery)) {
          matched = true;
          break;
        }
      }

      // 模糊匹配
      if (!matched && this.config.search.fuzzy) {
        for (const prop of this.config.search.searchableProperties) {
          const value = node.properties[prop];
          if (value) {
            const similarity = this.calculateSimilarity(
              normalizedQuery,
              String(value).toLowerCase()
            );
            if (similarity >= this.config.search.fuzzyThreshold) {
              matched = true;
              break;
            }
          }
        }
      }

      if (matched) {
        results.push(node);
        if (results.length >= this.config.search.maxResults) break;
      }
    }

    this.emit('search-completed', { query, results });
    return results;
  }

  private calculateSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longerLength - editDistance) / longerLength;
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) {
        costs[s2.length] = lastValue;
      }
    }
    return costs[s2.length];
  }

  // ============ 导出功能 ============

  getExportConfig(): ExportConfig {
    return { ...this.config.export };
  }

  /**
   * 导出为 JSON
   */
  exportToJSON(): string {
    const data = this.config.export.includeData ? this.getVisibleGraphData() : null;
    const styles = this.config.export.includeStyles ? {
      nodes: this.config.visualization.nodeStyles,
      relationships: this.config.visualization.relationshipStyles,
    } : null;

    return JSON.stringify({ data, styles, config: this.config }, null, 2);
  }

  /**
   * 导出为 GEXF (Gephi 格式)
   */
  exportToGEXF(): string {
    const data = this.getVisibleGraphData();
    let gexf = '<?xml version="1.0" encoding="UTF-8"?>\n';
    gexf += '<gexf xmlns="http://www.gexf.net/1.2draft" version="1.2">\n';
    gexf += '  <graph mode="static" defaultedgetype="directed">\n';
    
    // 节点
    gexf += '    <nodes>\n';
    for (const node of data.nodes) {
      gexf += `      <node id="${node.id}" label="${node.label}" />\n`;
    }
    gexf += '    </nodes>\n';
    
    // 边
    gexf += '    <edges>\n';
    for (const rel of data.relationships) {
      gexf += `      <edge id="${rel.id}" source="${rel.source}" target="${rel.target}" label="${rel.type}" />\n`;
    }
    gexf += '    </edges>\n';
    
    gexf += '  </graph>\n';
    gexf += '</gexf>';
    
    return gexf;
  }

  // ============ 统计信息 ============

  getStats(): {
    nodeCount: number;
    relationshipCount: number;
    nodesByLabel: Record<string, number>;
    relationshipsByType: Record<string, number>;
    visibleNodeCount: number;
    selectedNodeCount: number;
  } {
    const nodesByLabel: Record<string, number> = {};
    const relationshipsByType: Record<string, number> = {};

    for (const node of this.graphData.nodes) {
      nodesByLabel[node.label] = (nodesByLabel[node.label] || 0) + 1;
    }

    for (const rel of this.graphData.relationships) {
      relationshipsByType[rel.type] = (relationshipsByType[rel.type] || 0) + 1;
    }

    return {
      nodeCount: this.graphData.nodes.length,
      relationshipCount: this.graphData.relationships.length,
      nodesByLabel,
      relationshipsByType,
      visibleNodeCount: this.graphData.nodes.length - this.hiddenNodes.size,
      selectedNodeCount: this.selectedNodes.size,
    };
  }
}

// 导出单例
export const neo4jBloomConfig = new Neo4jBloomConfigService();
