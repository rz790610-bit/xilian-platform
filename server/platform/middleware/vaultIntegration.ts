/**
 * HashiCorp Vault 集成 — 密钥管理服务
 * 
 * 功能：
 * - 动态密钥获取（数据库凭据、API 密钥、TLS 证书）
 * - 密钥自动轮换（TTL 到期前刷新）
 * - Transit 引擎加密/解密（敏感数据字段级加密）
 * - AppRole 认证（适用于服务间通信）
 * - 密钥缓存（减少 Vault API 调用）
 * 
 * 配置：
 *   VAULT_ADDR=http://vault:8200
 *   VAULT_TOKEN=hvs.xxx（开发模式）
 *   VAULT_ROLE_ID + VAULT_SECRET_ID（AppRole 模式）
 *   VAULT_NAMESPACE=xilian（企业版多租户）
 * 
 * 依赖：
 *   docker-compose 中的 vault 服务
 */

import http from 'http';
import https from 'https';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('vault');

// ============================================================
// 配置
// ============================================================

interface VaultConfig {
  addr: string;
  token: string | null;
  roleId: string | null;
  secretId: string | null;
  namespace: string | null;
  caCert: string | null;
  maxRetries: number;
  retryDelayMs: number;
  cacheTtlMs: number;
  renewBeforeExpiryMs: number;
}

const config: VaultConfig = {
  addr: process.env.VAULT_ADDR || 'http://localhost:8200',
  token: process.env.VAULT_TOKEN || null,
  roleId: process.env.VAULT_ROLE_ID || null,
  secretId: process.env.VAULT_SECRET_ID || null,
  namespace: process.env.VAULT_NAMESPACE || null,
  caCert: process.env.VAULT_CACERT || null,
  maxRetries: 3,
  retryDelayMs: 1000,
  cacheTtlMs: 300_000, // 5 分钟
  renewBeforeExpiryMs: 60_000, // 到期前 1 分钟刷新
};

// ============================================================
// 类型定义
// ============================================================

interface VaultResponse {
  request_id: string;
  lease_id: string;
  renewable: boolean;
  lease_duration: number;
  data: Record<string, any>;
  wrap_info: any;
  warnings: string[];
  auth: any;
}

interface CachedSecret {
  data: Record<string, any>;
  expiresAt: number;
  leaseId: string | null;
  renewable: boolean;
}

interface VaultHealth {
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

// ============================================================
// HTTP 客户端
// ============================================================

function vaultRequest(
  method: string,
  path: string,
  body?: any,
  token?: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, config.addr);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const authToken = token || config.token;
    if (authToken) {
      headers['X-Vault-Token'] = authToken;
    }
    if (config.namespace) {
      headers['X-Vault-Namespace'] = config.namespace;
    }

