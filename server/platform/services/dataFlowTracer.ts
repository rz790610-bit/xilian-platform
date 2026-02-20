/**
 * ============================================================================
 * L2 自省层 — 数据流追踪器 (DataFlowTracer)
 * ============================================================================
 * 
 * v3.1 自适应智能架构 · Alpha 阶段 · A-06
 * 
 * 职责：
 *   1. 挂载 EventBus 全局订阅，自动追踪模块间数据流
 *   2. 基于 TOPICS 和 ModuleRegistry 构建 topic→module 映射
 *   3. 记录数据流边（source→target），统计消息计数和延迟
 *   4. 检测死端（有入边但无出边的模块）和断裂链路
 *   5. 提供数据流图谱 — 供 Grok 平台 Agent 和前端看板消费
 * 
 * 设计原则（FSD 实践）：
 *   - 影子模式：仅观察不干预，不影响正常数据流
 *   - 滑动窗口：保留最近 1 小时的数据流统计
 *   - 低开销：使用内存 Map，不写数据库
 * 
 * 架构位置: server/platform/services/dataFlowTracer.ts
 * 依赖:
 *   - server/services/eventBus.service.ts (EventBus, TOPICS)
 *   - server/core/registries/module.registry.ts (ModuleRegistry)
 */

import { createModuleLogger } from '../../core/logger';
import { TOPICS } from '../../services/eventBus.service';
import type { Event } from '../../services/eventBus.service';

const log = createModuleLogger('data-flow-tracer');

// ============ 类型定义 ============

/** 数据流边 */
export interface DataFlowEdge {
  /** 源模块 ID */
  source: string;
  /** 目标模块 ID */
  target: string;
  /** EventBus topic */
  topic: string;
  /** 消息计数 */
  count: number;
  /** 首次观察时间 */
  firstSeen: Date;
  /** 最近观察时间 */
  lastSeen: Date;
  /** 平均延迟 (ms) */
  avgLatencyMs: number;
  /** 最大延迟 (ms) */
  maxLatencyMs: number;
}

/** 数据流图谱 */
export interface DataFlowGraph {
  /** 所有数据流边 */
  edges: DataFlowEdge[];
  /** 死端模块（有入边但无出边） */
  deadEnds: string[];
  /** 孤立模块（既无入边也无出边） */
  isolated: string[];
  /** 活跃模块数 */
  activeModules: number;
  /** 总消息计数 */
  totalMessages: number;
  /** 统计时间窗口 */
  windowStart: Date;
  /** 统计时间 */
  timestamp: Date;
}

/** 数据流异常 */
export interface DataFlowAnomaly {
  type: 'dead_end' | 'high_latency' | 'message_spike' | 'silent_module';
  moduleId: string;
  description: string;
  severity: 'info' | 'warning' | 'error';
  detectedAt: Date;
}

// ============ Topic → Module 映射规则 ============

/**
 * 从 TOPICS 常量和 topic 字符串推断模块 ID
 * 
 * 规则：
 *   - 'device.status' → source: 'device'
 *   - 'sensor.reading' → source: 'device' (传感器属于设备模块)
 *   - 'diagnosis.completed' → source: 'fusionDiagnosis'
 *   - 'saga.started' → source: 'saga'
 *   - 'outbox.event.published' → source: 'outbox'
 */
const TOPIC_MODULE_MAP: Record<string, string> = {
  'device': 'device',
  'sensor': 'device',
  'anomaly': 'alert',
  'diagnosis': 'fusionDiagnosis',
  'system': 'monitoring',
  'workflow': 'pipeline',
  'outbox': 'outbox',
  'saga': 'saga',
  'sampling': 'adaptiveSampling',
  'dedup': 'deduplication',
  'replica': 'database',
  'graph': 'kgOrchestrator',
};

/**
 * 推断事件的目标模块
 * 基于 topic 语义和事件类型推断消费者
 */
