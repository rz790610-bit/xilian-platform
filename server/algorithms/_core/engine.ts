/**
 * 统一算法执行引擎
 * 
 * 功能:
 * 1. 算法注册与发现 — 所有算法实现注册到引擎
 * 2. 统一执行入口 — execute(algorithmId, input, config)
 * 3. 依赖注入 — 设备参数/轴承/工况等外部依赖
 * 4. 执行上下文 — 日志/超时/取消/重试
 * 5. 结果缓存 — 相同输入避免重复计算
 * 6. 版本管理 — 算法版本追踪
 */

import type {
  IAlgorithmExecutor,
  AlgorithmInput,
  AlgorithmOutput,
  AlgorithmRegistration,
  AlgorithmStatus,
} from './types';
import { AlgorithmDependencies, DefaultDependencies } from './dependencies';

// ============================================================
// 执行上下文
// ============================================================

export interface ExecutionContext {
  /** 执行ID */
  executionId: string;
  /** 请求者 */
  requestedBy?: string;
  /** 设备ID */
  equipmentId?: string;
  /** 超时时间 (ms) */
  timeout?: number;
  /** 取消信号 */
  abortSignal?: AbortSignal;
  /** 是否使用缓存 */
  useCache?: boolean;
  /** 优先级 (1-10, 1最高) */
  priority?: number;
  /** 回调 */
  onProgress?: (progress: number, message: string) => void;
}

export interface ExecutionRecord {
  executionId: string;
  algorithmId: string;
  status: AlgorithmStatus;
  input: AlgorithmInput;
  config: Record<string, any>;
  output?: AlgorithmOutput;
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
  error?: string;
  context?: ExecutionContext;
}

// ============================================================
// 缓存
// ============================================================

interface CacheEntry {
  key: string;
  output: AlgorithmOutput;
  timestamp: number;
  ttl: number;
}

class ExecutionCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private defaultTTL: number;

  constructor(maxSize: number = 100, defaultTTL: number = 300000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  generateKey(algorithmId: string, input: AlgorithmInput, config: Record<string, any>): string {
    const inputHash = this.hashObject({ algorithmId, input, config });
    return inputHash;
  }

  get(key: string): AlgorithmOutput | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.output;
  }

  set(key: string, output: AlgorithmOutput, ttl?: number): void {
    // LRU淘汰
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      key,
      output,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTTL,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  private hashObject(obj: any): string {
    const str = JSON.stringify(obj, (_, v) =>
      typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v
    );
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return `cache_${hash.toString(36)}`;
  }
}

// ============================================================
// 算法执行引擎
// ============================================================

export class AlgorithmEngine {
  private static instance: AlgorithmEngine;

  /** 已注册的算法 */
  private registry = new Map<string, AlgorithmRegistration>();
  /** 执行历史 */
  private executionHistory: ExecutionRecord[] = [];
  /** 缓存 */
  private cache = new ExecutionCache();
  /** 依赖容器 */
  private dependencies: AlgorithmDependencies;
  /** 最大历史记录数 */
  private maxHistorySize = 1000;

  private constructor() {
    this.dependencies = new DefaultDependencies();
  }

  static getInstance(): AlgorithmEngine {
    if (!AlgorithmEngine.instance) {
      AlgorithmEngine.instance = new AlgorithmEngine();
    }
    return AlgorithmEngine.instance;
  }

  // ============================================================
  // 注册与发现
  // ============================================================

  /**
   * 注册算法
   */
  register(registration: AlgorithmRegistration): void {
    const id = registration.executor.id;
    if (this.registry.has(id)) {
      console.log(`[AlgorithmEngine] Updating algorithm: ${id}`);
    }
    this.registry.set(id, registration);
  }

  /**
   * 批量注册
   */
  registerAll(registrations: AlgorithmRegistration[]): void {
    for (const reg of registrations) {
      this.register(reg);
    }
    console.log(`[AlgorithmEngine] Registered ${registrations.length} algorithms, total: ${this.registry.size}`);
  }

  /**
   * 获取已注册算法
   */
  getAlgorithm(id: string): AlgorithmRegistration | undefined {
    return this.registry.get(id);
  }

  /**
   * 列出所有已注册算法
   */
  listAlgorithms(filter?: {
    category?: string;
    tag?: string;
    deviceType?: string;
  }): AlgorithmRegistration[] {
    let results = Array.from(this.registry.values());

    if (filter?.category) {
      results = results.filter(r => r.executor.category === filter.category);
    }
    if (filter?.tag) {
      results = results.filter(r => r.metadata.tags.includes(filter.tag!));
    }
    if (filter?.deviceType) {
      results = results.filter(r =>
        r.metadata.applicableDeviceTypes.includes(filter.deviceType!) ||
        r.metadata.applicableDeviceTypes.includes('*')
      );
    }

    return results;
  }

