#!/usr/bin/env npx tsx
/**
 * Ollama MCP Server for Claude Code
 *
 * 将本地 Ollama llama3.1:70b 模型接入 Claude Code
 * 用于处理设备数据分析任务，数据不发送到外部 API
 *
 * 启动方式: npx tsx mcp-servers/ollama-server.ts
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// 配置
// ============================================================================

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:70b';
const REQUEST_TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT || '300000'); // 5分钟，大模型需要时间

// ============================================================================
// Ollama API 客户端
// ============================================================================

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
  };
}

interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  eval_count?: number;
}

async function ollamaGenerate(request: OllamaGenerateRequest): Promise<OllamaGenerateResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, stream: false }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    return await response.json() as OllamaGenerateResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkOllamaHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// MCP 工具定义
// ============================================================================

const TOOLS: Tool[] = [
  {
    name: 'analyze_sensor_data',
    description: `使用本地 Ollama ${DEFAULT_MODEL} 模型分析传感器数据。
数据完全在本地处理，不发送到外部服务器。
适用于：振动分析、温度趋势、电流波形、异常检测等场景。`,
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'string',
          description: '传感器数据（JSON 格式或文本描述）',
        },
        analysis_type: {
          type: 'string',
          enum: ['anomaly_detection', 'trend_analysis', 'pattern_recognition', 'root_cause', 'general'],
          description: '分析类型',
          default: 'general',
        },
        device_type: {
          type: 'string',
          description: '设备类型（如：岸桥、堆场起重机、叉车等）',
        },
        context: {
          type: 'string',
          description: '额外上下文信息（工况、历史故障等）',
        },
      },
      required: ['data'],
    },
  },
  {
    name: 'diagnose_equipment',
    description: `使用本地 Ollama ${DEFAULT_MODEL} 模型进行设备诊断。
基于物理机理和数据驱动双轨分析，给出诊断结论和维护建议。`,
    inputSchema: {
      type: 'object',
      properties: {
        device_id: {
          type: 'string',
          description: '设备编号',
        },
        symptoms: {
          type: 'string',
          description: '故障症状描述',
        },
        sensor_readings: {
          type: 'string',
          description: '相关传感器读数（JSON 格式）',
        },
        maintenance_history: {
          type: 'string',
          description: '维护历史记录',
        },
      },
      required: ['device_id', 'symptoms'],
    },
  },
  {
    name: 'explain_physics',
    description: `使用本地 Ollama ${DEFAULT_MODEL} 模型解释物理机理。
解答港机设备相关的物理原理问题，如振动传递、热传导、电机特性等。`,
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: '物理机理问题',
        },
        equipment_context: {
          type: 'string',
          description: '设备背景（可选）',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'generate_report',
    description: `使用本地 Ollama ${DEFAULT_MODEL} 模型生成诊断报告。
将诊断结果转化为运维人员可理解的自然语言报告。`,
    inputSchema: {
      type: 'object',
      properties: {
        diagnosis_result: {
          type: 'string',
          description: '诊断结果（JSON 格式）',
        },
        report_type: {
          type: 'string',
          enum: ['summary', 'detailed', 'maintenance_order'],
          description: '报告类型',
          default: 'summary',
        },
        audience: {
          type: 'string',
          enum: ['operator', 'engineer', 'manager'],
          description: '目标受众',
          default: 'operator',
        },
      },
      required: ['diagnosis_result'],
    },
  },
  {
    name: 'local_chat',
    description: `与本地 Ollama ${DEFAULT_MODEL} 模型进行通用对话。
适用于需要本地 LLM 处理但不涉及敏感数据分析的场景。`,
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: '对话消息',
        },
        system_prompt: {
          type: 'string',
          description: '系统提示词（可选）',
        },
        temperature: {
          type: 'number',
          description: '温度参数 (0-1)',
          default: 0.7,
        },
      },
      required: ['message'],
    },
  },
];

// ============================================================================
// 工具处理器
// ============================================================================

async function handleTool(name: string, args: Record<string, unknown>): Promise<string> {
  // 检查 Ollama 服务状态
  const isHealthy = await checkOllamaHealth();
  if (!isHealthy) {
    throw new Error(`Ollama 服务不可用，请确保 Ollama 正在运行于 ${OLLAMA_BASE_URL}`);
  }

  switch (name) {
    case 'analyze_sensor_data': {
      const prompt = buildSensorAnalysisPrompt(args);
      const result = await ollamaGenerate({
        model: DEFAULT_MODEL,
        prompt,
        options: { temperature: 0.3 },
      });
      return formatAnalysisResult(result.response, 'sensor_analysis');
    }

    case 'diagnose_equipment': {
      const prompt = buildDiagnosisPrompt(args);
      const result = await ollamaGenerate({
        model: DEFAULT_MODEL,
        prompt,
        options: { temperature: 0.2 },
      });
      return formatAnalysisResult(result.response, 'diagnosis');
    }

    case 'explain_physics': {
      const prompt = buildPhysicsPrompt(args);
      const result = await ollamaGenerate({
        model: DEFAULT_MODEL,
        prompt,
        options: { temperature: 0.5 },
      });
      return result.response;
    }

    case 'generate_report': {
      const prompt = buildReportPrompt(args);
      const result = await ollamaGenerate({
        model: DEFAULT_MODEL,
        prompt,
        options: { temperature: 0.4 },
      });
      return result.response;
    }

    case 'local_chat': {
      const systemPrompt = args.system_prompt as string || '';
      const message = args.message as string;
      const temperature = args.temperature as number || 0.7;

      const prompt = systemPrompt
        ? `${systemPrompt}\n\nUser: ${message}\n\nAssistant:`
        : message;

      const result = await ollamaGenerate({
        model: DEFAULT_MODEL,
        prompt,
        options: { temperature },
      });
      return result.response;
    }

    default:
      throw new Error(`未知工具: ${name}`);
  }
}

// ============================================================================
// Prompt 构建器
// ============================================================================

function buildSensorAnalysisPrompt(args: Record<string, unknown>): string {
  const data = args.data as string;
  const analysisType = args.analysis_type as string || 'general';
  const deviceType = args.device_type as string || '工业设备';
  const context = args.context as string || '';

  const analysisInstructions: Record<string, string> = {
    anomaly_detection: '识别数据中的异常点、突变和偏离正常范围的值。给出异常严重程度评估。',
    trend_analysis: '分析数据的变化趋势，识别上升、下降、周期性模式。预测未来趋势。',
    pattern_recognition: '识别数据中的重复模式、特征波形、周期性规律。',
    root_cause: '基于数据特征推断可能的故障根因，给出因果分析。',
    general: '全面分析数据特征，包括统计特性、异常检测、趋势判断。',
  };

  return `你是一位港口机械设备诊断专家。请分析以下传感器数据。

设备类型: ${deviceType}
分析类型: ${analysisType}
${context ? `背景信息: ${context}` : ''}

分析要求:
${analysisInstructions[analysisType] || analysisInstructions.general}

传感器数据:
${data}

请提供:
1. 数据概览（关键统计指标）
2. 异常识别（如有）
3. 分析结论
4. 建议措施

注意：使用中文回复，保持专业但易于理解。`;
}

function buildDiagnosisPrompt(args: Record<string, unknown>): string {
  const deviceId = args.device_id as string;
  const symptoms = args.symptoms as string;
  const sensorReadings = args.sensor_readings as string || '无';
  const maintenanceHistory = args.maintenance_history as string || '无';

  return `你是一位港口机械设备诊断专家，具备机械、电气、控制系统的综合知识。

设备编号: ${deviceId}

故障症状:
${symptoms}

传感器读数:
${sensorReadings}

维护历史:
${maintenanceHistory}

请进行诊断分析，给出:

1. **初步诊断**
   - 可能的故障类型
   - 置信度评估（高/中/低）

2. **故障机理分析**
   - 物理原理解释
   - 故障发展路径

3. **鉴别诊断**
   - 需要排除的其他可能性
   - 建议的验证测试

4. **维护建议**
   - 紧急程度（立即/计划内/监控）
   - 具体维护步骤
   - 所需备件/工具

5. **预防措施**
   - 防止复发的建议

请用中文回复，语言专业但清晰。`;
}

function buildPhysicsPrompt(args: Record<string, unknown>): string {
  const question = args.question as string;
  const equipmentContext = args.equipment_context as string || '';

  return `你是一位精通港口机械设备的物理学专家。

问题: ${question}
${equipmentContext ? `设备背景: ${equipmentContext}` : ''}

请从物理机理角度解答：
1. 基本原理
2. 数学描述（如适用）
3. 实际应用
4. 与设备故障的关联

用中文回复，适当使用公式但重点在于解释。`;
}

function buildReportPrompt(args: Record<string, unknown>): string {
  const diagnosisResult = args.diagnosis_result as string;
  const reportType = args.report_type as string || 'summary';
  const audience = args.audience as string || 'operator';

  const audienceInstructions: Record<string, string> = {
    operator: '使用通俗易懂的语言，避免技术术语，重点在于"做什么"而非"为什么"',
    engineer: '可以使用技术术语，包含诊断依据和技术细节',
    manager: '突出业务影响、风险评估、资源需求，简洁明了',
  };

  const typeInstructions: Record<string, string> = {
    summary: '简明扼要，1-2段话概括',
    detailed: '完整详细，包含所有技术细节',
    maintenance_order: '格式化为维护工单，包含步骤、工时、备件清单',
  };

  return `将以下诊断结果转化为${reportType === 'summary' ? '简明' : reportType === 'detailed' ? '详细' : '工单格式'}报告。

目标读者: ${audience}
写作要求: ${audienceInstructions[audience]}
格式要求: ${typeInstructions[reportType]}

诊断结果:
${diagnosisResult}

请生成报告：`;
}

function formatAnalysisResult(response: string, type: string): string {
  return `[${type.toUpperCase()}] 本地 Ollama 分析结果\n${'─'.repeat(50)}\n\n${response}`;
}

// ============================================================================
// MCP Server 主程序
// ============================================================================

async function main() {
  const server = new Server(
    {
      name: 'ollama-local-analyzer',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // 注册工具列表处理器
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // 注册工具调用处理器
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await handleTool(name, args as Record<string, unknown>);
      return {
        content: [{ type: 'text', text: result }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `错误: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  // 启动服务器
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // 输出到 stderr（stdout 用于 MCP 通信）
  console.error(`Ollama MCP Server started`);
  console.error(`  Model: ${DEFAULT_MODEL}`);
  console.error(`  Ollama URL: ${OLLAMA_BASE_URL}`);
  console.error(`  Timeout: ${REQUEST_TIMEOUT}ms`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
