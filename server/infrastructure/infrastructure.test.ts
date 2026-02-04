/**
 * 基础设施服务测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InfrastructureService } from './infrastructureService';

describe('基础设施服务', () => {
  describe('集群管理', () => {
    it('应该返回集群概览信息', () => {
      const overview = InfrastructureService.getClusterOverview();
      
      expect(overview).toBeDefined();
      expect(overview.name).toBe('xilian-cluster');
      expect(overview.version).toBeDefined();
      expect(overview.healthStatus).toBeDefined();
      expect(overview.totalCpu).toBeGreaterThan(0);
      expect(overview.totalMemory).toBeGreaterThan(0);
      expect(overview.totalGpu).toBeGreaterThan(0);
    });

    it('应该返回节点列表', () => {
      const nodes = InfrastructureService.getNodes();
      
      expect(Array.isArray(nodes)).toBe(true);
      expect(nodes.length).toBe(5); // 5 节点集群
      
      // 验证 GPU 节点
      const gpuNodes = nodes.filter(n => n.type === 'gpu');
      expect(gpuNodes.length).toBe(2);
      gpuNodes.forEach(node => {
        expect(node.gpuInfo).toBeDefined();
        expect(node.gpuInfo?.type).toBe('nvidia-a100');
        expect(node.gpuInfo?.count).toBe(8);
      });
      
      // 验证 CPU 节点
      const cpuNodes = nodes.filter(n => n.type === 'cpu');
      expect(cpuNodes.length).toBe(3);
    });

    it('应该返回单个节点详情', () => {
      const nodes = InfrastructureService.getNodes();
      const firstNode = nodes[0];
      
      const node = InfrastructureService.getNode(firstNode.id);
      
      expect(node).toBeDefined();
      expect(node?.id).toBe(firstNode.id);
      expect(node?.name).toBe(firstNode.name);
    });

    it('应该更新节点标签', () => {
      const nodes = InfrastructureService.getNodes();
      const nodeId = nodes[0].id;
      const newLabels = { 'custom-label': 'test-value' };
      
      const result = InfrastructureService.updateNodeLabels(nodeId, newLabels);
      
      expect(result).toBeDefined();
      // 更新后验证节点标签
      const updatedNode = InfrastructureService.getNode(nodeId);
      expect(updatedNode?.labels['custom-label']).toBe('test-value');
    });

    it('应该添加节点污点', () => {
      const nodes = InfrastructureService.getNodes();
      const nodeId = nodes[0].id;
      const taint = {
        key: 'test-taint',
        value: 'true',
        effect: 'NoSchedule' as const,
      };
      
      const result = InfrastructureService.addNodeTaint(nodeId, taint);
      
      expect(result).toBeDefined();
      // 添加后验证节点污点
      const updatedNode = InfrastructureService.getNode(nodeId);
      const hasTaint = updatedNode?.taints.some(t => t.key === 'test-taint');
      expect(hasTaint).toBe(true);
    });
  });

  describe('网络策略', () => {
    it('应该返回 Calico 配置', () => {
      const config = InfrastructureService.getCalicoConfig();
      
      expect(config).toBeDefined();
      expect(config.ipipMode).toBe('CrossSubnet');
      expect(config.natOutgoing).toBe(true);
      expect(config.mtu).toBe(1440);
      expect(Array.isArray(config.ipPools)).toBe(true);
    });

    it('应该返回 Ingress 配置列表', () => {
      const configs = InfrastructureService.getIngressConfigs();
      
      expect(Array.isArray(configs)).toBe(true);
      configs.forEach(config => {
        expect(config.id).toBeDefined();
        expect(config.name).toBeDefined();
        expect(config.host).toBeDefined();
        expect(Array.isArray(config.paths)).toBe(true);
      });
    });

    it('应该返回网络策略列表', () => {
      const policies = InfrastructureService.getNetworkPolicies();
      
      expect(Array.isArray(policies)).toBe(true);
    });
  });

  describe('存储管理', () => {
    it('应该返回存储类列表', () => {
      const classes = InfrastructureService.getStorageClasses();
      
      expect(Array.isArray(classes)).toBe(true);
      expect(classes.length).toBeGreaterThan(0);
      
      // 验证必需的存储类类型
      const types = classes.map(c => c.type);
      expect(types).toContain('ssd-fast');
      expect(types).toContain('hdd-standard');
      expect(types).toContain('nvme-ultra');
    });

    it('应该返回 Ceph 状态', () => {
      const status = InfrastructureService.getCephStatus();
      
      expect(status).toBeDefined();
      expect(status.health).toBeDefined();
      expect(status.totalCapacity).toBeGreaterThan(0);
      expect(status.osdCount).toBeGreaterThan(0);
      expect(Array.isArray(status.pools)).toBe(true);
    });

    it('应该返回 PVC 列表', () => {
      const pvcs = InfrastructureService.getPersistentVolumeClaims();
      
      expect(Array.isArray(pvcs)).toBe(true);
    });
  });

  describe('安全管理', () => {
    it('应该返回 RBAC 角色列表', () => {
      const roles = InfrastructureService.getRbacRoles();
      
      expect(Array.isArray(roles)).toBe(true);
      roles.forEach(role => {
        expect(role.id).toBeDefined();
        expect(role.name).toBeDefined();
        expect(Array.isArray(role.rules)).toBe(true);
      });
    });

    it('应该返回 OPA 策略列表', () => {
      const policies = InfrastructureService.getOpaPolicies();
      
      expect(Array.isArray(policies)).toBe(true);
      policies.forEach(policy => {
        expect(policy.id).toBeDefined();
        expect(policy.name).toBeDefined();
        expect(policy.rego).toBeDefined();
        expect(policy.enforcementAction).toBeDefined();
      });
    });

    it('应该返回 Trivy 扫描结果', () => {
      const scans = InfrastructureService.getTrivyScans();
      
      expect(Array.isArray(scans)).toBe(true);
      scans.forEach(scan => {
        expect(scan.id).toBeDefined();
        expect(scan.target).toBeDefined();
        expect(scan.summary).toBeDefined();
        expect(typeof scan.summary.critical).toBe('number');
        expect(typeof scan.summary.high).toBe('number');
      });
    });

    it('应该返回 Falco 告警', () => {
      const alerts = InfrastructureService.getFalcoAlerts();
      
      expect(Array.isArray(alerts)).toBe(true);
    });

    it('应该返回 Vault 密钥列表', () => {
      const secrets = InfrastructureService.getVaultSecrets();
      
      expect(Array.isArray(secrets)).toBe(true);
    });
  });

  describe('CI/CD 管理', () => {
    it('应该返回 GitLab Runner 列表', () => {
      const runners = InfrastructureService.getGitLabRunners();
      
      expect(Array.isArray(runners)).toBe(true);
      runners.forEach(runner => {
        expect(runner.id).toBeDefined();
        expect(runner.name).toBeDefined();
        expect(runner.version).toBeDefined();
        expect(Array.isArray(runner.tagList)).toBe(true);
      });
    });

    it('应该返回 ArgoCD 应用列表', () => {
      const apps = InfrastructureService.getArgoCdApps();
      
      expect(Array.isArray(apps)).toBe(true);
      apps.forEach(app => {
        expect(app.id).toBeDefined();
        expect(app.name).toBeDefined();
        expect(app.syncStatus).toBeDefined();
        expect(app.healthStatus).toBeDefined();
        expect(app.source).toBeDefined();
        expect(app.destination).toBeDefined();
      });
    });

    it('应该返回 CI/CD 流水线列表', () => {
      const pipelines = InfrastructureService.getCicdPipelines();
      
      expect(Array.isArray(pipelines)).toBe(true);
    });

    it('应该返回 Harbor 镜像列表', () => {
      const images = InfrastructureService.getHarborImages();
      
      expect(Array.isArray(images)).toBe(true);
      images.forEach(image => {
        expect(image.id).toBeDefined();
        expect(image.name).toBeDefined();
        expect(image.tag).toBeDefined();
        expect(image.digest).toBeDefined();
      });
    });
  });

  describe('统计和报告', () => {
    it('应该返回基础设施摘要', () => {
      const summary = InfrastructureService.getInfrastructureSummary();
      
      expect(summary).toBeDefined();
      expect(summary.cluster).toBeDefined();
      expect(summary.nodes).toBeDefined();
      expect(summary.nodes.total).toBe(5);
      expect(summary.nodes.gpu).toBe(2);
      expect(summary.storage).toBeDefined();
      expect(summary.security).toBeDefined();
      expect(summary.cicd).toBeDefined();
    });
  });
});
