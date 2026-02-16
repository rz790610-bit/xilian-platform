/**
 * xAI Grok 诊断 Agent 服务
 * 
 * 功能：利用 xAI Grok 模型进行设备故障诊断、异常分析和维护建议
 * 
 * 架构：
 * - 支持 xAI API (api.x.ai) 和本地 Ollama 双通道
 * - Tool Calling：Grok 可调用平台内部工具（查设备数据、查历史告警、查知识库）
 * - 多轮对话：支持诊断上下文保持
 * - 结构化输出：诊断结果写入 diagnosis_results 表
 * 
 * API 规范：
 * - 端点: https://api.x.ai/v1/chat/completions
 * - 认证: Bearer token
 * - 模型: grok-4-0709 (推理) / grok-4.1-fast (agent/tool calling)
 * - 兼容 OpenAI Chat Completions 格式
 */

import { createModuleLogger } from '../core/logger';
import { getDb } from '../lib/db';
import { diagnosisResults, auditLogs, devices, sensorData, alertRules } from '../../drizzle/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';

const log = createModuleLogger('grokDiagnosticAgent');

// ============================================================
// 配置
// ============================================================

interface GrokConfig {
  /** xAI API 端点 */
  apiUrl: string;
  /** xAI API Key */
  apiKey: string;
  /** 模型选择 */
  model: string;
  /** 是否启用 */
  enabled: boolean;
  /** 请求超时（ms） */
  timeout: number;
  /** 最大 token */
  maxTokens: number;
  /** 温度（诊断场景建议 0.1-0.3） */
  temperature: number;
  /** 降级到 Ollama */
  fallbackToOllama: boolean;
  /** Ollama 端点 */
  ollamaUrl: string;
  /** Ollama 模型 */
  ollamaModel: string;
}

function loadConfig(): GrokConfig {
  return {
    apiUrl: process.env.XAI_API_URL || 'https://api.x.ai',
    apiKey: process.env.XAI_API_KEY || '',
    model: process.env.XAI_MODEL || 'grok-4-0709',
    enabled: process.env.FEATURE_GROK_ENABLED === 'true' || process.env.XAI_API_KEY !== undefined && process.env.XAI_API_KEY !== '',
    timeout: parseInt(process.env.XAI_TIMEOUT || '60000', 10),
    maxTokens: parseInt(process.env.XAI_MAX_TOKENS || '8192', 10),
    temperature: parseFloat(process.env.XAI_TEMPERATURE || '0.2'),
    fallbackToOllama: process.env.XAI_FALLBACK_OLLAMA !== 'false',
    ollamaUrl: process.env.OLLAMA_HOST || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3.1:70b',
  };
}

const config = loadConfig();

// ============================================================
// 类型定义
// ============================================================

export interface DiagnosticRequest {
  /** 设备编码 */
  deviceCode: string;
  /** 故障描述（用户输入） */
  description: string;
  /** 附加传感器数据（可选） */
  sensorReadings?: Record<string, number>;
  /** 时间范围（小时，默认 24） */
  timeRangeHours?: number;
  /** 会话 ID（多轮对话） */
  sessionId?: string;
  /** 诊断模式 */
  mode?: 'quick' | 'deep' | 'predictive';
}

export interface DiagnosticResult {
  /** 诊断 ID */
  id: string;
  /** 设备编码 */
  deviceCode: string;
  /** 故障类型 */
  faultType: string;
  /** 严重程度 */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** 置信度 (0-1) */
  confidence: number;
  /** 根因分析 */
  rootCause: string;
  /** 详细诊断说明 */
  analysis: string;
  /** 维护建议 */
  recommendations: string[];
  /** 预计影响 */
  impact: string;
  /** 引用的数据源 */
  dataSources: string[];
  /** 工具调用记录 */
  toolCalls: ToolCallRecord[];
  /** 模型信息 */
  modelInfo: {
    model: string;
    provider: 'xai' | 'ollama';
    tokensUsed: number;
    latencyMs: number;
  };
}

