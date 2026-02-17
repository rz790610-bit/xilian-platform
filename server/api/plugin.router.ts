/**
 * 插件管理 API 路由（增强版 - 安全沙箱）
 * 
 * 新增路由：
 * - secureInstall: 安全安装（manifest 校验 + 签名验证 + 权限审批 + 沙箱创建）
 * - secureExecute: 安全执行（熔断器 + 资源限制 + 权限拦截）
 * - secureUninstall: 安全卸载（沙箱销毁 + 熔断器重置）
 * - validateManifest: 校验 manifest
 * - reviewPlugin: 安全审查
 * - approvePlugin: 管理员审批
 * - getSecurityOverview: 插件安全概览
 * - getSecurityDashboard: 全局安全仪表盘
 * - getAuditLog: 权限审计日志
 * - getSecurityEvents: 安全事件查询
 * - grantPermission: 动态授权
 * - revokePermission: 动态撤权
 * - resetCircuitBreaker: 重置熔断器
 * - getResourceSnapshots: 资源使用快照
 * - manageTrustedSigners: 管理受信任签名者
 */

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../core/trpc';
import { pluginEngine, PluginType } from '../services/plugin.engine';
import {
  validateManifest as validateManifestFn,
  parseManifestYaml,
  ALL_PERMISSIONS,
  RESOURCE_LIMIT_PRESETS,
  trustedSignerStore,
  type PluginManifest,
  type PluginPermission,
} from '../services/plugin.manifest';
import { sandboxManager } from '../services/plugin.sandbox';
import { securityOrchestrator, type TrustLevel } from '../services/plugin.security';

// Zod schemas
const pluginPermissionSchema = z.enum(ALL_PERMISSIONS as [string, ...string[]]);
const trustLevelSchema = z.enum(['untrusted', 'basic', 'verified', 'trusted', 'system']);

const manifestInputSchema = z.object({
  manifestVersion: z.enum(['1.0', '1.1']),
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.object({
    name: z.string(),
    email: z.string().optional(),
    url: z.string().optional(),
  }),
  license: z.string().optional().default('MIT'),
  type: z.enum(['source', 'processor', 'sink', 'analyzer', 'visualizer', 'integration', 'utility']),
  main: z.string(),
  icon: z.string().optional(),
  platformVersion: z.string().optional().default('1.0.0'),
  dependencies: z.record(z.string(), z.string()).optional(),
  permissions: z.array(z.string()),
  resourceLimits: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  networkPolicy: z.object({
    allowedHosts: z.array(z.string()).optional(),
    allowedPorts: z.array(z.number()).optional(),
    allowPrivateNetwork: z.boolean().optional(),
    allowDnsResolution: z.boolean().optional(),
  }).optional(),
  configSchema: z.record(z.string(), z.unknown()).optional(),
  events: z.object({
    subscribes: z.array(z.string()).optional(),
    publishes: z.array(z.string()).optional(),
  }).optional(),
  ui: z.object({
    widgets: z.array(z.object({
      id: z.string(),
      name: z.string(),
      component: z.string(),
      position: z.enum(['dashboard', 'sidebar', 'toolbar', 'detail-panel']),
    })).optional(),
    pages: z.array(z.object({
      id: z.string(),
      name: z.string(),
      path: z.string(),
      component: z.string(),
    })).optional(),
  }).optional(),
  signature: z.object({
    algorithm: z.enum(['sha256-rsa', 'sha256-ecdsa']),
    publicKey: z.string(),
    digest: z.string(),
    signedAt: z.string(),
  }).optional(),
});

