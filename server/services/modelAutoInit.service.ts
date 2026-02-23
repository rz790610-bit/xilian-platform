/**
 * 模型自动初始化服务
 * 
 * 功能：
 *   1. 服务启动时自动检测 Ollama 可用性
 *   2. 自动拉取缺失的默认模型（LLM + Embedding）
 *   3. 同步 Ollama 模型到数据库
 *   4. 提供初始化状态查询 API
 *   5. 支持通过环境变量配置默认模型列表
 * 
 * 环境变量：
 *   OLLAMA_URL              Ollama 服务地址（默认 http://localhost:11434）
 *   OLLAMA_AUTO_INIT        是否启用自动初始化（默认 true）
 *   OLLAMA_DEFAULT_LLM      默认 LLM 模型（默认 qwen2.5:7b）
 *   OLLAMA_DEFAULT_EMBED    默认 Embedding 模型（默认 nomic-embed-text）
 *   OLLAMA_EXTRA_MODELS     额外模型列表（逗号分隔）
 *   OLLAMA_INIT_RETRY       初始化重试次数（默认 3）
 *   OLLAMA_INIT_DELAY       重试间隔秒数（默认 10）
 */

import { z } from "zod";
import { publicProcedure, router } from "../core/trpc";
import { createModuleLogger } from '../core/logger';
import { getDb } from "../lib/db";
import { models } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const log = createModuleLogger('model-auto-init');

// ==================== 配置 ====================

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const AUTO_INIT_ENABLED = process.env.OLLAMA_AUTO_INIT !== "false";
const DEFAULT_LLM_MODEL = process.env.OLLAMA_DEFAULT_LLM || "qwen2.5:7b";
const DEFAULT_EMBED_MODEL = process.env.OLLAMA_DEFAULT_EMBED || "nomic-embed-text";
const EXTRA_MODELS = process.env.OLLAMA_EXTRA_MODELS?.split(",").map(s => s.trim()).filter(Boolean) || [];
const INIT_RETRY_COUNT = parseInt(process.env.OLLAMA_INIT_RETRY || "3", 10);
const INIT_RETRY_DELAY = parseInt(process.env.OLLAMA_INIT_DELAY || "10", 10) * 1000;

// ==================== 状态管理 ====================

