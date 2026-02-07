/**
 * 数据管理服务层
 * 提供数据切片、切片规则、清洗规则、清洗任务、质量报告的 CRUD
 */
import { getDb } from '../db';
import {
  dataSlices, baseSliceRules, dataSliceLabelHistory,
  baseCleanRules, dataCleanTasks, dataCleanLogs,
  dataQualityReports, sensorCalibrations,
  eventStore, eventSnapshots
} from '../../drizzle/schema';
import { eq, and, like, asc, desc, count, gte, lte, sql } from 'drizzle-orm';

// ============================================
// 切片规则
// ============================================

export const sliceRuleService = {
  async list(filters?: { triggerType?: string; isActive?: number }) {
    const db = await getDb();
    if (!db) return [];
    const conditions: any[] = [eq(baseSliceRules.isDeleted, 0), eq(baseSliceRules.isCurrent, 1)];
    if (filters?.triggerType) conditions.push(eq(baseSliceRules.triggerType, filters.triggerType));
    if (filters?.isActive !== undefined) conditions.push(eq(baseSliceRules.isActive, filters.isActive));
    return db.select().from(baseSliceRules)
      .where(and(...conditions))
      .orderBy(desc(baseSliceRules.priority));
  },

  async getById(ruleId: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(baseSliceRules)
      .where(and(eq(baseSliceRules.ruleId, ruleId), eq(baseSliceRules.isCurrent, 1), eq(baseSliceRules.isDeleted, 0)));
    return row || null;
  },

  async create(input: {
    ruleId: string; name: string; triggerType: string; triggerConfig: any;
    deviceType?: string; mechanismType?: string;
    minDurationSec?: number; maxDurationSec?: number; mergeGapSec?: number;
    autoLabels?: any; priority?: number;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(baseSliceRules).values({
      ruleId: input.ruleId, ruleVersion: 1, name: input.name,
      deviceType: input.deviceType || null, mechanismType: input.mechanismType || null,
      triggerType: input.triggerType, triggerConfig: input.triggerConfig,
      minDurationSec: input.minDurationSec ?? 5, maxDurationSec: input.maxDurationSec ?? 3600,
      mergeGapSec: input.mergeGapSec ?? 10,
      autoLabels: input.autoLabels || null, priority: input.priority ?? 5,
      isActive: 1, isCurrent: 1, version: 1,
      createdBy: 'system', createdAt: now, updatedBy: 'system', updatedAt: now, isDeleted: 0,
    });
    return this.getById(input.ruleId);
  },

  async update(ruleId: string, input: {
    name?: string; triggerConfig?: any; isActive?: number; priority?: number;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updateData: any = { updatedAt: new Date(), updatedBy: 'system' };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.triggerConfig !== undefined) updateData.triggerConfig = input.triggerConfig;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    if (input.priority !== undefined) updateData.priority = input.priority;
    await db.update(baseSliceRules).set(updateData)
      .where(and(eq(baseSliceRules.ruleId, ruleId), eq(baseSliceRules.isCurrent, 1)));
    return this.getById(ruleId);
  },

  async delete(ruleId: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(baseSliceRules).set({ isDeleted: 1, updatedAt: new Date() })
      .where(and(eq(baseSliceRules.ruleId, ruleId), eq(baseSliceRules.isCurrent, 1)));
    return { success: true };
  },
};

// ============================================
// 数据切片
// ============================================

export const dataSliceService = {
  async list(filters?: {
    deviceCode?: string; status?: string; workConditionCode?: string;
    faultTypeCode?: string; labelStatus?: string;
    page?: number; pageSize?: number;
  }) {
    const db = await getDb();
    if (!db) return { items: [], total: 0 };

    const conditions: any[] = [eq(dataSlices.isDeleted, 0)];
    if (filters?.deviceCode) conditions.push(eq(dataSlices.deviceCode, filters.deviceCode));
    if (filters?.status) conditions.push(eq(dataSlices.status, filters.status));
    if (filters?.workConditionCode) conditions.push(eq(dataSlices.workConditionCode, filters.workConditionCode));
    if (filters?.faultTypeCode) conditions.push(eq(dataSlices.faultTypeCode, filters.faultTypeCode));
    if (filters?.labelStatus) conditions.push(eq(dataSlices.labelStatus, filters.labelStatus));

    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;

    const [totalResult] = await db.select({ count: count() }).from(dataSlices).where(and(...conditions));
    const items = await db.select().from(dataSlices)
      .where(and(...conditions))
      .orderBy(desc(dataSlices.startTime))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { items, total: totalResult.count };
  },

  async getById(sliceId: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(dataSlices)
      .where(and(eq(dataSlices.sliceId, sliceId), eq(dataSlices.isDeleted, 0)));
    return row || null;
  },

  async getStats() {
    const db = await getDb();
    if (!db) return { total: 0, byStatus: {}, byLabelStatus: {}, avgQualityScore: 0 };

    const [total] = await db.select({ count: count() }).from(dataSlices)
      .where(eq(dataSlices.isDeleted, 0));

    const byStatus = await db.select({
      status: dataSlices.status, count: count(),
    }).from(dataSlices).where(eq(dataSlices.isDeleted, 0)).groupBy(dataSlices.status);

    const byLabelStatus = await db.select({
      labelStatus: dataSlices.labelStatus, count: count(),
    }).from(dataSlices).where(eq(dataSlices.isDeleted, 0)).groupBy(dataSlices.labelStatus);

    const [avgScore] = await db.select({
      avg: sql<number>`AVG(quality_score)`,
    }).from(dataSlices).where(eq(dataSlices.isDeleted, 0));

    return {
      total: total.count,
      byStatus: Object.fromEntries(byStatus.map(r => [r.status, r.count])),
      byLabelStatus: Object.fromEntries(byLabelStatus.map(r => [r.labelStatus, r.count])),
      avgQualityScore: Math.round((avgScore.avg || 0) * 10) / 10,
    };
  },

  async updateLabels(sliceId: string, labels: any, changedBy: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(dataSlices).set({
      labels, labelStatus: 'manual_verified',
      updatedAt: new Date(), updatedBy: changedBy, verifiedBy: changedBy, verifiedAt: new Date(),
    }).where(eq(dataSlices.sliceId, sliceId));
    return this.getById(sliceId);
  },
};

// ============================================
// 清洗规则
// ============================================

export const cleanRuleService = {
  async list(filters?: { ruleType?: string; isActive?: number }) {
    const db = await getDb();
    if (!db) return [];
    const conditions: any[] = [eq(baseCleanRules.isDeleted, 0), eq(baseCleanRules.isCurrent, 1)];
    if (filters?.ruleType) conditions.push(eq(baseCleanRules.ruleType, filters.ruleType));
    if (filters?.isActive !== undefined) conditions.push(eq(baseCleanRules.isActive, filters.isActive));
    return db.select().from(baseCleanRules)
      .where(and(...conditions))
      .orderBy(desc(baseCleanRules.priority));
  },

  async getById(ruleId: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(baseCleanRules)
      .where(and(eq(baseCleanRules.ruleId, ruleId), eq(baseCleanRules.isCurrent, 1), eq(baseCleanRules.isDeleted, 0)));
    return row || null;
  },

  async create(input: {
    ruleId: string; name: string; ruleType: string;
    detectConfig: any; actionType: string; actionConfig?: any;
    deviceType?: string; sensorType?: string; measurementType?: string;
    priority?: number; description?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(baseCleanRules).values({
      ruleId: input.ruleId, ruleVersion: 1, name: input.name,
      deviceType: input.deviceType || null, sensorType: input.sensorType || null,
      measurementType: input.measurementType || null,
      ruleType: input.ruleType, detectConfig: input.detectConfig,
      actionType: input.actionType, actionConfig: input.actionConfig || null,
      priority: input.priority ?? 5, isActive: 1, isCurrent: 1,
      description: input.description || null,
      version: 1, createdBy: 'system', createdAt: now, updatedBy: 'system', updatedAt: now, isDeleted: 0,
    });
    return this.getById(input.ruleId);
  },

  async update(ruleId: string, input: {
    name?: string; detectConfig?: any; actionConfig?: any; isActive?: number; priority?: number;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updateData: any = { updatedAt: new Date(), updatedBy: 'system' };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.detectConfig !== undefined) updateData.detectConfig = input.detectConfig;
    if (input.actionConfig !== undefined) updateData.actionConfig = input.actionConfig;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    if (input.priority !== undefined) updateData.priority = input.priority;
    await db.update(baseCleanRules).set(updateData)
      .where(and(eq(baseCleanRules.ruleId, ruleId), eq(baseCleanRules.isCurrent, 1)));
    return this.getById(ruleId);
  },

  async delete(ruleId: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(baseCleanRules).set({ isDeleted: 1, updatedAt: new Date() })
      .where(and(eq(baseCleanRules.ruleId, ruleId), eq(baseCleanRules.isCurrent, 1)));
    return { success: true };
  },
};

// ============================================
// 清洗任务
// ============================================

export const cleanTaskService = {
  async list(filters?: { status?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { items: [], total: 0 };

    const conditions: any[] = [];
    if (filters?.status) conditions.push(eq(dataCleanTasks.status, filters.status));

    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [totalResult] = await db.select({ count: count() }).from(dataCleanTasks).where(whereClause);
    const items = await db.select().from(dataCleanTasks)
      .where(whereClause)
      .orderBy(desc(dataCleanTasks.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { items, total: totalResult.count };
  },

  async getById(taskId: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(dataCleanTasks)
      .where(eq(dataCleanTasks.taskId, taskId));
    return row || null;
  },

  async create(input: {
    taskId: string; idempotentKey: string; name?: string;
    deviceCode?: string; sensorIds?: string[];
    timeStart: string; timeEnd: string; ruleIds?: string[];
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(dataCleanTasks).values({
      taskId: input.taskId, idempotentKey: input.idempotentKey,
      name: input.name || null, deviceCode: input.deviceCode || null,
      sensorIds: input.sensorIds || null,
      timeStart: new Date(input.timeStart), timeEnd: new Date(input.timeEnd),
      ruleIds: input.ruleIds || null,
      status: 'pending', progress: 0,
      version: 1, createdBy: 'system', createdAt: now, updatedBy: 'system', updatedAt: now,
    });
    return this.getById(input.taskId);
  },
};

// ============================================
// 质量报告
// ============================================

export const qualityReportService = {
  async list(filters?: { reportType?: string; deviceCode?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { items: [], total: 0 };

    const conditions: any[] = [];
    if (filters?.reportType) conditions.push(eq(dataQualityReports.reportType, filters.reportType));
    if (filters?.deviceCode) conditions.push(eq(dataQualityReports.deviceCode, filters.deviceCode));

    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [totalResult] = await db.select({ count: count() }).from(dataQualityReports).where(whereClause);
    const items = await db.select().from(dataQualityReports)
      .where(whereClause)
      .orderBy(desc(dataQualityReports.reportDate))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { items, total: totalResult.count };
  },

  async getStats() {
    const db = await getDb();
    if (!db) return { avgScore: 0, totalReports: 0, latestDate: null };

    const [stats] = await db.select({
      count: count(),
      avgScore: sql<number>`AVG(quality_score)`,
      latestDate: sql<string>`MAX(report_date)`,
    }).from(dataQualityReports);

    return {
      totalReports: stats.count,
      avgScore: Math.round((stats.avgScore || 0) * 10) / 10,
      latestDate: stats.latestDate,
    };
  },
};

// ============================================
// 传感器校准
// ============================================

export const calibrationService = {
  async list(filters?: { deviceCode?: string; sensorId?: string }) {
    const db = await getDb();
    if (!db) return [];
    const conditions: any[] = [];
    if (filters?.deviceCode) conditions.push(eq(sensorCalibrations.deviceCode, filters.deviceCode));
    if (filters?.sensorId) conditions.push(eq(sensorCalibrations.sensorId, filters.sensorId));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(sensorCalibrations)
      .where(whereClause)
      .orderBy(desc(sensorCalibrations.calibrationDate));
  },

  async create(input: {
    deviceCode: string; sensorId: string; calibrationDate: string;
    calibrationType: string; offsetBefore?: number; offsetAfter?: number;
    scaleBefore?: number; scaleAfter?: number; notes?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(sensorCalibrations).values({
      deviceCode: input.deviceCode, sensorId: input.sensorId,
      calibrationDate: input.calibrationDate,
      calibrationType: input.calibrationType,
      offsetBefore: input.offsetBefore ?? null, offsetAfter: input.offsetAfter ?? null,
      scaleBefore: input.scaleBefore ?? null, scaleAfter: input.scaleAfter ?? null,
      status: 'pending', notes: input.notes || null,
      version: 1, createdBy: 'system', createdAt: now, updatedBy: 'system', updatedAt: now,
    });
    return { success: true };
  },
};

// ============================================
// 事件溯源
// ============================================

export const eventStoreService = {
  async list(filters?: {
    aggregateType?: string; aggregateId?: string; eventType?: string;
    page?: number; pageSize?: number;
  }) {
    const db = await getDb();
    if (!db) return { items: [], total: 0 };

    const conditions: any[] = [];
    if (filters?.aggregateType) conditions.push(eq(eventStore.aggregateType, filters.aggregateType));
    if (filters?.aggregateId) conditions.push(eq(eventStore.aggregateId, filters.aggregateId));
    if (filters?.eventType) conditions.push(eq(eventStore.eventType, filters.eventType));

    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [totalResult] = await db.select({ count: count() }).from(eventStore).where(whereClause);
    const items = await db.select().from(eventStore)
      .where(whereClause)
      .orderBy(desc(eventStore.occurredAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { items, total: totalResult.count };
  },

  async append(input: {
    eventId: string; eventType: string; aggregateType: string;
    aggregateId: string; aggregateVersion: number; payload: any;
    metadata?: any; causationId?: string; correlationId?: string;
    actorId?: string; actorType?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(eventStore).values({
      eventId: input.eventId, eventType: input.eventType,
      eventVersion: 1, aggregateType: input.aggregateType,
      aggregateId: input.aggregateId, aggregateVersion: input.aggregateVersion,
      payload: input.payload, metadata: input.metadata || null,
      causationId: input.causationId || null, correlationId: input.correlationId || null,
      occurredAt: now, recordedAt: now,
      actorId: input.actorId || null, actorType: input.actorType || null,
    });
    return { success: true };
  },

  async getStats() {
    const db = await getDb();
    if (!db) return { totalEvents: 0, totalSnapshots: 0, distinctNodes: 0, todayEvents: 0, byType: {}, byAggregate: {} };

    const [total] = await db.select({ count: count() }).from(eventStore);
    const [snapshotTotal] = await db.select({ count: count() }).from(eventSnapshots);
    const [distinctNodes] = await db.select({
      count: sql<number>`COUNT(DISTINCT aggregate_id)`,
    }).from(eventStore);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [todayEvents] = await db.select({ count: count() }).from(eventStore)
      .where(gte(eventStore.occurredAt, today));
    const byType = await db.select({
      eventType: eventStore.eventType, count: count(),
    }).from(eventStore).groupBy(eventStore.eventType);
    const byAggregate = await db.select({
      aggregateType: eventStore.aggregateType, count: count(),
    }).from(eventStore).groupBy(eventStore.aggregateType);

    return {
      totalEvents: total.count,
      totalSnapshots: snapshotTotal.count,
      distinctNodes: distinctNodes.count,
      todayEvents: todayEvents.count,
      byType: Object.fromEntries(byType.map(r => [r.eventType, r.count])),
      byAggregate: Object.fromEntries(byAggregate.map(r => [r.aggregateType, r.count])),
    };
  },
};

// ============================================
// 数据切片 - 补充 create / delete / getLabels
// ============================================

// 扩展 dataSliceService
dataSliceService.create = async function(input: {
  sliceId: string; deviceCode: string; ruleId?: string;
  startTime: string; endTime: string; durationSec?: number;
  workConditionCode?: string; faultTypeCode?: string;
  qualityScore?: number; status?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const now = new Date();
  await db.insert(dataSlices).values({
    sliceId: input.sliceId, deviceCode: input.deviceCode,
    ruleId: input.ruleId || null,
    startTime: new Date(input.startTime), endTime: new Date(input.endTime),
    durationSec: input.durationSec || 0,
    workConditionCode: input.workConditionCode || null,
    faultTypeCode: input.faultTypeCode || null,
    qualityScore: input.qualityScore || null,
    status: input.status || 'raw',
    labelStatus: 'unlabeled',
    version: 1, createdBy: 'system', createdAt: now, updatedBy: 'system', updatedAt: now, isDeleted: 0,
  } as any);
  return this.getById(input.sliceId);
};

dataSliceService.delete = async function(sliceId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(dataSlices).set({ isDeleted: 1, updatedAt: new Date() } as any)
    .where(eq(dataSlices.sliceId, sliceId));
  return { success: true };
};

dataSliceService.getLabels = async function(sliceId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dataSliceLabelHistory)
    .where(eq(dataSliceLabelHistory.sliceId, sliceId))
    .orderBy(desc(dataSliceLabelHistory.changedAt));
};

// ============================================
// 事件快照服务
// ============================================

export const eventSnapshotService = {
  async list(filters?: { aggregateType?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return [];

    const conditions: any[] = [];
    if (filters?.aggregateType) conditions.push(eq(eventSnapshots.aggregateType, filters.aggregateType));

    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return db.select().from(eventSnapshots)
      .where(whereClause)
      .orderBy(desc(eventSnapshots.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
  },

  async create(input: {
    aggregateType: string; aggregateId: string; version: number; state: any;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(eventSnapshots).values({
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      version: input.version,
      state: input.state,
      createdAt: now,
    } as any);
    return { success: true };
  },
};
