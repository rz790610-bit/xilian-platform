/**
 * 基础设施层 tRPC 路由
 * Docker Engine + 环境变量管理
 */

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../core/trpc';
import { infrastructureService } from '../services/infrastructure.service';

export const infrastructureRouter = router({
  // ============ Docker 概览 ============

  getOverview: publicProcedure.query(async () => {
    try {
      return await infrastructureService.getOverview();
    } catch {
      return {
        _fallback: true,
        docker: {
          connected: false,
          containers: { total: 0, running: 0, stopped: 0, failed: 0 },
          images: 0,
          volumes: 0,
        },
        secrets: {
          mode: 'env' as const,
          total: 0,
          configured: 0,
          unconfigured: 0,
          categories: 0,
        },
      };
    }
  }),

  getHealth: publicProcedure.query(async () => {
    try {
      return await infrastructureService.getHealth();
    } catch {
      return {
        _fallback: true,
        status: 'unhealthy' as const,
        components: {
          docker: { status: 'disconnected' },
          secrets: { status: 'disconnected' },
        },
      };
    }
  }),

  checkConnections: publicProcedure.query(async () => {
    return await infrastructureService.checkConnections();
  }),

  // ============ Docker 容器管理 ============

  getContainers: publicProcedure.query(async () => {
    try {
      return await infrastructureService.getContainers();
    } catch {
      return [];
    }
  }),

  getContainer: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ input }) => {
      return await infrastructureService.getContainer(input.name);
    }),

  getHostInfo: publicProcedure.query(async () => {
    return await infrastructureService.getHostInfo();
  }),

  restartContainer: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      try {
        return await infrastructureService.restartContainer(input.name);
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }),

  stopContainer: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      try {
        return await infrastructureService.stopContainer(input.name);
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }),

  startContainer: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      try {
        return await infrastructureService.startContainer(input.name);
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }),

  getContainerLogs: publicProcedure
    .input(z.object({
      name: z.string(),
      tailLines: z.number().optional(),
    }))
    .query(async ({ input }) => {
      try {
        return await infrastructureService.getContainerLogs(input.name, input.tailLines);
      } catch {
        return '';
      }
    }),

  getRunningServices: publicProcedure.query(async () => {
    try {
      return await infrastructureService.getRunningServices();
    } catch {
      return [];
    }
  }),

  // ============ 环境变量 / 密钥管理 ============

  getSecretsHealth: publicProcedure.query(async () => {
    try {
      return await infrastructureService.getSecretsHealth();
    } catch {
      return null;
    }
  }),

  getSecretsOverview: publicProcedure.query(async () => {
    try {
      return await infrastructureService.getSecretsOverview();
    } catch {
      return { mode: 'env' as const, total: 0, configured: 0, unconfigured: 0, categories: [] };
    }
  }),

  listSecrets: publicProcedure
    .input(z.object({
      category: z.string(),
      path: z.string().optional(),
    }))
    .query(async ({ input }) => {
      try {
        return await infrastructureService.listSecrets(input.category, input.path);
      } catch {
        return [];
      }
    }),

  readSecret: protectedProcedure
    .input(z.object({
      category: z.string(),
      path: z.string(),
    }))
    .query(async ({ input }) => {
      try {
        return await infrastructureService.readSecret(input.category, input.path);
      } catch {
        return null;
      }
    }),

  writeSecret: protectedProcedure
    .input(z.object({
      category: z.string(),
      path: z.string(),
      data: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ input }) => {
      try {
        return await infrastructureService.writeSecret(input.category, input.path, input.data);
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }),

  deleteSecret: protectedProcedure
    .input(z.object({
      category: z.string(),
      path: z.string(),
    }))
    .mutation(async ({ input }) => {
      try {
        return await infrastructureService.deleteSecret(input.category, input.path);
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }),

  listSecretPolicies: publicProcedure.query(async () => {
    try {
      return await infrastructureService.listSecretPolicies();
    } catch {
      return [];
    }
  }),

  listSecretCategories: publicProcedure.query(async () => {
    try {
      return await infrastructureService.listSecretCategories();
    } catch {
      return [];
    }
  }),

  // ============ Docker 网络管理 ============

  getNetworks: publicProcedure.query(async () => {
    return await infrastructureService.getNetworks();
  }),

  createNetwork: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      return await infrastructureService.createNetwork(input.name);
    }),

  deleteNetwork: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      return await infrastructureService.deleteNetwork(input.name);
    }),

  // ============ Docker 存储管理 ============

  getStorageDrivers: publicProcedure.query(async () => {
    return await infrastructureService.getStorageDrivers();
  }),

  getVolumes: publicProcedure.query(async () => {
    return await infrastructureService.getVolumes();
  }),

  // ============ 综合概览 ============

  getSummary: publicProcedure.query(async () => {
    try {
      const dockerOverview = await infrastructureService.getDockerOverview();
      const secretsOverview = await infrastructureService.getSecretsOverview();

      return {
        docker: {
          connected: dockerOverview.connected,
          containers: dockerOverview.containers.total,
          running: dockerOverview.containers.running,
          images: dockerOverview.images,
          volumes: dockerOverview.volumes,
        },
        secrets: {
          total: secretsOverview.total,
          configured: secretsOverview.configured,
          categories: secretsOverview.categories.length,
        },
        networks: (await infrastructureService.getNetworks()).length,
      };
    } catch {
      // 降级：返回与 try 分支相同的结构，避免联合类型问题
      return {
        docker: { connected: false, containers: 0, running: 0, images: 0, volumes: 0 },
        secrets: { total: 0, configured: 0, categories: 0 },
        networks: 0,
      };
    }
  }),
});
