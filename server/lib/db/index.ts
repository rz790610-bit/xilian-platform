import { eq, and, like, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users,
  kbCollections, kbPoints, kbDocuments,
  kgNodes, kgEdges,
  InsertKbCollection, InsertKbPoint, InsertKbDocument,
  InsertKgNode, InsertKgEdge,
  KbCollection, KbPoint, KbDocument, KgNode, KgEdge
} from "../../../drizzle/schema";
import { ENV } from '../../core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ 知识库集合操作 ============

export async function createKbCollection(data: InsertKbCollection): Promise<KbCollection | null> {
  const db = await getDb();
  if (!db) return null;
  
  try {
    await db.insert(kbCollections).values(data);
    const result = await db.select().from(kbCollections).where(eq(kbCollections.name, data.name)).limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Database] Failed to create collection:", error);
    return null;
  }
}

export async function getKbCollections(): Promise<KbCollection[]> {
  const db = await getDb();
  if (!db) return [];
  
  try {
    return await db.select().from(kbCollections).orderBy(desc(kbCollections.createdAt));
  } catch (error) {
    console.error("[Database] Failed to get collections:", error);
    return [];
  }
}

export async function getKbCollectionByName(name: string): Promise<KbCollection | null> {
  const db = await getDb();
  if (!db) return null;
  
  try {
    const result = await db.select().from(kbCollections).where(eq(kbCollections.name, name)).limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Database] Failed to get collection:", error);
    return null;
  }
}

export async function deleteKbCollection(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    // 删除相关的知识点、文档、图谱数据
    const collection = await db.select().from(kbCollections).where(eq(kbCollections.id, id)).limit(1);
    if (collection[0]) {
      await db.delete(kbPoints).where(eq(kbPoints.collectionId, id));
      await db.delete(kbDocuments).where(eq(kbDocuments.collectionId, id));
      await db.delete(kgNodes).where(eq(kgNodes.collectionId, id));
      await db.delete(kgEdges).where(eq(kgEdges.collectionId, id));
      await db.delete(kbCollections).where(eq(kbCollections.id, id));
    }
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete collection:", error);
    return false;
  }
}

// ============ 知识点操作 ============

export async function createKbPoint(data: InsertKbPoint): Promise<KbPoint | null> {
  const db = await getDb();
  if (!db) return null;
  
  try {
    const result = await db.insert(kbPoints).values(data);
    const insertId = result[0].insertId;
    const point = await db.select().from(kbPoints).where(eq(kbPoints.id, insertId)).limit(1);
    return point[0] || null;
  } catch (error) {
    console.error("[Database] Failed to create knowledge point:", error);
    return null;
  }
}

export async function createKbPointsBatch(points: InsertKbPoint[]): Promise<number> {
  const db = await getDb();
  if (!db || points.length === 0) return 0;
  
  try {
    await db.insert(kbPoints).values(points);
    return points.length;
  } catch (error) {
    console.error("[Database] Failed to batch create knowledge points:", error);
    return 0;
  }
}

export async function getKbPoints(
  collectionId: number,
  options?: { category?: string; search?: string; limit?: number }
): Promise<KbPoint[]> {
  const db = await getDb();
  if (!db) return [];
  
  try {
    let query = db.select().from(kbPoints).where(eq(kbPoints.collectionId, collectionId));
    
    if (options?.category) {
      query = db.select().from(kbPoints).where(
        and(eq(kbPoints.collectionId, collectionId), eq(kbPoints.category, options.category))
      );
    }
    
    if (options?.search) {
      query = db.select().from(kbPoints).where(
        and(
          eq(kbPoints.collectionId, collectionId),
          sql`(${kbPoints.title} LIKE ${`%${options.search}%`} OR ${kbPoints.content} LIKE ${`%${options.search}%`})`
        )
      );
    }
    
    const results = await query.orderBy(desc(kbPoints.createdAt)).limit(options?.limit || 100);
    return results;
  } catch (error) {
    console.error("[Database] Failed to get knowledge points:", error);
    return [];
  }
}

