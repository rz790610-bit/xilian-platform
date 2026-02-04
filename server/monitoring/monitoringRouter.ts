/**
 * 西联智能平台 - 智能监控 tRPC 路由
 * XiLian Intelligent Platform - Smart Monitoring tRPC Router
 */

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../_core/trpc';
import { smartMonitoring } from './monitoringService';

export const monitoringRouter = router({
  // ============================================================
  // 综合仪表盘
  // ============================================================
  
  getDashboard: protectedProcedure
    .query(async () => {
      return await smartMonitoring.getDashboard();
    }),

  // ============================================================
  // 数据库监控
  // ============================================================
  
  getDatabaseStatus: protectedProcedure
    .query(async () => {
      return await smartMonitoring.getDatabaseStatus();
    }),

  // ============================================================
  // 插件监控
  // ============================================================
  
  getPluginStatus: protectedProcedure
    .query(async () => {
      return await smartMonitoring.getPluginStatus();
    }),

  // ============================================================
  // 引擎监控
  // ============================================================
  
  getEngineStatus: protectedProcedure
    .query(async () => {
      return await smartMonitoring.getEngineStatus();
    }),

  // ============================================================
  // 系统资源监控
  // ============================================================
  
  getSystemResources: protectedProcedure
    .query(async () => {
      return await smartMonitoring.getSystemResources();
    }),

  // ============================================================
  // 服务健康检查
  // ============================================================
  
  getServiceHealth: protectedProcedure
    .query(async () => {
      return await smartMonitoring.getServiceHealth();
    }),

  // ============================================================
  // 告警管理
  // ============================================================
  
  getAlerts: protectedProcedure
    .input(z.object({
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
      source: z.string().optional(),
      acknowledged: z.boolean().optional(),
      limit: z.number().optional()
    }).optional())
    .query(async ({ input }) => {
      return await smartMonitoring.getAlerts(input);
    }),

  acknowledgeAlert: protectedProcedure
    .input(z.object({
      alertId: z.string()
    }))
    .mutation(async ({ input }) => {
      return await smartMonitoring.acknowledgeAlert(input.alertId);
    }),

  resolveAlert: protectedProcedure
    .input(z.object({
      alertId: z.string()
    }))
    .mutation(async ({ input }) => {
      return await smartMonitoring.resolveAlert(input.alertId);
    }),

  // ============================================================
  // 监控控制
  // ============================================================
  
  startMonitoring: protectedProcedure
    .input(z.object({
      intervalMs: z.number().min(5000).max(300000).optional()
    }).optional())
    .mutation(async ({ input }) => {
      smartMonitoring.startMonitoring(input?.intervalMs);
      return { success: true, message: '监控已启动' };
    }),

  stopMonitoring: protectedProcedure
    .mutation(async () => {
      smartMonitoring.stopMonitoring();
      return { success: true, message: '监控已停止' };
    })
});
