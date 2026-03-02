/**
 * 高级知识蒸馏 tRPC 路由
 *
 * API 端点：
 * 1. recommendStrategy — 根据场景推荐蒸馏策略
 * 2. train — 执行高级蒸馏训练
 * 3. getHistory — 获取训练历史
 * 4. getHistoryItem — 获取单条训练详情
 * 5. getConfig — 获取当前配置
 * 6. getLossComponents — 获取损失分量说明
 * 7. saveConfig — 持久化配置（覆盖当前运行配置）
 */

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../core/trpc';
import {
  recommendStrategy,
  runAdvancedDistillation,
  getTrainHistory,
  getTrainHistoryItem,
  addTrainHistory,
  type DistillConfig,
  type DistillScenario,
} from '../services/advancedDistillation.service';
import { createModuleLogger } from '../core/logger';

const log = createModuleLogger('advancedDistillationRouter');

// ============================================================================
// 默认配置 + 当前运行配置
// ============================================================================

const DEFAULT_CONFIG: DistillConfig = {
  weights: { alpha: 0.3, beta: 0.4, gamma: 0.3 },
  tempRange: [2, 4],
  datasetSize: 10000,
  teacherInputDims: [128, 64],
  teacherHiddenDim: 512,
  teacherFeatDim: 256,
  studentInputDims: [128, 64],
  studentHiddenDim: 128,
  studentFeatDim: 128,
  nClasses: 5,
  epochs: 20,
  learningRate: 1e-3,
  patience: 5,
  validationSplit: 0.2,
};

/** 当前运行配置 — saveConfig 写入，getConfig/train 读取 */
let currentConfig: DistillConfig = { ...DEFAULT_CONFIG, weights: { ...DEFAULT_CONFIG.weights } };

// ============================================================================
// 路由
// ============================================================================

