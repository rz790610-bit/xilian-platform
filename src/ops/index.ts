/**
 * 运维模块索引
 * 导出所有运维相关服务
 */

// 仪表盘服务
export {
  DashboardService,
  dashboardService,
  type ClusterOverviewData,
  type StorageOverviewData,
  type DataFlowOverviewData,
  type ApiGatewayOverviewData,
  type SecurityPostureData,
  type MetricValue,
  type TimeSeriesData,
  type AlertSummary,
  type ServiceStatus,
} from './dashboard/dashboardService';

// 自动化运维服务
export {
  AutoScalingService,
  SelfHealingService,
  BackupRecoveryService,
  RollbackService,
  autoScalingService,
  selfHealingService,
  backupRecoveryService,
  rollbackService,
  type ScalingPolicy,
  type ScalingEvent,
  type SelfHealingRule,
  type HealingEvent,
  type BackupPolicy,
  type BackupJob,
  type RestoreJob,
  type RollbackPolicy,
  type RollbackEvent,
} from './automation/automationService';

// 边缘计算服务
export {
  EdgeInferenceService,
  EdgeGatewayService,
  TSNService,
  edgeInferenceService,
  edgeGatewayService,
  tsnService,
  type EdgeNode,
  type EdgeModel,
  type InferenceRequest,
  type InferenceResult,
  type EdgeGateway,
  type TSNConfig,
  type FiveGConfig,
} from './edge/edgeComputingService';
