/**
 * Pipeline 可视化编辑器状态管理
 * 管理编辑器画布、节点、连接等状态
 * 支持 DAG 拓扑（多 Source / 多 Sink / 分支 / 合并）
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type {
  EditorState,
  EditorNode,
  EditorConnection,
  EditorNodeType,
  NodeSubType,
  PipelineDAGConfig,
  PipelineListItem,
  PipelineStatusResponse,
} from '@shared/pipelineTypes';
import {
  ALL_NODE_TYPES,
  getNodeTypeInfo,
  validateEditorState,
  editorStateToPipelineConfig,
  editorStateToDAGConfig,
  dagConfigToEditorState,
} from '@shared/pipelineTypes';

// 节点尺寸常量
export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 72;
export const PORT_SIZE = 12;

type PipelineTab = 'canvas' | 'list' | 'templates' | 'runs' | 'monitor';

interface PipelineEditorState {
  // 编辑器状态
  editor: EditorState;
  // 当前编辑的 Pipeline
  currentPipelineId: string | null;
  currentPipelineName: string;
  currentPipelineDescription: string;
  // Pipeline 列表
  pipelines: PipelineListItem[];
  selectedPipelineStatus: PipelineStatusResponse | null;
  // UI 状态
  isDragging: boolean;
  isConnecting: boolean;
  connectingFromNodeId: string | null;
  showConfigPanel: boolean;
  showComponentPanel: boolean;
  activeTab: PipelineTab;
  // 错误和加载
  validationErrors: string[];
  isLoading: boolean;
  isSaving: boolean;

  // Tab
  setActiveTab: (tab: PipelineTab) => void;
  // 节点操作
  addNode: (type: EditorNodeType, subType: NodeSubType, x: number, y: number) => void;
  removeNode: (nodeId: string) => void;
  updateNodePosition: (nodeId: string, x: number, y: number) => void;
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  selectNode: (nodeId: string | null) => void;
  // 连接操作
  startConnection: (fromNodeId: string) => void;
  completeConnection: (toNodeId: string) => boolean;
  cancelConnection: () => void;
  removeConnection: (connectionId: string) => void;
  // 画布操作
  setZoom: (zoom: number) => void;
  setPan: (panX: number, panY: number) => void;
  resetView: () => void;
  // Pipeline 操作
  newPipeline: () => void;
  loadPipeline: (config: any) => void;
  savePipeline: () => any;
  resetEditor: () => void;
  hasUnsavedChanges: boolean;
  loadEditorState: (state: EditorState) => void;
  setPipelineInfo: (name: string, description: string) => void;
  // 列表操作
  setPipelines: (pipelines: PipelineListItem[]) => void;
  setSelectedPipelineStatus: (status: PipelineStatusResponse | null) => void;
  // UI 操作
  setShowConfigPanel: (show: boolean) => void;
  setShowComponentPanel: (show: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setIsSaving: (saving: boolean) => void;
  // 验证
  validate: () => { valid: boolean; errors: string[] };
  getSelectedNode: () => EditorNode | null;
  exportDAGConfig: () => PipelineDAGConfig | null;
}

const initialEditorState: EditorState = {
  nodes: [],
  connections: [],
  selectedNodeId: null,
  selectedConnectionId: null,
  zoom: 1,
  panX: 0,
  panY: 0,
};

export const usePipelineEditorStore = create<PipelineEditorState>()(
  persist(
    (set, get) => ({
  editor: { ...initialEditorState },
  currentPipelineId: null,
  currentPipelineName: '新建 Pipeline',
  currentPipelineDescription: '',
  pipelines: [],
  selectedPipelineStatus: null,
  isDragging: false,
  isConnecting: false,
  connectingFromNodeId: null,
  showConfigPanel: false,
  showComponentPanel: true,
  activeTab: 'canvas',
  validationErrors: [],
  isLoading: false,
  isSaving: false,
  hasUnsavedChanges: false,

  setActiveTab: (tab) => set({ activeTab: tab }),

  // ============ 节点操作 ============
  addNode: (type, subType, x, y) => {
    const info = getNodeTypeInfo(subType);
    const name = info?.name || String(subType);
    const newNode: EditorNode = {
      id: nanoid(),
      type,
      subType,
      domain: info?.domain || 'data_engineering',
      name,
      x,
      y,
      config: {},
      validated: false,
      inputs: info?.inputs,
      outputs: info?.outputs,
    };
    set(state => ({
      editor: {
        ...state.editor,
        nodes: [...state.editor.nodes, newNode],
        selectedNodeId: newNode.id,
      },
      showConfigPanel: true,
    }));
  },

  removeNode: (nodeId) => {
    set(state => ({
      editor: {
        ...state.editor,
        nodes: state.editor.nodes.filter(n => n.id !== nodeId),
        connections: state.editor.connections.filter(
          c => c.fromNodeId !== nodeId && c.toNodeId !== nodeId
        ),
        selectedNodeId: state.editor.selectedNodeId === nodeId ? null : state.editor.selectedNodeId,
      },
      showConfigPanel: state.editor.selectedNodeId === nodeId ? false : state.showConfigPanel,
    }));
  },

  updateNodePosition: (nodeId, x, y) => {
    set(state => ({
      editor: {
        ...state.editor,
        nodes: state.editor.nodes.map(n =>
          n.id === nodeId ? { ...n, x, y } : n
        ),
      },
    }));
  },

  updateNodeConfig: (nodeId, config) => {
    set(state => ({
      editor: {
        ...state.editor,
        nodes: state.editor.nodes.map(n =>
          n.id === nodeId ? { ...n, config, validated: true, errors: undefined } : n
        ),
      },
    }));
  },

  selectNode: (nodeId) => {
    set(state => ({
      editor: { ...state.editor, selectedNodeId: nodeId },
      showConfigPanel: nodeId !== null,
    }));
  },

  // ============ 连接操作（DAG 模式） ============
  startConnection: (fromNodeId) => {
    set({ isConnecting: true, connectingFromNodeId: fromNodeId });
  },

  completeConnection: (toNodeId) => {
    const state = get();
    const fromNodeId = state.connectingFromNodeId;
    if (!fromNodeId || fromNodeId === toNodeId) {
      set({ isConnecting: false, connectingFromNodeId: null });
      return false;
    }
    const fromNode = state.editor.nodes.find(n => n.id === fromNodeId);
    const toNode = state.editor.nodes.find(n => n.id === toNodeId);
    if (!fromNode || !toNode) {
      set({ isConnecting: false, connectingFromNodeId: null });
      return false;
    }
    // DAG 规则：Source 不接受输入（inputs=0）
    const toInfo = getNodeTypeInfo(toNode.subType);
    if (toInfo && toInfo.inputs === 0) {
      set({ isConnecting: false, connectingFromNodeId: null });
      return false;
    }
    // 不能从 Sink 输出（outputs=0）
    const fromInfo = getNodeTypeInfo(fromNode.subType);
    if (fromInfo && fromInfo.outputs === 0) {
      set({ isConnecting: false, connectingFromNodeId: null });
      return false;
    }
    // 检查重复连接
    if (state.editor.connections.some(c => c.fromNodeId === fromNodeId && c.toNodeId === toNodeId)) {
      set({ isConnecting: false, connectingFromNodeId: null });
      return false;
    }
    // 检查目标节点输入上限（DAG 允许多输入，但有上限）
    if (toInfo) {
      const maxInputs = toInfo.inputs ?? 1;
      if (maxInputs > 0) {
        const currentInputs = state.editor.connections.filter(c => c.toNodeId === toNodeId).length;
        if (currentInputs >= maxInputs) {
          set({ isConnecting: false, connectingFromNodeId: null });
          return false;
        }
      }
    }
    const newConnection: EditorConnection = {
      id: nanoid(),
      fromNodeId,
      toNodeId,
      fromPort: 0,
      toPort: 0,
    };
    set(state => ({
      editor: { ...state.editor, connections: [...state.editor.connections, newConnection] },
      isConnecting: false,
      connectingFromNodeId: null,
    }));
    return true;
  },

  cancelConnection: () => {
    set({ isConnecting: false, connectingFromNodeId: null });
  },

  removeConnection: (connectionId) => {
    set(state => ({
      editor: {
        ...state.editor,
        connections: state.editor.connections.filter(c => c.id !== connectionId),
      },
    }));
  },

  // ============ 画布操作 ============
  setZoom: (zoom) => set(state => ({ editor: { ...state.editor, zoom: Math.max(0.15, Math.min(2.5, zoom)) } })),
  setPan: (panX, panY) => set(state => ({ editor: { ...state.editor, panX, panY } })),
  resetView: () => set(state => ({ editor: { ...state.editor, zoom: 1, panX: 0, panY: 0 } })),

  // ============ Pipeline 操作 ============
  newPipeline: () => {
    set({
      editor: { ...initialEditorState },
      currentPipelineId: null,
      currentPipelineName: '新建 Pipeline',
      currentPipelineDescription: '',
      validationErrors: [],
      showConfigPanel: false,
    });
  },

  loadPipeline: (config: any) => {
    // 从后端配置加载到编辑器
    try {
      if (config.dag) {
        const editorState = dagConfigToEditorState(config);
        set({
          editor: editorState,
          currentPipelineId: config.id || null,
          currentPipelineName: config.name || '未命名',
          currentPipelineDescription: config.description || '',
          validationErrors: [],
          showConfigPanel: false,
        });
      } else {
        // 旧版线性配置兼容
        set({
          currentPipelineId: config.id || null,
          currentPipelineName: config.name || '未命名',
          currentPipelineDescription: config.description || '',
        });
      }
    } catch {
      set({ currentPipelineName: config?.name || '加载失败' });
    }
  },

  savePipeline: () => {
    const state = get();
    const pipelineId = state.currentPipelineId || `pipeline-${Date.now()}`;
    const config = editorStateToPipelineConfig(
      state.editor, pipelineId, state.currentPipelineName, state.currentPipelineDescription
    );
    if (!config) return null;
    return config;
  },

  resetEditor: () => {
    set({
      editor: { ...initialEditorState },
      currentPipelineId: null,
      currentPipelineName: '新建 Pipeline',
      currentPipelineDescription: '',
      validationErrors: [],
      showConfigPanel: false,
    });
  },

  loadEditorState: (editorState) => {
    set({
      editor: editorState,
      validationErrors: [],
      showConfigPanel: false,
    });
  },

  setPipelineInfo: (name, description) => {
    set({ currentPipelineName: name, currentPipelineDescription: description });
  },

  setPipelines: (pipelines) => set({ pipelines }),
  setSelectedPipelineStatus: (status) => set({ selectedPipelineStatus: status }),

  // ============ UI 操作 ============
  setShowConfigPanel: (show) => set({ showConfigPanel: show }),
  setShowComponentPanel: (show) => set({ showComponentPanel: show }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setIsSaving: (saving) => set({ isSaving: saving }),

  // ============ 验证 ============
  validate: () => {
    const state = get();
    const result = validateEditorState(state.editor);
    set({ validationErrors: result.errors });
    return result;
  },

  getSelectedNode: () => {
    const state = get();
    if (!state.editor.selectedNodeId) return null;
    return state.editor.nodes.find(n => n.id === state.editor.selectedNodeId) || null;
  },

  exportDAGConfig: () => {
    const state = get();
    const pipelineId = state.currentPipelineId || `pipeline-${Date.now()}`;
    return editorStateToDAGConfig(
      state.editor, pipelineId, state.currentPipelineName,
      state.currentPipelineDescription
    );
  },
    }),
    {
      name: 'xilian:pipelineEditor',
      storage: createJSONStorage(() => localStorage),
      // 只持久化编辑器核心状态，排除 UI 临时状态
      partialize: (state) => ({
        editor: {
          nodes: state.editor.nodes,
          connections: state.editor.connections,
          zoom: state.editor.zoom,
          panX: state.editor.panX,
          panY: state.editor.panY,
        },
        currentPipelineId: state.currentPipelineId,
        currentPipelineName: state.currentPipelineName,
        currentPipelineDescription: state.currentPipelineDescription,
      }),
    }
  )
);
