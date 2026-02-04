/**
 * 运维服务 tRPC 路由
 * 提供仪表盘、自动化运维、边缘计算的 API 接口
 */

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../_core/trpc';
import { DashboardService } from '../../src/ops/dashboard/dashboardService';
import {
  AutoScalingService,
  SelfHealingService,
  BackupRecoveryService,
  RollbackService,
} from '../../src/ops/automation/automationService';
import {
  EdgeInferenceService,
  EdgeGatewayService,
  TSNService,
} from '../../src/ops/edge/edgeComputingService';

// 创建服务实例
const dashboardService = new DashboardService();
const autoScalingService = new AutoScalingService();
const selfHealingService = new SelfHealingService();
const backupRecoveryService = new BackupRecoveryService();
const rollbackService = new RollbackService();
const edgeInferenceService = new EdgeInferenceService();
const edgeGatewayService = new EdgeGatewayService();
const tsnService = new TSNService();

export const opsRouter = router({
  // ==================== 仪表盘 API ====================

  // 获取集群概览
  getClusterOverview: publicProcedure.query(async () => {
    return dashboardService.getClusterOverview();
  }),

  // 获取存储概览
  getStorageOverview: publicProcedure.query(async () => {
    return dashboardService.getStorageOverview();
  }),

  // 获取数据流概览
  getDataFlowOverview: publicProcedure.query(async () => {
    return dashboardService.getDataFlowOverview();
  }),

  // 获取 API 网关概览
  getApiGatewayOverview: publicProcedure.query(async () => {
    return dashboardService.getApiGatewayOverview();
  }),

  // 获取安全态势
  getSecurityPosture: publicProcedure.query(async () => {
    return dashboardService.getSecurityPosture();
  }),

  // ==================== 自动扩缩容 API ====================

  // 列出扩缩容策略
  listScalingPolicies: protectedProcedure.query(async () => {
    return autoScalingService.listPolicies();
  }),

  // 获取扩缩容策略详情
  getScalingPolicy: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return autoScalingService.getPolicy(input.id);
    }),

  // 创建扩缩容策略
  createScalingPolicy: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        target: z.object({
          kind: z.enum(['Deployment', 'StatefulSet', 'ReplicaSet']),
          name: z.string(),
          namespace: z.string(),
        }),
        minReplicas: z.number(),
        maxReplicas: z.number(),
        metrics: z.array(
          z.object({
            type: z.enum(['cpu', 'memory', 'custom']),
            name: z.string().optional(),
            targetValue: z.number(),
            targetType: z.enum(['Utilization', 'AverageValue', 'Value']),
          })
        ),
        behavior: z.object({
          scaleUp: z.object({
            stabilizationWindowSeconds: z.number(),
            policies: z.array(
              z.object({
                type: z.enum(['Pods', 'Percent']),
                value: z.number(),
                periodSeconds: z.number(),
              })
            ),
          }),
          scaleDown: z.object({
            stabilizationWindowSeconds: z.number(),
            policies: z.array(
              z.object({
                type: z.enum(['Pods', 'Percent']),
                value: z.number(),
                periodSeconds: z.number(),
              })
            ),
          }),
        }),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      return autoScalingService.createPolicy(input);
    }),

  // 更新扩缩容策略
  updateScalingPolicy: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        updates: z.object({
          enabled: z.boolean().optional(),
          minReplicas: z.number().optional(),
          maxReplicas: z.number().optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      return autoScalingService.updatePolicy(input.id, input.updates);
    }),

  // 删除扩缩容策略
  deleteScalingPolicy: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return autoScalingService.deletePolicy(input.id);
    }),

  // 触发手动扩缩容
  triggerScaling: protectedProcedure
    .input(z.object({ policyId: z.string(), targetReplicas: z.number() }))
    .mutation(async ({ input }) => {
      return autoScalingService.triggerScaling(input.policyId, input.targetReplicas);
    }),

  // ==================== 故障自愈 API ====================

  // 列出自愈规则
  listHealingRules: protectedProcedure.query(async () => {
    return selfHealingService.listRules();
  }),

  // 获取自愈规则详情
  getHealingRule: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return selfHealingService.getRule(input.id);
    }),

  // 创建自愈规则
  createHealingRule: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string(),
        condition: z.object({
          type: z.enum(['pod-crash', 'node-failure', 'service-degraded', 'resource-exhausted', 'custom']),
          threshold: z.number().optional(),
          duration: z.number().optional(),
          expression: z.string().optional(),
        }),
        action: z.object({
          type: z.enum(['restart-pod', 'reschedule-pod', 'cordon-node', 'drain-node', 'scale-up', 'failover', 'custom']),
          params: z.record(z.string(), z.unknown()).optional(),
          script: z.string().optional(),
        }),
        cooldown: z.number(),
        maxRetries: z.number(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      return selfHealingService.createRule(input);
    }),

  // 更新自愈规则
  updateHealingRule: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        updates: z.object({
          enabled: z.boolean().optional(),
          cooldown: z.number().optional(),
          maxRetries: z.number().optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      return selfHealingService.updateRule(input.id, input.updates);
    }),

  // 删除自愈规则
  deleteHealingRule: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return selfHealingService.deleteRule(input.id);
    }),

  // 触发手动自愈
  triggerHealing: protectedProcedure
    .input(z.object({ ruleId: z.string(), target: z.string() }))
    .mutation(async ({ input }) => {
      return selfHealingService.triggerHealing(input.ruleId, input.target);
    }),

  // ==================== 备份恢复 API ====================

  // 列出备份策略
  listBackupPolicies: protectedProcedure.query(async () => {
    return backupRecoveryService.listPolicies();
  }),

  // 获取备份策略详情
  getBackupPolicy: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return backupRecoveryService.getPolicy(input.id);
    }),

  // 创建备份策略
  createBackupPolicy: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string(),
        source: z.object({
          type: z.enum(['database', 'volume', 'namespace', 'cluster']),
          name: z.string(),
          namespace: z.string().optional(),
          selector: z.record(z.string(), z.string()).optional(),
        }),
        destination: z.object({
          type: z.enum(['s3', 'gcs', 'azure', 'nfs']),
          bucket: z.string().optional(),
          path: z.string(),
          credentials: z.string().optional(),
        }),
        schedule: z.string(),
        retention: z.object({
          daily: z.number(),
          weekly: z.number(),
          monthly: z.number(),
          yearly: z.number(),
        }),
        options: z.object({
          compression: z.boolean(),
          encryption: z.boolean(),
          incremental: z.boolean(),
          parallelism: z.number(),
        }),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      return backupRecoveryService.createPolicy(input);
    }),

  // 触发手动备份
  triggerBackup: protectedProcedure
    .input(z.object({ policyId: z.string() }))
    .mutation(async ({ input }) => {
      return backupRecoveryService.triggerBackup(input.policyId);
    }),

  // 列出备份作业
  listBackupJobs: protectedProcedure
    .input(z.object({ policyId: z.string().optional(), status: z.string().optional(), limit: z.number().optional() }))
    .query(async ({ input }) => {
      return backupRecoveryService.getBackupJobs(input);
    }),

  // 触发恢复
  triggerRestore: protectedProcedure
    .input(z.object({ 
      backupId: z.string(), 
      options: z.object({
        overwrite: z.boolean().default(false),
        validate: z.boolean().default(true),
        dryRun: z.boolean().default(false),
      }).optional()
    }))
    .mutation(async ({ input }) => {
      return backupRecoveryService.triggerRestore(input.backupId, input.options || { overwrite: false, validate: true, dryRun: false });
    }),

  // ==================== 版本回滚 API ====================

  // 列出回滚策略
  listRollbackPolicies: protectedProcedure.query(async () => {
    return rollbackService.listPolicies();
  }),

  // 获取回滚策略详情
  getRollbackPolicy: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return rollbackService.getPolicy(input.id);
    }),

  // 创建回滚策略
  createRollbackPolicy: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        target: z.object({
          kind: z.enum(['Deployment', 'StatefulSet', 'DaemonSet']),
          name: z.string(),
          namespace: z.string(),
        }),
        strategy: z.object({
          type: z.enum(['revision', 'timestamp', 'tag']),
          maxRevisions: z.number(),
          autoRollback: z.boolean(),
          healthCheck: z.object({
            enabled: z.boolean(),
            timeout: z.number(),
            successThreshold: z.number(),
            failureThreshold: z.number(),
          }),
        }),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      return rollbackService.createPolicy(input);
    }),

  // 获取版本历史
  getRevisionHistory: protectedProcedure
    .input(z.object({ policyId: z.string() }))
    .query(async ({ input }) => {
      return rollbackService.getRevisionHistory(input.policyId);
    }),

  // 触发回滚
  triggerRollback: protectedProcedure
    .input(z.object({ policyId: z.string(), targetRevision: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      return rollbackService.triggerRollback(input.policyId, input.targetRevision, input.reason || 'Manual rollback');
    }),

  // ==================== 边缘推理 API ====================

  // 列出边缘节点
  listEdgeNodes: protectedProcedure.query(async () => {
    return edgeInferenceService.listNodes();
  }),

  // 获取边缘节点详情
  getEdgeNode: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return edgeInferenceService.getNode(input.id);
    }),

  // 注册边缘节点
  registerEdgeNode: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        location: z.object({
          zone: z.string(),
          rack: z.string().optional(),
          coordinates: z.object({
            lat: z.number(),
            lng: z.number(),
          }).optional(),
        }),
        hardware: z.object({
          cpu: z.object({
            model: z.string(),
            cores: z.number(),
            frequency: z.number(),
          }),
          memory: z.object({
            total: z.number(),
            type: z.string(),
          }),
          gpu: z
            .object({
              model: z.string(),
              memory: z.number(),
              tensorCores: z.number().optional(),
            })
            .optional(),
          storage: z.object({
            type: z.enum(['nvme', 'ssd', 'hdd']),
            capacity: z.number(),
          }),
          network: z.object({
            interfaces: z.array(
              z.object({
                name: z.string(),
                speed: z.number(),
                type: z.string(),
              })
            ),
          }),
        }),
        status: z.enum(['online', 'offline', 'degraded', 'maintenance']),
        metrics: z.object({
          cpu: z.number(),
          memory: z.number(),
          gpu: z.number().optional(),
          network: z.object({
            rx: z.number(),
            tx: z.number(),
          }),
          temperature: z.number(),
          uptime: z.number(),
        }),
        capabilities: z.array(z.string()),
        lastHeartbeat: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      return edgeInferenceService.registerNode(input);
    }),

  // 列出边缘模型
  listEdgeModels: protectedProcedure.query(async () => {
    return edgeInferenceService.listModels();
  }),

  // 部署边缘模型
  deployEdgeModel: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        version: z.string(),
        type: z.enum(['vision', 'audio', 'llm', 'multimodal']),
        framework: z.enum(['tensorrt', 'onnx', 'tflite', 'openvino']),
        size: z.number(),
        precision: z.enum(['fp32', 'fp16', 'int8', 'int4']),
        inputShape: z.array(z.number()),
        outputShape: z.array(z.number()),
        performance: z.object({
          latency: z.number(),
          throughput: z.number(),
          memoryUsage: z.number(),
        }),
        deployedNodes: z.array(z.string()),
      })
    )
    .mutation(async ({ input }) => {
      return edgeInferenceService.deployModel(input);
    }),

  // 执行推理
  infer: protectedProcedure
    .input(
      z.object({
        modelId: z.string(),
        input: z.any(),
        priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
        timeout: z.number().default(5000),
      })
    )
    .mutation(async ({ input }) => {
      return edgeInferenceService.infer(input);
    }),

  // ==================== 边缘网关 API ====================

  // 列出边缘网关
  listEdgeGateways: protectedProcedure.query(async () => {
    return edgeGatewayService.listGateways();
  }),

  // 获取边缘网关详情
  getEdgeGateway: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return edgeGatewayService.getGateway(input.id);
    }),

  // 创建边缘网关
  createEdgeGateway: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        type: z.enum(['mqtt', 'opcua', 'modbus', 'http']),
        endpoint: z.string(),
        status: z.enum(['connected', 'disconnected', 'error']),
        config: z.object({
          protocol: z.string(),
          port: z.number(),
          tls: z.boolean(),
          bufferSize: z.number(),
          retryPolicy: z.object({
            maxRetries: z.number(),
            backoffMs: z.number(),
          }),
        }),
        connectedDevices: z.number(),
        lastActivity: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      return edgeGatewayService.createGateway(input);
    }),

  // 连接网关
  connectGateway: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await edgeGatewayService.connectGateway(input.id);
      return { success: true };
    }),

  // 断开网关
  disconnectGateway: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await edgeGatewayService.disconnectGateway(input.id);
      return { success: true };
    }),

  // ==================== TSN 服务 API ====================

  // 列出 TSN 配置
  listTSNConfigs: protectedProcedure.query(async () => {
    return tsnService.listTSNConfigs();
  }),

  // 创建 TSN 配置
  createTSNConfig: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        network: z.object({
          vlan: z.number(),
          priority: z.number(),
          bandwidth: z.number(),
          latencyTarget: z.number(),
        }),
        schedule: z.object({
          cycleTime: z.number(),
          gateControlList: z.array(
            z.object({
              gateState: z.number(),
              timeInterval: z.number(),
            })
          ),
        }),
        streams: z.array(
          z.object({
            id: z.string(),
            source: z.string(),
            destination: z.string(),
            priority: z.number(),
            maxFrameSize: z.number(),
            interval: z.number(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      return tsnService.createTSNConfig(input);
    }),

  // 列出 5G 配置
  list5GConfigs: protectedProcedure.query(async () => {
    return tsnService.list5GConfigs();
  }),

  // 创建 5G 配置
  create5GConfig: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        slice: z.object({
          type: z.enum(['embb', 'urllc', 'mmtc']),
          qos: z.object({
            latency: z.number(),
            reliability: z.number(),
            bandwidth: z.number(),
          }),
        }),
        connection: z.object({
          apn: z.string(),
          status: z.enum(['connected', 'disconnected', 'roaming']),
          signalStrength: z.number(),
          technology: z.enum(['lte', '5g-nsa', '5g-sa']),
        }),
      })
    )
    .mutation(async ({ input }) => {
      return tsnService.create5GConfig(input);
    }),

  // 运行延迟测试
  runLatencyTest: protectedProcedure
    .input(z.object({ configId: z.string(), type: z.enum(['tsn', '5g']) }))
    .mutation(async ({ input }) => {
      return tsnService.runLatencyTest(input.configId, input.type);
    }),

  // 获取网络指标
  getNetworkMetrics: protectedProcedure.query(async () => {
    return tsnService.getNetworkMetrics();
  }),
});

export type OpsRouter = typeof opsRouter;
