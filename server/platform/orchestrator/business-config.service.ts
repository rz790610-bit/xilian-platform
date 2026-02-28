/**
 * BusinessConfigService — 业务配置入口
 *
 * 基于设备编码体系，选择设备类型 → 自动生成三个引擎
 * （Pipeline / KG / DB）的配置，不需要懂技术。
 */

import { createModuleLogger } from '../../core/logger';
import type {
  DeviceTypeDefinition,
  ComponentDefinition,
  ScenarioDefinition,
  GeneratedConfig,
  PipelineConfig,
  KGConfig,
  DatabaseConfig,
  OrchestrationConfig,
} from './business-config.types';

const log = createModuleLogger('business-config');

// ============================================================
// 内置设备类型数据
// ============================================================

const DEVICE_TYPES: DeviceTypeDefinition[] = [
  {
    code: 'PORT.STS',
    name: '岸桥',
    components: [
      { code: 'HOIST.GBX', name: '起升机构', monitoringPoints: ['motor_vibration', 'gearbox_vibration', 'bearing_temperature', 'motor_current'] },
      { code: 'TROLLEY.GBX', name: '小车机构', monitoringPoints: ['motor_vibration', 'gearbox_vibration', 'bearing_temperature'] },
      { code: 'GANTRY.GBX', name: '大车机构', monitoringPoints: ['motor_vibration', 'wheel_vibration', 'bearing_temperature'] },
      { code: 'BOOM.GBX', name: '俯仰机构', monitoringPoints: ['hydraulic_pressure', 'motor_current', 'bearing_vibration'] },
    ],
    availableScenarios: [
      { id: 'bearing_diagnosis', name: '轴承诊断', description: '基于包络谱分析的轴承故障诊断', requiredDataTypes: ['vibration'] },
      { id: 'gearbox_diagnosis', name: '齿轮箱诊断', description: '基于FFT和倒频谱的齿轮箱故障诊断', requiredDataTypes: ['vibration'] },
      { id: 'motor_diagnosis', name: '电机诊断', description: '基于电流信号分析的电机故障诊断', requiredDataTypes: ['current', 'vibration'] },
      { id: 'general_monitoring', name: '通用监控', description: '设备整体健康状态监控与趋势分析', requiredDataTypes: ['vibration', 'temperature'] },
      { id: 'anomaly_detection', name: '异常检测', description: '基于统计方法和机器学习的异常检测', requiredDataTypes: ['vibration', 'temperature', 'current'] },
      { id: 'fatigue_assessment', name: '疲劳评估', description: '结构疲劳寿命评估与预测', requiredDataTypes: ['strain', 'vibration'] },
    ],
  },
  {
    code: 'PORT.RTG',
    name: '场桥',
    components: [
      { code: 'GANTRY.GBX', name: '行走机构', monitoringPoints: ['motor_vibration', 'wheel_vibration', 'bearing_temperature'] },
      { code: 'HOIST.GBX', name: '起升机构', monitoringPoints: ['motor_vibration', 'gearbox_vibration', 'bearing_temperature', 'motor_current'] },
      { code: 'TROLLEY.GBX', name: '小车机构', monitoringPoints: ['motor_vibration', 'gearbox_vibration', 'bearing_temperature'] },
    ],
    availableScenarios: [
      { id: 'bearing_diagnosis', name: '轴承诊断', description: '基于包络谱分析的轴承故障诊断', requiredDataTypes: ['vibration'] },
      { id: 'gearbox_diagnosis', name: '齿轮箱诊断', description: '基于FFT和倒频谱的齿轮箱故障诊断', requiredDataTypes: ['vibration'] },
      { id: 'general_monitoring', name: '通用监控', description: '设备整体健康状态监控与趋势分析', requiredDataTypes: ['vibration', 'temperature'] },
    ],
  },
  {
    code: 'PORT.FORKLIFT',
    name: '叉车',
    components: [
      { code: 'DRIVE.GBX', name: '传动系统', monitoringPoints: ['motor_vibration', 'gearbox_vibration', 'motor_current'] },
      { code: 'HYDRAULIC', name: '液压系统', monitoringPoints: ['hydraulic_pressure', 'oil_temperature', 'flow_rate'] },
    ],
    availableScenarios: [
      { id: 'general_monitoring', name: '通用监控', description: '设备整体健康状态监控与趋势分析', requiredDataTypes: ['vibration', 'temperature'] },
      { id: 'anomaly_detection', name: '异常检测', description: '基于统计方法和机器学习的异常检测', requiredDataTypes: ['vibration', 'temperature', 'pressure'] },
    ],
  },
  {
    code: 'PORT.STACKER',
    name: '堆高机',
    components: [
      { code: 'HOIST.GBX', name: '起升机构', monitoringPoints: ['motor_vibration', 'gearbox_vibration', 'bearing_temperature'] },
      { code: 'GANTRY.GBX', name: '行走机构', monitoringPoints: ['motor_vibration', 'wheel_vibration', 'bearing_temperature'] },
    ],
    availableScenarios: [
      { id: 'general_monitoring', name: '通用监控', description: '设备整体健康状态监控与趋势分析', requiredDataTypes: ['vibration', 'temperature'] },
      { id: 'anomaly_detection', name: '异常检测', description: '基于统计方法和机器学习的异常检测', requiredDataTypes: ['vibration', 'temperature'] },
    ],
  },
];

