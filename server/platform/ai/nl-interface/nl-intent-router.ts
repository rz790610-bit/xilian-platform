/**
 * ============================================================================
 * NL 意图分类与路由引擎
 * ============================================================================
 *
 * 职责：
 *   1. 意图分类 — 将用户自然语言查询映射为 12 种标准意图类型
 *   2. 执行路由 — 为每种意图生成工具调用执行计划
 *   3. 响应格式化 — 将工具执行结果合成为中文自然语言回答
 *
 * 分类策略（双轨）：
 *   - 主路径：LLM 分类（使用快速模型，支持复杂上下文理解）
 *   - 降级路径：规则分类（关键词匹配，LLM 不可用时自动降级）
 *
 * 支持的 12 种意图类型：
 *   device_status_query, sensor_data_query, diagnosis_query,
 *   alert_query, maintenance_query, comparison_query,
 *   prediction_query, knowledge_query, operation_query,
 *   report_query, config_query, general_query
 */

import { createModuleLogger } from '../../../core/logger';
import { invokeLLM } from '../../../core/llm';
import { getAIConfig } from '../ai.config';
import { resolveDeviceReference, getVocabularySummary, normalizeDeviceId } from './nl-vocabulary';
import type {
  IntentClassification,
  IntentType,
  EntityReference,
  ExecutionPlan,
  ExecutionResult,
  NLFormattedResponse,
  ChartSpec,
} from '../ai.types';

const log = createModuleLogger('nl-intent-router');

/** 所有支持的意图类型常量 */
const ALL_INTENT_TYPES: IntentType[] = [
  'device_status_query',
  'sensor_data_query',
  'diagnosis_query',
  'alert_query',
  'maintenance_query',
  'comparison_query',
  'prediction_query',
  'knowledge_query',
  'operation_query',
  'report_query',
  'config_query',
  'general_query',
];

/** 意图分类关键词映射（规则降级用） */
const INTENT_KEYWORDS: Record<IntentType, string[]> = {
  device_status_query: ['状态', '运行', '开机', '停机', '在线', '离线', '健康', '怎么样'],
  sensor_data_query: ['振动', '温度', '电流', '电压', '转速', '风速', '载荷', '油压', '噪声', '趋势', '数据', '曲线', '波形'],
  diagnosis_query: ['诊断', '故障', '异常', '原因', '什么问题', '怎么回事', '为什么', '根因'],
  alert_query: ['告警', '报警', '警告', '警报', '有没有告警', '几个告警'],
  maintenance_query: ['维修', '维保', '保养', '检修', '什么时候修', '维修计划', '工单'],
  comparison_query: ['对比', '比较', '哪个', '哪台', '最高', '最低', '排名', '横向'],
  prediction_query: ['预测', '预计', '还能用', '寿命', '剩余', '趋势预测', '会不会坏'],
  knowledge_query: ['知识', '标准', '规范', '原理', '什么是', '解释', '手册', '技术要求'],
  operation_query: ['操作', '怎么操作', '步骤', '流程', '如何', '启动', '关闭'],
  report_query: ['报告', '报表', '统计', '汇总', '周报', '月报', '总结'],
  config_query: ['配置', '设置', '参数', '阈值', '修改', '调整'],
  general_query: [],
};

// ============================================================================
// NLIntentRouter 核心类
// ============================================================================

export class NLIntentRouter {
  /**
   * 意图分类 — 主入口
   *
   * 优先使用 LLM 分类，失败时降级为规则分类。
   *
   * @param input - 用户输入的自然语言查询
   * @returns 意图分类结果
   */
  async classifyIntent(input: string): Promise<IntentClassification> {
    const config = getAIConfig();
    const startMs = Date.now();

    // 预提取实体（词汇表匹配，无需 LLM）
    const deviceRef = resolveDeviceReference(input);
    const entities = this.buildEntities(deviceRef, input);

    try {
      // 主路径：LLM 分类
      const classification = await this.classifyByLLM(input, entities, config.nl.intentModel);
      const durationMs = Date.now() - startMs;
      log.info(
        { intent: classification.intent, confidence: classification.confidence, durationMs, method: 'llm' },
        '意图分类完成（LLM）'
      );
      return classification;
    } catch (err: any) {
      // 降级路径：规则分类
      log.warn({ err: err.message }, '意图分类 LLM 调用失败，降级为规则分类');
      const classification = this.classifyByRules(input);
      classification.entities = entities;
      const durationMs = Date.now() - startMs;
      log.info(
        { intent: classification.intent, confidence: classification.confidence, durationMs, method: 'rules' },
        '意图分类完成（规则降级）'
      );
      return classification;
    }
  }

