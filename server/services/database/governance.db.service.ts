/**
 * 数据治理服务层
 * 提供 dataGovernanceJobs / dataLineage / anomalyDetections 的完整 CRUD
 * 
 * 数据链路: Drizzle schema → service CRUD → tRPC router → 前端组件
 */
import { getDb } from '../../lib/db';
import { dataGovernanceJobs, dataLineage, anomalyDetections, auditLogsSensitive, dataCleanResults, dataCollectionTasks } from '../../../drizzle/schema';
import { eq, and, like, desc, count, gte, lte } from 'drizzle-orm';

// ============================================
// 数据治理作业
// ============================================
export const dataGovernanceJobService = {
  async list(filters?: { jobType?: string; status?: string; targetTable?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.jobType) conditions.push(eq(dataGovernanceJobs.jobType, filters.jobType));
    if (filters?.status) conditions.push(eq(dataGovernanceJobs.status, filters.status));
    if (filters?.targetTable) conditions.push(eq(dataGovernanceJobs.targetTable, filters.targetTable));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(dataGovernanceJobs).where(where);
    const rows = await db.select().from(dataGovernanceJobs)
      .where(where)
      .orderBy(desc(dataGovernanceJobs.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },

  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(dataGovernanceJobs).where(eq(dataGovernanceJobs.id, id));
    return row || null;
  },

  async create(input: {
    jobId: string; policyId: string; jobType: string; targetTable: string;
    filterCondition?: any;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(dataGovernanceJobs).values({
      jobId: input.jobId, policyId: input.policyId, jobType: input.jobType,
      targetTable: input.targetTable, filterCondition: input.filterCondition || null,
      status: 'pending', createdAt: new Date(),
    });
    return { success: true, jobId: input.jobId };
  },

  async updateStatus(id: number, status: string, result?: { affectedRows?: number; freedBytes?: number; errorMessage?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updates: any = { status };
    if (status === 'running') updates.startedAt = new Date();
    if (status === 'completed' || status === 'failed') updates.completedAt = new Date();
    if (result?.affectedRows !== undefined) updates.affectedRows = result.affectedRows;
    if (result?.freedBytes !== undefined) updates.freedBytes = result.freedBytes;
    if (result?.errorMessage) updates.errorMessage = result.errorMessage;
    await db.update(dataGovernanceJobs).set(updates).where(eq(dataGovernanceJobs.id, id));
    return this.getById(id);
  },

  async getStats() {
    const db = await getDb();
    if (!db) return { total: 0, completed: 0, running: 0, failed: 0 };
    const [total] = await db.select({ count: count() }).from(dataGovernanceJobs);
    const [completed] = await db.select({ count: count() }).from(dataGovernanceJobs).where(eq(dataGovernanceJobs.status, 'completed'));
    const [running] = await db.select({ count: count() }).from(dataGovernanceJobs).where(eq(dataGovernanceJobs.status, 'running'));
    const [failed] = await db.select({ count: count() }).from(dataGovernanceJobs).where(eq(dataGovernanceJobs.status, 'failed'));
    return { total: total.count, completed: completed.count, running: running.count, failed: failed.count };
  },
};

// ============================================
// 数据血缘
// ============================================
export const dataLineageService = {
  async list(filters?: { sourceType?: string; targetType?: string; transformType?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.sourceType) conditions.push(eq(dataLineage.sourceType, filters.sourceType));
    if (filters?.targetType) conditions.push(eq(dataLineage.targetType, filters.targetType));
    if (filters?.transformType) conditions.push(eq(dataLineage.transformType, filters.transformType));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;
    const [totalResult] = await db.select({ count: count() }).from(dataLineage).where(where);
    const rows = await db.select().from(dataLineage)
      .where(where)
      .orderBy(desc(dataLineage.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },

  async getBySourceId(sourceId: string) {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(dataLineage).where(eq(dataLineage.sourceId, sourceId)).orderBy(desc(dataLineage.createdAt));
  },

  async getByTargetId(targetId: string) {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(dataLineage).where(eq(dataLineage.targetId, targetId)).orderBy(desc(dataLineage.createdAt));
  },

  async create(input: {
    lineageId: string; sourceType: string; sourceId: string; sourceDetail?: any;
    targetType: string; targetId: string; targetDetail?: any;
    transformType: string; transformParams?: any; operator?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(dataLineage).values({
      lineageId: input.lineageId, sourceType: input.sourceType, sourceId: input.sourceId,
      sourceDetail: input.sourceDetail || null, targetType: input.targetType,
      targetId: input.targetId, targetDetail: input.targetDetail || null,
      transformType: input.transformType, transformParams: input.transformParams || null,
      operator: input.operator || 'system', createdAt: new Date(),
    });
    return { success: true, lineageId: input.lineageId };
  },

  async getFullChain(entityId: string) {
    const db = await getDb();
    if (!db) return { upstream: [], downstream: [] };
    const upstream = await db.select().from(dataLineage).where(eq(dataLineage.targetId, entityId));
    const downstream = await db.select().from(dataLineage).where(eq(dataLineage.sourceId, entityId));
    return { upstream, downstream };
  },
};

// ============================================
// 异常检测
// ============================================
export const anomalyDetectionService = {
  async list(filters?: { sensorId?: string; severity?: string; status?: string; algorithmType?: string; startDate?: Date; endDate?: Date; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.sensorId) conditions.push(eq(anomalyDetections.sensorId, filters.sensorId));
    if (filters?.severity) conditions.push(eq(anomalyDetections.severity, filters.severity));
    if (filters?.status) conditions.push(eq(anomalyDetections.status, filters.status));
    if (filters?.algorithmType) conditions.push(eq(anomalyDetections.algorithmType, filters.algorithmType));
    if (filters?.startDate) conditions.push(gte(anomalyDetections.createdAt, filters.startDate));
    if (filters?.endDate) conditions.push(lte(anomalyDetections.createdAt, filters.endDate));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;
    const [totalResult] = await db.select({ count: count() }).from(anomalyDetections).where(where);
    const rows = await db.select().from(anomalyDetections)
      .where(where)
      .orderBy(desc(anomalyDetections.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },

  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(anomalyDetections).where(eq(anomalyDetections.id, id));
    return row || null;
  },

  async create(input: {
    detectionId: string; sensorId: string; nodeId?: string; algorithmType: string;
    windowSize: number; threshold: number; currentValue: number; expectedValue: number;
    deviation: number; score: number; severity: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(anomalyDetections).values({
      detectionId: input.detectionId, sensorId: input.sensorId, nodeId: input.nodeId || null,
      algorithmType: input.algorithmType, windowSize: input.windowSize, threshold: input.threshold,
      currentValue: input.currentValue.toString(), expectedValue: input.expectedValue.toString(),
      deviation: input.deviation.toString(), score: input.score.toString(),
      severity: input.severity, status: 'detected', createdAt: now, updatedAt: now,
    });
    return { success: true, detectionId: input.detectionId };
  },

  async acknowledge(id: number, acknowledgedBy: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(anomalyDetections).set({
      status: 'acknowledged', acknowledgedBy, acknowledgedAt: new Date(), updatedAt: new Date(),
    }).where(eq(anomalyDetections.id, id));
    return this.getById(id);
  },

  async resolve(id: number, notes?: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(anomalyDetections).set({
      status: 'resolved', resolvedAt: new Date(), notes: notes || null, updatedAt: new Date(),
    }).where(eq(anomalyDetections.id, id));
    return this.getById(id);
  },

  async getStats() {
    const db = await getDb();
    if (!db) return { total: 0, detected: 0, acknowledged: 0, resolved: 0 };
    const [total] = await db.select({ count: count() }).from(anomalyDetections);
    const [detected] = await db.select({ count: count() }).from(anomalyDetections).where(eq(anomalyDetections.status, 'detected'));
    const [acknowledged] = await db.select({ count: count() }).from(anomalyDetections).where(eq(anomalyDetections.status, 'acknowledged'));
    const [resolved] = await db.select({ count: count() }).from(anomalyDetections).where(eq(anomalyDetections.status, 'resolved'));
    return { total: total.count, detected: detected.count, acknowledged: acknowledged.count, resolved: resolved.count };
  },
};

// ============================================
// §23 扩展 — 敏感审计日志
// ============================================
export const auditLogsSensitiveService = {
  async list(filters?: { auditLogId?: number; sensitiveType?: string; riskLevel?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.auditLogId) conditions.push(eq(auditLogsSensitive.auditLogId, filters.auditLogId));
    if (filters?.sensitiveType) conditions.push(eq(auditLogsSensitive.sensitiveType, filters.sensitiveType));
    if (filters?.riskLevel) conditions.push(eq(auditLogsSensitive.riskLevel, filters.riskLevel));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(auditLogsSensitive).where(where);
    const rows = await db.select().from(auditLogsSensitive).where(where).orderBy(desc(auditLogsSensitive.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async create(input: { auditLogId: number; sensitiveType: string; sensitiveData?: any; riskLevel: string; requiresApproval: number }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(auditLogsSensitive).values({ ...input, createdAt: new Date() });
    return { success: true };
  },
  async approve(id: number, approvedBy: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(auditLogsSensitive).set({ approvedBy, approvedAt: new Date() }).where(eq(auditLogsSensitive.id, id));
    return { success: true };
  },
};

// ============================================
// §23 扩展 — 数据清洗结果
// ============================================
export const dataCleanResultService = {
  async list(filters?: { taskId?: number; status?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.taskId) conditions.push(eq(dataCleanResults.taskId, filters.taskId));
    if (filters?.status) conditions.push(eq(dataCleanResults.status, filters.status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;
    const [totalResult] = await db.select({ count: count() }).from(dataCleanResults).where(where);
    const rows = await db.select().from(dataCleanResults).where(where).orderBy(desc(dataCleanResults.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async create(input: { taskId: number; sourceTable: string; sourceRowId: number; fieldName: string; originalValue?: string; cleanedValue?: string; ruleApplied?: string; status?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.insert(dataCleanResults).values({ ...input, status: input.status ?? 'applied', createdAt: new Date() });
    return { success: true };
  },
};

// ============================================
// §23 扩展 — 数据采集任务
// ============================================
export const dataCollectionTaskService = {
  async list(filters?: { gatewayId?: string; taskType?: string; status?: string; page?: number; pageSize?: number }) {
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const conditions: any[] = [];
    if (filters?.gatewayId) conditions.push(eq(dataCollectionTasks.gatewayId, filters.gatewayId));
    if (filters?.taskType) conditions.push(eq(dataCollectionTasks.taskType, filters.taskType));
    if (filters?.status) conditions.push(eq(dataCollectionTasks.status, filters.status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const [totalResult] = await db.select({ count: count() }).from(dataCollectionTasks).where(where);
    const rows = await db.select().from(dataCollectionTasks).where(where).orderBy(desc(dataCollectionTasks.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total: totalResult.count };
  },
  async getById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(dataCollectionTasks).where(eq(dataCollectionTasks.id, id));
    return row || null;
  },
  async create(input: { taskId: string; taskName: string; gatewayId: string; taskType?: string; sensorIds: any; scheduleConfig?: any; samplingConfig?: any; preprocessingConfig?: any; triggerConfig?: any; status?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(dataCollectionTasks).values({ ...input, status: input.status ?? 'stopped', totalCollected: 0, totalUploaded: 0, totalTriggered: 0, errorCount: 0, createdAt: now, updatedAt: now });
    return { success: true };
  },
  async updateStatus(id: number, status: string, errorMessage?: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updates: any = { status, updatedAt: new Date() };
    if (errorMessage) updates.lastError = errorMessage;
    if (status === 'running') updates.lastRunAt = new Date();
    await db.update(dataCollectionTasks).set(updates).where(eq(dataCollectionTasks.id, id));
    return { success: true };
  },
};
