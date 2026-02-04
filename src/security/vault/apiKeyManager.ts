/**
 * API 密钥管理服务
 * 使用 Vault KV 引擎管理 API 密钥的存储、轮换和访问
 */

import { VaultClient } from './vaultClient';

// API 密钥类型
type ApiKeyType = 'internal' | 'external' | 'service' | 'webhook';

// API 密钥元数据
interface ApiKeyMetadata {
  name: string;
  type: ApiKeyType;
  description: string;
  owner: string;
  createdAt: number;
  expiresAt?: number;
  lastRotated?: number;
  rotationCount: number;
  scopes: string[];
  rateLimit?: number;
  allowedIps?: string[];
  tags: Record<string, string>;
}

// API 密钥
interface ApiKey {
  id: string;
  key: string;
  metadata: ApiKeyMetadata;
}

// 密钥生成选项
interface KeyGenerationOptions {
  length?: number;
  prefix?: string;
  charset?: 'alphanumeric' | 'hex' | 'base64';
}

/**
 * API 密钥管理器
 */
export class ApiKeyManager {
  private vaultClient: VaultClient;
  private basePath: string;
  private keyCache: Map<string, { key: ApiKey; cachedAt: number }> = new Map();
  private cacheTTL: number = 60000; // 1 分钟缓存

  constructor(vaultClient: VaultClient, basePath: string = 'api-keys') {
    this.vaultClient = vaultClient;
    this.basePath = basePath;
  }

  /**
   * 创建新的 API 密钥
   */
  async createKey(
    name: string,
    type: ApiKeyType,
    options: {
      description?: string;
      owner: string;
      expiresIn?: number; // 秒
      scopes?: string[];
      rateLimit?: number;
      allowedIps?: string[];
      tags?: Record<string, string>;
      keyOptions?: KeyGenerationOptions;
    }
  ): Promise<ApiKey> {
    const id = this.generateKeyId();
    const key = this.generateKey(options.keyOptions);
    const now = Date.now();

    const metadata: ApiKeyMetadata = {
      name,
      type,
      description: options.description || '',
      owner: options.owner,
      createdAt: now,
      expiresAt: options.expiresIn ? now + options.expiresIn * 1000 : undefined,
      rotationCount: 0,
      scopes: options.scopes || ['*'],
      rateLimit: options.rateLimit,
      allowedIps: options.allowedIps,
      tags: options.tags || {},
    };

    // 存储到 Vault
    await this.vaultClient.writeSecret(`${this.basePath}/${id}`, {
      key,
      metadata,
    });

    const apiKey: ApiKey = { id, key, metadata };
    
    // 更新缓存
    this.keyCache.set(id, { key: apiKey, cachedAt: now });

    return apiKey;
  }

  /**
   * 获取 API 密钥
   */
  async getKey(id: string): Promise<ApiKey | null> {
    // 检查缓存
    const cached = this.keyCache.get(id);
    if (cached && Date.now() - cached.cachedAt < this.cacheTTL) {
      return cached.key;
    }

    try {
      const secret = await this.vaultClient.readSecret(`${this.basePath}/${id}`);
      const apiKey: ApiKey = {
        id,
        key: secret.data.key,
        metadata: secret.data.metadata,
      };

      // 检查是否过期
      if (apiKey.metadata.expiresAt && Date.now() > apiKey.metadata.expiresAt) {
        return null;
      }

      // 更新缓存
      this.keyCache.set(id, { key: apiKey, cachedAt: Date.now() });

      return apiKey;
    } catch (error) {
      return null;
    }
  }

  /**
   * 验证 API 密钥
   */
  async validateKey(
    keyValue: string,
    options?: {
      requiredScopes?: string[];
      clientIp?: string;
    }
  ): Promise<{
    valid: boolean;
    keyId?: string;
    metadata?: ApiKeyMetadata;
    reason?: string;
  }> {
    // 从密钥值中提取 ID（如果有前缀）
    const keyId = this.extractKeyId(keyValue);
    
    if (!keyId) {
      // 需要遍历所有密钥进行匹配（性能较差，建议使用带 ID 的密钥格式）
      const keys = await this.listKeys();
      for (const id of keys) {
        const apiKey = await this.getKey(id);
        if (apiKey?.key === keyValue) {
          return this.validateKeyInternal(apiKey, options);
        }
      }
      return { valid: false, reason: 'Key not found' };
    }

    const apiKey = await this.getKey(keyId);
    if (!apiKey || apiKey.key !== keyValue) {
      return { valid: false, reason: 'Key not found or mismatch' };
    }

    return this.validateKeyInternal(apiKey, options);
  }