  /**
   * 将意图路由为执行计划
   *
   * 根据意图类型生成有序的工具调用步骤列表。
   *
   * @param intent - 意图分类结果
   * @returns 执行计划
   */
  async routeToExecution(intent: IntentClassification): Promise<ExecutionPlan> {
    const machineId = this.extractMachineId(intent);

    switch (intent.intent) {
      case 'device_status_query':
        return {
          steps: [
            ...(machineId ? [] : [{
              tool: 'resolve_device_reference',
              input: { text: intent.originalQuery },
              description: '解析设备引用',
            }]),
            {
              tool: 'query_device_status_summary',
              input: { machineId: machineId || '__RESOLVED__' },
              description: '查询设备运行状态',
            },
          ],
          estimatedDurationMs: 2000,
        };

      case 'sensor_data_query':
        return {
          steps: [
            ...(machineId ? [] : [{
              tool: 'resolve_device_reference',
              input: { text: intent.originalQuery },
              description: '解析设备引用',
            }]),
            {
              tool: 'query_sensor_realtime',
              input: {
                machineId: machineId || '__RESOLVED__',
                sensorIds: this.extractSensorIds(intent),
                timeRange: intent.timeRange || this.defaultTimeRange(),
                aggregation: '5min',
              },
              description: '查询传感器实时数据',
            },
            {
              tool: 'generate_trend_chart',
              input: {
                machineId: machineId || '__RESOLVED__',
                sensorType: this.extractSensorIds(intent)[0] || 'vibration',
                timeRange: intent.timeRange || this.defaultTimeRange(),
              },
              description: '生成趋势图表',
            },
          ],
          estimatedDurationMs: 5000,
        };

      case 'diagnosis_query':
        return {
          steps: [
            ...(machineId ? [] : [{
              tool: 'resolve_device_reference',
              input: { text: intent.originalQuery },
              description: '解析设备引用',
            }]),
            {
              tool: 'diagnostic_enhancer',
              input: {
                machineId: machineId || '__RESOLVED__',
                query: intent.originalQuery,
                depth: 'standard',
              },
              description: '调用诊断增强引擎',
            },
          ],
          estimatedDurationMs: 15000,
          fallbackPlan: {
            steps: [{
              tool: 'search_similar_cases',
              input: {
                symptoms: [intent.originalQuery],
                topK: 3,
              },
              description: '搜索相似历史案例（降级）',
            }],
            estimatedDurationMs: 5000,
          },
        };

      case 'alert_query':
        return {
          steps: [{
            tool: 'query_alert_summary',
            input: {
              machineId: machineId || undefined,
              timeRange: intent.timeRange || undefined,
              severity: (intent.parameters?.severity as string) || undefined,
            },
            description: '查询告警统计',
          }],
          estimatedDurationMs: 2000,
        };

      case 'maintenance_query':
        return {
          steps: [{
            tool: 'query_maintenance_schedule',
            input: {
              machineId: machineId || undefined,
              days: (intent.parameters?.days as number) || 30,
            },
            description: '查询维保计划',
          }],
          estimatedDurationMs: 2000,
        };

      case 'comparison_query':
        return {
          steps: [{
            tool: 'generate_comparison_report',
            input: {
              machineIds: (intent.parameters?.machineIds as string[]) || this.extractComparisonMachineIds(intent),
              metrics: (intent.parameters?.metrics as string[]) || ['healthScore', 'vibration', 'temperature'],
            },
            description: '生成跨设备对比报告',
          }],
          estimatedDurationMs: 5000,
        };

      case 'prediction_query':
        return {
          steps: [
            ...(machineId ? [] : [{
              tool: 'resolve_device_reference',
              input: { text: intent.originalQuery },
              description: '解析设备引用',
            }]),
            {
              tool: 'predict_device_state',
              input: {
                machineId: machineId || '__RESOLVED__',
                horizonMinutes: (intent.parameters?.horizonMinutes as number) || 1440,
              },
              description: '调用世界模型预测设备状态',
            },
          ],
          estimatedDurationMs: 8000,
        };

      case 'knowledge_query':
        return {
          steps: [{
            tool: 'query_knowledge_graph',
            input: {
              cypher: this.buildKnowledgeCypher(intent),
              parameters: {},
            },
            description: '查询知识图谱',
          }],
          estimatedDurationMs: 3000,
          fallbackPlan: {
            steps: [{
              tool: 'llm_direct',
              input: { query: intent.originalQuery },
              description: 'LLM 直接回答知识问题（降级）',
            }],
            estimatedDurationMs: 5000,
          },
        };

      case 'operation_query':
        return {
          steps: [{
            tool: 'query_knowledge_graph',
            input: {
              cypher: `MATCH (op:OperationProcedure) WHERE op.name CONTAINS $keyword RETURN op LIMIT 5`,
              parameters: { keyword: this.extractOperationKeyword(intent) },
            },
            description: '查询操作规程',
          }],
          estimatedDurationMs: 3000,
          fallbackPlan: {
            steps: [{
              tool: 'llm_direct',
              input: { query: intent.originalQuery },
              description: 'LLM 直接回答操作问题（降级）',
            }],
            estimatedDurationMs: 5000,
          },
        };

      case 'report_query':
        return {
          steps: [
            {
              tool: 'query_device_status_summary',
              input: { machineId: machineId || '__ALL__' },
              description: '查询设备状态（报告数据源）',
            },
            {
              tool: 'query_alert_summary',
              input: {
                machineId: machineId || undefined,
                timeRange: intent.timeRange || this.defaultTimeRange(),
              },
              description: '查询告警统计（报告数据源）',
            },
          ],
          estimatedDurationMs: 5000,
        };

      case 'config_query':
        return {
          steps: [{
            tool: 'llm_direct',
            input: { query: intent.originalQuery },
            description: '回答配置相关问题',
          }],
          estimatedDurationMs: 3000,
        };

      case 'general_query':
      default:
        return {
          steps: [{
            tool: 'llm_direct',
            input: { query: intent.originalQuery },
            description: 'LLM 直接回答通用问题',
          }],
          estimatedDurationMs: 5000,
        };
    }
  }

