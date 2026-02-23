/**
 * ============================================================
 * @xilian/sdk — TypeScript SDK
 * ============================================================
 * 
 * 西联工业物联网平台官方 TypeScript/JavaScript SDK
 * 支持 Node.js 和浏览器环境
 * 
 * 使用方式:
 *   import { XilianClient } from '@xilian/sdk';
 *   const client = new XilianClient({ baseUrl: 'https://api.xilian.io/v1', token: '...' });
 *   const devices = await client.devices.list({ status: 'online' });
 * ============================================================
 */

// ── 配置 ──
export interface XilianConfig {
  baseUrl: string;
  token?: string;
  timeout?: number;
  retries?: number;
  onError?: (error: XilianError) => void;
}

// ── 错误类型 ──
export class XilianError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'XilianError';
  }
}

// ── 分页 ──
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ── 设备类型 ──
export interface Device {
  id: string;
  name: string;
  deviceTypeId: string;
  status: 'online' | 'offline' | 'warning' | 'error';
  metadata: Record<string, unknown>;
  lastHeartbeat: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeviceInput {
  name: string;
  deviceTypeId: string;
  metadata?: Record<string, unknown>;
}

export interface DeviceListParams extends PaginationParams {
  status?: Device['status'];
  deviceTypeId?: string;
}

// ── 算法类型 ──
export type AlgorithmType = 'fft' | 'envelope' | 'cepstrum' | 'wavelet' | 'trend' | 'order-tracking';
export type WindowFunction = 'hanning' | 'hamming' | 'blackman' | 'rectangular';

export interface AlgorithmExecuteInput {
  algorithmType: AlgorithmType;
  signalData: number[];
  sampleRate: number;
  parameters?: {
    windowFunction?: WindowFunction;
    fftSize?: 256 | 512 | 1024 | 2048 | 4096 | 8192;
    overlap?: number;
  };
}

export interface DiagnosticResult {
  faultType: string;
  severity: 'normal' | 'attention' | 'warning' | 'danger';
  confidence: number;
  description: string;
  recommendations: string[];
}

export interface AlgorithmResult {
  id: string;
  algorithmType: AlgorithmType;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: {
    spectrum: number[];
    features: Record<string, number>;
    diagnostics: DiagnosticResult[];
  };
  duration: number;
  createdAt: string;
}

// ── 管道类型 ──
export interface Pipeline {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'paused' | 'error';
  throughput: number;
  lag: number;
}

// ── 知识类型 ──
export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
}

export interface KnowledgeSearchInput {
  query: string;
  topK?: number;
  category?: string;
  useGraphExpansion?: boolean;
}

export interface KnowledgeSearchResult {
  results: KnowledgeEntry[];
  graphRelations: Record<string, unknown>[];
}

// ── 告警类型 ──
export interface Alert {
  id: string;
  ruleId: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'firing' | 'resolved' | 'acknowledged';
  nodeId: string;
  message: string;
  firedAt: string;
  resolvedAt: string | null;
}

export interface AlertListParams extends PaginationParams {
  severity?: Alert['severity'];
  status?: Alert['status'];
}

// ── 健康检查 ──
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: Record<string, { status: string; latency: number }>;
  uptime: number;
  version: string;
}

// ── HTTP 客户端 ──
class HttpClient {
  private baseUrl: string;
  private token?: string;
  private timeout: number;
  private retries: number;
  private onError?: (error: XilianError) => void;

  constructor(config: XilianConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.token = config.token;
    this.timeout = config.timeout ?? 30000;
    this.retries = config.retries ?? 3;
    this.onError = config.onError;
  }

  setToken(token: string): void {
    this.token = token;
  }

  async request<T>(method: string, path: string, options?: {
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
    signal?: AbortSignal;
  }): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.set(key, String(value));
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-SDK-Version': '1.0.0',
      'X-SDK-Language': 'typescript',
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url.toString(), {
          method,
          headers,
          body: options?.body ? JSON.stringify(options.body) : undefined,
          // P1-R7-06: 每次重试创建新 AbortController，合并用户 signal 和超时 signal
          signal: options?.signal
            ? (typeof AbortSignal.any === 'function'
              ? AbortSignal.any([options.signal, controller.signal])
              : controller.signal)
            : controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          const error = new XilianError(
            errorBody.error?.message ?? `HTTP ${response.status}`,
            response.status,
            errorBody.error?.code ?? 'UNKNOWN',
            errorBody.error?.details
          );
          
          // 不重试 4xx 错误（除了 429）
          if (response.status < 500 && response.status !== 429) {
            this.onError?.(error);
            throw error;
          }
          
          lastError = error;
          // 429 或 5xx 重试，指数退避
          if (attempt < this.retries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        return await response.json() as T;
      } catch (e) {
        if (e instanceof XilianError) throw e;
        lastError = e as Error;
        if (attempt < this.retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    const error = new XilianError(
      lastError?.message ?? 'Request failed after retries',
      0,
      'NETWORK_ERROR'
    );
    this.onError?.(error);
    throw error;
  }

  get<T>(path: string, params?: Record<string, string | number | boolean | undefined>) {
    return this.request<T>('GET', path, { params });
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, { body });
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, { body });
  }