  /**
   * 内部密钥验证
   */
  private validateKeyInternal(
    apiKey: ApiKey,
    options?: {
      requiredScopes?: string[];
      clientIp?: string;
    }
  ): {
    valid: boolean;
    keyId?: string;
    metadata?: ApiKeyMetadata;
    reason?: string;
  } {
    // 检查过期
    if (apiKey.metadata.expiresAt && Date.now() > apiKey.metadata.expiresAt) {
      return { valid: false, keyId: apiKey.id, reason: 'Key expired' };
    }

    // 检查 IP 白名单
    if (options?.clientIp && apiKey.metadata.allowedIps?.length) {
      if (!this.isIpAllowed(options.clientIp, apiKey.metadata.allowedIps)) {
        return { valid: false, keyId: apiKey.id, reason: 'IP not allowed' };
      }
    }

    // 检查权限范围
    if (options?.requiredScopes?.length) {
      if (!this.hasRequiredScopes(apiKey.metadata.scopes, options.requiredScopes)) {
        return { valid: false, keyId: apiKey.id, reason: 'Insufficient scopes' };
      }
    }

    return {
      valid: true,
      keyId: apiKey.id,
      metadata: apiKey.metadata,
    };
  }

  /**
   * 轮换 API 密钥
   */
  async rotateKey(id: string, options?: KeyGenerationOptions): Promise<ApiKey> {
    const existing = await this.getKey(id);
    if (!existing) {
      throw new Error(`Key ${id} not found`);
    }

    const newKey = this.generateKey(options);
    const now = Date.now();

    const updatedMetadata: ApiKeyMetadata = {
      ...existing.metadata,
      lastRotated: now,
      rotationCount: existing.metadata.rotationCount + 1,
    };

    // 更新 Vault
    await this.vaultClient.writeSecret(`${this.basePath}/${id}`, {
      key: newKey,
      metadata: updatedMetadata,
    });

    const apiKey: ApiKey = {
      id,
      key: newKey,
      metadata: updatedMetadata,
    };

    // 更新缓存
    this.keyCache.set(id, { key: apiKey, cachedAt: now });

    return apiKey;
  }

  /**
   * 更新密钥元数据
   */
  async updateMetadata(
    id: string,
    updates: Partial<Pick<ApiKeyMetadata, 'description' | 'scopes' | 'rateLimit' | 'allowedIps' | 'tags'>>
  ): Promise<ApiKey> {
    const existing = await this.getKey(id);
    if (!existing) {
      throw new Error(`Key ${id} not found`);
    }

    const updatedMetadata: ApiKeyMetadata = {
      ...existing.metadata,
      ...updates,
    };

    await this.vaultClient.writeSecret(`${this.basePath}/${id}`, {
      key: existing.key,
      metadata: updatedMetadata,
    });

    const apiKey: ApiKey = {
      id,
      key: existing.key,
      metadata: updatedMetadata,
    };

    // 更新缓存
    this.keyCache.set(id, { key: apiKey, cachedAt: Date.now() });

    return apiKey;
  }

  /**
   * 删除 API 密钥
   */
  async deleteKey(id: string): Promise<void> {
    await this.vaultClient.deleteSecret(`${this.basePath}/${id}`);
    this.keyCache.delete(id);
  }

  /**
   * 列出所有密钥
   */
  async listKeys(): Promise<string[]> {
    try {
      return await this.vaultClient.listSecrets(this.basePath);
    } catch (error) {
      return [];
    }
  }

  /**
   * 获取所有密钥元数据
   */
  async listKeysWithMetadata(): Promise<Array<{ id: string; metadata: ApiKeyMetadata }>> {
    const keyIds = await this.listKeys();
    const results: Array<{ id: string; metadata: ApiKeyMetadata }> = [];

    for (const id of keyIds) {
      const key = await this.getKey(id);
      if (key) {
        results.push({ id, metadata: key.metadata });
      }
    }

    return results;
  }

  /**
   * 查找即将过期的密钥
   */
  async findExpiringKeys(withinSeconds: number): Promise<Array<{ id: string; metadata: ApiKeyMetadata }>> {
    const keys = await this.listKeysWithMetadata();
    const threshold = Date.now() + withinSeconds * 1000;

    return keys.filter(k => k.metadata.expiresAt && k.metadata.expiresAt < threshold);
  }

