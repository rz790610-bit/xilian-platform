/**
 * 基础设施层 tRPC 路由
 * 提供 K8s、网络、存储、安全、CI/CD 的 API 接口
 */

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../_core/trpc';
import { InfrastructureService } from './infrastructureService';

export const infrastructureRouter = router({
  // ============ 集群管理 ============
  
  getClusterOverview: publicProcedure.query(() => {
    return InfrastructureService.getClusterOverview();
  }),

  getNodes: publicProcedure.query(() => {
    return InfrastructureService.getNodes();
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
      return InfrastructureService.setNodeStatus(input.id, input.status);
    }),

  // ============ 网络策略 ============

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
          podSelector: z.record(z.string(), z.string()).optional(),
          namespaceSelector: z.record(z.string(), z.string()).optional(),
          ipBlock: z.object({
            cidr: z.string(),
            except: z.array(z.string()).optional(),
          }).optional(),
        })).optional(),
        ports: z.array(z.object({
          protocol: z.enum(['TCP', 'UDP', 'SCTP']),
          port: z.number(),
          endPort: z.number().optional(),
        })),
      })),
      egressRules: z.array(z.object({
        id: z.string(),
        to: z.array(z.object({
          podSelector: z.record(z.string(), z.string()).optional(),
          namespaceSelector: z.record(z.string(), z.string()).optional(),
          ipBlock: z.object({
            cidr: z.string(),
            except: z.array(z.string()).optional(),
          }).optional(),
        })).optional(),
        ports: z.array(z.object({
          protocol: z.enum(['TCP', 'UDP', 'SCTP']),
          port: z.number(),
          endPort: z.number().optional(),
        })),
      })),
      enabled: z.boolean(),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.createNetworkPolicy(input);
    }),

  deleteNetworkPolicy: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      return InfrastructureService.deleteNetworkPolicy(input.id);
    }),

  getCalicoConfig: publicProcedure.query(() => {
    return InfrastructureService.getCalicoConfig();
  }),

  updateCalicoConfig: protectedProcedure
    .input(z.object({
      ipipMode: z.enum(['Always', 'CrossSubnet', 'Never']).optional(),
      vxlanMode: z.enum(['Always', 'CrossSubnet', 'Never']).optional(),
      natOutgoing: z.boolean().optional(),
      mtu: z.number().optional(),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.updateCalicoConfig(input);
    }),

  getIngressConfigs: publicProcedure.query(() => {
    return InfrastructureService.getIngressConfigs();
  }),

  createIngress: protectedProcedure
    .input(z.object({
      name: z.string(),
      namespace: z.string(),
      host: z.string(),
      paths: z.array(z.object({
        path: z.string(),
        pathType: z.enum(['Prefix', 'Exact', 'ImplementationSpecific']),
        backend: z.object({
          serviceName: z.string(),
          servicePort: z.number(),
        }),
      })),
      tls: z.object({
        hosts: z.array(z.string()),
        secretName: z.string(),
      }).optional(),
      annotations: z.record(z.string(), z.string()),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.createIngress(input);
    }),

  // ============ 存储管理 ============

  getStorageClasses: publicProcedure.query(() => {
    return InfrastructureService.getStorageClasses();
  }),

  createStorageClass: protectedProcedure
    .input(z.object({
      name: z.string(),
      type: z.enum(['ssd-fast', 'hdd-standard', 'nvme-ultra']),
      provisioner: z.string(),
      reclaimPolicy: z.enum(['Delete', 'Retain', 'Recycle']),
      volumeBindingMode: z.enum(['Immediate', 'WaitForFirstConsumer']),
      allowVolumeExpansion: z.boolean(),
      parameters: z.record(z.string(), z.string()),
      isDefault: z.boolean(),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.createStorageClass(input);
    }),

  setDefaultStorageClass: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      return InfrastructureService.setDefaultStorageClass(input.id);
    }),

  getPersistentVolumes: publicProcedure.query(() => {
    return InfrastructureService.getPersistentVolumes();
  }),

  getPersistentVolumeClaims: publicProcedure.query(() => {
    return InfrastructureService.getPersistentVolumeClaims();
  }),

  createPVC: protectedProcedure
    .input(z.object({
      name: z.string(),
      namespace: z.string(),
      storageClassName: z.string(),
      accessModes: z.array(z.enum(['ReadWriteOnce', 'ReadOnlyMany', 'ReadWriteMany'])),
      requestedCapacity: z.number(),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.createPVC(input);
    }),

  expandPVC: protectedProcedure
    .input(z.object({
      id: z.string(),
      newCapacity: z.number(),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.expandPVC(input.id, input.newCapacity);
    }),

  getCephStatus: publicProcedure.query(() => {
    return InfrastructureService.getCephStatus();
  }),

  // ============ 安全管理 ============

  getRbacRoles: publicProcedure.query(() => {
    return InfrastructureService.getRbacRoles();
  }),

  createRbacRole: protectedProcedure
    .input(z.object({
      name: z.string(),
      namespace: z.string().optional(),
      rules: z.array(z.object({
        apiGroups: z.array(z.string()),
        resources: z.array(z.string()),
        verbs: z.array(z.enum(['get', 'list', 'watch', 'create', 'update', 'patch', 'delete', '*'])),
        resourceNames: z.array(z.string()).optional(),
      })),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.createRbacRole(input);
    }),

  getRbacBindings: publicProcedure.query(() => {
    return InfrastructureService.getRbacBindings();
  }),

  createRbacBinding: protectedProcedure
    .input(z.object({
      name: z.string(),
      namespace: z.string().optional(),
      roleRef: z.object({
        kind: z.enum(['Role', 'ClusterRole']),
        name: z.string(),
      }),
      subjects: z.array(z.object({
        kind: z.enum(['User', 'Group', 'ServiceAccount']),
        name: z.string(),
        namespace: z.string().optional(),
      })),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.createRbacBinding(input);
    }),

  getOpaPolicies: publicProcedure.query(() => {
    return InfrastructureService.getOpaPolicies();
  }),

  createOpaPolicy: protectedProcedure
    .input(z.object({
      name: z.string(),
      description: z.string(),
      rego: z.string(),
      enabled: z.boolean(),
      enforcementAction: z.enum(['deny', 'warn', 'dryrun']),
      targets: z.array(z.string()),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.createOpaPolicy(input);
    }),

  toggleOpaPolicy: protectedProcedure
    .input(z.object({
      id: z.string(),
      enabled: z.boolean(),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.toggleOpaPolicy(input.id, input.enabled);
    }),

  getVaultSecrets: protectedProcedure.query(() => {
    return InfrastructureService.getVaultSecrets();
  }),

  createVaultSecret: protectedProcedure
    .input(z.object({
      path: z.string(),
      metadata: z.record(z.string(), z.string()),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.createVaultSecret(input.path, input.metadata);
    }),

  setSecretRotation: protectedProcedure
    .input(z.object({
      id: z.string(),
      interval: z.number(),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.setSecretRotation(input.id, input.interval);
    }),

  getTrivyScans: publicProcedure.query(() => {
    return InfrastructureService.getTrivyScans();
  }),

  scanImage: protectedProcedure
    .input(z.object({ target: z.string() }))
    .mutation(({ input }) => {
      return InfrastructureService.scanImage(input.target);
    }),

  getFalcoAlerts: publicProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(({ input }) => {
      return InfrastructureService.getFalcoAlerts(input?.limit);
    }),

  getFalcoRules: publicProcedure.query(() => {
    return InfrastructureService.getFalcoRules();
  }),

  toggleFalcoRule: protectedProcedure
    .input(z.object({
      id: z.string(),
      enabled: z.boolean(),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.toggleFalcoRule(input.id, input.enabled);
    }),

  // ============ CI/CD 管理 ============

  getGitLabRunners: publicProcedure.query(() => {
    return InfrastructureService.getGitLabRunners();
  }),

  toggleRunner: protectedProcedure
    .input(z.object({
      id: z.string(),
      active: z.boolean(),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.toggleRunner(input.id, input.active);
    }),

  getCicdPipelines: publicProcedure.query(() => {
    return InfrastructureService.getCicdPipelines();
  }),

  createPipeline: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      projectName: z.string(),
      ref: z.string(),
      sha: z.string(),
      source: z.enum(['push', 'web', 'trigger', 'schedule', 'api', 'merge_request']),
      user: z.object({
        id: z.string(),
        name: z.string(),
        avatar: z.string().optional(),
      }),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.createPipeline(input);
    }),

  updatePipelineStatus: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(['pending', 'running', 'success', 'failed', 'canceled']),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.updatePipelineStatus(input.id, input.status);
    }),

  getArgoCdApps: publicProcedure.query(() => {
    return InfrastructureService.getArgoCdApps();
  }),

  syncArgoCdApp: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      return InfrastructureService.syncArgoCdApp(input.id);
    }),

  getHarborImages: publicProcedure.query(() => {
    return InfrastructureService.getHarborImages();
  }),

  signImage: protectedProcedure
    .input(z.object({
      id: z.string(),
      signer: z.string(),
    }))
    .mutation(({ input }) => {
      return InfrastructureService.signImage(input.id, input.signer);
    }),

  // ============ 统计和报告 ============

  getSummary: publicProcedure.query(() => {
    return InfrastructureService.getInfrastructureSummary();
  }),
});

export type InfrastructureRouter = typeof infrastructureRouter;
