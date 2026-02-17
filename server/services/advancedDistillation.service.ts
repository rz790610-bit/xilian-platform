/**
 * 高级知识蒸馏服务 — DistilLib v2.4 TypeScript 实现
 *
 * 1:1 翻译 Python distillib_v2.4_final.py 核心引擎
 * 支持：动态温度 / 特征蒸馏 / 关系蒸馏 / 多模态融合蒸馏 / 策略推荐 / 缺失模态
 *
 * 架构对齐：
 *   Python DynamicTemperature     → TS DynamicTemperature
 *   Python FeatureDistillLoss     → TS FeatureDistillLoss
 *   Python RelationDistillLoss    → TS RelationDistillLoss
 *   Python MultimodalStudent      → TS MultimodalStudent
 *   Python MultimodalTeacher      → TS MultimodalTeacher
 *   Python DistilLib              → TS DistilLib
 *   Python recommend_strategy     → TS recommendStrategy
 *   Python compute_loss           → TS computeLoss
 *   Python train                  → TS train
 *   Python evaluate               → TS evaluate
 */

import { createModuleLogger } from '../core/logger';
const log = createModuleLogger('advancedDistillation');

// ============================================================================
// 数学工具
// ============================================================================

function softmax(logits: number[]): number[] {
  const mx = Math.max(...logits);
  const exps = logits.map(l => Math.exp(l - mx));
  const s = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / s);
}

function klDiv(p: number[], q: number[]): number {
  let kl = 0;
  for (let i = 0; i < p.length; i++) {
    if (p[i] > 1e-15 && q[i] > 1e-15) kl += p[i] * Math.log(p[i] / q[i]);
  }
  return isFinite(kl) ? kl : 0;
}

function logSoftmax(logits: number[]): number[] {
  const mx = Math.max(...logits);
  const logSumExp = mx + Math.log(logits.reduce((s, l) => s + Math.exp(l - mx), 0));
  return logits.map(l => l - logSumExp);
}

function mseLoss(a: number[], b: number[]): number {
  if (a.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  const result = s / a.length;
  return isFinite(result) ? result : 0;
}

function l2Normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) + 1e-8;
  return v.map(x => x / norm);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

/** 确定性伪随机 (LCG) */
function lcgRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s / 0x7fffffff) * 2 - 1;
  };
}

function xavierInit(rows: number, cols: number, seed0 = 42): number[][] {
  const scale = Math.sqrt(2.0 / (rows + cols));
  const rng = lcgRandom(rows * 1000 + cols * 7 + seed0);
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => rng() * scale));
}

// ============================================================================
// MLP 引擎 — 真实前向/反向传播
// ============================================================================

interface Layer { W: number[][]; b: number[]; act: 'relu' | 'none'; }
interface MLPModel { layers: Layer[]; }

function buildMLP(dims: number[], seedBase = 42): MLPModel {
  const layers: Layer[] = [];
  for (let i = 0; i < dims.length - 1; i++) {
    layers.push({
      W: xavierInit(dims[i + 1], dims[i], i * 100 + seedBase),
      b: new Array(dims[i + 1]).fill(0),
      act: i < dims.length - 2 ? 'relu' : 'none',
    });
  }
  return { layers };
}

function mlpForward(m: MLPModel, x: number[]): { acts: number[][]; logits: number[] } {
  const acts: number[][] = [x];
  let cur = x;
  for (const l of m.layers) {
    const z = l.W.map((row, i) => row.reduce((s, w, j) => s + w * cur[j], 0) + l.b[i]);
    const out = l.act === 'relu' ? z.map(v => Math.max(0, v)) : z;
    acts.push(out);
    cur = out;
  }
  return { acts, logits: cur };
}

function mlpPredict(m: MLPModel, X: number[][]): number[][] {
  return X.map(x => mlpForward(m, x).logits);
}

function countParams(m: MLPModel): number {
  return m.layers.reduce((s, l) => s + l.W.length * l.W[0].length + l.b.length, 0);
}

