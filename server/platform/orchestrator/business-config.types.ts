/**
 * 业务配置入口类型定义
 * 基于设备编码体系，选择设备类型 → 自动生成三引擎配置
 */

/** 设备类型定义 */
export interface DeviceTypeDefinition {
  code: string;
  name: string;
  components: ComponentDefinition[];
  availableScenarios: ScenarioDefinition[];
}

/** 部件定义 */
export interface ComponentDefinition {
  code: string;
  name: string;
  monitoringPoints: string[];
}

/** 场景定义 */
export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  requiredDataTypes: string[];
}

/** 生成的配置 */
export interface GeneratedConfig {
  deviceType: string;
  scenario: string;
  pipeline: PipelineConfig;
  kg: KGConfig;
  database: DatabaseConfig;
  orchestration: OrchestrationConfig;
}

/** Pipeline 配置 */
export interface PipelineConfig {
  templateId: string;
  nodes: { algorithmId: string; params: Record<string, unknown> }[];
  executionOrder: string[];
}

/** KG 配置 */
export interface KGConfig {
  queryPatterns: string[];
  updateRules: string[];
  relatedFaultTypes: string[];
}

/** Database 配置 */
export interface DatabaseConfig {
  tables: string[];
  retentionDays: number;
  aggregationRules: string[];
}

/** Orchestration 配置 */
export interface OrchestrationConfig {
  scenarioTemplate: string;
  phases: { engine: string; action: string }[];
  timeout: number;
}
