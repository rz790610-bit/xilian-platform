/**
 * 设备依赖接口 — 算法执行所需的外部依赖标准化接口
 * 
 * 所有算法通过依赖注入获取设备参数、轴承数据、工况信息等
 * 预留完整接口，运行时可注入真实实现或 Mock 实现
 */

import type { BearingGeometry } from './dsp';

// ============================================================
// 1. 设备参数提供者
// ============================================================

export interface EquipmentInfo {
  /** 设备ID */
  equipmentId: string;
  /** 设备名称 */
  name: string;
  /** 设备类型 (motor/pump/compressor/turbine/gearbox/bearing/transformer/vfd) */
  type: string;
  /** 额定功率 (kW) */
  ratedPower?: number;
  /** 额定转速 (RPM) */
  ratedRPM?: number;
  /** 额定电压 (V) */
  ratedVoltage?: number;
  /** 额定电流 (A) */
  ratedCurrent?: number;
  /** 额定频率 (Hz) */
  ratedFrequency?: number;
  /** 极对数 */
  poleCount?: number;
  /** 齿轮参数 */
  gearParams?: GearParameters;
  /** 轴承型号列表 */
  bearingModels?: string[];
  /** 安装类型 (rigid/flexible) */
  mountType?: 'rigid' | 'flexible';
  /** 机器组别 (ISO 10816) */
  machineGroup?: 'group1' | 'group2' | 'group3' | 'group4';
  /** 自定义属性 */
  metadata?: Record<string, unknown>;
}

export interface GearParameters {
  /** 各级齿轮齿数 */
  teethCounts: number[];
  /** 各级传动比 */
  ratios: number[];
  /** 啮合频率 (Hz) — 可由齿数×转频计算 */
  meshFrequencies?: number[];
}

export interface IEquipmentProvider {
  /** 获取设备信息 */
  getEquipment(equipmentId: string): Promise<EquipmentInfo | null>;
  /** 获取设备当前运行参数 */
  getRunningParams(equipmentId: string): Promise<RunningParameters>;
  /** 获取设备关联的传感器列表 */
  getSensors(equipmentId: string): Promise<SensorInfo[]>;
}

export interface RunningParameters {
  /** 当前转速 (RPM) */
  currentRPM?: number;
  /** 当前负载 (%) */
  loadPercentage?: number;
  /** 当前温度 (°C) */
  temperature?: number;
  /** 当前电流 (A) */
  current?: number;
  /** 当前电压 (V) */
  voltage?: number;
  /** 运行状态 */
  status: 'running' | 'idle' | 'starting' | 'stopping' | 'fault';
  /** 时间戳 */
  timestamp: Date;
}

export interface SensorInfo {
  /** 传感器ID */
  sensorId: string;
  /** 传感器类型 */
  type: 'vibration' | 'temperature' | 'current' | 'voltage' | 'pressure' | 'flow' | 'acoustic' | 'strain';
  /** 测量方向 */
  direction?: 'axial' | 'radial_h' | 'radial_v';
  /** 安装位置描述 */
  location: string;
  /** 采样率 (Hz) */
  sampleRate: number;
  /** 灵敏度 */
  sensitivity?: number;
  /** 单位 */
  unit: string;
  /** 传感器坐标 (用于空间分析) */
  coordinates?: { x: number; y: number; z: number };
}

// ============================================================
// 2. 轴承参数库
// ============================================================

export interface BearingInfo extends BearingGeometry {
  /** 轴承型号 */
  model: string;
  /** 制造商 */
  manufacturer?: string;
  /** 内径 (mm) */
  innerDiameter: number;
  /** 外径 (mm) */
  outerDiameter: number;
  /** 宽度 (mm) */
  width: number;
  /** 基本额定动载荷 (kN) */
  dynamicLoadRating?: number;
  /** 基本额定静载荷 (kN) */
  staticLoadRating?: number;
  /** 极限转速 (RPM) */
  limitingSpeed?: number;
}

export interface IBearingDatabase {
  /** 根据型号查询轴承参数 */
  getBearing(model: string): Promise<BearingInfo | null>;
  /** 搜索轴承 */
  searchBearings(query: { manufacturer?: string; innerDiameter?: number }): Promise<BearingInfo[]>;
}

// ============================================================
// 3. 工况归一化接口
// ============================================================

export interface OperatingCondition {
  /** 时间戳 */
  timestamp: Date;
  /** 转速 (RPM) */
  rpm?: number;
  /** 负载 (%) */
  load?: number;
  /** 环境温度 (°C) */
  ambientTemp?: number;
  /** 介质温度 (°C) */
  mediaTemp?: number;
  /** 流量 (m³/h) */
  flowRate?: number;
  /** 压力 (MPa) */
  pressure?: number;
  /** 自定义工况参数 */
  custom?: Record<string, number>;
}

export interface NormalizationModel {
  /** 模型类型 */
  type: 'linear' | 'polynomial' | 'multivariate';
  /** 基准工况 */
  referenceCondition: OperatingCondition;
  /** 模型系数 */
  coefficients: Record<string, number[]>;
  /** 模型拟合度 R² */
  rSquared?: number;
}

