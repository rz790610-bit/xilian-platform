import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  Agent, 
  ChatMessage, 
  Plugin, 
  Pipeline, 
  PipelineNode, 
  PipelineConnection,
  Document, 
  DataFile, 
  Model, 
  DatabaseConfig,
  SystemStatus,
  DashboardStats,
  Tag
} from '@/types';

// [P1-A2 修复] 已删除硬编码 API_BASE = 'http://localhost:8000'
// 所有 API 调用应统一通过 tRPC 的 /api/trpc 代理发出
// 若仍有组件需要直接 fetch，应使用相对路径（如 '/api/analyze'）而非绝对 URL
// export const API_BASE = 'http://localhost:8000'; // REMOVED

interface AppState {
  // 导航状态
  currentPage: string;
  currentSubPage: string;
  sidebarCollapsed: boolean;
  expandedMenus: string[];
  
  // 系统状态
  systemStatus: SystemStatus;
  dashboardStats: DashboardStats;
  
  // 智能体
  agents: Agent[];
  currentAgent: Agent | null;
  agentMessages: ChatMessage[];
  
  // AI 对话
  chatMessages: ChatMessage[];
  selectedModel: string;
  
  // Pipeline
  plugins: Plugin[];
  pipelines: Pipeline[];
  currentPipeline: Pipeline | null;
  pipelineNodes: PipelineNode[];
  pipelineConnections: PipelineConnection[];
  selectedNode: string | null;
  
  // 文档
  documents: Document[];
  
  // 数据管理
  dataFiles: DataFile[];
  dataTags: Tag[];
  selectedFiles: string[];
  batchMode: boolean;
  
  // 模型
  models: Model[];
  
  // 数据库
  databases: DatabaseConfig[];
  
  // Actions
  setCurrentPage: (page: string) => void;
  setCurrentSubPage: (subPage: string) => void;
  toggleSidebar: () => void;
  toggleMenu: (menuId: string) => void;
  setSystemStatus: (status: Partial<SystemStatus>) => void;
  setDashboardStats: (stats: Partial<DashboardStats>) => void;
  
  // Agent actions
  setAgents: (agents: Agent[]) => void;
  selectAgent: (agent: Agent | null) => void;
  addAgentMessage: (message: ChatMessage) => void;
  clearAgentMessages: () => void;
  
  // Chat actions
  addChatMessage: (message: ChatMessage) => void;
  clearChatMessages: () => void;
  setSelectedModel: (model: string) => void;
  
  // Pipeline actions
  setPlugins: (plugins: Plugin[]) => void;
  setPipelines: (pipelines: Pipeline[]) => void;
  setCurrentPipeline: (pipeline: Pipeline | null) => void;
  addPipelineNode: (node: PipelineNode) => void;
  updatePipelineNode: (id: string, updates: Partial<PipelineNode>) => void;
  removePipelineNode: (id: string) => void;
  addPipelineConnection: (connection: PipelineConnection) => void;
  removePipelineConnection: (id: string) => void;
  clearPipeline: () => void;
  setSelectedNode: (id: string | null) => void;
  
  // Document actions
  setDocuments: (documents: Document[]) => void;
  addDocument: (document: Document) => void;
  removeDocument: (id: string) => void;
  
  // Data file actions
  setDataFiles: (files: DataFile[]) => void;
  addDataFile: (file: DataFile) => void;
  removeDataFile: (id: string) => void;
  updateDataFileTags: (id: string, tags: string[]) => void;
  setDataTags: (tags: Tag[]) => void;
  toggleFileSelect: (id: string) => void;
  clearFileSelection: () => void;
  setBatchMode: (mode: boolean) => void;
  
  // Model actions
  setModels: (models: Model[]) => void;
  
  // Database actions
  setDatabases: (databases: DatabaseConfig[]) => void;
}

