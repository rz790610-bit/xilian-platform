/**
 * 算法模块统一注册入口
 * 
 * 将所有 10 大分类的算法注册到统一执行引擎
 */

import { AlgorithmEngine } from './_core/engine';
import type { AlgorithmRegistration } from './_core/types';

// 各分类算法导入
import { getMechanicalAlgorithms } from './mechanical';
import { getElectricalAlgorithms } from './electrical';
import { getStructuralAlgorithms } from './structural';
import { getAnomalyAlgorithms } from './anomaly';
import { getOptimizationAlgorithms } from './optimization';
import { getComprehensiveAlgorithms } from './comprehensive';
import { getFeatureExtractionAlgorithms } from './feature-extraction';
import { getAgentPluginAlgorithms } from './agent-plugins';
import { getModelIterationAlgorithms } from './model-iteration';
import { getRuleLearningAlgorithms } from './rule-learning';
import { createModuleLogger } from '../core/logger';
const log = createModuleLogger('index');

/**
 * 获取所有算法注册信息
 */
export function getAllAlgorithmRegistrations(): AlgorithmRegistration[] {

  return [
    ...getMechanicalAlgorithms(),
    ...getElectricalAlgorithms(),
    ...getStructuralAlgorithms(),
    ...getAnomalyAlgorithms(),
    ...getOptimizationAlgorithms(),
    ...getComprehensiveAlgorithms(),
    ...getFeatureExtractionAlgorithms(),
    ...getAgentPluginAlgorithms(),
    ...getModelIterationAlgorithms(),
    ...getRuleLearningAlgorithms(),
  ];
}

/**
 * 创建并初始化算法引擎（单例）
 */
let engineInstance: AlgorithmEngine | null = null;

export function getAlgorithmEngine(): AlgorithmEngine {
  if (!engineInstance) {
    const engine = AlgorithmEngine.getInstance();
    const registrations = getAllAlgorithmRegistrations();
    engine.registerAll(registrations);
    log.debug(`[AlgorithmEngine] Registered ${registrations.length} algorithms across 10 categories`);
    engineInstance = engine;
  }
  return engineInstance!;
}

/**
 * 算法分类元数据
 */
export const ALGORITHM_CATEGORIES = {
  mechanical: {
    id: 'mechanical',
    name: '机械算法',
    icon: '⚙️',
    description: '振动信号处理与机械故障诊断',
    color: '#3b82f6',
  },
  electrical: {
    id: 'electrical',
    name: '电气算法',
    icon: '⚡',
    description: '电气设备状态监测与故障诊断',
    color: '#f59e0b',
  },
  structural: {
    id: 'structural',
    name: '结构算法',
    icon: '🏗️',
    description: '结构健康监测与疲劳寿命评估',
    color: '#10b981',
  },
  anomaly_detection: {
    id: 'anomaly_detection',
    name: '异常检测',
    icon: '🔍',
    description: '多维度异常检测与统计过程控制',
    color: '#ef4444',
  },
  optimization: {
    id: 'optimization',
    name: '优化算法',
    icon: '📈',
    description: '智能优化与参数寻优',
    color: '#8b5cf6',
  },
  comprehensive: {
    id: 'comprehensive',
    name: '综合算法',
    icon: '🔗',
    description: '多源信息融合与因果推理',
    color: '#06b6d4',
  },
  feature_extraction: {
    id: 'feature_extraction',
    name: '特征提取',
    icon: '📊',
    description: '时域/频域/时频域特征工程',
    color: '#84cc16',
  },
  agent_plugin: {
    id: 'agent_plugin',
    name: 'Agent插件',
    icon: '🤖',
    description: '智能诊断Agent专家插件',
    color: '#d946ef',
  },
  model_iteration: {
    id: 'model_iteration',
    name: '模型迭代',
    icon: '🔄',
    description: '模型训练、微调、蒸馏与增量学习',
    color: '#f97316',
  },
  rule_learning: {
    id: 'rule_learning',
    name: '规则自动学习',
    icon: '📝',
    description: '自动规则发现与模式挖掘',
    color: '#14b8a6',
  },
} as const;

export type AlgorithmCategoryId = keyof typeof ALGORITHM_CATEGORIES;

// 重新导出核心类型
export type { IAlgorithmExecutor, AlgorithmInput, AlgorithmOutput, AlgorithmRegistration } from './_core/types';
export { AlgorithmEngine } from './_core/engine';
