/**
 * 知识图谱编排器 Store (Zustand)
 */
import { create } from "zustand";
import type {
  KGEditorNode, KGEditorEdge, KGNodeCategory, KGNodeSubType,
  KGRelationType, KGScenario, KGGraphDefinition,
} from "../../../shared/kgOrchestratorTypes";

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface KGOrchestratorState {
  // ============ 图谱元信息 ============
  graphId: string | null;
  graphName: string;
  graphDescription: string;
  scenario: KGScenario;
  status: 'draft' | 'active' | 'archived' | 'evolving';
  version: number;
  tags: string[];

  // ============ 画布状态 ============
  nodes: KGEditorNode[];
  edges: KGEditorEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  zoom: number;
  panX: number;
  panY: number;
  isDirty: boolean;

  // ============ 连线模式 ============
  connectingFrom: string | null;
  connectingRelationType: KGRelationType | null;

  // ============ Actions ============
  // 图谱管理
  newGraph: (name?: string, scenario?: KGScenario) => void;
  loadGraph: (graph: KGGraphDefinition) => void;
  setGraphInfo: (info: Partial<{ graphId: string; graphName: string; graphDescription: string; scenario: KGScenario; status: 'draft' | 'active' | 'archived' | 'evolving'; version: number; tags: string[] }>) => void;

  // 节点操作
  addNode: (category: KGNodeCategory, subType: KGNodeSubType, label: string, x: number, y: number, config?: Record<string, unknown>) => string;
  updateNode: (nodeId: string, updates: Partial<KGEditorNode>) => void;
  removeNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;

  // 边操作
  addEdge: (sourceNodeId: string, targetNodeId: string, relationType: KGRelationType, label?: string, weight?: number) => string;
  updateEdge: (edgeId: string, updates: Partial<KGEditorEdge>) => void;
  removeEdge: (edgeId: string) => void;
  selectEdge: (edgeId: string | null) => void;

  // 连线模式
  startConnecting: (fromNodeId: string, relationType: KGRelationType) => void;
  finishConnecting: (toNodeId: string) => void;
  cancelConnecting: () => void;

  // 视口
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;

  // 批量操作
  loadEditorState: (nodes: KGEditorNode[], edges: KGEditorEdge[]) => void;
  clearCanvas: () => void;
  markClean: () => void;
}

export const useKGOrchestratorStore = create<KGOrchestratorState>((set, get) => ({
  graphId: null,
  graphName: "新建知识图谱",
  graphDescription: "",
  scenario: "custom",
  status: "draft",
  version: 1,
  tags: [],

  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  isDirty: false,

  connectingFrom: null,
  connectingRelationType: null,

  newGraph: (name = "新建知识图谱", scenario = "custom") => set({
    graphId: null,
    graphName: name,
    graphDescription: "",
    scenario,
    status: "draft",
    version: 1,
    tags: [],
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    isDirty: false,
    connectingFrom: null,
    connectingRelationType: null,
  }),

  loadGraph: (graph) => set({
    graphId: graph.graphId,
    graphName: graph.name,
    graphDescription: graph.description ?? "",
    scenario: graph.scenario,
    status: graph.status,
    version: graph.version,
    tags: graph.tags ?? [],
    nodes: graph.nodes,
    edges: graph.edges,
    selectedNodeId: null,
    selectedEdgeId: null,
    zoom: graph.viewportConfig?.zoom ?? 1,
    panX: graph.viewportConfig?.panX ?? 0,
    panY: graph.viewportConfig?.panY ?? 0,
    isDirty: false,
    connectingFrom: null,
    connectingRelationType: null,
  }),

  setGraphInfo: (info) => set(state => ({
    ...info,
    graphName: info.graphName ?? state.graphName,
    isDirty: true,
  })),

  addNode: (category, subType, label, x, y, config = {}) => {
    const nodeId = genId("kgn");
    set(state => ({
      nodes: [...state.nodes, {
        nodeId,
        category,
        subType,
        label,
        x,
        y,
        config,
        nodeStatus: "normal" as const,
        hitCount: 0,
      }],
      isDirty: true,
    }));
    return nodeId;
  },

  updateNode: (nodeId, updates) => set(state => ({
    nodes: state.nodes.map(n => n.nodeId === nodeId ? { ...n, ...updates } : n),
    isDirty: true,
  })),

  removeNode: (nodeId) => set(state => ({
    nodes: state.nodes.filter(n => n.nodeId !== nodeId),
    edges: state.edges.filter(e => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId),
    selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
    isDirty: true,
  })),

  selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedEdgeId: null }),

  addEdge: (sourceNodeId, targetNodeId, relationType, label, weight = 1) => {
    const edgeId = genId("kge");
    set(state => ({
      edges: [...state.edges, {
        edgeId,
        sourceNodeId,
        targetNodeId,
        relationType,
        label,
        weight,
        hitCount: 0,
      }],
      isDirty: true,
    }));
    return edgeId;
  },

  updateEdge: (edgeId, updates) => set(state => ({
    edges: state.edges.map(e => e.edgeId === edgeId ? { ...e, ...updates } : e),
    isDirty: true,
  })),

  removeEdge: (edgeId) => set(state => ({
    edges: state.edges.filter(e => e.edgeId !== edgeId),
    selectedEdgeId: state.selectedEdgeId === edgeId ? null : state.selectedEdgeId,
    isDirty: true,
  })),

  selectEdge: (edgeId) => set({ selectedEdgeId: edgeId, selectedNodeId: null }),

  startConnecting: (fromNodeId, relationType) => set({
    connectingFrom: fromNodeId,
    connectingRelationType: relationType,
  }),

  finishConnecting: (toNodeId) => {
    const { connectingFrom, connectingRelationType, addEdge } = get();
    if (connectingFrom && connectingRelationType && connectingFrom !== toNodeId) {
      const info = getRelationLabel(connectingRelationType);
      addEdge(connectingFrom, toNodeId, connectingRelationType, info);
    }
    set({ connectingFrom: null, connectingRelationType: null });
  },

  cancelConnecting: () => set({ connectingFrom: null, connectingRelationType: null }),

  setZoom: (zoom) => set({ zoom: Math.max(0.15, Math.min(3, zoom)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),

  loadEditorState: (nodes, edges) => set({
    nodes,
    edges,
    selectedNodeId: null,
    selectedEdgeId: null,
    isDirty: false,
  }),

  clearCanvas: () => set({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    isDirty: true,
    connectingFrom: null,
    connectingRelationType: null,
  }),

  markClean: () => set({ isDirty: false }),
}));

function getRelationLabel(type: KGRelationType): string {
  const labels: Record<KGRelationType, string> = {
    HAS_PART: '包含', HAS_SENSOR: '安装传感器', CAUSES: '导致',
    MANIFESTS: '表现为', DIAGNOSED_BY: '诊断依据', RESOLVED_BY: '解决方案',
    AFFECTS: '影响', SIMILAR_TO: '相似', DEGRADES_TO: '退化为',
    TRIGGERS: '触发', FEEDS: '数据供给', REFERENCES: '引用',
  };
  return labels[type] ?? type;
}
