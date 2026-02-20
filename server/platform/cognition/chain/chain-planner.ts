/**
 * ============================================================================
 * 链式认知规划器 — ChainPlanner
 * ============================================================================
 *
 * 职责：
 *   1. 将复杂诊断任务分解为有序的认知步骤链
 *   2. 依赖分析（步骤间的数据依赖和前置条件）
 *   3. 并行度优化（无依赖步骤可并行执行）
 *   4. 资源预估（每步所需的计算/数据/时间）
 *   5. 降级策略（某步失败时的回退路径）
 */

// ============================================================================
// 规划类型
// ============================================================================

export interface ChainStep {
  id: string;
  name: string;
  type: 'perception' | 'reasoning' | 'fusion' | 'decision' | 'tool_call' | 'grok_query' | 'worldmodel_predict' | 'guardrail_check';
  description: string;
  dependencies: string[]; // 依赖的步骤 ID
  inputs: Record<string, string>; // 输入参数名 → 来源步骤ID.输出名
  expectedOutputs: string[];
  estimatedDurationMs: number;
  priority: 'critical' | 'high' | 'normal' | 'low';
  fallback: {
    strategy: 'skip' | 'retry' | 'alternative' | 'abort';
    maxRetries?: number;
    alternativeStepId?: string;
  };
  config: Record<string, unknown>;
}

export interface ChainPlan {
  id: string;
  name: string;
  description: string;
  trigger: {
    type: 'anomaly' | 'scheduled' | 'manual' | 'chain' | 'guardrail_feedback';
    context: Record<string, unknown>;
  };
  steps: ChainStep[];
  executionOrder: string[][]; // 分层执行顺序，每层内可并行
  estimatedTotalMs: number;
  parallelism: number; // 最大并行度
  createdAt: number;
}

export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  applicableConditions: string[];
  steps: Omit<ChainStep, 'id'>[];
  tags: string[];
}

// ============================================================================
// 链式认知规划器
// ============================================================================

export class ChainPlanner {
  private templates = new Map<string, PlanTemplate>();

  constructor() {
    this.registerBuiltinTemplates();
  }

  /**
   * 创建执行计划
   */
  createPlan(params: {
    name: string;
    description: string;
    trigger: ChainPlan['trigger'];
    steps: ChainStep[];
  }): ChainPlan {
    // 拓扑排序确定执行顺序
    const executionOrder = this.topologicalSort(params.steps);

    // 计算预估总时间（考虑并行）
    let estimatedTotalMs = 0;
    let maxParallelism = 0;
    for (const layer of executionOrder) {
      const layerSteps = params.steps.filter(s => layer.includes(s.id));
      const layerMaxDuration = Math.max(...layerSteps.map(s => s.estimatedDurationMs));
      estimatedTotalMs += layerMaxDuration;
      maxParallelism = Math.max(maxParallelism, layer.length);
    }

    return {
      id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: params.name,
      description: params.description,
      trigger: params.trigger,
      steps: params.steps,
      executionOrder,
      estimatedTotalMs,
      parallelism: maxParallelism,
      createdAt: Date.now(),
    };
  }

  /**
   * 从模板创建计划
   */
  createFromTemplate(
    templateId: string,
    trigger: ChainPlan['trigger'],
    overrides?: Partial<Record<string, Partial<ChainStep>>>,
  ): ChainPlan | null {
    const template = this.templates.get(templateId);
    if (!template) return null;

    const steps: ChainStep[] = template.steps.map((s, i) => {
      const id = `step_${i}_${s.type}`;
      const step: ChainStep = { ...s, id };
      const override = overrides?.[id];
      if (override) {
        Object.assign(step, override);
      }
      return step;
    });

    return this.createPlan({
      name: template.name,
      description: template.description,
      trigger,
      steps,
    });
  }

