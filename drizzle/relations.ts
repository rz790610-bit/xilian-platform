import { relations } from "drizzle-orm";
import {
  users,
  // 知识库
  kbCollections, kbPoints, kbDocuments, kbChunks, kbEmbeddings,
  kbConversations, kbConversationMessages, kbQaPairs,
  // 知识图谱
  kgNodes, kgEdges, kgGraphs, kgGraphNodes, kgGraphEdges,
  kgDiagnosisRuns, kgDiagnosisPaths, kgEvolutionLog,
  // AI 模型
  models, modelFineTuneTasks, modelEvaluations, modelUsageLogs,
  modelConversations, modelMessages, modelDeployments, modelInferenceLogs,
  modelTrainingJobs, modelRegistry,
  // 算法域
  algorithmDefinitions, algorithmCompositions, algorithmDeviceBindings,
  algorithmExecutions, algorithmRoutingRules,
  // 诊断
  diagnosisRules, diagnosisTasks, diagnosisResults, anomalyDetections, anomalyModels,
  sensorCalibrations,
  // 设备运维
  deviceAlerts, deviceMaintenanceRecords, deviceKpis, deviceOperationLogs,
  deviceSamplingConfig, deviceSpareParts, deviceProtocolConfig, deviceRuleVersions,
  deviceDailySummary, deviceMaintenanceLogs, deviceStatusLog, deviceFirmwareVersions,
  edgeGateways, edgeGatewayConfig,
  // 基础配置
  baseNodeTemplates, baseMpTemplates, baseDictCategories, baseDictItems,
  baseLabelDimensions, baseLabelOptions,
  // 资产管理
  assetNodes, assetMeasurementPoints, assetSensors, sensorMpMapping,
  // 数据域
  dataSlices, dataSliceLabelHistory, dataCleanTasks, dataCleanLogs,
  dataQualityReports, dataGovernanceJobs, dataLineage,
  dataAssets, dataBindings, dataCleanResults, dataCollectionTasks,
  dataConnectors, dataEndpoints, dataExportTasks, dataLifecyclePolicies,
  dataCollectionMetrics,
  // 实时数据
  realtimeDataLatest, realtimeTelemetry, vibration1hourAgg,
  // 消息与任务
  eventLogs, eventStore, eventSnapshots, messageQueueLog, asyncTaskLog,
  // 插件引擎
  pluginRegistry, pluginInstances, pluginEvents,
  // 配置中心
  systemConfigs, configChangeLogs,
  // 运营管理
  alertRules, alertEventLog, auditLogs, auditLogsSensitive,
  // 调度管理
  scheduledTasks, rollbackTriggers, rollbackExecutions,
  // Saga
  sagaInstances, sagaSteps, sagaDeadLetters,
  // Outbox
  outboxEvents, outboxRoutingConfig, processedEvents,
  // Pipeline
  pipelines, pipelineRuns, pipelineNodeMetrics,
  // 系统拓扑
  topoNodes, topoEdges, topoLayouts, topoLayers, topoAlerts, topoSnapshots,
  systemCapacityMetrics,
  // MinIO
  minioFileMetadata, minioUploadLogs,
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
  cleanTasks: many(dataCleanTasks),
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

// ============================================================
// 补全 relations — 覆盖剩余 69 张表的外键关系
// 生成规则：基于字段命名约定 + 注释中的引用关系
// ============================================================

// ============ 告警域 ============
export const alertEventLogRelations = relations(alertEventLog, ({ one }) => ({
  rule: one(alertRules, { fields: [alertEventLog.ruleId], references: [alertRules.id] }),
  device: one(assetNodes, { fields: [alertEventLog.deviceCode], references: [assetNodes.code] }),
}));

// ============ 算法域 ============
export const algorithmDeviceBindingsRelations = relations(algorithmDeviceBindings, ({ one, many }) => ({
  device: one(assetNodes, { fields: [algorithmDeviceBindings.deviceCode], references: [assetNodes.code] }),
  sensor: one(assetSensors, { fields: [algorithmDeviceBindings.sensorCode], references: [assetSensors.sensorId] }),
  algorithm: one(algorithmDefinitions, { fields: [algorithmDeviceBindings.algoCode], references: [algorithmDefinitions.algoCode] }),
  routingRules: many(algorithmRoutingRules),
  executions: many(algorithmExecutions),
}));

export const algorithmExecutionsRelations = relations(algorithmExecutions, ({ one }) => ({
  binding: one(algorithmDeviceBindings, { fields: [algorithmExecutions.bindingId], references: [algorithmDeviceBindings.id] }),
  algorithm: one(algorithmDefinitions, { fields: [algorithmExecutions.algoCode], references: [algorithmDefinitions.algoCode] }),
  device: one(assetNodes, { fields: [algorithmExecutions.deviceCode], references: [assetNodes.code] }),
}));

export const algorithmRoutingRulesRelations = relations(algorithmRoutingRules, ({ one }) => ({
  binding: one(algorithmDeviceBindings, { fields: [algorithmRoutingRules.bindingId], references: [algorithmDeviceBindings.id] }),
}));

export const algorithmDefinitionsRelations = relations(algorithmDefinitions, ({ many }) => ({
  bindings: many(algorithmDeviceBindings),
  executions: many(algorithmExecutions),
}));

export const algorithmCompositionsRelations = relations(algorithmCompositions, ({ many }) => ({
  // 组合编排引用的算法通过 JSON steps 字段关联，非外键
}));

// ============ 审计域 ============
export const auditLogsRelations = relations(auditLogs, ({ many }) => ({
  sensitiveRecords: many(auditLogsSensitive),
}));

export const auditLogsSensitiveRelations = relations(auditLogsSensitive, ({ one }) => ({
  auditLog: one(auditLogs, { fields: [auditLogsSensitive.auditLogId], references: [auditLogs.id] }),
}));

// ============ 知识库补全 ============
export const kbChunksRelations = relations(kbChunks, ({ one, many }) => ({
  document: one(kbDocuments, { fields: [kbChunks.documentId], references: [kbDocuments.id] }),
  embeddings: many(kbEmbeddings),
}));

export const kbEmbeddingsRelations = relations(kbEmbeddings, ({ one }) => ({
  chunk: one(kbChunks, { fields: [kbEmbeddings.chunkId], references: [kbChunks.id] }),
}));

export const kbConversationsRelations = relations(kbConversations, ({ one, many }) => ({
  collection: one(kbCollections, { fields: [kbConversations.collectionId], references: [kbCollections.id] }),
  user: one(users, { fields: [kbConversations.userId], references: [users.id] }),
  messages: many(kbConversationMessages),
}));

export const kbConversationMessagesRelations = relations(kbConversationMessages, ({ one }) => ({
  conversation: one(kbConversations, { fields: [kbConversationMessages.conversationId], references: [kbConversations.id] }),
}));

export const kbQaPairsRelations = relations(kbQaPairs, ({ one }) => ({
  collection: one(kbCollections, { fields: [kbQaPairs.collectionId], references: [kbCollections.id] }),
  sourceDocument: one(kbDocuments, { fields: [kbQaPairs.sourceDocumentId], references: [kbDocuments.id] }),
}));

// ============ 知识图谱补全 ============
export const kgGraphsRelations = relations(kgGraphs, ({ many }) => ({
  nodes: many(kgGraphNodes),
  edges: many(kgGraphEdges),
  diagnosisRuns: many(kgDiagnosisRuns),
  evolutionLogs: many(kgEvolutionLog),
}));

export const kgGraphNodesRelations = relations(kgGraphNodes, ({ one }) => ({
  graph: one(kgGraphs, { fields: [kgGraphNodes.graphId], references: [kgGraphs.graphId] }),
}));

export const kgGraphEdgesRelations = relations(kgGraphEdges, ({ one }) => ({
  graph: one(kgGraphs, { fields: [kgGraphEdges.graphId], references: [kgGraphs.graphId] }),
}));

export const kgDiagnosisRunsRelations = relations(kgDiagnosisRuns, ({ one, many }) => ({
  graph: one(kgGraphs, { fields: [kgDiagnosisRuns.graphId], references: [kgGraphs.graphId] }),
  paths: many(kgDiagnosisPaths),
}));

export const kgDiagnosisPathsRelations = relations(kgDiagnosisPaths, ({ one }) => ({
  run: one(kgDiagnosisRuns, { fields: [kgDiagnosisPaths.runId], references: [kgDiagnosisRuns.runId] }),
  graph: one(kgGraphs, { fields: [kgDiagnosisPaths.graphId], references: [kgGraphs.graphId] }),
}));

export const kgEvolutionLogRelations = relations(kgEvolutionLog, ({ one }) => ({
  graph: one(kgGraphs, { fields: [kgEvolutionLog.graphId], references: [kgGraphs.graphId] }),
}));

export const kgEdgesRelations = relations(kgEdges, ({ one }) => ({
  collection: one(kbCollections, { fields: [kgEdges.collectionId], references: [kbCollections.id] }),
}));

export const kgNodesRelations = relations(kgNodes, ({ one }) => ({
  collection: one(kbCollections, { fields: [kgNodes.collectionId], references: [kbCollections.id] }),
}));

// ============ 模型域补全 ============
export const modelDeploymentsRelations = relations(modelDeployments, ({ one, many }) => ({
  model: one(models, { fields: [modelDeployments.modelId], references: [models.id] }),
  inferenceLogs: many(modelInferenceLogs),
}));

export const modelInferenceLogsRelations = relations(modelInferenceLogs, ({ one }) => ({
  deployment: one(modelDeployments, { fields: [modelInferenceLogs.deploymentId], references: [modelDeployments.id] }),
}));

export const modelTrainingJobsRelations = relations(modelTrainingJobs, ({ one }) => ({
  model: one(models, { fields: [modelTrainingJobs.modelId], references: [models.id] }),
}));

// ============ 设备域补全 ============
export const deviceDailySummaryRelations = relations(deviceDailySummary, ({ one }) => ({
  device: one(assetNodes, { fields: [deviceDailySummary.deviceCode], references: [assetNodes.code] }),
}));

export const deviceMaintenanceLogsRelations = relations(deviceMaintenanceLogs, ({ one }) => ({
  device: one(assetNodes, { fields: [deviceMaintenanceLogs.deviceCode], references: [assetNodes.code] }),
}));

export const deviceStatusLogRelations = relations(deviceStatusLog, ({ one }) => ({
  device: one(assetNodes, { fields: [deviceStatusLog.deviceCode], references: [assetNodes.code] }),
}));

export const diagnosisResultsRelations = relations(diagnosisResults, ({ one }) => ({
  device: one(assetNodes, { fields: [diagnosisResults.deviceCode], references: [assetNodes.code] }),
}));

export const anomalyDetectionsRelations = relations(anomalyDetections, ({ one }) => ({
  sensor: one(assetSensors, { fields: [anomalyDetections.sensorId], references: [assetSensors.sensorId] }),
}));

export const eventLogsRelations = relations(eventLogs, ({ one }) => ({
  sensor: one(assetSensors, { fields: [eventLogs.sensorId], references: [assetSensors.sensorId] }),
}));

// ============ 数据域补全 ============
export const dataEndpointsRelations = relations(dataEndpoints, ({ one, many }) => ({
  connector: one(dataConnectors, { fields: [dataEndpoints.connectorId], references: [dataConnectors.connectorId] }),
  sensor: one(assetSensors, { fields: [dataEndpoints.sensorId], references: [assetSensors.sensorId] }),
  bindings: many(dataBindings),
}));

export const dataBindingsRelations = relations(dataBindings, ({ one }) => ({
  endpoint: one(dataEndpoints, { fields: [dataBindings.endpointId], references: [dataEndpoints.endpointId] }),
}));

export const dataQualityReportsRelations = relations(dataQualityReports, ({ one }) => ({
  device: one(assetNodes, { fields: [dataQualityReports.deviceCode], references: [assetNodes.code] }),
  sensor: one(assetSensors, { fields: [dataQualityReports.sensorId], references: [assetSensors.sensorId] }),
}));

export const dataCollectionTasksRelations = relations(dataCollectionTasks, ({ many }) => ({
  metrics: many(dataCollectionMetrics),
}));

// ============ 实时数据域 ============
export const realtimeDataLatestRelations = relations(realtimeDataLatest, ({ one }) => ({
  device: one(assetNodes, { fields: [realtimeDataLatest.deviceCode], references: [assetNodes.code] }),
  measurementPoint: one(assetMeasurementPoints, { fields: [realtimeDataLatest.mpCode], references: [assetMeasurementPoints.mpCode] }),
}));

export const realtimeTelemetryRelations = relations(realtimeTelemetry, ({ one }) => ({
  device: one(assetNodes, { fields: [realtimeTelemetry.deviceCode], references: [assetNodes.code] }),
  measurementPoint: one(assetMeasurementPoints, { fields: [realtimeTelemetry.mpCode], references: [assetMeasurementPoints.mpCode] }),
}));

export const vibration1hourAggRelations = relations(vibration1hourAgg, ({ one }) => ({
  device: one(assetNodes, { fields: [vibration1hourAgg.deviceCode], references: [assetNodes.code] }),
  measurementPoint: one(assetMeasurementPoints, { fields: [vibration1hourAgg.mpCode], references: [assetMeasurementPoints.mpCode] }),
}));

// ============ Pipeline 域 ============
export const pipelinesRelations = relations(pipelines, ({ many }) => ({
  runs: many(pipelineRuns),
}));

export const pipelineRunsRelations = relations(pipelineRuns, ({ one, many }) => ({
  pipeline: one(pipelines, { fields: [pipelineRuns.pipelineId], references: [pipelines.pipelineId] }),
  nodeMetrics: many(pipelineNodeMetrics),
}));

export const pipelineNodeMetricsRelations = relations(pipelineNodeMetrics, ({ one }) => ({
  run: one(pipelineRuns, { fields: [pipelineNodeMetrics.runId], references: [pipelineRuns.runId] }),
  pipeline: one(pipelines, { fields: [pipelineNodeMetrics.pipelineId], references: [pipelines.pipelineId] }),
}));

// ============ Saga 域 ============
export const sagaInstancesRelations = relations(sagaInstances, ({ many }) => ({
  steps: many(sagaSteps),
  deadLetters: many(sagaDeadLetters),
}));

export const sagaStepsRelations = relations(sagaSteps, ({ one }) => ({
  saga: one(sagaInstances, { fields: [sagaSteps.sagaId], references: [sagaInstances.sagaId] }),
}));

export const sagaDeadLettersRelations = relations(sagaDeadLetters, ({ one }) => ({
  saga: one(sagaInstances, { fields: [sagaDeadLetters.sagaId], references: [sagaInstances.sagaId] }),
}));

// ============ Rollback 域 ============
export const rollbackExecutionsRelations = relations(rollbackExecutions, ({ one }) => ({
  saga: one(sagaInstances, { fields: [rollbackExecutions.sagaId], references: [sagaInstances.sagaId] }),
  trigger: one(rollbackTriggers, { fields: [rollbackExecutions.triggerId], references: [rollbackTriggers.id] }),
}));

// ============ 拓扑补全 ============
export const topoLayoutsRelations = relations(topoLayouts, ({ one }) => ({
  user: one(users, { fields: [topoLayouts.userId], references: [users.id] }),
}));

export const topoAlertsRelations = relations(topoAlerts, ({ one }) => ({
  node: one(topoNodes, { fields: [topoAlerts.nodeId], references: [topoNodes.nodeId] }),
}));

// ============ 基础配置补全 ============
export const baseLabelOptionsRelations = relations(baseLabelOptions, ({ one }) => ({
  dimension: one(baseLabelDimensions, { fields: [baseLabelOptions.dimensionCode], references: [baseLabelDimensions.id] }),
}));

// ============ 边缘网关 ============
export const edgeGatewaysRelations = relations(edgeGateways, ({ many }) => ({
  configs: many(edgeGatewayConfig),
  collectionTasks: many(dataCollectionTasks),
}));