    const bodyStr = body ? JSON.stringify(body) : undefined;
    if (bodyStr) {
      headers['Content-Length'] = Buffer.byteLength(bodyStr).toString();
    }

    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 8200),
        path: url.pathname,
        method,
        headers,
        timeout: 10000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            if (res.statusCode && res.statusCode >= 400) {
              const errors = parsed.errors?.join(', ') || `HTTP ${res.statusCode}`;
              reject(new Error(`Vault error: ${errors}`));
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error(`Vault response parse error: ${data.slice(0, 200)}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Vault request timeout'));
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function vaultRequestWithRetry(
  method: string,
  path: string,
  body?: any,
  token?: string
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await vaultRequest(method, path, body, token);
    } catch (err: any) {
      lastError = err;
      if (attempt < config.maxRetries - 1) {
        const delay = config.retryDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

// ============================================================
// 缓存
// ============================================================

const secretCache = new Map<string, CachedSecret>();

function getCached(key: string): Record<string, any> | null {
  const cached = secretCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    secretCache.delete(key);
    return null;
  }
  return cached.data;
}

function setCache(
  key: string,
  data: Record<string, any>,
  leaseDuration: number,
  leaseId: string | null,
  renewable: boolean
): void {
  const ttl = leaseDuration > 0
    ? Math.min(leaseDuration * 1000, config.cacheTtlMs)
    : config.cacheTtlMs;

  secretCache.set(key, {
    data,
    expiresAt: Date.now() + ttl,
    leaseId,
    renewable,
  });
}

// ============================================================
// 认证
// ============================================================

let currentToken: string | null = config.token;
let tokenExpiresAt: number = 0;

/**
 * AppRole 认证 — 获取客户端 token
 */
async function authenticateAppRole(): Promise<string> {
  if (!config.roleId || !config.secretId) {
    throw new Error('VAULT_ROLE_ID and VAULT_SECRET_ID required for AppRole auth');
  }

  const response = await vaultRequestWithRetry(
    'POST',
    '/v1/auth/approle/login',
    {
      role_id: config.roleId,
      secret_id: config.secretId,
    }
  );

  const token = response.auth?.client_token;
  const leaseDuration = response.auth?.lease_duration || 3600;

  if (!token) {
    throw new Error('AppRole authentication failed: no token returned');
  }

  currentToken = token;
  tokenExpiresAt = Date.now() + (leaseDuration * 1000) - config.renewBeforeExpiryMs;
  config.token = token;

  log.info(`AppRole authenticated, token expires in ${leaseDuration}s`);
  return token;
}

/**
 * 确保有有效的 token
 */
async function ensureAuthenticated(): Promise<void> {
  if (currentToken && Date.now() < tokenExpiresAt) return;

  if (config.roleId && config.secretId) {
    await authenticateAppRole();
  } else if (!currentToken) {
    throw new Error(
      'No Vault authentication configured. ' +
      'Set VAULT_TOKEN or VAULT_ROLE_ID + VAULT_SECRET_ID'
    );
  }
}

// ============================================================
// 公开 API — 密钥操作
// ============================================================

/**
 * 从 KV v2 引擎读取密钥
 */
export async function getSecret(
  path: string,
  mount: string = 'secret'
): Promise<Record<string, any>> {
  const cacheKey = `kv:${mount}:${path}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  await ensureAuthenticated();

  const response: VaultResponse = await vaultRequestWithRetry(
    'GET',
    `/v1/${mount}/data/${path}`
  );

  const data = response.data?.data || {};
  setCache(cacheKey, data, response.lease_duration, response.lease_id, response.renewable);

  return data;
}

/**
 * 写入密钥到 KV v2 引擎
 */
export async function putSecret(
  path: string,
  data: Record<string, any>,
  mount: string = 'secret'
): Promise<void> {
  await ensureAuthenticated();

  await vaultRequestWithRetry('POST', `/v1/${mount}/data/${path}`, {
    data,
    options: { cas: 0 }, // 无条件写入
  });

  // 更新缓存
  const cacheKey = `kv:${mount}:${path}`;
  setCache(cacheKey, data, 0, null, false);

  log.info(`Secret written: ${mount}/${path}`);
}

/**
 * 删除密钥
 */
export async function deleteSecret(
  path: string,
  mount: string = 'secret'
): Promise<void> {
  await ensureAuthenticated();
  await vaultRequestWithRetry('DELETE', `/v1/${mount}/data/${path}`);
  secretCache.delete(`kv:${mount}:${path}`);
  log.info(`Secret deleted: ${mount}/${path}`);
}

/**
 * 获取动态数据库凭据
 */
export async function getDatabaseCredentials(
  role: string = 'xilian-app',
  mount: string = 'database'
): Promise<{ username: string; password: string; ttl: number }> {
  const cacheKey = `db:${mount}:${role}`;
  const cached = getCached(cacheKey);
  if (cached) return cached as any;

  await ensureAuthenticated();

  const response: VaultResponse = await vaultRequestWithRetry(
    'GET',
    `/v1/${mount}/creds/${role}`
  );

  const creds = {
    username: response.data?.username,
    password: response.data?.password,
    ttl: response.lease_duration,
  };

  setCache(cacheKey, creds, response.lease_duration, response.lease_id, response.renewable);

  log.info(`Dynamic DB credentials obtained for role '${role}', TTL=${response.lease_duration}s`);
  return creds;
}

/**
 * Transit 引擎 — 加密数据
 */
export async function encrypt(
  plaintext: string,
  keyName: string = 'xilian-data',
  mount: string = 'transit'
): Promise<string> {
  await ensureAuthenticated();

  const b64 = Buffer.from(plaintext).toString('base64');
  const response = await vaultRequestWithRetry(
    'POST',
    `/v1/${mount}/encrypt/${keyName}`,
    { plaintext: b64 }
  );

  return response.data?.ciphertext;
}

/**
 * Transit 引擎 — 解密数据
 */
export async function decrypt(
  ciphertext: string,
  keyName: string = 'xilian-data',
  mount: string = 'transit'
): Promise<string> {
  await ensureAuthenticated();

  const response = await vaultRequestWithRetry(
    'POST',
    `/v1/${mount}/decrypt/${keyName}`,
    { ciphertext }
  );

  return Buffer.from(response.data?.plaintext, 'base64').toString('utf-8');
}

/**
 * 批量加密
 */
export async function batchEncrypt(
  items: string[],
  keyName: string = 'xilian-data',
  mount: string = 'transit'
): Promise<string[]> {
  await ensureAuthenticated();

  const batchInput = items.map((item) => ({
    plaintext: Buffer.from(item).toString('base64'),
  }));

  const response = await vaultRequestWithRetry(
    'POST',
    `/v1/${mount}/encrypt/${keyName}`,
    { batch_input: batchInput }
  );

  return (response.data?.batch_results || []).map((r: any) => r.ciphertext);
}

// ============================================================
// 公开 API — 健康检查与管理
// ============================================================

/**
 * Vault 健康检查
 */
export async function healthCheck(): Promise<VaultHealth> {
  const response = await vaultRequest('GET', '/v1/sys/health');
  return response as VaultHealth;
}

/**
 * 检查 Vault 是否可用
 */
export async function isAvailable(): Promise<boolean> {
  try {
    const health = await healthCheck();
    return health.initialized && !health.sealed;
  } catch {
    return false;
  }
}

/**
 * 续租 lease
 */
export async function renewLease(leaseId: string, increment?: number): Promise<void> {
  await ensureAuthenticated();

  await vaultRequestWithRetry('POST', '/v1/sys/leases/renew', {
    lease_id: leaseId,
    increment: increment || 3600,
  });
}

/**
 * 获取缓存统计
 */
export function getCacheStats(): {
  size: number;
  keys: string[];
  expired: number;
} {
  let expired = 0;
  const now = Date.now();

  for (const [, value] of secretCache) {
    if (now > value.expiresAt) expired++;
  }

  return {
    size: secretCache.size,
    keys: Array.from(secretCache.keys()),
    expired,
  };
}

/**
 * 清除缓存
 */
export function clearCache(): void {
  secretCache.clear();
  log.info('Secret cache cleared');
}

// ============================================================
// 自动续租后台任务
// ============================================================

let renewalInterval: NodeJS.Timeout | null = null;

/**
 * 启动自动续租
 */
export function startAutoRenewal(intervalMs: number = 60_000): void {
  if (renewalInterval) return;

  renewalInterval = setInterval(async () => {
    const now = Date.now();

    // 续租 token
    if (currentToken && tokenExpiresAt > 0 && now > tokenExpiresAt - config.renewBeforeExpiryMs) {
      try {
        if (config.roleId && config.secretId) {
          await authenticateAppRole();
        } else {
          await vaultRequestWithRetry('POST', '/v1/auth/token/renew-self');
          log.info('Token renewed');
        }
      } catch (err: any) {
        log.error('Token renewal failed:', err.message);
      }
    }

    // 续租 leases
    for (const [key, cached] of secretCache) {
      if (cached.renewable && cached.leaseId && now > cached.expiresAt - config.renewBeforeExpiryMs) {
        try {
          await renewLease(cached.leaseId);
          cached.expiresAt = now + config.cacheTtlMs;
          log.info(`Lease renewed: ${key}`);
        } catch (err: any) {
          log.warn(`Lease renewal failed for ${key}:`, err.message);
          secretCache.delete(key);
        }
      }
    }
  }, intervalMs);

  log.info(`Auto-renewal started (interval: ${intervalMs}ms)`);
}

/**
 * 停止自动续租
 */
export function stopAutoRenewal(): void {
  if (renewalInterval) {
    clearInterval(renewalInterval);
    renewalInterval = null;
    log.info('Auto-renewal stopped');
  }
}

// ============================================================
// 初始化
// ============================================================

/**
 * 初始化 Vault 集成
 */
export async function initVault(): Promise<boolean> {
  try {
    const available = await isAvailable();
    if (!available) {
      log.warn('Vault is not available or sealed. Running without Vault.');
      return false;
    }

    await ensureAuthenticated();
    startAutoRenewal();

    log.info('Vault integration initialized successfully');
    return true;
  } catch (err: any) {
    log.warn(`Vault initialization failed: ${err.message}. Running without Vault.`);
    return false;
  }
}

/**
 * 关闭 Vault 集成
 */
export function shutdownVault(): void {
  stopAutoRenewal();
  clearCache();
  currentToken = null;
  log.info('Vault integration shut down');
}
