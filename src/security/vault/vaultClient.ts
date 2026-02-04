/**
 * HashiCorp Vault 客户端服务
 * 提供密钥管理、凭证轮换、PKI 证书管理功能
 */

// Vault 配置
interface VaultConfig {
  address: string;
  token?: string;
  namespace?: string;
  roleId?: string;
  secretId?: string;
  caCert?: string;
  timeout: number;
}

// 密钥数据
interface SecretData {
  data: Record<string, any>;
  metadata: {
    created_time: string;
    deletion_time: string;
    destroyed: boolean;
    version: number;
  };
}

// 数据库凭证
interface DatabaseCredential {
  username: string;
  password: string;
  lease_id: string;
  lease_duration: number;
  renewable: boolean;
}

// PKI 证书
interface PKICertificate {
  certificate: string;
  issuing_ca: string;
  ca_chain: string[];
  private_key: string;
  private_key_type: string;
  serial_number: string;
  expiration: number;
}

// 令牌信息
interface TokenInfo {
  accessor: string;
  creation_time: number;
  creation_ttl: number;
  display_name: string;
  entity_id: string;
  expire_time: string;
  explicit_max_ttl: number;
  id: string;
  issue_time: string;
  meta: Record<string, string>;
  num_uses: number;
  orphan: boolean;
  path: string;
  policies: string[];
  renewable: boolean;
  ttl: number;
  type: string;
}

/**
 * Vault 客户端类
 */