// P2-DFT1: TODO 硬编码的 Topic-目标模块映射应迁移到注册中心
// 当前新增 Topic 必须手动修改此文件，建议改为动态注册机制
const TOPIC_TARGET_MAP: Record<string, string[]> = {
  'device.status': ['monitoring', 'alert'],
  'device.heartbeat': ['monitoring'],
  'device.error': ['alert', 'fusionDiagnosis'],
  'sensor.reading': ['pipeline', 'monitoring', 'adaptiveSampling'],
  'sensor.batch': ['pipeline', 'dataCollection'],
  'sensor.error': ['alert'],
  'anomaly.detected': ['alert', 'fusionDiagnosis', 'grokAgent'],
  'anomaly.resolved': ['alert'],
  'diagnosis.started': ['monitoring'],
  'diagnosis.completed': ['knowledgeBase', 'monitoring'],
  'diagnosis.failed': ['alert'],
  'system.alert': ['monitoring', 'alert'],
  'system.metric': ['monitoring'],
  'workflow.triggered': ['monitoring'],
  'workflow.completed': ['monitoring'],
  'outbox.event.published': ['eventBus'],
  'outbox.event.failed': ['alert'],
  'saga.started': ['monitoring'],
  'saga.completed': ['monitoring'],
  'saga.failed': ['alert'],
  'saga.compensated': ['monitoring'],
  'saga.dead_letter': ['alert'],
  'sampling.adjusted': ['monitoring'],
  'sampling.alert': ['alert'],
  'dedup.duplicate_detected': ['monitoring'],
  'replica.failover': ['alert', 'monitoring'],
  'replica.lag_warning': ['monitoring'],
  'graph.query.slow': ['monitoring'],
  'graph.index.rebuilt': ['monitoring'],
};

// ============ DataFlowTracer 类 ============

class DataFlowTracer {
  private edges = new Map<string, DataFlowEdge>();
  private anomalies: DataFlowAnomaly[] = [];
  private windowStart = new Date();
  private initialized = false;
  private unsubscribe: (() => void) | null = null;

  // 滑动窗口配置
  private readonly WINDOW_DURATION_MS = 60 * 60 * 1000; // 1 小时
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟清理一次
  private cleanupTimer: NodeJS.Timeout | null = null;

