/**
 * ============================================================================
 * 平台基础契约类型 — Base Contracts v1
 * ============================================================================
 *
 * 全平台共享的基础枚举和值类型。
 * 所有新代码必须引用此文件中的类型，禁止内联定义。
 *
 * 变更规则：
 *   PATCH — 仅文档/注释修改
 *   MINOR — 新增可选字段（向后兼容）
 *   MAJOR — 删除/重命名/类型变更（需创建 v2/）
 */

// ============================================================================
// 严重度 (Severity)
// ============================================================================

/**
 * 统一严重度等级 — 全平台唯一定义
 *
 * 5 级体系，覆盖诊断、告警、事件、日志全场景：
 *   info     — 信息通知，无需操作
 *   low      — 轻微异常，持续监控
 *   medium   — 中等问题，安排维护
 *   high     — 严重问题，优先处理
 *   critical — 危急状态，立即干预
 *
 * 旧类型映射关系（见 mappers.ts）：
 *   Algorithm SeverityLevel: normal→info, attention→low, warning→medium, critical→critical
 *   AnomalySeverity:         low→low, medium→medium, high→high, critical→critical
 *   Domain Severity:         info→info, low→low, medium→medium, high→high, critical→critical
 *   Log severity:            info→info, warning→medium, error→high, critical→critical
 *   Evolution severity:      info→info, warn→medium, warning→medium, critical→critical, fatal→critical
 */
export const SEVERITY_LEVELS = ['info', 'low', 'medium', 'high', 'critical'] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

/** 严重度数值映射（用于比较和排序） */
export const SEVERITY_WEIGHT: Record<SeverityLevel, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** 严重度中文标签 */
export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  info: '信息',
  low: '轻微',
  medium: '中等',
  high: '严重',
  critical: '危急',
};

/** 严重度颜色（Tailwind token） */
export const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  info: '#3b82f6',
  low: '#eab308',
  medium: '#f97316',
  high: '#ef4444',
  critical: '#dc2626',
};

/**
 * 比较两个严重度的大小
 * @returns 正数表示 a 比 b 严重，负数表示 a 比 b 轻微
 */
export function compareSeverity(a: SeverityLevel, b: SeverityLevel): number {
  return SEVERITY_WEIGHT[a] - SEVERITY_WEIGHT[b];
}

// ============================================================================
// 紧急度 (Urgency)
// ============================================================================

/**
 * 统一紧急度等级 — 全平台唯一定义
 *
 * 4 级体系：
 *   monitoring — 持续监控，无需立即行动
 *   scheduled  — 计划维护，按排期执行
 *   priority   — 优先处理，尽快安排
 *   immediate  — 立即干预，停机处理
 *
 * 旧类型映射关系（见 mappers.ts）：
 *   Algorithm UrgencyLevel: monitoring→monitoring, attention→scheduled, scheduled→scheduled, immediate→immediate
 *   AI MaintenancePriority: defer→monitoring, monitor→monitoring, planned→scheduled, immediate→immediate
 */
export const URGENCY_LEVELS = ['monitoring', 'scheduled', 'priority', 'immediate'] as const;
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

/** 紧急度数值映射 */
export const URGENCY_WEIGHT: Record<UrgencyLevel, number> = {
  monitoring: 0,
  scheduled: 1,
  priority: 2,
  immediate: 3,
};

/** 紧急度中文标签 */
export const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  monitoring: '持续监控',
  scheduled: '计划维护',
  priority: '优先处理',
  immediate: '立即干预',
};

// ============================================================================
// 时间戳 (Timestamp)
// ============================================================================

/**
 * Unix 毫秒时间戳 — 全平台 JSON 字段内时间戳的唯一类型
 *
 * 规则：
 *   - JSON 字段内的时间戳统一用 number (epoch ms)
 *   - Drizzle 列保持 timestamp() 返回 Date，在 API 层转换
 *   - ClickHouse 查询参数统一用 number
 */
export type UnixTimestampMs = number;

/**
 * 将任意时间戳格式转换为 Unix 毫秒
 *
 * 支持：
 *   - Date 对象
 *   - ISO 8601 字符串 ("2026-03-02T10:00:00Z")
 *   - Unix 毫秒 (number, > 1e12)
 *   - Unix 秒 (number, < 1e12)
 */
export function toEpochMs(input: Date | string | number): UnixTimestampMs {
  if (input instanceof Date) {
    return input.getTime();
  }
  if (typeof input === 'string') {
    const parsed = new Date(input).getTime();
    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid timestamp string: "${input}"`);
    }
    return parsed;
  }
  // number — 判断是秒还是毫秒
  if (input < 1e12) {
    return Math.floor(input * 1000);
  }
  return Math.floor(input);
}

/**
 * 将 Unix 毫秒转换为 ISO 8601 字符串
 */
export function toISOString(ms: UnixTimestampMs): string {
  return new Date(ms).toISOString();
}

// ============================================================================
// 设备标识 (Device ID)
// ============================================================================

/**
 * 设备标识 — 全平台唯一设备引用类型
 *
 * 命名规范：
 *   - TypeScript 字段名: machineId (camelCase)
 *   - 数据库列名: machine_id (snake_case)
 *   - 禁止使用: deviceId, equipmentId, device_id, equipment_id
 *
 * 如需处理外部系统传入的不同命名，使用 normalizeDeviceId()
 */
export type MachineId = string;

/**
 * 将各种设备 ID 命名归一化为标准 machineId
 *
 * 支持的输入字段名：
 *   - machineId (已标准，直接返回)
 *   - deviceId
 *   - equipmentId
 *   - device_id
 *   - machine_id
 *   - equipment_id
 */
export function normalizeDeviceId(
  source: Record<string, unknown>,
): MachineId | undefined {
  const candidates = [
    'machineId',
    'deviceId',
    'equipmentId',
    'device_id',
    'machine_id',
    'equipment_id',
  ];
  for (const key of candidates) {
    const val = source[key];
    if (typeof val === 'string' && val.length > 0) {
      return val;
    }
  }
  return undefined;
}

/**
 * 从对象中提取 machineId，不存在则抛出错误
 */
export function requireMachineId(source: Record<string, unknown>): MachineId {
  const id = normalizeDeviceId(source);
  if (!id) {
    throw new Error(
      `Missing device ID. Expected one of: machineId, deviceId, equipmentId. Got keys: [${Object.keys(source).join(', ')}]`,
    );
  }
  return id;
}

// ============================================================================
// 置信度 (Confidence)
// ============================================================================

/**
 * 置信度值 [0, 1]
 *
 * 禁止硬编码置信度字面量（ADR-001）。
 * 置信度必须从以下来源计算：
 *   - 数据质量评分
 *   - 模型输出概率
 *   - 证据链融合
 *   - 配置文件参数
 */
export type ConfidenceScore = number;

/**
 * 校验置信度值在合法范围 [0, 1]
 */
export function validateConfidence(value: number): ConfidenceScore {
  if (value < 0 || value > 1 || Number.isNaN(value)) {
    throw new Error(`Invalid confidence value: ${value}. Must be in [0, 1].`);
  }
  return value;
}