// ============================================================
// 场景 → 算法映射
// ============================================================

const SCENARIO_ALGORITHM_MAP: Record<string, string[]> = {
  bearing_diagnosis: ['envelope_spectrum', 'kurtosis', 'crest_factor', 'bearing_defect_frequency'],
  gearbox_diagnosis: ['fft', 'cepstrum', 'order_tracking', 'sideband_analysis'],
  motor_diagnosis: ['current_spectrum', 'park_vector', 'instantaneous_power'],
  general_monitoring: ['rms_trend', 'peak_trend', 'temperature_trend', 'threshold_check'],
  anomaly_detection: ['statistical_anomaly', 'isolation_forest', 'autoencoder_anomaly'],
  fatigue_assessment: ['rainflow_counting', 'sn_curve', 'miner_rule', 'stress_concentration'],
};

// ============================================================
// 场景 → KG 故障类型映射
// ============================================================

const SCENARIO_FAULT_TYPES: Record<string, string[]> = {
  bearing_diagnosis: ['BPFO', 'BPFI', 'BSF', 'FTF', 'bearing_wear', 'bearing_fatigue'],
  gearbox_diagnosis: ['gear_tooth_crack', 'gear_pitting', 'gear_wear', 'shaft_misalignment'],
  motor_diagnosis: ['rotor_bar_fault', 'stator_winding', 'eccentricity', 'demagnetization'],
  general_monitoring: ['overheating', 'overload', 'abnormal_vibration'],
  anomaly_detection: ['sudden_change', 'drift', 'periodic_anomaly'],
  fatigue_assessment: ['fatigue_crack', 'stress_corrosion', 'structural_deformation'],
};

// ============================================================
// 场景 → 编排模板映射
// ============================================================

const SCENARIO_ORCHESTRATION: Record<string, { phases: { engine: string; action: string }[]; timeout: number }> = {
  bearing_diagnosis: {
    phases: [
      { engine: 'kg', action: 'query_fault_patterns' },
      { engine: 'pipeline', action: 'feature_extraction' },
      { engine: 'pipeline', action: 'diagnosis_inference' },
      { engine: 'database', action: 'store_result' },
    ],
    timeout: 30_000,
  },
  gearbox_diagnosis: {
    phases: [
      { engine: 'kg', action: 'query_gearbox_params' },
      { engine: 'pipeline', action: 'fft_cepstrum' },
      { engine: 'pipeline', action: 'fusion_diagnosis' },
      { engine: 'database', action: 'store_result' },
    ],
    timeout: 30_000,
  },
  motor_diagnosis: {
    phases: [
      { engine: 'kg', action: 'query_motor_specs' },
      { engine: 'pipeline', action: 'current_analysis' },
      { engine: 'pipeline', action: 'diagnosis_inference' },
      { engine: 'database', action: 'store_result' },
    ],
    timeout: 30_000,
  },
  general_monitoring: {
    phases: [
      { engine: 'database', action: 'query_history' },
      { engine: 'pipeline', action: 'trend_analysis' },
      { engine: 'kg', action: 'update_device_status' },
    ],
    timeout: 20_000,
  },
  anomaly_detection: {
    phases: [
      { engine: 'pipeline', action: 'anomaly_detection' },
      { engine: 'kg', action: 'correlate_anomaly' },
      { engine: 'database', action: 'write_alert' },
    ],
    timeout: 20_000,
  },
  fatigue_assessment: {
    phases: [
      { engine: 'database', action: 'query_load_history' },
      { engine: 'pipeline', action: 'fatigue_analysis' },
      { engine: 'kg', action: 'update_fatigue_model' },
      { engine: 'database', action: 'store_result' },
    ],
    timeout: 60_000,
  },
};

