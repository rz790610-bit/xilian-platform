/**
 * Pipeline 类型和工具函数测试
 */

import { describe, it, expect } from 'vitest';
import {
  SOURCE_TYPES,
  PROCESSOR_TYPES,
  SINK_TYPES,
  getSourceTypeInfo,
  getProcessorTypeInfo,
  getSinkTypeInfo,
  editorStateToPipelineConfig,
  pipelineConfigToEditorState,
  validateEditorState,
  type EditorState,
  type EditorNode,
  type PipelineConfig,
} from '@shared/pipelineTypes';

describe('Pipeline 类型定义', () => {
  describe('预定义类型', () => {
    it('应该定义所有数据源类型', () => {
      expect(SOURCE_TYPES).toHaveLength(3);
      expect(SOURCE_TYPES.map(s => s.type)).toEqual(['http', 'kafka', 'database']);
    });

    it('应该定义所有处理器类型', () => {
      expect(PROCESSOR_TYPES).toHaveLength(4);
      expect(PROCESSOR_TYPES.map(p => p.type)).toEqual(['field_map', 'filter', 'transform', 'aggregate']);
    });

    it('应该定义所有目标连接器类型', () => {
      expect(SINK_TYPES).toHaveLength(3);
      expect(SINK_TYPES.map(s => s.type)).toEqual(['http', 'clickhouse', 'redis']);
    });

    it('每个类型应该有完整的配置 Schema', () => {
      SOURCE_TYPES.forEach(source => {
        expect(source.configSchema).toBeDefined();
        expect(source.configSchema.type).toBe(source.type);
        expect(Array.isArray(source.configSchema.fields)).toBe(true);
      });

      PROCESSOR_TYPES.forEach(processor => {
        expect(processor.configSchema).toBeDefined();
        expect(processor.configSchema.type).toBe(processor.type);
        expect(Array.isArray(processor.configSchema.fields)).toBe(true);
      });

      SINK_TYPES.forEach(sink => {
        expect(sink.configSchema).toBeDefined();
        expect(sink.configSchema.type).toBe(sink.type);
        expect(Array.isArray(sink.configSchema.fields)).toBe(true);
      });
    });
  });

  describe('类型查找函数', () => {
    it('getSourceTypeInfo 应该返回正确的数据源信息', () => {
      const httpSource = getSourceTypeInfo('http');
      expect(httpSource).toBeDefined();
      expect(httpSource?.name).toBe('HTTP API');

      const kafkaSource = getSourceTypeInfo('kafka');
      expect(kafkaSource).toBeDefined();
      expect(kafkaSource?.name).toBe('Kafka');

      const unknownSource = getSourceTypeInfo('unknown' as any);
      expect(unknownSource).toBeUndefined();
    });

    it('getProcessorTypeInfo 应该返回正确的处理器信息', () => {
      const filterProcessor = getProcessorTypeInfo('filter');
      expect(filterProcessor).toBeDefined();
      expect(filterProcessor?.name).toBe('过滤器');

      const transformProcessor = getProcessorTypeInfo('transform');
      expect(transformProcessor).toBeDefined();
      expect(transformProcessor?.name).toBe('转换器');
    });

    it('getSinkTypeInfo 应该返回正确的目标连接器信息', () => {
      const clickhouseSink = getSinkTypeInfo('clickhouse');
      expect(clickhouseSink).toBeDefined();
      expect(clickhouseSink?.name).toBe('ClickHouse');

      const redisSink = getSinkTypeInfo('redis');
      expect(redisSink).toBeDefined();
      expect(redisSink?.name).toBe('Redis');
    });
  });

  describe('编辑器状态验证', () => {
    it('空状态应该验证失败', () => {
      const emptyState: EditorState = {
        nodes: [],
        connections: [],
        selectedNodeId: null,
        zoom: 1,
        panX: 0,
        panY: 0,
      };

      const result = validateEditorState(emptyState);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('缺少数据源节点');
      expect(result.errors).toContain('缺少目标连接器节点');
    });

    it('缺少 Sink 应该验证失败', () => {
      const state: EditorState = {
        nodes: [
          { id: 'source-1', type: 'source', subType: 'http', name: 'HTTP', x: 0, y: 0, config: {}, validated: true },
        ],
        connections: [],
        selectedNodeId: null,
        zoom: 1,
        panX: 0,
        panY: 0,
      };

      const result = validateEditorState(state);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('缺少目标连接器节点');
    });

    it('多个 Source 应该验证失败', () => {
      const state: EditorState = {
        nodes: [
          { id: 'source-1', type: 'source', subType: 'http', name: 'HTTP', x: 0, y: 0, config: {}, validated: true },
          { id: 'source-2', type: 'source', subType: 'kafka', name: 'Kafka', x: 100, y: 0, config: {}, validated: true },
          { id: 'sink-1', type: 'sink', subType: 'redis', name: 'Redis', x: 200, y: 0, config: {}, validated: true },
        ],
        connections: [],
        selectedNodeId: null,
        zoom: 1,
        panX: 0,
        panY: 0,
      };

      const result = validateEditorState(state);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('只能有一个数据源节点');
    });

    it('未验证的节点应该导致验证失败', () => {
      const state: EditorState = {
        nodes: [
          { id: 'source-1', type: 'source', subType: 'http', name: 'HTTP', x: 0, y: 0, config: {}, validated: false },
          { id: 'sink-1', type: 'sink', subType: 'redis', name: 'Redis', x: 200, y: 0, config: {}, validated: true },
        ],
        connections: [
          { id: 'conn-1', fromNodeId: 'source-1', toNodeId: 'sink-1' },
        ],
        selectedNodeId: null,
        zoom: 1,
        panX: 0,
        panY: 0,
      };

      const result = validateEditorState(state);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('配置无效'))).toBe(true);
    });

    it('完整有效的状态应该验证通过', () => {
      const state: EditorState = {
        nodes: [
          { id: 'source-1', type: 'source', subType: 'http', name: 'HTTP', x: 0, y: 0, config: { url: 'http://example.com' }, validated: true },
          { id: 'processor-1', type: 'processor', subType: 'filter', name: '过滤器', x: 200, y: 0, config: {}, validated: true },
          { id: 'sink-1', type: 'sink', subType: 'redis', name: 'Redis', x: 400, y: 0, config: { keyPrefix: 'test:' }, validated: true },
        ],
        connections: [
          { id: 'conn-1', fromNodeId: 'source-1', toNodeId: 'processor-1' },
          { id: 'conn-2', fromNodeId: 'processor-1', toNodeId: 'sink-1' },
        ],
        selectedNodeId: null,
        zoom: 1,
        panX: 0,
        panY: 0,
      };

      const result = validateEditorState(state);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('状态转换', () => {
    it('editorStateToPipelineConfig 应该正确转换', () => {
      const state: EditorState = {
        nodes: [
          { id: 'source-1', type: 'source', subType: 'http', name: 'HTTP', x: 0, y: 0, config: { url: 'http://example.com' }, validated: true },
          { id: 'processor-1', type: 'processor', subType: 'filter', name: '过滤器', x: 200, y: 0, config: { condition: { field: 'status', operator: 'eq', value: 'active' } }, validated: true },
          { id: 'sink-1', type: 'sink', subType: 'redis', name: 'Redis', x: 400, y: 0, config: { keyPrefix: 'test:' }, validated: true },
        ],
        connections: [
          { id: 'conn-1', fromNodeId: 'source-1', toNodeId: 'processor-1' },
          { id: 'conn-2', fromNodeId: 'processor-1', toNodeId: 'sink-1' },
        ],
        selectedNodeId: null,
        zoom: 1,
        panX: 0,
        panY: 0,
      };

      const config = editorStateToPipelineConfig(state, 'test-pipeline', 'Test Pipeline', 'A test pipeline');
      
      expect(config).not.toBeNull();
      expect(config?.id).toBe('test-pipeline');
      expect(config?.name).toBe('Test Pipeline');
      expect(config?.description).toBe('A test pipeline');
      expect(config?.source.type).toBe('http');
      expect(config?.source.config.url).toBe('http://example.com');
      expect(config?.processors).toHaveLength(1);
      expect(config?.processors[0].type).toBe('filter');
      expect(config?.sink.type).toBe('redis');
      expect(config?.sink.config.keyPrefix).toBe('test:');
    });

    it('pipelineConfigToEditorState 应该正确转换', () => {
      const config: PipelineConfig = {
        id: 'test-pipeline',
        name: 'Test Pipeline',
        description: 'A test pipeline',
        source: {
          type: 'http',
          config: { url: 'http://example.com' },
        },
        processors: [
          { type: 'filter', config: { condition: { field: 'status', operator: 'eq', value: 'active' } } },
          { type: 'transform', config: { transform: '(data) => data' } },
        ],
        sink: {
          type: 'clickhouse',
          config: { table: 'events' },
        },
      };

      const state = pipelineConfigToEditorState(config);

      expect(state.nodes).toHaveLength(4); // 1 source + 2 processors + 1 sink
      expect(state.connections).toHaveLength(3); // source->proc1, proc1->proc2, proc2->sink
      expect(state.nodes.filter(n => n.type === 'source')).toHaveLength(1);
      expect(state.nodes.filter(n => n.type === 'processor')).toHaveLength(2);
      expect(state.nodes.filter(n => n.type === 'sink')).toHaveLength(1);
    });

    it('缺少 Source 或 Sink 时应该返回 null', () => {
      const stateNoSource: EditorState = {
        nodes: [
          { id: 'sink-1', type: 'sink', subType: 'redis', name: 'Redis', x: 0, y: 0, config: {}, validated: true },
        ],
        connections: [],
        selectedNodeId: null,
        zoom: 1,
        panX: 0,
        panY: 0,
      };

      const config = editorStateToPipelineConfig(stateNoSource, 'test', 'Test');
      expect(config).toBeNull();
    });
  });
});
