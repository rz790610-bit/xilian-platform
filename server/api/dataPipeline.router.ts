/**
 * 数据管道路由 API
 * 提供 Airflow DAGs 和 Kafka Connect 的真实管理接口
 */

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../core/trpc';
import { dataPipelineService } from '../services/dataPipeline.service';
import { airflowClient } from '../lib/clients/airflow.client';
import { kafkaConnectClient } from '../lib/clients/kafkaConnect.client';

export const dataPipelineRouter = router({
  // ==================== 概览 ====================
  
  /**
   * 获取数据管道概览
   */
  getSummary: publicProcedure.query(async () => {
    return await dataPipelineService.getOverview();
  }),

  /**
   * 检查服务连接状态
   */
  checkConnections: publicProcedure.query(async () => {
    return await dataPipelineService.checkConnections();
  }),

  // ==================== Airflow DAGs ====================

  /**
   * 获取所有 DAGs
   */
  getDags: publicProcedure.query(async () => {
    return await dataPipelineService.listDAGs();
  }),

  /**
   * 获取单个 DAG
   */
  getDag: publicProcedure
    .input(z.object({ dagId: z.string() }))
    .query(async ({ input }) => {
      return await dataPipelineService.getDAG(input.dagId);
    }),

  /**
   * 获取 DAG 运行历史
   */
  getDagRuns: publicProcedure
    .input(z.object({ 
      dagId: z.string(),
      limit: z.number().optional().default(20),
    }))
    .query(async ({ input }) => {
      return await dataPipelineService.getDAGRuns(input.dagId, input.limit);
    }),

  /**
   * 获取 DAG 任务
   */
  getDagTasks: publicProcedure
    .input(z.object({ dagId: z.string() }))
    .query(async ({ input }) => {
      return await dataPipelineService.getDAGTasks(input.dagId);
    }),

  /**
   * 获取任务实例
   */
  getTaskInstances: publicProcedure
    .input(z.object({ 
      dagId: z.string(),
      dagRunId: z.string(),
    }))
    .query(async ({ input }) => {
      return await dataPipelineService.getTaskInstances(input.dagId, input.dagRunId);
    }),

  /**
   * 触发 DAG 运行
   */
  triggerDag: protectedProcedure
    .input(z.object({ 
      dagId: z.string(),
      conf: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const run = await dataPipelineService.triggerDAG(input.dagId, input.conf as Record<string, unknown> | undefined);
      return { success: run !== null, run };
    }),

  /**
   * 暂停/恢复 DAG
   */
  toggleDag: protectedProcedure
    .input(z.object({ 
      dagId: z.string(),
      isPaused: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const success = await dataPipelineService.toggleDAG(input.dagId, input.isPaused);
      return { success };
    }),

  /**
   * 清除任务实例（重试）
   */
  clearTaskInstance: protectedProcedure
    .input(z.object({ 
      dagId: z.string(),
      dagRunId: z.string(),
      taskId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const success = await dataPipelineService.clearTaskInstance(
        input.dagId,
        input.dagRunId,
        input.taskId
      );
      return { success };
    }),

  // ==================== Airflow 直接 API ====================

  /**
   * 获取 Airflow 健康状态
   */
  getAirflowHealth: publicProcedure.query(async () => {
    return await airflowClient.getHealth();
  }),

  /**
   * 获取 Airflow 版本
   */
  getAirflowVersion: publicProcedure.query(async () => {
    return await airflowClient.getVersion();
  }),

  /**
   * 获取 Airflow 变量
   */
  getAirflowVariables: publicProcedure.query(async () => {
    return await airflowClient.listVariables();
  }),

  /**
   * 设置 Airflow 变量
   */
  setAirflowVariable: protectedProcedure
    .input(z.object({
      key: z.string(),
      value: z.string(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const success = await airflowClient.setVariable(input.key, input.value, input.description);
      return { success };
    }),

  /**
   * 删除 Airflow 变量
   */
  deleteAirflowVariable: protectedProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ input }) => {
      const success = await airflowClient.deleteVariable(input.key);
      return { success };
    }),

  /**
   * 获取 Airflow 连接
   */
  getAirflowConnections: publicProcedure.query(async () => {
    return await airflowClient.listConnections();
  }),

  /**
   * 测试 Airflow 连接
   */
  testAirflowConnection: protectedProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ input }) => {
      return await airflowClient.testConnection(input.connectionId);
    }),

  /**
   * 获取 Airflow 池
   */
  getAirflowPools: publicProcedure.query(async () => {
    return await airflowClient.listPools();
  }),

  // ==================== Kafka Connect ====================

  /**
   * 获取所有连接器
   */
  getConnectors: publicProcedure.query(async () => {
    return await dataPipelineService.listConnectors();
  }),

  /**
   * 获取单个连接器
   */
  getConnector: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ input }) => {
      return await dataPipelineService.getConnector(input.name);
    }),

  /**
   * 创建连接器
   */
  createConnector: protectedProcedure
    .input(z.object({
      name: z.string(),
      config: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ input }) => {
      const connector = await dataPipelineService.createConnector(input.name, input.config as Record<string, string>);
      return { success: connector !== null, connector };
    }),

  /**
   * 更新连接器配置
   */
  updateConnector: protectedProcedure
    .input(z.object({
      name: z.string(),
      config: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ input }) => {
      const success = await dataPipelineService.updateConnector(input.name, input.config as Record<string, string>);
      return { success };
    }),

  /**
   * 删除连接器
   */
  deleteConnector: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      const success = await dataPipelineService.deleteConnector(input.name);
      return { success };
    }),

  /**
   * 暂停连接器
   */
  pauseConnector: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      const success = await dataPipelineService.pauseConnector(input.name);
      return { success };
    }),

  /**
   * 恢复连接器
   */
  resumeConnector: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      const success = await dataPipelineService.resumeConnector(input.name);
      return { success };
    }),

  /**
   * 重启连接器
   */
  restartConnector: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      const success = await dataPipelineService.restartConnector(input.name);
      return { success };
    }),

  /**
   * 重启连接器任务
   */
  restartConnectorTask: protectedProcedure
    .input(z.object({
      name: z.string(),
      taskId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const success = await dataPipelineService.restartConnectorTask(input.name, input.taskId);
      return { success };
    }),

  // ==================== Kafka Connect 直接 API ====================

  /**
   * 获取 Kafka Connect 集群信息
   */
  getKafkaConnectInfo: publicProcedure.query(async () => {
    return await kafkaConnectClient.getClusterInfo();
  }),

  /**
   * 获取可用插件
   */
  getKafkaConnectPlugins: publicProcedure.query(async () => {
    return await kafkaConnectClient.listPlugins();
  }),

  /**
   * 验证连接器配置
   */
  validateConnectorConfig: protectedProcedure
    .input(z.object({
      pluginClass: z.string(),
      config: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ input }) => {
      return await kafkaConnectClient.validateConnectorConfig(input.pluginClass, input.config as Record<string, string>);
    }),

  // ==================== 统一管道接口 ====================

  /**
   * 获取所有管道（Airflow + Kafka Connect）
   */
  getAllPipelines: publicProcedure.query(async () => {
    return await dataPipelineService.listAllPipelines();
  }),

  /**
   * 获取最近运行
   */
  getRecentRuns: publicProcedure
    .input(z.object({ limit: z.number().optional().default(10) }))
    .query(async ({ input }) => {
      return await dataPipelineService.getRecentRuns(input.limit);
    }),
});
