/**
 * ============================================================================
 * FIX-141: EventSourcingEngine 单元测试
 * ============================================================================
 *
 * 覆盖：
 *   - 事件追加与版本递增
 *   - 事件流查询（按聚合 ID / 版本范围）
 *   - 聚合状态重建（reducer 模式）
 *   - 快照创建与重建加速
 *   - 投影注册、更新、重建
 *   - 查询 API（按类型 / 时间 / 分页）
 *   - 统计信息
 *   - DLQ（Dead Letter Queue）管理
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventSourcingEngine, type StoredEvent } from '../event-sourcing';

describe('EventSourcingEngine', () => {
  let engine: EventSourcingEngine;

  beforeEach(() => {
    engine = new EventSourcingEngine();
  });

  // --------------------------------------------------------------------------
  // 事件追加
  // --------------------------------------------------------------------------

  describe('append', () => {
    it('追加事件返回 StoredEvent', () => {
      const event = engine.append('agg-1', 'Device', 'DeviceCreated', { name: 'RTG-001' });
      expect(event.id).toBe(1);
      expect(event.aggregateId).toBe('agg-1');
      expect(event.aggregateType).toBe('Device');
      expect(event.eventType).toBe('DeviceCreated');
      expect(event.payload).toEqual({ name: 'RTG-001' });
      expect(event.metadata.version).toBe(1);
      expect(event.metadata.timestamp).toBeGreaterThan(0);
    });

    it('同一聚合连续追加版本递增', () => {
      const e1 = engine.append('agg-1', 'Device', 'Created', {});
      const e2 = engine.append('agg-1', 'Device', 'Updated', {});
      const e3 = engine.append('agg-1', 'Device', 'Updated', {});
      expect(e1.metadata.version).toBe(1);
      expect(e2.metadata.version).toBe(2);
      expect(e3.metadata.version).toBe(3);
    });

    it('不同聚合版本独立', () => {
      const e1 = engine.append('agg-1', 'Device', 'Created', {});
      const e2 = engine.append('agg-2', 'Device', 'Created', {});
      expect(e1.metadata.version).toBe(1);
      expect(e2.metadata.version).toBe(1);
    });

    it('事件 ID 全局递增', () => {
      const e1 = engine.append('agg-1', 'Device', 'Created', {});
      const e2 = engine.append('agg-2', 'Sensor', 'Registered', {});
      expect(e2.id).toBe(e1.id + 1);
    });

    it('附带 metadata', () => {
      const event = engine.append('agg-1', 'Device', 'Created', {}, {
        userId: 'user-42',
        correlationId: 'corr-abc',
        causationId: 'cause-xyz',
      });
      expect(event.metadata.userId).toBe('user-42');
      expect(event.metadata.correlationId).toBe('corr-abc');
      expect(event.metadata.causationId).toBe('cause-xyz');
    });
  });

  // --------------------------------------------------------------------------
  // 事件流查询
  // --------------------------------------------------------------------------

  describe('getEvents', () => {
    beforeEach(() => {
      engine.append('agg-1', 'Device', 'Created', { step: 1 });
      engine.append('agg-1', 'Device', 'Updated', { step: 2 });
      engine.append('agg-1', 'Device', 'Updated', { step: 3 });
      engine.append('agg-2', 'Sensor', 'Created', { step: 1 });
    });

    it('按聚合 ID 获取全部事件', () => {
      const events = engine.getEvents('agg-1');
      expect(events).toHaveLength(3);
      expect(events[0].metadata.version).toBe(1);
      expect(events[2].metadata.version).toBe(3);
    });

    it('按版本范围过滤', () => {
      const events = engine.getEvents('agg-1', 2, 2);
      expect(events).toHaveLength(1);
      expect(events[0].metadata.version).toBe(2);
    });

    it('fromVersion 过滤', () => {
      const events = engine.getEvents('agg-1', 2);
      expect(events).toHaveLength(2);
    });

    it('不存在的聚合返回空', () => {
      expect(engine.getEvents('agg-999')).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // 聚合状态重建
  // --------------------------------------------------------------------------

  describe('rebuildState', () => {
    it('通过 reducer 重建聚合状态', () => {
      engine.append('dev-1', 'Device', 'Created', { name: 'RTG-001', status: 'idle' });
      engine.append('dev-1', 'Device', 'Started', { status: 'running' });
      engine.append('dev-1', 'Device', 'AlertRaised', { alertLevel: 'warning' });

      const reducer = (state: Record<string, unknown>, event: StoredEvent) => ({
        ...state,
        ...event.payload,
      });

      const { state, version } = engine.rebuildState('dev-1', reducer);
      expect(state.name).toBe('RTG-001');
      expect(state.status).toBe('running');
      expect(state.alertLevel).toBe('warning');
      expect(version).toBe(3);
    });

    it('使用初始状态', () => {
      engine.append('dev-1', 'Device', 'Updated', { value: 42 });

      const { state } = engine.rebuildState(
        'dev-1',
        (s, e) => ({ ...s, ...e.payload }),
        { defaultKey: 'init' },
      );
      expect(state.defaultKey).toBe('init');
      expect(state.value).toBe(42);
    });

    it('空事件流返回初始状态', () => {
      const { state, version } = engine.rebuildState(
        'nonexistent',
        (s, e) => ({ ...s, ...e.payload }),
        { empty: true },
      );
      expect(state).toEqual({ empty: true });
      expect(version).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 快照
  // --------------------------------------------------------------------------

  describe('createSnapshot', () => {
    it('创建快照保存当前版本', () => {
      engine.append('dev-1', 'Device', 'Created', { name: 'RTG-001' });
      engine.append('dev-1', 'Device', 'Updated', { name: 'RTG-001-v2' });

      const snapshot = engine.createSnapshot('dev-1', 'Device');
      expect(snapshot.version).toBe(2);
      expect(snapshot.aggregateId).toBe('dev-1');
      expect(snapshot.state.name).toBe('RTG-001-v2');
    });

    it('快照加速 rebuildState', () => {
      // 追加 5 个事件
      for (let i = 1; i <= 5; i++) {
        engine.append('dev-1', 'Device', 'Updated', { counter: i });
      }

      // 在版本 3 创建快照
      engine.createSnapshot('dev-1', 'Device', { counter: 3, snapshotted: true });

      // 追加更多事件
      engine.append('dev-1', 'Device', 'Updated', { counter: 6 });

      // 重建 — 应从快照恢复再应用后续事件
      const { state, version } = engine.rebuildState(
        'dev-1',
        (s, e) => ({ ...s, ...e.payload }),
      );
      expect(version).toBe(6);
      expect(state.counter).toBe(6);
      expect(state.snapshotted).toBe(true); // 快照状态保留
    });
  });

  // --------------------------------------------------------------------------
  // 投影
  // --------------------------------------------------------------------------

  describe('projections', () => {
    it('注册投影并实时更新', () => {
      engine.registerProjection({
        id: 'device-count',
        name: '设备计数',
        eventTypes: ['DeviceCreated'],
        handler: (state, _event) => ({
          ...state,
          count: ((state.count as number) || 0) + 1,
        }),
      });

      engine.append('dev-1', 'Device', 'DeviceCreated', {});
      engine.append('dev-2', 'Device', 'DeviceCreated', {});
      engine.append('dev-1', 'Device', 'DeviceUpdated', {}); // 不匹配投影

      const projState = engine.getProjectionState('device-count');
      expect(projState).not.toBeNull();
      expect(projState!.count).toBe(2);
    });

    it('通配符 * 匹配所有事件', () => {
      engine.registerProjection({
        id: 'all-events',
        name: '所有事件计数',
        eventTypes: ['*'],
        handler: (state, _event) => ({
          count: ((state.count as number) || 0) + 1,
        }),
      });

      engine.append('a', 'A', 'TypeA', {});
      engine.append('b', 'B', 'TypeB', {});
      engine.append('c', 'C', 'TypeC', {});

      expect(engine.getProjectionState('all-events')!.count).toBe(3);
    });

    it('rebuildProjection 从头重建', () => {
      engine.append('dev-1', 'Device', 'DeviceCreated', {});
      engine.append('dev-2', 'Device', 'DeviceCreated', {});

      engine.registerProjection({
        id: 'late-proj',
        name: '延迟注册投影',
        eventTypes: ['DeviceCreated'],
        handler: (state, _event) => ({
          count: ((state.count as number) || 0) + 1,
        }),
      });

      // 注册时之前的事件未被投影捕获
      expect(engine.getProjectionState('late-proj')!.count).toBeUndefined();

      // 重建投影
      engine.rebuildProjection('late-proj');
      expect(engine.getProjectionState('late-proj')!.count).toBe(2);
    });

    it('不存在的投影返回 null', () => {
      expect(engine.getProjectionState('nonexistent')).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 查询 API
  // --------------------------------------------------------------------------

  describe('query', () => {
    beforeEach(() => {
      engine.append('dev-1', 'Device', 'Created', {});
      engine.append('dev-1', 'Device', 'Updated', {});
      engine.append('sen-1', 'Sensor', 'Created', {});
      engine.append('sen-1', 'Sensor', 'DataReceived', {});
      engine.append('sen-2', 'Sensor', 'Created', {});
    });

    it('无过滤返回全部', () => {
      const { events, total } = engine.query({});
      expect(total).toBe(5);
      expect(events).toHaveLength(5);
    });

    it('按 aggregateType 过滤', () => {
      const { events, total } = engine.query({ aggregateType: 'Sensor' });
      expect(total).toBe(3);
      expect(events.every(e => e.aggregateType === 'Sensor')).toBe(true);
    });

    it('按 eventType 过滤', () => {
      const { total } = engine.query({ eventType: 'Created' });
      expect(total).toBe(3);
    });

    it('分页: limit + offset', () => {
      const { events } = engine.query({ limit: 2, offset: 1 });
      expect(events).toHaveLength(2);
      expect(events[0].id).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // 统计
  // --------------------------------------------------------------------------

  describe('getStats', () => {
    it('统计事件总数和分类', () => {
      engine.append('dev-1', 'Device', 'Created', {});
      engine.append('dev-1', 'Device', 'Updated', {});
      engine.append('sen-1', 'Sensor', 'Created', {});

      engine.registerProjection({
        id: 'p1', name: 'P1', eventTypes: ['*'],
        handler: (s) => s,
      });

      const stats = engine.getStats();
      expect(stats.totalEvents).toBe(3);
      expect(stats.totalSnapshots).toBe(0);
      expect(stats.totalProjections).toBe(1);
      expect(stats.eventsByType.Created).toBe(2);
      expect(stats.eventsByType.Updated).toBe(1);
      expect(stats.eventsByAggregate.Device).toBe(2);
      expect(stats.eventsByAggregate.Sensor).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // DLQ (FIX-131)
  // --------------------------------------------------------------------------

  describe('DLQ', () => {
    it('初始 DLQ 为空', () => {
      const status = engine.getDeadLetterQueueStatus();
      expect(status.size).toBe(0);
      expect(status.events).toHaveLength(0);
    });

    it('getDeadLetterQueueStatus 返回结构正确', () => {
      const status = engine.getDeadLetterQueueStatus();
      expect(status).toHaveProperty('size');
      expect(status).toHaveProperty('events');
      expect(Array.isArray(status.events)).toBe(true);
    });
  });
});
