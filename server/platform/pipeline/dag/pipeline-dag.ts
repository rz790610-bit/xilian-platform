/**
 * ============================================================================
 * Pipeline DAG 引擎 (Directed Acyclic Graph Pipeline)
 * ============================================================================
 *
 * 将感知→诊断→护栏→进化编排为可配置的 DAG：
 *
 *   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
 *   │ 采集节点 │───→│ 融合节点 │───→│ 诊断节点 │───→│ 护栏节点 │
 *   └──────────┘    └──────────┘    └──────────┘    └──────────┘
 *        │                               │                │
 *        │                               ▼                ▼
 *        │                          ┌──────────┐    ┌──────────┐
 *        └─────────────────────────→│ 存储节点 │    │ 进化节点 │
 *                                   └──────────┘    └──────────┘
 *
 * 核心能力：
 *   1. DAG 定义：节点 + 边 + 条件分支
 *   2. 拓扑排序：自动计算执行顺序
 *   3. 并行执行：无依赖的节点并行运行
 *   4. 错误处理：重试 + 降级 + 跳过
 *   5. 监控：每个节点的耗时、状态、输出
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface PipelineNode {
  id: string;
  name: string;
  type: 'collect' | 'fuse' | 'diagnose' | 'guardrail' | 'store' | 'evolve' | 'notify' | 'custom';
  /** 执行函数 */
  execute: (input: Record<string, unknown>, context: PipelineContext) => Promise<Record<string, unknown>>;
  /** 配置 */
  config: Record<string, unknown>;
  /** 重试次数 */
  retryCount: number;
  /** 超时 (ms) */
  timeoutMs: number;
  /** 是否可跳过 */
  skippable: boolean;
  /** 条件执行 */
  condition?: (input: Record<string, unknown>) => boolean;
}

export interface PipelineEdge {
  from: string;
  to: string;
  /** 数据映射：from 的输出字段 → to 的输入字段 */
  dataMapping?: Record<string, string>;
  /** 条件：满足条件才传递 */
  condition?: (output: Record<string, unknown>) => boolean;
}

export interface PipelineDefinition {
  pipelineId: string;
  name: string;
  description: string;
  version: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  /** 全局配置 */
  globalConfig: Record<string, unknown>;
}

export interface PipelineContext {
  pipelineId: string;
  executionId: string;
  startTime: number;
  /** 所有节点的输出 */
  nodeOutputs: Map<string, Record<string, unknown>>;
  /** 全局变量 */
  globals: Record<string, unknown>;
  /** 日志 */
  logs: PipelineLog[];
}

export interface PipelineLog {
  timestamp: number;
  nodeId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface NodeExecutionResult {
  nodeId: string;
  status: 'success' | 'failed' | 'skipped' | 'timeout';
  output: Record<string, unknown>;
  durationMs: number;
  retries: number;
  error?: string;
}

export interface PipelineExecutionResult {
  pipelineId: string;
  executionId: string;
  status: 'completed' | 'partial' | 'failed';
  nodeResults: NodeExecutionResult[];
  totalDurationMs: number;
  startTime: number;
  endTime: number;
}

// ============================================================================
// Pipeline DAG 引擎
// ============================================================================

export class PipelineDAGEngine {
  private pipelines: Map<string, PipelineDefinition> = new Map();
  private executionHistory: PipelineExecutionResult[] = [];

  /**
   * 注册 Pipeline
   */
  register(pipeline: PipelineDefinition): void {
    // 验证 DAG（无环检测）
    if (this.hasCycle(pipeline)) {
      throw new Error(`Pipeline ${pipeline.pipelineId} contains a cycle`);
    }
    this.pipelines.set(pipeline.pipelineId, pipeline);
  }

  /**
   * 执行 Pipeline
   */
  async execute(pipelineId: string, initialInput: Record<string, unknown> = {}): Promise<PipelineExecutionResult> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) throw new Error(`Pipeline not found: ${pipelineId}`);

    const executionId = `exec_${pipelineId}_${Date.now()}`;
    const startTime = Date.now();

    const context: PipelineContext = {
      pipelineId,
      executionId,
      startTime,
      nodeOutputs: new Map(),
      globals: { ...pipeline.globalConfig, ...initialInput },
      logs: [],
    };

    // 拓扑排序
    const sortedNodeIds = this.topologicalSort(pipeline);
    const nodeResults: NodeExecutionResult[] = [];
    const nodeMap = new Map(pipeline.nodes.map(n => [n.id, n]));
    const edgeMap = this.buildEdgeMap(pipeline.edges);

    // 按层级并行执行
    const levels = this.computeLevels(sortedNodeIds, pipeline.edges);

    for (const level of levels) {
      const levelPromises = level.map(async (nodeId) => {
        const node = nodeMap.get(nodeId);
        if (!node) return;

        // 构建输入
        const input = this.buildNodeInput(nodeId, edgeMap, context, initialInput);

        // 条件检查
        if (node.condition && !node.condition(input)) {
          nodeResults.push({
            nodeId, status: 'skipped', output: {},
            durationMs: 0, retries: 0,
          });
          return;
        }

        // 执行（带重试）
        const result = await this.executeNode(node, input, context);
        nodeResults.push(result);

        if (result.status === 'success') {
          context.nodeOutputs.set(nodeId, result.output);
        }
      });

      await Promise.all(levelPromises);
    }