  /** 初始化：挂载 EventBus 全局订阅 */
  async initialize(): Promise<void> {
    if (this.initialized) {
      log.warn('[DataFlowTracer] Already initialized');
      return;
    }

    try {
      // 动态导入 EventBus（避免循环依赖）
      const { eventBus } = await import('../../services/eventBus.service');

      // 订阅所有事件
      // P2-A06: 消除 any，直接使用 Event 类型
      this.unsubscribe = eventBus.subscribeAll(async (event: Event) => {
        this.processEvent(event);
      });

      // 启动定期清理
      this.cleanupTimer = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL_MS);

      this.initialized = true;
      log.info(`[DataFlowTracer] Initialized — monitoring ${Object.keys(TOPICS).length} topics`);
    } catch (err: unknown) {
      log.error('[DataFlowTracer] Initialization failed:', err instanceof Error ? err.message : String(err));
    }
  }

  /** 处理单个事件 */
  private processEvent(event: Event): void {
    const topic = event.topic || event.eventType || 'unknown';
    const topicPrefix = topic.split('.')[0];

    // 推断源模块
    // P2-A06: 使用类型守卫替代 any
    const metadata = (event as Event & { metadata?: { sourceModule?: string; targetModule?: string } }).metadata;
    const sourceModule = metadata?.sourceModule
      || TOPIC_MODULE_MAP[topicPrefix]
      || topicPrefix;

    // 推断目标模块（可能有多个）
    const targetModules = TOPIC_TARGET_MAP[topic]
      || [metadata?.targetModule || 'unknown'];

    // 计算延迟
    const eventTime = event.timestamp ? new Date(event.timestamp).getTime() : Date.now();
    const latencyMs = Math.max(0, Date.now() - eventTime);

    // 为每个目标模块记录一条边
    for (const target of targetModules) {
      this.recordEdge(sourceModule, target, topic, latencyMs);
    }
  }

  /** 记录一条数据流边 */
  private recordEdge(source: string, target: string, topic: string, latencyMs: number): void {
    const key = `${source}→${target}:${topic}`;
    const existing = this.edges.get(key);

    if (existing) {
      existing.count++;
      existing.lastSeen = new Date();
      // 滑动平均延迟
      existing.avgLatencyMs = (existing.avgLatencyMs * (existing.count - 1) + latencyMs) / existing.count;
      existing.maxLatencyMs = Math.max(existing.maxLatencyMs, latencyMs);
    } else {
      this.edges.set(key, {
        source,
        target,
        topic,
        count: 1,
        firstSeen: new Date(),
        lastSeen: new Date(),
        avgLatencyMs: latencyMs,
        maxLatencyMs: latencyMs,
      });
    }

    // 高延迟检测
    if (latencyMs > 5000) {
      this.addAnomaly({
        type: 'high_latency',
        moduleId: target,
        description: `${source}→${target} via ${topic}: ${latencyMs}ms 延迟`,
        severity: latencyMs > 30000 ? 'error' : 'warning',
        detectedAt: new Date(),
      });
    }
  }

  /** 添加异常记录 */
  private addAnomaly(anomaly: DataFlowAnomaly): void {
    this.anomalies.push(anomaly);
    // 保留最近 100 条
    if (this.anomalies.length > 100) {
      this.anomalies = this.anomalies.slice(-100);
    }
    log.warn(`[DataFlowAnomaly] ${anomaly.type}: ${anomaly.description}`);
  }

  /** 清理过期数据 */
  private cleanup(): void {
    const cutoff = new Date(Date.now() - this.WINDOW_DURATION_MS);
    let removed = 0;

    for (const [key, edge] of Array.from(this.edges.entries())) {
      if (edge.lastSeen < cutoff) {
        this.edges.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      log.debug(`[DataFlowTracer] Cleaned up ${removed} stale edges`);
    }

    this.windowStart = cutoff;
  }

  /** 获取数据流图谱 */
  getFlowGraph(): DataFlowGraph {
    const edges = Array.from(this.edges.values());

    // 收集所有活跃模块
    const sources = new Set(edges.map(e => e.source));
    const targets = new Set(edges.map(e => e.target));
    const allActive = new Set([...Array.from(sources), ...Array.from(targets)]);

    // 死端：有入边但无出边
    const deadEnds = Array.from(targets).filter(t => !sources.has(t));

    // 孤立模块：从 ModuleRegistry 中找既不在 sources 也不在 targets 的
    let isolated: string[] = [];
    try {
      const { moduleRegistry } = require('../../core/registries/module.registry');
      const allModuleIds = moduleRegistry.listItems().map((m: { id: string }) => m.id);
      isolated = allModuleIds.filter((id: string) => !allActive.has(id));
    } catch {
      // ModuleRegistry 不可用时忽略
    }

    return {
      edges,
      deadEnds,
      isolated,
      activeModules: allActive.size,
      totalMessages: edges.reduce((sum, e) => sum + e.count, 0),
      windowStart: this.windowStart,
      timestamp: new Date(),
    };
  }

  /** 获取异常列表 */
  getAnomalies(limit: number = 20): DataFlowAnomaly[] {
    return this.anomalies.slice(-limit);
  }

  /** 获取指定模块的数据流（入边 + 出边） */
  getModuleFlows(moduleId: string): {
    incoming: DataFlowEdge[];
    outgoing: DataFlowEdge[];
    totalIncoming: number;
    totalOutgoing: number;
  } {
    const edges = Array.from(this.edges.values());
    const incoming = edges.filter(e => e.target === moduleId);
    const outgoing = edges.filter(e => e.source === moduleId);

    return {
      incoming,
      outgoing,
      totalIncoming: incoming.reduce((s, e) => s + e.count, 0),
      totalOutgoing: outgoing.reduce((s, e) => s + e.count, 0),
    };
  }

  /** 获取统计摘要 */
  getSummary(): {
    initialized: boolean;
    edgeCount: number;
    activeModules: number;
    totalMessages: number;
    anomalyCount: number;
    windowDuration: string;
  } {
    const graph = this.getFlowGraph();
    return {
      initialized: this.initialized,
      edgeCount: graph.edges.length,
      activeModules: graph.activeModules,
      totalMessages: graph.totalMessages,
      anomalyCount: this.anomalies.length,
      windowDuration: `${this.WINDOW_DURATION_MS / 60000} minutes`,
    };
  }

  /** 销毁（取消订阅 + 清理定时器） */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.initialized = false;
    log.info('[DataFlowTracer] Destroyed');
  }
}

// ============ 全局单例 ============
export const dataFlowTracer = new DataFlowTracer();
