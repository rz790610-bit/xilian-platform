// Ollama API 服务模块
// 对接本地 Ollama 大模型服务

// Ollama API 基础地址
// - 开发环境：直接访问 localhost:11434
// - Docker 部署：通过 nginx 代理，使用相对路径 /api
const OLLAMA_BASE_URL = import.meta.env.VITE_OLLAMA_URL || 
  (import.meta.env.DEV ? 'http://localhost:11434' : '');

// 模型信息接口
export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

// 聊天消息接口
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// 聊天响应接口
export interface ChatResponse {
  model: string;
  created_at: string;
  message: ChatMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

// 生成响应接口
export interface GenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * 获取 Ollama 模型列表
 */
export async function getModels(): Promise<OllamaModel[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.models || [];
  } catch (error) {
    console.error('获取模型列表失败:', error);
    throw error;
  }
}

/**
 * 检查 Ollama 服务是否可用
 */
export async function checkOllamaStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5秒超时
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 拉取模型
 */
export async function pullModel(
  modelName: string,
  onProgress?: (status: string, completed?: number, total?: number) => void
): Promise<void> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, stream: true }),
  });

  if (!response.ok) {
    throw new Error(`拉取模型失败: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (onProgress) {
          onProgress(data.status, data.completed, data.total);
        }
      } catch {
        // 忽略解析错误
      }
    }
  }
}

/**
 * 删除模型
 */
export async function deleteModel(modelName: string): Promise<void> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName }),
  });

  if (!response.ok) {
    throw new Error(`删除模型失败: ${response.status}`);
  }
}

/**
 * 聊天对话（流式）
 */
export async function chat(
  model: string,
  messages: ChatMessage[],
  onChunk?: (chunk: string) => void,
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  }
): Promise<string> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      options: {
        temperature: options?.temperature ?? 0.7,
        top_p: options?.top_p ?? 0.9,
        top_k: options?.top_k ?? 40,
        num_predict: options?.num_predict ?? 2048,
        stop: options?.stop,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`聊天请求失败: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');

  const decoder = new TextDecoder();
  let fullResponse = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const data: ChatResponse = JSON.parse(line);
        if (data.message?.content) {
          fullResponse += data.message.content;
          if (onChunk) {
            onChunk(data.message.content);
          }
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  return fullResponse;
}

/**
 * 单次生成（非对话模式）
 */
export async function generate(
  model: string,
  prompt: string,
  onChunk?: (chunk: string) => void,
  options?: {
    system?: string;
    temperature?: number;
    top_p?: number;
    num_predict?: number;
  }
): Promise<string> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      system: options?.system,
      stream: true,
      options: {
        temperature: options?.temperature ?? 0.7,
        top_p: options?.top_p ?? 0.9,
        num_predict: options?.num_predict ?? 2048,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`生成请求失败: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');

  const decoder = new TextDecoder();
  let fullResponse = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const data: GenerateResponse = JSON.parse(line);
        if (data.response) {
          fullResponse += data.response;
          if (onChunk) {
            onChunk(data.response);
          }
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  return fullResponse;
}

/**
 * 生成文本嵌入向量
 */
export async function generateEmbedding(
  text: string,
  model: string = 'nomic-embed-text'
): Promise<number[]> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: text
    })
  });
  
  if (!response.ok) {
    throw new Error(`生成嵌入向量失败: ${response.status}`);
  }
  
  const data = await response.json();
  return data.embedding;
}

/**
 * 获取模型信息
 */
export async function showModel(modelName: string): Promise<{
  modelfile: string;
  parameters: string;
  template: string;
  details: OllamaModel['details'];
}> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/show`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName }),
  });

  if (!response.ok) {
    throw new Error(`获取模型信息失败: ${response.status}`);
  }

  return response.json();
}

/**
 * 格式化模型大小
 */
export function formatModelSize(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

/**
 * 格式化时间
 */
export function formatDuration(ns: number): string {
  const ms = ns / 1000000;
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  const s = ms / 1000;
  if (s < 60) {
    return `${s.toFixed(1)}s`;
  }
  const m = s / 60;
  return `${m.toFixed(1)}min`;
}
