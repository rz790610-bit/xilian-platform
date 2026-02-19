/**
 * ============================================================================
 * 认知状态机 — CognitionStateMachine
 * ============================================================================
 *
 * 管理单次认知活动的状态流转。
 *
 * 状态图：
 *   idle → stimulus_received → preprocessing → dimensions_running
 *     → cross_validating → converging → action_executing
 *     → narrative_generating → completed
 *
 * 异常路径：
 *   任何状态 → failed（ERROR 事件）
 *   任何状态 → timeout（TIMEOUT 事件）
 *   completed/failed/timeout → idle（RESET 事件）
 *
 * 设计原则：
 *   - 纯状态机，不包含业务逻辑
 *   - 所有转换都有明确的守卫条件
 *   - 状态变更通过回调通知外部
 */

import type { CognitionState, CognitionTransition } from '../types';

// ============================================================================
// 状态转换表
// ============================================================================

/** 合法的状态转换定义 */
interface TransitionRule {
  from: CognitionState | CognitionState[];
  event: CognitionTransition;
  to: CognitionState;
}

const TRANSITION_RULES: TransitionRule[] = [
  // 正常路径
  { from: 'idle',                  event: 'STIMULUS_ARRIVED',      to: 'stimulus_received' },
  { from: 'stimulus_received',     event: 'PREPROCESS_DONE',       to: 'preprocessing' },
  { from: 'preprocessing',         event: 'DIMENSIONS_STARTED',    to: 'dimensions_running' },
  { from: 'dimensions_running',    event: 'DIMENSIONS_DONE',       to: 'cross_validating' },
  { from: 'cross_validating',      event: 'CROSS_VALIDATION_DONE', to: 'converging' },
  { from: 'converging',            event: 'CONVERGENCE_DONE',      to: 'action_executing' },
  { from: 'action_executing',      event: 'ACTION_DONE',           to: 'narrative_generating' },
  { from: 'narrative_generating',  event: 'NARRATIVE_DONE',        to: 'completed' },

  // 异常路径 — 任何非终态都可以转到 failed/timeout
  {
    from: [
      'idle', 'stimulus_received', 'preprocessing', 'dimensions_running',
      'cross_validating', 'converging', 'action_executing', 'narrative_generating',
    ],
    event: 'ERROR',
    to: 'failed',
  },
  {
    from: [
      'stimulus_received', 'preprocessing', 'dimensions_running',
      'cross_validating', 'converging', 'action_executing', 'narrative_generating',
    ],
    event: 'TIMEOUT',
    to: 'timeout',
  },

  // 重置 — 终态回到 idle
  { from: ['completed', 'failed', 'timeout'], event: 'RESET', to: 'idle' },
];

// 预编译转换查找表：Map<`${from}:${event}`, to>
const transitionLookup = new Map<string, CognitionState>();
for (const rule of TRANSITION_RULES) {
  const fromStates = Array.isArray(rule.from) ? rule.from : [rule.from];
  for (const from of fromStates) {
    transitionLookup.set(`${from}:${rule.event}`, rule.to);
  }
}

// ============================================================================
// 状态变更回调
// ============================================================================

export interface StateChangeCallback {
  (prev: CognitionState, next: CognitionState, event: CognitionTransition): void;
}

// ============================================================================
// 状态机实现
// ============================================================================

export class CognitionStateMachine {
  private currentState: CognitionState;
  private readonly history: Array<{
    from: CognitionState;
    to: CognitionState;
    event: CognitionTransition;
    timestamp: Date;
  }>;
  private readonly callbacks: StateChangeCallback[];

  constructor(initialState: CognitionState = 'idle') {
    this.currentState = initialState;
    this.history = [];
    this.callbacks = [];
  }

  /** 获取当前状态 */
  getState(): CognitionState {
    return this.currentState;
  }

  /** 获取状态变更历史 */
  getHistory(): ReadonlyArray<{
    from: CognitionState;
    to: CognitionState;
    event: CognitionTransition;
    timestamp: Date;
  }> {
    return this.history;
  }

