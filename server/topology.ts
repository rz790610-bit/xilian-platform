import { z } from "zod";
import { eq, desc, and, sql, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { topoNodes, topoEdges, topoLayouts, TopoNode, TopoEdge, TopoLayout, InsertTopoNode, InsertTopoEdge, InsertTopoLayout } from "../drizzle/schema";
import { getDb } from "./db";

// ============ 拓扑节点操作 ============

export async function createTopoNode(data: InsertTopoNode): Promise<TopoNode | null> {
  const db = await getDb();
  if (!db) return null;
  
  try {
    await db.insert(topoNodes).values(data);
    const result = await db.select().from(topoNodes).where(eq(topoNodes.nodeId, data.nodeId)).limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Topology] Failed to create node:", error);
    return null;
  }
}

export async function getTopoNodes(): Promise<TopoNode[]> {
  const db = await getDb();
  if (!db) return [];
  
  try {
    return await db.select().from(topoNodes).orderBy(desc(topoNodes.createdAt));
  } catch (error) {
    console.error("[Topology] Failed to get nodes:", error);
    return [];
  }
}

export async function getTopoNodeById(nodeId: string): Promise<TopoNode | null> {
  const db = await getDb();
  if (!db) return null;
  
  try {
    const result = await db.select().from(topoNodes).where(eq(topoNodes.nodeId, nodeId)).limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Topology] Failed to get node:", error);
    return null;
  }
}

export async function updateTopoNode(nodeId: string, data: Partial<InsertTopoNode>): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    await db.update(topoNodes).set(data).where(eq(topoNodes.nodeId, nodeId));
    return true;
  } catch (error) {
    console.error("[Topology] Failed to update node:", error);
    return false;
  }
}

export async function updateTopoNodePosition(nodeId: string, x: number, y: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    await db.update(topoNodes).set({ x, y }).where(eq(topoNodes.nodeId, nodeId));
    return true;
  } catch (error) {
    console.error("[Topology] Failed to update node position:", error);
    return false;
  }
}

export async function updateTopoNodeStatus(nodeId: string, status: 'online' | 'offline' | 'error' | 'maintenance'): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    await db.update(topoNodes).set({ status, lastHeartbeat: new Date() }).where(eq(topoNodes.nodeId, nodeId));
    return true;
  } catch (error) {
    console.error("[Topology] Failed to update node status:", error);
    return false;
  }
}

export async function updateTopoNodeMetrics(nodeId: string, metrics: { cpu?: number; memory?: number; latency?: number; throughput?: number }): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    await db.update(topoNodes).set({ metrics, lastHeartbeat: new Date() }).where(eq(topoNodes.nodeId, nodeId));
    return true;
  } catch (error) {
    console.error("[Topology] Failed to update node metrics:", error);
    return false;
  }
}

export async function deleteTopoNode(nodeId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    // 同时删除相关的连接
    await db.delete(topoEdges).where(eq(topoEdges.sourceNodeId, nodeId));
    await db.delete(topoEdges).where(eq(topoEdges.targetNodeId, nodeId));
    await db.delete(topoNodes).where(eq(topoNodes.nodeId, nodeId));
    return true;
  } catch (error) {
    console.error("[Topology] Failed to delete node:", error);
    return false;
  }
}

// ============ 拓扑连接操作 ============

export async function createTopoEdge(data: InsertTopoEdge): Promise<TopoEdge | null> {
  const db = await getDb();
  if (!db) return null;
  
  try {
    await db.insert(topoEdges).values(data);
    const result = await db.select().from(topoEdges).where(eq(topoEdges.edgeId, data.edgeId)).limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Topology] Failed to create edge:", error);
    return null;
  }
}

export async function getTopoEdges(): Promise<TopoEdge[]> {
  const db = await getDb();
  if (!db) return [];
  
  try {
    return await db.select().from(topoEdges).orderBy(desc(topoEdges.createdAt));
  } catch (error) {
    console.error("[Topology] Failed to get edges:", error);
    return [];
  }
}

export async function updateTopoEdge(edgeId: string, data: Partial<InsertTopoEdge>): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    await db.update(topoEdges).set(data).where(eq(topoEdges.edgeId, edgeId));
    return true;
  } catch (error) {
    console.error("[Topology] Failed to update edge:", error);
    return false;
  }
}

export async function deleteTopoEdge(edgeId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    await db.delete(topoEdges).where(eq(topoEdges.edgeId, edgeId));
    return true;
  } catch (error) {
    console.error("[Topology] Failed to delete edge:", error);
    return false;
  }
}