export const pluginRouter = router({
  // ==================== 原有路由（保持兼容） ====================

  /** 获取所有插件 */
  list: publicProcedure.query(async () => {
    return pluginEngine.getAllPlugins();
  }),

  /** 按类型获取插件 */
  listByType: publicProcedure
    .input(z.object({
      type: z.enum(['source', 'processor', 'sink', 'analyzer', 'visualizer', 'integration', 'utility']),
    }))
    .query(async ({ input }) => {
      return pluginEngine.getPluginsByType(input.type as PluginType);
    }),

  /** 获取插件详情 */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const status = pluginEngine.getPluginStatus(input.id);
      if (!status) {
        throw new Error(`Plugin ${input.id} not found`);
      }
      return status;
    }),

  /** 启用插件 */
  enable: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await pluginEngine.enablePlugin(input.id);
      return { success: true };
    }),

  /** 禁用插件 */
  disable: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await pluginEngine.disablePlugin(input.id);
      return { success: true };
    }),

  /** 卸载插件 */
  uninstall: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await pluginEngine.uninstallPlugin(input.id);
      return { success: true };
    }),

  /** 执行插件 */
  execute: protectedProcedure
    .input(z.object({
      id: z.string(),
      config: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await pluginEngine.executePlugin(input.id, input.config || {});
      return { success: true, result };
    }),

  /** 更新插件配置 */
  updateConfig: protectedProcedure
    .input(z.object({
      id: z.string(),
      config: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ input }) => {
      await pluginEngine.updatePluginConfig(input.id, input.config);
      return { success: true };
    }),

  /** 健康检查所有插件 */
  healthCheck: publicProcedure.query(async () => {
    return pluginEngine.healthCheckAll();
  }),

  /** 获取可用的插件类型 */
  getTypes: publicProcedure.query(async () => {
    return [
      { type: 'source', name: '数据源', description: '数据采集插件' },
      { type: 'processor', name: '处理器', description: '数据处理和转换插件' },
      { type: 'sink', name: '目标', description: '数据输出插件' },
      { type: 'analyzer', name: '分析器', description: '数据分析插件' },
      { type: 'visualizer', name: '可视化', description: '数据可视化插件' },
      { type: 'integration', name: '集成', description: '第三方服务集成插件' },
      { type: 'utility', name: '工具', description: '通用工具插件' },
    ];
  }),

  // ==================== 安全沙箱路由 ====================

  /** 校验 Manifest */
  validateManifest: publicProcedure
    .input(z.object({
      manifest: z.union([
        manifestInputSchema,
        z.string(), // YAML 字符串
      ]),
    }))
    .mutation(async ({ input }) => {
      let manifestObj: unknown;
      if (typeof input.manifest === 'string') {
        manifestObj = parseManifestYaml(input.manifest);
      } else {
        manifestObj = input.manifest;
      }
      return validateManifestFn(manifestObj);
    }),

  /** 安全安装插件 */
  secureInstall: protectedProcedure
    .input(z.object({
      manifest: manifestInputSchema,
      pluginCode: z.string(),
      trustLevel: trustLevelSchema.optional().default('basic'),
    }))
    .mutation(async ({ input }) => {
      const result = await securityOrchestrator.secureInstall(
        input.manifest as unknown as PluginManifest,
        input.pluginCode,
        null,
        input.trustLevel as TrustLevel,
      );
      return result;
    }),

  /** 安全执行插件 */
  secureExecute: protectedProcedure
    .input(z.object({
      pluginId: z.string(),
      method: z.string(),
      args: z.array(z.unknown()).optional().default([]),
      timeout: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return securityOrchestrator.secureExecute({
        pluginId: input.pluginId,
        method: input.method,
        args: input.args,
        timeout: input.timeout,
      });
    }),

  /** 安全卸载插件 */
  secureUninstall: protectedProcedure
    .input(z.object({ pluginId: z.string() }))
    .mutation(async ({ input }) => {
      const success = securityOrchestrator.secureUninstall(input.pluginId);
      return { success };
    }),

  /** 安全审查插件 */
  reviewPlugin: protectedProcedure
    .input(z.object({
      manifest: manifestInputSchema,
      trustLevel: trustLevelSchema.optional().default('basic'),
    }))
    .mutation(async ({ input }) => {
      return securityOrchestrator.getReviewEngine().reviewPlugin(
        input.manifest as unknown as PluginManifest,
        null,
        input.trustLevel as TrustLevel,
      );
    }),

  /** 管理员审批插件 */
  approvePlugin: protectedProcedure
    .input(z.object({
      pluginId: z.string(),
      approvedBy: z.string(),
      approvedPermissions: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const success = securityOrchestrator.getReviewEngine().approvePlugin(
        input.pluginId,
        input.approvedBy,
        input.approvedPermissions as PluginPermission[] | undefined,
      );
      return { success };
    }),

  /** 拒绝插件 */
  rejectPlugin: protectedProcedure
    .input(z.object({
      pluginId: z.string(),
      rejectedBy: z.string(),
      reason: z.string(),
    }))
    .mutation(async ({ input }) => {
      const success = securityOrchestrator.getReviewEngine().rejectPlugin(
        input.pluginId,
        input.rejectedBy,
        input.reason,
      );
      return { success };
    }),

  /** 获取插件安全概览 */
  getSecurityOverview: publicProcedure
    .input(z.object({ pluginId: z.string() }))
    .query(async ({ input }) => {
      return securityOrchestrator.getPluginSecurityOverview(input.pluginId);
    }),

  /** 获取全局安全仪表盘 */
  getSecurityDashboard: publicProcedure.query(async () => {
    return securityOrchestrator.getSecurityDashboard();
  }),

  /** 获取权限审计日志 */
  getAuditLog: publicProcedure
    .input(z.object({
      pluginId: z.string().optional(),
      permission: z.string().optional(),
      allowed: z.boolean().optional(),
      since: z.string().optional(),
      limit: z.number().optional().default(100),
    }))
    .query(async ({ input }) => {
      return sandboxManager.getPermissionGateway().getAuditLog(input);
    }),

  /** 获取安全事件 */
  getSecurityEvents: publicProcedure
    .input(z.object({
      pluginId: z.string().optional(),
      type: z.string().optional(),
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      resolved: z.boolean().optional(),
      since: z.string().optional(),
      limit: z.number().optional().default(100),
    }))
    .query(async ({ input }) => {
      return securityOrchestrator.getSecurityEvents().query(input as any);
    }),

  /** 解决安全事件 */
  resolveSecurityEvent: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .mutation(async ({ input }) => {
      const success = securityOrchestrator.getSecurityEvents().resolve(input.eventId);
      return { success };
    }),

  /** 获取安全统计 */
  getSecurityStats: publicProcedure.query(async () => {
    return securityOrchestrator.getSecurityEvents().getStats();
  }),

  /** 动态授予权限 */
  grantPermission: protectedProcedure
    .input(z.object({
      pluginId: z.string(),
      permission: z.string(),
      grantedBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      const success = sandboxManager.getPermissionGateway().grantPermission(
        input.pluginId,
        input.permission as PluginPermission,
        input.grantedBy,
      );
      return { success };
    }),

  /** 动态撤销权限 */
  revokePermission: protectedProcedure
    .input(z.object({
      pluginId: z.string(),
      permission: z.string(),
      revokedBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      const success = sandboxManager.getPermissionGateway().revokePermission(
        input.pluginId,
        input.permission as PluginPermission,
        input.revokedBy,
      );
      return { success };
    }),

  /** 重置熔断器 */
  resetCircuitBreaker: protectedProcedure
    .input(z.object({ pluginId: z.string() }))
    .mutation(async ({ input }) => {
      securityOrchestrator.getCircuitBreaker().reset(input.pluginId);
      return { success: true };
    }),

  /** 获取资源使用快照 */
  getResourceSnapshots: publicProcedure.query(async () => {
    return sandboxManager.getResourceMonitor().getAllSnapshots();
  }),

  /** 获取沙箱状态 */
  getSandboxStatus: publicProcedure.query(async () => {
    return sandboxManager.getAllStatus();
  }),

  /** 获取所有可用权限 */
  getAvailablePermissions: publicProcedure.query(async () => {
    return ALL_PERMISSIONS.map(p => {
      const [category, action] = p.split(':');
      return {
        permission: p,
        category,
        action,
        highRisk: HIGH_RISK_PERMISSIONS.includes(p as any),
        description: getPermissionDescription(p),
      };
    });
  }),

  /** 获取资源限制预设 */
  getResourcePresets: publicProcedure.query(async () => {
    return Object.entries(RESOURCE_LIMIT_PRESETS).map(([name, limits]) => ({
      name,
      ...limits,
    }));
  }),

  /** 管理受信任签名者 */
  listTrustedSigners: publicProcedure.query(async () => {
    return trustedSignerStore.getAllSigners();
  }),

  addTrustedSigner: protectedProcedure
    .input(z.object({
      name: z.string(),
      publicKeyPem: z.string(),
      addedBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      return trustedSignerStore.addSigner(input.name, input.publicKeyPem, input.addedBy);
    }),

  removeTrustedSigner: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const success = trustedSignerStore.removeSigner(input.id);
      return { success };
    }),
});

// 权限描述映射
function getPermissionDescription(perm: string): string {
  const descriptions: Record<string, string> = {
    'storage:read': '读取插件专属存储空间',
    'storage:write': '写入插件专属存储空间',
    'network:http': '发起 HTTP 出站请求',
    'network:ws': '建立 WebSocket 连接',
    'event:subscribe': '订阅平台事件总线',
    'event:publish': '向平台事件总线发布事件',
    'data:device:read': '读取设备管理数据',
    'data:sensor:read': '读取传感器实时数据',
    'data:alert:read': '读取告警记录',
    'data:alert:write': '创建或更新告警',
    'data:kg:read': '查询知识图谱',
    'data:kg:write': '写入知识图谱节点和关系',
    'model:inference': '调用 LLM/AI 模型推理',
    'model:embed': '调用向量嵌入模型',
    'ui:notification': '向前端发送通知',
    'ui:widget': '注册 UI 扩展组件',
    'system:config:read': '读取系统配置参数',
    'system:log': '写入系统日志',
  };
  return descriptions[perm] || perm;
}

// 导入高风险权限常量
import { HIGH_RISK_PERMISSIONS } from '../services/plugin.manifest';
