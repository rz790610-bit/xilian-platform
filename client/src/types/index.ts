// 导航菜单类型
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  path?: string;
  children?: NavSubItem[];
}

export interface NavSubItem {
  id: string;
  label: string;
  icon: string;
  path: string;
}

// 智能体类型
export interface Agent {
  id: string;
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
}

// 聊天消息类型
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// 插件类型
export interface Plugin {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  inputs: PluginPort[];
  outputs: PluginPort[];
  enabled: boolean;
}

export interface PluginPort {
  name: string;
  type: string;
}

// Pipeline 节点类型
export interface PipelineNode {
  id: string;
  pluginId: string;
  name: string;
  icon: string;
  x: number;
  y: number;
  config?: Record<string, unknown>;
}

export interface PipelineConnection {
  id: string;
  from: string;
  to: string;
  fromPort?: string;
  toPort?: string;
}

export interface Pipeline {
  id: string;
  name: string;
  description?: string;
  nodes: PipelineNode[];
  connections: PipelineConnection[];
  createdAt: Date;
  updatedAt: Date;
}

// 文档类型
export interface Document {
  id: string;
  filename: string;
  content?: string;
  size: number;
  type: string;
  uploadedAt: Date;
}

// 数据文件类型
export interface DataFile {
  id: string;
  name: string;
  type: 'csv' | 'doc' | 'media' | 'cad' | 'image' | 'other';
  size: number;
  tags: string[];
  uploadedAt: Date;
  preview?: string;
}

// 模型类型
export interface Model {
  id: string;
  name: string;
  type: 'llm' | 'embedding' | 'vision' | 'audio' | 'label' | 'diagnostic';
  size: string;
  status: 'loaded' | 'local' | 'available';
  provider: string;
}

// 数据库配置类型
export interface DatabaseConfig {
  id: string;
  name: string;
  type: 'qdrant' | 'milvus' | 'chroma' | 'postgres';
  host: string;
  port: number;
  status: 'connected' | 'disconnected' | 'error';
}

// 系统状态类型
export interface SystemStatus {
  api: 'running' | 'stopped' | 'error';
  ollama: 'connected' | 'disconnected';
  currentModel: string;
  latency?: number;
}

// 统计数据类型
export interface DashboardStats {
  agents: number;
  plugins: number;
  documents: number;
  models: number;
}

// 标签类型
export interface Tag {
  name: string;
  label: string;
  color: 'primary' | 'success' | 'warning' | 'danger';
  count: number;
}

// API 响应类型
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// 拓扑节点类型
export interface TopologyNode {
  id: string;
  name: string;
  type: 'plugin' | 'engine' | 'database' | 'model';
  status: 'running' | 'stopped' | 'error';
  x: number;
  y: number;
}

export interface TopologyEdge {
  from: string;
  to: string;
  type: 'data' | 'dependency';
}