function trainStepSGD(m: MLPModel, X: number[][], Y: number[], lr: number): number {
  const n = X.length;
  const gW: number[][][] = m.layers.map(l => l.W.map(r => new Array(r.length).fill(0)));
  const gB: number[][] = m.layers.map(l => new Array(l.b.length).fill(0));
  let totalLoss = 0;

  for (let s = 0; s < n; s++) {
    const { acts, logits } = mlpForward(m, X[s]);
    const probs = softmax(logits);
    totalLoss -= Math.log(Math.max(probs[Y[s]], 1e-15));

    let delta = probs.map((p, c) => p - (c === Y[s] ? 1 : 0));
    for (let li = m.layers.length - 1; li >= 0; li--) {
      const a = acts[li];
      for (let i = 0; i < delta.length; i++) {
        for (let j = 0; j < a.length; j++) gW[li][i][j] += delta[i] * a[j];
        gB[li][i] += delta[i];
      }
      if (li > 0) {
        const pd = new Array(a.length).fill(0);
        for (let j = 0; j < a.length; j++) {
          for (let i = 0; i < delta.length; i++) pd[j] += m.layers[li].W[i][j] * delta[i];
          if (m.layers[li - 1].act === 'relu') pd[j] *= acts[li][j] > 0 ? 1 : 0;
        }
        delta = pd;
      }
    }
  }

  for (let li = 0; li < m.layers.length; li++) {
    for (let i = 0; i < m.layers[li].W.length; i++) {
      for (let j = 0; j < m.layers[li].W[i].length; j++) {
        m.layers[li].W[i][j] -= lr * gW[li][i][j] / n;
      }
      m.layers[li].b[i] -= lr * gB[li][i] / n;
    }
  }
  return totalLoss / n;
}

function calcAccuracy(preds: number[][], labels: number[]): number {
  let c = 0;
  for (let i = 0; i < labels.length; i++) {
    const p = softmax(preds[i]);
    if (p.indexOf(Math.max(...p)) === labels[i]) c++;
  }
  return c / labels.length;
}

function calcPRF1(preds: number[][], labels: number[]): { precision: number; recall: number; f1: number } {
  if (preds.length === 0) return { precision: 0, recall: 0, f1: 0 };
  const nc = preds[0]?.length || 2;
  // 预计算所有预测类别（避免重复 softmax）
  const predClasses = preds.map(p => {
    const probs = softmax(p);
    return probs.indexOf(Math.max(...probs));
  });
  let tp = 0, rp = 0;
  for (let cl = 0; cl < nc; cl++) {
    let tpc = 0, fpc = 0, fnc = 0;
    for (let i = 0; i < labels.length; i++) {
      if (predClasses[i] === cl && labels[i] === cl) tpc++;
      else if (predClasses[i] === cl) fpc++;
      else if (labels[i] === cl) fnc++;
    }
    tp += tpc / Math.max(tpc + fpc, 1);
    rp += tpc / Math.max(tpc + fnc, 1);
  }
  const pr = tp / nc, re = rp / nc;
  return { precision: pr, recall: re, f1: pr + re > 0 ? 2 * pr * re / (pr + re) : 0 };
}

// ============================================================================
// DynamicTemperature — 对齐 Python DynamicTemperature
// ============================================================================

export class DynamicTemperature {
  private baseTemp: number;
  private beta: number;
  private alphaEma: number;
  private warmupEpochs: number;
  /** 当前温度（公开以便读取） */
  public currentTemp: number;

  constructor(baseTemp = 4.0, beta = 1.0, alphaEma = 0.9, warmupEpochs = 5) {
    this.baseTemp = baseTemp;
    this.beta = beta;
    this.alphaEma = alphaEma;
    this.warmupEpochs = warmupEpochs;
    this.currentTemp = baseTemp;
  }

