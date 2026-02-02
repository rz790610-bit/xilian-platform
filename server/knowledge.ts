import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";

// 知识点类型
interface KnowledgePoint {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  source?: string;
  entities?: string[];
  relations?: Array<{ source: string; target: string; type: string }>;
  createdAt: string;
  updatedAt: string;
}

// 内存存储（生产环境应使用数据库）
const knowledgeStore: Map<string, KnowledgePoint[]> = new Map();

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

// 知识库路由
export const knowledgeRouter = router({
  // 获取所有知识点
  list: publicProcedure
    .input(z.object({
      collection: z.string().default("default"),
      category: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().default(100)
    }))
    .query(({ input }) => {
      const points = knowledgeStore.get(input.collection) || [];
      let filtered = points;
      
      if (input.category) {
        filtered = filtered.filter(p => p.category === input.category);
      }
      
      if (input.search) {
        const searchLower = input.search.toLowerCase();
        filtered = filtered.filter(p => 
          p.title.toLowerCase().includes(searchLower) ||
          p.content.toLowerCase().includes(searchLower) ||
          p.tags.some(t => t.toLowerCase().includes(searchLower))
        );
      }
      
      return filtered.slice(0, input.limit);
    }),

  // 添加知识点
  add: publicProcedure
    .input(z.object({
      collection: z.string().default("default"),
      title: z.string(),
      content: z.string(),
      category: z.string().default("general"),
      tags: z.array(z.string()).default([]),
      source: z.string().optional()
    }))
    .mutation(({ input }) => {
      const point: KnowledgePoint = {
        id: `kp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: input.title,
        content: input.content,
        category: input.category,
        tags: input.tags,
        source: input.source,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const points = knowledgeStore.get(input.collection) || [];
      points.push(point);
      knowledgeStore.set(input.collection, points);
      
      return point;
    }),

  // 删除知识点
  delete: publicProcedure
    .input(z.object({
      collection: z.string().default("default"),
      id: z.string()
    }))
    .mutation(({ input }) => {
      const points = knowledgeStore.get(input.collection) || [];
      const filtered = points.filter(p => p.id !== input.id);
      knowledgeStore.set(input.collection, filtered);
      return { success: true };
    }),

  // 处理文档 - 提取文本、分块、实体抽取
  processDocument: publicProcedure
    .input(z.object({
      filename: z.string(),
      content: z.string(),
      collection: z.string().default("default")
    }))
    .mutation(async ({ input }) => {
      const { filename, content, collection } = input;
      
      // 1. 分块处理
      const chunks = content.match(/[^。！？\n]+[。！？\n]?/g) || [content];
      const validChunks = chunks.filter(c => c.trim().length > 10);
      
      // 2. 实体关系抽取（使用 LLM）
      let entities: Array<{ name: string; type: string }> = [];
      let relations: Array<{ source: string; target: string; type: string; label: string }> = [];
      
      try {
        // 取前2000字符进行实体抽取
        const textForExtraction = content.slice(0, 2000);
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "你是一个专业的实体关系抽取助手，请严格按照JSON格式输出。" },
            { role: "user", content: ENTITY_EXTRACTION_PROMPT + textForExtraction }
          ]
        });
        
        const msgContent = response.choices[0]?.message?.content;
        const responseText = typeof msgContent === 'string' ? msgContent : '';
        // 尝试解析 JSON
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          entities = parsed.entities || [];
          relations = parsed.relations || [];
        }
      } catch (error) {
        console.error("Entity extraction failed:", error);
        // 使用简单规则提取
        const entityPatterns = [
          /【(.+?)】/g,
          /《(.+?)》/g,
          /"(.+?)"/g,
          /设备[：:]\s*(.+?)(?=[，,。\n]|$)/g,
          /型号[：:]\s*(.+?)(?=[，,。\n]|$)/g
        ];
        
        const entitySet = new Set<string>();
        for (const pattern of entityPatterns) {
          const matches = Array.from(content.matchAll(pattern));
          for (const match of matches) {
            if (match[1] && match[1].length < 50) {
              entitySet.add(match[1].trim());
            }
          }
        }
        entities = Array.from(entitySet).map(name => ({ name, type: "entity" }));
      }
      
      // 3. 存储知识点
      const points = knowledgeStore.get(collection) || [];
      
      for (let i = 0; i < validChunks.length; i++) {
        const point: KnowledgePoint = {
          id: `kp-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
          title: `${filename} - 片段 ${i + 1}`,
          content: validChunks[i],
          category: filename.split('.').pop() || 'text',
          tags: [filename.split('.').pop() || 'text', 'document'],
          source: filename,
          entities: entities.map(e => e.name),
          relations: relations,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        points.push(point);
      }
      
      knowledgeStore.set(collection, points);
      
      return {
        success: true,
        chunks: validChunks.length,
        entities: entities.length,
        relations: relations.length
      };
    }),

  // 实体关系抽取
  extractEntities: publicProcedure
    .input(z.object({
      text: z.string()
    }))
    .mutation(async ({ input }) => {
      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "你是一个专业的实体关系抽取助手，请严格按照JSON格式输出。" },
            { role: "user", content: ENTITY_EXTRACTION_PROMPT + input.text }
          ]
        });
        
        const messageContent = response.choices[0]?.message?.content;
        const responseText = typeof messageContent === 'string' ? messageContent : '';
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        return { entities: [], relations: [] };
      } catch (error) {
        console.error("Entity extraction failed:", error);
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
        
        return {
          summary: response.choices[0]?.message?.content || ""
        };
      } catch (error) {
        console.error("Summarization failed:", error);
        return { summary: "", error: String(error) };
      }
    }),

  // RAG 检索
  search: publicProcedure
    .input(z.object({
      query: z.string(),
      collection: z.string().default("default"),
      limit: z.number().default(5)
    }))
    .query(({ input }) => {
      const points = knowledgeStore.get(input.collection) || [];
      const queryLower = input.query.toLowerCase();
      
      // 简单的关键词匹配（生产环境应使用向量检索）
      const scored = points.map(point => {
        let score = 0;
        const contentLower = point.content.toLowerCase();
        const titleLower = point.title.toLowerCase();
        
        // 标题匹配权重更高
        if (titleLower.includes(queryLower)) score += 10;
        if (contentLower.includes(queryLower)) score += 5;
        
        // 关键词匹配
        const keywords = queryLower.split(/\s+/);
        for (const keyword of keywords) {
          if (titleLower.includes(keyword)) score += 3;
          if (contentLower.includes(keyword)) score += 1;
          if (point.tags.some(t => t.toLowerCase().includes(keyword))) score += 2;
        }
        
        return { point, score };
      });
      
      return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, input.limit)
        .map(s => s.point);
    }),

  // 获取图谱数据
  getGraph: publicProcedure
    .input(z.object({
      collection: z.string().default("default")
    }))
    .query(({ input }) => {
      const points = knowledgeStore.get(input.collection) || [];
      
      // 构建图谱节点和边
      const nodeMap = new Map<string, { id: string; label: string; type: string }>();
      const edges: Array<{ id: string; source: string; target: string; label: string; type: string }> = [];
      
      for (const point of points) {
        // 添加文档节点
        if (point.source && !nodeMap.has(point.source)) {
          nodeMap.set(point.source, {
            id: `doc-${point.source}`,
            label: point.source,
            type: 'document'
          });
        }
        
        // 添加实体节点
        if (point.entities) {
          for (const entity of point.entities) {
            if (!nodeMap.has(entity)) {
              nodeMap.set(entity, {
                id: `entity-${entity}`,
                label: entity,
                type: 'entity'
              });
            }
            
            // 添加文档-实体关系
            if (point.source) {
              edges.push({
                id: `edge-${point.source}-${entity}`,
                source: `doc-${point.source}`,
                target: `entity-${entity}`,
                label: '包含',
                type: 'contains'
              });
            }
          }
        }
        
        // 添加关系边
        if (point.relations) {
          for (const rel of point.relations) {
            if (!nodeMap.has(rel.source)) {
              nodeMap.set(rel.source, {
                id: `entity-${rel.source}`,
                label: rel.source,
                type: 'entity'
              });
            }
            if (!nodeMap.has(rel.target)) {
              nodeMap.set(rel.target, {
                id: `entity-${rel.target}`,
                label: rel.target,
                type: 'entity'
              });
            }
            
            edges.push({
              id: `edge-${rel.source}-${rel.target}-${rel.type}`,
              source: `entity-${rel.source}`,
              target: `entity-${rel.target}`,
              label: rel.type,
              type: rel.type
            });
          }
        }
      }
      
      return {
        nodes: Array.from(nodeMap.values()),
        edges: edges
      };
    }),

  // 获取统计信息
  stats: publicProcedure
    .input(z.object({
      collection: z.string().default("default")
    }))
    .query(({ input }) => {
      const points = knowledgeStore.get(input.collection) || [];
      
      const entitySet = new Set<string>();
      let relationCount = 0;
      
      for (const point of points) {
        if (point.entities) {
          point.entities.forEach(e => entitySet.add(e));
        }
        if (point.relations) {
          relationCount += point.relations.length;
        }
      }
      
      return {
        totalPoints: points.length,
        totalEntities: entitySet.size,
        totalRelations: relationCount,
        categories: Array.from(new Set(points.map(p => p.category)))
      };
    })
});
