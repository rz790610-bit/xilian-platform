/**
 * Pipeline 可视化编辑器状态管理
 * 管理编辑器画布、节点、连接等状态
 */

import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type {
  EditorState,
  EditorNode,
  EditorConnection,
  EditorNodeType,
  SourceType,
  ProcessorType,
  SinkType,
  PipelineConfig,
  PipelineListItem,
  PipelineStatusResponse,
} from '@shared/pipelineTypes';
import {
  SOURCE_TYPES,
  PROCESSOR_TYPES,
  SINK_TYPES,
  editorStateToPipelineConfig,
  pipelineConfigToEditorState,
  validateEditorState,
} from '@shared/pipelineTypes';

// 节点尺寸常量
export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 80;
export const PORT_SIZE = 12;

interface PipelineEditorState {
  // 编辑器状态
  editor: EditorState;
  
  // 当前编辑的 Pipeline ID（null 表示新建）
  currentPipelineId: string | null;
  currentPipelineName: string;
  currentPipelineDescription: string;
  
  // Pipeline 列表（从后端获取）
  pipelines: PipelineListItem[];
  
  // 当前选中的 Pipeline 详情
  selectedPipelineStatus: PipelineStatusResponse | null;
  
  // UI 状态
  isDragging: boolean;
  isConnecting: boolean;
  connectingFromNodeId: string | null;
  showConfigPanel: boolean;
  showPipelineList: boolean;
  
  // 错误和加载状态
  validationErrors: string[];
  isLoading: boolean;
  isSaving: boolean;
  
  // 编辑器操作
  addNode: (type: EditorNodeType, subType: SourceType | ProcessorType | SinkType, x: number, y: number) => void;
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
  loadPipeline: (config: PipelineConfig) => void;
  savePipeline: () => PipelineConfig | null;
  setPipelineInfo: (name: string, description: string) => void;
  
  // 列表操作
  setPipelines: (pipelines: PipelineListItem[]) => void;
  setSelectedPipelineStatus: (status: PipelineStatusResponse | null) => void;
  
  // UI 操作
  setShowConfigPanel: (show: boolean) => void;
  setShowPipelineList: (show: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setIsSaving: (saving: boolean) => void;
  
  // 验证
  validate: () => { valid: boolean; errors: string[] };
  
  // 获取选中节点
  getSelectedNode: () => EditorNode | null;
}

// 初始编辑器状态
const initialEditorState: EditorState = {
  nodes: [],
  connections: [],
  selectedNodeId: null,
  zoom: 1,
  panX: 0,
  panY: 0,
};

export const usePipelineEditorStore = create<PipelineEditorState>((set, get) => ({
  // 初始状态
  editor: initialEditorState,
  currentPipelineId: null,
  currentPipelineName: '新建 Pipeline',
  currentPipelineDescription: '',
  pipelines: [],
  selectedPipelineStatus: null,
  isDragging: false,
  isConnecting: false,
  connectingFromNodeId: null,
  showConfigPanel: true,
  showPipelineList: false,
  validationErrors: [],
  isLoading: false,
  isSaving: false,

  // 添加节点
  addNode: (type, subType, x, y) => {
    const state = get();
    
    // 检查 Source 和 Sink 的唯一性
    if (type === 'source' && state.editor.nodes.some(n => n.type === 'source')) {
      return; // 已有 Source，不允许添加
    }
    if (type === 'sink' && state.editor.nodes.some(n => n.type === 'sink')) {
      return; // 已有 Sink，不允许添加
    }

    // 获取节点信息
    let name: string = subType;
    if (type === 'source') {
      const info = SOURCE_TYPES.find(s => s.type === subType);
      name = info?.name || subType;
    } else if (type === 'processor') {
      const info = PROCESSOR_TYPES.find(p => p.type === subType);
      name = info?.name || subType;
    } else if (type === 'sink') {
      const info = SINK_TYPES.find(s => s.type === subType);
      name = info?.name || subType;
    }

    const newNode: EditorNode = {
      id: nanoid(),
      type,
      subType,
      name,
      x,
      y,
      config: {},
      validated: false,
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

  // 删除节点
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
    }));
  },

  // 更新节点位置
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

  // 更新节点配置
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

  // 选中节点
  selectNode: (nodeId) => {
    set(state => ({
      editor: {
        ...state.editor,
        selectedNodeId: nodeId,
      },
      showConfigPanel: nodeId !== null,
    }));
  },

  // 开始连接
  startConnection: (fromNodeId) => {
    set({
      isConnecting: true,
      connectingFromNodeId: fromNodeId,
    });
  },

  // 完成连接
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

    // 验证连接规则
    // 1. Source 只能连接到 Processor 或 Sink
    // 2. Processor 只能连接到 Processor 或 Sink
    // 3. Sink 不能作为连接起点
    // 4. Source 不能作为连接终点
    if (fromNode.type === 'sink') {
      set({ isConnecting: false, connectingFromNodeId: null });
      return false;
    }
    if (toNode.type === 'source') {
      set({ isConnecting: false, connectingFromNodeId: null });
      return false;
    }

    // 检查是否已存在相同连接
    const existingConnection = state.editor.connections.find(
      c => c.fromNodeId === fromNodeId && c.toNodeId === toNodeId
    );
    if (existingConnection) {
      set({ isConnecting: false, connectingFromNodeId: null });
      return false;
    }

    // 检查目标节点是否已有入连接（每个节点只能有一个入连接）
    const existingIncoming = state.editor.connections.find(c => c.toNodeId === toNodeId);
    if (existingIncoming) {
      set({ isConnecting: false, connectingFromNodeId: null });
      return false;
    }

    const newConnection: EditorConnection = {
      id: nanoid(),
      fromNodeId,
      toNodeId,
    };

    set(state => ({
      editor: {
        ...state.editor,
        connections: [...state.editor.connections, newConnection],
      },
      isConnecting: false,
      connectingFromNodeId: null,
    }));

    return true;
  },