export interface IConditionNormalizer {
  /** 获取当前工况 */
  getCurrentCondition(equipmentId: string): Promise<OperatingCondition>;
  /** 获取归一化模型 */
  getNormalizationModel(equipmentId: string, measurementType: string): Promise<NormalizationModel | null>;
  /** 归一化测量值 */
  normalize(value: number, condition: OperatingCondition, model: NormalizationModel): number;
}

// ============================================================
// 4. 材料参数库
// ============================================================

export interface MaterialInfo {
  /** 材料牌号 */
  grade: string;
  /** 材料类型 */
  type: 'steel' | 'aluminum' | 'copper' | 'composite' | 'other';
  /** 弹性模量 (GPa) */
  elasticModulus: number;
  /** 泊松比 */
  poissonRatio: number;
  /** 密度 (kg/m³) */
  density: number;
  /** 屈服强度 (MPa) */
  yieldStrength: number;
  /** 抗拉强度 (MPa) */
  tensileStrength: number;
  /** 疲劳极限 (MPa) */
  fatigueLimit?: number;
  /** S-N曲线参数 (N = C / S^m) */
  snCurve?: { C: number; m: number; N_knee?: number };
  /** 热膨胀系数 (1/°C) */
  thermalExpansion?: number;
  /** 声速 (m/s) */
  soundVelocity?: number;
}

export interface IMaterialDatabase {
  /** 根据牌号查询材料 */
  getMaterial(grade: string): Promise<MaterialInfo | null>;
  /** 获取S-N曲线数据点 */
  getSNCurve(grade: string): Promise<{ stress: number[]; cycles: number[] } | null>;
}

// ============================================================
// 5. 历史数据提供者
// ============================================================

export interface TimeSeriesData {
  /** 时间戳数组 */
  timestamps: Date[];
  /** 数值数组 */
  values: number[];
  /** 单位 */
  unit: string;
  /** 采样率 (Hz) — 等间隔数据 */
  sampleRate?: number;
}

export interface HistoryQuery {
  /** 设备ID */
  equipmentId: string;
  /** 传感器ID */
  sensorId?: string;
  /** 测量类型 */
  measurementType: string;
  /** 开始时间 */
  startTime: Date;
  /** 结束时间 */
  endTime: Date;
  /** 聚合间隔 (秒) — 0 表示原始数据 */
  aggregateInterval?: number;
  /** 聚合方式 */
  aggregateFunction?: 'mean' | 'max' | 'min' | 'rms' | 'std';
}

export interface IHistoryDataProvider {
  /** 查询时序数据 */
  queryTimeSeries(query: HistoryQuery): Promise<TimeSeriesData>;
  /** 查询特征趋势 */
  queryFeatureTrend(equipmentId: string, featureName: string, days: number): Promise<TimeSeriesData>;
  /** 获取基线数据 (正常运行状态) */
  getBaselineData(equipmentId: string, measurementType: string): Promise<TimeSeriesData | null>;
}

// ============================================================
// 6. 案例库接口
// ============================================================

export interface FaultCase {
  /** 案例ID */
  caseId: string;
  /** 设备类型 */
  equipmentType: string;
  /** 故障类型 */
  faultType: string;
  /** 故障描述 */
  description: string;
  /** 特征向量 */
  featureVector: number[];
  /** 特征名称 */
  featureNames: string[];
  /** 诊断结论 */
  conclusion: string;
  /** 维修建议 */
  recommendation: string;
  /** 严重程度 (1-5) */
  severity: number;
  /** 来源 */
  source: string;
}

export interface ICaseDatabase {
  /** 搜索相似案例 */
  searchSimilar(featureVector: number[], topK: number): Promise<Array<FaultCase & { similarity: number }>>;
  /** 按故障类型查询 */
  queryByFaultType(faultType: string): Promise<FaultCase[]>;
  /** 添加新案例 */
  addCase(faultCase: Omit<FaultCase, 'caseId'>): Promise<string>;
}

// ============================================================
// 7. 模型仓库接口
// ============================================================

export interface ModelInfo {
  /** 模型ID */
  modelId: string;
  /** 模型名称 */
  name: string;
  /** 模型类型 */
  type: 'lstm' | 'autoencoder' | 'cnn' | 'transformer' | 'ensemble';
  /** 版本 */
  version: string;
  /** 输入维度 */
  inputDim: number;
  /** 输出维度 */
  outputDim: number;
  /** 模型权重 (序列化) */
  weights?: ArrayBuffer;
  /** 模型元数据 */
  metadata?: Record<string, unknown>;
  /** 训练指标 */
  metrics?: { accuracy?: number; loss?: number; f1?: number };
}

export interface IModelRepository {
  /** 获取模型 */
  getModel(modelId: string): Promise<ModelInfo | null>;
  /** 获取最新模型 */
  getLatestModel(name: string): Promise<ModelInfo | null>;
  /** 保存模型 */
  saveModel(model: Omit<ModelInfo, 'modelId'>): Promise<string>;
  /** 列出模型版本 */
  listVersions(name: string): Promise<ModelInfo[]>;
}

