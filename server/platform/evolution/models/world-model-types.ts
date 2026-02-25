/**
 * ============================================================================
 * World Model Engine — 类型定义
 * ============================================================================
 *
 * 定义 ONNX Runtime 神经网络世界模型的输入/输出/训练接口。
 * 与 cognition/worldmodel/world-model.ts 的物理+统计模型互补：
 *   - 物理模型：确定性，基于工程公式（风载、疲劳、腐蚀）
 *   - 神经模型：概率性，基于 LSTM/Transformer 时序预测
 *
 * 两者通过 Orchestrator 统一调度，可独立或融合使用。
 */

// ============================================================================
// 神经网络推理接口
// ============================================================================

/** ONNX 推理输入 — 编码后的多模态时序特征 */
export interface WorldModelInput {
  /** 关联的作业 ID（用于追踪） */
  jobId: string;
  /** 编码后的特征向量（已归一化的 float32 数组） */
  encodedFeatures: number[];
  /** 时序长度（LSTM 窗口大小） */
  sequenceLength: number;
  /** 特征维度（每个时间步的特征数） */
  featureDim: number;
  /** 可选：设备 ID（多设备场景） */
  deviceId?: string;
  /** 可选：工况标签（用于条件预测） */
  conditionLabel?: string;
}

/** ONNX 推理输出 — 未来状态预测 */
export interface WorldModelPrediction {
  /** 未来状态轨迹（展平的 float32 数组） */
  futureStates: number[];
  /** 干预概率（0-1，越高越需要人工干预） */
  interventionProbability: number;
  /** 碳排放强度预测（gCO2/kWh） */
  carbonIntensityForecast: number;
  /** 预测置信度（0-1） */
  confidence: number;
  /** 预测时间戳 */
  timestamp: number;
}

/** 世界模型提供者接口（策略模式） */
export interface WorldModelProvider {
  /** 初始化模型会话 */
  init(): Promise<void>;
  /** 预测未来状态 */
  predictFuture(input: WorldModelInput): Promise<WorldModelPrediction>;
  /** 提交训练任务 */
  train(job: WorldModelTrainingJob): Promise<boolean>;
  /** 释放资源 */
  dispose(): Promise<void>;
}

// ============================================================================
// 训练接口
// ============================================================================

/** 世界模型训练任务 */
export interface WorldModelTrainingJob {
  /** 任务 ID */
  id: string;
  /** 训练类型 */
  type: 'world_model';
  /** 是否启用碳感知调度 */
  carbonAware: boolean;
  /** 模型 ID（用于版本管理） */
  modelId?: string;
  /** 训练数据集路径 */
  datasetPath?: string;
  /** 训练配置 */
  config?: WorldModelTrainingConfig;
  /** 提交者 */
  submittedBy?: string;
}

/** 训练超参数配置 */
export interface WorldModelTrainingConfig {
  /** 学习率 */
  learningRate: number;
  /** 批大小 */
  batchSize: number;
  /** 训练轮数 */
  epochs: number;
  /** 序列长度 */
  sequenceLength: number;
  /** 隐藏层维度 */
  hiddenDim: number;
  /** 模型架构 */
  architecture: 'lstm' | 'transformer' | 'tcn';
  /** 是否使用注意力机制 */
  useAttention: boolean;
  /** Dropout 率 */
  dropout: number;
  /** 早停耐心 */
  earlyStoppingPatience: number;
}

/** 默认训练配置 */
export const DEFAULT_TRAINING_CONFIG: WorldModelTrainingConfig = {
  learningRate: 0.001,
  batchSize: 32,
  epochs: 100,
  sequenceLength: 60,
  hiddenDim: 128,
  architecture: 'lstm',
  useAttention: true,
  dropout: 0.2,
  earlyStoppingPatience: 10,
};

// ============================================================================
// 引擎配置
// ============================================================================

/** WorldModelEngine 运行时配置 */
export interface WorldModelEngineConfig {
  /** ONNX 模型文件路径 */
  modelPath: string;
  /** 执行提供者（cpu / cuda / coreml） */
  executionProvider: 'cpu' | 'cuda' | 'coreml';
  /** 图优化级别 */
  graphOptimizationLevel: 'disabled' | 'basic' | 'extended' | 'all';
  /** 推理超时 (ms) */
  inferenceTimeoutMs: number;
  /** 是否启用模型缓存 */
  enableModelCache: boolean;
  /** 最大并发推理数 */
  maxConcurrentInferences: number;
  /** 降级模式：ONNX 不可用时使用物理模型 */
  fallbackToPhysics: boolean;
}

/** 默认引擎配置 */
export const DEFAULT_ENGINE_CONFIG: WorldModelEngineConfig = {
  modelPath: 'server/platform/evolution/models/world-model-lstm.onnx',
  executionProvider: 'cpu',
  graphOptimizationLevel: 'all',
  inferenceTimeoutMs: 5000,
  enableModelCache: true,
  maxConcurrentInferences: 4,
  fallbackToPhysics: true,
};