interface ModelPullProgress {
  model: string;
  status: "pending" | "pulling" | "completed" | "failed" | "skipped";
  progress: number;       // 0-100
  totalBytes: number;
  completedBytes: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

interface InitState {
  status: "idle" | "checking" | "pulling" | "completed" | "failed" | "disabled";
  ollamaOnline: boolean;
  ollamaVersion: string | null;
  gpuDetected: boolean;
  gpuInfo: string | null;
  models: ModelPullProgress[];
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  retryCount: number;
}

const initState: InitState = {
  status: "idle",
  ollamaOnline: false,
  ollamaVersion: null,
  gpuDetected: false,
  gpuInfo: null,
  models: [],
  startedAt: null,
  completedAt: null,
  error: null,
  retryCount: 0,
};

// ==================== Ollama API 调用 ====================

async function checkOllamaReady(): Promise<{ online: boolean; version?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${OLLAMA_BASE_URL}/api/version`, { signal: controller.signal });
    clearTimeout(timeout);
    if (response.ok) {
      const data = await response.json();
      return { online: true, version: data.version };
    }
    return { online: false };
  } catch {
    return { online: false };
  }
}

async function getInstalledModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) return [];
    const data = await response.json();
    return (data.models || []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}

async function pullModelWithProgress(
  modelName: string,
  onProgress: (progress: { status: string; total: number; completed: number }) => void
): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName, stream: true }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Pull failed: HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastStatus = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          lastStatus = chunk.status || lastStatus;
          onProgress({
            status: chunk.status || "unknown",
            total: chunk.total || 0,
            completed: chunk.completed || 0,
          });
        } catch {
          // Skip invalid JSON
        }
      }
    }

    // 验证拉取成功
    const installed = await getInstalledModels();
    return installed.some(m => m === modelName || m === `${modelName}:latest` || `${modelName}:latest` === m);
  } catch (error) {
    log.warn(`[AutoInit] Failed to pull model ${modelName}:`, error);
    return false;
  }
}

/**
 * 同步模型到数据库（复用 model.service.ts 的逻辑模式）
 */
async function syncModelToDb(modelName: string, modelType: "llm" | "embedding"): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const modelId = modelName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const existing = await db.select().from(models).where(eq(models.modelId, modelId)).limit(1);

    // 获取模型详情
    let sizeGB = "";
    let parameterSize = "";
    let quantization = "";
    let family = "";

    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
      });
      if (response.ok) {
        const info = await response.json();
        parameterSize = info.details?.parameter_size || "";
        quantization = info.details?.quantization_level || "";
        family = info.details?.family || "";
      }
    } catch { /* ignore */ }

    // 获取模型大小
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        const modelInfo = (data.models || []).find((m: { name: string }) => m.name === modelName || m.name === `${modelName}:latest`);
        if (modelInfo) {
          sizeGB = (modelInfo.size / (1024 * 1024 * 1024)).toFixed(2) + " GB";
        }
      }
    } catch { /* ignore */ }

    if (existing.length === 0) {
      await db.insert(models).values({
        modelId,
        name: modelName,
        displayName: modelName,
        type: modelType,
        provider: "ollama",
        size: sizeGB || null,
        parameters: parameterSize || null,
        quantization: quantization || null,
        description: `${family || "Unknown"} family model (auto-initialized)`,
        status: "available",
        isDefault: modelType === "llm" && modelName === DEFAULT_LLM_MODEL,
        capabilities: {
          chat: modelType === "llm",
          completion: modelType === "llm",
          embedding: modelType === "embedding",
        },
      });
      log.info(`[AutoInit] Synced model to DB: ${modelName} (${modelType})`);
    } else {
      await db.update(models)
        .set({
          status: "available",
          size: sizeGB || existing[0].size,
          parameters: parameterSize || existing[0].parameters,
          quantization: quantization || existing[0].quantization,
        })
        .where(eq(models.modelId, modelId));
    }
  } catch (error) {
    log.warn(`[AutoInit] Failed to sync model ${modelName} to DB:`, error);
  }
}

// ==================== 核心初始化逻辑 ====================

/**
 * 构建需要拉取的模型列表
 */
function getRequiredModels(): Array<{ name: string; type: "llm" | "embedding" }> {
  const modelList: Array<{ name: string; type: "llm" | "embedding" }> = [];

  // 默认 LLM 模型
  if (DEFAULT_LLM_MODEL) {
    modelList.push({ name: DEFAULT_LLM_MODEL, type: "llm" });
  }

  // 默认 Embedding 模型
  if (DEFAULT_EMBED_MODEL) {
    modelList.push({ name: DEFAULT_EMBED_MODEL, type: "embedding" });
  }

  // 额外模型
  for (const extra of EXTRA_MODELS) {
    const type = extra.includes("embed") ? "embedding" as const : "llm" as const;
    if (!modelList.some(m => m.name === extra)) {
      modelList.push({ name: extra, type });
    }
  }

  return modelList;
}

/**
 * 执行自动初始化（带重试）
 */
async function runAutoInit(): Promise<void> {
  if (!AUTO_INIT_ENABLED) {
    initState.status = "disabled";
    log.info("[AutoInit] Auto-init disabled (OLLAMA_AUTO_INIT=false)");
    return;
  }

  initState.status = "checking";
  initState.startedAt = new Date().toISOString();
  initState.error = null;

  log.info("[AutoInit] Starting model auto-initialization...");
  log.info(`[AutoInit] Ollama URL: ${OLLAMA_BASE_URL}`);
  log.info(`[AutoInit] Default LLM: ${DEFAULT_LLM_MODEL}`);
  log.info(`[AutoInit] Default Embed: ${DEFAULT_EMBED_MODEL}`);
  if (EXTRA_MODELS.length > 0) {
    log.info(`[AutoInit] Extra models: ${EXTRA_MODELS.join(", ")}`);
  }

  // 等待 Ollama 就绪（带重试）
  let ollamaReady = false;
  for (let attempt = 0; attempt <= INIT_RETRY_COUNT; attempt++) {
    initState.retryCount = attempt;
    const status = await checkOllamaReady();

    if (status.online) {
      ollamaReady = true;
      initState.ollamaOnline = true;
      initState.ollamaVersion = status.version || null;
      log.info(`[AutoInit] Ollama online (v${status.version})`);
      break;
    }

    if (attempt < INIT_RETRY_COUNT) {
      log.warn(`[AutoInit] Ollama not ready, retry ${attempt + 1}/${INIT_RETRY_COUNT} in ${INIT_RETRY_DELAY / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, INIT_RETRY_DELAY));
    }
  }

  if (!ollamaReady) {
    initState.status = "failed";
    initState.error = `Ollama not reachable at ${OLLAMA_BASE_URL} after ${INIT_RETRY_COUNT} retries`;
    initState.completedAt = new Date().toISOString();
    log.warn(`[AutoInit] ${initState.error}`);
    return;
  }

  // 获取已安装模型
  const installedModels = await getInstalledModels();
  log.info(`[AutoInit] Installed models: ${installedModels.length > 0 ? installedModels.join(", ") : "(none)"}`);

  // 构建拉取计划
  const requiredModels = getRequiredModels();
  initState.models = requiredModels.map(m => ({
    model: m.name,
    status: "pending" as const,
    progress: 0,
    totalBytes: 0,
    completedBytes: 0,
  }));

  // 检查哪些模型需要拉取
  for (const entry of initState.models) {
    const isInstalled = installedModels.some(
      installed => installed === entry.model || installed === `${entry.model}:latest` || `${entry.model}:latest` === installed
    );
    if (isInstalled) {
      entry.status = "skipped";
      entry.progress = 100;
      log.info(`[AutoInit] Model already installed: ${entry.model}`);
    }
  }

  // 拉取缺失模型
  const modelsToPull = initState.models.filter(m => m.status === "pending");
  if (modelsToPull.length === 0) {
    log.info("[AutoInit] All required models already installed");
  } else {
    initState.status = "pulling";
    log.info(`[AutoInit] Pulling ${modelsToPull.length} model(s)...`);

    for (const entry of modelsToPull) {
      entry.status = "pulling";
      entry.startedAt = new Date().toISOString();
      log.info(`[AutoInit] Pulling: ${entry.model}`);

      const success = await pullModelWithProgress(entry.model, (progress) => {
        if (progress.total > 0) {
          entry.progress = Math.round((progress.completed / progress.total) * 100);
          entry.totalBytes = progress.total;
          entry.completedBytes = progress.completed;
        }
      });

      entry.completedAt = new Date().toISOString();

      if (success) {
        entry.status = "completed";
        entry.progress = 100;
        log.info(`[AutoInit] Pull completed: ${entry.model}`);
      } else {
        entry.status = "failed";
        entry.error = "Pull failed or verification failed";
        log.warn(`[AutoInit] Pull failed: ${entry.model}`);
      }
    }
  }

  // 同步所有模型到数据库
  log.info("[AutoInit] Syncing models to database...");
  for (const required of requiredModels) {
    const entry = initState.models.find(m => m.model === required.name);
    if (entry && (entry.status === "completed" || entry.status === "skipped")) {
      await syncModelToDb(required.name, required.type);
    }
  }

  // 完成
  const failedCount = initState.models.filter(m => m.status === "failed").length;
  initState.status = failedCount > 0 ? "failed" : "completed";
  initState.completedAt = new Date().toISOString();

  const summary = initState.models.map(m => `${m.model}: ${m.status}`).join(", ");
  log.info(`[AutoInit] Initialization ${initState.status}: ${summary}`);
}