  /**
   * 批量轮换即将过期的密钥
   */
  async rotateExpiringKeys(withinSeconds: number): Promise<string[]> {
    const expiringKeys = await this.findExpiringKeys(withinSeconds);
    const rotatedIds: string[] = [];

    for (const { id } of expiringKeys) {
      try {
        await this.rotateKey(id);
        rotatedIds.push(id);
      } catch (error) {
        console.error(`[ApiKeyManager] Failed to rotate key ${id}:`, error);
      }
    }

    return rotatedIds;
  }

  // ==================== 辅助方法 ====================

  /**
   * 生成密钥 ID
   */
  private generateKeyId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${random}`;
  }

  /**
   * 生成密钥值
   */
  private generateKey(options?: KeyGenerationOptions): string {
    const length = options?.length || 32;
    const prefix = options?.prefix || '';
    const charset = options?.charset || 'alphanumeric';

    let chars: string;
    switch (charset) {
      case 'hex':
        chars = '0123456789abcdef';
        break;
      case 'base64':
        chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        break;
      default:
        chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    }

    let key = '';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    
    for (let i = 0; i < length; i++) {
      key += chars[array[i] % chars.length];
    }

    return prefix + key;
  }

  /**
   * 从密钥值中提取 ID
   */
  private extractKeyId(keyValue: string): string | null {
    // 假设密钥格式为 "prefix_id_key" 或直接是 key
    const parts = keyValue.split('_');
    if (parts.length >= 2) {
      return parts[1];
    }
    return null;
  }

  /**
   * 检查 IP 是否在白名单中
   */
  private isIpAllowed(clientIp: string, allowedIps: string[]): boolean {
    for (const allowed of allowedIps) {
      if (allowed === clientIp) return true;
      
      // 支持 CIDR 格式
      if (allowed.includes('/')) {
        if (this.isIpInCidr(clientIp, allowed)) return true;
      }
    }
    return false;
  }

  /**
   * 检查 IP 是否在 CIDR 范围内
   */
  private isIpInCidr(ip: string, cidr: string): boolean {
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);
    
    const ipNum = this.ipToNumber(ip);
    const rangeNum = this.ipToNumber(range);
    
    return (ipNum & mask) === (rangeNum & mask);
  }

  /**
   * IP 地址转数字
   */
  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
  }

  /**
   * 检查是否有所需权限
   */
  private hasRequiredScopes(keyScopes: string[], requiredScopes: string[]): boolean {
    // 通配符匹配所有权限
    if (keyScopes.includes('*')) return true;

    for (const required of requiredScopes) {
      const hasScope = keyScopes.some(scope => {
        if (scope === required) return true;
        // 支持前缀匹配，如 "read:*" 匹配 "read:users"
        if (scope.endsWith(':*')) {
          const prefix = scope.slice(0, -1);
          return required.startsWith(prefix);
        }
        return false;
      });

      if (!hasScope) return false;
    }

    return true;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.keyCache.clear();
  }
}

// 预定义的 API 密钥范围
export const ApiKeyScopes = {
  // 读取权限
  READ_ALL: 'read:*',
  READ_DEVICES: 'read:devices',
  READ_SENSORS: 'read:sensors',
  READ_ALERTS: 'read:alerts',
  READ_REPORTS: 'read:reports',
  
  // 写入权限
  WRITE_ALL: 'write:*',
  WRITE_DEVICES: 'write:devices',
  WRITE_SENSORS: 'write:sensors',
  WRITE_ALERTS: 'write:alerts',
  
  // 管理权限
  ADMIN_ALL: 'admin:*',
  ADMIN_USERS: 'admin:users',
  ADMIN_SYSTEM: 'admin:system',
  
  // 特殊权限
  WEBHOOK: 'webhook',
  SERVICE: 'service',
};

// 预定义的 API 密钥类型配置
export const ApiKeyTypeConfigs: Record<ApiKeyType, {
  defaultScopes: string[];
  defaultTTL: number;
  maxTTL: number;
  rateLimit: number;
}> = {
  internal: {
    defaultScopes: ['*'],
    defaultTTL: 86400 * 365, // 1 年
    maxTTL: 86400 * 365 * 2, // 2 年
    rateLimit: 10000,
  },
  external: {
    defaultScopes: ['read:*'],
    defaultTTL: 86400 * 30, // 30 天
    maxTTL: 86400 * 90, // 90 天
    rateLimit: 1000,
  },
  service: {
    defaultScopes: ['service'],
    defaultTTL: 86400 * 7, // 7 天
    maxTTL: 86400 * 30, // 30 天
    rateLimit: 5000,
  },
  webhook: {
    defaultScopes: ['webhook'],
    defaultTTL: 86400 * 90, // 90 天
    maxTTL: 86400 * 365, // 1 年
    rateLimit: 100,
  },
};