// 默认智能体数据
const defaultAgents: Agent[] = [
  {
    id: 'bearing',
    name: '轴承诊断专家',
    icon: '🔩',
    description: '专注于轴承故障诊断，包括内圈、外圈、滚动体和保持架故障分析',
    systemPrompt: '你是一位资深的轴承诊断专家，精通各类轴承故障的振动特征分析...'
  },
  {
    id: 'gear',
    name: '齿轮诊断专家',
    icon: '⚙️',
    description: '专注于齿轮箱故障诊断，包括齿面磨损、断齿、偏心等问题',
    systemPrompt: '你是一位齿轮传动系统诊断专家，熟悉各类齿轮故障模式...'
  },
  {
    id: 'motor',
    name: '电机诊断专家',
    icon: '🔌',
    description: '专注于电机故障诊断，包括转子故障、定子故障、轴承故障等',
    systemPrompt: '你是一位电机诊断专家，精通电机的电气和机械故障分析...'
  },
  {
    id: 'pump',
    name: '泵阀诊断专家',
    icon: '💧',
    description: '专注于泵和阀门故障诊断，包括气蚀、密封泄漏等问题',
    systemPrompt: '你是一位泵阀系统诊断专家，熟悉各类流体机械故障...'
  },
  {
    id: 'general',
    name: '通用诊断专家',
    icon: '🔧',
    description: '综合诊断能力，可处理各类机械设备的故障分析',
    systemPrompt: '你是一位综合机械诊断专家，具备广泛的设备故障诊断能力...'
  },
  {
    id: 'data',
    name: '数据分析专家',
    icon: '📊',
    description: '专注于振动数据的统计分析和特征提取',
    systemPrompt: '你是一位数据分析专家，擅长振动信号的统计分析和特征工程...'
  }
];

