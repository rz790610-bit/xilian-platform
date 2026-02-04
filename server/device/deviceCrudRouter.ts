/**
 * 设备管理 CRUD API tRPC 路由
 * PortAI Nexus - 完整的设备生命周期管理 API
 */

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../_core/trpc';
import { deviceCrudService, DeviceType, DeviceStatus } from './deviceCrudService';

// ============================================
// 输入验证 Schema
// ============================================

const deviceTypeSchema = z.enum([
  'agv', 'rtg', 'qc', 'asc', 'conveyor', 'pump', 'motor',
  'sensor_hub', 'gateway', 'plc', 'robot', 'camera',
  'rfid_reader', 'weighbridge', 'other'
]);

const deviceStatusSchema = z.enum([
  'online', 'offline', 'maintenance', 'error', 'unknown'
]);

const deviceMetadataSchema = z.object({
  firmware: z.string().optional(),
  ipAddress: z.string().optional(),
  macAddress: z.string().optional(),
  protocol: z.string().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
}).optional();

const createDeviceSchema = z.object({
  deviceId: z.string().min(1).max(64),
  name: z.string().min(1).max(100),
  type: deviceTypeSchema,
  model: z.string().max(100).optional(),
  manufacturer: z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
  location: z.string().max(255).optional(),
  department: z.string().max(100).optional(),
  installDate: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
  warrantyExpiry: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
  metadata: deviceMetadataSchema,
});

const updateDeviceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: deviceTypeSchema.optional(),
  model: z.string().max(100).optional().nullable(),
  manufacturer: z.string().max(100).optional().nullable(),
  serialNumber: z.string().max(100).optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  status: deviceStatusSchema.optional(),
  installDate: z.string().datetime().optional().nullable().transform(v => v ? new Date(v) : undefined),
  warrantyExpiry: z.string().datetime().optional().nullable().transform(v => v ? new Date(v) : undefined),
  metadata: deviceMetadataSchema,
});

const deviceFilterSchema = z.object({
  type: z.union([deviceTypeSchema, z.array(deviceTypeSchema)]).optional(),
  status: z.union([deviceStatusSchema, z.array(deviceStatusSchema)]).optional(),
  location: z.string().optional(),
  department: z.string().optional(),
  manufacturer: z.string().optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().optional(),
  hasWarranty: z.boolean().optional(),
  onlineSince: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
  offlineSince: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
}).optional();

const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'type', 'status', 'createdAt', 'updatedAt', 'lastHeartbeat']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
}).optional();

// ============================================
// tRPC 路由
// ============================================