// ============ 拓扑布局操作 ============

export async function createTopoLayout(data: InsertTopoLayout): Promise<TopoLayout | null> {
  const db = await getDb();
  if (!db) return null;
  
  try {
    const result = await db.insert(topoLayouts).values(data);
    const insertId = result[0].insertId;
    const layout = await db.select().from(topoLayouts).where(eq(topoLayouts.id, insertId)).limit(1);
    return layout[0] || null;
  } catch (error) {
    console.error("[Topology] Failed to create layout:", error);
    return null;
  }
}

export async function getTopoLayouts(userId?: number): Promise<TopoLayout[]> {
  const db = await getDb();
  if (!db) return [];
  
  try {
    if (userId) {
      return await db.select().from(topoLayouts).where(eq(topoLayouts.userId, userId)).orderBy(desc(topoLayouts.createdAt));
    }
    return await db.select().from(topoLayouts).orderBy(desc(topoLayouts.createdAt));
  } catch (error) {
    console.error("[Topology] Failed to get layouts:", error);
    return [];
  }
}

export async function getDefaultTopoLayout(): Promise<TopoLayout | null> {
  const db = await getDb();
  if (!db) return null;
  
  try {
    const result = await db.select().from(topoLayouts).where(eq(topoLayouts.isDefault, true)).limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Topology] Failed to get default layout:", error);
    return null;
  }
}

export async function updateTopoLayout(id: number, data: Partial<InsertTopoLayout>): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    // 如果设置为默认，先取消其他默认
    if (data.isDefault) {
      await db.update(topoLayouts).set({ isDefault: false }).where(eq(topoLayouts.isDefault, true));
    }
    await db.update(topoLayouts).set(data).where(eq(topoLayouts.id, id));
    return true;
  } catch (error) {
    console.error("[Topology] Failed to update layout:", error);
    return false;
  }
}

export async function deleteTopoLayout(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    await db.delete(topoLayouts).where(eq(topoLayouts.id, id));
    return true;
  } catch (error) {
    console.error("[Topology] Failed to delete layout:", error);
    return false;
  }
}

// ============ 初始化默认拓扑数据 ============

export async function initializeDefaultTopology(): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    // 检查是否已有数据
    const existingNodes = await db.select().from(topoNodes).limit(1);
    if (existingNodes.length > 0) {
      return true; // 已有数据，不需要初始化
    }
    
    // 创建默认节点
    const defaultNodes: InsertTopoNode[] = [
      { nodeId: 'sensor1', name: '振动传感器', type: 'source', icon: '📡', status: 'online', x: 50, y: 80, description: '采集设备振动数据' },
      { nodeId: 'sensor2', name: '温度传感器', type: 'source', icon: '🌡️', status: 'online', x: 50, y: 180, description: '采集设备温度数据' },
      { nodeId: 'fft', name: 'FFT分析', type: 'plugin', icon: '🔊', status: 'online', x: 200, y: 80, description: '快速傅里叶变换分析' },
      { nodeId: 'envelope', name: '包络分析', type: 'plugin', icon: '📈', status: 'online', x: 200, y: 180, description: '希尔伯特包络分析' },
      { nodeId: 'feature', name: '特征提取', type: 'plugin', icon: '🎯', status: 'online', x: 350, y: 130, description: '提取诊断特征' },
      { nodeId: 'ai', name: 'AI诊断引擎', type: 'engine', icon: '🤖', status: 'online', x: 500, y: 80, description: '智能诊断推理引擎' },
      { nodeId: 'ollama', name: 'Ollama', type: 'service', icon: '🦙', status: 'online', x: 500, y: 180, description: '本地大模型服务' },
      { nodeId: 'qdrant', name: 'Qdrant', type: 'database', icon: '🔴', status: 'online', x: 650, y: 80, description: '向量数据库' },
      { nodeId: 'report', name: '报告生成', type: 'output', icon: '📝', status: 'online', x: 650, y: 180, description: '生成诊断报告' }
    ];
    
    await db.insert(topoNodes).values(defaultNodes);
    
    // 创建默认连接
    const defaultEdges: InsertTopoEdge[] = [
      { edgeId: 'e1', sourceNodeId: 'sensor1', targetNodeId: 'fft', type: 'data', label: '振动数据' },
      { edgeId: 'e2', sourceNodeId: 'sensor2', targetNodeId: 'envelope', type: 'data', label: '温度数据' },
      { edgeId: 'e3', sourceNodeId: 'fft', targetNodeId: 'feature', type: 'data', label: '频谱特征' },
      { edgeId: 'e4', sourceNodeId: 'envelope', targetNodeId: 'feature', type: 'data', label: '包络特征' },
      { edgeId: 'e5', sourceNodeId: 'feature', targetNodeId: 'ai', type: 'data', label: '诊断特征' },
      { edgeId: 'e6', sourceNodeId: 'ai', targetNodeId: 'ollama', type: 'dependency', label: '模型调用' },
      { edgeId: 'e7', sourceNodeId: 'ai', targetNodeId: 'qdrant', type: 'data', label: '知识检索' },
      { edgeId: 'e8', sourceNodeId: 'ai', targetNodeId: 'report', type: 'data', label: '诊断结果' }
    ];
    
    await db.insert(topoEdges).values(defaultEdges);
    
    // 创建默认布局
    const defaultLayout: InsertTopoLayout = {
      name: '默认布局',
      description: '系统默认拓扑布局',
      isDefault: true,
      layoutData: {
        nodes: defaultNodes.map(n => ({ nodeId: n.nodeId, x: n.x ?? 0, y: n.y ?? 0 })),
        zoom: 1,
        panX: 0,
        panY: 0
      }
    };
    
    await db.insert(topoLayouts).values(defaultLayout);
    
    return true;
  } catch (error) {
    console.error("[Topology] Failed to initialize default topology:", error);
    return false;
  }
}

