/**
 * FIX-050: 工具 I/O Zod Schema — 常用工具输入输出验证
 *
 * 新建工具时从此处复用 Schema，确保输入输出类型一致。
 */

import { z } from 'zod';

// ============================================================================
// 通用工具输入 Schema
// ============================================================================

/** 设备查询输入 — 多数查询工具共用 */
export const toolInputDeviceQuery = z.object({
  machineId: z.string().min(1).describe('设备编码'),
  sensorIds: z.array(z.string()).optional().describe('传感器编码列表 (可选)'),
  timeRange: z.object({
    start: z.number().describe('起始时间 epoch ms'),
    end: z.number().describe('结束时间 epoch ms'),
  }).optional().describe('时间范围 (可选)'),
});

/** 知识查询输入 */
export const toolInputKnowledgeQuery = z.object({
  query: z.string().min(1).describe('查询语句'),
  nodeTypes: z.array(z.string()).optional().describe('限定节点类型'),
  maxResults: z.number().int().min(1).max(100).default(10).describe('最大结果数'),
});

/** 诊断上下文输入 */
export const toolInputDiagnosticContext = z.object({
  machineId: z.string().min(1),
  faultType: z.string().optional(),
  symptoms: z.array(z.string()).optional(),
  sensorReadings: z.record(z.string(), z.number()).optional(),
});

// ============================================================================
// 通用工具输出 Schema
// ============================================================================

/** 传感器数据输出 */
export const toolOutputSensorData = z.object({
  machineId: z.string(),
  readings: z.array(z.object({
    sensorId: z.string(),
    value: z.number(),
    unit: z.string(),
    timestamp: z.number(),
    quality: z.enum(['good', 'uncertain', 'bad']).optional(),
  })),
  dataQuality: z.number().min(0).max(100).optional(),
});

/** 诊断结果输出 */
export const toolOutputDiagnosticResult = z.object({
  faultType: z.string(),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
  confidence: z.number().min(0).max(1),
  rootCause: z.string().optional(),
  recommendations: z.array(z.string()).optional(),
});

/** 知识图谱查询输出 */
export const toolOutputKnowledgeResult = z.object({
  nodes: z.array(z.object({
    id: z.string(),
    label: z.string(),
    type: z.string(),
    properties: z.record(z.string(), z.unknown()).optional(),
  })),
  relations: z.array(z.object({
    source: z.string(),
    target: z.string(),
    type: z.string(),
  })).optional(),
});

/** 通用操作结果 */
export const toolOutputOperationResult = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: z.unknown().optional(),
});

// ============================================================================
// Schema 类型导出
// ============================================================================

export type ToolInputDeviceQuery = z.infer<typeof toolInputDeviceQuery>;
export type ToolInputKnowledgeQuery = z.infer<typeof toolInputKnowledgeQuery>;
export type ToolInputDiagnosticContext = z.infer<typeof toolInputDiagnosticContext>;
export type ToolOutputSensorData = z.infer<typeof toolOutputSensorData>;
export type ToolOutputDiagnosticResult = z.infer<typeof toolOutputDiagnosticResult>;
export type ToolOutputKnowledgeResult = z.infer<typeof toolOutputKnowledgeResult>;
export type ToolOutputOperationResult = z.infer<typeof toolOutputOperationResult>;