// ============================================================
// 8. LLM 接口
// ============================================================

export interface ILLMProvider {
  /** 文本生成 */
  generate(prompt: string, options?: { temperature?: number; maxTokens?: number }): Promise<string>;
  /** 结构化输出 */
  generateStructured<T>(prompt: string, schema: Record<string, unknown>): Promise<T>;
}

// ============================================================
// 9. 依赖容器
// ============================================================

export interface AlgorithmDependencies {
  equipment?: IEquipmentProvider;
  bearing?: IBearingDatabase;
  condition?: IConditionNormalizer;
  material?: IMaterialDatabase;
  history?: IHistoryDataProvider;
  cases?: ICaseDatabase;
  models?: IModelRepository;
  llm?: ILLMProvider;
}

/**
 * 默认 Mock 实现 — 当真实依赖未注入时使用
 * 返回合理的默认值，确保算法可以独立运行
 */
export class DefaultDependencies implements AlgorithmDependencies {
  equipment: IEquipmentProvider = {
    async getEquipment() { return null; },
    async getRunningParams() {
      return { status: 'running' as const, timestamp: new Date() };
    },
    async getSensors() { return []; },
  };

  bearing: IBearingDatabase = {
    async getBearing(model: string) {
      // 常用轴承型号默认参数
      const commonBearings: Record<string, BearingInfo> = {
        '6205': {
          model: '6205', manufacturer: 'SKF',
          numberOfBalls: 9, ballDiameter: 7.938, pitchDiameter: 38.5, contactAngle: 0,
          innerDiameter: 25, outerDiameter: 52, width: 15,
          dynamicLoadRating: 14.8, staticLoadRating: 7.8, limitingSpeed: 14000,
        },
        '6206': {
          model: '6206', manufacturer: 'SKF',
          numberOfBalls: 9, ballDiameter: 9.525, pitchDiameter: 46.5, contactAngle: 0,
          innerDiameter: 30, outerDiameter: 62, width: 16,
          dynamicLoadRating: 19.5, staticLoadRating: 11.2, limitingSpeed: 12000,
        },
        '6208': {
          model: '6208', manufacturer: 'SKF',
          numberOfBalls: 9, ballDiameter: 11.906, pitchDiameter: 54.991, contactAngle: 0,
          innerDiameter: 40, outerDiameter: 80, width: 18,
          dynamicLoadRating: 29.1, staticLoadRating: 17.8, limitingSpeed: 9500,
        },
        '6310': {
          model: '6310', manufacturer: 'SKF',
          numberOfBalls: 8, ballDiameter: 17.462, pitchDiameter: 71.501, contactAngle: 0,
          innerDiameter: 50, outerDiameter: 110, width: 27,
          dynamicLoadRating: 61.8, staticLoadRating: 38.0, limitingSpeed: 7000,
        },
      };
      return commonBearings[model] || null;
    },
    async searchBearings() { return []; },
  };

  condition: IConditionNormalizer = {
    async getCurrentCondition() {
      return { timestamp: new Date(), rpm: 1500, load: 75, ambientTemp: 25 };
    },
    async getNormalizationModel() { return null; },
    normalize(value) { return value; },
  };

  material: IMaterialDatabase = {
    async getMaterial(grade: string) {
      const commonMaterials: Record<string, MaterialInfo> = {
        'Q235': {
          grade: 'Q235', type: 'steel', elasticModulus: 206, poissonRatio: 0.3,
          density: 7850, yieldStrength: 235, tensileStrength: 370, fatigueLimit: 160,
          snCurve: { C: 1e12, m: 3, N_knee: 5e6 },
        },
        'Q345': {
          grade: 'Q345', type: 'steel', elasticModulus: 206, poissonRatio: 0.3,
          density: 7850, yieldStrength: 345, tensileStrength: 470, fatigueLimit: 210,
          snCurve: { C: 2e12, m: 3, N_knee: 5e6 },
        },
        '304SS': {
          grade: '304SS', type: 'steel', elasticModulus: 193, poissonRatio: 0.29,
          density: 7930, yieldStrength: 205, tensileStrength: 520, fatigueLimit: 240,
          snCurve: { C: 3e12, m: 3.5, N_knee: 1e7 },
        },
      };
      return commonMaterials[grade] || null;
    },
    async getSNCurve() { return null; },
  };

  history: IHistoryDataProvider = {
    async queryTimeSeries() {
      return { timestamps: [], values: [], unit: '' };
    },
    async queryFeatureTrend() {
      return { timestamps: [], values: [], unit: '' };
    },
    async getBaselineData() { return null; },
  };

  cases: ICaseDatabase = {
    async searchSimilar() { return []; },
    async queryByFaultType() { return []; },
    async addCase() { return 'mock-case-id'; },
  };

  models: IModelRepository = {
    async getModel() { return null; },
    async getLatestModel() { return null; },
    async saveModel() { return 'mock-model-id'; },
    async listVersions() { return []; },
  };

  llm: ILLMProvider = {
    async generate() { return 'LLM provider not configured'; },
    async generateStructured() { return {} as any; },
  };
}