// ============ tRPC 路由定义 ============

export const topologyRouter = router({
  // 获取所有节点
  getNodes: publicProcedure.query(async () => {
    // 先尝试初始化默认数据
    await initializeDefaultTopology();
    return await getTopoNodes();
  }),
  
  // 获取单个节点
  getNode: publicProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(async ({ input }) => {
      return await getTopoNodeById(input.nodeId);
    }),
  
  // 创建节点
  createNode: publicProcedure
    .input(z.object({
      nodeId: z.string(),
      name: z.string(),
      type: z.enum(['source', 'plugin', 'engine', 'agent', 'output', 'database', 'service']),
      icon: z.string().optional(),
      description: z.string().optional(),
      x: z.number().default(0),
      y: z.number().default(0),
      config: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      return await createTopoNode({
        nodeId: input.nodeId,
        name: input.name,
        type: input.type,
        icon: input.icon || '📦',
        description: input.description,
        x: input.x || 0,
        y: input.y || 0,
        config: input.config,
        status: 'offline',
      });
    }),
  
  // 更新节点
  updateNode: publicProcedure
    .input(z.object({
      nodeId: z.string(),
      name: z.string().optional(),
      icon: z.string().optional(),
      description: z.string().optional(),
      config: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const { nodeId, ...data } = input;
      return await updateTopoNode(nodeId, data);
    }),
  
  // 更新节点位置
  updateNodePosition: publicProcedure
    .input(z.object({
      nodeId: z.string(),
      x: z.number(),
      y: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await updateTopoNodePosition(input.nodeId, input.x, input.y);
    }),
  
  // 批量更新节点位置
  updateNodePositions: publicProcedure
    .input(z.array(z.object({
      nodeId: z.string(),
      x: z.number(),
      y: z.number(),
    })))
    .mutation(async ({ input }) => {
      for (const node of input) {
        await updateTopoNodePosition(node.nodeId, node.x, node.y);
      }
      return true;
    }),
  
  // 更新节点状态
  updateNodeStatus: publicProcedure
    .input(z.object({
      nodeId: z.string(),
      status: z.enum(['online', 'offline', 'error', 'maintenance']),
    }))
    .mutation(async ({ input }) => {
      return await updateTopoNodeStatus(input.nodeId, input.status);
    }),
  
  // 更新节点指标
  updateNodeMetrics: publicProcedure
    .input(z.object({
      nodeId: z.string(),
      metrics: z.object({
        cpu: z.number().optional(),
        memory: z.number().optional(),
        latency: z.number().optional(),
        throughput: z.number().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      return await updateTopoNodeMetrics(input.nodeId, input.metrics);
    }),
  
  // 删除节点
  deleteNode: publicProcedure
    .input(z.object({ nodeId: z.string() }))
    .mutation(async ({ input }) => {
      return await deleteTopoNode(input.nodeId);
    }),
  
  // 获取所有连接
  getEdges: publicProcedure.query(async () => {
    return await getTopoEdges();
  }),
  
  // 创建连接
  createEdge: publicProcedure
    .input(z.object({
      edgeId: z.string(),
      sourceNodeId: z.string(),
      targetNodeId: z.string(),
      type: z.enum(['data', 'dependency', 'control']).optional(),
      label: z.string().optional(),
      config: z.object({
        bandwidth: z.number().optional(),
        latency: z.number().optional(),
        protocol: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      return await createTopoEdge({
        edgeId: input.edgeId,
        sourceNodeId: input.sourceNodeId,
        targetNodeId: input.targetNodeId,
        type: input.type || 'data',
        label: input.label,
        config: input.config,
        status: 'active',
      });
    }),
  
  // 更新连接
  updateEdge: publicProcedure
    .input(z.object({
      edgeId: z.string(),
      label: z.string().optional(),
      type: z.enum(['data', 'dependency', 'control']).optional(),
      status: z.enum(['active', 'inactive', 'error']).optional(),
      config: z.object({
        bandwidth: z.number().optional(),
        latency: z.number().optional(),
        protocol: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const { edgeId, ...data } = input;
      return await updateTopoEdge(edgeId, data);
    }),
  
  // 删除连接
  deleteEdge: publicProcedure
    .input(z.object({ edgeId: z.string() }))
    .mutation(async ({ input }) => {
      return await deleteTopoEdge(input.edgeId);
    }),
  
  // 获取所有布局
  getLayouts: publicProcedure.query(async () => {
    return await getTopoLayouts();
  }),
  
  // 获取默认布局
  getDefaultLayout: publicProcedure.query(async () => {
    return await getDefaultTopoLayout();
  }),
  
  // 保存布局
  saveLayout: publicProcedure
    .input(z.object({
      name: z.string(),
      description: z.string().optional(),
      isDefault: z.boolean().optional(),
      layoutData: z.object({
        nodes: z.array(z.object({
          nodeId: z.string(),
          x: z.number(),
          y: z.number(),
        })),
        zoom: z.number(),
        panX: z.number(),
        panY: z.number(),
      }),
    }))
    .mutation(async ({ input }) => {
      return await createTopoLayout({
        name: input.name,
        description: input.description,
        isDefault: input.isDefault || false,
        layoutData: input.layoutData,
      });
    }),
  
  // 更新布局
  updateLayout: publicProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      isDefault: z.boolean().optional(),
      layoutData: z.object({
        nodes: z.array(z.object({
          nodeId: z.string(),
          x: z.number(),
          y: z.number(),
        })),
        zoom: z.number(),
        panX: z.number(),
        panY: z.number(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, layoutData, ...rest } = input;
      const updateData: Partial<InsertTopoLayout> = { ...rest };
      if (layoutData) {
        updateData.layoutData = layoutData;
      }
      return await updateTopoLayout(id, updateData);
    }),
  
  // 删除布局
  deleteLayout: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteTopoLayout(input.id);
    }),
  
  // 获取完整拓扑数据（节点+连接）
  getTopology: publicProcedure.query(async () => {
    await initializeDefaultTopology();
    const nodes = await getTopoNodes();
    const edges = await getTopoEdges();
    return { nodes, edges };
  }),
  
  // 重置为默认拓扑
  resetToDefault: publicProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) return false;
    
    try {
      // 清空现有数据
      await db.delete(topoEdges).where(gte(topoEdges.id, 0));
      await db.delete(topoNodes).where(gte(topoNodes.id, 0));
      await db.delete(topoLayouts).where(gte(topoLayouts.id, 0));
      
      // 重新初始化
      return await initializeDefaultTopology();
    } catch (error) {
      console.error("[Topology] Failed to reset topology:", error);
      return false;
    }
  }),

  // 检查所有服务状态并更新拓扑
  checkServicesHealth: publicProcedure.mutation(async () => {
    const { checkAllServicesAndUpdateTopology } = await import('./healthCheck');
    return await checkAllServicesAndUpdateTopology();
  }),

  // 获取系统服务状态摘要
  getServicesSummary: publicProcedure.query(async () => {
    const { getSystemServicesSummary } = await import('./healthCheck');
    return await getSystemServicesSummary();
  }),

  // 获取拓扑状态快照（用于轮询检测变化）
  getTopologySnapshot: publicProcedure.query(async () => {
    await initializeDefaultTopology();
    const nodes = await getTopoNodes();
    const edges = await getTopoEdges();
    
    // 生成状态哈希，用于检测变化
    const stateHash = nodes.map(n => `${n.nodeId}:${n.status}`).sort().join('|');
    
    return {
      nodes,
      edges,
      stateHash,
      timestamp: new Date(),
    };
  }),
});
