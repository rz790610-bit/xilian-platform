/**
 * HashiCorp Vault 真实客户端
 * 连接 Vault HTTP API 进行密钥管理
 */

import http from 'http';
import https from 'https';

// 配置
const VAULT_CONFIG = {
  host: process.env.VAULT_HOST || 'localhost',
  port: parseInt(process.env.VAULT_PORT || '8200'),
  protocol: process.env.VAULT_PROTOCOL || 'http',
  token: process.env.VAULT_TOKEN,
  namespace: process.env.VAULT_NAMESPACE,
  timeout: 30000,
};

// ============================================================
// 类型定义
// ============================================================

export interface VaultSecret {
  request_id: string;
  lease_id: string;
  renewable: boolean;
  lease_duration: number;
  data: Record<string, unknown>;
  wrap_info: null;
  warnings: string[] | null;
  auth: null;
}

export interface VaultSecretMetadata {
  created_time: string;
  custom_metadata: Record<string, string> | null;
  deletion_time: string;
  destroyed: boolean;
  version: number;
}

export interface VaultMountInfo {
  accessor: string;
  config: {
    default_lease_ttl: number;
    force_no_cache: boolean;
    max_lease_ttl: number;
  };
  description: string;
  external_entropy_access: boolean;
  local: boolean;
  options: Record<string, string> | null;
  seal_wrap: boolean;
  type: string;
  uuid: string;
}

export interface VaultHealth {
  initialized: boolean;
  sealed: boolean;
  standby: boolean;
  performance_standby: boolean;
  replication_performance_mode: string;
  replication_dr_mode: string;
  server_time_utc: number;
  version: string;
  cluster_name: string;
  cluster_id: string;
}

export interface VaultPolicy {
  name: string;
  rules: string;
}

// ============================================================
// HTTP 请求工具
// ============================================================

async function vaultRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'LIST',
  path: string,
  body?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (VAULT_CONFIG.token) {
      headers['X-Vault-Token'] = VAULT_CONFIG.token;
    }
    if (VAULT_CONFIG.namespace) {
      headers['X-Vault-Namespace'] = VAULT_CONFIG.namespace;
    }

    // LIST 请求使用 GET 方法加 list=true 参数
    const actualMethod = method === 'LIST' ? 'GET' : method;
    const actualPath = method === 'LIST' ? `${path}?list=true` : path;

    const options = {
      hostname: VAULT_CONFIG.host,
      port: VAULT_CONFIG.port,
      path: `/v1${actualPath}`,
      method: actualMethod,
      timeout: VAULT_CONFIG.timeout,
      headers,
    };

    const protocol = VAULT_CONFIG.protocol === 'https' ? https : http;
    
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
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Vault error: ${parsed.errors?.join(', ') || data}`));
          } else {
            resolve(parsed);
          }
        } catch (error) {
          reject(new Error(`Failed to parse Vault response: ${error}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Vault request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Vault request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

// ============================================================
// Vault 客户端类
// ============================================================

export class VaultClient {
  private static instance: VaultClient;

  private constructor() {
    console.log('[Vault] Client initialized');
  }

  static getInstance(): VaultClient {
    if (!VaultClient.instance) {
      VaultClient.instance = new VaultClient();
    }
    return VaultClient.instance;
  }

  /**
   * 检查连接状态
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.getHealth();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取 Vault 健康状态
   */
  async getHealth(): Promise<VaultHealth | null> {
    try {
      return await vaultRequest<VaultHealth>('GET', '/sys/health');
    } catch {
      return null;
    }
  }

  /**
   * 获取 Vault 版本信息
   */
  async getVersion(): Promise<string | null> {
    const health = await this.getHealth();
    return health?.version || null;
  }

  // ============================================================
  // KV Secrets Engine (v2)
  // ============================================================

  /**
   * 读取密钥
   */
  async readSecret(
    mount: string,
    path: string,
    version?: number
  ): Promise<Record<string, unknown> | null> {
    try {
      const versionParam = version ? `?version=${version}` : '';
      const result = await vaultRequest<{ data: { data: Record<string, unknown> } }>(
        'GET',
        `/${mount}/data/${path}${versionParam}`
      );
      return result.data?.data || null;
    } catch {
      return null;
    }
  }

