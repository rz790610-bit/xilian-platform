/**
 * ============================================================================
 * 统一 Zod Schema — 共享契约 v1
 * ============================================================================
 *
 * FIX-031: 核心路由的 Zod schema 提取到 shared/contracts/schemas/
 *
 * 使用方法：
 *   import { paginationSchema, deviceIdSchema } from '@/shared/contracts/schemas';
 *
 * 分类：
 *   1. Identity — 设备/传感器/会话 ID
 *   2. Pagination — 分页参数
 *   3. Time — 时间范围
 *   4. Severity/Urgency — 统一等级枚举
 *   5. Device — 设备类型/状态
 *   6. Algorithm — 算法类型/状态
 *   7. Diagnosis — 诊断模式/状态
 *   8. Sort — 排序参数
 */

import { z } from 'zod';

// ============================================================================
// 1. Identity Schemas
// ============================================================================

/** 设备编码 (统一使用 machineId 语义) */
export const machineIdSchema = z.string().min(1).max(64);

/** 传感器编码 */
export const sensorIdSchema = z.string().min(1).max(64);

/** 会话 ID */
export const sessionIdSchema = z.string().min(1).max(128);

/** 算法编码 (小写字母+数字+下划线) */
export const algoCodeSchema = z.string().min(1).max(100).regex(
  /^[a-z][a-z0-9_]*$/,
  '只能包含小写字母、数字和下划线，以字母开头',
);

// ============================================================================
// 2. Pagination Schemas
// ============================================================================

/** 标准分页 (page/pageSize) */
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
});

/** 偏移分页 (limit/offset) */
export const limitOffsetSchema = z.object({
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
});

// ============================================================================
// 3. Time Schemas
// ============================================================================

/** ISO8601 时间范围 */
export const datetimeRangeSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
});

/** 回溯时间窗口 (小时) */
export const timeRangeHoursSchema = z.number().min(1).max(720).default(24);

// ============================================================================
// 4. Severity / Urgency — 与 contracts/v1/base.ts 对齐
// ============================================================================

/** 统一严重等级 (5 级) */
export const severitySchema = z.enum(['info', 'low', 'medium', 'high', 'critical']);

/** 统一紧急等级 (3 级) */
export const urgencySchema = z.enum(['monitoring', 'scheduled', 'immediate']);

/** 观测性告警优先级 (P0~P3) */
export const alertPrioritySchema = z.enum(['P0', 'P1', 'P2', 'P3']);

// ============================================================================
// 5. Device Schemas
// ============================================================================

/** 港机设备类型 */
export const portEquipmentTypeSchema = z.enum([
  'STS', 'RTG', 'RMG', 'MHC', 'AGV', 'OTHER',
]);

/** 通用设备类型 (含 IoT 网关) */
export const deviceTypeSchema = z.enum([
  'agv', 'rtg', 'qc', 'asc', 'conveyor', 'pump', 'motor',
  'sensor_hub', 'gateway', 'plc', 'robot', 'camera',
  'rfid_reader', 'weighbridge', 'other',
]);

/** 设备在线状态 */
export const deviceStatusSchema = z.enum([
  'online', 'offline', 'maintenance', 'error', 'unknown',
]);

/** 传感器状态 */
export const sensorStatusSchema = z.enum(['active', 'inactive', 'error']);

/** 数据质量等级 */
export const dataQualitySchema = z.enum(['good', 'uncertain', 'bad', 'interpolated']);

// ============================================================================
// 6. Algorithm Schemas
// ============================================================================

/** 算法实现类型 */
export const algoImplTypeSchema = z.enum([
  'builtin', 'pipeline_node', 'plugin', 'external', 'kg_operator',
]);

/** 算法生命周期状态 */
export const algoStatusSchema = z.enum(['active', 'deprecated', 'experimental']);

/** 算法执行状态 */
export const executionStatusSchema = z.enum(['running', 'success', 'failed', 'timeout']);

/** 算法许可类型 */
export const algoLicenseSchema = z.enum(['builtin', 'community', 'enterprise']);

// ============================================================================
// 7. Diagnosis Schemas
// ============================================================================

/** 诊断模式 */
export const diagnosisModeSchema = z.enum(['quick', 'deep', 'predictive']);

/** 诊断输入 (核心字段) */
export const diagnosisInputSchema = z.object({
  deviceCode: machineIdSchema,
  description: z.string().min(5, '故障描述至少5个字符'),
  sensorReadings: z.record(z.string(), z.number()).optional(),
  timeRangeHours: timeRangeHoursSchema.optional(),
  sessionId: sessionIdSchema.optional(),
  mode: diagnosisModeSchema.optional(),
});

// ============================================================================
// 8. Sort Schemas
// ============================================================================

/** 排序方向 */
export const sortOrderSchema = z.enum(['asc', 'desc']);

// ============================================================================
// 9. Composed Schemas (常用组合)
// ============================================================================

/** 分页 + 排序 */
export const paginatedSortSchema = paginationSchema.extend({
  sortOrder: sortOrderSchema.optional(),
});

/** 搜索 + 分页 */
export const searchPaginatedSchema = paginationSchema.extend({
  search: z.string().optional(),
});

// ============================================================================
// Type Exports (使用 z.infer 推导)
// ============================================================================

export type Pagination = z.infer<typeof paginationSchema>;
export type LimitOffset = z.infer<typeof limitOffsetSchema>;
export type DatetimeRange = z.infer<typeof datetimeRangeSchema>;
export type DiagnosisInput = z.infer<typeof diagnosisInputSchema>;