  /**
   * 将执行结果格式化为自然语言响应
   *
   * 使用 LLM 将结构化的工具执行结果综合为中文自然语言回答。
   * LLM 不可用时降级为模板拼接。
   *
   * @param results - 工具执行结果列表
   * @param query - 原始用户查询
   * @returns 格式化的自然语言响应
   */
  async formatResponse(results: ExecutionResult[], query: string): Promise<NLFormattedResponse> {
    const config = getAIConfig();

    try {
      const resultsSummary = results.map(r => ({
        tool: r.tool,
        success: r.success,
        data: r.success ? r.data : { error: r.error },
      }));

      const response = await invokeLLM({
        messages: [
          {
            role: 'system',
            content: `你是港机设备智能运维平台的自然语言助手。请根据以下工具执行结果，用中文自然语言回答用户的问题。

要求：
1. 回答必须简洁清晰，使用中文
2. 如果有数值数据，使用合适的单位
3. 如果数据不完整或工具执行失败，诚实说明并给出建议
4. 在回答末尾提供 2-3 个后续建议问题
5. 输出格式为 JSON: { "answer": "...", "suggestions": ["..."] }`,
          },
          {
            role: 'user',
            content: `用户问题: ${query}\n\n工具执行结果:\n${JSON.stringify(resultsSummary, null, 2)}`,
          },
        ],
        model: config.nl.responseModel,
        maxTokens: 1024,
        responseFormat: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      const parsed = this.safeParseJSON<{ answer: string; suggestions?: string[] }>(
        typeof content === 'string' ? content : ''
      );

      // 提取图表规格
      const charts = this.extractCharts(results);

      return {
        answer: parsed?.answer || this.fallbackFormat(results, query),
        charts,
        suggestions: parsed?.suggestions || this.defaultSuggestions(query),
        confidence: results.every(r => r.success) ? 0.9 : 0.5,
      };
    } catch (err: any) {
      log.warn({ err: err.message }, '响应格式化 LLM 调用失败，使用模板降级');
      return {
        answer: this.fallbackFormat(results, query),
        charts: this.extractCharts(results),
        suggestions: this.defaultSuggestions(query),
        confidence: 0.3,
      };
    }
  }

  // ==========================================================================
  // LLM 分类（主路径）
  // ==========================================================================

  /**
   * 使用 LLM 进行意图分类
   */
  private async classifyByLLM(
    input: string,
    entities: EntityReference[],
    model: string
  ): Promise<IntentClassification> {
    const vocabSummary = getVocabularySummary();

    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: `你是港机设备运维平台的意图分类器。请分析用户查询，输出 JSON 格式的分类结果。

可用意图类型：
- device_status_query: 设备运行状态查询（如"3号岸桥状态"）
- sensor_data_query: 传感器数据查询（如"振动趋势"）
- diagnosis_query: 故障诊断查询（如"什么原因"）
- alert_query: 告警查询（如"有几个告警"）
- maintenance_query: 维保查询（如"什么时候维修"）
- comparison_query: 设备对比查询（如"哪台振动最大"）
- prediction_query: 预测查询（如"还能用多久"）
- knowledge_query: 知识查询（如"什么是S-N曲线"）
- operation_query: 操作流程查询（如"怎么启动"）
- report_query: 报告报表查询（如"月度报告"）
- config_query: 配置查询（如"阈值设置"）
- general_query: 通用查询（不属于以上类别）

领域词汇：
${vocabSummary}

输出格式（JSON）：
{
  "intent": "意图类型",
  "confidence": 0.0-1.0,
  "timeRange": { "start": "ISO8601", "end": "ISO8601" } // 可选
  "parameters": {} // 附加参数
}`,
        },
        {
          role: 'user',
          content: input,
        },
      ],
      model,
      maxTokens: 256,
      responseFormat: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    const parsed = this.safeParseJSON<{
      intent: string;
      confidence: number;
      timeRange?: { start?: string; end?: string };
      parameters?: Record<string, unknown>;
    }>(typeof content === 'string' ? content : '');

    if (!parsed || !parsed.intent) {
      throw new Error('LLM 返回无效的意图分类结果');
    }

    // 校验意图类型合法性
    const intent = ALL_INTENT_TYPES.includes(parsed.intent as IntentType)
      ? (parsed.intent as IntentType)
      : 'general_query';

    return {
      intent,
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      entities,
      timeRange: parsed.timeRange,
      parameters: parsed.parameters || {},
      originalQuery: input,
    };
  }

