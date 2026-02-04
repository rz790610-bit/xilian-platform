/**
 * 可观测性路由 API
 */

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../_core/trpc';
import {
  PrometheusService,
  ELKService,
  TracingService,
  AlertmanagerService,
  getObservabilitySummary,
} from './observabilityService';

export const observabilityRouter = router({
  // ==================== 概览 ====================
  
  getSummary: publicProcedure.query(() => {
    return getObservabilitySummary();
  }),

  // ==================== Prometheus 指标 ====================
  
  getNodeMetrics: publicProcedure
    .input(z.object({ hostname: z.string().optional() }).optional())
    .query(({ input }) => {
      return PrometheusService.getInstance().getNodeMetrics(input?.hostname);
    }),

  getContainerMetrics: publicProcedure
    .input(z.object({ containerName: z.string().optional() }).optional())
    .query(({ input }) => {
      return PrometheusService.getInstance().getContainerMetrics(input?.containerName);
    }),

  getApplicationMetrics: publicProcedure
    .input(z.object({ serviceName: z.string().optional() }).optional())
    .query(({ input }) => {
      return PrometheusService.getInstance().getApplicationMetrics(input?.serviceName);
    }),

  getGpuMetrics: publicProcedure
    .input(z.object({ gpuId: z.number().optional() }).optional())
    .query(({ input }) => {
      return PrometheusService.getInstance().getGpuMetrics(input?.gpuId);
    }),

  queryPrometheus: publicProcedure
    .input(z.object({
      expr: z.string(),
      time: z.number().optional(),
    }))
    .query(({ input }) => {
      return PrometheusService.getInstance().query(input.expr, input.time);
    }),

  queryPrometheusRange: publicProcedure
    .input(z.object({
      expr: z.string(),
      start: z.number(),
      end: z.number(),
      step: z.number(),
    }))
    .query(({ input }) => {
      return PrometheusService.getInstance().queryRange(input.expr, input.start, input.end, input.step);
    }),

  // ==================== ELK 日志 ====================
  
  searchLogs: publicProcedure
    .input(z.object({
      level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']).optional(),
      service: z.string().optional(),
      message: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      limit: z.number().optional(),
    }).optional())
    .query(({ input }) => {
      return ELKService.getInstance().searchLogs(input || {});
    }),

  getLogStats: publicProcedure.query(() => {
    return ELKService.getInstance().getLogStats();
  }),

  getFilebeatConfig: publicProcedure.query(() => {
    return ELKService.getInstance().getFilebeatConfig();
  }),

  getLogstashPipelines: publicProcedure.query(() => {
    return ELKService.getInstance().getLogstashPipelines();
  }),

  getILMPolicy: publicProcedure.query(() => {
    return ELKService.getInstance().getILMPolicy();
  }),

  getKibanaVisualizations: publicProcedure.query(() => {
    return ELKService.getInstance().getKibanaVisualizations();
  }),

  // ==================== Jaeger/OTel 追踪 ====================
  
  searchTraces: publicProcedure
    .input(z.object({
      service: z.string().optional(),
      operation: z.string().optional(),
      tags: z.record(z.string(), z.string()).optional(),
      minDuration: z.number().optional(),
      maxDuration: z.number().optional(),
      startTime: z.number().optional(),
      endTime: z.number().optional(),
      limit: z.number().optional(),
    }).optional())
    .query(({ input }) => {
      return TracingService.getInstance().searchTraces(input || {});
    }),

  getTrace: publicProcedure
    .input(z.object({ traceId: z.string() }))
    .query(({ input }) => {
      return TracingService.getInstance().getTrace(input.traceId);
    }),

  getServiceDependencies: publicProcedure.query(() => {
    return TracingService.getInstance().getServiceDependencies();
  }),

  getOTelConfig: publicProcedure.query(() => {
    return TracingService.getInstance().getOTelConfig();
  }),

  getTracingStats: publicProcedure.query(() => {
    return TracingService.getInstance().getStats();
  }),

  // ==================== Alertmanager 告警 ====================
  
  getAlerts: publicProcedure
    .input(z.object({
      severity: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
      status: z.enum(['firing', 'resolved', 'silenced']).optional(),
    }).optional())
    .query(({ input }) => {
      return AlertmanagerService.getInstance().getAlerts(input);
    }),

  getAlertRules: publicProcedure.query(() => {
    return AlertmanagerService.getInstance().getAlertRules();
  }),

  createAlertRule: protectedProcedure
    .input(z.object({
      name: z.string(),
      expr: z.string(),
      for: z.string(),
      severity: z.enum(['P0', 'P1', 'P2', 'P3']),
      labels: z.record(z.string(), z.string()),
      annotations: z.object({
        summary: z.string(),
        description: z.string(),
        runbook_url: z.string().optional(),
      }),
      enabled: z.boolean(),
    }))
    .mutation(({ input }) => {
      return AlertmanagerService.getInstance().createAlertRule(input);
    }),

  updateAlertRule: protectedProcedure
    .input(z.object({
      id: z.string(),
      updates: z.object({
        name: z.string().optional(),
        expr: z.string().optional(),
        for: z.string().optional(),
        severity: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
        enabled: z.boolean().optional(),
      }),
    }))
    .mutation(({ input }) => {
      return AlertmanagerService.getInstance().updateAlertRule(input.id, input.updates);
    }),

  deleteAlertRule: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      return AlertmanagerService.getInstance().deleteAlertRule(input.id);
    }),

  getReceivers: publicProcedure.query(() => {
    return AlertmanagerService.getInstance().getReceivers();
  }),

  createReceiver: protectedProcedure
    .input(z.object({
      name: z.string(),
      type: z.enum(['pagerduty', 'wechat', 'email', 'webhook', 'slack']),
      config: z.record(z.string(), z.unknown()),
    }))
    .mutation(({ input }) => {
      return AlertmanagerService.getInstance().createReceiver(input as any);
    }),

  getRoutes: publicProcedure.query(() => {
    return AlertmanagerService.getInstance().getRoutes();
  }),

  getSilences: publicProcedure.query(() => {
    return AlertmanagerService.getInstance().getSilences();
  }),

  createSilence: protectedProcedure
    .input(z.object({
      matchers: z.array(z.object({
        name: z.string(),
        value: z.string(),
        isRegex: z.boolean(),
        isEqual: z.boolean(),
      })),
      startsAt: z.string(),
      endsAt: z.string(),
      createdBy: z.string(),
      comment: z.string(),
    }))
    .mutation(({ input }) => {
      return AlertmanagerService.getInstance().createSilence(input);
    }),

  deleteSilence: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      return AlertmanagerService.getInstance().deleteSilence(input.id);
    }),

  sendTestAlert: protectedProcedure
    .input(z.object({
      receiver: z.string(),
      severity: z.enum(['P0', 'P1', 'P2', 'P3']),
    }))
    .mutation(({ input }) => {
      return AlertmanagerService.getInstance().sendTestAlert(input.receiver, input.severity);
    }),

  getAlertStats: publicProcedure.query(() => {
    return AlertmanagerService.getInstance().getStats();
  }),
});