// ==================== 启动入口 ====================

let initPromise: Promise<void> | null = null;

/**
 * 启动自动初始化（非阻塞）
 * 在服务启动时调用，不会阻塞主进程
 */
export function startModelAutoInit(): void {
  if (initPromise) {
    log.warn("[AutoInit] Already running, skipping duplicate call");
    return;
  }

  // 延迟 5 秒启动，确保其他服务（DB、Ollama）已就绪
  setTimeout(() => {
    initPromise = runAutoInit()
      .catch(error => {
        log.warn("[AutoInit] Unexpected error:", error);
        initState.status = "failed";
        initState.error = error.message || "Unexpected error";
        initState.completedAt = new Date().toISOString();
      })
      .finally(() => {
        initPromise = null;
      });
  }, 5000);
}

/**
 * 手动触发重新初始化
 */
export async function retriggerAutoInit(): Promise<void> {
  if (initPromise) {
    throw new Error("Auto-init is already running");
  }

  // 重置状态
  initState.status = "idle";
  initState.models = [];
  initState.error = null;
  initState.retryCount = 0;

  initPromise = runAutoInit()
    .catch(error => {
      log.warn("[AutoInit] Retrigger error:", error);
      initState.status = "failed";
      initState.error = error.message || "Unexpected error";
      initState.completedAt = new Date().toISOString();
    })
    .finally(() => {
      initPromise = null;
    });

  return initPromise;
}