  // 取消连接
  cancelConnection: () => {
    set({
      isConnecting: false,
      connectingFromNodeId: null,
    });
  },

  // 删除连接
  removeConnection: (connectionId) => {
    set(state => ({
      editor: {
        ...state.editor,
        connections: state.editor.connections.filter(c => c.id !== connectionId),
      },
    }));
  },

  // 设置缩放
  setZoom: (zoom) => {
    const clampedZoom = Math.max(0.25, Math.min(2, zoom));
    set(state => ({
      editor: {
        ...state.editor,
        zoom: clampedZoom,
      },
    }));
  },

  // 设置平移
  setPan: (panX, panY) => {
    set(state => ({
      editor: {
        ...state.editor,
        panX,
        panY,
      },
    }));
  },

  // 重置视图
  resetView: () => {
    set(state => ({
      editor: {
        ...state.editor,
        zoom: 1,
        panX: 0,
        panY: 0,
      },
    }));
  },

  // 新建 Pipeline
  newPipeline: () => {
    set({
      editor: initialEditorState,
      currentPipelineId: null,
      currentPipelineName: '新建 Pipeline',
      currentPipelineDescription: '',
      validationErrors: [],
    });
  },

  // 加载 Pipeline
  loadPipeline: (config) => {
    const editorState = pipelineConfigToEditorState(config);
    set({
      editor: editorState,
      currentPipelineId: config.id,
      currentPipelineName: config.name,
      currentPipelineDescription: config.description || '',
      validationErrors: [],
    });
  },

  // 保存 Pipeline（返回配置，实际保存由调用方处理）
  savePipeline: () => {
    const state = get();
    const validation = validateEditorState(state.editor);
    
    if (!validation.valid) {
      set({ validationErrors: validation.errors });
      return null;
    }

    const pipelineId = state.currentPipelineId || nanoid();
    const config = editorStateToPipelineConfig(
      state.editor,
      pipelineId,
      state.currentPipelineName,
      state.currentPipelineDescription
    );

    if (config) {
      set({
        currentPipelineId: pipelineId,
        validationErrors: [],
      });
    }

    return config;
  },

  // 设置 Pipeline 信息
  setPipelineInfo: (name, description) => {
    set({
      currentPipelineName: name,
      currentPipelineDescription: description,
    });
  },

  // 设置 Pipeline 列表
  setPipelines: (pipelines) => {
    set({ pipelines });
  },

  // 设置选中的 Pipeline 状态
  setSelectedPipelineStatus: (status) => {
    set({ selectedPipelineStatus: status });
  },

  // UI 操作
  setShowConfigPanel: (show) => set({ showConfigPanel: show }),
  setShowPipelineList: (show) => set({ showPipelineList: show }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setIsSaving: (saving) => set({ isSaving: saving }),

  // 验证
  validate: () => {
    const state = get();
    const result = validateEditorState(state.editor);
    set({ validationErrors: result.errors });
    return result;
  },

  // 获取选中节点
  getSelectedNode: () => {
    const state = get();
    if (!state.editor.selectedNodeId) return null;
    return state.editor.nodes.find(n => n.id === state.editor.selectedNodeId) || null;
  },
}));
