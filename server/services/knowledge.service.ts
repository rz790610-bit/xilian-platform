import { z } from "zod";
import { publicProcedure, router } from "../core/trpc";
import { invokeLLM } from "../core/llm";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { createModuleLogger } from '../core/logger';
import {
  createKbCollection, getKbCollections, getKbCollectionByName, deleteKbCollection,
  createKbPoint, createKbPointsBatch, getKbPoints, deleteKbPoint,
  createKbDocument, getKbDocuments, updateKbDocumentStatus,
  createKgNode, createKgNodesBatch, getKgNodes, updateKgNodePosition, deleteKgNode,
  createKgEdge, createKgEdgesBatch, getKgEdges, deleteKgEdge,
  getKbStats, clearKbCollectionData
} from "../lib/db";
const log = createModuleLogger('knowledge');

// Qdrant 配置
const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const EMBEDDING_DIM = 384;

// 实体关系抽取 Prompt
const ENTITY_EXTRACTION_PROMPT = `你是一个专业的实体关系抽取助手。请从以下文本中提取实体和关系。

要求：
1. 识别文本中的关键实体（设备、部件、故障、概念、人物、组织等）
2. 识别实体之间的关系（属于、包含、导致、相关等）
3. 以JSON格式输出

输出格式：
{
  "entities": [
    { "name": "实体名称", "type": "entity|equipment|fault|concept|person|organization" }
  ],
  "relations": [
    { "source": "源实体", "target": "目标实体", "type": "belongs_to|contains|causes|related_to|instance_of", "label": "关系描述" }
  ]
}

文本内容：
`;

// 文档总结 Prompt
const SUMMARY_PROMPT = `请对以下文本进行总结，提取核心要点：

文本内容：
`;

// ============ 文档解析函数 ============

async function parsePDF(buffer: Buffer): Promise<string> {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text || "";
  } catch (error) {
    log.warn("PDF parsing failed:", error);
    throw new Error("PDF 解析失败");
  }
}

async function parseWord(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  } catch (error) {
    log.warn("Word parsing failed:", error);
    throw new Error("Word 文档解析失败");
  }
}

function parseCSV(content: string): string {
  const lines = content.split('\n');
  const headers = lines[0]?.split(',') || [];
  const rows = lines.slice(1);
  
  let text = `表格数据包含 ${rows.length} 行记录，字段包括：${headers.join('、')}。\n\n`;
  
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const values = rows[i].split(',');
    const rowText = headers.map((h, idx) => `${h}: ${values[idx] || ''}`).join(', ');
    text += `记录 ${i + 1}: ${rowText}\n`;
  }
  
  return text;
}

// ============ Qdrant 向量数据库操作 ============

function simpleEmbed(text: string): number[] {
  const words = text.toLowerCase().split(/\s+/);
  const vector = new Array(EMBEDDING_DIM).fill(0);
  
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(i);
      hash = hash & hash;
    }
    const idx = Math.abs(hash) % EMBEDDING_DIM;
    vector[idx] += 1;
  }
  
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map(v => v / norm);
}

async function checkQdrantConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${QDRANT_URL}/collections`);
    return response.ok;
  } catch {
    return false;
  }
}

async function createQdrantCollection(name: string): Promise<boolean> {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: { size: EMBEDDING_DIM, distance: 'Cosine' }
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function upsertToQdrant(
  collection: string,
  points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>
): Promise<boolean> {
  try {
    await createQdrantCollection(collection);
    
    const response = await fetch(`${QDRANT_URL}/collections/${collection}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: points.map((p, idx) => ({
          id: idx + Date.now(),
          vector: p.vector,
          payload: p.payload
        }))
      })
    });
    return response.ok;
  } catch (error) {
    log.warn("Qdrant upsert failed:", error);
    return false;
  }
}

async function searchQdrant(
  collection: string,
  vector: number[],
  limit: number = 5
): Promise<Array<{ id: number; score: number; payload: Record<string, unknown> }>> {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${collection}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector, limit, with_payload: true })
    });
    
    if (!response.ok) return [];
    const data = await response.json();
    return data.result || [];
  } catch {
    return [];
  }
}

// ============ 知识库路由 ============

