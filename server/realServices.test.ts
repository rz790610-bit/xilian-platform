/**
 * 真实服务客户端集成测试
 * 测试所有真实服务客户端的基本功能
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock HTTP 模块
vi.mock('http', () => ({
  default: {
    request: vi.fn((options, callback) => {
      const mockRes = {
        statusCode: 200,
        on: vi.fn((event, handler) => {
          if (event === 'data') {
            handler(JSON.stringify({ status: 'ok' }));
          }
          if (event === 'end') {
            handler();
          }
          return mockRes;
        }),
      };
      callback(mockRes);
      return {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      };
    }),
  },
}));

vi.mock('https', () => ({
  default: {
    request: vi.fn((options, callback) => {
      const mockRes = {
        statusCode: 200,
        on: vi.fn((event, handler) => {
          if (event === 'data') {
            handler(JSON.stringify({ status: 'ok' }));
          }
          if (event === 'end') {
            handler();
          }
          return mockRes;
        }),
      };
      callback(mockRes);
      return {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      };
    }),
  },
}));

describe('监控服务客户端', () => {
  describe('DatabaseMonitor', () => {
    it('应该导出数据库监控函数', async () => {
      const { getMySQLStatus, getRedisStatus, getClickHouseStatus, getQdrantStatus } = await import('./monitoring/clients/databaseMonitor');
      expect(getMySQLStatus).toBeDefined();
      expect(getRedisStatus).toBeDefined();
      expect(getClickHouseStatus).toBeDefined();
      expect(getQdrantStatus).toBeDefined();
    });

    it('应该有获取所有数据库状态的方法', async () => {
      const { getAllDatabaseStatus } = await import('./monitoring/clients/databaseMonitor');
      expect(getAllDatabaseStatus).toBeDefined();
      expect(typeof getAllDatabaseStatus).toBe('function');
    });

    it('应该有获取数据库状态的方法', async () => {
      const { getMySQLStatus, getRedisStatus, getClickHouseStatus, getQdrantStatus } = await import('./monitoring/clients/databaseMonitor');
      expect(typeof getMySQLStatus).toBe('function');
      expect(typeof getRedisStatus).toBe('function');
      expect(typeof getClickHouseStatus).toBe('function');
      expect(typeof getQdrantStatus).toBe('function');
    });
  });

  describe('SystemMonitor', () => {
    it('应该导出系统监控函数', async () => {
      const { getSystemResources, getCpuDetails, getMemoryDetails, getDiskDetails } = await import('./monitoring/clients/systemMonitor');
      expect(getSystemResources).toBeDefined();
      expect(getCpuDetails).toBeDefined();
      expect(getMemoryDetails).toBeDefined();
      expect(getDiskDetails).toBeDefined();
    });

    it('应该有获取系统资源的方法', async () => {
      const { getSystemResources, getCpuDetails, getMemoryDetails, getDiskDetails, getNetworkDetails } = await import('./monitoring/clients/systemMonitor');
      expect(typeof getSystemResources).toBe('function');
      expect(typeof getCpuDetails).toBe('function');
      expect(typeof getMemoryDetails).toBe('function');
      expect(typeof getDiskDetails).toBe('function');
      expect(typeof getNetworkDetails).toBe('function');
    });
  });

  describe('HealthChecker', () => {
    it('应该导出健康检查函数', async () => {
      const { checkAllServices, checkService, checkServiceHealth } = await import('./monitoring/clients/healthChecker');
      expect(checkAllServices).toBeDefined();
      expect(checkService).toBeDefined();
      expect(checkServiceHealth).toBeDefined();
    });

    it('应该有检查服务健康的方法', async () => {
      const { checkAllServices, checkService } = await import('./monitoring/clients/healthChecker');
      expect(typeof checkAllServices).toBe('function');
      expect(typeof checkService).toBe('function');
    });
  });
});

describe('可观测性服务客户端', () => {
  describe('PrometheusClient', () => {
    it('应该导出 Prometheus 客户端', async () => {
      const { prometheusClient } = await import('./observability/clients/prometheusClient');
      expect(prometheusClient).toBeDefined();
    });

    it('应该有查询指标的方法', async () => {
      const { prometheusClient } = await import('./observability/clients/prometheusClient');
      expect(typeof prometheusClient.query).toBe('function');
      expect(typeof prometheusClient.queryRange).toBe('function');
      expect(typeof prometheusClient.getAlerts).toBe('function');
      expect(typeof prometheusClient.getAlertRules).toBe('function');
    });
  });

  describe('ElasticsearchClient', () => {
    it('应该导出 Elasticsearch 客户端', async () => {
      const { elasticsearchClient } = await import('./observability/clients/elasticsearchClient');
      expect(elasticsearchClient).toBeDefined();
    });

    it('应该有搜索日志的方法', async () => {
      const { elasticsearchClient } = await import('./observability/clients/elasticsearchClient');
      expect(typeof elasticsearchClient.searchLogs).toBe('function');
      expect(typeof elasticsearchClient.getLogLevelStats).toBe('function');
      expect(typeof elasticsearchClient.getClusterHealth).toBe('function');
    });
  });

  describe('JaegerClient', () => {
    it('应该导出 Jaeger 客户端', async () => {
      const { jaegerClient } = await import('./observability/clients/jaegerClient');
      expect(jaegerClient).toBeDefined();
    });

    it('应该有查询追踪的方法', async () => {
      const { jaegerClient } = await import('./observability/clients/jaegerClient');
      expect(typeof jaegerClient.getServices).toBe('function');
      expect(typeof jaegerClient.getOperations).toBe('function');
      expect(typeof jaegerClient.searchTraces).toBe('function');
      expect(typeof jaegerClient.getTrace).toBe('function');
    });
  });
});

describe('基础设施服务客户端', () => {
  describe('KubernetesClient', () => {
    it('应该导出 Kubernetes 客户端', async () => {
      const { kubernetesClient } = await import('./infrastructure/clients/kubernetesClient');
      expect(kubernetesClient).toBeDefined();
    });

    it('应该有管理资源的方法', async () => {
      const { kubernetesClient } = await import('./infrastructure/clients/kubernetesClient');
      expect(typeof kubernetesClient.getNodes).toBe('function');
      expect(typeof kubernetesClient.getNamespaces).toBe('function');
      expect(typeof kubernetesClient.getPods).toBe('function');
      expect(typeof kubernetesClient.getDeployments).toBe('function');
      expect(typeof kubernetesClient.getServices).toBe('function');
    });
  });

  describe('VaultClient', () => {
    it('应该导出 Vault 客户端', async () => {
      const { vaultClient } = await import('./infrastructure/clients/vaultClient');
      expect(vaultClient).toBeDefined();
    });

    it('应该有管理密钥的方法', async () => {
      const { vaultClient } = await import('./infrastructure/clients/vaultClient');
      expect(typeof vaultClient.getHealth).toBe('function');
      expect(typeof vaultClient.listSecrets).toBe('function');
      expect(typeof vaultClient.readSecret).toBe('function');
    });
  });

  describe('ArgoCDClient', () => {
    it('应该导出 ArgoCD 客户端', async () => {
      const { argoCDClient } = await import('./infrastructure/clients/argoCDClient');
      expect(argoCDClient).toBeDefined();
    });

    it('应该有管理应用的方法', async () => {
      const { argoCDClient } = await import('./infrastructure/clients/argoCDClient');
      expect(typeof argoCDClient.listApplications).toBe('function');
      expect(typeof argoCDClient.getApplication).toBe('function');
      expect(typeof argoCDClient.syncApplication).toBe('function');
    });
  });
});

describe('数据管道服务客户端', () => {
  describe('AirflowClient', () => {
    it('应该导出 Airflow 客户端', async () => {
      const { airflowClient } = await import('./dataPipeline/clients/airflowClient');
      expect(airflowClient).toBeDefined();
    });

    it('应该有管理 DAG 的方法', async () => {
      const { airflowClient } = await import('./dataPipeline/clients/airflowClient');
      expect(typeof airflowClient.listDAGs).toBe('function');
      expect(typeof airflowClient.getDAG).toBe('function');
      expect(typeof airflowClient.triggerDAG).toBe('function');
      expect(typeof airflowClient.pauseDAG).toBe('function');
    });
  });

  describe('KafkaConnectClient', () => {
    it('应该导出 Kafka Connect 客户端', async () => {
      const { kafkaConnectClient } = await import('./dataPipeline/clients/kafkaConnectClient');
      expect(kafkaConnectClient).toBeDefined();
    });

    it('应该有管理连接器的方法', async () => {
      const { kafkaConnectClient } = await import('./dataPipeline/clients/kafkaConnectClient');
      expect(typeof kafkaConnectClient.listConnectors).toBe('function');
      expect(typeof kafkaConnectClient.getConnector).toBe('function');
      expect(typeof kafkaConnectClient.createConnector).toBe('function');
      expect(typeof kafkaConnectClient.deleteConnector).toBe('function');
      expect(typeof kafkaConnectClient.pauseConnector).toBe('function');
      expect(typeof kafkaConnectClient.resumeConnector).toBe('function');
    });
  });
});

describe('增强版服务', () => {
  describe('EnhancedMonitoringService', () => {
    it('应该导出增强版监控服务', async () => {
      const { enhancedMonitoringService } = await import('./monitoring/enhancedMonitoringService');
      expect(enhancedMonitoringService).toBeDefined();
    });

    it('应该有获取概览的方法', async () => {
      const { enhancedMonitoringService } = await import('./monitoring/enhancedMonitoringService');
      expect(typeof enhancedMonitoringService.getMonitoringOverview).toBe('function');
      expect(typeof enhancedMonitoringService.getDatabaseStatuses).toBe('function');
      expect(typeof enhancedMonitoringService.getServiceHealthStatuses).toBe('function');
    });
  });

  describe('EnhancedObservabilityService', () => {
    it('应该导出增强版可观测性服务', async () => {
      const { enhancedObservabilityService } = await import('./observability/enhancedObservabilityService');
      expect(enhancedObservabilityService).toBeDefined();
    });

    it('应该有获取概览的方法', async () => {
      const { enhancedObservabilityService } = await import('./observability/enhancedObservabilityService');
      expect(typeof enhancedObservabilityService.getSystemMetrics).toBe('function');
      expect(typeof enhancedObservabilityService.searchLogs).toBe('function');
      expect(typeof enhancedObservabilityService.searchTraces).toBe('function');
      expect(typeof enhancedObservabilityService.checkConnections).toBe('function');
    });
  });

  describe('EnhancedInfrastructureService', () => {
    it('应该导出增强版基础设施服务', async () => {
      const { enhancedInfrastructureService } = await import('./infrastructure/enhancedInfrastructureService');
      expect(enhancedInfrastructureService).toBeDefined();
    });

    it('应该有获取资源的方法', async () => {
      const { enhancedInfrastructureService } = await import('./infrastructure/enhancedInfrastructureService');
      expect(typeof enhancedInfrastructureService.getKubernetesOverview).toBe('function');
      expect(typeof enhancedInfrastructureService.getNodes).toBe('function');
      expect(typeof enhancedInfrastructureService.checkConnections).toBe('function');
    });
  });

  describe('EnhancedDataPipelineService', () => {
    it('应该导出增强版数据管道服务', async () => {
      const { enhancedDataPipelineService } = await import('./dataPipeline/enhancedDataPipelineService');
      expect(enhancedDataPipelineService).toBeDefined();
    });

    it('应该有获取概览的方法', async () => {
      const { enhancedDataPipelineService } = await import('./dataPipeline/enhancedDataPipelineService');
      expect(typeof enhancedDataPipelineService.getOverview).toBe('function');
      expect(typeof enhancedDataPipelineService.listDAGs).toBe('function');
      expect(typeof enhancedDataPipelineService.listConnectors).toBe('function');
    });
  });
});

describe('路由集成', () => {
  it('监控路由应该使用增强版服务', async () => {
    const { monitoringRouter } = await import('./monitoring/monitoringRouter');
    expect(monitoringRouter).toBeDefined();
    // 检查路由有 getSystemOverview 端点
    expect(monitoringRouter._def.procedures.getDashboard).toBeDefined();
  });

  it('可观测性路由应该使用增强版服务', async () => {
    const { observabilityRouter } = await import('./observability/observabilityRouter');
    expect(observabilityRouter).toBeDefined();
    // 检查路由有 getOverview 端点
    expect(observabilityRouter._def.procedures.getSummary).toBeDefined();
  });

  it('基础设施路由应该使用增强版服务', async () => {
    const { infrastructureRouter } = await import('./infrastructure/infrastructureRouter');
    expect(infrastructureRouter).toBeDefined();
    // 检查路由有 getNodes 端点
    expect(infrastructureRouter._def.procedures.getNodes).toBeDefined();
  });

  it('数据管道路由应该使用增强版服务', async () => {
    const { dataPipelineRouter } = await import('./dataPipeline/dataPipelineRouter');
    expect(dataPipelineRouter).toBeDefined();
    // 检查路由有 getDags 端点
    expect(dataPipelineRouter._def.procedures.getDags).toBeDefined();
  });
});