// 默认插件数据
const defaultPlugins: Plugin[] = [
  {
    id: 'sensor-input',
    name: '传感器输入',
    description: '从传感器读取振动数据',
    icon: '📡',
    category: '数据源',
    inputs: [],
    outputs: [{ name: 'signal', type: 'array' }],
    enabled: true
  },
  {
    id: 'fft',
    name: 'FFT分析',
    description: '快速傅里叶变换频谱分析',
    icon: '🔊',
    category: '信号处理',
    inputs: [{ name: 'signal', type: 'array' }],
    outputs: [{ name: 'spectrum', type: 'object' }],
    enabled: true
  },
  {
    id: 'envelope',
    name: '包络分析',
    description: '希尔伯特变换包络解调',
    icon: '📈',
    category: '信号处理',
    inputs: [{ name: 'signal', type: 'array' }],
    outputs: [{ name: 'envelope', type: 'array' }],
    enabled: true
  },
  {
    id: 'feature-extract',
    name: '特征提取',
    description: '提取时域和频域特征',
    icon: '🎯',
    category: '特征工程',
    inputs: [{ name: 'signal', type: 'array' }],
    outputs: [{ name: 'features', type: 'object' }],
    enabled: true
  },
  {
    id: 'ai-diagnosis',
    name: 'AI诊断',
    description: '基于大模型的智能诊断',
    icon: '🤖',
    category: '诊断',
    inputs: [{ name: 'features', type: 'object' }],
    outputs: [{ name: 'diagnosis', type: 'object' }],
    enabled: true
  },
  {
    id: 'report-gen',
    name: '报告生成',
    description: '生成诊断报告',
    icon: '📝',
    category: '输出',
    inputs: [{ name: 'diagnosis', type: 'object' }],
    outputs: [{ name: 'report', type: 'string' }],
    enabled: true
  }
];

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // 初始状态
      currentPage: 'dashboard',
      currentSubPage: '',
      sidebarCollapsed: false,
      expandedMenus: [],
      
      systemStatus: {
        api: 'running',
        ollama: 'connected',
        currentModel: 'llama3.1:70b'
      },
      
      dashboardStats: {
        agents: 6,
        plugins: 6,
        documents: 0,
        models: 2
      },
      
      agents: defaultAgents,
      currentAgent: null,
      agentMessages: [],
      
      chatMessages: [],
      selectedModel: 'llama3.1:70b',
      
      plugins: defaultPlugins,
      pipelines: [],
      currentPipeline: null,
      pipelineNodes: [],
      pipelineConnections: [],
      selectedNode: null,
      
      documents: [],
      
      dataFiles: [],
      dataTags: [
        { name: 'sensor', label: '传感器数据', color: 'primary', count: 0 },
        { name: 'report', label: '报告', color: 'success', count: 0 },
        { name: 'manual', label: '手册', color: 'warning', count: 0 }
      ],
      selectedFiles: [],
      batchMode: false,
      
      models: [
        { id: 'llama3.1:70b', name: 'llama3.1:70b', type: 'llm', size: '42GB', status: 'loaded', provider: 'ollama' },
        { id: 'qwen2.5:7b', name: 'qwen2.5:7b', type: 'llm', size: '4.7GB', status: 'local', provider: 'ollama' }
      ],
      
      databases: [
        { id: 'qdrant', name: 'Qdrant', type: 'qdrant', host: 'localhost', port: 6333, status: 'connected' }
      ],
      
      // Actions
      setCurrentPage: (page) => set({ currentPage: page, currentSubPage: '' }),
      setCurrentSubPage: (subPage) => set({ currentSubPage: subPage }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      toggleMenu: (menuId) => set((state) => ({
        expandedMenus: state.expandedMenus.includes(menuId)
          ? state.expandedMenus.filter(id => id !== menuId)
          : [...state.expandedMenus, menuId]
      })),
      setSystemStatus: (status) => set((state) => ({ 
        systemStatus: { ...state.systemStatus, ...status } 
      })),
      setDashboardStats: (stats) => set((state) => ({ 
        dashboardStats: { ...state.dashboardStats, ...stats } 
      })),
      
      // Agent actions
      setAgents: (agents) => set({ agents }),
      selectAgent: (agent) => set({ currentAgent: agent, agentMessages: [] }),
      addAgentMessage: (message) => set((state) => ({ 
        agentMessages: [...state.agentMessages, message] 
      })),
      clearAgentMessages: () => set({ agentMessages: [] }),
      
      // Chat actions
      addChatMessage: (message) => set((state) => ({ 
        chatMessages: [...state.chatMessages, message] 
      })),
      clearChatMessages: () => set({ chatMessages: [] }),
      setSelectedModel: (model) => set({ selectedModel: model }),
      
      // Pipeline actions
      setPlugins: (plugins) => set({ plugins }),
      setPipelines: (pipelines) => set({ pipelines }),
      setCurrentPipeline: (pipeline) => set({ 
        currentPipeline: pipeline,
        pipelineNodes: pipeline?.nodes || [],
        pipelineConnections: pipeline?.connections || []
      }),
      addPipelineNode: (node) => set((state) => ({ 
        pipelineNodes: [...state.pipelineNodes, node] 
      })),
      updatePipelineNode: (id, updates) => set((state) => ({
        pipelineNodes: state.pipelineNodes.map(node => 
          node.id === id ? { ...node, ...updates } : node
        )
      })),
      removePipelineNode: (id) => set((state) => ({
        pipelineNodes: state.pipelineNodes.filter(node => node.id !== id),
        pipelineConnections: state.pipelineConnections.filter(
          conn => conn.from !== id && conn.to !== id
        )
      })),
      addPipelineConnection: (connection) => set((state) => ({ 
        pipelineConnections: [...state.pipelineConnections, connection] 
      })),
      removePipelineConnection: (id) => set((state) => ({
        pipelineConnections: state.pipelineConnections.filter(conn => conn.id !== id)
      })),
      clearPipeline: () => set({ pipelineNodes: [], pipelineConnections: [], selectedNode: null }),
      setSelectedNode: (id) => set({ selectedNode: id }),
      
      // Document actions
      setDocuments: (documents) => set({ documents }),
      addDocument: (document) => set((state) => ({ 
        documents: [...state.documents, document] 
      })),
      removeDocument: (id) => set((state) => ({
        documents: state.documents.filter(doc => doc.id !== id)
      })),
      
      // Data file actions
      setDataFiles: (files) => set({ dataFiles: files }),
      addDataFile: (file) => set((state) => ({ 
        dataFiles: [...state.dataFiles, file] 
      })),
      removeDataFile: (id) => set((state) => ({
        dataFiles: state.dataFiles.filter(file => file.id !== id)
      })),
      updateDataFileTags: (id, tags) => set((state) => ({
        dataFiles: state.dataFiles.map(file =>
          file.id === id ? { ...file, tags } : file
        )
      })),
      setDataTags: (tags) => set({ dataTags: tags }),
      toggleFileSelect: (id) => set((state) => ({
        selectedFiles: state.selectedFiles.includes(id)
          ? state.selectedFiles.filter(fid => fid !== id)
          : [...state.selectedFiles, id]
      })),
      clearFileSelection: () => set({ selectedFiles: [] }),
      setBatchMode: (mode) => set({ batchMode: mode, selectedFiles: mode ? [] : [] }),
      
      // Model actions
      setModels: (models) => set({ models }),
      
      // Database actions
      setDatabases: (databases) => set({ databases })
    }),
    {
      name: 'xilian-storage',
      partialize: (state) => ({
        documents: state.documents,
        dataFiles: state.dataFiles,
        dataTags: state.dataTags,
        pipelines: state.pipelines,
        selectedModel: state.selectedModel
      })
    }
  )
);