  /**
   * 获取所有分类
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    for (const reg of Array.from(this.registry.values())) {
      categories.add(reg.executor.category);
    }
    return Array.from(categories);
  }

  // ============================================================
  // 执行
  // ============================================================

  /**
   * 执行算法
   */
  async execute(
    algorithmId: string,
    input: AlgorithmInput,
    config: Record<string, any> = {},
    context?: Partial<ExecutionContext>
  ): Promise<AlgorithmOutput> {
    const registration = this.registry.get(algorithmId);
    if (!registration) {
      throw new Error(`Algorithm not found: ${algorithmId}`);
    }

    const executionId = context?.executionId || this.generateExecutionId();
    const fullContext: ExecutionContext = {
      executionId,
      timeout: 60000,
      useCache: true,
      priority: 5,
      ...context,
    };

    // 检查缓存
    if (fullContext.useCache) {
      const cacheKey = this.cache.generateKey(algorithmId, input, config);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        console.log(`[AlgorithmEngine] Cache hit for ${algorithmId}`);
        return cached;
      }
    }

    // 创建执行记录
    const record: ExecutionRecord = {
      executionId,
      algorithmId,
      status: 'running',
      input,
      config,
      startTime: new Date(),
      context: fullContext,
    };

    try {
      // 验证输入
      const validation = registration.executor.validateInput(input, config);
      if (!validation.valid) {
        throw new Error(`Input validation failed: ${validation.errors?.join(', ')}`);
      }

      // 合并默认配置
      const mergedConfig = {
        ...registration.executor.getDefaultConfig(),
        ...config,
      };

      // 注入依赖到 input context
      const enrichedInput = await this.enrichInput(input, fullContext);

      // 执行（带超时）
      const output = await this.executeWithTimeout(
        registration.executor,
        enrichedInput,
        mergedConfig,
        fullContext.timeout!
      );

      // 更新记录
      record.status = output.status;
      record.output = output;
      record.endTime = new Date();
      record.durationMs = record.endTime.getTime() - record.startTime.getTime();

      // 缓存结果
      if (fullContext.useCache && output.status === 'completed') {
        const cacheKey = this.cache.generateKey(algorithmId, input, config);
        this.cache.set(cacheKey, output);
      }

      this.addToHistory(record);
      return output;

    } catch (error: any) {
      record.status = 'failed';
      record.error = error.message;
      record.endTime = new Date();
      record.durationMs = record.endTime.getTime() - record.startTime.getTime();
      this.addToHistory(record);

      return {
        algorithmId,
        status: 'failed',
        diagnosis: {
          summary: `算法执行失败: ${error.message}`,
          severity: 'critical',
          urgency: 'immediate',
          confidence: 0,
        },
        results: {},
        metadata: {
          executionTimeMs: record.durationMs,
          inputDataPoints: Array.isArray(input.data) ? input.data.length : 0,
          algorithmVersion: registration.executor.version,
          parameters: config,
        },
        error: error.message,
      };
    }
  }

  /**
   * 批量执行（串行）
   */
  async executeBatch(
    tasks: Array<{ algorithmId: string; input: AlgorithmInput; config?: Record<string, any> }>,
    context?: Partial<ExecutionContext>
  ): Promise<AlgorithmOutput[]> {
    const results: AlgorithmOutput[] = [];
    for (const task of tasks) {
      const output = await this.execute(task.algorithmId, task.input, task.config, context);
      results.push(output);
    }
    return results;
  }

  /**
   * 执行编排（Pipeline）
   */
  async executeComposition(
    steps: Array<{
      algorithmId: string;
      config?: Record<string, any>;
      inputMapping?: Record<string, string>;  // 从上一步输出映射
    }>,
    initialInput: AlgorithmInput,
    context?: Partial<ExecutionContext>
  ): Promise<{ steps: AlgorithmOutput[]; finalOutput: AlgorithmOutput }> {
    const stepOutputs: AlgorithmOutput[] = [];
    let currentInput = { ...initialInput };

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // 输入映射：从前一步的输出中提取数据
      if (i > 0 && step.inputMapping && stepOutputs[i - 1]) {
        const prevResults = stepOutputs[i - 1].results;
        for (const [targetKey, sourceKey] of Object.entries(step.inputMapping)) {
          if (prevResults[sourceKey] !== undefined) {
            if (targetKey === 'data') {
              currentInput.data = prevResults[sourceKey];
            } else {
              currentInput.context = { ...currentInput.context, [targetKey]: prevResults[sourceKey] };
            }
          }
        }
      }

      context?.onProgress?.(
        (i / steps.length) * 100,
        `执行步骤 ${i + 1}/${steps.length}: ${step.algorithmId}`
      );

      const output = await this.execute(step.algorithmId, currentInput, step.config, context);
      stepOutputs.push(output);

      // 如果某步失败，中止编排
      if (output.status === 'failed') {
        return { steps: stepOutputs, finalOutput: output };
      }
    }

    return {
      steps: stepOutputs,
      finalOutput: stepOutputs[stepOutputs.length - 1],
    };
  }

  // ============================================================
  // 依赖管理
  // ============================================================

  /**
   * 注入依赖
   */
  setDependencies(deps: Partial<AlgorithmDependencies>): void {
    this.dependencies = { ...this.dependencies, ...deps };
  }

  getDependencies(): AlgorithmDependencies {
    return this.dependencies;
  }

  // ============================================================
  // 历史记录
  // ============================================================

  getExecutionHistory(filter?: {
    algorithmId?: string;
    status?: AlgorithmStatus;
    limit?: number;
  }): ExecutionRecord[] {
    let records = [...this.executionHistory];

    if (filter?.algorithmId) {
      records = records.filter(r => r.algorithmId === filter.algorithmId);
    }
    if (filter?.status) {
      records = records.filter(r => r.status === filter.status);
    }

    records.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    if (filter?.limit) {
      records = records.slice(0, filter.limit);
    }

    return records;
  }

  getExecutionStats(): {
    total: number;
    completed: number;
    failed: number;
    avgDurationMs: number;
    registeredAlgorithms: number;
  } {
    const completed = this.executionHistory.filter(r => r.status === 'completed');
    const failed = this.executionHistory.filter(r => r.status === 'failed');
    const avgDuration = completed.length > 0
      ? completed.reduce((s, r) => s + (r.durationMs || 0), 0) / completed.length
      : 0;

    return {
      total: this.executionHistory.length,
      completed: completed.length,
      failed: failed.length,
      avgDurationMs: Math.round(avgDuration),
      registeredAlgorithms: this.registry.size,
    };
  }

  // ============================================================
  // 内部方法
  // ============================================================

  private async enrichInput(input: AlgorithmInput, context: ExecutionContext): Promise<AlgorithmInput> {
    const enriched = { ...input };

    // 如果有设备ID，自动获取设备参数
    if (context.equipmentId && this.dependencies.equipment) {
      try {
        const equipment = await this.dependencies.equipment.getEquipment(context.equipmentId);
        if (equipment) {
          enriched.equipment = {
            ...enriched.equipment,
            type: equipment.type,
            model: equipment.name,
            ratedSpeed: equipment.ratedRPM,
            ratedPower: equipment.ratedPower,
          };
        }

        const runParams = await this.dependencies.equipment.getRunningParams(context.equipmentId);
        if (runParams.currentRPM) {
          enriched.operatingCondition = {
            ...enriched.operatingCondition,
            speed: runParams.currentRPM,
            load: runParams.loadPercentage,
            temperature: runParams.temperature,
          };
        }
      } catch (e) {
        // 依赖获取失败不影响算法执行
        console.warn(`[AlgorithmEngine] Failed to enrich input from equipment: ${e}`);
      }
    }

    return enriched;
  }

  private async executeWithTimeout(
    executor: IAlgorithmExecutor,
    input: AlgorithmInput,
    config: Record<string, any>,
    timeoutMs: number
  ): Promise<AlgorithmOutput> {
    return new Promise<AlgorithmOutput>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Algorithm execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      executor.execute(input, config)
        .then(output => {
          clearTimeout(timer);
          resolve(output);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private addToHistory(record: ExecutionRecord): void {
    this.executionHistory.push(record);
    // 限制历史记录大小
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
    }
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取引擎状态
   */
  getStatus(): {
    registeredAlgorithms: number;
    categories: string[];
    executionHistory: number;
    cacheEnabled: boolean;
  } {
    return {
      registeredAlgorithms: this.registry.size,
      categories: this.getCategories(),
      executionHistory: this.executionHistory.length,
      cacheEnabled: true,
    };
  }
}

/** 全局引擎实例 */
export const algorithmEngine = AlgorithmEngine.getInstance();
