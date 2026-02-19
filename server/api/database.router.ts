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
// P0 加固：数据库路由全部改为 protectedProcedure，禁止未认证访问
import { router, protectedProcedure } from "../core/trpc";
// 兼容别名：避免大量文件修改，所有 publicProcedure 引用自动指向 protectedProcedure
const publicProcedure = protectedProcedure;
import { workbenchRouter } from "./workbench.router";
import { assetNodeService, measurementPointService, assetSensorService } from '../services/database/asset.service';
import { codeRuleService, nodeTemplateService, mpTemplateService, labelDimensionService, labelOptionService, dictService } from '../services/database/config.service';
import { sliceRuleService, dataSliceService, cleanRuleService, cleanTaskService, qualityReportService, calibrationService, eventStoreService, eventSnapshotService } from '../services/database/data.service';
import { pluginRegistryService, pluginInstanceService, pluginEventService } from '../services/database/plugin.db.service';
import { auditLogService, alertRuleService, dataExportTaskService } from '../services/database/ops.db.service';
import { dataGovernanceJobService, dataLineageService, anomalyDetectionService } from '../services/database/governance.db.service';
import { scheduledTaskService, rollbackTriggerService, systemConfigService, asyncTaskLogService, messageQueueLogService } from '../services/database/schedule.db.service';
import { alertEventLogService, deviceDailySummaryService, deviceFirmwareService, deviceMaintenanceService, deviceStatusLogService } from '../services/database/device.db.service';
import { anomalyModelService, diagnosisResultService } from '../services/database/diagnosis.db.service';
import { edgeGatewayConfigService } from '../services/database/edge.db.service';
import { kbChunkService, kbConversationService, kbConversationMessageService, kbEmbeddingService, kbQaPairService } from '../services/database/knowledge.db.service';
import { modelRegistryService, modelDeploymentService, modelTrainingJobService, modelInferenceLogService } from '../services/database/model.db.service';
import { messageRoutingService, minioFileService, minioUploadLogService } from '../services/database/message.db.service';
import { realtimeDataService, vibrationAggService } from '../services/database/telemetry.db.service';
import { topoAlertService, topoLayerService, topoSnapshotService } from '../services/database/topo.db.service';
import { auditLogsSensitiveService, dataCleanResultService, dataCollectionTaskService } from '../services/database/governance.db.service';

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

  generateCode: publicProcedure
    .input(z.object({
      ruleCode: z.string(),
      category: z.string().optional(),
      deviceRef: z.string().optional(),
      nodeRef: z.string().optional(),
      measurementType: z.string().optional(),
      customSegments: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(({ input }) => {
      const { ruleCode, ...rest } = input;
      const context: { category?: string; deviceRef?: string; nodeRef?: string; measurementType?: string; customSegments?: Record<string, string> } = {
        category: rest.category,
        deviceRef: rest.deviceRef,
        nodeRef: rest.nodeRef,
        measurementType: rest.measurementType,
        customSegments: rest.customSegments as Record<string, string> | undefined,
      };
      return codeRuleService.generateCode(ruleCode, context);
    }),

  previewCode: publicProcedure
    .input(z.object({
      ruleCode: z.string(),
      category: z.string().optional(),
      deviceRef: z.string().optional(),
      nodeRef: z.string().optional(),
      measurementType: z.string().optional(),
      customSegments: z.record(z.string(), z.string()).optional(),
    }))
    .query(({ input }) => {
      const { ruleCode, ...rest } = input;
      const context: { category?: string; deviceRef?: string; nodeRef?: string; measurementType?: string; customSegments?: Record<string, string> } = {
        category: rest.category,
        deviceRef: rest.deviceRef,
        nodeRef: rest.nodeRef,
        measurementType: rest.measurementType,
        customSegments: rest.customSegments as Record<string, string> | undefined,
      };
      return codeRuleService.previewCode(ruleCode, context);
    }),

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

  updateDictCategory: publicProcedure
    .input(z.object({
      code: z.string().min(1),
      name: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(({ input }) => {
      const { code, ...data } = input;
      return dictService.updateCategory(code, data);
    }),

  deleteDictCategory: publicProcedure
    .input(z.object({ code: z.string().min(1) }))
    .mutation(({ input }) => dictService.deleteCategory(input.code)),
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
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    }).optional())
    .query(({ input }) => dataSliceService.list({ ...input, pageSize: input?.limit || input?.pageSize })),

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
// 插件引擎路由
// ============================================

const pluginDbRouter = router({
  listPlugins: publicProcedure
    .input(z.object({ pluginType: z.string().optional(), status: z.string().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => pluginRegistryService.list(input ?? undefined)),
  getPlugin: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => pluginRegistryService.getById(input.id)),
  getPluginByCode: publicProcedure
    .input(z.object({ pluginCode: z.string() }))
    .query(({ input }) => pluginRegistryService.getByCode(input.pluginCode)),
  createPlugin: publicProcedure
    .input(z.object({ pluginCode: z.string(), name: z.string(), pluginType: z.string(), version: z.string(), entryPoint: z.string(), description: z.string().optional(), configSchema: z.any().optional(), defaultConfig: z.any().optional(), capabilities: z.any().optional(), dependencies: z.any().optional(), author: z.string().optional(), license: z.string().optional(), isBuiltin: z.number().optional(), createdBy: z.string().optional() }))
    .mutation(({ input }) => pluginRegistryService.create(input)),
  updatePlugin: publicProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), version: z.string().optional(), entryPoint: z.string().optional(), description: z.string().optional(), configSchema: z.any().optional(), defaultConfig: z.any().optional(), capabilities: z.any().optional(), dependencies: z.any().optional(), status: z.string().optional(), updatedBy: z.string().optional() }))
    .mutation(({ input }) => { const { id, ...data } = input; return pluginRegistryService.update(id, data); }),
  deletePlugin: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => pluginRegistryService.delete(input.id)),
  getPluginStats: publicProcedure.query(() => pluginRegistryService.getStats()),

  listInstances: publicProcedure
    .input(z.object({ pluginId: z.number().optional(), status: z.string().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => pluginInstanceService.list(input ?? undefined)),
  getInstance: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => pluginInstanceService.getById(input.id)),
  createInstance: publicProcedure
    .input(z.object({ instanceCode: z.string(), pluginId: z.number(), name: z.string(), boundEntityType: z.string().optional(), boundEntityId: z.string().optional(), config: z.any().optional(), createdBy: z.string().optional() }))
    .mutation(({ input }) => pluginInstanceService.create(input)),
  updateInstanceStatus: publicProcedure
    .input(z.object({ id: z.number(), status: z.string(), errorMessage: z.string().optional() }))
    .mutation(({ input }) => pluginInstanceService.updateStatus(input.id, input.status, input.errorMessage)),
  heartbeatInstance: publicProcedure
    .input(z.object({ id: z.number(), runtimeState: z.any().optional() }))
    .mutation(({ input }) => pluginInstanceService.heartbeat(input.id, input.runtimeState)),
  deleteInstance: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => pluginInstanceService.delete(input.id)),

  listEvents: publicProcedure
    .input(z.object({ instanceId: z.number().optional(), eventType: z.string().optional(), severity: z.string().optional(), processed: z.number().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => pluginEventService.list(input ?? undefined)),
  emitEvent: publicProcedure
    .input(z.object({ eventId: z.string(), instanceId: z.number(), eventType: z.string(), payload: z.any().optional(), severity: z.string().optional(), sourcePlugin: z.string().optional(), targetPlugin: z.string().optional(), expiresAt: z.date().optional() }))
    .mutation(({ input }) => pluginEventService.emit(input)),
  markEventProcessed: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => pluginEventService.markProcessed(input.id)),
});

