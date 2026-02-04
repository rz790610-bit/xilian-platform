/**
 * 数据管道路由 API
 * 提供 Airflow DAGs 和 Kafka Connect 的管理接口
 */

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../_core/trpc';
import { dataPipelineService } from './dataPipelineService';

export const dataPipelineRouter = router({
  // ==================== 概览 ====================
  
  /**
   * 获取数据管道概览
   */
  getSummary: publicProcedure.query(() => {
    return dataPipelineService.getSummary();
  }),

  // ==================== Airflow DAGs ====================

  /**
   * 获取所有 DAGs
   */
  getDags: publicProcedure.query(() => {
    return dataPipelineService.airflow.getDags();
  }),

  /**
   * 获取单个 DAG
   */
  getDag: publicProcedure
    .input(z.object({ dagId: z.string() }))
    .query(({ input }) => {
      return dataPipelineService.airflow.getDag(input.dagId);
    }),

  /**
   * 获取 DAG 统计信息
   */
  getDagStats: publicProcedure
    .input(z.object({ dagId: z.string() }))
    .query(({ input }) => {
      return dataPipelineService.airflow.getDagStats(input.dagId);
    }),

  /**
   * 获取所有 DAG 统计
   */
  getAllDagStats: publicProcedure.query(() => {
    return dataPipelineService.airflow.getAllDagStats();
  }),

  /**
   * 获取 DAG 运行历史
   */
  getDagRuns: publicProcedure
    .input(z.object({ 
      dagId: z.string(),
      limit: z.number().optional().default(10),
    }))
    .query(({ input }) => {
      return dataPipelineService.airflow.getDagRuns(input.dagId, input.limit);
    }),

  /**
   * 获取单个运行详情
   */
  getDagRun: publicProcedure
    .input(z.object({ 
      dagId: z.string(),
      runId: z.string(),
    }))
    .query(({ input }) => {
      return dataPipelineService.airflow.getDagRun(input.dagId, input.runId);
    }),

  /**
   * 触发 DAG 运行
   */
  triggerDag: protectedProcedure
    .input(z.object({ 
      dagId: z.string(),
      conf: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(({ input }) => {
      return dataPipelineService.airflow.triggerDag(input.dagId, input.conf);
    }),

  /**
   * 暂停/恢复 DAG
   */
  toggleDagPause: protectedProcedure
    .input(z.object({ dagId: z.string() }))
    .mutation(({ input }) => {
      return dataPipelineService.airflow.toggleDagPause(input.dagId);
    }),

  /**
   * 获取任务日志
   */
  getTaskLogs: publicProcedure
    .input(z.object({ 
      dagId: z.string(),
      runId: z.string(),
      taskId: z.string(),
    }))
    .query(({ input }) => {
      return dataPipelineService.airflow.getTaskLogs(input.dagId, input.runId, input.taskId);
    }),

  /**
   * 获取调度器状态
   */
  getSchedulerStatus: publicProcedure.query(() => {
    return dataPipelineService.airflow.getSchedulerStatus();
  }),

  // ==================== Kafka Connect ====================

  /**
   * 获取所有 Connectors
   */
  getConnectors: publicProcedure.query(() => {
    return dataPipelineService.kafkaConnect.getConnectors();
  }),

  /**
   * 获取 Connector 配置
   */
  getConnector: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return dataPipelineService.kafkaConnect.getConnector(input.name);
    }),

  /**
   * 获取 Connector 状态
   */
  getConnectorStatus: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return dataPipelineService.kafkaConnect.getConnectorStatus(input.name);
    }),

  /**
   * 获取所有 Connector 状态
   */
  getAllConnectorStatuses: publicProcedure.query(() => {
    return dataPipelineService.kafkaConnect.getAllConnectorStatuses();
  }),

  /**
   * 创建 Connector
   */
  createConnector: protectedProcedure
    .input(z.object({
      name: z.string(),
      'connector.class': z.string(),
      'tasks.max': z.number(),
      config: z.record(z.string(), z.unknown()),
    }))
    .mutation(({ input }) => {
      const { config, ...base } = input;
      return dataPipelineService.kafkaConnect.createConnector({
        ...base,
        ...config,
      } as any);
    }),

  /**
   * 删除 Connector
   */
  deleteConnector: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => {
      return dataPipelineService.kafkaConnect.deleteConnector(input.name);
    }),

  /**
   * 暂停 Connector
   */
  pauseConnector: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => {
      return dataPipelineService.kafkaConnect.pauseConnector(input.name);
    }),

  /**
   * 恢复 Connector
   */
  resumeConnector: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => {
      return dataPipelineService.kafkaConnect.resumeConnector(input.name);
    }),

  /**
   * 重启 Connector
   */
  restartConnector: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => {
      return dataPipelineService.kafkaConnect.restartConnector(input.name);
    }),

  /**
   * 重启 Connector 任务
   */
  restartTask: protectedProcedure
    .input(z.object({ 
      name: z.string(),
      taskId: z.number(),
    }))
    .mutation(({ input }) => {
      return dataPipelineService.kafkaConnect.restartTask(input.name, input.taskId);
    }),

  /**
   * 获取 Connector 插件列表
   */
  getPlugins: publicProcedure.query(() => {
    return dataPipelineService.kafkaConnect.getPlugins();
  }),

  // ==================== Kafka Streams ====================

  /**
   * 获取所有 Streams 拓扑
   */
  getTopologies: publicProcedure.query(() => {
    return dataPipelineService.kafkaStreams.getTopologies();
  }),

  /**
   * 获取单个拓扑
   */
  getTopology: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      return dataPipelineService.kafkaStreams.getTopology(input.id);
    }),

  /**
   * 启动拓扑
   */
  startTopology: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      return dataPipelineService.kafkaStreams.startTopology(input.id);
    }),

  /**
   * 停止拓扑
   */
  stopTopology: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      return dataPipelineService.kafkaStreams.stopTopology(input.id);
    }),

  /**
   * 获取拓扑指标
   */
  getTopologyMetrics: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      return dataPipelineService.kafkaStreams.getTopologyMetrics(input.id);
    }),
});