// ============================================================
// BusinessConfigService 核心类
// ============================================================

export class BusinessConfigService {
  /** 获取所有支持的设备类型 */
  getDeviceTypes(): DeviceTypeDefinition[] {
    return DEVICE_TYPES;
  }

  /** 获取设备类型的可用场景 */
  getScenariosForDevice(deviceTypeCode: string): ScenarioDefinition[] {
    const device = DEVICE_TYPES.find(d => d.code === deviceTypeCode);
    if (!device) {
      log.warn({ deviceTypeCode }, 'Unknown device type');
      return [];
    }
    return device.availableScenarios;
  }

  /** 核心：根据设备类型+场景生成配置 */
  generateConfig(
    deviceType: string,
    scenario: string,
    options?: Record<string, unknown>,
  ): GeneratedConfig {
    log.info({ deviceType, scenario }, 'Generating config');

    const algorithms = this.resolveAlgorithms(deviceType, scenario);
    const pipelineConfig = this.buildPipelineConfig(algorithms, scenario);
    const kgConfig = this.buildKGConfig(deviceType, scenario);
    const databaseConfig = this.buildDatabaseConfig(deviceType);
    const orchestrationConfig = this.buildOrchestrationConfig(scenario);

    return {
      deviceType,
      scenario,
      pipeline: pipelineConfig,
      kg: kgConfig,
      database: databaseConfig,
      orchestration: orchestrationConfig,
    };
  }

  // ----------------------------------------------------------
  // 内部方法
  // ----------------------------------------------------------

  private resolveAlgorithms(deviceType: string, scenario: string): string[] {
    return SCENARIO_ALGORITHM_MAP[scenario] ?? ['rms_trend', 'threshold_check'];
  }

  private buildPipelineConfig(algorithms: string[], scenario: string): PipelineConfig {
    const nodes = algorithms.map(alg => ({
      algorithmId: alg,
      params: {} as Record<string, unknown>,
    }));

    return {
      templateId: `tpl_${scenario}`,
      nodes,
      executionOrder: algorithms,
    };
  }

  private buildKGConfig(deviceType: string, scenario: string): KGConfig {
    const faultTypes = SCENARIO_FAULT_TYPES[scenario] ?? [];

    return {
      queryPatterns: [
        `MATCH (d:Device {type: '${deviceType}'})-[:HAS_COMPONENT]->(c)-[:HAS_FAULT]->(f) RETURN f`,
        `MATCH (f:Fault)-[:DIAGNOSED_BY]->(a:Algorithm) WHERE f.type IN $faultTypes RETURN a`,
      ],
      updateRules: [
        `MERGE (d:Device {id: $machineId}) SET d.lastDiagnosis = datetime()`,
      ],
      relatedFaultTypes: faultTypes,
    };
  }

  private buildDatabaseConfig(deviceType: string): DatabaseConfig {
    return {
      tables: [
        'realtime_data',
        'vibration_agg_hourly',
        'diagnosis_results',
        'alert_event_logs',
        'device_daily_summary',
      ],
      retentionDays: 365,
      aggregationRules: [
        'hourly_rms_avg',
        'hourly_peak_max',
        'daily_summary',
      ],
    };
  }

  private buildOrchestrationConfig(scenario: string): OrchestrationConfig {
    const orch = SCENARIO_ORCHESTRATION[scenario] ?? {
      phases: [{ engine: 'pipeline', action: 'default' }],
      timeout: 30_000,
    };

    return {
      scenarioTemplate: scenario,
      phases: orch.phases,
      timeout: orch.timeout,
    };
  }
}
