/**
 * ============================================================================
 * 事件溯源引擎 — EventSourcingEngine
 * ============================================================================
 *
 * 职责：
 *   1. 事件持久化（追加写入，不可变）
 *   2. 聚合状态重建（从事件流重放）
 *   3. 快照管理（定期快照加速重建）
 *   4. 事件查询（按时间/类型/聚合ID）
 *   5. 事件投影（物化视图）
 */

// ============================================================================
// 事件溯源类型
// ============================================================================

export interface StoredEvent {
  id: number;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: Record<string, unknown>;
  metadata: {
    userId?: string;
    correlationId?: string;
    causationId?: string;
    timestamp: number;
    version: number;
  };
  createdAt: number;
}

export interface Snapshot {
  aggregateId: string;
  aggregateType: string;
  state: Record<string, unknown>;
  version: number;
  createdAt: number;
}

export interface Projection {
  id: string;
  name: string;
  eventTypes: string[];
  handler: (state: Record<string, unknown>, event: StoredEvent) => Record<string, unknown>;
  currentState: Record<string, unknown>;
  lastProcessedVersion: number;
}

// ============================================================================
// 事件溯源引擎
// ============================================================================

export class EventSourcingEngine {
  private eventStore: StoredEvent[] = [];
  private snapshots = new Map<string, Snapshot>(); // aggregateId → latest snapshot
  private projections = new Map<string, Projection>();
  private nextEventId = 1;
  private readonly snapshotInterval = 100; // 每 100 个事件创建快照

  /**
   * 追加事件
   */
  append(
    aggregateId: string,
    aggregateType: string,
    eventType: string,
    payload: Record<string, unknown>,
    metadata?: Partial<StoredEvent['metadata']>,
  ): StoredEvent {
    // 获取当前版本
    const currentVersion = this.getLatestVersion(aggregateId);
    const version = currentVersion + 1;

    const event: StoredEvent = {
      id: this.nextEventId++,
      aggregateId,
      aggregateType,
      eventType,
      payload,
      metadata: {
        userId: metadata?.userId,
        correlationId: metadata?.correlationId,
        causationId: metadata?.causationId,
        timestamp: Date.now(),
        version,
      },
      createdAt: Date.now(),
    };

    this.eventStore.push(event);

    // 检查是否需要创建快照
    if (version % this.snapshotInterval === 0) {
      this.createSnapshot(aggregateId, aggregateType);
    }

    // 更新投影
    this.updateProjections(event);

    // TODO: 持久化到数据库
    // INSERT INTO event_store (aggregate_id, aggregate_type, event_type, payload, metadata, version) ...

    return event;
  }

  /**
   * 获取聚合的事件流
   */
  getEvents(
    aggregateId: string,
    fromVersion?: number,
    toVersion?: number,
  ): StoredEvent[] {
    return this.eventStore
      .filter(e => e.aggregateId === aggregateId)
      .filter(e => !fromVersion || e.metadata.version >= fromVersion)
      .filter(e => !toVersion || e.metadata.version <= toVersion)
      .sort((a, b) => a.metadata.version - b.metadata.version);
  }

  /**
   * 重建聚合状态
   */
  rebuildState(
    aggregateId: string,
    reducer: (state: Record<string, unknown>, event: StoredEvent) => Record<string, unknown>,
    initialState: Record<string, unknown> = {},
  ): { state: Record<string, unknown>; version: number } {
    // 尝试从快照开始
    const snapshot = this.snapshots.get(aggregateId);
    let state = snapshot ? { ...snapshot.state } : { ...initialState };
    const fromVersion = snapshot ? snapshot.version + 1 : 0;

    // 从快照后的事件继续重建
    const events = this.getEvents(aggregateId, fromVersion);
    for (const event of events) {
      state = reducer(state, event);
    }

    const version = events.length > 0
      ? events[events.length - 1].metadata.version
      : (snapshot?.version || 0);

    return { state, version };
  }