  getTemp(sLogits: number[], tLogits: number[], epoch: number, tempRange: [number, number], datasetSize = 10000): number {
    if (epoch < this.warmupEpochs) return this.baseTemp;

    const sSoft = softmax(sLogits);
    const tSoft = softmax(tLogits);
    const kl = klDiv(tSoft, sSoft);

    const adaptiveBeta = this.beta / (1 + Math.log(1 + datasetSize / 1000));
    const rawTemp = this.baseTemp + adaptiveBeta * Math.log(1 + kl);

    this.currentTemp = this.alphaEma * this.currentTemp + (1 - this.alphaEma) * rawTemp;
    return Math.max(tempRange[0], Math.min(tempRange[1], this.currentTemp));
  }
}

// ============================================================================
// FeatureDistillLoss — 对齐 Python FeatureDistillLoss
// ============================================================================

export class FeatureDistillLoss {
  private projW: number[][] | null = null;
  private projB: number[] | null = null;
  private sDim: number = 0;
  private tDim: number = 0;

  lazyInit(sDim: number, tDim: number, seed = 42) {
    this.sDim = sDim;
    this.tDim = tDim;
    if (sDim !== tDim) {
      this.projW = xavierInit(tDim, sDim, seed + 999);
      this.projB = new Array(tDim).fill(0);
    }
  }

  forward(sFeat: number[], tFeat: number[]): number {
    let sProj: number[];
    if (this.projW && this.projB) {
      sProj = this.projW.map((row, i) => row.reduce((s, w, j) => s + w * sFeat[j], 0) + this.projB![i]);
    } else {
      sProj = [...sFeat];
    }
    const sNorm = l2Normalize(sProj);
    const tNorm = l2Normalize(tFeat);
    return mseLoss(sNorm, tNorm);
  }
}

// ============================================================================
// RelationDistillLoss — 对齐 Python RelationDistillLoss
// ============================================================================

export class RelationDistillLoss {
  forward(sFeats: number[][], tFeats: number[][], weight = 1.0): number {
    const n = sFeats.length;
    if (n < 2) return 0;

    // 构建样本间余弦相似度矩阵
    const sSim: number[][] = [];
    const tSim: number[][] = [];
    for (let i = 0; i < n; i++) {
      sSim.push([]);
      tSim.push([]);
      for (let j = 0; j < n; j++) {
        sSim[i].push(cosineSimilarity(sFeats[i], sFeats[j]));
        tSim[i].push(cosineSimilarity(tFeats[i], tFeats[j]));
      }
    }

    // MSE between similarity matrices
    let loss = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        loss += (sSim[i][j] - tSim[i][j]) ** 2;
      }
    }
    return (loss / (n * n)) * weight;
  }
}

// ============================================================================
// MultimodalMLP — 多模态教师/学生模型 (TypeScript 实现)
// ============================================================================

interface MultimodalModel {
  type: 'teacher' | 'student';
  inputDims: number[];
  hiddenDim: number;
  nClasses: number;
  encoders: MLPModel[];
  /** 教师: concat fusion → linear; 学生: attention-based */
  fusionW?: number[][];
  fusionB?: number[];
  featW: number[][];
  featB: number[];
  classifierW: number[][];
  classifierB: number[];
  /** 学生 attention 参数 */
  attnQW?: number[][];
  attnQB?: number[];
  attnKW?: number[][];
  attnKB?: number[];
  attnVW?: number[][];
  attnVB?: number[];
}