export const deviceCrudRouter = router({
  // ============ 基础 CRUD ============

  /**
   * 创建设备
   */
  create: protectedProcedure
    .input(createDeviceSchema)
    .mutation(async ({ input }) => {
      const result = await deviceCrudService.create(input as any);
      if (!result) {
        throw new Error('Failed to create device');
      }
      return result;
    }),

  /**
   * 批量创建设备
   */
  createBatch: protectedProcedure
    .input(z.object({
      devices: z.array(createDeviceSchema).min(1).max(100),
    }))
    .mutation(async ({ input }) => {
      return deviceCrudService.createBatch(input.devices as any);
    }),

  /**
   * 获取设备详情
   */
  getById: publicProcedure
    .input(z.object({
      deviceId: z.string(),
    }))
    .query(async ({ input }) => {
      return deviceCrudService.getById(input.deviceId);
    }),

  /**
   * 查询设备列表（带分页和过滤）
   */
  list: publicProcedure
    .input(z.object({
      filter: deviceFilterSchema,
      pagination: paginationSchema,
    }).optional())
    .query(async ({ input }) => {
      return deviceCrudService.list(
        input?.filter || {},
        input?.pagination || {}
      );
    }),

  /**
   * 更新设备
   */
  update: protectedProcedure
    .input(z.object({
      deviceId: z.string(),
      data: updateDeviceSchema,
    }))
    .mutation(async ({ input }) => {
      const result = await deviceCrudService.update(input.deviceId, input.data as any);
      if (!result) {
        throw new Error('Failed to update device');
      }
      return result;
    }),

  /**
   * 批量更新设备
   */
  updateBatch: protectedProcedure
    .input(z.object({
      deviceIds: z.array(z.string()).min(1).max(100),
      data: updateDeviceSchema,
    }))
    .mutation(async ({ input }) => {
      return deviceCrudService.updateBatch(input.deviceIds, input.data as any);
    }),

  /**
   * 删除设备
   */
  delete: protectedProcedure
    .input(z.object({
      deviceId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return deviceCrudService.delete(input.deviceId);
    }),

  /**
   * 批量删除设备
   */
  deleteBatch: protectedProcedure
    .input(z.object({
      deviceIds: z.array(z.string()).min(1).max(100),
    }))
    .mutation(async ({ input }) => {
      return deviceCrudService.deleteBatch(input.deviceIds);
    }),

  // ============ 状态管理 ============

  /**
   * 更新设备状态
   */
  updateStatus: protectedProcedure
    .input(z.object({
      deviceId: z.string(),
      status: deviceStatusSchema,
    }))
    .mutation(async ({ input }) => {
      return deviceCrudService.updateStatus(input.deviceId, input.status);
    }),

  /**
   * 批量更新设备状态
   */
  updateStatusBatch: protectedProcedure
    .input(z.object({
      deviceIds: z.array(z.string()).min(1).max(100),
      status: deviceStatusSchema,
    }))
    .mutation(async ({ input }) => {
      return deviceCrudService.updateStatusBatch(input.deviceIds, input.status);
    }),

  // ============ 统计和健康检查 ============

  /**
   * 获取设备统计信息
   */
  getStatistics: publicProcedure
    .query(async () => {
      return deviceCrudService.getStatistics();
    }),

  /**
   * 设备健康检查
   */
  healthCheck: publicProcedure
    .input(z.object({
      deviceId: z.string(),
    }))
    .query(async ({ input }) => {
      return deviceCrudService.healthCheck(input.deviceId);
    }),

  /**
   * 批量健康检查
   */
  healthCheckBatch: publicProcedure
    .input(z.object({
      deviceIds: z.array(z.string()).min(1).max(50),
    }))
    .query(async ({ input }) => {
      return deviceCrudService.healthCheckBatch(input.deviceIds);
    }),

  // ============ 元数据 ============

  /**
   * 获取设备类型列表
   */
  getDeviceTypes: publicProcedure
    .query(() => {
      return deviceCrudService.getDeviceTypes();
    }),

  /**
   * 获取设备状态列表
   */
  getDeviceStatuses: publicProcedure
    .query(() => {
      return deviceCrudService.getDeviceStatuses();
    }),

  // ============ 高级查询 ============

  /**
   * 搜索设备
   */
  search: publicProcedure
    .input(z.object({
      query: z.string().min(1).max(100),
      limit: z.number().int().min(1).max(50).default(10),
    }))
    .query(async ({ input }) => {
      const result = await deviceCrudService.list(
        { search: input.query },
        { pageSize: input.limit }
      );
      return result.items;
    }),

  /**
   * 按位置获取设备
   */
  getByLocation: publicProcedure
    .input(z.object({
      location: z.string(),
      status: deviceStatusSchema.optional(),
    }))
    .query(async ({ input }) => {
      const filter: any = { location: input.location };
      if (input.status) {
        filter.status = input.status;
      }
      const result = await deviceCrudService.list(filter, { pageSize: 100 });
      return result.items;
    }),

  /**
   * 按部门获取设备
   */
  getByDepartment: publicProcedure
    .input(z.object({
      department: z.string(),
      status: deviceStatusSchema.optional(),
    }))
    .query(async ({ input }) => {
      const filter: any = { department: input.department };
      if (input.status) {
        filter.status = input.status;
      }
      const result = await deviceCrudService.list(filter, { pageSize: 100 });
      return result.items;
    }),

  /**
   * 获取离线设备
   */
  getOfflineDevices: publicProcedure
    .input(z.object({
      hours: z.number().int().min(1).max(168).default(24),
    }).optional())
    .query(async ({ input }) => {
      const hours = input?.hours || 24;
      const since = new Date();
      since.setHours(since.getHours() - hours);
      
      const result = await deviceCrudService.list(
        { status: 'offline', offlineSince: since },
        { pageSize: 100, sortBy: 'lastHeartbeat', sortOrder: 'desc' }
      );
      return result.items;
    }),

  /**
   * 获取故障设备
   */
  getErrorDevices: publicProcedure
    .query(async () => {
      const result = await deviceCrudService.list(
        { status: 'error' },
        { pageSize: 100, sortBy: 'updatedAt', sortOrder: 'desc' }
      );
      return result.items;
    }),

  /**
   * 获取即将过保设备
   */
  getWarrantyExpiringDevices: publicProcedure
    .input(z.object({
      days: z.number().int().min(1).max(365).default(30),
    }).optional())
    .query(async ({ input }) => {
      const result = await deviceCrudService.list(
        { hasWarranty: true },
        { pageSize: 100, sortBy: 'updatedAt', sortOrder: 'asc' }
      );
      
      const days = input?.days || 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + days);
      
      return result.items.filter(d => 
        d.warrantyExpiry && d.warrantyExpiry <= cutoff
      );
    }),

  // ============ 标签管理 ============

  /**
   * 添加标签
   */
  addTags: protectedProcedure
    .input(z.object({
      deviceId: z.string(),
      tags: z.array(z.string()).min(1).max(20),
    }))
    .mutation(async ({ input }) => {
      const device = await deviceCrudService.getById(input.deviceId);
      if (!device) {
        throw new Error('Device not found');
      }
      
      const existingTags = device.metadata?.tags || [];
      const newTags = Array.from(new Set([...existingTags, ...input.tags]));
      
      return deviceCrudService.update(input.deviceId, {
        metadata: {
          ...device.metadata,
          tags: newTags,
        },
      });
    }),

  /**
   * 移除标签
   */
  removeTags: protectedProcedure
    .input(z.object({
      deviceId: z.string(),
      tags: z.array(z.string()).min(1),
    }))
    .mutation(async ({ input }) => {
      const device = await deviceCrudService.getById(input.deviceId);
      if (!device) {
        throw new Error('Device not found');
      }
      
      const existingTags = device.metadata?.tags || [];
      const newTags = existingTags.filter(t => !input.tags.includes(t));
      
      return deviceCrudService.update(input.deviceId, {
        metadata: {
          ...device.metadata,
          tags: newTags,
        },
      });
    }),

  /**
   * 按标签获取设备
   */
  getByTags: publicProcedure
    .input(z.object({
      tags: z.array(z.string()).min(1),
      matchAll: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      // 获取所有设备然后过滤（简化实现）
      const result = await deviceCrudService.list({}, { pageSize: 1000 });
      
      return result.items.filter(d => {
        const deviceTags = d.metadata?.tags || [];
        if (input.matchAll) {
          return input.tags.every(t => deviceTags.includes(t));
        } else {
          return input.tags.some(t => deviceTags.includes(t));
        }
      });
    }),
});

export type DeviceCrudRouter = typeof deviceCrudRouter;
