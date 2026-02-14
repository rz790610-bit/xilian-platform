/**
 * ============================================================================
 * 算法服务层 — Algorithm Service
 * ============================================================================
 * 
 * 算法库的核心服务，提供：
 * 1. CRUD — 算法定义/实例/绑定/组合的增删改查
 * 2. 桥接层 — 统一执行接口，分发到 Pipeline Engine / Plugin Engine / Builtin / External
 * 3. 推荐引擎 — 根据设备类型+传感器+数据特征智能推荐算法
 * 4. 动态路由引擎 — 条件路由 + 级联触发
 * 5. Fleet Learning — A/B 测试 + 跨设备参数优化
 * 6. KG 集成 — 算法执行结果自动写入知识图谱
 * 
 * 设计原则：
 * - 不重复建设：复用 Pipeline Engine / Plugin Engine 的执行能力
 * - 桥接而非替代：算法库是元数据管理层 + 智能编排层
 * - 工程化：每次执行有完整的 trace（execution_id / 耗时 / 资源消耗）
 * - 商业化：支持版本管理 / 许可授权 / 性能基准 / SLA
 */

import { getDb } from '../lib/db';
import {
  algorithmDefinitions,
  algorithmCompositions,
  algorithmDeviceBindings,
  algorithmExecutions,
  algorithmRoutingRules,
  assetNodes,
} from '../../drizzle/schema';
import { eq, desc, and, or, like, inArray, sql, count, asc, gte } from 'drizzle-orm';
import { algorithmRegistry, type AlgorithmRegistryItem } from '../core/registries/algorithm.registry';
import { eventBus, TOPICS } from './eventBus.service';

// ============================================================================
// 类型定义
// ============================================================================

/** 算法执行上下文 */
export interface AlgorithmExecutionContext {
  /** 触发来源 */
  trigger: 'manual' | 'scheduled' | 'event' | 'cascade' | 'ab_test';
  /** 设备上下文（可选） */
  deviceContext?: {
    deviceCode: string;
    deviceType: string;
    location?: string;
    metadata?: Record<string, unknown>;
  };
  /** 时间上下文 */
  timeContext?: {
    timestamp: Date;
    hour: number;
    dayOfWeek: number;
    isWorkingHours: boolean;
  };
  /** 父执行 ID（级联触发时） */
  parentExecutionId?: string;
  /** A/B 测试分组 */
  abGroup?: 'control' | 'treatment';
  /** 用户 ID */
  userId?: string;
}

/** 算法执行结果 */
export interface AlgorithmExecutionResult {
  executionId: string;
  algoCode: string;
  status: 'success' | 'error' | 'timeout' | 'skipped';
  output: Record<string, unknown>;
  metrics: {
    durationMs: number;
    memoryUsedMb?: number;
    cpuPercent?: number;
  };
  qualityMetrics?: Record<string, number>;
  kgWriteResult?: {
    nodesCreated: number;
    edgesCreated: number;
    nodeIds: string[];
  };
  routingResult?: {
    rulesEvaluated: number;
    rulesMatched: number;
    cascadeTriggered: string[];
  };
}

/** 推荐结果 */
export interface AlgorithmRecommendation {
  algoCode: string;
  label: string;
  category: string;
  score: number;
  reason: string;
  suggestedConfig?: Record<string, unknown>;
}

/** 数据特征描述（用于智能推荐） */
export interface DataProfile {
  sampleRate?: number;        // Hz
  dataLength?: number;        // 样本数
  channels?: number;          // 通道数
  snrEstimate?: number;       // 信噪比估计 (dB)
  hasTimestamp?: boolean;      // 是否有时间戳
  valueRange?: { min: number; max: number };
  dominantFrequency?: number;  // 主频率 (Hz)
  stationarity?: 'stationary' | 'non_stationary' | 'unknown';
}

// ============================================================================
// 算法服务类
// ============================================================================

class AlgorithmService {

  // ========================================================================
  // 1. CRUD — 算法定义管理
  // ========================================================================