export const advancedDistillationRouter = router({
  /**
   * 策略推荐 — 对齐 Python recommend_strategy()
   */
  // S0-2: 写操作改为 protectedProcedure（原全部 publicProcedure）
  recommendStrategy: protectedProcedure
    .input(z.object({
      modalities: z.array(z.number()).min(1).describe('各模态特征维度'),
      computeBudget: z.number().default(1e6).describe('计算预算'),
      numClasses: z.number().min(2).describe('分类数'),
      datasetSize: z.number().min(10).describe('数据集大小'),
    }))
    .mutation(async ({ input }) => {
      const scenario: DistillScenario = {
        modalities: input.modalities,
        computeBudget: input.computeBudget,
        numClasses: input.numClasses,
        datasetSize: input.datasetSize,
      };
      const strategy = recommendStrategy(scenario);
      log.info(`Strategy recommended: ${strategy.base}, weights=${JSON.stringify(strategy.weights)}`);
      return { success: true, data: strategy };
    }),

  /**
   * 执行高级蒸馏训练
   */
  // S0-2: 训练执行消耗大量 GPU 资源，必须认证
  train: protectedProcedure
    .input(z.object({
      config: z.object({
        weights: z.record(z.string(), z.number()).optional(),
        tempRange: z.tuple([z.number(), z.number()]).optional(),
        datasetSize: z.number().optional(),
        teacherInputDims: z.array(z.number()).optional(),
        teacherHiddenDim: z.number().optional(),
        teacherFeatDim: z.number().optional(),
        studentInputDims: z.array(z.number()).optional(),
        studentHiddenDim: z.number().optional(),
        studentFeatDim: z.number().optional(),
        nClasses: z.number().optional(),
        epochs: z.number().optional(),
        learningRate: z.number().optional(),
        patience: z.number().optional(),
        validationSplit: z.number().optional(),
      }).optional(),
      trainingData: z.object({
        features: z.array(z.array(z.number())),
        labels: z.array(z.number()),
        modalitySplit: z.array(z.number()).optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const mergedConfig: DistillConfig = {
        ...currentConfig,
        ...(input.config || {}),
        weights: { ...currentConfig.weights, ...(input.config?.weights || {}) },
        tempRange: input.config?.tempRange || currentConfig.tempRange,
      };

      log.info(`Starting advanced distillation: ${input.trainingData.features.length} samples, ${mergedConfig.epochs} epochs`);

      const result = runAdvancedDistillation(mergedConfig, input.trainingData);
      const id = addTrainHistory(mergedConfig, result);

      log.info(`Distillation complete: id=${id}, bestAcc=${(result.bestValAcc * 100).toFixed(1)}%, duration=${result.durationMs}ms`);

      return {
        success: true,
        data: {
          ...result,
          id,
        },
      };
    }),

  /**
   * 获取训练历史
   */
  getHistory: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }).optional())
    .query(({ input }) => {
      return getTrainHistory(input?.limit || 50);
    }),

  /**
   * 获取单条训练详情
   */
  getHistoryItem: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const item = getTrainHistoryItem(input.id);
      if (!item) return { found: false, data: null };
      return { found: true, data: item };
    }),

  /**
   * 获取当前配置（含用户保存的覆盖）
   */
  getConfig: publicProcedure.query(() => {
    return {
      defaultConfig: currentConfig,
      lossComponents: [
        { key: 'alpha', name: '硬标签损失', description: 'Cross-Entropy Loss — 学生对真实标签的分类损失', default: 0.3, color: '#3b82f6' },
        { key: 'beta', name: '响应蒸馏损失', description: 'KL Divergence × T² — 教师软标签知识迁移', default: 0.4, color: '#ef4444' },
        { key: 'gamma', name: '特征蒸馏损失', description: 'L2-Norm + MSE — 中间特征对齐', default: 0.3, color: '#22c55e' },
        { key: 'relation', name: '关系蒸馏损失', description: '样本间余弦相似度矩阵对齐', default: 0, color: '#f97316' },
        { key: 'fusion', name: '融合蒸馏损失', description: '子集模态 KL 对齐（多模态专用）', default: 0, color: '#8b5cf6' },
      ],
      temperatureInfo: {
        description: '动态温度: EMA 平滑 + warmup + 自适应 beta + clamp',
        defaultBase: 4.0,
        defaultRange: [2, 4] as [number, number],
        warmupEpochs: 5,
      },
      modelArchitectures: {
        teacher: { description: '多模态教师模型 — Concat Fusion + 大容量隐藏层', defaultHidden: 512, defaultFeat: 256 },
        student: { description: '多模态学生模型 — Attention Fusion + 轻量隐藏层', defaultHidden: 128, defaultFeat: 128 },
      },
    };
  }),

  /**
   * 获取损失分量说明（用于前端图例）
   */
  getLossComponents: publicProcedure.query(() => {
    return [
      { key: 'hard', name: '硬标签损失 (α)', formula: 'CE(student, labels)', color: '#3b82f6', icon: '🎯' },
      { key: 'response', name: '响应蒸馏 (β)', formula: 'KL(teacher_soft ∥ student_soft) × T²', color: '#ef4444', icon: '🔥' },
      { key: 'feature', name: '特征蒸馏 (γ)', formula: 'MSE(proj(s_feat), t_feat)', color: '#22c55e', icon: '🧬' },
      { key: 'relation', name: '关系蒸馏', formula: 'MSE(S_sim, T_sim)', color: '#f97316', icon: '🔗' },
      { key: 'fusion', name: '融合蒸馏', formula: 'Σ KL(T_sub ∥ S_sub) / M', color: '#8b5cf6', icon: '🧩' },
    ];
  }),

  /**
   * 保存蒸馏配置 — 持久化到运行时（覆盖 currentConfig）
   */
  saveConfig: protectedProcedure
    .input(z.object({
      weights: z.record(z.string(), z.number()).optional(),
      tempRange: z.tuple([z.number(), z.number()]).optional(),
      datasetSize: z.number().optional(),
      teacherInputDims: z.array(z.number()).optional(),
      teacherHiddenDim: z.number().optional(),
      teacherFeatDim: z.number().optional(),
      studentInputDims: z.array(z.number()).optional(),
      studentHiddenDim: z.number().optional(),
      studentFeatDim: z.number().optional(),
      nClasses: z.number().optional(),
      epochs: z.number().optional(),
      learningRate: z.number().optional(),
      patience: z.number().optional(),
      validationSplit: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const prev = { ...currentConfig };
      currentConfig = {
        ...currentConfig,
        ...input,
        weights: { ...currentConfig.weights, ...(input.weights || {}) },
        tempRange: input.tempRange || currentConfig.tempRange,
      };
      log.info(`Config saved: ${JSON.stringify(currentConfig)}`);
      return { success: true, config: currentConfig, previous: prev };
    }),
});