// ============================================
// 运维管理路由
// ============================================

const opsDbRouter = router({
  listAuditLogs: publicProcedure
    .input(z.object({ action: z.string().optional(), resourceType: z.string().optional(), operator: z.string().optional(), startDate: z.date().optional(), endDate: z.date().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => auditLogService.list(input ?? undefined)),
  createAuditLog: publicProcedure
    .input(z.object({ action: z.string(), resourceType: z.string(), resourceId: z.string(), operator: z.string(), operatorIp: z.string().optional(), oldValue: z.any().optional(), newValue: z.any().optional(), result: z.string().optional(), errorMessage: z.string().optional(), durationMs: z.number().optional(), traceId: z.string().optional() }))
    .mutation(({ input }) => auditLogService.create(input)),
  getAuditStats: publicProcedure.query(() => auditLogService.getStats()),

  listAlertRules: publicProcedure
    .input(z.object({ deviceType: z.string().optional(), severity: z.string().optional(), isActive: z.number().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => alertRuleService.list(input ?? undefined)),
  getAlertRule: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => alertRuleService.getById(input.id)),
  createAlertRule: publicProcedure
    .input(z.object({ ruleCode: z.string(), name: z.string(), deviceType: z.string(), measurementType: z.string(), severity: z.string(), condition: z.any(), cooldownSeconds: z.number().optional(), notificationChannels: z.any().optional(), priority: z.number().optional(), description: z.string().optional(), createdBy: z.string().optional() }))
    .mutation(({ input }) => alertRuleService.create(input)),
  updateAlertRule: publicProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), severity: z.string().optional(), condition: z.any().optional(), cooldownSeconds: z.number().optional(), notificationChannels: z.any().optional(), isActive: z.number().optional(), priority: z.number().optional(), description: z.string().optional(), updatedBy: z.string().optional() }))
    .mutation(({ input }) => { const { id, ...data } = input; return alertRuleService.update(id, data); }),
  deleteAlertRule: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => alertRuleService.softDelete(input.id)),
  toggleAlertRule: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => alertRuleService.toggleActive(input.id)),

  listExportTasks: publicProcedure
    .input(z.object({ exportType: z.string().optional(), status: z.string().optional(), createdBy: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => dataExportTaskService.list(input ?? undefined)),
  getExportTask: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => dataExportTaskService.getById(input.id)),
  createExportTask: publicProcedure
    .input(z.object({ taskCode: z.string(), name: z.string(), exportType: z.string(), format: z.string(), queryParams: z.any(), createdBy: z.string().optional() }))
    .mutation(({ input }) => dataExportTaskService.create(input)),
  updateExportProgress: publicProcedure
    .input(z.object({ id: z.number(), progress: z.number(), totalRows: z.number().optional() }))
    .mutation(({ input }) => dataExportTaskService.updateProgress(input.id, input.progress, input.totalRows)),
  markExportFailed: publicProcedure
    .input(z.object({ id: z.number(), errorMessage: z.string() }))
    .mutation(({ input }) => dataExportTaskService.markFailed(input.id, input.errorMessage)),
});