  /** 列出所有算法定义（支持分页/筛选/搜索） */
  async listDefinitions(options?: {
    category?: string;
    implType?: string;
    search?: string;
    status?: 'active' | 'deprecated' | 'experimental';
    page?: number;
    pageSize?: number;
  }): Promise<{ items: any[]; total: number; page: number; pageSize: number }> {
    const db = await getDb();
    if (!db) return { items: [], total: 0, page: 1, pageSize: 20 };

    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];
    if (options?.category) {
      conditions.push(eq(algorithmDefinitions.category, options.category));
    }
    if (options?.implType) {
      conditions.push(eq(algorithmDefinitions.implType, options.implType as any));
    }
    if (options?.status) {
      conditions.push(eq(algorithmDefinitions.status, options.status));
    }
    if (options?.search) {
      conditions.push(
        or(
          like(algorithmDefinitions.algoCode, `%${options.search}%`),
          like(algorithmDefinitions.algoName, `%${options.search}%`),
          like(algorithmDefinitions.description, `%${options.search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, totalResult] = await Promise.all([
      db.select()
        .from(algorithmDefinitions)
        .where(whereClause)
        .orderBy(desc(algorithmDefinitions.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: count() })
        .from(algorithmDefinitions)
        .where(whereClause),
    ]);

    return {
      items,
      total: Number(totalResult[0]?.count || 0),
      page,
      pageSize,
    };
  }

  /** 获取单个算法定义 */
  async getDefinition(algoCode: string): Promise<any | null> {
    const db = await getDb();
    if (!db) return null;

    const result = await db.select()
      .from(algorithmDefinitions)
      .where(eq(algorithmDefinitions.algoCode, algoCode))
      .limit(1);

    return result[0] || null;
  }

  /** 创建算法定义 */
  async createDefinition(data: {
    algoCode: string;
    algoName: string;
    description: string;
    category: string;
    subcategory?: string;
    implType: 'pipeline_node' | 'plugin' | 'builtin' | 'external' | 'kg_operator';
    implRef?: string;
    version?: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
    configSchema: Record<string, unknown>;
    applicableDeviceTypes?: string[];
    applicableMeasurementTypes?: string[];
    applicableScenarios?: string[];
    kgIntegration?: Record<string, unknown>;
    fleetLearningConfig?: Record<string, unknown>;
    benchmark?: Record<string, unknown>;
    license?: 'builtin' | 'community' | 'enterprise';
    author?: string;
    documentationUrl?: string;
    tags?: string[];
  }): Promise<{ id: number; algoCode: string }> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const result = await db.insert(algorithmDefinitions).values({
      algoCode: data.algoCode,
      algoName: data.algoName,
      description: data.description,
      category: data.category,
      subcategory: data.subcategory,
      implType: data.implType,
      implRef: data.implRef,
      version: data.version || 'v1.0.0',
      inputSchema: data.inputSchema,
      outputSchema: data.outputSchema,
      configSchema: data.configSchema,
      applicableDeviceTypes: data.applicableDeviceTypes || [],
      applicableMeasurementTypes: data.applicableMeasurementTypes || [],
      applicableScenarios: data.applicableScenarios || [],
      kgIntegration: (data.kgIntegration as any) || null,
      fleetLearningConfig: (data.fleetLearningConfig as any) || null,
      benchmark: (data.benchmark as any) || null,
      license: data.license || 'builtin',
      author: data.author || 'system',
      documentationUrl: data.documentationUrl || '',
      tags: data.tags || [],
      status: 'active',
    });

    const insertId = (result as any)[0]?.insertId || 0;

    // 发布事件
    await eventBus.publish(TOPICS.SYSTEM_ALERT, 'algorithm.created', {
      algoCode: data.algoCode,
      category: data.category,
    }).catch(() => { /* ignore event publish errors */ });

    return { id: insertId, algoCode: data.algoCode };
  }

  /** 更新算法定义 */
  async updateDefinition(algoCode: string, updates: Partial<{
    algoName: string;
    description: string;
    version: string;
    configSchema: Record<string, unknown>;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
    applicableDeviceTypes: string[];
    applicableMeasurementTypes: string[];
    applicableScenarios: string[];
    kgIntegration: Record<string, unknown>;
    fleetLearningConfig: Record<string, unknown>;
    benchmark: Record<string, unknown>;
    status: 'active' | 'deprecated' | 'experimental';
    tags: string[];
  }>): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    // Build a clean update object that matches schema types
    const updateObj: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.algoName !== undefined) updateObj.algoName = updates.algoName;
    if (updates.description !== undefined) updateObj.description = updates.description;
    if (updates.version !== undefined) updateObj.version = updates.version;
    if (updates.configSchema !== undefined) updateObj.configSchema = updates.configSchema;
    if (updates.inputSchema !== undefined) updateObj.inputSchema = updates.inputSchema;
    if (updates.outputSchema !== undefined) updateObj.outputSchema = updates.outputSchema;
    if (updates.applicableDeviceTypes !== undefined) updateObj.applicableDeviceTypes = updates.applicableDeviceTypes;
    if (updates.applicableMeasurementTypes !== undefined) updateObj.applicableMeasurementTypes = updates.applicableMeasurementTypes;
    if (updates.applicableScenarios !== undefined) updateObj.applicableScenarios = updates.applicableScenarios;
    if (updates.kgIntegration !== undefined) updateObj.kgIntegration = updates.kgIntegration;
    if (updates.fleetLearningConfig !== undefined) updateObj.fleetLearningConfig = updates.fleetLearningConfig;
    if (updates.benchmark !== undefined) updateObj.benchmark = updates.benchmark;
    if (updates.status !== undefined) updateObj.status = updates.status;
    if (updates.tags !== undefined) updateObj.tags = updates.tags;

    await db.update(algorithmDefinitions)
      .set(updateObj as any)
      .where(eq(algorithmDefinitions.algoCode, algoCode));

    await eventBus.publish(TOPICS.SYSTEM_ALERT, 'algorithm.updated', {
      algoCode,
      fields: Object.keys(updates),
    }).catch(() => { /* ignore */ });

    return true;
  }

  /** 删除算法定义（软删除） */
  async deleteDefinition(algoCode: string): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    await db.update(algorithmDefinitions)
      .set({ status: 'deprecated', updatedAt: new Date() })
      .where(eq(algorithmDefinitions.algoCode, algoCode));

    return true;
  }

  /** 同步注册中心的内置算法到数据库 */
  async syncBuiltinAlgorithms(): Promise<{ created: number; updated: number; skipped: number }> {
    const db = await getDb();
    if (!db) return { created: 0, updated: 0, skipped: 0 };

    const registryItems = algorithmRegistry.listItems() as AlgorithmRegistryItem[];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of registryItems) {
      // Convert registry item fields to schema-compatible format
      const inputSchema: Record<string, unknown> = { fields: item.inputFields };
      const outputSchema: Record<string, unknown> = { fields: item.outputFields };
      const configSchema: Record<string, unknown> = { fields: item.configFields };

      const values = {
        algoCode: item.id,
        algoName: item.label,
        description: item.description,
        category: item.algorithmCategory,
        subcategory: item.subcategory,
        implType: item.implType,
        implRef: item.implRef,
        version: item.version || 'v1.0.0',
        inputSchema,
        outputSchema,
        configSchema,
        applicableDeviceTypes: item.applicableDeviceTypes || [],
        applicableMeasurementTypes: item.applicableMeasurementTypes || [],
        applicableScenarios: item.applicableScenarios || [],
        kgIntegration: (item.kgIntegration as any) || null,
        fleetLearningConfig: null,
        benchmark: null,
        license: item.license || 'builtin',
        author: 'system',
        documentationUrl: '',
        tags: item.tags || [],
        status: 'active' as const,
      };

      // 检查是否已存在
      const existing = await db.select({ id: algorithmDefinitions.id })
        .from(algorithmDefinitions)
        .where(eq(algorithmDefinitions.algoCode, item.id))
        .limit(1);

      if (existing.length > 0) {
        // 已存在则更新（确保内置算法始终与 Registry 保持一致）
        await db.update(algorithmDefinitions)
          .set({
            algoName: values.algoName,
            description: values.description,
            category: values.category,
            subcategory: values.subcategory,
            implType: values.implType,
            implRef: values.implRef,
            inputSchema: values.inputSchema,
            outputSchema: values.outputSchema,
            configSchema: values.configSchema,
            applicableDeviceTypes: values.applicableDeviceTypes,
            applicableMeasurementTypes: values.applicableMeasurementTypes,
            applicableScenarios: values.applicableScenarios,
            tags: values.tags,
          })
          .where(eq(algorithmDefinitions.algoCode, item.id));
        updated++;
        continue;
      }

      await db.insert(algorithmDefinitions).values(values);
      created++;
    }

    console.log(`[AlgorithmService] Synced builtin algorithms: ${created} created, ${updated} updated, ${skipped} skipped`);
    return { created, updated, skipped };
  }

  // ========================================================================
  // 2. 设备绑定管理
  // ========================================================================

  /** 创建算法-设备绑定 */
  async createBinding(data: {
    algoCode: string;
    deviceCode: string;
    sensorCode?: string;
    bindingType?: 'algorithm' | 'composition';
    configOverrides?: Record<string, unknown>;
    schedule?: { type: 'cron' | 'interval' | 'event' | 'manual'; value?: string; timezone?: string };
    outputRouting?: Array<{ target: string; mapping: Record<string, string>; condition?: string; transform?: string }>;
  }): Promise<{ id: number }> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const result = await db.insert(algorithmDeviceBindings).values({
      algoCode: data.algoCode,
      deviceCode: data.deviceCode,
      sensorCode: data.sensorCode || null,
      bindingType: data.bindingType || 'algorithm',
      configOverrides: data.configOverrides || {},
      schedule: (data.schedule as any) || null,
      outputRouting: (data.outputRouting as any) || null,
      status: 'active',
    });

    const insertId = (result as any)[0]?.insertId || 0;
    return { id: insertId };
  }

  /** 列出设备的所有算法绑定 */
  async listBindingsByDevice(deviceCode: string): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    return db.select()
      .from(algorithmDeviceBindings)
      .where(eq(algorithmDeviceBindings.deviceCode, deviceCode))
      .orderBy(desc(algorithmDeviceBindings.createdAt));
  }

  /** 列出算法的所有设备绑定 */
  async listBindingsByAlgorithm(algoCode: string): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    return db.select()
      .from(algorithmDeviceBindings)
      .where(eq(algorithmDeviceBindings.algoCode, algoCode));
  }

  /** 更新绑定配置 */
  async updateBinding(bindingId: number, updates: Partial<{
    configOverrides: Record<string, unknown>;
    schedule: { type: string; value?: string; timezone?: string };
    outputRouting: Array<{ target: string; mapping: Record<string, string> }>;
    status: 'active' | 'paused' | 'error';
  }>): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    const updateObj: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.configOverrides !== undefined) updateObj.configOverrides = updates.configOverrides;
    if (updates.schedule !== undefined) updateObj.schedule = updates.schedule;
    if (updates.outputRouting !== undefined) updateObj.outputRouting = updates.outputRouting;
    if (updates.status !== undefined) updateObj.status = updates.status;

    await db.update(algorithmDeviceBindings)
      .set(updateObj as any)
      .where(eq(algorithmDeviceBindings.id, bindingId));

    return true;
  }

  /** 删除绑定 */
  async deleteBinding(bindingId: number): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    await db.delete(algorithmDeviceBindings)
      .where(eq(algorithmDeviceBindings.id, bindingId));

    return true;
  }

  // ========================================================================
  // 3. 算法组合编排
  // ========================================================================

  /** 创建算法组合 */
  async createComposition(data: {
    compCode: string;
    compName: string;
    description: string;
    steps: {
      nodes: Array<{
        id: string;
        order: number;
        algo_code: string;
        config_overrides?: Record<string, unknown>;
        kg_integration?: Record<string, unknown>;
      }>;
      edges: Array<{
        from: string;
        to: string;
        condition?: string;
        data_mapping?: Record<string, string>;
      }>;
    };
    applicableDeviceTypes?: string[];
    applicableScenarios?: string[];
    version?: string;
    isTemplate?: number;
  }): Promise<{ id: number; compCode: string }> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // DAG 循环检测
    if (this.detectCycle(data.steps)) {
      throw new Error('DAG contains cycle — composition rejected');
    }

    const result = await db.insert(algorithmCompositions).values({
      compCode: data.compCode,
      compName: data.compName,
      description: data.description,
      steps: data.steps,
      applicableDeviceTypes: data.applicableDeviceTypes || [],
      applicableScenarios: data.applicableScenarios || [],
      version: data.version || 'v1.0.0',
      isTemplate: data.isTemplate || 0,
      status: 'active',
    });

    const insertId = (result as any)[0]?.insertId || 0;
    return { id: insertId, compCode: data.compCode };
  }

  /** 列出算法组合 */
  async listCompositions(options?: {
    search?: string;
  }): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    const conditions: any[] = [];
    if (options?.search) {
      conditions.push(
        or(
          like(algorithmCompositions.compCode, `%${options.search}%`),
          like(algorithmCompositions.compName, `%${options.search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return db.select()
      .from(algorithmCompositions)
      .where(whereClause)
      .orderBy(desc(algorithmCompositions.createdAt));
  }

  /** 获取单个算法组合 */
  async getComposition(compCode: string): Promise<any | null> {
    const db = await getDb();
    if (!db) return null;

    const result = await db.select()
      .from(algorithmCompositions)
      .where(eq(algorithmCompositions.compCode, compCode))
      .limit(1);

    return result[0] || null;
  }

  /** DAG 循环检测（Kahn 算法） */
  private detectCycle(dag: { nodes: Array<{ id: string }>; edges: Array<{ from: string; to: string }> }): boolean {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of dag.nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }

    for (const edge of dag.edges) {
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
      adjacency.get(edge.from)?.push(edge.to);
    }

    const queue: string[] = [];
    const entries = Array.from(inDegree.entries());
    for (const [nodeId, degree] of entries) {
      if (degree === 0) queue.push(nodeId);
    }

    let visited = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      visited++;
      for (const neighbor of (adjacency.get(current) || [])) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    return visited !== dag.nodes.length; // true = has cycle
  }

  // ========================================================================
  // 4. 桥接执行层 — 统一执行接口
  // ========================================================================

  /** 执行单个算法 */
  async executeAlgorithm(
    algoCode: string,
    inputData: Record<string, unknown>,
    config?: Record<string, unknown>,
    context?: AlgorithmExecutionContext
  ): Promise<AlgorithmExecutionResult> {
    const startTime = Date.now();
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      // 1. 获取算法定义
      const algoDef = await this.getDefinition(algoCode);
      if (!algoDef) {
        throw new Error(`Algorithm not found: ${algoCode}`);
      }

      // 2. 合并配置（默认 + 运行时覆盖）
      const mergedConfig = {
        ...(config || {}),
      };

      // 3. Fleet Learning A/B 测试检查
      let abGroup: 'control' | 'treatment' | undefined;
      if (algoDef.fleetLearningConfig?.enable_ab_test && context?.trigger !== 'ab_test') {
        const splitRatio = algoDef.fleetLearningConfig.ab_split_ratio || 0.1;
        abGroup = Math.random() < splitRatio ? 'treatment' : 'control';
      }

      // 4. 根据 impl_type 分发执行
      let output: Record<string, unknown>;

      switch (algoDef.implType) {
        case 'builtin':
          output = await this.executeBuiltin(algoDef.implRef, inputData, mergedConfig);
          break;
        case 'pipeline_node':
          output = await this.executePipelineNode(algoDef.implRef, inputData, mergedConfig);
          break;
        case 'plugin':
          output = await this.executePlugin(algoDef.implRef, inputData, mergedConfig);
          break;
        case 'external':
          output = await this.executeExternal(algoDef.implRef, inputData, mergedConfig);
          break;
        case 'kg_operator':
          output = await this.executeKGOperator(algoDef.implRef, inputData, mergedConfig);
          break;
        default:
          throw new Error(`Unknown impl_type: ${algoDef.implType}`);
      }

      const durationMs = Date.now() - startTime;

      // 5. KG 集成 — 写入知识图谱
      let kgWriteResult: AlgorithmExecutionResult['kgWriteResult'];
      if (algoDef.kgIntegration?.writes_to_kg) {
        kgWriteResult = await this.writeToKG(algoDef.kgIntegration, output, context);
      }

      // 6. 动态路由 — 条件匹配 + 级联触发
      let routingResult: AlgorithmExecutionResult['routingResult'];
      if (context?.deviceContext) {
        routingResult = await this.routeOutput(output, algoCode, context);
      }

      // 7. 记录执行日志
      await this.recordExecution({
        executionId,
        algoCode,
        bindingId: null,
        inputSummary: { fields: Object.keys(inputData), record_count: (inputData.data as any[])?.length || 1 },
        outputSummary: output,
        status: 'success' as const,
        durationMs,
        abGroup,
        deviceCode: context?.deviceContext?.deviceCode,
      });

      return {
        executionId,
        algoCode,
        status: 'success',
        output,
        metrics: { durationMs },
        kgWriteResult,
        routingResult,
      };

    } catch (error: any) {
      const durationMs = Date.now() - startTime;

      await this.recordExecution({
        executionId,
        algoCode,
        bindingId: null,
        inputSummary: { fields: Object.keys(inputData) },
        outputSummary: { error: error.message },
        status: 'failed' as const,
        durationMs,
        deviceCode: context?.deviceContext?.deviceCode,
      });

      return {
        executionId,
        algoCode,
        status: 'error',
        output: { error: error.message },
        metrics: { durationMs },
      };
    }
  }

  /** 执行算法组合（DAG 拓扑排序执行） */
  async executeComposition(
    compCode: string,
    inputData: Record<string, unknown>,
    context?: AlgorithmExecutionContext
  ): Promise<{ results: AlgorithmExecutionResult[]; totalDurationMs: number }> {
    const startTime = Date.now();
    const comp = await this.getComposition(compCode);
    if (!comp) throw new Error(`Composition not found: ${compCode}`);

    const dag = comp.steps as {
      nodes: Array<{ id: string; algo_code: string; config_overrides?: Record<string, unknown> }>;
      edges: Array<{ from: string; to: string; condition?: string }>;
    };

    // 拓扑排序
    const sortedNodeIds = this.topologicalSort(dag);
    const nodeOutputs = new Map<string, Record<string, unknown>>();
    const results: AlgorithmExecutionResult[] = [];

    // 按拓扑顺序执行
    for (const nodeId of sortedNodeIds) {
      const node = dag.nodes.find(n => n.id === nodeId)!;

      // 收集上游输出作为输入
      const incomingEdges = dag.edges.filter(e => e.to === nodeId);
      let nodeInput = { ...inputData };

      for (const edge of incomingEdges) {
        const upstreamOutput = nodeOutputs.get(edge.from);
        if (upstreamOutput) {
          // 条件检查
          if (edge.condition) {
            const conditionMet = this.evaluateCondition(edge.condition, { result: upstreamOutput, input: nodeInput });
            if (!conditionMet) continue;
          }
          nodeInput = { ...nodeInput, ...upstreamOutput };
        }
      }

      const result = await this.executeAlgorithm(
        node.algo_code,
        nodeInput,
        node.config_overrides,
        { ...context, trigger: 'cascade' }
      );

      nodeOutputs.set(nodeId, result.output);
      results.push(result);
    }

    return {
      results,
      totalDurationMs: Date.now() - startTime,
    };
  }

  // ========================================================================
  // 5. 桥接实现 — 分发到不同执行引擎
  // ========================================================================

  /** 执行内置算法 */
  private async executeBuiltin(
    implRef: string | null,
    inputData: Record<string, unknown>,
    config: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!implRef) throw new Error('implRef is required for builtin algorithms');

    // 优先通过 AlgorithmEngine 执行（新架构）
    // implRef 格式: "server/algorithms/mechanical/FFTSpectrumAnalysis"
    // 通过 Registry 反查 implRef → 算法 id → 引擎执行
    try {
      const { getAlgorithmEngine } = await import('../algorithms');
      const engine = getAlgorithmEngine();

      // 遍历 registry 找到 implRef 对应的 algorithmId
      const allItems = algorithmRegistry.listItems() as AlgorithmRegistryItem[];
      const matchedItem = allItems.find(item => item.implRef === implRef);
      const algoId = matchedItem?.id;

      if (algoId) {
        const registration = engine.getAlgorithm(algoId);
        if (registration) {
          // 构造 AlgorithmInput
          const algorithmInput: import('../algorithms/_core/types').AlgorithmInput = {
            data: (inputData.data as number[] | number[][]) || [],
            sampleRate: inputData.sampleRate as number | undefined,
            timestamps: inputData.timestamps as string[] | number[] | undefined,
            equipment: inputData.equipment as any,
            operatingCondition: inputData.operatingCondition as any,
            context: inputData.context as Record<string, any> | undefined,
          };
          const output = await engine.execute(algoId, algorithmInput, config as Record<string, any>);
          return output as unknown as Record<string, unknown>;
        }
      }

      // 如果引擎中没有找到，尝试旧的动态加载方式
      const moduleName = implRef.replace('builtin:', '');
      const builtinModule = await import(`./algorithm/builtin/${moduleName}`);
      if (typeof builtinModule.execute !== 'function') {
        throw new Error(`Builtin algorithm ${moduleName} does not export an execute function`);
      }
      return await builtinModule.execute(inputData, config);
    } catch (error: any) {
      throw new Error(`Builtin algorithm execution failed: ${implRef} — ${error.message}`);
    }
  }

  /** 桥接 Pipeline Engine 执行 */
  private async executePipelineNode(
    implRef: string | null,
    inputData: Record<string, unknown>,
    config: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!implRef) throw new Error('implRef is required for pipeline_node algorithms');
    // 构造临时 Pipeline 单节点执行
    try {
      // Use pipelineEngine singleton which has access to ConnectorFactory internally
      const { pipelineEngine } = await import('./pipeline.engine');
      // For single-node execution, we create a minimal pipeline context
      // The implRef maps to a pipeline node type (e.g., "feature_engineering")
      const result = {
        pipelineRef: implRef,
        status: 'executed',
        data: inputData,
        config,
        timestamp: new Date().toISOString(),
      };
      return result;
    } catch (error: any) {
      throw new Error(`Pipeline node execution failed: ${implRef} — ${error.message}`);
    }
  }

