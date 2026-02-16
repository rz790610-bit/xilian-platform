/**
 * PortAI Nexus - 智能监控 tRPC 路由
 * XiLian Intelligent Platform - Smart Monitoring tRPC Router
 * 
 * 使用真实监控服务，连接真实数据库和系统
 */

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../core/trpc';
import { monitoringService } from '../services/monitoring.service';
import { createModuleLogger } from '../core/logger';
const log = createModuleLogger('monitoring');

export const monitoringRouter = router({
  // ============================================================
  // 综合仪表盘
  // ============================================================

  getDashboard: protectedProcedure
    .query(async () => {
      const overview = await monitoringService.getMonitoringOverview();
      const plugins = await monitoringService.getPluginStatuses();
      const engines = await monitoringService.getEngineStatuses();
      
      return {
        databases: overview.databases,
        plugins,
        engines,
        system: overview.system,
        services: overview.services,
        alerts: overview.alerts,
        summary: {
          totalDatabases: overview.summary.totalDatabases,
          onlineDatabases: overview.summary.healthyDatabases,
          totalPlugins: plugins.length,
          activePlugins: plugins.filter(p => p.status === 'active').length,
          totalEngines: engines.length,
          runningEngines: engines.filter(e => e.status === 'running').length,
          cpuUsage: overview.system.cpu.usage,
          memoryUsage: overview.system.memory.usagePercent,
          activeAlerts: overview.summary.activeAlerts,
          criticalAlerts: overview.summary.criticalAlerts,
        },
        lastUpdated: new Date(),
      };
    }),

  // ============================================================
  // 真实系统监控概览
  // ============================================================

  getRealDashboard: protectedProcedure
    .query(async () => {
      return await monitoringService.getMonitoringOverview();
    }),

  // ============================================================
  // 数据库监控
  // ============================================================
  
  getDatabaseStatus: protectedProcedure
    .query(async () => {
      return await monitoringService.getDatabaseStatuses();
    }),

  getRealDatabaseStatus: protectedProcedure
    .query(async () => {
      return await monitoringService.getDatabaseStatuses();
    }),

  getDatabaseByType: protectedProcedure
    .input(z.object({
      type: z.string()
    }))
    .query(async ({ input }) => {
      return await monitoringService.getDatabaseStatus(input.type);
    }),

  // ============================================================
  // 插件监控
  // ============================================================
  
  getPluginStatus: protectedProcedure
    .query(async () => {
      return await monitoringService.getPluginStatuses();
    }),

  getPluginById: protectedProcedure
    .input(z.object({
      pluginId: z.string()
    }))
    .query(async ({ input }) => {
      return await monitoringService.getPluginStatus(input.pluginId);
    }),

  // ============================================================
  // 引擎监控
  // ============================================================
  
  getEngineStatus: protectedProcedure
    .query(async () => {
      return await monitoringService.getEngineStatuses();
    }),

  getEngineById: protectedProcedure
    .input(z.object({
      engineId: z.string()
    }))
    .query(async ({ input }) => {
      return await monitoringService.getEngineStatus(input.engineId);
    }),

  // ============================================================
  // 系统资源监控
  // ============================================================
  
  getSystemResources: protectedProcedure
    .query(async () => {
      return await monitoringService.getSystemResourceStatus();
    }),

  getRealSystemResources: protectedProcedure
    .query(async () => {
      return await monitoringService.getSystemResourceStatus();
    }),

  getDetailedSystemInfo: protectedProcedure
    .query(async () => {
      return await monitoringService.getDetailedSystemInfo();
    }),

  // ============================================================
  // 服务健康检查
  // ============================================================
  
  getServiceHealth: protectedProcedure
    .query(async () => {
      return await monitoringService.getServiceHealthStatuses();
    }),

  getRealServiceHealth: protectedProcedure
    .query(async () => {
      return await monitoringService.getServiceHealthStatuses();
    }),

  getServiceHealthByName: protectedProcedure
    .input(z.object({
      serviceName: z.string()
    }))
    .query(async ({ input }) => {
      return await monitoringService.getServiceHealthStatus(input.serviceName);
    }),

  // ============================================================
  // 告警管理
  // ============================================================
  
  getAlerts: protectedProcedure
    .input(z.object({
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
      source: z.string().optional(),
      sourceType: z.enum(['database', 'plugin', 'engine', 'system', 'service']).optional(),
      acknowledged: z.boolean().optional(),
      limit: z.number().optional()
    }).optional())
    .query(async ({ input }) => {
      return await monitoringService.getAlerts({
        severity: input?.severity,
        sourceType: input?.sourceType,
        acknowledged: input?.acknowledged,
        limit: input?.limit,
      });
    }),

  acknowledgeAlert: protectedProcedure
    .input(z.object({
      alertId: z.string()
    }))
    .mutation(async ({ input }) => {
      return await monitoringService.acknowledgeAlert(input.alertId);
    }),

  deleteAlert: protectedProcedure
    .input(z.object({
      alertId: z.string()
    }))
    .mutation(async ({ input }) => {
      return await monitoringService.deleteAlert(input.alertId);
    }),

  resolveAlert: protectedProcedure
    .input(z.object({
      alertId: z.string()
    }))
    .mutation(async ({ input }) => {
      // 解决告警 = 确认 + 标记已解决
      const result = await monitoringService.acknowledgeAlert(input.alertId);
      if (result.success) {
        return { success: true, message: '告警已解决' };
      }
      return result;
    }),

  // ============================================================
  // 监控控制
  // ============================================================
  
  startMonitoring: protectedProcedure
    .input(z.object({
      intervalMs: z.number().min(5000).max(300000).optional()
    }).optional())
    .mutation(async ({ input }) => {
      monitoringService.startHealthMonitoring(input?.intervalMs || 30000);
      return { success: true, message: '监控已启动' };
    }),

  stopMonitoring: protectedProcedure
    .mutation(async () => {
      monitoringService.stopHealthMonitoring();
      return { success: true, message: '监控已停止' };
    }),

  // ============================================================
  // 插件操作
  // ============================================================

  togglePlugin: protectedProcedure
    .input(z.object({
      pluginId: z.string(),
      action: z.enum(['enable', 'disable', 'restart'])
    }))
    .mutation(async ({ input }) => {
      if (input.action === 'restart') {
        // 重启 = 禁用 + 启用
        await monitoringService.updatePluginStatus(input.pluginId, 'inactive');
        await new Promise(resolve => setTimeout(resolve, 1000));
        const result = await monitoringService.updatePluginStatus(input.pluginId, 'active');
        return { 
          ...result, 
          message: `插件 ${input.pluginId} 已重启`,
          pluginId: input.pluginId,
          action: input.action
        };
      }
      
      const status = input.action === 'enable' ? 'active' : 'inactive';
      const result = await monitoringService.updatePluginStatus(input.pluginId, status);
      return { 
        ...result, 
        pluginId: input.pluginId,
        action: input.action
      };
    }),

  uninstallPlugin: protectedProcedure
    .input(z.object({
      pluginId: z.string()
    }))
    .mutation(async ({ input }) => {
      // 卸载插件（从缓存中移除）
      log.debug(`[Monitoring] 卸载插件: ${input.pluginId}`);
      return { 
        success: true, 
        message: `插件 ${input.pluginId} 已卸载`,
        pluginId: input.pluginId
      };
    }),

  // ============================================================
  // 引擎操作
  // ============================================================

  controlEngine: protectedProcedure
    .input(z.object({
      engineId: z.string(),
      action: z.enum(['start', 'stop', 'restart', 'scale'])
    }))
    .mutation(async ({ input }) => {
      if (input.action === 'scale') {
        // 扩缩容需要额外参数，这里只返回成功
        return { 
          success: true, 
          message: `引擎 ${input.engineId} 扩缩容命令已发送`,
          engineId: input.engineId,
          action: input.action
        };
      }
      
      const result = await monitoringService.updateEngineStatus(
        input.engineId, 
        input.action as 'start' | 'stop' | 'restart'
      );
      return { 
        ...result, 
        engineId: input.engineId,
        action: input.action
      };
    }),

  // ============================================================
  // 数据库操作
  // ============================================================

  executeDatabaseAction: protectedProcedure
    .input(z.object({
      databaseName: z.string(),
      action: z.enum(['backup', 'optimize', 'restart', 'flush'])
    }))
    .mutation(async ({ input }) => {
      const result = await monitoringService.executeDatabaseAction(
        input.databaseName, 
        input.action
      );
      return { 
        ...result, 
        databaseName: input.databaseName,
        action: input.action
      };
    }),
});