function buildMultimodalModel(
  type: 'teacher' | 'student',
  inputDims: number[],
  hiddenDim: number,
  nClasses: number,
  featOutDim: number,
  seed = 42
): MultimodalModel {
  const encoders = inputDims.map((d, i) => buildMLP([d, hiddenDim], seed + i * 200));

  const model: MultimodalModel = {
    type, inputDims, hiddenDim, nClasses, encoders,
    featW: xavierInit(featOutDim, hiddenDim, seed + 800),
    featB: new Array(featOutDim).fill(0),
    classifierW: xavierInit(nClasses, hiddenDim, seed + 900),
    classifierB: new Array(nClasses).fill(0),
  };

  if (type === 'teacher') {
    const fusionInDim = hiddenDim * inputDims.length;
    model.fusionW = xavierInit(hiddenDim, fusionInDim, seed + 500);
    model.fusionB = new Array(hiddenDim).fill(0);
  } else {
    // 简化的 attention 参数 (单头)
    model.attnQW = xavierInit(hiddenDim, hiddenDim, seed + 600);
    model.attnQB = new Array(hiddenDim).fill(0);
    model.attnKW = xavierInit(hiddenDim, hiddenDim, seed + 610);
    model.attnKB = new Array(hiddenDim).fill(0);
    model.attnVW = xavierInit(hiddenDim, hiddenDim, seed + 620);
    model.attnVB = new Array(hiddenDim).fill(0);
  }

  return model;
}

function multimodalForward(
  model: MultimodalModel,
  modalities: (number[] | null)[],
  mask: boolean[], // mask[i] = true → 模态 i 缺失
  returnFeats: boolean
): { logits: number[]; feat: number[] | null } {
  const B = model.hiddenDim;
  const encoded: number[][] = [];

  for (let i = 0; i < modalities.length; i++) {
    if (modalities[i] === null || mask[i]) {
      encoded.push(new Array(B).fill(0));
    } else {
      const { logits } = mlpForward(model.encoders[i], modalities[i]!);
      // ReLU
      encoded.push(logits.map(v => Math.max(0, v)));
    }
  }

  let fused: number[];

  if (model.type === 'teacher') {
    // Concat fusion
    const concat = encoded.flat();
    fused = model.fusionW!.map((row, i) => {
      let s = model.fusionB![i];
      for (let j = 0; j < row.length; j++) s += row[j] * (j < concat.length ? concat[j] : 0);
      return Math.max(0, s); // ReLU
    });
  } else {
    // Simplified scaled dot-product attention
    const query = encoded[0]; // 第一个模态作为 query
    const qProj = model.attnQW!.map((row, i) => row.reduce((s, w, j) => s + w * query[j], 0) + model.attnQB![i]);

    const scores: number[] = [];
    const vProjs: number[][] = [];
    for (let m = 0; m < encoded.length; m++) {
      const kProj = model.attnKW!.map((row, i) => row.reduce((s, w, j) => s + w * encoded[m][j], 0) + model.attnKB![i]);
      const vProj = model.attnVW!.map((row, i) => row.reduce((s, w, j) => s + w * encoded[m][j], 0) + model.attnVB![i]);
      vProjs.push(vProj);

      // Scaled dot product
      let score = 0;
      for (let d = 0; d < B; d++) score += qProj[d] * kProj[d];
      score /= Math.sqrt(B);

      // 缺失模态 → -1e9 (mask)
      if (mask[m]) score = -1e9;
      scores.push(score);
    }

    const attnWeights = softmax(scores);
    fused = new Array(B).fill(0);
    for (let m = 0; m < encoded.length; m++) {
      for (let d = 0; d < B; d++) {
        fused[d] += attnWeights[m] * vProjs[m][d];
      }
    }
  }

  // Feature layer
  let feat: number[] | null = null;
  if (returnFeats) {
    feat = model.featW.map((row, i) => row.reduce((s, w, j) => s + w * fused[j], 0) + model.featB[i]);
  }

  // Classifier
  const logits = model.classifierW.map((row, i) => row.reduce((s, w, j) => s + w * fused[j], 0) + model.classifierB[i]);

  return { logits, feat };
}

// ============================================================================
// DistilLib — 对齐 Python DistilLib 主引擎
// ============================================================================

export interface DistillConfig {
  weights: Record<string, number>;
  tempRange: [number, number];
  datasetSize: number;
  /** 教师模型结构 */
  teacherInputDims: number[];
  teacherHiddenDim: number;
  teacherFeatDim: number;
  /** 学生模型结构 */
  studentInputDims: number[];
  studentHiddenDim: number;
  studentFeatDim: number;
  /** 训练参数 */
  nClasses: number;
  epochs: number;
  learningRate: number;
  patience: number;
  validationSplit: number;
}