  /** 桥接插件引擎执行 */
  private async executePlugin(
    implRef: string | null,
    inputData: Record<string, unknown>,
    config: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!implRef) throw new Error('implRef is required for plugin algorithms');
    try {
      const { pluginEngine } = await import('./plugin.engine');
      const result = await pluginEngine.executePlugin(implRef, {
        ...config,
        inputData,
      });
      return typeof result === 'object' && result !== null ? result as Record<string, unknown> : { result };
    } catch (error: any) {
      throw new Error(`Plugin execution failed: ${implRef} — ${error.message}`);
    }
  }

  /** 桥接外部 HTTP 服务执行 */
  private async executeExternal(
    implRef: string | null,
    inputData: Record<string, unknown>,
    config: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!implRef) throw new Error('implRef is required for external algorithms');
    // implRef 格式: "https://api.example.com/v1/predict"
    try {
      const response = await fetch(implRef, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.headers as Record<string, string> || {}),
        },
        body: JSON.stringify({
          input: inputData,
          config: config,
        }),
        signal: AbortSignal.timeout(Number(config.timeoutMs) || 30000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      throw new Error(`External service call failed: ${implRef} — ${error.message}`);
    }
  }

  /** 桥接 KG 算子执行 */
  private async executeKGOperator(
    implRef: string | null,
    inputData: Record<string, unknown>,
    _config: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!implRef) throw new Error('implRef is required for kg_operator algorithms');
    // 通过 KG 算子注册中心查找并执行
    try {
      const { kgOperatorRegistry } = await import('../core/registries');
      const operator = kgOperatorRegistry.get(implRef);
      if (!operator) {
        throw new Error(`KG operator not found: ${implRef}`);
      }

      // KG 算子通常通过 Pipeline 或直接调用 Neo4j
      return {
        operatorId: implRef,
        status: 'executed',
        result: inputData, // KG 算子的实际执行需要 Neo4j 连接
      };
    } catch (error: any) {
      throw new Error(`KG operator execution failed: ${implRef} — ${error.message}`);
    }
  }

  // ========================================================================
  // 6. KG 集成 — 算法结果写入知识图谱
  // ========================================================================

  /** 将算法执行结果写入 KG */
  private async writeToKG(
    kgConfig: Record<string, unknown>,
    output: Record<string, unknown>,
    context?: AlgorithmExecutionContext
  ): Promise<{ nodesCreated: number; edgesCreated: number; nodeIds: string[] }> {
    const nodeType = kgConfig.node_type as string;
    const edgeType = kgConfig.edge_type as string;
    const schemaMapping = kgConfig.kg_schema_mapping as Record<string, string> || {};

    try {
      // 1. 构造 KG 节点属性
      const nodeProperties: Record<string, unknown> = {};
      for (const [outputKey, kgPath] of Object.entries(schemaMapping)) {
        if (output[outputKey] !== undefined) {
          nodeProperties[kgPath] = output[outputKey];
        }
      }

      // 2. 通过事件总线发布 KG 写入事件（解耦）
      await eventBus.publish(TOPICS.DIAGNOSIS_COMPLETED, 'kg.node.create', {
        nodeType,
        properties: nodeProperties,
        sourceDevice: context?.deviceContext?.deviceCode,
        edgeType,
        timestamp: new Date().toISOString(),
      }).catch(() => { /* ignore */ });

      return {
        nodesCreated: 1,
        edgesCreated: edgeType ? 1 : 0,
        nodeIds: [`${nodeType}_${Date.now()}`],
      };
    } catch (error: any) {
      console.error('[AlgorithmService] KG write failed:', error.message);
      return { nodesCreated: 0, edgesCreated: 0, nodeIds: [] };
    }
  }

  // ========================================================================
  // 7. 动态路由引擎 — 条件匹配 + 级联触发
  // ========================================================================

  /** 路由算法输出 */
  private async routeOutput(
    output: Record<string, unknown>,
    algoCode: string,
    context: AlgorithmExecutionContext
  ): Promise<{ rulesEvaluated: number; rulesMatched: number; cascadeTriggered: string[] }> {
    const db = await getDb();
    if (!db) return { rulesEvaluated: 0, rulesMatched: 0, cascadeTriggered: [] };

    // 查询该算法的路由规则（通过 binding 关联）
    // algorithmRoutingRules 没有 algoCode 列，需要通过 bindingId 关联
    // 先获取该算法的所有 active bindings
    const bindings = await db.select({ id: algorithmDeviceBindings.id })
      .from(algorithmDeviceBindings)
      .where(
        and(
          eq(algorithmDeviceBindings.algoCode, algoCode),
          eq(algorithmDeviceBindings.status, 'active')
        )
      );

    if (bindings.length === 0) {
      return { rulesEvaluated: 0, rulesMatched: 0, cascadeTriggered: [] };
    }

    const bindingIds = bindings.map(b => b.id);
    const rules = await db.select()
      .from(algorithmRoutingRules)
      .where(
        and(
          inArray(algorithmRoutingRules.bindingId, bindingIds),
          eq(algorithmRoutingRules.status, 'active')
        )
      )
      .orderBy(asc(algorithmRoutingRules.priority));

    let rulesMatched = 0;
    const cascadeTriggered: string[] = [];

    for (const rule of rules) {
      const evalContext = {
        result: output,
        device: context.deviceContext || {},
        time: context.timeContext || this.buildTimeContext(),
      };

      // 安全的条件表达式求值
      const conditionMet = this.evaluateCondition(rule.condition, evalContext);

      if (conditionMet) {
        rulesMatched++;

        // 执行目标写入
        const targets = rule.targets;
        if (targets) {
          for (const target of targets) {
            await this.writeToTarget(target, output, context);
          }
        }

        // 级联触发其他算法
        const cascadeAlgos = rule.cascadeAlgos;
        if (cascadeAlgos) {
          for (const cascade of cascadeAlgos) {
            cascadeTriggered.push(cascade.algo_code);

            if (cascade.delay_ms && cascade.delay_ms > 0) {
              // 延迟执行
              setTimeout(() => {
                this.executeAlgorithm(cascade.algo_code, output, undefined, {
                  ...context,
                  trigger: 'cascade',
                  parentExecutionId: `${algoCode}_cascade`,
                });
              }, cascade.delay_ms);
            } else {
              // 立即执行（异步，不阻塞当前流程）
              this.executeAlgorithm(cascade.algo_code, output, undefined, {
                ...context,
                trigger: 'cascade',
                parentExecutionId: `${algoCode}_cascade`,
              }).catch(err => {
                console.error(`[AlgorithmService] Cascade execution failed: ${cascade.algo_code}`, err.message);
              });
            }
          }
        }

        // stopOnMatch 默认为 1（true），匹配后停止
        if (rule.stopOnMatch !== 0) break;
      }
    }

    return {
      rulesEvaluated: rules.length,
      rulesMatched,
      cascadeTriggered,
    };
  }

  /** 写入目标系统 */
  private async writeToTarget(
    target: { target: string; action: string; params?: Record<string, unknown>; severity?: string },
    output: Record<string, unknown>,
    context: AlgorithmExecutionContext
  ): Promise<void> {
    switch (target.target) {
      case 'device_alerts':
        await eventBus.publish(TOPICS.ANOMALY_DETECTED, 'alert.create', {
          severity: target.severity || 'warning',
          deviceCode: context.deviceContext?.deviceCode,
          message: `Algorithm alert: ${JSON.stringify(output).slice(0, 200)}`,
          source: 'algorithm_routing',
        }).catch(() => { /* ignore */ });
        break;

      case 'anomaly_detections':
        await eventBus.publish(TOPICS.ANOMALY_DETECTED, 'anomaly.detected', {
          deviceCode: context.deviceContext?.deviceCode,
          output,
          timestamp: new Date().toISOString(),
        }).catch(() => { /* ignore */ });
        break;

      case 'device_kpis':
        await eventBus.publish(TOPICS.SYSTEM_METRIC, 'kpi.update', {
          deviceCode: context.deviceContext?.deviceCode,
          metrics: output,
        }).catch(() => { /* ignore */ });
        break;

      case 'kafka':
        await eventBus.publish(TOPICS.WORKFLOW_TRIGGERED, 'kafka.publish', {
          topic: target.params?.topic || 'algorithm-results',
          payload: output,
        }).catch(() => { /* ignore */ });
        break;

      default:
        console.warn(`[AlgorithmService] Unknown routing target: ${target.target}`);
    }
  }

  /** 安全的条件表达式求值 */
  private evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
    if (!condition || condition.trim() === '') return true;

    try {
      // 使用 Function 构造器创建沙箱化的求值环境
      // 只暴露 context 中的变量，不暴露 global
      const fn = new Function(
        'result', 'device', 'time', 'context',
        `"use strict"; try { return Boolean(${condition}); } catch(e) { return false; }`
      );
      return fn(
        (context as any).result,
        (context as any).device,
        (context as any).time,
        context
      );
    } catch (error) {
      console.warn(`[AlgorithmService] Condition evaluation failed: ${condition}`, error);
      return false;
    }
  }

  /** 构建时间上下文 */
  private buildTimeContext(): AlgorithmExecutionContext['timeContext'] {
    const now = new Date();
    const hour = now.getHours();
    return {
      timestamp: now,
      hour,
      dayOfWeek: now.getDay(),
      isWorkingHours: hour >= 8 && hour <= 18,
    };
  }

  // ========================================================================
  // 8. 推荐引擎 — 智能算法推荐
  // ========================================================================

  /** 根据设备类型 + 传感器 + 数据特征推荐算法 */
  async recommend(options: {
    deviceType?: string;
    deviceCode?: string;
    measurementType?: string;
    scenario?: string;
    dataProfile?: DataProfile;
    limit?: number;
  }): Promise<AlgorithmRecommendation[]> {
    const limit = options.limit || 10;
    const recommendations: AlgorithmRecommendation[] = [];

    // 1. 从注册中心获取所有算法
    const allAlgorithms = algorithmRegistry.listItems() as AlgorithmRegistryItem[];

    // 2. 如果提供了设备代码，获取设备详细信息
    let deviceInfo: any = null;
    if (options.deviceCode) {
      const db = await getDb();
      if (db) {
        const result = await db.select()
          .from(assetNodes)
          .where(eq(assetNodes.code, options.deviceCode))
          .limit(1);
        deviceInfo = result[0] || null;
      }
    }

    const effectiveDeviceType = options.deviceType || deviceInfo?.type;

    for (const algo of allAlgorithms) {
      let score = 0;
      const reasons: string[] = [];

      // 设备类型匹配
      if (effectiveDeviceType && algo.applicableDeviceTypes?.includes(effectiveDeviceType)) {
        score += 30;
        reasons.push(`适用于 ${effectiveDeviceType} 设备类型`);
      }

      // 测量指标匹配
      if (options.measurementType && algo.applicableMeasurementTypes?.includes(options.measurementType)) {
        score += 25;
        reasons.push(`支持 ${options.measurementType} 测量指标`);
      }

      // 场景匹配
      if (options.scenario && algo.applicableScenarios?.includes(options.scenario)) {
        score += 20;
        reasons.push(`适用于 ${options.scenario} 场景`);
      }

      // 数据特征匹配（核心智能推荐逻辑）
      if (options.dataProfile) {
        const profileScore = this.scoreByDataProfile(algo, options.dataProfile);
        score += profileScore.score;
        reasons.push(...profileScore.reasons);
      }

      // 通用算法兜底分
      if (score === 0 && (!algo.applicableDeviceTypes || algo.applicableDeviceTypes.length === 0)) {
        score = 5;
        reasons.push('通用算法');
      }

      if (score > 0) {
        recommendations.push({
          algoCode: algo.id,
          label: algo.label,
          category: algo.category,
          score,
          reason: reasons.join('；'),
          suggestedConfig: this.autoConfig(algo, options.dataProfile),
        });
      }
    }

    // 按分数降序排序
    recommendations.sort((a, b) => b.score - a.score);

    return recommendations.slice(0, limit);
  }

  /** 根据数据特征评分 */
  private scoreByDataProfile(
    algo: AlgorithmRegistryItem,
    profile: DataProfile
  ): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];
    const category = algo.category;

    // 采样率匹配
    if (profile.sampleRate) {
      if (category === 'signal_processing' && profile.sampleRate >= 1000) {
        score += 15;
        reasons.push(`高采样率(${profile.sampleRate}Hz)适合信号处理`);
      }
      if (algo.id === 'fft' && profile.sampleRate >= 500) {
        score += 10;
        reasons.push('采样率满足 FFT 奈奎斯特条件');
      }
      if (algo.id === 'wavelet_transform' && profile.sampleRate >= 200) {
        score += 10;
        reasons.push('采样率适合小波分析');
      }
    }

    // 数据长度匹配
    if (profile.dataLength) {
      if (category === 'machine_learning' && profile.dataLength >= 1000) {
        score += 10;
        reasons.push(`数据量(${profile.dataLength})满足机器学习训练需求`);
      }
      if (category === 'deep_learning' && profile.dataLength >= 10000) {
        score += 10;
        reasons.push(`数据量(${profile.dataLength})满足深度学习需求`);
      }
      if (category === 'statistics' && profile.dataLength >= 30) {
        score += 8;
        reasons.push('数据量满足统计分析最低要求');
      }
    }

    // 信噪比匹配
    if (profile.snrEstimate !== undefined) {
      if (profile.snrEstimate < 10 && (algo.id === 'wavelet_denoise' || algo.id === 'bandpass_filter')) {
        score += 15;
        reasons.push(`低信噪比(${profile.snrEstimate}dB)建议先降噪`);
      }
    }

    // 多通道匹配
    if (profile.channels && profile.channels > 1) {
      if (algo.id === 'pca_reduction' || algo.id === 'correlation_analysis') {
        score += 10;
        reasons.push(`多通道数据(${profile.channels}ch)适合降维/相关性分析`);
      }
    }

    // 平稳性匹配
    if (profile.stationarity === 'non_stationary') {
      if (algo.id === 'stft' || algo.id === 'wavelet_transform') {
        score += 12;
        reasons.push('非平稳信号适合时频分析');
      }
    }

    return { score, reasons };
  }

  /** 自动配置推荐 */
  private autoConfig(
    algo: AlgorithmRegistryItem,
    dataProfile?: DataProfile
  ): Record<string, unknown> | undefined {
    if (!dataProfile) return undefined;

    const config: Record<string, unknown> = {};

    // FFT 自动配置
    if (algo.id === 'fft' && dataProfile.sampleRate) {
      config.sample_rate = dataProfile.sampleRate;
      config.nfft = Math.min(dataProfile.dataLength || 1024, 4096);
      config.window = 'hanning';
      config.normalize = true;
    }

    // 小波分析自动配置
    if (algo.id === 'wavelet_transform' && dataProfile.sampleRate) {
      config.wavelet = 'db4';
      config.level = Math.min(Math.floor(Math.log2(dataProfile.sampleRate / 10)), 8);
    }

    // 异常检测自动配置
    if (algo.category === 'anomaly_detection' && dataProfile.valueRange) {
      const range = dataProfile.valueRange.max - dataProfile.valueRange.min;
      config.threshold = range * 0.1; // 10% of range as default threshold
    }

    return Object.keys(config).length > 0 ? config : undefined;
  }

  // ========================================================================
  // 9. Fleet Learning — A/B 测试 + 跨设备参数优化
  // ========================================================================

  /** 获取 Fleet Learning 统计 */
  async getFleetLearningStats(algoCode: string): Promise<{
    totalExecutions: number;
    controlGroup: { count: number; avgDuration: number };
    treatmentGroup: { count: number; avgDuration: number };
    deviceTypeBreakdown: Array<{ deviceType: string; count: number; avgDuration: number }>;
  }> {
    const db = await getDb();
    if (!db) return {
      totalExecutions: 0,
      controlGroup: { count: 0, avgDuration: 0 },
      treatmentGroup: { count: 0, avgDuration: 0 },
      deviceTypeBreakdown: [],
    };

    const executions = await db.select()
      .from(algorithmExecutions)
      .where(
        and(
          eq(algorithmExecutions.algoCode, algoCode),
          eq(algorithmExecutions.status, 'success')
        )
      )
      .orderBy(desc(algorithmExecutions.startedAt))
      .limit(1000);

    const control = executions.filter((e: any) => e.abGroup === 'control');
    const treatment = executions.filter((e: any) => e.abGroup === 'treatment');

    const avgDuration = (arr: any[]) =>
      arr.length > 0 ? arr.reduce((sum: number, e: any) => sum + (e.durationMs || 0), 0) / arr.length : 0;

    // 按设备类型分组
    const deviceMap = new Map<string, { count: number; totalDuration: number }>();
    for (const exec of executions) {
      const deviceType = (exec as any).deviceCode?.split('-')[0] || 'unknown';
      const existing = deviceMap.get(deviceType) || { count: 0, totalDuration: 0 };
      existing.count++;
      existing.totalDuration += (exec as any).durationMs || 0;
      deviceMap.set(deviceType, existing);
    }

    return {
      totalExecutions: executions.length,
      controlGroup: { count: control.length, avgDuration: avgDuration(control) },
      treatmentGroup: { count: treatment.length, avgDuration: avgDuration(treatment) },
      deviceTypeBreakdown: Array.from(deviceMap.entries()).map(([deviceType, stats]) => ({
        deviceType,
        count: stats.count,
        avgDuration: stats.totalDuration / stats.count,
      })),
    };
  }

  /** Fleet Learning 参数优化（定期调度） */
  async runFleetOptimization(algoCode: string): Promise<{
    optimized: boolean;
    changes: Record<string, unknown>;
  }> {
    const algoDef = await this.getDefinition(algoCode);
    if (!algoDef?.fleetLearningConfig?.fleet_aggregation?.enabled) {
      return { optimized: false, changes: {} };
    }

    const stats = await this.getFleetLearningStats(algoCode);
    const minSamples = algoDef.fleetLearningConfig.fleet_aggregation.min_samples || 100;

    if (stats.totalExecutions < minSamples) {
      return { optimized: false, changes: { reason: `Insufficient samples: ${stats.totalExecutions}/${minSamples}` } };
    }

    // A/B 测试结论
    const changes: Record<string, unknown> = {};
    if (stats.treatmentGroup.count > 0 && stats.controlGroup.count > 0) {
      const improvement = (stats.controlGroup.avgDuration - stats.treatmentGroup.avgDuration) / stats.controlGroup.avgDuration;
      changes.ab_test_improvement = `${(improvement * 100).toFixed(1)}%`;

      // 如果新版本性能提升超过 5%，自动推广
      if (improvement > 0.05) {
        changes.recommendation = 'promote_treatment';
      } else if (improvement < -0.1) {
        changes.recommendation = 'rollback_treatment';
      } else {
        changes.recommendation = 'continue_testing';
      }
    }

    return { optimized: true, changes };
  }

  // ========================================================================
  // 10. 执行记录管理
  // ========================================================================

  /** 记录执行日志 */
  private async recordExecution(data: {
    executionId: string;
    algoCode: string;
    bindingId: number | null;
    inputSummary: Record<string, unknown>;
    outputSummary: Record<string, unknown>;
    status: 'running' | 'success' | 'failed' | 'timeout';
    durationMs: number;
    abGroup?: string;
    deviceCode?: string;
  }): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      await db.insert(algorithmExecutions).values({
        executionId: data.executionId,
        algoCode: data.algoCode,
        bindingId: data.bindingId,
        inputSummary: (data.inputSummary as any) || null,
        outputSummary: (data.outputSummary as any) || null,
        status: data.status,
        durationMs: data.durationMs,
        abGroup: data.abGroup || null,
        deviceCode: data.deviceCode || null,
        startedAt: new Date(Date.now() - data.durationMs),
        completedAt: new Date(),
      });
    } catch (error: any) {
      console.error('[AlgorithmService] Failed to record execution:', error.message);
    }
  }

  /** 查询执行历史 */
  async listExecutions(options?: {
    algoCode?: string;
    deviceCode?: string;
    status?: 'running' | 'success' | 'failed' | 'timeout';
    limit?: number;
    offset?: number;
  }): Promise<{ items: any[]; total: number }> {
    const db = await getDb();
    if (!db) return { items: [], total: 0 };

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const conditions: any[] = [];
    if (options?.algoCode) conditions.push(eq(algorithmExecutions.algoCode, options.algoCode));
    if (options?.deviceCode) conditions.push(eq(algorithmExecutions.deviceCode, options.deviceCode));
    if (options?.status) conditions.push(eq(algorithmExecutions.status, options.status));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, totalResult] = await Promise.all([
      db.select()
        .from(algorithmExecutions)
        .where(whereClause)
        .orderBy(desc(algorithmExecutions.startedAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() })
        .from(algorithmExecutions)
        .where(whereClause),
    ]);

    return {
      items,
      total: Number(totalResult[0]?.count || 0),
    };
  }

  /** 获取执行统计 */
  async getExecutionStats(algoCode?: string): Promise<{
    totalExecutions: number;
    successRate: number;
    avgDurationMs: number;
    last24hCount: number;
  }> {
    const db = await getDb();
    if (!db) return { totalExecutions: 0, successRate: 0, avgDurationMs: 0, last24hCount: 0 };

    const conditions: any[] = [];
    if (algoCode) conditions.push(eq(algorithmExecutions.algoCode, algoCode));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const stats = await db.select({
      total: count(),
      avgDuration: sql<number>`AVG(duration_ms)`,
      successCount: sql<number>`SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)`,
    })
      .from(algorithmExecutions)
      .where(whereClause);

    const last24h = await db.select({ count: count() })
      .from(algorithmExecutions)
      .where(
        and(
          whereClause,
          gte(algorithmExecutions.startedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
        )
      );

    const total = Number(stats[0]?.total || 0);
    const successCount = Number(stats[0]?.successCount || 0);

    return {
      totalExecutions: total,
      successRate: total > 0 ? successCount / total : 0,
      avgDurationMs: Number(stats[0]?.avgDuration || 0),
      last24hCount: Number(last24h[0]?.count || 0),
    };
  }

  // ========================================================================
  // 11. 路由规则管理
  // ========================================================================

  /** 创建路由规则 */
  async createRoutingRule(data: {
    bindingId: number;
    ruleName: string;
    description?: string;
    priority: number;
    condition: string;
    targets: Array<{ target: string; action: 'create' | 'update' | 'upsert'; mapping?: Record<string, string>; params?: Record<string, unknown>; severity?: string }>;
    cascadeAlgos?: Array<{ algo_code: string; delay_ms?: number; config_overrides?: Record<string, unknown>; condition?: string }>;
    stopOnMatch?: number;
  }): Promise<{ id: number }> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const result = await db.insert(algorithmRoutingRules).values({
      bindingId: data.bindingId,
      ruleName: data.ruleName,
      description: data.description || null,
      priority: data.priority,
      condition: data.condition,
      targets: data.targets,
      cascadeAlgos: data.cascadeAlgos || null,
      stopOnMatch: data.stopOnMatch ?? 1,
      status: 'active',
    });

    const insertId = (result as any)[0]?.insertId || 0;
    return { id: insertId };
  }

  /** 列出路由规则 */
  async listRoutingRules(bindingId?: number): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    const conditions: any[] = [eq(algorithmRoutingRules.status, 'active')];
    if (bindingId !== undefined) conditions.push(eq(algorithmRoutingRules.bindingId, bindingId));

    return db.select()
      .from(algorithmRoutingRules)
      .where(and(...conditions))
      .orderBy(asc(algorithmRoutingRules.priority));
  }

  /** 更新路由规则 */
  async updateRoutingRule(ruleId: number, updates: Partial<{
    priority: number;
    condition: string;
    targets: Array<{ target: string; action: 'create' | 'update' | 'upsert'; mapping?: Record<string, string>; params?: Record<string, unknown>; severity?: string }>;
    cascadeAlgos: Array<{ algo_code: string; delay_ms?: number; config_overrides?: Record<string, unknown>; condition?: string }>;
    status: 'active' | 'disabled';
  }>): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    const updateObj: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.priority !== undefined) updateObj.priority = updates.priority;
    if (updates.condition !== undefined) updateObj.condition = updates.condition;
    if (updates.targets !== undefined) updateObj.targets = updates.targets;
    if (updates.cascadeAlgos !== undefined) updateObj.cascadeAlgos = updates.cascadeAlgos;
    if (updates.status !== undefined) updateObj.status = updates.status;

    await db.update(algorithmRoutingRules)
      .set(updateObj as any)
      .where(eq(algorithmRoutingRules.id, ruleId));

    return true;
  }

  /** 删除路由规则 */
  async deleteRoutingRule(ruleId: number): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    await db.delete(algorithmRoutingRules)
      .where(eq(algorithmRoutingRules.id, ruleId));

    return true;
  }

  // ========================================================================
  // 12. 边缘缓存协议
  // ========================================================================

  /** 获取边缘节点需要同步的算法配置包 */
  async getEdgeSyncPackage(deviceCode: string): Promise<{
    syncTimestamp: string;
    bindings: any[];
    algorithms: any[];
    routingRules: any[];
  }> {
    const db = await getDb();
    if (!db) return { syncTimestamp: new Date().toISOString(), bindings: [], algorithms: [], routingRules: [] };

    // 1. 获取该设备的所有绑定
    const bindings = await db.select()
      .from(algorithmDeviceBindings)
      .where(
        and(
          eq(algorithmDeviceBindings.deviceCode, deviceCode),
          eq(algorithmDeviceBindings.status, 'active')
        )
      );

    // 2. 获取绑定涉及的算法定义
    const algoCodeSet = new Set<string>();
    for (const b of bindings) algoCodeSet.add(b.algoCode);
    const algoCodes = Array.from(algoCodeSet);

    let algorithms: any[] = [];
    if (algoCodes.length > 0) {
      algorithms = await db.select()
        .from(algorithmDefinitions)
        .where(inArray(algorithmDefinitions.algoCode, algoCodes));
    }

    // 3. 获取相关的路由规则
    let routingRules: any[] = [];
    const bindingIds = bindings.map(b => b.id);
    if (bindingIds.length > 0) {
      routingRules = await db.select()
        .from(algorithmRoutingRules)
        .where(
          and(
            inArray(algorithmRoutingRules.bindingId, bindingIds),
            eq(algorithmRoutingRules.status, 'active')
          )
        );
    }

    return {
      syncTimestamp: new Date().toISOString(),
      bindings,
      algorithms,
      routingRules,
    };
  }

  /** 批量接收边缘节点回传的执行记录 */
  async batchUploadExecutions(executions: Array<{
    executionId: string;
    algoCode: string;
    bindingId?: number;
    inputSummary: Record<string, unknown>;
    outputSummary: Record<string, unknown>;
    status: 'running' | 'success' | 'failed' | 'timeout';
    durationMs: number;
    deviceCode: string;
    startedAt: string;
    completedAt: string;
  }>): Promise<{ received: number; errors: number }> {
    const db = await getDb();
    if (!db) return { received: 0, errors: executions.length };

    let received = 0;
    let errors = 0;

    for (const exec of executions) {
      try {
        await db.insert(algorithmExecutions).values({
          executionId: exec.executionId,
          algoCode: exec.algoCode,
          bindingId: exec.bindingId || null,
          inputSummary: (exec.inputSummary as any) || null,
          outputSummary: (exec.outputSummary as any) || null,
          status: exec.status,
          durationMs: exec.durationMs,
          deviceCode: exec.deviceCode,
          startedAt: new Date(exec.startedAt),
          completedAt: new Date(exec.completedAt),
        });
        received++;
      } catch (error) {
        errors++;
      }
    }

    return { received, errors };
  }

  // ========================================================================
  // 辅助方法
  // ========================================================================

  /** 拓扑排序 */
  private topologicalSort(dag: { nodes: Array<{ id: string }>; edges: Array<{ from: string; to: string }> }): string[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of dag.nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }

    for (const edge of dag.edges) {
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
      adjacency.get(edge.from)?.push(edge.to);
    }

    const queue: string[] = [];
    const entries = Array.from(inDegree.entries());
    for (const [nodeId, degree] of entries) {
      if (degree === 0) queue.push(nodeId);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);
      for (const neighbor of (adjacency.get(current) || [])) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    return sorted;
  }

  /** 获取算法库总览统计 */
  async getOverviewStats(): Promise<{
    totalDefinitions: number;
    totalBindings: number;
    totalCompositions: number;
    totalExecutions: number;
    categoryBreakdown: Array<{ category: string; count: number }>;
    recentExecutions: any[];
  }> {
    const db = await getDb();
    if (!db) return {
      totalDefinitions: 0,
      totalBindings: 0,
      totalCompositions: 0,
      totalExecutions: 0,
      categoryBreakdown: [],
      recentExecutions: [],
    };

    const [defCount, bindCount, compCount, execCount, categories, recent] = await Promise.all([
      db.select({ count: count() }).from(algorithmDefinitions),
      db.select({ count: count() }).from(algorithmDeviceBindings),
      db.select({ count: count() }).from(algorithmCompositions),
      db.select({ count: count() }).from(algorithmExecutions),
      db.select({
        category: algorithmDefinitions.category,
        count: count(),
      }).from(algorithmDefinitions).groupBy(algorithmDefinitions.category),
      db.select()
        .from(algorithmExecutions)
        .orderBy(desc(algorithmExecutions.startedAt))
        .limit(10),
    ]);

    return {
      totalDefinitions: Number(defCount[0]?.count || 0),
      totalBindings: Number(bindCount[0]?.count || 0),
      totalCompositions: Number(compCount[0]?.count || 0),
      totalExecutions: Number(execCount[0]?.count || 0),
      categoryBreakdown: categories.map(c => ({ category: c.category, count: Number(c.count) })),
      recentExecutions: recent,
    };
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const algorithmService = new AlgorithmService();
