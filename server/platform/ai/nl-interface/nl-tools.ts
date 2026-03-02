/**
 * ============================================================================
 * NL 接口专用 GrokTool 定义 — 6 个自然语言查询工具
 * ============================================================================
 *
 * 工具清单：
 *   1. resolve_device_reference   — 解析自然语言设备引用为结构化ID
 *   2. query_device_status_summary — 查询设备状态摘要
 *   3. query_alert_summary         — 查询告警统计
 *   4. query_maintenance_schedule  — 查询维保计划
 *   5. generate_trend_chart        — 生成趋势图表规格
 *   6. generate_comparison_report  — 生成跨设备对比报告
 *
 * 这些工具专为自然语言交互场景设计，返回人类可读的摘要数据。
 * 与 grok-tools.ts 中的诊断工具互补，不重叠。
 */

import { z } from 'zod';
import type { GrokTool, ToolContext } from '../../cognition/grok/grok-tools';
import { createModuleLogger } from '../../../core/logger';
import { resolveDeviceReference, normalizeDeviceId, DEVICE_TYPE_VOCAB } from './nl-vocabulary';
import type { ChartSpec } from '../ai.types';

const log = createModuleLogger('nl-tools');

// ============================================================================
// 工具 1: 解析自然语言设备引用
// ============================================================================

/**
 * 将用户输入的自然语言设备描述解析为结构化设备标识。
 * 例如："3号岸桥起升电机" → { type: 'STS', id: 'STS-003', mechanism: 'hoist', component: 'motor' }
 */
const resolveDeviceReferenceTool: GrokTool = {
  name: 'resolve_device_reference',
  description: '解析自然语言中的设备引用。将中文设备描述（如"3号岸桥起升电机"）转换为标准化设备ID和部件路径。',
  loopStage: 'utility',
  inputSchema: z.object({
    text: z.string().describe('包含设备引用的自然语言文本'),
  }),
  outputSchema: z.object({
    type: z.string().optional().describe('设备类型码（如 STS, RTG）'),
    id: z.string().optional().describe('标准化设备ID（如 STS-003）'),
    mechanism: z.string().optional().describe('机构码（如 hoist, trolley）'),
    component: z.string().optional().describe('部件码（如 motor, gearbox）'),
    confidence: z.number().describe('解析置信度 (0-1)'),
  }),
  execute: async (input: { text: string }, _context: ToolContext) => {
    const startMs = Date.now();
    try {
      const ref = resolveDeviceReference(input.text);

      // 计算置信度：每识别出一项加 0.25
      let confidencePoints = 0;
      if (ref.type) confidencePoints += 0.3;
      if (ref.number) confidencePoints += 0.3;
      if (ref.mechanism) confidencePoints += 0.2;
      if (ref.component) confidencePoints += 0.2;

      const id = ref.type && ref.number
        ? normalizeDeviceId(ref.type, ref.number)
        : undefined;

      log.debug(
        { text: input.text, resolved: { ...ref, id }, confidence: confidencePoints, durationMs: Date.now() - startMs },
        '设备引用解析完成'
      );

      return {
        type: ref.type,
        id,
        mechanism: ref.mechanism,
        component: ref.component,
        confidence: confidencePoints,
      };
    } catch (err: any) {
      log.warn({ text: input.text, err: err.message }, '设备引用解析失败，返回空结果');
      return { confidence: 0 };
    }
  },
};

// ============================================================================
// 工具 2: 查询设备状态摘要
// ============================================================================

/**
 * 查询指定设备的运行状态摘要，返回人类可读的概览信息。
 * 包含健康分、近期告警、活跃故障和最后维保时间。
 */
const queryDeviceStatusSummary: GrokTool = {
  name: 'query_device_status_summary',
  description: '查询指定设备的运行状态摘要。返回健康评分、近期告警数、活跃故障和最后维保时间。',
  loopStage: 'utility',
  inputSchema: z.object({
    machineId: z.string().describe('设备ID（如 STS-003）'),
  }),
  outputSchema: z.object({
    status: z.string().describe('运行状态：running/stopped/alarm/fault'),
    healthScore: z.number().describe('健康评分 (0-100)'),
    recentAlerts: z.number().describe('近24小时告警数'),
    activeFaults: z.array(z.object({
      faultCode: z.string(),
      faultName: z.string(),
      severity: z.string(),
      occurredAt: z.string(),
    })).describe('当前活跃故障列表'),
    lastMaintenance: z.string().optional().describe('最后维保时间 ISO8601'),
  }),
  execute: async (input: { machineId: string }, _context: ToolContext) => {
    const startMs = Date.now();
    try {
      // Phase 4 实现 — 从 AlertEventSubscriber 查询实时告警数据
      const { getAlertEventSubscriber } = await import('../../../services/alert-event-subscriber.service');
      const subscriber = getAlertEventSubscriber();
      const summary = await subscriber.getDeviceAlertSummary(input.machineId);

      log.debug({ machineId: input.machineId, durationMs: Date.now() - startMs, alerts: summary.recentAlerts }, '设备状态查询完成');

      return {
        status: summary.activeFaults.length > 0 ? 'warning' : 'running',
        healthScore: Math.max(0, 100 - summary.activeFaults.length * 15 - summary.recentAlerts * 2),
        recentAlerts: summary.recentAlerts,
        activeFaults: summary.activeFaults,
        lastMaintenance: undefined,
      };
    } catch (err: any) {
      log.warn({ machineId: input.machineId, err: err.message }, '设备状态查询失败');
      return {
        status: 'unknown',
        healthScore: -1,
        recentAlerts: -1,
        activeFaults: [],
        lastMaintenance: undefined,
      };
    }
  },
};