export async function deleteKbPoint(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    await db.delete(kbPoints).where(eq(kbPoints.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete knowledge point:", error);
    return false;
  }
}

// ============ 文档操作 ============

export async function createKbDocument(data: InsertKbDocument): Promise<KbDocument | null> {
  const db = await getDb();
  if (!db) return null;
  
  try {
    const result = await db.insert(kbDocuments).values(data);
    const insertId = result[0].insertId;
    const doc = await db.select().from(kbDocuments).where(eq(kbDocuments.id, insertId)).limit(1);
    return doc[0] || null;
  } catch (error) {
    console.error("[Database] Failed to create document:", error);
    return null;
  }
}

export async function getKbDocuments(collectionId: number): Promise<KbDocument[]> {
  const db = await getDb();
  if (!db) return [];
  
  try {
    return await db.select().from(kbDocuments)
      .where(eq(kbDocuments.collectionId, collectionId))
      .orderBy(desc(kbDocuments.createdAt));
  } catch (error) {
    console.error("[Database] Failed to get documents:", error);
    return [];
  }
}

export async function updateKbDocumentStatus(
  id: number, 
  status: 'pending' | 'processing' | 'completed' | 'failed',
  extra?: { chunksCount?: number; entitiesCount?: number }
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    const updateData: Record<string, unknown> = { status };
    if (status === 'completed') {
      updateData.processedAt = new Date();
    }
    if (extra?.chunksCount !== undefined) {
      updateData.chunksCount = extra.chunksCount;
    }
    if (extra?.entitiesCount !== undefined) {
      updateData.entitiesCount = extra.entitiesCount;
    }
    
    await db.update(kbDocuments).set(updateData).where(eq(kbDocuments.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update document status:", error);
    return false;
  }
}

// ============ 知识图谱节点操作 ============

export async function createKgNode(data: InsertKgNode): Promise<KgNode | null> {
  const db = await getDb();
  if (!db) return null;
  
  try {
    const result = await db.insert(kgNodes).values(data);
    const insertId = result[0].insertId;
    const node = await db.select().from(kgNodes).where(eq(kgNodes.id, insertId)).limit(1);
    return node[0] || null;
  } catch (error) {
    console.error("[Database] Failed to create graph node:", error);
    return null;
  }
}

export async function createKgNodesBatch(nodes: InsertKgNode[]): Promise<number> {
  const db = await getDb();
  if (!db || nodes.length === 0) return 0;
  
  try {
    await db.insert(kgNodes).values(nodes);
    return nodes.length;
  } catch (error) {
    console.error("[Database] Failed to batch create graph nodes:", error);
    return 0;
  }
}

export async function getKgNodes(collectionId: number): Promise<KgNode[]> {
  const db = await getDb();
  if (!db) return [];
  
  try {
    return await db.select().from(kgNodes).where(eq(kgNodes.collectionId, collectionId));
  } catch (error) {
    console.error("[Database] Failed to get graph nodes:", error);
    return [];
  }
}

export async function updateKgNodePosition(id: number, x: number, y: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    await db.update(kgNodes).set({ x, y }).where(eq(kgNodes.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update node position:", error);
    return false;
  }
}

export async function deleteKgNode(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    const node = await db.select().from(kgNodes).where(eq(kgNodes.id, id)).limit(1);
    if (node[0]) {
      // 删除相关的边
      await db.delete(kgEdges).where(
        sql`${kgEdges.sourceNodeId} = ${node[0].nodeId} OR ${kgEdges.targetNodeId} = ${node[0].nodeId}`
      );
      await db.delete(kgNodes).where(eq(kgNodes.id, id));
    }
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete graph node:", error);
    return false;
  }
}

// ============ 知识图谱边操作 ============

export async function createKgEdge(data: InsertKgEdge): Promise<KgEdge | null> {
  const db = await getDb();
  if (!db) return null;
  
  try {
    const result = await db.insert(kgEdges).values(data);
    const insertId = result[0].insertId;
    const edge = await db.select().from(kgEdges).where(eq(kgEdges.id, insertId)).limit(1);
    return edge[0] || null;
  } catch (error) {
    console.error("[Database] Failed to create graph edge:", error);
    return null;
  }
}

export async function createKgEdgesBatch(edges: InsertKgEdge[]): Promise<number> {
  const db = await getDb();
  if (!db || edges.length === 0) return 0;
  
  try {
    await db.insert(kgEdges).values(edges);
    return edges.length;
  } catch (error) {
    console.error("[Database] Failed to batch create graph edges:", error);
    return 0;
  }
}

export async function getKgEdges(collectionId: number): Promise<KgEdge[]> {
  const db = await getDb();
  if (!db) return [];
  
  try {
    return await db.select().from(kgEdges).where(eq(kgEdges.collectionId, collectionId));
  } catch (error) {
    console.error("[Database] Failed to get graph edges:", error);
    return [];
  }
}

export async function deleteKgEdge(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    await db.delete(kgEdges).where(eq(kgEdges.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete graph edge:", error);
    return false;
  }
}

// ============ 统计查询 ============

export async function getKbStats(collectionId: number): Promise<{
  pointsCount: number;
  documentsCount: number;
  nodesCount: number;
  edgesCount: number;
  categories: string[];
}> {
  const db = await getDb();
  if (!db) return { pointsCount: 0, documentsCount: 0, nodesCount: 0, edgesCount: 0, categories: [] };
  
  try {
    const points = await db.select({ count: sql<number>`count(*)` }).from(kbPoints).where(eq(kbPoints.collectionId, collectionId));
    const docs = await db.select({ count: sql<number>`count(*)` }).from(kbDocuments).where(eq(kbDocuments.collectionId, collectionId));
    const nodes = await db.select({ count: sql<number>`count(*)` }).from(kgNodes).where(eq(kgNodes.collectionId, collectionId));
    const edges = await db.select({ count: sql<number>`count(*)` }).from(kgEdges).where(eq(kgEdges.collectionId, collectionId));
    const categories = await db.selectDistinct({ category: kbPoints.category }).from(kbPoints).where(eq(kbPoints.collectionId, collectionId));
    
    return {
      pointsCount: Number(points[0]?.count || 0),
      documentsCount: Number(docs[0]?.count || 0),
      nodesCount: Number(nodes[0]?.count || 0),
      edgesCount: Number(edges[0]?.count || 0),
      categories: categories.map(c => c.category)
    };
  } catch (error) {
    console.error("[Database] Failed to get stats:", error);
    return { pointsCount: 0, documentsCount: 0, nodesCount: 0, edgesCount: 0, categories: [] };
  }
}

// ============ 清空集合数据 ============

export async function clearKbCollectionData(collectionId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    await db.delete(kbPoints).where(eq(kbPoints.collectionId, collectionId));
    await db.delete(kbDocuments).where(eq(kbDocuments.collectionId, collectionId));
    await db.delete(kgNodes).where(eq(kgNodes.collectionId, collectionId));
    await db.delete(kgEdges).where(eq(kgEdges.collectionId, collectionId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to clear collection data:", error);
    return false;
  }
}
