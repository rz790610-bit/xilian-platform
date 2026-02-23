/**
 * XPE v1.1 — 泛型 DAG 工具
 *
 * 方向 1 + 方向 3 共用：
 *  - topologicalSort<T>: Kahn 算法 + 环检测
 *  - generateFlowDiagram: Mermaid flowchart 生成
 */

// ── 泛型节点接口 ────────────────────────────────────────────
export interface DAGNode {
  id: string;
  dependencies: string[];
  /** 软顺序依赖（缺失时跳过，不报错） */
  after?: string[];
}

// ── 环检测错误 ──────────────────────────────────────────────
export class CyclicDependencyError extends Error {
  public readonly cycle: string[];
  constructor(cycle: string[]) {
    super(`检测到循环依赖: ${cycle.join(' → ')}`);
    this.name = 'CyclicDependencyError';
    this.cycle = cycle;
  }
}

/**
 * Kahn 算法拓扑排序 + 环检测
 *
 * @param nodes - 实现 DAGNode 接口的节点数组
 * @param availableIds - 可选，当前可用的节点 ID 集合（用于过滤 soft after 依赖）
 * @returns 排序后的节点 ID 数组
 * @throws CyclicDependencyError 当检测到循环依赖时
 */
export function topologicalSort<T extends DAGNode>(
  nodes: T[],
  availableIds?: Set<string>,
): string[] {
  const nodeMap = new Map<string, T>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // 初始化
  for (const node of nodes) {
    nodeMap.set(node.id, node);
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  const allIds = availableIds ?? new Set(nodeMap.keys());

  // 构建边：硬依赖（dependencies）
  for (const node of nodes) {
    for (const dep of node.dependencies) {
      if (!nodeMap.has(dep)) {
        throw new Error(`插件 "${node.id}" 声明了不存在的硬依赖 "${dep}"`);
      }
      adjacency.get(dep)!.push(node.id);
      inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
    }
  }

  // 构建边：软顺序（after）— 仅当目标存在时生效
  for (const node of nodes) {
    if (!node.after) continue;
    for (const afterId of node.after) {
      if (allIds.has(afterId) && nodeMap.has(afterId)) {
        adjacency.get(afterId)!.push(node.id);
        inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
      }
      // 软依赖目标不存在时静默跳过
    }
  }

  // Kahn 算法
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  // 按 ID 字典序稳定排序，保证确定性
  queue.sort();

  const sorted: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        // 插入排序保持字典序
        const insertIdx = queue.findIndex(q => q > neighbor);
        if (insertIdx === -1) {
          queue.push(neighbor);
        } else {
          queue.splice(insertIdx, 0, neighbor);
        }
      }
    }
  }

  // 环检测：如果排序后的节点数少于输入节点数，说明存在环
  if (sorted.length !== nodes.length) {
    const inCycle = nodes
      .filter(n => !sorted.includes(n.id))
      .map(n => n.id);
    throw new CyclicDependencyError(inCycle);
  }

  return sorted;
}

// ── Mermaid Flowchart 生成 ──────────────────────────────────

export interface FlowDiagramOptions {
  title?: string;
  direction?: 'TB' | 'LR' | 'BT' | 'RL';
  /** 按 loopStage 分组（Agent 编排图专用） */
  groupByStage?: boolean;
  stageMap?: Map<string, string>;
  /** 标记并行节点 */
  parallelIds?: Set<string>;
}

/**
 * 生成 Mermaid flowchart 字符串
 *
 * @param nodes - DAG 节点数组
 * @param options - 可视化选项
 * @returns Mermaid flowchart 语法字符串
 */
export function generateFlowDiagram(
  nodes: DAGNode[],
  options: FlowDiagramOptions = {},
): string {
  const { direction = 'TB', title, groupByStage = false, stageMap, parallelIds } = options;
  const lines: string[] = [];

  if (title) {
    lines.push(`---`);
    lines.push(`title: ${title}`);
    lines.push(`---`);
  }

  lines.push(`flowchart ${direction}`);

  // 节点声明
  if (groupByStage && stageMap) {
    const groups = new Map<string, string[]>();
    for (const node of nodes) {
      const stage = stageMap.get(node.id) ?? 'unknown';
      if (!groups.has(stage)) groups.set(stage, []);
      groups.get(stage)!.push(node.id);
    }
    for (const [stage, ids] of groups) {
      lines.push(`  subgraph ${stage}`);
      for (const id of ids) {
        const isParallel = parallelIds?.has(id);
        const shape = isParallel ? `{{${id}}}` : `[${id}]`;
        lines.push(`    ${id}${shape}`);
      }
      lines.push(`  end`);
    }
  } else {
    for (const node of nodes) {
      const isParallel = parallelIds?.has(node.id);
      const shape = isParallel ? `{{${node.id}}}` : `[${node.id}]`;
      lines.push(`  ${node.id}${shape}`);
    }
  }

  // 边声明
  for (const node of nodes) {
    for (const dep of node.dependencies) {
      lines.push(`  ${dep} --> ${node.id}`);
    }
    if (node.after) {
      for (const afterId of node.after) {
        // 软依赖用虚线
        lines.push(`  ${afterId} -.-> ${node.id}`);
      }
    }
  }

  return lines.join('\n');
}
