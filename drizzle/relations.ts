import { relations } from "drizzle-orm";
import {
  users,
  // 知识库
  kbCollections, kbPoints, kbDocuments,
  // 知识图谱
  kgNodes, kgEdges,
  // AI 模型
  models, modelFineTuneTasks, modelEvaluations, modelUsageLogs,
  modelConversations, modelMessages,
  // 诊断
  diagnosisRules, diagnosisTasks, anomalyDetections, sensorCalibrations,
  // 设备运维
  deviceAlerts, deviceMaintenanceRecords, deviceKpis, deviceOperationLogs,
  deviceSamplingConfig, deviceSpareParts, deviceProtocolConfig, deviceRuleVersions,
  // 基础配置
  baseNodeTemplates, baseMpTemplates, baseDictCategories, baseDictItems,
  baseLabelDimensions,
  // 资产管理
  assetNodes, assetMeasurementPoints, assetSensors, sensorMpMapping,
  // 数据治理
  dataSlices, dataSliceLabelHistory, dataCleanTasks, dataCleanLogs,
  dataQualityReports, dataGovernanceJobs, minioCleanupLog, dataLineage,
  // 消息与任务
  eventLogs, messageQueueLog, asyncTaskLog,
  // 插件引擎
  pluginRegistry, pluginInstances, pluginEvents,
  // 配置中心
  systemConfigs, configChangeLogs,
  // 运营管理
  alertRules, auditLogs, dataExportTasks,
  // 调度管理
  scheduledTasks, rollbackTriggers,
  // 系统拓扑
  topoNodes, topoEdges, topoLayouts, systemCapacityMetrics,
} from "./schema";

// ============ 用户关系 ============
export const usersRelations = relations(users, ({ many }) => ({
  kbCollections: many(kbCollections),
  modelConversations: many(modelConversations),
}));

// ============ 知识库关系 ============
export const kbCollectionsRelations = relations(kbCollections, ({ one, many }) => ({
  owner: one(users, { fields: [kbCollections.userId], references: [users.id] }),
  documents: many(kbDocuments),
  points: many(kbPoints),
}));

export const kbDocumentsRelations = relations(kbDocuments, ({ one }) => ({
  collection: one(kbCollections, { fields: [kbDocuments.collectionId], references: [kbCollections.id] }),
}));

export const kbPointsRelations = relations(kbPoints, ({ one }) => ({
  collection: one(kbCollections, { fields: [kbPoints.collectionId], references: [kbCollections.id] }),
}));

// ============ AI 模型关系 ============
export const modelsRelations = relations(models, ({ many }) => ({
  fineTuneTasks: many(modelFineTuneTasks),
  evaluations: many(modelEvaluations),
  usageLogs: many(modelUsageLogs),
}));

export const modelFineTuneTasksRelations = relations(modelFineTuneTasks, ({ one }) => ({
  model: one(models, { fields: [modelFineTuneTasks.modelId], references: [models.id] }),
}));

export const modelEvaluationsRelations = relations(modelEvaluations, ({ one }) => ({
  model: one(models, { fields: [modelEvaluations.modelId], references: [models.id] }),
}));

export const modelUsageLogsRelations = relations(modelUsageLogs, ({ one }) => ({
  model: one(models, { fields: [modelUsageLogs.modelId], references: [models.id] }),
}));

export const modelConversationsRelations = relations(modelConversations, ({ one, many }) => ({
  user: one(users, { fields: [modelConversations.userId], references: [users.id] }),
  messages: many(modelMessages),
}));

export const modelMessagesRelations = relations(modelMessages, ({ one }) => ({
  conversation: one(modelConversations, { fields: [modelMessages.conversationId], references: [modelConversations.id] }),
}));

// ============ 资产管理关系 ============
export const assetNodesRelations = relations(assetNodes, ({ one, many }) => ({
  template: one(baseNodeTemplates, { fields: [assetNodes.templateCode], references: [baseNodeTemplates.code] }),
  measurementPoints: many(assetMeasurementPoints),
  sensors: many(assetSensors),
  alerts: many(deviceAlerts),
  maintenanceRecords: many(deviceMaintenanceRecords),
  kpis: many(deviceKpis),
  operationLogs: many(deviceOperationLogs),
  spareParts: many(deviceSpareParts),
}));

export const assetMeasurementPointsRelations = relations(assetMeasurementPoints, ({ one, many }) => ({
  node: one(assetNodes, { fields: [assetMeasurementPoints.nodeId], references: [assetNodes.nodeId] }),
  sensorMappings: many(sensorMpMapping),
}));

export const assetSensorsRelations = relations(assetSensors, ({ one, many }) => ({
  node: one(assetNodes, { fields: [assetSensors.nodeId], references: [assetNodes.nodeId] }),
  mpMappings: many(sensorMpMapping),
  calibrations: many(sensorCalibrations),
}));

export const sensorMpMappingRelations = relations(sensorMpMapping, ({ one }) => ({
  sensor: one(assetSensors, { fields: [sensorMpMapping.sensorId], references: [assetSensors.sensorId] }),
  measurementPoint: one(assetMeasurementPoints, { fields: [sensorMpMapping.mpId], references: [assetMeasurementPoints.mpId] }),
}));