export class VaultClient {
  private config: VaultConfig;
  private token: string | null = null;
  private tokenExpiry: number = 0;
  private leaseRenewals: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: Partial<VaultConfig> = {}) {
    this.config = {
      address: config.address || process.env.VAULT_ADDR || 'http://vault:8200',
      token: config.token || process.env.VAULT_TOKEN,
      namespace: config.namespace || process.env.VAULT_NAMESPACE,
      roleId: config.roleId || process.env.VAULT_ROLE_ID,
      secretId: config.secretId || process.env.VAULT_SECRET_ID,
      caCert: config.caCert || process.env.VAULT_CACERT,
      timeout: config.timeout || 30000,
    };

    if (this.config.token) {
      this.token = this.config.token;
    }
  }

  /**
   * 使用 AppRole 认证
   */
  async loginAppRole(roleId?: string, secretId?: string): Promise<void> {
    const role = roleId || this.config.roleId;
    const secret = secretId || this.config.secretId;

    if (!role || !secret) {
      throw new Error('AppRole credentials not provided');
    }

    const response = await this.request('POST', '/v1/auth/approle/login', {
      role_id: role,
      secret_id: secret,
    });

    this.token = response.auth.client_token;
    this.tokenExpiry = Date.now() + response.auth.lease_duration * 1000;

    // 设置令牌自动续期
    if (response.auth.renewable) {
      this.scheduleTokenRenewal(response.auth.lease_duration);
    }
  }

  /**
   * 使用 Kubernetes 认证
   */
  async loginKubernetes(role: string, jwt?: string): Promise<void> {
    const serviceAccountToken = jwt || await this.readServiceAccountToken();

    const response = await this.request('POST', '/v1/auth/kubernetes/login', {
      role,
      jwt: serviceAccountToken,
    });

    this.token = response.auth.client_token;
    this.tokenExpiry = Date.now() + response.auth.lease_duration * 1000;

    if (response.auth.renewable) {
      this.scheduleTokenRenewal(response.auth.lease_duration);
    }
  }

  /**
   * 读取 Kubernetes ServiceAccount 令牌
   */
  private async readServiceAccountToken(): Promise<string> {
    // 在 K8s 环境中读取 ServiceAccount 令牌
    const fs = await import('fs').then(m => m.promises);
    const tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token';
    return fs.readFile(tokenPath, 'utf-8');
  }

  /**
   * 调度令牌续期
   */
  private scheduleTokenRenewal(leaseDuration: number): void {
    // 在过期前 30 秒续期
    const renewalTime = (leaseDuration - 30) * 1000;
    
    setTimeout(async () => {
      try {
        await this.renewToken();
      } catch (error) {
        console.error('[Vault] Token renewal failed:', error);
      }
    }, renewalTime);
  }

  /**
   * 续期令牌
   */
  async renewToken(): Promise<void> {
    const response = await this.request('POST', '/v1/auth/token/renew-self');
    this.tokenExpiry = Date.now() + response.auth.lease_duration * 1000;
    
    if (response.auth.renewable) {
      this.scheduleTokenRenewal(response.auth.lease_duration);
    }
  }

  /**
   * 获取令牌信息
   */
  async getTokenInfo(): Promise<TokenInfo> {
    const response = await this.request('GET', '/v1/auth/token/lookup-self');
    return response.data;
  }

  // ==================== KV 密钥引擎 ====================

  /**
   * 读取 KV 密钥
   */
  async readSecret(path: string, version?: number): Promise<SecretData> {
    const versionParam = version ? `?version=${version}` : '';
    const response = await this.request('GET', `/v1/secret/data/${path}${versionParam}`);
    return response.data;
  }

  /**
   * 写入 KV 密钥
   */
  async writeSecret(path: string, data: Record<string, any>): Promise<void> {
    await this.request('POST', `/v1/secret/data/${path}`, { data });
  }

  /**
   * 删除 KV 密钥
   */
  async deleteSecret(path: string): Promise<void> {
    await this.request('DELETE', `/v1/secret/data/${path}`);
  }

  /**
   * 列出密钥
   */
  async listSecrets(path: string): Promise<string[]> {
    const response = await this.request('LIST', `/v1/secret/metadata/${path}`);
    return response.data.keys;
  }

  // ==================== 数据库密钥引擎 ====================

  /**
   * 获取数据库凭证
   */
  async getDatabaseCredential(role: string): Promise<DatabaseCredential> {
    const response = await this.request('GET', `/v1/database/creds/${role}`);
    
    const credential: DatabaseCredential = {
      username: response.data.username,
      password: response.data.password,
      lease_id: response.lease_id,
      lease_duration: response.lease_duration,
      renewable: response.renewable,
    };

    // 设置凭证自动续期
    if (credential.renewable) {
      this.scheduleLeaseRenewal(credential.lease_id, credential.lease_duration);
    }

    return credential;
  }

  /**
   * 续期租约
   */
  async renewLease(leaseId: string, increment?: number): Promise<number> {
    const response = await this.request('POST', '/v1/sys/leases/renew', {
      lease_id: leaseId,
      increment,
    });
    return response.lease_duration;
  }

  /**
   * 撤销租约
   */
  async revokeLease(leaseId: string): Promise<void> {
    await this.request('POST', '/v1/sys/leases/revoke', {
      lease_id: leaseId,
    });

    // 清除续期定时器
    const timer = this.leaseRenewals.get(leaseId);
    if (timer) {
      clearTimeout(timer);
      this.leaseRenewals.delete(leaseId);
    }
  }

  /**
   * 调度租约续期
   */
  private scheduleLeaseRenewal(leaseId: string, leaseDuration: number): void {
    // 在过期前 30 秒续期
    const renewalTime = Math.max((leaseDuration - 30) * 1000, 1000);
    
    const timer = setTimeout(async () => {
      try {
        const newDuration = await this.renewLease(leaseId);
        this.scheduleLeaseRenewal(leaseId, newDuration);
      } catch (error) {
        console.error(`[Vault] Lease renewal failed for ${leaseId}:`, error);
        this.leaseRenewals.delete(leaseId);
      }
    }, renewalTime);

    this.leaseRenewals.set(leaseId, timer);
  }

  // ==================== PKI 密钥引擎 ====================

  /**
   * 生成 PKI 证书
   */
  async generateCertificate(
    role: string,
    commonName: string,
    options?: {
      altNames?: string[];
      ipSans?: string[];
      ttl?: string;
      format?: 'pem' | 'der' | 'pem_bundle';
    }
  ): Promise<PKICertificate> {
    const response = await this.request('POST', `/v1/pki/issue/${role}`, {
      common_name: commonName,
      alt_names: options?.altNames?.join(','),
      ip_sans: options?.ipSans?.join(','),
      ttl: options?.ttl,
      format: options?.format || 'pem',
    });

    return {
      certificate: response.data.certificate,
      issuing_ca: response.data.issuing_ca,
      ca_chain: response.data.ca_chain || [],
      private_key: response.data.private_key,
      private_key_type: response.data.private_key_type,
      serial_number: response.data.serial_number,
      expiration: response.data.expiration,
    };
  }

  /**
   * 获取 CA 证书
   */
  async getCACertificate(): Promise<string> {
    const response = await this.request('GET', '/v1/pki/ca/pem');
    return response;
  }

  /**
   * 撤销证书
   */
  async revokeCertificate(serialNumber: string): Promise<void> {
    await this.request('POST', '/v1/pki/revoke', {
      serial_number: serialNumber,
    });
  }

  /**
   * 获取 CRL
   */
  async getCRL(): Promise<string> {
    const response = await this.request('GET', '/v1/pki/crl/pem');
    return response;
  }

  // ==================== Transit 加密引擎 ====================

  /**
   * 加密数据
   */
  async encrypt(keyName: string, plaintext: string): Promise<string> {
    const encoded = Buffer.from(plaintext).toString('base64');
    const response = await this.request('POST', `/v1/transit/encrypt/${keyName}`, {
      plaintext: encoded,
    });
    return response.data.ciphertext;
  }

  /**
   * 解密数据
   */
  async decrypt(keyName: string, ciphertext: string): Promise<string> {
    const response = await this.request('POST', `/v1/transit/decrypt/${keyName}`, {
      ciphertext,
    });
    return Buffer.from(response.data.plaintext, 'base64').toString('utf-8');
  }

  /**
   * 生成数据密钥
   */
  async generateDataKey(keyName: string): Promise<{ plaintext: string; ciphertext: string }> {
    const response = await this.request('POST', `/v1/transit/datakey/plaintext/${keyName}`);
    return {
      plaintext: response.data.plaintext,
      ciphertext: response.data.ciphertext,
    };
  }

  // ==================== 健康检查 ====================

  /**
   * 检查 Vault 健康状态
   */
  async healthCheck(): Promise<{
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
  }> {
    const response = await this.request('GET', '/v1/sys/health', undefined, false);
    return response;
  }

  /**
   * 获取 Vault 状态
   */
  async getStatus(): Promise<{
    type: string;
    initialized: boolean;
    sealed: boolean;
    t: number;
    n: number;
    progress: number;
    nonce: string;
    version: string;
    build_date: string;
    migration: boolean;
    cluster_name: string;
    cluster_id: string;
    recovery_seal: boolean;
    storage_type: string;
  }> {
    const response = await this.request('GET', '/v1/sys/seal-status', undefined, false);
    return response;
  }

  // ==================== 内部方法 ====================

  /**
   * 发送 HTTP 请求
   */
  private async request(
    method: string,
    path: string,
    body?: any,
    requireAuth: boolean = true
  ): Promise<any> {
    if (requireAuth && !this.token) {
      throw new Error('Vault client not authenticated');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['X-Vault-Token'] = this.token;
    }

    if (this.config.namespace) {
      headers['X-Vault-Namespace'] = this.config.namespace;
    }

    const url = `${this.config.address}${path}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: method === 'LIST' ? 'GET' : method,
        headers: {
          ...headers,
          ...(method === 'LIST' ? { 'X-Vault-Request': 'true' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Vault request failed: ${response.status} - ${JSON.stringify(error)}`);
      }

      // 某些端点返回纯文本
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return response.json();
      }
      return response.text();
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Vault request timeout');
      }
      throw error;
    }
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    for (const timer of this.leaseRenewals.values()) {
      clearTimeout(timer);
    }
    this.leaseRenewals.clear();
  }
}

// 导出单例
export const vaultClient = new VaultClient();
