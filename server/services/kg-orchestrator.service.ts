/**
 * 知识图谱编排器服务
 * 负责图谱CRUD、诊断推理、自进化
 */
import { eq, desc, and, sql, like, inArray } from "drizzle-orm";
import { getDb } from "../lib/db";
import {
  kgGraphs, kgGraphNodes, kgGraphEdges,
  kgDiagnosisRuns, kgDiagnosisPaths, kgEvolutionLog,
  type KgGraph, type InsertKgGraph,
  type KgGraphNode, type InsertKgGraphNode,
  type KgGraphEdge, type InsertKgGraphEdge,
  type KgDiagnosisRun, type InsertKgDiagnosisRun,
  type InsertKgDiagnosisPath,
  type InsertKgEvolutionLog,
} from "../../drizzle/schema";
import type {
  KGEditorNode, KGEditorEdge, KGGraphDefinition,
  KGDiagnosisInput, KGDiagnosisResult, KGInferencePath,
  KGEvolutionEvent, KGRelationType,
} from "../../shared/kgOrchestratorTypes";

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================
// §1 图谱 CRUD
// ============================================================

export async function listGraphs(opts: {
  scenario?: string; status?: string; search?: string;
  page?: number; pageSize?: number;
}): Promise<{ items: KgGraph[]; total: number }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const { scenario, status, search, page = 1, pageSize = 20 } = opts;
  const conditions = [];
  if (scenario) conditions.push(eq(kgGraphs.scenario, scenario));
  if (status) conditions.push(eq(kgGraphs.status, status as any));
  if (search) conditions.push(like(kgGraphs.name, `%${search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [items, countResult] = await Promise.all([
    db.select().from(kgGraphs).where(where).orderBy(desc(kgGraphs.updatedAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)` }).from(kgGraphs).where(where),
  ]);
  return { items, total: countResult[0]?.count ?? 0 };
}

export async function getGraph(graphId: string): Promise<KGGraphDefinition | null> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [graph] = await db.select().from(kgGraphs).where(eq(kgGraphs.graphId, graphId)).limit(1);
  if (!graph) return null;

  const [nodes, edges] = await Promise.all([
    db.select().from(kgGraphNodes).where(eq(kgGraphNodes.graphId, graphId)),
    db.select().from(kgGraphEdges).where(eq(kgGraphEdges.graphId, graphId)),
  ]);

  return {
    graphId: graph.graphId,
    name: graph.name,
    description: graph.description ?? undefined,
    scenario: graph.scenario as any,
    version: graph.version,
    status: graph.status,
    nodes: nodes.map((n: any) => ({
      nodeId: n.nodeId,
      category: n.category as any,
      subType: n.subType as any,
      label: n.label,
      x: n.x,
      y: n.y,
      config: (n.config ?? {}) as Record<string, unknown>,
      nodeStatus: n.nodeStatus,
      hitCount: n.hitCount ?? 0,
      accuracy: n.accuracy ?? undefined,
    })),
    edges: edges.map((e: any) => ({
      edgeId: e.edgeId,
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
      relationType: e.relationType as KGRelationType,
      label: e.label ?? undefined,
      weight: e.weight,
      config: (e.config ?? {}) as Record<string, unknown>,
      pathAccuracy: e.pathAccuracy ?? undefined,
      hitCount: e.hitCount ?? 0,
    })),
    viewportConfig: graph.viewportConfig ?? undefined,
    tags: graph.tags ?? undefined,
  };
}

export async function createGraph(data: {
  name: string; description?: string; scenario: string;
  templateId?: string; tags?: string[];
  nodes?: KGEditorNode[]; edges?: KGEditorEdge[];
}): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const graphId = genId("kg");
  const nodes = data.nodes ?? [];
  const edges = data.edges ?? [];

  // P1 修复：事务化多步写入，确保图谱+节点+边的原子性
  await db.transaction(async (tx) => {
    await tx.insert(kgGraphs).values({
      graphId,
      name: data.name,
      description: data.description,
      scenario: data.scenario,
      templateId: data.templateId,
      status: "draft",
      nodeCount: nodes.length,
      edgeCount: edges.length,
      tags: data.tags,
    });

    if (nodes.length > 0) {
      await tx.insert(kgGraphNodes).values(nodes.map(n => ({
        graphId,
        nodeId: n.nodeId,
        category: n.category,
        subType: n.subType,
        label: n.label,
        x: n.x,
        y: n.y,
        config: n.config,
        nodeStatus: n.nodeStatus ?? "normal",
      })));
    }

    if (edges.length > 0) {
      await tx.insert(kgGraphEdges).values(edges.map(e => ({
        graphId,
        edgeId: e.edgeId,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        relationType: e.relationType,
        label: e.label,
        weight: e.weight,
        config: e.config,
      })));
    }
  });

  return graphId;
}