/**
 * 获取当前初始化状态
 */
export function getAutoInitState(): InitState {
  return { ...initState, models: initState.models.map(m => ({ ...m })) };
}

// ==================== tRPC 路由 ====================

export const modelAutoInitRouter = router({
  /**
   * 获取模型自动初始化状态
   */
  getInitStatus: publicProcedure.query(() => {
    return getAutoInitState();
  }),

  /**
   * 手动触发模型初始化
   */
  triggerInit: publicProcedure.mutation(async () => {
    try {
      await retriggerAutoInit();
      return { success: true, message: "Auto-init triggered" };
    } catch (error: any) {
      return { success: false, message: error.message || "Failed to trigger" };
    }
  }),

  /**
   * 获取默认模型配置
   */
  getDefaultConfig: publicProcedure.query(() => {
    return {
      ollamaUrl: OLLAMA_BASE_URL,
      autoInitEnabled: AUTO_INIT_ENABLED,
      defaultLlm: DEFAULT_LLM_MODEL,
      defaultEmbed: DEFAULT_EMBED_MODEL,
      extraModels: EXTRA_MODELS,
      retryCount: INIT_RETRY_COUNT,
      retryDelay: INIT_RETRY_DELAY / 1000,
    };
  }),

  /**
   * 更新默认模型配置（运行时生效，不持久化到环境变量）
   */
  updateDefaultModels: publicProcedure
    .input(z.object({
      defaultLlm: z.string().optional(),
      defaultEmbed: z.string().optional(),
      extraModels: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      // 运行时更新（注意：重启后会恢复环境变量配置）
      if (input.defaultLlm) {
        process.env.OLLAMA_DEFAULT_LLM = input.defaultLlm;
      }
      if (input.defaultEmbed) {
        process.env.OLLAMA_DEFAULT_EMBED = input.defaultEmbed;
      }
      if (input.extraModels) {
        process.env.OLLAMA_EXTRA_MODELS = input.extraModels.join(",");
      }

      log.info(`[AutoInit] Default models updated: LLM=${input.defaultLlm || DEFAULT_LLM_MODEL}, Embed=${input.defaultEmbed || DEFAULT_EMBED_MODEL}`);

      return { success: true };
    }),
});

export type ModelAutoInitRouter = typeof modelAutoInitRouter;