export const knowledgeRouter = router({
  // 集合管理
  createCollection: publicProcedure
    .input(z.object({
      name: z.string(),
      description: z.string().optional()
    }))
    .mutation(async ({ input }) => {
      const collection = await createKbCollection({
        name: input.name,
        description: input.description || null
      });
      return collection;
    }),

  listCollections: publicProcedure.query(async () => {
    return await getKbCollections();
  }),

  getCollection: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ input }) => {
      return await getKbCollectionByName(input.name);
    }),

  deleteCollection: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteKbCollection(input.id);
    }),

  // 知识点管理
  list: publicProcedure
    .input(z.object({
      collectionId: z.number(),
      category: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().default(100)
    }))
    .query(async ({ input }) => {
      return await getKbPoints(input.collectionId, {
        category: input.category,
        search: input.search,
        limit: input.limit
      });
    }),

  add: publicProcedure
    .input(z.object({
      collectionId: z.number(),
      title: z.string(),
      content: z.string(),
      category: z.string().default("general"),
      tags: z.array(z.string()).optional(),
      source: z.string().optional()
    }))
    .mutation(async ({ input }) => {
      const point = await createKbPoint({
        collectionId: input.collectionId,
        title: input.title,
        content: input.content,
        category: input.category,
        tags: input.tags || [],
        source: input.source || null
      });
      return point;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteKbPoint(input.id);
    }),

  // 文档处理
  parseDocument: publicProcedure
    .input(z.object({
      content: z.string(),
      filename: z.string(),
      mimeType: z.string()
    }))
    .mutation(async ({ input }) => {
      let text = "";
      const buffer = Buffer.from(input.content, 'base64');
      
      if (input.mimeType === 'application/pdf') {
        text = await parsePDF(buffer);
      } else if (input.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                 input.mimeType === 'application/msword') {
        text = await parseWord(buffer);
      } else if (input.mimeType === 'text/csv' || input.mimeType === 'application/vnd.ms-excel') {
        text = parseCSV(buffer.toString('utf-8'));
      } else {
        text = buffer.toString('utf-8');
      }
      
      return { text, filename: input.filename };
    }),

  // 处理并存储文档
  processDocument: publicProcedure
    .input(z.object({
      collectionId: z.number(),
      content: z.string(),
      filename: z.string(),
      mimeType: z.string(),
      extractEntities: z.boolean().default(true)
    }))
    .mutation(async ({ input }) => {
      // 创建文档记录
      const doc = await createKbDocument({
        collectionId: input.collectionId,
        filename: input.filename,
        mimeType: input.mimeType,
        fileSize: input.content.length,
        status: 'processing'
      });
      
      if (!doc) {
        throw new Error("Failed to create document record");
      }
      
      try {
        // 解析文档
        let text = "";
        const buffer = Buffer.from(input.content, 'base64');
        
        if (input.mimeType === 'application/pdf') {
          text = await parsePDF(buffer);
        } else if (input.mimeType.includes('word')) {
          text = await parseWord(buffer);
        } else if (input.mimeType === 'text/csv') {
          text = parseCSV(buffer.toString('utf-8'));
        } else {
          text = buffer.toString('utf-8');
        }
        
        // 分块
        const chunks = text.match(/[^。！？\n]+[。！？\n]?/g) || [text];
        const validChunks = chunks.filter(c => c.trim().length > 10);
        
        // 提取实体关系
        let entities: Array<{ name: string; type: string }> = [];
        let relations: Array<{ source: string; target: string; type: string; label: string }> = [];
        
        if (input.extractEntities && text.length > 0) {
          try {
            const response = await invokeLLM({
              messages: [
                { role: "system", content: "你是一个专业的实体关系抽取助手，请严格按照JSON格式输出。" },
                { role: "user", content: ENTITY_EXTRACTION_PROMPT + text.slice(0, 3000) }
              ]
            });
            
            const msgContent = response.choices[0]?.message?.content;
            const responseText = typeof msgContent === 'string' ? msgContent : '';
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              entities = parsed.entities || [];
              relations = parsed.relations || [];
            }
          } catch (e) {
            log.warn("Entity extraction failed:", e);
          }
        }
        
        // 创建知识点
        const pointsToCreate = validChunks.slice(0, 50).map((chunk, idx) => ({
          collectionId: input.collectionId,
          title: `${input.filename} - 片段 ${idx + 1}`,
          content: chunk.trim(),
          category: 'document',
          tags: [] as string[],
          source: input.filename,
          entities: entities.map(e => e.name),
          relations: relations
        }));
        
        const createdCount = await createKbPointsBatch(pointsToCreate);
        
        // 向量化存储到 Qdrant
        const qdrantPoints = validChunks.slice(0, 50).map((chunk, idx) => ({
          id: `${doc.id}-${idx}`,
          vector: simpleEmbed(chunk),
          payload: {
            title: `${input.filename} - 片段 ${idx + 1}`,
            content: chunk.trim(),
            source: input.filename,
            category: 'document'
          }
        }));
        
        await upsertToQdrant(`kb_${input.collectionId}`, qdrantPoints);
        
        // 创建图谱节点和边
        const nodeMap = new Map<string, boolean>();
        const nodesToCreate: Array<{
          collectionId: number;
          nodeId: string;
          label: string;
          type: string;
        }> = [];
        const edgesToCreate: Array<{
          collectionId: number;
          edgeId: string;
          sourceNodeId: string;
          targetNodeId: string;
          label: string;
          type: string;
        }> = [];
        
        for (const entity of entities) {
          const nodeId = `entity-${entity.name}`;
          if (!nodeMap.has(nodeId)) {
            nodeMap.set(nodeId, true);
            nodesToCreate.push({
              collectionId: input.collectionId,
              nodeId,
              label: entity.name,
              type: entity.type || 'entity'
            });
          }
        }
        
        for (const rel of relations) {
          const sourceId = `entity-${rel.source}`;
          const targetId = `entity-${rel.target}`;
          const edgeId = `edge-${rel.source}-${rel.target}-${rel.type}`;
          
          if (!nodeMap.has(sourceId)) {
            nodeMap.set(sourceId, true);
            nodesToCreate.push({
              collectionId: input.collectionId,
              nodeId: sourceId,
              label: rel.source,
              type: 'entity'
            });
          }
          if (!nodeMap.has(targetId)) {
            nodeMap.set(targetId, true);
            nodesToCreate.push({
              collectionId: input.collectionId,
              nodeId: targetId,
              label: rel.target,
              type: 'entity'
            });
          }
          
          edgesToCreate.push({
            collectionId: input.collectionId,
            edgeId,
            sourceNodeId: sourceId,
            targetNodeId: targetId,
            label: rel.label || rel.type,
            type: rel.type
          });
        }
        
        await createKgNodesBatch(nodesToCreate);
        await createKgEdgesBatch(edgesToCreate);
        
        // 更新文档状态
        await updateKbDocumentStatus(doc.id, 'completed', {
          chunksCount: createdCount,
          entitiesCount: entities.length
        });
        
        return {
          success: true,
          documentId: doc.id,
          chunks: createdCount,
          entities: entities.length,
          relations: relations.length
        };
      } catch (error) {
        await updateKbDocumentStatus(doc.id, 'failed');
        throw error;
      }
    }),

  // 实体关系抽取
  extractEntities: publicProcedure
    .input(z.object({ text: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "你是一个专业的实体关系抽取助手，请严格按照JSON格式输出。" },
            { role: "user", content: ENTITY_EXTRACTION_PROMPT + input.text }
          ]
        });
        
        const msgContent = response.choices[0]?.message?.content;
        const responseText = typeof msgContent === 'string' ? msgContent : '';
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        return { entities: [], relations: [] };
      } catch (error) {
        log.warn("Entity extraction failed:", error);
        return { entities: [], relations: [], error: String(error) };
      }
    }),

  // 文档总结
  summarize: publicProcedure
    .input(z.object({
      text: z.string(),
      maxLength: z.number().default(500)
    }))
    .mutation(async ({ input }) => {
      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: `你是一个专业的文档总结助手，请用不超过${input.maxLength}字总结文档要点。` },
            { role: "user", content: SUMMARY_PROMPT + input.text }
          ]
        });
        
        const msgContent = response.choices[0]?.message?.content;
        return { summary: typeof msgContent === 'string' ? msgContent : '' };
      } catch (error) {
        log.warn("Summarization failed:", error);
        return { summary: "", error: String(error) };
      }
    }),

  // RAG 语义检索
  search: publicProcedure
    .input(z.object({
      query: z.string(),
      collectionId: z.number(),
      limit: z.number().default(5),
      useVector: z.boolean().default(true)
    }))
    .query(async ({ input }) => {
      if (input.useVector) {
        const queryVector = simpleEmbed(input.query);
        const qdrantResults = await searchQdrant(`kb_${input.collectionId}`, queryVector, input.limit);
        
        if (qdrantResults.length > 0) {
          return qdrantResults.map(r => ({
            id: r.id,
            title: String(r.payload.title || ''),
            content: String(r.payload.content || ''),
            category: String(r.payload.category || ''),
            source: String(r.payload.source || ''),
            score: r.score
          }));
        }
      }
      
      // 回退到数据库搜索
      const points = await getKbPoints(input.collectionId, {
        search: input.query,
        limit: input.limit
      });
      
      return points.map(p => ({
        id: p.id,
        title: p.title,
        content: p.content,
        category: p.category,
        source: p.source || '',
        score: 1
      }));
    }),

  // 获取图谱数据
  getGraph: publicProcedure
    .input(z.object({ collectionId: z.number() }))
    .query(async ({ input }) => {
      const nodes = await getKgNodes(input.collectionId);
      const edges = await getKgEdges(input.collectionId);
      
      return {
        nodes: nodes.map(n => ({
          id: n.nodeId,
          label: n.label,
          type: n.type,
          properties: n.properties,
          x: n.x,
          y: n.y,
          dbId: n.id
        })),
        edges: edges.map(e => ({
          id: e.edgeId,
          source: e.sourceNodeId,
          target: e.targetNodeId,
          label: e.label,
          type: e.type,
          dbId: e.id
        }))
      };
    }),

  // 保存图谱节点位置
  saveNodePosition: publicProcedure
    .input(z.object({
      id: z.number(),
      x: z.number(),
      y: z.number()
    }))
    .mutation(async ({ input }) => {
      return await updateKgNodePosition(input.id, input.x, input.y);
    }),

  // 添加图谱节点
  addNode: publicProcedure
    .input(z.object({
      collectionId: z.number(),
      label: z.string(),
      type: z.string().default("entity"),
      properties: z.record(z.string(), z.unknown()).optional()
    }))
    .mutation(async ({ input }) => {
      const nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const node = await createKgNode({
        collectionId: input.collectionId,
        nodeId,
        label: input.label,
        type: input.type,
        properties: input.properties
      });
      return node;
    }),

  // 添加图谱边
  addEdge: publicProcedure
    .input(z.object({
      collectionId: z.number(),
      source: z.string(),
      target: z.string(),
      label: z.string(),
      type: z.string().default("related_to")
    }))
    .mutation(async ({ input }) => {
      const edgeId = `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const edge = await createKgEdge({
        collectionId: input.collectionId,
        edgeId,
        sourceNodeId: input.source,
        targetNodeId: input.target,
        label: input.label,
        type: input.type
      });
      return edge;
    }),

  // 删除图谱节点
  deleteNode: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteKgNode(input.id);
    }),

  // 删除图谱边
  deleteEdge: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteKgEdge(input.id);
    }),

  // 获取统计信息
  stats: publicProcedure
    .input(z.object({ collectionId: z.number() }))
    .query(async ({ input }) => {
      return await getKbStats(input.collectionId);
    }),

  // 获取文档列表
  documents: publicProcedure
    .input(z.object({ collectionId: z.number() }))
    .query(async ({ input }) => {
      return await getKbDocuments(input.collectionId);
    }),

  // 清空集合数据
  clearCollection: publicProcedure
    .input(z.object({ collectionId: z.number() }))
    .mutation(async ({ input }) => {
      return await clearKbCollectionData(input.collectionId);
    }),

  // 获取知识点列表（带完整内容，用于AI对话选择）
  listKnowledgePoints: publicProcedure
    .input(z.object({
      page: z.number().default(1),
      pageSize: z.number().default(100)
    }))
    .query(async ({ input }) => {
      // 获取所有集合
      const collections = await getKbCollections();
      const allPoints: Array<{id: number; title: string; content: string; fileType: string; collectionName: string}> = [];
      
      for (const col of collections) {
        const points = await getKbPoints(col.id, { limit: input.pageSize });
        for (const point of points) {
          allPoints.push({
            id: point.id,
            title: point.title,
            content: point.content,
            fileType: point.category || 'text',
            collectionName: col.name
          });
        }
      }
      
      // 分页
      const start = (input.page - 1) * input.pageSize;
      const end = start + input.pageSize;
      const paginatedPoints = allPoints.slice(start, end);
      
      return {
        documents: paginatedPoints,
        total: allPoints.length,
        page: input.page,
        pageSize: input.pageSize
      };
    }),

  // 检查 Qdrant 状态
  qdrantStatus: publicProcedure.query(async () => {
    const connected = await checkQdrantConnection();
    return { connected, url: QDRANT_URL };
  })
});