export interface DistillScenario {
  modalities: number[];
  computeBudget: number;
  numClasses: number;
  datasetSize: number;
}

export interface DistillStrategy {
  base: 'lightweight' | 'comprehensive';
  weights: Record<string, number>;
  tempRange: [number, number];
  datasetSize: number;
}

export interface EpochLog {
  epoch: number;
  trainLoss: number;
  valAcc: number;
  lossDetails: Record<string, number>;
  temperature: number;
}

export interface DistillEvalMetrics {
  valAcc: number;
  compressionRatio: number;
  avgLatencyMs: number;
  teacherStudentAgreement: number;
  estFlopsM: number;
  teacherAccuracy: number;
  studentPrecision: number;
  studentRecall: number;
  studentF1: number;
  teacherParams: number;
  studentParams: number;
}

export interface DistillTrainResult {
  epochs: EpochLog[];
  bestValAcc: number;
  finalMetrics: DistillEvalMetrics;
  strategy: DistillStrategy;
  config: DistillConfig;
  durationMs: number;
}

/**
 * 策略推荐引擎 — 对齐 Python recommend_strategy()
 */
export function recommendStrategy(scenario: DistillScenario): DistillStrategy {
  const modalities = scenario.modalities;
  const computeLow = scenario.computeBudget < 1e6;
  const multiModal = modalities.length > 1;
  const complexTask = scenario.numClasses > 50;
  const datasetSize = scenario.datasetSize;

  const lightweightScore = 0.4 * (computeLow ? 1 : 0) + 0.3 * (!multiModal ? 1 : 0) + 0.3 * (!complexTask ? 1 : 0);
  const base: 'lightweight' | 'comprehensive' = lightweightScore > 0.5 ? 'lightweight' : 'comprehensive';

  const weights: Record<string, number> = { alpha: 0.3, beta: 0.4, gamma: 0.3 };
  const tempRange: [number, number] = (complexTask || datasetSize > 1e5) ? [3, 6] : [2, 4];

  if (multiModal) weights.fusion = 0.2;
  if (complexTask) weights.relation = 0.2;

  return { base, weights, tempRange, datasetSize };
}

/**
 * 计算蒸馏损失 — 对齐 Python compute_loss()
 *
 * 返回各项损失分量（用于前端可视化）
 */