// ============================================
// 数据治理路由
// ============================================

const governanceDbRouter = router({
  listGovernanceJobs: publicProcedure
    .input(z.object({ jobType: z.string().optional(), status: z.string().optional(), targetTable: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => dataGovernanceJobService.list(input ?? undefined)),
  getGovernanceJob: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => dataGovernanceJobService.getById(input.id)),
  createGovernanceJob: publicProcedure
    .input(z.object({ jobId: z.string(), policyId: z.string(), jobType: z.string(), targetTable: z.string(), filterCondition: z.any().optional() }))
    .mutation(({ input }) => dataGovernanceJobService.create(input)),
  updateGovernanceJobStatus: publicProcedure
    .input(z.object({ id: z.number(), status: z.string(), affectedRows: z.number().optional(), freedBytes: z.number().optional(), errorMessage: z.string().optional() }))
    .mutation(({ input }) => { const { id, status, ...result } = input; return dataGovernanceJobService.updateStatus(id, status, result); }),
  getGovernanceStats: publicProcedure.query(() => dataGovernanceJobService.getStats()),

  listLineage: publicProcedure
    .input(z.object({ sourceType: z.string().optional(), targetType: z.string().optional(), transformType: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => dataLineageService.list(input ?? undefined)),
  getLineageBySource: publicProcedure
    .input(z.object({ sourceId: z.string() }))
    .query(({ input }) => dataLineageService.getBySourceId(input.sourceId)),
  getLineageByTarget: publicProcedure
    .input(z.object({ targetId: z.string() }))
    .query(({ input }) => dataLineageService.getByTargetId(input.targetId)),
  getFullLineageChain: publicProcedure
    .input(z.object({ entityId: z.string() }))
    .query(({ input }) => dataLineageService.getFullChain(input.entityId)),
  createLineage: publicProcedure
    .input(z.object({ lineageId: z.string(), sourceType: z.string(), sourceId: z.string(), sourceDetail: z.any().optional(), targetType: z.string(), targetId: z.string(), targetDetail: z.any().optional(), transformType: z.string(), transformParams: z.any().optional(), operator: z.string().optional() }))
    .mutation(({ input }) => dataLineageService.create(input)),

  listAnomalies: publicProcedure
    .input(z.object({ sensorId: z.string().optional(), severity: z.string().optional(), status: z.string().optional(), algorithmType: z.string().optional(), startDate: z.date().optional(), endDate: z.date().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => anomalyDetectionService.list(input ?? undefined)),
  getAnomaly: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => anomalyDetectionService.getById(input.id)),
  createAnomaly: publicProcedure
    .input(z.object({ detectionId: z.string(), sensorId: z.string(), nodeId: z.string().optional(), algorithmType: z.string(), windowSize: z.number(), threshold: z.number(), currentValue: z.number(), expectedValue: z.number(), deviation: z.number(), score: z.number(), severity: z.string() }))
    .mutation(({ input }) => anomalyDetectionService.create(input)),
  acknowledgeAnomaly: publicProcedure
    .input(z.object({ id: z.number(), acknowledgedBy: z.string() }))
    .mutation(({ input }) => anomalyDetectionService.acknowledge(input.id, input.acknowledgedBy)),
  resolveAnomaly: publicProcedure
    .input(z.object({ id: z.number(), notes: z.string().optional() }))
    .mutation(({ input }) => anomalyDetectionService.resolve(input.id, input.notes)),
  getAnomalyStats: publicProcedure.query(() => anomalyDetectionService.getStats()),
});

// ============================================
// 调度与配置路由
// ============================================

const scheduleDbRouter = router({
  listScheduledTasks: publicProcedure
    .input(z.object({ taskType: z.string().optional(), status: z.string().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => scheduledTaskService.list(input ?? undefined)),
  getScheduledTask: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => scheduledTaskService.getById(input.id)),
  createScheduledTask: publicProcedure
    .input(z.object({ taskCode: z.string(), name: z.string(), taskType: z.string(), cronExpression: z.string().optional(), intervalSeconds: z.number().optional(), handler: z.string(), params: z.any().optional(), timeoutSeconds: z.number().optional(), maxRetries: z.number().optional(), description: z.string().optional(), createdBy: z.string().optional() }))
    .mutation(({ input }) => scheduledTaskService.create(input)),
  updateScheduledTaskStatus: publicProcedure
    .input(z.object({ id: z.number(), status: z.string(), lastRunResult: z.string().optional() }))
    .mutation(({ input }) => scheduledTaskService.updateStatus(input.id, input.status, input.lastRunResult)),
  deleteScheduledTask: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => scheduledTaskService.softDelete(input.id)),

  listRollbackTriggers: publicProcedure
    .input(z.object({ targetTable: z.string().optional(), isActive: z.number().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => rollbackTriggerService.list(input ?? undefined)),
  getRollbackTrigger: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => rollbackTriggerService.getById(input.id)),
  createRollbackTrigger: publicProcedure
    .input(z.object({ triggerCode: z.string(), name: z.string(), targetTable: z.string(), conditionType: z.string(), conditionParams: z.any(), rollbackAction: z.string(), actionParams: z.any().optional(), createdBy: z.string().optional() }))
    .mutation(({ input }) => rollbackTriggerService.create(input)),
  toggleRollbackTrigger: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => rollbackTriggerService.toggleActive(input.id)),
  deleteRollbackTrigger: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => rollbackTriggerService.softDelete(input.id)),

  listSystemConfigs: publicProcedure
    .input(z.object({ category: z.string().optional(), environment: z.string().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => systemConfigService.list(input ?? undefined)),
  getSystemConfig: publicProcedure
    .input(z.object({ configKey: z.string(), environment: z.string().optional() }))
    .query(({ input }) => systemConfigService.getByKey(input.configKey, input.environment)),
  upsertSystemConfig: publicProcedure
    .input(z.object({ configKey: z.string(), configValue: z.string(), valueType: z.string(), category: z.string(), environment: z.string().optional(), description: z.string().optional(), isSensitive: z.number().optional(), updatedBy: z.string().optional() }))
    .mutation(({ input }) => systemConfigService.upsert(input)),
  getConfigChangeHistory: publicProcedure
    .input(z.object({ configKey: z.string(), limit: z.number().optional() }))
    .query(({ input }) => systemConfigService.getChangeHistory(input.configKey, input.limit)),

  listAsyncTasks: publicProcedure
    .input(z.object({ taskType: z.string().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => asyncTaskLogService.list(input ?? undefined)),
  createAsyncTask: publicProcedure
    .input(z.object({ taskId: z.string(), taskType: z.string(), inputParams: z.any().optional(), maxRetries: z.number().optional(), createdBy: z.string().optional() }))
    .mutation(({ input }) => asyncTaskLogService.create(input)),
  updateAsyncTaskStatus: publicProcedure
    .input(z.object({ id: z.number(), status: z.string(), outputResult: z.any().optional(), progress: z.number().optional(), errorMessage: z.string().optional() }))
    .mutation(({ input }) => { const { id, status, ...result } = input; return asyncTaskLogService.updateStatus(id, status, result); }),

  listMessageQueueLogs: publicProcedure
    .input(z.object({ topic: z.string().optional(), direction: z.string().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => messageQueueLogService.list(input ?? undefined)),
  createMessageQueueLog: publicProcedure
    .input(z.object({ messageId: z.string(), topic: z.string(), partitionKey: z.string().optional(), payload: z.any(), direction: z.string() }))
    .mutation(({ input }) => messageQueueLogService.create(input)),
  updateMessageQueueStatus: publicProcedure
    .input(z.object({ id: z.number(), status: z.string(), errorMessage: z.string().optional() }))
    .mutation(({ input }) => messageQueueLogService.updateStatus(input.id, input.status, input.errorMessage)),
});

// ============================================
// 数据库模块总路由
// ============================================

// ============================================
// §23 设备运维扩展路由
// ============================================
const deviceDbRouter = router({
  listAlertEvents: publicProcedure
    .input(z.object({ deviceCode: z.string().optional(), severity: z.string().optional(), alertType: z.string().optional(), acknowledged: z.number().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => alertEventLogService.list(input ?? undefined)),
  getAlertEvent: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => alertEventLogService.getById(input.id)),
  createAlertEvent: publicProcedure
    .input(z.object({ alertId: z.string(), ruleId: z.number().optional(), deviceCode: z.string(), severity: z.string(), alertType: z.string(), message: z.string(), metricValue: z.number().optional(), thresholdValue: z.number().optional() }))
    .mutation(({ input }) => alertEventLogService.create(input)),
  acknowledgeAlert: publicProcedure
    .input(z.object({ id: z.number(), acknowledgedBy: z.string() }))
    .mutation(({ input }) => alertEventLogService.acknowledge(input.id, input.acknowledgedBy)),
  listDailySummaries: publicProcedure
    .input(z.object({ deviceCode: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => deviceDailySummaryService.list(input ?? undefined)),
  createDailySummary: publicProcedure
    .input(z.object({ deviceCode: z.string(), summaryDate: z.string(), onlineHours: z.number().optional(), alertCount: z.number(), dataPoints: z.number(), avgCpuUsage: z.number().optional(), avgMemoryUsage: z.number().optional(), maxTemperature: z.number().optional() }))
    .mutation(({ input }) => deviceDailySummaryService.create(input)),
  listFirmware: publicProcedure
    .input(z.object({ deviceType: z.string().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => deviceFirmwareService.list(input ?? undefined)),
  getFirmware: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => deviceFirmwareService.getById(input.id)),
  createFirmware: publicProcedure
    .input(z.object({ deviceType: z.string(), firmwareVersion: z.string(), releaseNotes: z.string().optional(), fileUrl: z.string(), fileHash: z.string(), fileSize: z.number(), isMandatory: z.number(), status: z.string().optional() }))
    .mutation(({ input }) => deviceFirmwareService.create(input)),
  updateFirmwareStatus: publicProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(({ input }) => deviceFirmwareService.updateStatus(input.id, input.status)),
  listMaintenanceLogs: publicProcedure
    .input(z.object({ deviceCode: z.string().optional(), maintenanceType: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => deviceMaintenanceService.list(input ?? undefined)),
  getMaintenanceLog: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => deviceMaintenanceService.getById(input.id)),
  createMaintenanceLog: publicProcedure
    .input(z.object({ deviceCode: z.string(), maintenanceType: z.string(), title: z.string(), description: z.string().optional(), operator: z.string(), startedAt: z.string().transform(v => new Date(v)), completedAt: z.string().optional().transform(v => v ? new Date(v) : undefined), result: z.string().optional(), cost: z.number().optional(), partsReplaced: z.any().optional(), attachments: z.any().optional(), nextMaintenanceDate: z.string().optional() }))
    .mutation(({ input }) => deviceMaintenanceService.create(input)),
  listStatusLogs: publicProcedure
    .input(z.object({ deviceCode: z.string().optional(), currentStatus: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => deviceStatusLogService.list(input ?? undefined)),
  createStatusLog: publicProcedure
    .input(z.object({ deviceCode: z.string(), previousStatus: z.string().optional(), currentStatus: z.string(), reason: z.string().optional(), triggeredBy: z.string().optional(), metadata: z.any().optional() }))
    .mutation(({ input }) => deviceStatusLogService.create(input)),
});

// ============================================
// §23 诊断分析扩展路由
// ============================================
const diagnosisDbRouter = router({
  listAnomalyModels: publicProcedure
    .input(z.object({ modelType: z.string().optional(), status: z.string().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => anomalyModelService.list(input ?? undefined)),
  getAnomalyModel: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => anomalyModelService.getById(input.id)),
  createAnomalyModel: publicProcedure
    .input(z.object({ modelCode: z.string(), modelName: z.string(), modelType: z.string(), targetMetric: z.string(), hyperparams: z.any().optional(), trainingDataRange: z.any().optional(), accuracy: z.number().optional(), modelFileUrl: z.string().optional(), status: z.string().optional() }))
    .mutation(({ input }) => anomalyModelService.create(input)),
  deployAnomalyModel: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => anomalyModelService.deploy(input.id)),
  listDiagnosisResults: publicProcedure
    .input(z.object({ deviceCode: z.string().optional(), diagnosisType: z.string().optional(), severity: z.string().optional(), resolved: z.number().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => diagnosisResultService.list(input ?? undefined)),
  getDiagnosisResult: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => diagnosisResultService.getById(input.id)),
  createDiagnosisResult: publicProcedure
    .input(z.object({ taskId: z.number(), deviceCode: z.string(), diagnosisType: z.string(), severity: z.string(), faultCode: z.string().optional(), faultDescription: z.string().optional(), confidence: z.number().optional(), evidence: z.any().optional(), recommendation: z.string().optional() }))
    .mutation(({ input }) => diagnosisResultService.create(input)),
  resolveDiagnosis: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => diagnosisResultService.resolve(input.id)),
});

// ============================================
// §23 边缘采集扩展路由
// ============================================
const edgeDbRouter = router({
  listGateways: publicProcedure
    .input(z.object({ gatewayType: z.string().optional(), status: z.string().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => edgeGatewayConfigService.list(input ?? undefined)),
  getGateway: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => edgeGatewayConfigService.getById(input.id)),
  getGatewayByCode: publicProcedure
    .input(z.object({ gatewayCode: z.string() }))
    .query(({ input }) => edgeGatewayConfigService.getByCode(input.gatewayCode)),
  createGateway: publicProcedure
    .input(z.object({ gatewayCode: z.string(), gatewayName: z.string(), gatewayType: z.string(), ipAddress: z.string().optional(), port: z.number().optional(), firmwareVersion: z.string().optional(), protocols: z.any().optional(), maxDevices: z.number(), heartbeatInterval: z.number(), status: z.string().optional(), location: z.string().optional() }))
    .mutation(({ input }) => edgeGatewayConfigService.create(input)),
  updateGateway: publicProcedure
    .input(z.object({ id: z.number(), gatewayName: z.string().optional(), ipAddress: z.string().optional(), port: z.number().optional(), firmwareVersion: z.string().optional(), protocols: z.any().optional(), maxDevices: z.number().optional(), heartbeatInterval: z.number().optional(), status: z.string().optional(), location: z.string().optional() }))
    .mutation(({ input }) => { const { id, ...data } = input; return edgeGatewayConfigService.update(id, data); }),
  heartbeat: publicProcedure
    .input(z.object({ gatewayCode: z.string() }))
    .mutation(({ input }) => edgeGatewayConfigService.heartbeat(input.gatewayCode)),
});

// ============================================
// §23 知识库扩展路由
// ============================================
const knowledgeDbRouter = router({
  listChunks: publicProcedure
    .input(z.object({ documentId: z.number(), page: z.number().optional(), pageSize: z.number().optional() }))
    .query(({ input }) => kbChunkService.listByDocument(input.documentId, input.page, input.pageSize)),
  getChunk: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => kbChunkService.getById(input.id)),
  createChunk: publicProcedure
    .input(z.object({ documentId: z.number(), chunkIndex: z.number(), content: z.string(), tokenCount: z.number().optional(), metadata: z.any().optional(), embeddingId: z.number().optional() }))
    .mutation(({ input }) => kbChunkService.create(input)),
  deleteChunksByDocument: publicProcedure
    .input(z.object({ documentId: z.number() }))
    .mutation(({ input }) => kbChunkService.deleteByDocument(input.documentId)),
  listConversations: publicProcedure
    .input(z.object({ collectionId: z.number().optional(), userId: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => kbConversationService.list(input ?? undefined)),
  getConversation: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => kbConversationService.getById(input.id)),
  createConversation: publicProcedure
    .input(z.object({ collectionId: z.number(), title: z.string().optional(), userId: z.string(), modelName: z.string().optional() }))
    .mutation(({ input }) => kbConversationService.create(input)),
  listMessages: publicProcedure
    .input(z.object({ conversationId: z.number(), page: z.number().optional(), pageSize: z.number().optional() }))
    .query(({ input }) => kbConversationMessageService.listByConversation(input.conversationId, input.page, input.pageSize)),
  createMessage: publicProcedure
    .input(z.object({ conversationId: z.number(), role: z.string(), content: z.string(), tokenCount: z.number().optional(), sources: z.any().optional() }))
    .mutation(({ input }) => kbConversationMessageService.create(input)),
  feedbackMessage: publicProcedure
    .input(z.object({ id: z.number(), feedback: z.number() }))
    .mutation(({ input }) => kbConversationMessageService.feedback(input.id, input.feedback)),
  listEmbeddings: publicProcedure
    .input(z.object({ chunkId: z.number() }))
    .query(({ input }) => kbEmbeddingService.listByChunk(input.chunkId)),
  createEmbedding: publicProcedure
    .input(z.object({ chunkId: z.number(), modelName: z.string(), dimensions: z.number(), vectorData: z.string(), norm: z.number().optional() }))
    .mutation(({ input }) => kbEmbeddingService.create(input)),
  listQaPairs: publicProcedure
    .input(z.object({ collectionId: z.number().optional(), isVerified: z.number().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => kbQaPairService.list(input ?? undefined)),
  createQaPair: publicProcedure
    .input(z.object({ collectionId: z.number(), question: z.string(), answer: z.string(), sourceDocumentId: z.number().optional(), confidence: z.number().optional(), tags: z.any().optional() }))
    .mutation(({ input }) => kbQaPairService.create(input)),
  verifyQaPair: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => kbQaPairService.verify(input.id)),
});

// ============================================
// §23 模型中心扩展路由
// ============================================
const modelDbRouter = router({
  listModels: publicProcedure
    .input(z.object({ modelType: z.string().optional(), status: z.string().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => modelRegistryService.list(input ?? undefined)),
  getModel: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => modelRegistryService.getById(input.id)),
  getModelByCode: publicProcedure
    .input(z.object({ modelCode: z.string() }))
    .query(({ input }) => modelRegistryService.getByCode(input.modelCode)),
  createModel: publicProcedure
    .input(z.object({ modelCode: z.string(), modelName: z.string(), modelType: z.string(), framework: z.string().optional(), version: z.string(), description: z.string().optional(), modelFileUrl: z.string().optional(), metrics: z.any().optional(), tags: z.any().optional(), status: z.string().optional(), createdBy: z.string().optional() }))
    .mutation(({ input }) => modelRegistryService.create(input)),
  updateModel: publicProcedure
    .input(z.object({ id: z.number(), modelName: z.string().optional(), framework: z.string().optional(), version: z.string().optional(), description: z.string().optional(), modelFileUrl: z.string().optional(), metrics: z.any().optional(), tags: z.any().optional(), status: z.string().optional() }))
    .mutation(({ input }) => { const { id, ...data } = input; return modelRegistryService.update(id, data); }),
  listDeployments: publicProcedure
    .input(z.object({ modelId: z.number().optional(), environment: z.string().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => modelDeploymentService.list(input ?? undefined)),
  getDeployment: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => modelDeploymentService.getById(input.id)),
  createDeployment: publicProcedure
    .input(z.object({ modelId: z.number(), deploymentName: z.string(), environment: z.string(), endpointUrl: z.string().optional(), replicas: z.number(), gpuType: z.string().optional() }))
    .mutation(({ input }) => modelDeploymentService.create(input)),
  updateDeploymentStatus: publicProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(({ input }) => modelDeploymentService.updateStatus(input.id, input.status)),
  listTrainingJobs: publicProcedure
    .input(z.object({ modelId: z.number().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => modelTrainingJobService.list(input ?? undefined)),
  getTrainingJob: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => modelTrainingJobService.getById(input.id)),
  createTrainingJob: publicProcedure
    .input(z.object({ modelId: z.number(), jobName: z.string(), trainingData: z.any().optional(), hyperparams: z.any().optional(), gpuType: z.string().optional(), epochs: z.number().optional() }))
    .mutation(({ input }) => modelTrainingJobService.create(input)),
  updateTrainingProgress: publicProcedure
    .input(z.object({ id: z.number(), currentEpoch: z.number(), loss: z.number().optional(), status: z.string().optional() }))
    .mutation(({ input }) => modelTrainingJobService.updateProgress(input.id, input.currentEpoch, input.loss, input.status)),
  listInferenceLogs: publicProcedure
    .input(z.object({ deploymentId: z.number().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => modelInferenceLogService.list(input ?? undefined)),
  createInferenceLog: publicProcedure
    .input(z.object({ deploymentId: z.number(), requestId: z.string(), inputTokens: z.number().optional(), outputTokens: z.number().optional(), latencyMs: z.number().optional(), status: z.string(), errorMessage: z.string().optional() }))
    .mutation(({ input }) => modelInferenceLogService.create(input)),
});

// ============================================
// §23 消息与存储扩展路由
// ============================================
const messageDbRouter = router({
  listRoutes: publicProcedure
    .input(z.object({ search: z.string().optional(), isEnabled: z.number().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => messageRoutingService.list(input ?? undefined)),
  getRoute: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => messageRoutingService.getById(input.id)),
  createRoute: publicProcedure
    .input(z.object({ routeName: z.string(), sourceTopic: z.string(), targetTopic: z.string(), filterExpr: z.string().optional(), transformScript: z.string().optional(), priority: z.number(), isEnabled: z.number().optional() }))
    .mutation(({ input }) => messageRoutingService.create(input)),
  updateRoute: publicProcedure
    .input(z.object({ id: z.number(), routeName: z.string().optional(), sourceTopic: z.string().optional(), targetTopic: z.string().optional(), filterExpr: z.string().optional(), transformScript: z.string().optional(), priority: z.number().optional(), isEnabled: z.number().optional() }))
    .mutation(({ input }) => { const { id, ...data } = input; return messageRoutingService.update(id, data); }),
  listFiles: publicProcedure
    .input(z.object({ bucket: z.string().optional(), contentType: z.string().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => minioFileService.list(input ?? undefined)),
  getFile: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => minioFileService.getById(input.id)),
  createFile: publicProcedure
    .input(z.object({ bucket: z.string(), objectKey: z.string(), contentType: z.string(), fileSize: z.number(), etag: z.string().optional(), tags: z.any().optional(), uploadedBy: z.string().optional() }))
    .mutation(({ input }) => minioFileService.create(input)),
  listUploadLogs: publicProcedure
    .input(z.object({ bucket: z.string().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => minioUploadLogService.list(input ?? undefined)),
  createUploadLog: publicProcedure
    .input(z.object({ bucket: z.string(), objectKey: z.string(), fileSize: z.number(), uploadDurationMs: z.number().optional(), status: z.string(), errorMessage: z.string().optional(), uploadedBy: z.string().optional() }))
    .mutation(({ input }) => minioUploadLogService.create(input)),
});

// ============================================
// §23 实时遥测扩展路由
// ============================================
const telemetryDbRouter = router({
  listRealtimeData: publicProcedure
    .input(z.object({ deviceCode: z.string().optional(), mpCode: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => realtimeDataService.list(input ?? undefined)),
  getLatestData: publicProcedure
    .input(z.object({ deviceCode: z.string(), mpCode: z.string() }))
    .query(({ input }) => realtimeDataService.getLatest(input.deviceCode, input.mpCode)),
  upsertRealtimeData: publicProcedure
    .input(z.object({ deviceCode: z.string(), mpCode: z.string(), value: z.number().optional(), stringValue: z.string().optional(), quality: z.number(), sourceTimestamp: z.string().transform(v => new Date(v)), serverTimestamp: z.string().transform(v => new Date(v)) }))
    .mutation(({ input }) => realtimeDataService.upsert(input)),
  listVibrationAgg: publicProcedure
    .input(z.object({ deviceCode: z.string().optional(), mpCode: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => vibrationAggService.list(input ?? undefined)),
  createVibrationAgg: publicProcedure
    .input(z.object({ deviceCode: z.string(), mpCode: z.string(), hourStart: z.string().transform(v => new Date(v)), rmsAvg: z.number().optional(), rmsMax: z.number().optional(), peakAvg: z.number().optional(), peakMax: z.number().optional(), kurtosisAvg: z.number().optional(), sampleCount: z.number() }))
    .mutation(({ input }) => vibrationAggService.create(input)),
});

// ============================================
// §23 系统拓扑扩展路由
// ============================================
const topoDbRouter = router({
  listAlerts: publicProcedure
    .input(z.object({ nodeId: z.string().optional(), alertType: z.string().optional(), severity: z.string().optional(), resolved: z.number().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => topoAlertService.list(input ?? undefined)),
  createAlert: publicProcedure
    .input(z.object({ nodeId: z.string(), alertType: z.string(), severity: z.string(), message: z.string() }))
    .mutation(({ input }) => topoAlertService.create(input)),
  resolveAlert: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => topoAlertService.resolve(input.id)),
  listLayers: publicProcedure
    .query(() => topoLayerService.list()),
  getLayer: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => topoLayerService.getById(input.id)),
  createLayer: publicProcedure
    .input(z.object({ layerCode: z.string(), layerName: z.string(), layerOrder: z.number(), color: z.string().optional(), description: z.string().optional() }))
    .mutation(({ input }) => topoLayerService.create(input)),
  updateLayer: publicProcedure
    .input(z.object({ id: z.number(), layerName: z.string().optional(), layerOrder: z.number().optional(), color: z.string().optional(), description: z.string().optional() }))
    .mutation(({ input }) => { const { id, ...data } = input; return topoLayerService.update(id, data); }),
  listSnapshots: publicProcedure
    .input(z.object({ page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => topoSnapshotService.list(input ?? undefined)),
  getSnapshot: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => topoSnapshotService.getById(input.id)),
  createSnapshot: publicProcedure
    .input(z.object({ snapshotName: z.string(), snapshotData: z.any(), nodeCount: z.number(), edgeCount: z.number(), createdBy: z.string().optional() }))
    .mutation(({ input }) => topoSnapshotService.create(input)),
});

// ============================================
// §23 扩展治理路由 (敏感审计/清洗结果/采集任务)
// ============================================
const governanceExtRouter = router({
  listSensitiveLogs: publicProcedure
    .input(z.object({ auditLogId: z.number().optional(), sensitiveType: z.string().optional(), riskLevel: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => auditLogsSensitiveService.list(input ?? undefined)),
  createSensitiveLog: publicProcedure
    .input(z.object({ auditLogId: z.number(), sensitiveType: z.string(), sensitiveData: z.any().optional(), riskLevel: z.string(), requiresApproval: z.number() }))
    .mutation(({ input }) => auditLogsSensitiveService.create(input)),
  approveSensitiveLog: publicProcedure
    .input(z.object({ id: z.number(), approvedBy: z.string() }))
    .mutation(({ input }) => auditLogsSensitiveService.approve(input.id, input.approvedBy)),
  listCleanResults: publicProcedure
    .input(z.object({ taskId: z.number().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => dataCleanResultService.list(input ?? undefined)),
  createCleanResult: publicProcedure
    .input(z.object({ taskId: z.number(), sourceTable: z.string(), sourceRowId: z.number(), fieldName: z.string(), originalValue: z.string().optional(), cleanedValue: z.string().optional(), ruleApplied: z.string().optional(), status: z.string().optional() }))
    .mutation(({ input }) => dataCleanResultService.create(input)),
  listCollectionTasks: publicProcedure
    .input(z.object({ gatewayId: z.string().optional(), taskType: z.string().optional(), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => dataCollectionTaskService.list(input ?? undefined)),
  getCollectionTask: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => dataCollectionTaskService.getById(input.id)),
  createCollectionTask: publicProcedure
    .input(z.object({ taskId: z.string(), taskName: z.string(), gatewayId: z.string(), taskType: z.string().optional(), sensorIds: z.any(), scheduleConfig: z.any().optional(), samplingConfig: z.any().optional(), preprocessingConfig: z.any().optional(), triggerConfig: z.any().optional(), status: z.string().optional() }))
    .mutation(({ input }) => dataCollectionTaskService.create(input)),
  updateCollectionTaskStatus: publicProcedure
    .input(z.object({ id: z.number(), status: z.string(), errorMessage: z.string().optional() }))
    .mutation(({ input }) => dataCollectionTaskService.updateStatus(input.id, input.status, input.errorMessage)),
});

export const databaseRouter = router({
  asset: assetRouter,
  config: configRouter,
  slice: sliceRouter,
  clean: cleanRouter,
  event: eventRouter,
  workbench: workbenchRouter,
  pluginDb: pluginDbRouter,
  opsDb: opsDbRouter,
  governanceDb: governanceDbRouter,
  scheduleDb: scheduleDbRouter,
  deviceDb: deviceDbRouter,
  diagnosisDb: diagnosisDbRouter,
  edgeDb: edgeDbRouter,
  knowledgeDb: knowledgeDbRouter,
  modelDb: modelDbRouter,
  messageDb: messageDbRouter,
  telemetryDb: telemetryDbRouter,
  topoDb: topoDbRouter,
  governanceExt: governanceExtRouter,
});