export async function updateGraph(graphId: string, data: {
  name?: string; description?: string; status?: string;
  tags?: string[]; viewportConfig?: { zoom: number; panX: number; panY: number };
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const updates: Partial<InsertKgGraph> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.status !== undefined) updates.status = data.status as any;
  if (data.tags !== undefined) updates.tags = data.tags;
  if (data.viewportConfig !== undefined) updates.viewportConfig = data.viewportConfig;
  await db.update(kgGraphs).set(updates).where(eq(kgGraphs.graphId, graphId));
}

export async function deleteGraph(graphId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  // P1 修复：事务化级联删除，防止孤儿记录
  await db.transaction(async (tx) => {
    await Promise.all([
      tx.delete(kgGraphNodes).where(eq(kgGraphNodes.graphId, graphId)),
      tx.delete(kgGraphEdges).where(eq(kgGraphEdges.graphId, graphId)),
      tx.delete(kgDiagnosisRuns).where(eq(kgDiagnosisRuns.graphId, graphId)),
      tx.delete(kgEvolutionLog).where(eq(kgEvolutionLog.graphId, graphId)),
    ]);
    await tx.delete(kgGraphs).where(eq(kgGraphs.graphId, graphId));
  });
}

/** 保存画布状态（全量替换节点和边） */
export async function saveCanvasState(graphId: string, nodes: KGEditorNode[], edges: KGEditorEdge[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  // P1 修复：事务化全量替换，防止删除成功但插入失败导致图谱丢失
  await db.transaction(async (tx) => {
    // 先删旧的
    await Promise.all([
      tx.delete(kgGraphNodes).where(eq(kgGraphNodes.graphId, graphId)),
      tx.delete(kgGraphEdges).where(eq(kgGraphEdges.graphId, graphId)),
    ]);
    // 插入新的
    if (nodes.length > 0) {
      await tx.insert(kgGraphNodes).values(nodes.map(n => ({
        graphId,
        nodeId: n.nodeId,
        category: n.category,
        subType: n.subType,
        label: n.label,
        x: n.x,
        y: n.y,
        config: n.config,
        nodeStatus: n.nodeStatus ?? "normal",
        hitCount: n.hitCount ?? 0,
        accuracy: n.accuracy,
      })));
    }
    if (edges.length > 0) {
      await tx.insert(kgGraphEdges).values(edges.map(e => ({
        graphId,
        edgeId: e.edgeId,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        relationType: e.relationType,
        label: e.label,
        weight: e.weight,
        config: e.config,
        pathAccuracy: e.pathAccuracy,
        hitCount: e.hitCount ?? 0,
      })));
    }
    // 更新统计
    await tx.update(kgGraphs).set({
      nodeCount: nodes.length,
      edgeCount: edges.length,
    }).where(eq(kgGraphs.graphId, graphId));
  });
}

// ============================================================
// §2 诊断推理引擎
// ============================================================

export async function runDiagnosis(input: KGDiagnosisInput): Promise<KGDiagnosisResult> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const startTime = Date.now();
  const runId = genId("diag");
  const maxDepth = input.maxDepth ?? 5;

  // 加载图谱
  const graph = await getGraph(input.graphId);
  if (!graph) throw new Error(`图谱 ${input.graphId} 不存在`);

  // 构建邻接表
  const adjacency = new Map<string, Array<{ edgeId: string; targetNodeId: string; relationType: string; weight: number }>>();
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.sourceNodeId)) adjacency.set(edge.sourceNodeId, []);
    adjacency.get(edge.sourceNodeId)!.push({
      edgeId: edge.edgeId,
      targetNodeId: edge.targetNodeId,
      relationType: edge.relationType,
      weight: edge.weight,
    });
  }

  const nodeMap = new Map(graph.nodes.map(n => [n.nodeId, n]));

  // 确定起始节点
  let startNodes: string[] = [];
  if (input.startNodeId) {
    startNodes = [input.startNodeId];
  } else {
    // 从数据层和传感器节点开始
    startNodes = graph.nodes
      .filter(n => n.category === 'data' || n.subType === 'sensor' || n.subType === 'anomaly_pattern')
      .map(n => n.nodeId);
    if (startNodes.length === 0) {
      startNodes = graph.nodes.filter(n => n.category === 'equipment').map(n => n.nodeId);
    }
  }

  // BFS/DFS 多路径推理
  const allPaths: KGInferencePath[] = [];
  const visited = new Set<string>();

  function dfs(currentId: string, pathNodes: string[], pathEdges: string[], depth: number, confidence: number) {
    if (depth > maxDepth) return;
    const node = nodeMap.get(currentId);
    if (!node) return;

    // 到达解决方案层或诊断结论 → 记录路径
    if (node.category === 'solution' || (node.category === 'fault' && node.subType === 'fault_mode' && depth > 1)) {
      allPaths.push({
        pathIndex: allPaths.length,
        nodeSequence: [...pathNodes],
        edgeSequence: [...pathEdges],
        confidence,
        conclusion: node.label,
        isSelected: false,
      });
      // 继续探索更多路径
    }

    const neighbors = adjacency.get(currentId) ?? [];
    for (const neighbor of neighbors) {
      if (pathNodes.includes(neighbor.targetNodeId)) continue; // 避免环
      const edgeConfidence = neighbor.weight;
      const newConfidence = confidence * edgeConfidence;
      if (newConfidence < 0.1) continue; // 置信度太低，剪枝

      pathNodes.push(neighbor.targetNodeId);
      pathEdges.push(neighbor.edgeId);
      dfs(neighbor.targetNodeId, pathNodes, pathEdges, depth + 1, newConfidence);
      pathNodes.pop();
      pathEdges.pop();
    }
  }

  for (const startId of startNodes) {
    dfs(startId, [startId], [], 0, 1.0);
  }

  // 按置信度排序，选择最优路径
  allPaths.sort((a, b) => b.confidence - a.confidence);
  if (allPaths.length > 0) {
    allPaths[0].isSelected = true;
  }

  const topPaths = allPaths.slice(0, 10);
  const bestPath = topPaths[0];
  const durationMs = Date.now() - startTime;

  // 构建诊断结果
  const faultNodes = bestPath
    ? bestPath.nodeSequence.map(id => nodeMap.get(id)).filter(n => n?.category === 'fault' && n.subType === 'fault_mode')
    : [];
  const solutionNodes = bestPath
    ? bestPath.nodeSequence.map(id => nodeMap.get(id)).filter(n => n?.category === 'solution')
    : [];

  const result: KGDiagnosisResult = {
    runId,
    conclusion: bestPath?.conclusion ?? '未找到匹配的诊断路径',
    confidence: bestPath?.confidence ?? 0,
    faultCodes: faultNodes.map(n => (n?.config?.faultCode as string) ?? n?.label ?? ''),
    severity: determineSeverity(bestPath?.confidence ?? 0, faultNodes),
    recommendedActions: solutionNodes.map(n => n?.label ?? ''),
    paths: topPaths,
    durationMs,
  };

  // P1 修复：事务化诊断结果持久化（记录+路径+统计+命中计数）
  await db.transaction(async (tx) => {
    // 保存诊断记录
    await tx.insert(kgDiagnosisRuns).values({
      runId,
      graphId: input.graphId,
      triggerType: "manual",
      inputData: input.inputData,
      status: "completed",
      result: {
        conclusion: result.conclusion,
        confidence: result.confidence,
        faultCodes: result.faultCodes,
        severity: result.severity,
        recommendedActions: result.recommendedActions,
      },
      inferencePathIds: topPaths.map(p => p.nodeSequence.join('->')),
      inferenceDepth: bestPath?.nodeSequence.length ?? 0,
      durationMs,
      createdAt: new Date(),
    });

    // 保存推理路径详情
    if (topPaths.length > 0) {
      await tx.insert(kgDiagnosisPaths).values(topPaths.map(p => ({
        runId,
        graphId: input.graphId,
        pathIndex: p.pathIndex,
        nodeSequence: p.nodeSequence,
        edgeSequence: p.edgeSequence,
        confidence: p.confidence,
        conclusion: p.conclusion,
        isSelected: p.isSelected,
        createdAt: new Date(),
      })));
    }

    // 更新图谱诊断统计
    await tx.update(kgGraphs).set({
      totalDiagnosisRuns: sql`total_diagnosis_runs + 1`,
    }).where(eq(kgGraphs.graphId, input.graphId));

    // 更新路径上节点和边的命中计数
    if (bestPath) {
      for (const nodeId of bestPath.nodeSequence) {
        await tx.update(kgGraphNodes).set({
          hitCount: sql`hit_count + 1`,
        }).where(and(eq(kgGraphNodes.graphId, input.graphId), eq(kgGraphNodes.nodeId, nodeId)));
      }
      for (const edgeId of bestPath.edgeSequence) {
        await tx.update(kgGraphEdges).set({
          hitCount: sql`hit_count + 1`,
        }).where(and(eq(kgGraphEdges.graphId, input.graphId), eq(kgGraphEdges.edgeId, edgeId)));
      }
    }
  });

  return result;
}