  /**
   * 写入密钥
   */
  async writeSecret(
    mount: string,
    path: string,
    data: Record<string, unknown>
  ): Promise<boolean> {
    try {
      await vaultRequest('POST', `/${mount}/data/${path}`, { data });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 删除密钥（软删除）
   */
  async deleteSecret(mount: string, path: string): Promise<boolean> {
    try {
      await vaultRequest('DELETE', `/${mount}/data/${path}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 永久删除密钥
   */
  async destroySecret(mount: string, path: string, versions: number[]): Promise<boolean> {
    try {
      await vaultRequest('POST', `/${mount}/destroy/${path}`, { versions });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 列出密钥路径
   */
  async listSecrets(mount: string, path: string = ''): Promise<string[]> {
    try {
      const result = await vaultRequest<{ data: { keys: string[] } }>(
        'LIST',
        `/${mount}/metadata/${path}`
      );
      return result.data?.keys || [];
    } catch {
      return [];
    }
  }

  /**
   * 获取密钥元数据
   */
  async getSecretMetadata(
    mount: string,
    path: string
  ): Promise<VaultSecretMetadata | null> {
    try {
      const result = await vaultRequest<{ data: VaultSecretMetadata }>(
        'GET',
        `/${mount}/metadata/${path}`
      );
      return result.data || null;
    } catch {
      return null;
    }
  }

  // ============================================================
  // Secrets Engines 管理
  // ============================================================

  /**
   * 列出所有 Secrets Engines
   */
  async listMounts(): Promise<Record<string, VaultMountInfo>> {
    try {
      const result = await vaultRequest<{ data: Record<string, VaultMountInfo> }>(
        'GET',
        '/sys/mounts'
      );
      return result.data || {};
    } catch {
      return {};
    }
  }

  /**
   * 启用 Secrets Engine
   */
  async enableMount(
    path: string,
    type: string,
    description?: string
  ): Promise<boolean> {
    try {
      await vaultRequest('POST', `/sys/mounts/${path}`, {
        type,
        description,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 禁用 Secrets Engine
   */
  async disableMount(path: string): Promise<boolean> {
    try {
      await vaultRequest('DELETE', `/sys/mounts/${path}`);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // 策略管理
  // ============================================================

  /**
   * 列出所有策略
   */
  async listPolicies(): Promise<string[]> {
    try {
      const result = await vaultRequest<{ data: { policies: string[] } }>(
        'GET',
        '/sys/policies/acl'
      );
      return result.data?.policies || [];
    } catch {
      return [];
    }
  }

  /**
   * 读取策略
   */
  async readPolicy(name: string): Promise<VaultPolicy | null> {
    try {
      const result = await vaultRequest<{ data: { name: string; policy: string } }>(
        'GET',
        `/sys/policies/acl/${name}`
      );
      return result.data ? { name: result.data.name, rules: result.data.policy } : null;
    } catch {
      return null;
    }
  }

  /**
   * 创建/更新策略
   */
  async writePolicy(name: string, rules: string): Promise<boolean> {
    try {
      await vaultRequest('PUT', `/sys/policies/acl/${name}`, { policy: rules });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 删除策略
   */
  async deletePolicy(name: string): Promise<boolean> {
    try {
      await vaultRequest('DELETE', `/sys/policies/acl/${name}`);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // Token 管理
  // ============================================================

  /**
   * 查看当前 Token 信息
   */
  async lookupSelf(): Promise<{
    id: string;
    accessor: string;
    policies: string[];
    ttl: number;
    renewable: boolean;
    creation_time: number;
    expire_time: string | null;
  } | null> {
    try {
      const result = await vaultRequest<{ data: any }>('GET', '/auth/token/lookup-self');
      return result.data || null;
    } catch {
      return null;
    }
  }

  /**
   * 续期当前 Token
   */
  async renewSelf(increment?: string): Promise<boolean> {
    try {
      await vaultRequest('POST', '/auth/token/renew-self', increment ? { increment } : {});
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // 审计日志
  // ============================================================

  /**
   * 列出审计设备
   */
  async listAuditDevices(): Promise<Record<string, {
    type: string;
    description: string;
    options: Record<string, string>;
    local: boolean;
    path: string;
  }>> {
    try {
      const result = await vaultRequest<{ data: any }>('GET', '/sys/audit');
      return result.data || {};
    } catch {
      return {};
    }
  }

  // ============================================================
  // 集群概览
  // ============================================================

  /**
   * 获取 Vault 概览
   */
  async getOverview(): Promise<{
    health: VaultHealth | null;
    mounts: number;
    policies: number;
    tokenInfo: {
      policies: string[];
      ttl: number;
      renewable: boolean;
    } | null;
  }> {
    const [health, mounts, policies, tokenInfo] = await Promise.all([
      this.getHealth(),
      this.listMounts(),
      this.listPolicies(),
      this.lookupSelf(),
    ]);

    return {
      health,
      mounts: Object.keys(mounts).length,
      policies: policies.length,
      tokenInfo: tokenInfo ? {
        policies: tokenInfo.policies,
        ttl: tokenInfo.ttl,
        renewable: tokenInfo.renewable,
      } : null,
    };
  }
}

// 导出单例
export const vaultClient = VaultClient.getInstance();