  /**
   * 优化计划（合并可并行步骤、移除冗余）
   */
  optimize(plan: ChainPlan): ChainPlan {
    const optimized = { ...plan };

    // 移除无输出消费者的非关键步骤
    const consumed = new Set<string>();
    for (const step of plan.steps) {
      for (const dep of step.dependencies) {
        consumed.add(dep);
      }
    }

    optimized.steps = plan.steps.filter(s =>
      s.priority === 'critical' || consumed.has(s.id) || s.type === 'guardrail_check',
    );

    // 重新计算执行顺序
    optimized.executionOrder = this.topologicalSort(optimized.steps);

    // 重新计算预估时间
    let totalMs = 0;
    for (const layer of optimized.executionOrder) {
      const layerSteps = optimized.steps.filter(s => layer.includes(s.id));
      totalMs += Math.max(...layerSteps.map(s => s.estimatedDurationMs), 0);
    }
    optimized.estimatedTotalMs = totalMs;

    return optimized;
  }

  /**
   * 验证计划合法性
   */
  validate(plan: ChainPlan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const stepIds = new Set(plan.steps.map(s => s.id));

    for (const step of plan.steps) {
      // 检查依赖是否存在
      for (const dep of step.dependencies) {
        if (!stepIds.has(dep)) {
          errors.push(`步骤 ${step.id} 依赖不存在的步骤 ${dep}`);
        }
      }

      // 检查循环依赖
      if (this.hasCycle(step.id, plan.steps, new Set())) {
        errors.push(`步骤 ${step.id} 存在循环依赖`);
      }

      // 检查 fallback 引用
      if (step.fallback.strategy === 'alternative' && step.fallback.alternativeStepId) {
        if (!stepIds.has(step.fallback.alternativeStepId)) {
          errors.push(`步骤 ${step.id} 的替代步骤 ${step.fallback.alternativeStepId} 不存在`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 注册模板
   */
  registerTemplate(template: PlanTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * 列出模板
   */
  listTemplates(conditionProfile?: string): PlanTemplate[] {
    let results = Array.from(this.templates.values());
    if (conditionProfile) {
      results = results.filter(t =>
        t.applicableConditions.includes('*') || t.applicableConditions.includes(conditionProfile),
      );
    }
    return results;
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  /**
   * 拓扑排序（分层）
   */
  private topologicalSort(steps: ChainStep[]): string[][] {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const step of steps) {
      inDegree.set(step.id, step.dependencies.length);
      for (const dep of step.dependencies) {
        const list = adj.get(dep) || [];
        list.push(step.id);
        adj.set(dep, list);
      }
    }

    const layers: string[][] = [];
    let remaining = new Set(steps.map(s => s.id));

    while (remaining.size > 0) {
      const layer: string[] = [];
      for (const id of remaining) {
        if ((inDegree.get(id) || 0) <= 0) {
          layer.push(id);
        }
      }

      if (layer.length === 0) {
        // 循环依赖，强制取一个
        layer.push(remaining.values().next().value!);
      }

      layers.push(layer);

      for (const id of layer) {
        remaining.delete(id);
        for (const next of adj.get(id) || []) {
          inDegree.set(next, (inDegree.get(next) || 1) - 1);
        }
      }
    }

    return layers;
  }

  /**
   * 循环检测
   */
  private hasCycle(stepId: string, steps: ChainStep[], visited: Set<string>): boolean {
    if (visited.has(stepId)) return true;
    visited.add(stepId);

    const step = steps.find(s => s.id === stepId);
    if (!step) return false;

    for (const dep of step.dependencies) {
      if (this.hasCycle(dep, steps, new Set(visited))) return true;
    }

    return false;
  }

  /**
   * 注册内置模板
   */
  private registerBuiltinTemplates(): void {
    // 通用设备诊断模板
    this.templates.set('equipment_diagnosis', {
      id: 'equipment_diagnosis',
      name: '通用设备诊断',
      description: '感知→推理→融合→决策的标准四维诊断链',
      applicableConditions: ['*'],
      steps: [
        {
          name: '数据采集',
          type: 'perception',
          description: '从传感器采集最新数据并编码为状态向量',
          dependencies: [],
          inputs: {},
          expectedOutputs: ['stateVector'],
          estimatedDurationMs: 500,
          priority: 'critical',
          fallback: { strategy: 'retry', maxRetries: 3 },
          config: {},
        },
        {
          name: 'WorldModel 预测',
          type: 'worldmodel_predict',
          description: '基于当前状态预测未来趋势',
          dependencies: [],
          inputs: { stateVector: 'step_0_perception.stateVector' },
          expectedOutputs: ['predictions', 'anomalyProbability'],
          estimatedDurationMs: 300,
          priority: 'high',
          fallback: { strategy: 'skip' },
          config: { horizonMinutes: 60 },
        },
        {
          name: 'Grok 推理',
          type: 'grok_query',
          description: '调用 Grok 进行深度推理分析',
          dependencies: [],
          inputs: { stateVector: 'step_0_perception.stateVector', predictions: 'step_1_worldmodel_predict.predictions' },
          expectedOutputs: ['reasoningChain', 'diagnosis'],
          estimatedDurationMs: 2000,
          priority: 'high',
          fallback: { strategy: 'alternative' },
          config: { maxSteps: 8 },
        },
        {
          name: '多维融合',
          type: 'fusion',
          description: '融合四维处理结果',
          dependencies: [],
          inputs: {},
          expectedOutputs: ['fusedResult'],
          estimatedDurationMs: 200,
          priority: 'critical',
          fallback: { strategy: 'retry', maxRetries: 2 },
          config: {},
        },
        {
          name: '护栏检查',
          type: 'guardrail_check',
          description: '安全/健康/高效三类护栏检查',
          dependencies: [],
          inputs: { fusedResult: 'step_3_fusion.fusedResult' },
          expectedOutputs: ['guardrailResult', 'actions'],
          estimatedDurationMs: 100,
          priority: 'critical',
          fallback: { strategy: 'abort' },
          config: {},
        },
        {
          name: '决策输出',
          type: 'decision',
          description: '生成最终诊断报告和行动建议',
          dependencies: [],
          inputs: {},
          expectedOutputs: ['report', 'actions'],
          estimatedDurationMs: 300,
          priority: 'critical',
          fallback: { strategy: 'retry', maxRetries: 1 },
          config: {},
        },
      ],
      tags: ['diagnosis', 'standard'],
    });

    // 异常快速响应模板
    this.templates.set('anomaly_fast_response', {
      id: 'anomaly_fast_response',
      name: '异常快速响应',
      description: '跳过非关键步骤，快速输出安全决策',
      applicableConditions: ['*'],
      steps: [
        {
          name: '快速感知',
          type: 'perception',
          description: '快速采集关键传感器数据',
          dependencies: [],
          inputs: {},
          expectedOutputs: ['stateVector'],
          estimatedDurationMs: 200,
          priority: 'critical',
          fallback: { strategy: 'abort' },
          config: { fastMode: true },
        },
        {
          name: '护栏检查',
          type: 'guardrail_check',
          description: '立即执行安全护栏检查',
          dependencies: [],
          inputs: { stateVector: 'step_0_perception.stateVector' },
          expectedOutputs: ['guardrailResult', 'emergencyActions'],
          estimatedDurationMs: 50,
          priority: 'critical',
          fallback: { strategy: 'abort' },
          config: { safetyOnly: true },
        },
        {
          name: '紧急决策',
          type: 'decision',
          description: '输出紧急行动指令',
          dependencies: [],
          inputs: {},
          expectedOutputs: ['emergencyReport'],
          estimatedDurationMs: 100,
          priority: 'critical',
          fallback: { strategy: 'abort' },
          config: {},
        },
      ],
      tags: ['anomaly', 'fast', 'safety'],
    });
  }
}