// ============================================================================
// 工具 3: 查询告警摘要
// ============================================================================

/**
 * 查询告警统计和最近告警列表。
 * 支持按设备、时间范围、严重级别过滤。
 */
const queryAlertSummary: GrokTool = {
  name: 'query_alert_summary',
  description: '查询告警统计和最近告警列表。支持按设备ID、时间范围、严重级别过滤。',
  loopStage: 'utility',
  inputSchema: z.object({
    machineId: z.string().optional().describe('设备ID过滤（不传则查全部）'),
    timeRange: z.object({
      start: z.string().describe('开始时间 ISO8601'),
      end: z.string().describe('结束时间 ISO8601'),
    }).optional().describe('时间范围过滤'),
    severity: z.string().optional().describe('严重级别过滤：info/warning/error/critical'),
  }),
  outputSchema: z.object({
    totalAlerts: z.number().describe('告警总数'),
    bySeverity: z.record(z.string(), z.number()).describe('按严重级别统计'),
    recentAlerts: z.array(z.object({
      alertId: z.string(),
      machineId: z.string(),
      severity: z.string(),
      message: z.string(),
      occurredAt: z.string(),
    })).describe('最近告警列表（最多20条）'),
  }),
  execute: async (
    input: { machineId?: string; timeRange?: { start: string; end: string }; severity?: string },
    _context: ToolContext
  ) => {
    const startMs = Date.now();
    try {
      // Phase 4 实现 — 从 AlertEventSubscriber 查询实时告警数据
      const { getAlertEventSubscriber } = await import('../../../services/alert-event-subscriber.service');
      const subscriber = getAlertEventSubscriber();
      const result = await subscriber.queryAlertRecords({
        deviceCode: input.machineId,
        severity: input.severity,
        startTime: input.timeRange?.start ? new Date(input.timeRange.start) : undefined,
        endTime: input.timeRange?.end ? new Date(input.timeRange.end) : undefined,
        limit: 20,
      });

      log.debug({ machineId: input.machineId, severity: input.severity, total: result.totalAlerts, durationMs: Date.now() - startMs }, '告警摘要查询完成');

      return result;
    } catch (err: any) {
      log.warn({ machineId: input.machineId, err: err.message }, '告警摘要查询失败');
      return {
        totalAlerts: -1,
        bySeverity: {},
        recentAlerts: [],
      };
    }
  },
};

// ============================================================================
// 工具 4: 查询维保计划
// ============================================================================

/**
 * 查询即将到来的维保任务和逾期任务统计。
 * 用于回答用户关于"什么时候需要维修"类问题。
 */
const queryMaintenanceSchedule: GrokTool = {
  name: 'query_maintenance_schedule',
  description: '查询维保计划。返回未来N天内的维保任务列表和逾期任务数。',
  loopStage: 'utility',
  inputSchema: z.object({
    machineId: z.string().optional().describe('设备ID过滤（不传则查全部）'),
    days: z.number().default(30).describe('查询未来多少天内的维保任务'),
  }),
  outputSchema: z.object({
    upcomingTasks: z.array(z.object({
      taskId: z.string(),
      machineId: z.string(),
      taskType: z.string(),
      description: z.string(),
      scheduledDate: z.string(),
      priority: z.string(),
    })).describe('即将到来的维保任务'),
    overdueCount: z.number().describe('逾期未完成任务数'),
  }),
  execute: async (
    input: { machineId?: string; days?: number },
    _context: ToolContext
  ) => {
    const startMs = Date.now();
    try {
      // TODO: Phase 4 实现 — 从 MySQL maintenance_schedules 表查询
      log.debug({ machineId: input.machineId, days: input.days, durationMs: Date.now() - startMs }, '维保计划查询（占位）');

      return {
        upcomingTasks: [],
        overdueCount: 0,
      };
    } catch (err: any) {
      log.warn({ machineId: input.machineId, err: err.message }, '维保计划查询失败');
      return {
        upcomingTasks: [],
        overdueCount: -1,
      };
    }
  },
};

// ============================================================================
// 工具 5: 生成趋势图表规格
// ============================================================================

/**
 * 根据设备、传感器类型和时间范围生成图表规格（ChartSpec）。
 * 前端根据 ChartSpec 渲染对应的图表组件。
 */
