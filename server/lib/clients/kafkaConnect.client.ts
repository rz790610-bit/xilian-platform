/**
 * Kafka Connect 真实客户端
 * 连接 Kafka Connect REST API 进行连接器管理
 */

import http from 'http';
import https from 'https';

// 配置
const KAFKA_CONNECT_CONFIG = {
  host: process.env.KAFKA_CONNECT_HOST || 'localhost',
  port: parseInt(process.env.KAFKA_CONNECT_PORT || '8083'),
  protocol: process.env.KAFKA_CONNECT_PROTOCOL || 'http',
  timeout: 30000,
};

// ============================================================
// 类型定义
// ============================================================

export interface KafkaConnector {
  name: string;
  config: Record<string, string>;
  tasks: Array<{
    connector: string;
    task: number;
  }>;
  type: 'source' | 'sink';
}

export interface KafkaConnectorStatus {
  name: string;
  connector: {
    state: 'RUNNING' | 'PAUSED' | 'UNASSIGNED' | 'FAILED';
    worker_id: string;
  };
  tasks: Array<{
    id: number;
    state: 'RUNNING' | 'PAUSED' | 'UNASSIGNED' | 'FAILED';
    worker_id: string;
    trace?: string;
  }>;
  type: 'source' | 'sink';
}

export interface KafkaConnectorPlugin {
  class: string;
  type: 'source' | 'sink' | 'converter' | 'header_converter' | 'transformation' | 'predicate';
  version: string;
}

export interface KafkaConnectorTaskConfig {
  'connector.class': string;
  'tasks.max': string;
  [key: string]: string;
}

// ============================================================
// HTTP 请求工具
// ============================================================

async function kafkaConnectRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const options = {
      hostname: KAFKA_CONNECT_CONFIG.host,
      port: KAFKA_CONNECT_CONFIG.port,
      path,
      method,
      timeout: KAFKA_CONNECT_CONFIG.timeout,
      headers,
    };

    const protocol = KAFKA_CONNECT_CONFIG.protocol === 'https' ? https : http;
    
    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode === 204) {
            resolve({} as T);
            return;
          }
          if (!data) {
            resolve({} as T);
            return;
          }
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Kafka Connect error: ${parsed.message || data}`));
          } else {
            resolve(parsed);
          }
        } catch (error) {
          reject(new Error(`Failed to parse Kafka Connect response: ${error}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Kafka Connect request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Kafka Connect request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

// ============================================================
// Kafka Connect 客户端类
// ============================================================

export class KafkaConnectClient {
  private static instance: KafkaConnectClient;

  private constructor() {
    console.log('[KafkaConnect] Client initialized');
  }

  static getInstance(): KafkaConnectClient {
    if (!KafkaConnectClient.instance) {
      KafkaConnectClient.instance = new KafkaConnectClient();
    }
    return KafkaConnectClient.instance;
  }

  /**
   * 检查连接状态
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.getClusterInfo();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取集群信息
   */
  async getClusterInfo(): Promise<{
    version: string;
    commit: string;
    kafka_cluster_id: string;
  } | null> {
    try {
      return await kafkaConnectRequest('GET', '/');
    } catch {
      return null;
    }
  }

  // ============================================================
  // 连接器管理
  // ============================================================

  /**
   * 列出所有连接器
   */
  async listConnectors(): Promise<string[]> {
    try {
      return await kafkaConnectRequest<string[]>('GET', '/connectors');
    } catch {
      return [];
    }
  }

  /**
   * 获取连接器详情
   */
  async getConnector(name: string): Promise<KafkaConnector | null> {
    try {
      return await kafkaConnectRequest<KafkaConnector>(
        'GET',
        `/connectors/${encodeURIComponent(name)}`
      );
    } catch {
      return null;
    }
  }

  /**
   * 获取连接器配置
   */
  async getConnectorConfig(name: string): Promise<Record<string, string> | null> {
    try {
      return await kafkaConnectRequest<Record<string, string>>(
        'GET',
        `/connectors/${encodeURIComponent(name)}/config`
      );
    } catch {
      return null;
    }
  }

  /**
   * 创建连接器
   */
  async createConnector(
    name: string,
    config: Record<string, string>
  ): Promise<KafkaConnector | null> {
    try {
      return await kafkaConnectRequest<KafkaConnector>('POST', '/connectors', {
        name,
        config,
      });
    } catch {
      return null;
    }
  }

  /**
   * 更新连接器配置
   */
  async updateConnectorConfig(
    name: string,
    config: Record<string, string>
  ): Promise<KafkaConnector | null> {
    try {
      return await kafkaConnectRequest<KafkaConnector>(
        'PUT',
        `/connectors/${encodeURIComponent(name)}/config`,
        config
      );
    } catch {
      return null;
    }
  }