  /**
   * 创建快照
   */
  createSnapshot(
    aggregateId: string,
    aggregateType: string,
    state?: Record<string, unknown>,
  ): Snapshot {
    const version = this.getLatestVersion(aggregateId);

    // 如果未提供状态，使用默认 reducer 重建
    const snapshotState = state || this.rebuildState(
      aggregateId,
      (s, e) => ({ ...s, ...e.payload, lastEventType: e.eventType }),
    ).state;

    const snapshot: Snapshot = {
      aggregateId,
      aggregateType,
      state: snapshotState,
      version,
      createdAt: Date.now(),
    };

    this.snapshots.set(aggregateId, snapshot);
    return snapshot;
  }

  /**
   * 注册投影
   */
  registerProjection(projection: Omit<Projection, 'currentState' | 'lastProcessedVersion'>): void {
    this.projections.set(projection.id, {
      ...projection,
      currentState: {},
      lastProcessedVersion: 0,
    });
  }

  /**
   * 获取投影状态
   */
  getProjectionState(projectionId: string): Record<string, unknown> | null {
    return this.projections.get(projectionId)?.currentState || null;
  }

  /**
   * 重建投影（从头开始）
   */
  rebuildProjection(projectionId: string): void {
    const projection = this.projections.get(projectionId);
    if (!projection) return;

    projection.currentState = {};
    projection.lastProcessedVersion = 0;

    const relevantEvents = this.eventStore
      .filter(e => projection.eventTypes.includes(e.eventType) || projection.eventTypes.includes('*'))
      .sort((a, b) => a.id - b.id);

    for (const event of relevantEvents) {
      projection.currentState = projection.handler(projection.currentState, event);
      projection.lastProcessedVersion = event.id;
    }
  }

  /**
   * 查询事件
   */
  query(params: {
    aggregateType?: string;
    eventType?: string;
    fromTimestamp?: number;
    toTimestamp?: number;
    limit?: number;
    offset?: number;
  }): { events: StoredEvent[]; total: number } {
    let results = [...this.eventStore];

    if (params.aggregateType) results = results.filter(e => e.aggregateType === params.aggregateType);
    if (params.eventType) results = results.filter(e => e.eventType === params.eventType);
    if (params.fromTimestamp) results = results.filter(e => e.createdAt >= params.fromTimestamp!);
    if (params.toTimestamp) results = results.filter(e => e.createdAt <= params.toTimestamp!);

    const total = results.length;
    const offset = params.offset || 0;
    const limit = params.limit || 100;

    return {
      events: results.slice(offset, offset + limit),
      total,
    };
  }

  /**
   * 获取统计
   */
  getStats(): {
    totalEvents: number;
    totalSnapshots: number;
    totalProjections: number;
    eventsByType: Record<string, number>;
    eventsByAggregate: Record<string, number>;
  } {
    const eventsByType: Record<string, number> = {};
    const eventsByAggregate: Record<string, number> = {};

    for (const event of this.eventStore) {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
      eventsByAggregate[event.aggregateType] = (eventsByAggregate[event.aggregateType] || 0) + 1;
    }

    return {
      totalEvents: this.eventStore.length,
      totalSnapshots: this.snapshots.size,
      totalProjections: this.projections.size,
      eventsByType,
      eventsByAggregate,
    };
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  private getLatestVersion(aggregateId: string): number {
    const events = this.eventStore.filter(e => e.aggregateId === aggregateId);
    if (events.length === 0) return 0;
    return Math.max(...events.map(e => e.metadata.version));
  }

  private updateProjections(event: StoredEvent): void {
    for (const projection of this.projections.values()) {
      if (projection.eventTypes.includes(event.eventType) || projection.eventTypes.includes('*')) {
        projection.currentState = projection.handler(projection.currentState, event);
        projection.lastProcessedVersion = event.id;
      }
    }
  }
}