// ============ 设备运维关系 ============
export const deviceAlertsRelations = relations(deviceAlerts, ({ one }) => ({
  node: one(assetNodes, { fields: [deviceAlerts.nodeId], references: [assetNodes.nodeId] }),
}));

export const deviceMaintenanceRecordsRelations = relations(deviceMaintenanceRecords, ({ one }) => ({
  node: one(assetNodes, { fields: [deviceMaintenanceRecords.nodeId], references: [assetNodes.nodeId] }),
}));

export const deviceKpisRelations = relations(deviceKpis, ({ one }) => ({
  node: one(assetNodes, { fields: [deviceKpis.nodeId], references: [assetNodes.nodeId] }),
}));

export const deviceOperationLogsRelations = relations(deviceOperationLogs, ({ one }) => ({
  node: one(assetNodes, { fields: [deviceOperationLogs.nodeId], references: [assetNodes.nodeId] }),
}));

export const deviceSparePartsRelations = relations(deviceSpareParts, ({ one }) => ({
  node: one(assetNodes, { fields: [deviceSpareParts.nodeId], references: [assetNodes.nodeId] }),
}));

export const deviceProtocolConfigRelations = relations(deviceProtocolConfig, ({ one }) => ({
  node: one(assetNodes, { fields: [deviceProtocolConfig.deviceCode], references: [assetNodes.code] }),
}));

export const deviceRuleVersionsRelations = relations(deviceRuleVersions, ({ one }) => ({
  rule: one(diagnosisRules, { fields: [deviceRuleVersions.ruleId], references: [diagnosisRules.ruleId] }),
}));

// ============ 诊断分析关系 ============
export const diagnosisRulesRelations = relations(diagnosisRules, ({ many }) => ({
  tasks: many(diagnosisTasks),
  ruleVersions: many(deviceRuleVersions),
}));

export const diagnosisTasksRelations = relations(diagnosisTasks, ({ one }) => ({
  rule: one(diagnosisRules, { fields: [diagnosisTasks.ruleId], references: [diagnosisRules.ruleId] }),
}));

export const sensorCalibrationsRelations = relations(sensorCalibrations, ({ one }) => ({
  sensor: one(assetSensors, { fields: [sensorCalibrations.sensorId], references: [assetSensors.sensorId] }),
}));

// ============ 数据治理关系 ============
export const dataSlicesRelations = relations(dataSlices, ({ many }) => ({
  labelHistory: many(dataSliceLabelHistory),
}));

export const dataSliceLabelHistoryRelations = relations(dataSliceLabelHistory, ({ one }) => ({
  slice: one(dataSlices, { fields: [dataSliceLabelHistory.sliceId], references: [dataSlices.sliceId] }),
}));

export const dataCleanTasksRelations = relations(dataCleanTasks, ({ many }) => ({
  logs: many(dataCleanLogs),
}));

export const dataCleanLogsRelations = relations(dataCleanLogs, ({ one }) => ({
  task: one(dataCleanTasks, { fields: [dataCleanLogs.taskId], references: [dataCleanTasks.taskId] }),
}));

export const dataGovernanceJobsRelations = relations(dataGovernanceJobs, ({ many }) => ({
  cleanupLogs: many(minioCleanupLog),
}));

export const minioCleanupLogRelations = relations(minioCleanupLog, ({ one }) => ({
  job: one(dataGovernanceJobs, { fields: [minioCleanupLog.jobId], references: [dataGovernanceJobs.id] }),
}));

// ============ 基础配置关系 ============
export const baseDictCategoriesRelations = relations(baseDictCategories, ({ many }) => ({
  items: many(baseDictItems),
}));

export const baseDictItemsRelations = relations(baseDictItems, ({ one }) => ({
  category: one(baseDictCategories, { fields: [baseDictItems.categoryId], references: [baseDictCategories.id] }),
}));

export const baseNodeTemplatesRelations = relations(baseNodeTemplates, ({ many }) => ({
  nodes: many(assetNodes),
}));

// ============ 插件引擎关系 ============
export const pluginRegistryRelations = relations(pluginRegistry, ({ many }) => ({
  instances: many(pluginInstances),
}));

export const pluginInstancesRelations = relations(pluginInstances, ({ one, many }) => ({
  plugin: one(pluginRegistry, { fields: [pluginInstances.pluginId], references: [pluginRegistry.id] }),
  events: many(pluginEvents),
}));

export const pluginEventsRelations = relations(pluginEvents, ({ one }) => ({
  instance: one(pluginInstances, { fields: [pluginEvents.instanceId], references: [pluginInstances.id] }),
}));

// ============ 配置中心关系 ============
export const systemConfigsRelations = relations(systemConfigs, ({ many }) => ({
  changeLogs: many(configChangeLogs),
}));

export const configChangeLogsRelations = relations(configChangeLogs, ({ one }) => ({
  config: one(systemConfigs, { fields: [configChangeLogs.configId], references: [systemConfigs.id] }),
}));

// ============ 系统拓扑关系 ============
export const topoNodesRelations = relations(topoNodes, ({ many }) => ({
  outEdges: many(topoEdges),
}));

export const topoEdgesRelations = relations(topoEdges, ({ one }) => ({
  sourceNode: one(topoNodes, { fields: [topoEdges.sourceNodeId], references: [topoNodes.nodeId] }),
}));