function determineSeverity(confidence: number, faultNodes: (KGEditorNode | undefined)[]): 'info' | 'warning' | 'error' | 'critical' {
  const maxSeverity = faultNodes.reduce((max, n) => {
    const s = n?.config?.severity as string;
    if (s === 'critical') return 4;
    if (s === 'error') return Math.max(max, 3);
    if (s === 'warning') return Math.max(max, 2);
    return Math.max(max, 1);
  }, 1);
  if (confidence > 0.8 && maxSeverity >= 4) return 'critical';
  if (confidence > 0.6 && maxSeverity >= 3) return 'error';
  if (confidence > 0.4 && maxSeverity >= 2) return 'warning';
  return 'info';
}

/** 获取诊断运行列表 */
export async function listDiagnosisRuns(graphId: string, opts: {
  page?: number; pageSize?: number;
}): Promise<{ items: KgDiagnosisRun[]; total: number }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const { page = 1, pageSize = 20 } = opts;
  const [items, countResult] = await Promise.all([
    db.select().from(kgDiagnosisRuns).where(eq(kgDiagnosisRuns.graphId, graphId))
      .orderBy(desc(kgDiagnosisRuns.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)` }).from(kgDiagnosisRuns).where(eq(kgDiagnosisRuns.graphId, graphId)),
  ]);
  return { items, total: countResult[0]?.count ?? 0 };
}

/** 提交诊断反馈 */
export async function submitDiagnosisFeedback(runId: string, feedback: 'correct' | 'incorrect' | 'partial', note?: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(kgDiagnosisRuns).set({
    feedback,
    feedbackNote: note,
  }).where(eq(kgDiagnosisRuns.runId, runId));

  // 获取诊断记录
  const [run] = await db.select().from(kgDiagnosisRuns).where(eq(kgDiagnosisRuns.runId, runId)).limit(1);
  if (!run) return;

  // 触发自进化：根据反馈调整权重
  if (feedback === 'correct') {
    await evolveFromFeedback(run.graphId, runId, 'positive');
  } else if (feedback === 'incorrect') {
    await evolveFromFeedback(run.graphId, runId, 'negative');
  }
}

// ============================================================
// §3 自进化引擎
// ============================================================

async function evolveFromFeedback(graphId: string, runId: string, direction: 'positive' | 'negative'): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // 获取该次诊断的选中路径
  const [selectedPath] = await db.select().from(kgDiagnosisPaths)
    .where(and(eq(kgDiagnosisPaths.runId, runId), eq(kgDiagnosisPaths.isSelected, true)))
    .limit(1);
  if (!selectedPath) return;

  const weightDelta = direction === 'positive' ? 0.05 : -0.08;
  const changes: InsertKgEvolutionLog['changes'] = { updatedWeights: [] };

  // P1 修复：事务化自进化操作（权重调整+准确率+日志+时间戳）
  await db.transaction(async (tx) => {
    // 调整路径上所有边的权重
    for (const edgeId of selectedPath.edgeSequence) {
      const [edge] = await tx.select().from(kgGraphEdges)
        .where(and(eq(kgGraphEdges.graphId, graphId), eq(kgGraphEdges.edgeId, edgeId)))
        .limit(1);
      if (!edge) continue;

      const oldWeight = edge.weight;
      const newWeight = Math.max(0.05, Math.min(1.0, oldWeight + weightDelta));

      await tx.update(kgGraphEdges).set({ weight: newWeight })
        .where(and(eq(kgGraphEdges.graphId, graphId), eq(kgGraphEdges.edgeId, edgeId)));

      changes.updatedWeights!.push({ edgeId, oldWeight, newWeight });
    }

    // 更新节点准确率
    for (const nodeId of selectedPath.nodeSequence) {
      const [node] = await tx.select().from(kgGraphNodes)
        .where(and(eq(kgGraphNodes.graphId, graphId), eq(kgGraphNodes.nodeId, nodeId)))
        .limit(1);
      if (!node) continue;

      const oldAccuracy = node.accuracy ?? 0.5;
      const hits = node.hitCount ?? 1;
      const newAccuracy = direction === 'positive'
        ? oldAccuracy + (1 - oldAccuracy) / hits
        : oldAccuracy - oldAccuracy / (hits * 2);

      await tx.update(kgGraphNodes).set({ accuracy: Math.max(0, Math.min(1, newAccuracy)) })
        .where(and(eq(kgGraphNodes.graphId, graphId), eq(kgGraphNodes.nodeId, nodeId)));
    }

    // 记录进化日志
    await tx.insert(kgEvolutionLog).values({
      graphId,
      evolutionType: 'weight_adjust',
      description: direction === 'positive'
        ? `诊断反馈正确，增强路径权重 (${selectedPath.edgeSequence.length} 条边)`
        : `诊断反馈错误，降低路径权重 (${selectedPath.edgeSequence.length} 条边)`,
      changes,
      triggeredBy: 'diagnosis_feedback',
      status: 'applied',
      createdAt: new Date(),
    });

    // 更新图谱进化时间
    await tx.update(kgGraphs).set({
      lastEvolvedAt: new Date(),
    }).where(eq(kgGraphs.graphId, graphId));
  });
}

/** 获取进化日志 */
export async function listEvolutionLogs(graphId: string, opts: {
  page?: number; pageSize?: number;
}): Promise<{ items: (typeof kgEvolutionLog.$inferSelect)[]; total: number }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const { page = 1, pageSize = 20 } = opts;
  const [items, countResult] = await Promise.all([
    db.select().from(kgEvolutionLog).where(eq(kgEvolutionLog.graphId, graphId))
      .orderBy(desc(kgEvolutionLog.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)` }).from(kgEvolutionLog).where(eq(kgEvolutionLog.graphId, graphId)),
  ]);
  return { items, total: countResult[0]?.count ?? 0 };
}

