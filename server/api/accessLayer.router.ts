/**
 * 接入层统一 tRPC 路由
 * Connector → Endpoint → Binding 三级模型
 */
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../core/trpc";
import * as alService from "../services/access-layer.service";
import { PROTOCOL_TYPES } from "../../shared/accessLayerTypes";

const protocolTypeEnum = z.enum(PROTOCOL_TYPES);

export const accessLayerRouter = router({
  // ============ 演示数据种子 ============
  // S0-1: 所有 mutation 改为 protectedProcedure（原全部 publicProcedure）
  seedDemoData: protectedProcedure.mutation(() => alService.seedDemoData()),
  batchHealthCheck: protectedProcedure.mutation(() => alService.batchHealthCheck()),
  // ============ 统计 ============
  // S0-1: 接入层数据含敏感连接信息，query 也需认证
  getStats: protectedProcedure.query(() => alService.getStats()),

  // ============ 协议注册中心（自动同步） ============
  /** 从适配器注册表自动生成协议列表（含 icon/description/category） */
  listProtocols: protectedProcedure.query(() => alService.listProtocols()),
  /** 从适配器注册表自动生成分类列表 */
  listCategories: protectedProcedure.query(() => alService.listCategories()),
  /** 获取所有协议的完整配置 Schema */
  protocolSchemas: protectedProcedure.query(() => alService.getAllProtocolSchemas()),
  /** 获取单个协议的配置 Schema */
  protocolSchema: protectedProcedure
    .input(z.object({ protocolType: protocolTypeEnum }))
    .query(({ input }) => alService.getProtocolConfigSchema(input.protocolType)),

  // ============ Connector CRUD ============
  listConnectors: protectedProcedure.input(z.object({
    protocolType: z.string().optional(),
    status: z.string().optional(),
    search: z.string().optional(),
    page: z.number().optional(),
    pageSize: z.number().optional(),
  }).optional()).query(({ input }) => alService.listConnectors(input ?? {})),

  getConnector: protectedProcedure
    .input(z.object({ connectorId: z.string() }))
    .query(({ input }) => alService.getConnector(input.connectorId)),

  createConnector: protectedProcedure.input(z.object({
    name: z.string(),
    protocolType: protocolTypeEnum,
    description: z.string().optional(),
    connectionParams: z.record(z.string(), z.unknown()),
    authConfig: z.record(z.string(), z.unknown()).optional(),
    healthCheckConfig: z.record(z.string(), z.unknown()).optional(),
    sourceRef: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })).mutation(({ input }) => alService.createConnector(input as any)),

  updateConnector: protectedProcedure.input(z.object({
    connectorId: z.string(),
    data: z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      connectionParams: z.record(z.string(), z.unknown()).optional(),
      authConfig: z.record(z.string(), z.unknown()).optional(),
      healthCheckConfig: z.record(z.string(), z.unknown()).optional(),
      status: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
  })).mutation(({ input }) => alService.updateConnector(input.connectorId, input.data as any)),

  deleteConnector: protectedProcedure
    .input(z.object({ connectorId: z.string() }))
    .mutation(({ input }) => alService.deleteConnector(input.connectorId)),

  // ============ 连接测试 ============
  testConnection: protectedProcedure.input(z.object({
    protocolType: protocolTypeEnum,
    connectionParams: z.record(z.string(), z.unknown()),
    authConfig: z.record(z.string(), z.unknown()).optional(),
  })).mutation(({ input }) => alService.testConnection(
    input.protocolType,
    input.connectionParams,
    input.authConfig,
  )),

  // ============ 健康检查 ============
  healthCheck: protectedProcedure
    .input(z.object({ connectorId: z.string() }))
    .mutation(({ input }) => alService.healthCheck(input.connectorId)),

  // ============ 资源发现 ============
  discoverEndpoints: protectedProcedure
    .input(z.object({ connectorId: z.string() }))
    .mutation(({ input }) => alService.discoverEndpoints(input.connectorId)),

  // ============ Endpoint CRUD ============
  listEndpoints: protectedProcedure
    .input(z.object({ connectorId: z.string() }))
    .query(({ input }) => alService.listEndpoints(input.connectorId)),

  createEndpoint: protectedProcedure.input(z.object({
    connectorId: z.string(),
    name: z.string(),
    resourcePath: z.string(),
    resourceType: z.string(),
    dataFormat: z.string().optional(),
    schemaInfo: z.record(z.string(), z.unknown()).optional(),
    samplingConfig: z.record(z.string(), z.unknown()).optional(),
    preprocessConfig: z.record(z.string(), z.unknown()).optional(),
    protocolConfigId: z.string().optional(),
    sensorId: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })).mutation(({ input }) => alService.createEndpoint(input)),

  createEndpointsBatch: protectedProcedure.input(z.object({
    endpoints: z.array(z.object({
      connectorId: z.string(),
      name: z.string(),
      resourcePath: z.string(),
      resourceType: z.string(),
      dataFormat: z.string().optional(),
      schemaInfo: z.record(z.string(), z.unknown()).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })),
  })).mutation(({ input }) => alService.createEndpointsBatch(input.endpoints)),

  updateEndpoint: protectedProcedure.input(z.object({
    endpointId: z.string(),
    data: z.object({
      name: z.string().optional(),
      resourcePath: z.string().optional(),
      dataFormat: z.string().optional(),
      schemaInfo: z.record(z.string(), z.unknown()).optional(),
      samplingConfig: z.record(z.string(), z.unknown()).optional(),
      preprocessConfig: z.record(z.string(), z.unknown()).optional(),
      sensorId: z.string().optional(),
      status: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  })).mutation(({ input }) => alService.updateEndpoint(input.endpointId, input.data)),

  deleteEndpoint: protectedProcedure
    .input(z.object({ endpointId: z.string() }))
    .mutation(({ input }) => alService.deleteEndpoint(input.endpointId)),

  // ============ Binding CRUD ============
  listBindings: protectedProcedure.input(z.object({
    endpointId: z.string().optional(),
    targetType: z.string().optional(),
    targetId: z.string().optional(),
  }).optional()).query(({ input }) => alService.listBindings(input ?? {})),

  createBinding: protectedProcedure.input(z.object({
    endpointId: z.string(),
    targetType: z.string(),
    targetId: z.string(),
    direction: z.string().optional(),
    transformConfig: z.record(z.string(), z.unknown()).optional(),
    bufferConfig: z.record(z.string(), z.unknown()).optional(),
  })).mutation(({ input }) => alService.createBinding(input)),

  updateBinding: protectedProcedure.input(z.object({
    bindingId: z.string(),
    data: z.object({
      transformConfig: z.record(z.string(), z.unknown()).optional(),
      bufferConfig: z.record(z.string(), z.unknown()).optional(),
      status: z.string().optional(),
      direction: z.string().optional(),
    }),
  })).mutation(({ input }) => alService.updateBinding(input.bindingId, input.data)),

  deleteBinding: protectedProcedure
    .input(z.object({ bindingId: z.string() }))
    .mutation(({ input }) => alService.deleteBinding(input.bindingId)),
});
