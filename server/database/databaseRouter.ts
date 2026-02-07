/**
 * 数据库模块 tRPC 路由
 * 西联智能平台 - 数据库一级模块
 * 
 * 子模块:
 * - asset: 资产管理（设备树、测点、传感器）
 * - config: 基础配置（编码规则、节点模板、测点模板、标注、字典）
 * - slice: 数据切片（切片规则、切片实例）
 * - clean: 数据清洗（清洗规则、清洗任务、质量报告、校准）
 * - event: 事件溯源（事件存储、快照）
 */
import { z } from 'zod';
import { publicProcedure, router } from '../_core/trpc';
import { assetNodeService, measurementPointService, assetSensorService } from './assetService';
import { codeRuleService, nodeTemplateService, mpTemplateService, labelDimensionService, labelOptionService, dictService } from './configService';
import { sliceRuleService, dataSliceService, cleanRuleService, cleanTaskService, qualityReportService, calibrationService, eventStoreService, eventSnapshotService } from './dataService';

// ============================================
// 资产管理路由
// ============================================

const assetRouter = router({
  // --- 资产节点（设备树） ---
  getTree: publicProcedure
    .input(z.object({
      level: z.number().optional(),
      rootNodeId: z.string().optional(),
      status: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(({ input }) => assetNodeService.getTree(input ?? undefined)),

  getNode: publicProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(({ input }) => assetNodeService.getById(input.nodeId)),

  getChildren: publicProcedure
    .input(z.object({ parentNodeId: z.string() }))
    .query(({ input }) => assetNodeService.getChildren(input.parentNodeId)),

  createNode: publicProcedure
    .input(z.object({
      nodeId: z.string().min(1).max(64),
      code: z.string().min(1).max(100),
      name: z.string().min(1).max(200),
      level: z.number().int().min(1).max(10),
      nodeType: z.string().min(1).max(20),
      parentNodeId: z.string().optional(),
      rootNodeId: z.string().min(1),
      templateCode: z.string().optional(),
      path: z.string().min(1),
      serialNumber: z.string().optional(),
      location: z.string().optional(),
      department: z.string().optional(),
      installDate: z.string().optional(),
      attributes: z.any().optional(),
    }))
    .mutation(({ input }) => assetNodeService.create(input)),

  updateNode: publicProcedure
    .input(z.object({
      nodeId: z.string(),
      name: z.string().optional(),
      status: z.string().optional(),
      location: z.string().optional(),
      department: z.string().optional(),
      serialNumber: z.string().optional(),
      attributes: z.any().optional(),
    }))
    .mutation(({ input }) => {
      const { nodeId, ...data } = input;
      return assetNodeService.update(nodeId, data);
    }),

  deleteNode: publicProcedure
    .input(z.object({ nodeId: z.string() }))
    .mutation(({ input }) => assetNodeService.delete(input.nodeId)),

  getStats: publicProcedure
    .query(() => assetNodeService.getStats()),

  // --- 测点 ---
  listMeasurementPoints: publicProcedure
    .input(z.object({
      nodeId: z.string().optional(),
      deviceCode: z.string().optional(),
      measurementType: z.string().optional(),
    }).optional())
    .query(({ input }) => measurementPointService.list(input ?? undefined)),

  getMeasurementPoint: publicProcedure
    .input(z.object({ mpId: z.string() }))
    .query(({ input }) => measurementPointService.getById(input.mpId)),

  createMeasurementPoint: publicProcedure
    .input(z.object({
      mpId: z.string().min(1).max(64),
      nodeId: z.string().min(1),
      deviceCode: z.string().min(1),
      templateCode: z.string().optional(),
      name: z.string().min(1).max(100),
      position: z.string().optional(),
      measurementType: z.string().min(1),
      warningThreshold: z.number().optional(),
      criticalThreshold: z.number().optional(),
    }))
    .mutation(({ input }) => measurementPointService.create(input)),

  updateMeasurementPoint: publicProcedure
    .input(z.object({
      mpId: z.string(),
      name: z.string().optional(),
      position: z.string().optional(),
      warningThreshold: z.number().optional(),
      criticalThreshold: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const { mpId, ...data } = input;
      return measurementPointService.update(mpId, data);
    }),

  deleteMeasurementPoint: publicProcedure
    .input(z.object({ mpId: z.string() }))
    .mutation(({ input }) => measurementPointService.delete(input.mpId)),

  // --- 传感器 ---
  listSensors: publicProcedure
    .input(z.object({
      deviceCode: z.string().optional(),
      mpId: z.string().optional(),
      status: z.string().optional(),
    }).optional())
    .query(({ input }) => assetSensorService.list(input ?? undefined)),

  getSensor: publicProcedure
    .input(z.object({ deviceCode: z.string(), sensorId: z.string() }))
    .query(({ input }) => assetSensorService.getById(input.deviceCode, input.sensorId)),

  createSensor: publicProcedure
    .input(z.object({
      deviceCode: z.string().min(1),
      sensorId: z.string().min(1),
      mpId: z.string().min(1),
      name: z.string().optional(),
      channel: z.string().optional(),
      sampleRate: z.number().optional(),
      physicalQuantity: z.string().optional(),
      unit: z.string().optional(),
      warningThreshold: z.number().optional(),
      criticalThreshold: z.number().optional(),
      manufacturer: z.string().optional(),
      model: z.string().optional(),
      serialNumber: z.string().optional(),
      installDate: z.string().optional(),
      calibrationDate: z.string().optional(),
    }))
    .mutation(({ input }) => assetSensorService.create(input)),

  updateSensor: publicProcedure
    .input(z.object({
      deviceCode: z.string(),
      sensorId: z.string(),
      name: z.string().optional(),
      status: z.string().optional(),
      sampleRate: z.number().optional(),
      warningThreshold: z.number().optional(),
      criticalThreshold: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const { deviceCode, sensorId, ...data } = input;
      return assetSensorService.update(deviceCode, sensorId, data);
    }),

  deleteSensor: publicProcedure
    .input(z.object({ deviceCode: z.string(), sensorId: z.string() }))
    .mutation(({ input }) => assetSensorService.delete(input.deviceCode, input.sensorId)),
});

// ============================================
// 基础配置路由
// ============================================

const configRouter = router({
  // --- 编码规则 ---
  listCodeRules: publicProcedure
    .query(() => codeRuleService.list()),

  getCodeRule: publicProcedure
    .input(z.object({ ruleCode: z.string() }))
    .query(({ input }) => codeRuleService.getByCode(input.ruleCode)),

  createCodeRule: publicProcedure
    .input(z.object({
      ruleCode: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      segments: z.any(),
      description: z.string().optional(),
    }))
    .mutation(({ input }) => codeRuleService.create(input)),

  updateCodeRule: publicProcedure
    .input(z.object({
      ruleCode: z.string(),
      name: z.string().optional(),
      segments: z.any().optional(),
      description: z.string().optional(),
      isActive: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const { ruleCode, ...data } = input;
      return codeRuleService.update(ruleCode, data);
    }),

  deleteCodeRule: publicProcedure
    .input(z.object({ ruleCode: z.string() }))
    .mutation(({ input }) => codeRuleService.delete(input.ruleCode)),

  // --- 节点模板 ---
  listNodeTemplates: publicProcedure
    .input(z.object({ level: z.number().optional(), nodeType: z.string().optional() }).optional())
    .query(({ input }) => nodeTemplateService.list(input ?? undefined)),

  getNodeTemplate: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(({ input }) => nodeTemplateService.getByCode(input.code)),

  createNodeTemplate: publicProcedure
    .input(z.object({
      code: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      level: z.number().int().min(1).max(10),
      nodeType: z.string().min(1).max(20),
      derivedFrom: z.string().optional(),
      codeRule: z.string().optional(),
      codePrefix: z.string().optional(),
      icon: z.string().optional(),
      children: z.any().optional(),
      attributes: z.any().optional(),
      measurementPoints: z.any().optional(),
      description: z.string().optional(),
    }))
    .mutation(({ input }) => nodeTemplateService.create(input)),

  updateNodeTemplate: publicProcedure
    .input(z.object({
      code: z.string(),
      name: z.string().optional(),
      icon: z.string().optional(),
      children: z.any().optional(),
      attributes: z.any().optional(),
      measurementPoints: z.any().optional(),
      description: z.string().optional(),
      isActive: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const { code, ...data } = input;
      return nodeTemplateService.update(code, data);
    }),

  deleteNodeTemplate: publicProcedure
    .input(z.object({ code: z.string() }))
    .mutation(({ input }) => nodeTemplateService.delete(input.code)),

  // --- 测点模板 ---
  listMpTemplates: publicProcedure
    .input(z.object({ measurementType: z.string().optional() }).optional())
    .query(({ input }) => mpTemplateService.list(input ?? undefined)),

  getMpTemplate: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(({ input }) => mpTemplateService.getByCode(input.code)),

  createMpTemplate: publicProcedure
    .input(z.object({
      code: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      measurementType: z.string().min(1),
      physicalQuantity: z.string().optional(),
      defaultUnit: z.string().optional(),
      defaultSampleRate: z.number().optional(),
      defaultWarning: z.number().optional(),
      defaultCritical: z.number().optional(),
      sensorConfig: z.any().optional(),
      thresholdConfig: z.any().optional(),
      description: z.string().optional(),
    }))
    .mutation(({ input }) => mpTemplateService.create(input)),

  updateMpTemplate: publicProcedure
    .input(z.object({
      code: z.string(),
      name: z.string().optional(),
      defaultWarning: z.number().optional(),
      defaultCritical: z.number().optional(),
      sensorConfig: z.any().optional(),
      description: z.string().optional(),
      isActive: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const { code, ...data } = input;
      return mpTemplateService.update(code, data);
    }),

  deleteMpTemplate: publicProcedure
    .input(z.object({ code: z.string() }))
    .mutation(({ input }) => mpTemplateService.delete(input.code)),

  // --- 标注维度 ---
  listLabelDimensions: publicProcedure
    .query(() => labelDimensionService.list()),

  getLabelDimension: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(({ input }) => labelDimensionService.getByCode(input.code)),

  createLabelDimension: publicProcedure
    .input(z.object({
      code: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      dimType: z.string().min(1),
      isRequired: z.number().optional(),
      sortOrder: z.number().optional(),
      description: z.string().optional(),
    }))
    .mutation(({ input }) => labelDimensionService.create(input)),

  createLabelOption: publicProcedure
    .input(z.object({
      dimensionCode: z.string().min(1),
      code: z.string().min(1).max(64),
      label: z.string().min(1).max(100),
      parentCode: z.string().optional(),
      color: z.string().optional(),
      isNormal: z.number().optional(),
      samplePriority: z.number().optional(),
    }))
    .mutation(({ input }) => labelOptionService.create(input)),

  // --- 数据字典 ---
  listDictCategories: publicProcedure
    .query(() => dictService.listCategories()),

  getDictCategory: publicProcedure
    .input(z.object({ categoryCode: z.string() }))
    .query(({ input }) => dictService.getCategoryWithItems(input.categoryCode)),

  createDictCategory: publicProcedure
    .input(z.object({
      code: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      description: z.string().optional(),
    }))
    .mutation(({ input }) => dictService.createCategory(input)),

  createDictItem: publicProcedure
    .input(z.object({
      categoryCode: z.string().min(1),
      code: z.string().min(1).max(64),
      label: z.string().min(1).max(100),
      value: z.string().optional(),
      parentCode: z.string().optional(),
      color: z.string().optional(),
    }))
    .mutation(({ input }) => dictService.createItem(input)),

  updateDictItem: publicProcedure
    .input(z.object({
      categoryCode: z.string(),
      code: z.string(),
      label: z.string().optional(),
      value: z.string().optional(),
      color: z.string().optional(),
    }))
    .mutation(({ input }) => {
      const { categoryCode, code, ...data } = input;
      return dictService.updateItem(categoryCode, code, data);
    }),

  deleteDictItem: publicProcedure
    .input(z.object({ categoryCode: z.string(), code: z.string() }))
    .mutation(({ input }) => dictService.deleteItem(input.categoryCode, input.code)),
});

// ============================================
// 数据切片路由
// ============================================

const sliceRouter = router({
  listRules: publicProcedure
    .input(z.object({ triggerType: z.string().optional(), isActive: z.number().optional() }).optional())
    .query(({ input }) => sliceRuleService.list(input ?? undefined)),

  getRule: publicProcedure
    .input(z.object({ ruleId: z.string() }))
    .query(({ input }) => sliceRuleService.getById(input.ruleId)),

  createRule: publicProcedure
    .input(z.object({
      ruleId: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      triggerType: z.string().min(1),
      triggerConfig: z.any(),
      deviceType: z.string().optional(),
      mechanismType: z.string().optional(),
      minDurationSec: z.number().optional(),
      maxDurationSec: z.number().optional(),
      mergeGapSec: z.number().optional(),
      autoLabels: z.any().optional(),
      priority: z.number().optional(),
    }))
    .mutation(({ input }) => sliceRuleService.create(input)),

  updateRule: publicProcedure
    .input(z.object({
      ruleId: z.string(),
      name: z.string().optional(),
      triggerConfig: z.any().optional(),
      isActive: z.number().optional(),
      priority: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const { ruleId, ...data } = input;
      return sliceRuleService.update(ruleId, data);
    }),

  deleteRule: publicProcedure
    .input(z.object({ ruleId: z.string() }))
    .mutation(({ input }) => sliceRuleService.delete(input.ruleId)),

  listSlices: publicProcedure
    .input(z.object({
      deviceCode: z.string().optional(),
      status: z.string().optional(),
      workConditionCode: z.string().optional(),
      faultTypeCode: z.string().optional(),
      labelStatus: z.string().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    }).optional())
    .query(({ input }) => dataSliceService.list(input ?? undefined)),

  getSlice: publicProcedure
    .input(z.object({ sliceId: z.string() }))
    .query(({ input }) => dataSliceService.getById(input.sliceId)),

  getSliceStats: publicProcedure
    .query(() => dataSliceService.getStats()),

  createSlice: publicProcedure
    .input(z.object({
      sliceId: z.string().min(1).max(64),
      deviceCode: z.string().min(1),
      ruleId: z.string().optional(),
      startTime: z.string().min(1),
      endTime: z.string().min(1),
      durationSec: z.number().optional(),
      workConditionCode: z.string().optional(),
      faultTypeCode: z.string().optional(),
      qualityScore: z.number().optional(),
      status: z.string().optional(),
    }))
    .mutation(({ input }) => dataSliceService.create(input)),

  deleteSlice: publicProcedure
    .input(z.object({ sliceId: z.string() }))
    .mutation(({ input }) => dataSliceService.delete(input.sliceId)),

  getSliceLabels: publicProcedure
    .input(z.object({ sliceId: z.string() }))
    .query(({ input }) => dataSliceService.getLabels(input.sliceId)),

  updateSliceLabels: publicProcedure
    .input(z.object({
      sliceId: z.string(),
      labels: z.any(),
    }))
    .mutation(({ input }) => dataSliceService.updateLabels(input.sliceId, input.labels, 'system')),
});

// ============================================
// 数据清洗路由
// ============================================

const cleanRouter = router({
  listRules: publicProcedure
    .input(z.object({ ruleType: z.string().optional(), isActive: z.number().optional() }).optional())
    .query(({ input }) => cleanRuleService.list(input ?? undefined)),

  getRule: publicProcedure
    .input(z.object({ ruleId: z.string() }))
    .query(({ input }) => cleanRuleService.getById(input.ruleId)),

  createRule: publicProcedure
    .input(z.object({
      ruleId: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      ruleType: z.string().min(1),
      detectConfig: z.any().optional(),
      actionType: z.string().optional(),
      actionConfig: z.any().optional(),
      deviceType: z.string().optional(),
      sensorType: z.string().optional(),
      measurementType: z.string().optional(),
      priority: z.number().optional(),
      description: z.string().optional(),
    }))
    .mutation(({ input }) => cleanRuleService.create({
      ...input,
      detectConfig: input.detectConfig || {},
      actionType: input.actionType || input.ruleType,
    })),

  updateRule: publicProcedure
    .input(z.object({
      ruleId: z.string(),
      name: z.string().optional(),
      detectConfig: z.any().optional(),
      actionConfig: z.any().optional(),
      isActive: z.number().optional(),
      priority: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const { ruleId, ...data } = input;
      return cleanRuleService.update(ruleId, data);
    }),

  deleteRule: publicProcedure
    .input(z.object({ ruleId: z.string() }))
    .mutation(({ input }) => cleanRuleService.delete(input.ruleId)),

  listTasks: publicProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => cleanTaskService.list({ ...input, pageSize: input?.limit || input?.pageSize })),

  getTask: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .query(({ input }) => cleanTaskService.getById(input.taskId)),

  createTask: publicProcedure
    .input(z.object({
      taskId: z.string().min(1).max(64),
      idempotentKey: z.string().min(1).max(64),
      name: z.string().optional(),
      deviceCode: z.string().optional(),
      sensorIds: z.array(z.string()).optional(),
      timeStart: z.string().min(1),
      timeEnd: z.string().min(1),
      ruleIds: z.array(z.string()).optional(),
    }))
    .mutation(({ input }) => cleanTaskService.create(input)),

  executeTask: publicProcedure
    .input(z.object({ ruleId: z.string() }))
    .mutation(async ({ input }) => {
      const taskId = `TASK-${Date.now()}`;
      const now = new Date();
      const result = await cleanTaskService.create({
        taskId,
        idempotentKey: `${input.ruleId}-${taskId}`,
        name: `Auto task for ${input.ruleId}`,
        ruleIds: [input.ruleId],
        timeStart: new Date(now.getTime() - 86400000).toISOString(),
        timeEnd: now.toISOString(),
      });
      return { taskId, success: true };
    }),

  listQualityReports: publicProcedure
    .input(z.object({
      reportType: z.string().optional(),
      deviceCode: z.string().optional(),
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    }).optional())
    .query(({ input }) => qualityReportService.list(input ?? undefined)),

  getQualityStats: publicProcedure
    .query(() => qualityReportService.getStats()),

  listCalibrations: publicProcedure
    .input(z.object({ deviceCode: z.string().optional(), sensorId: z.string().optional() }).optional())
    .query(({ input }) => calibrationService.list(input ?? undefined)),

  createCalibration: publicProcedure
    .input(z.object({
      deviceCode: z.string().min(1),
      sensorId: z.string().min(1),
      calibrationDate: z.string().min(1),
      calibrationType: z.string().min(1),
      offsetBefore: z.number().optional(),
      offsetAfter: z.number().optional(),
      scaleBefore: z.number().optional(),
      scaleAfter: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(({ input }) => calibrationService.create(input)),
});

// ============================================
// 事件溯源路由
// ============================================

const eventRouter = router({
  listEvents: publicProcedure
    .input(z.object({
      aggregateType: z.string().optional(),
      aggregateId: z.string().optional(),
      eventType: z.string().optional(),
      nodeId: z.string().optional(),
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    }).optional())
    .query(({ input }) => eventStoreService.list({
      ...input,
      pageSize: input?.limit || input?.pageSize,
    })),

  appendEvent: publicProcedure
    .input(z.object({
      eventId: z.string().max(64).optional(),
      eventType: z.string().min(1).max(100),
      aggregateType: z.string().min(1).max(50),
      aggregateId: z.string().min(1).max(100),
      aggregateVersion: z.number().int().optional(),
      payload: z.any().optional(),
      metadata: z.any().optional(),
      nodeId: z.string().optional(),
      causationId: z.string().optional(),
      correlationId: z.string().optional(),
      actorId: z.string().optional(),
      actorType: z.string().optional(),
    }))
    .mutation(({ input }) => eventStoreService.append({
      ...input,
      eventId: input.eventId || `EVT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      aggregateVersion: input.aggregateVersion ?? 1,
      payload: input.payload || {},
    })),

  getEventStats: publicProcedure
    .query(() => eventStoreService.getStats()),

  listSnapshots: publicProcedure
    .input(z.object({
      aggregateType: z.string().optional(),
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    }).optional())
    .query(({ input }) => eventSnapshotService.list({ ...input, pageSize: input?.limit || input?.pageSize })),

  createSnapshot: publicProcedure
    .input(z.object({
      aggregateType: z.string().min(1),
      aggregateId: z.string().min(1),
      version: z.number().int(),
      state: z.any(),
    }))
    .mutation(({ input }) => eventSnapshotService.create(input)),
});

// ============================================
// 数据库模块总路由
// ============================================

export const databaseRouter = router({
  asset: assetRouter,
  config: configRouter,
  slice: sliceRouter,
  clean: cleanRouter,
  event: eventRouter,
});