const generateTrendChart: GrokTool = {
  name: 'generate_trend_chart',
  description: '生成趋势图表规格。根据设备ID、传感器类型和时间范围，生成前端可渲染的 ChartSpec。',
  loopStage: 'utility',
  inputSchema: z.object({
    machineId: z.string().describe('设备ID'),
    sensorType: z.string().describe('传感器类型（如 vibration, temperature, current）'),
    timeRange: z.object({
      start: z.string().describe('开始时间 ISO8601'),
      end: z.string().describe('结束时间 ISO8601'),
    }).describe('时间范围'),
  }),
  outputSchema: z.object({
    chartSpec: z.object({
      type: z.string(),
      title: z.string(),
      data: z.record(z.string(), z.unknown()),
      xAxis: z.string().optional(),
      yAxis: z.string().optional(),
    }).describe('图表规格'),
  }),
  execute: async (
    input: { machineId: string; sensorType: string; timeRange: { start: string; end: string } },
    _context: ToolContext
  ) => {
    const startMs = Date.now();
    try {
      // 构建 ChartSpec — 实际数据由前端根据规格向 API 请求
      const sensorLabel: Record<string, string> = {
        vibration: '振动 (mm/s)',
        temperature: '温度 (°C)',
        current: '电流 (A)',
        voltage: '电压 (V)',
        speed: '转速 (rpm)',
        load: '载荷 (t)',
        oil_pressure: '油压 (MPa)',
        wind_speed: '风速 (m/s)',
        noise: '噪声 (dB)',
        motor_current: '电机电流 (A)',
      };

      const chartSpec: ChartSpec = {
        type: 'line',
        title: `${input.machineId} ${sensorLabel[input.sensorType] || input.sensorType} 趋势`,
        data: {
          machineId: input.machineId,
          sensorType: input.sensorType,
          timeRange: input.timeRange,
          // 前端根据此配置向 ClickHouse 请求实际时序数据
          dataSource: 'clickhouse:realtime_telemetry',
          aggregation: '5min',
        },
        xAxis: '时间',
        yAxis: sensorLabel[input.sensorType] || input.sensorType,
      };

      log.debug(
        { machineId: input.machineId, sensorType: input.sensorType, durationMs: Date.now() - startMs },
        '趋势图表规格生成完成'
      );

      return { chartSpec };
    } catch (err: any) {
      log.warn({ machineId: input.machineId, err: err.message }, '趋势图表生成失败');
      return {
        chartSpec: {
          type: 'line' as const,
          title: '数据加载失败',
          data: { error: err.message },
        },
      };
    }
  },
};

// ============================================================================
// 工具 6: 生成跨设备对比报告
// ============================================================================

/**
 * 对多台设备的指定指标进行横向对比。
 * 用于回答"哪台设备振动最大"、"3号和5号岸桥对比"等问题。
 */
const generateComparisonReport: GrokTool = {
  name: 'generate_comparison_report',
  description: '生成跨设备对比报告。对多台设备的指定指标进行横向对比，返回对比数据和文字摘要。',
  loopStage: 'utility',
  inputSchema: z.object({
    machineIds: z.array(z.string()).min(2).describe('参与对比的设备ID列表（至少2台）'),
    metrics: z.array(z.string()).min(1).describe('对比指标列表（如 vibration, temperature, healthScore）'),
  }),
  outputSchema: z.object({
    comparison: z.record(
      z.string(),
      z.record(z.string(), z.number())
    ).describe('对比矩阵: { 设备ID: { 指标: 值 } }'),
    summary: z.string().describe('对比结论的中文摘要'),
  }),
  execute: async (
    input: { machineIds: string[]; metrics: string[] },
    _context: ToolContext
  ) => {
    const startMs = Date.now();
    try {
      // TODO: Phase 4 实现 — 从 ClickHouse mv_device_health_wide 视图查询最新指标
      // 当前构建占位对比数据
      const comparison: Record<string, Record<string, number>> = {};
      for (const machineId of input.machineIds) {
        comparison[machineId] = {};
        for (const metric of input.metrics) {
          // 占位值：后续替换为真实数据查询
          comparison[machineId][metric] = -1;
        }
      }

      const summary = `对比了 ${input.machineIds.length} 台设备的 ${input.metrics.join('、')} 指标。数据查询功能待接入实时数据源。`;

      log.debug(
        { machineIds: input.machineIds, metrics: input.metrics, durationMs: Date.now() - startMs },
        '跨设备对比报告生成完成（占位数据）'
      );

      return { comparison, summary };
    } catch (err: any) {
      log.warn({ machineIds: input.machineIds, err: err.message }, '跨设备对比报告生成失败');
      return {
        comparison: {},
        summary: `对比报告生成失败：${err.message}`,
      };
    }
  },
};

// ============================================================================
// 工具注册表导出
// ============================================================================

/** NL 接口专用工具列表（6 个） */
export const NL_INTERFACE_TOOLS: GrokTool[] = [
  resolveDeviceReferenceTool,
  queryDeviceStatusSummary,
  queryAlertSummary,
  queryMaintenanceSchedule,
  generateTrendChart,
  generateComparisonReport,
];