  /** 注册状态变更回调 */
  onStateChange(callback: StateChangeCallback): () => void {
    this.callbacks.push(callback);
    // 返回取消注册函数
    return () => {
      const idx = this.callbacks.indexOf(callback);
      if (idx >= 0) this.callbacks.splice(idx, 1);
    };
  }

  /**
   * 触发状态转换
   *
   * @param event 转换事件
   * @returns 转换是否成功
   * @throws 如果转换不合法，抛出错误
   */
  transition(event: CognitionTransition): boolean {
    const key = `${this.currentState}:${event}`;
    const nextState = transitionLookup.get(key);

    if (nextState === undefined) {
      const allowed = this.getAllowedTransitions();
      throw new Error(
        `Invalid transition: cannot apply event '${event}' in state '${this.currentState}'. ` +
        `Allowed events: [${allowed.map(t => t.event).join(', ')}]`,
      );
    }

    const prevState = this.currentState;
    this.currentState = nextState;

    this.history.push({
      from: prevState,
      to: nextState,
      event,
      timestamp: new Date(),
    });

    // 通知所有回调
    for (const cb of this.callbacks) {
      try {
        cb(prevState, nextState, event);
      } catch {
        // 回调异常不影响状态机运行
      }
    }

    return true;
  }

  /**
   * 尝试触发状态转换（不抛出异常）
   *
   * @returns 转换是否成功
   */
  tryTransition(event: CognitionTransition): boolean {
    const key = `${this.currentState}:${event}`;
    const nextState = transitionLookup.get(key);
    if (nextState === undefined) return false;

    const prevState = this.currentState;
    this.currentState = nextState;

    this.history.push({
      from: prevState,
      to: nextState,
      event,
      timestamp: new Date(),
    });

    for (const cb of this.callbacks) {
      try {
        cb(prevState, nextState, event);
      } catch {
        // 忽略回调异常
      }
    }

    return true;
  }

  /**
   * 检查某个事件在当前状态下是否合法
   */
  canTransition(event: CognitionTransition): boolean {
    return transitionLookup.has(`${this.currentState}:${event}`);
  }

  /**
   * 获取当前状态下所有合法的转换
   */
  getAllowedTransitions(): Array<{ event: CognitionTransition; to: CognitionState }> {
    const allowed: Array<{ event: CognitionTransition; to: CognitionState }> = [];
    for (const [key, to] of transitionLookup.entries()) {
      const [from, event] = key.split(':') as [CognitionState, CognitionTransition];
      if (from === this.currentState) {
        allowed.push({ event, to });
      }
    }
    return allowed;
  }

  /** 是否处于终态 */
  isTerminal(): boolean {
    return this.currentState === 'completed' ||
           this.currentState === 'failed' ||
           this.currentState === 'timeout';
  }

  /** 是否处于运行态 */
  isRunning(): boolean {
    return !this.isTerminal() && this.currentState !== 'idle';
  }

  /** 重置到 idle */
  reset(): void {
    if (this.isTerminal()) {
      this.transition('RESET');
    }
  }

  /** 获取状态持续时间（毫秒） */
  getStateDurationMs(): number {
    if (this.history.length === 0) return 0;
    const lastEntry = this.history[this.history.length - 1];
    return Date.now() - lastEntry.timestamp.getTime();
  }

  /** 获取总运行时间（毫秒）— 从第一次离开 idle 到现在 */
  getTotalDurationMs(): number {
    if (this.history.length === 0) return 0;
    const firstEntry = this.history[0];
    return Date.now() - firstEntry.timestamp.getTime();
  }

  /** 序列化（用于持久化和 API 返回） */
  toJSON(): {
    currentState: CognitionState;
    isTerminal: boolean;
    isRunning: boolean;
    historyLength: number;
    lastTransition: { from: CognitionState; to: CognitionState; event: CognitionTransition; timestamp: Date } | null;
  } {
    return {
      currentState: this.currentState,
      isTerminal: this.isTerminal(),
      isRunning: this.isRunning(),
      historyLength: this.history.length,
      lastTransition: this.history.length > 0 ? this.history[this.history.length - 1] : null,
    };
  }
}
