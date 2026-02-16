/**
 * 大模型管理服务
 * 提供模型管理、Ollama 集成、对话、微调、评估等功能
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../core/trpc";
import { getDb } from "../lib/db";
import { 

  models, 
  modelConversations, 
  modelMessages, 
  modelFineTuneTasks, 
  modelEvaluations,
  modelUsageLogs 
} from "../../drizzle/schema";
import { eq, desc, and, sql, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createModuleLogger } from '../core/logger';
const log = createModuleLogger('model');

// Ollama API 配置
const OLLAMA_BASE_URL = process.env.OLLAMA_URL || "http://localhost:11434";

// 获取数据库实例
async function getDbInstance() {
  const instance = await getDb();
  if (!instance) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  }
  return instance;
}

// 生成唯一 ID
function generateId(prefix: string = ""): string {
  return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============ Ollama API 调用函数 ============

/**
 * 获取 Ollama 模型列表
 */
async function getOllamaModels(): Promise<Array<{
  name: string;
  size: number;
  digest: string;
  modified_at: string;
  details: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}>> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }
    const data = await response.json();
    return data.models || [];
  } catch (error) {
    log.error("[ModelService] Failed to get Ollama models:", error);
    return [];
  }
}

/**
 * 获取 Ollama 当前运行中的模型
 */
async function getOllamaRunningModels(): Promise<Array<{
  name: string;
  model: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
  expires_at: string;
  size_vram: number;
}>> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/ps`);
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }
    const data = await response.json();
    return data.models || [];
  } catch (error) {
    log.error("[ModelService] Failed to get Ollama running models:", error);
    return [];
  }
}

/**
 * 检查 Ollama 服务状态
 */
async function checkOllamaStatus(): Promise<{ online: boolean; version?: string }> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/version`);
    if (response.ok) {
      const data = await response.json();
      return { online: true, version: data.version };
    }
    return { online: false };
  } catch {
    return { online: false };
  }
}

/**
 * 拉取 Ollama 模型
 */
async function pullOllamaModel(modelName: string): Promise<AsyncGenerator<{
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}>> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: modelName, stream: true }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to pull model: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  async function* streamGenerator() {
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          try {
            yield JSON.parse(line);
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  return streamGenerator();
}

/**
 * 删除 Ollama 模型
 */
async function deleteOllamaModel(modelName: string): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 获取模型详情
 */
async function getOllamaModelInfo(modelName: string): Promise<{
  modelfile?: string;
  parameters?: string;
  template?: string;
  details?: Record<string, unknown>;
} | null> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName }),
    });
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 调用 Ollama 生成
 */
async function ollamaGenerate(params: {
  model: string;
  prompt: string;
  system?: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
  };
}): Promise<{
  response: string;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, stream: false }),
  });

  if (!response.ok) {
    throw new Error(`Ollama generate error: ${response.status}`);
  }

  return await response.json();
}

/**
 * 调用 Ollama 聊天
 */
async function ollamaChat(params: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
  };
}): Promise<{
  message: { role: string; content: string };
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, stream: false }),
  });

  if (!response.ok) {
    throw new Error(`Ollama chat error: ${response.status}`);
  }

  return await response.json();
}

/**
 * 调用 Ollama 嵌入
 */