  // ==========================================================================
  // 规则分类（降级路径）
  // ==========================================================================

  /**
   * 基于关键词匹配的规则分类
   *
   * 遍历所有意图类型的关键词列表，统计匹配数，选择匹配最多的意图。
   * 当 LLM 不可用时作为降级方案。
   */
  private classifyByRules(input: string): IntentClassification {
    let bestIntent: IntentType = 'general_query';
    let bestScore = 0;

    for (const intentType of ALL_INTENT_TYPES) {
      if (intentType === 'general_query') continue;

      const keywords = INTENT_KEYWORDS[intentType];
      let score = 0;
      for (const kw of keywords) {
        if (input.includes(kw)) {
          score += 1;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestIntent = intentType;
      }
    }

    // 置信度：基于匹配关键词占比
    const totalKeywords = INTENT_KEYWORDS[bestIntent]?.length || 1;
    const confidence = bestScore > 0
      ? Math.min(0.8, 0.3 + (bestScore / totalKeywords) * 0.5)
      : 0.2;

    return {
      intent: bestIntent,
      confidence,
      entities: [],
      parameters: {},
      originalQuery: input,
    };
  }

  // ==========================================================================
  // 辅助方法
  // ==========================================================================

  /**
   * 从词汇表匹配结果构建实体引用列表
   */
  private buildEntities(
    deviceRef: { type?: string; number?: string; mechanism?: string; component?: string },
    originalText: string
  ): EntityReference[] {
    const entities: EntityReference[] = [];

    if (deviceRef.type && deviceRef.number) {
      entities.push({
        type: 'machine',
        id: normalizeDeviceId(deviceRef.type, deviceRef.number),
        originalText,
        normalizedName: `${deviceRef.type}-${deviceRef.number}`,
      });
    } else if (deviceRef.type) {
      entities.push({
        type: 'machine',
        id: deviceRef.type,
        originalText,
        normalizedName: deviceRef.type,
      });
    }

    if (deviceRef.mechanism) {
      entities.push({
        type: 'mechanism',
        id: deviceRef.mechanism,
        originalText,
        normalizedName: deviceRef.mechanism,
      });
    }

    if (deviceRef.component) {
      entities.push({
        type: 'component',
        id: deviceRef.component,
        originalText,
        normalizedName: deviceRef.component,
      });
    }

    return entities;
  }

  /**
   * 从意图分类结果中提取标准化设备ID
   */
  private extractMachineId(intent: IntentClassification): string | undefined {
    const machineEntity = intent.entities.find(e => e.type === 'machine');
    return machineEntity?.id;
  }

  /**
   * 从意图分类结果中提取传感器类型ID列表
   */
  private extractSensorIds(intent: IntentClassification): string[] {
    const sensorEntity = intent.entities.find(e => e.type === 'sensor');
    if (sensorEntity) return [sensorEntity.id];

    // 从参数中尝试提取
    const sensorType = intent.parameters?.sensorType as string | undefined;
    if (sensorType) return [sensorType];

    return ['vibration']; // 默认查询振动
  }

  /**
   * 从意图中提取对比设备ID列表
   */
  private extractComparisonMachineIds(intent: IntentClassification): string[] {
    const machineEntities = intent.entities.filter(e => e.type === 'machine');
    if (machineEntities.length >= 2) {
      return machineEntities.map(e => e.id);
    }
    // 默认返回空数组，工具层会处理
    return [];
  }

  /**
   * 构建知识图谱查询 Cypher
   */
  private buildKnowledgeCypher(intent: IntentClassification): string {
    const keyword = intent.originalQuery.slice(0, 50);
    return `MATCH (n) WHERE n.name CONTAINS "${keyword}" OR n.description CONTAINS "${keyword}" RETURN n LIMIT 10`;
  }

  /**
   * 提取操作关键词
   */
  private extractOperationKeyword(intent: IntentClassification): string {
    // 去除常见疑问词，提取操作关键词
    const cleaned = intent.originalQuery
      .replace(/怎么|如何|请问|帮我|操作|步骤|流程/g, '')
      .trim();
    return cleaned || intent.originalQuery;
  }

  /**
   * 默认时间范围（最近24小时）
   */
  private defaultTimeRange(): { start: string; end: string } {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return {
      start: yesterday.toISOString(),
      end: now.toISOString(),
    };
  }

  /**
   * 从执行结果中提取图表规格
   */
  private extractCharts(results: ExecutionResult[]): ChartSpec[] {
    const charts: ChartSpec[] = [];
    for (const result of results) {
      if (!result.success || !result.data) continue;
      const data = result.data as Record<string, unknown>;
      if (data.chartSpec && typeof data.chartSpec === 'object') {
        charts.push(data.chartSpec as ChartSpec);
      }
    }
    return charts;
  }

  /**
   * 降级格式化 — 不依赖 LLM 的模板化回答
   */
  private fallbackFormat(results: ExecutionResult[], query: string): string {
    const successResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);

    if (successResults.length === 0 && failedResults.length > 0) {
      return `抱歉，处理您的问题"${query}"时遇到了问题。${failedResults.map(r => r.error).join('；')}。请稍后重试或换一种方式描述。`;
    }

    if (successResults.length === 0) {
      return `抱歉，暂时无法回答"${query}"。请尝试更具体的问题描述。`;
    }

    const parts: string[] = [];
    for (const result of successResults) {
      parts.push(`[${result.tool}] ${JSON.stringify(result.data)}`);
    }

    return `以下是查询结果：\n${parts.join('\n')}`;
  }

  /**
   * 默认后续建议
   */
  private defaultSuggestions(query: string): string[] {
    return [
      '查看设备健康趋势',
      '查看最近告警',
      '查看维保计划',
    ];
  }

  /**
   * 安全 JSON 解析，失败返回 null
   */
  private safeParseJSON<T>(text: string): T | null {
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }
}