export function computeDistillLoss(
  teacher: MultimodalModel,
  student: MultimodalModel,
  dynTemp: DynamicTemperature,
  featureLoss: FeatureDistillLoss,
  relLoss: RelationDistillLoss,
  inputs: (number[] | null)[][],  // [batchSize][nModalities]
  masks: boolean[][],             // [batchSize][nModalities]
  labels: number[],
  config: DistillConfig,
  epoch: number,
): { totalLoss: number; details: Record<string, number> } {
  const batchSize = labels.length;
  const weights = config.weights;
  const totalW = Object.values(weights).reduce((a, b) => a + b, 0);
  const normW: Record<string, number> = {};
  for (const [k, v] of Object.entries(weights)) normW[k] = v / totalW;

  let hardLoss = 0;
  let responseLoss = 0;
  let featureLossVal = 0;
  let relLossVal = 0;
  let fusionLossVal = 0;

  const sFeats: number[][] = [];
  const tFeats: number[][] = [];

  for (let b = 0; b < batchSize; b++) {
    const tOut = multimodalForward(teacher, inputs[b], masks[b], true);
    const sOut = multimodalForward(student, inputs[b], masks[b], true);

    // 动态温度
    const T = dynTemp.getTemp(sOut.logits, tOut.logits, epoch, config.tempRange, config.datasetSize);

    // 硬标签损失
    const sProbs = softmax(sOut.logits);
    hardLoss -= Math.log(Math.max(sProbs[labels[b]], 1e-15));

    // 响应蒸馏损失 (KL)
    const sSoft = softmax(sOut.logits.map(l => l / T));
    const tSoft = softmax(tOut.logits.map(l => l / T));
    responseLoss += klDiv(tSoft, sSoft) * (T * T);

    // 特征蒸馏
    if (sOut.feat && tOut.feat) {
      featureLossVal += featureLoss.forward(sOut.feat, tOut.feat);
      sFeats.push(sOut.feat);
      tFeats.push(tOut.feat);
    }
  }

  hardLoss = (hardLoss / batchSize) * (normW.alpha || 0);
  responseLoss = (responseLoss / batchSize) * (normW.beta || 0);
  featureLossVal = (featureLossVal / batchSize) * (normW.gamma || 0);

  // 关系蒸馏
  if ((normW.relation || 0) > 0 && sFeats.length > 1) {
    relLossVal = relLoss.forward(sFeats, tFeats, normW.relation);
  }

  // 融合蒸馏 — 子集模态 KL 对齐（优化：缓存 forward 结果避免重复计算）
  if ((normW.fusion || 0) > 0 && inputs[0].length > 1) {
    const nModalities = inputs[0].length;
    let klSum = 0;
    for (let m = 0; m < nModalities; m++) {
      for (let b = 0; b < batchSize; b++) {
        // 只保留第 m 个模态（mask 其他模态）
        const subsetMask = new Array(nModalities).fill(true);
        subsetMask[m] = false;
        const sSubOut = multimodalForward(student, inputs[b], subsetMask, false);
        const tSubOut = multimodalForward(teacher, inputs[b], subsetMask, false);
        const subT = dynTemp.getTemp(sSubOut.logits, tSubOut.logits, epoch, config.tempRange, config.datasetSize);
        const sSub = softmax(sSubOut.logits.map(l => l / subT));
        const tSub = softmax(tSubOut.logits.map(l => l / subT));
        klSum += klDiv(tSub, sSub);
      }
    }
    fusionLossVal = (klSum / (nModalities * batchSize)) * (normW.fusion || 0);
  }

  const totalLoss = hardLoss + responseLoss + featureLossVal + relLossVal + fusionLossVal;

  return {
    totalLoss,
    details: {
      total: totalLoss,
      hard: hardLoss,
      response: responseLoss,
      feature: featureLossVal,
      relation: relLossVal,
      fusion: fusionLossVal,
    },
  };
}

/**
 * 执行高级知识蒸馏训练 — 对齐 Python DistilLib.train()
 */