    const endTime = Date.now();
    const hasFailure = nodeResults.some(r => r.status === 'failed');
    const allSuccess = nodeResults.every(r => r.status === 'success' || r.status === 'skipped');

    const executionResult: PipelineExecutionResult = {
      pipelineId,
      executionId,
      status: allSuccess ? 'completed' : hasFailure ? 'failed' : 'partial',
      nodeResults,
      totalDurationMs: endTime - startTime,
      startTime,
      endTime,
    };

    this.executionHistory.push(executionResult);
    return executionResult;
  }

  /**
   * 执行单个节点（带重试）
   */
  private async executeNode(
    node: PipelineNode,
    input: Record<string, unknown>,
    context: PipelineContext
  ): Promise<NodeExecutionResult> {
    let lastError = '';
    const startTime = Date.now();

    for (let retry = 0; retry <= node.retryCount; retry++) {
      try {
        const output = await Promise.race([
          node.execute(input, context),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), node.timeoutMs)
          ),
        ]);

        context.logs.push({
          timestamp: Date.now(), nodeId: node.id, level: 'info',
          message: `Node ${node.id} completed in ${Date.now() - startTime}ms`,
        });

        return {
          nodeId: node.id, status: 'success', output,
          durationMs: Date.now() - startTime, retries: retry,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        context.logs.push({
          timestamp: Date.now(), nodeId: node.id, level: 'warn',
          message: `Node ${node.id} retry ${retry + 1}/${node.retryCount + 1}: ${lastError}`,
        });
      }
    }

    // 所有重试失败
    if (node.skippable) {
      return {
        nodeId: node.id, status: 'skipped', output: {},
        durationMs: Date.now() - startTime, retries: node.retryCount,
        error: lastError,
      };
    }

    return {
      nodeId: node.id, status: 'failed', output: {},
      durationMs: Date.now() - startTime, retries: node.retryCount,
      error: lastError,
    };
  }

  /**
   * 拓扑排序
   */
  private topologicalSort(pipeline: PipelineDefinition): string[] {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const node of pipeline.nodes) {
      inDegree.set(node.id, 0);
      adj.set(node.id, []);
    }

    for (const edge of pipeline.edges) {
      adj.get(edge.from)?.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);
      for (const neighbor of adj.get(node) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    return sorted;
  }

  /**
   * 计算执行层级（用于并行）
   */
  private computeLevels(sortedNodeIds: string[], edges: PipelineEdge[]): string[][] {
    const nodeLevel = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const id of sortedNodeIds) {
      nodeLevel.set(id, 0);
    }

    for (const edge of edges) {
      if (!adj.has(edge.from)) adj.set(edge.from, []);
      adj.get(edge.from)!.push(edge.to);
    }

    // 计算每个节点的层级
    for (const id of sortedNodeIds) {
      for (const neighbor of adj.get(id) || []) {
        const currentLevel = nodeLevel.get(neighbor) || 0;
        const newLevel = (nodeLevel.get(id) || 0) + 1;
        if (newLevel > currentLevel) {
          nodeLevel.set(neighbor, newLevel);
        }
      }
    }

    // 按层级分组
    const maxLevel = Math.max(...Array.from(nodeLevel.values()), 0);
    const levels: string[][] = Array.from({ length: maxLevel + 1 }, () => []);
    for (const [id, level] of nodeLevel) {
      levels[level].push(id);
    }

    return levels.filter(l => l.length > 0);
  }

  /**
   * 环检测
   */
  private hasCycle(pipeline: PipelineDefinition): boolean {
    const sorted = this.topologicalSort(pipeline);
    return sorted.length !== pipeline.nodes.length;
  }

  /**
   * 构建边映射
   */
  private buildEdgeMap(edges: PipelineEdge[]): Map<string, PipelineEdge[]> {
    const map = new Map<string, PipelineEdge[]>();
    for (const edge of edges) {
      if (!map.has(edge.to)) map.set(edge.to, []);
      map.get(edge.to)!.push(edge);
    }
    return map;
  }

  /**
   * 构建节点输入
   */
  private buildNodeInput(
    nodeId: string,
    edgeMap: Map<string, PipelineEdge[]>,
    context: PipelineContext,
    initialInput: Record<string, unknown>
  ): Record<string, unknown> {
    const input: Record<string, unknown> = { ...initialInput };
    const incomingEdges = edgeMap.get(nodeId) || [];

    for (const edge of incomingEdges) {
      const sourceOutput = context.nodeOutputs.get(edge.from);
      if (!sourceOutput) continue;

      // 条件检查
      if (edge.condition && !edge.condition(sourceOutput)) continue;

      // 数据映射
      if (edge.dataMapping) {
        for (const [fromKey, toKey] of Object.entries(edge.dataMapping)) {
          if (sourceOutput[fromKey] !== undefined) {
            input[toKey] = sourceOutput[fromKey];
          }
        }
      } else {
        Object.assign(input, sourceOutput);
      }
    }

    return input;
  }

  /**
   * 获取执行历史
   */
  getExecutionHistory(limit: number = 20): PipelineExecutionResult[] {
    return this.executionHistory.slice(-limit);
  }

  /**
   * 获取已注册的 Pipeline
   */
  getPipelines(): PipelineDefinition[] {
    return Array.from(this.pipelines.values());
  }
}