  /**
   * 删除连接器
   */
  async deleteConnector(name: string): Promise<boolean> {
    try {
      await kafkaConnectRequest('DELETE', `/connectors/${encodeURIComponent(name)}`);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // 连接器状态管理
  // ============================================================

  /**
   * 获取连接器状态
   */
  async getConnectorStatus(name: string): Promise<KafkaConnectorStatus | null> {
    try {
      return await kafkaConnectRequest<KafkaConnectorStatus>(
        'GET',
        `/connectors/${encodeURIComponent(name)}/status`
      );
    } catch {
      return null;
    }
  }

  /**
   * 暂停连接器
   */
  async pauseConnector(name: string): Promise<boolean> {
    try {
      await kafkaConnectRequest('PUT', `/connectors/${encodeURIComponent(name)}/pause`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 恢复连接器
   */
  async resumeConnector(name: string): Promise<boolean> {
    try {
      await kafkaConnectRequest('PUT', `/connectors/${encodeURIComponent(name)}/resume`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 重启连接器
   */
  async restartConnector(name: string): Promise<boolean> {
    try {
      await kafkaConnectRequest('POST', `/connectors/${encodeURIComponent(name)}/restart`);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // 任务管理
  // ============================================================

  /**
   * 列出连接器任务
   */
  async listConnectorTasks(
    name: string
  ): Promise<Array<{ id: { connector: string; task: number }; config: Record<string, string> }>> {
    try {
      return await kafkaConnectRequest(
        'GET',
        `/connectors/${encodeURIComponent(name)}/tasks`
      );
    } catch {
      return [];
    }
  }

  /**
   * 获取任务状态
   */
  async getTaskStatus(
    connectorName: string,
    taskId: number
  ): Promise<{
    id: number;
    state: string;
    worker_id: string;
    trace?: string;
  } | null> {
    try {
      return await kafkaConnectRequest(
        'GET',
        `/connectors/${encodeURIComponent(connectorName)}/tasks/${taskId}/status`
      );
    } catch {
      return null;
    }
  }

  /**
   * 重启任务
   */
  async restartTask(connectorName: string, taskId: number): Promise<boolean> {
    try {
      await kafkaConnectRequest(
        'POST',
        `/connectors/${encodeURIComponent(connectorName)}/tasks/${taskId}/restart`
      );
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // 插件管理
  // ============================================================

  /**
   * 列出可用插件
   */
  async listPlugins(): Promise<KafkaConnectorPlugin[]> {
    try {
      return await kafkaConnectRequest<KafkaConnectorPlugin[]>(
        'GET',
        '/connector-plugins'
      );
    } catch {
      return [];
    }
  }

  /**
   * 验证连接器配置
   */
  async validateConnectorConfig(
    pluginClass: string,
    config: Record<string, string>
  ): Promise<{
    name: string;
    error_count: number;
    groups: string[];
    configs: Array<{
      definition: {
        name: string;
        type: string;
        required: boolean;
        default_value: string | null;
        importance: string;
        documentation: string;
      };
      value: {
        name: string;
        value: string | null;
        recommended_values: string[];
        errors: string[];
        visible: boolean;
      };
    }>;
  } | null> {
    try {
      const pluginName = pluginClass.split('.').pop() || pluginClass;
      return await kafkaConnectRequest(
        'PUT',
        `/connector-plugins/${encodeURIComponent(pluginName)}/config/validate`,
        config
      );
    } catch {
      return null;
    }
  }

  // ============================================================
  // 概览
  // ============================================================

  /**
   * 获取 Kafka Connect 概览
   */
  async getOverview(): Promise<{
    version: string | null;
    kafkaClusterId: string | null;
    connectors: {
      total: number;
      running: number;
      paused: number;
      failed: number;
    };
    tasks: {
      total: number;
      running: number;
      failed: number;
    };
    plugins: {
      source: number;
      sink: number;
      other: number;
    };
  }> {
    const [clusterInfo, connectorNames, plugins] = await Promise.all([
      this.getClusterInfo(),
      this.listConnectors(),
      this.listPlugins(),
    ]);

    // 获取所有连接器状态
    const connectorStatuses = await Promise.all(
      connectorNames.map((name) => this.getConnectorStatus(name))
    );

    const connectorStats = {
      total: connectorNames.length,
      running: 0,
      paused: 0,
      failed: 0,
    };

    const taskStats = {
      total: 0,
      running: 0,
      failed: 0,
    };

    for (const status of connectorStatuses) {
      if (!status) continue;

      if (status.connector.state === 'RUNNING') connectorStats.running++;
      else if (status.connector.state === 'PAUSED') connectorStats.paused++;
      else if (status.connector.state === 'FAILED') connectorStats.failed++;

      for (const task of status.tasks) {
        taskStats.total++;
        if (task.state === 'RUNNING') taskStats.running++;
        else if (task.state === 'FAILED') taskStats.failed++;
      }
    }

    const pluginStats = {
      source: plugins.filter((p) => p.type === 'source').length,
      sink: plugins.filter((p) => p.type === 'sink').length,
      other: plugins.filter((p) => !['source', 'sink'].includes(p.type)).length,
    };

    return {
      version: clusterInfo?.version || null,
      kafkaClusterId: clusterInfo?.kafka_cluster_id || null,
      connectors: connectorStats,
      tasks: taskStats,
      plugins: pluginStats,
    };
  }
}

// 导出单例
export const kafkaConnectClient = KafkaConnectClient.getInstance();