async function ollamaEmbed(params: {
  model: string;
  input: string | string[];
}): Promise<{
  embeddings: number[][];
}> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Ollama embed error: ${response.status}`);
  }

  return await response.json();
}

// ============ 数据库操作函数 ============

/**
 * 同步 Ollama 模型到数据库
 */
async function syncOllamaModelsToDb(): Promise<number> {
  const ollamaModels = await getOllamaModels();
  const runningModels = await getOllamaRunningModels();
  let syncCount = 0;

  // 同步已下载的模型
  for (const model of ollamaModels) {
    const modelId = model.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const existing = await (await getDbInstance()).select().from(models).where(eq(models.modelId, modelId)).limit(1);

    const modelType = model.name.includes("embed") ? "embedding" : "llm";
    const sizeGB = (model.size / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    // 检查此模型是否正在运行
    const isRunning = runningModels.some(rm => rm.name === model.name || rm.model === model.name);

    if (existing.length === 0) {
      await (await getDbInstance()).insert(models).values({
        modelId,
        name: model.name,
        displayName: model.name,
        type: modelType,
        provider: "ollama",
        size: sizeGB,
        parameters: model.details?.parameter_size || null,
        quantization: model.details?.quantization_level || null,
        description: `${model.details?.family || "Unknown"} family model`,
        status: isRunning ? "loaded" : "available",
        capabilities: {
          chat: modelType === "llm",
          completion: modelType === "llm",
          embedding: modelType === "embedding",
        },
      });
      syncCount++;
    } else {
      await (await getDbInstance()).update(models)
        .set({
          status: isRunning ? "loaded" : "available",
          size: sizeGB,
          parameters: model.details?.parameter_size || existing[0].parameters,
          quantization: model.details?.quantization_level || existing[0].quantization,
        })
        .where(eq(models.modelId, modelId));
    }
  }

  // 同步运行中但不在已下载列表中的模型（如通过 ollama run 临时加载的大模型）
  const downloadedNames = new Set(ollamaModels.map(m => m.name));
  for (const rm of runningModels) {
    if (!downloadedNames.has(rm.name)) {
      const modelId = rm.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const existing = await (await getDbInstance()).select().from(models).where(eq(models.modelId, modelId)).limit(1);

      const modelType = rm.name.includes("embed") ? "embedding" : "llm";
      const sizeGB = (rm.size / (1024 * 1024 * 1024)).toFixed(2) + " GB";

      if (existing.length === 0) {
        await (await getDbInstance()).insert(models).values({
          modelId,
          name: rm.name,
          displayName: rm.name,
          type: modelType,
          provider: "ollama",
          size: sizeGB,
          parameters: rm.details?.parameter_size || null,
          quantization: rm.details?.quantization_level || null,
          description: `${rm.details?.family || "Unknown"} family model (running)`,
          status: "loaded",
          capabilities: {
            chat: modelType === "llm",
            completion: modelType === "llm",
            embedding: modelType === "embedding",
          },
        });
        syncCount++;
      } else {
        await (await getDbInstance()).update(models)
          .set({
            status: "loaded",
            size: sizeGB,
            parameters: rm.details?.parameter_size || existing[0].parameters,
            quantization: rm.details?.quantization_level || existing[0].quantization,
          })
          .where(eq(models.modelId, modelId));
      }
    }
  }

  return syncCount;
}

// ============ tRPC 路由 ============

export const modelRouter = router({
  // ============ 模型管理 ============

  /**
   * 获取 Ollama 服务状态
   */
  getOllamaStatus: publicProcedure.query(async () => {
    const status = await checkOllamaStatus();
    const ollamaModels = status.online ? await getOllamaModels() : [];
    const runningModels = status.online ? await getOllamaRunningModels() : [];
    return {
      ...status,
      modelCount: ollamaModels.length,
      models: ollamaModels.map(m => m.name),
      runningModels: runningModels.map(m => ({
        name: m.name,
        model: m.model,
        parameterSize: m.details?.parameter_size,
        quantization: m.details?.quantization_level,
        sizeVram: m.size_vram,
        expiresAt: m.expires_at,
      })),
      currentModel: runningModels.length > 0 ? runningModels[0].name : (ollamaModels.length > 0 ? ollamaModels[0].name : null),
    };
  }),

  /**
   * 获取模型列表
   */
  listModels: publicProcedure
    .input(z.object({
      type: z.enum(["all", "llm", "embedding", "label", "diagnostic", "vision", "audio"]).optional().default("all"),
      provider: z.enum(["all", "ollama", "openai", "anthropic", "local", "custom"]).optional().default("all"),
      status: z.enum(["all", "available", "loaded", "downloading", "error"]).optional().default("all"),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const filters = input || { type: "all" as const, provider: "all" as const, status: "all" as const };
      
      let query = (await getDbInstance()).select().from(models);
      
      const conditions = [];
      if (filters.type && filters.type !== "all") {
        conditions.push(eq(models.type, filters.type));
      }
      if (filters.provider && filters.provider !== "all") {
        conditions.push(eq(models.provider, filters.provider));
      }
      if (filters.status && filters.status !== "all") {
        conditions.push(eq(models.status, filters.status));
      }
      if (filters.search) {
        conditions.push(like(models.name, `%${filters.search}%`));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const result = await query.orderBy(desc(models.updatedAt));
      return result;
    }),

  /**
   * 获取单个模型详情
   */
  getModel: publicProcedure
    .input(z.object({ modelId: z.string() }))
    .query(async ({ input }) => {
      const [model] = await (await getDbInstance()).select().from(models).where(eq(models.modelId, input.modelId)).limit(1);
      if (!model) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Model not found" });
      }

      // 获取 Ollama 详细信息
      const ollamaInfo = await getOllamaModelInfo(model.name);
      
      return {
        ...model,
        ollamaInfo,
      };
    }),

  /**
   * 同步 Ollama 模型
   */
  syncOllamaModels: protectedProcedure.mutation(async () => {
    const syncCount = await syncOllamaModelsToDb();
    return { success: true, syncCount };
  }),

  /**
   * 拉取新模型
   */
  pullModel: protectedProcedure
    .input(z.object({ modelName: z.string() }))
    .mutation(async ({ input }) => {
      const modelId = input.modelName.replace(/[^a-zA-Z0-9._-]/g, "_");
      
      // 检查是否已存在
      const existing = await (await getDbInstance()).select().from(models).where(eq(models.modelId, modelId)).limit(1);
      
      if (existing.length === 0) {
        // 创建新记录
        await (await getDbInstance()).insert(models).values({
          modelId,
          name: input.modelName,
          displayName: input.modelName,
          type: input.modelName.includes("embed") ? "embedding" : "llm",
          provider: "ollama",
          status: "downloading",
          downloadProgress: 0,
        });
      } else {
        await (await getDbInstance()).update(models)
          .set({ status: "downloading", downloadProgress: 0 })
          .where(eq(models.modelId, modelId));
      }

      // 开始拉取（异步）
      (async () => {
        try {
          const stream = await pullOllamaModel(input.modelName);
          for await (const chunk of stream) {
            if (chunk.total && chunk.completed) {
              const progress = Math.round((chunk.completed / chunk.total) * 100);
              await (await getDbInstance()).update(models)
                .set({ downloadProgress: progress })
                .where(eq(models.modelId, modelId));
            }
          }
          
          // 完成后更新状态
          const ollamaModels = await getOllamaModels();
          const modelInfo = ollamaModels.find(m => m.name === input.modelName);
          
          await (await getDbInstance()).update(models)
            .set({
              status: "loaded",
              downloadProgress: 100,
              size: modelInfo ? `${(modelInfo.size / (1024 * 1024 * 1024)).toFixed(2)} GB` : null,
              parameters: modelInfo?.details?.parameter_size || null,
              quantization: modelInfo?.details?.quantization_level || null,
            })
            .where(eq(models.modelId, modelId));
        } catch (error) {
          await (await getDbInstance()).update(models)
            .set({ status: "error", downloadProgress: 0 })
            .where(eq(models.modelId, modelId));
        }
      })();

      return { success: true, modelId };
    }),

  /**
   * 删除模型
   */
  deleteModel: protectedProcedure
    .input(z.object({ modelId: z.string() }))
    .mutation(async ({ input }) => {
      const [model] = await (await getDbInstance()).select().from(models).where(eq(models.modelId, input.modelId)).limit(1);
      if (!model) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Model not found" });
      }

      // 从 Ollama 删除
      if (model.provider === "ollama") {
        await deleteOllamaModel(model.name);
      }

      // 从数据库删除
      await (await getDbInstance()).delete(models).where(eq(models.modelId, input.modelId));

      return { success: true };
    }),

  /**
   * 设置默认模型
   */
  setDefaultModel: protectedProcedure
    .input(z.object({ modelId: z.string() }))
    .mutation(async ({ input }) => {
      // 取消其他默认
      await (await getDbInstance()).update(models).set({ isDefault: false }).where(eq(models.isDefault, true));
      
      // 设置新默认
      await (await getDbInstance()).update(models).set({ isDefault: true }).where(eq(models.modelId, input.modelId));

      return { success: true };
    }),

  /**
   * 更新模型配置
   */
  updateModelConfig: protectedProcedure
    .input(z.object({
      modelId: z.string(),
      config: z.object({
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().min(1).max(128000).optional(),
        topP: z.number().min(0).max(1).optional(),
        topK: z.number().min(1).max(100).optional(),
        repeatPenalty: z.number().min(0).max(2).optional(),
        contextLength: z.number().min(1).max(128000).optional(),
        systemPrompt: z.string().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      await (await getDbInstance()).update(models)
        .set({ config: input.config })
        .where(eq(models.modelId, input.modelId));

      return { success: true };
    }),

  // ============ 对话管理 ============

  /**
   * 创建对话
   */
  createConversation: protectedProcedure
    .input(z.object({
      modelId: z.string(),
      title: z.string().optional(),
      metadata: z.object({
        knowledgeBaseId: z.number().optional(),
        systemPrompt: z.string().optional(),
        temperature: z.number().optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const conversationId = generateId("conv_");
      
      await (await getDbInstance()).insert(modelConversations).values({
        conversationId,
        userId: ctx.user.id,
        modelId: input.modelId,
        title: input.title || "新对话",
        metadata: input.metadata,
      });

      return { conversationId };
    }),

  /**
   * 获取对话列表
   */
  listConversations: protectedProcedure
    .input(z.object({
      modelId: z.string().optional(),
      status: z.enum(["active", "archived", "deleted"]).optional().default("active"),
      limit: z.number().min(1).max(100).optional().default(20),
      offset: z.number().min(0).optional().default(0),
    }).optional())
    .query(async ({ input, ctx }) => {
      const filters = input || { status: "active" as const, limit: 20, offset: 0 };
      
      const conditions = [eq(modelConversations.userId, ctx.user.id)];
      if (filters.modelId) {
        conditions.push(eq(modelConversations.modelId, filters.modelId));
      }
      if (filters.status) {
        conditions.push(eq(modelConversations.status, filters.status));
      }

      const result = await (await getDbInstance()).select()
        .from(modelConversations)
        .where(and(...conditions))
        .orderBy(desc(modelConversations.updatedAt))
        .limit(filters.limit ?? 20)
        .offset(filters.offset ?? 0);

      return result;
    }),

  /**
   * 获取对话消息
   */
  getConversationMessages: protectedProcedure
    .input(z.object({
      conversationId: z.string(),
      limit: z.number().min(1).max(100).optional().default(50),
      offset: z.number().min(0).optional().default(0),
    }))
    .query(async ({ input }) => {
      const result = await (await getDbInstance()).select()
        .from(modelMessages)
        .where(eq(modelMessages.conversationId, input.conversationId))
        .orderBy(modelMessages.createdAt)
        .limit(input.limit)
        .offset(input.offset);

      return result;
    }),

  /**
   * 发送消息并获取回复
   */
  sendMessage: protectedProcedure
    .input(z.object({
      conversationId: z.string(),
      content: z.string(),
      attachments: z.array(z.object({
        type: z.string(),
        url: z.string(),
        name: z.string().optional(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const startTime = Date.now();

      // 获取对话信息
      const [conversation] = await (await getDbInstance()).select()
        .from(modelConversations)
        .where(eq(modelConversations.conversationId, input.conversationId))
        .limit(1);

      if (!conversation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      // 获取模型信息
      const [model] = await (await getDbInstance()).select()
        .from(models)
        .where(eq(models.modelId, conversation.modelId))
        .limit(1);

      if (!model) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Model not found" });
      }

      // 保存用户消息
      const userMessageId = generateId("msg_");
      await (await getDbInstance()).insert(modelMessages).values({
        messageId: userMessageId,
        conversationId: input.conversationId,
        role: "user",
        content: input.content,
        attachments: input.attachments,
      });

      // 获取历史消息
      const history = await (await getDbInstance()).select()
        .from(modelMessages)
        .where(eq(modelMessages.conversationId, input.conversationId))
        .orderBy(modelMessages.createdAt)
        .limit(20);

      // 构建消息列表
      const messages: Array<{ role: string; content: string }> = history.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      }));

      // 添加系统提示
      const metadata = conversation.metadata as { systemPrompt?: string; temperature?: number } | null;
      if (metadata?.systemPrompt) {
        messages.unshift({ role: "system", content: metadata.systemPrompt });
      }

      // 调用 Ollama
      let assistantContent = "";
      let evalCount = 0;
      let promptEvalCount = 0;

      try {
        const response = await ollamaChat({
          model: model.name,
          messages,
          options: {
            temperature: metadata?.temperature || (model.config as { temperature?: number } | null)?.temperature || 0.7,
            top_p: (model.config as { topP?: number } | null)?.topP || 0.9,
            num_predict: (model.config as { maxTokens?: number } | null)?.maxTokens || 4096,
          },
        });

        assistantContent = response.message.content;
        evalCount = response.eval_count || 0;
        promptEvalCount = response.prompt_eval_count || 0;
      } catch (error) {
        assistantContent = "抱歉，模型调用失败。请检查 Ollama 服务是否正常运行。";
      }

      const latency = Date.now() - startTime;

      // 保存助手消息
      const assistantMessageId = generateId("msg_");
      await (await getDbInstance()).insert(modelMessages).values({
        messageId: assistantMessageId,
        conversationId: input.conversationId,
        role: "assistant",
        content: assistantContent,
        tokens: evalCount,
        latency,
      });

      // 更新对话统计
      await (await getDbInstance()).update(modelConversations)
        .set({
          messageCount: sql`${modelConversations.messageCount} + 2`,
          totalTokens: sql`${modelConversations.totalTokens} + ${promptEvalCount + evalCount}`,
        })
        .where(eq(modelConversations.conversationId, input.conversationId));

      // 记录使用日志
      await (await getDbInstance()).insert(modelUsageLogs).values({
        logId: generateId("log_"),
        userId: ctx.user.id,
        modelId: model.modelId,
        conversationId: input.conversationId,
        requestType: "chat",
        inputTokens: promptEvalCount,
        outputTokens: evalCount,
        latency,
        status: "success",
      });

      return {
        userMessage: { messageId: userMessageId, content: input.content },
        assistantMessage: { messageId: assistantMessageId, content: assistantContent, tokens: evalCount, latency },
      };
    }),

  /**
   * 删除对话
   */
  deleteConversation: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .mutation(async ({ input }) => {
      await (await getDbInstance()).update(modelConversations)
        .set({ status: "deleted" })
        .where(eq(modelConversations.conversationId, input.conversationId));

      return { success: true };
    }),

  // ============ 模型推理 ============

  /**
   * 文本生成
   */
  generate: protectedProcedure
    .input(z.object({
      modelId: z.string(),
      prompt: z.string(),
      system: z.string().optional(),
      options: z.object({
        temperature: z.number().optional(),
        topP: z.number().optional(),
        topK: z.number().optional(),
        maxTokens: z.number().optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const startTime = Date.now();

      const [model] = await (await getDbInstance()).select().from(models).where(eq(models.modelId, input.modelId)).limit(1);
      if (!model) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Model not found" });
      }

      const response = await ollamaGenerate({
        model: model.name,
        prompt: input.prompt,
        system: input.system,
        options: {
          temperature: input.options?.temperature,
          top_p: input.options?.topP,
          top_k: input.options?.topK,
          num_predict: input.options?.maxTokens,
        },
      });

      const latency = Date.now() - startTime;

      // 记录使用日志
      await (await getDbInstance()).insert(modelUsageLogs).values({
        logId: generateId("log_"),
        userId: ctx.user.id,
        modelId: model.modelId,
        requestType: "completion",
        inputTokens: response.prompt_eval_count,
        outputTokens: response.eval_count,
        latency,
        status: "success",
      });

      return {
        response: response.response,
        tokens: response.eval_count,
        latency,
      };
    }),

  /**
   * 文本嵌入
   */
  embed: protectedProcedure
    .input(z.object({
      modelId: z.string(),
      input: z.union([z.string(), z.array(z.string())]),
    }))
    .mutation(async ({ input, ctx }) => {
      const [model] = await (await getDbInstance()).select().from(models).where(eq(models.modelId, input.modelId)).limit(1);
      if (!model) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Model not found" });
      }

      const response = await ollamaEmbed({
        model: model.name,
        input: input.input,
      });

      // 记录使用日志
      await (await getDbInstance()).insert(modelUsageLogs).values({
        logId: generateId("log_"),
        userId: ctx.user.id,
        modelId: model.modelId,
        requestType: "embedding",
        status: "success",
      });

      return {
        embeddings: response.embeddings,
        dimensions: response.embeddings[0]?.length || 0,
      };
    }),

  // ============ 统计信息 ============

  /**
   * 获取模型使用统计
   */
  getUsageStats: protectedProcedure
    .input(z.object({
      modelId: z.string().optional(),
      days: z.number().min(1).max(90).optional().default(7),
    }).optional())
    .query(async ({ input, ctx }) => {
      const filters = input || { days: 7 };
      
      const conditions = [eq(modelUsageLogs.userId, ctx.user.id)];
      if (filters.modelId) {
        conditions.push(eq(modelUsageLogs.modelId, filters.modelId));
      }

      // 总统计
      const [totalStats] = await (await getDbInstance()).select({
        totalRequests: sql<number>`COUNT(*)`,
        totalInputTokens: sql<number>`COALESCE(SUM(${modelUsageLogs.inputTokens}), 0)`,
        totalOutputTokens: sql<number>`COALESCE(SUM(${modelUsageLogs.outputTokens}), 0)`,
        avgLatency: sql<number>`COALESCE(AVG(${modelUsageLogs.latency}), 0)`,
        successRate: sql<number>`COALESCE(SUM(CASE WHEN ${modelUsageLogs.status} = 'success' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 0)`,
      })
        .from(modelUsageLogs)
        .where(and(...conditions));

      // 对话统计
      const [conversationStats] = await (await getDbInstance()).select({
        totalConversations: sql<number>`COUNT(*)`,
        totalMessages: sql<number>`COALESCE(SUM(${modelConversations.messageCount}), 0)`,
      })
        .from(modelConversations)
        .where(eq(modelConversations.userId, ctx.user.id));

      return {
        totalRequests: totalStats?.totalRequests || 0,
        totalInputTokens: totalStats?.totalInputTokens || 0,
        totalOutputTokens: totalStats?.totalOutputTokens || 0,
        avgLatency: Math.round(totalStats?.avgLatency || 0),
        successRate: Math.round((totalStats?.successRate || 0) * 100) / 100,
        totalConversations: conversationStats?.totalConversations || 0,
        totalMessages: conversationStats?.totalMessages || 0,
      };
    }),
});

export type ModelRouter = typeof modelRouter;