interface ToolCallRecord {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  durationMs: number;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// ============================================================
// 诊断 System Prompt
// ============================================================

const DIAGNOSTIC_SYSTEM_PROMPT = `你是西联智能平台的设备诊断专家 Agent，由 xAI Grok 驱动。

你的职责：
1. 分析设备故障现象和传感器数据
2. 调用平台工具获取设备信息、历史数据和知识库
3. 基于数据进行根因分析
4. 给出可执行的维护建议

诊断流程：
1. 先调用 get_device_info 获取设备基本信息和当前状态
2. 调用 get_sensor_history 获取相关传感器的历史数据
3. 调用 get_alert_history 查看历史告警记录
4. 如需要，调用 search_knowledge_base 查询故障知识库
5. 综合分析后给出诊断结论

输出要求：
- 必须基于真实数据分析，不能凭空猜测
- 置信度必须诚实反映数据支撑程度
- 维护建议必须具体可执行
- 如果数据不足，明确说明需要哪些额外信息

严重程度标准：
- critical: 设备即将停机或已停机，需立即处理
- high: 性能严重下降，24小时内需处理
- medium: 存在异常但仍可运行，一周内需处理
- low: 轻微异常，下次维护时处理
- info: 仅供参考的观察结果`;

// ============================================================
// Tool Definitions（Grok 可调用的平台工具）
// ============================================================

const DIAGNOSTIC_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_device_info',
      description: '获取设备的基本信息、当前状态、配置参数和最近的维护记录',
      parameters: {
        type: 'object',
        properties: {
          device_code: {
            type: 'string',
            description: '设备编码',
          },
        },
        required: ['device_code'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_sensor_history',
      description: '获取指定设备的传感器历史数据，包括振动、温度、压力等',
      parameters: {
        type: 'object',
        properties: {
          device_code: {
            type: 'string',
            description: '设备编码',
          },
          sensor_type: {
            type: 'string',
            description: '传感器类型：vibration(振动), temperature(温度), pressure(压力), current(电流), rpm(转速)',
            enum: ['vibration', 'temperature', 'pressure', 'current', 'rpm'],
          },
          hours: {
            type: 'number',
            description: '查询最近多少小时的数据，默认24',
          },
        },
        required: ['device_code', 'sensor_type'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_alert_history',
      description: '获取设备的历史告警记录，包括告警类型、时间、处理状态',
      parameters: {
        type: 'object',
        properties: {
          device_code: {
            type: 'string',
            description: '设备编码',
          },
          days: {
            type: 'number',
            description: '查询最近多少天的告警，默认30',
          },
          severity: {
            type: 'string',
            description: '告警级别过滤',
            enum: ['critical', 'high', 'medium', 'low'],
          },
        },
        required: ['device_code'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_knowledge_base',
      description: '在故障知识库中搜索相关的故障案例、维护手册和解决方案',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词，如故障现象、设备型号、错误代码等',
          },
          limit: {
            type: 'number',
            description: '返回结果数量，默认5',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_dsp_analysis',
      description: '对传感器数据运行 DSP 信号分析（FFT频谱、包络分析、趋势检测）',
      parameters: {
        type: 'object',
        properties: {
          device_code: {
            type: 'string',
            description: '设备编码',
          },
          sensor_type: {
            type: 'string',
            description: '传感器类型',
            enum: ['vibration', 'temperature', 'pressure', 'current'],
          },
          analysis_type: {
            type: 'string',
            description: '分析类型',
            enum: ['fft', 'envelope', 'trend', 'anomaly'],
          },
        },
        required: ['device_code', 'sensor_type', 'analysis_type'],
      },
    },
  },
];

// ============================================================
// Tool 执行器（真实查询平台数据）
// ============================================================

async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const db = getDb();
  if (!db) {
    return { error: '数据库未连接' };
  }

  switch (toolName) {
    case 'get_device_info': {
      const deviceCode = args.device_code as string;
      try {
        const device = await db
          .select()
          .from(devices)
          .where(eq(devices.deviceCode, deviceCode))
          .limit(1);

        if (device.length === 0) {
          return { error: `设备 ${deviceCode} 不存在` };
        }

        return {
          device: device[0],
          status: device[0].status,
          lastMaintenance: device[0].updatedAt,
        };
      } catch (err) {
        log.error('get_device_info failed:', err);
        return { error: '查询设备信息失败', detail: String(err) };
      }
    }

    case 'get_sensor_history': {
      const deviceCode = args.device_code as string;
      const sensorType = args.sensor_type as string;
      const hours = (args.hours as number) || 24;
      const since = new Date(Date.now() - hours * 3600 * 1000);

      try {
        const data = await db
          .select()
          .from(sensorData)
          .where(
            and(
              eq(sensorData.deviceCode, deviceCode),
              eq(sensorData.sensorType, sensorType),
              gte(sensorData.timestamp, since)
            )
          )
          .orderBy(desc(sensorData.timestamp))
          .limit(500);

        if (data.length === 0) {
          return {
            message: `设备 ${deviceCode} 最近 ${hours} 小时无 ${sensorType} 数据`,
            count: 0,
          };
        }

        // 计算基本统计量
        const values = data.map(d => d.value).filter((v): v is number => v !== null);
        const stats = {
          count: values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          mean: values.reduce((a, b) => a + b, 0) / values.length,
          stddev: 0,
          latest: values[0],
          trend: 'stable' as string,
        };
        const variance = values.reduce((sum, v) => sum + (v - stats.mean) ** 2, 0) / values.length;
        stats.stddev = Math.sqrt(variance);

        // 简单趋势判断
        if (values.length >= 10) {
          const firstHalf = values.slice(Math.floor(values.length / 2));
          const secondHalf = values.slice(0, Math.floor(values.length / 2));
          const firstMean = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
          const secondMean = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
          const diff = (secondMean - firstMean) / firstMean;
          if (diff > 0.1) stats.trend = 'increasing';
          else if (diff < -0.1) stats.trend = 'decreasing';
        }

        return {
          sensorType,
          timeRange: `${hours}h`,
          stats,
          recentSamples: data.slice(0, 20).map(d => ({
            timestamp: d.timestamp,
            value: d.value,
            unit: d.unit,
          })),
        };
      } catch (err) {
        log.error('get_sensor_history failed:', err);
        return { error: '查询传感器数据失败', detail: String(err) };
      }
    }

    case 'get_alert_history': {
      const deviceCode = args.device_code as string;
      const days = (args.days as number) || 30;
      const since = new Date(Date.now() - days * 86400 * 1000);

      try {
        const alerts = await db
          .select()
          .from(alertRules)
          .where(
            and(
              eq(alertRules.deviceCode, deviceCode),
              gte(alertRules.createdAt, since)
            )
          )
          .orderBy(desc(alertRules.createdAt))
          .limit(50);

        return {
          deviceCode,
          timeRange: `${days}d`,
          totalAlerts: alerts.length,
          alerts: alerts.map(a => ({
            id: a.id,
            type: a.ruleType,
            severity: a.severity,
            message: a.description,
            createdAt: a.createdAt,
            status: a.enabled ? 'active' : 'resolved',
          })),
          summary: {
            critical: alerts.filter(a => a.severity === 'critical').length,
            high: alerts.filter(a => a.severity === 'high').length,
            medium: alerts.filter(a => a.severity === 'medium').length,
            low: alerts.filter(a => a.severity === 'low').length,
          },
        };
      } catch (err) {
        log.error('get_alert_history failed:', err);
        return { error: '查询告警历史失败', detail: String(err) };
      }
    }

    case 'search_knowledge_base': {
      const query = args.query as string;
      const limit = (args.limit as number) || 5;

      // 使用 Qdrant 向量搜索（如果可用），否则降级到数据库全文搜索
      const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
      try {
        // 尝试 Qdrant 搜索
        const searchResponse = await fetch(`${QDRANT_URL}/collections/knowledge_base/points/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: await getQueryEmbedding(query),
            limit,
            with_payload: true,
          }),
          signal: AbortSignal.timeout(5000),
        });

        if (searchResponse.ok) {
          const result = await searchResponse.json();
          return {
            source: 'qdrant',
            results: (result.result || []).map((r: any) => ({
              score: r.score,
              title: r.payload?.title || '',
              content: r.payload?.content?.substring(0, 500) || '',
              category: r.payload?.category || '',
            })),
          };
        }
      } catch {
        // Qdrant 不可用，降级
      }

      // 降级：数据库模糊搜索
      try {
        const results = await db.execute(
          sql`SELECT id, title, content, category FROM kb_documents 
              WHERE MATCH(title, content) AGAINST(${query} IN NATURAL LANGUAGE MODE) 
              LIMIT ${limit}`
        );
        return {
          source: 'mysql_fulltext',
          results: Array.isArray(results) ? results : [],
        };
      } catch {
        return {
          source: 'none',
          results: [],
          message: '知识库搜索暂不可用',
        };
      }
    }

    case 'run_dsp_analysis': {
      const deviceCode = args.device_code as string;
      const sensorType = args.sensor_type as string;
      const analysisType = args.analysis_type as string;

      try {
        // 获取最近的传感器数据
        const data = await db
          .select()
          .from(sensorData)
          .where(
            and(
              eq(sensorData.deviceCode, deviceCode),
              eq(sensorData.sensorType, sensorType),
              gte(sensorData.timestamp, new Date(Date.now() - 24 * 3600 * 1000))
            )
          )
          .orderBy(desc(sensorData.timestamp))
          .limit(1024);

        if (data.length < 64) {
          return { error: `数据不足（${data.length} 点），DSP 分析需要至少 64 个数据点` };
        }

        const values = data.map(d => d.value).filter((v): v is number => v !== null);

        // 动态导入 DSP 核心库
        const dsp = await import('../algorithms/_core/dsp');

        switch (analysisType) {
          case 'fft': {
            const spectrum = dsp.amplitudeSpectrum(values);
            const sampleRate = 1000; // 假设 1kHz 采样率
            const peakFreqs: Array<{ freq: number; amplitude: number }> = [];
            for (let i = 1; i < spectrum.length - 1; i++) {
              if (spectrum[i] > spectrum[i - 1] && spectrum[i] > spectrum[i + 1] && spectrum[i] > 0.1) {
                peakFreqs.push({
                  freq: (i * sampleRate) / (2 * spectrum.length),
                  amplitude: spectrum[i],
                });
              }
            }
            peakFreqs.sort((a, b) => b.amplitude - a.amplitude);
            return {
              type: 'fft',
              sampleCount: values.length,
              dominantFrequencies: peakFreqs.slice(0, 10),
              totalEnergy: spectrum.reduce((a, b) => a + b * b, 0),
            };
          }

          case 'trend': {
            const n = values.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
            for (let i = 0; i < n; i++) {
              sumX += i;
              sumY += values[i];
              sumXY += i * values[i];
              sumX2 += i * i;
            }
            const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
            const intercept = (sumY - slope * sumX) / n;
            const mean = sumY / n;
            let ssTot = 0, ssRes = 0;
            for (let i = 0; i < n; i++) {
              ssTot += (values[i] - mean) ** 2;
              ssRes += (values[i] - (slope * i + intercept)) ** 2;
            }
            const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

            return {
              type: 'trend',
              sampleCount: n,
              slope,
              intercept,
              rSquared,
              trendDirection: slope > 0.001 ? 'increasing' : slope < -0.001 ? 'decreasing' : 'stable',
              projectedValue24h: slope * (n + 24 * 3600) + intercept,
            };
          }

          case 'anomaly': {
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
            const anomalies = values
              .map((v, i) => ({ index: i, value: v, zScore: (v - mean) / (std || 1) }))
              .filter(a => Math.abs(a.zScore) > 3);

            return {
              type: 'anomaly',
              sampleCount: values.length,
              mean,
              stddev: std,
              anomalyCount: anomalies.length,
              anomalyRate: anomalies.length / values.length,
              anomalies: anomalies.slice(0, 20),
            };
          }

          default: {
            const stats = dsp.statisticalFeatures(values);
            return { type: 'envelope', stats };
          }
        }
      } catch (err) {
        log.error('run_dsp_analysis failed:', err);
        return { error: 'DSP 分析失败', detail: String(err) };
      }
    }

    default:
      return { error: `未知工具: ${toolName}` };
  }
}

// ============================================================
// 嵌入向量获取（用于知识库搜索）
// ============================================================

async function getQueryEmbedding(text: string): Promise<number[]> {
  const ollamaUrl = config.ollamaUrl;
  try {
    const response = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const result = await response.json();
      return result.embedding;
    }
  } catch {
    // Ollama 不可用
  }

  // 降级：返回随机向量（仅用于开发环境）
  log.warn('Embedding service unavailable, using random vector (dev only)');
  return Array.from({ length: 384 }, () => Math.random() * 2 - 1);
}

// ============================================================
// 会话管理
// ============================================================

interface DiagnosticSession {
  id: string;
  deviceCode: string;
  messages: ChatMessage[];
  toolCalls: ToolCallRecord[];
  createdAt: Date;
  lastActiveAt: Date;
}

const sessions = new Map<string, DiagnosticSession>();

// 会话过期清理（30 分钟）
const SESSION_TTL_MS = 30 * 60 * 1000;

function cleanExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActiveAt.getTime() > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

setInterval(cleanExpiredSessions, 5 * 60 * 1000);

function getOrCreateSession(sessionId: string | undefined, deviceCode: string): DiagnosticSession {
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    session.lastActiveAt = new Date();
    return session;
  }

  const id = sessionId || `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const session: DiagnosticSession = {
    id,
    deviceCode,
    messages: [{ role: 'system', content: DIAGNOSTIC_SYSTEM_PROMPT }],
    toolCalls: [],
    createdAt: new Date(),
    lastActiveAt: new Date(),
  };
  sessions.set(id, session);
  return session;
}

// ============================================================
// xAI API 调用
// ============================================================

async function callXaiApi(
  messages: ChatMessage[],
  tools?: typeof DIAGNOSTIC_TOOLS,
  retryCount = 0
): Promise<{
  message: ChatMessage;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const payload: Record<string, unknown> = {
      model: config.model,
      messages: messages.map(m => {
        const msg: Record<string, unknown> = { role: m.role, content: m.content };
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        if (m.name) msg.name = m.name;
        return msg;
      }),
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    };

    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    const response = await fetch(`${config.apiUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();

      // 429 限流 — 指数退避重试
      if (response.status === 429 && retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
        log.warn(`xAI rate limited, retrying in ${delay}ms (attempt ${retryCount + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return callXaiApi(messages, tools, retryCount + 1);
      }

      throw new Error(`xAI API error: ${response.status} ${response.statusText} — ${errorText}`);
    }

    const result = await response.json();
    const choice = result.choices?.[0];

    if (!choice) {
      throw new Error('xAI API returned empty choices');
    }

    return {
      message: {
        role: 'assistant',
        content: choice.message.content || '',
        tool_calls: choice.message.tool_calls,
      },
      usage: result.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// Ollama 降级调用
// ============================================================

async function callOllamaFallback(
  messages: ChatMessage[]
): Promise<{
  message: ChatMessage;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}> {
  log.info('Falling back to Ollama for diagnostic');

  const response = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: false,
      options: {
        temperature: config.temperature,
        num_predict: config.maxTokens,
      },
    }),
    signal: AbortSignal.timeout(config.timeout),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const result = await response.json();
  return {
    message: {
      role: 'assistant',
      content: result.message?.content || '',
    },
    usage: {
      prompt_tokens: result.prompt_eval_count || 0,
      completion_tokens: result.eval_count || 0,
      total_tokens: (result.prompt_eval_count || 0) + (result.eval_count || 0),
    },
  };
}

// ============================================================
// 核心诊断逻辑（带 Tool Calling 循环）
// ============================================================

const MAX_TOOL_ROUNDS = 8; // 最多 8 轮工具调用

export async function diagnose(request: DiagnosticRequest): Promise<DiagnosticResult> {
  const startTime = Date.now();
  const session = getOrCreateSession(request.sessionId, request.deviceCode);

  // 构建用户消息
  let userContent = `请诊断设备 ${request.deviceCode} 的问题。\n\n故障描述：${request.description}`;
  if (request.sensorReadings && Object.keys(request.sensorReadings).length > 0) {
    userContent += `\n\n当前传感器读数：\n${Object.entries(request.sensorReadings)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n')}`;
  }
  if (request.mode === 'deep') {
    userContent += '\n\n请进行深度分析，尽可能多地调用工具获取数据。';
  } else if (request.mode === 'predictive') {
    userContent += '\n\n请进行预测性分析，评估设备未来可能出现的问题。';
  }

  session.messages.push({ role: 'user', content: userContent });

  let totalTokens = 0;
  let provider: 'xai' | 'ollama' = 'xai';
  let toolCallRecords: ToolCallRecord[] = [];

  // Tool Calling 循环
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let response;

    try {
      if (config.enabled && config.apiKey) {
        response = await callXaiApi(session.messages, DIAGNOSTIC_TOOLS);
      } else if (config.fallbackToOllama) {
        provider = 'ollama';
        response = await callOllamaFallback(session.messages);
      } else {
        throw new Error('xAI API key 未配置且 Ollama 降级已禁用');
      }
    } catch (err) {
      log.error(`Diagnostic API call failed (round ${round}):`, err);

      // xAI 失败时尝试 Ollama 降级
      if (provider === 'xai' && config.fallbackToOllama) {
        try {
          provider = 'ollama';
          response = await callOllamaFallback(session.messages);
        } catch (ollamaErr) {
          log.error('Ollama fallback also failed:', ollamaErr);
          throw new Error(`诊断服务不可用: xAI (${err}) / Ollama (${ollamaErr})`);
        }
      } else {
        throw err;
      }
    }

    totalTokens += response.usage.total_tokens;
    const assistantMsg = response.message;
    session.messages.push(assistantMsg);

    // 检查是否有 tool calls
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      // 没有工具调用 — 诊断完成
      break;
    }

    // 执行工具调用
    for (const toolCall of assistantMsg.tool_calls) {
      const toolStart = Date.now();
      let args: Record<string, unknown>;

      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        args = {};
        log.warn(`Failed to parse tool call arguments: ${toolCall.function.arguments}`);
      }

      log.info(`Executing tool: ${toolCall.function.name}`, { args });
      const toolResult = await executeToolCall(toolCall.function.name, args);
      const toolDuration = Date.now() - toolStart;

      toolCallRecords.push({
        tool: toolCall.function.name,
        input: args,
        output: toolResult,
        durationMs: toolDuration,
      });

      // 将工具结果添加到消息历史
      session.messages.push({
        role: 'tool',
        content: JSON.stringify(toolResult),
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
      });
    }
  }

  // 提取最终诊断结果
  const lastAssistantMsg = session.messages
    .filter(m => m.role === 'assistant')
    .pop();

  const analysisText = lastAssistantMsg?.content || '诊断未完成';

  // 解析结构化诊断结果
  const parsed = parseDiagnosticOutput(analysisText, request.deviceCode);

  const result: DiagnosticResult = {
    id: session.id,
    deviceCode: request.deviceCode,
    faultType: parsed.faultType,
    severity: parsed.severity,
    confidence: parsed.confidence,
    rootCause: parsed.rootCause,
    analysis: analysisText,
    recommendations: parsed.recommendations,
    impact: parsed.impact,
    dataSources: toolCallRecords.map(t => t.tool),
    toolCalls: toolCallRecords,
    modelInfo: {
      model: provider === 'xai' ? config.model : config.ollamaModel,
      provider,
      tokensUsed: totalTokens,
      latencyMs: Date.now() - startTime,
    },
  };

  // 异步写入数据库
  persistDiagnosticResult(result).catch(err => {
    log.error('Failed to persist diagnostic result:', err);
  });

  session.toolCalls.push(...toolCallRecords);
  log.info(`Diagnostic completed for ${request.deviceCode}`, {
    severity: result.severity,
    confidence: result.confidence,
    toolCalls: toolCallRecords.length,
    latencyMs: result.modelInfo.latencyMs,
    provider,
  });

  return result;
}

// ============================================================
// 诊断结果解析
// ============================================================

function parseDiagnosticOutput(
  text: string,
  deviceCode: string
): {
  faultType: string;
  severity: DiagnosticResult['severity'];
  confidence: number;
  rootCause: string;
  recommendations: string[];
  impact: string;
} {
  // 尝试从文本中提取结构化信息
  const severityMap: Record<string, DiagnosticResult['severity']> = {
    '紧急': 'critical', '严重': 'critical', 'critical': 'critical',
    '高': 'high', 'high': 'high',
    '中': 'medium', '中等': 'medium', 'medium': 'medium',
    '低': 'low', 'low': 'low',
    '信息': 'info', 'info': 'info',
  };

  let severity: DiagnosticResult['severity'] = 'medium';
  let confidence = 0.5;
  let faultType = '未知故障';
  let rootCause = '';
  let impact = '';
  const recommendations: string[] = [];

  // 提取严重程度
  const severityMatch = text.match(/严重程度[：:]\s*(\S+)/i) || text.match(/severity[：:]\s*(\S+)/i);
  if (severityMatch) {
    const key = severityMatch[1].toLowerCase();
    severity = severityMap[key] || 'medium';
  }

  // 提取置信度
  const confMatch = text.match(/置信度[：:]\s*([\d.]+)/i) || text.match(/confidence[：:]\s*([\d.]+)/i);
  if (confMatch) {
    const val = parseFloat(confMatch[1]);
    confidence = val > 1 ? val / 100 : val; // 支持百分比和小数
  }

  // 提取故障类型
  const faultMatch = text.match(/故障类型[：:]\s*(.+?)[\n。]/i) || text.match(/fault[：:]\s*(.+?)[\n.]/i);
  if (faultMatch) {
    faultType = faultMatch[1].trim();
  }

  // 提取根因
  const rootMatch = text.match(/根[本因]原因[：:]\s*(.+?)(?:\n\n|\n[#\-])/is) ||
    text.match(/root\s*cause[：:]\s*(.+?)(?:\n\n|\n[#\-])/is);
  if (rootMatch) {
    rootCause = rootMatch[1].trim();
  } else {
    // 取第一段作为根因
    const paragraphs = text.split('\n\n').filter(p => p.trim().length > 20);
    rootCause = paragraphs[0]?.trim() || text.substring(0, 200);
  }

  // 提取建议
  const recSection = text.match(/(?:建议|推荐|维护措施|recommendations)[：:]\s*([\s\S]+?)(?:\n\n[^-\d]|\n#{1,3}\s|$)/i);
  if (recSection) {
    const lines = recSection[1].split('\n');
    for (const line of lines) {
      const cleaned = line.replace(/^[\s\-\d.、]+/, '').trim();
      if (cleaned.length > 5) {
        recommendations.push(cleaned);
      }
    }
  }

  // 提取影响
  const impactMatch = text.match(/(?:影响|impact)[：:]\s*(.+?)(?:\n\n|\n[#\-])/is);
  if (impactMatch) {
    impact = impactMatch[1].trim();
  }

  return {
    faultType,
    severity,
    confidence: Math.max(0, Math.min(1, confidence)),
    rootCause,
    recommendations: recommendations.length > 0 ? recommendations : ['建议联系设备厂商获取专业支持'],
    impact: impact || '需要进一步评估',
  };
}

// ============================================================
// 持久化诊断结果
// ============================================================

async function persistDiagnosticResult(result: DiagnosticResult): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    await db.insert(diagnosisResults).values({
      taskId: 0, // 独立诊断任务
      deviceCode: result.deviceCode,
      diagnosisType: 'grok_agent',
      severity: result.severity,
      faultCode: result.faultType,
      faultDescription: result.rootCause,
      confidence: result.confidence,
      evidence: {
        toolCalls: result.toolCalls.map(t => ({ tool: t.tool, input: t.input })),
        modelInfo: result.modelInfo,
      },
      recommendation: result.recommendations.join('\n'),
    });

    log.info(`Diagnostic result persisted for ${result.deviceCode}`);
  } catch (err) {
    log.error('Failed to persist diagnostic result:', err);
  }
}

// ============================================================
// 导出 API
// ============================================================

/**
 * 获取诊断 agent 状态
 */
export function getAgentStatus(): {
  enabled: boolean;
  provider: string;
  model: string;
  activeSessions: number;
  config: Partial<GrokConfig>;
} {
  return {
    enabled: config.enabled || config.fallbackToOllama,
    provider: config.enabled && config.apiKey ? 'xai' : config.fallbackToOllama ? 'ollama' : 'none',
    model: config.enabled && config.apiKey ? config.model : config.ollamaModel,
    activeSessions: sessions.size,
    config: {
      apiUrl: config.apiUrl,
      model: config.model,
      timeout: config.timeout,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      fallbackToOllama: config.fallbackToOllama,
    },
  };
}

/**
 * 清除会话
 */
export function clearSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/**
 * 获取会话历史
 */
export function getSessionHistory(sessionId: string): ChatMessage[] | null {
  const session = sessions.get(sessionId);
  return session ? session.messages.filter(m => m.role !== 'system') : null;
}