/** 审核进化事件 */
export async function reviewEvolution(logId: number, action: 'applied' | 'rejected', reviewedBy?: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(kgEvolutionLog).set({
    status: action,
    reviewedBy,
    reviewedAt: new Date(),
  }).where(eq(kgEvolutionLog.id, logId));
}

/** 获取图谱统计概览 */
export async function getGraphStats(graphId: string): Promise<{
  nodeCount: number; edgeCount: number;
  diagnosisRuns: number; avgAccuracy: number;
  evolutionCount: number; lastEvolvedAt: Date | null;
  categoryDistribution: Record<string, number>;
  topHitNodes: Array<{ nodeId: string; label: string; hitCount: number }>;
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [graph] = await db.select().from(kgGraphs).where(eq(kgGraphs.graphId, graphId)).limit(1);
  if (!graph) throw new Error(`图谱 ${graphId} 不存在`);

  const nodes = await db.select().from(kgGraphNodes).where(eq(kgGraphNodes.graphId, graphId));
  const [evoCount] = await db.select({ count: sql<number>`count(*)` }).from(kgEvolutionLog).where(eq(kgEvolutionLog.graphId, graphId));

  // 类别分布
  const categoryDistribution: Record<string, number> = {};
  for (const n of nodes) {
    categoryDistribution[n.category] = (categoryDistribution[n.category] ?? 0) + 1;
  }

  // 高频命中节点
  const topHitNodes = nodes
    .filter((n: any) => (n.hitCount ?? 0) > 0)
    .sort((a: any, b: any) => (b.hitCount ?? 0) - (a.hitCount ?? 0))
    .map((n: any) => ({ nodeId: n.nodeId, label: n.label, hitCount: n.hitCount ?? 0 }));

  return {
    nodeCount: graph.nodeCount ?? 0,
    edgeCount: graph.edgeCount ?? 0,
    diagnosisRuns: graph.totalDiagnosisRuns ?? 0,
    avgAccuracy: graph.avgAccuracy ?? 0,
    evolutionCount: evoCount?.count ?? 0,
    lastEvolvedAt: graph.lastEvolvedAt,
    categoryDistribution,
    topHitNodes,
  };
}
