/**
 * Pipeline 引擎测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PipelineEngine,
  HttpSourceConnector,
  FilterProcessor,
  FieldMapProcessor,
  AggregateProcessor,
  HttpSinkConnector,
  RedisSinkConnector,
  DataRecord,
} from './pipeline.engine';

describe('Pipeline 引擎', () => {
  describe('数据源连接器', () => {
    it('HttpSourceConnector 应该正确初始化', () => {
      const connector = new HttpSourceConnector('test-http', {
        url: 'https://api.example.com/data',
        method: 'GET',
      });

      expect(connector.name).toBe('test-http');
      expect(connector.type).toBe('http');
    });

    it('HttpSourceConnector 应该返回正确的状态', async () => {
      const connector = new HttpSourceConnector('test-http', {
        url: 'https://api.example.com/data',
      });

      await connector.connect();
      const status = connector.getStatus();

      expect(status.connected).toBe(true);
      expect(status.errorCount).toBe(0);
    });
  });

  describe('数据处理器', () => {
    const testRecords: DataRecord[] = [
      { id: '1', timestamp: Date.now(), source: 'test', data: { name: 'Alice', age: 30, score: 85 } },
      { id: '2', timestamp: Date.now(), source: 'test', data: { name: 'Bob', age: 25, score: 92 } },
      { id: '3', timestamp: Date.now(), source: 'test', data: { name: 'Charlie', age: 35, score: 78 } },
    ];

    it('FilterProcessor 应该正确过滤数据', async () => {
      const processor = new FilterProcessor('age-filter', {
        condition: { field: 'age', operator: 'gte', value: 30 },
      });

      const result = await processor.process(testRecords);

      expect(result.success).toBe(true);
      expect(result.records.length).toBe(2);
      expect(result.records[0].data.name).toBe('Alice');
      expect(result.records[1].data.name).toBe('Charlie');
    });

    it('FilterProcessor 应该支持多种操作符', async () => {
      // 等于
      const eqProcessor = new FilterProcessor('eq-filter', {
        condition: { field: 'name', operator: 'eq', value: 'Bob' },
      });
      const eqResult = await eqProcessor.process(testRecords);
      expect(eqResult.records.length).toBe(1);
      expect(eqResult.records[0].data.name).toBe('Bob');

      // 包含
      const containsProcessor = new FilterProcessor('contains-filter', {
        condition: { field: 'name', operator: 'contains', value: 'li' },
      });
      const containsResult = await containsProcessor.process(testRecords);
      expect(containsResult.records.length).toBe(2); // Alice, Charlie
    });

    it('FieldMapProcessor 应该正确映射字段', async () => {
      const processor = new FieldMapProcessor('field-map', {
        mapping: {
          userName: 'name',
          userAge: 'age',
        },
      });

      const result = await processor.process(testRecords);

      expect(result.success).toBe(true);
      expect(result.records[0].data.userName).toBe('Alice');
      expect(result.records[0].data.userAge).toBe(30);
      expect(result.records[0].data.name).toBeUndefined();
    });

    it('AggregateProcessor 应该正确聚合数据', async () => {
      const processor = new AggregateProcessor('aggregate', {
        aggregations: [
          { field: 'score', operation: 'avg', outputField: 'avgScore' },
          { field: 'score', operation: 'sum', outputField: 'totalScore' },
          { field: 'score', operation: 'min', outputField: 'minScore' },
          { field: 'score', operation: 'max', outputField: 'maxScore' },
          { field: 'score', operation: 'count', outputField: 'count' },
        ],
      });

      const result = await processor.process(testRecords);

      expect(result.success).toBe(true);
      expect(result.records.length).toBe(1);
      expect(result.records[0].data.avgScore).toBeCloseTo(85);
      expect(result.records[0].data.totalScore).toBe(255);
      expect(result.records[0].data.minScore).toBe(78);
      expect(result.records[0].data.maxScore).toBe(92);
      expect(result.records[0].data.count).toBe(3);
    });
  });

  describe('目标连接器', () => {
    it('HttpSinkConnector 应该正确初始化', () => {
      const connector = new HttpSinkConnector('test-sink', {
        url: 'https://api.example.com/ingest',
        method: 'POST',
      });

      expect(connector.name).toBe('test-sink');
      expect(connector.type).toBe('http');
    });

    it('RedisSinkConnector 应该正确初始化', () => {
      const connector = new RedisSinkConnector('redis-sink', {
        keyPrefix: 'pipeline:',
        ttlSeconds: 3600,
      });

      expect(connector.name).toBe('redis-sink');
      expect(connector.type).toBe('redis');
    });
  });

  describe('Pipeline 引擎核心', () => {
    let engine: PipelineEngine;

    beforeEach(() => {
      engine = new PipelineEngine();
    });

    it('应该能够创建管道', async () => {
      await engine.createPipeline({
        id: 'test-pipeline',
        name: '测试管道',
        source: { type: 'http', config: { url: 'https://api.example.com/data' } },
        processors: [
          { type: 'filter', config: { condition: { field: 'status', operator: 'eq', value: 'active' } } },
        ],
        sink: { type: 'http', config: { url: 'https://api.example.com/ingest' } },
      });

      const status = engine.getPipelineStatus('test-pipeline');
      expect(status).not.toBeNull();
      expect(status?.status).toBe('created');
    });

    it('应该能够获取所有管道', async () => {
      await engine.createPipeline({
        id: 'pipeline-1',
        name: '管道1',
        source: { type: 'http', config: { url: 'https://api.example.com/data1' } },
        processors: [],
        sink: { type: 'http', config: { url: 'https://api.example.com/ingest1' } },
      });

      await engine.createPipeline({
        id: 'pipeline-2',
        name: '管道2',
        source: { type: 'http', config: { url: 'https://api.example.com/data2' } },
        processors: [],
        sink: { type: 'http', config: { url: 'https://api.example.com/ingest2' } },
      });

      const pipelines = engine.getAllPipelines();
      expect(pipelines.length).toBe(2);
    });

    it('应该能够启动和停止管道', async () => {
      await engine.createPipeline({
        id: 'test-pipeline',
        name: '测试管道',
        source: { type: 'http', config: { url: 'https://api.example.com/data' } },
        processors: [],
        sink: { type: 'http', config: { url: 'https://api.example.com/ingest' } },
      });

      await engine.startPipeline('test-pipeline');
      let status = engine.getPipelineStatus('test-pipeline');
      expect(status?.status).toBe('running');

      await engine.stopPipeline('test-pipeline');
      status = engine.getPipelineStatus('test-pipeline');
      expect(status?.status).toBe('stopped');
    });

    it('应该能够删除管道', async () => {
      await engine.createPipeline({
        id: 'test-pipeline',
        name: '测试管道',
        source: { type: 'http', config: { url: 'https://api.example.com/data' } },
        processors: [],
        sink: { type: 'http', config: { url: 'https://api.example.com/ingest' } },
      });

      await engine.deletePipeline('test-pipeline');
      const status = engine.getPipelineStatus('test-pipeline');
      expect(status).toBeNull();
    });

    it('创建重复管道应该抛出错误', async () => {
      await engine.createPipeline({
        id: 'test-pipeline',
        name: '测试管道',
        source: { type: 'http', config: { url: 'https://api.example.com/data' } },
        processors: [],
        sink: { type: 'http', config: { url: 'https://api.example.com/ingest' } },
      });

      await expect(engine.createPipeline({
        id: 'test-pipeline',
        name: '重复管道',
        source: { type: 'http', config: { url: 'https://api.example.com/data' } },
        processors: [],
        sink: { type: 'http', config: { url: 'https://api.example.com/ingest' } },
      })).rejects.toThrow('already exists');
    });
  });
});
