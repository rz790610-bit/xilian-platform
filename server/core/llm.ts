/**
 * LLM 调用层
 * 
 * 修复清单：
 *   P1-2: assertApiKey 错误提示从 "OPENAI_API_KEY" 修正为 "BUILT_IN_FORGE_API_KEY"
 *   P1-3: model 从硬编码 "gemini-2.5-flash" 改为 config 可配置
 *   P1-4: max_tokens / thinking.budget_tokens 硬编码提取为参数
 *   P2-A07: 添加指数退避重试（429/5xx），最多 3 次
 */

import { config } from "./config";
import { createModuleLogger } from "./logger";

const log = createModuleLogger('llm');

// ============================================================
// 类型定义（保持不变）
// ============================================================

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  /** 模型名称覆盖（默认读 LLM_MODEL 环境变量或 gemini-2.5-flash） */
  model?: string;
  /** thinking budget tokens 覆盖（默认 128） */
  thinkingBudget?: number;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

// ============================================================
// 内部工具函数
// ============================================================

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

/**
 * P1-2 修复：错误提示从 "OPENAI_API_KEY" 修正为 "BUILT_IN_FORGE_API_KEY"
 * 同时改为从 config 统一读取
 */
const resolveApiUrl = (): string => {
  const url = config.externalApis.forgeApiUrl;
  return url && url.trim().length > 0
    ? `${url.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";
};

const getApiKey = (): string => {
  const key = config.externalApis.forgeApiKey;
  if (!key) {
    throw new Error(
      "BUILT_IN_FORGE_API_KEY is not configured — set it in .env or environment variables"
    );
  }
  return key;
};

/** P1-3 修复：模型名称可配置 */
const DEFAULT_MODEL = process.env.LLM_MODEL || "gemini-2.5-flash";

/** P1-4 修复：默认参数可配置 */
const DEFAULT_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || "32768", 10);
const DEFAULT_THINKING_BUDGET = parseInt(process.env.LLM_THINKING_BUDGET || "128", 10);

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

// ============================================================
// P2-A07: 指数退避重试
// ============================================================

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// 主入口
// ============================================================

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const apiKey = getApiKey();
  const apiUrl = resolveApiUrl();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    maxTokens,
    max_tokens,
    thinkingBudget,
  } = params;

  const payload: Record<string, unknown> = {
    model: model || DEFAULT_MODEL,
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  payload.max_tokens = maxTokens || max_tokens || DEFAULT_MAX_TOKENS;
  payload.thinking = {
    budget_tokens: thinkingBudget ?? DEFAULT_THINKING_BUDGET,
  };

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  // P2-A07: 指数退避重试循环
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      log.warn({ attempt, delay, model: payload.model }, `LLM retry after ${delay}ms`);
      await sleep(delay);
    }

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();

        if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
          lastError = new Error(
            `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
          );
          log.warn({ status: response.status, attempt }, 'Retryable LLM error');
          continue;
        }

        throw new Error(
          `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
        );
      }

      return (await response.json()) as InvokeResult;
    } catch (err) {
      if (attempt < MAX_RETRIES && (err as NodeJS.ErrnoException).code === 'ECONNRESET') {
        lastError = err as Error;
        log.warn({ attempt, err: (err as Error).message }, 'Network error, retrying');
        continue;
      }
      throw err;
    }
  }

  // 所有重试均失败
  throw lastError || new Error('LLM invoke failed after all retries');
}