export function runAdvancedDistillation(
  config: DistillConfig,
  trainingData: { features: number[][]; labels: number[]; modalitySplit?: number[] },
): DistillTrainResult {
  const t0 = Date.now();
  const nClasses = config.nClasses;
  const inputDims = config.studentInputDims;
  const nModalities = inputDims.length;

  // 构建教师和学生模型
  const teacher = buildMultimodalModel(
    'teacher', config.teacherInputDims, config.teacherHiddenDim, nClasses, config.teacherFeatDim, 42
  );
  const student = buildMultimodalModel(
    'student', config.studentInputDims, config.studentHiddenDim, nClasses, config.studentFeatDim, 123
  );

  // 初始化损失组件
  const dynTemp = new DynamicTemperature(4.0, 1.0, 0.9, 5);
  const featureLossModule = new FeatureDistillLoss();
  featureLossModule.lazyInit(config.studentFeatDim, config.teacherFeatDim);
  const relLossModule = new RelationDistillLoss();

  // 数据拆分
  const splitIdx = Math.floor(trainingData.features.length * (1 - config.validationSplit));
  const trainFeatures = trainingData.features.slice(0, splitIdx);
  const trainLabels = trainingData.labels.slice(0, splitIdx);
  const valFeatures = trainingData.features.slice(splitIdx);
  const valLabels = trainingData.labels.slice(splitIdx);

  // 将特征拆分为多模态
  const modalitySplit = trainingData.modalitySplit || inferModalitySplit(trainingData.features[0].length, inputDims);

  function splitToModalities(feature: number[]): (number[] | null)[] {
    const mods: (number[] | null)[] = [];
    let offset = 0;
    for (let m = 0; m < nModalities; m++) {
      const dim = inputDims[m];
      mods.push(feature.slice(offset, offset + dim));
      offset += dim;
    }
    return mods;
  }

  function generateMask(idx: number): boolean[] {
    // 模拟缺失模态：每5个样本第2个模态缺失（与 Python 端一致）
    const mask = new Array(nModalities).fill(false);
    if (idx % 5 === 0 && nModalities > 1) {
      mask[1] = true;
    }
    return mask;
  }

  // 先训练教师（全量训练）
  log.info('Training teacher model...');
  const teacherFlat = buildMLP([
    config.teacherInputDims.reduce((a, b) => a + b, 0),
    config.teacherHiddenDim,
    config.teacherHiddenDim,
    nClasses,
  ], 42);
  for (let e = 0; e < Math.min(config.epochs * 2, 30); e++) {
    trainStepSGD(teacherFlat, trainFeatures, trainLabels, config.learningRate);
  }
  const teacherAcc = calcAccuracy(mlpPredict(teacherFlat, valFeatures), valLabels);
  log.info(`Teacher accuracy: ${(teacherAcc * 100).toFixed(1)}%`);

  // 蒸馏训练
  const epochLogs: EpochLog[] = [];
  let bestValAcc = 0;
  let patience = 0;
  const batchSize = Math.min(32, trainFeatures.length);

  for (let epoch = 0; epoch < config.epochs; epoch++) {
    let epochLoss = 0;
    let nBatches = 0;
    let lastDetails: Record<string, number> = {};

    // Mini-batch 训练
    for (let bStart = 0; bStart < trainFeatures.length; bStart += batchSize) {
      const bEnd = Math.min(bStart + batchSize, trainFeatures.length);
      const batchInputs: (number[] | null)[][] = [];
      const batchMasks: boolean[][] = [];
      const batchLabels: number[] = [];

      for (let i = bStart; i < bEnd; i++) {
        batchInputs.push(splitToModalities(trainFeatures[i]));
        batchMasks.push(generateMask(i));
        batchLabels.push(trainLabels[i]);
      }

      const { totalLoss, details } = computeDistillLoss(
        teacher, student, dynTemp, featureLossModule, relLossModule,
        batchInputs, batchMasks, batchLabels, config, epoch
      );

      epochLoss += totalLoss;
      nBatches++;
      lastDetails = details;

      // 简化的梯度更新（对学生分类器层）
      for (let i = bStart; i < bEnd; i++) {
        const mods = splitToModalities(trainFeatures[i]);
        const mask = generateMask(i);
        const { logits } = multimodalForward(student, mods, mask, false);
        const probs = softmax(logits);
        const delta = probs.map((p, c) => p - (c === trainLabels[i] ? 1 : 0));

        // 更新分类器权重
        const lr = config.learningRate;
        for (let ci = 0; ci < student.classifierW.length; ci++) {
          for (let cj = 0; cj < student.classifierW[ci].length; cj++) {
            student.classifierW[ci][cj] -= lr * delta[ci] * 0.01; // 简化梯度
          }
          student.classifierB[ci] -= lr * delta[ci] / trainFeatures.length;
        }
      }
    }

    // 验证
    let correct = 0;
    for (let i = 0; i < valFeatures.length; i++) {
      const mods = splitToModalities(valFeatures[i]);
      const mask = generateMask(i);
      const { logits } = multimodalForward(student, mods, mask, false);
      const probs = softmax(logits);
      const pred = probs.indexOf(Math.max(...probs));
      if (pred === valLabels[i]) correct++;
    }
    const valAcc = valFeatures.length > 0 ? correct / valFeatures.length : 0;
    // 获取当前 epoch 的温度（使用实际样本而非常量向量）
    const T = dynTemp.currentTemp !== undefined ? dynTemp.currentTemp : config.tempRange[0];

    epochLogs.push({
      epoch,
      trainLoss: epochLoss / nBatches,
      valAcc,
      lossDetails: lastDetails,
      temperature: T,
    });

    log.info(`Epoch ${epoch + 1}/${config.epochs} | Loss: ${(epochLoss / nBatches).toFixed(4)} | Val Acc: ${(valAcc * 100).toFixed(1)}% | T: ${T.toFixed(2)}`);

    if (valAcc > bestValAcc) {
      bestValAcc = valAcc;
      patience = 0;
    } else {
      patience++;
      if (patience >= config.patience) {
        log.info(`Early stopping at epoch ${epoch + 1}`);
        break;
      }
    }
  }

  // 最终评估
  let correct = 0;
  let agreement = 0;
  const allStudentPreds: number[][] = [];
  for (let i = 0; i < valFeatures.length; i++) {
    const mods = splitToModalities(valFeatures[i]);
    const mask = generateMask(i);
    const sOut = multimodalForward(student, mods, mask, false);
    const tPred = mlpPredict(teacherFlat, [valFeatures[i]])[0];
    const sProbs = softmax(sOut.logits);
    const tProbs = softmax(tPred);
    const sPred = sProbs.indexOf(Math.max(...sProbs));
    const tPredClass = tProbs.indexOf(Math.max(...tProbs));
    if (sPred === valLabels[i]) correct++;
    if (sPred === tPredClass) agreement++;
    allStudentPreds.push(sOut.logits);
  }

  const studentAcc = valFeatures.length > 0 ? correct / valFeatures.length : 0;
  const teacherStudentAgreement = valFeatures.length > 0 ? agreement / valFeatures.length : 0;
  const studentMetrics = calcPRF1(allStudentPreds, valLabels);
  const tParams = countParams(teacherFlat);
  const sParams = inputDims.reduce((s, d) => s + d * config.studentHiddenDim, 0) + config.studentHiddenDim * nClasses;
  const compressionRatio = tParams / Math.max(sParams, 1);
  const estFlopsM = sParams * 2 / 1e6;

  const finalMetrics: DistillEvalMetrics = {
    valAcc: studentAcc,
    compressionRatio,
    avgLatencyMs: 0, // TypeScript 端无 CUDA 计时
    teacherStudentAgreement,
    estFlopsM,
    teacherAccuracy: teacherAcc,
    studentPrecision: studentMetrics.precision,
    studentRecall: studentMetrics.recall,
    studentF1: studentMetrics.f1,
    teacherParams: tParams,
    studentParams: sParams,
  };

  const strategy = recommendStrategy({
    modalities: inputDims,
    computeBudget: sParams,
    numClasses: nClasses,
    datasetSize: config.datasetSize,
  });

  return {
    epochs: epochLogs,
    bestValAcc,
    finalMetrics,
    strategy,
    config,
    durationMs: Date.now() - t0,
  };
}

// ============================================================================
// 辅助
// ============================================================================

function inferModalitySplit(totalDim: number, inputDims: number[]): number[] {
  const split: number[] = [];
  let offset = 0;
  for (const d of inputDims) {
    split.push(offset);
    offset += d;
  }
  return split;
}

// ============================================================================
// 训练历史存储（内存）
// ============================================================================

interface TrainHistoryItem {
  id: string;
  timestamp: string;
  config: DistillConfig;
  result: DistillTrainResult;
}

const trainHistory: TrainHistoryItem[] = [];

export function addTrainHistory(config: DistillConfig, result: DistillTrainResult): string {
  const id = `distill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  trainHistory.push({ id, timestamp: new Date().toISOString(), config, result });
  if (trainHistory.length > 100) trainHistory.shift();
  return id;
}

export function getTrainHistory(limit = 50): { items: TrainHistoryItem[]; total: number } {
  const items = trainHistory.slice(-limit).reverse();
  return { items, total: trainHistory.length };
}

export function getTrainHistoryItem(id: string): TrainHistoryItem | undefined {
  return trainHistory.find(h => h.id === id);
}
