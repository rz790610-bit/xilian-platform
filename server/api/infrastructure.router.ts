/**
 * 基础设施层 tRPC 路由
 * 使用真实 K8s/Vault/ArgoCD 客户端
 */

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../core/trpc';
import { infrastructureService } from '../services/infrastructure.service';
// InfrastructureService 已合并为 infrastructureService 单例
const InfrastructureService = infrastructureService;

export const infrastructureRouter = router({
  // ============ 集群概览 ============
  
  getClusterOverview: publicProcedure.query(async () => {
    try {
      // 尝试使用真实服务
      const overview = await infrastructureService.getKubernetesOverview();
      return overview;
    } catch {
      // 回退到模拟服务
      return InfrastructureService.getClusterOverview();
    }
  }),

  getOverview: publicProcedure.query(async () => {
    try {
      return await infrastructureService.getOverview();
    } catch {
      // 回退到模拟数据
      return {
        kubernetes: {
          connected: false,
          nodes: { total: 0, ready: 0 },
          pods: { total: 0, running: 0, pending: 0, failed: 0 },
          deployments: { total: 0, available: 0 },
          services: 0,
          namespaces: 0,
        },
        vault: {
          connected: false,
          sealed: true,
          version: null,
          mounts: 0,
          policies: 0,
        },
        argocd: {
          connected: false,
          version: null,
          applications: { total: 0, synced: 0, healthy: 0 },
          projects: 0,
          repositories: 0,
        },
      };
    }
  }),

  getHealth: publicProcedure.query(async () => {
    try {
      return await infrastructureService.getHealth();
    } catch {
      return {
        status: 'unhealthy' as const,
        components: {
          kubernetes: { status: 'disconnected' },
          vault: { status: 'disconnected' },
          argocd: { status: 'disconnected' },
        },
      };
    }
  }),

  checkConnections: publicProcedure.query(async () => {
    return await infrastructureService.checkConnections();
  }),

  // ============ Kubernetes 节点管理 ============

  getNodes: publicProcedure.query(async () => {
    try {
      const nodes = await infrastructureService.getNodes();
      if (nodes.length > 0) {
        return nodes.map((node: any) => ({
          id: node.metadata?.uid || node.metadata?.name || '',
          name: node.metadata?.name || '',
          status: node.status?.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True' 
            ? 'ready' 
            : 'not_ready',
          role: node.metadata?.labels?.['node-role.kubernetes.io/master'] !== undefined 
            ? 'master' 
            : 'worker',
          cpu: {
            capacity: parseInt(node.status?.capacity?.cpu || '0'),
            allocatable: parseInt(node.status?.allocatable?.cpu || '0'),
            used: 0,
          },
          memory: {
            capacity: parseMemory(node.status?.capacity?.memory || '0'),
            allocatable: parseMemory(node.status?.allocatable?.memory || '0'),
            used: 0,
          },
          pods: {
            capacity: parseInt(node.status?.capacity?.pods || '0'),
            running: 0,
          },
          labels: node.metadata?.labels || {},
          taints: node.spec?.taints || [],
          conditions: node.status?.conditions || [],
          createdAt: new Date(node.metadata?.creationTimestamp || Date.now()),
        }));
      }
      return InfrastructureService.getNodes();
    } catch {
      return InfrastructureService.getNodes();
    }
  }),

  getNode: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      return InfrastructureService.getNode(input.id);
    }),

  updateNodeLabels: protectedProcedure
    .input(z.object({
      id: z.string(),
      labels: z.record(z.string(), z.string()),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.updateNodeLabels(input.id, input.labels);
    }),

  addNodeTaint: protectedProcedure
    .input(z.object({
      id: z.string(),
      taint: z.object({
        key: z.string(),
        value: z.string(),
        effect: z.enum(['NoSchedule', 'PreferNoSchedule', 'NoExecute']),
      }),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.addNodeTaint(input.id, input.taint);
    }),

  removeNodeTaint: protectedProcedure
    .input(z.object({
      id: z.string(),
      key: z.string(),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.removeNodeTaint(input.id, input.key);
    }),

  setNodeStatus: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(['ready', 'not_ready', 'scheduling_disabled', 'unknown']),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.setNodeStatus(input.id, input.status === 'ready');
    }),

  // ============ Kubernetes 命名空间 ============

  getNamespaces: publicProcedure.query(async () => {
    try {
      const namespaces = await infrastructureService.getNamespaces();
      if (namespaces.length > 0) {
        return namespaces.map((ns: any) => ({
          name: ns.metadata?.name || '',
          status: ns.status?.phase || 'Active',
          labels: ns.metadata?.labels || {},
          createdAt: new Date(ns.metadata?.creationTimestamp || Date.now()),
        }));
      }
      return [];
    } catch {
      return [];
    }
  }),

  createNamespace: protectedProcedure
    .input(z.object({
      name: z.string(),
      labels: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await infrastructureService.createNamespace(
          input.name,
          input.labels
        );
        return { success: !!result, namespace: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }),

  deleteNamespace: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const result = await infrastructureService.deleteNamespace(input.name);
        return { success: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }),

  // ============ Kubernetes Pods ============

  getPods: publicProcedure
    .input(z.object({ namespace: z.string().optional() }).optional())
    .query(async ({ input }) => {
      try {
        const pods = await infrastructureService.getPods(input?.namespace);
        return pods.map((pod: any) => ({
          name: pod.metadata?.name || '',
          namespace: pod.metadata?.namespace || '',
          status: pod.status?.phase || 'Unknown',
          containers: pod.spec?.containers?.length || 0,
          restarts: pod.status?.containerStatuses?.reduce(
            (sum: number, c: any) => sum + (c.restartCount || 0),
            0
          ) || 0,
          node: pod.spec?.nodeName || '',
          ip: pod.status?.podIP || '',
          createdAt: new Date(pod.metadata?.creationTimestamp || Date.now()),
        }));
      } catch {
        return [];
      }
    }),

  deletePod: protectedProcedure
    .input(z.object({
      name: z.string(),
      namespace: z.string(),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await infrastructureService.deletePod(
          input.name,
          input.namespace
        );
        return { success: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }),

  getPodLogs: publicProcedure
    .input(z.object({
      name: z.string(),
      namespace: z.string(),
      container: z.string().optional(),
      tailLines: z.number().optional(),
    }))
    .query(async ({ input }) => {
      try {
        return await infrastructureService.getPodLogs(
          input.name,
          input.namespace,
          input.container,
          input.tailLines
        );
      } catch {
        return '';
      }
    }),

  // ============ Kubernetes Deployments ============

  getDeployments: publicProcedure
    .input(z.object({ namespace: z.string().optional() }).optional())
    .query(async ({ input }) => {
      try {
        const deployments = await infrastructureService.getDeployments(input?.namespace);
        return deployments.map((dep: any) => ({
          name: dep.metadata?.name || '',
          namespace: dep.metadata?.namespace || '',
          replicas: dep.spec?.replicas || 0,
          availableReplicas: dep.status?.availableReplicas || 0,
          readyReplicas: dep.status?.readyReplicas || 0,
          updatedReplicas: dep.status?.updatedReplicas || 0,
          image: dep.spec?.template?.spec?.containers?.[0]?.image || '',
          createdAt: new Date(dep.metadata?.creationTimestamp || Date.now()),
        }));
      } catch {
        return [];
      }
    }),

  scaleDeployment: protectedProcedure
    .input(z.object({
      name: z.string(),
      namespace: z.string(),
      replicas: z.number().min(0).max(100),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await infrastructureService.scaleDeployment(
          input.name,
          input.namespace,
          input.replicas
        );
        return { success: !!result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }),

  restartDeployment: protectedProcedure
    .input(z.object({
      name: z.string(),
      namespace: z.string(),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await infrastructureService.restartDeployment(
          input.name,
          input.namespace
        );
        return { success: !!result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }),

  // ============ Kubernetes Services ============

  getServices: publicProcedure
    .input(z.object({ namespace: z.string().optional() }).optional())
    .query(async ({ input }) => {
      try {
        const services = await infrastructureService.getServices(input?.namespace);
        return services.map((svc: any) => ({
          name: svc.metadata?.name || '',
          namespace: svc.metadata?.namespace || '',
          type: svc.spec?.type || 'ClusterIP',
          clusterIP: svc.spec?.clusterIP || '',
          externalIP: svc.status?.loadBalancer?.ingress?.[0]?.ip || '',
          ports: svc.spec?.ports?.map((p: any) => ({
            port: p.port,
            targetPort: p.targetPort,
            protocol: p.protocol,
            nodePort: p.nodePort,
          })) || [],
          selector: svc.spec?.selector || {},
          createdAt: new Date(svc.metadata?.creationTimestamp || Date.now()),
        }));
      } catch {
        return [];
      }
    }),

  // ============ Kubernetes ConfigMaps & Secrets ============

  getConfigMaps: publicProcedure
    .input(z.object({ namespace: z.string().optional() }).optional())
    .query(async ({ input }) => {
      try {
        const configMaps = await infrastructureService.getConfigMaps(input?.namespace);
        return configMaps.map((cm: any) => ({
          name: cm.metadata?.name || '',
          namespace: cm.metadata?.namespace || '',
          keys: Object.keys(cm.data || {}),
          createdAt: new Date(cm.metadata?.creationTimestamp || Date.now()),
        }));
      } catch {
        return [];
      }
    }),

  getSecrets: publicProcedure
    .input(z.object({ namespace: z.string().optional() }).optional())
    .query(async ({ input }) => {
      try {
        const secrets = await infrastructureService.getSecrets(input?.namespace);
        return secrets.map((secret: any) => ({
          name: secret.metadata?.name || '',
          namespace: secret.metadata?.namespace || '',
          type: secret.type || 'Opaque',
          keys: Object.keys(secret.data || {}),
          createdAt: new Date(secret.metadata?.creationTimestamp || Date.now()),
        }));
      } catch {
        return [];
      }
    }),

  // ============ Kubernetes Events ============

  getEvents: publicProcedure
    .input(z.object({
      namespace: z.string().optional(),
      limit: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      try {
        const events = await infrastructureService.getEvents(
          input?.namespace,
          input?.limit
        );
        return events.map((event: any) => ({
          type: event.type || 'Normal',
          reason: event.reason || '',
          message: event.message || '',
          object: `${event.involvedObject?.kind}/${event.involvedObject?.name}`,
          namespace: event.metadata?.namespace || '',
          count: event.count || 1,
          firstTimestamp: event.firstTimestamp,
          lastTimestamp: event.lastTimestamp,
        }));
      } catch {
        return [];
      }
    }),

  // ============ Vault 密钥管理 ============

  getVaultHealth: publicProcedure.query(async () => {
    try {
      return await infrastructureService.getVaultHealth();
    } catch {
      return null;
    }
  }),

  getVaultOverview: publicProcedure.query(async () => {
    try {
      return await infrastructureService.getVaultOverview();
    } catch {
      return {
        health: null,
        mounts: 0,
        policies: 0,
        tokenInfo: null,
      };
    }
  }),

  listSecrets: publicProcedure
    .input(z.object({
      mount: z.string(),
      path: z.string().optional(),
    }))
    .query(async ({ input }) => {
      try {
        return await infrastructureService.listSecrets(input.mount, input.path);
      } catch {
        return [];
      }
    }),

  readSecret: protectedProcedure
    .input(z.object({
      mount: z.string(),
      path: z.string(),
    }))
    .query(async ({ input }) => {
      try {
        return await infrastructureService.readSecret(input.mount, input.path);
      } catch {
        return null;
      }
    }),

  writeSecret: protectedProcedure
    .input(z.object({
      mount: z.string(),
      path: z.string(),
      data: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await infrastructureService.writeSecret(
          input.mount,
          input.path,
          input.data
        );
        return { success: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }),

  deleteSecret: protectedProcedure
    .input(z.object({
      mount: z.string(),
      path: z.string(),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await infrastructureService.deleteSecret(input.mount, input.path);
        return { success: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }),

  listVaultPolicies: publicProcedure.query(async () => {
    try {
      return await infrastructureService.listVaultPolicies();
    } catch {
      return [];
    }
  }),

  listVaultMounts: publicProcedure.query(async () => {
    try {
      return await infrastructureService.listVaultMounts();
    } catch {
      return {};
    }
  }),

  // ============ ArgoCD GitOps ============

  getArgoCDOverview: publicProcedure.query(async () => {
    try {
      return await infrastructureService.getArgoCDOverview();
    } catch {
      return {
        version: null,
        applications: { total: 0, synced: 0, outOfSync: 0, healthy: 0, degraded: 0 },
        projects: 0,
        repositories: 0,
        clusters: 0,
      };
    }
  }),

  listApplications: publicProcedure
    .input(z.object({ project: z.string().optional() }).optional())
    .query(async ({ input }) => {
      try {
        return await infrastructureService.listApplications(input?.project);
      } catch {
        return [];
      }
    }),

  getApplication: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ input }) => {
      try {
        return await infrastructureService.getApplication(input.name);
      } catch {
        return null;
      }
    }),

  createApplication: protectedProcedure
    .input(z.object({
      name: z.string(),
      project: z.string(),
      repoURL: z.string(),
      path: z.string(),
      targetRevision: z.string(),
      destServer: z.string(),
      destNamespace: z.string(),
      autoSync: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await infrastructureService.createApplication(input);
        return { success: !!result, application: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }),

  deleteApplication: protectedProcedure
    .input(z.object({
      name: z.string(),
      cascade: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await infrastructureService.deleteApplication(
          input.name,
          input.cascade
        );
        return { success: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }),

  syncApplication: protectedProcedure
    .input(z.object({
      name: z.string(),
      revision: z.string().optional(),
      prune: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await infrastructureService.syncApplication(input.name, {
          revision: input.revision,
          prune: input.prune,
        });
        return { success: !!result, application: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }),

  rollbackApplication: protectedProcedure
    .input(z.object({
      name: z.string(),
      id: z.number(),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await infrastructureService.rollbackApplication(
          input.name,
          input.id
        );
        return { success: !!result, application: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }),

  refreshApplication: protectedProcedure
    .input(z.object({
      name: z.string(),
      hard: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await infrastructureService.refreshApplication(
          input.name,
          input.hard
        );
        return { success: !!result, application: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }),

  listProjects: publicProcedure.query(async () => {
    try {
      return await infrastructureService.listProjects();
    } catch {
      return [];
    }
  }),

  listRepositories: publicProcedure.query(async () => {
    try {
      return await infrastructureService.listRepositories();
    } catch {
      return [];
    }
  }),

  listClusters: publicProcedure.query(async () => {
    try {
      return await infrastructureService.listClusters();
    } catch {
      return [];
    }
  }),

  // ============ 网络策略 (保留模拟服务) ============

  getNetworkPolicies: publicProcedure.query(() => {
    return InfrastructureService.getNetworkPolicies();
  }),

  createNetworkPolicy: protectedProcedure
    .input(z.object({
      name: z.string(),
      namespace: z.string(),
      type: z.enum(['ingress', 'egress', 'both']),
      podSelector: z.record(z.string(), z.string()),
      ingressRules: z.array(z.object({
        id: z.string(),
        from: z.array(z.object({
          type: z.enum(['pod', 'namespace', 'ip']),
          selector: z.record(z.string(), z.string()).optional(),
          ipBlock: z.string().optional(),
        })),
        ports: z.array(z.object({
          protocol: z.enum(['TCP', 'UDP']),
          port: z.number(),
        })),
      })).optional(),
      egressRules: z.array(z.object({
        id: z.string(),
        to: z.array(z.object({
          type: z.enum(['pod', 'namespace', 'ip']),
          selector: z.record(z.string(), z.string()).optional(),
          ipBlock: z.string().optional(),
        })),
        ports: z.array(z.object({
          protocol: z.enum(['TCP', 'UDP']),
          port: z.number(),
        })),
      })).optional(),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.createNetworkPolicy('default', input as any);
    }),

  deleteNetworkPolicy: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      return InfrastructureService.deleteNetworkPolicy('default', input.id);
    }),

  // ============ 存储管理 (保留模拟服务) ============

  getStorageClasses: publicProcedure.query(() => {
    return InfrastructureService.getStorageClasses();
  }),

  getPersistentVolumes: publicProcedure.query(() => {
    return InfrastructureService.getPersistentVolumes();
  }),

  getPersistentVolumeClaims: publicProcedure.query(() => {
    return InfrastructureService.getPersistentVolumeClaims();
  }),

  // ============ 安全管理 (保留模拟服务) ============

  getSecurityPolicies: publicProcedure.query(() => {
    return InfrastructureService.getOpaPolicies();
  }),

  getRBACRoles: publicProcedure.query(() => {
    return InfrastructureService.getRbacRoles();
  }),

  getServiceAccounts: publicProcedure.query(() => {
    // 暂无此方法，返回空数组
    return [];
  }),

  // ============ CI/CD (保留模拟服务) ============

  getCICDPipelines: publicProcedure.query(() => {
    // getCicdPipelines 尚未实现，返回空数组
    return [];
  }),

  triggerPipeline: protectedProcedure
    .input(z.object({
      id: z.string(),
      branch: z.string().optional(),
    }))
    .mutation(({ input }) => {
      // 暂无此方法，返回模拟结果
      return { success: true, pipelineId: input.id };
    }),

  // ============ 综合概览 ============

  getSummary: publicProcedure.query(async () => {
    try {
      const [k8sOverview, argoOverview] = await Promise.all([
        infrastructureService.getKubernetesOverview(),
        infrastructureService.getArgoCDOverview(),
      ]);

      return {
        cluster: {
          nodes: k8sOverview.nodes.total,
          nodesReady: k8sOverview.nodes.ready,
          pods: k8sOverview.pods.total,
          podsRunning: k8sOverview.pods.running,
          deployments: k8sOverview.deployments.total,
          services: k8sOverview.services,
        },
        gitops: {
          applications: argoOverview.applications.total,
          synced: argoOverview.applications.synced,
          healthy: argoOverview.applications.healthy,
        },
        network: {
          policies: (await InfrastructureService.getNetworkPolicies()).length,
        },
        storage: {
          classes: (await InfrastructureService.getStorageClasses()).length,
          volumes: (await InfrastructureService.getPersistentVolumes()).length,
          claims: (await InfrastructureService.getPersistentVolumeClaims()).length,
        },
        security: {
          policies: (await InfrastructureService.getOpaPolicies()).length,
          roles: (await InfrastructureService.getRbacRoles()).length,
        },
        cicd: {
          pipelines: 0, // getCicdPipelines 尚未实现
        },
      };
    } catch {
      // 回退到模拟服务
      return InfrastructureService.getInfrastructureSummary();
    }
  }),
});

// 辅助函数：解析 K8s 内存字符串
function parseMemory(memStr: string): number {
  const match = memStr.match(/^(\d+)([KMGT]i?)?$/);
  if (!match) return 0;
  
  const value = parseInt(match[1]);
  const unit = match[2] || '';
  
  const multipliers: Record<string, number> = {
    '': 1,
    'K': 1000,
    'Ki': 1024,
    'M': 1000000,
    'Mi': 1048576,
    'G': 1000000000,
    'Gi': 1073741824,
    'T': 1000000000000,
    'Ti': 1099511627776,
  };
  
  return value * (multipliers[unit] || 1);
}
