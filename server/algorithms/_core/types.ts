/**
 * 算法执行引擎 - 核心类型定义
 * 
 * 统一的算法接口规范，所有算法实现必须遵循此接口。
 * 设计原则：
 * 1. 输入/输出标准化 - 统一的 AlgorithmInput/AlgorithmOutput 接口
 * 2. 配置驱动 - 通过 config 对象传递算法参数
 * 3. 结论输出 - 每个算法必须输出结构化诊断结论
 * 4. 可观测性 - 执行过程记录耗时、中间状态
 */

/** 算法执行状态 */
export type AlgorithmStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** 诊断严重等级 (ISO 10816 / ISO 20816 标准) */
export type SeverityLevel = 'normal' | 'attention' | 'warning' | 'critical';

/** 紧急程度 */
export type UrgencyLevel = 'monitoring' | 'attention' | 'scheduled' | 'immediate';

/** 算法输入接口 */
export interface AlgorithmInput {
  /** 主数据 - 时间序列或特征矩阵 */
  data: number[] | number[][] | Record<string, number[]>;
  /** 采样率 (Hz)，信号处理算法必需 */
  sampleRate?: number;
  /** 时间戳数组 */
  timestamps?: string[] | number[];
  /** 设备信息 */
  equipment?: {
    type: string;
    model?: string;
    ratedSpeed?: number;  // RPM
    ratedPower?: number;  // kW
    bearingInfo?: Record<string, any>;
    [key: string]: any;
  };
  /** 工况参数 */
  operatingCondition?: {
    speed?: number;    // RPM
    load?: number;     // %
    temperature?: number; // °C
    [key: string]: any;
  };
  /** 附加上下文 */
  context?: Record<string, any>;
}

/** 诊断结论 */
export interface DiagnosisConclusion {
  /** 结论摘要 */
  summary: string;
  /** 严重等级 */
  severity: SeverityLevel;
  /** 紧急程度 */
  urgency: UrgencyLevel;
  /** 置信度 0-1 */
  confidence: number;
  /** 故障类型（如有） */
  faultType?: string;
  /** 根因分析 */
  rootCause?: string;
  /** 建议措施 */
  recommendations?: string[];
  /** 参考标准 */
  referenceStandard?: string;
}

/** 算法输出接口 */
export interface AlgorithmOutput {
  /** 算法ID */
  algorithmId: string;
  /** 执行状态 */
  status: AlgorithmStatus;
  /** 诊断结论 - 必须输出 */
  diagnosis: DiagnosisConclusion;
  /** 计算结果数据 */
  results: Record<string, any>;
  /** 可视化数据（用于前端图表渲染） */
  visualizations?: AlgorithmVisualization[];
  /** 执行元数据 */
  metadata: {
    executionTimeMs: number;
    inputDataPoints: number;
    algorithmVersion: string;
    parameters: Record<string, any>;
  };
  /** 错误信息（失败时） */
  error?: string;
}

/** 可视化数据 */
export interface AlgorithmVisualization {
  /** 图表类型 */
  type: 'line' | 'bar' | 'scatter' | 'heatmap' | 'spectrum' | 'waterfall' | 'polar';
  /** 标题 */
  title: string;
  /** X轴 */
  xAxis?: { label: string; unit?: string; data?: number[] | string[] };
  /** Y轴 */
  yAxis?: { label: string; unit?: string };
  /** 数据系列 */
  series: Array<{
    name: string;
    data: number[] | number[][];
    color?: string;
  }>;
  /** 标注线 */
  markLines?: Array<{ value: number; label: string; color?: string }>;
}

/** 算法执行器接口 - 所有算法必须实现 */
export interface IAlgorithmExecutor {
  /** 算法唯一标识 */
  readonly id: string;
  /** 算法名称 */
  readonly name: string;
  /** 算法版本 */
  readonly version: string;
  /** 所属分类 */
  readonly category: string;

  /** 执行算法 */
  execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput>;

  /** 验证输入 */
  validateInput(input: AlgorithmInput, config: Record<string, any>): { valid: boolean; errors?: string[] };

  /** 获取默认配置 */
  getDefaultConfig(): Record<string, any>;
}

/** 算法注册信息 */
export interface AlgorithmRegistration {
  executor: IAlgorithmExecutor;
  metadata: {
    description: string;
    tags: string[];
    inputFields: any[];
    outputFields: any[];
    configFields: any[];
    applicableDeviceTypes: string[];
    applicableScenarios: string[];
    complexity: string;
    edgeDeployable: boolean;
    referenceStandards?: string[];
  };
}