  delete<T>(path: string) {
    return this.request<T>('DELETE', path);
  }
}

// ── 子模块 ──
class DeviceAPI {
  constructor(private http: HttpClient) {}

  list(params?: DeviceListParams) {
    return this.http.get<PaginatedResult<Device>>('/devices', params as Record<string, string | number | boolean | undefined>);
  }

  get(id: string) {
    return this.http.get<Device>(`/devices/${id}`);
  }

  create(input: CreateDeviceInput) {
    return this.http.post<Device>('/devices', input);
  }

  update(id: string, input: Partial<CreateDeviceInput>) {
    return this.http.put<Device>(`/devices/${id}`, input);
  }

  delete(id: string) {
    return this.http.delete<void>(`/devices/${id}`);
  }
}

class AlgorithmAPI {
  constructor(private http: HttpClient) {}

  execute(input: AlgorithmExecuteInput) {
    return this.http.post<AlgorithmResult>('/algorithms/execute', input);
  }

  getResult(id: string) {
    return this.http.get<AlgorithmResult>(`/algorithms/results/${id}`);
  }

  listTypes() {
    return this.http.get<{ id: string; name: string; description: string }[]>('/algorithms/types');
  }
}

class PipelineAPI {
  constructor(private http: HttpClient) {}

  list() {
    return this.http.get<Pipeline[]>('/pipelines');
  }

  get(id: string) {
    return this.http.get<Pipeline>(`/pipelines/${id}`);
  }

  start(id: string) {
    return this.http.post<void>(`/pipelines/${id}/start`);
  }

  stop(id: string) {
    return this.http.post<void>(`/pipelines/${id}/stop`);
  }

  pause(id: string) {
    return this.http.post<void>(`/pipelines/${id}/pause`);
  }
}

class KnowledgeAPI {
  constructor(private http: HttpClient) {}

  search(input: KnowledgeSearchInput) {
    return this.http.post<KnowledgeSearchResult>('/knowledge/search', input);
  }

  get(id: string) {
    return this.http.get<KnowledgeEntry>(`/knowledge/${id}`);
  }

  create(input: Omit<KnowledgeEntry, 'id'>) {
    return this.http.post<KnowledgeEntry>('/knowledge', input);
  }
}

class AlertAPI {
  constructor(private http: HttpClient) {}

  list(params?: AlertListParams) {
    return this.http.get<PaginatedResult<Alert>>('/alerts', params as Record<string, string | number | boolean | undefined>);
  }

  acknowledge(id: string) {
    return this.http.post<void>(`/alerts/${id}/acknowledge`);
  }

  resolve(id: string) {
    return this.http.post<void>(`/alerts/${id}/resolve`);
  }
}

class HealthAPI {
  constructor(private http: HttpClient) {}

  check() {
    return this.http.get<HealthStatus>('/health');
  }
}

// ── 主客户端 ──
export class XilianClient {
  private http: HttpClient;

  public readonly devices: DeviceAPI;
  public readonly algorithms: AlgorithmAPI;
  public readonly pipelines: PipelineAPI;
  public readonly knowledge: KnowledgeAPI;
  public readonly alerts: AlertAPI;
  public readonly health: HealthAPI;

  constructor(config: XilianConfig) {
    this.http = new HttpClient(config);
    this.devices = new DeviceAPI(this.http);
    this.algorithms = new AlgorithmAPI(this.http);
    this.pipelines = new PipelineAPI(this.http);
    this.knowledge = new KnowledgeAPI(this.http);
    this.alerts = new AlertAPI(this.http);
    this.health = new HealthAPI(this.http);
  }

  setToken(token: string): void {
    this.http.setToken(token);
  }
}

// ── 默认导出 ──
export default XilianClient;
