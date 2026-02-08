/**
 * 数据管道服务测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DataPipelineService } from './dataPipeline.service';
import { PREDEFINED_DAGS, PREDEFINED_CONNECTORS, PREDEFINED_STREAMS_TOPOLOGIES } from '@shared/dataPipelineTypes';

describe('数据管道服务', () => {
  let service: DataPipelineService;

  beforeEach(() => {
    service = new DataPipelineService();
  });

  describe('概览', () => {
    it('应该返回数据管道概览', () => {
      const summary = service.getSummary();
      
      expect(summary).toHaveProperty('airflow');
      expect(summary).toHaveProperty('kafkaConnect');
      expect(summary).toHaveProperty('kafkaStreams');
      
      expect(summary.airflow.totalDags).toBe(4);
      expect(summary.kafkaConnect.totalConnectors).toBe(3);
      expect(summary.kafkaStreams.totalTopologies).toBe(3);
    });
  });

  describe('Airflow DAGs', () => {
    it('应该返回预定义的 DAGs', () => {
      const dags = service.airflow.getDags();
      
      expect(dags.length).toBe(4);
      expect(dags.map(d => d.dagId)).toContain('daily_kg_optimization');
      expect(dags.map(d => d.dagId)).toContain('weekly_vector_rebuild');
      expect(dags.map(d => d.dagId)).toContain('model_retraining');
      expect(dags.map(d => d.dagId)).toContain('backup');
    });

    it('应该返回单个 DAG 详情', () => {
      const dag = service.airflow.getDag('daily_kg_optimization');
      
      expect(dag).toBeDefined();
      expect(dag?.dagId).toBe('daily_kg_optimization');
      expect(dag?.description).toContain('知识图谱');
      expect(dag?.tasks.length).toBeGreaterThan(0);
    });

    it('daily_kg_optimization DAG 应该包含正确的任务', () => {
      const dag = service.airflow.getDag('daily_kg_optimization');
      
      expect(dag?.tasks.map(t => t.taskId)).toContain('extract_entities');
      expect(dag?.tasks.map(t => t.taskId)).toContain('deduplicate_entities');
      expect(dag?.tasks.map(t => t.taskId)).toContain('merge_similar_nodes');
      expect(dag?.tasks.map(t => t.taskId)).toContain('detect_communities');
      expect(dag?.tasks.map(t => t.taskId)).toContain('generate_summaries');
    });

    it('weekly_vector_rebuild DAG 应该包含正确的任务', () => {
      const dag = service.airflow.getDag('weekly_vector_rebuild');
      
      expect(dag?.tasks.map(t => t.taskId)).toContain('backup_current_vectors');
      expect(dag?.tasks.map(t => t.taskId)).toContain('generate_embeddings');
      expect(dag?.tasks.map(t => t.taskId)).toContain('recreate_collections');
      expect(dag?.tasks.map(t => t.taskId)).toContain('verify_rebuild');
    });

    it('model_retraining DAG 应该包含正确的任务', () => {
      const dag = service.airflow.getDag('model_retraining');
      
      expect(dag?.tasks.map(t => t.taskId)).toContain('collect_feedback');
      expect(dag?.tasks.map(t => t.taskId)).toContain('clean_feedback_data');
      expect(dag?.tasks.map(t => t.taskId)).toContain('finetune_model');
      expect(dag?.tasks.map(t => t.taskId)).toContain('validate_model');
    });

    it('backup DAG 应该包含正确的任务', () => {
      const dag = service.airflow.getDag('backup');
      
      expect(dag?.tasks.map(t => t.taskId)).toContain('backup_mysql');
      expect(dag?.tasks.map(t => t.taskId)).toContain('backup_clickhouse');
      expect(dag?.tasks.map(t => t.taskId)).toContain('backup_qdrant');
      expect(dag?.tasks.map(t => t.taskId)).toContain('upload_to_s3');
      expect(dag?.tasks.map(t => t.taskId)).toContain('verify_backup');
    });

    it('应该返回 DAG 统计信息', () => {
      const stats = service.airflow.getDagStats('daily_kg_optimization');
      
      expect(stats).toBeDefined();
      expect(stats?.dagId).toBe('daily_kg_optimization');
      expect(stats?.totalRuns).toBeGreaterThan(0);
      expect(typeof stats?.avgDuration).toBe('number');
    });

    it('应该返回 DAG 运行历史', () => {
      const runs = service.airflow.getDagRuns('daily_kg_optimization', 5);
      
      expect(runs.length).toBeLessThanOrEqual(5);
      expect(runs[0]).toHaveProperty('runId');
      expect(runs[0]).toHaveProperty('state');
      expect(runs[0]).toHaveProperty('taskInstances');
    });

    it('应该能够暂停和恢复 DAG', () => {
      const dag = service.airflow.getDag('daily_kg_optimization');
      const originalPaused = dag?.isPaused;
      
      const toggled = service.airflow.toggleDagPause('daily_kg_optimization');
      expect(toggled?.isPaused).toBe(!originalPaused);
      
      const toggledBack = service.airflow.toggleDagPause('daily_kg_optimization');
      expect(toggledBack?.isPaused).toBe(originalPaused);
    });

    it('应该返回调度器状态', () => {
      const status = service.airflow.getSchedulerStatus();
      
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('lastHeartbeat');
      expect(status.status).toBe('healthy');
    });
  });

  describe('Kafka Connect', () => {
    it('应该返回预定义的 Connectors', () => {
      const connectors = service.kafkaConnect.getConnectors();
      
      expect(connectors.length).toBe(3);
      expect(connectors.map(c => c.name)).toContain('debezium-postgres-cdc');
      expect(connectors.map(c => c.name)).toContain('neo4j-knowledge-graph-sink');
      expect(connectors.map(c => c.name)).toContain('clickhouse-sensor-data-sink');
    });

    it('Debezium PostgreSQL CDC Connector 应该配置正确', () => {
      const connector = service.kafkaConnect.getConnector('debezium-postgres-cdc');
      
      expect(connector).toBeDefined();
      expect(connector?.['connector.class']).toContain('PostgresConnector');
      expect(connector?.['database.server.name']).toBe('xilian-db');
      expect(connector?.['plugin.name']).toBe('pgoutput');
    });

    it('Neo4j Sink Connector 应该配置正确', () => {
      const connector = service.kafkaConnect.getConnector('neo4j-knowledge-graph-sink');
      
      expect(connector).toBeDefined();
      expect(connector?.['connector.class']).toContain('Neo4jSinkConnector');
      expect(connector?.['neo4j.server.uri']).toContain('bolt://');
    });

    it('ClickHouse Sink Connector 应该配置正确', () => {
      const connector = service.kafkaConnect.getConnector('clickhouse-sensor-data-sink');
      
      expect(connector).toBeDefined();
      expect(connector?.['connector.class']).toContain('ClickHouseSinkConnector');
      expect(connector?.['exactlyOnce']).toBe(true);
    });

    it('应该返回 Connector 状态', () => {
      const status = service.kafkaConnect.getConnectorStatus('debezium-postgres-cdc');
      
      expect(status).toBeDefined();
      expect(status?.connector.state).toBe('RUNNING');
      expect(status?.tasks.length).toBeGreaterThan(0);
    });

    it('应该能够暂停和恢复 Connector', () => {
      const paused = service.kafkaConnect.pauseConnector('debezium-postgres-cdc');
      expect(paused?.connector.state).toBe('PAUSED');
      
      const resumed = service.kafkaConnect.resumeConnector('debezium-postgres-cdc');
      expect(resumed?.connector.state).toBe('RUNNING');
    });

    it('应该返回可用的插件列表', () => {
      const plugins = service.kafkaConnect.getPlugins();
      
      expect(plugins.length).toBeGreaterThan(0);
      expect(plugins.some(p => p.class.includes('PostgresConnector'))).toBe(true);
      expect(plugins.some(p => p.class.includes('Neo4jSinkConnector'))).toBe(true);
      expect(plugins.some(p => p.class.includes('ClickHouseSinkConnector'))).toBe(true);
    });
  });

  describe('Kafka Streams', () => {
    it('应该返回预定义的 Streams 拓扑', () => {
      const topologies = service.kafkaStreams.getTopologies();
      
      expect(topologies.length).toBe(3);
      expect(topologies.map(t => t.id)).toContain('sensor-data-cleansing');
      expect(topologies.map(t => t.id)).toContain('sensor-data-aggregation');
      expect(topologies.map(t => t.id)).toContain('anomaly-detection-stream');
    });

    it('传感器数据清洗拓扑应该配置正确', () => {
      const topology = service.kafkaStreams.getTopology('sensor-data-cleansing');
      
      expect(topology).toBeDefined();
      expect(topology?.name).toContain('清洗');
      expect(topology?.processors.length).toBeGreaterThan(0);
      expect(topology?.config.processingGuarantee).toBe('exactly_once_v2');
    });

    it('传感器数据聚合拓扑应该配置正确', () => {
      const topology = service.kafkaStreams.getTopology('sensor-data-aggregation');
      
      expect(topology).toBeDefined();
      expect(topology?.name).toContain('聚合');
      expect(topology?.processors.some(p => p.type === 'aggregate')).toBe(true);
    });

    it('异常检测拓扑应该配置正确', () => {
      const topology = service.kafkaStreams.getTopology('anomaly-detection-stream');
      
      expect(topology).toBeDefined();
      expect(topology?.name).toContain('异常');
      expect(topology?.processors.some(p => p.type === 'window')).toBe(true);
    });

    it('应该返回拓扑指标', () => {
      const metrics = service.kafkaStreams.getTopologyMetrics('sensor-data-cleansing');
      
      expect(metrics).toBeDefined();
      expect(metrics?.processRate).toBeGreaterThan(0);
      expect(metrics?.processLatencyAvg).toBeGreaterThan(0);
    });

    it('应该能够启动和停止拓扑', () => {
      const stopped = service.kafkaStreams.stopTopology('sensor-data-cleansing');
      expect(stopped?.state).toBe('STOPPED');
      
      const started = service.kafkaStreams.startTopology('sensor-data-cleansing');
      expect(started?.state).toBe('RUNNING');
    });
  });

  describe('预定义配置验证', () => {
    it('PREDEFINED_DAGS 应该包含所有必需的 DAG', () => {
      expect(Object.keys(PREDEFINED_DAGS)).toContain('daily_kg_optimization');
      expect(Object.keys(PREDEFINED_DAGS)).toContain('weekly_vector_rebuild');
      expect(Object.keys(PREDEFINED_DAGS)).toContain('model_retraining');
      expect(Object.keys(PREDEFINED_DAGS)).toContain('backup');
    });

    it('PREDEFINED_CONNECTORS 应该包含所有必需的 Connector', () => {
      expect(Object.keys(PREDEFINED_CONNECTORS)).toContain('debezium_postgres_cdc');
      expect(Object.keys(PREDEFINED_CONNECTORS)).toContain('neo4j_sink');
      expect(Object.keys(PREDEFINED_CONNECTORS)).toContain('clickhouse_sensor_sink');
    });

    it('PREDEFINED_STREAMS_TOPOLOGIES 应该包含所有必需的拓扑', () => {
      const ids = PREDEFINED_STREAMS_TOPOLOGIES.map(t => t.id);
      expect(ids).toContain('sensor-data-cleansing');
      expect(ids).toContain('sensor-data-aggregation');
      expect(ids).toContain('anomaly-detection-stream');
    });
  });
});
